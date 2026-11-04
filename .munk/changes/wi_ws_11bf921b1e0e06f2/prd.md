# 视觉口径入库 + token 与控件三件套

WorkSet: `ws_71522977b540b53c`（UI 视觉打磨 V1：专业密集 + 清晰层级）· Phase 1 / 2 · key `visual-foundation`

## 范围

本项是视觉收敛的**第一步（写项 A）**，只做两件事，且严格按此顺序：

### A. 视觉口径与开工前基线（先落文档与证据，再动实现代码）

1. 新增 `docs/ui-visual-direction.md`：定案摘录（布局 / token / 控件三件套 / 视图 / 文案）、基线诊断（当前界面与目标的差距，逐条指名文件与现状值）、逐条验收项（与本项 `ac-*` 一一对应）。
2. 新增 `docs/visual/v1/before/` 四张基线截图：`directory-dark.png`、`directory-light.png`、`file-dark.png`、`file-light.png`，逻辑视口 1280×792、2× 输出 2560×1584；必须来自真实构建产物 + 真实临时目录 / 文件对（沿用 `scripts/capture-readme-screenshots.mjs` 的 DevTools 截图路径），不使用内置样本摆拍。文件名与逻辑尺寸登记在 `docs/visual/v1/measurements.md`。
3. 新增 `docs/visual/v1/baseline-facts.json`：四态计数、三组忽略开关（`ignoreWhitespace` / `ignoreNewline` / `ignoreEncoding`）默认值、导出 HTML 的字节数与 sha256，并记录采集时的 commit。
4. **顺序硬约束**：以上三项必须在改动 `src/renderer/src/assets/main.css` 与控件之前完成并提交，`baseline-facts.json` 记录的 commit 必须是"改动前"的 commit（由 `ac-baseline-precedes-tokens` 从 git 直接证明）。

### B. 唯一 token 源与控件三件套

5. `src/renderer/src/assets/main.css` 落地完整 token 源：字号 11/12/13/14/15、行高 16/18/20/24、间距 4/8/12/16/24、圆角 4/6/8、控件高 28/32/36；暗 / 亮两套同名 token；单一蓝强调 `#4c8dff`；语义色按定案收敛（见 `ac-diff-hues`）。
6. 控件三件套收敛：Button → 32px 三态；Toggle → 28×16 方形勾选统一 5 处开关；Chip/Badge → 20px「色点 + 文字 + 12% 底色」；Tab → 30px + 2px 品牌下划线。
7. 新增单测从 `main.css` 文本实读钉死色值、字号、行高、间距、圆角与控件高（不抄副本），并新增控件契约断言。

本项只改视觉基元与控件；主界面布局、工具条合并、状态栏文案、树行 28 / 代码行 22 / 指示条等视图修正在下一子项（`wi_ws_5315d151d872f78c`）执行。

## 验收

### 文档与开工前基线

- ac-direction-doc: `docs/ui-visual-direction.md` 存在且非空，含「定案摘录 / 基线诊断 / 验收项」三段，验收项逐条编号且与本文 `ac-*` 对应；文档声明 `src/renderer/src/assets/main.css` 为唯一 token 源。
- ac-direction-doc-matches-css: 文档中的色值 / 字号 / 行高 / 圆角 / 控件高表格与 `main.css` 实读值逐项相等（文档漂移即失败）。
- ac-baseline-before-shots: `docs/visual/v1/before/` 下四张 PNG 均存在、PNG 签名合法、像素尺寸为 2560×1584、字节数 > 100000、已被 git 跟踪且未被 ignore；`docs/visual/v1/measurements.md` 登记四个文件名与 1280×792 逻辑尺寸。
- ac-baseline-facts: `docs/visual/v1/baseline-facts.json` 含 40 位 hex `commit`、`capturedAt`、`fourStateCounts{same,added,removed,modified}`（非负整数，合计与目录样本一致）、`ignoreSwitches{ignoreWhitespace,ignoreNewline,ignoreEncoding}`（布尔）、`directoryHtml{bytes,sha256}`（64 位 hex）；`git cat-file -e <commit>^{commit}` 成功且该 commit 是 HEAD 的祖先。
- ac-baseline-precedes-tokens: 在 `baseline-facts.json` 记录的 commit 上，`git show <commit>:src/renderer/src/assets/main.css` 不含 `#0b0e12`、`--height-control`、`--text-2xs: 0.6875rem` 之外的 11/12/13/14/15 字阶标记（即该 CSS 仍是改动前版本）——证明基线截图与事实清单先于 token 落地。

### Token 源

- ac-tokens-type-scale: 从 `main.css` 实读，字号集合恰为 11/12/13/14/15（每个字号 token 均可解析到唯一 px 值，无额外中间档），行高集合恰为 16/18/20/24，且每个字号 token 都配了来自该集合的行高。
- ac-tokens-spacing-radius-control: 从 `main.css` 实读，间距基数为 `0.25rem` 且 1/2/3/4/6 步长解析为 4/8/12/16/24；圆角 token 恰为 4/6/8 三档（无其它圆角值）；控件高 token 恰为 28/32/36 三档。
- ac-tokens-dark-colors: 暗色实读：`surface-base/raised/overlay` = `#0b0e12`/`#11151b`/`#171c24`，`content-primary/secondary/muted` = `#e6e9ef`/`#a8b0bd`/`#6f7887`，`line-subtle/strong` = `#232a35`/`#333c4a`，`accent` = `#4c8dff`；`surface-sunken` 与 `surface-hover` 落在同一中性斜坡内且各自唯一（由测试钉死字面值）。
- ac-tokens-light-colors: 亮色实读：`surface-base/raised/overlay` = `#ffffff`/`#f6f8fa`/`#eef1f5`，`content-primary/secondary/muted` = `#1f2328`/`#5b6470`/`#8b949e`，`line-subtle/strong` 由测试钉死字面值且与对应表面可辨；亮色 `accent` 与 `#4c8dff` 色相角差 ≤ 12°，并与白色文字对比 ≥ 4.5。
- ac-diff-hues: 暗色语义色实读：`diff-added` = `#3fb950`、`diff-removed` = `#f85149`、`diff-modified` = `#d29922`、`diff-same` = `#8b949e`；全库界面色相 ≤ 4（蓝 / 绿 / 红 / 琥珀，中性灰不计），不存在第 5 个色相（紫色 `--color-diff-conflict` 旧值必须消失）；`diff-conflict` 与 `diff-modified` 色相角差 ≤ 12°（沿用修改色族），`danger` 与 `diff-removed` 同色相（一种颜色只有一个含义）。
- ac-four-state-hardlines: 两套主题内四态两两 CIE76 ΔE ≥ 12、对各自背景与 `surface-base` 对比度 ≥ 3.0、`content-primary/surface-base` ≥ 4.5、`content-secondary/surface-base` ≥ 3.0 全部保持（`src/core/theme/contrast.test.ts` 既有断言不放宽且仍绿）。
- ac-light-semantic-desaturation: 亮色 `diff-added/removed/modified/same` 与暗色同名 token 色相角差 ≤ 12°，且 HSV 饱和度相对暗色同名 token 下降 10–15%（含端点容差 ±1%），字面值由测试钉死。

### 控件三件套

- ac-button-states: `ToolbarButton` 收缩为三档强调（`primary` 实心 / `default` 描边 / `ghost` 默认无底色、hover 才出底），高度取控件高 token（md = 32px，sm = 28px），圆角与文字 12px 走 token；`danger` 仅保留给破坏性确认（当前 2 处），复用唯一红色 token；`Button.tsx` 无 `h-6`/`h-7`/`h-8` 与 `#hex` 字面量。
- ac-toggle-square: 新增单一开关控件（28×16，宽 28 高 16，2px 描边，圆角 4），替换 `CodeView.tsx` 的 `role="switch"` 与 `DirectoryView.tsx` / `TemplateDialog.tsx`（2 处）/ `DirectorySyncDialog.tsx` 的原生 checkbox；`role` / `aria-checked` / `checked` 语义与可访问名保持，既有开关相关测试全绿。
- ac-chip-badge: `DiffBadge` 与状态图例统一为高 20px、圆角 4、11px 文字、结构「8px 色点 + 文案 + 12% 语义底色」，删除彩色描边；五个 `DiffStatus` 与既有 i18n 文案键不变（`sharedI18n.test.tsx` 仍绿）。
- ac-tab-underline: 会话标签（`SessionTabs`）与 `SegmentedControl` 单项高度 30px，选中态用 2px 品牌色下划线表达、不再用整块高亮；`role="tab"` / `aria-selected` 语义与既有标签测试不变。
- ac-no-hardcoded-ui: `src/renderer/src/components/**` 与 `src/renderer/src/views/**` 中无 `#hex` / `rgb(` / `hsl(` 颜色字面量；被本项改动的控件文件内无 4/8/12/16/24 之外的间距工具类（源码扫描断言）。

### 回归与发布口径

- ac-functional-parity: 改动后复测的四态计数、三组忽略开关默认值、导出 HTML 的字节数与 sha256 与 `baseline-facts.json` 完全一致（脚本比对，不允许作为"预期差异"放过）。
- ac-no-fifth-state: `DIFF_STATUSES` 仍为 5 项、四态口径与标签文案不变，对比语义 / 快照 / 导出逻辑零改动（相关既有测试全绿）。
- ac-readme-provenance: `src/renderer` 变更后重跑截图，`docs/assets/opencompare-workbench.png` 与 `opencompare-file-diff.png` 仍为 2560×1584 且被跟踪；`docs/screenshots.md` 的 captured commit 更新为包含本次渲染层改动的 commit，字节与 sha256 重新登记，`src/main/release-artifacts-and-brand.test.ts` 全绿。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test`、`node scripts/test-debt-gate.mjs` 全绿；新增 token / 控件断言在 `pnpm test` 内执行。

## 非目标

- 不做主界面布局、工具条合并、面板头地址条、状态栏文案与视图修正（树行 28 / 代码行 22 / 左右差异指示条 / 单词级差异柔化）——全部属下一子项。
- 不做 `docs/visual/v1/after/` 改后截图、`measurements.md` 的顶部控件带与形状/色相实测、`functional-parity.md` 文档——属下一子项交付。
- 不改对比语义、四态口径、`DiffStatus` 词汇表、快照格式、导出逻辑、扫描 / 合并算法。
- 不新增 npm 依赖、不换图标库、不接 CDN、不做组件库迁移；不引入截图 / 测试新依赖（复用既有 Electron DevTools 截图脚本路径）。
- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、发布说明、README 版本指针；不动 tag / Release。
- 不改 i18n 文案键与界面文案（仅视觉与尺寸）。
- 不做 L3 真机人工验收（由产品侧另一场 ops 任务执行）。
- 不新增页面、路由、功能入口；不调整亮暗切换逻辑与 `data-theme` 语义。

## 实现约束

以下为已核实的事实与约定，供 Coding 直接执行；不是完整技术方案。

### 唯一 token 源与既有测试基建

- 唯一 token 文件：`src/renderer/src/assets/main.css`（204 行）。暗色在 `@theme` 块，亮色在 `:root[data-theme='light']` 覆盖**完全相同的 `--color-*` 名**；禁止第二份色板文件、禁止新增重复 token 名。
- 既有实读基建：`src/core/theme/contrast.ts`（`parseThemeTokens` 从 CSS 文本解析两套 `--color-*`）+ `src/core/theme/contrast.test.ts`（四态 ΔE/对比度硬线）。新 token 断言沿用"读 `main.css` 文本、不抄色值"同一纪律，可扩展 `contrast.ts` 或并行新增 `src/core/theme/tokens.ts` + `tokens.test.ts`。
- 当前暗色实测值（改动基线，供差异对照）：`surface-base #0b0d12`、`surface-raised #12151d`、`surface-overlay #171b25`、`content-muted #6b7583`、`diff-removed #f2555a`、`diff-modified #d8a13a`、`diff-conflict #a371f7`（紫色，必须消失）、`diff-same #6b7583`、`--radius-xs 3px / sm 5px`。
- 字号 token 需覆盖 `--text-2xs`（现状 11px）并补齐 12/13/14/15，行高 16/18/20/24；控件高新增 `--height-control-sm|md|lg` = 28/32/36；间距保留 Tailwind v4 单一基数 `--spacing: 0.25rem`（1/2/3/4/6 步 = 4/8/12/16/24）。

### 冲突态定案（WorkSet 开放问题的 Intake 决断）

- 采用推荐形态：**不新增第五色相**。`--color-diff-conflict` 与 `--color-diff-modified` 同色相，靠 1px 虚线描边 + 显式文案（既有 i18n `common.diff.conflict`）区分；`DIFF_STATUSES` 仍 5 项，四态口径不变。
- 连带收敛：`--color-danger` 与 `--color-diff-removed` 同色相（一种颜色只有一个含义），界面总色相 ≤ 4（蓝 / 绿 / 红 / 琥珀）。

### 控件落点（已核实）

- Button：`src/renderer/src/components/Button.tsx` —— `ToolbarButton`（现有 `default|primary|ghost|danger` × `sm|md`，`sm h-6` / `md h-7`）、`IconButton`（`h-6 w-6`）。`danger` 实际使用仅 `workbench/Workbench.tsx:2099` 与 `:2147` 两处。
- Toggle / 开关：`views/CodeView.tsx:108`（`role="switch"`）、`views/DirectoryView.tsx:377`、`views/TemplateDialog.tsx:564` 与 `:604`、`views/DirectorySyncDialog.tsx:246`（原生 checkbox）。建议新增 `components/Checkbox.tsx` 并以可视化隐藏的原生 input 保 `checkbox`/`switch` 语义，避免破坏既有 `getByRole('checkbox')` 查询。
- Chip / Badge：`components/DiffBadge.tsx`（`DiffDot` 8px 圆点 / `DiffBadge` 描边 + soft 底）、`components/diffSemantics.ts`（`DIFF_DOT_CLASSES` / `DIFF_BADGE_CLASSES`）、`components/StatusBar.tsx` 图例（`CompositionLegend`）。`DiffBadge` 被 `components/TreeView.tsx:127` 复用；`DiffDot` 被 `StatusBar` / `StructuredView` / `CsvView` 复用 —— 改结构时保持文案可查（`sharedI18n.test.tsx` 断言文案）。
- Tab：`components/SessionTabs.tsx`（`h-7` 容器 + 边框块高亮）与 `components/SegmentedControl.tsx`（`role="tablist"` + `h-6` 单项）。二者都用 `aria-selected`，既有 `App.test.tsx` 大量断言，只能改样式类。

### 截图与事实清单的可复用路径

- 截图脚本：`scripts/capture-readme-screenshots.mjs` —— 已实现「真实 `out/main` + `out/renderer` 构建 → 真实临时目录树 / 文件对 → DevTools 截图 2560×1584 → 无依赖（Node 22 经 Electron 自带 Node 重跑）」。基线截图应复用同一条路径（新增 `scripts/capture-visual-baseline.mjs`，或给现有脚本加输出目录 / 主题参数），暗色 / 亮色通过 DevTools 设 `document.documentElement.dataset.theme` 后截图；窗口逻辑尺寸设 1280×792、`deviceScaleFactor: 2`。允许在 `package.json` 增一条 script，但不得新增依赖。
- 事实清单数据源（脚本采集，禁止手填）：四态计数取内置真实目录样本的 answer key；忽略开关默认值取 `ignoreWhitespace` / `ignoreNewline` / `ignoreEncoding` 的默认常量（`workbench/historyHomeModel.ts` 引用同名开关）；导出 HTML 取 `workbench/directoryReport.ts` 的 `buildDirectoryReportForComparison`（已有 `directoryReport.test.ts` / `DirectoryReportExport.test.tsx` 覆盖，可在 Node 内确定性复算字节与 sha256）。
- 基线采集需在 `pnpm build` 后用干净工作树执行，并把当时 `HEAD` 写入 `baseline-facts.json`；四张 before 截图与 facts 一起先提交，再做 token 改动。

### 已知门禁风险（必须在本项内处理）

- `src/main/release-artifacts-and-brand.test.ts`（`keeps the whole renderer unchanged since the captured commit`）要求 `docs/screenshots.md` 记录的 commit 到 `HEAD` 之间 **`src/renderer` 零 diff**。本项改 `main.css` 与组件，必然触发失败：改完渲染层后必须重跑 `pnpm screenshots`（`electron-vite build` + 脚本）并更新 `docs/screenshots.md` 的 captured commit、字节与 sha256，再让门禁跑绿。下一子项会再次重拍，属预期。
- 既有 `src/core/theme/contrast.test.ts` 的 ΔE / 对比度硬线不放宽；亮色语义色取值须同时满足「同色相降饱和 10–15%」与这些硬线，取不出的组合要回退到满足硬线的最近值并在 `docs/ui-visual-direction.md` 注明取整依据。
- 语义色 / 控件类名被多个测试以字符串断言（如 `bg-diff-*-soft`、`bg-diff-conflict-soft`、`flex h-5 border-l-2`）；改类名会连带失败，优先保留既有类名映射、只改 token 取值与结构。
- `docs/lessons.md` §9：可执行 / 可达性判定必须共用同一纯函数——开关与禁用态若要改判定，保持单一来源，不在控件内另起一份。

### 交付卫生

- 只允许在 `.munk/changes/wi_ws_11bf921b1e0e06f2/` 之外改动：`src/renderer/src/assets/main.css`、`src/renderer/src/components/**`、`src/renderer/src/views/**`（仅开关落点）、`src/core/theme/**`（实读解析与断言）、`docs/ui-visual-direction.md`、`docs/visual/v1/**`、`docs/screenshots.md`、`docs/assets/*.png`、`scripts/capture-*.mjs`、`package.json` 的 `scripts` 段。
- 不触碰 `src/core/` 的对比 / 目录 / 文本 / CSV / 结构化算法与 `src/main/**`、`src/preload/**`。
