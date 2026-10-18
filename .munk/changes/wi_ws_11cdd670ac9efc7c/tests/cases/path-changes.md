covers: ac-path-changes
标题: 深层嵌套键的值变更 / 键新增 / 键删除按 JSON Pointer 节点路径逐条列出，并给出原值 → 新值
步骤: 以内置样本 `STRUCTURED_SCENE.json` 的左右原文调用 `diffStructured(..., 'json')`；按 path 建立索引；核对 `/service/features/limits/maxBytes`（键新增）、`/telemetry/enabled`（值修改）、`/service/version`（类型变更）；并在结构化视图中查看节点路径变更列表的对应行
期望: `/service/features/limits/maxBytes` 状态为 `added` 且只带右值（如 104857600）；`/telemetry/enabled` 状态为 `modified` 且同时给出原值 `false` → 新值 `true`；深层节点按 JSON Pointer 路径逐条列出（容器新增/删除只记一条路径，子孙不展开）；列表中每行展示状态、路径与原值 → 新值

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: web 实测行：`新增 | /service/features/limits/maxBytes | — | 104857600`、`修改 | /telemetry/enabled | false | true`、`类型变更 | /service/version | 2 | "2.0.0"`；深层节点逐条单路径列出。
