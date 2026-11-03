# 修复发版后验证流水线从不自动触发

## 范围

- 根因：`.github/workflows/post-release-verify.yml` 自 v0.2.12 起六次发版零 run。它监听 `on: release: types: [published]`，而 `release.yml` 的 `finalize` 用 `secrets.GITHUB_TOKEN` 执行 `gh release edit --draft=false`；GitHub 规定 `GITHUB_TOKEN` 产生的事件不触发新的 workflow run，因此这条链永远不触发。
- 采用方案 A：把「发布后验证」从事件被动触发改为 `finalize` 主动派发。
  1. `release.yml` 的 `finalize` 作业在发布完成后追加一步，用 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}"` 自动派发；tag 必须是本次发布的 tag。
  2. `finalize` 作业显式声明 job 级 `permissions`，同时写全 `contents: write` 与 `actions: write`（job 级会覆盖顶层，缺 `contents` 会导致既有 `gh release` 调用失去权限）。
  3. `post-release-verify.yml` 触发改为仅 `workflow_dispatch`（`inputs.tag` 必填），移除失效的 `release: published`；增加含 tag 的 `run-name`，便于按 tag 核对 run。
  4. `finalize` 内做 fail-closed 校验：派发后 5 分钟内必须查到对应 tag 的 verify run（`gh run list --workflow=post-release-verify.yml --event=workflow_dispatch` 匹配 `run-name`/`displayTitle`），查不到则 `finalize` 失败；并校验该 run 的 `aggregate` 作业最终 PASS、aggregate artifact 名含本次 tag 与 `run_id`。
- 测试：扩展现有 `src/main/release-packaging.test.ts`（不新建门文件）覆盖上述 workflow 契约；同步修正 `src/verify-release-gate.test.ts` 中旧的 `release: published` 触发断言，保证 `pnpm test` 全绿。
- 真 run：改完先过 `code_gates`；合入 main 后，用真实环境对已发布 tag（如 `v0.2.17`）手工 dispatch 一次 `post-release-verify` 做接线冒烟，拿到真实 run URL、aggregate PASS、artifact 名；若本机 token 无 `actions: write` 导致 403，如实上报，不伪造、不以只改 YAML 冒充。`v0.2.18` 发布时必须由 `finalize` 自动产生 run 才算闭环。

## 验收

- ac-finalize-permissions: `.github/workflows/release.yml` 的 `finalize` 作业显式声明 job 级 `permissions`，且同时包含 `contents: write` 与 `actions: write` 两项（解析 YAML 可断言两项都在，不因 job 级覆盖顶层而丢 `contents`）。
- ac-finalize-dispatch: `finalize` 作业在发布完成后存在一个步骤执行 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}"`（或等价 `-f tag=` 形式），tag 取自本次发布的 `RELEASE_TAG`，不得硬编码某个版本号。
- ac-finalize-dispatch-gate: `finalize` 在派发后最多 5 分钟内用 `gh run list --workflow=post-release-verify.yml --event=workflow_dispatch` 按 `run-name`/`displayTitle` 匹配到本次 tag 的 run；查不到则步骤非零退出（fail-closed）。
- ac-finalize-aggregate-gate: `finalize` 校验该 run 的 `aggregate` 作业最终 conclusion 为 success，且该 run 的 aggregate artifact 名同时包含本次 tag 与 `run_id`；任一不满足则 `finalize` 非零退出。
- ac-verify-dispatch-only: `.github/workflows/post-release-verify.yml` 的 `on` 只含 `workflow_dispatch`，`inputs.tag.required` 为 `true`；不再出现 `release` 触发（含 `release: types: [published]`）。
- ac-verify-run-name: `.github/workflows/post-release-verify.yml` 顶层 `run-name` 含 `inputs.tag`，同一 tag 的 run 可由 `run-name`/`displayTitle` 唯一核对。
- ac-readonly-preserved: `post-release-verify.yml` 仍为只读：顶层 `permissions: contents: read`、零 `secrets.*`、不出现 `gh release upload|edit|create|delete` / `git tag` / `git push` / `continue-on-error`。
- ac-test-extended: 扩展现有 `src/main/release-packaging.test.ts`（及 `src/main/__fixtures__/release-packaging.json`，不新建门文件）断言：`finalize` 含 `actions: write`、自动 dispatch 步骤、5 分钟查找校验、aggregate/artifact 校验；`post-release-verify` 的 `workflow_dispatch.inputs.tag` 必填、不再依赖 `release:published`、`run-name` 含 tag。
- ac-existing-gate-updated: `src/verify-release-gate.test.ts` 的 post-release workflow 契约断言同步改为新触发（仅 `workflow_dispatch` + `run-name`），`pnpm test` 全绿、0 skipped。
- ac-code-gates: 按 `.munk/code-gates.json` 顺序全量 gate 退出码 0，且不新增 gate 项、不新建测试门文件。
- ac-smoke-dispatch: 合入 main 后，用真实环境对已发布 tag（如 `v0.2.17`）手工 dispatch 一次 `post-release-verify`；证据含真实 run URL、`aggregate` PASS、artifact 名含该 tag 与 `run_id`，并明确标注「冒烟，不计入按版验收」。
- ac-smoke-403-honest: 若本机 token 无 `actions: write` 导致 dispatch 403，如实上报 403 原文与缺失权限，记录为阻塞证据；不得伪造 run URL，不得只改 YAML 就宣称已跑。
- ac-v0218-auto-run: `v0.2.18` 发布后，`post-release-verify` 的 run 由 `finalize` 自动产生：`event=workflow_dispatch`、actor 为 `github-actions[bot]`（workflow 身份，非人工补发），创建时间在 Release 工作流 success 后 5 分钟内；`aggregate` 作业 PASS，aggregate artifact 名含 `v0.2.18` 与 `run_id`。该证据在发布后归档。
- ac-no-manual-passoff: 不允许以人工 dispatch 冒充「每版必验」；按版验收只认 `finalize` 自动派发的 run，人工 dispatch 只可用于一次接线冒烟并在证据里注明。

## 非目标

- 不改 `package.json` / 版本号 / `CHANGELOG.md` / `docs/release-notes/**` / 发布说明 / `README*`。
- 不推 tag、不 dispatch Release、不改已公开 Release 与资产/正文。
- 不碰 `release.yml` 里 `workflow_dispatch` 的默认 tag 行（`default: 'v0.2.18'`），该项由 v0.2.18 版本收敛项负责，避免冲突。
- 不改 `scripts/verify-release.mjs` 的检查注册表 / A/B 层 / 阈值 / 证据格式，不改打包矩阵、签名、双语正文、latest 指针等既有 finalize 门禁逻辑（仅在 finalize 追加派发与校验步骤）。
- 不新增 npm 依赖；不自动创建 GitHub App / PAT；仅用 `GITHUB_TOKEN` + job 级 `actions: write`。
- 不新建测试门文件、不改 `.munk/code-gates.json` 的 gate 列表。

## 实现约束

- 以 main 为基，赶在 `v0.2.18` tag 前合入；本 WI 不产生版本号 / 发布面改动。
- 派发命令使用 `${RELEASE_TAG}`，禁止硬编码 tag；`gh workflow run` 作用于默认分支，无需额外 checkout。
- 5 分钟窗口只约束「查到 run」；对 `aggregate` 结论与 artifact 可用有界轮询等待，超时即失败，不得静默放行。
- job 级 `permissions` 会覆盖顶层，`contents: write` 与 `actions: write` 必须两项写全。
- 手工 dispatch 仅用于一次接线冒烟；证据必须注明是冒烟、不计入按版验收。
- 真 run 若因 token 权限 403，如实上报原文与缺失权限，不伪造证据、不以「只改 YAML」冒充已跑通。
- 测试扩展落在 `src/main/release-packaging.test.ts` + `src/main/__fixtures__/release-packaging.json`；同步修正 `src/verify-release-gate.test.ts` 旧触发断言，保持全量 `pnpm test` 绿。
