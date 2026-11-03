# Domain: workbench

OpenCompare 的视觉基线（token + 基础组件）、多会话工作台壳层主屏，以及四大场景内置标准样本底座。业务算法（各类差异计算 / 合并求解）不属本域，见「非目标」。

## 范围

- **视觉基线（暗黑工业风，对标 Beyond Compare 5 Pro / VS Code / Linear 信息密度）**：单一 token 来源 `src/renderer/src/assets/main.css`（Tailwind v4 `@theme`）承载颜色（表面/文字/边框/主色/危险 + 差异语义色 相同/新增/删除/修改/冲突）、字号字重、间距、圆角、焦点环、动效；页面与组件只引用 token。基础组件：工具栏按钮 / 下拉、会话标签、面板容器、可拖拽分割窗格、空 / 加载 / 错误态、状态栏条目、树 / 列表行、等宽代码块与表格排版。
- **多会话工作台壳层（主屏）**：顶部工具栏（品牌图标 + `OpenCompare` 标题、`new-compare` / `open-file` / `open-folder` / `settings` 四个真实常驻动作；样本入口已整体迁入设置，无品牌副标题、无 scene 分段控件）、中央可拖拽双栏 / 三栏工作区、底部状态栏（当前会话标识 + 统计计数位）。会话模型「一个样本 / 一次打开 = 一个会话」，支持并存 / 切换，无会话时展示空态引导；空态 / 加载态 / 错误态三态可见。会话带 `dirty` 标记（由文件视图 `onDirtyChange` 上报）与可编辑工作副本（`CodeFileBuffer`），标签切换卸载后仍可重建。
- **壳层层级与尺寸档单一真源（`workbench/shellLayout.ts`，零 DOM / 零 Electron）**：固定五级 `app`（`h-11 px-3`）→ `sessions`（`h-9 px-3`）→ `events`（notice / 目录进度，仅在有内容时出现，`h-7 px-3`）→ `view-toolbar`（`h-7 px-2 py-0.5`）→ `panels`（Panel 标题 `h-8 px-2` + 内容 `py-2`）→ `status`（`h-8 px-3`）；高度 / 内边距 / 控件高度只取自该表（只用现有 Tailwind 档位与 `--radius-*`），表键集无窗口宽度维度，同一级三档恒定。三档宽度 1024（compact）/ 1440（regular）/ 1920（wide）由 `resolveWidthTier` 单表派生（`useWidthTier` 只在 resize 重算）；compact 只按表内优先级隐藏文本 / 次要副标题 / 图例文字（保留 `aria-label` 或 `title`），不移除入口。18 条入口集中在 `SHELL_ENTRIES`（`open-file` / `open-folder` / `new-compare` / `settings` / `filter` / `sync` / `template` / `snapshot-import` / `snapshot-export` / `report-export` / `drilldown-back` / `prev-diff` / `next-diff` / `override` / `save` / `merge-accept` / `export` / `tab-select`），`measureToolbar(tier, level, view)` 以 `required ≤ available` 复核；壳层各级带 `data-shell-level`、受覆盖入口带 `data-shell-entry` 作为三档断言钩子（无视觉表现）。会话 tab 类型图标取单一映射 `SCENE_ICONS: Record<SceneId, IconName>`。
- **视图工具区窄档横向滚动兜底**：目录工作台 `view-toolbar` band 自身只吃 `levelBandClasses('view-toolbar')`，三个行容器在 `levelRowClasses('view-toolbar')` 之外统一追加 `min-w-0 overflow-x-auto scrollbar-none`（保留 `shrink-0` / `h-7` / `gap-2`，控件 / 顺序 / 文案 / 行数不动）；`main.css` 的 `@utility` 区新增 `scrollbar-none`（`scrollbar-width: none` + `&::-webkit-scrollbar { display: none }`），只作用于这三行，保证 28px 行高不被全局滚动条吃掉；不引入响应式断点类。
- **会话 tab 标题 / 副标题命名与截断**：`describeSession` + `renderSessionText` 派生完整文本，截断只在组件内——纯模块 `workbench/sessionTabText.ts` 导出 `TAB_TIER_BUDGETS`（每档 `tabMaxWidthPx` / `chromeWidthPx` / `titleCols` / `subtitleCols` / `columnPx`，`subtitleCols: 0` 即该档不渲染副标题）与 `clipTail` / `clipPair` / `clipTitle` / `clipSubtitle` / `splitPairBudget`。单段裁尾输出「一个 `…` + 原文连续尾部」（保留扩展名）；`A ↔ B` 两侧保留尾部、预算均分（列差 ≤1）、` ↔ ` 必保留、任一侧不得为空；副标题超预算先丢弃 ` · <格式>` 后缀再裁路径；省略符固定 `…`（U+2026）。被裁 tab 把完整标题放在 `aria-label` / `title`，可见 span 带 `data-tab-part="title"|"subtitle"`。
- **会话标签生命周期**：可点击切换（工作区 / 状态栏随活动会话更新，顺序不变）、独立关闭按钮（可访问名「关闭 <会话标题>」，不触发切换）。无未保存修改直接关闭；`dirty` 会话先经 `Dialog` 确认（含标题与「未保存修改」语义，动作为「继续编辑」/「放弃修改并关闭」）。关闭活动会话优先后继、无后继取前一个；关闭最后一个回到空首屏。标签以可见圆点 + 可读文本标记 dirty；关闭时清理该会话的目录状态 / 滚动 / 合并计数 / CSV 对齐缓存。
- **会话文案由会话事实派生（单一真源）**：tab 标题 / 副标题在渲染期由会话当前事实派生——目录会话取 `directory.leftName/rightName` 与 `leftRoot/rightRoot`，文件会话取 `adhoc.pair`（两侧同名 → 文件名，否则 `左名 ↔ 右名`，副标题两侧完整路径）与 `delimiter` / `format`；内置样本按 session id 走字典键。任何换路径动作（目录换侧、视图内「打开左 / 右文件」、下钻、同 id 原位刷新）必须先落到会话事实（函数式 `setSessions`），视图局部 state 不是真源。
- **代码文件对原始探测事实 + 状态栏左右原始值（探测口径归 `text-probe`）**：`WorkbenchSession.probes` 为每侧 `TextFileFacts`（`path` / `encoding` / `newline` / `bytes` / `sha256`，不复制正文），只在「该侧换成新文件」时更新，编辑 / 保存 / 归一 / 切 tab / 下钻 / Diff↔合并往返都不得改写。唯一读盘入口 `openFilePairSession` 经 `probeTextFile` 一次取文本 + 事实（选择器 / 拖放 / 手工路径 / 启动注入共用）；目录下钻按真实路径探测、缺失侧不探测；快照侧读内联文本走 `probeTextString`（`/snapshots/**` 永不进 `probeTextFile`）。代码双栏 Diff 在状态栏追加四条目「左换行 → 左编码 → 右换行 → 右编码」（值用技术字面量 `CRLF/LF/CR/Mixed/None`、`UTF-8/UTF-8 BOM/UTF-16LE/UTF-16BE/GBK/Unknown`，缺失侧 `—`，三向合并不渲染），读数只由 `workbench/probeStatus.ts` 纯函数按「会话事实 + 是否双栏 Diff」产出，不读 `codeBuffer` / `pair.text` / `composition`。
- **冷启动真实入口**：空态主操作区恰为「新建对比 / 打开文件 / 打开文件夹」三个真实 CTA；后两者经 `selectFile` / `selectDirectory` 选定即建会话（文件对按 `fileKinds.classifyFile` 进 code / csv / structured，目录对走目录会话），全程不依赖样本。
- **顶栏常驻「新建对比」与手工路径直传**：空态与已有会话时都渲染（仅 `directoryBusy` 期间 disabled）。点击或 `Cmd/Ctrl+N`（非 macOS 为 `Ctrl+N`，对话框已开不叠层）打开 `role="dialog"`：左右路径输入 + 文件 / 文件夹选择器 + 建立对比；`Enter` 提交、`Esc` 关闭、初始焦点在左输入框、编辑快捷键不被拦截、提交中按钮 disabled。唯一校验入口是 `@shared/compareRequest` 的 `parseManualPaths` + `resolveCompareRequest`（`homeDir` / `baseDir` 显式注入，probe 走 `statPath`），通过后只按 `kind` 路由到 `openFilePair` / `runSidesCompare`，成功按 `upsertSession` 新增或复用（同路径对不产生第二个 tab）。目录对在扫描开始前即关闭对话框（`runSidesCompare` 入口一处状态调用），确保扫描期页面无 `aria-modal`；路径类失败只在对话框内一行 `role="alert"` 展示且不建 tab，构建期错误落 notice。
- **启动注入请求落地（契约归 `launch`）**：挂载时经 `PlatformPort.onCompareRequest` 订阅一次、卸载退订，注册后调 `compareRequestsReady()`；成功 payload 走既有 `openCompareRequest`，失败只走 notice，不建空 tab；端口缺这两项能力等价于「无注入」且不报错。
- **目录对比进度与取消（壳层编排，按相位分段文案）**：每次发起的目录对比生成 `operationId` + `AbortController`，`signal` 透传核心、`operationId` 透传 `digestFiles`；壳层显示常驻 `role="status"`（`aria-label="目录对比进度"`）——扫描相位「正在扫描目录 + 已扫描 N 个文件」（流水线累计），校验相位「正在校验内容 + 已校验 M 个文件」（相位内增量）+「累计 N 个文件」，两相位都展示「已处理 X」（累计字节，复用 `formatBytes`），并提供「取消」；取消先 `abort()` 再 `platform.cancelOperation(id)`（后者失败只忽略），点击后到 settle 前 disabled。取消后进度条消失、`directoryBusy` 复位、notice（`info`）含「已取消」，会话 / 标签 / 状态栏 / 视图逐项不变（只有成功才 `upsertSession`）；空闲不渲染进度条与取消按钮。
- **跳过提示与符号链接下钻（容错归 `io-tolerance`，符号链接归 `symlink-semantics`）**：`leftSkipped + rightSkipped > 0` 时复用 notice（`info`，`text-diff-added`）显示「已跳过：左 X / 右 Y」，两侧为 0 不显示、不显示合并总数；快照导出成功提示在 `skipped > 0` 时追加「跳过 N 个不可读项」。指向文件的链接双击走既有 `openFile` 读取目标正文；`linkTargetKind === 'directory'` 只报 info 提示、不读盘、不建会话。
- **内置标准样本底座（`src/shared/fixtures/`，零 Electron / DOM，纯数据 + 纯函数）**：场景 A 嵌套双目录树 + 跨层级散乱树；场景 B 双栏 Diff 文本对 + base/ours/theirs 多冲突块 3-way；场景 C 1,200+ 行乱序主键含增删改与列偏移的 CSV/TSV；场景 D 键序打乱含深层嵌套键值增删改与类型变化的 JSON/YAML。经 `loadSampleSessions` 生成会话，样本库只读。
- **设置 →「示例与调试」分区（`SettingsDialog`）**：5 个 `data-sample-entry`（`directory` / `code` / `csv` / `structured` / `remote-snapshot`）复用既有 `load({ scene })` 与 `runSidesCompare(remoteSnapshotSides())`，点击先关对话框再起会话；「演示：样本读取失败」只在 `showDebugSamples`（生产注入 `import.meta.env.DEV`，默认 false）为真时渲染，用独立 `data-sample-failure` 标识、不计入 5 个入口。已有会话时样本加载按会话 id upsert / 合并（真实会话、顺序与活动会话不变），失败保留现有会话并报错。
- **真实路径拖入窗口**：恰好 2 个同类路径（两文件 / 两目录）直接建同一会话模型；1 个路径作左侧基准填充 + info 提示；>2 个或文件目录混合明确提示、不建会话、不改既有会话；阻断默认导航，真实绝对路径经平台缝解析，renderer 不猜路径。
- **顶栏 / 目录工作流 / 空态去 demo**：顶栏不渲染 `samples` / `samples-menu`，品牌区只有图标 + 标题（`shell.header.brandSubtitle` 已删）；`DirectoryView` 工具栏删除演示入口与 `onLoadSample` / `onLoadRemoteSnapshotSample` props，真实入口与三行结构不变。
- **壳层文案渲染期解析（词典归 `i18n`）**：顶栏、空 / 载入 / 错误态、会话标签入参、通知条、关闭确认对话框、进度条、状态栏与 `CompositionLegend`、选择器 / 保存对话框 `title` 全部经 `useI18n().t(key, params)`；统计条目为稳定角色 key；`fileKinds.label` 为稳定文件族标识（`code` / `csv` / `tsv` / `json` / `yaml`），错误带 `mixed-family` / `unsupported-type` code 由外壳本地化；zh 值与原界面逐字一致，切换语言不重挂载、不重扫目录、不新增会话。
- **对标参照审计**：壳层六层归属与 18 条入口的「保留 / 合并 / 降级到菜单 / 明确不做」判定归 `domains/ui-reference-audit`；`SHELL_ENTRY_IDS` / `SHELL_ENTRIES` / `SHELL_LEVEL_ORDER` 是那份审计的唯一事实源，改壳层结构前须先读对应行判定。

## 验收

- **ac-shell / ac-tokens / ac-three-states**：`pnpm dev` 与 `pnpm dev:web` 都能拉起完整壳层（顶栏 + 分割工作区 + 状态栏）；组件统一引用 token、无硬编码颜色；空 / 加载 / 错误三态可见且错误可重试。
- **ac-load-fixtures / ac-four-scenes / ac-fixtures-tests**：设置里 5 个入口可加载对应样本并起会话；四大场景样本齐备；`src/shared/fixtures/` 有 vitest 校验完整性（CSV ≥1200 行、3-way 冲突块 ≥2、目录层级 ≥3、JSON/YAML 深层变更）。
- **ac-session-switch / ac-split-pane / ac-gates-green**：多会话多视图可切换且状态栏随活动会话更新；双栏 / 三栏可拖拽且三向合并为三栏；`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全绿。
- **ac-cold-start-primary-cta / ac-open-two-files / ac-open-two-dirs / ac-picker-cancel / ac-samples-auxiliary**：空态 action 恰为三个真实 CTA 且无 demo 叙事；选择器打开两文件 / 两目录即建会话（内容来自真实文件系统）；取消选择器不建会话；样本入口只在设置分区出现。
- **ac-drop-two-paths / ac-drop-single-path / ac-drop-invalid / ac-drop-no-navigate**：两个同类路径拖入建同一会话模型；单路径作左栏填充 + 提示；>2 或混合类型明确提示不建会话；拖入不触发导航 / 重载。
- **ac-sessions-not-overwritten / ac-tabs-switch / ac-tab-close-clean / ac-close-active-neighbor / ac-close-last-empty**：连续打开新增独立会话不覆盖；点击标签切换且顺序不变；无脏关闭立即移除；关闭活动会话优先后继否则前一个；关闭最后一个回空首屏并可继续打开。
- **ac-close-dirty-prompt / ac-close-dirty-cancel / ac-close-dirty-discard / ac-dirty-marker-on-tab / ac-switch-keeps-edits / ac-no-stale-dirty**：脏会话关闭先确认（含标题 + 未保存语义 + 两个动作）；「继续编辑」保留内容与标记；「放弃」按邻居规则移除；标记可读且保存 / 重置后消失；切走再切回保留工作文本与标记。
- **ac-tab-switch-keeps-buffer / ac-samples-load-keeps-sessions / ac-close-parent-no-deadend**：切 tab 保留工作副本与脏标记；样本按 id 合并、真实会话与顺序不变；关闭来源目录会话后下钻会话仍可显示并在返回时落到可用目录或提示。
- **ac-new-compare-always-visible / ac-dialog-three-actions / ac-shortcut-open-close / ac-submit-enter / ac-no-native-dialog-on-submit**：空态与有会话时顶栏都有新建对比（仅 `directoryBusy` disabled）；对话框含两个输入与两个选择器动作；`Cmd/Ctrl+N` 不叠层、`Esc` 关闭、编辑快捷键不被拦截；提交中不可重复提交；手工提交不调 `selectFile` / `selectDirectory` / `saveFile`。
- **ac-manual-file-pair-session / ac-manual-directory-pair-session / ac-manual-quoted-whitespace / ac-manual-tilde-relative / ac-adds-tab-keeps-existing / ac-repeat-submit-single-tab**：手工路径建对应会话（subtitle 含两侧绝对路径）；成对引号与首尾空白被剥离；`~/…` 与相对路径按 `resolveCompareRequest` 规范化；新会话不扰动既有 tab；同一对路径只留一个 tab。
- **ac-error-not-found-inline / ac-error-empty-inline / ac-error-type-mismatch-inline / ac-error-unsupported-inline / ac-error-mixed-family-inline / ac-failure-keeps-active-view / ac-invalid-path-stays-inline**：路径类失败只在对话框内一行 `role="alert"` 展示（含对应侧与原因），弹窗保持打开、不建 tab、会话与视图不变、不进入扫描。
- **ac-drag-drop-regression / ac-drilldown-return-regression**：拖入两同类路径仍按既有链路建会话；下钻后返回保持过滤 / 折叠 / 选中。
- **ac-progress-ui-live / ac-cancel-keeps-ui-state / ac-progress-cancel-idle / ac-ui-phase-copy / ac-ui-no-regress**：进度条文本按相位（扫描 / 校验）显示累计与相位内计数、累计字节；推进批次后计数增大、成功后消失；取消后会话 / 活动标签 / 状态栏 / 视图逐项不变、notice 含「已取消」且 info、可再次发起；空闲不渲染；相位切换时累计值不回退（「1,383,203 → 960」形态必须失败）。
- **ac-dialog-cleared-when-scan-starts / ac-progress-visible-unobstructed / ac-cancel-clickable-during-scan / ac-cancel-keeps-workbench / ac-picker-entry-also-unobstructed / ac-picker-cancel-keeps-dialog**：扫描期 `aria-modal` 计数为 0、进度条不在任何模态内、「取消」`disabled === false` 且一次点击只调一次 `cancelOperation`（参数等于进行中的 id）；取消前后会话页签、状态栏、主区全等；弹窗内选择器路径同样覆盖；选择器返回 `null` 时弹窗不关。
- **ac-shell-levels-single-source / ac-width-tiers / ac-entries-set-exact / ac-toolbar-budget**：`SHELL_LEVEL_ORDER` 五级各出现一次、高度 / 内边距取自表；三档 `measureToolbar(...).fits === true` 且 `required ≤ available`；18 条 `SHELL_ENTRIES` 与 `data-shell-entry` 集合完全相等（`samples` / `samples-menu` 不在其中）；compact 只隐藏文本、保留 `aria-label` / `title`，不移除入口。
- **ac-view-toolbar-scroll-fallback**：目录三行容器统一带 `min-w-0 overflow-x-auto scrollbar-none`，band 不加溢出类；960–1920 下三行控件可横向滚动到达且可点击，1440 / 1920 / 2560 不触发溢出；`scrollbar-none` 只在 `@utility` 区一份。
- **ac-tab-title-truncation / ac-tab-pair-budget / ac-tab-full-text-aria**：`TAB_TIER_BUDGETS` 是唯一预算表（组件与测试同读），`clipPair` 两侧列差 ≤1、分隔符保留、任一侧非空；副标题先丢 ` · <格式>` 再裁；被裁 tab 的 `aria-label` / `title` 仍是完整文本，`data-tab-part` 钩子稳定。
- **ac-session-copy-single-source / ac-cross-scene-tab-matrix**：tab 文案由会话事实派生（换侧 / 下钻 / 原位刷新后同帧一致）；App 级矩阵覆盖「路径 A→B」「视图内换侧」「下钻后返回」「三类会话并存」四种场景，对 tablist 内每个 tab 读 `aria-label` 拆标题 / 副标题逐项比较，且不包含其它会话路径片段。
- **ac-code-probe-facts / ac-statusbar-probe-entries / ac-snapshot-probe-path**：`probes` 只在该侧换文件时更新，编辑 / 保存 / 切 tab 不改写；唯一读盘入口 `probeTextFile`，快照侧走 `probeTextString`；代码双栏 Diff 追加四条目（固定顺序、缺失 `—`、三向合并为空），值不本地化；CSV / 结构化视图不接探测。
- **ac-first-screen-no-sample-path / ac-settings-sample-entries**：首屏与全部 `[title]` 无 `/samples` 路径，三类样本入口 DOM 命中为 0；设置 5 条 `data-sample-entry` 顺序稳定，调试失败项只在 `showDebugSamples` 下渲染。
- **ac-scene-from-open-object**：scene 只由打开对象决定（`createDirectorySession` → `directory`，`openFilePairSession` 按 `classifyFile` → `code` / `csv` / `structured`，下钻写 `parentDirectoryId` 与前缀）；无 scene 选择 UI、无内容嗅探、不改 `classifyFile` 拒绝语义；tab 图标只取 `SCENE_ICONS`。
- **ac-i18n-render-time / ac-shell-copy-scan**：组件内无可见中文字面量，全部经 `useI18n().t(...)`；新增含中文的 UI 文件必须登记进 `shellScan.test.ts` 的 `SHELL_COPY_FILES`；zh 值与原界面逐字一致，切换语言不重挂载、不重扫。

## 非目标

- **不做任何对比 / 合并算法**：目录树差异、行级 / 字符级 Diff、3-way 冲突求解、CSV 主键对齐、JSON/YAML 语义 diff 均不在本域；视图只读呈现内容（目录会话四态计数由运行时结果按过滤档派生，归 `directory`）。非目录视图的状态栏计数仍取自样本 answer key。
- **不做各视图内的对比 / 合并 / 保存业务**：合并结果保存、原位写回、快照导出归 `code-diff-merge` / `snapshot`；本域只提供会话 `dirty` 字段与壳层编排。
- 不做增量同步、跨层级模板归位、远端 FTP / SFTP、Hex 二进制对比、`.xlsx` 解析、Electron 侧把样本落盘真实临时目录。
- **不做快捷键体系与命令面板**：只保留 `Cmd/Ctrl+N` 与对话框内 `Enter` / `Esc`；不做 `Cmd+W`、可配置键位。
- **不做路径输入增强**：无最近打开 / 补全 / 历史 / 书签 / 内联校验样式；对话框错误只用一行 `role="alert"`，直接用 `compareRequest` 的中文原因，不另造错误码；不引入路径沙箱 / 白名单。
- 不做浅色主题成品与主题切换 UI；不做组件大全与 HTML 设计稿。
- 不做打包分发、签名、公证、自动更新、CI 发布。
- **会话标签只做切换 / 关闭 / 未保存提示**：不做「保存并关闭」、批量关闭、拖拽重排、右键菜单、溢出菜单、会话恢复 / 持久化；不做 tab 悬停预览、数量上限或合并。
- 不做 OS 级集成（Finder「打开方式」、命令行参数、`open-file`、拖到 Dock）；不做单侧智能配对、多选批量选择。
- **进度与取消只覆盖目录对比**：不做暂停 / 恢复 / 断点续传、取消确认对话框、取消后自动重试，不给快照 / 同步 / 模板 / 下钻加进度，不新增 main → renderer 进度通道（进度由核心批次结算在 renderer 汇总）。
- **窄档兜底不做连锁扩张**：不改 band 表 / 行数 / 控件集合 / `@theme` token / 既有 `@utility` 声明，不引入断点类、隐藏菜单、运行时测量或新依赖；不改对比 / 合并算法、视图模型、目录扫描与哈希、快照格式、`ToolbarButton` / `SegmentedControl` / `CompositionLegend` 内部实现；不碰发布面；不加浏览器 / E2E / 截图测试。
- 不删改内置样本、不重构 `loadSampleSessions`；不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈冻结：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind v4 + Lucide；不引入第二套 UI / 样式方案；等宽字体用系统栈，不引入需网络的 web font。
- 分层：`src/core/` 与 `src/shared/fixtures/` 零 Electron / DOM 依赖；renderer 只经 `PlatformPort` 或纯数据 import，绝不直接 import Electron API。
- **布局表是排布唯一入口**：`shellLayout.ts` 导出「宽度 → 档位」「每 level 尺寸」「入口 id → 呈现模式 / 宽度」「`measureToolbar`」；`useWidthTier` 是组件侧唯一读档入口；compact 折叠是「隐藏文本、保留按钮」，`icon-only` 必须带与词典同值的 `aria-label`；折叠优先级写在常量里，不散落进 JSX。改顶栏控件集合必须同批改 `APP_ROW` 预算。三档断言用 `// @vitest-environment jsdom` 覆写 `window.innerWidth` 渲染真实 `Workbench`。
- **scene 归属纪律**：场景只由打开对象决定，禁止再引入任何 scene 选择 UI（分段控件 / 菜单 / 快捷键都算）；tab 图标只取 `SCENE_ICONS`，测试用 `[data-session-tab]` / 会话 tablist 定位。
- **text 截断纪律**：`workbench/sessionTabText.ts` 零 DOM / 零 Electron，档位复用 `shellLayout` 的 `WidthTier` / `resolveWidthTier`；预算只允许一处表（组件与测试同读），`SessionTabs` 内不得写死第二份数字，也不用 Tailwind 响应式前缀做档位分支；省略符固定单个 `…`，只做首尾裁剪；jsdom 无布局，视觉保证由「预算表宽度上界 + `min-w-0 truncate`」承担。
- **新建对比** 只用既有 `components/Dialog`（新增 `initialFocusRef` 把焦点放到左输入框）、`ToolbarButton` 与 token；`parseManualPaths` / `resolveCompareRequest` 是唯一校验入口，renderer 不另写解析 / 规范化 / 错误码，错误文案直接用 `error.message`；会话创建只复用 `openFilePair` / `runSidesCompare`，`upsertSession` / `activeId` 状态机不改。
- **关闭时机只提前、不抬层级**：在 `runSidesCompare()` 进入扫描前清掉 `compareDialogOpen`（一处状态调用即覆盖键入与弹窗内选择器两条路径，并天然保留「选择器取消时弹窗不关」）；关闭必须晚于路径校验与探测；不得把 `Dialog` 遮罩抬到进度条之上或改成非模态（AC 要求扫描期 `aria-modal` 计数为 0）。
- **进度 / 取消复用现有通道与 token**：进度条复用 `formatBytes` / `ToolbarButton` / 状态栏与 `notice` 语义 token（`bg-surface-sunken` / `border-line-subtle` / `text-content-*` / `bg-accent`），不新建页面、不改布局层级、不用硬编码颜色；取消路径只调 `controller.abort()` + `platform.cancelOperation(id)`，成功后不 `upsertSession`、不切会话、不动状态栏。
- **会话文案派生纪律**：`describeSession` 保持纯函数、每次渲染现算，不深拷贝目录树或正文；`title` / `subtitle` 保留作兼容但不再作为 tab 文案唯一来源；视图内换文件只经 `onOpenSide(side, picked)` 回写会话（同一次提交落地），不得另开同名 tab；`sessions` 写入统一走函数式 `setSessions`，异步收尾不得用闭包旧快照整体覆盖；编辑按键时不额外深拷贝正文。
- **探测通道纪律**：代码文件对读盘只能走 `probeTextFile`（快照侧 `probeTextString`），CSV / 结构化不走探测；`probeStatus` 只读会话事实，不读缓冲区；`CodeView` 的 mode 必须由壳层按会话持有（`codeModes` + `onModeChange`），只用组件内 `useState` 会在 tab 重挂后重现陈旧状态栏。
- **文案与测试落位**：新增 UI 文案 zh / en 成对且 en 零汉字；含中文的 UI 文件登记 `SHELL_COPY_FILES`；测试复用 `App.test.tsx` 的 `scriptedPort` / `dropPaths` / `sessionTabs` 与 `sessionDisplay.test.ts` / `sessionStore.test.ts` 既有夹具，不新建测试基建；视觉 / 交互不做像素量测。

## 最近交付证明

- WI：`wi_ws_424fd8747601b2c8`（**代码文件对打开链路接入探测事实 + 状态栏左右原始值**，`kind: feature`；`needSelfTest=false`）
- 日期：2026-11-02
- 结果：`code_gates` passed（22 gates，attempt 001，`.munk/runs/run_ws_101a350f511e5629/code-gates/attempts/001`）；`pnpm test` 119 files / 1869 passed + 1 skipped（1870）。本 change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），验收落档在 `qa/open-pair-probe-status.md`。
- 覆盖摘要：① **会话事实**——`session.ts` 新增 `FilePairProbes` 与 `WorkbenchSession.probes`（每侧 `TextFileFacts`，不含正文），`shared/platform/types.ts` 导出 `TextFileFacts = Omit<TextFileProbe,'text'>`。② **唯一读盘入口**——`openFilePairSession` 对代码对改走 `platform.probeTextFile` 一次取文本 + 事实（CSV / 结构化仍 `readTextFile`），四条入口共用；`replaceFilePairSide` 只在换开侧带 `facts` 时替换该侧事实；`CodeView`「打开左 / 右文件」改走 `pickProbedTextFile`。③ **下钻**——`openDrilldownSession` + `snapshotOps.readSideFileProbe`：真实路径探测、快照挂载侧走 `probeTextString`（内存 UTF-8 同口径）、缺失侧不探测。④ **样本**——`loadSampleSessions` 的 code 分支构建期按 `CODE_SCENE.diff` 各算一次事实。⑤ **状态栏**——零 DOM / 零 React 的 `workbench/probeStatus.ts`（`codeProbeStatusEntries(probes, diffVisible)` 固定四序、缺失 `—`、非双栏 Diff 返回空），`Workbench` 以按会话的 `codeModes` 接收 `CodeView` 上报模式，在 `status` 层渲染四条目；`shell.status.{left,right}{Newline,Encoding}` zh / en 成对、值不本地化。⑥ **测试债**——`.munk/baseline/test-debt.json` 的 `growth[]` 声明 `repoTestLines 42930 → 43329`、`repoTestCases 1373 → 1407`（+34），未改其余口径。
- 注：① **被推翻的假设**：「代码文件对打开 = `readTextFile`」不再成立——改为 `probeTextFile` 后，所有以 `readTextFile` 打桩的既有断言会静默失去覆盖（符号链接下钻正文、慢读盘竞态 gate、i18n 读失败、`App.ruler` 零 IO 计数），本轮已逐处改到 `probeTextFile` 并加入 ruler 的 IO channel 名单；后续任何新增代码对读盘都必须走探测通道。② **模式可见性是状态栏前提**：`CodeView` 的 mode 必须由壳层按会话持有，组件内 `useState` 会在 tab 卸载重挂后让合并视图重新显示左右值。③ 快照侧**永不**用 `/snapshots/...` 调 `probeTextFile`；CSV / 结构化视图不接探测（`adhoc.tables` 依赖纯 UTF-8 读）。④ `ac-statusbar-unchanged` 已按本项改为「既有条目不变 + 代码双栏 Diff 追加四条目」，不要以「状态栏条目集合绝对不变」为由隐藏新值。
