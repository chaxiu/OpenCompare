# Q5 签收补证：覆盖率冷跑前后对比 + 逐用例断言映射（evidence-only）

## 范围

只补 Q5（`wi_intake_335d0d0cbf0533bd`，合并提交 `120f06d`）签收缺失的两项证据，不改任何测试文件、不改产品代码、不改门禁与依赖：

1. **覆盖率冷跑对比**：在 `97a18f3`（Q5 合并前 main）与 `120f06d`（Q5 合并后）两个独立 worktree 中，各自 `pnpm install --frozen-lockfile`、删除 `coverage/` 与 `node_modules/.vite` 后，用同一条命令 `pnpm exec vitest run --coverage` 冷跑，记录完整命令、退出码、耗时与覆盖率原文，报全仓 statements / branches / functions / lines 以及 `src/renderer/src/App.tsx`、`src/core/directory/sync.ts` 两模块四项。
2. **逐用例断言映射**：机械生成 `97a18f3` → `120f06d` 两目标测试文件（`src/renderer/src/App.test.tsx`、`src/sync-real-gate.test.ts`）每个 `it` / `test` 块的 `expect(` 条数对照表；条数相同标「一致」，不同则逐条列「原断言 → 现断言 / helper 导出名」；另给全文件级 expect 文本变化清单与文件内 helper 的断言去向台账。

允许产生的仓库改动只有本 WI 的 change pack：`.munk/changes/wi_intake_71c3baa903a19078/**`（证据文档、原始日志、只读生成脚本）。不新增 `docs/perf/**` 或其他目录文件。

## Acceptance Criteria

- ac-coverage-cold-run-both-sides: 基线 `97a18f3` 与对照 `120f06d` 均在各自独立 worktree（`git worktree add --detach`）中先 `pnpm install --frozen-lockfile`，再删除该 worktree 的 `coverage/` 与 `node_modules/.vite`，随后执行同一条命令 `pnpm exec vitest run --coverage`；两侧都记录完整命令、开始时间、`/usr/bin/time -p` 或等效墙钟耗时、退出码，且退出码均为 0。
- ac-coverage-provider-real: 覆盖率必须由仓库已声明的 `@vitest/coverage-v8@5.0.5` 真实产出（日志须含 `Coverage enabled with v8`），不得用替代口径、不得编造数字、不得新增依赖；若确有 provider 失败，须原样粘贴 `MISSING DEPENDENCY` 原文并立即停手上报，不得继续出结论。
- ac-coverage-raw-summary-pasted: 证据文档必须原样粘贴两侧的 `Coverage summary` 四行（`Statements` / `Branches` / `Functions` / `Lines` 的百分比与分子/分母）与 `Test Files` / `Tests` / `Duration` 行，不得只给汇总或改写数字。
- ac-coverage-numbers-complete: 证据文档必须同时给出两侧以下 6 组四项指标：① 全仓；② 两侧共有文件同口径（same scope）；③ same scope 再剔除 `src/test/**`；④ `src/renderer/src/App.tsx`；⑤ `src/core/directory/sync.ts`；⑥ 仅单侧存在的文件清单。
- ac-coverage-same-scope-explained: 若全仓指标因 Q5 新增的 `src/test/sharedHarness.tsx`（279 行、100% 覆盖、被计入 `src/test/**`）而抬升，必须说明该文件是两侧唯一新增覆盖文件，并以「共有 158 文件」和「剔除 `src/test/**` 后 157 文件」两种同口径给出前后四项，证明差异不是靠新增被测源码制造。
- ac-coverage-no-line-branch-drop: 行（lines）与分支（branches）在「同口径共有文件」与「同口径剔除 `src/test/**`」两种口径下均不得下降——差值为 `+0.00pp` 或更大；任一口径出现 `-0.01pp` 或更低即判失败。
- ac-coverage-modules-no-drop: `src/renderer/src/App.tsx` 与 `src/core/directory/sync.ts` 的 statements / branches / functions / lines 四项，对照侧相对基线侧均不得下降（`+0.00pp` 或更大）。
- ac-coverage-drop-stop: 若出现 lines 或 branches 任一下降，必须立即停手，把两侧四组数字、下降模块清单与可疑原因写进证据文档并上报 Owner 裁定；不得通过改测试、改源码或换口径掩盖。
- ac-assertion-per-case-table: 证据文档必须包含两文件共 127 个 `it` / `test` 块的逐用例表（`App.test.tsx` 94 行、`sync-real-gate.test.ts` 33 行，其中 1 行为 `it.skipIf(...)`），每行给出「基线 expect 条数」「现 expect 条数」「判定（一致 / 变化）」；不得用文件级总数替代逐用例表。
- ac-assertion-zero-decrease: 127 个用例中不得出现任何 expect 条数减少；若出现，必须逐条解释为何等价或更强，并指明替代断言/封装函数名。
- ac-assertion-outside-cases-reconciled: 必须把「用例块之外」的 expect 单独成表并按函数名聚合（当前实测 `App.test.tsx` 3 条：`openPairs` 1、`mountReady` 1、`clickOpenFile` 1；`sync-real-gate.test.ts` 17 条：`assertGroupMatchesDisk` 6、`expectSameSnapshot` 5、`expectSameFingerprint` 3、`expectSameLink` 3），使 `537 = 534 + 3`、`387 = 370 + 17` 两个恒等式在文档中对账成立。
- ac-assertion-text-change-list: 必须给出全文件级、逐位置的 expect 文本变化清单（当前实测 `App.test.tsx` 132 条、`sync-real-gate.test.ts` 98 条，合计 230 条），每条含「原表达式 → 现表达式 → 判定（formatting-only / helper-substitution）→ helper 导出名（无则 `—`）」，并汇总两类计数。
- ac-helper-delta-ledger: 必须给出文件内 helper 的删除/搬迁台账：每个被删除或移入 `src/test/sharedHarness.tsx` 的本地函数，列出原名、原行号、原 expect 条数、替代的 harness 导出名、受影响用例；至少覆盖 `openAnotherDirectory`、`openAnotherFile`、`deletePathsOf`、`sha256Hex`、`scriptedPort`、`templatePort`、`dropPaths`、`treeRowTitles`、`within` 重包，以及 `assertGroupMatchesDisk` / `expectSameFingerprint` / `expectSameSnapshot` 等保留 helper 的前后条数。
- ac-no-tolerance-fallback: 不得以「用例数降幅 ≤5%」、`expect(` 文件级总数不变或「断言全部内联」作为本项结论；逐用例条数与逐条映射表是唯一判据。
- ac-evidence-paths: 证据文档固定落在 `.munk/changes/wi_intake_71c3baa903a19078/coverage.md` 与 `.munk/changes/wi_intake_71c3baa903a19078/assertion-map.md`；原始 stdout 落在同目录 `raw/`（建议 `raw/baseline-97a18f3.txt`、`raw/current-120f06d.txt`）；文档内必须给上述文件的绝对路径，并给生成脚本 `tools/coverage-compare.mjs`、`tools/assertion-map.mjs` 的完整调用命令。
- ac-scope-zero-diff: `git status --porcelain`（含未跟踪文件）与 `git diff --name-only` 只允许出现 `.munk/changes/wi_intake_71c3baa903a19078/**`；`package.json`、`pnpm-lock.yaml`、两目标测试文件、`src/test/sharedHarness.tsx`、`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**`、`scripts/**`、`.github/**` 零 diff；不新增依赖、不新增/修改门禁项、不推 tag。
- ac-code-gates-green: 全部 21 道 code_gates（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `sync-real-gate` 及全部 template、cancel、memory、structured、release 门禁）自绿，交付中给出 attempt 号与 `summary`。
- ac-deadline-honest: 20:30 前未能完成时必须如实报告已完成项、未完成项与阻塞原因，不得压缩任何口径或提前宣称通过。

## Non-Goals

- 不重新做 Q5 的测试去重，不改 `src/renderer/src/App.test.tsx`、`src/sync-real-gate.test.ts`、`src/test/sharedHarness.tsx` 任何一个字符。
- 不修产品代码、不改期望值、不增删用例、不新增测试文件或门禁项。
- 不新增/升级依赖，不改 `package.json`、`pnpm-lock.yaml`、版本号。
- 不跑浏览器、Electron 窗口、实机或发布流程；不推 tag、不发版。
- 不再讨论 Q5 是否「整体通过」；本 WI 只补覆盖率与断言映射两项证据。
- 不把「5% 用例降幅」「expect 总数不变」「断言全部内联」当作覆盖率或逐用例映射的替代证明。

## Implementation Constraints

- 基线提交固定 `97a18f3`（Q4 合并后的 main）；对照提交固定 `120f06d`（Q5 合并后）。两提交之间产品源码零 diff，唯一新增覆盖文件是 `src/test/sharedHarness.tsx`（279 行）。
- 覆盖率命令固定在两个 worktree 根执行：`pnpm exec vitest run --coverage`。冷跑前用 `node -e "const fs=require('node:fs'); for (const p of ['coverage','node_modules/.vite']) fs.rmSync(p,{recursive:true,force:true})"` 删除缓存（避免 `rm -rf` 被工具规则拦截）。`pnpm install --frozen-lockfile` 只允许在临时 worktree 内执行，主分支 `package.json` / `pnpm-lock.yaml` 必须零改动。
- Intake 预检（**非最终证据，最终文档须复现或逐项解释差异**）：
  - 基线 `97a18f3`：`real 35.56s`，115 test files，`1796 passed | 1 skipped`；全仓 statements `90.54% (7883/8706)`、branches `83.29% (4521/5428)`、functions `89.6% (1698/1895)`、lines `93.1% (7080/7604)`。
  - 对照 `120f06d`：`real 35.83s`，115 test files，`1796 passed | 1 skipped`；全仓 statements `90.63% (7962/8785)`、branches `83.29% (4538/5448)`、functions `89.82% (1739/1936)`、lines `93.17% (7153/7677)`。
  - same scope（两侧共有 158 文件）：两侧均 `90.54 / 83.29 / 89.6 / 93.1`，四项 delta 均 `+0.00pp`。
  - same scope 剔除 `src/test/**`（157 文件）：两侧均 `90.57 (7853/8670) / 83.42 (4514/5411) / 89.59 (1696/1893) / 93.12 (7054/7575)`，四项 delta 均 `+0.00pp`。
  - `src/renderer/src/App.tsx`：两侧均 `94.11 (16/17) / 75 (6/8) / 100 (7/7) / 100 (14/14)`。
  - `src/core/directory/sync.ts`：两侧均 `94.27 (247/262) / 83.07 (108/130) / 98.07 (51/52) / 96.87 (217/224)`。
  - 全仓抬升只来自新增的 `src/test/sharedHarness.tsx`；`coverage-final.json` 不含任何 `*.test.ts(x)`，但包含 `src/test/largeDirectory.ts` 与 `src/test/sharedHarness.tsx`，因此必须给「剔除 `src/test/**`」口径。
- 断言计数是静态 `expect(` 出现次数（与 Q5 prd 的 537/387 定义一致），循环体中的单条 expect 只计 1 次；文档须注明这一点，避免把运行时次数混入。
- 用例块实测：`App.test.tsx` 94 个 `it(`；`sync-real-gate.test.ts` 32 个 `it(` + 1 个 `it.skipIf(isRootUser())(...)`，合计 **127**。Q5 prd 的「126」只数了裸 `it(` / `test(`，漏掉 `.skipIf` 变体；用户口径里的「95」来自把 `App.test.tsx` 第 789 行附近的正则方法调用 `/.test(` 误计入。逐用例表按 94 + 33 = 127 行生成，并在文档中写明这两个口径差异。
- 预检的 expect 分布（最终文档须复现）：`App.test.tsx` 537 = 用例块内 534 + 用例外 3；`sync-real-gate.test.ts` 387 = 用例块内 370 + 用例外 17；用例内合计 904，用例外合计 20，总计 924。
- 预检的 expect 文本变化（最终文档须复现）：`App.test.tsx` 132 条（formatting-only 37 / helper-substitution 95），`sync-real-gate.test.ts` 98 条（formatting-only 89 / helper-substitution 9），合计 230 条；127 个用例条数全部一致、无缺失标题。
- 预检的 helper 级台账：被移出测试文件的本地 helper（`dropPaths` / `paneTree` / `scriptedPort` / `templatePort` / `treeRowTitles` / `writeFiles` / `sessionTabs` / `tab` / `tabCount` / `submitDialog` / `submitComparePair` / `fillPaths` / `openDialog` / `activeSession` / `writeMemoryFiles` / `fingerprint` / `linkWithStamp` / `rawSha` / `scratchRoot` / `writeStamped` / `writeStampedBytes`）在原文件内 expect 均为 0；保留 helper（`assertGroupMatchesDisk` / `expectSameSnapshot` / `expectSameFingerprint` / `expectSameLink` / `openPairs` / `mountReady` / `clickOpenFile`）前后 expect 条数不变。文档须按此形状给台账，而不是按出现序号硬配对。
- 生成脚本已随本 change pack 提供且只读：`tools/assertion-map.mjs`（逐用例 + 用例外 + 文本变化 + helper 台账）、`tools/coverage-compare.mjs`（全仓 / same scope / 剔除 `src/test/**` / 指定模块，按 istanbul 同规则重算并以 `+0.00pp` 展示）。两者都不得加入 `code_gates`，不得写入仓库其他路径。
- 所有证据文档和日志只写进 `.munk/changes/wi_intake_71c3baa903a19078/**`；临时 worktree 建议放在 `/var/folders/.../T/opencode/` 下，采集完成后可 `git worktree remove`，但 `raw/` 日志必须保留。
- 覆盖率口径以 provider 原文为准；`coverage-compare.mjs` 的重算只用于同口径剔除，不能替代原文 summary。若重算与原文不一致，以原文为准并在文档中说明脚本差异。
- 任何「条数减少」或「行/分支下降」都不得靠改测试或改源码消化；必须停手、记录、上报 Owner。
