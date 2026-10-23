# 工作台外壳与新建对比双语化

本项是「桌面端 UI 双语化」的第二个 WI。前置 `i18n-core` 已交付词典 / Provider / 首启解析 / 设置通道，但**尚未在 App 挂 Provider，双语链路当前未生效**。本项把外壳（App 启动 + 工作台 + 新建对比 + 共享展示组件）接进词典，并让会话标题 / 副标题 / 统计标签改为渲染期按 key 解析。设置面板、目录视图与文件级视图文案不在本项。

## 范围

1. **启动接线（`src/renderer/src/App.tsx`）**
   - 启动时用 `loadInitialLanguage(platform)` 解析语言（记录优先，无记录时 `zh*` 系统语言 → 中文，其余 → 英文），解析期间只渲染**无文字的品牌引导帧**（仅图标 / 骨架，无标题、无按钮、无任何可见文案），解析完成后以解析结果作为 `I18nProvider` 初值挂载 `<Workbench platform={platform} />`，工作台只挂载一次。
   - 语言值只作为 `initialLanguage` 传入，**不得作为 `Workbench` / 视图的 React `key`**，切换语言不得重挂载工作台。
   - `?perf=1` 的测量窗口分支保持现状（同步、不读设置、不挂 Provider、不加启动门）。

2. **工作台外壳可见文案（`src/renderer/src/workbench/Workbench.tsx`）**
   - 顶栏：品牌副标题、视图切换的 `aria-label` 与四个视图标签、`新建对比 / 打开文件 / 打开文件夹 / 加载演示样本 / 演示样本` 及其 `title` 提示、演示样本下拉菜单（含「加载全部演示样本」与各演示项、样本读取失败项）。
   - 空态 / 载入态 / 错误态（`StateView` 的 title / description / hint / 动作按钮）与错误态的重试按钮。
   - 会话标签条（`SessionTabs` 入参）、通知条文案（拖拽单项 / 多项、取消、已跳过、快照导出 / 导入结果、下钻不支持、符号链接指向目录、返回上级目录视图的两种结果、`来源目录对比：…` 行）、关闭未保存修改确认对话框（标题 / 描述 / 两个按钮 / 正文说明）。
   - 目录对比进度条（`role="status"` 的 `aria-label`、阶段文案、已扫描 / 已校验 / 累计计数、已处理字节、取消按钮与取消完成通知）。
   - 状态栏标签（会话、运行平台）与 `CompositionLegend` 的差异语义标签。
   - 平台选择器 / 保存对话框标题（`selectFile` / `selectDirectory` / `saveFile` 的 `title`）。

3. **会话显示文案渲染期化**
   - 新增 renderer 侧纯函数（建议 `src/renderer/src/workbench/sessionDisplay.ts`）：输入一个 `WorkbenchSession`，输出 `{ title, subtitle, stats: readonly { key, value, tone? }[] }` 的显示描述；`Workbench` 只在渲染期用 `t(key, params)` 生成可见文案。
   - 四个内置样本会话（`session-directory` / `session-code` / `session-csv` / `session-structured`）的标题、副标题改为词典键；**离线（无运行时会话对象）不得直接展示 fixture 里的中文标题 / 副标题**。
   - 运行时会话：目录对比标题 / 副标题由两侧名称 / 真实根路径组成（用户数据不翻译）；文件对标题由文件名组成；副标题为两侧路径 + 本地化的文件类型名。
   - 统计条目改为稳定角色 key（如源文件 / 目标文件 / 差异 / 左行数 / 右行数 / 冲突块 / 主键列 / JSON 节点 / 样本文件），值仍取会话现有数值；**删除 `stat.label === '冲突块'` 这类用中文文案做逻辑判断的写法**，代码视图的冲突数覆盖改为按稳定统计 key 判断。
   - 下钻会话「某侧缺失」的占位不再把中文写进路径数据：用稳定侧标记表示，渲染期取词典文案。

4. **新建对比对话框（`src/renderer/src/workbench/NewCompareDialog.tsx`）**
   - 标题 / 描述 / 左右路径标签 / 两个输入占位 / `Enter 提交 · Esc 关闭` 提示 / `取消` / `建立对比` / 打开文件与打开文件夹按钮及其 `title` 全部走词典；占位里的示例路径可为 ASCII 路径（用户数据）。
   - 校验失败按 `compareRequest` 的稳定错误码（`MISSING_SIDE`、`DUPLICATE_SIDE`、`EMPTY_PATH`、`UNKNOWN_SCHEME`、`UNKNOWN_ACTION`、`NOT_FOUND`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE`、`ACCESS_DENIED`）取当前语言文案，并保留路径 / 名称等参数；`parseManualPaths` / `resolveCompareRequest` 本身不改。
   - 错误外壳（`role="alert"` 所在表单、标签、按钮、Enter/Esc 提示）始终为当前语言；未知的底层 I/O 失败只允许错误**详情**沿用原始 message。

5. **共享展示组件**
   - `Dialog.tsx`：关闭按钮可访问名走词典（zh 仍为「关闭」）。
   - `SessionTabs.tsx`：`tablist` 可访问名、未保存修改标记（`title` + `sr-only`）、关闭按钮可访问名（`关闭 {title}` → en `Close {title}`）走词典。
   - `StatusBar.tsx` / `DiffBadge.tsx` / `diffSemantics.ts`：差异语义标签（相同 / 新增 / 删除 / 修改 / 冲突）改为词典键（`same/added/removed/modified/conflict`），`CompositionLegend` 与 `DiffBadge` 渲染期解析；`DIFF_STATUSES` 与颜色类保持不动。
   - `StateView.tsx` 自身不含文案，不改。

6. **文件类型标识（`src/renderer/src/workbench/fileKinds.ts` 的最小改动）**
   - 把中文标签 `代码 / 文本` 换成稳定类型标识（code / csv / tsv / json / yaml），渲染期由词典取显示名（zh 仍为「代码 / 文本」、`CSV` / `TSV` / `JSON` / `YAML` 不变）。
   - 「两侧文件类型不一致」的判断改用稳定类型标识（结构化按 `json` / `yaml` 区分），不再比较文案；该错误与「暂不支持对比」改为带稳定 code 的错误，由外壳按当前语言渲染（zh 文案与现状逐字一致）。会话 id / 比较结果 / 缓存不受影响。

7. **词典键**
   - 只往既有 `common` 与 `shell` 两个表面成对加键（`messages/zh/*` 与 `messages/en/*` 同名文件），不新增表面文件、不改既有键语义、不引入依赖。
   - **zh 词典值必须与当前界面中文逐字一致**（仅抽出为 key），这样既有 zh 断言不变；en 为句子式产品措辞，插值只用 `{name}`。
   - 多变量句子（进度、已跳过、导出 / 导入结果、同步 / 模板汇总之外的 shell 文案）用整句模板 + 占位符，不按中文语序逐段拼接；计数单复数用最小 `one` / `other` 键。

8. **测试**
   - 新增本范围的「中文硬编码」扫描断言（复用 `scanHardcodedChinese`，显式文件清单，0 命中）与中英双语冒烟。
   - 既有 `App.test.tsx`（13 处 `render(<App />)`）与 `App.snapshot.test.tsx` 因启动变为异步 + 无记录默认英文，需要在渲染前写入 zh 记录（`opencompare.userSettings`）并等待首屏出现，保留现有中文断言；`Workbench` 直连渲染的测试因无 Provider 回落 zh，不改断言。
   - `TreeView.test.tsx`、`DirectoryView.test.tsx` 中引用 `DIFF_LABELS` 的两处断言改为经 zh 词典取值（zh 值不变）。

## 验收

- ac-app-startup-en: 平台无设置记录且 `systemLocale` 为 `en-US`（或 `fr-FR`）时渲染 `App`，首屏出现英文顶栏副标题、英文空态标题与英文主按钮，且不存在当前中文空态标题。
- ac-app-startup-zh: 平台无设置记录且 `systemLocale` 为 `zh-CN`/`zh-Hant` 时渲染 `App`，首屏为现有中文空态标题与按钮。
- ac-app-startup-stored-wins: 记录 `en` + 系统 `zh-CN` → 首屏英文；记录 `zh` + 系统 `en-US` → 首屏中文。
- ac-app-startup-gate: 设置读取未 settle 时，可见 DOM 中没有任何文本节点（品牌帧无文字）、没有 heading / button / tablist；settle 后工作台出现且启动期间只挂载一次（平台订阅与 `compareRequestsReady` 各调用一次，不出现先中文后英文的两批渲染）。
- ac-app-perf-branch: `?perf=1` 时仍直接渲染测量窗口，不读设置、不显示启动帧、DOM 中无工作台。
- ac-shell-header-copy: en 下顶栏可见 `New comparison` / `Open file` / `Open folder` / `Load demo samples` / `Demo samples` 与英文副标题；zh 下这五处与现状逐字一致；对应 `title` 也随语言切换。
- ac-view-switcher-copy: 视图切换 `tablist` 的可访问名与四个视图标签在中英下分别为当前语言；en 下为英文（如 `Directory` / `Code diff & 3-way` / `CSV key comparison` / `JSON / YAML`），切到 zh 后为现有中文标签。
- ac-empty-state-copy: 空态标题 / 描述 / hint / `新建对比` / `打开文件` / `打开文件夹` 在中英下均为当前语言，zh 与现状逐字一致。
- ac-session-tabs-copy: en 下 `tablist` 可访问名为 `Sessions`，关闭按钮可访问名为 `Close {title}`；zh 下为「会话」「关闭 {title}」；带未保存修改的标签在两种语言下都有当前语言的未保存提示（`title` 与 `sr-only`）。
- ac-sample-session-display: 加载演示样本后，en 下四个标签的标题 / 副标题均为英文（不出现 fixture 中文标题）；zh 下与现状逐字一致；两种语言的会话 id 集合与标签顺序完全相同。
- ac-runtime-session-display: 打开真实文件对与目录对后，en 下副标题的路径 / 文件名保持原样、文件类型名为英文，zh 下与现状一致；会话 id 与 `file:` / `directory:` 前缀不变。
- ac-stat-conflict-by-key: 代码会话的冲突统计在中英下都显示运行时未解决冲突数（不是 fixture 常量），且源码中不再存在 `stat.label` 与中文字面量的比较（扫描断言 `stat.label ===` / `=== '冲突块'` 命中为 0）。
- ac-close-unsaved-dialog: 关闭含未保存修改的会话时，en 对话框标题 / 描述（含会话标题插值）/ `Continue editing` / `Discard and close` / 正文说明为英文；zh 与现状逐字一致；两种语言下「继续编辑」不关闭会话、「放弃修改并关闭」关闭该会话。
- ac-progress-and-cancel: 目录对比进行中，en 下进度条 `aria-label`、阶段文案、`已扫描/已校验/累计` 三个计数句、`已处理 {size}` 与 `Cancel` 均为英文且计数与字节仍随真实批次增长；zh 与现状一致。
- ac-cancel-notice: en 下点击取消后出现英文取消通知，工作台会话 / 状态栏 / 视图 DOM 与取消前一致；zh 下通知为现有文案。
- ac-drag-notices: 拖入 1 个路径、3 个路径、1 文件 + 1 文件夹三种情况在中英下分别得到当前语言提示（含路径 / 数量参数），且都不创建会话。
- ac-notice-skipped-and-snapshot: 「已跳过 左 {l} / 右 {r}」与快照导出 / 导入成功通知、`来源目录对比：…` 与返回上级目录的两种结果在中英下均为当前语言（会话标题作为参数原样插入）。
- ac-picker-titles: 打开文件 / 打开文件夹 / 导出快照传给平台的对话框 `title` 为当前语言（用 fake port 断言收到的 title）。
- ac-new-compare-copy: en 下对话框标题、描述、`左侧路径`/`右侧路径` 标签、`Enter to compare · Esc to close` 提示、`Cancel` / `Compare` / `Open file` / `Open folder` 与 `title` 全为英文且不含汉字；zh 与现状逐字一致。
- ac-new-compare-validation: 空右侧 / 两侧同路径 / 文件与目录混合 / 不支持的扩展名四种输入，分别按 `EMPTY_PATH`、`DUPLICATE_SIDE`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE` 在中英下给出当前语言文案并保留涉及的路径 / 文件名；对话框保持打开、不产生会话、不触发目录扫描。
- ac-new-compare-unknown-io: 让打开过程抛出一个不带错误码的底层失败时，alert 内保留原始详情文本，而对话框标题、标签、按钮、Enter/Esc 提示仍为当前语言。
- ac-shared-component-copy: en 下对话框关闭按钮可访问名为 `Close`、差异语义标签为 `Same/Added/Removed/Modified/Conflict`（`DiffBadge` 与状态栏图例一致），zh 下为「关闭」与「相同/新增/删除/修改/冲突」；zh 值不变使既有组件 / 视图测试保持通过。
- ac-han-scan-shell: 用 `scanHardcodedChinese` 扫描本范围显式清单（`src/renderer/src/App.tsx`、`workbench/Workbench.tsx`、`workbench/NewCompareDialog.tsx`、`workbench/sessionDisplay.ts`、`workbench/fileKinds.ts`、`components/Dialog.tsx`、`components/SessionTabs.tsx`、`components/StatusBar.tsx`、`components/DiffBadge.tsx`、`components/diffSemantics.ts`）命中数为 0（注释、`aria-label`、`title` 不豁免）。
- ac-en-smoke-no-han: en 下空态 + 新建对比对话框 + 演示样本标签条 + 状态栏的可见文本不含汉字（`{Script=Han}` 计数为 0，ASCII 测试路径除外）。
- ac-no-extra-work: 同一会话在中英两种渲染下，`listDirectory/listDirectories/digestFiles/readTextFile` 的调用次数相同，标签数量、会话 id、顺序与活动标签一致（本地化不引入重新扫描或新建会话）。
- ac-existing-suite: `pnpm test` 全绿，其中既有 App / snapshot / Workbench 行为断言除「启动前需预置 zh 记录并等待首屏」外不变。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；`code_gates.json` 不改、不新增专用 gate。

## 非目标

- 不做设置面板、齿轮入口、语言切换 UI 与写盘（归「设置面板与即时切换」WI）；本项只消费 `initialLanguage`，不做 `setLanguage` 交互。
- 不做 `src/renderer/src/views/**` 的任何文案（目录树、四态过滤、同步 / 模板对话框、代码 / CSV / 结构化视图、`TemplateDialog`、`DirectorySyncDialog`），不做这些视图的「切换不重算」验收。
- 不改 `workbench/snapshotOps.ts`、`workbench/loadSampleSessions.ts`、`workbench/session.ts`、`workbench/fileIO.ts` 里的中文提示与注释（属目录 / 快照面与后续 WI）：它们产出的 message 作为**错误详情**原样展示，外壳文案由本项本地化。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/compareRequest.ts`、`src/shared/platform/**` 的任何文案或行为。
- 不改 `src/shared/fixtures/**` 的数据与 `FixtureSession` / `SessionStat` 类型语义；不把 fixture 中文改成英文。
- 不改会话 id 生成规则、对比 / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；不新增或修改 `code_gates.json` 条目。
- 不新增运行时依赖（不用 i18next / react-intl），不新增词典表面文件，不新建存储键，不改 `index.html` 的 `lang` 属性。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`），不做 perf 窗口与 `components/TreeView.tsx` / `SplitPane.tsx` 的文案。

## 实现约束

- 词典归属：跨表面共享的（差异语义、文件类型名、通用按钮、`Sessions`、`Close`、`Close {title}`）放 `common`；工作台壳与新建对比专属的放 `shell`。键名沿用命名空间点号（如 `shell.toolbar.newCompare`、`shell.progress.cancel`、`shell.session.sample.code.title`、`common.diff.conflict`、`common.fileKind.code`）。
- zh 值必须逐字沿用当前中文（含标点、全角括号与「」），en 用句子式措辞（`New comparison`、`Open file`、`Now scanning directories`），不机翻、不留 `TODO` / 未翻译占位、不中英混排（路径 / 文件名 / 快照名等用户数据除外）。
- 会话显示辅助函数必须是纯函数且不 import DOM / Electron；显示键按会话**身份**（样本 id、`scene`、`adhoc`、`directory`、`sides`）决定，不读 `session.stats[i].label` 决定分支。
- `SessionStat` 的 `label` 字段保留（fixtures 与既有类型不动），但 `Workbench` 不再渲染它、也不再据它判断。
- `DIFF_LABELS` 改为 `DIFF_LABEL_KEYS: Record<DiffStatus, MessageKey>`；只同步改 `TreeView.test.tsx`、`DirectoryView.test.tsx` 两处断言取 zh 词典值。
- `fileKinds.ts` 的 `label` 改为稳定标识后，`directoryCompare.ts` 里拼接副标题与比较类型的位置同步改用该标识；会话 id、`sides`、比较结果与缓存调用序列不得变化。
- 文件对的两类已知失败用带 `code` 的错误（`unsupported-type`、`mixed-family`）承载参数；`Workbench` 与 `NewCompareDialog` 按 code 取键，未知错误仍显示原始 message。
- 扫描清单写成一个常量数组，测试直接遍历；新增 shell 文件必须同时加入清单，否则视为未覆盖。
- 既有 `App.test.tsx` / `App.snapshot.test.tsx` 的适配方式：`beforeEach` 写入 `localStorage['opencompare.userSettings'] = '{"language":"zh"}'`（并在 `afterEach` 清理），首屏断言改为 `await screen.findByRole(...)`；不得为了通过测试把生产默认语言改成中文。
- renderer 仍不得 import Electron；新代码不引入 `@core` 之外的新依赖；注释用英文（扫描不豁免注释）。
