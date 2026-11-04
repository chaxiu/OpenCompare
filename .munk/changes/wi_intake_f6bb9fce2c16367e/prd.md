# 修复 spike 进程树退出竞态并在发布前置用同镜像 runner 验证

## Scope

- **竞态修复（产品侧）**：`scripts/verify-release.mjs` 的 `spawnCapturedChild` 增加有界的 `waitForExit`（监听真实 `exit` / `close` 事件，超时保持 null）；`createWorld().launchApp` 在 target 等待给出 `reason='process-exited'` 后，先 `await` 该子进程真实退出，再组装 `diagnostics`，避免 `stopChild` 的 SIGTERM 抢在父进程收到 exit 事件之前把 `exitCode` 写成 null。
- **测试保持严格**：`src/spike-process-tree-gate.test.ts` 失败路径继续断言 `code===1`、`conclusion==='failed'`、`reason==='process-exited'`、`exitCode===0`、日志含 `process-exited`、grandchild 已死；只允许把新增的时序/API 断言并入既有 case，不放宽、不 skip、不加重试。
- **稳定性证据**：新增 `scripts/spike-process-tree-soak.mjs`，默认循环 100 次运行失败路径用例，首红立即非零退出，逐轮打印耗时与汇总。
- **推 tag 前验证腿**：`.github/workflows/release.yml` 的 `gates` job 在 `pnpm test` 之后、coverage / `pnpm build` / Pre-create release 之前，新增 `ubuntu-latest` 上 50 次该用例的 soak 步骤；`release` 仍 `needs: gates`，发布顺序与 finalize 步骤零改动。
- **可提前触发的同镜像测试腿**：新增只读 workflow（`ubuntu-latest`，`pull_request` + `workflow_dispatch`），跑完整 gate 文件 + 该用例 ≥50 次，权限 `contents: read`，不接触任何发布动作，供推 tag 前在发布同款镜像上验证并留下 run 记录。
- **门禁同步**：`src/main/release-packaging.test.ts` 与其 fixture 中 gates 的 `pnpm` 步骤顺序钉板同步加入新腿（属收紧断言）；`.munk/code-gates.json` 不新增 gate 项（`spike-process-tree-gate` 已注册）。

## Acceptance Criteria

- ac-exitcode-real: 失败路径生成的 `spike.json` 中 `exitCode` 为真实退出码 `0` 而非 `null`，`reason` 为 `process-exited`；实现上 `createWorld().launchApp` 在组装该 reason 的 diagnostics 前 await 子进程真实 `exit`/`close`，且该 await 受 `SPIKE_PROCESS_EXIT_BUDGET_MS` 有界约束。
- ac-contract-kept: 失败路径断言仍严格为 `code===1`、`conclusion==='failed'`、`reason==='process-exited'`、`exitCode===0`、log 含 `process-exited`、grandchild 不存活；无 `.skip`/`.only`/空 catch 吞断言/放宽比较。
- ac-no-sleep-budget: 不新增固定 sleep 或"加倍等待"来掩盖竞态；`SPIKE_PROCESS_EXIT_BUDGET_MS=5000`、`SPIKE_TARGET_TIMEOUT_MS=60000`、`SPIKE_APP_SHELL_TIMEOUT_MS=60000` 数值不变，不引入失败重试。
- ac-soak-100: `node scripts/spike-process-tree-soak.mjs` 默认 100 轮运行失败路径用例，输出 `100/100 passed`、每轮与总耗时；任一轮红即非零退出并打印该轮输出。
- ac-linux-mechanism: 交付说明（或 `docs/lessons.md`）写清 Linux 机理：`leader-exits` 的 marker 在子进程 `process.on('exit')` 中写入，只证明子进程开始退出，不保证父进程已收到 `exit`/`close`；因此必须以父进程事件为同步点，并说明 `exit` 先于 `close`、信号与 exitCode 的先后关系。
- ac-release-preflight-leg: `release.yml` 的 `gates` job 在 `pnpm test` 之后、Coverage gate / `pnpm build` / Pre-create the tag's release 之前，存在在 `ubuntu-latest` 上把该失败路径用例循环 ≥50 次的步骤，且任一轮失败使 gates 失败；`pnpm test`、`release.needs='gates'`、finalize 与 publish 步骤及其顺序均不变。
- ac-pretag-workflow: 新增 workflow 使用 `runs-on: ubuntu-latest`，触发含 `pull_request` 与 `workflow_dispatch`，权限仅 `contents: read`，运行完整 `src/spike-process-tree-gate.test.ts` 并把该用例循环 ≥50 次，不含任何 tag/release/upload 动作。
- ac-workflow-pinned: `src/main/release-packaging.test.ts` 的 gates `pnpm` 步骤顺序断言与 `src/main/__fixtures__/release-packaging.json` 同步包含新增测试腿；release 顺序、secret、upload 既有断言零改动。
- ac-run-record: 交付证据包含真实的 `ubuntu-latest` Actions run URL/id，其日志显示 soak 循环 `50/50` 通过且 `spike CLI teardown` 失败路径用例为绿；本 worktree 禁止 `git push` / `gh auth`，若该记录无法在本环境产出，Delivery 必须显式标注为「待 Owner 授权 dispatch/PR 的未完成证据」，禁止引用未产出的 run 或伪造日志。
- ac-code-gates-green: `.munk/code-gates.json` 全部 gate 通过（含 `spike-process-tree-gate`、`test`、`test-debt-gate`），`src/core/**` 覆盖率地板未下调，改动文件之外无无关 diff。

## Non-Goals

- 不调整 `release.yml` 的发布顺序、finalize / publish / post-release-verify 逻辑，不移除任何验证步骤。
- 不打 tag、不 push、不修改已公开 Release / tag / release notes。
- 不调大 `SPIKE_*` 预算，不靠 sleep / 重试 / skip / 放宽 `exitCode === 0` 断言换绿。
- 不改无关测试、不重排既有测试套件、不新增与本次竞态无关的 gate 或重构 `stopChild` 的第二份实现。
- 不修改 `src/core/**` 产品代码，不降覆盖率地板。

## Implementation Constraints

- **单一收尾实现**：仍只在 `spawnCapturedChild` / `stopChild` 一处做进程组信号与管道释放；新增 `waitForExit` 只做有界等待，不复制 kill 逻辑，不改变 `stopChild` 的 SIGTERM→SIGKILL 语义。
- **同步点选择**：优先产品侧修复（`launchApp` 组装 `process-exited` diagnostics 前 await 子进程退出），因为注入的 `waitForTarget` 拿不到子进程句柄；不要通过修改 fake tree 的 marker 写入时机来"看起来稳"。
- **已有修复 9f4e5f1 的边界**：该提交让测试等 `.exited` marker，但 marker 在子进程 `process.on('exit')` 中同步写入，早于父进程收到 `exit` 事件，因此 Linux 仍可复现；新实现必须显式等待父进程事件。
- **有界与 fail-closed**：`waitForExit` 超时返回当前状态（可能仍为 null），不得无限等待；失败路径仍以真实退出码为准。
- **workflow 约束**：新增 soak 步骤可用 bash 循环（`release.yml` 已使用 bash），但不得改变 `release`/`finalize` 的 `needs` 与步骤顺序；新 workflow 只读、无 secrets、无 `gh release`。
- **门禁与 ratchet**：`.munk/code-gates.json` 不新增 gate 项；若新增测试用例导致 `test-debt` 收集数变化，需同步 `.munk/baseline/test-debt.json` 的 growth 记录，但优先把断言并入既有 case。
- **证据真实性**：题述根因文件 `.munk/runs/trun_35dc221a0c288549/evidence/root-cause.md` 在本 worktree 不存在，不得引用；Coding 需在自身环境复核 `scripts/verify-release.mjs` 调用链并留下实测输出（`pnpm install` 后运行）。
- **本地环境**：当前 worktree 无 `node_modules`，Coding 需先执行 `pnpm install` 再跑 gate。
