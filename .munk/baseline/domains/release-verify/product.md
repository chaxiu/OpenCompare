# Domain: release-verify

发布后验收驱动域：把「已公开 Release 到底能不能装、能不能跑、取消后有没有噪声」收敛为仓内**唯一一份**可复核实现 `scripts/verify-release.mjs`，并配一份只读的 `.github/workflows/post-release-verify.yml`。本域只管**验收驱动本身**（CLI 契约、检查注册表、fail-closed 汇总、A/B 分层与证据形状）；打包、签名、公证、发版通道归 `domains/release`；默认门禁矩阵形状归 `domains/quality-gates`；真实 6.4 GiB 目录对的三轮内存长跑由 product-qa 任务 `task_0194dba8b812d08b` 在本机执行，不在 CI。

## 范围

- **唯一实现与零依赖**：`scripts/verify-release.mjs` 为 Node ESM + 标准库，零新增 npm 依赖；纯函数（检查注册表 / 期望集合比对 / schema 校验 / 内存判定 / 日志扫描 / 版本规范化）单独 `export`，`main()` 仅在直接执行时运行，保证 vitest 可直接 import；`scripts/verify-release.d.mts` 提供类型声明。
- **CLI 契约**：`--tag=vX.Y.Z`（必填）、`--layer=local|ci`、`--out=<dir>`；另有内部 `--platform=mac|linux|windows|all`、`--aggregate=<parts>`（跨 job 汇总）、`--spike`（只做 Electron + CDP 起窗）。参数缺失 / layer 非法 / out 不可写一律非零退出且**不写半成品 `summary.json`**（临时文件 + rename 原子落盘）。
- **A 层（`--layer=ci`，只读公开件）**：六组固定检查——identity（逐资产存在 / 字节 / sha256 / 元数据）、mac（dmg `-readonly` 挂载 → 拷干净目录 → `CFBundleShortVersionString` → `codesign` / `spctl` / `stapler`，finally 必 detach）、linux（`xvfb-run` 启 AppImage / deb → 版本 → 小合成树四态冒烟）、windows（zip 解压 → 版本 → `Get-AuthenticodeSignature`，不驱动原生对话框）、cancel-log（观察到进度后取消 → 回可操作态 → 扫 `OperationCancelledError|ECANCELED` 零命中）、evidence（fail-closed 汇总与证据齐全）。**A 层不含任何 memory / heap 项**，不读本机 6.4 GiB 夹具，不执行 L3。
- **B 层（`--layer=local`）**：只对真实目录对 `/Users/zhutao/opencompare-fixtures/work/left` ↔ `right` 跑三轮四态 + 算术自洽 + 关闭会话后的 GC 保留堆判定；窗口布局 / 滚动 / 原生面板 / TCC 只进 `manual` 数组并标 `not-covered`，不得出现在 `checks` 的 pass 或 skip 中。
- **per-step JSON 与日志**：每项检查写 `<out>/steps/<NN>-<id>.json`，字段固定 `id` / `name` / `command` / `expected` / `actual` / `status` / `evidence` / `startedAt` / `finishedAt`，`status` 仅 `pass|fail|skip`；stdout / stderr 落 `<out>/logs/<NN>-<id>.log`，`evidence` 必须指向真实存在的文件。
- **fail-closed `summary.json`**：必含 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；缺字段、检查项数不等于期望、证据文件不存在 → `status=fail` 且非零退出。`tag` 动态枚举 Release 资产，不把「12 件」或任何资产名写死为唯一事实。
- **终局判定单一来源**：最终 fail-closed 结论只由导出纯函数 `judgeReleaseGate(summary, { expectedIds, exists })` 产出（`ok === true` 当且仅当 `validateSummary` 无问题且 `summary.status === 'pass'`）；`runVerifyReleaseCli` 的 `--aggregate` 分支与普通执行分支共用该函数，退出码只由 `ok ? 0 : 1` 派生，失败时回写 `summary.status='fail'` 与 `summary.problems`，脚本内不再保留任何一份内联最终判定。
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

### 终局判定纯函数（WI `wi_intake_5907ad21fa9994e5`）

- **ac-gate-exported / ac-gate-single-source / ac-types-declared**：`scripts/verify-release.mjs` 导出 `judgeReleaseGate(summary, { expectedIds = [], exists = existsSync } = {})`，返回 `{ ok: boolean, status: 'pass' | 'fail', problems: string[] }`；内部复用 `validateSummary`（不复制字段 / 证据判定）；`--aggregate` 与普通分支都只调该函数，退出码 `ok ? 0 : 1`，失败时回写 `summary.status='fail'` 与 `summary.problems`；`scripts/verify-release.d.mts` 声明入 / 出类型且 `pnpm typecheck` 通过。
- **ac-gate-pass**：15 项 CI 检查全 `pass`、必需环境字段齐全、证据存在、`expectedIds` 为 15 项时返回 `ok=true`、`status='pass'`、`problems=[]`。
- **ac-gate-missing-field**：删掉必需字段（至少覆盖 `environment`）时 `ok=false`、`status='fail'`，`problems` 含 `summary 缺字段 environment`。
- **ac-gate-version-mismatch / ac-gate-asset-mismatch / ac-gate-skip-fails**：`mac-dmg-version` 或 `identity-asset-bytes-sha256` 为 `fail`、或任一检查为 `skip` 时，即使顶层 `status` 被篡改为 `pass` 仍 `ok=false`，`problems` 指出该失败检查或 `status` 与检查不一致，不放行。
- **ac-test-lines / ac-test-tocontain / ac-test-readfilesync**：`src/verify-release-gate.test.ts` ≤600 行、`toContain`（含 `not.toContain`）≤6、`readFileSync` ≤4 且每处只作数据加载（fixture 字节 / summary.json / workflow yml / `.munk/code-gates.json` / `docs/lessons.md` / 脚本源码），不得承载断言语义。
- **ac-baseline-measured / ac-coverage-not-lower**：改前在未修改测试上以 vitest JSON reporter 实测 `assertionResults` 总数为基线 B，改后同命令用例数 A ≥ `ceil(0.95 × B)`（不用源码 `it|test` 计数替代）；以 `@vitest/coverage-v8@5.0.5` 测 `scripts/verify-release.mjs` 行覆盖，改后不低于改前，命令与前后数字写入 delivery。
- **ac-removed-assertion-mapping / ac-no-assertion-relocation**：每删除一条 `toContain` 必须给出“原断言 → 更强的替代断言（测试名 + 断言内容）”映射，给不出替代只能占用 ≤6 保留配额；断言不得迁往 `.munk/` 或其它测试文件，测试 diff 仅 `src/verify-release-gate.test.ts`。
- **ac-structural-shared-call / ac-structural-no-drift / ac-no-wording-assertions**：以 `ts.createSourceFile` 解析脚本，断言模块导出 `judgeReleaseGate`、其函数体调用 `validateSummary`、`runVerifyReleaseCli` 调用 `judgeReleaseGate`、CLI 函数体内不再直接调 `validateSummary` 且无 `summary.status` 条件的 0/1 内联判定；对脚本不再断言中文文案 / 措辞，判定行为一律调用纯函数断言返回值。
- **ac-cli-behavior-unchanged / ac-no-network**：参数解析、usage、退出码 0/1/2、`--aggregate` 合并、`--layer=ci` 15 项 / `--layer=local` 3 项、证据写入与 `--out` 不可写处理与基线一致；不新增 `fetch` / `node:http(s)` / `node:net` / 网络命令，`gh` 调用集合不变，测试仍以注入宿主离线运行。
- **ac-version-frozen / ac-file-overlap**：`package.json#version` 保持 `0.2.16`，`docs/release-notes/*`、`CHANGELOG.md`、`.github/workflows/release.yml` 零 diff；生产 diff 仅 `scripts/verify-release.mjs` 与 `scripts/verify-release.d.mts`，不碰 `src/main/release-evidence.test.ts`。
- **ac-full-code-gates / ac-injection-red**：按 `.munk/code-gates.json` 顺序全量 gate 退出码 0；把 `judgeReleaseGate` 临时改为无条件 pass 后 gate 用例必须变红（记录注入点、命令、退出码、失败用例），还原后复跑为绿。
- **ac-delivery-numbers / ac-delivery-claims / ac-deadline**：delivery 给出改前 / 改后实测数字（测试行数、`toContain`、`readFileSync`、`describe(`、执行用例 A/B、全仓测试文件行数、非测试源码行数），不得出现“测试代码量已解决”或等价表述；未在全绿前交付则只交缺口清单，不降门、不删断言。

### 门禁测试瘦身与去真值化（WI `wi_intake_27a374d63891b37b`）

- **ac-target-file-size**：`src/verify-release-gate.test.ts` 的 `wc -l` ≤ **500**（基线 599，净减 ≥ 99）；只许靠合并重复 `describe` / 表驱动化重复 `it` / 压缩样板达成，禁止把断言搬进新文件规避行数门，禁止为凑行数删行为断言。现行实测 **500**。
- **ac-single-read-entry**：该文件 `readFileSync` 字面出现 ≤ **1**（只保留一个字节读取入口，文本读取由其派生）、`toContain(` = **0**、不新增任何 `*.test.ts`。现行实测 1 / 0 / 0。
- **ac-behavior-preserved**：`pnpm test src/verify-release-gate.test.ts` 全绿且 0 skipped；全仓 collected ≥ **1779**（基线 1872，降幅 ≤5%）；被合并 / 改写的每条断言必须有「原断言 → 替代断言」映射，且以下行为各至少一条断言在跑：A 层 15 项固定 registry、平台过滤、CLI 参数拒绝、A 层全绿与零 heap / 零本机夹具、13 条平台 fail 腿、missing / unexpected / skip / count / env / evidence / step 字段 fail-closed、三平台聚合、B 层三轮与 16 MiB 线、纯函数判定、AST 结构契约、post-release workflow 契约、code-gates 清单契约。
- **ac-synthetic-version**：本文件内不出现当前发布版本字面量（`v?0.2.16`），judge 入参一律合成版本（`9.9.9` / `v9.9.9` / `v1.2.3`），`judgeReleaseGate` 等纯函数判定逻辑不变。

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
- **终局判定只能有一处**：`buildSummary` 仍负责生成 `status`，最终 fail-closed 结论只由 `judgeReleaseGate` 给出；该函数必须纯（不读文件、不读 `process.env`、不发网络、不依赖时钟），`exists` 由调用方注入（CLI 默认 `existsSync`，测试传 `() => true/false`）；新增检查或字段时同步更新 `expectedIds` 与纯函数用例，禁止在 CLI 分支内再写一份判定。
- **证据与断言落点**：`src/verify-release-gate.test.ts`（纯函数 + 注入 fixture，不连网、不启 Electron、不访问本机 6.4 GiB 路径）+ `.munk/code-gates.json` 的 `verify-release-gate`；`pnpm test` 必须包含该文件并通过。

## 最近交付证明

- WI：`wi_intake_27a374d63891b37b`（**release 门禁测试瘦身与去真值化**，test-only 清债：`src/verify-release-gate.test.ts` 599 → **500 行**（净减 99）、`toContain` 0、`readFileSync` 1、执行用例 46 passed / 0 skipped、全仓 collected 1852；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-11-02
- 结果：`code_gates` passed（**21 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_27a374d63891b37b/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (21 gates, attempt 001)"`、`failedGateIds: []`）；`test` 门 115 files / **1851 passed + 1 skipped**（1852）、32.64s；本文件单跑 **46 passed**、17.91s。
- 覆盖摘要：① **行数（`ac-target-file-size`）**——599 → 500，重复 `describe` / `it` 收敛为表驱动（`failCases` / 平台腿 / fail-closed 字段矩阵），未新增测试文件。② **单一读取入口（`ac-single-read-entry`）**——`readBytes` 是唯一 `readFileSync`，`readText` / `readJson` 由其派生；`toContain` 归零，Markdown 断言改读解析后的 atoms（标题 / 代码 span / 表格 / 列表项），不再对原文整句断言。③ **行为覆盖不降（`ac-behavior-preserved`）**——15 项 registry、平台过滤、CLI 参数拒绝、A 层全绿与零 heap / 零本机 6.4 GiB 访问、13 条平台 fail 腿、missing / unexpected / skip / count / env / evidence / step fail-closed、三平台聚合、B 层三轮与 16 MiB 线、`judgeReleaseGate` 纯函数、AST 结构契约、post-release workflow 契约、code-gates 清单契约逐项仍有断言；用例 71 → 46 是合并同构断言的结果，映射落 `qa/verify-release-gate-slim-de-truing.md`。④ **去真值化（`ac-synthetic-version`）**——文件内 `v?0.2.16` 归零，`TAG = 'v9.9.9'` / `VERSION = '9.9.9'` 合成版本；纯函数判定逻辑零改动。
- 注：① 本 WI change pack **只有 `prd.md`**（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech / ux 手合；QA 档案由 Delivery 按 prd AC 落档。② **用例数不是覆盖指标**：71 → 46 是 `it.each` 展开前的字面 `it(` 收敛，合并的是同一失败路径的多份同构断言（如 13 条平台 fail 腿收敛为参数表），不是删分支；后续若要加断言，优先扩表而不是新增独立 `it`。③ **单一读取入口是行数门的副产品而非目的**：`readBytes` 派生 `readText` / `readJson` 后，新增读取不再各写一份 `readFileSync`，也不会出现「部分读取绕过 helper」的漂移。④ 本文件仍是 `verify-release-gate` 门禁的唯一落点（矩阵 21 项未变），单跑 17.9s 仍是最重的纯单测门。

- 历史（上一轮）：`wi_intake_5907ad21fa9994e5`（verify-release 终局门判定抽成纯函数 `judgeReleaseGate` + 压缩 gate 测试；`deliveryIntent: local merge`，`needSelfTest=false`，基线 HEAD `15a6313`）
- 日期：2026-11-02
- 结果：`code_gates` attempt 001 **21 gates** 全 exit 0（`.munk/runs/run_intake_5907ad21fa9994e5/code-gates/attempts/001`）；`pnpm test` 114 files / 1776 passed + 1 skipped（1777）、32.74s；`verify-release-gate` 单跑 1 file / **71 tests**、17.86s；`lint` / `typecheck` / `build` / `build-web` 全 passed。
- 实测压缩数字（改前 → 改后，均命令实测）：`src/verify-release-gate.test.ts` 1,352 → **599** 行；`toContain` 28 → **0**；`readFileSync` 13 → **3**；`describe(` 15 → **12**；执行用例 B=**63**（改前 `--reporter=json` 实测）→ A=**71**（阈值 `ceil(0.95×63)=60`）；`scripts/verify-release.mjs` 行覆盖 78.70%（743/944）→ **78.78%**（750/952，`@vitest/coverage-v8@5.0.5`）；全仓测试文件 47,367 行、非测试 `src`+`scripts` 31,848 行。
- 改动面：`scripts/verify-release.mjs` 2,157 → 2,175 行（新增并导出 `judgeReleaseGate`，两个 CLI 出口共用）、`scripts/verify-release.d.mts` +11 行（类型声明）、`src/verify-release-gate.test.ts` 全量重写为表驱动 + AST 结构断言、`package.json` / `pnpm-lock.yaml` 新增 `@vitest/coverage-v8@5.0.5`。零 diff：`.github/workflows/release.yml`、`docs/release-notes/*`、`CHANGELOG.md`、`src/main/**`、`src/renderer/**`、`src/core/**`、`src/preload/**`、`src/shared/**`、`.munk/code-gates.json`。
- 注入红：把 `judgeReleaseGate` 临时改为无条件 `return { ok: true, status: 'pass', problems: [] }` 后 `pnpm test src/verify-release-gate.test.ts` 非零退出、**26 failed / 45 passed**（失败含 `passes a complete 15-check CI summary`、`refuses a fail status even when every check passed`、`fails closed for non-object input`）；还原后同命令 **71 passed** 复绿。
- 注：① 本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例 copy、无 tech / ux 手合；逐条 AC 与「原 `toContain` → 替代断言」映射落档在 `qa/release-gate-verdict-pure-function.md`。② 上一 WI（`wi_intake_ab3a874c53d49528`）的 A/B 层驱动与只读 workflow 证据保留在 `qa/v0216-verify-release-driver.md`，其中 `ac-spike` / `ac-v0216-run` / `ac-local-ci-parity` 仍**无实机证据**，本 WI 未改变该状态。
