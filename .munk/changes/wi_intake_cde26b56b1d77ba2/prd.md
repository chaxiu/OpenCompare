# 修复 v0.1.2 祖先门阻断 v0.2.0 发布，并补不改 tag 的补发入口

## 范围

现状：`v0.2.0` annotated tag（`f385521` → commit `285ee28`）已推远端，但 Release 为空。`release.yml` 第一个 job 的祖先门退出 1：远端 `v0.1.2` 是轻量 tag，指向 `bb0c0b1`；`bb0c0b1` / `b2c4e51` 两个提交不在 `285ee28` 祖先链上（`v0.1.2..HEAD`=29，`HEAD..v0.1.2`=2），而 `git cherry HEAD bb0c0b1` 对两条均返回 `-`（补丁等价、零内容丢失）。本地 `v0.1.2` 是 annotated `c4a6a95` → `7ea2cc6`（祖先），与远端 tag 对象分歧。

本项只改仓库源码、工作流与文档，不执行任何远端写操作：

1. **祖先门语义**：从「`v0.1.2` 必须是 `HEAD` 的严格祖先」改为「严格祖先 **或** 逐提交补丁等价」。
2. **`release.yml` 增加 `workflow_dispatch` 补发入口**（输入 tag，默认 `v0.2.0`），该运行使用 main 上的 workflow，构建阶段显式 checkout `refs/tags/<tag>`，并原样复用现有全部门。
3. **文档**：`docs/release-signing.md` 记录新语义与补发用法；`README.md` 的发布状态改为如实口径。
4. **回归测试**：`src/main/release-packaging.test.ts` 覆盖补丁等价通过、真分叉拒绝、dispatch 入口与 checkout ref、失败非零退出。

## 验收

- ac-ancestry-patch-equivalent: 当 `v0.1.2` 不是 `HEAD` 严格祖先，但所有仅 `v0.1.2` 可达提交逐条 `git cherry` 判定均为 `-` 时，祖先门退出码为 0，流程继续。
- ac-ancestry-per-commit-log: 门日志对每个仅 tag 可达提交打印完整 SHA 与判定符号（`-` / `+`），便于人工复核。
- ac-ancestry-ref-type-log: 门日志打印 `v0.1.2` 的 ref 类型（轻量 / annotated，取自 `git cat-file -t` 为 `commit` / `tag`）以及解析到的 commit SHA。
- ac-ancestry-true-fork: 任一仅 tag 可达提交判定为 `+` 时，门输出 `::error::` 并以非零码退出，后续质量门禁、打包矩阵与 finalize 均不运行。
- ac-ancestry-enumeration-fail: 仅 tag 可达提交无法枚举（`git rev-list` 失败、tag 不可解析等）时，门非零退出（fail-closed），不得按通过处理。
- ac-ancestry-protected-deletion: 任一仅 tag 可达提交的 diff 删除发布关键路径（`.github/workflows/`、`build/`、`electron-builder.yml`、`package.json`）时，即使 `git cherry` 判为 `-`，门仍非零退出。
- ac-ancestry-ahead-nonzero: 保留原有非零领先要求：`v0.1.2..HEAD` 提交数为 0 时门非零退出（发布必须携带 tag 之后的修复）。
- ac-ancestry-readonly: 祖先门只做只读 git 查询；整个 workflow 与测试不创建、不移动、不删除任何 tag/ref，不 push，不调用 `gh release` 写操作，输出不含任何 secret 值。
- ac-dispatch-entry: `release.yml` 声明 `workflow_dispatch`，输入名 `tag`，默认值 `v0.2.0`；不依赖 push tag 即可启动。
- ac-dispatch-tag-validation: dispatch 输入的 tag 不匹配 `^v[0-9]+\.[0-9]+\.[0-9]+$`，或 `refs/tags/<tag>` 在 checkout 中不存在时，工作流在构建前非零退出。
- ac-dispatch-build-ref: dispatch 运行的 gates 与 release 矩阵 checkout 均显式使用 `ref: refs/tags/<tag>`（tag 为解析后的输入/触发 tag），`package.json#version` 取自该 tag 与 tag 版本一致。
- ac-dispatch-tag-normalization: 所有 tag 相关逻辑（版本断言、Release 创建、上传、公开、唯一 Release 与资产校验）使用统一解析的 tag 值；dispatch 路径下不得把分支名 `GITHUB_REF_NAME`（`main`）当作 tag 使用。
- ac-push-unchanged: push `v*` 触发路径仍存在且行为不变：gates 先行 → 三平台矩阵 `--publish never` → 单点预建 draft → finalize 唯一公开 Release；步骤顺序与现有硬校验全部保留。
- ac-gate-before-install: 祖先门与版本一致性校验位于 `pnpm install` / `pnpm test` 之前（快速失败）。
- ac-tests-equivalence: 测试用临时 git 仓库构造「tag-only 提交补丁已等价存在于 HEAD」场景，执行 workflow 中真实的门脚本，断言退出 0 且输出含该提交 SHA 与 `-`。
- ac-tests-divergence: 测试用临时 git 仓库构造两类拒绝场景——存在判定为 `+` 的 tag-only 提交；tag-only 提交删除受保护路径——断言门非零退出。
- ac-tests-dispatch-workflow: 测试断言 `workflow_dispatch` 入口存在、输入 `tag` 默认 `v0.2.0`、checkout `ref` 为 `refs/tags/<tag>`、tag 相关步骤不再使用 `${GITHUB_REF_NAME}`。
- ac-tests-failclosed: 测试断言门失败路径有显式 `exit 1` / 非零返回，且发布路径无 `|| true`、`continue-on-error` 等绕行。
- ac-docs-ancestry: `docs/release-signing.md` 记录新语义（严格祖先 **或** 逐提交补丁等价；`+` 或无法枚举均 fail-closed）与逐条日志口径，同时保留现有 v0.1.2 漂移事实与「不删除、不移动、不重打、不替换」承诺。
- ac-docs-rerun: `docs/release-signing.md` 写明补发用法：从 main 手跑 `workflow_dispatch`，输入 `tag` 默认 `v0.2.0`，构建取 `refs/tags/<tag>`，不改 tag、不升版本。
- ac-readme-status: `README.md` 状态行改为「v0.2.0 待发布；当前可下载的最新公开 Release 为 v0.1.2」，不再出现「正式版 v0.2.0」的已发布口径，并保留 v0.2.0 发布说明链接。
- ac-no-version-or-config-drift: `package.json#version` 仍为 `0.2.0`；`appId` / `productName` / 签名身份 `Tao Zhu (3X4J53U6RY)` / targets / 依赖均未改。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全绿。

## 非目标

- 不执行任何 tag / push / publish / Release 写操作；不删除或重建远端 `v0.2.0` tag（该降级仅在本项证明 dispatch 语义不可行时由发布任务另行决定）。
- 不改发布模型：仍是单点预建唯一 Release + 矩阵 `--publish never` + finalize 公开。
- 不升版本、不改历史、不改 `CHANGELOG.md`、不改 `docs/release-notes/v0.2.0.md` 内容口径。
- 不删、不移、不重打 `v0.1.0` / `v0.1.1` / `v0.1.2` 的 tag 与资产。
- 不改 `appId` / `productName` / 签名身份 / targets / 依赖 / `electron-builder.yml` 发布配置。
- 不新增 secrets，不把凭据写入仓库或日志。
- 不做 UI / 交互改动，不安排实机验收（本项无 UI 行为变化）。

## 实现约束

- 祖先门逻辑必须**内联在 `release.yml` 的步骤里**：`workflow_dispatch` 使用的是 main 上的 workflow 文件，但 gates 会 checkout `refs/tags/<tag>`，引用仓库内新脚本会在旧 tag 上找不到文件而误失败。
- 门必须可被 vitest 直接执行：测试解析 `.github/workflows/release.yml` 取出该步骤的 `run` 脚本，在 `os.tmpdir()` 下的临时 git 仓库里跑 `bash`，不得改动本仓 refs。
- 判定方式按负责人已定：先列出仅 `v0.1.2` 可达的提交，逐条以 `git cherry HEAD <sha>`（或一次 `git cherry HEAD <tag>` 后按 SHA 归档）判定，全部为 `-` 才通过。
- 解析 tag 统一走一个 job 级/工作流级 env（如 `RELEASE_TAG: ${{ inputs.tag || github.ref_name }}`），push 与 dispatch 共用同一套发布步骤，避免两套分支逻辑。
- 既有测试中与新语义冲突的断言必须同步修正（`keeps v0.1.2 as an ancestor of HEAD with a non-zero lead`、README「正式版 v0.2.0」断言、以及测试文件内只读 git 子命令白名单/禁止变更命令的断言），但 driftFacts、v0.1.2 资产保护、硬校验顺序等断言不得削弱。
- 测试中临时仓库的 git 写操作只允许发生在 tmpdir，仓库根目录的调用仍限只读子命令。
- 失败路径一律 `::error::` + 非零退出，禁止 `continue-on-error` / `|| true` / `--no-verify`。
