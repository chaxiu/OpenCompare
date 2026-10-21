# scan-root-failure

covers: ac-scan-root-failure
标题: 根目录 listing 失败时 `scanDirectory` 仍 reject，错误可读
步骤: 注入 `list`，对根路径直接 reject（ENOENT / EACCES）→ `scanDirectory(root, list)`
期望: 以错误 reject（不被吞掉成空树）；错误经 `toReadableIoError` 转换后仍可读（含路径或「文件句柄」等既有中文口径）；不 resolve 出 `skipped: 1` 的空树

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `compare.test.ts` 'still rejects when the root itself cannot be listed'。根 `list` 单独先读一次，`catch` 走 `throw toReadableIoError(error)`；子层 `walk` 才做跳过。
