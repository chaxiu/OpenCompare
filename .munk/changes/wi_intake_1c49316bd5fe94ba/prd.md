# fix: 目录对比容错悬空符号链接 / 不可读项（跳过计数，不整体失败）

## 范围

事故现象（v0.2.2 本机实测仍复现）：把 `/Users/zhutao/Cursor/DawnChat` 与 `/Users/zhutao/Cursor/ZenMind` 拖入对比，报
`Error invoking remote method platform:list-directory: Error: ENOENT: no such file or directory, stat …/DawnChat/.claude/skills/building-native-ui`。
该目录项在 `readdir` 中可列出但无法 `stat`（悬空符号链接），当前实现让整次对比失败。

本项要修（范围钉死）：

1. `src/main/platform/electron-platform.ts` 的 `listDirectory`：逐条 `stat` 失败（ENOENT / ELOOP / EACCES / ENOTDIR）时退回 `lstat`；悬空符号链接或不可读条目**保留在结果里**并标注（`broken: true` + 可读 `skippedReason`），绝不因单条失败让整个 `listDirectory` reject。根目录本身不可读时仍拒绝，但给出中文可读错误。
2. `DirectoryEntry` 增量可选字段（`broken?: boolean`、`skippedReason?: string`），既有字段语义不变；`PlatformPort` 不加新方法、不改既有 channel。
3. `src/core/directory/compare.ts` 的 `scanDirectory`：跳过 `broken` 条目并累计 `skipped`；单个子目录 listing 失败只跳过该子树并 `skipped += 1`，不中止整次扫描；根目录失败仍抛可读错误。`ScannedTree` 暴露 `skipped`。
4. 对比层聚合：`compareDirectories` / `compareDirectorySides` 把两侧 `skipped` 汇总到 `DirectoryComparison.skipped`；hash 阶段单个文件内容读取失败不再拖垮整次对比（该对判 `modified` 并计入 `skipped`）。
5. 快照扫描同理：`buildSnapshot` 单个文件读取失败跳过并计数，导出其余条目，`.ocsnap.json` 线格式不变。
6. 工作台就地提示：对比成功且 `skipped > 0` 时显示「已跳过 N 个不可读项/悬空链接」（info 级），不是弹错终止；目录视图展示跳过计数。
7. `read-text-file` 命中悬空链接 / 不可读文件时返回中文可读错误（含路径），不崩窗口、不拖垮整次对比。
8. 真实规模验收：用上述两个真实工程目录（非内置样本、非拷贝副本）跑通对比，输出差异统计与跳过计数。

## 验收

- ac-list-dangling-symlink-kept: 目录含 1 个悬空符号链接 + N 个正常条目时，`listDirectory` 正常 resolve；返回条目数为 N+1，其余条目字段不变，悬空项 `broken === true` 且 `skippedReason` 为非空字符串。
- ac-list-stat-fallback-lstat: `stat` 因 ENOENT / ELOOP / EACCES / ENOTDIR 失败的条目走 `lstat` 兜底后仍返回，不 reject；`stat` 成功的条目结果与修复前逐条 `stat` 完全一致（name / path / isDirectory / size / modifiedMs）。
- ac-list-no-break-on-one-bad-entry: 同一目录中混有悬空链接与不可读项时，`listDirectory` 不抛错，可读条目全部返回。
- ac-list-root-error-readable: 列举根目录本身失败（如目标不是目录 / 无权限）时 `listDirectory` 仍 reject，但错误文案为中文可读（含路径），不出现裸 `ENOENT ... stat` 作为唯一信息。
- ac-scan-skips-broken-entry: 树上含悬空链接时 `scanDirectory` resolve；`index` 不含该 broken 条目，其余节点齐全，`skipped === 1`（两侧各自计数）。
- ac-scan-skips-unreadable-subdir: 某子目录 `listDirectory` reject 时，该子树被跳过、`skipped` 至少 +1，父目录与兄弟节点仍被扫描，整体不 throw。
- ac-scan-root-failure: 根目录 listing 失败时 `scanDirectory` 仍 reject（不被吞掉），错误可读。
- ac-compare-skipped-count: `compareDirectories` 在上述含坏项的树上 resolve；`fileCount === same + added + removed + modified`，`counts` 只统计成功扫描文件，`comparison.skipped` 等于左右两侧 `skipped` 之和。
- ac-compare-content-read-failure: `planContentReads` 命中的文件读取失败时，该文件对状态为 `modified`、`skipped` +1，`compareDirectories` 不 reject。
- ac-snapshot-build-skips: `buildSnapshot` 遇单个文件不可读时跳过该文件、`skipped` +1，其余条目照常导出且 `serializeSnapshot` 校验通过，快照线格式字段不变。
- ac-readtext-readable-error: `readTextFile` 命中悬空链接或不可读文件时 reject，消息为中文且包含该路径，不含 `Error invoking remote method` 前缀；经 IPC（`PLATFORM_CHANNELS.readTextFile`）调用同样如此。
- ac-ui-skip-notice: 对比成功且 `skipped > 0` 时，workbench notice 文案匹配 `已跳过 N 个不可读项/悬空链接` 且 tone 为 info；`skipped === 0` 时不出该提示。
- ac-ui-skip-stat: 目录视图在 `skipped > 0` 时展示跳过计数（会话 stats 或视图内文案），`skipped === 0` 时不展示。
- ac-real-trees: 通过环境变量（`OPENCOMPARE_REAL_LEFT` / `OPENCOMPARE_REAL_RIGHT`）指定的真实目录测试在设置时执行：`DawnChat` vs `ZenMind` 扫描与对比完成、不抛错、`skipped >= 1`（`.claude/skills` 下悬空链接被计入跳过）、输出 `fileCount`/`counts`/`skipped`；未设置环境变量时该测试 skip，不引入本机路径硬依赖。
- ac-existing-semantics: 不含异常条目的树，`same/added/removed/modified` 分类、hash/mtime 快路径、快照与同步既有测试全部保持通过。

## 非目标

- 不改对比算法语义（四态判定、size/mtime 快路径、SHA-256 内容确认、缓存键）。
- 不新增依赖；不改 `PlatformPort` 既有方法/字段语义，不改 IPC channel 清单。
- 不改 `.ocsnap.json` 线格式，不新增快照字段。
- 不处理 EMFILE/ENFILE（已由既有 `mapWithLimit` 与可读错误覆盖），不做性能调优。
- 不尝试修复/解引用悬空链接本身，不做文件系统写入或清理。
- 不建 tag、不 push、不发版；不改 README 与对外口径（对外回帖由负责人决定）。
- 不做浏览器/真机实机验收（另派 product-qa），不改内置样本库与 `/samples` 挂载。

## 实现约束

- `listDirectory` 只在 `stat` 失败时退回 `lstat`；成功路径保持原 `stat` 语义。`stat` 失败但 `lstat` 成功的条目必须出现在结果中（不静默丢弃），以 `broken` / `skippedReason` 标注；`lstat` 也失败时同样按 broken 标注并计入跳过，不中断该目录的列举。
- `DirectoryEntry` 只做增量可选字段（缺省视为正常条目）；`skipped` 计数用 `number`，从 `ScannedTree` 聚合到 `DirectoryComparison`。
- 工作台提示沿用现有 `notice` + `noticeTone: 'info'` 通道，不新增弹窗组件。
- 中文文案统一走现有可读错误风格（参考 `toReadableIoError`），不要直接抛裸 Node 错误。
- 真实目录验收用 env-gated vitest（默认 skip），不把 `/Users/zhutao/Cursor/...` 绝对路径写进断言；`code_gates.json` 既有 gate 列表不变，新增断言走 `pnpm test`。
