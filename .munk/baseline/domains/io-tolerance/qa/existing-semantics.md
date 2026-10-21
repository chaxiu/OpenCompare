# existing-semantics

covers: ac-existing-semantics
标题: 不含异常条目的树，分类 / 快路径 / 快照与同步既有测试全部保持通过
步骤: 运行 `pnpm test` 全量套件（含 `compare.test.ts` / `snapshot.test.ts` / `sync.test.ts` / `template.test.ts` / `electron-platform.test.ts` / `App.test.tsx`）→ 抽查「大小相同但内容不同判 modified」「size+mtime 相同走缓存不重读」「快照导入导出往返」「镜像同步 dry-run → 应用 → 幂等」
期望: 27 个测试文件全绿（430 passed / 1 个 env-gated skip）；四态分类、SHA-256 内容确认、缓存命中不重复读取、快照线格式与同步计划语义与改造前一致；健康目录的 `skipped` 为 0、`fileCount` 仍等于四态之和

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: code_gates attempt 001：install / lint / typecheck / build / build-web / test 六条全绿；`vitest run` 27 files、430 tests passed、1 skipped（仅 `real project trees`）。既有 `compare` / `snapshot` / `sync` / `template` / `electron-platform` / `App` 用例无一改动断言口径。
