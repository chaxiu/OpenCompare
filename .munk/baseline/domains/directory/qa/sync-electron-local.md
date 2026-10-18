covers: ac-sync-electron-local
标题: Electron（pnpm dev）下对两个真实本地目录完成 dry-run → 确认 → 磁盘写入 → 重新对比闭环
步骤: 执行 `pnpm dev` 拉起 Electron → 「选择左目录」「选择右目录」各选一个真实本地目录并触发对比 → 选方向与模式后点「预览并同步」→ 点「确认执行」→ 检查磁盘目标目录与刷新后的对比树
期望: 弹窗列出真实本地目录的变更清单；确认后经 Electron IPC（`platform:write-text-file`/`ensure-directory`/`delete-file`）实际写入磁盘，目标目录出现待新增文件、`modified` 文件被覆盖、镜像模式删除项被删除，缺失父目录自动创建；自动重跑对比后对应差异消除（同一方向再次预览计划为空）；执行失败时给出可理解错误且不静默半途写坏目标侧

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: 修复后复验（真实 IPC handler + 真实临时目录 + 渲染层 previewSync/applySyncPreview）：增量 apply 后自动重跑 counts={same:3,added:1,removed:0,modified:0}、第二次同方向计划 totalCount=0 且目标文件 mtime=源 mtime（保 mtime 写入生效，父目录 nested/ 自动创建）；镜像模式 delete 2 项、按 deletePaths 只删选中项（drop-me 消失、keep-me 保留）；写入失败（目标侧 nested 为普通文件）时 applySyncPreview 如实 reject、无静默半途写坏；产品回归 src/main/platform/electron-platform.test.ts 同场景全绿
