# Domain: release-verify

发布后验收驱动域：把「已公开 Release 到底能不能装、能不能跑、取消后有没有噪声」收敛为仓内**唯一一份**可复核实现 `scripts/verify-release.mjs`，并配一份只读的 `.github/workflows/post-release-verify.yml`。本域只管**验收驱动本身**（CLI 契约、检查注册表、fail-closed 汇总、A/B 分层与证据形状）；打包、签名、公证、发版通道归 `domains/release`；默认门禁矩阵形状归 `domains/quality-gates`；真实 6.4 GiB 目录对的三轮内存长跑由 product-qa 任务 `task_0194dba8b812d08b` 在本机执行，不在 CI。

## 范围

- **唯一实现与零依赖**：`scripts/verify-release.mjs` 为 Node ESM + 标准库，零新增 npm 依赖；纯函数（检查注册表 / 期望集合比对 / schema 校验 / 内存判定 / 日志扫描 / 版本规范化）单独 `export`，`main()` 仅在直接执行时运行，保证 vitest 可直接 import；`scripts/verify-release.d.mts` 提供类型声明。
- **CLI 契约**：`--tag=vX.Y.Z`（必填）、`--layer=local|ci`、`--out=<dir>`；另有内部 `--platform=mac|linux|windows|all`、`--aggregate=<parts>`（跨 job 汇总）、`--spike`（只做 Electron + CDP 起窗）。参数缺失 / layer 非法 / out 不可写一律非零退出且**不写半成品 `summary.json`**（临时文件 + rename 原子落盘）。
- **A 层（`--layer=ci`，只读公开件）**：六组固定检查——identity（逐资产存在 / 字节 / sha256 / 元数据）、mac（dmg `-readonly` 挂载 → 拷干净目录 → `CFBundleShortVersionString` → `codesign` / `spctl` / `stapler`，finally 必 detach）、linux（`xvfb-run` 启 AppImage / deb → 版本 → 小合成树四态冒烟）、windows（zip 解压 → 版本 → `Get-AuthenticodeSignature`，不驱动原生对话框）、cancel-log（观察到进度后取消 → 回可操作态 → 扫 `OperationCancelledError|ECANCELED` 零命中）、evidence（fail-closed 汇总与证据齐全）。**A 层不含任何 memory / heap 项**，不读本机 6.4 GiB 夹具，不执行 L3。
- **B 层（`--layer=local`）**：只对真实目录对 `/Users/zhutao/opencompare-fixtures/work/left` ↔ `right` 跑三轮四态 + 算术自洽 + 关闭会话后的 GC 保留堆判定；窗口布局 / 滚动 / 原生面板 / TCC 只进 `manual` 数组并标 `not-covered`，不得出现在 `checks` 的 pass 或 skip 中。
- **per-step JSON 与日志**：每项检查写 `<out>/steps/<NN>-<id>.json`，字段固定 `id` / `name` / `command` / `expected` / `actual` / `status` / `evidence` / `startedAt` / `finishedAt`，`status` 仅 `pass|fail|skip`；stdout / stderr 落 `<out>/logs/<NN>-<id>.log`，`evidence` 必须指向真实存在的文件。
- **fail-closed `summary.json`**：必含 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；缺字段、检查项数不等于期望、证据文件不存在 → `status=fail` 且非零退出。`tag` 动态枚举 Release 资产，不把「12 件」或任何资产名写死为唯一事实。
- **只读 workflow**：`.github/workflows/post-release-verify.yml` 仅由 `release: types: [published]` 与 `workflow_dispatch`（输入 `tag`）触发，顶层 `permissions: contents: read`，零 `secrets.*`，只调 `gh api` / `gh release download`；`spike` job（ubuntu + macOS 起窗）先于平台矩阵，矩阵 `needs: spike`；每个 job 用 `actions/upload-artifact` 归档 `<out>`（artifact 名含 tag 与 run id）。
- **门禁与教训沉淀**：`.munk/code-gates.json` 末尾追加 `verify-release-gate`（`pnpm test src/verify-release-gate.test.ts`）；`docs/lessons.md` 新增第 11 节记录 B 层内存口径、v0.2.16 证据与旧 `d1≥d2≥d3` 废止理由，并注明 CI 不跑内存腿。

## 验收

- **ac-cli-contract**：`node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci --out=<tmp>` 在注入 fixture 全通过时退出 0 并写出 `<out>/summary.json`；缺 `--tag`、`--layer` 不是 `local|ci`、或 `--out` 不可写时非零退出且不写半成品 `summary.json`。
- **ac-step-json**：每个检查项在 `<out>/steps/<NN>-<id>.json` 写出 9 个固定字段，`status` 仅 `pass|fail|skip`，命令输出落 `<out>/logs/<NN>-<id>.log`，`evidence` 指向真实存在文件。
- **ac-a-check-count**：`--layer=ci` 期望检查项按 identity(2) / mac(4) / linux(3) / windows(2) / cancel-log(2) / evidence(2) 六组固定、共 15 项；`summary.counts.expected` 等于该总数，实际集合与期望集合逐项相等；少一项或多一项时 `summary.status=fail`、非零退出，并在 `summary.missing` / `summary.unexpected` 列出 id。
- **ac-a-no-skip**：`--layer=ci` 任一步 `status=skip` 即 `summary.status=fail`、非零退出并列出该 id；A 层实现不产生 skip，不用 `continue-on-error` / `|| true` / warn 代替失败。
- **ac-a-no-memory**：`--layer=ci` 的检查注册表不含任何 memory / heap 项，运行期不调用 `HeapProfiler.collectGarbage` / `Performance.getMetrics` / 不读 `JSHeapUsedSize`；单测用注入 command runner 断言 CI 层零 heap 采样。
- **ac-ci-no-b-layer**：`--layer=ci` 不读 `/Users/zhutao/opencompare-fixtures`、不生成 / 下载 6.4 GiB 夹具、不执行 L3；单测用 sentinel 路径与注入 fs 断言零访问。
- **ac-identity**：给定资产元数据 fixture 与同字节文件，逐资产断言存在 / 字节数相等 / sha256 相等；缺失、字节不等、sha 不等或元数据缺 sha256 时该步 fail、非零退出，`actual` 写出资产名与期望 / 实测值。
- **ac-mac**：对下载 dmg 执行 `hdiutil attach -nobrowse -readonly`，`.app` 拷干净临时目录，断言 `CFBundleShortVersionString` 等于 tag 去 `v`、`codesign --verify --deep --strict` 退出 0、`spctl -a -t exec` 含 `accepted` 与 `Notarized Developer ID`、`xcrun stapler validate` 退出 0；无论成败都 detach；任一断言失败即 fail。
- **ac-linux**：在 `xvfb-run` 下展开 / 启动 AppImage 与 deb，版本等于 tag 版本；用脚本生成的合成左右树（每侧 ≤2,000 文件、总量 ≤50 MiB）跑一次目录对比，四态计数与 fixture 期望相等；启动失败、版本不等或计数不等即 fail。
- **ac-windows**：解压 `OpenCompare-<ver>-win-x64.zip` 断言规范化版本等于 tag 版本；对 `OpenCompare-Setup-<ver>.exe` 执行 `Get-AuthenticodeSignature` 断言 `Status=Valid`；不驱动原生对话框；失败即 fail。
- **ac-cancel-log**：取消腿在 Linux xvfb 用合成树启动对比，观察到进度后取消，断言回可操作态且无残留临时文件；随后扫描本次全部 stdout / stderr 与可定位日志，`OperationCancelledError|ECANCELED` 命中 0 次；取消点未命中或命中噪声即 fail，不得 skip。
- **ac-fail-closed-evidence**：`summary.json` 必含 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；缺字段、检查项数不等于期望或证据不存在即 `status=fail` 且非零退出。
- **ac-workflow-trigger**：`.github/workflows/post-release-verify.yml` 只在 `release: types: [published]` 与 `workflow_dispatch`（输入 `tag`）触发；顶层 `permissions: contents: read`；不引用 `secrets.*`，不出现 `gh release upload|edit|create|delete`、`git tag`、`git push` 或任何写 Release / tag / 资产的命令。
- **ac-workflow-artifact**：每个 job 用 `actions/upload-artifact` 归档 `<out>`，artifact 名含 tag 与 run id；归档至少含 `summary.json`、全部 `steps/*.json`、`logs/*.log`；上传步骤可用 `if: always()`，但不得用 `continue-on-error` 掩盖检查失败。
- **ac-spike**：最小 `workflow_dispatch` spike 在 ubuntu 与 macOS 各跑一次，证据含 run id、runner image（`ImageOS` / `ImageVersion`）与 Electron + CDP 起窗结论；spike 未通过时全量矩阵不得启用或不得声称全绿；macOS 起不来时只记录静态断言范围与本机冷启动证据，明确不声明窗口腿已覆盖，不得写成 pass / skip / warn，也不得声称 A 层全绿。
- **ac-v0216-run**：对已公开 v0.2.16 实跑 `workflow_dispatch`，A 层六组全 `pass`、`summary.status=pass`、退出 0；证据归档含 run id、`ImageOS` / `ImageVersion`、tag 与全部 per-step JSON；不得用 skip / warn / degraded 代替。
- **ac-local-ci-parity**：同一 tag 下本地 `--layer=ci` 与 CI run 的 identity 结论逐资产 sha256 / 字节 / 版本一致，取消腿结论（是否命中取消、噪声命中数）一致；任一不一致即 fail。
- **ac-gate**：`.munk/code-gates.json` 追加 `verify-release-gate`，命令 `pnpm test src/verify-release-gate.test.ts`；测试覆盖 fail-closed 的缺项 / 多项 / skip / sha 不符 / 字节不符 / 版本不符 / 证据缺失分支、固定 15 项计数、JSON schema 与 CI 层零 heap 采样；不连网部分全部用注入 fixture。
- **ac-lessons**：`docs/lessons.md` 新增一节逐字记录 B 层流程（关闭会话 tab=0 / 树=0 → `HeapProfiler.collectGarbage`×2 → 静置 1s → `JSHeapUsedSize`）、第 3 轮 − 第 2 轮 ≤16 MiB、未 GC 轮末堆只记录、v0.2.16 证据路径与 241.6→241.8 MB、旧 `d1≥d2≥d3` 废止理由，并注明 CI 不跑内存腿。
- **ac-b-local-only**：`--layer=local` 的 `summary.json` 只把真实目录对三轮四态 / 算术自洽 / GC 内存作为检查项；窗口布局、滚动、原生面板 / TCC 进 `manual` 并标 `not-covered`，不得出现在 `checks` 的 pass 或 skip；缺目录、缺一轮、四态和不等于该轮总行数、三轮计数不一致、第 3−第 2 保留堆 >16 MiB 均 fail。
- **ac-threshold**：B 层内存阈值固定 `16 * 1024 * 1024` 字节；差值等于 16 MiB 时 pass、16 MiB+1 时 fail；脚本**不提供**放宽阈值的 CLI 开关。

## 非目标

- 不改 `release.yml` 的发布通道、门禁口径、双语组装、finalize 逻辑；不新增签名密钥；不修改已公开 tag / Release / 资产 / 正文。
- 不把 6.4 GiB 夹具塞进 CI；CI 不跑 L3；A 层不做任何内存 / heap 采样，不为内存腿增加 runner 时长或阈值。
- 不修改产品运行时代码与对比算法；不为验收新增应用内测试钩子；不新增 npm 依赖，只用 runner 自带工具（`gh` / `hdiutil` / `codesign` / `spctl` / `xcrun stapler` / `xvfb-run` / `dpkg-deb` / `unzip` / PowerShell）。
- 不自动化真实窗口布局 / 滚动、原生面板 / TCC；脚本只标 `not-covered`，不假装覆盖。
- 不新建测试类 WorkItem；断言写进 `code_gates`。不改 L1 任务说明书；不发版、不打 tag、不 dispatch。

## 实现约束

- **一份检查注册表**：期望 id 集合只维护一处常量，实际集合与期望集合差集进 `summary.missing` / `summary.unexpected`；新增检查必须同批更新期望计数与 `verify-release-gate` 的钉板断言。A 层六组与 workflow 的 job 对应关系固定，各 job 调同一脚本（可加 `--platform`），禁止在 workflow 内联另写判定；汇总 job 复用同一聚合函数并断言跨 job 总数等于期望数。
- **本地与 CI 同代码路径**：`--layer=ci` 在本地与 CI 完全一致；本地缺 `GITHUB_RUN_ID` 用 `local-<timestamp>`，CI 必须用真实 run id；`ImageOS` / `ImageVersion` 在 GitHub-hosted runner 上缺失即 fail，不得用 `unknown` 静默放行。
- **版本从产物自身读**（macOS `Info.plist`、Linux deb control 或 AppImage 内 `app.asar` 的 `package.json`、Windows exe `VersionInfo`），不从文件名推断；比较前只做 `v` 前缀剥离与 `X.Y.Z` 规范化。
- **只读纪律**：公开件只读打开；macOS 挂载 `-readonly` 且 finally detach；Windows / Linux 只解压到干净临时目录；B 层真实目录对只读使用，不复制 / 修改 / 删除，缺目录或不可读判 fail 而非 skip。
- **取消腿合成树规模固定并记入证据**（单侧 ≤500 MiB，远小于 6.4 GiB），规模由脚本保证取消点可命中，不为命中取消点引入产品侧延时或测试开关。
- **spike 先于全量**：workflow 内置最小 spike job（ubuntu + macOS 起窗），全量矩阵 `needs: spike`；spike 失败时矩阵不运行。macOS 起不来时只记录静态断言范围与本机冷启动证据，退化不得写成 pass / skip / warn。
- **证据与断言落点**：`src/verify-release-gate.test.ts`（纯函数 + 注入 fixture，不连网、不启 Electron、不访问本机 6.4 GiB 路径）+ `.munk/code-gates.json` 的 `verify-release-gate`；`pnpm test` 必须包含该文件并通过。

## 最近交付证明

- WI：`wi_intake_ab3a874c53d49528`（v0.2.16 L1 验收驱动收敛为仓内唯一实现 + 新增只读发布后复验流水线；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-11-02
- 结果：code_gates passed（**17 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_ab3a874c53d49528/code-gates/attempts/001`；`pnpm test` 108 files / 1625 passed + 1 skipped（1626）、32.25s；`verify-release-gate` 单跑 1 file / 57 tests、17.61s；`build` / `build-web` / `typecheck` / `lint` 全 passed）。
- 改动面：新增 `scripts/verify-release.mjs`（2,157 行）、`scripts/verify-release.d.mts`（277 行）、`src/verify-release-gate.test.ts`（1,291 行）、`.github/workflows/post-release-verify.yml`（123 行）；修改 `.munk/code-gates.json`（+6 −1，末尾追加 `verify-release-gate`、`description` 追加发布验收驱动覆盖映射）、`docs/lessons.md`（+9，第 11 节）、`src/munk-gates.test.ts`（+8 −6，期望矩阵 16 → 17）。零 diff：`.github/workflows/release.yml`、`package.json`、`pnpm-lock.yaml`、`electron-builder.yml`、`src/renderer/**`、`src/core/**`、`src/preload/**`、`src/shared/**`、`src/main/**`。
- 覆盖摘要：① **A 层注册表实测**——`CI_CHECK_GROUPS` = identity 2 / mac 4 / linux 3 / windows 2 / cancel-log 2 / evidence 2，合计 **15**；`LOCAL_CHECKS` = `local-fixture` / `local-rounds-4state` / `local-retained-heap`。② **零内存腿**——CI 层注册表无 heap 项，`RETENTION_THRESHOLD_BYTES = 16 * 1024 * 1024` 仅在 B 层判定；终态 fail-closed 汇总与 `manual` 数组由纯函数与注入 runner 覆盖。③ **workflow 只读**——顶层 `permissions: contents: read`，无 `secrets.*`，`spike` job（ubuntu + macOS）先于矩阵，矩阵 `needs: spike`，各 job 归档 `verify-out`。④ **门禁与教训**——`verify-release-gate` 落在默认矩阵末尾（16 → 17），`docs/lessons.md` 第 11 节记录 B 层 GC 保留堆口径与旧 `d1≥d2≥d3` 废止。
- 注：① 本 WI change pack **只有 `prd.md`**（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；QA 档案由 Delivery 按 prd AC 落档在 `qa/v0216-verify-release-driver.md`。② **未取得实机证据的三条 AC**：`ac-spike` / `ac-v0216-run` / `ac-local-ci-parity` 需要真实 GitHub runner 与已公开 v0.2.16，本 WI 未 push / 未 dispatch / 未打 tag，脚本层与门禁层已就位但**没有任何 run id 证据**，不得在后续汇报中写成已通过；首次真实发版后的 `workflow_dispatch` 是该流水线的首次实战。③ 默认矩阵基线由 **16 → 17**，`domains/quality-gates` 与 `.munk/baseline/tech/overview.md` 已同步；任何「16 项」旧表述只作历史。④ B 层真实 6.4 GiB 三轮长跑不在本 WI，执行归 product-qa 任务 `task_0194dba8b812d08b`。
