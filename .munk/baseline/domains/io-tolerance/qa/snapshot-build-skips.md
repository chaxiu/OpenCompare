# snapshot-build-skips

covers: ac-snapshot-build-skips
标题: `buildSnapshot` 跳过单个不可读文件并计数，其余条目照常导出且线格式不变
步骤: 用注入 `readTextFile` 的树（多个文件，其中一个 reject）→ `buildSnapshot(tree, options)` → 对 `snapshot` 跑 `serializeSnapshot` / `validateSnapshot`
期望: 返回 `{ snapshot, skipped }`，`skipped === 1`；该文件不出现在 `entries` 中，其余条目齐全且顺序仍按 `path` 排序；`serializeSnapshot` 校验通过；`.ocsnap.json` 字段（`schema` / `name` / `exportedAt` / `entries[].path|size|modifiedMs|hash|content?`）不变，未新增字段

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `compare.test.ts`（snapshot 相关用例）'skips one unreadable file, counts it and exports the rest'。`buildSnapshot` 改经 `readContentCandidates`，`skipped: unreadable.size`；`exportSideSnapshot` 透传 `skipped`，工作台导出提示追加「，跳过 N 个不可读项」。
