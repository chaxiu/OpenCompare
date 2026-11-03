# Domain: coverage-baseline

`src/core/**` 覆盖率基线治理域：先实测、后判定，再把判定结果钉成**发版级硬门**。数字只来自 worktree / CI 内一次可复现的 v8 冷跑；策略与期望值只存 `.munk/baseline/coverage.json`；判定与执行分离在 `scripts/coverage-gate.mjs` 与 release workflow 的单一 step 中。本域管**覆盖率基线、地板策略与发版覆盖率门**，不管门禁矩阵的形状与触发纪律（归 `quality-gates`：默认矩阵项数、追加纪律、条件 profile）、不管被测行为本身（`text` / `directory` / `structured` / `csv` / `theme` 各行为域）、不管测试清债棘轮（`quality-gates` 的 `test-debt-gate` / `.munk/baseline/test-debt.json`）、不管 renderer 与 jsdom 覆盖率（明确不设地板）。

## 范围

- **测量对象恰 22 个纯模块**（`src/core/**` 下全部非测试 `.ts`）：`text/{diff,normalize,merge,probe,lines,ruler}.ts`、`directory/{snapshot,compare,report,rows,filter,template,hash,sync}.ts`、`structured/{diff,locate,locateFallback,locateLine,parse}.ts`、`csv/align.ts`、`theme/contrast.ts`、`io.ts`。不含 `*.test.ts` / `*.test.tsx` / `__fixtures__/**` / 纯类型 `.d.ts`。
- **测量口径唯一且单源**：provider 固定 v8，include `src/core/**`，exclude 恰 `**/*.test.ts` / `**/*.test.tsx` / `**/__fixtures__/**`。release step 用同一组字面量既跑 vitest（`json-summary` 产出到 `$RUNNER_TEMP/coverage-gate`）又原样传给门脚本（`--include` / 三个 `--exclude`），不允许「跑的口径」与「校验的口径」各写一份。baseline `command` 字段保留历史测量命令原文。
- **基线文件 `.munk/baseline/coverage.json`**：`version` / `measuredAt {commit, date}` / `command` / `provider` / `scope {include, exclude}` / `ignoreDirectives {v8, c8}` / `floors` / `floorLedger` / `totals`（lines / branches / functions / statements 各带 `pct` 与 `covered`/`total`）/ `modules`（22 条相对路径）/ `decision`。`measuredAt.commit` 必须是实跑时 worktree 的 `git rev-parse HEAD`，不得估计或沿用旧提交。
- **地板值**：`floors.totals = {lines: 98, branches: 90, functions: 99}`、`floors.moduleBranchesMin = 75`、`floors.moduleBranchesMinExempt = ["src/core/directory/hash.ts", "src/core/text/lines.ts"]`、`floors.ignoreDirectivesMax = 0`；`floorLedger` 仅在降低地板时追加 `{metric, from, to, reason}`（写法同 `test-debt.json` 的 `growth`）。
- **现行判定：发版级硬门**（`decision.floor = true`、`decision.gate = "release-ci"`，理由为「按实测 98.12 / 90.27 / 99.5 直接钉地板，只进发版 CI」）。门只出现在 `.github/workflows/release.yml` 的 Quality gates job（`pnpm test` 之后、`pnpm build` 之前），不进 `.munk/code-gates.json`、不进条件 profile、不替代交付矩阵。
- **门实现 `scripts/coverage-gate.mjs`**：纯 Node ESM、零新增依赖、零网络、只读；测量输入只接受本 job 新鲜产出的 `coverage-summary.json`，baseline 只提供策略与期望值；脚本内只保留计量口径常量（百分位取 `pct`、集合相等、豁免模块枚举），不保留 floor 数值副本。
- **本次复测数字**（commit `fc584af`，`2026-11-03T16:38:42Z`）：core 总量 lines 98.12%（2090/2130）、branches 90.27%（1346/1491）、functions 99.5%（402/404）、statements 96.39%（2351/2439）；单模块最低 branches 为 `theme/contrast.ts` 75.00%（12/16），其余最低 `directory/sync.ts` 83.07%；两个豁免模块 branches total 为 0。
- **ignore 指令为 0 天花板**：`src/core/**` 内 `v8 ignore` / `c8 ignore` 计数当前合计 0，只许降不许升。
- **证据根目录映射**：报告与证据一律以 **worktree** 为根（`.../worktrees/codebase_b2d550b56d98d0c5/wi_intake_ddfee56630084627`），本 WI evidence 在 `.munk/changes/wi_intake_ddfee56630084627/evidence/`；禁止只给 worktree 解析不到的相对路径。

## 验收

- **ac-baseline-22-modules**：`.munk/baseline/coverage.json` 的 `modules` 键集合与 `src/core/**` 下 22 个非测试 `.ts` 文件完全相等（无多、无缺），不含测试 / fixtures / `.d.ts`，每条含数值型 lines / branches / functions。
- **ac-baseline-matches-evidence**：baseline 的 totals 与 22 个模块百分比与同一次运行的 `coverage-summary.json` 两位小数逐条相等（lines 98.12% 2090/2130、branches 90.27% 1346/1491、functions 99.5% 402/404）。
- **ac-coverage-command-recorded**：baseline `command` 与 `scope` 逐字记录测量口径（provider v8、include `src/core/**`、三个 exclude 字面量、reporter 含 json-summary），原始日志含 `Coverage enabled with v8`、`Test Files 125 passed`、`Tests 2025 passed | 1 skipped`、`exit=0`。
- **ac-reproducible**：同口径冷跑复测时 totals 与 22 模块的 lines / branches / functions 与 baseline 逐项一致；出现差异必须停手写「未闭环」，不得改数字或换口径凑齐。
- **ac-release-step-in-quality-gates**：`.github/workflows/release.yml` 的 `Quality gates` job 内新增且仅新增一个覆盖率门 step（位于 `pnpm test` 之后、`pnpm build` 之前），不设 `continue-on-error`，覆盖率命令与 `node scripts/coverage-gate.mjs` 在同一 step 内串行，任一失败即 job 失败；该 job 其余步骤逐字不变。
- **ac-gate-script-single-source**：`scripts/coverage-gate.mjs` 存在且可被 `node` 直接执行；不新增 npm 依赖、不 import 仓库运行时源码、不访问网络；所有数字只从新鲜 summary 与 baseline 读取，脚本内不保留 floor 数值副本。
- **ac-fresh-artifact-fail-closed**：未传 `--summary`、文件不存在、路径落在仓库内、`mtime` 早于 `--started-at` 任一条成立即非 0 退出并打印原因；不存在「产物缺失就跳过」或回退读仓内旧 summary 的分支。
- **ac-totals-floors**：以新鲜 summary 的 `total` 为准，lines ≥98、branches ≥90、functions ≥99 同时成立才通过；低于时非 0 退出并点名指标与实测值；baseline `floors.totals` 恰为 `{98, 90, 99}`。
- **ac-module-branches-floor**：除两个豁免模块外，每个模块 branches ≥75，低于者逐个点名并非 0 退出；豁免清单恰为 `directory/hash.ts` 与 `text/lines.ts`，且两者在新鲜 summary 中 `branches.total === 0`（0 分支模块不得被冒名豁免）。
- **ac-module-set-equality**：新鲜 summary 的模块相对路径集合与 baseline `modules` 键集合完全相等；缺模块或多模块均非 0 退出并列出差异路径（与 scope 检查共同保证「缩小分母」当场变红）。
- **ac-ignore-directives-zero**：扫描 `src/core/**` 的 `.ts` 源码，`v8 ignore` / `c8 ignore` 计数必须为 0；注入任一指令即非 0 退出并给出文件与计数。
- **ac-scope-literal-equality**：workflow 把覆盖率命令的 include 与三个 exclude 字面量原样传给门；门要求与 baseline `scope` 逐字（含顺序）完全一致，改 include / 增 exclude / 换顺序均非 0 退出。
- **ac-floors-ratchet-only**：地板只升不降；`floors.totals.*` / `moduleBranchesMin` 低于上一发布 tag 或上一次已提交 baseline 时必须有一条字段匹配的 `floorLedger` 记录（`metric` / `from` / `to` / 非空 `reason`）才放行；无历史锚点时打印 `first landing` 放行；禁止改脚本常量放宽。
- **ac-baseline-freshness**：`measuredAt.commit` 为 40 位小写十六进制真实提交、从 HEAD 可达、且不早于最近的 semver tag；`measuredAt.date` 为合法 ISO 时间。当前值为 `fc584af…`（= `v0.2.19`，`2026-11-03T16:38:42Z`）；保留 `b83511f` 会报 baseline stale。
- **ac-normal-tree-pass**：未修改树上按同口径产出新鲜 summary 后裸跑门脚本，退出码 0，逐项打印 totals、模块最低 branches、模块集合、ignore 计数、scope、ratchet、freshness 的 `ok` 行并打印门耗时。
- **ac-reverse-selftest-totals**：复制 summary 把任一 totals 数字调低（如 lines 97 / branches 89），门须非 0 并点名该指标；恢复后回 0。临时改动不得留在交付树。
- **ac-reverse-selftest-module**：复制 summary 把单模块 branches 调低（如 `theme/contrast.ts` 60），门须非 0 并点名该模块；恢复后回 0。
- **ac-reverse-selftest-ratchet**：把 floor 调低且不写 `floorLedger` 时门须非 0 并报 ratchet；补合法记录后放行；可用 `--previous-baseline` 造锚点。调低值与临时 ledger 不得留在交付树。
- **ac-existing-gates-intact**：`.munk/code-gates.json` 零 diff（`version: 1`、27 道门、id / 顺序 / command / `cwd` 逐字不变，无 `coverage-core` / `coverage-gate`）；`vitest.config.mts` 不新增 coverage thresholds / include / exclude。
- **ac-no-test-source-change**：`git diff --name-only` 在 `src/**`（含全部测试）、`vitest.config.mts`、`package.json` / `pnpm-lock.yaml` 上为空；不新增依赖、不改测试、不为凑覆盖率改源码或加 ignore。
- **ac-no-release-surface-change**：`package.json` version、`CHANGELOG.md`、README 版本表、`docs/release-notes/**`、`docs/release-evidence/**`、workflow 的 dispatch 默认 tag 均零 diff；不动已公开 tag / Release / 资产。
- **ac-evidence-and-timing**：交付附 release step 变更行、正常树 pass 原始输出与退出码、totals 与单模块调低的 fail 输出、覆盖率冷跑墙钟与门自身耗时（门应秒级），并写明每版新增约 38 s。
- **ac-release-only-not-per-delivery**：覆盖率门不存在于默认交付矩阵；把覆盖率跑或该门塞进 `code_gates` / `test-debt-gate` / 条件 profile 均视为违反本项。
- **ac-no-renderer-floor**：renderer 与 jsdom 不设覆盖率地板、阈值或 gate；不改 `src/renderer/**` 与测试环境配置。

## 非目标

- 不把覆盖率门接进每次交付的 `.munk/code-gates.json`、`.munk/code-gates.perf.json` 或 `test-debt-gate`；默认矩阵仍是 27 道交付门。
- 不改测量口径：provider 仍为 v8，include 仍为 `src/core/**`，exclude 仍为三个既有字面量，测量命令与证据路径规则不变；本轮只新增 floors / ledger 并刷新 decision 与 `measuredAt`。
- 不新增测试、不改任何测试文件、不写空断言、不重构、不拆文件、不改 `src/core` 源码。
- 不给 renderer / jsdom 设覆盖率地板。
- 不改现有 27 道门的清单、命令、阈值与顺序。
- 不动 version / CHANGELOG / README 版本表 / release notes / release evidence / 已公开 tag / Release / 资产。
- 不借机提高实测覆盖率目标或补测试；本轮只把已测得底线钉成发版硬门。

## 实现约束

- **文件锚点**：step 加在 `.github/workflows/release.yml` 的 `Quality gates` job 中现有 `- run: pnpm test` 之后、`- run: pnpm build` 之前；脚本 `scripts/coverage-gate.mjs`；策略文件 `.munk/baseline/coverage.json`。
- **新鲜产物目录必须用 `$RUNNER_TEMP`**（如 `$RUNNER_TEMP/coverage-gate`），step 开始先 `rm -rf` 再建；`--started-at "$(date +%s)"` 在 vitest 启动前采样；不得用 `.munk/changes/**` 或仓内历史 evidence 作本次输入。
- **地板比较用 summary 的两位小数 `pct`，等于 floor 视为通过（`>=`）**；单模块最小值只排除两个 0 分支模块，其余一个都不能低于 75。
- **失败必须一次性列出所有不通过项**，不因第一项失败就静默其余项；任何失败 `process.exit(1)`；成功时逐项打印 `ok` 与 `coverage gate passed in <x.xx>s`。
- **覆盖参数只服务反向自测**（`--baseline` / `--previous-baseline` / `--previous-tag`）；生产 workflow 不传，使用仓内 canonical baseline 与 git 推导的上一发布 tag。
- **反向自测完成后必须复原 summary、baseline 与临时文件**；交付树只保留正式改动。
- **地板只能升**；降低必须写一行 `floorLedger` 理由，不许改脚本常量；ignore 计数只许降。
- **范围纪律**：本类改动只允许 `.munk/baseline/coverage.json`、`scripts/coverage-gate.mjs`、`.github/workflows/release.yml` 的单一 step、本域基线文档与该 WI change pack；`src/**`、`vitest.config.mts`、`package.json` / lockfile、`.munk/code-gates.json` 零 diff。
- **现有全量门必须全绿**（含 `test` 与 `test-debt-gate`），不得为让门变绿放宽任何既有门；覆盖率不得被塞进 `test-debt-gate`。

## 最近交付证明

- WI：`wi_intake_ddfee56630084627`（把 `src/core` 覆盖率基线钉成发版级硬门：新增 release-only coverage step + `scripts/coverage-gate.mjs` + baseline floors/ledger，刷新 `measuredAt`）
- 日期：2026-11-04
- 结果：正常树裸跑门 `coverage gate passed in 0.13s`、`exit=0`，逐项 ok（fresh summary / scope / totals 98.12·90.27·99.5 / 22 模块集合 / 2 豁免 0 分支 / 模块最低 `theme/contrast.ts` 75% / ignore 0 / freshness `fc584af` ≥ `v0.2.19` / ratchet first landing）；新鲜 summary 由本 job 命令冷跑（vitest 墙钟 37s）。
- 反向自测：totals 调低（lines 97）→ `FAIL totals lines: 97% < floor 98%`、exit 1；单模块调低（`theme/contrast.ts` 60）→ `FAIL module branches …`、exit 1；调低 lines floor 无 ledger → `needs a matching floorLedger entry`、exit 1，补 ledger 后 pass；fresh artifact 四种缺失/陈旧/仓内路径场景全部 exit 1；保留旧 `measuredAt=b83511f` 时 `FAIL baseline stale … older than v0.2.19`、exit 1。所有临时改动已复原。
- 面差：`git diff` 仅 `.github/workflows/release.yml`（+27 行单一 step）与 `.munk/baseline/coverage.json`（floors / `floorLedger` / decision / `measuredAt`），新增 `scripts/coverage-gate.mjs`；`src/**`、`vitest.config.mts`、`package.json` / lockfile、`.munk/code-gates.json`（27 门）、version / CHANGELOG / README / release notes / evidence 零 diff。
- 证据：`.munk/changes/wi_intake_ddfee56630084627/evidence/{release-step.diff,coverage-run.log,coverage-gate-pass.log,coverage-timing.txt,reverse-totals.log,reverse-module.log,reverse-ratchet-fail.log,reverse-ratchet-pass.log,fresh-artifact-fail-closed.log,baseline-stale.log}`（`vitest_wall=37s gate_wall=0.13s expected_release_overhead=~38s`）。
- 注：① 本 change pack 仅 `prd.md` + evidence，无 `tests/cases/**` / `tech.md` / `ux/**`，故无用例可 copy、无 tech / ux 手合。② **口径已变**：上一轮「只留报告、不钉地板」与决策闸阈值（85/60/50）被本项推翻，`decision.thresholds` 已删除，改为 floors + `gate: "release-ci"`；后续引用「coverage 不进 release CI」的旧断言需按本域改口。③ `v0.2.19` 已公开发布（Release Latest，2026-11-03T13:59Z，tag 指向 `fc584af`），上一域的发布窗口锁已自然解除；`measuredAt` 因此锚定在 tag 之后。④ 两个 0 分支模块（`directory/hash.ts`、`text/lines.ts`）v8 记 100%，必须走显式豁免清单且门校验其 `branches.total === 0`，否则最小值口径会被伪 100% 拉偏。⑤ 门耗时 0.13s 与 vitest 37s 强绑定，每版新增约 38 s；任何「缩短 release 时长」的改动不得以删这一步为代价，只能优化 vitest 侧。
