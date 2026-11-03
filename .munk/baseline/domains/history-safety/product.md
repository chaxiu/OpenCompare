# Domain: history-safety

对比历史在「坏路径 / 上限 / 清空」上的用户安全收口：重开前逐侧预检，失败以稳定错误码就地提示并持久化到条目，显式二次确认清空历史，并补齐 20 条上限的三类混排证据。本域只消费 `comparison-history` 的模型与读写通道、只扩 `history-home` 的界面编排，不新增存储模型、不改对比 / 合并语义。

## 范围

- **重开前逐侧预检**：`directory` 条目两侧须是仍存在、可列出的目录；`file` / `merge` 条目每侧须是仍存在、可探测的文件。预检在 `resolveComparisonHistoryReopen` 之后、任何会话构建器（`runSidesCompare` / `openFilePair` / `openMergeRequest`）之前。失败即停在历史区：不建 tab、不建目录树、不出现扫描 / 摘要进度、不残留四态图例与差异计数。通过后才进既有重开主链路（`freshCache` / 重读 / 开关还原 / tab 复用不变）。
- **稳定错误类别与就地提示**：错误码固定三档 `missing`（不存在 / 已删除）、`unreadable`（探测或列目录被拒）、`type-changed`（目录变文件或反之）。逐侧判定顺序与 `mergeRequest` 一致：先存在 / 类型，再根可列；一条目多侧皆坏时报路径顺序最靠前的那一侧（三向为 base → ours → theirs）。提示复用工作台既有 notice 区（`role="alert"`），文案按当前语言本地化并含该侧本地化标签（目录 / 文件对：左 / 右；三向：base / ours / theirs），**不含真实绝对路径**、不展示平台 / core 原始错误句。
- **条目持久化 error**：失败时把该条 `error` 置为稳定码并经 `writeComparisonHistory` 写回，其它条目字段与相对顺序不变。失败条目行内显示对应错误的本地化短标记（`data-history-error`），且仍可重开、仍可移除；移除只删该条。路径修复后重开成功则清除该条 `error`（写回后读回不含 `error`），条目置顶、`id` 与条目数不变。
- **显式清空历史**：历史区提供清空动作，首击进入行内确认态（按钮文案切换），二次点击才执行，不使用系统 `confirm` / `alert`。执行后走既有 `clearComparisonHistory()` 并写回 `{ version: 1, entries: [] }`；历史区整块消失，重新挂载读回仍为空。清空只作用于历史清单：不改 `settings.json`、不写其它 localStorage 键、不删 / 不关闭已打开会话。
- **上限 20 最近优先**：渲染与写回都沿用模型既有「`createdAt` 降序 + 裁剪到 `COMPARISON_HISTORY_LIMIT`」；本域负责可断言证据：混合三类 25 条时恰 20 行、保留最近 20、丢弃最旧 5（跨类型同权，不按类型分别截断）；列表已满时新身份写入后仍 20 条且新条在首位。
- **隐私回归**：失败重开、错误标记写回、移除、清空、超上限全过程，renderer console 与历史日志不出现任一侧真实绝对路径，最多出现条目数与条目 `id`。

## 验收

- **ac-preflight-directory-missing**：删除目录条目一侧真实路径后重开：tab 数不变（0 新 tab）、无 `role="status"` 扫描进度、无四态图例节点、无差异计数节点；出现一条本地化失败提示；写回端口读回该条 `error === 'missing'`。
- **ac-preflight-file-missing**：删除文件对条目一侧后重开：不建 tab、无四态 / 差异计数、提示为本地化「缺失」类；该条 `error === 'missing'`。
- **ac-preflight-merge-missing**：删除三向条目某一侧后重开：不建 tab、不出现三栏合并视图、不出现冲突块计数；该条 `error === 'missing'`。
- **ac-preflight-type-changed**：目录条目一侧被换成文件（文件对一侧被换成目录）后重开：提示属「类型变化」而非「缺失」，tab 数不变、无进度与四态残留；该条 `error === 'type-changed'`。
- **ac-preflight-unreadable**：包装后的 `PlatformPort` 让文件侧 `statPath`（目录条目则让根 `listDirectory`）抛错后重开：提示属「不可读」类，tab 数不变、无进度与四态残留；该条 `error === 'unreadable'`。
- **ac-preflight-first-failing-side**：三向按 base → ours → theirs 判定：仅 `ours` 缺失时提示侧标签为本地化 ours；`base` 与 `ours` 同时缺失时指向 base。提示文本不含任何真实绝对路径。
- **ac-error-i18n-paired**：同一类别错误在 `zh` 与 `en` 下渲染各自语言可读文案（不等于消息键、两者互不相同）；三类错误在两种语言下都互不相同。
- **ac-error-row-badge**：失败条目行带 `data-history-error` 且值等于稳定码，并显示对应错误的本地化短标记；该行「重开」「移除」仍可点击。
- **ac-error-remove**：移除一个带 `error` 的条目后该行消失、其余条目逐字段与相对顺序不变、写回端口不再含该 `id`；重新挂载后该条仍不存在。
- **ac-error-cleared-on-success**：修复已失败条目路径后重开：新 tab 出现且会话 ready，写回端口读回该条无 `error`，条目数不变且该条位于首行。
- **ac-error-write-failure-scoped**：让 `writeComparisonHistory` 对错误标记写回 reject：不抛未捕获异常、无阻塞错误弹层、tab 数不变，界面列表仍可继续操作。
- **ac-clear-writes-empty**：首击清空只进确认态（清单与端口内容不变）；二次点击后历史区整块消失、端口读回 `[]`、Web 运行时历史键解析为 `{ "version": 1, "entries": [] }`。
- **ac-clear-restart-empty**：清空后重新挂载工作台：历史标题、历史行与任何历史动作都不渲染，端口读回仍为 `[]`。
- **ac-clear-no-system-confirm**：清空全过程不调用 `window.confirm` / `window.alert`，不出现系统模态。
- **ac-cap-20-mixed-kinds**：预置 25 条（`directory` / `file` / `merge` 混排、`createdAt` 互不相同）后挂载：渲染恰 20 行，保留集合恰为 `createdAt` 降序前 20，丢弃最旧 5 条，三类同权、无某类型被整体清空。
- **ac-cap-write-trims**：列表已满 20 条时建立 / 重开一个新身份（`createdAt` 更大）：写回端口仍恰 20 条、新条在首位、被挤掉的是原最旧一条。
- **ac-success-path-intact**：路径健康时三类重开仍成功：目录出现真实扫描进度并 ready、文件与三向重读磁盘内容、条目开关逐项还原、同身份重开不新增条目，且条目无残留 `error`。
- **ac-no-path-in-console**：失败、错误标记、移除、清空、超上限全过程捕获 renderer console 与历史日志，不出现任一侧真实绝对路径。

## 非目标

- 不改历史 schema / 信封字段 / `PlatformPort` 通道 / preload 白名单 / Electron 主进程读写实现；本域只消费既有 `readComparisonHistory` / `writeComparisonHistory` 与既有纯函数，不新增第二份解析、排序或上限常量。
- 不改对比 / 合并语义、四态口径、快照格式、导出内容、版本号、发布面文件；不新增 npm 依赖、颜色 / 图标包、第三方列表库。
- 不做目录递归可读性检查，不在预检阶段读文件正文 / 算哈希；预检只到「存在 / 类型 / 根可列」一层，深层 IO 失败仍走既有失败路径。
- 不做上限配置项、不做「最多 20 条」提示文案；不做最近文件 / 收藏夹 / 路径补全 / 右键菜单 / 拖拽排序 / 批量操作。
- 不做侧栏常驻历史（历史区仍只在空态渲染）；不改空态三个 CTA 的内容与顺序；不引入样本 / demo 入口。
- 不做浏览器 / 设备 / 桌面 GUI 验收；截图重建与 `docs/screenshots.md` 重钉是仓库既有 gate 的合规步骤，不写成验收项。
- 不加长 `src/renderer/src/App.test.tsx`（行数上限只降不升），不整文件重写既有测试，不为凑绿放宽门禁。

## 实现约束

- **预检归属**：纯函数模块 `src/shared/history/preflight.ts`，输入为 `resolveComparisonHistoryReopen` 成功后的 `{ kind, paths }` 与既有 `PathProbe` 缝（`PlatformPort.statPath`），输出 `{ ok: true }` 或 `{ ok: false, reason, side }`（`reason` 取三档稳定码，`side` 为 0 基路径下标）。目录侧在类型判定通过后追加一次 `listDirectory` 证明根可列（结果丢弃），不新增平台方法。
- **持久化码固定**：`error` 只存 `'missing'` / `'unreadable'` / `'type-changed'`（与 `src/shared/history/model.ts` 既有 `markComparisonHistoryError` 契约一致），不存路径、不存原始 error message。
- **文件锚点**：`src/shared/history/preflight.ts` + 同目录 Node 可跑测试（放 `src/shared/history/`，不进 `src/core/**`，避免撞覆盖率地板）；`src/renderer/src/workbench/Workbench.tsx`（`reopenHistoryEntry` 在解析后、任何构建器之前插预检；失败走 `report(copyNotice(...))` + `applyHistoryWrite(markError)`，成功清错；新增 `clearHistory` 编排）；`historyHome.tsx`（行内 `data-history-error` 标记与清空动作含确认态）；`historyHomeModel.ts`（错误类别 → 提示 / 标记消息键、按 `kind` 取侧标签、`withHistoryError(entries, id, code | null)` 无变化返回同一数组）；`i18n/messages/{zh,en}/shell.ts` 成对新增 `shell.history.*` 文案。
- **复用不重造**：读取 / 裁剪 / 移除 / 清空 / 错误标记 / 重开入参解析一律用 `src/shared/history/model.ts` 既有函数。
- **失败不触碰会话**：预检失败分支不得调用任何构建器、不得 `setComparisonSwitches`、不得改动 `sessions` / `activeId` / 其它历史条目。
- **提示不泄露路径**：错误提示只用 i18n 文案 + 侧标签，不拼 `entry.paths`、不拼 `error.message`；行内路径展示沿用既有 `truncate` + `title`，不新增打印。
- **清空交互**：确认态为行内二次点击（按钮文案切换），清单变化或区块卸载时复位。
- **测试落位**：DOM 断言放 `src/renderer/src/workbench/historySafety.dom.test.tsx`（可向 `historyHome.dom.test.tsx` 追加最必要断言），复用既有 `captureConsole` / `memoryPort` / `seedEntry` 范式；不可读分支用包装 `PlatformPort` 构造，不用内置样本冒充。
- **`test-debt`**：新增用例后跑 `node scripts/test-debt-gate.mjs` 取实测值，追加 `growth`（`metric: repoTestLines`）并把 `floors.repoTestCases` 上调到实测值；`ceilings` 不得无 `growth` 地抬高。
- **门禁自绿**：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test src/history-store-gate.test.ts`、`node scripts/test-debt-gate.mjs` 与全量 `code_gates`；本域不新增 gate 行。

## 最近交付证明

- WI：`wi_ws_e4d05dcf52fc7774`（坏路径 / 上限 / 清空的历史安全收口；`kind: feature`）
- 日期：2026-11-04
- 结果：code_gates passed（28 gates，attempt 001，`.munk/runs/run_ws_b4e9cb4760f2accc/code-gates/attempts/001`；`pnpm test` 134 files / 2162 passed + 1 skipped；`test-debt-gate` 实测 `repoTestLines 48335` / `repoTestCases 1630`，新增 21 例）。
- 覆盖摘要：新增 `src/shared/history/preflight.ts` 纯函数（三档稳定码 + 0 基失败侧 + 目录根可列校验）与 `preflight.test.ts`；`Workbench.reopenHistoryEntry` 在解析后插入预检，失败只发本地化 notice + `markError` 写回，成功清错，新增 `clearHistory` 编排；`historyHome.tsx` 落地 `data-history-error` 行内标记与行内二次确认清空；`historyHomeModel.ts` 增错误码 → i18n 键映射、按 `kind` 取侧标签、`withHistoryError` 无变化原数组返回；`zh` / `en` `shell.history.*` 成对扩容；`historySafety.dom.test.tsx` 覆盖缺失 / 不可读 / 类型变化拒绝、提示与标记本地化、写失败作用域、错误移除与成功清错、清空二次确认与重启读空、三类混排 20 条上限与写回裁剪、console 无路径。
- 后续注意：① 预检只做一层（存在 / 类型 / 根可列），深层 IO 失败仍走既有会话内失败路径，别在此处补递归检查；② `error` 是持久化稳定码而非消息，新增类别必须同时扩 shared 契约与 `zh` / `en` 文案，否则行内标记会退化为键名；③ 清空确认态靠清单变化 / 卸载复位，新增历史交互入口时若复用该按钮需保证同样复位；④ `App.test.tsx` 行数上限只降不升，新增 DOM 证据继续放独立测试文件。
