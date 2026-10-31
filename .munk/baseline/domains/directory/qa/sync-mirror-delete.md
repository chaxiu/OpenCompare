covers: ac-sync-mirror-delete
标题: 镜像模式把目标侧独有文件列为待删除项且初始全部未勾选，只删明确勾选项
步骤: 目录对比会话切「同步模式」为「镜像」→ 点「预览并同步」→ 观察「待删除（镜像）」分组初始勾选状态 → 不勾选任何删除项点「确认执行」（或直接调 `executeSyncPlan` 不传 `deletePaths`）→ 再用组级「全选」或逐项勾选其一后点「确认执行」→ 检查目标侧
期望: 镜像模式弹窗把目标侧独有文件列为「待删除（镜像）」项，初始复选框全部未选中，并提供组级「全选 / 清空」与逐项复选框；不勾选 / 未传 `deletePaths` / 传空数组时执行器零删除，目标侧文件列表与执行前逐项一致；勾选后确认只删除勾选项（`deleted` 计数等于勾选数，`affected` 覆盖被删路径），未勾选的目标侧独有文件仍在磁盘上；「只有未勾选删除项」时「确认执行」禁用并显示可见原因，底部「本次将执行」条目数与实际传入的勾选集一致

## 最近执行

- workItemId: wi_ws_7efd09ed8abe2eda
- at: 2026-10-31
- status: pass
- note: 合同已反转为「默认不勾」（旧「默认全勾选」记录由本条取代）。真实磁盘门禁 `sync-real-gate`（`src/sync-real-gate.test.ts`，真实临时目录 + 真实 IPC handler）验证：镜像预览 delete 2 项且均未勾选；`deletePaths: []` 与不传 `deletePaths` 两种调用 `deleted` 均为 0、目标侧文件列表逐项不变；仅传 1 条勾选路径时 `deleted === 1`、该路径从磁盘消失、未勾选路径仍在且 `affected` 含被删绝对路径。渲染层 `directoryI18n.test.tsx` 断言复选框初始 `checked === false`、「全选 / 清空」可用、仅未勾选删除项时 `Apply changes` disabled 并显示原因文案、勾选单项后汇总为「1 delete」且可确认。
