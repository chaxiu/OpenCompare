# diff-ruler-scale-timeout-green

covers: ac-single-file-green, ac-full-suite-green, ac-gates-green
标题: 单文件 8 例、全量 69 files / 1104 passed 与 9 道 code_gates 全绿，耗时记录可核
步骤: 自动化：`pnpm test src/renderer/src/components/DiffRuler.scale.test.tsx` → 记录 `Tests 8 passed (8)` 与目标用例 / 文件耗时 → 全量 `pnpm test` → 记录 files / passed / skipped / 总耗时 → 跑 `.munk/code-gates.json` 的 9 道 gate（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `cancel-gate` / `memory-gate`）→ 读 `.munk/runs/{runId}/code-gates/attempts/001/manifest.json` 核对 9 项 status 与 exitCode
期望: 单文件命令退出码 0、输出 `Tests 8 passed (8)`，交付说明记录目标用例实测耗时（非新起 5000ms 超时错误）；全量 `pnpm test` 退出码 0、`69 passed (69)` files / `1104 passed`（1 skipped 为既有），交付说明记录总耗时；9 道 gate 全部 exitCode 0，`manifest.summary = code_gates passed (9 gates, attempt 001)` 且 `failedGateIds` 为空；关键证据落在 `.munk/runs/{runId}/code-gates/attempts/001/` 的 `.log` 与 `.result.json`；全程未出现 `Error: Test timed out in 5000ms.`

## 最近执行

- workItemId: wi_ws_b21636d826817b53
- at: 2026-10-29
- status: pass
- note: Host `code_gates` attempt 001 九道门禁全 passed（`manifest.summary = "code_gates passed (9 gates, attempt 001)"`，`failedGateIds: []`）。`test` 门禁日志：`DiffRuler.scale.test.tsx (8 tests) 2198ms`、`Test Files 69 passed (69)`、`Tests 1104 passed | 1 skipped (1105)`、`Duration 27.85s`（对照基线 27.42s），全程无 5000ms 超时错误。证据：`.munk/runs/run_ws_d422ee9477454a47/code-gates/attempts/001/`。
