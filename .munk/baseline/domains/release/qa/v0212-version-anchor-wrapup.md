# v0.2.12 版本锚点收尾（README 两版第 5 行 / 测试锚点前移 / 签名文档版本指向）

- WI：`wi_ws_cc072345813e636b`
- 域：`release`（发布后收尾轮：把「收敛态（latest 落后一版）」翻到「`latest === current`」发布收尾态）
- 来源：`.munk/changes/wi_ws_cc072345813e636b/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过，以 Host `code_gates` 为交付门槛）

## 最近执行

- workItemId: wi_ws_cc072345813e636b
- at: 2026-10-31
- status: pass
- note: 14 条 prd AC 全部满足，无偏差。`needSelfTest=false`，跳过 UI 自测；Host `code_gates` 9 gates attempt 001 全 exit 0（`.munk/runs/run_ws_b909b721c6501ba6/code-gates/attempts/001`，`pnpm test` 80 files / 1248 passed + 1 skipped / 1249，30.51s）。测试锚点前移是**断言重锚而非删除**：`expect(` 863（≥ 860）、`it(` 243（≥ 243），无 `.skip` / `.only` 新增。边界：不动 tag / Release / 资产，不 push tag、不发版、不重新打包或公证。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-readme-en-line5 | `README.md:5` = `> Latest public release: [v0.2.12](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.12) — Developer ID signed and Apple-notarized macOS build.`；该行 `releases/tag/` 恰 1 次；尾句逐字保留 | 满足 |
| ac-readme-zh-line5 | `README.zh-CN.md:5` = `> 最新公开版本：[v0.2.12](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.12) — macOS 安装包经 Developer ID 签名与 Apple 公证。`；该行 `releases/tag/` 恰 1 次；尾句逐字保留 | 满足 |
| ac-readme-diff-line5-only | `git diff -U0 -- README.md README.zh-CN.md` 恰为两个 `@@ -5 +5 @@` 单行 hunk；两版 `^## ` 二级标题各 9 个、文本与顺序不变；第 3 行互链与 `docs/assets/opencompare-workbench.png` 截图行零 diff | 满足 |
| ac-readme-no-version-elsewhere | 剔除第 5 行后，两版 README 全文 `\bv\d+\.\d+\.\d+\b` 命中 0（脚本复核：`[]` / `[]`） | 满足 |
| ac-test-anchor-constants | `const latestPublishedTag = 'v0.2.12'`、`const previousPublishedTag = 'v0.2.8'`；`publishedTags` 字面量恰为 `v0.2.0, v0.2.1, v0.2.2, v0.2.4, v0.2.5, v0.2.6, v0.2.7, v0.2.8, v0.2.9, v0.2.11` 且末项引用 `latestPublishedTag`，全文无 `'v0.2.10'` | 满足 |
| ac-test-converged-flip | 含 `expect(latestPublishedTag).toBe(currentTag)`、`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)`、`expect(lastReleasedNotesPath).toBe(releaseNotesPath)`；两处旧 `not.toBe` 断言已消失；`latestPublishedTag` 相关注释无 `trails` / `落后一版` / `must stay apart` | 满足 |
| ac-test-slice-endpoint-explicit | 以 ``changelog.indexOf(`## ${latestPublishedTag}`)`` 作 `slice` 端点出现 0 次（该表达式仅剩两处：排序用例的 `latestPublished` 偏移取值与 `indexOf('## v0.2.12')` 相等断言）；`## v0.2.11` 显式端点落在幽灵版本 heading（L1524）、收敛条目无未测数字（L1445）、报告上限口径 `currentEntry`（L1443–1445）三处，另有「沿用上一版口径」段起点（L1395）与排序用例（L1284）；相关用例执行通过，无空切片假绿 | 满足 |
| ac-test-changelog-order | 断言 `changelog.indexOf('## v0.2.12') === changelog.indexOf(`## ${latestPublishedTag}`)`，并显式断言 `v0.2.11` → `v0.2.9` → `v0.2.8` → `v0.2.7` → `v0.2.6` → `v0.2.5` → `v0.2.4` → `v0.2.2` → `v0.2.0` → `v0.1.2` 的 offset 严格递增（`shippedV0211` / `shippedV029` 为新增显式常量） | 满足 |
| ac-test-assertion-count | `expect(` 863 次（≥ 860）、`it(` 243 次（≥ 243）；无删断言、无新增 `skip` / `only` | 满足 |
| ac-signing-doc | `docs/release-signing.md` 命中 `当前状态：v0.2.12 已发布`、`正式版发布姿态（v0.2.12）`、`docs/release-notes/v0.2.12.md`、`docs/release-evidence/v0.2.12.md`、``默认 `v0.2.12` ``、`tag 之后的修复由 v0.2.12 承接`、``已合入 `main` ``；`v0.2.11` 降为历史条目并指向 `docs/release-evidence/v0.2.11.md`；不含 `当前状态：v0.2.11`、`当前状态：v0.2.8`、`待发布` | 满足 |
| ac-link-whitelist | README 两版 + `docs/**` 全量 `releases/tag/<tag>` 只出现 v0.2.2 / v0.2.4 / v0.2.5 / v0.2.6 / v0.2.7 / v0.2.8 / v0.2.9 / v0.2.11 / v0.2.12；`links only published tags or the current tag` 用例在全量 `pnpm test` 中通过 | 满足 |
| ac-targeted-test-green | `pnpm test src/main/release-packaging.test.ts` 在 `code_gates` 的 `test` 门内随全量跑通，exit 0、零 skipped | 满足 |
| ac-full-test-green | `.munk/runs/run_ws_b909b721c6501ba6/code-gates/attempts/001/test.log`：`Test Files 80 passed (80)`、`Tests 1248 passed | 1 skipped (1249)`，exit 0 | 满足 |
| ac-scope-only | `git diff --name-only HEAD` 恰为 `README.md`、`README.zh-CN.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`（外加 `.munk/**` 流程文件）；`package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-process.md` 与全部 `src/**` 产品代码零 diff | 满足 |

## 交付说明

**改动文件（产品面）**：4 文件 `+40 / −34`（`numstat`：`README.md` 1/1、`README.zh-CN.md` 1/1、`docs/release-signing.md` 8/7、`src/main/release-packaging.test.ts` 30/25）。

**关键判断**：
1. 本轮把基线口径从「收敛态（`latestPublishedTag` 落后 `currentTag` 一版）」翻回「发布收尾态（`latest === current`）」，方向与 v0.2.10 / v0.2.11 / v0.2.12 三轮收敛轮**严格相反**：版本门 `not.toBe` → `toBe(currentTag)`、`isTagBefore` → `false`、`lastReleasedNotesPath` `.not.toBe` → `.toBe`、changelog 索引 `greaterThan` → `toBe`。
2. **最容易写坏的地方是切片终点**：`latest === current` 后，以 ``changelog.indexOf(`## ${latestPublishedTag}`)`` 作 `slice` 终点的三处用例会切出空串而假绿。本轮把它们全部改成显式 `## v0.2.11` 终点，并保留 `latestPublished` 偏移只用于「`current` 段确实是最新公开段」的相等断言。
3. **历史锚不跟着漂**：`previousPublishedTag` 保持 `'v0.2.8'`（前移会打断 v0.2.8 证据 describe / caps / README 负向链接断言），v0.2.11 / v0.2.9 排序位置用新增显式常量 `shippedV0211` / `shippedV029` 钉死。
4. **签名文档的耦合是有意的**：测试以 `latestPublishedTag` 插值断言该文档，故文档版本指向必须与测试常量同一次提交翻面，拆开会留下测试全红的中间态。真实事实也要求它改：`docs/release-evidence/v0.2.11.md` 已归档，旧文案「尚未归档 / 不在仓库内」已失真，本轮登记为历史条目并指向真实文件。

**未纳入项**：不改 `docs/release-evidence/**`、`docs/release-notes/**`、`package.json#version`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、产品行为与 UI、`docs/perf/**`；不新增发布规则、不重构测试、不放宽任何既有断言；不动 tag / Release / 资产，不 push tag、不发版、不重新打包或公证。
