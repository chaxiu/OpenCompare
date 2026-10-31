# topbar-workflow-empty-state-de-demo

covers: ac-no-topbar-samples, ac-brand-subtitle-gone, ac-directory-toolbar-no-demo, ac-directory-toolbar-real-entries-kept, ac-picker-unavailable-copy, ac-settings-samples-five-entries, ac-settings-entry-starts-session, ac-settings-sample-entries-reuse-path, ac-settings-failure-entry-debug-only, ac-empty-three-real-ctas, ac-empty-hint-points-to-settings, ac-entry-list-18, ac-shell-dom-18, ac-i18n-parity, ac-icons-no-orphan, ac-code-gates-green
标题: 顶栏 / 目录工作流 / 空态去 demo——`samples` 工具按钮与 `samples-menu` 下拉、品牌副标题、「加载演示目录」「演示：远端快照」全部撤出第一层入口；5 个场景入口与调试专用失败项统一收进 `SettingsDialog` 的「示例与调试」分区；`SHELL_ENTRIES` 入口清单 20 → 18
步骤: 读 `.munk/changes/wi_ws_8959816f18ce7acf/prd.md`；`git diff -- src/renderer/src/workbench src/renderer/src/views/DirectoryView.tsx src/renderer/src/perf/PerfRunner.tsx src/renderer/src/i18n src/renderer/src/assets/icons docs/ui-phase1-reference-audit.md`；`pnpm test src/renderer/src/App.test.tsx src/renderer/src/App.i18n.test.tsx src/renderer/src/App.settings.test.tsx src/renderer/src/App.snapshot.test.tsx src/renderer/src/App.smoke.test.tsx src/renderer/src/views/DirectoryView.test.tsx src/renderer/src/views/directoryI18n.test.tsx src/renderer/src/workbench/DirectoryReportExport.test.tsx src/renderer/src/workbench/shellLayout.test.ts src/renderer/src/workbench/shellLayout.dom.test.tsx src/renderer/src/perf/perfShell.test.tsx src/renderer/src/assets/icons/icons.test.ts src/renderer/src/i18n/messages.test.ts`；Host `code_gates`（10 gates，attempt 001，`.munk/runs/run_ws_1828c869e01e6829/code-gates/attempts/001`）
期望: 见下方分条断言与入口表。核心口径：① 顶栏空态与 ready 态都不存在 `[data-shell-entry="samples"]` / `[data-shell-entry="samples-menu"]`，也查不到 `加载演示样本` / `演示样本` / `Load demo samples` / `Demo samples` 按钮或菜单触发器（`App.test.tsx` 的 `mounts the empty workbench on the in-memory PlatformPort` 与 `shows the loading state, then every sample session`，`App.i18n.test.tsx` 的 `queryByRole(...) === null` 两条翻转断言）。② 品牌区只有品牌图标 + `OpenCompare` 标题（`getByRole('heading', { name: 'OpenCompare' })`），`shell.header.brandSubtitle` 中英键不存在（`messages.test.ts` 键集合 + `en` 侧 `Record<keyof typeof zh…>` 编译期约束）。③ `DirectoryView` 工具栏无「加载演示目录」/「演示：远端快照」按钮，`DirectoryViewProps` 无 `onLoadSample` / `onLoadRemoteSnapshotSample`，`Workbench` 与 `perf/PerfRunner.tsx` 无同名传参（`tsc --noEmit` 通过即证；`DirectoryView.test.tsx` 新增 `DirectoryView workflow toolbar` → `keeps the real entries and drops both demo shortcuts`）。④ 真实 `data-shell-entry` 保留：filter / sync / template / snapshot-import / snapshot-export / report-export 与三行结构不变（`shellLayout.dom.test.tsx` 的 960 窄档断言、`DirectoryReportExport.test.tsx`）。⑤ `directory.picker.unavailable` 中英均不再含「加载演示目录 / Load demo folder」，改指「设置 → 示例与调试」/ Settings → Samples & debugging 或桌面端选择器。⑥ 设置面板默认（`showDebugSamples` 为 false）下 `[data-sample-entry]` 恰 5 个，id 排序后为 `code` / `csv` / `directory` / `remote-snapshot` / `structured`，`[data-sample-failure]` 数量 0（`App.settings.test.tsx` 的 `settings sample section` → `lists exactly the five scenes and keeps the failure entry out by default`）。⑦ 依次点击 5 个入口：设置对话框先关闭（`queryByRole('dialog', { name: 'Settings' }) === null`），再出现对应会话 tab 并 `aria-selected === 'true'`（`starts and activates the matching session from every entry`，远端快照落到 `baseline ↔ remote-prod`）。⑧ 5 个入口复用既有路径：`loadSampleScene` 调 `load({ scene })`、`loadRemoteSnapshotSample` 调 `runSidesCompare(remoteSnapshotSides())`，`src/shared/fixtures/**` 与 `SceneId` 零 diff、无新增加载函数（静态核对 + `git diff`）。⑨ 调试失败项只在 `showDebugSamples` 为真时渲染，标识 `data-sample-failure`，点击后进入错误态并保留「重试」，且 `[data-sample-entry]` 仍为 5（`renders the failure entry only under the debug switch, outside the five`）；生产入口 `App.tsx` 注入 `import.meta.env.DEV`、`Workbench` 默认 `false`。⑩ 空态 `main` 内按钮恰 3 个（新建对比 / 打开文件 / 打开文件夹），hint 含「设置 → 示例与调试」且不含「顶栏」/「加载样本」动词，description 只讲真实路径（`App.test.tsx` 空态用例）。⑪ `SHELL_ENTRY_IDS` 与 `ACCEPTANCE_ENTRIES` 均 18 条且集合相等（`shellLayout.test.ts` 的 `declares exactly the eighteen accepted entries`），`APP_ROW.entries` / `SHELL_ENTRY_ICONS` 键集合同步（`satisfies Record<ShellEntryId, IconName>` 编译通过）。⑫ `shellLayout.dom.test.tsx` 的 `covers all eighteen entries across the ready views, none of them twice` 断言并集恰 18 条、无重复、`seen.size === 18`；`loadSamples()` helper 改走设置入口（逐个 `[data-sample-entry]`），960 窄档不再断言 `loadSample`。⑬ i18n 同批：被删键 en/zh 同时消失、`settings.samples.*` 成对存在、`messages.test.ts` / `shellScan.test.ts`（含 `SettingsDialog.tsx`）/ `i18n/mainScan.test.ts` 全绿。⑭ 图标无孤儿：`layers.svg` / `sparkles.svg` 与 `ICON_PATHS` / `UI_ICON_ACTIONS.sample` 同批删除，`icons.test.ts` 全绿（vendored svg ↔ `ICON_PATHS` 一一对应、`SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` 无悬空引用、渲染源码不引用已删图标）。⑮ `code_gates` 10 gates 全绿（`pnpm test` 91 files / 1351 passed + 1 skipped / 1352）。

## 入口 → 位置（本轮变化：删 2 条，20 → 18）

| 入口 id | level | slot | compact (1024) | regular (1440) | wide (1920) |
| --- | --- | --- | --- | --- | --- |
| open-file | app | global-actions | icon-only | label | label |
| open-folder | app | global-actions | icon-only | label | label |
| new-compare | app | global-actions | icon-only | label | label |
| ~~samples~~ | ~~app~~ | ~~global-actions~~ | 已删除（迁入设置 → 示例与调试） | — | — |
| ~~samples-menu~~ | ~~app~~ | ~~global-actions~~ | 已删除（迁入设置 → 示例与调试） | — | — |
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

核对方法：表即 `SHELL_ENTRIES`（`src/renderer/src/workbench/shellLayout.ts`）的逐行投影，`SHELL_ENTRY_IDS` 与 18 条名单做集合相等断言（多一条 / 少一条即红），DOM 侧按 `data-shell-entry` 计数与可见性复核，呈现模式用 `entryPresentation(entry, tier)` 与元素可访问名逐项比对。删除的 2 条入口（`samples` / `samples-menu`）不是「入口丢失」而是**整体迁址**：样本能力的用户路径变为 设置齿轮 →「示例与调试」→ `[data-sample-entry]`（5 条），由 `App.settings.test.tsx` 的 `settings sample section` 三条用例覆盖，并且 `settings` 入口本身仍在 `app / global-actions`。

## 未改范围（核对清单）

- `src/shared/fixtures/**` 与 `SceneId` 零 diff（只搬入口，不删样本）。
- `classifyFile` / `openFilePair` / `createDirectorySession` / `createDrilldownSession`、对比 / 合并 / 扫描算法、四态语义、快照格式、导出格式零改动。
- `package.json#version`（0.2.13）、`CHANGELOG.md`、`docs/release-notes/**`、`README*`、`.github/workflows/release.yml`、`docs/release-signing.md`、`release-packaging.test` 零 diff。
- `SegmentedControl` 视图切换、`shell.viewSwitcher.label`、`VIEW_OPTIONS`、`APP_ROW` 的 `view-switch` 控件预算保留（下一项工作项再动）。
- 未削弱既有硬断言：`SHELL_LEVELS`、三行工具栏、无 `flex-wrap`、无响应式 `:` 类；`it.skip` 仍为 1 条既有项。

## 最近执行

- workItemId: wi_ws_8959816f18ce7acf
- at: 2026-10-31
- status: pass
- note: 本轮 `needSelfTest=false`，UI 自测跳过，以 Host `code_gates` 为交付门槛（10 gates attempt 001 全绿，`.munk/runs/run_ws_1828c869e01e6829/code-gates/attempts/001`；`pnpm test` 91 files / 1351 passed + 1 skipped / 1352）。实现面静态核对：`Workbench.tsx` 顶栏只留品牌 Icon + `OpenCompare` heading 与 `new-compare` / `open-file` / `open-folder` / `settings` 四个 `data-shell-entry`；`SettingsDialog.tsx` 的 `SAMPLE_ENTRIES` 为 5 条静态表（`data-sample-entry` 稳定 id + 复用 `shell.view.*` 标签），失败项 `data-sample-failure` 由 `showDebugSamples` 门控；`loadSampleScene` / `loadRemoteSnapshotSample` / `loadSampleFailure` 都在起会话前 `setSettingsOpen(false)`；`DirectoryView.tsx` 已无 `onLoadSample` / `onLoadRemoteSnapshotSample`；`shellLayout.ts` 的 `ShellEntryId` 联合为 18 个字面量。**未做真实浏览器 / 桌面点选复核**：设置分区视觉密度、5 条入口点击后的滚动 / 焦点落点、调试开关在生产构建中的静态排除，均只由 jsdom 断言与 `import.meta.env.DEV` 注入表达，运营 QA 合入后需在 `pnpm dev` / `pnpm dev:web` 各点一遍。
