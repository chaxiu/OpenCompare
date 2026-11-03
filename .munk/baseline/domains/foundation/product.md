# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链、`PlatformPort` 平台抽象（Electron IPC + Web 内存双实现）与单命令质量门禁。本域只承载平台表面与两套实现的一致性，不含任何业务功能。

## 范围

- 从空仓初始化桌面工程：`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`；官方/主流 Skill 装到 worktree `.agents/skills/` 并写薄 `AGENTS.md` 路由表。
- 双模运行架构：`PlatformPort` 抽象 + Electron IPC 实现 + Web/内存实现，renderer 只依赖 `PlatformPort`，绝不直接 import Electron API。
- 文件对话框 IO：`selectFile` / `saveFile`（原生对话框 + `node:fs/promises` 写盘，取消 `null`；options 支持 `title` / 扩展名 `filters` / `defaultPath`）；Web 用隐藏 file input 物化到内存 FS 并尽力触发下载。
- 原子写单点（内部 `writeFileAtomically`）：目标同目录 `${target}.${randomUUID()}.tmp` + `rename`，失败 `rm(temporary, { force: true })` 后抛原始错误；`saveFile` / `writeUserSettings` / `platform:write-text-file` / `writeFileBytes` 共用，临时文件禁 `os.tmpdir()` / `app.getPath('temp')`，错误消息不暴露临时文件名。
- 目录列举：`listDirectory` / `listDirectories(paths, options?)` 按输入顺序返回等长 `DirectoryListing` 槽位（单项失败只失败该槽位）；`DirectoryEntry` 增可选 `isSymbolicLink` / `linkTarget` / `linkTargetKind`；逐条 `lstat` 经 `@core/io` 的 `mapWithLimit`（默认 8）与整批共享 `stat` 预算（`DEFAULT_STAT_CONCURRENCY = 16`）限流。
- 原始字节与探测：`readFileBytes` / `writeFileBytes`（`Uint8Array` 原样，绝不经过文本解码；`writeFileAtomically` 接受 `string | Uint8Array`）、`digestFiles` 流式 sha256、`probeTextFile`（一次读原始字节后由 core 纯函数导出 `TextFileProbe`）。
- 取消与写入预检：`cancelOperation(operationId)` 幂等、使 `digestFiles` resolve 为 `{ cancelled: true }` 且取消错误不穿 IPC；`checkWritable(path)` 只询问不落盘（`access(W_OK)`，绝不「写临时文件再删」）；`removeDirectory(path)` 只删空目录。
- 链接能力：`readSymbolicLink` / `createSymbolicLink`（字面 target、不解析不跟随）、`setSymbolicLinkModifiedMs`（`lutimes` 只改链接自身）；Web 运行时无链接，前两者同签名直接拒绝、后者 no-op。
- 用户设置与系统语言：`readUserSettings` / `writeUserSettings` / `systemLocale`；`UserSettings` 只有 `language: 'zh' | 'en'`，共享解析单点 `src/shared/platform/settings.ts`；Electron 落 `userData` 单 JSON（原子写、坏文件读 `null`），Web 落 `localStorage` 单键并可退化模块级内存。
- 不可读项容错：`listDirectory` 的 `lstat` 失败条目保留并标 `broken` + `skippedReason`；根 `readdir` 失败与 `readTextFile` 失败给中文可读错误（经 IPC 不含 `Error invoking remote method` 前缀）。
- 依赖与门禁：预装 diff / node-diff3 / papaparse / @tanstack/react-virtual / yaml / jsonc-parser / lucide-react 与 vitest / @testing-library/react / eslint / typescript；`.munk/code-gates.json` 配 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `cancel-gate` / `perf-gate` 单条 argv。

## 验收

- **ac-skills-agents**：worktree 存在非空 `AGENTS.md`，路由表指向 `.agents/skills/` 下与本栈对应的官方/主流 Skill；未用无关 Skill 凑数。
- **ac-scaffold**：根目录存在 electron-vite 结构工程（`package.json` + `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared`），`install` 门禁可成功完成依赖安装。
- **ac-deps**：`diff` / `node-diff3` / `papaparse` / `@tanstack/react-virtual` / `yaml` / `jsonc-parser` / `lucide-react` / `vitest` 均已在 `package.json` 声明且可被 typecheck 解析。
- **ac-platformport**：定义 `PlatformPort` 抽象并给出 Electron 与 Web 两套实现，renderer 不直接依赖 Electron API。
- **ac-select-file**：`selectFile` 两套实现均可用——Electron 走原生打开文件对话框返回所选绝对路径，Web 用隐藏 file input 物化到内存 FS 并返回可选路径；取消返回 `null` 且不抛错；两套实现成功与取消路径均有单测。
- **ac-save-file**：`saveFile` 两套实现均可用——Electron 保存对话框 + `node:fs/promises` 写盘返回目标路径，Web 写内存 FS 并尽力触发下载；取消返回 `null` 且不抛错；两套实现成功与取消路径均有单测（落盘细节见下列 `ac-save-*`）。
- **ac-save-success-content**：保存对话框返回新路径时 `saveFile` 解析为该路径，落地文件按 UTF-8 读回与传入 `content` 逐字相等（覆盖空串、中文/emoji 多字节、>1 MB 三种输入）。
- **ac-save-overwrite-existing**：目标已有内容不同的旧文件时，保存成功后目标为新 `content`，旧内容不再存在。
- **ac-save-no-temp-residue**：成功路径结束后目标目录条目集合等于保存前集合加目标文件本身，无任何临时文件残留（按新增条目 / `.tmp` 后缀判定，不硬编码临时文件名）。
- **ac-save-cancel-null**：对话框返回 `canceled: true`（或 `filePath` 为空）时解析为 `null`，目标目录条目集合与调用前完全相同，无新建、无截断、无临时文件。
- **ac-save-samples-readonly**：对话框返回 `/samples/**` 路径时 `saveFile` reject，错误消息含「只读」与目标路径；该路径不落盘，目标目录无任何新增条目。
- **ac-save-failure-readable**：真实写失败（临时文件写入失败，或目标为已存在目录致 `rename` 失败）时 reject 为非空 `Error`，消息含目标路径与非空中文原因（有 OS code 一并给出），不返回 `null`、不静默成功。
- **ac-save-failure-no-residue**：上述失败后目标目录条目集合与保存前完全相同：无 0 字节目标文件、无半截内容、无 `*.tmp`；`rename` 失败时已存在目标（原文件 / 原目录及内容）原样未被破坏。
- **ac-save-port-contract**：`PlatformPort.saveFile(options: SaveFileOptions): Promise<string | null>` 的类型与 `PLATFORM_CHANNELS.saveFile` 通道名不变，`src/preload/**`、`src/renderer/**`、`src/shared/platform/**` 无改动；成功返回目标路径、取消返回 `null`。
- **ac-save-callers-green**：既有调用方测试零回归——`electron-platform.test.ts` 的 native save dialog 用例、`DirectoryReportExport.test.tsx`、`App.snapshot.test.tsx`、`CodeView.test.tsx`（合并结果导出）全部通过，`pnpm test` / `typecheck` / `lint` 全绿。
- **ac-save-web-unchanged**：Web `saveFile` 语义不变：`/memory/**` 返回路径并写内存沙箱 + 触发下载，`/samples/**` reject 含「只读」；Web 不引入临时文件概念，其既有测试不变通过。
- **ac-save-rename-platform**：「rename 覆盖既有文件」在当前平台有可断言行为（`ac-save-overwrite-existing` 在 macOS 真实执行），实现处以注释写明跨平台口径：POSIX `rename` 原子替换，Windows 由 libuv 走 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING` 覆盖，目标被占用/只读时失败并走同一临时文件清理路径。
- **ac-gates**：`.munk/code-gates.json` 存在，含相互独立的 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `cancel-gate` / `perf-gate` 门禁，且每条命令为单条 argv。
- **ac-desktop-build**：`build` 门禁成功产出 Electron 桌面端产物；主进程 + renderer 均可构建，能拉起基础壳窗口。
- **ac-web-render**：renderer 可在 Web/内存模式下构建并拉起基础壳（不依赖 Electron 原生能力）。
- **ac-gates-green**：全部门禁（lint / typecheck / build / test）在干净安装后全绿通过。
- **ac-batch-slot-shape**：一次 `listDirectories` 传 N 个路径，返回槽位数为 N、顺序与输入一致；成功槽位的 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 与对同目录 `listDirectory` 逐项相等；某路径不可列时整批仍 resolve，该槽位带可读原因、其余正常（两套实现一致）。
- **ac-seam-whitelist**：新批量通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该批量列目录能力；renderer 不直接 import `electron` / `node:fs`。
- **ac-cancel-seam-whitelist**：取消通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`，`DigestFilesOptions` 只新增可选 `operationId`；renderer 不直接 import `electron` / `node:fs` / `node:crypto`。
- **ac-cancel-web-parity**：Web `cancelOperation` 幂等（未知 id、重复调用均 resolve 不抛）；`digestFiles` 在操作已取消时 **resolve 为 `{ cancelled: true }`**（与 Electron 同形，可用同一 `Array.isArray` 判别），未取消时返回值与既有断言一致。
- **ac-digest-structured-result**：`digestFiles` 返回类型为 `readonly FileDigest[] | { readonly cancelled: true }`；带 `operationId` 的调用中途被取消后 resolve 为 `{ cancelled: true }`（`Array.isArray(result) === false`）而非 reject；未取消时 resolve 为与输入等长、顺序一致的 `FileDigest[]`；`src/shared/platform/types.ts`、`src/preload/index.ts` 的 cast 与 `channels.ts` 白名单同步，不新增 IPC channel。
- **ac-cancel-adapter-in-renderer**：两套实现只交结构化结果；`OperationCancelledError` 仅由 renderer 适配层（`unwrapDigestResult` / `digestFilesForComparison`）在渲染进程内抛出，`src/core/**` 取消控制流（`compare.ts` 取消路径、`digestContentCandidates` 分块写缓存时机、`scanDirectory` 不返回部分树）语义不变，取消错误绝不跨 IPC。
- **ac-port-surface**：`PlatformPort` 暴露 `readUserSettings` / `writeUserSettings` / `systemLocale`；preload 桥接以 `PLATFORM_CHANNELS` 对应通道名调用 `ipcRenderer.invoke`（逐通道断言），既有 bridge surface 测试更新为新方法集合。
- **ac-electron-roundtrip**：经真实 `ipcMain.handle` 注册后，`writeUserSettings({ language: 'en' })` 再读取（新一次读取 / 新实例、临时 userData 目录）得到 `{ language: 'en' }`；写入产生且仅产生 userData 下单个 JSON 设置文件。
- **ac-electron-corrupt**：设置文件为 `{not json`、`null`、`"text"`、`{"language":"de"}`、`{"language":3}` 时 `readUserSettings()` 返回 `null`，不抛。
- **ac-electron-locale**：`systemLocale()` 原样返回 `app.getLocale()`（mock 为 `zh-Hant-TW` 时不改写、不截断）。
- **ac-web-localstorage**：jsdom localStorage 可用时写入后由**另一个** port 实例读回同一 settings；写入只新增一个 OpenCompare 设置键，不产生其它 key。
- **ac-web-invalid-json**：localStorage 中该键为非法 JSON 或非法语言值时读取返回 `null`，不抛。
- **ac-link-seam**：`PlatformPort` 暴露 `readSymbolicLink(path): Promise<string>` 与 `createSymbolicLink(target, path): Promise<void>`，两条通道名（`platform:read-symbolic-link` / `platform:create-symbolic-link`）只出现在 `PLATFORM_CHANNELS` 单一来源、preload 仅白名单转发且 `src/preload/index.test.ts` 覆盖这两个方法。Electron：读链返回链接自身字面 target（**不解析**，悬空照常返回字符串；非链接 / 缺失按中文可读句子拒绝），建链以原样字符串建（相对 / 悬空 / 指向目录均不 resolve、不读取、不物化目标；`/samples/**` 被 `assertWritable` 拒绝，消息不含 `Error invoking remote method`）。Web 同签名且**直接拒绝**（不伪造链接节点、不引 `node:*`）。写盘形态（`lstat` + `readlink` 逐字 + mtime 秒级）归 `domains/directory`。
- **ac-web-memory-fallback**：`localStorage` 读写抛错时，同一 port 实例写入后读回同一 settings，且 `systemLocale()` 返回 `navigator.language`（缺省 `''`）。
- **ac-byte-io-seam**：`PlatformPort` 暴露 `readFileBytes(path): Promise<Uint8Array>` / `writeFileBytes(path, content, modifiedMs?): Promise<void>` / `setSymbolicLinkModifiedMs(path, modifiedMs): Promise<void>`，三条通道名（`platform:read-file-bytes` / `platform:write-file-bytes` / `platform:set-symbolic-link-modified-ms`）只出现在 `PLATFORM_CHANNELS` 单一来源、preload 仅白名单转发且桥接表面清单测试覆盖。
  Electron：`readFileBytes` 对含 `0x00` / 非 UTF-8 字节的文件返回逐字节相等的 `Uint8Array`（`/samples/**` 返回 UTF-8 编码样本文本），`writeFileBytes` 落盘字节与入参逐字节相等、mtime 整毫秒回填、目录内不残留 `*.tmp`、非 `Uint8Array` 入参被拒绝、失败为中文可读句子（含路径与 OS code、不含 `Error invoking remote method`、不暴露临时文件名）；`setSymbolicLinkModifiedMs` 改的是**链接自身** `lstat().mtimeMs`（秒级）且被指向文件 mtime 不变，非有限数值 no-op。Web 同签名：字节读写对文本节点往返一致、样本与既有文本行为不变、不引 `node:*`，链接 mtime no-op。
- **ac-remove-directory-seam**：`PlatformPort` 暴露 `removeDirectory(path): Promise<void>`，通道名 `platform:remove-directory` 只出现在 `PLATFORM_CHANNELS` 单一来源、preload 仅白名单转发且桥接表面清单测试覆盖；Electron 删除空目录成功，非空目录 / 普通文件 / `/samples/**` 只读路径拒绝；Web 同语义（非空与文件均拒绝，成功后该节点从内存树消失）。
- **ac-write-text-file-atomic**：`platform:write-text-file` 仍接受 `(path, content, modifiedMs?)` 且通道名 / preload / `PlatformPort` 签名不变，落盘改为同目录临时文件 + `rename`——成功时目标内容逐字等于 `content`、mtime 按整毫秒回填、目录内不残留临时文件；写入失败（目标为已存在目录等）时目标原样、无零字节 / 截断文件、无 `.tmp` 残留。
- **ac-platform-failure-readable**：`writeTextFile` / `deleteFile` / `ensureDirectory` / `removeDirectory` 的真实失败均 reject 为中文可读句子，含目标路径与 OS code（有则给 `（CODE）`），消息不含 `Error invoking remote method`，也不暴露临时文件名。
- **ac-check-writable-seam**：`PlatformPort` 暴露 `checkWritable(path): Promise<void>`，通道名 `platform:check-writable` 只出现在 `PLATFORM_CHANNELS` 单一来源、preload 仅白名单转发且桥接表面清单测试覆盖。Electron 用 `access(path, W_OK)`：可写目录 resolve 且条目集合不变（不新增任何文件），`chmod 0555` 只读目录 reject 为中文可读句子（含路径与 `EACCES` / `EPERM` / `EROFS` 中对应项、不含 `Error invoking remote method`），不存在路径 reject。Web 同签名：既有可写节点 resolve 且节点数不变，缺失路径 / `/samples/**` 一律拒绝且不新建节点；实现中不得出现「写临时文件再删除」的探测路径。

## 非目标

- 不做任何业务功能（目录树对比、文本/代码 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板提取）；本域只在 `PlatformPort` 层提供对话框与读写能力，不含各视图的「打开 / 保存本地文件」业务入口。
- 不做视觉基线 / 设计系统（token、基础组件、真实主界面属后续 `ui-baseline` / Design 项）、样本库内容（`src/shared/fixtures/` 属后续子项）、快捷键 / 分栏拖拽 / 主题切换等交互细节。
- 不做打包分发 / CI 发布（安装包目标、代码签名、公证、自动更新、GitHub Release 属 `release` 域），不做 FTP / SFTP 远端能力。
- 原子化不改 `writeUserSettings` / `deleteFile` / `selectFile` 的方法签名与语义；`writeTextFile` 复用同一 `writeFileAtomically`、新增 `removeDirectory` 与 `checkWritable` 后其签名 / 通道名 / Web 语义仍不变；不新增设置项 / 依赖，不改 `.munk/code-gates.json` 或新增长跑门禁。
- 不做 `fsync` / 目录 fsync 崩溃持久化保证、跨设备（`EXDEV`）回退、权限/属主/ACL 继承、旧文件备份或版本历史；不改保存对话框标题/默认文件名/滤镜/取消语义；不 bump 版本，不改 README / CHANGELOG / release notes；不做真实 358k 目录实测或原生保存面板人工验收（另派 product-qa）。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide React；本机 macOS arm64 / Node v24.4.1 / pnpm 10.18.3，门禁命令统一用 `pnpm`。
- 分层硬约束：`src/core/` 零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测；renderer 绝不直接 import Electron API，平台能力只经 `PlatformPort`。
- **平台能力按「新增能力 + 可选参数」演进**：不改既有方法签名语义（`listDirectory(path)` 保留并复用批量实现）；新增能力必须同时给 Electron IPC 与 Web 内存两套实现，channel 只登记在 `src/shared/platform/channels.ts` 的 `PLATFORM_CHANNELS`，preload 仅白名单转发并同步 preload 表面清单测试；批量槽位形状与失败隔离在同一 `DirectoryListing` 类型上收口。
- **取消能力两套实现、同形态**：`cancelOperation` 在两条路径上幂等且返回同一结构化取消形状（`DigestFilesCancelled`，来自 `@shared/platform/types`）；`OperationCancelledError`（`@core/io`）只在 renderer 适配层出现，renderer 不引 `node:*`；IPC handler 内再兜一层，取消绝不以 reject 穿过 `ipcMain.handle`；不新增第二条进度推送通道。
- **保存原子写单点实现**：临时文件命名与清理只能有一处（内部 `writeFileAtomically`），`saveFile` / `writeUserSettings` / `platform:write-text-file` / `writeFileBytes` 共用；顺序固定 `assertWritable(target)` → `writeFile(temporary, content)`（`string` 走 UTF-8、`Uint8Array` 原样写字节）→ `rename(temporary, target)`，失败 `rm(temporary, { force: true })` 兜底后抛原始/包装错误；临时文件必须与目标同目录，禁系统临时目录；失败文案对齐 `describeFileSystemCode`（中文原因 + `（CODE）`）、含目标路径、不含临时文件名；mtime 回填在原子写之后（数值秒 + `1e-6`）。
- Skill 安装禁止全局写入，只用 worktree 内 `.agents/skills/`；门禁每条命令必须可被 Host 作为单条 argv 执行，不得用 shell 链接符拼接。
- **测试只走既有模式**：沿用 `electron-platform.test.ts` 的 `vi.mock('electron')` + `dialogs.save.mockResolvedValueOnce` + `scratchRoot()` + node 真实文件系统，经 `platform.saveFile`（IPC handler）驱动；「保存前后 `readdir` 集合」用专门子目录比较；不可写路径用真实文件系统条件制造（`/samples/**` 只读哨兵；`rename` 失败用「目标为已存在的非空目录」），不新增生产代码测试 seam，不锁定平台相关 rename 错误码（POSIX `EISDIR`/`ENOTEMPTY`，Windows `EPERM`/`EACCES`/`EEXIST`）。

## 最近交付证明

- WI：`wi_ws_51573dd10dcee210`（平台缝：新增 `probeTextFile`，`kind: feature`）；日期 2026-11-02。
- 结果：code_gates passed（22 gates，attempt 002，`.munk/runs/run_ws_86525261fb4af0ab/code-gates/attempts/002`；`pnpm test` 116 files / 1842 passed + 1 skipped；`needSelfTest=false`）。
- 覆盖摘要：`PlatformPort` 新增且仅新增 `probeTextFile(path): Promise<TextFileProbe>`（在 core 探测结果上补 `path`）；`PLATFORM_CHANNELS` 加 `platform:probe-text-file`，preload 白名单转发（表面清单 +1）；Electron handler 一次读取原始字节后调用 `@core/text/probe` 的同一纯函数（`/samples/**` 按样本 UTF-8），Web 内存实现按内存文本 UTF-8 编码后走同一纯函数；`electron-platform.test.ts` 测试 port 同步补该方法。
- 范围注：探测判定顺序与阈值口径归 `domains/text-probe`，本域只承载平台表面与两套实现一致性；本 WI change pack 仅提供 `prd.md`，无 change-pack 用例可 copy。
- 后续注意：`probeTextFile` 只回答探测事实，**不缓存、不归一化、不转码**；任何「顺手按探测结果重写文件」的改动都会越出本缝语义（转码写回明确非目标）。
