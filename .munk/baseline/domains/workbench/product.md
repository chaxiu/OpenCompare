# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效时长；页面与组件只引用 token。基础组件（工具栏按钮/下拉、会话标签、面板容器、可拖拽分割窗格、空/加载/错误态、状态栏条目、树/列表行、等宽代码块与表格排版）与等宽字体栈。
- **多会话工作台壳层（主屏）**：顶部工具栏（应用标识、视图/会话切换、常驻 Load Sample Fixtures 入口）、中央可拖拽双栏/三栏分割工作区（三向合并为三栏）、底部状态栏（当前会话标识 + 统计计数位）；会话模型「一个样本 = 一个会话」支持多会话并存/切换，无会话时展示空态引导；空态/加载态/错误态三种状态可见。会话模型带会话级 `dirty` 标记：由活动文件视图经 `onDirtyChange` 上报、`Workbench` 镜像进 `WorkbenchSession`，关闭提示据此判定；文件视图的可编辑工作副本（`CodeFileBuffer`）也保存在会话上，标签切换卸载视图后仍可原样重建。
- **会话标签生命周期**：每个标签可点击切换（工作区、状态栏会话标识与统计随活动会话更新，顺序不变），并有独立关闭按钮（可访问名称「关闭 <会话标题>」，不触发切换）。无未保存修改直接关闭；`dirty` 会话先经 `Dialog` 确认（含会话标题与「未保存修改」语义，动作为「继续编辑」/「放弃修改并关闭」）。关闭活动会话优先后继、无后继取前一个；关闭最后一个会话回到空首屏并可继续打开新会话。标签上以可见圆点 + 可读文本标记 dirty，保存/重置后消失。关闭会话时同步清理该会话的目录状态 / 滚动 / 合并计数 / CSV 对齐缓存。
- **样本加载按会话合并**：已有会话时「Load Sample Fixtures」按会话 id upsert/合并（真实会话、顺序与活动会话保持不变），不再整表替换；样本加载失败且有会话时保留现有会话并报错，无会话时仍走既有错误态 + 重试。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron/DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱目录树 B；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV 左右样本；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML 左右样本；经 `PlatformPort` 在 Web 内存模式可读，提供「加载样本 → 生成会话」入口。
- **冷启动真实对比入口（主屏空态）**：无会话时首屏两个主 CTA「打开文件」「打开文件夹」，均经 `PlatformPort.selectFile` / `selectDirectory` 走系统选择器；选定左右两侧即建立并进入对比会话（文件对按 `fileKinds.classifyFile` 进 code / csv / structured；目录对走既有目录会话模型），全程不依赖样本。
- **真实路径拖入窗口**：空首屏与有会话时均可拖入真实路径——恰好 2 个同类路径（两文件 / 两目录）直接建同一会话模型；1 个路径作为左侧基准填入 + info 提示；>2 个或文件目录混合则明确提示、不建会话、不改既有会话。拖入阻断浏览器/窗口默认导航，应用停留原状态；真实绝对路径解析经平台缝（preload / `webUtils.getPathForFile` 或 main IPC 白名单），renderer 不猜测路径。
- **样本入口降级为演示辅助**：样本按钮 / 下拉保留但显式标注演示用途，文案不再暗示「必须先加载样本」，可被完全跳过。
- **索引与路由**：`ux/design-baseline.md`（token 路径、组件清单、主屏路径、取舍）折入 `.munk/baseline/design/*`；`AGENTS.md` 增视觉基线路由。

## 验收

- **ac-shell**：桌面窗口（`pnpm dev`）与 `pnpm dev:web` 均能拉起完整工作台壳层——顶部工具栏 + 中央分割工作区 + 底部状态栏。
- **ac-tokens**：壳层与全部基础组件统一引用同一套 token（含差异语义色），组件内无硬编码颜色；字号 / 间距 / 圆角同源。
- **ac-three-states**：主屏空态、加载态、错误态三种状态都能看到（空态以真实对比为主叙事并提供打开入口；错误态文案可读并可重试）。
- **ac-load-fixtures**：点击顶栏「Load Sample Fixtures」可一键加载预置样本，工作台随即出现对应场景会话。
- **ac-session-switch**：多会话 / 多视图可切换，切换后工作区内容与底部状态栏统计随当前会话更新。
- **ac-four-scenes**：四大场景样本齐备且加载后可见：嵌套 + 散乱目录树、代码 Diff 与多冲突块 3-way（base/ours/theirs）、1200+ 行乱序主键 CSV 左右样本、乱序深层 JSON/YAML 左右样本。
- **ac-split-pane**：双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并场景呈现三栏。
- **ac-fixtures-tests**：`src/shared/fixtures/` 有 vitest 用例校验场景完整性（CSV ≥1200 行、3-way 冲突块 ≥2、目录树层级 ≥3 层、JSON/YAML 深层变更存在），`pnpm test` 绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。
- **ac-cold-start-primary-cta**：冷启动无会话首屏的两个主 CTA 是「打开文件」「打开文件夹」，且不存在以加载样本为主入口的空态叙事。
- **ac-open-two-files**：空首屏经系统选择器依次选择两个真实文件后，直接建立并进入文件对比会话（按类型为代码 / CSV / JSON-YAML 之一），未加载任何样本。
- **ac-open-two-dirs**：空首屏经系统选择器依次选择两个真实目录后，建立目录对比会话，会话 subtitle 展示这两个真实路径，内容来自真实文件系统而非样本路径。
- **ac-picker-cancel**：在任一选择器取消后不建会话、不改变既有会话与视图。
- **ac-drop-two-paths**：把两个真实同类路径（两个文件或两个目录）拖入窗口，落成与选择器打开同一会话模型并进入对比视图。
- **ac-drop-single-path**：拖入单个真实路径时该路径被作为左侧基准填入并提示选择右侧对应项，现有会话不受影响。
- **ac-drop-invalid**：拖入超过两个路径、或文件与目录混合时给出明确提示，不新建会话且不改变现有会话状态。
- **ac-drop-no-navigate**：拖入路径不会导致窗口导航 / 重载，应用仍停留在当前会话。
- **ac-sessions-not-overwritten**：连续打开不同文件对（或目录对）会新增独立会话标签，不覆盖先前会话。
- **ac-samples-auxiliary**：样本入口仍显式标注为演示用途且可用；不点样本不影响真实打开 / 拖拽路径。
- **ac-gates**：`pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动的空态断言更新）。
- **ac-tabs-switch**：点击任一标签后该会话变为活动会话，工作区渲染其内容、状态栏「会话」值随之更新，标签列表与顺序不变。
- **ac-tab-close-clean**：关闭无未保存修改的会话时立即移除该标签、不弹确认；若关闭的是非活动会话，当前活动会话及其工作区内容不变。
- **ac-close-active-neighbor**：关闭当前活动会话且仍有其他会话时，自动激活其相邻会话（优先后继，无后继取前一个），工作区立即显示该会话内容，不出现空白工作区。
- **ac-close-last-empty**：关闭最后一个会话后回到空首屏（「打开文件」「打开文件夹」可见、标签栏不渲染），且随后可正常打开新会话，全程无刷新 / 重启。
- **ac-close-dirty-prompt**：关闭 `dirty` 为 true 的会话时先出现确认提示，提示含该会话标题与「未保存修改」语义，并提供「继续编辑」「放弃修改并关闭」两个动作；此时会话尚未被移除。
- **ac-close-dirty-cancel**：在未保存提示中点「继续编辑」，会话保留、其未保存内容与「已修改（未保存）」呈现保留、标签未保存标记仍在，且不出现错误提示。
- **ac-close-dirty-discard**：在未保存提示中点「放弃修改并关闭」，该会话从标签栏移除；若它是活动会话，按 ac-close-active-neighbor 规则激活相邻会话。
- **ac-dirty-marker-on-tab**：存在未保存修改的会话标签上有可读的未保存标记（`title` 或等价可访问文本）；保存或重置清除 dirty 后该标记消失。
- **ac-switch-keeps-edits**：在会话 A 覆写差异块产生未保存修改后切到 B 再切回 A，A 的修改后工作文本与「已修改（未保存）」标记仍在，标签未保存标记与之一致；随后关闭 A 会触发未保存提示。
- **ac-no-stale-dirty**：已保存或已重置的会话（dirty 为 false）关闭时直接关闭、不弹提示，标签也不再显示未保存标记。
- **ac-samples-load-keeps-sessions**：已有真实会话时加载演示样本，真实会话标签仍在且顺序不变（活动会话不被切走），样本会话按 id 合并且不产生重复标签；样本加载失败且有会话时保留现有会话并给出错误提示。
- **ac-close-parent-no-deadend**：关闭目录下钻文件会话的来源目录会话后，该文件会话仍正常显示；点「返回上级目录视图」时有可用目录会话则切换过去，否则给出明确提示，均不出现空白视图或需刷新。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域。各视图只读呈现样本原始内容，不做差异高亮与统计；状态栏计数与目录树标签来自样本自带 answer key（编辑期标注），非运行时计算。
- **不做各视图内的对比 / 合并 / 保存业务**：合并结果保存、原位写回、快照导出属 `code-diff-merge` / `snapshot` 域；本域只提供会话模型 `dirty` 字段与壳层编排（`Workbench.handleExportSnapshot` 负责调 `PlatformPort.saveFile` 与提示）。
- **不做 Electron 侧把样本落盘真实临时目录**（后续文件对比项自行决定取数方式）。
- 不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键绑定与命令面板（分栏拖拽本身在范围内）。
- 不做浅色主题成品与主题切换 UI（token 按可换主题组织即可，不交 light 皮肤）。
- 不做组件大全、不做 HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。
- 真实入口不做「最近打开 / 历史记录 / 收藏夹 / 书签」；不做 OS 级集成（Finder「打开方式」、命令行路径参数、macOS `open-file` 事件、拖到 Dock）；不做单侧智能配对（同名文件 / 同父兄弟 / 路径记忆）——单路径拖入只做左栏填充 + 提示；不做多选批量选择（一律左右各一次）。
- 会话标签只做切换 / 关闭 / 未保存提示：不做「保存并关闭」第三分支与关闭前自动保存；不做批量关闭（关闭全部 / 关闭其他）、标签拖拽重排、右键菜单、溢出「更多」菜单；不做 `Cmd+W` 等快捷键、会话恢复 / 崩溃恢复 / 最近打开 / 会话持久化。目录下钻、返回上级目录视图与往返状态保持已由 directory 域交付（会话模型仅新增 `parentDirectoryId` 来源标识），本域只消费它来避免关闭来源目录后出现断头；原位保存与导出已由 code-diff-merge / snapshot 域交付。
- 不删改内置样本、不重构 `loadSampleSessions` 既有加载路径；不新增对比能力品类、不改目录对比 / Diff / CSV / 结构化算法内核。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案；token 用 Tailwind v4 `@theme` 定义在 renderer 内唯一 CSS 来源。
- 视觉方向已定：现代暗黑工业风 + 紧凑高信息密度；差异语义色（相同/新增/删除/修改/冲突）必须在 token 层命名并在后续所有视图统一引用。
- 分层硬约束：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API；`PlatformPort` 现有契约语义不破坏（可扩展）。
- 等宽字体使用系统字体栈，不引入需网络的 web font。
- 视觉索引只写 change pack `ux/design-baseline.md`，不自己改 `.munk/baseline/**`。

## 最近交付证明

- WI：`wi_ws_bad11a8fa3a6a251`（多会话标签切换 / 关闭与未保存提示，`kind: feature`）
- 日期：2026-10-20
- 结果：self_test skipped（本项 UI 自测改由 code_gates 关点）。
- 覆盖摘要：`SessionTabs` 新增 `onClose` 与 `dirty` 入参（关闭按钮独立 `IconButton`，`aria-label="关闭 <标题>"`，不触发标签切换；dirty 用 `bg-diff-modified` 圆点 + `sr-only`「有未保存修改」）；`Workbench` 新增 `requestCloseSession` / `closeSession`（dirty 先落 `closeTarget` 走 `Dialog`「继续编辑」/「放弃修改并关闭」；活动会话落点 `remaining[index] ?? remaining[index-1]`，最后一个置 `activeId=null` + `status='empty'`；按会话 id 清理 `directoryStates` / `directoryScroll` / `codeMerge` / `csvAlign`）；`codeMerge` 由单值改为按会话 id 的 Record，状态栏冲突数只读活动会话。切换不丢修改：`FilePair` 会话新增 `codeBuffer`（`CodeFileBuffer` 保存 left/right 的 source 与 working text），`CodeView` 以 buffer 初始化并在每次编辑时经 `onBufferChange` 上报，切回原样重建。`load()` 从整表替换改为按 id upsert/合并，失败且有会话时保留会话并 `report`。`backToDirectory` 在来源目录已关闭时经 `resolveDirectoryReturn` 找可用目录或给明确提示。`App.test.tsx` 新增 8 条 session tabs lifecycle 用例（切换保修改、干净关闭、相邻落点与清空、dirty 提示与取消、后台 dirty 丢弃、重置后不再提示、样本合并、父目录关闭后下钻存活）；`pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿。
- 注：本 WI change pack 未提供 `tech.md` / `ux/**` / `tests/cases/**`，tech/ux 折叠跳过；QA 用例由本轮按 PRD 验收项补入 `domains/workbench/qa/`。
