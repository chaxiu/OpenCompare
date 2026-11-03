# 新建页最近历史与目录 / 文件对写入、重开

## 范围

把上一波已落地的「对比历史纯模型 + PlatformPort 持久化通道」接到工作台：新建页（无会话的工作台空态，`status === 'empty'`）展示最近历史，真实目录 / 文件对建立后写入，点一下按原类型 / 原路径 / 原三项开关重开，可单条移除。本项不新增历史模型、不新增第三种会话入口。

1. 新建页历史区（工作台空态）
   - 只在 `status === 'empty'` 且读回的条目数 > 0 时渲染；0 条时整个历史区不出现（无标题、无空占位、无「清空」）。
   - 顺序与数量直接来自模型：`createdAt` 最近优先，最多 `COMPARISON_HISTORY_LIMIT = 20` 条；renderer 不再排序、不再裁剪、不再二次校验。
   - 每行显示：类型（`directory` / `file`；`merge` 保留文案供后续波次）、路径文本（两侧用现有 `↔` 连接，元素 `title` 为完整未省略文本、视觉上 `truncate` 省略）、时间（随当前语言，日期 + 时分）。
   - 每行两个动作：「重开」「移除」。读取失败（`readComparisonHistory` reject）按空清单处理，不弹阻塞错误、不重复重试。
2. 建立后写入
   - 真实目录对建立成功（`runSidesCompare` 成功且两侧都是真实目录根）→ `kind: 'directory'`、`paths: [left, right]`、`createdAt = Date.now()`、三项开关取当前 shell 开关。
   - 真实文件对建立成功（`openFilePairSession` 成功）→ `kind: 'file'`、`paths: [left, right]`、其余同上。
   - 身份 = `kind` + 有序路径；重复建立复用同一条目与同一 `id`，只刷新时间 / 开关并移到最前。
   - 写入失败（`writeComparisonHistory` reject）只丢本次历史写入：会话照常建立、tab 照常出现，历史列表保持写前状态，不抛未捕获异常。写入在会话提交之后异步发出，不进入扫描 / 读取的关键路径。
3. 一键重开
   - 先用 `resolveComparisonHistoryReopen` 把条目解析成 `{ kind, paths, switches }`；解析失败只报本地化通用失败提示，不建 tab。
   - 目录：用 `directorySides(left, right)` 走既有 `runSidesCompare`（保留扫描进度条与取消），**不得**用 `snapshotSide` / 快照挂载；扫描用**全新的** `createComparisonCache()`，并清掉共享缓存中这两侧的旧条目，保证同大小同 mtime 的内容改动也能被重新判定。
   - 文件对：走既有 `openFilePairSession` 重新探测并读取两侧（含 probe facts），再应用条目里的三项开关。
   - 两种类型在重开时都把 shell 的三项开关设为条目值（重启后 shell 已回到默认值，必须逐项还原）。
   - 成功后条目 `createdAt` 刷新、移到最前、条目数与 `id` 不变；tab 复用路径派生的稳定 id（已是 `directory:…` / `file:…`），不出现第二个同路径 tab。
   - 失败（路径已删除、不可读、类型变化）：不建 tab、不改当前会话、不改其它条目；只出一条不含绝对路径的本地化提示。
4. 单条移除
   - 「移除」删除该条并写回（`removeComparisonHistoryEntry` + `writeComparisonHistory`）；其它条目内容与相对顺序不变；删掉最后一条后历史区整块消失。
5. 开关快照同步
   - 文件会话激活时切换三项开关 → 只更新该会话对应条目的开关（同 `id`、条目数不变、`createdAt` 不变）。
   - 无历史归属的会话（内置样本、下钻文件、快照导入）切换开关不写任何条目；切换 tab 后再切换，只影响当前活动会话的那一条。
6. i18n
   - 所有新增可见文案（历史标题、类型、时间前缀如无、重开、移除、重开失败、无障碍名称）在 `zh` / `en` 成对加入 `shell.ts`，占位符一致；代码里不写中文可见字面量。
   - 空态三个 CTA 的内容与顺序保持不变，零 demo 口径不变。

## 验收标准

- ac-home-visible-only-with-entries: 空态读回 ≥1 条时历史区可见且能读到每条的完整路径与时间；读回 0 条时页面上不存在历史标题、历史行与任何历史动作。
- ac-home-order-and-cap: 历史行顺序与 `createdAt` 降序一致；预置 25 条时只渲染 20 行，且保留的是 `createdAt` 最大的 20 条。
- ac-home-row-content: 每行渲染类型文案 + 路径文本 + 时间；路径文本元素 `title` 等于两侧真实绝对路径按 `↔` 连接的完整串，且带 `truncate` 类。
- ac-home-time-localized: 行内时间文本等于时间格式化纯函数对同一条目 `createdAt` 的输出；同一 timestamp 在 `zh` 与 `en` 下输出不同，且都包含日期与时分。
- ac-write-directory-establish: 真实临时目录对建立成功后，历史恰新增 1 条 `kind: 'directory'`，`paths` 与两侧真实根逐项相等，三项开关等于建立时的 shell 开关。
- ac-write-file-establish: 真实临时文件对建立成功后，历史恰新增 1 条 `kind: 'file'`，`paths` 逐项相等，三项开关等于建立时的 shell 开关。
- ac-write-excluded-sources: 内置样本场景、内置 remote snapshot 样本、快照导入、目录树下钻打开的文件、sync 刷新、失败或取消的建立，条目数都不变。
- ac-write-failure-nonblocking: 让 `writeComparisonHistory` reject 后建立真实目录 / 文件对，tab 仍出现、状态仍 ready、历史列表仍等于写前条目，且无未捕获异常 / 无阻塞错误弹层。
- ac-reopen-directory-rescan: 目录对建立后关闭全部 tab 并重新挂载工作台，点重开出现 `role="status"` 的目录扫描进度并最终进入 ready；同大小、同 mtime 但内容被改写的文件在重开后计入差异（旧哈希缓存未被复用）。
- ac-reopen-directory-real-roots: 目录重开后会话副标题含两侧真实根、两侧都是真实目录根（无快照挂载）；重开前后 tab 的 `data-session-tab` 值相同。
- ac-reopen-file-reread-switches: 文件对建立后关闭并重新挂载（shell 开关回默认），磁盘内容改写后重开：两侧内容等于磁盘最新内容，三项开关逐项等于条目值（覆盖非默认组合）。
- ac-reopen-same-identity: 同路径重开：条目数不变、条目 `id` 不变、该条 `createdAt` 变大并位于首行；再经拖入 / 对话框打开同一对时 tab 数仍为 1，`data-session-tab` 不变。
- ac-reopen-failure-restrained: 删除一侧路径后重开：tab 数不变、历史条目数与内容字段不变、出现一条 zh / en 成对的失败提示，且该提示文本不含任何真实绝对路径。
- ac-remove-entry: 点「移除」后该条消失、其它条目字段与相对顺序不变，且重新挂载后仍不存在；移除最后一条后历史区不渲染。
- ac-switch-sync-active-entry: 文件会话激活时切换三项开关，条目数不变、`id` 不变、该条开关更新、`createdAt` 不变；重新挂载后重开应用的是更新后的开关。
- ac-switch-sync-isolated: 在内置样本会话（无历史归属）切换开关不新增也不改动任何条目；先打开 A 再切到 B 后切换开关，只有 B 的条目变化，A 条目逐字段不变。
- ac-i18n-paired: 新增可见文案在 `zh` / `en` 键集与占位符完全成对（既有 `messages.test.ts` 键集断言通过），zh 文案不是英文原样复制。
- ac-empty-cta-unchanged: 空态仍是「新建对比 / 打开文件 / 打开文件夹」三个 CTA、顺序与文案不变，不出现任何内置样本或 demo 入口。
- ac-no-path-in-console: 建立、重开、失败、移除全过程捕获 renderer console，输出中不出现任一侧真实绝对路径。

## 非目标

- 不清空历史（无「清空」动作、无二次确认），不做上限提示文案，不做坏路径预检 UI 与条目 `error` 标记 / 展示（属下一波 `history-safety`）。
- 不做真实三向合并入口、`NewCompareDialog` 三向模式、`merge` 类条目的写入与重开（后续波次；本波不可能产生 `merge` 条目）。
- 不落盘对比结果、目录树、四态计数、文件正文、哈希 / 快照 / 摘要；不缓存历史读回结果，不新增第二套存储抽象。
- 不改 `src/core/**`、对比 / 合并语义、四态口径、快照格式、导出内容、发布面文件与版本号；不改 `settings.json` 契约。
- 不改 `src/renderer/src/workbench/NewCompareDialog.tsx` 结构与既有引导流；不做最近文件 / 收藏夹 / 路径补全 / 右键菜单 / 拖拽排序 / 批量操作。
- 不新增 npm 依赖，不新增颜色 / 图标包，不新增 `.munk/code-gates.json` gate 行（新断言随既有 `test` gate，`history-store` gate 断言不改动除非必须追加）。
- 不做浏览器 / 设备 / 桌面 GUI 验收；`docs/screenshots.md` 的重钉是仓库既有 gate 的合规步骤，不是本项的验收项。

## 实现约束

- 复用而不重造：读取 / 去重 / 裁剪 / 移除 / 重开入参解析一律调用 `src/shared/history/model.ts` 既有函数，renderer 里不写第二份解析或排序；类型从 `@shared/history` 取。
- 文件锚点：
  - `src/renderer/src/workbench/Workbench.tsx`：空态接历史区、建立后写入、重开编排、移除、开关回写；
  - 新增历史渲染与编排模块放在 `src/renderer/src/workbench/`（例如 `historyHome.tsx` + `historyHome.test.tsx` / `historyHome.dom.test.tsx`），把「建立 → 条目入参」「重开计划」「时间格式化」「开关回写」抽成可纯函数或 jsdom 直测的 helper，不在 `Workbench` 内联判定；
  - `src/renderer/src/workbench/session.ts`：`WorkbenchSession` 增加可选 `historyId`，供开关回写精确指向条目（不改既有字段语义）；
  - `src/renderer/src/i18n/messages/{zh,en}/shell.ts`：成对新增文案。
- 写入归属：在真实建立成功分支显式记录，**不要**放进 `loadSampleSessions` / `loadRemoteSnapshotSample`（`runSidesCompare` 也被 remote snapshot 样本复用）/ `handleImportSnapshot` / 目录树下钻 `openFile` / sync 刷新；目录侧给 `runSidesCompare` 加显式「记录历史」入参，只有真实入口传 true。
- 目录重开必须是全新缓存：`createComparisonCache()` 仅用于本次扫描，扫描前后对共享 `cache.current` 执行等价于 `evictUnderRoots([left, right])` 的失效，避免旧 digest 被后续操作复用；仍走 `compareSides` + `runSidesCompare` 的既有进度 / 取消通道，不自建扫描循环。
- tab id 已由路径派生（`directory:…` / `file:…`），重开只需保持路径入参一致即可复用；不要为此改写 id 生成规则。
- UI 结构：历史区放在空态 `StateView` 的 CTA 区块下方（同一列布局），不改 `StateView` 的三 CTA 与 hint 语义；只用 `src/renderer/src/assets/main.css` 的 token 工具类与既有 `ToolbarButton`（`size="sm"` / `variant="ghost"`），路径文本用 `font-mono` + `truncate` + `title`；不写死颜色 / 尺寸。
- 时间：单一纯函数 `formatHistoryTime(createdAt, language)`（`Intl.DateTimeFormat`，日期 + 时分，随 `zh-CN` / `en`），UI 与测试共用同一来源；不得在组件内另写一套格式化。
- 隐私：不打印历史 payload；失败提示只用 i18n 通用文案（不拼 `error.message`、不拼路径）；renderer console 不出现真实路径。
- 测试落位：新 DOM 断言放新文件（`src/renderer/src/workbench/historyHome.dom.test.tsx` 等），**不要加长 `src/renderer/src/App.test.tsx`（其 2959 行上限只降不升）**；真实磁盘证据复用 `src/test/sharedHarness.tsx` 的 `scratchSides` / `writeStamped` / `ipcPort` 与既有 `appState.userData` 临时目录范式，不用内置样本冒充。
- 既有测试只追加 / 最小改动，不整文件重写；不为凑绿放宽门禁。
- `test-debt`：新增用例后运行 `node scripts/test-debt-gate.mjs` 取实测值，再在 `.munk/baseline/test-debt.json` 增加一条 `growth`（`metric: repoTestLines`、`from` / `to` / `reason` / `addedCases`）并把 `floors.repoTestCases` 上调到实测值；数字由脚本跑出，不手抄、`floors` 不下调。
- 截图合规：本项改 `src/renderer/**`，`src/main/release-artifacts-and-brand.test.ts` 要求 `docs/screenshots.md` 记录的 captured commit 是 HEAD 祖先且 `src/renderer` 相对它零 diff。流程：先提交 renderer 改动 → 在该干净树上 `pnpm build && node scripts/capture-readme-screenshots.mjs` → 用产出的两个 sha256 与渲染器提交 sha 更新 `docs/screenshots.md`（保留 `clean working tree` / `pnpm build` / 复现命令等既有 token，图片字节若无变化则如实改写该段描述，不虚构差异）。
- 门禁自绿：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test src/history-store-gate.test.ts`、`node scripts/test-debt-gate.mjs`，以及全量 `code_gates`。
