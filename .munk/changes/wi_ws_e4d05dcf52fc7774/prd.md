# 坏路径、上限与清空的用户安全收口

## 范围

本项只做「历史重开 / 历史维护」的安全收口，接在前三个已交付子项（`comparison-history` 纯模型、`history-home` 新建页历史、`merge-session` + 三向历史）之上，不新增存储模型、不改对比与合并语义。

1. **三类会话重开前逐侧预检**
   - `directory` 条目的两侧必须是仍存在、可列出的目录；`file` / `merge` 条目的每一侧必须是仍存在、可探测的文件。
   - 预检失败即停在历史区，**不调用**任何会话构建器（`runSidesCompare` / `openFilePair` / `openMergeRequest`），因此不建 tab、不建半棵目录树、不出现扫描 / 摘要进度条、不残留四态图例与差异计数。
   - 预检通过后才进入既有重开主链路（原有 `freshCache` / 重读 / 开关还原 / 复用 tab id 行为不变）。
2. **稳定错误类别 + 就地提示（en / zh-CN 成对）**
   - 错误类别固定三档，作为持久化码：`missing`（路径已删除 / 不存在）、`unreadable`（探测或列目录被拒）、`type-changed`（目录变文件或文件变目录）。
   - 逐侧判定顺序与既有 `mergeRequest` 口径一致：先探测存在 / 类型，再判目录可列；同一条目多侧都坏时报“路径顺序最靠前的那一侧”。
   - 提示是历史区内的可读提示（复用工作台既有 notice 区 `role="alert"`），文案随当前语言本地化，包含该侧的本地化标签（目录 / 文件对：左 / 右；三向：base / ours / theirs），**不含任何真实绝对路径**，也不直接展示平台 / core 的原始错误句。
3. **条目 persisted error**
   - 失败时把该条 `error` 置为上述稳定码并用既有 `writeComparisonHistory` 写回；其它条目字段与相对顺序不变。
   - 失败条目在行内显示对应错误的本地化标记，且**仍可重开、仍可移除**；移除只删除该条。
   - 路径修复后重开成功：新 tab 出现、该条 `error` 被清除（写回后读回不含 `error`）、条目置顶且 `id` 与条目数不变。
4. **显式「清空历史」**
   - 历史区提供显式清空动作；首击进入确认态，二次点击才执行，不使用系统 `confirm` / `alert`。
   - 执行后调用既有 `clearComparisonHistory()` 并写回空清单（`{ version: 1, entries: [] }`）；历史区整块消失，重启（重新挂载）读回仍为空。
   - 清空只作用于历史清单本身，不改 `settings.json`、不写其它 localStorage 键、不删 / 关闭任何已打开会话。
5. **上限 20 最近优先，三类同一规则**
   - 渲染与写回都沿用模型既有的「`createdAt` 降序 + 裁剪到 `COMPARISON_HISTORY_LIMIT`」；本项负责补齐可断言证据：混合三类 25 条时渲染恰 20 行、保留最近 20 条、丢弃最旧 5 条（可跨类型，不按类型分别截断）；列表已满时新身份写入后写回仍是 20 条且新条在首位。
6. **隐私回归**
   - 失败重开、错误标记写回、移除、清空、超上限全过程：renderer console 与历史相关日志均不出现任一侧真实绝对路径，日志最多出现条目数与条目 `id`。
7. **renderer 截图 provenance 合规**
   - 本项改 `src/renderer/**`，按仓库既有硬门在提交 renderer 改动后重建 README 截图并重钉 `docs/screenshots.md`（captured commit + 两图 sha256）。这是既有 gate 的合规步骤，不是本项验收项。

## 验收标准

- ac-preflight-directory-missing: 删除目录条目一侧的真实路径后重开：tab 数不变（0 个新 tab）、无 `role="status"` 扫描进度、无四态图例节点、无差异计数节点；出现一条本地化失败提示；写回端口读回该条 `error === 'missing'`。
- ac-preflight-file-missing: 删除文件对条目一侧后重开：不建 tab、不出现四态 / 差异计数、提示为本地化的“缺失”类；该条 `error === 'missing'`。
- ac-preflight-merge-missing: 删除三向条目某一侧后重开：不建 tab、不出现三栏合并视图、不出现冲突块计数；该条 `error === 'missing'`。
- ac-preflight-type-changed: 目录条目一侧被替换成文件（文件对条目一侧被替换成目录）后重开：提示属于“类型变化”类别而非“缺失”，tab 数不变、无进度与四态残留；该条 `error === 'type-changed'`。
- ac-preflight-unreadable: 经包装后的 `PlatformPort` 让文件侧 `statPath`（目录条目则让根 `listDirectory`）抛错后重开：提示属于“不可读”类别，tab 数不变、无进度与四态残留；该条 `error === 'unreadable'`。
- ac-preflight-first-failing-side: 三向条目继续按 base → ours → theirs 判定：仅 `ours` 缺失时提示的侧标签为本地化的 ours；`base` 与 `ours` 同时缺失时提示指向 base。提示文本不含任何真实绝对路径。
- ac-error-i18n-paired: 同一类别错误在 `zh` 与 `en` 下渲染出各自语言的可读文案（不等于消息键、两者互不相同）；三类错误（缺失 / 不可读 / 类型变化）在两种语言下都互不相同。
- ac-error-row-badge: 失败条目行带 `data-history-error` 属性且值为该稳定码，并显示对应错误的本地化短标记；该行的「重开」「移除」仍可点击。
- ac-error-remove: 移除一个 `error` 条目后该行消失、其余条目逐字段与相对顺序不变、写回端口不再包含该 `id`；重新挂载后该条仍不存在。
- ac-error-cleared-on-success: 把已失败的条目路径修复后重开：新 tab 出现且会话为 ready，该条 `error` 从写回端口读回后不存在，条目数不变、该条位于首行。
- ac-error-write-failure-scoped: 让 `writeComparisonHistory` 对错误标记写回 reject：不抛未捕获异常、无阻塞错误弹层、tab 数不变，界面列表仍可继续操作。
- ac-clear-writes-empty: 首击「清空历史」只进入确认态（清单不变、端口内容不变）；二次点击后历史区整块消失、端口读回 `[]`、Web 运行时历史键解析为 `{ "version": 1, "entries": [] }`。
- ac-clear-restart-empty: 清空后重新挂载工作台：历史标题、历史行与任何历史动作都不渲染，端口读回仍为 `[]`。
- ac-clear-no-system-confirm: 清空全过程不调用 `window.confirm` / `window.alert`；不出现系统模态。
- ac-cap-20-mixed-kinds: 预置 25 条（`directory` / `file` / `merge` 混排、`createdAt` 互不相同）后挂载：渲染恰 20 行，且保留集合恰为按 `createdAt` 降序的前 20 条；被丢弃的 5 条是最旧的 5 条（判定时三类同权，不出现“某类型被整体清空”）。
- ac-cap-write-trims: 列表已满 20 条时建立 / 重开一个新身份（`createdAt` 更大）：写回端口仍恰 20 条、新条在首位、被挤掉的是原最旧一条。
- ac-success-path-intact: 路径健康时三类重开仍成功：目录出现真实扫描进度并进入 ready、文件与三向重新读取磁盘内容、条目开关逐项还原、同身份重开不新增条目，且条目上没有残留 `error`。
- ac-no-path-in-console: 上述失败、错误标记、移除、清空、超上限全过程捕获 renderer console 与历史日志：输出中不出现任一侧真实绝对路径。

## 非目标

- **不改**历史 schema / 信封字段 / `PlatformPort` 通道 / preload 白名单 / Electron 主进程读写实现；本项只消费既有 `readComparisonHistory` / `writeComparisonHistory` 与既有纯函数。
- **不改**对比 / 合并语义、四态口径、快照格式、导出内容、版本号、发布面文件；不新增 npm 依赖、颜色 / 图标包、第三方列表库。
- 不为目录做递归可读性检查、不在预检阶段读取文件正文 / 计算哈希；预检只到「存在 / 类型 / 根可列」一层，深层 IO 失败仍走既有失败路径。
- 不做上限配置项、不做“最多 20 条”提示文案、不做最近文件 / 收藏夹 / 路径补全 / 右键菜单 / 拖拽排序 / 批量操作。
- 不做侧栏常驻历史（历史区仍只在空态渲染）、不改空态三个 CTA 的内容与顺序、不引入样本 / demo 入口。
- 不做浏览器 / 设备 / 桌面 GUI 验收；截图重建与 `docs/screenshots.md` 重钉是既有 gate 合规步骤，不写成验收项。
- 不加长 `src/renderer/src/App.test.tsx`（其行数上限只降不升），不整文件重写既有测试，不为凑绿放宽门禁。

## 实现约束

- **预检归属**：新增纯函数模块 `src/shared/history/preflight.ts`（或同目录等价命名），输入为 `resolveComparisonHistoryReopen` 成功后的 `{ kind, paths }` 与既有 `PathProbe` 缝（`PlatformPort.statPath`），输出 `{ ok: true }` 或 `{ ok: false, reason, side }`（`reason` 取 `'missing' | 'unreadable' | 'type-changed'`，`side` 为 0 基路径下标）。目录侧在类型判定通过后追加一次 `listDirectory` 证明根可列（结果丢弃），不新增平台方法。
- **持久化码固定**：`error` 只存 `'missing'` / `'unreadable'` / `'type-changed'`（与 `src/shared/history/model.ts` 既有 `markComparisonHistoryError` 契约一致），不存路径、不存原始 error message。
- **文件锚点**：
  - `src/shared/history/preflight.ts` + 同目录 Node 可跑测试（放 `src/shared/history/`，不进 `src/core/**`，避免撞覆盖率地板）；
  - `src/renderer/src/workbench/Workbench.tsx`：`reopenHistoryEntry` 在 `resolveComparisonHistoryReopen` 之后、调用任何构建器之前插入预检；失败走 `report(copyNotice(...))` + `applyHistoryWrite(markError)`；成功清错；新增 `clearHistory` 编排（`clearComparisonHistory()` + `persistHistory`）；
  - `src/renderer/src/workbench/historyHome.tsx`：行内错误标记（`data-history-error`）与清空动作（含确认态）；
  - `src/renderer/src/workbench/historyHomeModel.ts`：错误类别 → 提示 / 标记消息键映射、按 `kind` 取侧标签、`withHistoryError(entries, id, code | null)`（无变化时返回同一数组，避免多余写回）；
  - `src/renderer/src/i18n/messages/{zh,en}/shell.ts`：成对新增文案（占位符一致，键名沿用 `shell.history.*` 前缀）。
- **复用不重造**：读取 / 裁剪 / 移除 / 清空 / 错误标记 / 重开入参解析一律用 `src/shared/history/model.ts` 既有函数；renderer 不新增第二份解析、排序或上限常量。
- **失败不触碰会话**：预检失败分支不得调用 `runSidesCompare` / `openFilePair` / `openMergeRequest`，不得 `setComparisonSwitches`，不得改动 `sessions` / `activeId` / 其它历史条目。
- **提示不泄露路径**：错误提示只用 i18n 文案 + 侧标签；不拼 `entry.paths`、不拼 `error.message`；行内路径展示沿用既有 `truncate` + `title`，不新增打印。
- **清空交互**：确认态为行内二次点击（按钮文案切换），不使用 `window.confirm`；确认态在清单变化或区块卸载时复位。
- **测试落位**：DOM 断言放新文件 `src/renderer/src/workbench/historySafety.dom.test.tsx`（可追加少量最必要的断言到 `historyHome.dom.test.tsx`），复用其既有 `captureConsole` / `memoryPort` / `seedEntry` 范式；不可读分支用包装 `PlatformPort`（覆写指定路径的 `statPath` / `listDirectory`）构造，不用内置样本冒充。
- **`test-debt`**：新增用例后运行 `node scripts/test-debt-gate.mjs` 取实测值，追加 `growth` 条目（`metric: repoTestLines`）并把 `floors.repoTestCases` 上调到实测值；数字由脚本跑出，不手抄，`ceilings` 不得无 `growth` 地抬高。
- **截图合规（必做，易漏）**：本项改 `src/renderer/**`，`src/main/release-artifacts-and-brand.test.ts` 要求 `docs/screenshots.md` 记录的 captured commit 是 HEAD 祖先且自该 commit 起 `src/renderer` 零 diff。顺序：先提交 renderer 改动 → 在该干净树上 `pnpm build && node scripts/capture-readme-screenshots.mjs` → 用产出的两个 sha256 与渲染器提交 sha 更新 `docs/screenshots.md`。前三个子项都在此步返工过，请在编码阶段末尾而非合并阶段完成。
- **门禁自绿**：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test src/history-store-gate.test.ts`、`node scripts/test-debt-gate.mjs`，以及全量 `.munk/code-gates.json`（本项不新增 gate 行；既有 `history-store` gate 如有必要只追加断言）。
