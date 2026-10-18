covers: ac-filter
标题: 状态过滤（全部 / 新增 / 删除 / 修改 / 类型变更 / 相同）一键切换后列表立即收窄到对应状态，切回「全部」恢复完整列表
步骤: 渲染 `<StructuredView fixture={STRUCTURED_SCENE} />`；依次点击过滤 SegmentedControl 的「新增」「类型变更」等项，观察节点路径变更列表；再点击「全部」
期望: 点击某个状态后列表只保留该状态的节点（例如「新增」下仅显示 `/service/features/limits/maxBytes` 等 added 项，`/telemetry/enabled` 等非 added 项消失）；「类型变更」下只显示 `/service/version`；切回「全部」后恢复显示完整变更列表；过滤即时生效且不改变计数栏数值

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: web 实测：「新增」仅保留 4 条 added（含 maxBytes），/telemetry/enabled 与 /service/version 消失；「类型变更」仅 /service/version；「全部」恢复 15 行；过滤即时且计数栏不变。
