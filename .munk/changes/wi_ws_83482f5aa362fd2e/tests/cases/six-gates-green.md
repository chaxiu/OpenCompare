covers: ac-gates-green
标题: 六条门禁全绿，且新增 vitest 覆盖引擎四类状态、增量短路与过滤谓词
步骤: 依次执行 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test`；并审阅 `pnpm test` 输出中的新增用例
期望: 六条门禁命令全部成功退出（绿），无 lint/typecheck 错误，桌面端与 Web 端均构建成功；`pnpm test` 含新增 vitest 用例，覆盖目录对比引擎四类状态（same/added/removed/modified）、增量短路（大小/mtime 相同不读内容、重复比对不重复哈希）与过滤谓词（全部/仅差异/左独有/右独有/相同）

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: Host code-gates 两次全绿：attempt 001 与 attempt 002（.munk/runs/run_ws_5ecf9b6fe08c3744/code-gates/latest.json：ok=true, failedGateIds=[]），6 条门禁 install/lint/typecheck/build/build-web/test 均 exitCode 0。新 PATH 下本地复跑同样全绿（test = 6 files / 30 tests）。新增/更新 vitest 覆盖引擎四类状态、增量短路与五档过滤谓词（src/core/directory/compare.test.ts）与目录视图/下钻/降级（src/renderer/src/App.test.tsx）。
