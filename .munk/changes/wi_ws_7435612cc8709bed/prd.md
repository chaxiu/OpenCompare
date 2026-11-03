# 对比历史纯模型与主进程持久化通道

## 范围

在 `src/shared/` 建立「对比历史」纯模型（零 Electron / DOM / Node 依赖，可在 Node 下被 vitest 直测），并把持久化能力挂到既有 `PlatformPort` 上；本期只做模型 + 通道 + 真实验证，不建任何历史界面。

1. 纯模型与纯函数
   - 会话三类：`kind: 'directory' | 'file' | 'merge'`；`directory` / `file` 两个有序绝对路径，`merge` 三个有序绝对路径（base / ours / theirs）。
   - 条目字段：不透明 `id`、`kind`、`paths`、`createdAt`（epoch ms，表示最近一次建立 / 重开）、三项开关 `ignoreWhitespace` / `ignoreNewline` / `ignoreEncoding`（boolean）、可选 `error`（稳定错误码字符串）。
   - 常量：`COMPARISON_HISTORY_LIMIT = 20`、`COMPARISON_HISTORY_VERSION = 1`；存储信封 `{ version: 1, entries: [...] }`。
   - 纯函数：解析（JSON 文本 / 任意 unknown → 清单，损坏整份回退 `[]`）、序列化、去重 upsert、按 `createdAt` 最近优先排序 + 裁剪到上限、`remove(id)`、`clear()`、`markError(id, code | null)`、开关序列化 / 反序列化往返、重开入参解析（条目 → `{ kind, paths, switches }` 或稳定错误码）。
2. 平台通道（沿用既有 `PlatformPort` 缝，不新造存储抽象）
   - `PlatformPort.readComparisonHistory()` / `writeComparisonHistory(entries)` 两个方法，读写的是**条目清单**而不是原始文本，解析与校验只有一份（shared 纯函数）。
   - Electron 主进程：`userData/comparison-history.json`，复用既有 `writeFileAtomically`（同目录临时文件 + rename，失败清理），缺失 / 不可读 / JSON 损坏 / `version` 不符 / 任一条目 schema 不符 → 读回 `[]`；写失败只拒绝本次写入，不动已有文件、不重试、不缓存。
   - Web 实现：单一 localStorage 键 + 模块级内存回退，与 Electron 同契约（损坏 → `[]`，存储不可用 → 内存记录）。
   - preload：`PLATFORM_CHANNELS` 白名单新增两个 channel 并转发。
3. 隐私与日志
   - 历史 `id` 不含任何路径原文（不含两侧 / 三侧路径的子串），同一身份重复 upsert 保持同一 `id`。
   - 主进程历史日志最多一行：`comparison-history: N entries` 或 `comparison-history write failed: <code>`；不拼路径、不打原始 error message；renderer 不打印历史 payload。

## 验收标准

- ac-history-entry-shape: `directory` / `file` 条目带 2 条有序路径、`merge` 带 3 条；每条都有 `id`、`kind`、`createdAt`、三项 boolean 开关；`error` 缺省即无错误。
- ac-history-corrupt-empty: 解析 `null` / 空字符串 / 非法 JSON / 顶层非对象 / `version` 不等于 1 / `entries` 非数组 / 任一条目字段缺失或类型不符时，返回 `[]` 且不抛异常，不做部分修复。
- ac-history-limit-20: `COMPARISON_HISTORY_LIMIT === 20`；连续 upsert 25 条不同身份后长度恰为 20，保留 `createdAt` 最大的 20 条，三类会话按同一规则参与排序（不按类型分别截断）。
- ac-history-dedupe-upsert: 相同 `kind` + 相同有序路径再次 upsert → 条目数不变、`id` 不变、`createdAt` 与三项开关被更新、该条移到首位；路径顺序不同或 `kind` 不同 → 视为新条目。
- ac-history-remove-clear: `remove(id)` 只移除该条，其余条目内容与相对顺序不变；`clear()` 得到空清单，序列化后为 `{ "version": 1, "entries": [] }`，再次解析仍为空。
- ac-history-switches-roundtrip: 三项开关经 序列化 → 解析 往返后逐项相等（覆盖全 8 种组合中的至少 4 种含全开 / 全关），且顺序与缺省值不被隐式改写。
- ac-history-reopen-args: 重开入参解析对合法目录 / 文件 / 三向条目返回 `{ kind, paths, switches }` 且 `paths` 与存储逐项相等；对路径数不符（1 或 4）、相对路径、空路径、未知 `kind` 返回 `ok: false` 与稳定错误码，且不抛异常。
- ac-history-id-opaque: 对含空格与 CJK 的真实临时路径生成条目，`id` 不含任一路径片段（路径 basename 与整串均不出现），且同一身份连续两次 upsert 的 `id` 相同。
- ac-electron-history-roundtrip: 以临时 `userData` 指向真实目录，`writeComparisonHistory` 后磁盘只有 `comparison-history.json`（无 `.tmp` 残留，无第二个文件），内容为带 `version: 1` 的信封，`readComparisonHistory` 逐字段读回相同清单。
- ac-electron-history-corrupt: 预先写入非法 JSON / 错误 `version` 的 `comparison-history.json`，`readComparisonHistory` 返回 `[]` 且不抛；已存在其它文件不受影响。
- ac-electron-write-failure-scoped: 让目标写入 / rename 失败（如只读目录或目标被目录占用），`writeComparisonHistory` 仅 reject 本次调用，磁盘上原有 `comparison-history.json` 字节不变，且无 `.tmp` 残留。
- ac-web-history-contract: Web 平台对同一清单 write → read 逐字段相等；localStorage 中放非法 JSON → read 返回 `[]`；localStorage 访问抛错时回退到最近一次成功的内存记录。
- ac-preload-history-channels: `PLATFORM_CHANNELS` 含两个新 channel，preload 以 `ipcRenderer.invoke` 转发同名 channel（测试断言 channel 名与转发参数），且未越出白名单。
- ac-history-logs-no-paths: 捕获主进程 read 成功 / read 损坏 / write 成功 / write 失败四条路径的日志与 renderer console，输出中不含任何路径子串，且只出现 `comparison-history: N entries` 与 `comparison-history write failed: <code>` 两种形态。
- ac-history-gate-wired: `.munk/code-gates.json` 新增单 argv gate `history-store`（`pnpm test src/history-store-gate.test.ts`，`cwd: "."`），`src/munk-gates.test.ts` 的期望矩阵（条数 / 顺序 / 命令）同步，模板门切片与末两位 `verify-release-gate` / `test-debt-gate` 位置不变。

## 非目标

- 不做历史列表界面、空态文案、重开 / 移除 / 清空按钮、i18n 文案、时间格式化（属后续 UI 子项）。
- 不做会话建立后的历史写入编排、重开预检（`statPath` 可读性 / 类型判定）、切开关回写活动会话快照（属后续 UI 子项）。
- 不做真实三向合并入口、`NewCompareDialog` 三向模式、`session.historyId` 接线。
- 不落盘对比结果、目录树、四态计数、文件正文、哈希 / 快照 / 摘要；不缓存历史读取结果。
- 不改 `settings.json` 路径与契约、不改 `src/core/**`、不改对比 / 合并语义、不改导出与发布面文件。
- 不新增 npm 依赖、不新造第二套磁盘抽象、不在 `PlatformPort` 之外直连存储。
- 不做浏览器 / 设备 / 桌面 GUI 验证；本期验证只有 vitest（Node + jsdom 无关）。

## 实现约束

- 新增文件锚点：`src/shared/history/` 放类型 + 纯函数 + 纯函数测试（`src/shared/history/*.test.ts`），不要放进 `src/core/**`（避免撞覆盖率地板）；类型如需跨进程复用，从 `src/shared/platform/types.ts` re-export 而不是复制一份。
- 平台锚点：`src/shared/platform/types.ts`（`PlatformPort` 两个方法）、`src/shared/platform/channels.ts`（两个 channel）、`src/main/platform/electron-platform.ts`（`userData` 路径 helper + handler，复用现有 `writeFileAtomically`，不要复制原子写实现）、`src/preload/index.ts`（白名单转发）、`src/renderer/src/platform/web-platform.ts`（localStorage 键 + 内存回退）。
- 沿用 `settings.json` 既有范式：`app.getPath('userData')` + `join`，读取 try/catch 回退、写入前 `mkdir(dirname, { recursive: true })`；IPC handler 在写入前用 shared 纯函数校验载荷，非法载荷抛 `TypeError`（与 `writeUserSettings` 一致）。
- 存储信封字段名固定为 `version` / `entries`；条目字段名固定为 `id` / `kind` / `paths` / `createdAt` / `ignoreWhitespace` / `ignoreNewline` / `ignoreEncoding` / `error`（`error` 缺省即无），后续 UI 子项按此读取，本期不预留未使用字段。
- `id` 生成必须确定性、可在 jsdom / Node 下同步执行、不引入依赖；同一 `kind` + 有序路径 → 同一 `id`（哈希 / 摘要均可，但不得把路径原文写进 `id`）。
- 去重身份只认 `kind` + 有序路径；`createdAt` 用于排序与显示，不参与身份。
- 排序需稳定：`createdAt` 降序，相同时间以 `id` 升序兜底，保证断言可重复。
- Electron 真实验证复用 `src/main/platform/electron-platform.test.ts` 既有的 `appState.userData` 临时目录 mock（每次测试独立 scratch 目录），evidence 必须是真实临时目录而不是内置样本。
- 门禁同步按既有数据驱动方式：`src/munk-gates.test.ts` 的 `EXPECTED_GATES` 与条数 / 文案同步更新，`.munk/baseline/test-debt.json` 的实测值由 `scripts/test-debt-gate.mjs` 跑出后再写（不得手抄；`ceilings` 只降不升，确需上浮用 `growth` 条目并在同一提交闭环，`floors` 不得下调）。
- 既有测试文件只追加 / 最小改动，不整文件重写；只为凑绿放宽门禁一律不接受。
- 日志只走主进程单行、只含计数或错误码；错误码从 `error.code` 取，缺失时用固定 `unknown`，不得拼接 `error.message`。
