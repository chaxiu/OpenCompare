# 大目录多轮内存测量入口与自动上限门

## 范围

交付一条**可复现的内存测量入口**与一道**自动上限门**，只做测量与门禁，不改内存行为。

1. **测量入口**：`pnpm perf:dir --left <A> --right <B> --rounds N --out <file>`，启动真实 Electron 应用（真实主进程 + 真实 renderer），由渲染进程按现有 UI 的目录对比路径（`scanDirectory` → `compareDirectories` → `platform.digestFiles` → `createDirectorySession`）在同一窗口/同一进程内连续跑 N 轮完整目录对比；主进程负责采样与证据落盘。
2. **证据文件（JSON）**：包含被测 commit 与 dirty、左右真实根、扫描文件数/目录数、实际哈希文件数、待哈希字节数、每轮起止与墙钟、总墙钟、机器环境（OS/CPU/核数/物理内存/Node/Electron）、采样序列（启动后基线、每轮开始前、每轮结束后、轮次边界、运行中周期采样）、renderer/main/app 总 RSS 峰值、轮次增量与阈值判定。
3. **阈值判定**：真实数据集档（真实两目录）为 renderer 峰值 ≤ 1.5 GB、app 总峰值 ≤ 2.5 GB、第 3 轮相对第 2 轮 renderer 增量 ≤ min(100 MB, 30% × 首轮增量，比例项下限保护 25 MB)；门禁档用同一判定函数、不同档位上限。超限时 `--fail-on-violation` 以非零退出（证据仍写出）。
4. **code_gates 接入**：新增 `perf-gate`（`pnpm perf:gate`）：自动在系统临时目录生成**真实落盘**数据集（≥5,000 文件、≥100 MB 内容、≥5 层嵌套、含同大小不同内容文件与指向文件/目录/悬空的符号链接），跑 3 轮真实哈希，按门禁档断言峰值与增量，超限即红；不读取 `src/shared/fixtures/` 或 `/samples`。
5. **文档与真实取证**：`docs/perf/large-directory-memory.md` 写明 DawnChat↔ZenMind 的完整实跑命令、产物路径、证据字段与口径、阈值与判定规则；并在 `docs/perf/evidence/` 留下一次**真实两目录**（非内置样本）实跑生成的证据文件（≥2 轮）。

## 验收

- ac-single-command-evidence: 给定两个存在可读的真实目录与 `--rounds N --out <file>`，一条命令跑完 N 轮并以退出码 0 写出证据 JSON；证据文件可被 schema 校验读取，`rounds.length === N`。
- ac-cli-validation: 缺少 `--left`/`--right`/`--out`、未知参数、`--rounds` 为 0/负数/非数字、根不存在或不可读时以非零退出，stderr 指明具体违规参数或根路径，且不遗留标记为成功的证据文件。
- ac-evidence-schema: 证据含必填字段且类型正确：`commit{sha,dirty}`、`roots{left,right}`、`counts{files,dirs,hashedFiles,bytesToHash}`、`rounds[{index,startedAt,endedAt,wallMs,sessionId}]`、`totalWallMs`、`env{os,cpuModel,cpuCount,totalMemBytes,node,electron}`、`samples[{label,phase,round,at,rss{renderer,main,appTotal}}]`、`peaks{renderer,main,appTotal}`、`roundDeltas`、`verdict{ok,violations[],appliedThresholds}`。
- ac-env-probes-real: `env` 各值与运行期真实探针一致（`os.release/arch`、`os.cpus()` 的型号与数量、`os.totalmem()`、`process.versions.node`、`process.versions.electron`），不是常量或手填。
- ac-sample-points: 每轮至少产出 `phase=pre-round` 与 `phase=post-round` 各 1 条采样，轮次边界各 1 条（label 可区分），运行期间按固定间隔（≤2s，间隔写入证据）周期采样；某轮 `wallMs` 对应周期采样条数 ≥ floor(wallMs/interval) − 1。
- ac-app-total-rss: `appTotal` = 主进程 + 所有 renderer/utility 进程 `workingSetSize` 之和（KB→byte），`renderer` = `type` 为 Tab 的进程中 RSS 最大者，`main` = 主进程；聚合函数对给定 metrics 数组有单测覆盖，口径字符串写入证据 `memoryDefinition`。
- ac-same-process-rounds: 所有轮次在同一应用实例内完成，证据记录的 `appPid` 唯一且各轮 renderer pid 相同。
- ac-fresh-session-per-round: 每轮都构造并替换一个新的目录会话（`sessionId` 各轮互不相同且符合 `directory:<left> ↔ <right>` 形式），不得在同一会话对象上原地复用。
- ac-hash-accounting: `counts.hashedFiles` 与 `counts.bytesToHash` 等于该轮实际 `digestFiles` 调用累计的文件数与字节数；命中缓存而零哈希的轮次记为 0 并在证据中如实记录（不得沿用文档或旧版本数字）。
- ac-verdict-rule: 判定函数按档位档位计算：真实档 renderer 峰值 ≤ 1.5 GB、app 总峰值 ≤ 2.5 GB、`Δ(3) ≤ min(100 MB, 30%×Δ(1))` 且比例项不足 25 MB 时取 25 MB（实际生效阈值写入 `verdict.appliedThresholds`）；任一违反 → `verdict.ok=false` 且 `violations` 列出违规 id。
- ac-fail-on-violation: 带 `--fail-on-violation` 且证据违规时退出码非零，同时证据文件仍然完整写出（门禁可据此变红）。
- ac-gate-wired: `.munk/code-gates.json` 含 `perf-gate`（command 为单一 argv `pnpm perf:gate`，无 `&&`/`|`）；`pnpm perf:gate` 在本机通过（退出码 0）且单次运行 ≤ 3 分钟。
- ac-gate-real-dataset: `pnpm perf:gate` 生成的数据集位于系统临时目录、运行结束即清理，包含 ≥5,000 文件、≥100 MB 内容、≥5 层嵌套、同大小不同内容文件与指向文件/目录/悬空的符号链接；其证据的 `roots` 指向该临时真实目录，不含 `src/shared/fixtures` 或 `/samples` 路径。
- ac-gate-red-on-violation: 给定一份超出峰值或增量阈值的证据 JSON，判定/门禁路径返回 `ok=false` 并以非零退出，输出中列出被违反的阈值 id；该用例有自动化单测覆盖。
- ac-normal-start-unaffected: 不带 perf 参数与环境变量启动时不做采样、不写任何证据文件；现有 `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿，现有对比结果与四态断言不变。
- ac-doc-real-command: `docs/perf/large-directory-memory.md` 含可直接复制的命令（`/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`、`--rounds 3`、`--out docs/perf/evidence/...`）、产物路径、证据字段与口径说明、两档阈值与判定规则。
- ac-real-evidence: 仓库 `docs/perf/evidence/` 下存在一次真实两目录实跑生成的证据文件，其 `roots` 为真实目录（非样本）、`rounds.length >= 2`、`samples` 非空、`commit.sha` 与生成时 HEAD 一致；未跑满 3 轮时文档如实记录已完成轮次与原因，禁止填充或估算数字。

## 非目标

- 不做任何内存优化：缓存上限/淘汰、会话释放、行模型懒构建一律归 `memory-bounded`。本项不得改变缓存与持有行为（除测量所需的最小统计钩子）。
- 不改符号链接口径（归 `symlink-policy`）：门禁数据集虽含符号链接，但内存断言不得依赖链接计数语义，链接口径变更后仍在门禁档阈值内通过。
- 不改取消行为与取消日志（归 `cancel-structured`）：测量入口不触发取消，不覆盖取消门禁。
- 不做 v0.2.5 版本号、CHANGELOG、README 已知问题翻转、发布说明与资产校验（归 `release-025`）。
- 不做 Web 渲染模式（`pnpm dev:web`）的内存测量；不做真机/浏览器点选验收；不做跨平台门禁。
- 不做 UI 变更：不加内存图表、设置项或新页面；证据是文件不是界面。
- 不引入性能测试框架、云压测、遥测上传或后台守护进程。
- 不得用内置 fixtures / samples 替代真实目录；不得手填、估算或从 v0.2.4 发布说明抄数字。
- 不为让门禁变绿而放宽阈值或缩小数据集；阈值调整必须能在证据里解释。
- 不改快照线格式、对比算法与四态定义；不改历史发布证据。

## 实现约束

- 入口形态（已定，勿另开第二套）：复用现有 `electron-vite` 主/渲染构建，`pnpm perf:dir` 启动真实 Electron 应用；**轮次编排在渲染进程**（走 UI 同一条对比与会话构造路径），**采样与证据落盘在主进程**，两者经一个仅测量模式启用的受控通道同步轮次边界。
- harness 仅由显式 CLI 参数 + 环境变量激活；缺省路径零行为变化，激活判断可被单测断言。
- RSS 必须来自主进程真实进程指标（`app.getAppMetrics()` 的 `workingSetSize` / `peakWorkingSetSize`，必要时 `process.getProcessMemoryInfo()`）；禁止用渲染层 JS heap 估算或 mock 数值。采样值缺失或为 0 视为该轮 invalid，退出非零。
- `counts.hashedFiles` / `bytesToHash` 必须落在真实哈希调用上：允许在 `@core/directory/compare` 增加可选统计回调/返回值，但不得改变对比结果、四态、`counts`、快照格式与既有测试语义。
- 阈值判定函数单点实现，真实档与门禁档共用；档位上限集中在一个配置文件（例如 `perf/profiles.json`），不在多处硬编码。
- 证据原子写（临时文件 + rename）；运行失败也要写出带 `error` 与 `verdict.ok=false` 的部分证据，且退出非零。
- 周期采样间隔默认 1s，可经参数覆盖并写入证据；证据文件体积受控（单次 < 5 MB），不提交生成的数据集。
- 门禁运行时间有界：`pnpm perf:gate` 单次 ≤ 3 分钟（本机 macOS GUI 会话），超时即红；不依赖本机 DawnChat/ZenMind 是否存在（真实两目录只用于文档命令与人工取证）。
- 文档与证据遵守 WorkSet §5.3：任何数字可追溯到命令与原始输出；真实两目录取证与门禁小数据集是两件事，不得互相替代。
