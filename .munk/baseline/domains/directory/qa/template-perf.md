covers: ac-template-perf
标题: 匹配基于哈希/文件名索引，1,000+ 文件的合成散乱树仍在线性时间内完成且不对同一文件重复读取内容 / 计算哈希
步骤: 在 vitest 中用 1,200 个文件合成模板 A 与层级打乱的树 B，给 `readTextFile` 与哈希函数装上计数桩 → 调用 `matchTemplate`
期望: 匹配经文件名索引 + 内容哈希索引完成，线性复杂度、不做两两内容比对（1,200 文件可完成）；每个文件最多读取一次、哈希一次（读取路径无重复，哈希调用数 = 读取次数）；`matched` 数等于模板文件数，`missing` 与 `conflicts` 为空

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: vitest 实测 1,200 文件合成树：matched=1200、missing/conflicts 空；readTextFile 计数 2400 且路径集合无重复（每个文件仅读一次），hash 调用数 2400 = 读取数；10ms 级完成
