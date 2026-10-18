covers: ac-core-dup-key
标题: 同侧重复主键确定性配对不抛错，多余行归入该侧新增/删除
步骤: 构造左侧或右侧含同键多行的表 → 多次调用对齐 → 检查配对结果、`counts` 与重复键提示信息
期望: 同侧同键多行不崩溃、按出现顺序确定性配对（多次运行结果一致），不抛错；缺失配对的多余行计入该侧 added/removed；结果中带上重复键提示信息

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 重复键样本（左 id=A×2、右 id=C×2）实测：不抛错，counts {same:1,added:2,removed:2,modified:0}，多余行归该侧 added/removed；duplicateKeys [{key:['A'],left:2,right:1},{key:['C'],left:0,right:2}]；两次调用结果 deep-equal（确定性一致）。
