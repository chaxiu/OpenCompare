# OpenCompare

对标的 **Beyond Compare 5 Pro** 的现代跨平台桌面对比与三向合并工具。基于 Electron + React 19 + TypeScript，一套代码同时构建桌面应用与浏览器预览。

> ✅ **当前发布状态：v0.2.6 已发布；最新公开 Release 为 [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6)。** v0.2.6 修复 Windows 绝对路径在四个入口（CLI 参数、单实例接管、手工输入、`opencompare://`）被拼到 cwd / baseDir 的问题，盘符 / 盘根 / UNC 输入按原样解析，见 [`docs/release-notes/v0.2.6.md`](docs/release-notes/v0.2.6.md)。macOS 安装包（`.dmg` / `.zip`）经 **Developer ID 签名 + Apple 公证** 流程产出，由 tag 触发的 GitHub Actions 发布为每个版本唯一的公开 Release。公证走 **App Store Connect API Key 模式**，6 项凭据（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）由人类按标准协助机制录入 GitHub Secrets（只进 CI Secrets，不入库）；任一缺失时 macOS 打包显式失败（fail-closed），绝不产出未签名裸包。签名 + 公证在发版时由 CI 执行，实际结果以 tag 触发的那次 CI 为准。凭据清单见 [`docs/release-signing.md`](docs/release-signing.md)。

对开发者与运维团队最常用的四类对比，OpenCompare 内置了可直接试跑的完整样本，并支持打开/保存本地真实文件：

## 版本与下载

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) | 已发布（最新公开 Release） | Windows 绝对路径四入口修复（盘符 / 盘根 / UNC），见[发布说明](docs/release-notes/v0.2.6.md) |
| [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5) | 已发布（上一版） | 多轮内存收敛、取消零日志噪声、符号链接「不跟随」计数口径，见[发布说明](docs/release-notes/v0.2.5.md) |
| [v0.2.4](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4) | 已发布 | 承接 v0.2.3 未发布内容，并合入目录对比批量扫描、进度与取消、窗口化目录树等修复，见[发布说明](docs/release-notes/v0.2.4.md) |
| v0.2.3 | 未发布，内容并入 v0.2.4 | 从未打 tag、从未公开 Release；用户可见改动全部见 v0.2.4 |
| [v0.2.2](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2) | 已发布 | 大目录对比 EMFILE 修复 |

下载 v0.2.6：[公开下载页](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) · macOS [dmg](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64.dmg) / [zip](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64-mac.zip) · Windows [OpenCompare-Setup-0.2.6.exe](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-Setup-0.2.6.exe) · Linux [AppImage](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6.AppImage) / [deb](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/opencompare_0.2.6_amd64.deb)

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

打包配置见根目录 `electron-builder.yml`（macOS / Windows / Linux 目标）。macOS 目标已配置 Developer ID 签名（证书经 `CSC_LINK` / `CSC_KEY_PASSWORD` 注入，签名身份钉住 `Tao Zhu (3X4J53U6RY)`（配置里不写 `Developer ID Application:` 前缀））与 App Store Connect API Key 公证（`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`；`APPLE_TEAM_ID` 为 `3X4J53U6RY`），凭据一律由人类录入 GitHub Secrets，仓内不落明文；`APPLE_API_KEY` 的 `.p8` base64 只在 CI 打包前解码到 `$RUNNER_TEMP` 权限 `600` 的临时文件，打包后清理。缺任一凭据时 macOS 打包步骤**显式失败**（fail-closed），绝不产出未签名裸包。本地只打包当前平台；多平台产物由 CI 生成。凭据清单与协助文案见 [`docs/release-signing.md`](docs/release-signing.md)。

## 发布流程

推送 `v*` 标签即触发 GitHub Actions（`.github/workflows/release.yml`）。若 tag 已推送但 Release 未完成，可从 `main` 手动触发同一工作流的 `workflow_dispatch`，输入已存在的 `tag`（默认 `v0.2.6`）；构建统一 checkout `refs/tags/<tag>`，不改 tag、不升版本。

1. 先在 Ubuntu runner 上跑门禁（`install → lint → typecheck → test → build`），并在安装/测试前跑只读祖先门（`v0.1.2` 必须是 `HEAD` 严格祖先，或仅 tag 可达提交逐条补丁等价）与 `package.json#version` / tag 语义版本一致性校验，失败即中止发布；
2. 门禁通过后，在 macOS / Windows / Linux 三个 runner 上分别构建平台产物；macOS 步骤要求上述 6 项签名 / 公证 Secrets 齐备，任一缺失即失败（fail-closed）；
3. 各平台断言产物文件名与 `latest*.yml` 内的 `version` / `files[].url` 均等于 tag 版本；本地打包后可先跑 `pnpm release:metadata --dir release`，校验每份 `latest*.yml` 的 `files[].url` 全部命中 `release/` 资产名、Windows 安装包为连字符形态且旧错位名 0 命中，再汇聚上传到该 tag 的唯一 Release；
4. macOS 打包后对实际 `.app` 执行 `codesign --verify --deep --strict`、`xcrun stapler validate`、`spctl -a -vv` 硬校验，并断言图标、bundle 身份与版本，任一失败即终止且不上传；`finalize` 后断言该 tag 恰好一个公开（非 Draft、非预发布）Release，且资产覆盖三平台与 `latest*.yml`。

## 项目结构

```
src/main/       Electron 主进程：窗口生命周期、IPC handler、真实文件系统访问
src/preload/    contextBridge 安全桥接，仅暴露白名单 IPC channel
src/core/       纯算法与领域模型（差异 / 合并 / CSV 对齐 / 目录对比 / 快照），零 Electron / DOM 依赖
src/renderer/   React 19 UI：工作台、四个场景视图与基础组件
src/shared/     跨进程共享类型、PlatformPort 契约、IPC channel 白名单与内置样本
```

## 已知问题

- **Windows 绝对路径在四个入口被拼到 cwd / baseDir（Issue #3）**：v0.2.5 及更早版本在 Windows 上经 CLI 冷启动（`--left` / `--right`）、单实例接管（应用已运行时再次启动）、新建对比手工输入、`opencompare://` 链接传入 `C:\…` 这类绝对路径时，路径会被拼到 cwd / baseDir 后面（Issue 原文症状：`C:\path\to\file1` 被解成 `C:\path\to\/C:\path\to\/file2`，文件名被吞）。**已在 v0.2.6 修复**：四个入口一律按绝对路径解析，盘符 / 盘根 / UNC 输入按原样解析，`..` 不越过盘根 / 共享根。回归由 [`src/shared/compareRequest.test.ts`](src/shared/compareRequest.test.ts) 的盘符 / 盘根 / UNC 六例覆盖，`windows-latest` run [`39890047849`](https://github.com/chaxiu/OpenCompare/actions/runs/39890047849) 为 46 tests passed；详见 [Issue #3](https://github.com/chaxiu/OpenCompare/issues/3)。
- **悬空符号链接 / 不可读项会让目录对比整体失败**：v0.2.2 及更早版本在真实工程目录含悬空符号链接或不可读项时，目录列举、扫描、对比与快照构建会整体失败。当前版本已修复：悬空链接作为一条普通链接条目照常参与比较；只有 EACCES / ELOOP 等真正不可读的条目或目录才被跳过，并按左、右两侧分列计入「已跳过」计数，对比照常完成。
- **符号链接口径：不跟随符号链接**：目录扫描不进入链接目标目录，链接自身作为一条叶条目参与 `same / added / removed / modified`；悬空链接同样参与比较，仅不可读条目按左右分列计入跳过。计数、下钻与快照影响见 [`docs/symlink-no-follow.md`](docs/symlink-no-follow.md)。
- **大目录对比可能耗尽文件句柄（EMFILE）**：v0.2.1 及更早版本拖入含数千个文件的真实文件夹时，目录内容读取会一次性并发打开全部文件，可能报 `platform:read-text-file EMFILE` 并中断对比。当前版本已修复：目录内容读取与目录条目元数据查询改为默认 8 路的有界并发，文件句柄耗尽时经工作台既有提示就地展示「文件句柄耗尽（EMFILE）」的可读错误，不再崩溃窗口。
- **同进程连续多轮大目录对比内存增长**：v0.2.4 及更早版本的同进程连续多轮对比，主进程内存从 849 MB 增长到 1,510 MB，峰值偏高。**已在 v0.2.5 修复**：摘要缓存改为有上限的 LRU，并在关闭或替换会话时显式释放该会话条目。真实 DawnChat ↔ ZenMind 同进程连续 3 轮实测，renderer 峰值由修复前基线 `1,960,394,752` B 降到 `1,257,750,528` B，第 3 轮增量降到 `71,286,784` B 并进入阈值内；数字与判定见 [`docs/perf/large-directory-memory.md`](docs/perf/large-directory-memory.md) 与 [`docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`](docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json)。
- **取消时主进程 stderr 出现 `ECANCELED` 日志噪声**：v0.2.4 及更早版本取消目录对比或同步时，主进程 stderr 会输出 `ECANCELED` 相关日志。**已在 v0.2.5 修复**：取消改为结构化返回值且不穿越 IPC handler 边界，一次取消的主进程 stderr 实测零 `Error occurred in handler`、零 `OperationCancelledError`、零 `ECANCELED`；该口径由 [`pnpm test:cancel`](src/cancel-gate.test.ts)（`cancel-gate` 门禁）持续断言。

## 许可

[MIT](./LICENSE)
