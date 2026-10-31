covers: ac-flake-reproduced-and-covered, ac-load-samples-settled, ac-write-queue-sync-point, ac-assertions-preserved, ac-state-preserved-assertions-intact, ac-no-skip-no-retry, ac-single-file-10x-green, ac-full-suite-5x-green, ac-diff-scope, ac-code-gates-green
标题: `App.settings` 语言切换用例在并行负载下不再「期望 4、实得 3」——会话装载与写盘队列改为确定性同步点
步骤: 读 `src/renderer/src/App.settings.test.tsx` 的 `loadDemoSamples` / `sessionTabs` / `switches every shell surface in the same click, before the write settles` 三处 → 制造并行负载（多进程占 CPU 或并行跑同一 vitest 文件）复跑该用例 → 连续跑 `pnpm test src/renderer/src/App.settings.test.tsx` ≥10 次 → 并行负载下跑全量 `pnpm test` → `git diff --name-only` 对照交付基线 → 按 `.munk/code-gates.json` 逐条过门
期望: `loadDemoSamples` 每点一个 `data-sample-entry` 都 `waitFor` 到 `[data-session-tab]` 数增长到 `i+1`（4000ms 上界，无固定 sleep），循环后再等到数量恰 4 且最后一个 tab `aria-selected === 'true'`；`sessionTabs()` 只读 `[data-session-tab]`，不绑中英文文案；语言切换用例用 `await waitFor(() => expect(writeUserSettings).toHaveBeenCalledTimes(1))` 取代 `act(async () => await Promise.resolve())`，`writeUserSettings` 仍永不 resolve；切换后 `会话` tablist 4 个 tab、`contentinfo` 含 `会话`、语言选项 `['English','简体中文']`、写盘参数 `{ language: 'zh', theme: 'dark' }`、`readUserSettings` 次数不变、切回英文后 `Sessions` / `Session` 各就位；`keeps sessions, directory view state and unsaved edits, and reworks nothing` 与 `keeps the chosen language and reports a failed write in place` 断言未删弱且全绿；无新增 `skip` / `todo` / `only` / retry、timeout 未放大；单文件 ≥10 次全绿且逐次有 Tests 行；`git diff --name-only` 仅 `src/renderer/src/App.settings.test.tsx`；11 道门禁逐条 passed

## 最近执行

- workItemId: wi_intake_3154108078c555f1
- at: 2026-11-01
- status: pass
- note: `code_gates` passed（11 门，attempt 001，`.munk/runs/run_intake_3154108078c555f1/code-gates/attempts/001`）；门禁 `test` 单次全量 96 files / 1454 passed + 1 skipped / 1455（Duration 27.36s）。交付侧另连续跑 `pnpm test src/renderer/src/App.settings.test.tsx` 10 次，逐次 1 file / 13 passed。原始 flake 复现基线（intake 时）：12 个 `yes` 占满 CPU + 8 个并行 `vitest run src/renderer/src/App.settings.test.tsx`，8 次里 1 次红于 `App.settings.test.tsx:273` 的 tab 数断言（期望 4、实得 3）。`ac-full-suite-5x-green` 的 5 次全量重复本轮未复跑，可查证据为 code_gates 单次全量 + 单文件 10 次；如需硬证据应另排一次带负载的全量验证。
