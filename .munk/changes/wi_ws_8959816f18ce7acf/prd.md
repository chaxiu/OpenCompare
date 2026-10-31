# 顶栏 / 工作流 / 空态去 demo，设置承载示例

## 范围

在 main 隔离工作树（`HEAD = dde182d0b78bf0bcfe7842e3a6822354128b5d5e` 或保持 v0.2.13 的后继）内，把「演示样本」从首屏第一层入口撤出，统一收进设置：

1. **顶栏（`Workbench.tsx` 头部）**
   - 删除 `samples` 工具按钮与 `samples-menu` 下拉（连同 `sampleMenu()` / `MENU_SCENES` / `handleMenuSelect` 中仅服务顶栏 demo 的分支）；`data-shell-entry="samples"` / `"samples-menu"` 从 DOM 消失。
   - 删除品牌副标题 `<p>` 与 `shell.header.brandSubtitle` 中英键；品牌区保留品牌图标 + `OpenCompare` 标题。
   - 顶栏常驻动作只剩 `new-compare` / `open-file` / `open-folder` / `settings`，既有「空态下 open-file/open-folder 由空态 CTA 承担」的可见性语义不变。
2. **目录工作流工具栏（`DirectoryView.tsx`）**
   - 删除「加载演示目录」按钮（`directory.toolbar.loadSample` / `loadSampleTitle`）与「演示：远端快照」按钮（`directory.toolbar.demoRemote` / `demoRemoteTitle`）。
   - 删除 `onLoadSample` / `onLoadRemoteSnapshotSample` 两个 props，并同步删除 `Workbench.tsx` 的接线（`directorySides(DIRECTORY_SAMPLE_PATHS…)` 调用、`runSidesCompare(remoteSnapshotSides())` 调用）与 `perf/PerfRunner.tsx` 中的同名 prop 传参。
   - 真实入口（过滤、预览同步、模板归位、左右快照导出 / 导入、报告导出、下钻返回）与三行工具栏结构、`data-shell-entry` 真实入口全部保留。
   - `directory.picker.unavailable` 文案不再指向已删除的「加载演示目录」，改为指向「设置 → 示例与调试」或桌面端选择器。
3. **设置 →「示例与调试」分区（`SettingsDialog.tsx`）**
   - 新增分区（新 `settings.samples.*` 中英成对键：分区标题、说明、5 个入口标签 / 描述、失败项标签 / 描述），全部走词典，不硬编码中文。
   - 5 个场景入口，全部复用现有加载路径，不新增样本数据、不新增加载实现：
     - 目录 → `load({ scene: 'directory' })`
     - 代码 3-way → `load({ scene: 'code' })`
     - CSV → `load({ scene: 'csv' })`
     - JSON-YAML → `load({ scene: 'structured' })`
     - 远端快照 → `runSidesCompare(remoteSnapshotSides())`
   - 每个入口有稳定标识（`data-sample-entry`），5 个场景入口计数恰为 5；点击后关闭设置对话框，产生对应 `scene` 的会话并成为活动会话；加载态 / 错误态沿用现有 shell 行为（不新增提示体系）。
   - 「演示：样本读取失败」仅当显式调试开关（dev 构建或显式 prop）为真时渲染，使用独立标识（如 `data-sample-failure`），不计入 5 个 `data-sample-entry`；生产默认不渲染。
4. **空态**
   - CTA 只保留「新建对比 / 打开文件 / 打开文件夹」三个真实操作，不新增任何 demo 按钮。
   - `shell.empty.hint` 中英同批改写：不再指向顶栏样本，不再暗示样本是必经入口；保留一行指向「设置 → 示例与调试」的文字指路。`shell.empty.description` 只讲真实文件 / 文件夹 / 拖拽路径。
5. **i18n 与文案同批**
   - 中英同批删除：`shell.header.brandSubtitle`、`shell.toolbar.loadSamples` / `loadSamplesTitle`、`shell.toolbar.samples` / `samplesMenu`、全部 `shell.sampleMenu.*`、`directory.toolbar.loadSample` / `loadSampleTitle`、`directory.toolbar.demoRemote` / `demoRemoteTitle`。
   - 保留：`shell.view.*`（供 `SessionTabs` / 设置入口标签复用）、`shell.loading.*`、`shell.error.sample*`、`shell.error.hint`。
   - 新增 `settings.samples.*` 中英成对键；`messages.test.ts`（en/zh 键集合、占位符、英文无汉字、glossary）保持绿。
6. **入口清单与断言重定标（同批）**
   - `shellLayout.ts`：`ShellEntryId` / `SHELL_ENTRIES` / `APP_ROW.entries` 删除 `samples` / `samples-menu`（20 → 18）；`directory-status` 行删除 `load-sample` 控件预算并重算行宽（`view-switch` 控件保留给下一项）；`SHELL_ENTRY_ICONS` 同步删键。
   - `shellLayout.test.ts`：`ACCEPTANCE_ENTRIES` 20 → 18，删 `samples` / `samples-menu`；同步长度断言、分类断言与任何依赖被删条目的预算断言。
   - `shellLayout.dom.test.tsx`：`loadSamples()` 测试 helper 改为经设置示例入口驱动；二十条并集断言改十八条；960 窄档 / 目录工具栏断言去掉 `loadSample`；`samples-menu` 下拉断言删除。
   - 受影响的驱动点同批改道设置入口：`App.test.tsx`、`App.i18n.test.tsx`、`App.settings.test.tsx`、`App.snapshot.test.tsx`、`App.smoke.test.tsx`、`views/directoryI18n.test.tsx`、`views/DirectoryView.test.tsx`、`workbench/DirectoryReportExport.test.tsx`、`perf/perfShell.test.tsx`。
   - 图标：`layers` / `sparkles`（及 `UI_ICON_ACTIONS.sample`）删除后若成孤儿，按 `icons.test.ts` 口径同批清理（`ICON_PATHS` + svg 文件 + 图标清单），不得留下无引用图标或悬空引用。
   - 每处改动在交付说明写明原因；不得删 / 跳 / 弱化与本次无关的断言。

## 验收

- ac-no-topbar-samples: 渲染工作台（空态与 ready 态）后，顶栏不存在 `data-shell-entry="samples"` 与 `data-shell-entry="samples-menu"`，也查不到「加载演示样本 / 演示样本 / Load demo samples / Demo samples」按钮或菜单触发器。
- ac-brand-subtitle-gone: 顶栏品牌区只有品牌图标与 `OpenCompare` 标题文本；`shell.header.brandSubtitle` 中英键均已删除（词典键集合断言通过）。
- ac-directory-toolbar-no-demo: `DirectoryView` 工作流工具栏渲染结果中不存在「加载演示目录 / Load demo folder」与「演示：远端快照 / Demo: remote snapshot」按钮；`DirectoryViewProps` 不再含 `onLoadSample` / `onLoadRemoteSnapshotSample`，`Workbench` 与 `PerfRunner` 无同名传参（`tsc --noEmit` 通过即证）。
- ac-directory-toolbar-real-entries-kept: 目录工具栏仍渲染 filter / sync / template / snapshot-import / snapshot-export / report-export 等真实 `data-shell-entry`，三行结构与既有硬断言不变。
- ac-picker-unavailable-copy: `directory.picker.unavailable` 中英文案均不再包含「加载演示目录 / Load demo folder」字样，并指出「设置 → 示例与调试」或桌面端选择器作为替代路径。
- ac-settings-samples-five-entries: 打开设置对话框（默认调试开关关闭）后，`[data-sample-entry]` 元素恰为 5 个，且分别对应目录 / 代码 3-way / CSV / JSON-YAML / 远端快照；不含失败项。
- ac-settings-entry-starts-session: 依次点击 5 个入口，每个入口点击后：设置对话框关闭，会话列表中新增对应 `scene` 的会话（远端快照入口产生 `scene === 'directory'` 且右侧为快照的会话），且该会话成为活动会话（`SessionTabs` 中激活项与工作区内容一致）。
- ac-settings-sample-entries-reuse-path: 5 个入口分别调用既有路径 `load({ scene: 'directory' | 'code' | 'csv' | 'structured' })` 与 `runSidesCompare(remoteSnapshotSides())`；`src/shared/fixtures/**` 与 `SceneId` 未改动，无新增加载函数或样本数据。
- ac-settings-failure-entry-debug-only: 调试开关为 false（默认 / 生产）时设置内不渲染失败项，`[data-sample-failure]` 数量为 0；开关为 true 时渲染失败项且点击后进入错误态并保留可重试；失败项不计入 `[data-sample-entry]` 计数（仍为 5）。
- ac-empty-three-real-ctas: 空态 action 区恰为 3 个按钮（新建对比 / 打开文件 / 打开文件夹），无任何 demo 按钮。
- ac-empty-hint-points-to-settings: `shell.empty.hint` 中英文案均不含「顶栏 / toolbar」类样本指路、不含「加载样本」动词，且包含指向「设置 → 示例与调试 / Settings → Samples & debugging」的文字；`shell.empty.description` 只描述真实文件 / 文件夹 / 拖拽路径。
- ac-entry-list-18: `SHELL_ENTRY_IDS` 与 `ACCEPTANCE_ENTRIES` 均为 18 条且集合相等，均不含 `samples` / `samples-menu`；`APP_ROW.entries` 与 `SHELL_ENTRY_ICONS` 键集合与之一致（`satisfies Record<ShellEntryId, IconName>` 编译通过）。
- ac-shell-dom-18: `shellLayout.dom.test.tsx` 在 ready 视图下断言的入口并集恰为 18 条、无重复；窄档断言不再出现 `loadSample`；测试驱动统一走设置示例入口。
- ac-i18n-parity: `messages.test.ts` 全绿（en/zh 键集合一致、占位符一致、英文无汉字、glossary 约束保持）；被删键在 en/zh 同时消失，`settings.samples.*` 在 en/zh 同时存在；`shellScan.test.ts`（含 `SettingsDialog.tsx`）与 `i18n/mainScan.test.ts` 零硬编码中文扫描全绿。
- ac-icons-no-orphan: `icons.test.ts` 全绿：每个 vendored svg 与 `ICON_PATHS` 一一对应，`SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` 无悬空引用，渲染源码不再引用已删图标。
- ac-code-gates-green: 本项 worktree 内 10 道 gate（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics`）全部退出码 0。

## 非目标

- **不动 scene 分段控件**：`SegmentedControl` 视图切换、`shell.viewSwitcher.label`、`VIEW_OPTIONS` 与 `APP_ROW` 的 `view-switch` 控件预算本项保留，交给下一项工作项。
- 不改对比 / 合并 / 扫描算法、四态语义、快照格式、导出格式；不改 `classifyFile` / `openFilePairSession` / `createDirectorySession` / `createDrilldownSession`。
- 不删任何样本数据：`src/shared/fixtures/**` 与 `SceneId` 不变，只搬入口。
- 不碰版本单点文件：`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`README*`、`.github/workflows/release.yml`、`docs/release-signing.md`、`release-packaging.test`。
- 不做设置面板重设计 / 品牌重设计 / 移动端或窄屏适配；不引 UI 组件库、不新增 npm 依赖。
- 不新增内容嗅探、不新增加载实现或新的样本读取路径。
- 不做浏览器 / 真机 / 桌面点选验收（L3 由 product-qa 承接）；`needSelfTest=false`。
- 不削弱既有硬断言（`SHELL_LEVELS`、三行工具栏、无 `flex-wrap`、无响应式 `:` 类等）；只允许改写受本变更影响的断言。

## 实现约束

- **基线**：开工自检 `git rev-parse HEAD` 为 main tip 或其 v0.2.13 后继、`package.json#version === 0.2.13`、存在 `shellLayout.ts` / `shellLayout.test.ts` / `shellLayout.dom.test.tsx`。主检出 `/…/codebases/projects/open-compare` 只读，禁止任何 git 写操作，也不要用它推断现状。
- **设置分区的接线**：`SettingsDialog` 通过显式 props 接收「加载某场景 / 加载远端快照」回调与调试开关；回调在 `Workbench` 内复用现有 `load({ scene })` 与 `runSidesCompare(remoteSnapshotSides())`，点击后先关闭设置再起会话，确保加载进度与会话可见、不被模态遮挡。
- **调试开关**：单一显式来源（`import.meta.env.DEV` 之类构建期常量或 `Workbench` 传入的 `showDebugSamples` prop），必须可被测试显式控制以同时断言开 / 关两态；生产构建静态排除失败项，不依赖运行时用户可见菜单。
- **标签复用**：5 个场景入口标签优先复用 `shell.view.*`（目录 / 代码 / CSV / JSON-YAML）与快照相关既有键，避免新增重复词条；新增键只补分区标题、说明与失败项。
- **视觉**：只用既有 token 与既有组件（`Dialog`、`SegmentedControl`、`ToolbarButton`、`Icon`），不写死颜色 / 尺寸，不新建组件目录。
- **交付说明**：列出入口增删清单（含 `samples` / `samples-menu` 20 → 18 的原因：demo 入口整体迁入设置，顶栏不再承载样本）、每处断言改动原因、改动前后 `it` / `expect` 计数、`git diff --stat`。
