# Domain: snapshot

快照域：OpenCompare 本地对比快照（`.ocsnap.json`）的**协议底座**与**目录视图挂载闭环**。第一阶段交付跨进程共享的 wire 模型与版本标识、序列化 / 反序列化结构校验、由扫描树构建快照、快照参与目录对比的适配层、按快照路径读取内联内容，以及 `@shared/fixtures` 内置的确定性远端服务器快照样本（`src/core/directory/` + `src/shared/`，纯算法与内置样本）；第二阶段把该协议接成用户可点的闭环——目录对比左右两栏各自的快照导出 / 导入挂载、来源状态标识（目录 vs 快照）、内置「本地目录 vs 远端快照」样本一键加载、快照侧下钻到代码 / CSV / 结构化视图（含未内联内容提示）、以及过滤 / 图例 / 计数对快照场景生效。对比语义复用目录域既有引擎（`same` / `added` / `removed` / `modified`），本域不重造差异算法，也不做真实 SSH/SFTP 或网络探测。

## 范围

### 协议底座（第一阶段，`src/core/directory/` + `src/shared/`）

- **协议 wire 模型与版本标识（`src/shared/snapshot.ts`）**：固定 `schema: "opencompare.snapshot/v1"`；根元数据为来源名称 `name` 与导出时间 `exportedAt`（ISO-8601）；条目为**根相对 POSIX 路径** + `size`（字节）+ `modifiedMs`（epoch ms）+ `sha256`（小写 hex）+ **可选**内联 `content`。目录不进入条目列表，由文件路径隐式表达。
- **序列化 / 反序列化校验（`@core/directory/snapshot.ts` 纯函数，零 Electron/DOM）**：模型 → 可 `JSON.parse` 的规范文本（条目按路径排序、两空格缩进、结尾换行）；规范文本 → 模型。校验覆盖 schema/版本、根元数据必填与类型、条目必填字段类型、路径合法性（非空、根相对、无 `..` / `.` / 空段、不得落在另一个文件条目之下）、重复路径、哈希格式（64 位小写 hex）、JSON 语法错误。非法输入抛 `SnapshotFormatError`，带可分支的 `code`（`invalid-json` / `invalid-schema` / `invalid-metadata` / `invalid-entry` / `invalid-path` / `duplicate-path` / `invalid-hash`）与可选 `path`，**绝不静默产出半成品或空树**。
- **快照构建（`buildSnapshot`）**：由已扫描目录树（`ScannedTree`）+ 注入的 `readTextFile` 构建；`sha256` 一律走 `src/core/directory/hash.ts` 的 `sha256Hex`，与现有目录对比引擎摘要口径一致；`inlineContent` 谓词决定哪些文件携带内联 `content`（默认全部内联），即「元数据 + 哈希」与「可下钻内联文本」两种粒度；`exportedAt` 由调用方传入，保持可测试确定性。
- **快照参与对比（`snapshotToScannedTree` / `compareDirectorySides`）**：把快照映射为对比引擎可接受的 `ScannedTree`，挂载到默认虚拟根 `/snapshots/<left|right>/<name>`（`SNAPSHOT_MOUNT_ROOT`，可覆写），从而复用 `compareScannedTrees` / `planContentReads` 的 `same` / `added` / `removed` / `modified` 语义、`ComparisonCache` 与内容读取规划。`ComparisonSide` 支持 `directory` 与 `snapshot` 两类输入，因此覆盖「真实目录 vs 快照（任一侧）」与「快照 vs 快照」；输出仍是标准 `DirectoryComparison`，可继续走既有过滤器与左右投影。内容读取按需：快照侧取内联 `content`，目录侧走 `readTextFile`。
- **快照内容读取（`readSnapshotContent`）**：按根相对快照路径读取内联正文，供 UI 双击下钻；文件不存在抛 `not-found`，存在但未内联抛 `content-not-inlined`（`SnapshotContentError.code` 可区分），**不以空字符串冒充内容**。
- **内置远端服务器快照样本（`src/shared/fixtures/remote-snapshot.ts`，经 `index.ts` 导出 `REMOTE_SNAPSHOT`）**：虚构 `remote-prod` 服务器的确定性样本（无 `Date.now()`、无随机、无网络、无真实 SSH），同时导出类型化模型 `snapshot` 与规范 `.ocsnap.json` 文本 `text`（可被 `parseSnapshot` 接受）；14 个文件以内联内容覆盖 `.ts`/`.tsx`、`.csv`、`.json`、`.yaml`/`.yml` 等下钻场景；与本地样本内容相同的文件保持 `size`/`modifiedMs` 一致（样本挂载 `modifiedMs: 0`），`src/core/lexer.ts` 故意保持本地 size/mtime 但改变正文以走 SHA-256 确认路径。

### 目录视图挂载闭环（第二阶段，`src/renderer/src/workbench/` + `views/DirectoryView`）

- **快照挂载编排（`snapshotOps.ts`，与 `directoryOps.ts` 同级）**：渲染层纯编排——`ComparisonSides`（左右各为 `directory` 或 `snapshot` 输入）、`SnapshotMount`（名称 + 挂载点 `/snapshots/<left|right>/<name>`）、`snapshotMountPath` / `snapshotSide` / `withSide` / `snapshotMounts` / `findSnapshotMount`、`seedSnapshotCache`（把挂载快照种子进 `ComparisonCache`）、`compareSides`（复用 `compareDirectorySides` 重算）。快照侧文件读取一律经挂载注册表（`readSnapshotContent`），**禁止**把 `/snapshots/...` 路径传给 `PlatformPort`。
- **导出 / 导入的 DOM 管线**：`exportSideSnapshot`（扫描真实目录 → `buildSnapshot`，或已是快照时按规范形式重新序列化做 round-trip）；`downloadSnapshotFile`（`Blob` + anchor 下载 `<name>.ocsnap.json`）；`readFileText`（`FileReader`）；`parseSnapshotText`（`parseSnapshot` 包装）。导入 / 导出只用 renderer DOM API（`<input type="file">` + `FileReader`；`Blob` + anchor），**不新增 `PlatformPort` / IPC / 原生保存对话框**，Electron（`contextIsolation` + `sandbox`）与 Web 双端行为一致、组件测试可在 jsdom 内驱动。
- **来源状态标识与错误文案**：左 / 右栏面板标题 / 副标题 / 标签区分「目录」与「快照」，快照侧显示快照名（如 `remote-prod`）与挂载点 `/snapshots/right/remote-prod`；`describeSnapshotImportError` / `describeSnapshotContentError` 产出可读中文错误（schema/格式不被接受；该快照未内联该文件内容、无法离线下钻）。
- **Workbench 持有挂载状态**：左右两侧是目录还是快照、快照文档、名称、挂载点由 `Workbench` 持有并传到 `DirectoryView`；导入成功后立即 `compareSides` 重算并复用既有 `ComparisonCache`；导入失败回滚到导入前状态，不出现空树或会话丢失。左右两栏入口可访问名可区分（「导出左侧快照」/「导入右侧快照」/「远端快照样本」）。
- **下钻与过滤闭环**：快照侧差异文件双击按扩展名下钻到代码 / CSV / JSON / YAML 视图，内容来自快照内联文本，会话标题 / 副标题指向该快照路径；未内联内容的文件给出明确提示而不渲染空白；左独有 / 右独有仍按现有语义渲染空侧。现有五态过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）与状态栏计数、图例对快照参与的对比同样生效。

## 验收

### 协议底座（第一阶段）

- **ac-snapshot-roundtrip**：合法快照模型序列化后反序列化，schema/版本、根元数据与全部条目（路径、size、modifiedMs、sha256、内联 content）逐项不变。
- **ac-snapshot-invalid-rejected**：非法 JSON、schema/版本不匹配、条目缺必填字段、路径非法或重复、哈希格式非法时，反序列化返回可识别的错误而不是半成品。
- **ac-snapshot-build-hash**：从扫描树构建快照时，每个文件的 `sha256` 等于 `sha256Hex` 对同一文本的摘要；目录不产生条目；未选择内联的文件不携带 `content`。
- **ac-compare-directory-vs-snapshot**：真实目录 vs 快照（左右任一方向）复用现有对比语义，得到正确的 `same` / `added` / `removed` / `modified` 分类与计数，包括「大小与 mtime 相同但内容不同 → modified」。
- **ac-compare-snapshot-vs-snapshot**：两侧均为快照时同样产出完整 `DirectoryComparison`（含左右根名、逐节点状态与汇总计数），可直接被现有过滤/投影函数消费。
- **ac-snapshot-content-read**：快照中内联的文件可通过统一入口读到原文；未内联或不存在时返回可区分的明确错误。
- **ac-remote-fixture-valid**：内置远端服务器快照样本通过反序列化校验，包含代码、CSV、YAML、JSON 等多类型内联内容，哈希与内联文本自洽。
- **ac-remote-fixture-four-statuses**：内置远端服务器快照样本与内置本地目录样本对比后，四态（same/added/removed/modified）均出现，且差异文件可下钻（内容可读）。
- **ac-vitest-green**：`pnpm test` 全绿，新增/扩展的单测在 Node 环境（无 Electron/DOM）下运行。

### 目录视图挂载闭环（第二阶段）

- **ac-export-directory-snapshot**：对一侧真实目录点击导出，得到可被 `parseSnapshot` 接受的 `.ocsnap.json` 文本，条目数等于该侧文件数，每条含正确的 `size` / `modifiedMs` / `sha256`；可下钻的文本文件带内联 `content`，不可下钻文件（如 `assets/logo.png`）只有元数据 + 哈希。
- **ac-import-mount-and-roundtrip**：把「导出本地样本目录」得到的文本通过左/右导入入口挂载后，该侧标识为快照（名称 + 挂载点），对比结果与该目录自比一致——全部 `same`，无差异计数。
- **ac-import-invalid-rejected**：导入非快照 JSON 或损坏文本时，通知区给出可读错误，且左右两栏仍显示导入前的对比（不出现空树、不丢失会话）。
- **ac-remote-sample-four-statuses**：一键加载「远端快照样本」后，本地样本目录 vs `remote-prod` 快照同时出现 `same` / `added` / `removed` / `modified` 四态（图例与状态栏可见），右栏标识为快照。
- **ac-snapshot-filter**：在该对比上切换过滤：`仅差异` 不再显示 `parser.ts` 等 `same` 文件，`右独有` 只显示快照侧独有文件，`相同` 只显示同内容文件。
- **ac-snapshot-drilldown**：双击快照侧差异文件按扩展名下钻到对应视图且内容来自快照内联文本：`src/core/engine.ts` → 代码视图、`src/data/report.csv` → CSV 视图、`config/deploy.yaml` → 结构化视图，会话标题/副标题指向该快照路径。
- **ac-drilldown-not-inlined-hint**：双击快照中未内联内容的文件时给出明确提示（说明该快照未内联内容），不渲染空白对比。
- **ac-snapshot-vs-snapshot**：左右两栏均挂载快照（可用内置样本与导入的快照组合）时对比仍正常产出，过滤器与双击下钻可用。
- **ac-tests-and-gates**：新增/扩展的 jsdom 组件测试与纯函数单测通过，`pnpm test` / `pnpm lint` / `pnpm typecheck` 全绿，不降低既有测试。

## 非目标

- **不改 `@core` 快照协议、`compare` / `filter` / `sync` / `template` 引擎语义，不改 `@shared/fixtures` 既有样本内容与答案键**；`REMOTE_SNAPSHOT` 只消费，不重造。
- **不改 `PlatformPort`、IPC channel、main / preload**：不新增 `selectFile`、不做原生保存对话框；导入/导出全走 renderer DOM API。
- **不做拖拽导入、剪贴板粘贴导入、快照列表/多快照管理、快照合并、快照重命名**。
- **不做真实 SSH/SFTP、远端网络探测或远端增量同步**；不做远端刷新/自动重连。
- **不做二进制 / 图片等非文本内容内联**；不做 base64 大文件内联、分块、压缩（gzip）或流式快照。
- **不做多哈希算法切换、签名、加密、权限或快照版本迁移**。
- **不做导出粒度选项 UI**（默认内联可下钻文本文件，一键完成，不弹对话框）；不改目录同步、模板归位、代码 / CSV / 结构化视图的既有入口与语义；不重排工作台样本菜单与场景 tab。
- 不新增视觉 token、不新增组件风格、不大改布局；组件只引用现有 token 与基础组件。

## 实现约束

- **分层**：快照校验/构建/对比适配放 `src/core/directory/`（纯 TS，禁止 electron/react/DOM）；协议 wire 类型与版本常量放 `src/shared/`（跨进程共享），避免 `@shared/fixtures` 与 `@core/*` 形成循环依赖（样本从 `@core/directory/snapshot` 与 `@shared/snapshot` 取值，`@core` 不反向依赖 `@shared/fixtures`）；渲染层挂载编排放 `src/renderer/src/workbench/`（如 `snapshotOps.ts`），视图只接收 props / 回调。
- **摘要唯一实现**：复用 `src/core/directory/hash.ts` 的 `sha256Hex`，不引入 `node:crypto` 或 Web Crypto，保证 Node / 浏览器 / Electron renderer 一致。
- **协议固定标识** `schema: "opencompare.snapshot/v1"`；条目路径为根相对 POSIX 路径，不允许绝对路径、`\`、`..` 或空路径。
- **复用适配层，不另造虚拟路径体系**：`ComparisonSide`、`compareDirectorySides`、`SNAPSHOT_MOUNT_ROOT`、`snapshotToScannedTree`、`readSnapshotContent`、`serializeSnapshot`、`parseSnapshot`、`SnapshotFormatError.code` / `SnapshotContentError.code`；挂载时显式传 `mountPath`（`/snapshots/<left|right>/<name>`），下钻据此反向识别所属快照。快照侧文件读取必须经挂载注册表（`readSnapshotContent`），**禁止**把 `/snapshots/...` 路径传给 `PlatformPort`（web 端会 not-found）；工作台现有 `openFile` 的 `platform.readTextFile(node.leftPath)` 路径需按侧分流。
- **差异语义**继续复用 `DiffStatus` 的 `same/added/removed/modified`，不新造状态；快照侧作为对比输入，不绕过现有 `ComparisonCache` / 内容读取规划。
- **内置样本必须确定性**：不得使用 `Date.now()` 或随机值；`modifiedMs` 使用固定常量，且与本地样本对比时「内容相同」的文件保持 size/mtime 一致，避免元数据快路径误判。样本内容需能被现有 `classifyFile` 识别的扩展名下钻（至少覆盖 `.ts`/`.tsx`、`.csv`、`.json`、`.yaml`/`.yml`）。
- **单测约定**：`*.test.ts(x)` 与被测模块同目录；组件测试用 `// @vitest-environment jsdom` docblock + `@testing-library/react`；入口可访问名可区分以便用 role + name 精确点击，不依赖 `getAllBy*` 顺序。
- 代码须通过 `pnpm lint` / `pnpm typecheck` / `pnpm test`；不降低既有测试覆盖。

## 最近交付证明

- WI：`wi_ws_1c48f73551810bc2`（目录视图快照导出/导入挂载与远端快照下钻体验，`kind: feature`；承接前序 protocol 底座 `wi_ws_80baff2d4373dbb5`）
- 日期：2026-10-18
- 结果：self_test passed（10 条 case 全 pass：9 条 UI case + 门禁 case）。`pnpm test` = **20 files / 141 tests 全绿**（较前序 18 files / 125 tests 净增 2 files / 16 tests）；`pnpm lint` exit 0；`pnpm typecheck` exit 0。
- 覆盖摘要：
  - 新建 `src/renderer/src/workbench/snapshotOps.ts`：`ComparisonSides` / `SnapshotMount` / `MountedSnapshotFile` / `SnapshotExport` 模型；`snapshotMountPath` / `directorySides` / `remoteSnapshotSides` / `snapshotSide` / `withSide` / `parseSnapshotText` / `snapshotMounts` / `findSnapshotMount` / `seedSnapshotCache` / `compareSides` 编排；`readSideFile`（目录走 `readTextFile`、快照走 `readSnapshotContent`，按侧分流禁止把 `/snapshots/...` 传给 `PlatformPort`）；`exportSideSnapshot` / `downloadSnapshotFile` / `readFileText`（DOM 管线，无新增 IPC）；`describeSnapshotImportError` / `describeSnapshotContentError` 可读中文错误。
  - 改 `src/renderer/src/workbench/directoryCompare.ts` / `views/DirectoryView.tsx` / `workbench/Workbench.tsx`：左/右栏快照导出、导入挂载、来源状态标识（目录 vs 快照 + 名称 + 挂载点）、「远端快照样本」一键加载、过滤/图例/计数联动、快照侧按扩展名下钻、未内联内容提示、导入失败回滚到导入前状态。
  - 新增 `src/renderer/src/workbench/snapshotOps.test.ts`（183 行，纯函数/编排单测：挂载点、按侧读取分流、导出/round-trip、导入错误分支、内容错误分支）与 `src/renderer/src/App.snapshot.test.tsx`（206 行，jsdom 组件测试：导出下载、导入挂载、非法拒绝、远端样本四态、过滤、下钻、未内联提示、快照 vs 快照）。
  - 九条新验收（ac-export-directory-snapshot / import-mount-and-roundtrip / import-invalid-rejected / remote-sample-four-statuses / snapshot-filter / snapshot-drilldown / drilldown-not-inlined-hint / snapshot-vs-snapshot / tests-and-gates）由 9 条折叠用例（`qa/`）与 `pnpm test` / `lint` / `typecheck` 覆盖。
  - 注：本轮 WI change pack 仅提供 `prd.md` + `tests/cases/**`（无 `tech.md` / `ux/**`）：全局 tech / design 折叠无可执行项，故本轮跳过 tech/ux 折叠。
