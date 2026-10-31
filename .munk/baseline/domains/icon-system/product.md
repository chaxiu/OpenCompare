# Domain: icon-system

渲染侧图标单一来源域：把界面用到的字形从 `lucide-react` 包**逐个拷成 SVG** 落到
`src/renderer/src/assets/icons/`，配一个零 DOM / 零 Electron 的图标表 + 动作映射表，再由唯一的
`components/Icon.tsx` 产出 `<svg>`，尺寸收敛到 **16 / 20 / 24 三档**并按档做光学描边缩放。
本域管**图标的来源、命名与渲染契约**；壳层入口清单（`SHELL_ENTRY_IDS` / `SHELL_ENTRIES`、
三档 `presentation`、`width`）归 `workbench`，壳层图标只是在既有入口内部换 svg，不加新结构；
token 取值与差异语义色归 `design/foundations`；`IconButton` / `ToolbarButton` 的 props 与尺寸档
不属本域（只换传入的图标内容）。

## 范围

- **vendored 图标源（`src/renderer/src/assets/icons/`）**：一图标一文件，文件名 = 上游 Lucide 图标名 kebab-case；文件头注释 `lucide:<upstream-name>@<实测版本>`；文件只保留 `<svg>` 根 + `viewBox="0 0 24 24"` + `fill="none"` + 几何子元素，`stroke-width` / `class` / `width` / `height` 等展示属性在拷贝时剥离（描边由组件统一决定）。
- **上游版本与许可证**：图标表导出上游版本常量（实测 `lucide-react` 版本，**1.59.0**，`package.json` 原声明 `^1.59.0`）；`LICENSES/lucide.txt` 存上游 ISC 许可证原文（含 `ISC License` / `Copyright (c)` / `Permission to use, copy, modify` / `THE SOFTWARE IS PROVIDED "AS IS"`）。
- **自绘缺口（`assets/icons/custom/`）**：仅当库中确无语义合适字形时自绘，上限 5 个；文件头注 `自绘 · 库中缺口理由` + 非空理由正文；守 `viewBox="0 0 24 24"` / 2px 描边语义 / `round` / `fill="none"` / `stroke="currentColor"`；名字 `custom-` 前缀、不与上游名冲突、必须被某个动作映射引用（无装饰性图标）。库里有合适字形就必须用库图标——当前实现 **0 个自绘**（库覆盖了整个界面）。
- **唯一 Icon 组件（`src/renderer/src/components/Icon.tsx`）**：入参 `{ name, size?: 16 | 20 | 24, className }`；输出 `<svg>` 固定 `viewBox="0 0 24 24"`、`stroke="currentColor"`、`fill="none"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`aria-hidden="true"`、`data-icon={name}`、`width`/`height` = `size`；`stroke-width` 按 `strokeWidthFor(size)` 光学缩放（24 → 2，尺寸越小越细，单调）。
- **命名表 / 映射表（renderer 纯模块，node 环境可直读）**：`ICON_PATHS`（图标名 → 内部几何，唯一图标名空间）+ `ICON_NAMES` / `ICON_SIZES` / `LUCIDE_VERSION`；`SHELL_ENTRY_ICONS: Record<ShellEntryId, IconName>`（键集必须与 `SHELL_ENTRY_IDS` **完全相等**）；`UI_ICON_ACTIONS`（非壳层界面动作：品牌 / 关闭 / 菜单 / 树展开折叠 / 文件 / 文件夹 / 代码文件 / 选目录 / 加载 / 告警 / 校验 / 复制 / 变更箭头 / 刷新 / 复位 / 远程样本 / 左右覆写 / **场景类型**（`viewDirectory` / `viewCode` / `viewCsv` / `viewStructured`，现由会话 tab 的类型归属消费，原顶栏「视图切换」控件已退场）→ 图标名）。当前 `ICON_PATHS` 32 项，全部被两张映射引用，无孤儿。
- **全量迁移**：`App` / `Workbench` / `SessionTabs` / `TreeView` / `Dialog` / `DropdownMenu` / `NewCompareDialog` / `TemplateDialog` / `DirectorySyncDialog` / `CodeView` / `CsvView` / `DirectoryView` / `StructuredView` 的 `lucide-react` 用法全部改走 `Icon` + 映射表；尺寸收敛到 16 / 20 / 24（原 12 / 14 档统一升 16，不留中间档）。
- **依赖判定**：**已移除 `lucide-react`**（`package.json#dependencies` 与 `pnpm-lock.yaml` 均不再含该包；deps 键集 = `@tanstack/react-virtual` / `diff` / `jsonc-parser` / `node-diff3` / `papaparse` / `react` / `react-dom` / `yaml`），`src/shared/deps.test.ts` 改为断言 vendored 图标表（至少一个图标名可解析 + 版本常量形如 `x.y.z`）。不新增 npm 依赖。
- **机器校验**：`eslint.config.mjs` 的 renderer 段 `no-restricted-imports` 增列 `lucide-react` 与其它图标集（`@tabler/icons*` / `@heroicons/*` / `heroicons` / `feather-icons` / `react-icons/*` / `@fortawesome/*` / `bootstrap-icons` / `@mdi/*` / `lucide-*`），复用既有机制、不新增 lint 插件。
- **零网络 / 零 emoji**：图标随构建产物打包，运行时不拉取；界面不得用 emoji 或单个字符充当图标。
- **对标图标语义判定**：`docs/ui-phase1-reference-audit.md` 表③（归 `domains/ui-reference-audit`）记录「图标语义差异 10 条 + 主动不做 9 条」的对标判断，图标名只取 `ICON_PATHS` / `ICON_NAMES` 现有取值；审计不改本域映射，后续要换字形须按本域三步流程改表并同批更新表③理由。

## 验收

- **ac-vendored-source**：`src/renderer/src/assets/icons/` 下 SVG 文件数与 `ICON_PATHS` 键数相等；每个文件可解析为 `<svg>`，含 `viewBox="0 0 24 24"` 与 `fill="none"`，且**不含** `stroke-width` 属性、不含 `#` 色值 / `rgb(` / 具名颜色字面量（`fill` / `stroke` 取值只允许 `none` 或 `currentColor`）；每个文件名（去 `.svg`）唯一且与图标表中的上游名一一对应，同一上游名只允许一份文件。
- **ac-upstream-version-and-license**：图标表导出的上游版本常量等于实测的已安装 `lucide-react` 版本（实测 `1.59.0`，交付说明写明拷贝来源路径与版本）；每个 vendored 文件头注释含 `lucide:<upstream-name>@<该版本>`；`LICENSES/lucide.txt` 存在且含 ISC 原文关键段（`ISC License`、`Copyright (c)`、`Permission to use, copy, modify`、`THE SOFTWARE IS PROVIDED "AS IS"`）。
- **ac-no-network-source**：`assets/icons/**` 与 `components/Icon.tsx` 中除 SVG 命名空间 `http://www.w3.org/2000/svg` 外，0 处 URL（`http://` / `https://` / `//cdn`）、0 处 `fetch(` / `XMLHttpRequest` / 远程 sprite 引用；图标内容随构建产物打包，不在运行时拉取。
- **ac-icon-component-contract**：jsdom 中渲染 `<Icon name={X} size={16|20|24} />`，得到的 `<svg>` 具 `stroke="currentColor"`、`fill="none"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`aria-hidden="true"`、`data-icon="<X>"`、`viewBox="0 0 24 24"`，`width`/`height` 等于传入 size，`stroke-width` 等于 `strokeWidthFor(size)`；元素上无 `style` 颜色、无 `stroke="#…"` / `fill="#…"`；`size` 缺省为 16。
- **ac-optical-stroke**：`strokeWidthFor(24) === 2`；`strokeWidthFor(16) < strokeWidthFor(20) ≤ 2`；`strokeWidthFor(16) ≥ 1.25`；三档渲染出的 `stroke-width` 与函数逐项相等（24px 的 2px 描边不得直接用于 16px）；`src/renderer/src/**`（非测试）中 `size-3` / `size-3.5` / 其他非 16/20/24 的图标尺寸 class 0 处。当前取值 16 → **1.25**、20 → **1.5**、24 → **2**。
- **ac-entry-icon-table**：`Object.keys(SHELL_ENTRY_ICONS)` 与 `SHELL_ENTRY_IDS` 集合完全相等（多一条或少一条即红）；每个值存在于 `ICON_PATHS`；`UI_ICON_ACTIONS` 每个值同理；`ICON_PATHS` 中不存在未被任何映射引用的孤儿图标（仅 vendored 实际用到的图标）。
- **ac-icon-name-from-table**：`src/renderer/src/**/*.tsx`（非测试）中 `<Icon ... name="` 字面量 0 处——图标名只能来自 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / 其导出的派生函数（如节点类型 → 图标）；`src/renderer/src/**`（非测试）中裸 `<svg` 字面量 0 处（唯一例外是产出 svg 的 `components/Icon.tsx`）。
- **ac-no-lucide-react-in-renderer**：`src/renderer/**`（含测试文件）0 处 `from 'lucide-react'`；`eslint.config.mjs` 的 renderer `no-restricted-imports` 增列 `lucide-react` 与其它图标集（`@tabler/icons*`、`@heroicons/*`、`heroicons`、`feather-icons`、`react-icons/*`、`@fortawesome/*`、`bootstrap-icons`、`@mdi/*`），`lint` 门禁可拦；仓内 0 处来自上述包的引用。
- **ac-dependency-set-not-grown**：`package.json#dependencies` 键集 ⊆ 现有键集（无新增）；若移除 `lucide-react`，`src/shared/deps.test.ts` 同批改为断言 vendored 图标表（至少一个图标名可解析、上游版本常量非空）且不再 import 该包，`pnpm-lock.yaml` 与 `pnpm install` 门禁一致；若保留，则该包在 renderer 内零引用。
- **ac-icon-button-aria**：在 1024 档宽度渲染完整 `Workbench`（ready 态），「唯一可见子节点是 `svg[data-icon]` 且无 `aria-label` / 无可访问名」的 `button` 数量为 0；三档下 `SHELL_ENTRIES` 中 `icon-only` 呈现的 `[data-shell-entry]` 元素可访问名非空且等于对应 i18n 文案（沿用壳层既有断言，不放宽）。
- **ac-zero-emoji**：`src/renderer/src/**`（非测试）中 emoji 表现码点（`U+1F300–1FAFF`、`U+2600–27BF`、`U+FE0F`）0 处；icon-only 控件必含 `svg[data-icon]`，不存在「单个字符充当图标」的按钮。差异状态记号 `+ − ± ~ =`、排版记号 `→ ↔ ← ∅` 不属图标（见非目标）。
- **ac-custom-icons-bounded**：`assets/icons/custom/*.svg` 数量 ≤ 5（0 也合法）；每个文件头含 `自绘 · 库中缺口理由` 且理由正文非空；每个含 `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`，不含 `stroke-width` 与色值字面量；每个自绘图标名以 `custom-` 前缀且不与上游名冲突，并被某个动作映射引用。
- **ac-no-behavior-drift**：`src/core/**` 零 diff；`src/renderer/src/assets/main.css` 既有 token 取值（`--color-*` / `--text-*` / `--radius-*` / `--shadow-*`）零 diff（允许新增尺寸类 token，不改旧值）；`shellLayout.ts` 的 `SHELL_ENTRY_IDS`、每条的 `level` / `slot` / 三档 `presentation` / `width` 零变化；现有测试断言不放宽、不删除。
- **ac-gates-green**：`.munk/code-gates.json` 九门全绿（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate`）。

## 非目标

- 不做亮 / 暗主题、不改任何既有 token 取值（主题项后续批次）。
- 不改壳层布局、间距、tab 截断与 tab 交互模型（壳层项已交付；I#6 归后续）。
- 不改 diff 四态语义与差异状态记号字符（`+ − ± ~ =`）、`DiffBadge` / `DiffRuler` 的语义图形、CSV 的 `∅` / `→`、模板对话框的 `←`——它们是排版记号与语义标识，不是图标。
- 不改 `IconButton` / `ToolbarButton` 的 props 与尺寸档，不动 `Button.tsx` 的 API；只替换传入的图标内容。
- 不新增图标库、图标字体、运行时 CDN / 远程 sprite；不做图标动画改造（`LoaderCircle` 的 `animate-spin` 用法以 className 形式保留）。
- 不动品牌资产：`build/icons/icon.svg`、`build/icons/generate-icons.mjs` 与各尺寸 PNG 零 diff。
- 不做全量图标囤积（不把 1000+ Lucide 图标整体入库），只 vendored 界面实际用到的。
- 不做浏览器 / 真机 / 桌面点选走查（L3 由 product-qa 另开），不改发布通道与版本单点文件。

## 实现约束

- 复用 `shellLayout.ts` 导出的 `SHELL_ENTRY_IDS` / `SHELL_ENTRIES` 作为动作清单，**不另造动作 id**；`data-shell-entry` / `data-shell-level` 已是稳定断言钩子，图标项只在其内部换 svg，不加新结构。
- `TreeView.tsx` 内原局部变量 `Icon`（文件 / 文件夹字形）让给组件，局部改名为派生函数（`nodeGlyphIcon(node)` 返回图标名）；不另起第二套图标出口。
- 上游 SVG 从 `pnpm install` 后已安装的 `lucide-react` 包内拷贝；拷贝时剥离 `stroke-width` / `class` / `width` / `height` 等展示属性，只留几何内容。
- 映射表与图标表放 renderer 纯模块（`src/renderer/src/assets/icons/index.ts`），node 环境 vitest 可直接读；SVG 内容用 `?raw` 导入，`geometry()` 在模块内剥掉 `<svg>` 根并把标签间空白折叠成 `><`（避免空白文本节点污染按钮 `textContent`）——**测试必须在 node 环境核对文件内容**，不能只在 jsdom 里验。
- 尺寸三档 16 / 20 / 24；原 `size-3.5`(14) 的图标按钮（`IconButton` 内 `h-6 w-6`）升到 16 后仍须落在既有 `h-6 w-6` / 26px 宽度预算内；放不下时只允许调 `SHELL_ENTRIES` 的 `width` 常量并在交付说明给量测理由，**不得改呈现模式或移除入口**。
- `Icon` 始终 `aria-hidden`，可访问名只落在按钮（`IconButton.label` 仍是唯一来源）；不往 `Icon` 加 `label` / `title` prop。
- ESLint 侧用已有 `no-restricted-imports` 机制做机器校验（renderer files 段），不新增 lint 插件。
- 测试沿用 `src/**/*.test.ts(x)` 命名，jsdom 用单文件 `// @vitest-environment jsdom`，不新增测试依赖、不新增长跑门禁。
- `src/renderer/src/i18n/mainScan.test.ts` 的扫描根清单必须包含 `src/renderer/src/assets/icons`——新增图标文件不会自己进扫描范围，中文注释同理。

## 最近交付证明

- WI：`wi_ws_89b7fb11d723c9a9`（vendored Lucide 图标源 + 自有 `Icon` 组件与命名表，`kind: refactor/icon-source`）
- 日期：2026-10-30
- 结果：`code_gates` passed（9 gates，attempt 001 全绿，`.munk/runs/run_ws_5ca68a8d8144945a/code-gates/attempts/001`）；本轮 `needSelfTest=false`，UI 自测跳过。**新建本域**，未改历史域记录。
- 覆盖摘要：① **vendored 32 个 SVG**（`assets/icons/*.svg`，`ICON_PATHS` 32 键一一对应，0 孤儿），文件头 `lucide:<name>@1.59.0`，`LICENSES/lucide.txt` 存 ISC 原文；**0 个自绘图标**（库覆盖充分，未凑数）。② **`Icon` 组件**唯一产出 svg（`viewBox 0 0 24 24` / `fill="none"` / `stroke="currentColor"` / round 线帽线接 / `aria-hidden` / `data-icon`），`strokeWidthFor`: 16 → 1.25、20 → 1.5、24 → 2。③ **映射表**：`SHELL_ENTRY_ICONS` 20 键与 `SHELL_ENTRY_IDS` 完全相等，`UI_ICON_ACTIONS` 24 个非壳层动作，`TreeView` 局部 `Icon` 改名为派生函数。④ **全量迁移 13 个文件**（`App` / `Workbench` / `SessionTabs` / `TreeView` / `Dialog` / `DropdownMenu` / `NewCompareDialog` / `TemplateDialog` / `DirectorySyncDialog` / `CodeView` / `CsvView` / `DirectoryView` / `StructuredView`），`size-3` / `size-3.5` 等中间档 0 处。⑤ **`lucide-react` 已移除**（`package.json` 依赖、`pnpm-lock.yaml`、`src/shared/deps.test.ts` 同批改断言），ESLint renderer 段拦 `lucide-react` 与其它图标集。⑥ **测试**：新增 `icons.test.ts`（17 tests，node 侧静态核对文件内容）+ `Icon.test.tsx`（5 tests，jsdom 契约），`shellLayout.dom.test.tsx` 加「三档光学描边」与「无不可访问名 icon-only 按钮」两条；`pnpm test` 73 files / 1174 passed + 1 skipped（此前 897 量级的 i18n 轮次不可直接比，本波另有壳层项并入）。
- 证据：`code_gates` attempt 001 9 项全 passed，`test.log` 含 `src/renderer/src/assets/icons/icons.test.ts (17 tests)` 与 `src/renderer/src/components/Icon.test.tsx (5 tests)`；`git status` 迁移面 13 个 tsx + `eslint.config.mjs` + `package.json` + `pnpm-lock.yaml` + `deps.test.ts` + `mainScan.test.ts`，新增 `assets/icons/`（32 svg + 2 ts）、`Icon.tsx` / `Icon.test.tsx`、`LICENSES/`。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；AC 落档为 `qa/vendored-lucide-icons-and-icon-component.md`，组件清单与尺寸档口径同批写进 `design/components.md` / `design/foundations.md`。
- 后续注意：① **新增图标必须走「拷 SVG + 进 `ICON_PATHS` + 被映射引用」三步**——只加文件会红（文件数 ≠ 键数），只加表项不引用会红（孤儿图标检查）。② 图标名是唯一空间：`<Icon name="…">` 字面量已被钉死为 0 处，新界面必须先加映射再消费，不能就地写字面量。③ 上游升级 Lucide 时 `LUCIDE_VERSION` 常量、每个文件头注释、`package.json` 三处必须同批改，`icons.test.ts` 会逐文件比对注释版本。④ 图标尺寸不接受 `className="size-4"` 一类工具类，`size` 属性是唯一通道；`Icon` 内的 `dangerouslySetInnerHTML` 只吃自家表内容，不得改成外部输入。⑤ 差异状态记号（`+ − ± ~ =` / `→ ∅`）仍是文字而非图标，别在后续「图标覆盖」任务里误替换。
