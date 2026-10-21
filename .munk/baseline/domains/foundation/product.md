# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链初始化、平台抽象（PlatformPort）与质量门禁。本域不含任何业务功能。

## 范围

- 从空仓初始化 OpenCompare 跨平台桌面工程（`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`）。
- 安装本栈官方/主流 Skill 到 worktree `.agents/skills/`，并写薄 `AGENTS.md` 路由。
- 打通双模运行架构：`PlatformPort` 抽象 + Electron IPC 实现 + Web/内存实现，renderer 仅依赖 `PlatformPort`。
- **平台文件 IO 能力（`PlatformPort.selectFile` / `saveFile`）**：原生打开文件对话框返回所选绝对路径（取消 `null`）；保存对话框 + `node:fs/promises` 写盘返回目标路径（取消 `null`）；options 支持 `title` / 扩展名 `filters` / `defaultPath`。三处实现齐备且行为一致：Electron（`dialog.showOpenDialog`/`showSaveDialog`）、preload channel 白名单（`src/shared/platform/channels.ts`）、Web 内存实现（隐藏 file input 物化到内存 FS；保存写内存 FS 并尽力触发下载）。
- **目录列表能力（`PlatformPort.listDirectory`）**：Electron 实现 `readdir({ withFileTypes: true })` 后逐条 `stat` 取 `name` / `path` / `isDirectory` / `size` / `modifiedMs`；逐条 `stat` 的 fan-out 自 v0.2.1 之后的版本起经 `@core/io` 的 `mapWithLimit` 走有界窗口（默认 8），返回顺序与字段与逐条串行结果一致。限流与句柄错误文案归 `io-concurrency` 域，本域不重复实现。
- **列举与读文件的不可读项容错（`listDirectory` / `readTextFile`，横切契约归 `io-tolerance` 域）**：`stat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败时退回 `lstat`，条目保留并标注 `broken` + 非空 `skippedReason`（`DirectoryEntry` 仅增可选字段）；`lstat` 也失败仍按 broken 返回；根目录 `readdir` 失败仍 reject 但给出「无法读取目录 <path>：…」中文可读错误。`read-text-file` 对真实路径（含悬空链接 / 不可读文件）返回「无法读取文件 <path>：…」，经 IPC 不含 `Error invoking remote method` 前缀。`PlatformPort` 不新增方法、不改既有 channel。
- 预装核心运行时依赖（diff / node-diff3 / papaparse / @tanstack/react-virtual / yaml / jsonc-parser / lucide-react）与开发测试依赖（vitest / @testing-library/react / eslint / typescript）。
- 配齐单命令质量门禁：`install` / `lint` / `typecheck` / `build` / `test`（各自单条 argv）。

## 验收

- **ac-skills-agents**：worktree 存在非空 `AGENTS.md`，路由表指向 `.agents/skills/` 下与本栈对应的官方/主流 Skill；未用无关 Skill 凑数。
- **ac-scaffold**：根目录存在 electron-vite 结构工程（`package.json` + `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared`），`install` 门禁可成功完成依赖安装。
- **ac-deps**：`diff` / `node-diff3` / `papaparse` / `@tanstack/react-virtual` / `yaml` / `jsonc-parser` / `lucide-react` / `vitest` 均已在 `package.json` 声明且可被 typecheck 解析。
- **ac-platformport**：定义 `PlatformPort` 抽象并给出 Electron 与 Web 两套实现，renderer 不直接依赖 Electron API。
- **ac-select-file**：`PlatformPort.selectFile` 在两套实现中可用 —— Electron 走原生打开文件对话框返回所选绝对路径，Web 兼容实现用隐藏 file input 把所选内容物化到内存 FS 并返回可选路径；取消时返回 `null` 且不抛错；两套实现成功与取消路径均有单测覆盖。
- **ac-save-file**：`PlatformPort.saveFile` 在两套实现中可用 —— Electron 保存对话框 + `node:fs/promises` 写盘并返回目标路径，Web 兼容实现把内容写入内存 FS（并尽力触发下载）；取消返回 `null` 且不抛错；两套实现成功与取消路径均有单测覆盖。
- **ac-gates**：`.munk/code-gates.json` 存在，含相互独立的 `install` / `lint` / `typecheck` / `build` / `test` 门禁，且每条命令为单条 argv。
- **ac-desktop-build**：`build` 门禁成功产出 Electron 桌面端产物；主进程 + renderer 均可构建，能拉起基础壳窗口。
- **ac-web-render**：renderer 可在 Web/内存模式下构建并拉起基础壳（不依赖 Electron 原生能力）。
- **ac-gates-green**：全部门禁（lint / typecheck / build / test）在干净安装后全绿通过。

## 非目标

- 不做任何业务功能（目录树对比、文本/代码 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板提取）。
- 不做视觉基线 / 设计系统（token、基础组件、真实主界面属后续 `ui-baseline` / Design 项）。
- 不做样本库内容（`src/shared/fixtures/` 内容属后续子项）。
- 不做打包分发 / CI 发布（安装包目标、代码签名、公证、自动更新、GitHub Release 属 `release` 域）；本域只在 `PlatformPort` 层提供文件对话框与读写能力，不含各视图的「打开/保存本地文件」业务入口。
- 不做远端能力（FTP / SFTP）。
- 不做快捷键、分栏拖拽、主题切换等交互细节。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide React。
- 本机环境：macOS arm64 / Node v24.4.1 / pnpm 10.18.3；门禁命令统一用 `pnpm`。
- 分层硬约束：`src/core/` 零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测。
- Skill 安装禁止全局写入，只用 worktree 内 `.agents/skills/`。
- 门禁每条命令必须可被 Host 作为单条 argv 执行，不得用 shell 链接符拼接。

## 最近交付证明

- WI：`wi_intake_e60068db55d0fef9`（真实文件 IO 闭环 + GitHub 开源发布基线，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test passed。
- 覆盖摘要：`PlatformPort`（`src/shared/platform/types.ts`）扩展 `selectFile` / `saveFile`（options 含 `title` / `filters` / `defaultPath`，取消返回 `null`）；`channels.ts` 收敛新 IPC channel 白名单；Electron 实现走 `dialog.showOpenDialog({properties:['openFile']})` / `dialog.showSaveDialog` + `node:fs/promises` 写盘（`electron-platform.ts`），preload 白名单桥接，Web 实现用隐藏 file input 物化到内存 FS / 写内存 FS 并尽力触发下载（`web-platform.ts`）；两套实现 plus `/samples` 只读保护均有单测（`electron-platform.test.ts` / `web-platform.test.ts`），`pnpm test` 全绿。
- 注：本域本轮折叠用例 `qa/select-file.md`、`qa/save-file.md`；release 打包/CI 基线折叠在 `domains/release`。
