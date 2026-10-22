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

## 最近交付证明

- WI：`wi_ws_44175d3fab91cf88`（大目录多轮内存测量入口与自动上限门，`kind: perf/feature`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；门禁清单新增 `perf-gate`，Host 记录 install / lint / typecheck / build / build-web / test / perf-gate 全部通过）。
- 覆盖摘要：① **测量入口**——`package.json` 增 `perf:dir` / `perf:gate`；`scripts/perf-dir.mjs` 构建后启动真实 Electron 并透传 `--perf-harness` + `OPENCOMPARE_PERF=1`；`src/shared/perf/{args,types,recorder,rss,verdict}.ts` 承载参数校验（必填 / 未知参数 / 非正整数 rounds / 根不可读一律非零退出）、`PerfBridge` 事件契约、采样录制、RSS 聚合与判定；`src/main/perf/{harness,evidenceFile}.ts` 做主进程采样 + 原子写证据（`app.getAppMetrics()` 真实指标，`memoryDefinition` 写入证据）；`src/renderer/src/perf/{PerfRunner,runRounds}.tsx|ts` 在同进程内逐轮 `scanDirectory → compareDirectories → digestFiles → createDirectorySession` 并每轮换新 `sessionId`；preload / channels / platform 类型新增仅测量模式启用的受控通道，普通启动零行为变化（`isPerfHarnessActive` 单测兜住）。② **统计钩子**——`@core/directory/compare.ts` 增可选 digest 统计回调/返回值供 `snapshotOps` 累计真实 `hashedFiles` / `bytesToHash`，对比结果、四态、缓存与快照格式不变。③ **门禁**——`scripts/perf-gate.mjs` 在临时目录生成每侧 6,000 文件 / ≥100 MiB / 五层嵌套 / 同大小不同内容 / 文件·目录·悬空三类符号链接的真实数据集，跑 gate 档 3 轮并在结束后清理，`RUN_TIMEOUT_MS = 150_000`；`.munk/code-gates.json` 增单 argv `perf-gate`（`pnpm perf:gate`）。④ **文档与真实取证**——新增 `docs/perf/large-directory-memory.md`（命令、产物、字段与口径、两档阈值表、归档实跑原文）与 `docs/perf/evidence/dawnchat-zenmind-20261022.json`。
- 证据：真实实跑（DawnChat ↔ ZenMind，commit `abd32e5`、`dirty=true`、`--rounds 2 --interval 1000`）：对比树 1,338,294 文件 / 185,460 目录；第 1 轮实际哈希 77,950 文件 / 11,454,904,514 B，第 2 轮缓存命中 0 / 0；墙钟 25,310 ms + 12,648 ms = 37,961 ms；renderer 峰值 1,960,394,752 B、main 420,462,592 B、app 总 2,505,654,272 B；46 条采样（startup 1 / pre-round 2 / post-round 2 / boundary 4 / periodic 37）；`verdict.ok=false`、`violations=["renderer-peak"]`（超真实档 1.5 GiB）、app 总未超 2.5 GiB。仅跑 2 轮的原因（第 2 轮 post-round 已越过 renderer 峰值上限、`Δ3` 需第 3 轮）已在文档如实记录，数字未估算。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；本轮验收按 AC 逐条落档为 `qa/perf-memory-harness-and-gate.md`。
- 后续注意：① **本域当前的活体结论是红（`renderer-peak`）**——这是测量落地的现状基线而非本域回归，后续 `memory-bounded` 必须用同一 `pnpm perf:dir --rounds 3` 命令复跑并把 `verdict.ok` 翻绿；不要为了变绿改 `perf/profiles.json` 或缩小数据集。② `Δ3`（第 3 轮相对第 2 轮增长）规则在真实档尚无 3 轮证据，`appliedRoundDeltaBytes` 取到 min(100 MiB, max(30%×Δ1, 25 MiB)) 的比例分支要等 memory-bounded 之后补跑才能验证。③ `perf-gate` 已进入 code_gates，此后**每轮 code_gates 都要真实启动 Electron 并做 6,000×2 文件哈希**（含 `electron-vite build`），单轮耗时会明显上升；无 GUI 会话或 `perf-gate` 超时会被判红，需要在 CI/无人值守环境另做取舍。④ 门禁数据集含符号链接，但内存断言不依赖链接计数——`symlink-policy` 改变计数语义后仍应在 gate 档内通过。
