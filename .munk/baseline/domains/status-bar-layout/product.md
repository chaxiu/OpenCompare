# Domain: status-bar-layout

窄窗口下底部状态栏的横向排布契约：状态栏以可换行容器承载全部分组，四态图例、各自计数与 Source / Target / Differences 统计在任何受支持宽度下都完整可见，永不靠横向滚动或裁切「藏」内容。本域拥有 `shellLayout.ts` 的状态栏宽度模型（`measureStatusBar` / `statusBarClasses` / `STATUS_BAR_WIDTHS`）与状态栏可见性断言；状态栏条目的数据来源、四态口径、文案与 probe 事实见域 `workbench`。

## 范围

- **宽度模型（单一纯函数）**：`workbench/shellLayout.ts` 导出 `STATUS_BAR_WIDTHS = [960, 1024, 1280, 1440, 1920]`、`STATUS_BAR_CONTENT_PX = 1415`（由 1024px L3 实机证据标定）、`measureStatusBar(width, required)` → `{ available, required, fits, rows }` 与 `statusBarClasses(rows)`。结论只有「单行 `fits`」或「`rows >= 2` 行」，永不给出溢出；`rows` 由内容宽度驱动，宽度断点不参与判定。
- **可换行容器与高度模型**：`StatusBar` footer 由 `statusBarClasses(rows)`（`flex flex-wrap items-center gap-y-0`）承载换行，不再使用 `overflow-x-auto`；四态图例分组可整体落到下一行，分组级的 `shrink-0` 只在容器可换行时保留。行数只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows`；`statusBarHeightPx(rows)` 给出声明高度——单行 32px（`h-8` border-box，含 1px `border-t`），换行档 `rows * 16 + 1`（16px 行高 × 行数 + 1px 边框预算，1024 档 2 行 = 33px）。`statusBarClasses(rows)` 是状态层高度的唯一来源：`rows === 1` 用 `h-8`，`rows >= 2` 用 `h-auto min-h-8`。
- **稳定断言钩子**：图例分组带 `data-shell-legend`，每个图例项带 `data-legend-status`（值即状态名），使图例项集合、顺序与计数可在 DOM 层直接断言。
- **可见性对象**：四态图例（`same` / `added` / `removed` 恒在，`conflict` 当且仅当 `composition.conflict > 0`）、各项图例点 / 计数 / 状态文字，以及 Source / Target 文件数与 Differences 数值，均属「不可截断、不可折叠」对象；会话 ID / 路径、Platform、probe 等次要信息可截断或折叠，但必须带 `title` 或等价可访问名称。

## 验收

- **ac-status-no-horizontal-overflow**：960 / 1024 / 1280 / 1440 / 1920 宽度下 `footer[data-shell-level="status"]` 的 `scrollWidth` 不大于 `clientWidth`；状态栏 class 不含任何 `overflow-x*`，溢出只能由换行 / 收缩消除。
- **ac-legend-all-items-visible**：每一档下四态图例项全部渲染且完整可见，项数与期望集合相等（`same` / `added` / `removed` 恒在，`conflict` 当且仅当 `composition.conflict > 0`），每项的图例点、计数、状态文字均在状态栏边界内，不落在滚动隐藏区、不被 `overflow-hidden` 截断。「在状态栏边界内」的判定依据是盒模型：`statusBarHeightPx(rows) - 1 >= rows * 16`（声明高度减 1px 边框 ≥ 行数 × 16px，即 `scrollHeight <= clientHeight`）。
- **ac-counts-visible**：每一档下 Source / Target 文件数与 Differences 数值均渲染且在状态栏边界内完整可见；图例与统计无法单行共存时，图例 + 计数整体落在可见行内，不被挤到行外（边界判定同上：`statusBarHeightPx(rows) - 1 >= rows * 16`）。
- **ac-single-source-counts**：四态图例与差异计数仍读同一 `composition`，Source / Target 与 Differences 仍读 `describeSession(...).stats`，不二次计算、不另建口径；图例过滤只保留既有 `conflict > 0` 条件。
- **ac-wrap-model-asserted**：宽度模型对每一档给出确定结论（单行 `fits` 或 `rows >= 2`），且 `rows * available >= required`；模型必须由内容宽度驱动，960–1440 之间任意宽度（含证据里的 1280）都不回落到溢出。
- **ac-wrap-structure**：状态栏容器为可换行结构（换行类与高度类由 `statusBarClasses(rows)` 承载），四态图例分组可在需要时独占一行；分组不得带有导致横向溢出的不换行最小宽度组合。
- **ac-wrap-height-model**：`shellLayout.ts` 导出的纯函数 `statusBarHeightPx(rows)` 给出确定高度——`rows === 1` 为 32（即 `h-8` border-box，含 1px `border-t`）；`rows >= 2` 为 `rows * 16 + 1`（16px 行高 × 行数 + 1px 边框预算），2 行为 33、3 行为 49。`measureStatusBar(960|1024|1280)` 的 `rows >= 2` 对应 33，`measureStatusBar(1440|1920)` 的 `rows === 1` 对应 32。
- **ac-height-class-single-source**：`statusBarClasses(rows)` 仍是状态层高度的唯一来源——`rows === 1` 返回含 `h-8` 且不含 `h-auto` 的 class；`rows >= 2` 返回含 `h-auto` 与 `min-h-8` 且不含 `h-8` 的 class。`StatusBar` 渲染的 footer class 必须与当前宽度算出的 `rows` 对应 helper 输出一致，footer 上不同时出现两个高度 utility，组件内无第二份行数 / 断点内联判定。
- **ac-rows-from-content-model**：`rows` 只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows`，宽度与 `useWidthTier` 复用同一来源（`useWindowWidth` 单点读取，随 `resize` 重算）；960 / 1024 / 1280 档必然走 `rows >= 2` 的换行 class，1440 / 1920 档必然走 `rows === 1` 的单行 class，判定不得用 `resolveWidthTier` 断点表替代。
- **ac-no-vertical-overflow**：对 `rows >= 1`，`statusBarHeightPx(rows) - 1 >= rows * 16` 恒成立且在 `rows >= 2` 取等（声明高度 = 1px 边框 + `rows * 16` 内容），声明的 border-box 高度足以容纳 `rows` 行 16px 内容加 1px `border-t`，`scrollHeight <= clientHeight` 在语义上不再被违反（本域「在状态栏边界内」的判定依据）。
- **ac-chrome-budget-synced**：`chromeHeightPx('ready')`（单行）仍为 112、`chromeHeightPx('empty')` 仍为 76；加入 `statusRows` 入参后 `chromeHeightPx('ready', 2) === 113 === 112 + (statusBarHeightPx(2) - statusBarHeightPx(1))`、`chromeHeightPx('empty', 2) === 77`、`mainContentHeightPx('ready', 2) === 768 - 113`、`contentRowBudget(..., statusRows = 2)` 的 `chrome` 为 113 且 `area` 比单行少 1px；仓库内不得残留仍按「状态栏恒为 32px」计算换行档 chrome / 内容高度的消费方或断言。
- **ac-secondary-truncation**：若截断 / 折叠次要信息（会话 ID / 路径、Platform、probe），被截断元素必须带 `title` 或等价可访问名称明示完整值；图例与差异计数不属可截断对象。
- **ac-wide-no-regression**：1440 / 1920 档下分组顺序（Session → Platform → probe → 图例 → 统计）、分组间距与亮暗两主题配色类不变，单行布局不回退；`levelHeightPx('status')` 仍为 32、`chromeHeightPx('ready')` 仍为 112（单行基线）。换行档允许且仅允许 `+1px` 边框预算（`statusBarHeightPx(rows) - statusBarHeightPx(1)`），`chromeHeightPx` / `mainContentHeightPx` / `contentRowBudget` 以 `statusRows` 入参与断言同步，不得静默突破 112px 单行基线。
- **ac-regression-tests-existing**：回归断言落在既有测试文件——扩展 `workbench/shellLayout.test.ts`（高度模型数值、`statusBarClasses(rows)` 的 class 切换、`chromeHeightPx` / `mainContentHeightPx` / `contentRowBudget` 的 `statusRows` 预算、宽度模型五档不溢出、宽档单行、内容边界翻转）与 `workbench/shellLayout.dom.test.tsx`（五档宽度下 footer class 与 `rows` 一致、单行 1440 / 1920 仍是 `h-8`、图例项数量、计数渲染、统计可见），并在 `workbench/directoryStatusLegend.test.tsx` 复用同一类结构断言；不新建平行套件、不整文件重写、不删既有用例。
- **ac-no-fake-layout-tests**：测试只断言纯函数数值与 class 结构，不写依赖 jsdom 真实盒模型 / `scrollHeight` / `getBoundingClientRect` 的测量类假用例，也不在代码仓新增浏览器 / CDP / Playwright 用例；真实布局断言由运营 `qa-checklist` 承载。
- **ac-test-debt-ratchet**：`node scripts/test-debt-gate.mjs` 通过，测试用例数与行数只升不降（不删既有用例、不靠删断言换通过）。
- **ac-code-gates-green**：`.munk/code-gates.json` 全部 gate 通过（lint / typecheck / test 等），不新增额外依赖。

## 非目标

- 不改四态口径、计数语义、图例文案与目录专用词表（`DIRECTORY_STATUS_LABEL_KEYS`）。
- 不动扫描 / 哈希 / 缓存 / 快照 / 导出 / 发布通道；不动 `package.json#version`、`CHANGELOG`、`README` 与 release notes 的版本单点。
- 不调整 app / sessions / events / view-toolbar / panels 五层的布局与预算，只处理 `status` 层。
- 不重跑 L3 实机验证，不以扩大视口或改证据口径替代修复；不为通过断言放宽门禁或降低 test-debt 基线。
- 不做与本缺陷无关的视觉打磨（主题、图标、间距体系重构）。

## 实现约束

- 可执行性判定必须共用同一纯函数：换行 / 行数只由 `measureStatusBar` 与 `statusBarClasses(rows)` / `statusBarHeightPx(rows)` 决定，组件内联判定 + 测试另写一套被禁止（`AGENTS.md` 硬约束）；`rows` 只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows`，宽度复用 `useWindowWidth` 单一来源。
- `statusBarClasses(rows)` 是 status 层高度与换行的专用 helper（footer 同一时刻只有一个高度 utility：`h-8` 或 `h-auto`），不得在 `levelBandClasses` / `levelRowClasses` 里叠加第二份高度 / `gap-*` / `px-*`；`SHELL_LEVELS` 的「同一 CSS 属性不出现两个 utilities」断言继续成立，`SHELL_LEVELS.status.height` 保留为单行参考值。
- jsdom 无布局引擎：溢出 / 可见性断言以「类结构 + 宽度模型数值 + `clientWidth` 覆写」表达，不依赖真实 `scrollWidth`；测试取值与实机证据（1024 档内容需求 1415px、1440 / 1920 无溢出、1280 溢出）一致。
- 只引用 `src/renderer/src/assets/main.css` 的 token，不写死颜色 / 尺寸；单行档状态栏仍为 32px（`h-8` border-box，含 1px `border-t`），换行档声明高度为 `rows * 16 + 1`（1024 档 2 行 = 33px），`levelHeightPx('status') === 32` 仅作为单行基线。
- 不新增依赖；测试扩展落在既有文件内，test-debt 只做增量上调。

## 最近交付证明

- WI：`wi_intake_7248cd4ca9940ba1`（修复 1024 窄窗换行档 1px 纵向盒模型溢出）
- 日期：2026-11-04
- 结果：code_gates passed（27 gates，attempt 001；`pnpm test` 125 files / 2073 passed + 1 skipped；`scripts/test-debt-gate.mjs` 通过，repoTestCases 1539 → 1543、repoTestLines 46459 → 46539）。
- 覆盖摘要：`shellLayout.ts` 新增 `statusBarHeightPx(rows)`（单行 32、换行 `rows * 16 + 1`），`statusBarClasses(rows)` 改为状态层高度唯一来源（`h-8` ↔ `h-auto min-h-8`）并复用 `SHELL_LEVELS.status.gap`；`chromeHeightPx` / `mainContentHeightPx` / `contentRowBudget` 增加 `statusRows = 1` 入参，换行档只增 1px 边框预算；`StatusBar` footer 高度随 `measureStatusBar` 行数切换，宽度复用 `useWindowWidth`；`shellLayout.test.ts` 与 `shellLayout.dom.test.tsx` 在既有用例内补高度模型、class 切换与 `statusRows` 预算断言。
- 注：本轮只处理 `status` 层，其余五层高度与预算、宽度标定值、版本号与依赖均未动；运营 L3 复验（1024 档 2 行 = 33px、`scrollHeight <= clientHeight`）由 `qa-checklist` 承载。
