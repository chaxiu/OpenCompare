# Linux spike 启动描述与失败诊断硬化（xvfb 归属 / 有界等待 / 双诊断文件）

- WI：`wi_intake_8e3fc0daaf9eda16`
- 域：`release-verify`（spike 的启动描述、等待与诊断契约；被测对象是 `scripts/verify-release.mjs` 的导出函数与 `post-release-verify.yml` 的命令形状，不是产品行为）
- 来源：`.munk/changes/wi_intake_8e3fc0daaf9eda16/prd.md`（change pack **只有这一份**，无 `tests/cases/**` / `tech.md` / `ux/**`，按 prd AC 逐条落档；`needSelfTest=false`）
- 改动面：`scripts/verify-release.mjs` +332/−50；`scripts/verify-release.d.mts` +83；`.github/workflows/post-release-verify.yml` 10 行；`src/spike-launch-gate.test.ts` 新增 388 行；`.munk/code-gates.json` +5；`src/munk-gates.test.ts` 10 行；`.munk/baseline/test-debt.json` 12 行；`docs/lessons.md` +8
- 零 diff：`package.json#version`（0.2.18）、`.github/workflows/release.yml`、`src/verify-release-gate.test.ts`、`src/core/**`、`src/renderer/**`、`src/main/**`、`src/preload/**`、`src/shared/**`

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-spike-linux-launch-descriptor | `buildSpikeLaunchDescriptor` 单测逐字段断言：linux = `command='xvfb-run'`、`args=['-a', electron, '.', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=<port>']`；darwin = `<electron> ['.', '--remote-debugging-port=<port>']` 且不含 linux 三特征；两者同一构造函数、同一 `root='.'`；缺二进制 / 端口 0 / 端口 65536 抛错 | 满足 |
| ac-spike-workflow-parity | workflow 两 OS 合并为单一步骤 `node scripts/verify-release.mjs --tag="$TAG" --layer=ci --spike --out=verify-out`，无外层 `xvfb-run`；Linux 前置 `sudo apt-get update && sudo apt-get install -y xvfb`；门禁解析 YAML 断言两 OS 步骤命令逐字相等、无 `xvfb-run` 前缀、xvfb 安装步骤在 spike 之前 | 满足 |
| ac-spike-fail-fast-on-exit | `waitForSpikePageTarget` 假时钟：子进程退出后下一 tick 返回 `reason='process-exited'`，注入时钟读数 < `SPIKE_PROCESS_EXIT_BUDGET_MS`(5000)；`runSpike` 写 `spike.json` 的 `exitCode` 为真实值、`stdout`/`stderr` 字段存在 | 满足 |
| ac-spike-bounded-target-wait | 存活但无 target 时在 `SPIKE_TARGET_TIMEOUT_MS`(60_000) 内以 `reason='no-page-target'` 结束；`portProbe` 每次轮询一条（ok / error 两分支各有断言）；`SPIKE_TARGET_POLL_INTERVAL_MS=500`（>0 且 ≤1s），记录 `startedAt` / `finishedAt` | 满足 |
| ac-spike-reason-app-shell | target 出现但 shell 未就绪 → `reason='app-shell-timeout'`；`SPIKE_FAILURE_REASONS` 恰为 `['process-exited','no-page-target','app-shell-timeout']`，门禁断言三者互不混同且集合封闭 | 满足 |
| ac-spike-diagnostics-artifact | 失败用例断言 `--out` 下 `spike.json` + `spike-launch.log` 同时存在，JSON 含 `conclusion`/`reason`/`exitCode`/`signal`/`stdout`/`stderr`/`portProbe`/`startedAt`/`finishedAt`；成功用例断言 `conclusion='window-booted'` + `url` 且同样写两份文件；写入走 `writeJsonAtomic` / `writeTextAtomic` | 满足 |
| ac-no-check-set-change | `src/verify-release-gate.test.ts` 零 diff；`expectedCheckIds` 仍 15 项（identity 2 / mac 4 / linux 3 / windows 2 / cancel-log 2 / evidence 2）；`judgeReleaseGate` / `validateSummary` 阈值零改动 | 满足 |
| ac-gate-registration | `.munk/code-gates.json` 新增 `{id:'spike-launch-gate', command:'pnpm test src/spike-launch-gate.test.ts', cwd:'.'}`，`version` 仍 1、单 argv、无 `&&`/`\|\|`/`\|`/`;`；门禁单跑 17 tests / 12ms，全部注入假对象，无真实窗口 / xvfb / 网络 | 满足 |
| ac-manifest-pins-updated | `src/munk-gates.test.ts` 总数 24 → 25、`EXPECTED_GATES` 插入 `spike-launch-gate`（`diff-normalize-real` 之后、`template-default-unchecked` 之前），尾部 `verify-release-gate`/`test-debt-gate` 与 9 个模板门禁连续位置不变；`munk-gates` 门绿 | 满足 |
| ac-full-gates-green | Host `code_gates` **25 gates** attempt 001 全 exit 0（`.munk/runs/run_intake_8e3fc0daaf9eda16/code-gates/attempts/001`）；`test` 门 124 files / **1950 passed + 1 skipped**、31.01s；`test-debt.json` `growth` 44,462 → 44,854（+392 ≤400）、`repoTestCases` floor 1419 → 1461、其它 floors 未降 | 满足 |
| ac-readonly-workflow | `post-release-verify.yml` 仍仅 `workflow_dispatch`、`permissions: contents: read`、无 `secrets.`、无 `continue-on-error`、无 tag / release / asset 写命令；`spike` 仍是矩阵的 `needs` 前置；门禁逐条断言 | 满足 |
| ac-no-release-mutation | `package.json` 与 `release.yml` 零 diff（版本 0.2.18 未变），无新 tag、未改 v0.2.17 Release / 资产、未重写历史 run | 满足 |
| ac-lessons-record | `docs/lessons.md` 新增第 12 节：RUN#41557584455 证据路径 / Electron 无输出 / 120s 超时 / aggregate `total=0`、根因差异指认、修复口径（单一启动描述）、诊断常量与封闭 reason 集合、断言位置；门禁以 markers 断言该节存在 | 满足 |

## 交付证据状态（非 code_gates）

| 证据 | 状态 |
| --- | --- |
| ev-failure-evidence | **已有**：RUN#41557584455（`workflow_dispatch`，head `a2ccdc9`，TAG `v0.2.17`），artifact `spike-v0.2.17-41557584455-ubuntu-latest`（418 B，仅旧 `spike.json`，无 stdout/stderr），job 125660128129；01:07:30 → 01:09:30 整 120s exit 1，错误 `窗口未暴露 DevTools page target (port 9702)`。路径记入 `docs/lessons.md` 第 12 节 |
| ev-fixed-run | **未完成**：修复后未在真实 Actions runner 跑过 `spike (ubuntu-latest)` / `spike (macos-latest)`，也未取得三 verify leg 真跑与 `aggregate total>0` 的 run |
| ev-honest-failures | 无新实机 run，故无新失败项可报；不得以本次本地门禁绿替代 |
| ev-merge | **未完成**：本项按 `local merge` 合入 main，但合入后的 `workflow_dispatch` 复跑取证仍待执行 |

## 口径与陷阱注记

- **xvfb 归属唯一**：Linux 起窗必须由 `buildSpikeLaunchDescriptor` 返回 `xvfb-run -a ...`，workflow 不得再包一层 `xvfb-run`；两层嵌套会让 `spike` 的 PID / 输出捕获落到包装器而非 Electron，也是本次诊断失明的放大器。
- **失败必须快**：旧逻辑只轮询 `/json/list`，子进程秒退时静默空转到 120s；新逻辑先查存活再探针，退出后下一 tick 即失败。任何「延长超时」的修法都是倒退。
- **诊断先于结论**：`spike-launch.log` 必须能独立区分「进程没起来」与「target 没暴露」；`reason` 只能取自 `SPIKE_FAILURE_REASONS`，不得新增自由字符串。
- **门禁不得启真窗口**：时钟 / 探针 / sleep / 子进程存活 / world 全部注入；新增断言优先扩已有 describe，不要在门禁里 spawn Electron 或 xvfb。
- **实机证据缺口**：本 WI 只证明「启动描述、等待、诊断、workflow 形状」可确定性断言，**不证明 Linux spike 已在 GitHub runner 上通过**；后续项必须补 `ev-fixed-run` / `ev-merge` 才能声称发布验收恢复。
