# 工作台壳层层级与控件位置重排

基线：`refs/heads/main` 的 v0.2.11 树（`package.json#version = 0.2.11`，`src/renderer/src/components/DiffRuler.tsx` 与 `src/core/text/ruler.ts` 必须存在；缺失即上报基线不一致，不得开工）。

## 范围

只改界面壳层与视图工具区的**排布**，不增删功能。落点限定在：

1. **壳层层级单一化**（自上而下固定五级，同级只出现一次）：
   `app` 应用头（品牌 / 视图切换 / 全局动作）→ `sessions` 会话头（SessionTabs 所在行）→ `events` 事件带（notice / 目录扫描进度，仅有内容时出现）→ `view-toolbar` 视图工具区（含下钻返回条，同一行同一档）→ `panels` 左中右面板（Panel 标题栏 + 内容区）→ `status` 状态栏。
   现状需收口的偏差：下钻返回条自成一行 `h-8 px-2`，与应用头 `h-11 px-3`、会话头 `h-9`、状态栏 `h-8 px-3` 的水平节奏不一致；视图根内边距不统一（`DirectoryView` / `CsvView` / `StructuredView` 用 `p-2`，`CodeView` 主区无 `p-2`）。

2. **单一尺寸档表**：各级高度、水平内边距、元素间距、控件高度收敛到一张表（只允许用现有 Tailwind 档位 `h-6/h-7/h-8/h-9/h-11` 与现有 `--radius-*`），同一级在三档窗口宽度下高度不变；同一功能控件在不同视图不再出现高度 / 边距不一致。

3. **三档窗口宽度策略**：`1024`（compact）/ `1440`（regular）/ `1920`（wide）。壳层与各视图工具区**单行不换行**；compact 档允许按固定优先级只隐藏文本标签 / 次要副标题 / 图例文字（必须保留 `aria-label` 或 `title`），**禁止移除任何入口、禁止改成溢出菜单**。

4. **入口位置清单**：交付说明附「入口 → 位置（level + slot + 三档呈现模式）」表，覆盖下列 20 条现有入口，逐条证明无丢失、无新增功能：
   `open-file` / `open-folder` / `new-compare` / `samples` / `samples-menu` / `settings` / `filter` / `sync` / `template` / `snapshot-import` / `snapshot-export` / `report-export` / `drilldown-back` / `prev-diff` / `next-diff` / `override` / `save` / `merge-accept` / `export` / `tab-select`（含 `tab-close`，见非目标：位置可动，内部渲染不可动）。

5. **布局可断言化**：新增纯函数布局模块承载上表，并在 jsdom 中以三档宽度渲染真实壳层做确定性断言（不依赖真实布局引擎）。

## 验收

- ac-level-order: ready 态渲染后，`[data-shell-level]` 的 DOM 顺序严格为 `app` → `sessions` → (`events`) → (`view-toolbar`) → `panels` → `status`；每个 level 恰好出现一次；`events` 仅在存在 notice 或目录进度时出现，且位置在 `sessions` 之后、`view-toolbar` 之前。
- ac-level-metrics-single-source: 每个 level 的高度 / 水平内边距 / 间距 / 控件高度取自同一布局表（`shellLayout` 纯模块）；三档宽度渲染出的 level 高度 class 与该表逐项相等，且与窗口宽度无关（不随档位变化）。
- ac-no-wrap: 三档宽度下 `[data-shell-level="app"]` 与 `[data-shell-level="view-toolbar"]` 子树内不存在 `flex-wrap` / `flex-wrap-reverse` 容器；窗口宽度 1024 时 `events`、`sessions`、`panels` 级也不引入换行容器。
- ac-fit-1024 / ac-fit-1440 / ac-fit-1920: 对每档宽度、每个工具区，纯函数预算 `required ≤ available`（available = 窗口宽 − 该级左右内边距）返回 `true`；同一断言由 jsdom 渲染出的入口顺序与呈现模式复核。
- ac-entry-manifest-complete: 壳层布局模块声明的入口 id 集合与「范围 4」列出的 20 条**完全相等**（多一条或少一条即红）；ready 态 DOM 中每个 id 恰好出现一次（`data-shell-entry` 计数 = 1），且元素可见。
- ac-entry-tier-visibility: 每条入口在三档下都有确定的呈现模式（`label` / `icon-only`）；`icon-only` 时元素可访问名非空且等于对应 i18n 文案；任何档位下入口数量与 id 集合不变。
- ac-drilldown-unchanged: 下钻态返回条仍位于 `view-toolbar` 级首位、与视图工具区同档高度；点击仍回到父目录会话；按钮文案键与 `title` 键不变；往返后过滤器、折叠集合、选中行、双栏滚动位置保持（沿用现有断言，不得放宽）。
- ac-statusbar-unchanged: 状态栏条目集合与顺序不变（会话 id → 平台 → 兼容图例 → 会话 stats），无新增 / 删除条目；文字仍为 `text-2xs` + `tabular` 数字。
- ac-rows-not-reduced: 纯函数给出三档 ×（empty / ready）下的顶层 chrome 高度和与主内容可用高度；ready 态顶层 chrome 高度 ≤ 现状基线 `44 + 36 + 32 = 112px`；若任一视图可见行数较改动前减少，交付说明必须给「改前 / 改后 / 理由」对照表，否则视为未达成。
- ac-no-scope-drift: `src/renderer/src/components/SessionTabs.tsx`、`src/renderer/src/components/DiffRuler.tsx`、`src/core/**` 零 diff；`src/renderer/src/assets/main.css` 中 `--color-diff-*` 与 `--color-surface-*` 取值零 diff；无新增 `src/renderer/src/assets/icons/**`；`package.json` 依赖零变化；界面无新增 emoji / 文字充当图标。
- ac-gates-green: `.munk/code-gates.json` 全量绿（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate`）。
- ac-delivery-entry-table: 交付说明含「入口 → 位置」表，20 条逐条给出 level + slot + 三档呈现模式，并写明「无入口丢失、无新增功能」的核对方法与证据路径（测试文件 + 断言名）。

## 非目标

- 不改 `SessionTabs` 内部渲染、tab 选中 / 关闭 / 顺序 / 拖拽交互模型与标题截断规则（I#6 归后续项；本项只允许调整它所在**行**的高度与内边距）。
- 不迁移图标：继续沿用现有 `lucide-react` 直引，不新建图标组件、命名表或 vendored 资源。
- 不做亮 / 暗主题（`main.css` 仅暗色一套，主题归后续项）。
- 不改对比 / 合并 / 扫描算法、视图模型、四态语义、快照格式、报告内容。
- 不合并 `DirectoryView` 的三段工具行、不重排面板拆分比例策略、不改 `SplitPane` 交互。
- 不改 `NewCompareDialog` / `SettingsDialog` / `TemplateDialog` / `DirectorySyncDialog` 的内部布局与字段。
- 不做品牌重设计、不加动画炫技、不做移动端 / 窄屏适配、不新增依赖、不新增长跑门禁。
- 不做浏览器 / 真机 / 桌面上的人工点选走查（L3 由 product-qa 另开）。

## 实现约束

- 布局表与入口清单放进一个 renderer 侧纯模块（建议 `src/renderer/src/workbench/shellLayout.ts`，零 DOM / 零 Electron 依赖），至少导出：窗口宽度 → 档位解析、每 level 的 `{ height, paddingX, gap, controlHeight }`、入口 id → `{ level, slot, 三档呈现模式 }`、`measureToolbar(tier, level): { available, required, fits }`。测试只吃这些导出，不重复写死数值。
- 壳层各级带 `data-shell-level="{app|sessions|events|view-toolbar|panels|status}"`，受覆盖入口带 `data-shell-entry="{id}"`；这是三档断言与后续图标 / 主题项复用的稳定钩子，不加视觉表现。
- 尺寸档只取现有 Tailwind 档位与现有 `--radius-*` / `--shadow-panel`；不新增颜色 token，不写死色值。
- 优先复用 `Panel` / `ToolbarButton` / `IconButton` / `SegmentedControl` / `StatusBar` / `SessionTabs`，不新建壳层组件概念；确需新封装时限制在 `workbench/` 内的排布层。
- compact 档折叠是「隐藏文本、保留按钮」，不是隐藏按钮；折叠优先级写进布局表常量，不散落在 JSX 条件里。
- 三档断言用 `// @vitest-environment jsdom` 单文件 + 覆写 `window.innerWidth` 渲染真实 `Workbench`，不引入新的测试依赖，不新增长跑门禁。
