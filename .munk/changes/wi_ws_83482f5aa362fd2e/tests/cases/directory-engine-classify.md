covers: ac-engine-classify
标题: 目录对比引擎按相对路径配对并产出相同/右独有/左独有/修改四类状态（含 SHA-256 判定同大小不同内容）
步骤: 在 vitest（Node 环境）中构造左右两棵扫描树——左侧含 `same.txt`（两侧同大小同内容）、`left-only.ts`（仅左）、`move/size-differs.csv`（同路径但大小不同）、`same-size.ts`（两侧大小与 mtime 相同但内容不同）；右侧含 `right-only.ts`（仅右）、`shortcut.ts` 与 `same.ts` 同大小同内容——调用 `scanDirectory` + `compareScannedTrees`（或 `compareDirectories`）
期望: 按相对路径一一配对，逐文件状态正确：`same.txt`/`same.ts`=same、`right-only.ts`=added（右独有）、`left-only.ts`=removed（左独有）、`move/size-differs.csv`=modified（大小不同）、`same-size.ts`=modified（大小相同但 SHA-256 内容哈希不同）；根节点 `counts` 与 `fileCount` 等于四类计数之和，目录状态由其自身与后代聚合得出

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: vitest 实跑通过（pnpm test）。src/core/directory/compare.test.ts 'classifies same / right-only / left-only / modified by relative path'：按相对路径配对，same/added(右独有)/removed(左独有)/modified 四类正确；大小不同=modified；大小与 mtime 相同但正文不同经 SHA-256 判为 modified；counts 与 fileCount 等于四类之和，目录状态由后代聚合。sha256Hex 与 node:crypto 参考摘要一致。
