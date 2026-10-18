covers: ac-remote-sample-four-statuses
标题: 一键加载「远端快照样本」后四态齐全且右栏标识为快照
步骤: 在 Web 运行模式打开应用 → 点击「Load Sample Fixtures」进入目录对比会话 → 在目录工具栏点击「远端快照样本」
期望: 右栏面板标题出现快照名 remote-prod、副标题显示挂载点 /snapshots/right/remote-prod，标签标明为快照而非目录；状态栏/图例同时出现相同、新增、删除、修改四项且均大于 0；左栏仍为内置本地样本目录 baseline。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：Load Sample Fixtures → 远端快照样本。右栏 Panel 标题 remote-prod / 副标题 /snapshots/right/remote-prod / meta「快照」；图例「6 相同 3 新增 4 删除 5 修改」四项均>0；左栏仍 baseline /samples/directory/baseline meta「源目录」。
