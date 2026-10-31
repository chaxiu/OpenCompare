# 同步取消和失败：窗口不丢、按钮能重试、提示能看懂

## Scope

本项是 WorkSet 的收口子项，只补**渲染层可回归断言**与**必要的最小状态修复**，不新增功能、不改同步算法与界面布局。

已核实现的现状（不要重写）：

- `DirectorySyncDialog` 已有「删除项初始不勾选」「只有未勾删除项时确认禁用并显示原因」「忙碌态确认禁用、取消仍可用」以及 zh/en 文案（`src/renderer/src/views/directoryI18n.test.tsx` 已覆盖）。
- `Workbench.handleConfirmSync` 已建立 `AbortController` 并经 `applySyncPreview` 的 `signal` 传入 `executeSyncPlan`；取消与失败走同一回滚路径，`SyncRefreshError` 单独分支；`DirectoryView` 把弹窗 `onAbort` 接到 `onAbortSync`。
- `directoryOps.readableSyncFailure` 已剥离 `Error invoking remote method …` 前缀，仅对执行/刷新路径生效。

本项要闭合的缺口（渲染层无证据的部分）：

1. **取消信号贯通没有跨层证据**：从弹窗「取消」按钮 → `onAbortSync` → `AbortController.abort()` → `applySyncPreview` → 真实回滚，全链路没有 renderer 用例；也就没有断言证明「取消后目标侧回到执行前、弹窗不关、按钮可重试」。
2. **失败提示与会话保持没有渲染层证据**：执行失败（带 IPC 包装的 `EACCES`）后是否显示中文可读原因、是否不含 IPC 包装、当前会话/对比树/过滤器/选中行是否原样、`busy` 是否复位、同一预览能否重试，均无断言。
3. **Dry-run 失败提示可能透出 IPC 包装（最小修复点）**：`handlePreviewSync` 的 catch 直接使用原始 `error.message`，未走与执行路径相同的剥离规则；若测试证实会显示 `Error invoking remote method …`，按最小改动复用同一剥离规则修复。
4. **既有断言保持**：`directorySyncRefresh.test.tsx` 的「写入已完成仅刷新失败」与 `directoryI18n.test.tsx` 的删除默认不勾/仅未勾删除时禁用，必须继续通过且不得放宽。

产出：

- 新增渲染层测试文件（建议 `src/renderer/src/workbench/directorySyncRetry.test.tsx`），沿用 `renderWithI18n` + `createWebPlatformPort` + `openDirectoryPair`/`legendNumbers` 写法，用可控门闩包装 `writeTextFile` 制造「执行中」与「注入失败」，不 mock 文件系统、不启动 Electron、不新增 `code-gates.json` 矩阵项（`pnpm test` 已覆盖）。
- 仅在断言证伪时做最小生产修复，且限定在 `Workbench.tsx` 的提示构造与 `busy` 复位。

## Acceptance Criteria

- ac-cancel-from-dialog-aborts: 用受控端口让第 2 次 `writeTextFile` 挂起，Workbench 打开预览并点击「确认执行」，再点击弹窗内「取消」后释放该写入：执行以取消结束（不抛系统码），目标侧（web 内存端口）恢复到执行前文件集合与内容（第 1 个已写入的文件被回滚删除），目标树内不存在临时文件条目。
- ac-cancel-session-preview-preserved: 上述取消后，预览弹窗仍打开（「确认执行」按钮存在且 `disabled === false`、文案回到「确认执行」），当前会话 tab 名与四态计数（same/added/removed/modified）与执行前完全相同，被选中行的 `aria-selected` 仍为该路径，当前状态过滤器值不变。
- ac-cancel-notice-readable: 取消后出现提示（`role="alert"`）文本为中文，含「同步已取消」与「已回滚」，不含 `Error invoking remote method`，也不含 `EACCES|EPERM|EISDIR|EROFS|EBUSY|ENOTDIR` 中的任一系统码。
- ac-failure-notice-readable: 让挂起写入以 `Error invoking remote method 'platform:write-text-file': Error: 无法写入文件 <path>：没有访问权限（EACCES）。` 拒绝：提示文本含目标路径与 `EACCES`、不含 `Error invoking remote method`，`text-danger` 语气生效；目标侧该文件不存在或仍为执行前内容（无半写文件）。
- ac-failure-session-preview-preserved: 上述失败后，当前会话 tab 名与四态计数与执行前完全相同（会话未被替换、未被清空），预览弹窗仍打开且「确认执行」重新可用，`busy` 已复位（预览/确认等依赖 busy 的控件恢复可点）。
- ac-retry-after-failure: 同一弹窗在失败后再次点击「确认执行」（此端口后续写入全部成功）：执行成功，弹窗关闭，出现「同步完成」提示，会话被新的 `DirectoryComparison` 替换（added 归零、same 增加），目标文件真实存在。
- ac-preview-failure-no-ipc-wrapper: 使 Dry-run 的目录读取以 `Error invoking remote method 'platform:list-directory': Error: 无法读取目录 <path>：没有访问权限（EACCES）。` 拒绝：出现 danger 提示，含「无法读取目录」与 `EACCES`，不含 `Error invoking remote method`；不打开预览弹窗，`busy` 复位（预览并同步按钮恢复可点）。
- ac-only-unchecked-delete-blocked: 删除项默认未选中、只有未勾删除项时「确认执行」`disabled` 且显示「待删除项默认不勾选…」原因、无任何可执行项时不调用 `onConfirm`；既有 `directoryI18n.test.tsx` 对应断言保持通过（不得删除、跳过或放宽）。
- ac-gates-green: `pnpm test`（含新增 renderer/i18n 用例与既有套件）、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web` 全绿；不新增、不删改 `.munk/code-gates.json` 矩阵项；新增用例耗时维持现有 renderer 套件量级（无固定 sleep 堆叠）。

## Non-Goals

- 不改 `src/core/directory/sync.ts` 的算法、预检、原子写、回滚与取消语义；不改四态口径、mtime 快路径、`.ocsnap`/报告/导出格式。
- 不改 `DirectorySyncDialog` 的布局、分组、勾选交互与既有文案结构；不新增按钮/路由/视图。
- 不新增 i18n 词条（除修复确实必要，且必须 zh/en 成对、英文不含汉字）；不改英文词典规则。
- 不扩展 `sync-real-gate` / `test:sync-real`，不引入真实磁盘或 Electron IPC 用例（真实磁盘失败安全已由前序项覆盖）。
- 不做实机 GUI / 浏览器 / 设备验收（`needSelfTest=false`）；不动 tag / Release / 资产。

## Implementation Constraints

- 测试基座沿用 `directorySyncRefresh.test.tsx`：`renderWithI18n(<Workbench platform={port} />, 'zh')` + `createWebPlatformPort()` + `openDirectoryPair` + `legendNumbers`；宽度/高度 stub 复用其 `beforeAll` 写法。
- 「执行中」用 Promise 门闩包装 `writeTextFile`（真实 web 内存端口为基底），不用 fake timers、不用固定 `sleep`；挂起→点击取消→释放→`await waitFor` 断言终态。失败注入用同一门闩 reject 一个带 IPC 包装前缀的中文 `Error`。
- 选择行与过滤器：优先复用现有 `DirectoryView` 的 aria 契约（`role="treeitem"` 的 `aria-selected`）与状态过滤器按钮；断言取执行前后同一 DOM 值对比，不新造状态读取接口。
- 最小修复边界：只允许在 `Workbench.handlePreviewSync` 的失败提示构造中复用 `directoryOps` 既有的 IPC 前缀剥离规则（可导出同一函数或统一小工具），以及在确证 busy/预览被错误复位时修正该处状态；不得顺手重构取消流程、Dialog 或会话替换逻辑。
- 若断言证明现有实现已正确，则不修改生产代码，只提交测试；禁止为凑绿放宽 AC、删除既有断言或加人为延时规避。
- 测试命名与落位：新文件 `src/renderer/src/workbench/directorySyncRetry.test.tsx`（或并入 `directorySyncRefresh.test.tsx`），纳入 `pnpm test`；单个用例超时沿用既有 60s 上限，不改 vitest 全局配置。
- 基线为当前 `refs/heads/main` tip；交付后未发布 commit 在交接中逐条写「未发布：`<sha>` `<标题>` `<原因>`」。
