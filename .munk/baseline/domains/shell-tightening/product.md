# Domain: shell-tightening

工作台壳层的「收紧」契约：在已钉死的 token 与控件三件套之上，把顶栏 / 会话标签 / 视图工具行 / 面板头 / 状态栏压到单行预算，把目录工具行合成一行并把次要动作收进「更多」，把面板头改为可复制地址条，并同步目录树行、代码行、指示条与单词级差异的度量。本域拥有 `workbench/shellLayout.ts` 的层级高度表与工具栏行表、`components/Panel.tsx` 的地址条，以及视图度量常量；会话模型、入口语义、四态口径见域 `workbench`，状态栏宽度与换行模型见域 `status-bar-layout`。

## 范围

- **壳层高度收敛**：`SHELL_LEVELS` 为唯一布局事实源，app 32（`h-8`）→ sessions 28（`h-7`）→ view-toolbar 36（`h-8` + `py-0.5` 单行，`stackGap` 为 `gap-0`）→ panels 头 24（`h-6`）→ status 24（`h-6`）；`events` 瞬时带（notice / 进度）保持 28 且不计入 120px 预算。1280×792 就绪态顶部控件带实测 32 / 28 / 36 / 24 合计 120px。
- **目录工具行合成一行**：一行内顺序固定为「过滤 segmented → 1 个实心主操作 → 12px 组间距 + 1px 竖分隔 → 更多触发器」；快照导入 / 导出（六个方向）、导出 HTML（`report-export`）、隐藏本机路径（`hide-local-paths`）与模板（`template`）不作为行内直接条目，全部从「更多」菜单或设置打开。每屏行内实心主按钮 ≤1。
- **弹性与溢出**：行内不再横向滚动裁切；1024 / 1280 放不下的动作进入「更多」。所有声明条目仍可发现、可点击、结果不变；菜单支持 `Escape` 与点击外部关闭。
- **窄窗工具行模型**：目录工具行由 `shellLayout.ts` 的纯模型按「窗口宽度 + 当前语言」给出单行 / 两行与折叠档，`DirectoryView` 只消费结果、不写宽度常量。折叠阶梯固定为「图例状态词 → 同步主按钮文案 → 行容器换行」；折叠只隐藏文本，按钮、tab、菜单与可访问名全部保留。行容器 `flex-wrap` + `min-h-8`（无固定高、无 `overflow-*`），band 高度按行数取 36 / 72；代码视图工具行不受影响，恒 1 行。
- **面板头地址条**：`Panel.tsx` 头部为单行 24px 可点击地址条——路径超宽省略显示、`title` 给完整路径、点击复制完整路径并给一次可访问反馈（`role="status"` / `aria-live`），全程不做文件系统写操作。复制能力经 `PlatformPort`（含 web 实现）注入，renderer 不直接 import Electron，能力不可用时降级为同样反馈且不抛错。
- **活动面板指示**：活动面板容器无品牌色边框 / 描边，活动态由面板头背景变化 + 左侧 2px 品牌条表达；非活动面板没有该竖条。
- **状态栏与首屏文案**：状态栏单行 ≤24，只保留当前场景的行数 / 条目度量与左右编码、换行（相同只写一次，不同才展开）；删 `shell.status.platform`、四态图例与底部教程 / 样本引导句（`shell.empty.hint` 不再渲染）。状态栏细节模型见域 `status-bar-layout`。
- **视图度量**：目录树行 `DIRECTORY_ROW_HEIGHT === 28`（`src/core/directory/rows.ts` 单源，`TreeView` / 滚动映射 / 行预算共读）；代码行 `DIFF_ROW_HEIGHT === 22`（`components/DiffPane.tsx` 单源，双栏 / 行号栏 / 滚动映射 / 指示条投影共用），正文 12px 等宽、行号与正文同字号同高；指示条轨道 2px，含当前视窗矩形、差异块与 hover 行号，与竖向滚动条间距 6px；单词级差异为柔底色（≤15% 洗色）+ 1px 下划线，深浅主题均无高饱和实色块。
- **证据**：`docs/visual/v1/before/` 四张保持原样；`docs/visual/v1/after/` 新增 directory / file × dark / light 四张 2560×1584 PNG（>100000 字节、已跟踪）；`measurements.md` 增 after 表与顶部控件带实测；新增 `docs/visual/v1/functional-parity.md` 对照 `baseline-facts.json`；两张 README PNG 重拍并更新 `docs/screenshots.md` provenance（captured commit / 字节 / sha256）。
- **首屏样本入口归零**：首屏与工作流工具栏的内置样本入口数为 0，样本只能从设置里的调试入口进入（详见域 `workbench`）。

## 验收

- **ac-shell-band-120**：1280×792 就绪态 `data-shell-level` 的 app / sessions / view-toolbar / panels 头实测高度依次为 32 / 28 / 36 / 24，四项合计 120px 且 ≤120。
- **ac-shell-levels-table**：`SHELL_LEVELS` 中 app / sessions / view-toolbar / panels 的高度解析值恰为 32 / 28 / 36 / 24，`levelHeightPx` 与组件渲染值同源，不存在第二份高度表。
- **ac-toolbar-band-single-row**：单行时 `toolbarBandHeightPx(1) === 36`（含纵向内边距）；目录行在固定阶梯用尽后换行为 2 行，此时 `toolbarBandHeightPx(2) === 72` 且等于 `levelHeightPx('view-toolbar') * rows`；代码视图工具行恒 1 行。
- **ac-statusbar-single-row**：状态栏高度 ≤24，且 `measureStatusBar` 在 1024 / 1280 / 1440 / 1920 四档都只有 1 行。
- **ac-toolbar-row-shape**：目录工具行顺序为「过滤 segmented → 1 个实心主操作 → 12px 间距 + 1px 竖分隔 → 更多触发器」，该行实心主按钮数恰为 1。
- **ac-overflow-secondary**：`snapshot-import` / `snapshot-export`（六个方向动作）/ `report-export` / `hide-local-paths` 不作为工具行直接条目，全部可从「更多」菜单或设置打开。
- **ac-entry-reachability**：每个视图声明的工具条目要么直接渲染在行内、要么在打开的「更多」菜单内，逐个可见可点击；菜单 `Escape` 与点击外部关闭。
- **ac-no-horizontal-clip**：960 / 1024 / 1280 下目录工具行容器无 `overflow-x*`、无 `scrollbar-none`、无含 `:` 的响应式 token；放不下时换行而非裁切，任何动作都不被右缘裁切。
- **ac-row-fits-zh-en**：对宽度 `{960, 1024, 1280, 1440, 1920}` × 语言 `{zh, en}`，目录工具行模型每一渲染行 `required <= available`，且 `lines.length === rows`；band class 仍等于 `levelBandClasses('view-toolbar')`。
- **ac-reference-widths-one-row**：1024（compact 参考档，zh）与 1280 / 1440 / 1920（zh）模型行数为 1、band 为 36px；zh@1280 图例状态词仍然渲染。
- **ac-collapse-hides-text-only**：折叠档下每个图例 chip 不再渲染状态词文本，但 `title` 与 `aria-label` 都含该状态的本地化词（取 `DIRECTORY_STATUS_LABEL_KEYS`，与行内文案同一份 key）；同步主按钮折叠时 icon-only 且 `aria-label === t('directory.toolbar.previewSync')`；未折叠时文案逐字不变。
- **ac-collapse-order**：折叠阶梯固定为「图例状态词 → 同步主按钮文案 → 行容器换行」；filter 的 5 个 `role="tab"`、direction / mode 两个 `tablist`、同步按钮、更多触发器在 960 与 1920 都不得被折叠进菜单或被移除。
- **ac-no-entry-removed**：960 zh / en 下 DOM 仍含 filter 5 tab、direction 2 tab、mode 2 tab、同步按钮、更多按钮、当前可见的图例 chip；`entriesFor('view-toolbar', 'directory')` 与「更多」菜单条目集合和收紧前完全一致。
- **ac-primary-action-preserved**：行内主操作仍调用原预览 / 应用回调，产出与改动前一致（同一 preview 结果、同一计数）。
- **ac-address-bar**：面板头为单行 24px 地址条；路径超宽省略，hover 显示完整路径，点击复制完整路径并出现一次可访问反馈（`role="status"` 或 `aria-live`），全程无文件系统写调用。
- **ac-address-bar-port**：复制能力经 `PlatformPort`（含 web 实现）注入，renderer 不直接 import Electron；能力不可用时降级为同样反馈且不抛错。
- **ac-active-panel-indicator**：活动面板容器无品牌色边框 / 描边，活动态由面板头背景变化 + 左侧 2px 品牌条表达；非活动面板没有该竖条。
- **ac-statusbar-content**：状态栏不再渲染 `shell.status.platform`，不含四态图例，只剩行数 / 条目度量与编码换行信息。
- **ac-encoding-dedupe**：左右编码相同只出现一次，不同才分别展开；左右换行同规则。
- **ac-no-tutorial-copy**：首屏与状态栏不出现教程 / 内置样本引导句（`shell.empty.hint` 文案不再渲染）。
- **ac-tree-row-28**：`DIRECTORY_ROW_HEIGHT === 28`，目录树每行渲染高度 28。
- **ac-code-row-22**：`DIFF_ROW_HEIGHT === 22`，双栏、行号栏、滚动映射与指示条投影共用该常量。
- **ac-code-font-12**：差异正文 12px 等宽字体，行号与正文同字号同高。
- **ac-ruler-2px**：指示条轨道实测 2px；轨道上有当前视窗矩形与差异块；hover 显示行号；轨道与竖向滚动条间距 6px。
- **ac-inline-subtle**：单词级差异为柔底色 + 1px 下划线，深浅两套主题均无高饱和实色块。
- **ac-shape-hue-budget**：1280×792 下控件形状 ≤3 种、界面色相 ≤4（蓝 / 绿 / 红 / 琥珀，中性灰不计），由 token / 形状清单断言。
- **ac-before-after-shots**：`docs/visual/v1/before/` 四张保持原样；`docs/visual/v1/after/` 新增 directory / file × dark / light 四张 2560×1584 PNG（>100000 字节、已跟踪），`measurements.md` 同时登记 before / after 两表与顶部控件带实测值。
- **ac-readme-provenance**：两张 README PNG 重拍为 2560×1584，`docs/screenshots.md` 更新 captured commit / 字节 / sha256，`release-artifacts-and-brand` 的「captured commit 到 HEAD 的 `src/renderer` 零 diff」门禁仍绿。
- **ac-functional-parity**：四态计数 6/4/4/5、三组忽略开关默认 false/true/true、目录 HTML 导出 5367 字节与 sha256 `8cfacec9…a69b` 与 `docs/visual/v1/baseline-facts.json` 逐项相等，由测试实读该文件并复算。
- **ac-demo-entry-zero**：首屏与工作流工具栏的内置样本入口数 = 0，样本只能从设置里的调试入口进入。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `node scripts/test-debt-gate.mjs` 全绿，且 test-debt 声明本项新增断言。

## 非目标

- 不改对比语义、四态口径（仍 5 项 `DiffStatus`，界面只呈现四态）、快照格式、导出逻辑、扫描 / 合并算法、发布通道。
- 不改任何动作的结果与文案含义；「更多」只是收纳，不是删除或改写。
- 不新增 npm 依赖、不换图标库、不接 CDN、不做组件库迁移。
- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、README 版本指针；不建 tag / Release / 资产。
- 不做 <960 窄屏与移动端适配，不做整站品牌改版、动画炫技。
- 不改其他视图（code-diff / code-merge / csv / structured）的工具行排布与 class；目录行换行不外溢到这些视图。
- 不引响应式断点类、不做运行时像素测量（判定只依赖窗口宽度 + 当前语言）、不做横向滚动兜底、不新增依赖；不新增 / 删除工具行入口，不改「更多」菜单内容与顺序。
- 不在本项内跑 L3 真机验收（由产品侧另一场 ops 任务执行），不创建新证据体系以外的目录。
- 不重设 token 值（字号 / 行高 / 间距 / 圆角 / 控件高 / 色板沿用前一项已钉死的 `main.css`），不改 `REFERENCE_VIEWPORT_HEIGHT_PX`（保持 768 的保守预算基准，792 只用于证据实测）。

## 实现约束

- **单一布局事实源**：所有壳层高度、条目清单、宽度预算继续写在 `src/renderer/src/workbench/shellLayout.ts`（`SHELL_LEVELS` / `TOOLBAR_ROWS` / `entriesFor` / `measureToolbar` / `toolbarBandHeightPx` / `viewToolbarRows`），组件与测试都读同一份数据；禁止在 JSX 里另写行高或宽度常量。
- **高度落脚**：app `h-8`(32)、sessions `h-7`(28)、view-toolbar `h-8` + `py-0.5`（单行合计 36，`stackGap` 为 `gap-0`）、panels `h-6`(24)、status `h-6`(24)；`CHROME_BASELINE_PX` 按新值重算为 84，不得放宽成「小于等于旧值」。瞬时 `events` 带保持现状。
- **溢出收纳**：`TOOLBAR_ROWS` 的 `overflow` 是「更多」菜单唯一来源；行内条目与 `overflow` 条目的并集仍等于该视图声明的入口集合，`entriesFor` 与 DOM 集合一致；菜单复用既有 `DropdownMenu`，不新建弹出层。
- **窄窗模型单源**：控件宽度表 `DIRECTORY_TOOLBAR_WIDTHS`（zh / en 各一套，图例按最多 4 位计数预留）、折叠阶梯 `measureDirectoryToolbar(width, locale)`、行容器 class `directoryToolbarRowClasses()` 全部在 `shellLayout.ts`，`DirectoryView.tsx` 只读结果；`TOOLBAR_ROWS` 的目录行控件宽度取 `DIRECTORY_TOOLBAR_WIDTHS.zh`，不得另写一份数字。JSX 不写宽度常量、不用 Tailwind 响应式前缀分档，`shellLayout.ts` 保持零 DOM / 零 Electron。
- **折叠只隐藏文本**：`CompositionLegend` 的 `showLabels`（默认 `true`，其他调用点不受影响）控制是否渲染状态词，chip 用 `title` + `aria-label`（复用 `DIRECTORY_STATUS_LABEL_KEYS`）；同步主按钮折叠时 icon-only 并带 `aria-label = t('directory.toolbar.previewSync')`；不新增文案 key。
- **控件复用**：主操作、次要动作、更多触发器复用既有 `components/Button.tsx`、`DropdownMenu.tsx`、`SegmentedControl.tsx`；开关仍是单一 `components/Checkbox.tsx`，不得新增第二套开关控件；控件高度只走 `--height-control-sm/md`，间距只用 4/8/12/16/24，圆角只用 4/6/8（`--radius-lg` 已删除）。
- **视图常量单源**：树行高只改 `src/core/directory/rows.ts` 的 `DIRECTORY_ROW_HEIGHT` 并让 `TreeView` / 滚动映射 / 行预算全部读它；代码行高只改 `components/DiffPane.tsx` 的 `DIFF_ROW_HEIGHT`，`DiffRuler` 与 `CodeView` 继续从这里取值，禁止复制常量。
- **地址条复制**：剪贴板能力在 `src/shared/platform/types.ts` 增端口方法 + `src/preload`、`src/main` IPC 白名单 + web 实现，renderer 侧只经 `PlatformPort` 调用；不得在 renderer import Electron，也不得在测试里依赖真实剪贴板。
- **截图时序**：`src/main/release-artifacts-and-brand.test.ts` 要求 captured commit 是 HEAD 祖先且 `src/renderer` 自该 commit 零 diff。因此先提交渲染层改动，再在该 commit 上 `pnpm build` + 截图脚本重拍，`docs/screenshots.md` 记录该 commit；截图与文档落在其后的交付提交里。`docs/visual/v1/before/` 四张不得覆盖。
- **捕获脚本**：复用既有 `scripts/capture-readme-screenshots.mjs` 与 `scripts/capture-visual-baseline.mjs` 的真实构建 + 真实 `/tmp` 目录 / 文件对路径，禁止用 `src/shared/fixtures/**` 摆拍；`after/` 图沿用 1280×792 逻辑视口、2× 像素密度。
- **文案与本地化**：新增 / 删除文案键必须 en / zh 同步并过 `messages.test`；不能把工程口吻换成另一种工程口吻。
- **门禁边界**：可回归行为写进 `code_gates`（既有 gate 加相关单测），浏览器 / 设备 / 桌面 GUI 检查不在本项范围内。

## 最近交付证明

- WI：`wi_intake_c4097ed1a9ec9d00`（修窄窗工具栏溢出与浅色图例对比度，`kind: fix`）
- 日期：2026-11-05
- 结果：code_gates passed（29 gates，attempt 002；`pnpm test` 140 files / 2237 passed + 1 skipped / 2238）。
- 覆盖摘要：`shellLayout.ts` 新增 `DIRECTORY_TOOLBAR_WIDTHS`（zh / en 实测宽度 + 图例 4 位计数预留）、`measureDirectoryToolbar`（阶梯 none → legend → sync → wrap，贪心分行）与 `directoryToolbarRowClasses()`（`flex-wrap` + `min-h-8`，无 `overflow-*` / 无 `:` token）；`DirectoryView` 改读 `useWindowWidth` + 语言并把 `showLabels` / 同步按钮 `aria-label` 接到模型；`TOOLBAR_ROWS` 目录行控件宽度改由 zh 表供给；实测 zh@960/1024 折叠到 legend / sync，en@960 换 2 行（band 72），1024 / 1280 / 1440 / 1920 zh 仍单行 36px 且 zh@1280 保留状态词。同批把亮色五个 `--color-diff-*` 前景加深到对 chip 底 ≥ 4.5:1（该半边归域 `theme`）。
- 注：本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无用例可 copy、无 tech / ux 手合。**被推翻的假设**：① 「视图工具条带恒 1 行」不再成立——目录行允许换行，band 高度改按行数派生；② `controlPresentation('legend', 'compact')` 由 `label` 改为 `icon-only`，DOM 里对 `view-toolbar` 的 `flex-wrap` 禁令反转为「必须 `flex-wrap` 且无横向滚动」；③ `TOOLBAR_ROWS` 的目录行宽度不再手写数字，改引 `DIRECTORY_TOOLBAR_WIDTHS`。后续若改图例文案长度或计数位数，只改宽度表，别在 JSX 分档。
