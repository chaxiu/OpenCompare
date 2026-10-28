# v0.2.10 发布说明按实测回填（指示条 + 大文件窗口渲染）

## 范围

只做两件事：

1. 改写 `docs/release-notes/v0.2.10.md`（当前为 32 行旧口径：「点选跳转 = 设计行为、大行数未实测」+「L1 前待实机 / run id 待该场次回填」）。新口径：
   - 首段改为**两项**面向用户的变化：双栏侧边四态差异指示条 + 大行数双栏的可视窗口渲染。
   - 两项变化都给出绑定 run `trun_08764efa44c39426` + commit `2bcdc53e` 的实测事实：指示条 track 级命中 / 点选跳转、350,000 行文本模型下的可视窗口渲染行元素数、内存峰值、首开 ready。
   - 修复前对照（commit `4166c9b9` / run `trun_d63c3971b06ccfca`）明确标注为「另一次实测」，不与本版数字混写。
   - 未覆盖项（目录对比条目规模、HTML 报告导出、原生保存面板）如实另列，不写数值、不借 v0.2.9 的 358k 数字。
   - 保留 `## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式` 四个二级标题与既有短语表。
2. 同位调整 `src/main/release-packaging.test.ts` 中 `documents the current release notes with the ruler change and its stated limits` 用例（当前约 1676–1712 行）的两处断言：单位白名单改为精确有序白名单、`pendingParagraphs` 占位断言改为 run/commit 绑定断言。其余断言零改动。

## 验收

- ac-notes-two-user-changes: `docs/release-notes/v0.2.10.md` 第一个 `## ` 标题之前的首段同时出现「指示条」与「可视窗口」（或「窗口化」），且不再出现「只有一项面向用户的变化」。
- ac-notes-run-binding: 文件含 `trun_08764efa44c39426` 与 `2bcdc53e`，且不含 `L1 前待实机`、`run id 待该场次回填`。
- ac-notes-350k-model-phrasing: 含 `350,000 行文本模型（源码拼接）`；不含 `350k`、`35 万`、以及任何 `358` 开头数字（`358,249` / `358,155` / `358,208`）。
- ac-notes-ruler-click-measured: 指示条点选写为已验证，含 `106/210`、`3,590,120`、`179,506`、`6,967,840`、`rgb(76,141,255)`。
- ac-notes-ruler-zero-diff-noop: 含「0 差异文件点击为纯 NO-OP」的表述，段落内同时出现 `scrollTop` 与 `0 → 0`（或「不跳到第 0 行」）。
- ac-notes-virtual-window: `## 本次变化` 下存在独立 `###` 小节描述大行数可视窗口渲染，含 `39–49`（单栏实际渲染行元素数）与「与总行数无关」。
- ac-notes-memory-peaks-current: 含 `451.6 MiB`、`909.0 MiB`，同一段落含 `2.25 GiB` 与 `2.5 GiB`（护栏）以及「无 OOM」（或「无 renderer 重启」）。
- ac-notes-before-fix-separate: `350,152`、`9.29 GiB`、`9.62 GiB` 出现在同一段落，该段含 `4166c9b9` 或 `trun_d63c3971b06ccfca`，并出现「修复前」与「另一次实测」。
- ac-notes-aligned-rows-height: 含 `7,003,040` 与 `350,152` 对齐行 × 20 的表述（同段含 `350,152`、`对齐行`、`20`），不含 `7,000,000`。
- ac-notes-ready-time: 含 `471 ms` 与 `209 ms`。
- ac-notes-three-way-no-ruler: 含「三向合并」与「不显示」同段表述。
- ac-notes-sections-and-phrases: 四个二级标题 `## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式` 均存在；`指示条`、`四态`、`same`、`added`、`removed`、`modified`、`滚动`、`点选`、`跳转`、`minimap`、`不新增扫描`、`不改对比与合并算法` 全部可命中。
- ac-notes-uncovered-listed: 未覆盖范围段落含「未覆盖」或「另版实测」，并包含 `目录对比`、`HTML 报告`、`原生保存面板` 三项，且这些句子内不出现 `GiB`/`MiB`/`GB`/`MB` 数值。
- ac-notes-no-forbidden: 不含 `待验证`、`预计通过`、`应该通过`、`TODO`、`TBD`、`FIXME`、40–64 位十六进制串、`releases/tag/`。
- ac-test-unit-whitelist: 该用例的单位断言为 `expect(releaseNotes.match(/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g) ?? []).toEqual(['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB'])`——精确有序数组，不放宽为放宽包含、不新增 `MB` 项，并有注释说明这是 v0.2.10 已实测数字白名单。
- ac-test-binding-assertions: 该用例断言 `releaseNotes` 含 `trun_08764efa44c39426` 与 `2bcdc53e`，且不含 `L1 前待实机` / `run id 待该场次回填`；原 `pendingParagraphs` 段落级占位断言已删除（用例内不再出现 `pendingParagraphs` 标识符）。
- ac-test-rest-untouched: 该用例原有 `firstHeading(releaseNotes)` / 短语表 / `待验证` / `预计通过` / `应该通过` / `TODO|TBD|FIXME` / 40–64 hex 断言仍在；`restates the report caps…` 用例的 `200,000` / `10 MB` 禁入断言与 v0.2.9 历史 notes 用例的断言零改动（用例名与断言文本不变）。
- ac-diff-scope: `git diff --name-only` 恰好为 `docs/release-notes/v0.2.10.md` 与 `src/main/release-packaging.test.ts` 两行；`package.json` 的 `version` 仍为 `0.2.10`，`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/release-evidence/**`、其它 `src/**`、`.github/workflows/**`、`.munk/code-gates.json` 无 diff。
- ac-gates-green: `.munk/code-gates.json` 全部 gate（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿。

## 非目标

- 不碰版本号与发布动作：`package.json#version`、任何 tag、发布流程、`.github/workflows/**` 零改动。
- 不改 `CHANGELOG.md`：当前 v0.2.10 changelog 条目保持原样（其断言在另一用例，必须继续可过）。
- 不新增 `docs/release-evidence/v0.2.10.md`，不改任何 release-evidence 文件。
- 不改 README / README.zh-CN，不做发布后收尾（README 版本行、`latest === current` 翻面）。
- 不改 `.munk/code-gates.json`，不新增或放宽 gate。
- 不改指示条 / DiffPane 实现与任何其它 `src/**`：本项只动发布说明与那一个测试用例的两处断言。
- 不为目录对比条目规模、HTML 报告导出、原生保存面板写本版实测数值或新结论；不引用 v0.2.9 的 358k 数字。
- 不做实机 / 浏览器 / 桌面点选验证，不新增外部链接或发布承诺。
- 不新增依赖、不改构建配置。

## 实现约束

- **树前置校验**：动手前确认工作区是 v0.2.10 树（`package.json#version === "0.2.10"` 且 `docs/release-notes/v0.2.10.md` 存在）；若为 0.2.9 树，停止上报，不得新建/改写发布说明。
- **唯一实测来源**：本版两项变化统一标注 run `trun_08764efa44c39426` + commit `2bcdc53e`；修复前对照只可引 commit `4166c9b9` / run `trun_d63c3971b06ccfca`，并明确写为「另一次实测」。
- **六个带单位数字各出现且仅出现一次，文中顺序固定**：`451.6 MiB` → `909.0 MiB` → `2.25 GiB` → `2.5 GiB` → `9.29 GiB` → `9.62 GiB`。不要重复堆叠同一数字（会让有序白名单断言失败）。
- **350k 口径**：一律写「350,000 行文本模型（源码拼接）」，不写「350k」「35 万」，不写成目录条目规模。
- **内容高度口径**：总高 = 内部对齐行数 × 20，写 `7,003,040` = `350,152` 对齐行 × 20（含 150 行 filler 补齐右侧插入块），两栏严格相等；不得写 `7,000,000`，不得把 `350,152` 说成源文件行数。
- **结构**：大行数渲染作为 `## 本次变化` 下的独立 `###` 小节；实测数字可用小表格，但必须满足上面的顺序约束。
- **测试改动最小化**：只动那一个用例的两处断言，且在交付说明中逐条写明改了哪个断言、为什么改；其它用例保持字面不变。
- 不使用 emoji；不新增外部链接。
