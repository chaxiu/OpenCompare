# diff-ruler-scale-timeout-explicit

covers: ac-target-explicit-timeout, ac-comment-cites-evidence, ac-no-global-timeout-config
标题: 358k 行逐行覆盖用例拿到显式 30s per-test 超时，注释带实测依据，全局默认超时不变
步骤: 自动化：读 `src/renderer/src/components/DiffRuler.scale.test.tsx`，定位唯一描述串 `covers every non-same row with a same-status marker in one synchronised pass` 的 `it(` 调用，检查其闭合为 `}, 30_000)`（正则 / AST 均可）→ 检查该 `it(` 上方附近注释是否同时出现字面量 `6,816` 与 `27.42` 且说明「显式 30s / 358k 规模与覆盖不变」→ `git diff --name-only` 确认 `vitest.config.mts` 未被改动，`grep -c "testTimeout\|hookTimeout" vitest.config.mts` == 0 → 对照 `src/renderer/src/components/TreeView.test.tsx` 既有 `}, 30_000)` 写法确认风格一致
期望: 目标 `it(...)` 第三个参数为 `30_000`，闭合逐字为 `}, 30_000)`，该描述串全文件唯一且仍逐字未变；用例附近注释包含 `6,816`（CI attempt1 实测毫秒）与 `27.42`（本机全量秒）两个字面量，并写明 30s 相对 6.8s 约 4.4x 余量、358,000 规模与断言覆盖不变；`vitest.config.mts` 零 diff，其 `test` 配置块内不存在 `testTimeout` / `hookTimeout` 键（grep 计数 0），默认 5000ms 全局口径保持；除该文件外没有任何测试或配置文件被改动

## 最近执行

- workItemId: wi_ws_b21636d826817b53
- at: 2026-10-29
- status: pass
- note: 本轮 `needSelfTest=false`，以 Host `code_gates` 为交付门槛（attempt 001 九道门禁全 passed，`.munk/runs/run_ws_d422ee9477454a47/code-gates/attempts/001/`）。实测：目标 `it(` 闭合已为 `}, 30_000)`；注释含 `6,816ms` 与 `27.42s` 两个快照；`grep -c "testTimeout\|hookTimeout" vitest.config.mts` = 0 且该文件零 diff；写法与 `TreeView.test.tsx` 既有 `}, 30_000)` 一致。
