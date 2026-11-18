# 给 xlsx 解析加上限与 zip bomb 拒绝

## 范围

- 在 W1 已合入的 `src/core/xlsx/`（commit f4ac360，`parseXlsxTable` / `listSheets` 纯函数层）上补「上限与拒绝」层，数字与判定口径**只**来自 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`：§5.1 四情形预算（以**双栏收紧值**为准）、§5.3 三档、§5.4 zip bomb、§5.5 运行时水位。不另写第二套数字。
- §5.1 预算解析：新增纯函数 `resolveXlsxBudget({ tabCount, mode })`，`mode ∈ { dense, normal }`、`tabCount ∈ { 1, 3 }`；返回每 tab 允许解压字节与容器体积（≈10:1）。双栏收紧值 300 / 171 / 100 / 57 MiB（对应 ①1tab+dense / ②1tab+普通 / ③3tab+dense / ④3tab+普通），容器 40 / 20 / 13 / 7 MiB。§5.2 明确不支持的组合（3 tab + 普通）返回「不支持」判定而不是给预算。
- §5.3 三档：容器 ≤64 MiB、zip 条目数 ≤10,000、单条目解压 ≤256 MiB（未解压即判定，只作外层闸门）；单 sheet ≤1,048,576 行 × 16,384 列、非空单元格 ≤2,000,000、单 sheet XML ≤256 MiB；共享字符串 ≤1,000,000 条且 ≤256 MiB。5.1 预算低于某档时以 5.1 为准。
- §5.4 zip bomb：条目解压 / 压缩比 >100:1 且解压后 >64 MiB 即拒绝；容器 / 条目数 / 单条目 / 累计解压预算任一命中即拒绝。
- §5.5 运行时水位：水位 = 启动基线 + 本情形预算；解析过程中（inflate 累计与 RSS 采样）达 60% 记 warning 进解析摘要，达 80% 立即中止解析并**丢弃已产出对象**，按超限拒绝返回。RSS 采样做成可注入探针（默认用 `process.memoryUsage()`），使 Node 单测可确定性地走到 60% / 80% 两态。
- 统一错误：任何拒绝都抛/返回错误码 `XLSX_LIMIT_EXCEEDED`，携带 `{ limit, observed }`（limit 为被命中的档位与阈值，observed 为实际值）；拒绝路径**不产出任何 rows**（无部分结果）、不写任何会话状态、不留半解析中间对象。
- 同批带公司负责人复核过的两条非阻塞项：
  - ① 依赖哈希自引用补一条**一次性实证**写进域基线 `.munk/baseline/domains/spreadsheet-compare/product.md`，原文照抄：「sha256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` / 2,409,319 B，于 2026-11-18 与 `cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` 原件实测一致（公司负责人复核）」；并注明仓内 `src/xlsx-dep-gate.test.ts` 的哈希断言只能防漂移、来源由该实证背书，**不加联网 CI 腿**。
  - ② 域基线写明环境注意：主检出未 `pnpm install` 时直接跑 `pnpm test src/core/xlsx/*` 会红属环境陈旧（非产品回归），后续 `code_gates` 一律跑在已 install 的 worktree，或先 `pnpm install --frozen-lockfile`。

## 验收

- ac-budget-table: `resolveXlsxBudget` 对四情形逐格等于 300 / 171 / 100 / 57 MiB 与容器 40 / 20 / 13 / 7 MiB，且 3 tab + 普通返回「不支持」；断言直接绑定这些常量（改任一数字必红）。
- ac-tier3: 容器 64 MiB、条目数 10,000、单条目 256 MiB、单 sheet 行列与 2,000,000 非空格、sheet XML 256 MiB、共享字符串 1,000,000 条 / 256 MiB 各有实现与断言；5.1 预算更小时以 5.1 为准（一条优先级用例）。
- ac-zipbomb: 构造压缩比 >100:1 且解压 >64 MiB 的样本被拒；四类闸门各自命中时均被拒（容器 / 条目数 / 单条目 / 累计解压预算各一条）。
- ac-error-shape: 每个拒绝都返回 `XLSX_LIMIT_EXCEEDED` 且带 `{limit, observed}`，`limit` 指明档位与阈值、`observed` 为实测值；拒绝后无 rows 产出、无部分结果、无会话状态写入。
- ac-watermark: 注入假 RSS 探针可让解析在 60% 记 warning（结果仍成功且摘要含 warning）、在 80% 中止并丢弃已产出对象（返回 `XLSX_LIMIT_EXCEEDED`，无 rows）；两态各一条单测。
- ac-tests-red: 四类超限单测（容器 / 条目数 / 单条目 / 累计解压预算）+ zip bomb + 两态水位共 ≥7 条，全部进 `.munk/code-gates.json` 覆盖的测试文件；交付回执逐条给出「断言值 ↔ 阈值常量位置」映射，并说明若把对应阈值调松哪条会红。
- ac-gates-worktree: `code_gates` 在已 install 的 worktree 内跑（或先 `pnpm install --frozen-lockfile`），回执写明执行 cwd 与是否需 install；不得把主检出未装 xlsx 导致的红当产品回归上报。
- ac-baseline-notes: 域基线 `spreadsheet-compare/product.md` 同时含上述两条（哈希一次性实证原文、环境 install 注意），且评估文档 §5 数字零改动。
- ac-align-untouched: `src/core/csv/align.ts` 零改动。

## 非目标

- 不接工作台：不改扩展名白名单、不改拖拽 / 文件入口、不加 UI 文案与提示（下一项）。
- 不改 W1 的值提取语义（公式缓存值 / 合并锚点 / 样式丢弃 / 日期浮点归一 / `bookVBA:false`），不重写 `parse.test.ts` 已有断言。
- 不做临时文件 / 流式解析、不新增第三方 zip 库（预检用 `node:zlib`）、不新增 npm 依赖。
- 不改 `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md` 的任何数字，不改 `src/core/csv/align.ts`，不对外发任何「已支持 xlsx」表述。

## 实现约束

- 判定只写一处：预算、三档、zip bomb、水位全部收敛在 `src/core/xlsx/` 的纯函数里，W3 接 UI 时直接复用，不得在会话层再写一套阈值。
- 上限判定要在真正展开数据前完成能得到的信息（中央目录 / 条目大小 / 压缩比），运行时水位用于兜住解析期放大；两者都要可单测，不依赖真实超大文件。
- 大样本 fixture 用测试内合成（零字节填充 + deflate 得到高压缩比），不提交大二进制到仓库。
- 错误对象只暴露 `{ limit, observed }` 与可读文案键，不把内部路径或堆栈塞进 UI 文案。

## 本单执行约束（不 fold）

- 预算 ≤8M token / ≤90 分钟；临近上限先落盘小步并说明拆项建议，不硬撑。
- 只在本 worktree 内改动；不推 tag、不 dispatch 发布流水线、不改已公开 Release 与资产、不对外发帖。
- 禁止长采样与 sleep 轮询 CI；门禁按仓内既有流程跑，不手改阈值、不缩样本。
- 若要证明「单测能红」，临时改常量后必须回滚，最终 diff 不得包含临时改动；回执写清验证方式。
- 交付须给出：`git diff --stat`、四类超限 + zip bomb + 水位用例名、`code_gates` evidence 的 attempt 与 cwd、`grep` 证明 `align.ts` 与评估文档数字未改。
