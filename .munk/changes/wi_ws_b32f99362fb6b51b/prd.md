# 工具栏行横向滚动兜底 + jsdom 回归断言

## 范围

修复目录工作台 `view-toolbar` band 在 960–1146 窄档横向溢出、首行控件被推出视口 / 裁切的缺陷（实测 1024 宽 `scrollWidth 1146 > clientWidth 1024`）。

- 已实测定位（本工作树 HEAD = main tip `9cbeefb`，`package.json#version = 0.2.12`，工作树干净）：
  - band：`src/renderer/src/views/DirectoryView.tsx:185-191`，`data-shell-level="view-toolbar"`，class 为 `cx('flex shrink-0 flex-col border-b border-line-subtle bg-surface-sunken', levelBandClasses('view-toolbar'))`，无 `overflow-*`、无 `min-w-0`。
  - 三个行容器：`DirectoryView.tsx:192` / `:236` / `:271`，class 均为 `cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))`（实产 `h-7 gap-2`），无 `flex-wrap`、无 `overflow-x`、无 `min-w-0`；行内控件全为 `shrink-0`，`SegmentedControl` 自带的 `overflow-x-auto` 只在自身内生效。
- 改动落点（三处）：
  1. `src/renderer/src/views/DirectoryView.tsx` 三个 `view-toolbar` 行容器的 `cx` 追加 `min-w-0 overflow-x-auto scrollbar-none`（保留 `shrink-0`、`h-7`、`gap-2`，控件、顺序、文案、行数一律不动）。
  2. `src/renderer/src/assets/main.css` 的 `@utility` 区（现有 `transition-ui` / `transition-fast` / `focus-ring` / `tabular` 同级）新增 `scrollbar-none`：`scrollbar-width: none` + `&::-webkit-scrollbar { display: none }`，保证 28px 行高不被全局 `*::-webkit-scrollbar{height:10px}` 吃掉。
  3. `src/renderer/src/workbench/shellLayout.dom.test.tsx` 新增一条 jsdom 断言（放在既有 `it('keeps every toolbar row on one line')` 之后，同一 `describe.each(TIERS)` 块内）。
- 用户可见终态：960–1920 任意宽度下三行工具栏全部控件可经该行横向滚动到达且可点到，不裁切、不越出视口、不重叠；1440 / 1920 / 2560 宽档无溢出，类不触发，画面与现状一致。

## 验收

- ac-preflight-baseline: 开工自检通过——`git rev-parse HEAD` 等于 `git rev-parse main`（当前均为 `9cbeefb`）且 `package.json#version === '0.2.12'`；不满足则停手报 owner、不落盘（本项已在 Intake 验证通过，Coding 侧沿用同一自检）。
- ac-band-has-no-scroll: band 元素（`[data-shell-level="view-toolbar"]`）class 仍为 `levelBandClasses('view-toolbar')` 产出的全量 token，且不含 `overflow-x-auto` / `min-w-0` / `flex-wrap`（兜底只加在行容器，不动 band 结构）。
- ac-three-rows-scrollable: `view-toolbar` 内行容器恰为 3 个；每个行容器 `classList` 同时含 `min-w-0`、`overflow-x-auto`、`scrollbar-none`，且仍含 `h-7` 与 `gap-2`，并保留 `shrink-0`。
- ac-three-rows-no-wrap: 三行行容器 class 均不含任何以 `flex-wrap` 开头的 token；`view-toolbar` 子树内不存在 class 含 `flex-wrap` 的后代（既有断言不放宽）。
- ac-no-responsive-tokens: band 与三行行容器的 class token 中不含 `:`（即未引入 `sm:` / `md:` / `max-*:` 等响应式断点类）。
- ac-scrollbar-none-utility: `src/renderer/src/assets/main.css` 的 `@utility` 区存在 `scrollbar-none`，声明含 `scrollbar-width: none` 与 `::-webkit-scrollbar` 的 `display: none`；该 utility 未被应用到 `view-toolbar` 之外的元素。
- ac-narrow-960-controls-accessible: 渲染真实 `Workbench`（`createWebPlatformPort()` + `loadSamples()`）并 `setWindowWidth(960)` 进入目录视图后：`[data-shell-entry="filter"]` 命中恰 1 个；`zh('directory.filter.group')` 对应过滤档可查；`CompositionLegend` 的文本节点（图例）仍在文档中；`role="button"` + 可访问名 `zh('directory.toolbar.pickLeft')` / `zh('directory.toolbar.pickRight')` / `zh('directory.toolbar.loadSample')` 各命中恰 1 个按钮且未被 disabled 卸载。
- ac-narrow-960-third-row-reachable: 960 宽下第三行 `[data-shell-entry="snapshot-export"]` 仍在文档中（三行统一兜底，`Hide local paths` / 导出项未被删减或折叠进二级菜单）。
- ac-wide-tier-no-class-effect: `compact` / `regular` / `wide` 三个 width tier 下，行容器断言集合完全一致——即断言不因 tier 变化而放宽，`TIER_WIDTHS` 与 `SHELL_LEVELS` 表零改动。
- ac-release-surface-untouched: `git diff --name-only` 结果仅含 `src/renderer/src/views/DirectoryView.tsx`、`src/renderer/src/assets/main.css`、`src/renderer/src/workbench/shellLayout.dom.test.tsx`；`package.json`（含 `#version` = 0.2.12）、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-signing.md`、`.github/workflows/release.yml`、`docs/assets/*.png`、`docs/screenshots.md`、`src/renderer/src/workbench/shellLayout.ts`（`SHELL_LEVELS` / `minWidth` / `TIER_WIDTHS`）均零 diff。
- ac-gates-green: `pnpm test` 通过且新增断言在红（改前）绿（改后）两侧可判别；9 道 `code_gates`（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿，既有断言零弱化。

## 非目标

- 不改 `band` 的 `px-2 py-0.5 gap-1.5`、行高表 `levelRowClasses` / `levelBandClasses` / `SHELL_LEVELS`、行数、控件集合、顺序、文案、图标映射。
- 不引入响应式断点类、隐藏菜单 / 二级展开、运行时测量、JS 收拢或任何新依赖；`Load demo folder` 始终直接可达，不折叠。
- 不改主题 token 与四态差异语义色，不改既有 4 个 `@utility` 的声明；`scrollbar-none` 只作用于 `view-toolbar` 三个行容器。
- 不改对比 / 合并算法、视图模型、目录扫描与哈希、快照格式、`ToolbarButton` / `SegmentedControl` / `CompositionLegend` 组件内部实现。
- 不碰发布面：`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-signing.md`、`.github/workflows/release.yml`。
- 不加浏览器 / E2E / 截图测试；不跑 `pnpm screenshots`（2560 宽首行内容约 1146 < 2560，新增类不触发，画面像素零变化），`docs/assets/*.png` 与 `docs/screenshots.md` 不重写。不跑真机 / 桌面点选 / 浏览器验收；1024×900 亮暗 rect 由运营 QA 合入后复验。
- 不修改主检出 `/…/codebases/projects/open-compare`（旧快照，只读，禁任何 git 写操作）；若本工作树出现无 `data-shell-level="view-toolbar"` 的旧快照状态，按宿主同步缺口上报而非改树。

## 实现约束

- 三行统一使用同一兜底表达式 `min-w-0 overflow-x-auto scrollbar-none`，不做按行差异化判断（不溢出时无滚动条，视觉零变化）。
- 写法与仓库既有滚动兜底一致：`src/renderer/src/components/StatusBar.tsx` 与 `SessionTabs.tsx` 已用 `min-w-0 overflow-x-auto`，`shrink-0` 保留在行容器上。
- `scrollbar-none` 放在 `main.css` `@utility` 区，与 `transition-ui` / `transition-fast` / `focus-ring` / `tabular` 同级（Tailwind v4 `@utility` 语法），不改 `@theme` token 段。
- 断言必须以「类语义 + 可访问名」为准（jsdom 零布局，不做像素测量）；可访问名统一走 `translate('zh')` 的 i18n key，禁止硬编码中文字面量。
- 截图口径核对方式写进交付说明：`git diff --name-only` 仅 3 个允许文件、`docs/assets/*.png` 与 `docs/screenshots.md` 零改动，并注明「未重跑截图，2560 宽画面零变化」；若实现意外改变 2560 画面，才需 `pnpm screenshots` 并同步 `docs/screenshots.md` 的 `- commit:` 行（两项同步改，不得只换图）。
- 仓库门禁：`pnpm lint` / `pnpm typecheck` / `pnpm test` 必过；`src/core/` 零 Electron / React / DOM 依赖约束不受影响。
