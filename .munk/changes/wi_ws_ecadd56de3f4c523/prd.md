# 自制品牌图标与打包 / 窗口 / 关于接线

## 范围

- 新增一套纯自制的 OpenCompare 品牌图标资产（仓库当前图标文件数为 0）：
  - 单一可编辑源 `build/icons/icon.svg`（双栏对比 / 分叉合并意象，纯几何图形）；
  - 由源生成并入库的多尺寸 PNG（至少 16 / 32 / 64 / 128 / 256 / 512 / 1024，1024 同时作 Linux 与运行时图标）；
  - macOS `build/icon.icns`、Windows `build/icon.ico`；
  - 生成脚本可重复执行，产物路径固定，替换品牌只需替换源并重跑。
- `electron-builder.yml`：显式配置 `mac.icon` / `win.icon` / `linux.icon`，新增 `extraResources` 把 1024 PNG 放进打包应用 `resources/icon.png`；不改 `appId`、`productName`、targets、notarize 与 publish 模型。
- 主进程接线：`BrowserWindow` 使用入库 PNG 作窗口图标，macOS 同时以同一路径设置 dock 图标；新增原生应用菜单 About 项，并通过 `app.setAboutPanelOptions` 统一展示品牌标识、应用名 `OpenCompare` 与 `app.getVersion()` 版本。
- 新增 `docs/brand-assets.md`：说明这是自制、可替换的品牌资产，列出资产路径、生成命令与替换步骤。
- 扩展现有 `src/main/release-packaging.test.ts` 断言组（不改既有断言），覆盖图标存在 / 格式 / 打包配置一致 / 窗口与关于同源 / 版本来源。

## 验收

- ac-icon-assets-valid: `build/icons/icon.svg`、`build/icon.png`、`build/icon.icns`、`build/icon.ico` 及 16–1024 多尺寸 PNG 均存在且非空；PNG 以 `89 50 4E 47` 开头且主图标为 1024×1024，icns 前 4 字节为 `icns`，ico 头 6 字节为 `00 00 01 00 01 00`。
- ac-builder-icons-wired: 解析 `electron-builder.yml` 后，`mac.icon`、`win.icon`、`linux.icon` 均非空且分别指向上述实际存在的入库文件；宿主平台之外的两项同样配置齐全。
- ac-runtime-icon-resource: `electron-builder.yml` 的 `extraResources` 含把 `build/icon.png` 复制为打包根 `icon.png` 的条目；纯路径解析函数在 packaged 时返回 `<resourcesPath>/icon.png`，非 packaged 时返回仓库内 `build/icon.png`，两者都指向同一份入库 PNG。
- ac-no-electron-default: 三平台图标配置均显式指向 `build/` 下入库资产（不依赖 electron-builder 默认 `electron.icns` / `electron.ico`）；当测试机可定位 Electron 分发目录中的默认 `electron.icns` 时，断言其 SHA-256 与本仓 `build/icon.icns` 不同。
- ac-window-icon-same-asset: 创建 `BrowserWindow` 时 `icon` 取自已入库 PNG；darwin 下 `app.dock.setIcon` 使用同一解析结果；测试断言该解析函数在各平台输入下返回同一文件路径，且文件存在。
- ac-about-panel-brand: 关于面板选项构造结果固定 `applicationName: 'OpenCompare'`、`iconPath` 为上述同一 PNG、版本来自入参；主进程以 `app.getVersion()` 调用 `app.setAboutPanelOptions`，源码中不出现硬编码版本或 Electron 默认名称。
- ac-about-panel-version: 以 `package.json#version` 作为入参构造关于选项时，`applicationVersion`（及 `version` 字段，如设置）与该值严格相等，不写死任何具体版本号。
- ac-about-menu-entry: 应用菜单模板含 `role: 'about'` 的菜单项（macOS 位于 appMenu，Windows/Linux 位于 Help 子菜单），且保留 `editMenu` / `viewMenu`（macOS 另有 `windowMenu`）以维持复制粘贴等既有快捷键；模板构造可被单测直接断言。
- ac-brand-docs-replaceable: `docs/brand-assets.md` 存在，含「自制」「可替换」表述、四个核心资产路径（svg / png / icns / ico）与再生成命令；测试断言这些字符串与路径均可检索。
- ac-release-gates-green: 本项不新增依赖，`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:web` 全部通过。

## 非目标

- 不改 `appId`（保持 `com.opencompare.app`）、`productName`、发布模型与 `release.yml` 的打包 / 发布 / 公证流程。
- 不升版本号、不改 CHANGELOG / Release Notes、不动 v0.1.2 tag 与资产（版本收敛属 Wave 2 的 version-bump）。
- 不做应用内「关于」页面或设置页、不做主题 / 视觉改版、不重排菜单或快捷键体系。
- 不新增运行时或开发依赖，不引入在线图标生成服务，不使用 Electron 默认图标或任何第三方版权图标。
- 不改对比算法、会话模型、`PlatformPort` 契约与任何视图行为。
- 不在本项执行签名、公证、打 tag、push、publish 或创建 Release。
- 不做 win / linux 真机与打包 `.app` 的人工点选验收（`needSelfTest=false`），桌面外观由后续 product-qa 批次门覆盖。

## 实现约束

- 品牌名统一 `OpenCompare`；图标与关于信息必须同源，禁止三处各写一份。
- 图标资产唯一入库位置为 `build/`（及 `build/icons/`），二进制产物必须提交；生成仅使用 Node 标准库与本机现有系统工具（如 macOS `iconutil`），不新增依赖。
- 路径与关于选项的纯逻辑放在可被 vitest 直接导入的 shared 模块（不 import Electron），主进程注入 `isPackaged` / `resourcesPath` / `appPath` / `version`；renderer 不感知图标。
- 关于入口只走原生：`app.setAboutPanelOptions` + 菜单 About role，不新造 renderer 页面。
- 既有 `release-packaging.test.ts` 断言全部保留，只做增量扩展；不得删除或放宽已有断言。
- `AGENTS.md` 的视觉基线（token 唯一来源）不因本项改动；不需要新增 CSS token。
