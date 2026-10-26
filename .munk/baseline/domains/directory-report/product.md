# Domain: directory-report

目录对比 **HTML 报告导出**域：把已完成的 `DirectoryComparison` 渲染为**自包含、可离线、不含本机绝对路径、带双上限**的单文件 HTML 报告，并提供应用版本单点来源。本域当前只承载**纯函数内核**（`src/core/directory/report.ts` + `src/shared/appVersion.ts`，零 Electron / React / DOM）；`DirectoryView` 工具栏按钮、「隐藏本机路径」复选框、保存对话框与成功/取消提示属于后续 renderer 接线项，不在此域已交付范围。

## 范围

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

## 验收

### 转义与注入

- **ac-escape-text-roundtrip**：对 `name` / `relativePath` / `leftRoot` / `rightRoot` / `generatedAt` / `appVersion` 注入 `&`、`<`、`>`、`"`、`'`、`<script>alert(1)</script>`、换行、emoji、中文、≥300 字符超长名后，用 HTML 解析器读取对应单元格文本与原始字符串逐字一致（换行保留为字符，不转成 `<br>`）。
- **ac-escape-no-executable**：上述注入用例的最终 HTML 字符串中 `<script` 命中数为 0（大小写不敏感），且不存在由文件名/路径产生的任何标签；动态文本只出现在元素文本节点，不进入任何属性（源码中不出现承载用户路径的 `title=` / `data-*=...`）。
- **ac-colon-slash-neutralized**：任一动态文本含 `http://` 或 `https://` 时，源码中该处写作 `:&#47;&#47;`、`http(s)://` 字面量命中为 0，解析器还原后的文本仍为原始 `://`。

### 自包含可离线

- **ac-self-contained-zero-hits**：最终 HTML 中 `<script`、`<link`、`<img`、`<iframe`、`<object`、`<embed`、`@import`、`url(`、`@font-face`、`src=`、`href=`、`fetch(`、`http://`、`https://` 命中均为 0（大小写不敏感）；`<style` 恰好 1 个且为内联，无 `<style src`；文档以 `<!DOCTYPE html>` 开头并含 `<meta charset="utf-8">`，可被解析器解析为合法文档。
- **ac-lang-injected**：`<html lang>` 等于注入的 `htmlLang`（传 `zh-CN` / `en` 分别断言），核心不做语言判断、不含语言分支。

### 隐私

- **ac-privacy-default-relative**：`hideLocalPaths` 默认路径下，`/Users/alice/work/left` vs `/Users/alice/work/right` 渲染为 `left` / `right`；公共祖先为 `/`、`/Users`、`/home`、`C:\Users`、盘符根时退化为两侧根目录名；无有意义公共祖先时只显示两侧根目录名。
- **ac-privacy-no-absolute-default**：默认产物中 `/Users/`、`/home/`、注入的绝对根字符串命中均为 0；目录树行只出现根相对路径与名字，绝不拼接绝对根。
- **ac-privacy-toggle-absolute**：`hideLocalPaths: false` 时左右根按原样（含绝对路径）出现在报告头部，且树行仍是根相对路径。
- **ac-privacy-notice-always**：固定隐私提示文案（由 `strings.privacyNotice` 注入）在开关两种状态下都恰好出现一次，位于头部且在树表之前。

### 同源计数与版本

- **ac-counts-passthrough**：报告展示的四态数字与注入 `source.counts` 完全一致；用例故意让 `counts` 与行状态分布不同，报告仍显示注入值（证明导出不遍历树重算）。
- **ac-scope-note**：报告出现注入的计数口径说明（全部条目 / 不受过滤影响）一次。
- **ac-app-version-source**：`src/shared/appVersion.ts` 导出的 `APP_VERSION` 为 semver 且严格等于根 `package.json` 的 `version`；报告中的版本文本与注入的 `appVersion` 一致，核心内不存在硬编码版本号。
- **ac-generated-at-injected**：`generatedAt` 由调用方注入并原样进入报告；核心不读 `Date.now()`（同输入两次调用输出一致）。

### 上限、截断与字节

- **ac-limits-constants**：导出常量值精确为 `200_000` 与 `10_000_000`；报告同时包含可见「上限」行与 `<meta name="opencompare-report-limits" content="rows=200000;bytes=10000000">`。
- **ac-max-rows-not-truncated**：行源恰好 200000 行时 `truncated === false`、`shownRows === 200000`、`truncatedRows === 0`、`totalRows === 200000`，且无截断文案。
- **ac-one-over-truncated**：200001 行时 `truncated === true`、`shownRows === 200000`、`truncatedRows === 1`，`shownRows + truncatedRows === totalRows`；报告含「已展示 200000 / 原始 200001（已截断）」数字与「截断处子树不全」说明行。
- **ac-ten-times-lazy**：2000000 行用例以生成器行源提供（不物化 200 万元素数组），断言 `shownRows === 200000`、`truncated === true`、`shownRows + truncatedRows === 2000000`、行源实际产出次数 ≤ 200001、用例在默认超时内完成。
- **ac-bytes-limit-first**：构造超长路径/高字节行使字节上限先于行数上限触发：`shownRows < 200000`、`truncated === true`、`bytes <= 10_000_000`，且文档仍完整闭合可解析。
- **ac-bytes-measured**：两类上限用例中返回值 `bytes` 均严格等于 `new TextEncoder().encode(result.html).length` 且 `<= 10_000_000`。
- **ac-truncation-wellformed**：截断产物中行数等于 `shownRows`（数据行，不含表头/摘要），文档以 `</table></main></body></html>` 闭合；解析器无未闭合标签，截断处不出现半个标签或半行。
- **ac-empty-and-defensive**：空树（0 行）产出合法报告、`shownRows === 0`、渲染 `strings.empty`；当 `totalRows` 与行源实际产出不一致时以较小者为准（不抛错，`shownRows + truncatedRows` 仍在总数内）。

### 行源投影

- **ac-source-preorder**：`directoryReportSource(comparison)` 的前序遍历顺序与树表一致（根为 depth 0，目录按 `children` 原顺序，文件为叶子），行 `relativePath` / `name` / `kind` / `status` / `leftSize` / `rightSize` 与节点一致；`totalRows` 等于节点总数（根 + 目录 + 文件）。
- **ac-source-lazy**：根下挂 200000 个直接子节点（子节点的 `children` 用计数 getter 提供），只消费前 10 行时计数 getter 访问次数 ≤ 10，且第 11 个及之后的节点未被访问（投影按需产出，不预遍历整棵树）。

### 工程门禁

- **ac-core-purity**：`src/core/directory/report.ts` 不 import electron / react / react-dom / DOM 类型，Node 环境直接 import 即可运行（`pnpm lint` 的 `no-restricted-imports` 与 vitest 均通过）。
- **ac-gates-green**：全量 `code_gates`（install / lint / typecheck / build / build-web / test，含既有 cancel-gate / memory-gate）全绿，既有测试零回归。

## 非目标

- **不做 renderer 接线**：不加 `DirectoryView` 工具栏按钮与「隐藏本机路径」复选框、不改 `Workbench` 的 `saveFile` 流程、默认文件名、成功/取消提示、`busy` 态；这些属于后续接线项。
- **不做 i18n 词典新增**：报告文案全部由调用方经 `strings` 注入，本域不改 `zh/en directory.ts`、不改 `directoryI18n.test.tsx`。
- **不做 UI / 集成级验收**：≥1 万条目真实双目录经 UI 导出、`saveFile` 成功与取消两条路径属于接线项；`file://` 浏览器打开由 `product-qa` 合入后复核。
- 不做文件 diff、CSV、JSON/YAML 等其它视图的报告，不做 PDF/压缩包/服务端/二维码。
- 不改 `compare.ts` / `rows.ts` / `filter.ts` / `snapshot.ts` 语义，不新增 IPC 或 `PlatformPort` 方法。
- 不 bump 版本、不改 README/CHANGELOG/release notes、不打 tag；不改 `main.css` token 定义、不新增设计 token 或组件。
- 不做「顺手优化」：不动既有性能 gate 阈值与 fixture，不重构目录视图。

## 实现约束

- 核心文件零 Electron/React/DOM：只用 `import type` 引 `./compare` 的 `DirectoryComparison` / `DirectoryDiffNode` / `FileDiffStatus`，运行时不依赖 renderer、i18n 或 `PlatformPort`。
- `generatedAt`、`appVersion`、`htmlLang`、全部文案一律注入；核心不读 `Date.now()`、不读 `navigator.language`、不含中英文硬编码文案（`scanHardcodedChinese` 既有规则保持通过）。
- `APP_VERSION` 用静态 `import pkg from '../../package.json'` + `pkg.version`（`resolveJsonModule` 已开）；不新增依赖、不复制版本字符串。
- 转义顺序：先替换 `&` 再处理 `<` `>` `"` `'`，随后把 `://` 替换为 `:&#47;&#47;`；动态文本一律只落文本节点。
- 样式只来自一个内联 `<style>`，字体只用系统字体栈；差异色块使用与 `main.css` 同值的字面色：same `#6b7583`、added `#3fb950`、removed `#f2555a`、modified `#d8a13a`（软背景可沿用对应 `--color-diff-*-soft` 字面值）；正文保持可读对比。
- 行源按 `Iterable` 惰性消费：先取 `shownRows` 行再拼文档，字节超限时回撤到能完整闭合的最后一行；不得为算字节而重复物化整棵树（行数路径只 encode 整篇一次，字节路径才建行字节前缀）。
- `bytes` 必须对**最终** HTML 用 `TextEncoder` 计算，返回前不缓存旧值。
- 单元格长文本用 `overflow-wrap: anywhere` + `word-break: break-word`，普通空白折叠（不把换行变成标签）。
- 测试默认 Node 环境；需要解析 HTML 的用例直接用既有 devDependency `jsdom`（`new JSDOM`），不新装包；2,000,000 行用例使用生成器，保持默认超时内完成。
- 本波只允许改动 `src/core/directory/report.ts`、`src/core/directory/report.test.ts`、`src/shared/appVersion.ts`、`src/shared/appVersion.test.ts`（及必要的既有入口透出——若不存在入口则不新建）。

## 最近交付证明

- WI：`wi_ws_babecd546a792306`（目录对比 HTML 报告纯函数内核、转义/隐私/双上限与共享版本源，`kind: feature`）
- 日期：2026-10-26
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：新增 `src/core/directory/report.ts`（495 行）：导出 `DIRECTORY_REPORT_MAX_ROWS = 200_000` / `DIRECTORY_REPORT_MAX_BYTES = 10_000_000`、六个报告类型与 `buildDirectoryReport` / `directoryReportSource`。转义单函数 `escapeReportText` 先 `&` 后 `<` `>` `"` `'`，最后把 `://` 换成 `:&#47;&#47;`；所有动态值只落文本节点。根路径经 `splitAbsolutePath` / `isSensitiveAncestor` / `resolveReportRoots` 相对化：默认取公共祖先，命中 `/`、`/Users`、`/home`、`C:\Users`、盘符根时退化为两侧目录名，关闭开关才原样输出绝对根（树行始终根相对）。行源先按 `maxRows` 惰性 collect，随后对整篇 encode 一次做字节判断；仅在超字节上限时才对已收集行建字节前缀并二分回撤到「含截断提示仍完整闭合」的最后一行，`bytes` 永对最终 HTML 现算。`totalRows` 以 `min(注入值, 实际产出)` 口径容纳行源为真，空树走 `strings.empty` 且不出表。`src/shared/appVersion.ts` 以静态 JSON import 提供 `APP_VERSION = pkg.version`。
- 测试：`src/core/directory/report.test.ts`（25 条，jsdom 解析）覆盖转义逐字回读 / 零 `<script` 与零属性承载、`://` 中和、自包含零命中、`lang` 直传、隐私三态 + 提示恒一次、计数透传与 scope/时间/版本原样、确定性（同输入两次相等）、上限常量与 meta 镜像、200000 恰好不截断、200001 截断数字自洽、2,000,000 行生成器只消费 200000 次、字节上限先触发且文档闭合、截断行数与 `</table></main></body></html>` 闭合、空态与「较小总数」防御、投影前序字段与 `totalRows`、投影惰性（Proxy 计数：10 行内元素读取与 `children` 访问均 ≤ 10）。`src/shared/appVersion.test.ts` 断言等于根 `package.json` 版本且为 semver。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），故本域 `qa/` 暂无折叠用例、全局 tech / design 折叠跳过。**后续接线项务必注意**：`report.ts` 只接受注入的 `strings` / `htmlLang` / `generatedAt` / `appVersion`，renderer 接线时须自行准备 zh/en 词典与语言映射、传 `APP_VERSION`，并自行实现保存对话框与「隐藏本机路径」开关；本域未改 `compare.ts` / `snapshot.ts`，也未碰 `main.css` token 与 `DirectoryView`。
