# Domain: spreadsheet-compare

xlsx / xlsm（Excel OOXML 表格）对比解析的**方案评估域**。只交付评估结论（`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`）：冻结语义边界、选型与发行源结论、由静置护栏反推的体积/内存上限、供应链责任与验证边界，以及 `alignCsvTables` 复用边界。解析实现**尚未落地**，`csv-align` / `structured` / `workbench` / `directory` 现有「不做 `.xlsx`」非目标在实现类 WI 通过前继续有效。

## 范围

- **评估文档（本域 Sole 交付物）**：`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`，中文、表格化、结论先行（当前 122 行），按「语义边界 → 选型与供应链 → 非矩形 → 复用边界 → 上限 → 工作量 → 证据 → 验证边界」排序。
- **语义边界（后续实现的可执行口径，本轮冻结）**：
  - ① 公式：只读 `<c><v>` 缓存值（`cellFormula: false`），不求值、不解析公式文本；无缓存值统一按 `''` 处理，解析摘要记 `uncachedFormulaCells`，非 0 时 UI 提示「N 个公式无缓存值，按空比较」。
  - ② 合并单元格：只取合并区左上锚点值，区内其余格一律 `''`；不做拆分扩展（不把锚点值复制到每格），行数不变。
  - ③ 样式 / 共享字符串：样式（`styles.xml`、字体、填充、条件格式、批注）不参与 diff；`sharedStrings.xml` 仅作值解析中间层，解析后丢弃索引表，不留 `s=` 痕迹。
  - ④ 体积与内存：上限（容器 / 累计解压字节 / 单 sheet / 共享字符串表）按 §5.1 **由 1,300 MiB 静置护栏反推**，不是任意常数。反推口径：基线 renderer 99.3 MiB、appTotal 369.1 MiB（`docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json` 的 `samples[0].phase=startup`），renderer 可用 1,200 MiB 与 app 可用 2,191 MiB 取小 → 预算由 renderer 侧 1,200 MiB 约束；公式为 D = 1,200 MiB ÷ 并发 tab 数 ÷ 最坏放大倍数（dense 3× / 普通 6×），容器体积按约 10:1 估算、判定以逐条目 inflate 累计字节为准。四情形（1 tab dense / 1 tab 普通 / 2 tab dense / 2 tab 普通）允许解压 400 / 200 / 133 / 67 MiB，容器 40 / 20 / 13 / 7 MiB，峰值 renderer 1,300 MiB、app ≈1,569 MiB；双栏对比两侧顺序解析再收紧至 300 / 171 / 100 / 57 MiB，基线偏离 >10% 须重算。超限一律拒绝解析，不截断、不降级、不部分渲染。
  - ⑤ 数字与日期：日期按 `date1904` 基准 + `numFmt` 判定后归一化为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`（无时区）；浮点 `toPrecision(15)` 后去尾零再 diff；`.xlsm` 一律只读数据、绝不执行宏（`bookVBA: false`），「必须执行宏才能取值」的文件类型直接排除。
- **选型结论**：选 SheetJS CE，但**换发行源**——用 SheetJS 官方 CDN 的 `xlsx` 0.20.3 tarball（锁版本 + sha256，CI 校验），不用 npm 上的 0.18.5；CDN 不可得时退到自研 zip+XML，禁止回退 npm 0.18.5。三路径（SheetJS CE / exceljs 4.4.0 / 自研）已并列比较 license、活跃度、包体、只读流式、内存放大。
- **供应链责任（§2.2）**：责任人为本产品负责人，maintain 态随月度巡检只读探测 CDN 版本线（只记录、不自动升级），纳入开发后由该项实现负责人承接；任何升级须负责人批准并作为独立工作项，升级前复跑五项断言（sha256 与 lockfile `integrity` 一致 / 对照 Advisory 确认不在 `CVE-2023-30533` 范围 `< 0.19.3` / `xlsx.mjs` 与 `dist/*.js` 的 `eval(`、`new Function` 扫描 0 命中 / §8 六类解析层单测全绿 / 典型样本四态计数与升级前逐项一致）；退自研触发 = 巡检 404 或连续 30 天 CDN 不可得或哈希校验失败且无官方替代源，期间不得回退 npm 0.18.5。§6 风险列已指向 §2.2。
- **验证边界（§8）**：本文是评估交付、零代码改动，本单适用门禁项为 0，Host 记的 `not-applicable` 只表示「未运行」，**不是通过、不是合规证据**，不得对外写成「32 门全通过」。将来开工时解析层必须进 `code_gates` 的六类自动化单测：zip bomb 拒绝、四类超限拒绝（含 `{limit, observed}`）、合并区覆盖、日期序列化往返、隐藏行列、多 sheet 按名配对；六类未全绿前不得把 xlsx 支持写成「已支持」。
- **`alignCsvTables` 复用边界**：xlsx 解析只作前置层，输出 `{header, rows}` 后原样复用 `src/core/csv/align.ts`，不改 `align.ts`；四处缺口（类型只收字符串、需并列 `parseXlsxTable(bytes)` 入口、空表头按列字母补齐去重、上限与 zip bomb 判定在解析层入口）只描述不实现。
- **非矩形四类结论**：稀疏行只发射有非空单元格的行（原行号进 `sourceRow` 旁路，不参与主键）；隐藏行列默认参与比较并提示计数，提供「忽略隐藏」开关；多 sheet 按 sheet 名精确配对（大小写不敏感），不做跨 sheet 合并，多选时逐 sheet 独立出结果并汇总；主键列与合并区相交时解析层直接报可操作错误，不产出误导性 added/removed。

## 验收

- ac-semantics-first：文档第一节为「语义边界」，①–⑤ 五项齐全且每项有可执行口径（无缓存值处理、锚点覆盖、样式不参与、由护栏反推的上限、日期/浮点/宏只读）；§1 ④ 对 §5 的引用须写成「上限（容器 / 累计解压字节 / 单 sheet / 共享字符串表）按 §5.1 由护栏反推，见 §5」。
- ac-selection-compare：至少三条依赖路径并列，每条都有 license、维护活跃度、包体、只读流式、内存放大五项；对 npm `xlsx` 0.18.5 / CVE-2023-30533 / 0.19.3 / 非 npm 官方源给出明确处置结论，并核无 eval / 动态代码执行。
- ac-supply：§2.2 含责任人、升级复跑五项断言（sha256-integrity / CVE 范围 / eval 扫描 / 六类单测 / 四态计数一致）、退自研触发（404 / 连续 30 天不可得 / 哈希失败）、不得回退 npm 0.18.5；§6 风险列已指向 §2.2。
- ac-mem-table：§5.1 含反推公式与基线数字（99.3 / 369.1 MiB、可用 1,200 MiB、容器按 10:1），四情形表逐格一致：允许解压 400 / 200 / 133 / 67 MiB，容器 40 / 20 / 13 / 7 MiB，峰值 1,300 / ≈1,569 MiB；并含双栏收紧 300 / 171 / 100 / 57 MiB 与「基线偏离 >10% 重算」一条。
- ac-512-removed：`grep -c "512 MiB"` 仅剩 §5.2 作废说明 1 行；`grep -c "40%"` 与 `grep -c "2–3× 解析放大"` 均为 0；§5.2 写明 512×3=1,536 > 1,300 的算术原因。
- ac-scope：§5.2 结论为默认单 tab + dense；3 tab 普通大表不支持；更大工作簿走临时文件 / 流式（M/L，不在 S 档）；S 档人日不变。
- ac-watermark：§5.5 写明水位线定义、60% warning / 80% 中止并丢弃已产出、双栏顺序解析、逼近上限 fixture 的四项回测断言（RSS 回落、会话状态未变、无部分渲染、`XLSX_LIMIT_EXCEEDED`）。
- ac-verify：新增 §8，写明 `not-applicable` = 未运行、不是通过、不得写「32 门全通过」，并逐条列出六类实现期单测。
- ac-nonrectangular：稀疏行、隐藏行列、多 sheet 选择语义、合并区域对主键对齐影响四类都有结论。
- ac-surface：`git diff --stat` 只有 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md` 一个文件；`src/`、`package.json`、lockfile、CI、测试、`docs/perf/evidence/*` 零改动，无依赖安装痕迹。

## 非目标

- 不写任何 xlsx 解析实现、原型或 spike 代码；不安装依赖；不接 UI、不改扩展名白名单。
- 不承诺版本、时间或是否进 roadmap；不改 AGENTS 反范围与各域基线里的「.xlsx 不做」口径（决策未获批前保持现状）。
- 不发对外回帖（issue #1 由运营任务另派一次，文案基于本文档）；不改 Issue #1 回帖口径、不再向其发评论或改标签。
- 不重写 §1–§4 的语义结论（§1 ④ 仅改 §5 引用）；不改 §7 既有证据数字；不为本文档新增网络探测或补充实测数据。

## 实现约束

- 证据路径与行号须能在 Host 提供的工作树复核；网络只允许只读查询（npm metadata / 公告 / tarball 静态检查），拿不到就写「未联网复核 + 依据来源」，不得编造版本号、CVE 编号或维护活跃度。
- 中文、表格化比较、结论先行；术语与既有文档一致（静置、四态、护栏、解压预算）。
- 表格数字必须逐格照抄 PRD 给定值，不得自行换算、四舍五入成其它数，不得新增未给出的峰值 / 压缩比数字；术语沿用既有口径（静置、四态、护栏、解压预算），不写版本号与排期承诺；引用证据用仓库相对路径 + 字段名（如 `samples[0].phase=startup`），不贴 JSON 全文。
- 后续实现若获批：解析层放 `src/core/`（纯函数、零 Electron/DOM/React，Node 下可 vitest 直测），与 `align.ts` 的衔接收在会话层一个函数里，可执行判定（上限、门禁）共用同一纯函数，不两处各写一套。
- tarball 哈希固定 + ESLint `no-eval` / `no-new-func` 保持开启；只走 `XLSX.read` 纯数据 API，不开 `bookVBA`、不注册 eval 类编码器。

## 最近交付证明

- WI：`wi_intake_4a04ca92f46d7815`（xlsx 评估文档内存上限与供应链责任修正，doc-only）
- 日期：2026-11-18
- 结果：code_gates passed。
- 覆盖摘要：仅改 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`（docs-only）：§5 重写为由 1,300 MiB 静置护栏反推的上限（反推口径 / 四情形表 / 双栏收紧 / 运行时水位 / zip bomb 拒绝），§1 ④ 引用改准；新增 §2.2 供应链责任（责任人 / 升级复跑五项断言 / 退自研触发）并让 §6 风险列指向之；新增 §8 验证边界（`not-applicable` = 未运行 ≠ 通过、六类实现期单测）。`src/`、`package.json`、lockfile、CI、测试、`docs/perf/evidence/*` 零改动。
- 注：change pack 未提供 `tech.md` / `ux/**` 与 `tests/cases/**`，本轮 tech/ux 与 QA fold 无源文件可折。
