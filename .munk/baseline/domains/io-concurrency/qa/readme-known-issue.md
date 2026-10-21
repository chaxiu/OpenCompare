covers: ac-readme-known-issue
标题: README 有「已知问题」段，写明 v0.2.1 及更早版本的 EMFILE 与当前修复口径
步骤: 阅读 `README.md`，定位「已知问题」小节 → 核对是否同时出现：受影响版本范围（v0.2.1 及更早）、触发场景（拖入含数千文件的真实文件夹）、原始错误形态（`platform:read-text-file EMFILE`）、当前修复（默认 8 路有界并发 + 「文件句柄耗尽（EMFILE）」可读提示）、不崩窗口
期望: 「已知问题」段存在且上述要素齐全；版本范围、触发场景、错误码与修复描述与实现口径一致（默认 `DEFAULT_IO_CONCURRENCY = 8`，错误消息含「文件句柄」）；不写空话套话，不声称未做的能力

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `README.md` 在架构目录树后新增「## 已知问题」，条目写：v0.2.1 及更早版本拖入含数千文件的真实文件夹时目录内容读取会一次性并发打开全部文件，可能报 `platform:read-text-file EMFILE`；当前版本已修复为「目录内容读取与目录条目元数据查询默认 8 路有界并发」并在句柄耗尽时经既有提示展示「文件句柄耗尽（EMFILE）」的可读错误、不崩窗口。与 `src/core/io.ts` 的 `DEFAULT_IO_CONCURRENCY = 8` 及错误文案一致。
