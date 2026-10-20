# test-suite-isolated-fixtures

covers: ac-no-repo-git-read, ac-fixture-isolated-global-config, ac-fixture-no-network, ac-strict-ancestor-positive, ac-tag-types, ac-gate-fail-closed, ac-release-semantics-untouched
标题: 发布测试套件不再依赖仓库 `.git` / 真实 tag / 本机全局 git 配置，干净 clone 与隔离 HOME 下可复现
步骤: 读 `src/main/release-packaging.test.ts`：确认无 `gitMetadataSkipReason` / `driftTag` / `it.skipIf` / 对 `repoRoot` 的 git 调用；用临时 HOME 写入 `commit.gpgSign=true`、`tag.gpgSign=true`、`init.defaultBranch=trunk`、`core.hooksPath=/nonexistent` 的 `.gitconfig`，再跑该测试文件与全量 `pnpm test`；另在干净 clone（`v0.1.2` 指向远端轻量 tag `bb0c0b1`、空白临时 HOME）跑 `pnpm install --frozen-lockfile` 与 `pnpm test`
期望: 测试源码不含对仓库根 `.git` 或真实 tag 的读取，所有 git 调用走 `fixtureGit(repo, args)` 且只作用于 `os.tmpdir()` fixture（显式 `git init -b main`、`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`=`/dev/null`、`GIT_CONFIG_NOSYSTEM=1`、丢弃继承 `GIT_*`、显式 `GIT_AUTHOR_*`/`GIT_COMMITTER_*`、独立临时 HOME），`finally` 中 `rmSync(..., { recursive: true, force: true })` 清理；敌对 `.gitconfig` 下该文件 103 tests 全绿、全量 `pnpm test` 全绿；祖先门用例覆盖严格祖先正例、annotated / lightweight 两种 ref 类型、补丁等价、`+` 分叉 / 删除 `electron-builder.yml` / tag 不可见 / 零领先四种 fail-closed；diff 不含 `release.yml` / `electron-builder.yml` / `package.json` 依赖或脚本变更

## 最近执行

- workItemId: wi_intake_9f203630577ffb1a
- at: 2026-10-20
- status: pass
- note: 隔离 HOME（含 `commit.gpgSign` / `tag.gpgSign` / `init.defaultBranch=trunk` / `core.hooksPath=/nonexistent`）下 `npx vitest run src/main/release-packaging.test.ts` → 103 passed；全量 `npx vitest run` → 26 files / 390 tests passed。改动前同一敌对配置会让 7 个 ancestry fixture 用例因 `gpg failed to sign the data` 失败。未做整仓 clean-clone 的 `pnpm install --frozen-lockfile` 复验（code_gates 已覆盖 install 与 test）。
