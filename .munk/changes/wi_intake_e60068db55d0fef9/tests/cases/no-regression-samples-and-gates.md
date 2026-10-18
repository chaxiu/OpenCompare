# no-regression-samples-and-gates

covers: ac-no-regression
标题: 内置样本主链路无回归且 pnpm test / typecheck / lint 全绿
步骤: 1) 依次执行 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test`（如需另跑 `pnpm build` / `pnpm build:web`）；2) 启动应用并加载内置样本，依次走目录对比与增量同步、样本双栏 Diff 与三向合并、CSV 主键对齐、JSON/YAML 语义对比；3) 在样本会话中试用新增的打开/保存本地文件入口
期望: 门禁命令全部成功退出、无 lint/typecheck 报错、vitest 全绿；内置样本四条主链路正常加载与交互（目录统计、差异块计数、冲突列表、对齐行数、结构化变更计数与样本加载前一致）；打开/保存本地文件不修改样本挂载与样本会话（`/samples` 保持只读）

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: 门禁全绿：pnpm lint（无输出即通过）、pnpm typecheck（tsc --noEmit 通过）、pnpm test 20 文件 155 用例全通过。Web 启动并加载内置样本：目录/代码/CSV/结构化四链路正常，代码双栏 Diff 1/3、三向合并 3 冲突、CSV 1,264 行主键 order_id、结构化 15 节点计数(4/0/5/1/5) 与样本一致；在样本会话中试用打开/保存本地文件入口后样本挂载不变——Web/Electron 的 PlatformPort 均对 /samples 只读（assertWritable 抛错，web-platform.test.ts 覆盖），打开文件仅写入 /memory/*，样本会话统计保持在切换前一致。
