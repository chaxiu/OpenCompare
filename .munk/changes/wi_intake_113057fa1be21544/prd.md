# 修复真实 UI 路径历史对比未释放导致的 ready 内存峰值越线（upsert 5 轮 / 3 会话并发）

## 背景（已定，禁止重做归因）

接 v0.2.6 只读诊断（`docs/perf/upsert-memory-diagnosis-2026-10-23.md`，wi_intake_139d8079c8ffdd70）的 **a 支**。
诊断实测：同会话 upsert 5 轮 renderer ready 峰值 701 / 1321 / 1680 / 1708 / 1726 MiB（第 3–5 轮越 1536），
3 会话 694 / 1382 / 1716 MiB；5 轮 +20 s 静置仍持 3 个 `DirectoryComparison` + 4 个 `DirectoryRowModel`（≈938 MiB live）。
已定三条持有路径：

1. 旧 `DirectoryComparison` 经 fiber ref / `onChange` 闭包 → `Context(internal:previous)` → `context:comparison` 在 ready 时仍可达；
2. 旧 `DirectoryRowModel` 经 `@tanstack/react-virtual` 的 `getScrollElement` 闭包 → `context:rows` 可达；
3. `upsertSession` / `replaceSession` 不触发 `perf:dir` harness 里 `runRounds` 那种等价释放，harness 因此是盲区。

## 范围

### A. 源码修复：真实 UI 路径在 upsert / 多会话下释放历史对比

- 让 `upsertSession` / `replaceSession` 提交新 comparison 后，旧 `DirectoryComparison`（结果树）与旧 `DirectoryRowModel`
  不再经 fiber props / ref 回调 / `onChange` 闭包 / 虚拟列表闭包可达；释放必须由提交路径显式完成，不依赖 GC 时机。
- 不得静默改变可见行为：tab 身份与顺序、过滤 / 折叠 / 选中 / 滚动位置恢复、下钻与返回、进度与取消、四态统计、
  快照导入导出、同步 Dry-run 全部保持现状。
- 允许在渲染侧 `src/renderer/**` 局部调整（会话持有结构、视图 key/生命周期、行模型构建时机、虚拟列表容器引用），
  不新增产品概念、不改页面布局与视觉。

### B. harness 与门禁：把真实 UI 的持有路径纳入，去掉「每轮先释放会话」

- `perf` harness 必须能测「同会话 upsert 轮次」与「3 会话并发轮次」，且**不得**再用「每轮开始前释放上一轮会话」
  的写法掩盖真实 UI 的持有路径；harness 的持有语义必须与 `Workbench.upsertSession` / 多 tab 会话数组一致。
- `pnpm perf:gate`（`.munk/code-gates.json` 的 `perf-gate`）必须覆盖上述两种模式，并对「settle 后仅剩 1 个 comparison /
  ≤2 个 row model」「峰值不超过档位」「无逐轮增长」给出可失败的断言；门禁不得只在旧行为下也恒绿。
- 阈值只允许为「覆盖真实持有」而新增/收紧，不得为变绿放宽既有 `perf/profiles.json` 上限（`real` renderer 1.5 GiB /
  app 2.5 GiB，`gate` 1 GiB / 2 GiB 保持不放松）。
- `pnpm test:memory` 的缓存规模/跨轮不增长断言保持通过（缓存相关代码不改）。

### C. 文档与实测证据

- `docs/perf/large-directory-memory.md` §5 与 `perf:dir` 口径：明写旧 harness「每轮释放会话」与真实 UI 持有路径的差异
  （当前是盲区，已改）、新增两种模式的口径、并把 **ready 峰值** 与 **+20 s 静置收敛值** 分列。
- 用**打包 app + CDP**跑原样不改的 `repeat.mjs`（同会话 upsert 5 轮）与 `multisession.mjs`（3 会话并发，`SKIP_A=1`），
  给出修复后逐轮数字与修复前（诊断报告）对照；证据可落仓库外，交付中给绝对路径。

## 验收

- ac-real-ui-upsert-peak: 打包 app + 原样 `repeat.mjs` 跑同会话 upsert 5 轮，证据中第 1–5 轮 renderer ready 峰值逐轮 ≤
  1,610,612,736 B；不得出现第 3 轮及以后 >1536 MiB 的轮次。
- ac-real-ui-upsert-settle: 同一 5 轮的每轮 +20 s 静置 renderer ≤1,363,148,800 B，末轮再静置 30 s 后仍 ≤1,363,148,800 B。
- ac-real-ui-multisession: 打包 app + 原样 `multisession.mjs`（`SKIP_A=1`）3 会话，3 tab 建齐时 ready 峰值 ≤
  1,610,612,736 B，统一 +20 s 静置 ≤1,363,148,800 B。
- ac-real-ui-app-total: 上述两组任一轮 app 总 RSS ≤2,684,354,560 B。
- ac-real-ui-no-regression: `repeat.mjs` 5 轮逐轮四态仍为 `same 38542 / added 701232 / deleted 6827 / modified 5878`、
  `tabCount` 恒 1、renderer PID 恒定、`allRoundsReady=true`、`blockedAt=null`；`multisession.mjs` tab 数依次 1 / 2 / 3，
  反向那步仅 added 与 deleted 互换，三步 `ok=true`。
- ac-structural-single-hold: 同实例 5 轮 upsert 后，perf 模式下的只读存活登记（或等价可断言信号）在强制 GC 后报告
  `DirectoryComparison` 存活数 = 1、`DirectoryRowModel` 存活数 ≤ 2；3 会话模式存活数 = 3（每会话 1 份，允许 ≤2 份仅属
  当前激活 tab 的 row model）。断言以自动化测试或 harness 证据字段落地，不只看数字。
- ac-harness-hold-modes: harness 支持「同会话 upsert」与「3 会话并发」两种模式；证据 JSON 记录持有模式与逐轮 tab 数
  （upsert 模式 tab 数恒 1、并发模式 1→2→3），且运行期不再出现「轮次开始前释放上一轮会话」的路径（源码与证据双证）。
- ac-gate-red-on-old-behavior: 新增门禁断言在「旧行为」（人为保留旧会话 / 不清引用）下必须失败；交付给出该红路径的
  可复现命令或单测用例，证明门禁不是恒绿。
- ac-gate-covers-upsert-and-multisession: `pnpm perf:gate` 单次运行即覆盖 upsert 轮次与 3 会话并发轮次，并在证据中
  各给出峰值、静置与存活份数断言结果；退出码在违例时非零。
- ac-docs-dual-column: `docs/perf/large-directory-memory.md` §5 与 perf:dir 口径同时出现 ready 峰值列与 +20 s 静置列，
  且明写历史盲区（旧「每轮释放会话」不等于真实 UI 持有）与本次实测数字，数字与证据文件一致。
- ac-hot-wallclock-no-regression: 修复后热轮（同会话第 2–5 轮）每轮墙钟 ≤12,000 ms，且该轮 `hashedFiles=0`；不得回到 ~20 s。
- ac-cache-untouched: `DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍为 `134217728`、淘汰逻辑与条目口径不变，`pnpm test:memory`
  通过；热轮 `hashedFiles=0` 证明未因修复触发重哈希。
- ac-quality-gates: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm perf:gate`、`pnpm test:memory` 全部通过。
- ac-release-files-untouched: `package.json#version`、`CHANGELOG.md`、README 版本表、release workflow / release notes /
  发布证据文件零改动；未 push、未打 tag、未发版；`git status` 仅含本项 prd/tech、`src/**`、`scripts/**`、
  `perf/profiles.json`、`docs/perf/**` 与测试文件。
- ac-evidence-and-before-after: 交付含修复前后对照表（诊断报告的 701/1321/1680/1708/1726 MiB 与 694/1382/1716 MiB
  作为“修复前”），逐轮 ready 峰值、+20 s 静置、app 总 RSS、hashedFiles、tab 数分列，并给出仓库外证据绝对路径。
- ac-honest-if-still-over: 若修复后真实 UI 路径仍越线，交付必须如实给出越线轮次、越线量与剩余持有路径（引用链或
  份数），不得以 harness 绿灯、缩缓存或降低验收阈值代替达标。

## 非目标

- 不动 128 MiB 摘要缓存上限，不加淘汰（cache 仅 30.5–59.6 MiB、热轮 `hashedFiles=0`；动缓存有热跑退回 21.6–22.5 s 的风险）。
- 不改四态语义、目录对比 / 合并算法、`DirectoryComparison` 树结构、快照线格式（`.ocsnap.json`）、扫描与 IPC 契约。
- 不改页面布局、视觉与交互流程（无新界面、无新概念、不重排工具栏）。
- 不改版本号 / CHANGELOG / README 版本表 / release workflow / 发布证据；不打包成发布物、不签名公证、不产 dmg、
  不 push、不打 tag、不发版。
- 不测量 Windows / Linux，不测 >3 会话、>5 轮 soak、更小或更大目录对；不重新做根因诊断。
- 不为达标而放宽 `perf/profiles.json` 任何既有上限，或把真实 UI 越线改写成 harness 独占口径。

## 实现约束

- **根因与修复方向已定**（见背景 1/2/3），不再重新归因；改动面按诊断 §9：渲染侧会话替换路径释放旧 comparison，
  `DirectoryView` 的 ref 回调与 `@tanstack/react-virtual` 闭包在切换 comparison 时重置，旧行模型随旧 comparison 失效。
- **测量对象**：本地从本分支构建的打包 app（`electron-builder --dir` 输出到仓库外目录，版本仍 0.2.6、未签名未公证、
  不产 dmg / 不进 `release/`、不上传）。反范围里的「不打包」指不产发布物/不分发；为满足 ac-1 必须用打包产物而非 dev 服务。
  release 文件零改动。
- **驱动脚本**：原样只读执行 `/Users/zhutao/Library/Application Support/Munk AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_48a3ffc2b2852ebb/evidence/cdp-v025/` 下
  `repeat.mjs`（sha256 `f9459e10…f60a6`）、`multisession.mjs`（`db04361…aa0df`）、`lib.mjs`（`731ca6d…852f`）；运行前后
  sha256 必须不变。原脚本内硬编码的版本/常量不构成本次版本证据。
- **数据口径**：目录对 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind` 只读；实例使用全新
  `--user-data-dir`；采样窗口内不得有构建/测试/门禁并发。阈值按字节比较（1536 / 1300 / 2560 MiB 对应
  1,610,612,736 / 1,363,148,800 / 2,684,354,560 B）；峰值与静置分列，禁止只给单一内存数字。
- **证据**：原始 JSON / 日志 / 截图 / 快照可落仓库外 artifacts 目录（交付给绝对路径）；仓库内只提交源码、harness/门禁、
  单测、`docs/perf/large-directory-memory.md` 更新（如需归档证据 JSON 则按现有 `docs/perf/evidence/` 命名约定另行新增，
  不覆盖历史文件）。
- 复用现有 harness（`src/main/perf/harness.ts`、`src/renderer/src/perf/`、`src/shared/perf/`）与 `perf/profiles.json` 模式，
  不新建并行的第二套测量框架；新增开关需与现有 CLI 解析/证据字段风格一致并有单测。
