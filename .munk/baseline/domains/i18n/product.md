# Domain: i18n

renderer 双语（zh / en）链路：五个表面的成对词典、`I18nProvider` / `useI18n()` 语言上下文、首启语言解析的纯函数与只读 loader、两个测试辅助（`renderWithI18n`、中文硬编码扫描器），以及**应用外壳接入**——`App` 启动解析 + Provider 挂载、工作台壳层 / 新建对比 / 共享展示组件的可见文案、会话标题·副标题·统计标签的渲染期解析。平台侧设置读写与系统语言通道（`readUserSettings` / `writeUserSettings` / `systemLocale`）归 `foundation` 域，本域只消费其契约；四个业务视图（`views/**`）与设置面板的语言切换 UI 归后续 WI。

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

## 非目标

- 不做设置面板 / 齿轮入口 / 语言切换 UI 与写盘（归「设置面板与即时切换」WI）；外壳接入 WI 只消费 `initialLanguage`，不做 `setLanguage` 交互。
- 不做 `src/renderer/src/views/**` 的任何文案（目录树、四态过滤、同步 / 模板对话框、代码 / CSV / 结构化视图、`TemplateDialog`、`DirectorySyncDialog`），也不做这些视图的「切换不重算」验收。
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

## 最近交付证明

- WI：`wi_ws_a0d69b96e026b9df`（工作台外壳与新建对比双语化：启动接线 + 壳层文案 + 会话显示渲染期化，`kind: feature`）
- 日期：2026-10-23
- 结果：code_gates passed（9 门禁，attempt 001；`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：`App.tsx` 启动调 `loadInitialLanguage(platform)`，解析期只渲染无文字品牌帧（无文本节点 / heading / button / tablist），settle 后以结果作 `I18nProvider initialLanguage` 挂载一次 `<Workbench platform={platform} />`（语言值不作 `key`；平台订阅与 `compareRequestsReady` 各一次），`?perf=1` 分支保持同步直渲不读设置；`Workbench.tsx` 的顶栏 / 视图切换 / 三态 / 标签条入参 / 通知条 / 关闭确认对话框 / 目录进度与取消 / 状态栏与 `CompositionLegend` / 选择器与保存 `title` 全部改渲染期取键；新增纯函数 `workbench/sessionDisplay.ts`（样本 id / `scene` / `adhoc` / `directory` / `sides` 决定键，标题 / 副标题 / 稳定统计 key + 用户数据片段，缺失侧用稳定标记）、`NewCompareDialog.tsx` 按 `compareRequest` 稳定错误码取文案（未知 I/O 只保留原始详情）、`Dialog` / `SessionTabs` / `StatusBar` / `DiffBadge` / `diffSemantics` 的 `DIFF_LABEL_KEYS` 接词典、`fileKinds.label` 改稳定文件族标识（`code|csv|tsv|json|yaml`）并由 `directoryCompare.ts` 同步使用。词典只在 `common`（27 键）/ `shell`（128 键）成对扩充，zh 逐字沿用原界面、en 句子式措辞。新增测试 `App.i18n.test.tsx`（启动 en/zh/记录优先/无文字启动门/perf 分支；英文顶栏与三态、标签条、样本与运行时显示、冲突统计按 key、关闭确认、进度取消、三类拖拽提示、跳过与快照、校验码、未知 I/O、下钻两种返回、选择器 title、中英同平台调用序列、无汉字冒烟）、`components/sharedI18n.test.tsx`、`workbench/sessionDisplay.test.ts`、`workbench/shellScan.test.ts`（显式 10 文件清单 0 命中 + `stat.label` 中文比较 0 命中）；`App.test.tsx` / `App.snapshot.test.tsx` 预置 `opencompare.userSettings` zh 记录并等待首屏，`TreeView` / `DirectoryView` 两处 `DIFF_LABELS` 断言改取 zh 词典值。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，未做 tech / design 手合。后续注意：① 双语链路现已生效，`views/**` 与设置面板仍大量中文硬编码，收口扫描会命中，属预期；② 新增壳层文案必须同时加 `common` / `shell` 成对键并进 `shellScan` 清单；③ 设置面板 WI 必须复用 `opencompare.userSettings` 单键与 `setLanguage`，不得重挂载工作台；④ `SessionStat.label` 已不被渲染 / 判断，后续新增统计须走 `SessionDisplayStat.key`。
- 历史：底座 WI `wi_ws_80cc30bb21c00dc3`（2026-10-23，词典 / `I18nProvider` / `resolveInitialLanguage` + `loadInitialLanguage` / `renderWithI18n` / `scanHardcodedChinese`；平台设置与系统语言通道折叠在 `domains/foundation`）。
