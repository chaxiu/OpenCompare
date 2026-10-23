# 代码 / CSV / JSON·YAML 文件级视图双语化

本项是「桌面端 UI 双语化」的第三个 WI。前两项已交付：i18n 底座（词典 / Provider / 首启解析 / 设置通道 / 扫描辅助）与工作台外壳（App 挂 Provider、顶栏 / 空态 / 标签 / 新建对比 / 共享差异语义）。`src/renderer/src/views/**` 与 `components/DiffPane|MergePane|CodeBlock` 仍是中文硬编码。本项只把这三个文件级视图与其所属 pane 的**可见文案**接进词典，并把本范围的无中文扫描与中英冒烟落成测试。设置面板、目录视图、快照 / 同步 / 模板对话框与收口扫描都不在本项。

## 范围

1. **`views/CodeView.tsx`（双栏 Diff）**
   - 工具栏：差异块导航按钮可访问名（上一个 / 下一个差异块）、块计数标签、覆写到右 / 覆写到左、重置、保存左文件 / 保存右文件（含 `title` 提示）、未保存状态（左 / 右 / 两侧三种）、打开左文件 / 打开右文件。
   - 面板：左右两侧 `subtitle`（左 / 右）、已修改（未保存）标记。
   - 通知：`已写回 {path}`、`已打开 {path}`；失败分支保留平台原始 message 作为错误详情（不翻译）。
   - 平台对话框 `title`：打开左侧 / 右侧本地文件。
   - 模式切换：`双栏 Diff` / `三向合并 base · ours · theirs` 两个选项、分段控件可访问名 `代码视图`、两种模式的行内说明、下钻会话的 `本地文件 · 双栏字符级 Diff`。

2. **`views/CodeView.tsx`（三向合并）**
   - 冲突块导航（上一个 / 下一个冲突块）、`待决冲突 {n}/{total}`、四个采纳按钮（Accept Ours / Accept Theirs / Accept Both / Accept Base）、三个侧输入按钮 `打开 {side}` 与对应 picker `title`。
   - 冲突侧栏：`冲突 {n}`、`已采纳 {choice}` / `未解决`、每个冲突块内联的四个采纳按钮、`无冲突块。`。
   - 结果栏：`合并结果预览`、副标题（全部冲突已解决 / 未解决块以冲突标记保留）、`复制`、`导出合并文本`、保存对话框 `title` 为 `保存合并结果`。
   - 通知：`已打开 {path}`、`已保存到 {path}`、`已复制到剪贴板`、`复制失败，请手动选择预览文本`；失败分支保留原始 message。
   - 三侧面板副标题 `base` / `ours` / `theirs`。

3. **`views/CsvView.tsx`**
   - 工具栏：`主键列` 标签、`主键列选择` 分组可访问名、`CSV 对齐工具` 工具栏可访问名、状态过滤分段控件可访问名与其六个选项（全部 / 仅差异 / 新增 / 删除 / 修改 / 相同；后四个复用既有 `common.diff.*`）、重复主键徽标（可访问名 + `重复主键 {count}` + 多行 `title` 详情）、`{visible} / {total} 行` 计数、打开左 / 右文件按钮与 picker `title`、`已打开 {path}` 通知。
   - 列头：`仅左` / `仅右`。
   - 面板：`对齐 {rows} 行 · 主键 {keys}` / `未选择` 副标题。
   - 空态三句：未选择主键列、当前主键下没有可对齐的行、当前过滤条件下没有行。

4. **`views/StructuredView.tsx`**
   - 格式切换（JSON / YAML，技术标识，中英同值）、`结构化格式` 可访问名、`状态过滤` 可访问名与其六个选项（全部 / 新增 / 删除 / 修改 / 类型变更 / 相同；`新增/删除/修改/相同` 复用 `common.diff.*`）、下钻说明 `本地文件 · {format} 原文 · 语义归一化对比`、样本模式说明 `键序与注释 / 缩进噪音已忽略 · 按 JSON Pointer 节点路径比对`。
   - 计数条：`结构化计数` 分组可访问名、五个状态标签（类型变更单独成键）、`共 {count} 个节点 · 计数为运行时对比结果`。
   - 变更列表面板：`节点路径变更`、副标题 `解析失败` / `显示 {visible} / {total}`、过滤空态、两侧原文面板副标题 `左原文` / `右原文`。
   - 解析错误外壳：`结构化解析失败` 标题、本会话影响提示；`description` 仍为 core 抛出的原始 message（边界，见实现约束）。
   - 无数据空态：标题与描述。
   - 打开左 / 右文件按钮、picker `title`、`已打开 {path}` 通知。

5. **`components/DiffPane.tsx` / `MergePane.tsx` / `CodeBlock.tsx`**
   - 三个组件只渲染行号与行文本（占位符 `\u00a0`），当前没有任何可翻译文案；本项核对后**不改实现**，仅把它们纳入扫描清单证明覆盖，避免「顺手加参数」扩大改面。

6. **词典（沿用既有 `files` 表面文件）**
   - 只往 `messages/zh/files.ts` 与 `messages/en/files.ts` 成对加键，不新增表面文件、不改 `messages/index.ts` 的聚合结构。
   - 复用既有键：`common.diff.added/removed/modified/same`、`common.kind.*`、`files.action.copy`；本项不改写、不删除、不重命名任何既有键。
   - 数值千分位沿用现有 `toLocaleString('en-US')`，词典只承接单位与句子模板。

7. **测试**
   - 新增本范围「中文硬编码」扫描断言（复用 `scanHardcodedChinese`，显式文件清单，0 命中），沿用 `workbench/shellScan.test.ts` 的清单常量写法。
   - 三个视图各补 en 渲染测试（`renderWithI18n(..., 'en')`）与关键通知 / picker 参数断言；既有 zh 测试保留原断言。
   - 补「切换语言不丢状态」测试：语言切换后 diff 未保存修改、合并采纳状态、CSV 主键 / 过滤 / 对齐计数、结构化格式 / 过滤 / 节点计数保持不变。

## 验收

- ac-files-dict-surface: `messages/zh/files.ts` 与 `messages/en/files.ts` 键集合相等，新增键全部以 `files.` 前缀、全部落在 `files` 表面（`messages/zh`、`messages/en` 仍各只有五个文件），且无既有键被删除或改名（`files.action.save/revert/copy`、`files.empty`、`files.unsavedChanges` 仍在）。
- ac-code-diff-copy-en: `renderWithI18n(<CodeView fixture defaultMode="diff" platform>, 'en')` 下可见英文 `Previous difference` / `Next difference` / `Difference blocks`、`Overwrite to right` / `Overwrite to left`、`Reset`、`Save left file` / `Save right file` 及其英文 `title`、`Unsaved: left` / `right` / `both`、`Open left file` / `Open right file`、面板副标题 `left` / `right` 与 `Modified (unsaved)`。
- ac-code-diff-copy-zh: 同一渲染在 zh 下逐字出现 `上一个差异块`、`覆写到右`、`重置`、`保存左文件`、`打开左文件`、`未保存：左`、`已修改（未保存）`，即既有 `CodeView.test.tsx` 断言无需改动仍通过。
- ac-code-dirty-status: 用覆写把两侧改成不同脏状态时，zh 显示 `未保存：左` / `未保存：右` / `未保存：左、右` 三种之一与真实脏侧一一对应；en 下对应 `Unsaved: left` / `right` / `both`；无脏侧时不渲染该状态节点。
- ac-code-save-notice: 保存成功后 `role="status"` 文案为当前语言并含被写回的路径（en 形如 `Wrote back {path}`），`writeTextFile` 恰好调用一次；写入失败时通知内容为平台抛出的原始 message 原文（中英下相同），不出现「未翻译」占位。
- ac-code-picker-titles: 点击打开左 / 右文件时传给 `platform.selectFile` 的 `title` 为当前语言（en `Open left local file` / `Open right local file`；zh `打开左侧本地文件` / `打开右侧本地文件`），传 `TEXT_FILE_FILTER` 与取消时视图状态不变。
- ac-merge-copy-en: 合并模式下 en 可见 `Previous conflict` / `Next conflict`、`Pending conflicts`、`Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base`、`Open base` / `Open ours` / `Open theirs`、`Merge result preview`、`Copy`、`Export merged text`；未解决数 `{n}/{total}` 为真实计数。
- ac-merge-conflict-list: 冲突侧栏 en 为 `Conflict {n}`，未采纳时 `Unresolved`、采纳后 `Accepted {choice}`（choice ∈ ours / theirs / both / base），采纳按钮高亮跟随 `resolutions`；无冲突时显示英文 `No conflict blocks.`；zh 为 `冲突 {n}` / `未解决` / `已采纳 ours` / `无冲突块。`。
- ac-merge-actions-notice: en 下复制成功通知为 `Copied to clipboard`、失败为英文失败提示；导出调用 `platform.saveFile` 的 `title` 为当前语言（en `Save merged result`），成功后通知为当前语言并含返回路径；未解决冲突存在时复制 / 导出按钮保持 disabled。
- ac-csv-copy: en 下 `Key columns`、`Key column selection`、`CSV alignment tools`、`Status filter`、`All` / `Differences only` / `Added` / `Removed` / `Modified` / `Same`、`Only left` / `Only right`、`{visible} / {total} rows`、`Aligned {rows} rows · key {keys}`、`Open left file` / `Open right file` 均为英文；zh 下为 `主键列`、`仅左`、`{visible} / {total} 行` 等现有文案；数字仍以 `en-US` 千分位。
- ac-csv-duplicate-keys: 存在重复主键时徽标可访问名为当前语言（en `Duplicate keys`、zh `重复主键`）并带计数，`title` 每行形如当前语言模板且含左 / 右出现次数；无重复时不渲染该徽标。
- ac-csv-empty-states: 未选主键列（`align.columns` 为空）、有主键但零对齐行、过滤后零行三种情况在中英下分别给出各自的空态句（三个不同键，en `No key columns selected…` / `No rows to align under the current keys.` / `No rows under the current filter.`），不互相串用。
- ac-structured-copy: en 下 `Structured format`、`Status filter`、`All` / `Added` / `Removed` / `Modified` / `Type changed` / `Same`、`structured counts` 分组可访问名、`{count} nodes · counts reflect the runtime comparison`、`Node path changes`、`Showing {visible} / {total}`、`Left source` / `Right source`、`Open left file` / `Open right file` 为英文；zh 为 `类型变更`、`共 {count} 个节点 · 计数为运行时对比结果`、`节点路径变更`、`左原文` / `右原文`；切到 YAML 后下钻说明为 `Local file · YAML source · semantic comparison`。
- ac-structured-error-frame: 输入无法解析的 JSON 时错误外壳在中英下分别显示本地化标题 / 提示（en `Structured parsing failed`，zh `结构化解析失败`），而 `description` 保留 core 抛出的原始 message 文本（中英渲染同一字符串），面板副标题为当前语言的 `Parse failed` / `解析失败`。
- ac-structured-empty: 无 source 时 en 显示 `No structured data to compare` 与英文描述、zh 显示现有文案；过滤后零变更时显示当前语言的过滤空态句（en 含 `All`，zh 含「全部」）。
- ac-switch-keeps-code-state: 双栏 Diff 中执行一次覆写（产生脏状态）后，从 zh 切到 en，块计数、左右行文本、脏标记语义与保存按钮 disabled 状态不变，`writeTextFile` / `readTextFile` 调用次数为 0；合并模式采纳一个冲突后切语言，`待决冲突` 数值与各块采纳结果不变。
- ac-switch-keeps-csv-state: 在 CSV 视图切换主键列与状态过滤后切语言，`onAlignStateChange` 上报的 counts、当前过滤值、已选主键集合与可见行数不变，`alignCsvTables` 不因语言切换重算（`onAlignStateChange` 调用次数不增加）。
- ac-switch-keeps-structured-state: 结构化视图切到 YAML + `类型变更` 过滤后切语言，`diffStructured` 结果条目数、过滤值、计数条数值与可见变更行不变。
- ac-files-han-scan: 用 `scanHardcodedChinese` 扫描显式清单（`views/CodeView.tsx`、`views/CsvView.tsx`、`views/StructuredView.tsx`、`components/DiffPane.tsx`、`components/MergePane.tsx`、`components/CodeBlock.tsx`）命中数为 0（注释、`aria-label`、`title` 不豁免）；清单写成常量数组，新增文件必须入列。
- ac-files-en-smoke: 三个视图在 en 下的 `container.textContent` 中 `\p{Script=Han}` 命中为 0（样本路径、文件名与文件正文均为 ASCII；用户数据不翻译）。
- ac-existing-view-suite: `pnpm test` 全绿，`CodeView.test.tsx`、`CsvView.test.tsx`、`StructuredView.test.tsx` 的既有 zh 断言（含 `Accept Ours` / `Accept Both`、`类型变更`、`结构化计数`、`主键列`）不改即通过；`workbench/shellScan.test.ts` 与 i18n 词典测试不改逻辑仍通过（仅允许在 `LATIN_ONLY_KEYS` 增补本项新增的拉丁文键）。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；`code_gates.json` 不改、不新增专用 gate。

## 非目标

- 不做设置面板 / 齿轮 / 语言切换 UI（另一 WI），本项只消费 `useI18n()`，不调用 `setLanguage`；切换测试用测试内自建 Provider 驱动。
- 不做 `views/DirectoryView.tsx`、`views/DirectorySyncDialog.tsx`、`views/TemplateDialog.tsx`、`components/TreeView.tsx`、`components/SplitPane.tsx`、`components/Panel.tsx`、`components/SegmentedControl.tsx` 的文案。
- 不改 `workbench/snapshotOps.ts`、`workbench/loadSampleSessions.ts`、`workbench/session.ts`、`workbench/fileIO.ts`、`workbench/Workbench.tsx`、`workbench/NewCompareDialog.tsx` 的任何文案；`fileIO.ts` 里的 `FileDialogFilter.name`（`代码 / 文本` 等）与平台错误详情保留现状，属文件 IO / 收口 WI 的边界。
- 不改 `src/core/**`（diff3、`overwriteBlock`、`alignCsvTables`、`diffStructured`、`parse*`）、`src/main/**`、`src/preload/**`、`src/shared/**`；entity 类型、会话 id、缓存与调用序列不变。
- 不改布局、间距、差异语义色、字号、四态 / 五态语义与虚拟化行为；不把 `DiffPane` / `MergePane` / `CodeBlock` 改造成带文案参数的组件。
- 不改 `messages/index.ts` 的五个表面聚合，不新增表面文件、不新增运行时依赖、不新增存储键。
- 不把 core / 主进程抛出的原始错误 detail 翻译成英文；只本地化错误外壳（标题、说明、按钮）。
- 不碰 `package.json#version`、`CHANGELOG.md`、`README.md` / `README.zh-CN.md`、发布工作流与证据；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`），不做全主链路扫描（归收口 WI）。

## 实现约束

- 词典归属：文件级三个视图共用的一切新键放 `files` 表面成对文件；能被多视图复用的语义词优先复用既有 `common.diff.*` / `common.kind.*` / `files.action.copy`。键名用命名空间点号并按视图分组：`files.code.*`、`files.merge.*`、`files.csv.*`、`files.structured.*`、`files.notice.*`。
- **zh 值必须逐字沿用当前界面文案**（含全角标点、「」、`·`、`→`、`（未保存）`）；当前就是英文技术词的（`Accept Ours/Theirs/Both/Base`、`base` / `ours` / `theirs`、`JSON` / `YAML`）在中英两本词典里取同值，并在 `src/renderer/src/i18n/messages.test.ts` 的 `LATIN_ONLY_KEYS` 里登记并注释理由 —— 中文保持现状优先于「消除技术词」。
- 插值只用 `{name}`；多变量句子用整句模板（`{visible} / {total} 行`、`对齐 {rows} 行 · 主键 {keys}`、`重复主键 {count}`、`{key}（左 {left} · 右 {right}）`），英文语序由模板决定，不按中文逐段拼接；计数单复数不新增 helper（这些句子中英都用「数量词」形态）。
- 纯符号占位不建键：`∅`、`—`、`#`、`\u00a0`、路径 / 文件名 / 文件正文、`merged.txt` 默认文件名、冲突标记（`<<<<<<< ours` 等来自 core）一律保持原样。
- `MODE_OPTIONS` / `ACCEPT_OPTIONS` / `FILTER_OPTIONS` / `STATUS_LABELS` 等常量数组改为承载稳定 `value` + 词典键（或直接在渲染期 `t(...)`），不得把 `t()` 结果缓存进模块级常量，也不得在渲染期之外解析语言。
- 视图内一切文案在渲染期取 `useI18n().t(...)`；`useMemo` 依赖里若引入语言相关的渲染，必须把 `language` 纳入或改为渲染期取值，禁止把中文字符串存进会话 / 状态对象。
- 平台 dialog `title`、按钮 `title`、`aria-label` 同样走词典（扫描不豁免注释与属性）；错误通知的详情（`cause.message`）原样透传。
- 既有 zh 断言保持不变是硬要求：`CodeView.test.tsx` / `CsvView.test.tsx` / `StructuredView.test.tsx` 采用无 Provider 的 `render`（回落 zh），新增 en 用例用 `renderWithI18n(..., 'en')`；语言切换用例在测试文件内用 `I18nProvider` + 一个调用 `setLanguage` 的探针按钮驱动，不新增生产 API。
- 扫描测试放在 `src/renderer/src/views/filesScan.test.ts`，清单常量 `FILES_COPY_FILES` 显式列出六个文件；文件名 / 目录结构沿用 `workbench/shellScan.test.ts`。
- 注释用英文（扫描不豁免注释）；renderer 不 import Electron，不新增依赖。
