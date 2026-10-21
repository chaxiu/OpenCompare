# real-trees

covers: ac-real-trees
标题: env-gated 真实工程目录对比完成、不抛错、`skipped >= 1`
步骤: 以 `OPENCOMPARE_REAL_LEFT=<真实目录A> OPENCOMPARE_REAL_RIGHT=<真实目录B> pnpm test` 运行；用例用真实 `platform.listDirectory` / `readTextFile` 跑 `compareDirectories`，并在控制台打印 `fileCount` / `counts` / `skipped`；不设置环境变量时该 describe 整体 skip
期望: 设置变量时：对比 resolve 不 throw；`fileCount === same + added + removed + modified`；`skipped >= 1`（如 `.claude/skills` 下的悬空链接被计入）；日志输出 `[real-trees] <left> ↔ <right>: fileCount=… same=… added=… removed=… modified=… skipped=…`。未设置时：0 个执行、1 个 skipped，源码不出现本机绝对路径常量

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: na
- note: `electron-platform.test.ts` `describe.skipIf(REAL_LEFT === undefined || REAL_RIGHT === undefined)('real project trees')`，本轮 code_gates 的 `pnpm test` 统计为 430 passed | 1 skipped，即该用例默认跳过——交付环境未设置 `OPENCOMPARE_REAL_LEFT` / `OPENCOMPARE_REAL_RIGHT`，未执行 DawnChat ↔ ZenMind 真机规模验收，需负责人本机复跑。用例超时放宽到 900s，路径只来自 env，无硬编码。
