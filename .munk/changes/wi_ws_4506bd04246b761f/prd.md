# 目录导出进度、可取消与三种保存结果接线

## 范围

把已交付的报告内核异步入口接到 renderer，只改 renderer 接线与必要文案：

1. `src/renderer/src/workbench/directoryReport.ts`
   - 新增异步包装 `buildDirectoryReportForComparisonAsync(comparison, t, language, hideLocalPaths, options, generatedAt?)`，调用前序已交付的 `buildDirectoryReportAsync`，构造**同一个** `DirectoryReportInput`（`directoryReportSource(comparison)`、`directoryReportStrings(t)`、`htmlLang(language)`、`APP_VERSION`、`hideLocalPaths`）、透传 `signal` / `onProgress`。
   - 现有同步 helper `buildDirectoryReportForComparison` 保留不动（既有测试与比对用途）。
   - 若节流器落在本模块，导出为可单测的小 helper。
2. `src/renderer/src/workbench/Workbench.tsx`
   - `handleExportReport` 改为**独立导出任务状态**：进行中标记 + `AbortController` + 节流进度；不复用 `directoryBusy`。
   - 生成（异步、可取消、可上报进度）完成后再调一次 `platform.saveFile`；成功 / 返回 `null` / reject 三路径分别收口（成功 info 提示含路径，截断带 N / M；取消静默；reject 走既有 `detailNotice(errorText(...))`）。
   - 取消生成：abort → 不调 `saveFile`、不写盘、进度区消失、按钮恢复、不渲染 danger 错误。
3. `src/renderer/src/views/DirectoryView.tsx`
   - 报告工具栏第三行新增行内进度区（`role="status"`，含已处理 / 总数）与「取消」入口；导出按钮在导出中 disabled（保持既有可访问名与 title），取消按钮永不被 busy 禁用。
   - 导出中不改 `busy` 语义：其它 `directoryBusy` 门控按钮不受影响。
4. `src/renderer/src/i18n/messages/{zh,en}/directory.ts`：只新增 `directory.report.*` 下进度 / 取消 / 已取消/导出中所需的最小键集，zh/en 一一对应。
5. 测试：`DirectoryReportExport.test.tsx`（26,000 文件真实双目录 fixture 的 Workbench 集成）、`directoryReport.test.ts`（同步 / 异步一致性、signal / 进度透传）、`DirectoryView.test.tsx`（新增 props 与既有工具栏回归）、节流器单测。

## 验收

- ac-export-progress-on-click: 已打开目录对比的 Workbench 中点击「导出 HTML 报告」，在 `saveFile` 被调用之前同步可断言：出现导出进度区（`role="status"`），文本含已处理行数与总数、且总数等于 `directoryReportSource(comparison).totalRows`（树行数）；同一区域存在 enabled 的「取消」按钮；导出按钮 `disabled === true`。
- ac-progress-throttled: 节流器在 `vi.useFakeTimers()` 下：同一时刻连续 100 次进度回调导致提交次数 ≤ 2，最终提交值为最后一次 `processedRows/totalRows`；首次回调无需等待窗口即可见（进度不空白）；窗口结束后下一次回调提交新值；生成 resolve 时强制提交最终值。
- ac-export-ui-interactive: 导出进行中，过滤器 tab 与「隐藏本机路径」checkbox 仍 enabled 且点击后状态生效；被 `directoryBusy` 门控的按钮（载入样本 / 预览同步 / 模板 / 导出快照 / 导入快照 / 远端样本）保持 enabled；导出结束后（成功 / 取消保存 / 失败 / 取消生成）它们仍 enabled，未残留全局 busy。
- ac-export-not-reentrant: 导出进行中再次点击导出按钮不启动第二个任务（生成调用 1 次、`saveFile` 1 次）；导出按钮可访问名恒为 `directory.report.toolbar.export`（不因导出中改名）。
- ac-cancel-generation-no-save: 进度出现后点击「取消」→ `saveFile` 调用 0 次；进度区消失；导出按钮恢复 enabled；默认路径 `<left>-vs-<right>.html` 在平台沙箱 `exists === false`；保存目标目录条目集合与导出前完全相同（无 0 字节 / `.tmp` / 半成品）；不出现 danger 的 `role="alert"`（允许一条普通 info「已取消导出」）。
- ac-cancel-then-export: 取消后立即再次导出且 `saveFile` resolve 路径 → 恰好 1 次 `saveFile`（本次），出现成功提示，报告内容以 `<!DOCTYPE html>` 开头、`</html>` 闭合且四态计数与 legend 一致（无残留控制器或半成品）。
- ac-save-success-path: `saveFile` resolve `'/memory/left-vs-right.html'` → 无 danger `role="alert"`；info 提示文本包含完整路径；`saveFile` 参数 `defaultPath` 仍为 `left-vs-right.html`、`filters[0].extensions` 含 `html`、`content` 为完整自包含文档。
- ac-save-truncated-copy: 生成结果为截断时成功提示文本同时包含 `shownRows` 与 `totalRows` 两个数字（逐字）；未截断时提示不含这两个数字。用 stub 的截断生成结果（如 `shownRows: 120000 / totalRows: 358156`）驱动接线断言。
- ac-save-cancelled-silent: `saveFile` resolve `null` → `saveFile` 恰 1 次、无 `role="alert"`（含 info）、平台内目标 / 默认文件名不存在、导出按钮恢复；随后再次导出可成功。
- ac-save-unwritable: `saveFile` reject `new Error('无法写入文件 …：只读（EROFS）')` → 出现 danger `role="alert"`，文本含该消息且不含成功文案；目标路径无文件、无临时残留；导出按钮恢复；再次点击触发第二次 `saveFile` 调用（可重试）。
- ac-async-parity: 同一 `comparison` / `t` / `language` / `hideLocalPaths` / `generatedAt` 下，`buildDirectoryReportForComparisonAsync` 与 `buildDirectoryReportForComparison` 的 `html` 逐字符相等，`bytes` / `totalRows` / `shownRows` / `truncatedRows` / `truncated` 逐项相等（zh、en × hideLocalPaths true、false 各覆盖）。
- ac-async-signal-progress: 异步包装原样透传 `signal` / `onProgress`：未 abort 时 `onProgress` 收到的 `totalRows` 恒等于树行数、`processedRows` 单调不减且最后一次等于实际消费行数；传入已 abort 的 `AbortSignal` 时以 `name === 'OperationCancelledError'` reject，`saveFile` 0 次。
- ac-real-fixture-report: 26,000 文件双目录 fixture 经 UI 导出：报告四态与 `CompositionLegend` DOM 逐项相等；`<html lang>` 为 `zh-CN` / `en`；`.meta-app-version` 为 `APP_VERSION`；隐藏本机路径开关两种状态行为不变；默认文件名与滤镜不变（既有集成断言原样保留并通过）。
- ac-toolbar-regression: `DirectoryView` 既有「每个 filter 下导出按钮可用且回调一次」「busy 时禁用不回调」「hideLocalPaths 双向」三组用例零回归；未传新增进度 props 时渲染与现状一致（导出按钮 enabled、无进度区）。
- ac-i18n-parity: 新增 `directory.report.*` 键在 zh / en 一一对应且非空，`messages.test.ts` parity 通过；en 界面下进度 / 取消 / 已取消文案不含中文字符。

## 非目标

- 不改 `src/core/directory/report.ts`、`buildDirectoryReportAsync` 签名与块大小、`DIRECTORY_REPORT_MAX_ROWS` / `DIRECTORY_REPORT_MAX_BYTES`、截断回撤、转义、自包含、隐私相对化、报告结构与既有报告文案键。
- 不改 `PlatformPort.saveFile` / `SaveFileOptions`、主进程原子写、IPC 通道、preload、Web 平台实现。
- 不新增页面 / 面板 / 弹窗 / 设计 token；不重排目录工具栏既有按钮顺序；不新增第三方依赖；不改 `.munk/code-gates.json`、不新增长跑门禁。
- 不改 `directoryProgress`（目录对比进度条）与 `cancelDirectoryCompare`、快照导出 / 导入、合并结果保存、同步预览 / 模板。
- 不加导出历史、自动重试、导出后自动打开文件、复制路径 / 在访达中显示等附加能力。
- 不在本项跑真实 358k 对照对、`file://` 浏览器打开或原生保存面板点选（product-qa 承接）。
- 不 bump 版本，不改 README / CHANGELOG / release notes。

## 实现约束

- 单一管线：异步包装只组装 `DirectoryReportInput` 并调用 `buildDirectoryReportAsync`，不得复制任何上限 / 截断 / 转义逻辑；`generatedAt` 必须可显式传入以便与同步路径逐字符比对。
- 导出任务状态与 `directoryBusy` 分离：`AbortController`、进行中标记、节流进度放在导出任务自己的 state / ref；取消按钮只在无任务或任务已收口时不可点，永不因 `busy` 禁用。
- 进度提交节流：同一窗口内合并为一次（≥50 ms 或每块一次，取较大间隔），首次回调立即提交，生成结束强制提交最终值；不得每行触发一次 React 更新，`onProgress` 只携带标量。
- `saveFile` 只在生成 resolve 后调用一次；`null` 静默；reject 走既有 `detailNotice(errorText(cause))`；`OperationCancelledError`（`name === 'OperationCancelledError'`）不得渲染为 danger 错误。
- 导出按钮保持既有可访问标签与 title（`directory.report.toolbar.export` / `exportTitle`），导出中只增加 `disabled`；进度与取消是独立行内元素（`role="status"` + 既有 `ToolbarButton`），只引用既有 token，不写死颜色 / 尺寸。
- 新增文案键限定在 `directory.report.*`：进度（含 `{done}` / `{total}`）、取消、取消标题、已取消 / 导出中；zh 与 en 同步补齐，en 不出现中文。
- 测试沿用既有设施：`renderWithI18n`、`createMappedPort`、`createRealDirectoryFixture`、`createWebPlatformPort`；`saveFile` 桩注入 resolve / `null` / reject；「无残留」用目录条目集合比较或 `platform.exists` 断言；截断提示用 stub 的生成结果驱动，生产代码不新增测试专用分支。
- 26k fixture 集成用例沿用既有显式 per-test `timeout`，不改 `vitest.config.mts` 全局配置；不做墙钟 / 堆峰值断言。
- 本仓库已有 `AGENTS.md` 与 `.agents/skills/` 路由，**跳过**建仓与基建，不动 `AGENTS.md`、不创建工程。
