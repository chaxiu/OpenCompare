# Domain: directory

目录域：`src/core/` 纯算法目录对比引擎（相对路径配对、四类状态、大小/mtime 短路 + SHA-256 内容确认、增量缓存），双栏目录对比视图（展开/折叠、逐行差异徽章、目录后代聚合计数、五档状态过滤），取数与下钻（本地真实目录选择 / 内置样本目录一键加载；双击差异文件下钻到对应文件级视图，并可一键返回来源目录视图且往返不丢目录树状态）。在只读对比之上，本域还承载两项高阶目录操作：**文件夹单向增量复制 / 镜像同步（Dry-run 预览后写入）** 与 **跨层级散乱目录树按模板归位 / 提取器**。本域不做文件级差异算法本体（行级 / 3-way merge 归代码域）。

## 范围

- **目录对比引擎（`src/core/directory/`，纯算法，零 Electron/DOM）**：经 `PlatformPort` 递归扫描左右两棵树，按**相对路径**配对（不做跨层级模板匹配）；每文件产出 `same` / `added`（右独有）/ `removed`（左独有）/ `modified` 四类状态，目录状态由后代聚合。
- **高速 / 增量策略**：先比文件大小、再比修改时间；二者都不足以判定差异时才读取内容做 **SHA-256** 内容哈希确认（覆盖「大小相同但内容不同」）；已比对条目按（路径 / 大小 / 修改时间）缓存，重复比对不重复读内容与哈希。输出带状态的左右树 + 按状态文件计数。
- **双栏目录对比视图**：左右双栏树、目录展开/折叠、逐行差异语义徽章（复用 `DiffBadge` / `--color-diff-*`）、目录行显示其后代差异聚合计数；一键过滤 `全部 / 仅差异 / 左独有 / 右独有 / 相同`，过滤后仅保留匹配条目及其祖先目录。
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
- **内容读取的有界并发与句柄错误（横切契约，归 `io-concurrency` 域）**：`compareDirectories` 的候选正文读取经 `@core/io` 的 `mapWithLimit` 走默认 `DEFAULT_IO_CONCURRENCY`（8）窗口，`scanDirectory` 单层 `list` 失败转成可读句柄错误；`compareDirectories` / `compareDirectorySides` 新增可选 `ConcurrencyOptions` 尾参供测试收窄窗口。`EMFILE` / `ENFILE` 统一转成「文件句柄」可读错误向上抛，不返回部分结果。
- **内容确认的字节摘要（横切契约，归 `content-digest` 域）**：目录对比的内容确认改为先按 size/mtime 快路径 + `(path, size, modifiedMs)` 缓存算出待确认路径，再经 `PlatformPort.digestFiles` 对**原始字节**批量取 SHA-256（不读 UTF-8 正文），摘要写回同一 `ComparisonCache.hashes`；未提供摘要能力时回退既有文本读取路径。`compareDirectories` 尾参类型为 `ComparisonIoOptions`（`ConcurrencyOptions` + 可选 `digestFiles` / `digestible`）。非法 UTF-8 的二进制内容因此能被判 `modified` 而不被解码抹平；四态语义、缓存键与失效钩子不变。
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
- 不改样本 answer key（`src/shared/fixtures/` 的 `status` 字段）；不改 `.munk/baseline/**`（由 Delivery 折入）。

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

## 最近交付证明

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
