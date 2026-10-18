covers: ac-raw-pair-visible
标题: 节点路径变更列表与左右原文可同屏查看，左右原文仍在视图中可见
步骤: 渲染 `<StructuredView fixture={STRUCTURED_SCENE} />`；确认左/右原文面板与节点路径变更面板同屏存在，核对原文内容（如 `"updatedAt": "2026-09-01"`）与左右原文路径标题
期望: 视图同时呈现节点路径变更列表与左右原文对照（同一分栏布局内左右原文仍可见），左右原文面板标题显示各自文件路径且原文文本可读，切换格式/过滤后左右原文保持可见

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: web 实测同一三栏 SplitPane 内变更列表与左右原文同屏：左 /samples/structured/config.left.json（含 "updatedAt": "2026-09-01"）、右 /samples/structured/config.right.json，原文可读。
