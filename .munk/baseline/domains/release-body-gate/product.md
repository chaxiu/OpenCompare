# Domain: release-body-gate

发布 `finalize` 双语 body gate 的**测试执行面**：载体是 `src/main/release-packaging.test.ts`，失败分类与格式化收敛在 `scripts/gate-spawn-outcome.mjs`（配 `.d.mts` 声明，单测 `scripts/gate-spawn-outcome.test.mjs`）。本域管「插桩 / 高负载下 body gate 失败必须可归因、只在客观环境信号上做有界重试、不得靠重跑凑绿」；body 文案组装与顺序归 `release`，finalize 先验证后公开与公开唯一性归 `release-publish-gate`，覆盖率测量与预检复用归 `coverage-baseline`，门禁矩阵形状归 `quality-gates`。

## 范围

- **spawn 结果形状**：`runInTemp` 返回 `{ status: number | null, signal, errorCode, errorMessage, output }`（`output` = stdout + stderr 原文），失败断言一律经 `describeSpawnOutcome(result, label)` 打印 `status=… signal=… error.code=… error.message=…` 与 stdout/stderr 末 20 行尾部，禁止用「flaky」一句话代替归因。
- **环境类重试 allowlist**：`retryableEnvironmentReason` 只对 `ENV_FAILURE_CODES`（EAGAIN / EMFILE / ENFILE / ENOMEM / EINTR / ETIMEDOUT / ECONNRESET / ECONNREFUSED / ENETUNREACH / EHOSTUNREACH / EAI_AGAIN / ENOSPC / EPIPE）、`KILL_SIGNALS`（SIGKILL / SIGTERM / SIGABRT / SIGPIPE / SIGSEGV）与「无 status、无 signal、无输出」的空 spawn 返回原因；断言不满足、脚本逻辑失败、普通非零退出一律返回 `null`、不重试。
- **shell 128+N 信号退出**：经 `bash -c` 报信号退出时 `spawnSync` 给 `status = 128 + N` 且 `signal === null`（管道断开即 141）。`signalFromExitStatus(status)` 按 `EXIT_SIGNALS` 表（129 SIGHUP … 143 SIGTERM，未登记者回退 `SIG${status-128}`）映射信号名；映射到非 null 即计入客观环境类失败，可重试。`describeSpawnOutcome` 在 `signal === null` 且 status ≥ 128 时追加 `, shell exit <status> => <SIG…>`，原始 status / signal 仍原样打印。
- **尝试次数上限**：重试循环只有一份实现 `runWithEnvironmentRetry(once, { env, label, onRetry })`，`bodyGateAttempts(env)` 默认 2 次（一次有界重试），`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 时 1 次；返回 `{ outcome, attempts, retryReasons, attemptDetails }`，`attemptDetails` 保留**每一次**原始 outcome 的 `describeSpawnOutcome` 文本。`runBodyGate` 把 `attempts` / `retryReasons` / `attemptDetails` 一并交给断言，重试耗尽的失败照常抛错，绝不让 env 失败满足 `nonzero` 负向期望。
- **maxBuffer 与插桩超时**：body gate 的 `spawnSync` 显式 `maxBuffer: 8 * 1024 * 1024`；`published release body gate` 的两个用例各自声明 per-test 超时（顺序断言 60 s、`it.each` 负向用例 120 s），`vitest.config.mts` 全局 `testTimeout` 不动。
- **零删减**：该文件用例数与既有断言不减少、不弱化；负向用例仍要求真实非零退出（`status !== null && !== 0`），token 出现 / 缺失断言原样保留。
- **落点文件**：`src/main/release-packaging.test.ts`（最小行级修改）、`scripts/gate-spawn-outcome.mjs`、`scripts/gate-spawn-outcome.d.mts`、`scripts/gate-spawn-outcome.test.mjs`（由既有 `scripts/**/*.test.mjs` include 进入 `test` 门，不新增门禁）。

## 验收

- **ac-body-gate-status-error**：`runBodyGate` 结果携带并输出 `status`、`error.code`、`error.message`、`signal`，并附 `attemptDetails`（每次尝试一段）；断言失败消息含这些字段与 stdout/stderr 尾部，能区分「断言不满足」「退出码非零但无 spawn error」「spawnSync 环境失败（error 存在，或 status 为 null 且无 signal）」。
- **ac-body-gate-retry**：仅对 allowlist 内的环境类错误、shell `128+N` 信号退出与空 spawn 返回重试，总尝试次数 ≤3；断言失败与普通非零退出不重试；`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 可关闭重试；重试耗尽后抛错失败。
- **ac-signal-mapping**：`status >= 128` 且 `signal === null` 时按 `status-128` 映射信号名（141→SIGPIPE、137→SIGKILL、143→SIGTERM、134→SIGABRT、139→SIGSEGV），`retryableEnvironmentReason` 返回非 null 且理由含信号名与原始 status；`describeSpawnOutcome` 同步显示该映射；`status < 128` 不产生映射。
- **ac-retry-once**：调用侧对该类失败最多重试 1 次（`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 时为 0 次），失败 detail 同时给两次的 status/signal/error/output 尾部（`attemptDetails`），不得只留最后一次。
- **ac-negative-not-retried**：status 为 1/2 等 `<128` 的真实断言失败一律不重试、仍按断言失败红；status=141 且输出为空的情形重试后仍失败时必须显式红，不得被吞成 skip 或 pass；`status === null` + 直接 signal / `errorCode` 两类仍走既有 allowlist 判定。
- **ac-unit-table**：`scripts/gate-spawn-outcome.test.mjs` 用表驱动覆盖 141/137/143/134/139、status 1、status null + signal SIGPIPE、status null + errorCode EPIPE 四类正反用例，用例数净增，正反都有断言。
- **ac-body-gate-maxbuffer**：body gate 的 `spawnSync` 显式设置 `maxBuffer`（≥8 MiB），不依赖默认值。
- **ac-body-gate-timeout**：`published release body gate` 在覆盖率插桩下显式声明 per-test 超时；`vitest.config.mts` 全局 `testTimeout` 不变；该文件用例数量与断言不减少、不弱化。
- **ac-local-cold-run**：本地冷跑 `pnpm exec vitest run scripts/gate-spawn-outcome.test.mjs src/main/release-packaging.test.ts` 全绿，超时声明生效；不缩规模、不改全局 `testTimeout`、不加 ignore 指令。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm test` 自绿；新增的 `gate-spawn-outcome` 逻辑由 `scripts/gate-spawn-outcome.test.mjs` 覆盖，不新增 exclude、不改既有门禁条目。
- **ac-evidence**：交付附本地冷跑原始输出（用例数 / 耗时 / 退出码），以及「141 一次红 → 重试一次 → 绿」与「两次红 → 可归因失败」两种实测输出。
- **ac-doc**：`docs/lessons.md` 追加一行「spawn 结果分类必须覆盖 shell 透出的 128+N 信号退出」，不动其历史条目。

## 非目标

- 不改 body 组装 / 折叠 / 校验文案与 `finalize` 步骤顺序（归 `release` / `release-publish-gate`），不改 `src/main/__fixtures__/release-packaging.json`。
- 不改 `.github/workflows/**`（含 `release.yml` 的 job 结构 / 超时 / 签名步骤）、不改发布脚本、不动 tag / Release / 资产。
- 不放宽既有断言、不删用例、不改全局 `testTimeout`、不把该文件扩成长跑门禁。
- 不改产品运行时代码，不新增依赖，不动版本锚点 / 发布说明 / CHANGELOG。
- 不改覆盖率测量口径、地板、baseline 与预检复用逻辑（归 `coverage-baseline`）。

## 实现约束

- **归因单一实现**：分类、格式化与重试循环只在 `scripts/gate-spawn-outcome.mjs`（`describeSpawnOutcome` / `retryableEnvironmentReason` / `bodyGateAttempts` / `signalFromExitStatus` / `runWithEnvironmentRetry`），测试文件只 import 消费；`.d.mts` 同步声明，禁止在测试内再写一份内联判定。
- **重试有界可关**：默认 2 次、`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 关闭；断言失败与普通非零退出零重试，绝不把 env 失败当 `nonzero` 证据；原始 status / signal / errorCode 永远随结果与 `attemptDetails` 一起传递。
- **日志可归因**：每次重试的失败都经 `console.warn` 打印完整 `describeSpawnOutcome` 与 `retry reason`，stdout/stderr 保留末 20 行原文。
- **最小行级修改**：只改 body gate 相关路径（`runInTemp` 结果形状、`runBodyGate` 消费 `runWithEnvironmentRetry`、`spawnSync` 选项、两个用例的超时参数），不整文件重写。
- **门禁纪律**：`test-debt` 按 ratchet 更新 `growth`（脚本行数增量 + 新增用例），不得为凑绿放宽既有门。

## 最近交付证明

- WI：`wi_intake_fefb12d5b9c98045`（`kind: chore`）——补 shell `128+N` 信号退出分类：`gate-spawn-outcome.mjs` 新增 `SIGNAL_EXIT_BASE` / `EXIT_SIGNALS` / `signalFromExitStatus`，`retryableEnvironmentReason` 对 `signal===null && status>=128` 返回含信号名与原始 status 的理由，`describeSpawnOutcome` 追加 `shell exit <status> => <SIG…>`，`KILL_SIGNALS` 补 SIGPIPE / SIGSEGV；重试循环收敛为单一实现 `runWithEnvironmentRetry`（返回 `outcome/attempts/retryReasons/attemptDetails`），`release-packaging.test.ts` 的 `runBodyGate` 只消费它并把两次 `attemptDetails` 全量拼进失败 detail。`docs/lessons.md` §16 记同类口径；断言语义、`release.yml`、全局 `testTimeout` 未改。`deliveryIntent: local merge`。
- 结果：`scripts/gate-spawn-outcome.test.mjs` 表驱动新增 141/137/143/134/139、status 1、`signal null + SIGPIPE`、`status null + EPIPE` 正反用例；本单 `code_gates` 全 36 门通过（含 `lint` / `typecheck` / `test` / `verify-release-gate` / `test-debt-gate`）。
- 注：本 change pack 无 `tests/cases/**` / `tech.md` / `ux/**`，无 qa 用例 copy、无 tech / ux 手合；覆盖率预检复用与地板归 `coverage-baseline`。
