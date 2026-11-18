# Domain: spreadsheet-compare

xlsx / xlsm（Excel OOXML 表格）对比解析的**方案评估域**。本轮只交付评估结论（`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`）：冻结语义边界、选型与发行源结论、体积/内存闸门与 `alignCsvTables` 复用边界。解析实现**尚未落地**，`csv-align` / `structured` / `workbench` / `directory` 现有「不做 `.xlsx`」非目标在实现类 WI 通过前继续有效。

## 范围

- **评估文档（本轮 Sole 交付物）**：`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`，中文、表格化、结论先行、≤120 行（实际 72 行），按「语义边界 → 选型 → 非矩形 → 复用边界 → 上限 → 工作量 → 证据」排序。
- **语义边界（后续实现的可执行口径，本轮冻结）**：
  - ① 公式：只读 `<c><v>` 缓存值（`cellFormula: false`），不求值、不解析公式文本；无缓存值统一按 `''` 处理，解析摘要记 `uncachedFormulaCells`，非 0 时 UI 提示「N 个公式无缓存值，按空比较」。
  - ② 合并单元格：只取合并区左上锚点值，区内其余格一律 `''`；不做拆分扩展（不把锚点值复制到每格），行数不变。
  - ③ 样式 / 共享字符串：样式（`styles.xml`、字体、填充、条件格式、批注）不参与 diff；`sharedStrings.xml` 仅作值解析中间层，解析后丢弃索引表，不留 `s=` 痕迹。
  - ④ 体积与内存：三档上限 + 容器闸门，数值对齐 `docs/perf/large-directory-memory.md:107` 的 `real` 档护栏（renderer ready 峰值 ≤ 1.5 GiB、app 总峰值 ≤ 2.5 GiB、+20 s 静置 renderer ≤ 1300 MiB）；超限一律拒绝解析，不截断、不降级。
  - ⑤ 数字与日期：日期按 `date1904` 基准 + `numFmt` 判定后归一化为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`（无时区）；浮点 `toPrecision(15)` 后去尾零再 diff；`.xlsm` 一律只读数据、绝不执行宏（`bookVBA: false`），「必须执行宏才能取值」的文件类型直接排除。
- **选型结论**：选 SheetJS CE，但**换发行源**——用 SheetJS 官方 CDN 的 `xlsx` 0.20.3 tarball（锁版本 + sha256，CI 校验），不用 npm 上的 0.18.5；CDN 不可得时退到自研 zip+XML，禁止回退 npm 0.18.5。三路径（SheetJS CE / exceljs 4.4.0 / 自研）已并列比较 license、活跃度、包体、只读流式、内存放大。
- **`alignCsvTables` 复用边界**：xlsx 解析只作前置层，输出 `{header, rows}` 后原样复用 `src/core/csv/align.ts`，不改 `align.ts`；四处缺口（类型只收字符串、需并列 `parseXlsxTable(bytes)` 入口、空表头按列字母补齐去重、上限与 zip bomb 判定在解析层入口）只描述不实现。
- **非矩形四类结论**：稀疏行只发射有非空单元格的行（原行号进 `sourceRow` 旁路，不参与主键）；隐藏行列默认参与比较并提示计数，提供「忽略隐藏」开关；多 sheet 按 sheet 名精确配对（大小写不敏感），不做跨 sheet 合并，多选时逐 sheet 独立出结果并汇总；主键列与合并区相交时解析层直接报可操作错误，不产出误导性 added/removed。

## 验收

- ac-doc-only：交付 diff 只新增 1 个文档文件，无 `src/`、`package.json`、lockfile、CI、测试改动，可用 `git diff --stat` 复核。
- ac-semantics-first：文档第一节为「语义边界」，①–⑤ 五项齐全且每项有可执行口径（无缓存值处理、锚点覆盖、样式不参与、三档上限、日期/浮点/宏只读）。
- ac-selection-compare：至少三条依赖路径并列，每条都有 license、维护活跃度、包体、只读流式、内存放大五项；对 npm `xlsx` 0.18.5 / CVE-2023-30533 / 0.19.3 / 非 npm 官方源给出明确处置结论，并核无 eval / 动态代码执行。
- ac-nonrectangular：稀疏行、隐藏行列、多 sheet 选择语义、合并区域对主键对齐影响四类都有结论。
- ac-limits-effort：三档上限与 zip bomb / 超限拒绝策略齐全并引用 1,300 MiB / 2.5 GiB 护栏；工作量按 S/M/L + 人日区间 + 风险点，且带「非排期承诺」。
- ac-no-install：无依赖安装痕迹（`package.json`、lockfile、`node_modules` 均不变）。

## 非目标

- 不写任何 xlsx 解析实现、原型或 spike 代码；不安装依赖；不接 UI、不改扩展名白名单。
- 不承诺版本、时间或是否进 roadmap；不改 AGENTS 反范围与各域基线里的「.xlsx 不做」口径（决策未获批前保持现状）。
- 不发对外回帖（issue #1 由运营任务另派一次，文案基于本文档）。

## 实现约束

- 证据路径与行号须能在 Host 提供的工作树复核；网络只允许只读查询（npm metadata / 公告 / tarball 静态检查），拿不到就写「未联网复核 + 依据来源」，不得编造版本号、CVE 编号或维护活跃度。
- 文档 ≤120 行、中文、表格化比较、结论先行；预算 ≤4M token、≤60 分钟。
- 后续实现若获批：解析层放 `src/core/`（纯函数、零 Electron/DOM/React，Node 下可 vitest 直测），与 `align.ts` 的衔接收在会话层一个函数里，可执行判定（上限、门禁）共用同一纯函数，不两处各写一套。
- tarball 哈希固定 + ESLint `no-eval` / `no-new-func` 保持开启；只走 `XLSX.read` 纯数据 API，不开 `bookVBA`、不注册 eval 类编码器。

## 最近交付证明

- WI：`wi_intake_8596d9bd1aa25b79`（xlsx/xlsm 对比解析技术方案评估，doc-only）
- 日期：2026-11-18
- 结果：code_gates passed。
- 覆盖摘要：新增 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`（72 行），交付 §1 语义边界 ①–⑤、§2 三路径并列比较与 CVE 换源结论（含 `eval(` / `new Function` 静态扫描 0 命中）、§3 非矩形四类、§4 `alignCsvTables` 复用边界与四处缺口、§5 三档上限与 zip bomb 拒绝、§6 S/M/L 估算（非排期承诺）、§7 证据与复核路径。无 `src/`、`package.json`、lockfile、CI、测试改动。
- 注：change pack 未提供 `tech.md` / `ux/**`，本轮 tech/ux fold 跳过；本单无 `tests/cases/**`，QA fold 无源文件。
