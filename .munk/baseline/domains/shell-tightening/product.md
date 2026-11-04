# Domain: shell-tightening

工作台壳层的「收紧」契约：在已钉死的 token 与控件三件套之上，把顶栏 / 会话标签 / 视图工具行 / 面板头 / 状态栏压到单行预算，把目录工具行合成一行并把次要动作收进「更多」，把面板头改为可复制地址条，并同步目录树行、代码行、指示条与单词级差异的度量。本域拥有 `workbench/shellLayout.ts` 的层级高度表与工具栏行表、`components/Panel.tsx` 的地址条，以及视图度量常量；会话模型、入口语义、四态口径见域 `workbench`，状态栏宽度与换行模型见域 `status-bar-layout`。

## 范围

- **壳层高度收敛**：`SHELL_LEVELS` 为唯一布局事实源，app 32（`h-8`）→ sessions 28（`h-7`）→ view-toolbar 单行 36（`2 + 32 + 2`）/ 两行 72（`2 + 32 + 4 + 32 + 2`）→ panels 头 24（`h-6`）→ status 24（`h-6`）；`events` 瞬时带（notice / 进度）保持 28 且不计入 120px 预算。1280×792 就绪态顶部控件带实测 32 / 28 / 36 / 24 合计 120px。
- **目录工具行合成一行**：一行内顺序固定为「过滤 segmented → 1 个实心主操作 → 12px 组间距 + 1px 竖分隔 → 更多触发器」；快照导入 / 导出（六个方向）、导出 HTML（`report-export`）、隐藏本机路径（`hide-local-paths`）与模板（`template`）不作为行内直接条目，全部从「更多」菜单或设置打开。每屏行内实心主按钮 ≤1。
- **弹性与溢出**：行内不再横向滚动裁切；1024 / 1280 放不下的动作进入「更多」。所有声明条目仍可发现、可点击、结果不变；菜单支持 `Escape` 与点击外部关闭。
- **「更多」菜单落位**：菜单落位由零 DOM 纯函数 `placeDropdownMenu`（`components/menuPlacement.ts`）按实测触发器 / 菜单矩形决定 `top` / `left` / `maxHeight`：下方放得下→下方；下方不足且上方放得下→向上翻转；两侧都不足→视口边距内夹取并给视口高度上限。验收视口（en@960 / en@1024，innerHeight 800）下 9 条完整可见、无内部滚动条，菜单不靠滚动藏条目。
- **窄窗工具行模型**：目录工具行由 `shellLayout.ts` 的纯模型按「窗口宽度 + 当前语言」给出单行 / 两行与折叠档，`DirectoryView` 只消费结果、不写宽度常量。折叠阶梯固定为「图例状态词 → 同步主按钮文案 → 行容器换行」；折叠只隐藏文本，按钮、tab、菜单与可访问名全部保留。行容器 `flex-wrap` + `gap-x-2 gap-y-1` + `min-h-8`（无固定高、无 `overflow-*`），每个直接子项至少 32 高，故每一 flex 行恰为 32、两行恒为 72；控件外框 ≤32（`SegmentedControl` 用 `px-1 py-0`，tab 仍 `h-[30px]` + 上下 1px border）。band 高度由 `toolbarBandHeightPx(rows)` 派生 36 / 72；代码视图工具行不受影响，恒 1 行。
- **面板头地址条**：`Panel.tsx` 头部为单行 24px 可点击地址条——路径超宽省略显示、`title` 给完整路径、点击复制完整路径并给一次可访问反馈（`role="status"` / `aria-live`），全程不做文件系统写操作。复制能力经 `PlatformPort`（含 web 实现）注入，renderer 不直接 import Electron，能力不可用时降级为同样反馈且不抛错。
- **活动面板指示**：活动面板容器无品牌色边框 / 描边，活动态由面板头背景变化 + 左侧 2px 品牌条表达；非活动面板没有该竖条。
- **状态栏与首屏文案**：状态栏单行 ≤24，只保留当前场景的行数 / 条目度量与左右编码、换行（相同只写一次，不同才展开）；删 `shell.status.platform`、四态图例与底部教程 / 样本引导句（`shell.empty.hint` 不再渲染）。状态栏细节模型见域 `status-bar-layout`。
- **视图度量**：目录树行 `DIRECTORY_ROW_HEIGHT === 28`（`src/core/directory/rows.ts` 单源，`TreeView` / 滚动映射 / 行预算共读）；代码行 `DIFF_ROW_HEIGHT === 22`（`components/DiffPane.tsx` 单源，双栏 / 行号栏 / 滚动映射 / 指示条投影共用），正文 12px 等宽、行号与正文同字号同高；指示条轨道 2px，含当前视窗矩形、差异块与 hover 行号，与竖向滚动条间距 6px；单词级差异为柔底色（≤15% 洗色）+ 1px 下划线，深浅主题均无高饱和实色块。
- **证据**：`docs/visual/v1/before/` 四张保持原样；`docs/visual/v1/after/` 新增 directory / file × dark / light 四张 2560×1584 PNG（>100000 字节、已跟踪）；`measurements.md` 增 after 表与顶部控件带实测；新增 `docs/visual/v1/functional-parity.md` 对照 `baseline-facts.json`；两张 README PNG 重拍并更新 `docs/screenshots.md` provenance（captured commit / 字节 / sha256）。
- **首屏样本入口归零**：首屏与工作流工具栏的内置样本入口数为 0，样本只能从设置里的调试入口进入（详见域 `workbench`）。

## 验收

- **ac-shell-band-120**：1280×792 就绪态 `data-shell-level` 的 app / sessions / view-toolbar / panels 头实测高度依次为 **32 / 28 / 36 / 24**，四项合计恰为 120px 且 ≤120（既有断言只加强，不放宽）。
- **ac-shell-levels-table**：`SHELL_LEVELS` 中 app / sessions / view-toolbar / panels 的高度解析值恰为 32 / 28 / 36 / 24，`levelHeightPx` 与组件渲染值同源，不存在第二份高度表。
- **ac-band-single-36**：1280×792、zh、目录就绪态下 `[data-shell-level="view-toolbar"]` 的 `getBoundingClientRect().height === 36`；该 band 与其唯一行容器的 `scrollHeight === clientHeight`。
- **ac-band-wrapped-72**：en、innerHeight 800 下，960 与 1024 两档发生换行的 band 高度都 `=== 72`，两次实测值完全相等；band 与行容器 `scrollHeight === clientHeight`。
- **ac-band-zero-clip**：单行（1280）与两行（en@960、en@1024）下，行内任一控件的 `getBoundingClientRect().bottom <= band.bottom`；不存在纵向裁切，页脚 / 下沿无遮挡。
- **ac-zh-single-row**：zh 在 960 / 1024 / 1280 三档均为单行，band 高度 `=== 36`，`measureDirectoryToolbar` 的 `rows === 1`。
- **ac-control-height-32**：目录行内控件渲染高度 `<= 32`；`SegmentedControl` 外框恰为 32（`px-1 py-0`，tab 仍 `h-[30px]`，上下 border 各 1px），水平投影宽度不变；band / 行高不靠 `overflow-hidden`、负 margin 或裁切得到。
- **ac-band-arithmetic**：高度算术精确命中——单行 `2 + 32 + 2 = 36`，两行 `2 + 32 + 4 + 32 + 2 = 72`；行容器横向 gap 仍为 8，纵向 gap 为 4。
- **ac-band-height-pure**：`toolbarBandHeightPx(1) === 36`、`toolbarBandHeightPx(2) === 72`，由纯函数 / 常量表达并被单测钉死；行高 32 与控件最大高度 32 也由测试钉住；行高不随落入哪几个控件或语言漂移。
- **ac-more-menu-in-viewport**：en@960 与 en@1024（innerHeight 800）打开「更多」菜单后，9 个 `menuitem` 的 `top >= 0` 且 `bottom <= 800`；菜单与各条目完整可见，菜单 `scrollHeight === clientHeight`（不出现内部滚动条藏条目）。
- **ac-more-menu-last-action**：上述两档下每个条目可点击；末条「隐藏本机路径」点击后真实切换 `hideLocalPaths`（选中标记与状态回传均变化）；`Escape` 与点击菜单外部仍关闭菜单。
- **ac-menu-placement**：菜单落位由可单测的纯函数决定：下方放得下→下方；下方不足且上方放得下→向上翻转；两侧都不足→在视口边距内夹取（clamped）并给不超过视口的高度上限；验收视口下不得触发内部滚动。
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
- **ac-after-shots-refreshed**：四张 `docs/visual/v1/after/{directory-dark,directory-light,file-dark,file-light}.png` 由当前渲染层所在树先 `pnpm build`、再 `node scripts/capture-visual-baseline.mjs --out=after` 重新生成并覆盖；mtime / 内容来自本次构建而非旧 commit（旧图停在渲染层改动前的 44px 顶部带形态，不得复用）。
- **ac-after-shot-pixels**：四张 after PNG 均为 2560×1584（1280×792 逻辑 × DPR2），目录视图 × 文件视图 × 深 / 浅两套主题齐全。
- **ac-after-bytes-match**：`measurements.md` after 表 Bytes 列四个数值与四张 PNG 的 `wc -c` 实测逐张相等；若不等于旧值（236587 / 239477 / 296666 / 295538）须有实测命令输出佐证，不得沿用旧值。
- **ac-after-binding-commit**：`measurements.md` 的 `## after/` 绑定 commit 等于截图时分支 HEAD 的完整 40 位 sha（本次 `37d481b`），且全文不再出现旧绑定 `3b8cfe3`。
- **ac-top-band-measured**：Top control band 表的 `app` / `sessions` / `view-toolbar` / `panels` header / `status` 五级数值取自真实构建窗口 `getBoundingClientRect()`（截图脚本 `MEASURE_EXPRESSION` 打印的 metrics），Ready-state band total 等于 `app + sessions + view-toolbar + panelHeader` 且 ≤120；禁止按 `SHELL_LEVELS` 常量手算或照抄旧文档。
- **ac-view-toolbar-36**：1280×792 就绪态 `view-toolbar` 实测 36px；若窄档实测到 72px 则按实测记录并注明档位，不得凭常量臆写。
- **ac-unchanged-values-preserved**：旧表中与本次实测相同的行逐字保留（数值与描述不变），只有实测变化的数字被修改。
- **ac-real-inputs**：截图输入为真实 `/tmp` 临时目录对与真实 `src/session.ts` 文件对照，经应用真实启动入口打开，不使用 `src/shared/fixtures/**` 摆拍。
- **ac-before-untouched**：`docs/visual/v1/before/` 四张 PNG 的字节数与 sha256 与改动前完全一致，未被重拍或改写。
- **ac-whitelist-diff**：相对本项起点（`37d481b`）的 `git diff --stat` 只含 `docs/visual/v1/after/` 四张 PNG、`docs/visual/v1/measurements.md` 与本项 change pack / 交付账本；不含 `src/**`、`scripts/**`、`package.json`、`README*`、`docs/release-notes/**`、`CHANGELOG*`、release workflow、`docs/assets/**`。
- **ac-new-defect-reported**：截图暴露的新视觉缺陷不做任何修复改动，只在交付说明中列明现象、截图文件与建议，交回产品负责人。
- **ac-delivery-receipt**：交付回执逐项点名截图所用 commit sha、四张 PNG 字节数、`code_gates` 证据路径，数值均为可复核实测。
- **ac-readme-provenance**：两张 README PNG 重拍为 2560×1584，`docs/screenshots.md` 更新 captured commit / 字节 / sha256，`release-artifacts-and-brand` 的「captured commit 到 HEAD 的 `src/renderer` 零 diff」门禁仍绿。
- **ac-readme-screenshots**：用最终合入构建按 1280×792 逻辑视口 / DPR2 重出两张 README PNG；`docs/screenshots.md` 更新 captured commit、字节数与两枚 sha256；captured commit 是 HEAD 祖先且 `src/renderer` 自该 commit 零 diff；`README.md` / `README.zh-CN.md` 的 `Latest public release: v0.2.19` 指针不动。
- **ac-functional-parity**：四态计数 6/4/4/5、三组忽略开关默认 false/true/true、目录 HTML 导出 5367 字节与 sha256 `8cfacec9…a69b` 与 `docs/visual/v1/baseline-facts.json` 逐项相等，由测试实读该文件并复算。
- **ac-demo-entry-zero**：首屏与工作流工具栏的内置样本入口数 = 0，样本只能从设置里的调试入口进入。
- **ac-no-assertion-weakening**：既有 `ac-shell-band-120` 与 `ac-collapse-hides-text-only` 的断言只允许新增 / 加强；不得为过门删除、跳过或放宽既有断言；与既有断言冲突时先说明再改。
- **ac-zero-change-redlines**：四态计数 48/2/2/27、状态栏差异 31、文件 77/77 不变；light 四态前景对比度维持 4.78 / 4.66 / 4.60 / 4.62（均 ≥4.5），dark 6.41 / 6.47 / 5.16 / 6.51 不回退；目录工具行横向 `scrollWidth === clientWidth`，无 `overflow-x` 兜底与横向裁切；对比语义、四态口径、导出、快照、发布通道零改动；不新增依赖、不动图标库、不改 `package.json#version` 与 `CHANGELOG.md`。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `node scripts/test-debt-gate.mjs` 全绿；test-debt 以 growth 声明本项新增用例（`from` = 当前 ceiling、`to` = 新 ceiling，floors 只升不降），不删用例、不放宽既有断言。

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
- **高度落脚**：app `h-8`(32)、sessions `h-7`(28)、view-toolbar 单行 36 / 两行 72（行高 32、纵向 gap 4、band `py-0.5` 2+2；`levelHeightPx('view-toolbar')` 仍为 36）、panels `h-6`(24)、status `h-6`(24)；`CHROME_BASELINE_PX` 按新值重算为 84，不得放宽成「小于等于旧值」。瞬时 `events` 带保持现状。
- **溢出收纳**：`TOOLBAR_ROWS` 的 `overflow` 是「更多」菜单唯一来源；行内条目与 `overflow` 条目的并集仍等于该视图声明的入口集合，`entriesFor` 与 DOM 集合一致；菜单复用既有 `DropdownMenu`，不新建弹出层。
- **窄窗模型单源**：控件宽度表 `DIRECTORY_TOOLBAR_WIDTHS`（zh / en 各一套，图例按最多 4 位计数预留）、折叠阶梯 `measureDirectoryToolbar(width, locale)`、行容器 class `directoryToolbarRowClasses()`、行高常量 `TOOLBAR_ROW_HEIGHT_PX = 32` / `TOOLBAR_ROW_GAP_PX = 4` / `TOOLBAR_BAND_PADDING_Y_PX = 2` 全部在 `shellLayout.ts`；`toolbarBandHeightPx(rows)` 显式写 `rows*32 + (rows-1)*4 + 2*2`，`DirectoryView.tsx` 只读结果；`TOOLBAR_ROWS` 的目录行控件宽度取 `DIRECTORY_TOOLBAR_WIDTHS.zh`，不得另写一份数字。JSX 不写宽度 / 高度常量、不用 Tailwind 响应式前缀分档，`shellLayout.ts` 保持零 DOM / 零 Electron。
- **折叠只隐藏文本**：`CompositionLegend` 的 `showLabels`（默认 `true`，其他调用点不受影响）控制是否渲染状态词，chip 用 `title` + `aria-label`（复用 `DIRECTORY_STATUS_LABEL_KEYS`）；同步主按钮折叠时 icon-only 并带 `aria-label = t('directory.toolbar.previewSync')`；不新增文案 key。
- **行高与控件高度**：`directoryToolbarRowClasses()` 用 `gap-x-2 gap-y-1`（横 8 / 纵 4）且每个直接子项 `min-h-8`，保证每一 flex 行恰 32、两行恒 72、不随语言或控件组合漂移；`SegmentedControl` 只收纵向内边距（`p-1` → `px-1 py-0`，tab 仍 `h-[30px]` + 1px border = 32），水平投影宽度不变；不得用 `overflow-hidden`、负 margin 或裁切换取高度，也不得让行 class 含 `:`。
- **菜单落位纯函数**：`components/menuPlacement.ts` 的 `placeDropdownMenu` 零 DOM，按触发器 / 菜单矩形返回 `below` / `above` / `clamped` 的 `top` / `left` / `width` / `maxHeight`（含 `MENU_GAP_PX` / `MENU_VIEWPORT_MARGIN_PX`）；`DropdownMenu` 用 fixed 定位消费该结果，`Escape` 与外部点击关闭逻辑不变。
- **控件复用**：主操作、次要动作、更多触发器复用既有 `components/Button.tsx`、`DropdownMenu.tsx`、`SegmentedControl.tsx`；开关仍是单一 `components/Checkbox.tsx`，不得新增第二套开关控件；控件高度只走 `--height-control-sm/md`，间距只用 4/8/12/16/24，圆角只用 4/6/8（`--radius-lg` 已删除）。
- **视图常量单源**：树行高只改 `src/core/directory/rows.ts` 的 `DIRECTORY_ROW_HEIGHT` 并让 `TreeView` / 滚动映射 / 行预算全部读它；代码行高只改 `components/DiffPane.tsx` 的 `DIFF_ROW_HEIGHT`，`DiffRuler` 与 `CodeView` 继续从这里取值，禁止复制常量。
- **地址条复制**：剪贴板能力在 `src/shared/platform/types.ts` 增端口方法 + `src/preload`、`src/main` IPC 白名单 + web 实现，renderer 侧只经 `PlatformPort` 调用；不得在 renderer import Electron，也不得在测试里依赖真实剪贴板。
- **截图时序**：`src/main/release-artifacts-and-brand.test.ts` 要求 captured commit 是 HEAD 祖先且 `src/renderer` 自该 commit 零 diff。因此先提交渲染层改动，再在该 commit 上 `pnpm build` + 截图脚本重拍，`docs/screenshots.md` 记录该 commit；截图与文档落在其后的交付提交里。`docs/visual/v1/before/` 四张不得覆盖。
- **捕获脚本**：复用既有 `scripts/capture-readme-screenshots.mjs` 与 `scripts/capture-visual-baseline.mjs` 的真实构建 + 真实 `/tmp` 目录 / 文件对路径，禁止用 `src/shared/fixtures/**` 摆拍；`after/` 图沿用 1280×792 逻辑视口、2× 像素密度。
- **文案与本地化**：新增 / 删除文案键必须 en / zh 同步并过 `messages.test`；不能把工程口吻换成另一种工程口吻。
- **门禁边界**：可回归行为写进 `code_gates`（既有 gate 加相关单测），浏览器 / 设备 / 桌面 GUI 检查不在本项范围内。

## 最近交付证明

- WI：`wi_intake_2ad3d38cc7b3f12e`（刷新 v1「改后」视觉证据并重钉 after 绑定，`kind: fix`）
- 日期：2026-11-05
- 结果：code_gates passed（29 gates，attempt 001，`.munk/runs/run_intake_2ad3d38cc7b3f12e/code-gates/attempts/001`）。
- 覆盖摘要：在 `37d481b`（= `origin/main`）树上 `pnpm build` + `node scripts/capture-visual-baseline.mjs --out=after` 重出四张 after PNG 并覆盖，`measurements.md` 的 `## after/` 绑定 commit 由 `3b8cfe3` 改为 `37d481b21bd3b22395e0b2c555b297b3dd89a6d8`（全文已无 `3b8cfe3`），Bytes 列改为实测 235248 / 239140 / 297243 / 296190。顶部控件带五级实测（`app` 32 / `sessions` 28 / `view-toolbar` 36 / `panels` header 24 / `status` 24，Ready-state total 120）与旧表逐字相同，按「只改变化值」原则未动；`before/` 四张字节与 sha256 零变化。四张图均 2560×1584。
- 注：本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无用例可 copy、无 tech / ux 手合。**被推翻的假设 / 后续注意**：① 「渲染层改动后 after 证据自动仍有效」不成立——`11cbdaa`（工具栏溢出 / light 对比度）与 `0ce2879`（band 36/72 + 「更多」菜单）改了 `src/renderer` 16 文件，旧截图顶部带仍是 44px 形态；**凡合入改渲染层的 WI，若验收依赖 after 图，必须同批重拍并重钉绑定 commit**。② 顶部带数值本次未变（36/72 档位在 1280 就绪态仍命中单行 36），故 `measurements.md` 该表不得为了「显得刷新过」而改写。③ 四张 PNG 字节全部变化（236587→235248、239477→239140、296666→297243、295538→296190），像素级证据只能按字节 / 生成 commit 判断是否过期，不能按尺寸判断。④ 本项只出证据：`src/**`、`scripts/**`、`package.json`、README、release notes 一律未改，新视觉缺陷只报不修。
