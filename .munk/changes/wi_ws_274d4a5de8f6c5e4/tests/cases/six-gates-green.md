covers: ac-gates-green
标题: 六条门禁全绿（含随新视图更新的 App.test.tsx）
步骤: 依次执行 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test`；并查看 `pnpm test` 中 CSV 对齐引擎与视图相关用例及 `App.test.tsx` 的下钻断言
期望: 六条门禁全部通过；`pnpm test` 全绿且包含随新视图同步更新的 `App.test.tsx`（`report.csv` 下钻断言），以及新增的 CSV 对齐引擎 vitest 用例

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 六条门禁全绿：pnpm install（Already up to date, exit 0）、pnpm lint（eslint 无输出）、pnpm typecheck（tsc 无输出）、pnpm build（electron-vite：main/preload/renderer 均 built）、pnpm build:web（dist/web 产出）、pnpm test → 11 files / 62 tests 全通过（含 src/core/csv/align.test.ts 10、src/renderer/src/views/CsvView.test.tsx 5、src/renderer/src/App.test.tsx 9 内含 report.csv 下钻断言「对齐 4 行 · 主键 order_id」与 status bar 2相同1新增0删除1修改）。
