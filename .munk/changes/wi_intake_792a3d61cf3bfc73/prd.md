# v0.2.17 发布说明去重（同步失败本地化不重复宣称）

## Scope

v0.2.17 尚未打 tag，两版 notes 与 CHANGELOG 顶部把「同步失败提示随界面语言本地化」列为本版新变化，但该修复已随 v0.2.16 公开发布（v0.2.16 两版 notes 的 `### Failure messages follow the interface language` / `### 失败提示随界面语言本地化`、v0.2.16 CHANGELOG 同条，提交 `ed5bdd3` 在 `v0.2.16` tag 内，tag 时间 2026-11-02 09:57 CST）。tag 发布后正文不可改写，必须在打 tag 前把 v0.2.17 的「新变化」收敛为相对 v0.2.16 真正新增的两项，并把「发布说明只写相对上一已发布版本新增的用户可见变化」写成长期约定。

范围（只改文案、文档与一处测试 token 数组，不改任何功能）：

1. `docs/release-notes/v0.2.17.md` 与 `docs/release-notes/v0.2.17.zh-CN.md`：整节删除 `### Localized sync failures` / `### 同步失败提示本地化`；开头段与 `Risk and verification scope` / `风险与验证规模` 删去 sync 失败本地化表述；本版变化只保留「模板归位逐条动作列 + 显式勾选移动（sha256 + 整秒 mtimeSec 校验通过才删源，失败保留源与目标不回滚）」与「大小写不敏感碰撞折叠 + 路径越界拒绝」两部分。
2. `CHANGELOG.md` 顶部 v0.2.17 条：「三项」改「两项」，删「同步失败提示随界面语言本地化」短语与对应 bullet，保留另两条改进、`不做的事` 与 `升级方式`。
3. `src/main/release-version-gate.test.ts` 的 `noteFacts` 三个 token 数组删去 `EACCES`；其余模板事实 token 全保留，不删用例、不放宽其他断言。
4. `.munk/baseline/domains/release/product.md` 的 `ac-notes-safety-and-i18n` 与 `.munk/baseline/domains/release/qa/v0217-version-convergence-bilingual-notes.md` 对应行去掉 i18n 断言；并在 `product.md` 的长期约定段落写入「发布说明只写相对上一个已发布版本新增的用户可见变化、已随上一版发布的条目不重复宣称、发布前逐条对照上一 tag 的 notes 去重（含已完成项的核对方法）」。
5. `docs/release-signing.md` 中 `本版发布说明见 docs/release-notes/v0.2.17.md。` 的路径补反引号，与全文格式一致。
6. 交付说明给出 H3 对照结果：列出 v0.2.17 两版 notes 全部 H3 标题，逐条与 v0.2.16 的 H3 对照，确认删掉 i18n 后不再有重复的「本版变化」条目。

## Acceptance Criteria

- ac-notes-en-no-i18n-section: `docs/release-notes/v0.2.17.md` 不含 `### Localized sync failures` 标题，全文不含 `EACCES`、`EPERM`、`sync failures follow the interface language` / `Localized sync failures` 任一字符串（`grep -F` 零命中）。
- ac-notes-zh-no-i18n-section: `docs/release-notes/v0.2.17.zh-CN.md` 不含 `### 同步失败提示本地化` 标题，全文不含 `EACCES`、`EPERM`、`同步失败提示本地化`、`同步失败提示跟随界面语言` 任一字符串（`grep -F` 零命中）。
- ac-notes-intro-two-items: 两版开头段只声明两项用户可见变化——英文含 `two` 且不含 `three`；中文含 `两项` 且不含 `三项`；两句都仍只描述「动作列 / 显式移动」与「大小写折叠 / 路径越界」两组事实。
- ac-notes-h3-only-two-changes: 英文 H3 恰为 `Template placement rows show and choose their action`、`Case-insensitive collisions and path containment`、`Windows portable download`；中文 H3 恰为 `模板归位逐条动作列与显式移动`、`大小写不敏感碰撞与路径越界防护`、`Windows 免安装包`（顺序一致、无第四个变化小节）。
- ac-notes-h3-dedup-vs-v0216: 两版 v0.2.17 的 H3 集合与同语言 v0.2.16 的 H3 集合交集只允许保留平台段 `Windows portable download` / `Windows 免安装包`；`Failure messages follow the interface language` / `失败提示随界面语言本地化` 及其他任一变化类 H3 不得同时出现在两版。
- ac-notes-risk-scope-two-items: 两版 `Risk and verification scope` / `风险与验证规模` 段只列动作列与显式移动、大小写折叠与路径包含防护两组改动，不再出现「sync failure messages / 同步失败提示本地化」；`This release states no performance or memory numbers` / 「不写任何性能或内存数字」逐字保留。
- ac-notes-h2-parity-kept: 两版各恰 6 个 `## ` 标题，英文依次为 `## What changed`、`## Windows installer and portable zip`、`## macOS signing and notarization`、`## Not in this release`、`## Risk and verification scope`、`## Upgrade`，中文依次为 `## 本次变化`、`## Windows 安装包与免安装 zip`、`## macOS 签名与公证`、`## 不做的事`、`## 风险与验证规模`、`## 升级方式`；`judgeNotesHeadings` 仍 exit 0。
- ac-notes-switch-and-links-kept: 两版第 3 行语言切换行与 tag 固定链接逐字不变（英文 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.zh-CN.md)`，中文 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.17/docs/release-notes/v0.2.17.md) | 简体中文`），各仍恰 1 条 markdown 链接。
- ac-notes-retained-facts: 两版仍覆盖模板事实 token——英文 `Actions column`、`copies by default`、`explicitly checked`、`sha256`、`mtimeSec`、`source and the target`、`no rollback`、`Case-fold collisions`、`Path escape refused`；中文 `动作列`、`默认复制`、`显式勾选`、`sha256`、`mtimeSec`、`源与目标`、`不执行回滚`、`碰撞折叠`、`路径越界拒绝`；并保留 NSIS 安装包 + 免安装 zip、macOS 签名 + 公证、`Not in this release`、`Upgrade` 各节。
- ac-changelog-two-items: `CHANGELOG.md` 的 `## v0.2.17` 段开头含 `两项` 且不含 `三项`，不出现 `同步失败提示随界面语言本地化`、`EACCES`、`EPERM`；`### 改进` 下恰 2 条 bullet（逐条动作列与显式移动、大小写不敏感碰撞折叠与路径越界防护），`### 不做的事` 三条与 `### 升级方式` 保留；`## v0.2.16` 及更早条目零删除行。
- ac-test-note-tokens: `src/main/release-version-gate.test.ts` 的 `noteFacts` 三个 token 数组均不含 `EACCES`，其余 token 逐项保留；`it(` 用例数与改动前一致（不删用例、不新增 `skip` / `only`），`expect(` 数不减少，无放宽匹配。
- ac-baseline-release-ac-no-i18n: `.munk/baseline/domains/release/product.md` 的 `ac-notes-safety-and-i18n` 行与 `.munk/baseline/domains/release/qa/v0217-version-convergence-bilingual-notes.md` 对应验收行都不再出现 `EACCES` / `EPERM` / i18n 本地化断言，仍保留碰撞折叠与路径越界事实。
- ac-baseline-dedup-convention: `.munk/baseline/domains/release/product.md` 记录长期约定，明确「发布说明只写相对上一个已发布版本新增的用户可见变化」「已随上一版发布的条目不重复宣称」「发布前逐条对照上一 tag 的 notes 去重，附已完成项的核对方法（对照 `docs/release-notes/<上一 tag>.md` 的 H2/H3 与 bullet 主题，并与上一 tag 的 CHANGELOG 段交叉核对）」。
- ac-signing-path-backticked: `docs/release-signing.md` 中该句为 ``本版发布说明见 `docs/release-notes/v0.2.17.md`。``，路径带反引号，句末标点不变。
- ac-diff-scope-only: `git diff --name-only` 仅含本项 7 个文件（两版 notes、`CHANGELOG.md`、`src/main/release-version-gate.test.ts`、`.munk/baseline/domains/release/product.md`、`.munk/baseline/domains/release/qa/v0217-version-convergence-bilingual-notes.md`、`docs/release-signing.md`）及 `.munk/changes/wi_intake_792a3d61cf3bfc73/**`；`README.md` / `README.zh-CN.md` 第 5 行、`package.json#version`（仍 `0.2.17`）、`.github/workflows/release.yml` 默认 tag、产品运行时代码与其他测试零 diff。
- ac-gates-22-green: `.munk/code-gates.json` 22 门全部 exit 0；`test-debt-gate` 实测 `repoTestLines` ≤ 42724（ceiling）、`repoTestCases` ≥ 1373（floor），不放宽 baseline。
- ac-delivery-local-merge-only: 交付只走 `local_merge`；不创建 / 推送 tag、不 dispatch、不修改已公开 tag / Release / 资产、不新建 `docs/release-evidence/v0.2.17.md`。
- ac-h3-comparison-reported: 交付说明逐条列出 v0.2.17 两版全部 H3 标题与 v0.2.16 对应 H3 的对照结果，明确删掉 i18n 后残留交集只有平台段 `Windows portable download` / `Windows 免安装包`，且该段不是「本版新增变化」的宣称。

## Non-Goals

- 不改 `README.md` / `README.zh-CN.md` 第 5 行，不改已发布锚。
- 不改 `package.json#version`（保持 `0.2.17`）、不改 `.github/workflows/release.yml` 的默认 tag。
- 不改产品运行时代码、i18n 词典与实现、其他测试文件与既有断言。
- 不动任何已公开 tag / Release / 资产；不创建 tag、不推 tag、不 dispatch、不补发、不写发布证据。
- 不为凑绿放宽门禁、不改 `.munk/code-gates.json`、不改 `.munk/baseline/test-debt.json`。
- 不做顺手文案润色、不重写 notes 其他段落、不新增第三个「本版变化」条目。

## Implementation Constraints

- 六个 H2 必须仍成对且顺序不变（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 与中文镜像）。
- Windows 段与 macOS 段按原样保留（属平台事实，不是本版新增变化宣称）；语言切换行与 tag 固定链接不改。
- 去重口径以「相对上一个已发布版本（v0.2.16）新增的用户可见变化」为准；v0.2.16 已发布的条目一律不再写入 v0.2.17 的「本次变化」。
- 测试只允许删 `EACCES` 这一 token，不得删除用例或降低其他断言强度。
- 交付只做 local_merge，完成后不 tag。
