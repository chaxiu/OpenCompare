covers: ac-sync-plan-same-modified
标题: 四类状态下计划分类正确：两侧相同不进清单、modified 进 update、源侧独有进 copy
步骤: 在 vitest 中构造左右树分别含「两侧同名同内容(same)」「两侧同名不同内容(modified)」「仅源侧存在」「仅目标侧存在」的文件 → 得到对比结果 → 对两个方向调用 `buildSyncPlan`
期望: `same` 文件不出现在任何分组（不进清单）；`modified` 文件进入 `update`；仅源侧存在的文件在目标侧进入 `copy`（其 `sourcePath` 指向源侧、`targetPath` 指向目标侧对应相对路径）；仅目标侧存在的文件仅在镜像模式下进入 `delete`，增量模式下不与任何状态混淆（覆盖 same / added / removed / modified 四类）

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: vitest 实测：same.txt 不进任何分组（copy/update 精确列表排除，counts same=1）；changed.txt 进 update；left-only.txt 进 copy（sourcePath=/left/...，targetPath=/right/...）；right-only.txt 仅镜像进 delete、增量为空；双向均断言
