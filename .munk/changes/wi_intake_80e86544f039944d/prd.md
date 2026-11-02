# v0.2.17 版本收敛与双语发布说明

## Scope

把 `main` 收敛到可发布的 v0.2.17，为 2026-11-02 23:00 批次窗口做准备。基线为最新 `main`（当前 `bef2a0f`，已含 Q6 测试债回归门）；交付前先 rebase 到最新 `main`。本项只做版本锚点、双语文档、变更记录与对应发布门断言，不触碰产品算法、目录扫描口径、快照格式或发布通道。

具体范围：

1. `package.json#version` 改为 `0.2.17`；`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 改为 `v0.2.17`。
2. `README.md` / `README.zh-CN.md` 第 5 行保持当前已发布版本 `v0.2.16`，不随本次 bump 变化。
3. 新建 `docs/release-notes/v0.2.17.md`（英文）与 `docs/release-notes/v0.2.17.zh-CN.md`（中文）：
   - 第 1 行为 `# ... v0.2.17 ...` 标题，第 3 行为双语互链，且为 tag 固定的绝对 URL。
   - 两个文件的 H2 标题数量、顺序一一对应。
   - 覆盖本版用户可见变化：模板归位逐条动作列与显式移动（默认复制、移动需显式勾选、sha256 + mtime 校验通过才删源、失败保留源与目标且不回滚）、大小写不敏感碰撞折叠与路径越界防护、同步失败提示随界面语言本地化（英文界面不再出现中文 EACCES/EPERM 句）。
   - 保留 NSIS 安装包 + 免安装 zip、macOS 签名与公证、`Not in this release`、`Risk and verification scope`、`Upgrade` 小节。
4. `CHANGELOG.md` 顶部补 `## v0.2.17`，按既有 Keep a Changelog 口径记录本版用户可见变化。
5. 同步发布文档中的版本引用：`docs/release-process.md` 的 `workflow_dispatch` 默认 tag；`docs/release-signing.md` 的补发默认 tag、`正式版发布姿态（v0.2.17）` 与「本版发布说明」链接；已发布事实（`当前状态：v0.2.16 已发布`、v0.2.16 证据链接）保持真实，不提前宣称 v0.2.17 已发布。
6. 调整发布门断言，使「正在收敛的版本」与「已发布版本」解耦：README 第 5 行对齐已发布台账中的最新 verified 版本；当前 `package.json#version` 只对齐 CHANGELOG 顶部、发布说明标题、dispatch 默认值与发布流程文档默认值。v0.2.17 尚未发布，因此不要求也不创建 `docs/release-evidence/v0.2.17.md`。
7. 全量跑通 `.munk/code-gates.json` 的 22 门后交 Delivery 做 `local_merge`。

## Acceptance Criteria

- ac-version-package: `package.json#version` 精确等于 `0.2.17`，且为合法语义版本。
- ac-workflow-default-tag: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 精确等于 `v0.2.17`；触发方式、checkout、门禁、打包与发布步骤保持原样。
- ac-readme-published-anchor: `README.md` 与 `README.zh-CN.md` 第 5 行仍只指向 `v0.2.16` 的公开 Release，各含且仅含一个 `releases/tag/` 链接，不出现 `v0.2.17` 或待发布字样。
- ac-notes-files-exist: `docs/release-notes/v0.2.17.md` 与 `docs/release-notes/v0.2.17.zh-CN.md` 均存在且非空。
- ac-notes-title-and-switch: 两个发布说明第 1 行标题均含 `v0.2.17`；第 3 行分别为 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.zh-CN.md)` 与 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.md) | 简体中文`，且各自只有 1 个 Markdown 链接、无相对链接。
- ac-notes-h2-parity: 英文与中文发布说明的 H2 标题数量相同、顺序逐项对应；英文侧至少包含 `What changed`、`Windows installer and portable zip`、`macOS signing and notarization`、`Not in this release`、`Risk and verification scope`、`Upgrade`，中文侧包含其一一对应标题。
- ac-notes-template-move: 发布说明同时覆盖「逐条动作列 / 默认复制 / 显式勾选才移动 / sha256 与 mtime 校验通过才删除源 / 失败保留源与目标且不回滚」五项事实（英文与中文各自成段或成条可断言）。
- ac-notes-safety-and-i18n: 发布说明覆盖大小写不敏感碰撞折叠、路径越界拒绝，以及同步失败提示随界面语言本地化、英文界面不再输出中文 EACCES/EPERM 句。
- ac-notes-retained-sections: 发布说明保留 NSIS 安装包 + 免安装 zip、macOS Developer ID 签名 + Apple 公证、`Not in this release` / `不做的事`、`Risk and verification scope` / `风险与验证规模`、`Upgrade` / `升级方式`。
- ac-changelog-top: `CHANGELOG.md` 第一个二级标题为 `## v0.2.17`，无重复版本标题，历史条目顺序不变，且内容覆盖本版用户可见变化。
- ac-release-docs-sync: `docs/release-process.md` 含 `default: 'v0.2.17'`；`docs/release-signing.md` 含 `正式版发布姿态（v0.2.17）`、`本版发布说明见 docs/release-notes/v0.2.17.md`、补发默认 `v0.2.17`，同时仍含 `当前状态：v0.2.16 已发布` 与 v0.2.16 发布证据链接。
- ac-published-tag-decoupled: 发布门从 `docs/release-evidence-ledger.json` / `docs/release-evidence/*.md` 的已发布数据派生最新 verified tag，并断言 README 第 5 行与该 tag 一致；不再要求 README 第 5 行等于 `package.json#version`。
- ac-current-tag-sources: 发布门断言 `CHANGELOG.md` 顶部、发布说明标题、`release.yml` dispatch 默认值、`docs/release-process.md` 默认值均等于 `package.json#version` 派生出的当前 tag；任一缺失或指向别处时门失败。
- ac-pending-evidence-allowed: 当前 tag 尚无证据文件时不报 `evidence-missing`；但只要英文或中文发布说明缺失，仍按双语 fail-closed 失败；历史 changelog 版本缺证据或 verified 证据缺 changelog 条目仍失败。
- ac-evidence-ledger-data-driven: 证据台账断言继续由 `.munk/baseline` 之外的数据文件（`docs/release-evidence-ledger.json` 与 `src/main/__fixtures__/release-packaging.json`）驱动，不在 `.ts` / `.tsx` 中硬编码当前或已发布版本号；证据文件的资产行、字节数、sha256 与 ledger 逐项对账保持。
- ac-zh-details-fold: 发布正文门继续断言 `<details><summary>简体中文</summary>` 与 `</details>` 各出现 1 次，中英文段各自携带当前 tag；任一语言缺失时门非零退出。
- ac-no-version-literal-in-code: `scripts/test-debt-gate.mjs` 在当前 `package.json#version` 下检查 `src/`、`scripts/`、`docs/` 的 `.ts` / `.tsx`，命中 0 处版本字面量。
- ac-no-release-evidence-0217: 不创建 `docs/release-evidence/v0.2.17.md`，不修改既有 `docs/release-evidence/*.md` 与已公开 Release 相关资产引用。
- ac-code-gates-22: `.munk/code-gates.json` 的 22 门全部通过，包含 `test-debt-gate`；`repoTestLines` 不超过现有 ceiling `42724`，`repoTestCases` 不低于现有 floor `1373`。
- ac-delivery-local-merge-only: 交付只做 `local_merge`；不创建或移动 tag、不 dispatch Release、不改已公开 Release 与资产、不写 `release-evidence/v0.2.17.md`。

## Non-Goals

- 不改对比与合并算法、目录扫描口径、快照格式、发布通道或任何用户可见功能实现。
- 不回写 v0.2.17 发布证据，不宣称 v0.2.17 已发布；README 第 5 行保持 v0.2.16。
- 不重打、不删除、不替换任何历史 tag、Release 或资产。
- 不在 `.ts` / `.tsx` 中写入 `0.2.17` 版本字面量。
- 不重写 CHANGELOG 历史条目，不扩大门禁矩阵。
- 不把门禁、fixtures、baseline 文档当成新的用户功能写入发布说明。

## Implementation Constraints

- 交付前先 rebase 到最新 `main`，再执行全量 22 门。
- 发布说明英文与中文 H2 必须一一对应；第 3 行互链使用 tag 固定绝对 URL。
- 发布门保持 fail-closed：双语缺一即红，中文 `<details>` 折叠标记断言保留，历史证据缺口仍红。
- 版本台账断言数据驱动：当前 tag 来自 `package.json#version`，已发布 tag 来自 release evidence ledger / 证据目录，不在测试代码里手抄版本号。
- `test-debt-gate` 的 `repoTestLines` 已正好等于 ceiling `42724`；新增或调整测试必须保持总行数不增长（或同步压缩等量行），不得抬高 ceiling。
- `scripts/test-debt-gate.mjs` 只扫描 `.ts` / `.tsx`；发布说明与证据只写 `.md`，版本字面量只允许出现在 `.md` / `.json` / `.yml`。
- 发布文档只同步「当前收敛版本」引用；`当前状态：v0.2.16 已发布` 与 v0.2.16 证据是历史事实，保持不变。
- 不新增 code gate，不修改 `.munk/code-gates.json` 的 22 门结构。
