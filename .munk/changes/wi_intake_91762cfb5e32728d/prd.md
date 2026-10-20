# 发布 v0.2.1：以修正后的发布门测试首发，替代未能发布的 v0.2.0

## 范围

背景（不实现，只作为判断依据）：v0.2.0 tag（远端 annotated `f385521` → `285ee28`）树内的 `src/main/release-packaging.test.ts` 是旧版，gates checkout `refs/tags/<tag>` 后跑 `pnpm test` 必挂 `expected 2 to be +0`；测试自包含化已在 `main` 落地（wi_intake_9f203630577ffb1a）。发布通道 `munk_task_publish` 拒绝强推指向不同 commit 的既有 tag（400 `task_publish_remote_tag_conflict`），且产品不重写公开 tag，因此 v0.2.0 永不发布，改以用户内容相同的 v0.2.1 首发。

本项只做版本与发布文档 / 发布测试对齐：

1. `package.json#version` 由 `0.2.0` 改为 `0.2.1`。
2. `CHANGELOG.md` 在最上方新增 `## v0.2.1` 段（位于 `## v0.2.0` 之上），写明：v0.2.0 从未公开发布、用户可见变化与 v0.2.0 相同、发布门测试改为不依赖本机 git 状态。
3. 新增 `docs/release-notes/v0.2.1.md`：文案沿用 v0.2.0 发布说明（用户可见内容不变），标题版本与 `package.json#version` 一致；`docs/release-notes/v0.2.0.md` 保留为历史。
4. `README.md` 首屏发布状态（第 5 行 blockquote）改为「v0.2.1 待发布」，仍以 v0.1.2 为最新公开 Release，并指向 `docs/release-notes/v0.2.1.md`；同篇「发布流程」段里 `workflow_dispatch` 的默认 tag 口径同步为 `v0.2.1`。
5. `docs/release-signing.md`：当前状态行与「正式版发布姿态（v0.2.1）」标题、发布说明链接、`workflow_dispatch` 默认 tag 口径改为 v0.2.1；v0.1.2 漂移记录（只读事实）与「不删除、不移动、不重打、不替换」声明保留，仅把「tag 之后的修复由 vX 承接」的承接版本改为 v0.2.1。
6. `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 改为 `'v0.2.1'`；触发方式、gates-first 顺序、`refs/tags/<tag>` checkout 次数与发布语义一律不动。
7. `src/main/release-packaging.test.ts` 同步断言：版本、release notes 路径、dispatch 默认 tag、CHANGELOG 段序、README 口径；版本字面量尽量从 `package.json` 推导，避免再次硬编码漂移。
8. 发布取证迁移到 v0.2.1：新增 `docs/release-evidence/v0.2.1.md`（`status: blocked`，只做只读取证门，等真实 Release；不含任何通过标记与产物 SHA-256），`src/main/release-evidence.test.ts` 指向并断言 v0.2.1 记录。`docs/release-evidence/v0.2.0.md` 保留为历史文件。

仓库已有完整 Electron + React 工程与发布流水线，本项不创建工程、不加路由 / AGENTS 之外的脚手架。

## 验收

- ac-pkg-version: `package.json#version` 等于 `0.2.1`，且仍匹配 `^\d+\.\d+\.\d+$`。
- ac-notes-v021: `docs/release-notes/v0.2.1.md` 存在且非空；首个 H1 含 `v0.2.1`，其中解析出的版本号等于 `package.json#version`；正文覆盖「新建对比」「路径」「启动参数」「opencompare://」「图标」「原位写回」等 v0.2.0 用户可见项；不含 `TODO` / `TBD` / `FIXME`。
- ac-notes-v020-history: `docs/release-notes/v0.2.0.md` 仍然存在且首个 H1 仍含 `v0.2.0`（历史记录不被删除或改写）。
- ac-changelog-order: `CHANGELOG.md` 中 `## v0.2.1` 的下标小于 `## v0.2.0` 的下标，后者又小于 `## v0.1.2` 的下标。
- ac-changelog-content: `## v0.2.1` 到 `## v0.2.0` 之间的段落同时包含「v0.2.0 从未公开发布」「用户可见变化相同」与「发布门测试不依赖本机 git 状态」三层含义，并保留上述 v0.2.0 用户可见关键词。
- ac-readme-status: `README.md` 首屏发布状态 blockquote 含「当前发布状态：v0.2.1 待发布」「最新公开 Release 为 v0.1.2」，并含链接 `docs/release-notes/v0.2.1.md`；不再出现「当前发布状态：v0.2.0 待发布」「正式版 v0.2.0」「发布状态：冻结」。
- ac-readme-dispatch-default: `README.md` 发布流程段里 `workflow_dispatch` 默认 tag 写作 `v0.2.1`，与 workflow 默认值一致。
- ac-signing-posture: `docs/release-signing.md` 含「正式版发布姿态（v0.2.1）」标题与 `docs/release-notes/v0.2.1.md` 链接；不含「发布冻结」；v0.1.2 漂移事实（`7ea2cc6`、`c4a6a95`、`annotated`、祖先、`13 个提交`、`公开`、`非预发布`、`11 个资产`）与「不删除 / 不移动 / 不重打 / 不替换」声明仍在。
- ac-workflow-dispatch-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.1'`；`push.tags` 仍为 `v*`，`RELEASE_TAG` 仍为 `${{ inputs.tag || github.ref_name }}`，`ref: refs/tags/${{ env.RELEASE_TAG }}` 仍恰好出现 2 次，gates → 打包矩阵 → finalize 的顺序不变。
- ac-packaging-test-sync: `src/main/release-packaging.test.ts` 断言 package.json 版本为 `0.2.1`、release notes 路径为 `docs/release-notes/v0.2.1.md`、dispatch 默认 tag 为 `v0.2.1`、CHANGELOG 段序与 README 口径；版本断言优先从 `package.json` 推导，文件中不再残留指向 v0.2.0 作为「当前版本」的字面量。
- ac-evidence-v021: `docs/release-evidence/v0.2.1.md` 存在且非空，含 `v0.2.1`；`status:` 为 `blocked`；含 `git ls-remote --tags origin refs/tags/v0.2.1`、`gh release view v0.2.1 --repo chaxiu/OpenCompare`、`release not found` 与「缺失项」「待人工动作」「升级」段落；不含 `valid on disk` / `satisfies its Designated Requirement` / `The validate action worked!` / `source=Notarized Developer ID` 等通过标记，也不含任何 64 位十六进制 SHA-256。
- ac-evidence-test-sync: `src/main/release-evidence.test.ts` 读取并断言 `docs/release-evidence/v0.2.1.md`（证据文件缺失或版本不符即失败）；`inspectReleaseEvidence` 的 verified / blocked 分支用例矩阵保持通过。
- ac-gates-green: `pnpm test` 退出码 0，`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web` 均通过；发布相关测试不依赖本仓库 `.git`、真实 tag 或全局 git 配置（在无 `.git` 的源码树或临时目录 fixture 下同样成立）。
- ac-no-tag-mutation: 收工后 `git tag --list 'v0.2.1'` 为空，`git tag --list 'v0.2.0'` 与远端 tag / Release 未被创建、移动、删除或强推。

## 非目标

- 不改发布语义、打包配置（`electron-builder.yml`、`build/`）、依赖与 `pnpm-lock.yaml`。
- 不创建、不推送任何 tag，不创建或修改任何 GitHub Release；不碰 v0.1.x 与 v0.2.0 的 tag 与 Release。
- 不做实机安装 / 签名 / 公证验收，不跑 self_test。
- 不改任何用户可见功能、UI、交互或算法；v0.2.1 的用户可见变化与 v0.2.0 完全相同。
- 不删除或改写 v0.2.0 发布说明与取证记录（保留为历史）。
- 不重写 v0.1.2 漂移历史，也不新增其他版本线。

## 实现约束

- 严格按上述 8 条改动范围执行，不顺手优化文档或测试的其余部分。
- 版本字面量在 `src/main/release-packaging.test.ts` 中尽量从 `package.json` 推导（如 `pkg.version` 与 `v${pkg.version}`），减少下一版再次漂移。
- 发布测试必须保持自包含：只用临时目录 fixture，不读仓库 `.git`、不依赖真实 tag、不联网。
- 取证文件只做只读记录，`status: blocked` 不得提前写入任何通过输出。
- 走既有 `code_gates`（`pnpm install` / `lint` / `typecheck` / `build` / `build:web` / `test`），不额外新增门。
