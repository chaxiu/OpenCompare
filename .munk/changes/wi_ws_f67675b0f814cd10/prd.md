# 主进程流式字节 SHA-256 与 Web 同构回退

## 范围

本 Phase 只做「摘要下沉」：把目录对比里的内容确认从「renderer 逐文件拉 UTF-8 正文再哈希」改成「一次批量请求让平台层对原始字节算 sha256」。

- `PlatformPort` 新增批量文件摘要能力（建议名 `digestFiles(paths, options?)`）：一次请求携带一批绝对路径，按输入顺序返回每个文件的结果；成功项带 64 位小写 hex 摘要与实际处理字节数，单个文件失败只标记该项失败（含可读原因），不因一个坏文件让整批失败。
- Electron 主进程实现：用 `node:crypto` 的 `createHash('sha256')` 对文件**原始字节**流式读取计算，绝不先 `readFile(path,'utf8')` 再哈希；一条文件读取流只持有一个句柄，按既有 `mapWithLimit` 有界并发跑完整批。
- Web 运行时实现：不碰 `node:crypto` / 异步 WebCrypto，用 `src/core/directory/hash.ts` 里已有的纯 JS SHA-256 核心，新增字节级入口（对 `Uint8Array` 直接算），对同一字节序列与主进程给出相同 hex。
- `src/core/directory/compare.ts` 的 `compareDirectories` 改为消费摘要：先按既有 size/mtime 快路径 + `(path, size, modifiedMs)` 缓存算出需要内容确认的路径，再交给摘要能力批量补齐；缓存键与命中语义不变。
- renderer 目录对比调用点（`directoryOps.compareRoots`、`loadSampleSessions` 的 directory 场景）改传摘要能力，不再为哈希调用 `readTextFile`；内置样本 `/samples/**` 同样通过摘要能力取值。
- 快照 ↔ 目录对比（`compareDirectorySides`）保持既有四态结果与内联文本摘要口径，真实文件一侧改走摘要能力（快照侧仍是文本摘要）。

不在本 Phase：批量列目录、遍历并发、进度事件、取消（后续 WI）；UI 改动；性能数字。

## 验收

- ac-digest-ascii-parity: 对同一 ASCII 字节序列（如 `abc`），核心纯 JS 字节摘要、Web 平台 `digestFiles` 与主进程 `node:crypto` 摘要返回同一 64 位小写 hex，且等于 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`。
- ac-digest-utf8-parity: 对含多字节字符（如 `中文🙂`、带 BOM 文本）的同一字节序列，主进程与 Web/纯 JS 字节摘要一致，且与既有 `sha256Hex(text)` 结果相同。
- ac-digest-invalid-utf8-parity: 对含非法 UTF-8 字节的同一序列（如 `61 ff fe 00 62`），主进程与纯 JS 字节摘要一致，且**不等于**把这些字节按 UTF-8 解码成 U+FFFD 后重新编码所得的摘要——证明哈希走的是原始字节而非解码后的字符串。
- ac-digest-empty-and-large: 空文件摘要等于 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；大于单个流式块（≥ 1 MiB + 7 字节，且块边界错位）的文件摘要等于对整份字节缓冲一次性哈希的结果。
- ac-digest-batch-shape: 一次 `digestFiles` 传入 N 个路径，返回元素个数为 N、顺序与输入一致；成功项 `sha256` 为 64 位小写 hex 且 `bytes` 等于文件真实字节数；同一批里同时含可读文件与不存在路径时，整批仍 resolve，坏路径只出现在失败项中并带可读原因。
- ac-digest-no-text-read: 对 size 与 mtime 完全相同、仅内容不同的文件对做目录对比，结果判 `modified`，且该次对比中 `readTextFile` 调用次数为 0（仅摘要能力被调用）。
- ac-digest-binary-modified: 两个真实临时文件 size 与 mtime 完全相同、仅非法 UTF-8 字节不同，目录对比判 `modified`（改造前会被 UTF-8 解码抹平而判 `same`）。
- ac-digest-sample-mount: `/samples/**` 路径在 Electron 与 Web 两种平台实现下都能被 `digestFiles` 摘要，结果等于 `sha256Hex(样本文本)`，样本目录对比四态计数与既有断言一致。
- ac-digest-cache-reuse: 同一 `ComparisonCache` 下二次对比同一对目录，摘要请求不再包含 size/mtime 未变的已缓存路径（第二次摘要路径集合为空），四态结果与首次一致。
- ac-digest-unreadable-tolerant: 摘要能力对单个不可读文件回报失败项（不 reject 整批），目录对比据此把该对判 `modified` 并计入 `skipped`，不中断整次对比。
- ac-digest-emfile-fatal: 摘要读取遇到 `EMFILE` / `ENFILE` 时，整次对比以既有可读中文错误（含错误码）结束，不被当作逐文件失败吞掉。
- ac-digest-seam-whitelist: 新 IPC 通道名只出现在 `PLATFORM_CHANNELS` 单一来源，preload 仅白名单转发；`PlatformPort` 表面新增且仅新增该摘要能力，renderer 不直接 import `electron` / `node:crypto`。
- ac-digest-no-regression: `pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件与四态计数零回归；`.ocsnap.json` 的字段、序列化顺序与快照 sha256 口径不变（仍是文本 UTF-8 摘要）。

## 非目标

- 不做批量/分页列目录、遍历并发改造、`stat` 预算（后续 WI）。
- 不做进度上报、进度 UI、取消按钮与取消错误（后续 WI）。
- 不改四态语义、对比/合并算法、缓存键、缓存失效钩子语义。
- 不改 `.ocsnap.json` 快照线格式、导入校验、内联文本策略；快照构建/导出的哈希口径保持文本摘要。
- 不新增持久化哈希缓存、不改发布模型。
- 不删除 `readTextFile` 能力：下钻查看正文、同步写入、快照、模板仍继续使用。
- 不跑浏览器/桌面实机验收，不用内置样本或小目录充当性能结论。

## 实现约束

- 复用既有 SHA-256 实现：在 `src/core/directory/hash.ts` 新增字节级入口，`sha256Hex(text)` 保持签名与输出不变（内部可复用字节入口），不引入新依赖、不新建并行哈希模块。
- 主进程必须流式：`createReadStream` + `createHash('sha256')`（或等价定长 buffer 循环读取），禁止把整份文件读成字符串；批内并发统一走 `src/core/io.ts` 的 `mapWithLimit`，默认沿用 `DEFAULT_IO_CONCURRENCY`，批大小与并发值可在本 Phase 定为常量，但不得改变遍历并发（属后续 WI）。
- Web 回退不得使用 `node:crypto` 或异步 WebCrypto；纯 JS 字节摘要必须能在 vitest `node` 环境直接单测（`src/core` 无 Electron/DOM 依赖红线不变）。
- 平台缝扩展以新增能力 + 可选参数方式接入：`compareDirectories` / `compareDirectorySides` 的既有调用与既有测试签名保持可用，未提供摘要能力时回退到既有文本读取路径；renderer 真实运行路径必须传摘要能力。
- 缓存写入时机与键保持 `(path, size, modifiedMs)`；命中即不再请求摘要。失败项不写缓存。
- 新通道必须在 `PLATFORM_CHANNELS` 中登记；preload 测试的表面清单同步更新；`ac-*` 断言写进 `pnpm test`（code_gates 六条不变：install / lint / typecheck / build / build:web / test）。
