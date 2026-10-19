# 目录对比下钻与逐级返回、往返状态保持

本项是「OpenCompare 生产级可用与合规发布」五步主链路的第 3 步：**真实目录对比里下钻到文件级对比后，能返回上级目录视图，且往返不丢目录树状态**。

现状证据（对照仓库）：

- 下钻已存在但不可逆：`DirectoryView` 双击文件行 → `Workbench.openFile` → `createDrilldownSession` + `upsertSession`，生成**独立文件会话标签**并激活；返回只能靠用户自己点回目录标签，没有「返回上级目录视图」导航。
- 状态在往返中丢失：`TreeView` 的展开态是每个 `TreeNode` 内部的 `useState(true)`，`DirectoryView` 一卸载即重置为全展开；面板滚动容器（`Panel` 的 `overflow-auto`）随挂载重建，滚动位置丢失；目录树**没有选中态**，选中无从保持；`directoryFilter` 是 shell 级单值（切标签时值本身不丢，但没有按目录会话归口）。
- 下钻身份未绑定来源：下钻会话 id 为 `file:${node.relativePath}`，未关联发起下钻的目录会话；两个不同目录对下钻同一相对路径会互相覆盖标签，返回时无法确定回哪个目录视图。

## 范围

1. **下钻保留并绑定来源目录会话**：双击目录树文件行下钻到文件级对比（代码/文本 · CSV/TSV · JSON/YAML）沿用既有会话模型；下钻会话必须记录其来源目录会话，且下钻会话身份不得与其他目录会话的同相对路径下钻互相覆盖。
2. **返回上级目录视图导航**：文件级对比视图提供明确的「返回上级目录视图」导航，触发后回到**发起本次下钻的那个目录对比会话**。本项「逐级返回」的落地含义：目录树已完整展示层级，下钻只到文件级（目录 → 文件一层），返回即一步回到父目录视图；不实现目录级下钻栈。
3. **往返可重复一致**：同一目录会话可反复「下钻 → 返回」多次，每次返回都落到同一目录视图，行为一致。
4. **目录视图状态保持（运行期内存内）**：往返（以及标签切换）后，目录视图保持：
   - 差异过滤值；
   - 目录树展开/折叠状态（不得被重置为全展开）；
   - 两侧面板滚动位置；
   - 目录树行的选中项及可见高亮。
   过滤/展开/滚动/选中按**目录会话**归口，即在不同目录会话之间切换时互不串味。
5. **选中态补齐**：目录树行支持单击选中（单选），选中行有可见的高亮样式，使用既有语义 token。
6. **来源不可用兜底**：来源目录会话已不可用时（如被关闭或替换），返回给出明确提示并落到可用的目录视图，不出现死路或崩溃。
7. **测试随动**：既有目录/树相关组件测试随实现更新；新增覆盖「展开/选中/滚动受控持久化」「返回落到来源目录会话」「往返后状态未丢」的组件测试（脚本化内存 PlatformPort）。`pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿。

## 验收

- ac-drilldown-opens-file-view: 真实目录对比中双击差异文件行仍下钻到对应文件级对比（代码/文本 · CSV/TSV · JSON/YAML），与既有下钻同一会话模型。
- ac-back-to-parent-directory: 下钻后的文件级视图有明确的「返回上级目录视图」导航，点击即回到发起本次下钻的目录对比会话。
- ac-roundtrip-repeatable: 同一目录会话连续「下钻 → 返回」多次，每次都落回同一目录视图且行为一致，无需刷新/重启。
- ac-filter-preserved: 往返后目录视图的差异过滤值与下钻前相同。
- ac-expand-preserved: 往返后目录树的展开/折叠状态与下钻前一致，未被重置为全展开。
- ac-scroll-preserved: 往返后两侧目录面板的滚动位置与下钻前一致。
- ac-selection-preserved: 目录树行可单击选中并有可见高亮；往返后选中项与高亮保持。
- ac-drilldown-isolation: 两个不同目录会话各自下钻同一相对路径时互不覆盖；各自「返回」都回到自己的来源目录会话。
- ac-parent-fallback: 来源目录会话不可用时返回给出明确提示并落到可用目录视图，不崩溃、不死路。
- ac-gates: `pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动与新测试）。

## 非目标

- **不做目录级下钻**（把某个子目录作为独立视图打开再逐级返回）——树已展示全部层级，下钻止于文件级；也不做「目录级下钻栈 / 前进-后退历史栈」。
- 不做面包屑路径条、浏览器式前进/后退历史、键盘导航、右键菜单、多选 / 区间选择。
- 不做会话关闭与未保存提示（`session-tabs-lifecycle` 子项）、不做原位保存与结果导出（`save-in-place-and-export` 子项）。
- 不做状态跨应用重启/跨窗口持久化（仅当前运行期内存内保持）。
- 不改目录对比 / 过滤 / 文件类型分类 / Diff / CSV / 结构化算法内核，不新增对比能力品类。
- 不新增页面或设计系统概念，不改视觉 token 与组件库；样本入口、拖拽与打开逻辑保持上一步交付现状。
- 不为「状态保持」新造全局状态框架（如引入状态管理库或持久化层）。

## 实现约束

- 复用既有结构：`workbench/session.ts` 会话模型、`workbench/directoryCompare.ts` 下钻会话构建、`views/DirectoryView.tsx`、`components/TreeView.tsx`、`ToolbarButton` / `Panel` / `SplitPane`；不新建页面，不新造导航概念。
- 目录树展开/滚动/选中**不得依赖组件本地挂载生命周期**（现有 `TreeNode` 的 `useState(true)` 一卸载即丢）；需提升为按目录会话 id 归口的受控状态，在 `Workbench` 层随会话保留并在返回时回填。
- 下钻会话携带来源目录会话标识（用于返回落点与同路径下钻隔离）。renderer 不得直连 Electron API；web 内存 PlatformPort 仍须可用，不得写 `platform.kind === 'electron'` 才能工作的新分支。
- 选中高亮与返回入口只引用 `main.css` 语义 token（含 `--color-diff-*`、surface / accent 等）与既有 `focus-ring` / `transition-fast` utility，不写死颜色/尺寸。
- 过滤按目录会话归口后，状态栏 `CompositionLegend` 与 `DirectoryView` 的可见计数口径不变（仍反映当前会话当前过滤）。
- 提示文案沿用现有 `report(message, tone)` + 状态栏风格，不新造提示体系。
- 单测按 `.agents/skills/vitest/SKILL.md`；React 组件按 `.agents/skills/vercel-react-best-practices/SKILL.md`；样式类名遵循 `.agents/skills/tailwind-4-docs/SKILL.md`。
- 真实窗口自测口径（`needSelfTest=true`，对齐 overview 第 6 节第 2 步）：Electron（`pnpm dev`）打开两个真实目录 → 设过滤/展开（并滚动、选中）→ 双击差异项下钻文件级对比 → 点击返回上级目录视图 → 核对过滤/展开/滚动/选中未丢 → 再下钻再返回多次一致。前序结论已证明 web 通道无法投递/选择真实目录（`selectDirectory` 恒返回 `/memory`），故真实目录往返只能在 Electron 桌面窗口复核，web 自测不足以关点。
