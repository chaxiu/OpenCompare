# electron-builder-targets

covers: ac-builder
标题: electron-builder 已配置并可解析出 macOS / Windows / Linux 打包目标
步骤: 读取 `electron-builder.yml`（或 `package.json` 的 build/scripts 字段），并用 `pnpm exec electron-builder --help`（不实际执行跨平台打包）核对配置可被解析
期望: 存在 electron-builder 配置，声明 macOS（dmg / zip）、Windows（nsis）、Linux（AppImage / deb）三类目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts 且 electron-builder 为 devDependency；配置可被 electron-builder 解析（无未知字段报错），本地不触发多平台编译

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: electron-builder.yml 声明 mac: dmg+zip / win: nsis / linux: AppImage+deb（含 appId、directories.output=release、files out/**）；package.json 有 dist / dist:mac / dist:win / dist:linux scripts，electron-builder ^26.15.3 在 devDependencies。`pnpm exec electron-builder --help` 正常解析 CLI（含 --mac/--linux/--win）；实测已用该配置本机产出 release/OpenCompare-0.1.0-arm64.dmg + -mac.zip（无未知字段报错），未触发多平台编译。
