# v0.2.10 发布说明键盘跳转口径修正（点选已实测 / 键盘未覆盖）

- WI：`wi_ws_c2c193cd78e46d26`（`key: v0210-notes-keyboard-caliber`）
- 域：`release`（发布说明文案项；不是版本收敛轮、不是发布收尾轮、不是 B / C 的实现轮）
- 来源：`.munk/changes/wi_ws_c2c193cd78e46d26/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）
- 提交：本 worktree 单提交（父基线 `591a8b1ac5a233825059a5cf96fe5897888a1c2d`，即上一轮 notes 按实测回填的 delivery merge）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-first-para-click-only | 首段（第 3 行）改为「……点选跳转在大行数双栏上已实测可用；……」；`grep -c "点选与键盘跳转"` 全文 0；首段仍含 `350,000 行文本模型（源码拼接）` 与 `三向合并侧不显示指示条` | 满足 |
| ac-keyboard-not-measured-in-first-para | 首段已无 `键盘` 二字（第 12 行 bullet 才是键盘描述处），`grep -E "键盘[^。]*(已实测\|已验证\|实测可用)"` 全文零命中 | 满足 |
| ac-bullet-keyboard-capability-kept | 第 12 行 bullet 逐字含 `指示条可聚焦`、`方向键在差异块之间循环`、`回车重新定位当前块`（顺序未变，原文未改） | 满足 |
| ac-bullet-keyboard-not-covered | 同 bullet 在能力句之后追加「键盘导航（方向键 / 回车）本次实测未覆盖。」——同一句含 `键盘` + `未覆盖` 且点名 `方向键` / `回车`；`/点选与键盘跳转/` 与 `/键盘[^。]*(?:已实测\|已验证\|实测可用)/` 均 0 命中 | 满足 |
| ac-click-facts-intact | `track 608px`、`bandHeight 4`、`106/210`、`3,590,120 = 179,506 × 20`、`209/210`、`6,967,840`、`rgb(76,141,255)`、`trun_08764efa44c39426`、`2bcdc53e` 逐字在位（该 bullet 除新增一句外字符序列未动） | 满足 |
| ac-units-whitelist-order | `grep -oE "\d+([.,]\d+)?[[:space:]]*(GiB\|MiB\|GB\|MB)"` 输出恰为 `451.6 MiB` / `909.0 MiB` / `2.25 GiB` / `2.5 GiB` / `9.29 GiB` / `9.62 GiB`（六项、文序一致、各一次，无新增 `MB`） | 满足 |
| ac-height-clause-intact | 第 18 行仍含 `总高 7,003,040px = 350,152 对齐行 × 20` 与 `350,152 是内部对齐行数（含 150 行 filler 补齐右侧插入块）`；`7,000,000` 0 命中；未出现「350,152」作源文件行数的表述 | 满足 |
| ac-uncovered-kept | 第 36 行未覆盖段逐字保留三项（`目录对比在条目规模上的表现`、`HTML 报告导出`、`原生保存面板的手工操作`），该段无 `358k` / `358,` 类数字、无单位数值 | 满足 |
| ac-structure-kept | `grep -n "^##"` 依次为 `本次变化`（5）/ `不做的事`（23）/ `风险与验证规模`（30）/ `升级方式`（38）；`### 大行数双栏改为可视窗口渲染`（15）保留；13 项短语（`指示条` 11 次、`四态` 4、`same`/`added`/`removed`/`modified` 各 1、`滚动` 3、`点选` 4、`跳转` 4、`minimap` 1、`不新增扫描` 1、`不改对比与合并算法` 1、`升级方式` 1）全部可命中 | 满足 |
| ac-placeholder-free | `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` / `L1 前待实机` / `run id 待该场次回填` 与 `[0-9a-f]{40,64}` 全部 0 命中 | 满足 |
| ac-diff-scope | `git diff --name-only` 恰为 `docs/release-notes/v0.2.10.md`；`git status --porcelain` 产品面只有该文件（另有未跟踪的 `.munk/changes/wi_ws_c2c193cd78e46d26/`）；`src/main/release-packaging.test.ts` / `package.json` / `CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `docs/release-evidence/**` / 其它 `src/**` 零 diff | 满足 |
| ac-diff-two-hunks | **未满足（AC 互斥，交付时如实记录）**：`git diff -U0` 为 3 处 hunk —— 第 3 行首段、第 12 行 bullet、第 32 行 `## 风险与验证规模` 首段（`点选与键盘跳转接线` → `点选 / 键盘跳转接线`）。原因：`ac-bullet-keyboard-not-covered` 要求全文 `/点选与键盘跳转/` 零命中，而第 32 行原本就含该短语，不碰它必然命中；取绝对负向断言优先，第三处只拆并列词、事实与数字不变。第 13 行零差异 bullet、`### 大行数` 小节、修复前对照段、未覆盖段均未被触碰 | 部分满足（记录偏差） |
| ac-gates-green | `.munk/runs/run_ws_66532ae174593307/code-gates/attempts/001`：9 道 gate 全 `passed` / exit 0（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）；`pnpm test` 69 files / 1104 passed + 1 skipped（1105），`src/main/release-packaging.test.ts` 199 tests 全绿且该文件零 diff，`documents the current release notes with the ruler change and its stated limits` 在新文案下继续通过 | 满足 |

## 偏差记录（prd AC 自相矛盾）

- `ac-diff-two-hunks`（变更仅落在两处）与 `ac-bullet-keyboard-not-covered`（全文 `/点选与键盘跳转/` 零命中）**不可能同时成立**：原文 `## 风险与验证规模` 首段写「指示条、点选与键盘跳转接线」，该短语属全文范围。
- 落地选择：保留 `ac-bullet-keyboard-not-covered`（唯一的绝对负向断言、直接约束对外文案不得把点选与键盘绑成同一已实测结论），把该句拆为「点选 / 键盘跳转接线」；事实（改动只落在渲染层、不触碰算法）与数字均未变。
- 备选方案及其代价：回退第 32 行则 `/点选与键盘跳转/` 命中，等于对外仍把键盘算进同一句已实测口径——与本次修正目的相反，故不采用。

## 最近执行

- workItemId: wi_ws_c2c193cd78e46d26
- at: 2026-10-28
- status: pass（1 条 AC 按互斥说明记「部分满足」，非功能缺陷）
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_66532ae174593307/code-gates/attempts/001`，全 exit 0；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105，`src/main/release-packaging.test.ts` 199 tests）。静态核对：`git diff --name-only` 恰为 `docs/release-notes/v0.2.10.md`（+3/−3）；测试文件、`package.json`、`CHANGELOG.md`、两版 README、`docs/release-evidence/**` 零 diff。grep 取证：`/点选与键盘跳转/`、`/键盘[^。]*(已实测|已验证|实测可用)/`、六个单位数字外的新单位数字、禁用词与 40–64 位十六进制串全零命中。边界：本项只改文案，不重跑实测、不判定键盘是否真的可用；若后续场次拿到键盘实测结论，需另开 WI 回填并补 run / commit 绑定。
