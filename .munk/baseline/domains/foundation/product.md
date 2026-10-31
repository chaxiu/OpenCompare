# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链初始化、平台抽象（PlatformPort）与质量门禁。本域不含任何业务功能。

## 范围

- 从空仓初始化 OpenCompare 跨平台桌面工程（`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`）。
- 安装本栈官方/主流 Skill 到 worktree `.agents/skills/`，并写薄 `AGENTS.md` 路由。
- 打通双模运行架构：`PlatformPort` 抽象 + Electron IPC 实现 + Web/内存实现，renderer 仅依赖 `PlatformPort`。
- **平台文件 IO 能力（`PlatformPort.selectFile` / `saveFile`）**：原生打开文件对话框返回所选绝对路径（取消 `null`）；保存对话框 + `node:fs/promises` 写盘返回目标路径（取消 `null`）；options 支持 `title` / 扩展名 `filters` / `defaultPath`。三处实现齐备且行为一致：Electron（`dialog.showOpenDialog`/`showSaveDialog`）、preload channel 白名单（`src/shared/platform/channels.ts`）、Web 内存实现（隐藏 file input 物化到内存 FS；保存写内存 FS 并尽力触发下载）。
- **保存落盘原子化与成功/取消/不可写三路径（`saveFile` 内部，签名与通道不变）**：Electron `saveFile` 先 `assertWritable`（`/samples/**` 只读校验在任何写之前），再经内部共享 helper `writeFileAtomically` 在**目标同目录**写 `${target}.${randomUUID()}.tmp` 并 `rename` 覆盖目标；写入或 `rename` 任一失败在 `catch` 里 `rm(temporary, { force: true })` 后抛出原始错误（清理失败不掩盖原始原因），随后由 `readableWriteFailure` 包装为「无法写入文件 <path>：<中文原因>（<CODE>）。」，不暴露临时文件名。`writeUserSettings` 复用同一 helper（不再有第二套临时文件命名/清理逻辑）。临时文件禁止用 `os.tmpdir()` / `app.getPath('temp')`（须同设备才能真正原子）。跨平台口径写在实现注释：POSIX `rename` 原子替换，Windows 由 libuv 走 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING`，目标被占用/只读或为非空目录时失败并走同一清理路径；不做 `fsync`、不做 `EXDEV` 回退。`saveFile` 失败消息的码表在 `describeFileSystemCode` 增补 `EISDIR`/`ENOTEMPTY`/`EEXIST`/`ENOSPC`/`EROFS` 并支持写入专用兜底文案。
- **目录列表能力（`PlatformPort.listDirectory`）**：Electron 实现 `readdir({ withFileTypes: true })` 后逐条 `lstat` 取 `name` / `path` / `isDirectory` / `size` / `modifiedMs`（**不跟随符号链接**）；`lstat` 报告是链接时 `readlink` 取 `linkTarget` 并只探测目标形态 `linkTargetKind: 'file' | 'directory' | 'missing'`，条目固定 `isSymbolicLink: true` + `isDirectory: false`（链接恒为叶条目）。`DirectoryEntry` 的 `isSymbolicLink` / `linkTarget` / `linkTargetKind` 为可选字段，不新增 `PlatformPort` 方法与 channel；Web 内存实现不必支持链接。逐条 `lstat` 的 fan-out 经 `@core/io` 的 `mapWithLimit` 走有界窗口（默认 8），返回顺序与字段与逐条串行结果一致。链接的四态 / 计数口径归 `symlink-semantics` 域，限流与句柄错误文案归 `io-concurrency` 域，本域不重复实现。
- **原始字节批量摘要能力（`PlatformPort.digestFiles`，横切契约归 `content-digest` 域）**：一次请求带一批绝对路径，按输入顺序返回每项 `{ path, ok, sha256, bytes }` 或 `{ path, ok: false, reason }`；单个坏文件只失败该项，批仍 resolve；句柄耗尽整批 reject。返回类型是判别联合 `DigestFilesResult = readonly FileDigest[] | { readonly cancelled: true }`：取消以**结构化结果 resolve**，不以 rejected Promise 表达，调用方用 `Array.isArray` 区分（不引入额外包装层）。Electron 实现流式 `createReadStream` + `createHash('sha256')`（`/samples/**` 按 UTF-8 字节），Web 实现走核心 `sha256Bytes`；通道 `platform:digest-files` 登记在 `PLATFORM_CHANNELS`，preload 白名单转发。
- **批量列目录能力（`PlatformPort.listDirectories(paths, options?)`）**：一次请求携带多个目录绝对路径，按输入顺序返回等长槽位 `DirectoryListing`（成功 `{ path, ok: true, entries }`，失败 `{ path, ok: false, reason }`）；单个目录不可列只失败该槽位、整批仍 resolve，`reason` 沿用「无法读取目录 <path>：…」中文措辞；句柄耗尽整批 reject。Electron 实现对整批所有目录的所有条目共用**一份全局有界 `stat` 预算**（`DEFAULT_STAT_CONCURRENCY = 16`，可注入 `lstatFile` / `statConcurrency` 观测），`/samples/**` 与真实路径共用同一通道；Web 内存实现按目录切片返回同语义槽位，`/samples/**` 同样可列。`listDirectory(path)` 保留并复用批量实现（`[path]` 单槽）。通道 `platform:list-directories` 登记在 `PLATFORM_CHANNELS`，preload 仅白名单转发；`PlatformPort` 表面新增以 `listDirectories` 为最新一项。并发窗口与句柄错误口径归 `io-concurrency` 域，本域不重复实现。
- **取消能力 `PlatformPort.cancelOperation(operationId)`（平台缝）**：按 `operationId` 取消该次目录对比在平台层的在途工作（主进程销毁该摘要操作的全部在途读取流并阻止未启动文件开流，使对应 `digestFiles` **resolve 为 `{ cancelled: true }`**），未知 id 与重复调用 resolve 不抛。`DigestFilesOptions` 仅新增可选 `operationId`；通道 `platform:cancel-operation` 只登记在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`。Web 内存实现提供同签名能力：记录已取消 id（幂等），`digestFiles` 在操作已取消时返回与主进程同形态的 `{ cancelled: true }`，未取消时返回值不变。**取消错误不穿越 IPC**：`platform:digest-files` handler 内再兜一层，任何漏出的 `OperationCancelledError` 都转成结构化结果，取消绝不以 reject 穿过 `ipcMain.handle`；renderer 适配层（`src/renderer/src/platform/index.ts` 的 `unwrapDigestResult` / `digestFilesForComparison`）在**渲染进程内**抛回 `OperationCancelledError`，让核心既有 catch 分支照常工作。取消语义与流生命周期口径归 `directory` / `io-concurrency` / `content-digest` 域，本域只承载平台表面与两套实现一致性。
- **列举与读文件的不可读项容错（`listDirectory` / `readTextFile`，横切契约归 `io-tolerance` 域）**：`lstat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败时条目保留并标注 `broken` + 非空 `skippedReason`（`DirectoryEntry` 仅增可选字段）；根目录 `readdir` 失败仍 reject 但给出「无法读取目录 <path>：…」中文可读错误。`read-text-file` 对真实路径（含悬空链接 / 不可读文件）返回「无法读取文件 <path>：…」，经 IPC 不含 `Error invoking remote method` 前缀。该容错改造未新增 `PlatformPort` 方法、未改既有 channel。
- **用户设置与系统语言能力（`PlatformPort.readUserSettings` / `writeUserSettings` / `systemLocale`，词典与首启解析归 `i18n` 域）**：`UserSettings` 只有 `language: 'zh' | 'en'` 一个字段（`Language` 同类型文件导出）；三个方法只新增这三项，通道名只登记在 `PLATFORM_CHANNELS`（`platform:read-user-settings` / `platform:write-user-settings` / `platform:system-locale`），preload 仅白名单转发并同步 bridge surface 清单测试。Electron：设置写入 `app.getPath('userData')` 下单个 JSON 文件，目录缺失先创建，**原子写**（同目录临时文件 + rename）；读取时文件缺失 / 损坏 JSON / 非对象 / 非法语言值一律解析为 `null` 且不 reject（启动不能因设置文件失败）；`systemLocale()` 原样返回 `app.getLocale()`（不改写、不截断）。Web：`localStorage` 单键 `opencompare.userSettings` 读写，`localStorage` 不可用 / 抛错时退化为**模块级内存**（同一运行期读回）；非法 JSON / 非法语言值读为 `null`；`systemLocale()` 取 `navigator.language`（缺失 `''`）。`src/shared/platform/settings.ts` 为两平台共享的解析单点（`isLanguage` / `parseUserSettings` / `parseUserSettingsJson` / `USER_SETTINGS_STORAGE_KEY`）。
- 预装核心运行时依赖（diff / node-diff3 / papaparse / @tanstack/react-virtual / yaml / jsonc-parser / lucide-react）与开发测试依赖（vitest / @testing-library/react / eslint / typescript）。
- 配齐单命令质量门禁：`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `cancel-gate` / `perf-gate`（各自单条 argv；`cancel-gate` 对应 `pnpm test:cancel`，`perf-gate` 对应 `pnpm perf:gate`）。

## 验收

- **ac-skills-agents**：worktree 存在非空 `AGENTS.md`，路由表指向 `.agents/skills/` 下与本栈对应的官方/主流 Skill；未用无关 Skill 凑数。
- **ac-scaffold**：根目录存在 electron-vite 结构工程（`package.json` + `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared`），`install` 门禁可成功完成依赖安装。
- **ac-deps**：`diff` / `node-diff3` / `papaparse` / `@tanstack/react-virtual` / `yaml` / `jsonc-parser` / `lucide-react` / `vitest` 均已在 `package.json` 声明且可被 typecheck 解析。
- **ac-platformport**：定义 `PlatformPort` 抽象并给出 Electron 与 Web 两套实现，renderer 不直接依赖 Electron API。
- **ac-select-file**：`PlatformPort.selectFile` 在两套实现中可用 —— Electron 走原生打开文件对话框返回所选绝对路径，Web 兼容实现用隐藏 file input 把所选内容物化到内存 FS 并返回可选路径；取消时返回 `null` 且不抛错；两套实现成功与取消路径均有单测覆盖。
- **ac-save-file**：`PlatformPort.saveFile` 在两套实现中可用 —— Electron 保存对话框 + `node:fs/promises` 写盘并返回目标路径，Web 兼容实现把内容写入内存 FS（并尽力触发下载）；取消返回 `null` 且不抛错；两套实现成功与取消路径均有单测覆盖。（落盘细节由下列 `ac-save-*` 细化。）
- **ac-save-success-content**：保存对话框返回一个新路径时，`saveFile` 解析为该路径，落地文件按 UTF-8 读回与传入 `content` 逐字相等（覆盖空字符串、含中文/emoji 多字节文本、>1 MB 文本三种输入）。
- **ac-save-overwrite-existing**：目标路径已存在内容不同的旧文件时，保存成功后目标文件内容为新 `content`，旧内容不再存在。
- **ac-save-no-temp-residue**：成功路径结束后，目标目录的条目集合等于保存前的条目集合加上目标文件本身，目录内不存在任何临时文件残留（按新增条目 / `.tmp` 后缀判定，不硬编码临时文件名）。
- **ac-save-cancel-null**：保存对话框返回 `canceled: true`（或 `filePath` 为空）时，`saveFile` 解析为 `null`，目标目录条目集合与调用前完全相同，无新建文件、无截断、无临时文件。
- **ac-save-samples-readonly**：对话框返回 `/samples/**` 路径时 `saveFile` reject，错误消息含「只读」与目标路径；该路径不落盘，目标目录无任何新增条目。
- **ac-save-failure-readable**：真实写失败（临时文件写入失败，或目标为已存在目录导致 `rename` 失败）时 `saveFile` reject，错误为非空 `Error` 且消息包含目标路径与非空的中文原因说明（有 OS code 时一并给出），不返回 `null`、不静默成功。
- **ac-save-failure-no-residue**：上述失败后目标目录条目集合与保存前完全相同：没有 0 字节目标文件、没有半截内容、没有 `*.tmp` 临时文件；rename 失败时已存在的目标（如原文件 / 原目录及其内容）保持原样未被破坏。
- **ac-save-port-contract**：`PlatformPort.saveFile(options: SaveFileOptions): Promise<string | null>` 的类型与 `PLATFORM_CHANNELS.saveFile` 通道名不变，`src/preload/**`、`src/renderer/**`、`src/shared/platform/**` 无改动；成功时仍返回目标路径字符串，取消仍返回 `null`。
- **ac-save-callers-green**：既有调用方测试零回归 —— `src/main/platform/electron-platform.test.ts` 的 native save dialog 用例、`src/renderer/src/workbench/DirectoryReportExport.test.tsx`、`src/renderer/src/App.snapshot.test.tsx`、`src/renderer/src/views/CodeView.test.tsx`（合并结果导出）全部通过，`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。
- **ac-save-web-unchanged**：Web 平台 `saveFile` 语义不变：`/memory/**` 返回路径并写入内存沙箱 + 触发下载，`/samples/**` reject 含「只读」；Web 实现不引入临时文件概念，其既有测试不变地通过。
- **ac-save-rename-platform**：「rename 覆盖既有文件」在当前平台有可断言行为（`ac-save-overwrite-existing` 在 macOS 上真实执行），且实现处以注释写明跨平台口径：POSIX `rename` 原子替换目标，Windows 由 libuv 走 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING` 覆盖，目标被占用/只读时失败并走同一临时文件清理路径。
- **ac-gates**：`.munk/code-gates.json` 存在，含相互独立的 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `cancel-gate` / `perf-gate` 门禁，且每条命令为单条 argv。
- **ac-desktop-build**：`build` 门禁成功产出 Electron 桌面端产物；主进程 + renderer 均可构建，能拉起基础壳窗口。
- **ac-web-render**：renderer 可在 Web/内存模式下构建并拉起基础壳（不依赖 Electron 原生能力）。
- **ac-gates-green**：全部门禁（lint / typecheck / build / test）在干净安装后全绿通过。
- **ac-batch-slot-shape**：一次 `listDirectories` 传 N 个路径，返回槽位数为 N、顺序与输入一致；成功槽位条目 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 与对同目录调用 `listDirectory` 的结果逐项相等；其中一个路径不可列时整批仍 resolve，该槽位带可读失败原因，其余槽位正常（Electron 与 Web 两套实现一致）。
- **ac-seam-whitelist**：新批量通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该批量列目录能力；renderer 不直接 import `electron` / `node:fs`。
- **ac-cancel-seam-whitelist**：取消通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`，`DigestFilesOptions` 只新增可选 `operationId`；renderer 不直接 import `electron` / `node:fs` / `node:crypto`。
- **ac-cancel-web-parity**：Web 平台 `cancelOperation` 幂等（未知 id、重复调用均 resolve 不抛）；`digestFiles` 在操作已取消时**resolve 为 `{ cancelled: true }`**（与 Electron 实现形状相同，两平台可用同一 `Array.isArray` 判别），未取消时返回值与既有断言一致。
- **ac-digest-structured-result**：`PlatformPort.digestFiles` 的返回类型为 `readonly FileDigest[] | { readonly cancelled: true }`；带 `operationId` 的调用在读取中途被 `cancelOperation` 后 **resolve** 为 `{ cancelled: true }`（`Array.isArray(result) === false`）而非 reject；未取消时 resolve 为与输入等长、顺序一致的 `FileDigest[]`。`src/shared/platform/types.ts` / `src/preload/index.ts` 的 cast 与 `src/shared/platform/channels.ts` 白名单同步到该契约，且不新增 IPC channel。
- **ac-cancel-adapter-in-renderer**：Electron 与 Web 平台实现只交结构化结果；`OperationCancelledError` 仅由 renderer 适配层（`unwrapDigestResult` / `digestFilesForComparison`）在渲染进程内抛出，`src/core/**` 的取消控制流（`compare.ts` 取消路径、`digestContentCandidates` 分块写缓存时机、`scanDirectory` 不返回部分树）语义不变，取消错误绝不再跨 IPC。
- **ac-port-surface**：`PlatformPort` 暴露三个新方法 `readUserSettings` / `writeUserSettings` / `systemLocale`；preload 桥接以 `PLATFORM_CHANNELS` 对应通道名调用 `ipcRenderer.invoke`（逐通道断言），既有 bridge surface 测试更新为新方法集合。
- **ac-electron-roundtrip**：经真实 `ipcMain.handle` 注册后，`writeUserSettings({ language: 'en' })` 再调用读取（新的一次读取 / 新注册实例，临时 userData 目录）得到 `{ language: 'en' }`；写入产生且仅产生 userData 下单个 JSON 设置文件。
- **ac-electron-corrupt**：设置文件为 `{not json`、`null`、`"text"`、`{"language":"de"}`、`{"language":3}` 时 `readUserSettings()` 返回 `null`，不抛。
- **ac-electron-locale**：`systemLocale()` 原样返回 `app.getLocale()`（mock 为 `zh-Hant-TW` 时不改写、不截断）。
- **ac-web-localstorage**：jsdom localStorage 可用时写入后由**另一个** port 实例读回同一 settings；写入只新增一个 OpenCompare 设置键，不产生其它 key。
- **ac-web-invalid-json**：localStorage 中该键为非法 JSON 或非法语言值时读取返回 `null`，不抛。
- **ac-web-memory-fallback**：`localStorage` 读写抛错时，同一 port 实例写入后读回同一 settings，且 `systemLocale()` 返回 `navigator.language`（缺省 `''`）。

## 非目标

- 不做任何业务功能（目录树对比、文本/代码 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板提取）。
- 不做视觉基线 / 设计系统（token、基础组件、真实主界面属后续 `ui-baseline` / Design 项）。
- 不做样本库内容（`src/shared/fixtures/` 内容属后续子项）。
- 不做打包分发 / CI 发布（安装包目标、代码签名、公证、自动更新、GitHub Release 属 `release` 域）；本域只在 `PlatformPort` 层提供文件对话框与读写能力，不含各视图的「打开/保存本地文件」业务入口。
- 不做远端能力（FTP / SFTP）。
- 不做快捷键、分栏拖拽、主题切换等交互细节。
- 保存原子化**不**改 `writeTextFile` / `writeUserSettings` / `deleteFile` / `selectFile` 或任何其它 IPC 通道的行为与签名（不对 `writeTextFile` 做原子化）；不新增 IPC channel、设置项、依赖，不改 `.munk/code-gates.json` 或新增长跑门禁；不改 Web 平台实现、preload 桥、renderer 组件、i18n 文案、HTML 报告内核与 `src/core/**`；不做 `fsync` / 目录 fsync 崩溃持久化保证、跨设备（`EXDEV`）回退、权限/属主/ACL 继承、旧文件备份或版本历史；不改保存对话框标题/默认文件名/滤镜/取消语义；不 bump 版本，不改 README / CHANGELOG / release notes；不做真实 358k 目录实测或原生保存面板人工验收（另派 product-qa）。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide React。
- 本机环境：macOS arm64 / Node v24.4.1 / pnpm 10.18.3；门禁命令统一用 `pnpm`。
- 分层硬约束：`src/core/` 零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测。
- Skill 安装禁止全局写入，只用 worktree 内 `.agents/skills/`。
- 门禁每条命令必须可被 Host 作为单条 argv 执行，不得用 shell 链接符拼接。
- **平台能力按「新增能力 + 可选参数」演进**：不改既有方法签名语义（`listDirectory(path)` 保留并复用批量实现）；新增能力必须同时给 Electron IPC 与 Web 内存两套实现，channel 只登记在 `src/shared/platform/channels.ts`，preload 仅白名单转发，并同步 preload 表面清单测试；批量槽位形状与失败隔离在同一 `DirectoryListing` 类型上收口，不在调用点各自拼装。
- **取消能力同样两套实现、同形态**：`cancelOperation` 在 Electron 与 Web 两条路径上幂等且**返回同一结构化取消形状**（`{ cancelled: true }`，来自 `@shared/platform/types` 的 `DigestFilesCancelled`）；`OperationCancelledError`（`@core/io`）只在 renderer 适配层出现，renderer 不引 `node:*`；新 channel 登记单一来源并随 preload 表面清单测试；不新增第二条进度推送通道。
- **保存原子写单点实现**：临时文件命名与清理只能有一处（内部 `writeFileAtomically`），`saveFile` 与 `writeUserSettings` 共用；写盘顺序固定为 `assertWritable(target)` → `writeFile(temporary, content, 'utf8')` → `rename(temporary, target)`，失败分支 `rm(temporary, { force: true })` 兜底后抛出原始/包装错误；临时文件必须与目标同目录，禁止系统临时目录。失败文案对齐既有 `describeFileSystemCode` 风格（中文原因 + `（CODE）`）且包含目标路径、不含临时文件名。
- **测试只走既有模式**：沿用 `electron-platform.test.ts` 的 `vi.mock('electron')` + `dialogs.save.mockResolvedValueOnce` + `scratchRoot()` + node 真实文件系统，经 `platform.saveFile`（IPC handler）驱动；「保存前后 `readdir` 集合」用专门子目录比较；不可写路径用真实文件系统条件制造（`/samples/**` 只读哨兵；`rename` 失败用「目标为已存在的非空目录」），不新增生产代码测试 seam；不锁定平台相关的 rename 错误码（POSIX `EISDIR`/`ENOTEMPTY`，Windows `EPERM`/`EACCES`/`EEXIST`）。

## 最近交付证明

- 交叉引用（非本域 AC）：`wi_ws_7efd09ed8abe2eda`（2026-10-31）只改 `platform:write-text-file` handler 的 mtime 回填方式——由 `new Date(modifiedMs)` + `utimes(Date)` 改为数值秒 `Math.floor(ms) / 1000 + 1e-6`，让源 `stat().mtimeMs` 的亚毫秒部分不再把回写时间压到整毫秒以下。**通道名、请求/响应形状、`PlatformPort.writeTextFile(path, content, modifiedMs?)` 签名与 Web 实现均未变**，不新增 IPC channel；真实磁盘同步的 AC 与门禁归 `domains/directory`（`ac-mtime-preserved-fast-path-same` / `sync-real-gate`）。

- WI：`wi_ws_5d6ca74561fcb9ea`（保存落盘原子化与成功/取消/不可写三路径，`kind: fix`）
- 日期：2026-10-27
- 结果：code_gates passed（9 条门禁 attempt 001 全绿：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate；`pnpm test` 62 个文件 965 passed / 1 skipped）；本轮 `needSelfTest=false`，UI 自测与原生保存面板人工验收跳过。
- 覆盖摘要：`src/main/platform/electron-platform.ts` 新增内部 `writeFileAtomically(target, content)`——同目录 `${target}.${randomUUID()}.tmp` + `rename` 覆盖，失败分支 `rm(temporary, { force: true })` 清理后抛原始错误；`saveFile` 改为 `assertWritable` → `writeFileAtomically`，失败经新增 `readableWriteFailure` 包装成「无法写入文件 <path>：<中文原因>（<CODE>）。」（不暴露临时文件名）；`describeFileSystemCode` 增补 `EISDIR` / `ENOTEMPTY` / `EEXIST` / `ENOSPC` / `EROFS` 与写入专用兜底文案；`writeUserSettings` 删除自带的临时文件/rename/清理代码改为复用同一 helper（仓库内不再有第二套原子写实现）。`PlatformPort.saveFile` 签名、`PLATFORM_CHANNELS.saveFile`、preload / renderer / shared 平台类型零改动；Web 实现零改动。`electron-platform.test.ts` 新增「atomic save」6 条：空串/中文 emoji/>1.2 MB 逐字回读且目录无新增临时文件、覆盖旧内容且旧文本消失、取消（`canceled: true` 与空 `filePath`）零新建、`/samples/**` 只读 reject 且不落盘、rename 到已存在非空目录 reject 且目录与 `keep.txt` 原样无残留、写入不存在子目录 reject 且根目录零残留；失败消息断言含中文与目标路径且不含 `.tmp`，不锁具体错误码。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**`、`tech.md`、`ux/**`），全局 tech / design 折叠跳过；新增 `qa/save-file-atomic.md` 按本域 AC 落档（非 change-pack 用例）。`saveFile` 调用方（快照导出 / 合并结果保存 / HTML 报告导出）实现与测试均零改动，`ac-save-callers-green` 由 `pnpm test` 全量回归覆盖；跨平台 rename 口径只写注释与 macOS 真实验证，Windows 目标占用/只读分支本机未实测。
