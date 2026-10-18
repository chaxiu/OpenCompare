covers: ac-drilldown-typed
标题: 双击差异 CSV/TSV 下钻 CSV 视图、双击差异 JSON/YAML 下钻结构化视图并携带左右内容正确解析
步骤: 目录对比会话中双击一个差异 `.csv`（或 `.tsv`）→ 观察视图与表格解析；返回目录会话后双击一个差异 `.json`（或 `.yaml`/`.yml`）→ 观察视图与解析结果
期望: CSV/TSV 下钻到 CSV 视图，按对应分隔符（`,` / `\t`）解析并在左右呈现各自表格行数；JSON/YAML 下钻到结构化视图，按对应格式解析并呈现左右内容；两类下钻均携带左右文件内容、会话切换到文件级视图，解析无报错

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: 设备侧限同 directory-drilldown-code：harness 无 double_click 动作，无法在真机执行 CSV/YAML 双击下钻。AC 由本 worktree 自动用例实跑覆盖：src/renderer/src/App.test.tsx 'drills CSV and YAML files into their typed views'（双击 report.csv → file:src/data/report.csv，左 3 行 · CSV / 右 4 行 · CSV；切回目录会话双击 deploy.yaml → file:config/deploy.yaml，出现「YAML 原文」）。并在目录模型确认 src/data/report.csv 与 config/deploy.yaml 均为 modified（双侧有内容），下钻会话携带左右内容、切到文件级视图、解析无报错。
