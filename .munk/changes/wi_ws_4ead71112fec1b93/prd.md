# 目录视图常驻入口、隐私开关与保存接线

## 范围

把已交付的纯函数报告内核（`src/core/directory/report.ts` 的 `buildDirectoryReport` / `directoryReportSource`、`src/shared/appVersion.ts` 的 `APP_VERSION`）接到目录对比界面上，只改 renderer 与 i18n：

1. `DirectoryView` 第三行工具栏（快照导入导出那一排）新增：
   - 常驻「导出 HTML 报告」按钮，仅在 `busy` 时禁用，与是否选了真实目录、是否 Web 运行时无关；
   - 同排「隐藏本机路径」复选框，默认勾选；
   - 新 props：`hideLocalPaths`、`onHideLocalPathsChange`、`onExportReport`；按钮点击只调用 `onExportReport`，不自行生报告、不碰平台层。
2. `Workbench`：
   - 持有 `hideLocalPaths`（默认 `true`，不进 per-session state，切换目录会话/视图重挂载后保持）；
   - 新增导出处理：用当前 `comparison` 投影 `directoryReportSource(comparison)`，用**当前语言词典经 `t` 解析出的** `DirectoryReportStrings`、`htmlLang(language)`、`new Date().toISOString()`、`APP_VERSION`、当前 `hideLocalPaths` 调用 `buildDirectoryReport`；
   - 经既有 `platform.saveFile({ title, defaultPath, filters, content })` 落盘，默认文件名 `<左名>-vs-<右名>.html`（非法字符替换、空名回退 `directory`，不含绝对路径）；
   - `saveFile` 返回 `null`（取消）时直接结束：不提示成功、不写文件、不重试；
   - 成功时提示含落盘路径；截断时提示同时带「已展示 N / 原始 M」；异常走既有 `detailNotice`；
   - `busy` 复用 `directoryBusy`，导出期间按钮禁用且不可重入。
3. i18n：`zh/en directory.ts` 成对新增工具栏文案、开关文案、保存框标题、文件过滤器名、成功/截断提示，以及报告内 `DirectoryReportStrings` 全部键（标题、固定隐私提示、生成时间/版本/左右根/上限行标签、口径说明、四态列名与状态名、截断文案与提示、空表文案）；四态状态名复用既有 `DIFF_LABEL_KEYS`。
4. 测试：`DirectoryView.test.tsx` 覆盖工具栏与开关；Workbench 级集成测试覆盖同源计数、语言、版本、默认隐私、成功与取消；`directoryI18n.test.tsx` 英文工具栏清单同步；现有 i18n 扫描测试保持通过。

## 验收

- ac-toolbar-export-persistent: 目录对比视图渲染后，任意过滤状态下都存在可点击的「导出 HTML 报告」按钮；点击一次调用 `onExportReport` 恰好一次；`busy=true` 时按钮 disabled 且点击不触发回调。
- ac-hide-paths-default: 「隐藏本机路径」复选框默认勾选；点击后以 `false` 调用 `onHideLocalPathsChange`（再点以 `true`），导出按钮不受该开关影响仍可点击。
- ac-hide-paths-survives-remount: 在 Workbench 中取消勾选后切换到另一个目录会话再切回，复选框仍为未勾选（状态由 Workbench 持有，非视图局部状态）。
- ac-report-counts-match-dom: 用现有真实双目录 fixture（每侧 ≥1 万条目，含嵌套、左右独有、修改、相同）经 UI 触发导出，解析 `saveFile` 收到的 `content`；报告内 same/added/removed/modified 四个数字与界面「全部」过滤下 `CompositionLegend` 的四个 DOM 数字逐一相等；报告为全部条目口径（不受当前过滤影响）。
- ac-report-lang-follows-ui: zh 界面导出文档 `<html lang="zh-CN">` 且标题/列名为中文词典文案；en 界面为 `<html lang="en">` 且为英文词典文案；两种语言下均无另一语言硬编码文案（报告内文案全部来自注入字符串）。
- ac-report-version-shared: 报告内版本字符串等于 `APP_VERSION`，且等于根 `package.json` 的 `version`。
- ac-default-privacy-no-local-paths: 左右根构造为 `/Users/<name>/...` 且开关默认开启时，导出产物源码中 `/Users` 命中数为 0，且包含固定隐私提示行；同一比较关闭开关后重导出，产物出现原始绝对根路径，隐私提示行仍存在。
- ac-save-success-file-contract: `saveFile` 收到 `content` 为完整自包含 HTML（以 `<!DOCTYPE html>` 开头、`</html>` 结尾，含 `<meta charset="utf-8">`）、`defaultPath` 以 `.html` 结尾且形如 `<左名>-vs-<右名>.html`（名字含 `\ / : * ? " < > |` 时被替换、去尾空格，空名回退 `directory`，不含绝对路径）、`filters` 含 `html` 扩展名；返回路径后展示包含该路径的成功提示。
- ac-save-cancel-silent: `saveFile` 返回 `null` 时不再有第二次 `saveFile` 调用，不出现包含路径的成功提示，不产生任何落盘写入副作用，`busy` 复位；按钮可再次点击。
- ac-save-truncation-notice: 报告被截断时成功提示同时包含已展示行数与原始行数（`N` / `M`），未截断时提示不含截断措辞。
- ac-i18n-parity: `zh` 与 `en` 词典新增键一一对应、无缺失；英文界面不出现中文；`directoryI18n.test.tsx` 英文工具栏清单包含新按钮与新开关标题，现有 i18n 扫描测试全部通过。
- ac-no-new-ipc: 导出全程只调用既有 `PlatformPort.saveFile`，不新增 IPC channel 或平台方法；renderer 不直接引用 Electron API。

## 非目标

- 不改 `src/core/directory/report.ts` 的报告结构、转义、隐私相对化、上限/截断语义与 `APP_VERSION` 读取方式（内核已由前序交付，本项只消费）。
- 不新增 Electron IPC、`PlatformPort` 方法，不把报告生成搬到主进程。
- 不覆盖文件 diff、CSV/JSON/YAML/结构化视图报告。
- 不改对比/合并算法、四态语义、过滤行为、快照格式与内置样本。
- 不做真实 `file://` 浏览器打开、桌面系统保存框点选与真机验证（合入后由 `product-qa` 复核），不做视觉重构或新增设计稿。
- 不 bump 版本，不改 README/CHANGELOG/release notes，不打 tag、不发布。

## 实现约束

- 复用既有组件与视觉 token：工具栏按钮用 `ToolbarButton`（`lucide-react` 图标），复选框复用现有表单样式，不写死颜色/尺寸；不新建页面、弹窗或状态容器。
- `Workbench` 内复用现有 `report` / `copyNotice` / `detailNotice` 提示通道与 `directoryBusy`，不要新增全局 notice 机制。
- 报告文案必须经 `useI18n()` 的 `t` 与 `language` 取得；`htmlLang` 复用 `src/renderer/src/i18n/htmlLang.ts`，核心与 renderer 均不得自行切语言或写死 `zh-CN`/`en`。
- 只调用一次 `buildDirectoryReport`；不得为了估算体积先行物化行源或遍历树，行数与字节上限由内核负责。
- 文件名规范化在 renderer 侧集中一处实现并被单测覆盖，避免按钮与保存两处各写一遍。
- i18n 键统一 `directory.report.*` 分组；源码中不得出现中文硬编码（现有 `mainScan` 扫描保持通过），新增测试断言只读词典键。
- 测试基线：`DirectoryView.test.tsx` 已有真实 26,000 文件双目录 fixture 直接复用，另行构造 `/Users/<name>/...` 根路径用例；解析 HTML 用 jsdom `DOMParser`，计数对比必须读界面 `CompositionLegend` 的 DOM 数字而非重算。
- `saveFile` 用注入的 `PlatformPort` mock 分别返回路径与 `null`；不得依赖内置样本或真实磁盘写入完成断言。
