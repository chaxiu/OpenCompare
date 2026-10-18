covers: ac-sync-apply-refresh
标题: 确认后经 PlatformPort 实际写入（缺失父目录自动创建），完成后自动重跑对比并刷新目录树与统计，再执行同一方向时计划为空（幂等）
步骤: 打开 Dry-run 预览后点「确认执行」→ 观察目标侧写入与视图刷新 → 对同一方向再次点「预览并同步」
期望: 经 `PlatformPort`（`writeTextFile`/`ensureDirectory`）实际写入目标侧，缺失的中间父目录自动创建；写入完成后自动重跑 `compareDirectories` 并刷新目录树、徽章与状态栏统计（提示「同步完成：新增拷贝 N · 覆盖 M · 删除 K」）；受影响路径的比对缓存被失效，再次对同一方向预览时计划为空（`totalCount=0`），确认按钮禁用或提示「该方向没有需要同步的变更」

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: mtime 修复后 Web 复验：确认提示「同步完成：新增拷贝 4 · 覆盖 5 · 删除 0。」；刷新后 15 相同/4 新增/0 删除/0 修改（4 个源独有文件写入后显示「相同」，modified=0），目标根切至 /memory/workbench/1-candidate；二次同方向预览「合计 0 项 / 0 B」+「该方向没有需要同步的变更」+确认按钮 disabled
