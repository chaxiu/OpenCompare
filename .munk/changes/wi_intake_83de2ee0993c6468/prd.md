# 修复覆盖率门 freshness 在发布 tag 场景的误报，并补「HEAD 带 tag」预演与反向自测

## Scope

只修 `scripts/coverage-gate.mjs` 的 baseline freshness 判定，并把回归自测接进既有 `pnpm test`（即 `.munk/code-gates.json` 的 `test` 门）；同时提供一个可在推真 tag 之前跑的本地「预演 tag」工具。

已实证的链路（勿重复排查）：
- v0.2.20 tag = `b37fa3989cba5e37f0d7d008b3e504a6e670c0bf`；上一发布 tag v0.2.19 = `fc584af0efea2fa75903ebb2d66bee99c0c20c9b`；`.munk/baseline/coverage.json#measuredAt.commit` = `fc584af...`。
- 旧 `checkBaselineFreshness` 调 `latestReachableTag()`（`git describe` 含 HEAD 自身 tag），在 tag 推送 checkout 上取到 v0.2.20（=HEAD），再要求 baseline commit 不早于它，于是把「baseline 正好等于上一 tag」误判 stale。
- 同文件 floor ratchet 用的 `previousReleaseTag()` 已跳过 `sha === HEAD`，语义正确，应作为 freshness 的唯一基准来源。

本项交付：
1. `scripts/coverage-gate.mjs`：freshness 改用 `previousReleaseTag()`；删除/中和 `latestReachableTag()`；抽出可注入 cwd 的 `evaluateBaselineFreshness(baseline, cwd)` 纯判定；加 direct-execution guard，允许测试 import 而不执行 CLI。
2. 新增 `scripts/coverage-gate-freshness.test.mjs`：tmpdir + `git init` + commit/tag 夹具，覆盖「HEAD 带 tag + baseline=上一 tag 提交」pass、「baseline 早于上一 tag」fail、无 tag 行为不变、baseline=HEAD pass。
3. `vitest.config.mts` 的 include 增加 `scripts/**/*.test.mjs`，让该测试随既有 `pnpm test` 进入 `.munk/code-gates.json` 的 `test` 门；不新增/不改门清单。
4. 新增 `scripts/coverage-gate-preflight.mjs`：本地临时 tag → 完整覆盖率门 → finally 删除 tag；支持 `--negative floor|stale` 反向预演；绝不 push。

## Acceptance Criteria

- ac-freshness-previous-tag: `checkBaselineFreshness` 的基准 tag 只能来自 `previousReleaseTag()`（或等价的「跳过 sha === HEAD」实现）；`latestReachableTag` 不再被 freshness 调用（删除，或改为跳过 HEAD 且被统一使用）；源码中 freshness 分支不出现 `latestReachableTag`。
- ac-head-tag-regression-pass: tmpdir git 夹具中 HEAD 打 `v1.1.0`、上一 tag `v1.0.0` 在 commit A、`baseline.measuredAt.commit = A` 时，`evaluateBaselineFreshness` 返回 0 个 problem（旧实现会误红）。
- ac-stale-before-previous-tag-fail: 同一夹具中 `baseline.measuredAt.commit` 为 `v1.0.0` 之前的 commit 时，返回恰好 1 个 problem，且文本含 `older than the previous semver tag v1.0.0`。
- ac-no-tag-behavior-unchanged: 无 tag 夹具中 `baseline.measuredAt.commit = HEAD` 时返回 0 个 problem，message 含 `no semver tag`；HEAD 带 tag 且 baseline=HEAD 时同样 0 个 problem。
- ac-fixture-isolated: 夹具只写 `os.tmpdir()`，git 身份/日期固定且 `GIT_CONFIG_NOSYSTEM=1` + 隔离的 `GIT_CONFIG_GLOBAL`，结束后 `rmSync` 清理；全程不访问网络，不依赖用户全局 git 配置。
- ac-test-in-existing-test-gate: `vitest.config.mts` include 含 `'scripts/**/*.test.mjs'`；`pnpm exec vitest run scripts/coverage-gate-freshness.test.mjs` 退出 0；`pnpm test` 实际收集并执行该文件；`.munk/code-gates.json` 仍为 29 项且未新增门。
- ac-preflight-green: 在 release commit `b37fa39` 的工作树（含修复；未提交或 scratch copy）上，本地创建 `v9.9.9-rehearsal` 于 HEAD，按 release workflow 同口径生成 fresh `coverage-summary.json` 并跑完整 `scripts/coverage-gate.mjs`，退出 0；finally 删除本地 tag；`git tag --list 'v9.9.9-rehearsal*'` 为空；未执行 `git push`。
- ac-preflight-negative-red: 同一预演用临时 baseline 把任一 floor 调低（如 `floors.totals.lines` 98→97）时完整门退出非 0，输出含 `needs a matching floorLedger entry`；把 `measuredAt.commit` 改为上一 tag 之前的 commit（或不可达 40 位 sha）时退出非 0，输出含 `older than the previous semver tag` 或 `not reachable from HEAD`；真实 baseline 字节不变。
- ac-preflight-same-runner: 预演在与 release `Quality gates` 一致的 Node 22 / pnpm 10.18.3 / Linux 环境执行（Docker `node:22-bookworm` 或等价 ubuntu 镜像），证据记录 `node --version` / `pnpm --version` / `uname`；若环境不可得，先 `munk_report_owner`，不得用本机环境替代并宣称完成。
- ac-release-workflow-intact: `.github/workflows/release.yml` 的 `Coverage gate (src/core floors)` step 仍存在，仍调用 `node scripts/coverage-gate.mjs` 且参数/断言未弱化；`git diff --exit-code .github/workflows/release.yml` 为空。
- ac-coverage-data-untouched: `git diff --exit-code .munk/baseline/coverage.json` 为空；`floors`（lines 98 / branches 90 / functions 99 / moduleBranchesMin 75 / ignoreDirectivesMax 0）、`scope`、`modules`、`measuredAt` 均不变；`git diff --exit-code .munk/code-gates.json` 为空。
- ac-anti-vacuous: 把 freshness 调用临时改回 `latestReachableTag()` 后，`ac-head-tag-regression-pass` 对应用例退出非 0；恢复修复后全绿；两次输出均留证。
- ac-code-gates-green: `.munk/code-gates.json` 全量 29 门 passed、`failedGateIds` 为空；至少含 `lint`、`typecheck`、`test`、`test-debt-gate`，`node scripts/test-debt-gate.mjs` 单独跑亦退出 0。
- ac-no-residue: 预演/自测结束后仓库内无残留 tag、无临时 summary/baseline 文件、无 `git push` 记录；`git status --short` 只显示本项预期改动。

## Non-Goals

- 不改覆盖率地板数字、`floorLedger`、`scope`、`modules` 或 `.munk/baseline/coverage.json` 任何数据。
- 不删门、不放宽断言、不从 `.github/workflows/release.yml` 摘掉 Coverage gate step；不改「先验证后公开」顺序。
- 不改 `.munk/code-gates.json` 的 29 项清单、命令或顺序；不改 `src/munk-gates.test.ts` 的 manifest pin。
- 不改 `src/core/**` 覆盖率口径、vitest coverage provider 或发布打包逻辑。
- 不改 `.munk/baseline/test-debt.json`：新增测试是 `scripts/**/*.test.mjs`，不计入 `repoTestLines`；`repoTestCases` 是下限，新增 case 只会抬高实测值。
- 不做产品/UI 改动；不推远端 tag、不触发 release workflow、不改任何已发布资产。

## Implementation Constraints

### 1) `scripts/coverage-gate.mjs` 的 freshness 修复

- 保留 `previousReleaseTag()` 作为「HEAD 之前最近 semver tag」的唯一语义；删除 `latestReachableTag()`（当前仅 freshness 使用）。若保留，必须跳过 `sha === HEAD` 并让 freshness 统一走它，避免两份语义。
- 将 `checkBaselineFreshness` 拆为可直接测试的纯判定：
  - `evaluateBaselineFreshness(baseline, cwd = ROOT) -> { problems: string[], messages: string[] }`，不读写模块级 `failures/report`；
  - `checkBaselineFreshness(baseline)` 只负责把 `problems` 交给 `fail()`、`messages` 交给 `ok()`。
- 为支持夹具，给 git 辅助函数加可选 cwd：`gitOutput(args, cwd = ROOT)`、`isAncestor(ancestor, descendant, cwd = ROOT)`、`previousReleaseTag(cwd = ROOT)`；导出 `previousReleaseTag`、`evaluateBaselineFreshness`（供测试与预演 import）。
- 失败文本从 `latest semver tag` 改为 `previous semver tag`；`ok` 文本保持 `is at or after ${tag}`；无 tag 的 `no semver tag` 文本保持。
- 文件头注释补一句：HEAD 自身的 tag 必须排除，否则 release tag checkout 会把「baseline = 上一 tag」误判 stale。
- 加 direct-execution guard，`import` 时不跑 CLI：
  ```js
  import { fileURLToPath } from 'node:url'
  const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1])
  if (invokedPath !== '' && invokedPath === fileURLToPath(import.meta.url)) main()
  ```
  不要用 `import.meta.main`（Node 20/22 不保证）。

### 2) `scripts/coverage-gate-freshness.test.mjs`

- 放在 `scripts/`（不是 `src/`），因为 `test-debt` 的 `repoTestLines` 只统计 `src/**/*.test.ts(x)`；放 scripts 不会抬 `repoTestLines` 上限，也无需改 `.munk/baseline/test-debt.json`。
- 用 `mkdtempSync(join(tmpdir(), 'coverage-gate-freshness-'))` 建夹具；每个 `it` 内 `git init -q`、写文件、`git add -A`、`git -c commit.gpgsign=false commit -q`，用 `git -c tag.gpgsign=false tag` 打轻量 tag。
- 固定 `GIT_AUTHOR_NAME/EMAIL/GIT_COMMITTER_NAME/EMAIL` 与 `GIT_AUTHOR_DATE/GIT_COMMITTER_DATE`；设 `GIT_CONFIG_NOSYSTEM=1`，`GIT_CONFIG_GLOBAL` 指向夹具内不存在的文件，避免全局签名/身份污染。
- 用例至少四个：
  1. HEAD `v1.1.0` + 上一 tag `v1.0.0` 在 A，baseline.commit=A → `problems` 为空（核心回归）。
  2. 同上，baseline.commit 为 A 之前的 untagged commit → 1 个 problem，含 `older than the previous semver tag v1.0.0`。
  3. 无 tag，baseline.commit=HEAD → 0 problem，message 含 `no semver tag`。
  4. HEAD 带 tag，baseline.commit=HEAD → 0 problem。
- `afterAll` 用 `rmSync(dir, { recursive: true, force: true })` 清理；不在模块顶层创建临时目录（`vitest list` 只收集不执行时也不留垃圾）。
- 不要在测试里断言「当前仓库真实 baseline 在交付分支 HEAD 上 pass」：交付分支 HEAD 已在 v0.2.20 之后，按修复后的正确语义，真实 baseline（v0.2.19）对下一发布应判 stale；本项禁止改 baseline，v0.2.20 的真实树 pass 由 `ac-preflight-green` 在 release commit `b37fa39` 上证明。

### 3) `vitest.config.mts`

- include 改为：
  ```ts
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs']
  ```
- 这是让新测试进入既有 `test` 门（`pnpm test`）的最小改动；不改 `.munk/code-gates.json`，不改 `src/munk-gates.test.ts`，不改 `package.json` 脚本。

### 4) `scripts/coverage-gate-preflight.mjs`

- 目标：在推真 tag 之前，用本地预演 tag 跑完整覆盖率门并给出结论。
- 预演 tag 名固定 `v9.9.9-rehearsal`（匹配 `v[0-9]*`）；创建于 HEAD；`previousReleaseTag()` 会因 `sha === HEAD` 跳过它。开始前若已存在则 `git tag -d`（仅本地）；`finally` 必须再次删除；全脚本禁止 `git push`。
- 预检：
  - 读真实 `.munk/baseline/coverage.json`，先 `evaluateBaselineFreshness(baseline)`；若已有 problem，说明当前 checkout 已越过 release point（例如修复 commit 已在 v0.2.20 之上），打印指引：在 release commit `b37fa39` 的工作树/scratch copy 上应用修复后再预演，或先按发布流程刷新 baseline；不要在本项里改 baseline。
  - 检查 `node_modules/vitest/vitest.mjs` 存在，否则提示先 `pnpm install --frozen-lockfile`。
- 正跑：
  - 在 `os.tmpdir()` 建 summary 目录；`started_at = Math.floor(Date.now()/1000)`；
  - 用 `process.execPath` 跑 `node_modules/vitest/vitest.mjs run --coverage --coverage.provider=<baseline.provider> --coverage.include=<baseline.scope.include> --coverage.exclude=<每个 exclude> --coverage.reporter=json-summary --coverage.reportsDirectory=<tmp>`；
  - 用 `process.execPath` 跑 `scripts/coverage-gate.mjs --summary <tmp>/coverage-summary.json --started-at <started_at> --include <include> --exclude <每个 exclude>`（与 release.yml 同口径，参数从 baseline scope/provider 取，避免手抄漂移）；
  - 期望退出 0；非 0 则预演失败。
- 反向预演：
  - `--negative floor`：克隆真实 baseline 到 `os.tmpdir()`，把 `floors.totals.lines` 调低（98→97），用 `--baseline <tmp>` 再跑完整门；期望非 0 且输出含 `needs a matching floorLedger entry`。
  - `--negative stale`：克隆 baseline，把 `measuredAt.commit` 改为 `git rev-parse <previousReleaseTag.sha>^`（失败则用 `'0'.repeat(40)`），再跑；期望非 0 且输出含 `older than the previous semver tag` 或 `not reachable from HEAD`。
  - 两个反向都不写真实 baseline；用 `readFileSync` 前后比对真实文件字节确认未变。
- 输出与退出码：逐项打印 `PREFLIGHT positive/negative floor/negative stale: PASS|FAIL`；仅当正跑 exit 0、两个反向均按预期非 0、tag 已删除时 exit 0。
- 预演环境：在 release `Quality gates` 同口径的 Node 22 / pnpm 10.18.3 / Linux 下跑。推荐用 Docker `node:22-bookworm`，把仓库**复制**到容器内 `/work`（用 `tar` 排除 `node_modules`/`out`/`dist`，保留 `.git` 和未提交修复），在 `/work` 里 `corepack` 启用 pnpm 10.18.3、`pnpm install --frozen-lockfile`、再跑 `node scripts/coverage-gate-preflight.mjs`；不要直接挂载写宿主机 `node_modules`。证据记录容器内 `node --version`、`pnpm --version`、`uname -a`。
- 预演时间点：v0.2.20 的预演应在 release commit `b37fa39` 上、把本项修复放在工作树（未提交）后执行；若修复已提交到 `b37fa39` 之上，`previousReleaseTag()` 会正确取到 v0.2.20，baseline v0.2.19 会被判 stale——这是下一发布应刷新 baseline 的正确信号，不应用来否定本修复，也不得为过预演去改 baseline。

### 5) 证据命令（交付时逐条留输出）

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run scripts/coverage-gate-freshness.test.mjs
node scripts/coverage-gate-preflight.mjs
pnpm lint
pnpm typecheck
pnpm test
node scripts/test-debt-gate.mjs
git diff --exit-code .munk/baseline/coverage.json .munk/code-gates.json .github/workflows/release.yml
git tag --list 'v9.9.9-rehearsal*'
```

外加：
- 反向自测：临时把 freshness 改回 `latestReachableTag()`，跑 `pnpm exec vitest run scripts/coverage-gate-freshness.test.mjs` 期望失败；恢复后全绿；两次输出留证。
- 完整 `.munk/code-gates.json` 29 门结果（Delivery 的 code_gates 产物）`failedGateIds: []`。
- `git status --short` 只包含本项预期文件（`scripts/coverage-gate.mjs`、`scripts/coverage-gate-freshness.test.mjs`、`scripts/coverage-gate-preflight.mjs`、`vitest.config.mts`）。
