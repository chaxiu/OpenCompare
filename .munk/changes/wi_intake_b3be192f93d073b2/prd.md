# Linux spike 启动成功后 CLI 不退出与孤儿进程收尾

## 范围

只修 `scripts/verify-release.mjs` 的 spike 子进程收尾链路：`launchApp` / `stopChild` / `runSpike` 的 finally 与 CLI 入口。

- Linux 启动改为独立进程组（`detached: true`），`stop` 按负 pid 杀整组；SIGTERM 后仍有存活则 SIGKILL，清理整棵子树而不是只杀直接子进程 `xvfb-run`。
- `stop` 必须销毁子进程 `stdout` / `stderr` 流并解绑数据/退出监听，确保孙进程即使继承管道写端也不会把父 CLI 的事件循环钉住。
- 证据落盘（`spike.json` + `spike-launch.log`）后 CLI 确定性退出；允许显式 `process.exit` 或等价的 drain-aware 强制退出兜底。
- 成功路径（`conclusion=window-booted`）与失败/超时路径共用同一收尾语义——本次事故正是成功路径卡住。
- 新增确定性门：用会派生出「持有管道写端的孙进程」的假子进程（不启动 Electron / 不启真窗口）断言 stop 后无幸存后代、父进程可自然退出；并把成功路径收尾钉死。
- 更新 `docs/lessons.md` 与 `.munk/code-gates.json` 的 gate 登记；保留既有 spike 诊断契约与 `expected=15` 检查表。

先复现再改（硬性顺序）：改动前先复核下方真实证据，并在当前代码上跑一遍假进程树复现，记录「stop 后孙进程仍存活 / CLI 不退出」的原始现象；复现记录随交付提交。不得靠延长超时、cron 重试或放宽门禁掩盖。

### 可复核证据路径（2026-11-03，v0.2.17，main a46a6f4）

- CI run：https://github.com/chaxiu/OpenCompare/actions/runs/41560874002
- 失败 job：`spike (ubuntu-latest)` = `125670904874`
- 时间线：01:37:15 进入 Boot 步骤；01:37:18.687 打印 `spike window-booted`（启动成功）；该 step 此后不结束，01:43:28 人工 cancel 终止。
- 取消后 runner 清理显示存活孤儿：node(2476)、Xvfb(2494)、electron(2497/2499/2500/2543/2560/2576)。
- artifact `13195819978`，名称 `spike-v0.2.17-41560874002-ubuntu-latest`：
  - `spike.json`：`conclusion=window-booted`、`reason=null`；`portProbe` 最后一条 `+2524ms pageTargets=1 url=out/renderer/index.html`。
  - `spike-launch.log` 完整存在。
- 同 run 的 `spike (macos-latest)` 成功且 job 正常结束——证明启动修复本身已生效，故障在收尾。
- 前序背景：`docs/lessons.md` §12 记录的 RUN#41557584455 / job 125660128129 是「启动失败」阶段；本次是同一路径的「启动成功后不退出」后续缺陷。

### 根因（改动前必须复核，不得直接照抄）

`stopChild(child)` 只对直接子进程 `xvfb-run` 发 SIGTERM/SIGKILL；Linux 下 `xvfb-run` 派生的 `Xvfb` 与 Electron 孙进程存活并继承 `child.stdout/stderr` 的管道写端，Node 因管道句柄不释放而事件循环不退出。`runSpike` 的 finally → `launch.stop()` → `stopChild` 覆盖成功路径，所以成功也中招；CLI 末尾只设 `process.exitCode`，没有强制退出兜底。

## 验收

- ac-repro-before-fix: 改动前在真实证据（run 41560874002 / job 125670904874 / artifact 13195819978）上复核上述时间线、`spike.json` 字段与孤儿 pid 清单，并在当前代码上复现「假进程树 stop 后孙进程存活、父进程不退出」；复现记录写入交付说明。证据细节与给定值一致（启动成功时间、cancel 时间、artifact 字段、孤儿进程组）。
- ac-linux-group-kill: Linux 下以 `detached: true` 建立独立进程组；stop 对 `-pid` 发 SIGTERM，宽限期内仍有存活则对整组发 SIGKILL。用假进程树（父进程再派生持有 stdout/stderr 写端的孙进程）验证：stop 返回后父、子、孙全部 `kill(pid, 0)` 抛 ESRCH，零幸存者。
- ac-stdio-released: stop 返回后子进程的 `stdout` / `stderr` 流均为 destroyed，且父侧不再持有该子进程的 data/exit 监听；不得留下未 unref 的管道句柄。
- ac-success-path-reaped: 走到 `conclusion=window-booted` 的成功路径同样执行完整收尾；runSpike 返回后无后代存活，`spike.json` 仍写 `conclusion=window-booted`、`reason=null`、url 与端口探针不丢。
- ac-failure-path-reaped: 失败 / 超时路径（`process-exited` / `no-page-target` / `app-shell-timeout`）保持既有诊断契约，同时整棵子树被收尾，无孤儿。
- ac-cli-deterministic-exit: 在独立 Node 驱动进程中跑带假进程树的 spike 成功路径，不施加外部 kill；驱动在固定预算内（≤ 15 s，且不得依赖延长 `SPIKE_*` 超时）以退出码 0 结束，且 `spike.json` 与 `spike-launch.log` 已完整落盘。
- ac-evidence-flushed-before-exit: 强制退出兜底不得截断证据：退出后 `spike.json` 可被 JSON.parse、`spike-launch.log` 含启动行与至少一条 `/json/list` 探针；必要时先完成同步原子写再退出。
- ac-macos-parity: macOS 的 `buildSpikeLaunchDescriptor` 命令/参数与输出语义不变（仍为 Electron + `.` + 调试端口，不出现 `xvfb-run` / `--no-sandbox` / `--disable-dev-shm-usage`），spawn 不附加 Linux 进程组语义；既有 macOS 输出记录字段不变。
- ac-gate-registered: 新确定性门进入 `pnpm test` 与 `.munk/code-gates.json`（不启 Electron/xvfb、不依赖网络、有固定超时）；`pnpm test` 全绿，`spike-launch-gate` / `verify-release-gate` 既有断言不回归。
- ac-no-relax: `expected=15` 不变；`judgeReleaseGate` / `validateSummary` 不放宽；`SPIKE_TARGET_TIMEOUT_MS=60000`、`SPIKE_APP_SHELL_TIMEOUT_MS=60000`、`SPIKE_PROCESS_EXIT_BUDGET_MS=5000` 不因本次调大；workflow 仍为 dispatch-only / `contents: read`，不上调 job 超时。
- ac-real-run-closed: 合入 main 后对 v0.2.17 再 dispatch `post-release-verify`：`spike (ubuntu-latest)` 与 `spike (macos-latest)` 两个 job 均 success 且正常结束（不是 cancel）；ui/mac/linux/windows 三个 verify 腿真实执行；aggregate `total>0` 且含真实 pass/fail（不是全 skip）；新 run 链接写入交付说明。若 verify 腿暴露新失败，如实记录并保留，不吞、不改口径。
- ac-lessons-updated: `docs/lessons.md` 新增本次 run/artifact/根因/收尾契约记录，并可被 gate 中的 markers 断言复核；不删除 §12 历史记录。

## 非目标

- 不改发布物、不发新 tag、不动已公开 Release（v0.2.17）。
- 不改 `expected=15`、检查项注册表、judge/validate 的 fail-closed 判定。
- 不改 workflow 触发器、权限、artifact 形状或 job 超时；不靠 cron 重试或延长超时「治好」挂起。
- 不改 Electron 主进程、renderer、CDP 启动逻辑与 `buildSpikeLaunchDescriptor` 的 Linux 标志位（`--no-sandbox` / `--disable-dev-shm-usage` / 端口参数保持不变）。
- 不重构整个 `createWorld` / 验证检查体系；只加收尾所需的可注入缝与门。
- 不新增运行时依赖。

## 实现约束

- 用户已指定方案：Linux 用 `detached: true` + `process.kill(-pid, signal)` 杀组（或在 stop 时遍历清理整棵子树）；SIGTERM 后仍有存活必须 SIGKILL；同时 destroy `stdout`/`stderr` 并解绑监听；证据落盘后显式退出（`process.exit` 或等价手段）。macOS 语义与输出不变。
- 收尾等待使用现有 `SPIKE_PROCESS_EXIT_BUDGET_MS`（5 s）量级的有界 grace，不得延长该预算；SIGKILL 后必须 resolve，不能无限等待。
- 进程组 kill 需容忍 `ESRCH`（进程已退出）与 `EPERM`，不得因一次 kill 失败挂起；Windows 未参与 spike 矩阵，相关分支保持安全（不可用负 pid 时退回直接子进程 kill / 子树清理）并在测试中跳过而非伪造通过。
- 可注入缝优先 export 纯函数（如 launch/stop helper），门测试用 `process.execPath` + 临时假脚本构造真实父子孙链；不得把 Electron、xvfb 或真窗口带进门。测试必须有硬超时，禁止 sleep 轮询超过 15 s。
- 成功路径与失败路径共用同一 stop 实现，禁止只在 catch 分支收尾。
- CLI 强制退出要做 stdout drain 保护（或先完成同步落盘再退出），避免截断 summary/证据；不得把 `process.exit` 放进库函数导致 vitest 进程被杀。
- 现有 `spike.json` / `spike-launch.log` 的字段与写入时机（原子写、成功后也写）保持；`SPIKE_FAILURE_REASONS` 仍为封闭三值。
- 只改 `scripts/verify-release.mjs`、对应测试、`.munk/code-gates.json`、`docs/lessons.md` 与必要类型声明（`scripts/verify-release.d.mts`）；不扩大 blast radius。
- 真实闭环链接（run URL、两个 spike job、三个 verify 腿、aggregate 计数）必须写入交付说明；本轮不替用户执行 tag / Release 变更。
