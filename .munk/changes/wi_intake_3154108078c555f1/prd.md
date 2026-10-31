# 修复 App.settings 语言切换用例在并行负载下的 flake（4 vs 3 tab）

## Scope

只处理 `src/renderer/src/App.settings.test.tsx` 中
`language switch > switches every shell surface in the same click, before the write settles`
的偶发失败（两次发布前全量门变红：2026-10-31 一次；`wi_intake_b5a72bf708df3c08` 交付后 `code_gates` 因它失败重跑才过），失败表现为断言 tab 数期望 4、实得 3。

改动范围限定在测试等待方式：把「示例会话装载」「设置写盘串行队列」「语言切换整窗生效」三处隐式时序假设收敛为确定性的同步点。产品源码、其他测试语义、门禁配置、版本 / README / 发布文件一律不动。

## Root Cause（已本地复现，含失败日志）

失败日志（本次 intake 在 12 个 `yes` 占满 CPU + 8 个并行 `vitest run src/renderer/src/App.settings.test.tsx` 下复现，8 次里 1 次红）：

```text
FAIL  src/renderer/src/App.settings.test.tsx > language switch > switches every shell surface in the same click, before the write settles
AssertionError: expected [ <button …(6)>…(2)</button>, …(2) ] to have a length of 4 but got 3
- Expected  4
+ Received  3
 ❯ src/renderer/src/App.settings.test.tsx:273:7
    271|     expect(
    272|       within(screen.getByRole('tablist', { name: '会话' })).getAllByRole…
    273|     ).toHaveLength(4)
```

同一命令其余 7 次全绿（`Tests 13 passed`），符合 flake 特征。

异步链路与缺失的等待点：

1. `loadDemoSamples`（测试文件 75–89 行）依次点 4 个 `data-sample-entry`（directory / code / csv / structured），每次点击只同步断言设置面板已关闭；循环结束后仅
   `await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })`。
2. `Workbench` 的 tablist 渲染条件是 `status === 'ready' && sessions.length > 0`（`src/renderer/src/workbench/Workbench.tsx` 会话条区域），因此 **第一个完成装载的会话** 就会让 `findByRole` 返回，而不是四个都装载完。每个 `load()` 都是独立的一次 `setSessions → setActiveId → setStatus('ready')` 提交。
3. `loadSampleSessions`（`src/renderer/src/workbench/loadSampleSessions.ts`）里只有 directory 场景会 `await compareDirectories(...)`（真实的异步目录扫描 + digest），code / csv / structured 的 map 回调同步返回；四者随后都要过 `LOADING_FLOOR_MS = 420` 的加载地板，而该地板是从 **计算完成之后** 才起算（`elapsed` 从函数入口计时，再 `delay(420 - elapsed)`）。
4. 并行负载下 directory 的 `compareDirectories` 耗时被拉长，超过四次点击之间的间隔；它的 420ms 定时器因此比 code / csv / structured 的定时器 **更晚进入事件循环**，落在后一个 timer 批次。前一批次先提交 3 个会话（code / csv / structured），tablist 以 3 个 tab 出现 → `findByRole` 立即返回 → 用例点击语言切换并断言 → 期望 4、实得 3。directory 会话在断言之后几毫秒才提交。

结论：这不是语言切换本身的竞态——`SettingsDialog.chooseLanguage` 在点击处理器内同步 `setLanguage(next)`，整窗在同一 act 批次内重渲染；也不是写盘导致的——该用例的 `writeUserSettings` 故意返回永不 resolve 的 Promise（这正是「before the write settles」的前提）。真正的缺口是 **会话装载没有等待点**：`loadDemoSamples` 只等到「tablist 出现」，没有等到「四个示例会话全部挂载」。

附带的一处隐式假设：`await act(async () => { await Promise.resolve() })`（281–283 行）依赖串行写盘队列的 `.then` 微任务恰好先于 act 的续体执行，属于调度顺序假设，不是确定性的写盘队列同步点。

## Acceptance Criteria

- ac-flake-reproduced-and-covered: 复现原 flake 的失败路径（directory 会话晚于另外三个提交）被新的等待条件直接覆盖；改后在同一并行负载下该用例不再出现「期望 4、实得 3」。
- ac-load-samples-settled: `loadDemoSamples` 只在四个内置示例会话全部挂载后才返回——每点一个 `data-sample-entry` 都用 `waitFor` / `findBy` 等到会话 tab 数增长到 i+1（或对应 tab 出现），循环后再等到 tablist 内 tab 数恰为 4 且最后一个会话为 active；不依赖单次微任务 flush、固定 sleep 或「tablist 出现」这一弱条件。
- ac-write-queue-sync-point: 语言切换用例里，把「写盘串行队列已派发」改为 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))` 这类显式等待；`writeUserSettings` 仍返回永不 resolve 的 Promise（不得 await 其 resolve，否则用例挂死），从而保持「断言发生在写盘落定之前」的原语义。
- ac-assertions-preserved: 原断言逐条保留，不得删弱：切换后 `tablist` 名为 `会话`、tab 数为 4、`contentinfo` 含 `会话`、设置面板为中文、语言选项为 `['English','简体中文']`、`writeUserSettings` 调用 1 次且参数为 `{ language: 'zh', theme: 'dark' }`、`readUserSettings` 调用次数等于启动时、切回英文后 `tablist` 名为 `Sessions`、`contentinfo` 含 `Session`、设置面板为英文。
- ac-state-preserved-assertions-intact: `keeps sessions, directory view state and unsaved edits, and reworks nothing` 与 `keeps the chosen language and reports a failed write in place` 中既有的会话标题、活动 tab、未保存标记、仅差异过滤、选中行、滚动位置、状态栏路径、平台调用次数等断言全部保留，且因共享 helper 变确定后仍全绿。
- ac-no-skip-no-retry: 不新增 `skip` / `todo` / `only`，不引入 retry 插件或 `retry:` 配置，不放大既有 timeout 上限（`loadDemoSamples` 现有的 4000ms 上限可复用为等待上界，但不得在此基础上继续加大）。
- ac-single-file-10x-green: `pnpm test src/renderer/src/App.settings.test.tsx` 连续运行 ≥10 次全部通过，逐次给出结果摘要（Tests 行）。
- ac-full-suite-5x-green: 在并行负载下连续运行 5 次全量 `pnpm test`，5 次全部通过，逐次给出结果摘要（Test Files / Tests / Duration）。
- ac-diff-scope: 相对交付基线的 `git diff --name-only` 只含 `src/renderer/src/App.settings.test.tsx`（确需新增测试辅助时，只能是 renderer 测试目录内的测试专用文件）；`src/` 产品源码、其他测试文件、`package.json`、`vitest*.mts`、`.munk/code-gates.json`、版本 / README / 发布文件零改动。
- ac-code-gates-green: 按 `.munk/code-gates.json` 全量门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics / sync-real-gate）逐条通过后交付。

## Non-Goals

- 不改产品源码：`loadSampleSessions` 的 `LOADING_FLOOR_MS`、`Workbench` 的装载 / 提交顺序、`SettingsDialog` 的写盘队列与语言切换逻辑一律不动。
- 不改其他测试的语义、断言或超时；不重构测试文件结构，不抽公共测试框架。
- 不动版本号、CHANGELOG、README、`electron-builder.yml`、`.github/**` 等发布文件。
- 不动 `.munk/code-gates.json`，不放宽任何门禁。
- 不用 `skip`、不用 retry、不用放大 timeout 或固定 sleep 掩盖竞态。
- 不追求把 `pnpm test` 变快，也不做与本 flake 无关的测试清理。

## Implementation Constraints

- 只改 `src/renderer/src/App.settings.test.tsx`；确需新增测试辅助时，只允许落在 renderer 测试目录内（如 `src/renderer/src/**` 下的 `*.test-helpers.ts`），不得进入 `src/core`、`src/main`、`src/preload`。
- 等待条件必须与语言无关：用 tab 数 / `aria-selected` / `data-*` 之类的结构信号，不要绑定中英文 tab 标题文案（helper 现被三处用例以 `'en'` 调用，后续可能扩到 `'zh'`）。
- 禁止用 `await new Promise(r => setTimeout(r, N))` 之类固定 sleep 作为同步点；`waitFor` / `findBy` 的条件必须是「已经成立的事实」而非时间。
- 不得把 `writeUserSettings` 从「永不 resolve」改成可 resolve，否则会破坏该用例「写盘未落定即已整窗切换」的原始断言意图。
- 验证证据必须逐次可查：5 次全量 `pnpm test` 与 ≥10 次单文件运行的结果摘要（可并行负载，需注明并发方式）；若本地仍无法复现原 flake，必须贴出失败日志与根因分析，并说明新等待条件如何直接覆盖该路径，不能以「本地没复现」收工。本 prd 已附一次复现日志（12 个 CPU 占用进程 + 8 个并行 vitest，8 次中 1 次红），可作为对照基线。
- 交付前按 `.munk/code-gates.json` 逐条跑门禁，全绿后再交付。
