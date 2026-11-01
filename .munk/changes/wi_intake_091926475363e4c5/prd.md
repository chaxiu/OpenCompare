# v0.2.15 发布收尾：已发布事实回写 + 发布门锚点翻面

## Scope

`v0.2.15` 已发布（tag `v0.2.15` → 发布点 commit `d560563`，12 件资产，公开件 sha256 与 L1 均已核过）。本项只做**发版收尾**：把「已发布的事实」写回文档与版本锚点，并把 `release-packaging` 的版本断言跟着翻面。

基线 = `origin/main` `d560563`（隔离 worktree 已提供；主检出是脏树，历史一律用 `git show` 读，不把主检出当内容源）。

允许的改动面（仅以下文件 + 本 work item 的 `.munk` 记录）：

1. `README.md` 与 `README.zh-CN.md`：只把第 5 行状态句的版本从 v0.2.14 前移到 v0.2.15；第 3 行互链、9 节 H2 镜像及其他行不动。
2. `src/main/release-packaging.test.ts`：`latestPublishedTag` 由 `'v0.2.14'` 翻到 `'v0.2.15'`，并同批改掉所有「发布锚点严格早于当前版本」的前置假设；只改版本锚点相关处，不放宽、不删除任何其他门禁、不加 skip。
3. `CHANGELOG.md`：`## v0.2.15` 段补「Windows 免安装 zip」条目，风格与既有条目一致；不重排其他版本段。
4. `docs/release-notes/v0.2.15.md` 与 `docs/release-notes/v0.2.15.zh-CN.md`：只在 `Upgrade` / `升级方式` 段补免安装 zip 说明；除该段外不改已发布正文对应文案结构。
5. 新建 `docs/release-evidence/v0.2.15.md`：结构对照 `docs/release-evidence/v0.2.14.md`，记录 tag / 发布点 / 12 件资产 / 公开件 sha256 / latest*.yml / 双语正文核验 / L1 结论。
6. `docs/release-signing.md`：仅 2 处锚点——顶部「当前状态」翻到 v0.2.15（现有 `signingDoc` 断言强制），以及 v0.1.2 段的「tag 之后的修复由 … 承接」钉回 v0.2.12 历史字面量。其余不改。

不改：产品源码（除上述测试文件）、`package.json#version`（保持 `0.2.15`）、`.github/workflows/release.yml`（dispatch 默认保持 `'v0.2.15'`）、tag / 已公开 Release 与其资产、旧版 notes 与 evidence、依赖、`code-gates.json`。

## Acceptance Criteria

- ac-readme-en-line5: `README.md` 第 5 行含 `[v0.2.15](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.15)`，且仍含 `Developer ID` 与 `notariz` 语义；该文件除第 5 行外零改动。
- ac-readme-zh-line5: `README.zh-CN.md` 第 5 行含 `最新公开版本：[v0.2.15]` 与 `releases/tag/v0.2.15`，且仍含 `Developer ID` 与 `公证`；该文件除第 5 行外零改动。
- ac-readme-shared-lines: 两版 README 第 3 行互链（`English | [简体中文]` / `[English] | 简体中文`）与 9 节 H2 结构逐字不变；`git diff --numstat` 对两文件均只有 1 行新增/删除。
- ac-anchor-equal: `release-packaging.test.ts` 中 `latestPublishedTag === currentTag === 'v0.2.15'`；原「严格早于」写法（`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`、`expect(latestPublishedTag).not.toBe(currentTag)`、`expect(latestPublished).toBeGreaterThan(current)`、`expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)`、`expect(signingDoc).toContain('当前状态：…')` 依赖的锚点）改写为相等/同指语义且非恒真。
- ac-last-released-notes: `lastReleasedNotesPath` 与 `releaseNotesPath` 相等，二者均指 `docs/release-notes/v0.2.15.md` 且文件存在、首行含 `v0.2.15`。
- ac-changelog-order: `CHANGELOG.md` 中 `## v0.2.15`（current）与 `## v0.2.14`（newest published）的位置关系为「current 即 newest published，`## v0.2.14` 紧随其下」；`## v0.2.12` 仍在 `## v0.2.14` 之下。
- ac-published-tags-history: `publishedTags` 含 `'v0.2.12'` 作为历史字面量、以 `latestPublishedTag`（`'v0.2.15'`）收尾；`previousPublishedTag` 仍为 `'v0.2.8'`；`isTagBefore('v0.2.12', latestPublishedTag)` 仍为 true。
- ac-v0214-history-pinned: 断言中凡承载 v0.2.14 专属事实（`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `共同祖先` / `ancestor` / `Upgrade`）的切片改为锚在 `## v0.2.14` 段与 `docs/release-notes/v0.2.14.md` 历史字面量上，不得因 `lastReleasedNotes` 前移而失效或删除。
- ac-no-gate-relax: 未删除、未放宽、未 skip 任何既有断言；无 `.skip` / `.todo` / `.only`；其余历史锚点（v0.2.12 / v0.2.11 / v0.2.9 / v0.2.8 …）逐条保留。
- ac-signing-status: `docs/release-signing.md` 顶部含 `当前状态：v0.2.15 已发布`、`releases/tag/v0.2.15`、`docs/release-notes/v0.2.15.md`、`docs/release-evidence/v0.2.15.md`；第三节标题为 `## 三、正式版发布姿态（v0.2.15）`；dispatch 默认仍含 `默认 \`v0.2.15\``。
- ac-signing-successor-pinned: `docs/release-signing.md` 中 v0.1.2 漂移段的承接句为「tag 之后的修复由 v0.2.12 承接」，断言同钉 `v0.2.12`；该句不随 `latestPublishedTag` 移动。
- ac-changelog-zip: `CHANGELOG.md` 的 `## v0.2.15` 段在既有 `### 改进` 下新增一条 Windows 免安装 zip 条目，点名 `OpenCompare-0.2.15-win-x64.zip` 且含「解压即用」；不含 `已发布` / `200,000` / `10 MB` / 40–64 位十六进制串等被禁字样。
- ac-notes-upgrade-zip: `docs/release-notes/v0.2.15.md` 的 `## Upgrade` 与 `.zh-CN.md` 的 `## 升级方式` 均写明：Windows 用户可选 NSIS 安装包或解压即用 zip；自动更新仍只走 NSIS exe。
- ac-notes-structure-intact: 两份 v0.2.15 notes 的 `### Windows portable download` / `### Windows 免安装包` 段、互链与既有小节顺序不变；除 Upgrade / 升级方式外正文无结构性漂移；仍不含 `**Full Changelog**` 与 `releases/tag/`。
- ac-evidence-identity: `docs/release-evidence/v0.2.15.md` 存在且非空，`status: verified` 恰好一次；记录 tag `v0.2.15`、发布点 commit `d560563`、发布时间 `2026-11-01T04:10:46Z`、`draft=false`、`prerelease=false`、公开 URL 与非重指/不重打口径。
- ac-evidence-assets: 证据文件按名称 + 字节列全 12 件资产：`latest-linux.yml 535`、`latest-mac.yml 521`、`latest.yml 354`、`OpenCompare-0.2.15-arm64-mac.zip 107344513`、`…arm64-mac.zip.blockmap 114006`、`…arm64.dmg 111467590`、`…arm64.dmg.blockmap 118407`、`OpenCompare-0.2.15-win-x64.zip 131639034`、`…0.2.15.AppImage 118146518`、`OpenCompare-Setup-0.2.15.exe 101425160`、`…exe.blockmap 106609`、`opencompare_0.2.15_amd64.deb 92224572`。
- ac-evidence-public-sha: 证据文件记录三份公开件下载实测 sha256 与字节：dmg `2b4b384ca40e5b026341bf5f7dbc74d48f6ab513998ce1e1176554c3970ebbe7` / `111,467,590 B`；exe `25d2e8e5b2da23619908a2119d8da34eb440010ec2c0d6295c05ac69b4e8efc9` / `101,425,160 B`；win zip `92707126c38c2d87fae32c11ad3b2a0eb0a503cddaf001c6999340e5eb9f11a4` / `131,639,034 B`。
- ac-evidence-latest-yml: 证据文件确认三份 `latest*.yml` 均为 `0.2.15`，且 `latest.yml` 的 `files[]` 只含 NSIS exe、不含任何 `.zip`。
- ac-evidence-body: 证据文件记录 `gh release view v0.2.15 --json body` 实测 4,937 字符（含尾部换行；测量口径写明），结构为英文全文 + 一行 `---` + `<details><summary>简体中文</summary>` + 中文全文 + `</details>` + `**Full Changelog**: …/compare/v0.2.14...v0.2.15`，两版版本号一致；并明确标注这是「双语正文 + 发布后 body 断言」首次在真实发布上生效的版本。
- ac-evidence-l1: 证据文件引用 L1 结论——公开件三资产 sha256/字节相符、干净副本认 `0.2.15`、三轮四态逐位 `35 / 80 / 41 / 326,099`、取消 `119 ms` 回日志零噪声——并指向 `projects/ops_df43e423451170fd/.munk/runs/trun_2223a6c320ba2987/` 与 `trun_0940457cc8587109/evidence/`。
- ac-gates-green: 在隔离 worktree 对基线 `d560563` 跑 `.munk/code-gates.json` 全量门（install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics / sync-real-gate）全部 exit=0；`release-packaging.test.ts` 相关断言随锚点翻面后仍全过。
- ac-anchors-unchanged: `grep '"version"' package.json` 仍为 `0.2.15`；`.github/workflows/release.yml` 的 `default: 'v0.2.15'` 未改；两文件相对 `d560563` 零 diff。
- ac-diff-scope: `git diff --name-only d560563` 只含 `README.md`、`README.zh-CN.md`、`CHANGELOG.md`、`docs/release-notes/v0.2.15.md`、`docs/release-notes/v0.2.15.zh-CN.md`、`docs/release-evidence/v0.2.15.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`（外加本 work item 的 `.munk/changes/**`）。
- ac-history-intact: `CHANGELOG.md` 的 v0.2.0–v0.2.14 段逐字不变；`docs/release-notes/` 下除 v0.2.15 两份外零 diff；`docs/release-evidence/v0.2.14.md` 及更早 evidence 零 diff；不归档、不删除任何 evidence。
- ac-no-publish-side-effects: 不创建/移动/推送 tag、不 dispatch 发布、不对已公开 Release 或其资产做任何写操作（不 `gh release edit/upload/delete`）；交付只经 Host 合入 main 并推进 `origin/main`。

## Non-Goals

- 不做下一次版本收敛，不 bump `package.json#version`。
- 不改 UI / 功能代码、对比合并算法、目录扫描、快照格式。
- 不改发布流水线结构（`release.yml` 的 step / job / 默认 tag 均不动）。
- 不重写已发布 v0.2.15 Release 正文，不改写 v0.2.0–v0.2.14 旧版 notes 与 evidence。
- 不归档、不删除任何 evidence；不新增依赖；不改 `code-gates.json`。
- 不写 `tech.md`（正式技术方案不属于 Intake）。

## Implementation Constraints

- 版本唯一源仍是 `package.json#version = 0.2.15`；`currentTag` 由它派生，`latestPublishedTag` 是钉住的已发布事实字面量。
- 语义单点独占：README 第 5 行、`CHANGELOG`、`docs/release-evidence/v0.2.15.md`、`src/main/release-packaging.test.ts` 的版本锚点只由本项改，其他项不得顺手改。
- **`docs/release-signing.md` 必须纳入改动面**：dispatch 的收尾验收文件清单漏列了它，但现有 `signingDoc` 断言（`当前状态：${latestPublishedTag} 已发布`、`docs/release-evidence/${latestPublishedTag}.md`）在 `latestPublishedTag` 翻到 v0.2.15 后强制该文件同步翻面，否则门禁必红。只改顶部状态行与 v0.1.2 承接句，其余字节不动；这是「让门禁保持原强度通过」的最小集合，不是放宽门禁。
- 端口（承接句）语义：v0.1.2 漂移记录钉历史字面量 `v0.2.12`，**不跟随** `latestPublishedTag` 移动；测试断言同钉 `v0.2.12`。
- v0.2.14 专属内容断言（`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `共同祖先` / `ancestor` / `Upgrade`）改锚到历史字面量（`## v0.2.14` 段 + `docs/release-notes/v0.2.14.md`），因为 `lastReleasedNotes` 已前移到 v0.2.15。
- body 字符数口径：`gh release view v0.2.15 --json body --jq .body | wc -m` = 4937（含尾部换行；`--json body` 直接取值为 4936，因 gh 会去掉尾换行）。证据文件应写清测量命令，避免 4936/4937 争议。
- 只在 workitem worktree 内读写；主检出脏树不得触碰；历史一律 `git show`。
- 断言只改版本锚点相关处；若发现其他「published anchor strictly before current」假设（如 `headings.slice(0,2)` 期望 `[currentTag, latestPublishedTag]`、README 状态行 `not.toContain(currentTag)`），同批翻面，但保持原门禁强度。

## Handoff Note

Route: Intake → Coding → `code_gates` → Delivery。`needPm` / `needDesign` / `needArchitect` / `needChangePackReview` 均 false；`needSelfTest` false。方案已由 Product Owner 逐条钉死，无需 Architect 另开技术方案。
