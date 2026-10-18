# 快照核心协议引擎与内置远端服务器快照样本

## 范围

在纯算法/协议层与内置样本层落地 `.ocsnap.json` 快照闭环的**底座**，不涉及任何界面改动：

1. **协议模型**：定义跨进程共享的快照 wire 模型与版本标识（`schema: "opencompare.snapshot/v1"`），根元数据（来源名称、导出时间），条目为根相对 POSIX 路径 + `size` + `modifiedMs` + `sha256` + 可选内联 `content`；目录不入条目列表。
2. **序列化 / 反序列化校验**（`@core/directory` 纯函数，零 Electron/DOM）：
   - 快照模型 → 可 `JSON.parse` 的规范文本；规范文本 → 模型，含结构校验（schema/版本、必填字段类型、路径合法性、重复路径、哈希格式、JSON 语法错误）。
   - 非法输入必须返回明确错误（可由调用方区分），不得静默产出半成品或空树。
3. **快照构建**：由已扫描的目录树（`ScannedTree`）加按需内容读取构建快照；`sha256` 复用现有 `src/core/directory/hash.ts` 的 `sha256Hex`，保证与现有目录对比引擎的摘要口径一致；支持「元数据 + 哈希」与「内联可下钻文本内容」两种粒度。
4. **快照参与对比**：把快照映射为现有对比引擎可接受的树形态，从而复用 `compareScannedTrees` / `compareDirectories` 的 `same / added / removed / modified` 语义与 `planContentReads` 的内容读取规划，支持：
   - 真实目录 vs 快照（任一侧）；
   - 快照 vs 快照。
   输出仍是标准 `DirectoryComparison`，可继续走现有过滤器与左右投影。
5. **快照内容读取**：提供统一的按快照路径读取内联内容的入口，供后续 UI 双击下钻使用；未内联内容的文件读取返回明确错误（区分「路径不存在」与「内容未内联」），不得返回空字符串冒充内容。
6. **内置远端服务器快照样本**（`@shared/fixtures`）：确定性、无网络、无真实 SSH 的远端服务器目录快照样本，同时以内联代码/CSV/YAML/JSON 多类型文件内容覆盖下钻场景；导出为可被反序列化校验接受的规范 `.ocsnap.json` 文本与类型化模型，供后续 UI 的「导入快照」与「目录 vs 远端快照」入口直接消费，并与内置本地目录样本（`DIRECTORY_SAMPLE_PATHS.left`）对比时产生覆盖四态的非平凡差异。
7. **单测**：上述协议往返、非法输入拒绝、构建口径、目录 vs 快照 / 快照 vs 快照差异、内容读取、内置样本有效性，全部以 Node 环境 vitest 覆盖。

## 验收

- ac-snapshot-roundtrip: 合法快照模型序列化后反序列化，schema/版本、根元数据与全部条目（路径、size、modifiedMs、sha256、内联 content）逐项不变。
- ac-snapshot-invalid-rejected: 非法 JSON、schema/版本不匹配、条目缺必填字段、路径非法或重复、哈希格式非法时，反序列化返回可识别的错误而不是半成品。
- ac-snapshot-build-hash: 从扫描树构建快照时，每个文件的 `sha256` 等于 `sha256Hex` 对同一文本的摘要；目录不产生条目；未选择内联的文件不携带 `content`。
- ac-compare-directory-vs-snapshot: 真实目录 vs 快照（左右任一方向）复用现有对比语义，得到正确的 `same / added / removed / modified` 分类与计数，包括「大小与 mtime 相同但内容不同 → modified」。
- ac-compare-snapshot-vs-snapshot: 两侧均为快照时同样产出完整 `DirectoryComparison`（含左右根名、逐节点状态与汇总计数），可直接被现有过滤/投影函数消费。
- ac-snapshot-content-read: 快照中内联的文件可通过统一入口读到原文；未内联或不存在时返回可区分的明确错误。
- ac-remote-fixture-valid: 内置远端服务器快照样本通过反序列化校验，包含代码、CSV、YAML、JSON 等多类型内联内容，哈希与内联文本自洽。
- ac-remote-fixture-four-statuses: 内置远端服务器快照样本与内置本地目录样本对比后，四态（same/added/removed/modified）均出现，且差异文件可下钻（内容可读）。
- ac-vitest-green: `pnpm test` 全绿，新增/扩展的单测在 Node 环境（无 Electron/DOM）下运行。

## 非目标

- 不做任何 renderer / UI 改动：导出按钮、文件保存对话框、左/右栏导入/挂载、拖拽导入、远端样本入口、状态标识等全部留给后续 WorkItem。
- 不改 `PlatformPort` 接口与 Electron/Web 双端实现；本项不读写真实磁盘。
- 不改现有目录对比、过滤、投影、同步、模板、代码/CSV/结构化对比的既有语义与既有样本答案键。
- 不做真实 SSH/SFTP、远端网络探测或远端增量同步。
- 不做二进制文件、图片等非文本内容内联；不做 base64 大文件内联、分块、压缩（gzip）或流式快照。
- 不做多哈希算法切换、签名、加密、权限或快照版本迁移。
- 不新增视觉 token 或样式；本项无用户可点交互面，不跑 UI 自测。

## 实现约束

- 遵循仓库分层：快照校验/构建/对比适配放 `src/core/directory/`（纯 TS，禁止 electron/react/DOM）；协议 wire 类型与版本常量放 `src/shared/`（跨进程共享），避免 `@shared/fixtures` 与 `@core/*` 形成循环依赖。
- 摘要唯一实现：复用 `src/core/directory/hash.ts` 的 `sha256Hex`，不引入 `node:crypto` 或 Web Crypto，保证 Node / 浏览器 / Electron renderer 一致。
- 快照协议固定标识 `schema: "opencompare.snapshot/v1"`；条目路径为根相对 POSIX 路径，不允许绝对路径、`..` 或空路径。
- 差异语义继续复用 `DiffStatus` 的 `same/added/removed/modified`，不新造状态；快照侧作为对比输入，不绕过现有 `ComparisonCache` / 内容读取规划。
- 内置样本必须确定性：不得使用 `Date.now()` 或随机值；`modifiedMs` 使用固定常量，且与本地样本对比时「内容相同」的文件保持 size/mtime 一致，避免元数据快路径误判。
- 样本内容需要能被现有 `classifyFile` 识别的扩展名下钻：至少覆盖 `.ts`/`.tsx`、`.csv`、`.json`、`.yaml`/`.yml`。
- 单测入口遵循既有 vitest 约定（`*.test.ts` 与被测模块同目录）；不新增测试框架依赖。
- 代码须通过 `pnpm lint` / `pnpm typecheck` / `pnpm test`；不降低既有测试覆盖。
