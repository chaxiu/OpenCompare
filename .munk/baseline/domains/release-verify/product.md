# Domain: release-verify

发布后验收驱动域：把「已公开 Release 到底能不能装、能不能跑、取消后有没有噪声」收敛为仓内唯一可复核实现 `scripts/verify-release.mjs` 与只读 workflow `.github/workflows/post-release-verify.yml`。本域只管验收驱动本身（CLI 契约、检查注册表、fail-closed 汇总、A/B 分层与证据形状）；打包 / 签名 / 公证 / 发版通道归 `domains/release`，门禁矩阵形状归 `domains/quality-gates`。

## 范围

- **唯一实现与零依赖**：`scripts/verify-release.mjs` 为 Node ESM + 标准库，零新增 npm 依赖；注册表 / 期望集合比对 / schema 校验 / 内存判定 / 日志扫描 / 版本规范化等纯函数单独 `export`，`main()` 仅在直接执行时运行以支持 vitest import；`scripts/verify-release.d.mts` 提供类型声明。
- **CLI 契约**：`--tag=vX.Y.Z`（必填）、`--layer=local|ci`、`--out=<dir>`；内部 `--platform=mac|linux|windows|all`、`--aggregate=<parts>`、`--spike`（只做 Electron + CDP 起窗）。参数缺失 / layer 非法 / out 不可写一律非零退出且不写半成品 `summary.json`（临时文件 + rename 原子落盘）。
- **A 层（`--layer=ci`，只读公开件）**：六组固定检查 identity(2) / mac(4) / linux(3) / windows(2) / cancel-log(2) / evidence(2) 共 15 项，覆盖资产存在与字节 / sha256 / 元数据、dmg 只读挂载后的 codesign / spctl / stapler、AppImage 与 deb 的版本与四态冒烟、zip / exe 的版本与 Authenticode、取消后日志零噪声、fail-closed 汇总；A 层不含任何 memory / heap 项，不读本机夹具，不执行 L3。
- **B 层（`--layer=local`）**：只对真实目录对 `/Users/zhutao/opencompare-fixtures/work/left` ↔ `right` 跑三轮四态 + 算术自洽 + 关闭会话后的 GC 保留堆判定；窗口布局 / 滚动 / 原生面板 / TCC 只进 `manual` 数组并标 `not-covered`，不得出现在 `checks` 的 pass 或 skip。
- **per-step 证据**：每项检查写 `<out>/steps/<NN>-<id>.json`（`id` / `name` / `command` / `expected` / `actual` / `status` / `evidence` / `startedAt` / `finishedAt`，`status` 仅 `pass|fail|skip`），stdout / stderr 落 `<out>/logs/<NN>-<id>.log`，`evidence` 必须指向真实存在的文件。
- **单一终局判定**：最终 fail-closed 结论只由导出纯函数 `judgeReleaseGate(summary, { expectedIds, exists })` 产出（`ok === true` 当且仅当 `validateSummary` 无问题且 `status === 'pass'`）；`--aggregate` 与普通分支共用，退出码只由 `ok ? 0 : 1` 派生，脚本内不保留第二份内联判定。
- **只读 workflow**：`.github/workflows/post-release-verify.yml` 仅由 `workflow_dispatch`（输入 `tag`，`required: true`）触发，`run-name: post-release-verify ${{ inputs.tag }}`，`permissions: contents: read`，零 `secrets.*`，只调 `gh api` / `gh release download`；`spike` job 先于平台矩阵，各 job 用 `actions/upload-artifact` 归档 `<out>`。

## 验收

- **ac-cli-contract**：`node scripts/verify-release.mjs --tag=vX.Y.Z --layer=ci --out=<tmp>` 在 fixture 全通过时退出 0 并写出 `<out>/summary.json`；缺 `--tag`、`--layer` 不是 `local|ci`、或 `--out` 不可写时非零退出且不写半成品 `summary.json`。
- **ac-step-json**：每个检查项在 `<out>/steps/<NN>-<id>.json` 写出 9 个固定字段，`status` 仅 `pass|fail|skip`，命令输出落 `<out>/logs/<NN>-<id>.log`，`evidence` 指向真实存在文件。
- **ac-a-check-count**：`--layer=ci` 期望检查项按 identity(2) / mac(4) / linux(3) / windows(2) / cancel-log(2) / evidence(2) 六组固定共 15 项；`summary.counts.expected` 等于该总数，实际与期望集合逐项相等；少一项或多一项即 `status=fail`、非零退出并在 `summary.missing` / `summary.unexpected` 列出 id。
- **ac-a-no-skip**：`--layer=ci` 任一步 `status=skip` 即 `summary.status=fail`、非零退出并列出该 id；A 层实现不产生 skip，不用 `continue-on-error` / `|| true` / warn 代替失败。
- **ac-a-no-memory**：`--layer=ci` 的检查注册表不含任何 memory / heap 项，运行期不调用 `HeapProfiler.collectGarbage` / `Performance.getMetrics`、不读 `JSHeapUsedSize`；单测用注入 command runner 断言 CI 层零 heap 采样。
- **ac-ci-no-b-layer**：`--layer=ci` 不读 `/Users/zhutao/opencompare-fixtures`、不生成 / 下载 6.4 GiB 夹具、不执行 L3；单测用 sentinel 路径与注入 fs 断言零访问。
- **ac-identity**：给定资产元数据 fixture 与同字节文件，逐资产断言存在 / 字节数相等 / sha256 相等；缺失、字节不等、sha 不等或元数据缺 sha256 时该步 fail、非零退出，`actual` 写出资产名与期望 / 实测值。
- **ac-mac**：对下载 dmg 执行 `hdiutil attach -nobrowse -readonly`，`.app` 拷干净临时目录，断言 `CFBundleShortVersionString` 等于 tag 去 `v`、`codesign --verify --deep --strict` 退出 0、`spctl -a -t exec` 含 `accepted` 与 `Notarized Developer ID`、`xcrun stapler validate` 退出 0；无论成败都 detach；任一断言失败即 fail。
- **ac-linux**：在 `xvfb-run` 下展开 / 启动 AppImage 与 deb，版本等于 tag 版本；用脚本生成的合成左右树（每侧 ≤2,000 文件、总量 ≤50 MiB）跑一次目录对比，四态计数与 fixture 期望相等；启动失败、版本不等或计数不等即 fail。
- **ac-windows**：解压 `OpenCompare-<ver>-win-x64.zip` 断言规范化版本等于 tag 版本；对 `OpenCompare-Setup-<ver>.exe` 执行 `Get-AuthenticodeSignature` 断言 `Status=Valid`；不驱动原生对话框；失败即 fail。
- **ac-cancel-log**：取消腿在 Linux xvfb 用合成树启动对比，观察到进度后取消，断言回可操作态且无残留临时文件；随后扫描本次全部 stdout / stderr 与可定位日志，`OperationCancelledError|ECANCELED` 命中 0 次；取消点未命中或命中噪声即 fail，不得 skip。
- **ac-fail-closed-evidence**：`summary.json` 必含 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；缺字段、检查项数不等于期望或证据不存在即 `status=fail` 且非零退出。
- **ac-workflow-trigger**：`.github/workflows/post-release-verify.yml` 只在 `workflow_dispatch`（输入 `tag`，`required: true`）触发，`on` 的键集合恰为 `['workflow_dispatch']`（`release` / `push` / `schedule` 均不得出现——`GITHUB_TOKEN` 公开 Release 不触发新 run）；`run-name` 等于 `post-release-verify ${{ inputs.tag }}`；`permissions: contents: read`；不引用 `secrets.*`，不出现 `gh release upload|edit|create|delete`、`git tag`、`git push` 或任何写 Release / tag / 资产的命令。
- **ac-workflow-artifact**：每个 job 用 `actions/upload-artifact` 归档 `<out>`，artifact 名含 tag 与 run id；归档至少含 `summary.json`、全部 `steps/*.json`、`logs/*.log`；上传步骤可用 `if: always()`，但不得用 `continue-on-error` 掩盖检查失败。
- **ac-spike**：最小 `workflow_dispatch` spike 在 ubuntu 与 macOS 各跑一次，证据含 run id、runner image（`ImageOS` / `ImageVersion`）与 Electron + CDP 起窗结论；spike 未通过时全量矩阵不得启用或不得声称全绿；macOS 起不来时只记录静态断言范围与本机冷启动证据，明确不声明窗口腿已覆盖，不得写成 pass / skip / warn。
- **ac-v0216-run**：对已公开 v0.2.16 实跑 `workflow_dispatch`，A 层六组全 `pass`、`summary.status=pass`、退出 0；证据归档含 run id、`ImageOS` / `ImageVersion`、tag 与全部 per-step JSON；不得用 skip / warn / degraded 代替。
- **ac-local-ci-parity**：同一 tag 下本地 `--layer=ci` 与 CI run 的 identity 结论逐资产 sha256 / 字节 / 版本一致，取消腿结论（是否命中取消、噪声命中数）一致；任一不一致即 fail。
- **ac-gate**：`.munk/code-gates.json` 追加 `verify-release-gate`，命令 `pnpm test src/verify-release-gate.test.ts`；测试覆盖 fail-closed 的缺项 / 多项 / skip / sha 不符 / 字节不符 / 版本不符 / 证据缺失分支、固定 15 项计数、JSON schema 与 CI 层零 heap 采样；不连网部分全部用注入 fixture。
- **ac-lessons**：`docs/lessons.md` 新增一节逐字记录 B 层流程（关闭会话 tab=0 / 树=0 → `HeapProfiler.collectGarbage`×2 → 静置 1s → `JSHeapUsedSize`）、第 3 轮 − 第 2 轮 ≤16 MiB、未 GC 轮末堆只记录、v0.2.16 证据路径与 241.6→241.8 MB、旧 `d1≥d2≥d3` 废止理由，并注明 CI 不跑内存腿。
- **ac-b-local-only**：`--layer=local` 的 `summary.json` 只把真实目录对三轮四态 / 算术自洽 / GC 内存作为检查项；窗口布局、滚动、原生面板 / TCC 进 `manual` 并标 `not-covered`，不得出现在 `checks` 的 pass 或 skip；缺目录、缺一轮、四态和不等于该轮总行数、三轮计数不一致、第 3−第 2 保留堆 >16 MiB 均 fail。
- **ac-threshold**：B 层内存阈值固定 `16 * 1024 * 1024` 字节；差值等于 16 MiB 时 pass、16 MiB+1 时 fail；脚本不提供放宽阈值的 CLI 开关。
- **ac-gate-exported / ac-gate-single-source / ac-types-declared**：`scripts/verify-release.mjs` 导出 `judgeReleaseGate(summary, { expectedIds = [], exists = existsSync } = {})`，返回 `{ ok, status, problems }`；内部复用 `validateSummary`（不复制字段 / 证据判定）；`--aggregate` 与普通分支都只调该函数，退出码 `ok ? 0 : 1`，失败时回写 `summary.status='fail'` 与 `summary.problems`；`scripts/verify-release.d.mts` 声明入 / 出类型且 `pnpm typecheck` 通过。
- **ac-gate-pass**：15 项 CI 检查全 `pass`、必需环境字段齐全、证据存在、`expectedIds` 为 15 项时返回 `ok=true`、`status='pass'`、`problems=[]`。
- **ac-gate-missing-field**：删掉必需字段（至少覆盖 `environment`）时 `ok=false`、`status='fail'`，`problems` 含 `summary 缺字段 environment`。
- **ac-gate-version-mismatch / ac-gate-asset-mismatch / ac-gate-skip-fails**：`mac-dmg-version` 或 `identity-asset-bytes-sha256` 为 `fail`、或任一检查为 `skip` 时，即使顶层 `status` 被篡改为 `pass` 仍 `ok=false`，`problems` 指出该失败检查或 `status` 与检查不一致，不放行。
- **ac-test-lines / ac-test-tocontain / ac-test-readfilesync**：`src/verify-release-gate.test.ts` ≤600 行（现行收紧见 ac-target-file-size）、`toContain`（含 `not.toContain`）≤6、`readFileSync` ≤4 且每处只作数据加载（fixture 字节 / summary.json / workflow yml / `.munk/code-gates.json` / `docs/lessons.md` / 脚本源码），不得承载断言语义。
- **ac-baseline-measured / ac-coverage-not-lower**：改前在未修改测试上以 vitest JSON reporter 实测 `assertionResults` 总数为基线 B，改后同命令用例数 A ≥ `ceil(0.95 × B)`（不用源码 `it|test` 计数替代）；以 `@vitest/coverage-v8@5.0.5` 测 `scripts/verify-release.mjs` 行覆盖，改后不低于改前，命令与前后数字写入 delivery。
- **ac-removed-assertion-mapping / ac-no-assertion-relocation**：每删除一条 `toContain` 必须给出「原断言 → 更强的替代断言（测试名 + 断言内容）」映射，给不出替代只能占用 ≤6 保留配额；断言不得迁往 `.munk/` 或其它测试文件，测试 diff 仅 `src/verify-release-gate.test.ts`。
- **ac-structural-shared-call / ac-structural-no-drift / ac-no-wording-assertions**：以 `ts.createSourceFile` 解析脚本，断言模块导出 `judgeReleaseGate`、其函数体调用 `validateSummary`、`runVerifyReleaseCli` 调用 `judgeReleaseGate`、CLI 函数体内不再直接调 `validateSummary` 且无 `summary.status` 条件的 0/1 内联判定；对脚本不再断言中文文案 / 措辞，判定行为一律调用纯函数断言返回值。
- **ac-cli-behavior-unchanged / ac-no-network**：参数解析、usage、退出码 0/1/2、`--aggregate` 合并、`--layer=ci` 15 项 / `--layer=local` 3 项、证据写入与 `--out` 不可写处理与基线一致；不新增 `fetch` / `node:http(s)` / `node:net` / 网络命令，`gh` 调用集合不变，测试仍以注入宿主离线运行。
- **ac-version-frozen / ac-file-overlap**：`package.json#version` 保持 `0.2.16`，`docs/release-notes/*`、`CHANGELOG.md`、`.github/workflows/release.yml` 零 diff；生产 diff 仅 `scripts/verify-release.mjs` 与 `scripts/verify-release.d.mts`，不碰 `src/main/release-evidence.test.ts`。
- **ac-full-code-gates / ac-injection-red**：按 `.munk/code-gates.json` 顺序全量 gate 退出码 0；把 `judgeReleaseGate` 临时改为无条件 pass 后 gate 用例必须变红（记录注入点、命令、退出码、失败用例），还原后复跑为绿。
- **ac-delivery-numbers / ac-delivery-claims / ac-deadline**：delivery 给出改前 / 改后实测数字（测试行数、`toContain`、`readFileSync`、`describe(`、执行用例 A/B、全仓测试文件行数、非测试源码行数），不得出现「测试代码量已解决」或等价表述；未在全绿前交付则只交缺口清单，不降门、不删断言。
- **ac-target-file-size**：`src/verify-release-gate.test.ts` 的 `wc -l` ≤500（基线 599，净减 ≥99）；只许靠合并重复 `describe` / 表驱动化重复 `it` / 压缩样板达成，禁止把断言搬进新文件规避行数门，禁止为凑行数删行为断言。
- **ac-single-read-entry**：该文件 `readFileSync` 字面出现 ≤1（只保留一个字节读取入口，文本读取由其派生）、`toContain(` = 0、不新增任何 `*.test.ts`。
- **ac-behavior-preserved**：`pnpm test src/verify-release-gate.test.ts` 全绿且 0 skipped；全仓 collected ≥1779（基线 1872，降幅 ≤5%）；被合并 / 改写的每条断言必须有「原断言 → 替代断言」映射，且以下行为各至少一条断言在跑：A 层 15 项固定 registry、平台过滤、CLI 参数拒绝、A 层全绿与零 heap / 零本机夹具、13 条平台 fail 腿、missing / unexpected / skip / count / env / evidence / step 字段 fail-closed、三平台聚合、B 层三轮与 16 MiB 线、纯函数判定、AST 结构契约、post-release workflow 契约、code-gates 清单契约。
- **ac-synthetic-version**：本文件内不出现当前发布版本字面量（`v?0.2.16`），judge 入参一律合成版本（`9.9.9` / `v9.9.9` / `v1.2.3`），`judgeReleaseGate` 等纯函数判定逻辑不变。
- **ac-spike-linux-launch-descriptor**：给定平台与端口，启动描述逐字段可断言——Linux 为 `command="xvfb-run"`、`args` 以 `-a` 开头且同时含 `--no-sandbox`、`--disable-dev-shm-usage`、`--remote-debugging-port=<port>`，被测入口仍是仓库根 `.`；darwin 为 Electron 二进制 + `.` + `--remote-debugging-port=<port>`，不含 `--no-sandbox` / `xvfb-run`；两者共用同一构造函数；缺 Electron 二进制或端口越界必须抛错。
- **ac-spike-workflow-parity**：workflow 中 spike 的 Linux 与 macOS 步骤执行同一命令形状（同一个 `scripts/verify-release.mjs`、同一组 `--tag/--layer=ci/--spike/--out=verify-out`），Linux 步骤不再由外层 `xvfb-run` 包裹（xvfb 归属唯一：由启动描述决定），且 Linux spike 步骤前显式安装 xvfb、不依赖 runner 预装。
- **ac-spike-fail-fast-on-exit**：子进程在 page target 出现前退出时，spike 在子进程退出后 ≤5s 内以退出码 1 结束（不空转到 120s），`spike.json` 的 `reason="process-exited"`，`exitCode` 为真实退出码（非 0 / 非默认值），`stdout`、`stderr` 为捕获原文（可为空串但字段必须存在）。
- **ac-spike-bounded-target-wait**：子进程存活但始终无 page target 时，在固定预算（默认 ≤60s，导出为常量 `SPIKE_TARGET_TIMEOUT_MS`）内失败，`reason="no-page-target"`，`portProbe` 至少 1 条记录（含 `/json/list` 返回或错误），探针间隔为固定常量（`SPIKE_TARGET_POLL_INTERVAL_MS`，>0 且 ≤1s），并记录会话总时长。
- **ac-spike-reason-app-shell**：target 已出现但 app shell 表达式在预算内未就绪时，`reason="app-shell-timeout"`，与 `no-page-target`、`process-exited` 三者互不混同（`SPIKE_FAILURE_REASONS` 取值集合固定且封闭）。
- **ac-spike-diagnostics-artifact**：失败时 `--out` 下必须同时落 `spike.json`（含 `conclusion`、`reason`、`exitCode`、`signal`、`stdout`、`stderr`、`portProbe`、`startedAt`、`finishedAt`）与 `spike-launch.log`（含 Electron stdout+stderr、xvfb 输出、端口 / 目标探针）；成功时 `spike.json` 仍含 `conclusion="window-booted"` 与 `url`；两条路径都原子落盘，不因异常丢文件。
- **ac-no-check-set-change**：CI 检查集合仍为固定 15 项（`expectedCheckIds` 不变），`aggregate` 对缺失步骤仍 fail-closed（`total=0 expected=15` 必为 fail 且逐条报缺失）；不得放宽 `judgeReleaseGate` / `validateSummary` / 任何既有阈值，不得删检查项或改 expected。
- **ac-gate-registration**：新增门禁 `spike-launch-gate`（测试文件 `src/spike-launch-gate.test.ts`）写入 `.munk/code-gates.json`（`version` 仍为 1、命令为单 argv、不含 `&&` / `||` / `|` / `;`），`pnpm test src/spike-launch-gate.test.ts` 全绿且不启动真实窗口、不联网（时钟 / 探针 / 子进程 / world 全部注入）。
- **ac-manifest-pins-updated**：`src/munk-gates.test.ts` 的 manifest pin（门禁总数、精确 id 序列、尾部 `verify-release-gate` / `test-debt-gate`、9 个模板门禁连续位置）随新门禁同步更新并保持绿——新门禁位于 `diff-normalize-real` 之后、模板门禁之前。
- **ac-full-gates-green**：`pnpm install`、`lint`、`typecheck`、`build`、`build:web`、`test` 与 `.munk/code-gates.json` 全部门禁自绿；`.munk/baseline/test-debt.json` 按 ratchet 规则更新（`growth` 的 `from` 等于上一版 committed ceiling、`to` 等于新 ceiling，行数增幅 ≤400，floors 只升不降）。
- **ac-readonly-workflow**：`post-release-verify.yml` 仍只由 `workflow_dispatch` 触发、`permissions: contents: read`、无 `secrets.`、无 `continue-on-error`、不产生 tag / release / asset 写操作，`spike` 仍作为 `verify` 的前置门禁。
- **ac-no-release-mutation**：不改 `package.json#version`（保持 0.2.18）、不新建 tag、不改 v0.2.17 已公开 Release 与资产、不重写历史 run；`release.yml` 的发版语义不变。
- **ac-lessons-record**：`docs/lessons.md` 第 12 节记录根因证据（run artifact / Electron 无输出 / 120s 超时 / aggregate `total=0`）、修复口径（平台启动描述单一来源 + 诊断字段契约）与断言位置，由门禁以 markers 断言该节存在。
- **ac-linux-group-kill**：Linux 的 spike 子进程以 `detached: true` 建立独立进程组；stop 先对 `-pid` 整组 SIGTERM，预算内仍有存活则整组 SIGKILL 并在有界 `killWaitMs` 内 resolve；组信号之外的直接子进程信号作补充，`ESRCH` / `EPERM` 一律容忍；用真实父子孙链（孙进程继承 stdout/stderr 写端）验证 stop 返回后父、孙 `kill(pid, 0)` 均失败，零幸存者。
- **ac-stdio-released**：stop 返回后子进程 `stdout` / `stderr` 均为 destroyed，且 `exit` 与两条流的 `data` 监听数为 0，不留未 unref 的管道句柄。
- **ac-success-path-reaped / ac-failure-path-reaped**：`conclusion=window-booted` 与 `process-exited` / `no-page-target` / `app-shell-timeout` 共用同一收尾实现；成功路径证据字段（`conclusion` / `reason=null` / `url` / `portProbe`）不丢，失败路径诊断契约不回归，两条路径都零孤儿。
- **ac-cli-deterministic-exit**：独立 Node 驱动进程跑成功路径，不施加外部 kill，固定预算（≤15 s，不延长 `SPIKE_*` 超时）内退出码 0，且 `spike.json` 与 `spike-launch.log` 完整落盘。
- **ac-evidence-flushed-before-exit**：`exitAfterFlush` 只挂在模块入口（库函数零调用），先等 stdout/stderr 排队写入 drain，`SPIKE_EXIT_FLUSH_TIMEOUT_MS` 兜底强制退出；退出后 `spike.json` 可 parse、`spike-launch.log` 含启动行与至少一条 `/json/list` 探针。
- **ac-macos-parity**：macOS 不加 `detached`、启动描述与输出语义不变；`buildSpikeLaunchDescriptor` 与既有 macOS 记录字段零改动。
- **ac-gate-registered / ac-no-relax**：新增 `spike-process-tree-gate` 进入 `.munk/code-gates.json` 与 `pnpm test`（不启 Electron / xvfb、不联网、硬超时）；`expected=15`、`judgeReleaseGate`、`validateSummary` 与三个 `SPIKE_*` 预算均不放宽；workflow 触发面 / 权限 / job 超时不变。
- **ac-repro-before-fix / ac-lessons-updated**：改动前在真实 run 证据上复核，并用假进程树在旧代码上复现「stop 后孙进程存活、父进程不退出」；`docs/lessons.md` 新增第 13 节记录 run / artifact / 根因 / 收尾契约，由门禁 markers 断言。
- **ac-real-run-closed**：合入 main 后再 dispatch 一次 `post-release-verify`，双 OS spike job success 且正常结束、三条 verify 腿真跑、aggregate `total>0` 含真实 pass/fail；新 run 链接回填。截至本轮仍未执行。

## 非目标

- 不改 `release.yml` 的发布通道、门禁口径、双语组装、finalize 逻辑；不新增签名密钥；不修改已公开 tag / Release / 资产 / 正文。
- 不把 6.4 GiB 夹具塞进 CI；CI 不跑 L3；A 层不做任何内存 / heap 采样，不为内存腿增加 runner 时长或阈值。
- 不修改产品运行时代码与对比算法；不为验收新增应用内测试钩子；不新增 npm 依赖，只用 runner 自带工具（`gh` / `hdiutil` / `codesign` / `spctl` / `xcrun stapler` / `xvfb-run` / `dpkg-deb` / `unzip` / PowerShell）。
- 不自动化真实窗口布局 / 滚动、原生面板 / TCC；脚本只标 `not-covered`，不假装覆盖。
- 不新建测试类 WorkItem，断言写进 `code_gates`；不改 L1 任务说明书；不发版、不打 tag、不 dispatch。

## 实现约束

- **一份检查注册表**：期望 id 集合只维护一处常量，实际与期望的差集进 `summary.missing` / `summary.unexpected`；新增检查必须同批更新期望计数与门禁钉板断言；A 层六组与 workflow 的 job 对应关系固定，各 job 调同一脚本（可加 `--platform`），禁止在 workflow 内联另写判定。
- **本地与 CI 同代码路径**：`--layer=ci` 在本地与 CI 完全一致；本地缺 `GITHUB_RUN_ID` 用 `local-<timestamp>`，CI 必须用真实 run id；`ImageOS` / `ImageVersion` 在 GitHub-hosted runner 上缺失即 fail，不得用 `unknown` 静默放行。
- **版本从产物自身读**（macOS `Info.plist`、Linux deb control 或 AppImage 内 `app.asar` 的 `package.json`、Windows exe `VersionInfo`），不从文件名推断；比较前只做 `v` 前缀剥离与 `X.Y.Z` 规范化。
- **只读纪律**：公开件只读打开；macOS 挂载 `-readonly` 且 finally detach；Windows / Linux 只解压到干净临时目录；B 层真实目录对只读使用，不复制 / 修改 / 删除，缺目录或不可读判 fail 而非 skip；取消腿合成树单侧 ≤500 MiB 并记入证据，不为命中取消点引入产品侧延时或测试开关。
- **spike 平台差异只许一处、诊断必须可注入**：`command` / `args` / `cwd` 只由 `buildSpikeLaunchDescriptor` 产生；等待逻辑的时钟、探针、sleep、存活判定全部参数注入，门禁用假对象驱动，禁止启真实 Electron / xvfb / 联网；失败预算与重试参数以导出常量表达，不提供放宽开关；`reason` 只取自封闭集合 `SPIKE_FAILURE_REASONS`，`spike-launch.log` 必须能独立解释「进程没起来」还是「target 没暴露」。
- **收尾一次性、可注入、不延长预算**：Linux 组信号 + SIGTERM→SIGKILL 升级 + 管道释放只在 `stopChild` / `spawnCapturedChild` 一处实现，成功与失败路径共用；`process.exit` 只在脚本入口经 `exitAfterFlush` 使用，库函数不得退出进程；`SPIKE_PROCESS_EXIT_BUDGET_MS` / `SPIKE_TARGET_TIMEOUT_MS` / `SPIKE_APP_SHELL_TIMEOUT_MS` 不得为「治挂起」调大。
- **终局判定只能有一处**：`buildSummary` 只负责生成 `status`，最终 fail-closed 结论只由 `judgeReleaseGate` 给出；该函数必须纯（不读文件 / `process.env` / 不发网络 / 不依赖时钟），`exists` 由调用方注入（CLI 默认 `existsSync`，测试传常量）；新增检查或字段时同步更新 `expectedIds` 与纯函数用例。
- **证据与断言落点**：`src/verify-release-gate.test.ts`（纯函数 + 注入 fixture，不连网、不启 Electron、不访问本机 6.4 GiB 路径）与 `.munk/code-gates.json` 的 `verify-release-gate`；`pnpm test` 必须包含该文件并通过。

## 最近交付证明

- WI：`wi_intake_b3be192f93d073b2`（**Linux spike 成功启动后不退出与孤儿进程收尾**：Linux 起窗进独立进程组，stop 对 `-pid` 整组 SIGTERM→SIGKILL 并有界 resolve，随后无条件 destroy `stdout`/`stderr` 与解绑监听；成功与失败路径共用同一 stop；证据落盘后 `exitAfterFlush` drain-aware 退出，`process.exit` 只在模块入口；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-11-03
- 结果：`code_gates` passed（26 gates，attempt 001 全 exit 0，`latest.json` `ok: true`、`failedGateIds: []`）；`test` 门 125 files / 1961 passed + 1 skipped；新增 `spike-process-tree-gate` 单跑 11 tests / 830ms（不启真实窗口、不联网）。
- 改动面（本域相关）：`scripts/verify-release.mjs` +279/−50（`spikeUsesProcessGroup` / `spawnCapturedChild` / `stopChild` / `exitAfterFlush` 与 3 个新预算常量）；`scripts/verify-release.d.mts` +44；`src/spike-process-tree-gate.test.ts` 新增 386 行；`.munk/code-gates.json` 新门禁（紧跟 `spike-launch-gate`）；`src/munk-gates.test.ts` pin 25 → 26；`.munk/baseline/test-debt.json` `growth` 44,854 → 45,245（+391 ≤400）、`repoTestCases` floor 1461 → 1472；`docs/lessons.md` 第 13 节。零 diff：`package.json#version`（0.2.18）、`post-release-verify.yml`、`release.yml`、`expectedCheckIds`（仍 15 项）、任何 `SPIKE_*` 预算值。
- 注：根因是「只杀直接子进程 + 不释放管道」——旧 `stopChild` 在 leader 已退出时直接返回，孙进程持 `stdout`/`stderr` 写端钉住父事件循环，故 `conclusion=window-booted` 的成功路径同样中招，后续不得只在 catch 分支收尾、也不得以延长 `SPIKE_*` 预算掩盖；`ac-real-run-closed`（修复后双 OS spike success、三 verify 腿真跑、aggregate `total>0`）与合入 main 后的 dispatch 取证尚未执行，不得据此声称发布验收已恢复。
