covers: ac-existing-semantics
标题: 既有 compare / snapshot / sync / template / electron-platform 语义与缓存行为不回归
步骤: 跑 `pnpm test` 全量（含 `src/core/directory/compare.test.ts`、`snapshot.test.ts`、`sync.test.ts`、`template.test.ts`、`src/main/platform/electron-platform.test.ts`、renderer 各视图套件）→ 重点复核「大小相同但内容不同 → modified」「大小 + mtime 都相同则短路不读内容」「重复比对命中缓存不重复读」与同步 / 模板归位 / 下钻往返等既有断言
期望: 全部通过；相同大小不同内容仍判 `modified`；第二次比对同一目录树 `planContentReads` 为空、`readTextFile` 与哈希调用次数不增加；同步计划 / 镜像删除 / 模板匹配 / 下钻返回与状态保持等既有用例零回归；`mapWithLimit` 保序保证 `new Map(entries)` 与缓存写入路径不变

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: code_gates attempt 001 六条门禁全绿（install / lint / typecheck / build / build:web / test）。`compare.test.ts` 既有 'settles size/mtime mismatches without reading bodies and reuses the hash cache'（二次比对 planContentReads=[]、hashCalls 不增）与 'reads bodies through the platform capability exactly once per candidate' 均通过；sync / template / snapshot / electron-platform / App 套件无新增失败。
