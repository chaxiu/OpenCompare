# 修复发布测试套件的环境依赖（干净 clone + 临时 HOME 可复现）

## 背景与已复现的硬证据

- CI run `#39354321895`（workflow_dispatch，head `45f8131`）的 Quality gates 日志显示 checkout 的是 **tag v0.2.0 = `285ee28`**（`Checked out v0.2.0 at 285ee28...`），因此 `pnpm test` 跑的是 tag 树里 936 行的旧测试文件。
- 唯一失败用例：`release version gate > keeps v0.1.2 as an ancestor of HEAD with a non-zero lead`，`AssertionError: expected 2 to be +0`（旧文件 336 行 `expect(behind).toBe(0)`）。
- 根因：远端 `v0.1.2` 是 **lightweight tag `bb0c0b1`**（`git ls-remote --tags origin`），相对 v0.2.0 有 2 个 tag-only 提交；两者 `git cherry v0.2.0 bb0c0b1` 均为 `-`（补丁等价）。本机 `v0.1.2` 是 annotated `7ea2cc6` 且是祖先（behind=0），所以本地全绿、CI 红。
- 在仓库外临时目录复现（tag 树 + `v0.1.2` 指向 `bb0c0b1` + 空白临时 HOME）：
  `pnpm test` → `Test Files 1 failed | 25 passed`，`Tests 1 failed | 377 passed`，断言与行号同 CI。
- 同一隔离条件跑当前 HEAD（`45f8131`）测试：`391 passed`。即失败断言已在 HEAD 被补丁等价语义替换；但新增 fixture 用例仍读取本机全局 git 状态：把临时 HOME 的 `.gitconfig` 设为 `commit.gpgSign=true` / `tag.gpgSign=true` / `init.defaultBranch=trunk` / `core.hooksPath=/nonexistent` 后，7 个 ancestry fixture 用例失败（`gpg failed to sign the data`）。
- 结论：需要把测试套件改成完全自包含的 tmpdir fixture，彻底移除对仓库根 `.git`、真实 tag、全局 git config、默认分支名、本机路径与网络的依赖。

## 范围

- 只改测试与必要的可测性，主要文件 `src/main/release-packaging.test.ts`（`src/main/release-evidence.test.ts` 仅断言文档文本，不执行 git，保持不动）。
- 移除对仓库根 `.git` 的读取与 skip 机制：`gitMetadataSkipReason`、`driftTag` 的 `rev-list/show/cherry` 断言、repo-root `git()` 只读 helper 及其源码扫描断言。
- 用 tmpdir 自建仓覆盖 ancestry gate 的全部语义：严格祖先正例、annotated / lightweight tag、patch-equivalent、divergent（`cherry=+`）、删除受保护路径、tag 不可见、零领先。
- 所有 fixture 显式隔离：`git init -b <branch>`；身份走 `GIT_AUTHOR_*` / `GIT_COMMITTER_*`（或 `git -c`）；设置 `GIT_CONFIG_GLOBAL=/dev/null`、`GIT_CONFIG_SYSTEM=/dev/null`、`GIT_CONFIG_NOSYSTEM=1`；清理继承的 `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` / alternates 等变量；显式建 annotated 或 lightweight tag。
- `runAncestryGate` 用同一套隔离 env 启动 `bash` 执行 release.yml 中内联的 gate 脚本；fixture 目录在 `finally` 中删除。
- 保留对 `release.yml` 中 workflow_dispatch、gate 脚本、发布模型的纯字符串/结构断言（读取仓库文件本身不是持久状态）。

## 验收

- ac-ci-failure-reproduced: 在临时干净 clone（checkout `v0.2.0`=`285ee28`、`v0.1.2` 指向 `bb0c0b1`、空白临时 HOME）运行 `pnpm test`，稳定复现 `release version gate > keeps v0.1.2 as an ancestor of HEAD with a non-zero lead` 的 `expected 2 to be +0`；交付说明记录完整命令与原始输出。
- ac-no-repo-git-read: 测试源码不再通过 `git` 读取仓库根 `.git` 或真实 tag；`pnpm test` 运行时不调用 repoRoot 下的 git（源码断言或运行期断言均可）。
- ac-fixture-isolated-global-config: 临时 HOME 的 `.gitconfig` 含 `commit.gpgSign=true`、`tag.gpgSign=true`、`init.defaultBranch=trunk`、`core.hooksPath=/nonexistent` 时，`pnpm test` 仍全绿（改动前 7 个 fixture 用例失败可复现）。
- ac-fixture-no-network: fixture repo 全部在 `os.tmpdir()` 下自建，不读写仓库内外的持久 git 状态、不访问网络；测试结束临时目录被清理。
- ac-strict-ancestor-positive: 新增 fixture 用例覆盖 v0.1.2 为 HEAD 严格祖先且领先 >0，gate 输出 strict ancestor 且退出码 0。
- ac-tag-types: annotated 与 lightweight 两种 tag 在同一 patch-equivalent 场景下分别输出 `ref type=tag (annotated)` / `ref type=commit (lightweight)` 且退出码 0。
- ac-gate-fail-closed: divergent（`cherry=+`）、删除 `electron-builder.yml`、tag 不可见、零领先四种场景均输出 `::error::` 且退出码非 0。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全部退出码 0。
- ac-clean-clone-green: 干净 clone（单分支、fetch-depth 0 等价完整历史）+ 空白临时 HOME 下 `pnpm install --frozen-lockfile` 与 `pnpm test` 全绿；交付说明记录命令与通过计数。
- ac-release-semantics-untouched: diff 不包含 `.github/workflows/release.yml`、`electron-builder.yml`、`package.json` 依赖或脚本变更；无 tag / Release / push 操作。

## 非目标

- 不修改 release.yml 的任何发布语义（checkout ref、祖先门语义、单点预建唯一 Release、矩阵 `--publish never`、finalize 公开）。
- 不重打 / 移动 / 删除 / 新建任何 tag；不 push、不 publish、不创建 Release。
- 不新增依赖，不改 electron-builder.yml，不改产品代码或 UI。
- 不把 gate 脚本抽成仓库脚本（会破坏旧 tag checkout 的可运行性），仍以内联脚本为被测对象。
- 不试图让已冻结的 v0.2.0 tag 树里的旧测试变绿：不移动 tag 就无法改变该树；本项保证以 HEAD 为基础打出的后续 tag / 派发在干净环境可复现通过。

## 实现约束

- 先复现再改断言；不得凭猜测放宽断言。
- fixture 的 git 调用必须通过统一 helper，helper 固定隔离 env 与显式身份；禁止 `...process.env` 直接把全局配置带进来。
- 临时仓库默认分支显式写死（如 `main`），不依赖 `init.defaultBranch`。
- gate 脚本仍从 `release.yml` 的 `Preflight v0.1.2 ancestry` 步骤读取并原样执行，保证测的是真实发布脚本。
- 质量门命令：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`；CI 等价环境 Node 22 + pnpm 10.18.3。
- 清理必须用 `rmSync(dir, { recursive: true, force: true })`，不得留下 tmpdir。
