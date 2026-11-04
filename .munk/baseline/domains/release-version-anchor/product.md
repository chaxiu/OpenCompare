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
- **升级来源锚在已公开版本**：notes / CHANGELOG 的「升级来源」版本号必须等于 README 第 5 行的最新已公开版本（本轮 `v0.2.19`），**不是**上一个 tag。上一个 tag 若从未发出公开 Release（`docs/release-evidence/*` 记 `status: blocked`），只能作为「已打 tag 但从未发出公开 Release」的事实陈述出现，不得占据升级来源位置。
- **scope claim 分段陈述**：发布说明不得用 `presentation only` / `本版只调整界面呈现` 概括全版；须拆成「新增部分（相对上一版）只调整界面呈现」与「并入的既有功能沿用上一版已验证实现」两句，保证与 `What changed` 自洽。
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
- **ac-upgrade-source-version**：三处升级来源（英文 notes `## Upgrade` 首句、中文 notes `## 升级方式` 首句、CHANGELOG 新版本段 `### 升级方式` 首句）的版本号唯一为最新已公开版本（本轮 `v0.2.19`），且与 README 第 5 行一致；对应文件不含 `Upgrade from v0.2.20` / `建议从 v0.2.20` / `从 v0.2.20 升级`（中英各含冒号与句号两种写法），CHANGELOG 区间内 `## v0.2.20` 及其后历史段逐字节不变。
- **ac-notes-version-mention-scope**：新版本区间内残留的 `v0.2.20` 只允许出现在「已打 tag 但从未发出公开 Release」事实陈述里（英文 `tagged in v0.2.20 but never reached a public release`、中文 `v0.2.20 已打 tag 但从未发出公开 Release`），不得出现在升级来源位置。
- **ac-scope-claim-partitioned**：两份 notes 的 `## Risk and verification scope` / `## 风险与验证规模` 不含 `This release is presentation only` / `本版只调整界面呈现`；同时含 (a)「v0.2.21 相对 v0.2.20 的新增部分只调整界面呈现」并列举 chrome / toolbar / status bar 与 legend / diff view metrics / token / screenshots，(b)「并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现」；保留 `Comparison semantics, IPC, export and snapshot formats are untouched.` / `比较语义、IPC、导出与快照格式均未改动。` 与不写性能 / 内存数字那句；中英逐句对应。
- **ac-changelog-fix-bullet**：`CHANGELOG.md` 新版本段 `### 修复` 下恰有 1 条 bullet，逐字为 `- 无功能缺陷修复；v0.2.21 新增部分只调整界面呈现，并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现。`
- **ac-history-untouched**：`docs/release-notes/v0.2.20.md` / `.zh-CN.md` 零 diff；`CHANGELOG.md` 中 `## v0.2.20`（含）到文件末尾零 diff。
- **ac-diff-scope-minimal**：改动文件恰为 `docs/release-notes/v0.2.21.md`、`.zh-CN.md`、`CHANGELOG.md` 三个（`.munk/**` 不计），除上述定位点外零 hunk；两份 notes 的 H2 数量 / 顺序 / 链接数（各恰 1 条）/ 标题与切换行、portable 小节句数均不漂移。
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
- 纠偏轮不新增 markdown 链接、不改任何 H2 / H3 标题、不拆段或增删空行（避免 `linkCount` / portable 句数 / H2 顺序断言漂移），不动 README 正文与截图。

## 实现约束

- **单一来源即契约**：tag 由 `v${version}` 派生，任何默认 tag 字面量的手改都必须与 `package.json#version` 同批且相等，禁止引入第二个版本来源或版本工具。
- **notes 由 version 派生**：release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body，任一缺失 / 空白即 fail-closed；中文包在 `<details><summary>简体中文</summary>` 内，两文件不得含 `<details>` / `<summary>` / 独占一行的 `---` 以免破坏折叠组装。
- **顶段插入不改历史**：CHANGELOG 只在首个版本段之前插入新段，历史段正文与顺序逐字不变。
- **纠偏走等量替换**：事实口径修正优先在既有段落内做等量 / 等句数替换，保持段落切分、空行与句子计数不变；只改列出的定位点，其余文字逐字保留。
- **改动面可审计**：收敛提交为单条提交，交付时工作区干净；`git diff --stat` 只含白名单文件，`git diff package.json` 只含 version 行。
- **映射证据先于回执**：`commit-map.md` 在 run 目录（`.munk/runs/{runId}/`），回执写明收敛 commit sha、两份 notes 路径、commit-map 路径与映射覆盖率。

## 最近交付证明

- WI：`wi_intake_6f0640aaf1a59495`（v0.2.21 发布说明口径纠偏：升级来源 `v0.2.20 → v0.2.19` 三处 + scope claim 分段陈述，仅 3 文件 6 处文本；`deliveryIntent: local merge`）
- 日期：2026-11-05
- 结果：`code_gates` passed（**29 gates**，attempt 001，`.munk/runs/run_intake_6f0640aaf1a59495/code-gates/latest.json` `ok: true`、`failedGateIds: []`）。
- 改动面：`docs/release-notes/v0.2.21.md`（`Upgrade` 首句 + `Risk and verification scope` 前两句）、`docs/release-notes/v0.2.21.zh-CN.md`（中英镜像两处）、`CHANGELOG.md`（v0.2.21 `### 升级方式` 首句 + `### 修复` 唯一 bullet）；H2 数量 / 顺序、链接数（各 1）、portable 2 句、标题与切换行均未漂移，`v0.2.20` notes 与 CHANGELOG `## v0.2.20` 之后零 diff。
- 事实依据：`docs/release-evidence/v0.2.20.md` 记 `v0.2.20` tag 指向 `b37fa39` 且从未创建 GitHub Release（`status: blocked`），最新公开版本为 `v0.2.19`（README 第 5 行）——故升级来源必须锚 `v0.2.19`，`v0.2.20` 仅以「已打 tag 未公开」事实出现。
- 验收落点：`ac-upgrade-source-version` / `ac-notes-version-mention-scope` / `ac-scope-claim-partitioned` / `ac-changelog-fix-bullet` / `ac-history-untouched` / `ac-diff-scope-minimal` / `ac-notes-h2-parity` / `ac-notes-order-links` / `ac-notes-portable-section` / `ac-gates-green` / `ac-no-release-side-effects`。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无折叠用例。② 真 draft run（三平台 15/15 → aggregate → publish）仍由 Product Owner 触发，本项不声称发布验收已完成。③ `v0.2.21` 尚无 evidence 文件，发版前不得视作已发布。
