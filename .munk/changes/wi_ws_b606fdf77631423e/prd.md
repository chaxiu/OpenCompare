# 真实三向合并会话入口

## 范围

在既有「新建对比」弹窗里补上第三类真实会话：用户输入 base / ours / theirs 三个真实文件路径，经纯函数归一化 + 逐侧校验后建立真实三向会话；三栏内容、冲突块、逐块接受与保存全部复用既有 `@core/text/merge` / `CodeMergeView`，不重写合并算法。同时把这类会话接入上一波已落地的对比历史（`kind: 'merge'` 的写入与重开），让「三类真实会话 + 最近历史 + 一键重开」的闭环在本项收口。

1. 「新建对比」弹窗增加模式切换
   - 默认仍是既有双路模式：左 / 右两个输入、「打开文件」「打开文件夹」两个选择器、提交按钮、Enter 提交、Esc 关闭，行为与文案不变。
   - 切到三向合并模式后只出现三个输入（base / ours / theirs，标签走 i18n）与同一提交按钮；双路专属的选择器动作在该模式下不出现。
   - 两个模式的输入值各自保留：切到三向再切回双路，已输入的左 / 右路径不丢；反之亦然。
   - 三向模式不做逐侧文件选择器（三个路径可键入即可），也不做三文件拖拽 / 启动参数 / `opencompare://` 三向入口。

2. 纯函数归一化与校验（`src/shared/`）
   - 三条路径各自复用既有 `normalizePathValue`（去引号、`~` 展开、相对路径按 `baseDir` 解析、段折叠、统一 `/`），不写第二份归一化。
   - 逐侧探测一次 `statPath`，稳定错误码至少覆盖：`EMPTY_PATH`、`NOT_FOUND`、`ACCESS_DENIED`、`NOT_A_FILE`（该侧是目录）、`UNSUPPORTED_FILE_TYPE`（扩展名不在既有 `isSupportedComparisonFile` 白名单）。
   - 错误优先级固定：按 base → ours → theirs 逐侧；同一侧内 `ACCESS_DENIED` → `NOT_FOUND` → `NOT_A_FILE` → `UNSUPPORTED_FILE_TYPE`。
   - 三向允许两条路径相同（base 与 ours 相同、ours 与 theirs 相同都是合法合并输入），不套用双路的 `DUPLICATE_SIDE`。
   - 返回值携带稳定 `code` 与出错侧（`base` / `ours` / `theirs`），供 UI 按语言本地化；不把共享层 / 主进程的原始错误句直接展示。

3. 建立真实会话
   - 校验通过后按三条真实绝对路径读取三个文件正文，建立 `scene: 'code'`、`columns: 3` 的会话；会话携带三个真实 `{ path, text }` 输入，不加载任何内置样本。
   - 三栏面板标题显示各侧真实路径、副标题显示 base / ours / theirs 角色；冲突块与剩余计数由既有 `buildMergeModel` / `countUnresolved` 在真实正文上计算。
   - 逐块 `Accept Ours / Theirs / Both / Base`、冲突上下跳转、合并预览、「导出合并文本」与「复制」沿用既有 `CodeMergeView`；保存仍走既有 `PlatformPort.saveFile`，未解决时动作不可用。
   - 真实三向会话只渲染三栏合并，不提供 diff/merge 模式切换（没有双路正文可切）。
   - 会话 id 由三条有序路径派生（`merge:base ↔ ours ↔ theirs`）：同 trio 再次建立 / 重开复用同一 tab，不出现重复 tab；顺序不同视为不同会话。
   - 会话标题由三个真实文件名派生（三名全同时收敛为单个文件名，与既有文件对规则一致），副标题由三条完整绝对路径派生；两者都从会话的合并输入读取，不在建立时冻结成与磁盘无关的常量。
   - 状态栏冲突块计数走既有 `onMergeStateChange`（`activeMerge`）通道，不新增第二套计数来源。

4. 失败不建 tab
   - 空路径、缺失、不可读、目录、扩展名不支持、校验通过后读取失败，都只在弹窗内就地提示（`role="alert"`），弹窗保持打开，tab 数与会话列表不变。
   - 提示按稳定错误码本地化，en / zh 成对；文案可含该侧路径（与既有对比错误提示一致），但不展示原始异常句。

5. 历史写入与重开
   - 建立成功后写入一条 `kind: 'merge'` 历史条目：`paths` 顺序固定为 `[base, ours, theirs]`，三项开关取当前 shell 开关；同 trio 重复建立复用同一条目与 `id`，只刷新 `createdAt` 并移到最前。
   - 空态最近历史里 merge 条目按既有行样式显示（类型文案 + 三条路径 + 时间 + 重开 / 移除），不新增第三种列表形态。
   - 重开 merge 条目：重新读取三个文件、按磁盘最新内容重建冲突块，复用原 tab id；重开成功后条目 `createdAt` 刷新、`id` 不变。重开失败（任一侧已删除 / 不可读 / 类型变化）不建 tab、不改当前会话、不改其它条目，只出一条既有本地化失败提示。
   - merge 会话不消费三项对比开关，重开时也不改写 shell 开关；条目仍按既有 schema 记录三项开关（供条目结构一致），但不对合并视图产生行为影响。

6. 不回归
   - 既有双路文件 / 目录入口、拖拽、启动参数、样本场景与设置入口、顶栏入口与零 demo 口径全部不变。
   - 内置样本的三向合并场景（3 个冲突块、模式切换）行为不变。

## 验收标准

- ac-merge-dialog-mode: 弹窗默认处于双路模式且仍有左 / 右两个输入；切到三向模式后恰有 base / ours / theirs 三个带标签输入、无「打开文件 / 打开文件夹」动作；切回双路后原先输入的两个路径逐字保留。
- ac-merge-normalize-pure: 纯函数对含引号、`~`、相对路径的三条输入返回统一 `/` 的绝对路径；对三个真实受支持文件返回 `ok: true` 且三条路径逐项等于归一化结果，每侧 `statPath` 只调用一次。
- ac-merge-error-codes: 空路径 / 不存在 / 不可读 / 目录 / 扩展名不支持分别返回稳定 `code` 与出错侧，且优先级为 base→ours→theirs、同侧 ACCESS_DENIED→NOT_FOUND→NOT_A_FILE→UNSUPPORTED_FILE_TYPE。
- ac-merge-invalid-no-tab: 上述每种失败在三向模式提交后只出现一条 `role="alert"` 本地化提示、弹窗仍打开、`data-session-tab` 数量与提交前相等。
- ac-merge-real-panes: 三个真实临时文件（构造出至少 1 个双侧冲突块）建立后恰新增 1 个 tab，三栏文本逐字等于三个磁盘文件内容，冲突块总数等于 `buildMergeModel` 对同三份文本的结果且 > 0。
- ac-merge-conflict-statusbar: 状态栏「冲突块」数值等于 `onMergeStateChange` 上报的 unresolved 值；接受一个冲突块后该数值减 1，接受全部后为 0。
- ac-merge-accept-save: 逐块接受 ours / theirs / both / base 会更新预览与剩余计数；未清零时保存动作不可用，清零后 `saveFile` 收到的内容逐字等于 `renderMergeText` 的结果且不含冲突标记。
- ac-merge-title-subtitle: tab 标题包含三个真实文件名（三名全同时收敛为单个文件名），副标题（含 tab `title`）包含三条完整绝对路径。
- ac-merge-no-sample: 建立后的会话合并输入路径逐项等于三条真实临时路径，不含 `/samples/` 前缀、不读取 fixtures；内置样本三向场景仍渲染 3 个冲突块且模式切换不变。
- ac-merge-session-identity: 同 trio 再次建立 / 重开时 tab 数不增加且 `data-session-tab` 不变；把 ours 与 theirs 对调后视为不同会话（新增 tab）。
- ac-merge-history-write: 建立成功后历史恰新增 1 条 `kind: 'merge'`，`paths` 顺序为 `[base, ours, theirs]` 且与真实路径逐项相等，三项开关等于建立时 shell 开关；同 trio 重复建立后仍只有 1 条且 `id` 不变、`createdAt` 变大。
- ac-merge-history-reopen: 关闭全部 tab 并重新挂载后点重开：三栏内容等于磁盘最新内容（重开后改写的文件可见）、冲突数与新内容一致、tab `data-session-tab` 与重开前相同、条目 `id` 不变且 `createdAt` 变大。
- ac-merge-reopen-failure-restrained: 删除任一侧后重开：tab 数不变、历史条目字段与顺序不变、出现一条 zh / en 成对的失败提示且提示文本不含真实绝对路径。
- ac-pair-entry-no-regression: 双路模式仍能建立真实文件对与目录对，非法双路输入仍只在弹窗提示且不建 tab；顶栏入口集合与顺序不变，不出现任何 demo / 样本入口。
- ac-i18n-paired: 新增可见文案在 zh / en 的键集与占位符完全一致（`messages.test.ts` 通过），zh 文案不是英文原样复制；新增 shell 源文件已加入 `shellScan.test.ts` 的 `SHELL_COPY_FILES` 且全链路中文扫描为零命中。
- ac-console-no-paths: 建立、非法提交、重开、保存全过程捕获 renderer console，输出中不出现任一侧真实绝对路径。

## 非目标

- 不重写合并算法：`src/core/text/merge.ts`、`buildMergeModel` / `renderMerge` / `countUnresolved` / `renderMergeText` 语义与导出不变。
- 不做三向会话的逐侧文件选择器、三文件拖拽、启动参数 / URL 三向入口、合并结果落盘快照或合并历史结果缓存。
- 不做历史的安全收口（`error` 标记与展示、上限提示文案、清空动作、清空二次确认）——属后续 `history-safety` 子项；本项失败重开只复用既有通用失败提示。
- 不改双路对比 / 目录 / CSV / JSON·YAML / 样本 / 快照 / 导出 / 发布面语义，不改版本号、CHANGELOG、release 文件与 `.github`。
- 不新增 npm 依赖、不新增颜色 / 图标 / 第三方组件，不新增第二套磁盘或存储抽象。
- 不新增 `.munk/code-gates.json` gate 行，不改 `src/munk-gates.test.ts` 期望矩阵（历史专项门留给后续子项）。
- 不做浏览器 / 设备 / 桌面 GUI 验收；`docs/screenshots.md` 的重钉是仓库既有 gate 的合规步骤，不是本项验收项。
- 不修改 `src/renderer/src/App.test.tsx`（2959 行上限只降不升），新 DOM 断言放新文件。

## 实现约束

- 复用而不重造（文件锚点）：
  - `src/shared/mergeRequest.ts`（新增）：`MergePaths` / `MergeSide` / `MergeErrorCode` / `MergeResult`、`parseMergeManualPaths`、`resolveMergeRequest`；直接复用 `compareRequest.ts` 已导出的 `normalizePathValue` / `toDisplayPath` 与同一 probe 模式，零 Electron / DOM / Node 依赖，错误只返回稳定 code + 出错侧 + 规范化路径。
  - `src/renderer/src/workbench/mergeSession.ts`（新增）：`mergeSessionId(base, ours, theirs)`、`buildMergeSession(platform, base, ours, theirs)`（并行读取三侧、失败抛带稳定 code / 侧信息的错误）、`mergeSessionText(paths)`（标题 / 副标题的唯一派生处）、`mergeSessionErrorMessage(cause, t)`；不得在此文件写中文可见字面量。
  - `src/renderer/src/workbench/session.ts`：`WorkbenchSession` 增加可选 `merge?: MergeFileSides`（`{ base, ours, theirs }` 三个 `TextSample`），并在此定义 `MergeFileSides` 供 `CodeView` 以 type-only import 复用；不改既有字段语义。
  - `src/renderer/src/views/CodeView.tsx`：新增可选 `mergeSides?: MergeFileSides`，初始化合并输入；存在该 prop 时有效模式固定为 `merge` 且不渲染 diff/merge 分段控件，其余（逐块接受 / 预览 / 导出 / 复制 / 打开单侧文件）不改；`CodeMergeView` 本身不重写。
  - `src/renderer/src/workbench/NewCompareDialog.tsx`：模式状态 + 三个输入 + 提交分支（先 `parseMergeManualPaths` 再 `resolveMergeRequest`，失败只 `setIssue`）；新增 prop `openMergeRequest(request, onError)`；双路分支与 `openRequest` 原样保留。
  - `src/renderer/src/workbench/Workbench.tsx`：`openMergeRequest` 编排（构建会话 → 成功才 `upsertSession` → `recordHistory('merge', [base, ours, theirs])`）；`reopenHistoryEntry` 增加 `plan.kind === 'merge'` 分支（三条路径重建、复用 tab id、失败只报既有通用提示、不改 shell 开关）；`recordHistory` 的 kind 参数放宽到 `ComparisonHistoryKind`；merge 分支渲染 `CodeView mergeSides={session.merge}` 并接既有 `onMergeStateChange`。
  - `src/renderer/src/workbench/sessionDisplay.ts`：merge 会话的 title / subtitle 走 `mergeSessionText(session.merge)`，stats 只保留 `['shell.stat.conflicts']`（数值由 `activeMerge` 覆盖），不新增 stat 文案键。
  - `src/renderer/src/i18n/messages/{zh,en}/shell.ts`：成对新增模式标签、三个侧标签 / 占位符、`shell.merge.error.*`（含 `NOT_A_FILE`、`READ_FAILED`）等；侧标签优先复用既有 `files.merge.side.base/ours/theirs`，不重复造键。
- 会话与历史身份：会话 id `merge:${base} ↔ ${ours} ↔ ${theirs}`（顺序敏感）；历史身份仍由既有 `comparisonHistoryId(kind, paths)` 决定，不新增第二套去重逻辑；重开不新造解析，继续用 `resolveComparisonHistoryReopen`。
- 写入归属：只在真实三向建立 / 重开成功分支记录历史；内置样本、目录下钻、快照导入、失败或取消都不写。
- 失败原子性：先读齐三侧再 `upsertSession`；任一侧读失败只走 `onError` / 提示，不产生半成品会话、不写历史、不改当前活动 tab。
- 隐私：renderer 不打印历史 payload 或三侧路径；错误提示只用 i18n 文案（可含该侧路径），不拼原始 `cause.message` 之外的诊断串。
- i18n / 扫描：`src/renderer/src/workbench` 全目录被中文扫描覆盖，新文件必须零中文；新 shell 文件同时加入 `src/renderer/src/workbench/shellScan.test.ts` 的 `SHELL_COPY_FILES`。
- 测试落位（既有 `pnpm test` gate 覆盖，不新增 gate）：
  - `src/shared/mergeRequest.test.ts`：归一化 / 逐侧探测 / 错误码与优先级 / 允许重复路径。
  - `src/renderer/src/workbench/mergeSession.test.ts`：真实临时文件建会话、id / columns / 标题副标题、读失败不建会话、历史写入与重开（复用 `src/test/sharedHarness.tsx` 的临时目录与 `ipcPort` 范式）。
  - 新增 `*.dom.test.tsx`（例如 `src/renderer/src/workbench/mergeSession.dom.test.tsx`）：弹窗三向模式、非法提交不建 tab、三栏真实内容与冲突计数、接受 / 保存、en/zh 提示、console 无绝对路径。
  - 既有测试只追加 / 最小改动，不整文件重写；不为凑绿放宽门禁。
- 测试债与截图 provenance（仓库既有硬 gate，必须同提交闭环）：
  - `src/renderer/**` 有 diff 即触发 `src/main/release-artifacts-and-brand.test.ts`：必须在提交 renderer 改动后重跑 `pnpm build` + `node scripts/capture-readme-screenshots.mjs`，重建两张 README 图并重钉 `docs/screenshots.md` 的 captured commit 与两图 sha256（captured commit 必须是 HEAD 祖先且 `src/renderer` 零 diff）。
  - `.munk/baseline/test-debt.json` 的 `repoTestLines` 需要新增 `growth` 条目（含 reason / addedCases，单次增幅 ≤ 400 行）；`appTestLines` 只降不升；用例数 floor 不得下调。
- 验证口径：本项只做 `code_gates`（`pnpm lint` / `typecheck` / `test` 等既有 gate 全绿）；浏览器 / 设备 / 桌面 GUI 验证不在本项范围，不需要人工确认。
