covers: ac-import-mount-and-roundtrip
标题: 导入导出得到的快照并挂载为右栏后全等
步骤: 先按「一键导出真实目录侧」得到 baseline.ocsnap.json → 在目录对比中点击「加载样本目录」→ 点击右栏「导入右侧快照」，选择刚下载的 baseline.ocsnap.json 文件
期望: 右栏面板标题显示快照名 baseline、副标题为 /snapshots/right/baseline 且标识为快照；状态栏图例变为全部相同（modified=0、added=0、removed=0），差异计数为 0；过滤切到「仅差异」时两栏均为空提示，切回「全部」恢复完整树。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：导入 baseline 到右栏，alert「已挂载快照 baseline 到右栏。」；右栏 baseline / /snapshots/right/baseline / meta「快照」；图例 15 相同 0 新增 0 删除 0 修改、差异 0；仅差异过滤两栏均空提示，切回全部恢复 25 项完整树。
