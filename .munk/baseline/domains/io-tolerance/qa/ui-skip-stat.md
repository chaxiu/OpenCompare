# ui-skip-stat

covers: ac-ui-skip-stat
标题: 目录视图在 `skipped > 0` 时展示跳过计数，`skipped === 0` 时不展示
步骤: 同上构造含 1 个 broken 条目的目录对比，进入目录会话视图 → 统计页面中「已跳过 1 个不可读项/悬空链接」出现次数；再对全可读目录检查该文案不存在
期望: `skipped > 0` 时该文案在页面上出现两处（工作台 info notice + 目录视图内计数）；`skipped === 0` 时页面无「已跳过」文案；计数引用现有 token（`text-2xs` + `text-diff-added`），不新造组件或弹窗

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `App.test.tsx` 'reports skipped dangling entries as an info notice and a view count' 断言 `getAllByText('已跳过 1 个不可读项/悬空链接')` 长度为 2；'shows no skip notice when every entry was readable' 断言无「已跳过」。视图侧实现为 `DirectoryView` 在过滤栏下方渲染一行计数说明。
