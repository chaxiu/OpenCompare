# 收敛 v0.2.16 L1 验收驱动为仓内唯一实现，并新增只读发布后复验流水线

## 范围

把 2026-11-02 v0.2.16 L1 现场手写的验收驱动收敛成仓内唯一实现，并按公司负责人 2026-11-02 裁定的 A/B 分层落盘：

- 新增 `scripts/verify-release.mjs`，本地与 CI 共用同一份实现。入参固定为 `--tag=vX.Y.Z`、`--layer=local|ci`、`--out=<dir>`；逐步输出 per-step JSON（步骤名、命令、实测值、期望值、pass/fail/skip、证据文件），最后输出 fail-closed 的 `summary.json`。
- `--layer=local` 保留 B 层：真实 6.43 GiB 目录对（`/Users/zhutao/opencompare-fixtures/work/left` ↔ `right`）三轮四态、算术自洽、关闭会话后的 GC 保留堆判定。B 层只在本机执行，CI 不调用、不跑 6.4 GiB、不跑 L3；三轮保留堆的真机长跑由 product-qa 任务 `task_0194dba8b812d08b` 执行，本工作项只把规则落进脚本与 `docs/lessons.md`。
- `--layer=ci` 只做 A 层，且 A 层不含内存 / heap 采样：
  1. 公开件可得性、字节数、sha256 与 Release 元数据逐位相等；
  2. macOS：下载 dmg → `hdiutil` 只读挂载 → 拷到干净目录 → `CFBundleShortVersionString` 等于 tag → 对下载件执行 `codesign --verify` / `spctl -a -t exec` / `stapler validate`；
  3. Linux：AppImage / deb 在 `xvfb` 下启动，校验版本，并用小合成树做一次对比冒烟；
  4. Windows：zip 解压，校验版本，对 exe 做 Authenticode 签名校验，不驱动原生对话框；
  5. 取消腿：观察到进度后取消，回可操作态，stderr / 日志中 `OperationCancelledError|ECANCELED` 命中 0 次；
  6. fail-closed：每步产 JSON，检查项数量固定，少一项即红；任一步 skip 即红；证据连同 runner image（`ImageOS` / `ImageVersion`）、tag、run id 归档。
- 新增 `.github/workflows/post-release-verify.yml`：触发条件为 `release: types: [published]` 与 `workflow_dispatch`（输入 `tag`）；只读公开件，`permissions: contents: read`；不持签名密钥、不改 `release.yml`、不动发布通道、不修改已公开 tag / Release / 资产 / 正文。
- 先 spike 再全量：先用最小 `workflow_dispatch` 在 ubuntu（xvfb）与 macOS runner 上确认 Electron + CDP 能起窗口；spike 结论与 run id 写入交付说明与证据；spike 未过不得铺全量矩阵。macOS 若起不来，只允许记录静态断言范围 + 本机补一条冷启动腿，交付说明写明退化与原因，并明确不声明窗口腿已覆盖，不得写成 pass / skip / warn；该次不得声称 A 层全绿，是否接受退化由负责人裁定。
- `docs/lessons.md` 记录 B 层内存判定口径、v0.2.16 证据与旧口径废止理由；注明 CI 不跑内存腿，执行归 product-qa 任务 `task_0194dba8b812d08b`。
- `.munk/code-gates.json` 增加脚本单测门禁，覆盖 fail-closed 分支、检查项计数、JSON schema 与 CI 层零 heap 采样；不连网部分用注入 fixture。

当前 v0.2.16 公开 Release 为 12 件资产（三份 `latest*.yml`、mac dmg / zip 及其 blockmap、win exe / zip 及 blockmap、linux AppImage / deb）。脚本必须动态枚举 Release 资产，不得把 12 或任何资产名写死为唯一事实。

## Acceptance Criteria

- ac-cli-contract: `node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci --out=<tmp>` 在注入 fixture 全通过时退出 0，并写出 `<out>/summary.json`；缺 `--tag`、`--layer` 不是 `local|ci`、或 `--out` 不可写时以非零退出且不写半成品 `summary.json`。
- ac-step-json: 每个检查项在 `<out>/steps/<NN>-<id>.json` 写出 `id`、`name`、`command`、`expected`、`actual`、`status`、`evidence`、`startedAt`、`finishedAt`；`status` 仅允许 `pass|fail|skip`；命令 stdout / stderr 落到 `<out>/logs/<NN>-<id>.log`，且 `evidence` 指向真实存在的文件。
- ac-a-check-count: `--layer=ci` 的期望检查项按 identity / mac / linux / windows / cancel-log / evidence 六组固定，组内具体检查项 id 与数量也固定；`summary.counts.expected` 等于这六组检查项总数，实际集合必须与期望集合逐项相等；少一项或多一项时 `summary.status=fail`、退出非零，并在 `summary.missing` / `summary.unexpected` 列出具体 id。
- ac-a-no-skip: `--layer=ci` 任一步 `status=skip` 时 `summary.status=fail`、退出非零并列出该 id；A 层实现不得产生 skip，也不得用 `continue-on-error`、`|| true` 或 warn 代替失败。
- ac-a-no-memory: `--layer=ci` 的检查注册表不含任何 memory / heap 项，运行期不调用 `HeapProfiler.collectGarbage`、`Performance.getMetrics` 或读取 `JSHeapUsedSize`；单测用注入的 command runner 断言 CI 层零 heap 采样。
- ac-ci-no-b-layer: `--layer=ci` 不读取 `/Users/zhutao/opencompare-fixtures`、不生成或下载 6.4 GiB 夹具、不执行 L3；单测用 sentinel 路径与注入 fs 断言 CI 层对这些路径零访问。
- ac-identity: 给定 Release 元数据 fixture（资产 name / size / sha256）与同字节 fixture 文件，identity 检查逐资产断言存在、字节数相等、sha256 相等；任一资产缺失、字节不等、sha 不等或元数据缺 sha256 时该步 fail、退出非零，并在 `actual` 写出资产名与期望 / 实测值。
- ac-mac: macOS 检查对下载的 dmg 执行 `hdiutil attach -nobrowse -readonly`，把 `.app` 拷到干净临时目录，断言 `CFBundleShortVersionString` 等于 tag 去掉 `v` 前缀、`codesign --verify --deep --strict` 退出 0、`spctl -a -t exec` 输出含 `accepted` 与 `Notarized Developer ID`、`xcrun stapler validate` 退出 0；无论成功失败都执行 `hdiutil detach`；任一断言失败即 fail。
- ac-linux: Linux 检查在 `xvfb-run` 下分别展开 / 启动 AppImage 与 deb，断言应用版本等于 tag 版本；用脚本生成的合成左右树（每侧不超过 2,000 个文件、总量不超过 50 MiB）跑一次目录对比，四态计数与 fixture 期望相等；启动失败、版本不等或计数不等即 fail。
- ac-windows: Windows 检查解压 `OpenCompare-<ver>-win-x64.zip`，断言应用版本规范化后等于 tag 版本；对 `OpenCompare-Setup-<ver>.exe` 执行 `Get-AuthenticodeSignature` 并断言 `Status=Valid`；不驱动任何原生对话框；失败即 fail。
- ac-cancel-log: 取消腿在 Linux xvfb 下用合成树启动对比，观察到进度后触发取消，断言回到可操作态且无残留临时文件；随后扫描本次全部 stdout / stderr 与日志文件，正则 `OperationCancelledError|ECANCELED` 命中 0 次；取消点未命中或命中任一噪声即 fail，不得 skip。
- ac-fail-closed-evidence: `summary.json` 必须含 `tag`、`layer`、`status`、`counts {pass,fail,skip,total,expected}`、`environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}`、`evidenceDir`；任一必填字段缺失、检查项数不等于期望数、或证据文件不存在时 `status=fail` 且退出非零。
- ac-workflow-trigger: `.github/workflows/post-release-verify.yml` 只在 `release: types: [published]` 与 `workflow_dispatch`（输入 `tag`）触发；顶层 `permissions: contents: read`；不引用 `secrets.*`，不出现 `gh release upload|edit|create|delete`、`git tag`、`git push` 或任何写 Release / tag / 资产的命令。
- ac-workflow-artifact: 每个 job 用 `actions/upload-artifact` 归档 `<out>`，artifact 名含 tag 与 run id；归档内容至少含 `summary.json`、全部 `steps/*.json`、`logs/*.log`；上传步骤可用 `if: always()`，但不得用 `continue-on-error` 掩盖检查失败。
- ac-spike: 最小 `workflow_dispatch` spike 在 ubuntu 与 macOS 上各跑一次，证据含 run id、runner image（`ImageOS` / `ImageVersion`）、Electron + CDP 起窗结论；spike 未通过时全量矩阵不得启用或不得声称全绿；macOS 起不来时交付说明记录静态断言范围与本机冷启动证据，并明确不声明窗口腿已覆盖；该次不得声称 A 层全绿，不得用 skip / warn 代替。
- ac-v0216-run: 对已公开 v0.2.16 实跑 `workflow_dispatch`，A 层六组检查全部 `pass`、`summary.status=pass`、退出 0；证据归档含 run id、`ImageOS` / `ImageVersion`、tag 与全部 per-step JSON；不得用 skip / warn / degraded 代替。
- ac-local-ci-parity: 对同一 tag，`node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci` 与 CI run 的 identity 结论逐资产 sha256 / 字节 / 版本一致，取消腿结论（是否命中取消、噪声命中数）一致；任一不一致即 fail。
- ac-gate: `.munk/code-gates.json` 新增 `verify-release-gate`，命令为 `pnpm test src/verify-release-gate.test.ts`；该测试覆盖 fail-closed 的缺项 / 多项 / skip / sha 不符 / 字节不符 / 版本不符 / 证据缺失分支、固定检查项计数、JSON schema，以及 CI 层零 heap 采样；不连网部分全部用注入 fixture。
- ac-lessons: `docs/lessons.md` 新增一节，逐字记录：每轮关闭会话（tab=0 / 树=0）→ `HeapProfiler.collectGarbage`×2 → 静置 1s → `Performance.getMetrics().JSHeapUsedSize`；第 3 轮保留堆 − 第 2 轮 ≤16 MiB；未 GC 的轮末堆只记录；v0.2.16 证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_5d107ebc931e4ffe/evidence/32-heap-gc-probe.json` 与 241.6→241.8 MB；旧口径 `d1≥d2≥d3` 的废止理由；并注明 CI 不跑内存腿，执行归 product-qa 任务 `task_0194dba8b812d08b`。
- ac-b-local-only: `--layer=local` 的 `summary.json` 只把真实目录对三轮四态 / 算术自洽 / GC 内存作为检查项；窗口布局、滚动、原生面板 / TCC 列在 `manual` 数组并标注 `not-covered`，不得出现在 `checks` 的 pass 或 skip 中；缺真实目录、缺一轮、四态和不等于该轮总行数、三轮计数不一致、第 3−第 2 保留堆 >16 MiB 均 fail。
- ac-threshold: B 层内存阈值固定为 `16 * 1024 * 1024` 字节；fixture 差值等于 16 MiB 时 pass，等于 16 MiB+1 时 fail；脚本不得提供放宽阈值的 CLI 开关。

## 非目标

- 不改 `release.yml` 的发布通道、门禁口径、双语组装、finalize 逻辑；不新增签名密钥；不修改已公开 tag / Release / 资产 / 正文。
- 不把 6.4 GiB 夹具塞进 CI；CI 不跑 L3；A 层不做任何内存 / heap 采样，不为内存腿增加 runner 时长或阈值。
- 不修改产品运行时代码与对比算法；不为验收在应用里新增测试钩子；不新增 npm 依赖，使用 runner 自带工具（`gh`、`hdiutil`、`codesign`、`spctl`、`xcrun stapler`、`xvfb-run`、`dpkg-deb`、`unzip`、PowerShell `Get-AuthenticodeSignature` 等）。
- 不自动化真实窗口布局 / 滚动、原生面板 / TCC；这些仍留人眼，脚本只标注 `not-covered`，不假装覆盖。
- 不新建测试类 WorkItem；断言写进 `code_gates`。
- 不改 L1 任务说明书（负责人已按同一证据改过内存判定）；本工作项只把规则落进脚本与 `docs/lessons.md`。
- 不为了凑绿放宽阈值、跳过检查、把 fail 改成 warn，或把未跑的腿写成 pass / skip。

## 实现约束

- `scripts/verify-release.mjs` 使用 Node ESM + 标准库，零新增 npm 依赖；必须可被 vitest 直接 import：纯函数（检查注册表、计数比对、schema 校验、内存判定、日志扫描）单独导出，`main()` 仅在直接执行时运行。
- 检查项注册表按 layer / platform 固定；期望 id 集合只维护一份常量，实际集合与期望集合的差集进入 `summary.missing` / `summary.unexpected`；新增检查必须同批更新期望计数。
- 证据写入使用“临时文件 + rename”原子落盘，避免半成品 JSON 被当成通过；命令输出、期望值、实测值、证据路径必须逐项可复核。
- A 层六组检查与 workflow 的 job 对应关系固定；CI 各 job 必须调用同一 `scripts/verify-release.mjs`（可加内部 `--platform` 过滤），禁止在 workflow 内联另写一套判定逻辑；最终汇总 job 复用同一聚合函数，断言跨 job 的检查项总数等于期望数。
- `--layer=ci` 在本地与 CI 走完全相同的代码路径；本地缺少 `GITHUB_RUN_ID` 时用 `local-<timestamp>`，CI 必须使用真实 run id。`ImageOS` / `ImageVersion` 在 GitHub-hosted runner 上缺失即 fail；不得用 `unknown` 静默放行。
- A 层只读公开件：下载到临时目录后只读打开；macOS 挂载必须 `-readonly` 并在 finally 中 detach；Windows / Linux 只解压或展开到干净临时目录，不修改下载件，不写 Release。
- 版本号从产物自身读取（macOS `Info.plist` 的 `CFBundleShortVersionString`；Linux deb control 或 AppImage 内 `app.asar` 的 `package.json`；Windows exe 的 `VersionInfo`），不得从文件名推断；比较前只做 `v` 前缀剥离和 `X.Y.Z` 规范化。
- B 层真实目录对只读使用，不复制、不修改、不删除；缺目录或不可读判 fail，不判 skip。每轮关闭会话到 tab=0 / 树=0，再 `HeapProfiler.collectGarbage`×2、静置 1s、读 `Performance.getMetrics().JSHeapUsedSize`；未 GC 的轮末堆只记录，不参与判定；第 3 轮保留堆 − 第 2 轮 ≤16 MiB。
- B 层驱动复用现有 CDP 连接方式（参考 `scripts/capture-readme-screenshots.mjs` 的 DevTools WebSocket 连接）与真实 UI 路径，不新增产品测试钩子；窗口布局 / 滚动 / 原生面板 / TCC 只写入 `manual`。
- 取消腿的合成树规模由脚本固定并在证据中记录，必须保证取消点可命中；上限远小于 6.4 GiB（单侧不超过 500 MiB），不得为命中取消点引入产品侧延时或测试开关。
- 日志扫描范围包含本次运行的 stdout、stderr 与脚本可定位的应用日志文件；正则固定为 `OperationCancelledError|ECANCELED`，命中即 fail。
- `.github/workflows/post-release-verify.yml` 使用 `permissions: contents: read`；`gh` 只读调用 `gh api` / `gh release download`；不得出现 `gh release upload|edit|create|delete`、`git tag`、`git push`。
- spike 先于全量：workflow 内置最小 spike job（ubuntu + macOS 起窗），全量矩阵 `needs: spike`；首次交付前用 `workflow_dispatch` 实跑并归档 run id 与结论。spike 失败时矩阵不运行；macOS 起不来时只记录静态断言范围与本机冷启动证据，并明确不声明窗口腿已覆盖，不得把退化写成 pass / skip / warn，也不得声称 A 层全绿。
- 交付说明必须写明：spike run id、A 层 v0.2.16 实跑 run id、本地 `--layer=ci` 与 CI 的同 sha / 同字节 / 同版本对照、取消腿与日志扫描结论、任何退化及其原因。
- 断言落点：`src/verify-release-gate.test.ts`（纯函数与注入 fixture，不连网）+ `.munk/code-gates.json` 的 `verify-release-gate`；`pnpm test` 必须包含该文件并通过。
