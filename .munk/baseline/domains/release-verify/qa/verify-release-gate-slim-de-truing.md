# verify-release-gate 测试瘦身与去真值化（599 → 500 行 / 单一读取入口 / 合成版本）

- WI：`wi_intake_27a374d63891b37b`
- 域：`release-verify`（`src/verify-release-gate.test.ts` 的断言形态与行数纪律；被测对象仍是 `scripts/verify-release.mjs` 的纯函数与 `post-release-verify.yml` 契约，不是产品行为）
- 来源：`.munk/changes/wi_intake_27a374d63891b37b/prd.md`（change pack **只有这一份**，无 `tests/cases/**` / `tech.md` / `ux/**`，按 prd AC 逐条落档；`needSelfTest=false`）
- 改动面：`src/verify-release-gate.test.ts` **+137 / −237**（599 → **500** 行）；无新增测试文件
- 零 diff：`scripts/verify-release.mjs`、`scripts/verify-release.d.mts`、`.github/workflows/post-release-verify.yml`、`.munk/code-gates.json`、`package.json`、任何产品源码

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-target-file-size | `wc -l < src/verify-release-gate.test.ts` = **500** ≤ 500（基线 599，净减 99）；压缩手段为合并重复 `describe`、把 13 条平台 fail 腿 / fail-closed 字段 / B 层轮次收敛为参数表（`failCases`、`platform legs`、`fail-closed summary`），未删行为分支 | 满足 |
| ac-single-read-entry | `grep -c readFileSync` = **1**（`const readBytes = (path) => fs.readFileSync(path)`，`readText` / `readJson` 由其派生）；`grep -c 'toContain('` = **0**；`git status --porcelain \| grep -E '^\?\?.*\.test\.ts'` 无输出 | 满足 |
| ac-behavior-preserved | `pnpm test src/verify-release-gate.test.ts` = **46 passed (46)**、0 skipped；全仓 collected **1852** ≥ 1779。仍各有一条断言在跑：A 层 15 项 registry（`A-layer check registry`）、平台过滤（`expectedCheckIds(platforms)`）、CLI 参数拒绝（`--threshold` / `--max-retained` / `--tolerance` 报错）、A 层全绿与零 heap / 零本机 6.4 GiB 访问（`FakeHost` 记录路径）、13 条平台 fail 腿（`platform legs` 参数表）、missing / unexpected / skip / count / env / evidence / step fail-closed、三平台聚合、B 层三轮与 16 MiB 线（`HAPPY_HEAP` / 阈值用例）、`judgeReleaseGate` 纯函数、AST 结构契约（`ts.createSourceFile`）、post-release workflow 契约（YAML `parse`）、code-gates 清单契约（解析 `.munk/code-gates.json`） | 满足 |
| ac-synthetic-version | `TAG = 'v9.9.9'` / `VERSION = '9.9.9'` / `ENVIRONMENT` 合成；文件内 `v?0\.2\.16` 命中 **0**；`judgeReleaseGate` / `validateSummary` / `normalizeVersion` 等判定逻辑零改动 | 满足 |
| ac-gates-green | `verify-release-gate` 门（`pnpm test src/verify-release-gate.test.ts`）exit 0、**46 passed**、17.91s；Host `code_gates` 21 门全绿（`.munk/runs/run_intake_27a374d63891b37b/code-gates/attempts/001`） | 满足 |
| ac-no-assertion-relocation | 断言全部留在本文件；Markdown 断言改读 `markdownAtoms`（标题 / 代码 span / 表格单元格 / 列表项）而非原文整句；未把断言搬入 helper / `docs/` / `.munk/` / `scripts/` | 满足 |

## 口径与陷阱注记

- **用例数 71 → 46 不是覆盖下降**：合并的是同一失败路径的多份同构断言（13 条平台腿收敛为参数表），参数表增行即增用例；新增断言优先扩表，不要另起独立 `it`。
- **行数门的正确解法是收敛结构**：合并 `describe`、抽出 `fakeStep` / `summaryFrom` / `validSummary` 等构造器；禁止把断言搬进新文件规避门，也禁止删行为断言凑行。
- **单一读取入口的收益**：新增读取只能走 `readBytes` → `readText` / `readJson`，不会出现绕过 helper 的 `readFileSync` 漂移，也天然满足行数门。
- **合成版本必须贯穿**：tag / version / 资产名 / 环境字段全部合成（`9.9.9` / `v9.9.9`），真实版本只从 `package.json` 运行时派生；不要把 `0.2.16` 写回任何 judge 入参。
