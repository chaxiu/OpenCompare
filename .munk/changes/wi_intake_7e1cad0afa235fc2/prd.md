# src/core 覆盖率基线治理：先测后钉（实测判定不钉地板）

## 范围

- 只覆盖 `src/core/**` 下 22 个纯模块、合计 7,559 行：`text/{diff,normalize,merge,probe,lines,ruler}.ts`、`directory/{snapshot,compare,report,rows,filter,template,hash,sync}.ts`、`structured/{diff,locate,locateFallback,locateLine,parse}.ts`、`csv/align.ts`、`theme/contrast.ts`、`io.ts`。
- 在 worktree（`b83511f`）内用既有 `@vitest/coverage-v8@5.0.5` 真跑一次全量 `vitest run --coverage`，provider v8，`include=src/core/**`，排除 `*.test.ts` / `*.test.tsx` / `__fixtures__`。
- 把 22 个模块的 `lines` / `branches` / `functions` 实测量写入 `.munk/baseline/coverage.json`，连同总量、测量命令、commit、排除项、ignore 计数一起留档。
- 按决策闸给出「是否钉地板」的结论并留证据；本轮实测结论见「实现约束」。
- 交付一份可复核报告：core 总量 + 22 行模块表 + 判定与理由 + 证据绝对路径（注明根目录映射）。

## 验收

- ac-baseline-22-modules: `.munk/baseline/coverage.json` 的模块集合与 `src/core/**` 下 22 个非测试 `.ts` 文件完全相等（无多、无缺）；不包含 `*.test.ts`、`__fixtures__/**`、纯类型 / `.d.ts` 条目；每个条目都有数值型 `lines` / `branches` / `functions`。
- ac-baseline-matches-evidence: baseline 中每个模块与 core 总量的百分比，与同一次运行的 `coverage-summary.json` 两位小数逐条相等；core 总量为 lines 98.12% (2090/2130)、branches 90.27% (1346/1491)、functions 99.5% (402/404)。
- ac-coverage-command-recorded: 证据里逐字记录唯一测量命令，包含 `--coverage.provider=v8`、`--coverage.include=src/core/**`、`--coverage.exclude=**/*.test.ts`、`--coverage.exclude=**/*.test.tsx`、`--coverage.exclude=**/__fixtures__/**`、`--coverage.reporter=text,lcov,json-summary`；原始日志含 `Coverage enabled with v8`、`Test Files 125 passed`、`Tests 2025 passed | 1 skipped`，退出码 0。
- ac-reproducible: 在 `b83511f` 上用同一命令冷跑复测，core 总量与 22 个模块的 lines / branches / functions 与 baseline 逐项一致（整数分子分母也一致）；出现差异必须停手如实写「未闭环」，不得改数字或换口径凑齐。
- ac-decision-inputs: 报告写出决策闸的两个输入：core 整体 branches 90.27% ≥ 85%，且单模块最低 branches 为 `theme/contrast.ts` 75.00% ≥ 60%；据此判定「只留报告、不钉地板」。
- ac-no-gate-added: 本轮不新增 `coverage-core` 门：`.munk/code-gates.json` 保持 version 1、恰 27 道门、无 `coverage-core`；`scripts/` 不新增覆盖率门脚本；`vitest.config.mts` 不新增 coverage thresholds / include / exclude 配置。
- ac-no-test-or-source-change: 本项 `git diff --name-only` 在 `src/**`、`scripts/**`、`vitest.config.mts` 上为空；`src/core` 内 `/* v8 ignore */` 与 `c8 ignore` 计数保持 0（baseline 记为天花板，只许降）；不新增覆盖率 exclude 模式、不拆文件改分子分母、不写空断言。
- ac-no-release-surface-change: `package.json` version、`CHANGELOG.md`、README 版本表、`.github/workflows/release.yml` dispatch 默认 tag、当前版 release notes、`docs/release-evidence/**` 零 diff；不改已公开 tag / Release / 资产。
- ac-report-tables: 交付报告包含 core 总量四项与 22 行模块表（lines / branches / functions），并给出证据绝对路径且注明根目录映射为 worktree 还是产品目录，禁止只给 worktree 解析不到的相对路径。
- ac-release-window-lock: `code_gates` 在 v0.2.19 公开之前全绿时，不交棒 delivery、不合入 main；改为 `munk_report_owner` 报告「门已绿、等你放行合并」，等 Owner 放行后才走 delivery。
- ac-no-renderer-floor: renderer 与 jsdom 的覆盖率不设地板、阈值或 gate；不改 `src/renderer/**` 与测试环境配置。

## 非目标

- 不给 renderer / jsdom 设覆盖率地板或阈值（DOM 断言与分支覆盖不是一回事，设了只会诱导空断言）。
- 不新增测试、不写空断言、不重构、不拆文件、不为提升覆盖率改产品行为。
- 不追求把 22 个模块刷到 100%；本轮只做基线测量与判定。
- 不把覆盖率跑进 release 的 Quality gates job（该 job 现约 3 分钟，本次实测单次覆盖约 38 s，仍不接）。
- 不做 Q6 测试清债动作（本轮不改测试文件，Q6 前置门不触发）。
- 不动发布语义单点与已公开 tag / Release / 资产，不写 release notes 提治理。

## 实现约束

### 1. 执行顺序（硬要求：先测后钉）

1. worktree 内 `pnpm install --frozen-lockfile`（主检出曾缺 `@vitest/coverage-v8@5.0.5`，但 `package.json` 与 `pnpm-lock.yaml` 均已有；不得新增依赖）。
2. 跑一次全量覆盖率，命令固定为：
   `pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.include='src/core/**' --coverage.exclude='**/*.test.ts' --coverage.exclude='**/*.test.tsx' --coverage.exclude='**/__fixtures__/**' --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary --coverage.reportsDirectory=<证据目录>`
3. 按 22 个模块把 `lines` / `branches` / `functions` 写进 `.munk/baseline/coverage.json`。
4. 走决策闸：`branches ≥ 85% 且无单模块 < 60%` ⇒ 只留报告、不钉地板；`有模块 < 50%` ⇒ 报告即下一条 goal 加真断言的依据，列缺口、不钉地板；其余情形才考虑接门。
5. 只有第 4 步判定要钉地板，才把 gate id `coverage-core` 写进 `.munk/code-gates.json` 并跑 worktree 全量门；本轮实测判定**不接门**，因此第 5 步不执行。

### 2. Intake 已在 `b83511f` 实测（Coding 必须复现，不得直接抄结论）

- 根目录映射：worktree，`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_7e1cad0afa235fc2`（**不是**产品主检出面）。
- 实测证据目录（绝对路径）：
  `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_7e1cad0afa235fc2/.munk/changes/wi_intake_7e1cad0afa235fc2/evidence/coverage/`
  其中 `coverage-summary.json`、`lcov.info`（22 个 `SF:` 条目）、原始日志 `../coverage-run.log`。
- 实测耗时：墙钟 37.84 s（`/usr/bin/time -p` real），Vitest 自报 Duration 36.50 s；测试 125 files / 2,025 passed + 1 skipped。
- core 总量：lines 98.12%（2090/2130）、branches 90.27%（1346/1491）、functions 99.5%（402/404）、statements 96.39%（2351/2439）。
- 单模块最低值：`theme/contrast.ts` branches 75.00%；其余模块 branches 均 ≥ 83.07%。无任何模块任一项 < 50%。
- `src/core` 内 `/* v8 ignore */` / `c8 ignore` 计数：0。

### 3. `.munk/baseline/coverage.json` 约定

- 必须含：`version`、`measuredAt {commit, date}`、`command`、`provider: "v8"`、`scope {include, exclude}`、`ignoreDirectives {v8, c8}`、`totals {lines, branches, functions, statements 的 pct 与 covered/total}`、`modules { "<相对路径>": {lines, branches, functions[, statements]} }`、`decision {floor: false, reason, thresholds}`。
- `measuredAt.commit` 必须是本 worktree 实跑时的 `git rev-parse HEAD`（当前 `b83511fb9c3f4b158d913acf7f487405d5ec6108`）；不得写估计值或沿用旧提交。
- 排除项与 include 字面量必须原样入 baseline，便于后续 goal 在 diff 里看见任何新增 exclude。
- 未来若加地板：地板只能升；降低必须在 baseline 写一行理由（同 `test-debt.json` 的 `growth` 台账），不许改脚本；ignore 计数只许降。

### 4. 范围与门禁

- 本项只允许新增/修改 `.munk/baseline/coverage.json` 与 `.munk/changes/wi_intake_7e1cad0afa235fc2/**`；`src/**`、`scripts/**`、`vitest.config.mts`、`.munk/code-gates.json` 均保持零 diff。
- 不新增依赖；不把 coverage 相关命令加入 `.munk/code-gates.json` 或 release workflow。
- 现有 27 道门必须全绿（含 `test` 与 `test-debt-gate`），但不得为让门变绿而放宽任何既有门。
- 若复测数字与 Intake 实测不一致，或最低模块跌破决策阈值，停手并在报告写清差异与「未闭环」，不得自行改口径、拆文件或加 ignore。

### 5. 发布窗口锁（最高优先级）

- v0.2.19 已版本收敛在 `b83511f`，是已定发布点；本项在 v0.2.19 公开之前不得合入 main，不许给发布点加变量。
- 若 `code_gates` 在 v0.2.19 公开前全绿：不交棒 delivery、不合入 main，改为 `munk_report_owner` 报告「门已绿、等你放行合并」，等待 Owner 放行。
- 不碰语义单点：`package.json` version、`CHANGELOG.md`、README 版本表、`release.yml` dispatch 默认 tag、当前版 release notes、`docs/release-evidence/**`；不动已公开 tag / Release / 资产。
