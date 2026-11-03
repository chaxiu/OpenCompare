# Domain: memory-bounded

反复对比下的内存有界域：把「同一对目录反复对比」从**无上限累积**改成**有界驻留**——摘要缓存有双上限与 LRU 淘汰、摘要缓存键按 realpath 归一（别名根复用摘要而不重复哈希，会话身份仍用用户输入路径）、关闭 / 替换会话显式释放、每个打开的目录 tab 都持完整结果树（切 tab 只切 `activeId`，0 扫描 / 0 digest）、不可见会话不保留行模型、同 tab 重新对比时按提交卸载旧视图（视图 key）从而确定性释放历史 comparison / 行模型、测量 harness 的持有语义与真实 UI 一致，并由 `memory-gate`（`pnpm test:memory`）守回归。本域**不改对比算法**：四态定义、节点 `status`、`counts` 语义、快照线格式与取消协议全部不动，淘汰与键归一都只影响「是否重哈希」。测量入口 / 证据 schema / 阈值档位 / 瞬峰护栏归 `perf-memory`；符号链接口径归 `symlink-semantics`；取消归 `io-concurrency`；目录对比语义归 `directory`。

## 范围

- **有界摘要缓存（`src/core/directory/compare.ts` 的 `ComparisonCache`）**：在既有 `hashes` 语义上叠加「条目数 + 估算字节」双上限与 LRU 淘汰，暴露 `stats{entries, estimatedBytes, hits, misses, evictions}`（每次淘汰 `evictions + 1`，含容量淘汰与按根释放）。默认上限集中为 `DEFAULT_COMPARISON_CACHE_MAX_ENTRIES = 200_000` / `DEFAULT_COMPARISON_CACHE_MAX_BYTES = 128 MiB`，估算口径 `estimatedEntryBytes(path, entry) = COMPARISON_CACHE_ENTRY_OVERHEAD_BYTES(96) + 2 × (path.length + hash.length)`（UTF-16 字符，估算而非堆测量，注释与 `docs/perf/large-directory-memory.md` 同步）。`hashes` 仍是 `Map`，插入顺序即最近使用顺序：`get` 命中移到队尾并计 `hits`、未命中计 `misses`；`set` 覆盖后按新值计字节并从队首逐个淘汰；`delete` 是失效而非淘汰（不计 `evictions`）；`evictUnderRoots(roots)` 按规范化根前缀释放并计入 `evictions`；`hold()` 在一次对比期间（扫描 → 摘要 → 分类）暂缓容量淘汰，release 时重新套用上限，避免「摘要算完、分类时已被淘汰」的不确定结果。单条超预算时仍保留刚写入的那一条（`hashes.size > 1`），不允许整体清空规避上限。
- **容量注入**：`createComparisonCache(options)` 接受 `maxEntries` / `maxBytes`，非有限数或 `< 1` 回落默认值；`cache.maxEntries` / `cache.maxBytes` 暴露生效上限供测试与门禁断言。
- **既有读取路径不断**：快照播种（`seedSnapshotCache`，`/snapshots/...` 虚拟路径摘要直接写入、不发真实读取）、`planContentReads`、`hashFile`、既有 `cache.hashes` 直读（取消与快照测试依赖）语义不变；未命中条目回落真实读取 + 真实摘要。
- **会话生命周期释放（`workbench/directoryCompare.ts` + `Workbench.tsx`）**：`releaseDirectoryComparison(cache, comparison, openSessions)` 显式淘汰该对比左右根下的摘要条目，跳过仍被其它活动会话使用的根；`Workbench` 的关闭（`closeSession`）、重新对比（`upsertSession`）、替换（`replaceSession`）三条路径都调用它，不依赖 GC 时机；既有 `directoryStates` / `directoryScroll` 清理不变。
- **不可见会话不保留行模型**：行模型（`@core/directory/rows` 的 `buildDirectoryRowModel`）只随激活的 `DirectoryView` 挂载构建，切 tab / 关闭后不残留；不为后台会话预建或缓存行数组。
- **同 tab 重新对比按提交释放旧视图**：`directoryViewKey(session)` = 会话 id + comparison 单调修订号（`directoryComparisonKey`，`WeakMap` 登记，不延长 comparison 寿命）。`upsertSession` / `replaceSession` / 切 tab 都改变 key，React 在**提交阶段**卸载旧 `DirectoryView` / `TreeView` 子树与旧 `useVirtualizer` 实例，旧 `DirectoryComparison` 与旧 `DirectoryRowModel` 不再经 fiber props / `ref` 回调 / `getScrollElement` 闭包可达。`directoryStates` / `directoryScroll` 仍在 shell，过滤 / 折叠 / 选中 / 两侧滚动重挂后原样恢复；只有 `DirectoryView` 局部 toolbar 的 `direction` / `mode` 会重置（与「下钻返回重挂」一致）。
- **摘要缓存键按 realpath 归一**：`ComparisonCache` 增 `aliasRoot(root, canonical)` / `canonicalPath(path)`（内部 `Map<规范化根, 规范化真实根>`，最长前缀匹配，同时接受 `/` 与 `\`）；`get` / `set` / `delete` / `evictUnderRoots` 一律先过 `canonicalPath`，`hashes` 存规范路径；**双上限 / LRU / `hold()` / `evictDownToCaps` / 条目口径零改动**，`estimatedBytes` 仅按规范键长计费。`PlatformPort` 新增唯一只读批量能力 `realpath(paths): Promise<string[]>`（通道 `platform:realpath`，preload 白名单；electron 用 `node:fs/promises#realpath`，逐项 try/catch 失败回退输入、`/samples` 原样；web 恒等）。`workbench/rootAliases.ts` 的 `aliasSideRoots(platform, cache, roots)` 在 `snapshotOps.compareSides` 与 `directoryOps.compareRoots` 比较前登记（仅 `canonical !== root` 时登记，解析失败整批退化为旧行为）。会话 id / `title` / `subtitle` / 证据 `roots` / `pairs` 仍用用户输入路径，别名根仍是独立 tab（不折叠）。
- **每个目录 tab 常驻完整树（2026-10-23 裁决后的现行形态）**：`WorkbenchSession.directory` 在每个目录会话上都有值，不存在 summary-only 形态与按需重建入口（`directorySummary` / `retainActiveTree` / `summarizeComparison` / `detachDirectoryComparison` / 激活重建 / `restoreFailures` 均已删除）。`commitSessionTree(cache, current, session, {replaceId})` 只做 upsert / 原位替换 + 被替换会话按根释放（`commitUpsert` 为薄封装），由 `Workbench` 的新建 / 再次比较 / 同步刷新与 perf harness 轮次共用；提交第三个 tab 时前两个 session 仍是同一对象、同一 comparison。切 tab 只改 `activeId`：0 次 `listDirectories`、0 次 `digestFiles`、0 次 `realpath`，四态与过滤 / 折叠 / 选中 / 两侧滚动立即完整。`releaseSessionTree` 的根经 `canonicalPath` 归一后再淘汰（关闭别名 tab 不会误清真路径 tab 的热缓存）。代价：3 tab 常驻 3 棵完整树，内存边界由 `perf:gate` 的瞬峰护栏 / settle / appTotal / reclaim 硬线守（归 `perf-memory`）。
- **会话列表与释放语义单点（`workbench/sessionStore.ts`）**：`upsertSessions` / `replaceSessions` / `closeSessions` / `commitSessionTree` 是纯函数，同时被 `Workbench` 与 perf harness 使用；同 id 原位替换（顺序不变）、新 id 追加且**不摘其它 tab 的树**，替换时仍按「新会话仍占用同一批根」保留热缓存（`hashedFiles=0`）。
- **harness 持有语义与真实 UI 一致**：harness 渲染真实 `SessionTabs` + `DirectoryView`；`upsert` 每轮用 `commitSessionTree` 复用同一 `sessionId`（tab 恒 1），`multisession` 逐轮追加（1→2→3），`retained` 建 3 tab 保留后做 `--hot-rounds` 活动 tab 热 upsert、再关活动 tab 并落到相邻已驻留 tab（不重建）。旧 `held` 槽 / `onReleaseSession` / 「轮次开始前释放上一轮会话」已删除；`PerfRoundReport` 只保留标量计数（含 `tabs`），不含 `directory` / `root` / 树或临时数组。
- **结构持有登记（`shared/perf/liveness.ts`）**：perf 模式下 `createDirectorySession` 登记 comparison、`DirectoryView` 的 `useMemo` 登记 row model，每个对象只计一次、不延长寿命；关闭时零开销。
- **门禁 `memory-gate`（`src/memory-gate.ts` + `src/memory-gate.test.ts`，`pnpm test:memory`）**：`evaluateMemoryGate` 纯函数判定每轮 `stats.entries <= maxEntries`、`stats.estimatedBytes <= maxBytes`、第 3 轮 `entries` 与第 2 轮相等、第 3 轮 `estimatedBytes` 不大于第 2 轮、四态 `counts` 逐轮相等、`releasedEntries === 0`、轮数 ≥ `MEMORY_GATE_MIN_ROUNDS(3)`；违规 id 为 `cache-entries-over-limit` / `cache-bytes-over-limit` / `round-entries-growth` / `round-bytes-growth` / `round-result-changed` / `session-release-leak` / `round-count`；`resolveMemoryGateExitCode` 只在 `ok` 时返回 0。测试在系统临时目录生成真实落盘数据集（每侧 2,000 文件、共 4,002、约 39 MiB、`d0/d1/bucket-*/` 三层、每 25 文件一处同大小不同内容、左右各一个单侧文件），用 `fs` 真实列目录与流式 SHA-256 跑 3 轮并断言 `hashedFiles > 0` / `modified > 0` / `added === 1`，结束后清理；不读 `src/shared/fixtures` 或 `/samples`。矩阵项为单 argv `pnpm test:memory`，本机约 1.5 s（上限 180 s）。
- **文档与真实取证**：`docs/perf/large-directory-memory.md` §5 写默认上限表、估算口径、LRU / hold / 按根释放 / 行模型 / harness 释放策略，§6.2 写 post-fix 的 DawnChat↔ZenMind 3 轮实测（命令、环境、轮次 RSS 表、Δ 序列、判定）与证据路径；改动前基线 `dawnchat-zenmind-20261022.json` 原样保留，新增 `...-post-fix-3rounds.json`。

## 验收

- **ac-cache-default-caps / ac-cache-bytes-cap**：无参缓存的条目数与估算字节上限均有限且可从模块读取；插入超条目上限后 `stats.entries === cache.hashes.size <= maxEntries`；极小 `maxBytes` 下连续写入后 `estimatedBytes <= maxBytes` 且 `hashes.size > 0`（不得整体清空）。
- **ac-cache-lru-order / ac-cache-stats**：条目上限 3 时写 A / B / C → `get(A)` → 写 D 淘汰 B → 写 E 淘汰 C，顺序确定；命中 / 未命中 / 淘汰分别累计 `hits` / `misses` / `evictions`，`entries` 与 `estimatedBytes` 随写入淘汰同步回落而非单调递增。
- **ac-cache-hit-zero-hash / ac-cache-miss-rehash-same**：同一真实目录对同缓存连续两轮，第 2 轮 `onDigestStats.files === 0` 且四态逐字段相等；`maxEntries: 1` 强制逐条淘汰后重比，四态与节点 `status` 分布与冷缓存首轮完全一致，被淘汰路径回落真实读取 / 哈希。
- **ac-snapshot-seed-still-hit**：导入快照侧后仍命中快照播种摘要（不对 `/snapshots/...` 发真实读取），淘汰后重算结果相同。
- **ac-close-session-evicts / ac-replace-session-single**：关闭会话后该左右根前缀的键数量为 0，另一未关闭会话条目不变；同 id 重新对比后只留一条且 `directory` 是新对象，旧对象不再出现在会话状态 / `directoryStates` / `directoryScroll` / 摘要缓存。
- **ac-invisible-rows-not-built**：两个目录会话并存时切到 B 不为 A 重建行模型；切回 A 后行数、首行、末行与切走前一致。
- **ac-view-key-releases-history**：同会话连续重新对比 N 轮后旧 `DirectoryComparison` / `DirectoryRowModel` 不再经 fiber props / ref 回调 / 虚拟列表闭包可达（fiber props 走查为确定性单测，`perfShell.test.tsx` 保留无 key 对照证明旧行为仍可达）；切 tab 与 `replaceSession` 同样换 key 卸载旧子树。
- **ac-harness-hold-modes / ac-structural-single-hold / ac-hold-structure**：三种模式可跑且渲染真实视图；`runRounds` 无 `onReleaseSession`，`PerfRoundReport` 只含标量；强制 GC 后 `upsert` 每轮与 settle 存活 comparison = 1、rowModels ≤ 2、tabs = 1；`multisession` / `retained` 每轮 `comparisons` 等于当轮 tabs（1/2/3，retained 热轮与 settle 为 3）、rowModels ≤ 2、`reclaim` 为 `tabs=2` / `comparisons=2`；3 tab 只剩 1 份 comparison 判 `hold-comparisons` 红，`gc` 不可用判红。
- **ac-cache-untouched / ac-cache-and-thresholds-untouched**：`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 134217728、条目上限 / 淘汰 / `hold()` / 按根释放口径不变、`perf/profiles.json` 六项零改动、`pnpm test:memory` 通过；upsert 热轮 `hashedFiles=0` 证明视图释放未触发重哈希。
- **ac-memory-gate-wired / ac-memory-gate-real-dataset / ac-memory-gate-bounded / ac-memory-gate-red**：矩阵 `memory-gate` 为单 argv `pnpm test:memory`，本机退出 0 且单次 ≤180 s；门禁在系统临时目录生成真实数据集（≥2,000 文件 / ≥20 MiB / ≥2 层 / 含同大小不同内容）跑 ≥3 轮真实哈希并清理，日志不出现 `fixtures` 或 `/samples`；断言每轮双上限、第 2 / 3 轮 `entries` 相等且 `estimatedBytes` 不增；超限或轮间递增输入返回 `ok=false` 且非零（有单测）。
- **ac-four-state-unchanged / ac-existing-gates-green**：同一真实小数据集改动前后四态 `counts` 与节点 `status` 分布逐项一致（golden）；快照协议版本与行格式未变，既有 round-trip / 取消 / 对比断言不放宽；`pnpm test` / `typecheck` / `lint` / `test:cancel` 全绿。
- **ac-perf-gate-green**：`pnpm perf:gate` 在 3 轮真实 Electron 门禁数据集上退出 0、`verdict.ok === true`，峰值 / appTotal / Δ3 均在 gate 档内（阈值仍取 `perf/profiles.json`）。
- **ac-switch-no-scan / ac-switch-immediate / ac-switch-four-state / ac-switch-state-preserved / ac-all-tabs-resident**：3 个目录 tab 时切换任一会话的提交内 `listDirectories` / `digestFiles` / `realpath` 各 0 次；切回同提交即渲染完整行，无重建提示 / spinner / 进度条 / 恢复失败态；四态计数与首次进入逐项相等；过滤 / 折叠 / 选中 / 滚动保持；每个会话都持完整 `DirectoryComparison`，提交第 3 个后前两个仍引用同一对象，代码中无 summary-only 形态与重建入口。
- **ac-alias-root-zero-hash / ac-alias-root-reuse / ac-alias-cache-key-scope**：别名根与真实根复用同一缓存键（第二次 `digestFiles` 0 次、`hashedFiles=0`、条目数不翻倍、tab 仍独立且 subtitle 为用户输入路径）；`perf:gate` multisession 第 3 轮（`links/left` 别名）`hashedFiles === 0`；`aliasRoot` 最长前缀匹配、`/` 与 `\` 均可、未登记时行为不变、`/snapshots/...` 不受影响；`realpath` 对链接目录返回目标、不存在回退自身、`/samples` 原样、preload 白名单、web 恒等。
- **ac-gate-red-when-regressed**：「3 tab 只持 1 份 comparison」「轮界删 tab 使 tabs 不按场景」「别名轮 `hashedFiles>0`」三种回归必须判红（`verdict.test.ts` 的 `hold-comparisons`；`perf-gate.mjs` 的 `assertMultisession` / `assertRetained` 抛错）。
- **ac-no-product-semantics-change**：四态语义、对比 / 合并算法、树结构、`.ocsnap.json` 线格式、tab 身份与顺序、下钻返回、同步 dry-run、进度与取消均保持现状；别名归一只作用于缓存键，不折叠 tab。
- **ac-real-evidence-3rounds / ac-real-memory-targets / ac-docs-post-fix**：证据文件不覆盖基线，`rounds.length === 3`、`appPid` 唯一、各轮 `rendererPid` 相同、`commit.sha === HEAD` 且 `dirty === false`、`profile === 'real'`，各轮 `hashedFiles` / `bytesToHash` 如实记录；`peaks.renderer ≤ 1610612736`、`peaks.appTotal ≤ 2684354560`、`Δ3 ≤ min(104857600, max(30% × Δ1, 26214400))` 且 `verdict.ok === true`（未达须在文档给缓存上限 / 淘汰 / 归因章节与逐轮增量，不得以「观察项」收口）；文档删除过期「不做缓存 / 不释放会话」结论并写入上限、策略、3 轮实测与证据路径。

## 非目标

- 不改四态定义、节点 `status` 判定、对比 / 合并算法与 `counts` 语义；不改快照线格式（`.ocsnap.json` 协议版本与行格式）。
- 不改符号链接「不跟随」口径与左右分列计数（归 `symlink-semantics`）；不改取消结构化协议、IPC 形状与 stderr 零噪声约定（归 `io-concurrency`），不新增取消门禁。
- 不新建第二套测量入口或性能框架：复用 `pnpm perf:dir` / `pnpm perf:gate`；不改 `perf/profiles.json` 的档位上限来迁就结果。
- 不把摘要缓存移出渲染进程、不落盘持久化、不做跨进程 / 跨会话共享缓存服务；不新增第二个缓存实例或全局单例。
- 不做任何 UI / 视觉变更（不加内存面板、设置项、进度样式，不改目录树交互与文案）。
- 不改 README 已知问题、版本号、CHANGELOG、发布说明、发布工作流与资产校验（归 `release`）。
- 不做 Web 渲染模式、跨平台、真机 / 浏览器点选验收；不跑额外压测轮次；不缩小或替换真实数据集取证，不手填 / 估算数字，不重写 v0.2.4 及更早的证据与发布说明。
- 不恢复「非活动 tab 只留摘要 / 激活重建」形态，也不引入懒物化 / 预建行数组（切 tab 会退化成 ≈8–10 s 完整扫描）。

## 实现约束

- 缓存继续留在 renderer，沿用 `Workbench.tsx` 的 `useRef` 单例，不新增第二个缓存实例或全局单例；改造限制在既有模块内。
- 默认上限必须同时有「条目数」与「估算字节」，常量集中一处，估算口径（每条约多少字节、是否含 path / hash 长度）写进代码注释与 `docs/perf/large-directory-memory.md`。
- 既有读取路径必须继续成立：快照播种、`planContentReads`、`hashFile`、`cache.hashes` 的读写语义不得断；既有测试可更新实现细节断言，但不得放宽语义。
- 淘汰只影响「是否重哈希」，不得影响四态与 `counts`；任何未命中路径必须回落真实读取 / 哈希。
- 会话释放走显式函数，关闭与替换两条路径都调用，不依赖 GC 时机；不得淘汰仍被其它活动会话使用的根下条目。渲染侧释放由视图 key（会话 id + comparison 修订号）在提交阶段完成，key 计算不得在 render 里产生副作用（修订号在 `createDirectorySession` 创建期登记）；不得用 `useEffect` 延迟清理。
- harness 必须复用 `sessionStore` 的列表语义并渲染真实视图，不得恢复「轮前释放」或「每轮换 session id」；`PerfRoundReport` 只含标量计数，不新增树或会话字段。
- `pnpm test:memory` 单次 ≤180 s，不依赖本机 DawnChat / ZenMind 是否存在；真实两目录 3 轮由本机 GUI 会话执行，不进 CI 门禁。
- 真实取证在提交后的干净工作区运行（`dirty === false`），证据写出后不再改代码；重跑时保留旧文件并按时间命名新文件。
- 所有写入文档的内存 / 缓存数字必须可追溯到归档证据 JSON 或命令原文，禁止手填、估算或从旧发布说明抄。
- `PlatformPort.realpath` 是唯一新增平台 channel（只读、批量、失败回退）；改 `PlatformPort` 时五处实现（types / channels / preload / electron / web）同步。

## 最近交付证明

- WI：`wi_intake_d3f44d9dbbaabcb1`（**回退「非活动 tab 只留摘要 + 激活重建」**，恢复 3 tab 常驻完整对比；保留别名根 realpath 缓存键归一与 harness / 门禁能力，`kind: fix/regression`）
- 日期：2026-10-23
- 结果：`code_gates` passed（默认 9 项矩阵 attempt 001 全绿；`needSelfTest=false`）；`pnpm perf:gate` 交付前工作树单跑一次，upsert / multisession / retained 三份证据全 PASS。
- 覆盖摘要：① **回退摘要化**——删除 `retainActiveTree` / `summarizeComparison` / `detachDirectoryComparison` / `directorySummary` 与激活重建（`restoreSequence` / `restoreOperation` / `restoreFailures` / `retryRestore`、「正在从摘要缓存重建结果树…」状态）；`commitSessionTree` 只做 upsert / 原位替换 + 被替换会话按根释放，不摘其它 tab 的树；切 tab 只切 `activeId`（`App.test.tsx` 断言 0 扫描 / 0 digest / 0 realpath、四态与过滤 / 折叠 / 选中 / 滚动逐项保持）。② **harness**——`retained` 关活动 tab 只 `closeSessions` + `releaseSessionTree` + 切到落点 tab，不再热缓存重建。③ **门禁**——`holds.comparisons` 期望改为与场景 tabs 同源（`expectedHoldTabs`：upsert 1、multisession 1/2/3、retained 1/2/3/3/3 且 settle 3、reclaim 2），`verdict.ts` / `perf-gate.mjs` / 单测三处一致；`verdict.test.ts` 断言 3 tab 只持 1 份 comparison 判 `hold-comparisons` 红。④ **保留不动**——`PlatformPort.realpath` + `aliasRoot` / `canonicalPath`、`releaseSessionTree` 的 `canonicalPath` 归一、`replaceId` 原地替换、`directoryViewKey` 的 comparison 修订号、`settleStages` / `reclaim` / 2.25 GiB 瞬峰护栏、`perf-gate` 条件 profile 分层。
- 证据：默认矩阵 `.munk/runs/run_intake_d3f44d9dbbaabcb1/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate}.log`（`pnpm test` 714 passed / 1 skipped，`pnpm test:memory` 通过）；`perf:gate` 日志 `.munk/runs/run_intake_d3f44d9dbbaabcb1/delivery/perf-gate.log`——数据集 12,050 文件 / 122,880,000 B / 5 层 / 6 符号链接（第三根 `links/left`）：upsert `tabs=1/1/1/1/1`、roundPeak `159,006,720 → 215,236,608` B、settle `214,024,192` B、holds 全 `comparisons=1 / rowModels=2`；multisession `tabs=1/2/3`、roundPeak `159,203,328 / 182,714,368 / 201,490,432` B、settle `200,556,544` B；retained `tabs=1/2/3/3/3`、holds 序列 tabs 与 comparisons 均为 `1/2/3/3/3/3/3/2`、`settleStages` 抬升 2,048,000 B、`reclaim=202,866,688` B / `tabs=2`；三份证据均 PASS。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），AC 逐条落档在 `qa/summary-tabs-and-alias-cache-keys.md`，tech delta 手合到 `baseline/tech/overview.md` 与 `adr-0002-alias-cache-and-retained-tabs.md`。② **3 个 tab 各持一棵完整树**（`holds.comparisons = tabs`），不要再按「仅活动 1 份」写断言，也不要再引入摘要 / 懒物化 / 激活重建（切 tab 会退化 ≈8–10 s 完整扫描）。③ **真实规模（DawnChat↔ZenMind）3 tab 驻留内存数字仍缺**（见 `perf-memory` 的 `qa/group3-real-sampling.md`，`status: na`），不得用 gate 档 ~200 MB 证据代替。④ `perf-gate` 只在条件 profile，默认矩阵不含；触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消的 diff 按「同 commit 只采一次」纪律单跑。
- 历史（已回退的形态，仅作沿革）：`wi_intake_aea03632d00a47e8` 曾让非活动 tab 只留 `directorySummary`、切回走 `compareSides` 热缓存重建（`holds.comparisons=1`），真实规模一次重建 ≈8–10 s，被公司裁决回退；其 `retained` / 别名键 / 瞬峰护栏能力保留。v0.2.6 公开包 UI 路径的只读诊断（`docs/perf/upsert-memory-diagnosis-2026-10-23.md`）与本轮修复的对应关系见该文档，不在本文件重复。
