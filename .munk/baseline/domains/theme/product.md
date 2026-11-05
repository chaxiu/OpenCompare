# Domain: theme

亮 / 暗 / 跟随系统三态主题域：**同一组** `--color-*` token 在 `src/renderer/src/assets/main.css` 里给出暗色（Tailwind `@theme` 块）与亮色（`:root[data-theme='light']` 覆盖块）两套取值，渲染侧把选中模式解析成 `light` / `dark` 并同步到 `<html data-theme>` + `color-scheme`，`system` 模式经 `window.matchMedia('(prefers-color-scheme: light)')` 跟随 OS；模式随 `UserSettings` 持久化；同一模式经一条可选 IPC 推给主进程的 `nativeTheme.themeSource`，让原生菜单栏 / 标题区与窗口背板跟应用内主题一致，背板取 `surface-base` token 的实值；另配一个零 DOM / 零 Electron 的对比度工具（从 `main.css` 文本读 token 值，算 WCAG 相对亮度 / 对比度与 CIE76 Lab ΔE）把「可读」与「四态可区分」变成 `pnpm test` 断言。本域管**双色板契约、模式解析与接线、设置持久化契约、原生主题 / 窗口背板接线、对比度自证**；token 家族清单与视觉方向仍归 `design/foundations`，词条与词典面归 `i18n`，壳层入口清单归 `workbench`（本项不新增入口），发布面 / README 截图归 `release`。

## 范围

- **单一色板源（`src/renderer/src/assets/main.css`）**：暗色取值留在既有 `@theme` 块，亮色在**同文件**新增一个 `:root[data-theme='light']` 块，按**完全相同的 `--color-*` 名**逐个覆盖（当前 27 个名）；不新增 token 名、不新开第二套色板 / 第二个 CSS 文件、不复制 `@theme` 结构。差异语义 `--color-diff-{same,added,removed,modified,conflict}` 与 `-soft` 背景两套主题都在（`same` 无独立 `-soft`，沿用 `surface-sunken`）。**亮色差异前景对 chip 底 ≥ 4.5:1（AA 小字）**：chip 为 11–13px 文案，故亮色五个 `--color-diff-*` 取「同色相、加深到过 4.5」的值，`-soft` 底随前景按「语义色 12% 叠 `surface-base`」重算；暗色取值与既有 ≥3:1 口径零 diff。
- **根节点承载（`applyTheme`）**：`document.documentElement.dataset.theme` 取 `light` / `dark`（永远不是 `system`），同一处写 `style.color-scheme`；根节点既有 `:root { color-scheme: dark }` 作为未挂载时的兜底。`useLayoutEffect` 在提交前落地，故点选同一事件循环内生效。
- **模式解析（纯函数，`src/renderer/src/theme/theme.ts`）**：`resolveTheme(theme, prefersLight)`（`system` → `prefersLight ? 'light' : 'dark'`，其它原样）、`applyTheme(resolved)`、`loadInitialTheme(platform)`（读设置失败 / 缺失 / 未知一律 `DEFAULT_THEME`，绝不抛错、绝不阻断启动）、`LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'`。
- **默认值与迁移（`src/shared/platform/settings.ts`）**：`THEMES = ['light', 'dark', 'system']`（设置对话框展示顺序），`DEFAULT_THEME = 'dark'`；`isTheme` 只接受三值。缺省 / 未知 / 非字符串 `theme` 一律回退 `dark`——既让既有安装保持当前暗色外观，也让 `system` 保持显式 opt-in。
- **`UserSettings` 契约**：`{ language, theme }` 两个字段同时存在。`parseUserSettings` 对缺失 `theme` 补 `DEFAULT_THEME`（旧记录 `{"language":"zh"}` 读回 `{language:'zh', theme:'dark'}`），对损坏值整体读作「无记录」，全流程不抛错；未知多余字段照旧丢弃。
- **设置对话框主题分区（`SettingsDialog`）**：语言分区之后新增主题分区，沿用 `SegmentedControl`，`aria-label` 取自 `settings.theme`，三个选项文案取 `settings.theme.{light,dark,system}`（en / zh 成对）；选中态读 `useTheme().theme`（含 `system`，不是解析后的值）。点选先切整窗（`setTheme`）再持久化，写失败沿用既有就地 `role="alert"` 文案、不回滚选择。
- **写入不可丢字段**：任一次写入都提交完整 `UserSettings`（`chooseLanguage` 带当前 theme，`chooseTheme` 带当前 language），经串行写队列落到 `PlatformPort.writeUserSettings`；Electron（`userData/settings.json`）与 Web（`localStorage` 单键 `opencompare.userSettings`）同一契约。
- **跟随系统（`ThemeProvider`）**：`theme === 'system'` 时经 `useSyncExternalStore` 订阅 `matchMedia` 的 `change`，监听只在 `system` 模式存在；显式 `light` / `dark` 下不订阅、不响应 OS 变化，切离 `system` / 卸载即 `removeEventListener`。jsdom 中可经替换 `window.matchMedia` 注入偏好，断言用计数型监听。
- **零 IO / 零重挂**：主题状态只活在 `ThemeProvider`，`Workbench` 不在其 `key` 上、也不被条件卸载——切主题不重扫目录、不重算摘要、不重读文件，会话、tab、激活项、滚动位置、筛选与折叠集合全部保持。
- **原生主题通道（`PLATFORM_CHANNELS.setNativeTheme = 'platform:set-native-theme'`）**：`PlatformPort.setNativeTheme?(mode: Theme)` 为可选方法（与 `onCompareRequest?` 同风格），Electron 侧 `preload` 走 `ipcRenderer.invoke`，Web 侧不实现；`ThemeProvider` 在挂载与每次模式变化各推一次**模式**（`light` / `dark` / `system`，不是解析值），方法缺失即跳过、同步 / 异步失败一律吞掉。主进程 `registerPlatformIpc` 用 `isTheme` 校验后写 `nativeTheme.themeSource`，非法值静默忽略。
- **启动前恢复模式**：`src/main/index.ts` 在 `whenReady` 内、首个窗口创建与 `launch.onAppReady()` 之前，复用 `electron-platform.ts` 导出的 `readUserSettings`（同一 `settings.json` 路径与 `parseUserSettingsJson`）读持久化模式，非法 / 缺失 / 损坏回退 `DEFAULT_THEME`（`dark`），读失败不中断启动。
- **窗口背板单一来源（`src/shared/platform/windowTheme.ts`）**：零 DOM / 零 Electron，导出 `WINDOW_BACKDROP: Record<'light'|'dark', string>`（暗 `#0b0e12`、亮 `#ffffff`）与 `resolveWindowBackdrop(theme: unknown)`（未知输入回退暗色）。`createWindow` 的 `backgroundColor` 用它替换旧字面量 `#0b0d12`；主题切换 handler 与普通启动路径唯一一次 `nativeTheme.on('updated')` 复用同一函数，对 `BrowserWindow.getAllWindows()` 逐个 `setBackgroundColor`。
- **工具栏 band 单一来源（`src/renderer/src/workbench/shellLayout.ts`）**：`TOOLBAR_BAND_SURFACE: Readonly<Record<ToolbarLevel, string>>` 覆盖 `app` 与 `view-toolbar` 两级，取值均为既有 `bg-surface-sunken`；`Workbench` app 顶栏与 5 处 `data-shell-level="view-toolbar"` band 全部消费该常量，不扩散到 `sessions` / `events` / `panels` / `status`。
- **平台口径**：只用 `nativeTheme.themeSource` + 窗口背景色两条原生能力，不引入 `titleBarOverlay` / `titleBarStyle` / `frame:false`，不自绘伪菜单栏；macOS 全局菜单栏由 OS 拥有、不接受应用着色，属已知差异而非缺陷。
- **对比度工具（`src/core/theme/contrast.ts`）**：`parseThemeTokens(css)` 从 `main.css` 文本取两套 token 映射（找不到 `@theme` / `:root[data-theme='light']` 块即抛错，防静默空跑）、`relativeLuminance` / `contrastRatio`（WCAG）、`labDeltaE76`（CIE76）。零 DOM / 零 Electron，node 环境 vitest 直跑；断言读的是**真实样式表文本**而不是色值副本。
- **切换真伪判定与可复用探针（`docs/evidence/theme-switch-verdict.md` + `scripts/theme-click-probe.mjs`）**：把「Settings 点 Light / Dark 后运行中窗口不变」这类验收失败拆成 `ok-cdp` / `driver-miss` / `product-no-switch` 三态；判定顺序固定为「`elementFromPoint` 是否命中 tab → CDP 坐标点击 + `MutationObserver` → 页面内 `el.click()` 复测」，只有第三层仍无 `data-theme` 变更才归因产品。探针只用 Node 内置 `fetch` + 全局 `WebSocket`，`judgeThemeProbe` 为纯函数、CLI 有 `import.meta.url` 守卫，可被 vitest 直接 import。
- **特殊：对话框内的主题分区不改壳层入口**：`SHELL_ENTRIES` / `SHELL_ENTRY_IDS` 与其三档 presentation 零变化；app 头不加主题入口、不新增 shell entry；主题选项不新增图标（若要图标只能取 `UI_ICON_ACTIONS` 既有动作名，本项未用）。
- **扫描根登记**：新增 `src/renderer/src/theme/` 已进 `src/renderer/src/i18n/mainScan.test.ts` 的 `SCAN_ROOTS`，新目录里的中文注释才会被扫描（否则假绿）。

## 验收

### 主题 token 与对比度

- **ac-theme-token-names-identical**：从 `main.css` 解析出的两套主题 `--color-*` token 名集合完全相等（亮色缺失任一既有名、或多出任何新名即失败，当前 27 / 27）；差异语义 `--color-diff-{same,added,removed,modified,conflict}` 及 `-soft` 两个主题都存在；每个取值都是单个 `#rrggbb` 字面量。
- **ac-theme-no-second-palette**：`src/renderer/src/assets/` 下只有 `main.css` 定义 `--color-*`；`src/renderer/src/**`（非测试）除 `main.css` 外零 `--color-*` 定义；亮色是同文件内的覆盖值，仓内无第二套 token 前缀 / 第二色板文件（同时断言 `main.css` 里确有 `@theme {` 与 `:root[data-theme='light'] {` 两块，防扫描空转）。
- **ac-theme-contrast-body**：纯函数断言两套主题下 `content-primary` 对 `surface-base` 对比度 ≥ 4.5，`content-secondary` 对 `surface-base` ≥ 3.0；并附一条数学自证（`#ffffff`/`#000000` = 21、对称、`relativeLuminance('#000000') = 0`），防「色板整体反了也能过」。
- **ac-theme-contrast-diff**：暗色下 `diff-added` / `diff-removed` / `diff-modified` / `diff-same` 对各自背景、以及对 `surface-base` 的对比度均 ≥ 3.0；**亮色下五个 `diff-*`（含 `conflict`）对各自 chip 背景 ≥ 4.5**（AA 小字）。**实现口径**：`same` 没有独立 `-soft` token，按 `surface-sunken` 作为其背景（prd 里「各自 `-soft`」在 `same` 上落到 `surface-sunken`，是既定 token 集合的直接结果，不是放宽阈值）。
- **ac-theme-light-legend-aa**：亮色 `same` / `added` / `removed` / `modified` / `conflict` 五色对 chip 底（`same` 用 `surface-sunken`，其余用同名 `-soft`）`contrastRatio >= 4.5`；`src/core/theme/contrast.test.ts` 从 `main.css` 文本实读该断言，旧值（≈3.0）必失败、新值通过。
- **ac-theme-four-states-distinct**：同一主题内 `same` / `added` / `removed` / `modified` 四色两两 CIE76 Lab ΔE ≥ 12；暗、亮两套主题分别成立（实测最小值：暗 58.3`removed/modified`、亮 53.7`removed/modified`，远高于阈值）。
- **ac-theme-no-hardcoded-color**：`src/renderer/src/**/*.{ts,tsx}`（非测试）中零 `#hex` / `rgb(` / `rgba(` / `hsl(` / `hsla(` 颜色字面量（`assets/icons/*.svg` 仅 `currentColor`，不在扫描范围）；同时断言扫描确实扫到真实文件（`main.css` 非空、renderer 文件数 > 20），防空集假绿。

### 切换 / 持久化 / 跟随系统

- **ac-theme-settings-section**：设置对话框存在主题分区（`SegmentedControl` → `role="tablist"`，aria-label 取自 i18n 的 `settings.theme`），含 light / dark / system 三个 `role="tab"` 选项，选中态与**当前模式**（含 `system` 本身）一致；两版字典的 `settings.theme*` 键成对可译。
- **ac-theme-applies-immediately**：点选任一主题后，同一事件循环内 `<html data-theme>` 变为解析后的 `light` / `dark`，`getComputedStyle(document.documentElement).colorScheme`（或等价的 `color-scheme` 断言）与之同步；无需重启。
- **ac-theme-no-remount**：连续切换主题三次，应用根（Workbench）挂载次数保持 1，DOM 根节点被替换次数为 0，会话状态不丢。
- **ac-theme-persists**：选择后 `writeUserSettings` 收到同时含 `language` 与 `theme` 的完整记录；用同一平台实例重建 `App` 后沿用上次主题（不回到默认）。
- **ac-theme-settings-merge**：先改语言再改主题、以及反向顺序两次操作后，持久记录中两者都在；旧记录 `{"language":"zh"}` 读回 `{language:'zh', theme:'dark'}`；`theme` 为未知字符串或非字符串时同样回退 `dark` 且不抛错（Electron IPC 与 Web `localStorage` 两条路各自断言）。
- **ac-theme-system-follows**：模式为 `system` 时 `data-theme` 等于 `matchMedia` 当前偏好；触发系统偏好变化事件后随之改变（无需重开设置）。
- **ac-theme-system-only-listener**：模式为 `light` / `dark` 时触发同一 `matchMedia` 变化事件，`data-theme` 不变；切离 `system` 后 matchMedia 监听已注销（监听注册数回到切换前）。
- **ac-theme-zero-io**：在已打开真实目录会话与文件会话的工作台上切换主题，`listDirectory` / `listDirectories` / `statPath` / `readTextFile` / `fileDigest` 的调用次数增量全为 0。
- **ac-theme-state-preserved**：切主题前后会话数量、tab 顺序与激活 tab、双栏 `scrollTop`、当前筛选值与折叠节点集合逐一相等。
- **ac-theme-write-failure-in-place**：主题写入失败时保持当前选择、就地显示既有 `settings.saveError` 文案，不关闭设置对话框、不回落旧主题。

### 原生主题 / 窗口背板 / 工具栏 band

- **ac-native-theme-mode-sync**：设置里依次切 `light` / `dark` / `system` 后，主进程 `nativeTheme.themeSource` 分别等于该模式（`system` 保持 `'system'`，不得被解析值钉死）；切换不重启、不重建窗口；未知 / 非法载荷被忽略且不向 renderer 抛错。
- **ac-native-theme-startup**：首个窗口创建前 `nativeTheme.themeSource` 已按 `userData/settings.json` 持久化模式设置；文件缺失 / 损坏 / 语言字段非法时回退 `DEFAULT_THEME`（`dark`），启动不中断，且不出现第二份设置读取 / 解析实现。
- **ac-native-theme-system-follow**：`system` 模式下渲染侧对 `matchMedia('(prefers-color-scheme: light)')` 的订阅与切换行为不变；OS 偏好翻转后原生菜单栏 / 标题区与窗口背板随之改变，无需重启或重建窗口。
- **ac-window-backdrop-token**：窗口背景色等于当前解析主题的 `surface-base` token 值（暗 `#0b0e12`、亮 `#ffffff`），由 `main.css` 解析结果比对断言；仓内不再存在与任一 token 值不等的背板字面量（旧 `#0b0d12` 必须消失），无第三个色值。
- **ac-window-backdrop-live**：主题切换后所有已打开窗口背板更新为新主题 `surface-base`；不 reload、不重建窗口，会话 / tab / 滚动位置不变。
- **ac-toolbar-band-single-surface**：`Workbench` app 顶栏与全部 5 处 `data-shell-level="view-toolbar"` band 共用 `shellLayout.ts` 导出的同一 band surface 类，取值为既有 `bg-surface-sunken`；任一处 band 出现其它 `bg-surface-*` token 即失败；亮暗两套下 band 与 `surface-base` / `surface-raised` 层级方向一致。
- **ac-no-new-palette**：不新增 `--color-*` 名称、不新增第二色板 / 第二个定义 token 的样式文件；`src/renderer/src/**` 非测试源码零新增 `#hex` / `rgb(` / `hsl(` 字面量；`themeSources.test.ts` 与 `contrast.test.ts` 全绿且既有阈值一个不放宽。
- **ac-core-untouched**：`src/core/**` 非测试文件零改动；未新增 `v8 ignore` / `c8 ignore`，未删除源码来取悦门禁。
- **ac-web-runtime-unaffected**：Web 运行时（`pnpm dev:web`）不提供原生主题能力也照常工作：切换仍只落 `<html data-theme>` + `color-scheme`，`App.theme` 断言全绿，无未处理 Promise 拒绝或控制台错误。
- **ac-native-chrome-preserved**：不新增自绘菜单栏 / 标题栏：菜单仍由 `Menu.setApplicationMenu(Menu.buildFromTemplate(createMenuTemplate(...)))` 提供，`BrowserWindow` 选项不出现 `frame:false` / `titleBarStyle` / `titleBarOverlay`；`createMenuTemplate` 的菜单项与快捷键结构不变。

### 真实控件链路与验收失败归因

- **ac-evidence-verdict-recorded**：`docs/evidence/theme-switch-verdict.md` 存在，结论为「产品正常 / 旧驱动伪失败」，同文含 21:15 与 21:32 两轮 E1 差异、实测 75.8 / 79.1 / 78.9 ms、证据绝对路径，并明示 21:15 的 `e1-light.png` / `e1-dark.png` 实际拍到其他前台应用、不能作主题证据。
- **ac-theme-tab-contract**：jsdom 挂真实 `App`，在 `[data-shell-entry="settings"]` 打开 Settings 后 `getByRole('tablist', { name: 'Theme' })` 存在且含 3 个 `role="tab"`；点 `Light` 后同一 `act` 内（不 `waitFor`）`documentElement.dataset.theme === 'light'` 且 `style.colorScheme === 'light'`。
- **ac-light-dark-light-sequence**：同一对话框依次点 Light → Dark → Light，`dataset.theme` / `colorScheme` 三跳为 `light` / `dark` / `light`；写设置队列依次为 `{language, theme:'light'}`、`{language, theme:'dark'}`、`{language, theme:'light'}`（每次都是完整记录）。
- **ac-native-mode-push**：上述三跳后 `platform.setNativeTheme` 末三次调用（忽略挂载那次）依次为 `'light'` / `'dark'` / `'light'`，推的是模式而非解析值；该方法抛错不影响 DOM 切换。
- **ac-persist-and-restart**：切换为 Light 后持久记录为 `theme: 'light'`；以同一存储卸载重挂 `App` 后 `dataset.theme === 'light'`（DOM 与持久值一致）。
- **ac-probe-classifies-hit-vs-product**：`scripts/theme-click-probe.mjs` 导出纯函数 `judgeThemeProbe({ hit, cdpMutated, domClickMutated })`，返回 `ok-cdp` / `driver-miss` / `product-no-switch`；`scripts/theme-click-probe.test.mjs` 覆盖三分支与退出码 0/1/2，并断言 `--help` 以 0 退出、不依赖第三方包。
- **ac-probe-control-facts**：探针为每个主题 tab 输出 `role`、所在 `tablist` 的 `aria-label`、`aria-selected`、`rect`，以及 `elementFromPoint` 命中元素的 `tagName / role / text / insideTarget`；判 `driver-miss` 时输出坐标处实际元素，判 `product-no-switch` 时输出「页面内 `.click()` 仍无 `data-theme` 变更」的事实。
- **ac-no-product-change**：本类改动只新增 `scripts/theme-click-probe.mjs`、`scripts/theme-click-probe.test.mjs`、`src/settings-theme-gate.test.tsx`、`docs/evidence/theme-switch-verdict.md`（外加按 growth 登记的 `.munk/baseline/test-debt.json`）；`src/renderer/src/**`、`src/main/**`、`src/shared/**`、`src/core/theme/**` 零改动，不新增色相、不改四态色 / token 语义、不放宽 WCAG 门。
- **ac-code-gates-green**：`pnpm lint` / `typecheck` / `test` / `build` 与 test-debt 门全绿；新测试抬高 `repoTestLines` 只许按 `scripts/test-debt-gate.mjs` 的 growth 机制登记（`from` = 当期基线、`to` = 实测值、`addedCases` = 新增用例数、理由写清），不得删弱既有断言腾行。

## 非目标

- 不做逐项配色可定制（I#5 十一条分组）、不做字体 / 字号 / 密度自定义，不做主题编辑器或额外的「高对比」模式；`light` / `dark` / `system` 就是全部模式。
- 不改对比 / 合并 / 扫描 / 摘要 / 快照算法与视图模型，不改四态（same / added / removed / modified / conflict）语义与快照格式——本域只改四态**颜色取值**，且只在新亮色块里给值，暗色沿用既有值。
- 不改 `SHELL_ENTRIES` 与其三档 presentation；主题分区只加在设置对话框内部，**不新增应用头入口、不新增 shell entry**、不改 `workbench` 布局表。
- 不新增图标包 / 不就地写 SVG / 不新增 npm 依赖（截图与测试均用已有 Electron / vitest）；不引入 CSS-in-JS 或第二套样式方案。
- 不把 `theme` 写进会话 / 快照 / 导出产物；不做每窗口独立主题、不做主题切换动效 / 过渡动画。
- 不做浏览器 / 真机 / 桌面点选（L3 由 product-qa 承接）；不新增长跑门禁。
- 不做真实窗口 GUI / 截图验收（真实窗口验收与 release 截图各归其写项），不派 QA 子项。
- 不重绘界面、不做整体 UI 重构 / 主题编辑器 / 新配色体系；不改字号 / 圆角 / 控件高 / 间距；不改四态计数、忽略开关、复制 / 导出、快照与对比 / 合并语义；不改 `CodeView` / 工具栏入口集合。
- 不新增自绘菜单栏 / 标题栏，不给 macOS 全局菜单栏着色，不改菜单项 / 快捷键体系 / 原生 About 面板；不新增依赖。
- 不改发布通道、签名口径、版本锚点、已公开 tag / Release / 资产。

## 实现约束

- **token 覆盖方式**：亮色块必须写在 `:root[data-theme='light']` 且与 `@theme` 变量名逐一对应；块要 unlayered 才能压过 Tailwind 默认值，不重复 `@theme` 结构、不改组件 class 名，组件继续只引用 token。
- **默认值与迁移理由**：缺省 / 损坏 / 未知 `theme` 一律解析为 `dark`；`system` 是显式选择项。理由：既有安装当前就是暗色，回退 `dark` 不让老用户升级后被动画风翻成亮色；`system` 必须由用户主动选，避免「首次启动就跟随 OS」这一未声明的行为变化。
- **写入不可丢字段**：`writeUserSettings` 是整文件覆盖写，因此调用方必须给全量 `UserSettings`；`SettingsDialog` 的 `chooseLanguage` / `chooseTheme` 从 context 读另一字段拼完整记录，并共用一条串行写队列，禁止出现只写 `theme` 把语言清空的路径。
- **启动读取**：`App` 用 `Promise.all([loadInitialLanguage, loadInitialTheme])` 并行读一次设置再挂 `Workbench`（解析期仍只渲染无文字 `StartupFrame`）；语言与主题值都不作 React `key`。**副作用已知**：启动期 `readUserSettings` 被调用两次（两条 loader 各一次），既有测试已按此显式改写（`App.settings.test.tsx` 断言 `second.read === 2`），后续若要合并成一次读取须同批改该断言。
- **matchMedia 可测性**：系统偏好读取只经 `window.matchMedia`（可在 jsdom 中替换 / 计数），不做真实 OS 探测；监听注册 / 注销必须成对，`useSyncExternalStore` 的 `subscribe` 依赖 `enabled`（= 模式为 `system`），`getSnapshot` 在非 `system` 时直接返回 `false`。
- **组件侧不直连设置**：主题状态只由 `ThemeProvider` 持有，组件读 `useTheme()`；`context` 在无 Provider 时回落到 `dark` 且 `setTheme` 为空操作，保证叶子组件单测不需要包裹 Provider。是否持久化由 `SettingsDialog` 决定，Provider 不做 IO。
- **对比度工具纪律**：断言只能读 `main.css` 文本（`readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'))`），不得把色值抄进测试；`parseThemeTokens` 找不到块要抛错。改任何 `--color-*` 取值都要让这张表与交付说明的实测比值同批更新。
- **亮色小字门槛**：`contrast.test.ts` 的「前景 / chip 底」断言按主题分档——亮色 ≥ 4.5、暗色 ≥ 3.0；阈值提升只作用于这一条，其余阈值（正文 4.5 / 次要 3.0 / ΔE 12 / 对 `surface-base` 3.0）不得放宽。改亮色前景必须同批重算对应 `-soft` 底并在交付说明附实测表；`tokens.test.ts` 的亮色取值 pin 同批更新。
- **兼容既有断言**：`src/main/platform/electron-platform.test.ts` 原「未知字段 `theme` 被丢弃」的用例按新契约**显式改写**为「缺 theme 升 `dark` / 已知 theme 保留 / 未知 theme 回退 `dark`」三条，不放宽匹配、不删用例；Web 平台补同构用例；`preload/index.test.ts` 的写入 payload 改为完整记录。
- **新增目录要进扫描根**：`src/renderer/src/theme/` 必须登记进 `src/renderer/src/i18n/mainScan.test.ts` 的 `SCAN_ROOTS`；新中文文案只能进 `messages/{zh,en}` 成对词典，不在组件里写字面量。
- **测试落点**：`src/core/theme/contrast.test.ts`（node）、`src/renderer/src/theme/theme.test.ts`（node）、`src/renderer/src/theme/themeSources.test.ts`（node 静态扫描）、`src/shared/platform/settings.test.ts`（node）、`src/renderer/src/App.theme.test.tsx`（jsdom，覆写 `clientWidth/clientHeight` 喂虚拟化树、替换 `matchMedia`、用计数型 `PlatformPort` 断言零 IO）；不新增测试依赖、不新增长跑门禁。
- **原生通道纪律**：`channels.ts` 只新增 `setNativeTheme` 一个白名单 channel；`PlatformPort` 上是**可选**方法，renderer 调用点必须容忍缺失并吞掉失败（主题切换绝不因原生通道报错而可见失败）；主进程 handler 用 `isTheme` 校验，非法值忽略、不抛。通知窗口背板走 `PlatformIpcOptions.onNativeThemeChanged` 测试 seam（与 `onCompareRequestsReady` 同风格），便于单测。
- **启动顺序与单一读取**：`whenReady` 内先 `readUserSettings()` 设 `themeSource`，再建窗口 / `launch.onAppReady()`；`readUserSettings` 从 `electron-platform.ts` 以窄接口导出复用，禁止复制文件路径或第二份解析逻辑。
- **背板映射必须由测试实读 `main.css` 证明**：`windowTheme.test.ts` 用 `@core/theme/contrast` 的 `parseThemeTokens` 比对两套主题的 `surface-base` 与 `WINDOW_BACKDROP` 相等（相等即证明是既有 token 值而非新色），并覆盖未知输入回退暗色。
- **band 常量不得改视觉**：`TOOLBAR_BAND_SURFACE` 两级取值必须与现状一致（`bg-surface-sunken`），不得扩散到非 toolbar 层级；`shellLayout.test.ts` 断言常量取值 + 全仓 band 消费扫描。
- **接线静态断言**：`createWindow` 不再出现 `#0b0d12`、存在 `nativeTheme.themeSource` 与 `nativeTheme.on('updated')`、无 `titleBarStyle` / `titleBarOverlay` / `frame:false`（沿用 `release-packaging.test.ts` 的源码静态断言手法）。
- **归因顺序不可倒置**：探针先证「坐标命中 tab」，再 CDP 点击 + `MutationObserver`，最后页面内 `el.click()` 复测；没有命中证据的 `appliedMsInPage: null` 只能记 `driver-miss`，不得写成 `product-no-switch`。截图（前台被其他应用遮挡时）不作主题证据，一律以 `documentElement.dataset.theme` / CDP 计算样式为准。
- **探针零依赖 / 可 import**：只用 Node 内置 `fetch` + 全局 `WebSocket`（同 `qa-driver/lib.mjs` 思路），顶层 `import.meta.url === pathToFileURL(process.argv[1]).href` 守卫，避免被 vitest import 时执行 CLI；参数 `--port`（默认 9601）/ `--label`（默认 `Light`）/ `--expect`（默认 `light`）/ `--timeout`（默认 2000）/ `--help`。
- **回归测试落点**：`src/settings-theme-gate.test.tsx`（`// @vitest-environment jsdom`），用 `createWebPlatformPort()` 覆写 `writeUserSettings` / `setNativeTheme`，经 `[data-shell-entry="settings"]` 打开真实对话框，用 `getByRole('tablist', { name: 'Theme' })` 定位，禁止文本坐标或 `querySelectorAll('button')` 兜底；新用例会抬高 `repoTestLines`，只按 growth 条目登记（本轮 `from` 51955 / `to` 52136 / `addedCases` 17），增幅 ≤ 400 行。

## 最近交付证明

- WI：`wi_intake_9e8f40030bb9fd90`（Settings 主题切换真伪判定 + 真实控件链路断言 + 可复用探针）
- 日期：2026-11-05
- 结果：code_gates passed（32 gates，attempt 001；`pnpm test` 159 files / 2451 passed + 1 skipped / 2452）。
- 覆盖摘要：新增 `docs/evidence/theme-switch-verdict.md` 固化 v0.2.24 窗口验收 E1 判定——产品正常、21:15 旧驱动为伪失败（缺 `hitTarget` 证据，截图实为其他前台应用），21:32 同实例实测 75.8 / 79.1 / 78.9 ms 生效，决定性证据取 CDP `dataset.theme` + 计算样式。新增 `src/settings-theme-gate.test.tsx`（jsdom）经 `[data-shell-entry="settings"]` 打开真实 Settings，用 `getByRole('tablist', { name: 'Theme' })` 覆盖 Light → Dark → Light 三跳的 DOM / `colorScheme`、完整 `UserSettings` 写队列、`setNativeTheme` 末三次模式推送、原生通道抛错不阻断切换、卸载重挂恢复 `light`。新增 `scripts/theme-click-probe.mjs`（纯函数 `judgeThemeProbe` 三态 + 命中/控件事实输出 + `--help`，零第三方依赖）与 `scripts/theme-click-probe.test.mjs`（三分支 + 退出码 0/1/2）。`src/renderer/src/**`、`src/main/**`、`src/shared/**`、`src/core/theme/**` 零改动；`repoTestLines` 51955 → 52136 按 growth 机制登记（`addedCases` 17）。
- 注：① 主题类验收失败先跑探针分 `driver-miss` / `product-no-switch`，不得凭 `appliedMsInPage: null` 判产品缺陷。② 前台被其他应用遮挡时截图不可作证据，只能看 CDP DOM / 计算样式。③ 回归测试必须用真实 Settings 控件与 `role=tablist/tab` 定位，文本坐标或 `querySelectorAll('button')` 兜底属无效覆盖。