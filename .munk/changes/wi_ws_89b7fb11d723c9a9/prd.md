# vendored Lucide 图标源与自有图标组件 / 命名表

基线：`refs/heads/main` 的 v0.2.11 树，tip 已含壳层项 `8e56046`。开工先确认
`src/renderer/src/workbench/shellLayout.ts`（导出 `SHELL_ENTRY_IDS` / `SHELL_ENTRIES`）与
`src/renderer/src/components/DiffRuler.tsx` 存在；缺失即上报基线不一致，不得开工。

现状事实（已核对）：`lucide-react` 直引共 14 处（App / Dialog / DropdownMenu / SessionTabs /
TreeView / CodeView / CsvView / DirectoryView / StructuredView / TemplateDialog /
DirectorySyncDialog / NewCompareDialog / Workbench，另 `src/shared/deps.test.ts` 一处内容指纹式引用）；
图标尺寸混用 `size-3`(12) / `size-3.5`(14) / `size-4`(16) / `size-5`(20)；无 `LICENSES/` 目录，
仓内唯一 SVG 是品牌图标源 `build/icons/icon.svg`。

## 范围

1. **vendored 图标源**：把界面实际用到的图标，从已安装的 `lucide-react` 包逐个拷成 SVG 到
   `src/renderer/src/assets/icons/`（一图标一文件，文件名 = 上游图标名 kebab-case），文件头注释注明
   `lucide:<upstream-name>@<实测版本>`；同目录放图标表 TS 模块（图标名 → 内容，导出上游版本常量）。
   `LICENSES/lucide.txt` 存上游 ISC 许可证原文（含版权行）。
2. **自绘缺口**：仅当库中确无语义合适字形时自绘，放 `assets/icons/custom/`，上限 5 个，文件头注
   `自绘 · 库中缺口理由` + 理由正文；守 `viewBox="0 0 24 24"` / 2px 描边语义 / `round` / `fill="none"` /
   `currentColor`。库里有合适字形就必须用库图标，不为了凑数自绘。
3. **自有 Icon 组件**：`src/renderer/src/components/Icon.tsx`，入参 `{ name, size?: 16 | 20 | 24, className }`；
   输出 `<svg>` 固定 `stroke="currentColor"` / `fill="none"` / `stroke-linecap="round"` /
   `stroke-linejoin="round"` / `aria-hidden` / `data-icon={name}`；描边宽度按 `strokeWidthFor(size)`
   光学缩放（24 → 2，尺寸越小越细，单调）。
4. **命名表 / 映射表**（零 DOM、零 Electron 依赖，node 环境可直读）：
   - `ICON_PATHS`：图标名 → 图形内容，唯一图标名空间；
   - `SHELL_ENTRY_ICONS: Record<ShellEntryId, IconName>`：动作 → 图标名，键集必须与
     `SHELL_ENTRY_IDS` **完全相等**（缺一个即红）；
   - `UI_ICON_ACTIONS`：非壳层界面动作（关闭 / 展开折叠 / 文件 / 文件夹 / 代码文件 / 加载 / 告警 /
     覆写 / 复制 / 下载 / 上传 / 刷新…）→ 图标名。
5. **全量迁移**：`App` / `Workbench` / `SessionTabs` / `TreeView` / `Dialog` / `DropdownMenu` /
   `NewCompareDialog` / `TemplateDialog` / `DirectorySyncDialog` / `CodeView` / `CsvView` /
   `DirectoryView` / `StructuredView` 里现有 `lucide-react` 用法全部改走 Icon + 映射表，尺寸收敛到
   **16 / 20 / 24 三档**（现有 12 / 14 档统一升到 16，不留中间档）。
6. **依赖判定**：推荐移除 `lucide-react`（单一来源更彻底）；保留亦可，但 renderer 必须零引用。
   任何情况下不得新增 npm 依赖。

## 验收

- ac-vendored-source: `src/renderer/src/assets/icons/` 下 SVG 文件数与 `ICON_PATHS` 键数相等；每个文件可解析为 `<svg>`，含 `viewBox="0 0 24 24"` 与 `fill="none"`，且**不含** `stroke-width` 属性、不含 `#` 色值 / `rgb(` / 具名颜色字面量；每个文件名（去 `.svg`）唯一且与图标表中的上游名一一对应，同一上游名只允许一份文件。
- ac-upstream-version-and-license: 图标表导出的上游版本常量等于实测的已安装 `lucide-react` 版本（当前 `package.json` 声明 `^1.59.0`，以 `node_modules/lucide-react/package.json#version` 实测值为准并写进交付说明），每个 vendored 文件头注释含 `lucide:<upstream-name>@<该版本>`；`LICENSES/lucide.txt` 存在且含 ISC 原文关键段（`ISC License`、`Copyright (c)`、`Permission to use, copy, modify`、`THE SOFTWARE IS PROVIDED "AS IS"`）。
- ac-no-network-source: `assets/icons/**` 与 `components/Icon.tsx` 中除 SVG 命名空间 `http://www.w3.org/2000/svg` 外，0 处 URL（`http://` / `https://` / `//cdn`）、0 处 `fetch(` / `XMLHttpRequest` / 远程 sprite 引用；图标内容随构建产物打包，不在运行时拉取。
- ac-icon-component-contract: jsdom 中渲染 `<Icon name={X} size={16|20|24} />`，得到的 `<svg>` 具 `stroke="currentColor"`、`fill="none"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`aria-hidden="true"`、`data-icon="<X>"`，`width`/`height` 等于传入 size，`stroke-width` 等于 `strokeWidthFor(size)`；元素上无 `style` 颜色、无 `stroke="#…"` / `fill="#…"`。
- ac-optical-stroke: `strokeWidthFor(24) === 2`；`strokeWidthFor(16) < strokeWidthFor(20) ≤ 2`；`strokeWidthFor(16) ≥ 1.25`；三档渲染出的 `stroke-width` 与函数逐项相等（即 24px 的 2px 描边不会直接用于 16px）；`src/renderer/src/**`（非测试）中 `size-3` / `size-3.5` / 其他非 16/20/24 的图标尺寸 class 0 处。
- ac-entry-icon-table: `Object.keys(SHELL_ENTRY_ICONS)` 与 `SHELL_ENTRY_IDS` 集合完全相等（多一条或少一条即红）；每个值存在于 `ICON_PATHS`；`UI_ICON_ACTIONS` 每个值同理；`ICON_PATHS` 中不存在未被任何映射引用的孤儿图标（仅 vendored 实际用到的图标）。
- ac-icon-name-from-table: `src/renderer/src/**/*.tsx`（非测试）中 `<Icon ... name="` 字面量 0 处——图标名只能来自 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / 其导出的派生函数（如节点类型 → 图标）；`src/renderer/src/**`（非测试）中裸 `<svg` 字面量 0 处（图标只由 Icon 产出）。
- ac-no-lucide-react-in-renderer: `src/renderer/**`（含测试文件）0 处 `from 'lucide-react'`；`eslint.config.mjs` 的 renderer `no-restricted-imports` 增列 `lucide-react` 与其它图标集（`@tabler/icons*`、`@heroicons/*`、`heroicons`、`feather-icons`、`react-icons/*`、`@fortawesome/*`、`bootstrap-icons`、`@mdi/*`），`lint` 门禁可拦；仓内 0 处来自上述包的引用。
- ac-dependency-set-not-grown: `package.json#dependencies` 键集 ⊆ 现有键集（无新增）；若移除 `lucide-react`，`src/shared/deps.test.ts` 同批改为断言 vendored 图标表（至少一个图标名可解析、上游版本常量非空）且不再 import 该包，`pnpm-lock.yaml` 与 `pnpm install` 门禁一致；若保留，则该包在 renderer 内零引用。
- ac-icon-button-aria: 在 1024 档宽度渲染完整 `Workbench`（ready 态），「唯一可见子节点是 `svg[data-icon]` 且无 `aria-label` / 无可访问名」的 `button` 数量为 0；三档下 `SHELL_ENTRIES` 中 `icon-only` 呈现的 `[data-shell-entry]` 元素可访问名非空且等于对应 i18n 文案（沿用壳层既有断言，不放宽）。
- ac-zero-emoji: `src/renderer/src/**`（非测试）中 emoji 表现码点（`U+1F300–1FAFF`、`U+2600–27BF`、`U+FE0F`）0 处；icon-only 控件必含 `svg[data-icon]`，不存在「单个字符充当图标」的按钮。（差异状态记号 `+ − ± ~ =`、排版记号 `→ ↔ ← ∅` 不属图标，见非目标）
- ac-custom-icons-bounded: `assets/icons/custom/*.svg` 数量 ≤ 5（0 也合法）；每个文件头含 `自绘 · 库中缺口理由` 且理由正文非空；每个含 `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`，不含 `stroke-width` 与色值字面量；每个自绘图标名以 `custom-` 前缀且不与上游名冲突，并被某个动作映射引用（无装饰性图标）。
- ac-no-behavior-drift: `src/core/**` 零 diff；`src/renderer/src/assets/main.css` 既有 token 取值（`--color-*` / `--text-*` / `--radius-*` / `--shadow-*`）零 diff（允许新增尺寸类 token，不改旧值）；`shellLayout.ts` 的 `SHELL_ENTRY_IDS`、每条的 `level` / `slot` / 三档 `presentation` / `width` 零变化；现有测试断言不放宽、不删除。
- ac-gates-green: `.munk/code-gates.json` 九门全绿（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate`）。

## 非目标

- 不做亮 / 暗主题、不改任何既有 token 取值（主题项后续批次）。
- 不改壳层布局、间距、tab 截断与 tab 交互模型（壳层项已交付；I#6 归后续）。
- 不改 diff 四态语义与差异状态记号字符（`+ − ± ~ =`）、`DiffBadge` / `DiffRuler` 的语义图形、
  CSV 的 `∅` / `→`、模板对话框的 `←`——它们是排版记号与语义标识，不是图标，本项不纳入。
- 不改 `IconButton` / `ToolbarButton` 的 props 与尺寸档，不动 `Button.tsx` 的 API；只替换传入的图标内容。
- 不新增图标库、图标字体、运行时 CDN / 远程 sprite；不做图标动画改造（`LoaderCircle` 的 `animate-spin` 用法以 className 形式保留）。
- 不动品牌资产：`build/icons/icon.svg`、`build/icons/generate-icons.mjs` 与各尺寸 PNG 零 diff。
- 不做全量图标囤积（不把 1000+ Lucide 图标整体入库），只 vendored 界面实际用到的。
- 不做浏览器 / 真机 / 桌面点选走查（L3 由 product-qa 另开），不改发布通道与版本单点文件。

## 实现约束

- 复用 `shellLayout.ts` 导出的 `SHELL_ENTRY_IDS` / `SHELL_ENTRIES` 作为动作清单，**不另造动作 id**；
  `data-shell-entry` / `data-shell-level` 已是稳定断言钩子，图标项只在其内部换 svg，不加新结构。
- `TreeView.tsx` 内已有局部变量 `Icon`（文件 / 文件夹字形），迁移时该名字让给组件，局部改名为派生函数
  （如 `nodeGlyphIcon(node)` 返回图标名），不要把组件改名或另起第二套图标出口。
- 上游 SVG 从 `pnpm install` 后已安装的 `lucide-react` 包内拷贝，交付说明给拷贝来源路径与实测版本；
  拷贝时剥离 `stroke-width`、`class`、`width`/`height` 等展示属性，只留几何内容，描边由组件统一决定。
- 映射表与图标表放 renderer 侧纯模块（建议 `src/renderer/src/assets/icons/index.ts` 或等价），
  node 环境 vitest 可直接读；SVG 内容用 `?raw` 导入或构建期生成 TS 常量皆可，但**测试必须能在
  node 环境核对文件内容**，不能只在 jsdom 里验。
- 尺寸三档 16 / 20 / 24；现有 `size-3.5`(14) 的图标按钮（`IconButton` 内 h-6 w-6）升到 16 后仍须落在
  既有 `h-6 w-6` / 26px 宽度预算内；若某处确实放不下，只允许调 `SHELL_ENTRIES` 的 `width` 常量并在
  交付说明给量测理由，**不得改呈现模式或移除入口**。
- `Icon` 始终 `aria-hidden`，可访问名只落在按钮（`IconButton.label` 仍是唯一来源）；不往 `Icon` 加
  `label` / `title` prop。
- ESLint 侧用已有 `no-restricted-imports` 机制做机器校验（renderer files 段），不新增 lint 插件。
- 测试沿用 `src/**/*.test.ts(x)` 命名，jsdom 用单文件 `// @vitest-environment jsdom`，不新增测试依赖、
  不新增长跑门禁。
- 交付说明需给：「图标名 → 上游名」逐条核对表、实测版本号与拷贝来源、`strokeWidthFor` 三档取值、
  迁移文件清单、`lucide-react` 去留判定与理由。
