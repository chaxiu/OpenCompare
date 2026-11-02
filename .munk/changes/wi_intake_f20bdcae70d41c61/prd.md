# 目录对比四态用词改为「左独有 / 右独有」

## 范围

修复 L3 实机场次（trun_2e62f1ddce9f38c4 leg4，基线 main `694d5ab`）暴露的目录对比展示缺陷：目录视图把文件级 `added` / `removed` 直接显示成「新增 / 删除」，导致右侧独有被读成 Added。目录对比的四个状态语义本来就与过滤页签一致（`added` = 右侧独有，`removed` = 左侧独有，见 `src/core/directory/compare.ts` 顶部注释与 `src/core/directory/filter.ts` 的 `matchesFilter`），本次只把**展示词**对齐到既有过滤页签词表。

改动面限定为三处目录展示 + 对应测试：

1. **行徽标**：`TreeView` 渲染的目录行 `DiffBadge`（`src/renderer/src/components/TreeView.tsx`）改用目录词表。
2. **目录视图四态图例**：`DirectoryView` 工具栏内的 `CompositionLegend`（`src/renderer/src/views/DirectoryView.tsx`，`visibleCounts`）改用目录词表。
3. **壳层状态栏四态图例**：`Workbench` 底部 `StatusBar` 的 `CompositionLegend`（`src/renderer/src/workbench/Workbench.tsx`，directory 场景的 `legend`）改用同一目录词表，保证 L3 看到的「状态栏图例」不再出现 Added。

词表复用既有 i18n 条目，不新造说法：

- `same` → `directory.filter.same`（en `Same` / zh `相同`）
- `added` → `directory.filter.rightOnly`（en `Right only` / zh `右独有`）
- `removed` → `directory.filter.leftOnly`（en `Left only` / zh `左独有`）
- `modified` → `common.diff.modified`（en `Modified` / zh `修改`）

中文沿用现有过滤页签的「左独有 / 右独有」（属性要求的“或与现有 i18n 既有词条一致”），不新增「仅左侧独有」这一第四套说法。目录词表必须只有**一个**映射源，三处展示共用；`DiffBadge` / `CompositionLegend` 的通用默认词表保持原样，文本 / 代码 diff 完全不受影响。

## 验收

- ac-right-only-row-badge: 构造「左目录无、右目录有 `探针.txt`」的目录对比（jsdom）：右上树中含 `探针.txt` 的行，其徽标文本在 en 下恰为 `Right only`、zh 下恰为 `右独有`；该行文本不含 `Added` / `新增`；左树不渲染该行。
- ac-left-only-row-badge: 对称用例（左独有文件）：左树该行徽标 en 为 `Left only`、zh 为 `左独有`，不含 `Removed` / `删除`；右树不渲染该行。
- ac-directory-toolbar-legend: 目录视图内 `CompositionLegend` 四个状态各自呈现 `Same` / `Right only` / `Left only` / `Modified`（en）与 `相同` / `右独有` / `左独有` / `修改`（zh），数值与该视图的 `visibleCounts` 相等（按状态断言，不绑定横向顺序）；图例内不出现 `Added` / `Removed` / `新增` / `删除`。
- ac-directory-legend-under-filter: 切到 `right-only` 过滤后，图例中 `added` 对应项标签为 `Right only` / `右独有`、数值为 1，且图例全文无 `Added` / `新增`；切到 `left-only` 后 `removed` 项标签为 `Left only` / `左独有`、数值为 1，无 `Removed` / `删除`（复现 L3「Right only 过滤下图例仍是 1Added」并钉死修复）。
- ac-shell-statusbar-legend: 以 directory 会话渲染完整 `Workbench`：底部 `StatusBar` 的图例同样使用目录词表（`Right only` / `Left only` 与 zh 对应词），不出现 `Added` / `Removed`；其数值与工具栏图例一致。该断言必须覆盖壳层状态栏，而非只测 `DirectoryView` 内部图例。
- ac-text-diff-labels-untouched: 文本 / 代码 diff 路径保持原词：默认 `DiffBadge` 仍显示 `Added` / `Removed` / `Modified`（zh `新增` / `删除` / `修改`），`CodeView`、`DiffRuler`、`StructuredView`、`CsvView` 的语义标签与指示条不变；`src/renderer/src/components/sharedI18n.test.tsx` 原断言不改且通过，作为通用词表未被污染的守卫。
- ac-generic-components-default: `DiffBadge` 与 `CompositionLegend` 不传目录词表时行为与改动前完全一致（默认解析 `DIFF_LABEL_KEYS`）；目录词表为可选注入，不得全局改写 `DIFF_LABEL_KEYS`。
- ac-filter-counts-and-state-unchanged: `matchesFilter`、`visibleDirectoryCounts`、`countTreeFiles` 的语义与数值不变（对应 `src/core/directory/filter.ts`、`rows.ts` 现有单测逐条不改且通过）：`right-only` 过滤下 `{same:0, added:1, removed:0, modified:0}`，`left-only` 下 `{same:0, added:0, removed:1, modified:0}`，`differences` 仍为非 `same` 汇总；目录状态仍为 `added`=右侧独有、`removed`=左侧独有。
- ac-no-domain-side-effects: 改动不触碰目录领域与通道源码：`src/core/directory/**`、`src/shared/fixtures/**`、`src/renderer/src/workbench/directoryReport.ts`、`src/renderer/src/workbench/directoryOps.ts` 及 snapshot / sync / template / export 相关模块零改动；HTML 报告、快照序列化、同步与模板归位的既有测试逐条不改且通过（可用 `git diff --name-only` 与基线核对）。
- ac-i18n-pairing: en / zh 字典键集合仍完全一致（既有键同步测试通过）；本次不新增状态标签键，四个标签均由上述既有键解析；`pnpm typecheck` 通过。
- ac-code-gates: `.munk/code-gates.json` 全部 gate（install / lint / typecheck / build / build-web / test 及 sync / template 专项门）退出码 0，无放宽、无跳过、无删除断言；改动合入 main。
- ac-stale-assertions-updated: 原先断言目录界面旧 `Added` / `Removed` 标签的 jsdom 断言同批改判据为 `Right only` / `Left only`（zh 对应词），并在提交说明或测试注释写明原因（目录四态展示词按产品口径调整）；`sharedI18n.test.tsx` 的通用标签断言保持原样。

## 非目标

- 不改目录对比四态口径、`DirectoryDiffNode.status` 赋值、过滤语义、四态计数与聚合方式；只换展示用字。
- 不改快照格式（`.ocsnap.json`）、快照导入 / 导出、同步、模板归位、HTML 报告的生成逻辑与文案（报告状态词仍走通用词表，与本次目录界面词表差异是明确的本次边界，如要统一另开 WI）。
- 不改文本 / 代码 diff 的行级 `added` / `removed` / `modified`、`DiffRuler` 指示条、`DiffBadge` 默认词表与 `common.diff.*` 文案。
- 不为过滤页签新增计数角标或改版式；页签文案本来就是 `Left only` / `Right only`，保持不动。
- 不改设计 token、布局、颜色、交互；不新增依赖；不做浏览器 / 真机 / 桌面点选自测（needSelfTest=false）。
- 不推 tag、不 dispatch、不改已公开 Release 与资产；不为凑绿放宽任何门禁。

## 实现约束

- 单一词表源：新增一个目录状态→消息键的映射（建议与 `FILTER_LABEL_KEYS` 同处 `src/renderer/src/views/directoryCopy.ts`，如 `DIRECTORY_STATUS_LABEL_KEYS`），由 `TreeView` 行徽标、`DirectoryView` 图例、`Workbench` 壳层图例共用；禁止在三个位置各写一份内联映射（对齐 `AGENTS.md`「可执行 / 可达性判定必须共用同一纯函数」的单一来源原则）。
- `DiffBadge` / `CompositionLegend` 增加**可选**词表入参，默认值仍为 `DIFF_LABEL_KEYS`；`DIFF_LABEL_KEYS`、`DIFF_STATUSES`、`DIFF_BADGE_CLASSES`、`DIFF_DOT_CLASSES` 不改。
- `Workbench` 仅在 `active.scene === 'directory'` 时向底部图例传目录词表；code / csv 场景继续走原词表。
- 计数与顺序维持现状：图例继续按 `DIFF_STATUSES` 渲染（`added` 在前、`removed` 在后），本次不改排序；e2e 不再要求重新设计四态布局。
- 需同步修正的旧断言（仅改判据，不弱化）：`src/renderer/src/views/directoryI18n.test.tsx`（约 614 / 620 / 730 行的 `Added` / `Removed` 图例断言）、`src/renderer/src/components/TreeView.test.tsx`（行徽标用 `DIFF_LABEL_KEYS` 取词的断言）、`src/renderer/src/workbench/directorySyncRetry.test.tsx`、`src/renderer/src/workbench/directorySyncRefresh.test.tsx`、`src/renderer/src/workbench/DirectoryReportExport.test.tsx` 中按图例标签定位并取数的 helper；`sharedI18n.test.tsx` 保持原样。
- 测试层级按 `code_gates`：行为断言落在 jsdom 渲染层（`directoryI18n.test.tsx` 等现有视图测试），纯计算回归落在 core 单测；不新增浏览器 / 真机门。
- 交付前本地 `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿，再交 Delivery 合入 main。
