covers: ac-type-change
标题: 类型变更（number→string、标量→对象、对象→数组）单独归类为「类型变更」，与普通值修改在列表与计数中分开
步骤: 构造 `{"a": 1, "b": {"x": 1}, "c": [1, 2]}` 与 `{"a": "1", "b": [1], "c": {"x": 1}}` 调用 `diffStructured(..., 'json')`；核对 `/a`、`/b`、`/c` 的 leftType / rightType 与 status；再以内置样本核对 `/service/version`（`2` → `"2.0.0"`，number→string）；在结构化视图的变更列表与计数栏观察类型变更与修改分列
期望: 三个节点均归类为 `typeChanged` 而非 `modified`；counts 中 typeChanged=3 且修改计数不含它们；视图中类型变更项用独立状态标签（「类型变更」）呈现，与「修改」在列表与计数中分开显示，原值 → 新值同时可见

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: diff.test.ts 构造样例 typeChanged=3（number→string、object→array、array→object）；web 实测 /service/version 打「类型变更」标签，2 → "2.0.0"，计数栏「类型变更」与「修改」分列。
