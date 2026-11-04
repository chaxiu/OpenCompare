# Domain: release-version-anchor

发版前的**版本事实收敛**域：把一组已合入的变更固定成一个可发版版本锚点，只允许版本字面量与发版说明发生位移，产品行为、对比/合并语义与已公开事实零 diff。本域管 `package.json#version` 单一来源、双语 notes 结构、`CHANGELOG.md` 顶部段、workflow / `docs/release-process.md` 的默认 tag 字面量、已发布指针（README 第 5 行）与改动白名单；发布顺序归 `domains/release-publish-gate`，验证驱动与 15 项判定归 `domains/release-verify`，打包 / 签名 / 资产归 `domains/release`（本域是它「版本收敛轮」口径的收敛面定义）。

## 范围

- **版本唯一来源**：`package.json#version` 是 tag 唯一来源（`v${version}`）；CHANGELOG 顶部版本标题、两份 notes 标题、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 的默认 tag 字面量必须逐字相等（`judgeVersionSources`）。收敛轮对 `package.json` 只允许改 `version` 一个字段。
- **改动白名单（不是硬 5 文件）**：收敛 commit 只允许落在这几处——`package.json#version`、`docs/release-notes/v{version}.md` 与 `.zh-CN.md`、`CHANGELOG.md` 顶部新段、`release.yml` 的默认 tag 字面量、`docs/release-process.md` 的默认 tag 字面量、本 run 的 `.munk/runs/{runId}/commit-map.md`。白名单外一律不改，尤其 `src/**`、UI / i18n / 产品文案、依赖、门清单数值、已公开 Release 与资产。
- **版本字面量逐条判定**：只有「下一版默认值」三处前进（`package.json#version`、`release.yml` default、`docs/release-process.md` default）；历史段（旧 `## vX` 段、旧 notes、`docs/release-evidence/*`、`src/main/__fixtures__/release-packaging.json` 的历史账本行）一律保留；README / README.zh-CN 第 5 行的「最新公开版本」是已发布指针，**不得跟随前进**。
- **双语 notes 结构**：两个文件均非空、逐节镜像；第 1 行标题含新 tag；第 3 行为固定绝对互链（全文各恰 1 条 markdown 链接）；第 4 行起为正文；固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 及中文镜像）；`Windows portable download` / `Windows 免安装包` 小节恰 2 句并含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`。
- **notes 覆盖面可核**：上一已发布 tag..HEAD 的每条 commit 必须在 notes 有归属，或在 run 的 `commit-map.md` 标注 `internal`（合并 / 基线折叠 / spike 类提交），映射覆盖率须 100%，逐行 `commit | subject | 归属`。
- **CHANGELOG 顶部段**：首个版本段为新版本，位于上一版本段之上；段内含「概述 + 改进 / 修复 + 不做的事 + 升级方式」，沿用既有中文风格，不改写历史段。
- **门禁 token 兼容（不改 `src/**` 的前提）**：`src/main/release-version-gate.test.ts` 的 `noteFacts` 硬编码了上一版 notes 的事实关键词，因此新 notes 的 `Not in this release` / `不做的事` 必须以**事实陈述**保留这些未变行为的关键词（本次：`ignore whitespace` / `off by default` / `spaces` / `tabs` / `one comparison result` / `status bar` / `same session` / `scroll position and switches` / `keeps the previous result` / `swap` / `ruler and counts` / `restores` 及对应中文），CHANGELOG 段同理（`忽略空白差异` / `默认关闭` / `重载` / `交换`）。这是如实描述上一版未变行为，不是改语义。
- **发布通道只读**：收敛轮不打 tag、不 dispatch release workflow、不 `git push` 新 tag、不改任何已公开 Release 与资产，也不做视觉轮内容。

## 验收

- **ac-pkg-version**：`package.json#version` 恰为目标版本字面量（本轮 `0.2.20`），且该文件除 `version` 外无其他改动。
- **ac-notes-bilingual-exist**：`docs/release-notes/v{version}.md` 与 `.zh-CN.md` 均存在且去除空白后非空。
- **ac-notes-order-links**：两个 notes 第一行标题均含新 tag；第三行分别为固定绝对切换链接；每文件恰好 1 个 markdown 链接；第四行起为正文。
- **ac-notes-h2-parity**：两版均含固定 6 个 H2 且顺序一一对应（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade，中文镜像同序）。
- **ac-notes-portable-section**：英 / 中 notes 均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，且正文恰好 2 句。
- **ac-notes-mapping-coverage**：上一已发布 tag..HEAD 的每条 commit 在 notes 有归属或在 `.munk/runs/{runId}/commit-map.md` 标注 `internal`；覆盖率 100%（本轮 34/34），映射行格式 `commit | subject | 归属`。
- **ac-changelog-top**：`CHANGELOG.md` 顶部首个版本段为新版本，位于上一版本段之上；段内含概述、改进 / 修复、不做的事、升级方式四类内容。
- **ac-workflow-default**：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为新 tag（本轮 `'v0.2.20'`），且该处只改字面量。
- **ac-process-default**：`docs/release-process.md` 的 `default: 'v{version}'` 与 `v${pkg.version}` 相等，且该文件除该字面量外无其他改动。
- **ac-readme-untouched**：`README.md` / `README.zh-CN.md` 第 5 行仍指向上一已发布版本（本轮 v0.2.19），与最新 verified 证据一致。
- **ac-scope-whitelist**：收敛 commit 的改动仅落在白名单（版本 / 说明文件 + commit-map），`git diff --name-only` 不含 `src/**`、UI / i18n / 产品文案、依赖、门清单数值、已公开 Release / 资产。
- **ac-gates-green**：`.munk/code-gates.json` 全量门禁自绿，含 `release-gate` 的 `tag-mismatch` 判定与 `release-packaging` 的中英 notes / fail-closed / `<details><summary>简体中文</summary>` 折叠断言。

## 非目标

- 不修 bug、不调 UI、不改对比 / 合并语义、不新增依赖、不碰门清单数值、不做视觉轮内容。
- 不推 tag、不 dispatch release workflow、不修改任何已公开 Release 与资产、不改 README 第 5 行。
- 不重写历史 notes / CHANGELOG / evidence，不删减区间内 commit 来赶窗口。
- 不改 `src/main/release-version-gate.test.ts` 的 `noteFacts` 关键词集合（`src/**` 禁改）；不以放宽门禁换取绿灯。

## 实现约束

- **单一来源即契约**：tag 由 `v${version}` 派生，任何默认 tag 字面量的手改都必须与 `package.json#version` 同批且相等，禁止引入第二个版本来源或版本工具。
- **notes 由 version 派生**：release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body，任一缺失 / 空白即 fail-closed；中文包在 `<details><summary>简体中文</summary>` 内，两文件不得含 `<details>` / `<summary>` / 独占一行的 `---` 以免破坏折叠组装。
- **顶段插入不改历史**：CHANGELOG 只在首个版本段之前插入新段，历史段正文与顺序逐字不变。
- **改动面可审计**：收敛提交为单条提交，交付时工作区干净；`git diff --stat` 只含白名单文件，`git diff package.json` 只含 version 行。
- **映射证据先于回执**：`commit-map.md` 在 run 目录（`.munk/runs/{runId}/`），回执写明收敛 commit sha、两份 notes 路径、commit-map 路径与映射覆盖率。

## 最近交付证明

- WI：`wi_intake_87c2f497499650b9`（v0.2.20 版本收敛：版本字面量三处前进 + 双语 notes + CHANGELOG 顶段，产品行为零 diff；`deliveryIntent: local merge`）
- 日期：2026-11-04
- 结果：`code_gates` passed（**29 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_87c2f497499650b9/code-gates/latest.json` `ok: true`、`failedGateIds: []`）；`test` 门 135 files / 2175 passed + 1 skipped。
- 改动面：`package.json` version `0.2.19 → 0.2.20`（仅此一行）；新建 `docs/release-notes/v0.2.20.md` 与 `.zh-CN.md`（6 H2 镜像 + 中文折叠 + 2 句 portable 小节）；`CHANGELOG.md` 顶部新增 `## v0.2.20`（概述 / 改进 / 修复 / 不做的事 / 升级方式）；`release.yml` default `'v0.2.20'`；`docs/release-process.md` 默认 tag `'v0.2.20'`；`README.md` / `README.zh-CN.md` 第 5 行保持 v0.2.19；`src/**` 零 diff。
- 验收落点：`ac-pkg-version` / `ac-notes-bilingual-exist` / `ac-notes-order-links` / `ac-notes-h2-parity` / `ac-notes-portable-section` / `ac-notes-mapping-coverage`（34/34）/ `ac-changelog-top` / `ac-workflow-default` / `ac-process-default` / `ac-readme-untouched` / `ac-scope-whitelist` / `ac-gates-green`。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无折叠用例。② 真 draft run（三平台 15/15 → aggregate → publish）由 Product Owner 在合入后触发，本项不声称发布验收已完成。③ `docs/release-evidence/v0.2.20.md` 与资产台账仍为空，等真实发版取证后回填。
