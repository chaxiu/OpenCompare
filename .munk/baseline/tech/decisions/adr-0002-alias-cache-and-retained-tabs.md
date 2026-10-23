# ADR-0002: 摘要缓存键按 realpath 归一 + 多 tab 常驻完整树 + 多 tab 瞬峰降级为护栏

- 状态：accepted（2026-10-23 裁决：撤掉「非活动 tab 只留摘要 + 激活重建」，保留别名归一与 harness / 门禁能力；真实规模单次采样待补，见「后果」）
- 日期：2026-10-23（同日修订）
- 来源：WI `wi_intake_aea03632d00a47e8`（原始决策）+ WI `wi_intake_d3f44d9dbbaabcb1`（A 半回退）

## 背景

3 tab 并发时 renderer ready 峰值 1,710–2,049 MiB（静置 1,592–1,920 MiB），app 总峰值 2,515.7 MiB 距 2.5 GiB 只有 44.3 MiB。已定根因：**3 份并发对比树同时驻留**（每份 ≈299 MiB reachable），不是重哈希——峰值时 `cache.misses` 恒 153,208、`hashedFiles=0`。另有第二个独立问题：perf 数据集第三对根是 `links/left` 符号链接，缓存键用扫描出的绝对路径，别名前缀导致 76,604 文件重哈希、第 3 步墙钟 ~22 s。

## 决策

1. **每个打开的目录 tab 都持完整树**：`WorkbenchSession.directory` 在每一个目录会话上都有值，提交新 tab / 重新比较只 upsert 并释放被替换会话，**不摘掉**其它 tab 的树；`commitSessionTree` 纯函数留在 `workbench/sessionStore.ts`，`Workbench` 与 perf harness 共用。切 tab 只改 `activeId`（0 扫描 / 0 digest / 0 realpath），四态与过滤 / 折叠 / 选中 / 滚动立即完整。2026-10-23 公司裁决撤掉了原先的「非活动 tab 退化为 `directorySummary` + 激活时用 `compareSides` 热缓存重建」：真实规模一次激活重建要付完整目录扫描（≈8–10 s），违反切 tab 即时性；`retainActiveTree` / `summarizeComparison` / `detachDirectoryComparison` / 重建入口与失败态全部删除。
2. **摘要缓存键按 realpath 归一，但只归一键空间**：`PlatformPort.realpath(paths)`（只读、批量，失败逐项回退输入，`/samples` 原样，web 恒等）；`ComparisonCache.aliasRoot` / `canonicalPath` 以最长前缀把别名根下的键映射到真实根，`get` / `set` / `delete` / `evictUnderRoots` 统一过归一。会话 id / 标题 / 显示路径 / 证据 `roots` / `pairs` 仍用用户输入路径 → 别名仍是独立 tab（不折叠）。
3. **缓存上限与淘汰零改动**：200,000 条 / 128 MiB、LRU、`hold()`、`evictDownToCaps` 全不动；归一只影响是否命中。
4. **多 tab 瞬峰降级为回归护栏**：`TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104`（2.25 GiB）；超过 profile 目标只写 `verdict.notices[]`，仍照常报出数字。`settle` / `settleStages` / `appTotal` / `reclaim`（关 1 tab 后 renderer ≤ 1,100 MiB）/ 热轮 `hashedFiles=0` / 静置抬升 ≤100 MiB / `renderer-restart` / `hold` 结构仍是硬线；`upsert` 的 profile 峰值硬线不变。`perf/profiles.json` 六项数值未改。
5. **harness 增 `retained`（group3）**：建 3 tab 并保留（1→2→3）→ `--hot-rounds`（默认 2）活动 tab 热 upsert → 关活动 tab 并落到相邻已驻留 tab（不再重建）。证据加法字段 `settleStages` / `reclaim` / `rounds[].rendererPid`。`perf:gate` 单次跑 upsert / multisession / retained 三份证据；`holds.comparisons` 的期望值与场景 tabs 同源（`expectedHoldTabs`），upsert 1、multisession 1/2/3、retained 1/2/3/3/3（settle 阶段 3）、reclaim 2。

## 备选与取舍

- ~~**保留 3 棵完整树、只压瞬峰**~~：曾被认为不可行（3 × 299 MiB 结构性驻留）。2026-10-23 公司裁决改为接受该驻留：切 tab 即时性优先，瞬峰由 2.25 GiB 护栏、静置 / appTotal / reclaim 硬线守。**已采纳（回退后形态）**。
- **激活重建时重新哈希（不保留树也不留缓存）**：切 tab 要付 8–10 s 扫描 + 哈希，且热跑退化。否。
- **激活重建（保留摘要缓存、只扫描）**：已交付并运行一周，实测真实规模仍需 ≈8–10 s 完整扫描，切 tab 即时性不达标。2026-10-23 裁决回退。否。
- **只做别名归一、不做摘要 tab（change pack `tech.md` §0 的裁决）**：与回退后的最终形态一致；摘要 tab 只作为 2026-10-23 之前的历史实现存在。
- **给 `DirectoryEntry` 加 `canonicalPath` 代替新 channel**：面更大、每目录都要付。否。
- **别名归一顺带折叠 tab**：会改变 tab 身份/顺序与证据 roots，违反 PRD。否。

## 后果

- 3 tab 场景重新并持 3 棵完整树：`holds.comparisons = tabs` 是门禁硬线（3 tab 只剩 1 份 comparison 判 `hold-comparisons` 红）。别名第 3 步 `hashedFiles=0`（门禁断言）。
- 切 tab / 下钻返回 / 关 tab 落点不再扫描或重建（这是回退的目的）；代价是 renderer 常驻 3 棵结果树，内存边界改由 `perf:gate` 的瞬峰护栏（>2.25 GiB 红）、`settle` / `settleStages`（≤100 MiB 抬升）/ `appTotal`（≤2 GiB 门禁档）/ `reclaim`（≤1,100 MiB）守，而不是靠摘树。
- 归一只改缓存键：`hashes` 存规范路径，`estimatedBytes` 按规范键长计费（字符级差异）；`evictUnderRoots` 先归一，避免关别名 tab 误清真路径缓存。
- `PlatformPort` 新增一个只读 channel `platform:realpath`（preload 白名单、五处实现同步）。
- 真实规模（DawnChat↔ZenMind）3 tab + 热 upsert 的**单次采样本轮未执行**：现有证据只有 `gate` 档合成数据集（峰值 ~200 MB）。PRD `ac-group3-single-sampling` / `ac-group3-rounds-under-cap` / `ac-delivery-report` 与基线数字对照仍待补，且 `retained` 默认 `hotRounds=2`（PRD 要 5 轮热 upsert，需显式 `--hot-rounds 5`）；打包 app 的 CDP L3 由负责人另排。
