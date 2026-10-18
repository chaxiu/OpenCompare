covers: ac-core-row-shuffle
标题: 左右行序被打乱仍按主键正确配对，打乱输入顺序不改变统计结果
步骤: 内置样本左右两侧本身即为确定性乱序 → 再对左右 `rows` 做额外的确定性打乱（种子不同）→ 重跑对齐 → 比较 `counts` 与逐行键配对结果是否不变
期望: 乱序输入仍按主键把同一 `order_id` 配对；任意打乱输入顺序下 same/added/removed/modified 统计完全不变（仍为 1,123 / 24 / 31 / 86），配对结果与行序无关

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 样本本身乱序，再以两组不同种子对左右 rows 确定性打乱后重跑：counts 恒为 1123/24/31/86；same/modified 行的 (key#status) 配对集合与基线完全一致，配对结果与行序无关。
