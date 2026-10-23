# Tech delta — 别名根按 realpath 复用摘要（A 半按裁决裁掉）

## 0. 本轮口径与范围（按负责人 2026-10-23 补充裁决，优先于前两版）

裁决要点，逐条落到本方案：

1. **本项不再跑 3 tab × 5 轮 CDP 采样**：打包 app 的 L3（含「关 1 个 tab 后 renderer ≤1100 MiB」与行为回归）由负责人另排。本项只跑原 pipeline：`code_gates`（含一次 `pnpm perf:gate`）与既有 harness（**保留 tab 语义**），交付 commit。
2. **验收以 `goal.md` 五条为准**（不崩 / 静置 ≤1300·app 总 ≤2.5 GiB / 热轮不逐轮抬升·`hashedFiles=0` / 关 tab 回落 / 瞬峰仅护栏 ≤2.25 GiB）。「group3 热轮 ready ≤1536、静置 ≤1300」这条红线**删除**；1536 只剩对照列。
3. **A 半（非活动 tab 只留摘要、激活再建）是有条件项**：不得动 128 MiB 缓存上限/淘汰、不得牺牲切 tab 即时性与热跑 8–10 s；做不到就砍掉，只做别名根 realpath 复用，不扩范围。
4. 不为压瞬时峰值改缓存。缓存双上限、LRU、`hold()`、条目口径全部零改动。

**A 半的结论：砍掉。** 依据（均为本仓已有事实，不需新采样）：真实规模下一次目录扫描的墙钟就是热轮水平（upsert 热轮 8–10 s，缓存全命中、零哈希，剩下的就是双根扫描）。因此「激活再建」= 每次切回目录 tab 先付一次 8–10 s 扫描，直接违反「不牺牲切 tab 即时性」；要让它即时，只能保留整棵树（就是当前 299 MiB/份 的内存）或引入新的紧凑快照结构（新概念 + 新内存），两者都属扩范围。故按裁决 ③ 砍掉，**本轮只做 B**。A 的后续（含是否用紧凑摘要换即时性）留作独立项，不在本项。

由此连带作废本项内与 A 相关的门禁改动：multisession 的 `holds.comparisons` **仍为 `= round`**（非活动 tab 仍持树，这是当前真实持有路径，不能改成一个产品里不成立的期望），不新增「非活动只有摘要」断言，不新增 group3 / `retained` 模式 / `settleStages` / `reclaim` 证据字段。PRD 中 `ac-hold-structure`、`ac-activate-rebuild`、`ac-group3-*`、`ac-harness-no-release` 的 A 侧内容按本裁决移出本项。

## 1. 现状（读码结论，作为改动落点）

| 事实 | 位置 |
| --- | --- |
| 摘要缓存以**扫描出的绝对路径**为键（`node.path`），别名根前缀不同 → 整棵树全 miss、重算 SHA-256 | `core/directory/compare.ts:754`（`needsHash`）、`:783`（`hashFile`）、`:1106`（`digestContentCandidates` 写缓存） |
| 候选集由 `planContentReads` 决定：size/mtime 相同且缓存无条目才要哈希 | `compare.ts:763-781` |
| 缓存双上限 200,000 条 / 128 MiB，LRU + `hold()`，`evictUnderRoots`/`delete` 按根/路径淘汰 | `compare.ts:259-382` |
| 别名根在 perf 数据集里是 `<links>/left → <left>`，第 3 对是 `<links>/left ↔ <right>` | `scripts/perf-gate.mjs:generate` / `assertMultisession` 的 `--left/--right` |
| 比较入口只有两处：`snapshotOps.compareSides`（含快照种子）与 `directoryOps.compareRoots`（同步后重算） | `workbench/snapshotOps.ts:186`、`workbench/directoryOps.ts:107` |
| `PlatformPort` **没有任何真实路径能力**，渲染侧无法自证「别名根＝同一棵树」 | `shared/platform/types.ts` |
| multisession 门禁现状：tabs 1→2→3、`holds.comparisons === round`、`hashedFiles` 无断言 → 第 3 轮 76,604 次重哈希无人拦 | `shared/perf/verdict.ts:99`、`scripts/perf-gate.mjs:assertMultisession` |
| 会话提交语义 `sessionStore` / `runRounds` 已「不释放、不删 tab」 | `workbench/sessionStore.ts`、`perf/runRounds.ts` |

结论：本轮只需在**缓存键空间**做归一，并在两处比较入口登记别名；产品语义、树结构、会话身份与持有路径全部不动。

## 2. 方案 B — 摘要缓存键按 realpath 归一

### 2.1 真实路径能力（唯一新增平台能力，加法式）

渲染进程无文件系统，别名＝同一棵树只能由主进程判定。`PlatformPort` 增加**一个只读、批量**能力：

```ts
/** 每个入参的真实路径（解析符号链接），按输入顺序；无法解析的项返回自身。 */
realpath(paths: readonly string[]): Promise<readonly string[]>
```

- `shared/platform/channels.ts` 增 `realpath: 'platform:realpath'`；`preload/index.ts` 白名单透传；
- `main/platform/electron-platform.ts`：`node:fs/promises#realpath`，逐项 try/catch，失败回退输入本身（缺失/无权限都不该让一次比较失败），`/samples` 虚拟挂载直接返回自身，并提供可测的导出函数；
- `renderer/src/platform/web-platform.ts`：返回输入（内存 VFS 无链接），注释写明原因；
- **不改任何既有 channel 的入参/出参/语义**，不改扫描/摘要/对比契约。若负责人不接受任何新 channel，退路是给 `DirectoryEntry` 加 `canonicalPath`（面更大、每目录都要付），不推荐。

### 2.2 缓存键归一（`core/directory/compare.ts`）

`ComparisonCache` 增加两个成员，其余接口、双上限、LRU、`hold()` 全不改：

```ts
/** 登记某根的规范形；此后该根下缓存键以规范前缀存取。 */
aliasRoot(root: string, canonical: string): void
/** 某路径在已登记别名下的规范形；未登记则原样返回。 */
canonicalPath(path: string): string
```

- 内部 `Map<normalizedRoot, normalizedCanonical>`；`canonicalPath` 取**最长前缀**匹配后替换前缀（同时接受 `/` 与 `\` 分隔），未命中原样返回。根数量级是会话数（个位数），每次 get/set 多一次前缀比较，相对 76k 次 SHA-256 可忽略。
- `get / set / delete / evictUnderRoots` 一律先过 `canonicalPath`（`evictUnderRoots` 连 base 一起归一）；`hashes` 里因此存规范路径 —— 写进接口注释，`test:memory` 只读 `stats`/数量，口径不变（`estimatedBytes` 按规范键长计费，字符级差异）。
- 快照挂载 `/snapshots/...` 无真实路径 → 原样返回，既有 snapshot 缓存种子行为零变化。
- **不触碰**：`maxEntries` / `maxBytes`（仍 200,000 / 134,217,728）/ `evictDownToCaps` / `hold()` 语义。

### 2.3 登记位置（`workbench/rootAliases.ts`，新文件 ~30 行）

```ts
/** 比较开始前把真实目录侧的根登记到缓存；解析失败不影响本次比较。 */
export async function aliasSideRoots(platform, cache, roots: readonly string[]): Promise<void>
```

- `snapshotOps.compareSides` 在 `seedSnapshotCache` 之后、`compareDirectorySides` 之前调用（roots = `sides` 中 `kind === 'directory'` 的两个 path）；
- `directoryOps.compareRoots`（同步后重算）同样调用 —— 两条渲染侧比较入口不各写一套；
- 仅当 `canonical !== root` 时登记；`realpath` 抛错时整批回退（本次比较退化为旧行为，不做别名归一，绝不让比较失败）。

### 2.4 为什么只改缓存键就够

第 3 对（`<links>/left ↔ <right>`）扫出的每个文件 `path` 形如 `<alias>/…`；归一后与第 1 对（`<left> ↔ <right>`）**同键、同 size、同 mtime** → `planContentReads` 全部命中 → 不 digest → `hashedFiles=0`、`bytesToHash=0`、缓存条目数不因别名翻倍、第 3 步墙钟不再付 76,604 次哈希（22.4 s → 目标 ~9 s，与热轮同量级）。

同时保证「只归一缓存键」：会话 id（`directorySessionId(leftRoot, rightRoot)`）、`title`/`subtitle`、证据 `roots` / `pairs` 全部仍用用户输入路径 → 别名仍是第 3 个 tab，绝不折叠（tabs 仍 1→2→3）。

## 3. 门禁与 harness（最小改动）

### 3.1 `shared/perf/verdict.ts`

1. **多会话瞬时峰值改为护栏**（裁决 2 / goal ⑤）：新增

```ts
/** 瞬时峰值的回归护栏（goal ⑤）；多会话场景只在此线之上才判失败。 */
export const TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104   // 2.25 GiB
```

- `mode === 'multisession'`：`renderer-peak` / `renderer-round-peak` 只在 > `TRANSIENT_PEAK_GUARDRAIL_BYTES` 时违规；超过 profile 目标（1.5 GiB）时写 `verdict.notices[]`（`renderer-peak-over-target` / `renderer-round-peak-over-target`），数字照常出现在证据与交付对照里。理由是 goal 明确「瞬时峰值只作回归护栏」，留 1.5 GiB 硬线会让一个符合公司口径的绿跑被判红。
- `mode === 'upsert'`：`rendererPeakBytes` 继续是硬线 → 单 tab 既有基线不得回归（上次 ADR-0001 的成果不能丢）。
- `settle`（profile `settleRendererBytes`）与 `appTotal`（profile `appTotalPeakBytes`）**仍是硬线** —— 这正是 goal ② 的两条。
- `round-delta`（仅 upsert）、`hold-*`（`gc`、`tabs === round`、`comparisons === round`、`rowModels ≤ 2`）**保持不变**。
- `PerfVerdict` 增 `notices: readonly string[]`（加法，`ok` 不看 notices）。

2. `perf/profiles.json` 六项数值零改动；`appliedThresholds` 照旧报出。

### 3.2 `scripts/perf-gate.mjs`

- `assertMultisession` 新增唯一断言：`rounds[2].counts.hashedFiles === 0`（别名轮；旧行为 76,604 → 必红）。第 2 轮 `hashedFiles === 0` 沿用既有逻辑不新增断言，避免无谓风险。
- 逐轮 `roundPeak` 的上限从 `GATE_RENDERER_PEAK`(1 GiB) 改为 `TRANSIENT_PEAK_GUARDRAIL_BYTES`，并在超 profile 目标时打印对照（不判红）；`settle` / `appTotal` / `holds` / `tabs` / `roots` / `pairs` / 周期采样充足性断言全部保留。
- 仍只跑 upsert（5 轮）+ multisession（3 对，tabs 1→2→3，**保留 tab、不删会话**）；不新增 run、不新增模式、不新增证据字段。
- `pnpm perf:gate` 在最终提交上作为 code gate **只执行 1 次**；失败也如实交付，不重跑。

### 3.3 证据

`opencompare.perf.directory/v1` 字段与语义**零改动**（`rounds[].hashedFiles` / `wallMs` / `tabs` / `roundPeak` / `holds` 已足够表达本轮结论）。不新增 `settleStages` / `reclaim`。

## 4. 测试金字塔落点

### L1 — 纯逻辑 / 核心单测（`pnpm test`，node，无 Electron / 浏览器）

| 用例 | 文件 | 覆盖 |
| --- | --- | --- |
| 别名复用：同一棵树先按真路径比较，再按 `/alias/x` 比较 → 注入的 digest 计数第二次为 0、`cache.stats.entries` 不增、四态 counts 与真路径比较逐项相等、`bytesToHash = 0` | `core/directory/compare.test.ts` | ac-alias-root-reuse |
| 未登记别名时行为完全不变（键仍是原路径；`evictUnderRoots` / `delete` 语义、`stats` 口径不变） | 同上 | ac-cache-and-thresholds-untouched |
| `aliasRoot` 最长前缀与嵌套根；`/snapshots/...` 不受影响 | 同上 | ac-no-product-semantics-change |
| 多会话瞬峰：> profile 目标但 ≤2.25 GiB → `ok` 且带 notice；> 2.25 GiB → `renderer-peak` 红；upsert 模式仍按 profile 硬线；`settle` / `appTotal` / `hold-*` 红线不变 | `shared/perf/verdict.test.ts` | ac-gate-red-on-old-behavior |
| `realpath`：符号链接目录解析到目标、不存在的路径回退自身、`/samples` 原样 | `main/platform/electron-platform.test.ts` | ac-alias-root-reuse |
| preload 白名单透传新 channel；web 实现恒等 | `preload/index.test.ts`、`renderer/src/platform/web-platform.test.ts` | 契约 |

### L2 — 进程内组件 / 桩平台集成（`pnpm test`，jsdom + `createWebPlatformPort`）

- **别名根复用（真实 UI 路径）**：`scriptedPort` 包装 `realpath: p => p.replace('/memory/alias/', '/memory/real/')`；先比对真路径，再比别名根 → 第二次 `digestFiles` 调用 **0 次**、tab 数 1→2（不折叠）、第 2 个 tab 的 subtitle 仍是别名路径、四态计数一致。
- **回归**：现有「切 tab 即时性」类用例（`builds directory rows only for the active session`、drilldown roundtrip、tabs lifecycle）**不修改**，继续绿 —— 这是「A 被砍、行为不变」的守门。
- `perfShell.test.tsx` 不变（视图换 key 释放的既有断言）。

### L3 — 真实进程

只跑 `code_gates`（其中 `pnpm perf:gate` 一次）。打包 app 的真实规模 CDP L3（3 tab×5 轮、关 tab 回落、行为回归）由负责人另排，不在本项。

## 5. 预期效果（估计，不作验收数字）

- 别名第 3 步：`hashedFiles` 76,604 → 0，`bytesToHash` → 0，墙钟 22.4 s → ~9 s（与热轮同量级）；第 2 轮起持续 0。
- 缓存条目不再因别名翻倍；双上限与淘汰口径不变，热跑仍 8–10 s。
- **内存形态不变**（3 份树仍驻留）：ready ~1.7–2.0 GiB、静置 ~1.2–1.9 GiB、app 总 ≤2.52 GiB —— 按 goal 已被证明「有界、非单调」，本轮不以压峰值为目标。

## 6. 风险与取舍

1. **A 被砍**：3 份并发树仍驻留，瞬时/静置维持现状。这是裁决 ③ 的直接后果（激活重建要付 8–10 s 扫描）；对应 ac-hold-structure / ac-activate-rebuild / ac-group3-* / ac-harness-no-release 的 A 侧内容移出本项，需在交付里写明。
2. **新增 `platform:realpath`** 是唯一契约面变化（加法、只读、批量、无既有语义变更）。
3. **瞬峰判定放宽到 2.25 GiB（仅 multisession）**：`profiles.json` 数值不动，但多会话的失败线从 1.5 GiB 抬到 2.25 GiB。这是裁决 2 的显式要求（1536 败线删除），交付里必须写清「目标仍报出、只是不再判红」，避免被误读为悄悄放水。upsert 硬线、settle、appTotal、holds 均未放宽。
4. **别名归一后 `hashes` 键变规范路径**：`estimatedBytes` 按规范键长计费（字符级差异），上限/淘汰/条目口径零改动，`test:memory` 继续守。
5. **缓存命中依赖 size+mtime 未变**：别名根指向同一 inode，`lstat` 的 size/mtime 一致；若目标在两次比较之间被改写，仍会正确重哈希（不做跨 mtime 的乐观命中）。
6. **Windows 路径**：`canonicalPath` 同时接受 `/` 与 `\`，但本轮不为 Windows 另做验证（PRD 明确不测）。

## 7. 明确不改动

`core/directory` 的分类算法 / `planContentReads` / `digestContentCandidates` 逻辑；`DirectoryDiffNode` / `DirectoryComparison` 结构；`rows.ts`；四态语义；`.ocsnap.json` 线格式；`perf/profiles.json` 六项数值；`DEFAULT_COMPARISON_CACHE_MAX_ENTRIES` / `DEFAULT_COMPARISON_CACHE_MAX_BYTES` 与淘汰；会话模型与 `sessionStore` 提交语义（`session.directory` 仍全量持有）；`Workbench` / `DirectoryView` / `SessionTabs` 的交互与视觉；harness 模式、证据 schema、`--mode` 集合；`package.json#version`、CHANGELOG、README 版本表、release 相关。

## 8. 改动文件清单

- 平台/契约：`src/shared/platform/types.ts`、`src/shared/platform/channels.ts`、`src/preload/index.ts`、`src/main/platform/electron-platform.ts`、`src/renderer/src/platform/web-platform.ts`
- 缓存：`src/core/directory/compare.ts`（仅 `aliasRoot` / `canonicalPath` + 四个访问器的键归一）
- 渲染侧：`src/renderer/src/workbench/rootAliases.ts`（新）、`workbench/snapshotOps.ts`、`workbench/directoryOps.ts`
- 门禁：`src/shared/perf/verdict.ts`（护栏 + notices）、`scripts/perf-gate.mjs`（别名轮 0 哈希 + 峰值口径）
- 测试：上述模块对应 `*.test.ts(x)`

## 9. baseline 提案（提交阶段落地，本阶段不改 `.munk/baseline`）

- `tech/decisions/adr-0002-digest-cache-realpath-keys.md`：摘要缓存键按 realpath 归一（仅键空间，会话身份/显示路径不归一），别名根复用 SHA-256；并记录 A 半被否决的条件与代价（激活重建 ≥ 一次完整扫描 ≈ 8–10 s，违反切 tab 即时性；保留树或新建紧凑快照均属扩范围），以及「瞬时峰值在多会话场景降级为 2.25 GiB 护栏、settle/appTotal 仍为硬线」的判定分工。
- `tech/overview.md`：缓存段补「键按 realpath 归一但会话身份不归一」；门禁段补「瞬峰护栏 vs settle/appTotal 硬线」的分工与 `notices`。
