# v0.2.16 发布事实回写与发布证据归档

- WI：`wi_intake_08e17c65bc260b46`
- 域：`release`（发布面文案 + 发布配置断言 + 发布证据归档；被测改动落在两版 README 第 5 行、`docs/release-signing.md` 状态与第三节、`src/main/release-packaging.test.ts` 锚点、新增 `docs/release-evidence/v0.2.16.md`）
- 来源：`.munk/changes/wi_intake_08e17c65bc260b46/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 13 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 交付 commit：本 WI 分支 `munk/wi_intake_08e17c65bc260b46` 上的 fold 提交，基线 = 发布点 `3dab29c0b7039cc4f483e5a8d2955fe95ec079bf`
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`README.md` 1/1、`README.zh-CN.md` 1/1、`docs/release-signing.md` 3/1、`src/main/release-packaging.test.ts` 273/40，外加新增未跟踪 `docs/release-evidence/v0.2.16.md`（123 行）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-readme-line5 | `README.md:5` = `> Latest public release: [v0.2.16](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.16) — Developer ID signed and Apple-notarized macOS build.`；`README.zh-CN.md:5` = `> 最新公开版本：[v0.2.16](…/releases/tag/v0.2.16) — macOS 安装包经 Developer ID 签名与 Apple 公证。`；两行 `releases/tag/` 计数各 1 且目标为 `releases/tag/v0.2.16` | 满足 |
| ac-readme-rest-untouched | `git diff -U0` 两版各只有一处 `@@ -5 +5 @@` hunk；`git diff --numstat` 均 `1 / 1`；第 3 行互链仍为 `English \| [简体中文](./README.zh-CN.md)` / `[English](./README.md) \| 简体中文`；两版各 9 个 `## ` 标题且顺序不变；英文版非语言切换行零汉字（只替换一个版本号 token，词数不变） | 满足 |
| ac-test-anchor | `src/main/release-packaging.test.ts:70` = `const latestPublishedTag = 'v0.2.16'`；`:1133` `expect(latestPublishedTag).toBe(currentTag)`、`:1134` / `:2270` `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)`；`publishedTags` 由 `'v0.2.12'` → `priorPublishedTag` → `lastShippedTag` → `latestPublishedTag` 收尾（含 `v0.2.15` 与 `v0.2.16`）；不再有要求 `latestPublishedTag` 严格早于 `currentTag` 的正向断言，`isTagBefore(lastShippedTag, latestPublishedTag) === true` 只钉历史序 | 满足 |
| ac-test-history-preserved | 新增 `lastShippedTag = 'v0.2.15'`（`:74`）与 `lastShippedNotesPath` / `lastShippedBilingualNotesPath`（`:246` / `:252`），`priorPublishedTag = 'v0.2.14'`（`:78`）钉上一版，`previousPublishedTag = 'v0.2.8'`（`:81`）不复用；`headings.slice(0,2)` 为 `[currentTag, lastShippedTag]`（`:1142` / `:2121`），三处 `changelog.slice` 端点改读 `lastShippedTag` / `priorPublishedTag`（`:1729` / `:2141` / `:2202`）；`lastReleasedNotesPath === releaseNotesPath`；`it(` 285 → **292**、`expect(` 1098 → **1131**，`.skip(` / `.todo(` / `.only(` 命中 0，无删除或注释断言 | 满足 |
| ac-test-body-fixture | `:3750` 模拟正文的 Full Changelog 为 `'compare/v0.2.15...v0.2.16'`，`compare/v0.2.16...v0.2.16` 命中 0；双语 body 门与链接门的 fail-closed 分支（缺段 / 相对链接 / 缺绝对 URL）断言原样保留 | 满足 |
| ac-signing-status | `docs/release-signing.md:5` = `> **当前状态：v0.2.16 已发布。** 最新公开 Release 为 <…/releases/tag/v0.2.16>，发布说明见 docs/release-notes/v0.2.16.md；发布证据见 docs/release-evidence/v0.2.16.md。v0.2.15 作为历史保留…`（v0.2.15 的 Release / notes / evidence 引用保留）；`:44` = `## 三、正式版发布姿态（v0.2.16）`；`:47`–`:48` 新增两条（v0.2.16 已发布 + v0.2.15 历史），其中 v0.2.16 条目含 tag 对象 / 发布点 / run `41376922492` / 12 件资产 / L1 六腿与签名公证原文（Developer ID Application、TeamIdentifier、hardened runtime、`notarization successful`、`valid on disk`、`satisfies its Designated Requirement`、`stapler validate` OK、`spctl accepted` / `Notarized Developer ID`）；`:81` 补发默认 `v0.2.16`；numstat `3 / 1`，hunk 恰 `@@ -5 +5 @@` 与 `@@ -46,0 +47,2 @@`；6 项 Secret 清单、fail-closed 表述与 v0.1.2 漂移段逐字未动 | 满足 |
| ac-evidence-record | `docs/release-evidence/v0.2.16.md`（123 行）：`^status:` 恰 1 行 = `verified`；§1 tag / 发布点 / 不重指不重打，§2 公开 Release（draft=false / prerelease=false / `2026-11-02T02:23:51Z` / 该 tag Release 数 1 / 资产 12），§3 Release CI 五 job + 16 门 + finalize 正文门与链接门 success，§4 12 资产表 + dmg 下载实测，§5 双语正文与绝对链接门，§6 L1 六腿 + §6.1 内存判据修订，§7 已知边界；无发布产物、无未验证结论 | 满足 |
| ac-evidence-values | §1 tag 对象 `690358de07c309f73736055ad25c13b11731c6cd`、发布点 `3dab29c0b7039cc4f483e5a8d2955fe95ec079bf`；§4 12 行资产名称不重复，字节与 `release-v0.2.16.json` 逐项相等，其中 dmg `111,477,257 B` / `4036c3a3…690b`（下载实测）、win zip `131,649,968 B`、Setup exe `101,434,344 B`（发布期资产）；§4.1 明确「只有 dmg 是下载实测，其余 11 件为发布期资产 size / digest」 | 满足 |
| ac-evidence-paths | 9 条引用路径实测全部存在：`projects/ops_df43e423451170fd/.munk/runs/trun_8d069981668e46c5/evidence/{release-v0.2.16.json,gates-summary.json,mac-job.log,ci-poll.json}` 与 `trun_5d107ebc931e4ffe/{digest.md,evidence/10-download-verify.json,evidence/23-memory-verdict.json,evidence/30-cancel.json,evidence/32-heap-gc-probe.json}`；路径为项目根相对、无本机用户名绝对路径；无不存在路径 | 满足 |
| ac-memory-criterion | §6.1 并列记录：旧判据（轮末堆 `d1 >= d2 >= d3`）在 `23-memory-verdict.json` 下 fail——轮末 JS heap 539,085,800 → 544,407,928 → 560,018,508 B，第 3 轮比第 2 轮 `+15,610,580 B`（≈`+15.6 MB`），fail 记录未删除；2026-11-02 负责人裁定该判据为缺陷，改按「关会话 + 强制 GC 的保留堆」后判 pass（R1 241,639,432 B = 241.6 MB → R2 241,772,232 B = 241.8 MB、Δ 132,800 B = 0.13 MB；app 峰值 1,292,943,360 B = 1.20 GiB ≤ 2.5 GiB、renderer 峰值 0.77 GiB ≤ 2.25 GiB）；§6 台账写「五腿 pass + 内存按替代证据判非泄漏」，不写成新判据通过（r3 未采样），补充探针 `supplementary: true` 不参与判定 | 满足 |
| ac-no-unpublished-ledger | 新证据文件 `v0.2.3` / `v0.2.13` / `待发布` 命中各 0，只引用 `v0.2.16` 与已发布历史 `v0.2.15`；两版 README 仅第 5 行改动，未新增版本号或 notes / evidence 路径；本次改动路径表中无新增未发布版本条目 | 满足 |
| ac-gates | Host `code_gates` attempt 001：**16 门**全 exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real`），证据落 `.munk/runs/run_intake_08e17c65bc260b46/code-gates/attempts/001`，`latest.json` `ok: true`；`pnpm test` 107 files / 1575 passed + 1 skipped（1576），32.94s；`.munk/code-gates.json` 零 diff，无 `\|\| true` 逃逸 | 满足 |
| ac-scope | `git status --porcelain` 交付面（除 `.munk/**` 与本 WI change pack）恰为 `README.md` / `README.zh-CN.md` / `docs/release-signing.md` / `src/main/release-packaging.test.ts` / 新增 `docs/release-evidence/v0.2.16.md` 五项；`package.json#version` = `0.2.16`；`CHANGELOG.md`、`docs/release-notes/**`（含 v0.2.16 双语两份）、`.github/workflows/release.yml`、`docs/release-process.md`、`electron-builder.yml` 与既有各版 `docs/release-evidence/**` 零 diff；`src/**` 除该测试文件外零改动 | 满足 |

## 口径与陷阱注记

- **本轮锚点方向与上一轮相反**：链接门那轮是收敛态（`latestPublishedTag = 'v0.2.15'`、`isTagBefore(latest, current) === true`），本项发布后翻回**相等**；单改布尔不构成方向断言（`isTagBefore` 对相等与超前都返回 `false`），故同批补 `expect(latestPublishedTag).toBe(currentTag)`。
- **切片端点是本轮最易假绿处**：`headings.slice(0,2)` 与三处 `changelog.slice` 若继续用 `latestPublishedTag` 作端点，`latest === current` 时会切出空串并通过空内容断言。本项统一改 `lastShippedTag`（v0.2.15）/ `priorPublishedTag`（v0.2.14）显式历史锚，v0.2.15 的 notes / changelog 切片各有独立常量。
- **正文夹具的 base tag 必须显式**：Full Changelog 用 `lastShippedTag...currentTag`，否则发布后会退化成 `v0.2.16...v0.2.16` 自比较而失去意义。
- **三套历史常量分工不可合并**：`lastShippedTag`（v0.2.15，上一公开版，供切片与夹具）、`priorPublishedTag`（v0.2.14，再上一版）、`previousPublishedTag`（v0.2.8，锚既有证据 / caps / README 负向链接断言）。
- **内存腿必须双边留档**：旧判据 fail 是真实读数（第 3 轮 +15.6 MB），不能因为负责人裁定「判据有缺陷」就删掉 fail 记录；修订判据的 pass 只能按「替代证据」表述（r3 未采样），不得写成「新判据通过」。
- **证据文件是只读回写**：事实全部取自 `release-v0.2.16.json` / `gates-summary.json` / `mac-job.log` / `ci-poll.json` / L1 `digest.md` 与指定 evidence JSON，未重新联网、未重新下载；12 件资产只有 dmg 是下载实测（引用 L1 `10-download-verify.json`），其余 11 件标注发布期资产 size / digest。
- **门禁口径为 16 门**（含四个 `template-*` 专项门与 `template-e2e-real`），任何沿用 11 门及更早门数的记录都要按当轮 `.munk/code-gates.json` 实读。

## 最近执行

- workItemId: wi_intake_08e17c65bc260b46
- at: 2026-11-02T11:57:00+08:00
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI / 真机自测，以 Host `code_gates` 为交付门槛（16 门 attempt 001 全 exit 0，`.munk/runs/run_intake_08e17c65bc260b46/code-gates/attempts/001`；`pnpm test` 107 files / 1575 passed + 1 skipped / 1576，32.94s）。静态核对按 AC 逐条走：两版 README 各只有一处 `@@ -5 +5 @@` 且第 5 行 `releases/tag/` 各 1 次指向 v0.2.16、9 个 H2 零 diff；签名文档 numstat `3 / 1`（`@@ -5 +5 @@` 与 `@@ -46,0 +47,2 @@`），v0.2.15 降历史、v0.1.2 漂移段与 6 项 Secret 逐字保留；测试 `latestPublishedTag='v0.2.16'` + `toBe(currentTag)` + `isTagBefore(...)===false`，`lastShippedTag='v0.2.15'` / `priorPublishedTag='v0.2.14'` / `previousPublishedTag='v0.2.8'`，正文夹具 `compare/v0.2.15...v0.2.16`，`it(` 285→292、`expect(` 1098→1131、skip/todo/only 0；证据文件 `^status:` 恰 1 行 = `verified`、12 行资产与 `release-v0.2.16.json` 逐项一致、9 条证据路径全部存在、旧内存判据 fail 与修订判据 pass 并列。事实边界：未打 tag / 未 push / 未 dispatch / 未对已公开 Release 做任何写操作。
