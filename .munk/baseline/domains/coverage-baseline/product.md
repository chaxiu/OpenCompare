# Domain: coverage-baseline

`src/core/**` 覆盖率基线治理域：定义「先实测、后判定是否钉地板」的口径——覆盖率数字只来自 worktree 内一次可复现的 v8 冷跑，落进 `.munk/baseline/coverage.json` 留档；是否把覆盖率变成门禁，由决策闸按实测值判定，不由人拍。本域管**覆盖率基线与「要不要接门」的判定**，不管门禁清单的形状与触发纪律（归 `quality-gates`：默认矩阵项数、追加纪律、条件 profile）、不管被测行为本身（`text` / `directory` / `structured` / `csv` / `theme` 各行为域）、不管测试清债棘轮（`quality-gates` 的 `test-debt-gate` / `.munk/baseline/test-debt.json`）、不管 renderer 与 jsdom 覆盖率（明确不设地板）。

## 范围

- **测量对象恰 22 个纯模块**（`src/core/**` 下全部非测试 `.ts`，合计约 7,559 行）：`text/{diff,normalize,merge,probe,lines,ruler}.ts`、`directory/{snapshot,compare,report,rows,filter,template,hash,sync}.ts`、`structured/{diff,locate,locateFallback,locateLine,parse}.ts`、`csv/align.ts`、`theme/contrast.ts`、`io.ts`。不含 `*.test.ts` / `*.test.tsx` / `__fixtures__/**` / 纯类型 `.d.ts`。
- **唯一测量命令**（逐字口径，provider 固定 v8、reporter 固定 text+lcov+json-summary、reportsDirectory 指向 change pack 证据目录）：`pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.include='src/core/**' --coverage.exclude='**/*.test.ts' --coverage.exclude='**/*.test.tsx' --coverage.exclude='**/__fixtures__/**' --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary --coverage.reportsDirectory=.munk/changes/<wi>/evidence/coverage-coding`。`@vitest/coverage-v8@5.0.5` 用仓库既有依赖，不新增依赖、不改 `package.json`。
- **基线文件 `.munk/baseline/coverage.json`**：`version` / `measuredAt {commit, date}` / `command` / `provider: "v8"` / `scope {include, exclude}` / `ignoreDirectives {v8, c8}` / `totals`（lines / branches / functions / statements 各带 `pct` 与 `covered` / `total`）/ `modules`（22 条相对路径，各带 lines / branches / functions / statements）/ `decision {floor, reason, thresholds}`。`measuredAt.commit` 必须是实跑时 worktree 的 `git rev-parse HEAD`，不得估计或沿用旧提交。
- **决策闸（先测后钉）**：`core branches ≥ 85% 且无单模块 < 60%` ⇒ 只留报告、不钉地板；`有模块 < 50%` ⇒ 报告即下一条 goal 加真断言的依据（列缺口、仍不钉地板）；其余情形才考虑把 `coverage-core` 接进矩阵。阈值集固定为 `coreBranchesMin: 85` / `moduleBranchesMin: 60` / `moduleBranchesStop: 50`。
- **现行判定：只留报告、不钉地板**（`decision.floor = false`）。因此 `.munk/code-gates.json` 不含 `coverage-core`，`vitest.config.mts` 不写 coverage thresholds / include / exclude，`scripts/` 不新增覆盖率门脚本；coverage 也不进 release 的 Quality gates job。
- **本次实测的核心数字**（commit `b83511f`）：core 总量 lines 98.12%（2090/2130）、branches 90.27%（1346/1491）、functions 99.5%（402/404）、statements 96.39%（2351/2439）；单模块最低 branches 为 `theme/contrast.ts` 75.00%（12/16），其余最低 `directory/sync.ts` 83.07%，无任何模块任一项 < 50%。
- **`src/core` 忽略指令计数为天花板**：`/* v8 ignore */` / `c8 ignore` 当前合计 0；该数字只许降不许升，升即视为降低分子分母可比性。
- **证据根目录映射**：报告与证据一律以 **worktree** 为根（`.../worktrees/codebase_b2d550b56d98d0c5/wi_intake_7e1cad0afa235fc2`），**不是**产品主检出面；报告禁止只给 worktree 解析不到的相对路径。

## 验收

- **ac-baseline-22-modules**：`.munk/baseline/coverage.json` 的模块集合与 `src/core/**` 下 22 个非测试 `.ts` 文件完全相等（无多、无缺）；不包含 `*.test.ts`、`__fixtures__/**`、纯类型 / `.d.ts` 条目；每个条目都有数值型 `lines` / `branches` / `functions`。
- **ac-baseline-matches-evidence**：baseline 中每个模块与 core 总量的百分比，与同一次运行的 `coverage-summary.json` 两位小数逐条相等；core 总量为 lines 98.12% (2090/2130)、branches 90.27% (1346/1491)、functions 99.5% (402/404)。
- **ac-coverage-command-recorded**：证据里逐字记录唯一测量命令，包含 `--coverage.provider=v8`、`--coverage.include=src/core/**`、`--coverage.exclude=**/*.test.ts`、`--coverage.exclude=**/*.test.tsx`、`--coverage.exclude=**/__fixtures__/**`、`--coverage.reporter=text,lcov,json-summary`；原始日志含 `Coverage enabled with v8`、`Test Files 125 passed`、`Tests 2025 passed | 1 skipped`，退出码 0。
- **ac-reproducible**：在 `b83511f` 上用同一命令冷跑复测，core 总量与 22 个模块的 lines / branches / functions 与 baseline 逐项一致（整数分子分母也一致）；出现差异必须停手如实写「未闭环」，不得改数字或换口径凑齐。
- **ac-decision-inputs**：报告写出决策闸的两个输入：core 整体 branches 90.27% ≥ 85%，且单模块最低 branches 为 `theme/contrast.ts` 75.00% ≥ 60%；据此判定「只留报告、不钉地板」。
- **ac-no-gate-added**：本轮不新增 `coverage-core` 门：`.munk/code-gates.json` 保持 version 1、门数与当时实测一致（本次核对为 27 门）、无 `coverage-core`；`scripts/` 不新增覆盖率门脚本；`vitest.config.mts` 不新增 coverage thresholds / include / exclude 配置。
- **ac-no-test-or-source-change**：本项 `git diff --name-only` 在 `src/**`、`scripts/**`、`vitest.config.mts` 上为空；`src/core` 内 `/* v8 ignore */` 与 `c8 ignore` 计数保持 0（baseline 记为天花板，只许降）；不新增覆盖率 exclude 模式、不拆文件改分子分母、不写空断言。
- **ac-no-release-surface-change**：`package.json` version、`CHANGELOG.md`、README 版本表、`.github/workflows/release.yml` dispatch 默认 tag、当前版 release notes、`docs/release-evidence/**` 零 diff；不改已公开 tag / Release / 资产。
- **ac-report-tables**：交付报告包含 core 总量四项与 22 行模块表（lines / branches / functions），并给出证据绝对路径且注明根目录映射为 worktree 还是产品目录，禁止只给 worktree 解析不到的相对路径。
- **ac-release-window-lock**：`code_gates` 在 v0.2.19 公开之前全绿时，不交棒 delivery、不合入 main；改为 `munk_report_owner` 报告「门已绿、等你放行合并」，等 Owner 放行后才走 delivery。
- **ac-no-renderer-floor**：renderer 与 jsdom 的覆盖率不设地板、阈值或 gate；不改 `src/renderer/**` 与测试环境配置。

## 非目标

- 不给 renderer / jsdom 设覆盖率地板或阈值（DOM 断言与分支覆盖不是一回事，设了只会诱导空断言）。
- 不新增测试、不写空断言、不重构、不拆文件、不为提升覆盖率改产品行为。
- 不追求把 22 个模块刷到 100%；基线轮次只做测量与判定。
- 不把覆盖率跑进 release 的 Quality gates job（该 job 现约 3 分钟；单次覆盖约 38 s，仍不接）。
- 不把覆盖率变成默认矩阵项或条件 profile 项；不新增依赖。
- 不做 Q6 测试清债动作（不改测试文件，Q6 前置门不触发）。
- 不动发布语义单点与已公开 tag / Release / 资产，不写 release notes 提治理。

## 实现约束

- **先测后钉是硬顺序**：① worktree 内 `pnpm install --frozen-lockfile`（主检出曾缺 `@vitest/coverage-v8`，但 `package.json` 与 `pnpm-lock.yaml` 均已有）→ ② 跑唯一命令 → ③ 按 22 个模块写 baseline → ④ 走决策闸 → ⑤ 只有判定要钉地板才把 `coverage-core` 写进 `.munk/code-gates.json` 并跑全量门。本轮判定不接门，故第 ⑤ 步不执行。
- **不得直接抄 Intake 结论**：Coding 必须在 worktree 内独立冷跑并复现；数字与 Intake 实测不一致、或最低模块跌破决策阈值时停手，在报告写清差异与「未闭环」，不得改口径、拆文件或加 ignore。
- **baseline 的排除项与 include 字面量必须原样入档**，便于后续 goal 在 diff 里直接看见任何新增 exclude 模式（新增 exclude 是最隐蔽的作弊路径）。
- **未来若加地板：地板只能升**；降低必须在 baseline 写一行理由（同 `test-debt.json` 的 `growth` 台账口径），不许改脚本；ignore 计数只许降。
- **范围纪律**：基线轮次只允许新增 / 修改 `.munk/baseline/coverage.json` 与该 WI 的 change pack；`src/**`、`scripts/**`、`vitest.config.mts`、`.munk/code-gates.json` 零 diff。
- **现有全量门必须全绿**（含 `test` 与 `test-debt-gate`），但不得为让门变绿放宽任何既有门；覆盖率不得被塞进 `test-debt-gate`（该门禁止扩成 `vitest run` / 覆盖率冷跑）。
- **发布窗口锁最高优先**：v0.2.19 已版本收敛在 `b83511f`，公开前不得合入 main、不得给发布点加变量；门已绿也要先 `munk_report_owner` 等 Owner 放行。

## 最近交付证明

- WI：`wi_intake_7e1cad0afa235fc2`（`src/core` 覆盖率基线治理：真跑 v8 覆盖率、22 模块实测入 `.munk/baseline/coverage.json`、决策闸判定「不钉地板」）
- 日期：2026-11-03
- 结果：worktree 内冷跑 exit 0，`Coverage enabled with v8`，`Test Files 125 passed (125)`、`Tests 2025 passed | 1 skipped (2026)`，墙钟 `real 39.68s`；`lcov.info` 的 `SF:` 条目 22 个；复现比对差异条目 **0**（22 模块 + total 的 `pct` / `covered` / `total` 三元组全等）。
- 覆盖摘要：core 总量 lines 98.12%（2090/2130）、branches 90.27%（1346/1491）、functions 99.5%（402/404）、statements 96.39%（2351/2439）；22 模块 lines 区间 95.45%（`io.ts`）–100%，branches 区间 75.00%（`theme/contrast.ts`）–100%，functions 区间 93.75%（`io.ts`）–100%；`decision.floor = false`，理由是 core branches ≥ 85% 且最低模块 75.00% ≥ 60%、无模块 < 50%。
- 证据：`.munk/changes/wi_intake_7e1cad0afa235fc2/evidence/coverage-coding/{coverage-summary.json,lcov.info,lcov-report/}` 与 `.../evidence/coverage-run-coding.log`（复测）；`.../evidence/coverage/` 与 `../coverage-run.log`（Intake 对照，未改动）。
- 注：① 本 WI change pack 仅提供 `prd.md` + `report.md` + 覆盖率证据，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合。② **被推翻的假设**：`quality-gates` 域文档记载默认矩阵 22 项，本项实测 `.munk/code-gates.json` 已是 **27 门**（比 22 项多出 `code-pair-actions`、`diff-normalize`、`diff-normalize-real`、`spike-launch-gate`、`spike-process-tree-gate`，`test-debt-gate` 仍在末位）；该域文档已滞后，后续任何引用「22 项」的断言（含 `ac-manifest-twenty-two-gates` 与钉板单测长度断言）需另开工作项回改，且新门禁只能末尾追加 + 同提交同步钉板。③ `directory/hash.ts` 与 `text/lines.ts` 的 v8 branches 总数为 0（无分支可测），按 v8 口径记 100%——后续若做地板判定，须把「0 分支模块」排除在最小值统计外，否则最低值口径会被拉成伪 100%。④ 本项只落基线、不接门，故 coverage 不进默认矩阵、不进条件 profile、不进 release Quality gates job；下一步若要真提覆盖率，应先针对 `theme/contrast.ts` 75% 与 `io.ts` 93.75% functions 补真断言（不钉地板）。⑤ 决策阈值为 `coreBranchesMin 85` / `moduleBranchesMin 60` / `moduleBranchesStop 50`，三者一起改动才算改口径，单改其一需在 baseline 记理由。
