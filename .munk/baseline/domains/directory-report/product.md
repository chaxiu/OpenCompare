# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为**自包含、可离线、不含本机绝对路径、带双上限**的单文件 HTML 报告，并在目录视图里提供**常驻导出入口 + 隐私开关 + 保存对话框接线**。本域承载两层：

- **纯函数内核**（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron / React / DOM）：文档结构、转义、隐私相对化、双上限、共享版本源。
- **renderer 接线**（`src/renderer/src/workbench/directoryReport.ts`、`DirectoryView`、`Workbench`、`zh/en directory.ts`）：工具栏按钮与「隐藏本机路径」复选框、文件名规范化、`PlatformPort.saveFile` 成功/取消/截断提示，全部只消费内核、不改内核语义。

## 范围

### 报告内核（纯函数）

- **报告构建器（`src/core/directory/report.ts`，纯函数）**：`buildDirectoryReport(input)` 消费注入的行源、总行数、左右根路径、四态计数、`generatedAt`、`appVersion`、`htmlLang`、`hideLocalPaths` 与可选上限，产出 `{ html, bytes, totalRows, shownRows, truncatedRows, truncated }`。核心不读时钟、不读 `navigator.language`、不含语言分支、不含硬编码文案或版本号。
- **导出常量**：`DIRECTORY_REPORT_MAX_ROWS = 200_000`、`DIRECTORY_REPORT_MAX_BYTES = 10_000_000`，并镜像进文档 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">` 与头部可见「上限」行。
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
- 不新增 Electron IPC、`PlatformPort` 方法，不把报告生成搬到主进程；不覆盖文件 diff、CSV/JSON/YAML/结构化视图报告。
- 不改对比/合并算法、四态语义、过滤行为、快照格式与内置样本。
- 不做真实 `file://` 浏览器打开、桌面系统保存框点选与真机验证（合入后由 `product-qa` 复核），不做视觉重构或新增设计稿；不改 `main.css` token 定义、不新增设计 token 或组件。
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
- 行源按 `Iterable` 惰性消费：先取 `shownRows` 行再拼文档，字节超限时回撤到能完整闭合的最后一行；不得为算字节而重复物化整棵树（行数路径只 encode 整篇一次，字节路径才建行字节前缀）。
- `bytes` 必须对**最终** HTML 用 `TextEncoder` 计算，返回前不缓存旧值。
- 单元格长文本用 `overflow-wrap: anywhere` + `word-break: break-word`，普通空白折叠（不把换行变成标签）。
- 测试默认 Node 环境；需要解析 HTML 的用例直接用既有 devDependency `jsdom`（`new JSDOM`），不新装包；2,000,000 行用例使用生成器，保持默认超时内完成。

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

- WI：`wi_ws_4ead71112fec1b93`（目录视图常驻导出入口、隐藏本机路径开关与保存接线，`kind: feature`）
- 前序 WI：`wi_ws_babecd546a792306`（报告纯函数内核 + `APP_VERSION` 单点）
- 日期：2026-10-26
- 结果：code_gates passed（9 gates，attempt 001；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：新增 `src/renderer/src/workbench/directoryReport.ts`（109 行）作为 renderer 边界——`directoryReportFileName`（`/[\ /:*?"<>|]/` 换 `_`、`trim`、空名回退 `directory`）、`directoryReportFilter`（`html`/`htm`）、`directoryReportStrings(t)`（全部 `DirectoryReportStrings` 键经 `t`，四态复用 `DIFF_LABEL_KEYS`）、`buildDirectoryReportForComparison`（`directoryReportSource` + `htmlLang(language)` + `APP_VERSION` + 注入 `hideLocalPaths`，默认 `new Date().toISOString()`）与 `directoryReportSaveCopy`（`saved` / `savedTruncated` 两套 key + `shown`/`total` 参数）。`DirectoryView` 第三行工具栏新增常驻 `ToolbarButton`（`FileDown`，仅 `busy` 禁用）与「隐藏本机路径」`checkbox` label，新 props 三枚，视图只回调、不生成报告。`Workbench` 用 shell 级 `hideLocalPaths`（默认 `true`，不进 session state）与 `handleExportReport`：只建一次报告、经既有 `platform.saveFile` 落盘，`null` 直接 `return`（无第二次调用、无提示），成功走 `copyNotice`（截断带 `shown`/`total`），异常走 `detailNotice`，`directoryBusy` 保证不可重入。`zh/en directory.ts` 新增 26 个 `directory.report.*` 键（工具栏 4、报告正文 18、保存 4），英文侧 `Record<keyof typeof zhDirectory, string>` 强制对齐。
- 测试：新增 `directoryReport.test.ts`（10 条）覆盖文件名拼接/非法字符/空名与无绝对路径回退、过滤器扩展名、全部字符串取自词典、版本/语言/计数注入、默认隐藏 `/Users` 与关闭后暴露、默认上限内、成功与截断提示；新增 `DirectoryReportExport.test.tsx`（4 条）用真实 26,000 文件双目录 fixture 映射到虚拟 `/Users/alice/work/{left,right}` 端口，挂载真实 `Workbench` 断言 zh 报告四态数字与 `CompositionLegend` DOM 逐个相等、en 语言 + 关闭开关后出现绝对根、`saveFile` 返回 `null` 时静默且可复用、切会话重挂载后开关保持未勾选。`DirectoryView.test.tsx` 新增 `DirectoryView report toolbar` 3 条（任意过滤态常驻与单次回调、`busy` 禁用不回调、开关默认勾选与双向回调）；`directoryI18n.test.tsx` 英文工具栏清单加入 `Export HTML report` / `Hide local paths` 并对齐 title 与 zh 词典；`PerfRunner` 与 `perfShell.test.tsx` 补齐三枚新 props。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），故本域 `qa/` 无新增折叠用例、全局 tech / design 折叠跳过。**后续项注意**：`DirectoryViewProps` 新增的 3 枚 props 为必填，任何新的 `DirectoryView` 宿主（性能壳、新视图、story/测试）都必须补 `hideLocalPaths` / `onHideLocalPathsChange` / `onExportReport`；报告生成仍全程同步在 renderer 主线程，超大目录导出仅在 `buildDirectoryReportForComparison` 内一次性生成，未做进度或 worker 化。
