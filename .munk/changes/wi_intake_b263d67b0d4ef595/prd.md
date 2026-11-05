# 钉住代码视图交换四态计数与差异块导航循环（test-only）

## 范围

- 仅改代码 diff 视图现有测试文件：`src/renderer/src/views/CodeView.switches.test.tsx`、`src/renderer/src/views/CodeView.ruler.test.tsx`。
- 交换用例：用同时含四态（相同 / 仅左 / 仅右 / 不同）的真实行模型夹具，按状态名归一读取四态计数；点击页面上的真实「交换左右」工具栏按钮，断言交换后计数逐位相等；再点击一次，断言左右内容与 gutter 逐行复原、计数仍逐位相等、`aria-label` 与可见性不变。
- 导航循环用例：末块点「下一处」回首块、块 1 点「上一处」回末块，断言目标块即当前块、滚动落点等于同一纯函数目标、在首末块且不越界不抖动。
- 复用既有断言覆盖的三入口同一 handler，不重复造轮子。
- 纯 jsdom / 纯行模型与视图函数级断言；不跑真实窗口、CDP 或手写驱动，不重新打包、不新增对比语义。用于钉住 v0.2.24 已构建包 `46f70f7` 的行为口径。

## 验收

### 交换左右 · 四态计数

- ac-four-state-fixture: 交换用例使用 `renderDiff` 的真实文本对夹具，默认开关（`ignoreNewline` / `ignoreEncoding` 均开）下同时渲染出 `same` / `removed`（仅左）/ `added`（仅右）/ `modified`（不同）四种行；交换前归一化计数显式为 `{ same: 3, removed: 1, added: 1, modified: 1 }`，四态均大于 0 且合计等于渲染行数 6。
- ac-counts-stable-after-swap: 点击 `[data-shell-level="view-toolbar"] [data-code-action="swap"]` 真实按钮后，用同一读取函数得到的状态名计数向量与交换前逐位相等（`toEqual` 深比较），且不是空读数 / 元素存在性判定。
- ac-counts-stable-after-second-swap: 第二次点击同一按钮后，四态计数向量仍与交换前逐位相等。
- ac-content-and-gutter-restored: 第一次交换后左 pane 呈现原右内容（含 `modified-new` / `right-only`），右 pane 呈现原左内容（含 `left-only` / `modified-old`），面板路径顺序对调；第二次交换后左右 pane 的逐行内容与 gutter 行号快照与交换前完全一致（`toEqual`）。
- ac-swap-entry-visible-aria: 交换前、第一次交换后、第二次交换后均断言工具栏交换按钮存在、`hidden === false`、`getComputedStyle(button).display !== 'none'`，且 `aria-label` 为「交换左右」。
- ac-shared-handler-reused: 工具栏 / 更多菜单 / `Cmd/Ctrl+Shift+S` 指向同一 swap handler 由既有用例 `runs toolbar, menu and shortcut through the same swap action without writing` 覆盖；新用例不重复实现该流程。

### 差异块导航 · 首末循环

- ac-next-wraps-to-first: 在至少 18 个差异块的真实夹具上从首块连续点「下一个差异块」直到末块，再点一次 `[data-shell-entry="next-diff"]`，断言块计数器为 `1/18`、当前块为第 1 块、左右 pane 的 `scrollTop` 相等且等于 `centeredScrollTop` 纯函数目标，落点为有限数、`0 ≤ scrollTop ≤ max(0, rows*22 - viewportHeight)`。
- ac-prev-wraps-to-last: 在块 1 位置点 `[data-shell-entry="prev-diff"]`，断言块计数器为 `18/18`、当前块为末块、左右 pane 的 `scrollTop` 相等且等于 `centeredScrollTop` 纯函数目标，落点在同一合法区间内。
- ac-loop-no-jitter: 循环跳转后重复读取（含触发一次 pane `scroll` 同步）左右 `scrollTop` 相等且不变；末块和首块的目标值不越界、不为 `NaN` / `Infinity`。
- ac-navigation-fixture-source: 优先复用仓库现有 18 块样本；若现有测试夹具中确无 18 块样本（当前 `LONG_PAIR` 仅 4 块），则在 `CodeView.ruler.test.tsx` 内构造 test-only 的 18 块真实行模型夹具，并显式断言 `diffLineTexts(...).blocks.length === 18`；不新增产品代码、不改块构建语义。交付说明该来源事实。

### 回归强度 / 交付

- ac-regression-real: 断言比较完整计数对象 / 完整快照而非单个元素 / 布尔：
  - 若交换只镜像一侧或未重算 diff（单侧内容漂移），归一化后的四态向量改变，`toEqual` 失败；
  - 若交换丢失或重复行，计数合计不再等于 6，`toEqual` 失败；
  - 若第二次交换未复原内容或 gutter，逐行快照 `toEqual` 失败；
  - 若导航循环不回首块 / 不回末块，块计数器与 `jumpScrollTop` 目标断言失败；若越界或抖动，`scrollTop` 区间 / 相等断言失败。
- ac-test-only-diff: `git diff --stat` 仅包含上述两个测试文件；`src/**` 产品源码零改动，不改四态计数 / 过滤逻辑、不改块构建与导航实现、不动样式文案、不新增依赖、不整文件重写测试。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test` 及全量 code_gates 自绿；两个测试文件原有用例全部保留且用例数只增不减。
- ac-delivery-evidence: 交付附全量 code_gates pass 证据（attempt 路径、gate 数量与通过结论）及「原断言 → 新增 / 更强断言」清单，并列出 `git diff --stat` 证明 test-only。

## 非目标

- 不改 `CodeView.tsx`、`DiffPane.tsx`、`DiffRuler.tsx`、`src/core/**` 或任何产品源码 / 四态语义 / 计数与过滤逻辑 / 块导航实现。
- 不新增 `data-diff-status` 等产品侧测试钩子，不改样式与文案。
- 不跑 `verify-release` 真实窗口、CDP、不重新打包、不更新截图 / 版本号 / Release / tag。
- 不新增依赖、不改 `code-gates.json`、不重构既有测试文件结构。
- `package.json` / `CHANGELOG.md` / `README*` / `.github/workflows/release.yml` / release notes / release-evidence 等语义单点文件本项零改动，仍只允许版本收敛项独占修改。
- 若断言必须改 `src` 产品代码才能成立，立即停手并在 delivery 说明原因，不自行扩大范围（该情况需重新打包窗口验收）。

## 实现约束

- 交换用例文件：`src/renderer/src/views/CodeView.switches.test.tsx`；导航循环用例文件：`src/renderer/src/views/CodeView.ruler.test.tsx`（复用其 `jumpScrollTop` / `paneElements` / `LONG_PAIR` 等既有 helper）。
- 四态夹具（六行对齐）：
  - left：`same-1\nleft-only\nsame-2\nmodified-old\nsame-3\n`
  - right：`same-1\nsame-2\nmodified-new\nsame-3\nright-only\n`
  - 预期行序：`same`、`removed`、`same`、`modified`、`same`、`added`；`added` 与 `removed` 各 1 行，交换只做左右镜像，因此按状态名归一的计数向量保持不变。
- 四态计数读取：复用现有 `paneElements` / `toolbarSwap` 等 helper；新增一个仅测试内的归一化函数，按 `data-diff-row` 的 index 配对左右 pane，依据两侧 gutter 行号是否存在 + 两侧内容文本是否相等，映射为状态名 `same` / `removed`（仅左）/ `added`（仅右）/ `modified`（不同），返回 `Record<四态, number>`。不得按“第一列 / 第二列”或 DOM 列顺序直接断言。
- 触发只用真实按钮：交换用 `fireEvent.click(toolbarSwap()!)`，导航用 `fireEvent.click(document.querySelector('[data-shell-entry="next-diff"]'))` / `prev-diff`；禁止直接调用组件内部 `swapSides` / `step` 等内部函数。
- 导航夹具：18 组 `same-i` 公共行 + `left-i` / `right-i` 修改行交替，保证每组独立成块；显式断言 `blocks.length === 18`。若仓库已有可复用的 18 块样本则优先复用并在测试注释注明。
- 代码 diff 视图不渲染 `[data-shell-legend]`（窗口脚本四态图例选择器为空的根因），本用例只从实际渲染行归一化读数，不新增产品选择器。
- 既有用例已覆盖按钮 `aria-label` 与三入口同一 handler（`shows the swap action directly in the toolbar only when the shell can commit`、`runs toolbar, menu and shortcut through the same swap action without writing`）；新用例只补 `hidden` / `display` 可见性断言并注明复用。
- 门禁：改动后按既有命令跑 `pnpm lint`、`pnpm typecheck`、`pnpm test` 与 `code-pair-actions` gate；不修改 gate 清单。
