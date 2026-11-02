# v0.2.17 版本收敛与双语发布说明：版本单点 / 双语 notes / CHANGELOG / 发布文档 / 发布门「已发布锚」与「当前版本源」解耦

- WI：`wi_intake_80e86544f039944d`
- 域：`release`（发布面版本锚点、双语文案与发布门断言；被测改动落在 `package.json`、`CHANGELOG.md`、两份 v0.2.17 notes、`docs/release-process.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/main/release-gate.ts` 与其两个测试文件 + 共享 helper）
- 来源：`.munk/changes/wi_intake_80e86544f039944d/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 20 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main @bef2a0f`（已含 test-debt ratchet 门，门禁矩阵 **22 门**）
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`package.json` 1/1、`.github/workflows/release.yml` 1/1、`CHANGELOG.md` +21/−0、`docs/release-process.md` 2/2、`docs/release-signing.md` 4/3、`src/main/release-gate.ts` 82/7、`src/main/release-doc-fixtures.test-helpers.ts` 21/2、`src/main/release-packaging.test.ts` 8/4、`src/main/release-version-gate.test.ts` 49/59，外加新增未跟踪 `docs/release-notes/v0.2.17.md` 与 `docs/release-notes/v0.2.17.zh-CN.md`（各 45 行）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-package | `node -p "require('./package.json').version"` = `0.2.17`；`git diff --numstat -- package.json` = `1 1`，唯一 hunk 只改 `version` 行（`0.2.16` → `0.2.17`），其余字段字节不变；版本合法 semver | 满足 |
| ac-workflow-default-tag | `release.yml` 仅 `workflow_dispatch.inputs.tag.default` 由 `'v0.2.16'` 改 `'v0.2.17'`（`git diff` 单 hunk 1/1）；触发方式、checkout、gates、打包矩阵、finalize、双语 body 组装与链接门零 diff | 满足 |
| ac-readme-published-anchor | 两版 README 零 diff；第 5 行仍为 `v0.2.16` 且各恰 1 个 `releases/tag/v0.2.16` 链接；两版全文 `v0.2.17` 命中 0、无「待发布」字样 | 满足 |
| ac-notes-files-exist | `docs/release-notes/v0.2.17.md` 与 `v0.2.17.zh-CN.md` 均存在、各 45 行、非空 | 满足 |
| ac-notes-title-and-switch | 两份第 1 行分别为 `# OpenCompare v0.2.17 release notes` / `# OpenCompare v0.2.17 发布说明`；第 3 行逐字为 `English \| [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.zh-CN.md)` 与 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.md) \| 简体中文`，各只有 1 条 markdown 链接且为 tag 固定绝对 URL | 满足 |
| ac-notes-h2-parity | 两版各 6 个 `## ` 标题、数量相同且逐项对应：`What changed`/`本次变化` → `Windows installer and portable zip`/`Windows 安装包与免安装 zip` → `macOS signing and notarization`/`macOS 签名与公证` → `Not in this release`/`不做的事` → `Risk and verification scope`/`风险与验证规模` → `Upgrade`/`升级方式`；由 `judgeNotesHeadings` + `NOTES_H2_PAIRS` 断言（顺序错位 / 少一节各成失败用例） | 满足 |
| ac-notes-template-move | 两版正文均成段覆盖五项事实：`Actions` 列 / 默认复制、显式勾选才移动、写入后删除源前校验 `sha256` + 整秒 `mtimeSec`、校验失败保留源与目标且不回滚、其余行继续完成 | 满足 |
| ac-notes-safety-and-i18n | 两版均覆盖大小写不敏感卷上 `Logo.png` / `logo.png` 折叠同一槽位（内容不同则保持冲突）、绝对路径 / 盘符 / `..` 段写入前拒绝 | 满足 |
| ac-notes-retained-sections | 两版保留 NSIS 安装包 + 免安装 zip、macOS Developer ID 签名 + Apple 公证、`Not in this release` / `不做的事`、`Risk and verification scope` / `风险与验证规模`、`Upgrade` / `升级方式` | 满足 |
| ac-changelog-top | `CHANGELOG.md` 首个 `## ` 标题为 `## v0.2.17`（行 5），其后依次 `## v0.2.16`（24）/ `## v0.2.15`（46），无重复版本标题；历史条目零删除行；新段含改进 / 不做的事 / 升级方式（后续 `wi_intake_792a3d61cf3bfc73` 去重后收敛为**两项**用户可见变化） | 满足 |
| ac-release-docs-sync | `docs/release-process.md` 含 `default: 'v0.2.17'`；`docs/release-signing.md` 含 `正式版发布姿态（v0.2.17）`、`本版发布说明见 docs/release-notes/v0.2.17.md`、补发默认 `v0.2.17`，同时保留 `当前状态：v0.2.16 已发布` 与 `docs/release-evidence/v0.2.16.md` 链接；新增一条「v0.2.17 待发布、尚未打 tag、未写发布证据」 | 满足 |
| ac-published-tag-decoupled | `judgeVersionSources` 移除 `readmeLine5Tag` 字段（`VersionSourceFacts` 4 项）；新增纯函数 `judgePublishedAnchor({readmeLine5Tag, readmeZhLine5Tag, publishedTag})`，`publishedTag` 由 `release-doc-fixtures.test-helpers` 从 `docs/release-evidence-ledger.json` 的 `versions[]` ∪ `docs/release-evidence/*.md` 中 `status=verified` 的 tag 取 semver 最大值派生，断言两版 README 第 5 行等于该 tag；`publishedTag` 为空时报 `published-tag-missing`；不再要求 README 等于 `package.json#version` | 满足 |
| ac-current-tag-sources | `judgeVersionSources` 断言 CHANGELOG 顶部、发布说明标题、`release.yml` dispatch 默认值、`docs/release-process.md` 默认值均等于 `v${pkg.version}`；四类源各保留「指向别处」失败用例，缺失 / 指向别处即 `tag-mismatch` 且带具体文档 path | 满足 |
| ac-pending-evidence-allowed | `judgeNotesPresence` 删除 `evidenceExists` 分支（当前 tag 未发布时不再报 `evidence-missing`），英文 / 中文 notes 缺一仍 `notes-missing` fail-closed；`judgeReleaseHistory` 对 `heading === facts.currentTag` 豁免证据缺失，历史版本与「verified 证据缺 changelog 条目」仍红；`release-packaging.test.ts` 的当前 tag 台账行比对改为「证据文件存在时才比对」（`if (current !== undefined)`），不再要求 `docs/release-evidence/v0.2.17.md` 存在 | 满足 |
| ac-evidence-ledger-data-driven | 台账断言仍由 `docs/release-evidence-ledger.json` 与 `src/main/__fixtures__/release-packaging.json` 驱动，`release-gate.ts` / helper / 两个测试文件内无当前或已发布版本号硬编码；`test-debt-gate` 在 `0.2.17` 下扫 `src/` / `scripts/` / `docs/` 的 `.ts` / `.tsx` 命中 **0** 处版本字面量 | 满足 |
| ac-zh-details-fold | `release.yml` 的 `<details><summary>简体中文</summary>` 组装与 finalize 折叠块断言逐字保留（行 236 组装、行 788 缺块 fail-closed），中英段各携带 `${RELEASE_TAG}` 的既有断言未改 | 满足 |
| ac-no-version-literal-in-code | 同 ac-evidence-ledger-data-driven：`test-debt-gate` 实测 exit 0，版本字面量命中 0；新增断言一律用合成 tag（`v9.9.9` / `v1.2.2` / `v1.2.3`） | 满足 |
| ac-no-release-evidence-0217 | `docs/release-evidence/v0.2.17.md` 不存在（`ls` ENOENT）；既有 `docs/release-evidence/*.md` 与 `docs/release-evidence-ledger.json` 零 diff，已公开 Release 与资产引用未改 | 满足 |
| ac-code-gates-22 | `.munk/code-gates.json` 22 门全部 exit 0（attempt 001，`.munk/runs/run_intake_80e86544f039944d/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (22 gates, attempt 001)"`、`failedGateIds: []`）；`test` 门 115 files / **1802 passed + 1 skipped**（1803）；`test-debt-gate`：`repoTestLines` 实测 **42718** ≤ ceiling 42724、`repoTestCases` 实测 **1373** ≥ floor 1373 | 满足 |
| ac-delivery-local-merge-only | 交付只走 `munk_local_merge`；不打 tag、不 dispatch、不改已公开 Release / 资产、不写 `release-evidence/v0.2.17.md` | 满足 |

## 关键判定口径

- **「正在收敛的版本」与「已发布版本」彻底解耦**：README 第 5 行 = 最新 verified tag（数据派生），`package.json#version` 只对齐 CHANGELOG 顶部 / notes 标题 / dispatch 默认值 / 发布流程默认值。收敛轮不再改 README。
- **发布门的两条豁免都是「当前 tag 尚未发布」**：notes 不要求证据文件、changelog 当前段不要求证据。豁免键是 `currentTag`（由 `package.json#version` 派生），因此**发布后必须写 `docs/release-evidence/<currentTag>.md` 或 bump 版本**，否则该版本的证据缺口在门禁上无信号——这是本轮唯一的「豁免即盲区」。
- **已发布锚的副作用**：`publishedTag` 取「台账 ∪ 证据目录」的 verified 最大值。一旦新增证据文件，锚点立刻前移，两版 README 第 5 行必须同提交跟上，否则 `judgePublishedAnchor` 红。
- **测试口径变化**：`src/main/release-version-gate.test.ts` 172 行（原 182），用例由「逐字段 path 断言」收敛为 `expectVerdict` 表驱动（判 `ok` + `codes` 序列 + path 非空），并新增 `published anchor` 4 例、`H2 parity` 3 例、`pending current tag has no evidence` 1 例；`release-packaging.test.ts` 508 行，仅当前 tag 台账比对改为存在性守卫。

## 遗留 / 边界

- `v0.2.17` 尚未打 tag，两版 README、`docs/release-evidence/**`、`latestPublishedTag` 相关历史锚仍停在 v0.2.16；发版后的收尾（README 第 5 行前移 + 证据归档 + 签名文档事实回写）是独立动作。
- 本次未验证：真实 Release 正文的双语 H2 顺序、绝对链接门与 finalize 折叠块在公开产物上的实际表现——这些仍以 tag 触发的那次 CI 为准，本文件不写「已发布验证」。
- 22 门结构未改，`.munk/code-gates.json` 零 diff。
