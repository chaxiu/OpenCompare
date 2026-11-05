# 代码视图显式左右交换与居中差异跳转

## 范围

- 在代码 diff 视图（`CodeDiffView`）工具栏新增直接可见的「交换左右」入口，复用现有 `swapSides()` / `code-swap` 动作；「更多」菜单保留同一项。
- 为交换动作增加 `Cmd/Ctrl+Shift+S` 快捷键，按钮 tooltip、菜单文案与键盘处理共用同一份绑定描述。
- 把「上一个 / 下一个差异块」、指示条点击与 Enter 重定位的滚动目标改为纯函数计算：当前差异块垂直居中并保留上下文，所有边界确定性夹取。
- 纯函数单测 + jsdom 断言；扩展既有 code-diff gate 收集新测试。
- 仅改代码视图与其测试及必要的交付证据，不动 `src/core/**`、对比语义与四态口径。

## 验收

- ac-swap-toolbar-visible: shell 传入 `onPairChange` 时，代码 diff 视图 `[data-shell-level="view-toolbar"]` 内直接存在 `[data-code-action="swap"]` 按钮，无需打开「更多」菜单；未传 `onPairChange` 时不渲染（与现有菜单项一致）。
- ac-swap-single-action: 点击工具栏按钮、选择「更多」菜单中的交换项、按下快捷键，三者都调用同一 `swapSides`；交换一次后左右路径 / 正文 / 探针 / 差异计数 / 指示条对调，第二次交换后逐项复原；过程中 `writeTextFile` 调用 0 次，`onPairChange` 各次参数与当前左右一致。
- ac-swap-copy-single-source: 工具栏 `aria-label` 为 `files.code.swap` 文案、`title` 与菜单项文案包含同一 `Cmd/Ctrl+Shift+S` 绑定串；zh 显示「交换左右」、en 显示 "Swap sides"；该绑定串只从一处常量 / 格式化函数导出，不在 JSX、i18n 文案或处理器里硬编码第二份。
- ac-shortcut-guard: `Cmd/Ctrl+Shift+S` 触发交换；`Cmd/Ctrl+N` 仍只打开新建对比；缺 mod、缺 shift、带 Alt、`repeat=true`，或焦点在 input / textarea / select / contenteditable 时不触发交换且不 `preventDefault`。
- ac-jump-centered: 视口高度为正且块高小于视口时，跳转后两个 pane 的 `scrollTop` 相等，且等于 `round(blockTop + blockHeight / 2 - viewportHeight / 2)`（`blockTop = startRow * 22`，`blockHeight = (endRow - startRow + 1) * 22`），块上下两侧均可见上下文行。
- ac-jump-clamped-first-last: 首块目标夹到 0；末块目标夹到 `max(0, rows * 22 - viewportHeight)`；跳转后 `scrollTop` 为有限数且落在 `[0, maxScroll]`。
- ac-jump-clamped-short-doc: 文档总高 ≤ 视口高时目标固定为 0；文档高 > 视口但块位于中段时目标严格落在 `(0, maxScroll)` 内。
- ac-jump-clamped-degenerate: 视口高度为 0 / 未知（`clientHeight` 非有限或 ≤ 0）或块高 ≥ 视口高时，目标等于夹取后的块顶；结果始终为有限数且在 `[0, maxScroll]`。
- ac-jump-stable: 同一块重复触发跳转后 `scrollTop` 不变；跳转后触发一次 pane `scroll` 事件，两侧 `scrollTop` 仍相等且不回弹；`skipBlockScroll` 仍使重载 / 交换后不重算滚动。
- ac-tests-in-gate: 新增滚动纯函数与快捷键匹配纯函数的单测，以及上述 jsdom 断言；`pnpm test` 与扩展后的 `code-pair-actions` gate 都实际收集并通过这些用例。
- ac-zero-core-and-semantics: `src/core/**` 非测试文件零 diff；四态计数、忽略开关、复制 / 导出、快照、对比 / 合并语义零变更；`SHELL_ENTRY_IDS` 仍为 18 项，交换按钮不占用 `data-shell-entry`。

## 非目标

- 不改合并视图 / CSV / 结构化 / 目录视图的导航或快捷键。
- 不做快捷键自定义、设置页、菜单栏 accelerator 或全局键盘映射。
- 不重构 `DiffPane` 虚拟列表、不改同步滚动算法、不改 `DIFF_ROW_HEIGHT`。
- 不新增 `src/core/**` 模块，不修改 core 算法。
- 不改四态计数、忽略开关、复制 / 导出、快照、对比 / 合并语义、发布通道与版本号。
- 不做整体工具栏重排或视觉重设计。

## 实现约束

- 文件锚点：`src/renderer/src/views/CodeView.tsx`；纯函数放 renderer 视图层（建议 `codeViewScroll.ts` / `codeViewShortcut.ts` 或同目录等价命名），测试放同目录；扩展 `CodeView.switches.test.tsx` 与 `CodeView.ruler.test.tsx`。
- 按钮：复用 `ToolbarButton size="sm"` + `UI_ICON_ACTIONS.swap` + `files.code.swap`；标记 `data-code-action="swap"`；不新增 `data-shell-entry`，不改 `shellLayout.ts` 的 18 项清单。
- 滚动：以 `DiffPane` 滚动元素自身 `scrollTop` 为唯一权威目标；继续先同步写两个 pane 再渲染，再由同一 effect 重算同一目标（幂等）。可视高度取 pane `clientHeight`，内容高度取 `diff.rows.length * DIFF_ROW_HEIGHT`；左右行数一致，两个 pane 写同一目标值。
- 既有 ruler / 步骤 / 重定位用例里 `startRow * DIFF_ROW_HEIGHT` 的期望改为调用同一纯函数计算，不另留一份内联公式。
- 快捷键：`Cmd/Ctrl+Shift+S`（避开既有 `Cmd/Ctrl+N`）；只在 `CodeDiffView` 挂载期间监听 `document.keydown`，仅在实际触发时 `preventDefault`；不新增主进程菜单 accelerator。
- i18n：复用 `files.code.swap`；若新增 tooltip 模板键，zh / en 同批成对并保持 `messages.test.ts` 全绿。
- 保留 `skipBlockScroll` 语义：重载 / 交换后不因新 diff 重置视口。
- gate 与证据：把新纯函数测试与 `CodeView.ruler.test.tsx` 追加进 `.munk/code-gates.json` 的 `code-pair-actions` 命令；任何 `src/renderer` 变更后按既有门禁运行 `pnpm screenshots` 并重钉 `docs/screenshots.md` 的 captured commit；`test-debt-gate` 的 `repoTestLines` 按真实测量值补 growth 声明，不放宽其它阈值。
