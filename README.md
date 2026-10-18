# OpenCompare

对标的 **Beyond Compare 5 Pro** 的现代跨平台桌面对比与三向合并工具。基于 Electron + React 19 + TypeScript，一套代码同时构建桌面应用与浏览器预览。

对开发者与运维团队最常用的四类对比，OpenCompare 内置了可直接试跑的完整样本，并支持打开/保存本地真实文件：

## 核心能力

- **目录对比与增量同步**：多层嵌套双目录树对比，按大小 / 修改时间 / 内容哈希分类 `相同 / 新增 / 删除 / 修改`；支持增量同步与镜像同步的**干跑预览**（先看清单再落盘），同步后自动刷新对比结果。
- **跨层级模板归位**：把散落在随机目录层级中的文件，按模板目录结构匹配并归位提取；提取后复核已写入槽位（已匹配 / 缺失 / 冲突）。
- **快照协议（`.ocsnap.json`）**：把真实目录导出为带元数据与 SHA-256 的规范化快照文档，可导入挂载为任意一侧并重新对比；内置「本地目录 ↔ 远端服务器快照」样本。
- **代码双栏 Diff 与 3-Way Merge**：行级 + 行内字符级差异高亮、同步滚动、逐差异块覆写与重置；三向合并（base · ours · theirs）按行切分 diff3 求解冲突块，逐块点选采纳，全部解决后复制或保存合并结果。
- **千行 CSV 主键对齐**：CSV / TSV 按用户选择的主键列对齐行，容忍行乱序、列偏移与单侧多余列；虚拟滚动承载千行表格，差异单元格高亮 `左 → 右`，并可按时态过滤。
- **JSON / YAML 语义对比**：解析后按 JSON Pointer 节点路径比对，忽略键序、注释、缩进等格式噪音，区分 `新增 / 删除 / 修改 / 类型变更`。
- **真实本地文件 IO**：代码 / CSV / JSON·YAML 各视图顶栏均可直接打开本地文件并即时重算对比；三向合并结果可保存到本地文件。

平台能力统一收敛在 `PlatformPort` 之后：Electron 运行走原生对话框与真实文件系统，浏览器预览走内存文件系统并在保存时触发下载；渲染层不直接依赖 Electron API。

## 环境要求

- Node.js >= 20.19
- pnpm 10（`packageManager` 固定为 `pnpm@10.18.3`）

## 本地开发

```bash
pnpm install

pnpm dev        # 启动 Electron 桌面窗口
pnpm dev:web    # 浏览器预览模式（内存 PlatformPort，无需 Electron）
```

## 质量门禁

```bash
pnpm lint       # ESLint（flat config）
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest（核心算法零 Electron / DOM 依赖，可直接单测）
pnpm build      # electron-vite 构建 main / preload / renderer
pnpm build:web  # 浏览器版静态产物
```

## 构建与打包

```bash
pnpm build            # 先生成 out/ 三个进程包
pnpm dist             # 当前平台打包
pnpm dist:mac         # macOS：dmg / zip
pnpm dist:win         # Windows：nsis
pnpm dist:linux       # Linux：AppImage / deb
```

打包配置见根目录 `electron-builder.yml`（macOS / Windows / Linux 目标）。**不做代码签名与公证**，本地只打包当前平台；多平台产物由 CI 生成。

## 发布流程

推送 `v*` 标签即触发 GitHub Actions（`.github/workflows/release.yml`）：

1. 先在 Ubuntu runner 上跑门禁（`install → lint → typecheck → test → build`），失败即中止发布；
2. 门禁通过后，在 macOS / Windows / Linux 三个 runner 上分别构建平台产物；
3. 产物自动发布到对应的 GitHub Release。

## 项目结构

```
src/main/       Electron 主进程：窗口生命周期、IPC handler、真实文件系统访问
src/preload/    contextBridge 安全桥接，仅暴露白名单 IPC channel
src/core/       纯算法与领域模型（差异 / 合并 / CSV 对齐 / 目录对比 / 快照），零 Electron / DOM 依赖
src/renderer/   React 19 UI：工作台、四个场景视图与基础组件
src/shared/     跨进程共享类型、PlatformPort 契约、IPC channel 白名单与内置样本
```

## 许可

[MIT](./LICENSE)
