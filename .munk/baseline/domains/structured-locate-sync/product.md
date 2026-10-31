# Domain: structured-locate-sync

结构化对比的 **视图层导航域**：把 `structured-async-compare` 域已经产出的 `StructuredCompareOutcome { diff, ranges }` 接成可点选、可反选、可同步滚动、可保位、可窗口化的双向定位界面。语义引擎（`src/core/structured/diff.ts` / `parse.ts` / `locate.ts`）与异步 compare 契约一律不动；本域只拥有「差异行 → 原文区间」与「原文行 → 差异行」的交互闭环、双栏垂直同步滚动、过滤与切 tab 的选中/滚动保位，以及原文面板与变更列表的窗口化。

## 范围

- **变更列表可选（`StructuredPanes` 变更列表）**：每行可点击，也可聚焦后 Enter / Space 激活；选中态用既有 accent 语义（`aria-selected`）呈现。选中路径是唯一导航真相，驱动两侧原文定位与高亮。
- **差异行 → 原文定位**：选中条目用 `ranges[path]` 的左右 `SourceRange`，两侧原文面板各自滚到该区间起始行（`(startLine - 1) * SOURCE_ROW_HEIGHT`，上限 `scrollHeight - clientHeight`），区间内行加高亮属性 `data-highlight-status` 与 `bg-diff-*-soft` 类。
  - 单侧缺失（该侧 `exact:false` 的祖先回退区间）时：滚到回退祖先起始行，并在该侧面板标题栏显示「此侧不存在」标记（`files.structured.missingSide`，zh `此侧不存在` / en `Not on this side`），**不伪造不存在的行**、不产生任何高亮元素。
- **原文 → 差异行反选**：点击原文某行，选中「该行落在其区间内、JSON Pointer 段数最深」的变更条目（纯函数 `findChangeAtLine`，落 `src/core/structured/locateLine.ts`，零 DOM / React / Electron 依赖）。
  - 只认该侧 `exact:true` 的区间：祖先回退区间不参与反选。
  - 点在无 `exact:true` 区间覆盖的行（`same` 节点行 / 注释行 / 空白行）时当前选中保持不变（不清空、不改选）。
  - 点击「此侧不存在」标记 → 选中该新增条目。
- **双栏垂直同步滚动**：任一侧滚轮 / 键盘滚动，另一侧按 `scrollTop / (scrollHeight - clientHeight)` 比例映射（两侧滚动高度不同时各按自身比例）。
  - 记录「最后同步写入对侧的值」与「程序化写入值」，其回灌的同值 scroll 事件直接忽略，杜绝回环；交替滚动收敛稳定、不递增不振荡；不引入 rAF 轮询。
- **键盘滚动**：原文面板 `tabIndex=0` 可聚焦；ArrowDown / ArrowUp 移动恰好一个原文行高（`SOURCE_ROW_HEIGHT` = `DIFF_ROW_HEIGHT` = 20px），PageDown / PageUp 移动一个 `clientHeight`，Home 归 0、End 到最大滚动量，每次对侧按比例跟随。
- **每会话保位**：`filter` / `selectedPath` / 左右 `scrollTop` 由 `Workbench` 按 `session.id` 保存（`structuredStates` / `structuredScroll`，沿用 `directoryStates` / `directoryScroll` 的 `withoutKey` 写法），`StructuredView` 相应改为受控 props + 回调（`filter` / `onFilterChange` / `selectedPath` / `onSelectPath` / `scrollTops` / `onScrollTopChange`），关闭会话时清除；`opened` / `selected`（格式）仍留视图本地。
- **选中态重置**：切换格式或打开新文件后选中路径清空、两侧 `scrollTop` 归 0（视图 bump `resetToken` 让两个列表重挂载到重置偏移，不复用上一份文件的位置）。
- **窗口化（复用 `DiffPane` 范式）**：`WINDOW_THRESHOLD = 1000` / `ROW_OVERSCAN = 10` 从 `DiffPane` 导出复用，原文面板行高 `SOURCE_ROW_HEIGHT = DIFF_ROW_HEIGHT`、变更列表行高 `CHANGE_ROW_HEIGHT = 24`，两者都用 `useVirtualizer` + `scrollTop` 回灌；≤1000 行全量渲染（既有小样本行为与断言不变）。断言钩子 `data-source-row` / `data-source-window-start` / `data-change-row` / `data-change-window-start`。
- **i18n**：新增文案 `files.structured.changeList`（zh `节点变更列表` / en `Node change list`）与 `files.structured.missingSide` 进 `src/renderer/src/i18n/messages/{zh,en}/files.ts`，不硬编码中文。
- **视觉口径集中**：`src/renderer/src/views/structuredStatus.ts` 统一 `SOURCE_ROW_HEIGHT` / `CHANGE_ROW_HEIGHT` / `STATUS_LABELS` / `STATUS_TONES` / `HIGHLIGHT_STATUSES` / `HIGHLIGHT_CLASSES` / `VALUE_CLASSES`，视图与行壳共享同一套 `--color-diff-*` 映射；`typeChanged` 用 conflict 色调，高亮元素只出现一条 `bg-diff-*-soft` 变体。

## 验收

- **ac-reverse-deepest**：给定 entries 与 ranges，某侧第 6 行同时落在 added `/a`（第 3–20 行）与 modified `/a/b`（第 5–7 行）区间内时，`findChangeAtLine` 返回 `/a/b`；第 9 行返回 `/a`；第 21 行返回 `null`。
- **ac-reverse-exact-only**：单侧 added `/a/b/c` 在缺失侧的区间为 `exact:false` 的回退祖先 `/a`（第 3–20 行）；对该侧第 6 行调用 `findChangeAtLine` 返回 `null`（祖先回退不参与反选），存在侧同路径 `exact:true` 时第 6 行返回 `/a/b/c`。
- **ac-row-click-jump**：点击（或聚焦后 Enter / Space）变更行后，左右面板 `scrollTop` 分别等于 `min((startLine - 1) * 行高, scrollHeight - clientHeight)`（±1px）；两侧该区间内的行元素带高亮属性，区间外的行不带。
- **ac-highlight-tokens**：added / removed / modified / typeChanged 四种状态的选中条目，其原文高亮元素的 `data-highlight-status` 依次为 `added` / `removed` / `modified` / `conflict`，且 class 含对应的 `bg-diff-added-soft` / `bg-diff-removed-soft` / `bg-diff-modified-soft` / `bg-diff-conflict-soft`；高亮元素不出现其它 `bg-diff-*` 变体。
- **ac-missing-side-marker**：选中单侧 added `/a/b/c` 后，存在侧高亮该节点区间并滚到其起始行；缺失侧滚到 `/a` 起始行，显示「此侧不存在」标记（en 下为对应英文），且缺失侧没有任何 `data-highlight-status` 元素。
- **ac-missing-marker-select**：点击缺失侧的「此侧不存在」标记，选中条目变为该 added 条目（变更列表对应行 `aria-selected="true"`）。
- **ac-source-click-select**：点击原文第 6 行（落在 `/a/b` 精确区间）后，变更列表 `/a/b` 行 `aria-selected="true"` 且其它行不为选中；随后点击第 9 行，`/a` 行成为选中。
- **ac-source-click-no-match**：点击不落在任何 `exact:true` 差异区间内的行（如注释行 / `same` 节点行）时，当前选中路径保持不变（不清空、不改选）。
- **ac-sync-ratio-wheel**：左侧 `scrollTop = 0.5 * (leftScrollHeight - leftClientHeight)` 后触发左侧 scroll，右侧 `scrollTop === 0.5 * (rightScrollHeight - rightClientHeight)`（±1px）；反向（右→左）同样成立，两侧滚动高度不同时按各自比例映射。
- **ac-sync-no-loop**：右侧被同步写入后，其回灌的 scroll 事件（`scrollTop` 未变）不改变左侧 `scrollTop`；交替触发左右 scroll 各 3 次后两侧值收敛稳定（不递增、不振荡）。
- **ac-sync-keyboard**：面板可聚焦（`tabIndex=0`）；聚焦左侧后 ArrowDown / ArrowUp 使其 `scrollTop` 变化恰好一个原文行高，PageDown / PageUp 变化恰好一个 `clientHeight`，Home 归 0、End 到最大滚动量，且每次右侧按比例跟随（±1px）。
- **ac-jump-no-echo**：程序化跳转后，左右 `scrollTop` 分别是各自目标行的行高偏移（不是按比例镜像），且跳转期间产生的 scroll 事件不会把任一侧改写成另一侧的偏移。
- **ac-filter-keeps-selection**：选中 `/a/b` 后切换到不含该条目的状态过滤：列表不渲染该行，但两侧高亮与 `scrollTop` 不变；切回「全部」后该行重新 `aria-selected="true"`。
- **ac-tab-keeps-state**：在 Workbench 中打开结构化会话，选中某行并把两侧滚到非零偏移，切到另一会话再切回：过滤值、选中路径、左右 `scrollTop`（±1px）全部恢复；两个结构化会话（若同时存在）互不串味。
- **ac-selection-reset-on-source**：切换格式或打开新文件后，选中路径清空（无 `aria-selected` 行、无高亮），两侧 `scrollTop` 归 0。
- **ac-window-source**：原文行数 ≤1000 时渲染全部行（既有小样本断言不变）；>1000 时 DOM 中 `data-source-row` 元素数 ≤ `ceil(clientHeight / 行高) + 2 * 10`，且与总行数无关。
- **ac-window-changes**：过滤后可见变更行 ≤1000 时全部渲染；>1000 时 DOM 中 `data-change-row` 元素数 ≤ `ceil(clientHeight / 行高) + 2 * 10`，且窗口起点随 `scrollTop` 前移（`data-change-window-start` 变化）。
- **ac-scale-5mb**：确定性生成两份 `Buffer.byteLength >= 5 * 1024 * 1024`、≥8 层嵌套、含 added / removed / modified / typeChanged 的 JSON 文件，经后台对比落地后：两侧原文行数 > 1000 且 `data-source-row` 数量仍满足 ac-window-source 上界；点击一条已知变更行后两侧 `scrollTop === min((line - 1) * 行高, maxScroll)`（±1px）；无异常、无未处理 rejection；该用例超时上限 60s。
- **ac-i18n**：「此侧不存在」等新增文案 zh / en 双语齐全；en 渲染下不出现中文，zh 渲染下不出现英文兜底键名；既有 i18n 扫描测试通过。
- **ac-existing-green**：`src/renderer/src/views/StructuredView.test.tsx`、`StructuredView.async.test.tsx`、`src/core/structured/diff.test.ts`、`locate.test.ts` 断言不减少不弱化（只允许为适配异步/窗口化改为等待或更精确的查询）；`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm build:web` 全绿，不新增 gate id。

## 非目标

- **不改语义引擎与异步契约**：不改 `src/core/structured/diff.ts` / `parse.ts` / `locate.ts` 的既有签名、五态口径、计数与 `SourceRange` 形状；不改 `StructuredCompareOutcome` / `ranges` 键口径（`ranges` 仍只含非 `same` 条目），不动 `src/renderer/src/structured/`（`compareClient` / `compareJob` / `compareWorker`）。
- **不做行内字符级高亮**（只整行 / 节点区间着色）；不做水平滚动同步；不做原文编辑、写回、保存。
- **不做 per-session 对比结果缓存 / worker 池 / 并行对比**：切 tab 回来仍会重新对比，本域只保证选中与滚动位置恢复。
- **不新增第一类打开入口**、不改主进程 IPC / 扫描 / 哈希、不动扩展名白名单与 `.munk/code-gates.json`（结构化语义门属 `structured` 域的兄弟子项）。
- **不新增视觉 token / 色板 / 组件库**；不做移动端与窄屏适配；不做 CRLF/LF、编码归一化、BOM（I#9 挂账）；不做 YAML 多文档 / merge key / alias。
- **不新建第二套虚拟化体系**：原文面板与变更列表一律复用 `DiffPane` 的 `WINDOW_THRESHOLD` / `ROW_OVERSCAN` / `useVirtualizer` / `scrollTop` 回灌范式。
- 不开浏览器、真机、桌面点选工单（L3 另验）；不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- **受控视图**：`StructuredView` 的 `filter` / `selectedPath` / `scrollTops` 为受控 props + 回调；`Workbench` 按 `session.id` 持有 `{ filter, selectedPath }` 与 `{ left, right }` 两段状态（`patchStructuredState` / `rememberStructuredScroll` + `EMPTY_STRUCTURED_STATE` / `EMPTY_STRUCTURED_SCROLL`），关闭会话 `withoutKey` 清除；无 props 时视图回退自身本地 state（测试与独立渲染可用）。
- **反选纯函数**：`src/core/structured/locateLine.ts` 导出 `findChangeAtLine(entries, ranges, side, line)`，只认该侧 `exact:true`，按 JSON Pointer 段数取最深命中，无命中返回 `null`；Node 可直接 import，零 DOM / React / Electron 依赖。视图不得自造第二套匹配逻辑。
- **窗口化复用**：`src/renderer/src/views/StructuredPanes.tsx` 提供原文面板与变更列表，复用 `DIFF_ROW_HEIGHT`、`useVirtualizer`、`WINDOW_THRESHOLD = 1000`、`ROW_OVERSCAN = 10`、`scrollTop` 回灌范式；变更列表行高为自有固定常量 `CHANGE_ROW_HEIGHT = 24`。
- **滚动同步规则**：垂直方向按 `scrollTop / (scrollHeight - clientHeight)` 比例映射；`programmatic` / `synced` 两个 ref 分别记录程序化写入值与最后同步写入值，其回灌事件在 ±1px 内直接忽略；程序化跳转同时写两侧各自目标偏移并抑制该次回灌；不引入 rAF 轮询。
- **断言钩子**：`data-change-row`、`data-source-row`、`data-source-window-start`、`data-change-window-start`、`data-highlight-status`、`data-missing-marker`、`aria-selected`；选中行与高亮颜色只用既有 token（`structuredStatus.ts` 的映射）。
- **i18n**：新增文案进 `src/renderer/src/i18n/messages/{zh,en}/files.ts`，不硬编码中文。
- **测试落位**：反选 `src/core/structured/locateLine.test.ts`（6 例）；跳转 / 高亮 / 反选 / 同步 / 过滤与重挂载保位 / 窗口化 / 缺失侧文案放 `src/renderer/src/views/StructuredView.locate.test.tsx`；5 MB 放 `src/renderer/src/views/StructuredView.scale.test.tsx`（超时 ≤60s，测试内确定性生成到 `os.tmpdir()` 后读回，不提交 MB 级 fixture）；切 tab 保位放 `src/renderer/src/workbench/structuredSessionState.dom.test.tsx`。
- **jsdom 无布局**：沿用 `DiffPane.test.tsx` 的 `clientHeight` / `clientWidth` stub 范式（可按 data 属性给不同元素不同 `scrollHeight`），不得因缺布局跳过窗口化或同步断言。

## 最近交付证明

- WI：`wi_ws_0f54557742f9593c`（差异定位与同步滚动界面）
- 日期：2026-10-31
- 结果：code_gates passed（10 gates 矩阵，attempt 001，`needSelfTest: false`；`pnpm test` 89 files / 1331 passed + 1 skipped）
- 覆盖摘要：新增纯函数 `src/core/structured/locateLine.ts` + `locateLine.test.ts`（6 例：最深命中、区间端点、`exact:false` 忽略且对侧接受、两侧独立、与条目顺序无关、空 / 越界返回 `null`）；新增 `src/renderer/src/views/StructuredPanes.tsx`（原文面板 + 变更列表，复用 `DiffPane` 导出的 `WINDOW_THRESHOLD` / `ROW_OVERSCAN` 与 `useVirtualizer`，行高 20 / 24px）与 `structuredStatus.ts`（行高常量 + 状态文案/色调/高亮类映射）；`StructuredView.tsx` 改为受控导航状态并接上跳转、反选、缺失侧标记、比例同步滚动（`programmatic` / `synced` 双 ref 防回环）、键盘滚动、`resetToken` 重置；`Workbench.tsx` 新增 `structuredStates` / `structuredScroll` 按 `session.id` 保位并在关闭会话时 `withoutKey` 清除；`DiffPane.tsx` 只把 `ROW_OVERSCAN` / `WINDOW_THRESHOLD` 改为导出；i18n 新增 `files.structured.changeList` / `files.structured.missingSide` 中英双语。测试：`StructuredView.locate.test.tsx`（跳转 / Enter+Space / 缺失侧 / 标记反选 / 原文反选 / 祖先回退不反选 / 四态高亮 token / 比例同步 / 无回环 / 跳转无回显 / 键盘滚动 / 过滤保位 / 换源重置 / 窗口化两条 / 缺失侧中英文）、`StructuredView.scale.test.tsx`（≥5 MB 单例，实测 1141 ms）、`structuredSessionState.dom.test.tsx`（切 tab 恢复且不串味）。语义引擎与 `src/renderer/src/structured/` 零改动。
- 注：本 WI change pack 仅含 `prd.md`（无 `tests/cases/**`），故无 change-pack 用例可 copy；20 条 AC **定义**已折入上方「验收」，执行记录落档 `qa/structured-locate-sync-contract.md`。亦未提供 `tech.md` / `ux/**`，tech/ux 手合跳过。
- 后续注意：① 同步滚动是「比例映射」而非行对齐，两侧行数差异大时视觉上不保证同行对应——这是既定口径，别按行号改；② `programmatic` / `synced` 的 ±1px 容差是防回环的关键，jsdom 下放大 stub 高度时仍要保留该容差；③ 切 tab 仍会重新对比（无结果缓存），保位只覆盖 filter / 选中 / 左右 scrollTop，别把对比结果也塞进 shell state。
