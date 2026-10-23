# v0.2.6 公开包 upsert / 3 会话并发 ready 内存峰值只读诊断（a/b/c 收口）

## 范围

### 基线（只认公开 v0.2.6 包）

- 包：`https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64.dmg`
- dmg sha256 必须等于 `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c`（113,412,984 B）。
- tag `v0.2.6` → commit `30967cd1e8fd521fa517588b2a7ac503305797e5`；安装后 `CFBundleShortVersionString = 0.2.6`。
- v0.2.5 的 `1,742 MiB`（upsert ready 峰值）与 `1,659 MiB`（3 会话 ready）**只作历史对照和触发条件**，结论一律以 v0.2.6 实测为准；本项不重跑 v0.2.5。

### A. 复用上一场公开包复验的 CDP 文件（原文件不改）

源目录（只读）：

`/Users/zhutao/Library/Application Support/Munk AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_48a3ffc2b2852ebb/evidence/cdp-v025/`

| 文件 | 用途 | 运行前 sha256 必须等于 |
| --- | --- | --- |
| `repeat.mjs` | 组①同会话 upsert 5 轮 | `f9459e101fb365ea5d75492371bb027cf51de525deb73ecdfc66124b9d0f60a6` |
| `multisession.mjs` | 组②3 会话并发（`SKIP_A=1`） | `db043614c7a9278e525bc6d541c4fe4e60bb2a3c780a2ec44a874170ea9aa0df` |
| `lib.mjs` | 两者共用 | `731ca6d9dfe237ce402b22dbba1d87a437a44d96c17eb5b9ed9c211d6576852f` |

- 直接以只读方式执行源目录里的原文件（`node <源目录>/repeat.mjs`），**不得修改、不得另存后改内容**；`EV` / `PORT` / `UD` / `OUT` / `RUN_LOG` 用环境变量指向本 run 的新证据目录。
- 原脚本硬编码的 `schema`、`app`、`appAsarUnchanged`、`expectedVersion/uaVersionOk='0.2.5'`、`EXPECTED` 四态常量不构成本次版本证据；需另写 `00-preflight-v026.json|txt` 记录真实 dmg sha256、app 版本、codesign/spctl、`app.asar` sha256 与 commit，并在报告中声明这些脚本常量不用于版本判定。
- 原脚本不采集的逐轮字段（DOM 节点数、堆 used/limit、hashedFiles）由**同一实例上的只读侧采样器**补齐：优先走 browser WebSocket + `Target.attachToTarget(flatten:true)`，不占用原脚本的 page WS；1 s 轮询 `Memory.getDOMCounters`、`performance.memory.usedJSHeapSize/jsHeapSizeLimit`（不可得时退回 `Performance.getMetrics` 的 `JSHeapUsedSize/JSHeapTotalSize` 并注明口径）、以及 renderer 内的 `ComparisonCache.stats`（`misses` 逐轮增量即该轮 `hashedFiles`；`cache` 经 React fiber 定位并用 `maxEntries=200000`、`maxBytes=134217728` 校验身份，不可达则记原因并改用堆快照条目增量）。侧采样器不改动任何原脚本，代码与 sha256 一并留证。
- 若第二条 CDP 连接被拒或对墙钟造成 >10% 干扰：另建 `repeat-instrumented.mjs`（复制原流程 + 只读采集，仓库外），报告中并列 canonical（原文件 run）与 instrumented 两套数字；墙钟/内存判定以 canonical 为准，逐轮 DOM/hashedFiles 以 instrumented 为准并写明。

### B. 组①：同会话 upsert 反复对比 5 轮

- 同一 app 实例、同一 `--user-data-dir`、同一 tab（`directorySessionId` 由两端根路径生成，重复即 upsert）。
- 目录对固定为真实只读样本 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`；每轮四态必须仍为 `same 38542 / added 701232 / deleted 6827 / modified 5878 / sourceFiles 51247 / targetFiles 745652 / diffs 713937`。
- 每轮：submit → ready（原脚本 readiness 规则）→ 记录 ready 墙钟、ready 瞬时值与该轮 submit→ready 窗口内 renderer RSS 峰值 → 静置 20 s 再记录收敛值；第 5 轮后再静置 30 s 记终值。
- ready 峰值与静置收敛值必须**分列**，不得只留一个合并值；同时给出与 renderer 1536 MiB / 静置 1300 MiB / app 总 2560 MiB 三个阈值的比较（按字节判，不用四舍五入后的 MiB）。

### C. 组②：3 会话并发各一轮

- 干净启动，`SKIP_A=1` 运行原 `multisession.mjs`：3 个同规模、根路径不同的会话 tab（1→2→3），不关任何会话。
- 每个会话建立后记录 ready 墙钟、ready 峰值（含该步 submit→ready 窗口峰值）、tab 数、四态；3 个 tab 全部建立后再静置 20 s 记录收敛值（原脚本口径，报告中必须注明“②的静置是 3 tab 建齐后 20 s，不是每步后 20 s”）。
- 必须证明没有 upsert 折叠：tab 数依次为 1 / 2 / 3，反向对比只交换新增/删除计数（6827 / 701232），其余四态一致。

### D. 仓库外堆快照与引用链

- 每组至少 1 份，实际要求组① 2 份（round 1 ready、round 2 ready）+ 组② 1 份（3 tab ready），另可选 settle 快照；文件存仓库外，报告给绝对路径。
- 每次快照同时记录：快照前 `JSHeapUsedSize`（含未回收垃圾）与快照后的可达 live size，用差值区分“仍被持有”与“已不可达但未 GC”。快照文件可能超过 Node 字符串上限，分析必须用流式解析，分析脚本与 sha256 留证。
- 引用链必须回答：ready 时上一轮 `DirectoryComparison.root`（结果树）、`DirectoryView` 的 `DirectoryRowModel`（左侧/右侧）、`ComparisonCache.hashes` 条目是否仍可达；可达则给出从 GC root / React fiber / 模块作用域到该对象的 retainer path；不可达则给“未持有”证据。
- 量化“缓存上限是否漏算渲染侧”：`cache.stats` 的 entries / estimatedBytes 与快照中结果树 + 行模型 + 缓存条目的 retained size 对比，明确 128 MiB 估算上限是否只覆盖哈希条目、渲染侧对象是否在任何上限之外。

### E. 唯一仓库交付物

`docs/perf/upsert-memory-diagnosis-2026-10-23.md`，必须包含：

1. 机器负载（起止 loadavg、top CPU、核数/内存）与采样起止 ISO 时间（含时区）。
2. 被测包：tag / commit / dmg sha256 / app 版本 / `app.asar` sha256 / 签名与公证结论。
3. 组①逐轮表：轮次、ready 墙钟、ready 峰值、+20 s 收敛、DOM 节点数、heap used / limit、app 总 RSS、hashedFiles、tab 数、renderer PID；末尾 30 s 终值。
4. 组②逐会话表：同上字段（静置口径注明为 3 tab 后 20 s）。
5. 证据路径：两组 JSON、日志、截图、堆快照、分析输出、脚本 sha256。
6. 稳定触发条件（可复现命令 + 前置条件）与门槛比较判定。
7. 影响面：哪些用户路径/数据规模/平台，是否崩溃或仅瞬时越限。
8. 根因候选（排序，每条给支持证据与可证伪点；至少覆盖“upsert 期间新旧对比并存”“行模型/结果树是否被上一轮持有”“缓存上限只算哈希条目”“V8 未及时 GC 导致 RSS 峰值”）。
9. 修复代价：是否必须动缓存与淘汰、改动面（renderer 会话释放 / 行模型按需 / 缓存核算 / harness）、热跑会不会退回 ~20 s（用 hashedFiles 与实测墙钟说明）。
10. a/b/c 三选一推荐：a=修渲染侧持有/释放并把 upsert + 3 会话纳入门禁；b=只补门禁与文档、接受 ready 峰值；c=v0.2.6 不复现、保留证据关条。每项写范围、代价、风险、适用条件，并明确推荐一项。

## 验收

- ac-baseline-v026: 下载包 sha256 逐字等于 `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c`，`CFBundleShortVersionString=0.2.6`，`codesign --verify` 与 `spctl -a` 通过，报告记录 commit `30967cd1e8fd521fa517588b2a7ac503305797e5`；任一不符即停止，不进入采样。
- ac-original-scripts: 运行前后 `repeat.mjs`/`multisession.mjs`/`lib.mjs` 的 sha256 与上表逐字一致（原文件未被改写）；组① `repeat.mjs` 5 轮 `blockedAt=null`、`allRoundsReady=true`；组② `SKIP_A=1` 后 tab 数 1→2→3 且三步 `ok=true`。
- ac-repeat-fields: 组① 1..5 轮每轮 JSON 均含非空 `readyWallMs`、`readyPeakBytes`（该轮 submit→ready 窗口峰值）、`settle20sBytes`、`domNodes`、`heapUsedBytes`、`heapLimitBytes`、`appTotalRssBytes`、`hashedFiles`；`tabCount` 恒为 1，5 轮 renderer PID 相同。
- ac-ready-settle-separated: 报告中组①、组②都把 ready 峰值与 +20 s 收敛值放在不同列，并各有 1536 / 1300 / 2560 MiB 阈值比较；不允许出现只给单一内存数字的轮次。
- ac-concurrent-3: 组② 3 步四态分别与固定四态一致（反向那步只允许 added/deleted 互换），3 tab 后 20 s 收敛值、DOM/heap/RSS/hashedFiles 非空且入表。
- ac-heap-retainers: 仓库外存在 ≥3 份 `.heapsnapshot` 且路径可访问；每份都有快照前 used、快照后 live、以及“结果树/行模型/缓存条目在 ready 时 held / not-held”的结论与引用链或不可达证据；给出 cache estimatedBytes 与渲染侧 retained size 对比并明确是否漏算渲染侧。
- ac-hot-wallclock: 报告把组①第 2–5 轮墙钟与 7.8 s 历史热跑基线对照（绝对值/百分比），并说明该轮 `hashedFiles`；若 hot 墙钟 ≥2× 基线或回到 ~20 s，必须在结论中显式标注。
- ac-history-contrast: 报告含 v0.2.5 的 1,742 / 1,659 MiB 历史对照，但结论句只引用 v0.2.6 实测，并写明 v0.2.5 未重跑。
- ac-report-single-deliverable: `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 是唯一新增仓库交付文件，E 节 10 个必填小节齐全；缺任一小节不通过。
- ac-c-branch-measured: 若 v0.2.6 峰值未越 1536 MiB（c 支），报告仍必须先给完整两组逐轮数字与证据路径，再推荐 c 并写清关条条件；只写“未复现”视为不通过。
- ac-readonly-scope: 采样与取证期间未改 `src/`、`package.json`、`.munk/code-gates.json`、`README.md`、`CHANGELOG.md`、`electron-builder.yml`、`docs/release*`、发布文件；未打包、未 push、未打 tag；`git status` 除本报告与既有 `.munk/changes/**` PRD 外无其它新增。
- ac-sampling-isolation: 采样起止 ISO 时间、起止 loadavg 与 top CPU 写入报告；采样窗口内没有构建 / 测试 / 门禁 / 其它 QA 进程；若检测到并发构建或门禁，该轮作废重采，不得混用。

## 非目标

- 不做任何修复：不改缓存、淘汰、行模型、会话释放、harness；a/b/c 只给推荐，不实施。
- 不改 `.munk/code-gates.json`、不加 upsert/3 会话门禁（那是推荐项 a/b 的后续工作）。
- 不重跑 v0.2.5，不参考、不合并已作废的 v0.2.5 诊断项；v0.2.5 数字只按上表作历史对照。
- 不扩到 Windows / Linux 实测，不做 >3 会话、>5 轮 soak、小目录或其它目录对的横向测试。
- 不重新打包、不签名、不公证、不 push、不打 tag、不发版；不写第二份仓库文档。
- 不动被测目录内容（DawnChat / ZenMind 只读），不改内置样本，不跑其它 QA / code_gates 与采样并行。

## 实现约束

- **采样独占**：先确认无 `pnpm` / `electron-vite` / `vitest` / `perf:gate` / `test:memory` / 其它 QA 在跑，再起被测 app；采样窗口内不叠任何构建或门禁。若要跑 code_gates，必须等采样结束并完全退出被测 app 之后；或先跑门禁、待机器回到空闲 ≥10 分钟再采样，两者绝不重叠。
- **隔离**：每组单独 `--user-data-dir` 与端口，组间退出 app 并用 `pgrep -fl OpenCompare` 确认无残留；同一 UD 不得跨组复用。
- **启动**：`<app>/Contents/MacOS/OpenCompare --remote-debugging-port=<port> --user-data-dir=<ud>`，等 `http://127.0.0.1:<port>/json/version` 可读后再挂 CDP；版本以 app 包与 UA 双证。
- **证据位置**：统一放仓库外 `~/Library/Application Support/Munk AI/munk-auto/artifacts/opencompare-v026-diagnosis/{evidence,heap,logs,scripts}/`；报告引用绝对路径；JSON 保留原始逐轮与采样序列，不只留摘要。
- **度量口径**：renderer/app RSS 走原脚本 `ps -axo rss=` 口径；heap 走 `Performance.getMetrics().JSHeapUsedSize`；堆上限优先 `performance.memory.jsHeapSizeLimit`；DOM 走 `Memory.getDOMCounters`；hashedFiles 走 `ComparisonCache.stats.misses` 逐轮增量（或 digest stats），报告中固定写口径，不得混用。
- **判定**：阈值按字节比较（renderer 1610612736 B、静置 1363148800 B、app 总 2684354560 B）；四态不符先停，不修改脚本 `EXPECTED` 常量、不裁剪轮次、不挑样本。
- **报告语言**：中文，数字保留原始字节与 MiB 两列；结论句必须能从同文证据块直接复算。
