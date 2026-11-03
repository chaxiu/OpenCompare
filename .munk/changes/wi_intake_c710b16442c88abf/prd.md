# v0.2.19 版本收敛与双语发布说明（2026-11-03 23:00 批次）

## Scope

为 2026-11-03 23:00 批次准备 v0.2.19 发布点，**只做版本收敛与双语发布说明，不改任何产品行为**：

1. 唯一版本源 `package.json#version` `0.2.18` → `0.2.19`；顺带 `release.yml` 的 `workflow_dispatch.inputs.tag.default` 同步为 `v0.2.19`，并同步 `docs/release-process.md` 里同一字面量（`judgeVersionSources` 要求五源同指，process doc 属既有版本一致性断言面）。
2. 新建 `docs/release-notes/v0.2.19.md`（英文全文）与 `docs/release-notes/v0.2.19.zh-CN.md`（中文镜像，只对应英文已有事实），写 `v0.2.18..main` 的三项用户可见变化：
   - 双栏文本对比新增「忽略空白差异」开关（默认关；开启只吞空格 / 制表符；行级与行内高亮 / 计数同源；状态栏仍显示原始值）；
   - 当前文件对显式重载（不新建会话、保留滚动与开关、失败就地提示并保留原结果）；
   - 左右面板显式交换（内容 / 状态栏原始值 / 指示条 / 计数对调、可复原）。
3. 同步 `CHANGELOG.md` 新版本段落，并按新版本号收敛仓内版本一致性测试事实（`release-version-gate.test.ts` 的 `noteFacts`、`release-packaging.test.ts` / `release-artifacts-and-brand.test.ts` 的真实 notes 断言），不放宽断言。
4. `README.md` / `README.zh-CN.md` 第 5 行仍只指已发布版本（v0.2.17），不随 bump 变动；发布说明 6 节双语镜像结构与 Windows 免安装 H3 不动。
5. 全量 `.munk/code-gates.json`（27 门）自绿；delivery 只做合入 main 的 local merge——不打 tag、不 push、不 `workflow_dispatch`、不改任何已公开 Release / 资产 / 版本证据历史。

## Acceptance Criteria

### 版本收敛

- ac-package-version: `package.json#version` 恰为 `0.2.19`，合法 semver；`package.json` 相对 main 的 diff 只有 `version` 一行变更，其余字段零 diff。
- ac-version-single-source: `judgeVersionSources(releaseFacts.versionSources)` 返回 `{ ok: true, issues: [] }`——派生 tag `v0.2.19`、`CHANGELOG.md` 顶部标题、英文 / 中文 notes 首行标题、`release.yml` 的 `default: 'v0.2.19'`、`docs/release-process.md` 的同一字面量五源同指。
- ac-workflow-dispatch-default: `.github/workflows/release.yml` 相对 main 仅 `workflow_dispatch.inputs.tag.default` 一处 `v0.2.18` → `v0.2.19`（单 hunk、净增行 0）；`on.push.tags`、checkout ref、gates 步骤顺序、三平台矩阵与 finalize 步骤零 diff。
- ac-process-doc-default: `docs/release-process.md` 恰 1 处版本字面量且为 `default: 'v0.2.19'`，该文件其余文本零语义变更。

### 双语发布说明

- ac-notes-exist: `docs/release-notes/v0.2.19.md` 与 `docs/release-notes/v0.2.19.zh-CN.md` 均存在且非空；`judgeNotesPresence` 与中英两版 `judgeNotesOrder` 均返回 `{ ok: true, issues: [] }`（首行含 `v0.2.19` 的 H1、第 3 行语言切换行、其后有正文）。
- ac-notes-switch-line: 英文第 3 行逐字为 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.19/docs/release-notes/v0.2.19.zh-CN.md)`；中文第 3 行逐字为 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.19/docs/release-notes/v0.2.19.md) | 简体中文`；两份全文 markdown 链接各恰 1 条，且无 `./` 相对链接、无 `](v0.2.19` 形态。
- ac-notes-h2-parity: 两版各恰 6 个 `## ` 且顺序逐对对应：`What changed` / `本次变化`、`Windows installer and portable zip` / `Windows 安装包与免安装 zip`、`macOS signing and notarization` / `macOS 签名与公证`、`Not in this release` / `不做的事`、`Risk and verification scope` / `风险与验证规模`、`Upgrade` / `升级方式`；`judgeNotesHeadings` 返回 ok。
- ac-notes-portable-section: 两版保留 H3 `Windows portable download` / `Windows 免安装包`，该节正文恰 2 句，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`；`notes-en-portable` / `notes-zh-portable` 两行断言真过。
- ac-notes-ignore-whitespace: 两份说明都写明新增「忽略空白差异」开关默认关闭（英文含 `ignore whitespace`、`off by default`；中文含 `忽略空白差异`、`默认关闭`），开启时只吞空格 / 制表符（英文含 `spaces` 与 `tabs`；中文含 `空格` 与 `制表符`），行级高亮、行内高亮与差异计数读同一份比较结果（英文 `one comparison result`、中文 `同一份比较结果` 至少各 1 次），状态栏仍显示原始值（英文 `status bar`、中文 `状态栏`）。
- ac-notes-reload: 两份说明都写明显式重载当前文件对：不新建会话（英文 `same session`、中文 `不新建会话`）、保留滚动位置与开关状态（英文 `scroll` 与 `switches`；中文 `滚动` 与 `开关`）、读取失败就地提示并保留上一次结果（英文 `keeps the previous result`、中文 `保留上一次结果`）。
- ac-notes-swap: 两份说明都写明左右面板显式交换：内容、状态栏原始值、指示条与计数一并左右对调（英文含 `swap`、`status bar`、`ruler`、`counts`；中文含 `交换`、`状态栏`、`指示条`、`计数`），且可再交换复原（英文 `restores`/`swap back`、中文 `复原`/`再交换`）。
- ac-notes-no-overclaim: 两版 `Not in this release` / `不做的事` 覆盖「除上述三项外不改比较语义与 IPC、不改导出 / 快照格式」；全文不把 `v0.2.18..main` 内的 CI / 发布验证提交（如 sha256 manifest、draft 15/15 校验）写成用户特性，也不出现 `will support` / `coming soon` / `即将支持` / `后续将` 一类未来承诺。

### CHANGELOG 与测试事实

- ac-changelog-top: `CHANGELOG.md` 首个二级标题为 `## v0.2.19`（`judgeReleaseHistory` 的 `changelog-top-mismatch` 不触发）、无重复版本标题；历史条目零删除行，全部改动落在新段内。
- ac-changelog-content: 新段含 `### 改进` / `### 不做的事` / `### 升级方式`，并覆盖「忽略空白差异」（默认关闭）、「重载」、「交换」三项，以及 `状态栏` 原始值口径。
- ac-version-gate-tokens: `src/main/release-version-gate.test.ts` 的 `noteFacts` 三组 token 换为 v0.2.19 事实（英文 12 项、中文 12 项、CHANGELOG 4 项，与上方 notes / changelog 各 AC 的 token 逐项一致）；用例数量不变、`expect(` 数不降，`repository release facts` 端到端断言真过。
- ac-packaging-assertions: `release-packaging.test.ts` 与 `release-artifacts-and-brand.test.ts` 的 release body / link gate / portable notes 断言在 `v0.2.19` 下真过；这些测试文件相对 main 零 diff，或改动仅为版本事实适配且断言强度不降（不得删除用例、不得放宽 link 条数 / 句数 / guard fail-closed 断言）。
- ac-no-version-literal-in-code: 仓库既有版本字面量扫描口径下，`src/` / `scripts/` / `docs/` 的 `.ts` / `.tsx` 中无 `0.2.19` 字面量（版本事实只落在 `.md` / `.json` / `.yml`）。

### 发布边界

- ac-readme-anchor: `README.md` 与 `README.zh-CN.md` 相对 main 零 diff，第 5 行仍只指向 `v0.2.17` 的公开 Release；`judgePublishedAnchor` 仍由 verified 证据派生（最新已发布 tag = `v0.2.17`）并返回 ok。
- ac-no-evidence-change: `docs/release-evidence/**` 零新增、零修改；`src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 与 `currentVersion` 零 diff（不新增 v0.2.19 台账行，不动历史证据）。
- ac-no-product-change: `src/core`、`src/renderer`、`src/preload`、`src/shared` 与 `src/main` 产品源码零 diff；`src/main` 内仅允许版本事实测试文件（`release-version-gate.test.ts`）改动。
- ac-no-release-actions: 全程未创建 / 移动 / 推送 / 删除 tag，未 `workflow_dispatch`，未对任何已公开 Release、资产或 `docs/release-evidence` 历史做写操作。

### 门禁与交付

- ac-code-gates-green: `.munk/code-gates.json` 全 27 门在最终工作树上 exit 0（含 `test`、`test-debt-gate`、`verify-release-gate`、`code-pair-actions`）；`.munk/baseline/test-debt.json` 的 ceiling / floor 未被改动，`repoTestLines ≤ 46215`、`repoTestCases ≥ 1528`，未删除或跳过用例。
- ac-delivery-merge-only: delivery 只做合入 `main` 的 local merge，无 tag / push / dispatch / Release 写入；回执写明版本 `0.2.19`、发布点 sha 与两文件路径 `docs/release-notes/v0.2.19.md`、`docs/release-notes/v0.2.19.zh-CN.md`。

## Non-Goals

- 不做新特性：不改「忽略空白差异」、重载、交换三者之外的任何 UI 或行为；不新增开关。
- 不改比较语义与 IPC：`src/core` 比较算法、四态语义、`src/preload` / IPC channel 一律不动。
- 不改导出 / 快照格式、目录扫描口径与三向合并。
- 不动 `docs/release-evidence/**` 与 `__fixtures__` 台账历史；不补写 v0.2.19 证据文件或台账行。
- 不执行发版：不打 tag、不 push、不 dispatch、不建 / 不改 Release、不改 README 状态行。
- 不重排发布说明 6 节结构，不改 Windows 免安装 H3 位置；不做顺带文档润色。

## Implementation Constraints

- 版本事实锚点（已核实）：`package.json` 第 3 行 `"version": "0.2.18"`；`.github/workflows/release.yml` 第 17 行 `default: 'v0.2.18'`（全文件唯一版本字面量）；`docs/release-process.md` 第 8 行同一字面量（唯一 1 处）；`CHANGELOG.md` 顶部 `## v0.2.18` 段。
- `noteFacts` 在 `src/main/release-version-gate.test.ts` 第 155-159 行；`releaseFacts` 由真实仓文件派生（`src/main/release-doc-fixtures.test-helpers.ts` 以 `pkg.version` 派生 `currentTag`），因此 notes 路径必须是 `v0.2.19.md` / `v0.2.19.zh-CN.md`。
- H2 顺序、notes 第 3 行切换链接模板、便携 H3 的 2 句 / token 要求来自 `src/main/__fixtures__/release-packaging.json#notesLinks` 与 `src/main/__fixtures__/release-artifacts-and-brand.json#notesSections`，沿用 v0.2.18 已通过的结构即可。
- `judgeReleaseHistory` 允许「当前 tag 无证据文件」（`the pending current tag has no evidence` 分支），故本轮不写 v0.2.19 证据文件不会破门禁；已公开的 verified 历史行必须保持有对应 CHANGELOG 条目。
- `v0.2.18..main` 范围内含 `9c25953` / `d9a3589` 等发布验证与 CI 提交：写说明时必须过滤，不写成用户特性。
- 前序同型收敛记录（可作为格式范式）：`.munk/baseline/domains/release/qa/v0218-version-convergence-bilingual-notes.md`；v0.2.18 两份 notes 可作段落骨架参考，但内容需换成本版三项事实。
- 不做设计 / 架构评审：改动面为版本字面量 + markdown + 一个测试文件的字符串事实，无新结构。
