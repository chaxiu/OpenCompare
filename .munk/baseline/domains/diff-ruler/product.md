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
- **规模护栏与证据锚点**：指示条的 358k 行规模上限、大模型边界、3 tab / 下钻会话回归链路与 `data-*` / `aria-*` 证据入口契约全部由 `src/renderer/src/components/DiffRuler.scale.test.tsx` 与 `src/renderer/src/App.ruler.test.tsx`（jsdom）在 `pnpm test` 内钉住；护栏只观察「投影次数 / 标记节点数 / 平台 IO 计数」等可计数事实，不在生产代码里加计数器、测试钩子或改 props 契约。

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

### 规模护栏与证据入口契约（自动化测试层，进 `pnpm test`）

本域同时拥有指示条的「规模 / 会话回归 / 证据锚点」护栏，落点是测试文件（`DiffRuler.scale.test.tsx`、`App.ruler.test.tsx`），不改生产绘制与几何语义。358k 模型一律直接构造轻量 `DiffRow` / `DiffBlock` 形状（可复用共享行常量），严禁对 358k 行文本调用 `diffLineTexts` / `splitLines`。

- **ac-scale-single-pass**：以直接构造的 358k 行 `DiffRow[]`（配 `DiffBlock[]`）渲染指示条后，`buildRulerBands` 在同一 `trackHeight` 下只被调用 1 次，且其收到的行数组与传入数组严格同一引用（`toBe` 相等），证明行模型未被复制或浅拷贝。
- **ac-scale-marker-bound**：358k 行 `added/removed/modified/same` 逐行交替模型在 trackHeight=800、bandHeight=4 下，标记节点数 ≤ `3 * floor(trackHeight / bandHeight)`（即 600）且 < `rowCount / 100`（即 3580）；每个标记 `top >= 0`、`height >= 0`、`top + height <= trackHeight`；指示条子树 `textContent` 去空白后为空（无逐行文本）。
- **ac-scale-row-coverage**：同一 358k 模型下，每个非 `same` 行都存在 `data-diff-status === rows[i].status` 且 `data-start-row <= i <= data-end-row` 的标记；该校验以行与已排序标记同步推进的单遍扫描实现，不出现 O(rows × markers) 的双层循环。
- **ac-scale-no-reproject**：渲染后执行「两栏各滚动 3 次 + 点选标记 3 次 + 一次轨道高度变化（stub `ResizeObserver` 回调把 trackHeight 由 800 改为 640）」后，`buildRulerBands` 累计调用次数 ≤ 2（首绘 1 次 + 尺寸变化 1 次），`diffLineTexts` 调用增量为 0。
- **ac-scale-zero-io**：上述滚动 / 点选 / 尺寸变化全程，platform 的 `readTextFile` / `selectFile` / `selectDirectory` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath` 调用计数增量全部为 0。
- **ac-scale-large-edges**：358k 规模下的空（0 行）、全相同、仅左删、仅右增、超长单行（单行长度达到 `INLINE_CHAR_LIMIT` 量级）五个模型各自：不抛错、标记数满足 ac-scale-marker-bound 的上界；空与全相同的标记数为 0 且指示条仍挂载、视口窗 `top >= 0`、`top + height <= trackHeight`；仅左删只产出 `removed` 标记、仅右增只产出 `added` 标记。
- **ac-tabs-switch-no-io**：同时驻留 3 个会话 tab（其中至少 2 个是带指示条的双栏 diff 会话），在 3 个 tab 间各切换 2 轮后，platform 的 `readTextFile` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath` 调用计数增量全部为 0，且界面不出现扫描 / 摘要重建进度提示。
- **ac-tabs-ruler-isolation**：两个不同文件对的 diff tab 各自标记区间（`data-diff-status` + `data-start-row` + `data-end-row` 序列）互不相同；来回切换后每个 tab 的标记区间序列与各自首次渲染时逐项相同；激活目录 tab 时 DOM 中不存在 `[data-diff-ruler]`，切回 code tab 后指示条重新出现。
- **ac-drilldown-roundtrip**：目录会话下钻文件对后，DOM 中存在且仅存在 1 个 `[data-diff-ruler]` 且标记数 ≥ 1；点击其中一个标记后两栏 `scrollTop` 相等且等于目标块 `startRow * 20`；点击「返回上级目录视图」后指示条从 DOM 移除、目录树行标题与当前筛选 / 折叠状态与下钻前一致、platform 读取 / 扫描 / 哈希计数增量为 0；再次下钻同一文件对，标记区间序列与首次逐项相同。
- **ac-evidence-anchors**：证据入口契约稳定：轨道节点 `data-diff-ruler="true"`、`role="listbox"`、`aria-label` 为 zh `差异指示条` / en `Difference ruler`；每个标记 `role="option"`、`data-diff-status` ∈ {added, removed, modified}、`data-start-row` / `data-end-row` 为数字且 `start <= end`、`aria-label` 匹配 zh `^(新增|删除|修改) · 第 \d+–\d+ 行$` 与 en `^(Added|Removed|Modified) · lines \d+–\d+$`；视口窗元素带可解析为数字的 `data-window-top` / `data-window-height`。这些 `data-*` / `aria-*` 即 product-qa 实机核对的选取器契约，不得重命名。
- **ac-scope-bounded**：变更路径只含测试文件（如确有缺口，`DiffRuler.tsx` 仅允许新增纯附加的 `data-*` / `aria-*` 属性）；`src/core/text/ruler.ts`、`src/core/text/diff.ts`、`DiffPane.tsx`、`SplitPane.tsx`、`CodeView.tsx`、`TreeView.tsx`、`CsvView.tsx`、`.munk/code-gates.json`、`.munk/code-gates.perf.json` 零 diff；不新增 `test:*` 脚本、不改 vitest 配置。

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
- 规模护栏的调用次数计数一律用透传 spy（`vi.mock('@core/text/ruler')` / `vi.mock('@core/text/diff')` 包 `vi.fn(actual)`），不在生产代码里加计数器、导出测试钩子或改 props 契约；jsdom 无 `ResizeObserver`，用 stub 主动回调模拟轨道高度变化，断言口径是「≤1 次重投影 + 零 IO」而非「永不重投影」。358k 规模的渲染断言只针对 `DiffRuler`（`DiffPane` 逐行 `map` 无法承载 358k 行），直接渲染时自备两个滚动容器 ref 驱动滚动断言；3 tab / 下钻链路沿用 `App.test.tsx` 的 `Workbench` + 计数 `PlatformPort` 基建，tab 切换因 `key={session.id}` 重挂载后由内存 buffer 重新 `diffLineTexts` 属既有行为，只钉「零平台 IO」。
- 导出名一旦落地即视为本集契约：至少导出聚合函数（`buildRulerBands`）、比例↔行号双向换算（`ratioToRow` / `rowToRatio` / `scrollOffsetForRow`）、最近差异块命中（`nearestBlockIndex` / `nearestBlockIndexAtRatio`）、目标行 / 滚动偏移（`resolveJumpTarget` / `resolveJumpTargetAtRatio`）、视口窗计算（`computeViewportWindow`）这五组能力。

## 最近交付证明

- WI：`wi_ws_fb9ff1e1053ef505`（指示条规模护栏与 3 tab / 下钻回归证据，`kind: test`）
- 日期：2026-10-28
- 结果：self_test skipped（只加测试文件，改由 code_gates 关点：9 条门禁 attempt 001 全部 passed，含 `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `test:cancel` / `test:memory`）。
- 覆盖摘要：新增 `src/renderer/src/components/DiffRuler.scale.test.tsx`（566 行 / 8 例，jsdom）——透传 spy 计数 `buildRulerBands` / `diffLineTexts`，直接构造 358k 行 `DiffRow[]`（复用 4 个共享行常量，不经 `diffLineTexts`）与每 1000 行细分的 `DiffBlock[]`，钉住单次投影 + 行数组严格同一引用、标记数 ≤ 600 且 < 3580、逐行覆盖用单遍游标校验、滚动 / 点选 / stub `ResizeObserver` 改高后投影 ≤ 2 且零再 diff、七个平台通道零增量（含经 `CodeView` 的接线路径）、空 / 全相同 / 单侧 / 超长单行边界、zh / en 轨道与标记 `data-*` / `aria-*` 锚点。新增 `src/renderer/src/App.ruler.test.tsx`（324 行 / 3 例，jsdom）——`Workbench` + 计数 `PlatformPort` 下打开 2 个双栏 diff tab + 1 个目录会话：3 tab 各切 2 轮零平台 IO 且无进度提示；两个 diff tab 标记区间互不相同、来回切换逐项稳定、目录 tab 无 `[data-diff-ruler]`；目录下钻后单指示条 + 点选两栏 `scrollTop === startRow * 20`、返回上级目录后指示条消失且树标题 / 仅差异筛选 / 折叠 / 滚动位置不变、零 IO、再次下钻标记区间逐项相同。
- 注：本 WI change pack 只提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），折叠用例按 prd 要求落本域 `qa/`（4 个，覆盖 ac-scale-* / ac-tabs-* / ac-drilldown-roundtrip / ac-evidence-anchors）。生产代码零改动（`ruler.ts` / `DiffRuler.tsx` / `CodeView.tsx` / `DiffPane.tsx` / `SplitPane.tsx` / `diffLineTexts` / merge 全零 diff），`ac-scope-bounded` 成立。
- 上一交付：`wi_ws_5ff22a3e4f1f53cc`（`DiffRuler.tsx` 常驻指示条 + `CodeView` 接线，`CodeView.ruler.test.tsx` 11 例）；几何层 `wi_ws_1eb4a496b8d3bb35`（`src/core/text/ruler.ts`）语义至今未变。
