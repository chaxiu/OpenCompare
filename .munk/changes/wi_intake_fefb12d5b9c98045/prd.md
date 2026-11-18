# 修好发版正文门把 SIGPIPE 当断言失败

## 范围

- `scripts/gate-spawn-outcome.mjs`：补「shell 透出的信号退出」分类。现状只在 `signal` 字段有值时认信号、`status===null` 时认不可归因，因此 `spawnSync` 经 `bash -c` 返回的 `status=141 / signal=null / output=''` 既不重试也不算可归因，直接把偶发红当断言失败（v0.2.25 发版两连红的直接原因，前例 42305357918）。
- `scripts/gate-spawn-outcome.test.mjs` 与 `src/main/release-packaging.test.ts` 的调用侧：让「最多重试 1 次」的口径在 128+N 情形真正生效，且两次 raw outcome 都进失败 detail。
- `docs/lessons.md` 记一行同类口径（本仓库同类红已两次），不改门禁阈值。

## 验收

- ac-signal-mapping: status >= 128 且 signal 为 null 时按 status-128 映射信号名（141→SIGPIPE、137→SIGKILL、143→SIGTERM、134→SIGABRT、139→SIGSEGV），`retryableEnvironmentReason` 返回非 null 且理由含信号名与原始 status；`describeSpawnOutcome` 同步显示该映射。
- ac-retry-once: 调用侧对该类失败最多重试 1 次（`OPENCOMPARE_GATE_SPAWN_RETRIES=0` 时为 0 次），失败 detail 同时给两次的 status/signal/error/output 尾部，不得只留最后一次。
- ac-negative-not-retried: status 为 1/2 等 <128 的真实断言失败一律不重试、仍按断言失败红；status=141 且输出为空的情形重试后仍失败时必须显式红，不得被吞成 skip 或 pass。
- ac-unit-table: `gate-spawn-outcome.test.mjs` 用表驱动覆盖 141/137/143/134/139、status 1、status null + signal SIGPIPE、status null + errorCode EPIPE 四类正反用例，用例数净增，正反都有断言。
- ac-real-run: 本地 `pnpm vitest run scripts/gate-spawn-outcome.test.mjs src/main/release-packaging.test.ts` 绿，36 门全绿，不缩规模、不改全局 testTimeout、不加 ignore 指令。
- ac-doc: `docs/lessons.md` 追加一行「spawn 结果分类必须覆盖 shell 透出的 128+N 信号退出」，不动其历史条目。

## 非目标

- 不改 `release.yml` 的 job 结构、超时、签名步骤，不改 gate 脚本的断言语义（哪些正文该红仍然是红）。
- 不改产品运行时代码，不新增依赖，不动版本锚点 / 发布说明 / CHANGELOG。

## 实现约束

- 分类逻辑收敛在 `gate-spawn-outcome.mjs` 一处纯函数，调用侧只消费结论；`spawnSync` 的原始 status/signal/errorCode 永远随结果一起传递。
- 只允许「客观环境类失败最多重试 1 次且两次留证」，断言失败不得重试；不得整场测试重跑凑绿。

## 本单执行约束（不 fold）

- 单条写项按一个 ≤150K 上下文交付：先落纯函数 + 单测，再动调用侧，再全量门。
- 授权路径：`scripts/gate-spawn-outcome.mjs`、`scripts/gate-spawn-outcome.test.mjs`、`src/main/release-packaging.test.ts`、`docs/lessons.md`。
- 停手线：任何需要改 `release.yml`、放宽正文门断言或改全局 testTimeout 的路径，一律停手上报。
- 交付回执点名：新增 / 改写的用例清单、`latestAttemptId`、`mergeTreeSha`，以及「141 一次红 → 重试一次 → 绿」或「两次红 → 可归因失败」的实测输出。
