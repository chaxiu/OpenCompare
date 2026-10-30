# v0.2.12 版本收敛、发布说明与测试锚点收敛（收敛轮，单提交）

- WI：`wi_ws_0a26040fef375884`
- 域：`release`（版本收敛轮：bump 待发版本 + 发布说明 + CHANGELOG 折叠 + dispatch 默认 tag + 发布文档锚点 + 测试锚点解绑；不是发版 / 收尾轮）
- 来源：`.munk/changes/wi_ws_0a26040fef375884/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过）

## 最近执行

- workItemId: wi_ws_0a26040fef375884
- at: 2026-10-30
- status: pass
- note: 15 条 prd AC 全部满足，无偏差。本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_5b2dd0e90e86f46b/code-gates/attempts/001`，全 exit 0；`pnpm test` 80 files / 1245 passed + 1 skipped（1246）/ 28.50s，基线 1243 净增 2 例；`pnpm test src/main/release-packaging.test.ts` 202 passed）。交付后按产品方补充要求，notes 壳层小节增一行「窄窗口工具栏：目录工作台窄窗口（≤1024）首行工具栏溢出修复」，改后复跑 `release-packaging.test.ts` 202 passed 与全量 1245 passed + 1 skipped（28.46s），零红。边界：不打 tag / 不 push 分支 / 不 dispatch / 不 publish / 不建 Release 与证据文件；v0.2.12 发布后的 README 第 5 行 + `latestPublishedTag` 收尾前移是独立动作。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-0-2-12 | `package.json#version === "0.2.12"`；`git diff package.json` 仅 `- "version": "0.2.11"` / `+ "version": "0.2.12"` 一组行；`dependencies['lucide-react']` 不存在（`!!pkg.dependencies['lucide-react'] === false`） | 满足 |
| ac-notes-h1 | `docs/release-notes/v0.2.12.md` 存在，H1 为 `# OpenCompare v0.2.12 发布说明`；`## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式` 四标题全命中；`Full Changelog` 0 命中 | 满足 |
| ac-changelog-head | `CHANGELOG.md` 二级标题序列前三位为 `## v0.2.12` → `## v0.2.11` → `## v0.2.9`；diff 为 `+/20 / −0`（纯新增，`## v0.2.11` 及以下逐字不动） | 满足 |
| ac-notes-fact-boundary | notes 与 CHANGELOG `## v0.2.12` 段：`200,000` / `10 MB` / `本版新增` / `待验证` / `预计通过` / `应该通过` 各 0 命中；`TODO|TBD|FIXME` 0 命中；`[0-9a-f]{40,64}` 0 命中；`notes.match(/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g)` 为 `null`（即空数组） | 满足 |
| ac-notes-ui-facts | notes 含 `壳层`（壳层五级重排）/ `图标` + `lucide-react`（单一出口、已移除）/ `主题`（亮 / 暗 / 跟随系统三态）/ `tab`（标题截断）/ `截图`（README 双截图）五组；升级方式写「建议从 v0.2.11 升级」；无「已发布」/「已修复」/「已通过 L3」对 v0.2.12 的完成态宣称。**交付后按产品方补充要求增一行**：`窄窗口工具栏：目录工作台窄窗口（≤1024）首行工具栏溢出修复。`（依据 L3 实机验收 `62b53e13` 打包态 1024×900 复现 `view-toolbar` `scrollWidth 1146 > clientWidth 1024`，`960–1146` 区间可复现、`minWidth 960`、亮暗皆然、`1440/1920` 无违规；修复由独立缺陷项承接，在本版 tag 之前合入 `main`）。该行**只写 `≤1024`**，不写 `1146` / `960–1146`，无完成态措辞；改后 notes 的 `\d+(?:[.,]\d+)?\s*(?:GiB\|MiB\|GB\|MB)` 仍为空数组、六项短语仍全命中、`已发布/已修复/已通过 L3` 仍 0 命中 | 满足 |
| ac-release-yml-default | `release.yml` 第 17 行 `default: 'v0.2.12'`；`git diff .github/workflows/release.yml` 恰 1/1 行；`--notes-file` 段、preCreate、finalize、祖先门、签名检查、打包矩阵、单 Release 门零 diff | 满足 |
| ac-release-process-default | `docs/release-process.md` 含 `default: 'v0.2.12'`，全文 `default: 'v0.2.11'` 0 命中；diff 1/1 | 满足 |
| ac-signing-v0211-published | `docs/release-signing.md` 命中 `当前状态：v0.2.11 已发布`、`正式版发布姿态（v0.2.11）`、`docs/release-notes/v0.2.11.md`、``默认 `v0.2.12` ``、`docs/release-notes/v0.2.12.md`、`tag 之后的修复由 v0.2.11 承接`；`当前状态：v0.2.8` / `当前状态：v0.2.4` / `当前状态：v0.2.2` / `发布冻结` / `待发布` 全 0 命中 | 满足 |
| ac-signing-evidence-gap | 同文件含 `docs/release-evidence/v0.2.11.md` 与「尚未归档」「已归档的最新证据为 `docs/release-evidence/v0.2.9.md`」相邻表述；`证据已齐` / `已核验` 0 命中；未写入任何新资产名 / size / sha256 / run id | 满足 |
| ac-readme-status-line | `README.md` 第 5 行 `Latest public release: [v0.2.11]`、`README.zh-CN.md` 第 5 行 `最新公开版本：[v0.2.11]`；两版 `releases/tag/` 各恰 1 处且为 `releases/tag/v0.2.11`；两版 diff 均 1/1（仅第 5 行）；9 个 `## ` 标题与两张 `docs/assets/*.png` 零 diff | 满足 |
| ac-test-anchor-constants | `src/main/release-packaging.test.ts:57` `latestPublishedTag = 'v0.2.11'`、`:60` `previousPublishedTag = 'v0.2.8'`、`:63` 起 `publishedTags` 显式含 `'v0.2.9'` 且以 `latestPublishedTag` 收尾 | 满足 |
| ac-test-history-pinned | 新增 `historicalNotesV0211Path` / `historicalNotesV029Path` 两个显式路径常量；v0.2.11 ruler 短语白名单、六项有序单位白名单（`451.6 MiB`→`909.0 MiB`→`2.25 GiB`→`2.5 GiB`→`9.29 GiB`→`9.62 GiB`）、`trun_08764efa44c39426`、`2bcdc53e`、`L1 前待实机` / `run id 待该场次回填` 负向全部改读 `historicalNotesV0211`；v0.2.9 HTML 报告 / Open Rebuilds / caps（`['10 MB']` / `['1,325 MiB','764.9 MiB']`）改读 `historicalNotesV029`；`releaseEvidencePath` 钉死 `docs/release-evidence/v0.2.9.md`，describe 改名 `v0.2.9 verified release evidence record`，`releasedCommit = '35d4000f…'` 与 11 件资产 size/sha256 断言逐条保留 | 满足 |
| ac-test-no-assertion-loss | `git diff --numstat` 该文件 89/44：删除行均为「读 `releaseNotes` / `lastReleasedNotes` / `latestPublishedTag` → 改读显式历史常量」的同一断言重写；无 `- it(` / `- describe(` 净删除（新增 `ships the converged notes and changelog entry without unmeasured figures` 1 例）；无新增 `.skip` / `.only`；无 `toBeTruthy()` 新增；用例数 1243 → 1245 | 满足 |
| ac-test-current-neutral | 新增用例的 H1 断言用 `currentTag`、含 `升级方式`；负向白名单与 prd 一致（含单位数字 `toEqual([])`）；新增断言内无 `0.2.12` 内联字面量 | 满足 |
| ac-gates-green | `.munk/runs/run_ws_5b2dd0e90e86f46b/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 全 `passed`；`pnpm test` 1245 passed + 1 skipped | 满足 |
| ac-no-deletions | `git diff --stat` 无 `docs/release-notes/v0.2.0`–`v0.2.11` 与 `docs/release-evidence/**` 删除；`docs/release-evidence/v0.2.11.md` 不存在（未新建）；交付提交后工作区干净由 Host `munk_git_commit` 保证 | 满足 |

## 交付说明

**改动文件（8 个已跟踪 + 1 个新增）**：`package.json`（仅 `version`）、`CHANGELOG.md`（+20，顶部新增 `## v0.2.12`）、`docs/release-notes/v0.2.12.md`（新增）、`docs/release-process.md`（dispatch 默认 tag 摘录）、`docs/release-signing.md`（+8/−7：状态行、第三节姿态标题 + v0.2.11 条目 + 证据缺口段、承接句、第五节补发默认值、收敛段两句）、`.github/workflows/release.yml`（dispatch 默认 tag 一行）、`README.md` / `README.zh-CN.md`（各 1 行，v0.2.9 → v0.2.11）、`src/main/release-packaging.test.ts`（+89/−44 重锚 + 1 例新断言）。

**关键判断**：
1. `latestPublishedTag` 由 `v0.2.9` 前移到 `v0.2.11`——v0.2.10 / v0.2.11 早已公开发布，旧锚点落后两版、README 第 5 行同步陈旧，故本轮 README 第 5 行是**纠错**而非「收敛轮不改此线」。
2. `previousPublishedTag` 保持 `'v0.2.8'`：前移会打断 v0.2.8 证据 describe、caps 断言与 README 负向链接断言。
3. v0.2.10 / v0.2.11 **没有** `docs/release-evidence/<tag>.md`，故「最新已验证证据」describe 钉死 `v0.2.9`（不新建证据文件），签名文档如实登记「尚未归档」。
4. v0.2.12 无任何内存 / 体积实测，current-notes 单位白名单必须是空数组。

**未纳入项**：打 tag / push / dispatch `Release` / 创建或修改 GitHub Release 与资产 / publish；不新建任何证据文件（含 `docs/release-evidence/v0.2.11.md`）；不改 `src/` 业务代码与 UI 行为；不重拍 README 截图；不做视觉 / 交互自测（`needSelfTest=false`）；v0.2.12 发布后的 README 第 5 行 + `latestPublishedTag` 收尾前移是独立动作。

## 交付后补充（同日）

- 触发：UI 第一期 L3 实机验收（打包态 `62b53e13`）在 **1024×900** 复现目录工作台首行工具栏溢出——`view-toolbar` `scrollWidth 1146 > clientWidth 1024`，末尾 `Load demo folder` 被推出视口，`960–1146` 区间均可复现（窗口 `minWidth 960`），亮 / 暗两套主题皆然，`1440` / `1920` 无违规。
- 动作：`docs/release-notes/v0.2.12.md`「本次变化 → 壳层五级重排」小节增一行 `窄窗口工具栏：目录工作台窄窗口（≤1024）首行工具栏溢出修复。`（仅 notes，不改 CHANGELOG、不加测试短语断言）。
- 边界：不写 `1146` / `960–1146` 等实测数字；不写「已发布 / 已修复 / 已通过 L3」完成态宣称；其余 14 条 AC 与既有断言逐条保留（`pnpm test src/main/release-packaging.test.ts` 202 passed、`pnpm test` 1245 passed + 1 skipped）。
- 待跟进：① 该行的「修复」以**独立缺陷项修复 commit 在本版 tag 之前合入 `main`** 为前提，未合入前 notes 属前瞻表述。② notes 与 `CHANGELOG## v0.2.12` 段在此条上暂不镜像；修复 commit 落地时应同批决定是否补 CHANGELOG，并考虑把「工具栏」加入 current-notes 短语白名单（届时须两处同时出现才不红）。
