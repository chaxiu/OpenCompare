# Domain: diff-virtualization

双栏代码 / 文本 Diff 面板（`src/renderer/src/components/DiffPane.tsx`）的大文件窗口化渲染：把单栏「`rows.map` 全量渲染」改成按 `DIFF_ROW_HEIGHT = 20` 的固定行高可视窗口，使 350,000 行的对齐行模型在 DOM 里只留下「视口行数 + overscan」个行元素，同时**保持总高严格 `rows.length × DIFF_ROW_HEIGHT`**（350k → 7,000,000px）与既有行级视觉契约、`scrollTop` 1:1 双栏同步语义不变。本域只拥有**渲染窗口**这一层：行模型（`src/core/text/diff.ts` 的 `DiffRow` / `DiffBlock` / 四态）、三向合并（`MergePane.tsx` + `@core/text/merge`）、指示条几何与 `CodeView` 跳转 / 同步滚动（`diff-ruler` 域）、目录树 / CSV 已有窗口化（`directory` / `csv-align`）都不在本域改动范围内。

## 范围

- **窗口化渲染（`DiffPane.tsx`）**：复用仓库既有 `@tanstack/react-virtual`（与 `TreeView.tsx`、`views/CsvView.tsx` 同一模式），`useVirtualizer` 计数取 `rows.length`、`estimateSize` 取 `DIFF_ROW_HEIGHT`（20）、`overscan` 为组件内部常量。
- **阈值分支（组件内部常量，不暴露 prop / 配置）**：`rows.length <= 1000` 走既有全量 `rows.map` 分支（零 spacer、零虚拟内容高度）；`> 1000` 走窗口分支。阈值存在的理由：既有用例把 `clientHeight` stub 成 100、用 46 行数据断言 `.border-accent` 行数，窗口化小文件会裁掉这些行。
- **内容总高**：窗口分支的内容容器显式 `style.height = rows.length * DIFF_ROW_HEIGHT`，并用上下 padding 把窗口推到正确位置；左右两栏该高度严格相等。不做高度压缩、不学 `TreeView` 的 `createDirectoryScrollMap` 压缩方案（本域要求总高严格等于行数 × 行高），也不分页。
- **窗口以元素 `scrollTop` 为真相源**：`useLayoutEffect` 在每次渲染后比对虚拟器 `scrollOffset` 与容器真实 `scrollTop`，不一致即折回并触发一次窗口同步；因此 `CodeView` 的跳转 effect 直接写 `scrollTop`（浏览器派发 scroll 或下一步渲染）都能让窗口立刻跟随，不会停留在旧区间。
- **滚动同步语义不动**：`CodeView.syncScroll` 仍是两栏 1:1 `scrollTop` 镜像（无比例换算、无像素漂移）；`DiffPane` 只把原来的 `scrollRef` 改成同时挂到内部 ref 与外部 ref 的 callback ref。
- **行级视觉契约不变**：20px 行（`flex h-5 border-l-2`）、sticky 行号 gutter（`sticky left-0`）、filler 行（`line === null`，空行号 + `surface-sunken` 底纹）、行内字符级高亮（`segments.changed` → `bg-diff-modified/40` 独立 `span`）、`same` / `added` / `removed` / `modified` / `conflict` 四态底色、`activeBlock` 左侧 `border-accent` 描边（非 active 为 `border-transparent`）、`whitespace-pre` 不换行 + 内容容器 `min-w-max`。两种路径共用同一个 `DiffRowView`，不再有第二份行 JSX。
- **DOM 契约稳定点**：每栏唯一 `div.h-full.overflow-auto` 仍是滚动容器（双栏命中恰好 2 个），窗口内容容器不复用这两个类；`DIFF_ROW_HEIGHT` 仍从 `DiffPane.tsx` 导出且值 20（`DiffRuler` 依赖）；窗口分支额外带只读 data 锚点 `data-diff-content-height`（内容总高）与 `data-diff-window-start`（视口首行下标），行元素带 `data-diff-row={index}`。
- **规模证据**：只在 `pnpm test`（jsdom）内验证，stub `clientHeight` / `clientWidth` + 赋值 `scrollTop` + `fireEvent.scroll` 驱动；断言落在显式 `style.height` / `data-*` 与行元素数上，不依赖 jsdom 恒为 0 的 `scrollHeight` / `getBoundingClientRect`。350k 行数据由测试内循环直接构造 `DiffRow[]`，不经 `diffLineTexts`。

## 验收

- **ac-baseline-v0210**：交付起点 `git merge-base --is-ancestor 92b4e236 HEAD` 为真，且 `src/renderer/src/components/DiffRuler.tsx`、`src/core/text/ruler.ts` 均存在；本项 diff 不含这两个文件的重写（`git diff --name-only` 中无 `DiffRuler.tsx`、无 `src/core/text/ruler.ts`）。基线不一致即停手上报，不退回重做指示条。
- **ac-row-count-bounded**：350,000 行对齐 rows、视口高度固定时，单栏渲染的行元素数 ≤ `ceil(视口高度 / 20) + 2 × overscan`（上限值以测试常量表达），实测数字记录在交付证据里；两栏各自行元素数同量级（差值 ≤ `2 × overscan`）。
- **ac-row-count-independent-of-total**：同一视口高度与同一 `scrollTop` 下，`rows.length = 5,000` 与 `rows.length = 350,000` 两例的单栏行元素数完全相等（不随总行数增长）。
- **ac-content-height-exact**：单栏内容容器高度严格等于 `rows.length × 20`；350,000 行时为 `7,000,000`；左右两栏该高度严格相等。断言落在内容容器的显式高度（`style.height` 或等价 data 属性），不依赖 jsdom 恒为 0 的 `scrollHeight`；浏览器中该值即 `scrollHeight`。
- **ac-window-follows-scroll**：将单栏 `scrollTop` 设为中部与末端值并触发 `scroll` 后，窗口中最小渲染行号等于 `min(floor(scrollTop / 20), rows.length - 1)`，该行渲染出的行号文本与对应侧文本 / 高亮片段与 `rows[i]` 一致；不出现视口内全空白。
- **ac-window-follows-jump**：以程序方式把 `scrollTop` 直接赋值为 `block.startRow × 20`（不派发 scroll 事件，模拟 `CodeView` 跳转 effect）并重渲染后，窗口立即跟随到该行区间（依据元素真实 `scrollTop`，不得只靠 scroll 事件维护偏移）；随后左右两栏 `scrollTop` 相等且等于 `block.startRow × 20`，与现状一致。
- **ac-scroll-sync-preserved**：在 350,000 行与 ≤1,000 行两种数据下，滚动任一栏后另一栏 `scrollTop` 精确等于源 `scrollTop`（1:1，无像素漂移，不按比例换算）。
- **ac-small-file-full-render**：`rows.length ≤ 1,000` 时单栏行元素数仍严格等于 `rows.length`（全部行留在 DOM），无占位撑高层、无窗口裁剪；行结构（`flex h-5 border-l-2`、行号 gutter + 文本单元格）与改动前一致。
- **ac-row-visual-parity**：≤1,000 行与 350,000 行两种路径下，任一行仍满足：行高 20（`h-5`）；行号单元格 `sticky left-0`（横向滚动时固定）；filler 行行号为空且底纹为 `surface-sunken`；`same` / `added` / `removed` / `modified` / `conflict` 分别取既有四态底色；改动片段仍为独立 `span`（`bg-diff-modified/40`）；非 active 行 `border-transparent`。
- **ac-active-block-outline**：`activeBlock` 范围内、落在窗口内的行带左侧 `border-accent` 描边，范围外不带；350,000 行数据下把该块定位到视口内后描边行数与块行数一致。
- **ac-pane-dom-contract**：每栏外层滚动容器仍是唯一带 `h-full overflow-auto` 的 `div`，双栏渲染时该选择器命中恰好 2 个；`DIFF_ROW_HEIGHT` 仍从 `DiffPane.tsx` 导出且值仍为 `20`（`DiffRuler` 依赖同一常量）。
- **ac-horizontal-no-wrap**：长行在两种路径下都不换行（`whitespace-pre`），横向滚动可用，行内容不被截断成省略号。
- **ac-existing-tests-untouched**：`src/renderer/src/views/CodeView.test.tsx`、`src/renderer/src/views/CodeView.ruler.test.tsx`、`src/renderer/src/components/DiffRuler.scale.test.tsx`、`src/renderer/src/App.ruler.test.tsx` 零内容改动仍通过（`git diff --name-only` 不包含这四个文件）。
- **ac-gates-green**：`pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过；新增的大行数用例包含在本工作项 diff 内（新文件或新增 describe），失败即不得交棒。

## 非目标

- 不改指示条点击命中（track 级命中归后续 C 项），不改 `DiffRuler.tsx`、`src/core/text/ruler.ts` 的任何逻辑；不在本域重做指示条投影。
- 不改三向合并 `MergePane.tsx`、`src/core/text/diff.ts`、`src/core/text/merge.ts` 及四态语义、快照格式、行模型。
- 不改 `docs/release-notes/v0.2.10.md`（A 项）、`package.json` 版本号、`CHANGELOG.md`、`README*`、`docs/release-evidence/**`、发布通道。
- 不改行高 `DIFF_ROW_HEIGHT`，不调 `DiffRuler` 的 `rowHeight`，不改 scrollTop↔行号的 1:1 换算口径。
- 不做本轮之外的顺带优化：不新增语法高亮、不做文本缩略图、不复制 / 缓存行模型、不新增扫描 / 哈希 / 文件读取、不引入逐行变更检测、不加长跑 perf harness、不动 `code-gates.json`。
- 不采用 `TreeView` 的「超上限压缩内容高度」方案（`createDirectoryScrollMap`），因为本域要求总高严格 `rows × 20`。
- 不起 browser / 真机 / CDP 场，不做 L3 复验；不在主检出工作树上操作、不重写已合提交、不建 tag。

## 实现约束

- 复用 `@tanstack/react-virtual`（已在 `TreeView.tsx` / `views/CsvView.tsx` 使用），不新增依赖、不手写滚动窗口。虚拟器返回的函数按库约定不可 memo，`eslint-disable` 仅限该行并注明原因。
- 阈值（1000）与 overscan（10）是 `DiffPane.tsx` 内部常量，不作为 prop / 配置项暴露；新增对外契约只有只读 data 锚点。
- 内容总高严格 `rows.length × DIFF_ROW_HEIGHT`，350,000 × 20 = 7,000,000px 在浏览器元素高度上限内，因此不做高度压缩、不做分页。
- 窗口偏移以滚动容器的真实 `scrollTop` 为准（程序化赋值后也要生效），伴随 `scroll` 事件更新；不得出现跳转后窗口停留在旧区间。折回循环必须有「虚拟器已一致即返回」的守卫，避免每帧自增。
- jsdom 无布局：新增用例必须显式 stub `clientHeight` / `clientWidth` 并通过设置 `scrollTop` + `fireEvent.scroll` 驱动；断言不得依赖 jsdom 恒为 0 的 `scrollHeight`、`getBoundingClientRect`。
- 保留 `div className="h-full overflow-auto"` 作为每栏唯一滚动容器（3 个既有测试文件按 `div.h-full.overflow-auto` 抓两栏，必须恰好命中 2 个），窗口内容容器不得复用同一类组合。
- 行元素仍须是可识别的 20px 行（`h-5` + `border-l-2`，active 时 `border-accent`）；窗口化用上下 padding 定位时同步保证 `min-w-max`、`whitespace-pre` 的横向行为。
- 350,000 行用例不要通过实时跑 `diffLineTexts` 生成数据（会拖死测试）；用合成 `DiffRow[]` 在测试内一次性构造，保证 `pnpm test` 在既有超时内完成。

## 最近交付证明

- WI：`wi_ws_88f6d546c6c0d7e5`（B 项：`DiffPane` 350k 行窗口化，DOM 有界，`kind: perf/feature`）
- 日期：2026-10-28
- 结果：`needSelfTest=false`，UI 自测按裁决跳过；code_gates passed（attempt 001，9 条门禁全绿：`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test:compare-request` / `test:cancel` / `test:memory`）。`pnpm test` 67 files / 1089 passed / 1 skipped。
- 覆盖摘要：① **窗口分支**——`rows.length > 1000` 时 `useVirtualizer`（`estimateSize = DIFF_ROW_HEIGHT`，`overscan = 10`）只渲染窗口内行，内容容器 `style.height = rows.length * 20` + 上下 padding 定位，并输出 `data-diff-content-height` / `data-diff-window-start`；② **小文件分支**——`<= 1000` 保留原全量 `rows.map`，行结构逐项不变，无虚拟内容高度；③ **程序化跳转**——`useLayoutEffect` 比对真实 `scrollTop` 与 `virtualizer.scrollOffset` 并折回，无 scroll 事件也能跟随（`CodeView` 跳转 effect 场景有 jsdom 用例）；④ **单一滚动容器**——`div.h-full.overflow-auto` 双栏命中 2 个，`scrollRef` 改为同时挂内部 ref 的 callback ref，`CodeView.syncScroll` 零改动；⑤ **行级契约单点**——两种路径共用 `DiffRowView`（20px 行 / sticky gutter / filler / 四态底色 / 行内高亮 / `border-accent`），消除双份行 JSX。
- 实测数字（jsdom，视口 1200×600，`VIEWPORT_ROWS = ceil(600/20) = 30`，overscan 10）：350,000 行单栏行元素 **50 个**（= 30 可见 + 10 + 10），左右两栏差值 0；`rows.length = 5,000` 与 `350,000` 同一 `scrollTop` 下行元素数都是 50；内容总高 `7000000px`（`data-diff-content-height="7000000"`）两栏相等；1,000 行仍全量 1,000 个、1,001 行起降到窗口（≤ 50）。
- 证据：`.munk/runs/run_ws_5762646bffd467bb/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate}.log` 与同名 `.result.json`；diff 范围仅 `src/renderer/src/components/DiffPane.tsx` + 新增 `src/renderer/src/components/DiffPane.test.tsx`（533 行 / 15 例）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 ux / tech 手合；人工验收口径落本域 `qa/diff-pane-windowed-large-files.md`。
- 后续注意：① 现在双栏 Diff 的 DOM 行数与总行数解耦，**不要再按「行元素数 == rows.length」写断言**；判断全量渲染只看 `rows.length <= 1000` 分支。② 窗口跟随依赖 `scrollTop` 折回 + `data-diff-window-start`，后续改 `CodeView` 跳转 / 指示条命中时必须保留「无 scroll 事件也能跟随」这条路径（C 项会动跳转命中，别把窗口依赖重新绑到 scroll 事件上）。③ `mount` 后内容总高由 padding 撑起，若以后引入行高变化 / 缩放，`estimateSize` 与 `DIFF_ROW_HEIGHT` 必须同源。④ 阈值 1000 是既有测试兼容的产物，不是产品口径；改小需同步调整既有小文件断言。
