# 回退「非活动 tab 只留摘要 + 激活重建」，恢复 3 tab 常驻完整对比（v0.2.7 收口）

## 范围

按公司裁决（2026-10-23，aea03632 交付后）撤掉 `wi_intake_aea03632d00a47e8` 的 A 半：真实规模下一次「激活重建」要付一次完整目录扫描（≈8–10 s），违反「不牺牲切 tab 即时性」。本项把非活动 tab 的摘要化与激活重建路径回退干净，**只有**别名根 realpath 缓存键归一与 harness / 门禁能力保留。

1. **回退渲染侧摘要与重建**（`src/renderer/src/workbench/`）
   - `sessionStore.ts` 删除 `retainActiveTree` 与非活动摘树语义；`commitSessionTree` 只做 upsert / 原地替换 + 被替换会话的缓存释放，**不再**摘掉其它 tab 的树。
   - `directoryCompare.ts` 删除 `summarizeComparison` / `detachDirectoryComparison` 与 `directorySummary` 写入；`attachDirectoryComparison` 保留 liveness 登记与 comparison 修订号（视图 key 仍需要）。`session.ts` 移除 `directorySummary` 字段与「非活动只留摘要」注释。
   - `Workbench.tsx` 的 `activateIn` 退化为「只切 `activeId` + 提交会话列表」：不再摘树、不再调 `compareSides` 重建、删除 `restoreSequence` / `restoreOperation` / `restoreFailures` / `retryRestore` 与 `renderSceneBody` 里的「正在从摘要缓存重建结果树…」状态；目录 tab 缺 `session.directory` 不再是合法状态。
   - 保留上一项的真实 UI 释放：`directoryViewKey`（会话 id + comparison 修订号）、提交阶段换 key、`releaseSessionTree` 的 `canonicalPath` 归一与 `replaceId` 原地替换路径。
2. **回退 harness 的摘要假设**（`src/renderer/src/perf/runRounds.ts`）
   - `retained` 的关 tab 落点不再「摘要 → 热缓存重建」，只 `closeSessions` + `releaseSessionTree` + 切到落点 tab；其余 retained / hotRounds / settleStages / reclaim 采样与 committed 列表语义全部保留。
3. **门禁结构断言改成回退后的真实持有形态**（`src/shared/perf/verdict.ts`、`scripts/perf-gate.mjs`）
   - `holds.comparisons` 从「所有模式恒 1（仅活动）」改回「= 该场景的 tab 数」（`expectedHoldTabs`）：upsert 1；multisession 1/2/3；retained 1/2/3/3/3（settle 阶段 3）、reclaim 2。`rowModels ≤ 2`、`gc=true`、`tabs` 按场景仍是硬线。
   - 修正对应的红路径单测：3 tab 只持 1 份 comparison 必须红（即旧 A 行为不再能通过门禁）。
4. **保留不动的能力**：`PlatformPort.realpath` + `ComparisonCache.aliasRoot/canonicalPath` + `rootAliases` 两处登记；`perf:gate` / `perf:dir` 的 retained(group3) / settleStages / reclaim / rendererPid；`TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104`；`settle` / `settleStages` 抬升 ≤100 MiB / `appTotal` / `reclaim` / 热轮 `hashedFiles=0` / `profiles.json` 六项硬线；`perf-gate` 仍在条件 profile（`.munk/code-gates.perf.json`），不进默认矩阵。
5. **基线文档纠偏**（`.munk/baseline/`）：`tech/overview.md` 的会话生命周期段、`tech/decisions/adr-0002-*.md`、`domains/memory-bounded/product.md`、`domains/perf-memory/product.md` 及两份受影响 QA 用例，改成「非活动 tab 保留完整树、holds.comparisons = tabs」的真实形态，并记录本次裁决与代价。历史 change pack（`wi_intake_aea03632d00a47e8/**`）不改写。

## 验收

- ac-switch-no-scan: 同时打开 3 个目录 tab 后，点击任一非活动 tab 的整个切换提交内 `platform.listDirectories` 调用 0 次、`platform.digestFiles` 调用 0 次（含 `realpath`/digest 累计数不变）；自动化用例直接断言这三个计数。
- ac-switch-immediate: 切回非活动 tab 的同一提交内即渲染该 tab 的完整行（行数 > 0 且与首次进入的可见行标题逐项相等），全程不出现「正在从摘要缓存重建结果树…」、加载 spinner、进度条或恢复失败态。
- ac-switch-four-state: 切回后该 tab 的四态计数（same/added/removed/modified、fileCount、左右 skipped）与首次进入逐项相等。
- ac-switch-state-preserved: 在 tab A 设置过滤文本、折叠若干路径、选中一行并分别滚动左右列表后切到 tab B 再切回，A 的过滤值、折叠集合、选中路径、左右滚动位置全部保持（与切走前逐项相等）。
- ac-all-tabs-resident: 建齐 3 个目录 tab 后，每个目录会话都持有完整 `DirectoryComparison`（单测断言 3 个 session 的 `directory` 均定义；提交第 3 个 tab 后前两个 session 仍引用**同一个** comparison 对象，不被替换/摘除），且代码中不存在 summary-only 会话形态与按需重建入口。
- ac-alias-root-zero-hash: 别名根与真实根复用同一缓存键：第二次（别名）比较 `digestFiles` 调用 0 次、`counts.hashedFiles=0`、`cache.stats.entries` 不翻倍、tab 数 1→2 不折叠、第二个 tab 的 subtitle 仍显示用户输入的别名路径。
- ac-perf-gate-three-modes: 在最终提交上只跑 1 次 `pnpm perf:gate`，upsert / multisession / retained 三份证据 `verdict.ok=true`：upsert hold `comparisons=1`/`tabs=1`；multisession `tabs=1/2/3` 且 `comparisons=1/2/3`、第 3 轮（`links/left` 别名）`hashedFiles=0`；retained `tabs=1/2/3/3/3` 且逐轮 `comparisons` = 当轮 tabs（settle 阶段 3）、热轮 `hashedFiles=0`、两条 `settleStages` tabs=3 且抬升 ≤100 MiB、`reclaim.tabs=2` 且 renderer ≤1,100 MiB、`peaks.appTotal ≤ 2 GiB`、`rendererPid` 唯一；瞬峰仅在 >2.25 GiB 时判红。
- ac-gate-red-when-regressed: 门禁不是恒绿——单测/红路径覆盖「3 tab 只持 1 份 comparison（摘要化回归）」「轮界删 tab 使 tabs 不按场景」「别名轮 `hashedFiles>0`」三种回归，断言 `verdict.ok=false` 或对应 assert 抛错。
- ac-default-gates-green: 默认矩阵 9 项全绿：install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate。
- ac-cache-untouched: `perf/profiles.json` 六项数值零改动；`DEFAULT_COMPARISON_CACHE_MAX_ENTRIES=200_000` / `DEFAULT_COMPARISON_CACHE_MAX_BYTES=134_217_728`、LRU、`hold()`、`evictDownToCaps` 与按根释放口径不变；`pnpm test:memory` 通过。
- ac-no-product-semantics-change: 四态语义、目录对比/合并算法、`DirectoryComparison` 结构、`.ocsnap.json` 线格式、tab 身份与顺序、下钻返回、同步 dry-run、进度与取消行为保持现状；切 tab 只是重新挂载视图，行模型重挂数与现状一致。
- ac-release-files-untouched: `package.json#version`、CHANGELOG、README、`docs/release-notes/**`、release workflow 与任何发布文件零改动；未打包、未打 tag、未发版、未 push。
- ac-delivery-report: 交付说明写明被测 commit、切 tab 路径的自动化证据（用例名 + 断言 0 扫描/0 digest、四态与状态保持）、`perf:gate` 三份证据路径与 retained/group3 逐轮关键数字（tabs / comparisons / roundPeak / settleStages / reclaim / hashedFiles）、以及「确认没有其它交互退化（下钻返回、关 tab 落点、同对重比、别名 tab 不折叠）」；注明打包 app 的短 L3 由负责人另排、本项不跑 CDP。

## 非目标

- 不回退、也不改动：`PlatformPort.realpath`、`comparisonCache.aliasRoot/canonicalPath`、`workbench/rootAliases` 登记、`snapshotOps.compareSides` / `directoryOps.compareRoots` 的别名登记调用。
- 不回退 harness 能力：`retained` / group3 / `--hot-rounds` / `settleStages` / `reclaim` / `rounds[].rendererPid` / 2.25 GiB 瞬峰护栏 / `notices[]` / 热轮 `hashedFiles=0` / 静置抬升 / `settle` / `appTotal` / `reclaim` 硬线、以及 `.munk/code-gates.perf.json` 分层（长跑不进默认矩阵）。
- 不引入任何新的懒物化 / 摘要 / 紧凑快照结构 / 后台预热 / 「最近一个非活动 tab 热缓冲」机制；回退后 3 个 tab 全部常驻，切 tab 只切 activeId。
- 不动 128 MiB 缓存上限与淘汰，不牺牲热跑缓存，不改缓存条目口径与 `estimatedBytes` 算法。
- 不改四态语义、目录对比/合并算法、`DirectoryComparison` 结构与行模型构造、`.ocsnap.json` 线格式、扫描 / IPC / 取消契约。
- 不重写 harness 口径（仍只 upsert / multisession / retained 三模式，仍不释放轮界会话），不新增证据字段，不改 `perf/profiles.json`。
- 不改 `package.json#version` / CHANGELOG / README / `docs/release-notes/**` / release workflow / 任何发布文件；不打包、不打 tag、不发版；不跑打包 app 的 CDP L3。
- 不改写历史 change pack（`wi_intake_aea03632d00a47e8/**`）与历史交付证明。
- 不顺手优化视觉、布局、工具栏或无关模块；不扩展 Windows / Linux、>3 tab、>5 轮 soak。

## 实现约束

- 口径以代码 + `ADR-0002` 为准：`wi_intake_aea03632d00a47e8` 的 `tech.md` §0 写着「A 半砍掉」，与已交付实现相反，**不得**据它判断现状或据此少回退。
- 允许原地回退到 `d59431e^` 的 `commitUpsert` 语义，但必须保住 `releaseSessionTree` 的 `canonicalPath` 归一、`replaceId` 原地替换与 `directoryViewKey` 的 comparison 修订号；不得把别名归一或视图 key 释放一起回退。
- `holds.comparisons` 的期望值必须与场景 tabs 同源（复用 `expectedHoldTabs`），`verdict.ts`、`perf-gate.mjs`、各自单测三处一致；不许出现「只改其中一处」的恒绿。
- 切 tab 路径上不得留任何异步比较/重建：不新建 `AbortController`、不保留 `restoreFailures` 与恢复失败 UI；删除后产生的未使用 import / state 必须清干净（lint 绿）。
- `perf:gate` 在最终提交只执行一次，失败如实交付，禁止重跑试绿；默认矩阵仍为 9 项，不把长跑塞回默认矩阵。
- 交付的自动化必须是确定性断言（调用计数、对象引用、counts 逐项相等、DOM 行标题），不要写成「看起来正常」的人工观察。
