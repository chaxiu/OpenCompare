# Domain: i18n

renderer 双语（zh / en）链路：五个表面的成对词典、`I18nProvider` / `useI18n()` 语言上下文、首启语言解析的纯函数与只读 loader、两个测试辅助（`renderWithI18n`、中文硬编码扫描器），以及**应用外壳接入**——`App` 启动解析 + Provider 挂载、工作台壳层 / 新建对比 / 共享展示组件的可见文案、会话标题·副标题·统计标签的渲染期解析。平台侧设置读写与系统语言通道（`readUserSettings` / `writeUserSettings` / `systemLocale`）归 `foundation` 域，本域只消费其契约；**目录对比视图面**（`views/DirectoryView.tsx`、`components/TreeView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx` + 共享键映射 `views/directoryCopy.ts`）已接入，代码 / CSV / 结构化视图面与设置面板的语言切换 UI 归后续 WI。

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
- **目录对比视图面文案（`views/DirectoryView.tsx`）**：过滤组可访问名（`差异过滤`）与五档过滤项改为 `DirectoryFilter → MessageKey` 映射（`FILTER_LABEL_KEYS`）渲染期 `t()` 解析，选项顺序仍由 `DIRECTORY_FILTERS` 决定、`value` 与 `onFilterChange` 行为不变；十个工具栏按钮（选择左右目录 / 加载演示目录 / 预览并同步 / 模板归位 / 导出·导入左右快照 / 演示远端快照）的可见文本与 `title` 全部走词典，两个隐藏 file input 的 `aria-label`（选择左 / 右侧快照文件）走词典；`pickerAvailable === false` 时选择按钮 `title` 为空并渲染 Web 预览提示，`true` 时提示不渲染、`title` 为当前语言说明句；左右 Panel 的 `meta` 来源标识（`源目录` / `目标目录` / `快照`）走词典，而 Panel 的 `title` / `subtitle` 与 `TreeView` 的 `label` 仍是根名与真实路径（用户数据不翻译）；单侧过滤后 0 行的空态句、`leftSkipped + rightSkipped > 0` 的持久提示行（`已跳过：左 {left} / 右 {right}`）、底部下钻说明长句均走词典；视图内差异图例由既有已本地化的 `CompositionLegend` 渲染，本项不改其代码。
- **目录树展开/折叠可访问名（`components/TreeView.tsx`）**：目录行展开 / 折叠按钮 `aria-label` 走词典（`展开 {name}` / `折叠 {name}` → `Expand {name}` / `Collapse {name}`），`node.name` 原样插入；树的 `aria-label`（根名）、行 `title`（相对路径 / 名称）与 `CountSummary` 前缀与数字保持不变。
- **同步预览对话框（`views/DirectorySyncDialog.tsx`）**：标题（方向 · 模式 + `同步预览`）、描述（`目标根：` + 路径 + 只读样本树说明 + 合计 `{count} 项 / {size}`）、三个分组标题（`待新增拷贝` / `待覆盖修改` / `待删除（镜像）`）、分组计数（`{count} 个 · {size}`）、空分组 `无`、空计划整句、取消 / 确认 / 进行中按钮文案、镜像删除项复选框 `aria-label`（`删除 {path}`）全部走词典；`SYNC_DIRECTION_KEYS` / `SYNC_MODE_KEYS` 取代对话框内自带的 `DIRECTION_LABELS` / `MODE_LABELS`，`incremental` 仍不渲染删除分组，`plan.totalCount === 0` 时确认按钮 `disabled`，`deletePaths` 仍按当前勾选计算。
- **模板归位对话框（`views/TemplateDialog.tsx`）**：标题、描述三段标签（`模板 A：` / `散乱树 B：` / `输出根：`）、四个分区标题（`已匹配` / `缺失槽位` / `冲突项` / `B 未使用文件`）、分区计数、空分组 `无`、冲突原因（`同名多候选` / `同名内容不同`）、取消 / 确认 / 进行中按钮文案全部走词典；候选路径仍以 ` · ` 连接，`result.matched.length === 0` 时确认按钮 `disabled`。
- **目录面共享键映射（`views/directoryCopy.ts`，纯常量 / 纯函数、无 React / DOM）**：只导出 `FILTER_LABEL_KEYS: Record<DirectoryFilter, MessageKey>`、`SYNC_DIRECTION_KEYS: Record<SyncDirection, MessageKey>`、`SYNC_MODE_KEYS: Record<SyncMode, MessageKey>` 与 `countKey(one, other, count)`（仅 `count === 1` 取单数），由视图、两个对话框与测试共同引用，避免三处各写一份中文映射。
- **本域词典面纪律（目录视图轮）**：只往既有 `directory` 表面成对加键（`messages/{zh,en}/directory.ts`），不新增表面文件、不改既有键与 `common` / `shell` 键；`zh/directory.ts` 与 `en/directory.ts` 键集相等、值 `trim()` 非空、同键占位符集合一致、en 无 `\p{Script=Han}`；既有 `directory.filter.label` / `filter.clear` / `tree.empty` / `action.refresh` / `summary.files` 五个键原样保留（不使用、不删除）；单复数只拆同步合计、同步分组、模板分区三处 `one` / `other`，zh 两条值相同。

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
- **ac-filter-copy**：zh 下五个过滤项与组可访问名与现状逐字一致（`全部/仅差异/左独有/右独有/相同`、`差异过滤`）；en 下分别为 `All / Differences only / Left only / Right only / Same` 与 `Difference filter`，且五个 `value` 顺序仍为 `DIRECTORY_FILTERS` 顺序。
- **ac-toolbar-copy**：en 下十个按钮可见文本分别为 `Choose left folder` / `Choose right folder` / `Load demo folder` / `Preview & sync` / `Place from template` / `Export left snapshot` / `Import left snapshot` / `Export right snapshot` / `Import right snapshot` / `Demo: remote snapshot`，且各自 `title` 为英文；zh 下文本与 `title` 与现状逐字一致；同一按钮在 zh 与 en 两次渲染中文本不同、`title` 不同。
- **ac-picker-title-gate**：`pickerAvailable === false` 时左右选择按钮 `title` 为空且渲染 Web 预览提示；`true` 时提示不渲染、`title` 为当前语言的说明句。两种语言下均成立。
- **ac-snapshot-input-aria**：两个隐藏 file input 的 `aria-label` 在 zh 下为 `选择左侧快照文件` / `选择右侧快照文件`，en 下为 `Choose left snapshot file` / `Choose right snapshot file`。
- **ac-panel-meta**：真实目录对 en 下左侧 `meta` 为 `Source folder`、右侧为 `Target folder`；任一侧挂载快照时该侧 `meta` 为 `Snapshot`；zh 下分别为 `源目录` / `目标目录` / `快照`。
- **ac-panel-title-user-data**：无论 zh 还是 en，两侧 Panel 的 `title`/`subtitle` 与两个 `role="tree"` 的 `aria-label` 都等于比较结果的根名与真实路径（用含中文名的比较结果验证不被翻译、不被替换）。
- **ac-empty-filter-copy**：单侧过滤后 0 行时，该侧渲染当前语言空态句且另一侧行数不受影响；en 空态句不含汉字；zh 与现状逐字一致。
- **ac-skipped-line**：`leftSkipped=2, rightSkipped=1` 时 en 渲染 `Skipped: left 2 / right 1`，zh 渲染 `已跳过：左 2 / 右 1`；两者均为 0 时该行不渲染。
- **ac-drilldown-hint**：en 底部说明含 `Double-click` 与 `CSV / TSV / JSON / YAML` 且不含汉字；zh 与现状逐字一致。
- **ac-tree-toggle-aria**：折叠目录行按钮可访问名为 `Expand {name}`、展开后为 `Collapse {name}`（en），zh 为 `展开 {name}` / `折叠 {name}`；点击按钮仍只切换折叠、不改变 `selectedPath`。
- **ac-legend-en**：en 下 DirectoryView 内 `CompositionLegend` 的语义标签为 `Same/Added/Removed/Modified`，zh 下为 `相同/新增/删除/修改`；计数数字与 `visibleCounts` 一致。
- **ac-sync-dialog-copy**：en 下标题形如 `Left → Right · Incremental sync preview`（方向、模式均为英文）、描述含 `Target root:` 与目标根原文、处理中文本为 `Syncing…`、空闲为 `Apply changes`、取消为 `Cancel`；zh 下与现状逐字一致；`Cancel` 调用 `onCancel` 一次，`Apply changes` 以当前勾选后的 `deletePaths` 调用 `onConfirm`。
- **ac-sync-dialog-groups**：en 下分组标题为 `Files to copy` / `Files to overwrite` / `Files to delete (mirror)`，分组计数按 `{count} item(s) · {size}` 渲染；`mode === 'incremental'` 时不渲染删除分组；空分组渲染 `None`（zh 为 `无`）。
- **ac-sync-dialog-empty**：`plan.totalCount === 0` 时 en 渲染 `This direction has no changes to sync; the target already matches the source.` 且确认按钮 `disabled`；zh 与现状逐字一致，同样 `disabled`。
- **ac-sync-delete-aria**：mirror 模式 en 下删除项复选框 `aria-label` 为 `Delete {path}`（path 原样），zh 为 `删除 {path}`；取消勾选后该项不出现在传给 `onConfirm` 的 `deletePaths` 中。
- **ac-template-dialog-copy**：en 下标题为 `Template placement preview`、描述含 `Template A:` / `Scattered tree B:` / `Output root:` 与三个根路径原文、分区标题为 `Matched` / `Missing slots` / `Conflicts` / `Unused files in B`、处理中为 `Placing…`、空闲为 `Extract and place`；zh 下与现状逐字一致；`result.matched.length === 0` 时确认按钮 `disabled`。
- **ac-template-reason-copy**：en 下 `ambiguous` 冲突原因为 `Multiple candidates with the same name`、内容不同为 `Same name, different content`；zh 为 `同名多候选` / `同名内容不同`；两种语言下候选路径仍以 ` · ` 连接。
- **ac-count-plural**：en 下计数 1 用单数（`1 item`）、0 与 3 用复数（`0 items` / `3 items`），覆盖同步合计、同步分组和模板分区三处；zh 下恒为 `合计 {count} 项` / `{count} 个`，不随数量变化。
- **ac-dict-directory**：`zh/directory.ts` 与 `en/directory.ts` 键集相等、所有值 `trim()` 非空、同键占位符集合一致、en 值无 `\p{Script=Han}`（并入既有 `messages.test.ts` 断言后全绿）；既有 `directory` 键不被改名或删除。
- **ac-han-scan-directory**：`scanHardcodedChinese` 对本范围清单（`views/DirectoryView.tsx`、`components/TreeView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx`、`views/directoryCopy.ts`）命中数为 0（注释、`aria-label`、`title` 不豁免）。
- **ac-existing-tests-by-key**：`DirectoryView.test.tsx` 中不再出现 `全部/仅差异/左独有/右独有/相同` 与 `展开 {name}`/`折叠 {name}` 字面量（改为经 `zh[FILTER_LABEL_KEYS[...]]` / zh 键取值），`DirectoryView.test.tsx` 与 `TreeView.test.tsx` 全部断言仍通过。
- **ac-translation-is-render-only**：同一比较结果分别以 zh 与 en 渲染 DirectoryView，两侧渲染出的行路径序列、`role="treeitem"` 数量、当前过滤 tab 的 `aria-selected`、折叠后不可见路径与 `onTogglePath`/`onSelectPath` 调用序列完全相同（本地化不改变行模型、过滤、展开与选中）。
- **ac-en-smoke-no-han-directory**：en 下上述视图与两个对话框的指定表面（五个过滤项、十个按钮及其 `title`、两侧 `meta`、提示行、空态句、下钻说明、图例、两个对话框标题/描述标签/分组标题/按钮/空态句）文本 `\p{Script=Han}` 命中数为 0（路径、文件名、`Left → Right` 箭头等用户数据/符号除外）。

## 非目标

- 不做设置面板 / 齿轮入口 / 语言切换 UI 与写盘（归「设置面板与即时切换」WI）；外壳接入 WI 只消费 `initialLanguage`，不做 `setLanguage` 交互。
- 目录视图面（`views/DirectoryView.tsx`、`components/TreeView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx`、`views/directoryCopy.ts`）的文案已在「目录对比视图与同步/模板对话框双语化」轮接入；代码 / CSV / 结构化视图（`views/CodeView.tsx`、`CsvView.tsx`、`StructuredView.tsx`）及其测试的文案归「文件级视图双语化」WI，设置面板 / 齿轮入口 / 语言即时切换与写盘归「设置面板与即时切换」WI。
- 不改 `workbench/snapshotOps.ts`、`workbench/loadSampleSessions.ts`、`workbench/session.ts`、`workbench/fileIO.ts` 里的中文提示与注释（属目录 / 快照面与后续 WI）：它们产出的 message 作为**错误详情**原样展示，外壳文案由外壳接入 WI 本地化。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/compareRequest.ts`、`src/shared/platform/**` 的任何文案或行为。
- 不改 `src/shared/fixtures/**` 的数据与 `FixtureSession` / `SessionStat` 类型语义（`SessionStat.label` 保留，但 `Workbench` 不再渲染它、也不再据它判断）；不把 fixture 中文改成英文。
- 不改会话 id 生成规则、对比 / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；不新增或修改 `code_gates.json` 条目。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`），不做 perf 窗口与 `components/SplitPane.tsx` 的文案（`components/TreeView.tsx` 的展开 / 折叠可访问名已在目录视图轮接入）。
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
- **目录视图轮接线纪律**：四个组件用 `useI18n()`；无 Provider 时既有 zh 回落保证 `DirectoryView.test.tsx` / `TreeView.test.tsx` 的 `render()` 调用方式不需要包 Provider 即可继续断言中文；不得把 `language` 用作组件或 `TreeView` 的 `key`，不得改 `DirectoryViewProps` 形状。`DIRECTORY_FILTERS` 顺序、`buildDirectoryRowModel` 入参、`trackLive('rowModel')` 注册、`useLayoutEffect` 滚动恢复、`selectedPath` / `collapsedPaths` 受控语义、隐藏 input 的 `accept` 与 `onChange` 重置逻辑、`Dialog` 的 `onClose` busy 行为、`deletePaths` 计算全部保持原样。
- **目录视图轮测试写法**：en 场景统一用 `@renderer/i18n/testing` 的 `renderWithI18n(ui, 'en')`；zh 断言用 `zh[key]` 取值；扫描清单写成常量数组（四个页面文件 + `directoryCopy.ts` 全列），不得把 `.test.*` 加进扫描清单靠排除规则蒙混；en 无汉字断言按「指定表面文本」逐个元素校验，不对含随机临时目录名的整棵 DOM 做全量汉字扫描。`views/directoryI18n.test.tsx`（中英双语冒烟：DirectoryView + 两个对话框直接构造 `SyncPreview` / `TemplatePreview`）、`views/directoryScan.test.ts`（5 文件 0 命中 + 两个既有测试文件不再含被本地化字面量）为本轮回归钉板。
- **插值限制（目录面）**：只用 `{name}` 占位；`Dialog` 的 `description` 允许由「词典片段 + `<span className="font-mono">` 用户数据」拼成，片段自身必须整句可用（en 语序由模板决定，不把中文语序逐段拼英文），词典值内不得出现 HTML / JSX。

## 最近交付证明

- WI：`wi_ws_76862eb920bf9b10`（目录对比视图与同步/模板对话框双语化，`kind: feature`）
- 日期：2026-10-24
- 结果：code_gates passed（9 门禁，attempt 001；`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`views/DirectoryView.tsx` 的过滤组 / 五档过滤项、十个工具栏按钮与其 `title`、`pickerAvailable` 门控的 Web 提示、两个隐藏快照 input 的 `aria-label`、左右 Panel 的 `meta` 来源标识、单侧空态句、`已跳过：左 {left} / 右 {right}` 提示行、下钻说明全部改渲染期取键（Panel `title` / `subtitle` 与树 `label` 仍为根名 / 真实路径）；`components/TreeView.tsx` 的展开 / 折叠 `aria-label` 走 `directory.tree.expand|collapse` 插值；`views/DirectorySyncDialog.tsx` 去掉了自带 `DIRECTION_LABELS` / `MODE_LABELS`，标题 / 描述片段 / 三个分组 / 分组计数 / 空分组 / 空计划 / 忙碌与确认取消 / 镜像删除 `aria-label` 全部取键，`incremental` 仍不渲染删除分组、`totalCount === 0` 仍 disabled；`views/TemplateDialog.tsx` 的标题、三段标签、四个分区、分区计数、空分组、两种冲突原因、忙碌与确认按钮取键，`matched.length === 0` 仍 disabled。新增纯常量 / 纯函数 `views/directoryCopy.ts`（`FILTER_LABEL_KEYS` / `SYNC_DIRECTION_KEYS` / `SYNC_MODE_KEYS` / `countKey(one, other, count)`，无 React / DOM），三处不再各写一份中文映射。词典只在 `directory` 表面成对扩充：5→78 键（新增 73，既有 5 键原样保留），zh 逐字沿用原界面、en 句子式措辞；单复数只在同步合计 / 同步分组 / 模板分区三处拆 `one` / `other`，zh 两条值相同。新增测试 `views/directoryI18n.test.tsx`（26 例：过滤顺序与逐字 zh、十个按钮 + title 双语、picker 门控、隐藏 input、Panel meta、用户数据不翻译、单侧空态、跳过行、下钻说明、图例、展开折叠不改变选中、中英行模型 / 过滤 / 折叠 / 回调序列全等、en 指定表面无汉字、两个对话框的分组 / 空计划 / 计数单复数 / 删除勾选与 `deletePaths` / 冲突原因、共享键映射完备）与 `views/directoryScan.test.ts`（5 文件 0 命中 + `DirectoryView.test.tsx` / `TreeView.test.tsx` 不再含过滤与展开折叠字面量）；`DirectoryView.test.tsx` 断言改取 `zh[FILTER_LABEL_KEYS[...]]` / zh 键，`App.i18n.test.tsx` 两处目录按钮 / 快照 input 断言从中文改为 en 实际文案（壳层测试现在渲染英文目录视图，属预期联动）。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例，未做 tech / design 手合。后续注意：① `App.i18n.test.tsx` 等壳层测试会随视图本地化被动改动，新增视图文案须同步排查壳层里按中文 selector 的断言；② `TreeView` 现在依赖 `useI18n()`，无 Provider 的渲染仍回落 zh，但新增树文案必须同时加 `directory` 成对键并进 `directoryScan` 清单；③ 代码 / CSV / 结构化视图与设置面板仍中文硬编码，收口扫描会命中，属预期；④ 设置面板 WI 必须复用 `opencompare.userSettings` 单键与 `setLanguage`，不得重挂载工作台。
- 历史：外壳接入 WI `wi_ws_a0d69b96e026b9df`（2026-10-23，`App` 启动接线 + 工作台壳层 / 新建对比 / 共享组件文案 + `workbench/sessionDisplay.ts` 渲染期化；`common` 27 键 / `shell` 128 键）；底座 WI `wi_ws_80cc30bb21c00dc3`（2026-10-23，词典 / `I18nProvider` / `resolveInitialLanguage` + `loadInitialLanguage` / `renderWithI18n` / `scanHardcodedChinese`；平台设置与系统语言通道折叠在 `domains/foundation`）。
