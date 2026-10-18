covers: ac-snapshot-filter
标题: 快照参与对比时状态过滤与计数正确联动
步骤: 加载「远端快照样本」对比 → 依次点击差异过滤的「仅差异」「右独有（快照侧）」「相同」「全部」
期望: 「仅差异」下同内容文件（如 parser.ts、guide.md）从两侧消失且差异计数不变；「右独有」只显示仅存在于快照侧的文件（如 config/limits.json、src/core/worker.ts）；「相同」只显示内容一致的配对文件；切回「全部」恢复完整树；每次切换后状态栏图例与可见条目一致。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：仅差异→左右均无 parser.ts/guide.md，图例 3新增/4删除/5修改不变；右独有→右侧仅 config/limits.json、src/core/worker.ts、src/data/metrics.csv；相同→6 对配对文件左右一致；全部→恢复 25/23 项，图例回到 6相同/3新增/4删除/5修改，与可见条目一致。
