# dispatch-rerun-entry

covers: ac-dispatch-entry, ac-dispatch-tag-validation, ac-dispatch-build-ref, ac-dispatch-tag-normalization, ac-push-unchanged, ac-tests-dispatch-workflow
标题: tag 已推送但 Release 未完成时，可从 main 手跑 workflow_dispatch 补发，不移动 tag、不升版本
步骤: 打开 `.github/workflows/release.yml` 核对 `workflow_dispatch` 声明与 `env.RELEASE_TAG`；在 GitHub 上从 `main` 手动触发 Release 工作流并输入已存在的 tag
期望: `workflow_dispatch` 输入名 `tag`、required、默认等于当前版本 tag（现为 `v0.2.1`，由测试从 `package.json#version` 推导，不硬编码旧版本），不依赖 push tag 即可启动；输入不匹配 `^v[0-9]+\.[0-9]+\.[0-9]+$` 或 `refs/tags/<tag>` 在 checkout 中不存在时，构建前即 `::error::` + 非零退出；gates 与打包矩阵 checkout 均为 `ref: refs/tags/<tag>`，`package.json#version` 与该 tag 版本一致；所有 tag 相关步骤（版本断言、预建 / 上传 / 公开 Release、唯一性与资产校验）使用同一 `RELEASE_TAG`，不把分支名 `main` 当 tag；push `v*` 触发路径步骤顺序与行为不变

## 最近执行

- workItemId: wi_intake_cde26b56b1d77ba2
- at: 2026-10-20
- status: pass
- note: 由 `src/main/release-packaging.test.ts` 的 `manual re-run dispatch entry` 组覆盖：断言 `workflow_dispatch` 入口与 `tag` 默认值等于 `` `v${pkg.version}` ``（当前 `v0.2.1`）、工作流级 `RELEASE_TAG: ${{ inputs.tag || github.ref_name }}`、gates 与矩阵 checkout `refs/tags/<tag>`、tag 格式与存在性校验早于 install、tag 相关步骤不再读 `${GITHUB_REF_NAME}`、push `v*` 模型保留、发布路径无绕行。本轮 code_gates `pnpm test` 全绿。实际 dispatch 运行须由人工在 GitHub 上触发（本 WI 不做远端写操作），故 `status: pass` 仅指工作流定义与断言通过。
