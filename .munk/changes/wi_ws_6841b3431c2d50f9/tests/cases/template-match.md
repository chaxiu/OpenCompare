covers: ac-template-match
标题: 匹配器以文件名 + SHA-256 内容哈希把散乱树 B 的文件映射到模板 A 的相对路径槽位，正确产出已匹配/缺失/冲突并列出 B 未使用文件
步骤: 在 vitest（Node）中构造模板 A（多个相对路径槽位）与层级被打乱的树 B，B 含「同名同内容」「无同名候选」「同名但内容不同」「同名多候选」「无对应槽位的多余文件」→ 调用 `matchTemplate(templateTree, incomingTree, io)`
期望: `matched` 按 A 相对路径槽位给出归位映射（`relativePath` ← `sourcePath`，文件名一致且 SHA-256 内容哈希一致）；`missing` 为在 B 中无同名候选的槽位；`conflict` 覆盖同名候选内容不同（`content-mismatch`）与同名候选多于一个（`ambiguous`，`candidates.length>1`）；`unused` 列出 B 中未被任何槽位消费的文件；`templateFileCount` 等于模板文件槽位数

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: vitest 实测：templateFileCount=6；matched 3 槽位按 name+hash 映射（a/strings.ts ← /incoming/x/strings.ts）；missing=[d/missing.ts]；conflict 含 ambiguous（e/twin.ts, candidates=2）与 content-mismatch（f/mismatch.ts）；unused 4 条
