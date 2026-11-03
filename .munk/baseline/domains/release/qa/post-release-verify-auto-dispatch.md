# 修复发版后验证流水线从不自动触发（finalize 主动派发 + fail-closed run / aggregate / artifact 校验）

- WI：`wi_intake_51f535e26a03b97f`
- 域：`release`（发版通道的 `finalize` 收尾接线与发布面工作流契约；`post-release-verify.yml` 的触发面同批由 `domains/release-verify` 承接）
- 来源：`.munk/changes/wi_intake_51f535e26a03b97f/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 14 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main @ed3116e`（v0.2.18 收敛已合入；门禁矩阵 **24 门**）
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`.github/workflows/release.yml` +102/−0、`.github/workflows/post-release-verify.yml` 9/3、`src/main/release-packaging.test.ts` 65/1、`src/main/__fixtures__/release-packaging.json` 86/1、`src/main/__fixtures__/release-artifacts-and-brand.json` 4/1、`src/main/release-doc-fixtures.test-helpers.ts` 1/0、`src/verify-release-gate.test.ts` 4/4、`.munk/baseline/test-debt.json` 7/7
- 零 diff：`package.json`（`version` 仍 `0.2.18`）、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`docs/release-signing.md`、`docs/release-process.md`、`electron-builder.yml`、`scripts/verify-release.mjs`、`scripts/release-metadata.mjs`、`.munk/code-gates.json`、两版 `README.md`、`src/core` / `src/renderer` / `src/preload` / `src/shared` 全部、`src/main` 除上述三个发布测试面文件外全部

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-finalize-permissions | `.github/workflows/release.yml` 的 `finalize` job 新增 job 级 `permissions: { contents: write, actions: write }`（两键都写，覆盖顶层后不丢 `contents`）；`release-packaging.test.ts` 的 `wires finalize to dispatch and check the post-release verification` 用 `expect(workflow.jobs?.finalize?.permissions, 'finalize permissions').toEqual({ contents: 'write', actions: 'write' })` 钉死两项 | 满足 |
| ac-finalize-dispatch | `finalize` 末尾新增步骤 `Dispatch the post-release verification`，`run` 内唯一派发命令为 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}"`；tag 取自工作流级 `RELEASE_TAG`（`inputs.tag || github.ref_name`），fixture 行 `finalize-dispatch-verify` 的 `absentPatterns` 断言该步骤正文零 `v[0-9]+\.[0-9]+\.[0-9]+` 字面量 | 满足 |
| ac-finalize-dispatch-gate | 新增步骤 `Find the post-release verification run for this tag`：`gh run list --workflow=post-release-verify.yml --event=workflow_dispatch --limit 100 --json databaseId,displayTitle,createdAt` 后按 `displayTitle contains ${RELEASE_TAG}` + `createdAt >= since`（派发前 2 分钟写入 `post-release-verify-since.txt`）取最新一条；默认窗口 `POST_RELEASE_LOOKUP_SECONDS:-300`，超时 `::error::` + `exit 1`（fail-closed）。测试用 PATH 打桩的假 `gh` 实跑该步骤：命中 → `found.status = 0` 且输出 `run 4242`；`displayTitle` 不含本 tag → 非零退出且输出含 `appeared within five minutes`；run 早于 `since`（陈旧 run）→ 非零退出 | 满足 |
| ac-finalize-aggregate-gate | 新增步骤 `Assert the post-release verification aggregate passed`：`gh run view <run_id> --json status,jobs` 有界轮询（`SECONDS + 5400`）直到 `jobs[] | name == "aggregate"` 的 `conclusion == success`；`failure` / `cancelled` / `timed_out` 立即 `exit 1`，run 已 completed 但 aggregate 非 success 也 `exit 1`，超时 `exit 1`；随后 `gh api repos/<repo>/actions/runs/<run_id>/artifacts --paginate --jq '.artifacts[].name'`，`grep -Fqx "post-release-verify-${RELEASE_TAG}-${run_id}-aggregate"` 命中才成功，另给 900 s 有界等待，超时 `::error::` + `exit 1`。测试实跑两分支：aggregate `success` + artifact 名含 tag 与 run id → 退出 0 且输出该 artifact 名；aggregate `failure` → 非零退出且输出含 `concluded failure` | 满足 |
| ac-verify-dispatch-only | `.github/workflows/post-release-verify.yml` 的 `on` 仅保留 `workflow_dispatch`（`inputs.tag.required: true`），删除 `release: types: [published]`；`env.TAG` 由 `github.event.release.tag_name || inputs.tag` 收敛为 `inputs.tag`。断言双层：fixture `forbiddenTriggers: ["release","push","schedule"]` + `Object.keys(verify.on)` 等于 `['workflow_dispatch']`；`src/verify-release-gate.test.ts` 的 `only triggers on a manual tag dispatch, read-only` 同样断言 `['workflow_dispatch']` 与 `inputs.tag.required === true` | 满足 |
| ac-verify-run-name | 顶层新增 `run-name: post-release-verify ${{ inputs.tag }}`，`gh run list` 的 `displayTitle` 因此唯一携带本次 tag；两处测试（fixture 的 `runName` 行、`verify-release-gate.test.ts` 的 `expect(workflow['run-name']).toBe(...)`）逐字钉住该字符串 | 满足 |
| ac-readonly-preserved | `post-release-verify.yml` 仍为只读：顶层 `permissions: contents: read`（fixture `permissions` 行与测试逐字断言）、零 `secrets.*`、无 `gh release upload|edit|create|delete` / `git tag` / `git push` / `continue-on-error`（fixture `forbiddenPatterns` 四条 + `verify-release-gate.test.ts` 同类正则，均对 `commandText` 与整个 workflow JSON 取反断言） | 满足 |
| ac-test-extended | 扩展现有 `src/main/release-packaging.test.ts`（+65/−1）与 `src/main/__fixtures__/release-packaging.json`（+86/−1），**未新建门文件**：新增 `postReleaseVerify` 契约行与三个 finalize 步骤台账行（`finalize-dispatch-verify` / `finalize-find-verify-run` / `finalize-aggregate-gate`）；`stepOrder` 与 `release-artifacts-and-brand.json` 的 `mustBeLast` 序列同步追加三步。新增两个 `describe` 用例组：`wires finalize to dispatch and check the post-release verification`（permissions / 触发面 / run-name / 只读负断言）与 `post-release verification dispatch gates`（两个 shell 门在进程内用假 `gh` 实跑，覆盖 found / missing / stale / aggregate pass / aggregate fail 五分支） | 满足 |
| ac-existing-gate-updated | `src/verify-release-gate.test.ts`（4/4，同一用例内改断言）：用例名 `only triggers on a published release and a manual tag dispatch, read-only` → `only triggers on a manual tag dispatch, read-only`；删除 `release: types: [published]` 断言，改为 `['workflow_dispatch']` + `run-name` 逐字断言，只读负断言与 `permissions` 断言原样保留。`pnpm test` 全绿：123 files / **1933 passed + 1 skipped**（1934），发布两套件单跑 `release-packaging` + `verify-release-gate` 合计 **328 passed** | 满足 |
| ac-code-gates | 按 `.munk/code-gates.json` 顺序全量 **24 门** attempt 001 全 `exit 0`（`.munk/runs/run_intake_51f535e26a03b97f/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (24 gates, attempt 001)"`、`failedGateIds: []`）；未新增 gate 项、未新建测试门文件；`test-debt-gate` 实测 `repoTestLines` **44462 ≤ 44462**（growth 记录 `44398 → 44462`、`addedCases: 6`）、`repoTestCases` **1444 ≥ 1419** | 满足 |
| ac-smoke-dispatch | **本阶段未执行**。Delivery 只做 fold → commit → `local_merge` → submit，不做远端写（`gh auth status` 等凭据写操作在本会话被策略禁止，无法判定 token 是否具备 `actions: write`）。冒烟是合入 `main` 之后的独立步骤，命令固定为 `gh workflow run post-release-verify.yml -f tag=v0.2.17` + `gh run list --workflow=post-release-verify.yml --event=workflow_dispatch` 核对 run URL / aggregate PASS / artifact 名含 tag 与 `run_id`，并在证据里标注「冒烟，不计入按版验收」 | 未执行（后置到 main） |
| ac-smoke-403-honest | 同上，本阶段**未发起 dispatch、未取到 403 原文**，因此不写「403」「缺失权限」等未观测结论，也不伪造 run URL / run id；冒烟若在 main 上返回 403，需按原文失败输出与缺失 scope 归档为阻塞证据 | 未执行（不宣称） |
| ac-v0218-auto-run | 未发生：本 WI 只改仓库内 YAML 与测试，未打 tag、未 dispatch Release、未创建 / 修改任何 Release 与资产。该条只能由 `v0.2.18` 真实发布后取证（`event=workflow_dispatch`、actor `github-actions[bot]`、Release 工作流 success 后 5 分钟内、aggregate PASS、artifact 名含 `v0.2.18` 与 `run_id`） | 待发版取证 |
| ac-no-manual-passoff | 本项交付物无任何「已每版必验」宣称：YAML 改动只接线派发与三条 fail-closed 校验，测试只证明门在夹具上真会红；证据文件与交付说明均未以人工 dispatch 冒充按版验收 | 满足 |

## 未执行项与后续责任（如实记录）

- **合入 main 后的一次接线冒烟**（`ac-smoke-dispatch` / `ac-smoke-403-honest`）：需要在有 `actions: write` 的凭据环境执行；本阶段不执行远端写，也不对未观测的 403 做任何表述。
- **`v0.2.18` 自动 run 取证**（`ac-v0218-auto-run`）：真正的闭环判据。发版后必须核对 `event=workflow_dispatch` + `actor=github-actions[bot]` + 创建时间在 Release 工作流 success 后 5 分钟内 + `aggregate` PASS + artifact 名含 `v0.2.18` 与 `run_id`，并归档发布后证据。
- **`finalize` 新增逻辑的真实 runner 依赖**：`date -u -d '2 minutes ago'`（GNU date，ubuntu-latest 满足）、`jq`、`gh workflow run` / `gh run list` / `gh run view` / `gh api` 均在 runner 预装；本地测试未在真实 Actions runner 上跑过，属「契约已钉、真 run 未取」的已知边界。

## 备注

- **根因是事件源，不是 YAML 语法**：`release: types: [published]` 从未触发，因为 Release 由 `release.yml` 的 `finalize` 用 `secrets.GITHUB_TOKEN` 调用 `gh release edit --draft=false` 公开，而 GitHub 规定该 token 产生的事件不触发新 workflow run。因此「监听发布的 workflow 零 run」是预期行为，唯一可靠解法是主动派发。
- **job 级 `permissions` 是覆盖而非合并**：`finalize` 一旦声明 job 级块，顶层 `contents: write` 即失效；`actions: write` 必须与 `contents: write` 同批写全，否则发布本身会掉权限。测试用 `toEqual` 钉两项，防止只加 `actions` 的后回归。
- **门禁找的是「本次」run，不是任意 run**：`displayTitle` 匹配 tag + `createdAt >= since` 双条件，避免对同一 tag 重跑时被上一次的旧 run 蒙过；`since` 由派发前 2 分钟落盘，容忍 runner 时钟偏移。
- **有界等待一律 fail-closed**：查 run 300 s、等 aggregate 5400 s、等 artifact 900 s，超时都是 `exit 1` 且带 `::error::`，没有 `continue-on-error`、`|| true` 或静默放行分支。
- **测试强度来自实跑而非文本自证**：两个 shell 门是把 `run` 原文写到临时目录、PATH 打桩假 `gh` 后真跑 bash，失败分支（无 run / 陈旧 run / aggregate failure）是执行证明；契约层另有 fixture 台账行断言步骤存在与顺序（`mustBeLast` 序列追加三步）。
- **`repoTestLines` 余量再次用尽**：44462 既是实测也是新 ceiling（本项净增 64 行 / 6 用例，全部落在发布测试面），后续发布面若再加断言须先删等量行。
- **发布通道全程只读**：未打 tag、未 push 远端 tag、未 dispatch、未对已公开 Release 与资产做任何写操作；`package.json#version`、`CHANGELOG.md`、双语 notes、证据与台账、`electron-builder.yml`、`scripts/**` 与两版 README 零 diff。

## 最近执行

- workItemId: wi_intake_51f535e26a03b97f
- at: 2026-11-03T09:04:00+08:00
- status: pass
- note: 24 gates exit 0 (attempt 001); test 1933 passed + 1 skipped; 14 prd AC folded (3 post-merge ACs deferred)
