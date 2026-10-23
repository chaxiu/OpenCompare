# 主链路全量 Han 扫描、双语冒烟与交付收口

## 范围

本项是双语化需求集的最后一个 WI，只做「把剩下的文案载体清零 + 用自动断言锁住 + 交交付说明」，不新增功能、不改交互与算法。

1. **补齐主链路剩余文案载体，使全量扫描为 0**。当前主链路仍有 24 行 `\p{Script=Han}` 命中，分布在 7 个文件：
   - `src/renderer/src/components/SplitPane.tsx`：分隔条 `aria-label`（`调整分栏宽度`）。
   - `src/renderer/src/components/SegmentedControl.tsx`：`label` 注释里的中文示例。
   - `src/renderer/src/workbench/directoryCompare.ts`：`comparisonStats` / 文件对会话的统计 `label`（`文件（源）` / `文件（目标）` / `差异` / `行数（左）` / `行数（右）`，共 5 行）、一处注释里的中文字面量（`返回上级目录视图`）、`FilePairError` 的兜底可读 message（`暂不支持对比…` / `两侧文件类型不一致…`）。
   - `src/renderer/src/workbench/fileIO.ts`：`TEXT_FILE_FILTER.name`（`代码 / 文本`）。
   - `src/renderer/src/workbench/snapshotOps.ts`：`SNAPSHOT_FILE_FILTER.name`（`OpenCompare 快照`）、`readFileText` 的通用失败 message、`describeSnapshotImportError` 的 7 个已知 code 文案、`describeSnapshotContentError` 的 2 个已知 code 文案。
   - `src/renderer/src/workbench/loadSampleSessions.ts`：`simulateFailure` 的样本库读取失败 message。
   - `src/renderer/src/workbench/session.ts`：含中文字面量的注释。
2. **建立全主链路扫描回归钉板**：一个显式根清单的扫描测试，`\p{Script=Han}` 命中必须为 0；根清单覆盖 `src/renderer/src/workbench/**`、`views/**`、`components/**`、`i18n/**`（`messages/**` 除外）、`App.tsx`、`main.tsx`。注释、`aria-label`、`title`、`data-testid` 一律不豁免。
3. **未覆盖清单可核验**：`perf/**`、`platform/**` 等不纳入扫描的目录，以 `{ path, reason }` 常量登记理由，并逐条写进交付说明。
4. **中英双语冒烟**：默认英文与中文各一条，覆盖首屏、新建对比、目录过滤（五档）、代码 / CSV / 结构化三个文件级视图、设置面板。
5. **术语与中英混排审校**：以术语表常量锁定核心概念的英文唯一词形，清理遗漏的不一致（只改词典与测试）；英文界面不出现中文文案，中文界面不出现整句英文。
6. **交付说明**：写明扫描命中数（0）、扫描根清单、未覆盖目录及逐条理由、术语表、双语冒烟覆盖的表面。

## 验收

- ac-scan-zero：用 `@shared/i18n/scanHardcodedChinese` 扫描显式根清单（`src/renderer/src/workbench`、`views`、`components`、`i18n`、`App.tsx`、`main.tsx`），排除仅限 `*.test.*` 与 `i18n/messages/**`，命中数组为 `[]`；注释、`aria-label`、`title` 不豁免。
- ac-scan-roots-complete：扫描根清单是常量数组，测试对每个根递归枚举现存源码文件后断言「清单覆盖到的文件集合 == 实际文件集合」，新增主链路文件未入清单时测试失败。
- ac-uncovered-listed：未覆盖目录以 `{ path, reason }` 常量登记，至少包含 `src/renderer/src/perf/**`（测量探针窗口，主链路不加载，且其自身不面向用户文案）与 `src/renderer/src/platform/**`（Web 运行时回退错误，属平台层原始诊断信息）；每条 `path` 在仓库中真实存在、`reason` trim 后非空，且这些目录不被扫描根覆盖。
- ac-splitpane-aria：`SplitPane` 分隔条可访问名在 zh 为 `调整分栏宽度`、en 为 `Resize panes`；指针拖拽与键盘方向键调整的比例变化序列与改动前一致。
- ac-file-filter-lang：打开左 / 右文件与保存合并结果传给 `selectFile` / `saveFile` 的 `filters[0].name` 随当前语言切换（zh `代码 / 文本`、en `Code / text`），`extensions` 数组逐项不变，调用次数与取消后的视图状态不变。
- ac-snapshot-filter-lang：导入 / 导出快照传给平台的 filter 名称随当前语言（zh `OpenCompare 快照`、en `OpenCompare snapshot`），`extensions` 仍为 `['ocsnap.json','json']`。
- ac-snapshot-error-localized：快照导入的 7 个已知失败（`invalid-json` / `invalid-schema` / `invalid-metadata` / `invalid-path` / `duplicate-path` / `invalid-hash` / `invalid-entry`）与内容失败的 2 个已知 code（`content-not-inlined` / `missing`）在 zh 与 en 下分别渲染当前语言的通知文案，并保留 `error.path` / `displayPath` 参数；同一 code 在切语言后已显示的通知同步重译。
- ac-snapshot-error-unknown-passthrough：非 `SnapshotFormatError` / `SnapshotContentError` 的底层错误仍原样展示原始 `message`（中英一致），不出现「未翻译」占位。
- ac-sample-error-localized：演示样本库读取失败（`simulateFailure`）的错误态标题 / 说明为当前语言，en 下该区域可见文本无汉字；错误详情不泄漏中文。
- ac-session-stat-stable：`comparisonStats` 与文件对会话产生的 `SessionStat.label` 不再是可见文案（用稳定标识），状态栏统计显示仍由 `describeSession` 的词典键决定；同一次目录比较 / 文件对打开的统计数值、`tone`、会话 id 与「冲突块」覆盖逻辑与改动前一致。
- ac-no-behavior-drift：上述改写前后，同一操作的 `listDirectory` / `listDirectories` / `digestFiles` / `readTextFile` / `selectFile` 调用次数与参数、会话数量与 id、过滤 / 选中 / 滚动、错误 code 完全相同（既有测试不改断言即通过，新增断言只补语言维度）。
- ac-smoke-en：平台无设置记录且 `systemLocale='en-US'` 时，首屏（品牌副标题、空态标题 / 描述 / 主按钮）、新建对比对话框（标题 / 左右标签 / 占位 / Enter·Esc 提示 / 按钮）、目录过滤五档与组名、代码 / CSV / 结构化三视图的标题与主按钮、设置面板（标题 / 分区 / 关闭名）均渲染为 `en` 词典值；这些指定表面的可见文本 `\p{Script=Han}` 计数为 0。
- ac-smoke-zh：预置 `{ language: 'zh' }` 记录后，同一批表面逐字渲染 `zh` 词典值（五档过滤仍为 `全部 / 仅差异 / 左独有 / 右独有 / 相同`），无空白文本、无占位串，信息量与改动前一致。
- ac-smoke-no-mixing：两条冒烟中，en 表面不出现任何 `zh` 词典独有值，zh 表面不出现 `en` 独有句子；中英同值的技术标识（`CSV` / `TSV` / `JSON` / `YAML` / `base` / `ours` / `theirs`）、自指标签 `English` / `简体中文`、路径与文件名为唯一例外。
- ac-glossary-canonical：术语表常量至少登记 8 个核心概念（comparison / difference / conflict / snapshot / sync / template / key column / session）的唯一英文词形；`en` 词典中每个 canonical 词形至少出现一次，且禁用变体 `Synchronisation`、`Snap shot`、`Comparision`、`Cancelation`、`colour`、`behaviour` 命中数为 0。
- ac-glossary-diff-vs-difference：`diff` 只用于视图 / 模式名（`shell.view.code`、`files.code.*` 的 `diff` 视图与 `Code diff` 措辞），变更块 / 差异统计一律用 `difference(s)`；术语表登记的键逐个断言不交叉混用。
- ac-en-copy-clean：`en` 词典所有值 trim 后非空、无首尾空白、无双空格、无 `TODO` / `未翻译` 类占位、无汉字（并入既有 `messages.test.ts` 断言）。
- ac-gates-green：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；`code_gates.json` 不新增、不改条目。
- ac-delivery-note：交付说明（本 WI 的 delivery summary）写明：扫描命中 0、扫描根清单、未覆盖目录及逐条理由、术语表 canonical 词形、双语冒烟覆盖的六个表面。

## 非目标

- 不新增功能、不改布局 / 视觉 / 差异语义色 / 字号 / 四态语义 / 快捷键；不改会话 id 生成、目录扫描、对比与缓存、CSV 对齐、结构化解析、合并与快照协议。
- 不把 `src/renderer/src/perf/**` 与 `src/renderer/src/platform/**` 纳入本次 i18n 改造，只在未覆盖清单里给理由。
- 不改 `src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/**`（含 `compareRequest` 稳定错误码与原始 I/O 文案）——未知底层错误详情仍按原样透传，属已知边界。
- 不改 `src/shared/fixtures/**` 的样本数据；不把 fixture 中文改成英文。
- 不改词典结构与键语义：不新增第六个表面、不改 `MessageKey` / 插值 / Provider / 设置通道 / 启动解析 / 语言切换时序；只按收口需要成对补键。
- 不引入第三方 i18n 框架或机翻、不新增运行时依赖、不新增专用 code gate、不改 `code_gates.json`。
- 不碰 `README.md` / `README.zh-CN.md` / `AGENTS.md` / `docs/**` / `CHANGELOG.md` / `package.json#version` / 发布工作流与发布证据；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`），不跑 perf 采样、不做长跑。
- 不顺手重写已交付轮次的中文或英文文案（除非命中 ac-glossary 类不一致）；不做「更好措辞」的润色。

## 实现约束

- 扫描测试沿用 `shellScan` / `directoryScan` / `filesScan` 的写法：根清单写成常量数组，测试直接遍历 `scanHardcodedChinese`；`scanHardcodedChinese` 的排除规则不改（只排除 `*.test.*` 与 `i18n/messages/**`）。
- 本 WI 允许改动的只有「文案载体」：词典值、`key + params` 映射、错误 code → 词典键的映射、注释语言、测试；不得改行为契约（调用序列、会话身份、过滤 / 选中 / 滚动、错误 code、平台 filter 的 `extensions`）。
- 非 React 模块（`snapshotOps` / `loadSampleSessions` / `directoryCompare` / `fileIO`）不得自己解析语言：已知错误按「稳定 code + 参数」产出，由 `Workbench` 在渲染期用 `t(...)` 生成文案；未知错误仍走 `detailNotice` 原样展示。
- `SessionStat.label` 字段与 `FixtureSession` 语义保留；workbench 生成的 label 用稳定标识，显示文案唯一来源仍是 `describeSession` 的键。
- 平台对话框 filter 名称由调用点按当前语言构造（或等价的纯函数），`TEXT_FILE_FILTER` 的 `extensions` 与 `SNAPSHOT_FILE_FILTER` 的 `extensions` 保持不变；不得把 `t()` 结果缓存进模块级常量。
- 词典只在既有五个表面成对扩充：zh 逐字沿用现有界面中文，en 为句子式产品措辞；自指标签 `English` / `简体中文` 不翻译。
- 冒烟测试写法沿用既有约定：en 用 `renderWithI18n(ui, 'en')`，App 级用 `localStorage['opencompare.userSettings']` 预置记录 + `await screen.findByRole(...)`；zh 断言取 `zh[key]` 值；不对含临时路径的整棵 DOM 做全量汉字扫描，只对指定表面元素断言。
- 术语表以测试常量呈现（不改生产 i18n API），canonical 词形与 en 词典现状一致（`comparison` / `difference` / `conflict` / `snapshot` / `sync` / `template` / `key column` / `session`，美式拼写）。
- 因本轮会把 `SplitPane` 等组件接上 `useI18n()`，无 Provider 时仍回落 zh，既有组件单测断言不变；不得把 `language` 用作任何组件 / 视图的 `key`。
- 视图 / 壳层文案变化会连带既有测试里的中文 selector 失效：如确需更新，改为词典取值或 en 真实文案，不允许放宽断言或删除用例。
