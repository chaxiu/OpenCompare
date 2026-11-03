# Domain: directory

目录域：`src/core/` 纯算法目录对比引擎（相对路径配对、四类状态、大小/mtime 短路 + SHA-256 内容确认、增量缓存），双栏目录对比视图（展开/折叠、逐行徽章、目录后代聚合计数、五档过滤、百万级窗口化），取数与下钻（真实目录 / 内置样本；双击差异文件下钻并可一键返回且往返不丢目录树状态）。在只读对比之上还承载两项高阶目录操作：**文件夹单向增量复制 / 镜像同步（Dry-run 预览后写入）** 与 **跨层级散乱目录树按模板归位 / 提取器**。本域不做文件级差异算法本体（行级 / 3-way merge 归代码域）。

## 范围

- **对比引擎（`src/core/directory/`，纯算法，零 Electron/DOM）**：经 `PlatformPort` 递归扫描左右两棵树，按**相对路径**配对；每文件产出 `same` / `added`（右独有）/ `removed`（左独有）/ `modified`，目录状态由后代聚合。先比 size、再比 mtime，都不足以判定才经 `digestFiles` 对**原始字节**取 SHA-256 确认；已比对条目按 `(path, size, modifiedMs)` 缓存，重复比对不重复读内容。
- **视图与窗口化**：左右双栏树、展开/折叠、`DiffBadge` 语义徽章、目录行聚合计数、五档过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同，过滤后保留匹配项及其祖先）。`src/core/directory/rows.ts` 的 `buildDirectoryRowModel(root, filter, side, collapsedPaths)` 一次前序遍历产出可视行索引（只持节点引用），`TreeView` 用 `@tanstack/react-virtual` 只渲染视口 + `ROW_OVERSCAN = 10`，总高 = 行数 × `DIRECTORY_ROW_HEIGHT`（24px）。
- **超大行数滚动映射**：`rows.length * 24` 超过浏览器布局上限（2^24 px）会静默截断尾部（实测 1,516,096 行时 53.9% 不可达）；`DIRECTORY_MAX_TREE_HEIGHT = 16_777_215` + `createDirectoryScrollMap(rowCount, viewportHeight)` 在未超限时退化为恒等映射（`row * 24`），超限时容器钉在该高度、每行共享可达偏移（`offsetForIndex` 严格递增、末行落在 `maxScrollOffset`），`rowPositionForOffset` / `rowTop` 驱动渲染窗口。
- **取数与下钻**：左右各经 `PlatformPort.selectDirectory` 选真实目录（Web 降级提示）；内置样本目录一键加载。双击差异文件按类型下钻（代码/文本 → `CodeView`；CSV/TSV → `CsvView`；JSON/YAML → `StructuredView`；单侧独有则另一侧为空），生成 `file:{parentId}::{relativePath}` 会话并记 `parentDirectoryId`——两个目录会话对同一相对路径互不覆盖；文件视图顶部「返回上级目录视图」一步回到来源会话，`resolveDirectoryReturn(sessions, sourceId)` 决定落点（来源 → 其他可用目录会话 → `null` 并提示）。
- **往返状态保持**：过滤档、折叠集合、左右滚动位置、选中项由工作台壳层按目录会话 id 保存并受控回填（受控 props + `useLayoutEffect`），下钻卸载重建后原样恢复，不同会话互不串味；仅运行期内存，不跨重启。
- **同步计划与执行器**：`buildSyncPlan` 按方向产出 `copy` / `update` / 镜像模式 `delete`（默认不勾、可逐项或组级全选），带逐项路径 / 字节与分组汇总；`executeSyncPlan` 经 `PlatformPort` 写真实磁盘、自动建父目录，镜像删除**只删显式传入的 `deletePaths`**（缺省 / 空集零删除），写入后使受影响路径的比对缓存失效，同方向重复执行后计划为空（幂等）。
- **Dry-run 弹窗与可执行判定单一来源**：`workbench/directoryOps.ts` 的纯函数 `syncPreviewAction(preview, deletePaths)` 一次给出 copy / update / delete（只数已勾且确在 delete 组的路径）/ align 计数、`planned` 与 `executable`；摘要句、删除分组「已选 N」、确认按钮 `disabled`、`sync-real-gate` 断言全读这一份，`canApplySyncPreview` 委托它。`syncPreviewGuidance` 返回 `changes` / `empty` / `noExecutable` 三态（有待对齐链接时必为 `changes`）；待对齐链接是独立第四组；无任何可执行项时确认禁用并给原因，忙碌态禁用确认且「取消」变为中止执行；取消不写任何文件；成功后自动重跑对比并替换会话。
- **写盘保真与失败安全**：`SyncIo` 全程原始字节（`readFileBytes` / `writeFileBytes`），覆盖 / 删除前备份与回滚重建同路径（PNG / 非 UTF-8 字节逐字节一致）；主进程 `writeFileAtomically`（同目录临时文件 + `rename`）与 mtime 整毫秒回填共用一条实现（`Math.floor(ms)` 比较，亚毫秒差不误判 `modified`）。执行前整轮预检（`checkWritable` 只问不写 → 父链逐层目录 → 同名目录 `EISDIR`），**零写入**；逐项原子写、撤销动作先入栈再动盘、失败 / 取消逆序回滚（单步失败不中断、容忍 `ENOENT` / `EACCES`）、成功路径零 `.tmp`。
- **错误语义与可读提示**：取消为 `OperationCancelledError`（`name` / `code === 'ECANCELED'`、不带系统码），失败为 `SyncTargetError`（目标路径 + OS 码），写后校验不一致为 `SyncVerificationError`（**不回滚**，带 `mismatched` / `paths` / 刷新后 `comparison`），仅刷新失败为 `SyncRefreshError`（写入已完成，带三项计数，不回滚）；渲染层按 `SyncTargetError.path` / `.code` 经 `syncFailureCopy` 映射到 `shell.sync.*` 词典，剥掉 `Error invoking remote method` 包装；失败 / 取消不替换会话、弹窗保留可重试；刷新失败则关闭已落盘预览并提示写入已完成。
- **符号链接口径（归 `symlink-semantics` 域）**：`scanDirectory` 把链接作为叶节点（`linkTarget` / `linkTargetKind`），不跟随、不展开、不占 `index`、不取目标正文摘要；对比按目标串出四态，链接 vs 普通项 → 单条 `modified`。同步对链接按字面串创建（相对不解析、悬空照建、不写穿），目标侧已有条目按原形态备份 / 恢复；两侧链接 target 相同、仅 lstat mtime 不同时经 `setSymbolicLinkModifiedMs`（`lutimes`）对齐，清单在预览期生成（`SyncPreview.linkAlignments`），不计入 copied / updated / deleted。
- **模板归位匹配与计划**：以模板 A 的相对路径槽位为骨架，用「文件名 + SHA-256」从散乱树 B 匹配，产出 `matched` / `missing` / `conflict(content-mismatch|ambiguous)` / `unused`；`createTemplatePlan` 展开为恰好一条 `matched` / `placed` / `missing` / `conflict`（`unused` 单列），带源 sha256、`modifiedMs`、`overwrite`、`occupiedByDirectory`、`defaultChecked`，构建零磁盘访问（覆盖检测来自注入的 `existingFiles` / `existingDirectories` / `existingFileHashes`）；内容相同的已落位槽位判 `placed`（既不 executable 也不 rejected，永不写）。
- **模板归位解析 / 执行 / 复核**：`resolveTemplatePlan` 是唯一可执行清单出口（只有已勾 `matched` 与「已勾且候选在集内」的 `conflict` 可执行；重复勾选收敛、同源保留路径排序第一条、输出按 `relativePath` 稳定排序）；`executeTemplatePlan` 只写 `executable`，按源 `modifiedMs` 落盘，源漂移零写入记 `source-drift`，取消只停在未开始条目（预取消零写入零建目录）；`verifyTemplateExtraction` 逐条按父目录列表判存在 / 目录占用、按 `sha256Hex` 重算、`mtimeSec` 秒级比较。
- **模板归位入口与动作**：对话框两步（选根 → Dry-run）+ 第三态结果；A 只读，B / 输出根支持选择、拖入、键入（复用 `normalizePathValue` + `homeDirectory`），根冲突以稳定 `TemplateRootError` 码拒绝且零扫描零写入。行级动作严格 `copy | move`（默认 copy，移动必须显式勾选），`resolveTemplatePlan` 的 `actions` / `copyCount` / `moveCount` 是唯一来源；移动按「写目标 → 重读存在 + sha256 + mtime 与**当前源**比对 → 删除计划记录的 `sourcePath`」执行，任一校验失败保留源与目标并继续后续行，不删模板 A / 输出根文件；结果清单按路径去重、带动作与源删除状态；重扫清空勾选 / 移动 / 候选选择。
- **大小写折叠与路径越界**：`foldCase` 是唯一折叠口径（精确候选优先，无精确才回退；唯一命中且 hash 相同 `matched` / 不同 `content-mismatch` / 多 case 变体 `ambiguous`；输出根同理 `placed` / `overwrite` / `occupiedByDirectory`，多变体永不猜）；`templatePathIssue` 是唯一路径判定（空串 / 绝对路径 / 盘符 / UNC / `..` / 落在根自身 → `path-escape`），计划默认不勾、解析 `rejected`、执行零写入且其余行继续；折叠只用于比较，不参与写盘路径构造。
- **批量取数、并发、进度与取消**：`scanDirectory` 改为队列 + 批量 `listDirectories`（`DEFAULT_DIRECTORY_BATCH_SIZE = 8`）+ `mapWithLimit`（`DEFAULT_TRAVERSAL_CONCURRENCY = 16`）；批量只改取数方式，树结构 / 排序 / 四态 / `skipped` 口径与串行一致，槽位缺失即整次 reject 不返回部分树。可选 `onProgress` 每结算一个真实批次回报一次（`files` / `bytes` 为跨相位单调不减的流水线累计，`phaseFiles` / `phaseBytes` 为相位内增量）；摘要按 `DEFAULT_DIGEST_BATCH_SIZE = 64` 分块。核心层 `signal` 在批次边界检查，在飞批次经 `abortable` 竞速立即 reject，取消绝不返回部分结果、不计 `skipped`、不写未结算块缓存。
- **横切契约**：内容读取有界并发与句柄错误归 `io-concurrency`；字节摘要归 `content-digest`；不可读项容错（`leftSkipped` / `rightSkipped`、坏项不进状态计数）归 `io-tolerance`；视图面文案经 `useI18n().t(...)` 渲染、词典归 `i18n`；HTML 报告归 `directory-report`；新增平台能力（`readFileBytes` / `writeFileBytes` / `setSymbolicLinkModifiedMs` / `checkWritable`）归 `foundation`。

## 验收

- **ac-engine-classify / ac-engine-incremental**：按相对路径配对产出四类状态，靠 SHA-256 判定「size 相同内容不同」；size + mtime 相同的文件对不读内容即判 `same`，重复比对不重复读数 / 哈希（计数桩可验）。
- **ac-tree-ui / ac-filter / ac-runtime-stats**：双栏树可展开/折叠、逐行徽章、目录行显示后代聚合计数；五档过滤切换后只留匹配项及祖先；统计全部来自运行时比较（样本 answer key 不再作输入）。
- **ac-local-directory / ac-sample-directory**：Electron 下左右各选真实目录并对比（Web 有可理解降级）；内置样本一键加载，`pnpm dev` 与 `pnpm dev:web` 均可复现。
- **ac-drilldown-code / ac-drilldown-typed / ac-drilldown-opens-file-view**：双击差异代码/文本、CSV/TSV、JSON/YAML 分别下钻到对应视图并携带左右内容（单侧独有另一侧为空），每个下钻独立会话且目录标签仍在。
- **ac-back-to-parent-directory / ac-roundtrip-repeatable / ac-drilldown-isolation / ac-parent-fallback**：文件视图有明确返回导航且可反复往返；两个目录会话对同一相对路径下钻互不覆盖；来源会话不可用时落到可用目录会话并提示，不崩溃。
- **ac-filter-preserved / ac-expand-preserved / ac-scroll-preserved / ac-selection-preserved**：往返后过滤档、折叠集合、左右滚动位置、选中项与高亮全部保持，不重置为全展开。
- **ac-windowing-bounded / ac-scroll-map-full-reach / ac-windowing-semantics-kept**：DOM 行数与总条目解耦、`role="tree"` / `aria-level` / `title` 契约不变；`DIRECTORY_MAX_TREE_HEIGHT` 下尾部行可达、`offsetForIndex` 严格递增且末行落 `maxScrollOffset`；五档过滤、投影、折叠、选中、下钻与四态计数与改造前逐项相等。
- **ac-sync-plan / ac-sync-plan-same-modified / ac-plan-three-groups-exact**：计划按方向产出 copy / update（镜像含 delete），`same` 不进清单，分组 `count` / `bytes` 与实际磁盘逐条对应，左右方向互为镜像。
- **ac-sync-dryrun-dialog / ac-dialog-executable-summary / ac-only-unchecked-delete-blocked**：弹窗常驻三组 + 待对齐链接组，摘要与传入勾选集合同源；只有未勾删除项时确认禁用并给原因；忙碌态禁用确认并显示进行中文案。
- **ac-sync-apply-refresh / ac-idempotent-second-dry-run / ac-refresh-single-source**：确认后真实写入、自动重跑对比并刷新（`counts` / `skipped` 与独立重算完全相等），同方向再执行计划为空（不因 mtime 精度 / 分隔符 / 中文空格路径出现幽灵条目）。
- **ac-sync-mirror-delete / ac-delete-default-unchecked / ac-delete-selected-only / ac-unchecked-untouched**：镜像删除初始全部未勾；未传 `deletePaths` 或空集零删除；只删勾选项，未勾项内容与 mtime 不变；口径不得回退为「默认勾选」。
- **ac-real-apply-content-structure / ac-mtime-preserved-fast-path-same / ac-binary-* **：落盘相对路径与 ≥4 层嵌套保真、中文与空格路径可定位、UTF-8 与二进制（含 `0x00` / 非 UTF-8 / 0 字节）逐字节一致；写入后按毫秒归一相等且重新对比判 `same`，内容不同仍必须 SHA-256 确认。
- **ac-preflight-unwritable-target / ac-preflight-occupied-target / ac-preflight-no-target-writes / ac-refusal-snapshot-identical**：只读根与同名目录占用在第一个写入前拒绝，`writeTextFile` 调用 0 次、目标快照逐项等于执行前、无 `*.tmp` / 探测文件残留。
- **ac-atomic-write-no-partial / ac-undo-before-write / ac-postwrite-failure-restores-target / ac-rollback-on-failure**：任何失败点都不出现零字节 / 截断文件；覆盖与删除在动盘前登记撤销项（含「rename 成功而 utimes 失败」「delete 先删再抛」），失败后已覆盖内容与 mtime 复原、已删文件重现、本次新建文件与多层目录消失，同一 preview 可立即重试成功。
- **ac-cancel-mid-plan / ac-cancel-signal-observable / ac-cancel-from-dialog-aborts**：执行中取消按同一撤销路径回滚、无半写 / 无 `.tmp`；取消拒绝形态与失败可区分且不带系统码；弹窗「取消」调用 `abort()` 而非关闭弹窗，取消后立即 Dry-run 反映真实磁盘。
- **ac-session-state-preserved / ac-cancel-session-preview-preserved / ac-failure-session-preview-preserved / ac-retry-after-failure**：失败 / 取消不替换会话、`busy` 复位、弹窗保留可重试且确认可用；同一弹窗重试成功后关闭并提示、会话被新比较替换。
- **ac-readable-error-with-code / ac-cancel-notice-readable / ac-failure-notice-readable / ac-preview-failure-no-ipc-wrapper / ac-refresh-failure-readable / ac-refresh-failure-notice**：失败提示为中文句子含路径与对应 OS 码、不含 `Error invoking remote method`；取消提示含「同步已取消 / 已回滚」且无系统码；刷新失败用 `SyncRefreshError`、提示写入已完成 + 三项计数并关闭已落盘预览。
- **ac-symlink-same-aligned-mtime / ac-symlink-write-no-follow**：链接按字面串创建 / 备份 / 恢复、绝不写穿；仅 mtime 秒级差异的两链接对经 `lutimes` 对齐（不计入三计数、不入 plan item），对齐后二次 Dry-run 为空且 `canApplySyncPreview === false`。
- **ac-template-match / ac-placed-same-content / ac-placed-conflict-candidate / ac-counts-single-source**：文件名 + sha256 匹配产出四类；目标已存在且摘要等于可用源判 `placed`（不勾、永不执行），`templateFileCount === matched + missing + conflict + placed`。
- **ac-template-plan-single-source / ac-plan-single-source / ac-default-checked-set**：`resolveTemplatePlan` 是唯一可执行清单，分区计数 / 可执行数 / 写入集合 / Apply 禁用同读它；matched 且无覆盖、未被目录占用才默认勾选，`overwrite` / `conflict` / `missing` / `occupiedByDirectory` 默认不勾。
- **ac-execute-verify / ac-gate-sha-mtime-tamper / ac-cancel-zero-write**：只写 `executable`、按源 `modifiedMs` 落盘、逐条重算 sha256 与秒级 mtime；篡改 / 删除 / 前移 ≥1 秒分别报 `hash` / `missing` / `mtime`，亚秒差不报；预览后不执行 / 预取消 / Dry-run 取消三路径零 `writeTextFile` / `ensureDirectory` / `deleteFile`。
- **ac-name-casefold-match / ac-name-exact-priority / ac-name-multi-variant-ambiguous / ac-plan-case-* / ac-verify-casefold-ok / ac-verify-still-strict**：精确优先、折叠回退、多变体永不猜；写后复核用 listing 的实际路径读内容（`Logo.png` 写在 `logo.png` 上仍 `ok`），`hash` / `mtime` 判据不放宽。
- **ac-path-reject-list / ac-path-plan-non-executable / ac-path-resolve-reject / ac-path-execute-refuses / ac-path-shared-predicate**：`templatePathIssue` 对空串 / 绝对路径 / 盘符 / UNC / `..` / 根自身返回 `path-escape`，默认不勾、解析 `rejected`、执行零写入，三道闸共用一条谓词。
- **ac-action-set-exact / ac-single-source-action-executable / ac-default-copy-source-untouched / ac-move-requires-explicit-selection**：动作仅 `copy | move`，`actions` 覆盖全部有源行；未勾选行恒 `copy`，`movePaths` 只对已勾可执行行生效，默认执行后 B 逐文件不变且零删除；整批「设为移动」只重标已勾可执行行、绝不自动勾选。
- **ac-move-write-verify-delete-order / ac-move-verify-fail-keeps-source / ac-move-delete-fail-keeps-source / ac-no-rollback-successes**：写后校验与结果复核共用同一判定函数；校验失败不调用 `deleteFile`、源与目标均保留；删源失败记 `move-delete-failed` 且源保留；无 `.tmp`、不回滚已成功行。
- **ac-result-matches-disk / ac-rescan-same-session / ac-rescan-zero-residue / ac-placed-after-move**：结果为每个成功目标恰一条（去重）并带动作与源删除状态；重扫清空勾选 / 移动 / 候选，移动成功源从 B 消失、槽位判 `placed` 且默认不勾，残留 0。
- **ac-scale-real-disk-fixture / ac-gate-registered / ac-gates**：`sync-real-gate` 用真实 `mkdtemp`（两侧各 ≥1,000 文件、≥4 层、四态齐备、中文与空格路径），不 mock 文件系统、不用 `/samples`；五条模板门禁 + `sync-real-gate` 为单 argv 矩阵项；`pnpm typecheck` / `lint` / `test` / 各门禁全绿。

## 非目标

- **不做文件级差异算法本体**：行级 / 行内 diff、3-way merge、CSV 主键对齐、JSON/YAML 语义归一化归对应域；下钻只把内容带入视图只读呈现。
- **不做双向 / 三向同步**：同步为单向覆盖；不做内容级合并冲突策略、回滚备份目录 / 版本历史 / 回收站、暂停 / 恢复 / 断点续传、取消后自动重试、跨设备（`EXDEV`）回退、刷新失败后的自动回滚或重试。
- **不清理镜像删除产生的空目录**（只清理本次执行新建的目录）；权限 / 属主 / 模式位 / ACL 复制不做；目标同路径是真实目录时按 `EISDIR` 拒绝，不做类型替换。
- **不做持续 / 定时自动同步与 watcher**，不做增量重扫调度；同步按需触发。
- **不做模板归位的模糊 / 相似度匹配**：仅精确文件名 + SHA-256（含大小写折叠回退），不做重命名识别、路径占位符模板、正则 / 脚本模板引擎、冲突合并、实时监听与远端。
- **模板归位不做执行中途的 UI 级取消**（纯核 `AbortSignal` 契约保留但不接 UI）；失败不回滚已写条目（只保证未勾项零写入、当前条目无半成品）；不把输出根作为右侧建新对比或自动刷新右侧树。
- **不做目录级下钻与导航栈**：不做面包屑、前进 / 后退历史、键盘导航、右键菜单、多选 / 区间选择；往返状态不跨重启持久化，不引入全局状态库。
- 不做会话关闭与未保存提示、原位保存与结果导出（属会话 / 保存子项）；不做三向或超过两个目录的对比；不做快捷键、命令面板、主题切换；不做打包分发与发布。
- **不新增默认忽略规则**：`.git` / `node_modules` / 隐藏文件照列；不把不可读条目 / 不可列子树改成整次失败，不把 `EMFILE` / `ENFILE` 吞成 `skipped`；符号链接只计 1 条叶条目。
- 不新增 `webContents.send` 类 main → renderer 进度事件；不新增持久化缓存、不改缓存键 `(path, size, modifiedMs)`；平台读通道保持字节缝，不退回文本穿行。
- 不把 `ScannedTree` / `DirectoryComparison` 搬去主进程或 worker；不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP；不假装虚拟化（不先全量渲染再隐藏、不缩减 fixture 达标）。

## 实现约束

- 技术栈冻结：Electron + electron-vite + React 19 + TS + Tailwind v4 + Lucide；不引入第二套 UI / 样式方案；token 唯一来源 `src/renderer/src/assets/main.css`，差异色走 `--color-diff-*`。
- 分层：目录对比 / 同步 / 模板算法在 `src/core/directory/`，零 Electron / DOM / `node:*` 依赖，纯函数或「纯函数 + 注入 IO」；renderer 只经 `PlatformPort`，新能力同时补 Electron IPC 与 Web 内存实现并登记 `channels.ts` 白名单。SHA-256 必须跨 Node / 浏览器 / renderer 可用（核心比对保持同步纯函数）。
- **同源判定只留一处**：`syncPreviewAction`（可执行 / 计数 / 摘要）、`syncPreviewGuidance`（三态文案）、`resolveTemplatePlan`（可写集合 / 动作）、`foldCase`（折叠）、`templatePathIssue`（越界）、`buildDirectoryRowModel` / `createDirectoryScrollMap`（行模型与滚动映射）各只有一个实现，UI / 门禁 / 执行器全部复用；禁止内联第二份。
- **删除语义单一实现**：`deletePaths` 缺省 = 零删除在 `sync.test.ts` 内直接断言；非镜像分支传 `[]` 而非 `undefined`；任何调用点不得因漏参删目标文件。
- **失败安全只在 `src/core/directory/sync.ts` 扩展**：`SyncIo` 提供 `removeDirectory` / `statPath` / `listDirectory` / `checkWritable`（只问不写，禁止探测文件），`signal` 贯通到每项检查点；三种错误类型（`SyncTargetError` / `SyncVerificationError` / `SyncRefreshError`）不得混用；回滚备份字节保真、撤销先入栈再动盘、逆序执行且单步失败不中断。
- **mtime 归一只用于 size + mtime 快路径**，粒度 `Math.floor(ms)`；Electron 回填用数值秒 + 亚微秒抬升；内容不同仍须 SHA-256 确认，禁止用 mtime 伪造 `same`。
- **原子写单一实现**：`platform:write-text-file` / `writeFileBytes` 共用主进程 `writeFileAtomically`（同目录临时文件 + `rename`，失败清理），不引 `EXDEV` 回退；删除 / 建目录失败经 `readableFileFailure` / `readableDirectoryFailure` 转中文含路径与 OS 码。
- **模板纯核只认注入 IO**：`createTemplatePlan` / `resolveTemplatePlan` 零 IO（覆盖检测来自注入清单），`executeTemplatePlan` / `verifyTemplateExtraction` 只经各自 IO；复用 `joinRelativePath` / `sha256Hex` / `OperationCancelledError`，不复制第二份实现、不新增磁盘抽象。覆盖检测必须读真实输出根（否则 `overwrite` 恒 false 且默认勾选静默覆盖），预览阶段零写入。
- **模板写路径只留一条**：写入只走 `executeTemplatePlan`；旧 `extractTemplateMatches` / `applyTemplateExtract` renderer 写路径不得复活；拒绝码用 `TemplateRootError` 稳定码 + 词典本地化，不直接渲染平台中文 message；根规范化复用 `@shared/compareRequest` 的 `normalizePathValue`。
- **移动语义**：删源只认计划记录的 `sourcePath`，绝不用 `sourceRelativePath` 重拼；写后校验与结果复核同一函数；重扫时 `missing` 槽位须读输出根摘要才能判 `placed`；新增失败 reason 时同步补 zh / en 成对词条。
- **行模型与虚拟化**：`DIRECTORY_ROW_HEIGHT = 24` 单一常量；行模型只按内容变化重建（折叠集合为稳定 `readonly string[]`）；虚拟化锚定 `Panel` body（`initialOffset` 取 shell 保存的 `scrollTop`），返回挂载时虚拟窗口与恢复位置一致。
- **遍历复用既有并发工具**：`mapWithLimit` / `toReadableIoError`，不引 `p-limit` / `p-queue`；`DEFAULT_TRAVERSAL_CONCURRENCY`(16) 与 `DEFAULT_STAT_CONCURRENCY`(16) 是独立常量，`DEFAULT_IO_CONCURRENCY`(8) 不得被抬高替代；批次挂起必须 `abortable` 竞速，被放弃 promise 挂 `catch`。
- **测试落位**：真实磁盘门禁 `src/sync-real-gate.test.ts`（`mkdtemp` + electron handler map，不 mock 文件系统）与五条模板门禁 + `template-e2e-real`；只读用例用 `chmod` 构造、root 身份仅跳过该条；二进制样本用代码内 `Buffer` / base64，不新增资源文件；不新增 code-gates 矩阵项。

## 最近交付证明

- WI：`wi_intake_abb0a2b075d1f867`（**模板归位补齐逐条动作列与显式移动**：默认复制、移动必须显式勾选、写后校验通过才删源；`kind: feature`）
- 日期：2026-11-02
- 结果：`code_gates` passed（20 gates，attempt 001，`.munk/runs/run_intake_abb0a2b075d1f867/code-gates/attempts/001/manifest.json`）；`pnpm test` 111 files / 1624 passed + 1 skipped（1625）、35.33s；新增 `template-move-actions` 6 tests / 11ms、`template-move-verify` 6 tests / 89ms，`template-e2e-real` 10 tests / 1.88s（新增 APFS 三腿「默认复制 / 显式移动 / 校验失败保留源」）、`sync-real-gate` 33 tests；矩阵 18 → 20 仅在末尾追加两条，既有 18 条 id / 命令 / `cwd` 逐字未动；`package.json#version` 仍 `0.2.16`，发布件零改动；`needSelfTest=false`。
- 覆盖摘要：① **动作契约单源**——`TemplateAction` 严格 `copy | move`，match / candidate 携带 `sourceRelativePath`（由 B 扫描索引给出），计划条目带 `sourceRelativePath` / `targetRelativePath` / `defaultAction`；`resolveTemplatePlan` 增 `movePaths`、`actions`（未勾选行恒 `copy`、无源行无条目）、`copyCount` / `moveCount`，行内动作列 / 移动复选框 / 底部三计数 / Apply 禁用同读一份；默认执行后 B 逐文件 sha256 / `mtimeSec` 不变、零删除。② **显式选择**——`movePaths` 只对已勾可执行行生效，未勾 / missing / placed / rejected / path-escape 行即使传入也零执行；整批按钮只重标 `resolved.executable` 且绝不自动勾选；取消勾选同步清移动选择。③ **移动执行**——写目标 → 重读存在 + sha256 + 秒级 mtime 与当前源比对 → 才 `deleteFile(sourcePath)`；注入缺失 / hash / mtime / 不可读时源与目标均保留、后续行继续；删源被拒记 `move-delete-failed`；无 `.tmp`、不滚已成功行。④ **结果与重扫**——结果按路径去重、带动作与源删除状态（移动 `sourceDeleted === true`、复制校验源仍在），`entries.length === writtenCount`；重扫清空勾选 / 移动 / 候选，移动成功槽位判 `placed` 且默认不勾。⑤ **门禁与真实磁盘**——预览后不执行 / 预取消 / Dry-run 取消三路径零写入零删除；`template-e2e-real` 在真实 `mkdtemp` 且探针确认大小写不敏感的 APFS 卷上跑通三腿。
- 注：① 本 WI change pack 仅提供 `prd.md` 与 `evidence/template-move-e2e.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），验收落档在 `qa/template-move-actions.md`。② **`actions` 是行级动作的唯一来源**——对话框不得再从 `checked` / `overwrite` / `candidate` 推「这行会移动吗」，移动复选框 `disabled` 必须同时满足「有动作映射」且「在 `resolved.executable` 里」。③ **删源只认 `sourcePath`**，用相对路径重拼会在 B 根变动或大小写折叠卷上删错文件；重扫 `missing` 槽位必须读输出根摘要，否则移动成功后永远显示缺失。④ **写后校验必须与结果复核同函数**，两处各写一份会让「执行通过但结果报失败」；新增失败 reason 同步补 zh / en 词条。⑤ **批量移动不是批量勾选**：顺带勾选冲突 / 越界行会直接推翻 `ac-hazard-rows-default-unchecked`。⑥ **APFS 三腿依赖运行时探针**：探针 false 时必须显式 skip 并打印原因，不得改成无断言 pass。
