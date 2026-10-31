# Domain: test-determinism

测试确定性与并发抖动纪律域：定义「并行负载下（Host `code_gates` 同时跑门、本机多进程抢 CPU）测试用例的等待点必须落在已经成立的结构事实上」这一口径，以及据此收敛 renderer 测试 helper 的具体规矩。本域管**测试等待 / 同步点的形状**，不管被测产品行为——门禁清单形状、矩阵扩容与条件 profile 归 `quality-gates`；`App.settings.test.tsx` 里设置面板 / 示例入口 / 会话 tab 的产品语义归 `workbench`；发布测试套件的仓库隔离（`.git` / 敌对 HOME / 网络）归 `release`；`pnpm test` 里各功能断言本身归各自域。

## 范围

- **弱等待条件的判据**：凡「某个容器出现即返回」的等待（典型：`findByRole('tablist')` 只等到会话条出现，而会话条在**第一个**会话提交后就会渲染）都不构成同步点——它等价于「等到第一个事件先发生」，在负载下必然漏掉后到的提交。等待条件必须写成**目标状态的完整形态**（数量 + 顺序 + 选中态），或用逐次增量断言（每步 `i+1`）把异步提交串成显式序列。
- **`loadDemoSamples`（`src/renderer/src/App.settings.test.tsx`）现行口径**：四个内置示例（directory / code / csv / structured）逐个经设置「示例与调试」的 `data-sample-entry` 点击启动；每点一个都用 `waitFor` 等到 `[data-session-tab]` 数量增长到 `index + 1`，循环结束后再等到数量恰为 4 且最后一个 tab 的 `aria-selected === 'true'`。等待上界沿用既有 4000ms，不得在此基础上放大。
- **写盘队列同步点**：语言切换用例里「写盘串行队列已派发」用 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))` 表达；`writeUserSettings` 仍返回**永不 resolve** 的 Promise（不能 await 其 resolve，否则用例挂死），从而保持「断言发生在写盘落定之前」的原语义。取代旧的 `await act(async () => { await Promise.resolve() })`（依赖 `.then` 微任务恰好先于 act 续体的调度假设）。
- **语言无关定位**：会话 tab 一律用 `[data-session-tab]`（`SessionTabs` 的结构输出）定位，不用中英文 tablist / tab 文案；helper 现被 `'en'` 调用，后续可能扩到 `'zh'`。
- **未复现也要有根因**：若本地无法复现原 flake，必须在记录里贴失败日志与根因分析，并说明新等待条件如何直接覆盖该失败路径；不能以「本地没复现」收工。

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

## 非目标

- 不改产品源码：`loadSampleSessions` 的 `LOADING_FLOOR_MS`、`Workbench` 的装载 / 提交顺序、`SettingsDialog` 的写盘队列与语言切换逻辑一律不动。
- 不改其他测试的语义、断言或超时；不重构测试文件结构，不抽公共测试框架。
- 不动版本号、`CHANGELOG.md`、README、`electron-builder.yml`、`.github/**` 等发布文件。
- 不动 `.munk/code-gates.json`，不放宽任何门禁（不加 retry / 不加 `--bail` 之外的重跑配置）。
- 不用 `skip`、不用 retry、不用放大 timeout 或固定 sleep 掩盖竞态。
- 不追求把 `pnpm test` 变快，也不做与本 flake 无关的测试清理。
- 不把本域扩成「全局测试基建改造」：其他文件里的同类弱等待（如 `App.smoke.test.tsx` 的四场景走查）本轮按原样保留，若后续再红另开工作项，不在本项顺手扩散。

## 实现约束

- 只改 `src/renderer/src/App.settings.test.tsx`；确需新增测试辅助时，只允许落在 renderer 测试目录内（如 `src/renderer/src/**` 下的 `*.test-helpers.ts`），不得进入 `src/core`、`src/main`、`src/preload`。
- 等待条件必须与语言无关：用 tab 数 / `aria-selected` / `data-*` 之类的结构信号，不要绑定中英文 tab 标题文案。
- 禁止用 `await new Promise(r => setTimeout(r, N))` 之类固定 sleep 作为同步点；`waitFor` / `findBy` 的条件必须是「已经成立的事实」而非时间。
- 不得把 `writeUserSettings` 从「永不 resolve」改成可 resolve，否则会破坏该用例「写盘未落定即已整窗切换」的原始断言意图。
- 会话装载的异步事实：每个示例入口的 `load()` 是独立的一次 `setSessions → setActiveId → setStatus('ready')` 提交，且 `LOADING_FLOOR_MS = 420` 的加载地板是从**计算完成之后**才起算；directory 的 `compareDirectories`（真实扫描 + digest）在负载下会晚于另外三个的定时器批次。任何「等到容器出现」的写法都会在这一点上漏掉 directory。
- 验证证据必须逐次可查：≥10 次单文件运行与 5 次全量 `pnpm test` 的结果摘要（可并行负载，需注明并发方式）。

## 最近交付证明

- WI：`wi_intake_3154108078c555f1`（修复 `App.settings` 语言切换用例在并行负载下的 flake，`kind: fix`）
- 日期：2026-11-01
- 结果：`code_gates` passed（11 门，attempt 001，`.munk/runs/run_intake_3154108078c555f1/code-gates/attempts/001`，`summary = "code_gates passed (11 gates, attempt 001)"`，`failedGateIds: []`）。`pnpm test` 96 files / 1454 passed + 1 skipped / 1455，Duration 27.36s。
- 覆盖摘要：① `loadDemoSamples` 不再「点完四个入口后只 `findByRole('tablist')`」，改为逐点等待——`ids = ['directory','code','csv','structured'] as const`，`for (const [index, id] of ids.entries())` 内点完入口后 `await waitFor(() => expect(sessionTabs()).toHaveLength(index + 1), { timeout: 4000 })`；循环后再 `waitFor` 一次断言 tab 数恰为 4 且最后一个 tab 内 `[role="tab"]` 的 `aria-selected === 'true'`（`ac-load-samples-settled` / `ac-flake-reproduced-and-covered`）。② 新增局部 helper `sessionTabs()`（`document.body.querySelectorAll('[data-session-tab]')`），定位完全走 `SessionTabs` 的结构输出，与中英文文案解耦（`SessionTabs.tsx` 第 52 行 `data-session-tab={tab.id}`），也为后续把 helper 扩到 `'zh'` 留出前提。③ 语言切换用例把 `await act(async () => { await Promise.resolve() })` + `expect(writeUserSettings).toHaveBeenCalledTimes(1)` 换成 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))`；`writeUserSettings` 依旧 `(): Promise<void> => new Promise<void>(() => undefined)`（永不 resolve），「写盘未落定即整窗切换」的原语义与 `toHaveBeenCalledWith({ language: 'zh', theme: 'dark' })` 断言完整保留（`ac-write-queue-sync-point` / `ac-assertions-preserved`）。④ 未新增 `skip` / `todo` / `only`、未引入 retry、未放大 timeout（`it.skip` 仍为既有 1 条）（`ac-no-skip-no-retry`）。⑤ diff 范围只有 `src/renderer/src/App.settings.test.tsx`（+24 / −8），`src/` 产品源码、`package.json`、`vitest*.mts`、`.munk/code-gates.json`、版本 / README / 发布文件零改动（`ac-diff-scope`）。
- 证据：`.munk/runs/run_intake_3154108078c555f1/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate,structured-semantics,sync-real-gate}.log` 与同名 `.result.json`；门禁 `test` 单次全量 96 files / 1454 passed + 1 skipped。
- 注：① 本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；AC 定义已整段折入本域「验收」，人工验收步骤落 `qa/settings-language-switch-flake.md`。② **被推翻的假设**：失败根因不在「语言切换竞态」也不在「写盘」——`SettingsDialog.chooseLanguage` 在点击处理器内同步 `setLanguage(next)`，同一 act 批次内整窗重渲染；`writeUserSettings` 在该用例里本来就永不 resolve。真正缺口是**会话装载没有等待点**：`Workbench` 的 tablist 渲染条件是 `status === 'ready' && sessions.length > 0`，第一个完成的会话就让 `findByRole` 返回。后续任何「等 tablist 出现就当会话全齐」的 helper 都会在同一条路径上重犯。③ directory 场景的加载地板是**计算完成后**才起算（`elapsed` 从 `loadSampleSessions` 入口计时，再 `delay(420 - elapsed)`），所以扫描慢时它的 420ms 定时器会落进后一个 timer 批次，先提交 3 个再提交第 4 个；写新 helper 时不能用「固定 420ms 后再断言」替代逐次计数。④ 会话 tab 的结构钩子已稳定为 `data-session-tab`，本域与 `workbench` / `App.test.tsx` / `App.smoke.test.tsx` 共用；新增任何「会话条出现即完成」的断言前先确认要等的是数量还是存在性。⑤ `ac-full-suite-5x-green` 的 5 次全量重复在交付时未再跑（Host 只留单次 `test` 门证据）；现行可查证据是 code_gates 的 1 次全量通过 + 单文件 10 次重复（见 `qa/` 最近执行），后续若要给「并行负载下 5 连绿」的硬证据，应单独安排一次带负载的验证任务而不是在本项补跑。
