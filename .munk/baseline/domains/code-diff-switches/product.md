# Domain: code-diff-switches

代码双栏 Diff 的「忽略换行 / 忽略编码」两个开关的**视图接线与运行期保持**：工具栏控件、切换后的即时内存重算、单一来源的差异读数与字节差信号，以及跨 tab / 会话 / 下钻往返的运行期偏好。判定语义与结果契约归 `diff-normalize`，探测事实归 `text-probe`，壳层层级与预算表机制归 `workbench`；本域只把既有判定接到界面，不重做任何判定。

## 范围

- **运行期偏好（单一来源）**：`Workbench` 持有一份 `ComparisonSwitches`（初值只经 `resolveComparisonSwitches({})`，默认两项开启），不在 `WorkbenchSession` 上逐会话存储、不写 `localStorage` / 设置项 / IPC。`CodeView` 以受控 `switches` + `onSwitchesChange` 接收；独立渲染（无 shell）时以同默认值的内部 state 兜底，默认规则仍只来自 `resolveComparisonSwitches`，UI 内不出现第二份 `true` 缺省。切 tab、切会话、同会话内换开左右文件、目录下钻返回（含同相对路径重新下钻、会话对象被整体替换）后保持当前值；新开会话沿用当前值；重新挂载 / 重启回到默认开启。
- **工具栏控件（既有 `code-diff` 行内）**：新增「忽略换行」「忽略编码」两个开关、差异计数读数与字节差信号。开关为原生可聚焦 `button` 且带 `role="switch"` + `aria-checked`，可访问名走词典；点击、Space、Enter 走同一个 toggle（单次操作只翻转一次）。不新增 `TOOLBAR_ROWS` 行、不新增 app 顶栏动作、控件不带 `data-shell-entry`、`SHELL_ENTRY_IDS` 与既有入口集合不变。
- **布局预算**：四个控件按既有 `TOOLBAR_ROWS` 机制（`control()` / `collapsible()`）登记在 `code-diff` 行；compact 档开关与字节信号为 icon-only、计数保留文本；`measureToolbar(tier, 'view-toolbar', 'code-diff').fits` 在 compact / regular / wide 三档均成立，且每个控件三档宽度均可解析且大于 0。
- **即时重算（不重新读盘）**：开关变化只触发一次内存 `useMemo` 重算，不调用 `probeTextFile`、不重建会话、不改 `pair` / `probes`。两侧均有探测事实、工作副本仍逐字等于各自加载源且路径未换时用 `diffLineTextsWithFacts`；否则退回两参 `diffLineTexts`，绝不借用已失效的固化 `sha256`。
- **差异可观测（同源）**：`[data-code-diff-count]` 文本恒等于同一次比较的 `differenceCount`；块导航分母恒为同一次结果的 `blocks.length`，组件内无第二套切行 / 计数表达式。`normalization.encoding.byteDifference === true` 时渲染 `[data-code-diff-bytes]`（危险语义色）：关闭「忽略编码」使其出现且计数由 0 变 1，重新开启后消失、计数归 0；字节信号不新增修改行。
- **状态栏不变**：代码双栏状态栏「左换行 / 左编码 / 右换行 / 右编码」四个读数仍只由会话固化事实产出，切换开关前后逐字不变。
- **文案**：四个键同时写 `i18n/messages/zh/files.ts` 与 `en/files.ts`。

## 验收

- **ac-switch-default-on**：首次渲染即出现两个 `[data-code-switch]`，均 `role="switch"` 且 `aria-checked="true"`，比较结果与显式 `{ ignoreNewline: true, ignoreEncoding: true }` 同构。
- **ac-switch-in-existing-toolbar-row**：两开关位于唯一 `[data-shell-level="view-toolbar"]` 带的代码行内且不带 `data-shell-entry`；`SHELL_ENTRY_IDS.length === 18`、既有 app / view-toolbar 入口集合不变、`viewToolbarRows('code-diff') === 2`。
- **ac-budget-fits**：三档 `fits === true`；`code-diff` 行声明 `code-switch-newline` / `code-switch-encoding` / `code-diff-count` / `code-diff-bytes` 四个控件，`controlPresentation(id, tier)` 三档可解析且宽度 > 0（compact 档开关与字节信号 icon-only）。
- **ac-toggle-newline-recompute**：同一对「仅 CRLF 与 LF 不同」的输入，默认时 `blocks.length === 0`、`differenceCount === 0`、无差异行；关闭「忽略换行」后出现差异块、计数 > 0 且至少一行非 `same`；再开启回到 0。
- **ac-toggle-encoding-signal**：解码文本逐字相同、`sha256` 不同的输入，默认时计数 0 且无字节信号；关闭「忽略编码」后信号出现、计数为 1、不新增修改行；再开启信号消失、计数回 0。
- **ac-diff-count-single-source**：`[data-code-diff-count]` 文本在任何开关组合下恒等于该次比较的 `differenceCount`，块导航分母恒等于同一次结果的 `blocks.length`。
- **ac-real-diff-visible**：字符替换 / 行尾空格 / 大小写 / 行序四类真实差异在四种开关组合下都渲染非 `same` 行且计数 ≥ 1，有对位字符时行内 `changed` 片段保留。
- **ac-no-reprobe-on-toggle**：打开会话后连续切换两开关各两次，`probeTextFile` 调用次数不增加，会话 `probes` 与 `pair.left/right.text` 逐字不变。
- **ac-keyboard-toggle**：两个开关可聚焦；点击、Space、Enter 都走同一 toggle，单次只翻转一次，`aria-checked` 与生效值始终一致。
- **ac-persist-tab-roundtrip**：关闭两开关后切到另一 tab 再切回，仍为关闭且计数与切走前一致；经 New Compare 打开第二个文件对会话显示当前运行期值（不重置为开启）。
- **ac-no-cross-restart-persist**：切换前后 `localStorage` 快照逐键不变，仓库无开关状态持久化代码；重新挂载 `Workbench` 回到默认开启。
- **ac-edit-no-stale-bytes**：任一侧工作副本与加载源不同时不引用固化 `sha256` 报字节差；两侧编辑到逐字相同后计数为 0、无字节信号。
- **ac-no-probes-safe**：无探测事实（独立渲染或某侧缺事实）时关闭「忽略编码」不崩溃、不渲染字节信号，判定只基于文本。
- **ac-status-invariant**：切换两开关前后，状态栏四个换行 / 编码值文本逐字不变。
- **ac-suite-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及既有全部 code-gates 全绿；新增测试行只经 `.munk/baseline/test-debt.json` 的 `growth[]` 声明，不改 floor、不改判定口径。

## 非目标

- 不做跨重启持久化：不写 `localStorage` / 设置项 / IPC 存储，不改 Settings 对话框，不记「上次选择」。
- 不做三向合并的开关与合并判定；`merge.ts` / `splitLines` 与既有断言零回归。
- 不改比较层与探测层口径：不新增阈值，不改 `foldNewlines` / `describeNormalization` / `probe.ts`，不改 `diffLineTexts` / `diffLineTextsWithFacts` 语义。
- 不新增 `TOOLBAR_ROWS` 行、app 顶层入口 / 顶栏动作 / 全局快捷键；不改 `SHELL_ENTRIES`。
- 不改 `probeStatus` 四个原始值、导出 / 报告 / 快照 / 目录四态；不做转码写回。
- 不做真实磁盘端到端与 5 MB 级性能实测（由后续证据子项承担）；本域只用 jsdom + 纯函数断言，不新增 code-gates 条目。
- 不为凑绿放宽 lint / typecheck / 测试，不 bump 版本，不改 README / CHANGELOG / release notes。

## 实现约束

- **单一来源**：开关只在 `Workbench` 存一份；目录下钻会话 id 确定、`upsertSessions` 整体替换该会话对象，逐会话存储会在往返时静默重置。
- **默认值只定义一次**：UI 不写字面量 `ignoreNewline: true` 缺省，一律经 `resolveComparisonSwitches`；展示回读 `diff.normalization.ignoreNewline / ignoreEncoding` 的生效值。
- **事实借用守卫**：只有「工作副本 === 加载源」且探测事实路径与当前侧路径一致时才传事实；否则走文本入口，避免编辑后拿旧 `sha256` 虚构字节差。
- **DOM 契约**：`data-code-switch="ignore-newline" | "ignore-encoding"`、`data-code-diff-count`、`data-code-diff-bytes`；不得复用 `data-shell-entry`（壳层入口集合断言依赖该属性）。
- **同源计数**：`differenceCount`、`blocks.length`、`byteDifference` 均来自同一次 `LineDiffComparison`（`docs/lessons.md` §9）。
- **测试落点**：开关交互与字节信号放 `CodeView.switches.test.tsx`；布局预算追加 `shellLayout.test.ts`；tab / 会话往返与 `localStorage` 不变放 `workbench/` 下 dom 测试并注入 `probeTextFile` 端口；不撑破 `src/test/sharedHarness.tsx` 行预算。
- **测试债**：新增测试行数按 `test-debt.json` 的 `growth[]` 逐级声明（`from` 等于当前已提交 ceiling），只改 `growth`、不动 `floors`。

## 最近交付证明

- WI：`wi_ws_0a02bd23468eb315`（代码双栏两开关默认开启、即时重算、差异读数与运行期保持；`kind: feature`）
- 日期：2026-11-02
- 结果：code_gates passed（23 gates，attempt 001，`.munk/runs/run_ws_d5fcc2762e5d9137/code-gates/attempts/001`；`pnpm test` 122 files / 1913 passed + 1 skipped（1914）；`needSelfTest=false`）。
- 覆盖摘要：`Workbench` 新增单份 `comparisonSwitches` 运行期偏好并同时传给样本 / 文件对两个 `CodeView` 分支；`CodeView` 新增可选 `probes` / `switches` / `onSwitchesChange`，独立渲染以 `resolveComparisonSwitches({})` 状态兜底，比较入口按「事实齐备且工作副本未偏离加载源」选择 `diffLineTextsWithFacts` 或两参 `diffLineTexts`，`useMemo` 依赖开关即时重算；工具栏在既有 `code-diff` 行内新增两个原生 `role="switch"` 控件、`[data-code-diff-count]` 与条件渲染的 `[data-code-diff-bytes]`，全部读同一次 `LineDiffComparison`；`shellLayout` 的 `code-diff` 行登记四个新控件（compact icon-only），三档预算仍 fits；zh/en 词典补齐四键；测试新增 `CodeView.switches.test.tsx`（7 例）、`comparisonSwitches.dom.test.tsx`（2 例）、`shellLayout.test.ts` 2 例与 `CodeView.rulerTrack.test.tsx` 适配，`test-debt` 声明 `repoTestLines 43599 → 43999`、`addedCases 11`。
- 后续注意：① 字节差是**信号**不是第二个差异块，`differenceCount = blocks.length + 1`，不要把它渲染成额外修改行（与行对齐冲突）；② 事实借用依赖「工作副本逐字等于加载源 + 路径一致」双重守卫，后续若把工作副本改成非字符串形态或做增量编辑，必须同步更新该守卫，否则会重新引入陈旧 `sha256` 假信号；③ compact 档 `code-diff` 行余量已被四个控件吃掉约 138px，后续再加控件须先重算预算，不要删既有控件或缩 `extra` 腾位；④ 运行期偏好刻意不落会话 / `localStorage`，后续任何「记住上次选择」需求都属新域，不应回写到本域既有入口。
