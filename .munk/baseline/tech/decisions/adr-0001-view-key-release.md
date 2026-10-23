# ADR-0001: 目录视图按 comparison 修订号换 key，提交阶段释放历史对比

- 状态：accepted
- 日期：2026-10-23
- 来源：WI `wi_intake_113057fa1be21544`，tech delta `.munk/changes/wi_intake_113057fa1be21544/tech.md`，诊断 `docs/perf/upsert-memory-diagnosis-2026-10-23.md`

## 背景

v0.2.6 只读诊断证明：同 tab 重新对比（`upsertSession`）与 `replaceSession` 后，旧 `DirectoryComparison` 仍经 React fiber `ref` → `Context(internal:previous)` → `context:comparison` 可达，旧 `DirectoryRowModel` 仍经 `@tanstack/react-virtual` 的 `getScrollElement` 闭包可达。缓存的 `releaseDirectoryComparison` 只淘汰摘要条目，管不到渲染侧；5 轮后 settle 仍持 3 份 comparison + 4 份 row model（≈938 MiB），ready 第 3 轮起越 1536 MiB。

## 决策

1. 一份 comparison 在创建期经 `WeakMap` 领取单调修订号；`DirectoryView` 的 `key = ${session.id}#${directoryComparisonKey(comparison)}`（`directoryViewKey`）。`Workbench` 与 perf shell 都使用同一 key。
2. 同 id 重新对比 / `replaceSession` / 切 tab 因此换 key，React 在**提交阶段**卸载旧 `DirectoryView` / `TreeView` / `useVirtualizer` 子树，旧 comparison 与旧 row model 随之不可达，不等 GC。
3. 会话列表与释放语义收敛到 `workbench/sessionStore.ts` 的纯函数，`Workbench` 与 harness 共用；替换时按「新会话仍占用同一批根」保留热缓存。
4. perf harness 渲染真实视图、删除「轮前释放会话」，并以强制 GC 后的 `holds` 份数作为可失败断言。

## 备选与取舍

- **在 `useEffect` 清理里手动清引用**：依赖提交后时机，仍可能被 fiber 的 `alternate` / 闭包短暂持有，且易漏；否。
- **把 comparison 从 props 改为 Context + 手动 reset**：改动面更大，仍要靠卸载才能清掉 virtualizer。否。
- **缩缓存上限 / 加淘汰**：诊断已证明 cache 仅 30.5–59.6 MiB、热轮 `hashedFiles=0`，缩上限不会降渲染侧峰值且可能让热跑退回 ~20 s。否。
- **保留轮前释放的 harness**：会继续掩盖真实持有路径（原盲区）。否。

## 后果

- 释放确定性由 React 提交阶段保证；`directoryStates` / `directoryScroll` 仍恢复过滤 / 折叠 / 选中 / 滚动。
- 已知副作用：`DirectoryView` 局部 `direction` / `mode` 在重挂时回到默认（与既有下钻返回重挂一致）；若要保留需提升到 shell。
- 后续触碰视图生命周期或会话替换路径时必须重跑 `pnpm perf:gate`（两次 harness）与真实两目录 `perf:dir`；`ac-real-ui-*` 的打包 app + CDP L3 仍由产品负责人在 Ops 执行。
