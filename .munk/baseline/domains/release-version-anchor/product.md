# Domain: release-version-anchor

发版前的**版本事实收敛**域：把一组已合入的变更固定成一个可发版版本锚点，只允许版本字面量、发布说明与视觉基线事实发生位移，产品行为、对比/合并语义与已公开事实零 diff。本域管 `package.json#version` 单一来源、双语 notes 结构、`CHANGELOG.md` 顶部段、workflow / `docs/release-process.md` 的默认 tag 字面量、已发布证据与台账（`docs/release-evidence/*.md` + `release-packaging.json#evidence.ledger`）、已发布指针（README 第 5 行）与 `docs/visual/v1/baseline-facts.json` 白名单；发布顺序归 `domains/release-publish-gate`，验证驱动与 15 项判定归 `domains/release-verify`，打包 / 签名 / 资产归 `domains/release`。当前锚点 `v0.2.25`（未发布）；上一公开版本 `v0.2.24` 已发布（`releases/tag/v0.2.24`，tag → `4191a8f`，非 draft），其证据文件与台账仍由发布后收尾项补写。

## 范围

- **版本唯一来源**：`package.json#version` 是 tag 唯一来源（`v${version}`）；五处必须逐字相等——`package.json#version`、`CHANGELOG.md` 首个 `^## ` 标题、`docs/release-notes/v{version}.md` 一级标题内 tag、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 首个 `^default:\s*'([^']+)'$` 代码片段（`judgeVersionSources`）。收敛轮对 `package.json` 只允许改 `version` 一个字段。
- **历史段证据 fail-closed + pending 集合**：`judgeReleaseHistory` 要求除 pending 集合外每个 `## ` 标题都有对应证据文件。pending 集合 = 当前收敛 tag（`v0.2.25`）∪ `pendingEvidence`；后者由 helper 从 announced tag 夹具派生，只在该 tag 尚无证据文件时成立（当前即 `v0.2.24`：已公开、证据与台账未写回），证据写回后自动失效。其余任何历史段缺证据仍报 `evidence-missing`；pending 不是 allowlist，不得把已写回证据的 tag 重新豁免。
- **改动白名单（按写路径可审计，不是固定文件数）**：收敛 commit 只允许落在——`package.json#version`、`docs/release-notes/v{version}.md` / `.zh-CN.md`、`CHANGELOG.md` 顶部段、`release.yml` / `docs/release-process.md` 的 default tag 字面量、因版本号进入产物而重算的 `docs/visual/v1/baseline-facts.json#directoryHtml` / `refreshed`、`release-gate.ts` 的 pending 集合与 helper 的派生（不加测试行）以及本域基线。禁止改动 `src/renderer/**`、`src/core/**`、`src/shared/**` 产品逻辑与 UI 文案、依赖、`electron-builder.yml`、门清单数值、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`release-packaging.json#evidence`、README 第 5 行、`docs/release-notes` 之外的发布文档与已公开 Release / 资产。
- **版本字面量逐条判定**：只有「下一版默认值」三处前进（`package.json#version`、`release.yml` default、`docs/release-process.md` default）；**已公开**版本的历史段（旧 `## vX`、旧 notes、旧证据、台账历史行）逐字节保留；README / README.zh-CN 第 5 行是已发布指针，跟随**最新已公开**版本（当前 `v0.2.24`），本项不改。
- **双语 notes 结构**：两个文件均非空、逐节镜像；第 1 行标题含新 tag（`# OpenCompare v0.2.25 release notes` / `# OpenCompare v0.2.25 发布说明`）；第 3 行为固定绝对互链且逐字符等于 `release-packaging.json#notesLinks` 模板；全文各恰 1 条 Markdown 链接；固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 及中文镜像 `NOTES_H2_PAIRS`）；`Windows portable download` / `Windows 免安装包` 小节恰 2 句并含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`。
- **notes 覆盖面可核**：`What changed` / `本次变化` 必须写清本版三项 xlsx 能力（取值层 + 钉版依赖、解析上限与 zip bomb 拒绝、工作台双簿四态）与两条修复（沙箱 renderer 打开工作簿、二次启动文件参数接管），并逐条对齐 `v0.2.24..HEAD` 的用户可见提交；`.munk` 基线 / change-pack / 证据类提交只作 internal，不进入用户可见小节。不得出现未发生的功能描述，不重复上一已发布版本内容。
- **CHANGELOG 顶部段**：首个版本段为 `## v0.2.25`，置于 `## v0.2.24` 之上，不重复、不倒序；段内沿用「概述 + 改进 / 修复 / 不做的事 / 升级方式」，与 notes 同源一致；历史段逐字节不变。
- **视觉基线事实**：版本号内嵌目录报告 HTML，bump 后 `docs/visual/v1/baseline-facts.json` 的 `directoryHtml.bytes` / `sha256` 与 `refreshed`（commit / appVersion / capturedAt / bytes / sha256）必须用 `VISUAL_BASELINE_WRITE=1` 真实重算写入（`refreshed.appVersion` 跟随 `APP_VERSION` 变 `0.2.25`）；`preToken` 与顶层 `commit` 逐字段不变；禁止手改 sha。
- **不宣布维护态**：CHANGELOG `v0.2.25` 段与中英 notes 不出现 `feature-frozen` / `feature frozen` / `maintenance mode` / `维护态` / `冻结开发`。

## 验收

- **ac-version-single-source**：`package.json#version` 逐字为 `0.2.25` 且大于 last tag `v0.2.24`；`CHANGELOG` 首个 `## ` 标题、`docs/release-notes/v0.2.25.md` 一级标题内的 tag、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 中 `default: '…'` 代码片段全部为 `v0.2.25`；`pnpm test src/main/release-version-gate.test.ts` 的 `version single source` 与 `repository release facts` 用例全绿。
- **ac-notes-bilingual**：两个 notes 文件均存在、非空；标题与第 3 行语言切换逐字符符合 `notesLinks` 模板；每个文件恰 1 条 Markdown 链接、6 个 H2 按 `NOTES_H2_PAIRS` 逐位对位；xlsx 三项能力与两条修复都有条目，并由 `pnpm test src/main/release-version-gate.test.ts` 的 `states the current release facts` 用例按 token 断言（`.xlsx` / `SheetJS` / `XLSX_LIMIT_EXCEEDED` / `zip bomb` / `four-state` / `Buffer` / `second launch` 与中文镜像 `工作簿` / `四态` / `二次启动` 等，只加 token 不加行）；internal 提交不进入用户可见小节。
- **ac-changelog**：`## v0.2.25` 位于 `v0.2.24` 之前且不重复、不倒序，段内含 `忽略空白差异`、`默认关闭`、`重载`、`交换` 四 token；`v0.2.24` 及更早历史段逐字节不变。
- **ac-commit-map**：清单由 `git log --oneline v0.2.24..HEAD` 生成（35 个提交），逐条映射到 notes 小节或显式标 internal；用户可见项至少覆盖 `865b0bc`、`56d1ead`、`a67d9f9`、`3b4391b`、`1f16d53`，其余 `.munk` 基线与证据类提交为 internal。
- **ac-gates-green**：`pnpm test` 全量绿（含 `release-version-gate`、`release-packaging`、`release-artifacts-and-brand`、`release-evidence` 四个套件），`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web` 通过，`node scripts/test-debt-gate.mjs` 通过（零新增测试行）。
- **ac-pending-evidence**：`pendingEvidence` 只由 announced 夹具在当前无证据文件时派生；`judgeReleaseHistory` 对 `v0.2.24` 无 `evidence-missing`，对其它缺证据的历史段仍报 `evidence-missing`（既有 `a heading has no evidence file` 用例保持红）。
- **ac-baseline-facts-refreshed**：`VISUAL_BASELINE_WRITE=1 pnpm vitest run scripts/visual-baseline-facts.test.mjs` 后 `directoryHtml.refreshed.appVersion` 为 `0.2.25`、`refreshed.commit` 为 40 位真实提交、`refreshed.sha256` / `bytes` 与重算一致，`directoryHtml.sha256` / `bytes` 与 `refreshed` 相同，`directoryHtml.preToken` 与顶层 `commit` / `capturedAt` 逐字段不变；随后不带写开关的同一用例全绿。
- **ac-no-publish**：`git tag --list` 无新增 tag；未 `git push` tag、未 `workflow_dispatch`、未执行 `gh release create/edit/upload/delete`；`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`src/main/__fixtures__/release-packaging.json`、`src/main/__fixtures__/release-announced-tag.json`、`README.md` / `README.zh-CN.md` 第 5 行与已公开 Release 与资产零 diff。

## 非目标

- 不改任何产品代码、对比 / 合并语义、四态计数、忽略开关、导出 / 快照、IPC、主题 token 与 xlsx 解析实现。
- 不创建 `docs/release-evidence/v0.2.24.md`、不追写 v0.2.24 台账、不改 `release-packaging.json#evidence.currentVersion`（仍为 `v0.2.23` 资产台账）——证据写回属发布后收尾项，本项只保证缺证据期间门自绿且口径可审。
- 不推 tag、不 dispatch release workflow、不创建 / 修改 Release 与资产。
- 不改 README 第 5 行以外的指针语义、不重采 README 截图、不切维护态；不修 L3 遗留的「左右独有 sheet 是否可点开」与 `node:zlib` externalize 告警。
- 不新增发布文档、不做 GUI / 设备验收。

## 实现约束

- **门禁取自真实读取路径**：改动必须逐项对齐 `src/main/release-doc-fixtures.test-helpers.ts` + `src/main/release-gate.ts`——`judgeVersionSources` 读五处版本来源并互相相等；`judgePublishedAnchor` 用「已 verified 证据 ∪ announced tag 的最大 semver」比对两版 README 第 5 行（当前 `v0.2.24`）；`judgeReleaseHistory` 的 pending 集合 = `currentTag` ∪ `pendingEvidence`。
- **pendingEvidence 单一来源**：helper 只在 `announcedPublicTag !== ''` 且证据目录里没有该 tag 时派生，不允许在测试或脚本里另写版本字面量；`release-gate.ts` 保持纯函数、零 fs。
- **notes 门禁逐字符**：第 1 行标题、第 3 行语言切换按 `release-packaging.json#notesLinks` 模板，全文 Markdown 链接数 = 1，H2 顺序按 `NOTES_H2_PAIRS`；不得含 `<details>` / `<summary>` / 独占一行的 `---`；缺失 / 空白即 fail-closed。
- **现有文件锚点写前先读**：`package.json:3`、`.github/workflows/release.yml:17`、`docs/release-process.md:8`、`CHANGELOG.md` 顶部、`docs/visual/v1/baseline-facts.json`。
- **单一来源即契约**：tag 由 `v${version}` 派生，任何 default tag 字面量手改必须与 `package.json#version` 同批且相等；禁止引入第二个版本来源或版本工具。
- **基线事实只由写开关产生**：`APP_VERSION` 来自 `src/shared/appVersion.ts` → `package.json`，必须 `VISUAL_BASELINE_WRITE=1` 重算，不得手写 JSON / sha。
- **测试债与覆盖率 freshness**：本项预期零测试改动（现有四套件按 `package.json#version` 参数化）；`repoTestLines` / `repoTestCases` 不增行不减例；覆盖率 freshness 以最近的 semver tag（`v0.2.24`）为准，升 `0.2.25` 但不打 tag 不会让门变红，**不要**重采 `.munk/baseline/coverage.json`。
- **发布事实只读**：任何 GitHub 交互只允许只读查询；本项不需要联网取证，不写入任何已公开事实。

## 最近交付证明

- WI：`wi_intake_484cf84d5e872418`（`release` 任务「缺收敛 commit」空转的收敛提交）。
- 日期：2026-11-18。
- 改动面：`package.json#version` → `0.2.25`；`release.yml` / `docs/release-process.md` 默认 tag → `v0.2.25`；新增 `docs/release-notes/v0.2.25.md` / `.zh-CN.md`；`CHANGELOG.md` 顶部新增 `## v0.2.25`；`docs/visual/v1/baseline-facts.json` 以写开关真实重算（`refreshed.appVersion` = `0.2.25`）；`release-gate.ts` + helper 增加 `pendingEvidence`（`v0.2.24` 已公开但证据未写回期间豁免）；测试零新增行，仅在既有 token 用例内扩断言。
- 验收落点：`ac-version-single-source`、`ac-notes-bilingual`、`ac-changelog`、`ac-commit-map`、`ac-gates-green`、`ac-pending-evidence`、`ac-baseline-facts-refreshed`、`ac-no-publish`。
- 注：`v0.2.24` 的证据 / 台账仍未写回（属发布后收尾项）；pending 豁免只在证据缺席时生效，写回后 `judgeReleaseHistory` 自动恢复对该段的证据要求。
