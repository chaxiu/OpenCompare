# Domain: coverage-baseline

`src/core/**` 覆盖率基线治理域：先实测、后判定，再把判定结果钉成**发版级硬门**。数字只来自 worktree / CI 内一次可复现的 v8 冷跑；策略与期望值只存 `.munk/baseline/coverage.json`；判定与执行分离在 `scripts/coverage-gate.mjs` 与 release workflow 的单一 step 中。本域管**覆盖率基线、地板策略与发版覆盖率门**，不管门禁矩阵形状与触发纪律（`quality-gates`）、不管被测行为本身（`text` / `directory` / `structured` / `csv` / `theme` 各行为域）、不管测试清债棘轮、不管 renderer 与 jsdom 覆盖率（明确不设地板）。

## 范围

- **测量对象**：`src/core/**` 下全部非测试 `.ts`（当前 28 个）：`text/{diff,normalize,merge,probe,lines,ruler}.ts`、`directory/{snapshot,compare,report,rows,filter,template,hash,sync}.ts`、`structured/{diff,locate,locateFallback,locateLine,parse}.ts`、`syntax/{cache,language,overlay,tokenize,view}.ts`、`csv/align.ts`、`theme/{contrast,tokens}.ts`、`io.ts`；不含 `*.test.ts` / `*.test.tsx` / `__fixtures__/**` / 纯类型 `.d.ts`。0 可执行语句的 barrel 不计入 baseline `modules`，但若出现在 fresh summary 或 baseline 中由豁免口径显式处理。
- **测量口径唯一且单源**：provider 固定 v8，include `src/core/**`，exclude 恰 `**/*.test.ts` / `**/*.test.tsx` / `**/__fixtures__/**`；release step 用同一组字面量既跑 vitest（`json-summary` → `$RUNNER_TEMP/coverage-gate`）又原样传给门脚本，不允许「跑的口径」与「校验的口径」各写一份；baseline `command` 记录最近一次权威采样命令原文。
- **基线文件 `.munk/baseline/coverage.json`**：`version` / `measuredAt {commit, date}` / `command` / `provider` / `scope {include, exclude}` / `ignoreDirectives {v8, c8}` / `floors` / `floorLedger` / `totals` / `modules` / `decision`；`measuredAt.commit` 必须是实跑时 worktree 的 `git rev-parse HEAD`。
- **地板值**：`floors.totals = {lines: 97, branches: 90, functions: 99}`、`moduleBranchesMin = 75`、`moduleBranchesMinExempt = ["src/core/directory/hash.ts", "src/core/text/lines.ts"]`、`ignoreDirectivesMax = 0`；`floorLedger` 仅在降低地板时追加 `{metric, from, to, reason}`，当前恰 1 条 `{metric:"lines", from:98, to:97}`（理由：纳入 `theme/tokens.ts` 的 1 行不可达防御分支，保留 1 点余量）。
- **现行判定：发版级硬门**（`decision.floor = true`、`decision.gate = "release-ci"`）。门只出现在 `.github/workflows/release.yml` 的 Quality gates job（`pnpm test` 之后、`pnpm build` 之前），不进 `.munk/code-gates.json`、不进条件 profile、不替代交付矩阵。
- **门实现 `scripts/coverage-gate.mjs`**：纯 Node ESM、零新增依赖、零网络、只读；输入只接受本 job 新鲜产出的 `coverage-summary.json`，baseline 只提供策略与期望值；脚本内不保留 floor 数值副本。
- **模块级评估纯函数 `evaluateModuleCoverage(entries, baseline, exemptModules)`**：唯一模块判定入口，同时负责双向集合相等与单模块 branches 地板。**0 可执行语句显式豁免**：fresh summary（或 baseline 缺失侧）条目的 `statements/lines/functions/branches` 四项 `total` 全为 0 才豁免——多出与缺失都不再计入 missing/extra，不参与 `moduleBranchesMin` 判定，也不进入 `module branches min` 最低值报告；每模块打印一条 `ok   exempt module <path>: 0 executable statements`。有可执行语句的模块仍保持严格双向集合相等与分支地板（反分母收缩）。
- **`zeroStatementVerdict(entry)` fail-closed**：任一 `total` 缺失 / 非整数 / 负数即返回 problem，不默认豁免；豁免只来自实测 `total`，不得从路径名 / 文件名 / 硬编码清单推断，禁止静默跳过或「空集合恒真」。
- **固定 0 分支豁免 `checkExemptModules`**：`moduleBranchesMinExempt` 两项仍必须声明且 `branches.total === 0`；该机制与 0 语句豁免互不替代、互不放宽。
- **freshness 基准唯一来源 `previousReleaseTag()`**：`measuredAt.commit` 必须 40 位小写 hex、从 HEAD 可达、且不早于「HEAD 之前最近的 semver tag」；HEAD 自身 tag 必须排除。失败文本 `older than the previous semver tag <tag>`，`ok` 文本 `is at or after <tag>`，无 tag 为 `no semver tag`。
- **可注入 cwd 的纯判定**：`evaluateBaselineFreshness(baseline, cwd = ROOT) -> { problems, messages }` 不读写模块级 `failures/report`；`checkBaselineFreshness` 只把 `problems` 交 `fail()`、`messages` 交 `ok()`；门脚本有 direct-execution guard（`resolve(process.argv[1]) === fileURLToPath(import.meta.url)`），`import` 时不跑 CLI。
- **自测三件套**（均经 `vitest.config.mts` include `scripts/**/*.test.mjs` 进入既有 `test` 门，不新增门、不改配置）：`scripts/coverage-gate-freshness.test.mjs`（tmpdir + `git init` 夹具、固定 identity/日期、隔离全局配置）；`scripts/coverage-gate-preflight-workflow.test.mjs`（`yaml.parse` 钉 workflow 形状）；`scripts/coverage-gate-zero-statement.test.mjs`（CLI 级正反断言 + `evaluateModuleCoverage` / `zeroStatementVerdict` 纯函数断言）。
- **本地预演 `scripts/coverage-gate-preflight.mjs`**：HEAD 建本地轻量 tag `v9.9.9-rehearsal`（`sha === HEAD` 被 `previousReleaseTag()` 跳过），按 release 同口径跑 vitest coverage + 完整门，`finally` 删 tag；`--negative floor|stale` 用 tmp baseline 反向预演；绝不 push、绝不改真实 baseline（前后字节比对）。
- **发版预检 workflow `.github/workflows/coverage-gate-preflight.yml`**：与 release 同 runner image 的只读预演；`on` 恰 `pull_request` + `workflow_dispatch`，`permissions: {contents: read}`，单 job `ubuntu-latest`，按序跑正档与 `--negative floor` / `--negative stale`；绝不 push tag、不改 baseline、不触 Release 与 secrets。
- **ignore 指令为 0 天花板**：`src/core/**` 内 `v8 ignore` / `c8 ignore` 计数当前合计 0，只许降不许升。
- **证据根目录映射**：报告与证据一律以 worktree 为根（`.../worktrees/<codebaseId>/<workItemId>`），本 WI 在 `.munk/changes/{workItemId}/evidence/`；禁止只给 worktree 解析不到的相对路径。

## 验收

- **ac-baseline-module-set-exact**：baseline `modules` 键集合与 `src/core/**` 全部非测试 `.ts` 完全相等（当前 **28** 个，含 `theme/tokens.ts` 与 `syntax/{cache,language,overlay,tokenize,view}.ts`），不含测试 / fixtures / `.d.ts`，每条含数值型 lines / branches / functions。
- **ac-baseline-matches-evidence**：baseline `totals` 与全部模块百分比与同一次运行的 `coverage-summary.json` 两位小数逐条相等（当前 lines 98.24% 2290/2331、branches 90.31% 1474/1632、functions 99.54% 439/441、statements 96.33% 2579/2677）。
- **ac-coverage-command-recorded** / **ac-baseline-measured-at**：baseline `command` 与 `scope` 逐字记录口径（provider v8、include `src/core/**`、三个 exclude 字面量、reporter 含 json-summary），原始日志含 `Coverage enabled with v8` 与 `exit=0`；`measuredAt.commit` 为 40 位小写 hex、`git cat-file -e <sha>^{commit}` 成功、从 HEAD 可达且严格晚于 `v0.2.21`；`measuredAt.date` 为合法 ISO UTC、等于本轮实测落盘时间、不晚于系统时钟。
- **ac-reproducible**：同口径冷跑复测时 `totals` 与全部模块 lines / branches / functions 与 baseline 逐项一致；差异必须停手写「未闭环」，不得改数字或换口径凑齐。
- **ac-release-step-in-quality-gates** / **ac-release-workflow-intact**：release.yml 的 `Quality gates` job 内恰一个覆盖率 step（`pnpm test` 之后、`pnpm build` 之前、无 `continue-on-error`）；该 step 仍调 `node scripts/coverage-gate.mjs` 且参数 / 断言未弱化；`git diff --exit-code .github/workflows/release.yml` 为空。
- **ac-gate-script-single-source**：`scripts/coverage-gate.mjs` 存在且可被 `node` 直接执行；不新增 npm 依赖、不 import 仓库运行时源码、不访问网络；数字只从 fresh summary 与 baseline 读取，脚本内不保留 floor 副本。
- **ac-fresh-artifact-fail-closed**：未传 `--summary`、文件不存在、路径落在仓库内、`mtime` 早于 `--started-at` 任一条成立即非 0 退出并打印原因；无「产物缺失就跳过」或回退读仓内旧 summary 的分支。
- **ac-totals-floors**：lines ≥97、branches ≥90、functions ≥99 同时成立才通过；低于时非 0 退出并点名指标与实测值；`floors.totals` 恰为 `{97, 90, 99}`。
- **ac-module-branches-floor**：除两个固定豁免模块外，每个模块 branches ≥75，低于者逐个点名并非 0 退出；豁免清单恰为 `directory/hash.ts` 与 `text/lines.ts`，且两者 `branches.total === 0`（0 分支模块不得被冒名豁免）。
- **ac-module-set-equality**：非 0 语句模块的相对路径集合与 baseline `modules` 键集合严格双向相等；缺模块或多模块均非 0 退出并列出差异路径；0 可执行语句模块按下方豁免口径处理、不参与该相等判定（与 scope 检查共同保证「缩小分母」当场变红）。
- **ac-empty-barrel-module-set-exempt**：fresh summary 含 baseline 未收录、四项 total 全为 0 的模块（如 `src/core/syntax/index.ts`）时，`node scripts/coverage-gate.mjs` 退出码 0，且 stdout 有该路径的 `exempt module <path>: 0 executable statements` 记录。
- **ac-empty-barrel-missing-exempt**：baseline 收录但 fresh summary 缺失的模块，若在 baseline 中四项 total 全为 0，同样不因 module set 判红（退出 0）并打印同一条显式豁免记录。
- **ac-zero-statement-branch-floor**：0 可执行语句模块即使 `branches.pct === 0` 也不触发 `module branches: ... < 75%`，且不出现在 `module branches min` 报告行（不出现误导性的「min: 0%」）。
- **ac-real-zero-coverage-still-red**：模块四项 total 中任一项 > 0（如 `branches.total=4, covered=0, pct=0`）时 gate 非 0 退出，stderr 含 `module branches: <path> 0% < 75%`，stdout 无该模块的豁免记录。
- **ac-exempt-auditable**：每个被豁免模块恰好一条独立、带路径与「0 executable statements」依据的输出行；未豁免模块不得出现该行；豁免数量与自动判定结果一致，不依赖固定白名单扩列。
- **ac-floors-scope-zero-relax**：`floors.totals` 仍 97/90/99、`moduleBranchesMin` 75、`ignoreDirectivesMax` 0、`moduleBranchesMinExempt` 仍恰为 `src/core/directory/hash.ts` 与 `src/core/text/lines.ts`；`scope.include` 与三个 `scope.exclude` 字面量与顺序逐字不变；`measuredAt` 不变（属后继 resample）。
- **ac-no-ignore-no-source-loss**：`src/core/**` 的 `v8 ignore` / `c8 ignore` 计数仍为 0；本项 diff 对 `src/core/**` 的删除与修改文件数均为 0。
- **ac-release-only-position**：coverage gate 不出现在 `.munk/code-gates.json`（无新增 gate 命令）且未接入 `scripts/test-debt-gate.mjs`；新增自测由默认 `pnpm test` 实际执行并通过。
- **ac-negative-preflight-intact**：`pnpm test` 内既有负向自测仍为绿——`floor` 降低缺 `floorLedger` 必红、`stale` baseline 必红；`scripts/coverage-gate-preflight.mjs` 的 `--negative floor|stale` 语义不被削弱。
- **ac-ignore-directives-zero**：扫描 `src/core/**` 的 `.ts` 源码，`v8 ignore` / `c8 ignore` 计数必须为 0；注入任一指令即非 0 退出并给出文件与计数。
- **ac-scope-literal-equality**：workflow 把覆盖率命令的 include 与三个 exclude 字面量原样传给门；门要求与 baseline `scope` 逐字（含顺序）完全一致，改 include / 增 exclude / 换顺序均非 0 退出。
- **ac-floors-ratchet-only**：地板只升不降；低于上一发布 tag 或上一次已提交 baseline 时必须有一条字段匹配的 `floorLedger`（`metric` / `from` / `to` / 非空 `reason`）才放行；无历史锚点时打印 `first landing` 放行；禁止改脚本常量放宽。
- **ac-baseline-freshness** / **ac-freshness-previous-tag**：`measuredAt.commit` 为 40 位小写 hex 真实提交、从 HEAD 可达、且不早于 **上一** semver tag（`previousReleaseTag()` 跳过 HEAD 自身 tag）；`measuredAt.date` 为合法 ISO 时间；源码 freshness 分支不出现 `latestReachableTag`（已删除）。任何位于 `v0.2.21` 之后、未更新的提交上判 stale 是**正确信号**。
- **ac-head-tag-regression-pass** / **ac-stale-before-previous-tag-fail** / **ac-no-tag-behavior-unchanged**：tmpdir 夹具 HEAD 打 `v1.1.0`、上一 tag `v1.0.0` 在 commit A、baseline `measuredAt.commit = A` 时 0 problem（旧实现会误红）；baseline 早于 A 时恰 1 个 problem 且含 `older than the previous semver tag v1.0.0`；无 tag 且 baseline = HEAD 时 0 problem 且含 `no semver tag`。
- **ac-fixture-isolated**：夹具只写 `os.tmpdir()`，git 身份 / 日期固定且 `GIT_CONFIG_NOSYSTEM=1` + 隔离 `GIT_CONFIG_GLOBAL`，结束 `rmSync` 清理；全程不联网、不依赖用户全局 git 配置。
- **ac-test-in-existing-test-gate** / **ac-workflow-shape-test**：`vitest.config.mts` include 含 `'scripts/**/*.test.mjs'`；`pnpm test` 实际收集并执行 `coverage-gate-freshness.test.mjs` 与 `coverage-gate-preflight-workflow.test.mjs`；`.munk/code-gates.json` 仍为 29 项且未新增门。
- **ac-baseline-totals** / **ac-baseline-modules** / **ac-baseline-floors**：`totals` 四项 `pct` / `covered` / `total` 与 fresh summary 完全一致；`modules` 恰 28 项且每模块指标一致（`theme/tokens.ts` lines 98.07（51/52）、branches 84.37（27/32）、functions 100（12/12）、statements 92.3（60/65）；`syntax/*` 五项齐全且 branches ≥75；两项固定豁免 branches.total 0）；`floorLedger` 恰 1 条 `{lines, 98 → 97}`，无第二处地板下调。
- **ac-lines-floor-97-with-single-ledger**：`floors.totals` 恰 `{lines:97, branches:90, functions:99}`，唯一 `floorLedger` 的 `reason` 明写把 `theme/tokens.ts` 纳入 module set；不新增第二条 ledger、不新增 exclude、不改测量口径。
- **ac-baseline-no-regression-masking**：实测任一项低于地板时禁止下调地板或写 `floorLedger` 圆过；必须把实测值 / 地板值 / 差值写进 evidence 并 `munk_report_owner` 上报真回归，不得把红伪装成绿。
- **ac-baseline-decision**：`decision.floor === true`、`decision.gate === "release-ci"`、`decision.reason` 中 lines / branches / functions 数字与本次实测 totals 一致。
- **ac-preflight-green** / **ac-preflight-triple**：HEAD 建本地 `v9.9.9-rehearsal` 后正档退出 0 且含 `PREFLIGHT positive: PASS`、`module set: 28 modules match baseline`、`totals lines: 98.24% >= 97%`、`baseline freshness: … is at or after v0.2.21`、`PREFLIGHT baseline untouched: PASS`、`PREFLIGHT rehearsal tag removed: PASS`、`PREFLIGHT overall: PASS`。
- **ac-preflight-negative-red**：`--negative floor` 内层 exit 1 且含 `needs a matching floorLedger entry`；`--negative stale` 内层 exit 1 且含 `older than the previous semver tag` 或 `not reachable from HEAD`；真实 baseline 字节前后一致。
- **ac-preflight-ratchet-anchor** / **ac-preflight-no-residue** / **ac-no-residue**：三条 preflight 在 baseline 刷新提交之后运行（ratchet 锚点为新地板）；运行后 `git tag --list 'v9.9.9-rehearsal*'` 为空、baseline 字节一致、`git status --short` 无临时 summary / lcov / 临时 baseline，全程无 `git push`、无 tag 推到远端。
- **ac-anti-vacuous**：把 freshness 调用临时改回 `latestReachableTag()` 后 `ac-head-tag-regression-pass` 对应用例非 0；恢复后全绿，两次输出留证。
- **ac-coverage-data-untouched** / **ac-existing-gates-intact**：`git diff --exit-code .munk/baseline/coverage.json .munk/code-gates.json` 为空（本项只改门脚本，baseline 数据不动）；`code-gates.json` 的 id / 顺序 / command / `cwd` 逐字不变且无 `coverage-core` / `coverage-gate`；`vitest.config.mts` 不新增 coverage thresholds / include / exclude（唯一例外是 `test.include` 可含 `scripts/**/*.test.mjs`）。
- **ac-normal-tree-pass** / **ac-reverse-selftest-totals** / **ac-reverse-selftest-module** / **ac-reverse-selftest-ratchet**：未修改树裸跑门退出 0 并逐项打印 totals、模块最低 branches、模块集合、ignore 计数、scope、ratchet、freshness 的 `ok` 行与门耗时；把 totals 或单模块 branches 调低须非 0 并点名；调低 floor 且无 ledger 须报 ratchet，补合法记录后放行；临时改动不得留在交付树。
- **ac-no-test-source-change**：`git diff --name-only` 在 `src/**`（含全部测试）、`vitest.config.mts`、`package.json` / `pnpm-lock.yaml` 上为空；不新增依赖、不为凑覆盖率改源码或加 ignore。
- **ac-no-release-surface-change** / **ac-no-release-actions**：`package.json#version`、`CHANGELOG.md`、README 版本表、`docs/release-notes/**`、`docs/release-evidence/**`、workflow dispatch 默认 tag 零 diff；不 push、不建 / 推 tag、不 dispatch release、不动已公开 tag / Release / 资产。
- **ac-evidence-and-timing** / **ac-evidence-absolute-paths**：交付附 release step 变更行、正常树 pass 原始输出与退出码、正反自测原始输出、冷跑墙钟与门自身耗时（门应秒级）；evidence 全部使用绝对路径：baseline 前后 diff、三条 preflight 命令与内层 / wrapper 退出码、fresh summary 副本、tag 已删且 baseline 未变、全程无 push / 无 dispatch。
- **ac-release-only-not-per-delivery** / **ac-no-renderer-floor**：覆盖率门不存在于默认交付矩阵；塞进 `code_gates` / `test-debt-gate` / 条件 profile 均违反本项；renderer 与 jsdom 不设覆盖率地板、阈值或 gate。
- **ac-workflow-file** / **ac-workflow-trigger** / **ac-workflow-readonly**：`.github/workflows/coverage-gate-preflight.yml` 非空且可被 `yaml.parse` 解析为对象、顶层 `name` 非空；`on` 键恰 `pull_request` + `workflow_dispatch`（`inputs.tag` 非必填、`type: string`、默认 `v0.0.0-preflight`）、`run-name` 恰 `coverage-gate preflight ${{ inputs.tag || github.ref_name }}`；`permissions` 恰 `{contents: read}`，body 无 `secrets.` / `contents: write` / `gh release` / `git push` / `git tag` / `continue-on-error`。
- **ac-workflow-runner-setup** / **ac-workflow-positive-step** / **ac-workflow-negative-floor-step** / **ac-workflow-negative-stale-step** / **ac-workflow-header-posture**：单 job `ubuntu-latest`，按序 `actions/checkout@v4`（`fetch-depth: 0`）、`pnpm/action-setup@v4`（10.18.3）、`actions/setup-node@v4`（22、`cache: pnpm`）、`pnpm install --frozen-lockfile`；三步 `run` 恰为正档与两条 `--negative`，负档不再二次反转退出码（内层如预期红则整体 0，意外变绿则 1）；header 写明只读 pre-tag rehearsal、同 release runner image、绝不 push / 不改 baseline / 不触 Release 与 secrets。
- **ac-scope-guard**：`git diff --name-only` 只含本项预期改动——本次为 `scripts/coverage-gate.mjs`、`scripts/coverage-gate-zero-statement.test.mjs`、`.munk/changes/{workItemId}/**`、本域 baseline 文档；`src/**`、`package.json`、`pnpm-lock.yaml`、`vitest.config.mts`、`.munk/code-gates.json`、两个 workflow、`CHANGELOG.md`、`docs/release-notes/**` 零 diff。
- **ac-dispatch-run-evidence**：**交付后置项，不属于 code_gates**。合入本地 main 并推进 origin/main 后，在该 tip 执行 `gh workflow run coverage-gate-preflight.yml --ref main`，轮询 `gh run list --workflow=coverage-gate-preflight.yml --limit 5 --json databaseId,status,conclusion,headSha`，把 `headSha == origin/main tip`、`status == completed`、`conclusion == success` 的 `databaseId` 与 `headSha` 写入回执；403 / `human_required` / `gh` 不可用时回执写明被挡与原始错误并 `munk_report_owner`，不得伪造 run id。

## 非目标

- 不把覆盖率门接进 `.munk/code-gates.json` / `.munk/code-gates.perf.json` / `test-debt-gate`；默认矩阵仍是 29 道交付门。
- 不改测量口径（provider / include / exclude / command）与证据路径规则；不新增 ignore 指令，不扩 exclude 缩小分母。
- 不恢复或改动 `src/core/**` 源码（含此前被删的 `src/core/syntax/index.ts`）；不靠增删源码取绿。
- 不新增 baseline 字段做白名单豁免；`moduleBranchesMinExempt` 固定两项语义不放宽，新豁免不得变成路径白名单。
- 不做发布点重采样，不改 `measuredAt` / `totals` / `modules` / `command`（属后继 coverage resample）；不动 version / CHANGELOG / README 版本表 / release notes / release evidence / 已公开 tag / Release / 资产。
- 不给 renderer / jsdom 设地板；不新增 `src/**` 测试、不改既有测试文件。
- 不改 `.github/workflows/release.yml` 门逻辑与参数，不改 `coverage-gate-preflight.yml` 调用参数，不 dispatch `release.yml`。
- 不做无关重构（不重命名现有导出、不改 freshness / ratchet 逻辑）。

## 实现约束

- **文件锚点**：step 在 `.github/workflows/release.yml` 的 `Quality gates` job 的 `pnpm test` 之后、`pnpm build` 之前；脚本 `scripts/coverage-gate.mjs`；策略文件 `.munk/baseline/coverage.json`。
- **新鲜产物目录必须用 `$RUNNER_TEMP`**（如 `$RUNNER_TEMP/coverage-gate`），step 开始先 `rm -rf` 再建；`--started-at "$(date +%s)"` 在 vitest 启动前采样；不得用 `.munk/changes/**` 或仓内历史 evidence 作本次输入。
- **模块级判定复用**：抽成可导出纯函数 `evaluateModuleCoverage(entries, baseline, exemptModules)` 并在 `main()` 消费，沿用现有 `ok()` / `fail()` / `finish()` 输出契约与 `FAIL` / `ok   ` 前缀；现有导出 `evaluateBaselineFreshness`、`previousReleaseTag` 保持不变；`checkExemptModules` 保持原样。
- **豁免取值 fail-closed**：只来自 fresh summary（或 baseline 缺失侧）的实测 total；`total` 非整数 / 负数 / 缺失按现有风格 `fail`，不得默认豁免，不得静默跳过或「空集合恒真」。
- **地板比较用两位小数 `pct`，等于 floor 视为通过（`>=`）**；单模块最小值只排除两个固定 0 分支模块与自动判定出的 0 语句模块，其余一个都不能低于 75。
- **失败一次性列出所有不通过项**，不因第一项失败就静默其余项；任何失败 `process.exit(1)`；成功时逐项打印 `ok` 与 `coverage gate passed in <x.xx>s`。
- **覆盖参数只服务反向自测**（`--baseline` / `--previous-baseline` / `--previous-tag`）；生产 workflow 不传，使用仓内 canonical baseline 与 git 推导的上一发布 tag。
- **反向自测完成后必须复原 summary、baseline 与临时文件**；交付树只保留正式改动；地板只能升，降低必须写一行 `floorLedger`，不许改脚本常量；ignore 计数只许降。
- **自测落位**：CLI 级正反断言用仓库外临时目录构造 `coverage-summary.json` 与临时 baseline 副本，副本 `measuredAt.commit` 取当前 `git rev-parse HEAD` 保证 freshness 稳定；跑完断言真实 baseline 字节未变；只新增 `scripts/**/*.test.mjs`，不放 `src/**`（会抬 `repoTestLines`）。
- **范围纪律**：本类改动只允许 `.munk/baseline/coverage.json`、`scripts/coverage-gate*.mjs`（含 `-zero-statement.test.mjs` / `-preflight.mjs` / `-preflight-workflow.test.mjs`）、`vitest.config.mts` 的 `test.include` 一行、`.github/workflows/release.yml` 单一 step、`.github/workflows/coverage-gate-preflight.yml`、本域基线文档与该 WI change pack；`src/**`、`package.json` / lockfile、`.munk/code-gates.json` 零 diff。
- **现有全量门必须全绿**（含 `test` 与 `test-debt-gate`），不得为让门变绿放宽任何既有门；覆盖率不得被塞进 `test-debt-gate`；`checkout` 必须 `fetch-depth: 0`。
- **测量顺序**：先 `pnpm install --frozen-lockfile`，再在同一次 v8 冷跑产出 fresh `coverage-summary.json`（写 `$TMPDIR`，不写进仓内作 gate 输入）；`measuredAt.commit` 取采样开始时 `git rev-parse HEAD`，`measuredAt.date` 取实际 UTC 时间，禁止手填未来时间。
- **dispatch 归属**：Coding 阶段禁止对尚不含该 workflow 的 `main` 尝试 dispatch；dispatch 与 run id 证据由 Delivery 在推进 origin/main 之后执行或上报被挡。

## 最近交付证明

- WI：`wi_ws_ee8fde19eceed4ee`（`kind: chore`）——给覆盖率门的模块级评估加 **0 可执行语句显式豁免**：`evaluateModuleCoverage` / `zeroStatementVerdict` 成为 `main()` 的唯一模块判定入口，四项 total 全 0 的模块从 module set 与单模块 branches 地板中豁免并逐模块打印 `exempt module <path>: 0 executable statements`，fail-closed 语义保留；`checkExemptModules` 固定两项 0 分支豁免不变。日期：2026-11-05；`deliveryIntent: local merge`。
- 结果：`code_gates` passed（32 gates，attempt 001）；新增 `scripts/coverage-gate-zero-statement.test.mjs`（CLI 正反断言 + 纯函数断言，覆盖空 barrel 多出 / 缺失、0 语句不发红、真实 0 覆盖仍红、豁免行唯一可审计、floors 与 scope 静态不变、真实 baseline 字节不变），经 `vitest.config.mts` 的 `scripts/**/*.test.mjs` 进入默认 `pnpm test`。
- 面差：`scripts/coverage-gate.mjs`、新增 `scripts/coverage-gate-zero-statement.test.mjs`、本 change pack、本域 baseline 文档；`.munk/baseline/coverage.json`、`.munk/code-gates.json`、`vitest.config.mts`、两个 workflow、`src/**`、`package.json` / 锁文件零 diff，覆盖率门仍只在发版 CI。
- 注：① 本 change pack 无 `tests/cases/**` / `tech.md` / `ux/**`，无 qa 用例 copy、无 tech / ux 手合。② 真实 `ubuntu-latest` preflight run 仍未产出（本项不 push / 不 dispatch），`ac-dispatch-run-evidence` 作为交付后置项留在回执中。
