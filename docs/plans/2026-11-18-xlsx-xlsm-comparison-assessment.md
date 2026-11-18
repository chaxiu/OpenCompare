# xlsx / xlsm 对比解析技术方案评估（2026-11-18）

> **结论先行**：选 SheetJS CE，但**换发行源**——用 SheetJS 官方 CDN 的 `xlsx` 0.20.3 tarball（锁版本 + sha256），不用 npm 上的 0.18.5；解析器只作「值提取前置层」，产出 `{header, rows}` 后复用 `alignCsvTables`；`.xlsm` 只读数据、绝不求值公式；工作量档 **S（3–5 人日，非排期承诺）**。
> 本文只做评估：不含实现、未安装依赖、未改 `src/` `package.json` lockfile CI 测试；网络仅做只读 metadata 与 tarball 静态检查。

## 1. 语义边界（先定语义，再谈选型）

| # | 边界 | 可执行口径（实现时按此判定，不留解释空间） |
| --- | --- | --- |
| ① | 公式 | 只读 `<c><v>` 缓存值，`cellFormula: false`，**不求值、不解析公式文本**；无缓存值时统一按空字符串 `''` 处理（与 CSV 空单元格同义），并在解析摘要里记 `uncachedFormulaCells` 计数，非 0 时 UI 提示「N 个公式无缓存值，按空比较」。 |
| ② | 合并单元格 | 以合并区左上锚点值为唯一值，区内其余单元格一律置 `''`；**不做拆分扩展**（不把锚点值复制到区内每格，避免与 csv 行语义冲突）；行对齐只依赖锚点行，故合并区不改变行数，`rows.length` 恒等于「出现过数据的行数」。 |
| ③ | 样式 / 共享字符串 | 样式（`styles.xml`、字体、填充、条件格式、批注）**不参与 diff**；`sharedStrings.xml` 仅作值解析中间层，解析后立即丢弃索引表，只把字符串值落进 `rows`，且不留 `s=` 属性痕迹。 |
| ④ | 体积与内存 | 三档上限（解压后总字节 / 单 sheet 行列 / 共享字符串表，外加容器闸门）见 §5，数值全部对齐 `docs/perf/large-directory-memory.md:107` 的 `real` 档护栏（renderer ready 峰值 ≤ 1.5 GiB / app 总峰值 ≤ 2.5 GiB / +20 s 静置 renderer ≤ 1300 MiB = 1363148800 B）；超限一律**拒绝解析并报错**，不做「尽力截断」。 |
| ⑤ | 数字与日期 | 日期按「序列号 + 数字格式串」归一化：先按工作簿 `date1904` 标记判定基准（1900/1904），再据 `numFmt` 判定是否日期/时间，统一输出 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`（无时区）；浮点统一 `toPrecision(15)` 后去尾零再 diff（Excel 自身精度即 15 位有效数字）；`.xlsm` 一律只读数据，**绝不执行宏**，遇 VBA 工程一律 `bookVBA: false` 跳过；若调研中出现「必须执行宏才能取到值」的情形，直接排除该文件类型，不做降级。 |

## 2. 依赖选型：三条路径并列比较

| 维度 | A. SheetJS CE（npm `xlsx` / CDN） | B. `exceljs` | C. 自研 zip + XML |
| --- | --- | --- | --- |
| license | Apache-2.0（npm 0.18.5 metadata、CDN 0.20.3 `LICENSE` 一致） | MIT | 自有代码，无第三方（仅 Node 内置 `zlib`） |
| 维护活跃度 | npm 最新仍 0.18.5（2022-03-24）；GitHub `SheetJS/sheetjs` 36,340 star、最后 push 2024-04-18；CDN 上有 0.19.3 / 0.20.1–0.20.3 | npm 最新 4.4.0（2023-10-19）；GitHub `exceljs/exceljs` 15,518 star、最后 push 2025-01-21、开放 issue 828——**主线久未发版** | 由本仓维护，节奏自控；但需自己跟 OOXML 语义 |
| 包体大小 | tgz 2,409,319 B，解包 7.8 MiB（`xlsx.mjs` 1,008,308 B + `dist/` 多份 bundle） | tgz 4,716,975 B，解包 21.8 MiB；传递依赖 9 个（jszip / unzipper / saxes / archiver / fast-csv / readable-stream / tmp / uuid / dayjs） | 0 依赖新增（`zlib` 内置）；自研代码约 2–4 k 行 |
| 只读流式解析 | `XLSX.read(buffer)` 需整包 buffer；CE 无 XLSX 流式读（`XLSX.stream` 仅覆盖 CSV 输出），只能靠 `dense: true` 降对象开销 | 有 `WorkbookReader` 流式读，但共享字符串/超限样式会落临时文件（依赖 `tmp`），首开磁盘 IO 明显 | 天然可流式：中央目录 → 逐条 `inflateRaw` → 增量 tokenizer，单 sheet 可边解边转 `rows` |
| 内存放大特征 | 解压后 XML 的 3–6×（共享字符串表 + 每 cell 对象 + `!ref` 矩形展开；`dense` 可降到约 2–3×） | 解压后约 3–5×，外加临时文件磁盘占用；大 sheet 的 model 层对象最重 | 最低，约 1–2×（只保留当前行 + 归一化后的字符串值） |

### 2.1 npm `xlsx` 长期停在 0.18.5 / CVE-2023-30533 的正面结论

- 事实（2026-11-18 只读复核）：`registry.npmjs.org/xlsx` 的 `dist-tags.latest` 仍是 `0.18.5`（2022-03-24 发布），npm 上**不存在** 0.19.x；`CVE-2023-30533`（GitHub Advisory `GHSA-4r6h-8v6p-xvw6`，severity high，2023-04-24 公开）受影响范围 `< 0.19.3`，即 npm 官方源上的任何版本都受影响；SheetJS 自 0.18.5 后只在自有 CDN 发版，`cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` 返回 200，0.20.4 及以上探测 404（当前最新 0.20.3）。
- **处置结论：换发行源（不走 npm 官方源）**——`package.json` 用 CDN tarball URL + pnpm `integrity`/lockfile 锁死 0.20.3，并在 CI 里校验 tarball sha256；理由：修好的版本只在 CDN，换库（exceljs）引入维护停滞与 22 MiB 包体，自研（路径 C）成本高一个量级；换源是唯一「小 diff + 覆盖 CVE」的选择。若 CDN 不可得，则退到自研路径 C，**不得**回退到 npm 0.18.5。
- **无 eval / 无动态代码执行**：静态扫描 CDN 0.20.3 的 `xlsx.mjs` 与 `dist/xlsx.full.min.js`，`eval(` 与 `new Function` 命中均为 **0**；同法扫描 `exceljs@4.4.0` 的 `lib/` 亦为 0。判定依据仅到「包内文本无动态执行入口」，故实现阶段仍需：① tarball 哈希固定；② ESLint `no-eval` / `no-new-func` 保持开启；③ 解析只用 `XLSX.read` 的纯数据 API，不开 `bookVBA`、不注册任何 eval 类编码器。

## 3. 「表格不是矩形」：四类结论

| 情形 | 结论 | 推荐口径 |
| --- | --- | --- |
| 稀疏行（中间整行空白 / 行号跳跃） | 空白行不产生数据行；行号跳跃不得补空行占位（否则两侧行对齐全错） | 只发射「区域内至少一个非空单元格」的行；原 Excel 行号写入每行的旁路元数据（`sourceRow`），仅用于定位跳转，**不参与主键**；相邻列尾部空列裁到两侧最大非空列为止。 |
| 隐藏行列 | 隐藏属性不是数据，不能静默丢弃 | 默认**参与比较**（漏改比多噪声更贵），但状态栏提示「存在 N 个隐藏行 / M 个隐藏列」；隐藏状态本身不进 diff；提供「忽略隐藏行/列」开关，开关状态写进对比设置并在结果头部回显。 |
| 多 sheet 选择语义 | 不做跨 sheet 合并，也不默认取第一个 sheet | 默认按 **sheet 名精确配对**（大小写不敏感，命不中时退回同名归一化）；两侧差集作为「新增 / 删除 sheet」结构差异列出；用户选中单个 sheet 时只比该 sheet，多选时逐 sheet 独立出结果，汇总计数相加，不做行级跨表对齐。 |
| 合并区域对主键对齐的影响 | 主键列落在合并区非锚点格 → 该侧 key 为空，会整段错配 | 取锚点值后按 §1② 处理；若用户选中的 key 列与任一合并区相交，解析层直接报可操作错误（提示合并区坐标与改选建议），不进入 `alignCsvTables` 产出误导性 added/removed；key 列与合并区不相交时正常对齐。 |

## 4. 与 `src/core/csv/align.ts` 的复用边界

- 复用点：`alignCsvTables(left, right, keyColumns)`（`src/core/csv/align.ts:195-199`）入参为 `CsvTableData = { header: readonly string[]; rows: readonly (readonly string[])[] }`（同文件 `:15-18`），零 Electron/DOM 依赖；xlsx 解析**只作前置层**，输出规范化 `{header, rows}` 后原样复用，不改 `align.ts`。
- 适配缺口（只描述，本单不实现）：① 类型缺口——`CsvTableData` 只收字符串，数值/日期必须在解析层先归一化成字符串（§1⑤），不能把 `number | Date` 直接塞进去；② 入口缺口——现有入口是 `parseCsvTable`（`src/renderer/src/workbench/session.ts:124-129`，Papa.parse 文本→表），xlsx 需要并列的 `parseXlsxTable(bytes)` 返回同一结构，再由会话层二选一，`align.ts` 不知道来源；③ 表头缺口——`indexHeader` 保留**首个**同名表头（`align.ts:107-113`），xlsx 空表头需按列字母（`A`/`B`…）补齐并去重，否则空名会塌成一列；④ 上限缺口——三档上限与 zip bomb 判定放在解析层入口（读取 bytes 之前/解压每个条目时），**不进** `align.ts`（纯函数不承担 IO 预算）。
- 位置建议：新解析层放 `src/core/`（纯函数、可在 Node 单测）但要把它与 `align.ts` 的衔接点收在会话层一个函数里，避免两处各写一套判定（对应根仓「可执行判定共用同一纯函数」硬约束）。

## 5. 体积 / 内存三档上限（+ 容器闸门）与 zip bomb 拒绝策略

| 档位 | 上限 | 与护栏的关系 |
| --- | --- | --- |
| 容器 | 单文件压缩包 ≤ 64 MiB；zip 条目数 ≤ 10,000；单条目解压 ≤ 256 MiB | 输入闸门，未解压即拒绝，不产生 renderer 峰值 |
| 解压后 | 全部条目解压字节合计 ≤ 512 MiB（0.5 GiB） | 占静置护栏 1300 MiB 的 40% 以内，留出 2–3× 解析放大余量 |
| 单 sheet | ≤ 1,048,576 行 × 16,384 列，且非空单元格 ≤ 2,000,000，单 sheet XML ≤ 256 MiB | 超限在流式解析途中即中断，已产出部分丢弃 |
| 共享字符串表 | ≤ 1,000,000 条且 ≤ 256 MiB | 表本身不进结果，只取被引用项 |

- zip bomb 判定：条目解压/压缩比 > 100:1 且解压后 > 64 MiB → 拒绝；命中条目数上限、单条目上限、总解压上限任一 → 拒绝。
- 拒绝策略：统一抛 `XLSX_LIMIT_EXCEEDED` 一类错误，带 `{ limit, observed }`；UI 只显示「文件超出对比上限：<limit>」，**不截断、不降级、不部分渲染**；拒绝路径不写入任何会话状态，返回后工作台保持打开前状态。整体内存预算对齐 `docs/perf/large-directory-memory.md:107`（app 总峰值 ≤ 2.5 GiB = 2684354560 B）与 `docs/lessons.md:80`（+20 s 静置 renderer ≤ 1300 MiB）。

## 6. 工作量估算（**非排期承诺**，仅供负责人决策）

| 路径 | 档位 | 人日区间 | 主要风险点 |
| --- | --- | --- | --- |
| A. SheetJS CE + CDN 0.20.3 | **S** | 3–5 | 非 npm 源供应审计与哈希锁定；无 XLSX 流式，大表内存放大 3–6×，须靠 §5 上限兜底；CDN 版本线需人工跟随 |
| B. exceljs 4.4.0 | **M** | 6–10 | 主线 2023-10 后未发版、828 open issue，CVE 修复无人背书；流式读落 `tmp` 磁盘，首开抖动；包体 21.8 MiB |
| C. 自研 zip + XML | **L** | 15–25 | OOXML 语义面大（sharedStrings / styles / numFmt / 1904 / merged / rels / 表头空列）；需自建 fixture 与 fuzz；收益只有内存与可控性 |

## 7. 证据与复核

- 仓内：`src/core/csv/align.ts:15-18`（`CsvTableData`）、`:107-113`（`indexHeader` 取首个同名）、`:195-199`（`alignCsvTables`）；`src/renderer/src/workbench/session.ts:124-129`（`parseCsvTable`）；`docs/perf/large-directory-memory.md:107`（1,300 MiB / 2.5 GiB 阈值表）；`docs/lessons.md:80`。
- 网络只读探测（2026-11-18）：`registry.npmjs.org/xlsx` latest=0.18.5、0.18.5 发布 2022-03-24、Apache-2.0；`registry.npmjs.org/exceljs` latest=4.4.0（2023-10-19）、MIT、解包 21,825,509 B；GitHub API `SheetJS/sheetjs` 36,340 star / push 2024-04-18、`exceljs/exceljs` 15,518 star / push 2025-01-21 / 828 open issue；`api.github.com/advisories/GHSA-4r6h-8v6p-xvw6` → `CVE-2023-30533` high、受影响 `< 0.19.3`、2023-04-24 公开；`cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` HTTP 200（0.20.4 起 404）。
- 包体与 eval 扫描来自解包到临时目录的 tarball 静态检查（`xlsx.mjs` 命中 0、`dist/xlsx.full.min.js` 命中 0、`exceljs/lib` 命中 0），**未装入仓库**，`package.json` / lockfile / `node_modules` 无任何变化。
- 本单交付：`git diff --stat` 应只出现本文件（新增 1 个文件）。
