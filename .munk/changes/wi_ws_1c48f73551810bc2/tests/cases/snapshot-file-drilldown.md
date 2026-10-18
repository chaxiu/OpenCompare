covers: ac-snapshot-drilldown
标题: 双击快照侧差异文件下钻到代码/CSV/结构化视图
步骤: 加载「远端快照样本」对比且过滤保持「仅差异」→ 在右栏（快照）双击 src/core/engine.ts，然后双击 src/data/report.csv，最后双击 config/deploy.yaml
期望: 三次双击分别打开代码 Diff 视图、CSV 主键对比视图、JSON/YAML 结构化视图；每个新会话的标题为文件名、副标题包含该快照路径（/snapshots/right/remote-prod/...）；内容非空且与快照内联文本一致，右独有文件左侧为空侧。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：远端快照样本 + 仅差异；右栏依次双击三文件，会话标签/副标题/内容均为：engine.ts「代码/文本」双栏字符级 Diff（有差异、非空）；report.csv「CSV」主键 order_id、对齐 4 行（ORD-1002 5→6）；deploy.yaml「YAML」共 7 节点（/service/name baseline→remote-prod、/service/replicas 2→6）。三会话副标题含 /snapshots/right/remote-prod/...，标题为文件名，内容取自快照内联文本。
