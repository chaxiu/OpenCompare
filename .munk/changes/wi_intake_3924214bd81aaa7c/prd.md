# coverage-gate-preflight 两连红的 test-only 确定性加固

## 范围

main `b94a498` 上 `coverage-gate-preflight` 连续两次在 positive 步失败，且失败原因都不是产品行为回归：

1. run `42262338049`：`src/spike-process-tree-gate.test.ts > linux process-group teardown > reaps a grandchild that outlived the group leader`（失败点 `src/spike-process-tree-gate.test.ts:268`）在 `await stopChild(...)` 后立即断言孙进程已消失，覆盖率插桩下信号投递/回收的采样窗口被放大，偶发 `expected true to be false`。
2. run `42263878763`：`src/renderer/src/views/DirectoryView.test.tsx > DirectoryView windowed tree > keeps both panes bounded while scrolling through a 50k-entry comparison` 实测 5033ms，命中 vitest 默认 `testTimeout: 5000`；同 describe 的 `renders the same window for 5,000 rows and 50k rows` 仅 940ms。

本次只做测试侧确定性加固：把孙进程回收断言改为「有界轮询等待 + 仍然必须消失」，给实测超时的 50k 行窗口化用例加显式 per-test 超时，并按实测给其它 >2s 重型用例补显式超时。不改产品源码、不改门禁脚本/阈值/floors/baseline、不改全局 `testTimeout`、不用 `skip`/`todo`/`only`、不缩小用例规模、不放宽断言。

## 验收

- ac-spike-reap-bounded-wait: `src/spike-process-tree-gate.test.ts` 中所有「子/孙进程已消失」断言，在断言前都经过同一个有界等待原语（轮询存活或事件驱动，deadline ≤ 5_000ms），断言目标仍是「超时前必须消失」；等待不依赖单一固定 `sleep` 作为同步手段，且等待上限小于该用例自身的 per-test 超时。
- ac-spike-reap-still-hard: 同一批用例在等待结束后仍断言 `pidAlive(pid) === false`（或等等价严格判定），断言强度不低于改造前；不允许把断言改成「可能存活」或删除。
- ac-spike-reverse-guard-red: 同文件新增一条受控反向自测（普通 `it`，不使用 `skip`/`todo`/`only`）：故意保留一个活着的孙/子进程，断言「有界等待守卫」返回 false（即守卫本身会判红），并在用例结束前回收该进程；该用例在 `pnpm test src/spike-process-tree-gate.test.ts` 中真实执行并通过。
- ac-directoryview-50k-timeout: `src/renderer/src/views/DirectoryView.test.tsx` 的 `keeps both panes bounded while scrolling through a 50k-entry comparison` 带显式 per-test 超时 `30_000`；该用例的渲染次数、断言、fixture 规模与数据与 `b94a498` 逐字一致（唯一改动是追加超时参数）。
- ac-extra-timeouts-evidenced: 除上述两条外，任何新增的显式 per-test 超时只加在「覆盖率口径实测 > 2s」的重型用例上，且不得改动用例语义；每个新增超时都能在 delivery digest 中对应到「文件 / 用例名 / 实测耗时」。
- ac-test-count-not-decreased: `pnpm test` 全绿，且用例总数不低于 `b94a498` 基线（2454 total / 2450 passed / 3 skipped）；新增反向自测使总数只增不减，且新增用例不是 `skip`/`todo`/`only`。
- ac-preflight-timings-green: 以覆盖门同口径（`--coverage --coverage.provider=v8 --coverage.include=src/core/**` + 基线 exclude，`reporter=json-summary`）跑一次全量测量，vitest 退出码为 0；上述两条用例不再触发默认 5000ms 超时，实测耗时写入 digest。
- ac-test-only-diff: 变更集只包含测试文件（`src/**/*.test.ts` / `src/**/*.test.tsx`）；不含 `src/core/**`、`src/main/**`、`src/renderer/src/**` 非测试文件、`scripts/**`、`vitest.config.mts`、`.munk/**`、`.github/**` 的任何改动。
- ac-digest-mapping: delivery digest 逐条给出「文件 / 用例 / 显式超时值 / 实测耗时」；若有断言变化，给出「原断言 → 更强断言」逐条映射；并给出全仓测试文件行数净变化。

## 非目标

- 不重试、不重跑 CI 以等绿；不修改 `coverage-gate-preflight` workflow、`scripts/coverage-gate*.mjs`、`.munk/code-gates.json`、`.munk/baseline/coverage.json` 及任何 floor/阈值。
- 不改 `vitest.config.mts` 全局 `testTimeout` / `hookTimeout` / `pool` / `isolate` 等全局配置。
- 不改 `scripts/verify-release.mjs`（`stopChild` / `waitUntilReaped` / `releaseChildHandles` 等产品侧判据属于门禁实现，本次不动），只改引用它的测试。
- 不改 DirectoryView 产品源码、fixture 规模或 50k 数据；不缩小滚动迭代次数。
- 不删除/放宽任何既有断言，不新增 `skip`/`todo`/`only`，不引入新依赖，不做顺手的格式/文案/注释大改。

## 实现约束

**证据锚点**
- run `42262338049` 失败：`src/spike-process-tree-gate.test.ts:268`，用例 `reaps a grandchild that outlived the group leader`；失败前调用为 `await stopChild(proc.child, { processGroup: true, graceMs: 500, killWaitMs: 500 })`。
- run `42263878763` 失败：`DirectoryView windowed tree` 下 `keeps both panes bounded while scrolling through a 50k-entry comparison` 5033ms 超时；同 describe 其余用例实测：`renders the same window for 5,000 rows and 50k rows` 940ms、`expands a 20,000-child folder without materialising it` 498ms、`switches the five filters onto their own row prefix` 1210ms、`never filters or projects the whole tree while rendering and interacting` 1259ms、`matches the filtered/projected oracle on the 50k fixture and keeps node identity` 407ms。

**spike 测试文件（`src/spike-process-tree-gate.test.ts`，386 行 / 14 个 `it`）**
- 现有辅助：`sleep(ms)`、`waitFor(predicate, timeoutMs = 4_000)`（20ms 间隔轮询）、`pidAlive(pid)`（`process.kill(pid, 0)`）。
- 现有失败面：`kills the whole tree and releases both pipes`、`escalates to SIGKILL when the tree ignores SIGTERM`、`reaps a grandchild that outlived the group leader`、`reaps the tree and keeps window-booted evidence on the success path`、`reaps the tree and keeps the process-exited contract on the failure path`、`exits within budget after a success spike and keeps both files intact` 中，`expect(pidAlive(...)).toBe(false)` 出现在 `stopChild` / `CLI` 返回后的同一 tick。
- 约束：把「已消失」判定收敛到一个有界等待原语（复用或扩展 `waitFor`），deadline 建议 2_000–5_000ms 且必须小于该用例 per-test 超时（现有 15_000 / 20_000 保持不变或按实测调大，不得调小）。Linux 下若 `kill(pid, 0)` 对已退出但尚未被回收（zombie）的进程仍返回存活，可在测试侧把 `/proc/<pid>/stat` 状态 `Z` 视为已消失（仅在 `/proc` 可读时），保证语义是「进程不再运行」而非采样侥幸。
- 反向自测建议形态：`spawnCapturedChild` 起一个纯 `setInterval` 的存活进程（或用现有 fake tree 的孙进程），断言 `await waitForGone(pid, 300ms) === false` 且 `pidAlive(pid) === true`，随后 `stopChild(..., { processGroup: true })` 回收；不得让该用例自身泄漏进程（`afterAll` 已有 `spawned` 清理）。

**DirectoryView 测试（`src/renderer/src/views/DirectoryView.test.tsx`，974 行）**
- 目标位置约 `:355` 的 `it('keeps both panes bounded while scrolling through a 50k-entry comparison', () => { ... })`，改为追加第二参数 `, 30_000`，用例体内 20 次滚动、所有断言、fixture 数据不动。
- 兄弟用例 `renders the same window for 5,000 rows and 50k rows` CI 实测 940ms，默认 5s 足够；只有在本机覆盖口径实测 > 2s 时才允许加显式超时，并写入 digest。
- 其它 `src/renderer` 重 jsdom 用例遵循同一规则（实测 > 2s 才加，逐条进 digest）。

**口径与测量**
- 覆盖门同口径命令（本地复现，不改脚本）：`node node_modules/vitest/vitest.mjs run --coverage --coverage.provider=v8 --coverage.include=src/core/** --coverage.exclude=**/*.test.ts --coverage.exclude=**/*.test.tsx --coverage.exclude=**/__fixtures__/** --coverage.reporter=json-summary --coverage.reportsDirectory=<tmp>`；可用最后一个文件参数只跑目标文件取实测耗时（覆盖插桩保持开启）。
- Linux 插桩放大是已确认事实：本地 macOS 32 门全绿不代表 Linux 覆盖率下同镜像绿；本任务只允许通过 per-test 超时与确定性等待吸收抖动，不接受重试或缩小负载。
- 全量 `pnpm test` 与 `.munk/code-gates.json` 各门（尤其 `test` / `spike-process-tree-gate` / `test-debt-gate`）必须自绿；用例数不降。
- 交付即为新发布点；交付后本地 main 会被用于重跑全量门与三件预检，digest 必须可直接引用。
