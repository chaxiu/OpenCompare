# App.theme 启动即 system 模式订阅断言时序竞态修复（test-only）

## 范围

GitHub Actions coverage 预检 run `42309993491`（commit `0484a248cb54e1548bc754f6e82b4d9a3ae9de7c`，tree `2de02ea948dd0536c1cb1184d2e717e376662d08`）在正测阶段 exit 1：

- `src/renderer/src/App.theme.test.tsx:315`，用例 `launches a stored system mode by following the OS preference`，`expect(scheme.listenerCount()).toBe(1)` 实测为 `0`。
- 同一 tree 本地全量 161 files / 2469 tests 全绿，spike 12/12、Windows 46/46 均绿，判定为「启动即 system 模式下订阅注册的时序竞态」，不是产品行为回归。

本次只做测试侧确定性修复：在该用例中用 `waitFor` 包住 `listenerCount()` 断言及其紧邻的 `appliedTheme()` 断言，等订阅真正建立后再断言；断言强度不变（仍要求 `listenerCount()` 恰为 `1`、`appliedTheme()` 为 `'dark'`）。不改产品代码、不改订阅/主题实现、不改 vitest 配置、不做其它测试清债。

## 验收

- ac-waitfor-listener-count: `src/renderer/src/App.theme.test.tsx` 的 `launches a stored system mode by following the OS preference` 中，`expect(scheme.listenerCount()).toBe(1)` 被 `waitFor` 包裹（轮询等待订阅建立），等待结束后仍断言 listener 数**恰为 1**（不是 `>= 1`、不是 `toBeGreaterThanOrEqual`、不是 `toBeTruthy`）。
- ac-waitfor-applied-theme: 同一用例紧邻的 `expect(appliedTheme()).toBe('dark')` 同样被 `waitFor` 包裹，等待结束后仍要求 `appliedTheme()` 恰为 `'dark'`。
- ac-post-wait-behavior-kept: `waitFor` 之后原有的 `act(() => scheme.setLight(true))` 与 `expect(appliedTheme()).toBe('light')` 保留并继续通过，证明订阅建立后仍真实响应 OS 变化。
- ac-no-weakening: 不删除、不 `skip`/`todo`/`only`、不改写成宽松断言、不引入重试/`vi.waitUntil` 之外的兜底放行；该用例的 `it(...)` 名称、describe、测试体语义保持不变。
- ac-minimal-diff: 变更集只含 `src/renderer/src/App.theme.test.tsx`（若同文件存在可由复现证据证明的同类「渲染后立即同步读订阅/状态」断言，才允许一并 `waitFor` 化，且必须在 delivery 中逐条给出文件/行号/复现证据）；不含 `src/renderer/src/App.tsx`、`src/renderer/src/theme/**`、任何生产代码、`vitest.config.mts`、`scripts/**`、`.github/**`、`package.json`。
- ac-line-budget: 测试文件总行数净增为 0（或为负）。`.munk/baseline/test-debt.json#ceilings.repoTestLines` 当前已顶格 52395，且 `growth` 条目要求 `addedCases > 0`，本任务不新增用例，因此不得靠改 baseline 抬 ceiling 过门；`node scripts/test-debt-gate.mjs` 必须自绿（修复后重新测量）。
- ac-repeat-20x: `pnpm test src/renderer/src/App.theme.test.tsx` 连续重复执行 **≥ 20 次**全部 green；delivery 写明实际次数、每次的 passed/failed 计数与总耗时。
- ac-full-gates-green: `pnpm test` 全量 green，用例数与 `0484a24` 基线相比不降（本地基线 161 files / 2469 tests）；`.munk/code-gates.json` 中全部门（含 `test`、`test-debt-gate` 与 Q6 相关门）自绿；覆盖率不低于基线。
- ac-no-release-actions: 合入 main 即止——不推 tag、不 dispatch release workflow、不改已公开 Release 及其资产、不 bump `package.json#version`。

## 非目标

- 不改 `ThemeProvider` / `theme.ts` / 订阅注册与清理逻辑，不改四态/对比语义。
- 不改全局或 per-file `testTimeout` / `hookTimeout` / `pool` / `isolate`，不通过加大超时掩盖竞态。
- 不改 `coverage-gate-preflight` workflow、覆盖率脚本、floor/阈值/baseline 数值（仅在确有需要时说明理由，默认不动）。
- 不重构测试基础设施，不新增工具函数/依赖，不顺手改格式、注释、文案或其它测试用例。
- 不重跑 CI 等绿；以本地可复现证据为准。

## 实现约束

**故障锚点**
- `src/renderer/src/App.theme.test.tsx:309-319`（当前 worktree 行号）：
  ```ts
  it('launches a stored system mode by following the OS preference', async () => {
    const scheme = installScheme(false)
    installPlatform(portWithSettings({ language: 'en', theme: 'system' }))
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(appliedTheme()).toBe('dark')
    expect(scheme.listenerCount()).toBe(1)   // ← CI 实测 0

    act(() => scheme.setLight(true))
    expect(appliedTheme()).toBe('light')
  })
  ```
- `installScheme`（同文件 `:111`）用 `Set` 记录 `matchMedia` 的 `change` listener；`listenerCount()` 返回 `listeners.size`。`findByRole` 只保证首屏 heading 出现，不保证 `ThemeProvider` 的 system 订阅 effect 已 flush，这是竞态来源。

**建议改法（最小、净零行）**
- 两条断言各自一对一包成 `waitFor`，行数净增 0，避免触碰 test-debt ceiling：
  ```ts
  await waitFor(() => expect(appliedTheme()).toBe('dark'))
  await waitFor(() => expect(scheme.listenerCount()).toBe(1))
  ```
  若用单块 `waitFor(() => { ... })` 更清晰，则必须在同文件内保持净零行（例如同 hunk 内合并等价行），否则 `repoTestLines` 超顶格导致 `test-debt-gate` 必红。
- `waitFor` 已在文件顶部从 `@testing-library/react` 导入（`:2`），无需新增 import。

**环境事实**
- 当前 worktree 无 `node_modules`（`node scripts/test-debt-gate.mjs` 报 `node_modules/vitest is missing`），Coding 需先 `pnpm install`。
- 覆盖率同口径命令（复现/自证用，不改脚本）：`node node_modules/vitest/vitest.mjs run --coverage --coverage.provider=v8 --coverage.include=src/core/** --coverage.exclude=**/*.test.ts --coverage.exclude=**/*.test.tsx --coverage.exclude=**/__fixtures__/** --coverage.reporter=json-summary --coverage.reportsDirectory=<tmp>`。
- 交付口径：本地 main 合入即可，不触发发布链。
