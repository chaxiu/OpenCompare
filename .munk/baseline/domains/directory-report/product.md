# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为**自包含、可离线、不含本机绝对路径、带双上限**的单文件 HTML 报告，并在目录视图里提供**常驻导出入口 + 隐私开关 + 保存对话框接线**。本域承载两层：

- **纯函数内核**（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron / React / DOM）：文档结构、转义、隐私相对化、双上限、共享版本源，以及**同步/异步两个入口共用的单次流式分块管线**（`buildDirectoryReport` / `buildDirectoryReportAsync`，可取消、块间让出宏任务、进度只上报标量）。
- **renderer 接线**（`src/renderer/src/workbench/directoryReport.ts`、`DirectoryView`、`Workbench`、`zh/en directory.ts`）：工具栏按钮与「隐藏本机路径」复选框、文件名规范化、`PlatformPort.saveFile` 成功/取消/截断提示，全部只消费内核、不改内核语义。

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

- **工具栏入口（`DirectoryView` 第三行工具栏）**：常驻「导出 HTML 报告」按钮（`ToolbarButton` + `FileDown` 图标），仅在 `busy` 时禁用，与是否选了真实目录、是否 Web 运行时无关；同排「隐藏本机路径」复选框（默认勾选、复用现有表单样式）。新增 props `hideLocalPaths` / `onHideLocalPathsChange` / `onExportReport`；按钮点击只调用 `onExportReport`，视图不自行生报告、不碰平台层。
- **renderer 边界模块（`src/renderer/src/workbench/directoryReport.ts`）**：集中提供 `directoryReportFileName`（`<左名>-vs-<右名>.html`，非法字符替换、去尾空格、空名回退 `directory`、不含绝对路径）、`directoryReportFilter`（html/htm，名称来自词典）、`directoryReportStrings(t)`（全部 `DirectoryReportStrings` 键经 `t` 解析，四态状态名复用 `DIFF_LABEL_KEYS`）、`buildDirectoryReportForComparison(comparison, t, language, hideLocalPaths, generatedAt?)`（`directoryReportSource` 投影 + `htmlLang(language)` + `APP_VERSION`，只调一次 `buildDirectoryReport`）与 `directoryReportSaveCopy`（成功/截断两套提示 key 与参数）。
- **Workbench 持有隐私开关**：`hideLocalPaths`（默认 `true`）是 shell 级 state，不进 per-session state，切换目录会话或视图重挂载后保持。
- **Workbench 导出流程**：用当前 `comparison` 投影报告，经既有 `platform.saveFile({ title, defaultPath, filters, content })` 落盘；`null`（取消）直接结束（不提示、不写、不重试）；成功提示含落盘路径；截断时提示同时带「已展示 N / 原始 M」；异常走既有 `detailNotice`；`busy` 复用 `directoryBusy`，导出期间按钮禁用且不可重入；仅调用既有 `PlatformPort.saveFile`，不新增 IPC。
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

### 接线：i18n 与平台边界

- **ac-i18n-parity**：`zh` 与 `en` 词典新增键一一对应、无缺失；英文界面不出现中文；`directoryI18n.test.tsx` 英文工具栏清单包含新按钮与新开关标题，现有 i18n 扫描测试全部通过。
- **ac-no-new-ipc**：导出全程只调用既有 `PlatformPort.saveFile`，不新增 IPC channel 或平台方法；renderer 不直接引用 Electron API。

### 工程门禁

- **ac-core-purity**：`src/core/directory/report.ts` 不 import electron / react / react-dom / DOM 类型，Node 环境直接 import 即可运行（`pnpm lint` 的 `no-restricted-imports` 与 vitest 均通过）。
- **ac-gates-green**：全量 `code_gates`（install / lint / typecheck / build / build-web / test，含既有 cancel-gate / memory-gate）全绿，既有测试零回归。

## 非目标

- 不改 `src/core/directory/report.ts` 的报告结构、转义、隐私相对化、上限/截断语义与 `APP_VERSION` 读取方式；接线项只消费内核。
- 不改 renderer 接线、Workbench/DirectoryView、进度与取消 UI、i18n 键；不改 `PlatformPort.saveFile`、主进程原子写、临时文件清理、IPC 通道。异步入口当前只供内核与单测使用，UI 消费属同一需求集其它子项。
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
- `Workbench` 内复用现有 `report` / `copyNotice` / `detailNotice` 提示通道与 `directoryBusy`，不新增全局 notice 机制。
- 报告文案必须经 `useI18n()` 的 `t` 与 `language` 取得；`htmlLang` 复用 `src/renderer/src/i18n/htmlLang.ts`，核心与 renderer 均不得自行切语言或写死 `zh-CN` / `en`。
- 只调用一次 `buildDirectoryReport`；不得为了估算体积先行物化行源或遍历树，行数与字节上限由内核负责。
- 文件名规范化在 renderer 侧集中一处实现并被单测覆盖，避免按钮与保存两处各写一遍。
- i18n 键统一 `directory.report.*` 分组；源码中不得出现中文硬编码（现有 `mainScan` 扫描保持通过），新增测试断言只读词典键。
- 测试基线：`DirectoryView.test.tsx` 的真实 26,000 文件双目录 fixture 复用（已抽到 `src/renderer/test-support/directoryFixture.ts` 供 view 与 Workbench 共用），另行构造 `/Users/<name>/...` 根路径用例；解析 HTML 用 jsdom `DOMParser`，计数对比必须读界面 `CompositionLegend` 的 DOM 数字而非重算。
- `saveFile` 用注入的 `PlatformPort` mock 分别返回路径与 `null`；不得依赖内置样本或真实磁盘写入完成断言。

## 最近交付证明

- WI：`wi_ws_1461270a69388629`（报告内核：可取消分块生成、双上限边界与 30 万级语义，`kind: feature`）
- 前序 WI：`wi_ws_4ead71112fec1b93`（目录视图常驻导出入口、隐藏本机路径开关与保存接线）、`wi_ws_babecd546a792306`（报告纯函数内核 + `APP_VERSION` 单点）
- 日期：2026-10-27
- 结果：code_gates passed（9 gates，attempt 001；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`src/core/directory/report.ts` 重写为单一 `ReportPass` 文档块生成器（`pullChunk` / `pulledRows` / `release` / `finish`），转义、隐私相对化、空态、行数上限、字节上限、截断回撤与文档闭合只剩一份实现。同步入口 `buildDirectoryReport` 用 `while (pass.pullChunk())` 抽干；新增 `buildDirectoryReportAsync(input, { signal?, onProgress? })` 逐块抽取，块间 `onProgress({ processedRows, totalRows })`（纯标量、每块最多一次）+ `await nextMacrotask()`（`setTimeout(resolve, 0)`）+ 两次 `throwIfAborted`（块后与 yield 后），取消走 `@core/io` 的 `OperationCancelledError` 并 `pass.release()` 丢弃全部片段。行源改为单次流式消费：只保存行 HTML 片段与累计字节（`rowHtml` / `rowBytes` / `cumulativeBytes`），不再物化 `DirectoryReportRow` 数组、不再全量 `join()` 后重组整篇。新增导出常量 `DIRECTORY_REPORT_CHUNK_ROWS = 4_000`；`DIRECTORY_REPORT_MAX_ROWS` / `DIRECTORY_REPORT_MAX_BYTES` 值未变。报告结构、文案键、`lang`/版本注入、渲染结果与既有上限语义保持逐字不变（同步/异步同输入 `html` 逐字符相等）。
- 测试：`src/core/directory/report.test.ts` +507/−72 行，新增 13 条（总用例覆盖 ac-sync-async-same-document / ac-progress-scalar-monotonic / ac-progress-bounded-count / ac-yield-macrotask / ac-abort-between-chunks / ac-abort-before-start）：`buildDirectoryReportAsync` 5 条（同步等价、进度精确等量且每块一次、宏任务先行、块间 abort 拒 `OperationCancelledError` 且新源可复用、已 abort 立即拒绝 0 拉取）；真实常量行数边界 2 条（200,000 恰好不截断、200,001 截断文案与 `<tr>` 自洽）；真实常量字节边界 2 条（恰好 10,000,000 不截断、+1 字节截断且文档闭合）；30 万级惰性源 2 条（358,156 / 358,209 长路径全 `modified`，显式 per-test timeout）；单次流式与不复制 3 条（单迭代器且不越读、结果键恰为 6 个标量、深度冻结树不抛错不改写）。既有 30 条断言（转义/自包含/隐私/计数/上限/投影）保持原样通过。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），故本域 `qa/` 无新增折叠用例、全局 tech / design 折叠跳过。**后续项注意**：异步入口已就绪但 **renderer 尚未接线**——`buildDirectoryReportForComparison` 仍只调同步 `buildDirectoryReport`，超大目录导出在主线程一次跑完且无进度/取消 UI；接线子项需新增宿主 props/回调与 `directory.report.*` 进度文案，并且必须保持「只建一次报告、同一 `ReportPass` 管线」约束。另：`DIRECTORY_REPORT_CHUNK_ROWS` 已导出但当前无 UI 覆盖参数，若后续要让用户调节块大小须新开工单改契约。
