# Domain: release-version-anchor

发版前的**版本事实收敛**域：把一组已合入的变更固定成一个可发版版本锚点，只允许版本字面量、发版说明与发版证据发生位移，产品行为、对比/合并语义与已公开事实零 diff。本域管 `package.json#version` 单一来源、双语 notes 结构、`CHANGELOG.md` 顶部段、workflow / `docs/release-process.md` 的默认 tag 字面量、已发布证据与台账（`docs/release-evidence/*.md` + `release-packaging.json#evidence.ledger`）、已发布指针（README 第 5 行）与改动白名单；发布顺序归 `domains/release-publish-gate`，验证驱动与 15 项判定归 `domains/release-verify`，打包 / 签名 / 资产归 `domains/release`。

## 范围

- **版本唯一来源**：`package.json#version` 是 tag 唯一来源（`v${version}`）；CHANGELOG 顶部版本标题、两份 notes 标题、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 的默认 tag 字面量必须逐字相等（`judgeVersionSources`）。收敛轮对 `package.json` 只允许改 `version` 一个字段。
- **已发布版本收尾（硬前置）**：收敛轮时，上一公开版本必须已有 `docs/release-evidence/v{prev}.md`（本轮 `v0.2.21`，`status: verified`：tag → commit、公开 Release 事实、Release CI / post-release-verify 结论、12 行资产 name/bytes/sha256、public L1 与未覆盖面），并在 `src/main/__fixtures__/release-packaging.json#evidence.ledger` 追加同版本行（台账 version 集合与证据文件名集合一一相等，各出现一次）。缺此收尾时版本一升，旧 tag 段即从「当前 tag」变历史段，`judgeReleaseHistory` 报 `evidence-missing`，`judgePublishedAnchor` 也会与已发布事实打架。
- **改动白名单（不是硬 5 文件）**：收敛 commit 只允许落在——`package.json#version`、`docs/release-notes/v{version}.md` 与 `.zh-CN.md`、`CHANGELOG.md` 顶部新段、`release.yml` 默认 tag 字面量、`docs/release-process.md` 默认 tag 字面量、`docs/release-evidence/v{prev}.md`、`release-packaging.json` 的证据台账行、`README.md` / `README.zh-CN.md` 第 5 行、本 run 的 `.munk/runs/{runId}/commit-map.md`。白名单外一律不改，尤其 `src/renderer/**`、`src/core/**`、`src/shared/**`、UI / i18n / 产品文案、依赖、`electron-builder.yml`、门清单数值、`docs/release-evidence-ledger.json`、已公开 Release 与资产。
- **版本字面量逐条判定**：只有「下一版默认值」三处前进（`package.json#version`、`release.yml` default、`docs/release-process.md` default）；历史段（旧 `## vX` 段、旧 notes、旧 `docs/release-evidence/*`、台账历史行）一律保留；README / README.zh-CN 第 5 行是已发布指针，只跟随**最新 verified 且已公开**版本（本轮随 `v0.2.21` 公开而前进），其余正文零 diff。
- **双语 notes 结构**：两个文件均非空、逐节镜像；第 1 行标题含新 tag；第 3 行为固定绝对互链（全文各恰 1 条 markdown 链接，无 `<https://…>` 自动链接）；第 4 行起为正文；固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 及中文镜像）；H3 中英一一对应；`Windows portable download` / `Windows 免安装包` 小节恰 2 句并含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`。
- **notes 覆盖面可核**：上一已发布 tag..HEAD 的每条 commit 必须在 notes 有归属，或在 run 的 `commit-map.md` 标注 `internal`（合并 / 基线折叠 / CI / coverage / 测试 / ratchet / 截图取证类提交），映射覆盖率须 100%（本轮 `v0.2.21..HEAD` 10/10），逐行 `commit | subject | 归属`。
- **CHANGELOG 顶部段**：首个版本段为新版本，位于上一版本段之上；段内含「概述 + 改进 / 修复 + 不做的事 + 升级方式」，沿用既有中文风格，历史段逐字节不变。
- **门禁 token 兼容（不改 `src/**` 的前提）**：`src/main/release-version-gate.test.ts` 的 `noteFacts` 硬编码了事实关键词，新 notes 的 `Not in this release` / `不做的事` 必须以**事实陈述**保留（英文 `ignore whitespace` / `off by default` / `spaces` / `tabs` / `one comparison result` / `status bar` / `same session` / `scroll position and switches` / `keeps the previous result` / `swap` / `ruler and counts` / `restores`，中文对应 12 词），CHANGELOG 新段保留 `忽略空白差异` / `默认关闭` / `重载` / `交换` 四 token。这是如实描述未变行为，不是改语义。
- **升级来源锚在已公开版本**：notes / CHANGELOG 的「升级来源」版本号必须等于 README 第 5 行 = 最新 verified 版本（本轮 `v0.2.21`），**不是**上一个 tag。从未发出公开 Release 的 tag（`v0.2.20`，证据记 `status: blocked`）只能以「已打 tag 但从未发出公开 Release」的事实陈述出现，不得占据升级来源位置。
- **scope claim 分段陈述**：发布说明不得用 `presentation only` / `本版只调整界面呈现` 概括全版；`Risk and verification scope` / `风险与验证规模` 须陈述「本轮相对上一版的新增部分是内容兜底判定与截图资产」（本轮）并保留「比较语义、IPC、导出与快照格式均未改动」，中英逐句对应，不写性能 / 内存数字。
- **证据只写可核事实**：资产 name / size / digest 单次取样（`gh api ... --jq '.assets[]|[.name,.size,.digest]|@tsv'`），不下载资产；无 L1 真机场次时显式写明以 post-release-verify aggregate 与 public L1 为准，不预写未发生的 pass/fail，不复制历史版本数字。
- **发布通道只读**：收敛轮不打 tag、不 dispatch release workflow、不 `git push` 新 tag、不改任何已公开 Release 与资产。

## 验收

- **ac-pkg-version**：`package.json#version` 逐字为 `0.2.22`，且该文件 `git diff` 只含 `version` 一行，无其他字段变动。
- **ac-notes-bilingual-exist**：`docs/release-notes/v0.2.22.md` 与 `.zh-CN.md` 均存在且去除空白后非空。
- **ac-notes-head-links**：两份 notes 第 1 行标题均含 `v0.2.22`；第 3 行分别为固定绝对互链（英文 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.22/docs/release-notes/v0.2.22.zh-CN.md)`，中文镜像），每文件恰 1 条 markdown 链接、无 `<https://…>` 自动链接；第 4 行起为非空正文。
- **ac-notes-h2-parity**：中英均含固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade，中文为 本次变化 / Windows 安装包与免安装 zip / macOS 签名与公证 / 不做的事 / 风险与验证规模 / 升级方式），H3 中英一一对应。
- **ac-notes-portable-section**：中英均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，正文恰 2 句（英文按 `(?<=\.)\s+`、中文按 `(?<=。)` 切分，节内不用带点缩写）。
- **ac-notes-content-v0222**：两份 notes 的 `What changed` / `本次变化` 都以事实陈述同时覆盖 (a) 未知扩展名按内容判定（文本按代码打开、二进制拒绝并指明侧别、四个入口一致、已知扩展名零新增读取、提示文案更新）与 (b) 双语 README 截图（四图、语言由设置钉住、provenance 重钉）；不得把任一写成「计划」或「将支持」。
- **ac-notes-accuracy**：`v0.2.21..HEAD` 的合并、基线折叠、CI / 覆盖率 / 测试、截图取证与 ratchet 调整类 commit（`9f59ffa`、`147224b`、`4a31302`、`ba5d5ce`、`070feca`、`72f6f08`、`4795645`）不得写成用户功能；notes 不写性能 / 内存数字、不声称新增自有图标集或未合入能力。
- **ac-commit-map-coverage**：已打 tag `v0.2.21`..`HEAD` 的全部 10 条 commit 在 notes 有归属或在 `.munk/runs/{runId}/commit-map.md` 标注 `internal`；覆盖率 100%，逐行 `commit | subject | 归属`（run 目录不可写则回落 `.munk/changes/{workItemId}/commit-map.md` 并在交付说明点名）。
- **ac-changelog-top**：`CHANGELOG.md` 首个版本段为 `## v0.2.22`，位于 `## v0.2.21` 之上，段内含概述 + `### 改进` / `### 修复` + `### 不做的事` + `### 升级方式`，沿用既有中文风格。
- **ac-changelog-tokens**：`## v0.2.22` 段文本含 `忽略空白差异`、`默认关闭`、`重载`、`交换` 四个 token（`noteFacts` 断言），以事实陈述保留，不是新语义。
- **ac-notes-fact-tokens**：新 notes 的 `Not in this release` / `不做的事` 以事实陈述保留既有 `noteFacts` 关键词（中英各 12 词，见范围节）；`src/**` 不改的前提下通过。
- **ac-upgrade-source**：三处升级来源（英文 notes `## Upgrade` 首句、中文 `## 升级方式` 首句、`CHANGELOG.md` 新段 `### 升级方式` 首句）版本号唯一为 `v0.2.21`，与两份 README 第 5 行一致；文件内不出现 `Upgrade from v0.2.20` / `Upgrade from v0.2.19` / `建议从 v0.2.20` / `建议从 v0.2.19` / `从 v0.2.20 升级` / `从 v0.2.19 升级`。
- **ac-notes-unchanged-scope**：两份 notes 的 `Risk and verification scope` / `风险与验证规模` 陈述「v0.2.22 相对 v0.2.21 的新增部分是内容兜底判定与截图资产」，并保留「比较语义、IPC、导出与快照格式均未改动」/ `Comparison semantics, IPC, export and snapshot formats are untouched.`，中英逐句对应，不写性能 / 内存数字。
- **ac-evidence-v021-doc**：`docs/release-evidence/v0.2.21.md` 存在，全文恰 1 处 `status: verified`，首行标题含 `v0.2.21` 且含中文；含可被 `parseEvidence` 命中的结构——`| tag_name | \`v0.2.21\``、`| 资产数 | 12`、含 `tag → commit` 且带反引号 sha 的行（`8fae4649…` → `32e9369…`）、`releases/tag/v0.2.21` 链接、12 行资产表；记录 Release run `41942345443`（五 job）与 post-release-verify run `41943461686` 的 aggregate 结论。
- **ac-evidence-v021-assets**：该证据 12 行资产的 name / bytes / sha256 与 `gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.21 --jq '.assets[]|[.name,.size,.digest]|@tsv'` 逐行一致（sha256 小写 64 位十六进制，前 `sha256:` 口径与既有证据一致），资产名全部落在 `evidence.assetFamilyPattern` 内，且含 `OpenCompare-0.2.21-win-x64.zip`。
- **ac-evidence-v021-no-fabrication**：证据只写可核事实；无 `v0.2.21` L1 真机场次记录时显式写明「本轮无 L1 真机场次，以 post-release-verify aggregate 与 public L1 为准」，不预写未发生的 pass/fail，不复制 `v0.2.19` 的四态 / 耗时数字。
- **ac-fixture-ledger-row**：`src/main/__fixtures__/release-packaging.json#evidence.ledger` 末尾追加 `{"id":"evidence-v0.2.21","version":"v0.2.21","status":"verified","assets":12}`；台账 version 集合与 `docs/release-evidence/*.md` 文件名集合完全相等（各出现一次），既有行逐字不变。
- **ac-readme-line5**：`README.md` 与 `README.zh-CN.md` 第 5 行指向 `v0.2.21` 的 Release（中英各自既有句式），两文件除第 5 行外零 diff（正文、第 3 行互链、截图引用均不变）。
- **ac-published-anchor**：`judgePublishedAnchor` 返回 `{ ok: true, issues: [] }`——证据派生的最新 verified tag 为 `v0.2.21`，中英 README 第 5 行与之一致；`docs/release-evidence-ledger.json` 零改动，且 `package.json#version` 不参与该判定。
- **ac-workflow-default**：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 逐字为 `'v0.2.22'`，该处只改字面量。
- **ac-process-default**：`docs/release-process.md` 的默认 tag 仍以独立代码片段存在（`parseMarkdown` 的 `codeSpans` 可匹配 `/^default:\s*'([^']+)'$/`），值为 `v0.2.22`；该文件除该字面量外零改动。
- **ac-history-untouched**：`docs/release-notes/v0.2.21.md` / `.zh-CN.md` / `v0.2.20.md` / `.zh-CN.md` 零 diff；`CHANGELOG.md` 自 `## v0.2.21`（含）到文件末尾逐字节不变；`docs/release-evidence/v0.2.19.md`、`v0.2.20.md` 零 diff。
- **ac-diff-scope-whitelist**：改动文件恰为 `package.json`、`docs/release-notes/v0.2.22.md`、`docs/release-notes/v0.2.22.zh-CN.md`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-evidence/v0.2.21.md`、`src/main/__fixtures__/release-packaging.json`、`README.md`、`README.zh-CN.md`（`.munk/**` 不计）；不含 `src/renderer/**`、`src/core/**`、`src/shared/**`、i18n 词典、依赖、`electron-builder.yml`、`docs/release-evidence-ledger.json`、历史 notes / 证据、截图 PNG。
- **ac-gates-green**：`.munk/code-gates.json` 全量 29 门自绿（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `verify-release-gate` / `test-debt-gate`，其中 `test` 覆盖 `release-version-gate` 的 `tag-mismatch` / `missing` / notes 顺序与标题判定、`release-packaging` 的证据台账覆盖与资产行断言）；不得以 skip / 放宽断言 / 删用例换绿灯。
- **ac-no-release-side-effects**：不打 tag、不 `git push` 新 tag、不 dispatch release workflow、不 `gh release edit/upload/delete`；只在本地生成文件，交付为单条提交且工作区干净。

## 非目标

- 不改产品行为：不做 `src/renderer/**` / `src/core/**` / `src/shared/**` 改动，不调 UI、i18n 词典、对比 / 合并语义、IPC、导出与快照格式。
- 不改依赖、`electron-builder.yml`、门禁阈值、`src/main/release-version-gate.test.ts` 的 `noteFacts` 关键词集合；不以放宽门禁换绿灯。
- 不重写历史 notes、历史 `CHANGELOG` 段、既有证据文件与 `docs/release-evidence-ledger.json`；不删除区间内 commit 来赶窗口。
- 不重算 / 不重传资产，不重打 tag，不修改已公开 Release `v0.2.21` / `v0.2.19` 的正文与资产。
- 不做真 draft run（三平台 15/15 → aggregate → publish）；发布动作仍由 Product Owner 在本项合入后触发，本项不声称 `v0.2.22` 已发布。
- 不补 `v0.2.20` 的任何内容：该版已记为「已打 tag 但从未发出公开 Release」，维持 `status: blocked`。

## 实现约束

- **单一来源即契约**：tag 由 `v${version}` 派生，任何默认 tag 字面量的手改都必须与 `package.json#version` 同批且相等（`judgeVersionSources`），禁止引入第二个版本来源或版本工具。
- **证据结构照 `v0.2.19.md`**：`parseEvidence` 依赖 `| 资产数 | 12`、`| tag_name | \`vX\``、含 `tag → commit` + 反引号 sha 的行、`releases/tag/vX` 链接；资产表 12 行且 name 命中 `ASSET_FAMILY`；不得出现非 64 位小写十六进制却看似 sha 的 token（`malformed` 断言）。证据文件与 fixture 台账必须同批追加，缺一即红。
- **notes 由 version 派生**：release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body，任一缺失 / 空白即 fail-closed；两文件不得含 `<details>` / `<summary>` / 独占一行的 `---`；`bodyGate` 断言 `linkCount=1` 与 6 个 H2 顺序。
- **顶段插入不改历史**：CHANGELOG 只在首个版本段之前插入新段，历史段正文与顺序逐字不变。
- **纠偏走等量替换**：事实口径修正优先在既有段落内做等量 / 等句数替换，保持段落切分、空行与句子计数不变；只改列出的定位点，其余文字逐字保留。
- **事实取数一次**：资产 name / size / digest 用 `gh api ... --jq` 单次取样，不下载资产；取不到就写 `blocked` + 来源，不臆造。
- **改动面可审计**：收敛提交为单条提交、交付时工作区干净；`git diff --stat` 只含白名单文件，`git diff README.md` 只有第 5 行一处 hunk，`git diff package.json` 只含 version 行。
- **映射证据先于回执**：`commit-map.md` 在 run 目录（`.munk/runs/{runId}/`），回执写明收敛 commit sha、两份 notes 路径、证据路径、commit-map 路径与映射覆盖率。

## 最近交付证明

- WI：`wi_intake_47bfe8975d010b3e`（v0.2.22 版本与双语发布说明收敛 + v0.2.21 发版收尾；`deliveryIntent: local merge`）
- 日期：2026-11-05
- 结果：`code_gates` passed（**29 gates**，attempt 002，`.munk/runs/run_intake_47bfe8975d010b3e/code-gates/latest.json` `ok: true`、`failedGateIds: []`）。
- 改动面：`package.json`（version → `0.2.22`）、`docs/release-notes/v0.2.22.md` + `.zh-CN.md`（6 H2 同序、各 1 链接、portable 2 句）、`CHANGELOG.md`（顶部 `## v0.2.22` 段）、`docs/release-evidence/v0.2.21.md`（verified，12 资产行）、`src/main/__fixtures__/release-packaging.json`（追加 `evidence-v0.2.21` 台账行）、`README.md` / `README.zh-CN.md`（第 5 行 → `v0.2.21`）、`.github/workflows/release.yml` 与 `docs/release-process.md`（default → `v0.2.22`）。
- 事实依据：`v0.2.21` tag 对象 `8fae4649…` → commit `32e9369…`，`publishedAt 2026-11-05T00:46:30Z`、`draft=false`、12 资产；Release run `41942345443` 五 job success，post-release-verify run `41943461686` aggregate success。升级来源随之从 `v0.2.19` 前移到 `v0.2.21`，`v0.2.20` 仍只以 blocked 事实出现。
- 验收落点：`ac-pkg-version` / `ac-notes-head-links` / `ac-notes-h2-parity` / `ac-notes-portable-section` / `ac-notes-content-v0222` / `ac-notes-accuracy` / `ac-commit-map-coverage`（10/10）/ `ac-changelog-top` / `ac-upgrade-source` / `ac-evidence-v021-doc` / `ac-evidence-v021-assets` / `ac-fixture-ledger-row` / `ac-readme-line5` / `ac-published-anchor` / `ac-history-untouched` / `ac-diff-scope-whitelist` / `ac-gates-green` / `ac-no-release-side-effects`。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无折叠用例。② `v0.2.22` 尚未发布，发布仍由 Product Owner 触发，本项不声称发布验收完成。③ 真 draft run（三平台 15/15 → aggregate → publish）不在本项范围。
