# 差异定位与同步滚动界面

前序已交付：`src/core/structured/locate.ts`（JSON Pointer → 单侧 `SourceRange`）与 `src/renderer/src/structured/`（后台 compare，产出 `StructuredCompareOutcome { diff, ranges }`，`ranges` 只含非 `same` 条目）。本项只做视图层闭环：`StructuredView` 里点差异行跳转并高亮、点原文反选差异行、双栏垂直同步滚动、过滤与切 tab 保持选中/滚动、原文与变更列表窗口化。语义引擎、四态口径、异步 compare 契约一律不动。

## 范围

1. **变更列表可选**：每行可点击 / 键盘激活（Enter / Space），选中态用既有 accent 语义呈现；选中路径驱动两侧原文定位与高亮。
2. **差异行 → 原文定位**：选中条目用 `ranges[path]` 的两侧区间，左右面板各自滚到该区间起始行并把区间内行着色；缺失侧（`exact:false`）滚到回退祖先起始行并显示「此侧不存在」标记，不伪造不存在的行。
3. **原文 → 差异行反选**：点击原文某行，选中「该行落在其区间内、路径最深」的变更条目；只认该侧 `exact:true` 的区间；点击「此侧不存在」标记选中该条目。
4. **双栏垂直同步滚动**：任一侧滚轮 / 键盘滚动，另一侧按相对比例联动；同步写入不回环。
5. **每会话保位**：`filter` / 选中路径 / 左右 `scrollTop` 由 Workbench 按 `session.id` 保存（沿用 `directoryStates` / `directoryScroll` 模式），切 tab 回来恢复，关闭会话清除。
6. **窗口化**：原文面板与变更列表复用 `DiffPane` 的固定行高 + `useVirtualizer` + `scrollTop` 回灌范式，阈值 `1000`、overscan `10`；≤1000 行全量渲染（既有小样本行为不变）。
7. **i18n**：新增文案（「此侧不存在」等）中英双语进 `messages/{zh,en}/files.ts`。

## 验收

- ac-reverse-deepest: 给定 entries 与 ranges，某侧第 6 行同时落在 added `/a`（第 3–20 行）与 modified `/a/b`（第 5–7 行）区间内时，`findChangeAtLine` 返回 `/a/b`；第 9 行返回 `/a`；第 21 行返回 `null`。
- ac-reverse-exact-only: 单侧 added `/a/b/c` 在缺失侧的区间为 `exact:false` 的回退祖先 `/a`（第 3–20 行）；对该侧第 6 行调用 `findChangeAtLine` 返回 `null`（祖先回退不参与反选），存在侧同路径 `exact:true` 时第 6 行返回 `/a/b/c`。
- ac-row-click-jump: 点击（或聚焦后 Enter / Space）变更行后，左右面板 `scrollTop` 分别等于 `min((startLine - 1) * 行高, scrollHeight - clientHeight)`（±1px）；两侧该区间内的行元素带高亮属性，区间外的行不带。
- ac-highlight-tokens: added / removed / modified / typeChanged 四种状态的选中条目，其原文高亮元素的 `data-highlight-status` 依次为 `added` / `removed` / `modified` / `conflict`，且 class 含对应的 `bg-diff-added-soft` / `bg-diff-removed-soft` / `bg-diff-modified-soft` / `bg-diff-conflict-soft`；高亮元素不出现其它 `bg-diff-*` 变体。
- ac-missing-side-marker: 选中单侧 added `/a/b/c` 后，存在侧高亮该节点区间并滚到其起始行；缺失侧滚到 `/a` 起始行，显示「此侧不存在」标记（en 下为对应英文），且缺失侧没有任何 `data-highlight-status` 元素。
- ac-missing-marker-select: 点击缺失侧的「此侧不存在」标记，选中条目变为该 added 条目（变更列表对应行 `aria-selected="true"`）。
- ac-source-click-select: 点击原文第 6 行（落在 `/a/b` 精确区间）后，变更列表 `/a/b` 行 `aria-selected="true"` 且其它行不为选中；随后点击第 9 行，`/a` 行成为选中。
- ac-source-click-no-match: 点击不落在任何 `exact:true` 差异区间内的行（如注释行 / `same` 节点行）时，当前选中路径保持不变（不清空、不改选）。
- ac-sync-ratio-wheel: 左侧 `scrollTop = 0.5 * (leftScrollHeight - leftClientHeight)` 后触发左侧 scroll，右侧 `scrollTop === 0.5 * (rightScrollHeight - rightClientHeight)`（±1px）；反向（右→左）同样成立，两侧滚动高度不同时按各自比例映射。
- ac-sync-no-loop: 右侧被同步写入后，其回灌的 scroll 事件（`scrollTop` 未变）不改变左侧 `scrollTop`；交替触发左右 scroll 各 3 次后两侧值收敛稳定（不递增、不振荡）。
- ac-sync-keyboard: 面板可聚焦（`tabIndex=0`）；聚焦左侧后 ArrowDown / ArrowUp 使其 `scrollTop` 变化恰好一个原文行高，PageDown / PageUp 变化恰好一个 `clientHeight`，Home 归 0、End 到最大滚动量，且每次右侧按比例跟随（±1px）。
- ac-jump-no-echo: 程序化跳转后，左右 `scrollTop` 分别是各自目标行的行高偏移（不是按比例镜像），且跳转期间产生的 scroll 事件不会把任一侧改写成另一侧的偏移。
- ac-filter-keeps-selection: 选中 `/a/b` 后切换到不含该条目的状态过滤：列表不渲染该行，但两侧高亮与 `scrollTop` 不变；切回「全部」后该行重新 `aria-selected="true"`。
- ac-tab-keeps-state: 在 Workbench 中打开结构化会话，选中某行并把两侧滚到非零偏移，切到另一会话再切回：过滤值、选中路径、左右 `scrollTop`（±1px）全部恢复；两个结构化会话（若同时存在）互不串味。
- ac-selection-reset-on-source: 切换格式或打开新文件后，选中路径清空（无 `aria-selected` 行、无高亮），两侧 `scrollTop` 归 0。
- ac-window-source: 原文行数 ≤1000 时渲染全部行（既有小样本断言不变）；>1000 时 DOM 中 `data-source-row` 元素数 ≤ `ceil(clientHeight / 行高) + 2 * 10`，且与总行数无关。
- ac-window-changes: 过滤后可见变更行 ≤1000 时全部渲染；>1000 时 DOM 中 `data-change-row` 元素数 ≤ `ceil(clientHeight / 行高) + 2 * 10`，且窗口起点随 `scrollTop` 前移（`data-change-window-start` 变化）。
- ac-scale-5mb: 确定性生成两份 `Buffer.byteLength >= 5 * 1024 * 1024`、≥8 层嵌套、含 added / removed / modified / typeChanged 的 JSON 文件，经后台对比落地后：两侧原文行数 > 1000 且 `data-source-row` 数量仍满足 ac-window-source 上界；点击一条已知变更行后两侧 `scrollTop === min((line - 1) * 行高, maxScroll)`（±1px）；无异常、无未处理 rejection；该用例超时上限 60s。
- ac-i18n: 「此侧不存在」等新增文案 zh / en 双语齐全；en 渲染下不出现中文，zh 渲染下不出现英文兜底键名；既有 i18n 扫描测试通过。
- ac-existing-green: `src/renderer/src/views/StructuredView.test.tsx`、`StructuredView.async.test.tsx`、`src/core/structured/diff.test.ts`、`locate.test.ts` 断言不减少不弱化（只允许为适配异步/窗口化改为等待或更精确的查询）；`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm build:web` 全绿，不新增 gate id。

## 非目标

- 不改 `src/core/structured/diff.ts` / `parse.ts` / `locate.ts` 的既有签名、五态口径、计数与 `SourceRange` 形状；不改 `StructuredCompareOutcome` / `ranges` 键口径。
- 不做行内字符级高亮（只整行 / 节点区间着色）；不做水平滚动同步；不做原文编辑、写回、保存。
- 不做 per-session 对比结果缓存、worker 池、并行对比：切 tab 回来仍会重新对比，只保证选中与滚动位置恢复。
- 不新增第一类打开入口、不改主进程 IPC / 扫描 / 哈希、不动扩展名白名单与 `.munk/code-gates.json`（语义门属兄弟子项）。
- 不新增视觉 token / 色板 / 组件库；不做移动端与窄屏适配；不做 CRLF/LF、编码归一化、BOM（I#9 挂账）；不做 YAML 多文档 / merge key / alias。
- 不开浏览器、真机、桌面点选工单（L3 另验）。

## 实现约束

- **受控视图**：`StructuredView` 的 `filter` / `selectedPath` / `scrollTops` 改为受控 props + 回调，Workbench 按 `session.id` 持有 `{ filter, selectedPath, scroll: { left, right } }`，关闭会话时清除（对齐 `directoryStates` / `directoryScroll` / `withoutKey` 写法）。`opened` / `selected`（格式）仍留视图本地。
- **反选纯函数**：落 `src/core/structured/locateLine.ts`（名称可等价），Node 可直接 import、零 DOM / React / Electron 依赖；入参为 entries + 区间查询函数（或等价结构），只认该侧 `exact:true`，命中多个取 pointer 段数最深者，无命中返回 `null`。视图不得自造第二套匹配逻辑。
- **窗口化复用**：原文面板新增 `SourcePane`（或等价）组件，复用 `DIFF_ROW_HEIGHT`、`useVirtualizer`、`WINDOW_THRESHOLD = 1000`、`ROW_OVERSCAN = 10`、`scrollTop` 回灌范式；变更列表用同一范式与同一阈值，行高为自有固定常量（如 24px）。不新建第二套虚拟化体系。
- **滚动同步规则**：垂直方向按 `scrollTop / (scrollHeight - clientHeight)` 比例映射；记录「最后同步写入另一侧的值」，该侧回灌同值 scroll 事件直接忽略以避免回环；程序化跳转同时写两侧各自目标偏移并抑制该次回灌。不引入 rAF 轮询。
- **断言钩子**：`data-change-row`、`data-source-row`、`data-source-window-start`、`data-change-window-start`、`data-highlight-status`、`aria-selected`；选中行与高亮颜色只用既有 token。
- **i18n**：新增文案进 `src/renderer/src/i18n/messages/{zh,en}/files.ts`，不硬编码中文。
- **测试落位**：反选 `src/core/structured/locateLine.test.ts`；跳转 / 高亮 / 反选 / 同步 / 过滤与重挂载保位 / i18n 放 `src/renderer/src/views/StructuredView.locate.test.tsx`；5MB 放 `src/renderer/src/views/StructuredView.scale.test.tsx`；切 tab 保位放 `src/renderer/src/workbench/structuredSessionState.dom.test.tsx`（或并入现有 `shellLayout.dom.test.tsx`）。5MB 样本在测试内确定性生成到 `os.tmpdir()` 后读回，不提交 MB 级 fixture，该用例超时 ≤60s。
- **jsdom 无布局**：沿用 `DiffPane.test.tsx` 的 `clientHeight` / `clientWidth` stub 范式（可按 data 属性给不同元素不同 `scrollHeight`），不得因缺布局跳过窗口化或同步断言。
