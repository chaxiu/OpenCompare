# diff-ruler-track-hit-regression-gates

covers: ac-keyboard-and-aria-preserved, ac-existing-tests-untouched, ac-gates-green
标题: 轨道级命中不破坏指示条既有键盘 / ARIA 契约与六个既有测试文件，三道门禁全绿
步骤: 自动化：`git diff --name-only` 核对变更面 → `pnpm test -- CodeView.ruler` / `pnpm test -- DiffRuler` / `pnpm test -- DiffPane` / `pnpm test -- App.ruler` / `pnpm test -- ruler` 逐个跑 → 读 `App.ruler.test.tsx` 与 `CodeView.ruler.test.tsx` 中键盘 / ARIA 断言逐条确认仍生效 → `pnpm typecheck`、`pnpm lint`、`pnpm test`（全量）→ 实机：Tab 聚焦指示条后按 ArrowUp / ArrowDown / Enter，并用读屏 / DevTools 无障碍面板检查轨道与 marker 名称
期望: `git diff --name-only` 中不含 `src/core/text/ruler.test.ts`、`src/renderer/src/components/DiffRuler.scale.test.tsx`、`src/renderer/src/components/DiffPane.test.tsx`、`src/renderer/src/views/CodeView.test.tsx`、`src/renderer/src/views/CodeView.ruler.test.tsx`、`src/renderer/src/App.ruler.test.tsx`（本项新增断言全部落在 `src/core/text/ruler.hit.test.ts` 与 `src/renderer/src/views/CodeView.rulerTrack.test.tsx`）；轨道仍有 `role="listbox"`、`tabIndex=0`、zh `aria-label="差异指示条"` / en `"Difference ruler"`，marker 仍 `role="option"` 且 `aria-label` 匹配 zh `^(新增|删除|修改) · 第 \d+–\d+ 行$` / en `^(Added|Removed|Modified) · lines \d+–\d+$`，`activeBlock` 覆盖的 marker `aria-selected="true"` 其余 `false`；ArrowDown / ArrowUp 环绕步进、Enter 与 Space 重新定位当前块的既有断言全部仍绿（轨道新增 click 监听不得吞掉键盘事件、不得改变焦点环）；六个既有文件零内容改动且全部通过，`pnpm test`、`pnpm typecheck`、`pnpm lint` 三道门禁 exit 0；`src/core/text/ruler.ts` / `src/core/text/diff.ts` / `DiffPane.tsx` / `SplitPane.tsx` / `MergePane.tsx` 在此项 diff 中零改动

## 最近执行

- workItemId: wi_ws_50c491d272ec7cd9
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，以 Host `code_gates` 为交付门槛：9 条门禁 attempt 001 全部 passed（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `test:cancel` / `test:memory`），证据 `.munk/runs/run_ws_2ba8b4d3636112d5/code-gates/attempts/001/{lint,typecheck,test}.log` 与同名 `.result.json`；`pnpm test` 69 files / 1104 passed / 1 skipped / 1105。变更面实测仅 2 个生产文件 `src/renderer/src/components/DiffRuler.tsx`（+51/−6 量级）与 `src/renderer/src/views/CodeView.tsx`（+22/−6 量级）+ 2 个新测试文件，六个既有测试文件与 `ruler.ts` / `diff.ts` / `DiffPane.tsx` / `SplitPane.tsx` / `MergePane.tsx` 零 diff，键盘 / ARIA 断言由 `CodeView.ruler.test.tsx` 与 `App.ruler.test.tsx` 原样继续覆盖。实机键盘与读屏口径未在本轮复验（属 Product Ops）。
