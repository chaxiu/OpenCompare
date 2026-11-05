# Domain: code-pair-actions

文本双栏 Diff 的**文件对级显式动作**：「重新加载当前文件对」与「交换左右面板」。动作只重读已记录的两侧路径并原子提交一对新结果，或仅对调左右视图与派生值；不新建会话 / tab、不重算目录、不写盘。比较语义归 `diff-normalize`，开关与工具栏运行期偏好归 `code-diff-switches`，会话生命周期与壳层编排归 `workbench`。

## 范围

- **重新加载（显式动作）**：只重读会话已记录的两侧路径——真实路径走 `PlatformPort.probeTextFile`，目录下钻 / 快照挂载侧由 shell 的 `readSide` 经 `readSideFileProbe(parent.sides, path)` 取同一份内联内容；两侧 `Promise.all` 读齐后才一次提交（正文、行统计、探测事实同一次更新），任一侧失败即保留旧结果。
- **重载保持**：会话 id、tab 数量与激活 tab 不变；两侧 `scrollTop` 不变（提交后跳过一次性块滚动副作用）、父目录过滤 / 折叠状态不变、三个比较开关值不变。
- **交换左右（显式动作）**：一次提交内对调左 / 右路径、两侧正文、探测事实与行统计，派生差异（`added` ↔ `removed` 镜像、行内左右文本、差异计数、指示条 marker）随同一次比较结果自然对调；连按两次回到原状。
- **只换视图不碰数据**：交换不复制 / 改写 / 写回任何文件，不触碰父目录会话的 `DirectoryComparison`、目录统计与快照内容；下钻视图内同样可用，返回目录视图结果不变。
- **工具栏与文案**：`code-diff` 行新增 `[data-code-pair-actions]` 组内的 `[data-code-action="reload"]` / `[data-code-action="swap"]`（后者仅在 shell 传入 `onPairChange` 时渲染）；四个文案键 `files.code.reload` / `files.code.swap` / `files.code.reloadFailed` / `files.notice.reloaded` 在 zh / en 成套存在。
- **交换入口直达**：交换不再藏在「更多」菜单里——`[data-shell-level="view-toolbar"]` 内直接存在 `[data-code-action="swap"]` 按钮（复用 `ToolbarButton size="sm"` + `UI_ICON_ACTIONS.swap`），菜单项保留；按钮 `aria-label` 取 `files.code.swap`，`title` 与菜单文案共用同一个绑定串，不新增 `data-shell-entry`。
- **交换快捷键**：`Cmd/Ctrl+Shift+S` 在 `CodeDiffView` 挂载且 shell 传入 `onPairChange` 时监听 `document.keydown`；缺修饰键、带 Alt、`repeat`、焦点在 input / textarea / select / contenteditable 时不触发也不 `preventDefault`；绑定串与匹配判定各只有一处来源（`codeViewShortcut.ts`）。

## 验收

- **ac-reload-same-session**：触发重载后会话 id、tab 数量与激活 tab 不变；两侧显示磁盘最新内容，两侧 `scrollTop`、父目录过滤 / 折叠状态（若有）与三个开关值保持操作前的值。
- **ac-reload-no-directory-rescan**：重载不触发目录重扫：独立文件对会话不产生目录扫描 / 哈希调用；下钻文件会话的父目录 `DirectoryComparison`、目录统计与快照数据保持同一引用与同一数值。
- **ac-reload-failure-keeps-result**：任一侧文件被删除或不可读时就地渲染 `files.code.reloadFailed` 提示（zh / en 均存在且非空），并保留重载前的两侧文本、行状态、差异计数与指示条 marker；界面不空白、不抛未捕获异常、不出现一侧新内容与一侧旧内容混排。
- **ac-reload-readonly**：重载全程只调用既有读取 / 探针接口，不调用任何写文件接口，两侧磁盘文件字节不变。
- **ac-swap-swaps-derived**：交换一次后左右面板文本与路径标题、状态栏左右行数与换行 / 编码探针、差异行（`added` ↔ `removed` 镜像、左右文本对调）、差异计数与指示条 marker 区间同步对调。
- **ac-swap-twice-restores**：连续交换两次后左右路径、两侧原始文本、探针值、`rows` / `blocks`、差异计数与指示条 marker 序列与交换前逐项一致。
- **ac-swap-four-state-counts**：同时含 `same` / `removed`（仅左）/ `added`（仅右）/ `modified` 四种行的真实夹具（六行对齐）上，按状态名归一的四态计数向量交换前显式为 `{ same: 3, removed: 1, added: 1, modified: 1 }` 且合计等于渲染行数 6；经真实工具栏交换按钮交换一次与两次后，同一读取函数给出的向量与交换前逐位相等（深比较），不得退化为元素存在性或空读数。
- **ac-swap-rows-and-gutter-restored**：第一次交换后左 pane 呈现原右内容（含 `modified-new` / `right-only`）、右 pane 呈现原左内容（含 `left-only` / `modified-old`），面板标题路径顺序对调；第二次交换后左右 pane 的逐行内容与 gutter 行号快照与交换前完全一致（深比较）。
- **ac-swap-entry-always-visible**：交换前、第一次交换后、第二次交换后三个时点，交换按钮均存在、`hidden === false`、计算样式 `display !== 'none'`，且 `aria-label` 恒为「交换左右」。
- **ac-swap-drilldown-scoped**：目录下钻文件视图交换后，父目录会话 id、目录统计、过滤 / 折叠状态、快照内容与格式均不变；返回目录视图得到与下钻前一致的目录结果，再次进入该文件对后可继续交换。
- **ac-swap-no-write**：交换不调用写文件接口、不写回磁盘、不复制或改写文件内容，两侧磁盘文件字节保持不变。
- **ac-swap-toolbar-visible**：shell 传入 `onPairChange` 时，`[data-shell-level="view-toolbar"]` 内直接存在 `[data-code-action="swap"]` 按钮，无需打开「更多」菜单；未传 `onPairChange` 时不渲染该按钮（与菜单项同条件），且该按钮不带 `data-shell-entry`。
- **ac-swap-single-action**：工具栏按钮、「更多」菜单中的交换项、`Cmd/Ctrl+Shift+S` 三者都走同一个 `swapSides()`；连交换两次后路径、正文、探针、差异计数与指示条逐项复原；全程 `writeTextFile` 调用 0 次，每次 `onPairChange` 参数与当次左右一致。
- **ac-swap-copy-single-source**：工具栏 `aria-label` 为 `files.code.swap`、`title` 与菜单项文案含同一 `Cmd/Ctrl+Shift+S` 绑定串；zh 显示「交换左右」、en 为 "Swap sides"；绑定串只从一处常量导出，JSX / i18n 文案 / 处理器里不留第二份硬编码。
- **ac-shortcut-guard**：`Cmd/Ctrl+Shift+S` 触发交换且仅此时 `preventDefault`；`Cmd/Ctrl+N` 仍只打开新建对比；缺 mod、缺 shift、带 Alt、`repeat=true`，或焦点在 input / textarea / select / contenteditable 时既不触发交换也不拦截事件。
- **ac-pair-replace-atomic**：`replaceFilePair` 一次更新 `adhoc.pair` / `stats` / `probes`，会话 id、父目录 id 与其它字段不变；无 `adhoc` 的会话原样返回（不抛错）。
- **ac-i18n-parity**：新增用户可见文案在 `zh/files.ts` 与 `en/files.ts` 成套存在且非空（`Record<keyof typeof zhFiles, string>` 编译期约束保持），切语言后开关标签、重载 / 交换按钮与两条通知随之切换。
- **ac-gate-registration**：断言写进既有文件（`CodeView.switches.test.tsx`、`comparisonSwitches.dom.test.tsx`、`directoryCompare.test.ts`、`shellLayout.test.ts`）与两个纯函数测试 `codeViewScroll.test.ts` / `codeViewShortcut.test.ts`；`.munk/code-gates.json` 的单条 gate `code-pair-actions` 命令实际收集这些文件（含 `CodeView.ruler.test.tsx`、`CodeView.rulerTrack.test.tsx`）；不按验收点逐条新建测试文件，不放宽既有断言。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及全部 code-gates 自绿；`test-debt` 的 growth / floors 只收紧或登记增长，不降低门禁。

## 非目标

- 不新建会话、tab 或行模型，不重算目录、不做目录扫描 / 哈希，不新增窗口化分支。
- 不改换行 / 编码归一、`describeNormalization`、快照（`.ocsnap.json`）格式与导出格式；不新增 npm 依赖。
- 不改 CSV / 结构化视图与三向合并视图的交互（本域只覆盖文本双栏 diff 与目录下钻文件视图）。
- 不做跨重启的「最近文件对」记忆，不写 `localStorage` / 设置项 / IPC 存储。
- 不为凑绿降低断言、跳过用例或放宽既有 gate 阈值；不动已公开 tag / Release / 资产。

## 实现约束

- **读取口径单一**：重载只复用既有读取 / 探针路径（`platform.probeTextFile`、`readSideFileProbe`），不开新 IPC channel、不加 `PlatformPort` 方法；交换后重载必须按交换后的路径读取。
- **原子提交**：先两侧都读成功再提交；失败只出通知并保留旧正文、旧事实与旧滚动位置，禁止半侧更新。
- **事实随正文迁移**：视图内 `leftFacts` / `rightFacts` state 与正文同批更新，比较入口继续用「工作副本 === 加载源 + 路径一致」守卫；交换即整体互换两对 state。
- **会话提交边界**：`replaceFilePair` 只改 `adhoc.pair` / `stats` / `probes`，不动会话 id、`parentDirectoryId` 与父目录比较树；`Workbench` 以 `setSessions` 映射单条会话完成提交。
- **滚动保持**：重载 / 交换后由 `skipBlockScroll` 一次性跳过块滚动副作用，两侧 `scrollTop` 不被重算覆盖。
- **DOM 契约**：`data-code-pair-actions`、`data-code-action="reload" | "swap"`；交换按钮在 `[data-shell-level="view-toolbar"]` 内直接可见，不占用 `data-shell-entry`，`SHELL_ENTRY_IDS` 仍为 18 项。
- **快捷键单一来源**：`codeViewShortcut.ts` 导出 `CODE_SWAP_SHORTCUT` 与 `isCodeSwapShortcut`；`CodeView` 只拼标签并挂一个 `document.keydown` 监听（闭包经 ref 刷新以免重绑），不在 JSX / i18n 文案 / 处理器里复制键位串，不新增主进程 accelerator。
- **测试落点**：交互与双语放 `CodeView.switches.test.tsx`，状态栏 / 开关不变放 `comparisonSwitches.dom.test.tsx`，`replaceFilePair` 放 `directoryCompare.test.ts`，预算放 `shellLayout.test.ts`，两个纯函数各放同目录 `*.test.ts`；测试债按 `test-debt.json` 的 `growth[]` 与收紧后的 `floors` 声明，只登记真实增长。

## 最近交付证明

- WI：`wi_intake_b263d67b0d4ef595`（钉住交换左右四态计数与差异块导航循环；`kind: test`），日期 2026-11-05。
- 结果：code_gates passed（32 gates，attempt 001，`.munk/runs/run_intake_b263d67b0d4ef595/code-gates/attempts/001`；`pnpm test` 159 files / 2453 passed + 1 skipped（2454）；`code-pair-actions` gate 8 files / 109 passed）。
- 覆盖摘要：test-only。`CodeView.switches.test.tsx` 新增一例：六行四态夹具按状态名归一计数（`3/1/1/1`，合计 6），经真实工具栏按钮两次交换断言计数向量逐位不变、第一次交换后内容与面板标题对调、第二次交换后逐行内容 + gutter 快照与交换前深相等，三个时点断言按钮可见性与 `aria-label`；三入口同一 handler 复用既有 `runs toolbar, menu and shortcut through the same swap action without writing`，不重复实现。`git diff --stat` 仅 `CodeView.switches.test.tsx` / `CodeView.ruler.test.tsx` / `test-debt.json`（growth 登记），产品源码零改动。
- 后续注意：四态夹具的 `removed` / `added` 各 1 行、`same` 3 行、`modified` 1 行是当前交换只做左右镜像的口径；若将来交换改为非镜像语义（如按侧重排），该向量断言必须同步重钉。
