# v0.2.11 发布说明与 CHANGELOG 补入 CI 测试稳定性修复

## 范围

纯文案补齐，只改两个文件：

1. `docs/release-notes/v0.2.11.md`：新增「CI 测试稳定性修复」小节，写清 `src/renderer/src/components/DiffRuler.scale.test.tsx` 的 358,000 行同步遍历用例已带显式 `30_000` per-test 超时；CI attempt1 实测 6,816ms 撞默认 5000ms，本机全量 27.42s / 69 files / 1104 passed，30s 约 4.4x 余量；358,000 规模与全部断言不变、不改产品行为、不改全局测试超时。
2. `CHANGELOG.md`：`## v0.2.11` 段概述改为同时覆盖 v0.2.10 两项补发内容（四态差异指示条 + 大行数窗口渲染）与本次测试稳定性修复；并补 `### 修复` 一条同口径说明。其余 v0.2.10 子节（`### 新增` / `### 不做的事` / `### 升级方式` 等）逐字保留。

事实来源（已在本仓核对，不要凭记忆改写）：`DiffRuler.scale.test.tsx` 现有 `}, 30_000)` 收尾，注释写明 CI attempt1 6,816ms、本机全量 27.42s（69 files / 1104 passed）；v0.2.11 版本收敛已合入 main（`package.json#version = 0.2.11`、`release.yml` dispatch 默认 `v0.2.11`、`docs/release-notes/v0.2.11.md` 现 2266 字符）。

## 验收

- ac-notes-ci-section: `docs/release-notes/v0.2.11.md` 含一个「CI 测试稳定性修复」小节标题，其正文同时包含 `30_000`、`6,816`、`27.42`、`358,000`、`69 files`、`1104`。
- ac-notes-unverified-claims: 该文件不含 `CI 已通过` / `CI 通过` / `Release 已就绪` / `待验证` / `预计通过` / `应该通过`，且不匹配 `\b(?:TODO|TBD|FIXME)\b` 与 40–64 位十六进制串。
- ac-notes-length: 该文件按字符计（`[...text].length`）仍 > 1000。
- ac-notes-memory-whitelist: 该文件匹配 `\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)` 的结果仍按文档顺序恰为 `['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB']`（新增小节不得引入任何内存 / 体积单位数字）。
- ac-notes-existing-whitelist: 该文件仍含 `指示条`、`四态`、`same`、`added`、`removed`、`modified`、`滚动`、`点选`、`跳转`、`minimap`、`不新增扫描`、`不改对比与合并算法`、`升级方式`、`trun_08764efa44c39426`、`2bcdc53e`；H1 含 `v0.2.11`；不含 `200,000`、`10 MB`、`本版新增`、`releases/tag/v0.2.10`、`Full Changelog`。
- ac-changelog-overview: `CHANGELOG.md` 从 `## v0.2.11` 到 `## v0.2.9` 的切片中，`## v0.2.11` 下第一段概述同时含 `指示条`、`窗口渲染`、`测试`、`30s`（或 `30_000`）四类关键词。
- ac-changelog-fix-entry: 同一切片含 `### 修复` 小节，其正文含 `30_000`、`6,816`、`27.42`、`358,000`，并写明 358,000 规模与断言不变。
- ac-changelog-kept-sections: 同一切片仍含 `### 新增`、`### 不做的事`、`### 升级方式` 及既有白名单词 `四态`、`same`、`added`、`removed`、`modified`、`滚动`、`点选`、`跳转`、`minimap`、`不新增扫描`、`不改对比与合并算法`。
- ac-changelog-no-units: 同一切片匹配 `\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)` 的结果为空数组，且不含 `200,000`、`10 MB`、`本版新增`，不匹配 `\b(?:TODO|TBD|FIXME)\b` 与 40–64 位十六进制串。
- ac-changelog-single-heading: 该切片内二级标题恰为 `['v0.2.11']`（不新增其它 `## ` 标题，`v0.2.10` 保持折叠）。
- ac-version-triple: `package.json#version === "0.2.11"`、`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default === 'v0.2.11'`、notes H1 含 `v0.2.11`，三者一致。
- ac-zero-diff: `git diff --stat` 只出现 `CHANGELOG.md` 与 `docs/release-notes/v0.2.11.md` 两个文件；`package.json`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`、`README.md`、`README.zh-CN.md`、`docs/release-evidence/**`、`src/renderer/src/components/DiffRuler.scale.test.tsx` 零 diff；`latestPublishedTag` 仍为 `'v0.2.9'`。
- ac-narrow-test-green: `pnpm test src/main/release-packaging.test.ts` 退出码 0 且 0 failed。
- ac-full-test-green: `pnpm test` 退出码 0，0 failed，记录 files / passed / 耗时。
- ac-gates-green: `.munk/code-gates.json` 的 9 道 gate（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿。
- ac-single-commit: 交付为单 commit，提交信息与交付说明解释上一项（`wi_ws_aefe3a384e8119bb`）漏写原因（其工作树当时未含已合并的 `30_000`），并逐条列出未纳入项。

## 非目标

- 不改 `package.json#version`、不改 `release.yml`（默认 tag / `--notes-file` / preCreate / finalize / 通道）、不改 `docs/release-process.md` 与 `docs/release-signing.md` 的任何锚点。
- 不改 `src/main/release-packaging.test.ts`（包括注释与白名单），不新增 / 删除 / 放宽任何断言。
- 不改 `src/renderer/src/components/DiffRuler.scale.test.tsx`、`vitest.config.mts`、任何产品代码；不重跑 358k 用例的规模或断言。
- 不动 README 两版、不动 `docs/release-evidence/**`、不新建 v0.2.11 证据、不前移 `latestPublishedTag`、不在 CHANGELOG 写内存数字或版本表。
- 不做发版动作：不推 tag、不 dispatch workflow、不创建或修改 GitHub Release / 资产、不碰签名凭据、不删除 `docs/release-notes/v0.2.10.md`。
- 不写未实测宣称（「CI 已通过」「v0.2.11 已可发布」「Release 已就绪」）；顺手美化其它历史条目一律不做。

## 实现约束

- 只允许编辑 `docs/release-notes/v0.2.11.md` 与 `CHANGELOG.md`（外加 `.munk/changes/wi_ws_6ece0152a47c9c1a/**` 的 change pack）；其余文件保持零 diff。
- 新增小节用词口径固定：`358,000` 行同步遍历用例、显式 `30_000` per-test 超时、CI attempt1 `6,816ms`、默认 `5000ms`、本机全量 `27.42s` / `69 files` / `1104 passed`、约 `4.4x` 余量；不写全局 `testTimeout` 被改、不写断言被放宽。
- 事实来源统一沿用 notes 既有口径 `run trun_08764efa44c39426 / commit 2bcdc53e`（与 v0.2.10 实测段落一致），不引入新的 run id / commit / 长 hex。
- 先落 notes 与 CHANGELOG 文案，再跑窄测与全量 test 迭代；红只允许修文案，不允许改测试。
- 单 commit；提交说明逐条列未纳入项与「上一项漏写原因」。
