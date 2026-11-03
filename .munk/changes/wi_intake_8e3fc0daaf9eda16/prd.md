# 修复 post-release-verify Linux spike 的 Electron/CDP 启动，并硬化失败诊断

## 背景与现状（只读事实）

- 仓库 `chaxiu/OpenCompare`，main `a2ccdc9`。`.github/workflows/post-release-verify.yml` 的 `spike` job 在 `ubuntu-latest` 执行
  `xvfb-run -a node scripts/verify-release.mjs --tag=v0.2.17 --layer=ci --spike --out=verify-out`。
- 唯一一次真跑 RUN#41557584455（https://github.com/chaxiu/OpenCompare/actions/runs/41557584455 ，`workflow_dispatch`，TAG=v0.2.17）在该步失败：
  `spike failed: 窗口未暴露 DevTools page target (port 9702)`，01:07:30 → 01:09:30 恰好 120s 后 exit 1。
  macOS spike 与三个 verify leg 因 `needs` 全部 skipped；`aggregate` 得到 `pass=0 fail=0 skip=0 total=0 expected=15` 后 fail-closed 失败。
- 结论：**Linux spike 从未通过一次**，v0.2.17 的 15 项发布验收实际未执行（不是通过）。
- 现网代码事实（本 PRD 编写时已核对）：
  - `scripts/verify-release.mjs` 的 `runSpike` 用 `world.launchApp({ command: electronBinary, args: ['.', '--remote-debugging-port=<port>'], env: { HOME: spike-home }, timeoutMs: 120_000 })`，
    与 macOS 完全同一条路径，**Linux 分支没有 `--no-sandbox` / `--disable-dev-shm-usage`，也没有自己的 xvfb 归属**。
  - 同一文件的 Linux verify leg（`linux-deb-version` / `linux-directory-compare` / `cancel-leg`）却是 `xvfb-run -a <binary> --no-sandbox ... ` 直接起进程——
    **spike 与 verify leg 的 Linux 启动方式本身就不一致**。
  - `CdpClient.connect` 在 `while (Date.now() < deadline)` 里只轮询 `/json/list`，**不检查子进程是否已退出**、不记录 stdout/stderr/退出码/端口状态；
    子进程秒退时也只是静默空转到 120s，最后抛出一句「窗口未暴露 DevTools page target」，无法区分「进程没起来」与「target 没暴露」。
  - `spike` job 的 Linux 步骤不安装 xvfb（`verify` job 装），且上传 artifact 已是 `if: always()`。

## 范围

1. **先证据、后修复**：拿到真实 Linux 环境下 Electron 进程的 stdout/stderr、退出码、端口与 target 探针、xvfb 日志，据此判定根因
   （候选：缺少 `--no-sandbox` / user namespace / GPU / dev-shm / xvfb 归属 / 打包产物与源码构建不一致 / 等待逻辑本身），再做修改。
2. **修复**：让 Linux leg 在 `ubuntu-latest` 上稳定把**同一份被测程序**（仓库根 `.`，`pnpm build` 产物）拉起并暴露 DevTools page；
   平台差异收敛到一个可单测的启动描述，macOS leg 语义保持不变。
3. **诊断硬化**：CDP 等待改为有界重试 + 子进程存活检查；失败时把 Electron stdout/stderr、退出码/signal、xvfb 输出、端口与 target 探测结果落盘并随 `verify-out` 上传；
   失败要快（进程退出即失败），一眼能分出是「进程没起来」还是「target 没暴露」。
4. **可回归断言**：把上述启动参数与等待/超时/诊断行为写成确定性（不打真窗口、无网络）的测试，并注册为 `.munk/code-gates.json` 的独立门禁。

## 验收

### 行为契约（确定性，可由 code_gates 断言）

- ac-spike-linux-launch-descriptor: 给定平台与端口，启动描述逐字段可断言——Linux 描述为 `command="xvfb-run"`、`args` 以 `-a` 开头且同时含 `--no-sandbox`、`--disable-dev-shm-usage`、`--remote-debugging-port=<port>`，被测入口仍是仓库根 `.`；macOS/darwin 描述为 Electron 二进制 + `.` + `--remote-debugging-port=<port>`，**不含** `--no-sandbox` / `xvfb-run`，且两者共用同一构造函数（同一份被测程序）。
- ac-spike-workflow-parity: workflow 中 spike 的 Linux 与 macOS 步骤执行同一命令形状（同一个 `scripts/verify-release.mjs`、同一组 `--tag/--layer=ci/--spike/--out=verify-out`），Linux 步骤不再由外层 `xvfb-run` 包裹（xvfb 归属唯一：由启动描述决定），且 Linux spike 步骤前显式安装 xvfb、不依赖 runner 预装。
- ac-spike-fail-fast-on-exit: 子进程在 page target 出现前退出时，spike 在子进程退出后 ≤5s 内以退出码 1 结束（不再空转到 120s），`spike.json` 的 `reason="process-exited"`，`exitCode` 为真实退出码（非 0 / 非默认值），`stdout`、`stderr` 为捕获原文（可为空串但字段必须存在）。
- ac-spike-bounded-target-wait: 子进程存活但始终无 page target 时，在固定预算（默认 ≤60s，导出为常量）内失败，`reason="no-page-target"`，`portProbe` 至少 1 条记录（含 `/json/list` 返回或错误），探针间隔为固定常量（>0 且 ≤1s），并记录会话总时长。
- ac-spike-reason-app-shell: target 已出现但 app shell 表达式在预算内未就绪时，`reason="app-shell-timeout"`，与 `no-page-target`、`process-exited` 三者互不混同（`reason` 取值集合固定且封闭）。
- ac-spike-diagnostics-artifact: 失败时 `--out` 下必须同时落 `spike.json`（含 `conclusion`、`reason`、`exitCode`、`signal`、`stdout`、`stderr`、`portProbe`、`startedAt`、`finishedAt`）与 `spike-launch.log`（含 Electron stdout+stderr、xvfb 输出、端口/目标探针），成功时 `spike.json` 仍含 `conclusion="window-booted"` 与 `url`；两条路径都写盘点原子落盘，不因异常丢文件。
- ac-no-check-set-change: CI 检查集合仍为固定 15 项（`expectedCheckIds` 不变），`aggregate` 对缺失步骤仍 fail-closed（`total=0 expected=15` 必为 fail 且逐条报缺失）；不得放宽 `judgeReleaseGate` / `validateSummary` / 任何既有阈值，不得删检查项或改 expected。
- ac-gate-registration: 新增门禁（建议 id `spike-launch-gate`，测试文件 `src/spike-launch-gate.test.ts`）已写入 `.munk/code-gates.json`（`version` 仍为 1、命令为单 argv、不含 `&&`/`||`/`|`/`;`），`pnpm test src/spike-launch-gate.test.ts` 全绿且不启动真实窗口、不联网。
- ac-manifest-pins-updated: `src/munk-gates.test.ts` 的 manifest pin（门禁总数、精确 id 序列、尾部 `verify-release-gate`/`test-debt-gate`、9 个模板门禁连续位置）随新门禁同步更新并保持绿——新门禁不得插在模板门禁与 `verify-release-gate` 之间。
- ac-full-gates-green: `pnpm install`、`lint`、`typecheck`、`build`、`build:web`、`test` 与 `.munk/code-gates.json` 全部门禁自绿；`.munk/baseline/test-debt.json` 按 ratchet 规则更新（新增测试用 `growth` 条目，行数增幅 ≤400，floors 只升不降）。
- ac-readonly-workflow: `post-release-verify.yml` 仍只由 `workflow_dispatch` 触发、`permissions: contents: read`、无 `secrets.`、无 `continue-on-error`、不产生 tag / release / asset 写操作，`spike` 仍作为 `verify` 的前置门禁（不允许为了绿灯让 verify 跑在未验证的 runner 上）。
- ac-no-release-mutation: 不改 `package.json#version`（保持 0.2.18）、不新建 tag、不改 v0.2.17 已公开 Release 与资产、不重写历史 run；`release.yml` 的发版语义不变（若失败定位确需极小改动，须在交付说明中逐条列明理由与影响面）。
- ac-lessons-record: `docs/lessons.md` 新增一节，记录根因证据（真实 Linux run 的 artifact 路径 / Electron stderr / 退出码 / 探针结果）、修复口径（平台启动描述单一来源 + 诊断字段契约）与断言位置；由门禁以 markers 断言该节存在，避免只改代码不留口径。

### 交付证据（非 code_gates，但缺一不可交付）

- ev-failure-evidence: 修复前必须拿到真实 Linux 失败证据并附路径——优先分支 `workflow_dispatch`（`gh workflow run post-release-verify.yml -f tag="v0.2.17" --ref <branch>`）的 `verify-out` artifact；证据需能指认根因，不得以「大概是没有 --no-sandbox」代替。
- ev-fixed-run: 修复后至少一次真实 Linux CI 执行，给出 run 链接（绝对路径 + URL）：`spike (ubuntu-latest)` 与 `spike (macos-latest)` 均 success，三个 verify leg（mac / linux / windows）真的执行，`aggregate` 输出真实 pass/fail 计数（`expected=15` 且 `total>0`，不再是 `total=0`）。
- ev-honest-failures: verify leg 若出现真实检查项失败，原样作为独立结论报告（跑挂就是跑挂）；不得放宽阈值、删检查项、改 `expected=15` 或在 aggregate 吞失败。
- ev-merge: 聚合通过后合入 main，并在 main 上再对 `v0.2.17` 真实 `workflow_dispatch` 一次，附上最终 run 链接；在此之前不得声称本项完成。

## 非目标

- 不改产品 UI、业务功能与 `src/core`、`src/renderer` 的任何逻辑。
- 不顺手改 `release.yml` 的发版语义（版本收敛、资产上传、发布顺序）。
- 不引入新的 npm 依赖，不升级 Electron / electron-builder / pnpm / Node 版本。
- 不扩大 CI 检查项集合，不改 15 项 expected，不放宽任何现有阈值或 fail-closed 判定。
- 不新发 tag、不改 `package.json#version`、不修改已公开的 v0.2.17 Release 正文与资产、不重跑/重写历史 run。
- 不做与本次根因无关的重构（例如重写整个 `verify-release.mjs`、拆分模块、换 CDP 客户端实现）。

## 实现约束

- 复用 `scripts/verify-release.mjs` 作为本地与 CI 的唯一实现，不新建第二个启动脚本；平台差异只允许存在于一个导出函数（启动描述构造器）里，macOS 语义保持与今天一致。
- 现有契约不得改动：`--spike` 不接受取值、只允许 `--layer=ci`、与 `--aggregate` 互斥；`spike` 输出 `spike.json` 的 `id` 仍为 `spike-window-boot`。
- 新门禁在 `.munk/code-gates.json` 的插入位置：`diff-normalize-real` 之后、9 个模板门禁之前；尾部保持 `verify-release-gate`、`test-debt-gate`（`src/munk-gates.test.ts` 的 `slice(-2)` / `slice(-(9+2), -2)` 断言依赖该顺序）。
- `.munk/baseline/test-debt.json` 新增测试文件后必须补 `growth` 条目（`from` 必须等于上一版 committed ceiling，`to` 等于新 ceiling，增幅 ≤400 行）并抬高 `repoTestCases` floor，否则 `test-debt-gate` 会红。
- 等待/探针/诊断的行为必须可注入（时钟、探针、子进程、world），门禁用假对象驱动，**不得**在门禁里启动真实 Electron、xvfb 或访问网络。
- 诊断优先于结论：任何根因判断都必须先有落盘证据；若证据指向打包产物 / 构建不一致 / 等待逻辑本身而非启动参数，按证据修复，不要硬套 `--no-sandbox`。
- 失败预算与重试参数以导出常量表达（供门禁断言），不提供「放宽阈值」的运行开关。
