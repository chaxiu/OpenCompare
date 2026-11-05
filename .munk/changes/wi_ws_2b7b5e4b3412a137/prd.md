# 窗口菜单栏 / 工具栏与主界面主题统一

## 范围

- 让应用内解析出的主题（`light` / `dark`，`system` 经 OS 偏好解析）同时驱动三处此前脱节的表面：渲染侧 `<html data-theme>` + `color-scheme`（已成立）、Electron 原生主题（原生菜单栏 / 标题区）、窗口背板色；并让自绘工具栏 band 与主界面的表面层级成为单一事实。
- 现状事实（已核对仓库，勿凭记忆改写）：
  - `src/main/index.ts#createWindow` 的 `backgroundColor` 硬编码为 `#0b0d12`，既不是暗色 `--color-surface-base`（`#0b0e12`）也不是亮色（`#ffffff`），且不随主题变化。
  - 主进程从未设置 `nativeTheme.themeSource`，所以原生菜单栏 / 标题区只跟随 OS，与应用内主题可以相反（例如 OS 亮、应用暗）。
  - 渲染侧主题只落到 `<html data-theme>` 与 `body` 背景；`ThemeProvider` 拿不到 `PlatformPort`，因此没有任何通往主进程的主题通道。
  - 自绘 band 目前都已使用 `bg-surface-sunken`：`Workbench` app 顶栏 1 处、`view-toolbar` 5 处（`CodeView` ×2、`CsvView`、`DirectoryView`、`StructuredView`）。**本项不重绘界面**，只把该取值收敛为单一来源并加回归断言，防止后续视图各写一份。
  - token 唯一来源仍是 `src/renderer/src/assets/main.css`；WCAG / ΔE 断言在 `src/core/theme/contrast.test.ts`；色板扫描在 `src/renderer/src/theme/themeSources.test.ts`。
- 只复用既有 `--color-surface-*` / `--color-content-*` / `--color-line-*` token 与 Electron 原生主题能力：不新增色相、不新增第二套配色、不新增 UI 入口、不改对比 / 合并语义。
- 平台口径（本项决定）：只用 `nativeTheme.themeSource` + 窗口背景色两条原生能力；**不**引入 `titleBarOverlay` / `titleBarStyle` / `frame:false`，也不自绘伪菜单栏。macOS 的全局菜单栏由 OS 拥有、不接受应用着色，该差异写入交付说明，不在本项内伪造。

## 验收

- ac-native-theme-mode-sync: 在设置里依次切到 `light` / `dark` / `system` 后，主进程的 `nativeTheme.themeSource` 分别等于该模式（`system` 保持 `'system'`，不得被解析后的 `light` / `dark` 钉死）；切换过程不重启、不重建窗口；未知 / 非法载荷被忽略，绝不向 renderer 抛错。
- ac-native-theme-startup: 首个窗口创建之前，`nativeTheme.themeSource` 已按 `userData/settings.json` 中持久化的模式设置；该文件缺失、损坏或语言字段非法时回退 `DEFAULT_THEME`（`dark`），启动不因读设置失败而中断，也不出现第二份设置读取 / 解析实现。
- ac-native-theme-system-follow: `system` 模式下渲染侧对 `matchMedia('(prefers-color-scheme: light)')` 的订阅与切换行为与今天完全一致；OS 偏好翻转后原生菜单栏 / 标题区与窗口背板随之改变，无需重启或重建窗口。
- ac-window-backdrop-token: 窗口背景色取值等于当前解析主题的 `surface-base` token 值（暗 `#0b0e12`、亮 `#ffffff`），由 `main.css` 解析结果比对断言；仓库内不再存在与任一 token 值不等的窗口背板字面量（现有 `#0b0d12` 必须消失），且没有新增第三个色值。
- ac-window-backdrop-live: 主题切换后，所有已打开窗口的背板更新为新主题的 `surface-base`；不 reload、不重建窗口，会话 / tab / 滚动位置保持不变（沿用既有「零重挂」契约）。
- ac-toolbar-band-single-surface: `Workbench` 的 app 顶栏与全部 5 处 `data-shell-level="view-toolbar"` band 共用 `src/renderer/src/workbench/shellLayout.ts` 导出的同一个 band surface 类，取值为既有 `bg-surface-sunken`；任一处 band 出现其它 `bg-surface-*` token 即失败；亮暗两套下 band 与 `surface-base` / `surface-raised` 的层级方向一致（视觉不出现第二套配色或反向层级）。
- ac-no-new-palette: 不新增 `--color-*` 名称、不新增第二色板 / 第二个定义 token 的样式文件；`src/renderer/src/**` 非测试源码零新增 `#hex` / `rgb(` / `hsl(` 字面量；`themeSources.test.ts` 与 `contrast.test.ts` 全绿且既有阈值一个不放宽。
- ac-core-untouched: `src/core/**` 的非测试文件零改动（`git diff --name-only` 为空）；未新增 `v8 ignore` / `c8 ignore`，未删除源码来取悦门禁。
- ac-web-runtime-unaffected: Web 运行时（`pnpm dev:web` 路径）不提供原生主题能力也照常工作：主题切换仍只落 `<html data-theme>` + `color-scheme`，`App.theme` 现有断言全绿，无未处理的 Promise 拒绝或控制台错误。
- ac-native-chrome-preserved: 不新增自绘菜单栏 / 标题栏：菜单仍由 `Menu.setApplicationMenu(Menu.buildFromTemplate(createMenuTemplate(...)))` 提供，`BrowserWindow` 选项不出现 `frame:false` / `titleBarStyle` / `titleBarOverlay`；`createMenuTemplate` 的菜单项与快捷键结构不变。

## 非目标

- 不做真实窗口 GUI / 截图验收（`cp-ui-consistency` 的真实窗口验收与 release 截图各自归其写项），本项不派 QA 子项、不新建长跑门禁。
- 不做整体 UI 重构、主题编辑器、新配色体系、组件库级重做；不改字号 / 圆角 / 控件高 / 间距。
- 不改四态计数、忽略开关、复制 / 导出、快照与对比 / 合并语义；不改 `CodeView` / 工具栏入口集合。
- 不改菜单项、快捷键体系或原生 About 面板；不新增依赖。
- 不尝试给 macOS 全局菜单栏着色，也不自绘菜单栏来「看起来统一」。
- 不改发布通道、签名口径、版本锚点、已公开 tag / Release / 资产。

## 实现约束

- **单一通道**：`src/shared/platform/channels.ts` 只新增一个白名单 channel（建议 `setNativeTheme: 'platform:set-native-theme'`），不要顺手加别的 IPC。
- **契约形状**：`PlatformPort` 上以可选方法暴露（与 `onCompareRequest?` 同风格，例如 `setNativeTheme?(mode: Theme): Promise<void>`）；Electron 侧在 `src/preload/index.ts` 走 `ipcRenderer.invoke`；Web 侧不实现或实现为空操作。renderer 调用点必须容忍方法缺失，且吞掉失败——主题切换绝不能因为原生通道报错而可见失败。
- **主进程落点**：`src/main/platform/electron-platform.ts` 的 `registerPlatformIpc` 内新增 handler，用 `@shared/platform/settings` 的 `isTheme` 校验入参后写 `nativeTheme.themeSource`；非法值忽略、不抛。需要通知窗口背板时走 `PlatformIpcOptions` 的测试 seam（与既有 `onCompareRequestsReady` 同风格），便于单测。
- **启动顺序**：`src/main/index.ts` 在 `whenReady` 内、`launch.onAppReady()` 之前设置 `themeSource`；持久化模式必须复用既有 `settings.json` 读取路径与 `parseUserSettingsJson`（可把 `readUserSettings` 以窄接口从 `electron-platform.ts` 导出），不得复制文件路径或第二份解析逻辑。
- **背板单一来源**：新增一个零 DOM / 零 Electron 的共享模块（建议 `src/shared/platform/windowTheme.ts`）导出 `Record<ResolvedTheme, string>` 背板映射与解析函数；其值必须由测试用 `@core/theme/contrast` 的 `parseThemeTokens` 从 `main.css` 实读比对（相等即证明是既有 token 值，不是新色）。`createWindow` 用它替换 `'#0b0d12'`；`nativeTheme.on('updated')`（仅普通启动路径注册一次）与主题切换 handler 复用同一解析函数，对 `BrowserWindow.getAllWindows()` 逐个应用。
- **渲染侧推送**：`src/renderer/src/theme/ThemeProvider.tsx` 增加一个可选注入点（例如 `platform?: Pick<PlatformPort, 'setNativeTheme'>` 或等价回调），在挂载与每次模式变化时各推一次 **模式**（`light` / `dark` / `system`，不是解析后的值——推解析值会把 `system` 钉死并遮断 OS 变化）。不得新增主题状态、不得让 `Workbench` 重挂、不得阻塞首帧。
- **band 单一来源**：`src/renderer/src/workbench/shellLayout.ts` 导出一个 toolbar band surface 常量（覆盖 `ToolbarLevel = 'app' | 'view-toolbar'`），`Workbench` app 顶栏与 5 处 view-toolbar 改为消费它；**不得改变任何现有视觉取值**（今天全部是 `bg-surface-sunken`），也不得把它扩散到 `sessions` / `events` / `panels` / `status` 层级。
- **测试落点**（只加严、不改写既有断言）：`src/main/platform/electron-platform.test.ts`（electron mock 补 `nativeTheme` / `BrowserWindow`，断言合法模式写入、非法忽略）；`src/shared/platform/windowTheme.test.ts`（背板值 == `main.css` 的 `surface-base`，两套主题 + 未知输入回退）；`src/main/index.ts` 的接线用源码静态断言（沿用 `release-packaging.test.ts` 的既有手法：`createWindow` 不再出现 `#0b0d12`、存在 `nativeTheme.themeSource` 与 `nativeTheme.on('updated')`、无 `titleBarStyle` / `titleBarOverlay` / `frame:false`）；`ThemeProvider` 推送单测（挂载 + 切换各一次、拒绝时不影响切换）；`shellLayout.test.ts`（band 常量取值 + 全仓 band 消费扫描）。
- **纪律**：`src/core/**` 非测试零改动；`src/core/theme/contrast.test.ts` 阈值不动；不新增 `v8 ignore`；不新增依赖；`AGENTS.md` 视觉基线（token 唯一来源）不变。
