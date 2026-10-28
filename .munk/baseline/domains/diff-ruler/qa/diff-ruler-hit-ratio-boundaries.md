# diff-ruler-hit-ratio-boundaries

covers: ac-ratio-pure-boundaries
标题: 比例 → 行号 → 最近差异块的纯函数命中边界（亚像素桶、同态合并、首末桶、任意比例、0 块）全部用例化
步骤: 自动化：`pnpm test -- ruler.hit` 全绿（`src/core/text/ruler.hit.test.ts`，纯 vitest 无 DOM，node 环境）→ 逐例核对：350k / 608 / 4 下亚像素 band 取样（首、中、末）、`trackHeight = 10` / `bandHeight = 1` 的同态合并、首末桶与退化比例、201 个递增比例扫描、0 块三函数返回值
期望: ① 350,000 行 / 608 轨道 / 4px 桶下，每 2,400 行一段 20 行改动的模型产出 band 中确有一条以上 `height < 1`（约 0.035px）；取首、中、末三条 band，以其中点比例 `(top + height/2) / 608` 调 `nearestBlockIndexAtRatio` 得到的块索引非负，且该块区间满足 `startRow <= band.startRow <= endRow`（即中点命中归属块而不是被 `-1` / 跳行吞掉）。② `trackHeight = rowCount`、`bandHeight = 1` 下连续同状态行合并成一条 band（10 行输入、行 2–6 为 modified → 恰 1 条 `{status:'modified', startRow:2, endRow:6, top:2, height:5}`），band 跨度内 0.2→0.69 的 11 个比例经 `ratioToRow` 都落在 `[2, 6]` 且 `nearestBlockIndexAtRatio` 恒为 `0`。③ 首末桶：`ratioToRow(0, 350000) = 0`、`ratioToRow(1, 350000) = 349999`、`ratioToRow(-1, n) = 0`、`ratioToRow(NaN, n) = 0`、`ratioToRow(r, 0) = -1`；比例 `0` 命中块 0 且 `blocks[0].startRow = 0`，比例 `1` 命中最后一个块（`endRow < 350000` 时仍取最近块而非越界），`resolveJumpTargetAtRatio(blocks, 1, n, 20)` 恰为 `{blockIndex: last, startRow: blocks[last].startRow, scrollTop: blocks[last].startRow * 20}`。④ 201 个 `step/200` 比例递增扫描：块索引恒 `>= 0`、恒 `< blocks.length`、相对上一比例非递减，且每个比例的 `resolveJumpTargetAtRatio` 的 `blockIndex` / `startRow` / `scrollTop` 与 `nearestBlockIndexAtRatio` + `blocks[i].startRow × 20` 完全一致。⑤ 0 块：`nearestBlockIndexAtRatio([], 0.5, n) = -1`、`nearestBlockIndexAtRatio([], 0, 0) = -1`、`resolveJumpTargetAtRatio([], 0.5, n, 20) = {blockIndex:-1, startRow:-1, scrollTop:0}`、`resolveJumpTargetAtRatio([], 0, 0, 20)` 同值、`buildRulerBands([], {trackHeight:608, bandHeight:4})` 与全相同行的 `buildRulerBands(sameRows, …)` 都为 `[]`（不得把 0 块跳成第 0 行）；`pnpm lint` / `pnpm typecheck` 不报错

## 最近执行

- workItemId: wi_ws_50c491d272ec7cd9
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_2ba8b4d3636112d5/code-gates/attempts/001`）。对应断言在 `src/core/text/ruler.hit.test.ts`（184 行 / 5 例，纯 vitest 无 DOM）：`resolves a sub-pixel band midpoint to the block that owns its first row`、`merges adjacent same-status rows so a whole run resolves to one block`、`pins the first and last bucket as well as degenerate ratios`、`keeps every ratio inside the block list and monotonic across the track`、`reports no hit for an empty block list instead of jumping to row 0`。该文件只消费 `@core/text/ruler` 既有导出，未改生产几何代码。
