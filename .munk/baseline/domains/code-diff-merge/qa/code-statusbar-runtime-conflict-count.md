covers: ac-code-statusbar-runtime
标题: 代码会话状态栏冲突计数来自运行时计算并随解决递减
步骤: 加载样本 → 进入代码会话（三向合并）→ 观察底部状态栏「冲突块」数 → 逐块 Accept 再看状态栏
期望: 底部状态栏冲突计数由运行时模型计算（countUnresolved）得出，随逐块解决实时递减至 0，不再读取样本 answer key 的 conflict 静态值（初始值 3 与运行时结果一致，但解决后随之变化）

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: Web 实机（session isess_d131c01a684a）：初始状态栏「冲突块 3」与工具栏「待决冲突 3/3」一致；逐块 Accept Ours/Both/Base 后状态栏实时递减 3→2→1→0（对应工具栏 2/3、1/3、0/3，副标题变「全部冲突已解决」），证明计数来自运行时 countUnresolved 而非样本 answer key 静态值。
