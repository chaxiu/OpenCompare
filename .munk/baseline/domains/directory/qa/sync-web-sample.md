covers: ac-sync-web-sample
标题: Web（pnpm dev:web）下用内置样本目录 / 内存可写区完成同一同步闭环，内置样本库保持只读、可重复一键加载
步骤: 执行 `pnpm dev:web` → 点「加载样本目录」得到目录对比会话 → 选方向与模式点「预览并同步」→ 点「确认执行」→ 观察写入落点与刷新后的对比树 → 再次点「加载样本目录」
期望: Web 模式下目标侧为只读样本挂载 `/samples` 时先物化到可写区（`/memory/**` 或临时目录）再执行，写入不落在 `/samples`；确认后经 Web 内存 `PlatformPort` 写入并自动重跑对比刷新目录树与统计；`/samples/directory/baseline` 与 `/samples/directory/candidate` 内容保持不变，样本库可重复一键加载（写操作不污染 `/samples`）

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: mtime 修复后 Web 复验：预览目标根 /memory/workbench/1-candidate（只读样本树确认后物化到可写区）；确认提示「同步完成：新增拷贝 4 · 覆盖 5 · 删除 0。」、刷新后 15 相同/4 新增/0 修改；再次「加载样本目录」恢复 6/4/4/5 与 15·15·差异13，连续两次加载均可，/samples 未被写污染
