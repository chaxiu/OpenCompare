# 显式勾选、落盘与逐条复核

## 范围

本子项是 WorkSet「P1 ⑥ 模板归位接真实用户目录 · 端到端闭环（第一期）」的落盘与失败切片（checkpoint `apply-bytes-mtime-verified` / `failure-safe-localized`）。纯核已在 `wi_ws_0531c2c2f789c1a8` 冻结，真实入口 + Dry-run 已在 `wi_ws_dcf61d0392d48f0e` 交付；本项**只做接线、交互与真实磁盘证据**，不重做计划 / 执行 / 复核算法。

**基线现状（已核实）**

- `TemplateDialog`（`src/renderer/src/views/TemplateDialog.tsx`）已是 `setup` → `dry-run` 两步；matched 行可勾选，conflict 行只读，`candidates` 只拼成一段 `join(' · ')` 文本；组件内已调 `resolveTemplatePlan(preview.plan, { checkedPaths })`，可执行数 / 拒绝数 / Apply 禁用读同一结果。
- 纯核 `src/core/directory/template.ts` 已具备：`resolveTemplatePlan(plan, { checkedPaths, conflictChoices })` 解析冲突候选、`executeTemplatePlan`（`signal` / 逐条失败 / 源漂移跳过 / `writeTextFile(…, modifiedMs)`）、`verifyTemplateExtraction`（存在性 + 重算 sha256 + 秒口径 mtime）、`TemplateRejectionReason`（`not-executable` / `conflict-unresolved` / `conflict-candidate-outside-set` / `target-occupied-by-directory` / `duplicate-source`）。
- `PlatformPort.checkWritable(path)` 已存在，语义是「只问 OS、不创建任何文件」（`access(W_OK)`），同步预检已在用；Electron `writeTextFile` 仍是同目录临时文件 + rename 的原子写。
- 现状缺口：① conflict 行没有候选选择控件；② 确认后直接 `executeTemplatePlan`，**不调** `verifyTemplateExtraction`，没有逐条复核清单，且对话框立即关闭；③ Apply 后无法在同一会话重新扫描输出根；④ 输出根只读时没有「写入前拒绝」预检，逐条失败只有裸 `write-failed`，无本地化原因、无重试入口；⑤ `resolved.rejected` 的原因（目录占用 / 重复源）在界面上完全不可见。

**本项要达成的增量**

1. **冲突候选选择**：conflict 行内提供候选源选择控件；选择候选本身不勾选，必须先选候选再显式勾选该行才可执行；换候选同步更新该行的源路径 / 源 sha256 / 源 mtime，清空候选同时取消勾选。`checkedPaths` + `conflictChoices` 交给同一个 `resolveTemplatePlan`。
2. **同源计数与拒绝可见**：可执行数、拒绝数、Apply 禁用、写入集合全部来自这一份 resolved plan；被拒行在行内显示本地化原因。
3. **执行 → 逐条复核**：确认后在对话框内先执行、再对 `execution.written` 逐条复核（存在性 + 重算 sha256 + `mtimeSec`），进入第三态「结果」步骤展示写入 / 失败 / 复核通过计数与逐条 `ok` / 原因。结果步骤取代旧的「关闭对话框 + 成功通知」口径。
4. **同会话重新扫描输出根**：结果步骤提供「重新扫描输出根」，用同一 A / B / 输出根重建计划（零写入）并回到 Dry-run，已写入槽位变成 `overwrite === true` 且默认不勾。
5. **失败安全 + 本地化**：Apply 前用非写入的 `checkWritable` 预检输出根（不存在时对最近存在祖先），只读 / 无权限在第一次写之前拒绝——零写入、零新建目录、无 `*.tmp`；对话框内按稳定 OS 码本地化提示（en 不出现中文）；「重试」复用同一 resolved plan，恢复权限后重试成功且复核通过。确认前取消零写入、会话存活；目标被目录占用的行即使勾选也不写。
6. **真实外部目录证据**：新增真实磁盘临时目录用例（Node `fs` + 生产 `registerPlatformIpc` handler 绑定的 `PlatformPort`，仿 `src/sync-real-gate.test.ts`），覆盖 dry-run → 勾选（含冲突候选）→ apply → 逐条 sha256 / `mtimeSec` → 只读拒绝 → 恢复权限重试。

## Acceptance Criteria

- ac-conflict-candidate-required: 在真实外部树上，conflict 行初始无候选选择且未勾选；只选择候选时不产生勾选、`executableCount` 不变；先选候选再勾选后该行出现在 `resolveTemplatePlan(plan, { checkedPaths, conflictChoices })` 的 `executable` 中，其 `sourcePath` / `sourceHash` / `modifiedMs` 等于所选候选，可执行数 +1。
- ac-conflict-candidate-switch: 已勾选的冲突行更换候选后，同一 resolved plan 中该行 `sourcePath` / `sourceHash` 随所选候选变化而可执行数不变；清空候选后该行不再可执行并计入拒绝数（理由 `conflict-unresolved`），复选框回到未勾选。
- ac-single-source-counts: 界面显示的可执行数、拒绝数与 Apply 禁用状态恒等于 `resolveTemplatePlan(preview.plan, { checkedPaths, conflictChoices })` 的 `executableCount` / `rejectedCount`（勾选、取消勾选、换候选后均成立）；确认后实际 `writeTextFile` 的 targetPath 集合恰等于该结果 `executable` 的 targetPath 集合，未勾选行与未选候选的冲突行零写入调用。
- ac-rejected-row-copy: `resolved.rejected` 中每一行都在界面上渲染其本地化拒绝原因（键与理由一一对应）；目标被输出根既有目录占用的行即使被勾选也不进可执行清单，对该 targetPath 的 `writeTextFile` / `ensureDirectory` 调用数为 0。
- ac-apply-then-verify: 确认后对话框不关闭，进入结果步骤；对 `execution.written` 逐条复核，结果条目数等于 `writtenCount`；成功路径 `verified === writtenCount && failed === 0`，且每条目标磁盘内容重算 sha256 等于源 sha256、目标 `mtimeSec` 等于 `Math.floor(源 modifiedMs / 1000)`（逐条读盘断言）。
- ac-verify-binding: `verifyTemplatePlan(platform, written)` 对写入后被篡改 / 删除 / mtime 偏移的条目分别给出 `hash` / `missing` / `mtime` 原因，并保持 `verified + failed === entries.length`。
- ac-verify-row-copy: 结果步骤按复核条目逐条渲染（行数与 `verification.entries.length` 相同）；`ok === false` 的行显示对应本地化原因，整块不出现「全部成功」口径；en 渲染无 `\p{Script=Han}`。
- ac-rescan-output-root: 结果步骤点「重新扫描输出根」后，以同一 `templateRoot` / `incomingRoot` / `outputRoot` 重建计划：期间 `writeTextFile` / `ensureDirectory` 调用增量为 0，界面回到 Dry-run 步骤，已写入槽位 `overwrite === true` 且默认未勾选，会话标签数不变。
- ac-cancel-zero-write: Dry-run 步骤点取消：`writeTextFile` / `ensureDirectory` 调用增量为 0、无成功通知、对话框关闭；会话标签数与进入前一致，再次点「模板归位」可正常进入选根步骤。
- ac-readonly-refusal-localized: 真实磁盘上把输出根 `chmod 0o555` 后确认：拒绝发生在第一次写入之前——`writeTextFile` 调用数为 0，输出根下无新文件 / 新目录 / `*.tmp`；对话框内显示本地化失败原因，原始 OS 码（`EACCES` / `EPERM` / `EROFS`）原样出现；en 渲染不匹配 `\p{Script=Han}`。
- ac-retry-after-permission-restored: 上一条失败后恢复 `0o755` 并点「重试」：以同一 resolved plan 重跑，全部勾选行写入，复核 `verified === executableCount && failed === 0`，目标 sha256 与 `mtimeSec` 与源逐条一致，输出根下无 `*.tmp` 残留，会话与对话框保持可用。
- ac-no-partial-artifacts: 任意失败路径（只读拒绝、目录占用、逐条写失败）之后，输出根下不存在 `*.tmp` 文件；失败行对应的 targetPath 要么不存在，要么内容与源完全一致（不存在半写 / 截断文件）。
- ac-result-list-windowed: 写入 1,000 条时的结果步骤清单同样窗口化：同时存在于 DOM 的复核行数显著小于总数，滚动到末尾可读到第 1,000 条的复核结果，条目总数不截断。
- ac-i18n-parity: 新增的候选选择 / 复核 / 重试 / 重新扫描 / 失败原因文案在 `zh` 与 `en` 成对存在（键集合与 `{placeholder}` 一致）；en 下模板归位三步整屏渲染文本不匹配 `\p{Script=Han}`；OS 码与路径保持原样。
- ac-real-disk-evidence: 新增真实磁盘用例（Node `mkdtemp` 临时目录 + 生产 `registerPlatformIpc` handler 绑定的 `PlatformPort`，不用 web 内存盘、不用内置样本）在 ≥3 层嵌套且含中文与空格路径上完成 dry-run → 显式勾选（含一条冲突候选）→ apply → 逐条 sha256 / `mtimeSec` 复核 → 只读拒绝 → 恢复权限重试成功；用例在 `pnpm test` 内可执行。
- ac-no-regression: 目录对比四态、同步 Dry-run / 镜像、快照、报告导出既有用例保持绿；`pnpm lint` / `pnpm typecheck` / `pnpm test` 与 `.munk/code-gates.json` 全部 gate 通过；`matchTemplate` / `createTemplatePlan` / `resolveTemplatePlan` / `executeTemplatePlan` / `verifyTemplateExtraction` 既有契约与 `template.test.ts` 口径不改（仅允许为携带 OS 码做增量补字段）。

## 非目标

- 不做执行**中途**的 UI 级取消 / 中断按钮：本项的「取消」指确认前取消（零写入）；纯核的 `AbortSignal` 契约保留但不接 UI。
- 不做失败后的回滚或撤销已写条目；失败只保证未勾选项零写入、当前条目无半成品。
- 不做「把输出根作为右侧建立新对比」的可选增强，也不自动刷新右侧比较树。
- 不做路径占位符模板、正则 / 脚本模板引擎、双向同步、冲突合并、实时监听、计划任务、远端 / SFTP。
- 不改 `.munk/code-gates.json` 门禁条目：真实磁盘用例由既有 `test` gate 覆盖，专项门禁注册留给收口子项；不为凑绿放宽既有门禁或断言口径。
- 不改样本数据、设置「示例 / 调试」分区、快照格式、HTML 报告 / 导出、目录对比四态、发布通道 / 版本号 / tag / Release。
- 不新增 npm 依赖、不新增 `PlatformPort` 方法、不在 `PlatformPort` 之外新造第二套磁盘抽象。
- 不改 matcher 的「文件名 + 文本 sha256」匹配口径，不引入二进制模板支持。

## 实现约束

- 三步仍在同一个 `TemplateDialog` 内：`setup` / `dry-run` / `result`；复用既有 `Dialog` / `ToolbarButton` / `StateView` 与 token，不新建第二套对话框体系。`onConfirm` 改为返回 `Promise<TemplateApplyOutcome>`（含 `execution` 与 `verification`），Workbench 只做 IO 绑定与状态持有，不再解析第二份选择、不另算计数。
- 冲突候选控件放在 conflict 行内（`<select>` 或等价单选）；未选候选时该行复选框不可用；选择候选**不**自动勾选，清空候选同时取消勾选。
- `applyTemplatePlan` 增加非写入预检：输出根已存在则 `checkWritable(outputRoot)`，不存在则对最近存在祖先执行；预检失败必须在任何 `ensureDirectory` / `writeTextFile` 之前抛出，并携带原始 OS 码，禁止「先建目录再失败」。
- 新增 `verifyTemplatePlan(platform, written)`（`directoryOps.ts`）绑定 `verifyTemplateExtraction`（`readTextFile` + `listDirectory`）；UI 只消费其返回值，不自行比对。
- 失败本地化在 renderer 边界：仿 `src/renderer/src/workbench/syncFailureCopy.ts` 增加模板失败映射，稳定 OS 码复用 `shell.sync.reason.*` 成对键（或新增成对键），禁止把主进程中文 `detail` / IPC 前缀原文直接渲染（可复用 `readableSyncFailure` 的剥离逻辑）。
- 允许在 `TemplateWriteFailure` 上增量补 `code?: string`（从抛出错误的 `.code` 或 `\b(E[A-Z]{2,})\b` 提取），不得改既有 `reason` 语义或让既有用例红。
- 复核口径固定秒（`Math.floor(ms / 1000)`），sha256 一律重算目标内容；复核失败不得改写成成功，也不得用「匹配成功」代替「复核通过」。
- 「重试」复用同一 `TemplateResolvedPlan`（对已成功行幂等重写，内容与 mtime 不变），不重新解析选择、不重新匹配；「重新扫描输出根」才走 `previewTemplate`。
- 窗口化沿用 `createDirectoryScrollMap` + `DIRECTORY_ROW_HEIGHT` + `useVirtualizer` 的单表方案，Dry-run 与结果步骤同样处理；不截断、不丢行、不新增第二条渲染路径或依赖。
- 所有新增可见文案 zh / en 成对；`scanHardcodedChinese` 覆盖 `views` / `workbench`，不得新增硬编码中文；OS 码与路径原样保留。
- 既有钉住旧「确认后关闭对话框 + notice」的用例必须改为三步流程：`src/renderer/src/App.test.tsx`（模板 apply / 写失败 / 快照拒绝）、`src/renderer/src/views/TemplateDialog.test.tsx`、`src/renderer/src/views/directoryI18n.test.tsx`（`makeTemplatePreview` 与四段断言）；不得保留「apply 后对话框为 null」作为断言。
- 真实磁盘用例写入 `src/template-real-gate.test.ts`，仿 `src/sync-real-gate.test.ts`：`vi.mock('electron')` 收集 handler、`chmod` 在 `finally` 中恢复、写调用计数包装；不得 mock 掉被验证的读写路径，也不得用 `/samples` / 内置 fixture 冒充真实外部目录。
- 断言落在既有 vitest 文件或相邻新测试文件内，能被 `pnpm test` 覆盖；不新增 gate id、不改 `.munk/code-gates.json`。
