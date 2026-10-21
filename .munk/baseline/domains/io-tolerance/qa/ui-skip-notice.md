# ui-skip-notice

covers: ac-ui-skip-notice
标题: 对比成功且 `skipped > 0` 时以 info 级提示「已跳过 N 个不可读项/悬空链接」
步骤: 用 `scriptedPort` + 在左侧 `listDirectory` 追加一个 `broken: true` 条目 → 拖入两个目录路径触发对比 → 读 `role="alert"` 的文案与样式类；再用全可读目录跑一次对照
期望: 提示文案匹配 `已跳过 1 个不可读项/悬空链接`；tone 为 info（`text-diff-added`，非 `text-danger`）；对比仍算成功并建立目录会话（不是错误终止、不是空会话）；全可读时 `screen.queryByText(/已跳过/)` 为 `null`

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `src/renderer/src/App.test.tsx` 'reports skipped dangling entries as an info notice and a view count' 与 'shows no skip notice when every entry was readable'。`Workbench` 在 `compareSides` 成功后 `if (comparison.skipped > 0) report(…, 'info')`，复用既有 notice 通道（`noticeTone === 'info' ? 'text-diff-added' : 'text-danger'`）。
