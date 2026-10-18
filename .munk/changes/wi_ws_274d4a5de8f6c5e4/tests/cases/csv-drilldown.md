covers: ac-drilldown-csv
标题: 目录下钻打开的 CSV/TSV 会话进入同一对齐视图，无声明主键时默认第一个共有列且可交互修改
步骤: 在目录对比会话中双击一个差异 `.csv`（或 `.tsv`）文件下钻 → 观察是否进入 CSV 主键对齐视图 → 查看默认选中的主键列 → 交互切换主键列
期望: 下钻打开的 CSV/TSV 会话进入同一对齐视图（不做双原始表铺开）；无声明主键时默认选中第一个共有列，并可在界面交互修改；切换后对齐结果与统计即时刷新

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 目录会话双击 src/data/report.csv 下钻 → 新会话 tab「report.csv src/data/report.csv · CSV」，进入与内置场景同款对齐视图（toolbar「CSV 对齐工具」+ 主键列选择组 + 状态过滤），非双原始表铺开；无声明主键默认第一个共有列 order_id（aria-pressed=true，副标题「对齐 4 行 · 主键 order_id」，状态栏 2相同/1新增/0删除/1修改）；点击 status 叠加 → 主键 order_id + status；取消 order_id → 主键 status 且列序/副标题即时刷新，无崩溃、零 console 错误（目录中无 .tsv 下钻目标，report.csv 已覆盖）。
