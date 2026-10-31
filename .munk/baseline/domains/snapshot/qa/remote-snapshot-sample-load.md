covers: ac-remote-sample-four-statuses
标题: 一键加载「远端快照样本」后四态齐全且右栏标识为快照
步骤: 在 Web 运行模式打开应用 → 点顶栏齿轮「设置」→「示例与调试」→ 点 `[data-sample-entry="remote-snapshot"]`（等价于 `runSidesCompare(remoteSnapshotSides())`；原顶栏 Load Sample Fixtures 与目录工具栏「演示：远端快照」按钮已删除）
期望: 右栏面板标题出现快照名 remote-prod、副标题显示挂载点 /snapshots/right/remote-prod，标签标明为快照而非目录；状态栏/图例同时出现相同、新增、删除、修改四项且均大于 0；左栏仍为内置本地样本目录 baseline。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：Load Sample Fixtures → 远端快照样本。右栏 Panel 标题 remote-prod / 副标题 /snapshots/right/remote-prod / meta「快照」；图例「6 相同 3 新增 4 删除 5 修改」四项均>0；左栏仍 baseline /samples/directory/baseline meta「源目录」。 入口变更（wi_ws_8959816f18ce7acf，2026-10-31）：顶栏 Load Sample Fixtures 与目录工具栏「演示：远端快照」已随「去 demo」项删除，入口改为 设置 → 示例与调试 → 远端快照（同一 `runSidesCompare(remoteSnapshotSides())` 路径，产出会话不变）。
