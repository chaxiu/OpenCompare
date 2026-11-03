# Domain: i18n

renderer 双语（zh / en）链路：五个表面的成对词典、`I18nProvider` / `useI18n()` 语言上下文、首启语言解析纯函数与只读 loader、两个测试辅助（`renderWithI18n`、中文硬编码扫描器）、**应用外壳接入**（`App` 启动解析 + Provider 挂载、工作台壳层 / 新建对比 / 共享展示组件、会话标题·副标题·统计标签的渲染期解析）、**目录视图面接入**（`DirectoryView` / `TreeView` / 同步与模板对话框 + `views/directoryCopy.ts` 共享键映射）、**设置面板与语言即时切换**（齿轮入口、语言分区、自指标签、串行写盘、失败就地提示、已显示通知条渲染期重译）、**文件级视图接入**（`CodeView` / `CsvView` / `StructuredView`）、**主链路收口**（`SplitPane` 分隔条、平台对话框 filter 名称工厂、稳定 code + 词典键映射），以及 `i18n/mainScan.test.ts` 全主链路零汉字钉板与 `<html lang>` 跟随界面语言。平台侧设置读写与系统语言通道归 `foundation` 域，本域只消费其契约。

## 范围

- **词典与模块（`src/renderer/src/i18n/`）**：`messages/zh/{common,shell,directory,files,settings}.ts` 与 `messages/en/{…}.ts` **同名成对**；`messages/index.ts` 固定聚合五个表面，对外只暴露合并后的 `zh` / `en` 与 `messages: Record<Language, …>`。zh 是键的单一事实源（命名空间点号，如 `common.cancel` / `shell.empty.title`），`en` 每文件用 `Record<keyof typeof zh同类, string>` 声明，缺键 / 多键在 `pnpm typecheck` 报错。
- **`I18nProvider` + `useI18n()`**：值形状 `{ language, setLanguage, t }`；`t(key, params?)` 只支持 `{name}` 简单插值（单一正则，缺失占位符原样保留，值按纯文本返回），词典值只允许字符串，不接受 HTML / React 节点。Provider 外调用不抛错，回落 `language: 'zh'` 与 zh 的 `t`（既有叶组件单测无需包 Provider）。
- **首启语言解析（纯函数 + 薄 loader）**：`resolveInitialLanguage({ storedLanguage, systemLocale })`——记录为 `zh` / `en` 时以记录为准；无记录（`null` / `undefined` / 非法值 / 空串）时 `systemLocale` 以 `zh` 开头（大小写不敏感，覆盖 `zh` / `zh-CN` / `zh-Hant` / `ZH-cn`）→ `zh`，其余（`en-US` / `fr-FR` / `''` / 未知）→ `en`。`loadInitialLanguage(platform)` 只调 `readUserSettings()` 与 `systemLocale()`，**从不写记录**，读失败按无记录处理不抛。
- **测试辅助**：`testing.tsx` 的 `renderWithI18n(ui, language?)` 在 Provider 下渲染（允许强制 zh / en，默认 zh）；`src/shared/i18n/scanHardcodedChinese.ts` 接受显式路径清单（文件或目录递归），返回 `{ file, line, text }` 命中，`\p{Script=Han}` 直接匹配源码（注释 / `aria-label` / `title` / `data-testid` 不豁免），可排除 `*.test.*` 与 `i18n/messages/**`。
- **启动接线（`App.tsx`）**：`loadInitialLanguage(platform)` 解析期间只渲染**无文字品牌引导帧**（仅图标 / 骨架，无文本节点、无 heading / button / tablist），settle 后以结果为 `initialLanguage` 挂载 `<Workbench />` 一次（平台订阅与 `compareRequestsReady` 各一次，不出现先中文后英文两批渲染）。语言值**只**作 `initialLanguage`，不得作为 `Workbench` / 视图的 React `key`。`?perf=1` 测量窗口保持同步直渲（不读设置、不挂 Provider、不加启动门）。
- **工作台外壳文案**：顶栏（新建对比 / 打开文件 / 打开文件夹 / 设置及 `title`；无品牌副标题、无样本入口、无 scene 分段控件——`shell.viewSwitcher.label` 中英已删）、空 / 载入 / 错误态、会话标签条入参、通知条（拖拽单项与多项、取消、已跳过、快照导出 / 导入结果、下钻不支持、符号链接指向目录、返回上级目录两种结果、`来源目录对比：…`）、关闭未保存确认对话框、目录对比进度条（`aria-label` / 阶段文案 / 三个计数句 / 已处理字节 / 取消按钮与完成通知）、状态栏标签与 `CompositionLegend`、平台选择器与保存对话框 `title`——全部渲染期经 `t(key, params)`。
- **会话显示渲染期化（`workbench/sessionDisplay.ts`，纯函数）**：输入 `WorkbenchSession` 输出 `{ title, subtitle, stats: readonly { key, value, tone? }[] }` 的 key + 参数；分支只按会话**身份**（样本 id / `scene` / `adhoc` / `directory` / `sides`），不读 `session.stats[i].label`。四个内置样本标题 / 副标题改词典键（离线不得直接展示 fixture 中文）；运行时会话标题由两侧名称 / 真实根路径 / 文件名（用户数据不翻译）+ 本地化文件类型名组成；统计条为稳定角色 key（源文件 / 目标文件 / 差异 / 左右行数 / 冲突块 / 主键列 / JSON 节点 / 样本文件），代码视图冲突数覆盖按稳定 key 判断。
- **新建对比对话框**：标题 / 描述 / 左右路径标签 / 输入占位 / `Enter 提交 · Esc 关闭` 提示 / 取消 / 建立对比 / 两个选择器按钮及 `title` 全部走词典；校验失败按 `compareRequest` 稳定错误码（`MISSING_SIDE` / `DUPLICATE_SIDE` / `EMPTY_PATH` / `UNKNOWN_SCHEME` / `UNKNOWN_ACTION` / `NOT_FOUND` / `TYPE_MISMATCH` / `UNSUPPORTED_FILE_TYPE` / `ACCESS_DENIED`）取文案并保留路径参数（`parseManualPaths` / `resolveCompareRequest` 不改）；`role="alert"` 外壳始终当前语言，未知底层 I/O 失败只让**详情**沿用原始 message。
- **共享展示组件**：`Dialog` 关闭按钮可访问名；`SessionTabs` 的 tablist 名、未保存标记（`title` + `sr-only`）、关闭按钮名（`关闭 {title}` → `Close {title}`）；`StatusBar` / `DiffBadge` / `diffSemantics` 的差异语义标签改为 `DIFF_LABEL_KEYS: Record<DiffStatus, MessageKey>` 渲染期解析，`DIFF_STATUSES` 与颜色类不变。
- **文件类型稳定标识（`workbench/fileKinds.ts`）**：`DrilldownTarget.label` 由中文改为 `FileKind = 'code' | 'csv' | 'tsv' | 'json' | 'yaml'`，显示名渲染期取词典；类型不一致按稳定标识判断，`mixed-family` / `unsupported-type` 带 code 由外壳本地化；会话 id / `sides` / 比较结果 / 缓存调用序列不变。
- **目录视图面**：过滤组可访问名与五档选项改 `FILTER_LABEL_KEYS` 渲染期解析（顺序仍由 `DIRECTORY_FILTERS` 决定）；工具栏按钮文本与 `title`、隐藏 file input 的 `aria-label`、`pickerAvailable === false` 的 Web 提示、左右 Panel `meta`（源目录 / 目标目录 / 快照）、单侧空态句、跳过提示行、下钻说明全部走词典；Panel `title` / `subtitle` / `TreeView` 的 `label` 仍是用户数据不翻译。`TreeView` 展开 / 折叠 `aria-label` 走词典插值（`Expand {name}` / `Collapse {name}`），根名、行 `title` 与计数前缀不变。
- **同步预览对话框**：标题（方向 · 模式 + 同步预览）、描述（目标根 + 只读样本说明 + 合计）、三组标题与计数、空分组「无」、空计划整句、取消 / 确认 / 进行中、删除项复选框 `aria-label`、组级「全选 / 清空」、底部「本次将执行」汇总、无执行项原因全部走词典；第四类分组 `directory.sync.group.align`（待对齐链接时间）与四占位符汇总句；`SYNC_DIRECTION_KEYS` / `SYNC_MODE_KEYS` 取代对话框自带标签；确认禁用由 `syncPreviewAction(...).executable` 单点决定、空态 / 原因句由 `syncPreviewGuidance` 派生（不再内联）；忙碌态「取消」调 `onAbort`；`shell.notice.syncCancelled` / `syncRefreshFailed`（写入已完成 + 三计数 + 本地化原因）/ `syncVerifyFailed`（不一致条数 + 路径样例）三个整句模板由 `Workbench` 按错误类型渲染（danger）。
- **模板归位对话框**：选根步（标题 / 说明 / 只读标 / B 与输出根输入 / 选择按钮与 title / 拖入提示 / `Build dry run` / 扫描中）与 Dry-run 步（五分区标题含「已落位」/ 分区计数 / 空分组 / 冲突原因 / 输出根状态 / 列表 `aria-label` / 逐行勾选名 / 覆盖与目录占用标记 / 可执行与拒绝计数 / `Place files` / 处理中）全部走词典；动作列与显式移动 17 条键（`action.copy|move`、`moveCheck`、`moveChecked`、`copyCount` / `moveCount`、五个移动失败码、四个结果键、两个复核键）；`directory.template.place` 空闲文案为 `Place files` / `确认归位`，不新增第三动作词（无 `Extract` / `提取`）；拒绝句按 `TemplateRootError` 稳定码一一对应，不含平台中文 message 或 IPC 包装。
- **同步失败与快照 / 样本失败的身份化**：`workbench/syncFailureCopy.ts` 只认 `SyncTargetError`（取 `path` + `code` → `shell.sync.error.target` + 嵌套 `shell.sync.reason.<CODE>`）与 `SyncRefreshError.reason` 的稳定码（正则提码后同表映射，未识别落 `shell.sync.reason.fallback`）；`snapshotOps` 改为 `snapshotImportFailure` / `snapshotContentFailure` 返回稳定 code（+ `path`），`snapshotCopy.ts` 映射 `shell.snapshot.error.*`；`loadSampleSessions` 抛 `SampleLibraryError('read-failed')`（英文诊断）由 `Workbench` 映射 `shell.error.sampleRead`；`FilePairError` 兜底 message 改英文诊断、`code` 不变。非 React 模块**不得自己解析语言**，未知错误仍走 `detailNotice` 原文。
- **通知条渲染期解析**：`Notice = { kind: 'copy'; key; params? } | { kind: 'detail'; text }`，`params` 值可嵌套 `{ message: MessageKey }`，`noticeText(notice, t)` 递归解析——已显示中的通知随切语言立即重译；`info` / `danger` 语气与清除时机不变。
- **全主链路扫描钉板（`i18n/mainScan.test.ts`）**：`SCAN_ROOTS` 覆盖 `workbench` / `views` / `components` / `i18n` / `App.tsx` / `main.tsx` / `env.d.ts`，断言 0 命中；第二组断言「清单枚举的源码文件 == `src/renderer/src` 下除未覆盖目录外的实际源码」，新增文件不入清单即失败；`UNCOVERED` 逐条登记 `{ path, reason }`（`perf/**` 测量探针、`platform/**` Web 原始诊断）并断言路径存在、reason 非空、与扫描根不重叠。
- **术语表与英文卫生（`i18n/messages.test.ts`）**：`GLOSSARY` 锁定 8 个 canonical 美式词形（`comparison` / `difference` / `conflict` / `snapshot` / `sync` / `template` / `key column` / `session`）至少各命中一次；`BANNED_VARIANTS`（`Synchronisation` / `Snap shot` / `Comparision` / `Cancelation` / `colour` / `behaviour`）命中 0；变更块 / 差异统计一律 `difference(s)`、`diff` 只用于视图 / 模式名；en 文案非空、无 `TODO` / `未翻译`、无汉字、无双空格、已 trim（`INLINE_COPY_KEYS` 例外）。
- **`<html lang>` 跟随界面语言**：`i18n/htmlLang.ts` 单一映射（`en` → `en`、`zh` → `zh-CN`）+ `applyHtmlLang`（`typeof document === 'undefined'` 时 no-op）；`I18nProvider` 用 `useLayoutEffect` 在首帧与每次切换后同步，`App` 启动与 `renderWithI18n` 共用该点；`index.html` 静态 `lang` 为英文默认 `en`（仅首帧兜底，不重复写入）。
- **i18n 测试单一来源（`i18n/localeTable.ts`，测试专用）**：`LOCALE_ROWS` 由 `Object.keys(zh)` 逐键派生 `{ key, zh, en }`，`localeText(language, key, params?)` 复用 `interpolate`；`App.i18n.test.tsx` / `views/directoryI18n.test.tsx` / `views/TemplateDialog.test.tsx` / `App.theme.test.tsx` 共用，禁止手抄 locale JSON；两文件合计 815 行、只保留 5 条关键路径用例（运行时切换含通知条同节点重译、`?perf=1`、locale 表单源与缺键 fail-closed、目录视图 + 同步 / 模板同源取值、EACCES / EPERM 与刷新失败双语等值）。

## 验收

- **ac-dict-pairs / ac-dict-keyset / ac-dict-per-surface**：五个表面 zh / en 文件一一对应；合并后顶层键集合完全相等，且逐表面相等（不靠跨表撞键掩盖缺失）。
- **ac-dict-nonempty / ac-dict-placeholders / ac-dict-en-no-han / ac-dict-zh-keeps-text**：所有值 `trim()` 非空、无占位串；同键 `{placeholder}` 集合相同；en 值汉字命中 0；zh 值（除纯占位符）至少含一个汉字。
- **ac-t-interpolate / ac-t-provider-language / ac-t-no-provider-zh / ac-render-helper**：插值替换全部同名占位符、缺失原样保留、标记按纯文本返回；`setLanguage` 后同组件重渲染且 `language` 与 `t` 同步；Provider 外不抛错且回落 zh；`renderWithI18n` 可强制语言、默认 zh。
- **ac-resolve-zh-locale / ac-resolve-default-en / ac-resolve-stored-wins / ac-resolve-invalid-stored / ac-resolve-no-write**：`zh*` 系统语言 → zh；其余与空值 → en；记录优先；非法记录按无记录；loader 只读不写、读失败不抛。
- **ac-scan-han**：扫描辅助对中文注释 / `aria-label` 给出命中（行号 + 片段），纯英文返回空，排除规则生效。
- **ac-app-startup-en / ac-app-startup-zh / ac-app-startup-stored-wins / ac-app-startup-gate / ac-app-perf-branch**：按记录 / 系统语言渲染对应语言首屏；settle 前 DOM 无文本节点、无 heading / button / tablist，settle 后工作台只挂载一次；`?perf=1` 不读设置、不显示启动帧。
- **ac-shell-header-copy / ac-view-switcher-key-gone / ac-empty-state-copy / ac-session-tabs-copy**：顶栏四动作与 `title` 随语言切换，无品牌副标题 / 样本入口 / scene 分段控件（`shell.viewSwitcher.label` 两侧均无、四场景键保留）；空态文案为真实路径叙事并指路设置；tablist 名与关闭按钮名当前语言，脏标记有当前语言提示。
- **ac-sample-session-display / ac-runtime-session-display / ac-stat-conflict-by-key**：样本四标签 en 下不出现 fixture 中文、zh 下逐字一致且 id 集合 / 顺序相同；真实会话副标题路径原样、文件类型名本地化；冲突统计取运行时值，源码无 `stat.label` 与中文字面量比较。
- **ac-close-unsaved-dialog / ac-progress-and-cancel / ac-cancel-notice / ac-drag-notices / ac-notice-skipped-and-snapshot / ac-picker-titles**：关闭确认对话框、进度条三段计数与取消、取消通知、拖拽三种提示、已跳过与快照 / 返回上级通知、平台对话框 `title` 在中英下均为当前语言（会话标题 / 路径作为参数原样插入）。
- **ac-new-compare-copy / ac-new-compare-validation / ac-new-compare-unknown-io**：对话框全部可见文案与 `title` 当前语言、en 无汉字；四种校验失败按稳定码取当前语言文案并保留路径；未知 I/O 失败只保留原始详情。
- **ac-shared-component-copy / ac-han-scan-shell / ac-en-smoke-no-han / ac-no-extra-work / ac-existing-suite**：`Dialog` / 差异标签 / 图例当前语言且 zh 值不变；显式清单 0 汉字命中；en 可见文本无汉字；本地化不引入额外扫描 / 会话（`listDirectory` / `digestFiles` / `readTextFile` 次数相同）；`pnpm test` 全绿。
- **ac-filter-copy / ac-toolbar-copy / ac-picker-title-gate / ac-snapshot-input-aria / ac-panel-meta / ac-panel-title-user-data / ac-empty-filter-copy / ac-skipped-line / ac-drilldown-hint / ac-tree-toggle-aria / ac-legend-en**：目录面五档过滤、八个工具栏按钮与 `title`、picker 提示门控、隐藏 input `aria-label`、Panel `meta` 与用户数据不翻译、单侧空态、跳过行、下钻说明、展开 / 折叠名、图例在中英下逐项正确。
- **ac-sync-dialog-copy / ac-sync-dialog-groups / ac-sync-dialog-empty / ac-sync-delete-aria / ac-sync-dialog-executable-copy / ac-sync-dialog-busy-disabled**：同步对话框标题 / 描述 / 分组 / 空分组 / 删除 `aria-label` / 组级按钮 / 汇总句 / 原因句当前语言；删除初始未勾且不进 `deletePaths`；`busy` 时确认与勾选禁用、取消不禁用并调 `onAbort`。
- **ac-sync-cancel-notice-bilingual / ac-sync-verify-failed-copy / ac-sync-write-failure-localized**：三个通知整句模板键集相等、占位符一致、en 零汉字；写入拒绝按系统码本地化且带目标路径，未知码落兜底；验证失败含条数与路径样例、不得出现成功句。
- **ac-template-dialog-copy / ac-template-entry-copy / ac-template-reason-copy / ac-template-move-copy**：选根 + Dry-run 两步、入口拒绝 30 键、冲突原因、动作 / 移动 17 键全部成对且 en 零汉字；确认禁用只由 `executableCount === 0` 决定；拒绝句只消费稳定码；不存在 `Extract` / `提取` 第三动作词。
- **ac-html-lang**：`htmlLang` 映射只有一处；Provider 首帧与切换后 `document.documentElement.lang` 同步；无 DOM 环境 no-op；`index.html` 静态 `lang` 为 `en` 且不出现 `zh-CN`。
- **ac-locale-table-single-source / ac-locale-test-budget**：`localeTable.ts` 由 zh 键集派生、产品运行时代码不 import；断言用 `localeText()` 等值比较（不退回片段 `toContain`）；两文件合计 ≤900 行、5 条关键路径用例，不加逐键用例。
- **ac-main-scan-board / ac-glossary / ac-en-hygiene**：主链路扫描根 0 命中且清单与实际源码文件集合相等，未覆盖目录逐条登记理由；术语表 8 词形命中、禁用变体 0 命中、`diff` 只用于视图名；en 文案无占位 / 汉字 / 双空格。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿，不新增门禁条目。

## 非目标

- 不做设置面板的更多分区（主题 / 快捷键）、持久化草稿、批量保存、成功 toast（`settings.saved` 保持未使用）；不做系统语言实时跟随。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/compareRequest.ts`、`src/shared/platform/**` 的文案或行为；不改 `src/shared/fixtures/**` 数据与 `SessionStat` 类型语义（不改 fixture 中文）。
- 不改会话 id 规则、对比 / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；不改 `code_gates.json` 条目。
- 不做 `perf/**` 与 `platform/**` 的 i18n 改造，只作为未覆盖目录登记理由。
- 不引入 i18next / react-intl 或任何运行时依赖；不做机翻；不新增专用 code gate。
- 不新建第二套存储（不写 electron-store、不加第二个 localStorage key、不加配置文件）；存储实现归 `foundation`。
- 不改词典结构：不新增第三语言、不新增第六表面，词条只在既有五表面成对扩充，不改既有键语义与自指标签约定。
- 不改 `App.tsx` 的启动解析、无文字品牌帧与 Provider 挂载；不改 `loadInitialLanguage` / `resolveInitialLanguage` 语义。
- 不新增语言、不做 RTL、不写 `<html dir>`、不改 `<title>` / meta 与视觉样式；`index.html` 静态 `lang` 只是首帧兜底。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与证据、README / AGENTS / docs；不发版、不打 tag、不 push。
- 行为契约（调用序列、会话身份、过滤 / 选中 / 滚动、错误 code、平台 filter 的 `extensions`）不得因本地化改动。

## 实现约束

- `Language = 'zh' | 'en'`（`src/shared/platform/types.ts`），默认 `en`；`UserSettings` 只含 `language`，读取忽略未知字段、非法语言视为 `null`。
- 五表面固定 `common` / `shell` / `directory` / `files` / `settings`；新增表面必须成对并进 `messages/index.ts` 聚合；插值只 `{name}` 单一正则，不引模板引擎；`t` 的键类型为合并后 zh 键联合类型 `MessageKey`。
- Web 设置单键固定 `opencompare.userSettings`，内存回退是模块级变量；新通道只加在 `channels.ts`，preload 只转发，renderer 不得 import Electron。
- 词典归属：跨表面共享键（差异语义、文件类型、通用按钮、`Sessions`、`Close`）放 `common`；工作台壳与新建对比放 `shell`；目录面放 `directory`；文件级按视图分组 `files.code|merge|csv|structured|notice.*`；当前就是英文技术词的（`Accept Ours/Theirs/Both/Base`、`base` / `ours` / `theirs`、`JSON` / `YAML`）中英同值并在 `LATIN_ONLY_KEYS` 登记；纯符号占位（`∅` / `—` / `#` / `\u00a0`）、路径 / 正文 / 默认文件名不建键；千分位沿用 `toLocaleString('en-US')`。
- **非 React 模块不解析语言**：`snapshotOps` / `loadSampleSessions` / `directoryCompare` / `fileIO` 只产出稳定 code + 参数，由 `Workbench` 渲染期 `t(...)`；`t()` 结果不得缓存进模块级常量；平台对话框 filter 名称用 `textFileFilter(name)` / `snapshotFileFilter(name)` 纯工厂由调用点注入译文，`extensions` 不变。
- **通知条**用最小 `Notice` 结构，嵌套片段在 `NoticeParams` 用 `{ message, params? }` 表达、渲染期递归解析；不要给 `Workbench`、视图或设置对话框加语言相关 `key`，切换只触发 context 消费组件重渲染。
- **设置面板**：`SettingsDialog.tsx` 放 `workbench/`，props 至少 `platform` + `onClose`；语言选项标签只来自 `messages[target]['settings.language.name']`（或 `languageSelfLabel`），禁止字面量 `'简体中文'` / `'English'` 或为标签新增键；入口按钮在顶栏右侧最后一位、不接 `directoryBusy` 的 disabled。
- **切换时序固定**：`setLanguage(next)` → `useRef` 串行 promise 队列里 `writeUserSettings({ language: next })`；写盘不阻塞 UI、不关面板、不显示 loading；失败**不回滚**语言、不重读设置，只存 `cause.message` 并以 `t('settings.saveError', { reason })` 渲染 `role="alert"`，下次成功清空，关闭重开不残留。
- **扫描清单纪律**：清单写成常量数组供测试遍历；`mainScan` 的 `SCAN_ROOTS` 整目录覆盖主链路，逐文件清单（`shellScan` / `directoryScan` / `filesScan`）作为分层钉板保留；新增含中文的 UI 文件必须同时登记，否则视为未覆盖；`i18n/messages/**` 自身不受扫描约束，业务源码必须零汉字（注释也不豁免）。
- **测试写法**：en 用 `renderWithI18n(ui, 'en')`，zh 断言取 `zh[key]` 或 `localeText('zh', key)`；App 级用 `localStorage['opencompare.userSettings']` 预置记录 + `await screen.findByRole(...)`；不对含临时路径的整棵 DOM 做全量汉字扫描，只对指定表面元素断言；jsdom 用 `// @vitest-environment jsdom`，纯解析 / 词典测试保持 node 环境。
- **`<html lang>` 纪律**：映射只在 `i18n/htmlLang.ts` 定义一次（禁止组件内三元字面量），`I18nProvider` 是唯一写入点（`useLayoutEffect` 首帧生效、切换同步），`applyHtmlLang` 先判 `document` 存在；`documentElement.lang` 不进 React 渲染树、不作 `key`；`index.html` 静态 `lang` 取 `en`。
- **测试单一来源**：`localeTable.ts` 只做派生、产品运行时代码不得 import；断言用 `localeText()` 等值比较，不退回 `toContain('permission denied')` 这类片段（中文 detail 的英文尾巴也会命中）。

## 最近交付证明

- WI：`wi_intake_a2dec1ffa5a717f2`（renderer i18n 测试收敛为 locale 表单一来源 + 同步失败提示双语复核；`kind: test/refactor`）
- 日期：2026-11-02
- 结果：`code_gates` passed（21 门，attempt 001，`.munk/runs/run_intake_a2dec1ffa5a717f2/code-gates/attempts/001`）；`pnpm test` 114 files / 1744 passed + 1 skipped（1745）、31.57s；覆盖复测 Statements 89.94% / Branches 82.74% / Functions 89.39% / Lines 92.54%，四项均不低于基线。
- 覆盖摘要：① 新增测试专用 `src/renderer/src/i18n/localeTable.ts`（32 行）——`LOCALE_ROWS` 按 `Object.keys(zh)` 逐键生成 `{ key, zh, en }`，`localeText(language, key, params?)` 复用 `interpolate`；产品运行时代码不 import，四个测试文件共用。② 两文件 2245 → **815 行**（`App.i18n.test.tsx` 928→234、`views/directoryI18n.test.tsx` 1317→581），用例 60 → 5 条关键路径：运行时语言切换（含同一通知条 DOM 节点重译）、`?perf=1` 分支、locale 表单源 + 缺键 fail-closed、目录视图与同步 / 模板对话框同源取值、EACCES / EPERM 写入拒绝与刷新失败的双语等值断言。③ `.toContain(` 57 → 2（只剩路径与 OS code 片段）、`readFileSync` 0。④ `TemplateDialog.test.tsx` 两个文案断言改词典取值，`App.theme.test.tsx` 一条改 `settings.saveError` 插值，`theme/themeSources.test.ts` 零文案断言原样保留。⑤ 全仓用例 1800 → 1745（−3.1%，≤5%），测试总行数 46,955 → 45,533。⑥ `i18n/messages/**`、`package.json#version`（0.2.16）、`.munk/code-gates.json`、`vitest.config.mts` 零 diff；`App.smoke.test.tsx` / `messages.test.ts` / `mainScan.test.ts` 未改。
- 注：① **被推翻的假设**：这两个文件原被当作 i18n 的行为回归网，实际 60 条里绝大多数是逐键抄写文案——只在词典成批改动时一起变红，对「语言切换 / 缺键回落 / 同步失败本地化」三条真回归没有区分度；收敛到 5 条等值断言后覆盖未掉点（两文件原贡献约 0.3pp）。② **缺键 fail-closed 靠表本身**：任何按语言取值的 helper 都必须保留 `LOCALE_ROWS.length === Object.keys(zh).length` 与逐行等值断言，否则删键会静默跳过。③ EACCES / EPERM 的 en 文案由 `shell.sync.error.target` + 嵌套 `shell.sync.reason.<CODE>` 渲染期解析，断言必须与词典插值结果 `toBe` 等值，不要退回 `toContain` 片段。④ 后续新增 i18n 断言直接用 `localeText()`，不要再往两文件加逐键用例——900 行 / 5 条是硬上限，需要更多覆盖时加深这 5 条关键路径。⑤ 本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），验收落档在 `qa/locale-table-tests.md`。
