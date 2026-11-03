# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为**自包含、可离线、不含本机绝对路径、带双上限**的单文件 HTML 报告，并在目录视图里提供**常驻导出入口 + 隐私开关 + 保存对话框接线 + 可取消的导出任务**。两层职责：

- **纯函数内核**（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron / React / DOM）：文档结构、转义、隐私相对化、双上限、共享版本源，以及**同步 / 异步两个入口共用的单次流式分块管线**（`buildDirectoryReport` / `buildDirectoryReportAsync`，可取消、块间让出宏任务、进度只上报标量）。
- **renderer 接线**（`src/renderer/src/workbench/directoryReport.ts`、`DirectoryView`、`Workbench`、`zh/en directory.ts`）：工具栏按钮与「隐藏本机路径」复选框、异步包装 + 进度节流器、**独立可取消的导出任务**（行内进度区 + 取消入口）、文件名规范化、`PlatformPort.saveFile` 成功 / 取消 / 截断 / 不可写提示；接线只消费内核，不改内核语义。

## 范围

### 报告内核（纯函数）

- **报告构建器**：`buildDirectoryReport(input)` 消费注入的行源、总行数、左右根、四态计数、`generatedAt`、`appVersion`、`htmlLang`、`hideLocalPaths` 与可选上限，产出 `{ html, bytes, totalRows, shownRows, truncatedRows, truncated }`。核心不读时钟、不读 `navigator.language`、不含语言分支与硬编码文案 / 版本号。
- **异步入口（同一管线的分块驱动）**：`buildDirectoryReportAsync(input, options?)` 返回同一 `DirectoryReport`，`options` 只允许 `{ signal?, onProgress? }`，进度体只含标量 `{ processedRows, totalRows }`。两个入口的转义、隐私相对化、空态、双上限、截断回撤与文档闭合按构造只有一份实现（内部 `ReportPass` 文档块生成器），同步入口同步抽干、异步入口逐块抽取；块大小以 `DIRECTORY_REPORT_CHUNK_ROWS = 4_000` 为准，不对外暴露覆盖参数。
- **分块让出与取消**：异步入口每块渲染后最多回调一次进度，块间 `await` 宏任务（`setTimeout(…, 0)`），每块前后用 `@core/io` 的 `throwIfAborted` 检查取消；取消时抛既有 `OperationCancelledError`（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`）、释放已生成片段、不返回报告对象、不留模块级残留（同一进程内新源可立即再生成）。不新造取消类型、不返回结构化取消结果。
- **单次流式消费**：只创建 1 个行迭代器，边取行边渲染行 HTML、边累计 UTF-8 字节；常驻内存只保留「产物所需行 HTML 片段 + 前缀 + 后缀」，行对象只在当前块内短暂存活（禁止保留行数组、禁止全量 `join()` 后再复制整份文档）。结果对象键恰为 `['html','bytes','totalRows','shownRows','truncatedRows','truncated']`。
- **导出常量**：`DIRECTORY_REPORT_MAX_ROWS = 200_000`、`DIRECTORY_REPORT_MAX_BYTES = 10_000_000`、`DIRECTORY_REPORT_CHUNK_ROWS = 4_000`，前两者镜像进 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">` 与头部可见「上限」行；上限不可配置，不通过改小常量来「验证」边界。
- **行源投影**：`directoryReportSource(comparison)` 把 `DirectoryComparison` 投影为惰性 `DirectoryReportSource`——`rows` 是前序遍历生成器（只引用既有节点、不复制树），`totalRows` 以 getter 按需计数，浅消费不预遍历整棵树。
- **自包含文档结构**：`<!DOCTYPE html>` + `<html lang="{注入值}">` + `<meta charset="utf-8">` + 单个内联 `<style>` + 头部（标题、固定隐私提示、生成时间、应用版本、左右根、可见上限行、四态计数 + 口径说明）+ 树表（表头 + 每行状态色块、层级缩进、根相对路径、左右大小、状态文本）+ 截断提示 + 空态文案 + 闭合标签。
- **转义与注入防护**：动态文本先转义 `&` `<` `>` `"` `'`（`&` 优先），再把 `://` 中和为 `:&#47;&#47;`；动态文本只落元素文本节点，绝不进入属性（源码中不出现承载用户路径的 `title=` / `data-*=...`，也不出现由文件名 / 路径产生的标签）。
- **隐私**：`hideLocalPaths` 默认把左右根相对化到公共祖先；公共祖先为 `/` / `/Users` / `/home` / `C:\Users` / 盘符根时退化为两侧根目录名；无有意义公共祖先时只显示两侧根目录名。关闭开关时左右根按原样（含绝对路径）进头部，树行仍是根相对路径。固定隐私提示（`strings.privacyNotice`）两种状态下都恰好出现一次，位于头部且在树表之前。
- **计数与元信息同源**：四态计数与口径说明直接透传注入值（不遍历树重算）；`generatedAt` / `appVersion` / `htmlLang` 全部由调用方注入并原样进入报告；同输入两次调用输出逐字一致。
- **行数与字节双上限**：先按行数上限惰性消费；整篇超字节上限时回撤到「连截断提示都能完整闭合」的最后一行（按行字节前缀二分），`bytes` 对**最终** HTML 用 `TextEncoder` 计算，返回前不缓存旧值；截断元信息满足 `shownRows + truncatedRows === totalRows`。
- **容错**：空树（0 行）产出合法报告并渲染 `strings.empty`，不出表；`totalRows` 与行源实际产出不一致时以较小者为准（不抛错）。
- **应用版本单点**：`src/shared/appVersion.ts` 的 `APP_VERSION` 静态读取根 `package.json` 的 `version`（`resolveJsonModule`），不新增依赖、不复制版本字符串；核心内无硬编码版本号。

### renderer 接线

- **工具栏入口（`DirectoryView` 第三行）**：常驻「导出 HTML 报告」按钮（`ToolbarButton` + `FileDown`），仅在 `busy` 或导出进行中（`reportExporting`）时禁用，与是否选真实目录、是否 Web 运行时无关；同排「隐藏本机路径」复选框（默认勾选、复用现有表单样式）。新增 props `hideLocalPaths` / `onHideLocalPathsChange` / `onExportReport`；按钮只调 `onExportReport`，视图不自行生报告、不碰平台层。
- **边界模块（`workbench/directoryReport.ts`）**：`directoryReportFileName`（`<左名>-vs-<右名>.html`，非法字符替换、去尾空格、空名回退 `directory`、不含绝对路径）、`directoryReportFilter`（html / htm，名称来自词典）、`directoryReportStrings(t)`（全部 `DirectoryReportStrings` 键经 `t` 解析，四态状态名复用 `DIFF_LABEL_KEYS`）、`buildDirectoryReportForComparison(...)`（`directoryReportSource` + `htmlLang(language)` + `APP_VERSION`，只调一次同步内核）与 `directoryReportSaveCopy`（成功 / 截断两套提示 key 与参数）。
- **异步包装与节流器**：`buildDirectoryReportForComparisonAsync(...)` 构造**同一个** `DirectoryReportInput` 并只调一次 `buildDirectoryReportAsync`，原样透传 `signal` / `onProgress`；同步 helper 保留不动，两入口同输入 `html` 逐字符相等。同模块导出可单测的前沿 + 尾随节流器 `createReportProgressThrottle(emit, intervalMs = REPORT_PROGRESS_THROTTLE_MS /* 50 */)`：首次立即提交、窗口内只留最新值并到期补发、`finish(progress)` 强制提交终值、`clear()` 丢弃未提交样本。
- **Workbench 独立导出任务**：`handleExportReport` 自带 `reportExporting` / `reportProgress` state + `reportExportController` ref（同时作重入闸，ref 非空即返回），**不复用 `directoryBusy`**；先算 `directoryReportSource(comparison).totalRows` 作起始进度，再 `await` 异步包装（`signal` + 节流 `onProgress`），resolve 后 `throttle.finish(latest)`、清掉进度区，然后**只调一次** `platform.saveFile(...)`；`null` 静默、成功 `report(..., 'info')`（截断带 N / M）、其它 reject 走 `detailNotice(errorText(cause))`、`OperationCancelledError` 只报普通 info「已取消导出」；`finally` 里 `throttle.clear()` 并复位 ref / 进度 / 进行中标记。`cancelReportExport` 只 `abort()` 当前控制器。
- **视图进度与取消入口**：可选 props `reportExporting` / `reportProgress` / `onCancelReportExport`；`reportProgress` 非空时渲染行内 `role="status"` 区（`directory.report.progress` 带 `{done}` / `{total}`，`tabular`）与「取消」`ToolbarButton`（永不受 `busy` 禁用）；导出按钮 `disabled = busy || reportExporting`，可访问名 / title 不变；不传新 props 时渲染与旧版一致。
- **隐私开关归 Workbench**：`hideLocalPaths`（默认 `true`）是 shell 级 state，不进 per-session state，切换会话或视图重挂载后保持。
- **i18n**：`zh/en directory.ts` 成对新增 `directory.report.*` 分组（工具栏文案与 title、开关文案与 title、保存框标题、文件过滤器名、成功 / 截断提示、进度 / 取消 / 取消标题 / 已取消，以及报告内标题、隐私提示、时间 / 版本 / 左右根 / 上限行标签、口径说明、四态列名与状态名、截断文案、空表文案）；`directoryI18n.test.tsx` 英文工具栏清单同步，中文扫描保持通过。

## 验收

- **ac-escape-text-roundtrip / ac-escape-no-executable / ac-colon-slash-neutralized**：对 `name` / `relativePath` / 左右根 / `generatedAt` / `appVersion` 注入 `&` `<` `>` `"` `'` / `<script>alert(1)</script>` / 换行 / emoji / 中文 / ≥300 字符名后，解析器读出的单元格文本与原串逐字一致（换行保留为字符）；最终 HTML 中 `<script` 命中 0、无由文件名产生的标签、动态文本不进入任何属性；`http(s)://` 字面量命中 0 且解析后还原为 `://`。
- **ac-self-contained-zero-hits / ac-lang-injected**：`<script` / `<link` / `<img` / `<iframe` / `<object` / `<embed` / `@import` / `url(` / `@font-face` / `src=` / `href=` / `fetch(` / `http://` / `https://` 命中均 0；`<style` 恰 1 个且内联；文档以 `<!DOCTYPE html>` 开头、含 `<meta charset="utf-8">`、可被解析为合法文档；`<html lang>` 等于注入值（`zh-CN` / `en` 各断言），核心不做语言判断。
- **ac-privacy-default-relative / ac-privacy-no-absolute-default / ac-privacy-toggle-absolute / ac-privacy-notice-always**：默认相对化到公共祖先（退化规则如上）；默认产物中 `/Users/` / `/home/` / 注入绝对根命中 0，树行只有根相对路径；关闭开关后左右根按原样出现且树行仍相对；隐私提示两种状态各恰好一次且在树表之前。
- **ac-counts-passthrough / ac-scope-note**：四态数字等于注入 `counts`（用例故意让 counts 与行状态分布不同），不遍历重算；计数口径说明出现一次。
- **ac-app-version-source / ac-generated-at-injected**：`APP_VERSION` 为 semver 且严格等于根 `package.json#version`，报告版本等于注入值，核心无硬编码；`generatedAt` 注入并原样进入，核心不读 `Date.now()`（同输入两次输出一致）。
- **ac-limits-constants / ac-max-rows-not-truncated / ac-one-over-truncated / ac-ten-times-lazy**：常量精确为 200,000 / 10,000,000 且同时出现在可见上限行与 `<meta>`；恰好 200000 行不截断（`truncatedRows === 0`）；200001 行时 `shownRows === 200000`、`truncatedRows === 1`、和等于 `totalRows`，含「已展示 200000 / 原始 200001（已截断）」与「截断处子树不全」说明；2,000,000 行用生成器提供、实际产出 ≤200001 且在默认超时内完成。
- **ac-bytes-limit-first / ac-bytes-measured / ac-truncation-wellformed**：字节上限可先于行数触发（`shownRows < 200000`、`bytes ≤ 10_000_000`、文档闭合）；`bytes` 严格等于 `new TextEncoder().encode(result.html).length`；截断产物数据行数等于 `shownRows`、以 `</table></main></body></html>` 闭合、无未闭合标签或半行。
- **ac-empty-and-defensive**：空树合法报告、`shownRows === 0`、渲染 `strings.empty`；`totalRows` 与行源不一致时以较小者为准且不抛错。
- **ac-sync-async-same-document**：同一输入（`hideLocalPaths` true/false、zh/en、空源与非空源）下两入口 `html` 逐字符相等，其余字段逐项相等。
- **ac-progress-scalar-monotonic / ac-progress-bounded-count / ac-yield-macrotask**：200,000 行源进度回调 ≥2 次，`totalRows` 恒定、`processedRows` 单调不减且精确等于已拉取行数，末次等于结束累计；回调次数 ≤ `ceil(拉取行数 / CHUNK_ROWS) + 1`（不随行数线性膨胀）；生成未结束时事件循环可执行其它宏任务。
- **ac-abort-between-chunks / ac-abort-before-start**：首次进度后 `abort()` 即以 `OperationCancelledError` reject，之后行源新增拉取 ≤ `CHUNK_ROWS`、无后续进度、不返回报告，新源可正常再次生成；传入已 abort 的 signal 立即 reject 且拉取 0 行。
- **ac-row-cap-exact / ac-row-cap-plus-one / ac-byte-cap-exact / ac-byte-cap-plus-one**：用真实常量构造 200000 / 200001 行与恰好 10,000,000 / +1 字节输入，两入口的 `truncated` / `shownRows` / `truncatedRows` / `totalRows` / `bytes` / 文档闭合 / `<tr>` 计数 / 截断文案数字逐项符合（不改上限常量、不改小常量）。
- **ac-300k-worst-case**：358,156 与 358,209 行惰性最坏情形（长相对路径、全 `modified`）两入口均 `bytes ≤ 10_000_000`、`shownRows ≤ 200_000`、和自洽、拉取 ≤200_000、截断文案含原始总数、文档闭合；允许显式 per-test `timeout`，不改全局 vitest 配置。
- **ac-single-pass-source / ac-source-not-copied / ac-no-regression**：带计数 `Iterable` 验证只创建 1 个迭代器且结束后不再拉取（同步 / 异步各一次），`Object.keys(result)` 恰为六键；深度冻结的 `DirectoryComparison` 生成不抛错且树未被改写；既有 `report.test.ts` / `directoryReport.test.ts` 断言原样通过，双上限常量不变。
- **ac-source-preorder / ac-source-lazy**：前序遍历顺序与树表一致（根 depth 0、目录按 `children` 原序、文件为叶），行字段与节点一致、`totalRows` 等于节点总数；200000 直接子节点只消费前 10 行时计数 getter 访问 ≤10，第 11 个及之后未访问。
- **ac-toolbar-export-persistent / ac-hide-paths-default / ac-hide-paths-survives-remount**：任意过滤下都有可点击的导出按钮，点击一次只调 `onExportReport` 一次，`busy` 时 disabled 且不回调；隐私复选框默认勾选、双向回调、不影响导出按钮；取消勾选后切换目录会话再切回仍保持未勾选（state 在 Workbench）。
- **ac-report-counts-match-dom / ac-report-lang-follows-ui / ac-report-version-shared / ac-default-privacy-no-local-paths**：真实双目录 fixture（每侧 ≥1 万条目）经 UI 导出，报告四态与界面 `CompositionLegend` DOM 数字逐一相等且为全部条目口径；zh 导出 `<html lang="zh-CN">` 且中文文案、en 为 `en` 且英文、无另一语言硬编码；版本等于 `APP_VERSION` 且等于 `package.json#version`；默认开关下产物 `/Users` 命中 0 且含隐私提示，关闭后出现原始绝对根、提示仍在。
- **ac-save-success-file-contract / ac-save-cancel-silent / ac-save-truncation-notice**：`saveFile` 收到完整自包含 HTML（`<!DOCTYPE html>` 开头、`</html>` 结尾、含 charset meta），`defaultPath` 以 `.html` 结尾且形如 `<左名>-vs-<右名>.html`（非法字符替换、去尾空格、空名回退、不含绝对路径），`filters` 含 `html`，成功提示含路径；`null` 时不再二次调用、无成功提示、无写入副作用、`busy` 复位；截断时提示含 N / M，未截断不含截断措辞。
- **ac-export-progress-on-click / ac-progress-throttled / ac-export-ui-interactive / ac-export-not-reentrant**：点击导出后、`saveFile` 之前即出现 `role="status"` 进度区（总数等于 `directoryReportSource(comparison).totalRows`）与 enabled 的取消按钮，导出按钮 disabled；节流器在 fake timers 下 100 次回调提交 ≤2 次、首次立即可见、`finish` 强制终值、`clear` 丢弃；导出中过滤器与隐私复选框仍可用、被 `directoryBusy` 门控的其它按钮保持 enabled 且结束后无残留 busy；导出中再次点击不启动第二任务（生成 1 次、`saveFile` 1 次），可访问名不变。
- **ac-cancel-generation-no-save / ac-cancel-then-export**：进度出现后点取消 → `saveFile` 0 次、进度区消失、导出按钮恢复、默认路径不存在、目标目录条目集合不变（无 0 字节 / `.tmp` / 半成品）、无 danger alert（允许一条 info「已取消导出」）；取消后立即再导出恰好 1 次 `saveFile`、出现成功提示、文档闭合且计数与图例一致。
- **ac-save-success-path / ac-save-truncated-copy / ac-save-cancelled-silent / ac-save-unwritable**：resolve 路径 → 无 danger alert、info 含完整路径、`defaultPath` / `filters` / `content` 符合契约；stub 截断结果驱动提示含两个数字、未截断不含；`null` → 恰 1 次调用、无 alert、目标不存在、按钮恢复且可再次导出；reject（如只读 `EROFS`）→ danger alert 含该消息且无成功文案、无文件 / 临时残留、按钮恢复、再次点击触发第二次调用。
- **ac-async-parity / ac-async-signal-progress**：同输入下异步包装与同步 helper 的 `html` 逐字符相等、其余字段逐项相等（zh / en × 隐私两态）；`signal` / `onProgress` 原样透传，已 abort 的 signal 以 `OperationCancelledError` reject 且 `saveFile` 0 次。
- **ac-real-fixture-report / ac-toolbar-regression**：26,000 文件双目录 fixture 经 UI 导出，四态与 DOM 逐项相等、`<html lang>` / `.meta-app-version` / 隐私开关 / 文件名与滤镜符合；`DirectoryView` 既有三组工具栏用例零回归，未传新 props 时与旧版一致，传 `reportExporting` 时只有导出按钮 disabled。
- **ac-i18n-parity / ac-export-i18n-parity / ac-no-new-ipc**：新增键 zh / en 一一对应且非空、`messages.test.ts` parity 通过、en 进度 / 取消文案无汉字；导出全程只调既有 `PlatformPort.saveFile`，不新增 IPC channel 或平台方法，renderer 不直接引用 Electron API。
- **ac-core-purity / ac-gates-green**：`report.ts` 不 import electron / react / react-dom / DOM 类型，Node 环境可直接 import（`no-restricted-imports` + vitest 通过）；全量门禁（含既有 cancel / memory / 门禁矩阵）全绿且既有测试零回归。

## 非目标

- 不改内核的报告结构、转义、隐私相对化、上限 / 截断语义、`buildDirectoryReportAsync` 签名与块大小、`APP_VERSION` 读取方式；接线只消费内核，不得复制任何上限 / 截断 / 转义逻辑。
- 不改 `PlatformPort.saveFile` / `SaveFileOptions`、主进程原子写、临时文件清理、IPC 通道、preload、Web 平台实现。
- 不改目录对比进度条 / 取消、快照导出 / 导入、合并结果保存、同步预览 / 模板；不新增页面 / 面板 / 弹窗 / 设计 token，不重排目录工具栏既有按钮顺序。
- 不放宽或改动双上限常量，不把上限改成可配置；不通过改小 `maxRows` / `maxBytes` 来「验证」边界（边界用例必须走真实常量）。
- 不新增第三方依赖、不新增或修改 `.munk/code-gates.json`、不改 `test:memory` / `test:cancel` / `perf:gate` 的数据集与阈值。
- 不新增 Electron IPC / `PlatformPort` 方法，不把报告生成搬到主进程；不覆盖文件 diff、CSV / JSON / YAML / 结构化视图报告、PDF / 压缩包 / 服务端 / 二维码报告。
- 不重构 `src/core/io.ts`、不动 `DirectoryReportInput` / `DirectoryReportSource` 既有字段语义，不引入流式 Node API 或 Worker（块间让出只用宏任务）。
- 不改对比 / 合并算法、四态语义、过滤行为、快照格式与内置样本。
- 不做真实 358k 对照对与真实 `file://` 浏览器打开、桌面保存框点选与真机验证（合入后由 product-qa 复核）；不做视觉重构或新增设计稿；不改 `main.css` token。
- 不 bump 版本，不改 README / CHANGELOG / release notes，不打 tag、不发布；不动既有性能 gate 阈值与 fixture 规模。

## 实现约束

### 内核

- 零 Electron / React / DOM：只用 `import type` 引 `./compare` 的类型，运行时不依赖 renderer、i18n 或 `PlatformPort`。
- `generatedAt` / `appVersion` / `htmlLang` / 全部文案一律注入；核心不读 `Date.now()`、不读 `navigator.language`、无中英文硬编码（`scanHardcodedChinese` 规则保持通过）。
- `APP_VERSION` 用静态 `import pkg from '../../package.json'` + `pkg.version`；不新增依赖、不复制版本字符串。
- 转义顺序：先 `&` 再 `<` `>` `"` `'`，随后 `://` → `:&#47;&#47;`；动态文本一律只落文本节点。
- 样式只来自一个内联 `<style>`，字体只用系统栈；差异色块使用与 `main.css` 同值的字面色（same `#6b7583`、added `#3fb950`、removed `#f2555a`、modified `#d8a13a`，软背景可沿用 `--color-diff-*-soft` 字面值）。
- 行源按 `Iterable` 惰性单次消费：`ReportPass` 边拉行边渲染并累计字节，行数与字节路径共用同一趟；字节超限回撤到能完整闭合的最后一行。禁止先收集行数组再渲染、禁止全量 `join()` 后复制整份文档。
- 单一管线：内部以「文档块生成器」（`pullChunk` / `pulledRows` / `release` / `finish`）存在，同步入口同步抽干、异步入口逐块抽取并块间 `await` 宏任务 + `throwIfAborted`；两入口不得各写一套上限 / 截断 / 空态 / 转义 / 装配。
- `bytes` 必须对**最终** HTML 用 `TextEncoder` 计算；单元格长文本用 `overflow-wrap: anywhere` + `word-break: break-word`，普通空白折叠。
- 测试默认 Node 环境；解析 HTML 用既有 devDependency `jsdom`（不新装包）；2,000,000 行与 35 万级用例用生成器，10 MB / 200k 行级只做字符串级结构断言（不用 DOMParser 解析超大文档）；35 万级允许显式 per-test `timeout`，不改 `vitest.config.mts` 全局配置。
- 测试必须确定性：不写墙钟阈值、不做 GC / 堆峰值断言；新增测试放 `src/core/directory/report.test.ts`（或同目录新文件），既有断言保持原样。

### renderer 接线

- 复用既有组件与视觉 token：`ToolbarButton` + `lucide-react` 图标，复选框复用现有表单样式，不写死颜色 / 尺寸；不新建页面、弹窗或状态容器。
- 复用既有 `report` / `copyNotice` / `detailNotice` 提示通道，不新增全局 notice；**导出任务状态必须与 `directoryBusy` 分离**（`AbortController` + 进行中标记 + 节流进度放在导出任务自己的 state / ref），取消按钮只在无任务或任务已收口时不可点，永不因 `busy` 禁用。
- 报告文案经 `useI18n()` 的 `t` 与 `language` 取得；`htmlLang` 复用 `src/renderer/src/i18n/htmlLang.ts`，核心与 renderer 均不得自行切语言或写死 `zh-CN` / `en`。
- 异步包装只组装 `DirectoryReportInput` 并调用 `buildDirectoryReportAsync`，不得复制上限 / 截断 / 转义逻辑；`generatedAt` 必须可显式传入以便与同步路径逐字符比对；不得为估算体积先行物化行源或遍历树。
- 进度提交节流：同一窗口合并一次（`REPORT_PROGRESS_THROTTLE_MS = 50`），首次立即提交、结束强制提交终值；不得每行触发 React 更新，`onProgress` 只带标量。
- `saveFile` 只在生成 resolve 后调用一次；`null` 静默；reject 走 `detailNotice(errorText(cause))`；`OperationCancelledError` 不得渲染为 danger 错误。
- 导出按钮保持既有可访问标签与 title（`directory.report.toolbar.export` / `exportTitle`），导出中只增加 `disabled`；进度与取消是独立行内元素（`role="status"` + 既有 `ToolbarButton`），只引用既有 token。
- 文件名规范化在 renderer 集中一处并被单测覆盖；i18n 键统一 `directory.report.*` 分组，源码无中文硬编码。
- 测试基线：`DirectoryView.test.tsx` 的 26,000 文件双目录 fixture 复用（已抽到 `src/renderer/test-support/directoryFixture.ts`），另构造 `/Users/<name>/...` 根路径用例；解析 HTML 用 jsdom `DOMParser`，计数对比读界面 `CompositionLegend` 的 DOM 数字而非重算。
- `saveFile` 用注入 `PlatformPort` mock 分别注入 resolve / `null` / reject；「无残留」用目录条目集合比较或 `platform.exists` 断言；截断提示用 stub 结果驱动，生产代码不新增测试专用分支；26k fixture 集成用例沿用显式 per-test `timeout`，不做墙钟 / 堆峰值断言。

## 最近交付证明

- WI：`wi_ws_4506bd04246b761f`（目录导出进度、可取消与三种保存结果接线，`kind: feature`；前序 `wi_ws_1461270a69388629` 内核可取消分块、`wi_ws_4ead71112fec1b93` 常驻入口与隐私开关、`wi_ws_babecd546a792306` 纯函数内核 + `APP_VERSION`）
- 日期：2026-10-27
- 结果：`code_gates` passed（9 gates；`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：把内核异步入口接到 renderer。`directoryReport.ts` 新增 `buildDirectoryReportForComparisonAsync`（构造同一个 `DirectoryReportInput`、只调一次 `buildDirectoryReportAsync`、原样透传 `signal` / `onProgress`，`generatedAt` 可显式传入以做逐字符对齐；同步 helper 保留）与前沿 + 尾随节流器 `createReportProgressThrottle` / `REPORT_PROGRESS_THROTTLE_MS = 50`（首次立即提交、窗口内只留最新、`finish` 强制终值、`clear` 丢弃）。`Workbench.handleExportReport` 改为独立导出任务：`reportExporting` / `reportProgress` + `reportExportController` ref（兼重入闸），不复用 `directoryBusy`，起始进度取 `directoryReportSource(comparison).totalRows`；resolve 后 `throttle.finish(latest)`、撤进度区，再只调一次 `saveFile`；成功 info（截断带 N / M）、`null` 静默、reject 走 `detailNotice`、`OperationCancelledError` 只报 info「已取消导出」；`finally` 清节流器并复位。`DirectoryView` 新增可选 props `reportExporting` / `reportProgress` / `onCancelReportExport`：`role="status"` 进度行（`{done}` / `{total}`，`tabular`）+ 取消按钮（永不受 `busy` 禁用），导出按钮 `disabled = busy || reportExporting` 且可访问名不变；不传新 props 时渲染与旧版一致。zh/en 各新增 4 个 `directory.report.*` 键。内核、`PlatformPort.saveFile`、IPC、快照 / 合并 / 同步预览路径一律未动。
- 测试：`DirectoryReportExport.test.tsx` +343 行（5 条 26k 真实双目录集成：导出中界面仍可交互 + 取消生成不落盘不报 danger、取消后立即再导出恰好 1 次 `saveFile` 且文档闭合、单任务在飞且成功提示带路径、截断提示双数字、`EROFS` reject 报 danger 且可重试）；`directoryReport.test.ts` +142 行（节流器 3 条 + 异步包装 3 条：zh/en × 隐私两态逐字符等同同步、进度单调到终值、已 abort signal 以 `OperationCancelledError` reject）；`DirectoryView.test.tsx` +72 行（进度行与常点取消入口、导出中仅导出按钮 disabled；既有三组工具栏用例零回归）。
- 注：① 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例。② **保存阶段不可取消**：`saveFile` 打开原生面板后无法取消，因此进度区在生成结束、进入保存前就撤掉；若要做「保存阶段也可取消」须改 `PlatformPort.saveFile` 契约，不属本域现有能力。③ 取消只 `abort` 生成，节流器未提交样本由 `clear()` 丢弃，取消路径不写盘也不留 `.tmp`；导出仍是渲染进程内单任务，若未来要并行导出多个对比需重新设计 ref 闸。
