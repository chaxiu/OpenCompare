# diff-ruler-marker-floor-and-window-follow

covers: ac-marker-min-height-clamped, ac-window-follows-click-without-scroll-event, ac-350k-dom-bounded, ac-projection-once-no-per-row
标题: marker 有 2px 可点下限且不溢出轨道、点击轨道后窗口无需 scroll 事件即跟随到目标行、350k 下 DOM 与投影次数仍有界
步骤: 自动化：`pnpm test -- CodeView.rulerTrack` 全绿（jsdom 桩 track 608 / pane 视口 400 / 两栏 `div.h-full.overflow-auto`，`buildRulerBands` 透传 spy 计数；`vi.mock('@core/text/diff')` 注入预构造 350k 模型，全程不派发 `scroll` 事件）→ 实机：打开约 350,000 行的双栏 Diff → 打开开发者工具确认单栏 `[data-diff-row]` 数量与内容容器高度 → 点击指示条轨道中部命中一个远端差异块（不要先滚过去）→ 观察两栏是否立刻停在目标块首行、视口内是否有空白 → 再检查 marker 的可见高度（放大截图 / 读 `style.height`）
期望: 350k / 608 / 4 下渲染出的 marker 数量等于 `buildRulerBands` 返回的 band 数，且确有 band 原始高度 < 2px；每个 marker 渲染 `height >= 2`（组件内 `RULER_MARKER_MIN_HEIGHT`）、`top >= 0`、`top + height <= 608 + 1e-6`（下限把 marker 变高 / 下推后仍不得顶出轨道）；`data-start-row` / `data-end-row` / `data-diff-status` 仍与投影结果逐条一致（视觉下限不改变 band 语义，也不改变 `aria-label` 里的行区间）；点击轨道命中远距离块后，在不派发任何 `scroll` 事件的前提下，两栏 `scrollTop` 相等且等于块 `startRow × 20`，两栏内容容器 `data-diff-window-start` 都等于该块 `startRow`，`[data-diff-row="{startRow}"]` 行元素存在、左栏文本含该行号、右栏文本为改动后的内容（即程序化写 `scrollTop` 后窗口靠元素真实 `scrollTop` 折回）；同一 350k 渲染中每栏 `[data-diff-row]` 数量 ≤ `ceil(400/20) + 2 × 10 = 40` 且两栏相等，两栏内容总高都等于 `350000 × 20 = 7,000,000`（`data-diff-content-height` 与 `style.height` 双读一致），指示条内 `[data-diff-row]` 为 0 个；`buildRulerBands` 在每次实测轨道高（608）只被调用 1 次，随后两次轨道点击 + 一次滚动 + 一次 `fireEvent.scroll` 后调用次数不增、marker 数不变；marker 数 ≤ `3 × floor(608/4) = 456`，指示条 `textContent` 去空白后为空（无逐行文本）

## 最近执行

- workItemId: wi_ws_50c491d272ec7cd9
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_2ba8b4d3636112d5/code-gates/attempts/001`）。对应断言在 `src/renderer/src/views/CodeView.rulerTrack.test.tsx`：`paints every marker at the clickable floor without leaving the track`（含 `bands.some(band => band.height < 2)` 前置证明确有亚像素 band）、`projects once per measured track and never per row or per click`（`buildRulerBands` 透传 spy 计数不增、marker ≤ 456、`textContent` 为空）、`follows a track click into the rendered window without any scroll event`（两侧 `data-diff-window-start === startRow` 且行文本核对）、`keeps both panes windowed with the exact rows × 20 content height`（每栏 ≤ 40 行、`7,000,000` 两栏相等、指示条内 `[data-diff-row]` 为 0）。生产改动仅 `DiffRuler.tsx`（新增 `RULER_MARKER_MIN_HEIGHT` 与夹取）与 `CodeView.tsx`（`scrollToBlock` 于 `setActive` 前写入）；`DiffPane.tsx` 零 diff，窗口跟随仍走 B 的 `useLayoutEffect` 折回路径。
