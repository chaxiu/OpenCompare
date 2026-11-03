# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为自包含、可离线、不含本机绝对路径、带行数/字节双上限且可取消的单文件 HTML 报告，并在目录视图提供常驻导出入口、隐私开关、进度取消与保存接线。分两层：纯函数内核（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron/React/DOM）与 renderer 接线（`directoryReport.ts` / `DirectoryView` / `Workbench` / `zh-en directory.ts`），接线只消费内核、不改内核语义。

## 范围

### 内核

- **报告构建器（纯函数）**：`buildDirectoryReport(input)` 消费注入的行源、`totalRows`、左右根、四态计数、`generatedAt`、`appVersion`、`htmlLang`、`hideLocalPaths` 与可选上限，产出 `{ html, bytes, totalRows, shownRows, truncatedRows, truncated }`；核心不读时钟、不读 `navigator.language`、无语言分支与硬编码文案。
- **异步入口**：`buildDirectoryReportAsync(input, { signal?, onProgress? })` 返回同一 `DirectoryReport`，进度体只含标量 `{ processedRows, totalRows }`；两入口的转义、相对化、空态、双上限、截断回撤与文档闭合只有一份实现（内部 `ReportPass` 块生成器），块大小固定 `DIRECTORY_REPORT_CHUNK_ROWS = 4_000`、不可覆盖。
- **分块让出与取消**：每块最多一次进度回调，块间 `await setTimeout(…, 0)` 让事件循环，每块前后经 `@core/io` 的 `throwIfAborted` 检查；取消抛既有 `OperationCancelledError`（`code === 'ECANCELED'`）、释放已生成片段、不返回报告、不留模块级残留。
- **单次流式消费**：只创建 1 个行迭代器，边取行边渲染并累计 UTF-8 字节；常驻内存只保留产物所需片段，行对象仅在当前块内短存——禁止保留行数组、禁止全量 `join()` 后再复制整份文档；结果对象键恰为上述 6 个。
- **导出常量与文档结构**：`DIRECTORY_REPORT_MAX_ROWS = 200_000`、`DIRECTORY_REPORT_MAX_BYTES = 10_000_000`、`DIRECTORY_REPORT_CHUNK_ROWS = 4_000`；前两者镜像进 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">` 与头部可见「上限」行，上限不可配置。文档为 `<!DOCTYPE html>` + `<html lang="{注入值}">` + `<meta charset="utf-8">` + 单个内联 `<style>` + 头部（标题、隐私提示、时间、版本、根、上限、四态计数与口径）+ 树表 + 截断提示 + 空态 + 闭合标签。
- **转义与注入防护**：动态文本先转义 `&` `<` `>` `"` `'`（`&` 优先），再把 `://` 中和为 `:&#47;&#47;`；动态文本只落元素文本节点、绝不进属性，源码不出现由文件名/路径产生的标签。
- **隐私**：`hideLocalPaths` 默认把左右根相对化到公共祖先；公共祖先为 `/`、`/Users`、`/home`、`C:\Users` 或盘符根时退化为两侧根目录名，无有意义公共祖先时同样只显示两侧根目录名；关闭时左右根按原样进头部、树行仍是根相对路径；固定提示（`strings.privacyNotice`）两态各恰好一次、在头部且位于树表之前。
- **计数、版本与双上限**：四态计数与口径说明直接透传注入值（不遍历树重算），`generatedAt` / `appVersion` / `htmlLang` 均注入、同输入两次输出逐字一致；先按行数上限惰性消费，整篇超字节上限时回撤到「连截断提示都能完整闭合」的最后一行（按行字节前缀二分），`bytes` 对最终 HTML 用 `TextEncoder` 计算，且 `shownRows + truncatedRows === totalRows`。
- **容错与版本单点**：空树产出合法报告并渲染 `strings.empty`、不出表；`totalRows` 与行源实际产出不一致时以较小者为准、不抛错。`APP_VERSION` 单点读根 `package.json` 的 `version`，不复制版本串。
- **行源投影**：`directoryReportSource(comparison)` 把树投影为惰性 `DirectoryReportSource`——`rows` 是前序遍历生成器、只引用既有节点，`totalRows` 以 getter 按需计数，浅消费不预遍历整棵树。

### renderer 接线

- **工具栏入口与进度区（`DirectoryView` 第三行）**：常驻「导出 HTML 报告」按钮（`ToolbarButton` + `FileDown`），仅 `busy` 或 `reportExporting` 时禁用，与选真实目录、Web 运行时无关；同排「隐藏本机路径」复选框默认勾选。props 为 `hideLocalPaths` / `onHideLocalPathsChange` / `onExportReport` 与可选 `reportExporting` / `reportProgress` / `onCancelReportExport`；进度非空时渲染 `role="status"` 行内区 + 永不受 `busy` 禁用的取消按钮，不传新 props 时渲染与旧版一致。
- **边界模块（`workbench/directoryReport.ts`）**：提供 `directoryReportFileName`（`<左名>-vs-<右名>.html`，非法字符替换、空名回退 `directory`、不含绝对路径）、`directoryReportFilter`（html/htm）、`directoryReportStrings(t)`（状态名复用 `DIFF_LABEL_KEYS`）、同步/异步 `buildDirectoryReportForComparison*`（同一个 `DirectoryReportInput`、各只调一次内核、`generatedAt` 可显式传入）与 `directoryReportSaveCopy`（成功/截断两套提示）。
- **Workbench 接线**：`hideLocalPaths`（默认 `true`，shell 级 state、不进 per-session）切换会话或重挂载后保持；`handleExportReport` 用 `reportExporting` / `reportProgress` state + `reportExportController` ref（兼作重入闸），不复用 `directoryBusy`；生成 resolve 后只调一次 `platform.saveFile`——`null` 静默、成功走 info（截断带 N / M）、其它 reject 走 `detailNotice(errorText(cause))`、`OperationCancelledError` 仅普通 info「已取消导出」，`finally` 复位全部状态；`cancelReportExport` 只 `abort()`。
- **进度节流与 i18n**：`createReportProgressThrottle(emit, intervalMs = REPORT_PROGRESS_THROTTLE_MS /* 50 */)` 首次立即提交、窗口只留最新并到期补发、`finish` 终值、`clear()` 丢弃未提交样本；zh/en `directory.ts` 成对新增 `directory.report.*`（工具栏、开关、保存框、过滤器名、提示、报告内标题/标签/口径/列名、截断与空表文案）及 `progress` / `cancel` / `cancelTitle` / `cancelled`，en 无中文、parity 通过。

## 验收

### 内核

- **ac-escape-text-roundtrip**：对 `name` / `relativePath` / `leftRoot` / `rightRoot` / `generatedAt` / `appVersion` 注入 `&`、`<`、`>`、`"`、`'`、`<script>alert(1)</script>`、换行、emoji、中文、≥300 字符超长名后，解析器读到的单元格文本与原文逐字一致（换行保留为字符，不转 `<br>`）。
- **ac-escape-no-executable**：上述用例最终 HTML 中 `<script` 命中 0（大小写不敏感），无由文件名/路径产生的标签；动态文本只落文本节点、不进属性（源码无承载用户路径的 `title=` / `data-*=`）。
- **ac-colon-slash-neutralized**：动态文本含 `http://` / `https://` 时源码写作 `:&#47;&#47;`、`http(s)://` 字面命中 0，还原后仍为原始 `://`。
- **ac-self-contained-zero-hits**：最终 HTML 中 `<script`、`<link`、`<img`、`<iframe`、`<object`、`<embed`、`@import`、`url(`、`@font-face`、`src=`、`href=`、`fetch(`、`http://`、`https://` 命中均 0（大小写不敏感）；`<style` 恰 1 个且内联、无 `<style src`；以 `<!DOCTYPE html>` 开头、含 `<meta charset="utf-8">`、可解析为合法文档。
- **ac-lang-injected**：`<html lang>` 等于注入 `htmlLang`（`zh-CN` / `en` 分别断言），核心不做语言判断。
- **ac-privacy-default-relative**：`/Users/alice/work/left` vs `/Users/alice/work/right` 渲染为 `left` / `right`；公共祖先为 `/`、`/Users`、`/home`、`C:\Users`、盘符根时退化为两侧根目录名；无有意义公共祖先时只显示两侧根目录名。
- **ac-privacy-no-absolute-default**：默认产物中 `/Users/`、`/home/` 与注入的绝对根命中均 0；树行只出现根相对路径与名字，不拼绝对根。
- **ac-privacy-toggle-absolute**：`hideLocalPaths: false` 时左右根按原样（含绝对路径）出现在头部，树行仍为根相对路径。
- **ac-privacy-notice-always**：固定隐私提示（`strings.privacyNotice`）在开关两态下都恰好出现一次，位于头部且在树表之前。
- **ac-counts-passthrough**：报告四态数字与注入 `source.counts` 完全一致；用例故意让 `counts` 与行状态分布不同，报告仍显示注入值。
- **ac-scope-note**：报告出现注入的计数口径说明（全部条目 / 不受过滤影响）一次。
- **ac-app-version-source**：`APP_VERSION` 为 semver 且严格等于根 `package.json` 的 `version`；报告版本与注入 `appVersion` 一致，核心无硬编码版本号。
- **ac-generated-at-injected**：`generatedAt` 由调用方注入并原样进报告；核心不读 `Date.now()`（同输入两次输出一致）。
- **ac-limits-constants**：导出常量精确为 `200_000` 与 `10_000_000`；报告同时含可见「上限」行与 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">`。
- **ac-max-rows-not-truncated**：行源恰好 200000 行时 `truncated === false`、`shownRows === 200000`、`truncatedRows === 0`、`totalRows === 200000`，无截断文案。
- **ac-one-over-truncated**：200001 行时 `truncated === true`、`shownRows === 200000`、`truncatedRows === 1`、`shownRows + truncatedRows === totalRows`；含「已展示 200000 / 原始 200001（已截断）」与「截断处子树不全」说明行。
- **ac-ten-times-lazy**：2000000 行以生成器行源提供（不物化数组），断言 `shownRows === 200000`、`truncated === true`、`shownRows + truncatedRows === 2000000`、行源产出 ≤ 200001、用例在默认超时内完成。
- **ac-bytes-limit-first**：超长路径/高字节行使字节上限先于行数上限触发：`shownRows < 200000`、`truncated === true`、`bytes <= 10_000_000`，文档仍完整闭合可解析。
- **ac-bytes-measured**：两类上限用例中 `bytes` 严格等于 `new TextEncoder().encode(result.html).length` 且 `<= 10_000_000`。
- **ac-truncation-wellformed**：截断产物数据行数等于 `shownRows`（不含表头/摘要），以 `</table></main></body></html>` 闭合，无未闭合标签，截断处无半个标签或半行。
- **ac-empty-and-defensive**：空树产出合法报告、`shownRows === 0`、渲染 `strings.empty`；`totalRows` 与行源实际产出不一致时以较小者为准（不抛错，`shownRows + truncatedRows` 仍在总数内）。
- **ac-sync-async-same-document**：同一 `DirectoryReportInput`（`hideLocalPaths` true/false、zh/en 文案、空源与非空源）下两入口（异步不传 options）`html` 逐字符相等，`bytes` / `totalRows` / `shownRows` / `truncatedRows` / `truncated` 逐项相等。
- **ac-progress-scalar-monotonic**：200,000 行源调异步入口时 `onProgress` 至少回调 2 次；每次 `totalRows` 恒等源 `totalRows`、`processedRows` 单调不减且精确等于已拉取行数；末次等于结束时累计拉取行数。
- **ac-progress-bounded-count**：200,000 行源进度回调次数 ≤ `ceil(已拉取行数 / DIRECTORY_REPORT_CHUNK_ROWS) + 1`，不随行数线性膨胀（不得每行回调）。
- **ac-yield-macrotask**：生成启动前登记一个 `setTimeout(…, 0)`，该回调先于生成 Promise 完成被观察到，即生成未结束时事件循环可执行其它宏任务。
- **ac-abort-between-chunks**：第 1 次 `onProgress` 后 `controller.abort()`，异步入口以 `OperationCancelledError`（`name` / `code === 'ECANCELED'`）reject；abort 后新拉取 ≤ `DIRECTORY_REPORT_CHUNK_ROWS` 行、无后续进度回调、不返回报告；随后新源再生成可正常返回完整文档。
- **ac-abort-before-start**：传入已 abort 的 `AbortSignal` 时立即 reject `OperationCancelledError`，行源拉取 0 行。
- **ac-row-cap-exact**：用真实常量 `DIRECTORY_REPORT_MAX_ROWS`（200,000）构造恰好 200,000 行、`totalRows = 200_000` 的源，两入口均：`truncated === false`、`shownRows === 200_000`、`truncatedRows === 0`、`totalRows === 200_000`、无截断文案（`（已截断）` / `truncatedHint`）、拉取恰 200,000 行、`bytes === new TextEncoder().encode(html).length` 且 `≤ 10_000_000`。
- **ac-row-cap-plus-one**：200,001 行源两入口均：`shownRows === 200_000`、`truncatedRows === 1`、`totalRows === 200_001`、`shownRows + truncatedRows === totalRows`；含逐字 `已展示 200000 / 原始 200001（已截断）` 与 `truncatedHint` 各 1 次，`<tr>` 计数 − 1 === `shownRows`。
- **ac-byte-cap-exact**：用真实常量 `DIRECTORY_REPORT_MAX_BYTES`（10,000,000）构造最终文档恰 10,000,000 UTF-8 字节的输入（调行路径长度凑满，不改上限常量），两入口均：`truncated === false`、`bytes === 10_000_000`、无截断文案、以 `</table></main></body></html>` 闭合。
- **ac-byte-cap-plus-one**：在其上再增 1 字节（触发截断），两入口均：`truncated === true`、`bytes ≤ 10_000_000`、`shownRows < totalRows`、`shownRows + truncatedRows === totalRows`、文档完整闭合、`<tr>` 计数 − 1 === `shownRows`、截断文案 `{shown}` / `{total}` 与返回对象逐字一致。
- **ac-300k-worst-case**：惰性行源模拟最坏情形，`totalRows = 358_156`（根 + 358,155）与 358_209（根 + 358,208）两组，长相对路径、状态全 `modified`；两入口均：`bytes ≤ 10_000_000`、`shownRows ≤ 200_000`、`shownRows + truncatedRows === totalRows`、拉取 ≤ 200_000、含 `已展示 <shownRows> / 原始 358156（已截断）`（另一组 `358209`）、文档闭合且 `<tr>` 自洽；用例在单测内完成（允许显式 per-test `timeout`，不改全局配置）。
- **ac-single-pass-source**：带计数的 `Iterable<DirectoryReportRow>`（`[Symbol.iterator]` 计数）验证每次生成只创建 1 个迭代器、结束后不再拉新行（同步与异步各断言）；`Object.keys(result)` 恰为 `['html','bytes','totalRows','shownRows','truncatedRows','truncated']`。
- **ac-source-not-copied**：对深度冻结的 `DirectoryComparison` 调 `directoryReportSource` + 两入口生成不抛错、树未被改写；`rows` 仍惰性可迭代且 `totalRows` 与树行数一致。
- **ac-no-regression**：既有 `src/core/directory/report.test.ts` 与 `src/renderer/src/workbench/directoryReport.test.ts` 断言原样通过；两个上限常量不变；自包含标记、单 `<style>`、隐私提示恰 1 次、四态计数取自 `source.counts` 不回退。
- **ac-source-preorder**：`directoryReportSource(comparison)` 前序遍历与树表一致（根 depth 0，目录按 `children` 原顺序，文件为叶子），行 `relativePath` / `name` / `kind` / `status` / `leftSize` / `rightSize` 与节点一致；`totalRows` 等于节点总数。
- **ac-source-lazy**：根下挂 200000 个直接子节点（`children` 用计数 getter），只消费前 10 行时 getter 访问 ≤ 10，第 11 个及之后未被访问。

### 接线

- **ac-toolbar-export-persistent**：目录对比视图渲染后任意过滤状态下都存在可点击的「导出 HTML 报告」按钮；点击一次调用 `onExportReport` 恰好一次；`busy=true` 时按钮 disabled 且点击不触发回调。
- **ac-hide-paths-default**：「隐藏本机路径」默认勾选；点击后以 `false` 调用 `onHideLocalPathsChange`（再点 `true`），导出按钮不受影响仍可点击。
- **ac-hide-paths-survives-remount**：Workbench 中取消勾选后切到另一目录会话再切回，复选框仍未勾选（状态由 Workbench 持有）。
- **ac-report-counts-match-dom**：真实双目录 fixture（每侧 ≥1 万条目，含嵌套、左右独有、修改、相同）经 UI 导出并解析 `saveFile` 的 `content`；报告 same/added/removed/modified 与「全部」过滤下 `CompositionLegend` 的四个 DOM 数字逐一相等；报告为全部条目口径。
- **ac-report-lang-follows-ui**：zh 界面导出 `<html lang="zh-CN">` 且标题/列名为中文词典文案；en 界面为 `en` 且英文文案；两语言下均无另一语言硬编码文案。
- **ac-report-version-shared**：报告内版本字符串等于 `APP_VERSION`，且等于根 `package.json` 的 `version`。
- **ac-default-privacy-no-local-paths**：左右根为 `/Users/<name>/...` 且开关默认开启时产物源码 `/Users` 命中 0 且含固定隐私提示行；关闭后重导出出现原始绝对根，提示行仍存在。
- **ac-save-success-file-contract**：`saveFile` 的 `content` 为完整自包含 HTML（`<!DOCTYPE html>` 开头、`</html>` 结尾、含 `<meta charset="utf-8">`），`defaultPath` 以 `.html` 结尾且形如 `<左名>-vs-<右名>.html`（含 `\ / : * ? " < > |` 时替换、去尾空格、空名回退 `directory`、不含绝对路径），`filters` 含 `html`；返回路径后展示含该路径的成功提示。
- **ac-save-cancel-silent**：`saveFile` 返回 `null` 时无第二次 `saveFile`、无含路径的成功提示、无落盘副作用，`busy` 复位且按钮可再次点击。
- **ac-save-truncation-notice**：报告被截断时成功提示同时含已展示行数与原始行数（`N` / `M`），未截断时不含截断措辞。
- **ac-export-progress-on-click**：已打开目录对比的 Workbench 点击导出后、`saveFile` 被调用前同步可断言：出现 `role="status"` 进度区，文本含已处理行数与总数且总数等于 `directoryReportSource(comparison).totalRows`；同区有 enabled 的「取消」按钮；导出按钮 `disabled === true`。
- **ac-progress-throttled**：`vi.useFakeTimers()` 下同一时刻连续 100 次回调导致提交 ≤ 2 次，最终提交值为最后一次 `processedRows/totalRows`；首次回调无需等窗口即可见；窗口结束后下次回调提交新值；resolve 时 `finish` 强制提交终值；`clear()` 丢弃未提交样本。
- **ac-export-ui-interactive**：导出进行中过滤器 tab 与「隐藏本机路径」仍 enabled 且点击生效；被 `directoryBusy` 门控的按钮（载入样本 / 预览同步 / 模板 / 导出快照 / 导入快照 / 远端样本）保持 enabled；导出结束后仍 enabled，无残留全局 busy。
- **ac-export-not-reentrant**：导出进行中再次点击不启动第二个任务（生成 1 次、`saveFile` 1 次）；导出按钮可访问名恒为 `directory.report.toolbar.export`。
- **ac-cancel-generation-no-save**：进度出现后点「取消」→ `saveFile` 0 次；进度区消失；导出按钮恢复 enabled；默认路径 `<left>-vs-<right>.html` 在平台沙箱 `exists === false`；目标目录条目集合与导出前完全相同（无 0 字节 / `.tmp` / 半成品）；无 danger `role="alert"`（允许一条普通 info「已取消导出」）。
- **ac-cancel-then-export**：取消后立即再导出且 `saveFile` resolve 路径 → 恰好 1 次 `saveFile`，出现成功提示，内容以 `<!DOCTYPE html>` 开头、`</html>` 闭合且四态计数与 legend 一致。
- **ac-save-success-path**：`saveFile` resolve `'/memory/left-vs-right.html'` → 无 danger `role="alert"`；info 提示含完整路径；`defaultPath` 仍为 `left-vs-right.html`、`filters[0].extensions` 含 `html`、`content` 为完整自包含文档。
- **ac-save-truncated-copy**：生成结果截断时成功提示逐字包含 `shownRows` 与 `totalRows`，未截断时不含这两个数字；用 stub 截断结果（如 `shownRows: 120000 / totalRows: 358156`）驱动断言。
- **ac-save-cancelled-silent**：`saveFile` resolve `null` → `saveFile` 恰 1 次、无 `role="alert"`（含 info）、目标/默认文件名不存在、导出按钮恢复；随后再次导出可成功。
- **ac-save-unwritable**：`saveFile` reject `new Error('无法写入文件 …：只读（EROFS）')` → 出现 danger `role="alert"`，含该消息且不含成功文案；目标路径无文件与临时残留；导出按钮恢复；再次点击触发第二次 `saveFile`。
- **ac-async-parity**：同一 `comparison` / `t` / `language` / `hideLocalPaths` / `generatedAt` 下异步与同步包装的 `html` 逐字符相等，`bytes` / `totalRows` / `shownRows` / `truncatedRows` / `truncated` 逐项相等（zh、en × 两态覆盖）。
- **ac-async-signal-progress**：异步包装原样透传 `signal` / `onProgress`：未 abort 时 `totalRows` 恒等树行数、`processedRows` 单调不减且末次等于实际消费行数；传已 abort 的 `AbortSignal` 以 `name === 'OperationCancelledError'` reject，`saveFile` 0 次。
- **ac-real-fixture-report**：26,000 文件双目录 fixture 经 UI 导出：四态与 `CompositionLegend` DOM 逐项相等；`<html lang>` 为 `zh-CN` / `en`；`.meta-app-version` 为 `APP_VERSION`；隐藏路径开关两态行为不变；默认文件名与滤镜不变。
- **ac-toolbar-regression**：`DirectoryView` 既有「每个 filter 下导出按钮可用且回调一次」「busy 时禁用不回调」「hideLocalPaths 双向」零回归；未传新进度 props 时导出按钮 enabled、无进度区；传 `reportExporting` 时只有导出按钮 disabled。
- **ac-i18n-parity**：`zh` / `en` 新增键一一对应、无缺失；英文界面无中文；`directoryI18n.test.tsx` 英文工具栏清单含新按钮与新开关标题，现有扫描全通过。
- **ac-export-i18n-parity**：4 个 `directory.report.*` 键（`progress` / `cancel` / `cancelTitle` / `cancelled`）在 zh / en 一一对应且非空，`messages.test.ts` parity 通过；en 界面文案不含中文字符。
- **ac-no-new-ipc**：导出全程只调用既有 `PlatformPort.saveFile`，不新增 IPC channel 或平台方法；renderer 不直接引用 Electron API。

### 工程门禁

- **ac-core-purity**：`src/core/directory/report.ts` 不 import electron / react / react-dom / DOM 类型，Node 环境直接 import 可运行（`no-restricted-imports` 与 vitest 均通过）。
- **ac-gates-green**：全量 `code_gates`（install / lint / typecheck / build / build-web / test，含既有 cancel-gate / memory-gate）全绿，既有测试零回归。

## 非目标

- 不改内核的报告结构、转义、隐私相对化、上限/截断语义、`buildDirectoryReportAsync` 签名与块大小、`APP_VERSION` 读取方式；接线只消费内核，不复制上限 / 截断 / 转义逻辑。
- 不改 `PlatformPort.saveFile` / `SaveFileOptions`、主进程原子写、临时文件清理、IPC 通道、preload 与 Web 平台实现；不新增 Electron IPC 或平台方法，不把报告生成搬到主进程。
- 不改 `directoryProgress` / `cancelDirectoryCompare`、快照导出导入、合并结果保存、同步预览模板；不新增页面 / 面板 / 弹窗 / 设计 token，不重排工具栏既有按钮顺序，不改 `main.css` token 定义。
- 不放宽或改动双上限常量、不把上限改成可配置，也不靠改小上限来「验证」边界（必须走真实常量）；不新增第三方依赖、不改 `code_gates.json`、不改 `test:memory` / `test:cancel` / `perf:gate` 的数据集与阈值。
- 不重构 `src/core/io.ts`，不动 `DirectoryReportInput` / `DirectoryReportSource` 既有字段语义，不引入流式 Node API 或 Worker（块间让出只用宏任务）；不改对比/合并算法、四态语义、过滤行为、快照格式与内置样本。
- 不覆盖文件 diff、CSV/JSON/YAML/结构化视图报告，不做 PDF / 压缩包 / 服务端 / 二维码报告。
- 不做真实 358k 对照对与真实 `file://` 浏览器打开、桌面系统保存框点选与真机验证（合入后由 `product-qa` 复核）；不做视觉重构或新增设计稿，不 bump 版本，不改 README/CHANGELOG/release notes，不打 tag、不发布。

## 实现约束

- 核心零 Electron/React/DOM：只用 `import type` 引 `./compare` 的 `DirectoryComparison` / `DirectoryDiffNode` / `FileDiffStatus`，运行时不依赖 renderer、i18n 或 `PlatformPort`。
- `generatedAt`、`appVersion`、`htmlLang`、全部文案一律注入；核心不读 `Date.now()` / `navigator.language`、不含中英文硬编码文案（`scanHardcodedChinese` 保持通过）；`APP_VERSION` 用静态 `import pkg` + `pkg.version`（`resolveJsonModule` 已开），不复制版本串。
- 样式只来自一个内联 `<style>`，字体只用系统字体栈，差异色块用与 `main.css` 同值字面色（same `#6b7583`、added `#3fb950`、removed `#f2555a`、modified `#d8a13a`，软背景沿用 `--color-diff-*-soft`）。
- 单一管线：内部以「文档块生成器」（`pullChunk` / `pulledRows` / `release` / `finish`）存在，同步入口同步抽干、异步入口逐块抽取并在块间 `await` 宏任务 + `throwIfAborted`；两入口不得各写一套上限/截断/空态/转义/文档装配。
- 行源按 `Iterable` 惰性单次消费：`ReportPass` 边拉行边渲染并累计字节，行数路径与字节路径共用同一趟，超限回撤到能完整闭合的最后一行；禁止先收集 `DirectoryReportRow` 数组再渲染、禁止全量 `join()` 后再复制；`bytes` 必须对最终 HTML 用 `TextEncoder` 算、返回前不缓存旧值。
- 单元格长文本用 `overflow-wrap: anywhere` + `word-break: break-word`，普通空白折叠、不把换行变成标签。
- 测试默认 Node 环境；解析 HTML 用既有 `jsdom`（`new JSDOM` / `DOMParser`），不新装包；2,000,000 行与 35 万级用例用生成器，10 MB / 200k 行级只做字符串级结构断言（不用 DOMParser 解析超大文档）；35 万级与 26k fixture 允许显式 per-test `timeout`，不改 `vitest.config.mts` 全局配置；不写墙钟阈值、不做 GC/堆峰值断言。
- renderer 复用既有组件与 token：工具栏用 `ToolbarButton`（`lucide-react` 图标）、复选框复用现有表单样式，不写死颜色/尺寸，不新建页面 / 弹窗 / 状态容器；提示复用 `report` / `copyNotice` / `detailNotice`，不新增全局 notice 机制。
- 导出任务状态与 `directoryBusy` 分离（`AbortController` + 进行中标记 + 节流进度放自己的 state / ref），取消按钮只在无任务或任务已收口时不可点、永不因 `busy` 禁用；`saveFile` 只在生成 resolve 后调一次，`null` 静默，reject 走 `detailNotice(errorText(cause))`，`OperationCancelledError` 不得渲染为 danger。
- 文案经 `useI18n()` 的 `t` 与 `language` 取得，`htmlLang` 复用 `src/renderer/src/i18n/htmlLang.ts`，核心与 renderer 均不自行切语言或写死 `zh-CN` / `en`；进度按 `REPORT_PROGRESS_THROTTLE_MS = 50` 合窗，首次立即提交、结束强制终值，`onProgress` 只带标量，不每行触发 React 更新。
- 文件名规范化在 renderer 侧集中一处并被单测覆盖；i18n 键统一 `directory.report.*`，源码不出现中文硬编码；`saveFile` 用注入的 `PlatformPort` mock 分别注入 resolve / `null` / reject，「无残留」用目录条目集合或 `platform.exists` 断言，截断提示用 stub 生成结果驱动，生产代码不加测试专用分支。

## 最近交付证明

- WI：`wi_ws_4506bd04246b761f`（目录导出进度、可取消与三种保存结果接线，`kind: feature`）；日期 2026-10-27；结果 code_gates passed（9 gates；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`directoryReport.ts` 新增 `buildDirectoryReportForComparisonAsync`（同一个 `DirectoryReportInput`、只调一次内核、原样透传 `signal` / `onProgress`）与 `createReportProgressThrottle` / `REPORT_PROGRESS_THROTTLE_MS = 50`（前沿立即、窗口留最新、`finish` 终值、`clear` 丢弃）；`Workbench.handleExportReport` 改为独立导出任务（`reportExporting` / `reportProgress` + `reportExportController` 重入闸），生成 resolve 后只调一次 `saveFile`。
- `DirectoryView` 新增可选 `reportExporting` / `reportProgress` / `onCancelReportExport`：`role="status"` 进度行 + 永不受 `busy` 禁用的取消按钮，导出按钮 `disabled = busy || reportExporting` 且可访问名不变，不传时渲染不变；四种保存结果各有对应提示，`OperationCancelledError` 仅普通 info。内核、`PlatformPort.saveFile`、IPC、快照/合并/同步预览路径未动。
- 测试：`DirectoryReportExport.test.tsx` +343 行（5 条 26k 真实双目录 fixture 集成）、`directoryReport.test.ts` +142 行（节流 3 条 + 异步包装 3 条）、`DirectoryView.test.tsx` +72 行，既有工具栏三组用例零回归。
- 注：本 WI change pack 仅 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`；`saveFile` 打开原生保存面板后无法取消，故进度区在进入保存前撤掉；若要支持「保存阶段也可取消」须改 `PlatformPort.saveFile` 契约。导出仍是渲染进程内单任务。
