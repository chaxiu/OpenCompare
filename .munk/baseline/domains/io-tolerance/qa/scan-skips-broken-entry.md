# scan-skips-broken-entry

covers: ac-scan-skips-broken-entry
标题: 含悬空链接的树 `scanDirectory` resolve，坏条目不入 `index` 且 `skipped === 1`
步骤: 用注入的 `list` 返回含 `broken: true` 条目的目录列表（其余条目正常）→ `scanDirectory(root, list)`
期望: resolve（不 throw）；`index` 不含该 broken 条目的相对路径，其余节点齐全；`skipped === 1`；`index` 仍含 `''` 根节点；两侧各自扫描时各自计数

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `src/core/directory/compare.test.ts` 'keeps a dangling entry in the listing but out of the scan, counted as skipped'。`walkEntries` 对 `entry.broken` 直接 `skipped += 1` 并 `continue`。
