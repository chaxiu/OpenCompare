# Domain: release-body-gate

发布 `finalize` 双语 body gate 的**测试执行面**：载体是 `src/main/release-packaging.test.ts`，失败分类与格式化收敛在 `scripts/gate-spawn-outcome.mjs`（配 `.d.mts` 声明，单测 `scripts/gate-spawn-outcome.test.mjs`）。本域管「插桩 / 高负载下 body gate 失败必须可归因、只在客观环境信号上做有界重试、不得靠重跑凑绿」；body 文案组装与顺序归 `release`，finalize 先验证后公开与公开唯一性归 `release-publish-gate`，覆盖率测量与预检复用归 `coverage-baseline`，门禁矩阵形状归 `quality-gates`。

## 范围

- **spawn 结果形状**：`runInTemp` 返回 `{ status: number | null, signal, errorCode, errorMessage, output }`（`output` = stdout + stderr 原文），失败断言一律经 `describeSpawnOutcome(result, label)` 打印 `status=… signal=… error.code=… error.message=…` 与 stdout/stderr 末 20 行尾部，禁止用「flaky」一句话代替归因。
- **环境类重试 allowlist**：`retryableEnvironmentReason` 只对 `ENV_FAILURE_CODES`（EAGAIN / EMFILE / ENFILE / ENOMEM / EINTR / ETIMEDOUT / ECONNRESET / ECONNREFUSED / ENETUNREACH / EHOSTUNREACH / EAI_AGAIN / ENOSPC / EPIPE）、`KILL_SIGNALS`（SIGKILL / SIGTERM / SIGABRT）与「无 status、无 signal、无输出」的空 spawn 返回原因；断言不满足、脚本逻辑失败、普通非零退出一律返回 `null`、不重试。
- **尝试次数上限**：`bodyGateAttempts(env)` 默认 2 次（一次有界重试），`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 时 1 次；`runBodyGate` 把 `attempts` / `retryReasons` 一并交给断言，重试耗尽的失败照常抛错，绝不让 env 失败满足 `nonzero` 负向期望。
- **maxBuffer 与插桩超时**：body gate 的 `spawnSync` 显式 `maxBuffer: 8 * 1024 * 1024`；`published release body gate` 的两个用例各自声明 per-test 超时（顺序断言 60 s、`it.each` 负向用例 120 s），`vitest.config.mts` 全局 `testTimeout` 不动。
- **零删减**：该文件用例数与既有断言不减少、不弱化；负向用例仍要求真实非零退出（`status !== null && !== 0`），token 出现 / 缺失断言原样保留。
- **落点文件**：`src/main/release-packaging.test.ts`（最小行级修改）、`scripts/gate-spawn-outcome.mjs`、`scripts/gate-spawn-outcome.d.mts`、`scripts/gate-spawn-outcome.test.mjs`（由既有 `scripts/**/*.test.mjs` include 进入 `test` 门，不新增门禁）。

## 验收

- **ac-body-gate-status-error**：`runBodyGate` 结果携带并输出 `status`、`error.code`、`error.message`、`signal`；断言失败消息含这四字段与 stdout/stderr 尾部，能区分「断言不满足」「退出码非零但无 spawn error」「spawnSync 环境失败（error 存在，或 status 为 null 且无 signal）」。
- **ac-body-gate-retry**：仅对 allowlist 内的环境类错误与空 spawn 返回重试，总尝试次数 ≤3；断言失败与普通非零退出不重试；`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 可关闭重试；重试耗尽后抛错失败。
- **ac-body-gate-maxbuffer**：body gate 的 `spawnSync` 显式设置 `maxBuffer`（≥8 MiB），不依赖默认值。
- **ac-body-gate-timeout**：`published release body gate` 在覆盖率插桩下显式声明 per-test 超时；`vitest.config.mts` 全局 `testTimeout` 不变；该文件用例数量与断言不减少、不弱化。
- **ac-local-cold-run**：本地冷跑 `pnpm exec vitest run src/main/release-packaging.test.ts` 全绿（实测 1 file / 361 tests / 4.60 s），插桩跑同文件全绿（4.76 s），超时声明生效。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm test` 自绿；新增的 `gate-spawn-outcome` 逻辑由 `scripts/gate-spawn-outcome.test.mjs` 覆盖，不新增 exclude、不改既有门禁条目。
- **ac-evidence**：交付附本地冷跑与插桩跑原始输出（用例数 / 耗时 / 退出码），以及一次环境类失败路径的 `describeSpawnOutcome` + `retry reason` 日志样例。

## 非目标

- 不改 body 组装 / 折叠 / 校验文案与 `finalize` 步骤顺序（归 `release` / `release-publish-gate`），不改 `src/main/__fixtures__/release-packaging.json`。
- 不改 `.github/workflows/**`、不改发布脚本、不动 tag / Release / 资产。
- 不放宽既有断言、不删用例、不改全局 `testTimeout`、不把该文件扩成长跑门禁。
- 不改覆盖率测量口径、地板、baseline 与预检复用逻辑（归 `coverage-baseline`）。

## 实现约束

- **归因单一实现**：分类与格式化只在 `scripts/gate-spawn-outcome.mjs`，测试文件只 import 消费；`.d.mts` 同步声明，禁止在测试内再写一份内联判定。
- **重试有界可关**：默认 2 次、`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 关闭；断言失败与普通非零退出零重试，绝不把 env 失败当 `nonzero` 证据。
- **日志可归因**：每次重试的失败都经 `console.warn` 打印完整 `describeSpawnOutcome` 与 `retry reason`，stdout/stderr 保留末 20 行原文。
- **最小行级修改**：只改 body gate 相关路径（`runInTemp` 结果形状、`runBodyGate` 重试循环、`spawnSync` 选项、两个用例的超时参数），不整文件重写。
- **门禁纪律**：`test-debt` 按 ratchet 更新 `growth`（脚本行数增量 + 新增用例），不得为凑绿放宽既有门。

## 最近交付证明

- WI：`wi_intake_cc2d80c26105c499`（`kind: chore`）——body gate spawn 可归因：新增 `scripts/gate-spawn-outcome.mjs` / `.d.mts` / `.test.mjs`（`describeSpawnOutcome` / `retryableEnvironmentReason` / `bodyGateAttempts`），`release-packaging.test.ts` 的 `runInTemp` 带出 `status/signal/errorCode/errorMessage`，body gate 走一次有界重试 + 显式 `maxBuffer: 8 MiB`，两个 body gate 用例声明 60 s / 120 s per-test 超时；`test-debt.json` 的 `repoTestLines` 52,352 → 52,395（`growth` +43、`addedCases` 1）。日期：2026-11-07；`deliveryIntent: local merge`。
- 结果：`pnpm exec vitest run src/main/release-packaging.test.ts` 1 file / 361 tests passed / 4.60 s；覆盖率插桩同文件 361 passed / 4.76 s（`Coverage enabled with v8`）；全局 `testTimeout` 与 `vitest.config.mts` 未改。
- 证据：`.munk/changes/wi_intake_cc2d80c26105c499/evidence/local-cold-run.log`、`instrumented-run.log`。
- 注：本 change pack 无 `tests/cases/**` / `tech.md` / `ux/**`，无 qa 用例 copy、无 tech / ux 手合；预检复用侧归 `coverage-baseline`。
