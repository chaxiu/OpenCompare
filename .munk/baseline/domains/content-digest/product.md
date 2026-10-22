# Domain: content-digest

内容摘要域：跨 `directory` / `snapshot` / `foundation`（Electron 主进程平台层）共用的**原始字节 SHA-256 摘要能力**。本域承载「谁算哈希、对什么算、一次请求怎么批量拿回结果」这一横切契约：把目录对比的内容确认从「renderer 逐文件拉 UTF-8 正文再哈希」下沉为「平台层对原始字节流式算 sha256，一次批量返回」。本域不重造目录对比的四态语义与缓存键（归 `directory`），不重造有界并发窗口与句柄错误口径（归 `io-concurrency`），不重造平台缝白名单形态（归 `foundation`）。

## 范围

- **核心字节入口（`src/core/directory/hash.ts`，纯核心层）**：新增 `sha256Bytes(bytes: Uint8Array): string`，对字节序列本身算 SHA-256，返回 64 位小写 hex；既有 `sha256Hex(text)` 签名与输出不变，内部改为 `sha256Bytes(new TextEncoder().encode(text))`。不引入新依赖、不新建并行哈希模块，仍零 Electron / DOM 依赖，可在 vitest `node` 环境直接单测。
- **平台能力 `PlatformPort.digestFiles(paths, options?)`（`src/shared/platform/types.ts`）**：一次请求携带一批绝对路径，按**输入顺序**返回每个文件的结果。成功项为 `{ path, ok: true, sha256, bytes }`（`sha256` 为原始字节的 64 位小写 hex，`bytes` 为实际处理字节数）；失败项为 `{ path, ok: false, reason }`，单个文件失败只标记该项，**不因一个坏文件让整批失败**。`DigestFilesOptions` 含可选 `concurrency` 与可选 `operationId`；返回值类型 `FileDigest = FileDigestSuccess | FileDigestFailure`。
- **摘要批量可取消（横切契约，`operationId` + `cancelOperation`）**：带 `operationId` 的一次 `digestFiles` 把全部在途读取流登记到该操作；`PlatformPort.cancelOperation(operationId)` 到达后销毁这些流、阻止未启动文件继续开流，`digestFiles` **resolve 为结构化取消 `{ cancelled: true }` 而不是返回部分槽位，也不以 reject 表达取消**——返回值类型是判别联合 `DigestFilesResult = readonly FileDigest[] | DigestFilesCancelled`，调用方用 `Array.isArray` 区分；操作结束（成功 / 失败 / 取消）后注册项回收，未知 id 与重复调用幂等 resolve。取消是独立结局，不被当成逐文件失败，也不产生任何 `FileDigest` 条目。摘要分块（一次 `digestFiles` 带多少路径）由核心 `DEFAULT_DIGEST_BATCH_SIZE` 决定并可在测试经 `digestBatchSize` 覆盖，见 `directory` 域；本域只保证「一块是一批、取消整块不落地」。Web 实现以已取消 id 集合复刻同一结构化形状（幂等、未取消时行为不变）；renderer 适配层把 `{ cancelled: true }` 在本进程抛成 `OperationCancelledError`，核心侧取消语义不变。
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
- **ac-digest-cancel-no-partial**：带 `operationId` 的 `digestFiles` 在一批流式读取中途被 `cancelOperation` 时 **resolve 为 `{ cancelled: true }`**（不 reject、不返回任何部分槽位）；已启动的流全部销毁、活动流计数与注册表计数归零。
- **ac-digest-cancel-idempotent-scope**：`cancelOperation` 对未知 `operationId` 与同一 id 的重复调用均 resolve 不抛；正常结束的 `digestFiles` 之后注册项已回收，同 id 的后续取消不影响其他并发操作。并发 A / B 两个摘要操作（不同 `operationId`）取消 A 只让 A 返回结构化取消，B 随后正常 resolve 且槽位内容正确。
- **ac-digest-cancel-web-parity**：Web 平台的 `cancelOperation` 幂等（未知 id、重复调用均 resolve），`digestFiles` 在操作已取消时同样返回 `{ cancelled: true }`，未取消时返回值与既有断言一致；两平台可用同一 `Array.isArray` 判别逻辑。
- **ac-cache-no-partial**：固定 `digestBatchSize` 且在第 2 块读取中途取消时，`ComparisonCache.hashes` 只包含第 1 块已完整结算的条目（逐条 `size` / `modifiedMs` 匹配，`hash` 等于该文件真实 sha256），被取消块的路径条目数为 0；不存在「有键无正确 hash」的半份条目。
- **ac-normal-path-unchanged**：未取消的摘要成功路径逐项字段（`path` / `ok` / `sha256` / `bytes`）与改造前一致、长度与顺序不变；`pnpm test` 全绿且快照 / 同步 / 模板套件零回归。
- **ac-digest-no-regression**：`pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件与四态计数零回归；`.ocsnap.json` 的字段、序列化顺序与快照 sha256 口径不变（仍是文本 UTF-8 摘要）。

## 非目标

- 不做批量 / 分页列目录、遍历并发改造、`stat` 预算（后续 WI）。
- **不做进度语义与进度 UI**：`onProgress` 的阶段/计数口径、进度条与取消按钮归 `directory` / `workbench` 域；本域只保证「一批摘要可被取消且不返回部分槽位」，不做定时器插值、不做跨进程进度推送，不做暂停 / 恢复 / 断点续传，不做取消后自动重试。
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
- **`operationId` 是可选尾参**：未带 `operationId` 的既有 `digestFiles` 调用行为完全不变；注册表按 id 隔离并在 `finally` 回收，取消后不得留下活动流或残留注册项（否则下一次对比 EMFILE）。**取消在平台 / IPC 边界一律以 `{ cancelled: true }` 表达**（`DigestFilesResult` 判别联合，`Array.isArray` 判别，不新增包装对象），`OperationCancelledError` 只在 `src/core/**` 与 renderer 适配层出现，不跨 IPC。
- **分块写缓存时机**：一块 settle 后才写该块成功项，取消时未结算块不写；缓存键 `(path, size, modifiedMs)` 与失效语义不变。

## 最近交付证明

- WI：`wi_ws_601ef56ae8fd93a4`（取消结构化返回、零日志噪声与零残留，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（`pnpm test` 全绿 + 新增 `cancel-gate`；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`PlatformPort.digestFiles` 的返回类型由 `Promise<readonly FileDigest[]>` 改为 `Promise<DigestFilesResult>`（`src/shared/platform/types.ts` 新增 `DigestFilesCancelled`），成功路径仍为等长有序 `FileDigest[]`、取消路径为 `{ cancelled: true }`；Electron 侧在 `digestFiles` 入口与 `catch` 两处把 `OperationCancelledError` 转结构化、`IPC handler` 再兜一层；Web 侧删除 `@core/io` import，改为返回结构化标记。renderer 侧新增 `unwrapDigestResult` / `digestFilesForComparison`（`src/renderer/src/platform/index.ts`）在渲染进程内抛回 `OperationCancelledError`，`directoryOps` / `loadSampleSessions` / `snapshotOps` 三个消费点改经它取摘要，核心 `digestContentCandidates` 的分块写缓存时机与四态语义未动。`electron-platform.test.ts` 断言改为 `toEqual({ cancelled: true })` + `digestOperationCount() === 0`；`cancel-gate.test.ts` 覆盖「第 2 块取消后 `cache.hashes` 只含第 1 块完整条目、被取消块 0 条、重比与基线一致」。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；平台缝/两组实现归 `domains/foundation`，流与注册表残留、零噪声门禁归 `domains/io-concurrency`，半树/重试归 `domains/directory`，取消提示 UI 归 `domains/workbench`。

- WI：`wi_ws_90a06ca6d557d5cd`（扫描/哈希进度与可取消，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿）。
- 覆盖摘要：`DigestFilesOptions` 仅新增可选 `operationId`（`concurrency` 语义不变），`PlatformPort.digestFiles` 在带 id 时整批可取消：主进程按 id 登记在途 `ReadStream`，`cancelOperation` 置标记 + `destroy` 每条流并阻止未启动文件开流，`digestFiles` 以 `OperationCancelledError` 整批 reject 不返回部分槽位，`finally` 回收注册项；未带 id 的调用完全不变。Web 实现用已取消 id 集合复刻同签名 `cancelOperation`（幂等）与取消错误；`compare.ts` 的分块 `digestFiles` 每块 settle 后才写 `cache.hashes`。`electron-platform.test.ts`「digest cancellation」4 条 + `web-platform.test.ts`「web digest cancellation」2 条覆盖不返回部分槽位、幂等/回收、A/B 隔离、取消后无残留可重比、Web 同构与未取消行为不变。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例；核心进度与分块步长归 `domains/directory`，abort 竞速与流生命周期归 `domains/io-concurrency`，通道白名单与平台表面归 `domains/foundation`。

- WI：`wi_ws_f67675b0f814cd10`（主进程流式字节 SHA-256 与 Web 同构回退，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`src/core/directory/hash.ts` 新增 `sha256Bytes(Uint8Array)`，`sha256Hex` 改为其 UTF-8 包装（签名与输出不变）；`src/shared/platform/types.ts` 新增 `FileDigestSuccess` / `FileDigestFailure` / `FileDigest` / `DigestFilesOptions` 与 `PlatformPort.digestFiles`；`channels.ts` 仅新增 `platform:digest-files`，preload 按白名单转发（表面清单同步）；主进程 `digestFiles` 用 `createReadStream` + `createHash('sha256')` 流式摘要原始字节，`/samples/**` 按 UTF-8 字节摘要，逐文件失败仅标记该项，`EMFILE` / `ENFILE` 经 `toReadableIoError` 整批 reject，批内经 `mapWithLimit` 有界并发；Web 实现用 `sha256Bytes` 对内存 FS 字节摘要，路径缺失 / 目录返回可读失败项；`compare.ts` 新增 `ComparisonIoOptions`（`digestFiles` / `digestible`），`digestContentCandidates` 把可摘要路径一次批量交给摘要能力并写回 `cache.hashes`，其余路径保留文本读取回退，`compareDirectories` 尾参放宽；`snapshot.ts` 的 `compareDirectorySides` 自动排除快照挂载路径，快照侧仍为文本摘要，四态与 `.ocsnap.json` 口径不变；`directoryOps.ts` / `loadSampleSessions.ts` / `snapshotOps.ts` 三处调用点改传 `platform.digestFiles`，不再为哈希读正文。测试随动：`compare.test.ts` / `snapshot.test.ts` / `electron-platform.test.ts` / `web-platform.test.ts` / `App.test.tsx` / `preload/index.test.ts` 覆盖字节与文本同构、非法 UTF-8 不被抹平、空文件与大文件块边界、批量形状与坏路径容错、样本挂载、缓存复用、不可读容忍、EMFILE 致命、零正文读取与缝白名单。
- 注：本 WI change pack 未提供 `tests/cases/**`、`tech.md`、`ux/**`，故本轮无 QA 用例折叠，全局 tech / design 折叠跳过；本域 `qa/` 留空待后续 WI 落档。
