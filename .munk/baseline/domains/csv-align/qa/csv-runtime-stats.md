covers: ac-runtime-stats
标题: 状态栏 same/added/removed/modified 来自运行时对齐结果，改主键后计数随之变化
步骤: 加载 CSV 会话，核对底部状态栏 4 项计数与运行时对齐 `counts` 是否一致 → 在工具栏切换主键列 → 再次核对状态栏计数
期望: 状态栏 same/added/removed/modified 由运行时对齐结果经回调上抛（沿用 `CodeView.onMergeStateChange` 模式），不再读取样本 answer key；数值与答案键一致但来源不同——改变主键后状态栏计数随之变化

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: web 实测（http://127.0.0.1:5187）：打开 CSV 会话状态栏为 1123相同/24新增/31删除/86修改（与答案键一致但来自运行时 onAlignStateChange）；取消 order_id 仅留 sku 后状态栏变为 181相同/21新增/28删除/1031修改、行计数 1,261/1,261、副标题「对齐 1,261 行 · 主键 sku」；恢复 order_id 后回到 1123/24/31/86。计数随主键实时变化，零 console 错误。
