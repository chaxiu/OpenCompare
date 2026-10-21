# list-root-error-readable

covers: ac-list-root-error-readable
标题: 根目录本身不可列举时仍 reject，但文案为含路径的中文可读错误
步骤: 分别对「不存在的路径」与「普通文件路径」调用 `platform.listDirectory(path)` → 以 `.then(ok, err)` 捕获结果形态 → 检查 `message`
期望: 两侧均以 `Error` reject（不被吞成空数组）；`message` 含「无法读取目录」与完整路径；不出现裸 `ENOENT ... stat` 作为唯一信息；句柄耗尽仍沿用 `io-concurrency` 的「文件句柄」可读文案

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `electron-platform.test.ts` 'rejects a missing or non-directory root with a readable message'。`readdir` 失败统一走 `readableFailure('目录', error, path)`，文案「无法读取目录 <path>：<中文原因>（<code>）。」；`toReadableIoError` 先行转换，EMFILE 仍是既有「文件句柄」文案。
