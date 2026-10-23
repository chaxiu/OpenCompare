# Tech overview

Thin technical baseline (SSOT). 域语义与 AC 见 `.munk/baseline/domains/**`，ADR 见 `.munk/baseline/tech/decisions/**`。

## 目录与边界

- `src/main/`：Electron 主进程（窗口、IPC、真实文件系统、perf 采样与证据落盘）。
- `src/preload/`：`contextBridge` 白名单桥。
- `src/renderer/`：React 19 UI；所有平台能力经 `PlatformPort`，不直接 import Electron。
- `src/core/`：纯算法与领域模型，零 Electron / DOM，可被 vitest 直接单测。
- `src/shared/`：跨进程类型、`PlatformPort`、fixtures、perf 契约。

## 会话与视图生命周期（渲染侧）

- 会话列表语义单点在 `src/renderer/src/workbench/sessionStore.ts`：`upsertSessions`（同 id 原位替换、新 id 追加）/ `replaceSessions`（沿用调用方 id）/ `closeSessions` / `commitUpsert`（upsert + 按根释放摘要缓存）。`Workbench` 与 perf harness 共用，禁止各自演化。
- 目录视图的 `key = 会话 id + comparison 修订号`（`directoryViewKey` / `directoryComparisonKey`，`WeakMap` 登记、不延长寿命）。同 tab 重新对比、`replaceSession`、切 tab 都在**提交阶段**换 key → 旧 `DirectoryView` / `TreeView` / `useVirtualizer` 子树卸载，旧 comparison 与旧 row model 不再经 fiber props / `ref` 回调 / 虚拟列表闭包可达。释放不靠 `useEffect` 延迟清理或 GC 时机。
- 过滤 / 折叠 / 选中 / 滚动位置仍由 shell（`directoryStates` / `directoryScroll`）持有并在重挂后恢复；视图重挂只重置 `DirectoryView` 局部 `direction` / `mode`（与下钻返回重挂一致）。
- 摘要缓存仍是 renderer 单例（`Workbench` 的 `useRef`），双上限（200,000 条 / 128 MiB 估算）与 LRU / 按根释放不变；释放只影响是否重哈希，不影响四态。

## 性能测量与门禁（`pnpm perf:dir` / `pnpm perf:gate`）

- harness 渲染真实 `SessionTabs` + `DirectoryView`，会话列表走 `sessionStore`；`--mode upsert`（同 session id、tab 恒 1）/ `--mode multisession`（逐轮追加、tab 1→2→3），可重复 `--left/--right` 配对，`--settle <ms>`（默认 20 s、上限 60 s）。**不存在轮前释放路径**。
- 采样：`startup` / `boundary` / `pre-round` / `post-round`（新树已上屏）/ `periodic` / `settle`；`peaks` 排除 settle，静置单独成列。
- 结构断言：perf 模式在 app ready 前装 `--js-flags=--expose-gc`（普通启动不加）；每轮与 settle 后强制 GC 两次，`shared/perf/liveness.ts` 的 `WeakRef` 登记表数 `comparisons` / `rowModels`，`holds[]` 随证据落盘；`gc=false` 判 `hold-unmeasured` 红。
- 判定单点：`src/shared/perf/verdict.ts` + `perf/profiles.json`。本轮新增 `settleRendererBytes`（real 1,363,148,800 B / gate 1,073,741,824 B）与 `renderer-round-peak` / `renderer-settle` / `settle-missing` / `hold-comparisons` / `hold-row-models` / `hold-tabs` / `hold-unmeasured`；既有峰值与增量上限只增不松，`round-delta` 仅对 `upsert` 生效。
- 证据：`schema: opencompare.perf.directory/v1` 加法扩展（`mode` / `pairs` / `rounds[].tabs` / `rounds[].roundPeak` / `settle` / `holds`），原子写、< 5 MB。
- 门禁：`pnpm perf:gate` 单次生成数据集（含第三对根 `links/left`）并跑两次 harness（upsert 5 轮 + multisession 3 会话，`--settle 5000`，`RUN_TIMEOUT_MS=300_000`），断言峰值、settle、holds 与热轮 `hashedFiles=0`；`pnpm test:memory` 继续守缓存双上限 / 跨轮不增长 / 释放 / 结果不变。

## 质量门禁

`pnpm install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `cancel-gate` / `perf-gate` / `memory-gate`（见 `.munk/code-gates.json`）。`perf-gate` 真实启动 Electron，无 GUI 会话或超时会红。
