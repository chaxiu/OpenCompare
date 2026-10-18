covers: ac-filter
标题: 一键状态过滤（全部/仅差异/新增/删除/修改/相同）生效，视图行数随过滤变化
步骤: 在 CSV 视图切换状态过滤分段：全部 / 仅差异 / 新增 / 删除 / 修改 / 相同 → 观察视图行数与可见行的状态
期望: 各过滤选项生效并作用于对齐行；视图内行数随过滤变化（如「仅差异」只显示非 same 行、「相同」只显示 same 行），可见/总行计数同步更新

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 状态过滤实测行计数：全部 1,264/1,264；仅差异 141/1,264；新增 24/1,264；删除 31/1,264；修改 86/1,264；相同 1,123/1,264。可见行状态匹配：相同视图无 added/removed/modified 底色，新增视图全为 bg-diff-added-soft 且仅右值，删除视图 bg-diff-removed-soft，修改视图 bg-diff-modified-soft。零 console 错误。
