# v0.2.9 发布收尾：README 第 5 行 / 签名文档 / 证据归档，门禁翻到 `latest === current`

- WI：`wi_ws_31e6f08d0a3e353b`
- 域：`release`（发布面文案 + 发布配置断言；被测改动落在两版 README 第 5 行、`docs/release-signing.md`、新增 `docs/release-evidence/v0.2.9.md`、`src/main/release-packaging.test.ts`）
- 来源：`.munk/changes/wi_ws_31e6f08d0a3e353b/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收）
- 交付 commit：`04dde118c7499e86fb4d3e265a4040bdcc40d955`（`docs(release): v0.2.9 发布收尾（README 第 5 行 / 签名文档 / 证据归档前移，发布门禁翻到 latest === current）`）
- 改动面（除 change-pack `prd.md`）：`README.md` +1/−1、`README.zh-CN.md` +1/−1、`docs/release-evidence/v0.2.9.md` +85/−0、`docs/release-signing.md` +8/−7、`src/main/release-packaging.test.ts` +243/−47

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-latest-equals-current | `src/main/release-packaging.test.ts:610-611`：`expect(latestPublishedTag).toBe(currentTag)` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)`；`latestPublishedTag = 'v0.2.9'`（:57） | 满足 |
| ac-previous-anchor | `previousPublishedTag = 'v0.2.8'`（:60）+ 两条 `isTagBefore(previousPublishedTag, …)` 断言 | 满足 |
| ac-published-tags | `publishedTags`（:63 起）九项显式（含 `'v0.2.6'` 字面量，非 `previousPublishedTag` 派生） | 满足 |
| ac-current-tag-derived | `currentTag = 'v' + pkg.version`；`package.json#version` = `0.2.9` 零 diff | 满足 |
| ac-readme-line5 | 两版第 5 行含 `v0.2.9`，`releases/tag/` 各恰 1 次且指向 `releases/tag/v0.2.9`；第 5 行以外两版全文 `vX.Y.Z` 命中 0（脚本逐行扫描） | 满足 |
| ac-readme-no-stale-link | 两版全文 `releases/tag/v0.2.8` / `v0.2.4` / `v0.2.2` 命中 0；中文版「待发布」0 | 满足 |
| ac-signing-doc-v029 | 签名文档含「当前状态：v0.2.9 已发布」「正式版发布姿态（v0.2.9）」「`docs/release-notes/v0.2.9.md`」「`docs/release-evidence/v0.2.9.md`」「tag 之后的修复由 v0.2.9 承接」；「当前状态：v0.2.8 / v0.2.4 / v0.2.2」命中 0 | 满足 |
| ac-signing-reissue-section | 第五节含「v0.2.9 已发布」、`` 默认 `v0.2.9` ``、「已合入 `main`」、`docs/release-notes/v0.2.9.md`；旧表述「最新公开 Release 仍是」命中 0 | 满足 |
| ac-signing-preserved | `git show HEAD -- docs/release-signing.md` 的 diff 只落在第 5 行状态块、第三节姿态标题与两行条目、第四节承接句、第五节补发句与同步说明；第一节 6 项 Secret 表 / 第四节 v0.1.2 漂移 / 第六节打包后硬校验零 hunk | 满足 |
| ac-evidence-exists | `docs/release-evidence/v0.2.9.md` 85 行非空；`^status:` 恰 1 行且为 `status: verified` | 满足 |
| ac-evidence-no-placeholder | `TODO` / `TBD` / `FIXME` / 「待回填」/「待验证」/「预计通过」各 0；`<...>` 0；空 ```text 代码块 0 | 满足 |
| ac-evidence-tag-commit | §1 记录 tag `v0.2.9`、annotated、tag → commit `35d4000f6d7d245dab577a52f639f3daab2726c0`、处理口径「不重指、不重打」 | 满足 |
| ac-evidence-release | §2 记录 `releases/tag/v0.2.9`、`draft=false`、`prerelease=false`、资产数 11；§4 11 行各带 `releases/download/v0.2.9/<name>`（计数 11） | 满足 |
| ac-evidence-asset-numbers | §4 每行实测字节数 + 64 位 sha256（dmg `113,448,447 B` / `7449415cc2951476739b6466b92582e2d0ba5d4016a7a5f4505fc654a992fe99` 等 11 件），测试以显式字面量钉住 | 满足 |
| ac-evidence-no-v028-carryover | 证据文件 `356ad044…` / `2917a65b…` / `113,437,237` / 资产名 `v0.2.8` 字串命中全 0 | 满足 |
| ac-evidence-ci | §3 记录 run `40603225496`、headSha `35d4000f…`、conclusion `success`；五 job 行（`Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release`）各含 `success` | 满足 |
| ac-evidence-blocked-gaps | 4 处 `blocked`：§5 唯一性与 latest 门 finalize 日志、§6 签名 / 公证 / Gatekeeper 原文、§7 L1 公开包复验、§10 边界小结；各节写明证据缺口且不写未取证结论 | 满足 |
| ac-evidence-archive-refs | §8 引用 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`，§9 引用 `…/trun_070ff986f2830ed2/`；两节标为归档运营证据、未在本环境重跑，「本次已重新验证」0 命中 | 满足 |
| ac-v028-evidence-block-preserved | 测试 v0.2.8 证据块锚点改为 `previousPublishedTag` / `docs/release-evidence/v0.2.8.md`，commit、run `40427569024`、五 job、11 资产名与 URL、`113,437,237 B`、dmg sha、L1 `trun_e9d687a57b51de6f`、负载 `trun_ecbdd72beef29b0a` 与 `8,262 ms` / `7,898 ms` / `855.5 MiB` / `1,310.4 MiB` / `取消 116 ms` 逐条保留 | 满足 |
| ac-history-anchors | v0.2.6 / v0.2.7 的 changelog / notes / evidence 断言改用 `'## v0.2.6'` / `'## v0.2.7'` 显式字面量锚，不随 `previousPublishedTag` 前移 | 满足 |
| ac-chained-flip-covered | 版本门 `toBe` / `isTagBefore === false`、notes 路径 `toBe`、changelog current 段切片终点改为上一已发布版本标题（非与起点同标题）、「沿用上一版口径」引用与 README / 签名 / 承接句锚全部换新锚且保持可区分 | 满足 |
| ac-test-integrity | `grep -c 'it('` 185 → 191（`^\s*it(` 口径）/ 225 → 232（含 `it.each` 等任意 `it(` 出现，与 prd 的 225 基线同口径），只增不减；`it.skip` / `it.todo` / `describe.skip` 0；`toBeTruthy()` 6 → 6（未新增）；`MB` / `MiB` 等值集合与 `[0-9a-f]{64}` 严格集未放宽 | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：9 gates 全 passed（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate），`pnpm test` 66 files / 1066 passed + 1 skipped / 1067 | 满足 |
| ac-diff-scope | `git show --numstat HEAD` 除 change-pack `prd.md` 外恰为上述五文件；`package.json`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-process.md`、`.github/workflows/**`、`electron-builder.yml`、`AGENTS.md` 零 diff | 满足 |
| ac-clean-tree-and-sha | 交付时 `git status --porcelain` 为空；交付说明写明 commit `04dde118c7499e86fb4d3e265a4040bdcc40d955` 且「未执行 tag / push / publish / gh release 写操作」 | 满足 |

## 口径与陷阱注记

- **本条取代上一轮收敛轮的「不相等」姿态**：`### v0.2.9 版本收敛与发布面同批对齐` 的 `ac-latest-trails-current` / `ac-notes-anchors-distinct`（要求 `latestPublishedTag !== currentTag`、两份 notes 路径不相等）是**历史时点断言**，已被本条的 `ac-latest-equals-current` / notes 路径相等取代。旧 AC 与旧 QA 记录（`qa/v029-version-convergence-release-notes.md`）原样保留，不回改；读该域时按「后者取代前者」解读，不要拿旧 AC 判红。
- **`previousPublishedTag` 会继续前移**：本轮它已到 `v0.2.8`，下一轮（v0.2.10 收敛）会再前移。v0.2.6 / v0.2.7 / v0.2.8 三组历史断言必须继续用显式字面量钉死，否则历史断言会被带偏到错误版本或丢失覆盖。
- **证据文件的事实边界**：`gh release view` 可核的只有 tag / 公开地址 / draft·prerelease / 11 件资产的 `size` 与 `digest`、CI run 与五 job 结论。公证与 Gatekeeper 原文、L1 公开包复验、finalize 的唯一性与 latest 门日志在本环境不可读，只能写 `blocked` + 证据缺口，**禁止用 CI `success` 顶替逐项原文**；也禁止把 v0.2.8 的 commit / dmg sha / `113,437,237 B` / 资产名搬进来。
- **不重指、不重打 `v0.2.9`**：本轮未执行 tag / push / publish / `gh release` 任何写操作，也未重新下载资产、未重新打包 / 公证 / dispatch。
- **单位白名单仍是活边界**：`MB` 集合 `['10 MB']`、`GiB`/`MiB`/`GB` 集合 `['1,325 MiB','764.9 MiB']` 未放宽；下一轮若在发布说明引入同类数字，仍须同批改集合断言。

## 最近执行

- workItemId: wi_ws_31e6f08d0a3e353b
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_e88d80cf9d5505ac/code-gates/attempts/001`；`pnpm test` 66 files / 1066 passed + 1 skipped / 1067）。静态核对按 AC 逐条走脚本：两版 README 第 5 行 `releases/tag/` 各 1 次且第 5 行以外 `vX.Y.Z` 0 命中，签名文档六项正向锚全中且三处旧「当前状态」0 命中，证据文件 `^status:` 恰 1 行 = `verified`、占位符 0、`v0.2.8` 串味 0、五 job 全 `success`、11 条 `releases/download/v0.2.9/` URL、4 处 `blocked`，测试锚点 `latestPublishedTag='v0.2.9'` / `previousPublishedTag='v0.2.8'` / `publishedTags` 九项显式、版本门 `toBe(currentTag)` 与 `isTagBefore(...)===false`、`it(` 185→191、`toBeTruthy()` 6→6 未新增、skip/todo 0。事实边界：未重新 `gh release view` / 下载资产 / 打包 / 公证 / dispatch，未打 tag / push / publish；公证、L1 复验与 finalize 日志仍为 `blocked` 缺口。
