covers: ac-core-cell-detail
标题: modified 行能列出具体变动列与左值 → 右值（qty、status 示例可断言）
步骤: 对样本按 `order_id` 对齐 → 取若干 `modified` 行 → 检查其 `changedColumns` 以及每个变动单元格的 `left` / `right` 值
期望: `modified` 行输出具体变动列名及左值 → 右值；可分别断言到 `qty` 与 `status` 各一条示例（变动列属左右共有交集列，且两值确实不同）

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: modified 行 changedColumns 与左右值实测：ORD-100294 → qty 16→21、status shipped→refunded；ORD-100910 → qty 11→16、status shipped→refunded。变动列均属左右共有列且两值确实不同（vitest align.test.ts「reports the changed cells of a modified row」通过）。
