# 目录对比视图与同步/模板对话框双语化

本项是「桌面端 UI 双语化」的第四个 WI（前序 `i18n-core`、`shell-copy` 已合入 main：词典 / Provider / 首启解析 / 设置通道 / 工作台外壳均已本地化）。本项只把**目录对比视图面**接进词典：`views/DirectoryView.tsx`、`components/TreeView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx`，以及 `i18n/messages/{zh,en}/directory.ts`。不改目录对比、快照、同步与模板算法及四态语义。

## 范围

1. **过滤条（DirectoryView）**
   - 过滤组可访问名 `差异过滤`；五个过滤项 `全部 / 仅差异 / 左独有 / 右独有 / 相同` 改为 `DirectoryFilter → MessageKey` 映射，渲染期 `t()` 解析。
   - 过滤选项顺序仍由 `DIRECTORY_FILTERS` 决定，选项 `value` 与 `onFilterChange` 行为不变。

2. **工具栏与来源标识（DirectoryView）**
   - 选择左右目录、加载演示目录、预览并同步、模板归位、导出/导入左右快照、演示远端快照：按钮可见文本与 `title` 全部走词典。
   - 两个隐藏 file input 的 `aria-label`（选择左/右侧快照文件）走词典。
   - `pickerAvailable === false` 时的 Web 预览提示句走词典；为 `true` 时不渲染。
   - 左侧/右侧 Panel 的 `meta` 来源标识（`快照` / `源目录` / `目标目录`）走词典；Panel 的 `title` / `subtitle` 与 `TreeView` 的 `label` 仍是根名与真实路径（用户数据，不翻译）。

3. **空态、已跳过与提示（DirectoryView）**
   - 单侧过滤后 0 行的两句话（左/右）走词典。
   - `leftSkipped + rightSkipped > 0` 的持久提示行 `已跳过：左 {left} / 右 {right}` 走词典（shell 的 toast 由前序 WI 负责，本项不改）。
   - 底部下钻说明长句（含 `代码 / 文本 · CSV / TSV · JSON / YAML`）走词典。
   - 视图内的差异统计图例由既有 `CompositionLegend`（前序已本地化）渲染，本项不改其代码，只在 en 冒烟里断言其为英文。

4. **树（TreeView）**
   - 目录行展开/折叠按钮的 `aria-label`（`展开 {name}` / `折叠 {name}`）走词典；`node.name` 作为参数原样插入。
   - 树的 `aria-label`（= 根名）、行 `title`（相对路径/名称）、`CountSummary` 的前缀与数字保持不变。

5. **同步预览对话框（DirectorySyncDialog）**
   - 标题（方向 · 模式 + `同步预览`）、描述（`目标根：` + 路径 + 只读样本树说明 + `合计 {count} 项 / {size}`）、分组标题（`待新增拷贝` / `待覆盖修改` / `待删除（镜像）`）、分组计数（`{count} 个 · {size}`）、空分组 `无`、空计划整句、取消/确认/进行中文案、镜像删除项复选框 `aria-label`（`删除 {path}`）全部走词典。

6. **模板归位对话框（TemplateDialog）**
   - 标题、描述三段标签（`模板 A：` / `散乱树 B：` / `输出根：`）、四个分区标题（`已匹配` / `缺失槽位` / `冲突项` / `B 未使用文件`）、分区计数、空分组 `无`、冲突原因（`同名多候选` / `同名内容不同`）、取消/确认/进行中文案全部走词典。

7. **词典与共享映射**
   - 只往既有 `directory` 表面成对加键（`zh/directory.ts` + `en/directory.ts`），不新增表面文件、不改既有键与 `common` / `shell` 的键。
   - 新增 `src/renderer/src/views/directoryCopy.ts`（纯常量/纯函数，无 React）：`FILTER_LABEL_KEYS`、`SYNC_DIRECTION_KEYS`、`SYNC_MODE_KEYS` 与两行 `countKey(one, other, count)`；由 DirectoryView、两个对话框与测试共同引用，避免三处各写一份中文映射。

8. **测试**
   - 更新 `views/DirectoryView.test.tsx`：过滤标签与展开/折叠按钮名改为经 `zh[FILTER_LABEL_KEYS[...]]` 取值，不再保留中文拷贝字面量。
   - 新增 `views/directoryI18n.test.tsx`：中英双语冒烟（DirectoryView + 两个对话框，直接构造 `SyncPreview` / `TemplatePreview`）。
   - 新增 `views/directoryScan.test.ts`：本范围文件清单的 `scanHardcodedChinese` 0 命中，并断言两个既有测试文件不再含被本地化文案的字面量。

## 验收

- ac-filter-copy: zh 下五个过滤项与组可访问名与现状逐字一致（`全部/仅差异/左独有/右独有/相同`、`差异过滤`）；en 下分别为 `All / Differences only / Left only / Right only / Same` 与 `Difference filter`，且五个 `value` 顺序仍为 `DIRECTORY_FILTERS` 顺序。
- ac-toolbar-copy: en 下十个按钮可见文本分别为 `Choose left folder` / `Choose right folder` / `Load demo folder` / `Preview & sync` / `Place from template` / `Export left snapshot` / `Import left snapshot` / `Export right snapshot` / `Import right snapshot` / `Demo: remote snapshot`，且各自 `title` 为英文；zh 下文本与 `title` 与现状逐字一致；同一按钮在 zh 与 en 两次渲染中文本不同、`title` 不同。
- ac-picker-title-gate: `pickerAvailable === false` 时左右选择按钮 `title` 为空且渲染 Web 预览提示；`true` 时提示不渲染、`title` 为当前语言的说明句。两种语言下均成立。
- ac-snapshot-input-aria: 两个隐藏 file input 的 `aria-label` 在 zh 下为 `选择左侧快照文件` / `选择右侧快照文件`，en 下为 `Choose left snapshot file` / `Choose right snapshot file`。
- ac-panel-meta: 真实目录对 en 下左侧 `meta` 为 `Source folder`、右侧为 `Target folder`；任一侧挂载快照时该侧 `meta` 为 `Snapshot`；zh 下分别为 `源目录` / `目标目录` / `快照`。
- ac-panel-title-user-data: 无论 zh 还是 en，两侧 Panel 的 `title`/`subtitle` 与两个 `role="tree"` 的 `aria-label` 都等于比较结果的根名与真实路径（用含中文名的比较结果验证不被翻译、不被替换）。
- ac-empty-filter-copy: 单侧过滤后 0 行时，该侧渲染当前语言空态句且另一侧行数不受影响；en 空态句不含汉字；zh 与现状逐字一致。
- ac-skipped-line: `leftSkipped=2, rightSkipped=1` 时 en 渲染 `Skipped: left 2 / right 1`，zh 渲染 `已跳过：左 2 / 右 1`；两者均为 0 时该行不渲染。
- ac-drilldown-hint: en 底部说明含 `Double-click` 与 `CSV / TSV / JSON / YAML` 且不含汉字；zh 与现状逐字一致。
- ac-tree-toggle-aria: 折叠目录行按钮可访问名为 `Expand {name}`、展开后为 `Collapse {name}`（en），zh 为 `展开 {name}` / `折叠 {name}`；点击按钮仍只切换折叠、不改变 `selectedPath`。
- ac-legend-en: en 下 DirectoryView 内 `CompositionLegend` 的语义标签为 `Same/Added/Removed/Modified`，zh 下为 `相同/新增/删除/修改`；计数数字与 `visibleCounts` 一致。
- ac-sync-dialog-copy: en 下标题形如 `Left → Right · Incremental sync preview`（方向、模式均为英文）、描述含 `Target root:` 与目标根原文、处理中文本为 `Syncing…`、空闲为 `Apply changes`、取消为 `Cancel`；zh 下与现状逐字一致；`Cancel` 调用 `onCancel` 一次，`Apply changes` 以当前勾选后的 `deletePaths` 调用 `onConfirm`。
- ac-sync-dialog-groups: en 下分组标题为 `Files to copy` / `Files to overwrite` / `Files to delete (mirror)`，分组计数按 `{count} item(s) · {size}` 渲染；`mode === 'incremental'` 时不渲染删除分组；空分组渲染 `None`（zh 为 `无`）。
- ac-sync-dialog-empty: `plan.totalCount === 0` 时 en 渲染 `This direction has no changes to sync; the target already matches the source.` 且确认按钮 `disabled`；zh 与现状逐字一致，同样 `disabled`。
- ac-sync-delete-aria: mirror 模式 en 下删除项复选框 `aria-label` 为 `Delete {path}`（path 原样），zh 为 `删除 {path}`；取消勾选后该项不出现在传给 `onConfirm` 的 `deletePaths` 中。
- ac-template-dialog-copy: en 下标题为 `Template placement preview`、描述含 `Template A:` / `Scattered tree B:` / `Output root:` 与三个根路径原文、分区标题为 `Matched` / `Missing slots` / `Conflicts` / `Unused files in B`、处理中为 `Placing…`、空闲为 `Extract and place`；zh 下与现状逐字一致；`result.matched.length === 0` 时确认按钮 `disabled`。
- ac-template-reason-copy: en 下 `ambiguous` 冲突原因为 `Multiple candidates with the same name`、内容不同为 `Same name, different content`；zh 为 `同名多候选` / `同名内容不同`；两种语言下候选路径仍以 ` · ` 连接。
- ac-count-plural: en 下计数 1 用单数（`1 item`）、0 与 3 用复数（`0 items` / `3 items`），覆盖同步合计、同步分组和模板分区三处；zh 下恒为 `合计 {count} 项` / `{count} 个`，不随数量变化。
- ac-dict-directory: `zh/directory.ts` 与 `en/directory.ts` 键集相等、所有值 `trim()` 非空、同键占位符集合一致、en 值无 `\p{Script=Han}`（并入既有 `messages.test.ts` 断言后全绿）；既有 `directory` 键不被改名或删除。
- ac-han-scan-directory: `scanHardcodedChinese` 对本范围清单（`views/DirectoryView.tsx`、`components/TreeView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx`、`views/directoryCopy.ts`）命中数为 0（注释、`aria-label`、`title` 不豁免）。
- ac-existing-tests-by-key: `DirectoryView.test.tsx` 中不再出现 `全部/仅差异/左独有/右独有/相同` 与 `展开 {name}`/`折叠 {name}` 字面量（改为经 `zh[FILTER_LABEL_KEYS[...]]` / zh 键取值），`DirectoryView.test.tsx` 与 `TreeView.test.tsx` 全部断言仍通过。
- ac-translation-is-render-only: 同一比较结果分别以 zh 与 en 渲染 DirectoryView，两侧渲染出的行路径序列、`role="treeitem"` 数量、当前过滤 tab 的 `aria-selected`、折叠后不可见路径与 `onTogglePath`/`onSelectPath` 调用序列完全相同（本地化不改变行模型、过滤、展开与选中）。
- ac-en-smoke-no-han: en 下上述视图与两个对话框的指定表面（五个过滤项、十个按钮及其 `title`、两侧 `meta`、提示行、空态句、下钻说明、图例、两个对话框标题/描述标签/分组标题/按钮/空态句）文本 `\p{Script=Han}` 命中数为 0（路径、文件名、`Left → Right` 箭头等用户数据/符号除外）。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；不改 `code_gates.json`、不新增专用 gate。

## 非目标

- 不改 `workbench/Workbench.tsx` 与 `workbench/*.ts`（外壳、通知、进度与取消、快照导出/导入结果、下钻会话标题已由 `shell-copy` WI 本地化，本项只消费）；不重做 `shell.progress.*`、`shell.notice.*` 验收。
- 不做 `views/CodeView.tsx`、`CsvView.tsx`、`StructuredView.tsx` 及其测试的任何文案（归「文件级视图双语化」WI）。
- 不做设置面板、齿轮入口、语言即时切换与写盘（归「设置面板与即时切换」WI）；本项测试只用 `renderWithI18n` / 无 Provider 回落 zh，不新增切换流程。
- 不改目录对比 / 过滤 / 行模型 / 滚动映射 / 快照 / 同步计划 / 模板匹配算法，不改四态语义、差异色、布局、字号、行高与虚拟化参数。
- 不改 `workbench/directoryOps.ts`、`viewSnapshot*`、`snapshotOps.ts`、`loadSampleSessions.ts` 的中文提示（作为错误/结果详情原样展示）；`DirectorySyncDialog`/`TemplateDialog` 只本地化自己的外壳文案。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/**`（含 `scanHardcodedChinese`）与 `src/shared/fixtures/**`。
- 不改 `common` / `shell` / `files` / `settings` 四个词典表面；不新增依赖、不引入第三方 i18n 框架、不新建存储键。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`）；不改 `perf/**` 与原生菜单。

## 实现约束

- **词典归属**：全部新键放 `directory` 表面，采用 `directory.{area}.{name}` 点号命名（`directory.filter.all`、`directory.toolbar.pickLeft`、`directory.panel.source`、`directory.sync.title`、`directory.template.title` 这类形状）。zh 值必须与当前界面中文逐字一致（含全角标点、`（）`、`「」`、`→`），en 为句子式人工措辞、不机翻、不留 `TODO`。既有 `directory.filter.label / filter.clear / tree.empty / action.refresh / summary.files` 五个键原样保留（不使用、不删除）。
- **英文措辞基线**（供审校一致）：`All`、`Differences only`、`Left only`、`Right only`、`Same`、`Difference filter`、`Choose left folder`、`Load demo folder`、`Preview & sync`、`Place from template`、`Export left snapshot`、`Import left snapshot`、`Demo: remote snapshot`、`Sync direction`、`Sync mode`、`Left → Right`、`Right → Left`、`Incremental`、`Mirror`、`Source folder`、`Target folder`、`Snapshot`、`Skipped: left {left} / right {right}`、`Expand {name}`、`Collapse {name}`、`Target root: `、`Total {count} item(s) / {size}`、`Files to copy`、`Files to overwrite`、`Files to delete (mirror)`、`Apply changes`、`Syncing…`、`None`、`Template placement preview`、`Template A: `、`Scattered tree B: `、`Output root: `、`Matched`、`Missing slots`、`Conflicts`、`Unused files in B`、`Extract and place`、`Placing…`、`Delete {path}`。
- **共享映射**：`views/directoryCopy.ts` 只导出 `FILTER_LABEL_KEYS: Record<DirectoryFilter, MessageKey>`、`SYNC_DIRECTION_KEYS: Record<SyncDirection, MessageKey>`、`SYNC_MODE_KEYS: Record<SyncMode, MessageKey>` 与 `countKey(one, other, count)`；不 import `@core/directory/filter` 之外的运行时模块，不引用 React / DOM。`DirectorySyncDialog` 不再保留自己的 `DIRECTION_LABELS` / `MODE_LABELS` 常量。
- **插值**：只用 `{name}` 占位；`Dialog` 的 `description` 允许由「词典片段 + `<span className="font-mono">` 用户数据」拼成，片段自身必须整句可用（en 语序由模板决定，不把中文语序逐段拼英文），词典值内不得出现 HTML/JSX。
- **计数单复数**：仅三处计数句拆 `one` / `other` 键（同步合计、分组计数、模板分区计数），均以 `countKey` 选择；zh 两条值相同（保持短语逐字不变），en 分别为 `item` / `items`。其它文案不引入单复数分支。
- **组件接线**：四个组件用 `useI18n()`；无 Provider 时既有 zh 回落保证 `DirectoryView.test.tsx` / `TreeView.test.tsx` 的 `render()` 调用方式不需要包 Provider 即可继续断言中文。不得把 `language` 用作组件或 `TreeView` 的 `key`，不得改 `DirectoryViewProps` 形状。
- **不受影响的行为**：`DIRECTORY_FILTERS` 顺序、`buildDirectoryRowModel` 入参、`trackLive('rowModel')` 注册、`useLayoutEffect` 滚动恢复、`selectedPath`/`collapsedPaths` 受控语义、隐藏 input 的 `accept` 与 `onChange` 重置逻辑、`Dialog` 的 `onClose` busy 行为、`deletePaths` 计算均保持原样。
- **测试写法**：en 场景统一用 `@renderer/i18n/testing` 的 `renderWithI18n(ui, 'en')`；zh 断言用 `zh[key]` 取值（`DirectoryView.test.tsx` 已 import `zh`）。扫描清单写成常量数组，四个页面文件 + `directoryCopy.ts` 全列；不得把 `.test.*` 加进扫描清单靠排除规则蒙混。en 无汉字断言按「指定表面文本」逐个元素校验，不对含随机临时目录名的整棵 DOM 做全量汉字扫描。
- **注释与代码风格**：沿用仓库英文注释；扫描包含注释，因此新代码的注释、`aria-label`、`title` 都不得写中文。renderer 仍不得 import Electron；不引入新依赖。
