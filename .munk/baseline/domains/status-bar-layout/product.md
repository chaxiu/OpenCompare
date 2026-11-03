# Domain: status-bar-layout

窄窗口下底部状态栏的横向排布契约：状态栏以可换行容器承载全部分组，四态图例、各自计数与 Source / Target / Differences 统计在任何受支持宽度下都完整可见，永不靠横向滚动或裁切「藏」内容。本域拥有 `shellLayout.ts` 的状态栏宽度模型（`measureStatusBar` / `statusBarClasses` / `STATUS_BAR_WIDTHS`）与状态栏可见性断言；状态栏条目的数据来源、四态口径、文案与 probe 事实见域 `workbench`。

## 范围

- **宽度模型（单一纯函数）**：`workbench/shellLayout.ts` 导出 `STATUS_BAR_WIDTHS = [960, 1024, 1280, 1440, 1920]`、`STATUS_BAR_CONTENT_PX = 1415`（由 1024px L3 实机证据标定）、`measureStatusBar(width, required)` → `{ available, required, fits, rows }` 与 `statusBarClasses()`。结论只有「单行 `fits`」或「`rows >= 2` 行」，永不给出溢出；`rows` 由内容宽度驱动，宽度断点不参与判定。
- **可换行容器**：`StatusBar` footer 由 `statusBarClasses()`（`flex flex-wrap items-center gap-y-0`）承载换行，不再使用 `overflow-x-auto`；四态图例分组可整体落到下一行，分组级的 `shrink-0` 只在容器可换行时保留。
- **稳定断言钩子**：图例分组带 `data-shell-legend`，每个图例项带 `data-legend-status`（值即状态名），使图例项集合、顺序与计数可在 DOM 层直接断言。
- **可见性对象**：四态图例（`same` / `added` / `removed` 恒在，`conflict` 当且仅当 `composition.conflict > 0`）、各项图例点 / 计数 / 状态文字，以及 Source / Target 文件数与 Differences 数值，均属「不可截断、不可折叠」对象；会话 ID / 路径、Platform、probe 等次要信息可截断或折叠，但必须带 `title` 或等价可访问名称。

## 验收

- **ac-status-no-horizontal-overflow**：960 / 1024 / 1280 / 1440 / 1920 宽度下 `footer[data-shell-level="status"]` 的 `scrollWidth` 不大于 `clientWidth`；状态栏 class 不含任何 `overflow-x*`，溢出只能由换行 / 收缩消除。
- **ac-legend-all-items-visible**：每一档下四态图例项全部渲染且完整可见，项数与期望集合相等（`same` / `added` / `removed` 恒在，`conflict` 当且仅当 `composition.conflict > 0`），每项的图例点、计数、状态文字均在状态栏边界内，不落在滚动隐藏区、不被 `overflow-hidden` 截断。
- **ac-counts-visible**：每一档下 Source / Target 文件数与 Differences 数值均渲染且在状态栏边界内完整可见；图例与统计无法单行共存时，图例 + 计数整体落在可见行内，不被挤到行外。
- **ac-single-source-counts**：四态图例与差异计数仍读同一 `composition`，Source / Target 与 Differences 仍读 `describeSession(...).stats`，不二次计算、不另建口径；图例过滤只保留既有 `conflict > 0` 条件。
- **ac-wrap-model-asserted**：宽度模型对每一档给出确定结论（单行 `fits` 或 `rows >= 2`），且 `rows * available >= required`；模型必须由内容宽度驱动，960–1440 之间任意宽度（含证据里的 1280）都不回落到溢出。
- **ac-wrap-structure**：状态栏容器为可换行结构（换行类由 `statusBarClasses()` 承载），四态图例分组可在需要时独占一行；分组不得带有导致横向溢出的不换行最小宽度组合。
- **ac-secondary-truncation**：若截断 / 折叠次要信息（会话 ID / 路径、Platform、probe），被截断元素必须带 `title` 或等价可访问名称明示完整值；图例与差异计数不属可截断对象。
- **ac-wide-no-regression**：1440 / 1920 档下分组顺序（Session → Platform → probe → 图例 → 统计）、分组间距与亮暗两主题配色类不变，单行布局不回退；`levelHeightPx('status')`、`chromeHeightPx('ready')` 与既有 chrome 预算断言保持自洽（窄档增高须同步更新预算函数与断言，不得静默突破 112px 基线）。
- **ac-regression-tests-existing**：回归断言落在既有测试文件——扩展 `workbench/shellLayout.dom.test.tsx`（可换行结构、图例项数量、计数渲染、统计可见）与 `workbench/shellLayout.test.ts`（宽度模型五档不溢出、宽档单行、内容边界翻转），并在 `workbench/directoryStatusLegend.test.tsx` 复用同一类结构断言；不新建平行套件、不整文件重写。
- **ac-test-debt-ratchet**：`node scripts/test-debt-gate.mjs` 通过，测试用例数与行数只升不降（不删既有用例、不靠删断言换通过）。
- **ac-code-gates-green**：`.munk/code-gates.json` 全部 gate 通过（lint / typecheck / test 等），不新增额外依赖。

## 非目标

- 不改四态口径、计数语义、图例文案与目录专用词表（`DIRECTORY_STATUS_LABEL_KEYS`）。
- 不动扫描 / 哈希 / 缓存 / 快照 / 导出 / 发布通道；不动 `package.json#version`、`CHANGELOG`、`README` 与 release notes 的版本单点。
- 不调整 app / sessions / events / view-toolbar / panels 五层的布局与预算，只处理 `status` 层。
- 不重跑 L3 实机验证，不以扩大视口或改证据口径替代修复；不为通过断言放宽门禁或降低 test-debt 基线。
- 不做与本缺陷无关的视觉打磨（主题、图标、间距体系重构）。

## 实现约束

- 可执行性判定必须共用同一纯函数：换行 / 行数只由 `measureStatusBar` 与 `statusBarClasses()` 决定，组件内联判定 + 测试另写一套被禁止（`AGENTS.md` 硬约束）。
- `statusBarClasses()` 是 status 层专用 helper，不得在 `levelBandClasses` / `levelRowClasses` 里叠加第二份 `gap-*` / `px-*`；`SHELL_LEVELS` 的「同一 CSS 属性不出现两个 utilities」断言继续成立。
- jsdom 无布局引擎：溢出 / 可见性断言以「类结构 + 宽度模型数值 + `clientWidth` 覆写」表达，不依赖真实 `scrollWidth`；测试取值与实机证据（1024 档内容需求 1415px、1440 / 1920 无溢出、1280 溢出）一致。
- 只引用 `src/renderer/src/assets/main.css` 的 token，不写死颜色 / 尺寸；两行 16px 文本仍落在 `status` 的 `h-8` 内（`levelHeightPx('status') === 32`）。
- 不新增依赖；测试扩展落在既有文件内，test-debt 只做增量上调。

## 最近交付证明

- WI：`wi_intake_5e47d72aa9f9539a`（修复窄屏（含 960–1024）底部状态栏横向裁切）
- 日期：2026-11-04
- 结果：code_gates passed（27 gates，attempt 001；`pnpm test` 125 files / 2069 passed + 1 skipped；`scripts/test-debt-gate.mjs` 通过，repoTestCases 1528 → 1539、repoTestLines 46272 → 46459）。
- 覆盖摘要：`shellLayout.ts` 新增 `STATUS_BAR_WIDTHS`、`STATUS_BAR_CONTENT_PX`、`measureStatusBar`（available / required / fits / rows，`rows * available >= required`）与 `statusBarClasses()`（`flex flex-wrap items-center gap-y-0`）；`StatusBar` footer 去掉 `overflow-x-auto` 改吃 `statusBarClasses()`，图例分组加 `data-shell-legend`、图例项加 `data-legend-status`；`shellLayout.test.ts` 新增五档宽度模型、内容边界翻转与 class 结构断言，`shellLayout.dom.test.tsx` 新增 960 / 1024 / 1280 / 1440 / 1920 五档图例（含 conflict 仅在冲突时出现）与 Source / Target 统计可见性断言，`directoryStatusLegend.test.tsx` 复用同一结构断言。
- 注：本域为新增域，`workbench` 域内「壳层层级单行不换行」的表述已限定为 status 层例外并指向本域；本轮未改其他五层预算、未升版本、未新增依赖。
