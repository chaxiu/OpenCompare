# Domain: history-home

把 `comparison-history` 域已交付的「条目模型 + `PlatformPort` 持久化通道」接到工作台：新建页（无会话空态）渲染最近历史，真实目录 / 文件对建立后写入，一键按原类型 / 原路径 / 原三项开关重开，可单条移除，文件会话切开关只回写自己那一条。本域只做渲染与编排，不新增历史模型。

## 范围

- **新建页历史区**：仅在 `status === 'empty'` 且读回条目数 > 0 时渲染；0 条时整块不出现（无标题、无空占位、无「清空」）。顺序与 20 条上限直接取模型输出（`createdAt` 降序 + `trimComparisonHistory`），renderer 不排序、不裁剪、不二次校验。
- **行内容**：类型文案（`directory` / `file`，`merge` 预留）、两侧路径按 `↔` 连接（`title` 完整串 + `truncate` + `font-mono`）、本地化时间（日期 + 时分）、「重开」「移除」两个动作；`busy` 时两动作禁用。
- **建立后写入**：真实目录对（`runSidesCompare` 成功且两侧均真实目录根）与真实文件对（`openFilePairSession` 成功）各写一条，`kind` / 有序 `paths` / `createdAt = Date.now()` / 建立时 shell 三项开关；身份 = `kind` + 有序路径，重复建立复用同一 `id` 并只刷时间 / 开关并置顶。写入在会话提交后异步发出，不进扫描 / 读取关键路径；写失败只回滚本次列表写入（会话与 tab 照常）。
- **一键重开**：先 `resolveComparisonHistoryReopen` 解析；目录走 `directorySides` + 既有 `runSidesCompare`（保留进度条与取消），用全新 `createComparisonCache()` 且扫描前后对共享缓存 `evictUnderRoots` 失效，禁止快照挂载；文件走既有 `openFilePairSession` 重探测 + 重读。成功后还原三项开关、刷新时间并置顶，tab 复用路径派生 id 不新增第二个同路径 tab；失败只出通用本地化提示（不含绝对路径），不建 tab、不改当前会话与其它条目。
- **单条移除**：`removeComparisonHistoryEntry` + 写回，其它条目字段与相对顺序不变，删空后历史区消失。
- **开关快照同步**：文件会话激活时切开关只更新该会话 `historyId` 对应条目（`id` / `createdAt` / 条目数不变）；无 `historyId` 的会话（内置样本、下钻文件、快照导入）不写任何条目；切换到 B 后只影响 B 的条目。
- **i18n**：新增可见文案在 `zh` / `en` 成对落 `shell.ts`，占位符一致，代码内无中文可见字面量；空态三 CTA 与零 demo 口径不变。

## 验收

- **ac-home-visible-only-with-entries**：空态读回 ≥1 条时历史区可见且每条能读到完整路径与时间；读回 0 条时页面上不存在历史标题、历史行与任何历史动作。
- **ac-home-order-and-cap**：行顺序与 `createdAt` 降序一致；预置 25 条时只渲染 20 行，保留 `createdAt` 最大的 20 条。
- **ac-home-row-content**：每行渲染类型文案 + 路径文本 + 时间；路径元素 `title` 等于两侧真实绝对路径按 `↔` 连接的完整串，且带 `truncate` 类。
- **ac-home-time-localized**：行内时间等于时间格式化纯函数对同一条目 `createdAt` 的输出；同一 timestamp 在 `zh` 与 `en` 下输出不同，且都含日期与时分。
- **ac-write-directory-establish**：真实临时目录对建立成功后历史恰新增 1 条 `kind: 'directory'`，`paths` 与两侧真实根逐项相等，三项开关等于建立时 shell 开关。
- **ac-write-file-establish**：真实临时文件对建立成功后历史恰新增 1 条 `kind: 'file'`，`paths` 逐项相等，三项开关等于建立时 shell 开关。
- **ac-write-excluded-sources**：内置样本、内置 remote snapshot 样本、快照导入、目录树下钻文件、sync 刷新、失败或取消的建立，条目数都不变。
- **ac-write-failure-nonblocking**：`writeComparisonHistory` reject 后建立真实目录 / 文件对，tab 仍出现、状态仍 ready、历史列表仍等于写前条目，且无未捕获异常 / 无阻塞错误弹层。
- **ac-reopen-directory-rescan**：目录对建立后关闭全部 tab 并重新挂载，点重开出现 `role="status"` 扫描进度并最终 ready；同大小、同 mtime 但内容被改写的文件计入差异（旧哈希缓存未被复用）。
- **ac-reopen-directory-real-roots**：目录重开后会话副标题含两侧真实根、两侧都是真实目录根（无快照挂载）；重开前后 tab 的 `data-session-tab` 值相同。
- **ac-reopen-file-reread-switches**：文件对建立后关闭并重新挂载（shell 开关回默认），磁盘内容改写后重开：两侧内容等于磁盘最新内容，三项开关逐项等于条目值（覆盖非默认组合）。
- **ac-reopen-same-identity**：同路径重开：条目数不变、`id` 不变、该条 `createdAt` 变大并位于首行；再经拖入 / 对话框打开同一对时 tab 数仍为 1，`data-session-tab` 不变。
- **ac-reopen-failure-restrained**：删除一侧路径后重开：tab 数不变、历史条目数与字段不变、出现一条 zh / en 成对失败提示，且文本不含任何真实绝对路径。
- **ac-remove-entry**：点「移除」后该条消失、其它条目字段与相对顺序不变，重新挂载后仍不存在；移除最后一条后历史区不渲染。
- **ac-switch-sync-active-entry**：文件会话激活时切三项开关，条目数 / `id` 不变、该条开关更新、`createdAt` 不变；重新挂载后重开应用更新后的开关。
- **ac-switch-sync-isolated**：内置样本会话（无历史归属）切开关不新增也不改任何条目；先开 A 再切到 B 后切开关，只有 B 的条目变化，A 条目逐字段不变。
- **ac-i18n-paired**：新增可见文案在 `zh` / `en` 键集与占位符完全成对（`messages.test.ts` 键集断言通过），zh 不是英文原样复制。
- **ac-empty-cta-unchanged**：空态仍是「新建对比 / 打开文件 / 打开文件夹」三个 CTA，顺序与文案不变，无内置样本或 demo 入口。
- **ac-no-path-in-console**：建立、重开、失败、移除全过程捕获 renderer console，输出中不出现任一侧真实绝对路径。

## 非目标

- 不清空历史（无「清空」动作与二次确认）、不做上限提示、不做坏路径预检 UI 与条目 `error` 标记 / 展示（属 `history-safety` 后续波次）。
- 不做真实三向合并入口、`NewCompareDialog` 三向模式、`merge` 条目的写入与重开（本波不可能产生 `merge` 条目）。
- 不落盘对比结果、目录树、四态计数、文件正文、哈希 / 快照 / 摘要；不缓存历史读回结果，不新增第二套存储抽象。
- 不改 `src/core/**`、对比 / 合并语义、四态口径、快照格式、导出内容、发布面文件与版本号；不改 `settings.json` 契约。
- 不改 `NewCompareDialog.tsx` 结构与既有引导流；不做最近文件 / 收藏夹 / 路径补全 / 右键菜单 / 拖拽排序 / 批量操作。
- 不新增 npm 依赖、颜色 / 图标包，不新增 `.munk/code-gates.json` gate 行。
- 不做浏览器 / 设备 / 桌面 GUI 验收；`docs/screenshots.md` 重钉是仓库既有 gate 的合规步骤，不属本域验收项。

## 实现约束

- **复用不重造**：读取 / 去重 / 裁剪 / 移除 / 重开入参解析一律调 `src/shared/history/model.ts` 既有函数；类型从 `@shared/history` 取。
- **文件锚点**：`src/renderer/src/workbench/Workbench.tsx`（空态接历史区、建立后写入、重开编排、移除、开关回写）；`src/renderer/src/workbench/historyHome.tsx` 渲染 + `historyHomeModel.ts` 纯 helper（时间格式化 `formatHistoryTime`、路径串、`historyCandidate`、`historyIdFor`、`withHistorySwitches`）；`session.ts` 的 `WorkbenchSession.historyId?`；`StateView` 新增可选 `extra` 槽位（不改三 CTA / hint 语义）；`i18n/messages/{zh,en}/shell.ts` 成对文案。
- **写入归属**：只在真实建立成功分支记录，`runSidesCompare` / `openFilePair` 用显式 `recordHistory` 入参，仅真实入口（对话框 / 打开文件 / 打开文件夹 / 拖入）传 true；样本、remote snapshot 样本、快照导入、目录树下钻、sync 刷新一律不传。
- **目录重开缓存**：`freshCache` 时新建 `createComparisonCache()` 供本次扫描，扫描前后对共享 `cache.current` 执行 `evictUnderRoots([left, right])`；仍走 `compareSides` + 既有进度 / 取消通道，不自建扫描循环。
- **tab id**：已由路径派生（`directory:…` / `file:…`），重开只需保持路径入参一致；不改 id 生成规则。
- **UI 结构**：历史区位于空态 `StateView` CTA 区块下方同一列；只用 `main.css` token 工具类与 `ToolbarButton`（`size="sm"` / `variant="ghost"`）；路径 `font-mono` + `truncate` + `title`；不写死颜色 / 尺寸。
- **时间**：单一纯函数 `formatHistoryTime(createdAt, language)`（`Intl.DateTimeFormat`，`zh-CN` / `en`，日期 + 时分），UI 与测试共用，组件内不另写格式化。
- **隐私**：不打印历史 payload；失败提示只用 i18n 通用文案（不拼 `error.message`、不拼路径）；renderer console 不出现真实路径。
- **测试落位**：新 DOM 断言放新文件（`historyHome.dom.test.tsx`），不加长 `App.test.tsx`（2959 行上限只降不升）；真实磁盘证据复用 `src/test/sharedHarness.tsx` 的 `scratchSides` / `writeStamped` / `ipcPort` 与 `appState.userData` 临时目录，不用样本冒充。
- **`test-debt`**：新增用例后跑 `node scripts/test-debt-gate.mjs` 取实测值，追加 `growth` 并把 `floors.repoTestCases` 上调到实测值；`ceilings` 只降不升。
- **门禁自绿**：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test src/history-store-gate.test.ts`、`node scripts/test-debt-gate.mjs` 与全量 `code_gates`。

## 最近交付证明

- WI：`wi_ws_023afbb4b36b9f92`（新建页最近历史与目录 / 文件对写入、重开；`kind: feature`）
- 日期：2026-11-04
- 结果：code_gates passed（28 gates，attempt 001，`.munk/runs/run_ws_17c00bd2ecb15e3d/code-gates/attempts/001`；`pnpm test` 129 files / 2124 passed + 1 skipped；`test-debt-gate` 实测 `repoTestLines 47351` / `repoTestCases 1592`）。
- 覆盖摘要：`historyHome.tsx` + `historyHomeModel.ts` 落地空态历史区（类型 / 路径 `title` + `truncate` / 本地化时间 / 重开 / 移除 / busy 禁用）与纯 helper；`Workbench` 接读一次、`historyReady` 闸门后异步写入、写失败只回滚列表、目录 `freshCache` 重开（扫描前后 `evictUnderRoots`）、文件重开重读并还原开关、同身份 upsert 置顶、失败仅通用提示；`WorkbenchSession.historyId` 让开关回写精确落到当前会话那一条；`StateView` 增加 `extra` 槽位承载历史区，三 CTA 不变。
- 后续注意：① 历史区只在空态渲染，任何会话存在时不读列表，后续「侧栏常驻历史」是另一形态需先改本域范围；② `historyId` 会在换侧文件 / 换对后清空，新增会话变换路径必须同样清空，否则开关会写到旧条目；③ 重开的目录缓存失效依赖 `directoryRootsOf` 的根集合，新增挂载方式时要同步扩展。
