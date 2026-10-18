# csv-open-local-file

covers: ac-csv-open
标题: CsvView 顶栏可分别打开左/右本地 CSV/TSV 文件并重新按主键对齐
步骤: 进入「CSV 对齐」→ 记录当前对齐行数与主键提示 → 点顶栏「打开左文件」选一个本地 .csv（或 .tsv）→ 再点「打开右文件」选另一个本地分列文件
期望: 每次选定后 Panel 标题更新为新文件名，重新解析内容并按主键重新对齐；对齐行数与主键提示随之更新，出现「已打开 <路径>」提示；.tsv 按制表符分隔、.csv 按逗号分隔；取消时对齐结果不变、无报错

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: Web 实测：初始 orders.left.csv ↔ orders.right.tsv / 1,264 行 / 主键 order_id；打开左 csv-left.csv 后 Panel 标题、1,234 行、主键提示与「已打开 /memory/csv-left.csv」提示均更新；打开右 csv-right.csv 后 4/4 行、主键 id、可见 30→33 变更单元格；再开 tsv-left.tsv 按制表符正确分四列（id/name/qty）。取消选择后对齐结果不变且无报错。控制台 0 error。注意：web 选择器为隐藏 file input，Playwright 工具需允许读取 fixture 路径（已移入 workspace）。
