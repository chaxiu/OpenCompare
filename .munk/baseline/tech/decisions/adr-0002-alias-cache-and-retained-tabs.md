# ADR-0002: 摘要缓存键按 realpath 归一 + 非活动 tab 只留摘要 + 多 tab 瞬峰降级为护栏

- 状态：accepted（真实规模单次采样待补，见「后果」）
- 日期：2026-10-23
- 来源：WI `wi_intake_aea03632d00a47e8`，change pack `.munk/changes/wi_intake_aea03632d00a47e8/{prd.md,tech.md}`

## 背景

3 tab 并发时 renderer ready 峰值 1,710–2,049 MiB（静置 1,592–1,920 MiB），app 总峰值 2,515.7 MiB 距 2.5 GiB 只有 44.3 MiB。已定根因：**3 份并发对比树同时驻留**（每份 ≈299 MiB reachable），不是重哈希——峰值时 `cache.misses` 恒 153,208、`hashedFiles=0`。另有第二个独立问题：perf 数据集第三对根是 `links/left` 符号链接，缓存键用扫描出的绝对路径，别名前缀导致 76,604 文件重哈希、第 3 步墙钟 ~22 s。

## 决策

1. **只有活动目录 tab 持完整树**：`WorkbenchSession.directory` 收紧为只活动 tab 有值；非活动 tab 退化为 `directorySummary{counts,fileCount,leftSkipped,rightSkipped,skipped}`。`retainActiveTree` / `commitSessionTree` 纯函数进 `workbench/sessionStore.ts`，`Workbench` 与 perf harness 共用；`activateIn` 在同一事件内切 activeId 与摘树，切回摘要 tab 用 `compareSides` 走热缓存重建（只扫描、不重新哈希；`AbortController` + 序号防竞态，失败可重试）。过滤 / 折叠 / 选中 / 滚动仍由 shell 按 session id 保持。
2. **摘要缓存键按 realpath 归一，但只归一键空间**：`PlatformPort.realpath(paths)`（只读、批量，失败逐项回退输入，`/samples` 原样，web 恒等）；`ComparisonCache.aliasRoot` / `canonicalPath` 以最长前缀把别名根下的键映射到真实根，`get` / `set` / `delete` / `evictUnderRoots` 统一过归一。会话 id / 标题 / 显示路径 / 证据 `roots` / `pairs` 仍用用户输入路径 → 别名仍是独立 tab（不折叠）。
3. **缓存上限与淘汰零改动**：200,000 条 / 128 MiB、LRU、`hold()`、`evictDownToCaps` 全不动；归一只影响是否命中。
4. **多 tab 瞬峰降级为回归护栏**：`TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104`（2.25 GiB）；超过 profile 目标只写 `verdict.notices[]`，仍照常报出数字。`settle` / `settleStages` / `appTotal` / `reclaim`（关 1 tab 后 renderer ≤ 1,100 MiB）/ 热轮 `hashedFiles=0` / 静置抬升 ≤100 MiB / `renderer-restart` / `hold` 结构仍是硬线；`upsert` 的 profile 峰值硬线不变。`perf/profiles.json` 六项数值未改。
5. **harness 增 `retained`（group3）**：建 3 tab 并保留（1→2→3）→ `--hot-rounds`（默认 2）活动 tab 热 upsert → 关活动 tab 并热缓存重建落点。证据加法字段 `settleStages` / `reclaim` / `rounds[].rendererPid`。`perf:gate` 单次跑 upsert / multisession / retained 三份证据。

## 备选与取舍

- **保留 3 棵完整树、只压瞬峰**：已由证据证明不可行（3 × 299 MiB 结构性驻留），只能靠降阈值自欺。否。
- **激活重建时重新哈希（不保留树也不留缓存）**：切 tab 要付 8–10 s 扫描 + 哈希，且热跑退化。否。
- **只做别名归一、不做摘要 tab（change pack `tech.md` §0 的裁决）**：本轮实际实现了两者；`tech.md` 该段已与代码不符，后续 WI 以本 ADR 与代码为准。
- **给 `DirectoryEntry` 加 `canonicalPath` 代替新 channel**：面更大、每目录都要付。否。
- **别名归一顺带折叠 tab**：会改变 tab 身份/顺序与证据 roots，违反 PRD。否。

## 后果

- 3 tab 场景不再并持 3 棵完整树；别名第 3 步 `hashedFiles=0`（门禁断言）。切 tab / 下钻返回 / 关 tab 落点会多一次完整扫描（真实规模约 8–10 s），切 tab 即时性下降——这是本决策的主要代价；若产品不接受，需紧凑快照结构或保留树，属独立项。
- 归一只改缓存键：`hashes` 存规范路径，`estimatedBytes` 按规范键长计费（字符级差异）；`evictUnderRoots` 先归一，避免关别名 tab 误清真路径缓存。
- `PlatformPort` 新增一个只读 channel `platform:realpath`（preload 白名单、五处实现同步）。
- 真实规模（DawnChat↔ZenMind）3 tab + 热 upsert 的**单次采样本轮未执行**：现有证据只有 `gate` 档合成数据集（峰值 ~200 MB）。PRD `ac-group3-single-sampling` / `ac-group3-rounds-under-cap` / `ac-delivery-report` 与基线数字对照仍待补，且 `retained` 默认 `hotRounds=2`（PRD 要 5 轮热 upsert，需显式 `--hot-rounds 5`）；打包 app 的 CDP L3 由负责人另排。
