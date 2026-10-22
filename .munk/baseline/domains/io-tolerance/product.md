# Domain: io-tolerance

不可读项容错域：跨 `foundation`（Electron 平台层 `listDirectory` / `readTextFile`）、`directory`（`scanDirectory` / `compareDirectories`）、`snapshot`（`buildSnapshot` / `compareDirectorySides`）与 `workbench`（就地提示 / 视图计数）的**横切容错契约**——「单条不可读条目、单个文件正文读取失败」必须被**计数并跳过**，而不是让整次列举 / 扫描 / 对比 / 快照导出失败；只有「根目录本身不可读」这类整体失败才继续 reject，且错误必须是中文可读。本域不重造目录对比语义、快照协议或平台能力本身，也不处理句柄耗尽（归 `io-concurrency`）。**符号链接（含悬空链接）自 `symlink-semantics` 域起不再属于「跳过项」**：链接是可比条目，只有真正不可读的条目 / 目录才计入跳过；跳过数已按左右分列（`leftSkipped` / `rightSkipped`），本域涉及链接与分列口径的条款以 `symlink-semantics` 为准。

## 范围

- **平台列举容错（`src/main/platform/electron-platform.ts` 的 `listDirectory`）**：条目元数据只经 `lstat` 获取（不跟随链接，链接语义归 `symlink-semantics` 域）；`lstat` 自身失败且错误码属于 `ENTRY_FALLBACK_CODES`（ENOENT / ELOOP / EACCES / ENOTDIR）时条目**保留在结果里**并标注 `broken: true` + 非空 `skippedReason`（中文原因 + 原始错误码，如「不可读条目无法检查：…（EACCES）」）。健康条目与逐条串行结果在 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 上完全一致，且不带 `broken`。不属于该错误码集合的失败（如 `EMFILE`）仍让整次列举失败。
- **根目录可读错误**：`readdir` 本身失败（路径不存在 / 不是目录 / 无权限）时 `listDirectory` 仍 reject，但错误文案形如「无法读取目录 <path>：<中文原因>（<code>）。」，不把裸 `ENOENT ... stat` 作为唯一信息；已识别的句柄错误继续沿用 `io-concurrency` 的可读文案。
- **`DirectoryEntry` 增量可选字段（`src/shared/platform/types.ts`）**：`broken?: boolean`、`skippedReason?: string`（链接相关字段 `isSymbolicLink` / `linkTarget` / `linkTargetKind` 归 `symlink-semantics` 域），缺省即正常条目；既有字段语义不变；`PlatformPort` 不新增方法、不改既有 channel 与 preload 白名单。
- **扫描容错（`src/core/directory/compare.ts` 的 `scanDirectory`）**：`broken` 条目不进 `index`，`skipped += 1`（链接条目不再是 `broken`，见 `symlink-semantics`）；某个子目录 `list` 失败只跳过该子树（`skipped += 1`），父目录与兄弟节点照常扫描；根目录 `list` 失败仍以可读错误 reject。`ScannedTree` 新增 `skipped: number`。
- **对比聚合（`compareDirectories` / `compareDirectorySides`）**：`DirectoryComparison` 按侧产出 `leftSkipped` / `rightSkipped`（该侧不可列举条目/子树 + 该侧正文不可读文件），`skipped` 保留为两侧之和；`fileCount === same + added + removed + modified`，`counts` 只统计成功扫描的文件；正文读取失败的**文件对判 `modified` 并计入该侧 skipped**，不再让整次对比 reject。正文摘要经 `digestContentCandidates` 直接写入 `ComparisonCache`（只持有在飞读取的正文），不再为整棵树保留全部文本。
- **快照容错（`buildSnapshot`）**：返回 `SnapshotBuildResult { snapshot, skipped }`；单个文件正文读取失败则跳过该文件、`skipped += 1`，其余条目照常导出且 `validateSnapshot` 通过；`.ocsnap.json` 线格式与字段不变（链接条目借用 `content` 标记，见 `symlink-semantics`）。`exportSideSnapshot` 透传 `skipped`，工作台导出提示在 `skipped > 0` 时追加「，跳过 N 个不可读项」。
- **正文可读错误（`read-text-file`）**：`readLocalTextFile` 命中悬空链接 / 不可读文件 / 不存在路径时 reject，消息形如「无法读取文件 <path>：<中文原因>（<code>）。」，经 IPC（`PLATFORM_CHANNELS.readTextFile`）返回同样文案且不含 `Error invoking remote method` 前缀；不崩窗口、不拖垮整次对比。
- **工作台就地提示（`workbench` 域承载渲染）**：对比成功且 `leftSkipped + rightSkipped > 0` 时沿用既有 `notice` + `noticeTone: 'info'`（`text-diff-added`）显示「已跳过：左 X / 右 Y」；两侧均为 0 不出现该提示；目录视图在 `leftSkipped + rightSkipped > 0` 时展示同一按侧文案。提示为 info 级，不是错误弹层，也不生成空会话。
- **真实规模验收**：`OPENCOMPARE_REAL_LEFT` / `OPENCOMPARE_REAL_RIGHT` 环境变量指定两个**真实工程目录**（非内置样本、非拷贝副本）时执行对比并输出 `fileCount` / `counts` / `skipped`；未设置时该用例 `skip`，源码不硬编码本机绝对路径。

## 验收

- **ac-list-dangling-symlink-kept**（口径已由 `symlink-semantics` 域 `ac-dangling-link-compared` 取代）：目录含 1 个悬空符号链接 + N 个正常条目时，`listDirectory` 正常 resolve、返回条目数为 N+1，悬空项作为**可比较的链接条目**返回（`isSymbolicLink === true`、`linkTarget` 非空、`linkTargetKind === 'missing'`），**不带** `broken` / `skippedReason`。
- **ac-list-stat-fallback-lstat**：`lstat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败的条目按 broken 保留并返回，不 reject；健康条目结果与逐条 `lstat` 完全一致（name / path / isDirectory / size / modifiedMs）。
- **ac-list-no-break-on-one-bad-entry**：同一目录中混有悬空链接与不可读项时，`listDirectory` 不抛错，可读条目与链接条目全部返回，仅真正不可检查项标 `broken`。
- **ac-list-root-error-readable**：列举根目录本身失败（如目标不是目录 / 无权限）时 `listDirectory` 仍 reject，但错误文案为中文可读（含路径），不出现裸 `ENOENT ... stat` 作为唯一信息。
- **ac-scan-skips-broken-entry**（口径已由 `symlink-semantics` 域 `ac-scan-no-follow` 收窄）：树上含**不可读条目**时 `scanDirectory` resolve；`index` 不含该 broken 条目，其余节点齐全，`skipped === 1`；悬空链接不触发本条（它照常进树）。
- **ac-scan-skips-unreadable-subdir**：某子目录 `listDirectory` reject 时，该子树被跳过、`skipped` 至少 +1，父目录与兄弟节点仍被扫描，整体不 throw。
- **ac-scan-root-failure**：根目录 listing 失败时 `scanDirectory` 仍 reject（不被吞掉），错误可读。
- **ac-compare-skipped-count**：`compareDirectories` 在上述含坏项的树上 resolve；`fileCount === same + added + removed + modified`，`counts` 只统计成功扫描文件，`comparison.skipped === leftSkipped + rightSkipped`。
- **ac-compare-content-read-failure**：`planContentReads` 命中的文件读取失败时，该文件对状态为 `modified`、**该侧** skipped +1，`compareDirectories` 不 reject。
- **ac-snapshot-build-skips**：`buildSnapshot` 遇单个文件不可读时跳过该文件、`skipped` +1，其余条目照常导出且 `serializeSnapshot` 校验通过，快照线格式字段不变。
- **ac-readtext-readable-error**：`readTextFile` 命中悬空链接或不可读文件时 reject，消息为中文且包含该路径，不含 `Error invoking remote method` 前缀；经 IPC（`PLATFORM_CHANNELS.readTextFile`）调用同样如此。
- **ac-ui-skip-notice**：对比成功且 `leftSkipped + rightSkipped > 0` 时，workbench notice 文案匹配 `已跳过：左 X / 右 Y` 且 tone 为 info；两侧均为 0 时不出该提示。
- **ac-ui-skip-stat**：目录视图在 `leftSkipped + rightSkipped > 0` 时展示同一按侧跳过计数（`已跳过：左 X / 右 Y`），两侧均为 0 时不展示。
- **ac-real-trees**：通过环境变量（`OPENCOMPARE_REAL_LEFT` / `OPENCOMPARE_REAL_RIGHT`）指定的真实目录测试在设置时执行：扫描与对比完成、不抛错、输出 `fileCount` / `counts` / `leftSkipped` / `rightSkipped`（不硬断言 `skipped >= 1`——不跟随口径下真实工程目录的链接不再计入跳过）；未设置环境变量时该测试 skip，不引入本机路径硬依赖。
- **ac-existing-semantics**：不含异常条目的树，`same` / `added` / `removed` / `modified` 分类、hash/mtime 快路径、快照与同步既有测试全部保持通过。

## 非目标

- 不改对比算法语义（四态判定、size/mtime 快路径、SHA-256 内容确认、缓存键）。
- 不新增依赖；不改 `PlatformPort` 既有方法 / 字段语义，不改 IPC channel 清单。
- 不改 `.ocsnap.json` 线格式，不新增快照字段。
- 不处理 EMFILE / ENFILE（归 `io-concurrency` 域：仍是可读错误并中止，不降级为跳过），不做性能调优。
- 不尝试修复 / 解引用悬空链接本身，不做文件系统写入或清理；不提供「强制跟随链接」开关（链接的条目标注、四态与计数归 `symlink-semantics` 域）。
- 不把坏项计入 `same` / `added` / `removed` / `modified` 任一计数，也不为其生成差异节点。
- 不建 tag、不 push、不发版；README 与对外符号链接口径归 `symlink-semantics` 域。
- 不做浏览器 / 真机实机验收（另派 product-qa），不改内置样本库与 `/samples` 挂载。

## 实现约束

- `listDirectory` 只用 `lstat` 取条目元数据（链接语义归 `symlink-semantics` 域）；`lstat` 失败且错误码命中 `ENTRY_FALLBACK_CODES` 时按 broken 标注并保留该条目（不静默丢弃、不中断该目录的列举）。
- `DirectoryEntry` 只做增量可选字段（缺省视为正常条目）；跳过计数用 `number`，从 `ScannedTree.skipped` 与按侧正文不可读计数聚合到 `DirectoryComparison.leftSkipped` / `rightSkipped`。
- 中文文案统一走现有可读错误风格（参考 `toReadableIoError`），不要直接抛裸 Node 错误；句柄错误文案不重复实现。
- 内容读取容错放在核心层（`readContentCandidates` / `digestContentCandidates`），供 `compareDirectories`、`compareDirectorySides` 与 `buildSnapshot` 共用；`tolerate` 谓词让快照「正文未内联」这类格式错误仍按致命处理。
- 工作台提示沿用现有 `notice` + `noticeTone: 'info'` 通道，不新增弹窗组件；目录视图计数复用现有副标题 / 说明文案位置。
- 真实目录验收用 env-gated vitest（默认 skip），不把 `/Users/...` 绝对路径写进断言；`code_gates.json` 既有 gate 列表不变，新增断言走 `pnpm test`。

## 最近交付证明

- WI：`wi_intake_1c49316bd5fe94ba`（修复悬空符号链接 / 不可读项让整次目录对比失败：跳过计数 + 就地提示，`kind: fix`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；install / lint / typecheck / build / build-web / test 六条门禁 attempt 001 全绿，27 个测试文件 430 passed / 1 skipped）。
- 覆盖摘要：`electron-platform.listDirectory` 增加 `ENTRY_FALLBACK_CODES`（ENOENT / ELOOP / EACCES / ENOTDIR）→ `lstat` 兜底，坏条目标 `broken` + 中文 `skippedReason` 并保留在结果中，`lstat` 也失败时以 `readdir` 类型返回（size / modifiedMs 为 0）；`readdir` 失败改为「无法读取目录 <path>：…」可读错误；新增 `readLocalTextFile` 让 `read-text-file`（含 IPC 路径）返回「无法读取文件 <path>：…」且无 `Error invoking remote method` 前缀。`DirectoryEntry` 增 `broken?` / `skippedReason?`（仅可选字段，无新 channel）。核心层：`scanDirectory` 跳过 broken 条目与不可列举子树并累计 `skipped`（根失败仍 reject），`ScannedTree.skipped`；新增 `readContentCandidates` / `digestContentCandidates`（正文摘要直写 cache、不保留整树文本），`compareDirectories` / `compareDirectorySides` 对不可读正文判 `modified` 并计入 `skipped`，`DirectoryComparison.skipped` 聚合；`buildSnapshot` 返回 `{ snapshot, skipped }` 且线格式不变，`exportSideSnapshot` 透传，工作台导出提示追加「，跳过 N 个不可读项」。渲染层：对比成功且 `skipped > 0` 时 `report(..., 'info')` 显示「已跳过 N 个不可读项/悬空链接」，`DirectoryView` 同步展示计数，`skipped === 0` 不出提示。新增/改动用例：`electron-platform.test.ts`（悬空链接保留、混合坏项不失败、根错误可读、悬空链接读文件可读错误、env-gated `real project trees`）、`compare.test.ts`（坏条目跳过、子树跳过、根失败、双侧聚合、正文不可读判 modified、快照跳过单文件）、`App.test.tsx`（info 提示 + 视图计数、无跳过时不提示）。
- 注：本 WI change pack 未提供 `tests/cases/**`、`tech.md`、`ux/**`，源码用例折叠改由本域 `qa/` 按 AC 逐条落档；全局 tech / design 折叠跳过。`ac-list-stat-fallback-lstat` 里 ENOENT 与 EACCES 有直接用例覆盖，ELOOP / ENOTDIR 走同一错误码分支但当前无用例构造；`ac-real-trees` 默认 skip，本轮未设置环境变量执行真实工程目录（需负责人本机 `OPENCOMPARE_REAL_LEFT` / `OPENCOMPARE_REAL_RIGHT` 复跑）。
