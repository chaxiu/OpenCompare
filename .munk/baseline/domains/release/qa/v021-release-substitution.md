# v021-release-substitution

covers: ac-pkg-version, ac-notes-v021, ac-notes-v020-history, ac-changelog-order, ac-changelog-content, ac-readme-status, ac-readme-dispatch-default, ac-signing-posture, ac-workflow-dispatch-default, ac-packaging-test-sync, ac-evidence-v021, ac-evidence-test-sync, ac-gates-green, ac-no-tag-mutation
标题: v0.2.0 从未发布，改以用户可见内容相同的 v0.2.1 首发（版本 + 发布文档 + 发布测试对齐）
步骤: 读 `package.json#version`（应为 `0.2.1`）；读 `docs/release-notes/v0.2.1.md` 与 `docs/release-evidence/v0.2.1.md`；对照 `CHANGELOG.md` / `README.md` / `docs/release-signing.md` / `.github/workflows/release.yml` 的版本口径；跑 `pnpm test` 与 code_gates；`git tag --list 'v0.2.1'` 与 `git ls-remote --tags origin refs/tags/v0.2.1` 确认未创建 tag
期望: `package.json#version` 等于 `0.2.1` 且匹配 `^\d+\.\d+\.\d+$`；`docs/release-notes/v0.2.1.md` 非空、首个 H1 含 `v0.2.1` 且版本号与 `package.json` 一致、覆盖「新建对比 / 路径 / 启动参数 / `opencompare://` / 图标 / 原位写回」、无 `TODO`/`TBD`/`FIXME`；`docs/release-notes/v0.2.0.md` 仍存在且 H1 含 `v0.2.0`；`CHANGELOG.md` 中 `## v0.2.1` < `## v0.2.0` < `## v0.1.2`，且 v0.2.1 段同时含「从未公开发布」「用户可见变化与 v0.2.0 相同」「不依赖本机 git 状态」；`README.md` 首屏含「当前发布状态：v0.2.1 待发布」「最新公开 Release 为 v0.1.2」并链接新发布说明，发布流程段 dispatch 默认 tag 为 `v0.2.1`，不再出现「v0.2.0 待发布」「正式版 v0.2.0」「发布状态：冻结」；`docs/release-signing.md` 含「正式版发布姿态（v0.2.1）」与新发布说明链接，v0.1.2 漂移事实（`7ea2cc6` / `c4a6a95` / `annotated` / 祖先 / `13 个提交` / `公开` / `非预发布` / `11 个资产`）与「不删除 / 不移动 / 不重打 / 不替换」仍在；`release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.1'`，`push.tags: v*`、`RELEASE_TAG`、`ref: refs/tags/${{ env.RELEASE_TAG }}` 出现 2 次、gates → 矩阵 → finalize 顺序不变；`release-packaging.test.ts` 由 `package.json` 推导版本驱动断言、无「v0.2.0 为当前版本」残留字面量；`release-evidence.test.ts` 读取并断言 `v0.2.1` 证据文件；证据文档 `status: blocked`、含就绪门原始命令与 `release not found`，无通过标记与 64 位 SHA-256；`pnpm test` / `lint` / `typecheck` / `build` / `build:web` 全绿；本机无 `v0.2.1` tag，远端 tag 与 v0.2.0 / v0.1.x 的 tag、Release 均未被改动

## 最近执行

- workItemId: wi_intake_91762cfb5e32728d
- at: 2026-10-20
- status: pass
- note: code_gates attempt 001 全绿（install / lint / typecheck / build / build:web / test，`Test Files 26 passed` / `Tests 393 passed`）。本机核对：`package.json#version`=`0.2.1`；`git tag --list 'v0.2.1'` 空、`git ls-remote --tags origin refs/tags/v0.2.1` 无输出；CHANGELOG 段序 v0.2.1 → v0.2.0 → v0.1.2；README / 签名文档口径与 `release.yml` 默认 tag 均已同步，`ref: refs/tags/${RELEASE_TAG}` 仍为 2 处；证据文档落 `status: blocked`（远端无 tag / Release，`release not found`），无任何通过标记与 SHA-256。未执行任何远端写操作，`status: pass` 仅指仓库内版本 / 文档 / 工作流定义与断言通过，真实发布仍需人工推 `v0.2.1` tag 触发 CI。
