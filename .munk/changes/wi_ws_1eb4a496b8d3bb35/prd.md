# 指示条四态聚合与跳转纯函数

## 范围

本工作项只交付 `src/core/text/` 下的**纯投影 / 几何模块**及其 vitest 单测（建议单文件 + 同名单测，例如 `ruler.ts` / `ruler.test.ts`，文件名可自定）。它是 v0.2.10 指示条全部几何与命中逻辑的唯一真相源，后续组件与接线工作项只消费它的输出。

落地内容：

1. **四态聚合**：输入现有 `LineDiffResult` 的 `rows` / `blocks`（`src/core/text/diff.ts` 已产出，不得改动其语义）加指示条几何参数，单遍把行级 `same | added | removed | modified` 映射成有界的位置色带（`band`）：每条含 `status`、覆盖的 `startRow` / `endRow`（对齐行下标，含端点）与轨道上的 `top` / `height` 位置。`same` 不产出色带。
2. **双向换算**：轨道比例 ↔ 行号（0-based 对齐行下标）、行号 ↔ 轨道比例（往返稳定）、行号 ↔ 行下标外推的滚动偏移。
3. **差异块命中**：给定行号（或比例）求最近差异块索引；点击落点 → 最近差异块 → 目标行（`block.startRow`）与目标 `scrollTop`。
4. **视口窗**：由 `scrollTop` / 视口高度 / 行高 / 行数 / 轨道高度算出视口窗在轨道上的 `top` / `height`，含两端钳制。

本项不改 `diffLineTexts` / `buildBlocks` / `merge` / `overwriteBlock` 任何行为，不新增 React 组件、不接 `CodeView`、不动 `DiffPane`、不加 i18n 文案与视觉 token。

## 验收

- ac-ruler-aggregation: 给定 `rows` 与足够大的轨道（桶数 ≥ 行数）时，色带与行级状态逐行一致：每条色带的行区间恰好是一段极大同态连续行（相邻同态合并为一条、不重不漏），`same` 行不产生色带，同一差异块内 `added` 与 `removed` 混合时分别产出各自状态的色带而不被压成块级汇总状态；低分辨率（桶数 < 行数）下不变量仍成立：每个非 `same` 行 r 都存在一条 `status === rows[r].status` 且 `startRow <= r <= endRow` 的色带（允许不同状态色带的行区间交叠），且色带按 `startRow` 升序、同 `startRow` 时按固定状态序 `added < removed < modified` 排列。
- ac-ruler-jump: 比例 → 行号换算满足 `clamp(floor(ratio * rowCount), 0, rowCount - 1)`（`ratio` 先钳制到 [0,1]，`ratio = 1` 落到最后一行，`NaN` 视为 0，`rowCount = 0` 返回 -1）；反向换算保证对每个 `0 <= row < rowCount` 有 `比例→行号(行号→比例(row)) === row`；最近差异块命中在行落入块区间内时返回该块，否则按到区间的最小行距返回最近块，等距取索引更小者，`blocks` 为空返回 -1；目标行为命中块的 `startRow`，目标滚动偏移恰为 `startRow * rowHeight`（`rowHeight` 由入参传入，不从 renderer 导入）。
- ac-ruler-window: 视口窗计算满足：`rowCount <= 0` 或 `viewportHeight <= 0` 时返回 `{ top: 0, height: 0 }`；`height = trackHeight * min(viewportHeight, rowCount * rowHeight) / (rowCount * rowHeight)`；`top = trackHeight * clamp(scrollTop, 0, rowCount * rowHeight - visibleHeight) / (rowCount * rowHeight)`；对任意输入 `top >= 0`、`height >= 0`、`top + height <= trackHeight`（含 1e-6 容差），视口大于全文时恰为 `{ top: 0, height: trackHeight }`。
- ac-ruler-scale: 对 358000 行合成模型单次调用只做一遍行遍历（不得二次 `for` / `map` / `filter` 全量行数组，可用计数代理或无副作用读次数断言），输出色带数受几何参数约束：`bands.length <= bucketCount * 3` 且 `bands.length <= 非 same 极大连续段数`，其中 `bucketCount = clamp(floor(trackHeight / bandHeight), 1, rowCount)`；极端逐行交替四态输入下输出规模仍为两倍位数级（远小于行数，断言 `bands.length < rowCount / 100`），不随行数线性增长。
- ac-ruler-regression: 边界全部用例化：空 diff（`rows` / `blocks` 皆空）返回零色带、视口窗零尺寸且不抛错；全相同（`blocks` 空）返回零色带但视口窗仍按行数正常计算；仅左删只有 `removed` 色带、仅右增只有 `added` 色带，且位置对应真实行下标；单行 diff 不越界；无尾换行与带尾换行输入在行数与色带行区间上一致；CRLF 与 LF 输入经 `diffLineTexts` 后行数一致、色带行区间一致；新增测试文件在 `pnpm test` 下全绿且 `pnpm lint` / `pnpm typecheck` 不报错。
- ac-ruler-immutability: 输入 `rows` / `blocks` 及其数组不被改写（断言调用前后深相等，且对冻结输入不抛错）；输出色带与视口窗对象不含任何行文本、行内 segment 或行对象引用（断言不读取 `leftText` / `rightText` / `leftSegments` / `rightSegments`——用会抛错的代理行对象传入，调用必须成功；断言输出序列化后不含样本行文本）。
- ac-ruler-purity: 模块零 DOM / 零 Electron / 零新依赖：只依赖本地类型与纯函数，不 import `electron`、`react`、`@renderer/*`，不 import `diff` / `node-diff3`（不重新 diff），不调用 `PlatformPort`、`fs`、IPC；全部函数可用手工构造的 `rows` / `blocks` 直接调用，与 `diffLineTexts` 无耦合。

## 非目标

- 不做指示条组件、不写 JSX / CSS / Tailwind 类 / `--color-diff-*` 引用、不做 canvas 或 SVG 渲染。本项只出数据与几何。
- 不接 `CodeView.tsx` / `DiffPane.tsx`，不改上一 / 下一差异块按钮、`active` 状态、同步滚动、键盘与 aria 文案（全部留给后续接线工作项）。
- 不改 `diffLineTexts`、`DiffRow` / `DiffBlock` / `DiffStatus` 类型、`INLINE_CHAR_LIMIT`、字符级 segment、`merge`、`overwriteBlock`。
- 不做文本缩略图 / minimap、不做行号列表、不做逐行文本或语法高亮绘制。
- 不新增 vitest 配置、不新增依赖、不改 `code-gates.json`、不跑 `perf:gate` / `self_test`、不做真实 358k 对照对实机观察（product-qa 承接）。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。
- 不做视口窗拖动 / 手势优先级、不新增全局快捷键、不改 i18n 词典。

## 实现约束

- 位置与几何一律用调用方传入的参数（`trackHeight`、`bandHeight`、`rowHeight`）计算，模块内不出现 `DIFF_ROW_HEIGHT`、像素常量或对 renderer 的 `@renderer/*` 引用；`src/core/` 的 `no-restricted-imports` 硬约束保持不变。
- 单遍实现：一次遍历 `rows` 累积到 `bucketCount` 大小的桶数组（每桶最多 3 个状态槽），再从桶数组生成色带；内存 O(bucketCount)，不建行长度的中间数组，不对 `rows` 做 `filter` / `map` / `slice` / 展开。
- 只读 `DiffRow` 的 `status` 与行下标字段；不读文本与 segment 字段。
- 返回值为普通不可变（`readonly`）轻量对象；不缓存全量输入，不持有 `rows` / `blocks` 引用之外的可变状态，函数无副作用且幂等。
- 测试放在 `src/core/text/` 按现有 `*.test.ts` 风格（`describe` / `it`，纯 vitest，无 DOM），大模型用循环生成本地构造的最小 `DiffRow` 形状（不要用 `diffLineTexts` 造 358k 行，避免测试时长）。
- 后续两个工作项会依赖本模块导出，导出名一旦落地即视为本集契约：至少导出聚合函数、比例↔行号双向换算、最近差异块命中、目标行 / 滚动偏移、视口窗计算这五组能力。
