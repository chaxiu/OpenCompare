covers: ac-merge-accept
标题: 每个冲突块一键 Accept Ours/Theirs/Both/Base，解决后显示采纳来源且可改选
步骤: 进入「三向合并」→ 对某冲突块分别点 Accept Ours / Accept Theirs / Accept Both / Accept Base → 对该块改选其它动作
期望: 四个动作均可用，选择后该块标记为已解决；Accept Ours/Theirs 取对应侧行、Accept Both 取 ours+theirs 拼接、Accept Base 取 base 行；已解决块显示采纳来源（如「已采纳 ours」），再次改选可切换来源并更新状态

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: Web 实机：冲突 1 依次 Accept Ours/Theirs/Both/Base，卡片来源标签随之切换（已采纳 ours / theirs / ours + theirs / base），预览块随之变化（ours 行 / theirs 行 / ours+theirs 拼接 / base 行），改选不重复递减计数；四个动作均可用。
