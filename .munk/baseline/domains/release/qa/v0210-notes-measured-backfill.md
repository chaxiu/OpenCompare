# v0.2.10 发布说明按实测回填（指示条 track 级点选 + 大行数可视窗口渲染）

- WI：`wi_ws_41de569bb430c906`（`key: v0210-notes-measured-backfill`）
- 域：`release`（发布说明文案 + 单条既有用例两处断言；不是版本收敛轮、不是发布收尾轮）
- 来源：`.munk/changes/wi_ws_41de569bb430c906/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）
- 提交：本 worktree 单提交（父基线 HEAD `2bcdc53e04127191dea09e4b11dddbf792e237c7`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-notes-two-user-changes | `docs/release-notes/v0.2.10.md` 第 3 行首段（第一个 `## ` 之前）同时含「指示条」与「可视窗口」；`只有一项面向用户的变化` 零命中 | 满足 |
| ac-notes-run-binding | 文件含 `trun_08764efa44c39426`（2 处：点选条目 + 风险段）与 `2bcdc53e`（2 处）；`L1 前待实机` / `run id 待该场次回填` 零命中 | 满足 |
| ac-notes-350k-model-phrasing | 4 处 `350,000` 全部与「行文本模型（源码拼接）」同句；`350k` / `35 万` / `358` 零命中 | 满足 |
| ac-notes-ruler-click-measured | 点选条目标题 `**点选跳转（已实测）**`，同条含 `106/210`、`3,590,120`、`179,506`、`6,967,840`、`rgb(76,141,255)`，并写明 track 608px / bandHeight 4 与「两栏 scrollTop 相等」 | 满足 |
| ac-notes-ruler-zero-diff-noop | 独立条目「零差异文件为纯 NO-OP」，同条含 `scrollTop` 与 `0 → 0` 及「不跳到第 0 行」 | 满足 |
| ac-notes-virtual-window | `## 本次变化` 下新增独立 `### 大行数双栏改为可视窗口渲染`；窗口渲染条含 `39–49` 与「与总行数无关」 | 满足 |
| ac-notes-memory-peaks-current | 「内存与首开」单段含 `451.6 MiB`、`909.0 MiB`、`2.25 GiB`、`2.5 GiB` 与「无 OOM，无 renderer 重启」 | 满足 |
| ac-notes-before-fix-separate | 独立段「修复前对照（另一次实测）」含 `350,152`、`9.29 GiB`、`9.62 GiB` 与 `4166c9b9` / `trun_d63c3971b06ccfca`，明写「不与上面本版数字混算」 | 满足 |
| ac-notes-aligned-rows-height | 「内容高度」条含 `7,003,040` 与 `350,152 对齐行 × 20`、`150 行 filler`、`不是单侧源文件行数`；`7,000,000` 零命中 | 满足 |
| ac-notes-ready-time | 「内存与首开」条含 `471 ms` 与 `209 ms`（首开 / 热重开） | 满足 |
| ac-notes-three-way-no-ruler | 首段与「常驻可见」条均写「三向合并」+「不显示」 | 满足 |
| ac-notes-sections-and-phrases | 四个二级标题 `## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式` 齐全且顺序未变；`指示条` / `四态` / `same` / `added` / `removed` / `modified` / `滚动` / `点选` / `跳转` / `minimap` / `不新增扫描` / `不改对比与合并算法` 全部命中（`grep -c` = 11 / 4 / 1 / 1 / 1 / 1 / 3 / 4 / 4 / 1 / 1 / 1） | 满足 |
| ac-notes-uncovered-listed | 「未覆盖：……」单段含「未覆盖」与 `目录对比`、`HTML 报告`、`原生保存面板`，该段零 `GiB` / `MiB` / `GB` / `MB` 数值 | 满足 |
| ac-notes-no-forbidden | `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` / 40–64 位十六进制串 / `releases/tag/` 全部零命中 | 满足 |
| ac-test-unit-whitelist | `src/main/release-packaging.test.ts:1702` 为 `expect(releaseNotes.match(/\d+(?:[.,]\d+)?\s*(?:GiB\|MiB\|GB\|MB)/g) ?? []).toEqual(['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB'])`——精确有序数组，注释写明这是 v0.2.10 已实测数字白名单；不新增 `MB` 项 | 满足 |
| ac-test-binding-assertions | 同用例断言含 `trun_08764efa44c39426` / `2bcdc53e`，负断言 `L1 前待实机` / `run id 待该场次回填`；`pendingParagraphs` 标识符全文件零命中（原占位段落级断言已删） | 满足 |
| ac-test-rest-untouched | 该用例的 `firstHeading(releaseNotes)` / 短语表 / `待验证` / `预计通过` / `应该通过` / `TODO\|TBD\|FIXME` / `[0-9a-f]{40,64}` 断言原样在位；diff 只有该用例一个 hunk（+9/−12），`restates the report caps…` 与 v0.2.9 历史 notes 用例零改动；`it(` 数 199 不变 | 满足 |
| ac-diff-scope | `git diff --name-only HEAD` 恰为 `docs/release-notes/v0.2.10.md` 与 `src/main/release-packaging.test.ts`；`package.json#version` 仍 `0.2.10`；`CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `docs/release-evidence/**` / 其它 `src/**` / `.github/workflows/**` / `.munk/code-gates.json` 零 diff | 满足 |
| ac-gates-green | `.munk/code-gates.json` 9 道门全 passed（attempt 001，`.munk/runs/run_ws_4041eefcf19e3c8b/code-gates/attempts/001`）：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 全 exit 0 | 满足 |
| 范围守门 | 未碰指示条 / DiffPane 实现与其它 `src/**`、未改版本号 / tag / workflow / `code-gates.json`、未新增依赖、未为未覆盖项（目录条目规模 / HTML 报告 / 原生保存面板）写本版数值或引用 v0.2.9 的 358k 数字 | 满足 |

## 最近执行

- workItemId: wi_ws_41de569bb430c906
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_4041eefcf19e3c8b/code-gates/attempts/001`，全 exit 0；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105，`release-packaging.test.ts` 199 tests）。静态核对：`git diff --name-only` 恰两文件；单位白名单按文档顺序恰为 `['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB']`；禁用词 / 十六进制串 / `releases/tag/` / `350k` / `358` / `7,000,000` 全零命中。口径变化要点：原「已实测只有打开 + 滚动同步」的保守口径被真实场次推翻——指示条点选（track 级命中）与大行数窗口渲染都拿到了实测数字，故 notes 与那一个用例同步从「占位待回填」翻为「run/commit 绑定的实测事实」；未覆盖项（目录对比条目规模、HTML 报告导出、原生保存面板）如实另列且不写数值。
