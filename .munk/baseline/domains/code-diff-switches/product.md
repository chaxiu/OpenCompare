# Domain: code-diff-switches

代码双栏 Diff 的「忽略换行 / 忽略编码 / 忽略空白」三个开关的**视图接线与运行期保持**：工具栏控件、切换后的即时内存重算、单一来源的差异读数与字节差信号，以及跨 tab / 会话 / 下钻往返 / 重载 / 交换的运行期偏好。判定语义与结果契约归 `diff-normalize`，探测事实归 `text-probe`，重载与交换动作归 `code-pair-actions`，壳层层级与预算表机制归 `workbench`；本域只把既有判定接到界面，不重做任何判定。

## 范围

- **运行期偏好（单一来源）**：`Workbench` 持有一份 `ComparisonSwitches`（初值只经 `resolveComparisonSwitches({})`，换行 / 编码默认开启、空白默认关闭），不在 `WorkbenchSession` 上逐会话存储、不写 `localStorage` / 设置项 / IPC。`CodeView` 以受控 `switches` + `onSwitchesChange` 接收；独立渲染（无 shell）时以同默认值的内部 state 兜底，默认规则仍只来自 `resolveComparisonSwitches`，UI 内不出现第二份 `true` / `false` 缺省。切 tab、切会话、同会话内换开左右文件、目录下钻返回（含同相对路径重新下钻、会话对象被整体替换）、显式重载与交换左右后保持当前值；新开会话沿用当前值；重新挂载 / 重启回到默认（换行 / 编码开、空白关）。
- **工具栏控件（既有 `code-diff` 行内）**：新增「忽略换行」「忽略编码」「忽略空白」三个开关、差异计数读数与字节差信号。开关为原生可聚焦 `button` 且带 `role="switch"` + `aria-checked`，可访问名走词典；点击、Space、Enter 走同一个 toggle（单次操作只翻转一次）。不新增 `TOOLBAR_ROWS` 行、不新增 app 顶栏动作、控件不带 `data-shell-entry`、`SHELL_ENTRY_IDS` 与既有入口集合不变。
- **布局预算**：开关与计数 / 字节信号控件按既有 `TOOLBAR_ROWS` 机制（`control()` / `collapsible()` / `collapsibleWide()`）登记在 `code-diff` 行；compact 档开关、字节信号、开左右与重载 / 交换为 icon-only（重载 / 交换仅 wide 档出文案），计数保留文本；`measureToolbar(tier, 'view-toolbar', 'code-diff').fits` 在 compact / regular / wide 三档均成立，且每个控件三档宽度均可解析且大于 0。
- **即时重算（不重新读盘）**：开关变化只触发一次内存 `useMemo` 重算，不调用 `probeTextFile`、不重建会话、不改 `pair` / `probes`。两侧均有探测事实、工作副本仍逐字等于各自加载源且路径未换时用 `diffLineTextsWithFacts`；否则退回两参 `diffLineTexts`，绝不借用已失效的固化 `sha256`。
- **差异可观测（同源）**：`[data-code-diff-count]` 文本恒等于同一次比较的 `differenceCount`；块导航分母恒为同一次结果的 `blocks.length`，组件内无第二套切行 / 计数表达式。`normalization.encoding.byteDifference === true` 时渲染 `[data-code-diff-bytes]`（危险语义色）：关闭「忽略编码」使其出现且计数由 0 变 1，重新开启后消失、计数归 0；字节信号不新增修改行。
- **状态栏不变**：代码双栏状态栏「左换行 / 左编码 / 右换行 / 右编码」四个读数仍只由会话固化事实产出，切换开关前后逐字不变。
- **文案**：四个键同时写 `i18n/messages/zh/files.ts` 与 `en/files.ts`。

## 验收

- **ac-switch-default-on**：首次渲染即出现三个 `[data-code-switch]`，均 `role="switch"`；`ignore-newline` / `ignore-encoding` 为 `aria-checked="true"`，`ignore-whitespace` 为 `aria-checked="false"`；比较结果与显式 `{ ignoreNewline: true, ignoreEncoding: true, ignoreWhitespace: false }` 同构。
- **ac-whitespace-default-strict**：新挂载文本对比在空白开关关闭时，同一对输入的 `rows`（含 `leftSegments` / `rightSegments`）、`blocks`、`differenceCount` 与严格逐字符结果逐项相同。
- **ac-whitespace-on-equal**：仅含行尾空格、制表符与空格互换、行内连续多余空白的文件对开启开关后 `differenceCount === 0`、无非 `same` 行、无行内 changed 段、指示条无 marker；两侧面板文本仍逐字符保留原始空白（不 trim、不折叠显示）。
- **ac-whitespace-on-real-diff**：开启后去除空格 / 制表符仍有非空白字符差异的行保持非 `same` 并参与计数，计数与关闭时对这些真实差异行的判定一致（空白差异不额外增加计数）。
- **ac-whitespace-inline-only-real**：开启后去除空格 / 制表符相等的行状态为 `same` 且无 changed 段；不相等的行其 changed 段至少含一个非空白字符差异（段文本去空白后两侧不相等），纯空白差异不构成高亮依据。
- **ac-whitespace-single-source**：开关切换后计数、行状态 / 行内高亮与指示条来自同一次比较：计数为 0 时无 marker 且无非 `same` 行，计数 > 0 时既有 marker 又有非 `same` 行，不出现一处已更新另一处滞留旧值的状态。
- **ac-whitespace-status-raw**：切换空白开关前后，状态栏左右行数与左右换行 / 编码探针值不变且等于磁盘读取时的原始值，归一结果不回写展示值。
- **ac-switch-in-existing-toolbar-row**：三开关位于唯一 `[data-shell-level="view-toolbar"]` 带的代码行内且不带 `data-shell-entry`；`SHELL_ENTRY_IDS.length === 18`、既有 app / view-toolbar 入口集合不变、`viewToolbarRows('code-diff') === 2`。
- **ac-budget-fits**：三档 `fits === true`；`code-diff` 行声明 `code-switch-newline` / `code-switch-encoding` / `code-switch-whitespace` / `code-diff-count` / `code-diff-bytes` / `code-reload` / `code-swap` / `open-left` / `open-right` 九个控件，`controlPresentation(id, tier)` 三档可解析且宽度 > 0（compact 档开关、字节信号与重载 / 交换 icon-only；重载 / 交换仅 wide 档出文案）。
- **ac-toggle-newline-recompute**：同一对「仅 CRLF 与 LF 不同」的输入，默认时 `blocks.length === 0`、`differenceCount === 0`、无差异行；关闭「忽略换行」后出现差异块、计数 > 0 且至少一行非 `same`；再开启回到 0。
- **ac-toggle-encoding-signal**：解码文本逐字相同、`sha256` 不同的输入，默认时计数 0 且无字节信号；关闭「忽略编码」后信号出现、计数为 1、不新增修改行；再开启信号消失、计数回 0。
- **ac-diff-count-single-source**：`[data-code-diff-count]` 文本在任何开关组合下恒等于该次比较的 `differenceCount`，块导航分母恒等于同一次结果的 `blocks.length`。
- **ac-real-diff-visible**：字符替换 / 行尾空格 / 大小写 / 行序四类真实差异在四种开关组合下都渲染非 `same` 行且计数 ≥ 1，有对位字符时行内 `changed` 片段保留。
- **ac-no-reprobe-on-toggle**：打开会话后连续切换两开关各两次，`probeTextFile` 调用次数不增加，会话 `probes` 与 `pair.left/right.text` 逐字不变。
- **ac-keyboard-toggle**：两个开关可聚焦；点击、Space、Enter 都走同一 toggle，单次只翻转一次，`aria-checked` 与生效值始终一致。
- **ac-persist-tab-roundtrip**：关闭换行 / 编码并开启空白后切到另一 tab 再切回，三个 `aria-checked` 与计数同切走前一致；经 New Compare 打开第二个文件对会话显示当前运行期值（不重置为默认）。
- **ac-persist-across-actions**：显式重载、交换左右、下钻往返后三个开关值与操作前一致，不被重置为默认值。
- **ac-no-cross-restart-persist**：切换前后 `localStorage` 快照逐键不变，仓库无开关状态持久化代码；重新挂载 `Workbench` 回到默认开启。
- **ac-edit-no-stale-bytes**：任一侧工作副本与加载源不同时不引用固化 `sha256` 报字节差；两侧编辑到逐字相同后计数为 0、无字节信号。
- **ac-no-probes-safe**：无探测事实（独立渲染或某侧缺事实）时关闭「忽略编码」不崩溃、不渲染字节信号，判定只基于文本。
- **ac-status-invariant**：切换两开关前后，状态栏四个换行 / 编码值文本逐字不变。
- **ac-suite-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及既有全部 code-gates 全绿；新增测试行只经 `.munk/baseline/test-debt.json` 的 `growth[]` 声明，不改 floor、不改判定口径。

## 非目标

- 不做跨重启持久化：不写 `localStorage` / 设置项 / IPC 存储，不改 Settings 对话框，不记「上次选择」。
- 不做三向合并的开关与合并判定；`merge.ts` / `splitLines` 与既有断言零回归。
- 不改换行 / 编码判定与探测口径：不改 `foldNewlines` / `describeNormalization` / `probe.ts`，不改「换行 / 编码」两项既有语义；空白判定语义归 `diff-normalize`。重载 / 交换的读写与提交归 `code-pair-actions`。
- 不新增 `TOOLBAR_ROWS` 行、app 顶层入口 / 顶栏动作 / 全局快捷键；不改 `SHELL_ENTRIES`。
- 不改 `probeStatus` 四个原始值、导出 / 报告 / 快照 / 目录四态；不做转码写回。
- 不做真实磁盘端到端与 5 MB 级性能实测（由后续证据子项承担）；本域只用 jsdom + 纯函数断言，不另开本域专属 gate。
- 不为凑绿放宽 lint / typecheck / 测试，不 bump 版本，不改 README / CHANGELOG / release notes。

## 实现约束

- **单一来源**：开关只在 `Workbench` 存一份；目录下钻会话 id 确定、`upsertSessions` 整体替换该会话对象，逐会话存储会在往返时静默重置。
- **默认值只定义一次**：UI 不写字面量 `ignoreNewline: true` / `ignoreWhitespace: false` 缺省，一律经 `resolveComparisonSwitches`；展示回读 `diff.normalization.ignoreNewline / ignoreEncoding / ignoreWhitespace` 的生效值。
- **事实借用守卫**：只有「工作副本 === 加载源」且探测事实路径与当前侧路径一致时才传事实；否则走文本入口，避免编辑后拿旧 `sha256` 虚构字节差。事实存于视图 state（重载 / 交换随之迁移），不只读会话 `probes`。
- **DOM 契约**：`data-code-switch="ignore-newline" | "ignore-encoding" | "ignore-whitespace"`、`data-code-diff-count`、`data-code-diff-bytes`、`data-code-action="reload" | "swap"`；不得复用 `data-shell-entry`（壳层入口集合断言依赖该属性）。
- **同源计数**：`differenceCount`、`blocks.length`、`byteDifference` 均来自同一次 `LineDiffComparison`（`docs/lessons.md` §9）。
- **测试落点**：开关交互与字节信号放 `CodeView.switches.test.tsx`；布局预算追加 `shellLayout.test.ts`；tab / 会话往返与 `localStorage` 不变放 `workbench/` 下 dom 测试并注入 `probeTextFile` 端口；不撑破 `src/test/sharedHarness.tsx` 行预算。
- **测试债**：新增测试行数按 `test-debt.json` 的 `growth[]` 逐级声明（`from` 等于当前已提交 ceiling），只改 `growth` 与收紧 `floors`，不放宽门禁。

## 最近交付证明

- WI：`wi_intake_fdbf73a8407f5c10`（文本双栏对比：忽略空白开关 + 显式重载 + 交换左右；`kind: feature`）
- 日期：2026-11-03
- 结果：code_gates passed（27 gates，attempt 001，`.munk/runs/run_intake_fdbf73a8407f5c10/code-gates/attempts/001`；`pnpm test` 125 files / 2009 passed + 1 skipped（2010）；新增 gate `code-pair-actions`）。
- 覆盖摘要：第三个开关按同一 `CodeSwitch` 契约接入 `code-diff` 行（`data-code-switch="ignore-whitespace"`，默认关，标志位与首两个开关同源于 `Workbench` 单份 `comparisonSwitches`）；`CodeView.switches.test.tsx` 补 6 例（默认关、仅空白相等、真实差异与同源计数 / 指示条、行内只高亮非空白、重载 / 交换保持会话与开关、双语词典），`comparisonSwitches.dom.test.tsx` 补 1 例覆盖重载 / 交换后状态栏原始值与三开关不变；`shellLayout` 的 `code-diff` 行登记 `code-switch-whitespace` 及重载 / 交换控件（`open-left` / `open-right` 改为可折叠），三档预算仍 fits。
- 后续注意：① 三开关默认值不同源（换行 / 编码 true、空白 false），任何新增调用点都不得自行写缺省；② 空白模式下 `same` 行两侧显示文本可不同（比较用去空白文本、展示用原文），任何「same 行左右文本必然相等」的假设都不成立；③ compact 档该行控件已排满，再加控件须重算预算。
