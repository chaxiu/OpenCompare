# Domain: spike-teardown

spike 进程树收尾与发布前同镜像预演域：把「spike 失败路径拿到的退出码必须来自父进程真实 `exit` / `close` 事件，而不是子进程自写的 marker」这一同步点口径，连同有界 `waitForExit`、进程组一次性收尾、稳定性 soak 与推 tag 前的只读同镜像预演腿收敛成仓内可复核契约。`scripts/verify-release.mjs` 的启动描述 / 诊断字段 / A 层 15 项验收契约归 `domains/release-verify`；发布顺序与 finalize 公开顺序归 `domains/release-publish-gate`；打包通道归 `domains/release`；门禁矩阵形状归 `domains/quality-gates`。

## 范围

- **父进程事件才是同步点**：`spawnCapturedChild` 暴露 `waitForExit({ timeoutMs })`，只在父进程 `exit` 事件 settle，`close` 作为兜底（`close` 必晚于 `exit`，两者 `code` / `signal` 相同）；超时返回当前状态（仍可能为 `null`），不无限等待。
- **失败路径等待真实退出码**：`createWorld().launchApp` 在 `reason === 'process-exited'` 组装 diagnostics 之前 `await proc.waitForExit()`，之后才 `stopChild`；诊断字段与 step log 仍由 `stepDiagnostics` / `formatStepDiagnostics` 唯一产出（契约见 `domains/release-verify`）。
- **单一收尾实现**：Linux 组信号 + SIGTERM→SIGKILL 升级 + 管道 / 监听释放只在 `spawnCapturedChild` / `stopChild` 一处实现，成功与失败路径共用；`process.exit` 只经脚本入口 `exitAfterFlush`。`waitForExit` 只做有界等待，不复制 kill 逻辑。
- **预算固定**：`SPIKE_PROCESS_EXIT_BUDGET_MS=5000`、`SPIKE_TARGET_TIMEOUT_MS=60000`、`SPIKE_APP_SHELL_TIMEOUT_MS=60000` 不为治竞态调大；不新增固定 sleep、不加失败重试。
- **稳定性 soak**：`scripts/spike-process-tree-soak.mjs`（`package.json#test:soak`）逐轮跑真实 `process-exited contract` 用例，默认 100 轮、`--rounds=N` 覆盖，`--filter=<pattern>` 只服务反向自测，逐轮与总耗时可见。用例选取与轮次判定一律走机器可读结果：轮次前 `pnpm exec vitest list <testFile> --json` 解析全量用例名，要求过滤串命中恰 1 条且等于契约用例全名；每轮用 `--reporter=json --outputFile=<临时文件>` 读回选中用例状态，不解析带 ANSI 的 `Tests 1 passed` 文本。
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
- **ac-spike-soak**：`node scripts/spike-process-tree-soak.mjs` 默认 100 轮运行失败路径用例，逐轮打印耗时并输出 `100/100 passed` 与总耗时；`pnpm test:soak -- --rounds=50` 输出 `50/50 passed`；任一轮红即非零退出并打印该轮输出。
- **ac-soak-filter-hits-contract**：默认过滤串经 `vitest list src/spike-process-tree-gate.test.ts --json` 解析后恰好命中 1 条，全名为 `spike CLI teardown > reaps the tree and keeps the process-exited contract on the failure path`；解析结果不是该全名即非 0 退出并打印实际值与期望值。
- **ac-soak-zero-match-hard-fail**：`--filter=` 命中 0 条或多于 1 条时脚本非 0 退出，打印命中数与过滤串，并逐行列出该测试文件当前全部可用用例名（至少含上述契约用例全名）；不得静默 pass，不得用 skip 掩盖。
- **ac-soak-machine-readable-verdict**：命中判定只来自 `vitest list --json` 与每轮 `--reporter=json --outputFile=<临时文件>` 报告——选中用例状态必须为 `passed`、`numPassedTests === 1`、无 failed 用例；不依赖带 ANSI 的颜色摘要行，`CI=1 FORCE_COLOR=1` 下 `--rounds=1` 仍退出 0。
- **ac-soak-scope-only**：本类修复只落在 `scripts/spike-process-tree-soak.mjs`；`src/spike-process-tree-gate.test.ts` 与进程树回收实现零 diff，不整文件重写测试，不新增依赖。
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

- WI：`wi_intake_200a464da498c410`（`kind: fix`）——修 workflow_dispatch 预检腿 1：soak 选取改为机器可读判定，消除 ANSI 打断 `Tests 1 passed` 导致的 `ran no matching case` 恒红；日期：2026-11-05；`deliveryIntent: local merge`。
- 改动面：仅 `scripts/spike-process-tree-soak.mjs`。默认过滤串钉为契约用例全名子串；轮次前 `vitest list --json` 要求命中恰 1 条且等于契约全名；每轮 `--reporter=json --outputFile` 校验选中用例 `passed` + `numPassedTests===1` + 无 failed；命中 0 / >1 打印全部可用用例名并非 0 退出；新增 `--filter=` 反向自测口。`src/**`、测试文件、`.github/workflows/**`、进程树回收实现零 diff。
- 证据（绝对路径 `.munk/changes/wi_intake_200a464da498c410/evidence/`）：`pnpm test:soak -- --rounds=50` 退出 0、`50/50 passed (total 21.20s)`（`soak-50-rounds.log`）；`--rounds=1` 与 `CI=1 FORCE_COLOR=1` 均退出 0（`soak-ansi-proof.log`）；`--filter=no-such-case` 退出 1、`matched 0 cases` + 11 条可用用例名（`soak-zero-match.log`）；`--filter='reaps the tree'` 退出 1、`matched 2 cases`（`soak-multi-match.log`）。
- 未闭环项：真实 `ubuntu-latest` preflight run 仍未产出（本 worktree 无 push / dispatch），`ac-spike-run-record` 仍标注为待 Owner 授权。
