# v0.2.14 版本收敛与双语发布说明收口（折叠未发布版本，发布前态，单提交）

- WI：`wi_ws_18f05d0f4d7d4087`
- 域：`release`（版本收敛轮：bump 待发版本 + 把**从未打 tag** 的 v0.2.13 段与双语 notes 整体改写 / 改名 + dispatch 默认 tag + 签名文档姿态段 + 测试锚点前移与折叠负向断言；不是发版 / 收尾轮）
- 来源：`.munk/changes/wi_ws_18f05d0f4d7d4087/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过，回归面全部落在 `code_gates`）

## 最近执行

- workItemId: wi_ws_18f05d0f4d7d4087
- at: 2026-10-31
- status: pass
- note: `code_gates` passed（10 gates，attempt 001 全 exit 0，`.munk/runs/run_ws_364bf322b360a39e/code-gates/attempts/001`）；`pnpm test` 91 files / 1362 passed + 1 skipped（1363），29.41s；UI 自测按 `needSelfTest=false` 跳过。改动面 10 个已跟踪路径 `+117/−74`：`package.json` 1/1、`CHANGELOG.md` 7/2、`.github/workflows/release.yml` 1/1、`docs/release-process.md` 1/1、`docs/release-signing.md` 3/3、`src/main/release-packaging.test.ts` 30/6，外加 notes 改名（删 `v0.2.13.md` / `v0.2.13.zh-CN.md` 各 30 行，新增 `v0.2.14.md` / `v0.2.14.zh-CN.md` 各 37 行）。两版 README、`docs/release-evidence/**` 零 diff；`docs/release-notes/v0.2.12.md` 及更早历史 notes 零改动；`src/` 仅动该测试文件。未打 tag、未 push、未 dispatch、未发布。

## 覆盖

`ac-version-single-source`、`ac-changelog-first-two-headings`、`ac-changelog-no-unpublished-segment`、`ac-changelog-history-bytes`、`ac-changelog-current-entry-structure`、`ac-changelog-covers-a`、`ac-changelog-keeps-013-facts`、`ac-changelog-banned-tokens`、`ac-notes-renamed-pair`、`ac-notes-mutual-links`、`ac-notes-section-order`、`ac-notes-013-never-published`、`ac-notes-covers-a`、`ac-notes-keeps-013-facts`、`ac-notes-banned-tokens`、`ac-readme-frozen`、`ac-signing-posture`、`ac-signing-published-frozen`、`ac-release-yml-default-only`、`ac-release-process-default`、`ac-test-prelaunch-anchor`、`ac-test-additive-only`、`ac-test-013-absence`、`ac-test-ghost-history-kept`、`ac-no-product-code`、`ac-evidence-frozen`、`ac-gates-10-green`、`ac-delivery-report`。

## 步骤

1. 开工三查：`git rev-parse HEAD`（`b8689db`）、`package.json#version === "0.2.13"`、`docs/release-notes/v0.2.13.md` 与 `.zh-CN.md` 存在、`.munk/code-gates.json` 为 10 门；主检出脏，业务文件与门禁一律在本 worktree 内读 / 跑。
2. `git status --porcelain` / `git diff --numstat`（含未跟踪）核对改动面恰为 prd 列的 7 项已跟踪文件 + notes 改名对。
3. `grep -n '^## v0' CHANGELOG.md`；脚本切片 `[## v0.2.14, ## v0.2.12)` 取当前段，核标题集合、事实 token、禁用词 / 单位数字 / 长 hex。
4. 读 `docs/release-notes/v0.2.14.md` / `.zh-CN.md`：核 H1、互链、四节顺序与各恰一次、`v0.2.13 was never published` / `0.2.13 未公开，其内容并入本版`、事实 token 与禁用 token。
5. `git diff docs/release-signing.md`：核 3 增 3 删、姿态标题 / 第五节默认 tag / 末尾收敛句三处指向 `v0.2.14`、`当前状态：v0.2.12 已发布` 与两份 v0.2.12 引用逐字保留、全文零 `0.2.13`。
6. `git diff .github/workflows/release.yml docs/release-process.md package.json`：各 1/1 且改动行即默认 tag / 版本；`--notes-file`、祖先门、签名检查、打包矩阵、单 Release 门零 diff。
7. `git diff --stat -- README.md README.zh-CN.md docs/release-evidence`：空输出（零 diff）；`sed -n '5p' README.md` 仍 `v0.2.12`。
8. `git diff src/main/release-packaging.test.ts`；`grep -c '  it('` / `grep -c 'expect('` 计数前后对照。
9. Host `code_gates`（10 gates，attempt 001）。

## 期望

① `package.json#version === '0.2.14'` 且该文件 numstat 恰 `1/1`。② `CHANGELOG.md` 前两个 `^## v*` 标题为 `## v0.2.14` → `## v0.2.12`，全文无 `^## v0.2.13`；`[## v0.2.14, ## v0.2.12)` 段内 `^## ` 标题集合恰 `['v0.2.14']`、含 `### 改进` / `### 不做的事` / `### 升级方式`，含 `顶栏` / `示例与调试` / `空态` / `scene` / `会话 tab` 与 `P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `共同祖先`，禁用词、`[0-9a-f]{40,64}`、尺寸数字全 0 命中。③ `## v0.2.12` 至文件尾零 diff（历史逐字不动）。④ 双语 notes 改名为 `v0.2.14.md` / `v0.2.14.zh-CN.md`（旧名两份均不存在），H1 各含 `v0.2.14`、互链各 1 条指向对方新文件名，四节顺序各恰 1 次；英文含 `top bar` / `Samples & debugging` / `empty state` / `scene` / `session tab` / `ancestor` / `v0.2.13 was never published`，中文含 `顶栏` / `示例与调试` / `空态` / `scene` / `会话 tab` / `共同祖先` / `0.2.13 未公开，其内容并入本版`；两版均不缺 `opacity-60` / `structured` / `semantic` / `9→10`，且 `已发布` / `已修复` / `已通过 L1` / `**Full Changelog**` / `releases/tag/` / 占位词 / 长 hex 全 0 命中。⑤ 两版 README 零 diff、第 5 行仍 `v0.2.12`、仍无版本表。⑥ `docs/release-signing.md` 3/3、姿态标题与第五节默认 tag 指向 `v0.2.14`、末尾收敛句同时含 `v0.2.14` / `docs/release-notes/v0.2.14.md` / `最新公开 Release 仍为 v0.2.12`，`当前状态：v0.2.12 已发布` 与两份 v0.2.12 引用逐字冻结，全文零 `0.2.13`。⑦ `release.yml` 与 `docs/release-process.md` 各 1/1 且只改 dispatch 默认 tag。⑧ 测试 `latestPublishedTag='v0.2.12'`、`previousPublishedTag='v0.2.8'`、`publishedTags` 不含 `v0.2.13`，仍保留 `not.toBe(currentTag)` / `isTagBefore === true` / `lastReleasedNotesPath !== releaseNotesPath`；`currentTag` 仍由 `package.json#version` 派生。⑨ 测试只增不减：`it(` 203 → **204**、`expect(` 876 → **882**，无删用例、无 `skip` / `only` / `todo`、无放宽为 `not.toContain` 的既有断言、无白名单扩容。⑩ `docs/release-evidence/**` 零 diff、`docs/release-evidence/v0.2.14.md` 不存在。⑪ 10 门全绿。⑫ 交付说明覆盖改动清单、锚点理由、计数、未纳入项与 `git diff --stat`。

## 断言与文档改动理由

1. **版本锚点**：`latestPublishedTag` 保持 `'v0.2.12'`、`currentTag` 由 `package.json` 派生（→ `v0.2.14`），`publishedTags` 不新增；版本门注释由「v0.2.13 pre-release wrap-up」改为「v0.2.14」，断言本体不动（`not.toBe` / `isTagBefore === true` 原样成立）。
2. **新增折叠常量**：`foldedTag = ['v0.2', '13'].join('.')` 与 `foldedNotesPath` / `foldedBilingualNotesPath` / `foldedReleaseLink` / `foldedEvidencePath` 全部运行时拼接——`v0.2.13` 的负向断言不得自匹配（prd「新增负向断言不得自匹配」）。
3. **新增用例** `folds the never-tagged version into the current entry and leaves no reference to it`：断言 CHANGELOG 无该版本标题、三类文档路径与 `releases/tag/v0.2.13` 链接均不存在、`documentPaths()` 扫描 offenders 为空；并在版本门用例补 `expect(publishedTags).not.toContain(foldedTag)`。
4. **`ghostTag` 历史原样保留**：`ghostTag = ['v0.2', '3'].join('.')` 与其全部既有断言（`## v0.2.4` 段含 `${ghostTag} 已合入但未发布`）逐字未动——两处同名拼接字面来自不同用途，不得合并或改名。
5. **三处 `changelog.slice` 结束端点**：保持显式 `changelog.indexOf('## v0.2.12')`（`latest === current` 时派生锚会切出空串假绿，本树 `latest` 落后 `current`，但显式端点仍是唯一安全写法）。
6. **两版 notes 改名**：`v0.2.13.md` / `.zh-CN.md` 删除、`v0.2.14.md` / `.zh-CN.md` 新增，互链改指新文件名；既有 bilingual notes 用例（互链 + 四节顺序 + 禁用 token）在派生锚下自动跟随。

**`it(` / `expect(` 计数**：基线（`b8689db`）= `203` / `876`；交付后 = `204` / `882`（净增 1 例、6 条断言，只增不减）。

**未纳入项**：打 tag / push tag / dispatch `Release` / 创建或修改 GitHub Release 与资产 / publish 一律不做；不新建 `docs/release-evidence/v0.2.14.md`；不改两版 README（第 5 行仍 `v0.2.12`、`latestPublishedTag` 仍 `v0.2.12`，无版本表）；不改 `docs/release-notes/v0.2.12.md` 及更早历史 notes；不改 `src/` 业务代码 / UI 行为 / 算法 / 快照格式 / 导出格式；不改 `.munk/code-gates.json`（保持 10 门）；不做浏览器 / 真机 / 桌面点选验收。

**风险**：v0.2.14 尚未打 tag——`latestPublishedTag !== currentTag` 仍是预期姿态；发版后的收尾（两版 README 第 5 行前移 + `latestPublishedTag` → `v0.2.14` + 三处 `slice` 端点重切 + 归档 `docs/release-evidence/v0.2.14.md`）是独立动作，且 v0.2.13 永不单独发布，收尾时不得为它补 notes / evidence / tag。
