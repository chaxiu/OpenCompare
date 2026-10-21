# 扫描/哈希进度与可取消

## 范围

本 Phase 只做「目录对比跑起来看得见、停得下」，不改对比语义，也不做虚拟化：

- **核心层进度**：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 增加可选进度回调，每结算一个真实批次（批量列目录或摘要分块）最多回报一次 `{ phase: 'scan' | 'digest', files, bytes }`：扫描阶段统计两侧已发现（非 `broken`）文件数与其 `size` 之和；摘要阶段统计本阶段已结算文件数（含逐文件失败项）与成功项 `bytes` 之和。计数按阶段累计、单调不减，不做定时器插值。
- **摘要分块**：`digestContentCandidates` 不再把全部待确认路径压成一次调用，改按导出常量 `DEFAULT_DIGEST_BATCH_SIZE` 分块顺序调用 `digestFiles`，使摘要阶段能按真实分块结算上报进度；单块内仍由平台层有界并发。
- **核心层取消**：`ComparisonIoOptions` / `ScanDirectoryOptions` 增加可选 `signal`（`AbortSignal`）；扫描与摘要每个批次边界检查，abort 后不再发起新批次；正在等待的批次通过 abort 竞速立即以取消错误 reject，即使平台调用永不 resolve 也不得挂住。
- **取消错误**：新增独立错误 `OperationCancelledError`（`name`、`code: 'ECANCELED'`、中文消息含「已取消」）。取消是独立失败路径，不是 `skipped`：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 取消即 reject，绝不返回部分树、部分对比结果或空树。
- **主进程在途流可中断**：`DigestFilesOptions` 增加可选 `operationId`；主进程按 `operationId` 登记该次摘要的全部在途读取流，新 IPC 能力 `cancelOperation(operationId)` 到达后销毁这些流、阻止未启动的文件继续开流，`digestFiles` 以取消错误整批 reject 而不是返回部分槽位。操作结束（成功 / 失败 / 取消）后注册项必须回收。
- **平台缝两套实现**：Electron 走上述注册表；Web 实现提供同签名 `cancelOperation`（幂等），并在操作已取消时让 `digestFiles` 以取消错误 reject，未取消时行为不变。
- **renderer 编排**：工作台发起的目录对比（空态「打开文件夹」、新建对比对话框、目录视图选择左右目录、启动注入请求）每次生成一个 `operationId` 与 `AbortController`，把 `signal` 传给核心、把 `operationId` 透传给 `platform.digestFiles`；取消动作先 `abort()` 再 `cancelOperation(operationId)`（失败不阻塞 UI）。
- **进度 UI**：目录对比进行中，工作台壳层显示常驻进度条（`role="status"`），文本含阶段名、「已扫描 N 个文件」与已处理字节数（复用 `formatBytes`），并提供「取消」按钮；空态与已有会话两种情形都可见。取消后进度条消失、`directoryBusy` 复位，走既有 `notice`（`noticeTone: 'info'`）提示含「已取消」；既有会话、活动标签、状态栏统计与当前视图在取消前后逐项不变（只有成功对比才 `upsertSession`）。

已落地的前序能力（批量列目录 + 有界遍历、主进程流式字节摘要）作为本项基础复用，不重做。

## 验收

- ac-progress-scan-monotonic: 真实临时小目录 fixture（多级嵌套、≥ 3 个待列批次、两侧文件数 ≥ 10）上 `compareDirectories` 带 `onProgress`：收到 ≥ 2 条 `phase === 'scan'` 事件，其 `files` 与 `bytes` 序列各自单调不减；最后一条 scan 事件的 `files` 等于两侧文件总数，`bytes` 等于两侧文件 `size` 之和。
- ac-progress-digest-chunks: fixture 中放 N 个 size 与 mtime 相同、内容不同的文件（N 可被 `digestBatchSize` 覆盖值整除且 ≥ 2 块），`compareDirectories` 传 `{ digestBatchSize: 2, onProgress }`：收到与块数相等的 `phase === 'digest'` 事件，其 `files` 递增到 N、`bytes` 最终等于这些文件真实字节数之和，且每个事件在对应分块 settle 之后才出现。
- ac-progress-no-timer: 用可手动 resolve 的假 `digestFiles`（首个分块挂起）：挂起期间 `phase === 'digest'` 事件数为 0；resolve 该分块后事件数恰好 +1 且数值等于该块结果；整个对比结束后事件数不再增长（不存在定时器驱动的虚构进度）。
- ac-progress-ui-live: renderer 组件测试中发起目录对比并让平台摘要挂起：界面出现 `role="status"` 的进度条，文本含「已扫描」与文件数、「已处理」与字节数以及一个可访问名为「取消」的按钮；推进一个扫描批次后文本中的已扫描文件数变大；对比成功后进度条消失。
- ac-cancel-error-type: 摘要阶段 abort 后 `compareDirectories` 与 `compareDirectorySides` 均以 `OperationCancelledError` reject（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`、消息含「已取消」），且错误不被转成 `FileHandleExhaustedError`、不计入 `skipped`、不返回任何 `DirectoryComparison`。
- ac-cancel-during-scan: 用永不 resolve 的假 `listDirectories` 挂住扫描中批次后 abort：`scanDirectory` / `compareDirectories` 在 1 秒内以取消错误 reject；abort 之后 `listDirectories` 调用次数不再增加（不再发起新批次）。
- ac-cancel-during-digest: 用永不 resolve 的假 `digestFiles` 挂住摘要分块后 abort：`compareDirectories` 在 1 秒内以取消错误 reject，abort 后 `digestFiles` 调用次数不再增加，后续分块一个都不发出。
- ac-cancel-main-streams-zero: 主进程 `digestFiles(paths, { operationId })` 正在流式读取（经可注入流工厂挂住）时调用 `cancelOperation(operationId)`：该次 `digestFiles` 以取消错误 reject、不返回部分槽位；reject 时（最迟 100ms 内）导出/可观测的活动读取流计数归零，每个注入流都收到 `destroy`。
- ac-cancel-registry-idempotent: `cancelOperation` 对未知 `operationId` 与同一 id 的重复调用均 resolve 不抛；一次正常结束的 `digestFiles` 之后其注册项已回收（同 id 的 `cancelOperation` 不再影响其他并发操作）。
- ac-cancel-operation-scoped: 同一平台实例上并发两个摘要操作 A 与 B（不同 `operationId`，均挂住）：取消 A 只让 A 以取消错误 reject，B 随后正常 resolve 且槽位内容正确；B 的活动流计数在 A 取消后仍 > 0。
- ac-cancel-no-partial-cache: 分块为 2 且第 2 块被取消的对比结束后，返回的 `ComparisonCache.hashes` 只含第 1 块已成功结算文件的条目，被中断块的路径没有任何写入；随后用同一缓存重新对比同一对目录成功，四态计数与未取消基线逐项相等。
- ac-cancel-then-recompare: 取消一次真实临时小目录对比后，用同一平台实例、新 `operationId` 重新对比同一对目录成功完成，四态计数、`skipped` 与未取消基线逐项相等，主进程活动读取流为 0（无句柄残留、无 EMFILE）。
- ac-cancel-keeps-ui-state: renderer 组件测试中已有目录会话 A 在屏时发起 B 的目录对比并点击「取消」：`cancelOperation` 收到与 `digestFiles` 相同的 `operationId`；取消后会话列表与顺序、`activeId`、状态栏统计、当前目录视图内容与取消前逐项一致，不新增标签，`notice` 文本含「已取消」且 tone 为 info，`busy` 复位、进度条消失，同一对目录随后可再次发起对比。
- ac-progress-cancel-idle: 没有目录对比在跑时（空闲、文件对打开、同步 / 模板预览与确认）不渲染进度条与取消按钮；取消完成后再次空闲同样无残留。
- ac-web-parity: Web 平台的 `cancelOperation` 幂等（未知 id、重复调用均 resolve），`digestFiles` 在操作已取消时以取消错误 reject，未取消时返回值与既有断言一致；两种平台的取消错误形态相同。
- ac-seam-whitelist: 新通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增 `cancelOperation`，`DigestFilesOptions` 只新增可选 `operationId`；renderer 不直接 import `electron` / `node:fs` / `node:crypto`。
- ac-no-regression: `pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / `web-platform` / renderer 套件与四态计数零回归；缓存命中不重复哈希的既有断言保留（全缓存二次对比时 `digestFiles` 调用 0 次、不产生 `files > 0` 的 digest 进度事件）；`.ocsnap.json` 快照线格式不变。

## 非目标

- 不改四态语义、对比 / 合并算法、行级 diff、3-way merge、CSV 主键、结构化对比。
- 不改快照线格式（`.ocsnap.json`）、导入校验、内联文本策略；不给快照导出 / 同步 / 模板 / 下钻加进度或取消（沿用既有 busy 与提示）。
- 不做结果树虚拟化 / 窗口化渲染，不搬 `ScannedTree` / `DirectoryComparison` 到主进程或 worker（另一 WI）。
- 不做跨进程进度推送通道（main → renderer 事件流）；进度只由核心批次结算结果在 renderer 侧汇总，不新增 `webContents.send` 类进度事件。
- 不做暂停 / 恢复 / 断点续传，不做取消确认对话框，不做取消后自动重试；取消就是一次性终止。
- 不改摘要算法、缓存键 `(path, size, modifiedMs)`、缓存失效语义；不新增持久化缓存。
- 不新增默认忽略规则（`.git` / `node_modules` 照列），不把不可读项 / 悬空链接 / 不可列子树改成整次失败，也不把 `EMFILE` / `ENFILE` 吞成 `skipped`。
- 不改发布模型、不动 CI、不跑浏览器 / 桌面实机验收、不做 self_test；不拿内置样本或缩小目录充当性能数字。
- 不免除 `listDirectories` / `readTextFile` 等既有能力，不删下钻、同步、模板、快照入口。

## 实现约束

- 复用 `src/core/io.ts`：取消错误 `OperationCancelledError` 放这里（核心与主进程经 `@core/io` 共用），`toReadableIoError` 保持只转换 `EMFILE` / `ENFILE`、取消错误原样透传；不引入新依赖（不加 p-limit / p-queue / AbortController 兼容库）。
- 进度与取消都是可选尾参，既有调用签名与既有测试继续可用；不改变 `scanDirectory(rootPath, list)` 与 `compareDirectories(...)` 现有位置参数语义。
- 批次挂起必须用 abort 竞速（`Promise.race` 或等价）而不是「等 in-flight 收敛」；这样取消的停止时间上界与平台调用是否响应无关。被放弃的在途 promise 必须挂 `catch` 处理，不得产生 unhandled rejection。
- 摘要分块大小单一来源导出（`DEFAULT_DIGEST_BATCH_SIZE`），可在测试经 `digestBatchSize` 覆盖；每结算一块才写该块成功项的 `cache.hashes`，取消时不写未结算块。
- `operationId` 由 renderer 生成（每次目录对比唯一，如递增序号 + 随机后缀），只在平台层有意义；核心不感知该标识，只透传 `signal`。取消时先 `abort()` 再调用 `cancelOperation`，后者失败只忽略、不改变 UI 结局。
- 主进程注册表：按 `operationId` 记录在途 `ReadStream` 与「已取消」标记；`cancelOperation` 同步置标记并 `destroy` 每条流（带取消错误或等价终止），`digestFiles` 在 finally 中删除注册项；未带 `operationId` 的既有调用行为完全不变。
- 主进程可测试注入沿用现有风格（参考 `listDirectories` 的 `statFile`）：本地摘要选项允许注入流工厂，并导出可断言的活动流计数；生产默认 `createReadStream`，批内并发继续走 `mapWithLimit` + `DEFAULT_IO_CONCURRENCY`。
- 进度语义：`files` / `bytes` 为**各阶段内**累计值（digest 阶段从 0 开始），不做跨阶段相加；每结算一个批量 / 分块最多回报一次，禁止按文件逐条刷屏，禁止定时器与预估插值。
- UI 复用现有 token 与基础组件（`formatBytes`、`ToolbarButton`、状态栏 / `notice` 既有通道），进度条放工作台壳层以便空态可见；不新建页面、不改既有布局层级，不使用硬编码颜色，取消按钮在点击后到对比 settle 前禁用，避免重复取消。
- 新通道在 `PLATFORM_CHANNELS` 登记，preload 表面清单与既有白名单测试同步更新；`renderer` 只经 `PlatformPort` 触达取消与摘要。
- `ac-*` 断言全部写进 `pnpm test`（vitest，node + jsdom）；code_gates 六条不变：install / lint / typecheck / build / build:web / test。
