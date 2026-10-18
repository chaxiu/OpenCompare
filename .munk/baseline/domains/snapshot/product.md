# Domain: snapshot

快照域：OpenCompare 本地对比快照协议（`.ocsnap.json`）的**协议底座**——跨进程共享的 wire 模型与版本标识、序列化 / 反序列化结构校验、由扫描树构建快照、快照参与目录对比的适配层、按快照路径读取内联内容，以及 `@shared/fixtures` 内置的确定性远端服务器快照样本。本域只做纯算法与内置样本（`src/core/directory/` + `src/shared/`），**无任何界面改动**；把快照挂到左/右栏、导出/保存对话框、拖拽导入等交互面属于后续 WorkItem（依赖 `wi_ws_1c48f73551810bc2`）。对比语义复用目录域既有引擎（`same` / `added` / `removed` / `modified`），本域不重造差异算法，也不做真实 SSH/SFTP 或网络探测。

## 范围

- **协议 wire 模型与版本标识（`src/shared/snapshot.ts`）**：固定 `schema: "opencompare.snapshot/v1"`；根元数据为来源名称 `name` 与导出时间 `exportedAt`（ISO-8601）；条目为**根相对 POSIX 路径** + `size`（字节）+ `modifiedMs`（epoch ms）+ `sha256`（小写 hex）+ **可选**内联 `content`。目录不进入条目列表，由文件路径隐式表达。
- **序列化 / 反序列化校验（`@core/directory/snapshot.ts` 纯函数，零 Electron/DOM）**：模型 → 可 `JSON.parse` 的规范文本（条目按路径排序、两空格缩进、结尾换行）；规范文本 → 模型。校验覆盖 schema/版本、根元数据必填与类型、条目必填字段类型、路径合法性（非空、根相对、无 `..` / `.` / 空段、不得落在另一个文件条目之下）、重复路径、哈希格式（64 位小写 hex）、JSON 语法错误。非法输入抛 `SnapshotFormatError`，带可分支的 `code`（`invalid-json` / `invalid-schema` / `invalid-metadata` / `invalid-entry` / `invalid-path` / `duplicate-path` / `invalid-hash`）与可选 `path`，**绝不静默产出半成品或空树**。
- **快照构建（`buildSnapshot`）**：由已扫描目录树（`ScannedTree`）+ 注入的 `readTextFile` 构建；`sha256` 一律走 `src/core/directory/hash.ts` 的 `sha256Hex`，与现有目录对比引擎摘要口径一致；`inlineContent` 谓词决定哪些文件携带内联 `content`（默认全部内联），即「元数据 + 哈希」与「可下钻内联文本」两种粒度；`exportedAt` 由调用方传入，保持可测试确定性。
- **快照参与对比（`snapshotToScannedTree` / `compareDirectorySides`）**：把快照映射为对比引擎可接受的 `ScannedTree`，挂载到默认虚拟根 `/snapshots/<left|right>/<name>`（`SNAPSHOT_MOUNT_ROOT`，可覆写），从而复用 `compareScannedTrees` / `planContentReads` 的 `same` / `added` / `removed` / `modified` 语义、`ComparisonCache` 与内容读取规划。`ComparisonSide` 支持 `directory` 与 `snapshot` 两类输入，因此覆盖「真实目录 vs 快照（任一侧）」与「快照 vs 快照」；输出仍是标准 `DirectoryComparison`，可继续走既有过滤器与左右投影。内容读取按需：快照侧取内联 `content`，目录侧走 `readTextFile`。
- **快照内容读取（`readSnapshotContent`）**：按根相对快照路径读取内联正文，供后续 UI 双击下钻；文件不存在抛 `not-found`，存在但未内联抛 `content-not-inlined`（`SnapshotContentError.code` 可区分），**不以空字符串冒充内容**。
- **内置远端服务器快照样本（`src/shared/fixtures/remote-snapshot.ts`，经 `index.ts` 导出 `REMOTE_SNAPSHOT`）**：虚构 `remote-prod` 服务器的确定性样本（无 `Date.now()`、无随机、无网络、无真实 SSH），同时导出类型化模型 `snapshot` 与规范 `.ocsnap.json` 文本 `text`（可被 `parseSnapshot` 接受）；14 个文件以内联内容覆盖 `.ts`/`.tsx`、`.csv`、`.json`、`.yaml`/`.yml` 等下钻场景；与本地样本内容相同的文件保持 `size`/`modifiedMs` 一致（样本挂载 `modifiedMs: 0`），`src/core/lexer.ts` 故意保持本地 size/mtime 但改变正文以走 SHA-256 确认路径。
- **单测**：协议往返、非法输入拒绝、构建口径、目录 vs 快照 / 快照 vs 快照差异、内容读取、内置样本有效性，全部在 Node 环境 vitest 覆盖（`src/core/directory/snapshot.test.ts`、`src/shared/fixtures/remote-snapshot.test.ts`）。

## 验收

- **ac-snapshot-roundtrip**：合法快照模型序列化后反序列化，schema/版本、根元数据与全部条目（路径、size、modifiedMs、sha256、内联 content）逐项不变。
- **ac-snapshot-invalid-rejected**：非法 JSON、schema/版本不匹配、条目缺必填字段、路径非法或重复、哈希格式非法时，反序列化返回可识别的错误而不是半成品。
- **ac-snapshot-build-hash**：从扫描树构建快照时，每个文件的 `sha256` 等于 `sha256Hex` 对同一文本的摘要；目录不产生条目；未选择内联的文件不携带 `content`。
- **ac-compare-directory-vs-snapshot**：真实目录 vs 快照（左右任一方向）复用现有对比语义，得到正确的 `same` / `added` / `removed` / `modified` 分类与计数，包括「大小与 mtime 相同但内容不同 → modified」。
- **ac-compare-snapshot-vs-snapshot**：两侧均为快照时同样产出完整 `DirectoryComparison`（含左右根名、逐节点状态与汇总计数），可直接被现有过滤/投影函数消费。
- **ac-snapshot-content-read**：快照中内联的文件可通过统一入口读到原文；未内联或不存在时返回可区分的明确错误。
- **ac-remote-fixture-valid**：内置远端服务器快照样本通过反序列化校验，包含代码、CSV、YAML、JSON 等多类型内联内容，哈希与内联文本自洽。
- **ac-remote-fixture-four-statuses**：内置远端服务器快照样本与内置本地目录样本对比后，四态（same/added/removed/modified）均出现，且差异文件可下钻（内容可读）。
- **ac-vitest-green**：`pnpm test` 全绿，新增/扩展的单测在 Node 环境（无 Electron/DOM）下运行。

## 非目标

- **不做任何 renderer / UI 改动**：导出按钮、文件保存对话框、左/右栏导入/挂载、拖拽导入、远端样本入口、状态标识等全部留给后续 WorkItem。
- **不改 `PlatformPort` 接口与 Electron/Web 双端实现**；本域不读写真实磁盘。
- **不改现有目录对比、过滤、投影、同步、模板、代码/CSV/结构化对比的既有语义与既有样本答案键**。
- **不做真实 SSH/SFTP、远端网络探测或远端增量同步**。
- **不做二进制 / 图片等非文本内容内联**；不做 base64 大文件内联、分块、压缩（gzip）或流式快照。
- **不做多哈希算法切换、签名、加密、权限或快照版本迁移**。
- 不新增视觉 token 或样式；本域无用户可点交互面，不跑 UI 自测。

## 实现约束

- **分层**：快照校验/构建/对比适配放 `src/core/directory/`（纯 TS，禁止 electron/react/DOM）；协议 wire 类型与版本常量放 `src/shared/`（跨进程共享），避免 `@shared/fixtures` 与 `@core/*` 形成循环依赖（样本从 `@core/directory/snapshot` 与 `@shared/snapshot` 取值，`@core` 不反向依赖 `@shared/fixtures`）。
- **摘要唯一实现**：复用 `src/core/directory/hash.ts` 的 `sha256Hex`，不引入 `node:crypto` 或 Web Crypto，保证 Node / 浏览器 / Electron renderer 一致。
- **协议固定标识** `schema: "opencompare.snapshot/v1"`；条目路径为根相对 POSIX 路径，不允许绝对路径、`\`、`..` 或空路径。
- **差异语义**继续复用 `DiffStatus` 的 `same/added/removed/modified`，不新造状态；快照侧作为对比输入，不绕过现有 `ComparisonCache` / 内容读取规划。
- **内置样本必须确定性**：不得使用 `Date.now()` 或随机值；`modifiedMs` 使用固定常量，且与本地样本对比时「内容相同」的文件保持 size/mtime 一致，避免元数据快路径误判。
- **样本内容需能被现有 `classifyFile` 识别的扩展名下钻**：至少覆盖 `.ts`/`.tsx`、`.csv`、`.json`、`.yaml`/`.yml`。
- **单测入口**遵循既有 vitest 约定（`*.test.ts` 与被测模块同目录）；不新增测试框架依赖。
- 代码须通过 `pnpm lint` / `pnpm typecheck` / `pnpm test`；不降低既有测试覆盖。

## 最近交付证明

- WI：`wi_ws_80baff2d4373dbb5`（快照核心协议引擎与内置远端服务器快照样本，`kind: feature`，工作集 `ws_5f4bfdc3704066fc` 首项；后续 UI 导入/挂载项 `wi_ws_1c48f73551810bc2` 依赖本项）
- 日期：2026-10-18
- 结果：code_gates passed（本项 `needSelfTest=false`，不跑 UI 自测）。六条门禁 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 全 exit 0；`pnpm test` = **18 files / 125 tests 全绿**（测试无 Electron/DOM 依赖）。
- 覆盖摘要：
  - 新建 `src/shared/snapshot.ts`：`SNAPSHOT_SCHEMA = 'opencompare.snapshot/v1'`、`SnapshotEntry` / `SnapshotDocument` wire 类型。
  - 新建 `src/core/directory/snapshot.ts`（纯算法）：`serializeSnapshot`（条目按路径排序的规范文本）/ `parseSnapshot` 全量结构校验 + `SnapshotFormatError`（7 个可分支 `code`，含「文件路径不得嵌套于另一文件条目之下」）；`buildSnapshot`（复用 `sha256Hex`、目录不入条目、`inlineContent` 控制内联粒度）；`snapshotToScannedTree` + `SNAPSHOT_MOUNT_ROOT`/`ComparisonSide`/`compareDirectorySides`（快照↔目录 / 快照↔快照，复用 `compareScannedTrees` + `planContentReads` + `ComparisonCache`，内容按需读取）；`readSnapshotContent` + `SnapshotContentError`（`not-found` / `content-not-inlined` 可区分）。
  - 新建 `src/shared/fixtures/remote-snapshot.ts`：`REMOTE_SNAPSHOT`（14 文件、固定 `exportedAt`、`sha256`/size 由 `sha256Hex` + `TextEncoder` 自洽计算、规范 `.ocsnap.json` 文本），并在 `src/shared/fixtures/index.ts` 导出（含 `RemoteSnapshotFixture` 类型）。
  - 新建 `src/core/directory/snapshot.test.ts`（往返/规范化顺序/非法输入 7 类拒绝/构建口径/映射挂载点/目录↔快照双向/快照↔快照可过滤/未内联内容报错/内容读取区分）与 `src/shared/fixtures/remote-snapshot.test.ts`（规范文本往返、哈希与字节自洽、多类型下钻覆盖、与本地样本内容相同文件元数据对齐、对本地样本产出四态且差异文件可下钻）。
  - 九条验收（ac-snapshot-roundtrip / invalid-rejected / build-hash / compare-directory-vs-snapshot / compare-snapshot-vs-snapshot / content-read / remote-fixture-valid / remote-fixture-four-statuses / vitest-green）全部由上述两个测试文件覆盖。
  - 注：本轮 WI change pack 仅提供 `prd.md`（无 `tests/cases/**`、无 `tech.md` / `ux/**`）：case 折叠与全局 tech / design 折叠均无可执行项，故本域 `qa/` 目录暂空，实现证据见上述文件与 `pnpm test` 结果。
