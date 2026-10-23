# Domain: i18n

renderer 双语（zh / en）链路：五个表面的成对词典、`I18nProvider` / `useI18n()` 语言上下文、首启语言解析的纯函数与只读 loader、两个测试辅助（`renderWithI18n`、中文硬编码扫描器），以及**应用外壳接入**——`App` 启动解析 + Provider 挂载、工作台壳层 / 新建对比 / 共享展示组件的可见文案、会话标题·副标题·统计标签的渲染期解析，再到**文件级视图接入**——`views/CodeView`（双栏 Diff 与三向合并）、`views/CsvView`、`views/StructuredView` 的可见文案、通知与平台对话框 `title`，`components/DiffPane|MergePane|CodeBlock` 核对无文案后仅纳入扫描清单。平台侧设置读写与系统语言通道（`readUserSettings` / `writeUserSettings` / `systemLocale`）归 `foundation` 域，本域只消费其契约；目录视图（`views/DirectoryView`、`DirectorySyncDialog`、`TemplateDialog`、`TreeView`、`SplitPane`、`Panel`、`SegmentedControl`）与设置面板的语言切换 UI 归后续 WI。

## 范围

- **renderer 词典与 i18n 模块（`src/renderer/src/i18n/`）**：`messages/zh/{common,shell,directory,files,settings}.ts` 与 `messages/en/{…}.ts` **同名成对**；`messages/index.ts` 固定聚合五个表面，对外只暴露合并后的 `zh` / `en` 词典与 `messages: Record<Language, …>`。
- **zh 为键的单一事实源**：键用命名空间点号（`common.cancel`、`shell.empty.title`、`settings.language` 这类形状）；`en` 每个文件用 `Record<keyof typeof zh同类, string>` 声明，缺键 / 多键在 `pnpm typecheck` 报错。底座 WI 只放各表面通用键（语言名 `English` / `简体中文`、公共确定 / 取消 / 关闭 / 错误外壳等）；外壳接入 WI 在此基础上成对补齐工作台壳与新建对比的键（`common` 27 键 / `shell` 128 键）。
- **`I18nProvider` + `useI18n()`**：值形状 `{ language, setLanguage, t }`；`t(key, params?)` 只支持 `{name}` 简单字符串插值（单一正则，缺失占位符原样保留，值里的标记按纯文本返回）；词典值只允许字符串，不接受 HTML / React 节点。
- **无 Provider 回落**：`useI18n()` 在 Provider 外不抛错，返回 `language: 'zh'` 与 zh 的 `t`，保证既有叶组件单测断言不变；生产入口 `App.tsx` 已在首启解析完成后挂载 Provider（语言值只作 `initialLanguage`）。
- **首启语言解析（纯函数 + 薄 loader）**：`resolveInitialLanguage({ storedLanguage, systemLocale })` 为纯函数——`storedLanguage` 为 `zh` / `en` 时以记录为准；无记录（`null` / `undefined` / 非法值 / 空串）时 `systemLocale` 以 `zh` 开头（大小写不敏感，覆盖 `zh`、`zh-CN`、`zh-Hant`、`ZH-cn`）→ `zh`，其余（`en-US`、`fr-FR`、`''`、未知）→ `en`。`loadInitialLanguage(platform)` 只调用 `platform.readUserSettings()` 与 `platform.systemLocale()` 后交给该纯函数，**从不写记录**（读失败按无记录处理，不抛）。
- **测试辅助（`testing.tsx`）**：`renderWithI18n(ui, language?)` 在 `I18nProvider` 下渲染，允许强制 `zh` / `en`，默认 `zh`。
- **中文硬编码扫描辅助（`src/shared/i18n/scanHardcodedChinese.ts`）**：接受显式路径清单（文件或目录，目录递归取源码文件），返回 `{ file, line, text }` 命中；`\p{Script=Han}` 直接匹配源码文本（注释、`aria-label`、`title`、`data-testid` 不豁免），支持排除 `*.test.*` 与 `i18n/messages/**`。外壳接入 WI 起用于本域显式清单的 0 命中断言。
- **启动接线（`src/renderer/src/App.tsx`）**：启动时用 `loadInitialLanguage(platform)` 解析语言（记录优先；无记录时 `zh*` 系统语言 → 中文，其余 → 英文），解析期间只渲染**无文字的品牌引导帧**（仅图标 / 骨架，无文本节点、无 heading / button / tablist），settle 后以解析结果作为 `I18nProvider` 的 `initialLanguage` 挂载 `<Workbench platform={platform} />`，工作台只挂载一次（平台订阅与 `compareRequestsReady` 各一次，不出现先中文后英文两批渲染）。语言值**只**作为 `initialLanguage` 传入，不得作为 `Workbench` / 视图的 React `key`（切语言不重挂载）。`?perf=1` 的测量窗口分支保持同步直渲：不读设置、不挂 Provider、不加启动门。
- **工作台外壳可见文案（`workbench/Workbench.tsx`）**：顶栏（品牌副标题、视图切换 `aria-label` 与四个视图标签、`新建对比 / 打开文件 / 打开文件夹 / 加载演示样本 / 演示样本` 及其 `title`、演示样本下拉含「加载全部演示样本」/ 各演示项 / 读取失败项）、空态 / 载入态 / 错误态（`StateView` 的 title / description / hint / 动作按钮与重试）、会话标签条入参、通知条（拖拽单项与多项、取消、已跳过、快照导出 / 导入结果、下钻不支持、符号链接指向目录、返回上级目录的两种结果、`来源目录对比：…` 行）、关闭未保存修改确认对话框（标题 / 描述 / 两按钮 / 正文说明）、目录对比进度条（`role="status"` 的 `aria-label`、阶段文案、已扫描 / 已校验 / 累计三个计数句、已处理字节、取消按钮与取消完成通知）、状态栏标签（会话 / 运行平台）与 `CompositionLegend` 差异语义标签、平台选择器与保存对话框 `title`（`selectFile` / `selectDirectory` / `saveFile`）。全部在渲染期经 `t(key, params)` 取当前语言。
- **会话显示渲染期化（`workbench/sessionDisplay.ts`）**：新增 renderer 侧纯函数（不 import DOM / Electron），输入 `WorkbenchSession` 输出 `{ title, subtitle, stats: readonly { key, value, tone? }[] }` 的 key + 参数片段；分支只按会话**身份**（样本 id、`scene`、`adhoc`、`directory`、`sides`）决定，不读 `session.stats[i].label`。四个内置样本（`session-directory` / `session-code` / `session-csv` / `session-structured`）的标题 / 副标题改为词典键，**离线（无运行时会话对象）不得直接展示 fixture 中文标题 / 副标题**；运行时会话标题 / 副标题由两侧名称 / 真实根路径 / 文件名组成（用户数据不翻译）+ 本地化文件类型名；统计条目改为稳定角色 key（源文件 / 目标文件 / 差异 / 左行数 / 右行数 / 冲突块 / 主键列 / JSON 节点 / 样本文件），值仍取会话现有数值，代码视图冲突数覆盖按稳定统计 key 判断；下钻「某侧缺失」用稳定侧标记，渲染期取词典文案。
- **新建对比对话框（`workbench/NewCompareDialog.tsx`）**：标题 / 描述 / 左右路径标签 / 两个输入占位 / `Enter 提交 · Esc 关闭` 提示 / `取消` / `建立对比` / 打开文件与打开文件夹按钮及其 `title` 全部走词典；校验失败按 `compareRequest` 的稳定错误码（`MISSING_SIDE`、`DUPLICATE_SIDE`、`EMPTY_PATH`、`UNKNOWN_SCHEME`、`UNKNOWN_ACTION`、`NOT_FOUND`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE`、`ACCESS_DENIED`）取当前语言文案并保留路径 / 名称参数（`parseManualPaths` / `resolveCompareRequest` 本身不改）；`role="alert"` 外壳始终当前语言，未知底层 I/O 失败只允许错误**详情**沿用原始 message。
- **共享展示组件文案**：`Dialog` 关闭按钮可访问名；`SessionTabs` 的 `tablist` 可访问名、未保存修改标记（`title` + `sr-only`）、关闭按钮可访问名（`关闭 {title}` → en `Close {title}`）；`StatusBar` / `DiffBadge` / `diffSemantics` 的差异语义标签改为 `DIFF_LABEL_KEYS: Record<DiffStatus, MessageKey>`，`CompositionLegend` 与 `DiffBadge` 渲染期解析，`DIFF_STATUSES` 与颜色类不变。`StateView` 自身不含文案，不改。
- **文件类型稳定标识（`workbench/fileKinds.ts` 最小改动）**：`DrilldownTarget.label` 由中文文案改为稳定标识 `FileKind = 'code' | 'csv' | 'tsv' | 'json' | 'yaml'`，显示名渲染期取词典（zh 仍为「代码 / 文本」，`CSV` / `TSV` / `JSON` / `YAML` 不变）；「两侧文件类型不一致」按稳定标识判断（结构化按 `json` / `yaml` 区分），该错误与「暂不支持对比」改为带稳定 code 的错误（`mixed-family` / `unsupported-type`），由外壳按当前语言渲染；`directoryCompare.ts` 拼接副标题与比较类型处同步改用该标识，会话 id / `sides` / 比较结果 / 缓存调用序列不变。
- **本域词典面纪律（外壳接入轮）**：只往既有 `common` 与 `shell` 两个表面成对加键（`messages/{zh,en}/*` 同名文件），不新增表面文件、不改既有键语义；zh 值逐字沿用当前界面中文（含标点、全角括号与「」），en 为句子式产品措辞，插值只用 `{name}`；多变量句子（进度、已跳过、导出 / 导入结果等）用整句模板 + 占位符，不按中文语序逐段拼接，计数单复数用最小 `one` / `other` 键。
- **文件级代码视图文案（`views/CodeView.tsx`，文件级接入轮）**：双栏 Diff 的差异块导航可访问名 / 块计数、覆写到右·左、重置、保存左·右文件（含 `title`）、三种未保存状态（左 / 右 / 两侧）、打开左·右文件与对应 picker `title`、两侧面板 `subtitle` 与「已修改（未保存）」标记、`已写回 {path}` / `已打开 {path}` 通知（失败分支保留平台原始 message 作为详情）、模式切换 `双栏 Diff` / `三向合并 base · ours · theirs` 两个选项与分段控件可访问名 `代码视图`、两种模式的行内说明、下钻说明 `本地文件 · 双栏字符级 Diff`。
- **文件级三向合并文案（`views/CodeView.tsx` 合并模式）**：冲突块导航（上一个 / 下一个冲突块）、`待决冲突 {n}/{total}`、四个采纳按钮（`Accept Ours/Theirs/Both/Base` 中英同值）、三个侧输入按钮 `打开 {side}` 与 picker `title`、冲突侧栏 `冲突 {n}` / `已采纳 {choice}` / `未解决` / `无冲突块。` 与块内联采纳按钮、结果栏 `合并结果预览` 与已解决 / 未解决副标题、`复制`、`导出合并文本`、保存对话框 `title` `保存合并结果`、`已打开 {path}` / `已保存到 {path}` / `已复制到剪贴板` / `复制失败，请手动选择预览文本` 通知、三侧面板副标题 `base` / `ours` / `theirs`。
- **文件级 CSV 视图文案（`views/CsvView.tsx`）**：`主键列` 标签与分组可访问名、`CSV 对齐工具` 工具栏可访问名、状态过滤可访问名与六个选项（全部 / 仅差异 / 新增 / 删除 / 修改 / 相同，后四复用 `common.diff.*`）、重复主键徽标（可访问名 + `重复主键 {count}` + 多行 `title` 详情 `{key}（左 {left} · 右 {right}）`）、`{visible} / {total} 行`、`仅左` / `仅右` 列头、`对齐 {rows} 行 · 主键 {keys}` / `未选择` 面板副标题、打开左 / 右文件与 picker `title`、`已打开 {path}` 通知、三句互不串用的空态（未选主键列 / 当前主键零行 / 当前过滤零行）。
- **文件级结构化视图文案（`views/StructuredView.tsx`）**：JSON / YAML 格式切换（技术标识中英同值）与 `结构化格式` 可访问名、`状态过滤` 可访问名与六个选项（`类型变更` 单独成键，其余复用 `common.diff.*`）、下钻说明 `本地文件 · {format} 原文 · 语义归一化对比`、样本模式说明、`结构化计数` 分组可访问名与五个状态标签、`共 {count} 个节点 · 计数为运行时对比结果`、`节点路径变更` 面板与 `解析失败` / `显示 {visible} / {total}` 副标题、`左原文` / `右原文`、解析错误外壳（标题 `结构化解析失败` + 本会话影响提示，`description` 仍为 core 原始 message）、无数据空态标题与描述、过滤空态、打开左 / 右文件与 picker `title`、`已打开 {path}` 通知。
- **纯渲染组件核对（`components/DiffPane.tsx` / `MergePane.tsx` / `CodeBlock.tsx`）**：三者只渲染行号与行文本（占位符 `\u00a0`），无可翻译文案；本域**不改实现**，只把它们纳入文件级扫描清单证明覆盖，避免为「顺手加文案参数」扩大改面。
- **本域词典面纪律（文件级接入轮）**：一切新键放既有 `files` 表面成对文件，按视图分组 `files.code.*` / `files.merge.*` / `files.csv.*` / `files.structured.*` / `files.notice.*`；能被多视图复用的语义词复用 `common.diff.*` / `common.kind.*` / `files.action.copy`；当前就是英文技术词的（`Accept Ours/Theirs/Both/Base`、`base` / `ours` / `theirs`、`JSON` / `YAML`）中英同值并在 `messages.test.ts` 的 `LATIN_ONLY_KEYS` 登记理由；纯符号占位（`∅`、`—`、`#`、`\u00a0`）、路径 / 文件名 / 正文、`merged.txt` 默认名与 core 冲突标记不建键；千分位沿用 `toLocaleString('en-US')`，词典只承接单位与句子模板。

## 验收

- **ac-dict-pairs**：`messages/zh` 与 `messages/en` 的五个表面文件名一一对应，无单边文件。
- **ac-dict-keyset**：合并后的 zh 与 en 顶层键集合完全相等，无缺键、无多余键。
- **ac-dict-per-surface**：对每个表面分别比较，zh 与 en 的键集合相等（防止靠跨表撞键掩盖缺失）。
- **ac-dict-nonempty**：所有词典值 `trim()` 后非空，且不含 `TODO` / `未翻译` 占位串。
- **ac-dict-placeholders**：同一键在 zh 与 en 中的 `{placeholder}` 名称集合完全相同。
- **ac-dict-en-no-han**：en 词典所有值 `/\p{Script=Han}/u` 命中数为 0。
- **ac-dict-zh-keeps-text**：zh 词典每个值（除纯占位符值外）至少含一个汉字，防止把英文值抄进 zh。
- **ac-t-interpolate**：`t('…', { name: 'x' })` 替换全部同名占位符；缺失的占位符原样保留 `{name}`；含 `<b>` 的值按纯文本返回，不解析标记。
- **ac-t-provider-language**：Provider 初始 `language` 等于传入值；`setLanguage('en')` 后同一组件重渲染，`language` 与 `t` 返回值同步切到 en。
- **ac-t-no-provider-zh**：Provider 外调用 `useI18n()` 不抛错，`language` 为 `zh`，`t` 返回 zh 词条。
- **ac-render-helper**：`renderWithI18n(<Probe />, 'en')` 中 `useI18n().language` 为 `en`；不传第二参时为 `zh`。
- **ac-resolve-zh-locale**：无记录 + `zh` / `zh-CN` / `zh-Hant` / `ZH-cn` → `zh`。
- **ac-resolve-default-en**：无记录 + `en-US` / `fr-FR` / `''` / `undefined` → `en`。
- **ac-resolve-stored-wins**：记录 `zh` + 系统 `en-US` → `zh`；记录 `en` + 系统 `zh-CN` → `en`。
- **ac-resolve-invalid-stored**：记录为 `de` / `''` / 非字符串 → 按「无记录」处理，结果与系统语言矩阵一致。
- **ac-resolve-no-write**：`loadInitialLanguage(platform)` 只调用 `readUserSettings` 与 `systemLocale`，`writeUserSettings` 调用次数为 0；`readUserSettings` 拒绝时返回按系统语言判定的值且不抛。
- **ac-scan-han**：扫描辅助对含中文注释 / `aria-label` 的文件给出命中（行号与片段），对纯英文文件返回空；排除规则生效（`*.test.*`、`i18n/messages/**` 不计入）。
- **ac-no-business-text**：底座 WI 内 `src/renderer/src/workbench/**`、`src/renderer/src/views/**`、`src/renderer/src/components/**`、`App.tsx` 无文案改写（现有 spec 断言不变，`pnpm test` 全绿）；该约束只约束底座 WI，外壳接入 WI 按下方 ac-* 定义改写这些文件。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿，`code_gates.json` 不改。
- **ac-app-startup-en**：平台无设置记录且 `systemLocale` 为 `en-US`（或 `fr-FR`）时渲染 `App`，首屏出现英文顶栏副标题、英文空态标题与英文主按钮，且不存在当前中文空态标题。
- **ac-app-startup-zh**：平台无设置记录且 `systemLocale` 为 `zh-CN` / `zh-Hant` 时渲染 `App`，首屏为现有中文空态标题与按钮。
- **ac-app-startup-stored-wins**：记录 `en` + 系统 `zh-CN` → 首屏英文；记录 `zh` + 系统 `en-US` → 首屏中文。
- **ac-app-startup-gate**：设置读取未 settle 时可见 DOM 中没有任何文本节点（品牌帧无文字）、没有 heading / button / tablist；settle 后工作台出现且启动期间只挂载一次（平台订阅与 `compareRequestsReady` 各调用一次，不出现先中文后英文两批渲染）。
- **ac-app-perf-branch**：`?perf=1` 时仍直接渲染测量窗口，不读设置、不显示启动帧、DOM 中无工作台。
- **ac-shell-header-copy**：en 下顶栏可见 `New comparison` / `Open file` / `Open folder` / `Load demo samples` / `Demo samples` 与英文副标题；zh 下这五处与现状逐字一致；对应 `title` 也随语言切换。
- **ac-view-switcher-copy**：视图切换 `tablist` 的可访问名与四个视图标签在中英下分别为当前语言（en 如 `Directory` / `Code diff & 3-way` / `CSV key comparison` / `JSON / YAML`；zh 为现有中文标签）。
- **ac-empty-state-copy**：空态标题 / 描述 / hint / `新建对比` / `打开文件` / `打开文件夹` 在中英下均为当前语言，zh 与现状逐字一致。
- **ac-session-tabs-copy**：en 下 `tablist` 可访问名为 `Sessions`，关闭按钮可访问名为 `Close {title}`；zh 下为「会话」「关闭 {title}」；带未保存修改的标签在两种语言下都有当前语言的未保存提示（`title` 与 `sr-only`）。
- **ac-sample-session-display**：加载演示样本后，en 下四个标签的标题 / 副标题均为英文（不出现 fixture 中文标题）；zh 下与现状逐字一致；两种语言的会话 id 集合与标签顺序完全相同。
- **ac-runtime-session-display**：打开真实文件对与目录对后，en 下副标题的路径 / 文件名保持原样、文件类型名为英文，zh 下与现状一致；会话 id 与 `file:` / `directory:` 前缀不变。
- **ac-stat-conflict-by-key**：代码会话的冲突统计在中英下都显示运行时未解决冲突数（不是 fixture 常量），且源码中不再存在 `stat.label` 与中文字面量的比较（扫描断言 `stat.label ===` / `=== '冲突块'` 命中为 0）。
- **ac-close-unsaved-dialog**：关闭含未保存修改的会话时，en 对话框标题 / 描述（含会话标题插值）/ `Continue editing` / `Discard and close` / 正文说明为英文；zh 与现状逐字一致；两种语言下「继续编辑」不关闭会话、「放弃修改并关闭」关闭该会话。
- **ac-progress-and-cancel**：目录对比进行中，en 下进度条 `aria-label`、阶段文案、`已扫描 / 已校验 / 累计` 三个计数句、`已处理 {size}` 与 `Cancel` 均为英文且计数与字节仍随真实批次增长；zh 与现状一致。
- **ac-cancel-notice**：en 下点击取消后出现英文取消通知，工作台会话 / 状态栏 / 视图 DOM 与取消前一致；zh 下通知为现有文案。
- **ac-drag-notices**：拖入 1 个路径、3 个路径、1 文件 + 1 文件夹三种情况在中英下分别得到当前语言提示（含路径 / 数量参数），且都不创建会话。
- **ac-notice-skipped-and-snapshot**：「已跳过 左 {l} / 右 {r}」与快照导出 / 导入成功通知、`来源目录对比：…` 与返回上级目录的两种结果在中英下均为当前语言（会话标题作为参数原样插入）。
- **ac-picker-titles**：打开文件 / 打开文件夹 / 导出快照传给平台的对话框 `title` 为当前语言（用 fake port 断言收到的 title）。
- **ac-new-compare-copy**：en 下对话框标题、描述、左右路径标签、`Enter to compare · Esc to close` 提示、`Cancel` / `Compare` / `Open file` / `Open folder` 与 `title` 全为英文且不含汉字；zh 与现状逐字一致。
- **ac-new-compare-validation**：空右侧 / 两侧同路径 / 文件与目录混合 / 不支持的扩展名四种输入，分别按 `EMPTY_PATH`、`DUPLICATE_SIDE`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE` 在中英下给出当前语言文案并保留涉及的路径 / 文件名；对话框保持打开、不产生会话、不触发目录扫描。
- **ac-new-compare-unknown-io**：让打开过程抛出不带错误码的底层失败时，alert 内保留原始详情文本，而对话框标题、标签、按钮、Enter/Esc 提示仍为当前语言。
- **ac-shared-component-copy**：en 下对话框关闭按钮可访问名为 `Close`、差异语义标签为 `Same/Added/Removed/Modified/Conflict`（`DiffBadge` 与状态栏图例一致），zh 下为「关闭」与「相同/新增/删除/修改/冲突」；zh 值不变使既有组件 / 视图测试保持通过。
- **ac-han-scan-shell**：用 `scanHardcodedChinese` 扫描本范围显式清单（`App.tsx`、`workbench/Workbench.tsx`、`workbench/NewCompareDialog.tsx`、`workbench/sessionDisplay.ts`、`workbench/fileKinds.ts`、`components/Dialog.tsx`、`components/SessionTabs.tsx`、`components/StatusBar.tsx`、`components/DiffBadge.tsx`、`components/diffSemantics.ts`）命中数为 0（注释、`aria-label`、`title` 不豁免）。
- **ac-en-smoke-no-han**：en 下空态 + 新建对比对话框 + 演示样本标签条 + 状态栏的可见文本不含汉字（`{Script=Han}` 计数为 0，ASCII 测试路径除外）。
- **ac-no-extra-work**：同一会话在中英两种渲染下，`listDirectory/listDirectories/digestFiles/readTextFile` 的调用次数相同，标签数量、会话 id、顺序与活动标签一致（本地化不引入重新扫描或新建会话）。
- **ac-existing-suite**：`pnpm test` 全绿，其中既有 App / snapshot / Workbench 行为断言除「启动前需预置 zh 记录并等待首屏」外不变。

- **ac-files-dict-surface**（文件级接入轮）：`messages/zh/files.ts` 与 `messages/en/files.ts` 键集合相等，新增键全部以 `files.` 前缀并落在 `files` 表面（`messages/zh`、`messages/en` 仍各只有五个文件），无既有键被删除或改名（`files.action.save/revert/copy`、`files.empty`、`files.unsavedChanges` 仍在）。
- **ac-code-diff-copy-en**：`renderWithI18n(<CodeView fixture defaultMode="diff" platform>, 'en')` 下可见 `Previous difference` / `Next difference` / `Difference blocks`、`Overwrite to right` / `Overwrite to left`、`Reset`、`Save left file` / `Save right file` 及其英文 `title`、`Unsaved: left` / `right` / `both`、`Open left file` / `Open right file`、面板副标题 `left` / `right` 与 `Modified (unsaved)`。
- **ac-code-diff-copy-zh**：同一渲染在 zh 下逐字出现 `上一个差异块`、`覆写到右`、`重置`、`保存左文件`、`打开左文件`、`未保存：左`、`已修改（未保存）`，既有 `CodeView.test.tsx` 断言不改即通过。
- **ac-code-dirty-status**：覆写使两侧产生不同脏状态时，zh 与真实脏侧一一对应显示三种之一（`未保存：左` / `未保存：右` / `未保存：左、右`），en 对应 `Unsaved: left` / `right` / `both`；无脏侧时不渲染该节点。
- **ac-code-save-notice**：保存成功后 `role="status"` 文案为当前语言并含被写回路径（en 形如 `Wrote back {path}`），`writeTextFile` 恰好一次；写入失败时通知为平台原始 message 原文（中英相同），不出现「未翻译」占位。
- **ac-code-picker-titles**：打开左 / 右文件传给 `platform.selectFile` 的 `title` 为当前语言（en `Open left local file` / `Open right local file`；zh `打开左侧本地文件` / `打开右侧本地文件`），传 `TEXT_FILE_FILTER`，取消时视图状态不变。
- **ac-merge-copy-en**：合并模式 en 可见 `Previous conflict` / `Next conflict`、`Pending conflicts`、`Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base`、`Open base` / `Open ours` / `Open theirs`、`Merge result preview`、`Copy`、`Export merged text`；未解决数 `{n}/{total}` 为真实计数。
- **ac-merge-conflict-list**：en 冲突侧栏为 `Conflict {n}`，未采纳 `Unresolved`、采纳后 `Accepted {choice}`（choice ∈ ours / theirs / both / base），按钮高亮跟随 `resolutions`；无冲突时英文 `No conflict blocks.`；zh 为 `冲突 {n}` / `未解决` / `已采纳 ours` / `无冲突块。`。
- **ac-merge-actions-notice**：en 复制成功通知 `Copied to clipboard`、失败为英文失败提示；导出调用 `platform.saveFile` 的 `title` 为当前语言（en `Save merged result`），成功后通知为当前语言并含返回路径；存在未解决冲突时复制 / 导出按钮 disabled。
- **ac-csv-copy**：en 下 `Key columns`、`Key column selection`、`CSV alignment tools`、`Status filter`、`All` / `Differences only` / `Added` / `Removed` / `Modified` / `Same`、`Only left` / `Only right`、`{visible} / {total} rows`、`Aligned {rows} rows · key {keys}`、`Open left file` / `Open right file` 均为英文；zh 为 `主键列` / `仅左` / `{visible} / {total} 行` 等现有文案；数字仍用 `en-US` 千分位。
- **ac-csv-duplicate-keys**：存在重复主键时徽标可访问名为当前语言（en `Duplicate keys` / zh `重复主键`）并带计数，`title` 每行形如当前语言模板且含左右出现次数；无重复时不渲染该徽标。
- **ac-csv-empty-states**：未选主键列（`align.columns` 为空）、有主键但零对齐行、过滤后零行三种情况在中英下分别给出各自的空态句（三个不同键，en `No key columns selected…` / `No rows to align under the current keys.` / `No rows under the current filter.`），不互相串用。
- **ac-structured-copy**：en 下 `Structured format`、`Status filter`、`All` / `Added` / `Removed` / `Modified` / `Type changed` / `Same`、`structured counts` 分组可访问名、`{count} nodes · counts reflect the runtime comparison`、`Node path changes`、`Showing {visible} / {total}`、`Left source` / `Right source`、`Open left file` / `Open right file` 为英文；zh 为 `类型变更`、`共 {count} 个节点 · 计数为运行时对比结果`、`节点路径变更`、`左原文` / `右原文`；切到 YAML 后下钻说明为 `Local file · YAML source · semantic comparison`。
- **ac-structured-error-frame**：输入无法解析的 JSON 时错误外壳在中英下分别显示本地化标题 / 提示（en `Structured parsing failed`，zh `结构化解析失败`），`description` 保留 core 抛出的原始 message（中英渲染同一字符串），面板副标题为当前语言的 `Parse failed` / `解析失败`。
- **ac-structured-empty**：无 source 时 en 显示 `No structured data to compare` 与英文描述、zh 显示现有文案；过滤后零变更时显示当前语言过滤空态句（en 含 `All`，zh 含「全部」）。
- **ac-switch-keeps-code-state**：双栏 Diff 中覆写产生脏状态后由 zh 切 en，块计数、左右行文本、脏标记语义与保存按钮 disabled 状态不变，`writeTextFile` / `readTextFile` 调用次数为 0；合并模式采纳一个冲突后切语言，待决冲突数值与各块采纳结果不变。
- **ac-switch-keeps-csv-state**：CSV 视图切换主键列与状态过滤后切语言，`onAlignStateChange` 上报的 counts、当前过滤值、已选主键集合与可见行数不变，`alignCsvTables` 不因语言切换重算（`onAlignStateChange` 调用次数不增加）。
- **ac-switch-keeps-structured-state**：结构化视图切到 YAML + `类型变更` 过滤后切语言，`diffStructured` 结果条目数、过滤值、计数条数值与可见变更行不变。
- **ac-files-han-scan**：`scanHardcodedChinese` 扫描显式清单（`views/CodeView.tsx`、`views/CsvView.tsx`、`views/StructuredView.tsx`、`components/DiffPane.tsx`、`components/MergePane.tsx`、`components/CodeBlock.tsx`）命中数为 0（注释、`aria-label`、`title` 不豁免）；清单写成常量数组 `FILES_COPY_FILES`（`views/filesScan.test.ts`），新增文件必须入列。
- **ac-files-en-smoke**：三个视图在 en 下的 `container.textContent` 中 `\p{Script=Han}` 命中为 0（样本路径、文件名与文件正文均为 ASCII；用户数据不翻译）。
- **ac-files-existing-view-suite**：`pnpm test` 全绿；`CodeView.test.tsx`、`CsvView.test.tsx`、`StructuredView.test.tsx` 的既有 zh 断言（含 `Accept Ours` / `Accept Both`、`类型变更`、`结构化计数`、`主键列`）不改即通过；`workbench/shellScan.test.ts` 与词典测试不改逻辑仍通过（仅允许在 `LATIN_ONLY_KEYS` 增补本项新增拉丁文键）。
- **ac-files-gates-green**（prd `ac-gates-green`）：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；`code_gates.json` 不改、不新增专用 gate。

## 非目标

- 不做设置面板 / 齿轮入口 / 语言切换 UI 与写盘（归「设置面板与即时切换」WI）；外壳接入 WI 只消费 `initialLanguage`，不做 `setLanguage` 交互。
- 外壳接入 WI 不做 `src/renderer/src/views/**` 的任何文案（目录树、四态过滤、同步 / 模板对话框、代码 / CSV / 结构化视图、`TemplateDialog`、`DirectorySyncDialog`）；文件级接入轮已覆盖代码 / CSV / 结构化三视图，**仍不做** `views/DirectoryView.tsx`、`DirectorySyncDialog.tsx`、`TemplateDialog.tsx` 与 `components/TreeView.tsx` / `SplitPane.tsx` / `Panel.tsx` / `SegmentedControl.tsx` 的文案，也不做这些视图的「切换不重算」验收。
- 不改 `workbench/snapshotOps.ts`、`workbench/loadSampleSessions.ts`、`workbench/session.ts`、`workbench/fileIO.ts` 里的中文提示与注释（属目录 / 快照面与后续 WI）：它们产出的 message 作为**错误详情**原样展示，外壳文案由外壳接入 WI 本地化。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/compareRequest.ts`、`src/shared/platform/**` 的任何文案或行为。
- 不改 `src/shared/fixtures/**` 的数据与 `FixtureSession` / `SessionStat` 类型语义（`SessionStat.label` 保留，但 `Workbench` 不再渲染它、也不再据它判断）；不把 fixture 中文改成英文。
- 不改会话 id 生成规则、对比 / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；不新增或修改 `code_gates.json` 条目。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`），不做 perf 窗口与 `components/TreeView.tsx` / `SplitPane.tsx` 的文案。
- 不跑全主链路中文扫描（仅本范围显式清单）；收口扫描归收口 WI。
- 不引入 i18next / react-intl 等第三方框架，不新增运行时依赖、不新增专用 code gate。
- 不新建第二套存储：不写 electron-store、不加第二个 localStorage key、不新增配置文件（存储实现归 `foundation` 域）。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与发布证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。

## 实现约束

- 词典语言值类型 `Language = 'zh' | 'en'`（`src/shared/platform/types.ts`），默认 `en`；`UserSettings` 只含 `language` 一个字段（不保留 version 字段），读取时忽略未知字段、非法语言值视为 `null`。
- 五个表面固定为 `common` / `shell` / `directory` / `files` / `settings`；新增表面必须成对新增并进 `messages/index.ts` 固定聚合，禁止把新键散落到别人文件。
- 插值仅 `{name}` 形态，单一正则实现，不引入模板引擎；`t` 的键参数类型为合并后 zh 键的联合类型（`MessageKey`）。
- Web 设置单键固定为 `opencompare.userSettings`；内存回退是模块级变量，同一运行期同构读回；不写其它 key（实现归 `foundation` 域）。
- 新通道只加在 `src/shared/platform/channels.ts`；preload 只转发，renderer 不得 import electron（既有 `no-restricted-imports` 已覆盖）。
- 既有 `src/preload/index.test.ts` 的 surface 断言与 `src/main/platform/electron-platform.test.ts` 的电子模块 mock 需按新方法集更新；`app.getPath('userData')` 在测试中用临时目录注入，不依赖真实用户目录。
- renderer 侧 DOM / localStorage 测试用 `// @vitest-environment jsdom`；纯解析与词典测试保持 node 环境。
- 注释与代码风格沿用仓库现有英文注释；`i18n/messages/**` 自身不受「无中文」扫描约束，业务源码必须零汉字。
- 词典归属：跨表面共享键（差异语义、文件类型名、通用按钮、`Sessions`、`Close`、`Close {title}`）放 `common`，工作台壳与新建对比专属键放 `shell`；键名沿用命名空间点号（如 `shell.toolbar.newCompare`、`shell.progress.cancel`、`shell.session.sample.code.title`、`common.diff.conflict`、`common.fileKind.code`）。
- `SessionStat.label` 字段保留（fixtures 与既有类型不动），但 `Workbench` 不再渲染、也不再据它判断分支；`DIFF_LABELS` 改为 `DIFF_LABEL_KEYS`，只同步改 `TreeView.test.tsx`、`DirectoryView.test.tsx` 两处断言取 zh 词典值。
- 文件对的两类已知失败用带 `code` 的错误（`unsupported-type`、`mixed-family`）承载参数，`Workbench` 与 `NewCompareDialog` 按 code 取键，未知错误仍显示原始 message。
- 扫描清单写成一个常量数组供测试直接遍历；新增 shell 文件必须同时加入清单，否则视为未覆盖。
- 既有 `App.test.tsx` / `App.snapshot.test.tsx` 的适配方式：`beforeEach` 写入 `localStorage['opencompare.userSettings'] = '{"language":"zh"}'`（`afterEach` 清理），首屏断言改为 `await screen.findByRole(...)`；不得为通过测试把生产默认语言改成中文。`Workbench` 直连渲染的测试因无 Provider 回落 zh，不改断言。
- renderer 仍不得 import Electron；不引入 `@core` 之外的新依赖、不引入 i18next / react-intl；新代码注释用英文（扫描不豁免注释）。
- **文件级接入轮的实现约束**：`MODE_OPTIONS` / `ACCEPT_OPTIONS` / `FILTER_OPTIONS` / `STATUS_LABELS` 等常量数组只承载稳定 `value` + 词典键，`t()` 结果不得缓存进模块级常量、不得在渲染期之外解析语言；`useMemo` 若引入语言相关渲染必须把 `language` 纳入依赖，禁止把中文字符串存进会话 / 状态对象；平台 dialog `title`、按钮 `title`、`aria-label` 同样走词典（扫描不豁免注释与属性），错误通知详情 `cause.message` 原样透传；扫描测试放 `src/renderer/src/views/filesScan.test.ts` 并以 `FILES_COPY_FILES` 常量列举六个文件；en 用例用 `renderWithI18n(..., 'en')`，既有 zh 用例保持无 Provider 的 `render`（回落 zh），语言切换用例在测试文件内用 `I18nProvider` + 探针按钮驱动 `setLanguage`，不新增生产 API；不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/**`，不改布局 / 差异语义色 / 字号 / 虚拟化行为，不把 `DiffPane` / `MergePane` / `CodeBlock` 改造成带文案参数的组件。

## 最近交付证明

- WI：`wi_ws_48f5bed4c5774d2b`（代码 / CSV / JSON·YAML 文件级视图双语化，`kind: feature`；双语化第三个 WI）
- 日期：2026-10-24
- 结果：code_gates passed（`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`views/CodeView.tsx`（双栏 Diff + 三向合并）的工具栏导航 / 覆写 / 重置 / 保存左右文件与 `title`、三种未保存状态、打开左右文件与 picker `title`、两侧面板 `subtitle` 与「已修改（未保存）」、写回 / 打开通知、模式切换选项 / 分段控件可访问名 / 两种模式行内说明 / 下钻说明、冲突导航与 `待决冲突 {n}/{total}`、四个采纳按钮与侧栏 `冲突 {n}` / `已采纳 {choice}` / `未解决` / `无冲突块。`、结果预览 / 复制 / 导出与保存 `title`、复制与导出通知、三侧副标题全部改渲染期 `t(...)`；`views/CsvView.tsx` 的主键列标签与分组名、对齐工具工具栏名、状态过滤六项、重复主键徽标（可访问名 + 计数 + 每行 `title`）、行计数、`仅左` / `仅右`、对齐副标题、打开左右文件与 picker `title`、三句独立空态；`views/StructuredView.tsx` 的格式切换与 `结构化格式`、状态过滤六项（`类型变更` 单独成键）、下钻 / 样本说明、`结构化计数` 分组名与五态标签、节点计数句、变更面板与 `解析失败` / `显示 {visible} / {total}` 副标题、`左原文` / `右原文`、解析错误外壳（`description` 保留 core 原始 message）、无数据 / 过滤空态、打开左右文件与 picker `title`。词典只在既有 `files` 表面成对扩充（`files.code.*` / `files.merge.*` / `files.csv.*` / `files.structured.*` / `files.notice.*`，另加 `files.action.openLeft/Right`），zh 逐字沿用原界面文案，`Accept Ours/Theirs/Both/Base`、`base|ours|theirs`、`JSON` / `YAML` 中英同值并在 `messages.test.ts` 的 `LATIN_ONLY_KEYS` 登记理由；`components/DiffPane|MergePane|CodeBlock` 核对后无文案、实现未改，仅纳入扫描清单。新增 `views/filesScan.test.ts`（`FILES_COPY_FILES` 六个文件 0 命中）；三个 `*.test.tsx` 各补 en 渲染 / 通知 / picker 参数 / 空态 / 重复主键 / 解析错误用例与「切语言不丢状态」用例（diff 脏写、合并采纳、CSV 主键·过滤·计数不重算、结构化 YAML + 类型变更过滤），既有 zh 断言不改；`App.i18n.test.tsx` 两处 `覆写到右` 按钮查找改 `Overwrite to right`（外壳 en 用例现在经由 CodeView 取英文名）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，未做 tech / design 手合。后续注意：① 文件级三视图已零汉字，剩余中文硬编码集中在目录视图（`DirectoryView` / `DirectorySyncDialog` / `TemplateDialog` / `TreeView` / `SplitPane` / `Panel` / `SegmentedControl`）、设置面板与 `workbench/fileIO.ts` 的 `FileDialogFilter.name`，收口扫描仍会命中，属预期；② 新增文件级文案必须加 `files.` 成对键并进 `views/filesScan.test.ts` 的 `FILES_COPY_FILES`；③ `DiffPane` / `MergePane` / `CodeBlock` 已确认是无文案的纯渲染组件，后续不要为复用而给它们加文案参数；④ 设置面板 WI 必须复用 `opencompare.userSettings` 单键与 `setLanguage`，不得重挂载工作台或 `views/**`。
- 历史：外壳 WI `wi_ws_a0d69b96e026b9df`（2026-10-23，`App` 启动解析 + 无文字启动帧 + `I18nProvider` 挂载、`Workbench` 壳层 / 新建对比 / 共享展示组件文案、`workbench/sessionDisplay.ts` 渲染期化、`DIFF_LABEL_KEYS`、`fileKinds` 稳定标识）；底座 WI `wi_ws_80cc30bb21c00dc3`（2026-10-23，词典 / `I18nProvider` / `resolveInitialLanguage` + `loadInitialLanguage` / `renderWithI18n` / `scanHardcodedChinese`；平台设置与系统语言通道折叠在 `domains/foundation`）。
