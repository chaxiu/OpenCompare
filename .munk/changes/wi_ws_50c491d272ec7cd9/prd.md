# C · 指示条 track 级命中（含 350k 回归）

## 范围

- 修 L3 场次 `trun_d63c3971b06ccfca` 的真实 fail #1：350k 行、track 608px、bandHeight 4 时多数 marker 高约 0.0017px，点击处理只挂在 marker 元素上，中部空白命中不到 marker → 点击 NO-OP。
- 命中面从「marker 元素」提升到「track 元素」：`src/renderer/src/components/DiffRuler.tsx` 在 track 上加点击处理，取点击点纵向比例（`clientY - rect.top` / track 高度，夹到 `[0,1)`）走 `@core/text/ruler` 的 `ratioToRow` / `nearestBlockIndexAtRatio` / `resolveJumpTargetAtRatio` 解析出最近差异块，再 `onSelectBlock(blockIndex)`；`CodeView` 既有 `selectBlock` → `active` → 两栏 `scrollTop = block.startRow × DIFF_ROW_HEIGHT` 链路保持不动。
- marker 保持自身精确选中（点 marker 选它所属块，且不重复触发一次），否则既有 marker 点击断言会变成「按 y 命中」而失效；marker 视觉高度设可点下限，且仍夹在 track 内。
- 保持既有语义：`role="listbox"` / marker `role="option"` / `aria-label` / `aria-selected`、Up/Down/Enter/Space 键盘行为、投影 O(rows) 单遍、marker 数受桶数约束、不按行生成 DOM、不产生逐行文本。
- 在新文件里补齐纯函数命中边界单测与 350k jsdom 回归（track 中部 / 末端 / 顶部点击、active 序号、两栏 scrollTop、0 块、DOM 有界、窗口无需 scroll 事件也跟随）。
- 允许为「程序化 `scrollTop` 后窗口跟随（不依赖 scroll 事件）」做最小接线改动：`src/renderer/src/views/CodeView.tsx` 与 `src/renderer/src/components/DiffPane.tsx` 的跳转/折回衔接处可改，但不得重写 B 的窗口化方案。

## 验收

- ac-track-click-hit: 350,000 行、trackHeight 608、bandHeight 4（jsdom 桩 `clientHeight` / `getBoundingClientRect`）下，在 track 元素上以 `clientY = rect.top + 304` 触发 click 后，被选中的块索引严格等于 `resolveJumpTargetAtRatio(blocks, 304 / 608, 350000, 20).blockIndex`，工具栏计数显示 `index+1/total`。
- ac-track-click-top-end: 同一渲染下再以 `clientY = rect.top` 与 `clientY = rect.top + 607` 点击 track，各自选中块严格等于 `resolveJumpTargetAtRatio` 在比例 `0` 与 `607 / 608` 的返回值；顶部、中部、末端得到的块索引按行序单调不减，且至少有两个不同索引。
- ac-track-no-dead-zone: 在 `[rect.top, rect.top + 608)` 内均匀取至少 20 个 `clientY`（含落在 marker 渲染高度之外、落在高 < 1px 桶上的位置）逐一点击 track，每次 `onSelectBlock` 都收到 `resolveJumpTargetAtRatio` 同比例解析出的非负索引（无 NO-OP、无 `-1`）；350k 下其中至少 10 次点击选中的块与点击前不同，证明命中不再依赖 marker 元素。
- ac-scroll-both-panes: 上述每次命中后，左右两栏 `scrollTop` 严格相等且严格等于该块 `startRow × 20`。
- ac-marker-click-precedence: 点击某个 marker 元素时，选中的是该 marker 覆盖的块（`nearestBlockIndex(blocks, marker.dataset.startRow)`），且 `onSelectBlock` 只被调用一次（不因 track 级监听二次触发）。
- ac-zero-blocks-click: 0 个差异块（两侧文本相同、或两侧都为空）时，点击 track 任意 y 不抛异常，两栏 `scrollTop` 保持点击前的值不变，计数仍为 `0/0`，ruler 与视口窗口仍在 DOM 中。
- ac-ratio-pure-boundaries: 新增纯函数单测覆盖并全绿：①桶高 < 1px（350k 行 / 608 / 4 下抽样含首、中、末 band，band 中点比例经 `nearestBlockIndexAtRatio` 得到含该 band `startRow` 的块）；②相邻同状态合并（`trackHeight = rowCount`、`bandHeight = 1` 时连续同状态行产出一条 band，band 跨度内任意比例解析到同一块）；③首末桶（比例 0 → 含第 0 行/最近块，比例 1 → 含最后一行/最近块，`ratioToRow(1, n) = n-1`，`ratioToRow(-1|NaN, n) = 0`，`ratioToRow(r, 0) = -1`）；④任意比例（0→1 抽样递增时块索引非递减且恒在 `[-1, blocks.length)` 内）；⑤0 块（三个函数分别返回 `-1` / `{blockIndex:-1,startRow:-1,scrollTop:0}`，且 `buildRulerBands([], …)` 为 `[]`）。
- ac-marker-min-height-clamped: 350k / 608 / 4 下每个 marker 的渲染高度 ≥ 组件内可点下限常量（≥ 2px）、`top >= 0`、`top + height <= 608 + 1e-6`（下限不得把 marker 顶出 track），且 `data-start-row` / `data-end-row` / `data-diff-status` 与投影结果逐条一致（band 语义不因视觉下限改变）。
- ac-window-follows-click-without-scroll-event: 350k 下点击 track 命中远距离块后，不派发任何 `scroll` 事件，两栏 `[data-diff-row]` 窗口的首行索引（`data-diff-window-start`）等于块 `startRow`，且该行元素存在并显示对应侧文本；即程序化写 `scrollTop` 后窗口靠元素真实 `scrollTop` 折回，不依赖 scroll 事件。
- ac-350k-dom-bounded: 同一 350k 渲染中，每栏 `[data-diff-row]` 数量 ≤ `ceil(视口高度 / 20) + 2 × overscan` 且两栏相等；两栏内容总高均为 `350000 × 20 = 7,000,000`（`data-diff-content-height`，并用两栏相等断言）；ruler 内 `[data-diff-row]` 为 0 个。
- ac-projection-once-no-per-row: 350k 下 `buildRulerBands` 在每次实测 track 高度只被调用一次，点击/滚动后不再新增调用；marker 数 ≤ `3 × floor(608 / 4)`，ruler 的 `textContent` 为空（无逐行文本）。
- ac-keyboard-and-aria-preserved: track 仍有 `role="listbox"`、`tabIndex=0`、zh `aria-label="差异指示条"` / en `"Difference ruler"`；marker 仍 `role="option"` 且 `aria-label` 匹配 `(新增|删除|修改) · 第 n–m 行` / `(Added|Removed|Modified) · lines n–m`；`activeBlock` 覆盖的 marker `aria-selected="true"` 其余为 `false`；ArrowDown / ArrowUp 环绕步进、Enter 与 Space 重新定位当前块的既有断言仍全绿。
- ac-existing-tests-untouched: `src/core/text/ruler.test.ts`、`src/renderer/src/components/DiffRuler.scale.test.tsx`、`src/renderer/src/components/DiffPane.test.tsx`、`src/renderer/src/views/CodeView.test.tsx`、`src/renderer/src/views/CodeView.ruler.test.tsx`、`src/renderer/src/App.ruler.test.tsx` 零内容改动（`git diff --name-only` 不含这六个文件）且全部通过；本项新增断言落在新文件内。
- ac-gates-green: `pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过。

## 非目标

- 不改 B 的窗口化实现口径：不动 `WINDOW_THRESHOLD`(1000)、`ROW_OVERSCAN`(10)、`DIFF_ROW_HEIGHT`(20)、行级组件 `DiffRowView`、`data-diff-*` 锚点语义，不在窗口分支另起一套行样式。
- 不改 `RULER_BAND_HEIGHT`(4) 的取值口径，不改 `buildRulerBands` 的投影算法与输出契约；不新增 `@core` 像素常量。
- 不按行生成 marker / DOM，不引入逐行变更检测、文本缩略图、语法高亮、扫描 / 哈希 / 文件读取、行模型复制或缓存、长跑 perf harness、新依赖。
- 不改对比与合并算法（`src/core/text/diff.ts`、`merge.ts`）、四态语义、行模型、快照格式；不动三向 `MergePane`。
- 不改 A 项产物 `docs/release-notes/v0.2.10.md`，不碰 `package.json` / `CHANGELOG.md` / `README*` / `docs/**`、版本号与发布通道；不建 tag、不重写已合提交、不动主检出工作树。
- 不新增 click 之外的指针交互（hover / 拖动 / 右键 / 双击 / 滚轮跳块），不改键盘映射，不改工具条按钮行为。
- 不起 browser / 真机 / CDP / L3 复验场，不跑 `pnpm perf:gate`（L3 单场复验属 Product Ops）。

## 实现约束

- 复用 `@core/text/ruler` 已有的 `ratioToRow` / `nearestBlockIndex` / `nearestBlockIndexAtRatio` / `resolveJumpTargetAtRatio`；命中判定逻辑只允许在组件内做「像素 → 比例」这一步，不得在组件里另写一套块距离算法。
- 比例来源：优先 `event.currentTarget.getBoundingClientRect()` 的 `top` 与 `height`；`height <= 0`（jsdom 常见）时退回已实测的 `trackHeight`（`clientHeight`）；`trackHeight <= 0` 或 `rows.length === 0` 时直接返回，不做任何选择。
- marker 保留自身 `onClick` 精确选中并阻止事件冒泡到 track；track 的点击只处理 marker 之外的空白区域，两条路径都只调用一次 `onSelectBlock`。
- marker 可点下限用组件内具名常量表达（与 `RULER_BAND_HEIGHT` 同处，不进 `@core`），渲染时对 `top` 做下推、对 `height` 做夹取，保证不溢出 track；`data-*` 行区间不因视觉下限变化。
- 已合入的 B 事实必须守住：窗口偏移以元素真实 `scrollTop` 为唯一真相源，程序化写 `scrollTop` 后下一次渲染要能折回窗口；本轮只允许为「无需 scroll 事件也跟随」做最小接线修正，不改窗口化框架。
- 350k 用例不得实时跑 `diffLineTexts`：用 `vi.mock('@core/text/diff')` 返回预构造的 `{ rows, blocks }`（与 `CodeView.ruler.test.tsx` 既有手法一致），或以 `DiffRuler` + 两栏 `DiffPane` 的最小装配复刻 `CodeView` 的选中→滚动接线；jsdom 无布局，必须显式桩 `clientHeight`（track 608 / pane 视口）与 `getBoundingClientRect`，断言不依赖 jsdom 恒为 0 的 `scrollHeight`。
- 既有六个测试文件内容零改动是本项回归红线；若某条既有断言与「track 级命中」冲突，先上报，不得改测试凑绿。
