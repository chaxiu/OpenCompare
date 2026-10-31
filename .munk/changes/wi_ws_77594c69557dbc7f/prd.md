# 同步写坏能恢复：不落临时文件、失败回原样

## Scope

在已交付的「同步取消与失败安全」（`wi_ws_08b7067f448f263b`）之上补三个经代码核实仍未闭合的缺口，只改 `src/core/directory/sync.ts` 的执行/预检细节、`directoryOps.applySyncPreview` 的刷新失败路径与 `Workbench` 的提示，不重写成功路径、不新增第二套同步实现或磁盘抽象：

1. **撤销记录晚于写入（真缺口）**：`writeItem` 目前先 `await writeTextFile(...)`、成功后才 `undo.push(...)`；`src/main/platform/electron-platform.ts` 的 `writeTextFile` 是「同目录 `.tmp` + `rename` → 再 `utimes`」。rename 已落地而 `utimes` 失败时该次写入 reject，目标已是**新内容**却没有撤销记录，回滚不会恢复旧字节与旧 mtime。删除路径同理：`backupTarget → deleteFile → undo.push`，删除已生效而随后的登记/异常窗口没有任何恢复项。
2. **写前可写性判断落盘（真缺口）**：`probeWritableTarget` 每次同步都在目标根**真实写入**一个 `.opencompare-sync-probe-*` 文件再删除，`deleteFile(probe)` 失败时直接抛出并把探测文件留在用户目标树里；现有「只读目标」用例只是恰好因为探测写本身先失败才通过，并未证明预检零落盘。
3. **刷新失败被当成同步失败（真缺口）**：`applySyncPreview` 在 `executeSyncPlan` 成功、`invalidateComparisonCache` 之后执行 `compareRoots`；该刷新失败时抛的是原始 IPC 错误，既不回滚（也不该回滚，写入已落盘）也不说明「写入已完成」。`Workbench.handleConfirmSync` 的 catch 用 `detailNotice(errorText(cause))` 原样显示，可能透出 `Error invoking remote method …`，且预览弹窗保持可重试，会对已落盘的计划二次执行。

## Acceptance Criteria

- ac-undo-before-write: 覆盖类写入（已有目标文件）在调用目标写之前就登记了撤销项——用包装 IO 让 `writeTextFile` **先真实写入再抛错**（模拟 rename 成功后 `utimes` 失败），`executeSyncPlan` reject 后目标文件内容与 `Math.floor(mtimeMs)` 均等于执行前；覆盖与删除两条路径都必须先登记撤销项再动盘。
- ac-postwrite-failure-restores-target: 真实临时目录上注入「写入已落盘后抛出」（对某一 copy 与某一 update 各注入一次，`code: 'EACCES'`）：执行 reject 为 `SyncTargetError`（中文句子 + 路径 + 码，不含 `Error invoking remote method`），目标侧快照（相对路径集合、每个文件字节、毫秒 mtime、目录集合）逐项等于执行前，本次新建的文件与多层目录全部消失。
- ac-preflight-no-target-writes: 目标只读（`chmod`，root 环境跳过该条）与目标被同名目录占用两种拒绝场景下，用记录式 IO 断言 `writeTextFile` 调用次数为 0（预检不落盘、不产生探测文件），拒绝发生在第一个计划写入之前。
- ac-refusal-snapshot-identical: 上述两类拒绝（以及 ac-postwrite-failure-restores-target 的注入失败）执行后，目标树快照逐项等于执行前，且不存在任何 `*.tmp`、`.opencompare-sync-probe-*` 或其它本次新建条目。
- ac-refresh-failure-readable: 写入全部成功、随后刷新对比失败（注入 `listDirectory`/`readTextFile` 在刷新阶段抛 `EACCES`）时，`applySyncPreview` reject 的错误 `message` 是中文句子，明确说明写入已完成，并带出已执行的 copied/updated/deleted 计数（可从错误对象读取且等于实际执行结果），且不含 `Error invoking remote method`。
- ac-refresh-failure-notice: Workbench 在该失败下显示中文通知（明细或词典文案均可），文案同时含「写入已完成」语义与刷新失败原因，不含 `Error invoking remote method`；预览弹窗被关闭，不再提供对同一已落盘计划的「确认执行」；当前目录会话不被替换。
- ac-existing-contracts-kept: 既有失败安全合同不回退——未勾选删除项在失败/取消后 0 删除、取消与失败可区分且取消无系统码、`executeSyncPlan` 省略 `deletePaths` 时零删除；原 `sync.test.ts`「refuses an unwritable target root」等断言升级为新缝后仍通过（不得删除、跳过或放宽）。
- ac-gate-green: 上述新断言并入已登记的 `sync-real-gate`（`pnpm test:sync-real`，`.munk/code-gates.json` 不新增矩阵项）与既有单元/渲染层套件；`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `sync-real-gate` 全绿，`pnpm test:sync-real` 时长保持在既有 20–40 秒量级（单例 ≤ 200 文件的真实目录）。

## Non-Goals

- 不重写成功路径：`buildSyncPlan` 语义、三组清单、删除默认不勾、mtime 毫秒归一、刷新同源口径不动。
- 不做双向同步、冲突合并、实时监听、定时重扫、后台守护、远端/SFTP。
- 不改四态口径（`same`/`added`/`removed`/`modified`）、`.ocsnap` 快照格式、报告/导出格式、`ComparisonCache` 公开形状、样本 answer key。
- 不扩二进制 / 非 UTF-8 字节级拷贝，不复制权限/属主/ACL/符号链接。
- 不做刷新失败后的自动回滚（写入已落盘，回滚是错误语义）；不做刷新重试/后台补偿。
- 不新增依赖、不新增第二套磁盘抽象或同步算法，不让 renderer 直接 `import` Electron；不改工具栏入口、路由与整体布局。
- 不做实机 GUI 验收（`needSelfTest=false`），不动 tag / Release / 资产。

## Implementation Constraints

- 单一同步实现：缺口 ①② 只在 `src/core/directory/sync.ts` 内修（预检、`writeItem`、删除分支、`rollback`），不另写执行器；`applySyncPreview` 只补刷新失败分支。
- 撤销登记顺序：`undo.push` 必须在目标写/删**之前**完成；用于回滚的撤销动作必须容忍「目标本就不存在 / 回滚本身被拒」（`ENOENT`、`EACCES` 等一律吞掉，不掩盖原始错误），成功路径不残留任何撤销产物。
- 可写性判断不落盘：优先给 `SyncIo` 与 `PlatformPort` 增加一个非落盘的可写检查能力（Electron 侧用 `fs.access(path, W_OK)` 一类实现），并同步补齐 `src/shared/platform/types.ts`、`channels.ts`、`src/preload/index.ts` 白名单、Electron handler 与 Web 内存实现；若坚持保留探测文件方案，必须删掉 `.tmp`/探测残留风险并让 ac-preflight-no-target-writes 仍成立（即探测不得经目标写通道落盘）。`SYNC_WRITE_PROBE_PREFIX` 与现有探测逻辑的清理不得留下死代码。
- 刷新失败语义：在 `directoryOps` 用一个可辨识的错误形态（如携带 copied/updated/deleted 计数的专用错误）表达「写入已完成、仅刷新失败」，`readableSyncFailure` 的 IPC 前缀剥离要覆盖刷新路径；文案中文句子 + 路径/原因，新增 UI 文案 zh/en 成对且英文词典不含汉字。
- 测试落位：真实磁盘用例并入 `src/sync-real-gate.test.ts`（沿用 `vi.mock('electron')` + handler map + `mkdtemp` 模式，不 mock 文件系统，不新增 code-gates 矩阵项）；核心执行器行为在 `src/core/directory/sync.test.ts` 补；刷新失败提示在渲染层 L2 用例（Workbench dom，参照 `DirectoryReportExport.test.tsx` 的假平台写法）。
- 只读用例用 `chmod` 构造，root 身份下 `skipIf`，不得让门禁长期红。
- 基线为当前 `refs/heads/main` tip（`6fcd9f8`）；main 上未发布 commit 在交接中逐条写「未发布：`<sha>` `<标题>` `<原因>`」。
