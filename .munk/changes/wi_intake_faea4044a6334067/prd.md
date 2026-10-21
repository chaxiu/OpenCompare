# 目录树超大行数（≥150 万行）尾部不可达修复

## 背景

实机验收（product-qa `trun_c0949d56cd94be47`，被测 main `0856b470`）在真实 DawnChat↔ZenMind 对比中复现：右栏 1,516,096 行时 `TreeView` 把容器高度写成 `rows.length * DIRECTORY_ROW_HEIGHT` ≈ 3.5e7 px，超过浏览器布局上限 16,777,214 px（2^24），实际被截到 16,777,216，`scrollTop` 最大只有 16,776,742。结果是 1,516,096 行里只有前 699,050 行（46.1%）可达，尾部 53.9%（含 `source-code`、`workspace` 等字母序靠后的目录）永远滚不到，「全部」档同样现象。DOM 节点数本身有界（29 行），所以这不是虚拟化回归，而是容器高度硬上限。

## 范围

- 只修 `src/renderer/src/components/TreeView.tsx` 及其必要的 `src/core/directory/rows.ts` 支撑（行 ↔ 滚动偏移映射），以及对应测试夹具。
- 让任意行数（≥150 万行）下的任意行（含末行、尾部目录）都能被滚动到达并正确渲染。
- 保持既有交互与语义：五档过滤、展开/折叠、选中、下钻与逐级返回、双栏独立滚动、四态统计。
- 大数据量 fixture 的自动化验证（≥70 万行，推荐 1,516,096）。

## 验收

- ac-height-capped: 当 `rows.length * DIRECTORY_ROW_HEIGHT > 16_777_215` 时，`role="tree"` 容器的内联高度 ≤ 16,777,215px（例如 1,516,096 行时断言 `parseFloat(tree.style.height) <= 16777215`）；当行数 ≤ 699,050 时高度恰为 `rows.length * 24`（小树路径恒等，不引入像素偏差）。
- ac-last-row-reachable: 在 1,516,096 行的 rows 上把面板滚动容器置到最大可滚动偏移后，渲染窗口包含 index = `rows.length - 1`，且该行 `title`、`aria-level`、状态徽标与 `rows.at(len - 1)` 完全一致。
- ac-any-index-reachable: 对同一 1,516,096 行 rows，取 index ∈ {0, len/4, len/2, 3len/4, len-1} 以及尾部目录（如 `source-code/...`、`workspace/...`）所在索引，按其映射偏移滚动后渲染窗口都包含目标行且内容正确；映射 `offsetForIndex(i)` 严格递增，且 `offsetForIndex(len - 1) <= maxScrollOffset`（无压缩死区、无跳跃空洞）。
- ac-dom-bounded: 任意滚动位置下 `role="treeitem"` 数量 ≤ 80；1,516,096 行 fixture 与 5,000 行 fixture 在同一相对位置的 DOM 元素总数差异 ≤ 10%（渲染量不随总行数增长）。
- ac-filter-parity: 在 ≥70 万行 fixture 上，五档过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）两侧的可见行数，以及首行、中间行、末行的相对路径与 `filterDirectoryTree → projectDirectoryTree → 前序遍历` 语义逐条一致。
- ac-collapse-semantics: 折叠再展开任意（含顶层大）目录后，行数与 `rows.at(i)` 的节点/深度/open 一致；展开后该目录最后一个子项可被滚动到并渲染，DOM 仍有界。
- ac-drilldown-restore: 在超大行数下选中尾部行后下钻、再逐级返回重挂载，滚动偏移恢复到同一行（误差 ≤1px）且选中行位于渲染窗口内、`aria-selected="true"`。
- ac-stats-unchanged: 五档过滤下 `CompositionLegend` / `visibleCounts` 的四态计数与修复前取值完全相同（不改四态语义与统计口径）。
- ac-existing-tests: 现有 `src/renderer/src/views/DirectoryView.test.tsx` 与 `App.test.tsx` 中目录对比相关用例语义不变并全部通过（滚动比例、restore、empty-filter 文案、DOM 上限等）。

## 非目标

- 不改四态（same / added / removed / modified）语义、计数口径与图标/徽标。
- 不改对比算法、合并算法、目录扫描、哈希通道与快照线格式。
- 不为达标缩小目录、裁剪样本、删减或合并五档过滤。
- 不改其他视图（文本/代码/CSV/结构化）的虚拟化实现，不顺手做通用虚拟化抽象重构。
- 不新增 UI 控件、工具栏按钮、说明文案或新的交互流程；不改外观尺寸与配色。
- 不追求滚动性能指标优化（帧率、内存），只保证可达性与既有语义。
- 不改 `Panel` 之外的滚动容器结构，不动双栏分栏行为。

## 实现约束

- 允许「分段/锚点式虚拟化（按目录分页，每页独立滚动容器）」或「超大行数改用指数/分段映射滚动条」，二者任选；禁止只用首屏达标、只 `Math.min` 高度而不改映射这类造成尾部不可达的假修复。
- 行高保持 `DIRECTORY_ROW_HEIGHT = 24`，行渲染视觉与 DOM 结构（`role="tree"` / `role="treeitem"`、`aria-level`、`title=relativePath`）保持现有契约，便于既有测试与辅助技术继续工作。
- 容器高度上限用一个具名常量表达且 `< 2^24`（浏览器布局上限），映射必须单调、可逆，且当总高度未超限时退化为恒等映射。
- 保留 `TreeView` 的 `scrollElement` / `initialScrollTop` / `selectedPath` / `onTogglePath` / `onSelectPath` / `onOpenFile` props 语义，或提供等价物；Workbench 已按像素保存的 `scrollTops` 在下钻往返后仍需恢复到同一行。
- 行 ↔ 滚动偏移映射若引入新逻辑，优先实现为 `src/core/` 中的纯函数（零 Electron/DOM 依赖）以便 L1 单测；renderer 只做 DOM 应用。
- 测试 fixture 用合成的 ≥70 万行（推荐 1,516,096 行）目录模型，不得缩小样本；`code_gates`（install / lint / typecheck / build / build:web / test）全绿。
