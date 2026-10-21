covers: ac-emfile-readable
标题: EMFILE / ENFILE 转成含「文件句柄」与原始错误码的可读错误，不返回部分结果
步骤: 在 vitest 中构造 `Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' })`；分别让 `compareDirectories` 与 `compareDirectorySides` 的注入 `readTextFile` 直接以该错误 reject（`FileHandleExhaustedError` 单测另覆盖 ENFILE 与无关错误）→ 以 `.then(ok, err)` 捕获结果形态
期望: 两个对比入口均以 `FileHandleExhaustedError` reject；`code` 为 `'EMFILE'` / `'ENFILE'`；`message` 同时包含「文件句柄」与原始错误码（EMFILE / ENFILE）；不 resolve 出部分 `DirectoryComparison`、不返回空树、不静默吞；`EACCES` 等无关错误经 `toReadableIoError` 原样返回（不误转）

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `src/core/io.test.ts` 'converts EMFILE and ENFILE into a readable error that keeps the code' 与 'leaves unrelated failures untouched'；`compare.test.ts` 'rejects file-handle exhaustion with a readable error instead of a partial result'；`snapshot.test.ts` 'rejects file-handle exhaustion with a readable error for directory sides'。三处均断言 instance / code / message 含「文件句柄」。`mapWithLimit` 首错停止并由 `Promise.all` 收敛后 rethrow，不产出部分数组。
