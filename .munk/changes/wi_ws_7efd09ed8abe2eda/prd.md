# 真实外部目录双向镜像同步闭环

## 范围

在现有「目录单向镜像增量同步」实现上补齐真实外部目录可用的缺口，不重写、不另起炉灶：

- **既有入口与实现保持不变并复用**：`src/core/directory/sync.ts` 的 `buildSyncPlan` / `executeSyncPlan`、`src/renderer/src/workbench/directoryOps.ts` 的 `previewSync` / `applySyncPreview`、`DirectoryView` 工具栏（同步方向 + 增量/镜像 + 预览并同步）与 `DirectorySyncDialog`。不新增路由/视图，不新造同步算法。
- **Dry-run 三组清单准确**：copy / update / delete 三组分别列出条目与 `N 个 · X 字节`，`same` 不进清单，镜像模式下仅目标侧独有文件进删除组；三组常驻显示（空组显示「无」）。
- **删除项默认不勾、未勾选零删除**：镜像预览的删除项初始全部未选中，提供组级「全选 / 清空」与逐项复选框；确认执行只删勾选项；未传 `deletePaths` 时执行不删除任何目标文件（当前 `excluded` 初值为空导致默认全勾，`deletePaths === undefined` 时删除全部，必须反转为安全默认）。
- **底部「本次将执行」汇总与禁用语义**：汇总显示新增/覆盖/已勾选删除的条目数，与实际传给执行器的勾选集合一致；没有任何可执行项（含「只有未勾选的删除项」）时禁用「确认执行」并给出可见原因，避免点了没反应。
- **确认后真实写盘**：经既有 `PlatformPort` 写入真实磁盘（Electron 主进程 IPC），保留相对路径与 ≥4 层目录结构，中文与空格路径不被转义或改名；目标文件内容与源一致。
- **源 mtime 保留与快路径判 same**：真实磁盘 `stat().mtimeMs` 带亚毫秒小数，`new Date(modifiedMs)` 回写会截断到整毫秒（本机 APFS 实测源 `…301.4927` → 目标 `…301`），既有 `size + mtime` 严格等值判断会把刚同步的文件判成 `modified`。必须消除这一幽灵差异，使同步后同一对文件在快路径上判 `same`。
- **完成后自动刷新且计数同源**：`applySyncPreview` 返回的新 `DirectoryComparison` 直接替换当前会话，树/徽章/状态栏/四态与跳过计数全部来自这一次比较，不另算一套。
- **真实磁盘规模集成测试 + 可回归门禁**：新增真实临时目录集成测试（两侧各 ≥1,000 文件、≥4 层嵌套、四态齐备、中文与空格路径），覆盖双向镜像、删除默认不勾/显式全选、mtime 与幂等，并作为独立 gate 登记进 `.munk/code-gates.json`。

## Acceptance Criteria

- ac-plan-three-groups-exact: 在真实临时目录对上，左→右与右→左两个方向的 Dry-run 计划都只产出 copy / update / delete 三类条目；每组的 `count` 等于该组条目数，`bytes` 等于该组条目 `size` 之和，且与磁盘上实际待新增/待覆盖/待删除的文件逐条对应；`same` 文件不出现在任何一组（`same` 数量 = 两侧内容与 mtime 均一致的文件数）。
- ac-delete-default-unchecked: 镜像模式 Dry-run 的删除组初始复选框全部未选中，确认时不勾选任何删除项 → `executeSyncPlan` 的 `deleted` 为 0，目标侧文件列表与执行前逐项一致（零删除）；未传 `deletePaths` 直接调用 `executeSyncPlan` 时同样零删除。
- ac-delete-selected-only: 勾选（逐项或组级全选）后确认执行，只有被勾选的删除项从磁盘消失，未勾选的目标侧独有文件仍在磁盘上，`deleted` 计数等于勾选数，返回的 `affected` 覆盖被删路径。
- ac-real-apply-content-structure: 确认执行后真实落盘：每个 copy/update 项的目标文件内容与源文件 UTF-8 内容完全一致，目标侧相对路径与源侧逐条相同，≥4 层嵌套层级原样保留，含中文与空格的路径（如 `资料 夹/第一层 子目录/第二层/deep 文件.txt`）在磁盘上可被同一相对路径找到。
- ac-mtime-preserved-fast-path-same: 同步完成后，每个被写入的目标文件 `mtimeMs` 与对应源文件按毫秒归一相等（允许平台写入精度归一到毫秒），且对同步后的磁盘重新对比时这些文件判为 `same`、`modified` 集合不含它们。
- ac-refresh-single-source: `applySyncPreview` 返回的 `DirectoryComparison` 的 `counts`（same/added/removed/modified）与 `skipped` / `leftSkipped` / `rightSkipped` 与对同一磁盘状态独立重新 `compareDirectories` 的结果完全相等，且 `copied` / `updated` / `deleted` 与计划中的勾选集合一致。
- ac-idempotent-second-dry-run: 镜像模式删除项显式全选并执行完成后，立即对同一方向重新 Dry-run，`copy.count = 0`、`update.count = 0`、`delete.count = 0`、`totalCount = 0`、`totalBytes = 0`；不因 mtime 精度、路径分隔符或中文/空格路径出现幽灵条目。
- ac-dialog-executable-summary: 预览弹窗底部汇总的「本次将执行」条目数与实际调用 `onConfirm` 的勾选集合一致：只有未勾选删除项时「确认执行」不可点击并显示原因；勾选任一删除项或存在 copy/update 项时可点击；忙碌态下确认按钮禁用并显示进行中文案。
- ac-scale-real-disk-fixture: 新增集成测试只使用真实磁盘临时目录（`mkdtemp`），两侧各 ≥1,000 个文件、至少 4 层嵌套、四态齐备、路径含中文与空格；不使用 `/samples` 内置样本、内存 VFS 或 `.ocsnap` 快照顶替，不 mock 文件系统。
- ac-gate-registered: 上述断言以独立 gate（`sync-real-gate`）登记在 `.munk/code-gates.json`，命令为单 argv 且可单独执行通过；`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 与既有目录、渲染层套件零回归，既有「删除默认勾选」断言必须改写为断言默认不勾，不得删除或弱化。

## Non-Goals

- 不做执行中取消（`AbortSignal`）、失败回滚/备份、目标只读或条目被占用预检、写盘原子性改造、IPC 失败可读中文文案统一——这些失败安全能力不在本阶段，本阶段只在成功路径上保证真实落盘与幂等。
- 不做双向同步与冲突合并、实时监听、定时重扫、远端/SFTP。
- 不清理因镜像删除而变空的目标侧目录（`buildSyncPlan` 只列文件项；三类清单为空不依赖目录清理），不改目录级四态口径。
- 不扩二进制 / 非 UTF-8 字节级拷贝、权限/属主/ACL/符号链接复制（沿用既有文本通道合同）。
- 不改快照 `.ocsnap` 格式、HTML 报告/导出格式、`ComparisonCache` 公开形状、样本 answer key。
- 不新增依赖、不新增第二套磁盘抽象、不让 renderer 直接 `import` Electron；不改工具栏入口与整体布局。
- 不做跨层级模板归位、不做性能优化重构；不做实机 GUI 验收（本项 `needSelfTest=false`）。

## Implementation Constraints

- 技术栈冻结：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide React；不新增依赖。
- 单一同步实现：继续用 `buildSyncPlan` / `executeSyncPlan`；删除语义改为「只有显式传入的 `deletePaths` 才删，缺省 = 零删除」，并在 `sync.test.ts` 中断言该合同。
- 单一磁盘抽象：所有写盘仍走 `PlatformPort`；如扩展通道，Electron / Web 内存 / preload 三处同步补齐，不引入第二套 fs 抽象。
- mtime 归一只允许发生在「size + mtime 快路径」的 mtime 比较上，粒度为毫秒（消除亚毫秒写入精度差）；内容不同仍必须由 SHA-256 确认为 `modified`；不得通过「写入后把目标侧独有文件当 same」等伪造方式凑出空清单。
- 预览弹窗改动保持最小：复用既有 `Dialog` / `ToolbarButton` / token（`text-diff-*`、`tabular`、`focus-ring`），新增文案必须 zh/en 成对并通过既有 `messages.test` 规则（英文词典不得含 Han）。
- 集成测试用真实临时目录与真实主进程 IPC handler（沿用 `src/main/platform/electron-platform.test.ts` 的 electron mock + handler map 模式）；新 gate 脚本命名建议 `pnpm test:sync-real` → `vitest run src/sync-real-gate.test.ts`，登记时命令必须是单 argv（无 `&&`/`|`）。
- 既有断言随合同变更时只允许改成断言新合同；禁止通过删测试、放宽断言或跳过用例来消除回归。
