# 新增 xlsx 解析层，把工作簿读成表头与行

## 范围

- 在 `src/core/` 新增纯函数解析层 `parseXlsxTable(bytes)`（配套 `listSheets(bytes)` / 按 sheet 名选择），零 Electron / DOM / React 依赖，Node 下 vitest 可直测；输出统一 `{ header: readonly string[]; rows: readonly (readonly string[])[]; meta }`，形状与 `src/core/csv/align.ts` 的 `CsvTableData` 一致，供上层原样复用 `alignCsvTables`。
- 依赖只引入 SheetJS CE `xlsx` **0.20.3**：来源必须是官方 CDN tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`（锁死版本 + 记录 sha256），可用「lockfile 里写 URL 依赖并带 integrity」或「vendored tarball + 校验脚本」任一方式，但必须满足：版本号不可漂移、sha256 在仓内可复核、CI 或 `code_gates` 内含一条校验；**禁止**回退 npm 上的 0.18.5，禁止运行期从网络拉取，禁止引入第二个 xlsx 库。
- 解析只作「值提取前置层」，语义严格按 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md` §1 五条：① `cellFormula:false` 只读 `<c><v>` 缓存值，不求值不解析公式文本，无缓存值按 `''` 并计数 `meta.uncachedFormulaCells`；② 合并区只取左上锚点值、区内其余一律 `''`，不拆分扩展、不改变行数；③ 样式/批注/条件格式不参与，`sharedStrings` 只作中间层、解析后丢弃，结果里不留 `s=` 痕迹；⑤ 日期按工作簿 `date1904` 基准 + `numFmt` 判定后归一化为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm:ss`（无时区），浮点 `toPrecision(15)` 后去尾零；`.xlsm` 一律 `bookVBA:false`、只读数据绝不执行宏。
- `dense: true` 读入；空表头按列字母（`A`/`B`…）补齐并按 `align.ts` 的「首个同名保留」口径去重；隐藏行列默认参与比较，但须在 `meta` 里标注（供上层做「忽略隐藏行列」开关）。多 sheet：提供按名取表（大小写不敏感）与两侧表名差集信息，不在本项做 UI 配对。

## 验收

- ac-core-pure: `parseXlsxTable` / `listSheets` 位于 `src/core/` 且零 Electron / DOM / React import，Node 环境 vitest 直接调用即出结果。
- ac-contract: 返回 `{header, rows, meta}`，`header` 与所有 `rows` 单元格均为字符串；形状可直接喂 `alignCsvTables(left, right, keyColumns)` 而不做二次转换。
- ac-formula: 只读缓存值，公式文本不参与；无缓存值的公式单元格按 `''` 入表且 `meta.uncachedFormulaCells` 等于实际计数。
- ac-merged: 合并区只取左上锚点、其余单元格 `''`，`rows.length` 与未合并时一致，锚点所在行可正常作为主键列。
- ac-date-float: 1900 / 1904 两种基准、日期与时间格式均归一化为 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss`；浮点按 15 位有效数字去尾零后与原值一致的样本逐项断言。
- ac-header-hidden-sheet: 空表头按列字母补齐且重名去重；隐藏行列在 `meta` 有标注且默认参与比较；多 sheet 按名（大小写不敏感）取表并列出两侧差集。
- ac-dep-pinned: 仓内可查到 `xlsx` 0.20.3 + sha256，且有一条自动校验（CI 或 `code_gates`）能在哈希/版本不符时 fail；`package.json` 与 lockfile 里没有任何 `xlsx@0.18.x` 残留。
- ac-tests-in-gates: 合并区、日期/浮点、隐藏行列、多 sheet 名配对四类单测写入 `.munk/code-gates.json` 覆盖的测试文件并被门禁跑到，全绿；用例不依赖默认 5s 超时（必要时显式 per-test 超时）。
- ac-no-static-eval: 新增代码与 vendored 产物 `eval(` / `new Function` 静态扫描 0 命中，`no-eval` / `no-new-func` 规则保持开启。
- ac-align-untouched: `src/core/csv/align.ts` 零改动（`git diff` 不含该文件）。

## 非目标

- 不做上限三档、zip bomb 判定与运行时水位（下一项独立交付）；本项只保证解析语义与依赖引入。
- 不接工作台：不改扩展名白名单、不改拖拽 / 文件选择入口、不加任何 UI 文案与提示。
- 不做公式求值、样式 / 批注 / 条件格式 diff、合并区逐格展开、多 sheet 合并成一张表、`.xls` BIFF、流式 / 临时文件解析。
- 不改 `src/core/csv/align.ts`，不改 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md` 的任何数字，不新增对外文案（不得写「已支持 xlsx」）。

## 实现约束

- 判定只写一处：所有语义判定收敛在这个纯函数层，上层不得各写一套；解析层不承担 IO 预算（上限属下一项）。
- 测试样本在测试内用依赖自身生成或极小二进制夹具，不新增仓库级大样本；不把二进制夹具塞进 `docs/`。
- 依赖产物不入库大体积副本时须说明 sha256 复核路径，保证 CI 在断网情况下可复现（缓存或 vendored）。
- 不新增 npm 依赖（除 xlsx 本体），不引入 CDN 运行期拉取，不冷启动读网络。

## 本单执行约束（不 fold）

- 预算 ≤8M token / ≤90 分钟；超过先落盘小步并说明拆项建议，不硬撑。
- 只在本 worktree 内改动；不推 tag、不 dispatch 发布流水线、不改已公开 Release 与资产、不对外发帖。
- coding 期间禁止长采样与 sleep 轮询 CI；`code_gates` 按仓内既有流程跑，不手改门禁阈值、不缩样本。
- 交付须给出：依赖来源与 sha256、四类单测的用例名与门禁条目、`git diff --stat`、以及 `grep` 证明 `align.ts` 未改。
