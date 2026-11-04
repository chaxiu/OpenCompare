# v0.2.21 版本收敛（发版语义单点，不改产品行为）

## 范围

把 main 当前树 `0ce2879`（v0.2.20 tag 之后、UI 视觉打磨 V1 已全部合入）收敛为可发版版本锚点 `v0.2.21`。只允许版本字面量与发版说明发生位移；产品行为、对比/合并语义、四态口径、快照/导出、依赖、README 正文与截图均零 diff。

允许改动集合：

1. `package.json#version`：`0.2.20 → 0.2.21`（该文件只改 version 一行）。
2. 新建 `docs/release-notes/v0.2.21.md`（英文全文）与 `docs/release-notes/v0.2.21.zh-CN.md`（中文全文）：非空、逐节镜像。
3. `CHANGELOG.md` 顶部新增 `## v0.2.21` 段（中文，沿用「概述 + 改进/修复 + 不做的事 + 升级方式」风格）。
4. `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default`：`'v0.2.20' → 'v0.2.21'`（仅字面量）。
5. `docs/release-process.md` 的默认 tag 字面量：`default: 'v0.2.20' → 'v0.2.21'`（仅字面量，不改流程语义）。
6. 本 run 的 commit 映射证据 `.munk/runs/run_intake_c10ed848d591a3ac/commit-map.md`（28/28）。

> **对初始指令的一处事实修正（必须按本 prd 执行）**：初始指令写「release.yml dispatch 默认 tag 只在发布收尾时动，本次不动」。实测仓库契约不允许：`src/main/release-gate.ts` 的 `judgeVersionSources` 要求 `release.yml#workflow_dispatch.tag.default` 与 `docs/release-process.md#workflow_dispatch.default` 一并等于 `v${pkg.version}`（`src/main/release-version-gate.test.ts` 在 `pnpm test` 内执行）；`.munk/baseline/domains/release-version-anchor/product.md` 的 `ac-workflow-default` / `ac-process-default` 也如此规定。只改 package.json 会让 `pnpm test` 红，与「code_gates 全绿」验收直接冲突。故本项必须把这两处默认 tag 字面量一并前进到 `v0.2.21`；这是纯版本锚点、零产品行为改动，与 v0.2.20 收敛提交 `d68d978` 的处置一致。

## 版本字面量审计（`v0.2.20` / `0.2.20` 命中与处置）

`grep -rn "v0\.2\.20\|0\.2\.20"`（排除 `node_modules` / `.git` / `.munk`）：

| 命中位置 | 内容 | 判定 | 处置 |
| --- | --- | --- | --- |
| `package.json:3` | `"version": "0.2.20"` | 版本单一来源（`v${version}`） | 改 `0.2.21` |
| `.github/workflows/release.yml:17` | `default: 'v0.2.20'` | `judgeVersionSources` 必读 | 改 `'v0.2.21'` |
| `docs/release-process.md:8` | `default: 'v0.2.20'` | `judgeVersionSources` 必读 | 改 `'v0.2.21'` |
| `CHANGELOG.md:5` | `## v0.2.20` | 历史版本段 | 保留；其上新增 `## v0.2.21` |
| `docs/release-notes/v0.2.20.md` / `.zh-CN.md` | 历史发布说明 | 历史记录 | 保留，不改 |
| `docs/lessons.md:239` | `v0.2.20` 历史事实 | 历史记录 | 保留，不改 |
| `README.md:5` / `README.zh-CN.md:5` | 最新公开版本 `v0.2.19` | 已发布指针（`publishedTag` 派生） | **不得改** |

结论：只有 `package.json`、`release.yml`、`docs/release-process.md` 三处“下一版默认值”前进；README 第 5 行指已发布版本，保持 `v0.2.19`。

## Commit 映射（脚本生成：`git log --format='%h %s' v0.2.20..HEAD`，共 28 条）

| # | commit | subject | 归属（notes H3 / internal） |
| --- | --- | --- | --- |
| 1 | `0ce2879` | munk delivery: merge wi_intake_d6e152cc0c481f5d | internal（交付合并；内容见 `eb33ad1` / `af93633` / `5c18a86`） |
| 2 | `af93633` | docs(baseline): fold the 36/72 toolbar band and in-viewport more menu contract into shell-tightening | internal（基线文档） |
| 3 | `5c18a86` | docs(visual): recapture README screenshots for the 36/72 toolbar band | Documentation and screenshots |
| 4 | `eb33ad1` | feat(shell): pin directory toolbar to 36/72 and keep the more menu in view | Directory toolbar and narrow windows |
| 5 | `11cbdaa` | merge: narrow-window directory toolbar fit + light legend AA contrast | Directory toolbar and narrow windows; Status bar and diff legend |
| 6 | `92a69a4` | docs(visual): recapture README screenshots after the toolbar model change | Documentation and screenshots |
| 7 | `ade5a1f` | docs(baseline): fold narrow-window directory toolbar model and light legend contrast | internal（基线文档） |
| 8 | `95458b9` | munk delivery: merge wi_ws_5315d151d872f78c | internal（交付合并；内容见 `7bd2c9c` 等） |
| 9 | `0eafc67` | docs(baseline): fold the shell tightening, toolbar and status-bar contracts | internal（基线文档） |
| 10 | `3b8cfe3` | test(shell): dedupe test scaffolding and declare the shell-tightening ratchet | internal（测试） |
| 11 | `7bd2c9c` | feat(shell): tighten workbench chrome, toolbars and view metrics | Compact application chrome; Directory toolbar and narrow windows; Status bar and diff legend; Diff view |
| 12 | `1af218d` | merge visual-foundation: unique token source, control trio, and pre-token baseline | internal（合并；内容见 `451bf57` 等） |
| 13 | `f24eed3` | munk delivery: integrate main into munk/wi_ws_11bf921b1e0e06f2 | internal（集成合并） |
| 14 | `c85d068` | docs(baseline): fold the visual-foundation token and control contracts | internal（基线文档） |
| 15 | `6ebb914` | test(debt): declare the visual-foundation token and control test growth | internal（测试债声明） |
| 16 | `036fd8f` | docs(screenshots): refresh README captures after the visual foundation | Documentation and screenshots |
| 17 | `451bf57` | feat(visual): land the unique token source and control primitives | Design tokens and controls |
| 18 | `60ece89` | munk delivery: merge wi_intake_cd7cb20c206d9bfe | internal（交付合并） |
| 19 | `71eb9ec` | munk delivery: integrate main into munk/wi_intake_cd7cb20c206d9bfe | internal（集成合并） |
| 20 | `b3ed90d` | docs(coverage): record post-merge preflight dispatch run 41875044524 | internal（验证文档） |
| 21 | `2110e15` | munk delivery: merge wi_intake_cd7cb20c206d9bfe | internal（交付合并） |
| 22 | `ce124aa` | feat(coverage): add read-only preflight workflow + refresh coverage baseline | internal（验证 / CI） |
| 23 | `6f573e3` | docs(visual): record v1 visual direction and pre-token baseline | internal（设计文档 / 基线） |
| 24 | `11170a5` | munk delivery: merge wi_intake_83de2ee0993c6468 | internal（交付合并） |
| 25 | `23f8ed7` | munk delivery: integrate main into munk/wi_intake_83de2ee0993c6468 | internal（集成合并） |
| 26 | `8352401` | fix(coverage-gate): freshness uses previous release tag; add regression test + local preflight rehearsal | internal（验证 / CI） |
| 27 | `d58d6a4` | munk delivery: merge wi_intake_f6bb9fce2c16367e | internal（交付合并） |
| 28 | `5fd4e08` | fix(spike): sync on parent exit event before process-exited diagnostics | internal（spike / 验证） |

覆盖统计：用户可见归属 7 条（`5c18a86`、`eb33ad1`、`11cbdaa`、`92a69a4`、`7bd2c9c`、`036fd8f`、`451bf57`），internal 21 条，合计 28/28。不得遗漏、不得把 internal 提交写成用户功能。

## notes 小节与实际内容来源

英文 H2 固定 6 个（中文同序镜像）：`What changed` / `Windows installer and portable zip` / `macOS signing and notarization` / `Not in this release` / `Risk and verification scope` / `Upgrade`。`What changed` 下 H3 与中文一一对应：

1. `### Compact application chrome` / `### 顶部控件带收紧`
   - 就绪态顶部控件带 120 逻辑像素：应用标题 32 / 会话标签 28 / 上下文工具行 36（单行）/ 面板头 24；状态栏单行 24。来源 `7bd2c9c`（`shellLayout.ts`）。
2. `### Directory toolbar and narrow windows` / `### 目录工具行与窄窗`
   - 目录工具行合成一行：过滤 segmented → 1 个实心主操作 → 12px 间距 + 1px 竖分隔 → 「更多」；快照导入/导出 ×6、导出 HTML、隐藏本机路径收进「更多」或设置。
   - 窄窗折叠阶梯固定为「图例状态词 → 同步主按钮文案 → 行容器换行」；单行 band 36、两行 band 72；不横向滚动裁切。
   - 「更多」菜单在 800 高视口内完整可见，下方不足时向上翻转或按视口夹取，不靠内部滚动条藏条目；Escape 与点击外部关闭保持。来源 `7bd2c9c` / `eb33ad1` / `11cbdaa`。
3. `### Status bar and diff legend` / `### 状态栏与差异图例`
   - 目录四态图例只保留在过滤行一处，状态栏不再重复；状态栏只保留当前场景的行/条目度量与编码换行事实，左右编码与换行相同只写一次。
   - 窄窗状态栏换行到第二行而不裁切；单行高度 24。
   - 浅色主题四态图例前景对 chip 背景 ≥ 4.5:1（实测 4.78 / 4.66 / 4.60 / 4.62），暗色取值不变（6.41 / 6.47 / 5.16 / 6.51）。来源 `451bf57` / `7bd2c9c` / `11cbdaa`。
4. `### Diff view` / `### 差异视图`
   - 代码行高 22，差异正文 12px 等宽、行号对齐；右侧 2px 指示条轨道 + 当前视窗矩形 + 差异块 + hover 行号，与竖向滚动条留 6px；单词级差异改为 12% 柔底色 + 1px 下划线，不再用 40% 实底。来源 `7bd2c9c`。
5. `### Design tokens and controls` / `### 设计 token 与控件`
   - `src/renderer/src/assets/main.css` 是唯一 token 源：字号 11/12/13/14/15，行高 16/18/20/24，间距基数 0.25rem（4/8/12/16/24），圆角 4/6/8，控件高 28/32/36；亮 / 暗两套同名 token 同步重定。
   - 控件三件套：Button 三档强调、28×16 方形勾选、20px chip（8px 色点 + 文案 + 12% 语义底色）、30px tab + 2px 品牌下划线；界面收敛到 4 个色相（蓝 / 绿 / 红 / 琥珀），conflict 复用 modified 色族并以虚线描边 + 文案区分，danger 与 removed 同色相。来源 `451bf57`。
   - **不得写成“本版新增自有图标集”**：仓库内自有图标集早于 v0.2.20 合入（`0418732`，2026-10-30），本区间没有任何图标库 / 图标文件变更；theme 切换逻辑也未改，只是两套 token 取值重定。
6. `### Documentation and screenshots` / `### 文档与截图`
   - README 两张截图在视觉基础与工具行模型变更后重出，`docs/screenshots.md` 的 captured commit / 字节数 / sha256 provenance 重钉；v1 视觉 before/after 截图与测量文档随视觉轮入库。来源 `036fd8f` / `92a69a4` / `5c18a86`。README 正文与第 5 行版本指针不动。

## 验收标准

- ac-pkg-version: `package.json#version` 恰为 `0.2.21`，且该文件除 `version` 外无其他改动。
- ac-notes-bilingual-exist: `docs/release-notes/v0.2.21.md` 与 `docs/release-notes/v0.2.21.zh-CN.md` 均存在，去除空白后非空。
- ac-notes-order-links: 两文件第 1 行标题均含 `v0.2.21`（首个 `#` 标题即为第 1 行）；语言切换行同时含 `English` 与 `简体中文`，且分别逐字为（英文）`English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.21/docs/release-notes/v0.2.21.zh-CN.md)`、（中文）`[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.21/docs/release-notes/v0.2.21.md) | 简体中文`；每文件 markdown 链接数恰为 1（`\]\([^)]*\)` 计数，见 `src/main/release-packaging.test.ts` 的 `linkCount` 断言），除该切换行外不得出现 markdown 链接或 `<https://...>` 自动链接；切换行下方存在非空正文。
- ac-notes-h2-parity: 两文件均含固定 6 个 H2 且同序，逐字为——英文 `What changed` / `Windows installer and portable zip` / `macOS signing and notarization` / `Not in this release` / `Risk and verification scope` / `Upgrade`；中文 `本次变化` / `Windows 安装包与免安装 zip` / `macOS 签名与公证` / `不做的事` / `风险与验证规模` / `升级方式`（`src/main/release-gate.ts` 的 `NOTES_H2_PAIRS` 用 `includes` 匹配，故不得改写这些字面量）；H3 小节中英一一对应。
- ac-notes-portable-section: 英 / 中 notes 的 `Windows portable download` / `Windows 免安装包` 小节内：代码片段含 `.zip`，正文含 `NSIS` 与 `no installation step` / `无安装步骤`，且该小节正文句数恰为 2——英文按「`.` + 空白」切分（`(?<=\.)\s+`），中文按 `。` 切分（`(?<=。)`）；该小节内避免使用 `e.g.` 等带点缩写，避免中英混排句号导致的切分漂移。
- ac-notes-mapping-coverage: `git log v0.2.20..HEAD` 的 28 条 commit 全部有归属（用户可见六节之一，或标注 internal）；committed 映射证据位于 `.munk/runs/run_intake_c10ed848d591a3ac/commit-map.md`（若该路径在交付阶段不可写，则落在 `.munk/changes/wi_intake_c10ed848d591a3ac/commit-map.md`，交付说明点名 fallback），逐行 `commit | subject | 归属`，覆盖率 28/28；本 prd 的映射表为权威口径。
- ac-notes-content-accuracy: notes 只陈述上一节列出的实际合入内容；不得声称新增自有图标集、不得承诺未合入功能、不写性能或内存数字。
- ac-changelog-top: `CHANGELOG.md` 顶部首个版本段逐字为 `## v0.2.21`，位于 `## v0.2.20` 之上；`judgeReleaseHistory` 视角下标题从新到旧、无重复、均为 `vX.Y.Z`；段内含概述、改进 / 修复、不做的事、升级方式；历史段逐字不变。
- ac-workflow-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.21'`，且该处只改字面量。
- ac-process-default: `docs/release-process.md` 中 `default: 'v0.2.21'` 作为**独立代码片段**存在（`parseMarkdown` 的 `codeSpans` 需能匹配 `/^default:\s*'([^']+)'$/`，即保留反引号包裹形式），其值与 `v${pkg.version}` 相等，且该文件除该字面量外无其他改动。
- ac-readme-untouched: `README.md` / `README.zh-CN.md` 第 5 行仍为 `v0.2.19`，与最新 verified 证据一致（`docs/release-evidence/` 最新为 `v0.2.19.md`，`judgePublishedAnchor` 以 verified 证据派生 `publishedTag`）；README 正文与截图零改动。
- ac-gate-tokens: 英文 notes 含 `ignore whitespace` / `off by default` / `spaces` / `tabs` / `one comparison result` / `status bar` / `same session` / `scroll position and switches` / `keeps the previous result` / `swap` / `ruler and counts` / `restores`；中文 notes 含 `忽略空白差异` / `默认关闭` / `空格` / `制表符` / `同一份比较结果` / `状态栏` / `不新建会话` / `滚动位置与开关状态` / `保留上一次结果` / `交换` / `指示条与计数` / `复原`；CHANGELOG v0.2.21 段含 `忽略空白差异` / `默认关闭` / `重载` / `交换`。
- ac-coverage-baseline-untouched: `.munk/baseline/coverage.json` 零改动（`measuredAt.commit` = `11170a5`，晚于 v0.2.20 tag，freshness 已满足）；仅当实测门红时才更新，并须在交付说明写明红因与改动理由。
- ac-scope-whitelist: 收敛改动只落在 `package.json`、两份新 notes、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`.munk/**`；`git diff --name-only` 不含 `src/**`、UI / i18n / 产品文案、依赖、门清单数值、README、截图、`docs/release-evidence/**`、历史 notes / CHANGELOG 段。
- ac-gates-green: `.munk/code-gates.json` 全部 gate 自绿（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及各专项 gate），其中 `test` 内必须通过：`src/main/release-version-gate.test.ts`（`judgeVersionSources` 的 `tag-mismatch` / `missing`、`judgeNotesPresence`、`judgeNotesOrder`、`judgeNotesHeadings`、`judgePublishedAnchor`、`judgeReleaseHistory` 及 `noteFacts` 真实仓库 token 断言）、`src/main/release-packaging.test.ts`（中英 notes 路径由 `package.json` 派生、各自读取与写入次数、`<details><summary>简体中文</summary>` 折叠开合数、每份 notes `linkCount=1`）、`src/main/release-artifacts-and-brand.test.ts`（portable 小节 2 句 + `.zip`/`NSIS`/`no installation step`/`无安装步骤`，以及渲染器零 diff 断言）；不得以 skip / 放宽断言换取绿灯。
- ac-no-release-side-effects: 不推 tag、不 dispatch release workflow、不修改任何已公开 Release 与资产；只在本地生成收敛文件。

## 非目标

- 不修 bug、不调 UI、不改对比 / 合并语义、四态口径、快照 / 导出 / 目录扫描、不新增依赖。
- 不推 tag、不 dispatch release workflow、不修改已公开 Release 与资产、不改 README 正文与截图、不改 README 第 5 行。
- 不重写历史 notes / CHANGELOG / evidence / fixtures，不删减区间内 commit 来赶窗口。
- 不改 `src/**`（含 `release-version-gate.test.ts` 的 `noteFacts` 关键词集合），不以放宽门禁换取绿灯。
- 不新增“自有图标集”叙事；图标库与主题切换逻辑本版不改。

## 实现约束

### 版本锚点

- 单一来源：`package.json#version` 是 tag 唯一来源（`v${version}`）；CHANGELOG 顶部、两份 notes 标题、`release.yml` 默认 tag、`docs/release-process.md` 默认 tag 必须逐字相等（`judgeVersionSources`）。
- README 第 5 行由发布后收尾提交维护，本项不得改。
- 三处“下一版默认值”同批前进：`0.2.21` / `'v0.2.21'` / `'v0.2.21'`；历史段一律保留。

### notes 结构与门禁兼容

- release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body：任一缺失 / 空白 fail-closed；中文包在 `<details><summary>简体中文</summary>` 内。因此两份 notes 不得含 `<details>` / `<summary>`，也不得出现独占一行的 `---`。
- 每份 notes 除第 3 行语言切换外不得再有 markdown 链接或 `<https://...>` 自动链接（`release-packaging` 断言恰好 1 条链接）。
- `src/main/release-version-gate.test.ts` 的 `noteFacts` 硬编码了 v0.2.20 未变行为关键词，`src/**` 禁改。v0.2.21 notes 的 `Not in this release` / `不做的事` 必须以事实陈述保留 `ac-gate-tokens` 列出的全部英文 / 中文关键词；CHANGELOG v0.2.21 的「不做的事」同理。
- `Windows portable download` / `Windows 免安装包` 小节必须恰好 2 句，且含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`；可沿用 v0.2.20 的句式。
- notes 正文必须从 28 条 commit 的实际内容出发：只写 `What changed` 六节的事实；CI / coverage / spike / 基线 / 测试 / 合并提交一律 internal，不写成用户功能。

### 门禁现实（本轮已逐条核对源码，Coding 不得再自行改口径）

- `src/main/release-gate.ts`：共 5 个版本事实字段——`package.json#version` 自身，加上 `VERSION_SOURCE_FIELDS` 的 `CHANGELOG.md#top-entry`、notes 标题、`release.yml#workflow_dispatch.tag.default`、`docs/release-process.md#workflow_dispatch.default`；`judgeVersionSources` 要求后四项全部等于 `v0.2.21`。
- `judgeNotesOrder`：第 1 个 markdown 标题必须出现在第 1 行且含 tag；语言切换行以「同时含 `English` 与 `简体中文`」识别；切换行之后必须有非空正文。第 3 行位置是既有 notes 约定（v0.2.20 起一致），保持即可。
- `judgeNotesHeadings`：`NOTES_H2_PAIRS` 用 `includes` 逐位比对，中文必须是 `本次变化` / `Windows 安装包与免安装 zip` / `macOS 签名与公证` / `不做的事` / `风险与验证规模` / `升级方式`，不接受同义改写。
- `src/main/release-packaging.test.ts`：从 `package.json#version` 派生 `docs/release-notes/v${version}.md` 与 `.zh-CN.md`，断言两文件各读取 1 次、body 写入次数、`<details>` / `</details>` 开合数与 `<summary>简体中文</summary>`，并用 `src/main/__fixtures__/release-packaging.json` 的 `notesLinks.rows[].linkCount` 断言每份 notes 的 `\]\([^)]*\)` 计数恰为 1。
- `src/main/release-artifacts-and-brand.test.ts`：`notesSections` fixture 断言 portable 小节句数 2（英文切分 `(?<=\.)\s+`，中文 `(?<=。)`）、代码片段 `.zip`、正文 `NSIS` / `no installation step` / `无安装步骤`；同文件还断言渲染器目录自捕获 commit 起零 diff。
- `src/main/release-version-gate.test.ts` 的 `noteFacts`：英文 notes 全篇需含 12 个 token、中文 notes 需含 12 个 token、`CHANGELOG` 的 `## v0.2.21` 段需含 4 个 token（清单见 `ac-gate-tokens`）。`parseMarkdown` 收集的 `paragraphs` / `listItems` / `codeSpans` / `headings` 任一承载即可。
- `judgePublishedAnchor`：`publishedTag` 由 `docs/release-evidence/*` 中 `status: verified` 的最新 tag 派生（当前最新为 `v0.2.19`），README 第 5 行必须与之一致；本项不得把 README 改成 `v0.2.21`，否则该断言直接红。
- `judgeReleaseHistory`：CHANGELOG 标题序列须从新到旧、无重复、格式 `vX.Y.Z`；每个 `verified` 证据 tag 必须有对应 CHANGELOG 段（当前 `verified` 最新为 `v0.2.19`）；当前未发版 tag `v0.2.21` 允许暂无证据文件。

### 交付与证据

- commit-map 路径：优先 `.munk/runs/run_intake_c10ed848d591a3ac/commit-map.md`，逐行 `commit | subject | 归属`，28/28。当前 worktree 尚无 `.munk/runs/` 目录，若交付阶段该路径不可写，则落到 `.munk/changes/wi_intake_c10ed848d591a3ac/commit-map.md`；两种情况都必须在交付说明点名实际路径，不得因为路径问题跳过映射证据。
- 交付说明写明：收敛 commit sha、两份 notes 路径、commit-map 路径或 fallback、映射覆盖率 28/28、`pnpm test` 中 release-version-gate / release-packaging 的通过证据。
- 门禁以 `.munk/code-gates.json` 为准；不新增长跑门禁，不删除 / 跳过 / 放宽既有断言。
