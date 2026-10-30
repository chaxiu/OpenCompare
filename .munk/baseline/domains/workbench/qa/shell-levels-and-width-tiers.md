# shell-levels-and-width-tiers

covers: ac-level-order, ac-level-metrics-single-source, ac-no-wrap, ac-fit-1024, ac-fit-1440, ac-fit-1920, ac-entry-manifest-complete, ac-entry-tier-visibility, ac-drilldown-unchanged, ac-statusbar-unchanged, ac-rows-not-reduced, ac-no-scope-drift, ac-gates-green, ac-delivery-entry-table
标题: 壳层五级单一尺寸表 + 三档窗口宽度（compact 1024 / regular 1440 / wide 1920）+ 20 条入口清单全部收敛进 `workbench/shellLayout.ts` 纯模块；壳层不再有自成一行且节奏不一致的下钻返回条，视图工具区单行不换行、compact 只隐藏文本不隐藏入口
步骤: 读 `.munk/changes/wi_ws_cfd7df4f1ef376ca/prd.md`；`git diff -- src/renderer/src/workbench src/renderer/src/views src/renderer/src/components/{Panel,StatusBar,DropdownMenu}.tsx`；`pnpm test src/renderer/src/workbench/shellLayout.test.ts src/renderer/src/workbench/shellLayout.dom.test.tsx src/renderer/src/App.test.tsx src/renderer/src/views/DirectoryView.test.tsx`；Host `code_gates`（9 gates，attempt 001，`.munk/runs/run_ws_d10479269df01b2f/code-gates/attempts/001`）
期望: 见下方「入口 → 位置」表与分条断言。核心口径：① `[data-shell-level]` DOM 顺序恒为 `app` → `sessions` → (`events`) → (`view-toolbar`) → `panels` → `status`，每级恰好一次，`events` 只在有 notice 或目录进度时出现且夹在 `sessions` 与 `view-toolbar` 之间（`shellLayout.dom.test.tsx` 的 `renders the five shell levels in order, once each` / `shows the event band only between the session head and the view toolbar`）。② 各级高度 / 内边距 / 间距 / 控件高度全部来自 `SHELL_LEVELS`（`h-11` / `h-9` / `h-7` / `h-7` / `h-8` / `h-8`，`px-3` 除 `view-toolbar` 与 `panels` 为 `px-2`），表里没有宽度维度，故三档下不变（`matches every level metric to the single layout table` + `keeps one height per level, independent of the window width`）。③ 三档下 `app` / `view-toolbar` 子树无 `flex-wrap` / `flex-wrap-reverse`，1024 档 `events` / `sessions` / `panels` 也不换行（`keeps every toolbar row on one line`）。④ `measureToolbar(tier, level, view)` 在三档 × 全部视图（含下钻行）`required ≤ available` 全为 `true`（`fits the app head at 1024 / 1440 / 1920` / `fits every view toolbar at 1024 / 1440 / 1920`）。⑤ `SHELL_ENTRY_IDS` 与 20 条入口集合完全相等，ready 态每个 `data-shell-entry` 恰好出现一次且可见（`declares exactly the twenty accepted entries` / `renders every entry once with the presentation the table declares` / `covers all twenty entries across the ready views, none of them twice`）。⑥ `icon-only` 时元素可访问名非空且等于对应 i18n 文案，档位只改呈现不改 id 集合（`gives every entry a determinate presentation at each tier` / `only ever hides copy, never adds width or drops the entry` / `collapses only label widths when the window is compact`）。⑦ 下钻返回条仍是 `view-toolbar` 级首行、与工具区同档高度（`h-7`），点击回父目录会话、文案键与 `title` 键不变、往返状态保持（`keeps the drilldown back entry first on the view-toolbar level` / `keeps the csv drilldown back entry on the first row as well` + 既有 `DirectoryView` 往返断言不放宽）。⑧ 状态栏条目集合与顺序不变、文字仍 `text-2xs` + `tabular`（`keeps the status bar entries and their order`）。⑨ ready 态 chrome = `44 + 36 + 32 = 112px`（= 基线，未超），三档一致；每个视图 `contentRowBudget` 的可见行数 ≥ 改动前基线带高（`keeps the ready chrome at or under the pre-change 112px baseline` / `does not lose a visible row against the pre-change bands`）。⑩ `SessionTabs.tsx` / `DiffRuler.tsx` / `src/core/**` / `main.css` 的 `--color-diff-*`·`--color-surface-*` / `src/renderer/src/assets/icons/**` / `package.json` 依赖全部零 diff，无新增 emoji 或文字充当图标。⑪ `code_gates` 9 gates 全绿（`pnpm test` 71 files / 1149 passed + 1 skipped / 1150）。

## 入口 → 位置（level + slot + 三档呈现模式）

| 入口 id | level | slot | compact (1024) | regular (1440) | wide (1920) |
| --- | --- | --- | --- | --- | --- |
| open-file | app | global-actions | icon-only | label | label |
| open-folder | app | global-actions | icon-only | label | label |
| new-compare | app | global-actions | icon-only | label | label |
| samples | app | global-actions | icon-only | label | label |
| samples-menu | app | global-actions | icon-only | label | label |
| settings | app | global-actions | icon-only | icon-only | icon-only |
| filter | view-toolbar | directory-filter | label | label | label |
| sync | view-toolbar | directory-sync | label | label | label |
| template | view-toolbar | directory-sync | label | label | label |
| snapshot-import | view-toolbar | directory-snapshots | label | label | label |
| snapshot-export | view-toolbar | directory-snapshots | label | label | label |
| report-export | view-toolbar | directory-report | label | label | label |
| drilldown-back | view-toolbar | drilldown（首行） | icon-only | label | label |
| prev-diff | view-toolbar | code-navigation | icon-only | icon-only | icon-only |
| next-diff | view-toolbar | code-navigation | icon-only | icon-only | icon-only |
| override | view-toolbar | code-edit | label | label | label |
| save | view-toolbar | code-edit | label | label | label |
| merge-accept | view-toolbar | merge-resolve | label | label | label |
| export | view-toolbar | merge-export | label | label | label |
| tab-select | sessions | tabs | label | label | label |

核对方法：表即 `SHELL_ENTRIES`（`src/renderer/src/workbench/shellLayout.ts`）的逐行投影，测试不重写数值而是直接读该表——`SHELL_ENTRY_IDS` 与 AC 名单做集合相等断言（多一条 / 少一条即红），DOM 侧按 `data-shell-entry` 计数与可见性复核，呈现模式用 `entryPresentation(entry, tier)` 与元素可访问名逐项比对。因此「无入口丢失、无新增功能」由「集合相等 + 每 id 渲染一次 + 档位内 id 集合不变」三条共同保证，证据在 `src/renderer/src/workbench/shellLayout.test.ts`（纯表断言）与 `src/renderer/src/workbench/shellLayout.dom.test.tsx`（真实 `Workbench` 三档渲染）。

## 最近执行

- workItemId: wi_ws_cfd7df4f1ef376ca
- at: 2026-10-30
- status: pass
- note: 本轮 `needSelfTest=false`，UI 自测跳过，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_d10479269df01b2f/code-gates/attempts/001`；`pnpm test` 71 files / 1149 passed + 1 skipped / 1150）。静态核对：`shellLayout.ts` 零 DOM / 零 Electron 依赖，只有 `HEIGHT_PX` / `SPACING_PX` / `PADDING_X_PX` 三张 utility→px 映射（只用现有 `h-6/h-7/h-8/h-9/h-11`、`px-2/px-3`、`py-0/0.5/1/2`、`gap-0/1.5/2/3`），无宽度维度键；`SHELL_LEVELS` 六个 level 的 `height` / `paddingX` / `paddingY` / `gap` / `stackGap` / `controlHeight` 被 `levelRowClasses` / `levelBandClasses` / `levelHeaderClasses` 三个 helper 投影成 class，`Panel` 标题栏与 `StatusBar` 已改为读 helper（不再写死 `h-8 px-2.5`）；`resolveWidthTier` 断点 1280 / 1680 落在三档参考宽之间，`useWidthTier` 只挂一个 `resize` 监听。壳层结构：`Workbench` 的 `app` / `sessions` / `events` / `status` 四级自带 `data-shell-level`，`view-toolbar` 与 `panels` 由四个视图自带；下钻返回条不再自成 `h-8 px-2` 一行，改由 `Workbench.drilldownLeading()` 交给视图作 `view-toolbar` 首行（`toolbarLeading`，`CodeView` / `CsvView` / `StructuredView` 均接）。视图内 `p-2` 根内边距移除，工具行改由 level band/row class 统一，行内可横向溢出的分组用 `overflow-x-auto` 而非 `flex-wrap`，因此单行不换行、入口不被挤掉。`DirectoryView` 的三段工具行结构保留（不合并）。注意：① 新增壳层条目必须先加进 `SHELL_ENTRIES` 并给三档 `presentation` + `width`，否则 `ac-entry-manifest-complete` 的比例预算与 DOM 计数会红；② 任何新工具区必须带 `data-shell-level="view-toolbar"` / `"panels"` 并走 `levelRowClasses` / `levelBandClasses`，不要自己写 `h-*` / `gap-*`；③ `icon-only` 折叠必须在组件上补 `aria-label`（DropDownMenu 已加 `iconOnly` + `entryId` 两个 props），只隐藏文本不隐藏按钮；④ 后续图标 / 主题项可直接复用 `data-shell-entry` 与 `entryPresentation` 钩子；⑤ jsdom 渲染 `Workbench` 需给 `HTMLElement.prototype.clientWidth/clientHeight` 与 `window.innerWidth` 打桩，否则虚拟化树无视口。
