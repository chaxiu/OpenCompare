# diff-ruler-track-hit-click

covers: ac-track-click-hit, ac-track-click-top-end, ac-track-no-dead-zone, ac-scroll-both-panes, ac-marker-click-precedence, ac-zero-blocks-click
标题: 350k 行时点击指示条轨道的任意位置都能命中最近差异块并同步双栏，marker 仍精确选中自身块且不会二次派发，0 块时点击是纯 NO-OP
步骤: 自动化：`pnpm test -- CodeView.rulerTrack` 全绿（`vi.mock('@core/text/diff')` 注入预构造的 350,000 行 / 146 个 modified 块模型，jsdom 桩 track `clientHeight = 608` 与 `getBoundingClientRect = { top: 120, height: 608 }`，pane 视口 400px）→ 实机：打开一对约 350,000 行且每 2,400 行有一段 20 行改动的文本为双栏 Diff（指示条 track 高约 608px）→ 在轨道高度 约 1/2 处、最顶部、最底部各点一次 → 在顶部与底部之间挑十来个明显落在空白（不在任何色带标记上）的位置逐一点击，其中至少 10 次落到与上次不同的块 → 再点其中一个色带标记本身 → 最后打开一对完全相同（或两侧都为空）的文件，点击轨道若干位置
期望: 350k / 608 / 4 下 `clientY = rect.top + 304` 点击轨道，选中的块索引严格等于 `resolveJumpTargetAtRatio(blocks, 304/608, 350000, 20).blockIndex`，工具栏计数显示 `index+1/total`；`clientY = rect.top` 与 `rect.top + 607` 分别对应比例 `0` 与 `607/608` 的解析结果，顶部 → 中部 → 末端块索引按行序单调不减且至少出现两个不同索引；在 `[rect.top, rect.top + 608)` 内均匀取 25 个 `clientY`（含落在 < 1px 桶上、色带渲染高度之外的位置）逐一点击，每次 `onSelectBlock` 都拿到同比例解析出的非负索引，无 NO-OP、无 `-1`，且至少 10 次选中的块与点击前不同；每次命中后左右两栏 `scrollTop` 严格相等且严格等于该块 `startRow × 20`，块内行出现 `border-accent` 描边，工具栏计数与 `DiffBadge` 同步；点击某个色带标记时选中的是该标记覆盖的块（`nearestBlockIndex(blocks, marker.dataset.startRow)`），`onSelectBlock` 只被调用一次（track 级监听不二次触发，否则会跳回轨道顶部比例的块）；0 个差异块时点击轨道任意 y 不抛异常、两栏 `scrollTop` 保持点击前的值（实测 200）不变、计数仍为 `0/0`、指示条与视口窗仍在 DOM 中，控制台无报错或 React key 警告

## 最近执行

- workItemId: wi_ws_50c491d272ec7cd9
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_2ba8b4d3636112d5/code-gates/attempts/001`；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105）。对应自动化断言在 `src/renderer/src/views/CodeView.rulerTrack.test.tsx`（447 行 / 10 例）：`selects the ratio-resolved block when the track itself is clicked`、`maps the track top, middle and end onto monotonic blocks`、`has no dead zone: every track position hits its ratio block and syncs both panes`（25 个均匀 `clientY`，换块次数 ≥ 10）、`keeps a marker click on its own block without a second track selection`、`calls onSelectBlock exactly once for a marker click`、`does not jump or throw when the model has no difference blocks`（全相同 1,200 行与 0 行两例，点击后 `scrollTop` 仍 200、计数 `0/0`、`[data-window-top]` 仍在）。实机点击口径未在本轮复验（属 Product Ops）。
