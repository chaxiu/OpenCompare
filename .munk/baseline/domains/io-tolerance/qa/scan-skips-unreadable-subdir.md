# scan-skips-unreadable-subdir

covers: ac-scan-skips-unreadable-subdir
标题: 子目录 listing 失败只跳过该子树并计数，父与兄弟节点仍被扫描
步骤: 注入 `list`，对某个子目录路径 reject（如 `EACCES`）→ `scanDirectory(root, list)`
期望: 整体 resolve 不 throw；该子树不进 `index`、`skipped` 至少 +1；根与同级兄弟节点完整保留；失败错误不冒泡为 reject

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `compare.test.ts` 'skips an unlistable subtree and keeps the rest of the tree'。`walk` 的 `catch` 分支 `skipped += 1; return null`，父层 `if (child === null) continue`。
