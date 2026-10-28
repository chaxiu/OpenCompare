# Domain: diff-ruler

v0.2.10 代码/文本双栏 Diff 的「指示条（ruler / overview bar）」。本域拥有两层：`src/core/text/` 下的纯几何模块（`ruler.ts` + 同名单测），把既有 `LineDiffResult` 的 `rows` / `blocks` 投影成轨道色带、轨道比例 ↔ 行号双向换算、最近差异块命中、目标行 / 滚动偏移、视口窗；以及 renderer 侧的可见组件 `src/renderer/src/components/DiffRuler.tsx` 与 `CodeView.tsx` 中 `CodeDiffView` 双栏分支的接线（内置 code 样本与目录下钻 / 拖放 / 打开得到的 `pair` 共用同一入口）。几何与命中永远以 `ruler.ts` 为唯一真相源，组件只绘制与派发选择。

## 范围

- **四态聚合**：输入 `diffLineTexts` 产出的 `rows` / `blocks`（语义不得改动）加调用方传入的轨道几何（`trackHeight`、`bandHeight`），单遍把行级 `same | added | removed | modified` 映射成有界位置色带 `band`：每条含 `status`、覆盖的 `startRow` / `endRow`（对齐行下标，含端点）与轨道上的 `top` / `height`。`same` 不产出色带。
- **双向换算**：轨道比例 ↔ 行号（0-based 对齐行下标）、行号 ↔ 轨道比例（往返稳定）、行号 ↔ 行下标外推的滚动偏移（`rowHeight` 由调用方传入）。
- **差异块命中**：给定行号或比例求最近差异块索引；点击落点 → 最近差异块 → 目标行（`block.startRow`）与目标 `scrollTop`。
- **视口窗**：由 `scrollTop` / 视口高度 / 行高 / 行数 / 轨道高度算出视口窗在轨道上的 `top` / `height`，含两端钳制。
- **算法落位与测试**：以上能力全部为 `src/core/text/ruler.ts` 纯函数，`src/core/text/ruler.test.ts` 用纯 vitest（无 DOM）在 Node 直接单测；358k 行大模型用循环构造的最小 `DiffRow` 形状生成，不调用 `diffLineTexts`。
- **指示条组件**：`src/renderer/src/components/DiffRuler.tsx` 消费 `@core/text/ruler` 现有导出，绘制常驻轨道、四态色带（`same` / `conflict` 不画）、当前差异块描边与随滚动同步的视口窗；整条可聚焦并支持 `ArrowUp` / `ArrowDown` / `Enter`，点选标记派发差异块索引。组件不重新 diff、不遍历行文本、不新增平台调用。稳定锚点：轨道 `data-diff-ruler`，标记 `data-diff-status` / `data-start-row` / `data-end-row`，视口窗 `data-window-top` / `data-window-height`。
- **双栏接线**：`CodeView.tsx` 的 `CodeDiffView` 把指示条作为 `SplitPane` 外侧兄弟节点渲染，内置样本与下钻 `pair` 共用；点选 / 键盘只改现有 `active` 块索引（+ jump 令牌保证重复选择仍重新定位），两栏 `scrollTop` 一起对齐到 `startRow * DIFF_ROW_HEIGHT`，工具栏计数与 `DiffBadge` 自然同步；三栏 merge 不渲染指示条；覆写 / 重置 / 打开文件在同一提交内重投影。文案进 `files.code.ruler.*`（zh / en）。

## 验收

- **ac-ruler-aggregation**：给定 `rows` 与足够大的轨道（桶数 ≥ 行数）时，色带与行级状态逐行一致：每条色带的行区间恰好是一段极大同态连续行（相邻同态合并为一条、不重不漏），`same` 行不产生色带，同一差异块内 `added` 与 `removed` 混合时分别产出各自状态的色带而不被压成块级汇总状态；低分辨率（桶数 < 行数）下不变量仍成立：每个非 `same` 行 r 都存在一条 `status === rows[r].status` 且 `startRow <= r <= endRow` 的色带（允许不同状态色带的行区间交叠），且色带按 `startRow` 升序、同 `startRow` 时按固定状态序 `added < removed < modified` 排列。
- **ac-ruler-jump**：比例 → 行号换算满足 `clamp(floor(ratio * rowCount), 0, rowCount - 1)`（`ratio` 先钳制到 [0,1]，`ratio = 1` 落到最后一行，`NaN` 视为 0，`rowCount = 0` 返回 -1）；反向换算保证对每个 `0 <= row < rowCount` 有 `比例→行号(行号→比例(row)) === row`；最近差异块命中在行落入块区间内时返回该块，否则按到区间的最小行距返回最近块，等距取索引更小者，`blocks` 为空返回 -1；目标行为命中块的 `startRow`，目标滚动偏移恰为 `startRow * rowHeight`（`rowHeight` 由入参传入，不从 renderer 导入）。
- **ac-ruler-window**：视口窗计算满足：`rowCount <= 0` 或 `viewportHeight <= 0` 时返回 `{ top: 0, height: 0 }`；`height = trackHeight * min(viewportHeight, rowCount * rowHeight) / (rowCount * rowHeight)`；`top = trackHeight * clamp(scrollTop, 0, rowCount * rowHeight - visibleHeight) / (rowCount * rowHeight)`；对任意输入 `top >= 0`、`height >= 0`、`top + height <= trackHeight`（含 1e-6 容差），视口大于全文时恰为 `{ top: 0, height: trackHeight }`。
- **ac-ruler-scale**：对 358000 行合成模型单次调用只做一遍行遍历（不得二次 `for` / `map` / `filter` 全量行数组，可用计数代理或无副作用读次数断言），输出色带数受几何参数约束：`bands.length <= bucketCount * 3` 且 `bands.length <= 非 same 极大连续段数`，其中 `bucketCount = clamp(floor(trackHeight / bandHeight), 1, rowCount)`；极端逐行交替四态输入下输出规模仍为两倍位数级（远小于行数，断言 `bands.length < rowCount / 100`），不随行数线性增长。
- **ac-ruler-regression**：边界全部用例化：空 diff（`rows` / `blocks` 皆空）返回零色带、视口窗零尺寸且不抛错；全相同（`blocks` 空）返回零色带但视口窗仍按行数正常计算；仅左删只有 `removed` 色带、仅右增只有 `added` 色带，且位置对应真实行下标；单行 diff 不越界；无尾换行与带尾换行输入在行数与色带行区间上一致；CRLF 与 LF 输入经 `diffLineTexts` 后行数一致、色带行区间一致；新增测试文件在 `pnpm test` 下全绿且 `pnpm lint` / `pnpm typecheck` 不报错。
- **ac-ruler-immutability**：输入 `rows` / `blocks` 及其数组不被改写（断言调用前后深相等，且对冻结输入不抛错）；输出色带与视口窗对象不含任何行文本、行内 segment 或行对象引用（断言不读取 `leftText` / `rightText` / `leftSegments` / `rightSegments`——用会抛错的代理行对象传入，调用必须成功；断言输出序列化后不含样本行文本）。
- **ac-ruler-purity**：模块零 DOM / 零 Electron / 零新依赖：只依赖本地类型与纯函数，不 import `electron`、`react`、`@renderer/*`，不 import `diff` / `node-diff3`（不重新 diff），不调用 `PlatformPort`、`fs`、IPC；全部函数可用手工构造的 `rows` / `blocks` 直接调用，与 `diffLineTexts` 无耦合。

### UI 接线（`DiffRuler` + `CodeView`，同一 AC id 在 UI 层复核）

- **ac-ruler-persistent**：内置样本 diff 模式与 `pair` 下钻模式渲染后都立即存在指示条，且它不在 `SplitPane` 分隔节点序列里（`role="separator"` 数量仍为 1，指示条不是 pane）；切到 merge 模式不渲染；覆写 / 重置 / 打开文件后仍在。
- **ac-ruler-aggregation**：标记集合与行级状态逐行一致——每个非 `same` 行都被某条同状态标记覆盖（`data-start-row <= 行 <= data-end-row`），`same` 不产生标记；同一块内混合状态（如 modified + added）分别按真实行级状态着色，不压成块级汇总；标记按 `data-start-row` 升序；足够轨道高度时每条标记恰为极大同态连续段。
- **ac-ruler-window**：视口窗由 `scrollTop` / 视口高 / 行高 / 轨道高算出并两端钳制（`top >= 0`、`height >= 0`、`top + height <= 轨道高`）；滚动任一栏后视口窗跟随、两栏 `scrollTop` 仍相等；滚动不改变标记数量与行区间。
- **ac-ruler-jump**：点击标记后两栏 `scrollTop` 均为该块 `startRow * 20` 且相等，工具栏计数与 `DiffBadge` 同步，块内行显示 `border-accent`；连续点选可连续跳转，重复点击已激活标记仍重新定位。
- **ac-ruler-keyboard**：指示条可 Tab 聚焦并显示 focus ring，`aria-label` 随 zh / en 词典变化；`ArrowUp` / `ArrowDown` 按 `blocks` 顺序循环并完成双栏定位，`Enter` 重新定位当前块；标记可访问名称包含状态与行区间。
- **ac-ruler-regression**：空 diff / 全相同仍常驻（零标记，全相同时视口窗仍随滚动移动）；仅左删只有 removed、仅右增只有 added 且位置对应真实行；单行 / 无尾换行 / CRLF 不越界；行内字符高亮、覆写 / 重置 / 保存与 `SplitPane` 交互保持原状；滚动与点选不新增 `diffLineTexts` 调用与 `PlatformPort` 调用；zh / en 无硬编码中文残留。

## 非目标

- 不改 `src/core/text/ruler.ts` 的既有导出语义；不改 `diffLineTexts`、`DiffRow` / `DiffBlock` / `DiffStatus` 类型、`INLINE_CHAR_LIMIT`、字符级 segment、`merge`、`overwriteBlock`。
- 不改 `DiffPane.tsx` 的渲染路径与 props（行渲染、filler 行、`inlineSegments`、`DIFF_ROW_HEIGHT`）；不改 `SplitPane.tsx` 的拖拽 / 键盘 / 比例逻辑；三栏 merge 视图不加指示条；目录树 / CSV / 结构化视图不改。
- 不做文本缩略图 / minimap、不做行号列表、不做逐行文本或语法高亮绘制。
- 不新增 vitest 配置、不新增依赖、不改 `code-gates.json`、不跑 `perf:gate` / `self_test`、不做真实 358k 对照对实机观察（product-qa 承接）。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。
- 不做视口窗拖动 / 手势优先级、不新增全局快捷键、不新增 IPC / 平台通道。

## 实现约束

- 位置与几何一律用调用方传入的参数（`trackHeight`、`bandHeight`、`rowHeight`）计算，`ruler.ts` 内不出现 `DIFF_ROW_HEIGHT`、像素常量或对 renderer 的 `@renderer/*` 引用；`src/core/` 的 `no-restricted-imports` 硬约束保持不变。renderer 侧 `DiffRuler` 经 `clientHeight` 度量轨道 / 视口并把 `DIFF_ROW_HEIGHT` 传给几何层，不复制比例换算、最近块命中或视口窗公式。
- 单遍实现：一次遍历 `rows` 累积到 `bucketCount` 大小的桶数组（每桶最多 3 个状态槽），再从桶数组生成色带；内存 O(bucketCount)，不建行长度的中间数组，不对 `rows` 做 `filter` / `map` / `slice` / 展开。
- 只读 `DiffRow` 的 `status` 与行下标字段；不读文本与 segment 字段。
- 返回值为普通不可变（`readonly`）轻量对象；不缓存全量输入，不持有 `rows` / `blocks` 引用之外的可变状态，函数无副作用且幂等。
- 测试放在 `src/core/text/` 按现有 `*.test.ts` 风格（`describe` / `it`，纯 vitest，无 DOM），大模型用循环生成本地构造的最小 `DiffRow` 形状。UI 接线测试用 `src/renderer/src/views/CodeView.ruler.test.tsx`（jsdom + `@testing-library/react`），stub `clientHeight` 后直接赋值 `scrollTop` 并 `fireEvent.scroll`。
- 导出名一旦落地即视为本集契约：至少导出聚合函数（`buildRulerBands`）、比例↔行号双向换算（`ratioToRow` / `rowToRatio` / `scrollOffsetForRow`）、最近差异块命中（`nearestBlockIndex` / `nearestBlockIndexAtRatio`）、目标行 / 滚动偏移（`resolveJumpTarget` / `resolveJumpTargetAtRatio`）、视口窗计算（`computeViewportWindow`）这五组能力。

## 最近交付证明

- WI：`wi_ws_5ff22a3e4f1f53cc`（双栏 diff 常驻指示条与跳转接线，`kind: feature`）
- 日期：2026-10-28
- 结果：self_test skipped（纯前端接线，改由 code_gates 关点：9 条门禁 attempt 001 全部 passed，含 `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `test:cancel` / `test:memory`）。
- 覆盖摘要：新增 `src/renderer/src/components/DiffRuler.tsx`（185 行）——只消费 `@core/text/ruler` 现有导出绘制常驻轨道、`same` / `conflict` 之外的色带、当前块描边与随滚动同步的视口窗，整条可聚焦并支持 `ArrowUp` / `ArrowDown` / `Enter`，点选派发差异块索引；不重新 diff、不遍历行文本、不新增平台调用。`CodeView.tsx` 的 `CodeDiffView` 把指示条作为 `SplitPane` 外侧兄弟节点接线，内置 code 样本与下钻 / 拖放 / 打开得到的 `pair` 共用同一入口；点选与键盘只改现有 `active` 块索引，新增 `jumpToken` 令牌让重复选择同一块仍重新定位，两栏 `scrollTop` 一起对齐到 `startRow * DIFF_ROW_HEIGHT`，工具栏计数与 `DiffBadge` 自然同步；三栏 merge 不渲染。文案补 `files.code.ruler.*`（zh / en）并纳入 `filesScan.test.ts` 扫描清单。新增 `src/renderer/src/views/CodeView.ruler.test.tsx`（492 行 / 11 例，jsdom + `@testing-library/react`），钉住常驻性、逐行状态聚合、视口窗钳制与滚动同步、点选 / 键盘跳转、空态与边界回归。
- 注：本 WI change pack 只提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），折叠用例按 prd 要求落在本域 `qa/`（3 个，覆盖 ac-ruler-persistent / jump / window / keyboard / aggregation / regression）。前一 WI `wi_ws_1eb4a496b8d3bb35` 交付的几何层 `src/core/text/ruler.ts` 语义未改，`DiffPane` / `SplitPane` / `diffLineTexts` / merge 路径零改动。
