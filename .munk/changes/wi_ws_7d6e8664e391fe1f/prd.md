# 桌面专业对比视觉基线、多会话工作台壳层与内置标准测试样本底座

## 范围

本项是 OpenCompare 的视觉基线 Phase（前序 `repo-bootstrap` 只交了占位壳，`App.tsx` 仍是「Shell mounted」欢迎页，`.munk/baseline/design/*` 全是种子占位）。交付三件东西：**一套 token + 基础组件组成的暗黑工业风基线**、**用它们做成的多会话工作台壳层主屏**、**四大场景内置标准样本底座 + 顶栏一键加载入口**。

1. **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 的信息密度）**
   - 单一 token 来源：颜色（表面/文字/边框/主色/危险 + **差异语义色：相同 / 新增 / 删除 / 修改 / 冲突**）、字号字重、间距、圆角、焦点环、动效时长。页面与组件只引用 token。
   - 基础组件（只做本屏用得到的）：工具栏按钮与下拉、会话标签、面板容器、可拖拽分割窗格（双栏 / 三栏）、空态、加载态、错误态、状态栏条目、树/列表行、等宽代码块与表格排版。
   - 等宽字体栈用于代码、表格、路径与统计数字，保证字符对齐阅读。
2. **多会话工作台壳层（主屏）**
   - 顶部工具栏：应用标识、视图/会话切换（目录对比 / 代码 Diff & 3-Way Merge / CSV 主键对比 / JSON·YAML 语义对比）、常驻「Load Sample Fixtures」入口。
   - 中央工作区：可拖拽调整比例的双栏 / 三栏分割窗格；三向合并场景为三栏。
   - 底部状态栏：当前会话标识与统计计数位（条目数 / 差异数等）。
   - 会话模型：一个样本 = 一个会话；支持多会话并存与切换；无会话时展示空态引导。
   - 三种状态可见：空态（引导加载样本）、加载态（加载样本时）、错误态（样本加载失败，可读且可重试）。
3. **内置标准样本底座（`src/shared/fixtures/`）**
   - 场景 A 目录：多层嵌套双目录树（左 / 右，含新增 / 删除 / 修改 / 相同文件）＋ 跨层级散乱目录树 B 样本。
   - 场景 B 代码：双栏 Diff 文本对 ＋ 三向 `base` / `ours` / `theirs` 且含多发冲突块的文件集。
   - 场景 C CSV：1,200+ 行、主键乱序、含新增 / 删除 / 修改行与列偏移的 CSV/TSV 左 / 右样本。
   - 场景 D 结构化：键序打乱、含深层嵌套键值增删改与类型变化的 JSON / YAML 左 / 右样本。
   - 样本以纯数据 + 纯函数暴露（零 Electron/DOM），可经 `PlatformPort` 在 Web 内存模式读取（`web-platform.ts` 已预留该接缝）；提供「加载样本 → 生成会话」的入口函数。
4. **索引与路由**
   - `.munk/changes/wi_ws_7d6e8664e391fe1f/ux/design-baseline.md`：token 文件路径、组件目录与清单、主屏路径、主要取舍。
   - `AGENTS.md` 增一行路由：改界面前先读 token 来源与组件目录（写真实路径）。

## 验收

- ac-shell: 桌面窗口（`pnpm dev`）与 `pnpm dev:web` 均能拉起完整工作台壳层——顶部工具栏 + 中央分割工作区 + 底部状态栏。
- ac-tokens: 壳层与全部基础组件统一引用同一套 token（含差异语义色），组件内无硬编码颜色；字号 / 间距 / 圆角同源。
- ac-three-states: 主屏空态、加载态、错误态三种状态都能看到（空态含 Load Sample Fixtures 引导；错误态文案可读并可重试）。
- ac-load-fixtures: 点击顶栏「Load Sample Fixtures」可一键加载预置样本，工作台随即出现对应场景会话。
- ac-session-switch: 多会话 / 多视图可切换，切换后工作区内容与底部状态栏统计随当前会话更新。
- ac-four-scenes: 四大场景样本齐备且加载后可见：嵌套 + 散乱目录树、代码 Diff 与多冲突块 3-way（base/ours/theirs）、1200+ 行乱序主键 CSV 左右样本、乱序深层 JSON/YAML 左右样本。
- ac-split-pane: 双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并场景呈现三栏。
- ac-fixtures-tests: `src/shared/fixtures/` 有 vitest 用例校验场景完整性（CSV ≥1200 行、3-way 冲突块 ≥2、目录树层级 ≥3 层、JSON/YAML 深层变更存在），`pnpm test` 绿。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本项。各视图只读呈现样本原始内容（树结构、代码原文、表格、结构化文本），不做差异高亮与统计。
- **不做合并结果保存 / 导出 / 写回**，不做用户文件选择与真实文件写入流程。
- **不做 Electron 侧把样本落盘真实临时目录**（后续文件对比项自行决定取数方式）。
- 不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键绑定与命令面板（分栏拖拽本身在范围内）。
- 不做浅色主题成品与主题切换 UI（token 按可换主题组织即可，不交 light 皮肤）。
- 不做组件大全、不做 HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。

## 实现约束

- **技术栈已由上游 tech-research 冻结，不得替换**：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React。**不引入第二套 UI 库 / 样式方案**（shadcn、antd、MUI 等）；token 用 Tailwind v4 `@theme` 定义在 renderer 内唯一 CSS 来源（现为 `src/renderer/src/assets/main.css`，只 `@import 'tailwindcss'`）。
- **视觉方向已定**：现代暗黑工业风 + 紧凑高信息密度，对标 Beyond Compare 5 Pro；差异语义色（相同 / 新增 / 删除 / 修改 / 冲突）是本产品核心视觉语言，必须在 token 层命名并在后续所有视图统一引用。
- **分层硬约束**：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API。`PlatformPort` 现有契约语义不破坏（可扩展）。
- 等宽字体使用系统字体栈，不引入需网络的 web font。
- 写 UI 前先读 `.agents/skills/tailwind-4-docs/SKILL.md` 与 `.agents/skills/vercel-react-best-practices/SKILL.md`；写测试读 `.agents/skills/vitest/SKILL.md`。
- 现有 `src/renderer/src/App.test.tsx` 断言占位欢迎页，需随壳层落地同步更新并保持绿。
- 视觉索引只写 `.munk/changes/wi_ws_7d6e8664e391fe1f/ux/design-baseline.md`，不自己改 `.munk/baseline/**`。
- 本项 key 为 `ui-baseline`，`kind: feature`：只交视觉基线 + 工作台壳层 + 样本底座，业务闭环留给后续子项。
