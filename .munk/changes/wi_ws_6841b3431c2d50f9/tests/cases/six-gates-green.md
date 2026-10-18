covers: ac-gates-green
标题: 六条门禁全绿，且新增 vitest 覆盖同步计划与模板匹配
步骤: 依次执行 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test`；并审阅 `pnpm test` 输出中的新增用例
期望: 六条门禁命令全部成功退出（绿），无 lint/typecheck 错误，桌面端与 Web 端均构建成功；`pnpm test` 含新增 vitest 用例，覆盖同步计划（copy/update/delete 分类、镜像仅列目标独有、执行写入与幂等、逐项取消删除）与模板匹配（文件名+内容哈希映射、缺失/冲突/未使用、1,200 文件线性且不重复读取、提取后复核重建模板结构）

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: mtime 修复后重跑：pnpm install/lint/typecheck/build/build:web/test 全部 exit 0；vitest 12 files / 62 tests 通过；新增用例含 sync 计划分类/镜像删除/写入+父目录+缓存失效+幂等/逐项取消删除、真实磁盘 Electron IPC 同步回归，以及模板 name+hash/缺失/冲突/unused/1200 文件单次读哈希/提取后 scoped 复核 missing=0
