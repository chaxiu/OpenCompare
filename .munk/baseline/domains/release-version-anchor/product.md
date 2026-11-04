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

- **ac-pkg-version**：`package.json#version` 恰为目标版本字面量（本轮 `0.2.21`），且该文件除 `version` 外无其他改动。
- **ac-notes-bilingual-exist**：`docs/release-notes/v{version}.md` 与 `.zh-CN.md` 均存在且去除空白后非空。
- **ac-notes-order-links**：两个 notes 第一行标题均含新 tag；第三行分别为固定绝对切换链接（逐字英文 `English | [简体中文](...zh-CN.md)`、中文 `[English](...v{version}.md) | 简体中文`）；每文件恰好 1 个 markdown 链接且无 `<https://...>` 自动链接；第四行起为非空正文。
- **ac-notes-h2-parity**：两版均含固定 6 个 H2 且顺序一一对应（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade，中文镜像为 本次变化 / Windows 安装包与免安装 zip / macOS 签名与公证 / 不做的事 / 风险与验证规模 / 升级方式）；H3 小节中英一一对应。
- **ac-notes-portable-section**：英 / 中 notes 均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，且正文恰好 2 句（英文按 `(?<=\.)\s+` 切分、中文按 `(?<=。)` 切分，故小节内不用带点缩写）。
- **ac-notes-mapping-coverage**：上一已发布 tag..HEAD 的每条 commit 在 notes 有归属或在 `.munk/runs/{runId}/commit-map.md` 标注 `internal`；覆盖率 100%（本轮 28/28），映射行格式 `commit | subject | 归属`；若 run 目录不可写则回落 `.munk/changes/{workItemId}/commit-map.md` 并在交付说明点名。
- **ac-notes-content-accuracy**：notes 只陈述实际合入内容；internal 类提交（合并 / 基线折叠 / CI / coverage / spike / 测试）不得写成用户功能；不得声称新增自有图标集、不得承诺未合入功能、不写性能或内存数字。
- **ac-changelog-top**：`CHANGELOG.md` 顶部首个版本段为新版本，位于上一版本段之上；段内含概述、改进 / 修复、不做的事、升级方式四类内容；历史段逐字不变。
- **ac-workflow-default**：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为新 tag（本轮 `'v0.2.21'`），且该处只改字面量。
- **ac-process-default**：`docs/release-process.md` 的默认 tag 以**独立代码片段**形式存在（保留反引号，`parseMarkdown` 的 `codeSpans` 可匹配 `/^default:\s*'([^']+)'$/`），值等于 `v${pkg.version}`，且该文件除该字面量外无其他改动。
- **ac-readme-untouched**：`README.md` / `README.zh-CN.md` 第 5 行仍指向最新 verified 证据派生的已发布版本（本轮 v0.2.19），README 正文与截图零改动。
- **ac-gate-tokens**：新 notes 的 `Not in this release` / `不做的事` 以事实陈述保留 `noteFacts` 关键词，CHANGELOG 新段保留其 4 个关键词；`src/**` 不改的前提下满足该断言。
- **ac-scope-whitelist**：收敛 commit 的改动仅落在白名单（版本 / 说明文件 / 本 run `.munk/**`），`git diff --name-only` 不含 `src/**`、UI / i18n / 产品文案、依赖、门清单数值、README、截图、`docs/release-evidence/**`、历史 notes / CHANGELOG 段。
- **ac-coverage-baseline-untouched**：`.munk/baseline/coverage.json` 零改动，除非实测门红并写明红因与改动理由。
- **ac-gates-green**：`.munk/code-gates.json` 全量门禁自绿，含 `release-gate` 的 `tag-mismatch` / `missing` / notes 顺序与标题判定、`release-packaging` 的中英 notes / fail-closed / `<details><summary>简体中文</summary>` 折叠 / `linkCount=1` 断言，以及 `release-artifacts-and-brand` 的 portable 2 句 + 渲染器零 diff 断言；不得以 skip / 放宽断言换取绿灯。
- **ac-no-release-side-effects**：不推 tag、不 dispatch release workflow、不修改任何已公开 Release 与资产；只在本地生成收敛文件。

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

- WI：`wi_intake_c10ed848d591a3ac`（v0.2.21 版本收敛：版本字面量三处前进 + 双语 notes + CHANGELOG 顶段 + 28/28 commit 映射，产品行为零 diff；`deliveryIntent: local merge`）
- 日期：2026-11-05
- 结果：`code_gates` passed（**29 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_c10ed848d591a3ac/code-gates/latest.json` `ok: true`、`failedGateIds: []`）；`test` 门 141 files / 2247 passed + 1 skipped；专项 `verify-release-gate` 81 passed。
- 改动面：`package.json` version `0.2.20 → 0.2.21`（仅此一行）；新建 `docs/release-notes/v0.2.21.md` 与 `.zh-CN.md`（6 H2 镜像 + 中文折叠 + 2 句 portable 小节）；`CHANGELOG.md` 顶部新增 `## v0.2.21`；`release.yml` default `'v0.2.21'`；`docs/release-process.md` 默认 tag `'v0.2.21'`；`README.md` / `README.zh-CN.md` 第 5 行保持 v0.2.19。门禁连带两处夹具刷新：`src/main/__fixtures__/release-packaging.json` 新增 `evidence-v0.2.20`（`status: blocked`）账本行、`docs/visual/v1/baseline-facts.json` 的 `directoryHtml.sha256` 重钉——均为断言输入，非产品行为改动；渲染器目录仍零 diff。
- 映射证据：`.munk/runs/run_intake_c10ed848d591a3ac/commit-map.md`（主路径可写，无需 fallback），7 条用户可见 / 21 条 internal，28/28。
- 事实修正（对初始指令）：`release.yml` 与 `docs/release-process.md` 的默认 tag 必须同批前进——`judgeVersionSources` 要求两处均等于 `v${pkg.version}`，只改 `package.json` 会让 `test` 红。
- 验收落点：`ac-pkg-version` / `ac-notes-bilingual-exist` / `ac-notes-order-links` / `ac-notes-h2-parity` / `ac-notes-portable-section` / `ac-notes-mapping-coverage`（28/28）/ `ac-notes-content-accuracy` / `ac-changelog-top` / `ac-workflow-default` / `ac-process-default` / `ac-readme-untouched` / `ac-gate-tokens` / `ac-scope-whitelist` / `ac-coverage-baseline-untouched` / `ac-gates-green` / `ac-no-release-side-effects`。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无折叠用例。② 真 draft run（三平台 15/15 → aggregate → publish）由 Product Owner 在合入后触发，本项不声称发布验收已完成。③ `docs/release-evidence/v0.2.20.md` 证据未取证前 `v0.2.20` 不得视作已发布；`v0.2.21` 亦尚无证据文件。
