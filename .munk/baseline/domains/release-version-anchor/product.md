# Domain: release-version-anchor

发版前的**版本事实收敛**域：把一组已合入的变更固定成一个可发版版本锚点，只允许版本字面量、发版说明与发版证据发生位移，产品行为、对比/合并语义与已公开事实零 diff。本域管 `package.json#version` 单一来源、双语 notes 结构、`CHANGELOG.md` 顶部段、workflow / `docs/release-process.md` 的默认 tag 字面量、已发布证据与台账（`docs/release-evidence/*.md` + `release-packaging.json#evidence.ledger`）、已发布指针（README 第 5 行）与改动白名单；发布顺序归 `domains/release-publish-gate`，验证驱动与 15 项判定归 `domains/release-verify`，打包 / 签名 / 资产归 `domains/release`。本域区分两种历史口径：**已公开版本的历史不可变**；**从未公开的中间版本不得留兜底记录**——后者原地改写为下一版并删除旧 notes pair。

## 范围

- **版本唯一来源**：`package.json#version` 是 tag 唯一来源（`v${version}`）；CHANGELOG 顶部版本标题、两份 notes 标题、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 的默认 tag 字面量必须逐字相等（`judgeVersionSources`）。收敛轮对 `package.json` 只允许改 `version` 一个字段。
- **已发布版本收尾（硬前置）**：收敛轮时，上一公开版本必须已有 `docs/release-evidence/v{prev}.md`（当前 `v0.2.21`，`status: verified`：tag → commit、公开 Release 事实、Release CI / post-release-verify 结论、12 行资产 name/bytes/sha256、public L1 与未覆盖面），并在 `src/main/__fixtures__/release-packaging.json#evidence.ledger` 追加同版本行（台账 version 集合与证据文件名集合一一相等，各出现一次）。缺此收尾时版本一升，旧 tag 段即从「当前 tag」变历史段，`judgeReleaseHistory` 报 `evidence-missing`，`judgePublishedAnchor` 也会与已发布事实打架。该收尾一旦完成即不再重复：未公开的中间版本（`v0.2.22`）不新增证据文件或台账行。
- **改动白名单（分批可审计，不是固定 5 文件）**：收敛 commit 只允许落在——`package.json#version`、`docs/release-notes/v{version}.md` 与 `.zh-CN.md`（含删除上一未公开版本的旧 pair）、`CHANGELOG.md` 顶部段、`release.yml` 与 `docs/release-process.md` 的默认 tag 字面量、确有新公开版本时的 `docs/release-evidence/v{prev}.md` 与台账行、`README.md` / `README.zh-CN.md` 第 5 行、已公开但证据未回写时的 `src/main/__fixtures__/release-announced-tag.json` + `src/main/release-doc-fixtures.test-helpers.ts` 的 `publishedTag` 合并、因版本号进入产物而被迫重算的 `docs/visual/v1/baseline-facts.json#directoryHtml.refreshed`、以及同批附带的 test-only 稳定性修补（本批 `src/syntax-perf-gate.test.tsx`，契约归 `domains/syntax-view`）。禁止改动非测试的 `src/renderer/**`、`src/core/**`、`src/shared/**`、UI / i18n 产品文案、依赖、`electron-builder.yml`、门清单数值、`docs/release-evidence-ledger.json`、已公开 Release 与资产。
- **版本字面量逐条判定**：只有「下一版默认值」三处前进（`package.json#version`、`release.yml` default、`docs/release-process.md` default）；**已公开**版本的历史段（旧 `## vX` 段、旧 notes、旧 `docs/release-evidence/*`、台账历史行）一律保留；**从未公开**的中间版本不留历史（`v0.2.22` 已原地改写为 `v0.2.23` 并删除 notes pair）。README / README.zh-CN 第 5 行是已发布指针，跟随**最新已公开**版本（当前 `v0.2.23`），其余正文零 diff。
- **已公开但证据未回写（announced tag）**：`v0.2.23` 的 Release 已公开，但 `docs/release-evidence/v0.2.23.md` 与台账行属独立收尾项、尚未回写。此时「已公开 tag」由 `src/main/__fixtures__/release-announced-tag.json#tag` 显式声明，`release-doc-fixtures.test-helpers.ts` 把它与 evidence / 台账派生的 verified tag 合并后经既有 `compareTags` 取最大值得到 `publishedTag`。该补位只补事实、不改判定：`judgePublishedAnchor` 的逐字严格相等与 `src/main/release-gate.ts` 零 diff。v0.2.23 证据回写后该 fixture 成为冗余项；后续再公开新版本时 README 与 fixture 必须同批前进，否则 `test` gate 仍红（fail-closed）。
- **双语 notes 结构**：两个文件均非空、逐节镜像；第 1 行标题含新 tag；第 3 行为固定绝对互链（全文各恰 1 条 markdown 链接，无 `<https://…>` 自动链接）；第 4 行起为正文；固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 及中文镜像）；H3 中英一一对应；`Windows portable download` / `Windows 免安装包` 小节恰 2 句并含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`。
- **notes 覆盖面可核**：上一已发布 tag..HEAD 的每条 commit 必须在 notes 有归属，或在 run 的 `commit-map.md` 标注 `internal`（合并 / 基线折叠 / CI / coverage / 测试 / ratchet / 截图取证类提交）；按流程要求生成 `commit-map.md` 时覆盖率须 100%，逐行 `commit | subject | 归属`。显式规格快速通道（change pack 仅 `prd.md`）不强制生成 commit-map，但 notes / CHANGELOG 必须把本版四项用户可见改动与验证稳定性修补分别如实归类。
- **CHANGELOG 顶部段**：首个版本段为新版本，位于上一**已公开**版本段（本轮 `## v0.2.21`）之上；上一版本从未公开时原地改写其段标题与内容，不新增第二段；段内含「概述 + 改进 / 修复 + 不做的事 + 升级方式」，沿用既有中文风格，历史段逐字节不变。
- **门禁 token 兼容（不改 `src/**` 的前提）**：`src/main/release-version-gate.test.ts` 的 `noteFacts` 硬编码了事实关键词，新 notes 的 `Not in this release` / `不做的事` 必须以**事实陈述**保留（英文 `ignore whitespace` / `off by default` / `spaces` / `tabs` / `one comparison result` / `status bar` / `same session` / `scroll position and switches` / `keeps the previous result` / `swap` / `ruler and counts` / `restores`，中文对应 12 词），CHANGELOG 新段保留 `忽略空白差异` / `默认关闭` / `重载` / `交换` 四 token。这是如实描述未变行为，不是改语义。
- **升级来源锚在上一已公开版本**：notes / CHANGELOG 的「升级来源」版本号必须是**上一个**已公开版本（v0.2.23 notes 中为 `v0.2.21`），不再与 README 第 5 行（已前进到 `v0.2.23`）耦合。从未发出公开 Release 的 tag（`v0.2.20` 记 `status: blocked`；`v0.2.22` 未公开）只能以「从未发出公开 Release」的事实陈述出现，不得占据升级来源位置。
- **scope claim 分段陈述**：发布说明不得用 `presentation only` / `本版只调整界面呈现` 概括全版；`Risk and verification scope` / `风险与验证规模` 须陈述「v0.2.23 相对 v0.2.21 的新增部分是内容兜底判定、截图资产、语法高亮与大文件回落」（本轮）并保留「比较语义、IPC、导出与快照格式均未改动」，中英逐句对应，不写性能 / 内存数字。
- **证据只写可核事实**：资产 name / size / digest 单次取样（`gh api ... --jq '.assets[]|[.name,.size,.digest]|@tsv'`），不下载资产；无 L1 真机场次时显式写明以 post-release-verify aggregate 与 public L1 为准，不预写未发生的 pass/fail，不复制历史版本数字。
- **发布通道只读**：收敛轮不打 tag、不 dispatch release workflow、不 `git push` 新 tag、不改任何已公开 Release 与资产。

## 验收

- **ac-version-single-source**：`package.json#version` 逐字为 `0.2.23`；该文件 `git diff` 只含 `version` 一行；仓库内不存在仍把当前版本写死为 `0.2.22` 的生产 / 发布锚点（`release-version-gate` 的 tag 判定全绿）。
- **ac-notes-bilingual-nonempty**：`docs/release-notes/v0.2.23.md` 与 `.zh-CN.md` 均存在且去除空白后非空；顶部切换链接互指 `v0.2.23` 对侧文件（每文件恰 1 条 markdown 链接）；两份都覆盖「未知扩展名按内容判定 / 双语 README 截图 / 语法高亮 / 大文件回落」四项，写成事实陈述，不写成「计划 / 将支持」。
- **ac-notes-h2-parity**：中英均含固定 6 个 H2 且同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade，中文为 本次变化 / Windows 安装包与免安装 zip / macOS 签名与公证 / 不做的事 / 风险与验证规模 / 升级方式），H3 中英一一对应。
- **ac-notes-portable-section**：中英均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，正文恰 2 句（英文按 `(?<=\.)\s+`、中文按 `(?<=。)` 切分）；Windows 免安装包文件名为 `OpenCompare-0.2.23-win-x64.zip`。
- **ac-notes-old-removed**：`docs/release-notes/v0.2.22.md` 与 `.zh-CN.md` 均已删除；仓库内不新增 `v0.2.22` 发布记录或兜底段。
- **ac-notes-fact-tokens**：`Not in this release` / `不做的事` 以事实陈述保留既有 `noteFacts` 关键词（中英各 12 词，见范围节），`src/main/release-version-gate.test.ts` 不改即绿。
- **ac-upgrade-source**：v0.2.23 notes 的三处升级来源（英文 `## Upgrade` 首句、中文 `## 升级方式` 首句、`CHANGELOG.md` 新段 `### 升级方式` 首句）版本号唯一为上一已公开版本 `v0.2.21`，与 README 第 5 行（`v0.2.23`）**解耦**；正文不以 `v0.2.20` / `v0.2.19` 为升级来源，`v0.2.22` 不以已发布版本身份出现。
- **ac-notes-unchanged-scope**：两份 notes 的 `Risk and verification scope` / `风险与验证规模` 陈述「v0.2.23 相对 v0.2.21 的新增部分是内容兜底判定、截图资产、语法高亮与大文件回落」，并保留「比较语义、IPC、导出与快照格式均未改动」/ `Comparison semantics, IPC, export and snapshot formats are untouched.`，中英逐句对应，不写性能 / 内存数字。
- **ac-changelog-aligned**：`CHANGELOG.md` 首个版本段为 `## v0.2.23`，不存在 `## v0.2.22` 标题；该段四项用户可见改动与两份 notes 同源一致；「修复」可如实记录 `syntax-perf` 两个规模用例补显式 `30_000` 超时（验证稳定性，不包装成用户功能）；`## v0.2.21`（含）至文件末尾逐字节不变。
- **ac-changelog-tokens**：`## v0.2.23` 段文本含 `忽略空白差异`、`默认关闭`、`重载`、`交换` 四个 token（`noteFacts` 断言），以事实陈述保留，不是新语义。
- **ac-release-default-tag**：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 逐字为 `'v0.2.23'`；两份 notes 缺失 / 空白即 fail-closed、中文 `<details><summary>简体中文</summary>` 折叠与 `**Full Changelog**` 组装逻辑零改动。
- **ac-release-process-sync**：`docs/release-process.md` 的默认 tag 仍以独立代码片段存在（`parseMarkdown` 的 `codeSpans` 可匹配 `/^default:\s*'([^']+)'$/`），值为 `v0.2.23`；该文件除该字面量外零改动。
- **ac-release-packaging-test**：`pnpm test src/main/release-packaging.test.ts` 通过；由 `package.json#version` 派生的 `currentTag` 为 `v0.2.23`，测试与夹具中不存在残留的写死 `v0.2.22` tag 或 notes 文件名断言。
- **ac-readme-en-line5**：`README.md` 第 5 行逐字为 `> Latest public release: [v0.2.23](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23) — Developer ID signed and Apple-notarized macOS build.`（链接文字与 URL 同为 `v0.2.23`，该行不含 `v0.2.21`）。
- **ac-readme-zh-line5**：`README.zh-CN.md` 第 5 行逐字为 `> 最新公开版本：[v0.2.23](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23) — macOS 安装包经 Developer ID 签名与 Apple 公证。`（链接文字与 URL 同为 `v0.2.23`，该行不含 `v0.2.21`）。
- **ac-readme-diff-scope**：`git diff -- README.md README.zh-CN.md` 恰为两个文件、各 1 处 hunk、各改 1 行（第 5 行）；第 3 行互链、第 7 行 badge、9 个 H2 标题、截图引用与其余正文逐字不变。
- **ac-no-residual-pointer**：排除历史记录（`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/visual/v1/functional-parity.md`）后的仓库文档中，`grep -n 'Latest public release\|最新公开版本'` 不再出现 `v0.2.21`，也不存在其它把「latest / 最新版本」写成 `v0.2.21` 的静态指针。
- **ac-published-baseline**：`releaseFacts.publishedTag` 解析为 `v0.2.23`（verified tag 与 `release-announced-tag.json` 的 announced tag 取 `compareTags` 最大值）；`src/main/release-gate.ts` 的 `judgePublishedAnchor` 未改，仍要求两版 README 第 5 行逐字等于 `publishedTag`，无 allowlist / 通配 / 降级分支；`pnpm exec vitest run src/main/release-version-gate.test.ts` 通过。
- **ac-readme-h2-mirror**：两 README 的 H2 数量同为 9 且按顺序一一对应（下载与安装 / 核心能力 / 快速上手 / 环境要求与开发 / 项目结构 / 已知问题 / 证据与文档 / Open Rebuilds 001 / 许可）；不新增版本表或发布说明索引。
- **ac-history-untouched**：`docs/release-notes/v0.2.21.md` / `.zh-CN.md` / `v0.2.20.md` / `.zh-CN.md` 零 diff；`docs/release-evidence/v0.2.19.md`、`v0.2.20.md`、`v0.2.21.md` 零 diff；`docs/release-evidence-ledger.json` 与 `release-packaging.json#evidence.ledger` 零改动。
- **ac-baseline-facts-refresh**：版本号进入目录报告 HTML，`docs/visual/v1/baseline-facts.json` 只允许 `directoryHtml` 的 `bytes` / `sha256` 与 `refreshed`（commit / appVersion `0.2.23` / capturedAt / bytes / sha256）随真实重算漂移；`preToken` 逐字不变，顶层 `commit` 仍是 `11170a5…`。
- **ac-diff-scope**：改动文件恰为 `package.json`、`docs/release-notes/v0.2.23.md` + `.zh-CN.md`、删除 `v0.2.22` pair、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/visual/v1/baseline-facts.json`、`src/syntax-perf-gate.test.tsx`（`.munk/**` 不计）；不含非测试 `src/renderer/**`、`src/core/**`、`src/shared/**`、i18n 词典、依赖、`electron-builder.yml`、`docs/release-evidence-ledger.json`、历史 notes / 证据、截图 PNG。
- **ac-gates-green**：按 `.munk/code-gates.json` 执行全部 gate 通过（含 `test` = `pnpm test` 与 `syntax-perf`）；交付报告逐条结论取自 evidence 的 `latestAttemptId`，不以本机手工快跑替代。
- **ac-no-release-side-effects**：`package.json#version` 仍为 `0.2.23`；`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`src/main/__fixtures__/release-packaging.json` 零 diff；不打 tag、不 `git push` 新 tag、不 dispatch release workflow、不 `gh release edit/upload/delete`，不改远端 Release 正文与资产；交付为单条提交且工作区干净。

## 非目标

- 不改产品行为：不做非测试的 `src/renderer/**` / `src/core/**` / `src/shared/**` 改动，不调 UI、i18n 词典、对比 / 合并语义、IPC、导出与快照格式；不改语法高亮、未知扩展名判定、双语截图等已合入功能的实现或行为。
- 不改依赖、`electron-builder.yml`、门禁阈值、`src/main/release-version-gate.test.ts` 的 `noteFacts` 关键词集合；不以放宽门禁换绿灯。
- 不重写历史 notes、历史 `CHANGELOG` 段与既有证据文件；不删除区间内 commit 来赶窗口。
- 不拆 0.2.22 / 0.2.23 两次发布，不保留 `v0.2.22` 兜底记录，不留死版本号。
- 不推 tag、不 dispatch、不改已公开 Release `v0.2.21` / `v0.2.19` 的正文与资产、不改发布通道或签名口径。
- 不新增版本表、发布说明索引或 README 新章节。
- 不自造 `docs/visual/v1/baseline-facts.json` 的事实：只允许随真实重算更新 `directoryHtml` 与 `refreshed` 段。
- 不放宽或缩减 `syntax-perf` 的规模与断言，不改 vitest 全局 `testTimeout`。
- 不在 `main` 主检或其他 worktree 动手；`docs/release-evidence-ledger.json` 与 `docs/release-evidence/*` 不因本次预发布新增记录。

## 实现约束

- **单一来源即契约**：tag 由 `v${version}` 派生，任何默认 tag 字面量的手改都必须与 `package.json#version` 同批且相等（`judgeVersionSources`），禁止引入第二个版本来源或版本工具。
- **announced tag 走数据夹具，不为门禁开后门**：test-debt gate 禁止在 `.ts` 里写当前版本字面量，故 announced tag 落在 `src/main/__fixtures__/release-announced-tag.json`；helper 只做「verified ∪ announced 取 `compareTags` 最大」。`judgePublishedAnchor` 仍是逐字严格相等（连大小写与文案都不放宽），不得改为包含判断、正则或 allowlist；README 第 5 行与 `publishedTag` 必须同时前进。
- **证据结构照 `v0.2.19.md`**：`parseEvidence` 依赖 `| 资产数 | 12`、`| tag_name | \`vX\``、含 `tag → commit` + 反引号 sha 的行、`releases/tag/vX` 链接；资产表 12 行且 name 命中 `ASSET_FAMILY`；不得出现非 64 位小写十六进制却看似 sha 的 token（`malformed` 断言）。证据文件与 fixture 台账必须同批追加，缺一即红；已有收尾的版本不重复追加。
- **notes 由 version 派生**：release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body，任一缺失 / 空白即 fail-closed；两文件不得含 `<details>` / `<summary>` / 独占一行的 `---`；`bodyGate` 断言 `linkCount=1` 与 6 个 H2 顺序。未公开版本以现有 notes 为底原地改写，只换 tag / 文件名 / 版本事实，保留 6 个 H2 骨架。
- **顶段插入不改历史**：CHANGELOG 只在首个版本段之前插入新段或原地改写未公开版本的顶部段，历史段正文与顺序逐字不变。
- **纠偏走等量替换**：事实口径修正优先在既有段落内做等量 / 等句数替换，保持段落切分、空行与句子计数不变；只改列出的定位点，其余文字逐字保留。
- **事实取数一次**：资产 name / size / digest 用 `gh api ... --jq` 单次取样，不下载资产；取不到就写 `blocked` + 来源，不臆造。
- **版本号会渗进产物**：目录报告 HTML 内嵌 `APP_VERSION`，bump `package.json#version` 后 `docs/visual/v1/baseline-facts.json` 的 `directoryHtml.sha256` / `refreshed` 必然漂移；必须用 `VISUAL_BASELINE_WRITE=1` 让 `scripts/visual-baseline-facts.test.mjs` 真实重算写入，不得手改 sha 或把该文件当作可随手改的白名单。
- **改动面可审计**：交付为单条提交、工作区干净；`git diff --stat` 只含白名单文件，`git diff README.md` 只有第 5 行一处 hunk，`git diff package.json` 只含 version 行。

## 最近交付证明

- WI：`wi_intake_ef18694873c03e09`（把 README「最新公开发布」指针从 `v0.2.21` 同步到已公开的 `v0.2.23`；`deliveryIntent: local merge`）
- 日期：2026-11-05
- 结果：`code_gates` passed（32 gates，attempt 002，`.munk/runs/run_intake_ef18694873c03e09/code-gates/latest.json` `ok: true`、`failedGateIds: []`）；`pnpm test` 151 files / 2363 passed + 1 skipped（2364）。
- 改动面：`README.md` / `README.zh-CN.md` 第 5 行 `v0.2.21` → `v0.2.23`（各 1 hunk / 1 行）；新增 `src/main/__fixtures__/release-announced-tag.json`（`tag: v0.2.23`）；`src/main/release-doc-fixtures.test-helpers.ts` 的 `publishedTag` 改为 `verifiedTags ∪ announcedTag` 取 `compareTags` 最大值；`src/main/release-version-gate.test.ts` 新增一条断言（两版 README 第 5 行链接均指向 `publishedTag`）。`src/main/release-gate.ts`、`CHANGELOG.md`、notes、证据 / 台账、`release-packaging.json`、`release.yml`、`release-process.md`、`package.json#version` 零 diff。
- 验收落点：`ac-readme-en-line5` / `ac-readme-zh-line5` / `ac-readme-diff-scope` / `ac-no-residual-pointer` / `ac-published-baseline` / `ac-gates-green` / `ac-no-release-side-effects`；`ac-readme-h2-mirror`（各 9 节）、`ac-history-untouched` 保持。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无折叠用例。② **被推翻的假设**：上一轮 `ac-readme-line5-published`（README 仍锚 `v0.2.21`）已被 v0.2.23 公开推翻，指针现在跟随 announced 最新已公开版本；且 `announcedPublicTag` 无法以 `.ts` 常量落地（test-debt gate 禁止 `.ts` 内写当前版本字面量），改为 JSON 夹具。③ 风险：v0.2.23 证据回写落地后该夹具成为冗余；下一次公开新版本时 README 第 5 行与夹具必须同批前进，否则 `test` gate fail-closed。
