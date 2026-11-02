# 双栏 diff 两个开关默认开启、即时重算并跨会话保持

## Scope

把前序三项已交付的地基接到界面上，形成用户可用的闭环。本项只做**视图接线 + 布局预算 + 交互与保持语义**，不重做任何判定。

1. **开关状态（单一运行期来源）**
   - 两个开关值 `{ ignoreNewline, ignoreEncoding }` 由 `Workbench` 持有**一份运行期偏好**（内存中，不进会话对象、不进 `localStorage`、不进设置项），缺省取 `resolveComparisonSwitches({})`（两者皆 `true`）。
   - `CodeView` 以受控 `switches` + `onSwitchesChange` 接收；独立渲染（无 shell）时退回同默认值的一份内部 state，默认规则仍只走 `resolveComparisonSwitches`，不得在 UI 内硬编码第二份 `true` 缺省。
   - 语义：这是一次**运行期比较口径偏好**，不是每个 tab 各一份。切 tab、切会话、同会话内换开左右文件、目录下钻返回（含重新下钻同一相对路径，其会话 id 是确定性的、会被 `upsertSessions` 整体替换）后都保持当前值；新开会话沿用当前值；重启回到默认开启。
2. **工具栏控件（代码双栏现有 `view-toolbar` 带内）**
   - 在现有 `code-diff` 行追加控件：`ignore-newline` 开关、`ignore-encoding` 开关、差异计数读数、字节差异信号。
   - 开关用原生可聚焦控件实现（`button`/`input`）并带 `role="switch"` + `aria-checked`，名称走词典；点击与 Space / Enter 触发同一个 toggle 函数（不允许两套切换逻辑）。
   - 不新增 `TOOLBAR_ROWS` 行、不使用 `data-shell-entry`、不新增 app 顶栏动作、不改 `SHELL_ENTRY_IDS`。
   - 新增的四个控件按现有 `TOOLBAR_ROWS` 机制登记宽度（`control()` / `collapsible()`），compact 档为 icon-only，使 `measureToolbar(tier, 'view-toolbar', 'code-diff').fits` 在 1024 / 1440 / 1920 三档成立。
3. **即时重算（不重新读盘）**
   - `CodeDiffView` 的比较入口改为消费开关：两侧都有探测事实且两侧工作副本仍等于各自加载源时用 `diffLineTextsWithFacts({ text, encoding, sha256 }, …, switches)`；否则用 `diffLineTexts(leftText, rightText, switches)`（无事实不得虚构）。
   - 切换开关只触发一次内存重算（`useMemo` 依赖开关值），不调用 `probeTextFile`、不重建会话、不改 `pair` / `probes`。
   - 块计数、行级 / 行内高亮、差异计数、字节差异信号全部读**同一次** `LineDiffComparison`（`rows` / `blocks` / `normalization` / `differenceCount`），禁止 UI 内第二套判定。
4. **差异可观测**
   - 工具栏新增 `[data-code-diff-count]` 读数，文本恒等于 `differenceCount`；块导航「差异块 a/b」语义不变（分母仍为 `blocks.length`）。
   - 当 `normalization.encoding.byteDifference === true` 时渲染 `[data-code-diff-bytes]`（词典文案 + 危险语义色），关闭「忽略编码」时它出现且计数从 0 变 1；重新开启后消失、计数归 0。
5. **接线范围**
   - `Workbench` 的 `code` 分支（样本会话与下钻 / 文件对会话）都把 `session.probes` 与开关一起传给 `CodeView`；状态栏（`probeStatus`）保持只读会话固化事实，不受开关影响。
   - 文案键同时写入 `i18n/messages/zh/files.ts` 与 `en/files.ts`，键集中英对等。

## Acceptance Criteria

- ac-switch-default-on: 代码双栏 Diff 首次渲染即出现 `[data-code-switch="ignore-newline"]` 与 `[data-code-switch="ignore-encoding"]`，两者 `role="switch"` 且 `aria-checked="true"`；同一输入下其比较结果与显式 `{ ignoreNewline: true, ignoreEncoding: true }` 同构（`rows` / `blocks` / `differenceCount` / `identical` 一致）。
- ac-switch-in-existing-toolbar-row: 两个开关位于唯一一个 `[data-shell-level="view-toolbar"]` 带的代码行内，且**都不带** `data-shell-entry`；`SHELL_ENTRY_IDS.length === 18`、`entriesFor('app')` 与 `entriesFor('view-toolbar', 'code-diff')` 集合不变、`viewToolbarRows('code-diff') === 2`（未新增行）。
- ac-budget-fits: `measureToolbar(tier, 'view-toolbar', 'code-diff').fits === true` 对 `compact` / `regular` / `wide` 全部成立，且 `code-diff` 行内已声明 `code-switch-newline` / `code-switch-encoding` / `code-diff-count` / `code-diff-bytes` 四个控件，`controlPresentation(id, tier)` 对三档均可解析且宽度 > 0（compact 档开关与字节信号为 `icon-only`）。
- ac-toggle-newline-recompute: 同一对「字符完全相同、仅 CRLF 与 LF 不同」的输入，默认（开）时 `blocks.length === 0`、`differenceCount === 0`、无差异行；点击关闭「忽略换行」后 `blocks.length >= 1`、`[data-code-diff-count]` 文本 > `0` 并出现非 `same` 行（仅换行不同时行内片段允许为空）；再开启后回到 `0`。
- ac-toggle-encoding-signal: 两侧解码文本逐字相同、`sha256` 不同的输入，默认（忽略编码开）时计数为 `0` 且无 `[data-code-diff-bytes]`；关闭「忽略编码」后 `[data-code-diff-bytes]` 出现、`[data-code-diff-count]` 文本为 `1`、不新增修改行；再开启后信号消失、计数回 `0`。
- ac-diff-count-single-source: `[data-code-diff-count]` 的文本在任何开关组合下恒等于该次比较的 `differenceCount`；块导航分母恒等于同一次结果的 `blocks.length`；组件内不存在独立的差异计数表达式。
- ac-real-diff-visible: 字符替换 / 行尾空格 / 大小写 / 行序四类真实差异在四种开关组合下都仍渲染非 `same` 行且 `[data-code-diff-count]` 文本 ≥ `1`（行内 `changed` 片段在有对位字符时保留）。
- ac-no-reprobe-on-toggle: 会话打开后连续切换两个开关各两次，`platform.probeTextFile` 调用次数不增加，会话 `probes` 与 `pair.left/right.text` 逐字不变（重算复用内存工作副本）。
- ac-keyboard-toggle: 两个开关可聚焦（原生可聚焦元素）；点击、`keydown` Space、`keydown` Enter 都走同一个 toggle，单次操作只翻转一次，`aria-checked` 与生效值始终一致。
- ac-persist-tab-roundtrip: 在代码 Diff 会话关闭两个开关 → 切到另一个会话 tab 再切回，两开关仍为关闭且 `[data-code-diff-count]` 与切走前一致；经 New Compare 打开第二个文件对会话时显示当前运行期值（不重置为开启）。
- ac-no-cross-restart-persist: 切换开关前后 `localStorage` 快照逐键不变，仓库内不存在写入开关状态的持久化代码；重新挂载 `Workbench` 后两开关回到默认开启。
- ac-edit-no-stale-bytes: 任一侧工作副本与加载源不同时比较不引用固化 `sha256` 报字节差异：把两侧编辑到逐字相同后 `differenceCount === 0`、无 `[data-code-diff-bytes]`。
- ac-no-probes-safe: 无探测事实（`CodeView` 独立渲染、或某侧缺事实）时关闭「忽略编码」不崩溃、不渲染 `[data-code-diff-bytes]`，判定只基于文本。
- ac-status-invariant: 切换两个开关前后，代码双栏状态栏「左换行 / 左编码 / 右换行 / 右编码」四个值文本逐字不变（读数仍只来自会话固化事实）。
- ac-suite-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及既有全部 code-gates 全绿；新增测试行数只通过 `.munk/baseline/test-debt.json` 的 `growth[]` 声明计入（`from` = 当前已提交 ceiling），不改 floor、不改判定口径、不为凑绿放宽断言。

## Non-Goals

- 不做跨重启持久化：不写 `localStorage` / 设置项 / IPC 存储，不改 Settings 对话框，不做「记住上次选择」。
- 不做三向合并的开关与合并判定（合并视图、`merge.ts`、`splitLines` 保持现状，既有断言零回归）。
- 不改比较层与探测层口径：不新增阈值、不改 `foldNewlines` / `describeNormalization` / `probe.ts`、不引入编码依赖、不改 `diffLineTexts` / `diffLineTextsWithFacts` 语义。
- 不新增 `TOOLBAR_ROWS` 行、不新增 app 顶层入口 / 顶栏动作 / 全局快捷键 / 首屏向导；不改 `SHELL_ENTRIES`。
- 不改 `probeStatus` 四个原始值、不改导出 / 报告 / 快照 / 目录四态、不做转码写回。
- 不做真实磁盘端到端证据、5 MB 级性能实测与窗口点击可操作性（由 WorkSet 后续证据子项承担）；本项只用 jsdom + 纯函数断言，`needSelfTest=false`。
- 不新增 code-gates 条目（WorkSet 约定的单条新门已由 `diff-normalize` 占位）；本项的回归断言并入既有 `test` 门。
- 不为凑绿放宽 lint / typecheck / 测试，不 bump 版本、不改 README / CHANGELOG / release notes。

## Implementation Constraints

- **单一来源**：开关值只在 `Workbench` 存一份（建议 `useState<ComparisonSwitches>`，初值 `resolveComparisonSwitches({})`），不得再存进 `WorkbenchSession`；原因：目录下钻会话 id 是确定性的（`file:{parentId}::{relativePath}`），`upsertSessions` 会整体替换该会话对象，逐会话存储会在「下钻返回再进入」时静默重置。
- **默认值只定义一次**：UI 不得写 `ignoreNewline: true` 字面量缺省，一律经 `resolveComparisonSwitches`；生效值回读 `diff.normalization.ignoreNewline / ignoreEncoding` 做展示。
- **比较入口**：`CodeView` 需要新增可选 `probes?: FilePairProbes` 与 `switches?` / `onSwitchesChange?`；`Workbench` 两个 `CodeView` 分支都传 `session.probes`（样本会话已带事实）。无事实或任一侧 dirty 时走两参文本入口 + switches，绝不借用固化 `sha256`。
- **计数同源**：`differenceCount`、`blocks.length`、`byteDifference` 全部来自同一个 `LineDiffComparison` 调用结果；工具栏块导航继续读 `blocks`，不得引入第二套切行 / 计数（`docs/lessons.md` §9）。
- **DOM 契约**（供门禁与后续状态栏 / 证据引用）：`data-code-switch="ignore-newline" | "ignore-encoding"`、`data-code-diff-count`、`data-code-diff-bytes`；**不得**复用 `data-shell-entry`（`shellLayout.dom.test.tsx` 用该属性做入口集合断言）。
- **预算登记**：在 `TOOLBAR_ROWS` 的 `code-diff` 行 `controls` 内新增四个唯一 id；参考宽度——两个开关 `collapsible(id, 132, 26)`、计数 `control('code-diff-count', 60)`、字节信号 `collapsible('code-diff-bytes', 88, 26)`；compact 现余量约 `178px`（现有行合计 830 / 可用 1008），宽度须按真实渲染量取，目标是三档 `fits === true`，不要靠缩小 `extra` 或删既有控件腾位。
- **文案**：`files.code.ignoreNewline` / `files.code.ignoreEncoding` / `files.code.differenceCount` / `files.code.byteDifference` 同时写入 `zh/files.ts` 与 `en/files.ts`；开关的可访问名与 `aria-checked` 状态即「状态可读」，不改状态栏词典。
- **测试落点**：开关交互与持久化 jsdom 断言放 `src/renderer/src/views/CodeView.switches.test.tsx`（或 `CodeView.test.tsx` 追加）；布局预算断言追加到 `src/renderer/src/workbench/shellLayout.test.ts`；tab / 会话往返与 `localStorage` 不变断言放 `src/renderer/src/workbench/` 下的 dom 测试（可沿用 `probeStatus.dom.test.tsx` 的 `Workbench` + 注入 `probeTextFile` 端口写法）。不要撑破 `src/test/sharedHarness.tsx` 的 400 行预算。
- **测试债**：新增测试行数按 `.munk/baseline/test-debt.json` 的 `growth[]` 声明（`metric: repoTestLines`，`from` 必须等于当前已提交 ceiling `43599`，`to` 为实测新值，`addedCases` 与新增用例数一致），禁止直接改 `floors`。
- **不动的东西**：`src/core/text/**`、`src/core/directory/**`、`src/shared/**`、`src/renderer/src/workbench/probeStatus.ts`、`StatusBar` 的四个原始值渲染路径、`fileIO` / `probeTextFile` 通道。
