# 反复对比内存收敛：有界缓存与跨轮释放

## 范围

1. **有界摘要缓存**（`src/core/directory/compare.ts` 的 `ComparisonCache`）：在现有 `hashes` 语义上增加「条目数 + 估算字节」双上限与 LRU（或等价）淘汰，并暴露可读统计（`entries` / `estimatedBytes` / `hits` / `misses` / `evictions`）。默认上限集中一处常量，测试可注入极小上限。快照播种（`seedSnapshotCache`）、`planContentReads`、`hashFile` 与既有 `cache.hashes` 读取路径必须继续工作。
2. **会话生命周期释放**（`src/renderer/src/workbench/Workbench.tsx`、`directoryCompare.ts`）：关闭或替换目录会话时，除了现有 shell 状态清理，还要显式释放旧 `DirectoryComparison` 引用，并淘汰该会话左右根下的摘要缓存条目；其它活动会话的条目不受影响。
3. **不可见会话不保留行模型**：行模型只随激活的 `DirectoryView` 挂载构建，切 tab / 关闭后不残留；不得为后台会话预建或缓存行数组。
4. **测量 harness 轮间释放**（`src/renderer/src/perf/runRounds.ts`、`PerfRunner.tsx`）：每轮开始前丢掉上一轮会话引用；`PerfRoundReport` 只保留标量计数，不持有树/会话/临时数组。
5. **真实两目录 3 轮取证**：用已交付的 `pnpm perf:dir` 对 DawnChat↔ZenMind 补跑到 3 轮，新增一份 post-fix 证据文件（保留 `docs/perf/evidence/dawnchat-zenmind-20261022.json` 作为改动前基线不动），并更新 `docs/perf/large-directory-memory.md` 的结论、默认上限与淘汰策略。
6. **门禁**：新增 `memory-gate`（`pnpm test:memory`），以单 argv 接入 `.munk/code-gates.json`；用真实落盘小数据集跑 ≥3 轮，断言缓存上限、warm 轮不增长、会话释放与结果不变，并覆盖「超限即红」。现有 `perf-gate` 必须保持绿。

## 验收

- ac-cache-default-caps: 无参 `createComparisonCache()` 返回有限的双上限（条目数 > 0、估算字节 > 0），上限值可从模块读取并被文档引用；插入超过条目上限的条目后 `stats.entries === cache.hashes.size` 且 `<= maxEntries`。
- ac-cache-bytes-cap: 以显式极小 `maxBytes` 创建缓存，连续写入超过该预算的条目后 `stats.estimatedBytes <= maxBytes`，同时 `cache.hashes.size > 0`（不得用整体清空规避上限）。
- ac-cache-lru-order: 条目上限为 3 时写入 A、B、C → `get(A)` 命中 → 写入 D，被淘汰的是 B；再写入 E，被淘汰的是 C；淘汰顺序确定且可断言。
- ac-cache-stats: 命中计入 `hits`、未命中计入 `misses`、每次淘汰 `evictions + 1`；`entries` 与 `estimatedBytes` 随写入/淘汰同步变化，淘汰后回落而不是单调递增。
- ac-cache-hit-zero-hash: 同一真实目录对在同一缓存下连续两轮，第 2 轮 `onDigestStats.files === 0`（默认上限足以容纳该数据集），且第 2 轮 `counts`（same / added / removed / modified / leftSkipped / rightSkipped / conflict）与第 1 轮逐字段相等。
- ac-cache-miss-rehash-same: 以 `maxEntries: 1` 强制逐条淘汰后重新对比，四态 `counts` 与每个节点 `status` 分布与冷缓存首轮完全一致；被淘汰条目的路径必须回落到真实读取/哈希而不是返回错误结果。
- ac-snapshot-seed-still-hit: 导入快照侧后再对比仍命中快照播种的摘要（不对 `/snapshots/...` 虚拟路径发起真实读取），且该场景在缓存淘汰后重算得到相同结果。
- ac-close-session-evicts: 关闭某目录会话后，`cache.hashes` 中以该会话 `leftRoot` 或 `rightRoot` 为前缀的键数量为 0；另一未关闭会话根下的条目数量保持不变。
- ac-replace-session-single: 对同一 id 重新对比成功后，`sessions` 中该 id 只有一条，且其 `directory` 是新对比对象（`!==` 旧对象）；旧对象的引用不再出现在会话状态、`directoryStates` / `directoryScroll` 或摘要缓存中。
- ac-invisible-rows-not-built: 同时打开两个目录会话时，切到 B 不会为 A 重建行模型（`buildDirectoryRows` 只对激活会话调用）；切回 A 后其行数、首行与末行与切走前一致。
- ac-harness-round-release: 3 轮 harness 运行中，每轮 `onRoundStart` 触发前对外持有的上一轮会话引用为 0；`PerfRoundReport` 序列化后只含标量/计数字段，不含 `directory`、`root` 或其它树对象。
- ac-memory-gate-wired: `.munk/code-gates.json` 含 `memory-gate`，其 command 为单一 argv `pnpm test:memory`（不含 `&&` / `|` / `;`）；本机运行退出码 0，单次 ≤ 180s。
- ac-memory-gate-real-dataset: `pnpm test:memory` 在系统临时目录生成真实落盘数据集（≥2,000 个文件、≥20 MiB 内容、≥2 层嵌套、含同大小但内容不同的文件），跑 ≥3 轮真实哈希，结束后清理；运行路径与日志中不出现 `src/shared/fixtures` 或 `/samples`。
- ac-memory-gate-bounded: 该门禁断言每轮结束 `stats.entries <= maxEntries` 且 `stats.estimatedBytes <= maxBytes`；第 2 与第 3 轮结束后的 `stats.entries` 相等，且第 3 轮 `stats.estimatedBytes` 不大于第 2 轮。
- ac-memory-gate-red: 给定一份缓存统计超出上限、或轮次间 `entries` 递增的输入，门禁判定函数返回 `ok=false` 并以非零退出；该用例有自动化单测覆盖。
- ac-four-state-unchanged: 同一真实小数据集在改动前后的四态 `counts` 与节点 `status` 分布逐项一致（golden 断言）；`src/core/directory/snapshot.ts` 的协议版本与行格式未变，既有快照 round-trip 测试原样通过。
- ac-perf-gate-green: `pnpm perf:gate` 在 3 轮真实 Electron 门禁数据集上退出码 0，其证据 `verdict.ok === true`，renderer 峰值、app 总峰值与 Δ3 均在 gate 档内（阈值仍取 `perf/profiles.json` 现值）。
- ac-real-evidence-3rounds: `docs/perf/evidence/` 新增一份 post-fix 证据文件（不覆盖 `dawnchat-zenmind-20261022.json`），其 `rounds.length === 3`、`appPid` 唯一、各轮 `rendererPid` 相同、`commit.sha === git rev-parse HEAD` 且 `dirty === false`、`verdict.appliedThresholds.profile === 'real'`；第 1 轮 `counts.hashedFiles > 0`，各轮 `hashedFiles` / `bytesToHash` 如实记录（因淘汰而重哈希时不得填 0）。
- ac-real-memory-targets: 同一证据的 `peaks.renderer <= 1610612736`、`peaks.appTotal <= 2684354560`，且 `Δ3 = rounds[2].rendererRss − rounds[1].rendererRss <= min(104857600, max(30% × Δ1, 26214400))`（Δ1 为第 1 轮 post-round 相对 startup 基线的增量），`verdict.ok === true`；若任一项未达，`docs/perf/large-directory-memory.md` 必须含「缓存上限 / 淘汰策略 / 归因」章节，给出逐轮增量序列并证明增长有界，且全文不得以「观察项」「已知未修」收口。
- ac-docs-post-fix: `docs/perf/large-directory-memory.md` 删除「本项不做缓存、不释放会话、不做内存优化」「缓存上限/会话释放归 memory-bounded」这类过期结论，写入默认上限取值、淘汰策略、3 轮实测结果与证据路径。
- ac-existing-gates-green: 改动后 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm test:cancel` 全绿；既有对比/四态/快照/取消断言不放宽。

## 非目标

- 不改四态定义、节点 `status` 判定、对比/合并算法与 `counts` 语义。
- 不改快照线格式（`.ocsnap.json` 协议版本与行格式）。
- 不改符号链接「不跟随」口径与左右分列计数（已由 `symlink-policy` 交付）。
- 不改取消结构化协议、IPC 形状与 stderr 零噪声约定（已由 `cancel-structured` 交付），不新增取消门禁。
- 不新建第二套测量入口或性能框架：复用 `pnpm perf:dir` / `pnpm perf:gate`；不改 `perf/profiles.json` 的档位上限来迁就结果。
- 不把摘要缓存移出渲染进程、不落盘持久化、不做跨进程/跨会话共享缓存服务。
- 不做任何 UI / 视觉变更：不加内存面板、设置项、进度样式，不改目录树交互与文案。
- 不改 README 已知问题、版本号、CHANGELOG、发布说明、发布工作流与资产校验（归 `release-025`）。
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
