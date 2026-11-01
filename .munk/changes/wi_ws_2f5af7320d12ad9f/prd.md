# 样本入口归位设置 + 同步失败本地化

## Scope

本子项是 WorkSet「P1 ⑥ 模板归位接真实用户目录」的入口归位 + 失败提示切片：把内置样本从首屏与工作流工具栏彻底收回到设置「示例与调试」分区，并把目录同步失败按当前界面语言就地提示。真实 B / 输出根入口、Dry-run 显式勾选属于后续子项，本项不做。

**基线现状（已核实，避免重复实现）**

- 壳层顶栏只剩 `new-compare` / `open-file` / `open-folder` / `settings`，`[data-shell-entry="samples"]`、`samples-menu` 已不存在；`App.test.tsx`、`shellLayout.dom.test.tsx` 已钉住「顶栏无样本入口」。
- 设置「示例与调试」分区已存在（`SettingsDialog.tsx`）：四个场景入口 + 远端快照入口（`data-sample-entry`），调试开关下另有失败演示（`data-sample-failure`），点击后关面板并激活会话。
- 仍残留的样本入口/样本路径：
  - `shell.error.sampleRead`（zh/en）在首屏错误态直接写出 `/samples/csv/orders.left.csv`；
  - `directory.toolbar.templateTitle`（zh/en）在目录视图工具栏 tooltip 里直接写出内置散乱树 `/samples/directory/incoming`；
  - 两个文案都被现有测试按原样钉住（`App.i18n.test.tsx`、`directoryI18n.test.tsx`），需随新口径一起改写断言。
- 同步失败本地化尚缺：系统拒绝（EACCES / EPERM / EROFS / EBUSY / ENOSPC…）由主进程抛中文句、`src/core/directory/sync.ts` 再包成中文 `SyncTargetError`，Renderer 的 `handleConfirmSync` / `handlePreviewSync` 用 `errorText(cause)` 直出 → en 界面出现中文文件系统句；写入后刷新失败（`SyncRefreshError.reason`）同样透传中文。

**本项要达成的增量**

1. 首屏与工作流工具栏的样本路径清零：改写上述两条文案（保留「样本库读失败 + 重试」与「模板归位」的行为语义，只去掉样本路径与内置树点名）；并补断言钉住「工具栏样本入口数 = 0」「首屏无样本路径」。
2. 设置「示例与调试」作为唯一样本入口继续可加载四个场景样本、远端快照演示与失败演示（调试开关口径不变），并以断言固定。
3. 同步失败本地化：在 Renderer 边界把同步写入拒绝（预检 + 执行）与写入后刷新失败的失败原因按 `SyncTargetError.code` / 稳定系统码映射到 `zh` / `en` 成对词典，提示保留目标路径与 OS code，en 界面不出现汉字。
4. 不改 `src/core/directory/sync.ts` 的错误 message 口径、同步写入/回滚语义、样本数据、快照格式与目录对比四态。

## Acceptance Criteria

- ac-toolbar-sample-entries-zero: 空工作台与目录对比会话下，`[data-sample-entry]`、`[data-shell-entry="samples"]`、`[data-shell-entry="samples-menu"]` 的 DOM 命中数均为 0；样本入口只出现在设置面板。
- ac-first-screen-no-sample-path: 空工作台首屏与样本读取失败态在 zh / en 下的可见文本（含按钮 title）都不含 `/samples` 片段。
- ac-workflow-toolbar-no-sample-path: 目录视图工具栏所有按钮的可见文案与 title 都不含 `/samples`；模板按钮 tooltip 不再点名内置散乱树或样本路径。
- ac-settings-samples-load: 设置「示例与调试」在 zh / en 下列出 5 个用户入口（directory / code / csv / structured / remote-snapshot），点击任一入口关闭设置面板并激活对应会话；调试开关开启时失败演示入口存在，点击后显示本地化样本读取失败态与重试按钮。
- ac-sync-write-failure-localized: 同步因 EACCES / EPERM / EROFS / EBUSY / ENOSPC 失败时，zh 提示渲染对应中文原因、en 提示渲染对应英文原因，两者都含出错目标路径与该 OS code，且都不含 `Error invoking remote method` 包装串。
- ac-en-sync-failure-no-han: en 下上述五类同步写入拒绝以及「写入已完成但刷新对比失败」两条失败提示的渲染文本都不匹配 `\p{Script=Han}`（i18n 断言）。
- ac-sync-failure-code-fallback: 失败原因不带可识别系统码时，zh / en 都渲染中性本地化兜底句（仍含目标路径），不得回退成主进程中文 detail 原文或空串。
- ac-i18n-key-parity: `zh` 与 `en` 词典键集合一致，新增的同步失败原因键 / 兜底键成对出现（沿用既有词典一致性断言）。
- ac-sync-failure-semantics-unchanged: 同步失败后未勾选项零写入、预览保持开启可重试，既有 `sync-real-gate` 与 `pnpm test` 全绿（不改写入/回滚语义）。

## Non-Goals

- 不做真实散乱树 B / 输出根的选择器、拖拽、键入路径与真实 Dry-run 显式勾选（后续子项 `real-template-entry` / `real-dry-run-plan`）。
- 不做路径占位符模板、正则 / 脚本模板引擎、双向同步、文件监听、计划任务、远端 / SFTP。
- 不改 `src/shared/fixtures/` 样本数据与路径、快照 `.ocsnap.json` 格式、目录对比四态、HTML 报告 / 导出格式。
- 不改 `SyncTargetError` / `SyncRefreshError` / `SyncVerificationError` 的既有中文 message 口径与错误类字段语义（`sync-real-gate` 依赖）。
- 不改 web 版 picker 缺失的引导走向（仍引导到「设置 → 示例与调试」），不新建第二套样本入口。
- 不动发布通道、版本号、tag / Release；不新增 npm 依赖。

## Implementation Constraints

- 本地化发生在 Renderer 边界：由系统码 → 词典键的纯映射函数 + `zh` / `en` 成对词条组成；renderer 侧代码不得出现硬编码中文（`src/shared/i18n/scanHardcodedChinese` 扫描 `workbench` / `views` 已生效）。
- 只使用 `SyncTargetError.path` / `.code` 与 `SyncRefreshError.reason` 中可提取的稳定系统码；不得把主进程中文 detail、IPC 包装串或未经映射的原始 message 直接渲染给用户。
- 复用既有 `SettingsDialog` 的「示例与调试」分区及 `data-sample-entry` / `data-sample-failure` 断言锚点，不新增入口组件。
- `App.i18n.test.tsx` 中钉住 `Could not read the built-in sample library: /samples/csv/orders.left.csv is missing.` 与 `directoryI18n.test.tsx` 中模板 tooltip 的旧断言需按新口径改写为「无样本路径」断言，不得为了保留旧断言而保留样本路径文案。
- 新增断言必须能在既有门禁命令内执行（`pnpm test` 覆盖全部 vitest；必要时补在既有 `*.test.ts(x)` 文件里，不新增 gate id，不改 `install/build` 口径）。
- 失败提示的中文留在 `zh` 词典、英文留在 `en` 词典；OS code 本身（如 `EACCES`）在两个词典中原样保留，不做翻译。
