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
- **同步计划生成器（`src/core/directory/`，纯函数）**：基于现有 `DirectoryComparison` 输出某方向（**左→右 / 右→左**）的变更清单：`copy`（源侧有、目标侧不存在的新增拷贝）、`update`（两侧都存在且 `modified` 的覆盖修改）、`delete`（仅**镜像模式**下，目标侧独有的文件；默认勾选、可逐项取消）。`same` 文件不进清单。每项带相对路径、源/目标绝对路径与字节数；计划带 `count`/`bytes` 分组汇总与 `totalCount`/`totalBytes`。
- **执行器**：按计划经 `PlatformPort` 写入目标侧，自动创建缺失的中间目录；镜像模式按传入的 `deletePaths` 只删除选中项；写入后使受影响路径的比对缓存失效；同一方向重复执行后计划为空（幂等）。
- **Dry-run 预览确认弹窗**：执行前弹出弹窗，分组列出待新增拷贝、待覆盖修改（镜像模式另列待删除项），显示字节汇总与目标根路径；**取消不写任何文件**；确认后才执行；执行完成后自动重跑 `compareDirectories`，目录树、徽章与状态栏统计随之刷新。
- **模板归位匹配器（`src/core/directory/`，纯函数）**：以模板树 A（当前目录会话左/源侧，或用户选定目录）的**相对路径槽位**为骨架，用「**文件名 + SHA-256 内容哈希**」从层级被打乱的树 B（内置 `/samples/directory/incoming` 或用户选定目录）中匹配文件，产出 `matched`（A 槽位 ← B 文件，文件名一致且内容哈希一致）、`missing`（A 槽位在 B 中无同名候选）、`conflict`（同名候选内容不同 `content-mismatch`，或同名候选多于一个 `ambiguous`）、以及 B 中未被消费的 `unused` 文件。匹配经哈希索引 + 文件名索引完成，线性复杂度，不做两两内容比对。
- **模板预览与提取归位**：视图展示归位映射预览（已匹配相对路径映射、缺失槽位、冲突项、B 未使用文件；确认前不写任何文件）；确认后按模板 A 的相对路径结构写出所有 `matched` 文件（自动创建缺失父目录）到目标根，完成后用同一匹配器复核归位结果。
- **批量取数与有界遍历（`src/core/directory/compare.ts`）**：`scanDirectory` 从「逐层串行、一个目录一次 `list`」改为**队列 + 批量取数 + 有界并发**——按层收集待列目录，一次 `listDirectories` 往返携带多个目录（默认批大小 `DEFAULT_DIRECTORY_BATCH_SIZE = 8`，队列不足时按 `ceil(待列数 / 并发)` 收缩但不少于 2），由 `mapWithLimit` 限制在飞批量调用（默认 `DEFAULT_TRAVERSAL_CONCURRENCY = 16`，可经 `ScanDirectoryOptions.concurrency` 覆盖）。批量/并发只改「怎么取数」：树结构、按名称 `localeCompare` 排序、`index` 相对路径键、四态配对、`skipped` 计数口径与不可列子树容错与串行基线逐项一致；批量槽位缺失或槽位顺序与请求不符即整次 reject，绝不返回部分 `ScannedTree`。既有 `scanDirectory(rootPath, list)` 调用形态保留，缺批量能力时由 `perDirectoryBatches` 适配为批形态。
- **内容读取的有界并发与句柄错误（横切契约，归 `io-concurrency` 域）**：`compareDirectories` 的候选正文读取经 `@core/io` 的 `mapWithLimit` 走默认 `DEFAULT_IO_CONCURRENCY`（8）窗口，`scanDirectory` 单层 `list` 失败转成可读句柄错误；`compareDirectories` / `compareDirectorySides` 新增可选 `ConcurrencyOptions` 尾参供测试收窄窗口。`EMFILE` / `ENFILE` 统一转成「文件句柄」可读错误向上抛，不返回部分结果。
- **内容确认的字节摘要（横切契约，归 `content-digest` 域）**：目录对比的内容确认改为先按 size/mtime 快路径 + `(path, size, modifiedMs)` 缓存算出待确认路径，再经 `PlatformPort.digestFiles` 对**原始字节**批量取 SHA-256（不读 UTF-8 正文），摘要写回同一 `ComparisonCache.hashes`；未提供摘要能力时回退既有文本读取路径。`compareDirectories` 尾参类型为 `ComparisonIoOptions`（`ConcurrencyOptions` + 可选 `digestFiles` / `digestible`）。非法 UTF-8 的二进制内容因此能被判 `modified` 而不被解码抹平；四态语义、缓存键与失效钩子不变。
- **扫描 / 摘要进度（`src/core/directory/compare.ts`，流水线累计口径）**：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 提供可选 `onProgress(progress)` 尾参，每结算一个真实批次（批量列目录或摘要分块）最多回报一次 `DirectoryProgress = { phase: 'scan' | 'digest', files, bytes, phaseFiles, phaseBytes }`。**`files` / `bytes` 表示整条流水线的累计值，跨相位单调不减**——digest 相位以 `createScanProgressMerger` 已累计的扫描末态（两路 side 合并后的 `totals()`，经 `ComparisonIoOptions.progressBase` 注入）为基数，只叠加本相位真实增量，绝不从 0 或单个摘要块大小重新起算；**`phaseFiles` / `phaseBytes` 表示相位内增量**（scan 相位即其流水线累计值，digest 相位从 0 起、末态等于真实待校验候选文件数）。扫描阶段统计已发现（非 `broken`）文件数与其 `size` 之和，两侧扫描合并成一条单调流；不做定时器插值/预估，块未结算不报、对比结束后不再报；全缓存二次对比不产生 `files > 0` 的 digest 事件。
- **摘要分块与进度步长（`src/core/directory/compare.ts`）**：`digestContentCandidates` 不再把所有待确认路径压成一次请求，改按导出常量 `DEFAULT_DIGEST_BATCH_SIZE`（64）顺序分块调用 `digestFiles`，每结算一块才写该块成功项的 `cache.hashes` 并回报一次 digest 进度；块大小可经 `ComparisonIoOptions.digestBatchSize` 覆盖（低于 1 回退默认）。单块内仍由平台层有界并发。
- **核心层取消（`src/core/directory/compare.ts` + `src/core/io.ts`）**：`ScanDirectoryOptions` / `ComparisonIoOptions` 新增可选 `signal: AbortSignal`；扫描与摘要每个批次边界检查，abort 后不再发起新批次；在飞批次经 `abortable` 与 signal **竞速**立即以取消错误 reject——即使平台调用永不 resolve 也不得挂住。取消是独立失败路径：`scanDirectory` / `compareDirectories` / `compareDirectorySides` 取消即 reject，**绝不返回部分树、部分对比结果或空树**，`OperationCancelledError` 不会被转成 `FileHandleExhaustedError`、不计入 `skipped`；被中断块的路径不写缓存，已结算块保留，随后用同一缓存重新对比结果与未取消基线逐项相等。
- **不可读项 / 悬空链接容错（横切契约，归 `io-tolerance` 域）**：`scanDirectory` 跳过平台标注的 `broken` 条目与不可列举子树并累计 `ScannedTree.skipped`（根目录失败仍 reject）；`compareDirectories` / `compareDirectorySides` 把两侧 `skipped` 与正文不可读对汇总到 `DirectoryComparison.skipped`，正文读取失败的文件对判 `modified` 而不中止整次对比；`fileCount` 仍等于 `same + added + removed + modified`。坏项不进任何状态计数。

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
- **ac-sync-mirror-delete**：镜像模式可把目标侧独有文件列为待删除项并可逐项取消；未勾选项不被删除。
- **ac-sync-electron-local**：Electron（`pnpm dev`）下对两个真实本地目录完成 dry-run → 确认 → 磁盘写入 → 重新对比闭环。
- **ac-sync-web-sample**：Web（`pnpm dev:web`）下用内置样本目录 / 内存可写区完成同一闭环；内置样本库保持只读、可重复一键加载（写操作不污染 `/samples`）。
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
- **ac-parity-temp-fixture**：真实临时目录 fixture（多级嵌套、空目录、同名不同层文件、仅 mtime 不同、同 size 同 mtime 不同内容、悬空符号链接、不可读条目）上，批量/并发扫描得到的树（名称、层级、顺序、`size`、`modifiedMs`）、`index` 键集合、`skipped` 与同 fixture 的串行基线扫描逐项相等；`compareDirectories` 的四态计数与串行基线相等。
- **ac-parity-samples**：内置样本 `/samples/directory/**` 目录对比经批量扫描后，树、四态计数与 `skipped` 与既有串行基线和现有测试断言一致（样本路径在批量通道可用）。
- **ac-skipped-semantics**：fixture 中悬空符号链接与不可读条目仍出现在返回条目里并各计 `skipped` 1 次；一个不可列子树只计 `skipped` 1 次且不出现在树中，扫描仍整体成功；fixture 中的 `.git`、`node_modules` 目录被正常列出并参与对比，不被静默跳过。
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
- **ac-no-regression**：`pnpm test` 全绿，既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `preload` / renderer 套件零回归；`readTextFile`、`writeTextFile`、`statPath` 等既有能力行为不变；`.ocsnap.json` 快照线格式不变。

## 非目标

- **不做文件级差异算法本体**：行级 / 行内字符级 inline diff、3-way merge 冲突求解与点选合并、CSV 主键列对齐、JSON/YAML 语义归一化 diff 一律不在本域。下钻只把内容带进对应视图并只读呈现，视图增强留给对应子项。
- **不做双向 / 三向同步**：同步为单向（左→右 / 右→左）按方向覆盖，不做双向 / 三向同步、不做内容级合并冲突策略（3-way 归代码域）。
- **不做二进制 / 非 UTF-8 字节级拷贝**：平台读写通道为文本；不做权限 / 属主 / 模式位 / ACL / 符号链接复制；不做回收站、版本保留、保留策略等高级镜像选项。
- **不做持续 / 定时自动同步与 watcher**：不对文件系统做监听、不做增量重扫调度；同步为按需触发（用户点「预览并同步」）。
- **不做模板归位的模糊 / 相似度匹配**：仅精确文件名 + SHA-256 内容哈希；不做重命名识别与内容 diff 匹配，改名文件按「缺失 + B 未使用」处理。
- 不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP。
- **不做目录级下钻与导航栈**：不把子目录作为独立视图打开再逐级返回（树已展示全部层级），不做面包屑路径条、浏览器式前进/后退历史、键盘导航、右键菜单、多选 / 区间选择。
- **不做往返状态跨重启持久化**：过滤/折叠/滚动/选中只保持于当前运行期内存（按目录会话 id），不落盘、不做跨窗口同步，也不为此引入全局状态管理库或持久化层。
- 不做会话关闭与未保存提示（`session-tabs-lifecycle` 子项）、不做原位保存与结果导出（`save-in-place-and-export` 子项）。
- 不做三向或超过两个目录的对比；不做快捷键绑定、命令面板、主题切换与浅色皮肤；不做打包分发、签名、公证、自动更新、CI 发布。
- **不做跨进程进度推送与取消之外的调度**：不新增 `webContents.send` 类 main → renderer 进度事件（进度只由核心批次结算结果在 renderer 侧汇总）；不做暂停 / 恢复 / 断点续传、不做取消确认对话框、不做取消后自动重试（取消就是一次性终止）；不给快照导出 / 同步 / 模板 / 下钻加进度或取消。不新增持久化缓存、不改缓存键 `(path, size, modifiedMs)` 与失效语义。
- **不新增默认忽略规则**：`.git` / `node_modules` / 隐藏文件一律照列；不把不可读条目、悬空链接、不可列子树改成整次失败，也不把 EMFILE/ENFILE 吞成 `skipped`。
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
