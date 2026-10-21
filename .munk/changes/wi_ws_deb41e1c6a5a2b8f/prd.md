# 目录条目批量 IPC 与 ≥16 路有界遍历

## 范围

本 Phase 只改「目录怎么取数」这一层，不改对比语义：

- `PlatformPort` 新增批量列目录能力（建议名 `listDirectories(paths, options?)`）：一次请求携带多个目录绝对路径，按输入顺序返回每个目录的槽位——成功槽位带该目录的 `DirectoryEntry[]`，失败槽位带可读原因。单目录 `listDirectory(path)` 保留不动。
- Electron 主进程实现批量列目录：对整批所有目录的所有条目使用**一份全局有界 `stat` 预算**（不是「每目录一份窗口」），把「批量目录数 × 每目录条目数」的双层扇出压成单一在飞上限；悬空符号链接 / 不可读条目仍按现有 `broken` + `skippedReason` 语义返回。
- Web 运行时提供同语义批量实现（内存 VFS 直接按目录切片），样本路径 `/samples/**` 经批量通道同样可列。
- 核心扫描 `scanDirectory` 从「逐层串行、一个目录一次取数」改为「队列 + 批量取数 + 有界并发」：一次批量往返覆盖当前队列中多个待列目录；遍历并发默认值 ≥ 16 且可配置。
- 树组装、`index` 相对路径、按名称 `localeCompare` 排序、四态配对、`skipped` 计数口径、不可列子树容错全部保持现值。

不在本 Phase：进度事件与进度 UI、取消、摘要实现、性能数字。

## 验收

- ac-batch-multi-dir-per-call: 对含 ≥ 8 个目录的临时 fixture 扫描，记录到的批量列目录调用中至少有一次携带 ≥ 2 个目录路径，且总批量调用次数严格小于被扫描目录数（证明一个往返覆盖多个目录）。
- ac-default-concurrency-16: 对含 ≥ 32 个可列目录的 fixture，用默认参数扫描：实测在飞批量请求峰值 ≥ 16，且 ≤ 遍历并发上限常量；该默认常量在单一来源导出且数值 ≥ 16。
- ac-concurrency-cap: 显式传入并发上限（如 4）扫描同一 fixture：实测在飞峰值 ≤ 4，产出的树、`index` 键集合、四态计数与 `skipped` 与默认并发下逐项相等。
- ac-global-stat-budget: 让一次批量请求带 M 个目录、每目录 K 个条目（M×K 远大于预算）经主进程批量列目录、`stat` 走可注入 worker：全程在飞 `stat` 峰值 ≤ 全局预算常量，且该常量 < M×K；预算常量单一来源导出，不随批量目录数放大。
- ac-batch-slot-shape: 一次 `listDirectories` 传 N 个路径，返回槽位数为 N、顺序与输入一致；成功槽位条目 `name`/`path`/`isDirectory`/`size`/`modifiedMs` 与对同目录调用 `listDirectory` 的结果逐项相等；其中一个路径不可列时整批仍 resolve，该槽位带可读失败原因，其余槽位正常。
- ac-parity-temp-fixture: 真实临时目录 fixture（多级嵌套、空目录、同名不同层文件、仅 mtime 不同、同 size 同 mtime 不同内容、悬空符号链接、不可读条目）上，批量/并发扫描得到的树（名称、层级、顺序、`size`、`modifiedMs`）、`index` 键集合、`skipped` 与同 fixture 的串行基线扫描逐项相等；`compareDirectories` 的四态计数与串行基线相等。
- ac-parity-samples: 内置样本 `/samples/directory/**` 目录对比经批量扫描后，树、四态计数与 `skipped` 与既有串行基线和现有测试断言一致（样本路径在批量通道可用）。
- ac-skipped-semantics: fixture 中悬空符号链接与不可读条目仍出现在返回条目里并各计 `skipped` 1 次；一个不可列子树只计 `skipped` 1 次且不出现在树中，扫描仍整体成功；fixture 中的 `.git`、`node_modules` 目录被正常列出并参与对比，不被静默跳过。
- ac-root-unreadable-rejects: 根目录自身不可列时 `scanDirectory` / `compareDirectories` 以错误 reject（消息含「无法读取目录」与路径），不返回空树。
- ac-fd-exhaustion-fatal: 批量列目录的 `stat` / `readdir` 抛 `EMFILE` 或 `ENFILE` 时，`compareDirectories` reject 可读中文错误（消息含「文件句柄」与原始错误码），该失败**不**被计入 `skipped`。
- ac-no-partial-tree: 扫描进行中遇到上述致死错误（或批量返回缺少被请求目录的槽位）时，调用方拿到的是 reject，`scanDirectory` 不返回任何部分 `ScannedTree`，`compareDirectories` 不返回 `DirectoryComparison`；`mapWithLimit` 的「首错停发、等在飞收敛、绝不返回部分结果」语义在批量扫描路径上成立。
- ac-seam-whitelist: 新批量通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该批量列目录能力；renderer 不直接 import `electron` / `node:fs`。
- ac-compat-existing-scan: 现有 `scanDirectory(rootPath, list)` 调用形态（`snapshot.ts` / `directoryOps.ts` / `loadSampleSessions.ts` 与既有测试）继续可用；未提供批量能力时扫描结果与批量路径一致。
- ac-no-regression: `pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件零回归；`readTextFile`、`writeTextFile`、`statPath` 等既有能力行为不变；`.ocsnap.json` 快照线格式不变。

## 非目标

- 不做进度上报、进度事件、进度条/状态栏 UI（后续 WI）。
- 不做取消：不引入取消信号、操作标识、在途流销毁或取消错误（后续 WI）。
- 不改摘要实现与 `digestFiles` 契约；不改 `DEFAULT_IO_CONCURRENCY` 的既有含义与数值口径（摘要默认窗口保持 8）。
- 不改四态语义、对比/合并算法、缓存键 `(path, size, modifiedMs)`、缓存失效语义。
- 不新增默认忽略规则（`.git` / `node_modules` / 隐藏文件一律照列）。
- 不弱化容错：不把不可读条目、悬空链接、不可列子树改成整次失败；也不把 EMFILE/ENFILE 吞成 `skipped`。
- 不删 `listDirectory` / `readTextFile`，不改快照、同步、模板、下钻入口。
- 不新增持久化缓存、不改发布模型、不跑浏览器/桌面实机验收、不拿小样本当性能结论。

## 实现约束

- 复用 `src/core/io.ts` 的 `mapWithLimit`（保序、首错停发、不返回部分结果）与 `toReadableIoError`；不引入 `p-limit` / `p-queue` 等新依赖。
- 遍历并发与 `stat` 预算是两个独立常量，各自单一来源导出并可在测试中传入覆盖值；遍历默认值必须 ≥ 16，不得通过抬高 `DEFAULT_IO_CONCURRENCY`（摘要/内容读取默认 8）来达成。
- 批量能力按新增能力 + 可选参数方式接入：既有 `scanDirectory(rootPath, list)` 签名与既有调用点不必改写；真实运行路径（`compareRoots` / 样本加载 / 快照目录侧）走批量能力。
- 每批目录数与并发上限的具体数值留待 Coding 定，但必须是导出常量且断言可观测；不在调用点重复硬编码数字。
- 排序、`skipped` 计数位置与失败容错分支沿用 `compare.ts` 现有实现口径，不重排索引结构。
- 主进程批量实现必须让样本路径（`/samples/**`）与真实路径共用同一通道；`broken` / `skippedReason` 字段与中文措辞沿用现有 `brokenReason` / `readableFailure`。
- 新通道登记进 `PLATFORM_CHANNELS`，preload 表面清单测试同步；`ac-*` 断言写进 `pnpm test`（code_gates 六条不变：install / lint / typecheck / build / build:web / test）。
