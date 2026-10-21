covers: ac-limit-configurable
标题: 默认上限落在 8–16，显式低上限实测峰值 ≤ 2 且结果一致
步骤: 在 vitest 中断言 `DEFAULT_IO_CONCURRENCY` `>= 8` 且 `<= 16`；对 200 / 400 条目以 `{ concurrency: 2 }` 调 `mapWithLimit` 与 `compareDirectories`，用进入/退出探针记录在飞峰值 → 与不传 `options` 的同一输入对比
期望: 默认常量在 `[8, 16]` 闭区间内；显式 `concurrency: 2` 时 `mapWithLimit` 与目录对比的在飞峰值均 `≤ 2` 且 `> 1`；结果条目数、顺序与分类（counts / root 树）与默认上限时完全一致；非有限值或 `< 1` 回退默认上限

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `src/core/io.test.ts` 'keeps the default window inside the documented 8–16 range'（默认 8）、'honours an explicit lower window'（200 项峰值 ≤ 2）；`compare.test.ts` 'honours an explicit lower window without changing the classification'（400 文件：低上限峰值 ≤ 2，counts 全 modified=400，root 与默认一致）。`resolveConcurrency` 对 `undefined` / 非有限值回退默认，`< 1` 经 `Math.max(1, …)` 兜底。
