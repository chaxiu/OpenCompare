# 修复大目录对比的 EMFILE 文件句柄耗尽（有界并发 + 可读错误）

## 范围

- 为目录对比 / 快照内容读取 / 目录遍历引入统一的有界并发限流：默认上限取 8–16 之间的常量，并预留可选参数覆盖（测试用低上限验证）。
- 覆盖以下现存无上界并发点：
  - `src/core/directory/compare.ts` `compareDirectories` 的全量 `readTextFile`；
  - `src/core/directory/snapshot.ts` `compareDirectorySides` 的全量内容读取（含快照内联内容分支）；
  - `src/main/platform/electron-platform.ts` `listDirectory` 对每个目录条目的 `stat` 并发；
  - 递进式目录遍历（`scanDirectory` 逐层）在限流器下不得叠出无上界在飞 IO。
- 识别 `EMFILE` / `ENFILE` 等 fd 耗尽错误，在核心层转换为可读中文错误（含「文件句柄」与可操作建议），错误经既有 workbench `notice` 就地提示，不静默吞、不崩窗口。
- 补单测：注入可控 `readTextFile` 统计在飞峰值，断言峰值 ≤ 上限，覆盖数千文件规模；覆盖 EMFILE → 可读错误的失败路径；既有对比语义与缓存行为不回归。
- README 增补「已知问题」段：写明 v0.2.1 及更早版本拖入大目录可能触发 EMFILE，当前版本已修复（有界并发读取 + 可读提示）。

## 验收

- ac-bounded-content-read: 对含 3000 个需读内容的文件对注入 `readTextFile`（记录进入/退出并统计在飞峰值），`compareDirectories` 完成且 `peak ≤ 配置上限`；同一输入在限流开关前后 `counts` 与分类结果完全一致。
- ac-bounded-snapshot-read: `compareDirectorySides` 在 3000 文件规模下同样完成且 `peak ≤ 配置上限`，快照挂载内容与真实目录内容的分类结果不变。
- ac-limit-configurable: 默认上限常量落在 8–16（含端点），显式传入更低上限（如 2）时实测峰值 ≤ 2，且结果与默认上限时一致。
- ac-bounded-traversal: 目录遍历/条目 stat 的并发映射对 5000 个条目在飞峰值 ≤ 上限；`listDirectory` 经该限流器后返回条目数、`isDirectory`/`size`/`modifiedMs` 字段与逐条串行结果一致。
- ac-emfile-readable: 注入的 `readTextFile` 以 `code: 'EMFILE'` reject 时，`compareDirectories` 与 `compareDirectorySides` 均以 `Error` reject，消息包含「文件句柄」且保留原始错误码线索（EMFILE），不返回部分结果、不静默吞。
- ac-emfile-not-crash: 上述失败路径下错误向上传播到调用方（workbench 既有 `report` / `onError` 分支），不抛出未捕获异常、不生成空目录会话。
- ac-existing-semantics: 既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` 用例全部通过；相同大小不同内容仍判 `modified`、缓存命中不重复读取等原有语义不变。
- ac-readme-known-issue: README 存在「已知问题」段，明确写出 v0.2.1 及更早版本拖入大目录可能触发 `EMFILE`，并写明当前版本已修复（有界并发读取 + 可读错误提示）。

## 非目标

- 不改打包 / 发布 workflow，不动 GitHub Actions、不发版、不重指 tag。
- 不动内置样本库（`src/shared/fixtures/`、`/samples` 挂载）与示例数据。
- 不做实机验收、不做 self_test、不做桌面点选验收。
- 不改 `PlatformPort` 契约签名、不改 IPC channel 与 preload 白名单。
- 不改目录对比语义、过滤、下钻、同步 / 模板逻辑与 UI 布局；不顺带做「体验优化」类改动。
- 不引入新的第三方并发库或运行时依赖。

## 实现约束

- 用户已指定做法：有界并发默认 8–16（常量或可选参数配置），作用于 `compareDirectories`、快照内容读取与目录遍历；沿用现有模块边界，不新造抽象层。
- 限流实现应为一个可复用的小工具（核心层，零 Electron/DOM 依赖），供核心与主进程共用；保持结果顺序稳定。
- EMFILE/ENFILE 的可读错误转换放在核心层边界，保证浏览器内存实现与 Electron 实现同口径；不改平台层抛错结构。
- README「已知问题」与修复交付使用同一行口径，写事实不写空话。
- 交付前 `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`（含 build:web）全绿。
