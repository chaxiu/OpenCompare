# 拖两个 xlsx 出四态结果并拒绝超限

## 范围

- 接进工作台主链路：`src/shared/fileExtensions.ts` 的白名单加 `.xlsx` / `.xlsm`（**只改这一处**，`.xls` 仍拒）；用户拖两个 `.xlsx` / `.xlsm` 时，会话层按 CSV 同一条链路处理——两侧**顺序**解析（左侧解析完、只保留归一化 `rows`，再解析右侧，不并发），各自用 `resolveXlsxBudget({ tabCount, mode })` 定预算，结果原样喂 `alignCsvTables` 出四态计数与单元格高亮。默认单 tab + dense；3 tab + 普通大表按 §5.2 直接拒绝。
- 拒绝走 UI：`XLSX_LIMIT_EXCEEDED` 转成可读文案「文件超出对比上限：<limit>」（`limit` 取错误里的档位 / 阈值），**不建 tab、不部分渲染、不写会话状态**，之前打开的会话保持原样；zip bomb 与四类闸门同一文案入口，不在 UI 里另写阈值判断。
- 解析摘要提示：`meta.uncachedFormulaCells > 0` 时显示「N 个公式无缓存值，按空比较」；隐藏行列默认参与比较并在摘要里给隐藏行 / 列计数，提供「忽略隐藏行列」开关，开关切换后同一对文件重算（不重读文件）。
- 多 sheet：两侧按 sheet 名配对（大小写不敏感），差集（仅左有 / 仅右有）列出；用户多选时**逐表出结果**（每张表独立四态，不合并成一张表）。
- §8 六类解析层单测补齐并在 `.munk/code-gates.json` 可见：① zip bomb 拒绝；② 四类超限拒绝（容器 / 条目数 / 单条目 / 累计预算，各断言 `{limit, observed}`）；③ 合并区覆盖；④ 日期序列化往返；⑤ 隐藏行列；⑥ 多 sheet 按名配对。W2 已覆盖的用例复用，不重写、不降断言。
- 各域基线「不做 .xlsx」口径同批改写（只改这些行，不整份重生成）：`.munk/baseline/domains/code-diff-merge/product.md`、`directory/product.md`、`workbench/product.md`、`structured/product.md`、`csv-align/product.md` 里「不做 `.xlsx` / Excel」的表述，改为「xlsx 单表已纳入（值提取后复用 CSV 对齐）；仍不做公式求值 / 样式·批注·条件格式 diff / 合并区逐格展开 / `.xls` BIFF」；`spreadsheet-compare/product.md` 里「解析实现尚未落地…继续有效」一段同步改为已落地（W1 解析层 + W2 上限层），其余段落与数字零改动。

## 验收

- ac-whitelist: 扩展名白名单只在 `src/shared/fileExtensions.ts` 变更，`.xlsx` / `.xlsm` 可入会话，`.xls` 与其他扩展名仍被拒；有单测断言两向。
- ac-four-state: 真实 `.xlsx` 与 `.xlsm` 对经工作台得到与 CSV 一致的四态（新增 / 删除 / 修改 / 相同）计数与单元格高亮；`src/core/csv/align.ts` 零改动。
- ac-sequential: 双栏解析严格顺序（左完成才起右），有断言或探针证明两侧不同时解析；单 tab 用单 tab 预算、3 tab 用 3 tab 预算。
- ac-reject-ui: 超限与 zip bomb 样本显示「文件超出对比上限：<limit>」可读文案，不建 tab、无部分渲染、会话状态不变（对比前后会话快照一致），已有会话仍可切回。
- ac-formula-hidden: `uncachedFormulaCells > 0` 显示「N 个公式无缓存值，按空比较」；隐藏行列默认参与且摘要给计数，「忽略隐藏行列」开关切换后结果随之变化且不重读文件。
- ac-sheets: 多 sheet 按名配对（大小写不敏感）、两侧差集列出、多选逐表各出四态，不出现表格合并。
- ac-six-classes: §8 六类单测全部存在且全绿、均在 `code_gates` 可见；W2 的既有用例断言未被削弱。
- ac-baseline: 五处域基线 + `spreadsheet-compare` 对应段已改写，逐条给「原句 → 新句」映射；其它数字与段落零改动。
- ac-no-public-claim: README、Issue、对外文案零改动，不出现「已支持 xlsx」。

## 非目标

- 不做公式求值、样式 / 批注 / 条件格式 diff、合并区逐格展开、多 sheet 合并成一张表、`.xls` BIFF、流式 / 临时文件解析。
- 不改 `src/core/csv/align.ts`、不改 §5 数字与 `src/core/xlsx/limits.ts` 的阈值常量、不新增 npm 依赖。
- 不做发布（不推 tag、不发版）、不做 L3 实机验收（下一环由 `product-qa` 任务跑）。
- 不改 demo / 示例入口，不为 xlsx 新增演示样本按钮。

## 实现约束

- 阈值与判定只复用 `src/core/xlsx/` 已导出的纯函数，UI 层不得出现第二套数字或比较逻辑。
- 拒绝路径必须先判定再读内容，保证「会话状态不变」可被断言；错误文案走 i18n 键，不硬编码中文串到组件里。
- 扩展名白名单、会话入口、解析调用点各只一处；不复用 CSV 的解析分支写第二套 xlsx 分支判断。
- 测试用真实 xlsx 二进制夹具在测试内生成（或极小 committed fixture），不提交大样本；会话层断言用现有 jsdom / 纯函数测试风格。

## 本单执行约束（不 fold）

- 预算 ≤8M token / ≤90 分钟。若判定超预算，优先落盘 ac-whitelist / ac-four-state / ac-sequential / ac-reject-ui / ac-formula-hidden / ac-six-classes / ac-baseline，并在交付回执明确列出未完成的 ac 与建议拆项（不硬撑、不静默缩范围）。
- 只在本 worktree 内改动；不推 tag、不 dispatch 发布流水线、不改已公开 Release、不对外发帖。
- `code_gates` 跑在已 install 的 worktree（或先 `pnpm install --frozen-lockfile`），不把主检出未安装依赖的红当产品回归。
- 禁止长采样与 sleep 轮询 CI；不改门禁阈值、不缩样本。
- 交付须给出：`git diff --stat`、六类单测用例名、`code_gates` evidence attempt 与 cwd、域基线「原句 → 新句」映射、`git diff` 证明 `align.ts` 与 `limits.ts` 阈值未改。
