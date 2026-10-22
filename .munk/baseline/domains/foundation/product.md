# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链初始化、平台抽象（PlatformPort）与质量门禁。本域不含任何业务功能。

## 范围

- 从空仓初始化 OpenCompare 跨平台桌面工程（`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`）。
- 安装本栈官方/主流 Skill 到 worktree `.agents/skills/`，并写薄 `AGENTS.md` 路由。
- 打通双模运行架构：`PlatformPort` 抽象 + Electron IPC 实现 + Web/内存实现，renderer 仅依赖 `PlatformPort`。
- **平台文件 IO 能力（`PlatformPort.selectFile` / `saveFile`）**：原生打开文件对话框返回所选绝对路径（取消 `null`）；保存对话框 + `node:fs/promises` 写盘返回目标路径（取消 `null`）；options 支持 `title` / 扩展名 `filters` / `defaultPath`。三处实现齐备且行为一致：Electron（`dialog.showOpenDialog`/`showSaveDialog`）、preload channel 白名单（`src/shared/platform/channels.ts`）、Web 内存实现（隐藏 file input 物化到内存 FS；保存写内存 FS 并尽力触发下载）。
- **目录列表能力（`PlatformPort.listDirectory`）**：Electron 实现 `readdir({ withFileTypes: true })` 后逐条 `lstat` 取 `name` / `path` / `isDirectory` / `size` / `modifiedMs`（**不跟随符号链接**）；`lstat` 报告是链接时 `readlink` 取 `linkTarget` 并只探测目标形态 `linkTargetKind: 'file' | 'directory' | 'missing'`，条目固定 `isSymbolicLink: true` + `isDirectory: false`（链接恒为叶条目）。`DirectoryEntry` 的 `isSymbolicLink` / `linkTarget` / `linkTargetKind` 为可选字段，不新增 `PlatformPort` 方法与 channel；Web 内存实现不必支持链接。逐条 `lstat` 的 fan-out 经 `@core/io` 的 `mapWithLimit` 走有界窗口（默认 8），返回顺序与字段与逐条串行结果一致。链接的四态 / 计数口径归 `symlink-semantics` 域，限流与句柄错误文案归 `io-concurrency` 域，本域不重复实现。
- **原始字节批量摘要能力（`PlatformPort.digestFiles`，横切契约归 `content-digest` 域）**：一次请求带一批绝对路径，按输入顺序返回每项 `{ path, ok, sha256, bytes }` 或 `{ path, ok: false, reason }`；单个坏文件只失败该项，批仍 resolve；句柄耗尽整批 reject。Electron 实现流式 `createReadStream` + `createHash('sha256')`（`/samples/**` 按 UTF-8 字节），Web 实现走核心 `sha256Bytes`；通道 `platform:digest-files` 登记在 `PLATFORM_CHANNELS`，preload 白名单转发。
- **批量列目录能力（`PlatformPort.listDirectories(paths, options?)`）**：一次请求携带多个目录绝对路径，按输入顺序返回等长槽位 `DirectoryListing`（成功 `{ path, ok: true, entries }`，失败 `{ path, ok: false, reason }`）；单个目录不可列只失败该槽位、整批仍 resolve，`reason` 沿用「无法读取目录 <path>：…」中文措辞；句柄耗尽整批 reject。Electron 实现对整批所有目录的所有条目共用**一份全局有界 `stat` 预算**（`DEFAULT_STAT_CONCURRENCY = 16`，可注入 `statFile` / `statConcurrency` 观测），`/samples/**` 与真实路径共用同一通道；Web 内存实现按目录切片返回同语义槽位，`/samples/**` 同样可列。`listDirectory(path)` 保留并复用批量实现（`[path]` 单槽）。通道 `platform:list-directories` 登记在 `PLATFORM_CHANNELS`，preload 仅白名单转发；`PlatformPort` 表面新增以 `listDirectories` 为最新一项。并发窗口与句柄错误口径归 `io-concurrency` 域，本域不重复实现。
- **取消能力 `PlatformPort.cancelOperation(operationId)`（平台缝）**：按 `operationId` 取消该次目录对比在平台层的在途工作（主进程销毁该摘要操作的全部在途读取流并阻止未启动文件开流，使对应 `digestFiles` 以取消错误整批 reject），未知 id 与重复调用 resolve 不抛。`DigestFilesOptions` 仅新增可选 `operationId`；通道 `platform:cancel-operation` 只登记在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`。Web 内存实现提供同签名能力：记录已取消 id（幂等），`digestFiles` 在操作已取消时以与主进程同形态的 `OperationCancelledError` reject，未取消时返回值不变。取消语义与流生命周期口径归 `directory` / `io-concurrency` / `content-digest` 域，本域只承载平台表面与两套实现一致性。
- **列举与读文件的不可读项容错（`listDirectory` / `readTextFile`，横切契约归 `io-tolerance` 域）**：`lstat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败时条目保留并标注 `broken` + 非空 `skippedReason`（`DirectoryEntry` 仅增可选字段）；根目录 `readdir` 失败仍 reject 但给出「无法读取目录 <path>：…」中文可读错误。`read-text-file` 对真实路径（含悬空链接 / 不可读文件）返回「无法读取文件 <path>：…」，经 IPC 不含 `Error invoking remote method` 前缀。该容错改造未新增 `PlatformPort` 方法、未改既有 channel。
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
- **ac-batch-slot-shape**：一次 `listDirectories` 传 N 个路径，返回槽位数为 N、顺序与输入一致；成功槽位条目 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 与对同目录调用 `listDirectory` 的结果逐项相等；其中一个路径不可列时整批仍 resolve，该槽位带可读失败原因，其余槽位正常（Electron 与 Web 两套实现一致）。
- **ac-seam-whitelist**：新批量通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该批量列目录能力；renderer 不直接 import `electron` / `node:fs`。
- **ac-cancel-seam-whitelist**：取消通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`，`DigestFilesOptions` 只新增可选 `operationId`；renderer 不直接 import `electron` / `node:fs` / `node:crypto`。
- **ac-cancel-web-parity**：Web 平台 `cancelOperation` 幂等（未知 id、重复调用均 resolve 不抛）；`digestFiles` 在操作已取消时以取消错误 reject，未取消时返回值与既有断言一致；两平台取消错误形态相同（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`、消息含「已取消」）。

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
- **平台能力按「新增能力 + 可选参数」演进**：不改既有方法签名语义（`listDirectory(path)` 保留并复用批量实现）；新增能力必须同时给 Electron IPC 与 Web 内存两套实现，channel 只登记在 `src/shared/platform/channels.ts`，preload 仅白名单转发，并同步 preload 表面清单测试；批量槽位形状与失败隔离在同一 `DirectoryListing` 类型上收口，不在调用点各自拼装。
- **取消能力同样两套实现、同形态**：`cancelOperation` 在 Electron 与 Web 两条路径上幂等且错误形态一致（`OperationCancelledError` 来自 `@core/io`，renderer 不引 `node:*`）；新 channel 登记单一来源并随 preload 表面清单测试；不新增第二条进度推送通道。

## 最近交付证明

- WI：`wi_ws_90a06ca6d557d5cd`（扫描/哈希进度与可取消，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含 seam / Web 同构用例）。
- 覆盖摘要：`src/shared/platform/types.ts` 的 `DigestFilesOptions` 新增可选 `operationId`，`PlatformPort` 新增 `cancelOperation(operationId): Promise<void>`（本轮表面仅新增该项）；`channels.ts` 仅新增 `cancelOperation: 'platform:cancel-operation'`，preload 白名单转发（`index.test.ts` 表面清单与「renderer 只经 PlatformPort」断言随动）；Electron 侧 `ipcMain.handle` 校验字符串 id 后调 `cancelOperation`；Web 侧以已取消 id 集合实现幂等 `cancelOperation`，`digestFiles` 在已取消 id 上抛 `OperationCancelledError`、其余路径返回值不变。`web-platform.test.ts` 新增「web digest cancellation」2 条，`preload/index.test.ts` 覆盖新通道转发与表面约束。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例；取消语义/流销毁归 `domains/io-concurrency`，`operationId` 与摘要取消契约归 `domains/content-digest`，核心进度与分块归 `domains/directory`。

- WI：`wi_ws_deb41e1c6a5a2b8f`（目录条目批量 IPC 与 ≥16 路有界遍历，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增批量列目录/槽位形状/seam 用例）。
- 覆盖摘要：`src/shared/platform/types.ts` 新增 `DirectoryListingSuccess` / `DirectoryListingFailure` / `DirectoryListing` / `ListDirectoriesOptions` 与 `PlatformPort.listDirectories(paths, options?)`（`PlatformPort` 表面本轮仅新增该项）；`channels.ts` 新增 `listDirectories: 'platform:list-directories'`，preload 白名单转发（`index.test.ts` 表面清单随动）。Electron 侧抽出 `listDirectories(paths, options)`：`readdir` 并发取目录、整批所有条目共用一份 `mapWithLimit` 的 `stat` 预算（导出 `DEFAULT_STAT_CONCURRENCY = 16`，可注入 `statFile`），样本路径与真实路径共用同一通道，`listDirectory` 变为 `[path]` 单槽复用；Web 侧以 `entriesOf` / `listingOf` 按内存树切槽，样本路径同样可列。`electron-platform.test.ts` 新增「batch directory listing」6 条用例（等长有序槽位且失败局部化、整批共享 stat 预算、stat 耗尽整批 reject、与串行扫描树/index/skipped/四态一致、样本目录经批量通道可列、根目录不可列 reject）；`web-platform.test.ts` / `App.test.tsx` 随动。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例；目录扫描引擎语义折叠在 `domains/directory`，并发/句柄口径折叠在 `domains/io-concurrency`。

- WI：`wi_intake_e60068db55d0fef9`（真实文件 IO 闭环 + GitHub 开源发布基线，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test passed。
- 覆盖摘要：`PlatformPort`（`src/shared/platform/types.ts`）扩展 `selectFile` / `saveFile`（options 含 `title` / `filters` / `defaultPath`，取消返回 `null`）；`channels.ts` 收敛新 IPC channel 白名单；Electron 实现走 `dialog.showOpenDialog({properties:['openFile']})` / `dialog.showSaveDialog` + `node:fs/promises` 写盘（`electron-platform.ts`），preload 白名单桥接，Web 实现用隐藏 file input 物化到内存 FS / 写内存 FS 并尽力触发下载（`web-platform.ts`）；两套实现 plus `/samples` 只读保护均有单测（`electron-platform.test.ts` / `web-platform.test.ts`），`pnpm test` 全绿。
- 注：本域本轮折叠用例 `qa/select-file.md`、`qa/save-file.md`；release 打包/CI 基线折叠在 `domains/release`。
