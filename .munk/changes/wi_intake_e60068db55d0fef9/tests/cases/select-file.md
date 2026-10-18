# select-file

covers: ac-select-file
标题: PlatformPort.selectFile 在 Electron 与 Web 两套实现中可用，取消返回 null 不抛错
步骤: 1) 读代码确认 Electron 走 `dialog.showOpenDialog({ properties: ['openFile'] })`、Web 走隐藏 file input 并物化到内存 FS，且新增单测 `electron-platform.test.ts` / `web-platform.test.ts`；2) `pnpm test` 观察两条实现的 selectFile 用例；3) Electron（`pnpm dev`）在 CodeView/StructuredView 点「打开左文件」经原生打开对话框选一个真实文件；4) `pnpm dev:web` 同点击并在浏览器文件选择器中选文件；5) 两处再点一次并在对话框/选择器中取消
期望: Electron 返回所选文件绝对路径；Web 兼容实现返回可选文件路径（所选内容已物化到内存 FS 可供 readTextFile）；两套实现取消时均返回 `null` 且不抛错，界面无报错；上述成功与取消路径均有单测覆盖

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: 代码核对：Electron selectFile 走 dialog.showOpenDialog({properties:['openFile']})（electron-platform.ts:104-112）；Web 走隐藏 file input 并物化到内存 FS 返回 /memory/<name>（web-platform.ts:140-181）；新增单测 electron-platform.test.ts（成功返回绝对路径 / 取消 resolves null）与 web-platform.test.ts（picker 取消 null）。pnpm test 全绿。Web 端实测：CodeView/CsvView/StructuredView 三个视图点「打开左/右文件」均经该实现成功打开本地文件并读取内容、取消不变更状态无报错。
