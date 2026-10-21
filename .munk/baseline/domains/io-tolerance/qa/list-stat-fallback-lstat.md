# list-stat-fallback-lstat

covers: ac-list-stat-fallback-lstat
标题: `stat` 失败（ENOENT / ELOOP / EACCES / ENOTDIR）走 `lstat` 兜底返回，健康条目字段不变
步骤: 构造 `stat` 失败但 `readdir` 可列出的条目：①悬空符号链接（ENOENT）；②指向不可搜索目录（`chmod 0o000`）内文件的符号链接（解析阶段报 EACCES，而 `lstat` 链接本身成功）→ `platform.listDirectory(tree)`；ELOOP / ENOTDIR 走同一 `ENTRY_FALLBACK_CODES` 分支，当前无用例直接构造
期望: 两类条目均出现在结果中且不 reject，`broken === true` + 非空 `skippedReason`；同一目录内 `stat` 成功的条目与修复前逐条 `stat` 的 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 完全一致；非 `ENTRY_FALLBACK_CODES` 的失败（如 EMFILE）仍让整次列举失败

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `electron-platform.test.ts` 'does not fail the listing when broken entries and an unreadable target mix'（`chmod 0o000` 的 locked 目录 + 指向其内文件的 blocked 链接 + dangling 链接，4 条目全返回，readable.txt 不带 `broken`）。实测覆盖 ENOENT 与 EACCES 两条码；ELOOP / ENOTDIR 仅由 `ENTRY_FALLBACK_CODES` 集合覆盖，未构造专门 fixture，属已知覆盖缺口。
