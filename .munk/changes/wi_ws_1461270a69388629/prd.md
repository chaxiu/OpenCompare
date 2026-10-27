# 报告内核：可取消分块生成、双上限边界与 30 万级语义

## 范围

只改 `src/core/directory/report.ts` 与其单测（`src/core/directory/report.test.ts`，可新增同目录测试文件）。目标是让 v0.2.8 已交付的报告内核从「1 万条目能用」升级为「30 万条目可放心用」，**不改报告产物结构与文案**：

1. 新增异步入口：`buildDirectoryReportAsync(input: DirectoryReportInput, options?: DirectoryReportAsyncOptions): Promise<DirectoryReport>`。
   - `DirectoryReportAsyncOptions = { readonly signal?: AbortSignal; readonly onProgress?: (progress: DirectoryReportProgress) => void }`。
   - `DirectoryReportProgress = { readonly processedRows: number; readonly totalRows: number }`（只上报标量，不带行对象 / HTML / 路径）。
2. 现有同步入口 `buildDirectoryReport(input)` 保留，且必须是**同一条渲染管线的同步驱动**：转义、隐私相对化、空态、行数上限、字节上限、截断回撤、文档闭合只有一份实现，同步入口不得另写一套上限/截断逻辑。
3. 生成过程改为**单次流式消费** `source.rows`：边取行、边渲染成行 HTML、边累计 UTF-8 字节；不再先收集最多 200,000 个 `DirectoryReportRow` 对象再渲染。常驻内存中只允许保留「产物所需的行 HTML 片段 + 前缀 + 后缀」，总量受 `DIRECTORY_REPORT_MAX_BYTES` 约束。
4. 异步入口按块消费并渲染，**块间让出事件循环到宏任务**（`setTimeout(0)` 或等价），块间用 `@core/io` 的 `throwIfAborted` 检查取消，取消时抛 `OperationCancelledError`。块大小以导出常量 `DIRECTORY_REPORT_CHUNK_ROWS`（默认 4,000）为准，进度每块最多回调一次。
5. `directoryReportSource(comparison)` 的惰性前序遍历、`totalRows` 惰性计数、「不复制对比树」语义不变。
6. 用真实常量补齐双上限四条边界与 35 万级懒行源的可回归测试（见验收）。

## 验收

- ac-sync-async-same-document: 同一 `DirectoryReportInput`（含 `hideLocalPaths` true/false、zh/en 文案、空源与非空源）下，`buildDirectoryReport` 与 `buildDirectoryReportAsync`（不传 options）返回的 `html` 逐字符相等，`bytes`/`totalRows`/`shownRows`/`truncatedRows`/`truncated` 逐项相等。
- ac-progress-scalar-monotonic: 200,000 行源调用异步入口时 `onProgress` 至少回调 2 次；每次回调的 `totalRows` 恒等于源 `totalRows`，`processedRows` 单调不减，且每次回调时 `processedRows` 精确等于行源已被拉取的行数（无超前读、无漏报）；最后一次回调的 `processedRows` 等于生成结束时的累计拉取行数。
- ac-progress-bounded-count: 200,000 行源的进度回调次数 ≤ `ceil(已拉取行数 / DIRECTORY_REPORT_CHUNK_ROWS) + 1`，且不随行数线性膨胀（不得每行回调一次）。
- ac-yield-macrotask: 在启动异步生成**之前**登记一个 `setTimeout(…, 0)`，该定时器回调先于生成 Promise 完成被观察到；即在生成未结束时事件循环可执行其它宏任务。
- ac-abort-between-chunks: 在 `onProgress` 第 1 次回调后 `controller.abort()`，`buildDirectoryReportAsync` 以 `OperationCancelledError`（`name === 'OperationCancelledError'`、`code === 'ECANCELED'`）reject；abort 之后行源新增拉取 ≤ `DIRECTORY_REPORT_CHUNK_ROWS` 行、后续不再有进度回调、不返回任何报告对象；随后用新源再次生成可正常返回完整文档（无模块级残留状态）。
- ac-abort-before-start: 传入已 abort 的 `AbortSignal` 时立即 reject `OperationCancelledError`，行源拉取 0 行。
- ac-row-cap-exact: 用真实常量 `DIRECTORY_REPORT_MAX_ROWS`（200,000）构造恰好 200,000 行、`totalRows = 200_000` 的源，同步与异步入口均：`truncated === false`、`shownRows === 200_000`、`truncatedRows === 0`、`totalRows === 200_000`，HTML 不含截断文案（`（已截断）` / `truncatedHint`），行源拉取行数恰为 200_000，`bytes === new TextEncoder().encode(html).length` 且 `≤ 10_000_000`。
- ac-row-cap-plus-one: 同样构造 200,001 行源，两入口均：`shownRows === 200_000`、`truncatedRows === 1`、`totalRows === 200_001`、`shownRows + truncatedRows === totalRows`，HTML 含逐字文案 `已展示 200000 / 原始 200001（已截断）` 与 `truncatedHint` 各 1 次，`<tr>` 计数 − 1 === `shownRows`。
- ac-byte-cap-exact: 用真实常量 `DIRECTORY_REPORT_MAX_BYTES`（10,000,000）构造一份最终文档**恰好** 10,000,000 UTF-8 字节的输入（通过调整行路径长度凑满，不改上限常量），两入口均：`truncated === false`、`bytes === 10_000_000`、HTML 无截断文案、文档以 `</table></main></body></html>` 闭合。
- ac-byte-cap-plus-one: 在上一构造上再增加 1 字节（观察输入超出后应触发截断），两入口均：`truncated === true`、`bytes ≤ 10_000_000`、`shownRows < totalRows`、`shownRows + truncatedRows === totalRows`、文档完整闭合、`<tr>` 计数 − 1 === `shownRows`、截断文案中的 `{shown}` / `{total}` 与返回对象逐字一致。
- ac-300k-worst-case: 惰性行源（不物化数组）模拟真实最坏情形，`totalRows = 358_156`（根 + 358,155 条目）与 `totalRows = 358_209`（根 + 358,208 条目）两组，行路径为长相对路径、状态全 `modified`；两入口均：`bytes ≤ 10_000_000`、`shownRows ≤ 200_000`、`shownRows + truncatedRows === totalRows`、行源拉取 ≤ 200_000、HTML 含 `已展示 <shownRows> / 原始 358156（已截断）`（另一组为 `358209`）、文档闭合且 `<tr>` 计数自洽；该用例在单测内可完成（可用显式 per-test `timeout`，不改全局 vitest 配置）。
- ac-single-pass-source: 用带计数的 `Iterable<DirectoryReportRow>`（`[Symbol.iterator]` 计数）验证每次生成只创建 1 个迭代器、且结束后不再拉取新行（同步与异步各断言一次）；`Object.keys(result)` 恰为 `['html','bytes','totalRows','shownRows','truncatedRows','truncated']`（结果对象不携带任何行对象/行集合）。
- ac-source-not-copied: 对深度冻结的 `DirectoryComparison` 树调用 `directoryReportSource` + 两入口生成，不抛错、树对象未被改写；`directoryReportSource` 的 `rows` 仍为惰性可迭代且 `totalRows` 与树行数一致。
- ac-no-regression: 既有 `src/core/directory/report.test.ts` 与 `src/renderer/src/workbench/directoryReport.test.ts` 全部既有断言原样通过；`DIRECTORY_REPORT_MAX_ROWS === 200_000`、`DIRECTORY_REPORT_MAX_BYTES === 10_000_000` 不变；自包含标记（无 `<script`/`<link`/`<img`/`http://`/`https://` 等）、单 `<style>`、隐私提示恰好 1 次、四态计数直接取自 `source.counts` 等既有断言不回退。

## 非目标

- 不改 renderer 接线、Workbench/DirectoryView、进度与取消 UI、i18n 键（属同一需求集其它子项）。
- 不改 `PlatformPort.saveFile`、主进程原子写、临时文件清理、IPC 通道（属其它子项）。
- 不改报告结构、CSS、文案键与文案内容、`lang` / 版本注入方式、隐私相对化规则、四态计数口径。
- 不放宽/不改动双上限常量，不把上限改成可配置；不通过只改小 `maxRows` / `maxBytes` 来「验证」边界（边界用例必须走真实常量）。
- 不新增第三方依赖、不新增/修改 `code_gates.json`、不改 `test:memory` / `test:cancel` / `perf:gate` 的数据集与阈值。
- 不跑真实 358k 对照对（`/Users/zhutao/opencompare-fixtures`）、不做 `file://` 浏览器打开与保存面板人工验收（由 product-qa 承接）。
- 不重构 `src/core/io.ts`、不动 `DirectoryReportInput` / `DirectoryReportSource` 既有字段语义，不引入流式 Node API 或 Worker。
- 不 bump 版本，不改 README / CHANGELOG / 发布证据。

## 实现约束

- 异步入口已定名 `buildDirectoryReportAsync`，options 只允许 `signal` / `onProgress`；不对外暴露块大小覆盖参数，块大小用导出常量 `DIRECTORY_REPORT_CHUNK_ROWS`（默认 4,000）。
- 取消语义复用 `@core/io` 的 `throwIfAborted` / `OperationCancelledError`，不新造取消类型、不返回结构化取消结果。
- 单条管线：内部以「文档块生成器」形式存在，同步入口同步抽取到底，异步入口逐块抽取并在块间 `await` 宏任务 + 取消检查；上限/截断/空态/转义/文档装配按构造只能有一份，禁止两个入口各写一套。
- 行对象只在当前块内短暂存活；允许保留行 HTML 片段（受 10 MB 上限约束），禁止保留 `DirectoryReportRow` 数组，禁止 `join()` 全量行后再次复制整份文档。
- `bytes` 一律用 `TextEncoder` 对最终 HTML 计算；截断回撤必须回到「连截断提示都完整闭合」的最后一行。
- `src/core/` 保持零 Electron / React / DOM 依赖；测试可在 jsdom 下解析小文档，10 MB / 200k 行级用例只做字符串级结构断言，避免 DOMParser 解析超大文档拖垮单测。
- 测试必须确定性：不写墙钟阈值、不做 GC/堆峰值断言；35 万级用例允许显式 `it(..., timeout)`，不改 `vitest.config.mts` 全局配置。
- 新增测试放在 `src/core/directory/report.test.ts`（或同目录新文件），既有断言保持原样。
