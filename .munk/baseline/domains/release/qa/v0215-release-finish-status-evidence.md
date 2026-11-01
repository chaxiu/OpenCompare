# v0.2.15 发布收尾：已发布事实回写 + 发布门锚点翻面

- WI：`wi_intake_091926475363e4c5`
- 域：`release`（发布面文案 + 发布配置断言 + 发布证据归档；被测改动落在两版 README 第 5 行、`CHANGELOG.md` v0.2.15 段、两份 v0.2.15 notes 的 Upgrade 段、`docs/release-signing.md` 两处锚点、`src/main/release-packaging.test.ts` 锚点翻面、新增 `docs/release-evidence/v0.2.15.md`）
- 来源：`.munk/changes/wi_intake_091926475363e4c5/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 25 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 交付 commit：本 WI 分支 `munk/wi_intake_091926475363e4c5` 上的 fold 提交，基线 = 发布点 `d560563`
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`CHANGELOG.md` +1/−0、`README.md` +1/−1、`README.zh-CN.md` +1/−1、`docs/release-notes/v0.2.15.md` +1/−1、`docs/release-notes/v0.2.15.zh-CN.md` +1/−1、`docs/release-signing.md` +2/−2、`src/main/release-packaging.test.ts` +66/−41，外加新增未跟踪 `docs/release-evidence/v0.2.15.md`（88 行）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-readme-en-line5 | `README.md:5` = `> Latest public release: [v0.2.15](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.15) — Developer ID signed and Apple-notarized macOS build.`；该行 `releases/tag/` 计数 1；`Developer ID` / `notariz` 逐字保留 | 满足 |
| ac-readme-zh-line5 | `README.zh-CN.md:5` = `> 最新公开版本：[v0.2.15](…/releases/tag/v0.2.15) — macOS 安装包经 Developer ID 签名与 Apple 公证。`；该行 `releases/tag/` 计数 1；`Developer ID` / `公证` 保留 | 满足 |
| ac-readme-shared-lines | 两版第 3 行仍为 `English \| [简体中文](./README.zh-CN.md)` / `[English](./README.md) \| 简体中文`；两版各 9 个 `## ` 二级标题，`git diff -U0` 中 `^[-+]## ` 命中 0；`git diff --numstat` 两文件均 `1 / 1`，`git diff -U0` 各只有一处 `@@ -5 +5 @@` | 满足 |
| ac-anchor-equal | `const latestPublishedTag = 'v0.2.15'`（并新增 `const priorPublishedTag = 'v0.2.14'` 钉历史）；`expect(latestPublishedTag).toBe('v0.2.15')` 与 `expect(latestPublishedTag).toBe(currentTag)` 同时在场；原「严格早于」写法改为相等/同指语义——`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)`（相等即非严格序）、`expect(lastReleasedNotesPath).toBe(releaseNotesPath)`、`expect(latestPublished).toBe(current)`、`expect(status).toContain(latestPublishedTag)`（旧的 `status).not.toContain(currentTag)` 已删）；`headings.slice(0,2)` 端点由 `latestPublishedTag` 改 `priorPublishedTag`，避免相等时退化为恒真 | 满足（非恒真：三处历史字面量 `v0.2.12` / `priorPublishedTag` / `foldedTag` 负向断言仍在） |
| ac-last-released-notes | `expect(relative(repoRoot, lastReleasedNotesPath)).toBe(`docs/release-notes/${latestPublishedTag}.md`)` + `expect(lastReleasedNotesPath).toBe(releaseNotesPath)`；实测 `docs/release-notes/v0.2.15.md` 存在、首标题含 `v0.2.15` | 满足 |
| ac-changelog-order | `CHANGELOG.md` 前三个 `## v*` 标题依次 `## v0.2.15`（行 5）→ `## v0.2.14`（行 25）→ `## v0.2.12`（行 48）；断言 `expect(latestPublished).toBe(current)` + 新增 `expect(changelog.indexOf('## ' + priorPublishedTag)).toBeGreaterThan(latestPublished)` + 既有 `## v0.2.12` 严格在后 | 满足 |
| ac-published-tags-history | `publishedTags` 数组在 `'v0.2.12'` 后补 `priorPublishedTag`（`'v0.2.14'`）、以 `latestPublishedTag`（`'v0.2.15'`）收尾；`previousPublishedTag` 仍 `'v0.2.8'`；`expect(isTagBefore('v0.2.12', latestPublishedTag)).toBe(true)` 保留 | 满足 |
| ac-v0214-history-pinned | v0.2.14 专属事实改锚显式历史：新增 `priorPublishedNotesPath` / `priorPublishedNotes`（`docs/release-notes/v0.2.14.md`），切片 `priorPublishedEntry = changelog.slice(indexOf('## ' + priorPublishedTag), indexOf('## v0.2.12'))`；`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `共同祖先` / `ancestor` / `Upgrade` 断言改读 `priorPublishedNotes`；`expect(priorPublishedNotesPath).not.toBe(lastReleasedNotesPath)` + `firstHeading(priorPublishedNotes)` 含 `priorPublishedTag` 证明历史未跟随锚点漂移 | 满足 |
| ac-no-gate-relax | `src/main/release-packaging.test.ts` 无 `.skip(` / `.todo(` / `.only(`（命中 0）；`it(` 277 → **277**、`expect(` 1044 → **1050**（只增不减，重钉为同位置换语义）；`v0.2.12` / `v0.2.11` / `v0.2.9` / `v0.2.8` / `v0.2.7` / `v0.2.6` / `v0.2.5` / `v0.2.4` / `v0.2.2` / `v0.2.0` / `v0.1.2` 历史字面量与用例逐条保留 | 满足 |
| ac-signing-status | `docs/release-signing.md:5` 含 `当前状态：v0.2.15 已发布`、`releases/tag/v0.2.15`、`docs/release-notes/v0.2.15.md`、`docs/release-evidence/v0.2.15.md`（v0.2.14 降为历史条目并指向已归档证据）；`:44` = `## 三、正式版发布姿态（v0.2.15）`；`:79` 仍含 ``默认 `v0.2.15` `` | 满足 |
| ac-signing-successor-pinned | `docs/release-signing.md:66` = `…tag 之后的修复由 v0.2.12 承接。…`；同文件对 v0.1.2 漂移段保持历史字面量，不随最新锚漂移（本项同时把它从 `v0.2.15` 钉回 `v0.2.12`） | 满足 |
| ac-changelog-zip | `CHANGELOG.md:14`（`## v0.2.15` 的 `### 改进` 下新增 1 行）：`- **Windows 免安装 zip**：Windows 除 NSIS 安装包外另提供 \`OpenCompare-0.2.15-win-x64.zip\`，解压即用、无安装步骤；自动更新仍指向 NSIS 安装包。`；`git diff --numstat -- CHANGELOG.md` = `1 / 0`（`## v0.2.14` 起零删除）；该段内 `已发布` / `200,000` / `10 MB` 命中 0 | 满足 |
| ac-notes-upgrade-zip | `docs/release-notes/v0.2.15.md` `## Upgrade` 写明「either install with the NSIS `.exe` or download `OpenCompare-0.2.15-win-x64.zip` and run it right after extracting; auto-update still only uses the NSIS `.exe`」；`v0.2.15.zh-CN.md` `## 升级方式` 写明「Windows 可选 NSIS 安装包，或下载 `OpenCompare-0.2.15-win-x64.zip` 解压即用；自动更新仍只走 NSIS exe」 | 满足 |
| ac-notes-structure-intact | 两份 notes 各 4 个 `## ` 标题、顺序不变（`What changed` / `Not in this release` / `Risk and verification scope` / `Upgrade` 与中文镜像）；`### Windows portable download` / `### Windows 免安装包` 段逐字未动；`git diff --numstat` 各 `1 / 1`，hunk 只落在 Upgrade / 升级方式 段；互链保留；两版 `**Full Changelog**` 与 `releases/tag/` 命中 0 | 满足 |
| ac-evidence-identity | `docs/release-evidence/v0.2.15.md`（88 行）：`^status:` 恰 1 行 = `verified`；§1 tag `v0.2.15` → 发布点 `d560563`，口径「不重指、不重打」；§2 `draft=false` / `prerelease=false` / 公开时间 `2026-11-01T04:10:46Z` / 公开 URL / 该 tag 的 Release 数 1 | 满足 |
| ac-evidence-assets | §4 表格 12 行，名称 + 字节逐项：`latest-linux.yml 535`、`latest-mac.yml 521`、`latest.yml 354`、`OpenCompare-0.2.15-arm64-mac.zip 107344513`（`.blockmap 114006`）、`OpenCompare-0.2.15-arm64.dmg 111467590`（`.blockmap 118407`）、`OpenCompare-0.2.15-win-x64.zip 131639034`、`OpenCompare-0.2.15.AppImage 118146518`、`OpenCompare-Setup-0.2.15.exe 101425160`（`.blockmap 106609`）、`opencompare_0.2.15_amd64.deb 92224572`；每行带 `releases/download/v0.2.15/<name>` | 满足 |
| ac-evidence-public-sha | §4.1 三行实测：dmg `2b4b384c…ebbe7` / `111,467,590 B`；exe `25d2e8e5…efc9` / `101,425,160 B`；win zip `92707126…f11a4` / `131,639,034 B`，与 prd 逐字相等 | 满足 |
| ac-evidence-latest-yml | §3 三份 `latest*.yml` 均 `0.2.15` 并各自指向对应产物；明确写出 `latest.yml` 的 `files[]` 只含 NSIS `OpenCompare-Setup-0.2.15.exe`、不含任何 `.zip`，自动更新仍只走 NSIS | 满足 |
| ac-evidence-body | §5 写明 `gh release view v0.2.15 --json body --jq .body | wc -m` = 4,937（含尾换行；`--json body` 直接取值 4,936，差 1 为换行符）；结构与 prd 一致（英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → `**Full Changelog**: …/compare/v0.2.14...v0.2.15`）；两版版本号一致；并标注这是「双语正文 + 发布后 body 断言」首次在真实发布上生效 | 满足 |
| ac-evidence-l1 | §6 四项实测：三份公开件 sha256/字节相符、干净副本 `0.2.15`、三轮四态 `35 / 80 / 41 / 326,099` 逐位一致、取消 `119 ms` 回可操作态且日志零噪声；来源指向 `projects/ops_df43e423451170fd/.munk/runs/trun_2223a6c320ba2987/` 与 `trun_0940457cc8587109/evidence/` | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：**11 门**全 `passed` / exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate`），证据落 `.munk/runs/run_intake_091926475363e4c5/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (11 gates, attempt 001)"`；`pnpm test` 96 files / 1454 passed + 1 skipped（1455），27.90s；`release-packaging.test.ts` 随锚点翻面后全绿；无 `|| true` 逃逸 | 满足 |
| ac-anchors-unchanged | `grep '"version"' package.json` = `"0.2.15"`；`.github/workflows/release.yml:17` = `default: 'v0.2.15'`；`git diff --name-only d560563 -- package.json .github/workflows/release.yml` 为空（零 diff） | 满足 |
| ac-diff-scope | `git diff --name-only d560563` = `CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `docs/release-notes/v0.2.15.md` / `docs/release-notes/v0.2.15.zh-CN.md` / `docs/release-signing.md` / `src/main/release-packaging.test.ts`；未跟踪新增仅 `docs/release-evidence/v0.2.15.md` 与本 WI 的 `.munk/changes/**`（fold 另改 `.munk/baseline/**`） | 满足 |
| ac-history-intact | `CHANGELOG.md` 的 v0.2.0–v0.2.14 段零删除行（numstat `1 / 0`）；`git diff --name-only d560563 -- docs/release-evidence docs/release-notes` 只含 v0.2.15 两份 notes（evidence 目录零 diff，`v0.2.14.md` 及更早未动）；无 evidence 被归档 / 删除 | 满足 |
| ac-no-publish-side-effects | 本 WI 全程未执行 `git tag` / `git push` / `workflow_dispatch` / `gh release edit|upload|delete`；tag `v0.2.15` 与 12 件公开资产保持只读，证据文件 §7 登记「不重指、不重打、不替换」；交付只经 Host `munk_local_merge` 推进 `main` | 满足 |

## 口径与陷阱注记

- **本轮与上一轮方向相反**：v0.2.15 收敛轮（`wi_intake_ea7ba22dd1f38c62`）把版本门写成 `isTagBefore(latestPublishedTag, currentTag) === true` 的**严格早于**语义；本项发布事实落地后必须整体翻面为「相等」，且不能只把 `toBe(true)` 改成 `toBe(false)`——`isTagBefore` 对相等与超前都返回 false，因此同批补 `expect(latestPublishedTag).toBe(currentTag)` 兜住「相等」而非「超前」。
- **切片端点从派生锚改显式历史锚是本轮最易写坏处**：`headings.slice(0,2)` 与三处 `changelog.slice(start, end)` 的 end 端点原为 `latestPublishedTag`，`latest === current` 时会切出空串并**假绿**。本项统一改 `priorPublishedTag` 显式字面量，并把 v0.2.14 专属事实（`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `共同祖先` / `ancestor` / `Upgrade`）改读 `priorPublishedNotes`。
- **`v0.1.2` 承接句再次翻向**：上一轮（v0.2.14 收尾）把它钉死在 `v0.2.12` 并表示「不随最新锚漂移」，v0.2.15 收敛轮又按 current 写成了 `v0.2.15`；本项按 prd 口径钉回 `v0.2.12`。事实证明这行既非稳定历史也非最新锚，而是需要在每次收尾轮**明确复判一次**的文案，不能靠常量派生。
- **`previousPublishedTag` 保持 `v0.2.8` 是刻意的**：它锚 v0.2.8 证据 describe / caps / README 负向链接断言；新增的「上一版」常量单独命名为 `priorPublishedTag`（`v0.2.14`），不复用 `previousPublishedTag`。
- **CHANGELOG 只增不删**：v0.2.15 段已在收敛轮建好，本项只在其 `### 改进` 下补 1 行 Windows 免安装 zip 条目（numstat `1 / 0`），`## v0.2.14` 起逐字不动。
- **证据文件的数据源边界**：本项只回写发布期已核事实（tag → `d560563`、12 件资产、三份公开件 sha256、三份 `latest*.yml`、body 4,937 字符、L1 三条腿），未重新 `gh release view` / 下载资产 / 打包 / 公证 / dispatch；九份非公开件不重算 sha256，文末如实登记该边界。
- **门禁口径为 11 门**（含 `sync-real-gate`），任何沿用旧门数的证据都要按当轮 `.munk/code-gates.json` 实读。

## 最近执行

- workItemId: wi_intake_091926475363e4c5
- at: 2026-11-01
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI / 真机自测，以 Host `code_gates` 为交付门槛（11 门 attempt 001 全 exit 0，`.munk/runs/run_intake_091926475363e4c5/code-gates/attempts/001`；`pnpm test` 96 files / 1454 passed + 1 skipped / 1455，27.90s）。静态核对按 AC 逐条走：两版 README 各只有一处 `@@ -5 +5 @@` hunk 且第 5 行 `releases/tag/` 各 1 次、9 个 H2 零 diff；签名文档 diff 恰 `@@ -5 -5` 与 `@@ -66 -66` 两处；CHANGELOG numstat `1 / 0` 且三段版本顺序 v0.2.15 → v0.2.14 → v0.2.12；证据文件 `^status:` 恰 1 行 = `verified`、占位符 0、12 行资产、三份 sha256 逐字、body 4,937 口径在；测试锚点 `latestPublishedTag='v0.2.15'` / `priorPublishedTag='v0.2.14'` / `toBe(currentTag)` / `isTagBefore(...)===false` / notes 路径相等，`it(` 277→277、`expect(` 1044→1050、skip / todo / only 0。事实边界：未打 tag / 未 push / 未 publish / 未对已公开 Release 做任何写操作。
