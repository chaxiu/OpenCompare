# 补齐 0.2.25 发版用的覆盖率基线采样

## 范围

- 只改覆盖率基线与其证据：重采样 `src/core` 覆盖率，把 `.munk/baseline/coverage.json#measuredAt` 指向 `v0.2.24..main` 区间内一个已过门 commit（建议当前 main tip `3d300b7`，若分支创建时 main 已前进则用当时的、已过门的 main tip），并同批更新 `totals` / `modules`。
- 采样必须在新 worktree 里对该采样点做一次冷跑，命令沿用 `.munk/baseline/coverage.json#command` 的形态（v8、`--coverage.include='src/core/**'`、三个 exclude 字面量保持逐字节一致、`--coverage.reporter=json-summary`、reportsDirectory 指向本次临时目录）。
- 证据落 `artifacts/work-items/<workItemId>/runs/<runId>/evidence/**`：采样点 sha 与 tree、`git tag --contains <采样点>`、`git log --oneline v0.2.24..<采样点> -- .munk/baseline/coverage.json`、before / after 两份 json-summary 及各自 sha256、`git diff --stat <采样点>..HEAD`（只允许出现 `.munk/baseline/**` 与本单证据路径）、gate 命令与 exit code。形状照上一周期的 `baaa8bc`（`chore(coverage-baseline): resample post-v0.2.23 baseline and fold delivery proof`）。

## 验收

- ac-sample-point: `node -e` 读 baseline 后断言 `measuredAt.commit` 为 40 位小写 sha、`measuredAt.date` 为合法 ISO，且 `git merge-base --is-ancestor v0.2.24 <sha>` 与 `git merge-base --is-ancestor <sha> HEAD` 均返回 0；evidence 里给出这两条命令的实际 exit。
- ac-cold-run-proof: evidence 含本次冷跑的完整命令、reportsDirectory、`fresh-coverage-summary.json` 与 sha256，且该结论由本次运行产出，不得复用历史采样文件。
- ac-gate-green: 在交付树上跑 `node scripts/coverage-gate.mjs`（release.yml gates job 同一口径、默认 baseline）exit 0，输出含 `baseline freshness: measuredAt.commit ... is at or after v0.2.24` 一类绿灯行；同时反向自测仍有效：把任一 totals 数字调低后该门必须 fail（留 exit 与 stderr 证据）。
- ac-floors-not-relaxed: `floors.totals` 不低于现状 lines 97 / branches 90 / functions 99；`moduleBranchesMin` 仍为 75、`moduleBranchesMinExempt` 仍只有 `src/core/directory/hash.ts` 与 `src/core/text/lines.ts`；`ignoreDirectivesMax` 仍为 0；`scope.include` / `scope.exclude` 字面量与改动前逐字节一致。任何地板下调必须只在 `floorLedger` 追加一条带理由的记录，且不得同时放宽其它指标。
- ac-xlsx-accounted: `src/core/xlsx/*.ts` 三个新模块必须出现在新 baseline 的 `modules` 里并各自达到 module 分支门；若低于 75，补测试或按 floorLedger 口径说明，不得把它们塞进 exempt、不得新增 exclude、不得加 ignore 指令。
- ac-release-surface-untouched: 不修改 `package.json#version`、`docs/release-notes/v0.2.25*.md`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`；`git diff --name-only` 只含 `.munk/baseline/**` 与本单证据 / change-pack 路径。
- ac-gates-and-delivery: 全量 `code_gates` 与专项门绿，`delivery-result.json` 记录本次 `latestAttemptId` 与 mergeTreeSha；合入前确认合并对象是分支 tip。

## 非目标

- 不改 `scripts/coverage-gate.mjs`、不改门禁阈值脚本逻辑、不新增 / 删除 gate 条目。
- 不改任何产品代码、不补业务测试（除 xlsx 模块分支线不足时的必要测试）。
- 不做版本收敛、不 tag、不 dispatch 任何 workflow、不建 / 改 Release。

## 实现约束

- 覆盖率采样一次测量多次复用：复用键须含 tree sha + 预检脚本内容哈希 + 关键环境参数；键缺失或不确定即 fail-closed 重测，禁止跨树复用。
- `floorLedger` 只为真实、已解释的下调写行；不得用改脚本或放宽 exclude 的方式换绿灯。
- 采样点必须是已过门 commit；不得为采样去 tag / cherry-pick / 改发布点代码。

## 本单执行约束（不 fold）

- 单条写项按一个 ≤150K 上下文交付：先落盘基线改动与证据，再跑门；超范围拆项不硬跑。
- 授权路径：`.munk/baseline/**`、`.munk/changes/<workItemId>/**`、`artifacts/work-items/<workItemId>/**`，以及 xlsx 模块分支线不足时该模块的 `*.test.ts`。
- 停手线：任何需要改 `scripts/coverage-gate.mjs`、exclude 字面量、exempt 列表或版本锚点的路径，一律停手上报，不得自行放行。
- 交付回执必须点名：采样点 sha / tree、基线 before→after 的 totals 与 floors 差异、反向自测 exit、`node scripts/coverage-gate.mjs` 在交付树上的 exit、门禁 attemptId。
