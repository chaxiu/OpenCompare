covers: ac-virtual-scroll
标题: 千行对齐表用 @tanstack/react-virtual 虚拟滚动，实际渲染 tr 数远小于总行数
步骤: 打开内置 1,240 行 CSV 对齐会话 → 在表体内上下滚动 → 统计 DOM 中实际渲染的 `tr` 数量
期望: 对齐表使用 `@tanstack/react-virtual` 固定行高虚拟滚动；1,240 行级样本滚动流畅；实际渲染的 `tr` 数远小于对齐行总数（只与视口相关，不随总行数增长）

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: web 实测 1,264 行对齐表：滚动容器 clientHeight 520 / scrollHeight 35,417；顶部 tbody tr=32（31 数据行 + 1 aria-hidden 占位行，行高 28px），中部 45、底部 31，始终 ≪ 1,264 且不随总行数增长；首行 order_id 由 ORD-100522(#1) → ORD-100508(#612) → ORD-100892(#1235)，末行 ORD-200005(#1264)。40 帧滚动探针最大帧间隔 18ms、无 >32ms 帧，零 console 错误；源码 CsvView.tsx:91-96 使用 useVirtualizer(count=rows.length, estimateSize=28, overscan=12)。
