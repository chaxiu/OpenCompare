# Q6 测试清债回归门：棘轮 baseline + 零容忍字面量（只新增门与快照）

## 范围

给「测试清债」立一道零容忍、确定性、快的回归门，防止已完成的 Q3/Q4/Q5 成果回潮（整文件重写、真值字面量回流、断言弱化）。**本项只新增门与 baseline，不重写任何测试文件。**

1. **一个脚本 + 一个 baseline JSON**：
   - `scripts/test-debt-gate.mjs`：纯 Node ESM，只读、确定性、无网络、零写入；单次硬预算 ≤20 s。
   - `.munk/baseline/test-debt.json`：所有数字来自实测，脚本只读它，不把数字抄进 TS/脚本常量。
2. **注册为第 22 门**：`.munk/code-gates.json` 末尾追加 `{ "id": "test-debt-gate", "cwd": ".", "command": "node scripts/test-debt-gate.mjs" }`（单 argv），前 21 项 id / 顺序 / command / cwd 逐字不动；同一次改动同步 `src/munk-gates.test.ts` 的期望矩阵与长度断言（最小追加，不重排）。
3. **判据（裁定后的口径）**：
   - a. **只减不增的棘轮**：baseline 记 ceilings（`appTestLines` / `syncRealGateLines` / `pairLines` / `repoTestLines`）与 floors（`appTestCases` / `syncRealGateCases` / `repoTestCases`）；门断言当前值 ≤ ceilings、≥ floors。**不设 5,000 硬常量**（5,000 是 Q5 的交付目标，由 Q5 自证、Owner 签收）。
   - b. **baseline 只许收紧**：把任一 ceiling 调大或任一 floor 调小，门必须红。锚点取该文件在 git 历史中的已提交版本（元素级最紧值）；该文件尚无任何提交历史时（首次落地）放行并记录该事实。
   - c. **清债 harness 预算**：固定常量 400 行为单个上限、400 行为合计上限；清单来自 baseline 的 `harness.files`（当前为空；规则先立）。
   - d. **零容忍字面量**：`.ts` / `.tsx`（`src/**`、`scripts/**`、`docs/**`）内不得出现当前发布版本字面量（由 `package.json#version` 运行时派生，含 `v` 前缀）与 64 位十六进制资产 sha256 字面量；标准测试向量 `sha256("")` / `sha256("abc")` 走 baseline 显式白名单。历史发布锚点 `0.2.1`–`0.2.15` 按 Q4 口径**不在**禁令内。
   - e. **docs/yml 只断结构**：本门不对 `docs/**`、`*.yml` 做任何原文断言；并禁止 doc-reading 测试文件回退到「整句原文」断言（见 ac-docs-yml-structural）。
   - f. **ESLint 兜底**：把「整文件重写 / 大段删除」的可机检信号做成一条规则 `opencompare/no-test-sentinel`（内联 plugin，不引新依赖）：测试文件 0 个 `expect(`，或用 `it(` / `test(` 字面量计数当哨兵，即红。
4. **约定时序**：实现、四条注入、22 门可先做完；**最终交付的 baseline 必须重录自「已含 Q5 瘦身结果」的 main**（两文件合计 ≤5,000 行的状态）。若收尾时 main 仍为 6,210 行（Q5 未合），**停手上报等放行**，不得把 6,210 当最终快照交付，也不得手写 5,000 让门当场红。

### 基线实测（本 worktree，main = `97a18f3`，2026-11-02）

| 指标 | 实测值 | 命令 |
| --- | --- | --- |
| `src/renderer/src/App.test.tsx` | 3,449 行 | `wc -l < src/renderer/src/App.test.tsx` |
| `src/sync-real-gate.test.ts`（`src/main/...` 不存在） | 2,761 行 | `wc -l < src/sync-real-gate.test.ts` |
| 两文件合计 | **6,210 行** | 上两行相加 |
| App.test.tsx 用例 | **95**（94 个 `it(` + 1 个 `test(`，字面量计数会少 1） | `grep -cE '\b(it\|test)\('` 仅作对照；门必须用收集结果 |
| sync-real-gate 用例 | **32** | 同上 |
| 全仓测试文件 / 行数 | 115 / 43,984（vitest include `src/**/*.test.ts(x)`） | `find src \( -name '*.test.ts' -o -name '*.test.tsx' \) ...` |
| 全仓用例数 | 未测（`node_modules` 缺失，需 `pnpm install` 后 `vitest list`） | 交付时实测并写入 baseline |
| `.ts(x)` 当前版本字面量（0.2.16） | 0（`scripts/verify-release.mjs` 的 7 处是 `.mjs` 注释，不在扫描面） | `grep -rn '0\.2\.16' src scripts docs --include='*.ts' --include='*.tsx'` |
| `.ts(x)` 64 位 hex 字面量 | 6 处，恰好 2 个标准向量 | `grep -rEn '[0-9a-f]{64}' src --include='*.ts' --include='*.tsx'` |
| doc-reading 测试文件的整句字面量断言 | 0 | 见 ac-docs-yml-structural 的扫描口径 |

## Acceptance Criteria

- ac-baseline-json: `.munk/baseline/test-debt.json` 存在且可 `JSON.parse`，`version === 1`；含 `ceilings`（`appTestLines` / `syncRealGateLines` / `pairLines` / `repoTestLines`，均为正整数）、`floors`（`appTestCases` ≥ 95、`syncRealGateCases` ≥ 32、`repoTestCases` 为正整数）、`harness`（`perFileMaxLines: 400`、`totalMaxLines: 400`、`files: []`）、`literalWhitelist.sha256`（恰为 `e3b0c442…` 与 `ba7816bf…` 两个标准向量）、`measuredAt`（`commit` 为 40 位 git sha、`date` 为 ISO 日期）。文件内不出现 `0.2.16`。
- ac-baseline-measured: 在 `measuredAt.commit` 对应的树上重新测量，四项 ceiling、三项 floor 与 baseline 完全一致；脚本中不存在这些数字的字面量副本（脚本只从 baseline 读取）。
- ac-ceiling-ratchet: 当前任一 ceiling 指标超过 baseline 值即退出码非 0，输出同时包含指标名、实测值与 ceiling；未超限时退出码 0。
- ac-floor-ratchet: 当前收集到的 `App.test.tsx` / `sync-real-gate.test.ts` / 全仓用例数分别低于对应 floor 即退出码非 0，输出指标名、实测值与 floor；不低于时退出码 0。
- ac-baseline-tighten-only: 在 baseline 已提交的树上，把任一 ceiling 调大或任一 floor 调小后运行门，退出码非 0 并指出「baseline 只许收紧」及指标名；还原后退出码 0。该文件无任何提交历史时，本项检查放行且输出「first landing」字样。
- ac-cases-collected: 两文件用例数取自 vitest 收集结果（`vitest list --json` 或等价只收集不执行的接口），不使用 `it(` / `test(` 字面量计数；门输出逐文件打印收集数，`App.test.tsx` 打印 95（证明字面量 94 不是判据）。
- ac-harness-budget: 门对 `harness.files` 逐项断言「文件存在且行数 ≤ 400」，并对合计断言 ≤ 400；清单为空时放行；把清单指向一个 >400 行的文件时退出码非 0 并指出文件名与行数。
- ac-version-literal: 版本字面量由 `package.json#version` 运行时派生，扫描 `src/**`、`scripts/**`、`docs/**` 的 `.ts` / `.tsx`；出现 `<version>` 或 `v<version>` 字面量即红并打印文件:行:内容；当前树上为 0 处；历史 `0.2.1`–`0.2.15` 不触发。
- ac-asset-sha-literal: 同一扫描面上出现 64 位小写 hex 字符串字面量、且不在 `literalWhitelist.sha256` 内即红并打印文件:行；当前 6 处命中全部属于白名单两值；注入一个新的伪造 64 位 hex 即红。
- ac-docs-yml-structural: `scripts/test-debt-gate.mjs` 不读取 `docs/**` 与 `*.yml`（若将来读取，必须经 `yaml` 解析后按字段/`steps[].run` 序列断言，不得正则/整句匹配）；同时对「含 `docs/` 或 `.yml` 路径字面量的 `.test.ts(x)`」做回归扫描：`toContain(...)` / `includes(...)` 的直接字符串实参若含中文句读（`，` `。` `；` `：` `、`）或 ≥8 个空白分隔英文词即红；当前树命中数为 0。
- ac-eslint-rule: `eslint.config.mjs` 以内联 plugin 注册规则 `opencompare/no-test-sentinel`（不新增依赖），作用域为 `**/*.test.{ts,tsx}`；`pnpm lint` 在当前树 exit 0；注入一个 `expect(` 计数为 0 的测试文件（或 `match(/it\(/g)` 式计数哨兵）后 `pnpm lint` 非 0 且报错含该规则 id；删除注入后回 0。交付须贴规则名与真实命中输出。
- ac-speed: `node scripts/test-debt-gate.mjs` 连续 3 次均 ≤20 s（交付贴逐次耗时）；不跑 `vitest run`、不跑覆盖率、不启 Electron、不构建。
- ac-injection-four: 四条注入全部真实变红、恢复后回绿，贴命令与输出：① 两文件合计加行至超过 `ceilings.pairLines`（Q5 前为 6,210；Q5 后为实测值）→ 红；② 在 `.ts` 中插入 `0.2.16` 字面量 → 红；③ 删除一条用例使 `App.test.tsx` 由 95→94 → 红；④ 调大 `/ 调小` baseline 的 ceiling / floor → 红。注入改动不得留在交付树中。
- ac-gates-22: `.munk/code-gates.json` 恰 22 项，`gate[21].id === "test-debt-gate"`、`command === "node scripts/test-debt-gate.mjs"`、`cwd === "."`，前 21 项逐字逐序未变；`src/munk-gates.test.ts` 长度断言与期望矩阵同步为 22 且 `pnpm test` 绿；交付树全量 `code_gates` 22/22 passed，交付贴 attempt 号、`manifest.summary` 与 `failedGateIds: []`。
- ac-q5-final-snapshot: 最终交付的 baseline 录自「两文件合计 ≤5,000 行」的 main（Q5 已合），`measuredAt.commit` 等于该 main 提交；ceiling 取实测值，不硬编码 5,000。收尾时若 main 仍为 6,210 行，必须在交付前停手上报（写明实测行数与 Q5 未合），不得以 6,210 快照交付。
- ac-product-untouched: 不修改产品运行时代码、`package.json`（version / scripts / 依赖）、`src/renderer/src/App.test.tsx`、`src/sync-real-gate.test.ts`、`src/verify-release-gate.test.ts`、`scripts/verify-release.mjs`、任何 tag / Release / 发布资产；不新增依赖。
- ac-docs-count-sync: 最终树中 `.munk/baseline/tech/overview.md` 的质量门禁一书写「默认矩阵 22 项」（只改计数与清单事实，不改写整句）；`docs/perf/large-directory-memory.md` 无门禁计数断言则不强制改。
- ac-diff-scope: 相对交付基线，`git diff --name-only` 仅含 `scripts/test-debt-gate.mjs`、`.munk/baseline/test-debt.json`、`.munk/code-gates.json`、`src/munk-gates.test.ts`、`eslint.config.mjs`、`.munk/baseline/tech/overview.md`（Delivery fold 允许追加域基线文档）。

## Non-Goals

- 不把 5,000 当今日硬常量，不代 Q5 证明其 ≤5,000 目标，不在门里写死 5,000。
- 不重写、不瘦身、不重排 `App.test.tsx` / `sync-real-gate.test.ts`（Q5 的活），不删改任何既有用例或断言。
- 不按验收点拆新门文件；不新增第二个 gate 条目；不改前 21 门的 id / 顺序 / command。
- 不跑 `pnpm perf:gate` / `perf:dir`、不做覆盖率冷跑、不把全量 vitest 之外的重操作塞进默认门。
- 不引入新依赖（`yaml` 已在 devDependencies），不改 `pnpm-lock.yaml`。
- 不动版本号、`CHANGELOG.md`、README、`electron-builder.yml`、`.github/workflows/**`、已公开 tag / Release。
- 不为了变绿放宽任一判据、删用例、改 baseline 数字或把红写成绿。

## Implementation Constraints

- 交付形状严格为「一个脚本 + 一个 JSON + 既有门清单与钉板的最小追加」；ESLint 规则写进现有 `eslint.config.mjs` 的内联 plugin，不新增文件。
- 脚本为纯 Node ESM，只依赖 Node 内置模块（如需解析 yml 可用已存在的 `yaml`）；只读、幂等、无网络、无临时写盘；失败输出必须点名指标、实测值、阈值，便于定位。
- 用例数一律用收集（`vitest list --json`），禁止 `it(` 计数与 `vitest run`；行数用 `wc -l` 口径（与实测表一致）。
- 版本字面量在脚本里由 `package.json#version` 派生；baseline 里不得出现 `0.2.16`；标准向量白名单存 baseline，不写进 TS。
- 棘轮锚点：读取 `.munk/baseline/test-debt.json` 在 git 历史中的已提交版本（`git log --format=%H -- <path>` + `git show`），对 ceilings 取历史最小值、对 floors 取历史最大值作为下限/上限；无历史时放行并打印 `first landing`。该机制必须在 baseline 提交后可复现 ac-baseline-tighten-only。
- 若 Q5 的交付导致用例数下降（低于 95 / 32 或全仓收集数下降），不得下调 floor 收口——停手上报（与 ac-baseline-tighten-only 冲突）。
- Q5 载体核实：`munk/wi_intake_335d0d0cbf0533bd` 已是 main 的祖先（`git rev-list --count <branch> ^main` = 0，`git diff --name-only main...<branch>` 为空），不是瘦身载体；最终快照按**实测口径**判定（main 两文件合计 ≤5,000），不要以分支号当放行条件。
- 注入验证前先确认工作区干净；注入后贴真实失败输出，恢复后贴回绿输出；交付树不得残留注入。
- 域基线（`.munk/baseline/domains/quality-gates/product.md`）的 fold 由 Delivery 承担；本项只保证 manifest / 钉板 / 脚本 / baseline / ESLint / 计数事实一致。
