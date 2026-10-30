# 会话 tab 标题命名与长路径截断

## 范围

只做 I#6 的「tab 标题 / 副标题的命名与截断规则」，落点两处：

1. **纯函数层（先做，先测后用）**：新增一个零 DOM / 零 React / 零 Electron 的纯模块，输入真实左右路径（及由 `sessionDisplay` 派生的标题 / 副标题文本），输出可直接渲染的显示文本、被省略字符数与省略位置。规则覆盖：
   - 单段文本裁尾（`…` + 原文尾部连续子串），保留文件扩展名；
   - `A ↔ B` 成对文本：两侧各保留尾部、预算均分、分隔符与两侧间空格必须保留，任一侧不得被压成空串；
   - 副标题的省略优先级：先丢 ` · <格式>` 后缀段，再裁路径；
   - 每个宽度档（compact 1024 / regular 1440 / wide 1920）的最大 tab 宽度与标题 / 副标题显示列预算，收敛到同一张表。
2. **组件层**：`SessionTabs` 用上述结果渲染标题与副标题，并保证三档宽度下 tab 区不换行、不溢出、关闭按钮不被挤压；紧凑档不渲染副标题。选中 / 关闭 / 顺序 / 无障碍语义保持现状。

数据来源链路不变：`Workbench` 继续用 `describeSession` + `renderSessionText` 派生每个会话的标题 / 副标题，截断只发生在 `SessionTabs` 内部（`SessionTabs` 现有 props 不变）。

## 验收

- ac-pure-module-pure: 截断规则以纯函数模块导出，可在 Node 环境被 vitest 直接 import，模块与依赖链零 React / DOM / Electron 引用；同一输入两次调用输出全等（确定性），且幂等（对输出再截断输出不再变化）。
- ac-clip-tail-shape: 裁尾函数在超预算时输出恰以一个 `…` 开头，其后为原串的连续尾部子串（`output.slice(1)` 是 `input` 的后缀）；同时返回被省略字符数与省略起始下标，`input.length - omittedCount === output.slice(1).length`，`omittedAt === input.length - output.slice(1).length`。
- ac-clip-budget-bound: 任一输入下输出长度 ≤ 该档预算；输入未超预算时输出 === 输入且标记「未截断」、省略字符数为 0；预算 ≤ 1 时不抛错、不返回空串。
- ac-clip-keeps-extension: 输入末段含扩展名（如 `.ts` / `.json` / `.csv`）且预算 ≥ 扩展名长度 + 1 时，输出仍以同一扩展名结尾；预算小于该长度时输出仍非空。
- ac-pair-budget-split: `A ↔ B` 超预算时，输出保留 `↔` 及其两侧空格；两侧可显示列数差值 ≤ 1（均分）；任一侧保留段非空（输出中 `↔` 两侧都不为空字符串）；两侧各自满足 ac-clip-tail-shape。
- ac-subtitle-drop-order: 副标题含 ` · <格式>` 段且超预算时，先整体丢弃该后缀段再裁路径（输出中不再出现 ` · `）；丢弃后未超预算则路径部分原样保留。
- ac-budget-table-single-source: 每档的最大 tab 宽度与标题 / 副标题显示列预算来自单一表（组件与测试共读同一导出）；表满足不变量：`tabMaxWidthPx ≥ chromeWidthPx + (titleCols + subtitleCols) × columnPx`，`compact < regular < wide`（宽度与预算均单调增），`compact` 副标题预算为 0，三档标题预算均 ≥ 8。
- ac-compact-hides-subtitle: 窗口宽 1024 渲染含副标题的会话时，tab 内不存在副标题文本节点（可检索到标题文本、检索不到副标题文本）；宽 1440 / 1920 渲染同一会话时副标题节点存在且文本等于纯函数在该档预算下的输出。
- ac-tier-renders-pure-output: 固定 `window.innerWidth` 为 1024 / 1440 / 1920 各渲染一次含超长左右路径的会话，每个 tab 的标题文本与副标题文本逐字等于纯函数在对应档预算下的输出（非浏览器二次裁切的猜测值）。
- ac-nowrap-no-overflow: 三档下 tab 条带与 tab 项均无 `flex-wrap` 系列类；tab 条带保持横向滚动容器；每个 tab 容器带来自预算表的宽度上界，标题 / 副标题文本节点带 `min-w-0` 与 `truncate`（或等价的单行裁剪组合），文本节点无 `whitespace-normal` / 换行类。
- ac-close-button-not-squeezed: 关闭按钮位于被裁剪的文本容器之外且不随标题长度改变：短标题与满预算长标题两次渲染下，关闭按钮的 class 与所在 tab 的 flex 结构一致，按钮仍可点击并只对自身 tab 调用一次 `onClose`。
- ac-full-text-not-lost: 被截断的 tab 仍可通过 tab 元素的 `title` 属性或 `aria-label` 取得未截断的完整标题（及副标题，若展示），截断不导致语义信息丢失。
- ac-title-follows-session: 切到另一会话后，tab 显示文本由目标会话的 `describeSession` 结果派生：文本包含目标会话真实左右路径的最深段、不再包含上一个会话独有的最深段；把同一会话的目录根改名或换根后重渲染，同一 tab 文本跟随新根，不等于旧 `session.title` 冻结文案。
- ac-tab-semantics-unchanged: 选中 / 关闭 / 顺序语义零变化——点击 tab 触发一次 `onSelect`、`aria-selected` 仅目标 tab 为 true、`onClose` 只对目标 tab 触发、渲染顺序 === 传入 `tabs` 顺序；未新增 role / 键盘交互 / 拖拽行为。
- ac-reuse-existing-consumers: `SessionTabs` 既有 props 与导出不变（不新增必填 prop），`src/renderer/src/components/sharedI18n.test.tsx` 与 `src/renderer/src/perf/perfShell.test.tsx` 现有断言不改即通过。

## 非目标

- 不改 tab 交互模型：选中、关闭（含未保存提示）、顺序、拖拽、键盘导航一律不动；不加 tab 悬停预览、不加 tab 右键菜单、不做 tab 数量上限或合并。
- 不改会话模型与数据链路：`session.ts` / `sessionStore` / `describeSession` / `renderSessionText` 的派生语义不改，不把显示文案冻结进会话数据；不新增 i18n 文案 key（省略符不算文案）。
- 不改对比 / 合并 / 扫描算法、四态语义、快照格式、发布通道与版本单点文件；不改壳层层级、间距表、入口清单（`shellLayout.ts` 的既有条目只读）。
- 不做图标迁移 / 新增图标（沿用 `Icon` + `UI_ICON_ACTIONS`）；不动主题与配色；不新增 token 或第二套颜色。
- 不做浏览器 / 真机 / 桌面点选验证，不做 README 截图，不做移动端 / 窄屏（< 1024）适配。
- 不引第三方截断 / tooltip 组件或新依赖；不加长跑门禁。

## 实现约束

- 基线：`refs/heads/main` 的 v0.2.11 树（`package.json#version = 0.2.11`，`src/core/text/ruler.ts` 与 `components/DiffRuler.tsx` 存在）。开工人先核对，缺失即上报基线不一致。
- 顺序：先写纯函数与它的单测（红→绿），再改 `SessionTabs`；禁止先改组件再补测试。
- 纯模块放在 `src/renderer/src/workbench/` 下、与 `sessionDisplay.ts` 并列（workbench 层已有纯函数惯例），零 DOM / Electron 依赖；档位口径沿用 `shellLayout.ts` 的 `WidthTier` / `resolveWidthTier`，不另造第二套断点。
- 省略符固定为单个 `…`（U+2026），不用三个点或 `...`；裁剪只做首尾，不插入别的字符。
- 档位判定与预算只允许一处表：组件从表读，测试从同一处读；不得在 `SessionTabs` 里写死第二份数字，也不用 Tailwind 响应式前缀（`lg:` 等）做档位分支——现有副标题的 `hidden lg:inline` 改为按档位表渲染。
- jsdom 无布局，视觉保证由「预算表给出的宽度上界 + `min-w-0 truncate`」承担，测试断言看类与文本，不做像素量测。
- 宽度断言沿用 `shellLayout.dom.test.tsx` 的 `setWindowWidth` 手法（`Object.defineProperty(window, 'innerWidth', …)`），新增组件测试放 `src/renderer/src/components/SessionTabs.test.tsx`。
- 若新增文件含 UI 文案（中文），必须登记进 `src/renderer/src/workbench/shellScan.test.ts` 的 `SHELL_COPY_FILES`；本项预期不新增文案。
- 默认走 `.munk/code-gates.json`，不新增门禁；交付说明写清改了哪些文件、档位表数值与理由、回归断言清单。
