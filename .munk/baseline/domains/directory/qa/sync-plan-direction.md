covers: ac-sync-plan
标题: 纯函数计划生成器按方向产出 copy/update（镜像模式另含 delete）变更清单，逐项带相对路径与字节数并给出字节汇总，左右互为镜像
步骤: 在 vitest（Node 环境）中构造一对含差异的左右扫描树并得到 `DirectoryComparison` → 分别调用 `buildSyncPlan(comparison, 'left-to-right' | 'right-to-left', 'incremental' | 'mirror')` → 检查各分组 `items`（`relativePath` / `sourcePath` / `targetPath` / `size`）与 `copy/update/delete` 的 `count`、`bytes`、`totalCount`、`totalBytes`，并对照两个方向
期望: 左→右 的 `copy` 为源侧独有文件、`update` 为两侧都存在的 `modified` 文件；右→左 与 左→右 互为镜像（copy/update 对调，`sourceRoot`/`targetRoot` 互换）；镜像模式下目标侧独有文件进入 `delete`，增量模式下 `delete` 为空；每一项带相对路径、源/目标绝对路径与字节数；每组给出 `count`/`bytes`，计划给出 `totalCount`/`totalBytes` 字节汇总

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: vitest 实测：左→右 copy=[left-only.txt,nested/deep.txt]/update=[changed.txt]、delete 空；右→左 copy/update 对调且 sourceRoot/targetRoot 互换；镜像模式 delete=[right-only.txt]（sourcePath=null）；copy 237B/update 475B/totalCount 13→逐项 sourcePath/targetPath/size 与 count/bytes 断言通过
