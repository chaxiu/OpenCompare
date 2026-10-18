covers: ac-drilldown-not-inlined-hint
标题: 双击快照中未内联内容的文本文件时给出明确提示而非空白对比
步骤: 加载「加载样本目录」进入目录对比会话 → 准备一个 .ocsnap.json：取样本导出结果并把某文本条目（如 src/core/engine.ts）的 content 字段删除、仅保留 path/size/modifiedMs/sha256 → 点击右栏「导入右侧快照」选择该文件挂载 → 在右栏双击该未内联的文本文件
期望: 通知区（role=alert）出现可读提示，说明该快照未内联该文件内容、无法离线下钻；不打开空内容的代码/结构化视图，不把对比会话替换为空白；左右两栏仍是导入后的对比，状态栏计数与导入后一致。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：删除导出的 engine.ts content 后挂载右栏，双击该文件 alert 原文「该快照未内联 src/core/engine.ts 的内容，无法离线下钻对比；导出时未内联该文件。」；未新建空代码/结构化视图（仍 4 个会话、选中目录对比），两栏树与计数（15相同/0/0/0、差异0）不变。
