# Domain: test-determinism

测试确定性与并发抖动纪律域：定义「并行负载下（Host `code_gates` 同时跑门、本机多进程抢 CPU）测试用例的等待点必须落在已经成立的结构事实上」这一口径，以及据此收敛 renderer 测试 helper 的具体规矩。本域管**测试等待 / 同步点的形状**，不管被测产品行为——门禁清单形状、矩阵扩容与条件 profile 归 `quality-gates`；`App.settings.test.tsx` 里设置面板 / 示例入口 / 会话 tab 的产品语义归 `workbench`；发布测试套件的仓库隔离（`.git` / 敌对 HOME / 网络）归 `release`；`pnpm test` 里各功能断言本身归各自域。

## 范围

- **弱等待条件的判据**：凡「某个容器出现即返回」的等待（典型：`findByRole('tablist')` 只等到会话条出现，而会话条在**第一个**会话提交后就会渲染）都不构成同步点——它等价于「等到第一个事件先发生」，在负载下必然漏掉后到的提交。等待条件必须写成**目标状态的完整形态**（数量 + 顺序 + 选中态），或用逐次增量断言（每步 `i+1`）把异步提交串成显式序列。
- **`loadDemoSamples`（`src/renderer/src/App.settings.test.tsx`）现行口径**：四个内置示例（directory / code / csv / structured）逐个经设置「示例与调试」的 `data-sample-entry` 点击启动；每点一个都用 `waitFor` 等到 `[data-session-tab]` 数量增长到 `index + 1`，循环结束后再等到数量恰为 4 且最后一个 tab 的 `aria-selected === 'true'`。等待上界沿用既有 4000ms，不得在此基础上放大。
- **写盘队列同步点**：语言切换用例里「写盘串行队列已派发」用 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))` 表达；`writeUserSettings` 仍返回**永不 resolve** 的 Promise（不能 await 其 resolve，否则用例挂死），从而保持「断言发生在写盘落定之前」的原语义。取代旧的 `await act(async () => { await Promise.resolve() })`（依赖 `.then` 微任务恰好先于 act 续体的调度假设）。
- **语言无关定位**：会话 tab 一律用 `[data-session-tab]`（`SessionTabs` 的结构输出）定位，不用中英文 tablist / tab 文案；helper 现被 `'en'` 调用，后续可能扩到 `'zh'`。
- **未复现也要有根因**：若本地无法复现原 flake，必须在记录里贴失败日志与根因分析，并说明新等待条件如何直接覆盖该失败路径；不能以「本地没复现」收工。
- **覆盖率插桩会放大回收 / 渲染采样窗口**：v8 覆盖插桩下进程信号投递与回收、50k 行窗口渲染的耗时会被显著放大（Linux CI 已实测）。凡「收尾动作返回后立刻断言进程已消失」在同 tick 内断言、或在默认 `testTimeout: 5000` 下压重负载的用例，都属于确定性缺口。
- **「已消失」必须经有界等待原语**：spike 进程树测试里所有「子 / 孙进程已消失」断言统一走 `expectGone(pid)`（内部 `waitForGone(pid, timeoutMs)` 复用既有 `waitFor` 20ms 轮询，deadline ≤ 5_000ms 且小于用例 per-test 超时），等待结束后**仍**断言 `pidRunning(pid) === false`；Linux 上 `/proc/<pid>/stat` 状态为 `Z` 视为「不再运行」，避免 zombie 采样侥幸判红。
- **per-test 超时只给实测重型用例**：显式超时只加在覆盖率口径实测 > 2s 的用例上（本轮 `DirectoryView` 50k 窗口 30_000、`verify-release-gate` local B 层 30_000、`App.settings` 重装载/语言切换 20_000），不改全局 `testTimeout` / `hookTimeout`，不靠超时掩盖竞态、不用 `skip` / `todo` / `only`、不缩小负载。
- **「渲染后立即同步读订阅 / 主题状态」也是弱等待**：`findByRole` / `findBy*` 只保证首屏结构出现，**不保证** `ThemeProvider` 的 system 订阅 `useEffect` 已 flush。`src/renderer/src/App.theme.test.tsx` 的 `launches a stored system mode by following the OS preference` 因此在 CI（run `42309993491`，commit `0484a24`）实测 `scheme.listenerCount() === 0`，同 tree 本地全量、spike、Windows 均绿。凡「渲染后立刻同步断言订阅数 / `appliedTheme()`」的写法一律改为 `waitFor` 轮询等待订阅真正建立；等待后断言强度不变（listener 恰为 `1`、`appliedTheme()` 恰为 `'dark'`），不得放宽为 `>= 1` / `toBeGreaterThanOrEqual` / `toBeTruthy`。

## 验收

- **ac-flake-reproduced-and-covered**：复现原 flake 的失败路径（directory 会话晚于另外三个提交）被新的等待条件直接覆盖；改后在同一并行负载下该用例不再出现「期望 4、实得 3」。（原始复现基线：12 个占满 CPU 的 `yes` 进程 + 8 个并行 `vitest run src/renderer/src/App.settings.test.tsx`，8 次里 1 次红，失败在 `App.settings.test.tsx:273` 的 tab 数断言。）
- **ac-load-samples-settled**：`loadDemoSamples` 只在四个内置示例会话全部挂载后才返回——每点一个 `data-sample-entry` 都用 `waitFor` / `findBy` 等到会话 tab 数增长到 `i+1`（或对应 tab 出现），循环后再等到 tablist 内 tab 数恰为 4 且最后一个会话为 active；不依赖单次微任务 flush、固定 sleep 或「tablist 出现」这一弱条件。
- **ac-write-queue-sync-point**：语言切换用例里把「写盘串行队列已派发」改为 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))` 这类显式等待；`writeUserSettings` 仍返回永不 resolve 的 Promise（不得 await 其 resolve），保持「断言发生在写盘落定之前」的原语义。
- **ac-assertions-preserved**：原断言逐条保留，不得删弱——切换后 `tablist` 名为 `会话`、tab 数为 4、`contentinfo` 含 `会话`、设置面板为中文、语言选项为 `['English','简体中文']`、`writeUserSettings` 调用 1 次且参数为 `{ language: 'zh', theme: 'dark' }`、`readUserSettings` 调用次数等于启动时、切回英文后 `tablist` 名为 `Sessions`、`contentinfo` 含 `Session`、设置面板为英文。
- **ac-state-preserved-assertions-intact**：`keeps sessions, directory view state and unsaved edits, and reworks nothing` 与 `keeps the chosen language and reports a failed write in place` 中既有的会话标题、活动 tab、未保存标记、仅差异过滤、选中行、滚动位置、状态栏路径、平台调用次数等断言全部保留，且因共享 helper 变确定后仍全绿。
- **ac-no-skip-no-retry**：不新增 `skip` / `todo` / `only`，不引入 retry 插件或 `retry:` 配置，不放大既有 timeout 上限（`loadDemoSamples` 现有的 4000ms 上限可复用为等待上界，但不得在此基础上继续加大）。
- **ac-single-file-10x-green**：`pnpm test src/renderer/src/App.settings.test.tsx` 连续运行 ≥10 次全部通过，逐次给出结果摘要（Tests 行）。
- **ac-full-suite-5x-green**：在并行负载下连续运行 5 次全量 `pnpm test`，5 次全部通过，逐次给出结果摘要（Test Files / Tests / Duration）。
- **ac-diff-scope**：相对交付基线的 `git diff --name-only` 只含 `src/renderer/src/App.settings.test.tsx`（确需新增测试辅助时，只能是 renderer 测试目录内的测试专用文件）；`src/` 产品源码、其他测试文件、`package.json`、`vitest*.mts`、`.munk/code-gates.json`、版本 / README / 发布文件零改动。
- **ac-code-gates-green**：按 `.munk/code-gates.json` 全量门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics / sync-real-gate，现行 11 项）逐条通过后交付。
- **ac-spike-reap-bounded-wait**：`src/spike-process-tree-gate.test.ts` 中所有「子 / 孙进程已消失」断言在断言前都经过同一个有界等待原语（`waitForGone` 轮询存活，deadline ≤ 5_000ms），断言目标仍是「超时前必须消失」；等待不依赖单一固定 `sleep`，且等待上限小于该用例自身 per-test 超时。
- **ac-spike-reap-still-hard**：同一批用例在等待结束后仍断言 `pidRunning(pid) === false`（`pidAlive` 且非 Linux zombie），断言强度不低于改造前；不允许把断言改成「可能存活」或删除。
- **ac-spike-reverse-guard-red**：同文件新增一条受控反向自测（普通 `it`，无 `skip` / `todo` / `only`）：故意保留活着的孙进程，断言 `waitForGone(pid, 300) === false` 且 `pidRunning(pid) === true`，用例结束前经 `stopChild` 回收并在 `pnpm test src/spike-process-tree-gate.test.ts` 中真实执行通过。
- **ac-directoryview-50k-timeout**：`src/renderer/src/views/DirectoryView.test.tsx` 的 `keeps both panes bounded while scrolling through a 50k-entry comparison` 带显式 per-test 超时 `30_000`；渲染次数、断言、fixture 规模与数据相对基线逐字不变（唯一改动是追加超时参数）。
- **ac-extra-timeouts-evidenced**：除上述两条外，任何新增显式 per-test 超时只加在「覆盖率口径实测 > 2s」的重型用例上且不改用例语义；每个新增超时必须能对应到「文件 / 用例名 / 实测耗时」。
- **ac-test-count-not-decreased**：`pnpm test` 全绿且用例总数不低于基线（`b94a498` 口径 2454 total / 2450 passed / 3 skipped）；新增反向自测使总数只增不减，新增用例不是 `skip` / `todo` / `only`。
- **ac-preflight-timings-green**：以覆盖门同口径（`--coverage --coverage.provider=v8 --coverage.include=src/core/**` + 基线 exclude，`reporter=json-summary`）跑一次全量测量，vitest 退出码 0；上述两条用例不再触发默认 5000ms 超时，实测耗时写入 digest。
- **ac-test-only-diff**：变更集只含测试文件（`src/**/*.test.ts` / `*.test.tsx`）；不含 `src/core/**`、`src/main/**`、`src/renderer/src/**` 非测试文件、`scripts/**`、`vitest.config.mts`、`.munk/**`（Host 机器可读的 `test-debt.json` ratchet 记录除外）、`.github/**` 的任何改动。
- **ac-digest-mapping**：delivery digest 逐条给出「文件 / 用例 / 显式超时值 / 实测耗时」；若有断言变化给出「原断言 → 更强断言」映射；并给出全仓测试文件行数净变化。
- **ac-waitfor-listener-count**：`App.theme.test.tsx` 的 `launches a stored system mode by following the OS preference` 中 `expect(scheme.listenerCount()).toBe(1)` 被 `waitFor` 包裹（轮询等待订阅建立），等待结束后仍断言 listener 数**恰为 1**（不是 `>= 1` / `toBeGreaterThanOrEqual` / `toBeTruthy`）。
- **ac-waitfor-applied-theme**：同用例紧邻的 `expect(appliedTheme()).toBe('dark')` 同样被 `waitFor` 包裹，等待结束后仍要求 `appliedTheme()` 恰为 `'dark'`。
- **ac-post-wait-behavior-kept**：`waitFor` 之后原有的 `act(() => scheme.setLight(true))` 与 `expect(appliedTheme()).toBe('light')` 保留并继续通过，证明订阅建立后仍真实响应 OS 变化。
- **ac-no-weakening**：不删除、不 `skip`/`todo`/`only`、不改写成宽松断言、不引入重试或 `vi.waitUntil` 之外的兜底放行；该用例的 `it(...)` 名称、`describe`、测试体语义保持不变。
- **ac-minimal-diff**：变更集只含 `src/renderer/src/App.theme.test.tsx`（同文件内同类「渲染后立即同步读订阅/状态」断言只有在有复现证据时才能一并 `waitFor` 化，且须逐条给出文件/行号/复现证据）；不含 `src/renderer/src/App.tsx`、`src/renderer/src/theme/**`、任何生产代码、`vitest.config.mts`、`scripts/**`、`.github/**`、`package.json`。
- **ac-line-budget**：测试文件总行数净增为 0（或为负）；`test-debt.json#ceilings.repoTestLines` 不得靠改 baseline 抬高，`node scripts/test-debt-gate.mjs` 必须自绿（修复后重新测量）。
- **ac-repeat-20x**：`pnpm test src/renderer/src/App.theme.test.tsx` 连续重复执行 ≥ 20 次全部 green；delivery 写明实际次数、每次 passed/failed 计数与总耗时。
- **ac-full-gates-green**：`pnpm test` 全量 green，用例数与 `0484a24` 基线相比不降（本地基线 161 files / 2469 tests）；`.munk/code-gates.json` 全部门（含 `test`、`test-debt-gate`）自绿；覆盖率不低于基线。
- **ac-no-release-actions**：合入 main 即止——不推 tag、不 dispatch release workflow、不改已公开 Release 及其资产、不 bump `package.json#version`。

## 非目标

- 不改产品源码：`loadSampleSessions` 的 `LOADING_FLOOR_MS`、`Workbench` 的装载 / 提交顺序、`SettingsDialog` 的写盘队列与语言切换逻辑一律不动。
- 不改其他测试的语义、断言或超时；不重构测试文件结构，不抽公共测试框架。
- 不动版本号、`CHANGELOG.md`、README、`electron-builder.yml`、`.github/**` 等发布文件。
- 不动 `.munk/code-gates.json`，不放宽任何门禁（不加 retry / 不加 `--bail` 之外的重跑配置）。
- 不用 `skip`、不用 retry、不用放大 timeout 或固定 sleep 掩盖竞态。
- 不追求把 `pnpm test` 变快，也不做与本 flake 无关的测试清理。
- 不把本域扩成「全局测试基建改造」：其他文件里的同类弱等待（如 `App.smoke.test.tsx` 的四场景走查）本轮按原样保留，若后续再红另开工作项，不在本项顺手扩散。
- 不重试、不重跑 CI 以等绿；不改 `coverage-gate-preflight` workflow、`scripts/coverage-gate*.mjs`、`.munk/code-gates.json`、`.munk/baseline/coverage.json` 及任何 floor / 阈值。
- 不改 `vitest.config.mts` 全局 `testTimeout` / `hookTimeout` / `pool` / `isolate`；不改 `scripts/verify-release.mjs`（`stopChild` / `waitUntilReaped` / `releaseChildHandles` 仍属门禁实现，只改引用它的测试）。
- 不缩小 50k fixture 或滚动迭代次数，不删除 / 放宽既有断言，不新增 `skip` / `todo` / `only`，不引新依赖，不做顺手的格式 / 文案 / 注释大改。

## 实现约束

- 历史轮（`wi_intake_3154108078c555f1`）只改 `src/renderer/src/App.settings.test.tsx`；确需新增测试辅助时，只允许落在 renderer 测试目录内（如 `src/renderer/src/**` 下的 `*.test-helpers.ts`），不得进入 `src/core`、`src/main`、`src/preload`。本轮 scope 见「覆盖率插桩会放大回收 / 渲染采样窗口」与 `ac-test-only-diff`。
- 等待条件必须与语言无关：用 tab 数 / `aria-selected` / `data-*` 之类的结构信号，不要绑定中英文 tab 标题文案。
- 禁止用 `await new Promise(r => setTimeout(r, N))` 之类固定 sleep 作为同步点；`waitFor` / `findBy` 的条件必须是「已经成立的事实」而非时间。
- 不得把 `writeUserSettings` 从「永不 resolve」改成可 resolve，否则会破坏该用例「写盘未落定即已整窗切换」的原始断言意图。
- 会话装载的异步事实：每个示例入口的 `load()` 是独立的一次 `setSessions → setActiveId → setStatus('ready')` 提交，且 `LOADING_FLOOR_MS = 420` 的加载地板是从**计算完成之后**才起算；directory 的 `compareDirectories`（真实扫描 + digest）在负载下会晚于另外三个的定时器批次。任何「等到容器出现」的写法都会在这一点上漏掉 directory。
- 验证证据必须逐次可查：≥10 次单文件运行与 5 次全量 `pnpm test` 的结果摘要（可并行负载，需注明并发方式）。
- **有界等待的形状**：`waitForGone` 只能包在轮询存活上，不得退化成一次 `sleep(deadline)`；`expectGone` 必须「等待返回 true」+「等待后仍为 false」双断言，禁止只保留其中一个。Linux zombie 判定只在 `process.platform === 'linux'` 且 `/proc` 可读时生效，macOS 行为不变。
- **超时参数只改第二参**：per-test 超时以 `it(name, fn, N)` 形式追加，用例体、fixture、断言、迭代次数逐字不动；不得把超时写进全局配置或抽成共享常量绕过逐条证据。
- **证据锚点**：run `42262338049`（`src/spike-process-tree-gate.test.ts:268` 孙进程回收，覆盖插桩放大采样窗口）与 run `42263878763`（DirectoryView 50k 用例 5033ms 命中默认 5000ms）；同 describe 其余实测：5k/50k 同窗 940ms、20k 子文件夹 498ms、五过滤器 1210ms、全树不投影 1259ms、oracle 407ms。
- **门禁与 ratchet**：`.munk/code-gates.json` 不新增 gate；若用例数 / 测试行数上升，同步 `.munk/baseline/test-debt.json` 的 floor / ceiling 与 `growth` 记录（Host 机器可读，不算应用改动）。
- **`App.theme.test.tsx` 订阅等待的落点**：`installScheme` 用 `Set` 记录 `matchMedia` 的 `change` listener（`listenerCount()` 返回 `listeners.size`），首屏 `findByRole('heading', ...)` 返回时订阅 effect 未必已跑。修复形状是两条断言各自一对一包 `waitFor`（`await waitFor(() => expect(appliedTheme()).toBe('dark'))` / `await waitFor(() => expect(scheme.listenerCount()).toBe(1))`），行数净增 0 以不触 `repoTestLines` 顶格；`waitFor` 已在文件顶部从 `@testing-library/react` 导入，不新增 import。不得为此改 `ThemeProvider` / `theme.ts` / 订阅清理、不改全局或 per-file `testTimeout` / `hookTimeout` / `pool` / `isolate` 掩盖竞态。

## 最近交付证明

- WI：`wi_intake_955110dfff2f076b`（`App.theme` 启动即 system 模式订阅断言时序竞态修复，`kind: test-only`）
- 日期：2026-11-07
- 结果：`code_gates` passed（32 门，attempt 001，`.munk/runs/run_intake_955110dfff2f076b/code-gates/attempts/001`，`summary = "code_gates passed (32 gates, attempt 001)"`，`failedGateIds: []`）。`test` 门 161 files / 2468 passed + 1 skipped（2469），与 `0484a24` 基线用例数持平不降；`test-debt-gate` 通过（`repoTestLines` 52395 ≤ ceiling 52395、`repoTestCases` 1890 ≥ floor 1799）。
- 覆盖摘要：① **订阅等待（`ac-waitfor-listener-count` / `ac-waitfor-applied-theme`）**——`src/renderer/src/App.theme.test.tsx` 的 `launches a stored system mode by following the OS preference` 把 `expect(appliedTheme()).toBe('dark')` 与 `expect(scheme.listenerCount()).toBe(1)` 各自包进 `waitFor`，去掉「首屏 heading 出现即认为订阅已注册」的同一 tick 假设。② **断言强度（`ac-no-weakening` / `ac-post-wait-behavior-kept`）**——仍要求 listener 恰为 `1`、`appliedTheme()` 恰为 `'dark'`，后续 `act(() => scheme.setLight(true))` → `'light'` 保留通过；无 `skip` / `todo` / `only` / retry。③ **净零行与范围（`ac-line-budget` / `ac-minimal-diff`）**——diff 仅 2 行改 2 行（同 hunk 等量替换），测试文件行数净增 0；变更集只含 `src/renderer/src/App.theme.test.tsx`，产品源码 / `src/renderer/src/theme/**` / `vitest.config.mts` / `scripts/**` / `.github/**` / `package.json` 零改动。④ **无发布动作（`ac-no-release-actions`）**——只合入本地默认分支。
- 证据：`.munk/runs/run_intake_955110dfff2f076b/code-gates/attempts/001/{test,test-debt-gate}.log` 与同名 `.result.json`；`test-debt-gate` 原文 `repoTestLines: measured 52395 <= ceiling 52395` / `repoTestCases: measured 1890 >= floor 1799`。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合。② **`ac-repeat-20x` 的 20 次逐轮计数未在 Host 证据里留档**：本轮可查证据只有 `code_gates` 单次全量 `test` 日志；后续若要补齐应单跑一次 20 次循环并把逐次 passed/failed 与耗时写回本域，不得凭推测填充。③ 该用例的竞态根因在 `findByRole` 与 effect flush 的先后，不在超时预算——**不要**用放大 `testTimeout` 或插入固定 sleep 处理同类红。④ 其他测试文件里的同类「渲染后立即同步读订阅 / 主题状态」写法本轮按原样保留，再红另开工作项。
