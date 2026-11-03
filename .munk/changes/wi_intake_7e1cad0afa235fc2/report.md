# src/core 覆盖率基线报告（v8，实测复现）

- 测量提交：`b83511fb9c3f4b158d913acf7f487405d5ec6108`（v0.2.19 版本收敛点，未改动）
- 根目录映射：本报告所有相对路径与证据均以 **worktree** 为根：
  `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_7e1cad0afa235fc2`
  （**不是**产品主检出面）
- 结论：**只留报告、不钉地板**；未新增 `coverage-core` 门，未改测试、未改产品源码、未动 release 面。

## 1. 测量命令（唯一，逐字记录）

```
pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.include='src/core/**' --coverage.exclude='**/*.test.ts' --coverage.exclude='**/*.test.tsx' --coverage.exclude='**/__fixtures__/**' --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary --coverage.reportsDirectory=.munk/changes/wi_intake_7e1cad0afa235fc2/evidence/coverage-coding
```

冷跑结果（worktree 内，`pnpm exec` 直接使用既有 `@vitest/coverage-v8@5.0.5`，未新增依赖）：

- 退出码 `0`；墙钟 `real 39.68s`（Intake 报 37.84s，差异仅为机器噪声，不影响覆盖率数字）
- `Coverage enabled with v8`
- `Test Files 125 passed (125)`
- `Tests 2025 passed | 1 skipped (2026)`
- `lcov.info` 中 `SF:` 条目 22 个

## 2. 复现一致性（coding 冷跑 vs intake 证据）

以 `coverage-summary.json` 逐条比对 22 个模块 + core 总量（`pct` / `covered` / `total` 三元组全等）：

- 模块键集合相等：23 键（22 模块 + `total`）
- 差异条目：**0**
- core 总量：lines 98.12% (2090/2130)、branches 90.27% (1346/1491)、functions 99.5% (402/404)、statements 96.39% (2351/2439)

## 3. core 总量（四项）

| 指标 | 百分比 | 覆盖/总数 |
| --- | --- | --- |
| lines | 98.12% | 2090/2130 |
| branches | 90.27% | 1346/1491 |
| functions | 99.5% | 402/404 |
| statements | 96.39% | 2351/2439 |

## 4. 22 个模块（lines / branches / functions，均为百分比）

| 模块 | lines | branches | functions |
| --- | --- | --- | --- |
| `src/core/csv/align.ts` | 100 | 92.53 | 100 |
| `src/core/directory/compare.ts` | 98.79 | 89.27 | 100 |
| `src/core/directory/filter.ts` | 100 | 95.65 | 100 |
| `src/core/directory/hash.ts` | 100 | 100 | 100 |
| `src/core/directory/report.ts` | 99.33 | 84.44 | 100 |
| `src/core/directory/rows.ts` | 100 | 95.12 | 100 |
| `src/core/directory/snapshot.ts` | 97.95 | 92 | 100 |
| `src/core/directory/sync.ts` | 96.87 | 83.07 | 98.07 |
| `src/core/directory/template.ts` | 95.7 | 89.51 | 100 |
| `src/core/io.ts` | 95.45 | 92.59 | 93.75 |
| `src/core/structured/diff.ts` | 98.41 | 97.82 | 100 |
| `src/core/structured/locate.ts` | 97.89 | 88.75 | 100 |
| `src/core/structured/locateFallback.ts` | 100 | 100 | 100 |
| `src/core/structured/locateLine.ts` | 100 | 92.85 | 100 |
| `src/core/structured/parse.ts` | 100 | 90 | 100 |
| `src/core/text/diff.ts` | 99.38 | 93.97 | 100 |
| `src/core/text/lines.ts` | 100 | 100 | 100 |
| `src/core/text/merge.ts` | 98.36 | 90.9 | 100 |
| `src/core/text/normalize.ts` | 100 | 100 | 100 |
| `src/core/text/probe.ts` | 96.66 | 93.33 | 100 |
| `src/core/text/ruler.ts` | 100 | 92.53 | 100 |
| `src/core/theme/contrast.ts` | 97.77 | 75 | 100 |

注：`directory/hash.ts` 与 `text/lines.ts` 的 v8 branches 总数为 0（无分支可测），报告中按 v8 口径记 100%。

## 5. 决策闸（先测后钉）

| 输入 | 实测 | 阈值 | 判定 |
| --- | --- | --- | --- |
| core 整体 branches | 90.27% | ≥ 85% | 满足 |
| 单模块最低 branches | `theme/contrast.ts` 75.00%（12/16） | ≥ 60% | 满足 |
| 是否存在模块 branches < 50% | 无（其余最低 `directory/sync.ts` 83.07%） | 触发停止 -> 报告缺口 | 未触发 |

判定：**只留报告、不钉地板**（`decision.floor = false`）。不新增 `coverage-core` 门，`vitest.config.mts` 不新增 coverage thresholds / include / exclude。

## 6. 范围与零 diff 声明

- 新增/修改仅：`.munk/baseline/coverage.json`、`.munk/changes/wi_intake_7e1cad0afa235fc2/**`
- `src/**`、`scripts/**`、`vitest.config.mts`、`.munk/code-gates.json`、`package.json` / `CHANGELOG.md` / README 版本表 / `release.yml` / `docs/release-evidence/**` 零 diff
- `.munk/code-gates.json` 保持 `version: 1`、恰 27 道门、无 `coverage-core`
- `src/core` 内 `/* v8 ignore */` / `c8 ignore` 计数：0（baseline 记为天花板，只许降）
- 不新增依赖、不新增测试、不写空断言、不拆文件

## 7. 证据绝对路径（worktree 根）

复测（本项 coding 冷跑）：

- 日志：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_7e1cad0afa235fc2/.munk/changes/wi_intake_7e1cad0afa235fc2/evidence/coverage-run-coding.log`
- json-summary：`.../evidence/coverage-coding/coverage-summary.json`
- lcov：`.../evidence/coverage-coding/lcov.info`
- lcov-report：`.../evidence/coverage-coding/lcov-report/`

Intake 侧对照证据（未改动，用于逐条比对）：

- 日志：`.../evidence/coverage-run.log`
- json-summary：`.../evidence/coverage/coverage-summary.json`
- lcov：`.../evidence/coverage/lcov.info`
- lcov-report：`.../evidence/coverage/lcov-report/`

基线文件：`.../.munk/baseline/coverage.json`（含 `measuredAt.commit` / `date`、`command`、`provider`、`scope`、`ignoreDirectives`、`totals`、`modules`、`decision`）。
