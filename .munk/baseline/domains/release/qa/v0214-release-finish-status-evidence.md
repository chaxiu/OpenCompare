# v0.2.14 发布收尾：README 两版第 5 行 / `latestPublishedTag` 翻面 / 签名文档三处 / 证据归档

- WI：`wi_ws_be559452703352a1`
- 域：`release`（发布面文案 + 发布配置断言 + 发布证据归档；被测改动落在两版 README 第 5 行、`docs/release-signing.md` 三处版本事实、`src/main/release-packaging.test.ts` 锚点重钉、新增 `docs/release-evidence/v0.2.14.md`）
- 来源：`.munk/changes/wi_ws_be559452703352a1/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 18 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 交付 commit：本 WI 分支 `munk/wi_ws_be559452703352a1` 上的 fold 提交（`chore(baseline): fold v0.2.14 release-finish ACs and QA record into release domain`），基线 `942bbb0`（其父为发布点 `3550b24`）
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`README.md` +1/−1、`README.zh-CN.md` +1/−1、`docs/release-signing.md` +3/−3、`src/main/release-packaging.test.ts` +20/−17、新增 `docs/release-evidence/v0.2.14.md`（121 行，未跟踪新文件）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-l1-gate-confirmed | 落笔前实读 `products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_2ed24b3624d3959e/`：`digest.md` 第 3–4 行 `needsOwner: false` / `workRemaining: false`，第 17 行标题 `# v0.2.14 · L1 公开包验收 · **PASS**`、第 19 行结论段「L1 闭环，对外口径禁令解除——v0.2.14 可写「已发布」；不写「已修复 L3 项」」；`receipt.json` `needsOwner: false`、`suggestedAction: null` | 满足（digest 结论行按原文记录） |
| ac-readme-en-status-line | `README.md:5` = `> Latest public release: [v0.2.14](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14) — Developer ID signed and Apple-notarized macOS build.`；该行 `grep -c 'releases/tag/'` = 1；行内 `v0.2.12` / `待发布` 命中 0；尾句逐字保留 | 满足 |
| ac-readme-zh-status-line | `README.zh-CN.md:5` = `> 最新公开版本：[v0.2.14](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14) — macOS 安装包经 Developer ID 签名与 Apple 公证。`；该行 `releases/tag/` 计数 1；`v0.2.12` / `待发布` 命中 0 | 满足 |
| ac-readme-other-lines-untouched | `git diff -U0 -- README.md` 只有 `@@ -5 +5 @@` 一处 hunk（+1/−1）；`git diff -U0 -- README.zh-CN.md` 同样只有 `@@ -5 +5 @@` 一处（+1/−1）；两版 9 个 `## ` 二级标题、第 3 行互链、徽章与两张截图引用零 diff | 满足 |
| ac-latest-published-tag | `src/main/release-packaging.test.ts:66` `const latestPublishedTag = 'v0.2.14'`；注释同步改为「v0.2.14 shipped, so the newest published anchor now equals the converged tag」；文件内 `'v0.2.12'` 不再作最新锚（仅作历史字面量） | 满足 |
| ac-published-tags-history | `publishedTags` 在 `'v0.2.11'` 之后补入 `'v0.2.12'`，末项仍为 `latestPublishedTag`；`v0.2.0…v0.2.11` 各字面量原样保留；`expect(publishedTags).not.toContain(foldedTag)` 保留（`foldedTag` 仍是运行时拼接的 `v0.2.13`） | 满足 |
| ac-repinned-anchors-post-release | 版本门：`expect(latestPublishedTag).toBe(currentTag)`、`expect(isTagBefore('v0.2.12', latestPublishedTag)).toBe(true)`、`expect(isTagBefore(previousPublishedTag, latestPublishedTag)).toBe(true)`；notes 锚：`expect(lastReleasedNotesPath).toBe(releaseNotesPath)`；CHANGELOG 序：`expect(latestPublished).toBe(current)` + `expect(changelog.indexOf('## v0.2.12')).toBeGreaterThan(latestPublished)`；签名文档：`当前状态：v0.2.14 已发布` 与 `docs/release-evidence/v0.2.14.md` 实测命中；原先的 `not.toBe(currentTag)` / `isTagBefore(...)===true`（旧向）/ `not.toBe(releaseNotesPath)` 三式已无残留 | 满足 |
| ac-test-strength-nondecreasing | `grep -c 'it('` 与 `grep -c 'expect('`：HEAD `942bbb0` 为 `257 / 947`，交付树为 `257 / 947`（重钉为 1:1 等价替换，≥ prd 基线 216 / 947）；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0；`v0.2.11` / `v0.2.9` / `v0.2.8` / `v0.2.7` / `v0.2.6` / `v0.2.5` / `v0.2.4` / `v0.2.2` / `v0.2.0` / `v0.1.2` 相关用例逐字保留；子项 1 的 `published release body gate` describe 与双语断言零改动（`git diff` 未命中该 describe） | 满足 |
| ac-signing-doc-minimal-flip | `docs/release-signing.md:5` 状态句 → `当前状态：v0.2.14 已发布` + `releases/tag/v0.2.14` + `docs/release-notes/v0.2.14.md` + `docs/release-evidence/v0.2.14.md`；`:44` 第三节标题 `## 三、正式版发布姿态（v0.2.14）` 与 `:47` 本版条目 → v0.2.14；`:81` 补发说明改为「已合入 `main` 并随 tag 发布 … 最新公开 Release 为 v0.2.14，README 状态行与 `latestPublishedTag` 已跟随翻到该版本」；`git diff -U0` 恰三处 `@@ -5` / `@@ -47` / `@@ -81`（+3/−3），`v0.2.11` 及更早历史条目、第一节 6 项 Secret 表、第四节 `v0.1.2` 漂移记录、第六节打包后硬校验零 hunk | 满足 |
| ac-evidence-release-facts | `docs/release-evidence/v0.2.14.md`：`status:` 恰 1 行 = `verified`；§1 含发布点 `3550b24f693f632c0400922be9cf8f3e8deae96e` 与 annotated tag 对象 `66ea7bec73552474b7c2734259936b26331a75cc`；§2 含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14` / `draft=false` / `prerelease=false` / 资产数 11；§3 含 CI run `41188356807` 五 job 全 `success`（`Quality gates` / `Package linux` / `Package win` / `Package mac` / `Publish the GitHub Release`）；§4 11 行资产各带 `releases/download/v0.2.14/<name>` 与逐件字节数；未归档项以「见发布期证据」标注（1 处），无 `TODO` / `TBD` / `FIXME` / `待回填` / `待验证`（命中 0） | 满足 |
| ac-evidence-l1-measured | §6 逐项落表：公开 dmg HTTP 200 / `111,444,402` B / sha256 `11d34ea2f777a3edd0535f8b92c706c9e7321ca48cb8cb6852b235ff465407b9`；干净副本 `CFBundleShortVersionString=0.2.14` + `codesign --verify --deep --strict` exit 0 + `TeamIdentifier=3X4J53U6RY` + `spctl` accepted `Notarized Developer ID` + `stapler validate` ok；腿 1 三轮四态 `35 / 80 / 41 / 326,099`（源 `326,175` / 目标 `326,214`）、与 v0.2.11 基线差 `0/0/0/0`；腿 2 app 总峰值 `1.19 GiB`（≤2.5 GiB）、renderer 瞬时峰值 `0.75 GiB`、heap Δ `+527.1 → +3.3 → −5.2 MB`、零 OOM / 零 renderer 重启；腿 3 取消 hit-test 命中 `BUTTON` `Cancel`、`116 ms` 回可操作态、零半棵树零四态残留、`20/20` 断言 true；日志 `OperationCancelledError 0 / ECANCELED 0 / OOM 0 / FATAL 0 / Renderer process 0`；引 run id `trun_2ed24b3624d3959e` | 满足 |
| ac-evidence-gap-verbatim | §7 第 116 行逐字：`v0.2.14 已公开 Release body 仅英文，中文仅存于仓内 docs/release-notes/v0.2.14.zh-CN.md；双语正文修复自下一版生效`；全文无「已发布双语」「已修复」改写 | 满足 |
| ac-no-l3-claim | §7 第 119 行 `- **L3 / P1④ 本场未跑**：本轮只做 L1 三条腿，未做 L3 下钻与 P1④ 重跑；本文件不就这两项作任何结论。`；全仓本轮改动中「已修复 L3 项」「L3 已通过」命中 0；对外只写「已发布」 | 满足 |
| ac-no-v0213-artifacts | `docs/release-notes/v0.2.13.md` / `docs/release-notes/v0.2.13.zh-CN.md` / `docs/release-evidence/v0.2.13.md` 三者 `ls` 均 `No such file`；`grep -rn --include='*.md' 'releases/tag/v0.2.13'` 与 `'## v0.2.13'`（排除 `.munk/**`、`node_modules`）命中 0 | 满足 |
| ac-changelog-and-notes-untouched | `git diff --stat -- CHANGELOG.md docs/release-notes .github/workflows/release.yml` 输出为空（零 diff）；子项 1 在 `release.yml` 的 `Pre-create` / `finalize` 改动原样保留在基线 `942bbb0` 内 | 满足 |
| ac-public-artifacts-untouched | 本 WI 全程未执行 `gh release edit/create/delete`、`git push`、`git tag`、`workflow_dispatch`，未重新下载或改写 v0.2.14 公开资产（证据文件与交付说明均记录该事实；发布期 / L1 事实全部取自既有 `.munk/runs/**` 证据） | 满足 |
| ac-product-source-untouched | `git diff --name-only -- src/` 只有 `src/main/release-packaging.test.ts`；`src/core/**`、`src/renderer/**`、`src/shared/**`、`src/preload/**` 与 `src/main/**` 其余文件零改动 | 满足 |
| ac-changed-paths-bounded | `git diff --name-only` = `README.md` / `README.zh-CN.md` / `docs/release-signing.md` / `src/main/release-packaging.test.ts`；`git status --porcelain` 新增未跟踪 = `.munk/changes/wi_ws_be559452703352a1/prd.md` 与 `docs/release-evidence/v0.2.14.md`；fold 另改 `.munk/baseline/**` | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：**10 门**全 `passed` / exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics`），证据落 `.munk/runs/run_ws_c4dbba47d9739b72/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (10 gates, attempt 001)"`；`pnpm test` 91 files / 1374 passed + 1 skipped（1375），29.06s；无 `|| true` 逃逸 | 满足 |

## 口径与陷阱注记

- **这是「翻面」而不是「新增版本」**：本轮没有 `package.json#version` 变更、没有 CHANGELOG / notes 改动，只把三项发布事实（README 第 5 行、`latestPublishedTag`、签名文档版本指向）从 `v0.2.12` 翻到 `v0.2.14`。任何顺手 bump `package.json` / 改 `docs/release-notes/**` 都会违反 `ac-changelog-and-notes-untouched`。
- **`expect(` 计数只持平不上升是预期**：重钉是「同一位置换语义」（`not.toBe` → `toBe`、`isTagBefore(latest, current)` → `isTagBefore('v0.2.12', latest)`、`not.toBe` 路径 → `toBe` 路径），无断言被删、无 `toBeTruthy()` 顶替、无 `skip` / `only`。后续轮次若再翻面，仍须按此口径留痕。
- **`previousPublishedTag` 保持 `v0.2.8` 是刻意的**：它锚 v0.2.8 证据 describe / caps / README 负向链接断言，跟着前移会打断历史块。v0.2.12 作为「上一版历史」由 `publishedTags` 字面量与 `## v0.2.12` 显式端点承担，不再新增独立常量。
- **`v0.1.2` 承接句必须钉死 `v0.2.12`**：`tag 之后的修复由 <latestPublishedTag> 承接` 在漂移记录里的语义是**历史事实**（当时最新公开版本是 v0.2.12），本轮已改为显式字面量 `v0.2.12` 并加注释说明「不得跟随最新锚漂移」。这是本轮最容易写坏的一处：若沿用派生常量，`latest===current` 时该断言会要求文档写「由 v0.2.14 承接」，与 v0.1.2 历史记录矛盾。
- **证据文件的数据源边界**：发布期事实只取自 `.munk/runs/trun_49dcbeddc99aa9eb/evidence/{release-v0.2.14.json,ci-run-41188356807.json,dmg-sha256.txt,gates-summary.txt,mac-package-log.txt}`，L1 事实只取自 `.munk/runs/trun_2ed24b3624d3959e/digest.md` 及其 `evidence/`；本项未重新 `gh release view`、未下载资产、未打包 / 公证 / dispatch，不可核项一律写「见发布期证据」，不用 CI `success` 顶替逐项原文。
- **已公开的单语 body 是刻意不修的遗留**：`v0.2.14` 公开 Release body 只有英文，双语修复自下一版生效；本项不补写 0.2.14 中文 body、不对已公开 tag 做 `gh release edit`。
- **`v0.2.13` 永不单独发布**：不为它建 notes / evidence / tag，`foldedTag` 负向断言继续守住。

## 最近执行

- workItemId: wi_ws_be559452703352a1
- at: 2026-10-31
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI / 真机自测，以 Host `code_gates` 为交付门槛（10 门 attempt 001 全 exit 0，`.munk/runs/run_ws_c4dbba47d9739b72/code-gates/attempts/001`；`pnpm test` 91 files / 1374 passed + 1 skipped / 1375，29.06s）。静态核对按 AC 逐条走脚本：两版 README 各只有一处 `@@ -5 +5 @@` hunk 且第 5 行 `releases/tag/` 各 1 次；签名文档 `git diff -U0` 恰 `@@ -5` / `@@ -47` / `@@ -81` 三处；证据文件 `^status:` 恰 1 行 = `verified`、占位符 0、五 job 全 `success`、11 行资产 URL、L1 实测数字逐项命中、缺口句逐字、`L3 / P1④ 本场未跑` 在、`v0.2.13` 三文件与两类字符串命中 0；测试锚点 `latestPublishedTag='v0.2.14'` / `publishedTags` 含 `v0.2.12` / `toBe(currentTag)` / `isTagBefore('v0.2.12', latest)` / notes 路径相等、`it(` 257→257 / `expect(` 947→947、skip / todo / only 0。事实边界：未打 tag / 未 push / 未 publish / 未 `gh release` 任何写操作，未重新下载资产或重新公证。
