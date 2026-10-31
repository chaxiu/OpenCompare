# Windows 免安装 zip 与 NSIS 安装包同批发布（v0.2.15 发布资产矩阵重定标）

- WI：`wi_intake_b5a72bf708df3c08`
- 域：`release`（打包目标 + 发布资产矩阵 + 发布配置断言 + 发布面文案；不涉及应用业务功能）
- 来源：`.munk/changes/wi_intake_b5a72bf708df3c08/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 12 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 基线：`main @331ddfd`（本 worktree HEAD）
- 交付 commit：本 WI 分支 `munk/wi_intake_b5a72bf708df3c08` 上的实现提交 + fold 提交
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`electron-builder.yml` **+7 / −0**、`.github/workflows/release.yml` **+58 / −1**、`src/main/release-packaging.test.ts` **+327 / −2**、`docs/release-notes/v0.2.15.md` **+4 / −0**、`docs/release-notes/v0.2.15.zh-CN.md` **+4 / −0**、`docs/release-process.md` **1 / 1**（合计 6 files / +401 −4）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-win-target-has-nsis-and-zip | `electron-builder.yml:53-56` `win.target` 数组为 `[nsis, zip]`；新增用例 `builds both the NSIS installer and the portable zip for Windows` 断言 `targets` 含 `nsis` 与 `zip`，且 `[...targets].sort()` 恒等于 `['nsis','zip']`（第三种 win 目标会被判红，不只是「含两项」） | 满足 |
| ac-win-artifact-names-versioned | `electron-builder.yml:52` win 级 `artifactName: '${productName}-${version}-win-${arch}.${ext}'`；`:63` `nsis.artifactName` 保持 `'${productName}-Setup-${version}.${ext}'`（未动，`latest.yml` 的 `files[].url` 依赖它）。用例 `derives both Windows artifact names from the version with no spaces` 断言两条模板均含 `${version}`、均不含空格，并按 `productName=OpenCompare` / `currentVersion` / `arch=x64` 渲染得 `OpenCompare-Setup-<version>.exe` 与 `OpenCompare-<version>-win-x64.zip`，且渲染结果 `not.toMatch(/\s/)` | 满足 |
| ac-zip-is-portable-unpacked | zip 走 electron-builder 内建 `zip` target（`win.target` 加一项即产出），**无新增 shell 打包步骤**：用例 `produces the portable zip from the built-in target with no extra script` 断言 `Build installers` 步骤原文含 `electron-builder --${{ matrix.target }} --publish never`、且该步骤正文 `not.toMatch(/\bzip\b/)`；所有 npm `scripts` 名称不含 `zip`、命令串不含 `zip `；`package.json` 的 `dependencies` / `devDependencies` 无新增键。`git diff --numstat -- package.json` 为空（零 diff） | 满足 |
| ac-win-missing-asset-fail-closed | `release.yml:537` `win) required_exts=(exe zip) ;;`；用例 `requires both Windows extensions in the packaging job` 断言该行 + `for ext in "${required_exts[@]}"` + `does not match tag` 仍在；三个真跑 fixture 用例（`mkdtempSync` + `spawnSync('bash', ...)` 跑该 step 脚本原文）：两资产齐备 → `release/latest.yml version=<currentVersion>` 且 exit 0；缺 `.exe` → 非零 + `::error::No .exe artifact found`；缺 `.zip` → 非零 + `::error::No .zip artifact found` | 满足 |
| ac-latest-yml-not-polluted-by-zip | `release.yml` 新增独立步骤 `Assert the Windows update feed points at the NSIS installer`（`if: matrix.target == 'win'`，`release/latest*.yml` 为空即 `::error::` + `exit 1`，逐份 `files[].url` 判 `endsWith(".zip")`，命中即 `::error::` + `exit 1`）。fail-closed 而非假定：位置用断言钉住（`versionIndex < feedIndex < uploadIndex`），与既有版本 / url 门互不替代；脚本 `not.toMatch(/gh release (upload|edit|create|delete)/)`，纯只读。两个 fixture 用例：干净 `latest.yml` → `files[] carries no zip entry` 且 exit 0；被 zip 污染 → 非零 + `::error::` + `must use the NSIS installer` + `refusing a Windows update feed` | 满足 |
| ac-finalize-asserts-exact-win-names | `finalize` 的 `Assert the public release has every platform asset` 内新增 `has_exact_asset()`（`if [ "${name}" = "${wanted}" ]; then return 0; fi`）与 `for asset in "OpenCompare-Setup-${tag}.exe" "OpenCompare-${tag}-win-x64.zip"`，缺任一 `::error::Release ... is missing the Windows asset ${asset}` + `status=1`；`tag="${RELEASE_TAG#v}"`，不按后缀匹配（既有后缀循环仍保留给其它平台）。三个 fixture 用例覆盖：两者齐备 → exit 0；仅有 mac `-mac.zip` 而 Windows zip 缺失 → 非零且报 `portableAsset`；Windows 安装包缺失 → 非零且报 `setupAsset` | 满足 |
| ac-existing-release-gates-kept | `git diff -U0 -- .github/workflows/release.yml` 只有一处删除行（`win) required_exts=(exe)` → `(exe zip)` 的重定标），其余 57 行为纯新增；用例 `keeps every pre-existing release gate` 断言 `uniqueStep` 仍含 `select(.draft)` / `select(.prerelease)`、资产步骤仍含 `latest-mac.yml latest.yml latest-linux.yml`、finalize 既有步骤 `finalizeStep(name)` 仍全部 `toBeDefined()`；双语 body 反读步骤、latest 门、`--publish never`、`--clobber` 上传、`gh release edit --draft=false --latest` 全部零改动（`pnpm test` 96 files / 1454 passed 全绿） | 满足 |
| ac-test-version-derived | 新增断言中的版本 / 资产名全部由 `currentVersion` / `currentTag` 派生：`OpenCompare-Setup-${currentVersion}.exe`、`OpenCompare-${currentVersion}-win-x64.zip`、`release/latest.yml version=${currentVersion}`。`git diff -- src/main/release-packaging.test.ts \| grep -E '^\+.*0\.2\.15'` 命中 0（新增行零版本字面量；文件内既有 11 处 `0.2.15` 均为上一 WI 留下的注释 / 版本门常量，本轮未新增） | 满足 |
| ac-notes-windows-portable-bilingual | `docs/release-notes/v0.2.15.md` 在 `## What changed` 内新增 `### Windows portable download`：`Windows ships both the NSIS installer and a portable `.zip` (extract and run, no installation step). Auto-update keeps resolving to the NSIS installer, so the portable zip is a download only.`；`v0.2.15.zh-CN.md` 同位置新增 `### Windows 免安装包`：`Windows 同时提供 NSIS 安装包与免安装 `.zip`（解压即用，无安装步骤）。自动更新仍指向 NSIS 安装包，免安装 zip 只作为下载。`——句句对应。两文件均 **+4 / −0**（无删除行），H1 / 互链 / 概述 / 其余三节 / `## Upgrade` 逐字未动；用例 `announces the portable zip in both language notes` 正向断言两侧标题与句子、并对既有禁用词（`**Full Changelog**` / `releases/tag/` / 长 hex / 单位数字 / 「已发布」等）保持零命中 | 满足（见注②：原文本无 Windows 段落，落为同节新增三级小节） |
| ac-release-process-windows-assets | `docs/release-process.md:25` 由 `- **Windows**：NSIS `.exe` 安装包。` 改为 `- **Windows**：NSIS `.exe` 安装包 + 免安装 `.zip`（解压即用，无安装步骤）；`latest.yml` 只指向 `.exe`，zip 不进自动更新。`；`grep -rn "仅 NSIS" docs/ README.md README.zh-CN.md` 命中 0；该文件 `git diff` 只有 `@@ -22,7 +22,7 @@` 一处 hunk（1/1），其余段落未重写 | 满足 |
| ac-no-version-bump-and-frozen-surfaces | `package.json` 零 diff，`version` 仍 `0.2.15`；`latestPublishedTag = 'v0.2.14'` / `previousPublishedTag = 'v0.2.8'` / `publishedTags` 逐字未动；两版 README（第 5 行与下载表）、`CHANGELOG.md`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/release-notes/` 历史各版均在 `git diff --name-only` 中缺席；未建 tag / 未 push / 未 dispatch / 未对已公开 Release 做写操作 | 满足 |
| ac-gates-all-green | Host `code_gates` attempt 001：**11 门**全 passed / exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate`），证据落 `.munk/runs/run_intake_b5a72bf708df3c08/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (11 gates, attempt 001)"`；`pnpm test` 96 files / 1454 passed + 1 skipped（1455），28.57s；未加 `\|\| true`。`git diff --stat` 恰为 prd 指定的五处文件（`.github/workflows/release.yml`、`docs/release-notes/v0.2.15{,.zh-CN}.md`、`docs/release-process.md`、`electron-builder.yml`、`src/main/release-packaging.test.ts`），零额外路径 | 满足 |
| ac-implementation-constraints（横切） | 版本 / 资产名不在源码里写死；`release.yml` 全文仍无 `continue-on-error: true` / `\|\| true` / `--no-verify`，上传步骤不带 `if: always()`；新增 feed 步骤与 finalize 精确名断言均只读；`latest.yml` 不被污染**靠断言而非假定**（prd 明确要求，故本轮以 fail-closed 步骤落地，不写「electron-builder 一定不写 zip」的假定注释之外的分支）；所有读写只在本隔离 worktree 内 | 满足 |

断言未减证据：`grep -c 'it('` `259 → 277`（+18）；`grep -c 'expect('` `973 → 1044`（+71）；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0；既有用例只重定标一处（`win) required_exts=(exe)` → `(exe zip)`），无删除、无 `toBeTruthy()` 顶替、无注释掉断言。

## 新增用例清单（`describe('Windows portable zip release surface')`）

1. `builds both the NSIS installer and the portable zip for Windows` — 目标集合恰为 `['nsis','zip']`。
2. `derives both Windows artifact names from the version with no spaces` — 两条模板渲染 + 无空格。
3. `produces the portable zip from the built-in target with no extra script` — 打包步骤原文不含 zip、无 zip script、无新依赖、上传 glob 已含 `release/*.zip`。
4. `requires both Windows extensions in the packaging job` — `win) required_exts=(exe zip)` 与循环体保留。
5. `passes when the installer and the portable zip both carry the tag version` — 真跑 fixture，exit 0。
6. `fails closed when the NSIS installer is missing` — 真跑 fixture，非零 + `No .exe artifact found`。
7. `fails closed when the portable zip is missing` — 真跑 fixture，非零 + `No .zip artifact found`。
8. `keeps the Windows update feed on the NSIS installer as its own gate` — 独立步骤、`if` 条件、只读、步骤顺序（版本门 → feed 门 → 上传）。
9. `passes a latest.yml that only lists the installer` — 真跑 fixture，exit 0。
10. `fails closed when latest.yml lists the portable zip` — 真跑 fixture，非零 + 两条 `::error::` 文案。
11. `verifies both Windows assets by their exact published names` — `has_exact_asset` 与精确名循环。
12. `passes when both Windows assets are published under their exact names` — 真跑 fixture，exit 0。
13. `is not satisfied by the macOS zip when the Windows zip is missing` — 后缀匹配假绿的负向复现。
14. `fails closed when the Windows installer is missing` — 真跑 fixture，非零。
15. `keeps every pre-existing release gate` — 既有断言全保留。
16. `announces the portable zip in both language notes` — 双语发布说明正 / 负断言。

## 验证边界（本项不得越界宣称）

- 本机为 **darwin**，无法产出也无法验证 Windows 产物。真实的 `OpenCompare-<version>-win-x64.zip`、`OpenCompare-Setup-<version>.exe` 两资产、`latest.yml` 不含 zip、公开 Release 上两资产齐备，**均以今晚 23:00 窗口 `windows-latest` 的运行与 v0.2.15 公开 Release 为准**。
- 本 WI 交付说明与本文档都**不写「已验证 Windows 产物」**；本轮能证明的只有「配置 / 门禁脚本 / 断言」层面：目标矩阵正确、命名模板按 `${version}` 渲染、缺任一资产会非零退出、zip 污染 `latest.yml` 会非零退出、finalize 精确名核验能抓到「mac zip 顶替 win zip」这一假绿。
- 同理，`has_exact_asset` 的两条精确名依赖 `windows-latest` 上 `${arch}` 渲染为 `x64`；若将来改用 arm64 Windows runner，该断言会先红（这是期望行为，不是脆弱点，改架构时须同批改名字与断言）。

## 口径与陷阱注记

- **① `latest.yml` 的干净是「被断言守住」，不是「被 electron-builder 保证」**：zip target 是新增的，electron-builder 未来是否把它写进 `files[]` 不是本仓能控制的；本轮刻意加独立 fail-closed 步骤，而不是在注释里假定。这条断言只读、独立成步骤，与既有 `version` / `files[].url` 门并列而非替代——两者同时失效才算真的失守。
- **② 发布说明「Windows 段落」在本版并不存在**：`v0.2.15` 的两份 notes 原本只有三项同步改动、没有平台段，故「Windows 段落补一条」实际落为 `## What changed` / `## 本次变化` 内**新增一个三级小节**（`### Windows portable download` / `### Windows 免安装包`），而非改写既有段落。这不是对 AC 的放宽：句子层面中英逐句对应、两侧均 **+4 / −0**、其余段落零删除行。后续若要新增平台级条目，沿用「同节新增三级小节」比「改写概述句」更安全——概述句被既有用例按三项同步改动钉住。
- **③ 一个断言删了两次不是巧合**：`expect(step).toContain('win) required_exts=(exe)')` 是全测试文件里唯一需要改写的既有断言（prd 的 Implementation Constraints 已预告）；另一处删除是 `win?: { icon?: string; target?: string[] }` 类型补 `artifactName?: string`——即本轮测试面只有「重定标一处 + 类型放宽一处」，其余全为新增。
- **④ 后缀匹配是本域反复踩的假绿源头**：`finalize` 既有的 `for suffix in ... .zip ...` 循环会被 macOS 的 `-mac.zip` 满足，Windows zip 缺失时可静默通过。本轮用 fixture 显式复现了这个假绿（用例 13），并用精确名循环补位——**旧的后缀循环没有删除**（其它平台仍靠它），故「精确名」与「后缀」两套判定并存，读代码时不要以为后缀那条已经覆盖 Windows。
- **⑤ 本项只动发布面，测试全绿不等于产物正确**：`pnpm test` 只证明仓内配置与脚本按预期；Windows 真实解压即用、NSIS 安装与自动更新语义都必须在 23:00 的 CI / 公开 Release 上核。这条边界是 prd 的硬约束，也是本域历史上多次「门禁绿了但产物错」的教训所在。
