covers: ac-tests
标题: src/core 有 vitest 覆盖行级/行内区间、差异块划分、diff3 区域与采纳拼接，pnpm test 绿
步骤: 审阅 src/core/text/diff.test.ts 与 merge.test.ts 覆盖点 → 运行 pnpm test
期望: 覆盖行级+行内字符级区间（含超长行退化）、差异块划分与对齐行、diff3 稳定区/冲突区划分、Accept 拼接与 renderMergeText 结果；`pnpm test` 全绿（含既有 fixtures.test.ts 3 冲突块断言仍绿，样本 answer key 未改）

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: 审阅 src/core/text/diff.test.ts（行级对齐与双行号、modified 行字符级 runs、单侧填充对齐行、差异块划分、inlineSegments 超长行退化整行 changed、overwriteBlock 双向与插入）与 merge.test.ts（双侧变更合成 1 冲突块与两侧行范围、单侧变更自动采纳、样本 3 冲突块、renderMerge 标记与 unresolved、Accept ours/theirs/base 还原输入、Accept Both 拼接、countUnresolved、renderMergeText）；本机执行 `pnpm test` → Test Files 8 passed / Tests 36 passed；src/shared/fixtures 无改动（git status 干净），answer key 未改。
