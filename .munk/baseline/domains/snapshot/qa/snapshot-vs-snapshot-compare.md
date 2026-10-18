covers: ac-snapshot-vs-snapshot
标题: 左右两栏均为快照时对比、过滤与下钻仍可用
步骤: 先按「一键导出真实目录侧」得到 baseline.ocsnap.json → 加载「加载样本目录」→ 点击「远端快照样本」使右栏为 remote-prod 快照 → 再点击左栏「导入左侧快照」选择 baseline.ocsnap.json → 两侧均为快照后查看对比，依次切换「仅差异」「右独有」过滤，并双击右栏差异文件（如 src/core/engine.ts）
期望: 左右均标识为快照（左栏 /snapshots/left/baseline、右栏 /snapshots/right/remote-prod）；仍正常产出对比（左右根名 baseline 与 remote-prod，四态计数合理）；切换过滤器时可见条目随之变化且状态栏计数一致；双击右栏差异文件仍按扩展名下钻到对应视图且内容取自快照内联文本。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：左 baseline /snapshots/left/baseline、右 remote-prod /snapshots/right/remote-prod，两侧 meta 均「快照」；产出对比（6相同/3新增/4删除/5修改）；仅差异/右独有过滤联动且计数一致；双击右栏 engine.ts 下钻到「代码/文本」视图，副标题含 /snapshots/right/remote-prod/src/core/engine.ts，内容取自快照内联文本。
