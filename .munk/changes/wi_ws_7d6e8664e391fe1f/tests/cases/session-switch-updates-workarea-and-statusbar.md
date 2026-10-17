covers: ac-session-switch
标题: 多会话 / 多视图切换后工作区与底部状态栏同步更新
步骤: 加载样本后 → 点击不同会话标签（目录 / 代码 3-Way / CSV / JSON·YAML）切换会话，并切换顶栏视图
期望: 切换后中央工作区内容随当前会话改变，底部状态栏的会话标识与统计计数随当前会话更新，不残留上一会话数据

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: 会话切换同步更新工作区与状态栏，无残留。(1) 浏览器交互：目录→代码 切换后工作区面板整体替换（无残留目录树），状态栏由 session-directory 变为 session-code 且计数同步（文件/散乱树 B → 冲突块 3、行数 13/16）；代码会话内部 双栏 Diff ↔ 三向合并 切换正确。(2) 本轮真实执行的 RTL 断言（临时 harness，跑后删除、工作树零残留）覆盖 4 个会话顺序切换：session-csv → session-structured → session-code → session-directory，每次断言状态栏会话标识正确、当前会话专属内容出现，且上一会话专属文本（源目录 / 1,240 行 · CSV / /samples/structured/config.left.json / /samples/code/merge.ours.ts）在切换后 queryByText 为 null，证明无上一会话数据残留；顶栏「视图切换」segmented 同样驱动到对应会话视图。
