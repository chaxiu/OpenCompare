covers: ac-bounded-traversal
标题: 5000 条目的并发映射峰值 ≤ 上限；listDirectory 结果与逐条串行 stat 一致
步骤: vitest 中对 `mapWithLimit` 传入 5000 个整数并以 `{ concurrency: 8 }` 映射，探针记录在飞峰值 → 另在临时目录建 1 个嵌套目录 + 300 个文件，先按 `readdir` 顺序逐条 `stat` 得串行基准，再调 `platform.listDirectory(wide)`，按 `name` 排序后逐字段比对
期望: 5000 条目映射峰值 `≤ 8` 且 `> 1`，结果数组长度 5000、顺序与输入下标一致（`results[i] === i * 2`）；`listDirectory` 返回条目数 = 301，`name` / `path` / `isDirectory` / `size` / `modifiedMs` 与串行基准逐项相等（目录条目 `isDirectory = true`）；`scanDirectory` 逐层 walk 不叠加无上界在飞 IO

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `src/core/io.test.ts` 'bounds 5000 entries at the configured window and keeps input order'：peak ≤ 8、长度 5000、逐项保序。`src/main/platform/electron-platform.test.ts` 'returns the same entries as a serial stat under the bounded window'：301 条目与逐条 stat 基准按名称排序后深比较相等。`scanDirectory` 保持每层一次 `list`、内部 for 串行。
