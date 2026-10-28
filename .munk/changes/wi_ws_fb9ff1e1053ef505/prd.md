# 指示条规模护栏与 3 tab / 下钻回归证据

## 范围

本 Phase 只补研发侧自动化护栏与回归证据（vitest，进 `pnpm test`），落点是测试文件，覆盖四件事：

1. **358k 规模护栏**：用直接构造的 358k 行合成 diff 模型断言指示条投影只做一次线性遍历、标记绘制节点数受轨道高度约束（远小于行数）、滚动 / 点选 / 轨道尺寸变化不触发再 diff、再读取、再扫描或再哈希，输入行模型不被复制；
2. **大模型边界**：空 / 全相同 / 仅左删 / 仅右增 / 超长单行在 358k 规模下同样有界且不抛错；
3. **会话回归链路**：3 个会话 tab 来回切换 + 目录会话「下钻文件对 → 指示条 → 返回目录」往返，证明指示条随会话正确挂载 / 卸载、会话之间不串台、切换与返回不新增平台 IO；
4. **证据入口契约**：把指示条现有稳定 `data-*` 与可访问名称钉死，作为 product-qa 实机核对的选取器入口。

已核实的现状与缺口（不要重复展开已有断言）：

- `src/core/text/ruler.ts` 纯几何 + `src/core/text/ruler.test.ts` 已有「358k 行单遍 + 输出有界」用例（Proxy 计数读次数），但只覆盖 core 层混合四态模型，无大模型空 / 全相同 / 单侧 / 超长单行变体。
- `src/renderer/src/components/DiffRuler.tsx` 与 `src/renderer/src/views/CodeView.ruler.test.tsx` 已有常驻 / 逐行聚合 / 视口窗 / 跳转 / 键盘 / 空态 11 例；其中「滚动与点选不再次 diff、不碰 platform」一例只覆盖小模型，且只守了 `readTextFile` / `selectFile` 两个通道。
- `src/renderer/src/App.test.tsx` 已有「3 tab 常驻零扫描零摘要」与「下钻往返」用例，但都不涉及指示条；本 Phase 把指示条接进同一条链路。
- 组件级调用次数、DOM 节点规模、ResizeObserver 重投影、多会话指示条隔离目前全部无自动化覆盖。

## 验收

- ac-scale-single-pass: 以直接构造的 358k 行 `DiffRow[]`（配 `DiffBlock[]`）渲染指示条后，`buildRulerBands` 在同一 `trackHeight` 下只被调用 1 次，且其收到的行数组与传入数组严格同一引用（`toBe` 相等），证明行模型未被复制或浅拷贝。
- ac-scale-marker-bound: 358k 行 `added/removed/modified/same` 逐行交替模型在 trackHeight=800、bandHeight=4 下，标记节点数 ≤ `3 * floor(trackHeight / bandHeight)`（即 600）且 < `rowCount / 100`（即 3580）；每个标记 `top >= 0`、`height >= 0`、`top + height <= trackHeight`；指示条子树 `textContent` 去空白后为空（无逐行文本）。
- ac-scale-row-coverage: 同一 358k 模型下，每个非 `same` 行都存在 `data-diff-status === rows[i].status` 且 `data-start-row <= i <= data-end-row` 的标记；该校验以行与已排序标记同步推进的单遍扫描实现（不得出现 O(rows × markers) 的双层循环）。
- ac-scale-no-reproject: 在渲染后执行「两栏各滚动 3 次 + 点选标记 3 次 + 一次轨道高度变化（stub 的 ResizeObserver 回调把 trackHeight 由 800 改为 640）」后，`buildRulerBands` 累计调用次数 ≤ 2（首绘 1 次 + 尺寸变化 1 次），`diffLineTexts` 调用增量为 0。
- ac-scale-zero-io: 上述滚动 / 点选 / 尺寸变化全程，platform 的 `readTextFile` / `selectFile` / `selectDirectory` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath` 调用计数增量全部为 0。
- ac-scale-large-edges: 358k 规模下的空（0 行）、全相同、仅左删、仅右增、超长单行（单行长度达到 `INLINE_CHAR_LIMIT` 量级）五个模型各自：不抛错、标记数满足 ac-scale-marker-bound 的上界；空与全相同的标记数为 0 且指示条仍挂载、视口窗 `top >= 0`、`top + height <= trackHeight`；仅左删只产出 `removed` 标记、仅右增只产出 `added` 标记。
- ac-tabs-switch-no-io: 同时驻留 3 个会话 tab（其中至少 2 个是带指示条的双栏 diff 会话），在 3 个 tab 间各切换 2 轮后，platform 的 `readTextFile` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath` 调用计数增量全部为 0，且界面不出现扫描 / 摘要重建进度提示。
- ac-tabs-ruler-isolation: 两个不同文件对的 diff tab 各自标记区间（`data-diff-status` + `data-start-row` + `data-end-row` 序列）互不相同；来回切换后每个 tab 的标记区间序列与各自首次渲染时逐项相同；激活目录 tab 时 DOM 中不存在 `[data-diff-ruler]`，切回 code tab 后指示条重新出现。
- ac-drilldown-roundtrip: 目录会话下钻文件对后，DOM 中存在且仅存在 1 个 `[data-diff-ruler]` 且标记数 ≥ 1；点击其中一个标记后两栏 `scrollTop` 相等且等于目标块 `startRow * 20`；点击「返回上级目录视图」后指示条从 DOM 移除、目录树行标题与当前筛选 / 折叠状态与下钻前一致、platform 读取 / 扫描 / 哈希计数增量为 0；再次下钻同一文件对，标记区间序列与首次逐项相同。
- ac-evidence-anchors: 证据入口契约稳定：轨道节点 `data-diff-ruler="true"`、`role="listbox"`、`aria-label` 为 zh `差异指示条` / en `Difference ruler`；每个标记 `role="option"`、`data-diff-status` ∈ {added, removed, modified}、`data-start-row` / `data-end-row` 为数字且 `start <= end`、`aria-label` 匹配 zh `^(新增|删除|修改) · 第 \d+–\d+ 行$` 与 en `^(Added|Removed|Modified) · lines \d+–\d+$`；视口窗元素带可解析为数字的 `data-window-top` / `data-window-height`。
- ac-scope-bounded: 变更路径只含测试文件（如确有缺口，`DiffRuler.tsx` 仅允许新增纯附加的 `data-*` / `aria-*` 属性）；`src/core/text/ruler.ts`、`src/core/text/diff.ts`、`DiffPane.tsx`、`SplitPane.tsx`、`CodeView.tsx`、`TreeView.tsx`、`CsvView.tsx`、`.munk/code-gates.json`、`.munk/code-gates.perf.json` 零 diff；不新增 `test:*` 脚本、不改 vitest 配置。

## 非目标

- 不做实机点选、浏览器 / 真机 / 桌面 L3 验收，不跑 `self_test`；真实 358k 对照对与实机滚动 / 切换 / 就绪观察由 product-qa 承接。
- 不新增长跑 perf 门禁，不跑 `perf:gate`，不改 `code-gates.json` / `code-gates.perf.json` / `test:memory` / `test:cancel` 口径与阈值。
- 不改 `src/core/text/ruler.ts` 的导出语义与几何算法，不改 `DiffRuler` 的绘制、事件与交互行为，不改 `DIFF_ROW_HEIGHT`、`RULER_BAND_HEIGHT`。
- 不改虚拟滚动实现（`TreeView` / `CsvView` 的 `@tanstack/react-virtual` 窗口化、行高常量与 overscan），不改目录行模型 / CSV 行模型构建。
- 不改 `diffLineTexts` / merge / `overwriteBlock` 等对比与合并算法，不改四态语义，不改 i18n 文案与 key 命名。
- 不做视口窗拖动、不新增可访问交互、不新增依赖、不新增 IPC / 平台通道。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。

## 实现约束

- 358k 模型必须直接构造轻量 `DiffRow` / `DiffBlock` 形状（可复用同一行对象常量），严禁对 358k 行文本调用 `diffLineTexts` / `splitLines`；新增用例总耗时控制在数秒级，不得引入多轮迭代的大模型压力循环。
- 358k 规模的渲染断言只针对 `DiffRuler`：`DiffPane` 逐行 `rows.map` 渲染，CodeView 级无法承载 358k 行。`DiffRuler` 需要 i18n，用现有 `@renderer/i18n/testing` 的 `renderWithI18n`；轨道高度沿用既有 stub 手法（`HTMLElement.prototype.clientHeight` 按 `data-diff-ruler` 返回固定值）。直接渲染时需自备两个滚动容器 ref 以驱动滚动断言。
- 调用次数护栏沿用现有测试的透传 spy 做法（`vi.mock('@core/text/ruler')` / `vi.mock('@core/text/diff')` 包一层 `vi.fn(actual)`）；不要为了计数在 production 代码里加计数器、导出测试钩子或改 props 契约。
- jsdom 无 `ResizeObserver`：用 stub 的 `ResizeObserver` 主动回调模拟轨道高度变化。断言口径是「≤1 次重投影 + 零 IO」，不是「永不重投影」。
- 3 tab / 下钻链路沿用 `App.test.tsx` 既有基建：`Workbench` + `scriptedPort`（包装 `createWebPlatformPort`）+ 计数 `readTextFile` / `listDirectory` / `listDirectories` / `digestFiles` / `realpath`；样本用 `DIRECTORY_SAMPLE_PATHS` 与既有下钻会话 id 规则。
- tab 切换会因 `key={session.id}` 重挂载视图、由内存 buffer 重新 `diffLineTexts`，这是既有行为：tab 切换的护栏只钉「零平台 IO」，不对内存内重新投影设零断言。
- `CodeView.ruler.test.tsx` 与 `ruler.test.ts` 已有断言不得弱化或删除；新增用例按缺口命名（scale / tabs / drilldown / anchors），可新建文件或就地追加。
- `data-*` / `aria-*` 一旦被 ac-evidence-anchors 钉住即为 product-qa 的选取器契约，后续不得重命名。
