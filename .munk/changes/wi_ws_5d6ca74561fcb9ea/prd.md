# 保存落盘原子化与成功/取消/不可写三路径

## 范围

- 只改 Electron 主进程平台实现 `src/main/platform/electron-platform.ts` 的内部 `saveFile`，以及对应测试 `src/main/platform/electron-platform.test.ts`。
- `saveFile` 改为原子落盘：先在**目标同目录**写唯一临时文件，再 `rename` 覆盖目标；写入或 `rename` 任一失败都在清理路径（finally / catch）删除该临时文件后抛出。
- 三条返回值收口：成功返回目标路径且内容逐字一致；对话框取消返回 `null` 且不产生任何文件；不可写（`/samples` 只读哨兵、真实写/rename 失败）reject 为可读错误且目标目录不留 0 字节、半截或临时文件。
- 测试补齐成功 / 取消 / 不可写三条平台层路径，并确认既有 `saveFile` 调用方（快照导出、合并结果保存、HTML 报告导出）测试零回归。
- `PlatformPort.saveFile` 签名、`PLATFORM_CHANNELS.saveFile` 通道、preload 桥接、Web 平台与 `/samples` 只读语义全部保持不变。

## 验收

- ac-save-success-content: 保存对话框返回一个新路径时，`saveFile` 解析为该路径，落地文件按 UTF-8 读回与传入 `content` 逐字相等（覆盖空字符串、含中文/emoji 多字节文本、>1 MB 文本三种输入）。
- ac-save-overwrite-existing: 目标路径已存在内容不同的旧文件时，保存成功后目标文件内容为新 `content`，旧内容不再存在。
- ac-save-no-temp-residue: 成功路径结束后，目标目录的条目集合等于保存前的条目集合加上目标文件本身，目录内不存在任何临时文件残留（按新增条目 / `.tmp` 后缀判定，不硬编码临时文件名）。
- ac-save-cancel-null: 保存对话框返回 `canceled: true`（或 `filePath` 为空）时，`saveFile` 解析为 `null`，目标目录条目集合与调用前完全相同，无新建文件、无截断、无临时文件。
- ac-save-samples-readonly: 对话框返回 `/samples/**` 路径时 `saveFile` reject，错误消息含「只读」与目标路径；该路径不落盘，目标目录无任何新增条目。
- ac-save-failure-readable: 真实写失败（临时文件写入失败，或目标为已存在目录导致 `rename` 失败）时 `saveFile` reject，错误为非空 `Error` 且消息包含目标路径与非空的中文原因说明（有 OS code 时一并给出），不返回 `null`、不静默成功。
- ac-save-failure-no-residue: 上述失败后目标目录条目集合与保存前完全相同：没有 0 字节目标文件、没有半截内容、没有 `*.tmp` 临时文件；rename 失败时已存在的目标（如原文件 / 原目录及其内容）保持原样未被破坏。
- ac-save-port-contract: `PlatformPort.saveFile(options: SaveFileOptions): Promise<string | null>` 的类型与 `PLATFORM_CHANNELS.saveFile` 通道名不变，`src/preload/**`、`src/renderer/**`、`src/shared/platform/**` 无改动；成功时仍返回目标路径字符串，取消仍返回 `null`。
- ac-save-callers-green: 既有调用方测试零回归——`src/main/platform/electron-platform.test.ts` 的 native save dialog 用例、`src/renderer/src/workbench/DirectoryReportExport.test.tsx`、`src/renderer/src/App.snapshot.test.tsx`、`src/renderer/src/views/CodeView.test.tsx`（合并结果导出）全部通过，`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。
- ac-save-web-unchanged: Web 平台 `saveFile` 语义不变：`/memory/**` 返回路径并写入内存沙箱 + 触发下载，`/samples/**` reject 含「只读」；Web 实现不引入临时文件概念，其既有测试不变地通过。
- ac-save-rename-platform: 「rename 覆盖既有文件」在当前平台有可断言行为（ac-save-overwrite-existing 在 macOS 上真实执行），且实现处以注释写明跨平台口径：POSIX `rename` 原子替换目标，Windows 由 libuv 走 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING` 覆盖，目标被占用/只读时失败并走同一临时文件清理路径。

## 非目标

- 不改 `writeTextFile`、`writeUserSettings`、`deleteFile`、`selectFile` 或任何其它 IPC 通道的行为与签名；不对 `writeTextFile` 做原子化。
- 不改 Web 平台实现、preload 桥、renderer 组件、i18n 文案、HTML 报告内核与 `src/core/**`。
- 不新增 IPC channel、不新增设置项、不新增依赖、不改 `.munk/code-gates.json`、不新增长跑门禁。
- 不做 `fsync` / 目录 fsync 崩溃持久化保证，不做跨设备（`EXDEV`）回退策略，不做文件权限/属主/ACL 继承，不做旧文件备份或版本历史。
- 不改保存对话框的标题、默认文件名、滤镜与取消语义。
- 不 bump 版本，不改 README / CHANGELOG / release notes / 发布证据。
- 不在本项跑真实 358k 目录实测、浏览器点选或原生保存面板人工验收（由 product-qa 运营任务承接）。

## 实现约束

- 复用仓库既有的原子写模式（`writeUserSettings` 的 `${target}.${randomUUID()}.tmp` + `rename` + 失败清理），可抽一个内部共享 helper；**不得**出现第二套临时文件命名或第二套清理逻辑。
- 临时文件必须与目标**同目录**（保证 `rename` 同设备、真正原子），禁止使用 `os.tmpdir()` / `app.getPath('temp')`。
- 写盘顺序固定：`assertWritable(target)`（`/samples` 校验保持在任何写之前）→ `writeFile(temporary, content, 'utf8')` → `rename(temporary, target)`；失败分支 `rm(temporary, { force: true })` 兜底（清理失败不掩盖原始错误），随后抛出原始/包装错误。
- 失败消息风格对齐本文件既有的 `describeFileSystemCode`（中文原因 + `（CODE）`）并包含目标路径；对外消息不暴露临时文件名。
- 测试沿用 `electron-platform.test.ts` 现有模式：`vi.mock('electron')` + `dialogs.save.mockResolvedValueOnce` + `scratchRoot()` 临时目录 + node 环境真实文件系统，经 `platform.saveFile`（IPC handler）驱动；用专门的子目录做「保存前后 `readdir` 集合」比较。
- 不可写路径用真实文件系统条件制造，不新增生产代码测试 seam：`/samples/**` 只读哨兵；`rename` 失败用「目标为已存在的非空目录」触发。
- `rename` 到已存在非空目录的错误码按平台不同（POSIX 常见 `EISDIR` / `ENOTEMPTY`，Windows 常见 `EPERM` / `EACCES` / `EEXIST`）；测试只断言 reject + 可读消息 + 无残留，不锁定具体错误码。
- 本仓库为既有 Munk 路由工程（`AGENTS.md` + `.agents/skills/` 已就位），**跳过**建仓与基建步骤，不要在本项创建工程或改写 `AGENTS.md`。
