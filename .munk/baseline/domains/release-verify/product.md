# Domain: release-verify

发布后验收驱动域：把「已公开 Release 到底能不能装、能不能跑、取消后有没有噪声」收敛为仓内**唯一一份**可复核实现 `scripts/verify-release.mjs`，并配一份只读的 `.github/workflows/post-release-verify.yml`。本域只管**验收驱动本身**（CLI 契约、检查注册表、fail-closed 汇总、A/B 分层、启动/收尾与证据形状）；打包、签名、公证、发版通道归 `domains/release`；默认门禁矩阵形状归 `domains/quality-gates`；真实 6.4 GiB 目录对的三轮内存长跑由 product-qa 任务在本机执行，不在 CI。

## 范围

- **唯一实现与零依赖**：`scripts/verify-release.mjs` 为 Node ESM + 标准库，零新增 npm 依赖；纯函数（检查注册表 / 期望集合比对 / schema 校验 / 内存判定 / 日志扫描 / 版本规范化 / 终局判定）单独 `export`，`main()` 仅在直接执行时运行；`scripts/verify-release.d.mts` 提供类型声明。
- **CLI 契约**：`--tag=vX.Y.Z`（必填）、`--layer=local|ci`、`--out=<dir>`；另有内部 `--platform=mac|linux|windows|all`、`--aggregate=<parts>`、`--spike`。参数缺失 / layer 非法 / out 不可写一律非零退出且**不写半成品 `summary.json`**（临时文件 + rename 原子落盘）；退出码 `0/1/2` 语义不变。
- **A 层（`--layer=ci`，只读公开件）六组固定 15 项**：identity(2) / mac(4) / linux(3) / windows(2) / cancel-log(2) / evidence(2)。mac 走 `hdiutil -readonly` → `CFBundleShortVersionString` → `codesign` / `spctl` / `stapler`；linux 走 xvfb 起 deb 与 AppImage → 版本 → 合成树四态；windows 走 zip 解压验版本 + `Get-AuthenticodeSignature`；cancel-log 观察进度后取消并扫 `OperationCancelledError|ECANCELED`；**A 层不含任何 memory / heap 项**，不读本机夹具。
- **启动描述单一来源**：`buildSpikeLaunchDescriptor({ platform, port, root, electronBinary })` 与 `buildXvfbAppLaunch({ executable, args, port })` 是唯一平台差异点——Linux 一律 `xvfb-run -a <exe> --no-sandbox --disable-dev-shm-usage … --remote-debugging-port=<port>`，darwin 为 `<electron> . --remote-debugging-port=<port>`；脚本与 workflow 内不得出现第二份拼装。
- **Linux GUI 腿统一启动与收尾**：`linux-deb-version` / `linux-directory-compare` / `cancel-leg` 与 spike 共用同一 xvfb 启动描述与 `processGroup: spikeUsesProcessGroup('linux')`，收尾走同一 `stopChild`（整组 SIGTERM→SIGKILL + 管道/监听解绑）。AppImage 腿执行解包根 `AppRun`（由它导出 `APPDIR` / `LD_LIBRARY_PATH` / `GSETTINGS_SCHEMA_DIR`），**缺 `AppRun` 直接 fail**，不得退回裸二进制或 skip。
- **启动诊断进 step JSON 与 step log**：`launchApp` 失败时不再只留 `error.message`；`stepDiagnostics(error)` 把 `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `portProbe` 写进该 step 的 `actual.diagnostics`，`formatStepDiagnostics` 以同样字段写 step log。stdout / stderr 以 `STEP_DIAGNOSTIC_TEXT_LIMIT=8000` 字符截断并记录 `truncated` / `originalChars`；未超限时原样保留 Electron stderr。
- **Windows Authenticode 口径**：`windows-authenticode` 始终记录原始 `Status`；`AUTHENTICODE_PASS_STATUSES = ['NotSigned', 'Valid']`，`NotSigned` 证据含 `AUTHENTICODE_UNSIGNED_NOTE`（「Windows 未签名发布姿态」），`Valid` 为将来补证书预留；`UnknownError` / `HashMismatch` / 空值 / 其他值与 pwsh 非零退出全 fail。发布侧配套：`release.yml` 的 `Build installers` 只在 `matrix.target == 'mac'` 时注入 `CSC_LINK` / `CSC_KEY_PASSWORD`，避免 macOS Developer ID 证书把 Windows PE 签成不可信签名。
- **per-step JSON 与日志**：每项检查写 `<out>/steps/<NN>-<id>.json`，字段固定 `id` / `name` / `command` / `expected` / `actual` / `status` / `evidence` / `startedAt` / `finishedAt`，`status` 仅 `pass|fail|skip`；stdout / stderr 落 `<out>/logs/<NN>-<id>.log`，`evidence` 指向真实存在的文件。
- **fail-closed `summary.json` 与终局判定单一来源**：必含 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；最终结论只由纯函数 `judgeReleaseGate(summary, { expectedIds, exists })` 产出（`ok` 当且仅当 `validateSummary` 无问题且 `status==='pass'`），`--aggregate` 与普通分支共用，退出码只由 `ok ? 0 : 1` 派生，失败回写 `summary.status='fail'` 与 `problems`。
- **只读 workflow**：`post-release-verify.yml` 仅 `workflow_dispatch`（输入 `tag` 必填）触发，`run-name: post-release-verify ${{ inputs.tag }}`，`permissions: contents: read`，零 `secrets.*`，只调 `gh api` / `gh release download`；`spike` job（ubuntu + macOS）先于平台矩阵（`needs: spike`），每个 job 用 `upload-artifact` 归档 `<out>`（artifact 名含 tag 与 run id）。
- **spike 等待与证据**：有界轮询 + 子进程存活检查（`waitForSpikePageTarget`），失败原因封闭为 `process-exited` / `no-page-target` / `app-shell-timeout`；失败与成功都原子落 `spike.json` + `spike-launch.log`（Electron stdout/stderr、xvfb 输出、逐条 `/json/list` 探针）；证据落盘后入口用 `exitAfterFlush` 先 drain 再退出（`SPIKE_EXIT_FLUSH_TIMEOUT_MS` 兜底），库函数不调 `process.exit`。
- **B 层（`--layer=local`）**：只对真实目录对 `/Users/zhutao/opencompare-fixtures/work/left` ↔ `right` 跑三轮四态 + 算术自洽 + 关闭会话后的 GC 保留堆判定（第 3−第 2 ≤ 16 MiB）；窗口布局 / 滚动 / 原生面板 / TCC 只进 `manual` 并标 `not-covered`。

## 验收

- **ac-cli-contract / ac-cli-behavior-unchanged**：注入 fixture 全通过时退出 0 并写 `<out>/summary.json`；缺 `--tag`、`--layer` 非法、`--out` 不可写时非零退出且不写半成品；`--aggregate` 合并与平台过滤语义不变；不新增 `fetch` / `node:http(s)` / `node:net`，`gh` 调用集合不变。
- **ac-step-json**：每个检查项写出 9 个固定字段，`status` 仅 `pass|fail|skip`，命令输出落 `<out>/logs/<NN>-<id>.log`，`evidence` 指向真实存在文件。
- **ac-a-check-count / ac-expected-15**：`expectedCheckIds` 固定 15 项（identity 2 / mac 4 / linux 3 / windows 2 / cancel-log 2 / evidence 2），`counts.expected === 15`，实际集合与期望集合逐项相等；少项 / 多项即 fail 并列出 `missing` / `unexpected`。`judgeReleaseGate` / `validateSummary` 的 fail-closed 语义与既有断言数值不得下调。
- **ac-a-no-skip / ac-a-no-memory / ac-ci-no-b-layer**：任何 `status=skip` 即 fail；CI 层不出现 memory / heap 采样、不读 6.4 GiB 夹具、不执行 L3；不用 `continue-on-error` / `|| true` / warn 代替失败。
- **ac-identity / ac-mac**：逐资产断言存在 / 字节 / sha256；dmg `-readonly` 挂载、`.app` 拷干净目录、版本等于 tag 去 `v`、`codesign --verify --deep --strict` 退出 0、`spctl` 含 `accepted` 与 `Notarized Developer ID`、`stapler validate` 退出 0，无论成败都 detach。
- **ac-linux / ac-linux-directory-compare-starts**：Linux 腿一律经 `buildXvfbAppLaunch` 启动（deb 可执行文件 / AppImage 解包根 `AppRun`），版本等于 tag 版本；合成左右树（每侧 ≤2,000 文件、总量 ≤50 MiB）跑一次目录对比，CDP 读到的 `same/added/removed/modified` 与期望完全相等；缺 `AppRun`、启动失败、版本不等或计数不等即 fail。
- **ac-cancel-log / ac-cancel-leg-starts**：取消腿同源启动，观察到进度后取消，回到可操作态且左右树无残留文件 / `.tmp`；全量 stdout / stderr 与可定位日志中 `OperationCancelledError|ECANCELED` 命中 0 次。
- **ac-diagnostics-on-step / ac-diagnostics-asserted**：启动失败时 step JSON 的 `actual.diagnostics` 与 step log 都含 `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `portProbe`；超限以明示上限截断并标注，未超限原样保留；门禁用注入的失败 `launchApp` 断言，不依赖真实窗口。
- **ac-linux-process-group-teardown / ac-no-new-orphans**：三条 Linux 腿全部 `detached` 进程组启动，先整组 SIGTERM、宽限内未退再整组 SIGKILL，并释放 stdout/stderr 管道与 data/exit/error 监听；门禁用假进程树断言父 / 孙均被回收、管道 destroyed；结束后不残留 `Xvfb` / `opencompare`，等待与宽限常量沿用既有预算。
- **ac-windows / ac-authenticode-status-branch / ac-authenticode-gate**：解压 win zip 断言规范化版本等于 tag 版本；安装包始终记录原始 `Status`，`NotSigned` pass（证据含「Windows 未签名发布姿态」）、`Valid` pass、`UnknownError` / `HashMismatch` / 空值 / 未知值与非零 pwsh 退出 fail；门禁表覆盖上述每个分支，并断言 `release.yml` 的 `CSC_*` 只对 mac 注入。
- **ac-fail-closed-evidence**：`summary.json` 必含 `tag` / `layer` / `status` / `counts` / `environment` / `evidenceDir`；缺字段、检查项数不等于期望或证据不存在即 `status=fail` 且非零退出。
- **ac-gate / ac-gate-exported / ac-gate-single-source**：`.munk/code-gates.json` 的 `verify-release-gate` 覆盖 fail-closed 的缺项 / 多项 / skip / sha / 字节 / 版本 / 证据缺失分支与固定 15 项计数；`judgeReleaseGate` 必须纯（不读文件 / env / 网络 / 时钟），`exists` 由调用方注入，新增检查同批更新 `expectedIds`。测试文件 `src/verify-release-gate.test.ts` ≤500 行、`readFileSync` ≤1 处读取入口、`toContain` = 0，不新增等价测试文件、不搬断言规避行数门。
- **ac-workflow-trigger / ac-workflow-artifact**：`on` 的键集合恰为 `['workflow_dispatch']`（`release` / `push` / `schedule` 不得出现），`run-name` 逐字相等，`permissions: contents: read`，无 `secrets.*`、无 `gh release upload|edit|create|delete` / `git tag` / `git push`；每个 job 归档 `summary.json`、`steps/*.json`、`logs/*.log`，`if: always()` 可用但不得 `continue-on-error` 掩盖失败。
- **ac-spike**：spike 在 ubuntu 与 macOS 各跑一次，证据含 run id、`ImageOS` / `ImageVersion` 与 Electron + CDP 起窗结论；spike 失败时矩阵不得启用或不得声称全绿；macOS 起不来只记录静态断言范围与本机冷启动证据，不得写成 pass / skip / warn。
- **ac-b-local-only / ac-threshold**：`--layer=local` 只把真实目录对三轮四态 / 算术自洽 / GC 内存作为检查项；阈值固定 `16 * 1024 * 1024` 字节（等于 pass、+1 fail），不提供放宽开关；`manual` 项不得混入 `checks`。
- **ac-docs-synced**：`AGENTS.md` 硬约束含 Linux GUI 腿同源启动/收尾与 Windows `NotSigned` 两条口径；`docs/lessons.md` 记录真证据 run / 根因 / 收尾与 Authenticode 口径 / 断言位置 / 重跑条件；`docs/release-signing.md` 与 `scripts/verify-release.d.mts` 与实际代码一致（`StepDiagnostics` / `buildXvfbAppLaunch` / `AUTHENTICODE_PASS_STATUSES` 为导出契约）。
- **ac-code-gates**：`pnpm test` / `pnpm typecheck` / `pnpm lint` 与 `.munk/code-gates.json` 全量门禁（含 `spike-launch-gate`、`spike-process-tree-gate`、`verify-release-gate`）退出码 0；门禁不启真实 Electron / xvfb、不联网、不读本机夹具。
- **ac-no-history-rewrite / ac-real-run-closed**：不改已公开 tag / Release / 资产，本仓不 push tag、不 dispatch；**实机证据仍缺**——合入 main 后须由维护者重 dispatch，取得「双 OS spike success 且正常结束 + 三平台 verify 全 pass + aggregate total=15」才算关闭。

## 非目标

- 不改 `release.yml` 的发布通道语义（打包 / 上传 / finalize / 双语组装 / 门禁口径）；该文件的唯一允许改动是收窄 `CSC_*` 注入面到 `matrix.target == 'mac'`。
- 不把 6.4 GiB 夹具塞进 CI；CI 不跑 L3；A 层不做任何内存 / heap 采样，不为内存腿增加 runner 时长或阈值。
- 不为 Linux 腿引入新的窗口实现或应用侧改动；只修验证脚本的启动 / 收尾 / 证据；不延长既有启动、等待、取消超时预算；不通过 `continue-on-error` / skip / warn / 只断言退出码过关。
- 不修改产品运行时代码与对比算法；不为验收新增应用内测试钩子；不新增 npm 依赖，只用 runner 自带工具（`gh` / `hdiutil` / `codesign` / `spctl` / `xcrun stapler` / `xvfb-run` / `dpkg-deb` / `unzip` / PowerShell）。
- 不自动化真实窗口布局 / 滚动、原生面板 / TCC；脚本只标 `not-covered`，不假装覆盖。
- 不新建测试类 WorkItem；断言写进 `code_gates`。不改 L1 任务说明书；不发版、不打 tag、不 dispatch。

## 实现约束

- **一份检查注册表**：期望 id 集合只维护一处常量，实际与期望的差集进 `summary.missing` / `summary.unexpected`；新增检查必须同批更新期望计数与门禁钉板断言；各 job 调同一脚本（可加 `--platform`），禁止在 workflow 内联另写判定。
- **本地与 CI 同代码路径**：`--layer=ci` 在本地与 CI 完全一致；本地缺 `GITHUB_RUN_ID` 用 `local-<timestamp>`，CI 必须用真实 run id；`ImageOS` / `ImageVersion` 缺失即 fail，不得用 `unknown` 静默放行。
- **版本从产物自身读**（macOS `Info.plist`、Linux deb control 或 AppImage 内 `app.asar` 的 `package.json`、Windows exe `VersionInfo`），不从文件名推断；比较前只做 `v` 前缀剥离与 `X.Y.Z` 规范化。
- **只读纪律**：公开件只读打开；macOS 挂载 `-readonly` 且 finally detach；Windows / Linux 只解压到干净临时目录；B 层真实目录对只读使用，缺目录或不可读判 fail 而非 skip。取消腿合成树规模固定并记入证据（单侧 ≤500 MiB），不为命中取消点引入产品侧延时或测试开关。
- **Linux 启动只有一份描述、收尾只有一处实现**：`detached` 进程组、SIGTERM→SIGKILL 升级、管道释放只在 `spawnCapturedChild` / `stopChild` 一处实现，成功与失败路径共用；`process.exit` 只在脚本入口经 `exitAfterFlush` 使用；`SPIKE_*` 预算不得为「治挂起」调大。
- **诊断必须可注入、结论优先于消息**：`stepDiagnostics` / `formatStepDiagnostics` 是 step `actual.diagnostics` 与 step log 的唯一格式化入口，截断上限以导出常量表达；门禁用抛 `diagnostics` 的假 `launchApp` 与假进程树驱动，禁止在门禁里启动真实 Electron / xvfb / 联网。任何「只把 `error.message` 写进 step」的改法视为回归。
- **Authenticode 判定表固定且 fail-closed**：`NotSigned` 必附「Windows 未签名发布姿态」，`Valid` 放行，其余值与非零退出全 fail；不接受「任何状态都 pass」的松弛，也不得改回 `Valid` 单值或跳过。
- **终局判定只能有一处**：`buildSummary` 负责生成 `status`，最终结论只由 `judgeReleaseGate` 给出；新增检查或字段时同步更新 `expectedIds` 与纯函数用例，禁止在 CLI 分支内再写一份判定。
- **证据与断言落点**：`src/verify-release-gate.test.ts`（纯函数 + 注入 fixture）、`src/spike-launch-gate.test.ts`、`src/spike-process-tree-gate.test.ts` 与 `.munk/code-gates.json` 对应门禁；`pnpm test` 必须包含这些文件并通过。

## 最近交付证明

- WI：`wi_intake_2e3f11bbcc75fdc2`（**v0.2.17 复验三条红腿：Linux 两条 verify 腿秒退 / 孤儿进程与 Windows Authenticode `UnknownError`**：三条 Linux GUI 腿改用 `buildXvfbAppLaunch` 起 `xvfb-run -a <deb 可执行文件|解包根 AppRun>` 并进 `detached` 进程组，收尾复用 spike 的 `stopChild` 整组 SIGTERM→SIGKILL + 管道解绑；`launchApp` 失败时把 `reason`/`exitCode`/`signal`/`stdout`/`stderr`/`portProbe` 写进 step JSON 与 log（`STEP_DIAGNOSTIC_TEXT_LIMIT=8000` 截断并标注）；Authenticode 改为 `NotSigned`/`Valid` pass、其余 fail-closed，并在 `release.yml` 收窄 `CSC_*` 只注入 mac 以消除 Windows PE 被 macOS 证书污染；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-11-03
- 结果：`code_gates` passed（**26 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_2e3f11bbcc75fdc2/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (26 gates, attempt 001)"`、`failedGateIds: []`）；`test` 门 125 files / **1972 passed + 1 skipped**（1973）、30.24s；`verify-release-gate` 单跑 56 tests / 17.96s。
- 改动面（本域相关）：`scripts/verify-release.mjs` +216 区间（新增导出 `buildXvfbAppLaunch` / `stepDiagnostics` / `formatStepDiagnostics` / `STEP_DIAGNOSTIC_TEXT_LIMIT` / `AUTHENTICODE_PASS_STATUSES` / `AUTHENTICODE_UNSIGNED_NOTE`，`launchApp` catch 改走 `launchFailureActual`）；`scripts/verify-release.d.mts` +30；`src/verify-release-gate.test.ts` +177（Linux 启动形状 / 无 `AppRun` fail / 诊断与截断 / Authenticode 分支 / 文档契约）；`src/main/release-artifacts-and-brand.test.ts` +8（`CSC_*` 只对 mac）；`.github/workflows/release.yml` 9 行（CSC 注入面 + 注释）；`AGENTS.md` +2；`docs/release-signing.md` +6（§七）；`docs/lessons.md` +10（§14）；`README.md` / `README.zh-CN.md` 各 1 行（Linux 需 `libfuse2`）；`.munk/baseline/test-debt.json` `growth` 45,245 → 45,384（+139）、`addedCases: 10`。零 diff：`package.json#version`（0.2.18）、`.munk/code-gates.json`（仍 26 门）、`post-release-verify.yml`、`expectedCheckIds`（仍 15 项）、任何 `SPIKE_*` 预算值、已公开 `v0.2.17` tag / Release / 资产。
- 注：① 本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`；逐条 AC 与改动前证据复核落档在 `qa/post-release-verify-red-legs-fix.md`。② **根因不是「未签名」而是签名污染**：同 run `windows-authenticode` 实测 `Status=UnknownError` 且 pwsh exit 0，下载的 Setup PE 证书表主体是 Apple `Developer ID Application: Tao Zhu (3X4J53U6RY)`——旧 `release.yml` 把 macOS `CSC_*` 注入到 win/linux 矩阵；Linux 侧同理不是产物起不来（同 job deb 腿通过），而是旧收尾只杀 `xvfb-run` 直接子进程，Electron 孙进程持单实例锁与 Xvfb 残留，导致第二、三个实例秒退。③ **Windows 口径只在下次重新打包后才可能转绿**：当前 `v0.2.17` 资产仍是 Apple 证书签名，按 fail-closed 会继续 fail；不得为此放宽判定或跳过。④ **实机证据仍缺**：`ac-real-run-closed` 需合入 main 后由维护者重 dispatch 取证，本项不得声称发布验收已恢复。
