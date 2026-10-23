# v0.2.6 公开包 upsert / 3 会话并发 ready 内存峰值只读诊断

- 日期：2026-10-23（Asia/Shanghai, UTC+08:00）
- 被测包：公开 v0.2.6（tag `v0.2.6` → commit `30967cd1e8fd521fa517588b2a7ac503305797e5`）
- 性质：**只读诊断**。未改 `src/`、`package.json`、`.munk/code-gates.json`、README/CHANGELOG、`electron-builder.yml`、`docs/release*` 或任何发布文件；未打包、未 push、未打 tag。唯一仓库交付物是本文件。
- 结论先行：**v0.2.6 复现了 ready 峰值越过 renderer 1536 MiB 阈值**（组①第 3–5 轮、组②第 3 个 tab），但属 **React fiber ref / 虚拟列表闭包持续持有历史对比**造成的“多份并存”峰值：第 2 轮 ready 有 2 份 comparison，5 轮静置后仍保留 3 份（2 份历史 + 1 份当前）；+20 s 静置全部低于 1300 MiB，app 总 RSS 低于 2560 MiB，未崩溃，保留上限有界（不随轮次继续增长）。热跑 8.5–10.0 s，未退回 ~20 s。按 §10 推荐 **a**。

---

## 1. 机器负载与采样起止

机器：Mac15,9 / Apple M3 Max / 16 核 / 128 GiB / macOS 15.6.1（Darwin 24.6.0）。

| 阶段 | 时间（ISO, +08:00） | loadavg（1/5/15 min） | 当时 top CPU |
| --- | --- | --- | --- |
| 预检（下载/挂载/校验，不计入采样） | 11:50:21 | 9.19 / 5.12 / 4.68 | — |
| **组①采样开始** | **11:53:04.348** | 4.35 / 5.13 / 4.80（11:53:12） | WindowServer 44.5%、Munk AI Helper (Renderer) 34.2%、mdworker_shared ~12.3%（11:52:36） |
| 组②采样开始 | 11:56:51.925 | 4.96 / 4.91 / 4.77（11:56:54） | 同上量级（未再变化） |
| 堆快照阶段 | 11:59:34 – 12:14:02.338 | 4.3–5.0 区间 | 被测 app + 快照序列化进程 |
| **采样结束**（最后一份快照 after 采样） | **12:14:02.338** | 4.90 / 4.96 / 4.80（11:58:31）；4.72 / 4.33 / 4.21（12:19:32 复查） | opencode serve 59.1%、Chrome 19.8%、WindowServer 11.4%（12:19:32） |
| 补充对照跑（无侧车 repeat，仅墙钟/峰值） | 12:21:07 – 12:24:19 | 与上述同量级 | — |

隔离核对：

- 采样窗口内**没有** `pnpm build` / `vitest` / `electron-vite` / `perf:gate` / `test:memory` / 其它 OpenCompare QA 进程；组间均 `pgrep -fl OpenCompare` 确认无残留后才启动下一实例（每个实例独立 `--user-data-dir` 与端口）。
- 机器上长期存在但**空闲**的进程已记录：若干 `pnpm dev:web` / `preview:web` Vite dev server、一个 Android 模拟器（qemu，~4% CPU）、Chrome、Cursor、Munk AI 自身。它们不是构建或门禁任务，未与采样并发；见 `evidence/00-sampling-env-post.json`。
- **局限**：这些后台进程使 loadavg 基线在 4–5 而非 0，报告中的所有墙钟、峰值都在这台“非独占但无构建/门禁”的机器上测得。

## 2. 被测包

| 项 | 值 |
| --- | --- |
| Release URL | `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64.dmg` |
| dmg 本地路径 | `/Users/zhutao/Library/Application Support/Munk AI/munk-auto/artifacts/opencompare-v026-diagnosis/OpenCompare-0.2.6-arm64.dmg` |
| dmg sha256 | `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c` ✅ 与要求逐字一致 |
| dmg 字节数 | 113,412,984 B ✅ |
| tag → commit | `v0.2.6` → `30967cd1e8fd521fa517588b2a7ac503305797e5` ✅ |
| `CFBundleShortVersionString` | `0.2.6` ✅ |
| `codesign --verify --deep --strict` | 通过（rc=0）✅ |
| `spctl -a -vv` | `accepted`，`source=Notarized Developer ID`，`Developer ID Application: Tao Zhu (3X4J53U6RY)` ✅ |
| `app.asar` sha256 | `242ae3fd442009cf378ec3384444a112e567bfc4da8b680da46fa60cb5b0741e` |
| 运行副本 | `/tmp/oc-v026-app-1148/OpenCompare.app`（由 0.2.6 dmg 用 `ditto` 拷出，未改动） |
| UA 版本 | `opencompare/0.2.6`（`/json/version` 与页面 `navigator.userAgent` 双证） |

原始驱动脚本按 PRD 要求直接从只读源目录执行、运行前后 sha256 不变：

| 文件 | sha256（运行前后一致） |
| --- | --- |
| `repeat.mjs` | `f9459e101fb365ea5d75492371bb027cf51de525deb73ecdfc66124b9d0f60a6` |
| `multisession.mjs` | `db043614c7a9278e525bc6d541c4fe4e60bb2a3c780a2ec44a874170ea9aa0df` |
| `lib.mjs` | `731ca6d9dfe237ce402b22dbba1d87a437a44d96c17eb5b9ed9c211d6576852f` |

> 原脚本硬编码的 `schema: opencompare.perf.v025-*`、`app: /tmp/oc-v025-clean/...`、`appAsarUnchanged: true`、`expectedVersion/uaVersionOk = '0.2.5'` 和 `EXPECTED` 四态常量**不构成本次版本证据**；版本判定只引用本节 dmg sha256 / app 版本 / app.asar sha256 / codesign / spctl / commit（见 `evidence/00-preflight-v026.json`）。

## 3. 组①：同会话 upsert 5 轮

条件：单实例、单 `--user-data-dir`、不关会话；目录对固定为 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`；5 轮四态全部为 `same 38542 / added 701232 / deleted 6827 / modified 5878 / sourceFiles 51247 / targetFiles 745652 / diffs 713937`，tab 数恒为 1，renderer PID 恒为 48644（`allRoundsReady=true`、`blockedAt=null`）。

主表（原 `repeat.mjs` + 只读侧车；1 s 侧车采样给出 DOM/heap limit/hashedFiles 与 submit→ready 窗口峰值，20 s 收敛值取该轮静置快照）：

| 轮次 | ready 墙钟 (ms) | ready 峰值 (B) | ready 峰值 (MiB) | +20 s 收敛 (B) | +20 s 收敛 (MiB) | DOM 节点 | heap used / limit (B) | app 总 RSS (B / MiB) | hashedFiles | tab | renderer PID |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 22,492 | 735,330,304 | 701.3 | 542,687,232 | 517.6 | 1,215 | 475,220,600 / 3,760,000,000 | 1,105,920,000 / 1054.7 | 76,604 | 1 | 48644 |
| 2 | 8,820 | 1,385,529,344 | 1321.4 | 988,463,104 | 942.7 | 1,179 | 966,596,412 / 3,760,000,000 | 1,841,102,848 / 1755.8 | 0 | 1 | 48644 |
| 3 | 9,069 | 1,761,886,208 | 1680.3 | 1,304,477,696 | 1244.1 | 1,164 | 1,354,048,416 / 3,760,000,000 | 2,225,815,552 / 2122.7 | 0 | 1 | 48644 |
| 4 | 9,325 | 1,790,459,904 | 1707.5 | 1,331,576,832 | 1269.9 | 1,179 | 1,386,696,136 / 3,760,000,000 | 2,257,158,144 / 2152.6 | 0 | 1 | 48644 |
| 5 | 9,402 | 1,809,776,640 | 1725.9 | 1,336,688,640 | 1274.8 | 1,179 | 1,401,441,904 / 3,760,000,000 | 2,279,194,624 / 2173.6 | 0 | 1 | 48644 |
| 终值 +30 s | — | — | — | 1,337,819,136 | 1275.8 | — | 984,544,100 / 3,760,000,000 | 1,802,190,848 / 1718.7 | — | 1 | 48644 |

阈值判定（按字节比较，不按四舍五入后的 MiB）：

| 口径 | 阈值 (B / MiB) | 组①实测最大 (B / MiB) | 判定 |
| --- | ---: | ---: | --- |
| renderer ready 峰值 | 1,610,612,736 / 1536.0 | **1,809,776,640 / 1725.9**（第 5 轮） | **越过**，超 199,163,904 B（189.9 MiB）；第 3 轮起越线 |
| renderer +20 s 静置 | 1,363,148,800 / 1300.0 | 1,336,688,640 / 1274.8 | 未越过，低 26,460,160 B（25.2 MiB） |
| app 总 RSS | 2,684,354,560 / 2560.0 | 2,279,194,624 / 2173.6 | 未越过，低 405,159,936 B（386.4 MiB） |

峰值与收敛**分列**；第 3 轮起 ready 峰值稳定在 1680–1726 MiB、静置稳定在 1244–1275 MiB，最后两轮静置差仅 5 MiB，30 s 终值 1,337,819,136 B——呈平台，不是无界增长。

**静置平台不是单份**：第 5 轮 +30 s 的 heap 仍有 984,544,100 B（938.9 MiB）。对同一状态补做的 settle 快照（`heap/g1-round5-settled.heapsnapshot`）实测 **3 个 `DirectoryComparison`（各 299.0 MiB reachable）+ 4 个 `DirectoryRowModel`**，即静置平台 = 3 份树（约 897 MiB）+ 30.5 MiB 缓存；保留上限是“当前 1 份 + 历史 2 份”，不会随轮次继续增长。

补充对照（同一原脚本、**不挂侧车**，用于量化侧车对墙钟的干扰）：ready 墙钟 21,641 / 8,537 / 8,597 / 8,908 / 10,026 ms；ready 峰值 705.8 / 1336.3 / 1675.9 / 1722.9 / 1675.3 MiB；+20 s 收敛 518.9 / 938.1 / 1247.6 / 1269.4 / 1270.7 MiB；30 s 终值 1270.7 MiB；app 峰值 2,299,772,928 B（2193.2 MiB）。热点轮（2–5）侧车均值 9,154 ms vs 无侧车均值 9,017 ms，**侧车干扰 ≈ +1.5%**（冷启动轮 +3.9%），均低于 10%，因此未另建 instrumented 驱动。

> 口径说明：驱动内置 2 s RSS 采样会低估峰值（例如第 2 轮驱动峰值 1,125,498,880 B，而 1 s 侧车在同一 submit→ready 窗口采到 1,385,529,344 B），因此主表峰值取 1 s 侧车；无侧车对照（只有 2 s 采样）的峰值另行列出。

`hashedFiles` 口径：采样时刻 `ComparisonCache.stats.misses` 在“本轮 submit 前最后样本 → ready 后首个样本”之间的增量。第 1 轮 76,604（首轮全量哈希），第 2–5 轮 **0**（全部命中缓存），这是热跑墙钟不再包含哈希成本的关键。

热跑墙钟对照（历史热跑基线 7.8 s = 7,800 ms）：

| 轮次 | 有侧车主表墙钟 (ms) | 对 7.8 s | 无侧车对照 (ms) | 对 7.8 s | hashedFiles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 8,820 | +13.1% | 8,537 | +9.4% | 0 |
| 3 | 9,069 | +16.3% | 8,597 | +10.2% | 0 |
| 4 | 9,325 | +19.6% | 8,908 | +14.2% | 0 |
| 5 | 9,402 | +20.5% | 10,026 | +28.5% | 0 |
| 2–5 均值 | 9,154 | **+17.4%** | 9,017 | **+15.6%** | 0 |

判定：两套数据都 **<2× 基线**，也**没有回到 ~20 s**；第 5 轮无侧车 10.0 s 是本次最大偏离（+28.5%），仍远低于 2×。热跑没有哈希成本（`hashedFiles=0`），偏离来自扫描/分类/渲染与机器后台负载，而非重新哈希。

## 4. 组②：3 会话并发各一轮（`SKIP_A=1`）

干净启动、`SKIP_A=1`，三个同规模不同根路径的会话 1→2→3，全程不关会话。tab 数依次 1 / 2 / 3（无 upsert 折叠）；第 2 步反向对比只交换新增/删除（6827 / 701232），其余四态与固定值一致。**静置口径：3 个 tab 全部建齐后统一 +20 s，不是每步后各 +20 s。**

| 会话步 | ready 墙钟 (ms) | ready 峰值 (B) | ready 峰值 (MiB) | +20 s 收敛 (B) | +20 s 收敛 (MiB) | DOM 节点 | heap used / limit (B) | app 总 RSS (B / MiB) | hashedFiles | tab 数 | 四态（same/added/deleted/modified） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| 1（DawnChat↔ZenMind） | 22,445 | 727,973,888 | 694.3 | — | — | 1,268 | 475,627,612 / 3,760,000,000 | 1,106,722,816 / 1055.4 | 76,604 | 1 | 38542 / 701232 / 6827 / 5878 |
| 2（反向 ZenMind↔DawnChat） | 8,954 | 1,449,066,496 | 1381.9 | — | — | 1,303 | 1,014,726,560 / 3,760,000,000 | 1,911,635,968 / 1823.1 | 0 | 2 | 38542 / 6827 / 701232 / 5878 |
| 3（符号链接根 /tmp/oc-v026-ms） | 22,487 | 1,799,585,792 | 1716.2 | **1,319,370,752** | **1258.3** | 1,270 | 1,237,941,212 / 3,760,000,000 | 2,273,771,520 / 2168.4 | 76,604 | 3 | 38542 / 701232 / 6827 / 5878 |
| 3 tab 汇总（同一时刻复核） | — | 1,799,585,792 | 1716.2 | **1,319,370,752** | **1258.3** | — | 980,364,452 / 3,760,000,000 | 1,787,936,768 / 1705.1 | — | 3 | 38542 / 701232 / 6827 / 5878 |

阈值判定：

| 口径 | 阈值 (B / MiB) | 组②实测 (B / MiB) | 判定 |
| --- | ---: | ---: | --- |
| renderer ready 峰值（第 3 tab） | 1,610,612,736 / 1536.0 | **1,799,585,792 / 1716.2** | **越过**，超 188,973,056 B（180.2 MiB） |
| renderer +20 s（3 tab 后） | 1,363,148,800 / 1300.0 | 1,319,370,752 / 1258.3 | 未越过，低 43,778,048 B（41.8 MiB） |
| app 总 RSS（第 3 tab） | 2,684,354,560 / 2560.0 | 2,273,771,520 / 2168.4 | 未越过，低 410,583,040 B（391.6 MiB） |

注：组②的 +20 s 收敛值是在 **3 个 tab 全部建齐后统一 +20 s** 采样一次，不是每步后各静置 20 s；因此第 1/2 步不单独给收敛值。ready 峰值与收敛值分列。

第 3 步墙钟回到 22.5 s 是因为符号链接根是**新根路径**，缓存重新哈希 76,604 个文件（hashedFiles=76,604），与“热跑 ~20 s”无关；同根路径的第 2 步是 8.95 s。

## 5. 证据路径

根目录（仓库外）：`/Users/zhutao/Library/Application Support/Munk AI/munk-auto/artifacts/opencompare-v026-diagnosis/`

| 类型 | 绝对路径 | 说明 |
| --- | --- | --- |
| 预检 | `evidence/00-preflight-v026.json` | dmg sha/字节、版本、签名/公证、app.asar sha、commit、机器信息 |
| 负载 | `evidence/00-sampling-env-post.json` | 采样后 loadavg/top CPU |
| 组①驱动 | `evidence/group1-repeat-v026.json`（77,710 B） | 原 `repeat.mjs` 原始输出（5 轮+A+30 s） |
| 组①侧车 | `evidence/sidecar-g1-v026.json`（~3.2 MB） | 1 s 采样 213 条：DOM/heap limit/cache stats/RSS |
| 组①逐轮 | `evidence/group1-rounds-v026.json` | 主表数据（峰值/收敛分列、hashedFiles） |
| 组①对照 | `evidence/group1-repeat-nosidecar-v026.json` | 无侧车原脚本复跑（墙钟干扰量化） |
| 组②驱动 | `evidence/group2-multisession-v026.json`（58,355 B） | `SKIP_A=1` 原始输出 |
| 组②侧车 | `evidence/sidecar-g2-v026.json` | 1 s 采样 97 条 |
| 组②逐会话 | `evidence/group2-steps-v026.json` | 主表数据 + 3 tab 后 20 s |
| 堆快照 | `heap/g1-round1-ready.heapsnapshot`（702,514,205 B） | 组①第 1 轮 ready |
| 堆快照 | `heap/g1-round2-ready.heapsnapshot`（1,242,679,754 B） | 组①第 2 轮 ready（关键证据） |
| 堆快照 | `heap/g2-3tabs-ready.heapsnapshot`（1,878,220,824 B） | 组② 3 tab ready |
| 堆快照（可选 settle） | `heap/g1-round5-settled.heapsnapshot`（1,737,695,005 B） | 组① 5 轮后 +25 s，用于确认静置平台份数 |
| 快照记录 | `evidence/snap-g1-round1.json`、`snap-g1-round2.json`、`snap-g2-3tabs.json`、`snap-g1-round5-settled.json` | 快照前 used / 后 live、fiber 对象身份、cache stats |
| 图分析 | `evidence/graph-g1-round1.json`、`graph-g1-round2.json`、`graph-g2-3tabs.json`、`graph-g1-round5-settled.json` | 流式 nodes/edges/strings 解析 + 引用链 + reachable 估算 |
| 日志 | `logs/repeat-v026.log`、`multisession-v026.log`、`sidecar-g1.log`、`sidecar-g2.log`、`app-g1.log`、`app-g2.log`、`app-s1..s3.log`、`repeat-nosidecar-v026.log` | 驱动/侧车/应用日志 |
| 截图 | `evidence/cdp-v025/30-multi-{1,2,3}-{dialog-filled,ready}.png`、`30-multi-settle-3tabs.png` | 原 `multisession.mjs` 自带的截图 |
| 分析/采样脚本 | `scripts/`（见下表） | 仓库外留证 |

脚本 sha256：

| 脚本 | sha256 | 用途 |
| --- | --- | --- |
| `lib.mjs` | `731ca6d9dfe237ce402b22dbba1d87a437a44d96c17eb5b9ed9c211d6576852f` | 原 `lib.mjs` 的只读副本（与原文件同 sha） |
| `cdp.mjs` | `9452592a90fadb13edbd7eb4ba0349be42600bef854d7efc34d258b29886bcba` | CDP 客户端（含 browser WS + `Target.attachToTarget(flatten)`） |
| `probeExpr.mjs` | `224767ae06ae3cfb64621ed9b762922c129b0ad3801ce1abd470986b43e99124` | 页面探针（DOM/heap/cache/fiber） |
| `sidecar.mjs` | `21e2fc67334d32e97ac9a0975dc80d35284797ee53ce7d7120f87eb2cc4c4a6a` | 1 s 只读侧车 |
| `phases.mjs` | `76445e66ee51ea23e80867a132cbc59c31618cde6385ec9a1fcdfd978113a2e5` | 快照前的单轮流程（复制原流程） |
| `holdsnap.mjs` | `a8d5210376e912b4b639d873ab02a3b41de97cd946587a502b940167c3c2ba02` | 无强制 GC 的堆快照采集 |
| `graph.mjs` | `7e92433a3b539d279b1e8a354a50161717cb7f339aaddbed9fc730a880054108` | 流式堆快照图分析 |
| `derive.mjs` | `9e9441ae93c82c106e45618e51131c462f8059c2273d07a17ca8f6acd1416291` | 驱动 JSON + 侧车合并为逐轮表 |

## 6. 稳定触发条件（可复现命令 + 前置条件）

前置条件：macOS arm64、公开 v0.2.6 dmg（sha256 见 §2）、两目录 `/Users/zhutao/Cursor/DawnChat` 与 `/Users/zhutao/Cursor/ZenMind` 保持只读；每次实例使用全新 `--user-data-dir`；采样窗口内无构建/测试/门禁。

```bash
APP=/tmp/oc-v026-app-1148/OpenCompare.app/Contents/MacOS/OpenCompare
SRC=<上一场 cdp-v025 证据目录>   # repeat.mjs / multisession.mjs / lib.mjs 原文件
EV=<仓库外证据目录>

# 组①：同会话 upsert 5 轮（原文件；侧车另开 browser WS，不占 page WS）
"$APP" --remote-debugging-port=9490 --user-data-dir=/tmp/oc-v026-g1a-ud &
PORT=9490 UD=/tmp/oc-v026-g1a-ud OUT=$EV/sidecar-g1.json node scripts/sidecar.mjs &
EV=$EV PORT=9490 UD=/tmp/oc-v026-g1a-ud RUN_LOG=$EV/logs/repeat.log \
  OUT=group1-repeat-v026.json node "$SRC/repeat.mjs"

# 组②：干净启动 + SKIP_A=1，3 个不同根路径会话
"$APP" --remote-debugging-port=9491 --user-data-dir=/tmp/oc-v026-g2-ud &
EV=$EV PORT=9491 UD=/tmp/oc-v026-g2-ud SKIP_A=1 OUT=group2-multisession-v026.json \
  node "$SRC/multisession.mjs"

# 快照：第 1 轮 ready / 第 2 轮 ready / 3 tab ready
PORT=9492 UD=<ud> OUT=<phase.json> node scripts/phases.mjs round --hold-ms 500
PORT=9492 UD=<ud> OUT=<snap.json> SNAP=$EV/heap/x.heapsnapshot node scripts/holdsnap.mjs
node scripts/graph.mjs $EV/heap/x.heapsnapshot $EV/graph-x.json --deep
```

稳定触发：**同一根路径 upsert 第 3 轮起**，ready 峰值稳定越过 renderer 1536 MiB（有侧车运行 1680/1708/1726 MiB，无侧车对照 1676/1723/1675 MiB）；3 个同规模 tab 的最后一个 ready 同样越过（1716 MiB）。峰值出现在 `submit → ready` 窗口内，并非持续占用；任何一次 5 轮都完整复现，无需挑样本。

门槛判定汇总：

| 场景 | renderer ready 峰值 vs 1536 MiB | 静置 vs 1300 MiB | app 总 vs 2560 MiB |
| --- | --- | --- | --- |
| 组① 5 轮 | 第 3/4/5 轮越过（1680/1708/1726 MiB） | 全部未越过（≤1274.8 MiB） | 全部未越过（≤2173.6 MiB） |
| 组② 3 tab | 越过（1716.2 MiB） | 3 tab 后未越过（1258.3 MiB） | 未越过（2168.4 MiB） |

## 7. 影响面

- 平台与数据规模：macOS arm64、16 核 / 128 GiB，51,247 源文件 ↔ 745,652 目标文件（713,937 差异）。未测 Windows/Linux，未测更小或更大的目录对。
- 用户路径：同一目录对重复“新建对比”（upsert 同一 tab）第 3 轮起；以及 3 个同规模会话并发。首次对比（冷启动）峰值只有 694–706 MiB，不触发。
- 表现：**峰值瞬时** renderer RSS 1.68–1.81 GiB（>内部 1536 MiB 预算），+20 s RSS 回落到 1.25–1.28 GiB；但回落后的 heap 平台仍含 3 份树（983,960,708 B live），即“瞬时峰值”之外还有**持续多占 2 份历史对比**（约 620 MiB）。app 总 RSS 峰值 2.17–2.20 GiB（<2560 MiB）。本次全部运行**无崩溃、无 OOM、无错误日志**，UI 保持可用。
- 风险面：在 8–16 GiB 内存机器上，1.7 GiB 的瞬时 renderer 峰值会放大内存压力（可能触发系统压缩/换页或其它应用被回收）；未观察到崩溃，但不能据此排除低内存设备上的体验退化。3 会话并发的峰值与 5 轮 upsert 同量级。

## 8. 根因候选（按支持强度排序）

### 候选 1（主因）：upsert 期间上一轮结果树与行模型仍被 React fiber / 虚拟列表闭包强引用

- 支持证据（第 2 轮 ready 快照，强制 GC 后仍成立）：
  - 第 1 轮 ready 快照：**1** 个 `DirectoryComparison`、**2** 个 `DirectoryRowModel`；第 2 轮 ready 快照：**2** 个 comparison、**4** 个 row model；**5 轮后 +25 s 的 settle 快照：仍有 3 个 comparison、4 个 row model**。每棵树 reachable 313,560,551 B（299.0 MiB），所有 comparison / row model 均 `reachedRoot=true`。
  - 旧 comparison（节点 5164428）引用链：
    `GC root → … → <div class="min-h-…"> --property:__reactFiber$…--> FiberNode --property:ref--> closure --internal:context--> system/Context --internal:previous--> system/Context --context:comparison--> 旧 DirectoryComparison`
  - 旧 row model（节点 5164363 / 6636354）引用链：
    `… → Object --property:getScrollElement--> closure --internal:context--> Context --context:rows--> 旧 DirectoryRowModel`（`@tanstack/react-virtual` 的 `getScrollElement` / `resolvedOptions` / `applyContainerSize` 闭包链）。
  - 第 2 轮 ready heap 966,596,412 B → +20 s 670,483,932 B 的下降主要是**未回收垃圾被 GC**（快照 live 已是 670,273,360 B = 2 份），并非旧树被释放；第 3 轮起静置 heap 稳定在 984.5 MB，settle 快照确认仍是 **3 份**。因此这是**持续持有最近 2 轮历史对比**（有界），不是“提交后即释放”的瞬时双份。
- 可证伪点：若在 `replaceSession/upsert` 处清空旧 fiber ref 与虚拟列表闭包后，第 2 轮 ready 的 comparison 数从 2 降为 1、row model 从 4 降为 2，则证实；若仍为 2，则本候选不成立。

### 候选 2：upsert 的“新旧对比并存 + 有界历史保留”决定 payload 份数，峰值与平台都是多份

- 支持证据：第 1→2 轮快照 live 从 344,813,276 B 增至 670,273,360 B（+325,460,084 B = 310.4 MiB），第 5 轮 settle live 为 983,960,708 B ≈ 3 份；即每多保留一份历史对比，live 增加约 310 MiB。峰值出现在 ready 前（第 5 轮 ready heap 1.4 GB，额外垃圾约 0.36 GB），静置回落到“3 份”平台（938 MiB live / 1275 MiB RSS）。
- 可证伪点：若把旧 state/ref 在提交新 comparison 前释放，而峰值仍不降，说明峰值来自新树本身或非 JS 内存。

### 候选 3：128 MiB 缓存上限只覆盖哈希条目，渲染侧对象完全在上限之外

- 支持证据：`ComparisonCache` 身份经 fiber 校验（`maxEntries=200000`、`maxBytes=134217728`）；第 1/2 轮 `estimatedBytes=31,959,968 B`（30.5 MiB）、entries=76,604、evictions=0；3 tab 时 `estimatedBytes=62,541,064 B`（59.6 MiB）、entries=153,208。快照中 cache Map 的实际 reachable 仅 20,689,232 B（19.7 MiB）/ 37,018,652 B（35.3 MiB），并未逼近 128 MiB。
- 同时，一份渲染侧 payload（结果树）299.0 MiB、旧行模型另计，是缓存估算的 **约 10 倍**，且完全不在 `estimatedBytes` 内。
- 可证伪点：若把缓存条目全量清空后峰值不变，则缓存不是峰值来源（预期如此，但不是“漏算”的反证）；“漏算”本身由缓存统计与渲染侧 reachable 的直接对比证明。

### 候选 4：V8 未及时 GC 放大 RSS 峰值

- 支持证据：第 2 轮 ready 时 `JSHeapUsedSize=1,046,224,868 B`（997.8 MiB），快照强制 GC 后 live 仅 670,273,360 B（639.2 MiB），差 375,951,508 B（358.5 MiB）为未回收垃圾/瞬时分配；RSS 峰值 1,385,529,344 B（1321.4 MiB）还高于 used heap，含非 JS（DOM/字符串/排版）与 V8 页缓存。
- 但强制 GC 后仍有 2 棵完整结果树可达（候选 1），说明“GC 滞后”是放大器，不是持有旧树的根因。
- 可证伪点：加入显式 GC 或缩短提交路径后，若 used 与 live 的差值显著缩小而峰值仍 >1536 MiB，则本候选不成立（只会解释部分）。

## 9. 修复代价

- **是否必须动缓存与淘汰：否。** 证据：热轮 `hashedFiles=0`、cache 仅 30.5/59.6 MiB、evictions=0，峰值由渲染侧多份 payload（ready 2 份、settle 3 份）驱动；改缓存容量/淘汰不会降低该峰值，反而可能让热跑重新哈希（回到 ~20 s）。
- **改动面（推荐 a 时）**：
  1. renderer 会话替换路径（`Workbench` 的 `upsertSession/replaceSession`）：在新 comparison 提交时显式释放旧 session 的 comparison/row model 引用；
  2. `DirectoryView` 的 ref 回调与 `@tanstack/react-virtual` 闭包（`getScrollElement`、`resolvedOptions` 等）在切换 comparison 时重置/清理，避免旧闭包捕获旧 comparison；
  3. 行模型按需/可释放（旧 row model 的 `nodes/depths/opens` 数组随旧 comparison 一起失效）；
  4. 测试/门禁：新增 upsert 3–5 轮与 3 会话的内存门禁（阈值可先用 renderer ready ≤1536 MiB、静置 ≤1300 MiB；结构断言用 settle 后 comparison 数 =1、row model 数 =2）。
- **修复目标**：settle live 从 983,960,708 B（3 份）回落到约 345 MB（1 份），ready 峰值随之下移，预期回到 1536 MiB 以内。热轮 8.5–10.0 s，`hashedFiles=0`，墙钟主要由扫描 + 分类 + 渲染构成；上述改动只影响 renderer 引用释放，不触发重新哈希，预期不改变热跑量级，**不会退回 ~20 s**。若实现错误导致缓存失效/重哈希，则会退化到首轮的 21.6–22.5 s，这是必须避免的回归。
- **代价估计**：1–2 个 renderer 文件 + 3–5 个单测/组件测试 + 1 条内存门禁，约 0.5–1 人日；风险集中在会话切换时的引用清理遗漏（漏清则峰值不降，过度清理则可能闪空/重建行模型）。

## 10. a / b / c 三选一推荐

| 选项 | 范围 | 代价 | 风险 | 适用条件 |
| --- | --- | --- | --- | --- |
| **a. 修渲染侧持有/释放 + 把 upsert 与 3 会话纳入门禁** | 按 §9 清理旧 comparison/row model 引用，新增门禁 | 0.5–1 人日 + 门禁维护 | 中低：清理时机错误可能造成视图重建或行模型失效；需回归 5 轮/3 tab | 峰值确由多份并存造成、且团队不接受 1.7 GiB 峰值与静置多占 |
| b. 只补门禁与文档，接受 ready 峰值 | 不动 renderer，只记录阈值与已知峰值（含静置仍持 3 份），新增门禁防退化 | 最低（文档 + 门禁） | 低；1.7 GiB 瞬时峰值与静置 3 份（约 620 MiB 历史多占）都保留，低内存机器仍有压力 | 业务接受“瞬时 1.7 GiB、静置 1.25 GiB、仍持 3 份、不崩溃” |
| c. v0.2.6 不复现，保留证据关条 | 不成立：本次 ready 峰值 1726 MiB（组①）/1716 MiB（组②）均 >1536 MiB | — | — | 仅在未复现时适用；本项**不适用** |

**推荐 a**（在后续独立 WI 实施，本项不修）。理由：峰值已稳定复现且根因有可复算的引用链证据；修复只动渲染侧释放、不动缓存与淘汰，热跑 `hashedFiles=0` 决定了不会退回 ~20 s；修复后以“第 2 轮 ready 的 comparison 数 =1、row model 数 =2；5 轮后 settle 的 comparison 数 =1，live 回到约 345 MB，峰值 ≤1536 MiB”作为验收断言。若实施后峰值仍 >1536 MiB 且无崩溃，再退化为 b（接受峰值 + 门禁）。

若选 b，则关条条件为：文档记录 v0.2.6 峰值上限（组① 1726 MiB / 组② 1716 MiB，静置 1275 / 1258 MiB）与静置保留份数（3 份 comparison / 4 个 row model），门禁只断言“不高于本次实测 +5%”，并接受低内存设备的峰值与历史多占。

---

## 附录 A：口径

- renderer / app 总 RSS：原脚本 `ps -axo rss=`（KB→bytes）；renderer 取携带该 `--user-data-dir` basename 的最大 `Helper (Renderer)`；app 总为该实例全部进程 RSS 之和。侧车使用同一 `ps` 口径（1 s）。
- heap used：`Performance.getMetrics().JSHeapUsedSize`（驱动与侧车同源）；heap limit：`performance.memory.jsHeapSizeLimit`（=3,760,000,000 B）。
- DOM 节点：`Memory.getDOMCounters().nodes`（快照/分析侧另有 `document.getElementsByTagName('*').length`，两者相差 <1%，表中用前者）。
- hashedFiles：`ComparisonCache.stats.misses` 逐轮增量（见 §3）。
- 侧车：browser-level WebSocket + `Target.attachToTarget({flatten:true})`，不占用原脚本 page WS；1 s 轮询 `Performance.getMetrics`、`Memory.getDOMCounters`、页面探针与 `ps`。对热跑墙钟的干扰实测 ≈ +1.5%（§3 对照跑），低于 10% 阈值，故未使用 instrumented 驱动。
- 快照：**不做强制 GC**，先记录 `beforeSnapshot.JSHeapUsedSize`（含未回收垃圾），再 `HeapProfiler.takeHeapSnapshot` 流式落盘，`afterSnapshot.JSHeapUsedSize` 为可达 live 基线；二者差值见 §8。
- 图分析：流式解析 nodes/edges/strings（`to_node` 按 node-field 单位换算），从 GC root 做 BFS 得到无环引用链；`reachable` 为按语义边（跳过 weak、`internal:map`、`__proto__`）的上界，多个候选之间共享节点会重复计入，不宣称是 retained size。
- 阈值按字节比较：renderer 1,610,612,736 B；静置 1,363,148,800 B；app 总 2,684,354,560 B。

## 附录 B：堆快照 held / not-held 结论

| 快照 | 快照前 used (B / MiB) | 快照后 live (B / MiB) | comparison 数 | row model 数 | 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| 组① 第 1 轮 ready | 475,816,016 / 453.8 | 344,813,276 / 328.8 | 1 | 2 | 无“上一轮”；当前树/行模型被 React fiber `pendingProps` 强持有（预期） |
| 组① 第 2 轮 ready | 1,046,224,868 / 997.8 | 670,273,360 / 639.2 | **2** | **4** | **上一轮结果树 + 行模型 held**：旧 comparison 经 fiber `ref` 闭包 → Context(`internal:previous`) → `context:comparison`；旧 row model 经 `getScrollElement` 闭包 → `context:rows` |
| 组① 5 轮后 +25 s settle（可选） | 995,726,224 / 949.6 | 983,960,708 / 938.3 | **3** | **4** | **静置后仍持有 2 份历史 + 1 份当前**：旧项分别经 fiber `ref` / `onChange` 闭包 → Context(`internal:previous`) → `context:comparison`，以及 `getScrollElement` 闭包 → `context:rows`。注意 fiber 探针只看到 1 个 comparison（当前 tab），另外 2 个仅在堆图里可达——这正是需要堆快照的原因 |
| 组② 3 tab ready | 996,651,120 / 950.5 | 984,427,132 / 938.8 | 3 | 4 | 三个会话的 comparison 均 held（其中非活动 tab 经 `context:sessions → directory`，属并发会话应有状态）；4 个 row model 中 2 个属当前 tab、2 个为旧 tab 经虚拟列表闭包残留 |

缓存条目：四份快照中 `hashes` Map 均 held（`context:cache → current → hashes`），entries 76,604 / 76,604 / 76,604 / 153,208，`estimatedBytes` 30.5 / 30.5 / 30.5 / 59.6 MiB；Map 实际 reachable 19.7 / 19.7 / 19.7 / 35.3 MiB。128 MiB 上限只按 `96 + 2*(path+hash)` 估算哈希条目，**不覆盖**结果树（每份 299.0 MiB reachable）与行模型，故“漏算渲染侧”成立。

## 附录 C：与 v0.2.5 的历史对照（仅对照，不重跑）

v0.2.5 公开包历史值为 upsert ready 峰值 1,742 MiB、3 会话 ready 1,659 MiB。本项**未重跑 v0.2.5**，所有结论句只引用 v0.2.6 实测：组①峰值 1726 MiB（1s 侧车）/1723 MiB（无侧车对照），组② 1716 MiB；均在 v0.2.5 水平附近，说明 v0.2.6 未消除该峰值（约 -1%～+4% 的波动不足以改变判定）。

## 附录 D：局限与未覆盖

- 未测 Windows / Linux；未测 >3 会话、>5 轮 soak、小目录或其它目录对。
- 峰值来自 1 s 侧车采样（RSS）与 2 s 驱动采样，真实瞬时峰值可能更高；表中的“峰值”是可复现的采样峰值，不是数学最大值。
- 堆快照本身会强制 GC 并占用额外 RSS（快照后 RSS 达 3.4–6.9 GiB），因此**不能用快照参与 RSS 阈值判定**；阈值判定只用侧车/驱动的 `ps` 采样。
- `reachable` 是语义边可达上界，不是 dominator retained size；跨候选共享的树节点会重复计入。
- 采样机非独占（见 §1），loadavg 基线 4–5；墙钟对比仅在同一机器、同一会话内对照有效。
