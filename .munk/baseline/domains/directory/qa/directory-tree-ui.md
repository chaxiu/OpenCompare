covers: ac-tree-ui
标题: 目录对比视图呈现左右双栏树、目录可展开/折叠、逐行差异徽章与目录后代聚合计数
步骤: 加载目录对比会话 → 观察左右两栏是否分别为左右目录树；点击目录行展开再折叠；检查文件行徽章与目录行计数；切到 Web（`pnpm dev:web`）与桌面（`pnpm dev`）各复现一次
期望: 呈现左右双栏树（左为源目录、右为目标目录），目录行可展开/折叠；每个文件行显示差异语义徽章（same/added/removed/modified，复用 `DiffBadge` 与 `--color-diff-*`）；目录行显示其后代差异聚合计数，与引擎 `counts` 一致；两端均无白屏/渲染报错

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: web 会话 isess_471ed727efaa（5199 构建）实测：左 baseline/源目录、右 candidate/目标目录 双栏递归树；点 left `src` 折叠按钮后其子节点消失、仅剩聚合行 `src +2 −2 ~3 修改`（右树 src 保持展开，双栏独立），再展开恢复 → 展开/折叠往返正常；文件行徽章齐全（修改：engine.ts/report.csv/Shell.tsx/deploy.yaml/logo.png；新增：CHANGELOG.md/migration.md/format.ts/StatsPanel.tsx；删除：changelog.md/README.md/lexer.ts/numbers.ts；相同：guide.md/package.json/parser.ts/strings.ts/tokens.ts/SplitPane.tsx）；目录行显示后代聚合计数（src +2 −2 ~3、core +1 −2 ~1、ui +1 ~1、workbench +1 ~1）。无白屏/渲染报错。样本为干净嵌套树，未出现「incoming 散乱目录树 B」（非 5183 旧构建）。
