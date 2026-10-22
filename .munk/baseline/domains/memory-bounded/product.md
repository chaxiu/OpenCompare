# Domain: memory-bounded

反复对比下的内存有界域：把「同一对目录反复对比」这件事从**无上限累积**改成**有界驻留**——摘要缓存有双上限与 LRU 淘汰、关闭/替换会话显式释放、不可见会话不保留行模型、测量 harness 轮间释放，并新增 `memory-gate`（`pnpm test:memory`）作为回归门槛，最后用真实两目录 3 轮取证把 `verdict.ok` 翻绿。本域**不改对比算法**：四态定义、节点 `status`、`counts` 语义、快照线格式与取消协议全部不动，淘汰只影响「是否重哈希」。测量入口 / 证据 schema / 阈值档位归 `perf-memory`（本域只复用 `pnpm perf:dir` 与 `pnpm perf:gate`，不改数据）；符号链接口径归 `symlink-semantics`；取消归 `cancel-structured`；目录对比语义归 `directory`。

## 范围

- **有界摘要缓存（`src/core/directory/compare.ts` 的 `ComparisonCache`）**：在既有 `hashes` 语义上叠加「条目数 + 估算字节」双上限与 LRU 淘汰，并暴露可读统计 `stats{entries, estimatedBytes, hits, misses, evictions}`（每次淘汰 `evictions + 1`，含容量淘汰与按根释放）。默认上限集中为两个导出常量 `DEFAULT_COMPARISON_CACHE_MAX_ENTRIES = 200_000` / `DEFAULT_COMPARISON_CACHE_MAX_BYTES = 128 MiB`，估算口径为 `estimatedEntryBytes(path, entry) = COMPARISON_CACHE_ENTRY_OVERHEAD_BYTES(96) + 2 × (path.length + hash.length)`（UTF-16 字符，估算而非堆测量，注释与 `docs/perf/large-directory-memory.md` 同步）。`hashes` 仍是 `Map`，插入顺序即最近使用顺序；`get` 命中把条目移到队尾并计 `hits`，未命中计 `misses`；`set` 覆盖旧值后按新值计字节并从队首逐个淘汰；`delete` 是失效而非淘汰（不计 `evictions`）；`evictUnderRoots(roots)` 按规范化根（自身或 `root/`、`root\` 前缀）释放条目并计入 `evictions`；`hold()` 在一次对比期间（扫描→摘要→分类）暂缓容量淘汰，release 时重新套用上限，避免「摘要算完、分类时已被淘汰」的不确定结果。单条超预算时仍保留刚写入的那一条（`hashes.size > 1`），不允许「整体清空」规避上限。
- **容量注入**：`createComparisonCache(options)` 接受 `maxEntries` / `maxBytes`，非有限数或 `< 1` 回落默认值；`cache.maxEntries` / `cache.maxBytes` 暴露生效上限供测试与门禁断言。
- **既有读取路径不断**：快照播种（`seedSnapshotCache`，`/snapshots/...` 虚拟路径的摘要直接写入缓存、不发真实读取）、`planContentReads`、`hashFile`、既有 `cache.hashes` 直读（取消与快照测试依赖）语义不变；未命中的条目回落真实读取 + 真实摘要，不回错误结果。
- **会话生命周期释放（`src/renderer/src/workbench/directoryCompare.ts` + `Workbench.tsx`）**：`releaseDirectoryComparison(cache, comparison, openSessions)` 显式淘汰该对比 `leftRoot` / `rightRoot` 下的摘要条目，跳过仍被其它活动会话使用的根；`Workbench` 的关闭（`closeSession`）、重新对比（`upsertSession`）、替换（`replaceSession`）三条路径都调用它，不依赖 GC 时机。Shell 既有清理（`directoryStates` / `directoryScroll`）保持不变。
- **不可见会话不保留行模型（`Workbench.tsx` + `views/DirectoryView`）**：行模型（`@core/directory/rows` 的 `buildDirectoryRowModel`）只随激活的 `DirectoryView` 挂载构建，切 tab / 关闭后不残留；不为后台会话预建或缓存行数组。
- **测量 harness 轮间释放（`src/renderer/src/perf/runRounds.ts` + `PerfRunner.tsx`）**：`runPerfRounds` 用一个 `held` 槽只持有当前轮的会话，下一轮 `onRoundStart` **之前**经 `onReleaseSession` 丢掉上一轮引用（`PerfRunner` 对应 `setSession(null)`）；`PerfRoundReport` 只保留标量计数，不含 `directory` / `root` / 树或临时数组。
- **门禁（`pnpm test:memory`，`src/memory-gate.ts` + `src/memory-gate.test.ts`）**：`evaluateMemoryGate` 是纯函数，判定每轮 `stats.entries <= maxEntries`、`stats.estimatedBytes <= maxBytes`、第 3 轮 `entries` 与第 2 轮相等、第 3 轮 `estimatedBytes` 不大于第 2 轮、四态 `counts` 逐轮相等、`releasedEntries === 0`、轮数 `>= MEMORY_GATE_MIN_ROUNDS(3)`；违规 id 为 `cache-entries-over-limit` / `cache-bytes-over-limit` / `round-entries-growth` / `round-bytes-growth` / `round-result-changed` / `session-release-leak` / `round-count`；`resolveMemoryGateExitCode` 只在 `ok` 时返回 0。测试在系统临时目录生成真实落盘数据集（每侧 2,000 文件、共 4,002 文件、约 39 MiB、`d0/d1/bucket-*/` 三层嵌套、每 25 个文件一处同大小不同内容、左右各一个单侧文件），用 `fs` 真实列目录与流式 SHA-256 跑 3 轮并断言 `hashedFiles > 0`、`modified > 0`、`added === 1`，结束后清理；不读 `src/shared/fixtures` 或 `/samples`。`.munk/code-gates.json` 增单 argv `memory-gate`（`pnpm test:memory`，无 `&&` / `|` / `;`），本机单次约 1.5s（上限 180s）。
- **文档与真实取证（`docs/perf/large-directory-memory.md` + `docs/perf/evidence/`）**：文档 §5 写默认上限表、估算口径、LRU / hold / 按根释放 / 行模型 / harness 释放策略，§6.2 写 post-fix 的 DawnChat↔ZenMind 3 轮实测（命令、环境、轮次 RSS 表、Δ 序列、判定）与证据路径；改动前基线 `dawnchat-zenmind-20261022.json` 原样保留，新增 `dawnchat-zenmind-20261022-post-fix-3rounds.json`。

## 验收

- **ac-cache-default-caps**：无参 `createComparisonCache()` 返回有限的双上限（条目数 > 0、估算字节 > 0），上限值可从模块读取并被文档引用；插入超过条目上限的条目后 `stats.entries === cache.hashes.size` 且 `<= maxEntries`。
- **ac-cache-bytes-cap**：以显式极小 `maxBytes` 创建缓存，连续写入超过该预算的条目后 `stats.estimatedBytes <= maxBytes`，同时 `cache.hashes.size > 0`（不得用整体清空规避上限）。
- **ac-cache-lru-order**：条目上限为 3 时写入 A、B、C → `get(A)` 命中 → 写入 D，被淘汰的是 B；再写入 E，被淘汰的是 C；淘汰顺序确定且可断言。
- **ac-cache-stats**：命中计入 `hits`、未命中计入 `misses`、每次淘汰 `evictions + 1`；`entries` 与 `estimatedBytes` 随写入/淘汰同步变化，淘汰后回落而不是单调递增。
- **ac-cache-hit-zero-hash**：同一真实目录对在同一缓存下连续两轮，第 2 轮 `onDigestStats.files === 0`（默认上限足以容纳该数据集），且第 2 轮 `counts`（same / added / removed / modified / leftSkipped / rightSkipped / conflict）与第 1 轮逐字段相等。
- **ac-cache-miss-rehash-same**：以 `maxEntries: 1` 强制逐条淘汰后重新对比，四态 `counts` 与每个节点 `status` 分布与冷缓存首轮完全一致；被淘汰条目的路径必须回落到真实读取/哈希而不是返回错误结果。
- **ac-snapshot-seed-still-hit**：导入快照侧后再对比仍命中快照播种的摘要（不对 `/snapshots/...` 虚拟路径发起真实读取），且该场景在缓存淘汰后重算得到相同结果。
- **ac-close-session-evicts**：关闭某目录会话后，`cache.hashes` 中以该会话 `leftRoot` 或 `rightRoot` 为前缀的键数量为 0；另一未关闭会话根下的条目数量保持不变。
- **ac-replace-session-single**：对同一 id 重新对比成功后，`sessions` 中该 id 只有一条，且其 `directory` 是新对比对象（`!==` 旧对象）；旧对象的引用不再出现在会话状态、`directoryStates` / `directoryScroll` 或摘要缓存中。
- **ac-invisible-rows-not-built**：同时打开两个目录会话时，切到 B 不会为 A 重建行模型（`buildDirectoryRowModel` 只对激活会话调用）；切回 A 后其行数、首行与末行与切走前一致。
- **ac-harness-round-release**：3 轮 harness 运行中，每轮 `onRoundStart` 触发前对外持有的上一轮会话引用为 0；`PerfRoundReport` 序列化后只含标量/计数字段，不含 `directory`、`root` 或其它树对象。
- **ac-memory-gate-wired**：`.munk/code-gates.json` 含 `memory-gate`，其 command 为单一 argv `pnpm test:memory`（不含 `&&` / `|` / `;`）；本机运行退出码 0，单次 ≤ 180s。
- **ac-memory-gate-real-dataset**：`pnpm test:memory` 在系统临时目录生成真实落盘数据集（≥2,000 个文件、≥20 MiB 内容、≥2 层嵌套、含同大小但内容不同的文件），跑 ≥3 轮真实哈希，结束后清理；运行路径与日志中不出现 `src/shared/fixtures` 或 `/samples`。
- **ac-memory-gate-bounded**：该门禁断言每轮结束 `stats.entries <= maxEntries` 且 `stats.estimatedBytes <= maxBytes`；第 2 与第 3 轮结束后的 `stats.entries` 相等，且第 3 轮 `stats.estimatedBytes` 不大于第 2 轮。
- **ac-memory-gate-red**：给定一份缓存统计超出上限、或轮次间 `entries` 递增的输入，门禁判定函数返回 `ok=false` 并以非零退出；该用例有自动化单测覆盖。
- **ac-four-state-unchanged**：同一真实小数据集在改动前后的四态 `counts` 与节点 `status` 分布逐项一致（golden 断言）；`src/core/directory/snapshot.ts` 的协议版本与行格式未变，既有快照 round-trip 测试原样通过。
- **ac-perf-gate-green**：`pnpm perf:gate` 在 3 轮真实 Electron 门禁数据集上退出码 0，其证据 `verdict.ok === true`，renderer 峰值、app 总峰值与 Δ3 均在 gate 档内（阈值仍取 `perf/profiles.json` 现值）。
- **ac-real-evidence-3rounds**：`docs/perf/evidence/` 新增一份 post-fix 证据文件（不覆盖 `dawnchat-zenmind-20261022.json`），其 `rounds.length === 3`、`appPid` 唯一、各轮 `rendererPid` 相同、`commit.sha === git rev-parse HEAD` 且 `dirty === false`、`verdict.appliedThresholds.profile === 'real'`；第 1 轮 `counts.hashedFiles > 0`，各轮 `hashedFiles` / `bytesToHash` 如实记录（因淘汰而重哈希时不得填 0）。
- **ac-real-memory-targets**：同一证据的 `peaks.renderer <= 1610612736`、`peaks.appTotal <= 2684354560`，且 `Δ3 = rounds[2].rendererRss − rounds[1].rendererRss <= min(104857600, max(30% × Δ1, 26214400))`（Δ1 为第 1 轮 post-round 相对 startup 基线的增量），`verdict.ok === true`；若任一项未达，`docs/perf/large-directory-memory.md` 必须含「缓存上限 / 淘汰策略 / 归因」章节，给出逐轮增量序列并证明增长有界，且全文不得以「观察项」「已知未修」收口。
- **ac-docs-post-fix**：`docs/perf/large-directory-memory.md` 删除「本项不做缓存、不释放会话、不做内存优化」「缓存上限/会话释放归 memory-bounded」这类过期结论，写入默认上限取值、淘汰策略、3 轮实测结果与证据路径。
- **ac-existing-gates-green**：改动后 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm test:cancel` 全绿；既有对比/四态/快照/取消断言不放宽。

## 非目标

- 不改四态定义、节点 `status` 判定、对比/合并算法与 `counts` 语义。
- 不改快照线格式（`.ocsnap.json` 协议版本与行格式）。
- 不改符号链接「不跟随」口径与左右分列计数（已由 `symlink-policy` 交付）。
- 不改取消结构化协议、IPC 形状与 stderr 零噪声约定（已由 `cancel-structured` 交付），不新增取消门禁。
- 不新建第二套测量入口或性能框架：复用 `pnpm perf:dir` / `pnpm perf:gate`；不改 `perf/profiles.json` 的档位上限来迁就结果。
- 不把摘要缓存移出渲染进程、不落盘持久化、不做跨进程/跨会话共享缓存服务。
- 不做任何 UI / 视觉变更：不加内存面板、设置项、进度样式，不改目录树交互与文案。
- 不改 README 已知问题、版本号、CHANGELOG、发布说明、发布工作流与资产校验（归 `release`）。
- 不做 Web 渲染模式、跨平台、真机/浏览器点选验收；不跑 41G 全量之外的额外压测轮次。
- 不缩小或替换真实数据集取证，不手填/估算数字，不重写 v0.2.4 及更早的证据与发布说明。

## 实现约束

- 缓存继续留在 renderer，沿用 `Workbench.tsx` 的 `useRef` 单例，不新增第二个缓存实例或全局单例；改造限制在既有模块内。
- 默认上限必须同时有「条目数」和「估算字节」两项，常量集中一处（例如 `src/core/directory/compare.ts` 或紧邻的常量文件），估算口径（每条约多少字节、是否含 path/hash 长度）写进代码注释与 `docs/perf/large-directory-memory.md`。
- `ComparisonCache` 的既有读取路径必须继续成立：快照播种、`planContentReads`、`hashFile`、`cache.hashes` 的读写语义不得断；既有测试可更新实现细节断言，但不得放宽语义。
- 淘汰只影响「是否重哈希」，不得影响四态与 `counts`；任何未命中路径必须回落到真实读取/哈希。
- 会话释放走显式函数，关闭与替换两条路径都调用，不依赖 GC 时机；不得淘汰仍被其它活动会话使用的根下条目。
- harness 的轮间释放必须发生在 `onRoundStart` 之前；`PerfRoundReport` 保持只含标量计数，不新增树或会话字段。
- `pnpm test:memory` 运行时间 ≤ 180s，不依赖本机 DawnChat/ZenMind 是否存在；真实两目录 3 轮由本机 GUI 会话执行，不进 CI 门禁。
- 真实取证在提交后的干净工作区运行（`dirty === false`），证据写出后不再改代码；必须重跑时保留旧文件，按时间命名新文件。
- 所有写入文档的内存/缓存数字必须可追溯到归档证据 JSON 或命令原文，禁止手填、估算或从旧发布说明抄。

## 最近交付证明

- WI：`wi_ws_82a40b89eaf54938`（反复对比内存收敛：有界缓存与跨轮释放，`kind: perf/feature`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；门禁清单新增 `memory-gate`，Host 记录 install / lint / typecheck / build / build-web / test / cancel-gate / perf-gate / memory-gate 全部通过）。
- 覆盖摘要：① **有界缓存**——`@core/directory/compare.ts` 的 `ComparisonCache` 加 `maxEntries` / `maxBytes` 双上限、LRU touch、`hits` / `misses` / `evictions` 统计、`evictUnderRoots` 按根释放、`hold()` 在对比边界重新套用上限；默认上限 `200_000` 条 / `128 MiB` 估算，单条估算 `96 + 2×(path+hash)`；`hashes` 保持 `Map` 直读语义，快照播种、`planContentReads`、`hashFile` 路径未断，`snapshot.ts` 仅加 `seedSnapshotCache` 相关导出（协议版本与行格式未变）。② **会话释放**——`directoryCompare.ts` 新增 `releaseDirectoryComparison`（跳过仍被其它活动会话使用的根），`Workbench.tsx` 的 `closeSession` / `upsertSession` / `replaceSession` 三处调用；行模型仍只在激活的 `DirectoryView` 内构建（`App.test.tsx` 用 `buildDirectoryRowModel` 计数 mock 断言切 tab 不为后台会话建行）。③ **harness 释放**——`runRounds.ts` 只持有当前轮会话并在下一轮 `onRoundStart` 前经 `onReleaseSession` 释放，`PerfRunner` 同步 `setSession(null)`；`PerfRoundReport` 仍只含标量。④ **门禁**——新增 `src/memory-gate.ts`（纯判定 + 违规 id + 退出码）与 `src/memory-gate.test.ts`（临时目录每侧 2,000 文件 / 共 4,002 文件 / 约 39 MiB / 三层嵌套 / 同大小不同内容 / 单侧增删文件，真实 3 轮哈希 + 会话释放 + 红路径），`.munk/code-gates.json` 增单 argv `memory-gate`（`pnpm test:memory`）。⑤ **文档与取证**——`docs/perf/large-directory-memory.md` 新增 §5 上限/淘汰/估算口径与 §6.2 post-fix 3 轮实测，删除「不做缓存 / 不释放会话」的过期结论；新增 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`，改动前基线文件未改。
- 证据：真实实跑（DawnChat ↔ ZenMind，`commit 0d48c81`、`dirty=false`、`--rounds 3 --interval 1000`）：对比树 752,479 文件 / 97,565 目录；第 1 轮实际哈希 76,604 文件 / 11,105,870,346 B，第 2、3 轮缓存命中 0 / 0；`appPid=66492` 唯一、三轮 `rendererPid=66513` 相同、采样 54 条；墙钟 22,717 + 9,361 + 9,547 = 41,630 ms；renderer post-round 737,427,456 → 1,186,463,744 → 1,257,750,528 B，app 总 1,244,807,168 → 1,702,215,680 → 1,791,934,464 B；峰值 renderer 1,257,750,528 B（real 档上限 1,610,612,736 B）、main 409,272,320 B、app 总 1,791,934,464 B（上限 2,684,354,560 B）；Δ1 633,274,368 / Δ2 449,036,288 / Δ3 71,286,784 B，生效增量阈值 104,857,600 B，`verdict.ok=true`、`violations=[]`。对照基线（1,960,394,752 / 2,505,654,272 B、`violations=["renderer-peak"]`）：renderer 峰值降 702,644,224 B、app 总峰值降 713,719,808 B。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；本轮验收按 AC 逐条落档为 `qa/memory-bounded-cache-and-session-release.md`。
- 后续注意：① **`Δ2` 仍是最大增量（449 MB，第 2 轮首次全量哈希后的进程驻留）**——本轮只证明第 3 轮增量收敛（71 MB）而非逐轮等比增长，未对该 449 MB 做单独归因测量；若之后要压 renderer 峰值，应从「第 2 轮哈希后的临时对象/堆扩容」方向取证，而不是再缩缓存上限。② 真实档 renderer 峰值 1.17 GiB 距 1.5 GiB 上限仍有约 350 MB 余量，`perf-gate`（gate 档 1.0 GiB）与 `memory-gate` 都不会替真实两目录兜底——**任何再次触碰摘要/扫描路径的 WI 都要重跑 `pnpm perf:dir --rounds 3`**，并把新证据按时间命名另存，不覆盖既有基线。③ `memory-gate` 的数据集规模（每侧 2,000 文件 / 39 MiB）远小于真实树（75 万文件），它只守「上限/不增长/释放/结果不变」四条结构断言，不守绝对内存值；绝对内存值只由 `perf-gate` 与真实取证守。④ 缓存 `hold()` 让一次对比期间可短暂超出 `maxEntries`（边界处回落），因此**不要把 `hold` 期间的瞬时 `stats.entries` 当越界**；门禁断言取轮次结束后的快照。
