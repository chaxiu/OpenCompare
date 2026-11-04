# Domain: status-bar-layout

底部状态栏的排布契约：受支持宽度（960 / 1024 / 1280 / 1440 / 1920）下只有一行、高度 24px，只承载当前场景的行数 / 条目度量与左右编码、换行事实（相同只写一次），不出现平台名、四态图例或教程引导。本域拥有 `shellLayout.ts` 的状态栏宽度模型（`measureStatusBar` / `statusBarClasses` / `statusBarHeightPx` / `STATUS_BAR_WIDTHS` / `STATUS_BAR_CONTENT_PX`）与状态栏可见性断言；状态栏条目的数据来源、probe 事实与文案见域 `workbench`，壳层总高度预算见域 `shell-tightening`。

## 范围

- **宽度模型（单一纯函数）**：`workbench/shellLayout.ts` 导出 `STATUS_BAR_WIDTHS = [960, 1024, 1280, 1440, 1920]`、`STATUS_BAR_CONTENT_PX = 520`（收紧后的单行内容需求）、`measureStatusBar(width, required)` → `{ available, required, fits, rows }` 与 `statusBarClasses(rows)`。结论只有「单行 `fits`」或「`rows >= 2` 行兜底」，永不给出溢出；`rows` 由内容宽度驱动，宽度断点不参与判定。
- **单行契约**：`measureStatusBar` 在 1024 / 1280 / 1440 / 1920 四档（以及 960）都返回 `rows === 1`、`fits === true`。内容集合 = 会话 / 场景的行数或条目度量 + 探测事实（编码、换行）；左右相同只渲染一次，不同才展开两侧。
- **高度模型**：`statusBarHeightPx(1) === 24`（`h-6` border-box，含 1px `border-t`）；`rows >= 2` 的兜底高度为 `rows * 16 + 1`（16px 行高 × 行数 + 1px 边框预算）。`statusBarClasses(rows)` 是状态层高度的唯一来源：`rows === 1` 用 `h-6`，`rows >= 2` 用 `h-auto min-h-6`；footer 同一时刻只有一个高度 utility。
- **可换行容器（安全网）**：`StatusBar` footer 由 `statusBarClasses(rows)`（`flex flex-wrap items-center gap-y-0`）承载，不再使用 `overflow-x-auto`；内容永不靠横向滚动或裁切消失。受支持宽度下不触发换行，`rows >= 2` 仅作为极端内容的降级路径保留。
- **文案收敛**：不渲染 `shell.status.platform`、四态图例（`CompositionLegend` 不进入状态栏）与 `shell.empty.hint` 教程 / 样本引导句；条目只来自 `describeSession(...).stats` 与纯模块 `workbench/probeStatus.ts`。
- **稳定断言钩子**：状态层带 `data-shell-level="status"`；需要时仍可使用 `data-shell-legend` / `data-legend-status` 断言，但状态栏本身不渲染图例分组。

## 验收

- **ac-statusbar-single-row**：`measureStatusBar` 在 1024 / 1280 / 1440 / 1920 四档都只有 1 行，状态栏声明高度 ≤24。
- **ac-status-no-horizontal-overflow**：960 / 1024 / 1280 / 1440 / 1920 宽度下 `footer[data-shell-level="status"]` 的 `scrollWidth` 不大于 `clientWidth`；状态栏 class 不含任何 `overflow-x*`，溢出只能由换行 / 收缩消除。
- **ac-statusbar-content**：状态栏不再渲染 `shell.status.platform`，不含四态图例，只剩行数 / 条目度量与编码换行信息。
- **ac-encoding-dedupe**：左右编码相同只出现一次，不同才分别展开；左右换行同规则；渲染顺序稳定（换行 → 编码，或按探测条目既有顺序）。
- **ac-no-tutorial-copy**：首屏与状态栏不出现教程 / 内置样本引导句（`shell.empty.hint` 文案不再渲染）。
- **ac-counts-visible**：每一档下 Source / Target 文件数与 Differences 数值均渲染且在状态栏边界内完整可见；声明高度足以容纳单行 16px 内容加 1px 边框（`statusBarHeightPx(1) - 1 >= 16`）。
- **ac-single-source-counts**：条目仍读同一 `describeSession(...).stats` 与同一 probe 事实，不二次计算、不另建口径；状态栏不重算 diff。
- **ac-wrap-model-asserted**：宽度模型对每一档给出确定结论（单行 `fits` 或 `rows >= 2`），且 `rows * available >= required`；模型必须由内容宽度驱动，960–1920 之间任意宽度都不回落到溢出。
- **ac-wrap-structure**：状态栏容器为可换行结构（换行类与高度类由 `statusBarClasses(rows)` 承载）；分组可带 `shrink-0`，但不得构成导致横向溢出的不换行最小宽度组合。
- **ac-wrap-height-model**：`statusBarHeightPx(1) === 24`、`statusBarHeightPx(2) === 33`、`statusBarHeightPx(3) === 49`；仅 `rows >= 2` 时高度才脱离 `h-6`。
- **ac-height-class-single-source**：`statusBarClasses(rows)` 仍是状态层高度的唯一来源——`rows === 1` 返回含 `h-6` 且不含 `h-auto` 的 class；`rows >= 2` 返回含 `h-auto` 与 `min-h-6` 且不含 `h-6` 的 class。`StatusBar` 渲染的 footer class 必须与当前宽度算出的 `rows` 对应 helper 输出一致，组件内无第二份行数 / 断点内联判定。
- **ac-rows-from-content-model**：`rows` 只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows`，宽度与 `useWidthTier` 复用同一来源（`useWindowWidth` 单点读取，随 `resize` 重算），不得用 `resolveWidthTier` 断点表替代。
- **ac-no-vertical-overflow**：对 `rows >= 1`，`statusBarHeightPx(rows) - 1 >= rows * 16` 恒成立；单行 24px 容纳 16px 行与 1px 边框，换行档声明高度恰为 1px 边框 + `rows * 16` 内容。
- **ac-chrome-budget-synced**：`chromeHeightPx('ready') === 84`（app 32 + sessions 28 + status 24）、`chromeHeightPx('empty') === 56`；`mainContentHeightPx('ready') === 768 - 84`；`contentRowBudget` 的 `chrome` 与 `CHROME_BASELINE_PX` 同值。仓库内不得残留按「状态栏 32px / chrome 112px」计算的消费方或断言。
- **ac-secondary-truncation**：若截断 / 折叠次要信息，被截断元素必须带 `title` 或等价可访问名称明示完整值；行数 / 条目度量与编码换行事实不属可截断对象。
- **ac-wide-no-regression**：1440 / 1920 档下条目顺序、分组间距与亮暗两主题配色类不变；`levelHeightPx('status') === 24`、`statusBarHeightPx(1) === 24`。
- **ac-regression-tests-existing**：回归断言落在既有测试文件——扩展 `workbench/shellLayout.test.ts`（高度模型数值、`statusBarClasses(rows)` 的 class 切换、`chromeHeightPx` / `mainContentHeightPx` / `contentRowBudget` 预算、宽度模型五档不溢出、内容边界翻转）与 `workbench/shellLayout.dom.test.tsx`（五档宽度下 footer class 与 `rows` 一致、单行 24px、条目渲染），不新建平行套件、不整文件重写、不删既有用例。
- **ac-no-fake-layout-tests**：测试只断言纯函数数值与 class 结构，不写依赖 jsdom 真实盒模型 / `scrollHeight` / `getBoundingClientRect` 的测量类假用例，也不在代码仓新增浏览器 / CDP / Playwright 用例；真实布局断言由运营 `qa-checklist` 承载。
- **ac-test-debt-ratchet**：`node scripts/test-debt-gate.mjs` 通过，测试用例数与行数只升不降（不删既有用例、不靠删断言换通过）。
- **ac-code-gates-green**：`.munk/code-gates.json` 全部 gate 通过（lint / typecheck / test 等），不新增额外依赖。

## 非目标

- 不改四态口径、计数语义、图例文案与目录专用词表（`DIRECTORY_STATUS_LABEL_KEYS`）；本项只是不再把图例放进状态栏。
- 不动扫描 / 哈希 / 缓存 / 快照 / 导出 / 发布通道；不动 `package.json#version`、`CHANGELOG`、`README` 与 release notes 的版本单点。
- 不调整 app / sessions / events / view-toolbar / panels 五层的布局与预算（归域 `shell-tightening`），只处理 `status` 层。
- 不重跑 L3 实机验证，不以扩大视口或改证据口径替代修复；不为通过断言放宽门禁或降低 test-debt 基线。
- 不做与本缺陷无关的视觉打磨（主题、图标、间距体系重构）。

## 实现约束

- 可执行性判定必须共用同一纯函数：换行 / 行数只由 `measureStatusBar` 与 `statusBarClasses(rows)` / `statusBarHeightPx(rows)` 决定，组件内联判定 + 测试另写一套被禁止（`AGENTS.md` 硬约束）；`rows` 只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows`，宽度复用 `useWindowWidth` 单一来源。
- `statusBarClasses(rows)` 是 status 层高度与换行的专用 helper（footer 同一时刻只有一个高度 utility：`h-6` 或 `h-auto`），不得在 `levelBandClasses` / `levelRowClasses` 里叠加第二份高度 / `gap-*` / `px-*`；`SHELL_LEVELS` 的「同一 CSS 属性不出现两个 utilities」断言继续成立。
- jsdom 无布局引擎：溢出 / 可见性断言以「类结构 + 宽度模型数值 + `clientWidth` 覆写」表达，不依赖真实 `scrollWidth`。
- 只引用 `src/renderer/src/assets/main.css` 的 token，不写死颜色 / 尺寸；单行状态栏为 24px（`h-6` border-box，含 1px `border-t`），换行兜底声明高度为 `rows * 16 + 1`。
- 不新增依赖；测试扩展落在既有文件内，test-debt 只做增量上调。

## 最近交付证明

- WI：`wi_ws_5315d151d872f78c`（主界面布局收紧，状态栏并入单行预算）
- 日期：2026-11-05
- 结果：code_gates passed（29 gates，attempt 001；`pnpm test` 140 files / 2225 passed + 1 skipped / 2226）。
- 覆盖摘要：`STATUS_BAR_CONTENT_PX` 1415 → 520、`statusBarHeightPx(1)` 32 → 24（`h-6`）、`statusBarClasses` 单行改 `h-6`、换行兜底改 `h-auto min-h-6`；`CHROME_BASELINE_PX` 重算为 84，`chromeHeightPx('ready')` = 84 / `empty` = 56；`StatusBar` 仍按 `measureStatusBar` 行数取 class，`Workbench` 只渲染 probe 条目 + 统计，`platform` / 图例 / 教程句不再出现；`shellLayout.test.ts` 与 `shellLayout.dom.test.tsx` 在既有用例内更新数值与 class 断言。
- 注：`measureStatusBar` 仍保留 `rows >= 2` 的兜底分支作为安全网，但受支持宽度（≥960）下恒为单行；运营 L3 复验（单行 24px、`scrollHeight <= clientHeight`）由 `qa-checklist` 承载。
