# 大目录多轮内存测量与上限门

本文覆盖 **测量入口 / 自动门禁 / 有界缓存与跨轮释放** 三部分。接口与证据字段以代码
`src/shared/perf/types.ts` 为准；缓存上限常量与淘汰实现在 `src/core/directory/compare.ts`。

## 1. 一条命令测量真实两目录

```bash
pnpm perf:dir \
  --left /Users/zhutao/Cursor/DawnChat \
  --right /Users/zhutao/Cursor/ZenMind \
  --rounds 3 \
  --out docs/perf/evidence/dawnchat-zenmind-$(date +%Y%m%d-%H%M%S).json
```

- `pnpm perf:dir` 先执行 `electron-vite build`，再启动真实 Electron 应用（真实主进程 +
  真实 renderer）；轮次编排在渲染进程里走 UI 同一条 `compareSides` → `scanDirectory` →
  `compareDirectories` → `platform.digestFiles` → `createDirectorySession` 路径。
- 每次调用都在**同一个应用实例/同一个 renderer 进程**内连续跑完 N 轮；采样与证据落盘由主
  进程完成。
- 显式开关：`perf:dir` 包装脚本会带上 `--perf-harness` 并设置 `OPENCOMPARE_PERF=1`。只有
  **两者同时存在**才进入测量模式；普通启动（包括普通的 `--left/--right` 对比）零行为变化，
  不采样、不写证据。
- 必填：`--left`、`--right`、`--out`。可选：`--rounds`（默认 3）、`--interval`（周期采样
  毫秒，默认 1000，上限 2000）、`--profile`（`real` / `gate`，默认 `real`）、
  `--fail-on-violation`。
- 缺少必填参数、未知参数、`--rounds` 非正整数、根目录不存在或不可读时，进程以非零退出，
  stderr 指明具体参数或路径，并且不会写出“成功”证据文件。
- 运行失败（renderer 崩溃、窗口提前关闭、超时）仍会写出带 `error` 且 `verdict.ok=false` 的
  部分证据，退出码非零。

## 2. 门禁命令

```bash
pnpm perf:gate
```

- 在系统临时目录生成真实落盘数据集（运行结束即删除）：每侧 6,000 个文件、总内容
  ≥100 MiB、`d0/.../d4` 五层嵌套、每 50 个文件一处“同大小不同内容”、左右各含指向文件 /
  目录 / 悬空目标的符号链接。不使用 `src/shared/fixtures/` 或 `/samples`。
- 用 `gate` 档跑 3 轮真实哈希；证据 `roots` 指向本次临时目录。
- 单次运行（含 `electron-vite build`）目标 ≤ 3 分钟；进程超时或阈值不通过均以非零退出，
  输出被违反的阈值 id。
- `.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`。

还有一条更轻的门禁，只断言**缓存规模与多轮不增长**，不启动 Electron：

```bash
pnpm test:memory
```

- 在系统临时目录生成真实落盘数据集（每侧 1,250 个文件、共 2,500 个文件、约 24.4 MiB
  内容、`d0/d1/bucket-*/` 两层嵌套、每 25 个文件一处同大小不同内容、左右各一个单侧文件），
  用 `fs` 真实列目录、真实流式 SHA-256 跑 3 轮，结束后删除数据集；不使用
  `src/shared/fixtures/` 或 `/samples`。
- 断言每轮 `stats.entries <= maxEntries`、`stats.estimatedBytes <= maxBytes`；第 2 与第 3 轮
  结束后的 `stats.entries` 相等、第 3 轮估算字节不高于第 2 轮；warm 轮 `hashedFiles === 0`；
  关闭会话后该根下条目归零；四态 `counts` 三轮回合逐项相等。
- 判定函数 `src/memory-gate.ts` 是纯函数，超上限 / 轮次递增 / 会话泄漏 / 轮数不足都返回
  `ok=false` 与非零退出码，并由 `src/memory-gate.test.ts` 的红路径用例覆盖。
- 单次运行在本机 < 5 秒，远低于 180 秒上限；`.munk/code-gates.json` 的 `memory-gate`
  一项就是 `pnpm test:memory`（单 argv）。

## 3. 阈值与判定

档位上限集中在 `perf/profiles.json`，判定函数单点实现于
`src/shared/perf/verdict.ts`，真实档与门禁档共用：

| 档位 | renderer 峰值 | app 总峰值 | 第 3 轮 renderer 增量 |
| --- | --- | --- | --- |
| `real` | ≤ 1.5 GiB (1610612736 B) | ≤ 2.5 GiB (2684354560 B) | ≤ min(100 MiB, max(30% × Δ1, 25 MiB)) |
| `gate` | ≤ 1.0 GiB (1073741824 B) | ≤ 2.0 GiB (2147483648 B) | 同上 |

- `Δ1` = 第 1 轮 post-round renderer RSS − 启动后基线 renderer RSS。
- `Δ3` = 第 3 轮 post-round renderer RSS − 第 2 轮 post-round renderer RSS。
- 实际生效的增量阈值写入 `verdict.appliedThresholds.appliedRoundDeltaBytes`；任一峰值或
  `Δ3` 超限时 `verdict.ok=false`，`violations` 列出 `renderer-peak` / `app-total-peak` /
  `round-delta`。
- 采样缺失、为 0 或拿不到 renderer/main 进程号时记为 `invalid-sample`，无论是否带
  `--fail-on-violation` 都以非零退出。
- 带 `--fail-on-violation` 且证据违规时退出码非零，证据文件仍然完整写出。
- 阈值调整必须同时改 `perf/profiles.json` 并在证据/提交说明里解释，不允许为了变绿放宽。

## 4. 证据字段与口径

证据是单个 JSON（原子写：先写同目录临时文件再 rename），单次 < 5 MB。顶层字段：

| 字段 | 含义 |
| --- | --- |
| `schema` | 固定 `opencompare.perf.directory/v1` |
| `generatedAt` | 证据生成时间（ISO-8601） |
| `appPid` | 唯一应用实例的主进程 PID；所有轮次都在它里面完成 |
| `commit.sha` / `commit.dirty` | 运行目录的 `git rev-parse HEAD` / `git status --porcelain` 是否非空 |
| `roots.left` / `roots.right` | 实际测量的两个根目录 |
| `profile` | 使用的档位（`real` / `gate`） |
| `sampling.intervalMs` | 周期采样间隔，默认 1000 |
| `memoryDefinition` | RSS 口径字符串（见下） |
| `counts.files` / `counts.dirs` | 最后一轮对比树中的文件/目录节点数（按相对路径取并集） |
| `counts.hashedFiles` / `counts.bytesToHash` | 所有轮次里 `platform.digestFiles` **实际成功哈希**的文件数与字节数之和；命中缓存而零哈希的轮次如实累加 0 |
| `rounds[]` | 每轮 `index / startedAt / endedAt / wallMs / sessionId / counts / rendererRss / appTotalRss / rendererPid` |
| `totalWallMs` | 第一轮开始到最后一轮结束的总墙钟 |
| `env` | `os`=`os.release()`、`arch`、`cpuModel`/`cpuCount`=`os.cpus()`、`totalMemBytes`=`os.totalmem()`、`node`、`electron`，均为运行期真实探针 |
| `samples[]` | `label / phase / round / at / rss{renderer,main,appTotal} / pids{renderer,main}` |
| `peaks` | 所有采样中的 renderer / main / appTotal 最大值 |
| `roundDeltas[]` | 每轮相对上一轮 post-round 的 renderer / appTotal 增量（第 1 轮相对启动基线） |
| `verdict` | `ok` / `violations[]` / `appliedThresholds` |
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
- `post-round` / `round-<n>-post`：每轮会话构造完成后；
- `periodic` / `periodic-r<n>-*`：运行期按 `sampling.intervalMs` 的周期采样。

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
- 行模型仍只在激活的 `DirectoryView` 内构建（`buildDirectoryRowModel` 只对屏幕上的会话
  调用）；测量 harness 在每轮 `onRoundStart` 之前显式释放上一轮会话，`PerfRoundReport`
  只保留标量计数。

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
