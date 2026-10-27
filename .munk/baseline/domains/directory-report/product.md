# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为**自包含、可离线、不含本机绝对路径、带双上限**的单文件 HTML 报告，并在目录视图里提供**常驻导出入口 + 隐私开关 + 保存对话框接线**。本域承载两层：

- **纯函数内核**（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron / React / DOM）：文档结构、转义、隐私相对化、双上限、共享版本源，以及**同步/异步两个入口共用的单次流式分块管线**（`buildDirectoryReport` / `buildDirectoryReportAsync`，可取消、块间让出宏任务、进度只上报标量）。
- **renderer 接线**（`src/renderer/src/workbench/directoryReport.ts`、`DirectoryView`、`Workbench`、`zh/en directory.ts`）：工具栏按钮与「隐藏本机路径」复选框、异步包装 + 进度节流器、**独立可取消的导出任务**（行内进度区 + 取消入口）、文件名规范化、`PlatformPort.saveFile` 成功/取消/截断/不可写提示，全部只消费内核、不改内核语义。

## 范围

### 报告内核（纯函数）

- **报告构建器（`src/core/directory/report.ts`，纯函数）**：`buildDirectoryReport(input)` 消费注入的行源、总行数、左右根路径、四态计数、`generatedAt`、`appVersion`、`htmlLang`、`hideLocalPaths` 与可选上限，产出 `{ html, bytes, totalRows, shownRows, truncatedRows, truncated }`。核心不读时钟、不读 `navigator.language`、不含语言分支、不含硬编码文案或版本号。
- **异步入口（同一管线的分块驱动）**：`buildDirectoryReportAsync(input, options?)` 返回同一 `DirectoryReport`，`options` 只允许 `{ signal?: AbortSignal; onProgress?: (progress: DirectoryReportProgress) => void }`，进度体只含标量 `{ processedRows, totalRows }`（不带行对象 / HTML / 路径）。两个入口的转义、隐私相对化、空态、行数/字节上限、截断回撤与文档闭合按构造只有一份实现（内部 `ReportPass` 文档块生成器），同步入口同步抽干、异步入口逐块抽取；块大小以导出常量 `DIRECTORY_REPORT_CHUNK_ROWS = 4_000` 为准，不对外暴露覆盖参数。
- **分块让出与取消**：异步入口每块渲染后最多回调一次进度，块间 `await` 宏任务（`setTimeout(…, 0)`）让事件循环可跑其它宏任务，并在每块前后用 `@core/io` 的 `throwIfAborted` 检查取消；取消时抛既有 `OperationCancelledError`（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`）、释放已生成片段、不返回任何报告对象，且不留模块级残留状态（同一进程内新源可立即再次生成）。取消语义只复用 `@core/io`，不新造取消类型、不返回结构化取消结果。
- **单次流式消费**：只创建 1 个行迭代器，边取行边渲染成行 HTML、边累计 UTF-8 字节；常驻内存只保留「产物所需的行 HTML 片段 + 前缀 + 后缀」，行 `DirectoryReportRow` 对象只在当前块内短暂存活（禁止保留行对象数组、禁止全量 `join()` 后再复制整份文档）。结果对象键恰为 `['html','bytes','totalRows','shownRows','truncatedRows','truncated']`，不携带任何行对象/行集合。
- **导出常量**：`DIRECTORY_REPORT_MAX_ROWS = 200_000`、`DIRECTORY_REPORT_MAX_BYTES = 10_000_000`、`DIRECTORY_REPORT_CHUNK_ROWS = 4_000`，前两者镜像进文档 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">` 与头部可见「上限」行；上限不可配置、不通过改小常量来「验证」边界。
- **行源投影（`directoryReportSource(comparison)`）**：把既有 `DirectoryComparison` 投影为惰性 `DirectoryReportSource`——`rows` 是前序遍历生成器，只引用既有节点、不复制树；`totalRows` 以 getter 按需计数，浅消费不预遍历整棵树。
- **自包含文档结构**：`<!DOCTYPE html>` + `<html lang="{注入值}">` + `<meta charset="utf-8">` + 单个内联 `<style>` + 头部（标题、固定隐私提示、生成时间、应用版本、左右根、可见上限行、四态计数 + 口径说明）+ 树表（表头 + 每行状态色块、层级缩进、根相对路径、左右大小、状态文本）+ 截断提示 + 空态文案 + 闭合标签。
- **转义与注入防护**：动态文本先转义 `&` `<` `>` `"` `'`（`&` 优先），随后把 `://` 中和为 `:&#47;&#47;`；动态文本只落元素文本节点，绝不进入属性，源码中不出现承载用户路径的 `title=` / `data-*=...`，也不出现由文件名/路径产生的任何标签。
- **隐私**：`hideLocalPaths` 默认把左右根相对化到公共祖先；公共祖先为 `/` / `/Users` / `/home` / `C:\Users` / 盘符根时退化为两侧根目录名；无有意义公共祖先时只显示两侧根目录名。关闭开关时左右根按原样（含绝对路径）出现在头部，树行仍是根相对路径。固定隐私提示（`strings.privacyNotice`）在两种状态下都恰好出现一次，位于头部且在树表之前。
- **计数与元信息同源**：四态计数与计数口径说明直接透传注入值（不遍历树重算）；`generatedAt` / `appVersion` / `htmlLang` 全部由调用方注入并原样进入报告；同输入两次调用输出逐字一致。
- **行数与字节双上限**：先按行数上限惰性消费行源；整篇文档超字节上限时回撤到「连截断提示都能完整闭合」的最后一行（按行字节前缀二分），`bytes` 对**最终** HTML 用 `TextEncoder` 计算，返回前不缓存旧值；截断元信息满足 `shownRows + truncatedRows === totalRows`。
- **容错与防御**：空树（0 行）产出合法报告并渲染 `strings.empty`，不出表；`totalRows` 与行源实际产出不一致时以较小者为准（不抛错）。
- **应用版本单点（`src/shared/appVersion.ts`）**：`APP_VERSION` 静态读取根 `package.json` 的 `version`（`resolveJsonModule`），不新增依赖、不复制版本字符串；报告只展示注入值，核心内无硬编码版本号。

### renderer 接线

- **工具栏入口（`DirectoryView` 第三行工具栏）**：常驻「导出 HTML 报告」按钮（`ToolbarButton` + `FileDown` 图标），仅在 `busy` 或导出进行中（`reportExporting`）时禁用，与是否选了真实目录、是否 Web 运行时无关；同排「隐藏本机路径」复选框（默认勾选、复用现有表单样式）。新增 props `hideLocalPaths` / `onHideLocalPathsChange` / `onExportReport`；按钮点击只调用 `onExportReport`，视图不自行生报告、不碰平台层。
- **renderer 边界模块（`src/renderer/src/workbench/directoryReport.ts`）**：集中提供 `directoryReportFileName`（`<左名>-vs-<右名>.html`，非法字符替换、去尾空格、空名回退 `directory`、不含绝对路径）、`directoryReportFilter`（html/htm，名称来自词典）、`directoryReportStrings(t)`（全部 `DirectoryReportStrings` 键经 `t` 解析，四态状态名复用 `DIFF_LABEL_KEYS`）、`buildDirectoryReportForComparison(comparison, t, language, hideLocalPaths, generatedAt?)`（`directoryReportSource` 投影 + `htmlLang(language)` + `APP_VERSION`，只调一次 `buildDirectoryReport`）与 `directoryReportSaveCopy`（成功/截断两套提示 key 与参数）。
- **Workbench 持有隐私开关**：`hideLocalPaths`（默认 `true`）是 shell 级 state，不进 per-session state，切换目录会话或视图重挂载后保持。
- **异步包装与节流器（`directoryReport.ts`）**：`buildDirectoryReportForComparisonAsync(comparison, t, language, hideLocalPaths, options, generatedAt?)` 构造**同一个** `DirectoryReportInput`（`directoryReportSource` + `directoryReportStrings` + `htmlLang` + `APP_VERSION` + `hideLocalPaths`）并只调一次 `buildDirectoryReportAsync`，原样透传 `signal` / `onProgress`；同步 helper `buildDirectoryReportForComparison` 保留不动，两入口同输入 `html` 逐字符相等。同模块导出可单测的前沿+尾随节流器 `createReportProgressThrottle(emit, intervalMs = REPORT_PROGRESS_THROTTLE_MS /* 50 */)`：首次回调立即提交、窗口内只保留最新值并到期补发、`finish(progress)` 强制提交最终值、`clear()` 丢弃未提交样本。
- **Workbench 独立导出任务**：`handleExportReport` 自带 `reportExporting` / `reportProgress` state + `reportExportController` ref（同时充当重入闸：ref 非空即直接返回），**不复用 `directoryBusy`**；先算 `directoryReportSource(comparison).totalRows` 作为起始进度，再 `await` 异步包装（`signal` + 节流 `onProgress`），resolve 后 `throttle.finish(latest)`、清掉进度区，然后**只调一次** `platform.saveFile(...)`；`null` 取消静默、成功走 `report(..., 'info')`（截断带 N / M）、其它 reject 走既有 `detailNotice(errorText(cause))`，`OperationCancelledError` 只报普通 info「已取消导出」；`finally` 里 `throttle.clear()`、复位 ref / 进度 / 进行中标记。`cancelReportExport` 只 `abort()` 当前控制器。
- **视图进度与取消入口（`DirectoryView` 第三行工具栏）**：新增可选 props `reportExporting` / `reportProgress` / `onCancelReportExport`；`reportProgress` 非空时渲染行内 `role="status"` 区（`directory.report.progress` 带 `{done}` / `{total}`，`tabular`）与「取消」`ToolbarButton`（永远不受 `busy` 禁用）；导出按钮 `disabled = busy || reportExporting`，可访问名与 title 不变；不传新 props 时渲染与旧版一致。
- **i18n**：`zh/en directory.ts` 成对新增 `directory.report.progress` / `cancel` / `cancelTitle` / `cancelled`（仅这 4 个键），en 无中文、parity 测试通过。
- **i18n**：`zh/en directory.ts` 成对新增 `directory.report.*` 分组（工具栏文案与 title、开关文案与 title、保存框标题、文件过滤器名、成功/截断提示，以及报告内标题、固定隐私提示、生成时间/版本/左右根/上限行标签、口径说明、四态列名与状态名、截断文案与提示、空表文案）；`directoryI18n.test.tsx` 英文工具栏清单同步，既有中文硬编码扫描保持通过。

## 验收

### 内核：转义与注入

- **ac-escape-text-roundtrip**：对 `name` / `relativePath` / `leftRoot` / `rightRoot` / `generatedAt` / `appVersion` 注入 `&`、`<`、`>`、`"`、`'`、`<script>alert(1)</script>`、换行、emoji、中文、≥300 字符超长名后，用 HTML 解析器读取对应单元格文本与原始字符串逐字一致（换行保留为字符，不转成 `<br>`）。
- **ac-escape-no-executable**：上述注入用例的最终 HTML 字符串中 `<script` 命中数为 0（大小写不敏感），且不存在由文件名/路径产生的任何标签；动态文本只出现在元素文本节点，不进入任何属性（源码中不出现承载用户路径的 `title=` / `data-*=...`）。
- **ac-colon-slash-neutralized**：任一动态文本含 `http://` 或 `https://` 时，源码中该处写作 `:&#47;&#47;`、`http(s)://` 字面量命中为 0，解析器还原后的文本仍为原始 `://`。

### 内核：自包含可离线

- **ac-self-contained-zero-hits**：最终 HTML 中 `<script`、`<link`、`<img`、`<iframe`、`<object`、`<embed`、`@import`、`url(`、`@font-face`、`src=`、`href=`、`fetch(`、`http://`、`https://` 命中均为 0（大小写不敏感）；`<style` 恰好 1 个且为内联，无 `<style src`；文档以 `<!DOCTYPE html>` 开头并含 `<meta charset="utf-8">`，可被解析器解析为合法文档。
- **ac-lang-injected**：`<html lang>` 等于注入的 `htmlLang`（传 `zh-CN` / `en` 分别断言），核心不做语言判断、不含语言分支。

### 内核：隐私

- **ac-privacy-default-relative**：`hideLocalPaths` 默认路径下，`/Users/alice/work/left` vs `/Users/alice/work/right` 渲染为 `left` / `right`；公共祖先为 `/`、`/Users`、`/home`、`C:\Users`、盘符根时退化为两侧根目录名；无有意义公共祖先时只显示两侧根目录名。
- **ac-privacy-no-absolute-default**：默认产物中 `/Users/`、`/home/`、注入的绝对根字符串命中均为 0；目录树行只出现根相对路径与名字，绝不拼接绝对根。
- **ac-privacy-toggle-absolute**：`hideLocalPaths: false` 时左右根按原样（含绝对路径）出现在报告头部，且树行仍是根相对路径。
- **ac-privacy-notice-always**：固定隐私提示文案（由 `strings.privacyNotice` 注入）在开关两种状态下都恰好出现一次，位于头部且在树表之前。

### 内核：同源计数与版本

- **ac-counts-passthrough**：报告展示的四态数字与注入 `source.counts` 完全一致；用例故意让 `counts` 与行状态分布不同，报告仍显示注入值（证明导出不遍历树重算）。
- **ac-scope-note**：报告出现注入的计数口径说明（全部条目 / 不受过滤影响）一次。
- **ac-app-version-source**：`src/shared/appVersion.ts` 导出的 `APP_VERSION` 为 semver 且严格等于根 `package.json` 的 `version`；报告中的版本文本与注入的 `appVersion` 一致，核心内不存在硬编码版本号。
- **ac-generated-at-injected**：`generatedAt` 由调用方注入并原样进入报告；核心不读 `Date.now()`（同输入两次调用输出一致）。

### 内核：上限、截断与字节

- **ac-limits-constants**：导出常量值精确为 `200_000` 与 `10_000_000`；报告同时包含可见「上限」行与 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">`。
- **ac-max-rows-not-truncated**：行源恰好 200000 行时 `truncated === false`、`shownRows === 200000`、`truncatedRows === 0`、`totalRows === 200000`，且无截断文案。
- **ac-one-over-truncated**：200001 行时 `truncated === true`、`shownRows === 200000`、`truncatedRows === 1`，`shownRows + truncatedRows === totalRows`；报告含「已展示 200000 / 原始 200001（已截断）」数字与「截断处子树不全」说明行。
- **ac-ten-times-lazy**：2000000 行用例以生成器行源提供（不物化 200 万元素数组），断言 `shownRows === 200000`、`truncated === true`、`shownRows + truncatedRows === 2000000`、行源实际产出次数 ≤ 200001、用例在默认超时内完成。
- **ac-bytes-limit-first**：构造超长路径/高字节行使字节上限先于行数上限触发：`shownRows < 200000`、`truncated === true`、`bytes <= 10_000_000`，且文档仍完整闭合可解析。
- **ac-bytes-measured**：两类上限用例中返回值 `bytes` 均严格等于 `new TextEncoder().encode(result.html).length` 且 `<= 10_000_000`。
- **ac-truncation-wellformed**：截断产物中行数等于 `shownRows`（数据行，不含表头/摘要），文档以 `</table></main></body></html>` 闭合；解析器无未闭合标签，截断处不出现半个标签或半行。
- **ac-empty-and-defensive**：空树（0 行）产出合法报告、`shownRows === 0`、渲染 `strings.empty`；当 `totalRows` 与行源实际产出不一致时以较小者为准（不抛错，`shownRows + truncatedRows` 仍在总数内）。

### 内核：异步入口、进度与取消

- **ac-sync-async-same-document**：同一 `DirectoryReportInput`（含 `hideLocalPaths` true/false、zh/en 文案、空源与非空源）下，`buildDirectoryReport` 与 `buildDirectoryReportAsync`（不传 options）返回的 `html` 逐字符相等，`bytes` / `totalRows` / `shownRows` / `truncatedRows` / `truncated` 逐项相等。
- **ac-progress-scalar-monotonic**：200,000 行源调用异步入口时 `onProgress` 至少回调 2 次；每次回调 `totalRows` 恒等于源 `totalRows`，`processedRows` 单调不减，且精确等于行源已被拉取的行数（无超前读、无漏报）；最后一次回调的 `processedRows` 等于生成结束时的累计拉取行数。
- **ac-progress-bounded-count**：200,000 行源的进度回调次数 ≤ `ceil(已拉取行数 / DIRECTORY_REPORT_CHUNK_ROWS) + 1`，且不随行数线性膨胀（不得每行回调一次）。
- **ac-yield-macrotask**：在启动异步生成**之前**登记一个 `setTimeout(…, 0)`，该定时器回调先于生成 Promise 完成被观察到——即生成未结束时事件循环可执行其它宏任务。
- **ac-abort-between-chunks**：在 `onProgress` 第 1 次回调后 `controller.abort()`，`buildDirectoryReportAsync` 以 `OperationCancelledError`（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`）reject；abort 之后行源新增拉取 ≤ `DIRECTORY_REPORT_CHUNK_ROWS` 行、后续不再有进度回调、不返回任何报告对象；随后用新源再次生成可正常返回完整文档（无模块级残留状态）。
- **ac-abort-before-start**：传入已 abort 的 `AbortSignal` 时立即 reject `OperationCancelledError`，行源拉取 0 行。

### 内核：真实常量边界与 30 万级规模

- **ac-row-cap-exact**：用真实常量 `DIRECTORY_REPORT_MAX_ROWS`（200,000）构造恰好 200,000 行、`totalRows = 200_000` 的源，同步与异步入口均：`truncated === false`、`shownRows === 200_000`、`truncatedRows === 0`、`totalRows === 200_000`，HTML 不含截断文案（`（已截断）` / `truncatedHint`），行源拉取行数恰为 200,000，`bytes === new TextEncoder().encode(html).length` 且 `≤ 10_000_000`。
- **ac-row-cap-plus-one**：同样构造 200,001 行源，两入口均：`shownRows === 200_000`、`truncatedRows === 1`、`totalRows === 200_001`、`shownRows + truncatedRows === totalRows`，HTML 含逐字文案 `已展示 200000 / 原始 200001（已截断）` 与 `truncatedHint` 各 1 次，`<tr>` 计数 − 1 === `shownRows`。
- **ac-byte-cap-exact**：用真实常量 `DIRECTORY_REPORT_MAX_BYTES`（10,000,000）构造最终文档**恰好** 10,000,000 UTF-8 字节的输入（调整行路径长度凑满，不改上限常量），两入口均：`truncated === false`、`bytes === 10_000_000`、HTML 无截断文案、文档以 `</table></main></body></html>` 闭合。
- **ac-byte-cap-plus-one**：在上一构造上再增 1 字节（触发截断），两入口均：`truncated === true`、`bytes ≤ 10_000_000`、`shownRows < totalRows`、`shownRows + truncatedRows === totalRows`、文档完整闭合、`<tr>` 计数 − 1 === `shownRows`、截断文案中的 `{shown}` / `{total}` 与返回对象逐字一致。
- **ac-300k-worst-case**：惰性行源（不物化数组）模拟真实最坏情形，`totalRows = 358_156`（根 + 358,155 条目）与 `totalRows = 358_209`（根 + 358,208 条目）两组，行路径为长相对路径、状态全 `modified`；两入口均：`bytes ≤ 10_000_000`、`shownRows ≤ 200_000`、`shownRows + truncatedRows === totalRows`、行源拉取 ≤ 200_000、HTML 含 `已展示 <shownRows> / 原始 358156（已截断）`（另一组为 `358209`）、文档闭合且 `<tr>` 计数自洽；该用例在单测内可完成（允许显式 per-test `timeout`，不改全局 vitest 配置）。

### 内核：单次流式与不复制

- **ac-single-pass-source**：用带计数的 `Iterable<DirectoryReportRow>`（`[Symbol.iterator]` 计数）验证每次生成只创建 1 个迭代器、且结束后不再拉取新行（同步与异步各断言一次）；`Object.keys(result)` 恰为 `['html','bytes','totalRows','shownRows','truncatedRows','truncated']`。
- **ac-source-not-copied**：对深度冻结的 `DirectoryComparison` 树调用 `directoryReportSource` + 两入口生成，不抛错、树对象未被改写；`rows` 仍为惰性可迭代且 `totalRows` 与树行数一致。
- **ac-no-regression**：既有 `src/core/directory/report.test.ts` 与 `src/renderer/src/workbench/directoryReport.test.ts` 全部既有断言原样通过；`DIRECTORY_REPORT_MAX_ROWS === 200_000`、`DIRECTORY_REPORT_MAX_BYTES === 10_000_000` 不变；自包含标记、单 `<style>`、隐私提示恰好 1 次、四态计数直接取自 `source.counts` 等既有断言不回退。

### 内核：行源投影

- **ac-source-preorder**：`directoryReportSource(comparison)` 的前序遍历顺序与树表一致（根为 depth 0，目录按 `children` 原顺序，文件为叶子），行 `relativePath` / `name` / `kind` / `status` / `leftSize` / `rightSize` 与节点一致；`totalRows` 等于节点总数（根 + 目录 + 文件）。
- **ac-source-lazy**：根下挂 200000 个直接子节点（子节点的 `children` 用计数 getter 提供），只消费前 10 行时计数 getter 访问次数 ≤ 10，且第 11 个及之后的节点未被访问（投影按需产出，不预遍历整棵树）。

### 接线：工具栏与开关

- **ac-toolbar-export-persistent**：目录对比视图渲染后，任意过滤状态下都存在可点击的「导出 HTML 报告」按钮；点击一次调用 `onExportReport` 恰好一次；`busy=true` 时按钮 disabled 且点击不触发回调。
- **ac-hide-paths-default**：「隐藏本机路径」复选框默认勾选；点击后以 `false` 调用 `onHideLocalPathsChange`（再点以 `true`），导出按钮不受该开关影响仍可点击。
- **ac-hide-paths-survives-remount**：在 Workbench 中取消勾选后切换到另一个目录会话再切回，复选框仍为未勾选（状态由 Workbench 持有，非视图局部状态）。

### 接线：同源计数、语言、版本与隐私

- **ac-report-counts-match-dom**：用现有真实双目录 fixture（每侧 ≥1 万条目，含嵌套、左右独有、修改、相同）经 UI 触发导出，解析 `saveFile` 收到的 `content`；报告内 same/added/removed/modified 四个数字与界面「全部」过滤下 `CompositionLegend` 的四个 DOM 数字逐一相等；报告为全部条目口径（不受当前过滤影响）。
- **ac-report-lang-follows-ui**：zh 界面导出文档 `<html lang="zh-CN">` 且标题/列名为中文词典文案；en 界面为 `<html lang="en">` 且为英文词典文案；两种语言下均无另一语言硬编码文案（报告内文案全部来自注入字符串）。
- **ac-report-version-shared**：报告内版本字符串等于 `APP_VERSION`，且等于根 `package.json` 的 `version`。
- **ac-default-privacy-no-local-paths**：左右根构造为 `/Users/<name>/...` 且开关默认开启时，导出产物源码中 `/Users` 命中数为 0，且包含固定隐私提示行；同一比较关闭开关后重导出，产物出现原始绝对根路径，隐私提示行仍存在。

### 接线：保存契约

- **ac-save-success-file-contract**：`saveFile` 收到 `content` 为完整自包含 HTML（以 `<!DOCTYPE html>` 开头、`</html>` 结尾，含 `<meta charset="utf-8">`）、`defaultPath` 以 `.html` 结尾且形如 `<左名>-vs-<右名>.html`（名字含 `\ / : * ? " < > |` 时被替换、去尾空格，空名回退 `directory`，不含绝对路径）、`filters` 含 `html` 扩展名；返回路径后展示包含该路径的成功提示。
- **ac-save-cancel-silent**：`saveFile` 返回 `null` 时不再有第二次 `saveFile` 调用，不出现包含路径的成功提示，不产生任何落盘写入副作用，`busy` 复位；按钮可再次点击。
- **ac-save-truncation-notice**：报告被截断时成功提示同时包含已展示行数与原始行数（`N` / `M`），未截断时提示不含截断措辞。

### 接线：导出进度、可取消与三种保存结果

- **ac-export-progress-on-click**：已打开目录对比的 Workbench 中点击「导出 HTML 报告」，在 `saveFile` 被调用之前同步可断言：出现导出进度区（`role="status"`），文本含已处理行数与总数、且总数等于 `directoryReportSource(comparison).totalRows`（树行数）；同一区域存在 enabled 的「取消」按钮；导出按钮 `disabled === true`。
- **ac-progress-throttled**：节流器在 `vi.useFakeTimers()` 下：同一时刻连续 100 次进度回调导致提交次数 ≤ 2，最终提交值为最后一次 `processedRows/totalRows`；首次回调无需等待窗口即可见（进度不空白）；窗口结束后下一次回调提交新值；生成 resolve 时 `finish` 强制提交最终值；`clear()` 丢弃未提交样本。
- **ac-export-ui-interactive**：导出进行中，过滤器 tab 与「隐藏本机路径」checkbox 仍 enabled 且点击后状态生效；被 `directoryBusy` 门控的按钮（载入样本 / 预览同步 / 模板 / 导出快照 / 导入快照 / 远端样本）保持 enabled；导出结束后（成功 / 取消保存 / 失败 / 取消生成）它们仍 enabled，未残留全局 busy。
- **ac-export-not-reentrant**：导出进行中再次点击导出按钮不启动第二个任务（生成调用 1 次、`saveFile` 1 次）；导出按钮可访问名恒为 `directory.report.toolbar.export`（不因导出中改名）。
- **ac-cancel-generation-no-save**：进度出现后点击「取消」→ `saveFile` 调用 0 次；进度区消失；导出按钮恢复 enabled；默认路径 `<left>-vs-<right>.html` 在平台沙箱 `exists === false`；保存目标目录条目集合与导出前完全相同（无 0 字节 / `.tmp` / 半成品）；不出现 danger 的 `role="alert"`（允许一条普通 info「已取消导出」）。
- **ac-cancel-then-export**：取消后立即再次导出且 `saveFile` resolve 路径 → 恰好 1 次 `saveFile`（本次），出现成功提示，报告内容以 `<!DOCTYPE html>` 开头、`</html>` 闭合且四态计数与 legend 一致（无残留控制器或半成品）。
- **ac-save-success-path**：`saveFile` resolve `'/memory/left-vs-right.html'` → 无 danger `role="alert"`；info 提示文本包含完整路径；`saveFile` 参数 `defaultPath` 仍为 `left-vs-right.html`、`filters[0].extensions` 含 `html`、`content` 为完整自包含文档。
- **ac-save-truncated-copy**：生成结果为截断时成功提示文本同时包含 `shownRows` 与 `totalRows` 两个数字（逐字）；未截断时提示不含这两个数字。用 stub 的截断生成结果（如 `shownRows: 120000 / totalRows: 358156`）驱动接线断言。
- **ac-save-cancelled-silent**：`saveFile` resolve `null` → `saveFile` 恰 1 次、无 `role="alert"`（含 info）、平台内目标 / 默认文件名不存在、导出按钮恢复；随后再次导出可成功。
- **ac-save-unwritable**：`saveFile` reject `new Error('无法写入文件 …：只读（EROFS）')` → 出现 danger `role="alert"`，文本含该消息且不含成功文案；目标路径无文件、无临时残留；导出按钮恢复；再次点击触发第二次 `saveFile` 调用（可重试）。
- **ac-async-parity**：同一 `comparison` / `t` / `language` / `hideLocalPaths` / `generatedAt` 下，`buildDirectoryReportForComparisonAsync` 与 `buildDirectoryReportForComparison` 的 `html` 逐字符相等，`bytes` / `totalRows` / `shownRows` / `truncatedRows` / `truncated` 逐项相等（zh、en × hideLocalPaths true、false 各覆盖）。
- **ac-async-signal-progress**：异步包装原样透传 `signal` / `onProgress`：未 abort 时 `onProgress` 收到的 `totalRows` 恒等于树行数、`processedRows` 单调不减且最后一次等于实际消费行数；传入已 abort 的 `AbortSignal` 时以 `name === 'OperationCancelledError'` reject，`saveFile` 0 次。
- **ac-real-fixture-report**：26,000 文件双目录 fixture 经 UI 导出：报告四态与 `CompositionLegend` DOM 逐项相等；`<html lang>` 为 `zh-CN` / `en`；`.meta-app-version` 为 `APP_VERSION`；隐藏本机路径开关两种状态行为不变；默认文件名与滤镜不变（既有集成断言原样保留并通过）。
- **ac-toolbar-regression**：`DirectoryView` 既有「每个 filter 下导出按钮可用且回调一次」「busy 时禁用不回调」「hideLocalPaths 双向」三组用例零回归；未传新增进度 props 时渲染与现状一致（导出按钮 enabled、无进度区）；传 `reportExporting` 时只有导出按钮 disabled、取消按钮仍可点击。

### 接线：i18n 与平台边界

- **ac-i18n-parity**：`zh` 与 `en` 词典新增键一一对应、无缺失；英文界面不出现中文；`directoryI18n.test.tsx` 英文工具栏清单包含新按钮与新开关标题，现有 i18n 扫描测试全部通过。
- **ac-export-i18n-parity**：新增的 4 个 `directory.report.*` 键（`progress` / `cancel` / `cancelTitle` / `cancelled`）在 zh / en 一一对应且非空，`messages.test.ts` parity 通过；en 界面下进度 / 取消 / 已取消文案不含中文字符。
- **ac-no-new-ipc**：导出全程只调用既有 `PlatformPort.saveFile`，不新增 IPC channel 或平台方法；renderer 不直接引用 Electron API。

### 工程门禁

- **ac-core-purity**：`src/core/directory/report.ts` 不 import electron / react / react-dom / DOM 类型，Node 环境直接 import 即可运行（`pnpm lint` 的 `no-restricted-imports` 与 vitest 均通过）。
- **ac-gates-green**：全量 `code_gates`（install / lint / typecheck / build / build-web / test，含既有 cancel-gate / memory-gate）全绿，既有测试零回归。

## 非目标

- 不改 `src/core/directory/report.ts` 的报告结构、转义、隐私相对化、上限/截断语义、`buildDirectoryReportAsync` 签名与块大小、`APP_VERSION` 读取方式；接线项只消费内核，不得复制任何上限 / 截断 / 转义逻辑。
- 不改 `PlatformPort.saveFile` / `SaveFileOptions`、主进程原子写、临时文件清理、IPC 通道、preload、Web 平台实现。
- 不改 `directoryProgress`（目录对比进度条）与 `cancelDirectoryCompare`、快照导出 / 导入、合并结果保存、同步预览 / 模板；不新增页面 / 面板 / 弹窗 / 设计 token，不重排目录工具栏既有按钮顺序。
- 不放宽/不改动双上限常量，不把上限改成可配置；不通过只改小 `maxRows` / `maxBytes` 来「验证」边界（边界用例必须走真实常量）。不新增第三方依赖、不新增/修改 `code_gates.json`、不改 `test:memory` / `test:cancel` / `perf:gate` 的数据集与阈值。
- 不新增 Electron IPC、`PlatformPort` 方法，不把报告生成搬到主进程；不覆盖文件 diff、CSV/JSON/YAML/结构化视图报告。
- 不重构 `src/core/io.ts`、不动 `DirectoryReportInput` / `DirectoryReportSource` 既有字段语义，不引入流式 Node API 或 Worker（块间让出只用宏任务）。
- 不改对比/合并算法、四态语义、过滤行为、快照格式与内置样本。
- 不做真实 358k 对照对与真实 `file://` 浏览器打开、桌面系统保存框点选与真机验证（合入后由 `product-qa` 复核），不做视觉重构或新增设计稿；不改 `main.css` token 定义、不新增设计 token 或组件。
- 不做 PDF/压缩包/服务端/二维码报告。
- 不 bump 版本，不改 README/CHANGELOG/release notes，不打 tag、不发布。
- 不做「顺手优化」：不动既有性能 gate 阈值与 fixture 规模。

## 实现约束

### 内核

- 核心文件零 Electron/React/DOM：只用 `import type` 引 `./compare` 的 `DirectoryComparison` / `DirectoryDiffNode` / `FileDiffStatus`，运行时不依赖 renderer、i18n 或 `PlatformPort`。
- `generatedAt`、`appVersion`、`htmlLang`、全部文案一律注入；核心不读 `Date.now()`、不读 `navigator.language`、不含中英文硬编码文案（`scanHardcodedChinese` 既有规则保持通过）。
- `APP_VERSION` 用静态 `import pkg from '../../package.json'` + `pkg.version`（`resolveJsonModule` 已开）；不新增依赖、不复制版本字符串。
- 转义顺序：先替换 `&` 再处理 `<` `>` `"` `'`，随后把 `://` 替换为 `:&#47;&#47;`；动态文本一律只落文本节点。
- 样式只来自一个内联 `<style>`，字体只用系统字体栈；差异色块使用与 `main.css` 同值的字面色：same `#6b7583`、added `#3fb950`、removed `#f2555a`、modified `#d8a13a`（软背景可沿用对应 `--color-diff-*-soft` 字面值）；正文保持可读对比。
- 行源按 `Iterable` 惰性单次消费：`ReportPass` 边拉行边渲染行 HTML 并累计字节，行数路径与字节路径共用同一趟；字节超限时回撤到能完整闭合的最后一行。禁止先收集 `DirectoryReportRow` 数组再渲染、禁止全量 `join()` 后再复制整份文档；常驻内存只保留行 HTML 片段（受 10 MB 上限约束）。
- 单一管线：内部以「文档块生成器」（`pullChunk` / `pulledRows` / `release` / `finish`）存在，同步入口同步抽干，异步入口逐块抽取并在块间 `await` 宏任务 + `throwIfAborted`；两个入口不得各写一套上限/截断/空态/转义/文档装配。
- `bytes` 必须对**最终** HTML 用 `TextEncoder` 计算，返回前不缓存旧值。
- 单元格长文本用 `overflow-wrap: anywhere` + `word-break: break-word`，普通空白折叠（不把换行变成标签）。
- 测试默认 Node 环境；需要解析 HTML 的用例直接用既有 devDependency `jsdom`（`new JSDOM`），不新装包；2,000,000 行用例与 35 万级用例使用生成器，10 MB / 200k 行级用例只做字符串级结构断言（不用 DOMParser 解析超大文档），35 万级允许显式 per-test `timeout`，不改 `vitest.config.mts` 全局配置。
- 测试必须确定性：不写墙钟阈值、不做 GC/堆峰值断言；新增测试放在 `src/core/directory/report.test.ts`（或同目录新文件），既有断言保持原样。

### renderer 接线

- 复用既有组件与视觉 token：工具栏按钮用 `ToolbarButton`（`lucide-react` 图标），复选框复用现有表单样式，不写死颜色/尺寸；不新建页面、弹窗或状态容器。
- `Workbench` 内复用现有 `report` / `copyNotice` / `detailNotice` 提示通道，不新增全局 notice 机制；但**导出任务状态必须与 `directoryBusy` 分离**（`AbortController` + 进行中标记 + 节流进度放在导出任务自己的 state / ref），取消按钮只在无任务或任务已收口时不可点，永不因 `busy` 禁用。
- 报告文案必须经 `useI18n()` 的 `t` 与 `language` 取得；`htmlLang` 复用 `src/renderer/src/i18n/htmlLang.ts`，核心与 renderer 均不得自行切语言或写死 `zh-CN` / `en`。
- 单一管线：异步包装只组装 `DirectoryReportInput` 并调用 `buildDirectoryReportAsync`，不得复制任何上限 / 截断 / 转义逻辑；`generatedAt` 必须可显式传入以便与同步路径逐字符比对；不得为了估算体积先行物化行源或遍历树。
- 进度提交节流：同一窗口合并为一次（`REPORT_PROGRESS_THROTTLE_MS = 50`），首次回调立即提交，生成结束强制提交最终值；不得每行触发一次 React 更新，`onProgress` 只携带标量。
- `saveFile` 只在生成 resolve 后调用一次；`null` 静默；reject 走既有 `detailNotice(errorText(cause))`；`OperationCancelledError`（`name === 'OperationCancelledError'`）不得渲染为 danger 错误。
- 导出按钮保持既有可访问标签与 title（`directory.report.toolbar.export` / `exportTitle`），导出中只增加 `disabled`；进度与取消是独立行内元素（`role="status"` + 既有 `ToolbarButton`），只引用既有 token，不写死颜色 / 尺寸。
- 文件名规范化在 renderer 侧集中一处实现并被单测覆盖，避免按钮与保存两处各写一遍。
- i18n 键统一 `directory.report.*` 分组；源码中不得出现中文硬编码（现有 `mainScan` 扫描保持通过），新增测试断言只读词典键。
- 测试基线：`DirectoryView.test.tsx` 的真实 26,000 文件双目录 fixture 复用（已抽到 `src/renderer/test-support/directoryFixture.ts` 供 view 与 Workbench 共用），另行构造 `/Users/<name>/...` 根路径用例；解析 HTML 用 jsdom `DOMParser`，计数对比必须读界面 `CompositionLegend` 的 DOM 数字而非重算。
- `saveFile` 用注入的 `PlatformPort` mock 分别注入 resolve / `null` / reject；「无残留」用目录条目集合比较或 `platform.exists` 断言；截断提示用 stub 的生成结果驱动，生产代码不新增测试专用分支；26k fixture 集成用例沿用既有显式 per-test `timeout`，不改 `vitest.config.mts` 全局配置，不做墙钟 / 堆峰值断言。

## 最近交付证明

- WI：`wi_ws_4506bd04246b761f`（目录导出进度、可取消与三种保存结果接线，`kind: feature`）
- 前序 WI：`wi_ws_1461270a69388629`（报告内核可取消分块生成 / 双上限边界）、`wi_ws_4ead71112fec1b93`（常驻导出入口、隐藏本机路径开关与保存接线）、`wi_ws_babecd546a792306`（报告纯函数内核 + `APP_VERSION` 单点）
- 日期：2026-10-27
- 结果：code_gates passed（9 gates；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：把上一 WI 的内核异步入口接到 renderer。`directoryReport.ts` 新增 `buildDirectoryReportForComparisonAsync`（构造**同一个** `DirectoryReportInput`、只调一次 `buildDirectoryReportAsync`、原样透传 `signal` / `onProgress`，`generatedAt` 可显式传入以做逐字符对齐；同步 helper 原样保留）与前沿+尾随节流器 `createReportProgressThrottle` / `REPORT_PROGRESS_THROTTLE_MS = 50`（首次立即提交、窗口内只留最新值、`finish` 强制提交最终值、`clear` 丢弃未提交样本）。`Workbench.handleExportReport` 改为**独立导出任务**：`reportExporting` / `reportProgress` state + `reportExportController` ref（同时作为重入闸），**不复用 `directoryBusy`**，起始进度取 `directoryReportSource(comparison).totalRows`；生成 resolve 后 `throttle.finish(latest)`、撤掉进度区，再只调一次 `saveFile`；成功 info（截断带 N / M）、`null` 静默、reject 走 `detailNotice(errorText(cause))`、`OperationCancelledError` 仅报普通 info「已取消导出」；`finally` 清节流器并复位全部状态。`DirectoryView` 新增可选 props `reportExporting` / `reportProgress` / `onCancelReportExport`：`role="status"` 进度行（`{done}` / `{total}`，`tabular`）+ 取消按钮（永不受 `busy` 禁用），导出按钮 `disabled = busy || reportExporting` 且可访问名不变；不传新 props 时渲染与旧版一致。zh/en 各新增 4 个 `directory.report.*` 键（`progress` / `cancel` / `cancelTitle` / `cancelled`）。内核、`PlatformPort.saveFile`、IPC、快照/合并/同步预览路径一律未动。
- 测试：`DirectoryReportExport.test.tsx` +343 行（5 条 26k 真实双目录 fixture 集成：导出中界面仍可交互 + 取消生成不落盘不报 danger、取消后立即再导出恰好 1 次 `saveFile` 且文档闭合、单任务在飞且成功提示带路径、截断提示双数字、`EROFS` reject 报 danger 且可重试）；`directoryReport.test.ts` +142 行（节流器 3 条：前沿/尾随合并、`finish` 强制终值、`clear` 丢弃；异步包装 3 条：zh/en × hideLocalPaths 两态逐字符等同同步、进度 `totalRows` 恒等于树行数且单调到终值、已 abort signal 以 `OperationCancelledError` reject）；`DirectoryView.test.tsx` +72 行（进度行与常点取消入口、导出中仅导出按钮 disabled；既有三组工具栏用例零回归）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），故本域 `qa/` 无新增折叠用例、全局 tech / design 折叠跳过。**后续项注意**：`saveFile` 打开原生保存面板后无法取消（只能等用户操作），因此进度区在生成结束、进入保存前就已撤掉——若后续要做「保存阶段也可取消」须改 `PlatformPort.saveFile` 契约，不属本域现有能力。另：取消只 `abort` 生成，节流器残留的未提交样本由 `clear()` 丢弃，取消路径不写盘也不留 `.tmp`；导出任务仍是渲染进程内单任务，若未来要并行导出多个目录对比需重新设计 ref 闸。
