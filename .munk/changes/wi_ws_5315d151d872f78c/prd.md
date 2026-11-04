# 主界面布局收紧与视图修正

## 范围

前置 `wi_ws_11bf921b1e0e06f2` 已把唯一 token 源与控件三件套合入 main（`main.css` 字号 11/12/13/14/15、行高 16/18/20/24、间距 4/8/12/16/24、圆角 4/6/8、控件高 28/32/36；Button / Checkbox / 20px Chip / 30px 下划线 Tab）。本子项只在其上收主界面，不改任何动作的结果。

1. **壳层高度收敛**：`src/renderer/src/workbench/shellLayout.ts` 仍是布局唯一事实源。应用标题 32、会话标签 28、上下文工具条 36（单行）、面板头 24；就绪态顶部控件带合计 120px。状态栏收紧到单行、高度 ≤24。
2. **目录工具条合成一行**：`src/renderer/src/views/DirectoryView.tsx` 现有三排堆叠动作（过滤/图例 + 左右取路径 + 同步方向/模式 + 模板 + 快照 ×6 + HTML 导出 + 隐藏本地路径）合并为一行：`过滤 segmented` → `1 个实心主操作` → `12px 组间 + 1px 竖分隔` → `更多`。快照导入/导出 ×6、导出 HTML、隐藏本地路径进「更多」或设置；主操作每屏 ≤1 个实心按钮。
3. **工具行弹性 + 溢出**：行内不再横向滚动裁切；1024 / 1280 宽度下放不下的动作进入「更多」菜单。所有声明条目仍可发现、可点击、结果不变；菜单支持 Escape 与点击外部关闭。
4. **面板头改地址条**：`src/renderer/src/components/Panel.tsx` 头部为单行可点击地址条（省略显示、hover 完整路径、点击复制完整路径 + 一次可访问反馈，不做文件系统写操作）。活动面板不用品牌色边框，改用面板头背景 + 左侧 2px 品牌条表达。
5. **状态栏文案**：只保留当前场景的行数/条目度量与编码换行；删 `Platform` 工程口吻、删底部教程/样本引导句、删与过滤行重复的四态图例。左右编码与换行相同只写一次，不同才展开。
6. **视图度量**：目录树行 28（`DIRECTORY_ROW_HEIGHT`）、代码行 22（`DIFF_ROW_HEIGHT`）、差异正文 12px 等宽且行号同步；右侧指示条 2px 轨道 + 当前视窗矩形 + 差异块 + hover 行号，与竖向滚动条留 6px；单词级差异改柔底色 + 1px 下划线。
7. **证据**：重拍深浅两套目录/文件截图（`docs/visual/v1/after/`），保留 `before/` 不动；重拍两张 README 图并重钉 `docs/screenshots.md` provenance；`docs/visual/v1/measurements.md` 增加 after 表与顶部控件带实测；新增 `docs/visual/v1/functional-parity.md` 对照 `baseline-facts.json`。

## 验收

- ac-shell-band-120: 1280×792 就绪态下 `data-shell-level` 的 app / sessions / view-toolbar / panels 头实测高度依次为 32 / 28 / 36 / 24，四项合计 120px 且 ≤120。
- ac-shell-levels-table: `SHELL_LEVELS` 中 app / sessions / view-toolbar / panels 的高度解析值恰为 32 / 28 / 36 / 24，`levelHeightPx` 与组件渲染值同源，不存在第二份高度表。
- ac-toolbar-band-single-row: 视图工具条带只渲染 1 行，`toolbarBandHeightPx(1) === 36`（含纵向内边距），目录/代码视图均无第二、第三排动作。
- ac-statusbar-single-row: 状态栏高度 ≤24，且 `measureStatusBar` 在 1024 / 1280 / 1440 / 1920 四档都只有 1 行。
- ac-toolbar-row-shape: 目录工具行顺序为「过滤 segmented → 1 个实心主操作 → 12px 间距 + 1px 竖分隔 → 更多触发器」，该行实心主按钮数恰为 1。
- ac-overflow-secondary: `snapshot-import` / `snapshot-export`（六个方向动作）/ `report-export` / `hide-local-paths` 不作为工具行直接条目，全部可从「更多」菜单或设置打开。
- ac-entry-reachability: 每个视图声明的工具条目要么直接渲染在行内、要么在打开的「更多」菜单内，逐个可见可点击；菜单 Escape 与点击外部关闭。
- ac-no-horizontal-clip: 1024 与 1280 宽度下工具行 `scrollWidth <= clientWidth`，行容器无 `overflow-x-auto`，任何动作都不被右缘裁切。
- ac-primary-action-preserved: 行内主操作仍调用原预览/应用回调，产出与改动前一致（同一 preview 结果、同一计数）。
- ac-address-bar: 面板头为单行 24px 的地址条；路径超宽省略，hover 显示完整路径，点击复制完整路径并出现一次可访问反馈（`role="status"` 或 `aria-live`），全程无文件系统写调用。
- ac-address-bar-port: 复制能力经 `PlatformPort`（含 web 实现）注入，renderer 不直接 import Electron；能力不可用时降级为同样反馈且不抛错。
- ac-active-panel-indicator: 活动面板容器无品牌色边框/描边，活动态由面板头背景变化 + 左侧 2px 品牌条表达；非活动面板没有该竖条。
- ac-statusbar-content: 状态栏不再渲染 `shell.status.platform`，不含四态图例，只剩行数/条目度量与编码换行信息。
- ac-encoding-dedupe: 左右编码相同只出现一次，不同才分别展开；左右换行同规则。
- ac-no-tutorial-copy: 首屏与状态栏不出现教程/内置样本引导句（`shell.empty.hint` 文案不再渲染）。
- ac-tree-row-28: `DIRECTORY_ROW_HEIGHT === 28`，目录树每行渲染高度 28。
- ac-code-row-22: `DIFF_ROW_HEIGHT === 22`，双栏、行号栏、滚动映射与指示条投影共用该常量。
- ac-code-font-12: 差异正文 12px 等宽字体，行号与正文同字号同高。
- ac-ruler-2px: 指示条轨道实测 2px；轨道上有当前视窗矩形与差异块；hover 显示行号；轨道与竖向滚动条间距 6px。
- ac-inline-subtle: 单词级差异为柔底色 + 1px 下划线，深浅两套主题均无高饱和实色块。
- ac-shape-hue-budget: 1280×792 下控件形状 ≤3 种、界面色相 ≤4（蓝/绿/红/琥珀，中性灰不计），由 token/形状清单断言。
- ac-before-after-shots: `docs/visual/v1/before/` 四张保持原样；`docs/visual/v1/after/` 新增 directory/file × dark/light 四张 2560×1584 PNG（>100000 字节、已跟踪），`measurements.md` 同时登记 before/after 两表与顶部控件带实测值。
- ac-readme-provenance: 两张 README PNG 重拍为 2560×1584，`docs/screenshots.md` 更新 captured commit / 字节 / sha256，`release-artifacts-and-brand` 的「captured commit 到 HEAD 的 `src/renderer` 零 diff」门禁仍绿。
- ac-functional-parity: 四态计数 6/4/4/5、三组忽略开关默认 false/true/true、目录 HTML 导出 5367 字节与 sha256 `8cfacec9…a69b` 与 `docs/visual/v1/baseline-facts.json` 逐项相等，由测试实读该文件并复算。
- ac-demo-entry-zero: 首屏与工作流工具栏的内置样本入口数 = 0，样本只能从设置里的调试入口进入。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `node scripts/test-debt-gate.mjs` 全绿，且 test-debt 声明本项新增断言。

## 非目标

- 不改对比语义、四态口径（仍 5 项 `DiffStatus`，界面只呈现四态）、快照格式、导出逻辑、扫描/合并算法、发布通道。
- 不改任何动作的结果与文案含义；「更多」只是收纳，不是删除或改写。
- 不新增 npm 依赖、不换图标库、不接 CDN、不做组件库迁移。
- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、README 版本指针；不建 tag / Release / 资产。
- 不做 <1024 窄屏与移动端适配，不做整站品牌改版、动画炫技。
- 不在本项内跑 L3 真机验收（由产品侧另一场 ops 任务执行），不创建新证据体系以外的目录。
- 不重设 token 值（字号/行高/间距/圆角/控件高/色板沿用前一项已钉死的 `main.css`），不改 `REFERENCE_VIEWPORT_HEIGHT_PX`（保持 768 的保守预算基准，792 只用于证据实测）。

## 实现约束

- **单一布局事实源**：所有壳层高度、条目清单、宽度预算继续写在 `src/renderer/src/workbench/shellLayout.ts`（`SHELL_LEVELS` / `TOOLBAR_ROWS` / `entriesFor` / `measureToolbar` / `toolbarBandHeightPx`），组件与测试都读同一份数据；禁止在 JSX 里另写行高或宽度常量。
- **高度落脚**：app `h-8`(32)、sessions `h-7`(28)、view-toolbar `h-8` + `py-0.5`（单行合计 36，`stackGap` 改 `gap-0`）、panels `h-6`(24)、status `h-6`(24)；`CHROME_BASELINE_PX` 按新值重算为 84，不得放宽成「小于等于旧值」。瞬时 `events` 带（notice / 进度）保持现状，不计入 120px 预算。
- **控件复用**：主操作、次要动作、更多触发器复用既有 `components/Button.tsx`、`DropdownMenu.tsx`、`SegmentedControl.tsx`；开关仍是单一 `components/Checkbox.tsx`，不得新增第二套开关控件；控件高度只走 `--height-control-sm/md`，间距只用 4/8/12/16/24，圆角只用 4/6/8（`--radius-lg` 已删除）。
- **视图常量单源**：树行高只改 `src/core/directory/rows.ts` 的 `DIRECTORY_ROW_HEIGHT`（24→28）并让 `TreeView` / 滚动映射 / 行预算全部读它；代码行高只改 `src/renderer/src/components/DiffPane.tsx` 的 `DIFF_ROW_HEIGHT`（20→22），`DiffRuler` 与 `CodeView` 继续从这里取值，禁止复制常量。
- **地址条复制**：若需要剪贴板能力，必须在 `src/shared/platform/types.ts` 增端口方法 + `src/preload`、`src/main` IPC 白名单 + web 实现，renderer 侧只经 `PlatformPort` 调用；不得在 renderer import Electron，也不得在测试里依赖真实剪贴板。
- **截图时序**：`src/main/release-artifacts-and-brand.test.ts` 要求 captured commit 是 HEAD 祖先且 `src/renderer` 自该 commit 零 diff。因此先提交渲染层改动，再在该 commit 上 `pnpm build` + 截图脚本重拍，`docs/screenshots.md` 记录该 commit；截图与文档落在其后的交付提交里。`docs/visual/v1/before/` 四张不得覆盖。
- **捕获脚本**：复用既有 `scripts/capture-readme-screenshots.mjs` 与 `scripts/capture-visual-baseline.mjs` 的真实构建 + 真实 `/tmp` 目录/文件对路径，禁止用 `src/shared/fixtures/**` 摆拍；`after/` 图沿用 1280×792 逻辑视口、2× 像素密度。
- **文案与本地化**：新增/删除文案键必须 en / zh 同步并过 `messages.test`；不能把工程口吻换成另一种工程口吻。
- **门禁边界**：可回归行为写进 `code_gates`（既有 gate 加相关单测），浏览器 / 设备 / 桌面 GUI 检查不在本项范围内。
- **证据路径约定**：产品仓根 `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/codebases/projects/open-compare`，文中相对路径均为该根下的路径；交付摘要给出绝对路径。
