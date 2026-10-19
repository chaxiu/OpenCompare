covers: ac-gates
标题: pnpm typecheck / lint / test 在改动后全绿（含随动的原位写回断言更新）
步骤: 1) 在本工作树执行 `pnpm typecheck`；2) 执行 `pnpm lint`；3) 执行 `pnpm test`；4) 检查 `CodeView.test.tsx`：`保存左/右文件` 是否断言 `writeTextFile` 收到加载路径与工作文本、`saveFile` 未被调用、脏标记清除与路径不变；5) 检查只读样本拒绝仍保留脏标记并报错；6) 检查三向合并导出与快照导出仍断言 `saveFile`（defaultPath / 过滤器 / 取消分支）
期望: `pnpm typecheck`、`pnpm lint`、`pnpm test` 三条命令均以 0 退出全绿，无类型错误、无 lint 报错；测试套件包含脏标记、重置、左右两侧免对话框原位写回、只读拒绝、合并导出与快照导出仍走 `saveFile` 的用例并全部通过；无因本次改动而失真的旧断言残留（不再断言原位保存会打开保存对话框或允许取消）。
