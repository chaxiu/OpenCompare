# UI 第一期对标参照审计（只读三表）

基线：`refs/heads/main` 的 v0.2.11 树。开工前核对两处只读事实源存在且与下文一致，缺失即上报基线不一致：`src/renderer/src/workbench/shellLayout.ts` 的 `SHELL_ENTRY_IDS`（20 条）、`src/renderer/src/assets/icons/index.ts` 的 `SHELL_ENTRY_ICONS` / `ICON_NAMES`（cp-icon-set 已合入，图标命名表为准）。

## 范围

纯文档项，一次交完两处改动，且只改这两处：

1. **新增 `docs/ui-phase1-reference-audit.md`**（中文，UTF-8）。正文只留三张表，只写归属与判断：

   **表①壳层归属**：以我们已合入的壳层层级（`app` 应用头 → `sessions` 会话头 → `events` 事件带 → `view-toolbar` 视图工具条 → `panels` 面板 → `status` 状态栏）为行，逐层写「对方对应层是哪个」「该层控件在我们词汇下承担什么动作」。每行的「对方对应层」取值必须落在同一套我们的层名称里（不引入对方自有层名，如同屏两层 header 之类原词不得直接作为层名）。
   **表②20 条入口对照与判定**：行集合 = `SHELL_ENTRY_IDS` 的 20 条入口，逐条给：我们的位置（level / slot）· 对方在哪一层出现 · 对方有而我们没有 · 我们有而对方没有 · 判定 · 来源。判定取值只允许「保留 / 合并 / 降级到菜单 / 明确不做」，`明确不做` 必须带理由。
   **表③图标语义差异与主动不做**：单表，含「类别」列，取值只允许「图标语义差异 / 主动不做」。图标语义差异行写：动作 → 我们的图标名（取自 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS`，不得新造名）→ 对方字形差异的性质 → 选哪个与理由；主动不做行写对标元素的名称、不做理由与替代做法（若无替代须写明「无替代」）。

2. **仓根 `AGENTS.md` 补一行**：指向 `docs/lessons.md` 的入口（承接 docs-governance 域「agent 无从发现沿革」的缺口）。只加这一行，不重排、不扩写、不改既有小节。

素材只允许公开来源并逐行给链接：官方帮助页 `https://www.scootersoftware.com/v5help/*`（豁免：仅该站与 `beyond-compare.com` 的官方手册页），不安装该商业软件、不截图、不抄图标路径与任何版式资产。

## 验收

- ac-two-files-only: `git diff --name-status <base>..HEAD` 恰好两行——`A docs/ui-phase1-reference-audit.md` 与 `M AGENTS.md`；`src/**`、`docs/lessons.md`、`README.md`、`README.zh-CN.md`、`package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- ac-agents-one-line: `AGENTS.md` 相对基线只有一次 `+1/−0` 改动，该行含 `docs/lessons.md`；`wc -l AGENTS.md` = 基线 46 + 1 = 47；该行之外 `git diff -U0 AGENTS.md` 无任何其它 hunk。
- ac-exactly-three-tables: 文档中 Markdown 表格分隔行（匹配 `^\|[- :|]+\|$`）恰好 3 行，即三张表，无第四张。
- ac-prose-minimal: 三张表之外的非空行（标题、≤6 行来源与方法说明、1 行壳层结论）合计 ≤ 12 行，且不含任何项目符号清单或第二层小标题正文段。
- ac-table1-levels: 表①行序严格等于 `SHELL_LEVEL_ORDER`（`app / sessions / events / view-toolbar / panels / status`）六层，每层一行；行内「对方对应层」列的取值全部落在该六层名称集合内（不得出现对方原词作层名）。
- ac-table2-entry-set: 表②的入口 id 列取值集合与 `SHELL_ENTRY_IDS` **完全相等**（20 条，多一条 / 少一条 / 重复即失败）；条目顺序与 `SHELL_ENTRY_IDS` 顺序一致。
- ac-table2-verdict-enum: 表②判定列每一行取值 ∈ {`保留`, `合并`, `降级到菜单`, `明确不做`}，无空值；每个 `明确不做` 行理由列非空（≥ 8 个字符）。
- ac-table2-both-directions: 表②「对方有而我们没有」「我们有而对方没有」两列每行都有明确取值——有内容，或显式写 `无`；不得整列留空。
- ac-table3-category: 表③「类别」列取值 ∈ {`图标语义差异`, `主动不做`}，两类各至少 5 行；`图标语义差异` 行的图标名列全部属于 `ICON_NAMES`（含 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` 的现有取值），无新造图标名。
- ac-sources-official: 三张表的「来源」列每行至少一个 `https://` 链接，全部 host 属于 `scootersoftware.com`（含 `www.`）或 `beyond-compare.com`；全文档出现的外部链接 host 无一例外落在这两个域；无 `localhost` / 论坛 / 二手博客 / 图床链接。
- ac-no-asset-copy: 文档零图片嵌入（`!\[` 计数 0）、零 `data:image`、零 `<svg`、零 base64 串、零 `viewBox`/`d=` 路径数据——只写归属与判断，不搬图形或版式。
- ac-no-imitation-wording: 全仓（排除 `node_modules`、`.munk/`）对 `像 Beyond Compare|similar to Beyond Compare|resembles Beyond Compare|模仿 Beyond Compare|山寨` 的匹配数为 0；README 现有 `alternative to / 平替 / 对标` 表述按原样保留（`src/main/release-packaging.test.ts` 对其有正向断言，本项不得触碰）。
- ac-shell-conclusion: 文档含且仅含一条壳层结论行，二选一——写明「已合入的壳层重排（merge 8e56046）无结构性问题」，或列出问题清单并在交付说明给出定点修复建议；两种情况下 `src/**` 均零 diff（不得改壳层、不得重写整层）。
- ac-gates-green: 默认 `.munk/code-gates.json` 九个 gate（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿；不新增任何测试文件、不新增门禁。
- ac-verification-reproducible: 交付说明给出上述每条可 grep / `wc` 校验项的实际命令与实测结果（三表计数、20 条 id 集合差集为空、链接 host 清单、图片计数 0、AGENTS.md 行数），逐条可原样复跑。
- ac-single-commit-clean: 单条 commit 经 delivery 合入 main；交付时 `git status --porcelain` 为空。

## 非目标

- 不改 `src/` 任何文件；不动壳层、不改已合入的 `shellLayout` / `SessionTabs` / 图标组件与命名表；发现结构性问题只写结论，修复另开项。
- 不新增测试、不新增门禁、不改 `code-gates.json`。
- 不改 README / README.zh-CN.md / docs 其它文件；不往 README 第 8 节 docs 索引加行（本项只补仓根 `AGENTS.md` 一行）。
- 不动版本与发布单点文件：`package.json#version`、`CHANGELOG.md`、README 第 5 行、`release.yml`、`docs/release-notes/**`、`docs/release-evidence/**`。
- 不安装、不破解、不下载 Beyond Compare 本体或安装包；不用截图 / 图标 / 版式素材；不做视觉复刻、不写「更接近对方」类目标。
- 不调整图标、不新增图标、不替换 cp-icon-set 已定的 20 条映射与 UI 动作映射；审计只记录判断。
- 不做交互模型变更、不改 tab 语义、不做宽度 / 主题相关实现（主题与截图属后续批次）。
- 不为本项调整批次顺序：本项只要求自身在 `cp-theme-pair` 写项开工前合入；不阻塞已收口的 `cp-icon-set` / `cp-shell-tabs`，也不要求重排已定顺序。

## 实现约束

- 正文中文；每条判断一行一源，来源链接按 `https://www.scootersoftware.com/v5help/<page>.html` 形式给出，页名与所引判断对应（不得一条链接覆盖多行不同事实）。
- 唯一事实源（只读引用，不改）：入口宇宙 = `src/renderer/src/workbench/shellLayout.ts#SHELL_ENTRY_IDS`（20 条）与 `SHELL_ENTRIES` 的 level/slot；图标词汇 = `src/renderer/src/assets/icons/index.ts#SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / `ICON_NAMES`；壳层层级 = `SHELL_LEVEL_ORDER`。
- 与已合入的 cp-icon-set 命名表冲突时，一律以表内现有取值为「我们的选择」，把差异写进判断列，不得提议改名、不得提议换图标。
- 单条 commit，由 delivery 合入 main；不在 main 工作区手改；`git status` 干净后交棒。
- 校验手段只允许 shell（`grep` / `rg` / `wc` / `git diff --name-status`）与默认 gates；不为此新增测试文件。
- 文档头部固定写：审计基线 commit、素材来源域、日期（写作当日），三行以内。
