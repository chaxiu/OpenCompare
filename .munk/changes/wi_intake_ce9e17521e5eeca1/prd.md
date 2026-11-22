# 移除 coverage-gate 打 tag 即令基线过期的重采样锁

## 目标

消除每次发布打完 semver tag 后 .munk/baseline/coverage.json#measuredAt.commit 自动早于 previousReleaseTag 导致失败、迫使下版额外开重采样工单的自锁逻辑。文件边界仅限：scripts/coverage-gate.mjs 与 scripts/coverage-gate-freshness.test.mjs（严禁触碰 .munk/code-gates.json、src/munk-gates.test.ts 或 scripts/test-debt-gate.mjs）。快反馈命令：pnpm vitest run scripts/coverage-gate-freshness.test.mjs scripts/coverage-gate-zero-statement.test.mjs scripts/coverage-gate-preflight-cache.test.mjs scripts/coverage-gate-preflight-workflow.test.mjs

## 验收

- ac-1: 修改 scripts/coverage-gate.mjs（约 504-519 行），移除 !isAncestor(previousTag.sha, measuredAt.commit)（即 older than the previous semver tag）判红逻辑；保留 measuredAt.commit 必须有效且为 HEAD 祖先的校验，以及全部覆盖率阈值、单模块分支下限、零 ignore 指令与 include/exclude 一致性校验。
- ac-2: 在 scripts/coverage-gate-freshness.test.mjs（约 64-76 行）中将原 fails when the baseline predates the previous tag 用例原地替换为断言『当 baseline commit 早于 previous semver tag 但仍是 HEAD 祖先时校验通过』（保持该文件 it() 用例总数不变，以免触发 test-debt 用例数波动），并保留非 HEAD 祖先提交必红的用例。
- ac-3: 在当前 v0.2.26 已打 tag 的提交树上，scripts/coverage-gate-*.test.mjs 全部单测通过。
