# 桌面视觉基线索引（ui-baseline）

本项落地 OpenCompare 的暗黑工业风视觉基线、多会话工作台壳层与内置标准样本底座。Delivery 会把本文件折进 `.munk/baseline/design/*`。

## Token 唯一来源

- 文件：`src/renderer/src/assets/main.css`（Tailwind v4 `@import 'tailwindcss'` + `@theme`）。
- 颜色：`--color-surface-*`（base / sunken / raised / overlay / hover）、`--color-content-*`（primary / secondary / muted / inverse）、`--color-line-*`（subtle / strong）、单一主色 `--color-accent`·`-strong`·`-soft`·`--color-focus`、危险色 `--color-danger`·`-strong`·`-soft`。
- **差异语义色（产品核心视觉语言）**：`--color-diff-same` / `-added` / `-removed` / `-modified` / `-conflict`，配 `--color-diff-*-soft` 背景色。所有对比视图必须走这组 token，不得自造色。
- 排版：`--font-sans` / `--font-mono`（系统字体栈，无网络字体）、`--text-2xs`（11px，加在默认字阶之上）。代码、表格、路径、统计数字一律 `font-mono` + `tabular`。
- 圆角 `--radius-xs/sm/md/lg`、阴影 `--shadow-panel` / `--shadow-overlay`。
- 间距沿用 Tailwind v4 单一基数 `--spacing`（`calc(var(--spacing) * n)`），缩进等动态间距也用该 token 计算。
- 动效：`--duration-fast`(110ms) / `--duration-base`(170ms) / `--ease-ui`。
- 复用型低层行为：`@utility transition-ui` / `transition-fast` / `focus-ring` / `tabular`。
- 组件内无硬编码颜色与像素色值；基色切换主题只需改这一处。

## 组件目录与清单

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
| `TreeView.tsx` | `TreeView` | 只读目录树行（展开 / 折叠、差异标签） |
| `CodeBlock.tsx` | `CodeBlock` | 等宽代码块 + 行号槽 |

## 主屏与场景视图

- 主屏：`src/renderer/src/workbench/Workbench.tsx` — 顶栏（应用标识 + 平台、视图切换、常驻 `Load Sample Fixtures` 主按钮 + `样本` 下拉）、会话标签条、中央工作区、底部状态栏。
- 加载编排：`src/renderer/src/workbench/loadSampleSessions.ts`（`LoadedSession`、CSV/TSV 解析、加载下限时长、错误分支）。
- 场景视图 `src/renderer/src/views/`：`DirectoryView`（双栏树 + 可折叠散乱树 B）、`CodeView`（双栏 Diff ↔ 三栏 base·ours·theirs）、`CsvView`（左右原始表格，主键列着色）、`StructuredView`（JSON ↔ YAML 原文对）。
- 内置样本：`src/shared/fixtures/`（`types.ts` / `scenes.ts` / `index.ts` / `fixtures.test.ts`），纯数据 + 纯函数，零 Electron / DOM；`SAMPLE_FIXTURE_FILES` 由 Web 内存 `PlatformPort`（`src/renderer/src/platform/web-platform.ts`）挂载到 `/samples`，与 Electron 走同一契约。

## 主要取舍

1. **不做差异算法**：本项只读呈现样本原文，不做行级/字符级 Diff 与合并求解（属后续子项）。状态栏的差异计数与目录树标签来自样本自带的 **answer key**（`SampleComposition` + `DirectoryNode.status` 的编辑期标注），不是运行时算出来的。
2. **加载态可见性**：样本在内存中、解析仅数毫秒，因此 `loadSampleSessions` 设了 420ms 的加载下限，避免加载态一闪而过；真实文件会话接入后该下限可去掉。
3. **错误态可达性**：正常工作流不会失败，工作台保留了 `样本 → 演示：样本读取失败` 这一基线自检入口（`simulateFailure`），用于人工查看错误态与重试；接入真实文件读取后应删除该入口。
4. **三栏默认**：代码会话默认三栏（base·ours·theirs）以呈现 3-Way Merge 场景，双栏 Diff 由视图内切换；目录 / CSV / JSON·YAML 会话为双栏。
5. **不做虚拟滚动**：CSV 表格按行直出（1,240 行，Chromium 无压力），虚拟列表留给 CSV 主键对齐子项与真实万行数据。
6. **主题可换但不交浅色皮肤**：token 按可换主题组织（颜色全部走 CSS 变量），本项不做主题切换 UI。
7. **文件读取经 `PlatformPort`**：样本库在 Web 内存模式可被 `listDirectory` / `readTextFile` 读取（有 vitest 覆盖），Electron 侧不落盘临时目录（按本项非目标）。
