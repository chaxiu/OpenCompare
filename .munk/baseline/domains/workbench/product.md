# Domain: workbench

OpenCompare 的多会话工作台壳层：视觉基线（token + 基础组件）、壳层层级与三档宽度、顶栏 / 空态 / 新建对比 / 会话标签 / 状态栏的编排，以及四大场景内置样本底座。差异与合并算法、各视图内的对比业务不属本域，见「非目标」。

## 范围

- **视觉基线**：token 唯一来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`），承载表面 / 文字 / 边框 / 主色 / 危险 + 差异语义色（same·added·removed·modified·conflict）、字号字重、间距、圆角、焦点环、动效；基础组件（工具栏按钮与下拉、会话标签、面板、可拖拽分割窗格、空 / 载 / 错态、状态栏、树与列表行、等宽代码块）只引用 token。
- **壳层层级与三档宽度（单一尺寸表）**：`workbench/shellLayout.ts` 固定 `app`(h-8 px-3 = 32) → `sessions`(h-7 px-3 = 28) → `events`(h-7 px-3，仅 notice / 扫描进度) → `view-toolbar`(h-8 px-2 py-0.5，单行合计 36，含下钻返回条) → `panels`(标题 h-6 px-2 = 24 + 内容 py-2) → `status`(h-6 px-3 = 24)，同级只出现一次，高度 / 内边距 / 间距 / 控件高度只取自该表；1024 / 1440 / 1920 由 `resolveWidthTier` 单表派生（`useWidthTier` 只在 resize 重算），所有级别单行不换行（状态栏在受支持宽度恒单行，`rows >= 2` 仅为安全网，见域 `status-bar-layout`）；compact 档只隐藏文本 / 次要副标题（保留 `aria-label` / `title`），不移除入口、不改「更多」菜单。壳层高度 / 工具行 / 地址条 / 视图度量契约见域 `shell-tightening`。
- **入口清单与稳定钩子**：入口集中声明为 `SHELL_ENTRIES`，18 条 `open-file` / `open-folder` / `new-compare` / `settings` / `filter` / `sync` / `template` / `snapshot-import` / `snapshot-export` / `report-export` / `drilldown-back` / `prev-diff` / `next-diff` / `override` / `save` / `merge-accept` / `export` / `tab-select` 与 DOM 集合完全相等；`measureToolbar(tier, level, view)` 以 `required ≤ available` 复核每行；各级带 `data-shell-level`、入口带 `data-shell-entry`。
- **主屏与会话模型**：顶栏（品牌图标 + `OpenCompare` 标题、四个常驻动作 `new-compare` / `open-file` / `open-folder` / `settings`，无样本入口 / 品牌副标题 / scene 分段控件）+ 中央可拖拽双栏 / 三栏工作区 + 底部状态栏；一个样本或一对路径 = 一个会话，支持并存切换，无会话为空态，空 / 载 / 错三态可见。会话带 `dirty`（经 `onDirtyChange` 上报、`Workbench` 镜像）与可编辑工作副本 `CodeFileBuffer`，切 tab 卸载后仍可原样重建；tab 图标取 `SCENE_ICONS`。
- **会话标签文案与截断**：标题 / 副标题在渲染期由 `describeSession` / `renderSessionText` 按会话事实派生（目录取目录名与根路径；文件对取两侧路径，同名取文件名、异名 `左 ↔ 右`；样本按 session id 走字典），可见文本由纯模块 `workbench/sessionTabText.ts` 按 `TAB_TIER_BUDGETS` 三档预算裁尾（`…` + 连续尾部、成对均分、副标题先丢 ` · <格式>`），完整文本留在 `aria-label` / `title`。
- **会话标签生命周期**：点击切换（工作区 / 状态栏 / 统计随活动会话更新，顺序不变）；独立关闭按钮（可访问名「关闭 <标题>」）——未修改直接关闭，`dirty` 先经 `Dialog` 确认（「继续编辑」/「放弃修改并关闭」）；关闭活动会话优先后继、无后继取前一个，关闭最后一个回空首屏；标签以圆点 + 文本标 dirty；关闭时清理该会话的目录状态 / 滚动 / 合并计数 / CSV 缓存。
- **scene 由打开对象决定**：目录走 `createDirectorySession`，文件对经 `classifyFile` → `openFilePairSession` 落 `code` / `csv` / `structured`，下钻走 `createDrilldownSession` 并写 `parentDirectoryId`；不存在任何 scene 选择 UI。
- **顶层入口**：顶栏常驻「新建对比」（仅 `directoryBusy` 期间 disabled）与「打开文件」「打开文件夹」，空态 action 区恰为这三个真实 CTA；对话框（`role="dialog"`）含左右路径输入、两个选择器动作与「建立对比」，唯一校验入口是 `parseManualPaths` + `resolveCompareRequest`（`homeDir` / `baseDir` 由平台提供、probe 走 `statPath`），通过后只按 `kind` 路由到既有 `openFilePair` / `runSidesCompare` 并按 `upsertSession` 复用同路径对；路径类失败只在弹窗内以一行 `role="alert"` 展示，目录对比在扫描前即清掉弹窗。
- **拖入与启动注入**：恰 2 个同类真实路径直接建会话，1 个作为左侧基准 + info 提示，>2 或文件目录混合明确提示且不建会话；挂载时经 `PlatformPort.onCompareRequest` 订阅一次后调 `compareRequestsReady()`，payload 复用既有会话入口，端口缺该能力等价「无注入」。
- **目录对比进度与取消**：每次目录对比生成 `operationId` + `AbortController`，壳层常驻 `role="status"` 进度条（「目录对比进度」）按相位分段——扫描「正在扫描目录 + 已扫描 N 个文件」、校验「正在校验内容 + 已校验 M 个文件 + 累计 N 个文件」，两相位都展示累计「已处理 X」与「取消」；取消先 `abort()` 再 `platform.cancelOperation(id)`，取消后走 info notice 且会话 / 标签 / 状态栏 / 视图不变；跳过项以 info notice「已跳过：左 X / 右 Y」呈现。
- **单行工具区与「更多」收纳**：目录 / 代码工具行各只渲染 1 行，不再横向滚动裁切；每行声明 `TOOLBAR_ROWS` 的 `entries`（直接渲染）与 `overflow`（「更多」菜单），两者并集等于该视图的入口集合，主操作每屏 ≤1 个实心按钮。目录行顺序为「过滤 segmented → 主操作 → 12px + 1px 竖分隔 → 更多」，模板 / 快照导入导出 / 导出 HTML / 隐藏本机路径进「更多」或设置；菜单复用 `DropdownMenu`，支持 `Escape` 与点击外部关闭。细节见域 `shell-tightening`。
- **状态栏派生计数**：目录会话四态计数由 `visibleDirectoryCounts(root, filter)` 按过滤档从根节点聚合（`conflict` 恒 0），但状态栏本身不再渲染四态图例；代码双栏 Diff 只渲染「左换行 → 左编码 → 右换行 → 右编码」中实际存在的事实，左右相同只写一次，由纯模块 `workbench/probeStatus.ts` 按会话固化探测事实（`TextFileFacts`：path / encoding / newline / bytes / sha256，不存正文）产出，缺失侧 `—`，三向合并不渲染；不渲染平台名与教程句。
- **示例与调试 + 样本底座**：样本入口只在设置 →「示例与调试」（5 个 `data-sample-entry`：directory / code / csv / structured / remote-snapshot，复用 `load({ scene })` 与 `runSidesCompare(remoteSnapshotSides())`；调试失败项 `data-sample-failure` 由 `showDebugSamples` 门控），已有会话按会话 id 合并、失败保留；样本库在 `src/shared/fixtures/`（零 Electron / DOM 依赖）：嵌套 + 散乱目录树、代码 Diff 与多冲突块 3-way、1200+ 行乱序主键 CSV、乱序深层 JSON/YAML。
- **文案渲染期解析**：顶栏 / 三态 / 标签入参 / 通知 / 关闭确认 / 进度条 / 状态栏与图例 / 选择器与保存 `title` 全部经 `useI18n().t(key, params)` 取值，组件内无可见中文字面量；标题 / 副标题 / 统计标签由 `sessionDisplay.ts` 产出词典键 + 用户数据片段（统计用稳定角色 key），zh 值逐字沿用原界面，切语言不重挂载 / 不重扫 / 不新增会话。

## 验收

- **ac-shell**：`pnpm dev` 与 `pnpm dev:web` 均拉起完整壳层（顶部工具栏 + 中央分割工作区 + 底部状态栏）。
- **ac-tokens**：壳层与全部基础组件引用同一套 token（含差异语义色），组件内无硬编码颜色，字号 / 间距 / 圆角同源。
- **ac-three-states**：主屏空态、加载态、错误态均可见（空态以真实对比为主叙事并提供打开入口，错误态文案可读且可重试）。
- **ac-session-switch**：多会话可切换，切换后工作区内容与状态栏统计随当前会话更新。
- **ac-split-pane**：双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并场景呈三栏。
- **ac-cold-start-primary-cta**：冷启动首屏 action 区恰为「新建对比 / 打开文件 / 打开文件夹」，无 demo 按钮或以样本为主入口的叙事。
- **ac-open-two-files**：经系统选择器依次选两个真实文件后直接建立并进入文件对比会话（按类型落 code / csv / structured），未加载样本。
- **ac-open-two-dirs**：选两个真实目录建立目录对比会话，subtitle 展示这两个真实路径，内容来自真实文件系统。
- **ac-picker-cancel**：任一选择器取消后不建会话、不改变既有会话与视图。
- **ac-drop-two-paths**：拖入两个同类真实路径（两文件或两目录）落成与选择器打开同一会话模型并进入对比视图。
- **ac-drop-single-path**：拖入单个真实路径时作为左侧基准填入并提示选择右侧，现有会话不受影响。
- **ac-tabs-switch**：点击任一标签即成为活动会话，工作区随之渲染、状态栏「会话」值更新，标签列表与顺序不变。
- **ac-tab-close-clean**：关闭无未保存修改的会话立即移除标签、不弹确认；关闭非活动会话时当前活动会话与内容不变。
- **ac-close-active-neighbor**：关闭活动会话且仍有其他会话时自动激活相邻会话（优先后继，无后继取前一个），不出现空白工作区。
- **ac-close-last-empty**：关闭最后一个会话后回到空首屏（标签栏不渲染），随后可正常打开新会话，全程无刷新。
- **ac-close-dirty-prompt**：关闭 `dirty` 会话先出现确认提示，含会话标题与「未保存修改」语义及「继续编辑」「放弃修改并关闭」，此时会话未被移除。
- **ac-switch-keeps-edits**：A 有未保存修改时切到 B 再切回 A，工作文本与脏标记仍在且标签标记一致，随后关闭 A 触发未保存提示。
- **ac-close-parent-no-deadend**：关闭目录下钻文件会话的来源目录会话后该文件会话仍正常显示，点「返回上级目录视图」时有可用目录会话则切换、否则明确提示，均不出现空白视图。
- **ac-new-compare-always-visible**：空态与已有会话时顶栏都有可点击的「新建对比」，仅 `directoryBusy` 期间 disabled。
- **ac-dialog-three-actions**：点「新建对比」出现可访问名含「新建对比」的 `role="dialog"`，含左右路径输入与「打开文件」「打开文件夹」；两者分别触发两次 `selectFile` / `selectDirectory` 并落到既有 `openFilePair` / `runSidesCompare`。
- **ac-shortcut-open-close**：`Cmd/Ctrl+N` 打开对话框且重复按下不叠层；`Esc` 关闭后 `sessions` 与 `activeId` 不变；输入框内 `Cmd/Ctrl+A` 不被拦截。
- **ac-submit-enter**：输入框内 `Enter` 提交一次；提交进行中按钮 disabled 且再按 `Enter` 不发起第二个请求。
- **ac-manual-file-pair-session**：填入两个已存在文件路径提交后对话框关闭，会话数 +1，新会话 `scene === 'code'`、`activeId` 指向它、subtitle 含两侧绝对路径。
- **ac-error-not-found-inline**：右侧路径不存在时对话框保持打开，`role="alert"` 含「右侧」与原始路径，会话数不变、不新增 tab。
- **ac-failure-keeps-active-view**：已有会话在屏时提交失败，前后 `sessions` 长度、`activeId`、状态栏文本与当前视图内容一致。
- **ac-progress-ui-live**：发起目录对比并让摘要挂起时出现 `role="status"` 进度条，含「已扫描」「已处理」与「取消」；推进一个扫描批次后文件数变大，成功后进度条消失。
- **ac-ui-phase-copy**：进度条扫描相位含「正在扫描目录」与已扫描文件数，校验相位含「正在校验内容」与已校验文件数（相位内增量），两相位都展示累计已处理字节。
- **ac-cancel-keeps-ui-state**：取消后 `cancelOperation` 收到与 `digestFiles` 相同的 operationId；会话列表与顺序、`activeId`、状态栏统计、当前视图逐项不变且不新增标签，notice 含「已取消」且 tone 为 info，`busy` 复位，同一对目录可再次发起。
- **ac-cancel-clickable-during-scan**：扫描期间「取消」存在且 `disabled === false`，文档中 `[aria-modal="true"]` 数为 0；点击后 `cancelOperation` 恰好一次且参数为当前 operationId，进入 `cancelling` 态直到结束。
- **ac-dialog-cleared-when-scan-starts**：弹窗键入一对真实目录提交、首批扫描被挂住时，`queryByRole('dialog', { name: '新建对比' })` 为 `null` 且 `[aria-modal="true"]` 计数为 0。
- **ac-directory-tab-follows-new-roots**：先用目录 A 建会话再用 B 新建对比后，激活 tab 显示 B 的目录名与根路径，A tab 仍显示 A 的，互不污染。
- **ac-file-pair-title-derived**：两侧同名不同目录的文件对，tab 标题为该文件名、副标题含两侧完整路径；再开另一对同名文件时两 tab 各显示自己的路径。
- **ac-side-swap-follows**：目录会话换一侧目录成功后，可见 tab 副标题为新侧根路径 + 未改侧原路径，不残留被替换的旧侧路径。
- **ac-code-view-open-writes-session**：代码会话内「打开左文件」为新路径后 tab 标题 / 副标题立即更新，会话事实与工作副本路径均为新路径，切 tab 往返不回退。
- **ac-drilldown-tab-paths**：下钻 tab 标题为文件名、副标题为两侧真实路径；返回目录视图后目录 tab 副标题恢复根路径，下钻文案不残留。
- **ac-missing-side-kept**：一侧缺失的下钻会话副标题仍走既有缺失侧字典文案，标题只显示文件名、不出现内部 `::opencompare-missing-*` 后缀。
- **ac-async-commit-no-clobber**：一次读盘未返回期间另一会话完成提交，收尾后两会话都存在且文案各自正确，不出现旧快照覆盖或文案回退。
- **ac-inplace-refresh-sync**：同 id 原位刷新后 tab 保持原 id 与位置，标题 / 副标题为新结果的左右根路径，视图显示新对比树。
- **ac-multi-tab-isolation**：文件 / 目录 / 下钻会话并存时连续切换，每个 tab 标题与副标题只属于自己；关闭相邻 tab 后剩余文案不变。
- **ac-matrix-per-tab-title-subtitle**：矩阵每条断言分别读取 tablist 内该 tab 的标题与副标题元素做逐项相等比较，不得用整 tab 合并 `textContent` 包含判断或跨会话 `getAllByText` 代替。
- **ac-level-order**：ready 态 `[data-shell-level]` 顺序严格为 `app` → `sessions` → (`events`) → (`view-toolbar`) → `panels` → `status`，每级恰出现一次，`events` 仅在 notice 或扫描进度时出现且位于 `sessions` 之后、`view-toolbar` 之前。
- **ac-level-metrics-single-source**：每级高度 / 水平内边距 / 行内间距 / 控件高度取自同一布局表，三档渲染出的 class 与该表逐项相等且与窗口宽度无关。
- **ac-no-wrap**：三档下 `app` 与 `view-toolbar` 子树内无 `flex-wrap` 容器；1024 宽时 `events` / `sessions` / `panels` 级也不引入换行容器。
- **ac-fit-1024**：1024 / 1440 / 1920 三档对每个工具区，纯函数预算 `required ≤ available`（available = 窗口宽 − 该级左右内边距）均为真，并由渲染出的入口顺序与呈现模式复核。
- **ac-entry-manifest-complete**：布局模块声明的入口 id 集合与 18 条既有入口完全相等（多一条或少一条即红，不含 `samples` / `samples-menu`）；ready 态 DOM 中每个 id 恰出现一次且可见。
- **ac-statusbar-scene-facts**：状态栏只渲染当前场景的行数 / 条目度量与编码、换行事实（左右相同只写一次），不渲染会话 id、平台名、四态图例或教程引导；文字为 `text-2xs` + `tabular`，单行高度 ≤24。
- **ac-drilldown-unchanged**：下钻返回条仍在 `view-toolbar` 级首位、同档高度，点击回到父目录会话，文案键不变，往返后过滤 / 折叠 / 选中 / 双栏滚动保持。
- **ac-pure-module-pure**：截断规则以 `workbench/sessionTabText.ts` 导出，Node 可直接 import，模块链零 React / DOM / Electron，同一输入两次输出全等且幂等。
- **ac-budget-table-single-source**：每档最大 tab 宽度与标题 / 副标题列预算来自单一表（组件与测试共读），满足 `tabMaxWidthPx ≥ chromeWidthPx + (titleCols + subtitleCols) × columnPx`、三档单调增、compact 副标题预算为 0。
- **ac-compact-hides-subtitle**：1024 宽渲染含副标题的会话时 tab 内无副标题文本节点；1440 / 1920 下副标题存在且文本等于纯函数该档输出。
- **ac-tier-renders-pure-output**：固定 `window.innerWidth` 为 1024 / 1440 / 1920 各渲染一次含超长路径的会话，每个 tab 的标题与副标题逐字等于纯函数对应档输出。
- **ac-full-text-not-lost**：被截断的 tab 仍可通过 `title` 或 `aria-label` 取得未截断的完整标题（及副标题），截断不导致语义丢失。
- **ac-band-has-no-scroll**：`view-toolbar` band 的 class 仍为 `levelBandClasses('view-toolbar')` 全量 token，不含 `overflow-x-auto` / `min-w-0` / `flex-wrap`。
- **ac-view-toolbar-single-row**：每个视图的 `view-toolbar` 行容器恰 1 个（`viewToolbarRows(view) === 1`），行容器无 `overflow-x-auto`，行高 36px。
- **ac-narrow-960-controls-accessible**：960 宽渲染真实目录视图后 `filter` 入口命中 1 个、行内主操作可点击，其余声明动作在打开的「更多」菜单内可点击、未被 disabled 卸载。
- **ac-no-view-switcher-dom**：空态与有会话两态下 `tablist`「视图切换 / Switch view」均为 `null`，`app` 级内 `[role="tablist"]` 数量为 0。
- **ac-open-file-pair-scene-by-kind**：`openFilePairSession` 对两个 `.ts` 产 `code`、两个 `.csv` 产 `csv` 且两侧 `adhoc.tables` 就位、两个 `.json` 产 `structured` 且 `adhoc.format === 'json'`。
- **ac-open-file-pair-rejects**：`.json ↔ .yaml` 抛 `mixed-family`；未知扩展名的二进制内容（如含 NUL 的 PNG 字节）抛 `UNSUPPORTED_FILE_TYPE` 并带侧别 / 文件名；未知扩展名文本按 `code` 打开；两类拒绝都不产生 / 不替换会话。
- **ac-tab-shows-scene-type**：同屏 4 个会话时每个 `[data-session-tab]` 内唯一 `svg[data-icon]` 依次为 `folder-tree` / `file-code-corner` / `table-2` / `braces`，切换活动态不变。
- **ac-session-tab-drives-view**：点击 code / csv / structured / directory 会话 tab 分别出现对应模式的 `tablist`，取代原「视图切换」驱动的走查。
- **ac-no-topbar-samples**：空态与 ready 态顶栏都不存在 `samples` / `samples-menu` 入口，也查不到「加载演示样本」类按钮或菜单触发器。
- **ac-directory-toolbar-no-demo**：目录工具栏无「加载演示目录」「演示：远端快照」按钮，`DirectoryViewProps` 不再含 `onLoadSample` / `onLoadRemoteSnapshotSample`，`Workbench` 与 `PerfRunner` 无同名传参。
- **ac-settings-samples-five-entries**：打开设置（调试开关关闭）后 `[data-sample-entry]` 恰 5 个，分别对应目录 / 代码 3-way / CSV / JSON-YAML / 远端快照，不含失败项。
- **ac-settings-entry-starts-session**：点击 5 个入口任一后设置关闭，新增对应 `scene` 的会话（远端快照产 `directory` 且右侧为快照）并成为活动会话。
- **ac-open-pair-probe-facts**：用 4 组编码 / 换行各异的真实临时文件打开一对文件时，会话左右 `path / encoding / newline / bytes / sha256` 逐字段等于 `platform.probeTextFile` 结果，`pair.*.text` 等于其解码文本。
- **ac-drilldown-real-probe**：从真实目录树下钻代码文件后，会话左右事实等于对应真实路径的 `probeTextFile` 结果，左右独立、不随节点四态变化。
- **ac-status-four-entries**：代码双栏 Diff 状态栏按固定顺序出现「左换行 → 左编码 → 右换行 → 右编码」，值取自该侧固化事实字面量，条目位于 `status` 级内。
- **ac-status-missing-side**：一侧缺失时该侧两条目显示 `—`，另一侧显示真实探测值，不把空正文伪造成 `UTF-8` / `None`。
- **ac-status-edit-invariant**：逐块覆盖、编辑工作副本、重置、保存写回后四个值文本与编辑前逐字相等，读数不从 `codeBuffer` / `pair` 正文反推。
- **ac-gates-green**：`.munk/code-gates.json` 全量绿（`install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate`）。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异计算、行级与字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 一律不在本域；除目录会话四态计数（运行时按过滤档派生）外，视图统计与标签取自样本 answer key。
- **不做各视图内的对比 / 合并 / 保存业务**：合并结果保存、原位写回、快照导出归 `code-diff-merge` / `snapshot` 域；本域只提供会话 `dirty` 与壳层编排（导出经 `handleExportSnapshot` 调 `PlatformPort.saveFile`）。
- 不做 Electron 侧把样本落盘真实临时目录；不做增量同步、跨层级模板归位提取器、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析。
- 不做快捷键体系与命令面板（分栏拖拽在范围内）：只保留 `Cmd/Ctrl+N` 与对话框内 `Enter` / `Esc`，不做 `Cmd+W`、可配置键位。
- 不做路径输入增强：无最近打开、补全、历史、书签、字段级内联校验样式或 notice 改版；错误只用一行 `role="alert"` 且只展示 `compareRequest` 给出原因；不引路径沙箱 / 白名单，不做启动参数 / `opencompare://` 注入（归 `compare-request`）。
- 不做浅色主题成品与主题切换 UI；不做组件大全、HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。
- 会话标签只做切换 / 关闭 / 未保存提示：不做「保存并关闭」、关闭前自动保存、批量关闭、拖拽重排、右键 / 溢出菜单、`Cmd+W`、会话恢复 / 崩溃恢复 / 持久化。
- 进度与取消只覆盖目录对比：不做暂停 / 恢复 / 断点续传、取消确认对话框、取消后自动重试，不给快照导出 / 同步 / 模板 / 下钻加进度，不新增 main → renderer 进度事件通道。
- 弹窗 / 拖拽 / 工具区兜底不做连锁扩张：不改 `Dialog` 通用视觉与 `z-index`；不改扫描 / 哈希 / `digestFiles` / `cancelOperation` 语义；不改 band 与行高表、行数、控件集合；不引响应式断点类、隐藏菜单、运行时测量或新依赖；不加浏览器 / E2E / 截图测试。
- tab 截断不做连锁扩张：不加悬停预览 / 右键菜单 / 拖拽重排 / 数量上限；不改会话模型与派生语义（不冻结显示文案进数据），不新增 i18n key，不引第三方截断 / tooltip 组件；不做 < 1024 窄屏适配，不加长跑门禁。
- 不做 OS 级集成（Finder「打开方式」、命令行参数、macOS `open-file`、拖到 Dock）、单侧智能配对、多选批量选择、最近文件 / 收藏夹。

## 实现约束

- 技术栈由上游冻结、不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；Diff 用 `diff`(jsdiff)、3-way 用 `node-diff3`；不引第二套 UI 库 / 样式方案，等宽字体用系统栈、不引 web font。
- 分层硬约束：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM（ESLint 已强制）；renderer 只经 `PlatformPort`（`@shared/platform/types`）或纯数据 import 取样本，绝不直接 import Electron API；`PlatformPort` 现有契约语义不破坏（可扩展）。
- 视觉：token 唯一来源 `src/renderer/src/assets/main.css`；差异色一律 `--color-diff-*` 与 `DiffBadge` / `diffSemantics` 词汇，组件不写死颜色尺寸；视觉索引只写 change pack `ux/design-baseline.md`，不自己改 `.munk/baseline/**`。
- 布局表是排布唯一入口：`shellLayout.ts` 零 DOM / 零 Electron，至少导出「宽度 → 档位」「每级高度 / 内边距 / 间距 / 控件高度」「入口 id → level + slot + 三档呈现 + 宽度」「`measureToolbar`」；`useWidthTier` 是组件侧唯一读档入口（只监听 `resize`），视图 JSX 不自写尺寸；compact 折叠是「隐藏文本、保留按钮」，`icon-only` 须带同值 `aria-label`。
- 会话文案纪律：`describeSession` 保持纯函数、每次渲染现算，不深拷贝目录树或正文；`title` / `subtitle` 仅作兼容兜底；视图换文件只经 `onOpenSide` → `replaceFilePairSide` 一次提交；`sessions` 写入统一走函数式 `setSessions`，异步收尾不得用旧快照覆盖。
- tab 截断纪律：纯模块先行、单表 `TAB_TIER_BUDGETS`（组件与测试共读），不写第二份数字、不用 Tailwind 响应式前缀分档；省略符固定单个 `…`，裁剪只做首尾；`SessionTabs` 既有 props 与导出不变。
- scene 纪律：场景只由打开对象决定，禁止任何 scene 选择 UI；tab 图标只取 `SCENE_ICONS`；改顶栏控件必须同批改 `APP_ROW` 并保持三档 `measureToolbar(tier, 'app').fits === true`。
- 弹窗 / 进度 / 取消复用现有通道与 token：只用既有 `Dialog`（新增 `initialFocusRef`）、`ToolbarButton` 与 `main.css` token；`parseManualPaths` + `resolveCompareRequest` 是唯一校验入口，错误文案直接用 `error.message`；进度条复用 `formatBytes`，取消只调 `abort()` + `cancelOperation(id)`，成功后不 `upsertSession`、不切会话、不动状态栏。
- 文案与门禁：可见文案全走 `useI18n`（zh / en 成对、zh 逐字沿用原界面），新增含中文 UI 文案须登记进 `shellScan` 清单；门禁以 `.munk/code-gates.json` 为准，不新增长跑门禁、不弱化既有断言。
- 测试基座复用：沿用 `App.test.tsx` 的 `scriptedPort` / `dropPaths` / `sessionTabs` 与 `sessionDisplay` / `sessionStore` / `directoryCompare` 夹具，不新建测试基建；jsdom 零布局，三档断言用覆写 `window.innerWidth` 渲染真实 `Workbench`，不做像素测量。

## 最近交付证明

- WI：`wi_ws_5315d151d872f78c`（主界面布局收紧与视图修正，`kind: feature`）
- 日期：2026-11-05
- 结果：code_gates passed（29 gates，attempt 001；`pnpm test` 140 files / 2225 passed + 1 skipped / 2226）。
- 覆盖摘要：壳层层级压到 32 / 28 / 36 / 24 / 24 且只保留 1 行工具行（`CHROME_BASELINE_PX` 84）；目录行主操作收敛为 1 个实心按钮，模板 / 快照六向 / 导出 HTML / 隐藏本机路径进「更多」；`Panel` 头改可复制地址条并经 `PlatformPort` 注入剪贴板；状态栏删平台名 / 四态图例 / 教程句，只留场景度量与去重后的编码换行；会话模型、入口语义与四态口径未变。
- 注：`CompositionLegend` 仍在组件库中供其他场景使用，但不再进入 `Workbench` 状态栏；状态栏单行模型与壳层总预算分别见域 `status-bar-layout` / `shell-tightening`。

