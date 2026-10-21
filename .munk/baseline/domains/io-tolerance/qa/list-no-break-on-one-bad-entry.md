# list-no-break-on-one-bad-entry

covers: ac-list-no-break-on-one-bad-entry
标题: 同一目录混有悬空链接与不可读项时列举不抛错，可读条目全部返回
步骤: 临时目录内同时放置 `readable.txt`、可读子目录 `locked/`、悬空链接 `dangling` 与指向不可搜索目录内文件的 `blocked` 链接 → `await platform.listDirectory(tree)`（不 catch）
期望: `listDirectory` 不抛错；返回条目名集合为 `['blocked', 'dangling', 'locked', 'readable.txt']`（一个都不静默丢弃）；两条坏项 `broken === true` 且 `skippedReason` 非空；`readable.txt` 正常条目字段完整

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `electron-platform.test.ts` 'does not fail the listing when broken entries and an unreadable target mix'。`chmod 0o000` 在 finally 中恢复 0o755，避免污染临时目录。
