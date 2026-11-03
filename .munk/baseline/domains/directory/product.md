# Domain: directory

目录 / 文件夹场景的对比、单向镜像同步与模板归位：`src/core/directory/` 纯算法（相对路径配对、四态、size/mtime 短路 + SHA-256 确认、增量缓存）驱动双栏目录树与下钻。在只读对比之上覆盖 Dry-run 预览后的单向增量 / 镜像同步（字节级落盘、失败回滚、链接按形态落盘）与散乱树按模板归位（计划 / 执行 / 复核）。文件级差异算法不属本域。

## 范围

- **对比引擎（`core/directory/compare.ts`）**：相对路径配对，四态 `same` / `added`（右独有）/ `removed`（左独有）/ `modified`，目录态由后代聚合；size → mtime 短路，不足以判定时按原始字节取 SHA-256，`(path, size, modifiedMs)` 缓存去重。
- **双栏视图**：左右树、展开 / 折叠、行差异徽章、目录行后代聚合计数、五档过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）；`rows.ts` 纯行模型 + `TreeView` 虚拟化（`createDirectoryScrollMap`），≥150 万行尾部仍可达。
- **取数与下钻**：真实目录选择 / 样本一键加载；差异文件按类型下钻代码 / CSV / 结构化视图，会话带 `parentDirectoryId`，「返回上级」一步回源并保持过滤 / 折叠 / 滚动 / 选中。
- **扫描取数**：批量 `listDirectories` + 有界并发（默认 16），可选 `onProgress`（scan / digest 两相）与 `AbortSignal`；不可读项计 `skipped` 而不中止。
- **同步预览**：`buildSyncPlan` 产出 copy / update（镜像另含 delete）；`syncPreviewAction` 单点给出四类计数、`planned`、`executable` 与 `guidance`，`canApplySyncPreview` 委托它。
- **同步执行**：写前零落盘预检、逐项原子字节写、撤销先入栈、失败或取消逆序回滚；镜像只删勾选路径；摘要校验 `SyncVerificationError` 与刷新失败 `SyncRefreshError` 分形态。
- **符号链接**：链接作叶条目按 target 判四态，同步按形态落盘（先 unlink 链接本身再 `lutimes` 对齐），不跟随、不写穿；同 target 仅 mtime 不同者作待对齐、不进计划。
- **模板归位**：`matchTemplate` → `createTemplatePlan` → `resolveTemplatePlan`（唯一可执行出口）→ `executeTemplatePlan` → `verifyTemplateExtraction`；三步对话框（选根 / Dry-run / 结果），动作 `copy | move`，移动须显式勾选且写后校验通过才删源。
- **展示词表**：目录四态用过滤页签词，经 `DIRECTORY_STATUS_LABEL_KEYS` 单源注入徽章与两处图例；文本 diff 词表不动。

## 验收

- **ac-engine-classify**：相对路径配对四态正确，「大小相同但内容不同」由 SHA-256 判 `modified`。
- **ac-engine-incremental**：size 与 mtime 均相同即判 `same` 不读内容；重复比对不重复读内容 / 哈希。
- **ac-tree-ui**：双栏树可展开折叠、逐行差异徽章、目录行显示后代聚合计数。
- **ac-filter**：五档过滤齐全，切换后仅保留匹配条目与祖先目录，统计随动。
- **ac-runtime-stats**：状态栏 / 图例 / 徽章统计来自运行时比较，不读样本 answer key。
- **ac-local-directory**：左右可选真实目录并触发对比，Web 模式有可理解降级；样本一键加载在 dev 与 dev:web 均可复现。
- **ac-drilldown-code**：差异代码 / 文本、CSV/TSV、JSON/YAML 分别下钻对应视图并带左右内容，单侧独有时对侧为空。
- **ac-drilldown-opens-file-view**：真实目录下钻共用同一会话模型，每次生成独立标签且目录标签保留。
- **ac-back-to-parent-directory**：文件视图有明确「返回上级目录视图」导航，一步回到发起会话。
- **ac-roundtrip-repeatable**：连续「下钻 → 返回」多次行为一致，无需刷新 / 重启。
- **ac-filter-preserved**：往返后过滤档、展开折叠集合、两侧滚动位置、选中行与高亮均与下钻前一致。
- **ac-drilldown-isolation**：两个目录会话对同一相对路径下钻互不覆盖。
- **ac-parent-fallback**：来源会话不可用则落其他目录会话并提示，无可用会话停留文件视图，不崩溃。
- **ac-sync-plan**：按方向产出 copy / update（镜像另含 delete）清单，逐项带路径与字节数、分组与合计汇总，same 不进组，左右互为镜像。
- **ac-sync-dryrun-dialog**：两方向均可弹 Dry-run 弹窗分组展示并含字节与路径汇总，取消后目标侧零写入。
- **ac-sync-mirror-delete**：目标独有项列待删除且初始全未勾，提供组级全选 / 清空与逐项复选框；只删勾选项，未勾项与缺省 / 空 `deletePaths` 恒零删除。
- **ac-plan-carries-link-target**：链接 copy / update 项 `linkTarget` 等于 `readlink`、普通文件为 `undefined`；链接路径不进字节读取与摘要，悬空链接不报错。
- **ac-dialog-executable-summary**：执行条目数与实际勾选集一致；无任何可执行项（含仅未勾删除）时确认禁用并给出可见原因，忙碌态禁用并显示进行中。
- **ac-single-predicate**：`syncPreviewAction` 是四类计数、`planned`、`executable` 与 `guidance` 的唯一实现，摘要、合计、Apply 禁用与组头「已选 N」同读；delete 只数镜像计划内已勾路径。
- **ac-i18n-keys-complete**：`groupCountSelected` 在 zh / en 成对、占位符一致、en 零汉字。
- **ac-mirror-behaviours-indexed**：四条镜像行为在门禁 `description` 有可点名落点与测试文件映射（矩阵形状归 `quality-gates`）。
- **ac-sync-apply-refresh**：确认后经 `PlatformPort` 实写并重跑对比、以刷新结果替换会话；计数与独立重比一致，同向再执行计划为空。
- **ac-real-apply-content-structure**：落盘内容逐字节一致、相对路径与 ≥4 层嵌套不变、中文与空格路径可原样找到；mtime 毫秒归一后重新对比判 `same`。
- **ac-idempotent-second-dry-run**：重复执行后三组 `count` / `items` 与合计全空、对齐清单为空、不可执行，多轮重复成立。
- **ac-binary-png-byte-exact**：PNG、含 `0x00` 与非 UTF-8 序列的随机字节、0 字节空文件经 copy 与 update 后字节数与 sha256 等于源、mtime 一致。
- **ac-rollback-binary-restore**：覆盖或删除后失败 / 取消回滚为原始字节（逐字节 + sha256）与 mtime，无替换字符。
- **ac-completion-requires-source-equivalence**：每个写入目标 sha256 与字节数均等于源才 resolve；成功后除未勾删除残留无差异。
- **ac-completion-blocked-on-mismatch**：任一目标与源不一致（含链接 mtime 对齐失败）即 reject `SyncVerificationError`（条数 + 路径样例），走 danger、不回滚。
- **ac-verification-scope-written-only**：校验只读本轮写入目标 + 各自源 + 已勾删除项存在性，不整树二次哈希。
- **ac-unchecked-delete-not-failure**：镜像下未勾删除项的残留不算失败，提示仍为成功。

- **ac-completion-notice-truthful**：copied / updated / deleted / alignedLinks 与实际落盘逐项一致，完成提示四个数字同源（仅对齐时也报出 aligned 数）。
- **ac-link-copy-relative-and-dangling**：四方向 × 增量 / 镜像组合下源侧独有链接（相对、悬空、指向目录）落盘后仍是 symlink，`readlink` 逐字、路径不变、mtime 秒级一致，不物化子树、不改被指向文件。
- **ac-link-update-replaces-target**：同路径链接换 target 或换成普通文件时按目标形态落盘，旧链接不写穿、被指向文件字节与 mtime 不变。
- **ac-target-link-not-written-through**：对目标侧链接的 update / delete 先 unlink 链接本身；指向同步对之外的文件前后 sha256 与 mtime 完全一致。
- **ac-mirror-delete-link-only**：镜像删除目标独有链接只移除链接自身，指向的文件 / 目录及其子条目仍在；链接进 delete 组默认不勾。
- **ac-link-delete-rollback**：删除链接后失败 / 取消，回滚重建仍是 symlink，`readlink` 与 mtime 秒级回到运行前。
- **ac-verification-link-by-form**：链接按 `lstat` + `readlink`（+ mtime 秒级）校验，不取内容摘要；悬空链接 resolve 成功，错 target 或未对齐 reject。
- **ac-symlink-same-aligned-mtime**：同 target 仅 lstat mtime 不同的链接对，落盘后目标链接自身 mtime 秒级对齐源；判等与四态、快照格式不变，对齐不进计划且与三组 items 不相交，二次 Dry-run 全空。
- **ac-link-align-visible-and-applicable**：仅待对齐链接时 Apply 可点、渲染对齐分组与逐条路径、不渲染空态句；镜像下未勾删除项不挡住对齐，链接已对齐时仅未勾删除项仍使之为 `false`。
- **ac-link-align-applied**：执行后链接形态、`readlink`、秒级 mtime 与源一致，`alignedLinks` 等于对数且 copied / updated / deleted 为 0；普通文件零改动，计划与四态计数不变。
- **ac-counts-and-delete-optin-unchanged**：新建计 copy、替换计 update、删链接计 delete、对齐计 alignedLinks，字节口径沿用 lstat size；三组分类、四态与快照 / 导出格式不变。
- **ac-file-overwrite-rollback-unchanged**：普通文件覆盖失败的回滚语义与既有断言不变，binary / completion / symlink / idempotent 用例零回归。
- **ac-preflight-unwritable-target**：目标只读或被同名目录占用时在第一项写入前拒绝，`writeTextFile` 调用 0 次，目标快照（路径 / 字节 / mtime / 目录）逐项一致且无 `*.tmp`，错误含路径与系统码。
- **ac-atomic-write-no-partial**：写入经同目录临时文件 + `rename`，任何时刻不出现零字节 / 截断文件，成功与失败路径都不残留 `*.tmp`。
- **ac-rollback-on-failure**：覆盖 / 删除前先入撤销栈再动盘（含「写已落盘而 reject」窗口），失败按逆序回滚：内容与毫秒 mtime 复原、已删文件重现、本次新建文件与目录消失；同 preview 重试可全量成功。
- **ac-cancel-mid-plan**：执行中途取消（含弹窗「取消」）以取消结束，目标逐项恢复执行前状态，无半写文件 / `*.tmp` / 残留新建目录。
- **ac-cancel-signal-observable**：取消为 `OperationCancelledError`（`code === 'ECANCELED'`、无系统码）、失败为带路径与系统码的 `SyncTargetError`；提示含「已取消 / 已回滚」，取消后冷 Dry-run 与该时刻磁盘一致。
- **ac-readable-error-with-code**：失败提示为中文且含目标路径与对应系统码、不含 `Error invoking remote method`；Dry-run 读失败同样去包装、不开弹窗、`busy` 复位。
- **ac-session-state-preserved**：失败或取消不产出新比较，会话 id、树、四态、过滤与选中保持，`busy` 复位，预览保留且确认恢复可点。
- **ac-retry-after-failure**：同一弹窗失败后重试成功，弹窗关闭并提示完成，会话被新比较替换。
- **ac-refresh-failure-readable**：写入成功后刷新失败 reject `SyncRefreshError`（带三项计数、不回滚），danger 通知说明写入已完成并关闭已落盘预览，会话不替换。
- **ac-existing-contracts-kept**：未勾删除项在失败 / 取消后 0 删除、取消与失败可区分、省略 `deletePaths` 零删除、只读根断言升级到 `checkWritable` 后仍通过。
- **ac-batch-multi-dir-per-call**：≥8 目录的扫描中至少一次批量调用携带 ≥2 个目录，且调用次数少于目录数。
- **ac-default-concurrency-16**：默认在飞批量峰值 ≥16 且不超单一来源常量；显式收窄（如 4）时峰值 ≤4 且树 / `index` / 四态 / `skipped` 一致。
- **ac-parity-temp-fixture**：真实临时 fixture 与样本目录上，批量 / 并发扫描的树、`index`、`skipped`、四态等于串行基线，旧 `scanDirectory(rootPath, list)` 形态可用。
- **ac-skipped-semantics**：不可读项各计 `skipped` 1、不可列子树计 1 且不进树、链接不计；`.git` / `node_modules` 照列；根目录不可列时以错误 reject 而非空树。
- **ac-progress-scan-monotonic**：scan / digest 的 `files` / `bytes` 跨相位单调不减，digest 以扫描末态为基数不从 0 起算，`phaseFiles` / `phaseBytes` 表示相位内增量。
- **ac-progress-digest-chunks**：按 64（可覆盖）分块，每结算一块才回报一次并写该块缓存；未结算不报、结束后不再报，无定时器插值。
- **ac-cancel-error-type**：扫描或摘要阶段 abort 后 1 秒内以取消 reject，不再发起新批次，不计 `skipped`、不返回部分结果，被中断块不写缓存。
- **ac-cancel-then-recompare**：取消不新增 / 替换会话、不产生比较；重跑成功且四态与基线一致，无句柄残留。
- **ac-scale-real-disk-fixture**：门禁用 `mkdtemp` 真实目录（两侧 ≥1,000 文件、≥4 层、中文与空格路径），不用样本 / 内存盘 / mock 顶替；单 argv 登记为 `sync-real-gate`，时长 20–40 秒。
- **ac-rows-filter-parity**：五档 × 两侧行模型的 `(relativePath, name, kind, depth, status)` 序列等于既有投影先序结果（含顺序与遗留空目录行），`visibleCounts` 与四态计数同源。
- **ac-rows-collapse-parity**：折叠等于「先序但跳过折叠子树」，折叠目录自身行保留、位置不变；空集合与全展开一致。
- **ac-row-model-no-clone**：行模型节点与树节点同引用，构造前后身份不变；`DirectoryView` 不再调用过滤 / 投影函数（计数为 0）。
- **ac-bounded-dom-50k**：1200×640 下每栏树行 ≤80、双栏 DOM ≤5000；5,000 行与 5 万+ 行渲染量相同（±2 / ≤10%），反复滚动不增长，展开 ≥2 万子项目录后仍有界。
- **ac-scroll-far-rows**：滚到接近底部时渲染索引严格递增无重复并覆盖首末可见行，各字段与行模型一致；逐档切换过滤为对应前缀窗口，空档不渲染行并显示既有空态文案。
- **ac-drilldown-restore**：过滤 + 折叠 + 选中 + 非零滚动后卸载再同状态重挂载，`scrollTop` 复原（±1）、选中在渲染窗口内、折叠子项不渲染；超大行数下同样成立。
- **ac-height-capped**：`rows.length * 24 > 16_777_215` 时容器内联高度 ≤16,777,215px，行数较小时高度恰为行数 ×24。
- **ac-last-row-reachable**：1,516,096 行下滚到最大偏移可渲染末行且内容一致；0 / 1/4 / 1/2 / 3/4 / 末行与尾部目录所在索引均可命中，`offsetForIndex` 严格递增。
- **ac-template-match**：匹配器以文件名 + SHA-256 把散乱树 B 映射到模板 A 槽位，产出 matched / missing / conflict / unused；索引匹配使 1,000+ 文件线性完成、不重复读内容。
- **ac-four-outcomes-one-to-one**：每槽位恰好一条 matched / placed / missing / conflict 条目、`unused` 单列，分区计数等于数组长度、槽位总数等于 `templateFileCount`、`targetPath` 由 `joinRelativePath` 派生；条目带源 sha256 与 `modifiedMs`。
- **ac-default-unchecked**：仅「matched 且目标无既有文件、未被目录占用」默认勾选；conflict、path-escape、覆盖、目录占用、missing 一律不勾，未勾时零写入零删除。
- **ac-resolve-unique-manifest**：`resolveTemplatePlan` 是唯一可执行出口——只收已勾 matched 与「已勾且候选在集内」的 conflict，其余进 `rejected` 带稳定原因（未勾 / 冲突未解析 / 候选集外 / 目标被目录占用 / 重复源），同源只留排序第一条，计数、Apply 禁用与写入集合全读它。
- **ac-rejected-row-copy**：conflict 行内候选单选与勾选解耦，未选候选不可勾、换候选同步源身份、清空即取消勾选并计 `conflict-unresolved`；`rejected` 每种原因逐行本地化，被占用行即使勾选也零写入。
- **ac-overwrite-not-silent**：覆盖与目录占用分别可区分、覆盖行默认不勾、占用即使勾选也进拒绝零写入；覆盖检测读真实输出根（含大小写折叠键），输出根缺失时标注「将创建」且全部 `overwrite === false`。
- **ac-placed-same-content**：目标 sha256 等于该行可用源（matched 源或 conflict 任一候选）即 `placed`、不勾、永不 executable（显式勾选也不计数），已落位行独立分区呈现、无勾选框与覆盖提示。
- **ac-mtime-sec-preserved**：复核逐条重算 `sha256Hex` 并比秒级 `mtimeSec`，失败区分 `missing` / `directory` / `hash` / `mtime` / `unreadable` 且 `verified + failed === entries.length`；亚秒不误判，大小写不同但 hash 与 mtime 一致判通过。
- **ac-source-drift-guard**：执行期重读源 sha256 漂移的条目零写入计 `source-drift`，其余已选条目照常执行。
- **ac-cancel-zero-write**：不执行、预取消 `AbortSignal`、Dry-run 取消三条路径均零 `writeTextFile` / `ensureDirectory` / `deleteFile`，输出根与 B 树逐条不变、无 `*.tmp`；中途取消只停在未开始条目。
- **ac-preview-zero-write**：预览只对落在槽位上的既有输出文件读一次正文并复用摘要，不读无关文件、不重复哈希同一路径，零写入零建目录。
- **ac-apply-writes-checked-only**：只写 `resolved.executable` 的 `targetPath`（第三参为该行 `modifiedMs`），未勾行零写入，条数等于 `executableCount`，写路径只走 `executeTemplatePlan`。
- **ac-apply-then-verify**：确认后进入「结果」步骤不关闭；写入 / 失败取自同一次 `TemplateExecution`、复核取自同一次 `TemplateVerification`，成功路径 `verified === writtenCount && failed === 0`，每目标一条记录带动作与源删除状态，失败行显示本地化原因。
- **ac-move-write-verify-delete-order**：移动按「写目标 → 校验存在 / sha256 / 秒级 mtime 对当前源 → `deleteFile(sourcePath)`」执行，删除路径不重拼、不碰模板 A 与输出根；失败只记该行（`move-target-*` / `move-delete-failed`），源与目标保留、已成功行不回滚。
- **ac-move-requires-explicit-selection**：动作严格 `copy | move`，`movePaths` 只对已勾选且可执行行生效，未勾 / missing / placed / rejected / path-escape 行零执行零删除；默认全为 copy、源零删除；行内展示「B 相对路径 → 输出根相对路径 + 动作」。
- **ac-rescan-same-session**：同会话重扫零写入重建、清空勾选 / 移动 / 候选并回 Dry-run：已写槽位为 `placed` 不勾、pending 0；改动已落位正文后 conflict 回到 conflict、matched 保持 `overwrite` 不勾；missing / unused 口径不变，`*.tmp` 与移动源残留为 0。
- **ac-template-a-is-left-root**：模板 A 只读会话左根；B 与输出根支持选择 / 对话框内拖入（不冒泡）/ 键入绝对路径与 `~`（复用 `normalizePathValue`）；快照左根、B 缺失 / 非目录 / 等于 A、输出根非法以稳定码拒绝且零扫描零写入，全链路无 `/samples`。
- **ac-large-list-virtualized**：1,000+ 条 Dry-run 与结果清单共用单表窗口化，DOM 行数显著小于总数，滚到末尾仍可勾选并读到最后一条复核结果，计数不截断。
- **ac-readonly-refusal-localized**：写前 `checkWritable` 零落盘预检，只读根在首次写入前以 `TemplateApplyError`（含路径与 `EACCES` / `EPERM` / `EROFS`）拒绝且零新建；恢复权限后同 resolved plan 重试通过；失败路径无 `*.tmp` 与半写文件。
- **ac-e2e-scale**：真实 `mkdtemp` 上模板 A ≥1,000 槽位、B ≥1,000 文件、最深 ≥4 段、含中文与空格，四类齐备且两类冲突并存；跑通 dry-run → 显式勾选 → apply → 逐条 sha256 / `mtimeSec` 复核，未勾与占用行零写入。
- **ac-e2e-evidence-manifest**：门禁文件可独立冷启动通过并钉住默认勾选真值集、选择并集等于写入集合、独立重算 sha256 与秒级 mtime；e2e 写出 manifest（三根、planCounts、selection、逐条摘要与断言名），提交件落 `qa/` 并自洽校验。
- **ac-name-casefold-match**：精确大小写候选优先，无精确才走 case-fold：同 hash 判 matched、不同判 `content-mismatch`、多变体判 `ambiguous`，case-only 命中被消费不再落进 unused，槽位路径大小写仍按模板 A。
- **ac-matchslots-casefold**：输出扫描中的 case-only 路径按同一口径匹配，不因大小写差异报 missing。
- **ac-path-reject-list**：纯判定函数对空串、绝对路径、盘符 / UNC、含 `..` 段与落在根自身返回稳定 `path-escape`，正常相对路径通过；命中行不默认勾选、解析进 `rejected`、执行零写入记 `failed` 且其余行继续。
- **ac-gate-case-collision**：新增 `template-case-collision` / `template-path-contained` 两条单 argv 门禁（纯函数与内存夹具，平台无关），既有门禁 id / 命令逐字不变只追加；单测覆盖 case-only 匹配 / 计划 / 复核。
- **ac-apfs-e2e**：APFS 大小写不敏感卷上（探针为 false 时显式 skip）验证 Dry-run 覆盖判定与不勾、未勾 Apply 树快照不变、显式勾选写入后复核全通过、重扫为 placed，并覆盖默认复制、显式移动与校验失败保留源三腿。
- **ac-right-only-row-badge**：目录行徽标 en 为 `Right only` / `Left only`、zh 为 `右独有` / `左独有`，不出现文件级词，对侧树不渲染该行。
- **ac-directory-toolbar-legend**：工具栏图例与壳层状态栏图例同用目录词表且数值等于 `visibleCounts`，过滤态下图例标签与数值同步。
- **ac-text-diff-labels-untouched**：文本 / 代码 diff 仍用 `Added` / `Removed` / `Modified`（zh 新增 / 删除 / 修改），通用组件不传目录词表时行为不变，`DIFF_LABEL_KEYS` 不被全局改写，旧词断言同批改判。
- **ac-filter-counts-and-state-unchanged**：`matchesFilter` / `visibleDirectoryCounts` / `countTreeFiles` 语义与数值不变（right-only 计 added 1、left-only 计 removed 1，`differences` 为非 same 汇总）。
- **ac-i18n-pairing**：新增文案 zh / en 键集合与 `{placeholder}` 一致、en 渲染无汉字，OS 码与路径原样，既有键同步测试通过。
- **ac-no-prod-semantics-change**：算法 / 计划 / 解析 / 执行 / 复核语义与四态、快照、导出格式不变；依赖与版本不 bump、不打 tag、不改已公开 Release；平台缝只按「新增能力 + 可选参数」演进。
- **ac-no-regression**：目录四态、同步、快照、报告、下钻与 i18n 既有套件零回归；门禁文件不 import 样本、不出现样本挂载字面路径，既有断言不删不跳不放宽。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 与既有专项门禁全绿，矩阵项只在末尾追加。
- **ac-known-issues-posture**：两版 README 的 Known issues 与能力区与引擎事实逐条对应（增量只新增覆盖、镜像删除默认不勾、无 watcher），不得升级为更强承诺。
- **ac-lessons-written**：`docs/lessons.md` 与 `AGENTS.md` 收录「可执行判定必须 UI 与门禁同源」约束，不新增文档文件。

## 非目标

- 不做文件级差异算法本体（行级 / 行内字符级 diff、3-way merge、CSV 主键对齐、JSON·YAML 语义 diff）；下钻只把内容带进视图只读呈现。
- 不做双向 / 三向同步与内容级合并冲突策略；同步恒为单向左→右或右→左。
- 不做回滚备份目录 / 版本历史 / 回收站、暂停恢复 / 断点续传、取消后自动重试、`EXDEV` 回退；不清理执行前已存在的目录。
- 不做权限 / 属主 / ACL / 模式位复制；目标同路径为真实目录时按 `EISDIR` 拒绝不做类型替换；不做 Hex / 二进制 diff、`.xlsx`、FTP / SFTP。
- 不做持续 / 定时自动同步与文件系统 watcher，同步按需触发；不给快照 / 同步 / 模板加后台调度。
- 不做模板归位的模糊 / 相似度匹配（只文件名 + SHA-256）、重命名识别、路径占位符或脚本模板引擎、双向同步、冲突合并与远端。
- 不做模板执行中途的 UI 级取消按钮（纯核 `AbortSignal` 契约保留）、失败后回滚或撤销已写条目、把输出根作为右侧建立新对比。
- 不做目录级下钻与导航栈（面包屑、前进后退、键盘导航、右键菜单、多选）；往返状态只存运行期内存，不跨重启 / 窗口持久化。
- 不做三向或超过两个目录的对比；不做快捷键 / 命令面板 / 主题切换；不做打包分发、签名、公证、自动更新。
- 不新增默认忽略规则（`.git` / `node_modules` / 隐藏文件照列）；不改缓存键 `(path, size, modifiedMs)` 与失效语义；不把 `ScannedTree` / `DirectoryComparison` 搬去主进程或 worker。
- 不「先全量渲染再隐藏」；不改样本 answer key；不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈冻结：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式。
- 分层：对比 / 同步 / 模板算法在 `src/core/directory/`（`compare.ts` / `rows.ts` / `sync.ts` / `template.ts`），零 Electron / DOM，纯函数或「纯函数 + 注入 IO」，可被 vitest 直测；renderer 只经 `PlatformPort` 取数。
- SHA-256 用 Node / 浏览器 / Electron 三端可跑的同步实现，renderer 不引 `node:*`。
- 写盘走字节缝 `readFileBytes` / `writeFileBytes`（+ `ensureDirectory` / `deleteFile` / `setSymbolicLinkModifiedMs`），内容不以 UTF-8 字符串穿过同步写路径；原子写（临时文件 + `rename`）只有一条实现。
- 写入后必须使受影响路径的比对缓存失效（清 `ComparisonCache.hashes`），Web 内存实现同步更新 size / mtime。
- mtime 归一只用于 size + mtime 快路径、粒度毫秒（`Math.floor`）；内容不同仍由 SHA-256 判 `modified`，禁止抹平 mtime 伪造 `same`。
- 失败安全只在 `sync.ts` 扩展：`SyncTargetError` / `SyncRefreshError` / `SyncVerificationError` 互不复用；撤销先入栈、逆序回滚、单步失败不中断且容忍 `ENOENT` / `EACCES`；`readableSyncFailure` 只剥 IPC 包装。
- 判定各只有一份实现：`syncPreviewAction` / `canApplySyncPreview`、`resolveTemplatePlan`、`foldCase` 与 `templatePathIssue`；UI 与门禁同读，禁止内联第二份。
- 模板归位只认注入 IO：`createTemplatePlan` 零 IO（覆盖检测靠注入清单），写入只走 `executeTemplatePlan`，复核只走 `verifyTemplateExtraction`；`setup` / `dry-run` / `result` 同在一个 `TemplateDialog`。
- 平台缝按「新增能力 + 可选参数」演进：`PlatformPort` + `PLATFORM_CHANNELS` + preload 白名单 + Electron handler + Web 同签名实现；Web 无链接能力时同签名拒绝。
- 行模型纯函数提供 `length` / `at(index)` / `visibleDirectoryCounts`，`DIRECTORY_ROW_HEIGHT = 24` 单源，`createDirectoryScrollMap` 处理 >2^24 px 上限；虚拟化锚定 `Panel` body。
- 目录树状态不依赖挂载生命周期：展开 / 选中为受控 props，滚动经 `onBodyScroll` 上报，壳层按会话 id 保存并在返回时回填，不引全局状态库。
- 视觉：token 唯一来源 `main.css`，差异色走 `--color-diff-*`，组件不写死颜色 / 尺寸；目录四态词表经 `DIRECTORY_STATUS_LABEL_KEYS` 单源注入。
- 进度与取消是可选尾参：跨相位累计单调、每批次最多一次、无定时器插值；批次挂起用 `abortable` 竞速且被放弃 promise 必须挂 `catch`。
- 测试：真实磁盘用例用 `mkdtemp` + `vi.mock('electron')` handler map + 生产 `PlatformPort`，`chmod` 场景 root 下 `skipIf`，不 mock 文件系统；失败信息带稳定类别前缀便于定位。

## 最近交付证明

- WI：`wi_intake_abb0a2b075d1f867`（模板归位补齐逐条动作列与显式移动：默认复制、移动必须显式勾选、写后校验通过才删源，`kind: feature`）
- 日期：2026-11-02
- 结果：code_gates passed（20 gates；`pnpm test` 111 files / 1624 passed + 1 skipped；`needSelfTest=false`，不做实机 GUI 验收）。
- 改动面：`TemplateAction` 严格 `copy | move`，由 `resolveTemplatePlan` 单点产出 `actions` / `copyCount` / `moveCount`；计划条目带 `sourceRelativePath` / `targetRelativePath` / `defaultAction`；执行器按「写目标 → 校验存在 / sha256 / 秒级 mtime → `deleteFile(sourcePath)`」移动，失败保留源与目标、不回滚已成功行。
- 验收落点：`ac-move-requires-explicit-selection` / `ac-move-write-verify-delete-order` / `ac-rescan-same-session` / `ac-cancel-zero-write` / `ac-apfs-e2e`；矩阵 18 → 20 只在末尾追加两条，既有 id / 命令未动，`package.json#version` 仍为 `0.2.16`。
