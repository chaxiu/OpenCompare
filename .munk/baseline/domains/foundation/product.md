# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链初始化、平台抽象（`PlatformPort`）与质量门禁。本域不含任何业务功能；各能力的语义 / AC 归对应行为域（`directory` / `io-concurrency` / `content-digest` / `symlink-semantics` / `io-tolerance` / `text-probe` / `i18n`），本域只承载平台表面与 Electron / Web 两套实现的一致性。

## 范围

- **脚手架与工具链**：`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`；electron-vite 三段构建；worktree 内 `.agents/skills/` 与薄 `AGENTS.md` 路由；核心依赖 diff / node-diff3 / papaparse / @tanstack/react-virtual / yaml / jsonc-parser / lucide-react 与开发依赖 vitest / @testing-library/react / eslint / typescript。
- **双模架构**：`PlatformPort` 抽象 + Electron IPC 实现 + Web 内存实现；renderer 只依赖 `PlatformPort`，绝不直接 import Electron / `node:*`。
- **文件对话框**：`selectFile` / `saveFile` 返回所选绝对路径或 `null`（取消），options 支持 `title` / `filters` / `defaultPath`；Electron 走原生对话框 + `node:fs/promises`，Web 用隐藏 file input 物化到内存 FS / 写内存 FS 并尽力触发下载。
- **保存落盘原子化**：Electron `saveFile` 先 `assertWritable`（`/samples/**` 只读校验在任何写之前），再经内部共享 helper `writeFileAtomically` 在**目标同目录**写 `${target}.${randomUUID()}.tmp` 后 `rename` 覆盖；任一步失败在 `catch` 里 `rm(temporary, { force: true })` 后抛原始错误（清理失败不掩盖原因），再由 `readableWriteFailure` 包装成「无法写入文件 <path>：<中文原因>（<CODE>）。」，不暴露临时文件名。临时文件禁止用系统临时目录（须同设备才能真正原子）。POSIX `rename` 原子替换，Windows 由 libuv 走 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING`；不做 `fsync`、不做 `EXDEV` 回退。`describeFileSystemCode` 覆盖 `EISDIR` / `ENOTEMPTY` / `EEXIST` / `ENOSPC` / `EROFS` 与写入专用兜底文案。
- **目录列举**：`listDirectory` 用 `readdir({ withFileTypes: true })` + 逐条 `lstat` 取 `name` / `path` / `isDirectory` / `size` / `modifiedMs`（**不跟随符号链接**）；链接条目 `readlink` 取 `linkTarget` 并只探测 `linkTargetKind: 'file' | 'directory' | 'missing'`，固定 `isSymbolicLink: true` + `isDirectory: false`（链接恒为叶条目）；逐条 `lstat` 经 `mapWithLimit` 走有界窗口（默认 8），返回顺序与行号字段与串行一致。
- **批量列目录**：`listDirectories(paths, options?)` 一次带多个绝对路径，按输入顺序返回等长槽位 `DirectoryListing`（成功 `{ path, ok: true, entries }`，失败 `{ path, ok: false, reason }`）；单个目录不可列只失败该槽位、整批仍 resolve，句柄耗尽整批 reject；Electron 对整批所有条目共用一份全局有界 `stat` 预算（`DEFAULT_STAT_CONCURRENCY = 16`，可注入 `lstatFile` / `statConcurrency` 观测）；`listDirectory(path)` 保留并复用批量实现（`[path]` 单槽）。
- **批量字节摘要**：`digestFiles` 带一批绝对路径，按顺序返回 `{ path, ok, sha256, bytes }` 或 `{ path, ok: false, reason }`；单个坏文件只失败该项、句柄耗尽整批 reject。返回类型 `DigestFilesResult = readonly FileDigest[] | { readonly cancelled: true }`——取消以**结构化结果 resolve**，调用方用 `Array.isArray` 区分。Electron 用流式 `createReadStream` + `createHash('sha256')`（`/samples/**` 按 UTF-8 字节），Web 走核心 `sha256Bytes`。
- **取消能力 `cancelOperation(operationId)`**：按 id 取消该次目录对比在平台层的在途工作（主进程销毁该摘要操作的全部在途读取流并阻止未启动文件开流，使对应 `digestFiles` **resolve 为 `{ cancelled: true }`**），未知 id 与重复调用 resolve 不抛；`DigestFilesOptions` 仅新增可选 `operationId`。**取消错误不穿越 IPC**：handler 内再兜一层把任何漏出的 `OperationCancelledError` 转成结构化结果；renderer 适配层（`src/renderer/src/platform/index.ts` 的 `unwrapDigestResult` / `digestFilesForComparison`）在渲染进程内抛回，核心既有 catch 分支照常工作。Web 实现记录已取消 id（幂等），同形态返回。
- **文本 / 字节读写**：`readTextFile` / `writeTextFile(path, content, modifiedMs?)`（原子写 + 整毫秒回填）；`readFileBytes` / `writeFileBytes(path, content, modifiedMs?)` 读写**原始字节**（`/samples/**` 按 UTF-8 编码样本文本，非 `Uint8Array` 入参按协议错 `TypeError` 拒绝），`writeFileAtomically` 接受 `string | Uint8Array`、只有 `string` 走 UTF-8 编码；Web 用 `TextEncoder` / `TextDecoder` 表达（内存树仍是文本）。`deleteFile` / `ensureDirectory` / `removeDirectory`（只删**空**目录）失败统一经 `readableFileFailure('写入'|'删除')` / `readableDirectoryFailure('创建'|'删除')` 包装成中文含路径与 `（CODE）`、不含 `Error invoking remote method`、不暴露临时文件名。
- **非落盘可写性检查 `checkWritable(path)`**：只**询问**是否可写——可写 resolve，只读 / 无权限 / 不存在 reject，**不创建、不截断、不删除任何条目**。Electron 用 `access(target, W_OK)` 后经 `readableFileFailure('写入', …)` 包装；Web 先 `assertWritable` 再校验节点存在，不新建节点。**不得退化成「写临时文件再删」**。
- **符号链接能力**：`setSymbolicLinkModifiedMs(path, modifiedMs)` 只改**链接自身** mtime（`lutimes`，禁止 `utimes`——会打到目标）；秒值 `Math.floor(ms) / 1000 + 1e-6`，非有限数值静默 no-op。`readSymbolicLink(path)` 返回链接自身字面 target（`readlink` 级，不解析、不跟随，悬空照常返回字符串；非链接 / 缺失按可读错误拒绝）。`createSymbolicLink(target, path)` 以原样字符串建链（相对 / 悬空 / 指向目录均不 resolve、不读取、不物化；`/samples/**` 被 `assertWritable` 拒绝）。Web 无链接：两方法保持同签名并**直接拒绝**（`Web 运行时没有符号链接：<path>` / `Web 运行时暂不支持创建符号链接`），不得伪造链接节点。
- **不可读项容错**：`lstat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败时条目保留并标注 `broken` + 非空 `skippedReason`（`DirectoryEntry` 仅增可选字段）；根目录 `readdir` 失败仍 reject 并给出「无法读取目录 <path>：…」；`read-text-file` 对真实路径（含悬空链接）返回「无法读取文件 <path>：…」，经 IPC 不含包装前缀。
- **用户设置与系统语言**：`readUserSettings` / `writeUserSettings` / `systemLocale`；`UserSettings` 只有 `language: 'zh' | 'en'`。Electron 写 `app.getPath('userData')` 下单个 JSON（缺目录先创建、原子写），读取时文件缺失 / 损坏 JSON / 非对象 / 非法语言一律解析为 `null` 且不 reject（启动不因设置失败）；`systemLocale()` 原样返回 `app.getLocale()`。Web 用 `localStorage` 单键 `opencompare.userSettings`，不可用 / 抛错时退化为模块级内存，非法值读为 `null`，`systemLocale()` 取 `navigator.language`（缺失 `''`）。`src/shared/platform/settings.ts` 是共享解析单点（`isLanguage` / `parseUserSettings` / `parseUserSettingsJson` / `USER_SETTINGS_STORAGE_KEY`）。
- **文本探测**：`probeTextFile(path)` 一次读取原始字节后由 core 纯函数导出 `{ path, text, encoding, newline, bytes, sha256 }`（`TextFileProbe`）；样本按 UTF-8 参与探测；`readTextFile` / `readFileBytes` 语义不变；**不缓存、不归一化、不转码**。
- **通道与桥接纪律**：所有通道名只登记在 `src/shared/platform/channels.ts`（`PLATFORM_CHANNELS`）单一来源，preload 仅白名单转发 `ipcRenderer.invoke`，并同步 `src/preload/index.test.ts` 的 bridge surface 清单；`src/main/platform/electron-platform.test.ts` 的测试桩同步新方法集。
- **质量门禁**：`install` / `lint` / `typecheck` / `build` / `build:web` / `test` 等单条 argv 门禁（现行 26 项矩阵与条件 profile 的形状归 `quality-gates`）。

## 验收

- **ac-skills-agents / ac-scaffold / ac-deps**：`AGENTS.md` 路由到本栈官方 / 主流 Skill；electron-vite 结构工程齐备且 `install` 可完成；核心与开发依赖已在 `package.json` 声明且 typecheck 可解析。
- **ac-platformport**：`PlatformPort` 抽象 + Electron / Web 两套实现；renderer 不直接依赖 Electron API。
- **ac-select-file / ac-save-file**：两套实现均可用，取消返回 `null` 不抛错，成功与取消路径有单测。
- **ac-save-success-content / ac-save-overwrite-existing / ac-save-no-temp-residue**：保存后按 UTF-8 读回与 `content` 逐字相等（覆盖空串 / 中文与 emoji / >1 MB）；已存在旧文件被覆盖；成功路径目录条目集合等于保存前 + 目标文件，无任何临时文件残留（按新增条目 / `.tmp` 判定，不硬编码临时名）。
- **ac-save-cancel-null / ac-save-samples-readonly**：取消时解析 `null` 且目录条目集合完全不变；`/samples/**` reject 含「只读」与路径且不落盘。
- **ac-save-failure-readable / ac-save-failure-no-residue**：真实写失败（临时文件失败 / 目标为已存在目录导致 `rename` 失败）时 reject 为非空 `Error`，消息含目标路径与非空中文原因（有 OS code 一并给出），不返回 `null`；失败后目录条目集合与保存前相同——无 0 字节目标、无半截内容、无 `*.tmp`，原目标（文件 / 目录及其内容）未被破坏。
- **ac-save-port-contract / ac-save-web-unchanged / ac-save-rename-platform / ac-save-callers-green**：`saveFile` 类型与通道名不变，`preload` / `renderer` / `shared` 无改动；Web 语义不变（`/memory/**` 写入 + 触发下载，`/samples/**` 拒绝，无临时文件概念）；macOS 上真实验证 rename 覆盖，实现注释写明 Windows 口径；既有调用方测试零回归，`pnpm test` / `typecheck` / `lint` 全绿。
- **ac-batch-slot-shape / ac-seam-whitelist**：`listDirectories` 槽位数与顺序等于输入；成功槽位字段与 `listDirectory` 逐项相等；单个不可列只失败该槽位；通道名只在 `PLATFORM_CHANNELS`，preload 仅白名单转发，renderer 不 import `electron` / `node:fs`。
- **ac-digest-structured-result / ac-cancel-seam-whitelist / ac-cancel-web-parity / ac-cancel-adapter-in-renderer**：`digestFiles` 返回判别联合，取消时 **resolve** 为 `{ cancelled: true }` 而非 reject；`cancelOperation` 与 `operationId` 是唯一新增，通道只在一处；Web 幂等且同形态；`OperationCancelledError` 只在 renderer 适配层出现，核心取消控制流语义不变。
- **ac-port-surface / ac-electron-roundtrip / ac-electron-corrupt / ac-electron-locale**：三个设置方法可用；真实 IPC 往返写入后（新读取实例 / 临时 userData）读回 `{ language: 'en' }` 且只产生单个 JSON；损坏 / 非法设置读为 `null` 不抛；`systemLocale()` 原样返回 `app.getLocale()`。
- **ac-web-localstorage / ac-web-invalid-json / ac-web-memory-fallback**：jsdom localStorage 由另一 port 实例读回；写入只新增一个设置键；非法 JSON / 非法语言读为 `null`；`localStorage` 抛错时退化为内存且同实例读回，`systemLocale()` 返回 `navigator.language`。
- **ac-link-seam**：`readSymbolicLink` / `createSymbolicLink` 存在，两条通道只在一处、preload 白名单 + 表面清单覆盖；Electron 返回字面 target（悬空照常、非链接拒绝且中文可读）、以原样字符串建链（不跟随 / 不物化 / `/samples/**` 拒绝、消息无 IPC 前缀）；Web 同签名直接拒绝。
- **ac-byte-io-seam**：三个字节 / 链接 mtime 方法齐备，三条通道只在一处、表面清单覆盖；Electron `readFileBytes` 对含 `0x00` / 非 UTF-8 文件逐字节相等，`writeFileBytes` 落盘逐字节相等、mtime 整毫秒、无 `.tmp`、非 `Uint8Array` 拒绝、失败中文可读；`setSymbolicLinkModifiedMs` 只改链接自身 `lstat().mtimeMs` 且目标文件 mtime 不变，非有限数 no-op；Web 文本往返一致、链接能力 no-op。
- **ac-remove-directory-seam / ac-write-text-file-atomic / ac-platform-failure-readable**：`removeDirectory` 通道只在一处且表面清单覆盖；Electron 删空目录成功、非空 / 普通文件 / `/samples/**` 拒绝，Web 同语义；`write-text-file` 签名与通道不变但落盘改原子写（内容逐字、mtime 整毫秒、无临时残留，失败时目标原样且无 0 字节 / `.tmp`）；写 / 删 / 建目录的真实失败均为中文含路径与 `（CODE）`、无 IPC 前缀、不暴露临时名。
- **ac-check-writable-seam**：`checkWritable` 通道只在一处、表面清单覆盖；Electron 可写目录 resolve 且条目集合不变，`chmod 0555` 只读目录 reject 含路径与对应 OS code、不存在路径 reject；Web 同签名、既有可写节点 resolve 且节点数不变、缺失 / `/samples/**` 拒绝且不新建；实现中不得出现写临时文件再删的探测路径。
- **ac-gates / ac-desktop-build / ac-web-render / ac-gates-green**：`.munk/code-gates.json` 含相互独立的单 argv 门禁；`build` 产出 Electron 产物且能拉起基础壳；renderer 可在 Web 内存模式构建并拉起；全部门禁在干净安装后全绿。
- **ac-probe-text-file**：`probeTextFile` 一次读取原始字节后由同一 core 纯函数导出 `TextFileProbe`，Electron 与 Web 同签名、表面清单覆盖；`readTextFile` / `readFileBytes` 语义不变。

## 非目标

- 不做任何业务功能（目录树对比、文本 / 代码 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板提取）——这些能力的语义与 AC 归对应行为域。
- 不做视觉基线 / 设计系统（token、基础组件、真实主界面属 `workbench` / Design 项）；不做样本库内容（`src/shared/fixtures/` 归 `workbench`）。
- 不做打包分发 / CI 发布（安装包目标、签名、公证、自动更新、GitHub Release 归 `release` 域）；本域只在 `PlatformPort` 层提供文件对话框与读写能力，不含各视图的「打开 / 保存本地文件」业务入口。
- 不做远端能力（FTP / SFTP）；不做快捷键、分栏拖拽、主题切换等交互细节。
- 不做 `fsync` / 目录 fsync 崩溃持久化保证、跨设备（`EXDEV`）回退、权限 / 属主 / ACL 继承、旧文件备份或版本历史。
- 不改保存对话框标题 / 默认文件名 / 滤镜 / 取消语义；不改 `writeUserSettings` / `deleteFile` / `selectFile` 的方法签名与语义。
- 不新增设置项 / 依赖；不改 `.munk/code-gates.json` 形状（归 `quality-gates`）或新增长跑门禁；不 bump 版本，不改 README / CHANGELOG / release notes。
- 不做真实 358k 目录实测或原生保存面板人工验收（另派 product-qa）；不做 Web 平台假装拥有 POSIX 权限 / 链接 / 字节语义。

## 实现约束

- 技术栈由上游 tech-research 冻结：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind v4 + Lucide React；本机 macOS arm64 / Node v24 / pnpm 10.18.3，门禁统一用 `pnpm`。
- 分层硬约束：`src/core/` 零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测；renderer 不 import Electron / `node:*`。
- Skill 安装禁止全局写入，只用 worktree 内 `.agents/skills/`；门禁命令必须可被 Host 作为单条 argv 执行。
- **平台能力按「新增能力 + 可选参数」演进**：不改既有方法签名语义；新增能力必须同时给 Electron IPC 与 Web 内存两套实现，channel 只登记在 `channels.ts`，preload 仅白名单转发，并同步 preload 表面清单测试；批量槽位形状与失败隔离在同一 `DirectoryListing` 类型收口，不在调用点拼装。
- **取消两套实现同形态**：`cancelOperation` 幂等且返回同一结构化取消形状（`DigestFilesCancelled`）；`OperationCancelledError` 只在 renderer 适配层出现；不新增第二条进度推送通道。
- **原子写单点实现**：临时文件命名与清理只能有一处（`writeFileAtomically`），`saveFile` / `writeUserSettings` / `write-text-file` / `writeFileBytes` 共用；顺序固定 `assertWritable` → `writeFile(temporary, content)`（`string` 走 UTF-8、`Uint8Array` 原样）→ `rename`，失败 `rm(temporary, { force: true })` 后抛；临时文件必须与目标同目录；失败文案含目标路径、不含临时文件名；`writeTextFile` 的 mtime 回填保持在原子写之后（数值秒 + `1e-6`）。
- **链接原语只能是 `lstat` / `readlink` / `symlink` / `lutimes`**：`stat` / `readFile` / `utimes` 会跟随，任何「顺手用它们处理链接」的改动都会写穿或改掉目标 mtime；`createSymbolicLink(target, path)` 参数顺序是「先 target 后 path」；Web 刻意拒绝而非 no-op（no-op 会让同步以为建链成功）。
- **`checkWritable` 只问不写**：实现里出现写临时文件再删会让「拒绝时目标逐项一致」失效；它只回答目录层级可写，不保证单次写入一定成功（`rename` / `utimes` 仍可能失败），调用方必须保留回滚路径。
- **探测只答事实**：`probeTextFile` 不缓存、不归一化、不转码；任何「按探测结果重写文件」的改动都越出本缝语义。
- **测试只走既有模式**：沿用 `electron-platform.test.ts` 的 `vi.mock('electron')` + `dialogs.save.mockResolvedValueOnce` + `scratchRoot()` + 真实文件系统，经 `platform.*`（IPC handler）驱动；「保存前后 `readdir` 集合」用专门子目录比较；不可写路径用真实文件系统条件制造（`/samples/**` 只读哨兵；`rename` 失败用「目标为已存在的非空目录」），不新增生产代码测试 seam；不锁定平台相关的 rename 错误码（POSIX `EISDIR` / `ENOTEMPTY`，Windows `EPERM` / `EACCES` / `EEXIST`）。

## 最近交付证明

- WI：`wi_ws_51573dd10dcee210`（平台缝：新增 `probeTextFile`；`kind: feature`）
- 日期：2026-11-02
- 结果：`code_gates` passed（22 gates，attempt 002，`.munk/runs/run_ws_86525261fb4af0ab/code-gates/attempts/002`）；`pnpm test` 116 files / 1842 passed + 1 skipped；`needSelfTest=false`。探测语义与 AC 归 `domains/text-probe`，本域只承载平台表面与两套实现一致性。
- 覆盖摘要：`PlatformPort` 新增且仅新增 `probeTextFile(path): Promise<TextFileProbe>`（在 core 探测结果上补 `path`）；`PLATFORM_CHANNELS` 加 `platform:probe-text-file`，preload 白名单转发（`src/preload/index.test.ts` 表面清单 +1）；Electron handler 一次读取原始字节后调用 `@core/text/probe` 的同一纯函数（`/samples/**` 按样本 UTF-8 编码，字节读取器可注入以断言单次读取），Web 内存实现按内存文本 UTF-8 编码后走同一纯函数；`electron-platform.test.ts` 的测试 port 同步补该方法。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy；`qa/text-encoding-newline-probe.md` 落在 `domains/text-probe`。② `probeTextFile` 只回答探测事实，**不缓存、不归一化、不转码**——任何「顺手按探测结果重写文件」的改动都会越出本缝语义（转码写回明确非目标）。
- 前序平台缝（同域，逐条 AC 见各自 qa）：`wi_intake_b95f668b89a1770d`（`readSymbolicLink` / `createSymbolicLink`，`qa/platform-link-seam.md`）、`wi_intake_654321843130fa1f`（`readFileBytes` / `writeFileBytes` / `setSymbolicLinkModifiedMs`，`qa/platform-byte-io-seam.md`）、`wi_ws_77594c69557dbc7f`（`checkWritable`，`qa/platform-check-writable.md`）、`wi_ws_08b7067f448f263b`（`writeTextFile` 原子化 + `removeDirectory` + 可读失败，`qa/platform-atomic-write-remove-directory.md`）、`wi_ws_5d6ca74561fcb9ea`（`saveFile` 原子化，`qa/save-file-atomic.md`）。已登记缺口：两个链接缝方法、`writeFileBytes` 非法入参 / Web 字节往返、`checkWritable` Web 负向分支尚无直接单测，行为证据来自 `sync-real-gate.test.ts` 的真实 handler 路径。
