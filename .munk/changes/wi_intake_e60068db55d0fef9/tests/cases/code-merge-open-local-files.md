# code-merge-open-local-files

covers: ac-code-merge-open
标题: CodeView 三向合并可分别打开 base/ours/theirs 本地文件并重建合并模型与冲突列表
步骤: 切到「三向合并」模式 → 记录当前冲突数与冲突列表 → 依次点顶栏「打开 base」「打开 ours」「打开 theirs」各选一个本地文本文件
期望: 三个 Panel 标题分别更新为新文件路径；合并模型按新的三份内容重建，冲突数与冲突列表随之更新、冲突导航回到首块、旧的分块采纳状态被清空；每次打开给出「已打开 <路径>」提示，取消时不改变现有合并状态

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: Web 实测：初始 base/ours/theirs = /samples/code/merge.{base,ours,theirs}.ts、待决冲突 3/3；先 Accept Ours 一块（2/3）后依次打开 base/ours/theirs 本地文件，三 Panel 标题分别更新为 /memory/merge-{base,ours,theirs}.txt，每次 notice「已打开 <路径>」；合并模型重建（冲突列表按新内容重算、旧采纳状态清空为全部未解决）、导航经「下一块」推进后打开文件即回到冲突 1。取消（dispatch cancel）后状态逐字段不变。控制台 0 error。
