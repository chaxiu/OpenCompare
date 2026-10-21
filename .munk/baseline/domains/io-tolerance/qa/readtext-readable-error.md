# readtext-readable-error

covers: ac-readtext-readable-error
标题: `readTextFile` 命中悬空链接 / 不可读文件时返回含路径的中文可读错误
步骤: 建悬空符号链接 `dangling.txt` → 经 `platform.readTextFile(path)`（IPC handler `PLATFORM_CHANNELS.readTextFile` 同一路径）读取 → 捕获错误
期望: 以 `Error` reject；`message` 含「无法读取文件」与该绝对路径；`message` 不含 `Error invoking remote method` 前缀；错误码（ENOENT / EACCES 等）作为线索出现在文案中；不崩窗口、不产生未捕获异常

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `electron-platform.test.ts` 'rejects reading a dangling symbolic link with a readable message over IPC'。样本路径分支（`/samples/**`）仍走内存文件表，不受影响；真实路径分支改为 `readLocalTextFile` → `readableFailure('文件', …)`。
