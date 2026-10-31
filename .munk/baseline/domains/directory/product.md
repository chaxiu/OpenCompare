# Domain: directory

目录域：`src/core/` 纯算法目录对比引擎（相对路径配对、四类状态、大小/mtime 短路 + SHA-256 内容确认、增量缓存），双栏目录对比视图（展开/折叠、逐行差异徽章、目录后代聚合计数、五档状态过滤），取数与下钻（本地真实目录选择 / 内置样本目录一键加载；双击差异文件下钻到对应文件级视图，并可一键返回来源目录视图且往返不丢目录树状态）。在只读对比之上，本域还承载两项高阶目录操作：**文件夹单向增量复制 / 镜像同步（Dry-run 预览后写入）** 与 **跨层级散乱目录树按模板归位 / 提取器**。本域不做文件级差异算法本体（行级 / 3-way merge 归代码域）。

## 范围

- **目录对比引擎（`src/core/directory/`，纯算法，零 Electron/DOM）**：经 `PlatformPort` 递归扫描左右两棵树，按**相对路径**配对（不做跨层级模板匹配）；每文件产出 `same` / `added`（右独有）/ `removed`（左独有）/ `modified` 四类状态，目录状态由后代聚合。
- **高速 / 增量策略**：先比文件大小、再比修改时间；二者都不足以判定差异时才读取内容做 **SHA-256** 内容哈希确认（覆盖「大小相同但内容不同」）；已比对条目按（路径 / 大小 / 修改时间）缓存，重复比对不重复读内容与哈希。输出带状态的左右树 + 按状态文件计数。
- **双栏目录对比视图**：左右双栏树、目录展开/折叠、逐行差异语义徽章（复用 `DiffBadge` / `--color-diff-*`）、目录行显示其后代差异聚合计数；一键过滤 `全部 / 仅差异 / 左独有 / 右独有 / 相同`，过滤后仅保留匹配条目及其祖先目录。
- **目录树窗口化渲染（大目录不 OOM）**：`DirectoryView` 不再对整树做 `filterDirectoryTree` + 左右 `projectDirectoryTree` 克隆；改为由 `src/core/directory/rows.ts` 的纯行模型 `buildDirectoryRowModel(root, filter, side, collapsedPaths)` 按 `(root, filter, side, 折叠集合)` 一次前序遍历产出「可视行索引」（只持节点引用 + depth + 是否展开，不复制节点、不复制 children），`TreeView` 用 `@tanstack/react-virtual` 只渲染视口行 + 常量 overscan（`ROW_OVERSCAN = 10`），占位总高 = 行数 × `DIRECTORY_ROW_HEIGHT`（24px = `h-6`）。DOM 节点数与渲染行数有界、不随总条目数线性增长。工作台 `visibleCounts` 亦改为按过滤档从根节点 `counts` 直接派生（`visibleDirectoryCounts`），不再为统计克隆过滤树。五段过滤、左右投影、展开/折叠、选中、双击下钻、逐级返回的状态语义与四态统计、对比结果全部保持不变。
- **超大行数（≥150 万行）行 ↔ 滚动偏移映射（`src/core/directory/rows.ts` 纯函数 + `TreeView` DOM 应用）**：`rows.length * DIRECTORY_ROW_HEIGHT` 一旦超过浏览器布局上限（2^24 px）就会被静默截断，导致尾部行永远滚不到（实测右栏 1,516,096 行时 `scrollTop` 最大只能覆盖前 699,050 行，尾部 53.9% 不可达）。本期引入具名常量 `DIRECTORY_MAX_TREE_HEIGHT = 16_777_215`（`< 2^24`）与纯函数 `createDirectoryScrollMap(rowCount, viewportHeight)`：总高未超限时退化为恒等映射（`row * 24`，像素含义逐位不变），超限时容器高度钉在 `DIRECTORY_MAX_TREE_HEIGHT`、每行按 `maxScrollOffset / (rows - 1)` 步长共享可达偏移（`offsetForIndex` 严格递增、末行恰好落在 `maxScrollOffset`），并以连续锚点 `rowPositionForOffset` / `rowTop` 驱动渲染窗口，避免尾部压缩死区。`TreeView` 仍用 `@tanstack/react-virtual` 观测面板滚动偏移与视口高度，但渲染窗口改由该纯映射给出（`visibleRange` + `rowTop`），容器加 `overflow-clip` 防止 overscan 行撑大滚动区；行高仍为 `DIRECTORY_ROW_HEIGHT = 24`，`role="tree"` / `role="treeitem"` / `aria-level` / `title` 与既有 props（`scrollElement` / `initialScrollTop` / `selectedPath` / `onTogglePath` / `onSelectPath` / `onOpenFile`）契约不变。五档过滤、展开/折叠、选中、下钻与逐级返回、双栏独立滚动、四态统计语义与取值全部保持不变。
- **取数与下钻**：本地真实目录选择（左/右各经 `PlatformPort.selectDirectory`，Electron 原生对话框、Web 模式降级提示）；内置样本目录一键加载（`pnpm dev` 与 `pnpm dev:web` 均可）；双击差异文件（`added`/`removed`/`modified`）按其类型把左右内容带入对应文件级视图并切换会话（代码/文本 → 代码双栏 Diff；CSV/TSV → CSV 视图；JSON/YAML → 结构化视图；左独有右侧空、右独有左侧空）。
- **下钻来源绑定与返回上级目录视图**：目录树下钻生成的文件级会话记录**来源目录会话**（`parentDirectoryId`）与会话 id 前缀（`file:{parentId}::{relativePath}`），两个不同目录会话对同一相对路径的下钻互不覆盖；文件级视图顶部提供明确的「返回上级目录视图」导航（左箭头按钮 + 「来源目录对比：<目录会话标题>」说明），一步回到发起本次下钻的目录会话，可反复「下钻 → 返回」。不实现目录级下钻栈 / 面包屑 / 前进后退历史（树已展示完整层级，下钻止于文件级）。
- **往返目录状态保持（按目录会话归口）**：过滤档位、目录树折叠/展开集合、左右面板滚动位置、树行选中项由工作台壳层按目录会话 id 保存并受控回填，不依赖组件挂载生命周期；目录视图因下钻卸载重建后，上述状态原样恢复，且不同目录会话之间互不串味。状态仅保持于当前运行期内存，不跨重启/跨窗口持久化。
- **目录树行选中态**：行单击即单选选中（左右栏同一相对路径行同步高亮），选中样式引用 `--color-accent-soft` 语义 token；点展开/折叠按钮不改变选中。
- **来源不可用兜底**：来源目录会话已不可用（被关闭或被替换）时，返回优先落到仍可用的其他目录会话并给出明确状态栏提示；无任何目录会话可返回时停留文件视图并提示，不崩溃、不死路。
- **同步计划生成器（`src/core/directory/`，纯函数）**：基于现有 `DirectoryComparison` 输出某方向（**左→右 / 右→左**）的变更清单：`copy`（源侧有、目标侧不存在的新增拷贝）、`update`（两侧都存在且 `modified` 的覆盖修改）、`delete`（仅**镜像模式**下，目标侧独有的文件；**默认不勾选**、可逐项或组级全选）。`same` 文件不进清单。每项带相对路径、源/目标绝对路径与字节数；计划带 `count`/`bytes` 分组汇总与 `totalCount`/`totalBytes`。
- **执行器**：按计划经 `PlatformPort` 写入目标侧，自动创建缺失的中间目录；写入前先整轮预检、写入后逐项可撤销，任何失败或取消逆序回滚（口径见下方「同步失败安全」条）；镜像模式**只删除显式勾选并传入的 `deletePaths`**——缺省或空集一律零删除（安全默认，调用方漏传勾选集不可能清空目标侧），失败 / 取消时未勾选的删除项在目标侧原样留存；写入后使受影响路径的比对缓存失效；同一方向重复执行（含勾选的镜像删除）后计划为空（幂等）。
- **Dry-run 预览确认弹窗**：执行前弹出弹窗，copy / update / delete 三组常驻（空组显示「无」），每组带条目与「N 个 · X 字节」，外加合计与目标根路径；底部「本次将执行」汇总新增 / 覆盖 / 已勾选删除的条目数，与实际传给执行器的勾选集合同源；**没有任何可执行项时（含「只有未勾选的删除项」）确认按钮禁用并给出可见原因**，忙碌态禁用确认并显示进行中文案，而忙碌态「取消」变为中止执行（回滚，不关弹窗）；**取消不写任何文件**；确认后才执行；执行成功后自动重跑 `compareDirectories`，目录树、徽章与状态栏统计随之刷新，返回的新 `DirectoryComparison` 直接替换当前会话（计数、四态与跳过数全部来自这一次比较，不另算一套）；执行失败 / 取消则不替换会话，弹窗保留可重试，通知条给中文可读原因（取消为独立的「已取消 / 已回滚」提示）。
- **真实磁盘写盘与 mtime 毫秒归一**：确认后经既有 `PlatformPort` → Electron 主进程 IPC 写入真实磁盘，保留相对路径与 ≥4 层嵌套，中文与空格路径不被转义或改名，目标文件 UTF-8 内容与源逐字节一致；写入回填源 mtime 时按**整毫秒**落盘，而「size + mtime」快路径的 mtime 比较也只比 `Math.floor(ms)`——两侧亚毫秒写入精度差不再把刚同步的文件误判 `modified`；内容不同仍必须由 SHA-256 确认，不得靠抹平 mtime 伪造 `same`。
- **同步失败安全（写前预检 / 原子写 / 逆序回滚 / 执行中取消）**：`executeSyncPlan` 在动第一项之前先做整轮预检——目标根必须存在且可写（同目录写一个探测文件后立即删除）、每个写入项与勾选删除项的父链必须逐层是目录（任一层为文件即 `ENOTDIR`）、目标位置被同名**目录**占用即 `EISDIR`；预检只读（外加一个必被删除的探测文件），被拒绝时目标侧与执行前逐项一致，不出现「前面若干项已写、后面失败」的部分写入。预检通过后逐项执行：每次写入经主进程 `writeFileAtomically`（同目录临时文件 + `rename`）落盘，任何时刻目标侧不出现零字节 / 截断文件、不残留 `*.tmp`（成功路径同样不留）；覆盖或删除某项前先把目标当前字节与 `modifiedMs` 收进内存备份，每步只入栈一个撤销动作（恢复旧字节与 mtime / 删除本次新建文件 / 用 `removeDirectory` 由深到浅删掉本次新建的每一层目录）。任一步失败或取消都按**逆序**执行撤销栈（单步失败不中断其余步骤）后抛原错误：已覆盖文件内容与 `mtimeMs` 逐项回到执行前、已删除文件重现、本次新建的文件与多层目录全部消失、目标根下不存在仅由本次新建的空目录；成功路径不残留任何备份或临时条目。
- **执行中取消与失败可区分**：`SyncExecutionOptions.signal`（`AbortSignal`）在每项写入前与单次写入内的读取 / 写入边界检查，取消与失败走同一撤销路径但拒绝形态不同——取消为 `OperationCancelledError`（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`、消息含「已取消」、不带系统错误码），失败为 `SyncTargetError`；调用方用 `isOperationCancelled` 判别。取消后立即对同一对目录重新 `buildSyncPlan` / Dry-run，得到的是该时刻真实磁盘的差异（已回滚的 copy 项重新出现在 copy 组，`totalCount` 等于该时刻实际差异文件数），不沿用上一次计划的缓存结论。
- **同步失败可读提示与状态保持**：真实失败一律由 `SyncTargetError` 承载「无法同步到目标 <path>：<中文原因>（<CODE>）。」，`applySyncPreview` 对非本域错误剥掉 `Error invoking remote method …` IPC 包装，渲染层只显示原因；失败 / 取消时 `applySyncPreview` 不产出新的 `DirectoryComparison`（不 `replaceSession`），树、选中行、过滤档与滚动位置不重算，`busy` 复位为 `false`，预览弹窗保持打开可重试，执行中「取消」按钮调用 `AbortController.abort()` 而不是关闭弹窗（不被 `busy` 禁用）。
- **materialize 沙箱清理**：目标落在只读内置样本 / 只读挂载上需要先物化到可写区时，本次新建的沙箱根、已写文件与多层目录在失败 / 取消后由 `discardSandbox` 逆序清掉（执行前就存在的沙箱根与其中的非本次内容不动）；物化阶段自身失败同样清理后抛出可读错误。
- **真实磁盘规模集成门禁（`sync-real-gate`）**：新增 `src/sync-real-gate.test.ts`，只用 `mkdtemp` 真实临时目录 + 真实主进程 IPC handler（沿用 electron mock + handler map 模式），两侧各 ≥1,000 文件、≥4 层嵌套、四态齐备、路径含中文与空格，覆盖双向镜像、删除默认不勾 / 显式全选、mtime 与二次幂等；**失败安全用例并入同一门禁**（小规模真实目录 `buildSafetyFixture`，单例 ≤ 200 文件、每组 60s 上限）：真实 `chmod 0555` 目标根的预检拒绝（`isRootUser()` 时仅跳过该条）、计划过期后目标位置被同名目录占用、中途 `deleteFile` 抛 `EBUSY` 的逆序回滚与同一 preview 重试成功、中途 `abort()` 的取消回滚与取消后冷 Dry-run、零勾选删除时失败后删除项原样留存；登记为 `.munk/code-gates.json` 末尾第 11 项（`pnpm test:sync-real`，单 argv），不因失败用例新增矩阵项，不用 `/samples`、内存 VFS、`.ocsnap` 或 mock 文件系统顶替。
- **模板归位匹配器（`src/core/directory/`，纯函数）**：以模板树 A（当前目录会话左/源侧，或用户选定目录）的**相对路径槽位**为骨架，用「**文件名 + SHA-256 内容哈希**」从层级被打乱的树 B（内置 `/samples/directory/incoming` 或用户选定目录）中匹配文件，产出 `matched`（A 槽位 ← B 文件，文件名一致且内容哈希一致）、`missing`（A 槽位在 B 中无同名候选）、`conflict`（同名候选内容不同 `content-mismatch`，或同名候选多于一个 `ambiguous`）、以及 B 中未被消费的 `unused` 文件。匹配经哈希索引 + 文件名索引完成，线性复杂度，不做两两内容比对。
- **模板预览与提取归位**：视图展示归位映射预览（已匹配相对路径映射、缺失槽位、冲突项、B 未使用文件；确认前不写任何文件）；确认后按模板 A 的相对路径结构写出所有 `matched` 文件（自动创建缺失父目录）到目标根，完成后用同一匹配器复核归位结果。
- **批量取数与有界遍历（`src/core/directory/compare.ts`）**：`scanDirectory` 从「逐层串行、一个目录一次 `list`」改为**队列 + 批量取数 + 有界并发**——按层收集待列目录，一次 `listDirectories` 往返携带多个目录（默认批大小 `DEFAULT_DIRECTORY_BATCH_SIZE = 8`，队列不足时按 `ceil(待列数 / 并发)` 收缩但不少于 2），由 `mapWithLimit` 限制在飞批量调用（默认 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`，可经 `ScanDirectoryOptions.concurrency` 覆盖）。批量/并发只改「怎么取数」：树结构、按名称 `localeCompare` 排序、`index` 相对路径键、四态配对、`skipped` 计数口径与不可列子树容错与串行基线逐项一致；批量槽位缺失或槽位顺序与请求不符即整次 reject，绝不返回部分 `ScannedTree`。既有 `scanDirectory(rootPath, list)` 调用形态保留，缺批量能力时由 `perDirectoryBatches` 适配为批形态。
- **内容读取的有界并发与句柄错误（横切契约，归 `io-concurrency` 域）**：`compareDirectories` 的候选正文读取经 `@core/io` 的 `mapWithLimit` 走默认 `DEFAULT_IO_CONCURRENCY`（8）窗口，`scanDirectory` 单层 `list` 失败转成可读句柄错误；`compareDirectories` / `compareDirectorySides` 新增可选 `ConcurrencyOptions` 尾参供测试收窄窗口。`EMFILE` / `ENFILE` 统一转成「文件句柄」可读错误向上抛，不返回部分结果。
- **内容确认的字节摘要（横切契约，归 `content-digest` 域）**：目录对比的内容确认改为先按 size/mtime 快路径 + `(path, size, modifiedMs)` 缓存算出待确认路径，再经 `PlatformPort.digestFiles` 对**原始字节**批量取 SHA-256（不读 UTF-8 正文），摘要写回同一 `ComparisonCache.hashes`；未提供摘要能力时回退既有文本读取路径。`compareDirectories` 尾参类型为 `ComparisonIoOptions`（`ConcurrencyOptions` + 可选 `digestFiles` / `digestible`）。非法 UTF-8 的二进制内容因此能被判 `modified` 而不被解码抹平；四态语义、缓存键与失效钩子不变。
- **扫描 / 摘要进度（`src/core/directory/compare.ts`，流水线累计口径）**：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 提供可选 `onProgress(progress)` 尾参，每结算一个真实批次（批量列目录或摘要分块）最多回报一次 `DirectoryProgress = { phase: 'scan' | 'digest', files, bytes, phaseFiles, phaseBytes }`。**`files` / `bytes` 表示整条流水线的累计值，跨相位单调不减**——digest 相位以 `createScanProgressMerger` 已累计的扫描末态（两路 side 合并后的 `totals()`，经 `ComparisonIoOptions.progressBase` 注入）为基数，只叠加本相位真实增量，绝不从 0 或单个摘要块大小重新起算；**`phaseFiles` / `phaseBytes` 表示相位内增量**（scan 相位即其流水线累计值，digest 相位从 0 起、末态等于真实待校验候选文件数）。扫描阶段统计已发现（非 `broken`）文件数与其 `size` 之和，两侧扫描合并成一条单调流；不做定时器插值/预估，块未结算不报、对比结束后不再报；全缓存二次对比不产生 `files > 0` 的 digest 事件。
- **摘要分块与进度步长（`src/core/directory/compare.ts`）**：`digestContentCandidates` 不再把所有待确认路径压成一次请求，改按导出常量 `DEFAULT_DIGEST_BATCH_SIZE`（64）顺序分块调用 `digestFiles`，每结算一块才写该块成功项的 `cache.hashes` 并回报一次 digest 进度；块大小可经 `ComparisonIoOptions.digestBatchSize` 覆盖（低于 1 回退默认）。单块内仍由平台层有界并发。
- **核心层取消（`src/core/directory/compare.ts` + `src/core/io.ts`）**：`ScanDirectoryOptions` / `ComparisonIoOptions` 新增可选 `signal: AbortSignal`；扫描与摘要每个批次边界检查，abort 后不再发起新批次；在飞批次经 `abortable` 与 signal **竞速**立即以取消错误 reject——即使平台调用永不 resolve 也不得挂住。取消是独立失败路径：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 取消即 reject，**绝不返回部分树、部分对比结果或空树**，`OperationCancelledError` 不会被转成 `FileHandleExhaustedError`、不计入 `skipped`；被中断块的路径不写缓存，已结算块保留，随后用同一缓存重新对比结果与未取消基线逐项相等。**取消错误只在进程内**：平台层的 `digestFiles` 以 `{ cancelled: true }` 结构化返回，renderer 适配层（`digestFilesForComparison`）在本进程抛回 `OperationCancelledError`，核心侧 `signal` 与取消 catch 分支语义完全不变。
- **符号链接不跟随（横切契约，归 `symlink-semantics` 域）**：`scanDirectory` 把平台标注的链接条目作为 `kind: 'file'` 的**叶节点**（携带 `linkTarget` / `linkTargetKind`）收进树，目标子树不产生节点、不占 `index` 键、不计 `fileCount` / `skipped`；`compareScannedTrees` 对任一侧是链接的条目按**目标串**出四态（相同 → `same`，不同 → `modified`，单侧 → `added` / `removed`，链接 vs 普通文件/目录 → 单条类型冲突 `modified`），链接路径不进 `planContentReads`、不对目标正文取摘要；四态之和恒等于 `fileCount`，每条链接各计 1。指向目录的链接在树中不是可展开目录节点，双击不下钻（归 `workbench` 的 `openFile` 提示）。
- **不可读项容错（横切契约，归 `io-tolerance` 域）**：`scanDirectory` 跳过平台标注的 `broken` 条目与不可列举子树并累计 `ScannedTree.skipped`（根目录失败仍 reject）；`compareDirectories` / `compareDirectorySides` 产出按侧 `DirectoryComparison.leftSkipped` / `rightSkipped`（`skipped` 为两侧之和），正文读取失败的文件对判 `modified` 而不中止整次对比；`fileCount` 仍等于 `same + added + removed + modified`。坏项不进任何状态计数。目录视图 footer 在 `leftSkipped + rightSkipped > 0` 时显示「已跳过：左 X / 右 Y」，两侧为 0 不显示，不再显示合并总数。
- **视图面文案渲染期解析（词典归 `i18n` 域，本域承载渲染）**：过滤条（组可访问名 + 五档标签，顺序仍按 `DIRECTORY_FILTERS`）、工具栏十个按钮与其 `title`、`pickerAvailable` 门控的 Web 提示、两个隐藏快照 input 的 `aria-label`、左右 Panel 的 `meta` 来源标识（源目录 / 目标目录 / 快照）、单侧空态句、跳过提示行、下钻说明，以及同步预览与模板归位对话框的外壳文案，全部经 `useI18n().t(key, params)` 渲染；`TreeView` 的展开 / 折叠 `aria-label` 走词典插值，而树根名、行 `title`、Panel `title` / `subtitle` 仍是用户数据不翻译。zh 值逐字沿用原界面，行模型、过滤、折叠、选中、四态计数、同步计划与模板匹配语义均不变（AC 定义归 `domains/i18n` 的 `ac-filter-copy`…`ac-en-smoke-no-han-directory`）。

- **目录对比 HTML 报告导出（归 `directory-report` 域）**：把已完成的 `DirectoryComparison` 渲染为自包含、可离线、默认隐藏本机绝对路径且带行数/字节双上限的单文件 HTML，纯函数内核在 `src/core/directory/report.ts`（`buildDirectoryReport` / `directoryReportSource`），版本单点在 `src/shared/appVersion.ts`。本域只提供 `DirectoryComparison` 作为输入；报告语义、转义与隐私口径、上限与截断、应用版本来源见 `domains/directory-report` 的 AC 定义，`DirectoryView` 接线与词典新增不在该域已交付范围。

## 验收

- **ac-engine-classify**：双目录对比引擎按相对路径配对，对每个文件正确产出 相同 / 右独有 / 左独有 / 修改 四类状态，并靠 SHA-256 内容哈希判定「大小相同但内容不同」的修改（vitest 可单测）。
- **ac-engine-incremental**：大小与修改时间都相同的文件对不读内容即判为相同；重复比对同一目录树时，已比对条目不重复读取内容 / 计算哈希（vitest 用计数桩可验证）。
- **ac-tree-ui**：目录对比视图呈现左右双栏树，目录可展开/折叠，每行显示差异语义徽章，目录行显示其后代差异聚合计数。
- **ac-filter**：过滤控件含 `全部 / 仅差异 / 左独有 / 右独有 / 相同`；切换后树中只保留匹配条目及其祖先目录，统计随之更新。
- **ac-runtime-stats**：目录对比会话的统计（状态栏 / 图例 / 徽章）来自运行时计算结果，不再来自样本 answer key。
- **ac-local-directory**：Electron（`pnpm dev`）下可为左/右各选一个真实本地目录并触发对比；Web 模式下该动作有可理解的降级（不假装能选真实目录）。
- **ac-sample-directory**：一键把内置样本目录加载为左右两侧并完成对比，无需外部文件；`pnpm dev` 与 `pnpm dev:web` 均可复现。
- **ac-drilldown-code**：双击树中的差异代码/文本文件，下钻打开文件级对比视图并携带左右文件内容（左独有→右侧空，右独有→左侧空）。
- **ac-drilldown-typed**：双击差异 CSV/TSV 文件下钻到 CSV 视图、双击差异 JSON/YAML 下钻到结构化视图，均携带左右内容并正确解析。
- **ac-drilldown-opens-file-view**：真实目录对比中双击差异文件行仍下钻到对应文件级对比（代码/文本 · CSV/TSV · JSON/YAML），与既有下钻同一会话模型，每个下钻生成独立会话标签且目录对比标签仍在。
- **ac-back-to-parent-directory**：下钻后的文件级视图有明确的「返回上级目录视图」导航，点击即回到发起本次下钻的目录对比会话。
- **ac-roundtrip-repeatable**：同一目录会话连续「下钻 → 返回」多次，每次都落回同一目录视图且行为一致，无需刷新/重启。
- **ac-filter-preserved**：往返后目录视图的差异过滤值与下钻前相同。
- **ac-expand-preserved**：往返后目录树的展开/折叠状态与下钻前一致，未被重置为全展开。
- **ac-scroll-preserved**：往返后两侧目录面板的滚动位置与下钻前一致。
- **ac-selection-preserved**：目录树行可单击选中并有可见高亮；往返后选中项与高亮保持。
- **ac-drilldown-isolation**：两个不同目录会话各自下钻同一相对路径时互不覆盖；各自「返回」都回到自己的来源目录会话。
- **ac-parent-fallback**：来源目录会话不可用时返回给出明确提示并落到可用目录视图，不崩溃、不死路。
- **ac-gates**：`pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动与新测试）。
- **ac-sync-plan**：纯函数计划生成器按方向产出 `copy` / `update`（镜像模式另含 `delete`）变更清单，逐项带相对路径与字节数、并给出字节汇总；左→右 与 右→左 互为镜像（vitest 可单测）。
- **ac-sync-plan-same-modified**：两侧相同的文件不进清单；`modified` 进 `update`；源侧独有的文件在目标侧进 `copy`（vitest 覆盖四类状态）。
- **ac-sync-dryrun-dialog**：目录视图可发起左→右 / 右→左同步并弹出 Dry-run 预览弹窗，分组展示待新增拷贝 / 待覆盖修改（镜像模式含待删除）与字节汇总；取消后目标侧无任何写入。
- **ac-sync-apply-refresh**：确认后经 `PlatformPort` 实际写入（缺失父目录自动创建），完成后自动重跑对比并刷新目录树与统计；再执行同一方向时计划为空（幂等）。
- **ac-sync-mirror-delete**：镜像模式把目标侧独有文件列为待删除项，**初始全部未勾选**；提供组级「全选 / 清空」与逐项复选框；确认执行只删勾选项，未勾选的目标侧文件仍在磁盘上。（口径在 2026-10-31 由 `wi_ws_7efd09ed8abe2eda` 由「默认勾选」反转为「默认不勾」，`qa/sync-mirror-delete.md` 已按新合同改写；旧「默认勾选」断言只允许改成断言默认不勾。）
- **ac-sync-electron-local**：Electron（`pnpm dev`）下对两个真实本地目录完成 dry-run → 确认 → 磁盘写入 → 重新对比闭环。
- **ac-sync-web-sample**：Web（`pnpm dev:web`）下用内置样本目录 / 内存可写区完成同一闭环；内置样本库保持只读、可重复一键加载（写操作不污染 `/samples`）。
- **ac-plan-three-groups-exact**：真实临时目录对上，左→右与右→左两个方向的 Dry-run 计划只产出 copy / update / delete 三类条目；每组 `count` 等于条目数、`bytes` 等于该组条目 `size` 之和，且与磁盘上实际待新增 / 待覆盖 / 待删除的文件逐条对应；`same` 文件不出现在任何一组（`same` 数量 = 两侧内容与 mtime 均一致的文件数）。
- **ac-delete-default-unchecked**：镜像 Dry-run 的删除组初始复选框全部未选中；不勾选任何删除项即确认 → `executeSyncPlan` 的 `deleted === 0`，目标侧文件列表与执行前逐项一致；未传 `deletePaths` 直接调用 `executeSyncPlan` 时同样零删除。
- **ac-delete-selected-only**：勾选（逐项或组级全选）后确认，只有被勾选的删除项从磁盘消失，未勾选的目标侧独有文件仍在磁盘上；`deleted` 计数等于勾选数，返回的 `affected` 覆盖被删路径。
- **ac-real-apply-content-structure**：确认执行后真实落盘：每个 copy / update 项的目标文件内容与源文件 UTF-8 内容完全一致，目标侧相对路径与源侧逐条相同，≥4 层嵌套原样保留，含中文与空格的路径（如 `资料 夹/第一层 子目录/第二层/deep 文件.txt`）在磁盘上可被同一相对路径找到。
- **ac-mtime-preserved-fast-path-same**：同步完成后每个被写入目标文件的 `mtimeMs` 与源文件按毫秒归一相等（允许平台写入精度归一到毫秒），对同步后的磁盘重新对比时这些文件判为 `same`、`modified` 集合不含它们。
- **ac-refresh-single-source**：`applySyncPreview` 返回的 `DirectoryComparison` 的 `counts` 与 `skipped` / `leftSkipped` / `rightSkipped` 与对同一磁盘状态独立重新 `compareDirectories` 的结果完全相等，且 `copied` / `updated` / `deleted` 与计划中的勾选集合一致。
- **ac-idempotent-second-dry-run**：镜像模式删除项显式全选并执行完成后，立即对同一方向重新 Dry-run：`copy.count = 0`、`update.count = 0`、`delete.count = 0`、`totalCount = 0`、`totalBytes = 0`；不因 mtime 精度、路径分隔符或中文 / 空格路径出现幽灵条目。
- **ac-dialog-executable-summary**：预览弹窗底部「本次将执行」条目数与实际调用 `onConfirm` 的勾选集合一致；只有未勾选删除项时「确认执行」不可点击并显示原因；勾选任一删除项或存在 copy / update 项时可点击；忙碌态下确认按钮禁用并显示进行中文案。
- **ac-scale-real-disk-fixture**：集成测试只使用 `mkdtemp` 真实磁盘临时目录，两侧各 ≥1,000 个文件、至少 4 层嵌套、四态齐备、路径含中文与空格；不使用 `/samples` 内置样本、内存 VFS 或 `.ocsnap` 快照顶替，不 mock 文件系统。
- **ac-gate-registered**：上述断言以独立 gate `sync-real-gate` 登记在 `.munk/code-gates.json` 末尾（`command` 为单 argv `pnpm test:sync-real`、`cwd: "."`，可单独执行通过）；**本项失败安全用例并入同一 gate，不新增矩阵项**；`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 与既有目录、渲染层套件零回归，既有「删除默认勾选」断言必须改写为断言默认不勾，不得删除或弱化。
- **ac-preflight-unwritable-target**：在真实临时目录对上，目标目录执行前用 `chmod` 去掉写权限（非 root 运行）后执行同步：执行被拒绝，且拒绝发生在任何一项写入之前——用 `stat` / 内容快照断言目标侧文件列表与执行前逐项一致（相对路径集合、字节内容、`mtimeMs` 全等），目标树内不存在任何 `*.tmp` 或其它本次新建条目；错误消息含目标路径与 `EACCES` / `EPERM` / `EROFS` 中对应项，且不含 `Error invoking remote method`。
- **ac-preflight-occupied-target**：计划生成后、执行前把某个待 copy 的目标路径替换为同名**目录**：执行以 `EISDIR` 失败，目标侧快照与执行前逐项一致，失败路径上的同名目录仍在且内容未被改动，无临时文件残留，且没有出现「前面若干项已写、后面失败」的部分写入。
- **ac-atomic-write-no-partial**：单次写入失败（目标位置被目录占用 / 目标目录只读）时，目标侧不出现零字节或截断文件；任何目标路径上的内容要么是执行前内容，要么是完整源内容；执行目录内不残留 `*.tmp` 文件（成功路径同样不残留）。
- **ac-rollback-on-failure**：用可控 IO / 真实磁盘让计划在中间某项失败（前若干 copy / update 已成功，若勾选删除则部分删除已执行），执行 reject；随后断言目标侧恢复为执行前状态：已覆盖文件内容与 `mtimeMs` 逐项等于执行前，已删除文件全部重现且内容与 mtime 一致，本次新建的文件与（多层）目录全部消失，目标根下不存在仅由本次新建的空目录；同一 preview 立即重试可成功执行全部条目。
- **ac-cancel-mid-plan**：计划执行中途触发取消（取消信号在第 N 项写入前 / 写入边界触发），执行以「已取消」结束而非成功；目标侧逐项恢复为执行前状态（同 `ac-rollback-on-failure` 的逐项断言），无半写文件、无 `*.tmp`、无半棵树，本次新建目录被移除。
- **ac-cancel-signal-observable**：取消结果与失败结果在调用方可区分（取消 reject `OperationCancelledError`，`name === 'OperationCancelledError'`、`code === 'ECANCELED'`、不带系统错误码；失败为带目标路径与系统码的 `SyncTargetError`）；取消后立刻对同一对目录重新 `buildSyncPlan` / Dry-run，得到的 copy / update / delete 清单与该时刻真实磁盘一致（失败前已回滚的 copy 项重新出现在 copy 组，`totalCount` 等于该时刻实际差异文件数）。
- **ac-unchecked-untouched**：镜像模式下不勾选任何删除项执行失败或取消后，所有计划删除项在磁盘上仍存在且内容 / `mtimeMs` 不变；成功路径下未勾选删除项同样零删除（沿用 `ac-delete-default-unchecked` / `ac-delete-selected-only`，回归断言不得弱化）。
- **ac-readable-error-with-code**：目标只读、目标被目录占用两类真实失败产生的错误 `message` 为中文句子，包含目标路径与该次系统错误码（可断言 `EACCES` / `EPERM` / `EISDIR` / `EROFS` / `EBUSY` / `ENOTDIR` 中出现对应项），且 `message` 不含 `Error invoking remote method` 字样；取消产生的提示中不出现系统错误码。
- **ac-session-state-preserved**：失败或取消时 `applySyncPreview` 不产出新的 `DirectoryComparison`，调用方会话不被替换（当前会话 id、对比树、四态计数与执行前同一值）；`busy` 复位为 `false`，预览弹窗保持打开且「确认执行」重新可用，执行中「取消」按钮可用（不被 `busy` 禁用，点击即中止）。
- **ac-gate-runtime-budget**：新增失败安全用例使用小规模真实目录（单例 ≤ 200 文件），`pnpm test:sync-real` 整体运行时长保持在既有 20–40 秒量级的可接受区间（不因失败用例把门禁拖到分钟级）。
- **ac-template-match**：匹配器以文件名 + SHA-256 内容哈希把散乱树 B 的文件映射到模板 A 的相对路径槽位，正确产出 已匹配 / 缺失 / 冲突（同名不同内容或同名多候选），并列出 B 未使用文件（vitest 可单测）。
- **ac-template-sample**：对模板 A（`/samples/directory/baseline`）与散乱树 B（`/samples/directory/incoming`）匹配，能把被打乱层级的多层文件归位到模板路径（如 `misc/deep/deeper/strings.ts` → `src/core/utils/strings.ts`、`misc/ui/SplitPane.tsx` → `src/ui/workbench/SplitPane.tsx`），缺失槽位正确报缺失。
- **ac-template-preview**：视图展示归位映射预览（已匹配相对路径、缺失、冲突、B 未使用），确认前不写任何文件。
- **ac-template-extract**：确认后按模板 A 的相对路径结构写出（自动创建缺失父目录），且用同一匹配器复核归位结果为全匹配、模板结构可从输出目录重建。
- **ac-template-perf**：匹配基于哈希/文件名索引，1,000+ 文件的合成散乱树仍在线性时间内完成且不对同一文件重复读取内容 / 计算哈希（vitest 用计数桩断言）。
- **ac-existing-confirmations**：目录同步 / 模板归位等既有危险动作的预览与确认语义保持不变（`role="dialog"` 预览、确认前不写、取消不写、按预览写入后刷新）。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿，且新增 vitest 覆盖同步计划与模板匹配。
- **ac-rows-filter-parity**：对同一 `DirectoryComparison` 在全部展开、5 档过滤 × 左右两侧下，行模型输出的 `(relativePath, name, kind, depth, status)` 序列与既有 `filterDirectoryTree` → `projectDirectoryTree` → 先序遍历（根节点为第 0 行）逐项完全相等（含顺序、含投影后遗留的空目录行）；该断言在 ≥5 万条目真实 fixture 上通过。
- **ac-rows-collapse-parity**：对任意折叠集合（含父目录与子目录同时折叠），行模型等于「先序遍历但跳过折叠目录的子树」，折叠目录自身所在行仍保留且位置不变；折叠集合为空时行模型与全部展开一致。
- **ac-row-model-no-clone**：行模型条目中的节点与 `comparison.root` 子树节点是同一对象引用（`===`），构造 5 档 × 2 侧行模型前后抽样节点身份不变；渲染/过滤/滚动过程中 `DirectoryView` 不再调用 `filterDirectoryTree` / `projectDirectoryTree`（mock 计数断言为 0）。
- **ac-bounded-dom-50k**：1200×640 视口的 ≥5 万条目真实 fixture 上首屏渲染后每栏 `[role="treeitem"]` 数量 ≤ 80、双栏 `document` 内 DOM 元素总数 ≤ 5000；滚动到中部、底部并重复 20 次后仍满足且不单调增长。
- **ac-dom-independent-of-total**：同一 1200×640 视口下渲染 5,000 行与 5 万+ 行对比，`[role="treeitem"]` 数量相同（±2）、DOM 元素总数差异 ≤ 10%；滚动到相同比例位置后同样成立。
- **ac-expand-large-folder-bounded**：展开含 ≥2 万直接子项的目录后每栏渲染行数仍 ≤ 80，滚动到底部能取到该目录按名称排序的最后一行。
- **ac-scroll-far-rows**：左栏 `scrollTop` 设为接近内容底部并触发 `scroll` 后，渲染行索引严格递增且无重复；索引集合同时覆盖 `floor(scrollTop/行高)` 与 `floor((scrollTop+视口高-1)/行高)`，每行 name/status/depth 与行模型对应索引逐项一致；滚动占位总高 = 行数 × 行高（±1px）。
- **ac-five-filter-switch**：依次切换 5 档过滤，每档渲染出的 DOM 行都是该档行模型的前缀窗口（含首行根节点、无上一档残留行）；空结果档不渲染任何 `treeitem` 并显示既有文案「当前过滤下…目录没有条目。」；各档行数与行模型 `length` 一致（窗口外行不进入 DOM）。
- **ac-visible-counts-parity**：5 档过滤下状态栏 `visibleCounts` 与既有 `countTreeFiles(filterDirectoryTree(root, filter))` 四态计数逐项相等（`conflict` 恒为 0）；根目录无匹配文件时四态全为 0。
- **ac-drilldown-restore**：在过滤 + 折叠 + 选中 + 滚动到非零位置后卸载视图，再以 shell 保存的同一状态重挂载（等价下钻返回）：两栏 `scrollTop` 恢复为保存值（±1），选中行 `aria-selected="true"` 且位于渲染窗口内，折叠目录的子项不渲染，过滤档高亮与行集保持原档，根节点仍为第 0 行。
- **ac-existing-suites-green**：`pnpm test` 既有 `src/core/directory/**`、样本与 renderer 套件零回归；`code_gates` 六条（install / lint / typecheck / build / build:web / test）全绿。
- **ac-height-capped**：当 `rows.length * DIRECTORY_ROW_HEIGHT > 16_777_215` 时，`role="tree"` 容器的内联高度 ≤ 16,777,215px（例如 1,516,096 行时断言 `parseFloat(tree.style.height) <= 16777215`）；当行数 ≤ 699,050 时高度恰为 `rows.length * 24`（小树路径恒等，不引入像素偏差）。
- **ac-last-row-reachable**：在 1,516,096 行的 rows 上把面板滚动容器置到最大可滚动偏移后，渲染窗口包含 index = `rows.length - 1`，且该行 `title`、`aria-level`、状态徽标与 `rows.at(len - 1)` 完全一致。
- **ac-any-index-reachable**：对同一 1,516,096 行 rows，取 index ∈ {0, len/4, len/2, 3len/4, len-1} 以及尾部目录（如 `source-code/...`、`workspace/...`）所在索引，按其映射偏移滚动后渲染窗口都包含目标行且内容正确；映射 `offsetForIndex(i)` 严格递增，且 `offsetForIndex(len - 1) <= maxScrollOffset`（无压缩死区、无跳跃空洞）。
- **ac-dom-bounded**：任意滚动位置下 `role="treeitem"` 数量 ≤ 80；1,516,096 行 fixture 与 5,000 行 fixture 在同一相对位置的 DOM 元素总数差异 ≤ 10%（渲染量不随总行数增长）。
- **ac-filter-parity**：在 ≥70 万行 fixture 上，五档过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）两侧的可见行数，以及首行、中间行、末行的相对路径与 `filterDirectoryTree → projectDirectoryTree → 前序遍历` 语义逐条一致。
- **ac-collapse-semantics**：折叠再展开任意（含顶层大）目录后，行数与 `rows.at(i)` 的节点/深度/open 一致；展开后该目录最后一个子项可被滚动到并渲染，DOM 仍有界。
- **ac-huge-rows-drilldown-restore**（prd `ac-drilldown-restore`）：在超大行数下选中尾部行后下钻、再逐级返回重挂载，滚动偏移恢复到同一行（误差 ≤1px）且选中行位于渲染窗口内、`aria-selected="true"`。
- **ac-stats-unchanged**：五档过滤下 `CompositionLegend` / `visibleCounts` 的四态计数与修复前取值完全相同（不改四态语义与统计口径）。
- **ac-existing-tests**：现有 `src/renderer/src/views/DirectoryView.test.tsx` 与 `App.test.tsx` 中目录对比相关用例语义不变并全部通过（滚动比例、restore、empty-filter 文案、DOM 上限等）。
- **ac-batch-multi-dir-per-call**：对含 ≥ 8 个目录的临时 fixture 扫描，记录到的批量列目录调用中至少有一次携带 ≥ 2 个目录路径，且总批量调用次数严格小于被扫描目录数（证明一个往返覆盖多个目录）。
- **ac-default-concurrency-16**：对含 ≥ 32 个可列目录的 fixture，用默认参数扫描：实测在飞批量请求峰值 ≥ 16，且 ≤ 遍历并发上限常量；该默认常量在单一来源导出且数值 ≥ 16。
- **ac-concurrency-cap**：显式传入并发上限（如 4）扫描同一 fixture：实测在飞峰值 ≤ 4，产出的树、`index` 键集合、四态计数与 `skipped` 与默认并发下逐项相等。
- **ac-parity-temp-fixture**：真实临时目录 fixture（多级嵌套、空目录、同名不同层文件、仅 mtime 不同、同 size 同 mtime 不同内容、符号链接、不可读条目）上，批量/并发扫描得到的树（名称、层级、顺序、`size`、`modifiedMs`）、`index` 键集合、`skipped` 与同 fixture 的串行基线扫描逐项相等；`compareDirectories` 的四态计数与串行基线相等。
- **ac-parity-samples**：内置样本 `/samples/directory/**` 目录对比经批量扫描后，树、四态计数与 `skipped` 与既有串行基线和现有测试断言一致（样本路径在批量通道可用）。
- **ac-skipped-semantics**：fixture 中不可读条目保持平台标注 `broken` 并各计 `skipped` 1 次，符号链接（含悬空链接）作为叶条目进树、不计 `skipped`（口径见 `symlink-semantics` 域 `ac-dangling-link-compared`）；一个不可列子树只计 `skipped` 1 次且不出现在树中，扫描仍整体成功；fixture 中的 `.git`、`node_modules` 目录被正常列出并参与对比，不被静默跳过。
- **ac-root-unreadable-rejects**：根目录自身不可列时 `scanDirectory` / `compareDirectories` 以错误 reject（消息含「无法读取目录」与路径），不返回空树。
- **ac-compat-existing-scan**：现有 `scanDirectory(rootPath, list)` 调用形态（`snapshot.ts` / `directoryOps.ts` / `loadSampleSessions.ts` 与既有测试）继续可用；未提供批量能力时扫描结果与批量路径一致。
- **ac-progress-scan-monotonic**：真实临时小目录 fixture（多级嵌套、≥ 3 个待列批次、两侧文件数 ≥ 10）上 `compareDirectories` 带 `onProgress`：收到 ≥ 2 条 `phase === 'scan'` 事件，其 `files` 与 `bytes` 序列各自单调不减；最后一条 scan 事件的 `files` 等于两侧文件总数，`bytes` 等于两侧文件 `size` 之和。
- **ac-progress-digest-chunks**：fixture 中放 N 个 size 与 mtime 相同、内容不同的文件（N 可被 `digestBatchSize` 覆盖值整除且 ≥ 2 块），`compareDirectories` 传 `{ digestBatchSize: 2, onProgress }`：收到与块数相等的 `phase === 'digest'` 事件，其 `files` 递增到 N、`bytes` 最终等于这些文件真实字节数之和，且每个事件在对应分块 settle 之后才出现。
- **ac-progress-no-timer**：用可手动 resolve 的假 `digestFiles`（首个分块挂起）：挂起期间 `phase === 'digest'` 事件数为 0；resolve 该分块后事件数恰好 +1 且数值等于该块结果；整个对比结束后事件数不再增长（不存在定时器驱动的虚构进度）。
- **ac-scan-totals-real**：扫描相位末态事件的 `files` / `bytes` 分别等于左右两侧真实文件总数与文件大小总和（以测试内 fake fs 的真实统计为准）。
- **ac-progress-monotonic**：一次包含多批扫描与多批 digest 块结算的对比中，按时间顺序收集到的全部 `DirectoryProgress` 事件满足 `files` 与 `bytes` 均单调不减，扫描→校验切换处不例外。
- **ac-digest-does-not-reset**：首个 digest 事件的 `files` ≥ 最后一个 scan 事件的 `files`，`bytes` ≥ 最后一个 scan 事件的 `bytes`；不得出现 digest 事件从 0 或从单个 digest 块大小起算。
- **ac-phase-counters**：每个事件都携带 `phase`，且同时暴露「相位内增量」与「流水线累计」两组计数；digest 相位起点相位内文件数为 0，digest 末态相位内文件数等于真实待校验候选文件数，末态累计 `files` = 扫描末态 `files` + 相位内文件增量（同构于 `bytes`）。
- **ac-cancel-no-partial-commit**：分别在扫描相位与校验相位取消后：不新增 / 不改动会话与主视图，取消提示与现有行为一致；被中断的 digest 块内文件不写入缓存，已结算块写入的缓存条目字段完整（`size` / `modifiedMs` / `hash` 齐全）。
- **ac-no-timer-fabrication**：digest 块未结算前不产生 digest 进度事件，对比结束后不再有事件（保持现有行为，不得用计时器插值补进度）。
- **ac-cancel-error-type**：摘要阶段 abort 后 `compareDirectories` 与 `compareDirectorySides` 均以 `OperationCancelledError` reject（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`、消息含「已取消」），且错误不被转成 `FileHandleExhaustedError`、不计入 `skipped`、不返回任何 `DirectoryComparison`。
- **ac-cancel-during-scan**：用永不 resolve 的假 `listDirectories` 挂住扫描中批次后 abort：`scanDirectory` / `compareDirectories` 在 1 秒内以取消错误 reject；abort 之后 `listDirectories` 调用次数不再增加（不再发起新批次）。
- **ac-cancel-during-digest**：用永不 resolve 的假 `digestFiles` 挂住摘要分块后 abort：`compareDirectories` 在 1 秒内以取消错误 reject，abort 后 `digestFiles` 调用次数不再增加，后续分块一个都不发出。
- **ac-cancel-no-partial-cache**：分块为 2 且第 2 块被取消的对比结束后，返回的 `ComparisonCache.hashes` 只含第 1 块已成功结算文件的条目，被中断块的路径没有任何写入；随后用同一缓存重新对比同一对目录成功，四态计数与未取消基线逐项相等。
- **ac-cancel-then-recompare**：取消一次真实临时小目录对比后，用同一平台实例、新 `operationId` 重新对比同一对目录成功完成，四态计数、`skipped` 与未取消基线逐项相等，主进程活动读取流为 0（无句柄残留、无 EMFILE）。
- **ac-no-half-tree-session**：取消后 `compareSides` 以取消结束、不产生 `DirectoryComparison`；`runSidesCompare` 返回 `false`，sessions 列表与取消前逐项相同（无新增 / 无替换），未扫描完成的树不被任何会话或缓存引用。
- **ac-cancel-retry-clean**：同一真实目录对取消一次后立即重跑，得到的四态计数与 `skipped` 与取消前基线一致，且重跑期间没有因句柄残留产生 EMFILE。
- **ac-no-regression**：`pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件零回归；`readTextFile`、`writeTextFile`、`statPath` 等既有能力行为不变；`.ocsnap.json` 快照线格式不变。

## 非目标

- **不做文件级差异算法本体**：行级 / 行内字符级 inline diff、3-way merge 冲突求解与点选合并、CSV 主键列对齐、JSON/YAML 语义归一化 diff 一律不在本域。下钻只把内容带进对应视图并只读呈现，视图增强留给对应子项。
- **不做双向 / 三向同步**：同步为单向（左→右 / 右→左）按方向覆盖，不做双向 / 三向同步、不做内容级合并冲突策略（3-way 归代码域）。
- **同步失败安全已在本域收口（原「不做同步失败安全能力（本阶段）」条作废）**：写前预检、逐项原子写、失败 / 取消逆序回滚（含本次新建的多层目录与 `materialize` 临时沙箱根）、执行中取消与可读失败提示均已交付，见 `ac-preflight-*` / `ac-atomic-write-no-partial` / `ac-rollback-on-failure` / `ac-cancel-*` / `ac-readable-error-with-code` / `ac-session-state-preserved`。仍不做：回滚备份目录 / 版本历史与回收站、暂停 / 恢复 / 断点续传、取消后自动重试、跨设备（`EXDEV`）回退；也**不清理因镜像删除而变空、且执行前就存在的目标目录**（只清理本次执行新建的目录），不做权限 / 属主 / ACL / 符号链接复制。
- **不清理镜像删除产生的空目录**：`buildSyncPlan` 只列文件项，三类清单为空不依赖目录级清理，不改目录级四态口径。
- **不做二进制 / 非 UTF-8 字节级拷贝**：平台读写通道为文本；不做权限 / 属主 / 模式位 / ACL / 符号链接复制；不做回收站、版本保留、保留策略等高级镜像选项。
- **不做持续 / 定时自动同步与 watcher**：不对文件系统做监听、不做增量重扫调度；同步为按需触发（用户点「预览并同步」）。
- **不做模板归位的模糊 / 相似度匹配**：仅精确文件名 + SHA-256 内容哈希；不做重命名识别与内容 diff 匹配，改名文件按「缺失 + B 未使用」处理。
- 不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP。
- **不做目录级下钻与导航栈**：不把子目录作为独立视图打开再逐级返回（树已展示全部层级），不做面包屑路径条、浏览器式前进/后退历史、键盘导航、右键菜单、多选 / 区间选择。
- **不做往返状态跨重启持久化**：过滤/折叠/滚动/选中只保持于当前运行期内存（按目录会话 id），不落盘、不做跨窗口同步，也不为此引入全局状态管理库或持久化层。
- 不做会话关闭与未保存提示（`session-tabs-lifecycle` 子项）、不做原位保存与结果导出（`save-in-place-and-export` 子项）。
- 不做三向或超过两个目录的对比；不做快捷键绑定、命令面板、主题切换与浅色皮肤；不做打包分发、签名、公证、自动更新、CI 发布。
- **不做跨进程进度推送与取消之外的调度**：不新增 `webContents.send` 类 main → renderer 进度事件（进度只由核心批次结算结果在 renderer 侧汇总）；不做暂停 / 恢复 / 断点续传、不做取消确认对话框、不做取消后自动重试（取消就是一次性终止）；不给快照导出 / 同步 / 模板 / 下钻加进度或取消。不新增持久化缓存、不改缓存键 `(path, size, modifiedMs)` 与失效语义。
- **不新增默认忽略规则**：`.git` / `node_modules` / 隐藏文件一律照列；不把不可读条目、不可列子树改成整次失败，也不把 EMFILE/ENFILE 吞成 `skipped`；符号链接按不跟随口径只计 1 条叶条目。
- 不改样本 answer key（`src/shared/fixtures/` 的 `status` 字段）；不改 `.munk/baseline/**`（由 Delivery 折入）。
- **窗口化不改数据语义与取数契约**：不改四态语义、对比 / 合并算法、行级 diff、快照线格式与发布模型；不动 `src/main/**` 扫描与 IPC、`src/preload/**`、`src/shared/platform/**`（批量列目录扫描层已由 `wi_ws_deb41e1c6a5a2b8f` 落地，其契约与语义本期不改）；不新增默认忽略规则、不砍 unreadable / 悬空链接 / 不可读子树的容错。
- **不把 `ScannedTree` / `DirectoryComparison` 搬去主进程或 worker**：本期只做 renderer 窗口化；若窗口化后真实 1.1M 仍 OOM，只写瓶颈归因与下一步建议，不自行扩线。
- **不假装虚拟化**：不「先全量渲染再隐藏」；不靠缩减 fixture 条目数或收窄过滤档达标；不顺手修既有投影语义（如空目录行去噪）、不新增过滤档、不改空态 / 工具栏文案、不改 CSV / 代码视图的虚拟化实现；不新增依赖、不引入新的全局状态容器或新页面。

## 实现约束

- 技术栈已由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案。token 唯一来源 `src/renderer/src/assets/main.css`，差异语义色一律走 `--color-diff-*`，组件不写死颜色 / 尺寸。
- 分层硬约束：目录对比 / 同步 / 模板算法放 `src/core/directory/`（如 `compare.ts` / `sync.ts` / `template.ts`），零 Electron / DOM 依赖，纯函数或「纯函数 + 注入的 IO 回调」，可被 vitest 在 Node 环境直接单测；renderer 只经 `PlatformPort`（`@shared/platform/types`）取文件系统数据，绝不直接 import Electron API。可扩展 `PlatformPort`（保持现有契约语义不破坏，如 `ensureDirectory`、必要时 `copyFile`），新增能力同时给 Electron IPC 与 Web 内存两套实现，新 channel 登记到 `src/shared/platform/channels.ts` 白名单。
- **SHA-256 必须用可在 Node、浏览器与 Electron renderer 三端运行的实现**：renderer 侧不得引入 `node:*`，不依赖难以单测的异步 Web Crypto；核心比对保持同步纯函数。
- 目录扫描 / 读取走 `PlatformPort.selectDirectory` / `listDirectory` / `readTextFile`；写入走 `writeTextFile` / `ensureDirectory`（镜像删除经 `delete-file`）。
- **写入后必须使受影响路径的比对缓存失效**（清 `ComparisonCache.hashes` 对应条目），并让 Web 虚拟文件系统的写入更新其 size / mtime 元数据；否则「size 与 mtime 相同即判相同」的短路会让刷新读到旧结论（Web 侧 `modifiedMs` 恒为 0，尤其危险）。
- **mtime 归一只允许发生在「size + mtime 快路径」的比较上**，粒度为毫秒（`Math.floor(ms)`）：Electron `write-text-file` 回填 `modifiedMs` 时用数值秒 + 亚微秒抬升（`Math.floor(ms) / 1000 + 1e-6`）避免落在整毫秒以下，核心侧 `needsContent` / `classifyPair` 的 mtime 等值判断同步按毫秒归一；内容不同仍必须由 SHA-256 确认 `modified`，禁止用 mtime 抹平伪造 `same`。
- **删除语义单一实现**：继续用 `buildSyncPlan` / `executeSyncPlan`，`deletePaths` 缺省 = 零删除的合同在 `sync.test.ts` 内直接断言；`directoryOps.applySyncPreview` 的非镜像分支传 `[]` 而非 `undefined`，任何调用点都不得因漏传参数删目标文件。预览弹窗新增文案（「全选」「清空」「本次将执行」「无执行项原因」）必须 zh / en 成对并通过 `messages.test` 的英文零汉字规则，样式只用既有 token / `ToolbarButton`。
- **失败安全只在 `src/core/directory/sync.ts` 内扩展**：`SyncIo` 增 `removeDirectory` / `statPath` / `listDirectory`，`SyncExecutionOptions` 增可选 `signal`，失败统一抛 `SyncTargetError`（`name === 'SyncTargetError'`，带 `path` / `code`）；禁止在 renderer 或 main 另写一套同步 / 回滚算法。回滚备份用内存文本备份 + 撤销栈（不落目标侧备份目录），撤销按入栈逆序、单步失败不中断。
- **原子写取自主进程同一条实现**：`platform:write-text-file` handler 改调已存在的 `writeFileAtomically`（同目录临时文件 + `rename`，失败清理临时文件），不引入 `EXDEV` 跨设备回退，不新增第二套原子写；删除 / 建目录 / 删空目录失败统一经 `readableFileFailure` / `readableDirectoryFailure` 转中文句子（含路径与 OS code）。
- **平台缝同步补齐**：`PlatformPort` 只新增 `removeDirectory(path)`（删一个空目录，非空拒绝），并同时补齐 `src/shared/platform/types.ts`、`src/shared/platform/channels.ts`（`platform:remove-directory`）、`src/preload/index.ts` 白名单、Electron handler（`node:fs/promises` 的 `rmdir`）与 Web 内存实现；`statPath` / `listDirectory` 复用既有能力，不新增第二形状。
- **取消沿用核心词汇**：`OperationCancelledError` 来自 `src/core/io`，取消不跨越 IPC handler 边界；`applySyncPreview` 接受可选 `signal` 并贯通到逐项检查点，取消与失败走同一回滚路径但拒绝形态可区分。
- **失败安全用例只扩既有门禁**：并入 `src/sync-real-gate.test.ts`（已登记 `sync-real-gate`），优先不改 `.munk/code-gates.json` 矩阵（每加一项就多付一次真实落盘成本）；测试不得 mock 文件系统，沿用 `vi.mock('electron')` + handler map + `mkdtemp` 真实临时目录；只读目录用例用 `chmod` 构造，root 身份仅跳过该条并保留其余断言。
- 目标 / 源若落在只读的 `/samples` 挂载上，先物化到可写区再执行（Web → `/memory/**`；Electron → 临时目录），保证样本库只读且可重复加载。
- 差异语义复用现有 `DiffStatus`（`same`/`added`/`removed`/`modified`）与 `DiffBadge` / `diffSemantics`，不新造状态枚举；Dry-run 弹窗与模板预览用现有基础组件组合（`Panel` / `Button` / `SegmentedControl` / `DropdownMenu` / `TreeView` / `DiffBadge`），需要弹层语义时用 `role="dialog"` + 焦点管理；不新造第四套视图或重型组件库。
- 匹配与计划生成必须避免 O(n²) 内容比对：哈希 / 文件名建索引后再匹配。
- 大目录操作不阻塞 UI：执行 / 匹配期间有忙碌态与错误提示（复用现有 `busy` / `notice`），失败要给出可理解信息且不静默半途写坏目标侧。
- 下钻复用现有 `CodeView` / `CsvView` / `StructuredView`，不新写第四个文件查看器；工作台会话模型支持「非样本来源」的会话。
- 目录视图数据源必须换成运行时计算结果：`DirectoryNode.status`（样本 answer key）不再作为目录视图输入，仅 `src/shared/fixtures/` 的校验用例继续使用。
- 现有 `src/renderer/src/App.test.tsx` 与目录视图 / 下钻 / 同步 / 模板归位相关断言需随改造同步并保持绿。
- **目录树状态不得依赖组件本地挂载生命周期**：`TreeView` 的展开态、选中行改为受控 props（`collapsedPaths` / `selectedPath` + 回调），滚动位置经 `Panel` 的 `bodyRef` / `onBodyScroll` 上报；工作台壳层按 `sessionId` 保存 `{ filter, collapsed, selectedPath }` 与 `{ left, right }` 滚动偏移，返回时经 `useLayoutEffect` 回填。不为此引入全局状态管理库。
- 下钻会话身份带来源：`createDrilldownSession(parentId, …)` 产出 `file:{parentId}::{relativePath}` 并写 `parentDirectoryId`；返回落点由 `resolveDirectoryReturn(sessions, sourceId)` 纯函数决定（来源会话 → 其他可用目录会话 fallback → `null`），兜底提示复用 `report(message, tone)`。
- 选中高亮与返回入口只引用 `main.css` 语义 token 与既有 `focus-ring` / `transition-fast` utility；点展开/折叠按钮 `stopPropagation`，避免误改选中。
- **行模型是纯函数，放 `src/core/directory/rows.ts`**：零 Electron / DOM 依赖，按 `(root, filter, side, collapsed)` 产出 `length` / `at(index)`，另提供 `visibleDirectoryCounts(root, filter)`；过滤 / 投影基准只认现有 `filterDirectoryTree` → `projectDirectoryTree` 行为（测试以之为 oracle），不另立语义。
- **单一行高常量**：`DIRECTORY_ROW_HEIGHT = 24`（`h-6`）同时供占位计算与测试推导，禁止出现第二个魔法行高。
- **行模型只按内容变化重建**：折叠集合由 `ReadonlySet` 改为稳定 `readonly string[]`（Workbench 直接传 `treeState.collapsed`），不得因外层重渲染对百万级树反复重建。
- **虚拟化锚定 `Panel` body**：滚动容器仍是 `Panel` 的 body（`getScrollElement`），`initialOffset` 取 shell 保存的 `scrollTop`，下钻返回挂载时虚拟窗口与恢复后的滚动位置一致（不先渲染首屏再跳）；renderer 用例用 `// @vitest-environment jsdom` 并桩 `clientHeight` / `clientWidth` 为 1200×640（参考 `CsvView.test.tsx`），滚动以赋值 `scrollTop` + `fireEvent.scroll` 驱动。
- **真实大目录 fixture**：`mkdtemp` 建临时目录、用例结束递归清理；两侧各 ≥26,000 条目（合计 ≥5 万）、嵌套 ≥3 层、四态各 ≥1,000，`same` 对写入后用 `utimes` 固定 mtime 避免状态抖动；用例超时可放宽到 120s，但仍须包含在 `pnpm test` 内。
- 不改 `.munk/code-gates.json` 的六条命令与顺序；不新增依赖（`@tanstack/react-virtual` 已在依赖中，CSV 视图已有同款用法）。
- **遍历复用既有并发工具，不引新依赖**：批量取数经 `@core/io` 的 `mapWithLimit`（保序、首错停发、等在飞收敛、绝不返回部分结果）与 `toReadableIoError`；不引 `p-limit` / `p-queue`。**遍历并发（默认 16）与主进程 `stat` 预算（默认 16）是两个独立常量**，各自单一来源导出（`DEFAULT_TRAVERSAL_CONCURRENCY` / `DEFAULT_STAT_CONCURRENCY`）并可在测试中传入覆盖值；不得靠抬高 `DEFAULT_IO_CONCURRENCY`（摘要/内容读取默认 8）来达成遍历默认值，调用点不重复硬编码数字。
- **批量能力按新增能力 + 可选参数接入**：`scanDirectory(rootPath, list, options?)` 与 `ComparisonIoOptions`（extends `ScanDirectoryOptions`）尾参可选，既有调用点不必改写；真实运行路径（`directoryOps` 的 `compareRoots` / `syncIo` 扫描、`snapshotOps` 的对比与快照导出、`loadSampleSessions`）与 `compareDirectorySides` 均透传 `listDirectories`。
- **排序、`skipped` 计数位置与失败容错分支沿用 `compare.ts` 既有口径，不重排索引结构。**
- **进度与取消都是可选尾参**：既有 `scanDirectory(rootPath, list)` / `compareDirectories(...)` 位置参数与既有测试继续可用；`files` / `bytes` 为**跨相位单调不减的流水线累计**（digest 以扫描末态为基数 `progressBase`，不重新从 0 计数），相位内增量另以 `phaseFiles` / `phaseBytes` 表达；每结算一个批量 / 分块最多回报一次，禁止按文件逐条刷屏、禁止定时器与预估插值。
- **批次挂起必须用 abort 竞速**（`@core/io` 的 `abortable`，即 `Promise.race` 或等价），而不是「等在飞收敛」；这样取消停止时间上界与平台调用是否响应无关。被放弃的在途 promise 必须挂 `catch`，不得产生 unhandled rejection。
- **摘要分块大小单一来源导出**（`compare.ts` 的 `DEFAULT_DIGEST_BATCH_SIZE`），可在测试经 `digestBatchSize` 覆盖；每结算一块才写该块成功项的 `cache.hashes`，取消时不写未结算块。核心不感知 `operationId`，只透传 `signal`。

## 最近交付证明

- WI：`wi_ws_08b7067f448f263b`（真实目录同步失败安全收口：写前预检 + 逐项原子写 + 失败 / 取消逆序回滚 + 可读错误与状态保持，`kind: feature`）
- 日期：2026-10-31
- 结果：code_gates passed（11 gates，attempt 001，`.munk/runs/run_ws_f06a7d04d430ead2/code-gates/attempts/001/manifest.json`；失败安全用例并入既有 `sync-real-gate`，未新增矩阵项；`needSelfTest=false`，不做实机 GUI 验收）。
- 覆盖摘要：① **写前预检**——`executeSyncPlan` 先经 `SyncTargetState`（`statPath` / `listDirectory` 缓存）校验目标根存在且为目录、每个写入 / 勾选删除项的父链逐层是目录（`ENOTDIR`）、目标位置不是同名目录（`EISDIR`），最后在目标根写并删除 `.opencompare-sync-probe-*` 探测文件确认可写；预检只读 + 一个必删探测文件，拒绝时目标树逐项不变。② **逐项原子写**——`platform:write-text-file` handler 由直写 `writeFile` 改为复用 `writeFileAtomically`（同目录临时文件 + `rename`，失败清理），mtime 回填仍为数值秒 + `1e-6`；新增 `removeDirectory` 通道 / preload 白名单 / Electron `rmdir` / Web 内存实现。③ **逆序回滚与取消**——`writeItem` 覆盖前备份目标字节与 `modifiedMs`，删除前同样备份，新建目录经 `ensureDirectoryTracked` 逐层入撤销栈；失败 / 取消统一 `rollback(undo)` 逆序执行（单步失败不中断）后抛原错误；`SyncExecutionOptions.signal` 在每项与单次写入的读写边界检查，取消抛 `OperationCancelledError`（`ECANCELED`、不含系统码），失败抛 `SyncTargetError`（中文句子 + 目标路径 + 系统码，含 `ENOTDIR` / `EISDIR` / `EBUSY` 等 gloss）。④ **renderer 收口**——`applySyncPreview` 增可选 `signal`，失败 / 取消时清掉 `materialize` 构建的沙箱（`discardSandbox`：逆序删文件、由深到浅 `removeDirectory`、仅删本次新建根）并剥掉 `Error invoking remote method …` 包装后 reject，不产出新 `DirectoryComparison`；`Workbench.handleConfirmSync` 用 `AbortController`，取消显示 `shell.notice.syncCancelled`（info），失败显示可读原因（danger），`busy` 复位且弹窗保留；`DirectorySyncDialog` 忙碌态「取消」改为 `onAbort`（不再禁用）。⑤ **证据**——`sync.test.ts` 新增 `sync failure safety` 5 条（占用目标预检、只读目标预检、中途失败逐项回滚、取消回滚 + 与失败可区分、失败时未勾选删除项留存）；`sync-real-gate.test.ts` 新增 `real-disk sync failure safety` 5 条真实临时磁盘用例（`chmod 0555` 只读根且 root 身份仅跳过该条、计划过期后同名目录占位 `EISDIR`、`deleteFile` 抛 `EBUSY` 的逆序回滚 + 同一 preview 重试、中途 `abort()` 回滚 + 冷 Dry-run 与真实磁盘一致、零勾选删除失败后原样留存），单例 ≤ 200 文件、每组 60s 上限；`electron-platform.test.ts` / `web-platform.test.ts` / `preload/index.test.ts` 覆盖原子写、`removeDirectory` 与桥接表面，`directoryI18n.test.tsx` 覆盖新键与新 props。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收按 AC 落档为 `qa/sync-failure-safety.md`（非 change-pack 用例）。新增平台能力（`removeDirectory`、`writeTextFile` 原子化、可读写 / 删 / 建目录错误）落在 `domains/foundation`，取消提示词条 `shell.notice.syncCancelled` 落在 `domains/i18n`。
- 后续注意：① **预检必须保持只读**——除那个必删探测文件外，预检阶段任何写都会破坏「拒绝时目标逐项一致」的合同，新增检查项时先想清楚它读还是写；② **回滚备份是内存文本备份**，二进制 / 大文件同步仍是 Non-Goal，扩到字节级拷贝时备份与恢复策略要重做，不能直接沿用 `string` 备份；③ 撤销栈只记录**本次运行产生**的目录，执行前就存在的空目录不得进栈，否则回滚会删掉用户的目录；④ `sync-real-gate` 的只读用例依赖 `chmod`，在以 root 运行的 CI 上会 `skipIf`——把该条当成「本机权限路径证据」而非全环境保证。

- WI：`wi_ws_7efd09ed8abe2eda`（真实外部目录双向镜像同步闭环：删除安全默认反转 + mtime 毫秒归一 + 真实磁盘规模门禁，`kind: feature`）
- 日期：2026-10-31
- 结果：code_gates passed（11 gates，attempt 001，`.munk/runs/run_ws_ad95f49955770496/code-gates/attempts/001/manifest.json`；新增 `sync-real-gate` 在矩阵内且单跑通过；`needSelfTest=false`，不做实机 GUI 验收）。
- 覆盖摘要：① **删除语义反转**——`executeSyncPlan` 的 `deletePaths` 由「缺省 = 全删」改为 `new Set(options.deletePaths ?? [])`（缺省 / 空集零删除），`DirectorySyncDialog` 的 `excluded` 集合改为 `selected` 集合并初始为空，逐项复选框默认未勾，新增组级「全选 / 清空」与底部「本次将执行：新增 X · 覆盖 Y · 删除 Z」；确认按钮由 `empty` 改为 `executableCount === 0` 禁用，`blockedByDeletes`（只有未勾选删除项）渲染可见原因，忙碌态复选框 / 组级按钮一并禁用。`directoryOps.applySyncPreview` 非镜像分支改传 `[]`。② **mtime 幽灵差异消除**——主进程 `write-text-file` 回填 mtime 由 `new Date(modifiedMs) + utimes(Date)` 改为数值秒 `Math.floor(ms) / 1000 + 1e-6`；`compare.ts` 新增 `sameModifiedMillisecond`（`Math.floor(ms)` 相等）供 `needsContent` 与 `classifyPair` 使用，内容确认仍由 SHA-256 决定 `same` / `modified`。③ **真实磁盘规模门禁**——新增 `src/sync-real-gate.test.ts`（`mkdtemp` + 真实 IPC handler，两侧各 1,000 文件、6 层嵌套、四态齐备、`资料 夹/第一层 子目录/…/第五层` 中文空格路径）：双向 copy/update/delete 逐条与磁盘对应、`same` 不进组、空 / 缺省 `deletePaths` 零删除、显式勾选只删该项、apply 后内容与 mtime（毫秒）一致、返回比较与独立重比相等、二次 Dry-run 全 0；`package.json` 加单 argv `test:sync-real`，`.munk/code-gates.json` 末尾追加第 11 项 `sync-real-gate`（门禁矩阵形状见 `domains/quality-gates`）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；本域 `qa/sync-mirror-delete.md` 的期望已按新合同（默认不勾）改写并记录本轮真实磁盘门禁证据，其余 `sync-*` 用例定义未受影响。预览弹窗新增四条词条（`directory.sync.selectAll` / `clearSelection` / `summary` / `noExecutable`）的 zh / en 口径同步在 `domains/i18n`。
- 后续注意：① **「默认勾选删除」是本域最容易被旧记忆带偏的一条合同**——任何新增同步入口或测试都要按「缺省零删除」写，别再用 `deletePaths === undefined → 全删」的旧注释 / 旧断言；② mtime 归一**只允许在快路径比较上**，把它扩散到缓存键或写盘时间戳会让 `same` 判定失去内容校验；③ 本阶段成功路径之外仍无取消 / 回滚 / 预检，真实目录大规模镜像中途失败会留下部分写入，后续失败安全项要按此前提设计。

- 交叉引用（非本域 AC）：`wi_ws_b32f99362fb6b51b`（2026-10-30，`kind: fix`）只改 `DirectoryView.tsx` 的三条 `view-toolbar` **行容器** class（追加 `min-w-0 overflow-x-auto scrollbar-none`）以修窄档横向溢出；目录树 / 行模型 / 过滤 / 折叠 / 选中 / 下钻 / 同步 / 模板语义零改动，AC 定义与门禁记录归 `domains/workbench`「视图工具区窄档横向滚动兜底」小节。

- WI：`wi_ws_601ef56ae8fd93a4`（取消结构化返回、零日志噪声与零残留，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（含新增 `cancel-gate`；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：本轮**不改** `src/core/directory/**` 的取消控制流（`signal` / `abortable` / 取消 catch 分支、`scanDirectory` 不返回部分树、`digestContentCandidates` 分块写缓存时机原样保留），只在 renderer 适配层交汇：`snapshotOps.compareSides` 的 digest seam 改为 `digestFilesForComparison(platform, paths, { operationId })`，`directoryOps.compareRoots` 与 `loadSampleSessions` 同样改经该适配器，故平台返回 `{ cancelled: true }` 时由渲染进程抛回 `OperationCancelledError`，上层既有 catch（不提交会话、不返回 `DirectoryComparison`）照常命中。`cancel-gate.test.ts` 用 `unwrapDigestResult` 复刻同一适配语义，覆盖「第 2 块取消后缓存只含第 1 块完整条目 + 重跑四态与基线一致 + 流/注册表计数归零」。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；结构化契约与平台缝归 `domains/foundation`，零 stderr 噪声 / 残留计数 / 门禁注册归 `domains/io-concurrency`，摘要块与缓存完整性归 `domains/content-digest`，取消提示 UI 归 `domains/workbench`。

- WI：`wi_intake_f1695c0476174245`（目录对比跨相位进度归零修复，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增「多批扫描 → 多批 digest 切换」与扫描相位取消用例）。
- 覆盖摘要：`DirectoryProgress` 扩为 `{ phase, files, bytes, phaseFiles, phaseBytes }`，`files` / `bytes` 改为**整条流水线累计**、`phaseFiles` / `phaseBytes` 承载相位内增量；新增导出 `ProgressBase` 与 `ScanProgressMerger`（`createScanProgressMerger` 由返回 `() => ProgressReporter` 改为返回 `{ reporter(), totals() }`），`ComparisonIoOptions` 增可选 `progressBase`。`digestContentCandidates` 以 `options.progressBase ?? { files: 0, bytes: 0 }` 为基数回报 digest 事件（相位内从 0 起、末态 = 真实候选数），`compareDirectories` 把 `sideProgress.totals()` 注入 digest 相位，`snapshot.ts:compareDirectorySides` 同样以目录侧扫描末态为 digest 基数（含 snapshot 挂载分支），不再二次遍历 `ScannedTree` 重算。`compare.test.ts` 增「keeps pipeline totals monotonic across multi-batch scan and digest phases」（多批扫描 + `digestBatchSize: 2` 多块：全体事件 `files` / `bytes` 单调不减、首个 digest ≥ 末个 scan、`files - phaseFiles === lastScan.files`、末态相位内 = 总候选、对比结果不变）与扫描相位取消用例断言；旧「相位内计数」断言 `[2,4,6]` / `{ phase:'digest', files:2, bytes:10 }` 按新语义更新为 `[8,10,12]` / `{ files:6, bytes:30, phaseFiles:2, phaseBytes:10 }`，每块一次事件、块未结算不报的行为保留。渲染侧相位分段文案归 `domains/workbench`。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；壳层进度条文案与不回退断言折叠在 `domains/workbench`。

- WI：`wi_intake_faea4044a6334067`（目录树超大行数（≥150 万行）尾部不可达修复，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 含新增 1,516,096 行 / 70 万行用例全绿）。
- 覆盖摘要：`src/core/directory/rows.ts` 新增 `DIRECTORY_MAX_TREE_HEIGHT = 16_777_215` 与纯函数 `createDirectoryScrollMap(rowCount, viewportHeight)`（返回 `contentHeight` / `maxScrollOffset` / `scaled` / `offsetForIndex` / `rowPositionForOffset` / `indexForOffset` / `visibleRange` / `rowTop`）：总高未超限时退化为 `index * 24` 恒等映射，超限时容器高钉在 2^24 以下、行按 `maxScrollOffset / (rows - 1)` 步长共享可达偏移，末行恰好落在 `maxScrollOffset`，`rowPositionForOffset` 给出连续锚点消除尾部死区。`TreeView` 仍以 `useVirtualizer` 观测滚动偏移与视口高度，但渲染窗口改由该映射产出（`visibleRange` + `rowTop`），容器加 `overflow-clip` 防止 overscan 行撑大滚动区；其余行渲染结构、`aria-level` / `title` / 状态徽标与 props 契约不变。测试：`rows.test.ts` 增 `createDirectoryScrollMap` 三条（上限内恒等、越界首行切换压缩映射、1,516,096 行高度封顶且索引严格递增可达）+ 70 万行 comparison 三条（五档 × 两侧 filter/project parity、四态计数 parity、10 万条目录折叠展开）；新增 `TreeView.test.tsx`（jsdom 640px 视口）六条（1.5M 行高度封顶与小树像素恒等、最大偏移处渲染末行、采样索引与尾部目录按映射可达、任意位置/总行数下窗口有界、尾部行选中后重挂载恢复、重展开 87,500 文件目录仍能滚到末子项），fixture 由新增 `src/test/largeDirectory.ts` 合成（8 × 100,000 文件）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；prd 的 `ac-drilldown-restore` 与既有同名验收（过滤+折叠+选中+滚动往返）语义不同，折叠为 `ac-huge-rows-drilldown-restore` 以保留两条口径。

- WI：`wi_ws_90a06ca6d557d5cd`（扫描/哈希进度与可取消，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增进度/取消用例）。
- 覆盖摘要：`compare.ts` 新增 `DEFAULT_DIGEST_BATCH_SIZE = 64`、`DirectoryProgress` / `ProgressReporter`、`createScanProgressMerger` 与 `ScanDirectoryOptions` 的 `signal` / `onProgress`；`scanDirectory` 每结算一个批量列目录批次回报一次 scan 进度（只计非 `broken` 文件与其 `size`），两级批次边界均 `throwIfAborted`，在飞 `listDirectories` 经 `abortable` 竞速；`digestContentCandidates` 改按块顺序 `digestFiles`（每块 settle 后写 cache 并回报 digest 进度，失败项仍记 `unreadable`），文本回退分支同样 `abortable` 且取消错误原样上抛；`compareDirectories` / `compareDirectorySides`（`snapshot.ts`）两侧扫描经 `createScanProgressMerger` 合并为一条单调流。取消即 reject，不返回部分树/部分结果，`OperationCancelledError` 不转 `FileHandleExhaustedError`、不计 `skipped`。`compare.test.ts` 新增「directory progress and cancellation」9 条（scan 单调且终值等于两侧文件/字节、每分块一次 digest 事件、挂起块零事件无定时器插值、摘要取消错误形态、挂起扫描 1s 内拒绝且不再发批次、挂起摘要块取消后不发后续块、只保留已结算块缓存后重比一致、全缓存二次对比无 digest 事件）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；取消错误与 abort 竞速口径折叠在 `domains/io-concurrency`，`operationId` 分块语义折叠在 `domains/content-digest`，进度条 / 取消按钮折叠在 `domains/workbench`，平台缝与 Web 同构折叠在 `domains/foundation`。

- WI：`wi_ws_4829ebe71d4e966e`（真实修改原位保存回磁盘与结果导出为文件产物，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test skipped（本项 UI 自测改由 code_gates 关点；本轮本域无代码改动，仅回归确认）。
- 覆盖摘要：本轮新增的「原位保存 / 导出改走系统保存对话框」未触及目录同步与模板归位路径——`DirectorySyncDialog` / `TemplateDialog` 的 `role="dialog"` 预览、目标根与分组明细、确认前不写、取消不写、确认后重跑对比的语义原样保留；`DirectoryView` 仅两条快照导出按钮的 title 文案改为「经系统保存对话框」，同步 / 模板归位入口与文案未动。`ac-existing-confirmations` 由折叠用例 `qa/existing-confirmations-unchanged.md` 覆盖。
- 注：本 WI change pack 未提供 `tech.md` / `ux/**`，本轮 tech/ux 折叠跳过。
- WI：`wi_ws_4e87a158048a1dcb`（目录下钻返回上级与往返状态保持，`kind: feature`）
- 日期：2026-10-19
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿，含随动与新用例）。
- 覆盖摘要：`session.ts` `WorkbenchSession` 新增 `parentDirectoryId`；`directoryCompare.ts` `createDrilldownSession(parentId, …)` 以 `file:{parentId}::{relativePath}` 生成会话 id 并记录来源，新增纯函数 `resolveDirectoryReturn(sessions, sourceId)`（来源会话 → 其他目录会话 fallback → `null`）；`TreeView` 去掉每个 `TreeNode` 的 `useState(true)`，改为受控 `collapsedPaths` / `selectedPath` + `onTogglePath` / `onSelectPath`，行单击单选并 `aria-selected` + `bg-accent-soft` 高亮（展开按钮 `stopPropagation`）；`Panel` 新增 `bodyRef` / `onBodyScroll` 暴露滚动容器；`DirectoryView` 接收 `sessionId` 与受控树/滚动状态，`useLayoutEffect` 回填左右 `scrollTop`；`Workbench` 以 `directoryStates`（filter/collapsed/selectedPath）与 `directoryScroll`（left/right）按目录会话 id 保存，下钻文件视图顶部新增「返回上级目录视图」按钮 + 「来源目录对比：<标题>」条，`backToDirectory` 按 `resolveDirectoryReturn` 落点并对不可用来源给出 `report` 提示。十条验收均有对应折叠用例（qa/）。`App.test.tsx` 覆盖返回落点、往返过滤/展开/滚动/选中保持、同相对路径下钻隔离与来源不可用兜底，`directoryCompare.test.ts` 覆盖返回落点解析。
- 注：本轮 WI change pack 未提供 `tech.md` / `ux/**`，全局 tech / design 折叠跳过。真实目录往返的 Electron 窗口人工复核口径由 `qa/back-to-parent-directory.md` 等用例描述承载；自动用例使用脚本化内存 PlatformPort。
- WI：`wi_ws_deb41e1c6a5a2b8f`（目录条目批量 IPC 与 ≥16 路有界遍历，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 含新增批量扫描用例全绿）。
- 覆盖摘要：`scanDirectory` 由逐层串行 walk 改为**队列 + 批量取数 + 有界并发**——`PendingDirectory` 层队列、`resolveBatchSize` 收缩批大小、`mapWithLimit(batches, { concurrency })` 限制在飞批量调用、`finalize` 递归排序组装（保留名称 `localeCompare` 排序与索引结构）；新增导出 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`、`DEFAULT_DIRECTORY_BATCH_SIZE = 8`、`ScanDirectoryOptions`、`ListDirectories`，`ComparisonIoOptions` 改为 extends `ScanDirectoryOptions` 并把 `options` 透传到 `compareDirectories` 的两侧扫描与 `compareDirectorySides`（`snapshot.ts`）。容错口径原样保留：broken 条目计 `skipped`、不可列子树只计 `skipped` 1 次且不进树、根槽位失败 reject（「无法读取目录 <path>：…」）、EMFILE/ENFILE 经 `toReadableIoError` 致死、批量槽位数/顺序不符整次 reject 不返回部分树。`compare.test.ts` 新增「batched directory scan」8 条用例（一次往返覆盖多目录且调用次数少于目录数、默认在飞峰值 ≥ 16、显式 cap 4 后树/index/skipped 逐项相等、槽位失败时与串行树一致、缺槽位 reject、根失败 reject、批量路径下 EMFILE 致死而非计入 skipped、四态分类经批量能力一致）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠跳过；平台能力缝（`PlatformPort.listDirectories`）折叠在 `domains/foundation`，遍历并发与主进程 `stat` 预算口径折叠在 `domains/io-concurrency`。
- WI：`wi_intake_a115f1b8d92ea2fe`（目录对比树窗口化渲染，消除大目录 renderer OOM，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（`needSelfTest=false`，UI 自测跳过；attempt 001 六条全绿；整合 main 后复跑 `pnpm test` 29 files / 478 passed / 1 skipped、`pnpm typecheck` 绿）。
- 覆盖摘要：新增纯行模型 `src/core/directory/rows.ts`（`buildDirectoryRowModel` / `visibleDirectoryCounts` / `DIRECTORY_ROW_HEIGHT=24`，节点按引用不克隆）；`DirectoryView` 去掉 `filterDirectoryTree` + 左右 `projectDirectoryTree` 克隆，改为按 `(filter, side, collapsedPaths)` 建行模型，并经 element state 把 `Panel` body 交给虚拟化测量；`TreeView` 从全量递归 `TreeNode` 改为 `useVirtualizer`（`overscan=10`、`initialOffset` 恢复滚动、`aria-level` 补层级）；`Workbench` 状态栏 `visibleCounts` 改由根节点 `counts` 派生，折叠集合改传稳定数组。十一条验收由 `src/core/directory/rows.test.ts`（5 档 × 2 侧 filter/collapse parity、节点 `===` 身份、`visibleDirectoryCounts` parity）与 `src/renderer/src/views/DirectoryView.test.tsx`（`mkdtemp` 真实 50k 条目 fixture：双栏 ≤80 `treeitem` / ≤5000 元素、5,000 vs 50k 等量窗口、2 万子项目录展开、远端滚动索引与占位高度、五档过滤前缀与空档文案、下钻返回恢复、`filterDirectoryTree`/`projectDirectoryTree` mock 计数为 0）覆盖；`App.test.tsx` / `App.snapshot.test.tsx` 增 1200×640 client box 桩。与同日落地的批量扫描（`wi_ws_deb41e1c6a5a2b8f`）不冲突：本期只改 renderer 呈现层与行模型，扫描 / IPC 契约未动。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tech.md` / `ux/**`，也无 `tests/cases/**`），tech / design 与 qa 用例折叠跳过。真实 1.1M 目录复测不在本期自动化证据内：prd 实机记录显示崩溃时 DOM 仅 187 节点，死点在树构建 / 对比 / 行物化而非 DOM 数量，本期已移除该死点，但环境允许时仍需复测 1.1M 并如实记录剩余瓶颈（不扩范围）。
