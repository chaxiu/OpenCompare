# i18n 渲染层测试收敛为 locale 表驱动（含同步失败提示本地化复核）

## Scope

基线 `main=e93a1d8`（B 已合）。把渲染层两套 i18n 测试从「逐键手抄文案」改为「从 `src/renderer/src/i18n` 词典派生的 locale 表驱动」，只保留 3–5 条关键路径；顺带把同为文案断言的 `TemplateDialog.test.tsx` 与 theme 面并入同源取值。产品 i18n 键与行为不动。

改动面：

1. `src/renderer/src/App.i18n.test.tsx`（928 行）与 `src/renderer/src/views/directoryI18n.test.tsx`（1,317 行）：合计 **2,245 → ≤900 行**。
2. 新增一个共享的 locale 表测试助手（建议 `src/renderer/src/i18n/localeTable.ts`，纯派生、无 UI 文案字面量、≤80 行），从 `messages` 的 `zh` / `en` 词典生成 `{ key, zh, en }` 行并提供按语言插值取值；四个测试文件共用，禁止再提交一份手抄的 locale JSON。
3. `src/renderer/src/views/TemplateDialog.test.tsx`：只迁走文案类断言（如 `'the write failed'`、`'permission denied'`），改为按词典键取值；行为/结构断言与用例数不变。
4. theme 面：`src/renderer/src/theme/themeSources.test.ts` 实测 **0 条 locale 文案断言**（仅 `@theme {` / `:root[data-theme='light'] {` 等样式结构断言，保留不动）；同主题面的 `src/renderer/src/App.theme.test.tsx` 有 1 条硬编码英文提示断言（`'Could not save settings: EACCES: permission denied'`）→ 改为 `en['settings.saveError']` 插值取值，仅此 1 行。
5. 产品缺陷复核：v0.2.15 L3 的「同步失败提示不随界面语言」在本基线**已修复并有测试**（`src/renderer/src/workbench/syncFailureCopy.ts`、`directorySyncFailureI18n.test.tsx`、CHANGELOG v0.2.16、commit `ed5bdd3`）。本项以表驱动的 en/zh 断言把 EACCES / EPERM 锁住；仅当复现出残余中文泄漏时才允许改 src，且只限 `syncFailureCopy.ts` / `Workbench.tsx`（同步失败分支）/ `i18n/messages/{zh,en}/shell.ts`，不得改键、不得改行为。

基线实测（本 worktree，`pnpm install` 后）：

| 指标 | 基线值 |
| --- | --- |
| 两文件行数 | 928 + 1,317 = 2,245 |
| 两文件用例数（vitest） | 60 |
| 仓库用例总数（`pnpm test`） | 1,800（1,799 passed / 1 skipped） |
| 全仓测试文件 / 测试总行数 | 114 个 / 46,955 行 |
| 两文件 `.toContain(` 调用点 | 57（字面量参数 49，动态 8） |
| 两文件 `readFileSync` | 0 |
| 覆盖率（v8，全仓 `pnpm exec vitest run --coverage --coverage.reporter=text-summary`） | Statements 89.94%（7683/8542）· Branches 82.74%（4394/5310）· Functions 89.38%（1676/1875）· Lines 92.54%（6922/7480） |
| 版本 | `package.json` 0.2.16（单点） |

补充实测：移除这两个 i18n 文件后全仓覆盖率为 Statements 89.61% / Branches 82.44% / Functions 89.01% / Lines 92.20%，即两文件独占贡献约 0.3pp；用例数降到 1,740（较 1,800 降 3.3%，仍在 ≤5% 内）。因此「用例数降幅 ≤5%」按**仓库总量**口径执行（1,800 → ≥1,710），两文件内部收敛到 3–5 条关键路径；若覆盖率因此掉点，只能在 3–5 条额度内加深关键路径，不得回填逐键用例。

> 注：本 worktree 内不存在 `goal.md`（已实测 `.munk/` 与仓库根均无该文件）；本 prd 以 Q3 定稿原文为唯一口径。

## Acceptance Criteria

- ac-two-files-lines: `wc -l src/renderer/src/App.i18n.test.tsx src/renderer/src/views/directoryI18n.test.tsx` 合计 ≤900 行，且回执贴出改前 928 / 1,317 / 2,245 与改后逐文件行数。
- ac-locale-table-single-source: 四个测试文件的期望文案全部经同一 locale 表助手从 `zh` / `en` 词典取值：表行数恒等于 `Object.keys(zh).length`，每行 `zh` / `en` 值与 `messages.zh[key]` / `messages.en[key]` 全等（有用例断言该单一来源），且两文件 TS 内不出现手抄的界面文案句（仅允许路径、OS 码、`/samples`、`built-in` 等非文案字面量）。
- ac-key-paths-3-to-5: 两文件合计只保留 3–5 条关键路径用例（不多于 5），且至少包含并全部通过：① 运行时语言切换；② 缺 key 回落；③ EACCES / EPERM 同步失败提示随界面语言本地化（en / zh 各断言）。
- ac-language-switch: en → zh → en 运行时切换后，顶栏、空态、目录视图的文案逐字等于当前语言词典值（按命名的少量 key 断言），且 en 侧可见文案 `/\p{Script=Han}/u` 命中为 0。
- ac-missing-key-fail-closed: 从 `en` 词典删除任一条被关键路径引用的键（注入 a）时，至少 1 条用例变红（缺键/键集不齐不再静默通过）；恢复后全绿。断言用「渲染文本 === 词典插值结果」的等值比较，不用只查片段。
- ac-sync-eacces-eperm: en 界面下同步写入拒绝（分别以 `EACCES`、`EPERM` 触发）与「写入完成但刷新失败」提示，逐字等于 `en['shell.sync.error.target']` / `en['shell.notice.syncRefreshFailed']` 按 `{path}` / `{reason}`（`shell.sync.reason.<CODE>`）插值的结果，含目标路径与 OS 码，不含汉字、不含 `Error invoking remote method` 等 IPC 包装串；zh 界面下为对应中文词典值。
- ac-sync-notice-retranslate: 同一已显示的通知条在切换语言后按新语言重译（同一 DOM 节点文本从 en 词典值变为 zh 词典值），不要求重新触发同步。
- ac-template-theme-copy: `TemplateDialog.test.tsx` 中所有文案断言改为词典键取值（`'the write failed'` → `en['directory.template.failure.writeFailed']`，`'permission denied'` 由 `shell.sync.reason.EACCES` 派生）；`themeSources.test.ts` 保留全部结构断言（0 条文案断言迁移）；`App.theme.test.tsx` 的 1 条硬编码英文提示改为 `en['settings.saveError']` 插值；两者用例数与行为断言不变。
- ac-tocontain-budget: 两文件 `.toContain(` 调用点合计 ≤17（基线 57 的 30%）；其中「参数为硬编码界面文案」的条目为 0。
- ac-readfilesync-budget: 两文件 `readFileSync` 出现次数 ≤2（基线 0），不得用源码扫描取代真实渲染断言。
- ac-case-count: `pnpm test` 汇总用例总数 ≥1,710（基线 1,800，降幅 ≤5%），且两文件内关键路径用例为 3–5 条。
- ac-coverage-not-lower: 改后全仓覆盖率 Statements ≥89.94%、Branches ≥82.74%、Functions ≥89.38%、Lines ≥92.54%（同一 `pnpm exec vitest run --coverage --coverage.reporter=text-summary` 命令），回执贴改前/改后四行原文。
- ac-deletion-mapping: 回执逐条给出「删除的文本断言 → 替代断言」映射（覆盖两文件 + TemplateDialog 文案断言），并注明替代断言所在文件与用例；断言不得搬进 `.munk/` 或其他新增文件凑数；回执同时给出测试总行数改前 46,955 与改后值。
- ac-inject-missing-key: 注入 a 落实并贴出失败输出原文：删除一条 locale 键 → 运行相关用例 → 原始红字（含失败用例名与断言差异）→ 恢复 → 复跑全绿；恢复后 `git diff` 不含该注入。
- ac-inject-hardcoded-zh: 注入 b 落实并贴出失败输出原文：把 en 下的同步失败提示改回硬编码中文（改 `syncFailureCopy.ts` / `Workbench.tsx` 的映射，或把 en 对应词条临时写成中文句）→ en 用例必须红（汉字断言或等值断言失败）→ 恢复 → 复跑全绿；恢复后 `git diff` 不含该注入。
- ac-no-locale-drift: `src/renderer/src/i18n/messages/**` 的最终 diff 为空（键、值、键集均与 e93a1d8 一致）；若复现出残余中文泄漏，仅允许改 `shell.ts` 的既有失败提示键值并需在回执给出 en 修复前后原文对比，且 `messages.test.ts` 的键集/占位符/无汉字断言仍全绿。
- ac-no-product-behavior-change: 除上述允许文件外 `src/**` 无运行时 diff；同步 / 模板 / 快照 / 算法行为、既有通知语气与清除时机不变；`App.smoke.test.tsx`、`i18n/messages.test.ts`、`i18n/mainScan.test.ts` 不改（可继续全绿）。
- ac-version-single-point: `package.json` 的 `version` 仍为 `0.2.16`；不改 `CHANGELOG.md`、README 版本表、发布文件。
- ac-gates-green: 本 worktree 上 `.munk/code-gates.json` 全部 21 项门禁（install / lint / typecheck / build / build-web / test / 各专项门禁）passed，`code-gates.json` 不被修改。

## Non-Goals

- 不改产品 i18n 键集、键名、任何译文（本基线已修复同步失败提示；不借机改文案）。
- 不新增 i18n 框架、不把 locale 迁成新的 JSON 事实源、不引入 i18n 库或快照测试。
- 不改 `.munk/code-gates.json`、`vitest.config.mts`、`package.json` scripts、版本号、CHANGELOG、README、`.github/**`、`electron-builder.yml`。
- 不重构无关测试（`App.smoke.test.tsx` / `messages.test.ts` / `mainScan.test.ts` / `TemplateDialog.test.tsx` 的行为断言保持原样），不顺手"清理"其他测试文件。
- 不为凑行数把断言搬进 `.munk/`、新增测试文件或注释；不删除仍有独立行为覆盖价值的门禁用例（`sync-real-gate`、`src/**/*.test.ts` 专项门禁一律不动）。
- 不跑 Electron 真机交互、截图、发布流程；`needSelfTest=false`。

## Implementation Constraints

- **locale 表单一来源**：助手只做派生（`Object.keys(zh)` → `{ key, zh: zh[key], en: en[key] }` + 按语言 `interpolate` 取值），不得提交任何手抄键值；不得被产品运行时代码 import。
- **允许的非文案字面量**（静态检查白名单）：真实路径（`/memory/...`、`/ext/...`、`src/b.ts`）、OS 码（`EACCES` / `EPERM` / `ENOTDIR` 等）、`/samples`、`built-in` / `内置` 扫描标记、会话名（`baseline ↔ candidate`）、符号（`∅`、`—`）。
- **等值断言优先**：关键路径用 `toBe` / `toEqual` 对「词典插值结果」做等值比较；`toContain` 只用于路径/OS 码等非文案片段，确保注入 b 能被汉字断言或等值断言捕获。
- **行数口径**：≤900 上限只数上述两个测试文件；若压缩时把夹具外移，其为本项新增的测试支持文件行数一并计入 900（共享 locale 表助手除外，≤80 行）。断言不得外移。
- **覆盖率口径**：改前基线必须在本 worktree 同一命令下重测（89.94 / 82.74 / 89.38 / 92.54），改后同命令对比；掉点时只能在 3–5 条关键路径内加深（如通知条/对话框渲染），不得回填逐键用例。
- **注入流程**：注入前先 `git status` 干净；注入只改 1 处、跑最小相关用例、贴原始输出、`git checkout --` 恢复并复跑；回执同时贴恢复后的 `git diff --stat` 证明无注入残留。
- **缺陷复核优先**：先跑 `pnpm test src/renderer/src/workbench/directorySyncFailureI18n.test.tsx` 证明基线 en 提示已本地化（当前绿）；只有复现出中文泄漏才动 src，改动面严格限定 `syncFailureCopy.ts` / `Workbench.tsx` 同步失败分支 / `shell.ts` 既有键值。
- **提交纪律**：只改测试与必要的测试数据加载；`package.json` 版本 0.2.16 不动；`pnpm lint` / `pnpm typecheck` 必须绿（删键注入不得留在最终提交）。
- **回执必填**：两文件改前/改后行数、用例数（两文件与全仓）、覆盖率四行 before/after、测试总行数、两条注入失败输出原文、EACCES/EPERM 修复前后 en 提示对比（若未改 src 则写明「基线已本地化 + 实测原文」）、删除→替代断言映射。
