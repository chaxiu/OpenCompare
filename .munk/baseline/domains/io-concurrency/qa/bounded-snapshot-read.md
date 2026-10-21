covers: ac-bounded-snapshot-read
标题: 快照挂载对比 3000 文件同样有界并发，分类结果不变
步骤: 在 vitest 中用 `createFakeFs({ left: largeTree(3000, 'shared\n') })` 造真实目录侧，用 `largeSnapshot(3000, 'shared\n')` 造带内联内容的快照文档；包一层计数 `readTextFile` 记录在飞峰值 → 调用 `compareDirectorySides({ kind: 'directory', path: '/left' }, { kind: 'snapshot', snapshot }, list, probe.readTextFile, createComparisonCache())`
期望: 完成且不 reject；快照侧内容来自文档内联正文，只有目录侧触发 IO（读取次数 = 3000）；在飞峰值 `≤ DEFAULT_IO_CONCURRENCY` 且 `> 1`；`counts` 为 `{ same: 3000, added: 0, removed: 0, modified: 0 }`、`fileCount = 3000`，与无快照的目录对比语义一致

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `src/core/directory/snapshot.test.ts` 'bounds content reads for 3000 files against a mounted snapshot'：reads=3000（仅目录侧），peak ≤ DEFAULT_IO_CONCURRENCY 且 > 1，counts 全 same=3000，fileCount=3000。既有 snapshot 套件（roundtrip / 校验 / 四态 / 内联读取）同时全绿。
