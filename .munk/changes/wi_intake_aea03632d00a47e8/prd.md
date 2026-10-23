# 修复 3 会话并发 ready 峰值越线与别名根重复哈希

## 背景（已定，禁止重做归因）

被测基线：main `f7e31a9`，version 0.2.6。权威实测证据：
`products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_d3f128641f774df4/evidence/mem2/confirm-summary.json`（group2b + group3，同一实例、原样 `repeat.mjs` / `multisession.mjs`）。

- **group3（同一实例保留 3 个 tab，连做 5 轮热 upsert）**：ready 峰值 2026.6 / 1920.9 / 2049.5 / 1896.8 / 2000.2 MiB（全越 1536）；+20 s 静置 1600.8 / 1920.5 / 1592.3 / 1890.4 / 1595.0 MiB（全越 1300）；app 总峰值最大 2515.7 MiB（距 2.5 GiB 仅 44.3 MiB）；5 轮 `tabCount=3`、`hashedFiles=0`、`cache.misses` 恒 153,208、四态一致。
- **group2b**：3 tab 建齐第 3 步 ready 1710.1 MiB（越 1536）；第 1 步冷启动 703.6、第 2 步 1041.0 MiB。
- **根因口径（已定）**：越线来自 **3 份并发对比树同时驻留**（每份 ≈299 MiB reachable；峰值时 `misses` 恒 153,208、`hashedFiles=0`、无新增哈希），不是重哈希。别名根 `/tmp/oc-ms/dawn→DawnChat`、`/tmp/oc-ms/zen→ZenMind` 的首轮重复哈希 76,604 文件与 22 s 墙钟仍应消除，但它不是达标主因。
- 禁止用「每轮先删旧会话」的 harness 数字代替（如 1327.6 MiB 那套口径系统性低估多 tab 驻留）。
- 上一项针对 upsert 历史对比释放的修复有效（单 tab 5 轮 ready ≤1536、热轮 `hashedFiles=0`），不得回归。

## 范围

### A. renderer 持有：非活动 tab 只留轻量摘要，激活再建

- 同一工作台存在多个目录会话时，只有**活动 tab** 持有完整 `DirectoryComparison` 与行模型；非活动 tab 只保留可展示/可恢复摘要（session id、标题、两侧 roots、四态 counts/stats），不持有完整结果树与行模型。
- 切回非活动 tab 时按需重建该会话结果树与行模型：必须命中既有摘要缓存（不再读取/哈希文件），并恢复过滤、折叠、选中、滚动位置与四态统计。
- 新比较提交期间，非活动 tab 的历史结果树必须已不可达，峰值窗口内不出现「旧 2 份 + 新 1 份」并存。

### B. 摘要缓存键按 realpath 归一

- 摘要缓存键以真实路径归一并复用：同一真实目录经别名根再次比较时 `hashedFiles=0`，缓存条目数不因别名翻倍；别名根第 3 步墙钟不再回到 ~22 s。
- 归一化只作用于缓存键/命中；会话身份、显示路径与证据 roots 仍用用户输入路径，别名根不得被折叠成已有 tab（tab 仍 1→2→3）。

### C. harness / 门禁：保留 tab，纳入 group3

- `perf:gate` 与 `perf:dir` 的多会话轮次必须改成「**不释放、保留 tab**」：轮界不得删除上一轮/旧 tab 会话；轮次之间 `tabs` 只按场景增长（group2b 1→2→3）或保持（group3 恒 3）。
- 新增并默认覆盖 group3 场景：同一实例先建 3 个 tab，再连做 5 轮热 upsert（`hashedFiles=0`、`tabs=3`），逐轮给出 ready 峰值、+20 s 静置与 app 总 RSS。
- 结构契约同步：真实 UI 口径下非活动 tab 只有摘要，post-GC holds 为 `comparisons===1`（仅活动）、`rowModels ≤ 2`、`tabs` 按场景；新增「非活动只有摘要」「别名轮 0 哈希」「保留 tab」的可失败断言，旧行为下必须红。
- `pnpm test` 补 3-tab 并发（非活动不物化、激活重建）与别名根复用（不重复哈希）的自动化回归。

## 验收

验收口径（公司裁决）：**打包 app + 原样 `repeat.mjs` / `multisession.mjs` 的 CDP 口径，必须包含 group3 场景**；每轮 renderer ready ≤1536 MiB、+20 s 静置 ≤1300 MiB、app 总 ≤2.5 GiB，任一档越线即不达标。该打包 CDP L3 由负责人另排；本项**不打包、不跑 CDP**，而是用同一「保留 tab、真实 UI」口径在最终提交上只采样 1 次自证并交付逐轮结果。

- ac-group3-single-sampling: 在最终提交上只执行 **1 次**真实 UI 口径采样，场景为同一实例保留 3 tab + 连做 5 轮热 upsert；交付写明命令/档位/被测 commit 与仓库外证据绝对路径，禁止重跑采样试绿。
- ac-group3-rounds-under-cap: 上述 5 轮逐轮满足 renderer ready 峰值 ≤1,610,612,736 B（峰值窗口含 ready 后 +5 s）、+20 s 静置 ≤1,363,148,800 B、app 总 RSS ≤2,684,354,560 B；任一轮越线即失败。
- ac-group3-tabs-and-hot: 5 轮 `tabs=3` 恒定、`hashedFiles=0`、`cache.misses`/`entries` 不随轮次增长、四态仍为 same 38542 / added 701232 / deleted 6827 / modified 5878；renderer PID 不因轮次更换。
- ac-group2-retained: 3 tab 建齐（1→2→3）且不释放旧 tab；第 3 步 ready 峰值 ≤1,610,612,736 B、app 总 ≤2,684,354,560 B；tabs 依次 1/2/3，三步四态正确（反向步仅 added/deleted 互换）。
- ac-harness-no-release: `perf:gate` / `perf:dir` 的多会话与 group3 轮次在轮界不释放旧会话；源码与证据双证（5 轮 tabs 恒 3、3 tab 场景 1→2→3）。旧「每轮删旧会话」路径删除或仅保留为红路径测试。
- ac-gate-red-on-old-behavior: 新增断言在旧行为下必须失败（非活动 tab 仍持完整 comparison / 轮界删会话 / 别名轮 `hashedFiles>0`）；交付给出对应红路径用例。
- ac-alias-root-reuse: 别名根复用真实路径摘要：group2b 第 3 步 `hashedFiles=0`，同一真实目录不产生第二套缓存条目，第 3 步墙钟不再 ~22 s。
- ac-hold-structure: 真实 UI 口径下非活动会话不持有 `DirectoryComparison` / row model，只保留摘要；post-GC holds 为 `gc=true`、`comparisons===1`（仅活动）、`rowModels ≤ 2`、`tabs` 按场景。
- ac-activate-rebuild: 切回非活动 tab 会重建结果树，重建期间摘要计算 0 增量（不重新哈希），四态 counts 与重建前一致，过滤/折叠/选中/滚动位置恢复；有自动化测试。
- ac-upsert-no-regression: 单 tab upsert 5 轮保持既有能力（每轮 ready ≤1,610,612,736 B、静置 ≤1,363,148,800 B、第 2–5 轮 `hashedFiles=0`、热轮墙钟 ≤12,000 ms），不得退回 ~20 s。
- ac-cache-and-thresholds-untouched: `perf/profiles.json` 六项数值零改动；`DEFAULT_COMPARISON_CACHE_MAX_BYTES` 仍 134217728，淘汰与条目口径不变；`pnpm test:memory` 通过。
- ac-no-product-semantics-change: 四态语义、目录对比/合并算法、`DirectoryComparison` 树结构、`.ocsnap.json` 快照线格式、tab 身份与顺序、下钻返回、同步 dry-run、进度与取消均保持现状。
- ac-quality-gates: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test`、`pnpm test:memory` 通过；上述唯一一次采样通过（若红则如实交付红，不重跑）。
- ac-delivery-report: 交付说明写清被测 commit、单次采样命令与 group3 逐轮结果（ready 峰值 / +20 s 静置 / app 总 / hashedFiles / tabs），并与基线（2026.6/1920.9/2049.5/1896.8/2000.2 MiB；静置 1600.8/1920.5/1592.3/1890.4/1595.0 MiB；app max 2515.7 MiB）对照；注明打包 app 的 CDP L3 由负责人另排。
- ac-release-files-untouched: `package.json#version`、CHANGELOG、README 版本表、release workflow / release notes / 发布证据零改动；未 push、未打 tag、未发版。

## 非目标

- **不放宽任何阈值**：`perf/profiles.json` 的 renderer ready / app total / settle / round-delta 数值全部保持；不得靠重跑采样试绿。
- **不动摘要缓存上限与淘汰**：不改 128 MiB 上限、条目口径与 eviction 逻辑；不牺牲热跑（不得因缓存改动回到 ~20 s）。
- 不改四态语义、目录对比/合并算法、结果树结构、快照线格式（`.ocsnap.json`）、扫描与 IPC 契约。
- 不做与 3 tab 并发无关的重构；不新增页面、不重排布局、不引入新产品概念。
- 本项不打包、不签名、不产 dmg、不跑打包 app 的 CDP L3（由负责人另排），不上传、不发版。
- 不测 Windows / Linux、>3 会话、>5 轮 soak、更小或更大目录对；不重新做根因诊断。
- 不通过折叠别名会话、减少并发 tab 数、在轮界删会话、只测 harness 不测真实持有路径来达成指标。

## 实现约束

- 根因口径已定（见背景）：不得重新归因；上一项 upsert 历史对比释放修复与单 tab 热轮 `hashedFiles=0` 行为必须保留。
- **别名只归一缓存键**：会话 id、标题、显示与证据 roots 仍是用户输入路径；realpath 归一不得把第 3 个别名 tab 折叠为第 1 个 tab（perf:gate 的 `roots` 断言也必须继续成立）。别名复用不是达标主因，但必须落地并可回归。
- **非活动 tab 摘要 + 激活重建**：不得丢弃四态 counts / 过滤 / 折叠 / 选中 / 滚动等可恢复状态；重建必须走热缓存，不得触发重新哈希。
- **harness 禁删会话**：轮界释放旧会话会系统性低估多 tab 驻留，属违规口径；group3 与 group2b 必须保留 tab，证据里逐轮 `tabs` 可核。
- **门禁契约同步更新且不可恒绿**：multisession holds 的 `comparisons` 期望从「=round」改为「仅活动 1 份」时，必须同时落「非活动只有摘要」「保留 tab」「别名轮 0 哈希」新断言，保证旧行为下红。
- **只采一次**：最终提交上仅执行 1 次含 group3 的真实 UI 口径采样（`perf:gate` 或 `perf:dir`，命令与档位在交付写明）；证据归档到仓库外；失败也如实交付，不得重跑第二次。
- 复用现有 harness / perf 证据与 profile 模式（`src/main/perf/harness.ts`、`src/renderer/src/perf/`、`src/shared/perf/`），不新建并行测量框架；新增模式/字段需与现有 CLI、证据字段风格一致并有单测。
- 若证据表明即使非活动 tab 只留摘要仍无法压进 1536：先交最小只读数据与两种方案代价，禁止自行改阈值或改验收口径。
- 阈值按字节比较（1536 / 1300 / 2560 MiB 对应 1,610,612,736 / 1,363,148,800 / 2,684,354,560 B）；峰值与静置分列，禁止只给单一内存数字。
- 本项一次采样的数字必须与负责人另排的打包 app CDP L3 同口径（真实 UI、保留 tab），不得用「每轮删会话」或仅 harness 私有路径替代。
