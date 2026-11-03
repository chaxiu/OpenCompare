# 三向合并写入历史与一键重开

## Scope

关闭「真实三向合并 ↔ 最近历史 ↔ 一键重开」闭环中最后一个未对齐的口径：**开关保真**。

基线核查（HEAD `8f043f9`）：前序 `wi_ws_b606fdf77631423e` 已交付真实三向入口、`kind: 'merge'` 历史写入（`paths = [base, ours, theirs]`）、空态历史行（类型 + 三条路径 ` ↔ ` + 时间 + 重开 / 移除）、重启后重开重读三文件、复用 `merge:` tab id、同 trio 不新增重复条目、失败不建 tab。因此本项**不重做**这些链路，只修一处真实缺陷并补齐回归：

1. 缺陷：`Workbench.openMergeRequest` 记录历史时固定取当前 shell 开关；`reopenHistoryEntry` 的 merge 分支丢弃 `plan.switches`。结果是「建立时开关 A → 重启（shell 回默认）→ 重开」后该条目的三项开关被默认值覆盖，且条目记录的开关从未被应用回来。本项让 merge 重开与 directory / file 同口径：成功重开后条目开关逐项保持原值，shell 三项开关恢复为条目值。
2. 回归覆盖补齐：重启（重新挂载）后重开 merge 的路径 / 开关逐项一致、三栏与冲突块按磁盘最新内容重建、tab id 复用、单条不重复；与目录 / 文件历史条目共存且互不影响；失败保持原子性；全程不出现第二条历史存储或解析入口。

## Acceptance Criteria

- ac-merge-entry-written-with-shell-switches: 在 shell 开关为非默认组合时建立真实三向合并，相对建立前恰新增 1 条 `kind: 'merge'` 条目，`paths` 逐项等于 `[base, ours, theirs]` 真实绝对路径，三项开关逐项等于建立时 shell 开关（至少覆盖一个非默认组合）。
- ac-merge-reopen-keeps-entry-switches: 关闭全部 tab 并重新挂载（shell 三项开关回默认）后点重开该 merge 条目：条目 `id` 不变、`createdAt` 变大、条目三项开关逐项等于重启前值，未被默认值覆盖。
- ac-merge-reopen-applies-shell-switches: 同一重开成功后，shell 三项开关逐项等于条目值（以重开后新建立一个不同 trio 的 merge 条目、其记录开关逐项相等来观测）。
- ac-merge-reopen-rereads-and-reuses-tab: 重开前改写三个文件正文（冲突块数量随之变化）：重开后恰 1 个 merge tab、`data-session-tab` 与重启前相同、三栏文本逐字等于磁盘最新内容、状态栏冲突块数等于 `buildMergeModel` 对新内容的结果。
- ac-merge-reopen-single-row: 同一 trio 重启后再重开两次，历史中该 trio 恰 1 条且 `id` 不变，tab 数不增加（仍为 1）。
- ac-merge-reopen-failure-atomic: 删除任一侧后重开：tab 数不变、历史清单（条目数 / 顺序 / 每条字段含开关）序列化前后逐字相等、shell 开关不变，只出现一条 zh / en 成对且不含真实绝对路径的失败提示。
- ac-merge-coexists-directory-file: 历史中同时存在 `directory` / `file` / `merge` 各 1 条时：重开 merge 后目录 / 文件两条字段与相对顺序逐项不变；再重开其中一条 directory / file 后 merge 条字段不变；三条行文本分别保持各自类型的完整路径串，merge 行为三条路径以 ` ↔ ` 连接。
- ac-history-single-store: 建立 / 重启 / 重开 / 失败全过程 `localStorage` 键集合恒为 `['opencompare.comparisonHistory']`（无第二个历史键、无第二份解析写入）。
- ac-no-path-in-console: 建立、重启、重开、失败全过程捕获 renderer console，输出中不出现任一侧真实绝对路径。

## Non-Goals

- 不重做真实三向入口、`mergeRequest` 归一化 / 校验、`buildMergeSession`、`CodeMergeView` 合并算法、merge 会话 id 规则、标题 / 副标题派生、状态栏冲突计数通道（前序已交付，只做回归断言）。
- 不改历史模型 / 存储通道 / 上限 / 去重 / 移除 / 清空 / `error` 标记 / 列表 UI 结构 / 时间格式化；不新增历史界面元素与按钮。
- 不新增可见文案（预期零 i18n 改动；若确需新增，必须 zh / en 成对）。
- 不把三项开关持久化到 `settings.json`：shell 开关仍是运行期状态，本项只做「重开成功后恢复」。
- 不新增 `.munk/code-gates.json` gate 行，不改 `src/munk-gates.test.ts` 期望矩阵；新增断言并入既有 `test` 覆盖（扩展 `mergeSession.dom.test.tsx`）。
- 不改目录 / 文件对历史语义、快照、导出、发布面、版本号与 CHANGELOG；不改内置样本入口。
- 不做浏览器 / 设备 / 桌面 GUI 验收；`docs/screenshots.md` 重钉是仓库既有 gate 的合规步骤，不是验收项。
- 不修改 `src/renderer/src/App.test.tsx`（2959 行上限只降不升）。

## Implementation Constraints

- 文件锚点（复用在位实现，不新造第二套）：
  - `src/renderer/src/workbench/Workbench.tsx`：`openMergeRequest(paths, onError, switches = comparisonSwitches)`；成功后用该 `switches` 调 `recordHistory('merge', [base, ours, theirs], switches)`，`upsertSession` 之后再 `setComparisonSwitches(switches)`（fresh 建立时传入当前值，等价 no-op）。
  - `reopenHistoryEntry` 的 `plan.kind === 'merge'` 分支把 `plan.switches` 传给 `openMergeRequest`，并只在 `openMergeRequest` 返回 `true` 时 `setComparisonSwitches(plan.switches)`；失败分支保持「不建 tab / 不写历史 / 不改 shell 开关 / 不改其它条目」。
  - 重开入参继续走 `resolveComparisonHistoryReopen`，去重与写入继续走 `upsertComparisonHistory` / `historyCandidate` / `historyIdFor`；禁止在 renderer 另写解析、排序或第二套去重。
  - 失败时的提示继续复用 `shell.history.reopenFailed` 与 `mergeSessionErrorMessage`，不新增文案键。
- 原子性顺序：先读齐三侧 → 写历史 → 提交会话 → 最后恢复 shell 开关；任一步失败都不得留下半成品 tab、历史改动或开关变更。
- 测试落位：
  - 扩展 `src/renderer/src/workbench/mergeSession.dom.test.tsx`（复用既有 `trioPort` / `openDialog` / `fill` / `rows` / `reopenButton` / `readHistory` 助手）：用 `unmount()` + `renderWithI18n(<Workbench platform={port} />, 'zh')` 模拟重启；用 `port.writeComparisonHistory([...])` 预置非默认开关的 merge 条目来覆盖「重启后条目开关不被覆盖」；用既有文件对 + `[data-code-switch]` 开关切换来覆盖「建立时记录非默认开关」。
  - 共存用例可放同一文件，预置 1 条 `directory` + 1 条 `file` + 1 条 `merge`，断言重开后彼此的 `id` / `createdAt` / 开关 / 顺序不变。
  - 既有测试只追加 / 最小改动，不整文件重写，不为凑绿放宽门禁。
- 契约文档同步：`.munk/baseline/domains/merge-session/product.md` 中「merge 会话不消费三项对比开关，重开也不改写 shell 开关」需改写为新契约（重开成功后条目开关保持、shell 开关恢复为条目值），避免基线与实现冲突。
- `test-debt`：新增用例后运行 `node scripts/test-debt-gate.mjs`，按实测在 `.munk/baseline/test-debt.json` 增加 `growth` 条目（`metric: repoTestLines`，单次增幅 ≤ 400 行）并上调 `floors.repoTestCases`；`appTestLines` 只降不升。
- 截图 provenance（仓库既有硬 gate）：本项改 `src/renderer/**` 即触发 `src/main/release-artifacts-and-brand.test.ts`，必须在提交 renderer 改动后重跑 `pnpm build` + `node scripts/capture-readme-screenshots.mjs`，并用产出的 captured commit 与两图 sha256 重钉 `docs/screenshots.md`（保留既有 token 与复现命令，不虚构差异）。
- 验证口径：`pnpm lint`、`pnpm typecheck`、`pnpm test` 与全量 `code_gates` 通过即可；不需要人工确认、浏览器或桌面 GUI 验证。
