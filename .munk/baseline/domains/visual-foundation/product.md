# Domain: visual-foundation

UI 视觉打磨 V1 的**第一阶段（Phase 1/2）**：先把视觉口径与开工前基线落成仓内证据（方向文档 + 四张 before 截图 + 事实清单 + 改动前 commit），再把唯一 token 源（字号 / 行高 / 间距 / 圆角 / 控件高 / 两套色板取值）与控件三件套（Button / Toggle / Chip / Tab）一次性收敛。本域拥有 `docs/ui-visual-direction.md`、`docs/visual/v1/**`、`main.css` 的**类型 / 间距 / 圆角 / 控件高 / 色值集合**，以及从 CSS 文本实读这些值的 `src/core/theme/tokens.ts` 与控件契约断言 `components/visualContracts.test.tsx`。双色板解析 / 持久化 / 跟随系统归 `theme`，图标三档归 `icon-system`，主界面布局·工具条·状态栏·视图行高（Phase 2，`wi_ws_5315d151d872f78c`）不在本域近期交付内。

## 范围

- **视觉口径文档**：`docs/ui-visual-direction.md` 三段式（定案摘录 / 基线诊断 / 逐条验收项），验收项编号与本域 `ac-*` 一一对应，并声明 `src/renderer/src/assets/main.css` 为唯一 token 源。
- **开工前基线证据**：`docs/visual/v1/before/{directory-dark,directory-light,file-dark,file-light}.png`（逻辑 1280×792、2× 输出 2560×1584），`docs/visual/v1/measurements.md` 登记文件名与尺寸，`docs/visual/v1/baseline-facts.json` 记录四态计数 / 三组忽略开关默认值 / 导出 HTML 字节数与 sha256 / 采集 commit。
- **顺序硬约束**：三件基线证据必须先于 `main.css` 与控件的改动提交；`baseline-facts.json` 的 `commit` 必须是「改动前」commit，并由测试用 `git show` 证明该版本样式表没有新 token。
- **唯一 token 源（`main.css`）**：字号 11/12/13/14/15（各配 16/18/20/24 行高）、间距基数 `--spacing: 0.25rem`（1/2/3/4/6 步 = 4/8/12/16/24）、圆角 4/6/8、控件高 28/32/36；暗色 `@theme` 与亮色 `:root[data-theme='light']` **同名** token 两套；单一蓝强调；差异语义四色相 + conflict 复用 modified 色族；`danger` 与 `diff-removed` 同色相。
- **亮色语义色规则**：与暗色同名 token 同色相（角差 ≤ 12°），HSV 饱和度相对暗色下降 10–15%；chip 底色 = 语义色按 12% 混合到 `surface-base`。
- **控件三件套**：`ToolbarButton` 三档强调（primary 实心 / default 描边 / ghost 默认无底色）、高度走 `--height-control-sm|md`（28 / 32px）、文字 12px、圆角 token；新增 `Checkbox`（28×16、2px 描边、4px 圆角）替换 5 处原生 checkbox / `role="switch"`；`DiffBadge` 与状态图例统一 20px 高、8px 色点 + 文案 + 12% 语义底色、无彩色描边；`SessionTabs` 与 `SegmentedControl` 单项 30px、选中态 2px 品牌下划线。
- **壳层控件高接线**：`workbench/shellLayout.ts` 的 `SHELL_LEVELS.*.controlHeight` 从 `h-6` / `h-7` 改为 `h-[var(--height-control-sm)]`，控件高度不再有数字字面量。
- **实读断言**：`src/core/theme/tokens.ts` 从 `main.css` 文本解析字阶 / 间距基数 / 圆角 / 控件高 / 两套 `--color-*`，配 HSV 色相距离、饱和度降幅与 12% 混色工具；`tokens.test.ts` 与 `visualContracts.test.tsx` 不抄色值、只断言实读结果与源码结构。

## 验收

- **ac-direction-doc**：`docs/ui-visual-direction.md` 存在且非空，含「定案摘录 / 基线诊断 / 验收项」三段，验收项逐条编号并与 PRD `ac-*` 对应，声明 `main.css` 为唯一 token 源。
- **ac-direction-doc-matches-css**：文档中的色值 / 字号 / 行高 / 圆角 / 控件高表格与 `main.css` 实读值逐项相等（`tokens.test.ts` 的「direction document matches the shipped tokens」把每个 token 名与字面值、每个字阶与三档圆角 / 控件高都对上）。
- **ac-baseline-before-shots**：`docs/visual/v1/before/` 四张 PNG 均存在、PNG 签名合法、像素尺寸 2560×1584、字节数 > 100000、被 git 跟踪且未被 ignore；`measurements.md` 登记四个文件名与 1280×792 逻辑尺寸。
- **ac-baseline-facts**：`baseline-facts.json` 的 `commit` 为 40 位 hex、`capturedAt` 存在、`fourStateCounts{same,added,removed,modified}` 为非负整数且合计与目录样本答案一致、`ignoreSwitches{ignoreWhitespace,ignoreNewline,ignoreEncoding}` 为布尔、`directoryHtml{bytes,sha256}` 中 sha256 为 64 位 hex；`git cat-file -e <commit>^{commit}` 成功且该 commit 是 `HEAD` 祖先。
- **ac-baseline-precedes-tokens**：在 `baseline-facts.json` 记录的 commit 上，`git show <commit>:src/renderer/src/assets/main.css` 不含 `#0b0e12` 与 `--height-control`，证明基线截图与事实清单先于 token 落地。
- **ac-tokens-type-scale**：从 `main.css` 实读的字号集合恰为 11/12/13/14/15（每档唯一 px 值、无中间档），行高集合恰为 16/18/20/24，且每档字号都配了该集合内的行高。
- **ac-tokens-spacing-radius-control**：间距基数为 `0.25rem` 且 1/2/3/4/6 步解析为 4/8/12/16/24；圆角 token 恰为 4/6/8 三档；控件高 token 恰为 28/32/36 三档。
- **ac-tokens-dark-colors**：暗色实读 `surface-base/raised/overlay` = `#0b0e12`/`#11151b`/`#171c24`，`content-primary/secondary/muted` = `#e6e9ef`/`#a8b0bd`/`#6f7887`，`line-subtle/strong` = `#232a35`/`#333c4a`，`accent` = `#4c8dff`；`surface-sunken`(`#080b0f`) 与 `surface-hover`(`#1c2230`) 落在同一中性斜坡且各自唯一（亮度单调 sunken < base < raised < overlay < hover）。
- **ac-tokens-light-colors**：亮色实读 `surface-base/raised/overlay` = `#ffffff`/`#f6f8fa`/`#eef1f5`，`content-primary/secondary/muted` = `#1f2328`/`#5b6470`/`#8b949e`，`line-subtle/strong` = `#e3e7ee`/`#c6cdd8`；亮色 `accent` 与 `#4c8dff` 色相角差 ≤ 12° 且对白色文字对比 ≥ 4.5。
- **ac-diff-hues**：暗色 `diff-added/removed/modified/same` = `#3fb950`/`#f85149`/`#d29922`/`#8b949e`；全库 `--color-*` 到四色族（蓝 / 绿 / 红 / 琥珀）最近色相距离 ≤ 25°，紫色 conflict 旧值（暗 `#a371f7` / 亮 `#8250df`）消失；`diff-conflict` 与 `diff-modified` 角差 ≤ 12°，`danger` 与 `diff-removed` 角差 ≤ 12°。
- **ac-four-state-hardlines**：两套主题内四态两两 CIE76 ΔE ≥ 12、对各自背景与 `surface-base` 对比度 ≥ 3.0、`content-primary/surface-base` ≥ 4.5、`content-secondary/surface-base` ≥ 3.0；`src/core/theme/contrast.test.ts` 既有断言不放宽且仍绿。
- **ac-light-semantic-desaturation**：亮色四态与暗色同名 token 色相角差 ≤ 12°，HSV 饱和度相对暗色下降 10–15%（断言窗口 9–16 含端点容差），亮色四态字面值 `#818890`/`#419b4e`/`#e55d57`/`#ad832d` 由测试钉死。
- **ac-button-states**：`Button.tsx` 的 `ToolbarButton` 三档强调（primary 实心 / default 描边 / ghost 默认无底色、hover 才出底）、高度取自控件高 token（md 32 / sm 28）、圆角 `rounded-sm`、文字 `text-xs`；`danger` 仅保留破坏性确认 2 处并复用 `danger` token；文件内无 `h-6`/`h-7`/`h-8` 与 `#hex` 字面量。
- **ac-toggle-square**：`Checkbox` 为 28×16（`h-4 w-7`）、2px 描边、`rounded-xs`，`role="switch"` 保留 `<button aria-checked>` 语义、`role="checkbox"` 用可视化隐藏的原生 input 保 `getByRole('checkbox')` 查询；替换 `CodeView`（switch）、`DirectoryView`、`TemplateDialog`（2 处）、`DirectorySyncDialog` 共 5 处，既有开关相关测试全绿。
- **ac-chip-badge**：`DiffBadge` 与状态图例为 `h-5`（20px）、`rounded-xs`、`text-2xs`（11px），结构为 `size-2`（8px）色点 + 文案 + `-soft` 12% 底色，无彩色描边；五个 `DiffStatus` 与既有 i18n 文案键不变（`sharedI18n.test.tsx` 仍绿）。
- **ac-tab-underline**：`SessionTabs` 与 `SegmentedControl` 单项 `h-[30px]`，选中态用 `absolute inset-x-2 bottom-0 h-0.5 bg-accent`（2px 品牌下划线）而非整块高亮；`role="tab"` / `aria-selected` 语义与既有标签测试不变。
- **ac-no-hardcoded-ui**：`components/**` 与 `views/**` 中无 `#hex` / `rgb(` / `hsl(` 颜色字面量；本项改动的控件文件内间距工具类只取 4/8/12/16/24 步（源码扫描断言）。
- **ac-functional-parity**：改动后复测的四态计数、三组忽略开关默认值、导出 HTML 字节数与 sha256 与 `baseline-facts.json` 完全一致（`scripts/visual-baseline-facts.test.mjs` 每次重算并对比，不允许按「预期差异」放过）。
- **ac-no-fifth-state**：`DIFF_STATUSES` 仍 5 项、四态口径与标签文案不变，对比语义 / 快照 / 导出逻辑零改动；只改颜色取值与呈现结构。
- **ac-readme-provenance**：`src/renderer` 改动后重跑截图，`docs/assets/opencompare-workbench.png` 与 `opencompare-file-diff.png` 仍 2560×1584 且被跟踪，`docs/screenshots.md` 的 captured commit 更新为包含渲染层改动的 commit 并重新登记字节 / sha256，`src/main/release-artifacts-and-brand.test.ts` 全绿。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test`、`node scripts/test-debt-gate.mjs` 全绿；新增 token / 控件断言在 `pnpm test` 内执行，test-debt 只做增量上调。

## 非目标

- 不做主界面布局、工具条合并、面板头地址条、状态栏文案与视图修正（树行 28 / 代码行 22 / 左右差异指示条 / 单词级差异柔化）——属 Phase 2 `wi_ws_5315d151d872f78c`。
- 不做 `docs/visual/v1/after/` 改后截图、`measurements.md` 的顶部控件带与形状 / 色相实测、`functional-parity.md` 文档——属下一子项交付。
- 不改对比语义、四态口径、`DIFF_STATUSES` 词汇表、快照格式、导出逻辑、扫描 / 合并算法；不新增第五色相或第五状态。
- 不新增 npm 依赖、不换图标库、不接 CDN、不做组件库迁移；不引入截图 / 测试新依赖（复用既有 Electron DevTools 截图路径）。
- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、README 版本指针；不动 tag / Release。
- 不改 i18n 文案键与界面文案（仅视觉与尺寸）；不做 L3 真机人工验收（由产品侧 ops 任务承载）。
- 不新增页面、路由、功能入口；不调整亮暗切换逻辑与 `data-theme` 语义。

## 实现约束

- **唯一 token 源**：所有颜色 / 字号 / 行高 / 间距 / 圆角 / 控件高只写在 `main.css`；禁止第二份色板文件或重复 token 名；组件只引用 token，不写死色值与尺寸。
- **只改取值、不改类名映射**：`bg-diff-*-soft`、`bg-diff-conflict-soft` 等类名被多个测试以字符串断言（`flex h-5 border-l-2` 一类结构串也在内）；本项保留既有类名映射，只改 token 取值与内部结构。
- **实读纪律**：token 断言只读 `main.css` 文本（`tokens.ts` / `contrast.ts`），不把色值抄进测试；`parseThemeTokens` 找不到 `@theme` 或 `:root[data-theme='light']` 块必须抛错，防空集假绿。
- **基线可复现**：`pnpm visual:baseline` = `electron-vite build` + `scripts/capture-visual-baseline.mjs`（真实 `out/main` / `out/renderer` + 真实临时目录树 / 文件对 + DevTools 截图，`deviceScaleFactor: 2`），暗 / 亮经 `document.documentElement.dataset.theme` 切换；`VISUAL_BASELINE_WRITE=1` 才写 `baseline-facts.json`，日常运行只复算比对。截图脚本允许增 script，不得新增依赖。
- **事实清单禁止手填**：四态计数取真实目录样本答案、忽略开关取默认常量、导出 HTML 用 `buildDirectoryReportForComparison` 在 Node 内确定性复算字节与 sha256；`capturedAt` 固定为生成时刻、`commit` 取写盘时 `HEAD`。
- **壳层控件高单一来源**：控件高度只经 `--height-control-sm|md|lg`，`SHELL_LEVELS.controlHeight` 与 `Button` / `IconButton` / `Checkbox` 共用同一 token，不再出现 `h-6` / `h-7` 数字档。
- **可执行性判定共函数**：开关的 checked / disabled 语义仍由既有纯函数与 props 派生（`docs/lessons.md` §9），`Checkbox` 内不另起一份判定。
- **截图门禁联动**：改渲染层必然触发 `release-artifacts-and-brand.test.ts` 的「captured commit 到 HEAD 之间 `src/renderer` 零 diff」断言，必须同批 `pnpm screenshots` 并更新 `docs/screenshots.md`；Phase 2 会再次重拍，属预期。
- **交付卫生**：只允许改 `main.css`、`components/**`、`views/**`（仅开关落点）、`src/core/theme/**`、`docs/ui-visual-direction.md`、`docs/visual/v1/**`、`docs/screenshots.md`、`docs/assets/*.png`、`scripts/capture-*.mjs`、`package.json` 的 `scripts` 段；不触碰 `src/main/**`、`src/preload/**` 与 `src/core/` 的对比 / 目录 / 文本 / CSV / 结构化算法。

## 最近交付证明

- WI：`wi_ws_11bf921b1e0e06f2`（视觉口径入库 + 唯一 token 源 + 控件三件套；`kind: feature`，WorkSet `ws_71522977b540b53c` Phase 1/2，key `visual-foundation`）
- 日期：2026-11-05
- 结果：`code_gates` passed（29 gates，attempt 001 全绿，`.munk/runs/run_ws_f82aa71e14aa2016/code-gates/attempts/001`）；`pnpm test` 139 files / 2212 passed + 1 skipped / 2213；`test-debt-gate` 通过（repoTestCases 1643 → 1677、repoTestLines 48671 → 49021，新增 34 例）。**新建本域**（此前字号 / 圆角 / 控件高与控件契约无域记录，token 面只在 `design/foundations` 与 `theme` 内零散出现）。
- 覆盖摘要：① **基线先落**——`docs/ui-visual-direction.md`（177 行，三段式，逐条对应 `ac-*`）、`scripts/capture-visual-baseline.mjs`（真实构建 + 真实临时目录对 → DevTools 四态截图）、四张 before PNG（各 265000–322000 字节，2560×1584）、`measurements.md`、`baseline-facts.json`（commit `11170a5`，四态 6/4/4/5，忽略开关 `false/true/true`，导出 HTML 5367B / sha256 `8cfacec9…`）。② **token 源收敛**——`main.css` 223 行：字阶 11/12/13/14/15 + 行高 16/18/20/24、间距 `0.25rem`、圆角 4/6/8、控件高 28/32/36；暗色语义色改为 `#3fb950`/`#f85149`/`#d29922`/`#8b949e`，紫色 `diff-conflict` 退场（暗 `#d9a021` / 亮 `#b08324` 复用 modified 族），`danger` 与 `diff-removed` 同值；亮色 accent 落 `#2563eb`（与 `#4c8dff` 同色相且白字可读），亮色四态降饱和 10–15%。③ **控件三件套**——`Button` 三档 × `--height-control-sm|md`、`Checkbox` 新增（switch / native checkbox 双语义，替换 5 处）、`DiffBadge` 20px + 8px 点 + 12% 底色去描边、`SessionTabs` / `SegmentedControl` 30px + 2px 下划线；`shellLayout.ts` 六个层级的 `controlHeight` 同批改走 token。④ **实读基建**——新增 `src/core/theme/tokens.ts`（`parseTypeScale` / `parseSpacingBasePx` / `parseRadiusPx` / `parseControlHeightsPx` / `hsvOf` / `hueDistance` / `saturationDropPercent`）与 `tokens.test.ts`（21 例：字阶 / 间距 / 圆角 / 控件高 / 暗亮色值 / 四色相 ≤4 / conflict 与 danger 同色相 / 降饱和窗口 / 12% 混色 / 文档与 CSS 一致）；`visualContracts.test.tsx`（12 例：间距步长、Button 三档、Toggle 28×16、Chip 20px、Tab 30px + 下划线）。⑤ **门禁联动**——`pnpm screenshots` 重拍 README 两张图为 271534 / 316500 字节并把 captured commit 更新为 `451bf57`；`scripts/visual-baseline-facts.test.mjs` 纳入 `pnpm test`，日常运行复算比对基线事实。
- 注：① **被推翻的假设**——PRD 建议「新增 Toggle」，实际落地为单个 `Checkbox` 组件以 `role` 区分 switch / checkbox，保住既有 `getByRole('checkbox')` 与 `aria-checked` 断言；后续不要再新增第二套开关控件。② **亮色 accent 不是 `#4c8dff` 字面值**——PRD 只要求色相角差 ≤ 12° 且白字 ≥ 4.5，实测取 `#2563eb`；断言按这两条验，不要按字面值改回。③ **`--radius-lg` 已不存在**——只有 4/6/8 三档，新增 UI 不要写 `rounded-lg`。④ **控件高度不许再写数字档**——统一 `--height-control-sm|md|lg`，`SHELL_LEVELS.controlHeight` 与控件共用，改回 `h-6`/`h-7` 会红。⑤ README 截图门禁要求「captured commit 到 HEAD 的 `src/renderer` 零 diff」，Phase 2 改布局必须同批重拍并更新 `docs/screenshots.md`，否则 `release-artifacts-and-brand.test.ts` 必红。⑥ 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/visual-foundation-tokens-and-controls.md`。⑦ 基线截图与事实清单绑定 commit `11170a5`，只能证明「before」状态；`after/` 截图与形状 / 色相实测属下一子项，勿在本域补写。
