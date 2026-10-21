# Design components

Component conventions (or pointers to the in-repo UI kit).

来源：WI `wi_ws_7d6e8664e391fe1f`（ui-baseline）。组件只引用 token，不写死颜色/尺寸；差异语义色一律走 `--color-diff-*`。

目录 `src/renderer/src/components/`：

| 文件 | 导出 | 用途 |
| --- | --- | --- |
| `utils.ts` | `cx` | 条件类名拼接 |
| `Button.tsx` | `ToolbarButton`（default / primary / ghost / danger × sm / md，`disabled`）、`IconButton` | 工具栏与面板动作按钮 |
| `SegmentedControl.tsx` | `SegmentedControl` | 视图 / 模式切换（`role=tablist`，支持单项 `disabled`） |
| `DropdownMenu.tsx` | `DropdownMenu` / `DropdownItem` | 工具栏下拉：`aria-haspopup`、Escape / 外部点击关闭 |
| `Panel.tsx` | `Panel` | 面板容器：标题栏（等宽标题）+ 可滚动主体 |
| `SplitPane.tsx` | `SplitPane` | 双栏 / 三栏可拖拽分割：指针拖拽 + 方向键微调 + 双击复位，`role=separator`，最小占比 12% |
| `SessionTabs.tsx` | `SessionTabs` / `SessionTab` | 会话标签条 |
| `StateView.tsx` | `StateView` | 空 / 加载 / 错误三态共用容器（`tone` 区分危险态） |
| `StatusBar.tsx` | `StatusBar` / `StatusEntry` / `CompositionLegend` | 底部状态栏条目与差异语义计数图例 |
| `DiffBadge.tsx` | `DiffDot` / `DiffBadge` | 差异语义点 / 标签 |
| `diffSemantics.ts` | `DIFF_STATUSES` / `DIFF_LABELS` / 颜色类映射 | 差异语义词汇表 |
| `TreeView.tsx` | `TreeView` | 只读目录树（展开 / 折叠、差异标签）：按 `DirectoryRowModel` + `@tanstack/react-virtual` 窗口化，只渲染视口行 + 常量 overscan，行高 `DIRECTORY_ROW_HEIGHT`(24px) 单一常量 |
| `CodeBlock.tsx` | `CodeBlock` | 等宽代码块 + 行号槽 |
