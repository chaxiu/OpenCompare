# Domain: code-pair-actions

文本双栏 Diff 的**文件对级显式动作**：「重新加载当前文件对」与「交换左右面板」。动作只重读已记录的两侧路径并原子提交一对新结果，或仅对调左右视图与派生值；不新建会话 / tab、不重算目录、不写盘。比较语义归 `diff-normalize`，开关与工具栏运行期偏好归 `code-diff-switches`，会话生命周期与壳层编排归 `workbench`。

## 范围

- **重新加载（显式动作）**：只重读会话已记录的两侧路径——真实路径走 `PlatformPort.probeTextFile`，目录下钻 / 快照挂载侧由 shell 的 `readSide` 经 `readSideFileProbe(parent.sides, path)` 取同一份内联内容；两侧 `Promise.all` 读齐后才一次提交（正文、行统计、探测事实同一次更新），任一侧失败即保留旧结果。
- **重载保持**：会话 id、tab 数量与激活 tab 不变；两侧 `scrollTop` 不变（提交后跳过一次性块滚动副作用）、父目录过滤 / 折叠状态不变、三个比较开关值不变。
- **交换左右（显式动作）**：一次提交内对调左 / 右路径、两侧正文、探测事实与行统计，派生差异（`added` ↔ `removed` 镜像、行内左右文本、差异计数、指示条 marker）随同一次比较结果自然对调；连按两次回到原状。
- **只换视图不碰数据**：交换不复制 / 改写 / 写回任何文件，不触碰父目录会话的 `DirectoryComparison`、目录统计与快照内容；下钻视图内同样可用，返回目录视图结果不变。
- **工具栏与文案**：`code-diff` 行新增 `[data-code-pair-actions]` 组内的 `[data-code-action="reload"]` / `[data-code-action="swap"]`（后者仅在 shell 传入 `onPairChange` 时渲染）；四个文案键 `files.code.reload` / `files.code.swap` / `files.code.reloadFailed` / `files.notice.reloaded` 在 zh / en 成套存在。

## 验收

- **ac-reload-same-session**：触发重载后会话 id、tab 数量与激活 tab 不变；两侧显示磁盘最新内容，两侧 `scrollTop`、父目录过滤 / 折叠状态（若有）与三个开关值保持操作前的值。
- **ac-reload-no-directory-rescan**：重载不触发目录重扫：独立文件对会话不产生目录扫描 / 哈希调用；下钻文件会话的父目录 `DirectoryComparison`、目录统计与快照数据保持同一引用与同一数值。
- **ac-reload-failure-keeps-result**：任一侧文件被删除或不可读时就地渲染 `files.code.reloadFailed` 提示（zh / en 均存在且非空），并保留重载前的两侧文本、行状态、差异计数与指示条 marker；界面不空白、不抛未捕获异常、不出现一侧新内容与一侧旧内容混排。
- **ac-reload-readonly**：重载全程只调用既有读取 / 探针接口，不调用任何写文件接口，两侧磁盘文件字节不变。
- **ac-swap-swaps-derived**：交换一次后左右面板文本与路径标题、状态栏左右行数与换行 / 编码探针、差异行（`added` ↔ `removed` 镜像、左右文本对调）、差异计数与指示条 marker 区间同步对调。
- **ac-swap-twice-restores**：连续交换两次后左右路径、两侧原始文本、探针值、`rows` / `blocks`、差异计数与指示条 marker 序列与交换前逐项一致。
- **ac-swap-drilldown-scoped**：目录下钻文件视图交换后，父目录会话 id、目录统计、过滤 / 折叠状态、快照内容与格式均不变；返回目录视图得到与下钻前一致的目录结果，再次进入该文件对后可继续交换。
- **ac-swap-no-write**：交换不调用写文件接口、不写回磁盘、不复制或改写文件内容，两侧磁盘文件字节保持不变。
- **ac-pair-replace-atomic**：`replaceFilePair` 一次更新 `adhoc.pair` / `stats` / `probes`，会话 id、父目录 id 与其它字段不变；无 `adhoc` 的会话原样返回（不抛错）。
- **ac-i18n-parity**：新增用户可见文案在 `zh/files.ts` 与 `en/files.ts` 成套存在且非空（`Record<keyof typeof zhFiles, string>` 编译期约束保持），切语言后开关标签、重载 / 交换按钮与两条通知随之切换。
- **ac-gate-registration**：断言写进既有文件（`CodeView.switches.test.tsx`、`comparisonSwitches.dom.test.tsx`、`directoryCompare.test.ts`、`shellLayout.test.ts`），并在 `.munk/code-gates.json` 以单条数据驱动 gate `code-pair-actions` 注册；不按验收点逐条新建测试文件，不放宽既有断言。
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
- **DOM 契约**：`data-code-pair-actions`、`data-code-action="reload" | "swap"`；不占用 `data-shell-entry`。
- **测试落点**：交互与双语放 `CodeView.switches.test.tsx`，状态栏 / 开关不变放 `comparisonSwitches.dom.test.tsx`，`replaceFilePair` 放 `directoryCompare.test.ts`，预算放 `shellLayout.test.ts`；测试债按 `test-debt.json` 的 `growth[]` 与收紧后的 `floors` 声明。

## 最近交付证明

- WI：`wi_intake_fdbf73a8407f5c10`（文本双栏对比：忽略空白开关 + 显式重载 + 交换左右；`kind: feature`）
- 日期：2026-11-03
- 结果：code_gates passed（27 gates，attempt 001，`.munk/runs/run_intake_fdbf73a8407f5c10/code-gates/attempts/001`；`pnpm test` 125 files / 2009 passed + 1 skipped（2010）；新增 gate `code-pair-actions` 覆盖 4 个测试文件）。
- 覆盖摘要：`CodeDiffView` 新增可选 `readSide` / `onPairChange`；`reload()` 两侧并行读取、任一失败即 `files.code.reloadFailed` 并保留旧结果，成功则一批提交正文 / 事实 / 源快照并 `skipBlockScroll`；`swapSides()` 一次提交内镜像路径、正文与事实，`onPairChange` 回写同一 `FilePair`；`directoryCompare.replaceFilePair` 原子更新 `pair` / `stats` / `probes`；`Workbench` 以 `readSessionSide` 路由真实路径与快照挂载路径、以 `handleSessionPairChange` 映射单条会话。测试补 `CodeView.switches.test.tsx` 3 例（重载保持会话 / 滚动 / 开关且只读、单侧不可读保留结果、交换两次复原）、`comparisonSwitches.dom.test.tsx` 1 例（重载 / 交换后状态栏原始值与三开关不变）、`directoryCompare.test.ts` 2 例（整对替换、无 adhoc 原样返回）。
- L2 触发判定材料（不自作结论，交 Owner 按 2026-11-03 口径重判）：① IPC——重载复用既有 `probeTextFile` / 快照读取通道，未新增 channel；② 窗口化——未触及 `@tanstack/react-virtual` / `WINDOW_THRESHOLD`；③ 同步滚动——只新增「跳过一次性块滚动」以保留 `scrollTop`，未改 `syncScroll` 本身；④ 目录扫描 / 哈希——零改动，父目录比较树不参与提交。
- 后续注意：① `readSide` 缺省时重载按钮不渲染、`onPairChange` 缺省时交换按钮不渲染，独立渲染（无 shell）时两个动作不可用属预期；② 交换只换视图与会话 `pair`，若后续把编辑缓冲（`CodeFileBuffer`）持久化到 `adhoc`，交换必须同步换缓冲的左右路径，否则脏标记与保存会指向旧侧；③ 重载的 `scrollTop` 保持依赖 `skipBlockScroll` 一次性标记，任何新增「提交后自动滚到首块」逻辑都要尊重该标记。
