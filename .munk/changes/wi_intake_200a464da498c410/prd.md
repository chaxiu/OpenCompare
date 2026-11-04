# 修复两条发版预检恒红：soak 空跑护栏 + 覆盖率 module set

## 范围

只修 main `0809e5b` 上阻断 v0.2.20 / v0.2.21 重发的两条 workflow_dispatch 预检，不碰产品行为：

1. **腿 1（Spike process-tree preflight，run 41929755149）**：`scripts/spike-process-tree-soak.mjs` 的 soak 选取逻辑。CI 证据显示用例其实跑了（`1 passed | 10 skipped`），但护栏正则 `/Tests\s+1 passed/` 被 vitest 的 ANSI 颜色码打断，于是误报 `ran no matching case` 并恒红。修复要同时做两件事：把过滤串钉到真实契约用例全名；把「是否命中」改成机器可读判定，命中数为 0 时显式失败并打印该文件当前全部可用用例名。只改 soak 脚本 / 测试选取逻辑，进程树回收实现（`src/main/**`、`src/spike-process-tree-gate.test.ts` 的被测逻辑）不动。
2. **腿 2（Coverage gate preflight，run 41929748543）**：`.munk/baseline/coverage.json` 的 module set。`src/core/theme/tokens.ts` 在 baseline 刷新（`11170a5`）之后才加入，fresh summary 因此出现 23 个模块而 baseline 仍是 22 个，门报 `unexpected modules in fresh summary: src/core/theme/tokens.ts`。把 tokens.ts 按同一次 fresh summary 纳入 module set；按 owner 约定把 `floors.totals.lines` 由 98 降到 97 并在 baseline 写唯一一条 `floorLedger` 理由；`measuredAt` 推进到本次过门 commit；freshness 继续只认 `previousReleaseTag()`。不改覆盖率测量口径、不改门脚本分流、不新增 `exclude`。

两腿的绿证据都必须在本地用与两个 workflow 完全相同的命令跑出，并写入本 WI evidence。

## 验收

### 腿 1：soak 过滤与零命中护栏

- ac-soak-filter-hits-contract: 默认过滤串解析后恰好命中 1 个用例，其全名为 `spike CLI teardown > reaps the tree and keeps the process-exited contract on the failure path`（`vitest list src/spike-process-tree-gate.test.ts --json` 可核对）；`node scripts/spike-process-tree-soak.mjs --rounds=1` 退出 0 且输出 `round 1/1 passed`，不再出现 `ran no matching case`。
- ac-soak-zero-match-hard-fail: 用 0 匹配的过滤串运行 soak（如 `--filter=no-such-case` 或临时改成错误串）时，脚本退出码非 0，打印命中数 0，并逐行打印该测试文件当前全部可用用例名（至少包含上面的契约用例全名）；不得静默 pass，不得用 skip 掩盖。
- ac-soak-ansi-proof: 命中判定来自机器可读结果（`vitest list --json` 与每轮 `--reporter=json`/JSON 结果文件），不再依赖带 ANSI 的颜色摘要行；在 `CI=1 FORCE_COLOR=1` 下跑 `--rounds=1` 仍退出 0。
- ac-soak-requires-passed-not-skipped: 每轮只有在命中的那 1 个用例状态为 `passed`、且没有 failed/skipped 顶替时才计为通过；命中 0 个或命中 >1 个都按失败处理并打印候选用例名。
- ac-soak-50-rounds-green: `pnpm test:soak -- --rounds=50` 退出 0，输出 `50/50 passed`，全程命中同一契约用例。
- ac-soak-scope-only: 本腿改动只落在 `scripts/spike-process-tree-soak.mjs`；`src/spike-process-tree-gate.test.ts` 与进程树回收实现零 diff，不整文件重写测试。
- ac-soak-reverse-evidence: evidence 中留有反向自测证据：错误过滤串的完整命令、非 0 退出码、输出里打印的可用用例名列表；以及正常过滤串 50 轮的完整命令与 `50/50 passed`。

### 腿 2：覆盖率 module set / 地板 / freshness

- ac-baseline-includes-tokens: `.munk/baseline/coverage.json` 的 `modules` 键集合等于新鲜 `coverage-summary.json` 的模块集合（23 个），新增 `src/core/theme/tokens.ts` 一条，其 lines / branches / functions / statements 与同一次 fresh summary 逐项一致（本轮实测 lines 98.07、branches 84.37、functions 100、statements 92.3），且 branches 满足既有单模块地板 75。
- ac-baseline-scope-unchanged: `provider` 仍为 `v8`；`scope.include` 仍为 `src/core/**`；`scope.exclude` 仍逐字为 `["**/*.test.ts","**/*.test.tsx","**/__fixtures__/**"]`；`command` 原文不变；不得为 tokens.ts 新增 exclude 或改测量口径。
- ac-lines-floor-97-with-single-ledger: `floors.totals` 恰为 `{lines:97, branches:90, functions:99}`；`floorLedger` 恰有 1 条 `{metric:"lines", from:98, to:97, reason:<非空且写明把 tokens.ts 纳入 module set>}`；`moduleBranchesMin` 仍 75、豁免清单与 `ignoreDirectivesMax:0` 不变；除此之外没有任何地板被下调。
- ac-baseline-totals-refresh: `totals` 四项 `pct`/`covered`/`total` 与同一次 fresh summary 完全一致（本轮实测 lines 98.12 2141/2182、branches 90.15 1373/1523、functions 99.51 414/416、statements 96.28 2411/2504），`decision.reason` 中引用的 lines / branches / functions 数字与 totals 一致。
- ac-baseline-freshness-after-v0220: `measuredAt.commit` 为 40 位小写 hex、`git rev-list --count v0.2.20..<commit>` ≥ 1、从 HEAD 可达；`measuredAt.date` 为本次实测的真实 ISO UTC 时间；freshness 仍只调用 `previousReleaseTag()`（`sha === HEAD` 的 tag 被跳过），源码不出现 `latestReachableTag`。
- ac-preflight-positive-green: `node scripts/coverage-gate-preflight.mjs` 退出 0，输出含 `PREFLIGHT positive: PASS`、`PREFLIGHT overall: PASS`、`module set: 23 modules match baseline`，且逐项 `ok totals lines: 98.12% >= 97%`、branches ≥90、functions ≥99、`module branches min: ... >= 75%`、`baseline freshness: ... is at or after v0.2.20`。
- ac-preflight-negative-floor-green: `node scripts/coverage-gate-preflight.mjs --negative floor` wrapper 退出 0，内层门 exit 1 且含 `needs a matching floorLedger entry`（97→96 不匹配 98→97 的唯一 ledger 行），证明 ledger 只认这一条路径。
- ac-preflight-negative-stale-green: `node scripts/coverage-gate-preflight.mjs --negative stale` wrapper 退出 0，内层门 exit 1 且含 `older than the previous semver tag v0.2.20` 或 `not reachable from HEAD`。
- ac-preflight-head-tag-not-counted: 预演 tag 建在当前 HEAD 上时 freshness 仍以 v0.2.20 为基准（输出 `is at or after v0.2.20`），HEAD 自身 tag 不参与比较；预演 tag 不推远端，跑完本地删除。
- ac-preflight-no-residue: 三条 preflight 跑完后 `git tag --list 'v9.9.9-rehearsal*'` 为空；真实 `.munk/baseline/coverage.json` 字节与预演前一致；无临时 summary/baseline 残留在仓内；全程无 `git push`、无 `gh release`、无 dispatch `release.yml`。

### 通用

- ac-code-gates-all-green: 全量 `.munk/code-gates.json` 自绿（含 install / lint / typecheck / build / build-web / test / 全部行为门 / test-debt-gate），不得为让门变绿放宽或删除任何既有门。
- ac-no-product-or-release-change: `package.json#version` 仍为 `0.2.21`；`CHANGELOG.md`、README 版本表、`docs/release-notes/**`、`docs/release-evidence/**`、`.github/workflows/**`、`src/**` 零 diff；不 bump 版本、不推 tag、不 dispatch release workflow、不创建/修改 Release 与资产。
- ac-change-pack-scope: 交付 diff 仅含 `scripts/spike-process-tree-soak.mjs`、`.munk/baseline/coverage.json`、`.munk/changes/wi_intake_200a464da498c410/**`；`scripts/coverage-gate.mjs`、`scripts/coverage-gate-preflight.mjs`、`.github/workflows/coverage-gate-preflight.yml` 与 `release.yml` 零 diff。
- ac-evidence-absolute-paths: evidence 使用 worktree 绝对路径落盘，至少包含：① 两腿修改文件清单；② soak 正常 50 轮与错误过滤串反向自测的完整命令、退出码、关键输出；③ 三条 coverage preflight 的完整命令、wrapper 与内层门退出码、`PREFLIGHT overall: PASS`/负档预期红；④ fresh `coverage-summary.json` 副本或可定位绝对路径；⑤ 预演 tag 已删、baseline 未被预演改动、无 push 的检查结果；⑥ 本地运行环境指纹（OS/arch、Node、pnpm）并在回执里说明与 GitHub `ubuntu-latest` 的实际差异，不得声称逐位同镜像。
- ac-evidence-same-runner-both-legs: 两腿证据在同一台本地机器、同一次会话内用与 workflow 相同的命令产出（soak: `pnpm test:soak -- --rounds=50`；coverage: 三条 `node scripts/coverage-gate-preflight.mjs ...`），回执同时给出两腿命令与结果，避免一边一环境。

## 非目标

- 不改进程树回收实现、spike CLI 行为、`src/spike-process-tree-gate.test.ts` 的断言或超时预算。
- 不改覆盖率门脚本 `scripts/coverage-gate.mjs` / `scripts/coverage-gate-preflight.mjs` 的判定与分流，不改 release workflow / coverage preflight workflow 的形状与命令。
- 不为凑覆盖率新增 `src/**` 测试、不改任何测试文件、不加 `v8 ignore` / `c8 ignore`、不改 `vitest.config.mts` 或 `.munk/code-gates.json`。
- 不调低 lines 以外的任何地板；除这一条 `lines 98→97` 外不新增 `floorLedger` 记录。
- 不改产品行为、不 bump 版本、不改 CHANGELOG / 发布说明、不推 tag、不 dispatch release workflow、不创建或修改 Release 与资产。
- 不整文件重写 soak 脚本或测试；不做与两条预检无关的清理与美化。

## 实现约束

- **腿 1 文件锚点**：`scripts/spike-process-tree-soak.mjs`。默认 `TEST_FILTER` 改为真实用例名子串（建议 `reaps the tree and keeps the process-exited contract on the failure path`）；轮次前用 `vitest list src/spike-process-tree-gate.test.ts --json` 取全量用例名并做匹配，命中数必须恰为 1；每轮用 `--reporter=json --outputFile=<临时文件>` 或等价机器可读输出判定命中用例状态为 `passed`，不再解析带 ANSI 的 `Tests 1 passed` 文本；命中 0 时打印全部可用用例名并以非 0 退出；提供 `--filter=<pattern>`（或等价）覆盖口以便反向自测，正常 CI 路径仍用默认串。
- **腿 2 文件锚点**：`.munk/baseline/coverage.json`。`modules` 按 fresh summary 增加 `src/core/theme/tokens.ts`（lines 98.07 / branches 84.37 / functions 100 / statements 92.3）；`totals` 刷新为 lines 98.12（2141/2182）、branches 90.15（1373/1523）、functions 99.51（414/416）、statements 96.28（2411/2504）；`floors.totals.lines = 97`；`floorLedger = [{"metric":"lines","from":98,"to":97,"reason":"..."}]`，reason 明写「把 src/core/theme/tokens.ts 纳入覆盖 module set，新增模块含 1 行不可达防御分支，保留 1 个点余量，本次唯一地板下调」；`measuredAt.commit` 取采样开始时 `git rev-parse HEAD`（当前 base `0809e5b`，严格晚于 v0.2.20），`measuredAt.date` 取真实 UTC 落盘时间；`decision.reason` 数字同步为 98.12 / 90.15 / 99.51。
- **实测值来源**：先按 release 同口径跑一次新鲜 v8 冷跑（`--coverage.provider=v8 --coverage.include='src/core/**'` + 三个 exclude + `--coverage.reporter=json-summary`，报告目录写 `$TMPDIR`），baseline 只从这次 summary 抄数；若复测值与本 PRD 记录不一致，停手把差异写进 evidence 并上报，不得改数字凑齐。
- **预演顺序**：先落 baseline 改动，再跑 `node scripts/coverage-gate-preflight.mjs`、`--negative floor`、`--negative stale`；预演脚本自身会在 HEAD 建 `v9.9.9-rehearsal` 并在 `finally` 删除，不得 push。`fetch-depth: 0` 已由 workflow 保证，本地需有 `v0.2.20` tag 才能验证 `previousReleaseTag()`。
- **反向自测**：soak 用错误过滤串跑一次必须红并列出可用用例名；coverage 的负档由 `--negative floor`（97→96）与 `--negative stale`（previous tag 之前的 commit）天然覆盖，另可按需复制 summary 调低 totals/单模块 branches 验证，但临时文件不得留在交付树。
- **环境**：两腿都在本 worktree 同一台机器上执行并记录 `uname -sm`、`node -v`、`pnpm -v`；本地是 macOS / Node 24 时不得声称与 GitHub `ubuntu-latest` 逐位同镜像，只声明命令与测量口径一致。
- **提交纪律**：不改 `.munk/code-gates.json` 门清单；evidence 写到 `.munk/changes/wi_intake_200a464da498c410/evidence/`；交付回执按「改了哪些文件 / 两条预检本地绿证据（命令 + 结果 + 路径）/ 反向自测证据」三段写清。
