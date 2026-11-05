# Domain: diff-ruler

v0.2.10 代码/文本双栏 Diff 的「指示条（ruler / overview bar）」。本域拥有两层：`src/core/text/` 下的纯几何模块（`ruler.ts` + 同名单测），把既有 `LineDiffResult` 的 `rows` / `blocks` 投影成轨道色带、轨道比例 ↔ 行号双向换算、最近差异块命中、目标行 / 滚动偏移、视口窗；以及 renderer 侧的可见组件 `src/renderer/src/components/DiffRuler.tsx` 与 `CodeView.tsx` 中 `CodeDiffView` 双栏分支的接线。几何与命中永远以 `ruler.ts` 为唯一真相源，组件只绘制与派发选择。

## 范围

- **四态聚合**：输入 `diffLineTexts` 产出的 `rows`/`blocks`（语义不改）加调用方传入轨道几何（`trackHeight`、`bandHeight`），单遍把行级 `same | added | removed | modified` 映射为有界位置色带 `band`：每条含 `status`、覆盖的 `startRow`/`endRow`（对齐行下标，含端点）与轨道 `top`/`height`；`same` 不产色带。
- **双向换算与视口窗**：轨道比例 ↔ 行号（0-based 对齐行下标）、行号 ↔ 轨道比例（往返稳定）、行号 ↔ 滚动偏移（`rowHeight` 由调用方传入）；由 `scrollTop`/视口高/行高/行数/轨道高算视口窗在轨道上的 `top`/`height`，含两端钳制。
- **差异块命中**：给定行号或比例求最近差异块索引；点击落点 → 最近差异块 → 目标行（`block.startRow`）与目标 `scrollTop`。
- **算法落位**：以上能力全为 `src/core/text/ruler.ts` 纯函数，`src/core/text/ruler.test.ts` 用纯 vitest（无 DOM）在 Node 直接单测；大模型用循环构造的最小 `DiffRow` 形状生成，不调用 `diffLineTexts`。
- **指示条组件**：`src/renderer/src/components/DiffRuler.tsx` 消费 `@core/text/ruler` 现有导出，绘制常驻轨道、四态色带（`same`/`conflict` 不画）、当前差异块描边与随滚动同步的视口窗；整条可聚焦并支持 `ArrowUp`/`ArrowDown`/`Enter`，点选标记派发差异块索引；不重新 diff、不遍历行文本、不新增平台调用。锚点：轨道 `data-diff-ruler`，标记 `data-diff-status`/`data-start-row`/`data-end-row`，视口窗 `data-window-top`/`data-window-height`。
- **双栏接线**：`CodeView.tsx` 的 `CodeDiffView` 把指示条作为 `SplitPane` 外侧兄弟节点渲染，内置样本与下钻 `pair` 共用；点选/键盘只改现有 `active` 块索引（+ jump 令牌保证重复选择仍重新定位），两栏 `scrollTop` 一起写到同一居中目标（见「居中跳转目标」）；工具栏计数与 `DiffBadge` 自然同步；三栏 merge 不渲染；覆写/重置/打开文件在同一提交内重投影；文案进 `files.code.ruler.*`（zh/en）。
- **轨道级命中**：整条轨道即命中面，`DiffRuler.tsx` 在 track 元素挂 click，把 `clientY - rect.top` 除以轨道高（矩形高 0 时退回 `clientHeight`，两者皆 ≤ 0 或 `rows.length === 0` 直接返回）夹到 `[0,1)` 得比例，交 `resolveJumpTargetAtRatio` 解析最近块并 `onSelectBlock(blockIndex)`；组件内只做「像素 → 比例」，不另写块距离算法。
- **轨道级选的精度与接线**：marker 保留自身精确选中（`nearestBlockIndex(blocks, marker.dataset.startRow)`）并 `stopPropagation`，两路径各只派发一次。marker 渲染高度设 2px 可点下限（组件内常量 `RULER_MARKER_MIN_HEIGHT`，与 `RULER_BAND_HEIGHT` 同处，不进 `@core`）并在 track 内夹取，`data-*` 行区间不因视觉下限改变。`CodeView` 在 `selectBlock`/`step`/`jumpActive` 里于 `setActive` 之前把两栏 `scrollTop` 直接写为同一居中目标，让窗口化面板靠元素真实 `scrollTop` 折回窗口、不依赖 scroll 事件。
- **居中跳转目标**：`上一个 / 下一个差异块`、指示条点选、`Enter` 重定位与 jump 令牌触发的滚动都经 `src/renderer/src/views/codeViewScroll.ts` 的纯函数 `centeredScrollTop` 求同一目标——块垂直居中并保留上下上下文，首末块、短文档、视口未知 / 为 0、块高 ≥ 视口高度一律确定性夹取到 `[0, maxScroll]`；可视高度取 pane `clientHeight`，行数取 `diff.rows.length`，两栏写同一值；`skipBlockScroll` 的「重载 / 交换后不重算」语义保留。该目标取代本域早期「对齐到块顶 `startRow * rowHeight`」的 UI 口径（`@core/text/ruler` 的 `resolveJumpTarget` 纯函数语义不变，仍供几何层与其它调用方使用）。
- **规模护栏与证据锚点**：358k 行规模上限、大模型边界、3 tab / 下钻会话回归链路与 `data-*`/`aria-*` 证据入口契约全部由 `DiffRuler.scale.test.tsx` 与 `App.ruler.test.tsx`（jsdom）在 `pnpm test` 内钉住；护栏只观察「投影次数 / 标记节点数 / 平台 IO 计数」等可计数事实，不在生产代码加计数器、测试钩子或改 props 契约。

## 验收

### 纯函数几何

- **ac-ruler-aggregation**：桶数 ≥ 行数时色带与行级状态逐行一致：每条色带恰为一段极大同态连续行（相邻同态合并，不重不漏），`same` 不产色带，同一块内 `added`/`removed` 混合时各产自身状态色带、不压成块级汇总；桶数 < 行数时每个非 `same` 行 r 都有 `status === rows[r].status` 且 `startRow <= r <= endRow` 的色带（异状态色带区间可交叠），色带按 `startRow` 升序、同序按 `added < removed < modified` 排。
- **ac-ruler-jump**：比例→行号 = `clamp(floor(ratio * rowCount), 0, rowCount - 1)`（`ratio` 先钳到 [0,1]，`ratio = 1` 落末行，`NaN` 视为 0，`rowCount = 0` 返回 -1）；反向满足 `比例→行号(行号→比例(row)) === row`；最近块命中：行在块区间内返该块，否则按到区间最小行距返最近块、等距取索引小者、`blocks` 空返 -1；目标行 = 命中块 `startRow`，目标 `scrollTop = startRow * rowHeight`（`rowHeight` 入参传入）。
- **ac-ruler-window**：`rowCount <= 0` 或 `viewportHeight <= 0` 返回 `{ top: 0, height: 0 }`；`height = trackHeight * min(viewportHeight, rowCount * rowHeight) / (rowCount * rowHeight)`；`top = trackHeight * clamp(scrollTop, 0, rowCount * rowHeight - visibleHeight) / (rowCount * rowHeight)`；任意输入满足 `top >= 0`、`height >= 0`、`top + height <= trackHeight`（1e-6 容差）；视口大于全文时恰为 `{ top: 0, height: trackHeight }`。
- **ac-ruler-scale**：358000 行合成模型单次调用只做一遍行遍历（不得二次 `for`/`map`/`filter` 全量行数组）；色带数受几何约束：`bands.length <= bucketCount * 3` 且 `<= 非 same 极大连续段数`，其中 `bucketCount = clamp(floor(trackHeight / bandHeight), 1, rowCount)`；极端逐行四态交替下仍 `bands.length < rowCount / 100`，不随行数线性增长。
- **ac-ruler-regression**：边界全用例化：空 diff（`rows`/`blocks` 皆空）零色带、视口窗零尺寸且不抛错；全相同（`blocks` 空）零色带但视口窗按行数正常算；仅左删只 `removed`、仅右增只 `added` 且位置对应真实行下标；单行不越界；无尾换行与带尾换行行数/色带区间一致；CRLF 与 LF 经 `diffLineTexts` 后行数一致、色带区间一致；新增测试在 `pnpm test` 全绿且 `pnpm lint`/`pnpm typecheck` 不报错。
- **ac-ruler-immutability**：输入 `rows`/`blocks` 及数组不被改写（调用前后深相等，冻结输入不抛错）；输出色带与视口窗不含行文本、行内 segment 或行对象引用（用会抛错的代理行对象传入仍须成功；不读 `leftText`/`rightText`/`leftSegments`/`rightSegments`；输出序列化不含样本行文本）。
- **ac-ruler-purity**：零 DOM/零 Electron/零新依赖：不 import `electron`、`react`、`@renderer/*`、`diff`、`node-diff3`，不调 `PlatformPort`/`fs`/IPC；全部函数可用手工构造的 `rows`/`blocks` 直接调用，与 `diffLineTexts` 无耦合。

### UI 接线

- **ac-ruler-persistent**：内置样本 diff 与 `pair` 下钻渲染后立即存在指示条，且不在 `SplitPane` 分隔节点序列（`role="separator"` 仍为 1，指示条非 pane）；切 merge 不渲染；覆写/重置/打开文件后仍在。
- **ac-ruler-aggregation**：标记集合与行级状态逐行一致——每个非 `same` 行都被同状态标记覆盖（`data-start-row <= 行 <= data-end-row`），`same` 无标记；同一块内混合状态按真实行级状态着色、不压成块级汇总；标记按 `data-start-row` 升序；足够轨道高时每条标记恰为极大同态连续段。
- **ac-ruler-window**：视口窗由 `scrollTop`/视口高/行高/轨道高算出并两端钳制（`top >= 0`、`height >= 0`、`top + height <= 轨道高`）；滚动任一栏后视口窗跟随、两栏 `scrollTop` 仍相等；滚动不改变标记数量与行区间。
- **ac-ruler-jump**：点击标记后两栏 `scrollTop` 相等且等于该块的居中目标（`centeredScrollTop`），工具栏计数与 `DiffBadge` 同步，块内行显 `border-accent`；连续点选可连续跳转，重复点击已激活标记仍重新定位。
- **ac-jump-centered**：视口高度为正且块高小于视口时，跳转后两栏 `scrollTop` 相等且等于 `round(blockTop + blockHeight / 2 - viewportHeight / 2)`（`blockTop = startRow * 22`，`blockHeight = (endRow - startRow + 1) * 22`），块上下两侧均可见上下文行。
- **ac-jump-clamped**：首块目标夹到 0；末块夹到 `max(0, rows * 22 - viewportHeight)`；文档总高 ≤ 视口高时目标恒为 0；视口为 0 / 未知（`clientHeight` 非有限或 ≤ 0）或块高 ≥ 视口高时退回夹取后的块顶；结果始终为有限数且落在 `[0, maxScroll]`。
- **ac-jump-stable**：同一块重复触发跳转后 `scrollTop` 不变；跳转后派发一次 pane `scroll` 事件，两侧 `scrollTop` 仍相等且不回弹；`skipBlockScroll` 仍使重载 / 交换后不重算滚动。
- **ac-nav-loop-wrap**：在 18 个独立差异块的真实行模型上，从块 4 连点工具栏 `[data-shell-entry="next-diff"]` 到末块（计数 `18/18`），再点一次下一处断言计数 `1/18`、当前块为第 1 块（两侧 `border-accent` 行集合等于首块行区间）；在块 1 点 `[data-shell-entry="prev-diff"]` 断言计数 `18/18`、当前块为末块。首末块外沿不越界、不抖动。
- **ac-nav-loop-landing**：末块 / 首块 / 回绕后的落点，两侧 pane `scrollTop` 相等且严格等于 `centeredScrollTop` 纯函数目标（测试调用同一函数，不内联公式），值为有限数且 `0 ≤ scrollTop ≤ max(0, rows * 22 - viewportHeight)`；回绕后重复读取并派发一次 pane `scroll`，`scrollTop` 不变。
- **ac-nav-loop-fixture**：仓库既有 `LONG_PAIR` 仅 4 块，循环用例在 `CodeView.ruler.test.tsx` 内构造 test-only 的 18 组 `same-i` / `left-i` / `right-i` 行模型并显式断言 `blocks.length === 18`；不新增产品代码、不改块构建语义。
- **ac-ruler-keyboard**：指示条可 Tab 聚焦并显 focus ring，`aria-label` 随 zh/en 词典变化；`ArrowUp`/`ArrowDown` 按 `blocks` 顺序循环并完成双栏定位，`Enter` 重新定位当前块；标记可访问名称含状态与行区间。
- **ac-ruler-regression**：空 diff/全相同仍常驻（零标记，全相同时视口窗仍随滚动移动）；仅左删只 removed、仅右增只 added 且位置对应真实行；单行/无尾换行/CRLF 不越界；行内高亮、覆写/重置/保存与 `SplitPane` 交互保持原状；滚动与点选不新增 `diffLineTexts` 与 `PlatformPort` 调用；zh/en 无硬编码中文残留。

### 规模护栏与变更边界

- **ac-scale-single-pass**：直接构造的 358k 行 `DiffRow[]`（配 `DiffBlock[]`）渲染后，`buildRulerBands` 在同一 `trackHeight` 下只调 1 次，其收到的行数组与传入数组 `toBe` 同一引用（行模型未复制/浅拷贝）。
- **ac-scale-marker-bound**：358k 行 `added/removed/modified/same` 逐行交替模型在 `trackHeight=800`、`bandHeight=4` 下，标记节点数 ≤ `3 * floor(trackHeight / bandHeight)`（600）且 < `rowCount / 100`（3580）；每个标记 `top >= 0`、`height >= 0`、`top + height <= trackHeight`；指示条子树 `textContent` 去空白后为空。
- **ac-scale-row-coverage**：同一 358k 模型下每个非 `same` 行都存在 `data-diff-status === rows[i].status` 且 `data-start-row <= i <= data-end-row` 的标记；校验以行与已排序标记同步推进的单遍扫描实现，无 O(rows × markers) 双层循环。
- **ac-scale-no-reproject**：渲染后执行「两栏各滚动 3 次 + 点选标记 3 次 + 一次轨道高度变化（stub `ResizeObserver` 回调把 `trackHeight` 800→640）」后，`buildRulerBands` 累计调用 ≤ 2（首绘 1 + 尺寸变化 1），`diffLineTexts` 增量 0。
- **ac-scale-zero-io**：上述滚动/点选/尺寸变化全程，platform 的 `readTextFile`/`selectFile`/`selectDirectory`/`listDirectory`/`listDirectories`/`digestFiles`/`realpath` 调用计数增量全为 0。
- **ac-scale-large-edges**：358k 下空（0 行）、全相同、仅左删、仅右增、超长单行（达 `INLINE_CHAR_LIMIT` 量级）五个模型各自：不抛错、标记数满足 ac-scale-marker-bound 上界；空与全相同标记数为 0 且指示条仍挂载、视口窗 `top >= 0`、`top + height <= trackHeight`；仅左删只产 `removed`、仅右增只产 `added`。
- **ac-tabs-switch-no-io**：3 个会话 tab 同时驻留（≥2 个带指示条的双栏 diff），在 3 tab 间各切换 2 轮后 platform 的 `readTextFile`/`listDirectory`/`listDirectories`/`digestFiles`/`realpath` 计数增量全为 0，且无扫描/摘要重建进度提示。
- **ac-tabs-ruler-isolation**：两个不同文件对的 diff tab 各标记区间（`data-diff-status`+`data-start-row`+`data-end-row` 序列）互不相同；来回切换后每个 tab 序列与首次逐项相同；激活目录 tab 时 DOM 无 `[data-diff-ruler]`，切回 code tab 后重现。
- **ac-drilldown-roundtrip**：目录会话下钻文件对后 DOM 恰存在 1 个 `[data-diff-ruler]` 且标记数 ≥ 1；点标记后两栏 `scrollTop` 相等且等于该块的居中目标；点「返回上级目录视图」后指示条移除、目录树标题与筛选/折叠状态如下钻前、platform 读取/扫描/哈希计数增量 0；再下钻同一对，标记区间序列与首次逐项相同。
- **ac-evidence-anchors**：证据入口契约稳定：轨道 `data-diff-ruler="true"`、`role="listbox"`、`aria-label` zh `差异指示条`/en `Difference ruler`；每个标记 `role="option"`、`data-diff-status` ∈ {added, removed, modified}、`data-start-row`/`data-end-row` 为数字且 `start <= end`、`aria-label` 匹配 zh `^(新增|删除|修改) · 第 \d+–\d+ 行$` / en `^(Added|Removed|Modified) · lines \d+–\d+$`；视口窗带可解析为数字的 `data-window-top`/`data-window-height`。这些选取器不得重命名。
- **ac-scope-bounded**：变更路径只含测试文件（确需缺口时 `DiffRuler.tsx` 仅可新增纯附加 `data-*`/`aria-*`）；`ruler.ts`、`diff.ts`、`DiffPane.tsx`、`SplitPane.tsx`、`CodeView.tsx`、`TreeView.tsx`、`CsvView.tsx`、`.munk/code-gates.json`、`.munk/code-gates.perf.json` 零 diff；不新增 `test:*` 脚本、不改 vitest 配置。
- **ac-target-explicit-timeout**：描述串为 `covers every non-same row with a same-status marker in one synchronised pass` 的 `it(...)`（全文件唯一）第三个参数为 `30_000`，闭合为 `}, 30_000)`，正则/AST 可断言。
- **ac-comment-cites-evidence**：该用例附近注释同时含字面量 `6,816`（CI attempt1 实测毫秒）与 `27.42`（本机全量秒），并写明「显式 30s / 358k 规模与覆盖不变」。
- **ac-no-global-timeout-config**：`vitest.config.mts` 零 diff，其 `test` 配置块无 `testTimeout`/`hookTimeout` 键（`grep -c "testTimeout\|hookTimeout" vitest.config.mts` == 0），默认 5000ms 全局口径不变。
- **ac-scale-constant-kept**：文件内 `const ROW_COUNT = 358_000` 逐字保留，全文件 `358_000` 出现次数不减少。
- **ac-test-count-kept**：全文件 `it(` 仍为 8；`diff ruler at 358k rows` 下仍为 5；`describe(` 保持 3（原 PRD 写「仍为 4」为基线笔误，实测改动前后均为 3，本项不改 describe 结构）。
- **ac-assertion-count-kept**：目标用例体内 `expect(` 仍为 3（`toBeDefined`/`toBeLessThanOrEqual`/`toBeGreaterThanOrEqual` 各一）；全文件 `expect(` 仍为 57。
- **ac-no-skip-or-relax**：文件内无 `it.skip`/`describe.skip`/`it.todo`/`xit`/`xdescribe`（grep 计数 0），目标用例仍对每个非 `same` 行逐行断言游标覆盖，未改为抽样或宽松匹配。
- **ac-single-file-green**：`pnpm test src/renderer/src/components/DiffRuler.scale.test.tsx` 退出码 0、`Tests 8 passed (8)`，交付说明记录目标用例实测耗时。
- **ac-full-suite-green**：全量 `pnpm test` 退出码 0，69 files passed / 1104 passed，交付说明记录总耗时。
- **ac-gates-green**：`.munk/code-gates.json` 的 9 道 gate（install/lint/typecheck/build/build:web/test/test-compare-request/cancel-gate/memory-gate）全部退出码 0。
- **ac-single-file-diff**：本项提交 `git diff --name-only` 恰为 `src/renderer/src/components/DiffRuler.scale.test.tsx` 一个文件（不夹带 `vitest.config.mts`、`package.json`、产品代码或其它测试）。

### 轨道级命中

- **ac-track-click-hit**：350,000 行、`trackHeight=608`、`bandHeight=4`（jsdom 桩 `clientHeight` 与 `getBoundingClientRect`）下，在 track 以 `clientY = rect.top + 304` 触发 click 后，选中块索引严格等于 `resolveJumpTargetAtRatio(blocks, 304 / 608, 350000, 20).blockIndex`，工具栏计数显示 `index+1/total`。
- **ac-track-click-top-end**：同一渲染下再以 `clientY = rect.top` 与 `rect.top + 607` 点击 track，各自选中块严格等于 `resolveJumpTargetAtRatio` 在比例 `0` 与 `607 / 608` 的返回值；顶部/中部/末端索引按行序单调不减，且至少两个不同索引。
- **ac-track-no-dead-zone**：在 `[rect.top, rect.top + 608)` 均匀取 ≥20 个 `clientY`（含落在 marker 渲染高度之外、高 < 1px 桶上）逐一点击，每次 `onSelectBlock` 都收到 `resolveJumpTargetAtRatio` 同比例解析出的非负索引（无 NO-OP、无 `-1`）；350k 下至少 10 次选中块与点击前不同。
- **ac-scroll-both-panes**：上述每次命中后左右两栏 `scrollTop` 严格相等且严格等于该块的居中目标（与 `centeredScrollTop` 同值，测试调用同一函数而非内联公式）。
- **ac-marker-click-precedence**：点击某 marker 时选中其覆盖的块（`nearestBlockIndex(blocks, marker.dataset.startRow)`），且 `onSelectBlock` 只调一次（不因 track 级监听二次触发）。
- **ac-zero-blocks-click**：0 个差异块（两侧相同或都为空）时点击 track 任意 y 不抛异常，两栏 `scrollTop` 保持点击前值不变，计数仍 `0/0`，指示条与视口窗仍在 DOM。
- **ac-ratio-pure-boundaries**：纯函数单测全绿：①桶高 < 1px（350k/608/4 抽样含首/中/末 band，band 中点比例经 `nearestBlockIndexAtRatio` 得含该 band `startRow` 的块）；②相邻同状态合并（`trackHeight = rowCount`、`bandHeight = 1` 时连续同状态行产一条 band，跨度内任意比例解析同块）；③首末桶（比例 0 → 含第 0 行/最近块，比例 1 → 含末行/最近块，`ratioToRow(1, n) = n-1`、`ratioToRow(-1|NaN, n) = 0`、`ratioToRow(r, 0) = -1`）；④任意比例（0→1 抽样递增时块索引非递减且恒在 `[-1, blocks.length)`）；⑤0 块（三函数分别返 `-1`/`{blockIndex:-1,startRow:-1,scrollTop:0}`，`buildRulerBands([], …)` 为 `[]`）。
- **ac-marker-min-height-clamped**：350k/608/4 下每个 marker 渲染高 ≥ 组件内可点下限常量（≥ 2px）、`top >= 0`、`top + height <= 608 + 1e-6`（下限不把 marker 顶出 track），且 `data-start-row`/`data-end-row`/`data-diff-status` 与投影结果逐条一致（band 语义不因视觉下限改变）。
- **ac-window-follows-click-without-scroll-event**：350k 下点击 track 命中远距离块后不派发任何 `scroll` 事件，两栏 `[data-diff-row]` 窗口首行索引（`data-diff-window-start`）等于块 `startRow`，且该行元素存在并显对应侧文本（靠真实 `scrollTop` 折回，不依赖 scroll 事件）。
- **ac-350k-dom-bounded**：同一 350k 渲染中每栏 `[data-diff-row]` 数量 ≤ `ceil(视口高度 / 20) + 2 × overscan` 且两栏相等；两栏内容总高均 `350000 × 20 = 7,000,000`（`data-diff-content-height`，两栏相等）；指示条内 `[data-diff-row]` 为 0。
- **ac-projection-once-no-per-row**：350k 下 `buildRulerBands` 每次实测 track 高度只调一次，点击/滚动后不再新增；marker 数 ≤ `3 × floor(608 / 4)`，指示条 `textContent` 为空（无逐行文本）。
- **ac-keyboard-and-aria-preserved**：track 仍有 `role="listbox"`、`tabIndex=0`、zh `aria-label="差异指示条"`/en `"Difference ruler"`；marker 仍 `role="option"` 且 `aria-label` 匹配 `(新增|删除|修改) · 第 n–m 行` / `(Added|Removed|Modified) · lines n–m`；`activeBlock` 覆盖的 marker `aria-selected="true"` 其余 `false`；ArrowDown/ArrowUp 环绕、Enter 与 Space 重新定位的既有断言仍全绿。
- **ac-existing-tests-untouched**：`ruler.test.ts`、`DiffRuler.scale.test.tsx`、`DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.ruler.test.tsx`、`App.ruler.test.tsx` 零内容改动（`git diff --name-only` 不含这六个文件）且全部通过；本项新增断言全落新文件内。
- **ac-gates-green**：`pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过。

## 非目标

- 不改 `src/core/text/ruler.ts` 的既有导出语义；不改 `diffLineTexts`、`DiffRow`/`DiffBlock`/`DiffStatus` 类型、`INLINE_CHAR_LIMIT`、字符级 segment、`merge`、`overwriteBlock`。
- 不改 `DiffPane.tsx` 渲染路径与 props 契约（行渲染、filler 行、`inlineSegments` 结构）；行高（当前 `DIFF_ROW_HEIGHT = 22`）与单词级差异配色由域 `shell-tightening` 定义，本域只消费；不改 `SplitPane.tsx` 拖拽/键盘/比例逻辑；三栏 merge 不加指示条；目录树/CSV/结构化视图不改。
- 不做文本缩略图/minimap、行号列表、逐行文本或语法高亮绘制。
- 不新增 vitest 配置、依赖、不改 `code-gates.json`、不跑 `perf:gate`/`self_test`、不做真实 358k 对照对实机观察（product-qa 承接）。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。
- 不做视口窗拖动/手势优先级、不新增全局快捷键、不新增 IPC/平台通道。
- 轨道级命中不改窗口化口径：`WINDOW_THRESHOLD`(1000)、`ROW_OVERSCAN`(10)、`DIFF_ROW_HEIGHT`(22)、行级 `DiffRowView` 与 `data-diff-*` 锚点语义不动，不在窗口分支另起行样式；也不改 `RULER_BAND_HEIGHT`(4) 与 `buildRulerBands` 的投影算法/输出契约，`@core` 不新增像素常量。
- 不新增 click 之外的指针交互（hover/拖动/右键/双击/滚轮跳块），不改键盘映射与工具条按钮行为；不跑 `perf:gate`、不起浏览器/真机/CDP 场（L3 复验属 Product Ops）。

## 实现约束

- 位置与几何一律用调用方传入的 `trackHeight`/`bandHeight`/`rowHeight` 计算，`ruler.ts` 内不出现 `DIFF_ROW_HEIGHT`、像素常量或 `@renderer/*` 引用；`src/core/` 的 `no-restricted-imports` 硬约束不变。renderer 侧 `DiffRuler` 经 `clientHeight` 度量轨道/视口并把 `DIFF_ROW_HEIGHT` 传给几何层，不复制比例换算、最近块命中或视口窗公式。
- 单遍实现：一次遍历 `rows` 累积到 `bucketCount` 大小的桶数组（每桶最多 3 个状态槽），再从桶数组生成色带；内存 O(bucketCount)，不建行长度的中间数组，不对 `rows` 做 `filter`/`map`/`slice`/展开。
- 只读 `DiffRow` 的 `status` 与行下标字段，不读文本与 segment 字段；返回值为普通不可变（`readonly`）轻量对象，不缓存全量输入，无副作用且幂等。
- 测试放在 `src/core/text/` 按现有 `*.test.ts` 风格（纯 vitest，无 DOM），大模型用循环生成本地构造的最小 `DiffRow` 形状；UI 接线测试用 `src/renderer/src/views/CodeView.ruler.test.tsx`（jsdom + `@testing-library/react`），stub `clientHeight` 后直接赋值 `scrollTop` 并 `fireEvent.scroll`。
- 规模护栏的调用次数计数一律用透传 spy（`vi.mock('@core/text/ruler')`/`vi.mock('@core/text/diff')` 包 `vi.fn(actual)`），不在生产代码加计数器、导出测试钩子或改 props 契约；jsdom 无 `ResizeObserver`，用 stub 主动回调模拟轨道高度变化，断言口径是「≤1 次重投影 + 零 IO」而非「永不重投影」。358k 渲染断言只针对 `DiffRuler`（`DiffPane` 逐行 `map` 无法承载 358k），直接渲染时自备两个滚动容器 ref 驱动滚动断言；3 tab/下钻链路沿用 `App.test.tsx` 的 `Workbench` + 计数 `PlatformPort` 基建，只钉「零平台 IO」。
- 导出名一旦落地即本集契约：至少导出聚合（`buildRulerBands`）、比例↔行号双向换算（`ratioToRow`/`rowToRatio`/`scrollOffsetForRow`）、最近差异块命中（`nearestBlockIndex`/`nearestBlockIndexAtRatio`）、目标行/滚动偏移（`resolveJumpTarget`/`resolveJumpTargetAtRatio`）、视口窗计算（`computeViewportWindow`）五组能力。
- 轨道命中复用上述既有导出（`ratioToRow`/`nearestBlockIndexAtRatio`/`resolveJumpTargetAtRatio`），组件内只允许「像素 → 比例」一步；比例来源优先 `getBoundingClientRect()` 的 `top`/`height`，`height <= 0` 退回 `trackHeight`（`clientHeight`），`trackHeight <= 0` 或 `rows.length === 0` 直接返回。marker 可点下限用组件内具名常量表达（与 `RULER_BAND_HEIGHT` 同处，不进 `@core`），渲染时对 `top` 下推、对 `height` 夹取，不溢出轨道，`data-*` 行区间不随视觉下限变化。
- 350k 用例不得实时跑 `diffLineTexts`：用 `vi.mock('@core/text/diff')` 返回预构造 `{ rows, blocks }`；jsdom 无布局，必须显式桩 `clientHeight`（track 608 / pane 视口）与 `getBoundingClientRect`，断言不依赖 jsdom 恒为 0 的 `scrollHeight`。
- 既有六个测试文件（`ruler.test.ts`、`DiffRuler.scale.test.tsx`、`DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.ruler.test.tsx`、`App.ruler.test.tsx`）内容零改动是回归红线；若既有断言与 track 级命中冲突，先上报，不得改测试凑绿。
- 窗口跟随以元素真实 `scrollTop` 为唯一真相源：程序化写 `scrollTop` 后下一次渲染要能折回窗口；`CodeView` 的写入必须发生在 `setActive` 之前，`DiffPane.tsx` 的窗口化框架与常量不得重写。
- 跳转目标的唯一来源是 `codeViewScroll.centeredScrollTop`：组件与测试都不再内联 `startRow * DIFF_ROW_HEIGHT`，可视高度只从 pane 自身 `clientHeight` 读，行数只从 `diff.rows.length` 读；`@core/text/ruler` 的像素无关契约不因居中口径改动。

## 最近交付证明

- WI：`wi_intake_b263d67b0d4ef595`（钉住差异块导航首末循环与交换四态计数；`kind: test`），日期 2026-11-05。
- 结果：code_gates passed（32 gates，attempt 001，`.munk/runs/run_intake_b263d67b0d4ef595/code-gates/attempts/001`；`pnpm test` 159 files / 2453 passed + 1 skipped（2454））。
- 覆盖摘要：test-only。`CodeView.ruler.test.tsx` 新增「diff ruler block navigation loop」一例：本地 18 块行模型（显式断言 `blocks.length === 18`），先验证块 3 / 4 的当前块 accent 行与居中偏差 ≤ 1px，再经真实工具栏按钮走到末块（`18/18`）→ 下一处回 `1/18` 首块 → 上一处回 `18/18` 末块，每次断言两侧 `scrollTop` 相等且等于同一 `centeredScrollTop` 目标、落点在 `[0, maxScroll]` 且为有限数；回绕后再派发一次 `scroll` 断言落点不变。产品源码与 `codeViewScroll` / `ruler.ts` 零改动。
- 保留：`DiffRuler.scale.test.tsx` 的 358k 规模显式 30s 超时与逐行覆盖断言、`CodeView.rulerTrack.test.tsx` 轨道级命中口径均未改动。
