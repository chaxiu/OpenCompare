# 把 src/core 覆盖率基线钉成发版级硬门（release CI，每版一次）

## 范围

- 在 `.github/workflows/release.yml` 的 **Quality gates** job 内新增 **一步**：先在本 job 内用既有 `@vitest/coverage-v8@5.0.5` 跑一次 `src/core/**` 覆盖率，产出 `json-summary` 到 `$RUNNER_TEMP` 下的临时目录，再调用新增的 `scripts/coverage-gate.mjs` 与 `.munk/baseline/coverage.json` 比对。单次新增开销按实测约 38 s。
- 新增 `scripts/coverage-gate.mjs`：纯 Node ESM、零新增依赖、零网络、只读；**测量输入只允许是本 job 刚产出的新鲜 `coverage-summary.json`**，baseline 只作为策略与期望值来源。
- 更新 `.munk/baseline/coverage.json`：新增 `floors`（totals lines ≥98 / branches ≥90 / functions ≥99、单模块 branches ≥75、0 分支模块豁免清单、ignore 指令上限 0）与照 `test-debt.json` `growth` 写法的 `floorLedger`；把 `decision` 从「只留报告、不钉地板」改为「发版级硬门」；并按本 worktree 的实际复测刷新 `measuredAt`。
- 覆盖率门**只进 release CI**，不进 `.munk/code-gates.json`，不改变现有 27 道门的清单、命令与阈值。
- 交付证据：workflow 变更行、本地裸跑正常树 pass 输出、临时调低后的 fail 输出、覆盖率跑 + 门脚本耗时。

## 验收

- ac-release-step-in-quality-gates: `.github/workflows/release.yml` 的 `Quality gates` job 内新增且仅新增一个覆盖率门步骤（位于 `pnpm test` 之后、`pnpm build` 之前）；该步骤不设 `continue-on-error`，覆盖率命令与 `node scripts/coverage-gate.mjs` 在同一 step 内串行，任一失败即 job 失败。该 job 的其他步骤逐字不变（wrapping 行数除新增 step 外零改动）。
- ac-gate-script-single-source: `scripts/coverage-gate.mjs` 存在、可被 `node scripts/coverage-gate.mjs` 直接执行；不新增 npm 依赖、不 import 仓库运行时源码、不访问网络；所有数字只从新鲜 summary 与 `.munk/baseline/coverage.json` 读取，脚本内不保留 floor 数值副本（仅保留计量口径常量：百分位取 `pct`、集合相等、枚举豁免模块）。
- ac-fresh-artifact-fail-closed: 未传 `--summary`、文件不存在、路径解析到仓库内 `.munk/` 或其它仓内历史产物、mtime 早于 `--started-at`（epoch 秒）任一条成立时，门以非 0 退出并打印失败原因；不存在「产物缺失就跳过」或「回退读仓内旧 summary」的分支。正常新鲜产物时该检查通过。
- ac-totals-floors: 以新鲜 summary 的 `total` 为准，`lines.pct >= 98`、`branches.pct >= 90`、`functions.pct >= 99` 三项同时成立才通过；任一低于 floor 时门非 0 退出并点名该指标与实测值。baseline `floors.totals` 恰为 `{lines: 98, branches: 90, functions: 99}`。
- ac-module-branches-floor: 对新鲜 summary 中除 `src/core/directory/hash.ts`、`src/core/text/lines.ts` 外的每个模块，`branches.pct >= 75`；低于 75 的模块逐个点名并以非 0 退出。豁免清单恰为这两项，且门校验这两项在新鲜 summary 中的 `branches.total === 0`（0 分支模块不得被冒名豁免）。
- ac-module-set-equality: 新鲜 summary 的模块相对路径集合与 baseline `modules` 的键集合完全相等；缺模块或多模块（新增 `src/core/**` 文件、或覆盖率命令新增 exclude 导致模块消失）均非 0 退出，并在输出中列出差异路径。该检查与 `scope` 检查共同保证任何「缩小分母」的改动都会当场变红。
- ac-ignore-directives-zero: 门扫描 `src/core/**` 的 `.ts` 源码中 `v8 ignore` / `c8 ignore` 指令计数，必须 `<= 0`（即 0）；注入任一指令后门非 0 退出并给出文件与计数。baseline `ignoreDirectives` 保持 `v8: 0` / `c8: 0`，`floors.ignoreDirectivesMax` 为 0。
- ac-scope-literal-equality: workflow 把覆盖率命令使用的 `--include` 与三个 `--exclude` 字面量原样传给门；门要求这些字面量与 baseline `scope` 逐字（含顺序）完全一致：include 为 `src/core/**`，exclude 恰为 `**/*.test.ts`、`**/*.test.tsx`、`**/__fixtures__/**`。新增任一 exclude、改写 include 或改变顺序均非 0 退出。
- ac-floors-ratchet-only: 地板只升不降。当前 baseline 的 `floors.totals.*` 与 `moduleBranchesMin` 低于上一发布 tag 的 baseline、或低于上一次已提交 baseline 时，必须存在一条 `floorLedger` 记录（`metric` / `from` / `to` / 非空 `reason`，`from` 等于旧值、`to` 等于新值）才放行；没有记录或记录不匹配则非 0 退出。无历史锚点时打印 `first landing` 放行。禁止通过改脚本常量放宽。
- ac-baseline-freshness: `.munk/baseline/coverage.json` 的 `measuredAt.commit` 必须是 40 位小写十六进制真实提交、可从 HEAD 到达，且不早于「HEAD 之前最近的 semver tag」（即该 tag 的严格后代或相等）；`measuredAt.date` 为合法 ISO 时间。当前 `b83511f` 在 `v0.2.19` 之前，若未刷新则门非 0 退出并报「baseline stale」。本轮交付必须把 `measuredAt` 刷新为本 worktree 实际复测时的 HEAD 与时间，不得保留 `b83511f`。
- ac-normal-tree-pass: 在未修改的 worktree 上，用本 job 同口径命令产出新鲜 summary 后裸跑 `node scripts/coverage-gate.mjs ...`，退出码为 0；输出逐项列出 totals（lines / branches / functions）、模块最低 branches、模块集合、ignore 计数、scope、floor ratchet、measuredAt freshness 的 `ok` 行，并打印门耗时。
- ac-reverse-selftest-totals: 复制新鲜 summary，把任一 totals 数字临时调低（例如 `lines.pct` 改为 97 或 `branches.pct` 改为 89），门必须以非 0 退出并点名该 totals 指标；恢复原 summary 后回 0。临时改动不得留在交付树。
- ac-reverse-selftest-module: 复制新鲜 summary，把任一参与最小值的单模块 branches 临时调低（例如 `theme/contrast.ts` 改为 60），门必须以非 0 退出并点名该模块；恢复后回 0。临时改动不得留在交付树。
- ac-reverse-selftest-ratchet: 临时把 baseline 的 totals floor 或 `moduleBranchesMin` 调低且不写 `floorLedger`，门必须以非 0 退出并报 ratchet / ledger；补上合法 `floorLedger` 记录后放行；恢复 baseline 后回 0。若 worktree 尚无已提交锚点，使用门提供的 `--previous-baseline` 指向恢复前的 baseline 完成同一条断言。禁止把调低值或临时 ledger 留在交付树。
- ac-existing-gates-intact: `.munk/code-gates.json` 零 diff（仍为 `version: 1`、27 道门、id / 顺序 / command / `cwd` 逐字不变），不新增 `coverage-core` / `coverage-gate` 等门；`vitest.config.mts` 不新增 coverage thresholds / include / exclude；现有门阈值与清单不变。
- ac-no-test-source-change: `git diff --name-only` 在 `src/**`（含全部测试文件）、`vitest.config.mts`、`package.json` / `pnpm-lock.yaml` 上为空；不新增依赖、不改测试、不为凑覆盖率改产品源码或加 ignore。
- ac-no-release-surface-change: `package.json` version、`CHANGELOG.md`、README 版本表、`docs/release-notes/**`、`docs/release-evidence/**`、`.github/workflows/release.yml` 的 dispatch 默认 tag 均零 diff；不改已公开 tag / Release / 资产（含 v0.2.19 及更早）。
- ac-evidence-and-timing: 交付报告 / digest 附：① `release.yml` 新增步骤的变更行；② 本地裸跑正常树 pass 的原始输出与退出码；③ totals 与单模块临时调低后的 fail 原始输出；④ 覆盖率冷跑墙钟与门脚本自身耗时（门自身应为秒级，不含 vitest），并写明预计每版新增约 38 s。
- ac-release-only-not-per-delivery: 覆盖率门在默认交付流程（`.munk/code-gates.json`）中不存在；只有 release workflow 的 Quality gates job 会执行它。任何把覆盖率跑或该门加入 `code_gates`、`test-debt-gate` 或条件 profile 的改动均视为违反本项。

## 非目标

- 不把覆盖率门接进每次交付的 `code_gates`、`.munk/code-gates.perf.json` 或 `test-debt-gate`。
- 不改 `.munk/baseline/coverage.json` 的测量口径：provider 仍为 v8，include 仍为 `src/core/**`，exclude 仍为三个既有字面量，测量命令与 evidence 路径规则不变；只新增 floors / ledger / decision 并刷新 measuredAt 与实测数字。
- 不新增测试、不改任何测试文件、不写空断言、不重构、不拆文件、不改 `src/core` 源码。
- 不给 renderer / jsdom 设覆盖率地板。
- 不改现有 27 道门的清单、命令、阈值与顺序。
- 不动 version / CHANGELOG / README 版本表 / release notes / release evidence / 已公开 tag / Release / 资产。
- 不提高实测覆盖率目标，不借机补测试；本轮只把已测得的底线钉成发版硬门。

## 实现约束

- 文件锚点：workflow 步骤加在 `.github/workflows/release.yml` 的 `Quality gates` job 中现有 `- run: pnpm test` 之后、`- run: pnpm build` 之前；脚本为 `scripts/coverage-gate.mjs`；策略文件为 `.munk/baseline/coverage.json`。
- 新鲜产物目录必须用 `$RUNNER_TEMP`（如 `$RUNNER_TEMP/coverage-gate`），步骤开始时先清空该目录，`--started-at "$(date +%s)"` 在 vitest 启动前采样；不得使用 `.munk/changes/**` 或任何仓库内历史 evidence 作为本次输入。
- 覆盖率命令的 include / exclude 字面量与 baseline `scope` 必须由同一个 step 同时传给 vitest 和门脚本，避免「跑的口径」与「校验的口径」各写一份。
- `.munk/baseline/coverage.json` 新增结构（2 空格缩进、无尾逗号）：
  - `floors.totals = { "lines": 98, "branches": 90, "functions": 99 }`
  - `floors.moduleBranchesMin = 75`
  - `floors.moduleBranchesMinExempt = ["src/core/directory/hash.ts", "src/core/text/lines.ts"]`
  - `floors.ignoreDirectivesMax = 0`
  - `floorLedger: []`（降低地板时才追加 `{metric, from, to, reason}`，写法同 `.munk/baseline/test-debt.json` 的 `growth`）
  - `decision` 改为 `floor: true`、`gate: "release-ci"`，理由写明「实测 98.12 / 90.27 / 99.5，按实测值直接钉地板，只进发版 CI」。
- 地板比较使用 `coverage-summary.json` 的两位小数 `pct`；等于 floor 视为通过（`>=`）。单模块最小值统计排除且仅排除两个 0 分支模块，其余模块一个都不能低于 75。
- 门的失败必须一次性列出所有不通过项（不因第一项失败就静默其余项），任何失败均 `process.exit(1)`；成功时打印每项 `ok` 与 `coverage gate passed in <x.xx>s`。
- 门脚本允许提供 `--baseline` / `--previous-baseline` / `--previous-tag` 等覆盖参数用于反向自测；生产 workflow 不传这些覆盖参数，使用仓库内 canonical baseline 与 git 推导的上一发布 tag。
- 反向自测完成后必须把 summary、baseline 与任何临时文件恢复原状；交付树只保留正式改动。
- 时间窗：本项须在 **2026-11-04 22:00 内容截止**前完成合入；不得为此改动版本号或发布面。
