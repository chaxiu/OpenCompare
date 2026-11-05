# v0.2.22 版本与双语发布说明收敛

## 范围

把已合入主干的用户可见改动收敛成一个可发版的版本锚点 `v0.2.22`，并补齐它结构上依赖的 `v0.2.21` 发版收尾（本仓 `v0.2.21` 已公开发布但仓库内证据与 README 状态行从未回写）。

1. **v0.2.21 发版收尾（锚点的硬前置，不是顺手扩展）**
   - 新增 `docs/release-evidence/v0.2.21.md`（`status: verified`），按 `v0.2.19.md` 同构记录：tag → 发布点、公开 Release、Release CI + post-release-verify、12 件资产 size / sha256、public L1 结论、未覆盖面。事实锚：tag 对象 `8fae4649…`（annotated）→ commit `32e9369…`；`publishedAt 2026-11-05T00:46:30Z`、`draft=false`、资产 12；Release run `41942345443` 五 job success；post-release-verify run `41943461686`（spike ×2 / verify ×3 / aggregate）全 success。
   - `src/main/__fixtures__/release-packaging.json#evidence.ledger` 追加 `evidence-v0.2.21`（`verified`，`assets: 12`）。该表驱动断言要求台账与 `docs/release-evidence/*.md` 一一覆盖。
   - `README.md` / `README.zh-CN.md` 第 5 行「最新公开版本」推进到 `v0.2.21`，其余正文零改动。
   - 不做这一步的后果是硬性的：`package.json#version` 一升到 `0.2.22`，`## v0.2.21` 就从「当前 tag（免证据）」变成历史段，`judgeReleaseHistory` 直接报 `evidence-missing`；且最新 verified 仍停在 `v0.2.19`，`judgePublishedAnchor` 与「升级来源锚在已公开版本」互相打架。

2. **v0.2.22 版本锚点收敛**
   - `package.json#version` = `0.2.22`（只改该字段）。
   - 新增 `docs/release-notes/v0.2.22.md` + `v0.2.22.zh-CN.md`，中文 `CHANGELOG.md` 顶部插入 `## v0.2.22` 段。
   - `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 的默认 tag 代码片段同步为 `v0.2.22`。

3. **本版要如实写进说明的用户可见内容（`v0.2.21..HEAD` 共 10 条 commit）**
   - **未知扩展名按内容判定**（`bbed0c2`，域 `file-family` / `text-probe`）：扩展名无法识别时读一次原始字节判文本 / 二进制。文本按 `code` 家族打开（保留 UTF-8 / GBK 编码与换行事实），二进制拒绝且提示指向具体一侧；覆盖四个打开入口（手动路径 / argv / `opencompare://`、拖放 / 选择器 / 历史重开、目录树双击、三向合并）；已知扩展名行为与读取次数不变（不新增 probe）；相关提示文案改为「扩展名无法识别时按内容判断，二进制文件不支持」。
   - **双语 README 截图**（`b1333b8` + `7490ea2` + `72f6f08`）：四个场景图（两个场景 × 中英）取自真实构建，语言由持久化设置钉住而非宿主 locale，`docs/screenshots.md` 的 commit / 字节 / sha256 provenance 重新钉住。

## 验收

- ac-pkg-version: `package.json#version` 逐字为 `0.2.22`，且该文件 `git diff` 只含 `version` 一行，无其他字段变动。
- ac-notes-bilingual-exist: `docs/release-notes/v0.2.22.md` 与 `docs/release-notes/v0.2.22.zh-CN.md` 均存在且去除空白后非空。
- ac-notes-head-links: 两份 notes 第 1 行标题均含 `v0.2.22`；第 3 行分别为固定绝对互链（英文 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.22/docs/release-notes/v0.2.22.zh-CN.md)`，中文镜像），每文件恰 1 条 markdown 链接、无 `<https://…>` 自动链接；第 4 行起为非空正文。
- ac-notes-h2-parity: 中英均含固定 6 个 H2 且同序（`What changed` / `Windows installer and portable zip` / `macOS signing and notarization` / `Not in this release` / `Risk and verification scope` / `Upgrade`，中文为 `本次变化` / `Windows 安装包与免安装 zip` / `macOS 签名与公证` / `不做的事` / `风险与验证规模` / `升级方式`），H3 中英一一对应。
- ac-notes-portable-section: 中英均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，正文恰 2 句（英文按 `(?<=\.)\s+`、中文按 `(?<=。)` 切分，节内不用带点缩写）。
- ac-notes-content-v0222: 两份 notes 的 `What changed` / `本次变化` 都以事实陈述同时覆盖 (a) 未知扩展名按内容判定（文本按代码打开、二进制拒绝并指明侧别、四个入口一致、已知扩展名零新增读取、提示文案更新）与 (b) 双语 README 截图（四图、语言由设置钉住、provenance 重钉）；不得把任一写成「计划」或「将支持」。
- ac-notes-accuracy: `v0.2.21..HEAD` 的合并、基线折叠、CI / 覆盖率 / 测试、截图取证与 ratchet 调整类 commit（`9f59ffa`、`147224b`、`4a31302`、`ba5d5ce`、`070feca`、`72f6f08`、`4795645`）不得写成用户功能；notes 不写性能 / 内存数字、不声称新增自有图标集或未合入能力。
- ac-commit-map-coverage: 已打 tag `v0.2.21`..`HEAD` 的全部 10 条 commit 在 notes 有归属，或在 `.munk/runs/{runId}/commit-map.md` 标注 `internal`（run 目录不可写则回落 `.munk/changes/{workItemId}/commit-map.md` 并在交付说明点名）；覆盖率 100%，逐行 `commit | subject | 归属`。
- ac-changelog-top: `CHANGELOG.md` 首个版本段为 `## v0.2.22`，位于 `## v0.2.21` 之上，段内含概述 + `### 改进` / `### 修复` + `### 不做的事` + `### 升级方式`，沿用既有中文风格。
- ac-changelog-tokens: `## v0.2.22` 段文本含 `忽略空白差异`、`默认关闭`、`重载`、`交换` 四个 token（`release-version-gate` 的 `noteFacts` 断言），以事实陈述保留，不是新语义。
- ac-notes-fact-tokens: 新 notes 的 `Not in this release` / `不做的事` 以事实陈述保留既有 `noteFacts` 关键词——英文 `ignore whitespace` / `off by default` / `spaces` / `tabs` / `one comparison result` / `status bar` / `same session` / `scroll position and switches` / `keeps the previous result` / `swap` / `ruler and counts` / `restores`，中文 `忽略空白差异` / `默认关闭` / `空格` / `制表符` / `同一份比较结果` / `状态栏` / `不新建会话` / `滚动位置与开关状态` / `保留上一次结果` / `交换` / `指示条与计数` / `复原`；`src/**` 不改的前提下通过。
- ac-upgrade-source: 三处升级来源（英文 notes `## Upgrade` 首句、中文 notes `## 升级方式` 首句、`CHANGELOG.md` 新段 `### 升级方式` 首句）版本号唯一为 `v0.2.21`，与两份 README 第 5 行一致；文件内不出现 `Upgrade from v0.2.20` / `Upgrade from v0.2.19` / `建议从 v0.2.20` / `建议从 v0.2.19` / `从 v0.2.20 升级` / `从 v0.2.19 升级`。
- ac-notes-unchanged-scope: 两份 notes 的 `Risk and verification scope` / `风险与验证规模` 陈述「v0.2.22 相对 v0.2.21 的新增部分是内容兜底判定与截图资产」，并保留「比较语义、IPC、导出与快照格式均未改动」/ `Comparison semantics, IPC, export and snapshot formats are untouched.`，中英逐句对应，不写性能 / 内存数字。
- ac-evidence-v021-doc: `docs/release-evidence/v0.2.21.md` 存在，全文恰 1 处 `status: verified`，首行标题含 `v0.2.21` 且含中文；含可被 `parseEvidence` 命中的结构——`| tag_name | \`v0.2.21\``、`| 资产数 | 12`、含 `tag → commit` 且带反引号 sha 的行（`8fae4649…` → `32e9369…`）、`releases/tag/v0.2.21` 链接、12 行资产表；记录 Release run `41942345443`（五 job）与 post-release-verify run `41943461686` 的 aggregate 结论。
- ac-evidence-v021-assets: 该证据 12 行资产的 name / bytes / sha256 与 `gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.21 --jq '.assets[]|[.name,.size,.digest]|@tsv'` 逐行一致（sha256 小写 64 位十六进制，前 `sha256:` 口径与既有证据一致），资产名全部落在 `evidence.assetFamilyPattern` 内，且含 `OpenCompare-0.2.21-win-x64.zip`。
- ac-evidence-v021-no-fabrication: 证据只写可核事实；无 `v0.2.21` L1 真机场次记录时显式写明「本轮无 L1 真机场次，以 post-release-verify aggregate 与 public L1 为准」，不预写未发生的 pass/fail，不复制 `v0.2.19` 的四态 / 耗时数字。
- ac-fixture-ledger-row: `src/main/__fixtures__/release-packaging.json#evidence.ledger` 末尾追加 `{"id":"evidence-v0.2.21","version":"v0.2.21","status":"verified","assets":12}`；台账 version 集合与 `docs/release-evidence/*.md` 文件名集合完全相等（各出现一次），既有行逐字不变。
- ac-readme-line5: `README.md` 与 `README.zh-CN.md` 第 5 行指向 `v0.2.21` 的 Release（中英各自既有句式），两文件除第 5 行外零 diff（正文、第 3 行互链、截图引用均不变）。
- ac-published-anchor: `judgePublishedAnchor` 返回 `{ ok: true, issues: [] }`——证据派生的最新 verified tag 为 `v0.2.21`，中英 README 第 5 行与之一致；`docs/release-evidence-ledger.json` 零改动，且 `package.json#version` 不参与该判定。
- ac-workflow-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 逐字为 `'v0.2.22'`，该处只改字面量。
- ac-process-default: `docs/release-process.md` 的默认 tag 仍以独立代码片段存在（`parseMarkdown` 的 `codeSpans` 可匹配 `/^default:\s*'([^']+)'$/`），值为 `v0.2.22`；该文件除该字面量外零改动。
- ac-history-untouched: `docs/release-notes/v0.2.21.md` / `.zh-CN.md` / `v0.2.20.md` / `.zh-CN.md` 零 diff；`CHANGELOG.md` 自 `## v0.2.21`（含）到文件末尾逐字节不变；`docs/release-evidence/v0.2.19.md`、`v0.2.20.md` 零 diff。
- ac-diff-scope-whitelist: 改动文件恰为 `package.json`、`docs/release-notes/v0.2.22.md`、`docs/release-notes/v0.2.22.zh-CN.md`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-evidence/v0.2.21.md`、`src/main/__fixtures__/release-packaging.json`、`README.md`、`README.zh-CN.md`（`.munk/**` 不计）；不含 `src/renderer/**`、`src/core/**`、`src/shared/**`、i18n 词典、依赖、`electron-builder.yml`、`docs/release-evidence-ledger.json`、历史 notes / 证据、截图 PNG。
- ac-gates-green: `.munk/code-gates.json` 全量 29 门自绿（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `verify-release-gate` / `test-debt-gate`，其中 `test` 覆盖 `release-version-gate` 的 `tag-mismatch` / `missing` / notes 顺序与标题判定、`release-packaging` 的证据台账覆盖与资产行断言）；不得以 skip / 放宽断言 / 删用例换绿灯。
- ac-no-release-side-effects: 不打 tag、不 `git push` 新 tag、不 dispatch release workflow、不 `gh release edit/upload/delete`；只在本地生成文件，交付为单条提交且工作区干净。

## 非目标

- 不改产品行为：不做 `src/renderer/**` / `src/core/**` / `src/shared/**` 改动，不调 UI、i18n 词典、对比 / 合并语义、IPC、导出与快照格式。
- 不改依赖、`electron-builder.yml`、门禁阈值、`src/main/release-version-gate.test.ts` 的 `noteFacts` 关键词集合；不以放宽门禁换绿灯。
- 不重写历史 notes、历史 `CHANGELOG` 段、既有证据文件与 `docs/release-evidence-ledger.json`；不删除区间内 commit 来赶窗口。
- 不重算 / 不重传资产，不重打 tag，不修改已公开 Release `v0.2.21` / `v0.2.19` 的正文与资产。
- 不做真 draft run（三平台 15/15 → aggregate → publish）；发布动作仍由 Product Owner 在本项合入后触发，本项不声称 `v0.2.22` 已发布。
- 不补 `v0.2.20` 的任何内容：该版已记为「已打 tag 但从未发出公开 Release」，维持 `status: blocked`。

## 实现约束

- **版本单一来源**：tag 由 `v${pkg.version}` 派生，`package.json#version`、两份 notes 标题、`CHANGELOG` 顶部段、`release.yml` default、`docs/release-process.md` default 必须同批笔误一致（`judgeVersionSources`）。
- **本轮必须包含 v0.2.21 收尾**：`src/main/release-doc-fixtures.test-helpers.ts` 的 `evidenceFacts` 只读 `docs/release-evidence/*.md` 的 `status:`，`judgeReleaseHistory` 对「非当前 tag 且无证据文件」的 CHANGELOG 段报 `evidence-missing`；`release-packaging.test.ts` 的 “covers every evidence file once” 要求追加 `docs/release-evidence/v0.2.21.md` 后同步追加 fixture 台账行。缺其中任一项，版本锚点必红。
- **升级来源即已公开版本**：`v0.2.21` 已于 `2026-11-05T00:46:30Z` 公开（`draft=false`、12 资产、Release run `41942345443` 与 post-release-verify run `41943461686` 均 success），所以本轮把 README 第 5 行推进到 `v0.2.21` 后，「升级来源 = README 第 5 行 = 最新 verified」三者自洽；`v0.2.20` 只能以「已打 tag 但从未发出公开 Release」出现，不得占升级来源位置。
- **notes 由 version 派生**：workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body，任一缺失 / 空白 fail-closed；两文件不得含 `<details>` / `<summary>` / 独占一行的 `---`；`bodyGate` 断言 `linkCount=1` 与 6 个 H2 顺序。
- **证据结构照 `v0.2.19.md`**：`parseEvidence` 依赖 `| 资产数 | 12`、`| tag_name | \`v0.2.21\``、含 `tag → commit` + 反引号 sha 的行、`releases/tag/v0.2.21` 链接；资产表 12 行且 name 命中 `ASSET_FAMILY`；不得出现非 64 位小写十六进制却看似 sha 的 token（`malformed` 断言）。
- **事实取数一次**：资产 name / size / digest 用 `gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.21 --jq '.assets[]|[.name,.size,.digest]|@tsv'` 单次取样，不下载资产；取不到就写 `blocked` + 来源，不臆造。
- **改动面可审计**：收敛提交为单条提交、工作区干净；`git diff --stat` 只含白名单文件；`git diff README.md` 只有第 5 行一处 hunk。
- **映射证据先于回执**：`commit-map.md` 在 `.munk/runs/{runId}/`，交付回执写明收敛 commit sha、两份 notes 路径、证据路径、commit-map 路径与映射覆盖率。
