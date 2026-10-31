# Domain: ui-reference-audit

UI 对标参照审计域：把「对标商业产品时我们保留什么、合并什么、降级什么、明确不做什么」固化成**只读判断文档** `docs/ui-phase1-reference-audit.md`（中文，三张表），供后续 UI 批次（图标、主题、壳层细化）开工前对照。
本域管**判断的归属与写法**，不改任何行为：壳层层级 / `SHELL_ENTRIES` 的 18 条入口与三档呈现归 `workbench`，图标源与 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / `ICON_NAMES` 归 `icon-system`，本域只把这两份只读事实源与对方官方手册逐层对齐并给出判定；文档归属与 `AGENTS.md` 入口行归 `docs-governance`。

## 范围

- **单一产出物 `docs/ui-phase1-reference-audit.md`**：正文只留三张表，只写归属与判断；头部固定三行以内——审计基线 commit、素材来源域、日期。
- **表① 壳层归属**：以已合入的壳层层级（`app` → `sessions` → `events` → `view-toolbar` → `panels` → `status`）为行，逐层写「对方对应层是哪个」「该层控件在我们词汇下承担什么动作」。每行「对方对应层」取值必须落在同一套我们的层名称里，**不引入对方自有层名**（如同屏两层 header 的原词不得直接当层名）。
- **表② 18 条入口对照与判定**：行集合 = `src/renderer/src/workbench/shellLayout.ts#SHELL_ENTRY_IDS` 的 18 条，顺序与之一致；逐条给我们的位置（level / slot）· 对方在哪一层出现 · 对方有而我们没有 · 我们有而对方没有 · 判定 · 理由 · 来源。判定取值只有「保留 / 合并 / 降级到菜单 / 明确不做」，`明确不做` 必须带理由。
- **表③ 图标语义差异与主动不做**：单表带「类别」列，取值只有「图标语义差异 / 主动不做」。图标语义差异行写：动作 → 我们的图标名（取自 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / `ICON_NAMES`，**绕开新造名**）→ 对方字形差异的性质 → 选哪个与理由；主动不做行写对标元素名称、不做理由与替代做法（无替代须写明「无替代」）。
- **只读事实源（不改）**：入口宇宙 = `SHELL_ENTRY_IDS` / `SHELL_ENTRIES` 的 level · slot；图标词汇 = `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / `ICON_NAMES`；层序 = `SHELL_LEVEL_ORDER`。与 cp-icon-set 命名表冲突时一律以表内现值为「我们的选择」，差异写进判断列，不得提议改名或换图标。
- **素材纪律**：只允许公开官方手册页并逐行给链接（`https://www.scootersoftware.com/v5help/<page>.html`，豁免面仅该站与 `beyond-compare.com` 官方手册页）；不安装 / 不破解 / 不下载该商业软件，不截图、不抄图标路径与版式资产；避免「像 / 模仿 / 山寨」类表述，README 既有 `alternative to` / `平替` / `对标` 原样保留（`src/main/release-packaging.test.ts` 对其有正向断言）。
- **壳层结论行**：文档含且仅含一条结论行，二选一——写明「已合入的壳层重排（merge 8e56046）无结构性问题」，或列出问题清单并在交付说明给定点修复建议；两种情况 `src/**` 均零 diff（只写结论，修复另开项）。

## 验收

- **ac-two-files-only**：`git diff --name-status <base>..HEAD` 恰好两行——`A docs/ui-phase1-reference-audit.md` 与 `M AGENTS.md`；`src/**`、`docs/lessons.md`、`README.md`、`README.zh-CN.md`、`package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- **ac-exactly-three-tables**：文档中 Markdown 表格分隔行（匹配 `^\|[- :|]+\|$`）恰好 3 行，即三张表，无第四张。
- **ac-prose-minimal**：三张表之外的非空行（标题、≤6 行来源与方法说明、1 行壳层结论）合计 ≤ 12 行，且不含任何项目符号清单或第二层小标题正文段。
- **ac-table1-levels**：表①行序严格等于 `SHELL_LEVEL_ORDER`（`app / sessions / events / view-toolbar / panels / status`）六层、每层一行；「对方对应层」列取值全部落在该六层名称集合内（不得出现对方原词作层名）。
- **ac-table2-entry-set**：表②入口 id 列取值集合与 `SHELL_ENTRY_IDS` **完全相等**（18 条；多一条 / 少一条 / 重复即失败），顺序与 `SHELL_ENTRY_IDS` 一致。
- **ac-table2-verdict-enum**：表②判定列每行取值 ∈ {`保留`, `合并`, `降级到菜单`, `明确不做`}，无空值；每个 `明确不做` 行理由列非空（≥ 8 个字符）。
- **ac-table2-both-directions**：表②「对方有而我们没有」「我们有而对方没有」两列每行都有明确取值——有内容或显式 `无`；不得整列留空。
- **ac-table3-category**：表③「类别」列取值 ∈ {`图标语义差异`, `主动不做`} 且两类各至少 5 行；`图标语义差异` 行的图标名列全部属于 `ICON_NAMES`（含 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` 现有取值），无新造图标名。
- **ac-sources-official**：三张表「来源」列每行至少一个 `https://` 链接，host 全属 `scootersoftware.com`（含 `www.`）或 `beyond-compare.com`；全文档外部链接无一例外落在这两个域，无 `localhost` / 论坛 / 二手博客 / 图床。
- **ac-no-asset-copy**：文档零图片嵌入（`!\[` 计数 0）、零 `data:image`、零 `<svg`、零 base64 串、零 `viewBox` / `d=` 路径数据——只写归属与判断，不搬图形或版式。
- **ac-no-imitation-wording**：全仓（排除 `node_modules`、`.munk/`）对 `像 Beyond Compare|similar to Beyond Compare|resembles Beyond Compare|模仿 Beyond Compare|山寨` 的匹配数为 0。
- **ac-shell-conclusion**：文档含且仅含一条壳层结论行（二选一形态见「范围」）；两种情况下 `src/**` 零 diff。
- **ac-gates-green**：默认 `.munk/code-gates.json` 九门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿；不新增测试文件、不新增门禁。
- **ac-verification-reproducible**：交付说明给出每条可 grep / `wc` 校验项的实际命令与实测结果（三表计数、18 条 id 集合差集为空、链接 host 清单、图片计数 0、`AGENTS.md` 行数），逐条可原样复跑。
- **ac-single-commit-clean**：单条 commit 经 delivery 合入 main；交付时 `git status --porcelain` 为空。

## 非目标

- 不改 `src/` 任何文件；不动壳层、不改已合入的 `shellLayout` / `SessionTabs` / 图标组件与命名表；发现结构性问题只写结论，修复另开项。
- 不新增测试、不新增门禁、不改 `code-gates.json`。
- 不改 README / README.zh-CN.md / docs 其它文件；不往 README 第 8 节 docs 索引加行（本项只补仓根 `AGENTS.md` 一行，口径归 `docs-governance`）。
- 不动版本与发布单点文件：`package.json#version`、`CHANGELOG.md`、README 第 5 行、`release.yml`、`docs/release-notes/**`、`docs/release-evidence/**`。
- 不安装、不破解、不下载对标软件本体或安装包；不用截图 / 图标 / 版式素材；不做视觉复刻、不写「更接近对方」类目标。
- 不调整图标、不新增图标、不替换 cp-icon-set 已定的 18 条映射与 UI 动作映射；审计只记录判断。
- 不做交互模型变更、不改 tab 语义、不做宽度 / 主题相关实现（主题与截图属后续批次）。
- 不为本项调整批次顺序：只要求自身在对标主题批次（`cp-theme-pair`）写项开工前合入；不阻塞已收口的 `cp-icon-set` / `cp-shell-tabs`。

## 实现约束

- 正文中文；每条判断一行一源，页名与所引判断对应（不得一条链接覆盖多行不同事实）。
- 唯一事实源只读引用，不改：入口 / 层序取 `shellLayout.ts`，图标词表取 `assets/icons/index.ts`；与命名表冲突时以表内现值为「我们的选择」。
- 校验手段只允许 shell（`grep` / `rg` / `wc` / `git diff --name-status`）与默认 gates；不为此新增测试文件。
- 文档头部固定写：审计基线 commit、素材来源域、日期（写作当日），三行以内。
- 单条 commit，由 delivery 合入 main；不在 main 工作区手改；`git status` 干净后交棒。
- 后续 UI 批次引用本域时按「判定列」执行：`降级到菜单` 的入口不得再占工具条主位，`明确不做` 的条目不得在后续批次悄悄补上而不改本域判定；改判必须同批改本域并写明推翻理由。

## 最近交付证明

- WI：`wi_ws_0b248d40545e9eb4`（UI 第一期对标参照审计 · 只读三表 + 仓根 `AGENTS.md` 补一行 `docs/lessons.md` 入口；纯文档，`src/**` 零 diff）
- 日期：2026-10-30
- 结果：`code_gates` passed（9 gates，attempt 001 全 exit 0，`.munk/runs/run_ws_16f6f7ea75b767c6/code-gates/attempts/001`）；本轮 `needSelfTest=false`，UI 自测跳过。`pnpm test` 75 files / 1202 passed + 1 skipped（1203），29.82s。**新建本域**，未改历史域记录。
- 改动面：`git diff --name-status main..HEAD` 恰两行——`A docs/ui-phase1-reference-audit.md`（66 行）、`M AGENTS.md`（+1/−0，行 4 指向 `docs/lessons.md`，`wc -l` 46 → 47）。
- 验收落点：表格分隔行 3（三表）；表①6 行严格按 `SHELL_LEVEL_ORDER`；表②18 条 id 与 `SHELL_ENTRY_IDS` 集合 / 顺序一致；判定枚举无越界、`明确不做` 行理由非空；表③19 行 = 图标语义差异 10 + 主动不做 9，10 个图标名全在 `ICON_PATHS`；外部链接 45 处全为 `www.scootersoftware.com`；`!\[` 计数 0；非表格非空行 7（≤ 12）；壳层结论行 1 条（结论：merge `8e56046` 无结构性问题）。
- 注：本 WI change pack 只有 `prd.md`（无 `tests/cases/**`、无 `tech.md` / `ux/**`）——无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/ui-phase1-reference-audit.md`。
- 后续注意：① 表②是**入口级判定表**，18 条中 2 条非「保留」（`template` / `report-export` 降级到菜单；原 `samples` / `samples-menu` 已随示例入口迁入设置从清单移除，判定行同步删除），后续壳层改动若把降级项拉回工具条主位即与本域判定冲突，须同批改判定。② 表③「主动不做」9 条（缩略图 minimap、双层菜单栏、独立 Folder Sync 会话、多窗口工作区、三向独立中栏、远程 / 云 profiles、文件格式规则管理器、工具栏自定义、打印 PDF）是**显式排除项**，主题 / 图标批次不得顺手引入。③ 图标名是唯一空间，审计只记录现有取值，改图标须走 `icon-system` 的三步流程而不是改本文档。
