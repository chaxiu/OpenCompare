covers: ac-bounded-content-read
标题: 3000 个需读内容的文件对经限流后完成对比，在飞峰值 ≤ 配置上限且分类结果不变
步骤: 在 vitest 中用 `createTrees(largeTree(3000, 'shared'), largeTree(3000, 'shared'))` 造两侧各 3000 个文件；包一层 `readTextFile` 探针，进入 +1 / 退出 -1 并记录在飞峰值与读取次数 → 以默认 `options` 调用 `compareDirectories('/left', '/right', list, probe.readTextFile, createComparisonCache())`
期望: 对比正常完成，`counts` 为 `{ same: 3000, added: 0, removed: 0, modified: 0 }`；探针读取次数为 6000（每个候选只读一次）；在飞峰值 `≤ DEFAULT_IO_CONCURRENCY` 且 `> 1`（确认确实并发、但不是无上界 fan-out）；限流前后同一输入的 counts 与节点分类完全一致

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 code_gates 为门槛。`src/core/directory/compare.test.ts` 'bounds content reads for 3000 files at the default window'：counts 全 same=3000，reads=6000，peak ≤ DEFAULT_IO_CONCURRENCY 且 > 1。'honours an explicit lower window without changing the classification' 另证 400 文件下低上限与默认上限的 counts / root 一致。
