# Domain: i18n

renderer 双语（zh / en）能力边界：五个表面成对词典、`I18nProvider` / `useI18n()` 语言上下文与首启语言解析、渲染期 `t()` 文案解析、`<html lang>` 跟随界面语言、主链路零汉字扫描钉板。平台侧设置读写与系统语言通道（`readUserSettings` / `writeUserSettings` / `systemLocale`）归 `foundation` 域，本域只消费其契约。

## 范围

- **词典与键集**：五个表面（`common` / `shell` / `directory` / `files` / `settings`）在 `messages/{zh,en}` 同名成对，`messages/index.ts` 固定聚合并只暴露 `zh` / `en` / `messages`；zh 为键的单一事实源（命名空间点号），en 每文件按 `Record<keyof typeof zh同类, string>` 声明，缺键 / 多键由 `pnpm typecheck` 报错。
- **语言上下文**：`I18nProvider` 值形状 `{ language, setLanguage, t }`；`t(key, params?)` 只支持 `{name}` 单正则插值，缺失占位符原样保留，值按纯文本返回；词典值只允许字符串，不接受 HTML / React 节点。
- **无 Provider 回落**：Provider 外 `useI18n()` 不抛错，返回 `language: 'zh'` 与 zh 的 `t`；测试辅助 `renderWithI18n(ui, language?)` 默认 `zh`。
- **首启语言解析**：`resolveInitialLanguage({ storedLanguage, systemLocale })` 为纯函数——记录为 `zh` / `en` 时以记录为准；无记录（含非法值 / 空串）时 `systemLocale` 以 `zh` 开头（大小写不敏感）→ `zh`，其余 → `en`；`loadInitialLanguage(platform)` 只读不写。
- **启动接线**：`App.tsx` 解析期间只渲染无文字品牌引导帧（无文本节点、无 heading / button / tablist），settle 后以解析结果作 `initialLanguage` 挂载工作台且只挂载一次；语言值不作任何 React `key`；`?perf=1` 分支同步直渲测量窗口。
- **渲染期解析**：会话标题 / 副标题 / 统计由 `workbench/sessionDisplay.ts` 按会话身份产出 key + 参数（不读 `stat.label`），统计与 `fileKinds` 改用稳定标识；通知条 `Notice`（`copy` 存 key + params、`detail` 存原文）经 `noticeText` 统一解析，已显示通知随切语言重译。
- **失败本地化**：已知失败在边界按稳定 code 产出（同步 `syncFailureCopy`、快照 `snapshotCopy`、样本 `sampleErrorNotice`、文件对 `unsupported-type` / `mixed-family`），由 `Workbench` 渲染期取键；未知底层错误仍走 `detail` 原样透传。
- **词条覆盖表面**：顶栏 / 空态 / 会话标签条 / 通知 / 进度与取消 / 状态栏 / 图例 / 平台对话框 `title`、新建对比对话框、目录视图（过滤、工具栏、面板 `meta`、空态、跳过行、下钻说明、树展开折叠）、同步与模板归位对话框、设置面板与语言即时切换、代码（双栏 Diff + 三向合并）/ CSV / 结构化三视图、`SplitPane` 分隔条可访问名、`fileIO` / `snapshotOps` 的 filter 名称工厂。
- **`<html lang>` 跟随界面语言**：`i18n/htmlLang.ts` 单一映射（`en` → `en`、`zh` → `zh-CN`），`I18nProvider` 用 `useLayoutEffect` 作唯一写入点；`index.html` 静态 `lang` 为首帧兜底 `en`。
- **扫描与钉板**：`scanHardcodedChinese` 接受显式清单扫 `\p{Script=Han}`（注释 / `aria-label` / `title` 不豁免）；`i18n/mainScan.test.ts` 覆盖全主链路，未覆盖目录仅 `perf/**` 与 `platform/**`（逐条登记理由）；`i18n/messages.test.ts` 守术语表 / 禁用变体 / 文案卫生；`App.smoke.test.tsx` 中英双语冒烟。
- **测试文案单一来源**：测试专用 `i18n/localeTable.ts`（`LOCALE_ROWS` + `localeText`）派生期望文案，产品运行时代码不得 import。

## 验收

- **ac-dict-pairs**：`messages/zh` 与 `messages/en` 的五个表面文件名一一对应，无单边文件。
- **ac-dict-per-surface**：逐表面比较，zh 与 en 键集合完全相等（合并后顶层键集随之相等），防止跨表撞键掩盖缺失。
- **ac-dict-nonempty**：所有词典值 `trim()` 后非空，且不含 `TODO` / `未翻译` 占位串。
- **ac-dict-placeholders**：同一键在 zh 与 en 中的 `{placeholder}` 名称集合完全相同。
- **ac-dict-en-no-han**：en 词典所有值 `\p{Script=Han}` 命中数为 0。
- **ac-dict-zh-keeps-text**：zh 每个值（纯占位符值除外）至少含一个汉字。
- **ac-t-interpolate**：`t` 替换全部同名占位符；缺失占位符原样保留 `{name}`；含标记的值按纯文本返回，不解析。
- **ac-t-provider-language**：初始 `language` 等于传入值；`setLanguage('en')` 后同一组件 `language` 与 `t` 同步切 en。
- **ac-t-no-provider-zh**：Provider 外 `useI18n()` 不抛错，`language` 为 `zh`，`t` 返回 zh 词条。
- **ac-render-helper**：`renderWithI18n(<Probe />, 'en')` 中 `language` 为 `en`；不传第二参为 `zh`。
- **ac-resolve-zh-locale**：无记录 + `zh` / `zh-CN` / `zh-Hant` / `ZH-cn` → `zh`。
- **ac-resolve-default-en**：无记录 + `en-US` / `fr-FR` / 空串 / `undefined` → `en`。
- **ac-resolve-stored-wins**：记录 `zh` + 系统 `en-US` → `zh`；记录 `en` + 系统 `zh-CN` → `en`。
- **ac-resolve-invalid-stored**：记录为 `de` / 空串 / 非字符串按「无记录」处理，结果与系统语言矩阵一致。
- **ac-resolve-no-write**：`loadInitialLanguage` 只调 `readUserSettings` 与 `systemLocale`，`writeUserSettings` 调用 0 次；读失败按系统语言判定且不抛。
- **ac-scan-han**：扫描辅助对含中文注释 / `aria-label` 的文件给出命中（行号与片段），纯英文文件返回空；排除 `*.test.*` 与 `i18n/messages/**` 生效。
- **ac-scan-zero**：全主链路扫描根命中数组为 `[]`（注释、`aria-label`、`title` 不豁免），排除仅限 `*.test.*` 与 `i18n/messages/**`。
- **ac-scan-roots-complete**：`SCAN_ROOTS` 为常量数组，递归枚举到的文件集合等于 `src/renderer/src` 实际源码文件集合，新增文件未入清单即失败。
- **ac-uncovered-listed**：`UNCOVERED` 逐条登记 `perf/**`（测量探针）与 `platform/**`（Web 原始诊断），路径真实存在、理由非空、与扫描根互不覆盖。
- **ac-app-startup-en**：无记录 + `systemLocale` 为 `en-US` / `fr-FR` 时首屏出现英文顶栏、英文空态标题与主按钮，无中文空态标题。
- **ac-app-startup-zh**：无记录 + `systemLocale` 为 `zh-CN` / `zh-Hant` 时首屏为现有中文空态标题与按钮。
- **ac-app-startup-gate**：读取未 settle 时可见 DOM 无任何文本节点、无 heading / button / tablist；settle 后工作台出现且启动期只挂载一次（平台订阅与 `compareRequestsReady` 各一次）。
- **ac-app-perf-branch**：`?perf=1` 仍直渲测量窗口，不读设置、不显示启动帧，DOM 中无工作台。
- **ac-shell-header-copy**：en 顶栏 `New comparison` / `Open file` / `Open folder` 与 `Open settings` 可访问名及 `title` 为英文，zh 与现状逐字一致；顶栏无品牌副标题与样本入口，示例收进设置「示例与调试」（`settings.samples.*`）。
- **ac-view-switcher-key-gone**：zh / en 词典均不含 `shell.viewSwitcher.label`；`shell.view.directory` / `code` / `csv` / `structured` 四键两侧存在且非空。
- **ac-empty-state-copy**：空态标题 / 描述 / hint 与三个动作按钮中英均为当前语言；hint 指向设置 → 示例与调试，description 只描述真实文件 / 文件夹 / 拖拽。
- **ac-session-tabs-copy**：en `tablist` 名为 `Sessions`、关闭名 `Close {title}`，zh 为「会话」「关闭 {title}」；未保存修改标签两语言都有当前语言 `title` + `sr-only` 提示。
- **ac-sample-session-display**：加载演示样本后 en 四个标签标题 / 副标题为英文（不出现 fixture 中文），zh 逐字一致；两语言会话 id 集合与顺序相同。
- **ac-runtime-session-display**：真实文件对与目录对 en 副标题的路径 / 文件名保持原样、类型名为英文，会话 id 与 `file:` / `directory:` 前缀不变。
- **ac-stat-conflict-by-key**：代码会话冲突统计中英都显示运行时未解决冲突数，源码无 `stat.label` 与中文字面量比较。
- **ac-close-unsaved-dialog**：关闭未保存会话时 en 标题 / 描述（含会话标题插值）/ `Continue editing` / `Discard and close` / 正文为英文，zh 逐字一致；继续编辑不关闭、放弃则关闭该会话。
- **ac-progress-and-cancel**：目录对比进行中 en 进度条 `aria-label`、阶段文案、三个计数句、`已处理 {size}` 与 `Cancel` 为英文且数值随真实批次增长。
- **ac-cancel-notice**：en 取消后出现英文取消通知，工作台会话 / 状态栏 / 视图 DOM 与取消前一致。
- **ac-notice-skipped-and-snapshot**：跳过行、快照导出 / 导入结果、`来源目录对比：…` 与返回上级目录两种结果中英均为当前语言（会话标题原样插入）。
- **ac-picker-titles**：打开文件 / 打开文件夹 / 导出快照传给平台的对话框 `title` 为当前语言（fake port 断言）。
- **ac-new-compare-copy**：en 标题 / 描述 / 路径标签 / `Enter to compare · Esc to close` / `Cancel` / `Compare` / 打开按钮与其 `title` 全英文无汉字，zh 逐字一致。
- **ac-new-compare-validation**：空右侧 / 两侧同路径 / 类型混合 / 不支持扩展名分别按 `EMPTY_PATH` / `DUPLICATE_SIDE` / `TYPE_MISMATCH` / `UNSUPPORTED_FILE_TYPE` 给当前语言文案并保留路径，对话框不关、不建会话、不扫描。
- **ac-shared-component-copy**：en 对话框关闭名为 `Close`、差异语义标签 `Same/Added/Removed/Modified/Conflict`（`DiffBadge` 与图例一致），zh 为「关闭」与「相同/新增/删除/修改/冲突」。
- **ac-existing-suite**：`pnpm test` 全绿，既有 App / snapshot / Workbench 行为断言除「预置 zh 记录并等待首屏」外不变。
- **ac-filter-copy**：zh 五档过滤与组名逐字（`全部/仅差异/左独有/右独有/相同`、`差异过滤`），en 为 `All / Differences only / Left only / Right only / Same` 与 `Difference filter`，`value` 顺序仍按 `DIRECTORY_FILTERS`。
- **ac-toolbar-copy**：en 八个工具栏按钮（选择左右目录 / 预览同步 / 模板归位 / 导出·导入左右快照）文本与 `title` 为英文，zh 逐字一致；同一按钮两语言文本与 `title` 均不同。
- **ac-picker-title-gate**：`pickerAvailable === false` 时选择按钮 `title` 为空且渲染 Web 预览提示；`true` 时提示不渲染、`title` 为当前语言说明句。
- **ac-panel-title-user-data**：中英下两侧 Panel 的 `title` / `subtitle` 与两个 `role="tree"` 的 `aria-label` 都等于根名与真实路径（含中文名不被翻译）。
- **ac-tree-toggle-aria**：折叠按钮名为 `Expand {name}`、展开后 `Collapse {name}`（zh `展开 {name}` / `折叠 {name}`），点击只切换折叠、不改 `selectedPath`。
- **ac-sync-dialog-copy**：en 标题形如 `Left → Right · Incremental sync preview`、描述含 `Target root:`、处理中 `Syncing…`、空闲 `Apply changes`、`Cancel`；`Cancel` 调 `onCancel` 一次，`Apply changes` 以当前勾选 `deletePaths` 调 `onConfirm`。
- **ac-sync-dialog-groups**：en 分组标题 `Files to copy` / `Files to overwrite` / `Files to delete (mirror)`，计数按 `{count} item(s) · {size}`；`incremental` 不渲染删除分组；空分组 `None`（zh `无`）。
- **ac-sync-dialog-empty**：`plan.totalCount === 0` 时 en 渲染 `This direction has no changes to sync; …` 且确认 `disabled`，zh 逐字一致。
- **ac-sync-delete-aria**：mirror 下删除项复选框 `aria-label` 为 `Delete {path}` / `删除 {path}`，初始未勾选，未勾选项不进 `deletePaths`。
- **ac-sync-dialog-executable-copy**：en 组级 `Select all` / `Clear` 与汇总 `This run: {copy} copy · {update} overwrite · {delete} delete`；仅未勾选删除项时可执行数为 0 → `disabled` 且渲染以 `Delete items are unchecked by default` 开头的原因句；勾选后计数与集合一致且可点；zh 为 `全选` / `清空` / `本次将执行：…` 与对应原因句。
- **ac-sync-dialog-busy-disabled**：`busy` 时确认 `disabled` 并显示进行中文案，删除复选框与全选 / 清空一并 `disabled`；忙碌态 `Cancel` 可点并调 `onAbort`，空闲调 `onCancel`。
- **ac-sync-cancel-notice-bilingual**：中止后通知走 `shell.notice.syncCancelled`（无占位符、成对、en 零汉字），info 语气且不带系统码。
- **ac-sync-verify-failed-copy**：校验未通过走 `shell.notice.syncVerifyFailed`（`{count}` / `{paths}` 两侧一致），danger 语气，含不一致条数与路径样例，不出现成功句，词典层不截断路径。
- **ac-sync-write-failure-localized**：EACCES / EPERM / EROFS / EBUSY / ENOSPC 失败时中英各渲染对应原因，含出错目标路径与原始 OS code，且不含 `Error invoking remote method`。
- **ac-sync-failure-code-fallback**：无可识别系统码时中英都渲染中性兜底句并保留目标路径，不回退主进程中文 detail，不为空串。
- **ac-template-dialog-copy**：选根步 en 标题 `Template placement · Choose roots`、说明含 `Template A` / `Scattered tree B` / `output root`、只读标 `Current left root · read-only`、`Choose tree B` / `Choose output root`、`Build dry run`；Dry-run 步五个分区标题、`Placing…` / `Place files`、`Will be created` / `Exists`、`Check {path}`、`{count} executable` / `{count} rejected`；确认 `disabled` 只由 `resolveTemplatePlan(...).executableCount === 0` 决定；zh 为对应成对文案（`已落位` / `确认归位` 等）。
- **ac-template-entry-copy**：选根与 Dry-run 的 30 条 `directory.template.*` 键 zh / en 成对、占位符一致、en 零汉字；十个拒绝句按 `TemplateRootError` 稳定码一一对应、不含平台中文 message 与 IPC 包装；完成通知为 `shell.notice.templateApplied`（`{written}` / `{failed}`）。
- **ac-template-move-copy**：17 条移动键（`action.copy` / `action.move`、`moveCheck`、`moveChecked`、`copyCount` / `moveCount`、五条 `failure.move*` 带 source kept 语义、四条 `result.*`、两条 `verify.*`）成对、占位符一致、en 零汉字；`place` 空闲为 `Place files` / `确认归位`，无 `Extract` / `提取` 同义词。
- **ac-count-plural**：en 计数 1 用单数（`1 item`）、0 与 3 用复数，覆盖同步合计 / 分组 / 模板分区；zh 恒为 `合计 {count} 项` / `{count} 个`。
- **ac-translation-is-render-only**：同一比较结果中英渲染的行路径序列、`role="treeitem"` 数、过滤 `aria-selected`、折叠后不可见路径与 `onTogglePath` / `onSelectPath` 调用序列完全相同。
- **ac-settings-entry**：空态 / 已打开会话 / 扫描进行中三种状态顶栏都有可访问名 `打开设置` / `Open settings` 的未禁用按钮；点击出现 `role="dialog"`（`设置` / `Settings`），`Esc` 后可再次打开。
- **ac-settings-options**：面板恰两个选项，顺序 `English`、`简体中文`，两种界面下可访问名相同；分组名 `语言` / `Language`；当前项 `aria-selected="true"`、另一项 `false`。
- **ac-switch-instant**：en 面板点 `简体中文`（不等写盘）后顶栏、标签条可访问名、状态栏、面板标题与分区标签同批变中文且无空文本；再点 `English` 立即回英文。
- **ac-write-order-last-wins**：连续切 `简体中文` → `English` 时参数序列为 `['zh','en']`，第二次在第一次 settle 后发生；读回记录为 `{ language: 'en' }`。
- **ac-write-failure-no-rollback**：写盘 `EACCES` reject 时语言仍为目标、面板不关，面板 `role="alert"` 为当前语言 `settings.saveError` 且含原始 reason；随后成功写盘清空，重开不残留。
- **ac-switch-notice-live**：已显示的词典通知在切语言后同一 `role="alert"` 立即重译，语气与参数不变，不产生额外平台调用。
- **ac-switch-keeps-state**：目录会话已设过滤、选中行、改滚动偏移，另有未保存代码会话时切语言：会话数量 / id / 顺序 / 活动标签、过滤值、选中路径、两侧 `scrollTop`、dirty 与未保存提示均不变。
- **ac-switch-no-rework**：切换前后 `listDirectory` / `listDirectories` / `digestFiles` / `readTextFile` 次数相同，`onCompareRequest` 与 `compareRequestsReady` 各只 1 次（工作台未重挂载）。
- **ac-language-switch**：en → zh → en 运行时切换后顶栏、空态、目录视图文案逐字等于当前语言词典值（按命名 key 断言），en 侧汉字为 0。
- **ac-missing-key-fail-closed**：删掉任一被关键路径引用的键（或 en 值缺失）时表单源用例立即变红，恢复后全绿；断言用渲染文本与词典插值等值比较。
- **ac-locale-table-single-source**：测试期望文案全部经 `i18n/localeTable.ts` 取词典值，`LOCALE_ROWS.length === Object.keys(zh).length` 且逐行与 `messages.zh` / `messages.en` 全等。
- **ac-code-diff-copy-en**：`renderWithI18n(<CodeView …/>, 'en')` 可见 `Previous difference` / `Next difference` / `Difference blocks`、`Overwrite to right` / `Overwrite to left`、`Reset`、`Save left file` / `Save right file` 及英文 `title`、`Unsaved: left/right/both`、`Open left file` / `Open right file`、面板副标题与 `Modified (unsaved)`。
- **ac-code-dirty-status**：脏状态与真实侧一一对应（zh `未保存：左/右/左、右`，en `Unsaved: left/right/both`），无脏侧不渲染。
- **ac-code-save-notice**：保存成功 `role="status"` 为当前语言且含路径（en `Wrote back {path}`），`writeTextFile` 恰 1 次；失败时通知为平台原始 message 原文。
- **ac-merge-copy-en**：合并模式 en 可见 `Previous conflict` / `Next conflict`、`Pending conflicts`、四个 `Accept *`、`Open base/ours/theirs`、`Merge result preview`、`Copy`、`Export merged text`；未解决数 `{n}/{total}` 为真实计数。
- **ac-csv-copy**：en `Key columns` / `Key column selection` / `CSV alignment tools` / `Status filter` 六档 / `Only left` / `Only right` / `{visible} / {total} rows` / `Aligned {rows} rows · key {keys}` / 打开左右文件；zh 为 `主键列` / `仅左` / `{visible} / {total} 行` 等现有文案；数字仍用 `en-US` 千分位。
- **ac-structured-copy**：en `Structured format` / `Status filter` 六档（`Type changed` 单独成键）/ `structured counts` / `{count} nodes · counts reflect the runtime comparison` / `Node path changes` / `Showing {visible} / {total}` / `Left source` / `Right source`；zh 为 `类型变更` / `共 {count} 个节点 · 计数为运行时对比结果` / `节点路径变更` / `左原文` / `右原文`；切 YAML 后下钻说明为 `Local file · YAML source · semantic comparison`。
- **ac-structured-error-frame**：解析失败时中英各显本地化标题 / 提示（en `Structured parsing failed`），`description` 保留 core 原始 message，副标题为当前语言 `Parse failed` / `解析失败`。

## 非目标

- 不做第三种语言、第六个表面、RTL / `<html dir>`、`<title>` 与 meta 改写；不改词典结构与既有键语义，不为凑对新增同义键。
- 不引入 i18next / react-intl 等框架、不新增运行时依赖、不新增专用 code gate、不做机翻。
- 不新建第二套存储：不写 electron-store、不加第二个 localStorage key / 配置文件（实现归 `foundation` 域）。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/**`（含 `compareRequest`、fixtures 数据、`FixtureSession` / `SessionStat` 类型语义）的文案或行为；fixture 中文不改英文。
- 不改启动解析、无文字品牌帧与 Provider 挂载语义；不做系统语言实时跟随或系统语言变化触发切换。
- 不改会话 id / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；`code_gates.json` 不新增或改条目。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`）；不改造 `perf/**` 与 `platform/**`，只作未覆盖目录登记。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与发布证据、`README` / `AGENTS.md` / `docs/**`。

## 实现约束

- `Language = 'zh' | 'en'`（`src/shared/platform/types.ts`）默认 `en`；`UserSettings` 只含 `language`，非法语言值视为 `null`。
- 五个表面固定；新增表面须成对新增并进 `messages/index.ts`；新键只落既有表面成对文件，禁止散落到别人文件。
- 插值仅 `{name}` 单一正则实现，不引入模板引擎；`t` 的键类型为合并后 zh 键联合（`MessageKey`）；词典值内不得出现 HTML / JSX。
- 词典归属：跨表面共享键（差异语义、文件类型名、通用按钮、`Sessions` / `Close {title}`）放 `common`，壳层与新建对比放 `shell`，目录面共享映射集中 `views/directoryCopy.ts`，文件级按 `files.code.*` / `files.merge.*` / `files.csv.*` / `files.structured.*` 分组。
- 不得把 `t()` 结果缓存进模块级常量；常量数组只承载稳定 `value` + 词典键；`useMemo` 若含语言相关渲染必须把 `language` 纳入依赖；不得把中文字符串存进会话 / 状态对象。
- 非 React 模块（`snapshotOps` / `loadSampleSessions` / `directoryCompare` / `fileIO`）不得自己解析语言，按「稳定 code + 参数」产出；`NoticeParams` 以 `{ message: MessageKey, params? }` 表达嵌套片段，渲染期递归解析。
- 切换时序固定：`setLanguage(next)` → `useRef` 串行 promise 队列里 `writeUserSettings({ language: next })`；失败不回滚、不重读记录，只存 `reason` 由 `t('settings.saveError', { reason })` 渲染；不得给组件 / 视图加语言 `key`。
- 设置面板放 `workbench/SettingsDialog.tsx`（props 至少 `platform` + `onClose`），语言标签只允许来自 `messages[target]['settings.language.name']`（可经 `languageSelfLabel`），禁止字面量与新增标签键；齿轮入口常驻顶栏且不接 `directoryBusy` 的 `disabled`。
- 门禁：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；新增主链路文件必须入 `SCAN_ROOTS`；任何新语言入口必须复用 `htmlLang()`，不得再写 `documentElement.lang`。
- 测试：renderer DOM 用 `@vitest-environment jsdom`，纯解析与词典保持 node；en 用例用 `renderWithI18n(ui, 'en')`，zh 断言取词典值；期望文案经 `localeText()`，不新建测试基建、不把 `.munk/` 或新文件当收口容器。

## 最近交付证明

- WI：`wi_intake_a2dec1ffa5a717f2`（renderer i18n 测试收敛为 locale 表单一来源 + 同步失败提示双语复核；`kind: test/refactor`）
- 日期：2026-11-02 · 结果：`code_gates` passed（21 门，attempt 001；`pnpm test` 114 files / 1,744 passed + 1 skipped）。
- 覆盖摘要：新增测试专用 `i18n/localeTable.ts`（`LOCALE_ROWS` 逐键派生 + `localeText` 复用 `interpolate`，产品代码不 import）；`App.i18n.test.tsx` 928→234 与 `views/directoryI18n.test.tsx` 1,317→581 合计 2,245→815 行、用例 60→5 条关键路径（运行时切换含通知条同节点重译、`?perf=1` 分支、locale 表单源与缺键 fail-closed、目录视图与同步 / 模板对话框同源取值、EACCES·EPERM 与刷新失败双语等值）；`.toContain(` 57→2、`readFileSync` 0。
- 旁证：`TemplateDialog.test.tsx` 与 `App.theme.test.tsx` 的文案断言改词典取值，`theme/themeSources.test.ts` 零文案断言；`messages/**`、`package.json#version`、`code-gates.json` 零 diff；覆盖 89.94 / 82.74 / 89.39 / 92.54 不低于基线。
- 注：缺键 fail-closed 依赖 `LOCALE_ROWS.length === Object.keys(zh).length` 与逐行等值断言，删键不得静默跳过；后续新增 i18n 断言一律用 `localeText()`，900 行 / 5 条为硬上限；本 WI change pack 仅 `prd.md`，验收落档 `qa/locale-table-tests.md`。
