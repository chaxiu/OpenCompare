# compare-content-read-failure

covers: ac-compare-content-read-failure
标题: 正文读取失败的文件对判 `modified` 并计入 `skipped`，对比不 reject
步骤: 构造需要读正文的一对文件（size / mtime 相同，必须走 hash 确认），注入 `readTextFile` 对其中一侧 reject（非 EMFILE / ENFILE）→ `compareDirectories`
期望: `compareDirectories` resolve；该文件对状态为 `modified`；`skipped` 在原双侧扫描计数上 +1；其余文件对分类不受影响；`counts` 仍只统计成功扫描文件且 `fileCount` 自洽

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `compare.test.ts` 'reports an unreadable body as modified and counts it instead of rejecting'。`digestContentCandidates` 把不可读路径收进 `unreadable` 集合；`classifyPair` 命中后 `unreadablePairs.count += 1` 并返回 `modified`。EMFILE / ENFILE 仍 `throw toReadableIoError`（见 `io-concurrency` 域）。
