covers: ac-remove-directory-seam, ac-write-text-file-atomic, ac-platform-failure-readable
标题: 平台写盘原子化、空目录删除能力与新通道白名单在 Electron / Web 两套实现下行为一致且失败可读
步骤: 经 `registerPlatformIpc` 的真实 handler 注册（`vi.mock('electron')`）在 `scratchRoot()` 真实临时目录上调用 `platform.writeTextFile(path, content, modifiedMs)`（含中文 / 多字节内容与覆盖既有文件）→ 调用 `removeDirectory(emptyDir)` / `removeDirectory(nonEmptyDir)` / `removeDirectory(filePath)` / `removeDirectory('/samples/**')` → 用一个不存在的父目录触发 `writeTextFile` 失败 → 对同一组调用走 Web 内存实现 → 检查 `PLATFORM_CHANNELS.removeDirectory` 单一来源与 preload 桥接表面清单
期望: `writeTextFile` 通道名与 `(path, content, modifiedMs?)` 签名不变，落盘内容逐字等于输入、目录内不残留临时文件、`mtimeMs` 按整毫秒落盘；写失败时目标原样、无零字节 / 截断文件、无 `*.tmp`。`removeDirectory` 删空目录成功，非空目录 / 文件 / 只读 `/samples/**` 均 reject；Web 内存实现同语义（成功后节点消失，非空与文件拒绝）。`writeTextFile` / `deleteFile` / `ensureDirectory` / `removeDirectory` 的失败消息为中文句子、含目标路径与 `（CODE）`、不含 `Error invoking remote method` 与临时文件名。`removeDirectory` 只出现在 `PLATFORM_CHANNELS` 与 preload 白名单、`PlatformPort` 表面新增且仅新增该方法。

## 最近执行

- workItemId: wi_ws_08b7067f448f263b
- at: 2026-10-31
- status: pass
- note: `needSelfTest=false`（无实机 GUI 验收），证据取自 code_gates 全量：`electron-platform.test.ts` 覆盖 `platform:write-text-file` 原子写（成功内容逐字回读、mtime 整毫秒、目录无 `.tmp`）与 `delete-file` / `ensure-directory` / `remove-directory` 的可读失败及只读 `/samples/**` 拒绝；`web-platform.test.ts` 覆盖 `removeDirectory` 成功 / 非空目录拒绝 / 文件拒绝；`preload/index.test.ts` 桥接表面清单新增 `removeDirectory` 一项。code_gates 11 门 attempt 001 全绿（`.munk/runs/run_ws_f06a7d04d430ead2/code-gates/attempts/001`）。真实的同步预检 / 回滚语义由 `domains/directory` 的 `sync-real-gate` 真实磁盘用例覆盖，本域不重复。
