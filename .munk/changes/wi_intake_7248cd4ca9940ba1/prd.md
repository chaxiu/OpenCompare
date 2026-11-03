# 修复状态栏换行档 1px 纵向盒模型溢出

## 范围

修掉 `status-bar-layout` 域在 1024 窄窗换行后的纵向 1px 溢出：`footer[data-shell-level="status"]` 实测 `scrollHeight 32 > clientHeight 31`，第二行分组 `bottom=801 > footer 800`（零字墨裁切，但违反本域 `ac-legend-all-items-visible`「图例项须在状态栏边界内」）。证据：运营 digest `trun_7ba449db0b3c3dba/digest.md` 与 `evidence/leg-statusbar.json`（被测 commit `cb691c50`）。

根因：`statusBarClasses()` 只负责换行（`flex flex-wrap items-center gap-y-0`），`levelRowClasses('status')` 仍钉死 `h-8`（32px border-box），footer 另有 `border-t` 1px ⇒ 内容盒 31px < 两行 16px × 2 = 32px，第二行必然溢出 1px。

本项把状态层高度改为由内容宽度模型驱动：`measureStatusBar(width, required).rows >= 2` 时 status 层用 `h-auto min-h-8`，`rows === 1` 时仍用 `h-8`，`border-t` 1px 计入高度预算；同步 `levelHeightPx('status')` / `chromeHeightPx('ready')` 112px 基线与所有依赖它的断言，并让 `status-bar-layout` 域文档与验收点自洽。

## 验收

- ac-wrap-height-model: 由 `shellLayout.ts` 导出的纯函数 `statusBarHeightPx(rows)` 给出确定高度：`rows === 1` 为 32（= `h-8` border-box，含 1px `border-t`）；`rows >= 2` 为 `rows * 16 + 1`（16px 行高 × 行数 + 1px 边框预算），即 2 行为 33、3 行为 49；`measureStatusBar(960|1024|1280)` 的 `rows >= 2` 时高度为 33，`measureStatusBar(1440|1920)` 的 `rows === 1` 时为 32。
- ac-height-class-single-source: `statusBarClasses(rows)` 仍是状态层高度的唯一来源：`rows === 1` 时返回含 `h-8` 且不含 `h-auto` 的 class；`rows >= 2` 时返回含 `h-auto` 与 `min-h-8` 且不含 `h-8` 的 class；`StatusBar` 渲染的 footer class 与按当前宽度算出的 `rows` 对应的 helper 输出一致，footer 上不同时出现 `h-8` 与 `h-auto` 两个高度 utility，组件内无第二份行数 / 断点内联判定。
- ac-rows-from-content-model: StatusBar 的 `rows` 只来自 `measureStatusBar(当前窗口宽度, STATUS_BAR_CONTENT_PX).rows` 这一纯函数（宽度与 `useWidthTier` 复用同一宽度来源，新增/复用的宽度读取只允许一处，且随 `resize` 重算）；1024 / 960 / 1280 档必然走 `rows >= 2` 的换行 class，1440 / 1920 档必然走 `rows === 1` 的单行 class。
- ac-no-vertical-overflow: 对 `rows >= 1`，`statusBarHeightPx(rows) - 1 >= rows * 16` 恒成立且 `rows >= 2` 时取等（声明高度 = 边框 1 + 两行 32 = 33）：declared border-box 高度足以容纳 `rows` 行 16px 内容加 1px `border-t`，盒模型的 `scrollHeight ≤ clientHeight` 在语义上不再被违反。
- ac-chrome-budget-synced: `chromeHeightPx('ready')`（单行）仍为 112、`chromeHeightPx('empty')` 仍为 76；高度函数新增 `rows` 入参后 `chromeHeightPx('ready', 2) === 113 === 112 + (statusBarHeightPx(2) - statusBarHeightPx(1))`、`chromeHeightPx('empty', 2) === 77`；`mainContentHeightPx('ready', 2) === 768 - 113`；`contentRowBudget(..., statusRows = 2)` 的 `chrome` 为 113、`area` 比单行少 1px；仓库内不存在仍按「状态栏恒为 32px」计算换行档 chrome / 内容高度的消费方或断言。
- ac-wide-no-regression: 1440 / 1920（`rows === 1`）状态栏仍为 `h-8` 单行、`chromeHeightPx('ready') === 112`、`levelHeightPx('status') === 32`，分组顺序（Session → Platform → probe → 图例 → 统计）、间距与亮暗主题配色类不变，换行能力本身不回退。
- ac-regression-tests-existing: 断言落在既有测试文件内 —— 扩展 `src/renderer/src/workbench/shellLayout.test.ts`（高度模型、class 切换、chrome / contentRowBudget 预算）与 `src/renderer/src/workbench/shellLayout.dom.test.tsx`（五档宽度下 footer class 与 `rows` 一致、单行档仍是 `h-8`），复用 `directoryStatusLegend.test.tsx` 的既有结构断言；不新建平行套件、不删既有用例、不为通过而弱化断言。
- ac-no-fake-layout-tests: 测试只断言纯函数数值与 class 结构，不写依赖 jsdom 真实盒模型 / `scrollHeight` / `getBoundingClientRect` 的测量类假用例，也不在代码仓新增浏览器 / CDP / Playwright 用例；真实布局断言由运营 `qa-checklist` 承载。
- ac-domain-doc-consistent: `.munk/baseline/domains/status-bar-layout/product.md` 与本修法自洽 —— 删去「两行 16px 文本仍落在 `h-8` 内（`levelHeightPx('status') === 32`）」的旧表述，写明换行档实际高度为 `rows * 16 + border`（1024 档 2 行 = 33px）、单行档仍为 32；`ac-legend-all-items-visible` / `ac-counts-visible` 的「在状态栏边界内」判定依据明确为盒模型（声明高度减 1px 边框 ≥ `rows * 16`，即 `scrollHeight ≤ clientHeight`）；`ac-wide-no-regression` 与实现约束同步为「换行档允许且仅允许 +1px 边框预算，112px 仍为单行基线」。
- ac-code-gates-green: `.munk/code-gates.json` 全部 gate 通过（含 `lint` / `typecheck` / `build` / `build-web` / `test` / `test-debt` 等），不新增依赖；`node scripts/test-debt-gate.mjs` 通过且用例数 / 行数只升不降。

## 非目标

- 不动 `STATUS_BAR_CONTENT_PX = 1415` / `STATUS_BAR_WIDTHS = [960, 1024, 1280, 1440, 1920]` 标定值，不改宽度模型对五档 `fits` / `rows` 的既有结论。
- 不改 `app` / `sessions` / `events` / `view-toolbar` / `panels` 五层的高度与预算，只处理 `status` 层。
- 不做视觉重设计：不改间距体系、主题、图标、图例文案与四态计数语义。
- 不在代码仓加浏览器 / CDP / 真实布局测量用例；不把 L3 实机口径搬进 vitest。
- 不改 `package.json#version` / `CHANGELOG` / `README` / release notes，不推 tag。
- 不为通过断言放宽门禁或下调 test-debt 基线。

## 实现约束

- 文件锚点：`src/renderer/src/workbench/shellLayout.ts`（宽度 / 高度模型与 class helper）；`src/renderer/src/components/StatusBar.tsx`（footer 组装）；`src/renderer/src/workbench/shellLayout.test.ts`、`src/renderer/src/workbench/shellLayout.dom.test.tsx`（回归）；`.munk/baseline/domains/status-bar-layout/product.md`（域文档）。
- 单一判定来源（`AGENTS.md` 硬约束）：行数只来自 `measureStatusBar`，高度 class 只来自 `statusBarClasses(rows)` / 同一 helper；禁止在 `StatusBar` 内再写一份 `width < n` 或 `rows >= 2` 的判定，也禁止在 `levelBandClasses` / `levelRowClasses` 叠加第二份高度 / `gap-*` / `px-*`。
- 高度 utility 不得冲突：footer 同一时刻只能有一个高度 utility（`h-8` 或 `h-auto`），`SHELL_LEVELS.status.height` 保留为单行参考值；既有「`levelRowClasses('status')` 出现在 footer 上」的断言随实现更新（改为断言 helper 输出），不得删除用例。
- 宽度来源：`useWidthTier` 已按 `resize` 监听 `window.innerWidth`；StatusBar 需要同一宽度数值时复用该来源（可在同模块提取 `useWindowWidth` 之类的单一 hook），不得为状态栏另建断点表。注意 1280（compact/regular 边界）与 1439（内容恰好单行）不是同一个边界，判定必须走 `measureStatusBar` 的 `required / available`，不能用 `resolveWidthTier` 代替。
- 预算函数：`levelHeightPx('status')` 保持单行 32 不变；新增的行数感知高度函数（`statusBarHeightPx`）由 `chromeHeightPx(state, statusRows = 1)`、`mainContentHeightPx`、`contentRowBudget(..., statusRows = 1)` 共用，默认参数保证既有单行调用与 `CHROME_BASELINE_PX = 112` 不破。`CHROME_BASELINE_PX` 仍作单行基线上限；换行档只允许 `+ (statusBarHeightPx(rows) - 32)` 的边框预算，不允许其它增长。
- 测试口径：只断言纯函数数值、class token 集合与既有 DOM 结构；`setWindowWidth(width)` 已在既有 dom 测试中使用，可继续用它驱动 `measureStatusBar` 的宽度输入。test-debt 只做增量上调。
- 门禁：改动后跑全量 `.munk/code-gates.json`；不新增 gate，不改既有 gate 命令。
