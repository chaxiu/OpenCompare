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
- **轨道级命中（350k 回归）**：整条轨道即命中面，`DiffRuler.tsx` 在 track 元素上挂 click，把 `clientY - rect.top` 除以轨道高（矩形高为 0 时退回已实测的 `clientHeight`，两者皆 ≤ 0 或 `rows.length === 0` 直接返回）夹到 `[0,1)` 得到比例，再交 `@core/text/ruler` 的 `resolveJumpTargetAtRatio` 解析最近差异块并 `onSelectBlock(blockIndex)`；组件内只做「像素 → 比例」这一步，不另写块距离算法。marker 保留自身精确选中（`nearestBlockIndex(blocks, marker.dataset.startRow)`）并 `stopPropagation`，两条路径各只派发一次选择。marker 渲染高度设 2px 可点下限（组件内常量 `RULER_MARKER_MIN_HEIGHT`，与 `RULER_BAND_HEIGHT` 同处，不进 `@core`）并在 track 内夹取，`data-start-row` / `data-end-row` / `data-diff-status` 不因视觉下限改变。`CodeView` 在 `selectBlock` / `step` / `jumpActive` 里于 `setActive` 之前把两栏 `scrollTop` 直接写为 `block.startRow × DIFF_ROW_HEIGHT`，让窗口化面板靠元素真实 `scrollTop` 折回窗口、不依赖 scroll 事件。稳定锚点（`data-diff-ruler` / `data-diff-status` / `data-start-row` / `data-end-row` / `role` / `aria-*`）与 `data-diff-window-start` / `data-diff-content-height` 全部沿用，不新增交互通道。

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

### 轨道级命中（350k 回归，`DiffRuler` track click + `CodeView` 跳转接线）

本组 AC 来自 product-qa L3 场次 `trun_d63c3971b06ccfca` 的真实 fail #1：350k 行、track 608px、bandHeight 4 时多数 marker 高约 0.0017px，点击只挂在 marker 上 → 中部空白点击 NO-OP。口径是把命中面从「marker 元素」提升到「track 元素」，marker 精度与既有键盘 / ARIA 语义不变。

- **ac-track-click-hit**：350,000 行、`trackHeight=608`、`bandHeight=4`（jsdom 桩 `clientHeight` 与 `getBoundingClientRect`）下，在 track 元素上以 `clientY = rect.top + 304` 触发 click 后，被选中的块索引严格等于 `resolveJumpTargetAtRatio(blocks, 304 / 608, 350000, 20).blockIndex`，工具栏计数显示 `index+1/total`。
- **ac-track-click-top-end**：同一渲染下再以 `clientY = rect.top` 与 `clientY = rect.top + 607` 点击 track，各自选中块严格等于 `resolveJumpTargetAtRatio` 在比例 `0` 与 `607 / 608` 的返回值；顶部、中部、末端得到的块索引按行序单调不减，且至少有两个不同索引。
- **ac-track-no-dead-zone**：在 `[rect.top, rect.top + 608)` 内均匀取至少 20 个 `clientY`（含落在 marker 渲染高度之外、落在高 < 1px 桶上的位置）逐一点击 track，每次 `onSelectBlock` 都收到 `resolveJumpTargetAtRatio` 同比例解析出的非负索引（无 NO-OP、无 `-1`）；350k 下其中至少 10 次点击选中的块与点击前不同，证明命中不再依赖 marker 元素。
- **ac-scroll-both-panes**：上述每次命中后，左右两栏 `scrollTop` 严格相等且严格等于该块 `startRow × 20`。
- **ac-marker-click-precedence**：点击某个 marker 元素时，选中的是该 marker 覆盖的块（`nearestBlockIndex(blocks, marker.dataset.startRow)`），且 `onSelectBlock` 只被调用一次（不因 track 级监听二次触发）。
- **ac-zero-blocks-click**：0 个差异块（两侧文本相同、或两侧都为空）时，点击 track 任意 y 不抛异常，两栏 `scrollTop` 保持点击前的值不变，计数仍为 `0/0`，指示条与视口窗仍在 DOM 中。
- **ac-ratio-pure-boundaries**：纯函数单测覆盖并全绿：①桶高 < 1px（350k 行 / 608 / 4 下抽样含首、中、末 band，band 中点比例经 `nearestBlockIndexAtRatio` 得到含该 band `startRow` 的块）；②相邻同状态合并（`trackHeight = rowCount`、`bandHeight = 1` 时连续同状态行产出一条 band，band 跨度内任意比例解析到同一块）；③首末桶（比例 0 → 含第 0 行 / 最近块，比例 1 → 含最后一行 / 最近块，`ratioToRow(1, n) = n-1`，`ratioToRow(-1|NaN, n) = 0`，`ratioToRow(r, 0) = -1`）；④任意比例（0→1 抽样递增时块索引非递减且恒在 `[-1, blocks.length)` 内）；⑤0 块（三个函数分别返回 `-1` / `{blockIndex:-1,startRow:-1,scrollTop:0}`，且 `buildRulerBands([], …)` 为 `[]`）。
- **ac-marker-min-height-clamped**：350k / 608 / 4 下每个 marker 的渲染高度 ≥ 组件内可点下限常量（≥ 2px）、`top >= 0`、`top + height <= 608 + 1e-6`（下限不得把 marker 顶出 track），且 `data-start-row` / `data-end-row` / `data-diff-status` 与投影结果逐条一致（band 语义不因视觉下限改变）。
- **ac-window-follows-click-without-scroll-event**：350k 下点击 track 命中远距离块后，不派发任何 `scroll` 事件，两栏 `[data-diff-row]` 窗口的首行索引（`data-diff-window-start`）等于块 `startRow`，且该行元素存在并显示对应侧文本；即程序化写 `scrollTop` 后窗口靠元素真实 `scrollTop` 折回，不依赖 scroll 事件。
- **ac-350k-dom-bounded**：同一 350k 渲染中，每栏 `[data-diff-row]` 数量 ≤ `ceil(视口高度 / 20) + 2 × overscan` 且两栏相等；两栏内容总高均为 `350000 × 20 = 7,000,000`（`data-diff-content-height`，并用两栏相等断言）；指示条内 `[data-diff-row]` 为 0 个。
- **ac-projection-once-no-per-row**：350k 下 `buildRulerBands` 在每次实测 track 高度只被调用一次，点击 / 滚动后不再新增调用；marker 数 ≤ `3 × floor(608 / 4)`，指示条的 `textContent` 为空（无逐行文本）。
- **ac-keyboard-and-aria-preserved**：track 仍有 `role="listbox"`、`tabIndex=0`、zh `aria-label="差异指示条"` / en `"Difference ruler"`；marker 仍 `role="option"` 且 `aria-label` 匹配 `(新增|删除|修改) · 第 n–m 行` / `(Added|Removed|Modified) · lines n–m`；`activeBlock` 覆盖的 marker `aria-selected="true"` 其余为 `false`；ArrowDown / ArrowUp 环绕步进、Enter 与 Space 重新定位当前块的既有断言仍全绿。
- **ac-existing-tests-untouched**：`src/core/text/ruler.test.ts`、`DiffRuler.scale.test.tsx`、`DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.ruler.test.tsx`、`App.ruler.test.tsx` 零内容改动（`git diff --name-only` 不含这六个文件）且全部通过；本项新增断言全部落在新文件内。
- **ac-gates-green**：`pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过。

## 非目标

- 不改 `src/core/text/ruler.ts` 的既有导出语义；不改 `diffLineTexts`、`DiffRow` / `DiffBlock` / `DiffStatus` 类型、`INLINE_CHAR_LIMIT`、字符级 segment、`merge`、`overwriteBlock`。
- 不改 `DiffPane.tsx` 的渲染路径与 props（行渲染、filler 行、`inlineSegments`、`DIFF_ROW_HEIGHT`）；不改 `SplitPane.tsx` 的拖拽 / 键盘 / 比例逻辑；三栏 merge 视图不加指示条；目录树 / CSV / 结构化视图不改。
- 不做文本缩略图 / minimap、不做行号列表、不做逐行文本或语法高亮绘制。
- 不新增 vitest 配置、不新增依赖、不改 `code-gates.json`、不跑 `perf:gate` / `self_test`、不做真实 358k 对照对实机观察（product-qa 承接）。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。
- 不做视口窗拖动 / 手势优先级、不新增全局快捷键、不新增 IPC / 平台通道。
- 轨道级命中不改窗口化口径：`WINDOW_THRESHOLD`(1000)、`ROW_OVERSCAN`(10)、`DIFF_ROW_HEIGHT`(20)、行级 `DiffRowView` 与 `data-diff-*` 锚点语义不动，不在窗口分支另起行样式；也不改 `RULER_BAND_HEIGHT`(4) 与 `buildRulerBands` 的投影算法 / 输出契约，`@core` 不新增像素常量。
- 不新增 click 之外的指针交互（hover / 拖动 / 右键 / 双击 / 滚轮跳块），不改键盘映射与工具条按钮行为；不跑 `perf:gate`、不起浏览器 / 真机 / CDP 场（L3 复验属 Product Ops）。

## 实现约束

- 位置与几何一律用调用方传入的参数（`trackHeight`、`bandHeight`、`rowHeight`）计算，`ruler.ts` 内不出现 `DIFF_ROW_HEIGHT`、像素常量或对 renderer 的 `@renderer/*` 引用；`src/core/` 的 `no-restricted-imports` 硬约束保持不变。renderer 侧 `DiffRuler` 经 `clientHeight` 度量轨道 / 视口并把 `DIFF_ROW_HEIGHT` 传给几何层，不复制比例换算、最近块命中或视口窗公式。
- 单遍实现：一次遍历 `rows` 累积到 `bucketCount` 大小的桶数组（每桶最多 3 个状态槽），再从桶数组生成色带；内存 O(bucketCount)，不建行长度的中间数组，不对 `rows` 做 `filter` / `map` / `slice` / 展开。
- 只读 `DiffRow` 的 `status` 与行下标字段；不读文本与 segment 字段。
- 返回值为普通不可变（`readonly`）轻量对象；不缓存全量输入，不持有 `rows` / `blocks` 引用之外的可变状态，函数无副作用且幂等。
- 测试放在 `src/core/text/` 按现有 `*.test.ts` 风格（`describe` / `it`，纯 vitest，无 DOM），大模型用循环生成本地构造的最小 `DiffRow` 形状。UI 接线测试用 `src/renderer/src/views/CodeView.ruler.test.tsx`（jsdom + `@testing-library/react`），stub `clientHeight` 后直接赋值 `scrollTop` 并 `fireEvent.scroll`。
- 规模护栏的调用次数计数一律用透传 spy（`vi.mock('@core/text/ruler')` / `vi.mock('@core/text/diff')` 包 `vi.fn(actual)`），不在生产代码里加计数器、导出测试钩子或改 props 契约；jsdom 无 `ResizeObserver`，用 stub 主动回调模拟轨道高度变化，断言口径是「≤1 次重投影 + 零 IO」而非「永不重投影」。358k 规模的渲染断言只针对 `DiffRuler`（`DiffPane` 逐行 `map` 无法承载 358k 行），直接渲染时自备两个滚动容器 ref 驱动滚动断言；3 tab / 下钻链路沿用 `App.test.tsx` 的 `Workbench` + 计数 `PlatformPort` 基建，tab 切换因 `key={session.id}` 重挂载后由内存 buffer 重新 `diffLineTexts` 属既有行为，只钉「零平台 IO」。
- 导出名一旦落地即视为本集契约：至少导出聚合函数（`buildRulerBands`）、比例↔行号双向换算（`ratioToRow` / `rowToRatio` / `scrollOffsetForRow`）、最近差异块命中（`nearestBlockIndex` / `nearestBlockIndexAtRatio`）、目标行 / 滚动偏移（`resolveJumpTarget` / `resolveJumpTargetAtRatio`）、视口窗计算（`computeViewportWindow`）这五组能力。
- 轨道命中复用上述既有导出（`ratioToRow` / `nearestBlockIndexAtRatio` / `resolveJumpTargetAtRatio`），组件内只允许做「像素 → 比例」一步；比例来源优先 `event.currentTarget.getBoundingClientRect()` 的 `top` 与 `height`，`height <= 0` 退回已实测 `trackHeight`（`clientHeight`），`trackHeight <= 0` 或 `rows.length === 0` 直接返回不做选择。marker 可点下限用组件内具名常量表达（与 `RULER_BAND_HEIGHT` 同处，不进 `@core`），渲染时对 `top` 下推、对 `height` 夹取，保证不溢出轨道，`data-*` 行区间不随视觉下限变化。
- 350k 用例不得实时跑 `diffLineTexts`：用 `vi.mock('@core/text/diff')` 返回预构造 `{ rows, blocks }`；jsdom 无布局，必须显式桩 `clientHeight`（track 608 / pane 视口）与 `getBoundingClientRect`，断言不依赖 jsdom 恒为 0 的 `scrollHeight`。
- 既有六个测试文件（`src/core/text/ruler.test.ts`、`DiffRuler.scale.test.tsx`、`DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.ruler.test.tsx`、`App.ruler.test.tsx`）内容零改动是轨道命中的回归红线；若某条既有断言与 track 级命中冲突，先上报，不得改测试凑绿。
- 窗口跟随以元素真实 `scrollTop` 为唯一真相源：程序化写 `scrollTop` 后下一次渲染要能折回窗口；`CodeView` 的写入必须发生在 `setActive` 之前，`DiffPane.tsx` 的窗口化框架与常量不得重写。

## 最近交付证明

- WI：`wi_ws_50c491d272ec7cd9`（C 项：指示条 track 级命中，含 350k 回归，`kind: fix/feature`）
- 日期：2026-10-28
- 结果：`needSelfTest=false`，UI 自测按裁决跳过；code_gates passed（attempt 001，9 条门禁全绿：`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `test:cancel` / `test:memory`）。`pnpm test` 69 files / 1104 passed / 1 skipped / 1105。证据：`.munk/runs/run_ws_2ba8b4d3636112d5/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate}.log` 与同名 `.result.json`。
- 覆盖摘要：① **命中面提升**——`DiffRuler.tsx` track 元素挂 `onClick`，`(clientY - rect.top) / height` 夹到 `[0,1]` 后交 `resolveJumpTargetAtRatio`，组件只做「像素 → 比例」；矩形高为 0 时退回实测 `clientHeight`，`rows.length === 0` / 高度 ≤ 0 直接返回，`target.blockIndex < 0` 不派发。② **marker 优先级**——marker 保留自身精确选中并 `event.stopPropagation()`，`onSelectBlock` 每次点击恰一次（jsdom 用例单独计数）。③ **可点下限**——新增组件内常量 `RULER_MARKER_MIN_HEIGHT = 2`，渲染时 `height = min(trackHeight, max(2, band.height))` 且 `top` 下推夹取，`data-*` 行区间不变。④ **窗口跟随不依赖 scroll 事件**——`CodeView` 新增 `scrollToBlock(index)`，在 `selectBlock` / `step` / `jumpActive` 里于 `setActive` 前直接写两栏 `scrollTop = block.startRow * DIFF_ROW_HEIGHT`；`DiffPane.tsx` 零改动，B 的 `useLayoutEffect` 折回路径原样承载。⑤ **回归**——六个既有测试文件零 diff（`ruler.test.ts` / `DiffRuler.scale.test.tsx` / `DiffPane.test.tsx` / `CodeView.test.tsx` / `CodeView.ruler.test.tsx` / `App.ruler.test.tsx`），键盘 / ARIA 语义由既有用例继续钉住。
- 新增测试：`src/core/text/ruler.hit.test.ts`（184 行 / 5 例，纯 vitest，无 DOM）——350k / 608 / 4 下桶高 < 1px 的 band 中点到归属块、相邻同状态合并、首末桶与退化比例（`ratioToRow(1)=n-1` / `-1|NaN→0` / `rowCount=0→-1`）、201 个比例递增非递减且恒在 `[-1, blocks.length)`、0 块的 `-1` / `{blockIndex:-1,startRow:-1,scrollTop:0}` / `[]`。`src/renderer/src/views/CodeView.rulerTrack.test.tsx`（447 行 / 10 例，jsdom，`vi.mock('@core/text/diff')` 注入预构造 350k 模型 + `buildRulerBands` 透传 spy）——304px 中部点击严格等于 `resolveJumpTargetAtRatio`、0 / 304 / 607 三档单调且 ≥2 个不同块、25 个均匀 `clientY` 无死区且 ≥10 次换块、每次命中两栏 `scrollTop` 相等且 `= startRow × 20`、marker 点击命中自身块、marker 点击 `onSelectBlock` 恰 1 次、2px 下限不溢出 track 且 `data-*` 逐条一致、每次实测轨道高只投影 1 次（点击 / 滚动后不增）、marker ≤ `3 × floor(608/4)` 且 `textContent` 为空、无 scroll 事件时 `data-diff-window-start === startRow` 且该行两侧文本正确、两栏 `[data-diff-row]` ≤ `ceil(400/20) + 2 × 10` 且内容高 `7,000,000`、0 块时点击不跳不抛且 `0/0` 与视口窗仍在。
- 实测数字（jsdom，视口 400px 高 / `VIEWPORT_ROWS = 20` / overscan 10 / track 608 / band 4）：350k 模型 146 个 modified 块，marker 数 ≤ 456；单栏行元素上限 40，两栏相等；内容总高 `7000000px` 两栏相等；指示条内 `[data-diff-row]` 为 0。
- 注：本 WI change pack 只提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 ux / tech 手合；用例按 prd 的 AC 定义落本域 `qa/`（4 个：`diff-ruler-track-hit-click` / `diff-ruler-hit-ratio-boundaries` / `diff-ruler-marker-floor-and-window-follow` / `diff-ruler-track-hit-regression-gates`）。
- 后续注意：① 轨道点击的像素→比例换算只在 `DiffRuler` 内，别再往组件里塞块距离算法；`getBoundingClientRect().height` 为 0 的退化路径（jsdom / 布局前）必须保留 `clientHeight` 兜底。② 「程序化写 `scrollTop` 后窗口跟随」现在是 C 项与 B 项共同依赖的路径：`CodeView.scrollToBlock` 必须写在 `setActive` 之前（同一次 commit 前的 DOM 写入），不能改回只靠 `scroll` 事件或 effect 后置。③ marker 2px 是可点 / 可见下限而非几何语义，改 `RULER_BAND_HEIGHT`(4) 或 `DIFF_ROW_HEIGHT`(20) 时需重跑 `CodeView.rulerTrack.test.tsx`（用例按 608 / 4 / 20 硬编码）。④ 0 块时 track 点击必须是纯 NO-OP，别为了「有反馈」改成跳到第 0 行。
- 上一交付：`wi_ws_fb9ff1e1053ef505`（指示条规模护栏与 3 tab / 下钻回归证据，`kind: test`）；`wi_ws_5ff22a3e4f1f53cc`（`DiffRuler.tsx` 常驻指示条 + `CodeView` 接线，`CodeView.ruler.test.tsx` 11 例）；几何层 `wi_ws_1eb4a496b8d3bb35`（`src/core/text/ruler.ts`）语义至今未变。
