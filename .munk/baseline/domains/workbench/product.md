# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效时长；页面与组件只引用 token。基础组件（工具栏按钮/下拉、会话标签、面板容器、可拖拽分割窗格、空/加载/错误态、状态栏条目、树/列表行、等宽代码块与表格排版）与等宽字体栈。
- **多会话工作台壳层（主屏）**：顶部工具栏（应用标识、视图/会话切换、常驻 Load Sample Fixtures 入口）、中央可拖拽双栏/三栏分割工作区（三向合并为三栏）、底部状态栏（当前会话标识 + 统计计数位）；会话模型「一个样本 = 一个会话」支持多会话并存/切换，无会话时展示空态引导；空态/加载态/错误态三种状态可见。会话模型带会话级 `dirty` 标记：由活动文件视图经 `onDirtyChange` 上报、`Workbench` 镜像进 `WorkbenchSession`，关闭提示据此判定；文件视图的可编辑工作副本（`CodeFileBuffer`）也保存在会话上，标签切换卸载视图后仍可原样重建。
- **会话标签生命周期**：每个标签可点击切换（工作区、状态栏会话标识与统计随活动会话更新，顺序不变），并有独立关闭按钮（可访问名称「关闭 <会话标题>」，不触发切换）。无未保存修改直接关闭；`dirty` 会话先经 `Dialog` 确认（含会话标题与「未保存修改」语义，动作为「继续编辑」/「放弃修改并关闭」）。关闭活动会话优先后继、无后继取前一个；关闭最后一个会话回到空首屏并可继续打开新会话。标签上以可见圆点 + 可读文本标记 dirty，保存/重置后消失。关闭会话时同步清理该会话的目录状态 / 滚动 / 合并计数 / CSV 对齐缓存。
- **样本加载按会话合并**：已有会话时「Load Sample Fixtures」按会话 id upsert/合并（真实会话、顺序与活动会话保持不变），不再整表替换；样本加载失败且有会话时保留现有会话并报错，无会话时仍走既有错误态 + 重试。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron/DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱目录树 B；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV 左右样本；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML 左右样本；经 `PlatformPort` 在 Web 内存模式可读，提供「加载样本 → 生成会话」入口。
- **冷启动真实对比入口（主屏空态）**：无会话时首屏主操作区以「新建对比」为主按钮，并同时保留「打开文件」「打开文件夹」两个既有 CTA；后两者经 `PlatformPort.selectFile` / `selectDirectory` 走系统选择器，选定左右两侧即建立并进入对比会话（文件对按 `fileKinds.classifyFile` 进 code / csv / structured；目录对走既有目录会话模型），全程不依赖样本。
- **顶栏常驻「新建对比」与手工路径直传**：`Workbench` 顶栏在空态与已有会话时都渲染可点击的「新建对比」（仅 `directoryBusy` 期间 disabled），不因已有会话消失，也不替换 / 隐藏既有「打开文件」「打开文件夹」。点击或按 `Cmd/Ctrl+N`（非 macOS 为 `Ctrl+N`；对话框已打开时不重复叠层）打开 `role="dialog"` 的「新建对比」对话框：左右两个路径输入框（可直接键入或粘贴）+「打开文件」「打开文件夹」两个选择器动作 +「建立对比」；`Enter` 提交、`Esc` 关闭、焦点初始落在左侧输入框，输入框内 `Cmd/Ctrl+A` 等编辑快捷键不被拦截；提交进行中按钮 disabled 且重复 `Enter` 不发起第二个请求。提交时唯一校验入口是 `@shared/compareRequest` 的 `parseManualPaths` + `resolveCompareRequest`（`homeDir` / `baseDir` 由 `PlatformPort.homeDirectory()` / `workingDirectory()` 显式提供，probe 走 `statPath`），通过后只按 `kind` 路由到既有 `openFilePair` / `runSidesCompare(directorySides(left, right))`，不另造解析、校验或会话模型；成功则按既有 `upsertSession` 语义新增或复用（同路径对不产生第二个 tab）一个会话。**关闭时机**：文件对成功后关闭对话框；目录对在路径校验 / 探测通过、真正进入扫描前即清掉对话框（`runSidesCompare` 入口一处状态调用，同时覆盖键入与弹窗内选择器两条发起路径），使壳层进度条与「取消」在整个扫描期不再被模态遮罩压住——扫描期间页面上不存在任何 `aria-modal` 元素；弹窗内「打开文件夹」的用户在系统选择器取消（返回 `null`）时弹窗仍保持打开、不建会话、不进入扫描。对话框关闭后由 `openRequest` 回调上报的**构建期**错误（非路径类，如读取失败）允许落到工作台 notice，不为此重新打开弹窗。**路径类失败**（校验 / 探测）仍只在对话框内以一行 `role="alert"` 展示中文原因、对话框保持打开，`sessions` / `activeId` / `status` / 状态栏与当前视图都不变，绝不新建空白 tab。对话框内的「打开文件 / 打开文件夹」复用同一套选择器流程与失败就地提示。
- **启动注入请求落地**：`Workbench` 挂载时经 `PlatformPort.onCompareRequest`（可选成员）订阅一次、卸载时退订，并在订阅注册之后调用 `compareRequestsReady()` 通知主进程投递队列；成功 payload（`kind: file` / `directory`）直接走既有 `openCompareRequest` 建会话 / 切到该会话，失败 payload 只走既有 notice，`sessions` / `activeId` / `status` 不变、不建空 tab；端口没有这两项能力时等价于「无注入」且不报错。该链路的 AC 定义归 `launch` 域，本域只承载「注入请求复用既有会话入口」这一层。
- **对比跳过提示（容错契约归 `io-tolerance` 域，本域承载渲染）**：目录对比成功且 `leftSkipped + rightSkipped > 0` 时，工作台复用既有 `notice`（单行 `role="alert"`）通道、`noticeTone: 'info'`（`text-diff-added`，非 `text-danger`）显示「已跳过：左 X / 右 Y」；目录视图在过滤栏下方同步展示同一按侧文案。两侧均为 0 时不出现该提示，也不再显示合并后的单一总数（符号链接（含悬空链接）不再计入跳过，口径归 `symlink-semantics` 域）。此类跳过是成功对比的一部分，不建空会话、不改会话状态；快照导出成功提示在 `skipped > 0` 时追加「，跳过 N 个不可读项」。
- **符号链接下钻（语义归 `symlink-semantics` 域，本域承载编排）**：指向**文件**的链接双击走既有 `openFile` 下钻链路，读取并展示链接目标文件正文（不是链接路径字符串）；`DirectoryDiffNode.linkTargetKind === 'directory'` 时只报 info 提示「是符号链接且指向目录，按不跟随口径不下钻内容」，不调用 `readTextFile`、不建会话、不报错；指向目录的链接在树中不是可展开目录节点。
- **目录对比进度与取消（壳层编排，按相位分段文案）**：每次工作台发起的目录对比（空态「打开文件夹」、新建对比对话框、目录视图选择左右目录、启动注入请求）生成一个 `operationId` 与 `AbortController`，`signal` 透传核心、`operationId` 透传 `platform.digestFiles`；对比进行中在**工作台壳层**显示常驻进度条（`role="status"`，`aria-label="目录对比进度"`），**按相位分段文案**：扫描相位显示「正在扫描目录」+「已扫描 N 个文件」（`files` = 流水线累计）；校验相位显示「正在校验内容」+「已校验 M 个文件」（`phaseFiles` = 相位内增量）并追加「累计 N 个文件」（流水线累计，切换处不回退）；两相位都展示「已处理 X」（流水线累计字节，复用 `formatBytes`），并提供「取消」按钮，空态与已有会话两种情形都可见；取消先 `abort()` 再调用 `platform.cancelOperation(operationId)`（后者失败只忽略、不改变 UI 结局），点击后到对比 settle 前按钮禁用。取消后进度条消失、`directoryBusy` 复位，走既有 `notice`（`noticeTone: 'info'`）提示含「已取消」；既有会话、活动标签、状态栏统计与当前视图在取消前后逐项不变（只有成功对比才 `upsertSession`）。空闲（无目录对比在跑）与取消完成后都不渲染进度条 / 取消按钮。从「新建对比」发起的对比在扫描开始前即已清掉该对话框（见上条关闭时机），因此整段扫描期页面上不存在 `aria-modal` 元素、进度条也不在任何模态内，「取消」不仅 `disabled === false` 而且没有覆盖层拦截真实点击；弹窗发起后扫描中取消同样保持会话页签 / 状态栏 / 主区内容全等，且不新增目录会话。
- **目录状态栏计数的运行时派生（语义归 `directory` 域）**：活动目录会话的状态栏四态计数由 `visibleDirectoryCounts(comparison.root, filter)` 按过滤档直接从根节点聚合派生，不再为统计克隆过滤树（`filterDirectoryTree` + `countTreeFiles`）；`conflict` 恒为 0，与折叠用例 `directory` 域 `ac-visible-counts-parity` 同一口径。切换过滤档 / 会话时计数随运行时结果更新。
- **壳层文案渲染期解析（词典归 `i18n` 域，本域承载渲染）**：顶栏、视图切换、空 / 载入 / 错误态、会话标签入参、通知条、关闭未保存确认对话框、目录对比进度条、状态栏与 `CompositionLegend`、选择器 / 保存对话框 `title` 全部在渲染期经 `useI18n().t(key, params)` 取当前语言，组件内不再有可见中文字面量；会话标题 / 副标题 / 统计标签由 `workbench/sessionDisplay.ts` 按会话身份（样本 id、`scene`、`adhoc`、`directory`、`sides`）产出词典键 + 用户数据片段，`Workbench` 只在渲染期拼接；统计条目为稳定角色 key（源 / 目标 / 差异 / 行数 / 冲突块 / 主键列 / JSON 节点 / 样本文件），代码视图冲突数覆盖按统计 key 判断（不再比较 `stat.label` 中文）。`fileKinds` 的 `label` 改为稳定文件族标识（`code` / `csv` / `tsv` / `json` / `yaml`），类型不一致与不支持扩展名的错误带 `mixed-family` / `unsupported-type` code 由外壳本地化。zh 值与原界面逐字一致（既有 zh 断言不变），切换语言不重挂载工作台、不重扫目录、不新增会话。
- **回归保留**：新建对比链路不介入既有路径——拖拽双路径仍按 `handleDroppedFiles` 建会话，标签切换仍保留工作副本与脏标记，目录下钻与「返回上级目录视图」的过滤 / 折叠 / 选中状态保持。
- **真实路径拖入窗口**：空首屏与有会话时均可拖入真实路径——恰好 2 个同类路径（两文件 / 两目录）直接建同一会话模型；1 个路径作为左侧基准填入 + info 提示；>2 个或文件目录混合则明确提示、不建会话、不改既有会话。拖入阻断浏览器/窗口默认导航，应用停留原状态；真实绝对路径解析经平台缝（preload / `webUtils.getPathForFile` 或 main IPC 白名单），renderer 不猜测路径。
- **样本入口降级为演示辅助**：样本按钮 / 下拉保留但显式标注演示用途，文案不再暗示「必须先加载样本」，可被完全跳过。
- **会话标签文案由会话事实派生（单一真源）**：tab 标题 / 副标题不再沿用创建时冻结的 `title` / `subtitle`，而在渲染期由会话当前事实派生——目录会话取 `directory.leftName/rightName` 与 `leftRoot/rightRoot`，文件会话取 `adhoc.pair` 两侧路径（两侧同名 → 标题为该文件名，否则 `左名 ↔ 右名`，副标题两侧完整路径）与 `delimiter` / `format`；内置样本仍按 session id 走字典 key，缺失侧仍走 `missingSidePath` + 既有 missing 字典文案。任何换路径动作（目录换侧、代码 / CSV / 结构化视图内「打开左 / 右文件」、下钻、同 id 原位刷新）都必须先落到会话事实（`setSessions` 函数式更新），视图局部 state 不是真源；因此 tab 与面板永远同帧一致，切 tab 往返与异步读盘收尾都不会让文案回到旧文件。
- **跨场景 tab 文案回归矩阵（App 级，锁死上面这条单一真源）**：在既有 App 级测试基建（`src/renderer/src/App.test.tsx` 的 `scriptedPort` / `dropPaths` / 「打开文件」「打开文件夹」/ 新建对比对话框 / `sessionTabs`）上补齐四条跨场景矩阵——① 路径 A→B 重建（同名文件不同目录）；② 文件会话内视图「打开左文件」「打开右文件」；③ 目录会话下钻文件再「返回上级目录视图」；④ 文件 / 目录 / 下钻三类会话并存时连续切换与关闭非活动邻居。矩阵对 tablist 内**每个** tab 分别读取标题元素（第一个 `font-medium` span）与副标题元素（紧随其后的 `text-2xs` span）做逐项相等比较，不用整 tab 合并 `textContent` 包含判断、不用跨会话 `getAllByText` 代替 tablist 内断言；每条用例还断言任一 tab 的标题 + 副标题不包含其它会话的路径片段。矩阵暴露的残留缺陷在本域内修到代码闭环（不放宽既有实现或断言来消除失败），作为会话文案派生纪律的常驻回归网。
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
- **ac-progress-ui-live**：renderer 组件测试中发起目录对比并让平台摘要挂起：界面出现 `role="status"` 的进度条，文本含「已扫描」与文件数、「已处理」与字节数以及一个可访问名为「取消」的按钮；推进一个扫描批次后文本中的已扫描文件数变大；对比成功后进度条消失。
- **ac-cancel-keeps-ui-state**：renderer 组件测试中已有目录会话 A 在屏时发起 B 的目录对比并点击「取消」：`cancelOperation` 收到与 `digestFiles` 相同的 `operationId`；取消后会话列表与顺序、`activeId`、状态栏统计、当前目录视图内容与取消前逐项一致，不新增标签，`notice` 文本含「已取消」且 tone 为 info，`busy` 复位、进度条消失，同一对目录随后可再次发起对比。
- **ac-progress-cancel-idle**：没有目录对比在跑时（空闲、文件对打开、同步 / 模板预览与确认）不渲染进度条与取消按钮；取消完成后再次空闲同样无残留。
- **ac-dialog-cleared-when-scan-starts**：在「新建对比」中键入一对真实目录路径并点击「建立对比」，当首个 `listDirectories` 批次被测试 gate 挂住（扫描进行中）时，`screen.queryByRole('dialog', { name: '新建对比' })` 为 `null`，且 `document.querySelectorAll('[aria-modal="true"]').length === 0`。
- **ac-progress-visible-unobstructed**：同一扫描期间存在 `role="status"` 名为「目录对比进度」的元素，文案含「正在扫描目录」或「正在校验内容」以及「已扫描 N 个文件」，且该元素 `closest('[aria-modal="true"]')` 为 `null`（不在任何模态内）。
- **ac-ui-phase-copy**：`role=status` 进度条在扫描相位文本含「正在扫描目录」与已扫描文件数，在校验相位文本含「正在校验内容」与已校验文件数（相位内增量），两相位都展示累计已处理字节。
- **ac-ui-no-regress**：同一对比运行中，进度条从扫描相位切到校验相位后，其展示的累计文件数与累计已处理字节数不小于切换前最后展示值（旧实现下的「1,383,203 → 960」形态必须失败）。
- **ac-cancel-clickable-during-scan**：同一扫描期间进度条内「取消」按钮存在、`disabled === false`，且此时文档中 `[aria-modal="true"]` 元素数为 0（无覆盖层）；`fireEvent.click` 该按钮后 `platform.cancelOperation` 恰好被调用一次，参数等于正在进行的 operation id（与 `digestFiles` 收到的 id 一致），进度条进入 `cancelling` 态（「取消」变为 disabled）直到操作结束。
- **ac-cancel-keeps-workbench**：从弹窗发起、扫描中取消后约 1s 内进度条消失；出现 `role="alert"` 且文本严格等于「已取消本次目录对比，工作台保持取消前的状态。」；取消前后会话页签文本数组、`contentinfo` 文本、`main` 的 `innerHTML` 全等；未新增任何目录会话页签，无残留半棵树。
- **ac-invalid-path-stays-inline**：提交不存在的右路径时不关闭弹窗——`role="alert"` 出现在「新建对比」弹窗内部且包含该路径文本，弹窗仍在，`queryByRole('tablist', { name: '会话' })` 为 `null`（不建 tab）；未进入扫描（`listDirectories` 未被调用）。
- **ac-picker-entry-also-unobstructed**：经弹窗内「打开文件夹」选择两个真实目录后，在扫描批次被 gate 挂住期间同样满足「无 `aria-modal` 元素 + 进度条存在 + 进度条内「取消」可点击」，即修复覆盖弹窗内的选择器发起路径，而非只修键入路径。
- **ac-picker-cancel-keeps-dialog**：弹窗内「打开文件夹」的用户在系统选择器取消（返回 `null`）时，「新建对比」弹窗仍然打开、不建会话、不进入扫描（关闭时机改动不得让弹窗在「还没确定一对路径」时消失）。
- **ac-renderer-cancel-notice**：扫描阶段与哈希阶段各取消一次，进度条消失、`directoryBusy` 解除、取消按钮恢复可点，notice 文本为「已取消本次目录对比，工作台保持取消前的状态。」，会话 tab、main 区域与状态栏与取消前一致。该行为在平台改为结构化取消（`{ cancelled: true }`）后仍必须成立——壳层不改布局与文案结构，取消提示由核心取消 catch 分支经既有 `noticeTone: 'info'` 通道发出。

### 会话文案单一真源（tab 标题 / 副标题由会话事实派生）

- **ac-directory-tab-follows-new-roots**：先用目录路径 A 建会话，再用目录路径 B 新建对比后，激活 tab 的标题为 B 的左右目录名、副标题为 B 的左右根路径；A tab 仍显示 A 的目录名与根路径，两 tab 不互相污染。
- **ac-file-pair-title-derived**：用两侧同名但位于不同目录的文件（如 `.../a/report.md` ↔ `.../b/report.md`）新建对比，tab 标题为该文件名，副标题同时包含两侧完整路径；再开另一对同名不同目录文件，两个 tab 各自显示自己的路径。
- **ac-side-swap-follows**：目录会话内换一侧目录成功后，可见 tab 的副标题为新一侧根路径 + 未改侧原路径，不残留被替换的旧侧路径。
- **ac-code-view-open-writes-session**：代码会话内「打开左文件」为新路径后，tab 标题与副标题立即显示新路径；会话事实（`adhoc.pair.left.path` 与代码工作副本路径）均为新路径且正文为新文件内容；切到其它 tab 再切回，面板路径与内容仍是新文件。
- **ac-csv-view-open-writes-session**：CSV/TSV 会话内打开一侧文件后，tab 副标题与面板同时显示新路径（含按新正文重算的行数），切 tab 往返不回到旧文件。
- **ac-structured-view-open-writes-session**：JSON/YAML 会话内打开一侧文件后，tab 副标题与面板同时显示新路径与格式，切 tab 往返不回到旧文件。
- **ac-stats-follow-new-pair**：视图内换文件后状态栏 / 会话统计按新正文重算，不残留旧文件的行数。
- **ac-drilldown-tab-paths**：目录会话下钻打开文件对后，下钻 tab 标题为该文件名、副标题为两侧真实路径；返回目录视图后目录 tab 副标题恢复其根路径，下钻文案不残留到目录 tab。
- **ac-missing-side-kept**：一侧缺失的下钻会话，副标题仍走既有缺失侧字典文案（相对路径 + 缺失标记），标题只显示文件名、不出现内部 `::opencompare-missing-*` 后缀。
- **ac-async-commit-no-clobber**：一次读盘打开文件对尚未返回期间另一会话完成提交，收尾后两个会话都存在且文案各自正确，不出现旧快照覆盖导致会话丢失或文案回退。
- **ac-inplace-refresh-sync**：同 id 原位刷新（sync 后重新对比）后 tab 保持原 id 与位置，标题 / 副标题为新对比结果的左右根路径，视图显示新对比树而非旧树。
- **ac-sample-labels-unchanged**：四个内置样本 tab 仍按 session id 走字典文案，中英文切换时标题 / 副标题随字典变化，不受派生逻辑影响。
- **ac-multi-tab-isolation**：文件会话、目录会话、下钻会话并存时连续切换 tab，每个 tab 的标题与副标题只属于自己；关闭相邻 tab 后剩余文案不变。
- **ac-vitest-regression**：上述场景全部落成 vitest 断言（先红后绿，复用既有 App / 纯函数夹具），仓库 `code_gates` 全绿。

### 跨场景 tab 文案回归矩阵

- **ac-matrix-per-tab-title-subtitle**：矩阵的每条 tab 断言都分别读取 tablist 中该 tab 的标题元素（第一个 `font-medium` span）与副标题元素（紧随其后的 `text-2xs` span）做逐项相等比较；不得只用整个 tab 的合并 `textContent` 包含判断，也不得用跨会话 `getAllByText` 代替 tablist 内断言。
- **ac-rebuild-a-to-b-same-name**：经「新建对比」对话框依次提交文件对 A（`/memory/one/report.md` ↔ `/memory/two/report.md`）与文件对 B（`/memory/three/report.md` ↔ `/memory/four/report.md`）后，tablist 恰有 2 个 tab；B tab 标题为 `report.md`、副标题同时包含 B 两侧完整路径且不包含 `/memory/one/report.md` 或 `/memory/two/report.md`；A tab 标题仍为 `report.md`、副标题含 A 两侧路径且不含 B 任一侧路径；B 为 `aria-selected="true"`。
- **ac-view-open-both-sides**：文件会话内在视图依次「打开左文件」与「打开右文件」为新路径后，tablist 仍只有原会话一个 tab（session 身份不变、无新增同名 tab）；该 tab 标题为两侧新文件名（同名 → 文件名；异名 → `左名 ↔ 右名`），副标题同时含两侧新路径且不含任一侧旧路径；切到另一 tab 再切回，标题与副标题仍为新路径。
- **ac-drilldown-tab-then-return**：目录会话下钻 `engine.ts` 后，下钻 tab 标题为 `engine.ts`、副标题含 `<left root>/src/core/engine.ts` 与 `<right root>/src/core/engine.ts`；点「返回上级目录视图」后目录 tab 的标题为两侧目录名（`baseline ↔ candidate`）、副标题为两侧根路径且不含 `engine.ts`，下钻 tab 的标题与副标题保持不变。
- **ac-mixed-tab-switch-isolation**：文件、目录、下钻三个 tab 并存时，依次点击每个 tab（含一轮往返），每次点击后 tablist 中每个 tab 的标题与副标题都与各自会话事实一致，且任一 tab 的标题 + 副标题不包含其它会话的路径片段。
- **ac-close-neighbour-labels-stable**：在三个 tab 并存且当前活动为中间 tab 时关闭一个非活动邻居，tablist 剩余 tab 数与预期一致；剩余每个 tab 的标题与副标题字符串与关闭前逐项相等，活动 tab 的 `aria-selected` 不变、可见面板（状态栏 / 目录树）内容不变。
- **ac-matrix-no-weakened-assertions**：新增矩阵全部落在既有测试文件与既有夹具（`scriptedPort` / `dropPaths` / 打开文件 / 文件夹 / 新建对比 / `sessionTabs`）内，不新增测试文件、测试目录或依赖，不引入 `it.skip` / `it.only` / 缩短超时 / `try-catch` 吞断言；若矩阵暴露残留缺陷，产品侧修到通过，断言路径与期望值保持本 prd 定义的严格口径。
- **ac-six-gates-green**：`install` / `lint` / `typecheck` / `build` / `build:web` / `test` 六项门禁全部成功，`pnpm test` 包含上述矩阵用例且无新增跳过项。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域。各视图只读呈现内容，不做差异高亮与统计；除目录会话（其四态计数由运行时对比结果按过滤档派生，语义归 `directory` 域）外，其余视图的状态栏计数与标签取自样本自带 answer key（编辑期标注），非运行时计算。
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
- 不删改内置样本、不重构 `loadSampleSessions` 既有加载路径；不新增对比能力品类、不改目录对比 / Diff / CSV / 结构化算法内核。进度条与取消只覆盖目录对比：不做暂停 / 恢复 / 断点续传、不做取消确认对话框、不做取消后自动重试（取消即一次性终止），不给快照导出 / 同步 / 模板 / 下钻加进度或取消，也不新增 main → renderer 的进度事件通道（进度由核心批次结算结果在 renderer 侧汇总）。
- 关闭时机这一项不做连锁扩张：不修 `TreeView` 容器高度超浏览器布局上限（尾部行不可达，D2）的独立缺陷；不把进度条 / 进度文案搬进弹窗（不重排壳层进度条版式与文案层级）；不改主进程扫描 / 哈希 / `digestFiles` / `cancelOperation` 语义与四态判定；不改 `Dialog` 组件通用视觉（遮罩色、圆角、宽度）与 `z-index` 体系；不改拖拽 / argv / `opencompare://` 入口；不顺带做弹窗校验规则、占位文案、快捷键、Enter 行为等体验优化。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案；token 用 Tailwind v4 `@theme` 定义在 renderer 内唯一 CSS 来源。
- 视觉方向已定：现代暗黑工业风 + 紧凑高信息密度；差异语义色（相同/新增/删除/修改/冲突）必须在 token 层命名并在后续所有视图统一引用。
- 分层硬约束：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API；`PlatformPort` 现有契约语义不破坏（可扩展）。
- 等宽字体使用系统字体栈，不引入需网络的 web font。
- 视觉索引只写 change pack `ux/design-baseline.md`，不自己改 `.munk/baseline/**`。
- 「新建对比」只用既有 `components/Dialog`（新增 `initialFocusRef` 以把初始焦点放到左侧输入框）、`ToolbarButton` 与 `main.css` token，不写死颜色尺寸、不新增设计系统；`parseManualPaths` / `resolveCompareRequest` 是唯一校验入口，renderer 不另写解析、规范化或错误码，错误文案直接用 `error.message`。会话创建只复用 `openFilePair` / `runSidesCompare`，`upsertSession` / `activeId` 状态机不改。
- **进度 / 取消复用现有通道与 token**：进度条复用 `formatBytes` / `ToolbarButton` / 状态栏与 `notice` 既有语义 token（`bg-surface-sunken` / `border-line-subtle` / `text-content-*` / `bg-accent`），不新建页面、不改既有布局层级、不使用硬编码颜色；进度条放壳层以便空态可见，取消按钮点击后到对比 settle 前 `disabled`，避免重复取消。取消路径只调 `controller.abort()` + `platform.cancelOperation(id)`，成功后不 `upsertSession`、不切会话、不动状态栏。
- **会话文案派生纪律**：`describeSession` 保持纯函数、每次渲染现算，不深拷贝目录树或文件正文；`title` / `subtitle` 字段保留作兼容但不得再作为 tab 文案唯一来源；视图内换文件只经 `onOpenSide(side, picked)` 回写会话（文件对 path / text、CSV `delimiter` + `tables`、结构化 `format`、代码 `codeBuffer` 与 `stats` 同一次提交落地），不得另开同名 tab 掩盖换路径；`sessions` 的所有写入统一走函数式 `setSessions`（`upsertSession` / `replaceSession` / `closeSession` / 换侧回写），异步流程结束后不得用闭包旧快照整体覆盖；视图内回写不得在每次按键编辑时额外深拷贝正文。测试复用 `App.test.tsx` 的 `scriptedPort` / 注入请求端口与 `sessionDisplay.test.ts` / `sessionStore.test.ts` / `directoryCompare.test.ts` 既有夹具，不新建测试基建或目录。
- **关闭时机只提前、不抬层级**：把「关闭新建对比弹窗」提前到目录对比真正开始的那一刻——在 `Workbench.tsx` 的 `runSidesCompare()` 进入扫描前清掉 `compareDialogOpen`（一处状态调用即同时覆盖键入路径与弹窗内选择器路径，且天然保留「选择器被取消时弹窗不关」）；`NewCompareDialog.submit()` 中 `await openRequest(...)` 之后的 `onClose()` 保留为幂等兜底。关闭时机必须晚于路径校验与 `resolveCompareRequest` 探测；**不要**把 `Dialog` 遮罩抬到进度条之上、也不要改成非模态（AC 要求扫描期 `aria-modal` 计数为 0）。测试落点在 `src/renderer/src/App.test.tsx`（jsdom）的 `new compare dialog` 与 `directory progress and cancel UI` 两处 describe，用 DOM 层级（`[aria-modal="true"]` 计数、`closest()`、按钮 `disabled`、click 后 `cancelOperation` 调用）表达「无覆盖层」，不要求 jsdom 做真实坐标 hit-test。

## 最近交付证明

- WI：`wi_ws_89f1791b7f90e713`（跨场景 App 级 tab 文案回归矩阵，`kind: test`）
- 日期：2026-10-27
- 结果：code_gates passed（9 gates，attempt 001，`.munk/runs/run_ws_1dc02fdbf254a0cb/code-gates/attempts/001`；`needSelfTest=false`，UI 自测跳过）。`pnpm test` 62 files / 1009 passed + 1 skipped / 1010（较上轮 1005+1 增 4 条）。
- 覆盖摘要：**实现零改动，只加测试**——`src/renderer/src/App.test.tsx` 的 `describe('session tab labels follow the session facts')` 内新增 4 条矩阵 + 4 个局部 helper（`tabLabels` 取 tab 内第一个 `font-medium` span 与紧随的 `text-2xs` span、`tabMatrix` 按 tablist 顺序出 `{title, subtitle}[]`、`activeTab` 按 `aria-selected`、`submitComparePair` 走「新建对比」对话框提交文件对）。四条用例：① A→B 同名文件不同目录重建（2 tab、B 为 active、两 tab 各含自己两侧路径且互不含对方路径）；② 视图内「打开左文件」→「打开右文件」为新路径（仍只有原会话一个 tab，标题按异名 `alpha.ts ↔ beta.ts`、副标题为新路径且不含旧的 `engine.ts` 路径，切走再切回不回退）；③ 目录会话下钻 `engine.ts` 后下钻 tab 标题 / 两侧真实路径，点「返回上级目录视图」后目录 tab 复原 `baseline ↔ candidate` + 两侧根且不含 `engine.ts`、下钻 tab 文案不变；④ 文件 + 目录 + 下钻三 tab 混合连续切换（含往返）每 tab 各守自己事实、互不含其它会话路径，活动为中间 tab 时关闭非活动左邻居后剩余两条 `{title, subtitle}` 与关闭前逐项相等、`aria-selected` 与状态栏 / 目录树不变。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收落档为 `qa/cross-scene-tab-matrix.md`。② **红验证已补做**：矩阵在上一轮的派生实现上直接全绿，故在 Delivery 侧临时把 `describeSession` 文件对分支回退为冻结 `session.title` / `session.subtitle` 复跑——A→B 用例首条断言即失败（冻结节显示 `· code` 而非词典家族）、视图双侧打开用例失败（标题停在 `engine.ts`），随后还原文件（`git status` 仅剩 `App.test.tsx`），目标 describe 11 passed；即矩阵确实能捕获「冻结旧文案 / 视图局部 state」两类回归。③ 残留观察：下钻返回与混合切换 / 关闭邻居两条用例在当前实现上**没有失败历史**，属纯回归锁（不证明曾存在缺陷）；它们依赖 `SessionTabs` 的标题为第一个 `font-medium` span、副标题为后继 `text-2xs` span 这一版式契约，后续若重排 `SessionTabs` 层级必须同步改 helper，否则矩阵会假绿。④ 本轮测试增量落在既有 describe 内、未新增测试文件 / 目录 / 依赖，`it.skip` 计数不变（1 skipped 为该文件既有项）。
- 历史（上一轮）：WI：`wi_ws_a66e5d868c6c9cee`（会话文案单一真源：tab 标题 / 副标题由会话事实派生，`kind: fix`）
- 日期：2026-10-27
- 结果：code_gates passed（9 gates，attempt 001，`.munk/runs/run_ws_dc0d09e3b67f486c/code-gates/attempts/001`；`needSelfTest=false`，UI 自测跳过）。`pnpm test` 62 files / 1005 passed + 1 skipped / 1006（较上轮 58 文件 897+1 增 4 文件 / 108 条）。
- 覆盖摘要：`workbench/sessionDisplay.ts` 的 `describeSession` 改为按会话事实派生文案——新增 `filePairTitle`（取 `adhoc.pair` 两侧 `baseName`，同名 → 该名，异名 → `左名 ↔ 右名`，`displayName` 先剥掉内部 `::opencompare-missing-*` 后缀）与 `directoryText`（取 `session.directory` 的 `leftName ↔ rightName` 与 `leftRoot ↔ rightRoot`），`title` / `subtitle` 仅在无对应事实时作兜底；`workbench/directoryCompare.ts` 新增纯函数 `replaceFilePairSide(session, side, file)`，把换文件收敛到一次提交——`adhoc.pair` 该侧 path/text、CSV `delimiter` + 重算 `tables`（`parseCsvTable`）、结构化 `format`（`classifyFile`，未知扩展名保留原值）、`stats` 行数（`pairStats` 与创建期同源）、代码工作副本 `codeBuffer` 该侧 path/source/text 同步重置，非 ad-hoc 会话原样返回；`CodeView` / `CsvView` / `StructuredView` 新增 `onOpenSide` 回写回调（选到文件即上报，菜单 / 校验收敛在既有 `pickTextFile` 流程之后），`Workbench` 的 `handleSessionFileOpen` 用 `setSessions((current) => …)` 落到对应会话；`upsertSession` / `replaceSession` / `closeSession` 一并改为函数式 `setSessions`，异步读盘晚到的提交不再用闭包旧快照覆盖。测试：`App.test.tsx` 新增 `session tab labels follow the session facts` 6 条（同名 / 异名文件对各守自己的路径、目录换侧跟新根且不残留旧侧、代码 / CSV / 结构化视图打开文件后 tab + 面板 + 行数同步且切 tab 往返不回退、文件 + 目录 + 下钻三 tab 隔离且返回目录后文案复原、慢读盘不覆盖期间提交的会话），并在既有「预览并同步」用例补 4 条原位刷新后 tab 身份 / 位置 / 新根路径断言；`sessionDisplay.test.ts` 新增 3 条纯函数断言（目录根派生、同名文件对、异名文件对），`directoryCompare.test.ts` 新增 4 条 `replaceFilePairSide` 断言（CSV 表 / 分隔符 / 行数同动、结构化格式、代码工作副本单侧重置、无 adhoc 会话不动）。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收按 AC 逐条落档为 `qa/session-tab-labels-follow-session-facts.md`。② `describeSession` 现在是 tab 文案唯一入口——今后任何新会话形态必须给它可派生的事实字段，否则只能落到 `session.title` 兜底并会重新出现「文案冻结」类问题。③ `replaceFilePairSide` 是「视图换文件」的唯一写入口，新视图若再加「打开文件」必须走它而不是自己改局部 state，否则 tab 与面板会再次分叉。④ 目录文案改为读 `session.directory` 后，`directoryCompare.ts` 创建期写入的 `title` / `subtitle` 只剩兼容用途，不要再在别处读它们作显示。
- 历史（上一轮）：`wi_ws_a0d69b96e026b9df`（工作台外壳与新建对比双语化：壳层文案接词典、会话显示渲染期化，`kind: feature`）
- 日期：2026-10-23
- 结果：code_gates passed（9 门禁，`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`App.tsx` 启动走 `loadInitialLanguage(platform)`，解析期间只渲染无文字品牌帧，settle 后以解析结果作 `I18nProvider initialLanguage` 挂一次 `Workbench`（语言值不作 `key`），`?perf=1` 分支不变；`Workbench.tsx` 顶栏 / 视图切换 / 三态 / 标签条入参 / 通知条 / 关闭确认对话框 / 目录进度与取消 / 状态栏与图例 / 选择器与保存 `title` 全部改词典渲染期解析；新增纯函数 `workbench/sessionDisplay.ts`（按会话身份出标题 / 副标题 / 稳定统计 key + 用户数据片段，缺失侧用 `::opencompare-missing-{left,right}` 稳定标记）；`NewCompareDialog.tsx` 外壳文案与 `compareRequest` 稳定错误码文案（未知 I/O 失败只保留原始详情）；`Dialog` / `SessionTabs` / `StatusBar` / `DiffBadge` / `diffSemantics`（`DIFF_LABEL_KEYS`）接词典；`fileKinds.label` 改稳定文件族标识并在 `directoryCompare.ts` 同步使用。词典只在 `common`（27 键）/ `shell`（128 键）成对新增，zh 逐字沿用原界面。新增测试：`App.i18n.test.tsx`（启动四态 + 英文壳层 / 进度取消 / 通知 / 新建对比 / 下钻 / 选择器 title / 中英同调用序列 / 无汉字冒烟）、`sharedI18n.test.tsx`、`sessionDisplay.test.ts`、`shellScan.test.ts`（显式 10 文件清单 0 命中 + 无 `stat.label` 中文比较）；既有 `App` / `App.snapshot` 预置 zh 记录并等待首屏。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无新增折叠用例、无 tech/ux 手合；② 词条与词典面归属折叠在 `domains/i18n`；③ 壳层文案已全部走词典，后续 WI 若新增顶栏 / 通知文案必须同时加键与进 `shellScan` 清单，否则扫描断言会红。

- WI：`wi_ws_601ef56ae8fd93a4`（取消结构化返回、零日志噪声与零残留，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（含新增 `cancel-gate`；本轮 `needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：本轮**壳层 UI 零改动**——`Workbench.tsx` 的进度条 / 取消按钮 / `notice` 文案未调整，取消提示仍由核心取消 catch 分支经既有 `noticeTone: 'info'` 发出。唯一相关变化在 renderer 适配层：`snapshotOps` / `directoryOps` / `loadSampleSessions` 的摘要 seam 改经 `digestFilesForComparison`，平台返回 `{ cancelled: true }` 时在渲染进程抛回 `OperationCancelledError`，故「取消后进度条消失、`directoryBusy` 复位、会话/状态栏/main 与取消前全等」的既有断言（`App.test.tsx` 的 `directory progress and cancel UI`）继续成立；`cancel-gate.test.ts` 另在扫描相位验证零 stderr 与不再发起 `listDirectories`。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例，全局 tech / design 折叠跳过；结构化契约归 `domains/foundation`，残留计数/零噪声门禁归 `domains/io-concurrency`，摘要块与缓存完整性归 `domains/content-digest`，核心取消控制流与半树/重试归 `domains/directory`。**本域无真实桌面点选证据**：取消提示为既有行为回归，未做 Electron 窗口人工复核。

- WI：`wi_intake_f1695c0476174245`（目录对比跨相位进度归零修复 · 壳层进度条相位分段文案，`kind: fix`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增相位切换不回退与扫描相位取消用例）。
- 覆盖摘要：`Workbench.tsx` 的 `DirectoryProgressState` 增 `phaseFiles`（相位内增量）并保留 `files` / `bytes` 为流水线累计；初始状态 `{ phase: 'scan', files: 0, bytes: 0, phaseFiles: 0, cancelling: false }`，`onProgress` 透传 `phaseFiles`。进度条文案按相位分段：扫描相位「正在扫描目录 + 已扫描 N 个文件」；校验相位「正在校验内容 + 已校验 M 个文件（相位内增量）」并追加分隔符 +「累计 N 个文件」（流水线累计，切换处不回退）；「已处理 X」始终取累计 `bytes`。`role="status"` / `aria-label="目录对比进度"` / 取消按钮 / `cancelling` 态与既有空闲不渲染语义不变。`App.test.tsx` 新增：130 对文件（>64 摘要块）下扫描末态「已扫描 260 个文件」且 `已处理 260 B`，首块 settle 后切到「正在校验内容」「已校验 64 个文件」+「累计 324 个文件」，累计文件数与已处理字节均 ≥ 切换前值；扫描相位取消后 `cancelOperation` 只调一次、出既有「已取消本次目录对比…」alert、会话页签 / `contentinfo` / `main.innerHTML` 与取消前全等且不新增会话。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例；核心进度契约与 `progressBase` 语义归 `domains/directory`，本轮 tech / design 折叠跳过。

- WI：`wi_intake_402bcc763d79104b`（「新建对比」弹窗遮挡目录对比进度条与取消按钮 · D1，`kind: bug`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增 4 条关闭时机 / 无覆盖层用例；真实坐标 hit-test 留给交付后 QA 复测）。
- 覆盖摘要：`Workbench.tsx` 的 `runSidesCompare` 入口先读 `compareDialogOpen` 再立即 `setCompareDialogOpen(false)`——扫描前清弹窗，同时覆盖键入与弹窗内选择器两条发起路径，并保留 `NewCompareDialog.submit()` 完成后的 `onClose()` 幂等兜底；「弹窗发起」的构建期错误改走工作台 `report`（notice），路径校验 / 探测仍在弹窗内，非法路径不建 tab 且不触发 `listDirectories`。`App.test.tsx` 新增 4 条：键入目录对在首批 `listDirectories` 被 gate 挂住时无 `dialog` 且 `[aria-modal]` 计数为 0、进度条含「正在扫描目录」「已扫描 N 个文件」且不在模态内、取消按钮 `disabled === false`；弹窗内「打开文件夹」发起同样无覆盖层且「取消」可点；选择器取消（返回 `null`）时弹窗保持打开、不建会话、不扫描；弹窗发起后扫描中取消 → `cancelOperation` 收到与 `digestFiles` 同一 operation id、按钮锁定到 settle、进度条消失并出「已取消本次目录对比，工作台保持取消前的状态。」alert，会话页签数组 / `contentinfo` / `main.innerHTML` 全等。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例；壳层进度 / 取消编排与弹窗关闭时机归本域，核心取消语义仍归 `domains/directory`。

- WI：`wi_ws_90a06ca6d557d5cd`（扫描/哈希进度与可取消，`kind: feature`）
- 日期：2026-10-21
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过；`pnpm test` 全绿，含新增进度/取消 UI 用例）。
- 覆盖摘要：`Workbench.tsx` 新增 `DirectoryProgressState` / `ActiveDirectoryOperation` 与 `directoryProgress` 状态：`runSidesCompare` 每次生成 `directory-<序号>-<随机后缀>` 的 `operationId` 与 `AbortController`，把 `signal` / `operationId` / `onProgress` 传给 `compareSides`（`snapshotOps.ts` 的 `CompareSidesOptions` 再透传 `compareDirectorySides` 并把 `operationId` 绑到 `platform.digestFiles`），`finally` 复位 busy/进度；取消走 `cancelDirectoryCompare`（置 `cancelling` → `abort()` → `platform.cancelOperation(id).catch` 忽略失败）；`isOperationCancelled` 分支走 `report('已取消本次目录对比，工作台保持取消前的状态。', 'info')` 且不建会话。壳层新增 `role="status"` 进度条（阶段名 + 已扫描 N 个文件 + 已处理 `formatBytes` + 取消按钮），空态与有会话同时可见。`App.test.tsx` 新增「directory progress and cancel UI」3 条（实时 scan/digest 文本推进且成功后消失、取消后 `cancelOperation` 收到同一 id 且会话/activeId/状态栏/目录视图不变并出 info notice、空闲时不渲染进度条）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例；核心进度/取消语义归 `domains/directory`，平台取消能力归 `domains/foundation`，流销毁归 `domains/io-concurrency`。

- WI：`wi_ws_1049cda9d94e3506`（renderer 侧接收启动注入请求并复用既有会话入口）
- 日期：2026-10-20
- 结果：code_gates passed（install / lint / typecheck / build / build:web / test 全绿；`needSelfTest=false`，跳过 UI 自测）。
- 覆盖摘要：
  - `Workbench.tsx`：新增一个挂载副作用——`platform.onCompareRequest?.(…)` 订阅（端口缺该能力即直接跳过，不报错），订阅后 `void platform.compareRequestsReady?.()`；handler 放进 `launchRequest` ref 并以空依赖副作用更新，避免因 `openCompareRequest` / `report` 变化重复订阅；成功 payload 调既有 `openCompareRequest(payload.request, (message) => report(message))`，失败只 `report(payload.message)`；cleanup 返回 unsubscribe。
  - `App.test.tsx`：新增 `describe('launch request injection')` 7 条——注入 file 请求建 `scene: 'code'` 会话且 `selectFile` / `selectDirectory` / `saveFile` 均 0 次；注入 directory 请求建 `scene: 'directory'` 会话并 active；注入与手工输入同一路径对得到同一会话 id（tab 仍 1 个）；失败 payload 出 notice 且 `sessions` / `activeId` 不变；StrictMode 下只保留一个有效订阅；卸载后注入不建会话且不抛错；ready 在订阅之后发出且挂载前到达的请求被补投。
- 注：单实例锁 / argv·`open-url` 收集 / 队列与窗口聚焦 / preload 白名单 / 打包协议声明的 AC 分别落在新域 `launch` 与 `release`；本域交付只覆盖 renderer 落地这一层，未改会话模型、`upsertSession`、手工入口与既有标签行为。本 WI change pack 未提供 `tests/cases/**` / `tech.md` / `ux/**`，无新增折叠用例、无 tech/ux 手合。
