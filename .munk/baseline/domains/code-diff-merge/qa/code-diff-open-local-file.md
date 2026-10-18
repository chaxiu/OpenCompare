# code-diff-open-local-file

covers: ac-code-diff-open
标题: CodeView 双栏 Diff 顶栏可分别打开左/右本地文本文件并即时刷新对比
步骤: 进入「代码对比」双栏 Diff → 记录当前差异块计数与左右 Panel 标题 → 点顶栏「打开左文件」选一个本地文本文件 → 再点「打开右文件」选另一个本地文本文件（可先取消一次观察）
期望: 取消时对比区无任何变化且无报错；每次选定后对应 Panel 标题更新为新文件路径，对比区立即按新内容重算，差异块计数与行内容随之更新，并出现「已打开 <路径>」成功提示

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: Web 实测：初始样本对 /samples/code/summary.left.ts ↔ summary.right.ts、差异块 1/3；打开左 code-left.txt 后左 Panel 标题变为 /memory/code-left.txt、差异块 1/1、notice「已打开 /memory/code-left.txt」；打开右 code-right.txt 后右标题 /memory/code-right.txt、差异块 1/2（BETA + epsilon 行变更）；取消（dispatch cancel）后标题/计数/行内容不变且无报错。控制台 0 error。
