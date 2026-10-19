# Domain: desktop-shell

桌面外壳与品牌身份接线：Electron 主进程的窗口图标、macOS dock 图标、原生「关于」面板与原生应用菜单，以及三者共用的品牌名 / 图标路径纯逻辑。本域负责「同一份品牌资产在运行时被窗口、dock、关于面板一致使用」，资产文件本身与其打包/分发配置见域 `release`；renderer 不感知图标，不做应用内「关于」页面。业务功能与视觉基线（token / 组件 / 主屏）不属本域。

## 范围

- **品牌单一源**：`src/shared/brand.ts` 导出 `BRAND_NAME = 'OpenCompare'`、`resolveBrandIconPath` 与 `buildAboutPanelOptions`；纯逻辑、不 import Electron，主进程注入 `isPackaged` / `resourcesPath` / `appPath` / `version`，可被 vitest 直接导入断言。
- **运行时图标解析**：packaged 时返回 `<resourcesPath>/icon.png`（由 `extraResources` 放进去的入库 PNG），非 packaged 时返回仓库内 `build/icon.png`；两者是同一份自制资产，任平台输入下解析结果一致。
- **窗口与 dock**：`BrowserWindow` 的 `icon` 取 `resolveBrandIconPath` 结果；darwin 下 `app.dock?.setIcon` 使用同一解析结果，保证窗口、dock 与打包应用图标同源。
- **原生关于面板**：`app.setAboutPanelOptions(buildAboutPanelOptions({ version: app.getVersion(), iconPath }))`，固定 `applicationName: 'OpenCompare'`、`iconPath` 为上述同一 PNG、`applicationVersion` 来自入参（即 `package.json#version` 经 `app.getVersion()`）；源码不出现硬编码版本或 Electron 默认名称。
- **原生应用菜单**：`src/main/menu.ts` 导出纯数据模板 `createMenuTemplate({ isMac })`（不 import Electron 运行时），含 `role: 'about'` 菜单项（macOS 位于 appMenu，Windows/Linux 位于 Help 子菜单），并保留 `editMenu` / `viewMenu`（macOS 另有 `windowMenu`）以维持复制粘贴等既有快捷键；模板可被单测直接断言。

## 验收

- **ac-window-icon-same-asset**：创建 `BrowserWindow` 时 `icon` 取自已入库 PNG；darwin 下 `app.dock.setIcon` 使用同一解析结果；测试断言该解析函数在各平台输入下返回同一文件路径，且文件存在。
- **ac-about-panel-brand**：关于面板选项构造结果固定 `applicationName: 'OpenCompare'`、`iconPath` 为上述同一 PNG、版本来自入参；主进程以 `app.getVersion()` 调用 `app.setAboutPanelOptions`，源码中不出现硬编码版本或 Electron 默认名称。
- **ac-about-panel-version**：以 `package.json#version` 作为入参构造关于选项时，`applicationVersion`（及 `version` 字段，如设置）与该值严格相等，不写死任何具体版本号。
- **ac-about-menu-entry**：应用菜单模板含 `role: 'about'` 的菜单项（macOS 位于 appMenu，Windows/Linux 位于 Help 子菜单），且保留 `editMenu` / `viewMenu`（macOS 另有 `windowMenu`）以维持复制粘贴等既有快捷键；模板构造可被单测直接断言。

## 非目标

- 不做应用内「关于」页面或设置页、不做主题 / 视觉改版、不重排菜单或快捷键体系（本项只补 About 入口并保留既有 edit / view / window 菜单）。
- 不产出或修改图标资产本身，不改 `electron-builder.yml` 图标 / `extraResources` 配置（属域 `release`）。
- 不改对比算法、会话模型、`PlatformPort` 契约与任何视图行为；renderer 不感知图标。
- 不为 Windows / Linux 桌面做外观级人工验收；不在本项执行签名、公证、打 tag 或 publish。

## 实现约束

- 路径与关于选项的纯逻辑放 `src/shared/`（可被 vitest 导入），不 import Electron；Electron 相关副作用（`app.dock` / `Menu.setApplicationMenu` / `app.setAboutPanelOptions`）只留在 `src/main/index.ts`。
- `src/main/menu.ts` 模板只做纯数据（类型导入允许），便于单测断言 `role: 'about'` 与保留菜单项，避免拉起 Electron 运行时。
- 品牌名与图标路径必须同源：`BRAND_NAME` 单一常量，窗口 / dock / 关于面板共用一次 `resolveBrandIconPath` 结果，禁止三处各写一份路径或名称。
- 既有 `release-packaging.test.ts` 断言全部保留，只做增量扩展；不得删除或放宽已有断言。
- 不新增依赖；`AGENTS.md` 视觉基线（token 唯一来源）不因本域改动。

## 最近交付证明

- WI：`wi_ws_ecadd56de3f4c523`（窗口 / dock / 原生关于面板 / 原生菜单共用自制品牌资产）
- 日期：2026-10-20
- 结果：code_gates passed（install / lint / typecheck / build / build:web / test 全绿；跳过 UI 自测 `needSelfTest=false`）。
- 覆盖摘要：
  - 新增 `src/shared/brand.ts`：`BRAND_NAME`、`resolveBrandIconPath`（packaged → `<resourcesPath>/icon.png`，dev → `<appPath>/build/icon.png`）、`buildAboutPanelOptions`（版本由调用方注入，不硬编码）。
  - 新增 `src/main/menu.ts`：纯数据 `createMenuTemplate({ isMac })`，macOS appMenu 含 `role: 'about'` + services/hide/quit，Windows/Linux 在 Help 子菜单放 About；三端均保留 `editMenu` / `viewMenu`（macOS 另有 `windowMenu`）。
  - `src/main/index.ts`：`whenReady` 内先解析一次 `iconPath`，`app.setAboutPanelOptions(buildAboutPanelOptions({ version: app.getVersion(), iconPath }))`，`Menu.setApplicationMenu(Menu.buildFromTemplate(...))`，darwin 下 `app.dock?.setIcon(iconPath)`，`BrowserWindow` 增 `icon: iconPath`；`title` 改用 `BRAND_NAME`；`activate` 重建窗口复用同一路径。
  - `src/main/release-packaging.test.ts`：新增窗口 / dock 同源断言（源码含 `resolveBrandIconPath(`、`icon: iconPath`、`app.dock?.setIcon(iconPath)`，且多次解析返回同一存在文件）与关于面板断言（`applicationName === 'OpenCompare' === BRAND_NAME`、`iconPath` 与解析结果同源、`applicationVersion` 与 `package.json#version` 严格相等）、菜单模板断言（About role 位置 + edit/view/window 菜单保留）。
- 注：本域为新增域，上一轮同类能力没有归属域（打包侧在 `release`）。本轮未改 `appId` / 打包目标 / 发布模型，未升版本、未新增依赖；关于入口只走 `app.setAboutPanelOptions` + 菜单 About role，未新造 renderer 页面。
