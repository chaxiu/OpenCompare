# 覆盖率门对 0 可执行语句模块的显式豁免

## 范围

只改 `scripts/coverage-gate.mjs` 的模块级评估，让「0 可执行语句」模块（典型是纯 re-export 的空 barrel）显式豁免，而不是被 module set / 分支地板判红：

- `checkModuleSet`（`scripts/coverage-gate.mjs:230-245`）：当 fresh summary 多出或缺失的模块被证明 0 可执行语句时，不再计入 missing/extra；有可执行语句的模块仍保持双向严格集合相等（反分母收缩）。
- `checkModuleBranches`（`scripts/coverage-gate.mjs:277-295`）：0 可执行语句模块不参与 `moduleBranchesMin` 判定，也不进入 `module branches min` 的最低值报告（当前会打出误导性的「min: 0%」）。
- 新增审计输出：每个被豁免的模块都单独打印 `ok   exempt module <path>: 0 executable statements`，禁止静默跳过或「空集合恒真」。
- 新增正反自测，落在既有 `pnpm test` 收集面（`vitest.config.mts` include 的 `scripts/**/*.test.mjs`）。

判定口径（以 fresh summary 为准，fail-closed）：模块条目 `statements.total === 0 && lines.total === 0 && functions.total === 0 && branches.total === 0` 才算 0 可执行语句；任一项 total > 0、缺失、非整数或负数，都不豁免（真实 0 覆盖 `total > 0 && covered = 0` 必须继续红）。

## 验收

- ac-empty-barrel-module-set-exempt: fresh summary 含 baseline 未收录、四项 total 全为 0 的模块（如 `src/core/syntax/index.ts`）时，`node scripts/coverage-gate.mjs` 退出码 0，且 stdout 有该路径的 `exempt module <path>: 0 executable statements` 记录。
- ac-empty-barrel-missing-exempt: baseline 收录但 fresh summary 缺失的模块若在 baseline 中四项 total 全为 0，同样不因 module set 判红（退出 0）并打印同一条显式豁免记录。
- ac-zero-statement-branch-floor: 0 可执行语句模块即使 `branches.pct === 0` 也不触发 `module branches: ... < 75%`，且不出现在 `module branches min` 报告行中。
- ac-real-zero-coverage-still-red: 模块四项 total 中任一项 > 0（例如 `branches.total=4, covered=0, pct=0`）时，gate 非 0 退出，stderr 含 `module branches: <path> 0% < 75%`，且 stdout 无该模块的豁免记录。
- ac-exempt-auditable: 每个被豁免模块恰好有一条独立、带路径与「0 executable statements」依据的输出行；未豁免模块不得出现该行，且豁免数量与自动判定结果一致（不依赖固定白名单扩列）。
- ac-floors-scope-zero-relax: `.munk/baseline/coverage.json` 的 `floors.totals` 仍为 97/90/99、`floors.moduleBranchesMin` 75、`floors.ignoreDirectivesMax` 0、`floors.moduleBranchesMinExempt` 仍恰为 `src/core/directory/hash.ts` 与 `src/core/text/lines.ts`；`scope.include` 与三个 `scope.exclude` 字面量与顺序逐字不变；`measuredAt` 不变。
- ac-no-ignore-no-source-loss: `src/core/**` 的 `v8 ignore` / `c8 ignore` 计数仍为 0；本项 diff 对 `src/core/**` 的删除与修改文件数均为 0。
- ac-release-only-position: coverage gate 仍不出现在 `.munk/code-gates.json`（无新增 gate 命令）且未接入 `scripts/test-debt-gate.mjs`；新增自测由默认 `pnpm test` 实际执行并通过。
- ac-negative-preflight-intact: `pnpm test` 内既有负向自测仍为绿——`floor` 降低缺少 `floorLedger` 必红、`stale` baseline 必红（`scripts/coverage-gate-preflight.mjs` 的 `--negative floor|stale` 语义不被削弱）。

## 非目标

- 不恢复或改动任何 `src/core/**` 源码（含此前被删的 `src/core/syntax/index.ts`）；本项不靠增删源码取绿。
- 不做发布点重采样、不改 `measuredAt` / `totals` / `modules` / `command`（属后继项 coverage resample）。
- 不新增 baseline 字段来做白名单豁免，不放宽 `moduleBranchesMinExempt` 固定两项语义。
- 不改 `.github/workflows/release.yml`、`coverage-gate-preflight.yml` 的调用参数或门禁步骤，不把覆盖率门塞进默认交付矩阵。
- 不改 totals floors、`ignoreDirectivesMax`、`scope.include/exclude`，不新增 ignore 指令，不扩 exclude 缩小分母。
- 不做无关重构（不重命名现有导出、不改 freshness / ratchet 逻辑）。

## 实现约束

- 改动面锁定：`scripts/coverage-gate.mjs` + 新增或扩展的 `scripts/coverage-gate-*.test.mjs`（建议 `scripts/coverage-gate-zero-statement.test.mjs`）。不新增依赖，保持脚本无依赖、无网络、只读。
- 复用现有结构：把模块级判定抽成可导出的纯函数（如 `evaluateModuleCoverage(entries, baseline)`）并在 `main()` 中消费，沿用现有 `ok()` / `fail()` / `finish()` 输出契约与 `FAIL` / `ok   ` 前缀；现有导出 `evaluateBaselineFreshness`、`previousReleaseTag` 保持不变。
- `checkExemptModules`（`scripts/coverage-gate.mjs:247-275`）保持原样：固定两项 0 分支模块仍必须声明且 `branches.total === 0`；新豁免与该机制互不替代、互不放宽。
- 豁免必须来自 fresh summary 的实测 total，不得从路径名、文件名或硬编码清单推断；对 `total` 非整数 / 负数 / 缺失的条目按现有风格 `fail`（fail-closed），不得默认豁免。
- 自测要求：CLI 级正反断言用临时目录（仓库外）构造 `coverage-summary.json` 与临时 baseline 副本；baseline 副本的 `measuredAt.commit` 取当前 `git rev-parse HEAD`，保证 freshness 稳定且不写真实 `.munk/baseline/coverage.json`（跑完断言真实 baseline 字节未变）。测试需覆盖：空 barrel 多出 / 缺失、0 语句分支地板、真实 0 覆盖仍红、豁免行可审计、floors 与 scope 字面量静态不变。
- 完成后本地取证：`pnpm test`（含新自测）、`pnpm lint`、`pnpm typecheck` 全绿；交付说明附空 barrel 正例与真实 0 覆盖反例的原始输出与退出码。
