# coverage 发版预检 workflow 与覆盖率基线刷新

## 范围

补齐发版前置的两项「同镜像预检」之一：新增 `.github/workflows/coverage-gate-preflight.yml`，并在本轮 worktree HEAD 上真实复测、按新 freshness 语义刷新 `.munk/baseline/coverage.json`，使发版任务在推 tag 前 `gh workflow run coverage-gate-preflight.yml --ref main` 有东西可跑且本仓 baseline 不再 stale。

本项只允许落以下文件：

1. 新增 `.github/workflows/coverage-gate-preflight.yml`：形状照 `.github/workflows/spike-process-tree-preflight.yml`；`on: pull_request + workflow_dispatch`（`tag` input 只作 run-name 标签，不创建 tag）；`run-name: coverage-gate preflight ${{ inputs.tag || github.ref_name }}`；`permissions: contents: read`；`runs-on: ubuntu-latest`；pnpm 10.18.3 + Node 22 + pnpm cache + `pnpm install --frozen-lockfile`；随后按序跑 `node scripts/coverage-gate-preflight.mjs`（正档）、`node scripts/coverage-gate-preflight.mjs --negative floor`、`node scripts/coverage-gate-preflight.mjs --negative stale`。
2. 刷新 `.munk/baseline/coverage.json`：在同一 worktree 上用 baseline 既定的 v8 口径真实采样一次，`measuredAt` 写本轮实际测的 commit 与时间，`totals` / `modules` 按实测值更新，`floors` 只升不降。
3. 新增 `scripts/coverage-gate-preflight-workflow.test.mjs`：沿用仓内既有的 yaml parse 断言模式，钉住 workflow 触发 / 权限 / runner / 命令形状（放 `scripts/` 下，不进 `repoTestLines` 统计面）。
4. 本 change pack 的 evidence：workflow 绝对路径、baseline 前后 diff、三条 preflight 的命令与退出码、tag 清理与 baseline 未变检查、合入后的 dispatch run id 与 headSha。

背景事实（已核实，不再重复扫描）：`main@11170a5` 已含 freshness 改造与 `scripts/coverage-gate-preflight.mjs`（本地预演、临时 tag、`--negative floor|stale`），`v0.2.20 = b37fa39`，`11170a5` 在 `v0.2.20` 之后 5 个提交；当前 `.munk/baseline/coverage.json` 的 `measuredAt` 仍是 `fc584af… / 2026-11-03T16:38:42Z`（= `v0.2.19`），按新语义在 `v0.2.20` 之后属 stale。

## Acceptance Criteria

### Workflow 形状

- ac-workflow-file: `.github/workflows/coverage-gate-preflight.yml` 存在、非空，且可被仓内 `yaml` 依赖 `parse()` 解析为对象；顶层 `name` 非空。
- ac-workflow-trigger: `on` 的键恰为 `pull_request` 与 `workflow_dispatch`（顺序不敏感）；`workflow_dispatch.inputs.tag` 为 `required: false`、`type: string`，默认值 `v0.0.0-preflight`；`run-name` 恰为 `coverage-gate preflight ${{ inputs.tag || github.ref_name }}`。
- ac-workflow-readonly: `permissions` 恰为 `{contents: read}`；工作流文本（含 header 注释以外的全部 run/uses/with/env）不出现 `secrets.`、`contents: write`、`gh release`、`git push`、`git tag`、`continue-on-error`。
- ac-workflow-runner-setup: 只有一个 job 且 `runs-on: ubuntu-latest`；步骤按序含 `actions/checkout@v4`（带 `with.fetch-depth: 0`，保证 `previousReleaseTag()` 能看到 `v0.2.20`）、`pnpm/action-setup@v4`（`version: 10.18.3`）、`actions/setup-node@v4`（`node-version: 22`、`cache: pnpm`）、`pnpm install --frozen-lockfile`。
- ac-workflow-positive-step: 存在一步的 `run` 恰为 `node scripts/coverage-gate-preflight.mjs`（不带 `--negative`）。
- ac-workflow-negative-floor-step: 存在一步的 `run` 恰为 `node scripts/coverage-gate-preflight.mjs --negative floor`，且**不再二次反转退出码**——preflight 包装脚本在内层门按预期失败时整体退出 0；若内层门意外变绿，包装脚本退出 1 使 workflow 失败。
- ac-workflow-negative-stale-step: 同上，`run` 恰为 `node scripts/coverage-gate-preflight.mjs --negative stale`。
- ac-workflow-header-posture: 文件头注释写明 read-only pre-tag rehearsal、同 release runner image、绝不 push tag / 不改 `.munk/baseline/coverage.json` / 不触 Release 与 secrets。
- ac-workflow-shape-test: `scripts/coverage-gate-preflight-workflow.test.mjs` 存在，用 `yaml.parse` + `readFileSync` 断言 `ac-workflow-file` / `trigger` / `readonly` / `runner-setup` / 三个命令步骤 / header posture；`pnpm exec vitest run scripts/coverage-gate-preflight-workflow.test.mjs` 退出 0；`pnpm test` 实际收集到该文件；`vitest.config.mts` 零 diff（已含 `scripts/**/*.test.mjs`）。

### Baseline 刷新

- ac-baseline-measured-at: `provider` 仍为 `v8`；`scope.include` / `scope.exclude` / `command` 字面量与本轮刷新前逐字一致；`measuredAt.commit` 为 40 位小写 hex，`git cat-file -e <sha>^{commit}` 成功、从最终 HEAD 可达、且严格晚于 `v0.2.20`（`git rev-list --count v0.2.20..<sha>` ≥ 1）；`measuredAt.date` 为合法 ISO UTC 时间，等于本轮实测落盘时间，晚于 `2026-11-03T16:38:42.000Z` 且不晚于运行时系统时钟。
- ac-baseline-totals: `totals.lines` / `branches` / `functions` / `statements` 的 `pct`（两位小数）、`covered`、`total` 与同一次 fresh `coverage-summary.json` 完全一致；不得抄旧数或估算。
- ac-baseline-modules: `modules` 的键恰为 `src/core/**` 现有 22 个非测试 `.ts` 模块；每模块四项指标与 fresh summary 一致；`src/core/directory/hash.ts` 与 `src/core/text/lines.ts` 仍为 0 分支。
- ac-baseline-floors: `floors.totals.lines ≥ 98`、`branches ≥ 90`、`functions ≥ 99`；`moduleBranchesMin ≥ 75`；`moduleBranchesMinExempt` 与 `ignoreDirectivesMax: 0` 不变；`floorLedger` 仍为 `[]`；任何地板都不得低于刷新前值。
- ac-baseline-no-regression-masking: 若实测任一项低于现有地板，禁止下调地板、禁止写 `floorLedger` 圆过；必须把实测值、地板值与差值写进 evidence，并 `munk_report_owner` 上报真回归，不得把正档 preflight 的红伪装成绿。
- ac-baseline-decision: `decision.floor === true`、`decision.gate === "release-ci"`、`decision.reason` 中的 lines / branches / functions 数字与本次实测 totals 一致。

### 本地自证

- ac-preflight-positive: `node scripts/coverage-gate-preflight.mjs` 退出 0；输出含 `PREFLIGHT positive: PASS`、`baseline freshness: … is at or after v0.2.20`、`PREFLIGHT baseline untouched: PASS`、`PREFLIGHT rehearsal tag removed: PASS`、`PREFLIGHT overall: PASS`。
- ac-preflight-negative-floor: `node scripts/coverage-gate-preflight.mjs --negative floor` 退出 0；输出含内层门失败证据 `negative floor (exit 1)` 与 `needs a matching floorLedger entry`，并含 `PREFLIGHT negative floor: PASS`、`PREFLIGHT overall: PASS`。
- ac-preflight-negative-stale: `node scripts/coverage-gate-preflight.mjs --negative stale` 退出 0；输出含内层门失败证据 `negative stale (exit 1)` 与 `older than the previous semver tag v0.2.20`（或 `not reachable from HEAD`），并含 `PREFLIGHT negative stale: PASS`、`PREFLIGHT overall: PASS`。
- ac-preflight-ratchet-anchor: 三条 preflight 在 baseline 刷新提交之后运行（`git log -1 --format=%H -- .munk/baseline/coverage.json` 指向本轮刷新提交），确保 `--negative floor` 的 ratchet 锚点用的是刷新后地板而不是旧地板。
- ac-preflight-no-residue: 三次运行后 `git tag --list 'v9.9.9-rehearsal*'` 为空；`.munk/baseline/coverage.json` 字节与运行前一致；`git status --short` 无临时 coverage summary / lcov / 临时 baseline；全程无 `git push`、无新 tag 推到远端。

### 证据与范围

- ac-evidence-absolute-paths: `.munk/changes/wi_intake_cd7cb20c206d9bfe/evidence/` 下留有可复核证据，且全部使用绝对路径：① workflow 文件路径；② baseline 前后 diff（`measuredAt` 旧值 `fc584af0efea2fa75903ebb2d66bee99c0c20c9b / 2026-11-03T16:38:42.000Z` 与新 commit/date，及 totals 变化）；③ 三条 preflight 的完整命令、wrapper 退出码与内层门退出码；④ 临时 tag 已删、baseline 未变的检查结果；⑤ fresh `coverage-summary.json` 副本或可定位的绝对路径。
- ac-scope-guard: `git diff --name-only` 只含 `.github/workflows/coverage-gate-preflight.yml`、`.munk/baseline/coverage.json`、`scripts/coverage-gate-preflight-workflow.test.mjs`、`.munk/changes/wi_intake_cd7cb20c206d9bfe/**`；`src/**`、`package.json`、`pnpm-lock.yaml`、`vitest.config.mts`、`.munk/code-gates.json`、`.github/workflows/release.yml`、`CHANGELOG.md`、`docs/release-notes/**` 零 diff。
- ac-no-release-actions: 不执行 `git push`、不创建或推送任何 tag、不 dispatch `release.yml`、不创建 / 修改 Release 与资产；`package.json#version` 仍为 `0.2.20`。
- ac-dispatch-run-evidence: **交付后置项，不属于 code_gates**。Host Delivery 合入本地 main 并推进 origin/main 后，在该 main tip 上执行 `gh workflow run coverage-gate-preflight.yml --ref main`，并轮询 `gh run list --workflow=coverage-gate-preflight.yml --limit 5 --json databaseId,status,conclusion,headSha`；把 `headSha == origin/main tip`、`status == completed`、`conclusion == success` 的 `databaseId` 与 `headSha` 写入交付回执。若环境返回 403 / `human_required` / `gh` 不可用，回执必须写明被挡与原始错误并 `munk_report_owner`，不得伪造 run id。

## Non-Goals

- 不改 `package.json#version`，不写 `docs/release-notes/**`，不动 `CHANGELOG.md`，不推 tag，不 dispatch `release.yml`。
- 不改 `.github/workflows/release.yml` 的任何门逻辑与参数。
- 不改 `src/**` 业务代码与任何既有测试语义；不新增覆盖率目标、不补 `src/**` 测试。
- 不改覆盖率口径（provider / include / exclude / command），不给 renderer / jsdom 设地板。
- 不把覆盖率门接进 `.munk/code-gates.json`、条件 profile 或 `test-debt-gate`；默认矩阵仍 29 项。
- 不借机降低任何地板；不新增 `v8 ignore` / `c8 ignore` 指令。

## Implementation Constraints

- **workflow 必须真实可跑**：三个命令步骤都是直接 `node scripts/coverage-gate-preflight.mjs …`；`--negative` 两档不得再包一层反转。preflight 包装脚本的语义是「正档绿 + 负档如预期红 → 整体 0」，workflow 的绿正是反向自证成功的证据。
- **checkout 必须取全 tag**：`actions/checkout@v4` 加 `with: fetch-depth: 0`，否则 `previousReleaseTag()` 可能看不到 `v0.2.20`，负档会退化成 `not reachable`，等于没验证到 freshness 语义。
- **测量顺序**：先 `pnpm install --frozen-lockfile`，再在同一次 v8 冷跑产出 fresh `coverage-summary.json`（写 `$TMPDIR`，不要写进仓内作 gate 输入），`measuredAt.commit` 取采样开始时 `git rev-parse HEAD`（当前 `11170a5…`；先测后改 baseline，避免写入尚未产生的 commit）；`measuredAt.date` 取实际 UTC 时间，禁止手填未来时间。
- **baseline 数字来源唯一**：`totals` / `modules` 只从该次 fresh summary 抄写；`command` 保留历史测量命令原文；实际执行命令与报告目录写进 evidence。
- **地板只升不降**：刷新后地板不得低于 `98 / 90 / 99 / moduleBranchesMin 75`；地板若上调，先提交刷新后的 baseline，再跑三条 preflight（保证 ratchet 锚点是新地板）。实测低于地板时按 `ac-baseline-no-regression-masking` 上报，不压地板。
- **测试位置**：workflow 形状断言只放 `scripts/coverage-gate-preflight-workflow.test.mjs`；不要放 `src/**`（会抬 `repoTestLines` ceiling），不要改 `vitest.config.mts` 或 `.munk/baseline/test-debt.json`。
- **主检出只读**：全部改动在 worktree 完成；不 push tag；交付走 Host delivery（本地 main + origin/main）。
- **dispatch 归属**：Coding 阶段禁止对尚不含该 workflow 的 `main` 尝试 dispatch；dispatch 与 run id 证据由 Delivery 在推进 origin/main 之后执行或上报被挡。

## 交付回执要求（evidence）

在 `.munk/changes/wi_intake_cd7cb20c206d9bfe/evidence/` 至少落：

- `workflow-path.txt`：`.github/workflows/coverage-gate-preflight.yml` 的绝对路径与 `git status` 结果。
- `coverage-baseline.diff`：`measuredAt` 前后值（旧 `fc584af… / 2026-11-03T16:38:42.000Z`，新 commit/date）及 `totals` / `floors` 的 before→after。
- `coverage-preflight.log`：三条命令原文、wrapper 退出码、内层 gate 退出码、`PREFLIGHT … PASS` 行。
- `coverage-refresh-summary.json`：本轮 fresh summary（或指向 `$TMPDIR` 的绝对路径）。
- `dispatch.md`：Dispatch run `databaseId`、`headSha`、`status`、`conclusion`；被挡时原样记录错误与上报结论。
