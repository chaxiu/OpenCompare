covers: ac-gates
标题: pnpm typecheck / lint / test 在改动后全绿（含随动的 Blob 断言与新增保存用例）
步骤: 1) 在本工作树执行 `pnpm typecheck`；2) 执行 `pnpm lint`；3) 执行 `pnpm test`；4) 检查 `App.snapshot.test.tsx` 与 snapshotOps 相关用例：快照导出是否已改为断言 `saveFile`（defaultPath `baseline.ocsnap.json`、过滤器含 `ocsnap.json`）与取消分支，而不再以 `URL.createObjectURL` / anchor 下载作为成功依据；5) 检查新增用例：覆写后脏标记、重置清除、原位保存并清除脏标记、取消保持脏标记、只读样本拒绝、合并导出取消
期望: `pnpm typecheck`、`pnpm lint`、`pnpm test` 三条命令均以 0 退出全绿，无类型错误、无 lint 报错；快照导出测试已随改道更新（不再依赖 Blob / `URL.createObjectURL` / anchor 下载断言，改为核对 `saveFile` 的默认名、过滤器、内容与取消不报错）；测试套件包含脏标记、原位保存、取消、只读拒绝、快照导出走 `saveFile` 的用例并全部通过；无因本次改动而失真的旧断言残留。

## 最近执行

- workItemId: wi_ws_4829ebe71d4e966e
- at: 2026-10-19
- status: pass
- note: pnpm typecheck / lint / test 均 0 退出；vitest 21 files / 203 tests 全绿。App.snapshot.test.tsx 已断言 saveFile defaultPath=baseline.ocsnap.json、filter 含 ocsnap.json 及取消分支；CodeView.test.tsx 覆盖脏标记/重置/原位保存/取消/只读拒绝/合并导出。
