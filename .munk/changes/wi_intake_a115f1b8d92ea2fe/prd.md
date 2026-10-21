# 目录对比树窗口化渲染，消除大目录 renderer OOM

## 范围

**问题（实测证据）**：真实 134 万文件目录对在 renderer 触发 V8 OOM。2026-10-21 实机验收 `trun_f613182a6c473dd2`（被测 main `75848af`）：1.1M 节点对比 258 秒后 OOM（堆 3.29 GB / 上限同级），崩溃时 DOM Nodes 仅 187 —— 死点在渲染进程内的树构建 / 对比 / 行物化；中间规模 40,551 文件 5.36 秒 ready，却产生 DOM Nodes 645,240（约 16 节点/行，零虚拟化），按此外推 1.1M 行必再 OOM。

**本期改什么**（只动 renderer 呈现层与纯行模型）：
- `DirectoryView` 不再对整树做 `filterDirectoryTree` + 左右 `projectDirectoryTree` 克隆；改为从完整语义树按需生成「可视行」轻量索引（只持有节点引用 + depth，不复制节点、不复制 children）。
- `TreeView` 从全量递归物化改为可视窗口渲染：只渲染视口行 + 常量 overscan，DOM 节点数与渲染行数有界且不随总条目数线性增长。优先复用既有依赖 `@tanstack/react-virtual`（或等价窗口方案）。
- Workbench 的目录统计（`visibleCounts`）改为按过滤档直接从根节点 `counts` 派生，不再为统计克隆过滤树。
- 五段过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）、左右投影、展开/折叠、选中、双击下钻、逐级返回的状态语义与四态统计、对比结果全部保持不变。
- 新增自动化：真实临时大目录 fixture（两侧合计 ≥5 万条目）下的 DOM 有界性、远端滚动正确性、五档过滤行集一致性、下钻返回状态恢复；并保证既有 directory / 样本 / renderer 套件零回归。
- 交付证据：5 万级自动化全绿；如环境允许复测真实 1.1M 目录，如实记录瓶颈归因（不做范围扩张）。

## 验收

- ac-rows-filter-parity: 对同一 `DirectoryComparison` 在全部展开、5 档过滤 × 左右两侧下，行模型输出的 `(relativePath, name, kind, depth, status)` 序列与现有 `filterDirectoryTree`→`projectDirectoryTree`→既有先序遍历（根节点为第 0 行）逐项完全相等（含顺序、含投影后遗留的空目录行）；该断言在 ≥5 万条目真实 fixture 上通过。
- ac-rows-collapse-parity: 对任意折叠集合（含父目录与子目录同时折叠），行模型等于「先序遍历但跳过折叠目录的子树」，折叠目录自身所在行仍保留且位置不变；折叠集合为空时行模型与全部展开一致。
- ac-row-model-no-clone: 行模型条目中的节点与 `comparison.root` 子树节点是同一对象引用（`===`），构造 5 档 × 2 侧行模型前后抽样节点身份不变；渲染/过滤/滚动过程中，`DirectoryView` 不再调用 `filterDirectoryTree` / `projectDirectoryTree`（以 mock 计数断言为 0）。
- ac-bounded-dom-50k: 在 1200×640 视口的 ≥5 万条目真实 fixture 上，首屏渲染后每栏 `[role="treeitem"]` 数量 ≤ 80，双栏 `document` 内 DOM 元素总数 ≤ 5000；滚动到中部、底部并重复 20 次后仍满足且不单调增长（稳定有界）。
- ac-dom-independent-of-total: 同一 1200×640 视口下渲染 5,000 行规模的对比与 5 万+ 行规模的对比，`[role="treeitem"]` 数量相同（±2），DOM 元素总数差异 ≤ 10%；两者滚动到相同比例位置后同样成立（即渲染量不随总行数线性增长）。
- ac-expand-large-folder-bounded: 展开一个含 ≥2 万直接子项的目录后，每栏渲染行数仍 ≤ 80，滚动到底部能取到该目录按名称排序的最后一行。
- ac-scroll-far-rows: 将左栏 `scrollTop` 设为接近内容底部并触发 `scroll` 后，渲染行索引严格递增且无重复；索引集合同时覆盖 `floor(scrollTop/行高)` 与 `floor((scrollTop+视口高-1)/行高)`，每行的 name/status/depth 与行模型对应索引逐项一致；滚动占位总高 = 行数 × 行高（±1px）。
- ac-five-filter-switch: 依次切换到 5 档过滤，每档渲染出的 DOM 行都是该档行模型的前缀窗口（含首行根节点，无上一档残留行）；空结果档不渲染任何 `treeitem` 并显示既有文案「当前过滤下…目录没有条目。」；各档行数与行模型 `length` 一致（窗口外行不进入 DOM）。
- ac-visible-counts-parity: 5 档过滤下 `visibleCounts` 与既有 `countTreeFiles(filterDirectoryTree(root, filter))` 的四态计数逐项相等（`conflict` 恒为 0）；根目录无匹配文件时四态全为 0。
- ac-drilldown-restore: 在过滤 + 折叠 + 选中 + 滚动到非零位置后卸载视图，再以 shell 保存的同一状态重挂载（等价下钻返回）：两栏 `scrollTop` 恢复为保存值（±1），选中行 `aria-selected="true"` 且位于渲染窗口内，折叠目录的子项不渲染，过滤档高亮与行集保持原档，根节点仍为第 0 行。
- ac-existing-suites-green: `pnpm test` 既有 `src/core/directory/**`、样本与 renderer 套件零回归；`code_gates` 六条（install / lint / typecheck / build / build:web / test）全绿。

## 非目标

- 不改四态语义、对比/合并算法、行级 diff、快照线格式与发布模型。
- 不动扫描 / IPC 取数契约：不修改 `src/main/**` 扫描与 IPC、`src/preload/**`、`src/shared/platform/**`；批量列目录另有在飞工作项 `wi_ws_deb41e1c6a5a2b8f`，本期不得同时改扫描层。
- 不新增默认忽略规则；不砍 unreadable / 悬空链接 / 不可读子树的容错。
- 不把 `ScannedTree` / `DirectoryComparison` 搬到主进程或 worker；本期只做 renderer 窗口化。若窗口化后真实 1.1M 仍 OOM，只写瓶颈归因与下一步建议，不自行扩线。
- 不「先全量渲染再隐藏」冒充虚拟化；不通过缩减 fixture 条目数或收窄过滤档达标。
- 不顺手修既有投影语义（例如为空目录行去噪）、不新增过滤档、不改空态/工具栏文案、不改 CSV / 代码视图的虚拟化实现。
- 不新增依赖；不引入新的全局状态容器或新页面。

## 实现约束

- 窗口方案优先 `@tanstack/react-virtual`（已在依赖中，CSV 视图已有同款用法）；允许「保留完整语义树 + 可视窗口遍历」或「轻量行索引」，二者都必须满足 ac-row-model-no-clone。
- 行模型必须是纯函数/纯类，放 `src/core/directory/`（Node 环境可直接单测），零 Electron / DOM 依赖；能按 `(root, filter, side, collapsed)` 产出：行数、按索引取行、以及按需的可见四态计数。
- 行高沿用现有 `h-6`（24px）并收敛为单一常量，占位计算与测试都从该常量推导，禁止出现第二个魔法行高。
- 行模型只在 `filter` / `side` / 折叠集合「内容」变化时重建（折叠集合当前每次渲染都是新 `Set` 引用，需按内容做键或改传稳定数组），不得因外层重渲染对 1.1M 树反复重建。
- 滚动容器仍是 `Panel` 的 body（虚拟化以它为 `getScrollElement`）；下钻返回挂载时需在恢复 `scrollTop` 后让虚拟窗口与之一致，避免先渲染首屏再跳。
- 测试基线：renderer 用例使用 `// @vitest-environment jsdom` 并桩 `clientHeight` / `clientWidth` 为 1200×640（参考 `CsvView.test.tsx`）；滚动以赋值 `scrollTop` + `fireEvent.scroll` 驱动。
- 真实 fixture 用 `mkdtemp` 建临时目录、用例结束递归清理；两侧各 ≥26,000 条目、合计 ≥5 万，嵌套 ≥3 层，四态各 ≥1,000；`same` 对写入后用 `utimes` 固定 mtime，避免状态抖动；用例超时可放宽到 120s 但仍须包含在 `pnpm test` 内。
- 行模型的过滤/投影基准只认现有 `filterDirectoryTree` → `projectDirectoryTree` 行为（文件按 status 过滤、目录有任一匹配后代才保留、投影不剪空目录），测试用其作为 oracle，不另立语义。
- `code_gates` 六条命令与顺序保持现状，不修改 `.munk/code-gates.json`。
