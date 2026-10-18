covers: ac-gates-green
标题: 六条门禁全绿
步骤: 依次执行 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test`
期望: 六条门禁命令全部成功退出（绿），无 lint/typecheck 错误，桌面端与 Web 端构建成功，vitest 全绿

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: 本机依次执行六条门禁并记录退出码：pnpm install=0、lint=0、typecheck=0、build=0（out/renderer 产物生成）、build:web=0（dist/web 产物生成）、test=0（8 文件 / 36 用例全绿）；无 lint/typecheck 报错。
