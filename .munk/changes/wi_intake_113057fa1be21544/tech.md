# Tech · 修复真实 UI 路径历史对比未释放导致的 ready 内存峰值越线

> 本轮 delta。根因与方向已由 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 定死（PRD「实现约束」），本文只给**落地结构 / 数据流 / 可测性分层 / 风险**，不重新归因。
> 视觉以 UX 稿面为准（本项无界面改动，无 `ux/**`）。

---

## 0. 方案一句话

**把「旧 comparison / 旧 row model 仍被 React fiber props 与虚拟列表闭包持有」变成「提交新 comparison 时旧子树整体卸载」**：
渲染侧用「会话 id + comparison 修订号」作为 `DirectoryView` 的 `key`（upsert / 切 tab / 同步重写都会换 key → 旧 fiber 子树、旧 `useVirtualizer` 实例、旧 `useMemo` 行模型一并失效，属**提交路径同步释放**，不等 GC）；
harness 侧去掉「每轮开始前释放上一轮会话」，改为**渲染真实 `DirectoryView` + 复用 Workbench 的会话数组语义**（`upsert` 同会话 5 轮 / `multisession` 3 会话 1→2→3），并以「强制 GC 后的存活份数 + 逐轮峰值 + settle」写入门禁；
文档把「旧 harness = 每轮释放会话 = 盲区」写死，并把 ready 峰值与 settle 分列。

不动：缓存上限 / 淘汰、对比算法、四态、快照格式、IPC 契约、页面布局、发布文件。

---

## 1. 现状事实（读码确认，供实现对齐）

| 事实 | 位置 | 对本轮的意义 |
| --- | --- | --- |
| 同一 directory pair 的会话 id 稳定（`directory:<left> ↔ <right>`） | `workbench/directoryCompare.ts#directorySessionId` | 重新对比同一对 = **upsert 同一 tab**，不会新增 tab |
| `upsertSession` / `replaceSession` 已调 `releaseDirectoryComparison`（只淘汰缓存条目） | `Workbench.tsx:506-539` | 缓存路径已正确；**缺的是渲染侧引用释放** |
| `renderScene(active)` 渲染 `DirectoryView` **没有 key** | `Workbench.tsx:999` | 换 comparison 时同一组件位置复用 fiber → 旧 `memoizedProps` / `alternate.memoizedProps` 与旧 inline 闭包（捕获 `comparison`、`leftRows`、`rightRows` 的整段 render scope）仍可达 |
| `DirectoryView` 用 `useMemo(buildDirectoryRowModel)` 建两份行模型 | `views/DirectoryView.tsx:162-169` | 旧行模型随旧 render scope / `TreeView` 的 `useVirtualizer` 闭包（`getScrollElement`）存活 |
| `TreeView` 在 `scrollElement` 上跑 `useVirtualizer` | `components/TreeView.tsx:155-161` | 旧 virtualizer 实例与其闭包是第二条持有路径，只有**卸载**才能确定性清掉 |
| harness 用一个 `held` 槽 + `onReleaseSession` 每轮清空；`PerfRunner` 只渲染一行文字，**不渲染任何视图** | `perf/runRounds.ts:84-90`、`perf/PerfRunner.tsx` | 这就是盲区：既没有 fiber 持有，也没有行模型，峰值天然偏低 |
| 每轮 session id 被改写为 `...#round-N` | `perf/runRounds.ts:63-65,114-117` | 让「同会话 upsert」在 harness 里不可能发生，必须改 |
| 判定单点 `evaluatePerf` + `perf/profiles.json` 两档 | `shared/perf/verdict.ts`、`perf/profiles.json` | 新增断言必须继续走这一处，档位只增不放松 |
| `perf:gate` = 一次 Electron 跑 3 轮 gate 档 + 断言证据 | `scripts/perf-gate.mjs` | 需改为「一条命令覆盖 upsert 5 轮 + multisession 3 会话」 |
| 应用已有**免弹窗**打开路径的入口（「新建对比」对话框输入/粘贴两个真实路径） | `workbench/NewCompareDialog.tsx` + toolbar `title` | PRD「可测性设计」已满足，本轮不新增任何入口 |

---

## 2. 方案 A：渲染侧按提交释放历史对比

### A1. comparison 修订号（新，`workbench/directoryCompare.ts`）

```ts
// module-level, weak: 一份 comparison 一个单调修订号，用于 render key
const comparisonRevisions = new WeakMap<DirectoryComparison, number>()
let nextComparisonRevision = 1

export function directoryComparisonKey(comparison: DirectoryComparison): string {
  let revision = comparisonRevisions.get(comparison)
  if (revision === undefined) {
    revision = nextComparisonRevision++
    comparisonRevisions.set(comparison, revision)
  }
  return `c${revision}`
}

export function createDirectorySession(comparison, sides) {
  // …既有字段不变
  trackLive('comparison', comparison)   // 见 §4.3，默认关闭时零开销
  directoryComparisonKey(comparison)    // 首次登记修订号（创建期，不在 render 里造副作用）
  // …
}
```

- 不给 `WorkbenchSession` 加字段（避免动模型与快照/测试面）；修订号只活在 WeakMap 里。
- `WeakMap` 不延长对象寿命，不再被引用的旧 comparison 自然消失。

### A2. 渲染 key（`Workbench.tsx`，1 行改动 + 1 个 import）

```tsx
<DirectoryView
  key={`${session.id}#${directoryComparisonKey(comparison)}`}
  sessionId={session.id}
  …
/>
```

效果（三种路径都覆盖，无需新增分支）：

| 路径 | key 变化 | 结果 |
| --- | --- | --- |
| 同 pair 重新对比（upsert，id 不变） | 修订号变 | `DirectoryView` + `TreeView` + virtualizer 卸载重建，旧 comparison / 旧 row model 随子树失效 |
| 切 tab（id 变） | id + 修订号变 | 旧 tab 的行模型与 virtualizer 立即释放（保持既有「不可见会话不建行模型」） |
| 同步后 `replaceSession`（id 固定、comparison 新） | 修订号变 | 同上 |
| 下钻往返（既有行为） | 组件本就卸载重挂 | 不变 |

行为核对（PRD「不得静默改变可见行为」）：

- filter / 折叠集 / 选中 / 两侧滚动位置都由 shell（`directoryStates` / `directoryScroll`）持有，重挂后原样恢复（既有 `useLayoutEffect` 路径）。
- 会重置的只有 `DirectoryView` 的两个局部 toolbar 选择（`direction` / `mode`，默认 左→右 / 增量）。这与既有「下钻返回时视图重挂」的行为一致，属既有语义，不新增。
- 布局、文案、aria 结构、四态统计零改动。

### A3. 会话数组语义收敛到一处（新，`workbench/sessionStore.ts`）

把 `upsert / replace / close` 的「列表怎么变 + 哪个旧会话该释放」抽成纯函数，Workbench 与 perf harness **共用同一份**语义（PRD B：「harness 的持有语义必须与 Workbench 一致」）：

```ts
export interface SessionCommit {
  readonly sessions: readonly WorkbenchSession[]
  /** 被替换/关闭的旧会话（需由调用方显式 release）；没有则 null。 */
  readonly released: WorkbenchSession | null
}

export function upsertSessions(current: readonly WorkbenchSession[], session: WorkbenchSession): readonly WorkbenchSession[]
// 同 id → 原位替换（顺序不变），否则追加
export function replaceSessions(current: readonly WorkbenchSession[], id: string, session: WorkbenchSession): readonly WorkbenchSession[]
// 原位替换且强制沿用调用方的 id

export function commitUpsert(cache: ComparisonCache, current: readonly WorkbenchSession[], session: WorkbenchSession): readonly WorkbenchSession[]
// = upsertSessions + released?.directory && releaseDirectoryComparison(cache, released.directory, next)
export function commitReplace(cache, current, id, session): readonly WorkbenchSession[]
export function commitClose(cache, current, id): { sessions; closed }
```

Workbench 改法（保持现有批处理语义，风险最小）：

```ts
function upsertSession(session) {
  if (session.id !== undefined) setSessions((current) => upsertSessions(current, session))
  const released = sessions.find((item) => item.id === session.id)      // 与今日一致：用渲染快照算释放
  if (released?.directory) releaseDirectoryComparison(cache.current, released.directory,
    upsertSessions(sessions, session))
  setActiveId(session.id)
}
```

即：**列表更新仍走函数式 updater（不丢批内追加），释放仍按快照计算（与现状一致）**；perf harness 直接调 `commitUpsert`，两边语义逐字一致。

`closeSession` 的 shell 缓存清理（`directoryStates` / `directoryScroll` / `codeMerge` / `csvAlign` / `closeTarget`）保持原样。

### A4. 行模型登记（`views/DirectoryView.tsx`，纯埋点）

```ts
const leftRows = useMemo(() => {
  const model = buildDirectoryRowModel(comparison.root, filter, 'left', collapsedPaths)
  trackLive('rowModel', model)
  return model
}, [comparison, filter, collapsedPaths])
// right 同理
```

不改渲染结果，只在 perf liveness 开启时登记（见 §4.3）。

---

## 3. 方案 B：harness 双模式 + 真实视图

### B1. CLI（`shared/perf/args.ts`）

```ts
export const PERF_MODES = ['upsert', 'multisession'] as const
export const DEFAULT_PERF_SETTLE_MS = 20_000
export const MAX_PERF_SETTLE_MS = 60_000
```

- `--mode <upsert|multisession>`（默认 `upsert`）。
- `--left` / `--right` 改为**可重复**，按出现顺序配对；两侧数量必须相等。
  - `upsert`：恰好 1 对（与今日命令兼容，`pnpm perf:dir --left A --right B` 行为不变，只是不再每轮释放）。
  - `multisession`：≥2 对（`pnpm perf:gate` 传 3 对）；`--rounds` 若显式给出必须等于对数，否则自动取对数。每对跑 1 轮，逐轮追加 tab。
- `--settle <ms>`（默认 `20_000`，上限 `60_000`，`0` = 不等待但**门禁不允许** 0）。
- 校验失败的信息风格与今日一致（`--mode 只接受 upsert / multisession…`、`--left 与 --right 数量不一致…`）。

配置类型：

```ts
export type PerfMode = 'upsert' | 'multisession'
export interface PerfPair { readonly left: string; readonly right: string }
export interface PerfHarnessConfig {
  readonly mode: PerfMode
  readonly pairs: readonly PerfPair[]
  readonly left: string        // = pairs[0].left（证据 roots 兼容）
  readonly right: string
  readonly rounds: number
  readonly settleMs: number
  readonly intervalMs: number
  readonly out: string
  readonly profile: PerfProfileName
  readonly failOnViolation: boolean
}
```

### B2. 轮次编排（`renderer/src/perf/runRounds.ts` 重写核）

**删除** `held` 槽与 `onReleaseSession`（PRD：运行期不得再出现「轮次开始前释放上一轮会话」的路径）。

```ts
export interface PerfRoundHooks {
  readonly onRoundStart?: (round: number, startedAt: string) => void | Promise<void>
  /** 提交本轮会话：调用方（shell）用 commitUpsert / commitAppend 落到 React state 并等渲染静止。 */
  readonly onCommit: (next: readonly WorkbenchSession[], activeId: string) => Promise<void>
  readonly onRoundEnd?: (report: PerfRoundReport) => void | Promise<void>
  readonly onProgress?: ProgressReporter
  readonly now?: () => number
}

export async function runPerfRounds(platform, input: {
  readonly mode: PerfMode
  readonly pairs: readonly PerfPair[]
  readonly rounds: number
}, hooks): Promise<readonly PerfRoundReport[]>
```

- 缓存：一个 `createComparisonCache()` 贯穿整轮（与 Workbench 的 `cache useRef` 同义）。
- `upsert`：每轮 `commitUpsert(cache, current, createDirectorySession(comparison, sides))` → `sessions.length` 恒 1、id 恒为 `directory:<L> ↔ <R>`；`released` 的根仍被新会话占用 → 缓存不淘汰 → 第 2–5 轮 `hashedFiles===0`。
- `multisession`：第 i 轮用第 i 对，`commitUpsert`（新 id 自然追加）→ `sessions.length` 1→2→3，`activeId` = 新会话。
- `onCommit` 内部必须**等到渲染静止**（两次 `requestAnimationFrame` + `setTimeout 0`；无 rAF 环境退化为 `setTimeout(0)`×2）再返回，然后才发 `round-end`，保证主进程的 post-round 采样看到的是「新树已上屏」的状态。
- 报告 `PerfRoundReport` 仍**只有标量**，新增 `tabs: sessions.length`。

### B3. Shell（`renderer/src/perf/PerfRunner.tsx` 重写为真实壳体）

渲染结构（不再是一行文字）：

```
<header> 状态文案（轮次 / hashed / settle 提示）
<SessionTabs tabs={sessions.map(元数据)} activeId onSelect={setActiveId} />   // 复用现有组件，只有标题不含 comparison
<DirectoryView key={`${active.id}#${directoryComparisonKey(active.directory)}`} … />
```

- `DirectoryView` 全部 props 走既有契约：`filter='all'`（shell state）、`collapsedPaths=[]`、`selectedPath=null`、`scrollTops={0,0}`、`visibleCounts={...comparison.counts, conflict:0}`、`pickerAvailable={false}`、`busy={false}`、`syncPreview/templatePreview=null`、其余回调为空实现（harness 不点按钮）。**不改 `DirectoryView` 的 props 契约。**
- 挂载即 `setLivenessEnabled(true)`；卸载 `setLivenessEnabled(false)`。
- 轮间不做任何 `setSessions(null)` / 清 ref 的动作。
- 出错仍走既有 `perf.event({type:'failed'})`，证据照写、`verdict.ok=false`。

### B4. 强制 GC + 存活份数（PRD `ac-structural-single-hold`）

1. `src/main/index.ts`：**同步**判 `isPerfHarnessActive(process.argv, process.env)`，在 `app.whenReady` 之前
   `app.commandLine.appendSwitch('js-flags', '--expose-gc')`。普通启动绝不加该 switch。
2. renderer（PerfRunner 内）：

```ts
async function forceGc(): Promise<boolean> {
  const gc = (globalThis as { gc?: () => void }).gc
  if (typeof gc !== 'function') return false
  gc(); await new Promise((r) => setTimeout(r, 30)); gc()
  return true
}
```

3. 每次 `round-end` 之后（下一轮 `round-start` 之前）与最终 settle 之后：`forceGc()` → `livenessCounts()` →
   `perf.event({ type: 'hold', label, tabs, comparisons, rowModels, gc })`。
4. `gc === false` **不是**通过：主进程记 `hold.gc=false`，判定给 `hold-unmeasured` 违规（宁可红，不可静默绿）。
   备用通道（若 `--expose-gc` 在 renderer 不生效）：主进程在收到 `hold` 前用
   `mainWindow.webContents.debugger` 调 `HeapProfiler.collectGarbage`，再回一次 IPC 让 renderer 取数。实现时先做 **10 分钟 spike 确认**，两者都不可用即按 `harness-error` 红。

### B5. settle（ready 峰值与 settle 分列）

最后一轮 `round-end` 之后：

```
await delay(config.settleMs)      // 默认 20s，gate 用 5s
await forceGc()
perf.event({ type: 'hold', label: 'settle', … })
perf.event({ type: 'settle' })    // 主进程即时采样 = settle RSS
perf.event({ type: 'complete' })
```

新增采样 phase `'settle'`（`PerfSamplePhase` 加一个成员），`PerfEvidence` 增 `settle: PerfRss | null` 与 `settleAt`。
`peaks` 结构保持原样（rounds/periodic 的峰值），**settle 单独一列**，不混进峰值。

### B6. 事件与证据（`shared/perf/types.ts`、`main/perf/harness.ts` 增字段，`v1` schema 加法扩展）

```ts
export type PerfRendererEvent =
  | …既有 5 种
  | { readonly type: 'hold'; readonly label: string; readonly tabs: number
      readonly comparisons: number; readonly rowModels: number; readonly gc: boolean }
  | { readonly type: 'settle' }

export interface PerfHoldSample {
  readonly label: string          // 'round-1' | 'round-2' | … | 'settle'
  readonly round: number          // settle 记最后一轮
  readonly tabs: number
  readonly comparisons: number
  readonly rowModels: number
  readonly gc: boolean
}

// PerfEvidence 新增
readonly mode: PerfMode
readonly pairs: readonly PerfPair[]
readonly holds: readonly PerfHoldSample[]
readonly settle: PerfRss | null
// PerfRoundReport 新增
readonly tabs: number
```

`isPerfRendererEvent` 白名单同步加 `hold` / `settle`；`evidenceFile.ts` 的原子写在 5 MB 上限内（新增数据量 < 5 KB）。

### B7. 判定（`shared/perf/verdict.ts` 单点扩展，`perf/profiles.json` 只增）

```ts
export interface PerfHoldRule { readonly comparisons: number; readonly rowModels: number; readonly tabs: number }
export interface PerfEvaluationInput {
  …既有
  readonly mode: PerfMode
  readonly settle?: PerfRss | null
  readonly roundPeaks?: readonly number[]        // 每轮 renderer 采样峰值
  readonly holds?: readonly PerfHoldSample[]
}
```

新增 `perf/profiles.json` 字段（只增，不动既有 5 项）：

| profile | `settleRendererBytes` | 依据 |
| --- | ---: | --- |
| `real` | `1363148800`（1300 MiB） | PRD 阈值 `ac-real-ui-upsert-settle` |
| `gate` | `1073741824`（1 GiB，= gate peak） | gate 数据集小，settle 的「牙齿」在结构断言；档位不得比 peak 更松 |

新违规 id 与规则：

| id | 规则 |
| --- | --- |
| `renderer-round-peak` | 任一轮 `roundPeaks[i] > thresholds.rendererPeakBytes` |
| `renderer-settle` | `settle.renderer > thresholds.settleRendererBytes` |
| `hold-comparisons` | `upsert`：任一 hold（含 settle）`comparisons !== 1`；`multisession`：第 i 轮 `comparisons !== i`，settle `!== pairs.length` |
| `hold-row-models` | 任一 hold `rowModels > 2`（活跃 tab 左右两份） |
| `hold-tabs` | `upsert`：任一 `tabs !== 1`；`multisession`：第 i 轮 `tabs !== i` |
| `hold-unmeasured` | `holds` 为空或任一 `gc === false` |
| `round-delta`（既有） | **仅 `upsert` 模式**生效（multisession 每轮多一个真实 tab，增长是应有状态，不套该规则） |

`evaluatePerf` 仍是唯一判定点；`resolvePerfExitCode` / `formatPerfViolations` 不变。

### B8. 门禁（`scripts/perf-gate.mjs`）

一条 `pnpm perf:gate` 生成一次数据集，跑**两次 harness**（同一临时目录，`RUN_TIMEOUT_MS` 提到 `300_000`），两灰盒都断言：

1. 数据集：沿用现有生成器（6000/侧、≥100 MiB、5 层、同大小不同内容、符号链接），**额外**造第 3 对根：
   `links/left` → 指向 `left` 的目录符号链接（与 `multisession.mjs` 第 3 步同义），得到 3 组不同的根路径：
   `(left, right)`、`(right, left)`、`(links/left, right)`。
2. `run 1`（upsert）：`--mode upsert --rounds 5 --settle 5000 --profile gate --fail-on-violation`。
   断言：`rounds.length===5`、每轮 `tabs===1`、`sessionId` 恒为 `directory:<L> ↔ <R>`、每轮 `holds[i].comparisons===1`、`rowModels<=2`、`gc===true`、
   每轮 `roundPeak<=1073741824`、`settle.renderer<=1073741824`、`verdict.ok===true`、
   **第 2–5 轮 `counts.hashedFiles===0`**（证明释放路径未触发重哈希，守住 `ac-cache-untouched`），
   逐轮 `hashedFiles` 与 `bytesToHash` 非负且第 1 轮 > 0。
3. `run 2`（multisession）：`--mode multisession --left L1 --left L2 --left L3 --right R1 --right R2 --right R3 --settle 5000 --profile gate --fail-on-violation`。
   断言：`rounds.length===3`、`tabs` 依次 `1,2,3`、`holds` 的 `comparisons` 依次 `1,2,3`、`rowModels<=2`、`gc===true`、峰值与 settle 在 gate 档内、`verdict.ok===true`、
   证据 `mode==='multisession'` 且 `pairs.length===3`。
4. 两条证据都要满足既有的「周期采样条数 ≥ floor(wallMs/interval)−1」「roots 指向本次临时目录」「非样本路径」断言。
5. 违规时 `--fail-on-violation` 保证非零退出（既有机制，不改）。

门禁**不**跑 `real` 档、不跑打包 app（`ac-real-ui-*` 由产品负责人在 Ops 用打包产物 + 原样 CDP 脚本做 L3 验收）。

---

## 4. 方案 C：可测性分层（每条 ac 的落点）

### 4.1 L1 — 纯逻辑 / 纯状态单测（`vitest`，node，毫秒级）

| ac | 用例（新/改文件） |
| --- | --- |
| `ac-harness-hold-modes` | `renderer/src/perf/runRounds.test.ts`：`upsert` 5 轮 → 每轮 `onCommit` 收到的 `sessions.length===1`、id 恒定、`comparisons` 由 `commitUpsert` 语义被替换（旧 session 对象不在下一轮列表里）；`multisession` 3 对 → `sessions.length` 依次 1/2/3、`tabs` 字段依次 1/2/3；**断言不存在任何 `release`/`setSessions(null)` 钩子**（`Object.keys(hooks)` 不含 `onReleaseSession`） |
| `ac-gate-red-on-old-behavior`（规则层） | `shared/perf/verdict.test.ts`：`upsert` + `holds=[{comparisons:3,rowModels:4}]` → 违规含 `hold-comparisons` + `hold-row-models`；`settle=1400 MiB` → `renderer-settle`；`roundPeaks[2]>peak` → `renderer-round-peak`；`gc:false` → `hold-unmeasured`；`multisession` 的 `comparisons=1,2,3` 全绿（正样本） |
| `ac-cache-untouched`（口径层） | `verdict`/`recorder` 不改缓存；既有 `src/memory-gate.test.ts` 原样通过（缓存代码零改动） |
| 会话语义 | 新 `workbench/sessionStore.test.ts`：`upsertSessions` 同 id 原位替换且顺序不变；`replaceSessions` 沿用调用方 id；`commitUpsert` 在「根仍被新会话占用」时不淘汰（`cache.stats.evictions` 不增）、在「唯一会话被替换收尾」时按根释放 |
| CLI | `shared/perf/args.test.ts`：`--mode` 非法值、多对 `--left/--right` 数量不匹配、`upsert` 给 2 对、`multisession` 给 1 对、`--settle` 负数/超上限、旧命令行（无 `--mode/--settle`）仍解析为 `upsert/20000` |
| 证据/采样 | `shared/perf/recorder.test.ts`：`roundPeaks` 逐轮取窗内峰值、`settle` 单列不混入 `peaks`、`holds` 原样入证据 |
| liveness | 新 `shared/perf/liveness.test.ts`：关闭时零登记；开启时同对象只计一次；对象不可达后（`WeakRef` 失效）计数回落（用可注入的 `ref` 桩，不在单测里玩 GC） |

### 4.2 L2 — 进程内组件 / 真实 IPC 就近集成（`jsdom` + `@testing-library/react`）

| ac | 用例（新 `renderer/src/perf/perfShell.test.tsx`） |
| --- | --- |
| `ac-structural-single-hold`（机制层） | 挂载「带 key 的 shell」，用两棵合成 comparison 连续提交 3 轮；每轮后做 **fiber props 可达性走查**：从容器根的 `__reactFiber$…`/`__reactContainer$…` BFS `child/sibling/alternate`，检查每个 fiber 的 `memoizedProps` 浅层值是否 === 旧 comparison / 旧 `DirectoryRowModel`。期望：旧对象**不可达**（`null`），当前对象可达 |
| `ac-gate-red-on-old-behavior`（组件层红） | 同一用例内再挂一个**不加 key** 的对照渲染（就是旧行为），同样走查 → 旧 `comparison` 与旧 `rows` **仍然可达**。这条红用例随 `pnpm test` 常跑，证明门禁规则不是恒绿 |
| `ac-real-ui-no-regression`（视图语义，局部） | 既有 `views/DirectoryView.test.tsx` 通过（不改 props）；`App.test.tsx` 全绿（tab 身份/顺序、下钻返回、滚动恢复、过滤/折叠/选中） |
| `ac-harness-hold-modes`（模式） | shell 渲染 `SessionTabs` + `DirectoryView`，`multisession` 连提交 3 会话后：DOM 里只有 1 个 `role="tree"` 组的活跃 tab 内容、`tablist` 三个 tab、切到第 1 个 tab 后行内容与首行一致（复用现有断言风格） |

> 为什么不靠 jsdom 的 GC 计数：`vitest` 默认不开 `--expose-gc`，GC 断言会变成「跳过即绿」。fiber props 走查是**确定性**的、直接命中「经 fiber props / 闭包可达」这条根因；GC 后的存活份数留在 L3（harness）里做。

### 4.3 L3 — 真机 / 打包 app（不进 `code_gates`，由产品负责人发起）

- `pnpm perf:gate`（本项在 `code-gates.json` 里，见 §4.4）：gate 档 upsert 5 轮 + multisession 3 会话，含 `holds`（强制 GC 后份数）、逐轮峰值、settle。
- 打包 app（`electron-builder --dir`，仓库外）+ **原样** `repeat.mjs` / `multisession.mjs` / `lib.mjs`（sha256 不变）：`ac-real-ui-upsert-peak` / `-settle` / `ac-real-ui-multisession` / `ac-real-ui-app-total` / `ac-real-ui-no-regression` / `ac-hot-wallclock-no-regression` / `ac-evidence-and-before-after` / `ac-honest-if-still-over` 全部由该轮证据判定（PRD 已给绝对路径与字节阈值）。

### 4.4 `code_gates` 落点（可确定性验证的层级）

| gate | 覆盖本轮哪些 ac |
| --- | --- |
| `pnpm lint` / `typecheck` / `build` / `test` | `ac-quality-gates`；`test` 里含 §4.1 + §4.2 全部用例（含红用例） |
| `pnpm perf:gate` | `ac-gate-covers-upsert-and-multisession`、`ac-structural-single-hold`（harness 证据字段）、`ac-harness-hold-modes`（证据 `mode`/`tabs`/`holds`）、`ac-cache-untouched`（热轮 `hashedFiles=0`） |
| `pnpm test:memory` | `ac-cache-untouched`（缓存规模 / 跨轮不增长 / 按根释放，代码零改动） |

`ac-real-ui-*`、`ac-hot-wallclock-no-regression`、`ac-evidence-and-before-after`、`ac-honest-if-still-over`、`ac-release-files-untouched` 的「打包产物」面 → Ops 阶段 L3。

---

## 5. 文档口径（`docs/perf/large-directory-memory.md` §5）

改写 §5 的 harness 段（现 §5.2 末尾两行）与新增一小节：

1. **历史盲区（写死）**：旧 harness 每轮 `onReleaseSession` 释放上一轮会话、且不渲染任何视图，因此**从未覆盖真实 UI 的持有路径**（fiber props / 虚拟列表闭包）；旧口径下的「峰值」只反映扫描/分类/缓存，不反映屏幕上真实持有的结果树与行模型。本次已改，不得再用旧口径解释 UI 峰值。
2. **两种模式**：`--mode upsert`（同会话，tab 恒 1，语义 = `Workbench.upsertSession`）与 `--mode multisession`（3 对不同根，tab 1→2→3，语义 = 多 tab 会话数组）。写明「运行期不再有轮前释放」。
3. **双列口径**：`ready 峰值`（每轮窗口内 renderer 采样峰值，取 `rounds[].roundPeak`）与 `+settle 静置`（末轮后 `--settle`，默认 20 s，单独一列 `settle`）分别给阈值与判定，禁止只给一个数字。
4. **结构断言**：`holds[]` = 强制 GC 后 `comparisons` / `rowModels` / `tabs`；`upsert` 恒 `1/≤2/1`，`multisession` 为 `i/≤2/i`。
5. **实测对照**：把诊断报告 §3/§4 的修复前数字（701/1321/1680/1708/1726 MiB、694/1382/1716 MiB、settle 1244–1275 MiB）作为「修复前」列，给出修复后由打包 app 实测的数字与证据绝对路径（证据可落仓库外；仓库内只改文档）。
6. `perf/profiles.json` 新增 `settleRendererBytes` 的取值与理由入表。

（`docs/perf/evidence/` 只在需要归档 perf:gate 证据时按现有命名约定新增，不覆盖历史文件。）

---

## 6. 风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | `--js-flags=--expose-gc` 在 Electron renderer 不生效 | `holds.gc=false`，门禁无法给结构断言 | 实现前 10 分钟 spike 验证（`globalThis.gc` 实测）；不行则退 `webContents.debugger` + `HeapProfiler.collectGarbage`；两者都不行 → `hold-unmeasured` 红并上报，**不允许静默跳过** |
| R2 | 重挂 `DirectoryView` 重置 `direction`/`mode` 局部 toolbar 选择 | 轻微行为差异（与既有下钻返回重挂一致） | 已核对：无布局/统计/选中/滚动/过滤变化；若产品不接受，二次方案是把这两个选择提升到 shell（本项不做） |
| R3 | 门禁从 1 次 Electron 变 2 次（≈ 双倍时长） | gate 时长变长 | 数据集不变（6000/侧），gate settle 取 5 s，`RUN_TIMEOUT_MS` 150 s→300 s；实测目标总时长 ≤ 3 分钟；若超，先在 `perf-gate.mjs` 里把 multisession 的 `--interval` 调 1000 |
| R4 | 渲染真实视图后 `real` 档 `perf:dir` 峰值上移（这会揭出旧 harness 的低估） | 可能出现 `real` 档一次红 | 这是**预期**：修复后应为 1 份树 + 2 份行模型；若仍越线按 `ac-honest-if-still-over` 如实上报，不放宽档位、不缩缓存 |
| R5 | `Workbench` upsert 改用「快照算释放 + 函数式 updater 更新列表」 | 与今日一致，但仍是两条来源 | `sessionStore` 单测 + `App.test.tsx` 全绿；不引入「updater 里做副作用」 |
| R6 | fiber 走查测试随 React 内部结构变化而脆 | 测试维护成本 | 只做**浅层 props 身份比较**（不深走 props 图），失败信息打印命中的 fiber `type`；不 mock React |
| R7 | WeakRef 计数受 GC 时机影响（假绿/假红） | 门禁不稳 | 连续两次 `gc()` + 30 ms 让弱引用清算；`directReady` 前的 `hold` 在前一轮结束后立刻发，避免与渲染竞争；同一轮采样以 settle 那次为准 |
| R8 | `multisession` 的 `--rounds` 与对数不一致 | 语义歧义 | 显式 `--rounds` 必须等于对数，否则 CLI 报错退出（有单测） |
| R9 | baseline 与本轮冲突 | 文档/验收口径分裂 | 见 §8，需 Host 在后续阶段更新 baseline（本 agents 阶段不改 baseline） |

---

## 7. 改动清单（按提交顺序）

1. `src/shared/perf/liveness.ts`（新）+ `liveness.test.ts`（新）
2. `src/renderer/src/workbench/sessionStore.ts`（新）+ `sessionStore.test.ts`（新）
3. `src/renderer/src/workbench/directoryCompare.ts`（修订号 + `trackLive`）
4. `src/renderer/src/workbench/Workbench.tsx`（`key` + 改用 sessionStore；`closeSession` 逻辑等价收敛）
5. `src/renderer/src/views/DirectoryView.tsx`（行模型 `trackLive` 埋点）
6. `src/shared/perf/types.ts` / `args.ts` / `recorder.ts` / `verdict.ts`（+ 各自 `*.test.ts`）
7. `src/main/index.ts`（perf 模式下 `--expose-gc`，app ready 前）
8. `src/main/perf/harness.ts`（`hold`/`settle` 事件、证据字段）
9. `src/renderer/src/perf/runRounds.ts`（模式化、删轮前释放）+ `runRounds.test.ts`（重写）
10. `src/renderer/src/perf/PerfRunner.tsx`（真实 shell：sessions + SessionTabs + DirectoryView + GC/hold/settle）
11. `src/renderer/src/perf/perfShell.test.tsx`（新，含红用例）
12. `perf/profiles.json`（只增 `settleRendererBytes`）
13. `scripts/perf-gate.mjs`（3 对根 / 两次 harness / 结构+峰值+settle+热轮断言）
14. `docs/perf/large-directory-memory.md` §5（口径改写）

不改：`src/core/**`（除零改动的 `trackLive` 外——本方案**不碰 core**）、缓存与淘汰、`.munk/code-gates.json`（`perf-gate` 命令仍是单一 argv `pnpm perf:gate`）、`package.json#version`、CHANGELOG、README、release workflow、`docs/release*`、`electron-builder.yml`。

---

## 8. 需要 baseline / 上层同步的语义变更（本阶段不落笔，仅登记）

- `.munk/baseline/domains/perf-memory/product.md` 的 `ac-fresh-session-per-round`（「每轮 sessionId 互不相同」）与 `.munk/baseline/domains/memory-bounded/product.md` 的 `ac-harness-round-release`（「轮前释放上一轮」）**被本项推翻**，应替换为：
  - `ac-harness-hold-modes`：`upsert` 模式轮次复用同一 session id（tab 恒 1）；`multisession` 模式逐轮追加（tab 1→2→3）；运行期不存在轮前释放路径。
  - `ac-structural-single-hold`：强制 GC 后 `comparisons`/`rowModels`/`tabs` 按模式断言。
- `perf:dir` 的证据新增 `mode` / `pairs` / `holds` / `settle` / `rounds[].tabs`（`schema` 仍 `opencompare.perf.directory/v1`，加法扩展），文档字段表需同步。

---

## 9. 自检（实施完必须自己跑一遍）

```bash
pnpm lint && pnpm typecheck && pnpm test          # 含红用例
pnpm build
pnpm test:memory                                   # 缓存未动
pnpm perf:gate                                     # upsert 5 轮 + multisession 3 会话，退出码 0
# 红路径自证（不恒绿）：临时把 verdict 输入的 holds 改成 2 份 comparison → 判定必须非零；
# 或临时把 DirectoryView 的 key 去掉 → perfShell.test.tsx 的「旧对象不可达」用例必须失败。
```

打包 app + 原样 CDP 脚本的 `repeat.mjs`(5 轮) / `multisession.mjs`(`SKIP_A=1`) 由产品负责人在 Ops 阶段执行，证据落仓库外，仓库内只更新文档与源码。
