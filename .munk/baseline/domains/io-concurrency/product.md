# Domain: io-concurrency

IO 并发治理域：跨 `directory` / `snapshot` / `foundation`（Electron 主进程平台层）三域共用的**文件 IO 有界并发契约**与**文件句柄耗尽（EMFILE / ENFILE）的可读错误边界**。本域只承载「一次 fan-out 能同时开多少个句柄、句柄耗尽时用户看到什么」这一横切契约，不重造目录对比语义、快照协议或平台能力本身；那些仍归各自域。核心实现是一个零 Electron / DOM 依赖的小工具 `src/core/io.ts`，由核心比对引擎与主进程平台层共用。

## 范围

- **有界并发工具（`src/core/io.ts`，纯核心层）**：导出 `DEFAULT_IO_CONCURRENCY`（默认在飞窗口，取 8–16 之间的常量，当前为 8）、`ConcurrencyOptions`（`concurrency?`，低于 1 或非有限值回退默认）、`mapWithLimit(items, options, worker)`。语义：最多 N 个 `worker` 同时在飞、**结果顺序与输入顺序一致**、首个失败后不再启动新任务、等在飞任务收敛后以该错误 reject（**绝不返回部分结果**）。
- **接入点一：目录内容读取（`src/core/directory/compare.ts`）**：`compareDirectories` 的 `planContentReads` 全量 `readTextFile` 从 `Promise.all` 改为 `mapWithLimit`，新增可选 `options: ConcurrencyOptions` 尾参（测试可传 `{ concurrency: 2 }`）。
- **接入点二：快照内容读取（`src/core/directory/snapshot.ts`）**：`compareDirectorySides` 的内容读取（目录侧走 `readTextFile`、快照侧走内联 `readSnapshotContent`）同样经 `mapWithLimit`，并透传 `options`；快照内联内容分支不额外产生文件句柄。
- **接入点三：目录条目元数据（`src/main/platform/electron-platform.ts`）**：`listDirectory` 对 `readdir` 结果的逐条 `stat` 由无上界 `Promise.all` 改为 `mapWithLimit(entries, {}, …)`，返回顺序与字段（`name` / `path` / `isDirectory` / `size` / `modifiedMs`）与逐条串行结果一致。
- **接入点四：递进式目录遍历（`scanDirectory`）**：保持「一次只列一层」的串行 walk，单层内部不叠加无上界在飞 IO；`list` 调用失败经 `toReadableIoError` 转换后抛出。
- **可读句柄错误（`FileHandleExhaustedError` / `toReadableIoError`）**：识别 `EMFILE` / `ENFILE`，在核心层边界转换为中文错误，消息包含「文件句柄」并保留原始错误码线索（EMFILE / ENFILE）；其他错误原样透传，不改平台层既有抛错结构。UI 侧复用工作台既有 `notice` / `report` 就地提示，不静默吞、不崩窗口、不生成空目录会话。
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

## 非目标

- 不改打包 / 发布 workflow，不动 GitHub Actions、不发版、不重指 tag。
- 不动内置样本库（`src/shared/fixtures/`、`/samples` 挂载）与示例数据。
- 不做实机验收、不做 self_test、不做桌面点选验收。
- 不改 `PlatformPort` 契约签名、不改 IPC channel 与 preload 白名单。
- 不改目录对比语义、过滤、下钻、同步 / 模板逻辑与 UI 布局；不顺带做「体验优化」类改动。
- 不引入新的第三方并发库或运行时依赖（不引 p-limit / p-queue 之类）。

## 实现约束

- 用户已指定做法：有界并发默认 8–16（常量或可选参数配置），作用于 `compareDirectories`、快照内容读取与目录遍历；沿用现有模块边界，不新造抽象层。
- 限流工具必须放核心层（`src/core/io.ts`，零 Electron / DOM 依赖），供核心与主进程共用；主进程经 `@core/io` 别名引用，renderer 不参与。
- 保持结果顺序稳定：`mapWithLimit` 按输入下标写回结果数组，调用方（`new Map(entries)`）不感知并发窗口。
- EMFILE / ENFILE 的可读错误转换放在核心层边界（`compareDirectories` / `compareDirectorySides` / `scanDirectory` 的 `list` 调用），保证浏览器内存实现与 Electron 实现同口径；不改平台层抛错结构。
- 默认值和上限只存在一处（`DEFAULT_IO_CONCURRENCY`），不得在调用点重复硬编码数字。
- README「已知问题」与修复交付使用同一行口径，写事实不写空话。
- 交付前 `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`（含 build:web）全绿。

## 最近交付证明

- WI：`wi_intake_d4788e517adfaee2`（修复大目录对比的 EMFILE 文件句柄耗尽：有界并发 + 可读错误，`kind: fix`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；6 条门禁 attempt 001 全绿）。
- 覆盖摘要：新增 `src/core/io.ts`，导出 `DEFAULT_IO_CONCURRENCY = 8`、`ConcurrencyOptions`、`mapWithLimit`（保序、首错停止、不返回部分结果）、`FileHandleExhaustedError`（`code: 'EMFILE' | 'ENFILE'`，消息含「文件句柄」与原始错误码）与 `toReadableIoError`（仅转换 EMFILE/ENFILE，其余原样透传）。接入四处：`compareDirectories` 的内容读取与 `compareDirectorySides` 的内容读取改为 `mapWithLimit` 并新增可选 `options` 尾参；`electron-platform.listDirectory` 的逐条 `stat` 改经 `mapWithLimit`；`scanDirectory` 的单层 `list` 失败经 `toReadableIoError` 转换。新增 `src/core/io.test.ts`（默认窗口落在 8–16、5000 条目峰值 ≤ 8 且保序、显式上限 2、首错停止、EMFILE/ENFILE 转换与无关错误透传）；`compare.test.ts` / `snapshot.test.ts` 各补 3000 文件峰值、低上限一致性与 EMFILE 可读 reject；`electron-platform.test.ts` 补 300 条目与串行 stat 结果一致；`App.test.tsx` 补 EMFILE 走 `role="alert"` 提示且不生成会话。README 新增「已知问题」段写明 v0.2.1 及更早版本的 EMFILE 与本轮修复口径。
- 注：本 WI change pack 未提供 `tests/cases/**`、`tech.md`、`ux/**`，源码用例折叠改由本域 `qa/` 按 AC 逐条落档，全局 tech / design 折叠跳过。
