covers: ac-core-multi-key
标题: 支持单列与多列（order_id+sku）主键，切换主键后重算统计不崩溃、无重复计数
步骤: 分别以单列 `['order_id']` 与多列 `['order_id','sku']` 对同一样本运行对齐 → 比较两次的 `counts` 与对齐行数 → 校验 same+added+removed+modified 等于对齐行总数
期望: 单列与多列主键均可正常工作；切换主键后重新对齐并重算统计，无异常抛出；四类计数之和等于对齐行总数，无重复计数

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 单列 ['order_id'] 与多列 ['order_id','sku']（含逆序 ['sku','order_id']）均无异常，counts 均 1123/24/31/86，对齐行数 1264 = same+added+removed+modified，无重复计数。
