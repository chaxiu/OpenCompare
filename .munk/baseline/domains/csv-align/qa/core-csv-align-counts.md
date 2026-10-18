covers: ac-core-align-counts
标题: 内置样本按 order_id 对齐的运行时统计与 CSV_SCENE.composition 完全一致
步骤: 在 Node 环境用 vitest 直接引入 `src/core/csv/` 引擎 → 用 renderer 的 `parseCsvTable` 解析 `CSV_SCENE.left` / `CSV_SCENE.right` → 以 `['order_id']` 调用对齐 → 取返回的 `counts` 与 `CSV_SCENE.composition` 逐项比较
期望: `counts` 与 `CSV_SCENE.composition` 完全一致：相同 1,123 / 新增 24 / 删除 31 / 修改 86；核心对齐逻辑零 Electron/DOM/React 依赖，能被 vitest 在 Node 下直接单测通过

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: vitest(node) 实测：alignCsvTables(LEFT,RIGHT,['order_id']) → counts {"same":1123,"added":24,"removed":31,"modified":86}，与 CSV_SCENE.composition {"same":1123,"added":24,"removed":31,"modified":86} 逐项一致；对齐行 1264。src/core/csv/align.test.ts 11/11 通过，引擎零 Electron/DOM 依赖。
