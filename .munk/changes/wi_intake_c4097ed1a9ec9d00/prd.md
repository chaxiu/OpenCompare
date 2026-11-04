# 修窄窗工具栏溢出与浅色图例对比度

## 范围

目录视图 `view-toolbar` 在窄窗下横向溢出、右端「更多」被推出视口；同一行的四态图例 chip 在浅色主题下文字对比度不达 WCAG AA 小字号门槛。

已实测的现状（HEAD = `95458b9`，工作树干净）：

- 行内只有 direction / mode 两个 `SegmentedControl` 可收缩，其余（`span[data-shell-entry="filter"]`、`CompositionLegend`、同步主按钮、「更多」包装 span）全是 `shrink-0`；行容器 `flex w-full min-w-0 h-8 gap-2` 无 `flex-wrap`、无 `overflow-*`，band 无固定高度。
- 真实内容宽约 zh 1105px / en 1420px；可用宽 1024→1008、960→944、1280→1264。而 `shellLayout.ts` 的 `TOOLBAR_ROWS`（directory-toolbar）只声明 863px，所以 `measureToolbar('compact', …).fits === true` 从未反映真实布局；`DirectoryView` 也从未读取 `useWidthTier`，三档「compact 隐藏文本」的约定在这条行上根本没有接线。
- 浅色主题 `--color-diff-{same,added,removed,modified}` 对各自 chip 背景（`-soft` / `surface-sunken`）实测约 3.0:1，属 11–13px 小字不达标。

本项做两件事：

1. **窄窗不裁切**：在 `shellLayout.ts` 建纯模型（按 zh / en 实测控件宽度 + 固定折叠阶梯）决定目录工具行是单行还是两行，以及是否折叠次要文案；`DirectoryView` 只消费模型结果。折叠只隐藏文本、保留按钮与可访问名；仍放不下时行容器换行、band 按行数增高；单行仍为 36px。
2. **浅色图例对比度**：把亮色五个 `--color-diff-*` 前景值调到对 chip 背景 ≥ 4.5:1，暗色取值零 diff，四态 ΔE 与色相纪律不变。

## 验收

- ac-row-fits-zh-en: 对宽度 `{960, 1024, 1280, 1440, 1920}` × 语言 `{zh, en}`，`shellLayout` 的目录工具行模型对每一行给出 `required <= available`；渲染出的行容器 class 不含 `overflow-x*`、`scrollbar-none` 与任何含 `:` 的响应式 token；band class 仍等于 `levelBandClasses('view-toolbar')`。
- ac-band-height-by-rows: 模型行数为 1 时 `toolbarBandHeightPx(1) === 36`；为 2 时 `=== 72`，且与 `levelHeightPx('view-toolbar') * rows` 一致；band 元素不设固定高度，行容器为 `min-h-8` + `flex-wrap`，换行后内容不被裁切。
- ac-reference-widths-one-row: 1024（compact 参考档，zh）与 1280 / 1440 / 1920（zh）模型行数为 1、band 为 36px；zh@1280 图例状态词仍然渲染。
- ac-collapse-hides-text-only: 折叠档下每个图例 chip 不再渲染状态词文本，但该 chip 的 `title` 与 `aria-label` 都含该状态的本地化词（取 `DIRECTORY_STATUS_LABEL_KEYS`，与行内文案同一份 key）；同步主按钮折叠时 icon-only 且 `aria-label === t('directory.toolbar.previewSync')`；未折叠时文案与现状逐字一致。
- ac-collapse-order: 折叠阶梯固定为「图例状态词 → 同步主按钮文案 → 行容器换行」；filter 的 5 个 `role="tab"`、direction / mode 两个 `tablist`、同步按钮、更多触发器在 960 与 1920 都不得被折叠进菜单或被移除。
- ac-no-entry-removed: 960 zh / en 下 DOM 仍含 filter 5 tab、direction 2 tab、mode 2 tab、同步按钮、更多按钮、当前可见的图例 chip；`entriesFor('view-toolbar', 'directory')` 与「更多」菜单条目集合和 HEAD 完全一致。
- ac-light-legend-contrast: 亮色主题下对 same / added / removed / modified / conflict 五色，`contrastRatio(diff-x, same ? surface-sunken : diff-x-soft) >= 4.5`；`src/core/theme/contrast.test.ts` 从 `main.css` 文本实读该断言，且该断言在旧值（≈3.0）失败、新值通过。
- ac-dark-untouched: 暗色块五个 `--color-diff-*` 取值与 HEAD 逐字节相同；暗色既有 ≥3:1 断言与四态 ΔE ≥ 12 断言保持不放宽。
- ac-state-separation: 两套主题内 same / added / removed / modified 两两 CIE76 ΔE ≥ 12，每色对 `surface-base` ≥ 3:1（现有断言保持）。
- ac-token-source: `src/renderer/src/**` 的 JSX/TS 中零 `#hex` / `rgb(` / `hsl(` 字面量；差异色只经 `--color-diff-*` token；`-soft` 背景值与 HEAD 相同（除按实现约束重算并记录实测表的情况）。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿；本项有意修改的既有断言（`controlPresentation('legend', …)`、DOM 中对 `view-toolbar` 的 `flex-wrap` 禁令、`TOOLBAR_ROWS` 数值）逐条在交付说明里点名，其余断言不得删除或放宽。

## 非目标

- 不新增 / 删除工具行入口，不改「更多」菜单内容与顺序，不改 `SHELL_LEVELS` 高度表、`CHROME_BASELINE_PX`（单行仍 36，ready 态仍 84）与 `TIER_WIDTHS` 参考档。
- 不改对比 / 合并 / 目录扫描 / 同步 / 模板算法与视图模型；不改 i18n 文案、不新增文案 key（只复用现有 key 作 `aria-label` / `title`）。
- 不改其他视图（code-diff / code-merge / csv / structured）的工具行排布与 class；不做 < 960 适配。
- 不改暗色 token、accent / danger token、字体 / 圆角 / 间距体系；不引响应式断点类、运行时 DOM 测量、横向滚动兜底或新依赖。
- 不做浏览器 / E2E / 桌面点选验收；不重跑截图，除非 1280 zh 画面像素发生变化——若变化则按既有截图纪律（先提交渲染层改动，再在该 commit 上 `pnpm build` + 捕获脚本重拍，`docs/screenshots.md` 记录该 commit，`docs/visual/v1/before/**` 不覆盖）。
- 不碰发布面：`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-signing.md`、`.github/workflows/release.yml`。

## 实现约束

- 排布单一事实源：宽度表、折叠阶梯、行数判定全部写进 `src/renderer/src/workbench/shellLayout.ts` 的纯数据 / 纯函数，`DirectoryView.tsx` 只读取结果；JSX 不写宽度常量、不用 Tailwind 响应式前缀分档（`shellLayout.ts` 零 DOM / 零 Electron 不变）。
- 控件宽度按 locale 分别实测（zh / en 各一套），图例计数按最多 4 位预留，避免计数变化导致折叠抖动；判定只依赖窗口宽度 + 当前语言，不做运行时像素测量。
- 折叠只隐藏文本：`CompositionLegend` 增加一个显式 prop 控制是否渲染状态词（默认值保持现状，避免影响其他调用点）；chip 用 `title` + `aria-label`（复用 `DIRECTORY_STATUS_LABEL_KEYS`），同步按钮用 `aria-label`（`directory.toolbar.previewSync`）。
- 折叠阶梯固定：图例状态词 → 同步主按钮文案 → 行容器换行；换行只加在 `view-toolbar` 的行容器（`flex-wrap` + `min-h-8`），band 不设固定高度，行 / band 不得出现 `overflow-x-auto` / `scrollbar-none`。
- 亮色对比度：只改亮色块五个 `--color-diff-*` 前景值，其余 token 零 diff；保持四态同族色相与「red = removed / danger 同族」语义，`-soft` 背景不动。若实测发现某色无法同时满足 ≥ 4.5 与 ΔE ≥ 12，允许重算对应 `-soft` 并在交付说明附实测表。
- `contrast.test.ts` 的阈值提升只作用于「亮色前景 / chip 背景」这条断言（3 → 4.5），其余阈值不动；受影响的既有断言随实现更新并在交付说明点名。
- 依据：`.munk/baseline/design/foundations.md`（token 唯一来源与改色纪律）、`.munk/baseline/domains/shell-tightening/product.md`（单行 / 高度 / 溢出收纳口径）、`.munk/baseline/domains/workbench/product.md`（compact 折叠 = 隐藏文本、保留按钮，`icon-only` 须带同值 `aria-label`）。
- 门禁以 `.munk/code-gates.json` 为准，不新增长跑门禁；`src/core/` 零 Electron / React / DOM 约束不受影响。
