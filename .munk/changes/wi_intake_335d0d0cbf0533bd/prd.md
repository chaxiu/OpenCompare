# Q5 测试清债：App.test.tsx 与 sync-real-gate 去重压缩（test-only）

## 范围

只做测试侧去重：把两个超长测试文件里重复的 setup / 渲染包装 / 事件派发 / 断言封装收敛到一个共享 harness，**行为断言一行不删、被测行为零改动**。

实测基线（本 WI 分支 `wc -l`）：

| 文件 | 当前行数 | 用例声明 |
| --- | --- | --- |
| `src/renderer/src/App.test.tsx` | 3,449 | 94 `it` |
| `src/sync-real-gate.test.ts` | 2,761 | 32 `it` |
| 合计 | **6,210** | **126** |

- 全仓用例基线：`pnpm test` 报 1,836（本 WI 的验收以该报告的 total 前后对比为准；静态 `it(`/`test(` 声明数 1,446，表格展开后为 1,836）。
- 覆盖取证：`@vitest/coverage-v8@5.0.5` **已在本仓 `devDependencies` 声明**，`pnpm install` 后即可取数，无需新增依赖。
- 允许动作仅限：抽取 `render` 包装、每文件通用 setup（平台端口/fixture 构造、localStorage、clientWidth/Height 之类）、事件派发（点击/拖拽/键盘）、断言封装（把同一段重复 expect 序列命名），并删除因此重复的 setup 与重复渲染包装。

## Acceptance Criteria

- ac-line-budget: `wc -l src/renderer/src/App.test.tsx src/sync-real-gate.test.ts` 合计 ≤ 5,000 行（基线 6,210，净减 ≥ 1,200），且两文件仍存在、非空、仍包含各自的 `describe` 分组。
- ac-no-new-test-file: 仓库内 `*.test.ts` / `*.test.tsx` 文件数量与改动前一致；不新增任何测试文件、不新增门禁项。
- ac-single-helper: `git status --porcelain` 中新增文件恰好 1 个共享 harness，位于 `src/test/` 且文件名不匹配 `*.test.*`；该 helper ≤ 500 行；两目标文件 + helper 合计 ≤ 5,500 行（防止“把代码搬进 helper”冒充删除）。
- ac-test-count: `pnpm test` 报告的用例总数改动后 ≥ 1,745（相对 1,836 降幅 ≤ 5%）；两目标文件的 `it(` + `test(` 声明数保持 126（不减少）。
- ac-assertion-parity: 两目标文件 + helper 内 `expect(` 出现总数 ≥ 924（改动前 537 + 387）；delivery 提供逐用例「逻辑断言条数 改动前/后」表，每个用例的条数相等或增加；凡条数变化必须精确对应到已列名的 helper 断言封装，且不得把两个原本独立的断言并成一次 `toEqual`/`toBe` 比对。
- ac-no-skip-or-each: `git diff` 不新增任何匹配 `it\.each|test\.each|describe\.each|\.skip\(|\.only\(|\.todo\(|\.concurrent\(` 的行；不新增仅用于跳过断言的早退/条件守卫（delivery 逐条说明任何新增分支均为 fixture 早退且其后断言照常执行）。
- ac-helper-node-import-safe: 共享 harness 在 node 环境可安全 import（顶层不访问 `document` / `window`）；证据为 `pnpm test:sync-real` 全绿且未新增环境守卫 mock。
- ac-coverage-evidence: 依次执行 `pnpm install` 与覆盖率命令（如 `pnpm exec vitest run --coverage`）取改动前/后摘要；全仓 statements / branches / functions / lines 以及 `src/renderer/src/App.tsx`、`src/core/directory/sync.ts` 两模块的四项指标降幅均 ≤ 0.5pp。若 provider 确实不可用，贴出实测 `MISSING DEPENDENCY` 原文，改用替代口径「行为断言条数前后一致 + 关键路径逐条列举」；禁止编造覆盖率数字；不得新增运行时依赖。
- ac-sync-real-regression: `src/sync-real-gate.test.ts` 仍保留并复跑失败与取消两条真实外部目录分支，用例标题逐字仍在：`rolls a mid-plan failure back to the exact previous disk and stays retryable`、`cancels mid-plan, rolls back and reports a cancellation distinct from failure`；`pnpm test:sync-real` 退出码 0，且两条用例的既有断言不得删改。
- ac-app-shell-regression: `src/renderer/src/App.test.tsx` 仍保留并跑通 `keeps 3 tabs resident and switches with zero scans or digests`（建 3 tab + 切 tab 不重扫）；`pnpm test src/renderer/src/App.settings.test.tsx` 全绿，其中 `switches every shell surface in the same click, before the write settles`（设置语言切换）文件保持零改动。
- ac-code-gates-green: `.munk/code-gates.json` 中每个 gate 全绿（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `sync-real-gate` 及全部 template、cancel、memory、structured、release 门禁）；不得 skip、放宽或删除任何既有判定。
- ac-scope-and-version: `package.json` 与 `pnpm-lock.yaml` 零改动（`version` 保持 `0.2.16`，无依赖/scripts 变更）；`git diff --name-only` 仅含 `.munk/changes/wi_intake_335d0d0cbf0533bd/**`、上述两个测试文件与 1 个 helper；`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**`、`scripts/**`、`.github/**` 零 diff。
- ac-no-browser-device: 不运行浏览器、Electron 窗口或实机；全部证据来自 `code_gates`、jsdom 单测与 `mkdtemp` 真实临时目录；不触碰 `src/verify-release-gate.test.ts` 及 release 单点文件（`scripts/verify-release.mjs`、发布 workflow 等）。

## 非目标

- 不做测试框架迁移（保持 vitest 5 + jsdom + `@testing-library/react`），不引入新测试库或新依赖。
- 不重写用例、不改期望值、不合并不同行为的用例、不降低断言粒度、不改 e2e 覆盖面。
- 不新增 `*.test.ts(x)` 文件，不新增代码门禁项，不改 `.munk/code-gates.json`。
- 不碰 release 单点文件与 `verify-release-gate` 测试（属 Q4）。
- 不做产品行为/样式/文案/依赖升级等顺手改动，不跑浏览器或实机。

## Implementation Constraints

- 只允许 1 个共享 harness（非测试文件，建议 `src/test/sharedHarness.tsx`），内容限定为 render 包装、公共 setup、事件派发、断言封装；不得在其中新增行为用例或新的 `describe`/`it`。
- helper 必须同时被 node（`sync-real-gate`）与 jsdom（`App.test`）两个环境安全复用；顶层不得触碰 DOM。
- 每删除一段重复 setup，必须在 delivery 写明去向：删除位置 → helper 导出名 → 受影响的测试清单；禁止整段用例平移进 helper 充数。
- 两文件内联行为断言一行不删：只允许把重复 setup 替换为 helper 调用，并保证每个用例仍能独立定位失败。
- 覆盖率优先复用已声明的 `@vitest/coverage-v8@5.0.5`；确需 provider 时只允许 devDependency，并在 delivery 说明理由与 lockfile diff（本项预期不需要，`package.json` 应保持不变）。
- 滑窗：20:30 前未全绿就停下并记录顺延；不得为赶工压缩行数、断言、覆盖或门禁任一验收项。
