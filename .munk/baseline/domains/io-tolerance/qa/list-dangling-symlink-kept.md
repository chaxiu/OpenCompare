# list-dangling-symlink-kept

covers: ac-list-dangling-symlink-kept
标题: 目录含悬空符号链接时 `listDirectory` 正常 resolve，坏项保留并标注
步骤: 在临时目录建 `tree/kept.txt`、`tree/nested/`，并 `symlink('/nonexistent-opencompare-target', tree/dangling)` → `platform.listDirectory(tree)` → 对比同目录逐条 `stat` 的串行结果
期望: resolve；返回条目数为 N+1（本用例 3 = kept.txt + nested + dangling）；dangling 项 `broken === true`、`skippedReason` 为非空字符串、`isDirectory === false`；健康条目（kept.txt / nested）不带 `broken` 且 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 与串行 `stat` 逐字段一致

## 最近执行

- workItemId: wi_intake_1c49316bd5fe94ba
- at: 2026-10-21
- status: pass
- note: `src/main/platform/electron-platform.test.ts` 'keeps a dangling symbolic link in the listing and flags it broken'。断言条目数 3、`broken === true`、`skippedReason` truthy、`isDirectory === false`，并用 `arrayContaining(serial)` 校验健康条目字段与 `stat` 一致。
