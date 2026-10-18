covers: ac-import-invalid-rejected
标题: 导入非法快照文件时给出可读错误且不破坏现有对比
步骤: 加载「远端快照样本」对比并记下当前差异计数 → 点击左栏「导入左侧快照」，选择一个非快照的 JSON（如 {"a":1}）或损坏文本文件
期望: 通知区出现可读错误提示（说明 schema/格式不被接受），左栏仍是原来的本地样本目录、右栏仍是 remote-prod 快照，差异计数与导入前一致，无空白树或会话丢失；再次导入合法快照仍能成功挂载。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：注入 {"a":1} 到左栏后 alert「快照导入失败：schema 不是 opencompare.snapshot/v1。」；左右仍 /samples/directory/baseline ↔ /snapshots/right/remote-prod，计数不变（3新增/4删除/5修改，差异12，15/14，树 19/17），无空白树/会话丢失；随后导入合法快照 alert「已挂载快照 remote-prod 到左栏。」成功挂载。
