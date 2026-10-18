covers: ac-engine-incremental
标题: 大小与修改时间都相同即短路判相同，重复比对同一目录树不重复读内容/哈希
步骤: 在 vitest 中给 `listDirectory` / `readTextFile` 与哈希函数装上计数桩；共享同一个 `ComparisonCache`，对同一对未变化的目录树先后调用两次 `compareDirectories`；树内含「大小相同、mtime 相同但内容不同」与「大小不同」两类文件对
期望: 大小或 mtime 任一不同的文件对不读内容（`readTextFile` 0 次）即直接判定；仅大小与 mtime 都相同者进入内容哈希确认，且只在首次读取与计算 SHA-256；第二次比对 `planContentReads` 为空，`readTextFile` 与哈希调用均为 0 次（已比对条目按路径/大小/mtime 命中缓存）

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: vitest 实跑通过。compare.test.ts 'settles size/mtime mismatches without reading bodies and reuses the hash cache'：planContentReads 仅列「大小+mtime 都相同」的 4 个候选，其余不读正文；首次比对 hashCalls=4，二次比对 planContentReads=[] 且 hashCalls 仍为 4（命中缓存）。'reads bodies through the platform capability exactly once per candidate'：重复 compareDirectories 后 readTextFile 调用不增加。
