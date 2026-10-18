covers: ac-format-switch-and-drilldown
标题: 内置场景可在 JSON / YAML 间切换并各自展示对应对比结果；目录下钻的 JSON/YAML 会话按既定格式直接展示且不显示格式切换
步骤: 渲染 `<StructuredView fixture={STRUCTURED_SCENE} />`，点击格式 SegmentedControl 在 JSON 与 YAML 间切换，观察对比列表与左右原文；再渲染目录下钻会话 `<StructuredView pair={pair} format="yaml" />`（模拟目录树双击 `.yaml` 差异文件下钻）
期望: 内置场景切换 JSON 时展示 JSON 对（如含 `/service/features/limits/maxBytes`），切换 YAML 时展示 YAML 对（如含 `/service/health`）并各自呈现对应原文路径；下钻会话按既定格式（YAML）直接展示语义归一化对比结果，且不显示格式切换控件（无「结构化格式」SegmentedControl），两类数据源共用同一对比引擎与列表渲染

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: web-isolated 实测：内置场景 JSON 含 /service/features/limits/maxBytes、YAML 含 /service/health，原文路径标题随切换变化；目录 config/deploy.yaml 下钻新会话显示「来自目录对比下钻 · YAML 原文」，无「结构化格式」控件但保留「状态过滤」，语义对比正确忽略同值键。
