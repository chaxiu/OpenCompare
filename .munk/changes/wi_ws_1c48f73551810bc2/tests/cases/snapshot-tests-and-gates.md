covers: ac-tests-and-gates
标题: 新增快照单测与组件测试通过且三条门禁全绿
步骤: 在仓库根依次执行 pnpm test、pnpm lint、pnpm typecheck
期望: 三条命令均 exit 0；pnpm test 包含新增/扩展的快照用例（纯函数编排 src/renderer/src/workbench/snapshotOps.test.ts 与 jsdom 组件测试 src/renderer/src/App.snapshot.test.tsx），覆盖导出/导入挂载、非法拒绝、远端样本四态、过滤、下钻与未内联提示；既有测试不被删除或降低，整体全绿。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: 仓库根实测：pnpm test → 20 files / 141 tests passed, exit 0；pnpm lint → exit 0；pnpm typecheck → exit 0。含新增 src/renderer/src/workbench/snapshotOps.test.ts 与 src/renderer/src/App.snapshot.test.tsx。
