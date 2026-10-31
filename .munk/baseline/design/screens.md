# Screens index

Links to key screens (not full page copies).

来源：WI `wi_ws_7d6e8664e391fe1f`（ui-baseline）。

- 主屏：`src/renderer/src/workbench/Workbench.tsx` — 顶栏（品牌图标 + `OpenCompare` 标题、平台、视图切换、`new-compare` / `open-file` / `open-folder` / `settings` 四个常驻动作；**无样本入口、无品牌副标题**）、会话标签条、中央工作区、底部状态栏。示例入口收在设置 →「示例与调试」（`SettingsDialog.tsx`：5 个 `[data-sample-entry]` + 调试开关下的 `[data-sample-failure]`）。
- 加载编排：`src/renderer/src/workbench/loadSampleSessions.ts`（`LoadedSession`、CSV/TSV 解析、加载下限时长、错误分支）。
- 场景视图 `src/renderer/src/views/`：`DirectoryView`（双栏树 + 可折叠散乱树 B）、`CodeView`（双栏 Diff ↔ 三栏 base·ours·theirs）、`CsvView`（左右原始表格，主键列着色）、`StructuredView`（JSON ↔ YAML 原文对）。
- 内置样本：`src/shared/fixtures/`（`types.ts` / `scenes.ts` / `index.ts` / `fixtures.test.ts`），纯数据 + 纯函数，零 Electron / DOM；`SAMPLE_FIXTURE_FILES` 由 Web 内存 `PlatformPort`（`src/renderer/src/platform/web-platform.ts`）挂载到 `/samples`，与 Electron 走同一契约。

## 主要取舍

1. **不做差异算法**：本项只读呈现样本原文，不做行级/字符级 Diff 与合并求解（属后续子项）。状态栏的差异计数与目录树标签来自样本自带的 **answer key**（`SampleComposition` + `DirectoryNode.status` 的编辑期标注），不是运行时算出来的。
2. **加载态可见性**：样本在内存中、解析仅数毫秒，因此 `loadSampleSessions` 设了 420ms 的加载下限，避免加载态一闪而过；真实文件会话接入后该下限可去掉。
3. **错误态可达性**：正常工作流不会失败，错误态自检入口现为设置 →「示例与调试」的失败项（`simulateFailure`，仅在 `showDebugSamples` 为真时渲染，生产默认不出现），用于人工查看错误态与重试。
4. **三栏默认**：代码会话默认三栏（base·ours·theirs）以呈现 3-Way Merge 场景，双栏 Diff 由视图内切换；目录 / CSV / JSON·YAML 会话为双栏。
5. **不做虚拟滚动**：CSV 表格按行直出（1,240 行，Chromium 无压力），虚拟列表留给 CSV 主键对齐子项与真实万行数据。
6. **主题可换但不交浅色皮肤**：token 按可换主题组织（颜色全部走 CSS 变量），本项不做主题切换 UI。
7. **文件读取经 `PlatformPort`**：样本库在 Web 内存模式可被 `listDirectory` / `readTextFile` 读取（有 vitest 覆盖），Electron 侧不落盘临时目录（按本项非目标）。
