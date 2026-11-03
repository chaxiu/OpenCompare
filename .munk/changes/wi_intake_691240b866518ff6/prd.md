# v0.2.18 版本收敛与双语发布说明

## Scope

把当前 `main`（基线 `2d19be65`，I#9 五子项已全部合入）收敛到可发版的 v0.2.18，供 2026-11-03 23:00 发版点使用。**只改发布元数据、发布文档与「当前版本」锚点**，不改任何运行时行为。本项不推 tag、不 push、不 dispatch release workflow、不改已公开 Release / 资产 / tag。

本批相对 v0.2.17 的用户可见交付只有 I#9 文本比较归一化一组改动（`17019d4` / `2e8ee37` / `6331aa9` / `9a22e3` / `b6cb4ef` / `a728a41` / `f0a027b`）：

- 代码 / 文本比较新增两个默认开启的开关：忽略换行符差异、忽略编码差异；开启时仅换行 / 仅编码差异不计入行级高亮、行内高亮与差异计数，关闭后恢复严格逐字节比较；差异计数是同一份结果里的单一值。
- 状态栏始终分别显示左右两侧探测到的**原始**换行符与编码，切换开关不改写显示值；打开文件对时把探测事实带进会话。
- 归一化不写回原文、不改导出内容、不改目录四态与快照格式、不改三向合并。
- 真实文件证据覆盖 UTF-8 / UTF-8 BOM / UTF-16LE / GBK × CRLF / LF 六个落盘变体，千行组与 5 MiB 组均有证据（`diff-normalize-real`）。

具体范围：

1. `package.json#version` 由 `0.2.17` 改为 `0.2.18`（唯一版本来源）。
2. 新建 `docs/release-notes/v0.2.18.md`（英文全文）与 `docs/release-notes/v0.2.18.zh-CN.md`（中文全文），结构与 v0.2.17 两份对齐（同样的 6 个 H2、同样的 H3 与「不做的事 / Not in this release」段落），只写上面列出的真实交付。
3. `CHANGELOG.md` 顶部按既有 Keep a Changelog 格式补 `## v0.2.18` 段（`### 改进` / `### 不做的事` / `### 升级方式`），历史条目一字不动。
4. 同步「当前版本」单一来源锚点：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 改为 `v0.2.18`；`docs/release-process.md` 中 `default: 'v0.2.17'` 的 codeSpan 改为 `default: 'v0.2.18'`。这两处是 `judgeVersionSources` 的版本五源一致性门要求，改动不触发任何工作流。
5. 同步「只指向当前版本」的测试锚点：`src/main/release-version-gate.test.ts` 中本版 notes / CHANGELOG 的内容 token 清单改为 v0.2.18 事实（见 AC），**净增行数必须为 0**（`repoTestLines` ceiling `44398` 已用满 growth，不得再抬）。
6. 按最新指令写 `docs/release-evidence/v0.2.18.md` 作为**预发布事实记录**（`status: blocked`：未打 tag、未 push、未创建 Release、无资产、无 sha256），并在 `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 追加 `v0.2.18` / `blocked` 行（无 `assets` 字段）；既有历史行与 `evidence.currentVersion` 的 v0.2.17 资产表一律不动。
7. `README.md` / `README.zh-CN.md` 第 5 行保持 `v0.2.17`（发布收尾项再翻）。
8. 全量 `.munk/code-gates.json` 24 门自绿后交 Delivery 做 `local_merge`；不放宽任何既有门禁。

## Acceptance Criteria

- ac-version-package: `package.json#version` 精确等于 `0.2.18`，且为合法语义版本；仓库内没有第二处可写版本来源（`electron-builder.yml`、`release.yml` 不从字面量取版本）。
- ac-version-single-source: `judgeVersionSources(releaseFacts.versionSources)` 返回 `{ ok: true, issues: [] }`，即 `package.json#version` 派生 tag、CHANGELOG 顶部标题、发布说明标题、`release.yml` dispatch 默认值、`docs/release-process.md` 默认值五源同为 `v0.2.18`；任一缺失或指向他版为红。
- ac-workflow-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 精确等于 `v0.2.18`；`on.push.tags`、checkout `refs/tags/<tag>`、gates 的 `pnpm install --frozen-lockfile / lint / typecheck / test / build` 顺序、三平台矩阵与 finalize 步骤全部不变。
- ac-process-doc-default: `docs/release-process.md` 中恰好一个 codeSpan 匹配 `^default:\s*'v0\.2\.18'$`；该文件其余内容不变（README 状态行仍指已发布版本的口径保留）。
- ac-notes-exist: `docs/release-notes/v0.2.18.md` 与 `docs/release-notes/v0.2.18.zh-CN.md` 均存在且非空；`judgeNotesPresence` 与两语言的 `judgeNotesOrder` 均返回 `{ ok: true, issues: [] }`（第 1 行是含 `v0.2.18` 的 H1，第 3 行是语言切换行，其后有正文）；缺任一文件或任一为空即 fail-closed。
- ac-notes-switch-line: 英文第 3 行精确等于 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.18/docs/release-notes/v0.2.18.zh-CN.md)`，中文第 3 行精确等于 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.18/docs/release-notes/v0.2.18.md) | 简体中文`；每个文件全文只有 1 个 Markdown 链接，且不含 `./` 相对链接。
- ac-notes-h2-parity: 两版 notes 的 H2 数量相同、顺序逐对为 `What changed`/`本次变化`、`Windows installer and portable zip`/`Windows 安装包与免安装 zip`、`macOS signing and notarization`/`macOS 签名与公证`、`Not in this release`/`不做的事`、`Risk and verification scope`/`风险与验证规模`、`Upgrade`/`升级方式`；`judgeNotesHeadings` 返回 ok。
- ac-notes-portable-sections: 两版 notes 仍保留 H3 `Windows portable download` / `Windows 免安装包`，该节正文 2 句，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`；`release-artifacts-and-brand` 的 `notes-en-portable` / `notes-zh-portable` 两行真过。
- ac-notes-two-switches: 两版 notes 的用户可见变化段同时出现 `Ignore newline differences` / `忽略换行符差异` 与 `Ignore encoding differences` / `忽略编码差异`，并写明两者**默认开启**（`on by default` / `默认开启`）。
- ac-notes-switch-effect: notes 写明开启时仅换行 / 仅编码差异不计入行级与行内高亮及差异计数，关闭后恢复严格逐字节比较（英文含 `byte-for-byte`，中文含 `逐字节`）；且差异计数是同源单一值（英文含 `one comparison result`，中文含 `同一份比较结果`）。
- ac-notes-status-raw: notes 写明状态栏始终分别显示左右两侧探测到的原始换行符与编码（英文含 `status bar`、`Left newline`、`Left encoding`、`Right newline`、`Right encoding`；中文含 `状态栏`、`左侧换行符`、`左侧编码`、`右侧换行符`、`右侧编码`），且切换开关不改写这些显示值。
- ac-notes-no-writeback: notes 写明归一化不写回原文（英文含 `not written back`，中文含 `不写回`），不改导出内容、不改目录四态与快照格式、不改三向合并（英文含 `three-way merge`，中文含 `三向合并`）。
- ac-notes-open-probe: notes 写明打开文件对时把两侧探测事实带进会话（状态栏因此有值），不把它写成新的用户功能之外的验证面。
- ac-notes-not-in-release: 两版 notes 的 `Not in this release` / `不做的事` 段落覆盖：除两个开关外不改对比与合并算法、不改目录扫描口径与快照格式、不改导出内容、不改发布通道；段落内不出现门禁 / 夹具 / 基线文档被当成用户功能的表述。
- ac-notes-risk-scope: 两版 notes 的 `Risk and verification scope` / `风险与验证规模` 写明真实文件证据覆盖六个落盘变体（UTF-8、UTF-8 BOM、UTF-16LE、GBK 搭配 LF / CRLF）、千行组与 5 MiB 组，且不新增性能 / 内存承诺数字。
- ac-changelog-top: `CHANGELOG.md` 第一个二级标题为 `## v0.2.18`，无重复版本标题，历史条目顺序与内容不变；该段含 `### 改进`、`### 不做的事`、`### 升级方式`，覆盖 `忽略换行符差异`、`忽略编码差异`、`默认开启`、`状态栏`、`不写回`。
- ac-version-gate-anchors: `src/main/release-version-gate.test.ts` 的 `noteFacts` 三行 token 清单改为 v0.2.18 事实——英文 `Ignore newline differences`、`Ignore encoding differences`、`on by default`、`byte-for-byte`、`one comparison result`、`status bar`、`Left newline`、`Left encoding`、`Right newline`、`Right encoding`、`not written back`、`three-way merge`；中文 `忽略换行符差异`、`忽略编码差异`、`默认开启`、`逐字节`、`同一份比较结果`、`状态栏`、`左侧换行符`、`左侧编码`、`右侧换行符`、`右侧编码`、`不写回`、`三向合并`；CHANGELOG 段 `忽略换行符差异`、`忽略编码差异`、`默认开启`、`状态栏`；`releaseFacts` 端到端断言真过；该文件行数净增 0，不新增 / 不删除测试用例。
- ac-packaging-assertions-hold: `src/main/release-packaging.test.ts` 既有断言在 v0.2.18 下真过且未被改写：release body 脚本从 `package.json` 派生两版 notes 路径并各读一次、四个 guard（英文缺失 / 英文空白 / 中文缺失 / 中文空白）在 `gh release create` 之前 fail-closed、中文 `<details><summary>简体中文</summary>` 与 `</details>` 各出现 1 次。
- ac-no-version-literal-in-code: 在当前 `package.json#version` 下 `test-debt-gate` 的版本字面量扫描在 `src/`、`scripts/`、`docs/` 的 `.ts` / `.tsx` 命中 0 处（即测试代码里不出现 `0.2.18` 或 `v0.2.18`）。
- ac-evidence-prerelease: `docs/release-evidence/v0.2.18.md` 存在，全文恰好一处 `status: blocked` 行，首行含 `v0.2.18` 与中文标题；不出现 `verified`、任一通过标记（`valid on disk` / `satisfies its Designated Requirement` / `The validate action worked!` / `source=Notarized Developer ID` / `accepted`）、任何 64 位十六进制 digest、`资产数` 行或 `（N 个资产）` 写法；正文明确「未打 tag、未 push、未创建 Release、无资产」，并列出可直接打开的存在路径（至少 `.munk/code-gates.json`、`src/diff-normalize-real-gate.test.tsx`、`docs/release-notes/v0.2.18.md`）。
- ac-evidence-ledger-row: `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 末尾新增 `{ id: "evidence-v0.2.18", version: "v0.2.18", status: "blocked" }`（无 `assets` 字段）；既有 16 行与 `evidence.currentVersion`（v0.2.17 的 12 件资产）逐字不变；`release-packaging` 的台账遍历测试真过（证据目录文件集合与台账版本集合一一对应）。
- ac-published-anchor: `README.md` 与 `README.zh-CN.md` 第 5 行仍只指向 `v0.2.17` 的公开 Release，`judgePublishedAnchor` 返回 ok（最新 verified tag 仍为 v0.2.17）。
- ac-code-gates-all: `.munk/code-gates.json` 的 24 门全部通过，含 `test`、`diff-normalize`、`diff-normalize-real`、`verify-release-gate`、`test-debt-gate`；`repoTestLines` ≤ `44398`、`repoTestCases` ≥ `1419`，不得修改 `.munk/baseline/test-debt.json` 的 ceiling / floor，不得删除或跳过任何用例。
- ac-no-runtime-change: `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared` 的产品源码零改动（仅允许 `src/main/release-version-gate.test.ts` 与 `src/main/__fixtures__/release-packaging.json` 两个发布测试面文件）。
- ac-delivery-local-merge-only: 交付只做 `local_merge`；不创建 / 移动 / 推送 tag、不 `workflow_dispatch`、不改已公开 Release / 资产 / tag、不改 `README` 第 5 行、不改 `docs/release-signing.md`。

## Non-Goals

- 不改 I#9 功能代码：归一化、探测、开关、状态栏、差异计数一行都不动。
- 不动已公开的 tag / Release / 资产，不改 `docs/release-evidence/` 下既有历史文件与 `docs/release-evidence-ledger.json`。
- 不改 `docs/release-signing.md`（其中 v0.2.17 姿态表述不在本项收口范围），不改 `README.md` / `README.zh-CN.md` 第 5 行。
- 不重写测试：只允许替换 `release-version-gate.test.ts` 中指向当前版本的内容 token；不新增门、不改门禁矩阵、不删用例、不抬 ceiling、不降 floor。
- 不把门禁、夹具、基线文档、真实盘证据写成用户功能；未交付能力一律不写进 notes。
- 不做 cherry-pick、不 rebase 历史、不改目录 / 快照 / 发布通道行为。

## Implementation Constraints

- **范围优先级**：本项以「版本收敛 + 双语 notes + 发布元数据同步」为最小闭环。`docs/release-evidence/v0.2.18.md` 只作为**预发布 blocked 事实记录**，绝不宣称已发布 / 已验证，也不写任何资产字节或 sha256；发版后的正式证据由后续发布收尾项回填。
- 证据文案与 notes 只写 `.md`；版本字面量只允许出现在 `.md` / `.json` / `.yml`，不得出现在任何 `.ts` / `.tsx`（`test-debt-gate` 会红）。
- `release-version-gate.test.ts` 的改动必须逐行等价替换（替换字符串 token），保持文件行数与用例数不变，避免触碰 `repoTestLines` / `repoTestCases`。
- `src/main/__fixtures__/release-packaging.json` 只能追加 `evidence.ledger` 一行；`evidence.currentVersion` 与历史资产表是已公开事实，不得改动。
- notes 正文不得出现除第 3 行语言切换之外的 Markdown 链接（`release-packaging` 的 `notes-en-switch` / `notes-zh-switch` 断言每个文件恰好 1 个链接）。
- notes 的 H2 / H3 与 v0.2.17 结构逐项对齐；`Windows portable download` / `Windows 免安装包` 两节正文必须保持 2 句。
- 升级段只改版本号与资产名（`OpenCompare-0.2.18-win-x64.zip`），签名 / 公证口径与「无需迁移数据」表述保持 v0.2.17 原样。

## Delivery Summary Requirements

交付摘要逐条写出，每条给可直接执行的证据：

1. `package.json#version` 变更：`0.2.17 → 0.2.18`。
2. 两个 notes 文件路径与字数：`docs/release-notes/v0.2.18.md`、`docs/release-notes/v0.2.18.zh-CN.md`，各自的中英文字数与行数。
3. `CHANGELOG.md` 新增段落：`## v0.2.18` 的小节标题与本版条目。
4. 测试锚点改了哪些文件：逐一列出（预期只有 `src/main/release-version-gate.test.ts` 与 `src/main/__fixtures__/release-packaging.json`；若另有，说明理由）。
5. 确认未动历史台账与发布通道：`docs/release-evidence-ledger.json`、既有 `docs/release-evidence/*.md`、`evidence.currentVersion` 的 v0.2.17 资产表未变；未推 tag、未 push、未 dispatch、未改已公开 Release / 资产。
6. 24 门 code_gates 的逐门结论与 `test-debt-gate` 的 ceiling / floor 实测数值；所有引用到的证据路径必须真实存在、可直接打开。
