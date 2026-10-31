# 同步取消与失败安全收口

## Scope

在上一阶段（`wi_ws_7efd09ed8abe2eda`）已闭环的「真实外部目录单向/镜像同步成功路径」之上，只补失败安全这一层：真实同步在执行前做预检、执行中逐项原子写、失败或取消时按逆序回滚并清理本次产生的临时文件与新建目录，全程不动未勾选项，失败/取消后会话与界面状态保持、可重试。

具体：

- **写前预检**：动手写任何一项之前，先判断目标根可写、每个目标位置当前形态（缺失 / 文件 / 目录）；目标只读、目标位置被同名目录或非文件条目占用、父级不是目录时立即失败，不产生任何写入。
- **逐项原子写**：每次写入先在目标同目录落临时文件再 `rename` 覆盖，失败时清理临时文件；任何时刻目标侧不出现半写（零字节 / 截断）文件。当前主进程 `writeTextFile` 的 handler 是直写 `writeFile`，同步写入路径必须获得原子语义。
- **失败/取消逆序回滚**：本次已覆盖或已删除的项按逆序恢复为执行前的字节与 mtime，本次新建的文件与目录（含多层父目录、含 `materialize` 临时沙箱根）按逆序删除；回滚结束后目标侧与执行前逐项一致，不存在半棵树、临时文件或残留空目录。
- **执行中取消**：把取消信号贯通 `applySyncPreview` → `executeSyncPlan` → 单次写入之间，取消与失败走同一回滚路径，但结果/提示可区分。
- **未勾选项零操作**：镜像删除仍只接受显式勾选集合；失败或取消时，未勾选的删除项在目标侧原样留存。
- **可读失败提示**：失败提示为中文可读句子，含目标路径与系统错误码（`EACCES` / `EPERM` / `EISDIR` / `EROFS` / `EBUSY` / `ENOTDIR` 之一），渲染层不把 `Error invoking remote method ...` 原样抛给用户。
- **状态保持与重试**：失败或取消后当前目录会话不被替换（树、选中行、过滤器、滚动位置不重算），预览弹窗保留可重试，`busy` 复位；重新 Dry-run 基于真实磁盘重新对比，不沿用上一次计划的缓存结论。
- **门禁**：上述失败安全断言以真实临时磁盘测试落到已登记的 `sync-real-gate`（`pnpm test:sync-real`）中，并在全量 `code_gates` 下通过。

## Acceptance Criteria

- ac-preflight-unwritable-target: 在真实临时目录对上，目标目录执行前用 `chmod` 去掉写权限（非 root 运行）后执行同步：执行被拒绝，且被拒绝发生在任何一项写入之前——用 `stat`/内容快照断言目标侧文件列表与执行前逐项一致（相对路径集合、字节内容、`mtimeMs` 全等），目标树内不存在任何 `*.tmp` 或其它本次新建条目。
- ac-preflight-occupied-target: 计划生成后、执行前，把某个待 copy 的目标路径替换为同名**目录**：执行失败，目标侧快照与执行前逐项一致，失败路径上的同名目录仍在且内容未被改动，无临时文件残留，且没有出现"前面若干项已写、后面失败"的部分写入。
- ac-atomic-write-no-partial: 单次写入失败（目标位置被目录占用 / 目标目录只读）时，目标侧不出现零字节或截断文件；任何目标路径上的内容要么是执行前内容，要么是完整源内容；执行目录内不残留 `*.tmp` 文件（成功路径同样不残留）。
- ac-rollback-on-failure: 用可控 IO/真实磁盘让计划在中间某项失败（前若干 copy/update 已成功、若勾选删除则部分删除已执行），执行 reject；随后断言目标侧恢复为执行前状态：已覆盖文件内容与 `mtimeMs` 逐项等于执行前，已删除文件全部重现且内容与 mtime 一致，本次新建的文件与（多层）目录全部消失，目标根下不存在仅由本次新建的空目录。
- ac-cancel-mid-plan: 计划执行中途触发取消（取消信号在第 N 项写入前触发），执行以"已取消"结束而非成功；目标侧逐项恢复为执行前状态（同 ac-rollback-on-failure 的逐项断言），无半写文件、无 `*.tmp`、无半棵树，本次新建目录被移除。
- ac-cancel-signal-observable: 取消结果与失败结果在调用方可区分（取消返回/抛出可辨识的取消标志，且不带系统错误码）；取消后立刻对同一对目录重新 `buildSyncPlan`/Dry-run，得到的 copy/update/delete 清单与该时刻真实磁盘一致（例如失败前已回滚的 copy 项重新出现在 copy 组，且 `totalCount` 与该时刻实际差异文件数相等）。
- ac-unchecked-untouched: 镜像模式下不勾选任何删除项执行失败或取消后，所有计划删除项在磁盘上仍存在且内容/`mtimeMs` 不变；成功路径下未勾选删除项同样零删除（沿用前序合同，回归断言不得弱化）。
- ac-readable-error-with-code: 目标只读、目标被目录占用两类真实失败产生的错误 `message` 为中文句子，包含目标路径与该次系统错误码（可断言 `EACCES`/`EPERM`/`EISDIR`/`EROFS`/`EBUSY`/`ENOTDIR` 中出现对应项），且 `message` 不含 `Error invoking remote method` 字样；取消产生的提示中不出现系统错误码。
- ac-session-state-preserved: 失败或取消时 `applySyncPreview` 不产出新的 `DirectoryComparison`，调用方会话不被替换（当前会话 id、对比树、四态计数与执行前同一对象/同一值）；`busy` 复位为 `false`，预览弹窗保持打开且"确认执行"重新可用，执行中"取消"按钮可用（不被 `busy` 禁用）。
- ac-gate-registered: 上述失败安全断言由 `.munk/code-gates.json` 中已登记的 `sync-real-gate`（`pnpm test:sync-real`，单 argv 无 `&&`/`|`/`;`）实际执行；若确需新增门禁项，必须同步更新 `src/munk-gates.test.ts` 的门禁矩阵断言；`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 与既有目录、渲染层套件全绿，既有断言只允许升级为新合同（不得删除、跳过或放宽）。
- ac-gate-runtime-budget: 新增失败安全用例使用小规模真实目录（单例 ≤ 200 文件），`pnpm test:sync-real` 整体运行时长保持在既有 20–40 秒量级的可接受区间（不因失败用例把门禁拖到分钟级）。

## Non-Goals

- 不重写成功路径：`buildSyncPlan` 语义、三组清单、删除默认不勾、mtime 毫秒归一、刷新同源口径保持不动，只在其上加失败安全能力。
- 不做双向同步、冲突合并、实时监听、定时重扫、后台守护、远端/SFTP。
- 不改目录对比四态口径（`same`/`added`/`removed`/`modified`），不改 `.ocsnap` 快照格式、HTML 报告/导出格式、`ComparisonCache` 公开形状、样本 answer key。
- 不扩二进制 / 非 UTF-8 字节级拷贝，不复制权限 / 属主 / ACL / 符号链接（沿用文本通道合同）。
- 不清理因镜像删除而变空、且执行前就存在的目标目录（前序非目标延续）；本项只清理"本次执行新建"的目录。
- 不新增依赖、不新增第二套磁盘抽象或第二套同步算法，不让 renderer 直接 `import` Electron；不改工具栏入口、路由与整体布局。
- 不做性能优化重构，不做实机 GUI 验收（`needSelfTest=false`，浏览器/设备/桌面点击验收不在本项）。
- 不动任何已公开 tag / Release / 资产，不 push tag、不 dispatch。

## Implementation Constraints

- 单一同步实现：继续在 `src/core/directory/sync.ts` 扩展 `SyncIo` / `SyncExecutionOptions` / 执行结果形状（如取消信号、备份与回滚钩子、区分取消与失败的结束形态）；禁止在 renderer 或 main 另写一套同步算法。
- 单一磁盘抽象：一切写盘仍经 `PlatformPort`；若需新能力（原子写、可写探测、建/删目录），必须同时补齐 `src/shared/platform/types.ts`、`src/shared/platform/channels.ts`、`src/preload/index.ts` 白名单、Electron handler（`src/main/platform/electron-platform.ts`）与 Web 内存实现（`src/renderer/src/platform/web-platform.ts`），并保持 `PlatformPort` 单一形状。
- 原子写：主进程已有 `writeFileAtomically`（同目录临时文件 + `rename`，失败清理临时文件），同步写入路径必须取得同等语义；不要引入 `EXDEV` 跨设备回退，临时文件始终与目标同目录。
- 取消语义：沿用核心既有取消词汇（`OperationCancelledError`，见 `src/core/io.ts`）与"取消不跨越 IPC handler 边界"的既有约定；`applySyncPreview` 至少接受可选的 abort 信号，并把它贯通到逐项执行的检查点。
- 回滚备份：机制（内存文本备份 / 目标侧临时备份目录 / 预检 + 原子写）由 Coding 按最小改动选择，但必须满足"失败/取消后目标逐项回到执行前、无临时残留、无本次新建目录"，且成功路径不残留任何备份或临时条目。
- 错误文案：复用主进程既有 `describeFileSystemCode` / `readableWriteFailure` 风格（中文句子 + 路径 + 码），IPC handler 不把原始 `Error invoking remote method ...` 透给用户；新增 UI 文案必须 zh/en 成对，英文词典不得含汉字（沿用 `messages.test` 规则）。
- 弹窗改动保持最小：复用既有 `Dialog` / `ToolbarButton` / token；仅需让"执行中取消"可用、失败后可重试、失败原因可见（就地提示或 workbench notice 均可，但必须是中文可读句子）。
- 门禁：把失败安全用例并入 `src/sync-real-gate.test.ts`（已登记为 `sync-real-gate`），优先不新增 `code-gates.json` 矩阵项（每加一项全量门禁就多付一次真实落盘成本）；测试不得 mock 文件系统，沿用现有 `vi.mock('electron')` + handler map + `mkdtemp` 真实临时目录模式。
- 只读目录用例用 `chmod` 构造；若运行身份为 root（权限断言无意义）需显式跳过该条并保留其余断言，不得让门禁长期红。
- 基线为当前 `refs/heads/main` tip；交付后 main 上未发布的 commit 在交接中逐条写"未发布：`<sha>` `<标题>` `<原因>`"。
