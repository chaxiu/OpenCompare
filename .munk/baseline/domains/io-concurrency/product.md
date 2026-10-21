# Domain: io-concurrency

IO 并发治理域：跨 `directory` / `snapshot` / `foundation`（Electron 主进程平台层）三域共用的**文件 IO 有界并发契约**与**文件句柄耗尽（EMFILE / ENFILE）的可读错误边界**。本域只承载「一次 fan-out 能同时开多少个句柄、句柄耗尽时用户看到什么」这一横切契约，不重造目录对比语义、快照协议或平台能力本身；那些仍归各自域。核心实现是一个零 Electron / DOM 依赖的小工具 `src/core/io.ts`，由核心比对引擎与主进程平台层共用。

## 范围

- **有界并发工具（`src/core/io.ts`，纯核心层）**：导出 `DEFAULT_IO_CONCURRENCY`（默认在飞窗口，取 8–16 之间的常量，当前为 8）、`ConcurrencyOptions`（`concurrency?`，低于 1 或非有限值回退默认）、`mapWithLimit(items, options, worker)`。语义：最多 N 个 `worker` 同时在飞、**结果顺序与输入顺序一致**、首个失败后不再启动新任务、等在飞任务收敛后以该错误 reject（**绝不返回部分结果**）。
- **接入点一：目录内容读取（`src/core/directory/compare.ts`）**：`compareDirectories` 的 `planContentReads` 全量 `readTextFile` 从 `Promise.all` 改为 `mapWithLimit`，新增可选 `options: ConcurrencyOptions` 尾参（测试可传 `{ concurrency: 2 }`）。
- **接入点二：快照内容读取（`src/core/directory/snapshot.ts`）**：`compareDirectorySides` 的内容读取（目录侧走 `readTextFile`、快照侧走内联 `readSnapshotContent`）同样经 `mapWithLimit`，并透传 `options`；快照内联内容分支不额外产生文件句柄。
- **接入点三：目录条目元数据（`src/main/platform/electron-platform.ts`）**：目录条目的逐条 `stat` 由无上界 `Promise.all` 改为经 `mapWithLimit` 走有界窗口；自批量列目录起，窗口口径从「每目录一份」升级为**整批所有目录的所有条目共用一份全局有界 `stat` 预算**（`DEFAULT_STAT_CONCURRENCY = 16`，导出且可在测试中注入覆盖），批量目录数不再放大在飞 `stat` 数；返回顺序与字段（`name` / `path` / `isDirectory` / `size` / `modifiedMs`）与逐条串行结果一致。
- **接入点四：递进式目录遍历（`scanDirectory`）**：队列 + 批量取数 + 有界并发——分层收集待列目录、一次批量往返覆盖多个目录，批量调用经 `mapWithLimit` 限制在飞数（遍历默认并发 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`，可经 `ScanDirectoryOptions.concurrency` 覆盖）；`list` / 批量调用失败经 `toReadableIoError` 转换后抛出，首错停发、等在飞收敛、绝不返回部分树。**遍历并发与 `stat` 预算是两个独立常量**，互不代偿，也不得通过抬高 `DEFAULT_IO_CONCURRENCY`（内容读取/摘要默认 8）来达成。
- **接入点五：批量字节摘要（`PlatformPort.digestFiles`，语义归 `content-digest` 域）**：主进程 `digestFiles` 按批经 `mapWithLimit(paths, options, …)` 流式读取文件原始字节算 sha256，一条流一个句柄，默认窗口沿用 `DEFAULT_IO_CONCURRENCY`；单文件读取失败只标记该项失败，`EMFILE` / `ENFILE` 经 `toReadableIoError` 整批 reject（由 `compare.ts` 的 `digestContentCandidates` 转成可读错误），不被逐文件失败吞掉。本域只拥有窗口与句柄错误口径，摘要算法与平台缝归 `content-digest`。
- **可读句柄错误（`FileHandleExhaustedError` / `toReadableIoError`）**：识别 `EMFILE` / `ENFILE`，在核心层边界转换为中文错误，消息包含「文件句柄」并保留原始错误码线索（EMFILE / ENFILE）；其他错误原样透传，不改平台层既有抛错结构。UI 侧复用工作台既有 `notice` / `report` 就地提示，不静默吞、不崩窗口、不生成空目录会话。
- **取消错误与 abort 竞速（`src/core/io.ts`，纯核心层）**：新增 `OperationCancelledError`（`name = 'OperationCancelledError'`、`code = 'ECANCELED'`、中文消息含「已取消」）、`isOperationCancelled(error)`、`throwIfAborted(signal)` 与 `abortable(operation, signal)`。`abortable` 与 signal 竞速：signal 已触发时立即以取消错误 reject 并给被放弃的 promise 挂 `catch`，未触发时正常透传结果/错误并解绑监听；`toReadableIoError` 仍只转换 `EMFILE` / `ENFILE`，取消错误原样透传。
- **主进程在途摘要流注册表（`src/main/platform/electron-platform.ts`）**：按 `operationId` 记录该次摘要全部在途 `ReadStream` 与「已取消」标记；`cancelOperation(operationId)` 同步置标记并 `destroy` 每条流（带取消错误），使该次 `digestFiles` 整批 reject 而非返回部分槽位，未启动的文件不再开流；操作结束（成功 / 失败 / 取消）在 `finally` 回收注册项。导出 `activeDigestStreamCount()` 供断言，要求取消后（最迟 100ms 内）归零——注销的句柄即 EMFILE 隐患，归本域句柄生命周期口径。
- **README「已知问题」段**：明确写出 v0.2.1 及更早版本拖入大目录可能触发 `EMFILE`，且当前版本已修复（有界并发读取 + 可读错误提示）。

## 验收

- **ac-bounded-content-read**：对含 3000 个需读内容的文件对注入 `readTextFile`（记录进入/退出并统计在飞峰值），`compareDirectories` 完成且 `peak ≤ 配置上限`；同一输入在限流开关前后 `counts` 与分类结果完全一致。
- **ac-bounded-snapshot-read**：`compareDirectorySides` 在 3000 文件规模下同样完成且 `peak ≤ 配置上限`，快照挂载内容与真实目录内容的分类结果不变。
- **ac-limit-configurable**：默认上限常量落在 8–16（含端点），显式传入更低上限（如 2）时实测峰值 ≤ 2，且结果与默认上限时一致。
- **ac-bounded-traversal**：目录遍历/条目 stat 的并发映射对 5000 个条目在飞峰值 ≤ 上限；`listDirectory` 经该限流器后返回条目数、`isDirectory`/`size`/`modifiedMs` 字段与逐条串行结果一致。
- **ac-emfile-readable**：注入的 `readTextFile` 以 `code: 'EMFILE'` reject 时，`compareDirectories` 与 `compareDirectorySides` 均以 `Error` reject，消息包含「文件句柄」且保留原始错误码线索（EMFILE），不返回部分结果、不静默吞。
- **ac-emfile-not-crash**：上述失败路径下错误向上传播到调用方（workbench 既有 `report` / `onError` 分支），不抛出未捕获异常、不生成空目录会话。
- **ac-existing-semantics**：既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` 用例全部通过；相同大小不同内容仍判 `modified`、缓存命中不重复读取等原有语义不变。
- **ac-readme-known-issue**：README 存在「已知问题」段，明确写出 v0.2.1 及更早版本拖入大目录可能触发 `EMFILE`，并写明当前版本已修复（有界并发读取 + 可读错误提示）。
- **ac-global-stat-budget**：让一次批量请求带 M 个目录、每目录 K 个条目（M×K 远大于预算）经主进程批量列目录、`stat` 走可注入 worker：全程在飞 `stat` 峰值 ≤ 全局预算常量，且该常量 < M×K；预算常量单一来源导出，不随批量目录数放大。
- **ac-fd-exhaustion-fatal**：批量列目录的 `stat` / `readdir` 抛 `EMFILE` 或 `ENFILE` 时，`compareDirectories` reject 可读中文错误（消息含「文件句柄」与原始错误码），该失败**不**被计入 `skipped`。
- **ac-no-partial-tree**：扫描进行中遇到上述致死错误（或批量返回缺少被请求目录的槽位）时，调用方拿到的是 reject，`scanDirectory` 不返回任何部分 `ScannedTree`，`compareDirectories` 不返回 `DirectoryComparison`；`mapWithLimit` 的「首错停发、等在飞收敛、绝不返回部分结果」语义在批量扫描路径上成立。
- **ac-bounded-traversal-batch**：对含 ≥ 32 个可列目录的 fixture 用默认参数扫描，实测在飞批量请求峰值 ≥ 16 且 ≤ 遍历并发上限常量；显式传入上限（如 4）时峰值 ≤ 4，且树、`index` 键集合、四态计数与 `skipped` 与默认并发下逐项相等。
- **ac-cancel-error-contract**：`OperationCancelledError` 的 `name === 'OperationCancelledError'`、`code === 'ECANCELED'`、消息含「已取消」；`isOperationCancelled` 能识别它，`toReadableIoError` 不把它改写成句柄错误。
- **ac-abort-race**：用永不 resolve 的假平台调用挂住一个批次后 `abort()`，`abortable` 立即以取消错误 reject（不等在飞 promise 收敛），且被放弃的 promise 不产生 unhandled rejection。
- **ac-cancel-main-streams-zero**：主进程 `digestFiles(paths, { operationId })` 正在流式读取（经可注入流工厂挂住）时调用 `cancelOperation(operationId)`：该次 `digestFiles` 以取消错误 reject、不返回部分槽位；reject 时（最迟 100ms 内）导出的活动读取流计数归零，每个注入流都收到 `destroy`。
- **ac-cancel-registry-idempotent**：`cancelOperation` 对未知 `operationId` 与同一 id 的重复调用均 resolve 不抛；一次正常结束的 `digestFiles` 之后其注册项已回收（同 id 的 `cancelOperation` 不再影响其他并发操作）。
- **ac-cancel-operation-scoped**：同一平台实例上并发两个摘要操作 A 与 B（不同 `operationId`，均挂住）：取消 A 只让 A 以取消错误 reject，B 随后正常 resolve 且槽位内容正确；B 的活动流计数在 A 取消后仍 > 0。

## 非目标

- 不改打包 / 发布 workflow，不动 GitHub Actions、不发版、不重指 tag。
- 不动内置样本库（`src/shared/fixtures/`、`/samples` 挂载）与示例数据。
- 不做实机验收、不做 self_test、不做桌面点选验收。
- 本域不改 `PlatformPort` 契约语义与既有 channel / preload 白名单形态；新增平台能力（如批量字节摘要）归 `content-digest` / `foundation` 域，本域只规定其并发窗口与句柄错误口径。
- 不改目录对比语义、过滤、下钻、同步 / 模板逻辑与 UI 布局；不顺带做「体验优化」类改动。
- 不引入新的第三方并发库或运行时依赖（不引 p-limit / p-queue 之类）。
- 不做进度上报语义与进度 UI：批次计数、阶段名与 `onProgress` 契约归 `directory` 域，本域只提供「批次可被中断」的竞速原语；不做暂停 / 恢复 / 断点续传，不做取消确认对话框。

## 实现约束

- 用户已指定做法：有界并发默认 8–16（常量或可选参数配置），作用于 `compareDirectories`、快照内容读取与目录遍历；沿用现有模块边界，不新造抽象层。目录遍历自批量取数起改用独立默认 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`（≥ 16 是硬要求，不得靠抬高内容读取默认 8 来代偿）。
- 限流工具必须放核心层（`src/core/io.ts`，零 Electron / DOM 依赖），供核心与主进程共用；主进程经 `@core/io` 别名引用，renderer 不参与。
- 保持结果顺序稳定：`mapWithLimit` 按输入下标写回结果数组，调用方（`new Map(entries)`）不感知并发窗口。
- EMFILE / ENFILE 的可读错误转换放在核心层边界（`compareDirectories` / `compareDirectorySides` / `scanDirectory` 的 `list` 与批量调用），保证浏览器内存实现与 Electron 实现同口径；不改平台层抛错结构。
- 默认值和上限只存在一处、各自单一来源导出：`DEFAULT_IO_CONCURRENCY`（内容读取 / 摘要，8）、`DEFAULT_TRAVERSAL_CONCURRENCY`（遍历在飞批量调用，16）、`DEFAULT_STAT_CONCURRENCY`（整批共享的 `stat` 预算，16）；调用点不得重复硬编码数字，测试经可选参数覆盖。
- README「已知问题」与修复交付使用同一行口径，写事实不写空话。
- 交付前 `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`（含 build:web）全绿。
- **取消必须是竞速而非等待收敛**：批次用 `abortable` 与 signal `Promise.race`，被放弃的在途 promise 挂 `catch`（不得 unhandled rejection）；取消错误 `OperationCancelledError` 放 `src/core/io.ts`，核心与主进程经 `@core/io` 共用，`toReadableIoError` 保持只转换 `EMFILE` / `ENFILE`。
- **注册表必须按操作隔离且必回收**：`operationId` 只由 renderer 生成、只在平台层有意义，核心不感知；置标记 + `destroy` 同步完成，`digestFiles` 的 `finally` 删除注册项；取消后活动流计数必须归零，不留句柄（否则下一次对比 EMFILE）。未带 `operationId` 的既有调用行为完全不变。

## 最近交付证明

- WI：`wi_ws_90a06ca6d557d5cd`（扫描/哈希进度与可取消，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增取消用例）。
- 覆盖摘要：`src/core/io.ts` 新增 `OperationCancelledError`（`code: 'ECANCELED'`）、`isOperationCancelled`、`throwIfAborted`、`abortable`（abort 竞速 + 被放弃 promise 挂 `catch`，取消错误不经 `toReadableIoError` 改写）。主进程 `electron-platform.ts` 新增 `DigestOperation` 注册表（按 `operationId` 记在途流与取消标记）、导出 `cancelOperation` / `activeDigestStreamCount`、`DigestStreamFactory` 注入缝；`digestLocalFile` 登记/回收流并在取消时 `destroy`，`digestFiles` 在 `finally` 回收注册项、取消整批 reject 不返回部分槽位。`electron-platform.test.ts` 新增「digest cancellation」4 条（destroy 全部在途流并拒绝而非部分槽位、未知/重复 id 幂等且正常结束后回收、A/B 并行取消只影响 A、取消后无残留流并可重比同一真实目录对）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例；扫描/摘要进度语义归 `domains/directory`，`operationId` 契约与 Web 回退归 `domains/content-digest` / `domains/foundation`。

- WI：`wi_ws_deb41e1c6a5a2b8f`（目录条目批量 IPC 与 ≥16 路有界遍历，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿）。
- 覆盖摘要：本轮推翻并改写了本域旧口径「`scanDirectory` 一次只列一层、串行 walk」——遍历改为队列 + 批量取数 + 有界并发，新增独立导出 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`（`compare.ts`）与 `DEFAULT_STAT_CONCURRENCY = 16`（`electron-platform.ts`，整批目录共享一份 `stat` 预算，可注入 `statFile` / `statConcurrency` 观测），`DEFAULT_IO_CONCURRENCY = 8` 的含义与数值均未变、也未用于代偿遍历默认值。`compare.test.ts`「batched directory scan」覆盖默认在飞峰值 ≥ 16、显式 cap 4 后树/index/skipped 与默认一致、批量路径 EMFILE 整次 reject 且不计 `skipped`、缺槽位/根槽位失败不返回部分树；`electron-platform.test.ts`「batch directory listing」覆盖整批共享 stat 预算峰值 ≤ 常量、stat 耗尽整批 reject。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例；扫描语义归 `domains/directory`，平台能力缝归 `domains/foundation`。
- WI：`wi_intake_d4788e517adfaee2`（修复大目录对比的 EMFILE 文件句柄耗尽：有界并发 + 可读错误，`kind: fix`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；6 条门禁 attempt 001 全绿）。
- 覆盖摘要：新增 `src/core/io.ts`，导出 `DEFAULT_IO_CONCURRENCY = 8`、`ConcurrencyOptions`、`mapWithLimit`（保序、首错停止、不返回部分结果）、`FileHandleExhaustedError`（`code: 'EMFILE' | 'ENFILE'`，消息含「文件句柄」与原始错误码）与 `toReadableIoError`（仅转换 EMFILE/ENFILE，其余原样透传）。接入四处：`compareDirectories` 的内容读取与 `compareDirectorySides` 的内容读取改为 `mapWithLimit` 并新增可选 `options` 尾参；`electron-platform.listDirectory` 的逐条 `stat` 改经 `mapWithLimit`；`scanDirectory` 的单层 `list` 失败经 `toReadableIoError` 转换。新增 `src/core/io.test.ts`（默认窗口落在 8–16、5000 条目峰值 ≤ 8 且保序、显式上限 2、首错停止、EMFILE/ENFILE 转换与无关错误透传）；`compare.test.ts` / `snapshot.test.ts` 各补 3000 文件峰值、低上限一致性与 EMFILE 可读 reject；`electron-platform.test.ts` 补 300 条目与串行 stat 结果一致；`App.test.tsx` 补 EMFILE 走 `role="alert"` 提示且不生成会话。README 新增「已知问题」段写明 v0.2.1 及更早版本的 EMFILE 与本轮修复口径。
- 注：本 WI change pack 未提供 `tests/cases/**`、`tech.md`、`ux/**`，源码用例折叠改由本域 `qa/` 按 AC 逐条落档，全局 tech / design 折叠跳过。
