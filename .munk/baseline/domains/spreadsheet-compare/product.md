# Domain: spreadsheet-compare

xlsx / xlsm（Excel OOXML 表格）对比解析域。两部分现行口径：① 评估结论（`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`）——冻结语义边界、选型与发行源结论、由静置护栏反推的体积/内存上限、供应链责任与验证边界；② **已落地的值提取层 `src/core/xlsx/`**——把工作簿读成与 `CsvTableData` 同形状的 `{header, rows, meta}`，供上层原样复用 `alignCsvTables`。W1 解析层（`src/core/xlsx/parse.ts`）、W2 上限层（`src/core/xlsx/limits.ts`）与 W3 工作台接入（`src/renderer/src/workbench/xlsxCompare.ts` + `src/renderer/src/views/XlsxCompareView.tsx`）均已落地（上限 / zip bomb 与运行时水位随之生效）；拖两个 `.xlsx` / `.xlsm` 即并入 CSV 同一链路出四态，`csv-align` / `structured` / `workbench` / `directory` / `code-diff-merge` 的「不做 `.xlsx`」非目标已按上述口径收窄。出厂构建在沙箱 renderer 下曾因 `Buffer` / `process` 缺失打不开 xlsx，现由 `wi_intake_56e94a818c731f15` 去掉这两类 Node 全局依赖并加静态守卫（见 `## 最近交付证明`）。

## 范围

- **评估文档**：`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`，中文、表格化、结论先行（当前 122 行），按「语义边界 → 选型与供应链 → 非矩形 → 复用边界 → 上限 → 工作量 → 证据 → 验证边界」排序。
- **值提取层（`src/core/xlsx/`，已落地）**：入口 `parseXlsxTable(bytes, options?)`（默认取工作簿首个 sheet）、`parseXlsxSheet(bytes, sheetName)`（按名取表）、`listSheets(bytes)`、`matchXlsxSheets(left, right)`（两侧按名大小写不敏感配对 + 左右差集）。输出 `{ header, rows, meta }`：`header` 与所有单元格均为字符串，可直接喂 `alignCsvTables(left, right, keyColumns)` 不经二次转换。`meta` 只放解析事实、不参与 diff：`sheetName` / `sheetNames` / `headerRow` / `date1904` / `uncachedFormulaCells` / `hiddenRows` / `hiddenColumns` / `hiddenColumnIndexes`（隐藏列在 `header` / 行数组中的下标，供上层「忽略隐藏」重算）/ `mergedRanges` / `warnings`。`dense: true` 读入；空表头按列字母（`A`/`B`…）补齐并按「首个同名保留」去重；隐藏行列默认参与比较、仅在 `meta` 标注（供上层做「忽略隐藏」开关）；`.xlsm` 一律 `bookVBA: false`。
- **上限与拒绝层（`src/core/xlsx/limits.ts`，已落地）**：`resolveXlsxBudget({tabCount, mode})` 按 §5.1 返回双栏收紧值（①1 tab dense 300 MiB / 容器 40 MiB、②1 tab 普通 171 / 20 MiB、③3 tab dense 100 / 13 MiB），3 tab + 普通返回 `supported: false` 而不给预算；`inspectXlsxContainer` 只读 zip 中央目录即判容器 / 条目数 / 单条目 / 压缩比 / 累计解压预算（未解压即拒绝），`assertSheetXmlLimit` / `assertSharedStringsLimit` / `assertSheetBounds` 管单 sheet 与共享字符串，`checkXlsxWatermark` 在水位 60% 记 warning 进 `meta.warnings`、80% 中止并丢弃已产出对象。任何拒绝统一抛 `XLSX_LIMIT_EXCEEDED` 并带 `{ limit, observed }`，不产出 rows、不写任何会话状态。
- **语义边界（后续实现的可执行口径，本轮冻结）**：
  - ① 公式：只读 `<c><v>` 缓存值（`cellFormula: false`），不求值、不解析公式文本；无缓存值统一按 `''` 处理，解析摘要记 `uncachedFormulaCells`，非 0 时 UI 提示「N 个公式无缓存值，按空比较」。
  - ② 合并单元格：只取合并区左上锚点值，区内其余格一律 `''`；不做拆分扩展（不把锚点值复制到每格），行数不变。
  - ③ 样式 / 共享字符串：样式（`styles.xml`、字体、填充、条件格式、批注）不参与 diff；`sharedStrings.xml` 仅作值解析中间层，解析后丢弃索引表，不留 `s=` 痕迹。
  - ④ 体积与内存：上限（容器 / 累计解压字节 / 单 sheet / 共享字符串表）按 §5.1 **由 1,300 MiB 静置护栏反推**，不是任意常数。反推口径：基线 renderer 99.3 MiB、appTotal 369.1 MiB（`docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json` 的 `samples[0].phase=startup`），renderer 可用 1,200 MiB 与 app 可用 2,191 MiB 取小 → 预算由 renderer 侧 1,200 MiB 约束；公式为 D = 1,200 MiB ÷ 并发 tab 数 ÷ 最坏放大倍数（dense 3× / 普通 6×），容器体积按约 10:1 估算、判定以逐条目 inflate 累计字节为准。四情形（1 tab dense / 1 tab 普通 / 3 tab dense / 3 tab 普通）允许解压 400 / 200 / 133 / 67 MiB，容器 40 / 20 / 13 / 7 MiB，峰值 renderer 1,300 MiB、app ≈1,569 MiB；双栏对比两侧顺序解析再收紧至 300 / 171 / 100 / 57 MiB，基线偏离 >10% 须重算。超限一律拒绝解析，不截断、不降级、不部分渲染。
  - ⑤ 数字与日期：日期按 `date1904` 基准 + `numFmt` 判定后归一化为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`（无时区）；浮点 `toPrecision(15)` 后去尾零再 diff；`.xlsm` 一律只读数据、绝不执行宏（`bookVBA: false`），「必须执行宏才能取值」的文件类型直接排除。
- **选型结论**：选 SheetJS CE，但**换发行源**——用 SheetJS 官方 CDN 的 `xlsx` 0.20.3 tarball（锁版本 + sha256，CI 校验），不用 npm 上的 0.18.5；CDN 不可得时退到自研 zip+XML，禁止回退 npm 0.18.5。三路径（SheetJS CE / exceljs 4.4.0 / 自研）已并列比较 license、活跃度、包体、只读流式、内存放大。
- **供应链责任（§2.2）**：责任人为本产品负责人，maintain 态随月度巡检只读探测 CDN 版本线（只记录、不自动升级），纳入开发后由该项实现负责人承接；任何升级须负责人批准并作为独立工作项，升级前复跑五项断言（sha256 与 lockfile `integrity` 一致 / 对照 Advisory 确认不在 `CVE-2023-30533` 范围 `< 0.19.3` / `xlsx.mjs` 与 `dist/*.js` 的 `eval(`、`new Function` 扫描 0 命中 / §8 六类解析层单测全绿 / 典型样本四态计数与升级前逐项一致）；退自研触发 = 巡检 404 或连续 30 天 CDN 不可得或哈希校验失败且无官方替代源，期间不得回退 npm 0.18.5。§6 风险列已指向 §2.2。
- **验证边界（§8）**：工作台接入已落地，`xlsx-workbench-gate`（`src/core/xlsx/hidden.test.ts` + `src/renderer/src/workbench/xlsxCompare.test.ts` + `src/renderer/src/views/XlsxCompareView.dom.test.tsx`）覆盖隐藏行列策略、会话层顺序解析、预算档位、拒绝不建 tab 与逐表四态；Host 记的 `not-applicable` 只表示「未运行」，**不是通过、不是合规证据**，不得对外写「已支持 xlsx」。已落地部分（语义解析层 + 依赖钉版 + 上限拒绝层）进 `code_gates`：`xlsx-parse-semantics`（`src/core/xlsx/parse.test.ts`）、`xlsx-dep-integrity`（`src/xlsx-dep-gate.test.ts`，含 renderer 可达模块的 Node 全局静态守卫）与 `xlsx-limit-gate`（`src/core/xlsx/limits.test.ts` + `parse.test.ts`）。§8 六类中的 zip bomb 拒绝与四类超限拒绝（含 `{limit, observed}`）已由上限项补齐；工作台接入已落地，但对外仍**不得**把 xlsx 支持写成「已支持」（README / Issue / 对外文案零改动）。
- **`alignCsvTables` 复用边界**：xlsx 解析只作前置层，输出 `{header, rows}` 后原样复用 `src/core/csv/align.ts`，`align.ts` 保持零改动；类型只收字符串这一缺口由解析层归一化在入口吸收，上限与 zip bomb 判定由解析层入口统一承担（已落地，会话层只调既有导出、不重写阈值）。
- **非矩形四类结论**：稀疏行只发射有非空单元格的行（原行号进 `sourceRow` 旁路，不参与主键）；隐藏行列默认参与比较并提示计数，提供「忽略隐藏」开关；多 sheet 按 sheet 名精确配对（大小写不敏感），不做跨 sheet 合并，多选时逐 sheet 独立出结果并汇总；主键列与合并区相交时解析层直接报可操作错误，不产出误导性 added/removed。
- **工作台接入（`src/renderer/src/workbench/xlsxCompare.ts` + `src/renderer/src/views/XlsxCompareView.tsx`，已落地）**：扩展名白名单唯一入口 `src/shared/fileExtensions.ts`（`XLSX_FILE_EXTENSIONS` = `xlsx` / `xlsm`；`.xls` / `.xlsb` 仍拒），`openFilePairSession` 见到 `family === 'xlsx'` 即转 `openXlsxPairSession`，不走 CSV 文本分支。两侧严格顺序：左整本读完、逐表归一化后丢字节，再读右；预算取 `resolveXlsxBudget({tabCount, mode})`（默认 1 tab + dense），3 tab + 普通在读数前即拒绝。会话多存 `xlsx: { sheets, leftOnly, rightOnly, budget }`，`adhoc.tables` 镜像首张配对表以复用 CSV 四态与单元格高亮；`XLSX_LIMIT_EXCEEDED` 由 `filePairErrorMessage` 统一转「文件超出对比上限：<limit>」，不建 tab、不写会话状态。

## 验收

- ac-semantics-first：文档第一节为「语义边界」，①–⑤ 五项齐全且每项有可执行口径（无缓存值处理、锚点覆盖、样式不参与、由护栏反推的上限、日期/浮点/宏只读）；§1 ④ 对 §5 的引用须写成「上限（容器 / 累计解压字节 / 单 sheet / 共享字符串表）按 §5.1 由护栏反推，见 §5」。
- ac-selection-compare：至少三条依赖路径并列，每条都有 license、维护活跃度、包体、只读流式、内存放大五项；对 npm `xlsx` 0.18.5 / CVE-2023-30533 / 0.19.3 / 非 npm 官方源给出明确处置结论，并核无 eval / 动态代码执行。
- ac-supply：§2.2 含责任人、升级复跑五项断言（sha256-integrity / CVE 范围 / eval 扫描 / 六类单测 / 四态计数一致）、退自研触发（404 / 连续 30 天不可得 / 哈希失败）、不得回退 npm 0.18.5；§6 风险列已指向 §2.2。
- ac-mem-table：§5.1 含反推公式与基线数字（99.3 / 369.1 MiB、可用 1,200 MiB、容器按 10:1），四情形表逐格一致：允许解压 400 / 200 / 133 / 67 MiB，容器 40 / 20 / 13 / 7 MiB，峰值 1,300 / ≈1,569 MiB；并含双栏收紧 300 / 171 / 100 / 57 MiB 与「基线偏离 >10% 重算」一条。
- ac-512-removed：`grep -c "512 MiB"` 仅剩 §5.2 作废说明 1 行；`grep -c "40%"` 与 `grep -c "2–3× 解析放大"` 均为 0；§5.2 写明 512×3=1,536 > 1,300 的算术原因。
- ac-scope：§5.2 结论为默认单 tab + dense；3 tab 普通大表不支持；更大工作簿走临时文件 / 流式（M/L，不在 S 档）；S 档人日不变。
- ac-watermark：水位 = 启动基线 + 本情形预算；§5.5 定义与实现同源——`checkXlsxWatermark` 在 60% 把 warning 写进 `meta.warnings`（结果仍成功）、80% 立即中止并丢弃已产出对象（`XLSX_LIMIT_EXCEEDED`、无 rows），RSS 采样走可注入探针（默认探针只在宿主提供 `process.memoryUsage` 时取 rss，沙箱 renderer 下返回 0 并由中央目录解压字节数单独兜底，阈值不变），两态各一条单测；§5.5 另须写明双栏顺序解析与逼近上限 fixture 的四项回测断言（RSS 回落、会话状态未变、无部分渲染、`XLSX_LIMIT_EXCEEDED`）。
- ac-budget-table：`resolveXlsxBudget({tabCount, mode})` 对四情形逐格等于 300 / 171 / 100 / 57 MiB 与容器 40 / 20 / 13 / 7 MiB，且 3 tab + 普通返回 `supported: false` 而不给预算；断言直接绑定这些常量（改任一数字必红）。
- ac-tier3：容器 64 MiB、条目数 10,000、单条目 256 MiB、单 sheet 1,048,576 行 × 16,384 列与 2,000,000 非空单元格、sheet XML 256 MiB、共享字符串 1,000,000 条 / 256 MiB 各有实现与断言；§5.1 预算更紧处以预算为准（一条优先级用例）。
- ac-zipbomb：压缩比 >100:1 且解压后 >64 MiB 即判 zip bomb；容器 / 条目数 / 单条目 / 累计解压预算四类闸门各自命中均拒绝，判定在中央目录阶段完成（未解压即拒）。
- ac-error-shape：每个拒绝统一返回 `XLSX_LIMIT_EXCEEDED` 并带 `{ limit, observed }`，`limit` 指明被命中档位与阈值、`observed` 为实测值；拒绝路径不产出 rows、无部分结果、不写会话状态、不留半解析中间对象。
- ac-verify：§8 写明 `not-applicable` = 未运行、不是通过、不得写「全通过」，并逐条列出六类实现期单测；现行实现只覆盖其中四类（合并区、日期/浮点、隐藏行列、多 sheet 按名配对），zip bomb 与超限拒绝须由上限项补齐。
- ac-nonrectangular：稀疏行、隐藏行列、多 sheet 选择语义、合并区域对主键对齐影响四类都有结论。
- ac-core-pure：`parseXlsxTable` / `listSheets` / `parseXlsxSheet` / `matchXlsxSheets` 位于 `src/core/xlsx/`，零 Electron / DOM / React import，Node 环境 vitest 直接调用即出结果。
- ac-contract：返回 `{header, rows, meta}`，`header` 与所有 `rows` 单元格均为字符串；形状可直接喂 `alignCsvTables(left, right, keyColumns)` 而不做二次转换。
- ac-formula：只读缓存值（`cellFormula: false`），公式文本不参与；无缓存值的公式单元格按 `''` 入表且 `meta.uncachedFormulaCells` 等于实际计数。
- ac-merged：合并区只取左上锚点、区内其余单元格 `''`，`rows.length` 与未合并时一致，锚点所在行可正常作为主键列；`meta.mergedRanges` 记录区域。
- ac-date-float：1900 / 1904 两种基准、日期与时间格式均归一化为 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss`（无时区）；浮点按 15 位有效数字去尾零后与原值一致。
- ac-header-hidden-sheet：空表头按列字母补齐且按「首个同名保留」去重；隐藏行列在 `meta.hiddenRows` / `meta.hiddenColumns` 有标注且默认参与比较；多 sheet 按名（大小写不敏感）取表并列出两侧差集。
- ac-dep-pinned：`package.json` / lockfile 只引用 `file:vendor/xlsx-0.20.3.tgz`（源自官方 CDN 同版本 tarball），`vendor/xlsx-0.20.3.tgz.sha256` 记录 sha256，`xlsx-dep-integrity` 门禁在版本 / 哈希 / lockfile `integrity` / 安装版本任一不符时 fail；无 `xlsx@0.18.x` 残留，无运行期网络拉取、无第二个 xlsx 库。
- ac-tests-in-gates：合并区、日期/浮点、隐藏行列、多 sheet 名配对四类单测被 `.munk/code-gates.json` 的 `xlsx-parse-semantics` 跑到，全绿且不依赖默认 5 s 超时。
- ac-tests-red：四类超限（容器 / 条目数 / 单条目 / 累计解压预算）+ zip bomb + 两态水位共 ≥7 条单测，全部落在 `xlsx-limit-gate` 覆盖的文件内，每条断言绑定 §5 阈值常量（调松对应阈值该条必红）。
- ac-gates-worktree：`code_gates` 在已 install 的 worktree 内跑（或先 `pnpm install --frozen-lockfile`）；不得把主检出未安装依赖导致的红当产品回归上报。
- ac-baseline-notes：本域 `product.md` 同时含哈希一次性实证原文与环境 install 注意两条，且评估文档 §5 数字零改动。
- ac-no-static-eval：新增代码与 vendored 产物 `eval(` / `new Function` 静态扫描 0 命中，ESLint `no-eval` / `no-new-func` 保持开启。
- ac-align-untouched：`src/core/csv/align.ts` 零改动（`git diff` 不含该文件）。
- ac-tab-caliber：本文件 ④「四情形」标签须与 §5.1 的 3 tab 反推口径一致（并发 tab 数为 3，不是 2）；133 / 67 MiB 只在 3 tab 下成立（并发 2 tab 时每 tab 200 MiB、双栏 171 MiB），不得回退为两 tab 表述，其余数字（400 / 200 / 133 / 67、40 / 20 / 13 / 7、1,300 / ≈1,569、300 / 171 / 100 / 57）保持原样。
- ac-whitelist：扩展名白名单只在 `src/shared/fileExtensions.ts` 变更（`XLSX_FILE_EXTENSIONS` + `extensionFamily`）；`.xlsx` / `.xlsm` 入会话，`.xls` / `.xlsb` 与 `notes.xlsx.txt` 仍按原规则被拒，`src/shared/fileExtensions.test.ts` 两向断言。
- ac-four-state：真实 `.xlsx` / `.xlsm` 对经 `openXlsxPairSession` → `alignCsvTables` 得到与 CSV 一致的 same / added / removed / modified 计数与单元格高亮；`src/core/csv/align.ts` 零改动。
- ac-sequential：双栏解析严格顺序（左完成才起右），`onParse` 探针断言两侧不同时解析；1 tab 与 3 tab 各取对应预算，3 tab + 普通在读数前拒绝。
- ac-reject-ui：超限与 zip bomb 走同一文案入口「文件超出对比上限：<limit>」（`limit` 取错误自带档位 / 阈值），不建 tab、无部分渲染、会话状态不变，已有会话仍可切回。
- ac-formula-hidden：`meta.uncachedFormulaCells > 0` 显示「N 个公式无缓存值，按空比较」；隐藏行列默认参与且摘要给计数，「忽略隐藏行列」开关经 `applyXlsxHiddenPolicy` 重算（不重读文件）。
- ac-sheets：多 sheet 按名（大小写不敏感）配对，两侧差集单列，多选逐表各出四态，不合并成一张表。
- ac-six-classes：§8 六类单测（zip bomb / 四类超限 / 合并区 / 日期序列化 / 隐藏行列 / 多 sheet 按名配对）齐备全绿，并由 `xlsx-parse-semantics` / `xlsx-limit-gate` / `xlsx-workbench-gate` 三项在 `code_gates` 可见；W1 / W2 既有断言不得削弱。
- ac-baseline-lines：各域基线「不做 `.xlsx`」只改该行（`code-diff-merge` / `directory` / `workbench` / `structured` / `csv-align`），统一改为「xlsx 单表已纳入（值提取后复用 CSV 对齐）；仍不做公式求值 / 样式·批注·条件格式 diff / 合并区逐格展开 / `.xls` BIFF」，其余段落与数字零改动。
- ac-no-public-claim：README、Issue、对外文案零改动，不出现「已支持 xlsx」。
- ac-renderer-no-node-globals：出厂构建（`pnpm build`，`contextIsolation:true / nodeIntegration:false / sandbox:true`）的真实窗口打开任一 `.xlsx` / `.xlsm` 对不再出现 `Buffer is not defined` / `process is not defined`，能建 tab 出 panel；`src/core/xlsx/**` 内 UTF-8 解码统一走 `TextDecoder`，RSS 探针在 `process` 缺失时降级为 0 而不是抛错。
- ac-static-guard：`src/xlsx-dep-gate.test.ts` 静态守卫扫描 `src/core/xlsx/**` 与 renderer 直接 import 的 `@core/*` 模块，出现 `Buffer` / `process.` 即 fail 并报 `file:line`；当前树必 pass、注入 Node 全局的构造样例必 fail，且该守卫只在既有门文件内扩展（不新开门文件）。
- ac-parity：xlsx 六类单测与全量 `code_gates` 自绿；同一夹具四态计数（Data 24/1/1/5、Notes 7/0/0/1、Sheet1 296/0/0/3、Merge 3/0/0/1、Hidden 4/0/0/2）与修复前逻辑层实测一致。
- ac-limits-intact：超限 / zip bomb 仍以 `XLSX_LIMIT_EXCEEDED` 拒绝、文案含「文件超出对比上限」、不部分渲染、不写会话状态；四情形预算与水位阈值零改动。

## 非目标

- 上限三档、zip bomb 与运行时水位已由 `wi_intake_b61f0a79e2e7df93` 在 `src/core/xlsx/limits.ts` 独立交付；本域不再接受会话层另写一套阈值。
- 工作台接入已由 `wi_intake_892f6a7dfaf916c2` 交付（扩展名白名单、会话入口、`XlsxCompareView` 摘要 / 开关 / 逐表四态）；本域后续不再接受第二套扩展名判定或 UI 侧阈值判断，对外文案仍不得写「已支持 xlsx」。
- 不做公式求值、样式 / 批注 / 条件格式 diff、合并区逐格展开、多 sheet 合并成一张表、`.xls` BIFF、流式 / 临时文件解析、多 sheet 自动配对 UI。
- 不改 `src/core/csv/align.ts`，不改 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md` 的任何数字。
- 不新增第二个 xlsx 库、不回退 npm `xlsx` 0.18.x、不做 CDN 运行期拉取或冷启动联网。
- 不引入 nodePolyfills / `Buffer` shim 之类把 Node 全局塞回 renderer 的折中；也不用「把 xlsx 解析整体搬到 main 再经 IPC 暴露」的替代路径（最小改法已可跑通）。

## 实现约束

- 判定只写一处：所有解析语义收敛在 `src/core/xlsx/` 纯函数层，上层不得各写一套。
- 解析层零 Electron / DOM / React 依赖（ESLint `no-restricted-imports` 强制），Node 下 vitest 直测。
- **renderer 安全**：`src/core/xlsx/**` 及 renderer 直接 import 的 `@core/*` 只用渲染层可用 API（`TextDecoder` / `TextEncoder` / Worker），不引用 `Buffer` / `process` 等 Node 全局；`node:zlib` 在渲染层不可用时由 SheetJS 纯 JS raw inflater（`CFB.utils._inflateRaw`）兜底，兜底也不可用才退化为「读不到表头属性」（不跳过其余上限判定）。
- 依赖钉版走 vendored tarball：`vendor/xlsx-0.20.3.tgz`（官方 CDN `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`）+ 同目录 `.sha256` 记录，`package.json` 写 `file:vendor/xlsx-0.20.3.tgz`，lockfile 记同 `integrity`；`src/xlsx-dep-gate.test.ts` 复核版本 / sha256 / 字节数 / 安装版本，断网亦可复现。
- 只走 `XLSX.read` 纯数据 API：`cellFormula: false`、`bookVBA: false`、`dense: true`；ESLint `no-eval` / `no-new-func` 保持开启，vendored 产物与新增代码静态扫描 0 命中。
- 测试样本在测试内用依赖自身生成或极小夹具，不新增仓库级大样本、不把二进制夹具塞进 `docs/`；测试不依赖默认 5 s 超时。
- 新增门禁项只能插在既有纯单测块尾部、`verify-release-gate` / `test-debt-gate` 之前，并同一次提交同步 `src/munk-gates.test.ts` 期望矩阵（口径归 `quality-gates`）。
- 证据路径须能在 Host 提供的工作树复核；引用评估文档数字时逐格照抄，不自行换算。
- **依赖哈希来源实证（一次性）**：「sha256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` / 2,409,319 B，于 2026-11-18 与 `cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` 原件实测一致（公司负责人复核）」；仓内 `src/xlsx-dep-gate.test.ts` 的哈希断言只能防漂移、来源由该实证背书，**不加联网 CI 腿**。
- **环境注意**：主检出未 `pnpm install` 时直接跑 `pnpm test src/core/xlsx/*` 会红属环境陈旧（非产品回归），后续 `code_gates` 一律跑在已 install 的 worktree，或先 `pnpm install --frozen-lockfile`。

## 最近交付证明

- WI：`wi_intake_56e94a818c731f15`（修出厂构建里 xlsx 打不开：renderer 侧 Buffer / process 未定义）
- 结果：`code_gates` 36 门全绿（attempt 002，含 `xlsx-parse-semantics` / `xlsx-dep-integrity` / `xlsx-limit-gate` / `xlsx-workbench-gate`）。
- 覆盖摘要：`src/core/xlsx/limits.ts` 的 `Buffer.from(...).toString('utf8')` 全部换为共享 `TextDecoder('utf-8')`，表头 inflate 在 `node:zlib` 不可用时改用 SheetJS 纯 JS `CFB.utils._inflateRaw` 兜底（不再整段跳过表头属性读取）；`src/core/xlsx/parse.ts` 的 RSS 探针改为可选 `process.memoryUsage`，缺失即返回 0，由中央目录解压字节数单独兜底，阈值零改动；`src/xlsx-dep-gate.test.ts` 新增 renderer 可达模块扫描（`src/core/xlsx/**` + renderer 直接 import 的 `@core/*`），命中 `Buffer` / `process.` 报 `file:line`，含「当前树为空」与「注入样例必红」两向断言，`repoTestLines` 53,501 → 53,579（`addedCases` 3）。`src/core/csv/align.ts`、四情形预算与 `XLSX_LIMIT_EXCEEDED` 文案零改动。
- 注：change pack 无 `tech.md` / `ux/**` / `tests/cases/**`，本轮 tech/ux 与 QA fold 无源文件可折；`.munk/code-gates.json` 未新增门项（守卫挂在既有 `xlsx-dep-integrity` 覆盖的测试文件内）。
