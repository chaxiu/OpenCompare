covers: ac-core-column-offset
标题: 左右列数与顺序不同（右侧独有 region）按列名配对，单边独有列不计入修改判定
步骤: 用左 7 列 / 右 8 列且列顺序不同的样本表（右侧独有 `region`）→ 按 `order_id` 对齐 → 检查 modified 行数与各 modified 行的 `changedColumns`
期望: 列按**列名**而非列下标配对，左右列顺序偏移被吸收；`region` 作为仅右独有列参与展示但不纳入修改判定；修改行数仍为 86，且 `changedColumns` 中不出现 `region`

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 左 7 列 / 右 8 列且右侧列序偏移（右独有 region 在首位）：按列名配对后 counts 仍 1123/24/31/86（modified 86）；result.columns 末项为 {name:'region',presence:'right',key:false}，全量行 changedColumns 均不含 region（REGION in changed? false）。
