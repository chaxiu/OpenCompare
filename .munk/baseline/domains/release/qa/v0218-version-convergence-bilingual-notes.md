# v0.2.18 版本收敛与双语发布说明（版本单点 / 双语 notes / CHANGELOG / 预发布 blocked 证据 / 测试内容锚点前移）

- WI：`wi_intake_691240b866518ff6`
- 域：`release`（发布元数据、双语发布说明、发布文档默认 tag、预发布证据记录与发布测试内容锚点；产品运行时行为零改动）
- 来源：`.munk/changes/wi_intake_691240b866518ff6/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 20 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main @2d19be6`（I#9 五子项已全部合入；门禁矩阵 **24 门**）
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`package.json` 1/1、`.github/workflows/release.yml` 1/1、`docs/release-process.md` 1/1、`CHANGELOG.md` +18/−0、`src/main/__fixtures__/release-packaging.json` +5/−0、`src/main/release-version-gate.test.ts` 4/4、`src/main/release-packaging.test.ts` 1/1；新增 `docs/release-notes/v0.2.18.md`（41 行）、`docs/release-notes/v0.2.18.zh-CN.md`（41 行）、`docs/release-evidence/v0.2.18.md`（40 行）
- 零 diff：两版 `README.md` 第 5 行（仍指 `v0.2.17`）、`docs/release-signing.md`、`electron-builder.yml`、`pnpm-lock.yaml`、`docs/release-evidence-ledger.json`、既有各版 `docs/release-evidence/**`、`.munk/code-gates.json`、`.munk/baseline/test-debt.json`、`src/core` / `src/renderer` / `src/preload` / `src/shared` 全部与 `src/main` 除两个发布测试面文件外全部

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-package | `package.json` 的 `"version": "0.2.18"`（numstat 1/1，只改 version 一行），合法 semver；`electron-builder.yml` / `release.yml` 不从字面量取版本 | 满足 |
| ac-version-single-source | `judgeVersionSources(releaseFacts.versionSources)` 返回 `{ ok: true, issues: [] }`：派生 tag `v0.2.18`、CHANGELOG 顶部 `## v0.2.18`、notes 首行 `# OpenCompare v0.2.18 release notes` / 中文镜像、`release.yml` 第 17 行 `default: 'v0.2.18'`、`docs/release-process.md` 第 8 行 `default: 'v0.2.18'` 五源同指 | 满足 |
| ac-workflow-default | `.github/workflows/release.yml` 单 hunk 1/1，仅 `workflow_dispatch.inputs.tag.default` → `v0.2.18`；`on.push.tags`、checkout `refs/tags/<tag>`、gates 五步（`pnpm install --frozen-lockfile` / `lint` / `typecheck` / `test` / `build`）顺序、三平台矩阵与 finalize 步骤零 diff | 满足 |
| ac-process-doc-default | `docs/release-process.md` 单 hunk 1/1，恰一个 codeSpan `` default: 'v0.2.18' ``；README 状态行口径段落未动 | 满足 |
| ac-notes-exist | `docs/release-notes/v0.2.18.md`（41 行）与 `v0.2.18.zh-CN.md`（41 行）存在且非空；`judgeNotesPresence` 与两语言 `judgeNotesOrder` 均 `{ ok: true, issues: [] }`（首行含 `v0.2.18` 的 H1、第 3 行语言切换行、其后有正文） | 满足 |
| ac-notes-switch-line | 英文第 3 行逐字等于 `English \| [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.18/docs/release-notes/v0.2.18.zh-CN.md)`；中文第 3 行逐字等于 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.18/docs/release-notes/v0.2.18.md) \| 简体中文`；两份全文 markdown 链接各 **1** 条、无 `./` 相对链接 | 满足 |
| ac-notes-h2-parity | 两版各恰 6 个 `## ` 且顺序逐对对应：`What changed`/`本次变化`、`Windows installer and portable zip`/`Windows 安装包与免安装 zip`、`macOS signing and notarization`/`macOS 签名与公证`、`Not in this release`/`不做的事`、`Risk and verification scope`/`风险与验证规模`、`Upgrade`/`升级方式`；`judgeNotesHeadings` 返回 ok | 满足 |
| ac-notes-portable-sections | 两版保留 H3 `Windows portable download` / `Windows 免安装包`，该节正文 2 句，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`；`release-artifacts-and-brand` 的 `notes-en-portable` / `notes-zh-portable` 两行真过 | 满足 |
| ac-notes-two-switches | 英文命中 `Ignore newline differences`(1) / `Ignore encoding differences`(1) / `on by default`(2)；中文命中 `忽略换行符差异`(2) / `忽略编码差异`(2) / `默认开启`(2) | 满足 |
| ac-notes-switch-effect | 写明开启时仅换行 / 仅编码差异不计入行级与行内高亮及差异计数、关闭后恢复严格逐字节比较（英文 `byte-for-byte` 2 次、中文 `逐字节` 2 次）；差异计数同源单一值（英文 `one comparison result` 1 次、中文 `同一份比较结果` 1 次） | 满足 |
| ac-notes-status-raw | 写明状态栏始终分别显示左右两侧探测到的原始换行符与编码（英文 `status bar` / `Left newline` / `Left encoding` / `Right newline` / `Right encoding`，中文 `状态栏` / `左侧换行符` / `左侧编码` / `右侧换行符` / `右侧编码`），且切换开关不改写这些显示值 | 满足 |
| ac-notes-no-writeback | 写明归一化不写回原文（英文 `not written back` 1 次、中文 `不写回` 1 次），不改导出内容、不改目录四态与快照格式、不改三向合并（英文 `three-way merge` 2 次、中文 `三向合并` 2 次） | 满足 |
| ac-notes-open-probe | 写明打开文件对时把两侧探测事实带进会话（状态栏因此有值），未写成新的用户功能或额外验证面 | 满足 |
| ac-notes-not-in-release | 两版 `Not in this release` / `不做的事` 覆盖：除两个开关外不改对比与合并算法、不改目录扫描口径与快照格式、不改导出内容、不改发布通道；段内无门禁 / 夹具 / 基线文档被当用户功能的表述 | 满足 |
| ac-notes-risk-scope | 两版 `Risk and verification scope` / `风险与验证规模` 写明真实文件证据覆盖 UTF-8 / UTF-8 BOM / UTF-16LE / GBK × LF / CRLF 六个落盘变体、千行组与 5 MiB 组，且无新增性能 / 内存承诺数字 | 满足 |
| ac-changelog-top | `CHANGELOG.md` 首个二级标题为 `## v0.2.18`、无重复版本标题、历史条目零删除行（numstat +18/−0 全落在新段）；段内含 `### 改进` / `### 不做的事` / `### 升级方式`，覆盖 `忽略换行符差异` / `忽略编码差异` / `默认开启` / `状态栏` / `不写回` | 满足 |
| ac-version-gate-anchors | `src/main/release-version-gate.test.ts` 的 `noteFacts` 三行 token 清单换为 v0.2.18 事实（英文 12 项、中文 12 项、CHANGELOG 4 项，逐项与 prd 清单一致）；`it` 用例数不变、`expect(` 数不降，纯字符串替换 4/4、**净增行 0**；用例名由 `states the template move and safety facts` 改为 `states the current release facts`（同一用例内改名，未增删用例）；`releaseFacts` 端到端断言真过 | 满足 |
| ac-packaging-assertions-hold | `src/main/release-packaging.test.ts` 单 hunk 1/1：台账遍历的当前 tag 比对增加存在性守卫 `ledgerRow(currentTag)?.assets !== undefined`（v0.2.18 台账行为 `blocked`、无 `assets`），既断言语义（证据资产数 == 台账 `assets`）未变；release body 脚本派生双语 notes 路径、四个 guard 在 `gh release create` 前 fail-closed、中文 `<details><summary>简体中文</summary>` 与 `</details>` 各 1 次等既有断言全绿 | 满足（含 1 行守卫，见备注 ②） |
| ac-no-version-literal-in-code | `test-debt-gate` 的版本字面量扫描在 `src/` / `scripts/` / `docs/` 的 `.ts` / `.tsx` 命中 **0**（notes 事实 token 全在 `.md` / `.json`） | 满足 |
| ac-evidence-prerelease | `docs/release-evidence/v0.2.18.md`（40 行）首行含 `v0.2.18` 与中文标题，全文 `^status:` 恰 1 行 = `blocked`；无 `verified`、无 `valid on disk` / `satisfies its Designated Requirement` / `The validate action worked!` / `source=Notarized Developer ID` / `accepted`、无 64 位 hex digest、无 `资产数` / `（N 个资产）` 写法；正文明确未打 tag / 未 push / 未创建 Release / 无资产，并列出 `.munk/code-gates.json`、`src/diff-normalize-real-gate.test.tsx`、`docs/release-notes/v0.2.18.md` 等可直接打开的存在路径 | 满足 |
| ac-evidence-ledger-row | `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 末尾新增 `{ id: "evidence-v0.2.18", version: "v0.2.18", status: "blocked" }`（无 `assets` 字段，+5/−0）；既有 16 行与 `evidence.currentVersion`（v0.2.17 的 12 件资产）逐字不变；台账遍历测试真过（证据目录文件集合与台账版本集合一一对应） | 满足 |
| ac-published-anchor | 两版 `README.md` 零 diff，第 5 行仍只指向 `v0.2.17` 的公开 Release；`judgePublishedAnchor` 由 verified 证据派生最新已发布 tag = `v0.2.17`，返回 ok | 满足 |
| ac-code-gates-all | `.munk/code-gates.json` **24 门**全绿（attempt 001 全 exit 0，`.munk/runs/run_intake_691240b866518ff6/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (24 gates, attempt 001)"`、`failedGateIds: []`），含 `test` / `diff-normalize` / `diff-normalize-real` / `verify-release-gate` / `test-debt-gate`；`repoTestLines` **44398 ≤ 44398**、`repoTestCases` **1441 ≥ 1419**，未改 `.munk/baseline/test-debt.json` 的 ceiling / floor，未删除或跳过用例 | 满足 |
| ac-no-runtime-change | `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared` 产品源码零 diff；`src/main` 内仅 `release-version-gate.test.ts` 与 `__fixtures__/release-packaging.json` 两个发布测试面文件（外加 `release-packaging.test.ts` 的一行存在性守卫，见备注 ②） | 满足（守卫见备注 ②） |
| ac-delivery-local-merge-only | 交付只做 `local_merge`；未创建 / 移动 / 推送 tag、未 `workflow_dispatch`、未改已公开 Release / 资产 / tag、未改 `README` 第 5 行、未改 `docs/release-signing.md` | 满足 |

## 与 prd 文字的偏差（如实记录）

| prd 表述 | 实际 | 理由 |
| --- | --- | --- |
| ac-packaging-assertions-hold：「既有断言在 v0.2.18 下真过且未被改写」 | `release-packaging.test.ts` 改 1 行：`if (current !== undefined)` → `if (current !== undefined && ledgerRow(currentTag)?.assets !== undefined)` | 本版**同时**新增 `docs/release-evidence/v0.2.18.md`（`status: blocked`）与 `evidence.ledger` 的 `blocked` 行（无 `assets`）。证据目录被台账遍历覆盖后 `currentTag` 有记录、台账行却无 `assets`，原断言会把 `undefined` 与 `0` 比对而硬红。守卫只跳过「台账行没有 `assets`」的预发布行，`verified` 行的资产数比对强度不变；若不接受，就只能在「写 blocked 证据文件」与「记 blocked 台账行」之间二选一，而 prd 的 ac-evidence-prerelease / ac-evidence-ledger-row 两条都要求。 |
| ac-no-runtime-change：仅允许 `release-version-gate.test.ts` 与 `__fixtures__/release-packaging.json` 两个发布测试面文件 | 另含 `release-packaging.test.ts` 1 行守卫 | 同上，属测试面而非产品源码；`src/core` / `src/renderer` / `src/preload` / `src/shared` 与 `src/main` 其余文件全零 diff。 |

## 备注

- **`repoTestLines` 已无余量**：44398 既是实测也是 ceiling。notes 事实 token 只能在既有行内逐字替换，不能换行、不能新增用例；后续发布面若需新断言，必须先删等量行。
- **blocked 台账行是长期形态**：`evidence.ledger` 现同时存在 `verified`（带 `assets`）与 `blocked`（不带 `assets`）两类行；v0.2.18 发布收尾时必须同批把该行翻 `verified` 并补 `assets`，同时新建 verified 版证据文件，否则台账遍历与 `judgePublishedAnchor` 会互相打架。
- **README 锚仍停在 v0.2.17**：`judgePublishedAnchor` 从 verified 证据派生，收敛轮新增 blocked 证据**不会**前移该锚；两版第 5 行留给发布收尾项。
- **发布通道全程只读**：未打 tag、未 push、未 dispatch、未对已公开 Release 与 12 件资产做任何写操作。

## 最近执行

- workItemId: wi_intake_691240b866518ff6
- at: 2026-11-03T08:47:37+08:00
- status: pass
- note: 24 gates exit 0 (attempt 001); test 1927 passed + 1 skipped; 20 prd AC folded
