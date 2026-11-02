# Domain: test-harness

测试共享脚手架与测试体量治理域：定义「重复的 render 包装 / 平台端口构造 / 事件派发 / 断言封装收敛到**唯一一个**非测试文件 harness」这一契约，以及「体量下降不得以删断言、删用例、搬迁用例为代价」的判据。本域只管**测试侧的复用面与体量预算**，不管被测产品行为——壳层 / 会话 tab / 三档布局归 `workbench`，真实磁盘镜像同步行为归 `directory`，门禁清单形状与扩容纪律归 `quality-gates`，等待点确定性（弱等待 / flake）归 `test-determinism`。本域是「共享测试 harness 只能有一个、且只能装脚手架不能装用例」的唯一现行口径来源。

## 范围

- **唯一 harness**：`src/test/sharedHarness.tsx`，非测试文件（文件名不匹配 `*.test.*`），≤ 500 行；同时被 jsdom（`src/renderer/src/App.test.tsx`）与 node（`src/sync-real-gate.test.ts`）安全 import——**顶层不得访问 `document` / `window`**，DOM 相关导出只在函数体内取用。
- **允许的导出类别**（四类，超出即越界）：① render 包装（`mountWorkbench`）；② 平台端口 / fixture 构造（`scriptedPort` / `templatePort` / `memoryPort` / `EXTERNAL_TEMPLATE_FILES` / `writeFiles`）；③ 真实临时目录工具（`scratchRoot` / `scratchSides` / `releaseScratchRoots` / `writeStamped` / `writeStampedBytes` / `linkWithStamp` / `sha256Hex` / `fingerprint`）；④ 事件派发与只读查询（`clickControl` / `dropPaths` / `openFilePair` / `openDirectoryPair` / `openAnotherFile` / `openAnotherDirectory` / `openCompareDialog` / `fillComparePaths` / `submitCompare` / `submitComparePair` / `sessionTabs` / `sessionTab` / `sessionTabRows` / `sessionTabCount` / `statusText` / `paneTree` / `treeRowTitles` / `settle` / `deletePathsOf`）。
- **harness 内禁止行为用例**：不得出现 `describe` / `it` / `test`，不得包含 `expect(`；断言一律留在各自用例内联，保证每个用例仍能独立定位失败。
- **体量预算（本域现行基线）**：两目标文件合计 ≤ 5,000 行（改动前 6,210：`App.test.tsx` 3,449 + `sync-real-gate.test.ts` 2,761）；两目标文件 + harness 合计 ≤ 5,500 行（防止「把代码搬进 helper 冒充删除」）。当前实测 2,959 + 1,991 = 4,950，加 harness 279 共 5,229。
- **断言与用例零删减**：两目标文件 `it(` + `test(` 声明数保持 126（94 + 32）；`expect(` 总数 ≥ 924（改动前 537 + 387）；每个用例的逻辑断言条数相等或增加，不得把两条独立断言并成一次 `toEqual` / `toBe`。
- **不新增测试面**：仓库内 `*.test.ts(x)` 文件数量与改动前一致；不新增门禁项、不改 `.munk/code-gates.json`、不改 `package.json` / `pnpm-lock.yaml`（`version` 保持 `0.2.16`，无依赖与 scripts 变更）。
- **删除必须可追溯**：每删一段重复 setup 都要能在交付说明里写出「删除位置 → harness 导出名 → 受影响用例清单」，禁止整段用例平移进 harness 充数。
- **关键路径回归钉板**：`App.test.tsx` 的 `keeps 3 tabs resident and switches with zero scans or digests` 与 `sync-real-gate.test.ts` 的 `rolls a mid-plan failure back to the exact previous disk and stays retryable`、`cancels mid-plan, rolls back and reports a cancellation distinct from failure` 三条用例标题逐字保留、断言不删改、仍全绿。
- **不做的事**：不迁移测试框架（vitest 5 + jsdom + `@testing-library/react` 不变），不引新测试库 / 运行时依赖，不改 `src/main/**` / `src/core/**` / `src/shared/**` / 其余 `src/renderer/src/**` / `scripts/**` / `.github/**`，不跑浏览器 / Electron / 实机。

## 验收

- **ac-line-budget**：`wc -l` 两目标文件合计 ≤ 5,000（基线 6,210，净减 ≥ 1,200），且两文件仍存在、非空、各自保留 `describe` 分组（`App.test.tsx` 8 个、`sync-real-gate.test.ts` 7 个）。
- **ac-no-new-test-file**：`*.test.ts` / `*.test.tsx` 文件数量与改动前一致；不新增测试文件、不新增门禁项。
- **ac-single-helper**：`git status --porcelain` 新增文件恰好 1 个共享 harness，位于 `src/test/` 且不匹配 `*.test.*`；该 helper ≤ 500 行；两目标文件 + helper 合计 ≤ 5,500 行。
- **ac-test-count**：`pnpm test` 报告用例总数 ≥ 1,745；两目标文件 `it(` + `test(` 声明数保持 126。
- **ac-assertion-parity**：两目标文件 + helper 的 `expect(` 总数 ≥ 924，逐用例「逻辑断言条数 改动前 / 后」相等或增加；条数变化必须精确对应到已列名的 harness 断言封装，且不得合并原本独立的断言。
- **ac-no-skip-or-each**：`git diff` 不新增 `it.each` / `test.each` / `describe.each` / `.skip(` / `.only(` / `.todo(` / `.concurrent(` 行；不新增仅用于跳过断言的早退守卫（任何新增分支须逐条说明是 fixture 早退且其后断言照常执行）。
- **ac-helper-node-import-safe**：harness 在 node 环境可安全 import（顶层不碰 `document` / `window`）；证据为 `pnpm test:sync-real` 全绿且未新增环境守卫 mock。
- **ac-coverage-evidence**：覆盖率摘要给出改动前 / 后，全仓 statements / branches / functions / lines 与 `App.tsx`、`src/core/directory/sync.ts` 两模块四项指标降幅均 ≤ 0.5pp；provider 不可用时须贴实测 `MISSING DEPENDENCY` 原文并改用「行为断言条数前后一致 + 关键路径逐条列举」口径，禁止编造数字、禁止新增运行时依赖。
- **ac-sync-real-regression**：`pnpm test:sync-real` 退出码 0，失败回滚与取消两条真实外部目录分支的标题逐字仍在、断言未删改。
- **ac-app-shell-regression**：`keeps 3 tabs resident and switches with zero scans or digests` 仍保留并通过；`pnpm test src/renderer/src/App.settings.test.tsx` 全绿且该文件零改动。
- **ac-code-gates-green**：`.munk/code-gates.json` 中每个 gate（现行 21 项，含 install / lint / typecheck / build / build-web / test / sync-real-gate 及全部 template、cancel、memory、structured、release 门禁）全绿；不得 skip、放宽或删除任何既有判定。
- **ac-scope-and-version**：`package.json` 与 `pnpm-lock.yaml` 零改动；`git diff --name-only` 仅含本 WI change pack、两个测试文件与 1 个 harness。
- **ac-no-browser-device**：不运行浏览器 / Electron 窗口 / 实机；证据全部来自 `code_gates`、jsdom 单测与 `mkdtemp` 真实临时目录；不触碰 `src/verify-release-gate.test.ts` 与 release 单点文件。

## 非目标

- 不重写用例、不改期望值、不合并不同行为的用例、不降低断言粒度、不改 e2e 覆盖面。
- 不做测试框架迁移或依赖升级；不新增测试库、快照测试、像素断言。
- 不新增 `*.test.ts(x)` 文件，不新增门禁项，不改 `.munk/code-gates.json`。
- 不碰 release 单点文件与 `verify-release-gate` 测试（属 Q4）。
- 不做产品行为 / 样式 / 文案 / 依赖升级等顺手改动。
- 不把本域扩成「全局测试基建改造」：只治理这两个超长文件的重复面；其余测试文件的同类重复另开工作项。

## 实现约束

- harness 必须是**单文件**，不得拆成多个 helper 模块规避「恰好 1 个新增文件」判据；也不得把 harness 放进 `src/renderer/**` 或 `src/core/**`（后者有 ESLint `no-restricted-imports`，且 node 侧要复用）。
- node 与 jsdom 双环境复用靠「函数体内才碰 DOM」实现，不靠 `typeof window === 'undefined'` 之类的环境守卫分流——环境守卫会把「顶层安全」这条契约变成条件成立。
- 只读查询类导出只读稳定结构钩子（`data-session-tab`、`role`、`aria-selected`、`data-diff-*`），不读内部 state 或私有函数，不新增 DOM 钩子。
- 真实临时目录工具继续走 `mkdtemp` 并保留既有清理（`releaseScratchRoots`），不改成共享固定目录，否则并行文件之间会互相污染。
- 体量判据以 `wc -l` 与 `expect(` / `it(` 计数为准，不以「观感更短」为准；每次改这两文件都要重新核对三个上限（5,000 / 5,500 / 500）。
- 滑窗纪律：未全绿即停下记录顺延，不得为压缩行数牺牲断言、覆盖或门禁任一验收项。

## 最近交付证明

- WI：`wi_intake_335d0d0cbf0533bd`（Q5 测试清债：`App.test.tsx` 与 `sync-real-gate.test.ts` 去重压缩，`kind: test-only`）
- 日期：2026-11-02
- 结果：`code_gates` passed（21 gates，attempt 001，`.munk/runs/run_intake_335d0d0cbf0533bd/code-gates/attempts/001`，`summary = "code_gates passed (21 gates, attempt 001)"`，`failedGateIds: []`）；门禁 `test` 115 files / 1,871 passed + 1 skipped（1,872）、31.29s；`sync-real-gate` 单跑通过。
- 覆盖摘要：① **体量（`ac-line-budget` / `ac-single-helper`）**——两目标文件 3,449 + 2,761 = 6,210 → 2,959 + 1,991 = 4,950（净减 1,260，超 1,200 门槛）；新增 `src/test/sharedHarness.tsx` 279 行，三文件合计 5,229 ≤ 5,500；`App.test.tsx` 8 个 / `sync-real-gate.test.ts` 7 个 `describe` 分组保留。② **零删减（`ac-test-count` / `ac-assertion-parity`）**——`it(` + `test(` 仍为 94 + 32 = 126；`expect(` 仍为 537 + 387 = 924，harness 内 0 条 `expect`，断言全部内联在各用例内。③ **harness 形状（`ac-helper-node-import-safe` / `ac-single-helper`）**——四类导出（render 包装 / 平台端口与 fixture / `mkdtemp` 真实临时目录工具 / 事件派发与只读查询），无 `describe` / `it` / `test`，顶层不访问 `document` / `window`，node 侧 `sync-real-gate` 与 jsdom 侧 `App.test` 共用同一文件。④ **无新增跳过面（`ac-no-skip-or-each`）**——`git diff` 无新增 `it.each` / `test.each` / `describe.each` / `.skip(` / `.only(` / `.todo(` / `.concurrent(`；三文件内该模式计数均为 0。⑤ **范围（`ac-scope-and-version`）**——`git status --porcelain` 仅 `M src/renderer/src/App.test.tsx`、`M src/sync-real-gate.test.ts`、`?? src/test/sharedHarness.tsx` 与本 WI change pack；`package.json`、`pnpm-lock.yaml`、`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**` 零 diff。⑥ **关键路径（`ac-sync-real-regression` / `ac-app-shell-regression`）**——三条点名用例标题逐字仍在（`keeps 3 tabs resident and switches with zero scans or digests`、`rolls a mid-plan failure back to the exact previous disk and stays retryable`、`cancels mid-plan, rolls back and reports a cancellation distinct from failure`）。
- 注：① 本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/shared-test-harness-dedup.md`。② **新建本域**：此前 `test-determinism` 的「非目标」明确写着「不重构测试文件结构、不抽公共测试框架」，本 WI 正好做的是这件事，故不并入该域、不改写其历史口径。③ **体量判据比「更短」更硬**：`expect(` 计数是防「抽掉断言换行数」的唯一机械闸，harness 内出现 `expect` 即视为把断言搬出用例，直接判红。④ 后续若再压这两文件，优先把「同一段 setup 的第 3 次出现」搬进 harness；已进 harness 的导出不要为个别用例加参数开关，那会把 harness 变成隐式测试框架。
