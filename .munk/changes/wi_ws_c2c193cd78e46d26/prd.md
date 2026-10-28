# 修正发布说明的键盘跳转实测口径

## 范围

只改 `docs/release-notes/v0.2.10.md` 的两处表述，把「键盘跳转」从「已实测」降回「未覆盖」：

1. **首段（第 3 行）**：`点选与键盘跳转在大行数双栏上已实测可用` → 改为仅点选已实测（如 `点选跳转在大行数双栏上已实测可用`）。该段其余文字（两项变化、350,000 行文本模型（源码拼接）、三向合并不显示指示条、算法 / 扫描 / 快照未改）逐字不变。
2. **指示条点选小节（第 12 行 bullet）**：保留既有键盘能力描述（`指示条可聚焦`、`方向键在差异块之间循环`、`回车重新定位当前块`）原文不动，并在该 bullet 内补一句明示「键盘导航本次实测未覆盖」（点名方向键 / 回车，语义 = 本次实测未覆盖键盘导航）。该 bullet 的实测数字、track 608px / bandHeight 4、active 与 scrollTop 全部事实、描边 rgb、run / commit 绑定逐字不变；标题 `点选跳转（已实测）` 保持原文（其「已实测」限定点选）。

改完重跑 `code_gates`。本项无代码改动，`src/main/release-packaging.test.ts` 与其它任何文件零改动。

## 验收

- ac-first-para-click-only: `docs/release-notes/v0.2.10.md` 首段（`# OpenCompare v0.2.10 发布说明` 之后的第一个正文段）不再出现 `点选与键盘跳转`，且含 `点选跳转` 与 `已实测` 的同句表述；首段仍含 `350,000 行文本模型（源码拼接）` 与 `三向合并侧不显示指示条`。
- ac-keyboard-not-measured-in-first-para: 首段任一 `键盘` 出现处，同句（以 `。` 断句）内不得出现 `已实测` / `实测可用` / `已验证`。
- ac-bullet-keyboard-capability-kept: 指示条点选 bullet 仍逐字含 `指示条可聚焦`、`方向键在差异块之间循环`、`回车重新定位当前块` 三个短语。
- ac-bullet-keyboard-not-covered: 同一 bullet 内新增一句明示键盘未覆盖：含 `键盘` 与 `未覆盖`（或 `未实测`）同句，且该句点名 `方向键` 或 `回车`；全文匹配 `/键盘[^。\n]*(?:已实测|已验证|实测可用)/` 无命中，`/点选与键盘跳转/` 无命中。
- ac-click-facts-intact: bullet 内仍含 `track 608px`、`bandHeight 4`、`106/210`、`3,590,120 = 179,506 × 20`、`209/210`、`6,967,840`、`rgb(76,141,255)`、`trun_08764efa44c39426`、`2bcdc53e`，数值逐个字面一致。
- ac-units-whitelist-order: 全文 `/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g` 匹配结果恰为 `['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB']`（六项、文序固定、各出现一次，无新增单位数字）。
- ac-height-clause-intact: 仍含 `7,003,040px = 350,152 对齐行 × 20` 与 `350,152 是内部对齐行数`；不含 `7,000,000`，不把 `350,152` 表述为源文件行数。
- ac-uncovered-kept: `## 风险与验证规模` 内未覆盖三项（目录对比在条目规模上的表现、HTML 报告导出、原生保存面板的手工操作）逐字保留，且不出现 `358k` 或 `358,` 类规模数字。
- ac-structure-kept: 四个 `##` 标题仍依次为 `本次变化` / `不做的事` / `风险与验证规模` / `升级方式`；`### 大行数双栏改为可视窗口渲染` 子节保留；短语 `指示条` `四态` `same` `added` `removed` `modified` `滚动` `点选` `跳转` `minimap` `不新增扫描` `不改对比与合并算法` `升级方式` 全部仍可命中。
- ac-placeholder-free: 全文不含 `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` / `L1 前待实机` / `run id 待该场次回填`，且不含 40–64 位十六进制串。
- ac-diff-scope: `git diff --name-only` 与 `git status --porcelain` 的产品面改动仅 `docs/release-notes/v0.2.10.md`；`src/main/release-packaging.test.ts`、`package.json`、`CHANGELOG.md`、`README*`、`docs/release-evidence/**` 与其它 `src/**` 零改动。
- ac-diff-two-hunks: `git diff -U0 -- docs/release-notes/v0.2.10.md` 的变更仅落在首段行与指示条点选 bullet 行两处（不触碰第 13 行零差异 bullet、`### 大行数` 小节、修复前对照段与未覆盖段）。
- ac-gates-green: `.munk/code-gates.json` 的 9 道 gate（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部通过，其中 `test` 里 `documents the current release notes with the ruler change and its stated limits` 用例在测试文件零改动的前提下继续绿。

## 非目标

- 不改 `src/main/release-packaging.test.ts`（不新增 / 不放宽 / 不删除任何断言；本项纯文本修正，现有断言已覆盖）。
- 不改其余 8 份历史发布说明、`docs/release-evidence/**`、`README.md` / `README.zh-CN.md`、`CHANGELOG.md`、`package.json#version`，不打包、不打 tag、不发布。
- 不改其它任何正文事实：不重写实测数字、不调整章节顺序、不补充新证据、不新增外部链接或承诺。
- 不新增任何带单位数字或长十六进制串；不为「键盘未覆盖」单开新小节（只在原 bullet 内补一句）。
- 不重跑产品实测、不做浏览器 / 真机 / 桌面点选验证（键盘是否真的可用不在本项判定范围，本项只修文案口径）。
- 不顺手优化措辞、不统一标点、不重排 bullet 顺序。

## 实现约束

- 唯一允许改动文件：`docs/release-notes/v0.2.10.md`。
- 改动面极小：两处（首段一处、指示条点选 bullet 一处），每处只做「降级实测口径」所需的最小替换 / 追加；其余行必须逐字保持。
- 受既有测试硬约束：短语表 13 项必须仍可命中（尤其 `点选`、`跳转`），六个带单位数字各出现一次且顺序固定，run `trun_08764efa44c39426` 与 `2bcdc53e` 必须保留。
- 措辞保持原文件书面中文与原文标点风格，使用 `（源码拼接）` 等既有短语，不引入英文混排新术语。
- 交付说明逐条写明改了哪两处、为何改、以及 `release-packaging.test.ts` 零改动的依据（哪个已有断言覆盖了新口径）。
