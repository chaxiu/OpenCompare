# 精简 code-gates 至 7 道真门并解除 36 门硬编码

## 目标

将 .munk/code-gates.json 从 36 道压缩为 7 道非重复门（删除第 7-35 道已被 pnpm test 覆盖的单文件重复门，不删任何测试文件），并同步更新门矩阵自测与 test-debt 基线校准逻辑。文件边界仅限：.munk/code-gates.json、src/munk-gates.test.ts、src/spike-launch-gate.test.ts、src/spike-process-tree-gate.test.ts、src/verify-release-gate.test.ts、scripts/test-debt-gate.mjs、.munk/baseline/test-debt.json（严禁触碰 scripts/coverage-gate* 文件，避免与并行单冲突）。快反馈命令：pnpm vitest run src/munk-gates.test.ts src/spike-launch-gate.test.ts src/spike-process-tree-gate.test.ts src/verify-release-gate.test.ts scripts/coverage-gate-zero-statement.test.mjs && node scripts/test-debt-gate.mjs

## 验收

- ac-1: .munk/code-gates.json 仅保留顺序固定的 7 道门：install、lint、typecheck、build、build-web、test、test-debt-gate；不删除任何 .test.ts/.test.mjs 文件，真实测试覆盖零损失。
- ac-2: 更新 src/munk-gates.test.ts（保留 conditional perf profile 测试段，全文件控制在 ≤400 行）、src/spike-launch-gate.test.ts、src/spike-process-tree-gate.test.ts、src/verify-release-gate.test.ts 中硬编码 36 道门或单文件子集门的断言，改为断言上述 7 道核心门结构有效且 pnpm test 全量入口唯一。
- ac-3: 修改 scripts/test-debt-gate.mjs（注意：严禁在该脚本中出现字符串 coverage-gate，以防触发 scripts/coverage-gate-zero-statement.test.mjs 断言失败），允许在合并精简自证门用例时于 .munk/baseline/test-debt.json 中带理由校准 floors.repoTestCases，并同步更新 test-debt.json 使 node scripts/test-debt-gate.mjs 退出码为 0。
- ac-4: 精简后的 7 道 code_gates 全量运行全绿。
