covers: ac-template-preview
标题: 视图展示归位映射预览（已匹配相对路径、缺失、冲突、B 未使用），确认前不写任何文件
步骤: 目录对比会话中点「模板归位」→ 观察弹出的预览弹窗内容 → 点「取消」→ 检查输出根
期望: 弹出 `role="dialog"` 的「模板归位映射预览」，显示模板 A 根 / 散乱树 B 根 / 输出根；分组列出「已匹配」（相对路径归位映射 ← B 源路径）、「缺失槽位」、「冲突项」、「B 未使用文件」及各自计数；点「取消」后弹窗关闭，确认前输出根无任何文件写入

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: Web 实测：role=dialog「模板归位映射预览」，显示 A=/samples/directory/baseline、B=/samples/directory/incoming、输出根 /memory/restored/1-baseline；已匹配 9、缺失槽位 6（含 README/assets/logo.png 等）、冲突 0、未使用 0；取消后弹窗关闭、无写入提示、统计 6/4/4/5 不变
