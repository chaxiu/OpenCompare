# 发布点覆盖率基线独立重采样

## 范围

本项只做一件事：在已公开 `v0.2.23` 之后的重采样点，以一次真实 v8 冷跑刷新 `.munk/baseline/coverage.json`，并用同一次产物实跑 `scripts/coverage-gate.mjs` 取证（positive 绿、negative floor / stale 红），附绝对路径证据。

具体面：

- 采样：按 `.github/workflows/release.yml` 的 `Coverage gate (src/core floors)` step 同一组按字面量（provider v8、include `src/core/**`、三个 exclude、reporter `json-summary`）跑 `vitest run --coverage`，`reportsDirectory` 落在仓库外（如 `$TMPDIR/coverage-gate-<stamp>/reports`）。当前 worktree HEAD 为 `82c32a8`（`git rev-list --count v0.2.23..HEAD` = 5），已过 `v0.2.23`，可作为采样点。
- 刷新基线：只改 `.munk/baseline/coverage.json` 的 `measuredAt {commit,date}`、`command`、`totals`、`modules`、`decision.reason`（数值需与本次实测一致）。`version` / `provider` / `scope` / `ignoreDirectives` / `floors` / `floorLedger` 原样保留。
- 取证：positive 门实跑退出 0；negative floor 与 negative stale 各退出 1 且错误文本符合预期；真实 baseline 在 negative 前后字节一致。
- 证据落盘 `.munk/changes/wi_ws_bbc28c351c07ec18/evidence/`（fresh summary 副本、正反输出、baseline 前后 diff、commit/date、命令原文），正文引用一律绝对路径。

## 验收

- ac-measured-at-post-v0.2.23: baseline `measuredAt.commit` 为 40 位小写 hex、`git cat-file -e <sha>^{commit}` 成功、从 HEAD 可达，且严格晚于 `v0.2.23`（`git rev-list --count v0.2.23..<sha>` ≥ 1，采样点不得是 `v0.2.23` 自身或其祖先）。
- ac-measured-at-real-date: `measuredAt.date` 为合法 ISO UTC 时间、等于本轮冷跑实际结束的 UTC 时刻、不晚于采样机系统时钟；不得手填未来时间或沿用旧日期。
- ac-totals-match-fresh-summary: baseline `totals` 的 lines / branches / functions / statements 四项 `pct` / `covered` / `total` 与本次 fresh `coverage-summary.json` 的 `total` 条目逐项严格相等（`pct` 按两位小数原值比对）。
- ac-modules-match-fresh-summary: baseline `modules` 与 fresh summary 中非 0 语句模块集合严格双向相等（当前 28 项），逐模块 lines / branches / functions / statements 的 `pct` / `covered` / `total` 与 fresh summary 一致；fresh 中出现但四项 total 全为 0 的模块按 0 语句豁免处理、不写入 baseline `modules` 来改变分母。
- ac-command-records-actual-run: baseline `command` 逐字记录本次真实执行的采样命令，且至少含 `--coverage.provider=v8`、`--coverage.include='src/core/**'`、三个 `--coverage.exclude=` 字面量（顺序 `**/*.test.ts`、`**/*.test.tsx`、`**/__fixtures__/**`）与 `--coverage.reporter=json-summary`；命令中的 `reportsDirectory` 指向仓库外真实路径。
- ac-scope-literals-unchanged: baseline `scope.include` 仍为 `src/core/**`，`scope.exclude` 仍恰为 `["**/*.test.ts","**/*.test.tsx","**/__fixtures__/**"]`（字面量与顺序逐字不变）；不新增 exclude、不改写 include。
- ac-floors-unchanged: `floors.totals` 仍为 `{lines:97, branches:90, functions:99}`、`moduleBranchesMin` 仍为 75、`moduleBranchesMinExempt` 仍恰为 `src/core/directory/hash.ts` 与 `src/core/text/lines.ts`、`ignoreDirectivesMax` 仍为 0、`ignoreDirectives.v8` 与 `.c8` 仍均为 0。
- ac-floor-ledger-unchanged: `floorLedger` 恰为现有 1 条 `{metric:"lines", from:98, to:97}`（`reason` 非空），不新增、不删除、不改写任何 ledger 条目。
- ac-decision-consistent: `decision.floor === true`、`decision.gate === "release-ci"`，且 `decision.reason` 中 lines / branches / functions 数字与本次实测 `totals` 一致。
- ac-positive-gate-exit-0: 用 fresh summary 绝对路径 + `--started-at` 毫秒前采样 + 三个 scope 字面量运行 `node scripts/coverage-gate.mjs`，退出码 0，stdout 含 `fresh summary:`、`totals lines: …`、`module set: 28 modules match baseline`、`module branches min: …`、`ignore directives: …`、`scope: include "src/core/**" …`、`floor ratchet …`、`baseline freshness: … is at or after v0.2.23` 与 `coverage gate passed in`。
- ac-negative-floor-red: 用仓库外临时 baseline 副本下调任一 floor（如 lines 97→96）且不补 `floorLedger`，`node scripts/coverage-gate.mjs --baseline <tmp>` 退出 1，stderr 含 `needs a matching floorLedger entry`；真实 `.munk/baseline/coverage.json` 前后 sha256 一致。
- ac-negative-stale-red: 用仓库外临时 baseline 副本把 `measuredAt.commit` 置为 `v0.2.23` 之前的真实提交（如 `2646a7611373b96aef4dc7cdd15c2d1a19f10713`），门退出 1，stderr 含 `older than the previous semver tag v0.2.23` 或 `is not reachable from HEAD`；真实 baseline 字节不变。
- ac-existing-selftests-green: 不修改 `scripts/coverage-gate*.mjs` 与其测试；`pnpm test` 仍实际收集并通过 `scripts/coverage-gate-freshness.test.mjs` 与 `scripts/coverage-gate-zero-statement.test.mjs`（positive / negative 行为不被本项削弱）。
- ac-ignore-directives-zero: 重采样后 `src/core/**` 的 `v8 ignore` / `c8 ignore` 计数仍为 0；不通过加 ignore 指令改变实测数字。
- ac-evidence-absolute-paths: 交付证据全部使用绝对路径：fresh `coverage-summary.json`、positive 原始输出与退出码、两条 negative 原始输出与内层退出码、baseline 前后 diff、采样 commit / date、实跑命令原文；不得只给 worktree 无法解析的相对路径。
- ac-no-residue-no-push: 运行后 `git status --short` 无临时 summary / lcov / 临时 baseline 残留；`git tag --list 'v9.9.9-rehearsal*'` 为空；仓库外临时目录可清理且不影响证据副本；全程无 `git push`、无远端 tag、无 release dispatch。
- ac-scope-freeze: `git diff --name-only` 只含 `.munk/baseline/coverage.json`、`.munk/changes/wi_ws_bbc28c351c07ec18/**`、本域文档 `.munk/baseline/domains/coverage-baseline/product.md`；`src/**`（含测试）、`scripts/coverage-gate*.mjs`、`vitest.config.mts`、`package.json`、`pnpm-lock.yaml`、`.munk/code-gates.json`、`.github/workflows/**` 零 diff。
- ac-no-release-surface: `package.json#version` 仍为 `0.2.23`；`CHANGELOG.md`、README 版本指针、`docs/release-notes/**`、`docs/release-evidence/**`、已公开 tag / Release / 资产零改动；不推 tag、不 dispatch、不 `gh release edit/upload/delete`。
- ac-floor-regression-escalation: 若任一实测 total 低于 floor 或任一模块 branches 低于 75（两个固定 0 分支豁免模块除外），不得下调 floor、不得补 ledger、不得改口径凑绿；须把实测值 / 地板值 / 差值写入 evidence 并 `munk_report_owner` 上报真回归。

## 非目标

- 不改 `scripts/coverage-gate.mjs` 判定逻辑、参数契约、输出契约，也不新增 / 修改 gate 自测（该工作已由 `coverage-empty-exempt` 完成）。
- 不改 floors（97/90/99）、`moduleBranchesMin` 75、`moduleBranchesMinExempt` 两项、`ignoreDirectivesMax` 0、`floorLedger`。
- 不改测量口径：provider、include、三个 exclude、reporter、模块集合定义；不新增 exclude 缩小分母，不新增 ignore 指令。
- 不改 `src/core/**` 源码或测试；不靠增删源码 / 测试取绿。
- 不把覆盖率门塞进 `.munk/code-gates.json`、条件 profile、`test-debt-gate` 或默认交付矩阵；仍只在发版 CI。
- 不动 `.github/workflows/release.yml`、`coverage-gate-preflight.yml` 的步骤、参数或触发方式。
- 不做版本收敛（`package.json#version`、默认 tag、CHANGELOG、README 指针、双语 notes、截图 provenance、visual baseline facts 属 `release-023-closeout` / `release-024-anchor`）。
- 不推 tag、不 push、不 dispatch release、不创建 / 修改 Release 与资产。
- 不给 renderer / jsdom 设覆盖率地板；不做无关重构。

## 实现约束

- **采样点与顺序**：先 `pnpm install --frozen-lockfile`（本 worktree 当前无 `node_modules`），在仓库外临时目录建 reports 目录，记录 `started_at`（epoch 秒）后启动 vitest；`measuredAt.commit` 取采样开始时 `git rev-parse HEAD`，`measuredAt.date` 取实际 UTC 完成时间。若 Coding 期间 `src/core/**` 出现任何改动，必须在新 HEAD 上重跑，不得沿用旧采样。
- **fresh 产物必须在仓库外**：`readFreshSummary` 会拒绝仓内 summary（`isInsideRepo` 判定）且要求 `mtime >= --started-at`；因此 gate 输入只能是 `$TMPDIR` 下的 `coverage-summary.json`，证据副本在运行结束后再拷入 `.munk/changes/wi_ws_bbc28c351c07ec18/evidence/`，副本不得回灌为下次 gate 输入。
- **literal 来源**：`.github/workflows/release.yml:197-220` 是采样与 gate 参数的唯一字面量来源；`scripts/coverage-gate.mjs` 的 `checkScope`（约 L400-424）要求 `--include` 恰传一次，且 `--exclude` 传参顺序与 baseline `scope.exclude` 的 `JSON.stringify` 完全一致。
- **baseline 写面**：文件键为 `version / measuredAt / provider / command / scope / ignoreDirectives / floors / floorLedger / totals / modules / decision`；`modules` 是对象（键为 `src/core/...` 路径，值含四项指标与 `path`）。仅按实测值改 `measuredAt`、`command`、`totals`、`modules`、`decision.reason`，其余键保持原字节语义。
- **negative 取证方式**：优先直接用 gate CLI 的既有参数（`--baseline <abs tmp>`）构造反例，避免为取证建 tag、跑重复冷跑；临时 baseline 放仓库外，测完删除。若改用 `scripts/coverage-gate-preflight.mjs --negative floor|stale`，须同时记录 wrapper 与内层退出码，并确认 `v9.9.9-rehearsal` tag 已删除、真实 baseline 前后字节一致。
- **floor 比较语义**：totals 用两位小数 `pct`，等于 floor 视为通过（`>=`）；单模块 branches 地板排除两个固定 0 分支模块与自动判定出的 0 语句模块。
- **证据目录**：`.munk/changes/wi_ws_bbc28c351c07ec18/evidence/`（worktree 绝对路径根）。本域文档 `.munk/baseline/domains/coverage-baseline/product.md` 在交付时追加本项「最近交付证明」，并同步其中 ac-baseline-matches-evidence / preflight 相关实测数字。
- **门禁**：交付前 `pnpm test`、`pnpm lint`、`pnpm typecheck` 全绿；`pnpm test` 内既有 coverage-gate 自测必须真实执行并通过；不得为让门变绿放宽任何既有门。
- **禁动面**：`src/**`、`scripts/coverage-gate*.mjs`、`vitest.config.mts`、`package.json` / `pnpm-lock.yaml`、`.munk/code-gates.json`、`.github/workflows/**`、版本 / 发布文档面零 diff；全程不 `git push`、不打 tag、不 dispatch。
