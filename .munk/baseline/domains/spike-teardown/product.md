# Domain: spike-teardown

spike 进程树收尾与发布前同镜像预演域：把「spike 失败路径拿到的退出码必须来自父进程真实 `exit` / `close` 事件，而不是子进程自写的 marker」这一同步点口径，连同有界 `waitForExit`、进程组一次性收尾、稳定性 soak 与推 tag 前的只读同镜像预演腿收敛成仓内可复核契约。`scripts/verify-release.mjs` 的启动描述 / 诊断字段 / A 层 15 项验收契约归 `domains/release-verify`；发布顺序与 finalize 公开顺序归 `domains/release-publish-gate`；打包通道归 `domains/release`；门禁矩阵形状归 `domains/quality-gates`。

## 范围

- **父进程事件才是同步点**：`spawnCapturedChild` 暴露 `waitForExit({ timeoutMs })`，只在父进程 `exit` 事件 settle，`close` 作为兜底（`close` 必晚于 `exit`，两者 `code` / `signal` 相同）；超时返回当前状态（仍可能为 `null`），不无限等待。
- **失败路径等待真实退出码**：`createWorld().launchApp` 在 `reason === 'process-exited'` 组装 diagnostics 之前 `await proc.waitForExit()`，之后才 `stopChild`；诊断字段与 step log 仍由 `stepDiagnostics` / `formatStepDiagnostics` 唯一产出（契约见 `domains/release-verify`）。
- **单一收尾实现**：Linux 组信号 + SIGTERM→SIGKILL 升级 + 管道 / 监听释放只在 `spawnCapturedChild` / `stopChild` 一处实现，成功与失败路径共用；`process.exit` 只经脚本入口 `exitAfterFlush`。`waitForExit` 只做有界等待，不复制 kill 逻辑。
- **预算固定**：`SPIKE_PROCESS_EXIT_BUDGET_MS=5000`、`SPIKE_TARGET_TIMEOUT_MS=60000`、`SPIKE_APP_SHELL_TIMEOUT_MS=60000` 不为治竞态调大；不新增固定 sleep、不加失败重试。
- **稳定性 soak**：`scripts/spike-process-tree-soak.mjs`（`package.json#test:soak`）逐轮跑真实 `process-exited contract` 用例，默认 100 轮、`--rounds=N` 覆盖，逐轮与总耗时可见。
- **发布前置腿**：`release.yml#gates` 的 `ubuntu-latest` 50 轮 soak 位于 `pnpm test` 之后、Coverage gate / `pnpm build` / Pre-create release 之前；只读 `.github/workflows/spike-process-tree-preflight.yml` 提供推 tag 前的同镜像预演。

## 验收

- **ac-spike-linux-launch-descriptor**：给定平台与端口，启动描述逐字段可断言——Linux 为 `command="xvfb-run"`、`args` 以 `-a` 开头且含 `--no-sandbox` / `--disable-dev-shm-usage` / `--remote-debugging-port=<port>`，入口仍是仓库根 `.`；darwin 为 Electron 二进制 + `.` + 端口参数，不含 `--no-sandbox` / `xvfb-run`；两者共用同一构造函数；缺二进制或端口越界抛错。
- **ac-spike-workflow-parity**：spike 的 Linux 与 macOS 步骤同一命令形状（同一脚本、同一组参数），Linux 不由外层 `xvfb-run` 包裹（xvfb 归属唯一）且步骤前显式安装 xvfb。
- **ac-spike-exitcode-real**：失败路径 `spike.json` 的 `exitCode` 为真实退出码 `0` 而非 `null`、`reason="process-exited"`；`launchApp` 在组装该 diagnostics 前 `await` 父进程真实 `exit`/`close`，等待受 `SPIKE_PROCESS_EXIT_BUDGET_MS` 有界；page target 出现前子进程退出时仍 ≤5s 以退出码 1 结束（不空转到 120s），`stdout` / `stderr` 字段存在。
- **ac-spike-bounded-target-wait**：子进程存活但无 page target 时，在固定预算（≤60s，常量 `SPIKE_TARGET_TIMEOUT_MS`）内失败，`reason="no-page-target"`，`portProbe` ≥1 条，探针间隔为常量（`SPIKE_TARGET_POLL_INTERVAL_MS`，>0 且 ≤1s），并记录会话总时长。
- **ac-spike-reason-app-shell**：target 已出现但 app shell 表达式在预算内未就绪时，`reason="app-shell-timeout"`，与 `no-page-target`、`process-exited` 三者互不混同（`SPIKE_FAILURE_REASONS` 取值集合固定且封闭）。
- **ac-spike-diagnostics-artifact**：失败时 `--out` 下同时落 `spike.json`（`conclusion` / `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `portProbe` / `startedAt` / `finishedAt`）与 `spike-launch.log`（Electron 输出、xvfb 输出、端口 / 目标探针）；成功时 `spike.json` 含 `conclusion="window-booted"` 与 `url`；两条路径原子落盘，不因异常丢文件。
- **ac-spike-gate-registered / ac-no-relax**：`spike-launch-gate`（`src/spike-launch-gate.test.ts`）与 `spike-process-tree-gate`（`src/spike-process-tree-gate.test.ts`）写入 `.munk/code-gates.json`（`version` 仍为 1、命令为单 argv、不含 `&&` / `||` / `|` / `;`），测试不启真实窗口 / xvfb、不联网（时钟 / 探针 / 子进程 / world 全部注入）且硬超时；`expected=15`、`judgeReleaseGate`、`validateSummary` 与三个 `SPIKE_*` 预算均不放宽；workflow 触发面 / 权限 / job 超时不变。
- **ac-linux-group-kill**：Linux spike 子进程以 `detached: true` 建立进程组；stop 先对 `-pid` 整组 SIGTERM，超预算则整组 SIGKILL 并在有界 `killWaitMs` 内 resolve；`ESRCH` / `EPERM` 容忍；用真实父子孙链验证 stop 返回后父、孙 `kill(pid, 0)` 均失败，零幸存者。
- **ac-stdio-released**：stop 返回后子进程 `stdout` / `stderr` 均为 destroyed，`exit` 与两条流的 `data` 监听数为 0，无未 unref 管道句柄。
- **ac-spike-paths-reaped**：成功与三类失败共用同一收尾实现；成功证据字段（`conclusion` / `reason=null` / `url` / `portProbe`）不丢，失败诊断契约不回归，两条路径零孤儿，grandchild 不存活。
- **ac-cli-deterministic-exit**：独立 Node 驱动进程跑成功路径、不施加外部 kill，固定预算（≤15 s，不延长 `SPIKE_*`）内退出码 0，`spike.json` 与 `spike-launch.log` 完整落盘。
- **ac-evidence-flushed-before-exit**：`exitAfterFlush` 只在模块入口（库函数零调用），先等 stdout / stderr drain，`SPIKE_EXIT_FLUSH_TIMEOUT_MS` 兜底；退出后 `spike.json` 可 parse、`spike-launch.log` 含启动行与 ≥1 条 `/json/list` 探针。
- **ac-macos-parity**：macOS 不加 `detached`、启动描述与输出语义不变；`buildSpikeLaunchDescriptor` 与既有 macOS 记录字段零改动。
- **ac-contract-kept**：失败路径断言仍严格为 `code===1`、`conclusion==='failed'`、`reason==='process-exited'`、`exitCode===0`、log 含 `process-exited`、grandchild 不存活；无 `.skip` / `.only` / 空 catch 吞断言 / 放宽比较。
- **ac-spike-soak**：`node scripts/spike-process-tree-soak.mjs` 默认 100 轮运行失败路径用例，逐轮打印耗时并输出 `100/100 passed` 与总耗时；每轮必须命中恰 1 条用例（`Tests 1 passed`），任一轮红或零命中即非零退出并打印该轮输出。
- **ac-release-soak-leg**：`release.yml#gates` 在 `pnpm test` 之后、Coverage gate / `pnpm build` / Pre-create the tag's release 之前，存在 `ubuntu-latest` 上把该用例循环 ≥50 次（`pnpm test:soak -- --rounds=50`）的步骤，任一轮失败使 gates 失败；`pnpm test`、`release.needs='gates'`、finalize 与 publish 步骤及其顺序均不变。
- **ac-pretag-preflight-workflow**：`.github/workflows/spike-process-tree-preflight.yml` 触发仅 `pull_request` + `workflow_dispatch`，`runs-on: ubuntu-latest`，`permissions: contents: read`，先跑完整 `src/spike-process-tree-gate.test.ts` 再循环该用例 ≥50 次，零 `secrets.*`、零 tag / release / upload / `gh` 写动作。
- **ac-workflow-pinned**：`src/main/release-packaging.test.ts` 的 gates `pnpm` 步骤顺序断言与 `src/main/__fixtures__/release-packaging.json` 同步包含新增 soak 腿（`gates-soak-position` 钉 soak → Coverage → Pre-create），release 顺序、secret、upload 既有断言零改动。
- **ac-spike-run-record**：真实 `ubuntu-latest` Actions run（日志显示 soak `50/50` 通过且 gate 文件全绿）才算闭环；本 worktree 禁止 `git push` / `gh auth`，无法产出时 Delivery 必须显式标注「待 Owner 授权 dispatch/PR 的未完成证据」，禁止引用未产出的 run 或伪造日志。
- **ac-repro-before-fix / ac-lessons-updated**：改动前在真实证据上复核并用假进程树复现旧缺陷；`docs/lessons.md` 记录 Linux 机理（marker 在子进程 `process.on('exit')` 同步写入只证明子进程开始退出；`exit` 先于 `close`；信号被杀时 `code===null` / `signal` 有值）与收尾契约，门禁 markers 断言该节存在。
- **ac-code-gates-green**：`.munk/code-gates.json` 全部 gate 通过（含 `spike-process-tree-gate`、`test`、`test-debt-gate`），`src/core/**` 覆盖率地板未下调，改动文件之外无无关 diff。

## 非目标

- 不调整 `release.yml` 的发布顺序、finalize / publish / post-release-verify 逻辑，不移除任何验证步骤。
- 不打 tag、不 push、不修改已公开 Release / tag / release notes。
- 不调大 `SPIKE_*` 预算，不靠 sleep / 重试 / skip / 放宽 `exitCode === 0` 断言换绿。
- 不改无关测试、不重排既有测试套件、不新增与本次竞态无关的 gate，不保留 `stopChild` 的第二份实现。
- 不修改 `src/core/**` 产品代码，不降覆盖率地板。
- 不通过修改 fake tree 的 marker 写入时机来「看起来稳」，也不以 marker 作为同步点。

## 实现约束

- **同步点选择**：优先产品侧修复（`launchApp` 组装 `process-exited` diagnostics 前 await 子进程退出），因为注入的 `waitForTarget` 拿不到子进程句柄；不得用改 marker 时机或放宽断言替代。
- **已有修复 9f4e5f1 的边界**：该提交让测试等 `.exited` marker，但 marker 在子进程 `process.on('exit')` 中同步写入，早于父进程收到 `exit` 事件，因此 Linux 仍可复现；新实现必须显式等待父进程事件。
- **有界与 fail-closed**：`waitForExit` 超时返回当前状态（可能仍为 `null`），不得无限等待；失败路径仍以真实退出码为准，不因等待超时改判或重试。
- **收尾单一实现**：`waitForExit` 只读事件、不 kill；进程组信号与管道释放仍只在 `spawnCapturedChild` / `stopChild`，成功与失败路径共用，SIGTERM→SIGKILL 语义不变。
- **workflow 约束**：soak 步骤可用 bash 循环（`release.yml` 已使用 bash），但不得改变 `release` / `finalize` 的 `needs` 与步骤顺序；新 workflow 只读、无 secrets、无 `gh release`。
- **门禁与 ratchet**：`.munk/code-gates.json` 不新增 gate 项（`spike-process-tree-gate` 已注册）；优先把新断言并入既有 case，若收集数变化需同步 `.munk/baseline/test-debt.json` 的 growth 记录。
- **证据真实性**：不得引用本 worktree 不存在的根因文件；Coding 需在自身环境复核 `scripts/verify-release.mjs` 调用链并留下实测输出（`pnpm install` 后运行）。

## 最近交付证明

- WI：`wi_intake_f6bb9fce2c16367e`（修复 spike 失败路径 `exitCode=null` 竞态 + 发布前置同镜像 soak，`kind: fix`）；日期：2026-11-04；`deliveryIntent: local merge`。
- 结果：`code_gates` passed（29 门，attempt 001，`.munk/runs/run_intake_f6bb9fce2c16367e/code-gates/attempts/001`，`summary = "code_gates passed (29 gates, attempt 001)"`，`failedGateIds: []`）；`pnpm test` 135 files / 2177 passed + 1 skipped / 2178。
- 改动面：`scripts/verify-release.mjs`（`waitForExit` + `launchApp` 在 `process-exited` 前等待 + catch 分支不再丢弃 diagnostics 前先收尾）、`.d.mts`、`src/spike-process-tree-gate.test.ts`（改为断言真实 `{code:0,signal:null}` 与 log 含 `exitCode=0`）、`scripts/spike-process-tree-soak.mjs` + `package.json#test:soak`、`release.yml#gates` soak 腿、只读 `spike-process-tree-preflight.yml`、`release-packaging.test.ts` + fixture 顺序钉板、`docs/lessons.md` 第 15 节。
- 关键点：① 同步点从子进程 marker 改成父进程事件，`SPIKE_*` 预算与断言强度零放宽；② 等待只加在 `process-exited` 分支，成功路径与 SIGTERM→SIGKILL 收尾仍只有一份实现；③ 未完成证据：本 worktree 无 push / `gh auth`，真实 `ubuntu-latest` preflight / release soak run 未产出，`ac-spike-run-record` 标注为「待 Owner 授权 dispatch/PR 的未完成证据」；本地 100 轮 soak 亦未在交付阶段复跑，现有证据为 29 门全绿 + `test` 单次全量与 `spike-process-tree-gate` 11 例。
