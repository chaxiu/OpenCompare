# 大目录多轮内存测量与上限门

本文覆盖 **测量入口 / 自动门禁 / 有界缓存与跨轮释放** 三部分。接口与证据字段以代码
`src/shared/perf/types.ts` 为准；缓存上限常量与淘汰实现在 `src/core/directory/compare.ts`。

## 1. 一条命令测量真实两目录

```bash
pnpm perf:dir \
  --left /Users/zhutao/Cursor/DawnChat \
  --right /Users/zhutao/Cursor/ZenMind \
  --rounds 3 \
  --settle 20000 \
  --out docs/perf/evidence/dawnchat-zenmind-$(date +%Y%m%d-%H%M%S).json
```

- `pnpm perf:dir` 先执行 `electron-vite build`，再启动真实 Electron 应用（真实主进程 +
  真实 renderer）；轮次编排在渲染进程里走 UI 同一条 `compareSides` → `scanDirectory` →
  `compareDirectories` → `platform.digestFiles` → `createDirectorySession` → `commitUpsert`
  路径，并**渲染与工作台相同的 `SessionTabs` + `DirectoryView`**（含虚拟列表与行模型）。
- 每次调用都在**同一个应用实例/同一个 renderer 进程**内连续跑完 N 轮；采样与证据落盘由主
  进程完成。
- 显式开关：`perf:dir` 包装脚本会带上 `--perf-harness` 并设置 `OPENCOMPARE_PERF=1`。只有
  **两者同时存在**才进入测量模式；普通启动（包括普通的 `--left/--right` 对比）零行为变化，
  不采样、不写证据、不暴露 `globalThis.gc`。
- 必填：`--left`、`--right`（均可重复，按出现顺序配对，两侧数量必须相等）、`--out`。
- 可选：`--mode`（`upsert` / `multisession`，默认 `upsert`；旧命令行不带 `--mode` 仍按
  `upsert` 解释）、`--rounds`（默认 3；`multisession` 下必须等于对数，否则按对数取值）、
  `--settle`（末轮后静置毫秒数，默认 20000，上限 60000，`0` 只供单测）、`--interval`
  （周期采样毫秒，默认 1000，上限 2000）、`--profile`（`real` / `gate`，默认 `real`）、
  `--fail-on-violation`。
- 缺少必填参数、未知参数、`--rounds` 非正整数、`--left`/`--right` 数量不一致、`upsert`
  给多对 / `multisession` 只给一对、根目录不存在或不可读时，进程以非零退出，stderr 指明
  具体参数或路径，并且不会写出“成功”证据文件。
- 运行失败（renderer 崩溃、窗口提前关闭、超时）仍会写出带 `error` 且 `verdict.ok=false` 的
  部分证据，退出码非零。

### 1.1 两种持有模式

| 模式 | 命令行 | tab 语义 | 用途 |
| --- | --- | --- | --- |
| `upsert` | 1 对根，`--rounds N` | tab 恒为 1；同 id 原位替换 | 同会话反复「重新对比」 |
| `multisession` | ≥2 对根，每对 1 轮 | tab 依次 1 → 2 → 3 | 多个目录对比 tab 并存 |

两种模式都复用 `workbench/sessionStore.ts` 的 `upsertSessions` / `commitUpsert`，
`Workbench.upsertSession` 与 harness 逐字同义；**运行期不存在「轮次开始前释放上一轮会话」的
路径**（旧 harness 的 `onReleaseSession` 已删除）。因此 harness 测到的就是真实 UI 的持有量。

## 2. 门禁命令

```bash
pnpm perf:gate
```

- 在系统临时目录生成真实落盘数据集（运行结束即删除）：每侧 6,000 个文件、总内容
  ≥100 MiB、`d0/.../d4` 五层嵌套、每 50 个文件一处“同大小不同内容”、左右各含指向文件 /
  目录 / 悬空目标的符号链接，另加 `links/left → left` 作为第三对根。不使用
  `src/shared/fixtures/` 或 `/samples`。
- 同一数据集上跑**两次** harness（`gate` 档，`--settle 5000`，超时 300 s）：
  1. `upsert`：1 对根 5 轮。断言 tab 恒 1、`sessionId` 恒为 `directory:<L> ↔ <R>`、
     每轮 hold `comparisons=1` / `rowModels≤2` / `gc=true`、每轮 `roundPeak` 与 `settle` 在
     gate 档内、判定绿；并断言第 1 轮 `hashedFiles>0`、第 2–5 轮 `hashedFiles=0`（缓存未被
     修复路径打穿）。
  2. `multisession`：3 对根（`L↔R`、`R↔L`、`links/left↔R`）各 1 轮。断言 tab 依次
     `1/2/3`、hold `comparisons` 与 `tabs` 依次 `1/2/3`、`rowModels≤2`、`gc=true`、峰值与
     settle 在 gate 档内、判定绿。
- 两次运行的证据都要求「周期采样条数 ≥ floor(wallMs/interval)−1」、`roots` 指向本次临时
  目录、不含内置样本路径。任一断言失败或 `--fail-on-violation` 违规即非零退出，输出被违反
  的阈值 / 结构 id（`hold-comparisons`、`hold-row-models`、`hold-tabs`、`hold-unmeasured`、
  `renderer-round-peak`、`renderer-settle`……）。
- 单次运行（含 `electron-vite build`，两次 harness）目标 ≤ 3 分钟。
- 需要留档时设置 `PERF_GATE_EVIDENCE_DIR=<仓库外目录>`，门禁会把两份证据复制为
  `perf-gate-<时间戳>-<mode>.json`（只复制，不改变判定与退出码）。
- 该命令**不在默认门禁矩阵**里：`.munk/code-gates.json` 只保留 9 项纯单测 / 构建门禁，
  `pnpm perf:gate` 属于条件 profile `.munk/code-gates.perf.json`（Host 不会自动执行该文件）。
  三条采样纪律：
  1. **条件触发**：只有 diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时才调用；
  2. **里程碑一次**：或作为里程碑 `x.y.0` 的独立验收任务跑一次，不随每个工作项重复；
  3. **同 commit 只采一次**：同一被测对象在同一 commit 只采样一次，重跑须在 digest 写明上一轮
     作废原因与两轮差异。

还有一条更轻的门禁，只断言**缓存规模与多轮不增长**，不启动 Electron：

```bash
pnpm test:memory
```

- 在系统临时目录生成真实落盘数据集（每侧 2,000 个文件、共 4,002 个文件、约 39.1 MiB
  内容、`d0/d1/bucket-*/` 三层嵌套、每 25 个文件一处同大小不同内容、左右各一个单侧文件），
  用 `fs` 真实列目录、真实流式 SHA-256 跑 3 轮，结束后删除数据集；不使用
  `src/shared/fixtures/` 或 `/samples`。
- 断言每轮 `stats.entries <= maxEntries`、`stats.estimatedBytes <= maxBytes`；第 2 与第 3 轮
  结束后的 `stats.entries` 相等、第 3 轮估算字节不高于第 2 轮；warm 轮 `hashedFiles === 0`；
  关闭会话后该根下条目归零；四态 `counts` 三轮回合逐项相等。
- 判定函数 `src/memory-gate.ts` 是纯函数，超上限 / 轮次递增 / 会话泄漏 / 轮数不足都返回
  `ok=false` 与非零退出码，并由 `src/memory-gate.test.ts` 的红路径用例覆盖。
- 单次运行在本机约 1.5 秒，远低于 180 秒上限；`.munk/code-gates.json` 的 `memory-gate`
  一项就是 `pnpm test:memory`（单 argv）。

## 3. 阈值与判定

档位上限集中在 `perf/profiles.json`，判定函数单点实现于
`src/shared/perf/verdict.ts`，真实档与门禁档共用：

| 档位 | renderer ready 峰值 | app 总峰值 | +settle 静置 renderer | 第 3 轮 renderer 增量 |
| --- | --- | --- | --- | --- |
| `real` | ≤ 1.5 GiB (1610612736 B) | ≤ 2.5 GiB (2684354560 B) | ≤ 1300 MiB (1363148800 B) | ≤ min(100 MiB, max(30% × Δ1, 25 MiB)) |
| `gate` | ≤ 1.0 GiB (1073741824 B) | ≤ 2.0 GiB (2147483648 B) | ≤ 1.0 GiB (1073741824 B) | 同上 |

- `Δ1` = 第 1 轮 post-round renderer RSS − 启动后基线 renderer RSS。
- `Δ3` = 第 3 轮 post-round renderer RSS − 第 2 轮 post-round renderer RSS；**只对
  `upsert` 模式生效**。`multisession` 每轮多一个真实 tab，增长是应有状态，不套该规则。
- `renderer-round-peak`：任一轮窗口内 renderer 采样峰值（`rounds[].roundPeak`）超过
  `rendererPeakBytes`。
- `renderer-settle`：末轮后 `--settle` 静置值（`settle.renderer`）超过 `settleRendererBytes`；
  `settle-missing` 表示整轮没有产生静置采样。
- 实际生效的增量阈值写入 `verdict.appliedThresholds.appliedRoundDeltaBytes`；任一峰值 /
  静置 / 结构断言超限时 `verdict.ok=false`，`violations` 列出对应 id。
- 采样缺失、为 0 或拿不到 renderer/main 进程号时记为 `invalid-sample`，无论是否带
  `--fail-on-violation` 都以非零退出。
- 带 `--fail-on-violation` 且证据违规时退出码非零，证据文件仍然完整写出。
- **结构断言**（`holds[]`，强制 GC 后计数）：`upsert` 每轮（含 settle）`comparisons=1`、
  `tabs=1`；`multisession` 第 i 轮（含 settle 归到末轮）`comparisons=i`、`tabs=i`；任一
  读数 `rowModels>2` 或 `gc=false` 都判红。
- 阈值调整必须同时改 `perf/profiles.json` 并在证据/提交说明里解释，不允许为了变绿放宽。

## 4. 证据字段与口径

证据是单个 JSON（原子写：先写同目录临时文件再 rename），单次 < 5 MB。顶层字段：

| 字段 | 含义 |
| --- | --- |
| `schema` | 固定 `opencompare.perf.directory/v1`（本轮为加法扩展，字段只增不改） |
| `generatedAt` | 证据生成时间（ISO-8601） |
| `appPid` | 唯一应用实例的主进程 PID；所有轮次都在它里面完成 |
| `commit.sha` / `commit.dirty` | 运行目录的 `git rev-parse HEAD` / `git status --porcelain` 是否非空 |
| `mode` | `upsert` 或 `multisession` |
| `pairs[]` | 本次运行的 `left` / `right` 根，按命令行顺序 |
| `roots.left` / `roots.right` | 第一对根（兼容旧字段），多对时以 `pairs` 为准 |
| `profile` | 使用的档位（`real` / `gate`） |
| `sampling.intervalMs` / `sampling.settleMs` | 周期采样间隔与末轮静置等待 |
| `memoryDefinition` | RSS 口径字符串（见下） |
| `counts.files` / `counts.dirs` | 最后一轮对比树中的文件/目录节点数（按相对路径取并集） |
| `counts.hashedFiles` / `counts.bytesToHash` | 所有轮次里 `platform.digestFiles` **实际成功哈希**的文件数与字节数之和；命中缓存而零哈希的轮次如实累加 0 |
| `rounds[]` | 每轮 `index / startedAt / endedAt / wallMs / sessionId / tabs / counts / rendererRss / roundPeak / appTotalRss / rendererPid` |
| `totalWallMs` | 第一轮开始到最后一轮结束的总墙钟 |
| `env` | `os`=`os.release()`、`arch`、`cpuModel`/`cpuCount`=`os.cpus()`、`totalMemBytes`=`os.totalmem()`、`node`、`electron`，均为运行期真实探针 |
| `samples[]` | `label / phase / round / at / rss{renderer,main,appTotal} / pids{renderer,main}` |
| `peaks` | ready/round/periodic 采样中的 renderer / main / appTotal 最大值（**不含** `settle`） |
| `settle` / `settleAt` | 末轮后静置结束时的单次 RSS 读数与时间；`null` 表示本次没有静置采样 |
| `holds[]` | 强制 GC 后的结构登记：`label / round / tabs / comparisons / rowModels / gc` |
| `roundDeltas[]` | 每轮相对上一轮 post-round 的 renderer / appTotal 增量（第 1 轮相对启动基线） |
| `verdict` | `ok` / `violations[]` / `appliedThresholds`（含 `settleRendererBytes`） |
| `error` | 仅当测量本身失败时存在，此时 `verdict.ok=false` |

RSS 口径（同时写入证据 `memoryDefinition`）：

- `renderer` = `app.getAppMetrics()` 中 `type === 'Tab'` 的进程里 `workingSetSize` 最大者；
- `main` = `type === 'Browser'` 的主进程；
- `appTotal` = 所有上报进程 `workingSetSize` 之和；
- KB → bytes 由采样层转换，禁止用 renderer JS heap 估算。

采样点（`phase` / `label`）：

- `startup` / `startup-baseline`：窗口与 renderer 就绪后的启动基线；
- `boundary` / `round-<n>-start`、`round-<n>-end`：轮次边界；
- `pre-round` / `round-<n>-pre`：每轮扫描开始前；
- `post-round` / `round-<n>-post`：每轮会话构造完成、新树已上屏后；
- `periodic` / `periodic-r<n>-*`：运行期按 `sampling.intervalMs` 的周期采样；
- `settle` / `settle`：末轮后等待 `sampling.settleMs`、强制 GC 之后的一次读数。

每轮至少各有 1 条 `pre-round` 与 `post-round`，轮次边界成对出现；某轮 `wallMs` 越长，其周期
采样条数相应覆盖 `floor(wallMs / interval) - 1` 以上。

## 5. 有界摘要缓存与跨轮释放

### 5.1 默认上限

摘要缓存 `ComparisonCache`（`src/core/directory/compare.ts`）继续由 `Workbench` 的
`useRef` 单例持有，跨会话复用；上限集中在这两个导出常量：

| 常量 | 取值 | 含义 |
| --- | --- | --- |
| `DEFAULT_COMPARISON_CACHE_MAX_ENTRIES` | `200000` | 条目数上限 |
| `DEFAULT_COMPARISON_CACHE_MAX_BYTES` | `134217728`（128 MiB） | 估算字节上限 |
| `COMPARISON_CACHE_ENTRY_OVERHEAD_BYTES` | `96` | 每条固定开销 |

估算口径：`estimatedEntryBytes(path, entry) = 96 + 2 × (path.length + entry.hash.length)`，
即固定开销 + 路径与 64 位十六进制摘要按 UTF-16 字符计的字节数。它是**估算**，用于容量
判定，不是堆内存测量；真实两目录一次完整对比约 7.8 万条、估算约 40 MiB，低于两项上限，
因此 warm 轮仍可全部命中。

### 5.2 淘汰策略

- `cache.hashes` 的 `Map` 插入顺序即最近使用顺序（最旧在前）。`cache.get` 命中后把条目
  移到队尾（LRU touch），未命中计入 `misses`；`cache.set` 先按路径覆盖旧条目，再按新值
  计入估算字节，最后从队首逐个淘汰，直到条目数与估算字节都不超限。
- 单条自身就超过字节预算时也会保留刚写入的那一条（`hashes.size > 1`），不会用「整体清空」
  规避上限，因此 `stats.entries > 0` 恒成立。
- 一次对比在 run 期持有 **hold**：对比从扫描到分类结束之间不因容量淘汰自己刚算出的摘要，
  避免「摘要阶段算完、分类阶段已被淘汰」导致结果不确定；对比结束（成功或失败）立即重新
  应用上限。跨轮/跨会话的上限语义由这个边界保证。
- 关闭或替换目录会话走 `releaseDirectoryComparison`（`directoryCompare.ts`）：显式淘汰该
  会话 `leftRoot` / `rightRoot` 下的条目，但跳过仍被其它活动会话使用的根；不依赖 GC 时机。
  重新对比同一对目录时新会话仍持有同一批根，因此缓存保持温暖。
- 淘汰只影响「是否重哈希」：被淘汰的条目在下一轮回落到真实读取 / 真实摘要，四态 `counts`
  与每个节点 `status` 不变（`pnpm test:memory` 的 `maxEntries: 1` 用例即此断言）。
- **历史盲区（已修）**：旧 harness 在每轮 `onRoundStart` 之前显式释放上一轮会话，且只渲染一行
  文字、不建任何视图，所以它**从未覆盖真实 UI 的持有路径**（React fiber props / 虚拟列表
  闭包）。旧口径下的“峰值”只反映扫描 / 分类 / 缓存，不反映屏幕上真实持有的结果树与行模型；
  本次之后不得再用旧口径解释 UI 峰值。行模型仍只在激活的 `DirectoryView` 内构建
  （`buildDirectoryRowModel` 只对屏幕上的会话调用），`PerfRoundReport` 只保留标量计数。

### 5.3 真实 UI 持有路径的释放（本轮修复）

旧实现下真实 UI 的三条持有链（诊断报告 §9）已按提交路径消除：

1. **`DirectoryView` 视图 key**：`directoryViewKey(session)` = 会话 id + comparison 单调
   修订号（`directoryComparisonKey`，`WeakMap` 登记、不延长寿命）。同 tab 重新对比
   （`upsertSession`）、同步后 `replaceSession`、切 tab 都会换 key，React 在**提交阶段**
   卸载旧 `DirectoryView` / `TreeView` 子树与旧 `useVirtualizer` 实例，旧 comparison 与旧
   行模型随之不可达，不依赖 GC 时机。
2. **会话列表语义单点**：`workbench/sessionStore.ts` 的 `upsertSessions` / `replaceSessions` /
   `closeSessions` / `commitUpsert` 同时被 `Workbench` 与 perf harness 使用；替换时仍按
   「新会话仍使用同一批根」保留热缓存（`hashedFiles=0`）。
3. **实测结构**：`holds[]` 在每轮结束与 settle 后强制 GC 两次再计数。修复后
   `upsert` 每轮恒 `comparisons=1 / rowModels=2 / tabs=1`；`multisession` 为
   `1→2→3` 份 comparison 且仅激活 tab 的 2 份行模型。修复前同类测量为 5 轮后仍持 3 份
   comparison / 4 份 row model（诊断报告附录 B）。

> 强制 GC 需要 renderer 内的 `globalThis.gc`。harness 启动时（且仅在
> `--perf-harness` + `OPENCOMPARE_PERF=1` 下）于 app ready 前安装
> `--js-flags=--expose-gc`；若该能力不可用，`holds[].gc=false` 直接判 `hold-unmeasured`
> 红，绝不静默跳过。普通启动不加该开关。
>
> **红路径自证（不恒绿）**：`src/renderer/src/perf/perfShell.test.tsx` 同时跑「带 key」与
> 「不带 key」两条渲染路径，后者断言旧 comparison / 旧 `rows` 仍可达；`verdict.test.ts`
> 断言 `holds.comparisons=2` / `rowModels>2` / `gc=false` 必红。命令级复现：临时删掉
> `PerfRunner` 里 `key={directoryViewKey(active)}` 后执行 `pnpm perf:gate`，本次实测退出码 1，
> `perf: violations -> hold-row-models, hold-comparisons`。

### 5.4 双列口径：ready 峰值 vs +settle 静置

**禁止只给单一内存数字**。两者独立判定：

| 列 | 证据字段 | 含义 | 判定 |
| --- | --- | --- | --- |
| ready 峰值 | `rounds[].roundPeak`（逐轮窗口峰值）、`peaks.renderer` | 新树已上屏、未强制 GC | ≤ 档位 `rendererPeakBytes` |
| +settle 静置 | `settle.renderer` | 末轮后等待 `--settle`（默认 20 s）再强制 GC | ≤ 档位 `settleRendererBytes` |

`peaks` 明确排除 `settle` 采样，避免把静置值混进峰值；`roundPeak` 取该轮窗口内所有采样
（boundary / pre / post / periodic）的 renderer 最大值。`gate` 档的静置上限等于其峰值上限
（数据集小，结构断言的“牙齿”在 `holds`），`real` 档为 1300 MiB。

### 5.5 本次实测（harness，2026-10-23）

环境：macOS arm64，Electron 37.10.3，工作区为本次改动（`electron-vite build` 产物，非
签名打包产物）。目录对 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`
（752,479 文件 / 97,565 目录，只读）。

**(a) `pnpm perf:gate`（gate 档，单次运行两个模式）通过**
（证据：`/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/perf-evidence-113057fa/perf-gate-2026-10-23T05-13-07-782Z-upsert.json`
与 `…-multisession.json`）：

| 模式 | 轮次 tabs | ready 峰值（B） | 逐轮 roundPeak（B） | settle（B） | holds（comparisons/rowModels） |
| --- | --- | ---: | --- | ---: | --- |
| `upsert` 5 轮 | 1/1/1/1/1 | 180,371,456 | 146,456,576 / 165,642,240 / 173,703,168 / 178,110,464 / 180,371,456 | 179,060,736 | 1/2 × 6（含 settle） |
| `multisession` 3 会话 | 1/2/3 | 195,346,432 | 146,259,968 / 166,019,072 / 195,346,432 | 194,281,472 | 1/2、2/2、3/2、3/2 |

**(b) 真实两目录 `upsert` 5 轮（`real` 档，`--settle 20000`）通过**
（证据：`/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/perf-evidence-113057fa/dawnchat-zenmind-upsert-5rounds.json`）：

| 轮次 | 墙钟 ms | hashedFiles | ready 峰值 (B) | +20 s 静置（末轮后单次） |
| --- | ---: | ---: | ---: | ---: |
| 1 | 21,426 | 76,604 | 724,795,392 | — |
| 2 | 8,029 | 0 | 1,300,283,392 | — |
| 3 | 8,570 | 0 | 1,355,038,720 | — |
| 4 | 8,574 | 0 | 1,359,626,240 | — |
| 5 | 8,527 | 0 | 1,392,099,328 | 739,819,520 |

- 峰值：renderer `1,392,099,328` B（1,327.6 MiB，上限 1,610,612,736 B）；app 总
  `1,868,824,576` B（1,782.3 MiB，上限 2,684,354,560 B）；`settle.renderer` 705.5 MiB
  （上限 1,363,148,800 B）。
- `holds`：6 次读数（round-1…5 + settle）全部 `comparisons=1 / rowModels=2 / tabs=1 /
  gc=true`。
- 热轮 8.0–8.6 s、`hashedFiles=0`，未回到 ~20 s；`verdict.ok=true`。
- 对照诊断报告（修复前）：同为 5 轮 upsert 的 ready 峰值 701 / 1321 / 1680 / 1708 / 1726
  MiB、+20 s 静置 1244–1275 MiB、静置仍持 3 份 comparison + 4 份 row model。修复后第 3–5 轮
  不再越线，静置回落约 504–570 MiB，持有份数回到 1 份。

**(c) 真实两目录 `multisession` 3 会话（`real` 档）如实记录为部分越线**
（证据：`/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/perf-evidence-113057fa/dawnchat-zenmind-multisession.json`）：

| 轮次 | tabs | 墙钟 ms | hashedFiles | ready 峰值 (B) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 19,958 | 76,604 | 775,045,120 |
| 2 | 2 | 8,324 | 0 | 1,288,372,224 |
| 3 | 3 | 14,858 | 38,302 | 1,618,231,296 |

- `holds`：`1/2`、`2/2`、`3/2`、settle `3/2`，`gc=true`——3 份 comparison 是 3 个真实 tab
  的应有状态，行模型仍只有激活 tab 的 2 份（修复前为 4 份）。
- `settle.renderer = 1,266,008,064` B（1,207.4 MiB，≤1300 MiB），app 总峰值
  `2,154,020,864` B（≤2.5 GiB）。
- **ready 峰值 `1,618,231,296` B 超过 `real` 档 `1,610,612,736` B 7,618,560 B（7.3 MiB，
  0.47%）**，`verdict.violations = ["renderer-peak", "renderer-round-peak"]`。第 3 轮
  还额外哈希 38,302 个文件（第三对根是 `links/left` 别名，路径前缀不同 → 不能复用缓存），
  该轮的扫描/哈希临时对象是峰值的主要增量；静置后回落到 1,207 MiB。剩余持有为 3 份**应有**
  并发 comparison + 1 份激活 tab 行模型，未发现新的历史残留链。该数字按
  `ac-honest-if-still-over` 如实记录，不放宽档位、不缩缓存。

> 打包 app + 原样 CDP 脚本（`repeat.mjs` / `multisession.mjs`）的 L3 复测由产品负责人在
> Ops 阶段执行，证据落仓库外；上表 (b)(c) 是同一 renderer 代码在 `perf:dir` 口径下的实测，
> 不替代也不改写 L3 结论。

## 6. 已归档的真实取证

`docs/perf/evidence/` 下保存一次真实两目录（非内置样本）实跑生成的证据 JSON。当前归档见
该目录文件名中的日期与 `roots`；若未跑满 3 轮，文件中 `rounds.length` 与 `error`/文档说明
如实记录已完成轮次与原因，禁止填充或估算数字。

### 6.1 2026-10-22 真实两目录取证（改动前基线）

> 本节是 `memory-harness` 落地时的**改动前基线**（有界缓存与跨轮释放之前），保留原文
> 以避免重写历史。

命令（实际执行）：

```bash
pnpm perf:dir \
  --left /Users/zhutao/Cursor/DawnChat \
  --right /Users/zhutao/Cursor/ZenMind \
  --rounds 2 \
  --interval 1000 \
  --out docs/perf/evidence/dawnchat-zenmind-20261022.json
```

环境与规模（证据原文）：

- OS `24.6.0` / arm64 / Apple M3 Max / 16 核 / 137438953472 B 物理内存；
  Node `22.21.1`（Electron 内置）/ Electron `37.10.3`。
- `commit.sha = abd32e514d4ad95ad83252422b0142f1e564b3c5`，工作区 `dirty=true`（本项改动未提交）。
- 对比树：1,338,294 个文件、185,460 个目录；第 1 轮实际哈希 77,950 个文件 /
  11,454,904,514 B，第 2 轮命中已有缓存、实际哈希 0 个文件 / 0 B。
- 墙钟：第 1 轮 25,310 ms，第 2 轮 12,648 ms，总 37,961 ms。
- RSS：renderer 峰值 1,960,394,752 B，main 峰值 420,462,592 B，app 总峰值
  2,505,654,272 B；两轮 post-round renderer 分别为 1,092,435,968 B 与
  1,960,394,752 B。
- 采样 46 条（startup 1、pre-round 2、post-round 2、boundary 4、periodic 37）。

判定：`verdict.ok=false`，`violations=["renderer-peak"]`——renderer 峰值 1.96 GB 超过真实档
1.5 GB；app 总峰值 2.51 GB 未超过 2.5 GiB（2,684,354,560 B）。这是有界缓存与会话释放
落地前的基线，用于对照后续修复结果。

仅跑 2 轮的原因：第 2 轮 post-round 已超过 renderer 峰值上限，而 `Δ3` 规则需要第 3 轮。
上述数字全部来自归档证据文件，未做任何估算。

### 6.2 2026-10-22 真实两目录 3 轮取证（修复后）

命令（实际执行，干净工作区）：

```bash
pnpm perf:dir \
  --left /Users/zhutao/Cursor/DawnChat \
  --right /Users/zhutao/Cursor/ZenMind \
  --rounds 3 \
  --interval 1000 \
  --out docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json
```

环境与规模（证据原文）：

- OS `24.6.0` / arm64 / Apple M3 Max / 16 核 / 137438953472 B 物理内存；
  Node `22.21.1`（Electron 内置）/ Electron `37.10.3`。
- `commit.sha = 0d48c817dc81752428a2a4bf52f4e47ec589bea3`，工作区 `dirty=false`；证据文件
  在本次运行后写入，运行开始时的 HEAD 即上述提交。
- 对比树：752,479 个文件、97,565 个目录（不跟随符号链接口径）。第 1 轮实际哈希
  76,604 个文件 / 11,105,870,346 B；第 2、3 轮命中已有缓存，实际哈希 0 个文件 / 0 B。
- 同一应用实例 `appPid = 66492`，三轮 `rendererPid = 66513`；采样 54 条
  （startup 1、pre-round 3、post-round 3、boundary 6、periodic 41）。
- 墙钟：第 1 轮 22,717 ms，第 2 轮 9,361 ms，第 3 轮 9,547 ms，总 41,630 ms。

RSS（每轮 post-round，字节）：

| 轮次 | renderer | app 总 |
| --- | --- | --- |
| 1 | 737,427,456 | 1,244,807,168 |
| 2 | 1,186,463,744 | 1,702,215,680 |
| 3 | 1,257,750,528 | 1,791,934,464 |

- 峰值：renderer `1,257,750,528` B（1.17 GiB，真实档上限 1,610,612,736 B）、main
  `409,272,320` B、app 总 `1,791,934,464` B（1.67 GiB，上限 2,684,354,560 B）。
- 轮次增量（renderer）：`Δ1 = 633,274,368` B、`Δ2 = 449,036,288` B、
  `Δ3 = 71,286,784` B；实际生效增量阈值 `min(100 MiB, max(30% × Δ1, 25 MiB)) =
  104,857,600` B，`Δ3` 未超限。
- 判定：`verdict.ok = true`，`violations = []`；证据文件
  `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`。

对照 6.1 的改动前基线：renderer 峰值由 `1,960,394,752` B 降到 `1,257,750,528` B（−702,644,224 B），
app 总峰值由 `2,505,654,272` B 降到 `1,791,934,464` B（−713,719,808 B）。第 2、3 轮的
renderer RSS 仍高于第 1 轮，但两轮之差 `Δ3` 已降到 68 MiB，进入阈值内且不再是线性抬升：
第 2 轮增量 `449,036,288` B 与「首次全量扫描 / 哈希后的进程驻留内存（V8 未立即回收的临时
对象与堆扩容）」的形态一致（本轮未对该增量做单独归因测量），而第 3 轮仅 `71,286,784` B，
说明增量已收敛而不是逐轮等比增长。上述数字全部来自归档证据文件，未做任何估算；若后续重跑，保留本
文件并按时间命名新文件，不覆盖历史证据。
