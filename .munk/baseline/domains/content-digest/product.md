# Domain: content-digest

内容摘要域：跨 `directory` / `snapshot` / `foundation`（Electron 主进程平台层）共用的**原始字节 SHA-256 摘要能力**。本域承载「谁算哈希、对什么算、一次请求怎么批量拿回结果」这一横切契约：把目录对比的内容确认从「renderer 逐文件拉 UTF-8 正文再哈希」下沉为「平台层对原始字节流式算 sha256，一次批量返回」。本域不重造目录对比的四态语义与缓存键（归 `directory`），不重造有界并发窗口与句柄错误口径（归 `io-concurrency`），不重造平台缝白名单形态（归 `foundation`）。

## 范围

- **核心字节入口（`src/core/directory/hash.ts`，纯核心层）**：新增 `sha256Bytes(bytes: Uint8Array): string`，对字节序列本身算 SHA-256，返回 64 位小写 hex；既有 `sha256Hex(text)` 签名与输出不变，内部改为 `sha256Bytes(new TextEncoder().encode(text))`。不引入新依赖、不新建并行哈希模块，仍零 Electron / DOM 依赖，可在 vitest `node` 环境直接单测。
- **平台能力 `PlatformPort.digestFiles(paths, options?)`（`src/shared/platform/types.ts`）**：一次请求携带一批绝对路径，按**输入顺序**返回每个文件的结果。成功项为 `{ path, ok: true, sha256, bytes }`（`sha256` 为原始字节的 64 位小写 hex，`bytes` 为实际处理字节数）；失败项为 `{ path, ok: false, reason }`，单个文件失败只标记该项，**不因一个坏文件让整批失败**。`DigestFilesOptions` 仅含可选 `concurrency`。返回值类型 `FileDigest = FileDigestSuccess | FileDigestFailure`。
- **Electron 主进程实现（`src/main/platform/electron-platform.ts`）**：用 `node:crypto` 的 `createHash('sha256')` 对 `createReadStream` 的输出**流式**更新，绝不先 `readFile(path,'utf8')` 再哈希；一条文件流只持有一个句柄，`stream.destroy()` 在 finally 收尾；整批经既有 `@core/io` 的 `mapWithLimit` 有界并发（默认沿用 `DEFAULT_IO_CONCURRENCY`）。`/samples/**` 样本按 UTF-8 字节编码后摘要（样本本质为文本）。读取失败按 `readableFailure` 产出可读原因；`EMFILE` / `ENFILE` 经 `toReadableIoError` **整批 reject**，不被逐文件失败吞掉。
- **Web 运行时实现（`src/renderer/src/platform/web-platform.ts`）**：不碰 `node:crypto` / 异步 WebCrypto，用核心 `sha256Bytes` 对内存 FS 节点的 UTF-8 字节直接算，对同一字节序列与主进程给出相同 hex；路径不存在 / 是目录时返回带可读原因的失败项。
- **IPC 缝（`src/shared/platform/channels.ts` / `src/preload/index.ts`）**：新通道 `platform:digest-files` 只登记在 `PLATFORM_CHANNELS` 单一来源，preload 仅按该白名单转发并 cast 为 `readonly FileDigest[]`；`PlatformPort` 表面新增且仅新增该能力，renderer 不直接 import `electron` / `node:crypto`。
- **对比引擎消费（`src/core/directory/compare.ts`）**：新增 `ComparisonIoOptions extends ConcurrencyOptions`，含可选 `digestFiles?: DigestFiles` 与 `digestible?: (path) => boolean`。`digestContentCandidates` 先按既有 size/mtime 快路径 + `(path, size, modifiedMs)` 缓存算出待确认路径，再把可摘要路径**一次批量**交给 `digestFiles`，其余路径（如快照挂载点）保留既有 `readTextFile` + `sha256Hex` 回退；摘要成功即写回 `cache.hashes`，失败项记入 `unreadable` 不写缓存。`compareDirectories` / `compareDirectorySides` 的 `options` 尾参类型放宽为 `ComparisonIoOptions`，不传摘要能力时行为与既有文本读取路径完全一致（旧调用与旧测试签名保持可用）。
- **快照 ↔ 目录对比（`src/core/directory/snapshot.ts`）**：`compareDirectorySides` 未显式给 `digestible` 时自动注入「快照挂载路径不可摘要」判定，真实文件一侧走摘要能力、快照侧仍是 `readSnapshotContent` + 文本摘要；四态结果与内联文本摘要口径不变，`.ocsnap.json` 线格式与 sha256 口径保持文本 UTF-8 摘要。
- **renderer 调用点（`src/renderer/src/workbench/directoryOps.ts` / `loadSampleSessions.ts` / `snapshotOps.ts`）**：目录对比、内置样本目录会话、快照对比一律传 `{ digestFiles: (paths) => platform.digestFiles(paths) }`，不再为哈希调用 `readTextFile`；`readTextFile` 能力保留给下钻正文、同步写入、快照与模板。

## 验收

- **ac-digest-ascii-parity**：对同一 ASCII 字节序列（如 `abc`），核心纯 JS 字节摘要、Web 平台 `digestFiles` 与主进程 `node:crypto` 摘要返回同一 64 位小写 hex，且等于 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`。
- **ac-digest-utf8-parity**：对含多字节字符（如 `中文🙂`、带 BOM 文本）的同一字节序列，主进程与 Web/纯 JS 字节摘要一致，且与既有 `sha256Hex(text)` 结果相同。
- **ac-digest-invalid-utf8-parity**：对含非法 UTF-8 字节的同一序列（如 `61 ff fe 00 62`），主进程与纯 JS 字节摘要一致，且**不等于**把这些字节按 UTF-8 解码成 U+FFFD 后重新编码所得的摘要——证明哈希走的是原始字节而非解码后的字符串。
- **ac-digest-empty-and-large**：空文件摘要等于 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；大于单个流式块（≥ 1 MiB + 7 字节，且块边界错位）的文件摘要等于对整份字节缓冲一次性哈希的结果。
- **ac-digest-batch-shape**：一次 `digestFiles` 传入 N 个路径，返回元素个数为 N、顺序与输入一致；成功项 `sha256` 为 64 位小写 hex 且 `bytes` 等于文件真实字节数；同一批里同时含可读文件与不存在路径时，整批仍 resolve，坏路径只出现在失败项中并带可读原因。
- **ac-digest-no-text-read**：对 size 与 mtime 完全相同、仅内容不同的文件对做目录对比，结果判 `modified`，且该次对比中 `readTextFile` 调用次数为 0（仅摘要能力被调用）。
- **ac-digest-binary-modified**：两个真实临时文件 size 与 mtime 完全相同、仅非法 UTF-8 字节不同，目录对比判 `modified`（改造前会被 UTF-8 解码抹平而判 `same`）。
- **ac-digest-sample-mount**：`/samples/**` 路径在 Electron 与 Web 两种平台实现下都能被 `digestFiles` 摘要，结果等于 `sha256Hex(样本文本)`，样本目录对比四态计数与既有断言一致。
- **ac-digest-cache-reuse**：同一 `ComparisonCache` 下二次对比同一对目录，摘要请求不再包含 size/mtime 未变的已缓存路径（第二次摘要路径集合为空），四态结果与首次一致。
- **ac-digest-unreadable-tolerant**：摘要能力对单个不可读文件回报失败项（不 reject 整批），目录对比据此把该对判 `modified` 并计入 `skipped`，不中断整次对比。
- **ac-digest-emfile-fatal**：摘要读取遇到 `EMFILE` / `ENFILE` 时，整次对比以既有可读中文错误（含错误码）结束，不被当作逐文件失败吞掉。
- **ac-digest-seam-whitelist**：新 IPC 通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该摘要能力，renderer 不直接 import `electron` / `node:crypto`。
- **ac-digest-no-regression**：`pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件与四态计数零回归；`.ocsnap.json` 的字段、序列化顺序与快照 sha256 口径不变（仍是文本 UTF-8 摘要）。

## 非目标

- 不做批量 / 分页列目录、遍历并发改造、`stat` 预算（后续 WI）。
- 不做进度上报、进度 UI、取消按钮与取消错误（后续 WI）。
- 不改四态语义、对比 / 合并算法、缓存键、缓存失效钩子语义。
- 不改 `.ocsnap.json` 快照线格式、导入校验、内联文本策略；快照构建 / 导出的哈希口径保持文本摘要。
- 不新增持久化哈希缓存、不改发布模型。
- 不删除 `readTextFile` 能力：下钻查看正文、同步写入、快照、模板仍继续使用。
- 不跑浏览器 / 桌面实机验收，不用内置样本或小目录充当性能结论。
- 不改 UI 布局、不改合并 / 同步 / 模板业务语义。

## 实现约束

- 复用既有 SHA-256 实现：在 `src/core/directory/hash.ts` 新增字节级入口，`sha256Hex(text)` 保持签名与输出不变（内部复用字节入口），不引入新依赖、不新建并行哈希模块。
- 主进程必须流式：`createReadStream` + `createHash('sha256')`（或等价定长 buffer 循环读取），禁止把整份文件读成字符串；批内并发统一走 `src/core/io.ts` 的 `mapWithLimit`，默认沿用 `DEFAULT_IO_CONCURRENCY`；不得改变遍历并发（属后续 WI）。
- Web 回退不得使用 `node:crypto` 或异步 WebCrypto；纯 JS 字节摘要必须能在 vitest `node` 环境直接单测（`src/core` 无 Electron / DOM 依赖红线不变）。
- 平台缝扩展以新增能力 + 可选参数方式接入：`compareDirectories` / `compareDirectorySides` 的既有调用与既有测试签名保持可用，未提供摘要能力时回退到既有文本读取路径；renderer 真实运行路径必须传摘要能力。
- 缓存写入时机与键保持 `(path, size, modifiedMs)`；命中即不再请求摘要。失败项不写缓存。
- 新通道必须在 `PLATFORM_CHANNELS` 中登记；preload 测试的表面清单同步更新；`ac-*` 断言写进 `pnpm test`（code_gates 六条不变：install / lint / typecheck / build / build:web / test）。

## 最近交付证明

- WI：`wi_ws_f67675b0f814cd10`（主进程流式字节 SHA-256 与 Web 同构回退，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`src/core/directory/hash.ts` 新增 `sha256Bytes(Uint8Array)`，`sha256Hex` 改为其 UTF-8 包装（签名与输出不变）；`src/shared/platform/types.ts` 新增 `FileDigestSuccess` / `FileDigestFailure` / `FileDigest` / `DigestFilesOptions` 与 `PlatformPort.digestFiles`；`channels.ts` 仅新增 `platform:digest-files`，preload 按白名单转发（表面清单同步）；主进程 `digestFiles` 用 `createReadStream` + `createHash('sha256')` 流式摘要原始字节，`/samples/**` 按 UTF-8 字节摘要，逐文件失败仅标记该项，`EMFILE` / `ENFILE` 经 `toReadableIoError` 整批 reject，批内经 `mapWithLimit` 有界并发；Web 实现用 `sha256Bytes` 对内存 FS 字节摘要，路径缺失 / 目录返回可读失败项；`compare.ts` 新增 `ComparisonIoOptions`（`digestFiles` / `digestible`），`digestContentCandidates` 把可摘要路径一次批量交给摘要能力并写回 `cache.hashes`，其余路径保留文本读取回退，`compareDirectories` 尾参放宽；`snapshot.ts` 的 `compareDirectorySides` 自动排除快照挂载路径，快照侧仍为文本摘要，四态与 `.ocsnap.json` 口径不变；`directoryOps.ts` / `loadSampleSessions.ts` / `snapshotOps.ts` 三处调用点改传 `platform.digestFiles`，不再为哈希读正文。测试随动：`compare.test.ts` / `snapshot.test.ts` / `electron-platform.test.ts` / `web-platform.test.ts` / `App.test.tsx` / `preload/index.test.ts` 覆盖字节与文本同构、非法 UTF-8 不被抹平、空文件与大文件块边界、批量形状与坏路径容错、样本挂载、缓存复用、不可读容忍、EMFILE 致命、零正文读取与缝白名单。
- 注：本 WI change pack 未提供 `tests/cases/**`、`tech.md`、`ux/**`，故本轮无 QA 用例折叠，全局 tech / design 折叠跳过；本域 `qa/` 留空待后续 WI 落档。
