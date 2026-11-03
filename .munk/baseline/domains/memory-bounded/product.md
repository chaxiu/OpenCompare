# Domain: memory-bounded

反复对比同一对目录下的内存有界域：摘要缓存用「条目数 + 估算字节」双上限与 LRU 淘汰、缓存键按 realpath 归一（别名根复用摘要，会话身份仍用用户输入路径）、关闭 / 替换会话显式按根释放、每个目录 tab 常驻完整结果树（切 tab 只换 activeId，0 扫描 / 0 digest）、不可见会话不建行模型、同 tab 重新对比按提交卸载旧视图，并以 `pnpm test:memory` 作回归门槛。本域不改对比算法：四态定义、节点 `status`、`counts` 语义、快照线格式与取消协议全部不动。测量入口 / 证据 schema / 阈值档位归 `perf-memory`，符号链接口径归 `symlink-semantics`，取消归 `cancel-structured`，目录对比语义归 `directory`。

## 范围

- **有界摘要缓存（`src/core/directory/compare.ts` 的 `ComparisonCache`）**：在既有 `hashes` 上叠加条目数 + 估算字节双上限与 LRU 淘汰，并暴露 `stats{entries, estimatedBytes, hits, misses, evictions}`（容量淘汰与按根释放都计 `evictions`，`delete` 只失效不计）。默认上限集中为两个导出常量 `DEFAULT_COMPARISON_CACHE_MAX_ENTRIES = 200_000` / `DEFAULT_COMPARISON_CACHE_MAX_BYTES = 128 MiB`，估算口径 `estimatedEntryBytes(path, entry) = 96 + 2 × (path.length + hash.length)`（UTF-16 字符，估算而非堆测量，注释与 `docs/perf/large-directory-memory.md` 同步）。
- **LRU 与 hold 语义**：`hashes` 仍是 `Map`，插入顺序即最近使用顺序；`get` 命中移队尾并计 `hits`、未命中计 `misses`；`set` 覆盖旧值后按新值计字节并从队首逐个淘汰；`evictUnderRoots(roots)` 按规范化根（自身或 `root/`、`root\` 前缀）释放并计 `evictions`；`hold()` 在一次对比期间（扫描→摘要→分类）暂缓容量淘汰、release 时重套上限，避免「摘要算完、分类时已被淘汰」的不确定结果；单条超预算仍保留刚写入那条（`hashes.size > 1`），不允许整体清空规避上限。
- **容量注入与既有读取路径**：`createComparisonCache(options)` 接受 `maxEntries` / `maxBytes`，非有限数或 `< 1` 回落默认值，`cache.maxEntries` / `cache.maxBytes` 暴露生效上限；快照播种（`seedSnapshotCache`，`/snapshots/...` 虚拟路径摘要直接写缓存、不发真实读取）、`planContentReads`、`hashFile`、`cache.hashes` 直读语义不变，未命中回落真实读取 + 真实摘要。
- **会话生命周期释放（`workbench/directoryCompare.ts` + `Workbench.tsx`）**：`releaseDirectoryComparison(cache, comparison, openSessions)` 显式淘汰该对比 `leftRoot` / `rightRoot` 下的摘要条目，跳过仍被其它活动会话使用的根；`closeSession` / `upsertSession` / `replaceSession` 三条路径都调用，不依赖 GC 时机；shell 既有 `directoryStates` / `directoryScroll` 清理不变。
- **不可见会话不保留行模型**：`buildDirectoryRowModel`（`@core/directory/rows`）只随激活的 `DirectoryView` 挂载构建，切 tab / 关闭后不残留，不为后台会话预建或缓存行数组。
- **同 tab 重新对比按提交释放旧视图**：`directoryViewKey(session)` = 会话 id + comparison 单调修订号（`directoryComparisonKey` 以 `WeakMap` 登记，不延长 comparison 寿命）；upsert / replace / 切 tab 都换 key，React 在提交阶段卸载旧 `DirectoryView` / `TreeView` / `useVirtualizer`，旧 comparison 与旧 row model 不再经 fiber props / `ref` 回调 / `getScrollElement` 闭包可达；`directoryStates` / `directoryScroll` 仍在 shell，过滤 / 折叠 / 选中 / 两侧滚动位置重挂后原样恢复，只重置 `DirectoryView` 局部 toolbar 的 `direction` / `mode`。
- **摘要缓存键按 realpath 归一（`src/core/directory/compare.ts` + `shared/platform/types.ts` + `workbench/rootAliases.ts`）**：`aliasRoot(root, canonical)` / `canonicalPath(path)` 用 `Map<规范化根, 规范化真实根>` 做最长前缀匹配（同时接受 `/` 与 `\`），`get` / `set` / `delete` / `evictUnderRoots` 一律先归一，`hashes` 存规范路径；双上限 200,000 条 / 128 MiB、LRU、`hold()`、`evictDownToCaps` 与条目口径零改动，`estimatedBytes` 只按规范键长计费。
- **realpath 平台能力与别名登记**：`PlatformPort.realpath(paths)` 是唯一新增只读批量能力（`platform:realpath` + preload 白名单；electron 用 `node:fs/promises#realpath`，逐项 try/catch 失败回退输入、`/samples` 原样；web 恒等）；`aliasSideRoots(platform, cache, roots)` 在 `compareSides` / `compareRoots` 前登记（仅 `canonical !== root`，解析失败整批退化旧行为）；会话 id / `title` / `subtitle` / 证据 `roots` / `pairs` 仍用用户输入路径，别名根仍是独立 tab（不折叠）。
- **每个目录 tab 常驻完整树**：`WorkbenchSession.directory` 在每个目录会话上都有值，不存在 summary-only 形态与按需重建入口（`directorySummary` / `retainActiveTree` / `summarizeComparison` / `detachDirectoryComparison` / 激活重建与 `restoreFailures` 均已删除）；`commitSessionTree(cache, current, session, {replaceId})` 只做 upsert / 原位替换 + 被替换会话按根释放（`commitUpsert` 是薄封装），由 `Workbench` 与 perf harness 共用；切 tab 只改 `activeId`（0 次 `listDirectories` / `digestFiles` / `realpath`）；`releaseSessionTree` 的根经 `canonicalPath` 归一后再淘汰，关闭别名 tab 不会误清真路径热缓存；代价是 3 tab 常驻 3 棵完整树，边界由 `perf:gate` 的瞬峰护栏 / settle / appTotal / reclaim 硬线守（归 `perf-memory`）。
- **会话列表与释放语义单点（`workbench/sessionStore.ts`）**：`upsertSessions` / `replaceSessions` / `closeSessions` / `commitSessionTree` 是纯函数，同时被 `Workbench` 与 perf harness 使用；同 id 原位替换顺序不变，新 id 追加且不摘其它 tab 的树，替换时按「新会话仍占用同一批根」保留热缓存（`hashedFiles=0`）。
- **测量 harness 与真实 UI 一致（`src/renderer/src/perf/runRounds.ts` + `PerfRunner.tsx`）**：harness 渲染真实 `SessionTabs` + `DirectoryView`；`--mode upsert` 每轮用 `commitSessionTree` 复用同一 `sessionId`（tab 恒 1），`multisession` 逐轮追加（1→2→3），`retained` 建 3 tab 后做 `--hot-rounds` 轮活动 tab 热 upsert、再关活动 tab 落到相邻已驻留 tab；无 `held` 槽 / `onReleaseSession` / 轮前释放路径；`PerfRoundReport` 只留标量计数（含 `tabs`），不含 `directory` / `root` / 树或临时数组。
- **结构持有登记（`src/shared/perf/liveness.ts`）**：perf 模式下 `createDirectorySession` 登记 comparison、`DirectoryView` 的 `useMemo` 登记 row model，每个对象只计一次、不延长寿命，关闭时零开销。
- **门禁（`pnpm test:memory`，`src/memory-gate.ts`）**：`evaluateMemoryGate` 是纯函数，判定每轮 `stats.entries <= maxEntries`、`stats.estimatedBytes <= maxBytes`、第 3 轮 `entries` 与第 2 轮相等、第 3 轮 `estimatedBytes` 不大于第 2 轮、四态 `counts` 逐轮相等、`releasedEntries === 0`、轮数 `>= 3`；违规 id 为 `cache-entries-over-limit` / `cache-bytes-over-limit` / `round-entries-growth` / `round-bytes-growth` / `round-result-changed` / `session-release-leak` / `round-count`；`resolveMemoryGateExitCode` 只在 `ok` 时返回 0。
- **门禁数据集与接线**：测试在系统临时目录生成真实落盘数据集（每侧 2,000 文件、共 4,002、约 39 MiB、`d0/d1/bucket-*/` 三层嵌套、每 25 个文件一处同大小不同内容、左右各一个单侧文件），用 `fs` 真实列目录与流式 SHA-256 跑 3 轮并断言 `hashedFiles > 0`、`modified > 0`、`added === 1`，结束后清理；不读 `src/shared/fixtures` 或 `/samples`。`.munk/code-gates.json` 增单 argv `memory-gate`。
- **文档与取证（`docs/perf/large-directory-memory.md` + `docs/perf/evidence/`）**：文档 §5 写默认上限表、估算口径、LRU / hold / 按根释放 / 行模型 / harness 策略，§6.2 写 post-fix 实测（环境、轮次 RSS 表、Δ 序列、判定）与证据路径。

## 验收

- **ac-cache-default-caps**：无参 `createComparisonCache()` 返回有限的双上限（条目数 > 0、估算字节 > 0），上限值可从模块读取并被文档引用；插入超过条目上限的条目后 `stats.entries === cache.hashes.size` 且 `<= maxEntries`。
- **ac-cache-bytes-cap**：以显式极小 `maxBytes` 创建缓存，连续写入超过该预算的条目后 `stats.estimatedBytes <= maxBytes`，同时 `cache.hashes.size > 0`（不得用整体清空规避上限）。
- **ac-cache-lru-order**：条目上限为 3 时写入 A、B、C → `get(A)` 命中 → 写入 D，被淘汰的是 B；再写入 E，被淘汰的是 C；淘汰顺序确定且可断言。
- **ac-cache-stats**：命中计入 `hits`、未命中计入 `misses`、每次淘汰 `evictions + 1`；`entries` 与 `estimatedBytes` 随写入 / 淘汰同步变化，淘汰后回落而不是单调递增。
- **ac-cache-hit-zero-hash**：同一真实目录对在同一缓存下连续两轮，第 2 轮 `onDigestStats.files === 0`（默认上限足以容纳该数据集），且第 2 轮 `counts`（same / added / removed / modified / leftSkipped / rightSkipped / conflict）与第 1 轮逐字段相等。
- **ac-cache-miss-rehash-same**：以 `maxEntries: 1` 强制逐条淘汰后重新对比，四态 `counts` 与每个节点 `status` 分布与冷缓存首轮完全一致；被淘汰条目的路径必须回落到真实读取 / 哈希而不是返回错误结果。
- **ac-snapshot-seed-still-hit**：导入快照侧后再对比仍命中快照播种的摘要（不对 `/snapshots/...` 虚拟路径发起真实读取），且该场景在缓存淘汰后重算得到相同结果。
- **ac-close-session-evicts**：关闭某目录会话后，`cache.hashes` 中以该会话 `leftRoot` 或 `rightRoot` 为前缀的键数量为 0；另一未关闭会话根下的条目数量保持不变。
- **ac-replace-session-single**：对同一 id 重新对比成功后，`sessions` 中该 id 只有一条，且其 `directory` 是新对比对象（`!==` 旧对象）；旧对象的引用不再出现在会话状态、`directoryStates` / `directoryScroll` 或摘要缓存中。
- **ac-invisible-rows-not-built**：同时打开两个目录会话时，切到 B 不会为 A 重建行模型（`buildDirectoryRowModel` 只对激活会话调用）；切回 A 后其行数、首行与末行与切走前一致。
- **ac-view-key-releases-history**：同一目录会话连续重新对比 N 轮后，旧 `DirectoryComparison` 与旧 `DirectoryRowModel` 不再经 fiber props / `ref` 回调 / 虚拟列表闭包可达（fiber props 走查为确定性单测，`perfShell.test.tsx` 保留无 key 对照渲染证明旧行为下仍可达）；切 tab 与 `replaceSession` 同样换 key 卸载旧子树。
- **ac-harness-hold-modes**：perf harness 支持 `upsert`（同 session id、tab 恒 1）、`multisession`（tab 1→2→3）与 `retained`（3 tab 保留 + 活动 tab 热 upsert + 关活动 tab 并落到相邻已驻留 tab），并渲染真实 `SessionTabs` + `DirectoryView`；运行期不存在「轮次开始前释放上一轮会话」路径（`runRounds` 无 `onReleaseSession`，单测断言）；`PerfRoundReport` 序列化后只含标量 / 计数字段（含 `tabs`）。
- **ac-structural-single-hold**：perf 模式强制 GC 后，`upsert` 5 轮每轮与 settle 的存活 `DirectoryComparison` = 1、`DirectoryRowModel` ≤ 2、`tabs` = 1；`multisession` / `retained` 场景每轮 `comparisons` 等于当轮 tabs（1/2/3，retained 热轮与 settle 为 3）、`tabs` 按场景、row model ≤ 2；`retained` 的 `reclaim` 读数 `tabs = 2` 且 `comparisons = 2`；3 tab 只剩 1 份 comparison 判 `hold-comparisons` 红；`gc` 不可用判红而非跳过。
- **ac-cache-untouched**：`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 `134217728`、`DEFAULT_COMPARISON_CACHE_MAX_ENTRIES` 与淘汰 / 按根释放逻辑不变，`pnpm test:memory` 通过；upsert 热轮 `hashedFiles=0` 证明视图释放未触发重哈希。
- **ac-memory-gate-wired**：`.munk/code-gates.json` 含 `memory-gate`，其 command 为单一 argv `pnpm test:memory`（不含 `&&` / `|` / `;`）；本机运行退出码 0，单次 ≤ 180s。
- **ac-memory-gate-real-dataset**：`pnpm test:memory` 在系统临时目录生成真实落盘数据集（≥2,000 个文件、≥20 MiB 内容、≥2 层嵌套、含同大小但内容不同的文件），跑 ≥3 轮真实哈希，结束后清理；运行路径与日志中不出现 `src/shared/fixtures` 或 `/samples`。
- **ac-memory-gate-bounded**：该门禁断言每轮结束 `stats.entries <= maxEntries` 且 `stats.estimatedBytes <= maxBytes`；第 2 与第 3 轮结束后的 `stats.entries` 相等，且第 3 轮 `stats.estimatedBytes` 不大于第 2 轮。
- **ac-memory-gate-red**：给定一份缓存统计超出上限、或轮次间 `entries` 递增的输入，门禁判定函数返回 `ok=false` 并以非零退出；该用例有自动化单测覆盖。
- **ac-four-state-unchanged**：同一真实小数据集在改动前后的四态 `counts` 与节点 `status` 分布逐项一致（golden 断言）；`src/core/directory/snapshot.ts` 的协议版本与行格式未变，既有快照 round-trip 测试原样通过。
- **ac-perf-gate-green**：`pnpm perf:gate` 在 3 轮真实 Electron 门禁数据集上退出码 0，其证据 `verdict.ok === true`，renderer 峰值、app 总峰值与 Δ3 均在 gate 档内（阈值仍取 `perf/profiles.json` 现值）。
- **ac-hold-structure**：每个打开的目录 tab 都持自己的 `DirectoryComparison`，post-GC holds 为 `gc=true`、`comparisons === tabs`（upsert 1、multisession 1/2/3、retained 1/2/3/3/3 且 settle 3、`reclaim` 2）、`rowModels ≤ 2`（只有激活 tab 挂载视图）；3 tab 只剩 1 份 comparison 判 `hold-comparisons` 红。
- **ac-switch-no-scan**：同时打开 3 个目录 tab 后，点击任一非活动 tab 的整个切换提交内 `platform.listDirectories` 0 次、`platform.digestFiles` 0 次、`platform.realpath` 0 次；切回后该 tab 的行标题与四态计数与首次进入逐项相等，过滤 / 折叠 / 选中 / 滚动保持（`App.test.tsx` 两条切 tab 用例；`sessionStore.test.ts` 断言 3 tab 全部持有 `directory` 且前两个仍是同一对象）。
- **ac-switch-immediate**：切回非活动 tab 的同一提交内即渲染该 tab 的完整行（行数 > 0 且与首次进入的可见行标题逐项相等），全程不出现「正在从摘要缓存重建结果树…」、加载 spinner、进度条或恢复失败态；`Workbench.tsx` 中不存在重建入口 / `restoreFailures` / 恢复重试 UI。
- **ac-switch-four-state**：切回后该 tab 的四态计数（same / added / removed / modified、`fileCount`、左右 skipped）与首次进入逐项相等（状态栏读数逐项比对，写入 `App.test.tsx` 断言）。
- **ac-switch-state-preserved**：在 tab A 设置过滤文本、折叠若干路径、选中一行并分别滚动左右列表后切到 tab B 再切回，A 的过滤值、折叠集合、选中路径、左右滚动位置全部保持（与切走前逐项相等）。
- **ac-all-tabs-resident**：建齐 3 个目录 tab 后，每个目录会话都持有完整 `DirectoryComparison`（`sessionStore.test.ts` 断言 3 个 session 的 `directory` 均定义；提交第 3 个 tab 后前两个 session 仍引用同一 comparison 对象，不被替换 / 摘除），且代码中不存在 summary-only 形态与按需重建入口。
- **ac-alias-root-zero-hash**：别名根与真实根复用同一缓存键：第二次（别名）比较 `digestFiles` 调用 0 次、`counts.hashedFiles=0`、`cache.stats.entries` 不翻倍、tab 数 1→2 不折叠、第二个 tab 的 subtitle 仍显示用户输入的别名路径。
- **ac-gate-red-when-regressed**：门禁不是恒绿——「3 tab 只持 1 份 comparison（摘要化回归）」「轮界删 tab 使 tabs 不按场景」「别名轮 `hashedFiles>0`」三种回归必须判红（`verdict.test.ts` 判 `hold-comparisons` 红，`perf-gate.mjs` 的 `assertMultisession` / `assertRetained` 抛错）。
- **ac-alias-root-reuse**：别名根复用真实路径摘要——同一真实目录经别名根再次比较时 `hashedFiles=0`、`bytesToHash=0`，缓存条目数不因别名翻倍；`perf:gate` multisession 第 3 轮（`links/left` 别名）`counts.hashedFiles === 0`；别名仍是独立 tab（tabs 1→2→3、subtitle 保持用户输入路径）。
- **ac-alias-cache-key-scope**：`ComparisonCache.aliasRoot` 最长前缀匹配、嵌套根与 `/` / `\` 分隔均可；未登记别名时键与行为完全不变；`/snapshots/...` 虚拟路径原样不受影响；`PlatformPort.realpath` 对符号链接目录返回目标、不存在路径回退自身、`/samples` 原样，preload 白名单透传、web 实现恒等。
- **ac-cache-and-thresholds-untouched**：`perf/profiles.json` 六项数值零改动；`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 `134217728`，条目上限 / 淘汰 / `hold()` / 按根释放口径不变，`pnpm test:memory` 通过。
- **ac-no-product-semantics-change**：四态语义、目录对比 / 合并算法、`DirectoryComparison` 树结构、`.ocsnap.json` 快照线格式、tab 身份与顺序、下钻返回、同步 dry-run、进度与取消均保持现状；别名归一只作用于缓存键，不折叠 tab。
- **ac-real-evidence-3rounds**：`docs/perf/evidence/` 新增一份 post-fix 证据文件（不覆盖 `dawnchat-zenmind-20261022.json`），其 `rounds.length === 3`、`appPid` 唯一、各轮 `rendererPid` 相同、`commit.sha === git rev-parse HEAD` 且 `dirty === false`、`verdict.appliedThresholds.profile === 'real'`；第 1 轮 `counts.hashedFiles > 0`，各轮 `hashedFiles` / `bytesToHash` 如实记录（因淘汰而重哈希时不得填 0）。
- **ac-real-memory-targets**：同一证据的 `peaks.renderer <= 1610612736`、`peaks.appTotal <= 2684354560`，且 `Δ3 = rounds[2].rendererRss − rounds[1].rendererRss <= min(104857600, max(30% × Δ1, 26214400))`（Δ1 为第 1 轮 post-round 相对 startup 基线的增量），`verdict.ok === true`；若任一项未达，`docs/perf/large-directory-memory.md` 必须含「缓存上限 / 淘汰策略 / 归因」章节，给出逐轮增量序列并证明增长有界，且全文不得以「观察项」「已知未修」收口。
- **ac-docs-post-fix**：`docs/perf/large-directory-memory.md` 删除「本项不做缓存、不释放会话、不做内存优化」「缓存上限 / 会话释放归 memory-bounded」这类过期结论，写入默认上限取值、淘汰策略、3 轮实测结果与证据路径。
- **ac-existing-gates-green**：改动后 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm test:cancel` 全绿；既有对比 / 四态 / 快照 / 取消断言不放宽。

## 非目标

- 不改四态定义、节点 `status` 判定、对比 / 合并算法与 `counts` 语义，也不改快照线格式（`.ocsnap.json` 协议版本与行格式）。
- 不改符号链接「不跟随」口径与左右分列计数（归 `symlink-semantics`），不改取消结构化协议、IPC 形状与 stderr 零噪声约定（归 `cancel-structured`），不新增取消门禁。
- 不新建第二套测量入口或性能框架：复用 `pnpm perf:dir` / `pnpm perf:gate`，不改 `perf/profiles.json` 的档位上限来迁就结果。
- 不把摘要缓存移出渲染进程、不落盘持久化、不做跨进程 / 跨会话共享缓存服务。
- 不做任何 UI / 视觉变更：不加内存面板、设置项、进度样式，不改目录树交互与文案。
- 不改 README 已知问题、版本号、CHANGELOG、发布说明、发布工作流与资产校验（归 `release`）。
- 不做 Web 渲染模式、跨平台、真机 / 浏览器点选验收；不跑额外压测轮次。
- 不缩小或替换真实数据集取证，不手填 / 估算数字，不重写旧证据与发布说明。
- 边界口径：`cache.stats.estimatedBytes` 只覆盖哈希条目，常驻结果树不在任何缓存上限内，其边界由 `perf:gate` 的瞬峰护栏 + settle / appTotal / reclaim 硬线守；真实规模（DawnChat↔ZenMind）3 tab 驻留数字仍未采，不得用 gate 档证据代替。

## 实现约束

- 缓存继续留在 renderer，沿用 `Workbench.tsx` 的 `useRef` 单例，不新增第二个缓存实例或全局单例；改造限制在既有模块内。
- 默认上限必须同时有「条目数」与「估算字节」两项，常量集中一处，估算口径（每条约多少字节、是否含 path / hash 长度）写进代码注释与 `docs/perf/large-directory-memory.md`。
- `ComparisonCache` 的既有读取路径必须继续成立：快照播种、`planContentReads`、`hashFile`、`cache.hashes` 读写语义不得断；既有测试可更新实现细节断言，但不得放宽语义。
- 淘汰只影响「是否重哈希」，不得影响四态与 `counts`；任何未命中路径必须回落到真实读取 / 哈希。
- 会话释放走显式函数，关闭与替换两条路径都调用，不依赖 GC 时机，且不得淘汰仍被其它活动会话使用的根下条目；渲染侧释放由视图 key 在提交阶段完成，key 计算不得在 render 里产生副作用（修订号在 `createDirectorySession` 创建期登记），不得用 `useEffect` 延迟清理。
- harness 必须复用 `sessionStore` 的列表语义并渲染真实视图，不得恢复「轮前释放」或「每轮换 session id」来规避真实持有；`PerfRoundReport` 保持只含标量计数。
- `pnpm test:memory` 运行时间 ≤ 180s，不依赖本机 DawnChat / ZenMind 是否存在；真实两目录 3 轮由本机 GUI 会话执行，不进 CI 门禁。
- 真实取证在提交后的干净工作区运行（`dirty === false`），证据写出后不再改代码；必须重跑时保留旧文件、按时间命名新文件。
- 所有写入文档的内存 / 缓存数字必须可追溯到归档证据 JSON 或命令原文，禁止手填、估算或从旧发布说明抄。

## 最近交付证明

- WI：`wi_intake_d3f44d9dbbaabcb1`（回退「非活动 tab 只留摘要 + 激活重建」，恢复 3 tab 常驻完整对比；保留别名根 realpath 缓存键归一与 harness / 门禁能力，`kind: fix/regression`）
- 日期：2026-10-23
- 结果：code_gates passed（默认矩阵 9 项 attempt 001 全绿，`needSelfTest=false`）；`pnpm perf:gate` 在交付提交前的工作树单跑一次，upsert / multisession / retained 三份证据全部 PASS。
- 覆盖摘要：删除 `retainActiveTree` / `summarizeComparison` / `detachDirectoryComparison` / `directorySummary` 与激活重建（含 `restoreSequence` / `restoreFailures` / 重试 UI），`commitSessionTree` 只做 upsert / 原位替换 + 被替换会话按根释放；`holds.comparisons` 期望改为与场景 tabs 同源（`expectedHoldTabs`），3 tab 只持 1 份判 `hold-comparisons` 红；`PlatformPort.realpath` / `aliasRoot` / `canonicalPath`、`releaseSessionTree` 归一、`replaceId` 原位替换、`directoryViewKey` 修订号与瞬时峰值护栏保持不变。
- 注：本 WI change pack 仅提供 `prd.md`，AC 落档为 `qa/summary-tabs-and-alias-cache-keys.md`；`perf-gate` 只在条件 profile `.munk/code-gates.perf.json`，默认矩阵不含，后续触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消的改动仍按「同 commit 只采一次」纪律运行。
