# release-workflow

covers: ac-release-workflow, ac-push-unchanged, ac-dispatch-entry, ac-dispatch-tag-validation, ac-dispatch-build-ref, ac-dispatch-tag-normalization
标题: release.yml 支持 v* tag 与 workflow_dispatch 两条触发，统一用 RELEASE_TAG 先跑门禁再跨平台构建并发布到 GitHub Release
步骤: 打开 `.github/workflows/release.yml`，核对触发条件、tag 解析、job 依赖顺序与打包矩阵
期望: 存在 `on.push.tags` 匹配 `v*`，并声明 `workflow_dispatch` 且输入 `tag`（required、默认等于当前版本 tag，现为 `v0.2.1`）；工作流级 `env.RELEASE_TAG: ${{ inputs.tag || github.ref_name }}` 为唯一 tag 来源，版本断言 / Release 预建 / 上传 / finalize / 唯一性与资产校验全部引用 `RELEASE_TAG`（dispatch 路径不得把 `GITHUB_REF_NAME`＝`main` 当 tag）；门禁 job 在任何 install 之前校验 tag 格式 `^v[0-9]+\.[0-9]+\.[0-9]+$` 与 `refs/tags/<tag>` 是否存在于 checkout，随后依次执行 install（`--frozen-lockfile`）/ lint / typecheck / test / build，并在 `pnpm install` 前跑只读版本 + 祖先门；`gates` 与打包矩阵的 `actions/checkout` 都显式 `ref: refs/tags/${{ env.RELEASE_TAG }}`（`gates` 另设 `fetch-depth: 0`）；`gates` 末尾在矩阵启动前单点预建该 tag 的唯一 Release（`gh release create ... --draft --generate-notes`，不存在才建、有重复则清理只留一个）；打包 job 通过 `needs` 依赖门禁，以 macos-latest / windows-latest / ubuntu-latest 矩阵执行 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，随后 `gh release upload "${RELEASE_TAG}" <三端产物> --clobber --repo` 汇聚上传；`finalize` 以 `gh release edit "${RELEASE_TAG}" ... --repo ... --draft=false --latest` 公开；push `v*` 路径的步骤顺序与硬校验保持不变

## 最近执行

- workItemId: wi_intake_cde26b56b1d77ba2
- at: 2026-10-20
- status: pass
- note: 静态核对 `.github/workflows/release.yml` 并按新期望更新本用例：`on` 为 `push.tags: ['v*']` + `workflow_dispatch.inputs.tag`（required，default `v0.2.1`，测试按 `package.json#version` 推导校验）；工作流级 `env.RELEASE_TAG: ${{ inputs.tag || github.ref_name }}`，旧 `${GITHUB_REF_NAME}` 引用已全部改为 `${RELEASE_TAG}`；gates 首步校验 tag 正则、checkout 后断言 `refs/tags/${RELEASE_TAG}` 存在，`gates` / `release` 矩阵 checkout 均带 `ref: refs/tags/${{ env.RELEASE_TAG }}`；祖先门内联且前置（见 `ancestry-gate-patch-equivalence`）；预建唯一 draft、矩阵 `--publish never`、`gh release upload ... --clobber`、`gh release edit ... --draft=false --latest` 保留。本轮 code_gates 的 `pnpm test`（393 tests）含对应 workflow 断言并通过；未在真实 CI 上跑 dispatch。
