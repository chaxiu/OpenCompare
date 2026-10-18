covers: ac-counts
标题: 计数按运行时对比结果统计，五类计数之和 = 参与对比的节点条目总数，且过滤不改变计数
步骤: 以 `STRUCTURED_SCENE.json` 左右原文调用 `diffStructured(..., 'json')`；把 added + removed + modified + typeChanged + same 五类 counts 相加与 `entries.length` 比较；在视图中切换状态过滤后再次核对计数栏数值；审阅实现确认计数由 entries 运行时汇总（不读样本 composition 答案键）
期望: 五类计数之和恒等于参与对比的节点条目总数（`entries.length`）；计数由运行时 entries 逐个汇总得到，不读取样本答案键；在视图中切换任意状态过滤后，计数栏五项数值保持不变

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: web 实测计数 4+0+5+1+5=15=「共 15 个节点」；过滤切换（新增/类型变更/全部）后五项计数保持 4/0/5/1/5 不变；实现 countStatuses 由 entries 运行时汇总，未读样本 composition。
