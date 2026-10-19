# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效时长；页面与组件只引用 token。基础组件（工具栏按钮/下拉、会话标签、面板容器、可拖拽分割窗格、空/加载/错误态、状态栏条目、树/列表行、等宽代码块与表格排版）与等宽字体栈。
- **多会话工作台壳层（主屏）**：顶部工具栏（应用标识、视图/会话切换、常驻 Load Sample Fixtures 入口）、中央可拖拽双栏/三栏分割工作区（三向合并为三栏）、底部状态栏（当前会话标识 + 统计计数位）；会话模型「一个样本 = 一个会话」支持多会话并存/切换，无会话时展示空态引导；空态/加载态/错误态三种状态可见。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron/DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱目录树 B；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV 左右样本；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML 左右样本；经 `PlatformPort` 在 Web 内存模式可读，提供「加载样本 → 生成会话」入口。
- **冷启动真实对比入口（主屏空态）**：无会话时首屏两个主 CTA「打开文件」「打开文件夹」，均经 `PlatformPort.selectFile` / `selectDirectory` 走系统选择器；选定左右两侧即建立并进入对比会话（文件对按 `fileKinds.classifyFile` 进 code / csv / structured；目录对走既有目录会话模型），全程不依赖样本。
- **真实路径拖入窗口**：空首屏与有会话时均可拖入真实路径——恰好 2 个同类路径（两文件 / 两目录）直接建同一会话模型；1 个路径作为左侧基准填入 + info 提示；>2 个或文件目录混合则明确提示、不建会话、不改既有会话。拖入阻断浏览器/窗口默认导航，应用停留原状态；真实绝对路径解析经平台缝（preload / `webUtils.getPathForFile` 或 main IPC 白名单），renderer 不猜测路径。
- **样本入口降级为演示辅助**：样本按钮 / 下拉保留但显式标注演示用途，文案不再暗示「必须先加载样本」，可被完全跳过。
- **索引与路由**：`ux/design-baseline.md`（token 路径、组件清单、主屏路径、取舍）折入 `.munk/baseline/design/*`；`AGENTS.md` 增视觉基线路由。

## 验收

- **ac-shell**：桌面窗口（`pnpm dev`）与 `pnpm dev:web` 均能拉起完整工作台壳层——顶部工具栏 + 中央分割工作区 + 底部状态栏。
- **ac-tokens**：壳层与全部基础组件统一引用同一套 token（含差异语义色），组件内无硬编码颜色；字号 / 间距 / 圆角同源。
- **ac-three-states**：主屏空态、加载态、错误态三种状态都能看到（空态以真实对比为主叙事并提供打开入口；错误态文案可读并可重试）。
- **ac-load-fixtures**：点击顶栏「Load Sample Fixtures」可一键加载预置样本，工作台随即出现对应场景会话。
- **ac-session-switch**：多会话 / 多视图可切换，切换后工作区内容与底部状态栏统计随当前会话更新。
- **ac-four-scenes**：四大场景样本齐备且加载后可见：嵌套 + 散乱目录树、代码 Diff 与多冲突块 3-way（base/ours/theirs）、1200+ 行乱序主键 CSV 左右样本、乱序深层 JSON/YAML 左右样本。
- **ac-split-pane**：双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并场景呈现三栏。
- **ac-fixtures-tests**：`src/shared/fixtures/` 有 vitest 用例校验场景完整性（CSV ≥1200 行、3-way 冲突块 ≥2、目录树层级 ≥3 层、JSON/YAML 深层变更存在），`pnpm test` 绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。
- **ac-cold-start-primary-cta**：冷启动无会话首屏的两个主 CTA 是「打开文件」「打开文件夹」，且不存在以加载样本为主入口的空态叙事。
- **ac-open-two-files**：空首屏经系统选择器依次选择两个真实文件后，直接建立并进入文件对比会话（按类型为代码 / CSV / JSON-YAML 之一），未加载任何样本。
- **ac-open-two-dirs**：空首屏经系统选择器依次选择两个真实目录后，建立目录对比会话，会话 subtitle 展示这两个真实路径，内容来自真实文件系统而非样本路径。
- **ac-picker-cancel**：在任一选择器取消后不建会话、不改变既有会话与视图。
- **ac-drop-two-paths**：把两个真实同类路径（两个文件或两个目录）拖入窗口，落成与选择器打开同一会话模型并进入对比视图。
- **ac-drop-single-path**：拖入单个真实路径时该路径被作为左侧基准填入并提示选择右侧对应项，现有会话不受影响。
- **ac-drop-invalid**：拖入超过两个路径、或文件与目录混合时给出明确提示，不新建会话且不改变现有会话状态。
- **ac-drop-no-navigate**：拖入路径不会导致窗口导航 / 重载，应用仍停留在当前会话。
- **ac-sessions-not-overwritten**：连续打开不同文件对（或目录对）会新增独立会话标签，不覆盖先前会话。
- **ac-samples-auxiliary**：样本入口仍显式标注为演示用途且可用；不点样本不影响真实打开 / 拖拽路径。
- **ac-gates**：`pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动的空态断言更新）。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域。各视图只读呈现样本原始内容，不做差异高亮与统计；状态栏计数与目录树标签来自样本自带 answer key（编辑期标注），非运行时计算。
- **不做合并结果保存 / 导出 / 写回**，不做用户文件选择与真实文件写入流程。
- **不做 Electron 侧把样本落盘真实临时目录**（后续文件对比项自行决定取数方式）。
- 不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键绑定与命令面板（分栏拖拽本身在范围内）。
- 不做浅色主题成品与主题切换 UI（token 按可换主题组织即可，不交 light 皮肤）。
- 不做组件大全、不做 HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。
- 真实入口不做「最近打开 / 历史记录 / 收藏夹 / 书签」；不做 OS 级集成（Finder「打开方式」、命令行路径参数、macOS `open-file` 事件、拖到 Dock）；不做单侧智能配对（同名文件 / 同父兄弟 / 路径记忆）——单路径拖入只做左栏填充 + 提示；不做多选批量选择（一律左右各一次）。
- 会话标签止于「建立并进入」：不做标签生命周期与未保存提示（`session-tabs-lifecycle`）、不做原位保存与导出（`save-in-place-and-export`）。目录下钻、返回上级目录视图与往返状态保持已由 directory 域交付（会话模型仅新增 `parentDirectoryId` 来源标识），本域不重复展开其行为验收。
- 不删改内置样本、不重构 `loadSampleSessions` 既有加载路径；不新增对比能力品类、不改目录对比 / Diff / CSV / 结构化算法内核。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案；token 用 Tailwind v4 `@theme` 定义在 renderer 内唯一 CSS 来源。
- 视觉方向已定：现代暗黑工业风 + 紧凑高信息密度；差异语义色（相同/新增/删除/修改/冲突）必须在 token 层命名并在后续所有视图统一引用。
- 分层硬约束：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API；`PlatformPort` 现有契约语义不破坏（可扩展）。
- 等宽字体使用系统字体栈，不引入需网络的 web font。
- 视觉索引只写 change pack `ux/design-baseline.md`，不自己改 `.munk/baseline/**`。

## 最近交付证明

- WI：`wi_ws_d7725b67e42c8e12`（冷启动真实对比工作台与真实路径打开/拖拽，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test passed。
- 覆盖摘要：`Workbench.tsx` 空首屏改为真实对比口径——主操作区两个主 CTA「打开文件」「打开文件夹」（经 `PlatformPort.selectFile` / `selectDirectory`），空态标题「打开真实文件或文件夹开始对比」，hint 明示样本仅供演示、可完全跳过；新增真实路径拖入处理（2 同类路径 → 同一会话模型、1 路径 → 左基准 + info 提示、>2 或文件/目录混合 → 明确提示且不改既有会话），拖入阻断默认导航（prevented），Electron 37 `File.path` 移除后经平台缝解析真实绝对路径（preload / `webUtils.getPathForFile`）；多会话不覆盖（按 pairs 复用同一标签）；样本入口降级为演示辅助（「加载演示样本」title 标注可跳过 + 「演示样本」下拉）。门禁 `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿（vitest 21 files / 177 tests，含随动的空态断言与拖拽落点组件测试）。
- 注：WI change pack 未提供 `tech.md` / `ux/**`，本轮 tech/ux 折叠跳过。Web 通道无法投递/选择真实目录（`web-platform.ts` `selectDirectory` 恒返回 `/memory`），`ac-open-two-dirs` 的真实选择器口径留待 Electron 桌面窗口复核，两目录落点逻辑另有组件测试覆盖。
