# Domain: theme

亮 / 暗 / 跟随系统三态主题域：**同一组** `--color-*` token 在 `src/renderer/src/assets/main.css` 里给出暗色（Tailwind `@theme` 块）与亮色（`:root[data-theme='light']` 覆盖块）两套取值，渲染侧把选中模式解析成 `light` / `dark` 并同步到 `<html data-theme>` + `color-scheme`，`system` 模式经 `window.matchMedia('(prefers-color-scheme: light)')` 跟随 OS；模式随 `UserSettings` 持久化；另配一个零 DOM / 零 Electron 的对比度工具（从 `main.css` 文本读 token 值，算 WCAG 相对亮度 / 对比度与 CIE76 Lab ΔE）把「可读」与「四态可区分」变成 `pnpm test` 断言。本域管**双色板契约、模式解析与接线、设置持久化契约、对比度自证**；token 家族清单与视觉方向仍归 `design/foundations`，词条与词典面归 `i18n`，壳层入口清单归 `workbench`（本项不新增入口），发布面 / README 截图归 `release`。

## 范围

- **单一色板源（`src/renderer/src/assets/main.css`）**：暗色取值留在既有 `@theme` 块，亮色在**同文件**新增一个 `:root[data-theme='light']` 块，按**完全相同的 `--color-*` 名**逐个覆盖（当前 27 个名）；不新增 token 名、不新开第二套色板 / 第二个 CSS 文件、不复制 `@theme` 结构。差异语义 `--color-diff-{same,added,removed,modified,conflict}` 与 `-soft` 背景两套主题都在（`same` 无独立 `-soft`，沿用 `surface-sunken`）。
- **根节点承载（`applyTheme`）**：`document.documentElement.dataset.theme` 取 `light` / `dark`（永远不是 `system`），同一处写 `style.color-scheme`；根节点既有 `:root { color-scheme: dark }` 作为未挂载时的兜底。`useLayoutEffect` 在提交前落地，故点选同一事件循环内生效。
- **模式解析（纯函数，`src/renderer/src/theme/theme.ts`）**：`resolveTheme(theme, prefersLight)`（`system` → `prefersLight ? 'light' : 'dark'`，其它原样）、`applyTheme(resolved)`、`loadInitialTheme(platform)`（读设置失败 / 缺失 / 未知一律 `DEFAULT_THEME`，绝不抛错、绝不阻断启动）、`LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'`。
- **默认值与迁移（`src/shared/platform/settings.ts`）**：`THEMES = ['light', 'dark', 'system']`（设置对话框展示顺序），`DEFAULT_THEME = 'dark'`；`isTheme` 只接受三值。缺省 / 未知 / 非字符串 `theme` 一律回退 `dark`——既让既有安装保持当前暗色外观，也让 `system` 保持显式 opt-in。
- **`UserSettings` 契约**：`{ language, theme }` 两个字段同时存在。`parseUserSettings` 对缺失 `theme` 补 `DEFAULT_THEME`（旧记录 `{"language":"zh"}` 读回 `{language:'zh', theme:'dark'}`），对损坏值整体读作「无记录」，全流程不抛错；未知多余字段照旧丢弃。
- **设置对话框主题分区（`SettingsDialog`）**：语言分区之后新增主题分区，沿用 `SegmentedControl`，`aria-label` 取自 `settings.theme`，三个选项文案取 `settings.theme.{light,dark,system}`（en / zh 成对）；选中态读 `useTheme().theme`（含 `system`，不是解析后的值）。点选先切整窗（`setTheme`）再持久化，写失败沿用既有就地 `role="alert"` 文案、不回滚选择。
- **写入不可丢字段**：任一次写入都提交完整 `UserSettings`（`chooseLanguage` 带当前 theme，`chooseTheme` 带当前 language），经串行写队列落到 `PlatformPort.writeUserSettings`；Electron（`userData/settings.json`）与 Web（`localStorage` 单键 `opencompare.userSettings`）同一契约。
- **跟随系统（`ThemeProvider`）**：`theme === 'system'` 时经 `useSyncExternalStore` 订阅 `matchMedia` 的 `change`，监听只在 `system` 模式存在；显式 `light` / `dark` 下不订阅、不响应 OS 变化，切离 `system` / 卸载即 `removeEventListener`。jsdom 中可经替换 `window.matchMedia` 注入偏好，断言用计数型监听。
- **零 IO / 零重挂**：主题状态只活在 `ThemeProvider`，`Workbench` 不在其 `key` 上、也不被条件卸载——切主题不重扫目录、不重算摘要、不重读文件，会话、tab、激活项、滚动位置、筛选与折叠集合全部保持。
- **对比度工具（`src/core/theme/contrast.ts`）**：`parseThemeTokens(css)` 从 `main.css` 文本取两套 token 映射（找不到 `@theme` / `:root[data-theme='light']` 块即抛错，防静默空跑）、`relativeLuminance` / `contrastRatio`（WCAG）、`labDeltaE76`（CIE76）。零 DOM / 零 Electron，node 环境 vitest 直跑；断言读的是**真实样式表文本**而不是色值副本。
- **特殊：对话框内的主题分区不改壳层入口**：`SHELL_ENTRIES` / `SHELL_ENTRY_IDS` 与其三档 presentation 零变化；app 头不加主题入口、不新增 shell entry；主题选项不新增图标（若要图标只能取 `UI_ICON_ACTIONS` 既有动作名，本项未用）。
- **扫描根登记**：新增 `src/renderer/src/theme/` 已进 `src/renderer/src/i18n/mainScan.test.ts` 的 `SCAN_ROOTS`，新目录里的中文注释才会被扫描（否则假绿）。

## 验收

### 主题 token 与对比度

- **ac-theme-token-names-identical**：从 `main.css` 解析出的两套主题 `--color-*` token 名集合完全相等（亮色缺失任一既有名、或多出任何新名即失败，当前 27 / 27）；差异语义 `--color-diff-{same,added,removed,modified,conflict}` 及 `-soft` 两个主题都存在；每个取值都是单个 `#rrggbb` 字面量。
- **ac-theme-no-second-palette**：`src/renderer/src/assets/` 下只有 `main.css` 定义 `--color-*`；`src/renderer/src/**`（非测试）除 `main.css` 外零 `--color-*` 定义；亮色是同文件内的覆盖值，仓内无第二套 token 前缀 / 第二色板文件（同时断言 `main.css` 里确有 `@theme {` 与 `:root[data-theme='light'] {` 两块，防扫描空转）。
- **ac-theme-contrast-body**：纯函数断言两套主题下 `content-primary` 对 `surface-base` 对比度 ≥ 4.5，`content-secondary` 对 `surface-base` ≥ 3.0；并附一条数学自证（`#ffffff`/`#000000` = 21、对称、`relativeLuminance('#000000') = 0`），防「色板整体反了也能过」。
- **ac-theme-contrast-diff**：两套主题下 `diff-added` / `diff-removed` / `diff-modified` / `diff-same` 对各自背景、以及对 `surface-base` 的对比度均 ≥ 3.0。**实现口径**：`same` 没有独立 `-soft` token，按 `surface-sunken` 作为其背景（prd 里「各自 `-soft`」在 `same` 上落到 `surface-sunken`，是既定 token 集合的直接结果，不是放宽阈值）。
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

## 非目标

- 不做逐项配色可定制（I#5 十一条分组）、不做字体 / 字号 / 密度自定义，不做主题编辑器或额外的「高对比」模式；`light` / `dark` / `system` 就是全部模式。
- 不改对比 / 合并 / 扫描 / 摘要 / 快照算法与视图模型，不改四态（same / added / removed / modified / conflict）语义与快照格式——本域只改四态**颜色取值**，且只在新亮色块里给值，暗色沿用既有值。
- 不改 `SHELL_ENTRIES` 与其三档 presentation；主题分区只加在设置对话框内部，**不新增应用头入口、不新增 shell entry**、不改 `workbench` 布局表。
- 不新增图标包 / 不就地写 SVG / 不新增 npm 依赖（截图与测试均用已有 Electron / vitest）；不引入 CSS-in-JS 或第二套样式方案。
- 不把 `theme` 写进会话 / 快照 / 导出产物；不做每窗口独立主题、不做主题切换动效 / 过渡动画。
- 不做浏览器 / 真机 / 桌面点选（L3 由 product-qa 承接）；不新增长跑门禁。

## 实现约束

- **token 覆盖方式**：亮色块必须写在 `:root[data-theme='light']` 且与 `@theme` 变量名逐一对应；块要 unlayered 才能压过 Tailwind 默认值，不重复 `@theme` 结构、不改组件 class 名，组件继续只引用 token。
- **默认值与迁移理由**：缺省 / 损坏 / 未知 `theme` 一律解析为 `dark`；`system` 是显式选择项。理由：既有安装当前就是暗色，回退 `dark` 不让老用户升级后被动画风翻成亮色；`system` 必须由用户主动选，避免「首次启动就跟随 OS」这一未声明的行为变化。
- **写入不可丢字段**：`writeUserSettings` 是整文件覆盖写，因此调用方必须给全量 `UserSettings`；`SettingsDialog` 的 `chooseLanguage` / `chooseTheme` 从 context 读另一字段拼完整记录，并共用一条串行写队列，禁止出现只写 `theme` 把语言清空的路径。
- **启动读取**：`App` 用 `Promise.all([loadInitialLanguage, loadInitialTheme])` 并行读一次设置再挂 `Workbench`（解析期仍只渲染无文字 `StartupFrame`）；语言与主题值都不作 React `key`。**副作用已知**：启动期 `readUserSettings` 被调用两次（两条 loader 各一次），既有测试已按此显式改写（`App.settings.test.tsx` 断言 `second.read === 2`），后续若要合并成一次读取须同批改该断言。
- **matchMedia 可测性**：系统偏好读取只经 `window.matchMedia`（可在 jsdom 中替换 / 计数），不做真实 OS 探测；监听注册 / 注销必须成对，`useSyncExternalStore` 的 `subscribe` 依赖 `enabled`（= 模式为 `system`），`getSnapshot` 在非 `system` 时直接返回 `false`。
- **组件侧不直连设置**：主题状态只由 `ThemeProvider` 持有，组件读 `useTheme()`；`context` 在无 Provider 时回落到 `dark` 且 `setTheme` 为空操作，保证叶子组件单测不需要包裹 Provider。是否持久化由 `SettingsDialog` 决定，Provider 不做 IO。
- **对比度工具纪律**：断言只能读 `main.css` 文本（`readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'))`），不得把色值抄进测试；`parseThemeTokens` 找不到块要抛错。改任何 `--color-*` 取值都要让这张表与交付说明的实测比值同批更新。
- **兼容既有断言**：`src/main/platform/electron-platform.test.ts` 原「未知字段 `theme` 被丢弃」的用例按新契约**显式改写**为「缺 theme 升 `dark` / 已知 theme 保留 / 未知 theme 回退 `dark`」三条，不放宽匹配、不删用例；Web 平台补同构用例；`preload/index.test.ts` 的写入 payload 改为完整记录。
- **新增目录要进扫描根**：`src/renderer/src/theme/` 必须登记进 `src/renderer/src/i18n/mainScan.test.ts` 的 `SCAN_ROOTS`；新中文文案只能进 `messages/{zh,en}` 成对词典，不在组件里写字面量。
- **测试落点**：`src/core/theme/contrast.test.ts`（node）、`src/renderer/src/theme/theme.test.ts`（node）、`src/renderer/src/theme/themeSources.test.ts`（node 静态扫描）、`src/shared/platform/settings.test.ts`（node）、`src/renderer/src/App.theme.test.tsx`（jsdom，覆写 `clientWidth/clientHeight` 喂虚拟化树、替换 `matchMedia`、用计数型 `PlatformPort` 断言零 IO）；不新增测试依赖、不新增长跑门禁。

## 最近交付证明

- WI：`wi_ws_f4f0eb3a3385c708`（亮 / 暗 / 跟随系统三态主题 + README 真实截图收尾；本域只承接主题半边，`kind: feature`）
- 日期：2026-10-30
- 结果：`code_gates` passed（9 gates，attempt 001 全绿，`.munk/runs/run_ws_3fc79e114c62b643/code-gates/attempts/001`）；本轮 `needSelfTest=false`，UI 自测跳过。`pnpm test` 80 files / 1243 passed + 1 skipped / 1244。**新建本域**（此前 token 只归 `design/foundations`，无主题域记录）。
- 覆盖摘要：① **双色板单文件**——`main.css` 既有 `@theme`（暗色 27 个 `--color-*`）同批新增 `:root[data-theme='light']` 覆盖块（同 27 个名，取值全为 `#rrggbb`），无第二色板文件、无改名 token。② **解析 / 应用层**——新增 `src/renderer/src/theme/theme.ts`（`LIGHT_SCHEME_QUERY` / `resolveTheme` / `applyTheme` / `loadInitialTheme`）、`ThemeProvider.tsx`（`useSyncExternalStore` + `matchMedia` 仅在 `system` 订阅，`useLayoutEffect` 落地 `data-theme` 与 `color-scheme`）、`context.ts`（无 Provider 回落 `dark`）。③ **设置契约**——`UserSettings = { language, theme }`；`settings.ts` 增 `THEMES` / `DEFAULT_THEME='dark'` / `isTheme`，`parseUserSettings` 对缺失 theme 补 `dark`、未知 / 非字符串回退 `dark`、整体 try/catch 不抛错；`App.tsx` 并行 `loadInitialLanguage` + `loadInitialTheme` 后挂一次 `Workbench`。④ **设置对话框**——语言分区后新增主题分区（`SegmentedControl` + `settings.theme*` 双语文案，选中态为模式本身），写入走同一串行队列且始终提交完整记录，失败就地报错不回滚。⑤ **对比度工具**——`src/core/theme/contrast.ts` 从 `main.css` 文本解析两套 token 并算 WCAG 对比度 / CIE76 ΔE，零 DOM / 零 Electron；实测表：`content-primary`/`surface-base` 暗 16.15 / 亮 16.60（≥4.5），`content-secondary`/`surface-base` 暗 8.42 / 亮 7.05（≥3.0）；`diff-added` 暗 6.17（soft）/ 7.65（base）、亮 4.48 / 4.74；`diff-removed` 暗 4.96 / 5.76、亮 4.69 / 5.00；`diff-modified` 暗 6.76 / 8.40、亮 4.30 / 4.54；`diff-same`（对 `surface-sunken` / `surface-base`）暗 4.24 / 4.16、亮 5.01 / 5.42——全部 ≥ 3.0；四态最小 Lab ΔE 暗 58.3、亮 53.7（阈值 12）。⑥ **测试**：新增 `contrast.test.ts` / `theme.test.ts` / `themeSources.test.ts` / `settings.test.ts` / `App.theme.test.tsx`（5 文件 38 tests，覆盖 token 集合相等、单色板、无硬编码色、对比度与四态 ΔE、对话框分区与双语、点选即生效、三次切换不重挂、持久化与字段不互丢、system 跟随与仅 system 监听、零 IO 与状态保持、写失败不回滚）；同批重定标 `electron-platform.test.ts`（拆三条）/ `web-platform.test.ts` / `preload/index.test.ts` / `App.settings.test.tsx` / `resolveLanguage.test.ts` / `i18n/mainScan.test.ts`（新扫描根）。⑦ 未改范围：`src/core/**` 除新增 `src/core/theme/` 外零 diff；无算法 / 四态语义 / 快照格式改动；`SHELL_ENTRIES` 与三档 presentation 零变化；无新增依赖（`package.json` 仅新增 `screenshots` script）。
- 证据：`code_gates` attempt 001 九门全绿（install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate）；`test.log` 含 `src/core/theme/contrast.test.ts` / `src/renderer/src/theme/*` / `src/renderer/src/App.theme.test.tsx` / `src/shared/platform/settings.test.ts`；`git status` 主题面为 `main.css`、`App.tsx`、`SettingsDialog.tsx`、`settings.ts`、`types.ts`、两版 `settings.ts` 词典、6 份测试 + 新增 `src/core/theme/` 与 `src/renderer/src/theme/`。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/three-state-theme-and-token-contrast.md`。② **被推翻的假设**：`UserSettings` 不再是 `language` 单字段——任何写设置的路径都给全量 `{language, theme}`，旧记录按 `theme: 'dark'` 升级；既有「未知字段 theme 被丢弃」的断言已不存在，后续不要按旧契约写。③ **启动读两次设置**是并行 loader 的直接后果（`App.settings.test.tsx` 已锁 `read === 2`），要合并须同批改该断言。④ `diff-same` 没有 `-soft` token，对比度按其实际背景 `surface-sunken` 验；若未来给 `same` 加 soft 背景，须同批改 `main.css`、`contrast.ts` 的前景 / 背景配对与本节口径。⑤ 亮色取值目前是「同 token 名覆盖」，改配色只改 `main.css` 两个块里的值，绝不会碰组件；但每次改值都要重跑对比度 / ΔE 断言，否则可读性与四态区分会静默退化。⑥ 主题状态只在 `ThemeProvider`，`Workbench` 不得挂到主题 `key` 上——重挂会丢会话与滚动位置（`ac-theme-no-remount` / `ac-theme-state-preserved` 会红）。⑦ 主题未做真实 Electron 窗口点选复核（L3 归 product-qa）；jsdom 侧 `color-scheme` 断言依赖 `style.colorScheme`，未经真实 Chromium 计算样式验证。
