# 修正 v0.2.21 发布说明的升级来源与整版口径

## 范围

当前 main tip `6c15b42` 上已合入的 v0.2.21 发布说明有两处与公开口径不符，需在今晚 23:00 发版批次前修正。事实依据：`docs/release-evidence/v0.2.20.md` 记录 `v0.2.20` tag 指向 `b37fa39`、GitHub Release 从未创建、status `blocked`、最新公开版本 `v0.2.19`；`README.md` / `README.zh-CN.md` 第 5 行同为 `v0.2.19`。

只改 3 个文件，共 6 处文本（英文 2 处、中文 2 处、CHANGELOG 2 处）：

| # | 文件 | 位置 | 现状 | 目标 |
| --- | --- | --- | --- | --- |
| 1 | `docs/release-notes/v0.2.21.md` | `## Upgrade` 首句 | `Upgrade from v0.2.20.` | `Upgrade from v0.2.19.`（该段其余文字不动） |
| 2 | `docs/release-notes/v0.2.21.zh-CN.md` | `## 升级方式` 首句 | `建议从 v0.2.20 升级：` | `建议从 v0.2.19 升级：`（该段其余文字不动） |
| 3 | `CHANGELOG.md` | `## v0.2.21` → `### 升级方式` 正文 | `建议从 v0.2.20 升级。本次不变更数据格式…` | `建议从 v0.2.19 升级。本次不变更数据格式…` |
| 4 | `docs/release-notes/v0.2.21.md` | `## Risk and verification scope` 首句 | `This release is presentation only: …` | 限定为「v0.2.21 相对 v0.2.20 的新增部分只调整界面呈现；并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现」 |
| 5 | `docs/release-notes/v0.2.21.zh-CN.md` | `## 风险与验证规模` 首句 | `本版只调整界面呈现：…` | 同上口径的中文镜像（第 4 项逐句对应） |
| 6 | `CHANGELOG.md` | `## v0.2.21` → `### 修复` 唯一 bullet | `- 无功能缺陷修复；本版只调整界面呈现。` | 见下方「实现约束」的目标原文 |

第 4/5 项须与同文 `## What changed` / `## 本次变化` 中已写明的「并入 v0.2.20 的对比历史与三向合并会话」自洽：这两项是功能，不是呈现。

## 验收

- ac-upgrade-en: `docs/release-notes/v0.2.21.md` 的 `## Upgrade` 段首句逐字为 `Upgrade from v0.2.19.`；全文不含字符串 `Upgrade from v0.2.20`。
- ac-upgrade-zh: `docs/release-notes/v0.2.21.zh-CN.md` 的 `## 升级方式` 段含 `建议从 v0.2.19 升级：`；全文不含 `建议从 v0.2.20` 与 `从 v0.2.20 升级`。
- ac-upgrade-changelog: `CHANGELOG.md` 中 `## v0.2.21` 到 `## v0.2.20` 之间的 `### 升级方式` 段含 `建议从 v0.2.19 升级。`，且该区间不含 `从 v0.2.20 升级`；`## v0.2.20` 及其后的历史段逐字节不变（仍为 `建议从 v0.2.19 升级。`）。
- ac-upgrade-single-source: v0.2.21 三处（英文 notes / 中文 notes / CHANGELOG v0.2.21 段）中作为「升级来源」出现的版本号唯一是 `v0.2.19`，与 `README.md` 第 5 行 `Latest public release: v0.2.19` 一致；v0.2.21 区间内残留的 `v0.2.20` 只允许出现在「已打 tag 但从未发出公开 Release」这一事实陈述里（英文 `tagged in v0.2.20 but never reached a public release`、中文 `v0.2.20 已打 tag 但从未发出公开 Release`），不得出现在升级来源位置。
- ac-scope-claim-en: `docs/release-notes/v0.2.21.md` 的 `## Risk and verification scope` 段不含 `This release is presentation only`；该段同时满足：(a) 明确「新增部分（相对 v0.2.20）只调整界面呈现」并列举 chrome / toolbar / status bar 与 legend / diff view / token / screenshots；(b) 明确「并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现」；(c) 保留原有 `Comparison semantics, IPC, export and snapshot formats are untouched.` 与「不写性能 / 内存数字」的既有一句。
- ac-scope-claim-zh: `docs/release-notes/v0.2.21.zh-CN.md` 的 `## 风险与验证规模` 段不含 `本版只调整界面呈现`；该段含 `v0.2.21 相对 v0.2.20 的新增部分只调整界面呈现` 与 `并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现` 两条语义，与 ac-scope-claim-en 的 (a)(b) 逐条对应；保留 `比较语义、IPC、导出与快照格式均未改动。` 与「不写性能 / 内存数字」的既有一句。
- ac-changelog-fix-bullet: `CHANGELOG.md` 的 `## v0.2.21` → `### 修复` 下恰有 1 条 bullet，逐字为 `- 无功能缺陷修复；v0.2.21 新增部分只调整界面呈现，并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现。`（蕴含中英镜像语义一致）。
- ac-structure-preserved: 两份 v0.2.21 notes 各自 H2 数量仍为 6，且顺序与 `src/main/release-gate.ts` 的 `NOTES_H2_PAIRS` 逐字一致（英文 `What changed` / `Windows installer and portable zip` / `macOS signing and notarization` / `Not in this release` / `Risk and verification scope` / `Upgrade`；中文 `本次变化` / `Windows 安装包与免安装 zip` / `macOS 签名与公证` / `不做的事` / `风险与验证规模` / `升级方式`）；每份 notes 的 markdown 链接数仍恰为 1（第 3 行语言切换互链，`\]\([^)]*\)` 计数 = 1，对应 `release-packaging.test.ts` 的 `linkCount`），且第 1 行标题、第 3 行切换行文本不变。
- ac-history-untouched: `docs/release-notes/v0.2.20.md`、`docs/release-notes/v0.2.20.zh-CN.md` 零 diff；`CHANGELOG.md` 中 `## v0.2.20`（含）到文件末尾零 diff。
- ac-gates-green: `.munk/code-gates.json` 的 29 个 gate 全部通过（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及各专项 gate）；其中 `test` 必须通过 `src/main/release-version-gate.test.ts`（`judgeNotesHeadings` 的 H2 对、`judgeNotesOrder`、`noteFacts` 的真实 token 断言）、`src/main/release-packaging.test.ts`（notes 路径派生、每份 `linkCount=1`）与 `src/main/release-artifacts-and-brand.test.ts`（portable 小节 2 句）；不得以 skip 或放宽断言换绿灯。
- ac-diff-scope: 相对 `6c15b42` 的最终改动文件恰为 3 个：`docs/release-notes/v0.2.21.md`、`docs/release-notes/v0.2.21.zh-CN.md`、`CHANGELOG.md`（Host 管理的 `.munk/**` 不计）；上述三文件内除本 prd 列出的 6 处外零 hunk。
- ac-no-release-side-effects: 不推 tag、不 dispatch release workflow、不修改任何已公开 Release 与资产；`package.json#version`、`release.yml` 默认 tag、`README*`、`docs/release-evidence/**`、`docs/release-process.md`、`docs/visual/**`、`src/**` 均零 diff。

## 非目标

- 不改版本号、默认 dispatch tag、`docs/release-process.md`、`docs/release-evidence/**`、`src/main/__fixtures__/**`、`docs/visual/**`、README 正文与截图。
- 不新增 v0.2.20 的 Release 记录，不改写 `docs/release-evidence/v0.2.20.md` 的 blocked 事实。
- 不重写 v0.2.21 notes 的其他小节（What changed / 本次变化、portable、macOS 签名、Not in this release / 不做的事 等）与 H3 标题。
- 不新增任何 markdown 链接、不引入 MiB / GiB 或性能数字、不动中英镜像结构与句子数量口径。
- 不补发其他对外文案（README、社媒、Release 正文模板）。

## 实现约束

- 仅允许写 `.munk/changes/{workItemId}/prd.md` 之外的这 3 个目标文件；其余文件只读。
- 目标原文（逐字落地，除下列 6 处外保持原文与空行不变）：
  1. `docs/release-notes/v0.2.21.md` `## Upgrade` 首句：`Upgrade from v0.2.19.`（后续 `Replace the app with the v0.2.21 package …` 原样保留）。
  2. `docs/release-notes/v0.2.21.zh-CN.md` `## 升级方式` 首句：`建议从 v0.2.19 升级：`（后续 `下载 v0.2.21 对应平台的新安装包覆盖安装…` 原样保留）。
  3. `CHANGELOG.md` v0.2.21 `### 升级方式` 首句：`建议从 v0.2.19 升级。`（`本次不变更数据格式，已有会话与设置照常可用。` 原样保留）。
  4. `docs/release-notes/v0.2.21.md` `## Risk and verification scope` 首两句改为：`Only the new part of v0.2.21 relative to v0.2.20 is presentation work: the compact chrome, the directory toolbar band, the status bar and diff legend, the diff view metrics, the shared token source and the screenshots. The comparison history and the three-way merge session folded in from v0.2.20 keep that release's verified implementation.`（其后的 `Comparison semantics, IPC, export and snapshot formats are untouched.` / `Verification covers …` / `This release states no performance or memory numbers.` 原样保留）。
  5. `docs/release-notes/v0.2.21.zh-CN.md` `## 风险与验证规模` 首句改为：`v0.2.21 相对 v0.2.20 的新增部分只调整界面呈现：顶部控件带、目录工具行 band、状态栏与差异图例、差异视图度量、唯一 token 源与截图；并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现。`（其后的 `比较语义、IPC、导出与快照格式均未改动。` / `验证覆盖 …` / `本文件不写任何性能或内存数字。` 原样保留）。
  6. `CHANGELOG.md` v0.2.21 `### 修复` 唯一 bullet 改为：`- 无功能缺陷修复；v0.2.21 新增部分只调整界面呈现，并入的对比历史与三向合并会话沿用 v0.2.20 已验证实现。`
- 段落切分口径不变：优先在既有段落内做等量替换，不增删空行、不拆段，避免 portable 小节句数（`release-artifacts-and-brand.test.ts` 断言 2 句）与每份 notes 链接数（`linkCount=1`）等 gate 断言漂移。
- CHANGELOG v0.2.21 之外的段落（尤其 `## v0.2.20` 段）不得改动；`docs/release-notes/v0.2.20*.md` 不得改动。
- 交付前自检命令（证据留档）：`grep -n "v0.2.20" docs/release-notes/v0.2.21.md docs/release-notes/v0.2.21.zh-CN.md CHANGELOG.md`、`git diff --name-only 6c15b42`、`git status --porcelain`、`pnpm lint && pnpm typecheck && pnpm test`。
- 有一条既有硬约束需保持：`release-version-gate.test.ts` 的 H2 字面量用 `includes` 匹配，改写 H2 文本会红——本项不动任何 H2。
