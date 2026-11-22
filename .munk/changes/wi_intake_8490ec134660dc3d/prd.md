# 修好覆盖率预检的过期基线反向探针

## 范围

- `scripts/coverage-gate-preflight.mjs` 的 `--negative stale` 反向探针：W2 已删除「基线 commit 早于上一 semver tag 即判红」的逻辑，但 preflight 仍用 `previousTag.sha^`（现在仍可达 HEAD）当过期样本，导致 `results.stale=false`、`PREFLIGHT overall: FAIL`，`.github/workflows/coverage-gate-preflight.yml` 在 `pull_request` 上即红。
- 把该样本改成真正「不可达 HEAD」的 commit（如 `git commit-tree` 悬空提交或 orphan 提交），断言错误信息命中 `is not reachable from HEAD`。
- 为 stale 判定补一条单测（`scripts/coverage-gate-preflight.test.mjs`，若不存在则新建），覆盖「可达则不算过期、不可达才算过期」。

## 验收

- ac-stale-pass: 在 W2 后的 coverage-gate 语义下，`node scripts/coverage-gate-preflight.mjs --negative stale` 以 0 退出并输出 `PREFLIGHT overall: PASS`。
- ac-stale-assert: 反向探针的过期样本为不可达 HEAD 的 commit，且断言文案覆盖 `is not reachable from HEAD`；若样本仍可达，探针必须判失败。
- ac-test: 新增单测覆盖 stale 两种分支（可达 vs 不可达），`pnpm test` 相关文件全绿。
- ac-scope: 除 preflight 脚本与其测试外无其他文件改动；`.munk/baseline/coverage.json`、`scripts/coverage-gate.mjs` 与 workflows 均零改动。

## 非目标

- 不改 coverage-gate 阈值、ignore 计数、HEAD 祖先校验等既有语义。
- 不改 `.github/workflows/coverage-gate-preflight.yml` 的触发方式与 `--negative stale` 调用约定。
- 不重采样覆盖率基线，不调整 baseline floors。
- 不碰 W1 的 code-gates 精简范围。

## 实现约束

- 只动 `scripts/coverage-gate-preflight.mjs` 与 `scripts/coverage-gate-preflight.test.mjs`（可新建）。
- 反向探针必须仍在临时仓库/临时 ref 中构造，不写主仓 ref、不推远端、不删 tag。
- 单条改动小于 150K 上下文可交付；改完必须本地自测 `--negative` 与前向校验两个方向。

## 本单执行约束（不 fold）

- 授权路径仅上述两个脚本文件；其余文件只读。
- 交付证据：`--negative stale` 运行输出、`pnpm test` 该测试文件结果、`git diff --stat` 证明改动面。
- 停止线：若发现根因不在 preflight 脚本（例如 workflow 参数需变），停下在 digest 说明，不要擅自改 workflow。
