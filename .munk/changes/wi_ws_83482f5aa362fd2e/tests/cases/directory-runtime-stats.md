covers: ac-runtime-stats
标题: 目录对比统计（状态栏/图例/徽章）来自运行时引擎计算结果而非样本 answer key
步骤: 1) 加载内置样本目录完成对比，核对状态栏「文件（源）」「文件（目标）」「差异」与图例/徽章计数是否等于引擎运行时 `comparison.counts` 推导值；2) 在 Electron（`pnpm dev`）下选一对含已知差异的本地目录完成对比，观察同一批统计随真实文件差异变化
期望: 状态栏 / 图例 / 徽章统计全部由运行时对比结果计算（文件（源）=same+removed+modified、文件（目标）=same+added+modified、差异=added+removed+modified），不读取样本 `DirectoryNode.status` answer key；改变实际目录内容后统计随之变化，与引擎 `counts` 始终一致

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: web 会话 5199 实测统计由运行时引擎推导：6 相同 · 4 新增 · 4 删除 · 5 修改；文件（源）15、文件（目标）15、差异 13。公式全部成立：文件（源）=6+4+5=15、文件（目标）=6+4+5=15、差异=4+4+5=13。与 fixture 答案键（src/shared/fixtures/scenes.ts 的 DIRECTORY_COMPOSITION 由 countStatus 推导，modified=5 含 src/ui/workbench/Shell.tsx）一致，未读取 DirectoryNode.status 作为视图输入。更正我 brief 中「4 修改 / 14/14/12」的口径：漏算 Shell.tsx（双侧 modified），应用行为正确，非缺陷。Electron 本地目录侧未在本会话验证（无桌面会话），由代码证据确认同一统计链路。
