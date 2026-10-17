# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效时长；页面与组件只引用 token。基础组件（工具栏按钮/下拉、会话标签、面板容器、可拖拽分割窗格、空/加载/错误态、状态栏条目、树/列表行、等宽代码块与表格排版）与等宽字体栈。
- **多会话工作台壳层（主屏）**：顶部工具栏（应用标识、视图/会话切换、常驻 Load Sample Fixtures 入口）、中央可拖拽双栏/三栏分割工作区（三向合并为三栏）、底部状态栏（当前会话标识 + 统计计数位）；会话模型「一个样本 = 一个会话」支持多会话并存/切换，无会话时展示空态引导；空态/加载态/错误态三种状态可见。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron/DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱目录树 B；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV 左右样本；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML 左右样本；经 `PlatformPort` 在 Web 内存模式可读，提供「加载样本 → 生成会话」入口。
- **索引与路由**：`ux/design-baseline.md`（token 路径、组件清单、主屏路径、取舍）折入 `.munk/baseline/design/*`；`AGENTS.md` 增视觉基线路由。

## 验收

- **ac-shell**：桌面窗口（`pnpm dev`）与 `pnpm dev:web` 均能拉起完整工作台壳层——顶部工具栏 + 中央分割工作区 + 底部状态栏。
- **ac-tokens**：壳层与全部基础组件统一引用同一套 token（含差异语义色），组件内无硬编码颜色；字号 / 间距 / 圆角同源。
- **ac-three-states**：主屏空态、加载态、错误态三种状态都能看到（空态含 Load Sample Fixtures 引导；错误态文案可读并可重试）。
- **ac-load-fixtures**：点击顶栏「Load Sample Fixtures」可一键加载预置样本，工作台随即出现对应场景会话。
- **ac-session-switch**：多会话 / 多视图可切换，切换后工作区内容与底部状态栏统计随当前会话更新。
- **ac-four-scenes**：四大场景样本齐备且加载后可见：嵌套 + 散乱目录树、代码 Diff 与多冲突块 3-way（base/ours/theirs）、1200+ 行乱序主键 CSV 左右样本、乱序深层 JSON/YAML 左右样本。
- **ac-split-pane**：双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并场景呈现三栏。
- **ac-fixtures-tests**：`src/shared/fixtures/` 有 vitest 用例校验场景完整性（CSV ≥1200 行、3-way 冲突块 ≥2、目录树层级 ≥3 层、JSON/YAML 深层变更存在），`pnpm test` 绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域。各视图只读呈现样本原始内容，不做差异高亮与统计；状态栏计数与目录树标签来自样本自带 answer key（编辑期标注），非运行时计算。
- **不做合并结果保存 / 导出 / 写回**，不做用户文件选择与真实文件写入流程。
- **不做 Electron 侧把样本落盘真实临时目录**（后续文件对比项自行决定取数方式）。
- 不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键绑定与命令面板（分栏拖拽本身在范围内）。
- 不做浅色主题成品与主题切换 UI（token 按可换主题组织即可，不交 light 皮肤）。
- 不做组件大全、不做 HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案；token 用 Tailwind v4 `@theme` 定义在 renderer 内唯一 CSS 来源。
- 视觉方向已定：现代暗黑工业风 + 紧凑高信息密度；差异语义色（相同/新增/删除/修改/冲突）必须在 token 层命名并在后续所有视图统一引用。
- 分层硬约束：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API；`PlatformPort` 现有契约语义不破坏（可扩展）。
- 等宽字体使用系统字体栈，不引入需网络的 web font。
- 视觉索引只写 change pack `ux/design-baseline.md`，不自己改 `.munk/baseline/**`。

## 最近交付证明

- WI：`wi_ws_7d6e8664e391fe1f`（ui-baseline / 视觉基线 + 工作台壳层 + 样本底座，`kind: feature`）
- 日期：2026-10-18
- 结果：self_test passed。（六门禁 latest.json ok=true，6 gates passed）
- 覆盖摘要：新建唯一 token 来源 `src/renderer/src/assets/main.css`（`@theme` 39 条 token：表面/文字/边框/accent/危险 + 差异语义色 diff-same·added·removed·modified·conflict 及 *-soft，等宽/字号/圆角/阴影/动效）；基础组件 `src/renderer/src/components/**`（Button/SegmentedControl/DropdownMenu/Panel/SplitPane/SessionTabs/StateView/StatusBar/DiffBadge/diffSemantics/TreeView/CodeBlock）；主屏 `src/renderer/src/workbench/Workbench.tsx` + 加载编排 `loadSampleSessions.ts`；四场景视图 `views/DirectoryView`·`CodeView`·`CsvView`·`StructuredView`；样本底座 `src/shared/fixtures/**`（含 `fixtures.test.ts`，5 files / 19 tests 全绿）；`App.test.tsx` 随壳层同步更新保持绿。九条验收均有对应折叠用例（qa/）。
- 注：WI change pack 未提供 `tech.md`，本轮 tech 折叠跳过。
