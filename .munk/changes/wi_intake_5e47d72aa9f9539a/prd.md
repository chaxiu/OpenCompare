# 修复窄屏（含 960–1024）底部状态栏横向裁切

## 范围

修复工作台底部状态栏在窄窗口下把四态图例与计数挤出视口的真实缺陷，使四态图例（4/4 项）、各自计数、Source/Target 文件数与 Differences 数值在 960 / 1024 / 1440 / 1920 四档宽度下完整可见、不被裁切、不被横向滚动遮挡；1440 / 1920 视觉不回退。

已确认的现场证据（L3 实机，直接引用，不重跑实机）：

- `trun_99a17882f83ec1a8 / leg1-layout.json`
  （`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_99a17882f83ec1a8/evidence/leg1-layout.json`）
- 1024×800：`[data-shell-level="status"]` 的 `scrollWidth=1415 > clientWidth=1024`，四个图例点 x=821.5 / 889.9 / 975.1 / 1053.3，后两个连同其计数与 Differences 落在视口外；同一证据里 1280 档同样 `1415 > 1280`，1440 / 1920 档 `scrollWidth == clientWidth`；亮暗两主题一致复现。
- 根因位置：`src/renderer/src/components/StatusBar.tsx` 的 footer 用 `overflow-x-auto` + 所有分组 `shrink-0` + 逐项 `whitespace-nowrap`，没有任何换行/收缩通道；窄档只把超出部分推入不可见的横向滚动区，而状态栏没有可见的横向滚动入口。
- 现状断言缺口：`src/renderer/src/workbench/shellLayout.test.ts` / `shellLayout.dom.test.tsx` 只钉了分组顺序、`.tabular` 渲染和高度预算，没有钉"窄档不横向溢出"与"图例项全部可见"。

修复方向不预设唯一实现，但必须满足下面的可断言契约；允许的做法：状态栏容器换行成两行、次要信息（会话 ID/路径、Platform、probe）截断加 `title` tooltip 或折叠、收紧分组间距——但四态图例与计数永远可见。

## 验收标准

- ac-status-no-horizontal-overflow: 960 / 1024 / 1280 / 1440 / 1920 宽度下 `footer[data-shell-level="status"]` 的 `scrollWidth` 不大于 `clientWidth`（无横向溢出）；状态栏不再依赖 `overflow-x-auto` 隐藏内容，overflow 只能由换行/收缩消除。
- ac-legend-all-items-visible: 上述每一档下状态栏内四态图例项全部渲染且完整可见：图例项数等于期望集合（`same`/`added`/`removed` 恒在，`conflict` 当且仅当 `composition.conflict > 0`），每项的图例点、计数值、状态文字均在状态栏边界内，不落在横向滚动隐藏区、不被 `overflow-hidden` 截断。
- ac-counts-visible: 上述每一档下 Source / Target 文件数与 Differences 数值均渲染且在状态栏边界内完整可见；当图例与统计值不能在单行共存时，图例+计数必须整体落在可见行内，而不是被挤到行外。
- ac-single-source-counts: 状态栏的四态图例与差异计数仍读同一 `composition` 数据源、Source/Target 与 Differences 仍读 `describeSession(...).stats`，不得二次计算或另建口径；图例项的过滤/映射只允许保留现有 `conflict > 0` 条件。
- ac-wrap-model-asserted: `shellLayout` 中新增/扩展的状态栏宽度模型对每一档给出确定结论（单行 `fits` 或换行 `rows >= 2`），且永不给出"溢出"结论；模型必须由内容宽度驱动而非仅靠宽度断点，保证 960–1440 之间任意宽度（含证据里的 1280）都不回落到溢出。
- ac-wrap-structure: 状态栏容器为可换行结构（换行由容器/分组类承载），四态图例分组自身可在需要时独占一行；各分组不得带有导致横向溢出的不换行最小宽度（如分组级 `shrink-0` 且无 `min-w-0`/允许换行的组合）。
- ac-secondary-truncation: 若采用截断/折叠次要信息（会话 ID/路径、Platform、probe），被截断元素必须带 `title`（或等价可访问名称）明示完整值；四态图例与差异计数不属于可截断/可折叠对象。
- ac-wide-no-regression: 1440 / 1920 档下状态栏分组顺序（Session → Platform → probe → 图例 → 统计）、分组间距与亮暗两主题配色类不变，单行布局不回退；`levelHeightPx('status')`、`chromeHeightPx('ready')` 与既有 chrome 预算断言保持自洽（若状态栏在窄档增高，只允许窄档增高且预算函数与断言同步更新，不得静默突破 112px 基线而不改断言）。
- ac-regression-tests-existing: 回归断言落在既有测试文件：扩展 `src/renderer/src/workbench/shellLayout.dom.test.tsx`（状态栏可换行结构、图例项数量、计数渲染、分组完整可见）与 `src/renderer/src/workbench/shellLayout.test.ts`（宽度模型在四档下不溢出、宽档单行）；不新建平行套件、不整文件重写。
- ac-test-debt-ratchet: `node scripts/test-debt-gate.mjs` 通过，测试用例数与行数只升不降（不删既有用例、不通过删断言换取通过）。
- ac-code-gates-green: `.munk/code-gates.json` 全部 gate 通过（lint / typecheck / test 等），不新增额外依赖。

## 非目标

- 不改四态口径、计数语义、图例文案与目录专用词表（`DIRECTORY_STATUS_LABEL_KEYS`）。
- 不动扫描 / 哈希 / 缓存 / 快照 / 导出 / 发布通道；不动 `package.json#version`、`CHANGELOG`、`README`、release notes 的版本单点。
- 不调整 app / sessions / events / view-toolbar / panels 五层的布局与预算，只处理 status 层。
- 不重跑 L3 实机验证，不以扩大视口或改证据口径替代修复。
- 不新增 npm 依赖、不引入 emoji、不为通过断言放宽任何门禁或降低 test-debt 基线。
- 不做与本缺陷无关的视觉打磨（主题、图标、间距体系重构）。

## 实现约束

- 主改动锚点：
  - `src/renderer/src/components/StatusBar.tsx`：`StatusBar` footer 的 `overflow-x-auto` / 分组 `shrink-0` 结构；`StatusEntry`、`CompositionLegend` 的 `whitespace-nowrap`；`CompositionLegend` 的 `conflict > 0` 过滤保持原样。
  - `src/renderer/src/workbench/Workbench.tsx` 约 1853–1890：状态栏 children 组装（分隔线、`ml-auto` 统计组、probe 组、legend 组），窄档需要重排/截断时在此处组装。
  - `src/renderer/src/workbench/shellLayout.ts`：`SHELL_LEVELS.status`（`h-8` / `gap-3` / `stackGap: 'gap-0'`）、`levelBandClasses` / `levelRowClasses`、`HEIGHT_PX` / `SPACING_PX`、`chromeHeightPx`；宽度模型建议与既有 `measureToolbar` 同构（纯数据 + `fits/rows`），供测试直接断言。
  - 测试：`src/renderer/src/workbench/shellLayout.dom.test.tsx`（含现有 "keeps the status bar entries and their order"）、`src/renderer/src/workbench/shellLayout.test.ts`；如需覆盖目录图例可复用 `directoryStatusLegend.test.tsx` 的问答式断言，但不新建套件。
- 现场数值可直接作为模型标定：1024 档状态栏内容需求 1415px、视口 1024px；1440 / 1920 档无溢出；1280 档同样溢出。模型在这些输入下的结论必须是 "wrap"，在 1440 / 1920 下必须是 "单行 fits"。
- 可执行性判定若新增纯函数（如状态栏是否换行、图例组是否需独占行），UI 与测试必须共用同一函数，禁止组件内联判定 + 测试另写一套（`AGENTS.md` 硬约束）。
- `SHELL_LEVELS` 的 "同一 CSS 属性不出现两个 utilities" 断言（`shellLayout.test.ts` 的 level class helpers）与 `levelBandClasses` / `levelRowClasses` 契约需继续成立；如需 status 专用的换行类，走新增 helper 而不是在 band 里叠第二份 `gap-*`/`px-*`。
- jsdom 无布局引擎：溢出/可见性断言需以"类结构 + `shellLayout` 宽度模型数值"表达（可在测试里替换 `clientWidth` 模拟四档，参考 `directoryStatusLegend.test.tsx` 的 `clientWidth` 覆写），不得依赖 jsdom 的真实 `scrollWidth`。
- 交付方式：`local_merge`（fold → commit → `munk_local_merge`（advance tip）→ submit），见 `.munk/delivery-intent.md`。
- 基线/口径参考：`.munk/baseline/domains/desktop-shell/product.md`；仓库视觉基线 token 见 `src/renderer/src/assets/main.css`（只引用 token，不写死颜色/尺寸）。
