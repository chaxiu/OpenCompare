# 千行 CSV/TSV 按指定主键列对齐对比与虚拟列表单元格变动高亮

## 范围

前序已交付：工作台壳层 / 视觉 token 与基础组件 / 内置样本底座。当前 `CsvView.tsx` 只是把左右两张原始表并排铺开（`keyColumns` 仅给表头上色，无任何对齐与差异计算），即上一次交付明确留在范围外的部分。本项把它做成产品核心王牌亮点——**主键对齐对比**。

1. **`src/core/csv/` 纯算法引擎（新模块，零 Electron/DOM/React）**
   - 输入：左右两张已解析表（`header: string[]` + `rows: string[][]`，来自现有 `parseCsvTable`）＋用户选定的主键列名（1..n 列，有序）。
   - **主键对齐**：按选定列名在各自表头里的位置取值组成键元组，跨左右配对；两侧行序完全无关（样本左右各自被确定性打乱）。
   - **容忍列顺序偏移与独有列**：按**列名**而非列下标配对；单边独有列（如右侧的 `region`）参与展示，但**不计入行「修改」判定**——判定只在左右共有列的交集上做。样本 86 条修改行只来自 `qty` / `status` 的真实变动，若把单边列算进判定，全部行都会误判为修改。
   - **行状态**：`same`（键配对且交集列全等）/ `modified`（键配对但至少一个交集列不等）/ `added`（仅右侧有该键）/ `removed`（仅左侧有该键）；CSV 场景无 `conflict` 语义。
   - **单元格级明细**：每条 `modified` 行输出具体变动列及其左值 → 右值。
   - **运行时统计**：`same / added / removed / modified` 计数由引擎返回（不是样本 answer key）。
   - **重复主键**：同侧同键多行不崩溃，按出现顺序确定性配对，多余行走该侧新增/删除计数，并在结果里带上重复键提示信息。
   - 输出对齐行顺序确定：先按左侧出现顺序输出「左有」的行，再按右侧出现顺序追加「仅右有」的行；主键未选中或交集为空时返回空结果而非抛错。

2. **`CsvView.tsx` 虚拟列表对齐视图（替换现有双原始表）**
   - **单表合并视图**（overview 留的开放点，本项定死走这一种）：统一列集显示。列序 = 主键列（按勾选顺序，置左）→ 其余左表列（按左表原序）→ 右表独有列（按右表原序）。每行 = 一条对齐结果。
   - **`@tanstack/react-virtual` 虚拟滚动**：固定行高，1,240 行级样本滚动流畅，DOM 行数只与视口相关。
   - **行状态视觉**：`added` / `removed` / `modified` / `same` 用统一差异语义色（`--color-diff-*`）区分行背景/状态标记。
   - **变动单元格高亮**：`modified` 行的每个变动单元格内联展示「原值 → 新值」（如 `qty` 的 `1 → 6`），用 modified 语义色；未变动单元格只显示一个值。
   - **新增行**：显示右值 + added 语义色；**删除行**：显示左值 + removed 语义色；单边列在缺失侧留空。
   - **主键选择器**：可交互勾选/取消单列或多列主键（候选 = 左右共有列，默认取 `CSV_SCENE.keyColumns` 即 `order_id`；下钻会话无声明主键时默认第一个共有列）。切换后对齐结果、行状态、单元格高亮与统计即时重算。
   - **一键状态过滤**：`全部 / 仅差异 / 新增 / 删除 / 修改 / 相同`，作用于对齐行，视图内行数随之变化。
   - **运行时统计上抛**：CSV 会话在底部状态栏展示的 same/added/removed/modified 来自运行时对齐结果（沿用 `CodeView` 的 `onMergeStateChange` 回调模式），不再用样本 answer key。
   - 同时覆盖**内置 1,240 行样本会话**与**目录树下钻打开的 CSV/TSV 会话**（`session.adhoc` 路径，现有 `tables` + `delimiter` 已具备）。

## 验收

- ac-core-align-counts: `src/core/csv/` 引擎对内置样本按 `order_id` 对齐后的运行时统计与 `CSV_SCENE.composition` 完全一致（相同 1,123 / 新增 24 / 删除 31 / 修改 86），核心逻辑由 vitest 直接单测。
- ac-core-row-shuffle: 左右行序被打乱（样本本身即乱序）仍按主键正确配对；打乱输入顺序不改变统计结果。
- ac-core-column-offset: 左 7 列 / 右 8 列且顺序不同（右侧独有 `region`）时按列名配对；单边独有列不计入「修改」判定，修改行数仍为 86。
- ac-core-multi-key: 支持单列与多列主键（如 `order_id+sku`）；切换主键后重新对齐并重算统计，不崩溃、无重复计数。
- ac-core-cell-detail: `modified` 行能列出具体变动列与左值 → 右值（`qty`、`status` 各一条示例可断言）。
- ac-core-dup-key: 主键在同侧重复时确定性配对、不抛错，多余行归入该侧新增/删除。
- ac-virtual-scroll: 千行级对齐表用 `@tanstack/react-virtual` 虚拟滚动，滚动流畅且实际渲染的 `tr` 数远小于总行数。
- ac-key-picker: 可在界面勾选/切换单列或多列主键，切换后对齐结果、行状态与统计即时刷新。
- ac-filter: 一键状态过滤（全部 / 仅差异 / 新增 / 删除 / 修改 / 相同）生效，视图行数随过滤变化。
- ac-runtime-stats: 状态栏 same/added/removed/modified 计数来自运行时对齐结果，且与答案键一致来源不同（改主键后计数会随之变化）。
- ac-modified-cell: 修改行内变动单元格清晰展示「原值 → 新值」并使用 modified 差异语义色；新增行 / 删除行分别以 added / removed 语义色区分。
- ac-drilldown-csv: 目录下钻打开的 CSV/TSV 会话进入同一对齐视图；无声明主键时默认选中第一个共有列并可交互修改。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿（含随新视图更新的 `App.test.tsx`）。

## 非目标

- **不做 CSV 写回 / 导出 / 合并**：不给修改行提供左覆右、右覆左、应用到对方或「合并结果另存」，只读对比。
- **不改 CSV/TSV 解析器**：沿用现有 `parseCsvTable` + papaparse 语义（含引号字段现状），不做引号内换行编辑、不做分隔符自动嗅探、不做编码/BOM 处理。
- **不做左右双表同步滚动视图或视图模式切换**：本项只交单表合并对齐视图（另一种留待未来 WI）。
- **不做表格增强功能**：列宽拖拽、列隐藏、列排序、单元格编辑、行内搜索、复制单元格、跳转下一个差异、冻结列以外的表头固定策略。
- **不做数值/内容归一化比较**：字符串精确比较，`19.50` 与 `19.5` 视为不同；不做大小写/去空格/类型转换容差。
- **不做模糊主键匹配、主键自动推荐、复合键表达式或键归一化**。
- **不做重复主键的歧义裁决 UI**（只在结果与统计里体现）。
- **不做 `.xlsx` / Excel、不做超大表分页 / 流式加载 / Web Worker 卸载**。
- **不改 `src/main/` / `src/preload/` / `PlatformPort` 契约，不改 `src/core/directory`、`src/core/text` 与目录 / 代码 / 结构化视图的行为**。
- **不新增第三方依赖**（`@tanstack/react-virtual`、`papaparse` 已在 `package.json`）。
- **不做快捷键、命令面板、主题切换、浅色皮肤**；不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 分层硬约束：`src/core/csv/` 纯函数、零 Electron / DOM / React 依赖，可在 Node 下被 vitest 直接单测（AGENTS.md + ESLint `no-restricted-imports`）。解析产出仍由 renderer 侧的 `parseCsvTable` 提供，引擎只吃 `header` / `rows` 纯数据。
- 样式只引用 token 唯一来源 `src/renderer/src/assets/main.css`，差异语义色一律走 `--color-diff-*` / `components/diffSemantics.ts`，不写死颜色。
- 虚拟列表用仓内已有的 `@tanstack/react-virtual`；固定行高以保滚动性能与简单性。
- 统计计数经回调上抛给 `Workbench.tsx` 状态栏（沿用 `CodeView` 的 `onMergeStateChange` 既有模式），不在视图内重复造状态栏。
- 验收对照物是样本 answer key `CSV_SCENE.composition`（由 `src/shared/fixtures` 暴露），不要在新测试里另写一套硬编码期望值与之分叉。
- 现有 `src/renderer/src/App.test.tsx` 中对 `report.csv` 下钻的断言（`3 行 · CSV` / `4 行 · CSV`）随新视图同步更新，保持测试绿。
- 写 UI 前读 `.agents/skills/tailwind-4-docs/SKILL.md` 与 `.agents/skills/vercel-react-best-practices/SKILL.md`；写测试读 `.agents/skills/vitest/SKILL.md`。
- 本项 `kind: feature`；`needSelfTest: true`（有主键切换、状态过滤、变动单元格高亮等可点验收）。
