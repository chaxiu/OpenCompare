# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效时长；页面与组件只引用 token。基础组件（工具栏按钮/下拉、会话标签、面板容器、可拖拽分割窗格、空/加载/错误态、状态栏条目、树/列表行、等宽代码块与表格排版）与等宽字体栈。
- **多会话工作台壳层（主屏）**：顶部工具栏（应用标识、视图/会话切换、常驻 Load Sample Fixtures 入口）、中央可拖拽双栏/三栏分割工作区（三向合并为三栏）、底部状态栏（当前会话标识 + 统计计数位）；会话模型「一个样本 = 一个会话」支持多会话并存/切换，无会话时展示空态引导；空态/加载态/错误态三种状态可见。会话模型带会话级 `dirty` 标记：由活动文件视图经 `onDirtyChange` 上报、`Workbench` 镜像进 `WorkbenchSession`，关闭提示据此判定；文件视图的可编辑工作副本（`CodeFileBuffer`）也保存在会话上，标签切换卸载视图后仍可原样重建。
- **会话标签生命周期**：每个标签可点击切换（工作区、状态栏会话标识与统计随活动会话更新，顺序不变），并有独立关闭按钮（可访问名称「关闭 <会话标题>」，不触发切换）。无未保存修改直接关闭；`dirty` 会话先经 `Dialog` 确认（含会话标题与「未保存修改」语义，动作为「继续编辑」/「放弃修改并关闭」）。关闭活动会话优先后继、无后继取前一个；关闭最后一个会话回到空首屏并可继续打开新会话。标签上以可见圆点 + 可读文本标记 dirty，保存/重置后消失。关闭会话时同步清理该会话的目录状态 / 滚动 / 合并计数 / CSV 对齐缓存。
- **样本加载按会话合并**：已有会话时「Load Sample Fixtures」按会话 id upsert/合并（真实会话、顺序与活动会话保持不变），不再整表替换；样本加载失败且有会话时保留现有会话并报错，无会话时仍走既有错误态 + 重试。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron/DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱目录树 B；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV 左右样本；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML 左右样本；经 `PlatformPort` 在 Web 内存模式可读，提供「加载样本 → 生成会话」入口。
- **冷启动真实对比入口（主屏空态）**：无会话时首屏主操作区以「新建对比」为主按钮，并同时保留「打开文件」「打开文件夹」两个既有 CTA；后两者经 `PlatformPort.selectFile` / `selectDirectory` 走系统选择器，选定左右两侧即建立并进入对比会话（文件对按 `fileKinds.classifyFile` 进 code / csv / structured；目录对走既有目录会话模型），全程不依赖样本。
- **顶栏常驻「新建对比」与手工路径直传**：`Workbench` 顶栏在空态与已有会话时都渲染可点击的「新建对比」（仅 `directoryBusy` 期间 disabled），不因已有会话消失，也不替换 / 隐藏既有「打开文件」「打开文件夹」。点击或按 `Cmd/Ctrl+N`（非 macOS 为 `Ctrl+N`；对话框已打开时不重复叠层）打开 `role="dialog"` 的「新建对比」对话框：左右两个路径输入框（可直接键入或粘贴）+「打开文件」「打开文件夹」两个选择器动作 +「建立对比」；`Enter` 提交、`Esc` 关闭、焦点初始落在左侧输入框，输入框内 `Cmd/Ctrl+A` 等编辑快捷键不被拦截；提交进行中按钮 disabled 且重复 `Enter` 不发起第二个请求。提交时唯一校验入口是 `@shared/compareRequest` 的 `parseManualPaths` + `resolveCompareRequest`（`homeDir` / `baseDir` 由 `PlatformPort.homeDirectory()` / `workingDirectory()` 显式提供，probe 走 `statPath`），通过后只按 `kind` 路由到既有 `openFilePair` / `runSidesCompare(directorySides(left, right))`，不另造解析、校验或会话模型；成功则关闭对话框并按既有 `upsertSession` 语义新增或复用（同路径对不产生第二个 tab）一个会话。任何失败（校验 / 探测 / 会话构建）只在对话框内以一行 `role="alert"` 展示中文原因、对话框保持打开，`sessions` / `activeId` / `status` / 状态栏与当前视图都不变，绝不新建空白 tab。对话框内的「打开文件 / 打开文件夹」复用同一套选择器流程与失败就地提示。
- **启动注入请求落地**：`Workbench` 挂载时经 `PlatformPort.onCompareRequest`（可选成员）订阅一次、卸载时退订，并在订阅注册之后调用 `compareRequestsReady()` 通知主进程投递队列；成功 payload（`kind: file` / `directory`）直接走既有 `openCompareRequest` 建会话 / 切到该会话，失败 payload 只走既有 notice，`sessions` / `activeId` / `status` 不变、不建空 tab；端口没有这两项能力时等价于「无注入」且不报错。该链路的 AC 定义归 `launch` 域，本域只承载「注入请求复用既有会话入口」这一层。
- **回归保留**：新建对比链路不介入既有路径——拖拽双路径仍按 `handleDroppedFiles` 建会话，标签切换仍保留工作副本与脏标记，目录下钻与「返回上级目录视图」的过滤 / 折叠 / 选中状态保持。
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
- **ac-new-compare-always-visible**：空态（`status === 'empty'`，无会话）与已有会话（会话数 > 0）两种状态下，顶栏都存在可点击的「新建对比」按钮；仅 `directoryBusy` 期间为 disabled。
- **ac-dialog-three-actions**：点击「新建对比」后出现 `role="dialog"` 且可访问名含「新建对比」的对话框，内含「左侧路径」「右侧路径」两个输入框与「打开文件」「打开文件夹」两个按钮；点击「打开文件」依次触发两次 `selectFile` 并落到既有 `openFilePair`，点击「打开文件夹」依次触发两次 `selectDirectory` 并落到既有 `runSidesCompare`。
- **ac-shortcut-open-close**：按下 `Cmd+N`（非 macOS 为 `Ctrl+N`）打开对话框且重复按下不叠层；对话框内按 `Esc` 关闭，`sessions` 数量与 `activeId` 不变；输入框内 `Cmd/Ctrl+A` 等编辑快捷键不被拦截。
- **ac-submit-enter**：在任一输入框内按 `Enter` 提交一次；提交进行中提交按钮 disabled，再次按 `Enter` 不发起第二个请求。
- **ac-manual-file-pair-session**：在 web 端口已写入 `/memory/左 a.txt` 与 `/memory/右 b.txt` 后，于对话框填入这两个路径并提交 → 对话框关闭，会话数 +1，新会话 `scene === 'code'` 且 `activeId` 指向它，会话 subtitle 同时包含这两个绝对路径。
- **ac-manual-directory-pair-session**：填入两个已存在的真实目录并提交 → 会话数 +1，新会话 `scene === 'directory'` 且为当前 active，渲染既有目录对比视图（含两侧目录名）。
- **ac-manual-quoted-whitespace**：输入 `"  /memory/左 a.txt  "` 这类带成对引号与首尾空白的值，提交后 `statPath` / `readTextFile` 收到的是去掉引号与空白的路径，会话 subtitle 不含引号。
- **ac-manual-tilde-relative**：平台提供 `homeDir=/Users/demo`、`baseDir=/memory` 时，`~/项目/a.txt` 与相对路径 `a.txt` 分别落到 `/Users/demo/项目/a.txt`、`/memory/a.txt` 并建成会话（与 `resolveCompareRequest` 的既有规范化语义一致）。
- **ac-no-native-dialog-on-submit**：手工输入提交全程 `selectFile`、`selectDirectory`、`saveFile` 的调用次数均为 0。
- **ac-adds-tab-keeps-existing**：先打开一个会话，再通过手工路径建立新会话 → tab 数 +1，旧会话仍在原顺序位置且 title / subtitle 不变，新会话为 active。
- **ac-error-not-found-inline**：右侧路径不存在时，对话框保持打开，`role="alert"` 文本含「右侧」与原始右侧路径；会话数不变，不新增 tab。
- **ac-error-empty-inline**：只填左侧、右侧留空时，提示含「右侧」与「路径为空」，且未对任一侧调用 `statPath`，会话数不变。
- **ac-error-type-mismatch-inline**：左侧文件、右侧目录时，提示同时含两侧路径且含「类型不一致」，会话数不变。
- **ac-error-unsupported-inline**：两侧为 `a.bin` / `b.bin` 时，提示含「不支持」并列出「代码/文本」「CSV/TSV」「JSON/YAML」，会话数不变。
- **ac-error-mixed-family-inline**：两侧同为文件但家族不同（如 `.json` ↔ `.yaml`）时，提示含「两侧文件类型不一致」，会话数不变、不产生空白 tab。
- **ac-failure-keeps-active-view**：已有会话在屏时提交失败，提交前后 `sessions` 长度、`activeId`、状态栏文本与当前视图内容一致。
- **ac-repeat-submit-single-tab**：同一对路径在提交完成后再次提交 → 该会话 id 仍只有一个 tab，`activeId` 不变（走既有 upsert 语义）。
- **ac-drag-drop-regression**：向窗口拖入两个同类真实路径仍按既有 `handleDroppedFiles` 建立会话（一文件一目录时提示且不建会话），不依赖新建对比对话框。
- **ac-drilldown-return-regression**：目录会话下钻文件得到文件会话后，点「返回上级目录视图」回到来源目录会话，过滤 / 折叠 / 选中状态保持。
- **ac-tab-switch-keeps-buffer**：由手工路径建立的两个代码会话来回切换后，未保存工作副本与脏标记均保留，切回时视图显示的是工作副本。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域。各视图只读呈现样本原始内容，不做差异高亮与统计；状态栏计数与目录树标签来自样本自带 answer key（编辑期标注），非运行时计算。
- **不做各视图内的对比 / 合并 / 保存业务**：合并结果保存、原位写回、快照导出属 `code-diff-merge` / `snapshot` 域；本域只提供会话模型 `dirty` 字段与壳层编排（`Workbench.handleExportSnapshot` 负责调 `PlatformPort.saveFile` 与提示）。
- **不做 Electron 侧把样本落盘真实临时目录**（后续文件对比项自行决定取数方式）。
- 不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键体系与命令面板（分栏拖拽本身在范围内）：只保留 `Cmd/Ctrl+N` 打开「新建对比」与对话框内 `Enter` 提交 / `Esc` 关闭；不做 `Cmd+W`、可配置键位、命令面板。
- 不做路径输入增强：无「最近打开」列表、路径补全、路径历史、书签、字段级内联校验样式或顶部 notice 改版；对话框错误只用一行 `role="alert"`，且只展示 `compareRequest` 已给出的中文原因，不另造错误码或文案。新建对比不引入路径沙箱/根目录白名单，也不做启动参数 / `opencompare://` 协议注入（属后续项，契约见 `compare-request` 域）。
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
- 「新建对比」只用既有 `components/Dialog`（新增 `initialFocusRef` 以把初始焦点放到左侧输入框）、`ToolbarButton` 与 `main.css` token，不写死颜色尺寸、不新增设计系统；`parseManualPaths` / `resolveCompareRequest` 是唯一校验入口，renderer 不另写解析、规范化或错误码，错误文案直接用 `error.message`。会话创建只复用 `openFilePair` / `runSidesCompare`，`upsertSession` / `activeId` 状态机不改。

## 最近交付证明

- WI：`wi_ws_1049cda9d94e3506`（renderer 侧接收启动注入请求并复用既有会话入口）
- 日期：2026-10-20
- 结果：code_gates passed（install / lint / typecheck / build / build:web / test 全绿；`needSelfTest=false`，跳过 UI 自测）。
- 覆盖摘要：
  - `Workbench.tsx`：新增一个挂载副作用——`platform.onCompareRequest?.(…)` 订阅（端口缺该能力即直接跳过，不报错），订阅后 `void platform.compareRequestsReady?.()`；handler 放进 `launchRequest` ref 并以空依赖副作用更新，避免因 `openCompareRequest` / `report` 变化重复订阅；成功 payload 调既有 `openCompareRequest(payload.request, (message) => report(message))`，失败只 `report(payload.message)`；cleanup 返回 unsubscribe。
  - `App.test.tsx`：新增 `describe('launch request injection')` 7 条——注入 file 请求建 `scene: 'code'` 会话且 `selectFile` / `selectDirectory` / `saveFile` 均 0 次；注入 directory 请求建 `scene: 'directory'` 会话并 active；注入与手工输入同一路径对得到同一会话 id（tab 仍 1 个）；失败 payload 出 notice 且 `sessions` / `activeId` 不变；StrictMode 下只保留一个有效订阅；卸载后注入不建会话且不抛错；ready 在订阅之后发出且挂载前到达的请求被补投。
- 注：单实例锁 / argv·`open-url` 收集 / 队列与窗口聚焦 / preload 白名单 / 打包协议声明的 AC 分别落在新域 `launch` 与 `release`；本域交付只覆盖 renderer 落地这一层，未改会话模型、`upsertSession`、手工入口与既有标签行为。本 WI change pack 未提供 `tests/cases/**` / `tech.md` / `ux/**`，无新增折叠用例、无 tech/ux 手合。
