covers: ac-key-picker
标题: 界面勾选/切换单列或多列主键后对齐结果、行状态与统计即时刷新
步骤: 在 CSV 视图工具栏「主键列选择」中点击勾选/取消列（先单列，再叠加多列）→ 观察对齐表、行状态与统计变化
期望: 可交互勾选/取消单列或多列主键（候选 = 左右共有列，默认取 `CSV_SCENE.keyColumns` 即 `order_id`；下钻会话无声明主键时默认第一个共有列）；每次切换后对齐结果、行状态、单元格高亮与统计即时重算，无崩溃

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 主键列选择组候选 = 左右共有列 ["order_id","account","sku","qty","unit_price","status","updated_at"]（无仅右的 region），默认 aria-pressed 仅 order_id；叠加 sku → aria-pressed [order_id,sku]、副标题「对齐 1,264 行 · 主键 order_id + sku」；取消全部 → 空态文案「未选择主键列，无法按主键对齐行…」且 0/0 行、无崩溃；重选 order_id → 恢复 1123/24/31/86 与 1,264/1,264 行。
