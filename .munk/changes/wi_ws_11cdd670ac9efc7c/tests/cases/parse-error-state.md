covers: ac-parse-error
标题: 非法 JSON 或非法 YAML 输入展示可读错误提示，应用不崩溃，其他会话仍可用
步骤: 以非法一侧（如 `{"a": 1`）与合法一侧调用 `diffStructured(..., 'json')`，确认抛出可读的 `StructuredParseError`（含 side 与行列信息）；渲染 `<StructuredView pair={...非法 JSON...} format="json" />`；再校验非法 YAML 与空文档
期望: 非法 JSON 报错含 `left side: JSON parse error` 与可定位的行列；非法 YAML 报错含 `YAML parse error`；空文档报错含 `empty document`；视图展示可读的错误态（「结构化解析失败」与错误说明），应用不崩溃、不白屏，左/右原文与其余会话仍可使用

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: diff.test.ts 断言 /left side: JSON parse error at line 2/、/right side: YAML parse error/、/empty document/ 均通过；StructuredView.test.tsx 校验「结构化解析失败」错误态渲染且原文仍可见。
