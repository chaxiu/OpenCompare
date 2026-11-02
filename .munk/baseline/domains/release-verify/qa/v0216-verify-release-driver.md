# v0.2.16 L1 验收驱动收敛为仓内唯一实现 + 只读发布后复验流水线

- WI：`wi_intake_ab3a874c53d49528`
- 域：`release-verify`（验收驱动 CLI / 检查注册表 / fail-closed 汇总 / 只读复验 workflow / 门禁与教训沉淀；跨域事实同步：`domains/quality-gates` 矩阵末尾追加 `verify-release-gate`（合入 main tip 后 20 → 21）、`.munk/baseline/tech/overview.md` 门禁清单）
- 来源：`.munk/changes/wi_intake_ab3a874c53d49528/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 21 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main @3dab29c`（本 worktree HEAD，已含 v0.2.16 双语互链绝对化与发布正文链接门）
- 交付 commit：本 WI 分支 `munk/wi_intake_ab3a874c53d49528` 上的实现提交 + fold 提交
- 改动面：新增 `scripts/verify-release.mjs`（2,157 行）/ `scripts/verify-release.d.mts`（277 行）/ `src/verify-release-gate.test.ts`（1,291 行）/ `.github/workflows/post-release-verify.yml`（123 行）；修改 `.munk/code-gates.json`（6/1）、`docs/lessons.md`（9/0）、`src/munk-gates.test.ts`（8/6）。零 diff：`.github/workflows/release.yml`、`package.json`、`pnpm-lock.yaml`、`electron-builder.yml`、`src/renderer/**`、`src/core/**`、`src/preload/**`、`src/shared/**`、`src/main/**`。

## Recent execution

- workItemId: wi_intake_ab3a874c53d49528
- at: 2026-11-02T04:56:01.177Z
- status: pass
- note: code_gates 17 gates attempt 001 全 exit 0；pnpm test 108 files / 1625 passed + 1 skipped；verify-release-gate 57 tests / 17.61s

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-cli-contract | `scripts/verify-release.mjs` 导出 `parseArgs`（`--tag` 必填、`--layer` 仅 `local\|ci`、`--out` 可写校验）与 `main()` 直接执行守卫；缺参 / 非法 layer / out 不可写走 `fail-closed` 分支，非零退出且 `writeJsonAtomic` 未触达；`src/verify-release-gate.test.ts` 以注入 argv / fs 覆盖四条失败分支与全通过 exit 0，并断言 `<out>/summary.json` 写出 | 满足（脚本层 + 门禁） |
| ac-step-json | `stepJson` 写 `<out>/steps/<NN>-<id>.json`，字段 `id` / `name` / `command` / `expected` / `actual` / `status` / `evidence` / `startedAt` / `finishedAt`；`STEP_STATUSES = ['pass','fail','skip']` 为唯一枚举；日志落 `<out>/logs/<NN>-<id>.log`，`schema` 校验断言 `evidence` 路径真实存在 | 满足（脚本层 + 门禁） |
| ac-a-check-count | `CI_CHECK_GROUPS` 实测 identity 2 / mac 4 / linux 3 / windows 2 / cancel-log 2 / evidence 2 = **15**；`expectedCheckIds` / `compareCheckSets` 产出 `missing` / `unexpected`，`summary.counts.expected === 15`；缺项 / 多项用例断言 `status=fail` 且非零退出并列出 id | 满足（脚本层 + 门禁） |
| ac-a-no-skip | A 层注册表无 `skip` 产出路径，`status=skip` 即计入 fail 并列出 id；测试断言 workflow 与脚本均无 `continue-on-error` / `\|\| true` / warn 降级 | 满足（脚本层 + 门禁） |
| ac-a-no-memory | `CI_CHECK_GROUPS` 无任何 memory / heap id；`--layer=ci` 路径不调用 `HeapProfiler.collectGarbage` / `Performance.getMetrics`，不读 `JSHeapUsedSize`；门禁用注入 command runner 断言 CI 层零 heap 采样调用 | 满足（脚本层 + 门禁） |
| ac-ci-no-b-layer | `LOCAL_FIXTURE_ROOTS` 只在 `--layer=local` 使用；门禁用 sentinel 路径 + 注入 fs 断言 CI 层对这些路径零访问，且 CI 注册表无 L3 / 6.4 GiB 夹具项 | 满足（脚本层 + 门禁） |
| ac-identity | identity 组对 fixture 元数据逐资产断言存在 / 字节 / sha256；门禁覆盖缺失、字节不符、sha 不符、元数据缺 sha256 四类失败分支，`actual` 带资产名与期望 / 实测值 | 满足（脚本层 + 门禁） |
| ac-mac | mac 组 `hdiutil attach -nobrowse -readonly` → 拷 `.app` 到干净临时目录 → `CFBundleShortVersionString` 等于 tag 去 `v` → `codesign --verify --deep --strict` / `spctl -a -t exec`（含 `accepted` 与 `Notarized Developer ID`）/ `xcrun stapler validate`；`finally` 恒 detach；四类断言失败即 fail | 满足（脚本层 + 门禁，真实 macOS runner 未执行） |
| ac-linux | linux 组在 `xvfb-run` 下展开 AppImage 与 deb、读产物自身版本与 tag 比对，并生成 `SMOKE_TREE` 合成左右树（上限远小于 50 MiB）跑四态计数比对；启动失败 / 版本不等 / 计数不等即 fail | 满足（脚本层 + 门禁，真实 Linux runner 未执行） |
| ac-windows | windows 组解压 `OpenCompare-<ver>-win-x64.zip`、版本规范化后等于 tag，`Get-AuthenticodeSignature` 断言 `Status=Valid`；无原生对话框驱动；失败即 fail | 满足（脚本层 + 门禁，真实 Windows runner 未执行） |
| ac-cancel-log | cancel-log 组在 xvfb 下用固定规模合成树（`CANCEL_TREE_FILES_PER_SIDE = 20_000`）启动对比、见进度后取消，断言回可操作态与零残留临时文件；`CANCEL_NOISE_PATTERN = /OperationCancelledError\|ECANCELED/` 扫描全部 stdout / stderr / 可定位日志，命中即 fail、不得 skip | 满足（脚本层 + 门禁，真实 Linux runner 未执行） |
| ac-fail-closed-evidence | `buildSummary` 强制 `tag` / `layer` / `status` / `counts {pass,fail,skip,total,expected}` / `environment {ImageOS,ImageVersion,RUNNER_OS,GITHUB_RUN_ID}` / `evidenceDir`；字段缺失、计数不等期望、证据不存在 → `status=fail` 且非零退出（门禁 schema 用例逐一覆盖） | 满足（脚本层 + 门禁） |
| ac-workflow-trigger | `.github/workflows/post-release-verify.yml` 仅 `release: types: [published]` 与 `workflow_dispatch`（`tag` required）；顶层 `permissions: contents: read`；`secrets.*` 命中 0，`gh release upload\|edit\|create\|delete` / `git tag` / `git push` 命中 0；`gh` 仅 `api` / `release download` | 满足（静态断言 + 门禁） |
| ac-workflow-artifact | 每个 job 用 `actions/upload-artifact` 归档 `verify-out`，artifact 名含 `${{ env.TAG }}` 与 `${{ github.run_id }}`；归档内容为整个 `<out>`（含 `summary.json` / `steps/*.json` / `logs/*.log`）；spike 上传步 `if: always()`，无 `continue-on-error` | 满足（静态断言 + 门禁） |
| ac-spike | workflow 内置 `spike` job（`ubuntu-latest` + `macos-latest`，Linux 走 `xvfb-run`）先于矩阵，矩阵 `needs: spike`；`--spike` 只做 Electron + CDP 起窗 | **未取得实机证据**：本 WI 未 push / 未 dispatch，无 run id、无 `ImageOS` / `ImageVersion`；脚本与 workflow 能力已就位，不得写成就绪 |
| ac-v0216-run | 需对已公开 v0.2.16 实跑 `workflow_dispatch` 并归档六组全 pass 证据 | **未取得实机证据**：同上，无 run id；首次真实发版后的 dispatch 才是首次实战 |
| ac-local-ci-parity | 同一 tag 下本地 `--layer=ci` 与 CI run 的 identity / cancel-log 结论逐项对照 | **未取得实机证据**：缺 CI run 侧数据，本 WI 只有脚本层与门禁层覆盖 |
| ac-gate | `.munk/code-gates.json` 末尾追加 `{ id: "verify-release-gate", cwd: ".", command: "pnpm test src/verify-release-gate.test.ts" }`（合入 main tip 四条模板门禁后矩阵 20 → 21），`src/munk-gates.test.ts` 期望矩阵与长度断言同步；门禁单跑 1 file / 57 tests / 17.61s，Host attempt 001 `passed` | 满足 |
| ac-lessons | `docs/lessons.md` 新增第 11 节：逐字记录 tab=0 / 树=0 → `HeapProfiler.collectGarbage`×2 → 静置 1s → `JSHeapUsedSize`、第 3 − 第 2 ≤16 MiB、未 GC 轮末堆只记录、v0.2.16 证据路径与 241.6→241.8 MB、旧 `d1≥d2≥d3` 废止理由、CI 不跑内存腿并归 product-qa `task_0194dba8b812d08b` | 满足 |
| ac-b-local-only | `LOCAL_CHECKS` 仅 `local-fixture` / `local-rounds-4state` / `local-retained-heap`；`MANUAL_NOT_COVERED` 承载窗口布局 / 滚动 / 原生面板 / TCC 并标 `not-covered`，不进 `checks`；`judgeLocalRounds` 断言四态和等于总行数、三轮一致，缺目录 / 缺轮即 fail | 满足（脚本层 + 门禁，真实 6.4 GiB 长跑未执行） |
| ac-threshold | `RETENTION_THRESHOLD_BYTES = 16 * 1024 * 1024`；`judgeRetainedHeap` 边界用例：差值 = 16 MiB pass、16 MiB + 1 fail；CLI 无放宽阈值的开关（负断言） | 满足（脚本层 + 门禁） |

## 门禁与测试证据

- Host `code_gates` attempt 001：**17 门**全 passed / exit 0，`manifest.ok = true`，证据 `.munk/runs/run_intake_ab3a874c53d49528/code-gates/attempts/001`（逐门 `.log` + `.result.json`）。
- `pnpm test`：108 files / **1625 passed + 1 skipped（1626）**、32.25s（`test.log`）。
- `verify-release-gate`：1 file / **57 tests passed**、17.61s（`verify-release-gate.log`），全部离线注入 fixture，不启 Electron、不访问本机 `/Users/zhutao/opencompare-fixtures`。
- 矩阵形状：`gates` 末尾追加 `verify-release-gate`（合入 main tip 后 20 → 21）；前 20 项 id / 顺序 / 命令 / `cwd` 逐字未动，九条模板门禁仍在第 17–20 位；`description` 追加发布验收驱动覆盖映射（15 项 A 层注册表、CI 零 heap、B 层 16 MiB、workflow 只读）。

## 未纳入项（刻意不做）

1. **不发版、不 push、不 dispatch、不打 tag**：`release.yml` 零 diff，已公开 v0.2.16 Release / 资产 / 正文零改动。
2. **CI 不跑 B 层**：6.4 GiB 目录对、三轮四态与 GC 保留堆只在本机 `--layer=local`，长跑归 product-qa `task_0194dba8b812d08b`。
3. **不新增 npm 依赖**：只用 Node 标准库与 runner 自带工具；无 `@electron/rebuild` 之类新增包，`pnpm-lock.yaml` 零 diff。
4. **不驱动窗口布局 / 滚动 / 原生面板 / TCC**：只标 `not-covered`，不写 pass / skip / warn。
5. **不改 `docs/lessons.md` 之外的 L1 任务说明书**：内存判定口径以 lessons 第 11 节与脚本常量为唯一来源。

## 口径与陷阱注记

- **检查项计数是硬门**：A 层 15 项是注册表推导出来的，不是写死的断言值；新增 / 删除任何检查都必须同批改 `expectedCheckIds` 的消费方与 `verify-release-gate` 的钉板断言，否则 `summary.missing` / `unexpected` 会让每次运行都红。
- **A 层 skip 等于 fail**：脚本不提供「未跑先绿」通道；缺 `ImageOS` / `ImageVersion` 也直接 fail，不用 `unknown` 兜底——这是 v0.2.16 前「warn 代替失败」教训的落点。
- **版本必须从产物自身读**：文件名推断会在 Windows 规范化名（`OpenCompare.Setup.<ver>.exe`）上假绿，macOS 的 `CFBundleShortVersionString`、Linux 的 deb control / `app.asar`、Windows 的 `VersionInfo` 是三个独立读取点。
- **B 层只比较第 3 轮与第 2 轮**：旧 `d1≥d2≥d3` 把未 GC 瞬时堆当判据，会被 V8 未回收垃圾主导；固定阈值 16 MiB 且不提供放宽开关。
- **实机证据缺口必须显式**：本 WI 只交付脚本 / workflow / 门禁；`ac-spike` / `ac-v0216-run` / `ac-local-ci-parity` 的三类 run id 证据在真实发版后才会产生，后续任何汇报不得把这三条写成已通过。
