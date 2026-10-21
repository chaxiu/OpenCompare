# compare-skipped-count

covers: ac-compare-skipped-count
标题: 含坏项的树上 `compareDirectories` resolve，计数自洽且 `skipped` 为两侧之和
步骤: 左右两侧分别注入含 1 个 `broken` 条目的扫描结果（或经注入 `list`），跑 `compareDirectories`
期望: resolve；`fileCount === same + added + removed + modified`；`counts` 只统计成功扫描文件（坏项不进任何一档）；`comparison.skipped` 等于左侧 `skipped` + 右侧 `skipped`（另加正文不可读对计数，正常树为 0）；不抛出、不返回空树

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `compare.test.ts` 'aggregates each side skipped count into the comparison'。`compareScannedTrees` 返回 `skipped: left.skipped + right.skipped + context.unreadablePairs.count`；`fileCount` 仍由四态 `counts` 求和。
