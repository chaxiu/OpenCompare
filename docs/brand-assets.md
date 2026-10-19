# 品牌资产：自制图标与替换说明

OpenCompare 的应用图标是**纯自制**资产（双栏对比 / 分叉合并意象，纯几何图形），不包含 Electron 默认图标或任何第三方版权素材。整套资产**可替换**：品牌方只需替换同路径的源文件并重新生成，打包配置与主进程接线无需改动。

## 资产路径

| 文件 | 用途 |
| --- | --- |
| `build/icons/icon.svg` | 唯一可编辑源（1024×1024 视口，圆角矩形 + 线性渐变） |
| `build/icon.png` | 1024×1024 主图标：窗口图标、macOS dock、Linux 打包图标、打包内 `resources/icon.png` |
| `build/icon.icns` | macOS 应用图标（`electron-builder.yml` 的 `mac.icon`） |
| `build/icon.ico` | Windows 应用图标（`electron-builder.yml` 的 `win.icon`） |
| `build/icons/icon-{16,32,64,128,256,512,1024}.png` | 多尺寸 PNG，供商店 / 文档 / 其它渠道复用 |

## 再生成

```bash
node build/icons/generate-icons.mjs
```

脚本只使用 Node 标准库（`zlib` 压缩 + 内置光栅化），会读取 `build/icons/icon.svg` 并覆盖写入上述全部产物，产物路径固定、可重复执行。生成后请提交二进制产物。

## 替换步骤

1. 编辑 `build/icons/icon.svg`（保持 1024×1024 视口，图形用 `<rect>` 与 `<linearGradient>` 描述）；
2. 运行 `node build/icons/generate-icons.mjs` 重新生成 PNG / icns / ico；
3. 提交 `build/` 下全部变更，`pnpm test` 会校验图标存在、格式、尺寸与打包配置一致性。

## 接线位置

- `electron-builder.yml`：`mac.icon` / `win.icon` / `linux.icon` 指向上述入库文件，`extraResources` 把 `build/icon.png` 复制为打包根 `icon.png`。
- `src/shared/brand.ts`：`BRAND_NAME`、运行时图标路径解析（`resolveBrandIconPath`）与关于面板选项构造（`buildAboutPanelOptions`）。
- `src/main/index.ts`：`BrowserWindow.icon`、macOS `app.dock.setIcon`、`app.setAboutPanelOptions`（版本取 `app.getVersion()`）。
- `src/main/menu.ts`：原生菜单 About 项（macOS 在应用菜单，Windows/Linux 在 Help 菜单）。
