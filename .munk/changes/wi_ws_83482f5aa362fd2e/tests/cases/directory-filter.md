covers: ac-filter
标题: 一键过滤在全部/仅差异/左独有/右独有/相同间切换，只保留匹配条目及其祖先目录且统计更新
步骤: 目录对比会话中依次点击过滤控件的「全部 / 仅差异 / 左独有 / 右独有 / 相同」五档，每次观察双栏树保留项与统计（状态栏 / 图例 / 徽章）
期望: 过滤控件含全部五档且当前档位可见；切换后树中只保留匹配该档状态的文件条目及其祖先目录（不匹配项及其空目录被隐藏，树仍呈路径层级）；「仅差异」=added+removed+modified、「左独有」=removed、「右独有」=added、「相同」=same；统计随过滤结果同步更新

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: web 会话 5199 实测：SegmentedControl 含五档 全部/仅差异/左独有/右独有/相同，当前档高亮。全部=全树（6 相同 4 新增 4 删除 5 修改）；仅差异=去 same（0 相同 4 新增 4 删除 5 修改）；左独有=仅删除（docs/changelog.md、README.md、src/core/lexer.ts、src/utils/numbers.ts）+祖先目录（0 相同 0 新增 4 删除 0 修改）；右独有=仅新增（CHANGELOG.md、docs/migration.md、src/core/utils/format.ts、src/ui/workbench/StatsPanel.tsx）+祖先目录（0 相同 4 新增 0 删除 0 修改）；相同=仅 6 个 same（6 相同 0 0 0）。树只保留匹配条目及祖先目录，图例（当前可见项聚合）随过滤同步更新；语义定义（仅差异=新增+删除+修改、左独有=删除、右独有=新增、相同=相同）全部符合。
