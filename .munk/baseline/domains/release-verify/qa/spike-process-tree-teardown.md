# Linux spike 成功启动后收尾：进程组 kill / 管道释放 / 确定性退出

- WI：`wi_intake_b3be192f93d073b2`
- 域：`release-verify`（spike 的收尾契约；被测对象是 `scripts/verify-release.mjs` 的 `stopChild` / `spawnCapturedChild` / `exitAfterFlush` 与 CLI 入口，不是产品行为）
- 来源：`.munk/changes/wi_intake_b3be192f93d073b2/prd.md`（change pack **只有这一份**，无 `tests/cases/**` / `tech.md` / `ux/**`，按 prd AC 逐条落档；`needSelfTest=false`）
- 改动面：`scripts/verify-release.mjs` +279/−50（净 +229）；`scripts/verify-release.d.mts` +44；`src/spike-process-tree-gate.test.ts` 新增 386 行；`.munk/code-gates.json` +5（description + 新门禁）；`src/munk-gates.test.ts` 10 行；`src/spike-launch-gate.test.ts` 5 行；`.munk/baseline/test-debt.json` 16 行；`docs/lessons.md` +9
- 零 diff：`package.json#version`（0.2.18）、`.github/workflows/post-release-verify.yml`、`.github/workflows/release.yml`、`src/verify-release-gate.test.ts`、`src/core/**`、`src/renderer/**`、`src/main/**`、`src/preload/**`、`src/shared/**`

## 改动前复现记录（ac-repro-before-fix）

方法与证据复核（2026-11-03，修复前代码 = `a46a6f4:scripts/verify-release.mjs`）：

1. 复核真证据：RUN `41560874002` / 失败 job `125670904874` / artifact `13195819978` 的时间线与字段与 prd 给定值一致 —— 01:37:15 进入 Boot；01:37:18.687 打印 `spike window-booted`；01:43:28 人工 cancel；artifact 内 `spike.json` 为 `conclusion=window-booted` / `reason=null`，`portProbe` 末条 `+2524ms pageTargets=1 url=out/renderer/index.html`；runner 清理列出孤儿 node(2476)、Xvfb(2494)、electron(2497/2499/2500/2543/2560/2576)；同 run `spike (macos-latest)` success 且正常结束。
2. 在当前代码上复现：把 `a46a6f4` 的脚本原样拷到临时目录，用一个假进程树（父进程再 spawn 一个继承 stdout/stderr 写端的孙进程，并把孙 pid 写文件）替换 Electron；用旧 `createWorld().launchApp` + 注入 `waitForTarget`（返回 `reason='process-exited'`）驱动**真实的旧 `stopChild`**，再检查孙进程存活，最后 `process.exitCode = 0` 后不再做任何事，由外部 7s 计时判定父进程是否自己退出。

实测输出（旧代码，两种子进程形态）：

| 形态 | leader 状态 | stop 后孙进程存活 | 7s 后父进程 |
| --- | --- | --- | --- |
| `normal`（leader 存活，孙进程持管道） | 被 SIGTERM 杀死，`exitCode=null` | **true** | **仍存活**（事件循环被继承的管道写端钉住） |
| `leader-exits`（leader 先退出，孙进程仍持管道，即本次事故形状） | `exitCode=0`，旧 `stopChild` 见 `exitCode!==null` 直接返回 | **true** | **仍存活** |

结论：旧 `stopChild` 只对直接子进程发信号、且 leader 已退出时直接返回；孙进程继承 `stdout`/`stderr` 管道写端后父事件循环不退出 —— 与 RUN#41560874002 的「启动成功后 step 不结束 + 取消后孤儿」现象一致。

同一驱动对修复后脚本（`processGroup: true`，即 Linux 语义）复跑：

| 形态 | stop 后孙进程存活 | 父进程 |
| --- | --- | --- |
| `normal` | **false** | 自己退出（未到外部计时） |
| `leader-exits` | **false**（leader 已退出仍对整组发信号） | 自己退出 |

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-repro-before-fix | 见上节：真证据字段逐条复核通过；旧代码假进程树两种形态均「stop 后孙进程存活 + 父进程 7s 不退出」，修复后同驱动零幸存且自己退出 | 满足 |
| ac-linux-group-kill | `spikeUsesProcessGroup('linux')=true`、`darwin`/`win32` 为 `false`；`spawnCapturedChild({processGroup})` 传 `detached`；`stopChild` 对 `-pid` 发 SIGTERM，`SPIKE_PROCESS_EXIT_BUDGET_MS=5000` 内未收干净则对整组 SIGKILL 并在 `SPIKE_PROCESS_KILL_WAIT_MS=1000` 内 resolve；门禁用真实父子孙链断言 stop 后父与孙 `kill(pid,0)` 均抛（`kills the whole tree and releases both pipes`、`escalates to SIGKILL when the tree ignores SIGTERM`、`reaps a grandchild that outlived the group leader`） | 满足 |
| ac-stdio-released | stop 返回后 `child.stdout.destroyed` / `child.stderr.destroyed` 为 true，`exit`、stdout/stderr `data` 监听数为 0；`releaseChildHandles` 统一移除 data/exit/error 监听并 destroy 两条流 | 满足 |
| ac-success-path-reaped | `conclusion=window-booted` 用例：CLI 退出码 0，`spike.json` 的 `conclusion` / `reason=null` / `url` / `portProbe` 全保留，`spike-launch.log` 存在且含 `window-booted`，leader 与孙进程均 ESRCH | 满足 |
| ac-failure-path-reaped | `process-exited` 用例：退出码 1、`conclusion=failed`、`reason=process-exited`、`exitCode=0`、日志含 `process-exited`，孙进程零幸存；成功与失败共用同一 `stop` 实现（无只在 catch 收尾） | 满足 |
| ac-cli-deterministic-exit | 独立 Node 驱动进程跑成功路径，无外部 kill，`runNode(..., 15_000)` 内自然退出、`signal=null`、`code=0`、`elapsedMs<15_000`，且 `spike.json` 可 parse、`spike-launch.log` 含 `id=` 与 `/json/list` 探针 | 满足 |
| ac-evidence-flushed-before-exit | `exitAfterFlush` 在模块入口（`invokedPath` 之后）使用，库函数零调用（AST 切片断言）；先等 stdout/stderr 排队写入回调，`SPIKE_EXIT_FLUSH_TIMEOUT_MS=1000` 兜底；假进程用例断言未 flush 前不 `exit`、flush 后按原码退出、卡住时超时兜底退出 | 满足 |
| ac-macos-parity | `spikeUsesProcessGroup('darwin')=false`，macOS 启动描述与 spawn 语义不变（无 `detached`）；`buildSpikeLaunchDescriptor` 单测与 `spike-launch-gate` 全绿 | 满足 |
| ac-gate-registered | `.munk/code-gates.json` 新增 `{id:'spike-process-tree-gate', command:'pnpm test src/spike-process-tree-gate.test.ts', cwd:'.'}`（紧跟 `spike-launch-gate`、在模板门禁之前），`version` 仍 1、单 argv；门禁单跑 11 tests / 830ms，不启 Electron / xvfb、不联网、硬超时 15–20s；`pnpm test` 125 files / 1961 passed + 1 skipped | 满足 |
| ac-no-relax | `expected=15` 不变（`src/verify-release-gate.test.ts` 零 diff、`expectedCheckIds` 未动），`judgeReleaseGate` / `validateSummary` 未改；`SPIKE_TARGET_TIMEOUT_MS=60000`、`SPIKE_APP_SHELL_TIMEOUT_MS=60000`、`SPIKE_PROCESS_EXIT_BUDGET_MS=5000` 均未调大（门禁断言之）；workflow 零 diff（仍 dispatch-only / `contents: read` / job 超时未变） | 满足 |
| ac-real-run-closed | **未完成**：本轮未在真实 Actions runner 复跑 `post-release-verify`，`spike (ubuntu-latest)` / `spike (macos-latest)` 双 success、三 verify 腿真跑、aggregate `total>0` 的新 run 链接尚不存在；须合入 main 后由后续项 dispatch 并回填 | 未完成（如实记录） |
| ac-lessons-updated | `docs/lessons.md` 新增第 13 节（第 12 节保留）：run/job/artifact、时间线、孤儿 pid、根因差异指认、进程组与管道释放口径、退出契约、断言位置；门禁以 markers（`41560874002` / `125670904874` / `13195819978` / `detached: true` / `SIGKILL` / `spike-process-tree-gate`）断言存在 | 满足 |

## 交付证据状态（非 code_gates）

| 证据 | 状态 |
| --- | --- |
| ev-failure-evidence | **已有**：RUN#41560874002、job 125670904874、artifact 13195819978，字段与时间线逐条复核（见上节） |
| ev-repro-before-fix | **已有**：旧代码（`a46a6f4`）+ 假进程树，两种形态均复现「stop 后孙进程存活 / 父进程 7s 不退出」，修复后同驱动零幸存并自己退出 |
| ev-fixed-run | **未完成**：修复后未在真实 Actions runner 跑过双 OS spike，也未取得三 verify leg 真跑与 `aggregate total>0` |
| ev-merge | **未完成**：本项按 `local merge` 合入 main，合入后的 `workflow_dispatch` 复跑取证仍待执行 |

## 口径与陷阱注记

- **成功路径才是本事故现场**：`runSpike` 的 finally 走同一 `stopChild`，所以 `conclusion=window-booted` 也必须完整收尾；任何「只在 catch 分支杀进程」的改法都会复发。门禁对成功与失败两条路径各有一条收尾断言。
- **leader 已退出仍要发组信号**：`xvfb-run` 先退出而 `Xvfb` / Electron 孙进程继续持管道，正是本次形状；不得以「直接子进程已退出」为理由跳过 `-pid` kill。
- **组信号必须容忍 `ESRCH` / `EPERM`**：容忍失败但不得 hang；SIGKILL 之后必须有界 resolve（`SPIKE_PROCESS_KILL_WAIT_MS=1000`），否则收尾本身成为新超时源。
- **`process.exit` 只在入口**：库函数（`runVerifyReleaseCli` / `stopChild`）不得调用，否则 vitest 进程会被杀；`exitAfterFlush` 的 drain 超时是兜底不是常态。
- **预算不得延长**：`SPIKE_PROCESS_EXIT_BUDGET_MS` / `SPIKE_TARGET_TIMEOUT_MS` / `SPIKE_APP_SHELL_TIMEOUT_MS` 保持原值；用「等更久」掩盖收尾缺陷是本域明确禁止的修法。
- **实机证据缺口仍在**：本 WI 只证明「收尾在假进程树上确定性成立」，**不证明 GitHub runner 上已恢复**；`ev-fixed-run` / `ev-merge` 未完成前不得声称发布验收恢复。
