# B · DiffPane 窗口化（350k 行 DOM 有界）

## 范围

- 只改 `src/renderer/src/components/DiffPane.tsx`（双栏单栏渲染组件）与其新增大行数测试；必要时最小改动 `src/renderer/src/views/CodeView.tsx` 的滚动 / 跳转衔接，不得改其对比与合并语义。
- 把单栏的 `rows.map` 全量渲染改成**可视窗口渲染**：
  - 用仓库已有的 `@tanstack/react-virtual`（与 `TreeView.tsx` / `views/CsvView.tsx` 同一模式），按 `DIFF_ROW_HEIGHT = 20` 固定行高窗口化。
  - 内容总高严格 = `rows.length × DIFF_ROW_HEIGHT`（350,000 行 → 7,000,000px），左右两栏内容高度严格相等。
  - 现有「按 `scrollTop` 1:1 同步」语义不变（`CodeView.syncScroll` 不动）。
- 保留全部既有行级视觉契约：sticky 行号 gutter、filler 行（`line === null`）、行内字符级高亮（`segments.changed`）、四态底色、`activeBlock` 左侧 accent 描边、固定 20px 行高、`whitespace-pre` 不换行与横向 `min-w-max` 行为。
- 350,000 行文本模型下，单栏 DOM 行元素数与总行数无关；行元素数量上限由视口高度 + overscan 决定，实测数字写入交付证据。
- 开工前置核对基线：worktree 起点必须含 `src/renderer/src/components/DiffRuler.tsx` 与 `src/core/text/ruler.ts`，且 `92b4e236` 是 HEAD 祖先。任一条不成立即停手上报基线不一致，不得退回去重做指示条，也不得改主检出工作树。

## 验收

- ac-baseline-v0210: 交付起点 `git merge-base --is-ancestor 92b4e236 HEAD` 为真，且 `src/renderer/src/components/DiffRuler.tsx`、`src/core/text/ruler.ts` 均存在；本项 diff 不含这两个文件的重写（`git diff --name-only` 中无 `DiffRuler.tsx`、无 `src/core/text/ruler.ts`）。
- ac-row-count-bounded: 350,000 行对齐 rows、视口高度固定时，单栏渲染的行元素数 ≤ `ceil(视口高度 / 20) + 2 × overscan`（上限值以测试常量表达），且该实测数字记录在交付证据里；两栏各自行元素数同量级（差值 ≤ `2 × overscan`）。
- ac-row-count-independent-of-total: 同一视口高度与同一 `scrollTop` 下，`rows.length = 5,000` 与 `rows.length = 350,000` 两例的单栏行元素数完全相等（不随总行数增长）。
- ac-content-height-exact: 单栏内容容器高度严格等于 `rows.length × 20`；350,000 行时为 `7,000,000`；左右两栏该高度严格相等。断言落在内容容器的显式高度（`style.height` 或等价 data 属性），不依赖 jsdom 恒为 0 的 `scrollHeight`；浏览器中该值即 `scrollHeight`。
- ac-window-follows-scroll: 将单栏 `scrollTop` 设为中部与末端值并触发 `scroll` 后，窗口中最小渲染行号等于 `min(floor(scrollTop / 20), rows.length - 1)`，该行渲染出的行号文本与对应侧文本/高亮片段与 `rows[i]` 一致；不出现视口内全空白。
- ac-window-follows-jump: 以程序方式把 `scrollTop` 直接赋值为 `block.startRow × 20`（不派发 scroll 事件，模拟 `CodeView` 跳转 effect）并重渲染后，窗口立即跟随到该行区间（依据元素真实 `scrollTop`，不得只靠 scroll 事件维护偏移）；随后左右两栏 `scrollTop` 相等且等于 `block.startRow × 20`，与现状一致。
- ac-scroll-sync-preserved: 在 350,000 行与 ≤1,000 行两种数据下，滚动任一栏后另一栏 `scrollTop` 精确等于源 `scrollTop`（1:1，无像素漂移，不按比例换算）。
- ac-small-file-full-render: `rows.length ≤ 1,000` 时单栏行元素数仍严格等于 `rows.length`（全部行留在 DOM），无占位撑高层、无窗口裁剪；行结构（`flex h-5 border-l-2`、行号 gutter + 文本单元格）与改动前一致。
- ac-row-visual-parity: ≤1,000 行与 350,000 行两种路径下，任一行仍满足：行高 20（`h-5`）；行号单元格 `sticky left-0`（横向滚动时固定）；filler 行行号为空且底纹为 `surface-sunken`；`same`/`added`/`removed`/`modified`/`conflict` 分别取既有四态底色；改动片段仍为独立 `span`（`bg-diff-modified/40`）；非 active 行 `border-transparent`。
- ac-active-block-outline: `activeBlock` 范围内、落在窗口内的行带左侧 `border-accent` 描边，范围外不带；350,000 行数据下把该块定位到视口内后描边行数与块行数一致。
- ac-pane-dom-contract: 每栏外层滚动容器仍是唯一带 `h-full overflow-auto` 的 `div`，双栏渲染时该选择器命中恰好 2 个；`DIFF_ROW_HEIGHT` 仍从 `DiffPane.tsx` 导出且值仍为 `20`（`DiffRuler` 依赖同一常量）。
- ac-horizontal-no-wrap: 长行在两种路径下都不换行（`whitespace-pre`），横向滚动可用，行内容不被截断成省略号。
- ac-existing-tests-untouched: `src/renderer/src/views/CodeView.test.tsx`、`src/renderer/src/views/CodeView.ruler.test.tsx`、`src/renderer/src/components/DiffRuler.scale.test.tsx`、`src/renderer/src/App.ruler.test.tsx` 零内容改动仍通过（`git diff --name-only` 不包含这四个文件）。
- ac-gates-green: `pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过；新增的大行数用例包含在本工作项 diff 内（新文件或新增 describe），失败即不得交棒。

## 非目标

- 不改指示条点击命中（track 级命中是 C 项），不改 `DiffRuler.tsx`、`src/core/text/ruler.ts` 的任何逻辑；不在本项重做指示条投影。
- 不改三向合并 `MergePane.tsx`、`src/core/text/diff.ts`、`src/core/text/merge.ts` 及四态语义、快照格式、行模型。
- 不改 `docs/release-notes/v0.2.10.md`（A 项）、`package.json` 版本号、`CHANGELOG.md`、`README*`、`docs/release-evidence/**`、发布通道。
- 不改行高 `DIFF_ROW_HEIGHT`，不调 `DiffRuler` 的 `rowHeight`，不改 scrollTop↔行号的 1:1 换算口径。
- 不做本轮之外的顺带优化：不新增语法高亮、不做文本缩略图、不复制 / 缓存行模型、不新增扫描 / 哈希 / 文件读取、不引入逐行变更检测、不加长跑 perf harness、不动 `code-gates.json`。
- 不采用 TreeView 的「超上限压缩内容高度」方案（`createDirectoryScrollMap` 那套），因为本项要求总高严格 `rows × 20`。
- 不起 browser / 真机 / CDP 场，不做 L3 复验；不在主检出工作树上操作、不重写已合提交、不建 tag。

## 实现约束

- 复用 `@tanstack/react-virtual`（仓库已在 `TreeView.tsx`、`views/CsvView.tsx` 使用），不新增依赖、不手写滚动窗口。
- 已约定：≤1,000 行保留现有全量 `rows.map` 分支，>1,000 行走窗口化分支；阈值作为 `DiffPane` 内部常量，不暴露为配置项或 prop。理由：既有用例把 `clientHeight` stub 成 100（视口 5 行）并用 46 行数据断言 `.border-accent` 行数，窗口化小文件会裁掉这些行，而验收要求既有断言逐项不变。
- 总高严格 `rows.length × DIFF_ROW_HEIGHT`，350,000 × 20 = 7,000,000px，在浏览器元素高度上限内，因此不做高度压缩、不做分页。
- 窗口偏移以滚动容器的真实 `scrollTop` 为准（程序化赋值后也要生效），伴随 `scroll` 事件更新；不得出现跳转后窗口停留在旧区间。
- jsdom 无布局：新增用例必须显式 stub `clientHeight`（或等价方式给定视口高度）并通过设置 `scrollTop` + `fireEvent.scroll` 驱动；断言不得依赖 jsdom 恒为 0 的 `scrollHeight`、`getBoundingClientRect`。
- 保留 `div className="h-full overflow-auto"` 作为每栏唯一滚动容器（3 个既有测试文件按 `div.h-full.overflow-auto` 抓取两栏，必须恰好命中 2 个），窗口内容容器不得复用同一类组合。
- 行元素仍须是可识别的 20px 行（`h-5` + `border-l-2`，active 时 `border-accent`），窗口化用绝对定位 / `transform: translateY` 时同步保证行高与 `min-w-max`、`whitespace-pre` 的横向行为。
- 350,000 行用例不要通过实时跑 `diffLineTexts` 生成数据（会拖死测试）；用合成的 `DiffRow[]` 或在测试内一次性构造，保证 `pnpm test` 在既有超时内完成。
