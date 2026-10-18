covers: ac-merge-regions
标题: 三向合并按行识别稳定区与冲突块，初始冲突块数=样本 3 块
步骤: 进入代码会话「三向合并 base · ours · theirs」→ 查看冲突计数与各区域
期望: 用 node-diff3 的 diff3MergeRegions 按 \n 切分行数组计算，正确区分「仅一侧变更的稳定区（自动采纳）」与「双侧冲突块」；初始待决冲突数与样本场景一致（3 块）；冲突块标注 ours/base/theirs 各自内容与行范围

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: Web 实机：进入代码会话默认三向合并，工具栏「待决冲突 3/3」、状态栏「冲突块 3」、左侧 3 张冲突卡片；三栏 base/ours/theirs 显示真实行号 1–15，三处双侧变更块（主题色/重试与分页/返回值）与稳定区拼接正确。
