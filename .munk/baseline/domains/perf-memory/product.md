# Domain: perf-memory

性能测量与容量上限域：为大目录多轮对比提供**可复现的内存测量入口**（`pnpm perf:dir`）与**自动上限门**（`pnpm perf:gate`）。本域只做「测量 + 判定 + 证据落盘 + 门禁接线」，**不改任何内存行为**——缓存上限 / 淘汰、会话释放、行模型懒构建归 `memory-bounded`；符号链接计数口径归 `symlink-policy`；取消行为归 `cancel-structured`；目录对比语义与四态归 `directory`。本域是被测路径的观察者，不是对比引擎的改造者。

## 范围

- **测量入口（`pnpm perf:dir`）**：`scripts/perf-dir.mjs` 先 `electron-vite build`，再启动**真实 Electron 应用**（真实主进程 + 真实 renderer）并透传 `--left <A> --right <B> --rounds N --out <file>`。轮次编排在渲染进程（`src/renderer/src/perf/PerfRunner.tsx` + `runRounds.ts`），走与 UI 同一条目录对比路径：`scanDirectory` → `compareDirectories` → `platform.digestFiles` → `createDirectorySession`；N 轮在**同一应用实例 / 同一 renderer 进程**内连续完成，每轮构造并替换新的目录会话（`sessionId` = `directory:<left> ↔ <right>` 且各轮互不相同）。采样与证据落盘在主进程（`src/main/perf/harness.ts`、`evidenceFile.ts`），两者经仅测量模式启用的受控通道（`src/shared/perf/types.ts` 的 `PerfBridge`、`channels.ts` 白名单）同步轮次边界。
- **激活条件（零行为变化）**：只有 `--perf-harness` 与 `OPENCOMPARE_PERF=1` **同时存在**才进入测量模式（`src/shared/perf/args.ts` 的 `isPerfHarnessActive`，可单测断言）；普通启动与普通 `--left/--right` 对比不采样、不写任何证据文件。
- **参数解析与校验（`src/shared/perf/args.ts`）**：必填 `--left` / `--right` / `--out`；可选 `--rounds`（默认 `DEFAULT_PERF_ROUNDS = 3`）、`--interval`（默认 `DEFAULT_PERF_INTERVAL_MS = 1000`，上限 `MAX_PERF_INTERVAL_MS = 2000`）、`--profile`（`real` / `gate`，默认 `real`）、`--fail-on-violation`。缺必填、未知参数、`--rounds` 非正整数、根不存在或不可读时非零退出，stderr 指明具体违规参数或根路径，且不遗留标记为成功的证据文件。
- **RSS 采样口径（`src/shared/perf/rss.ts`，纯函数）**：`aggregateProcessRss(metrics)` 从主进程真实进程指标（`app.getAppMetrics()` 的 `workingSetSize` / `peakWorkingSetSize`）聚合：`renderer` = `type === 'Tab'` 进程中 RSS 最大者，`main` = `Browser` 主进程，`appTotal` = 所有上报进程 `workingSetSize` 之和；KB → bytes 在采样层转换。禁止用 renderer JS heap 估算或 mock 数值；采样值缺失或为 0 记 `invalid-sample`。
- **采样点（`src/shared/perf/recorder.ts`）**：`startup`（启动基线）、`boundary`（`round-<n>-start` / `round-<n>-end`）、`pre-round`（每轮扫描前）、`post-round`（每轮会话构造完成后）、`periodic`（按 `sampling.intervalMs` 的周期采样，默认 1s）。每轮至少各 1 条 `pre-round` / `post-round`，轮次边界成对出现；某轮周期采样条数覆盖 `floor(wallMs / interval) - 1` 以上。
- **真实哈希计数（`src/core/directory/compare.ts` + `src/renderer/src/workbench/snapshotOps.ts`）**：`counts.hashedFiles` / `counts.bytesToHash` 来自该轮 `platform.digestFiles` **实际成功哈希**调用累计（可选统计钩子，不改变对比结果 / 四态 / `counts` / 快照格式）；命中缓存而零哈希的轮次如实记 0。
- **阈值判定单点实现（`src/shared/perf/verdict.ts` + `perf/profiles.json`）**：档位上限集中在 `perf/profiles.json`（`real` / `gate` 两档），判定函数 `evaluatePerf` 两档共用：renderer 峰值、app 总峰值、第 3 轮相对第 2 轮 renderer 增量 `Δ3 ≤ min(100 MiB, max(30% × Δ1, 25 MiB))`（比例项下限保护 25 MiB）。实际生效阈值写入 `verdict.appliedThresholds.appliedRoundDeltaBytes`；任一违反 → `verdict.ok=false` 且 `violations` 列出 `renderer-peak` / `app-total-peak` / `round-delta` / `invalid-sample` / `harness-error`。
- **退出码（`resolvePerfExitCode` / `formatPerfViolations`）**：带 `--fail-on-violation` 且违规时非零退出，证据仍完整写出；`invalid-sample` 无论是否带该开关都非零退出。
- **证据文件（`src/shared/perf/types.ts` + `src/main/perf/evidenceFile.ts`）**：单个 JSON（`schema: opencompare.perf.directory/v1`），**原子写**（同目录临时文件 + `rename`），单次 < 5 MB。字段：`generatedAt` / `appPid` / `commit{sha,dirty}` / `roots{left,right}` / `profile` / `sampling.intervalMs` / `memoryDefinition` / `counts{files,dirs,hashedFiles,bytesToHash}` / `rounds[{index,startedAt,endedAt,wallMs,sessionId,counts,rendererRss,appTotalRss,rendererPid}]` / `totalWallMs` / `env{os,arch,cpuModel,cpuCount,totalMemBytes,node,electron}`（运行期真实探针，非常量）/ `samples[{label,phase,round,at,rss,pids}]` / `peaks{renderer,main,appTotal}` / `roundDeltas[]` / `verdict{ok,violations[],appliedThresholds}` / 失败时的 `error`。运行失败（renderer 崩溃、窗口提前关闭、超时）仍写带 `error` 且 `verdict.ok=false` 的部分证据并退出非零。
- **门禁命令（`pnpm perf:gate`，`scripts/perf-gate.mjs`）**：在系统临时目录生成**真实落盘**数据集（每侧 6,000 文件、总内容 ≥ 100 MiB、`d0/…/d4` 五层嵌套、每 50 个文件一处同大小不同内容、左右各含指向文件 / 目录 / 悬空目标的符号链接），用 `gate` 档跑 3 轮真实哈希，按档位断言峰值与增量，运行结束即清理数据集；不读取 `src/shared/fixtures/` 或 `/samples`。门禁被打包为 `.munk/code-gates.json` 的单一 argv `pnpm perf:gate`（无 `&&` / `|`），单次有界（脚本自身 `RUN_TIMEOUT_MS = 150_000`，目标 ≤ 3 分钟），超时或阈值不通过即非零退出并输出被违反阈值 id。
- **文档与真实取证（`docs/perf/`）**：`docs/perf/large-directory-memory.md` 给出 DawnChat↔ZenMind 的可复制命令、产物路径、证据字段与口径、两档阈值与判定规则、以及归档真实实跑的已完成轮次与原因；`docs/perf/evidence/` 保存真实两目录（非内置样本）实跑证据，不提交生成的数据集。
- **公开发布包只读诊断（v0.2.6，`docs/perf/upsert-memory-diagnosis-2026-10-23.md`）**：对**已发布的公开包**（dmg sha256 锁定、非仓库内构建）做 `pnpm perf:dir` 之外的第二类取证——不起 harness，而是用 CDP 驱动已安装 app 的真实 UI 路径，只读测量两种场景：① 同一会话 upsert 反复对比 5 轮（`directorySessionId` 由两端根路径生成，重复即 upsert）；② 干净启动 `SKIP_A=1` 下 3 个不同根路径会话并发（tab 1→2→3，不关会话）。驱动脚本复用上一场复验的**只读原文件**（`repeat.mjs` / `multisession.mjs` / `lib.mjs`，运行前后 sha256 不变，不修改不另存），逐轮字段由同一实例上的**只读侧采样器**补齐（browser WS + `Target.attachToTarget(flatten:true)`，1 s 轮询 `Memory.getDOMCounters` / `performance.memory.usedJSHeapSize,jsHeapSizeLimit`（不可得时退 `Performance.getMetrics` 并注明口径）/ renderer 内 `ComparisonCache.stats`（`misses` 逐轮增量即该轮 `hashedFiles`），不占原脚本 page WS）。ready 峰值与 +20 s 静置收敛值**必须分列**，并按字节与 renderer 1,610,612,736 B / 静置 1,363,148,800 B / app 总 2,684,354,560 B 三个阈值比较。**仓库外**留证：≥3 份 `*.heapsnapshot`（组①第 1、2 轮 ready + 组② 3 tab ready，可选 settle），每份记录快照前 `JSHeapUsedSize`（含未回收垃圾）与快照后 reachable live 的差值，并回答 ready 时上一轮 `DirectoryComparison.root`、`DirectoryView` 的 `DirectoryRowModel`、`ComparisonCache.hashes` 条目是否仍可达（可达给 retainer path，不可达给“未持有”证据），同时量化 `estimatedBytes` 与实际 retained size 的差距以判断 128 MiB 估算是否漏算渲染侧。诊断产物**只写一份仓库文档**，`src/`、`package.json`、`.munk/code-gates.json`、README / CHANGELOG / `electron-builder.yml` / `docs/release*` 一律不动，不打包、不 push、不打 tag。

## 验收

- **ac-single-command-evidence**：给定两个存在可读的真实目录与 `--rounds N --out <file>`，一条命令跑完 N 轮并以退出码 0 写出证据 JSON；证据文件可被 schema 校验读取，`rounds.length === N`。
- **ac-cli-validation**：缺少 `--left`/`--right`/`--out`、未知参数、`--rounds` 为 0/负数/非数字、根不存在或不可读时以非零退出，stderr 指明具体违规参数或根路径，且不遗留标记为成功的证据文件。
- **ac-evidence-schema**：证据含必填字段且类型正确：`commit{sha,dirty}`、`roots{left,right}`、`counts{files,dirs,hashedFiles,bytesToHash}`、`rounds[{index,startedAt,endedAt,wallMs,sessionId}]`、`totalWallMs`、`env{os,cpuModel,cpuCount,totalMemBytes,node,electron}`、`samples[{label,phase,round,at,rss{renderer,main,appTotal}}]`、`peaks{renderer,main,appTotal}`、`roundDeltas`、`verdict{ok,violations[],appliedThresholds}`。
- **ac-env-probes-real**：`env` 各值与运行期真实探针一致（`os.release/arch`、`os.cpus()` 的型号与数量、`os.totalmem()`、`process.versions.node`、`process.versions.electron`），不是常量或手填。
- **ac-sample-points**：每轮至少产出 `phase=pre-round` 与 `phase=post-round` 各 1 条采样，轮次边界各 1 条（label 可区分），运行期间按固定间隔（≤2s，间隔写入证据）周期采样；某轮 `wallMs` 对应周期采样条数 ≥ floor(wallMs/interval) − 1。
- **ac-app-total-rss**：`appTotal` = 主进程 + 所有 renderer/utility 进程 `workingSetSize` 之和（KB→byte），`renderer` = `type` 为 Tab 的进程中 RSS 最大者，`main` = 主进程；聚合函数对给定 metrics 数组有单测覆盖，口径字符串写入证据 `memoryDefinition`。
- **ac-same-process-rounds**：所有轮次在同一应用实例内完成，证据记录的 `appPid` 唯一且各轮 renderer pid 相同。
- **ac-fresh-session-per-round**：每轮都构造并替换一个新的目录会话（`sessionId` 各轮互不相同且符合 `directory:<left> ↔ <right>` 形式），不得在同一会话对象上原地复用。
- **ac-hash-accounting**：`counts.hashedFiles` 与 `counts.bytesToHash` 等于该轮实际 `digestFiles` 调用累计的文件数与字节数；命中缓存而零哈希的轮次记为 0 并在证据中如实记录（不得沿用文档或旧版本数字）。
- **ac-verdict-rule**：判定函数按档位计算：真实档 renderer 峰值 ≤ 1.5 GB、app 总峰值 ≤ 2.5 GB、`Δ(3) ≤ min(100 MB, 30%×Δ(1))` 且比例项不足 25 MB 时取 25 MB（实际生效阈值写入 `verdict.appliedThresholds`）；任一违反 → `verdict.ok=false` 且 `violations` 列出违规 id。
- **ac-fail-on-violation**：带 `--fail-on-violation` 且证据违规时退出码非零，同时证据文件仍然完整写出（门禁可据此变红）。
- **ac-gate-wired**：`.munk/code-gates.json` 含 `perf-gate`（command 为单一 argv `pnpm perf:gate`，无 `&&`/`|`）；`pnpm perf:gate` 在本机通过（退出码 0）且单次运行 ≤ 3 分钟。
- **ac-gate-real-dataset**：`pnpm perf:gate` 生成的数据集位于系统临时目录、运行结束即清理，包含 ≥5,000 文件、≥100 MB 内容、≥5 层嵌套、同大小不同内容文件与指向文件/目录/悬空的符号链接；其证据的 `roots` 指向该临时真实目录，不含 `src/shared/fixtures` 或 `/samples` 路径。
- **ac-gate-red-on-violation**：给定一份超出峰值或增量阈值的证据 JSON，判定/门禁路径返回 `ok=false` 并以非零退出，输出中列出被违反的阈值 id；该用例有自动化单测覆盖。
- **ac-normal-start-unaffected**：不带 perf 参数与环境变量启动时不做采样、不写任何证据文件；现有 `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿，现有对比结果与四态断言不变。
- **ac-doc-real-command**：`docs/perf/large-directory-memory.md` 含可直接复制的命令（`/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`、`--rounds 3`、`--out docs/perf/evidence/...`）、产物路径、证据字段与口径说明、两档阈值与判定规则。
- **ac-real-evidence**：仓库 `docs/perf/evidence/` 下存在一次真实两目录实跑生成的证据文件，其 `roots` 为真实目录（非样本）、`rounds.length >= 2`、`samples` 非空、`commit.sha` 与生成时 HEAD 一致；未跑满 3 轮时文档如实记录已完成轮次与原因，禁止填充或估算数字。
- **ac-baseline-v026**：诊断只认公开 v0.2.6 包——dmg sha256 逐字等于 `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c`（113,412,984 B），安装后 `CFBundleShortVersionString=0.2.6`，`codesign --verify` 与 `spctl -a` 通过，报告记录 tag→commit `30967cd1e8fd521fa517588b2a7ac503305797e5`；任一不符即停止，不进入采样。原脚本硬编码的 `schema` / `app` / `appAsarUnchanged` / `expectedVersion='0.2.5'` / `EXPECTED` 常量**不构成版本证据**，须另写 `00-preflight-v026.json|txt` 记录真实 dmg sha256、app 版本、签名、`app.asar` sha256 与 commit 并在报告声明。
- **ac-original-scripts**：运行前后 `repeat.mjs` / `multisession.mjs` / `lib.mjs` 的 sha256 与基线表逐字一致（原文件未被改写、未另存改内容）；组① `repeat.mjs` 5 轮 `blockedAt=null`、`allRoundsReady=true`；组② `SKIP_A=1` 后 tab 数 1→2→3 且三步 `ok=true`。
- **ac-repeat-fields**：组① 1..5 轮每轮 JSON 均含非空 `readyWallMs`、`readyPeakBytes`（该轮 submit→ready 窗口峰值）、`settle20sBytes`、`domNodes`、`heapUsedBytes`、`heapLimitBytes`、`appTotalRssBytes`、`hashedFiles`；`tabCount` 恒为 1，5 轮 renderer PID 相同；四态固定为 `same 38542 / added 701232 / deleted 6827 / modified 5878 / sourceFiles 51247 / targetFiles 745652 / diffs 713937`。
- **ac-ready-settle-separated**：报告中组①、组②都把 ready 峰值与 +20 s 收敛值放在**不同列**，并各有 1536 / 1300 / 2560 MiB 阈值比较（按字节判，不用四舍五入后的 MiB）；不允许出现只给单一内存数字的轮次。
- **ac-concurrent-3**：组② 3 步四态分别与固定四态一致（反向那步只允许 added/deleted 互换），tab 数 1/2/3 证明无 upsert 折叠；3 tab 建齐后 20 s 收敛值、DOM / heap / RSS / hashedFiles 非空且入表；报告必须注明“②的静置是 3 tab 建齐后 20 s，不是每步后 20 s”。
- **ac-heap-retainers**：仓库外存在 ≥3 份 `.heapsnapshot` 且路径可访问（组① 2 份 + 组② 1 份，可选 settle）；每份都有快照前 used、快照后 live、以及“结果树 / 行模型 / 缓存条目在 ready 时 held / not-held”的结论与引用链或不可达证据；给出 `cache.stats.estimatedBytes` 与渲染侧 retained size 对比并明确 128 MiB 估算是否只覆盖哈希条目、渲染侧是否在任何上限之外；快照可能超过 Node 字符串上限，分析必须流式解析，分析脚本与 sha256 留证。
- **ac-hot-wallclock**：报告把组①第 2–5 轮墙钟与 7.8 s 历史热跑基线对照（绝对值 + 百分比），并说明该轮 `hashedFiles`；若 hot 墙钟 ≥2× 基线或回到 ~20 s，必须在结论中显式标注。
- **ac-history-contrast**：报告含 v0.2.5 的 1,742 MiB（upsert）/ 1,659 MiB（3 会话）历史对照，但结论句只引用 v0.2.6 实测，并写明 v0.2.5 未重跑、其数字只作历史对照与触发条件。
- **ac-report-single-deliverable**：`docs/perf/upsert-memory-diagnosis-2026-10-23.md` 是**唯一**新增仓库交付文件；必含 10 个必填小节：① 机器负载与采样起止 ISO 时间（含时区）② 被测包 tag/commit/dmg sha256/版本/`app.asar` sha256/签名公证 ③ 组①逐轮表（含 +30 s 终值）④ 组②逐会话表（静置口径注明）⑤ 证据路径（JSON/日志/截图/堆快照/分析输出/脚本 sha256）⑥ 稳定触发条件与门槛判定 ⑦ 影响面 ⑧ 根因候选（排序 + 支持证据 + 可证伪点，至少覆盖“upsert 期间新旧对比并存”“行模型/结果树是否被上一轮持有”“缓存上限只算哈希条目”“V8 未及时 GC”）⑨ 修复代价（是否动缓存与淘汰、改动面、热跑会不会退回 ~20 s）⑩ a/b/c 三选一推荐（各写范围/代价/风险/适用条件并明确推荐一项）；缺任一小节不通过。
- **ac-c-branch-measured**：若 v0.2.6 峰值未越 1536 MiB（c 支），报告仍必须先给完整两组逐轮数字与证据路径，再推荐 c 并写清关条条件；只写“未复现”视为不通过。
- **ac-readonly-scope**：采样与取证期间未改 `src/`、`package.json`、`.munk/code-gates.json`、`README.md`、`CHANGELOG.md`、`electron-builder.yml`、`docs/release*`、发布文件；未打包、未 push、未打 tag；`git status` 除本报告与既有 `.munk/changes/**` PRD 外无其它新增。
- **ac-sampling-isolation**：采样起止 ISO 时间、起止 loadavg 与 top CPU 写入报告；采样窗口内没有构建 / 测试 / 门禁 / 其它 QA 进程（`pnpm` / `electron-vite` / `vitest` / `perf:gate` / `test:memory`）；若检测到并发构建或门禁，该轮作废重采，不得混用；组间退出 app 并 `pgrep -fl OpenCompare` 确认无残留，每组独立 `--user-data-dir` 与端口，同一 UD 不得跨组复用。

## 非目标

- 不做任何内存优化：缓存上限 / 淘汰、会话释放、行模型懒构建一律归 `memory-bounded`；本域除测量所需的最小统计钩子外**不得改变缓存与持有行为**。
- 不改符号链接口径（归 `symlink-policy`）：门禁数据集虽含符号链接，但内存断言不依赖链接计数语义，链接口径变更后仍应在门禁档阈值内通过。
- 不改取消行为与取消日志（归 `cancel-structured`）：测量入口不触发取消，不覆盖取消门禁。
- 不做 v0.2.5 版本号、CHANGELOG、README 已知问题翻转、发布说明与资产校验（归 `release`）。
- 不做 Web 渲染模式（`pnpm dev:web`）的内存测量；不做真机 / 浏览器点选验收；不做跨平台门禁。
- 不做 UI 变更：不加内存图表、设置项或新页面；证据是文件不是界面。
- 不引入性能测试框架、云压测、遥测上传或后台守护进程。
- 不得用内置 fixtures / samples 替代真实目录；不得手填、估算或从发布说明抄数字。
- 不为让门禁变绿而放宽阈值或缩小数据集；阈值调整必须能在证据里解释。
- 不改快照线格式、对比算法与四态定义；不改历史发布证据。
- **只读诊断不做任何修复**：v0.2.6 upsert / 3 会话诊断不改缓存、淘汰、行模型、会话释放、harness；a/b/c 只给推荐，不实施；不改 `.munk/code-gates.json`、不加 upsert / 3 会话门禁（那是推荐项 a/b 的后续工作）。
- 只读诊断不重跑 v0.2.5、不参考 / 不合并已作废的 v0.2.5 诊断项；v0.2.5 数字只作历史对照。
- 只读诊断不扩到 Windows / Linux 实测，不做 >3 会话、>5 轮 soak、小目录或其它目录对的横向测试；不重新打包、不签名、不公证、不 push、不打 tag、不发版；不写第二份仓库文档；不动被测目录内容（DawnChat / ZenMind 只读），不改内置样本，不跑其它 QA / code_gates 与采样并行。

## 实现约束

- **入口形态单一**：复用现有 `electron-vite` 主 / 渲染构建，`pnpm perf:dir` 启动真实 Electron 应用；轮次编排在渲染进程（走 UI 同一条对比与会话构造路径），采样与证据落盘在主进程，两者经一个仅测量模式启用的受控通道同步轮次边界。不另开第二套 harness。
- **默认零行为变化**：harness 仅由显式 CLI 参数 + 环境变量（`--perf-harness` + `OPENCOMPARE_PERF=1`）激活；激活判断可被单测断言。
- **RSS 必须真实**：来自主进程 `app.getAppMetrics()` 的 `workingSetSize` / `peakWorkingSetSize`（必要时 `process.getProcessMemoryInfo()`）；禁止 renderer JS heap 估算或 mock 数值。采样值缺失或为 0 视为该轮 invalid，退出非零。
- **哈希计数落在真实调用上**：允许在 `@core/directory/compare` 增加可选统计回调 / 返回值，但不得改变对比结果、四态、`counts`、快照格式与既有测试语义。
- **阈值单点**：判定函数单点实现（`src/shared/perf/verdict.ts`），真实档与门禁档共用；档位上限集中在 `perf/profiles.json`，不在多处硬编码。
- **证据原子写**：临时文件 + `rename`；运行失败也写出带 `error` 与 `verdict.ok=false` 的部分证据并退出非零；证据单次 < 5 MB，不提交生成的数据集。
- **周期采样**：默认 1s，可经参数覆盖（上限 2000ms）并写入证据。
- **门禁有界**：`pnpm perf:gate` 单次 ≤ 3 分钟（本机 macOS GUI 会话），超时即红；不依赖本机 DawnChat / ZenMind 是否存在——真实两目录只用于文档命令与人工取证。
- **数字可追溯**：文档与证据遵守 WorkSet §5.3，任何数字可追溯到命令与原始输出；真实两目录取证与门禁小数据集是两件事，不得互相替代。
- **只读诊断的采样独占与隔离**：先确认无 `pnpm` / `electron-vite` / `vitest` / `perf:gate` / `test:memory` / 其它 QA 在跑再起被测 app，采样窗口内不叠任何构建或门禁（要跑 code_gates 必须等采样结束并完全退出 app，或先跑门禁待机器空闲 ≥10 分钟再采样，两者绝不重叠）；每组单独 `--user-data-dir` 与端口，组间退出 app 并 `pgrep -fl OpenCompare` 确认无残留，同一 UD 不得跨组复用。
- **只读诊断的启动与度量口径**：`<app>/Contents/MacOS/OpenCompare --remote-debugging-port=<port> --user-data-dir=<ud>`，等 `/json/version` 可读后再挂 CDP，版本以包与 UA 双证；renderer / app 总 RSS 走 `ps -axo rss=` 口径，heap 走 `Performance.getMetrics().JSHeapUsedSize`，堆上限优先 `performance.memory.jsHeapSizeLimit`，DOM 走 `Memory.getDOMCounters`，`hashedFiles` 走 `ComparisonCache.stats.misses` 逐轮增量（或 digest stats），报告中固定写口径、不得混用。
- **只读诊断的证据与判定**：证据统一放仓库外 `~/Library/Application Support/Munk AI/munk-auto/artifacts/opencompare-v026-diagnosis/{evidence,heap,logs,scripts}/`，报告引用绝对路径，JSON 保留原始逐轮与采样序列而不只留摘要；阈值按字节比较（1610612736 / 1363148800 / 2684354560 B）；四态不符先停，不修改脚本 `EXPECTED` 常量、不裁剪轮次、不挑样本。
- **只读诊断的报告语言**：中文，数字保留原始字节与 MiB 两列；结论句必须能从同文证据块直接复算。

## 最近交付证明

- WI：`wi_intake_139d8079c8ffdd70`（v0.2.6 公开包 upsert / 3 会话并发 ready 内存峰值只读诊断 a/b/c 收口，`kind: perf/diagnosis`）
- 日期：2026-10-23
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；未改任何门禁与实际运行代码）。唯一仓库交付物：`docs/perf/upsert-memory-diagnosis-2026-10-23.md`；所有采样证据在仓库外 `~/Library/Application Support/Munk AI/munk-auto/artifacts/opencompare-v026-diagnosis/{evidence,heap,logs,scripts}/`。
- 覆盖摘要：① **被测基线锁定**——公开 v0.2.6 dmg sha256 `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c`（113,412,984 B）、`CFBundleShortVersionString=0.2.6`、codesign 通过、`spctl` accepted（Notarized Developer ID）、`app.asar` sha256 `242ae3fd…0741e`、tag→commit `30967cd`，`00-preflight-v026.json` 另证；原脚本的 `0.2.5` 常量在报告中明确声明不作版本判定。② **原脚本复用不改写**——`repeat.mjs` / `multisession.mjs` / `lib.mjs` 运行前后 sha256 与基线逐字一致；逐轮 DOM / heap / limit / `hashedFiles` 由 1 s 只读侧车补齐（browser WS + `Target.attachToTarget(flatten:true)`，不占 page WS），侧车对热跑墙钟干扰实测 ≈ +1.5%（<10% 阈值，故未另建 instrumented 驱动）。③ **组① upsert 5 轮**——ready 峰值 701.3 / 1321.4 / 1680.3 / 1707.5 / **1725.9 MiB**（第 3 轮起越 1536 MiB，最大超 189.9 MiB），+20 s 收敛 517.6→1274.8 MiB（未越 1300）、+30 s 终值 1,337,819,136 B，app 总最大 2173.6 MiB（未越 2560）；tab 恒 1、renderer PID 恒 48644、四态 5 轮全等、`hashedFiles` 首轮 76,604 其后 0。④ **组② 3 会话**——tab 1/2/3 无 upsert 折叠（反向步只换 added/deleted），第 3 tab ready 峰值 **1716.2 MiB**（越线 180.2 MiB）、3 tab 后 20 s 收敛 1258.3 MiB、app 总 2168.4 MiB。⑤ **堆快照与引用链**——4 份快照（含可选的 5 轮后 settle）：第 1 轮 1 个 `DirectoryComparison` / 2 个 `DirectoryRowModel`；第 2 轮 ready 变 2 / 4 且强制 GC 后仍 `reachedRoot=true`；5 轮后 settle **仍有 3 个 comparison + 4 个 row model**（≈938 MiB live）。引用链为 `fiber --property:ref--> closure --> Context(internal:previous) --> context:comparison` 与 `@tanstack/react-virtual` 的 `getScrollElement` 闭包 → `context:rows`；缓存 `estimatedBytes` 仅 30.5 / 59.6 MiB，而单份结果树 reachable 299.0 MiB（约 10 倍）→「128 MiB 上限只覆盖哈希条目、渲染侧不在任何上限内」成立。⑥ **热跑与结论**——第 2–5 轮 8.5–10.0 s（对 7.8 s 基线 +15.6%～+17.4%），<2× 且未回到 ~20 s，因 `hashedFiles=0`；a/b/c 中推荐 **a**（清理 renderer 旧 comparison / row model 引用 + 把 upsert 与 3 会话纳入门禁，本项不修）。
- 证据：组①驱动 `evidence/group1-repeat-v026.json`（77,710 B）+ 侧车 `sidecar-g1-v026.json`（~3.2 MB / 213 条）+ 无侧车对照 `group1-repeat-nosidecar-v026.json`；组② `group2-multisession-v026.json`（58,355 B）+ `sidecar-g2-v026.json`（97 条）；堆快照 `heap/g1-round1-ready.heapsnapshot`（702,514,205 B）、`g1-round2-ready`（1,242,679,754 B）、`g2-3tabs-ready`（1,878,220,824 B）、`g1-round5-settled`（1,737,695,005 B）及 4 份 `graph-*.json` / `snap-*.json`；分析脚本（`cdp/probeExpr/sidecar/phases/holdsnap/graph/derive.mjs`）sha256 全部留证。采样窗口 11:53:04.348 – 12:14:02.338 (+08:00)，起止 loadavg 与 top CPU 入表，窗口内无构建 / 测试 / 门禁进程，组间 `pgrep -fl OpenCompare` 无残留、每组独立 UD 与端口。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；本轮验收按 AC 逐条落档为 `qa/v026-upsert-memory-readonly-diagnosis.md`。上一个 WI 的证明仍见 `qa/perf-memory-harness-and-gate.md`（`wi_ws_44175d3fab91cf88`）。
- 后续注意：① **`pnpm perf:dir` 的 3 轮绿与真实 UI 的 upsert 路径不是同一件事**——harness 每轮 `onRoundStart` 前主动释放上一轮会话（`memory-bounded` 的 `ac-harness-round-release`），所以 post-fix 证据是 `verdict.ok=true`（renderer 峰值 1,257,750,528 B）；但真实 UI 的 upsert 由 React fiber `ref` 与 `react-virtual` 闭包持有历史 comparison，实测第 3 轮起越 1536 MiB、静置仍持 3 份。**任何以 harness 绿推论 UI 内存有界的结论都不成立**，后续压峰值必须用本诊断的 UI 路径命令复核。② 越线只在「同根路径 upsert 第 3 轮起」与「3 个同规模 tab」两种场景，冷启动首次对比 694–706 MiB 不触发；判定按字节，`+20 s` 静置全部低于 1300 MiB、app 总低于 2560 MiB、无崩溃无 OOM。③ 修复（推荐 a）只应动 renderer 释放路径（`upsertSession` / `replaceSession` 与 `DirectoryView` 的 ref 回调 / 虚拟列表闭包、旧 row model 数组），**不要动缓存上限与淘汰**：热轮 `hashedFiles=0`、cache 仅 30.5–59.6 MiB，改缓存不会降峰值却可能让热跑重新哈希退回 21.6–22.5 s。④ 快照本身会强制 GC 并额外占 3.4–6.9 GiB RSS，**不得参与 RSS 阈值判定**；`reachable` 是语义边上界（跨候选共享节点重复计入），不是 dominator retained size。⑤ 采样机非独占（loadavg 基线 4–5，另有空闲 Vite dev server / 模拟器 / Chrome / Cursor），所有墙钟只在同机同会话内对照有效。
- 上一 WI（`wi_ws_44175d3fab91cf88` 测量入口 + `perf-gate`）的完整证明与执行快照保留在 `qa/perf-memory-harness-and-gate.md`；其中两点仍然有效：① `perf-gate` 已进入 code_gates，此后每轮 code_gates 都要真实启动 Electron 并做 6,000×2 文件哈希（含 `electron-vite build`），无 GUI 会话或超时会被判红；② 门禁数据集含符号链接，但内存断言不依赖链接计数。
