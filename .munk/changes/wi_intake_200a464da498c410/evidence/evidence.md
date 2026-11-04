# Evidence — wi_intake_200a464da498c410

Worktree (absolute): `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_200a464da498c410`
Evidence dir (absolute): `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_200a464da498c410/.munk/changes/wi_intake_200a464da498c410/evidence`

Both legs ran on this one machine, in this one session, with the same commands as the workflows (soak: `pnpm test:soak -- --rounds=50`; coverage: three `node scripts/coverage-gate-preflight.mjs ...` runs). Environment: Darwin arm64 / macOS 15.6.1, Node v24.4.1, pnpm 10.18.3. This is not bit-for-bit identical to GitHub `ubuntu-latest`; commands and measurement scope are identical, the image is not claimed to be.

## 1. Changed files

- `scripts/spike-process-tree-soak.mjs` — machine-readable case selection and per-round verdict.
- `.munk/baseline/coverage.json` — module set now 23 (adds `src/core/theme/tokens.ts`), totals refreshed, `floors.totals.lines` 98→97 with a single `floorLedger` entry, `measuredAt` advanced to `0809e5b...`.
- `.munk/changes/wi_intake_200a464da498c410/**` — this change pack and evidence.

`src/**`, `src/spike-process-tree-gate.test.ts`, `scripts/coverage-gate.mjs`, `scripts/coverage-gate-preflight.mjs`, `.github/workflows/**`, `package.json#version`, `CHANGELOG.md`, release docs: zero diff.

## 2. Leg 1 — soak (normal 50 rounds + reverse self-tests)

Default filter is the real contract case:
`spike CLI teardown > reaps the tree and keeps the process-exited contract on the failure path`
resolved via `vitest list src/spike-process-tree-gate.test.ts --json`; the round verdict comes from each round's `--reporter=json --outputFile=...` report (selected case must be `passed`, no failed case, exactly 1 passed). No ANSI text summary is parsed.

| Case | Command | Exit | Key output |
| --- | --- | --- | --- |
| Normal 1 round | `node scripts/spike-process-tree-soak.mjs --rounds=1` (also run under `CI=1 FORCE_COLOR=1`) | 0 | `round 1/1 passed`, `1/1 passed` — `evidence/soak-ansi-proof.log` |
| Normal 50 rounds | `pnpm test:soak -- --rounds=50` | 0 | `50/50 passed (total 21.20s)`; every round the same contract case — `evidence/soak-50-rounds.log` |
| ANSI proof | `CI=1 FORCE_COLOR=1 node scripts/spike-process-tree-soak.mjs --rounds=1` | 0 | `1/1 passed` — `evidence/soak-ansi-proof.log` |
| Zero match | `node scripts/spike-process-tree-soak.mjs --rounds=1 --filter=no-such-case` | 1 | `matched 0 cases ...`, then all 11 available case names — `evidence/soak-zero-match.log` |
| Multi match (>1) | `node scripts/spike-process-tree-soak.mjs --rounds=1 --filter='reaps the tree'` | 1 | `matched 2 cases ...`, then all 11 available case names — `evidence/soak-multi-match.log` |

Zero-match available case list (verbatim in the log) includes:
`spike CLI teardown > reaps the tree and keeps the process-exited contract on the failure path`.

## 3. Leg 2 — coverage baseline + three preflight runs

Fresh measurement (release口径, cold v8 run, reports in `$TMPDIR`):
`pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.include='src/core/**' --coverage.exclude='**/*.test.ts' --coverage.exclude='**/*.test.tsx' --coverage.exclude='**/__fixtures__/**' --coverage.reporter=json-summary --coverage.reportsDirectory="$TMPDIR/oc-coverage-wi200a"`
Exit 0. Fresh summary copy: `evidence/coverage-fresh/coverage-summary.json`.
Fresh totals exactly match the PRD: lines 98.12 (2141/2182), branches 90.15 (1373/1523), functions 99.51 (414/416), statements 96.28 (2411/2504); 23 modules; `src/core/theme/tokens.ts` = lines 98.07 (51/52), branches 84.37 (27/32), functions 100 (12/12), statements 92.3 (60/65). `evidence/baseline-vs-fresh.log` shows 23/23 modules and matching totals.

| Preflight | Command | Wrapper exit | Key output |
| --- | --- | --- | --- |
| Positive | `node scripts/coverage-gate-preflight.mjs` | 0 | `PREFLIGHT positive: PASS`, `PREFLIGHT overall: PASS`, `module set: 23 modules match baseline`, `totals lines: 98.12% >= 97%`, branches 90.15 ≥ 90, functions 99.51 ≥ 99, `module branches min: src/core/theme/contrast.ts 75% >= 75%`, `baseline freshness: ... is at or after v0.2.20`, `lines 98 -> 97 documented by floorLedger` — `evidence/preflight-positive.log` |
| Negative floor | `node scripts/coverage-gate-preflight.mjs --negative floor` | 0 | inner gate exit 1 with `lines 98 -> 96 needs a matching floorLedger entry`; `PREFLIGHT negative floor: PASS` — `evidence/preflight-negative-floor.log` |
| Negative stale | `node scripts/coverage-gate-preflight.mjs --negative stale` | 0 | inner gate exit 1 with `measuredAt.commit ... is older than the previous semver tag v0.2.20`; `PREFLIGHT negative stale: PASS` — `evidence/preflight-negative-stale.log` |

`ac-preflight-head-tag-not-counted`: the rehearsal tag was created on HEAD in every run and the gate still reported `is at or after v0.2.20`, so HEAD's own tag was skipped. (An initial attempt launched the floor and stale runs in parallel; the shared diff-normalize fixture temp dir raced and that attempt failed. Both were re-run sequentially and the logs above are from the clean sequential runs.)

## 4. Residue / no-release checks

- `git tag --list 'v9.9.9-rehearsal*'` → empty (all three logs also show `PREFLIGHT rehearsal tag removed: PASS`).
- Every preflight log shows `PREFLIGHT baseline untouched: PASS`; the real baseline bytes were not modified by rehearsal runs.
- `package.json#version` = 0.2.21; no `git push`, no `gh release`, no `release.yml` dispatch.
- `measuredAt.commit` = `0809e5b583b6d30d0fc93ab72e10da8fdb7479d0`, `git rev-list --count v0.2.20..<commit>` = 36 (≥ 1), reachable from HEAD.
- `evidence/checks.log` records environment, diff scope, freshness, and residue results.
