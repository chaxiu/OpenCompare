# v0.2.17 复验三条红腿：Linux 启动/收尾与 Windows Authenticode 口径

- WI：`wi_intake_2e3f11bbcc75fdc2`
- 域：`release-verify`（被测对象是 `scripts/verify-release.mjs` 的三条 Linux GUI 腿、startup 诊断与 `windows-authenticode` 判定，以及 `release.yml` 的 `CSC_*` 注入面；不是产品运行时行为）
- 来源：`.munk/changes/wi_intake_2e3f11bbcc75fdc2/prd.md`（change pack **只有这一份**，无 `tests/cases/**` / `tech.md` / `ux/**`，按 prd AC 逐条落档；`needSelfTest=false`）
- 改动面：`scripts/verify-release.mjs` 216 行区间（`buildXvfbAppLaunch` / `stepDiagnostics` / `formatStepDiagnostics` / `STEP_DIAGNOSTIC_TEXT_LIMIT` / `AUTHENTICODE_PASS_STATUSES` / `AUTHENTICODE_UNSIGNED_NOTE` / `launchFailureActual`）；`scripts/verify-release.d.mts` +30；`src/verify-release-gate.test.ts` +177；`src/main/release-artifacts-and-brand.test.ts` +8；`.github/workflows/release.yml` 9 行；`AGENTS.md` +2；`docs/release-signing.md` +6；`docs/lessons.md` +10；`README.md` / `README.zh-CN.md` 各 1 行；`.munk/baseline/test-debt.json`（+139 行、`addedCases: 10`）
- 零 diff：`package.json#version`（0.2.18）、`.munk/code-gates.json`（仍 26 门）、`.github/workflows/post-release-verify.yml`、`expectedCheckIds`（仍 15 项）、任何 `SPIKE_*` 预算值、已公开 `v0.2.17` tag / Release / 资产

## 改动前证据复核（ac-run-evidence-rechecked）

`gh run download 41564533825` 后逐条核对（TAG `v0.2.17`，head `db82de3`）：

| 事实 | 证据 |
| --- | --- |
| `verify (linux)` = job `125682990202` 2/9 | `linux-deb-version` 通过；`linux-directory-compare`（step 05，02:12:33.407 → 02:12:33.914，**0.5 s**）与 `cancel-leg`（step 06，**2.2 s**）都以 `Electron 在暴露 DevTools page 前退出 (port 9925 / 9323)` 失败 |
| 失败 step 无诊断 | 该两条 step JSON / step log 只有 `error` 一行，没有 exit / signal / stderr |
| 进程树残留 | 同 job 结束 runner 打印 `Terminate orphan process: pid (2741) (Xvfb)` 与 6 个 `opencompare`（2745 / 2747 / 2748 / 2791 / 2803 / 2824） |
| artifact | `post-release-verify-v0.2.17-41564533825-linux`（ID `13198548336`） |
| `verify (windows)` = job `125682990401` 1/6 | `windows-authenticode` 实测 `Status=UnknownError`、pwsh exit 0；同 run `spike (ubuntu-latest)` / `spike (macos-latest)` success 且正常结束，`verify (mac)` success，aggregate `pass=12 fail=3 total=15 expected=15` |

根因（由证据指认，非猜测）：

1. **Linux 秒退 = 收尾缺陷**。同 job 的 deb 腿（step 04）在 xvfb 下正常起窗口，说明不是缺 Linux 前置或产物起不来。旧收尾只对直接子进程 `xvfb-run` 发信号，Electron 孙进程与 Xvfb 继续存活并持有 `~/.config/OpenCompare` 单实例锁（`src/main/launch.ts#startLaunch` 拿不到 `requestSingleInstanceLock` 时 `app.quit()`，无 stderr），于是第二、第三个实例在 0.5 s / 2.2 s 主动退出。分类：CI 验证脚本的进程泄漏，非发布产物缺陷。
2. **Windows `UnknownError` = 签名污染**。下载的 `OpenCompare-Setup-0.2.17.exe`（sha256 与 Release 声明一致）PE 证书表非空，PKCS#7 主体是 Apple 的 `Developer ID Application: Tao Zhu (3X4J53U6RY)`——`release.yml` 的 `Build installers` 把 macOS `CSC_LINK` / `CSC_KEY_PASSWORD` 一并注入 win / linux 矩阵，Windows PE 被 Apple 证书签名后校验链不可信，`Get-AuthenticodeSignature` 只能给 `UnknownError`。既不是「未签名」也不是缺依赖，是发布流水线缺陷。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-run-evidence-rechecked | 见上节：run / job / step / artifact / orphan pid / Authenticode 字段逐条复核 | 满足 |
| ac-diagnostics-on-step | `launchFailureActual` 在 `error.diagnostics !== undefined` 时写入 `actual.diagnostics`；`stepDiagnostics` 产出 `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `portProbe` / `textLimit` / `truncated` / `originalChars`；`formatStepDiagnostics` 把同字段写 step log；上限 `STEP_DIAGNOSTIC_TEXT_LIMIT=8000`，超限标注 `truncated` 与真实 `originalChars`，未超限原样保留 Electron stderr；deb / directory-compare / cancel 三腿的 catch 均改走该入口 | 满足 |
| ac-diagnostics-asserted | `src/verify-release-gate.test.ts` 用注入的失败 `launchApp`（抛带 `diagnostics` 的 Error）断言 step JSON 与 log 含全部字段；另有截断用例断言 8000 字符边界与 `truncated` 标记；非启动类失败不产生空诊断块 | 满足 |
| ac-linux-directory-compare-starts | 该腿改走 `buildXvfbAppLaunch({ executable: appImage.appRun, args: [left, right], port })` + `processGroup: spikeUsesProcessGroup('linux')`；AppImage 先 `--appimage-extract`，启动器固定为解包根 `AppRun`；四态计数仍由 CDP `APP_SHELL_EXPRESSION` + 既有计数断言判定，无 skip / warn 路径 | 满足（代码与门禁；runner 实跑待重 dispatch） |
| ac-cancel-leg-starts | 同源启动后观察进度、点击取消、回可操作态，并断言左右树无残留文件 / `.tmp`；失败走 `launchFailureActual` 带全诊断 | 满足（代码与门禁；runner 实跑待重 dispatch） |
| ac-linux-process-group-teardown | 三条 Linux 腿（deb / directory-compare / cancel-leg）均传 `processGroup: spikeUsesProcessGroup('linux')`，复用 spike 的 `spawnCapturedChild` / `stopChild`：整组 SIGTERM → `SPIKE_PROCESS_EXIT_BUDGET_MS` 内未退 → 整组 SIGKILL → `SPIKE_PROCESS_KILL_WAIT_MS` 内 resolve → destroy 两条流并解绑 data/exit/error；未另写第二套回收逻辑 | 满足 |
| ac-no-new-orphans | 收尾复用既有预算常量，无新增更长超时；进程组路径保证孙进程与 Xvfb 一并回收（`spike-process-tree-gate` 的假进程树断言父/孙 ESRCH、管道 destroyed） | 满足 |
| ac-authenticode-status-branch | `AUTHENTICODE_PASS_STATUSES=['NotSigned','Valid']`，`actual.status` 始终记录原始 `Status`；`NotSigned` 证据含 `AUTHENTICODE_UNSIGNED_NOTE='Windows 未签名发布姿态'`；`UnknownError` / `HashMismatch` / 空值 / 其他值与非零 pwsh 退出走 `fail(...)` | 满足 |
| ac-authenticode-gate | 门禁用例 `passes NotSigned with the unsigned posture note and accepts Valid for a future certificate` + `fails closed on an empty or unknown status and on a non-zero pwsh exit`（含 `UnknownError` / `HashMismatch`）；`src/main/release-artifacts-and-brand.test.ts` 新增用例断言 `Build installers` 的 `CSC_LINK` / `CSC_KEY_PASSWORD` 含 `matrix.target == 'mac'` | 满足 |
| ac-expected-15 | `expectedCheckIds` 零 diff（仍 15 项）、`counts.expected=15`、leg 数量与 `judgeReleaseGate` / `validateSummary` 未改；`verify-release-gate` 单跑 56 tests 全绿 | 满足 |
| ac-docs-synced | `AGENTS.md` 硬约束 +2 行（Linux GUI 腿同源启动/收尾与 step 证据；未签名 Windows 只断言 `NotSigned`）；`docs/lessons.md` §14 记录 run / 根因 / 收尾与 Authenticode 口径 / 断言位置 / 重跑条件；`docs/release-signing.md` §七 与 `scripts/verify-release.d.mts` 的 `StepDiagnostics` / `buildXvfbAppLaunch` / `AUTHENTICODE_*` 与代码一致，门禁以文档契约用例断言 | 满足 |
| ac-code-gates | `code_gates` **26 gates** attempt 001 全 exit 0（`.munk/runs/run_intake_2e3f11bbcc75fdc2/code-gates/attempts/001`，`latest.json` `ok: true`、`failedGateIds: []`）；`test` 125 files / 1972 passed + 1 skipped；`verify-release-gate` 56 tests / 17.96s | 满足 |
| ac-no-history-rewrite | `v0.2.17` tag / Release / 资产零改动；本 worktree 未 push tag、未 dispatch；交付记录已写明「合入 main 后由维护者重 dispatch，双 OS spike success 正常结束 + 三平台 verify 全 pass + aggregate total=15」为外部验证条件 | 满足 |

## 交付证据状态（非 code_gates）

| 证据 | 状态 |
| --- | --- |
| ev-failure-evidence | **已有**：RUN#41564533825 / job `125682990202` / artifact `13198548336` / orphan pid / Windows `UnknownError` 字段 |
| ev-fixed-run | **未完成**：修复后未在真实 Actions runner 重跑 `post-release-verify v0.2.17` |
| ev-merge | **未完成**：本项按 `local merge` 合入 main，合入后的 dispatch 取证待执行 |
| ev-windows-rebuilt | **未完成**：当前 `v0.2.17` Setup 仍是 Apple 证书签名的旧资产，`UnknownError` 会继续 fail；需下次重新打包（`CSC_*` 不再注入 win）后才可能出现 `NotSigned` |

## 口径与陷阱注记

- **Windows 断言不许回到 `Valid` 单值**：本产品不签名，断言 `Valid` 不可达；也不许改成「任何状态都 pass」。判定表是 `NotSigned`/`Valid` pass、其余 fail，`NotSigned` 必须附未签名姿势说明。
- **Linux 腿不许跳过 `AppRun`**：直接执行解包后的二进制会丢 `APPDIR` / `LD_LIBRARY_PATH` / `GSETTINGS_SCHEMA_DIR`；缺 `AppRun` 应 fail，而不是退回裸二进制、加 `--no-sandbox` 之外的参数或 skip。
- **单实例锁会伪装成「产物起不来」**：若后续再看到 Linux 腿秒退且 stderr 为空，先查是否有上一轮残留的 `opencompare` / `Xvfb` 与单实例锁，再看 step JSON 的 `diagnostics`；不要直接加启动参数或延长超时。
- **`CSC_*` 泄漏是跨域缺陷**：`release.yml` 属 `domains/release`，本轮只收窄注入面；发布通道其余语义（打包 / 上传 / finalize / 双语 / 门禁）未改。
