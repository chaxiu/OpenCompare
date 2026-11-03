# Domain: perf-memory

性能测量与容量上限域：为大目录多轮对比提供可复现的内存测量入口（`pnpm perf:dir`）与自动上限门（`pnpm perf:gate`），只做「测量 + 判定 + 证据落盘 + 门禁接线」，不改任何内存行为。缓存上限 / 淘汰、会话释放、行模型懒构建归 `memory-bounded`；符号链接计数口径归 `symlink-policy`；取消行为归 `cancel-structured`；目录对比语义与四态归 `directory`。本域只观察被测路径，不改造对比引擎。

## 范围

- **测量入口与轮次编排**：`pnpm perf:dir`（`scripts/perf-dir.mjs`）先 `electron-vite build`，再启真实 Electron 应用，透传 `--left` / `--right`（可重复、按序配对）、`--mode <upsert|multisession|retained>`、`--rounds`、`--settle`、`--interval`、`--profile`、`--out`、`--hot-rounds`（仅 `retained`）；轮次在 renderer 内编排（`perf/PerfRunner.tsx` + `runRounds.ts`），走与 UI 同一条路径（`scanDirectory` → `compareDirectories` → `digestFiles` → `createDirectorySession` → `commitUpsert`）并渲染真实 `SessionTabs` + `DirectoryView`（含 `TreeView` 与 `buildDirectoryRowModel`），使 fiber props、virtualizer 闭包与行模型进入被测面。
- **持有语义 = 真实 UI**：会话列表语义取自 `workbench/sessionStore.ts`（`upsertSessions` / `replaceSessions` / `commitUpsert`），与 `Workbench.upsertSession` / `replaceSession` 同义；N 轮在**同一实例 / 同一 renderer 进程**内连续完成，运行期**不存在「轮次开始前释放上一轮会话」的路径**。`upsert` 复用同一对根、tab 恒 1、`sessionId` 恒定；`multisession` 逐轮追加不同根、tab 1→2→3；`retained` 建 3 tab 保留 1→2→3、按 `--hot-rounds`（默认 2）热 upsert 后关活动 tab 落相邻已驻留 tab。采样与证据落盘在主进程，经仅测量模式启用的受控通道与 renderer 同步轮次边界与 hold / settle。
- **激活条件（零行为变化）**：只有 `--perf-harness` 与 `OPENCOMPARE_PERF=1` **同时存在**才进入测量模式（`isPerfHarnessActive`，可单测断言）；普通启动与普通 `--left/--right` 对比不采样、不写任何证据文件。
- **参数默认值**：必填 `--left` / `--right` / `--out`；`--mode` 默认 `upsert`；`--rounds` 默认 3（`multisession` 下必须等于根对数）；`--settle` 默认 20000 ms、上限 60000 ms（`0` 仅单测）；`--interval` 默认 1000 ms、上限 2000 ms；`--profile` 默认 `real`；另有 `--fail-on-violation`。非法组合、根不存在或不可读一律非零退出，不留标记成功的证据。
- **RSS 口径与采样点**：`aggregateProcessRss` 从 `app.getAppMetrics()` 的 `workingSetSize` / `peakWorkingSetSize` 聚合——`renderer` = `type === 'Tab'` 中 RSS 最大者、`main` = `Browser`、`appTotal` = 所有上报进程之和，缺失或 0 记 `invalid-sample`。采样点 `startup` / `boundary`（`round-<n>-start|end`）/ `pre-round` / `post-round` / `periodic`（默认 1s）/ `settle`（末轮后等 `--settle` 毫秒并强制 GC 的单次读数）；`peaks` 只聚合 ready / round / periodic，**排除 `settle`**，静置单独成列。
- **结构持有登记**：perf 模式在 app ready 前装 `--js-flags=--expose-gc`；每轮结束与最终 settle 后连续 `gc()` 两次，再经 `WeakRef` 登记表数 `DirectoryComparison` / `DirectoryRowModel`，以 `perf.event({type:'hold'})` 上报 `label` / `round` / `tabs` / `comparisons` / `rowModels` / `gc`；`gc` 不可用即 `hold-unmeasured` 违例。
- **阈值判定单点**：`perf/profiles.json`（`real` / `gate`）集中档位上限，`evaluatePerf` 两档共用：renderer ready 峰值、app 总峰值、`settleRendererBytes`（real 1,363,148,800 B / gate 1,073,741,824 B）、`Δ3 ≤ min(100 MiB, max(30% × Δ1, 25 MiB))`（仅 `upsert`）；生效阈值写 `appliedThresholds.appliedRoundDeltaBytes`。`violations` 取值 `renderer-peak` / `renderer-round-peak` / `renderer-settle` / `settle-missing` / `app-total-peak` / `round-delta` / `hold-comparisons` / `hold-row-models` / `hold-tabs` / `hold-unmeasured` / `invalid-sample` / `harness-error` / `hot-round-hashed` / `hot-round-growth` / `settle-growth` / `reclaim-missing` / `reclaim-renderer` / `renderer-restart`。
- **多 tab 持有形态：瞬峰护栏 vs 用户可见硬线**：`multisession` / `retained` 的瞬时 ready 峰值只作回归护栏 `TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104`（2.25 GiB），超 profile 目标但未越护栏只写 `notices[]`（`renderer-peak-over-target` 等），不判红；`settle` / `settleStages`（阶段间抬升 ≤ 100 MiB）/ `appTotal` / `reclaim`（≤ `RECLAIM_RENDERER_BYTES = 1_153_433_600`，关 1 tab 后 `tabs = pairs − 1`）/ 热轮 `hashedFiles = 0` / hold 结构（`comparisons` = 场景 tabs、`tabs` 按同一份 `expectedHoldTabs`）仍是硬线。证据加法字段 `settleStages[{label,rss,at,tabs}]`（`after-3-tabs` / `after-hot-upserts`）、`reclaim{tabs,rss,at}`、`rounds[].rendererPid`。
- **退出码与证据文件**：带 `--fail-on-violation` 且违规时非零退出、证据仍完整写出；`invalid-sample` 无论是否带该开关都非零。证据为单 JSON（`schema: opencompare.perf.directory/v1`，字段只增不改）、单次 < 5 MB，字段清单见 `ac-evidence-schema`；运行失败仍写带 `error` 且 `verdict.ok=false` 的部分证据并非零退出。
- **门禁命令**：`pnpm perf:gate`（`scripts/perf-gate.mjs`）在系统临时目录造**真实落盘**数据集（每侧 6,000 文件、≥ 100 MiB、`d0/…/d4` 五层、每 50 文件一处同大小不同内容、含文件/目录/悬空符号链接，另造 `links/left` 作第三对根），同一数据集跑三次 harness（`gate` 档、`--settle 5000`、超时 300 s）：① `upsert` 1 对根 5 轮；② `multisession` 3 对根各 1 轮；③ `retained` 3 对根 + 2 轮热 upsert，断言见 `ac-perf-gate-three-modes`。该命令在条件 profile `.munk/code-gates.perf.json` 以单一 argv 登记（默认 9 项矩阵不含它），单次有界（`RUN_TIMEOUT_MS = 300_000`），结束即清理数据集；`PERF_GATE_EVIDENCE_DIR` 只额外复制证据。
- **文档与真实取证**：`docs/perf/large-directory-memory.md` 给可复制命令、产物路径、字段与口径、两种持有模式、结构断言、两档阈值与判定规则，并把 **ready 峰值** 与 **+settle 静置** 分列；`docs/perf/evidence/` 保存真实两目录（非内置样本）实跑证据，不提交数据集。对已发布公开包另有一次只读诊断（`docs/perf/upsert-memory-diagnosis-2026-10-23.md`）：用 CDP 只读采样已安装 app 的真实 UI，快照与脚本只留仓库外。

## 验收

- **ac-single-command-evidence**：给定两个存在可读的真实目录与 `--rounds N --out <file>`，一条命令跑完 N 轮、退出码 0，写出可被 schema 校验的证据 JSON 且 `rounds.length === N`。
- **ac-cli-validation**：缺 `--left`/`--right`/`--out`、未知参数、`--mode` 非法值、左右数量不一致、`upsert` 给多对 / `multisession` 只给一对、`--rounds` 为 0/负/非数字、`--settle` 为负或超上限、根不可读时非零退出，stderr 指明违规参数或根路径，不遗留标记成功的证据；不带 `--mode`/`--settle` 仍解析为 `upsert` / 20000 ms。
- **ac-evidence-schema**：字段与类型齐全：`commit{sha,dirty}`、`mode`、`pairs[]`、`roots{left,right}`、`counts{files,dirs,hashedFiles,bytesToHash}`、`rounds[{index,startedAt,endedAt,wallMs,sessionId,tabs}]`、`totalWallMs`、`env{os,cpuModel,cpuCount,totalMemBytes,node,electron}`、`samples[{label,phase,round,at,rss{renderer,main,appTotal}}]`、`peaks{renderer,main,appTotal}`、`settle`/`settleAt`、`holds[{label,round,tabs,comparisons,rowModels,gc}]`、`roundDeltas`、`verdict{ok,violations[],appliedThresholds}`；`peaks` 不含 settle。
- **ac-env-probes-real**：`env` 各值来自运行期真实探针（`os.release/arch`、`os.cpus()` 型号与数量、`os.totalmem()`、`process.versions.node` / `electron`），非常量或手填。
- **ac-sample-points**：每轮至少 `pre-round` 与 `post-round` 各 1 条、轮次边界各 1 条（label 可区分）；固定间隔（≤2s，写入证据）周期采样，某轮条数 ≥ floor(wallMs/interval) − 1；末轮后 1 条 `settle`，时长等于 `--settle` 并写入 `sampling.settleMs`。
- **ac-app-total-rss**：`appTotal` = 主进程 + 所有 renderer/utility `workingSetSize` 之和（KB→byte），`renderer` = `Tab` 中最大者，`main` = 主进程；聚合函数有单测，口径写入 `memoryDefinition`。
- **ac-same-process-rounds**：所有轮次同实例完成，`appPid` 唯一且各轮 renderer pid 相同。
- **ac-harness-hold-modes**：支持 `upsert` / `multisession` / `retained`；`upsert` 每轮复用同一 `sessionId`（`directory:<left> ↔ <right>`，tab 恒 1、只留最新会话对象）；`multisession` 逐轮追加使 tab 1→2→3；`retained` 建 3 tab 保留并按 `--hot-rounds` 热 upsert、最后关活动 tab 落相邻已驻留 tab；证据记 `mode`/`pairs`/`rounds[].tabs`/`settleStages`/`reclaim`；运行期无「轮前释放上一轮会话」路径（`runRounds` hooks 无 `onReleaseSession`）。
- **ac-structural-single-hold**：强制 GC 后只读存活登记 `holds[]`：`upsert` 5 轮后 `comparisons=1`、`rowModels≤2`、`tabs=1`（含 settle）；`multisession`/`retained` 每轮 `comparisons` = 当轮 tabs（1/2/3，retained 热轮与 settle 为 3、`reclaim` 2）、`rowModels≤2`，3 tab 只剩 1 份 comparison 判 `hold-comparisons` 红；`gc=false` 或 `holds` 缺失记 `hold-unmeasured` 红。
- **ac-gate-red-on-old-behavior**：门禁非恒绿——旧行为（保留旧会话 / 不清引用 / 无视图 key）必须失败：`perfShell.test.tsx` 无 key 对照渲染断言旧 comparison 与旧行模型仍可达；`verdict.test.ts` 断言 `comparisons>1`、`rowModels>2`、`gc=false`、3 tab 只持 1 份 comparison、轮界删 tab 使 tabs 不按场景、别名轮 `hashedFiles>0`、`reclaim` 未回落必红；`perf-gate.mjs` 的 `assertMultisession` / `assertRetained` 覆盖脚本侧断言。
- **ac-gate-covers-upsert-and-multisession**：`pnpm perf:gate` 单次即覆盖 `upsert` 5 轮、`multisession` 3 会话、`retained` 3 tab + 2 轮热 upsert，三份证据各给峰值、settle / settleStages / reclaim 与 holds 断言结果；违例退出非零。
- **ac-real-ui-upsert-peak**：打包 app + 原样 `repeat.mjs` upsert 5 轮，逐轮 renderer ready 峰值 ≤ 1,610,612,736 B，第 3 轮及以后不得 >1536 MiB。
- **ac-real-ui-upsert-settle**：同 5 轮每轮 +20 s 静置 renderer ≤ 1,363,148,800 B，末轮再静置 30 s 后仍 ≤ 1,363,148,800 B。
- **ac-real-ui-multisession**：打包 app + 原样 `multisession.mjs`（`SKIP_A=1`）3 会话，3 tab 建齐 ready 峰值 ≤ 1,610,612,736 B，统一 +20 s 静置 ≤ 1,363,148,800 B。
- **ac-real-ui-app-total**：上述两组任一轮 app 总 RSS ≤ 2,684,354,560 B。
- **ac-real-ui-no-regression**：`repeat.mjs` 5 轮四态仍 `same 38542 / added 701232 / deleted 6827 / modified 5878`、`tabCount` 恒 1、renderer PID 恒定、`allRoundsReady=true`、`blockedAt=null`；`multisession.mjs` tab 1/2/3，反向步仅 added/deleted 互换，三步 `ok=true`。
- **ac-hot-wallclock-no-regression**：热轮（同会话第 2–5 轮）每轮墙钟 ≤12,000 ms 且 `hashedFiles=0`，不得回到 ~20 s。
- **ac-cache-untouched**：`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 `134217728`，淘汰与条目口径不变，`pnpm test:memory` 通过；热轮 `hashedFiles=0` 证明未重哈希。
- **ac-quality-gates**：`pnpm lint` / `typecheck` / `build` / `build:web` / `test` / `test:memory` / `perf:gate` 全绿；采样通过（若红如实交付红，不重跑）。
- **ac-release-files-untouched**：`package.json#version`、`CHANGELOG.md`、README 版本表、release workflow / notes / 发布证据零改动；未 push / tag / 发版；`git status` 仅含本项 prd/tech、`src/**`、`scripts/**`、`perf/profiles.json`、`docs/perf/**` 与测试。
- **ac-evidence-and-before-after**：交付含修复前后对照表（701/1321/1680/1708/1726 MiB 与 694/1382/1716 MiB 为「修复前」），逐轮 ready 峰值、+20 s 静置、app 总 RSS、hashedFiles、tab 数分列，并给证据绝对路径（可在仓库外）。
- **ac-honest-if-still-over**：仍越线须给越线轮次、越线量与剩余持有路径（引用链或份数），不得以 harness 绿灯、缩缓存或降阈值代替达标。
- **ac-docs-dual-column**：`docs/perf/large-directory-memory.md` §5 与 `perf:dir` 口径同时给出 ready 峰值列与 +20 s 静置列，明写历史盲区（旧「每轮释放会话」≠ 真实 UI 持有）与实测数字，且与证据一致。
- **ac-hash-accounting**：`counts.hashedFiles` / `counts.bytesToHash` = 该轮实际 `digestFiles` 累计；命中缓存零哈希的轮次记 0 并如实记录，不得沿用文档或旧版本数字。
- **ac-verdict-rule**：real 档 renderer ready 峰值 ≤ 1.5 GiB、app 总峰值 ≤ 2.5 GiB、`settle.renderer` ≤ 1300 MiB、`Δ(3) ≤ min(100 MiB, 30%×Δ(1))`（比例项不足 25 MiB 取 25 MiB），生效阈值写 `appliedThresholds`（含 `settleRendererBytes`）；`renderer-round-peak` 取逐轮窗口峰值；`upsert` 任一 hold `comparisons≠1`/`rowModels>2`/`tabs≠1`、`multisession`/`retained` 的 `comparisons`/`tabs` 与场景 tabs 不符、任一 `gc=false` 或 settle 缺失 → `verdict.ok=false` 并列出违规 id；多 tab 瞬时峰值只在 >2.25 GiB 护栏时按 `renderer-peak`/`renderer-round-peak` 判红，超 profile 目标只进 `notices[]`（`renderer-peak-over-target` / `renderer-round-peak-over-target`）。
- **ac-fail-on-violation**：带 `--fail-on-violation` 且违规时退出非零，证据仍完整写出。
- **ac-gate-wired**：`perf-gate` 在条件 profile `.munk/code-gates.perf.json` 登记（单一 argv `pnpm perf:gate`，无 `&&`/`|`/`;`），默认矩阵 `.munk/code-gates.json` 9 项不含它（清单形状归 `quality-gates`）；本机 `pnpm perf:gate` 退出 0 且单次 ≤3 分钟（含三次 harness）。
- **ac-gate-real-dataset**：数据集在系统临时目录、结束即清理，含 ≥5,000 文件、≥100 MB、≥5 层、同大小不同内容文件、指向文件/目录/悬空的符号链接与第三对根（`links/left`）；证据 `roots`/`pairs` 指向该临时目录，不含 `src/shared/fixtures` 或 `/samples`。
- **ac-perf-gate-three-modes**：最终提交上只跑 1 次 `pnpm perf:gate`，三份证据 `verdict.ok=true`：upsert `comparisons=1`/`tabs=1`；multisession `tabs=1/2/3` 且 `comparisons=1/2/3`、第 3 轮（`links/left` 别名）`hashedFiles=0`；retained `tabs=1/2/3/3/3` 且逐轮 `comparisons`=当轮 tabs（settle 3）、热轮 `hashedFiles=0`、两条 `settleStages` tabs=3 且抬升 ≤100 MiB、`reclaim.tabs=2` 且 renderer ≤1,100 MiB、`peaks.appTotal ≤ 2 GiB`、`rendererPid` 唯一；瞬峰仅 >2.25 GiB 判红。
- **ac-gate-red-on-violation**：给定超峰值 / settle / 结构计数（`comparisons`、`rowModels`、`tabs`、`gc=false`）的证据 JSON，门禁返回 `ok=false` 并非零退出，输出列出违规阈值 / 结构 id；有自动化单测。
- **ac-normal-start-unaffected**：不带 perf 参数与环境变量启动不采样、不写证据；`pnpm test`/`typecheck`/`lint` 全绿，对比结果与四态断言不变。
- **ac-doc-real-command**：`docs/perf/large-directory-memory.md` 含可复制命令（DawnChat ↔ ZenMind、`--rounds 3`、`--out docs/perf/evidence/...`）、产物路径、字段与口径、两档阈值与判定规则。
- **ac-real-evidence**：`docs/perf/evidence/` 下有一次真实两目录实跑证据，`roots` 为真实目录（非样本）、`rounds.length >= 2`、`samples` 非空、`commit.sha` 与生成时 HEAD 一致；未跑满 3 轮须记录轮次与原因，禁止填充或估算。
- **ac-baseline-v026**：诊断只认公开 v0.2.6 包——dmg sha256 = `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c`（113,412,984 B），`CFBundleShortVersionString=0.2.6`，`codesign --verify` 与 `spctl -a` 通过，记录 tag→commit `30967cd1e8fd521fa517588b2a7ac503305797e5`；任一不符即停。脚本硬编码的 `schema`/`app`/`appAsarUnchanged`/`expectedVersion='0.2.5'`/`EXPECTED` 不构成版本证据，须另写 `00-preflight-v026.json|txt` 记录真实 dmg sha256、app 版本、签名、`app.asar` sha256 与 commit。
- **ac-original-scripts**：运行前后 `repeat.mjs`/`multisession.mjs`/`lib.mjs` sha256 与基线表逐字一致；组① `repeat.mjs` 5 轮 `blockedAt=null`、`allRoundsReady=true`；组② `SKIP_A=1` 后 tab 1→2→3 且三步 `ok=true`。
- **ac-repeat-fields**：组① 1..5 轮每轮 JSON 含非空 `readyWallMs`/`readyPeakBytes`/`settle20sBytes`/`domNodes`/`heapUsedBytes`/`heapLimitBytes`/`appTotalRssBytes`/`hashedFiles`；`tabCount` 恒 1、5 轮 renderer PID 相同；四态固定 `same 38542 / added 701232 / deleted 6827 / modified 5878 / sourceFiles 51247 / targetFiles 745652 / diffs 713937`。
- **ac-ready-settle-separated**：组①、组② 的 ready 峰值与 +20 s 收敛值分列，各有 1536 / 1300 / 2560 MiB 阈值比较（按字节判）；不得只给单一内存数字。
- **ac-concurrent-3**：组② 3 步四态与固定四态一致（反向步仅 added/deleted 互换），tab 1/2/3 证明无 upsert 折叠；3 tab 建齐后 20 s 收敛值、DOM/heap/RSS/hashedFiles 非空入表；报告注明「②静置是 3 tab 建齐后 20 s，不是每步后 20 s」。
- **ac-heap-retainers**：仓库外 ≥3 份 `.heapsnapshot` 可访问（组① 2 份 + 组② 1 份，可选 settle）；每份含快照前 used、快照后 live 与「结果树/行模型/缓存条目 ready 时 held / not-held」结论及引用链或不可达证据；给 `cache.stats.estimatedBytes` 与渲染侧 retained size 对比并说明 128 MiB 估算是否只覆盖哈希条目；快照超 Node 字符串上限须流式解析，脚本与 sha256 留证。
- **ac-hot-wallclock**：报告把组①第 2–5 轮墙钟与 7.8 s 历史热跑基线对照（绝对值 + 百分比）并说明该轮 `hashedFiles`；hot 墙钟 ≥2× 基线或回到 ~20 s 须显式标注。
- **ac-history-contrast**：报告含 v0.2.5 的 1,742 MiB（upsert）/ 1,659 MiB（3 会话）历史对照，结论句只引用 v0.2.6 实测，并写明 v0.2.5 未重跑、仅作触发条件对照。
- **ac-report-single-deliverable**：`docs/perf/upsert-memory-diagnosis-2026-10-23.md` 是唯一新增仓库交付文件；必含 10 小节：① 机器负载与采样起止 ISO 时间（含时区）② 包 tag/commit/dmg sha256/版本/`app.asar` sha256/签名公证 ③ 组①逐轮表（含 +30 s 终值）④ 组②逐会话表（注明静置口径）⑤ 证据路径（JSON/日志/截图/堆快照/分析输出/脚本 sha256）⑥ 触发条件与门槛判定 ⑦ 影响面 ⑧ 根因候选（排序 + 证据 + 可证伪点，覆盖新旧对比并存 / 行模型与结果树是否被上轮持有 / 缓存上限只算哈希条目 / V8 未及时 GC）⑨ 修复代价（是否动缓存与淘汰、改动面、热跑是否退回 ~20 s）⑩ a/b/c 三选一推荐（各写范围/代价/风险/适用条件并明确一项）；缺任一小节不通过。
- **ac-c-branch-measured**：若 v0.2.6 峰值未越 1536 MiB（c 支），报告仍须先给完整两组逐轮数字与证据路径，再推荐 c 并写清关条条件；只写「未复现」不通过。
- **ac-readonly-scope**：采样与取证期间未改 `src/`、`package.json`、`.munk/code-gates.json`、`README.md`、`CHANGELOG.md`、`electron-builder.yml`、`docs/release*` 与发布文件；未打包/push/tag；`git status` 除本报告与既有 `.munk/changes/**` PRD 外无新增。
- **ac-sampling-isolation**：采样起止 ISO 时间、起止 loadavg 与 top CPU 写入报告；窗口内无 `pnpm`/`electron-vite`/`vitest`/`perf:gate`/`test:memory` 或其它 QA 进程，检测到即作废重采；组间退出 app 确认无残留，每组独立 `--user-data-dir` 与端口，同一 UD 不得跨组复用。
- **ac-group3-single-sampling**：最终提交上只执行 1 次真实 UI 口径采样（`perf:dir` 或 `perf:gate` 的 `retained`：同一实例保留 3 tab + 连做热 upsert），交付写明命令/档位/被测 commit 与仓库外证据绝对路径，禁止重跑试绿。
- **ac-group3-rounds-under-cap**：逐轮 renderer ready 峰值 ≤ 1,610,612,736 B（窗口含 ready 后 +5 s）、+20 s 静置 ≤ 1,363,148,800 B、app 总 ≤ 2,684,354,560 B；任一轮越线即失败（按 `ac-honest-if-still-over` 交付）。
- **ac-group3-tabs-and-hot**：逐轮 `tabs` 按场景恒定（group3 恒 3）、热轮 `hashedFiles=0`、`cache.misses`/`entries` 不随轮次增长、四态仍 same 38542 / added 701232 / deleted 6827 / modified 5878；renderer PID 不因轮次更换。
- **ac-group2-retained**：3 tab 建齐（1→2→3）且不释放旧 tab；第 3 步 ready 峰值 ≤ 1,610,612,736 B、app 总 ≤ 2,684,354,560 B；tabs 1/2/3，三步四态正确（反向步仅 added/deleted 互换）。
- **ac-harness-no-release**：`perf:gate`/`perf:dir` 的多会话与 `retained` 轮次在轮界不释放旧会话，源码与证据双证（group3 逐轮 tabs 恒 3、3 tab 场景 1→2→3）；旧「每轮删旧会话」路径删除或仅保留为红路径测试。
- **ac-upsert-no-regression**：单 tab upsert 5 轮保持既有能力（每轮 ready ≤ 1,610,612,736 B、静置 ≤ 1,363,148,800 B、第 2–5 轮 `hashedFiles=0`、热轮墙钟 ≤ 12,000 ms），不得退回 ~20 s。
- **ac-cache-and-thresholds-untouched**：`perf/profiles.json` 六项数值零改动；`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 134217728，淘汰与条目口径不变；`pnpm test:memory` 通过。
- **ac-no-product-semantics-change**：四态语义、目录对比/合并算法、`DirectoryComparison` 树结构、`.ocsnap.json` 快照线格式、tab 身份与顺序、下钻返回、同步 dry-run、进度与取消均保持现状。
- **ac-delivery-report**：交付写清被测 commit、单次采样命令与 group3 逐轮结果（ready 峰值/静置/app 总/hashedFiles/tabs），并与基线（2026.6/1920.9/2049.5/1896.8/2000.2 MiB；静置 1600.8/1920.5/1592.3/1890.4/1595.0 MiB；app max 2515.7 MiB）对照；注明打包 app 的 CDP L3 由负责人另排。

## 非目标

- 不做任何内存优化：缓存上限 / 淘汰、会话释放、行模型懒构建一律归 `memory-bounded`；除测量所需的最小统计钩子外**不得改变缓存与持有行为**。
- 不改符号链接口径（归 `symlink-policy`，内存断言不依赖链接计数语义）；不改取消行为与取消日志（归 `cancel-structured`，测量入口不触发取消、不覆盖取消门禁）。
- 不做版本号 / CHANGELOG / README 版本表与已知问题翻转、发布说明与资产校验（归 `release`）：不产 dmg、不签名、不公证、不 push、不打 tag、不发版。
- 不做 Web 渲染模式（`pnpm dev:web`）的内存测量、真机 / 浏览器点选验收、跨平台门禁；不扩到 Windows / Linux、>3 会话、>5 轮 soak 或其它目录对，不重做根因诊断。
- 不做 UI 变更（不加内存图表、设置项或新页面）；不引入性能测试框架、云压测、遥测上传或后台守护进程。
- 不得用内置 fixtures / samples 替代真实目录，不得手填、估算或从发布说明抄数字；不得为让门禁变绿而放宽阈值或缩小数据集。
- 不把 settle 值混入 `peaks`，不用单一内存数字替代 ready 峰值 / 静置双列；不用 harness 绿灯替代打包 app + CDP 的 L3 验收。
- 不改四态语义、对比 / 合并算法、`DirectoryComparison` 树结构、`.ocsnap.json` 快照线格式、扫描与 IPC 契约、页面布局与视觉；不新建第二套测量框架；不改 `perf/profiles.json` 六项数值与缓存上限 / 淘汰（热轮 `hashedFiles=0` 保持）。

## 实现约束

- **入口形态单一**：复用现有 `electron-vite` 主 / 渲染构建，`pnpm perf:dir` 启动真实 Electron 应用；轮次编排在渲染进程（与 UI 同一路径），采样与证据落盘在主进程，经受控通道同步；不另开第二套 harness。
- **harness 持有语义 = 真实 UI**：渲染真实 `SessionTabs` + `DirectoryView`，会话列表只用 `workbench/sessionStore.ts` 的共享纯函数；不得存在「轮次开始前释放上一轮会话」的钩子，也不得用「每轮换 session id」规避 upsert 语义。
- **强制 GC 可失败不可跳过**：`--expose-gc` 只在 perf 模式安装；`gc` 不可用即 `hold-unmeasured` 红，不得静默跳过结构断言。
- **默认零行为变化**：仅由 `--perf-harness` + `OPENCOMPARE_PERF=1` 同时激活，激活判断可被单测断言。
- **RSS 必须真实**：来自 `app.getAppMetrics()` 的 `workingSetSize` / `peakWorkingSetSize`（必要时 `process.getProcessMemoryInfo()`）；禁止 JS heap 估算或 mock；缺失或 0 视为该轮 invalid 并退出非零。
- **哈希计数落在真实调用上**：允许在 `@core/directory/compare` 增加可选统计回调 / 返回值，但不得改变对比结果、四态、`counts`、快照格式与既有测试语义。
- **阈值单点**：判定函数单点实现（`src/shared/perf/verdict.ts`），两档共用，上限集中在 `perf/profiles.json` 不在多处硬编码；新增阈值与结构断言走同一 `evaluatePerf`，`resolvePerfExitCode` / `formatPerfViolations` 不变。
- **证据原子写**：临时文件 + `rename`；失败也写出带 `error` 与 `verdict.ok=false` 的部分证据并退出非零；单次 < 5 MB，不提交生成的数据集。
- **周期采样与门禁有界**：采样默认 1s、可经参数覆盖（上限 2000 ms）并写入证据；`pnpm perf:gate` 单次 ≤ 3 分钟（本机 macOS GUI 会话），超时即红，且不依赖本机 DawnChat / ZenMind 是否存在。
- **数字可追溯**：文档与证据遵守 WorkSet §5.3，任何数字可追溯到命令与原始输出；真实两目录取证与门禁小数据集不得互相替代。
- **只读诊断的隔离**：先确认无 `pnpm` / `electron-vite` / `vitest` / `perf:gate` / `test:memory` 或其它 QA 在跑再起被测 app，窗口内不叠构建或门禁；每组单独 `--user-data-dir` 与端口，组间退出 app 确认无残留，同一 UD 不得跨组复用。
- **只读诊断的度量口径**：`/json/version` 可读后再挂 CDP，版本以包与 UA 双证；renderer / app 总 RSS 走 `ps -axo rss=`，heap 走 `Performance.getMetrics().JSHeapUsedSize`，堆上限优先 `performance.memory.jsHeapSizeLimit`，DOM 走 `Memory.getDOMCounters`，`hashedFiles` 走 `ComparisonCache.stats.misses` 逐轮增量或 digest stats；报告固定写口径、不得混用。
- **只读诊断的证据与报告**：证据放仓库外，报告引用绝对路径，JSON 保留原始逐轮与采样序列；阈值按字节比较（1610612736 / 1363148800 / 2684354560 B）；四态不符先停，不改脚本 `EXPECTED`、不裁剪轮次；报告中文，数字保留原始字节与 MiB 两列，结论句须能从同文证据块复算。

## 最近交付证明

- WI：`wi_intake_d3f44d9dbbaabcb1`（回退「非活动 tab 只留摘要 + 激活重建」；多 tab 恢复常驻完整树、`holds.comparisons = tabs`，harness / 门禁能力不变，`kind: fix/regression`）
- 日期：2026-10-23
- 结果：code_gates passed（默认矩阵 9 项 attempt 001 全绿，`perf-gate` 按条件 profile 不在默认矩阵；`needSelfTest=false`，UI 自测跳过）；交付前单跑一次 `pnpm perf:gate`，upsert / multisession / retained 三份证据均 PASS。
- 覆盖摘要：① `holds.comparisons` 期望与场景 tabs 同源（`expectedHoldTabs`：upsert 1、multisession 1/2/3、retained 1/2/3/3/3（settle 3）、reclaim 2），`verdict.ts` / `perf-gate.mjs` / `verdict.test.ts` 三处一致，3 tab 只持 1 份 comparison 判 `hold-comparisons` 红。② `retained` 关活动 tab 只 `closeSessions` + `releaseSessionTree` + 切相邻已驻留 tab，不再「摘要 → 热缓存重建」。③ 能力全保留：`settleStages` / `reclaim` / `rounds[].rendererPid` / 热轮 `hashedFiles=0` / 静置抬升 ≤100 MiB / 2.25 GiB 瞬峰护栏 / `notices[]` / `perf/profiles.json` 六项零改动。
- 证据：`perf-gate` 日志与三份证据 JSON（临时数据集 12,050 文件 / 122,880,000 B）——upsert `tabs=1`、holds `comparisons=1 / rowModels=2`；multisession `tabs=1/2/3`、第 3 轮别名 `hashedFiles=0`；retained `tabs=1/2/3/3/3`、hold 序列 tabs 与 comparisons 均 `1/2/3/3/3/3/3/2`、`settleStages` 抬升 2,048,000 B、`reclaim` `tabs=2`、rendererPid 唯一。
