# Domain: test-harness

测试共享脚手架与测试体量治理域：定义「重复的 render 包装 / 平台端口构造 / 事件派发 / 断言封装收敛到**唯一一个**非测试文件 harness」这一契约，以及「体量下降不得以删断言、删用例、搬迁用例为代价」的判据。本域只管**测试侧的复用面与体量预算**，不管被测产品行为——壳层 / 会话 tab / 三档布局归 `workbench`，真实磁盘镜像同步行为归 `directory`，门禁清单形状与扩容纪律归 `quality-gates`，等待点确定性（弱等待 / flake）归 `test-determinism`。本域是「共享测试 harness 只能有一个、且只能装脚手架不能装用例」的唯一现行口径来源。

## 范围

- **唯一 harness**：`src/test/sharedHarness.tsx`，非测试文件（文件名不匹配 `*.test.*`），≤ 500 行；同时被 jsdom（`src/renderer/src/App.test.tsx`）与 node（`src/sync-real-gate.test.ts`）安全 import——**顶层不得访问 `document` / `window`**，DOM 相关导出只在函数体内取用。
- **允许的导出类别**（四类，超出即越界）：① render 包装（`mountWorkbench`）；② 平台端口 / fixture 构造（`scriptedPort` / `templatePort` / `memoryPort` / `EXTERNAL_TEMPLATE_FILES` / `writeFiles`）；③ 真实临时目录工具（`scratchRoot` / `scratchSides` / `releaseScratchRoots` / `writeStamped` / `writeStampedBytes` / `linkWithStamp` / `sha256Hex` / `fingerprint`）；④ 事件派发与只读查询（`clickControl` / `dropPaths` / `openFilePair` / `openDirectoryPair` / `openAnotherFile` / `openAnotherDirectory` / `openCompareDialog` / `fillComparePaths` / `submitCompare` / `submitComparePair` / `sessionTabs` / `sessionTab` / `sessionTabRows` / `sessionTabCount` / `statusText` / `paneTree` / `treeRowTitles` / `settle` / `deletePathsOf`）。
- **harness 内禁止行为用例**：不得出现 `describe` / `it` / `test`，不得包含 `expect(`；断言一律留在各自用例内联，保证每个用例仍能独立定位失败。
- **体量预算（本域现行基线）**：两目标文件合计 ≤ 5,000 行（改动前 6,210：`App.test.tsx` 3,449 + `sync-real-gate.test.ts` 2,761）；两目标文件 + harness 合计 ≤ 5,500 行（防止「把代码搬进 helper 冒充删除」）。当前实测 2,959 + 1,991 = 4,950，加 harness 279 共 5,229。
- **断言与用例零删减**：两目标文件用例块声明数保持 **127**（`App.test.tsx` 94 + `sync-real-gate.test.ts` 33 = 32 裸 `it(` + 1 `it.skipIf(isRootUser())(...)`）；旧口径「126（94 + 32）」只数裸 `it(` / `test(`、漏掉 `.skipIf` 变体，已由 `wi_intake_71c3baa903a19078` 的逐用例机械映射纠正（「95」是把 `App.test.tsx` 内正则方法调用 `/.test(` 误计入，同样作废）。`expect(` 总数 ≥ 924（改动前 537 + 387）；每个用例的逻辑断言条数相等或增加，不得把两条独立断言并成一次 `toEqual` / `toBe`。
- **逐用例断言映射（现行复核判据）**：两目标文件每个 `it` / `test` 变体逐行给出「基线 expect 条数 / 现 expect 条数 / 一致或变化」，不得用文件级总数替代逐用例表；用例外 expect 按所属函数名聚合对账（`App.test.tsx` 537 = 534 + 3（`openPairs` 1 / `mountReady` 1 / `clickOpenFile` 1）；`sync-real-gate.test.ts` 387 = 370 + 17（`assertGroupMatchesDisk` 6 / `expectSameSnapshot` 5 / `expectSameFingerprint` 3 / `expectSameLink` 3）；合计 924 = 904 + 20）；expect 文本变化逐位置列出并二分类为 `formatting-only`（去空白 / 尾逗号 / 冗余括号后骨架相同）或 `helper-substitution`（引用 harness 导出），不允许未解释的第三类；helper 删除 / 搬迁按函数名出台账（原名、原行号、原 expect 条数、替代 harness 导出名、受影响用例），不按出现序号硬配对。
- **覆盖率冷跑同口径对比（现行复核判据）**：基线提交与对照提交各在独立 `git worktree add --detach` 中 `pnpm install --frozen-lockfile`，删 `coverage/` 与 `node_modules/.vite` 后用同一条 `pnpm exec vitest run --coverage` 冷跑，两侧退出码均 0 且日志含 `Coverage enabled with v8`（provider 为仓库既有 `@vitest/coverage-v8@5.0.5`，不新增依赖）；必须同时给「全仓 / 两侧共有文件同口径 / 共有再剔除 `src/test/**` / 两个指定模块 / 仅单侧存在文件清单」六组四项。**同口径共有文件与剔除 `src/test/**` 两种口径下 lines 与 branches 的 delta 必须 ≥ +0.00pp**；全仓抬升若来自新增测试支撑文件（如 `src/test/sharedHarness.tsx`，计入覆盖但不含 `*.test.ts(x)`），必须显式指出并以同口径证明不是靠新增被测源码制造。出现任一下降即停手上报，不得靠改测试 / 改源码 / 换口径消化。
- **不新增测试面**：仓库内 `*.test.ts(x)` 文件数量与改动前一致；不新增门禁项、不改 `.munk/code-gates.json`、不改 `package.json` / `pnpm-lock.yaml`（`version` 保持 `0.2.16`，无依赖与 scripts 变更）。
- **删除必须可追溯**：每删一段重复 setup 都要能在交付说明里写出「删除位置 → harness 导出名 → 受影响用例清单」，禁止整段用例平移进 harness 充数。
- **关键路径回归钉板**：`App.test.tsx` 的 `keeps 3 tabs resident and switches with zero scans or digests` 与 `sync-real-gate.test.ts` 的 `rolls a mid-plan failure back to the exact previous disk and stays retryable`、`cancels mid-plan, rolls back and reports a cancellation distinct from failure` 三条用例标题逐字保留、断言不删改、仍全绿。
- **不做的事**：不迁移测试框架（vitest 5 + jsdom + `@testing-library/react` 不变），不引新测试库 / 运行时依赖，不改 `src/main/**` / `src/core/**` / `src/shared/**` / 其余 `src/renderer/src/**` / `scripts/**` / `.github/**`，不跑浏览器 / Electron / 实机。

## 验收

- **ac-line-budget**：`wc -l` 两目标文件合计 ≤ 5,000（基线 6,210，净减 ≥ 1,200），且两文件仍存在、非空、各自保留 `describe` 分组（`App.test.tsx` 8 个、`sync-real-gate.test.ts` 7 个）。
- **ac-no-new-test-file**：`*.test.ts` / `*.test.tsx` 文件数量与改动前一致；不新增测试文件、不新增门禁项。
- **ac-single-helper**：`git status --porcelain` 新增文件恰好 1 个共享 harness，位于 `src/test/` 且不匹配 `*.test.*`；该 helper ≤ 500 行；两目标文件 + helper 合计 ≤ 5,500 行。
- **ac-test-count**：`pnpm test` 报告用例总数 ≥ 1,745；两目标文件用例块声明数保持 **127**（94 + 33，含 1 个 `it.skipIf`；旧「126 = 94 + 32」为只数裸 `it(` / `test(` 的口径，已作废）。
- **ac-assertion-parity**：两目标文件 + helper 的 `expect(` 总数 ≥ 924，逐用例「逻辑断言条数 改动前 / 后」相等或增加；条数变化必须精确对应到已列名的 harness 断言封装，且不得合并原本独立的断言。
- **ac-no-skip-or-each**：`git diff` 不新增 `it.each` / `test.each` / `describe.each` / `.skip(` / `.only(` / `.todo(` / `.concurrent(` 行；不新增仅用于跳过断言的早退守卫（任何新增分支须逐条说明是 fixture 早退且其后断言照常执行）。
- **ac-helper-node-import-safe**：harness 在 node 环境可安全 import（顶层不碰 `document` / `window`）；证据为 `pnpm test:sync-real` 全绿且未新增环境守卫 mock。
- **ac-coverage-evidence**：覆盖率摘要给出改动前 / 后，全仓 statements / branches / functions / lines 与 `App.tsx`、`src/core/directory/sync.ts` 两模块四项指标降幅均 ≤ 0.5pp；provider 不可用时须贴实测 `MISSING DEPENDENCY` 原文并改用「行为断言条数前后一致 + 关键路径逐条列举」口径，禁止编造数字、禁止新增运行时依赖。
- **ac-coverage-cold-run-both-sides**：基线 `97a18f3` 与对照 `120f06d` 各在独立 `git worktree add --detach` 中先 `pnpm install --frozen-lockfile`、再删该 worktree 的 `coverage/` 与 `node_modules/.vite`，随后执行同一条 `pnpm exec vitest run --coverage`；两侧均记录完整命令、开始 / 结束时间、墙钟耗时与退出码（均 0），原始 stdout 落 change pack `raw/`。
- **ac-coverage-provider-raw**：覆盖率由既有 `@vitest/coverage-v8@5.0.5` 真实产出，日志含 `Coverage enabled with v8`；`Coverage summary` 四行（`Statements` / `Branches` / `Functions` / `Lines` 的百分比与分子 / 分母）与 `Test Files` / `Tests` / `Duration` 行原样粘贴，不得只给汇总或改写数字；不新增依赖，provider 真失败须贴原文并停手上报。
- **ac-coverage-same-scope**：六组四项齐备（全仓 / 共有文件 / 共有剔除 `src/test/**` / `App.tsx` / `src/core/directory/sync.ts` / 仅单侧存在文件）；同口径共有 158 文件与剔除 `src/test/**` 157 文件两种口径下 lines / branches delta 均 ≥ +0.00pp，两个指定模块四项 delta 也均 ≥ +0.00pp；全仓小幅抬升须归因到唯一新增覆盖文件 `src/test/sharedHarness.tsx` 并说明其不在 `*.test.ts(x)` 统计内。
- **ac-assertion-per-case-table**：127 个用例块逐行出表（`App.test.tsx` 94 + `sync-real-gate.test.ts` 33，含 1 个 `it.skipIf`），每行给出基线 / 现 expect 条数与「一致 / 变化」判定，无缺失标题、无减少；口径明确为静态 `expect(` 出现次数（循环体只计 1 次）。
- **ac-assertion-outside-and-text-change**：用例外 expect 按函数名聚合满足 `537 = 534 + 3`、`387 = 370 + 17`；230 条 expect 文本变化逐位置列出（`App.test.tsx` 132 = 37 formatting-only + 95 helper-substitution；`sync-real-gate.test.ts` 98 = 89 + 9），每条含原表达式 / 现表达式 / 判定 / helper 导出名。
- **ac-helper-delta-ledger**：被删除或移入 harness 的本地 helper 逐个列出原名 / 原行号 / 原 expect 条数 / 替代导出名 / 受影响用例，其函数体原本 expect 均为 0；保留 helper（`assertGroupMatchesDisk` / `expectSameSnapshot` / `expectSameFingerprint` / `expectSameLink` / `openPairs` / `mountReady` / `clickOpenFile` / `cycle`）前后条数不变。
- **ac-evidence-only-scope**：`git status --porcelain` 与 `git diff --name-only` 只允许本 WI change pack（`.munk/changes/{workItemId}/**`）；两目标测试文件、`src/test/sharedHarness.tsx`、产品源码、`package.json` / `pnpm-lock.yaml`、门禁清单与 `scripts/**` / `.github/**` 零 diff；不新增依赖、不新增 / 修改门禁项、不推 tag；证据文档内给出绝对路径与只读生成脚本的完整调用命令。
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
- **补证（evidence-only）纪律**：覆盖率冷跑与逐用例映射都是**只读采集**，证据只写进当次 change pack（`coverage.md` / `assertion-map.md` + `raw/` 原始日志 + `tools/*.mjs` 只读脚本），不改测试、不改产品源码、不动门禁；生成脚本不得加入 `code_gates`。冷跑成本为**每侧一次 `pnpm install` + 一次全量 `vitest run --coverage`（本机实测 36.85s / 38.36s 墙钟，Vitest 自报 35.60s / 37.16s）**，同一提交只采一次；重跑须说明上一轮作废原因与两轮差异。全仓数字以 provider 原文为准，同口径重算（istanbul 同规则、floor 两位）只用于「共有文件 / 剔除 `src/test/**`」，与原文不一致时以原文为准并记录脚本差异。
- **判据优先级**：逐用例条数与逐条映射是唯一判据；「用例数降幅 ≤5%」「`expect(` 文件级总数不变」「断言全部内联」都不得作为覆盖率或断言零删减的替代证明。

## 最近交付证明

- WI：`wi_intake_71c3baa903a19078`（Q5 签收补证：覆盖率冷跑前后对比 + 逐用例断言映射，evidence-only）
- 日期：2026-11-02
- 结果：`code_gates` passed（21 gates，attempt 002，`.munk/runs/run_intake_71c3baa903a19078/code-gates/attempts/002`，`ok: true`）；attempt 001 因两个只读脚本缺 `/* global console, process */` 被 `lint` 的 `no-undef` 拦下、后续门禁 fail-fast skipped，修复后 attempt 002 全 passed。
- 覆盖摘要：① **覆盖率冷跑（`ac-coverage-cold-run-both-sides` / `ac-coverage-provider-raw` / `ac-coverage-same-scope`）**——`97a18f3` 与 `120f06d` 各建 detached worktree、各自 `pnpm install --frozen-lockfile`、删 `coverage/` 与 `node_modules/.vite`、同跑 `pnpm exec vitest run --coverage`，exit 0，墙钟 36.85s / 38.36s（Vitest `Duration` 35.60s / 37.16s），provider v8；两侧均 115 test files / `1796 passed | 1 skipped`。全仓 90.54 / 83.29 / 89.6 / 93.1 → 90.63 / 83.29 / 89.82 / 93.17；**共有 158 文件四项全 `+0.00pp`**，**再剔除 `src/test/**`（157 文件）四项仍全 `+0.00pp`**；`App.tsx` 94.11 / 75 / 100 / 100、`sync.ts` 94.27 / 83.07 / 98.07 / 96.87 两侧逐位相同。唯一单侧文件为 `src/test/sharedHarness.tsx`（279 行、100 / 85 / 100 / 100），全仓抬升归因于此，不是新增被测源码。② **逐用例映射（`ac-assertion-per-case-table` / `ac-assertion-outside-and-text-change` / `ac-helper-delta-ledger`）**——127 行（94 + 33 含 1 个 `it.skipIf`）全部「一致」，0 减少、0 缺失标题；用例内 904（534 + 370）+ 用例外 20（3 + 17）= 924；文本变化 230 条（App 132 = 37 formatting-only + 95 helper-substitution；sync 98 = 89 + 9）；24 个本地 helper 声明（App 18 + sync 6，含同名重复）移出，原函数体 expect 均为 0，保留 helper 条数不变（含 `cycle` 18 → 18）。③ **范围（`ac-evidence-only-scope`）**——`git status --porcelain` 仅 `?? .munk/changes/wi_intake_71c3baa903a19078/`，`git diff --name-only` 空；两目标测试文件、harness、产品源码、`package.json` / `pnpm-lock.yaml`、门禁与 `scripts/**` / `.github/**` 零 diff。
- 注：① 本 WI change pack 仅含 `prd.md`、`coverage.md`、`assertion-map.md`、`raw/**`、`tools/*.mjs`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收落档为 `qa/q5-acceptance-coverage-assertion.md`。② **口径纠正（本域 AC 已改）**：用例声明数是 **127**，不是 126——126 只数裸 `it(` / `test(`，漏掉 `it.skipIf`；95 是把正则 `/.test(` 误计入。③ **补上了 Q5 的覆盖率缺口**：`shared-test-harness-dedup.md` 的旧 note 记「覆盖率前后对比未产出、按替代口径记录」，本轮以 v8 真实冷跑补齐，同口径 lines / branches 均 `+0.00pp`（比 Q5 原 AC 的「≤ 0.5pp」更强，后续引用以本条为准）。④ **冷跑成本要预留**：每侧一次 install + 一次全量 coverage 约 37–38s 墙钟，且需两个临时 worktree；不要把这套流程塞进门禁，重复采样先查同提交是否已有记录。

- WI：`wi_intake_335d0d0cbf0533bd`（Q5 测试清债：`App.test.tsx` 与 `sync-real-gate.test.ts` 去重压缩，`kind: test-only`）
- 日期：2026-11-02
- 结果：`code_gates` passed（21 gates，attempt 001，`.munk/runs/run_intake_335d0d0cbf0533bd/code-gates/attempts/001`，`summary = "code_gates passed (21 gates, attempt 001)"`，`failedGateIds: []`）；门禁 `test` 115 files / 1,871 passed + 1 skipped（1,872）、31.29s；`sync-real-gate` 单跑通过。
- 覆盖摘要：① **体量（`ac-line-budget` / `ac-single-helper`）**——两目标文件 3,449 + 2,761 = 6,210 → 2,959 + 1,991 = 4,950（净减 1,260，超 1,200 门槛）；新增 `src/test/sharedHarness.tsx` 279 行，三文件合计 5,229 ≤ 5,500；`App.test.tsx` 8 个 / `sync-real-gate.test.ts` 7 个 `describe` 分组保留。② **零删减（`ac-test-count` / `ac-assertion-parity`）**——`it(` + `test(` 仍为 94 + 32 = 126；`expect(` 仍为 537 + 387 = 924，harness 内 0 条 `expect`，断言全部内联在各用例内。③ **harness 形状（`ac-helper-node-import-safe` / `ac-single-helper`）**——四类导出（render 包装 / 平台端口与 fixture / `mkdtemp` 真实临时目录工具 / 事件派发与只读查询），无 `describe` / `it` / `test`，顶层不访问 `document` / `window`，node 侧 `sync-real-gate` 与 jsdom 侧 `App.test` 共用同一文件。④ **无新增跳过面（`ac-no-skip-or-each`）**——`git diff` 无新增 `it.each` / `test.each` / `describe.each` / `.skip(` / `.only(` / `.todo(` / `.concurrent(`；三文件内该模式计数均为 0。⑤ **范围（`ac-scope-and-version`）**——`git status --porcelain` 仅 `M src/renderer/src/App.test.tsx`、`M src/sync-real-gate.test.ts`、`?? src/test/sharedHarness.tsx` 与本 WI change pack；`package.json`、`pnpm-lock.yaml`、`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**` 零 diff。⑥ **关键路径（`ac-sync-real-regression` / `ac-app-shell-regression`）**——三条点名用例标题逐字仍在（`keeps 3 tabs resident and switches with zero scans or digests`、`rolls a mid-plan failure back to the exact previous disk and stays retryable`、`cancels mid-plan, rolls back and reports a cancellation distinct from failure`）。
- 注：① 本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/shared-test-harness-dedup.md`。② **新建本域**：此前 `test-determinism` 的「非目标」明确写着「不重构测试文件结构、不抽公共测试框架」，本 WI 正好做的是这件事，故不并入该域、不改写其历史口径。③ **体量判据比「更短」更硬**：`expect(` 计数是防「抽掉断言换行数」的唯一机械闸，harness 内出现 `expect` 即视为把断言搬出用例，直接判红。④ 后续若再压这两文件，优先把「同一段 setup 的第 3 次出现」搬进 harness；已进 harness 的导出不要为个别用例加参数开关，那会把 harness 变成隐式测试框架。
