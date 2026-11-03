# Domain: diff-ruler

代码 / 文本双栏 Diff 的「指示条（ruler / overview bar）」。本域拥有两层：`src/core/text/` 下的纯几何模块（`ruler.ts` + 同名单测），把既有 `LineDiffResult` 的 `rows` / `blocks` 投影成轨道色带、轨道比例 ↔ 行号双向换算、最近差异块命中、目标行 / 滚动偏移、视口窗；以及 renderer 侧的 `src/renderer/src/components/DiffRuler.tsx` 与 `CodeView.tsx` 中 `CodeDiffView` 双栏分支的接线（内置 code 样本与下钻 / 拖放 / 打开得到的 `pair` 共用同一入口）。几何与命中永远以 `ruler.ts` 为唯一真相源，组件只绘制与派发选择。

## 范围

- **四态聚合**：输入 `diffLineTexts` 产出的 `rows` / `blocks`（语义不得改动）加调用方传入的轨道几何（`trackHeight`、`bandHeight`），单遍把行级 `same | added | removed | modified` 映射成有界位置色带 `band`：每条含 `status`、覆盖的 `startRow` / `endRow`（对齐行下标，含端点）与轨道上的 `top` / `height`；`same` 不产出色带。
- **双向换算**：轨道比例 ↔ 行号（0-based 对齐行下标）、行号 ↔ 轨道比例（往返稳定）、行号 ↔ 滚动偏移（`rowHeight` 由调用方传入）。
- **差异块命中**：给定行号或比例求最近差异块索引；点击落点 → 最近差异块 → 目标行（`block.startRow`）与目标 `scrollTop`。
- **视口窗**：由 `scrollTop` / 视口高度 / 行高 / 行数 / 轨道高度算出视口窗在轨道上的 `top` / `height`，含两端钳制。
- **算法落位与测试**：以上能力全部是 `src/core/text/ruler.ts` 纯函数，`src/core/text/ruler.test.ts` 用纯 vitest（无 DOM）在 Node 直接单测；358k 行大模型用循环构造的最小 `DiffRow` 形状生成，不调用 `diffLineTexts`。
- **指示条组件**：`DiffRuler.tsx` 消费 `@core/text/ruler` 现有导出，绘制常驻轨道、四态色带（`same` / `conflict` 不画）、当前差异块描边与随滚动同步的视口窗；整条可聚焦并支持 `ArrowUp` / `ArrowDown` / `Enter`（含环绕步进），点选标记派发差异块索引。组件不重新 diff、不遍历行文本、不新增平台调用。稳定锚点：轨道 `data-diff-ruler` / `role="listbox"` / `aria-label`（zh `差异指示条` / en `Difference ruler`），标记 `role="option"` + `data-diff-status` / `data-start-row` / `data-end-row` / `aria-label`（`(新增|删除|修改) · 第 n–m 行` / `(Added|Removed|Modified) · lines n–m`）、`aria-selected` 只标当前块，视口窗 `data-window-top` / `data-window-height`。
- **双栏接线**：`CodeDiffView` 把指示条作为 `SplitPane` 外侧兄弟节点渲染（不是 pane，`role="separator"` 仍恰 1 个），内置样本与下钻 `pair` 共用；点选 / 键盘只改现有 `active` 块索引（+ jump 令牌保证重复选择仍重新定位），两栏 `scrollTop` 一起对齐到 `startRow * DIFF_ROW_HEIGHT`，工具栏计数与 `DiffBadge` 自然同步；三栏 merge 不渲染指示条；覆写 / 重置 / 打开文件在同一提交内重投影。文案进 `files.code.ruler.*`（zh / en）。
- **轨道级命中（350k 回归）**：整条轨道即命中面——`DiffRuler.tsx` 在 track 元素上挂 click，把 `clientY - rect.top` 除以轨道高（矩形高为 0 时退回已实测 `clientHeight`；两者皆 ≤0 或 `rows.length === 0` 直接返回）夹到 `[0,1)` 得比例，再交 `@core/text/ruler` 的 `resolveJumpTargetAtRatio` 解析最近差异块并 `onSelectBlock(blockIndex)`；组件内只做「像素 → 比例」一步，不另写块距离算法。marker 保留自身精确选中（`nearestBlockIndex(blocks, marker.dataset.startRow)`）并 `stopPropagation`，两条路径各只派发一次选择。marker 渲染高度设 2px 可点下限（组件内 `RULER_MARKER_MIN_HEIGHT`，与 `RULER_BAND_HEIGHT` 同处，不进 `@core`）并在 track 内夹取，`data-*` 行区间不因视觉下限改变。`CodeView` 在 `selectBlock` / `step` / `jumpActive` 里于 `setActive` 之前把两栏 `scrollTop` 直接写为 `block.startRow × DIFF_ROW_HEIGHT`，窗口化面板靠元素真实 `scrollTop` 折回窗口、不依赖 scroll 事件。
- **规模护栏与证据锚点**：358k 规模上限、大模型边界、3 tab / 下钻会话回归链路与 `data-*` / `aria-*` 证据入口契约由 `src/renderer/src/components/DiffRuler.scale.test.tsx` 与 `src/renderer/src/App.ruler.test.tsx`（jsdom）在 `pnpm test` 内钉住；护栏只观察「投影次数 / 标记节点数 / 平台 IO 计数」等可计数事实，不在生产代码里加计数器、测试钩子或改 props 契约。
- **358k 用例 CI 超时显式化（只动测试）**：`DiffRuler.scale.test.tsx` 中描述串 `covers every non-same row with a same-status marker in one synchronised pass` 的 `it(...)` 增加 per-test 第三参数 `30_000`（沿用 `TreeView.test.tsx` 既有写法），并在用例上方就近注释写明超时依据（CI attempt1 实测 `6,816` ms 撞默认 5000 ms、本机同版本全量 `27.42` s、30 s ≈ 4.4x 余量、358k 规模与逐行覆盖断言不变）。`vitest.config.mts` 全局 `testTimeout` / `hookTimeout` 保持零 diff。

## 验收

- **ac-ruler-aggregation**：足够轨道（桶数 ≥ 行数）时色带与行级状态逐行一致——每条恰为一段极大同态连续行（不重不漏），`same` 不产生色带，同块内 `added` / `removed` 混合分别产出各自色带而不压成块级汇总；低分辨率（桶数 < 行数）下每个非 `same` 行 `r` 都存在 `status === rows[r].status` 且覆盖 `r` 的色带（允许不同状态区间交叠），色带按 `startRow` 升序、同 `startRow` 按 `added < removed < modified` 排列。
- **ac-ruler-jump**：比例 → 行号满足 `clamp(floor(ratio * rowCount), 0, rowCount - 1)`（`ratio` 先钳到 [0,1]，`ratio = 1` 落最后一行，`NaN` 视为 0，`rowCount = 0` 返回 -1）；反向换算对每个 `0 <= row < rowCount` 有 `比例→行号(行号→比例(row)) === row`；最近块命中在区间内返回该块、否则按最小行距返回最近块、等距取更小索引、空返回 -1；目标行为 `startRow`，目标偏移恰为 `startRow * rowHeight`（`rowHeight` 由入参传入）。
- **ac-ruler-window**：`rowCount <= 0` 或 `viewportHeight <= 0` 返回 `{ top: 0, height: 0 }`；`height = trackHeight * min(viewportHeight, rowCount * rowHeight) / (rowCount * rowHeight)`；`top = trackHeight * clamp(scrollTop, 0, rowCount * rowHeight - visibleHeight) / (rowCount * rowHeight)`；任意输入下 `top >= 0`、`height >= 0`、`top + height <= trackHeight`（1e-6 容差）；视口大于全文时恰为 `{ top: 0, height: trackHeight }`。
- **ac-ruler-scale**：358000 行合成模型单次调用只做一遍行遍历（不得二次全量 `for` / `map` / `filter`），`bands.length <= bucketCount * 3` 且 `<= 非 same 极大连续段数`（`bucketCount = clamp(floor(trackHeight / bandHeight), 1, rowCount)`）；极端逐行交替四态下输出规模仍远小于行数（`bands.length < rowCount / 100`）。
- **ac-ruler-regression**：边界全部用例化——空 diff 返回零色带、视口窗零尺寸且不抛错；全相同返回零色带但视口窗按行数正常；仅左删只有 `removed`、仅右增只有 `added` 且位置对应真实行；单行不越界；无尾换行与带尾换行行数 / 行区间一致；CRLF 与 LF 经 `diffLineTexts` 后行数一致、行区间一致；新增测试在 `pnpm test` 全绿且 lint / typecheck 无报错。
- **ac-ruler-immutability / ac-ruler-purity**：输入 `rows` / `blocks` 不被改写（冻结输入不抛错）；输出不含行文本 / segment / 行对象引用（用会抛错的代理行对象传入仍成功，序列化后无样本行文本）。模块零 DOM / 零 Electron / 零新依赖：不 import `electron` / `react` / `@renderer/*` / `diff` / `node-diff3`，不调平台、`fs`、IPC。
- **ac-ruler-persistent / ac-ruler-keyboard**：内置样本与 `pair` 下钻都立即存在指示条且不在分隔节点序列里；merge 模式不渲染；覆写 / 重置 / 打开文件后仍在。指示条可 Tab 聚焦并显示 focus ring，`aria-label` 随词典切换；`ArrowUp` / `ArrowDown` 按 `blocks` 顺序循环并完成双栏定位，`Enter`（与 Space）重新定位当前块；标记可访问名含状态与行区间。
- **ac-ruler-window（UI）**：视口窗由 `scrollTop` / 视口高 / 行高 / 轨道高算出并两端钳制；滚动任一栏后视口窗跟随、两栏 `scrollTop` 仍相等；滚动不改变标记数量与行区间。
- **ac-ruler-jump（UI）**：点击标记后两栏 `scrollTop` 均为该块 `startRow * 20` 且相等，工具栏计数与 `DiffBadge` 同步，块内行显示 `border-accent`；连续点选可连续跳转，重复点击已激活标记仍重新定位。
- **ac-ruler-regression（UI）**：空 diff / 全相同仍常驻（零标记，全相同时视口窗随滚动移动）；仅左删 / 仅右增与位置对应；单行 / 无尾换行 / CRLF 不越界；行内字符高亮、覆写 / 重置 / 保存与 `SplitPane` 交互保持原状；滚动与点选不新增 `diffLineTexts` / `PlatformPort` 调用；zh / en 无硬编码中文残留。
- **ac-scale-single-pass / ac-scale-marker-bound / ac-scale-row-coverage**：直接构造 358k `DiffRow[]`（配 `DiffBlock[]`）渲染后 `buildRulerBands` 在同一 `trackHeight` 下只被调用 1 次且收到的行数组与传入 `toBe` 同一引用；trackHeight=800 / bandHeight=4 下标记节点数 ≤ `3 * floor(800/4)`（600）且 < `rowCount / 100`（3580），每个 `top >= 0`、`height >= 0`、`top + height <= trackHeight`，指示条子树 `textContent` 去空白后为空；每个非 `same` 行都有 `data-diff-status === rows[i].status` 且覆盖 i 的标记，校验以行与已排序标记同步推进的单遍扫描实现（无 O(rows × markers) 双层循环）。
- **ac-scale-no-reproject / ac-scale-zero-io / ac-scale-large-edges**：「两栏各滚 3 次 + 点选 3 次 + 一次轨道高度变化（stub `ResizeObserver` 800 → 640）」后 `buildRulerBands` 累计 ≤2 次、`diffLineTexts` 增量 0；全程平台 `readTextFile` / `selectFile` / `selectDirectory` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath` 增量全 0；358k 下空 / 全相同 / 仅左删 / 仅右增 / 超长单行五个模型不抛错且标记数满足上界，空与全相同标记 0 且指示条仍挂载、视口窗合法，仅左删只出 `removed`、仅右增只出 `added`。
- **ac-tabs-switch-no-io / ac-tabs-ruler-isolation / ac-drilldown-roundtrip**：3 个 tab（至少 2 个带指示条）各切 2 轮后平台读取 / 扫描 / 哈希计数增量全 0、无扫描 / 摘要重建提示；两个 diff tab 的标记区间序列互不相同且切回后与首次逐项相同；激活目录 tab 时 DOM 无 `[data-diff-ruler]`，切回 code tab 重新出现。下钻后恰 1 个指示条且标记 ≥1，点标记后两栏 `scrollTop` 相等且等于 `startRow * 20`，返回上级后指示条移除、树标题与筛选 / 折叠状态不变、平台计数增量 0，再次下钻标记序列与首次相同。
- **ac-evidence-anchors**：轨道节点 `data-diff-ruler="true"` / `role="listbox"` / 双语 `aria-label`；标记 `role="option"`、`data-diff-status ∈ {added, removed, modified}`、`data-start-row` / `data-end-row` 为数字且 `start <= end`、`aria-label` 匹配双语正则；视口窗 `data-window-top` / `data-window-height` 可解析为数字。这些锚点即 product-qa 实机核对选取器契约，不得重命名。
- **ac-track-click-hit / ac-track-click-top-end / ac-track-no-dead-zone**：350,000 行、`trackHeight=608`、`bandHeight=4`（jsdom 桩 `clientHeight` 与 `getBoundingClientRect`）下，`clientY = rect.top + 304` 点击 track 选中的块索引严格等于 `resolveJumpTargetAtRatio(blocks, 304 / 608, 350000, 20).blockIndex`，工具栏显示 `index+1/total`；`rect.top` 与 `rect.top + 607` 各自等于比例 `0` 与 `607/608` 的解析结果、索引按行序单调不减且至少两个不同；在 `[top, top + 608)` 内均匀取 ≥20 个 `clientY`（含 marker 渲染高度之外与 <1px 桶）逐一点击都收到非负索引（无 NO-OP / `-1`），其中 ≥10 次与点击前块不同。
- **ac-scroll-both-panes / ac-marker-click-precedence / ac-zero-blocks-click**：每次命中后两栏 `scrollTop` 严格相等且等于 `startRow × 20`；点击 marker 时选中的是该 marker 覆盖的块且 `onSelectBlock` 只调一次（不因 track 监听二次触发）；0 个差异块时点击任意 y 不抛异常、`scrollTop` 不变、计数 `0/0`、指示条与视口窗仍在。
- **ac-ratio-pure-boundaries**：纯函数单测覆盖——桶高 <1px 抽样（首 / 中 / 末 band 中点比例解析出含该 band `startRow` 的块）；相邻同状态合并（`trackHeight = rowCount`、`bandHeight = 1` 时连续同状态行一条 band）；首末桶（比例 0 → 第 0 行 / 最近块，比例 1 → 最后一行 / 最近块，`ratioToRow(1, n) = n-1`、`ratioToRow(-1|NaN, n) = 0`、`ratioToRow(r, 0) = -1`）；任意比例块索引非递减且恒在 `[-1, blocks.length)`；0 块时三个函数返回 `-1` / `{blockIndex:-1,startRow:-1,scrollTop:0}` 且 `buildRulerBands([], …)` 为 `[]`。
- **ac-marker-min-height-clamped / ac-window-follows-click-without-scroll-event**：350k / 608 / 4 下每个 marker 渲染高度 ≥2px、`top >= 0`、`top + height <= 608 + 1e-6`，`data-*` 与投影结果逐条一致（band 语义不因视觉下限改变）；点击命中远距离块后不派发 `scroll` 事件，两栏 `data-diff-window-start` 等于块 `startRow` 且该行元素存在，即程序化写 `scrollTop` 后窗口靠真实 `scrollTop` 折回。
- **ac-350k-dom-bounded / ac-projection-once-no-per-row / ac-keyboard-and-aria-preserved**：每栏 `[data-diff-row]` ≤ `ceil(视口高度 / 20) + 2 × overscan` 且两栏相等，两栏 `data-diff-content-height` 均为 7,000,000，指示条内 `[data-diff-row]` 为 0；350k 下 `buildRulerBands` 每次实测轨道高度只调一次、点击 / 滚动后不再新增，marker 数 ≤ `3 × floor(608/4)`，指示条 `textContent` 为空；track 与 marker 的 `role` / `tabIndex` / 双语 `aria-label` / `aria-selected` 与键盘断言全绿。
- **ac-existing-tests-untouched**：`src/core/text/ruler.test.ts`、`DiffRuler.scale.test.tsx`、`DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.ruler.test.tsx`、`App.ruler.test.tsx` 内容零改动且全部通过；轨道级命中新增断言全部落在新文件内。若既有断言与 track 级命中冲突，先上报，不得改测试凑绿。
- **ac-target-explicit-timeout / ac-comment-cites-evidence / ac-no-global-timeout-config / ac-scale-constant-kept**：目标用例第三参数为 `30_000`、调用闭合为 `}, 30_000)`（正则 / AST 可断言）；附近注释同时含 `6,816` 与 `27.42` 并写明「显式 30 s / 358k 规模与覆盖不变」；`vitest.config.mts` 零 diff 且无 `testTimeout` / `hookTimeout`；`const ROW_COUNT = 358_000` 逐字保留且 `358_000` 出现次数不减少。
- **ac-test-count-kept / ac-assertion-count-kept / ac-no-skip-or-relax**：全文件 `it(` 仍 8 个、`diff ruler at 358k rows` 下仍 5 个、`describe(` 保持 **3**（prd 原文「4」经实测有误，以 3 为准）；目标用例体 `expect(` 仍 3 个（`toBeDefined` / `toBeLessThanOrEqual` / `toBeGreaterThanOrEqual`），全文件 `expect(` 仍 57；无 `it.skip` / `describe.skip` / `it.todo` / `xit` / `xdescribe`，目标用例仍逐行断言游标覆盖（未改抽样或宽松匹配）。
- **ac-single-file-green / ac-full-suite-green / ac-single-file-diff / ac-gates-green**：单文件 `pnpm test …/DiffRuler.scale.test.tsx` 退出 0、`Tests 8 passed`；全量 `pnpm test` 退出 0；该提交 `git diff --name-only` 恰为该测试文件一个；门禁矩阵全绿。
- **ac-scope-bounded**：护栏类改动只含测试文件（确需时 `DiffRuler.tsx` 仅允许新增纯附加 `data-*` / `aria-*`）；`ruler.ts` / `diff.ts` / `DiffPane.tsx` / `SplitPane.tsx` / `CodeView.tsx` / `TreeView.tsx` / `CsvView.tsx` / 两个门禁 manifest 零 diff；不新增 `test:*` 脚本、不改 vitest 配置。

## 非目标

- 不改 `ruler.ts` 的既有导出语义；不改 `diffLineTexts`、`DiffRow` / `DiffBlock` / `DiffStatus` 类型、`INLINE_CHAR_LIMIT`、字符级 segment、`merge`、`overwriteBlock`。
- 不改 `DiffPane.tsx` 的渲染路径与 props（行渲染、filler 行、`inlineSegments`、`DIFF_ROW_HEIGHT`）；不改 `SplitPane.tsx` 的拖拽 / 键盘 / 比例逻辑；三栏 merge 视图不加指示条；目录树 / CSV / 结构化视图不改。
- 不做文本缩略图 / minimap、行号列表、逐行文本或语法高亮绘制。
- 不新增 vitest 配置 / 依赖、不改 `code-gates.json`、不跑 `perf:gate` / self_test、不做真实 358k 对照对实机观察（product-qa 承接）。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。
- 不做视口窗拖动 / 手势优先级、不新增全局快捷键、不新增 IPC / 平台通道。
- 轨道级命中不改窗口化口径：`WINDOW_THRESHOLD`(1000)、`ROW_OVERSCAN`(10)、`DIFF_ROW_HEIGHT`(20)、行级 `DiffRowView` 与 `data-diff-*` 锚点语义不动，不在窗口分支另起行样式；不改 `RULER_BAND_HEIGHT`(4) 与 `buildRulerBands` 的投影算法 / 输出契约，`@core` 不新增像素常量。
- 不新增 click 之外的指针交互（hover / 拖动 / 右键 / 双击 / 滚轮跳块），不改键盘映射与工具条按钮行为；不跑 `perf:gate`、不起浏览器 / 真机 / CDP 场。
- 超时显式化不改全局 `testTimeout` / `hookTimeout`，不改产品代码（`DiffRuler.tsx` / `CodeView.tsx` / `src/core/**` 零 diff），不删用例、不加 `skip` / `todo`、不缩小 `ROW_COUNT`、不减少或放宽断言，不改其它测试文件，不优化 `buildRulerBands`；不做版本收敛、不推 tag、不 dispatch release workflow。

## 实现约束

- 位置与几何一律用调用方传入的参数（`trackHeight` / `bandHeight` / `rowHeight`）计算，`ruler.ts` 内不出现 `DIFF_ROW_HEIGHT`、像素常量或 `@renderer/*` 引用；renderer 侧 `DiffRuler` 经 `clientHeight` 度量轨道 / 视口并把 `DIFF_ROW_HEIGHT` 传给几何层，不复制比例换算、最近块命中或视口窗公式。
- 单遍实现：一次遍历 `rows` 累积到 `bucketCount` 大小的桶数组（每桶最多 3 个状态槽），再从桶数组生成色带；内存 O(bucketCount)，不建行长度的中间数组，不对 `rows` 做 `filter` / `map` / `slice` / 展开；只读 `status` 与行下标字段，不读文本与 segment。
- 返回值为 `readonly` 轻量对象；不缓存全量输入，不持有 `rows` / `blocks` 之外的可变状态，函数无副作用且幂等。
- 导出名一旦落地即视为契约：`buildRulerBands`、`ratioToRow` / `rowToRatio` / `scrollOffsetForRow`、`nearestBlockIndex` / `nearestBlockIndexAtRatio`、`resolveJumpTarget` / `resolveJumpTargetAtRatio`、`computeViewportWindow` 五组能力。
- 轨道命中复用上述导出，组件内只允许做「像素 → 比例」一步；比例优先取 `event.currentTarget.getBoundingClientRect()` 的 `top` 与 `height`，`height <= 0` 退回已实测 `trackHeight`（`clientHeight`），`trackHeight <= 0` 或 `rows.length === 0` 直接返回；marker 可点下限用组件内具名常量（与 `RULER_BAND_HEIGHT` 同处，不进 `@core`），渲染时对 `top` 下推、对 `height` 夹取，保证不溢出轨道。
- 窗口跟随以元素真实 `scrollTop` 为唯一真相源：程序化写 `scrollTop` 后下一次渲染要能折回窗口；`CodeView` 的写入必须发生在 `setActive` 之前，`DiffPane.tsx` 的窗口化框架与常量不得重写。
- 测试落位：几何测试在 `src/core/text/`（纯 vitest、无 DOM），大模型用循环构造最小 `DiffRow`；UI 接线在 `src/renderer/src/views/CodeView.ruler.test.tsx`（jsdom + `@testing-library/react`，stub `clientHeight` 后赋值 `scrollTop` + `fireEvent.scroll`）。
- 规模护栏的调用计数一律用透传 spy（`vi.mock('@core/text/ruler')` / `vi.mock('@core/text/diff')` 包 `vi.fn(actual)`），不在生产代码加计数器 / 测试钩子 / 改 props；jsdom 无 `ResizeObserver`，用 stub 主动回调模拟轨道高度变化，断言口径是「≤1 次重投影 + 零 IO」。358k 渲染断言只针对 `DiffRuler`（`DiffPane` 逐行 `map` 无法承载 358k 行），直接渲染时自备两个滚动容器 ref；3 tab / 下钻沿用 `App.test.tsx` 的 `Workbench` + 计数 `PlatformPort` 基建，tab 切换因 `key={session.id}` 重挂载后由内存 buffer 重新 `diffLineTexts` 属既有行为，只钉「零平台 IO」。
- 350k 用例不得实时跑 `diffLineTexts`（用 mock 返回预构造 `{ rows, blocks }`）；jsdom 无布局，必须显式桩 `clientHeight`（track 608 / pane 视口）与 `getBoundingClientRect`，断言不依赖恒为 0 的 `scrollHeight`。
- 超时首选做法固定为「per-test 第三参数 `30_000`」（与 `358_000` 同数字分隔符风格）；注释写在目标用例附近并给实测依据，不能只写「CI 慢」。值若删掉，`ac-comment-cites-evidence` 会失去锚点。

## 最近交付证明

- WI：`wi_ws_b21636d826817b53`（v0.2.10 CI 超时修复：358k 用例显式 per-test 超时，`kind: test/fix`）
- 日期：2026-10-29
- 结果：`needSelfTest=false`，UI 自测按裁决跳过（只动测试文件）；`code_gates` passed（attempt 001，9 条门禁全绿，`manifest.summary = "code_gates passed (9 gates, attempt 001)"`）；证据 `.munk/runs/run_ws_d422ee9477454a47/code-gates/attempts/001/{…}.log` 与同名 `.result.json`。
- 覆盖摘要：① **单用例显式超时**——`DiffRuler.scale.test.tsx` 的 `covers every non-same row with a same-status marker in one synchronised pass` 由 `})` 改为 `}, 30_000)`（沿用 `TreeView.test.tsx` 既有写法），用例体一行未改。② **证据写进注释**——上方 5 行注释写明 CI attempt1 实测 `6,816ms` 撞默认 5000ms（`Error: Test timed out in 5000ms.`）、本机同版本全量 `27.42s`（69 files / 1104 passed）、30 s ≈ 4.4x 余量、358k 规模与逐行覆盖不变。③ **全局不动**——`vitest.config.mts` 零 diff、无 `testTimeout` / `hookTimeout`。④ **覆盖不变**——`ROW_COUNT = 358_000` 保留；`it(` 8 个、目标 describe 下 5 个、`expect(` 57 个（目标用例体 3 个）；无 skip / todo。⑤ **变更面**——恰好 1 个文件（+6/−1）。
- 实测数字（本机干净树）：单文件 8 tests passed、文件级 2,198ms（gates 内）；全量 69 files / 1104 passed / 1 skipped、27.85s（gates 内）。CI attempt1 的 6,816ms 为上游观测值，本轮未复现 CI 环境。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），AC 落档在 `qa/diff-ruler-scale-timeout-{explicit,test-shape-kept,green,diff-scope}.md`。② **prd 的 `ac-test-count-kept` 基线数字有误**——原文写「`describe(` 数仍为 4」，实测改动前后均为 3；本项按实测 3 交付，后续任何按「4 个 describe」写断言的门禁会直接红。③ **CI 超时是时长问题不是覆盖问题**：这套 358k 用例已两度因默认 5000 ms 太紧在 CI 翻车；将来再有大型测试进该文件，默认按 per-test `30_000` 起步，也不要抬全局 `testTimeout`（会掩盖慢用例信号）。④ 注释里的 `6,816` / `27.42` 是历史实测快照，机器变快不必改，但删掉会失去 `ac-comment-cites-evidence` 的可核验锚点。
- 前序交付（几何语义至今未变）：`wi_ws_50c491d272ec7cd9`（track 级命中 + 350k 回归）、`wi_ws_fb9ff1e1053ef505`（规模护栏与 3 tab / 下钻证据）、`wi_ws_5ff22a3e4f1f53cc`（常驻指示条 + `CodeView` 接线）、`wi_ws_1eb4a496b8d3bb35`（`src/core/text/ruler.ts` 几何层）。
