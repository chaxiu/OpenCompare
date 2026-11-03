# 修复 post-release-verify 的 Linux 两条 verify 腿与 Windows Authenticode 口径

## 范围

真证据基线（复验后仍需先复核，不得凭记忆改）：run `41564533825`（TAG `v0.2.17`，head `db82de3`）中 `spike (ubuntu-latest)` / `spike (macos-latest)` success 且正常结束，`verify (mac)` success，`verify (linux)` 2/9（`linux-directory-compare`、`cancel-leg` 报 `Electron 在暴露 DevTools page 前退出`），`verify (windows)` 1/6（`windows-authenticode` 实测 `UnknownError`），aggregate `pass=12 fail=3 total=15 expected=15`。本次只修 `scripts/verify-release.mjs` 及其证据/文档/门禁，不改应用 UI 与 baseline 域。

1. **诊断不再丢失**：`launchApp` 的 catch 目前只把 `error.message` 交给调用方，`error.diagnostics` 被丢弃。任何启动失败都必须把完整诊断（`reason` / `exitCode` / `signal` / `stdout` / `stderr` / `portProbe`）写入对应 step JSON 的 `actual` 与 step log，并设明确的截断上限。
2. **Linux 两条 verify 腿真启动**：`linux-directory-compare` 与 `cancel-leg` 当前直接执行 AppImage 解包后的 `squashfs-root/opencompare`，在 0.5 s / 2.2 s 内退出。先按 artifact 证据定位 AppImage 解包启动差异（优先核 `AppRun` / `APPDIR` / `LD_LIBRARY_PATH` / `resources` 路径），用最小改动让窗口真正启动，并继续用 CDP 读四态计数、观察进度并触发取消。禁止 skip、降级 warn、放宽断言或只断言退出码。
3. **Linux 收尾同源**：上述两条腿与仍以 `xvfb-run` 直接子进程启动的 `linux-deb-version` 统一复用 spike 已有的 `detached` 进程组 + 整组 `SIGTERM→SIGKILL` + 管道/监听解绑收尾；job 结束时不得再残留 `Xvfb` / `opencompare` 孤儿。既有超时预算不得延长。
4. **Windows Authenticode 改为 fail-closed 的显式口径**：本产品 Windows 安装包不签名（`electron-builder.yml` 无 win 签名配置，`docs/release-signing.md` 只覆盖 macOS），断言 `Valid` 不可达。改为：记录原始 `Status`；`NotSigned` 判 pass 并写明「Windows 未签名发布姿态」；`Valid` 判 pass（将来加证书不改代码）；`UnknownError` / `HashMismatch` / 其他值一律 fail。
5. **口径写回**：`AGENTS.md`「硬约束」追加不超过 2 行（Linux GUI 腿复用同一 xvfb + 进程组启动/收尾并把 stderr/exit/signal 写进步骤证据；未配置签名证书的 Windows 安装包只断言 `NotSigned`，不得断言 `Valid`）；`docs/lessons.md` 追加一条本轮实测记录；`docs/release-signing.md` 与 `scripts/verify-release.d.mts` 同步说明。

## 验收

- ac-run-evidence-rechecked: 改动前先用 `gh run download 41564533825` 复核 Linux / Windows 的 step JSON 与 job log，并在交付记录中引用具体 artifact / step 证据。
- ac-diagnostics-on-step: 启动失败时，对应 step JSON 的 `actual` 含 `diagnostics`（`reason`、`exitCode`、`signal`、`stdout`、`stderr`、`portProbe`），step log 同样含这些字段；stdout/stderr 以明示上限截断并在证据中标注截断，未截断时原样保留 Electron stderr。
- ac-diagnostics-asserted: 确定性门禁用一个注入的失败 `launchApp`（抛带 `diagnostics` 的 Error）断言上述字段进入 step JSON 与 log；不依赖真实窗口。
- ac-linux-directory-compare-starts: `linux-directory-compare` 用与 spike 同源的 Linux 启动描述（xvfb + `--no-sandbox` + 解包根/资源路径修正）真正起窗口，CDP 读到 `same/added/removed/modified` 四态计数且与合成树期望完全相等（不为跳过/警告放行）。
- ac-cancel-leg-starts: `cancel-leg` 同源启动后能观察到进度、点击取消、回到可操作态，且左右树无残留文件/`.tmp`（不为跳过/警告放行）。
- ac-linux-process-group-teardown: Linux 的 `linux-directory-compare`、`cancel-leg`、`linux-deb-version` 全部以 `detached` 进程组启动，停止时先整组 `SIGTERM`、宽限内未退再整组 `SIGKILL`，并释放 stdout/stderr 管道与 data/exit/error 监听；确定性门禁用假进程树断言父/孙进程均被回收、管道 destroyed。
- ac-no-new-orphans: 收尾逻辑保证 Linux 腿结束后不残留 `Xvfb` / `opencompare` 子进程；相关等待/宽限常量沿用既有预算，无新增更长超时。
- ac-authenticode-status-branch: `windows-authenticode` 始终记录原始 `Status` 字符串；`NotSigned` 与 `Valid` 判 pass，`NotSigned` 的证据含「Windows 未签名发布姿态」字样；`UnknownError`、`HashMismatch`、空值与任何其他值判 fail，且 pwsh 非零退出仍 fail（fail-closed）。
- ac-authenticode-gate: 确定性门禁表把 `NotSigned` 断言为 pass、`UnknownError`（及至少 `HashMismatch`）断言为 fail，替换现有「`NotSigned` 必 fail」用例。
- ac-expected-15: `expectedCheckIds` / summary 的 `expected=15`、leg 数量与 `judgeReleaseGate` / `validateSummary` 的 fail-closed 语义完全不变；相关既有关断言的数值与判定不得被下调。
- ac-docs-synced: `AGENTS.md` 硬约束新增不超过 2 行且内容覆盖上述两条；`docs/lessons.md` 新增本轮实测记录（证据 run / 根因 / 收尾与 Authenticode 口径 / 断言位置）；`docs/release-signing.md` 与 `scripts/verify-release.d.mts` 的新口径与实际代码一致。
- ac-code-gates: `pnpm test` / `pnpm typecheck` / `pnpm lint` 及 `.munk/code-gates.json` 中受影响的 `spike-process-tree-gate`、`spike-launch-gate`、`verify-release-gate` 全部通过。
- ac-no-history-rewrite: 不修改已公开 `v0.2.17` 的 tag、Release 或资产；本 worktree 不 push tag、不改 Release；交付说明不得声称已恢复，需写明「合入 main 后由维护者重 dispatch、两 spike success 正常结束 + 三平台 verify 全 pass + aggregate total=15」为外部验证条件。

## 非目标

- 不修改 `judgeReleaseGate` / `validateSummary` 的 fail-closed 语义，不减少 leg 数，不改 `expected=15`。
- 不修改已公开的 `v0.2.17` tag / GitHub Release / 资产，不在本 worktree 执行 dispatch。
- 不修改 UI、视觉基线、主题、图标或 baseline 域文档（另有在飞项）。
- 不为 Linux 腿引入新的窗口实现或应用侧改动；只修验证脚本的启动/收尾/证据。
- 不延长既有启动、等待、取消超时预算；不通过 `continue-on-error` / skip / warn / 只断言退出码过关。

## 实现约束

- Windows Authenticode 的判定表固定为：`NotSigned` → pass（证据写明未签名发布姿态）、`Valid` → pass、其余（含 `UnknownError` / `HashMismatch` / 空值 / 未知值）→ fail；不接受「任何状态都 pass」的松弛。
- Linux 启动差异必须由 artifact 证据指认（`AppRun` / `APPDIR` / `LD_LIBRARY_PATH` / `resources` 路径优先），不得用猜测性大改；诊断截断上限需在代码与证据中写明。
- Linux 腿的收尾必须调用与 spike 相同的 `stopChild` / `spawnCapturedChild` 进程组路径（`processGroup`），不要另写第二套回收逻辑。
- 确定性门禁用纯函数 / 假进程树 / 注入 world 覆盖，不启真实 Electron / xvfb、不联网；沿用现有 15 s 级硬超时。
- 合入 main 后由维护者重 dispatch `post-release-verify v0.2.17`；本 worktree 只交付可复核的代码与门禁证据，不宣称线上已全绿。
