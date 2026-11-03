# Domain: merge-session

真实三向合并会话入口：用户在「新建对比」弹窗以 base / ours / theirs 三条真实路径建立三向会话，经 `src/shared/` 纯函数归一化 + 逐侧探测校验后，三栏内容、冲突块、逐块采纳与导出全部复用既有 `@core/text/merge` 与 `CodeMergeView`；同时把 merge 会话接入对比历史（`kind: 'merge'` 写入与重开），形成「三类真实会话 + 最近历史 + 一键重开」闭环。合并算法本身属 `code-diff-merge` 域，历史模型与持久化通道属 `comparison-history` 域，双路入口属 `workbench` 域。

## 范围

- **弹窗模式切换**：`NewCompareDialog` 在既有双路模式与三向模式间切换；默认双路（左 / 右输入 + 两个选择器 + 提交 / Enter / Esc 行为不变），三向模式只出现 base / ours / theirs 三个带标签输入与同一提交按钮，不出现逐侧选择器；两模式输入值各自保留，来回切换不丢已输入路径。三向不提供逐侧文件选择器、三文件拖拽、启动参数或 `opencompare://` 入口。
- **纯函数归一化与校验（`src/shared/mergeRequest.ts`）**：三条路径各自复用 `compareRequest.ts` 导出的 `normalizePathValue` / `toDisplayPath`（去引号、`~` 展开、相对路径按 `baseDir` 解析、段折叠、统一 `/`），不写第二份归一化；逐侧一次 `statPath` 探测，稳定错误码 `EMPTY_PATH` / `NOT_FOUND` / `ACCESS_DENIED` / `NOT_A_FILE` / `UNSUPPORTED_FILE_TYPE`，优先级按 base→ours→theirs，同侧内 `ACCESS_DENIED`→`NOT_FOUND`→`NOT_A_FILE`→`UNSUPPORTED_FILE_TYPE`；三向允许两条路径相同（不套双路 `DUPLICATE_SIDE`）；返回值只携带稳定 `code` + 出错侧 + 规范化路径，零 Electron / DOM / Node 依赖。
- **建立真实会话**：校验通过后按三条真实绝对路径读入正文，建立 `scene: 'code'` / `columns: 3` 会话，携带三个真实 `{ path, text }`（`WorkbenchSession.merge`），不加载任何内置样本；三栏标题为各侧真实路径、副标题为 base / ours / theirs 角色；冲突块与剩余计数由既有 `buildMergeModel` / `countUnresolved` 在真实正文上计算；该会话固定 `merge` 模式，不渲染 diff/merge 分段控件。
- **会话身份与文案派生**：会话 id 由三条有序路径派生 `merge:${base} ↔ ${ours} ↔ ${theirs}`（顺序敏感），同 trio 再次建立 / 重开复用同一 tab；标题由三个真实文件名派生（三名全同收敛为单个文件名），副标题由三条完整绝对路径派生，均从会话合并输入读取而非冻结常量；状态栏冲突计数只走既有 `onMergeStateChange` 通道。
- **失败不建 tab**：空路径、缺失、不可读、目录、扩展名不支持、校验通过后读取失败，都只在弹窗 / 既有提示内就地展示一条 `role="alert"` 本地化文案，弹窗保持打开、tab 数与会话列表不变；不展示原始异常句，可含该侧路径。
- **历史写入与重开**：建立成功写一条 `kind: 'merge'` 历史，`paths` 固定 `[base, ours, theirs]`，三项开关取当前 shell 开关；同 trio 重复建立复用同一条目与 `id`，只刷新 `createdAt` 并置顶。空态最近历史中 merge 条目按既有行样式显示（类型文案 + 三条路径 + 时间 + 重开 / 移除）。重开时重新读取三个文件、按磁盘最新内容重建冲突块、复用原 tab id，成功后 `createdAt` 刷新且 `id` 不变；失败（删除 / 不可读 / 类型变化）不建 tab、不改当前会话与其它条目，只出一条既有本地化失败提示。merge 会话不消费三项对比开关，重开也不改写 shell 开关。

## 验收

- **ac-merge-dialog-mode**：弹窗默认双路且仍有左 / 右两个输入；切到三向恰有 base / ours / theirs 三个带标签输入、无「打开文件 / 打开文件夹」动作；切回双路后原输入逐字保留。
- **ac-merge-normalize-pure**：含引号 / `~` / 相对路径的三条输入返回统一 `/` 的绝对路径；三个真实受支持文件返回 `ok: true` 且路径逐项等于归一化结果，每侧 `statPath` 只调用一次。
- **ac-merge-error-codes**：空路径 / 不存在 / 不可读 / 目录 / 扩展名不支持分别返回稳定 `code` 与出错侧，优先级为 base→ours→theirs、同侧 ACCESS_DENIED→NOT_FOUND→NOT_A_FILE→UNSUPPORTED_FILE_TYPE。
- **ac-merge-invalid-no-tab**：每种失败提交后只出现一条 `role="alert"` 本地化提示、弹窗仍打开、`data-session-tab` 数量与提交前相等。
- **ac-merge-real-panes**：三个真实临时文件（至少 1 个双侧冲突块）建立后恰新增 1 个 tab，三栏文本逐字等于磁盘内容，冲突块总数等于 `buildMergeModel` 对同三份文本的结果且 > 0。
- **ac-merge-conflict-statusbar**：状态栏「冲突块」等于 `onMergeStateChange` 上报的 unresolved 值；接受一个冲突块减 1，接受全部为 0。
- **ac-merge-accept-save**：逐块接受 ours / theirs / both / base 更新预览与剩余计数；未清零保存不可用，清零后 `saveFile` 收到内容逐字等于 `renderMergeText` 结果且不含冲突标记。
- **ac-merge-title-subtitle**：tab 标题含三个真实文件名（三名全同收敛为单个文件名），副标题（含 tab `title`）含三条完整绝对路径。
- **ac-merge-no-sample**：会话合并输入路径逐项等于三条真实临时路径，不含 `/samples/` 前缀、不读 fixtures；内置样本三向场景仍渲染 3 个冲突块且模式切换不变。
- **ac-merge-session-identity**：同 trio 再次建立 / 重开 tab 数不增加且 `data-session-tab` 不变；ours 与 theirs 对调视为不同会话（新增 tab）。
- **ac-merge-history-write**：建立成功后历史恰新增 1 条 `kind: 'merge'`，`paths` 为 `[base, ours, theirs]` 且与真实路径逐项相等，三项开关等于建立时 shell 开关；同 trio 重复建立仍 1 条且 `id` 不变、`createdAt` 变大。
- **ac-merge-history-reopen**：关闭全部 tab 并重新挂载后重开：三栏内容等于磁盘最新内容（重开后改写的文件可见）、冲突数与新内容一致、tab `data-session-tab` 与重开前相同、条目 `id` 不变且 `createdAt` 变大。
- **ac-merge-reopen-failure-restrained**：删除任一侧后重开：tab 数不变、历史条目字段与顺序不变、出现一条 zh / en 成对失败提示且文本不含真实绝对路径。
- **ac-pair-entry-no-regression**：双路模式仍能建立真实文件对与目录对，非法双路输入仍只在弹窗提示且不建 tab；顶栏入口集合与顺序不变，不出现 demo / 样本入口。
- **ac-i18n-paired**：新增可见文案在 zh / en 的键集与占位符完全一致（`messages.test.ts` 通过），zh 不是英文原样复制；新增 shell 源文件已加入 `shellScan.test.ts` 的 `SHELL_COPY_FILES` 且全链路中文扫描零命中。
- **ac-console-no-paths**：建立、非法提交、重开、保存全过程 renderer console 输出中不出现任一侧真实绝对路径。

## 非目标

- 不重写合并算法：`src/core/text/merge.ts` 与 `buildMergeModel` / `renderMerge` / `countUnresolved` / `renderMergeText` 语义与导出不变。
- 不做三向逐侧文件选择器、三文件拖拽、启动参数 / URL 三向入口、合并结果落盘快照或合并历史结果缓存。
- 不做历史安全收口（`error` 标记与展示、上限提示文案、清空动作与二次确认）——属后续 `history-safety` 子项；本域失败重开只用既有通用失败提示。
- 不改双路对比 / 目录 / CSV / JSON·YAML / 样本 / 快照 / 导出 / 发布面语义，不改版本号、CHANGELOG、release 文件与 `.github`。
- 不新增 npm 依赖、颜色 / 图标 / 第三方组件，不新增第二套磁盘或存储抽象。
- 不新增 `.munk/code-gates.json` gate 行，不改 `src/munk-gates.test.ts` 期望矩阵；不做浏览器 / 设备 / 桌面 GUI 验收。
- 不修改 `src/renderer/src/App.test.tsx`（2959 行上限只降不升），新 DOM 断言放新文件。

## 实现约束

- 文件锚点：`src/shared/mergeRequest.ts`（`MergePaths` / `MergeSide` / `MergeErrorCode` / `MergeResult`、`parseMergeManualPaths`、`resolveMergeRequest`）；`src/renderer/src/workbench/mergeSession.ts`（`mergeSessionId`、`mergeSessionText`、`buildMergeSession`、`mergeSessionErrorMessage`，本文件零中文可见字面量）；`workbench/session.ts` 的 `WorkbenchSession.merge?: MergeFileSides`（`{ base, ours, theirs }` 三个 `TextSample`）；`views/CodeView.tsx` 的 `mergeSides?: MergeFileSides`（存在即固定 merge 模式、不渲染分段控件）；`workbench/NewCompareDialog.tsx` 的模式状态 + 三输入 + `openMergeRequest(request, onError)`；`workbench/Workbench.tsx` 的编排（成功才 `upsertSession` → `recordHistory('merge', [base, ours, theirs])`）与 `reopenHistoryEntry` 的 `kind === 'merge'` 分支；`workbench/sessionDisplay.ts` 的标题 / 副标题 / stats（只留 `shell.stat.conflicts`）；`i18n/messages/{zh,en}/shell.ts` 成对新增键，侧标签优先复用 `files.merge.side.*`。
- 身份与去重：会话 id 顺序敏感；历史身份仍由 `comparisonHistoryId(kind, paths)` 决定，重开继续用 `resolveComparisonHistoryReopen`，不新增第二套去重逻辑。
- 写入归属：只在真实三向建立 / 重开成功分支记录历史；内置样本、目录下钻、快照导入、失败或取消都不写。失败原子性：先读齐三侧再 `upsertSession`。
- 隐私：renderer 不打印历史 payload 或三侧路径；错误提示只用 i18n 文案（可含该侧路径），不拼原始诊断串。
- 分层：`src/shared/` 零 Electron / DOM / Node 依赖；renderer 平台能力只经 `PlatformPort`；`workbench` 全目录中文扫描覆盖，新文件须零中文并加入 `SHELL_COPY_FILES`。
- 测试落位：`src/shared/mergeRequest.test.ts`、`src/renderer/src/workbench/mergeSession.test.ts`、新增 `*.dom.test.tsx`；既有测试只追加 / 最小改动，不为凑绿放宽门禁。
- 仓库既有硬 gate 同提交闭环：`src/renderer/**` 有 diff 即重跑 `pnpm build` + `node scripts/capture-readme-screenshots.mjs` 并重钉 `docs/screenshots.md` provenance；`.munk/baseline/test-debt.json` 的 `repoTestLines` 增 `growth` 条目（单次 ≤ 400 行），`appTestLines` 只降不升、用例 floor 不下调。

## 最近交付证明

- WI：`wi_ws_b606fdf77631423e`（真实三向合并会话入口 + merge 历史写入 / 重开，`kind: feature`）
- 日期：2026-11-04
- 结果：code_gates 通过（28 gates，attempt 001，`ok: true`）；按本项口径不做浏览器 / 设备 / 桌面 GUI 验收。
- 覆盖摘要：新增 `src/shared/mergeRequest.ts`（归一化复用 `normalizePathValue` / `toDisplayPath`，逐侧一次 `statPath`，稳定错误码 + 侧信息，允许重复路径）与 `src/renderer/src/workbench/mergeSession.ts`（`merge:base ↔ ours ↔ theirs` 会话 id、`mergeSessionText` 单一文案派生、并行读三侧失败抛 `READ_FAILED`）；`NewCompareDialog` 增模式切换 + 三输入且两模式输入各自保留；`Workbench` 增 `openMergeRequest` 与 `reopenHistoryEntry` 的 merge 分支（失败只报既有提示、不改 shell 开关）；`CodeView` 增 `mergeSides` prop 固定三栏合并、复用既有 `CodeMergeView`；`sessionDisplay` 走 `mergeSessionText` 且 stats 仅冲突数；zh / en 成对新增 shell 文案并纳入 `SHELL_COPY_FILES`。测试新增 `mergeRequest.test.ts`、`mergeSession.test.ts`、`mergeSession.dom.test.tsx`，同步 `test-debt.json` growth 与 README 截图 provenance 重钉。
- 注：本 WI change pack 仅含 `prd.md`，未提供 `tests/cases/**` / `tech.md` / `ux/**`，无新增折叠用例与设计 / 技术折叠。
