# Windows 免安装 zip 与 NSIS 安装包同批发布（v0.2.15）

## Scope

在 `package.json#version=0.2.15`（不 bump）的前提下，让 Windows 侧除 NSIS 安装包外同时产出**解压即用**的免安装 zip，并把「发布资产矩阵 / 门禁断言 / v0.2.15 双语发布说明 / 资产口径文档」同批对齐，使今晚 23:00 窗口在 v0.2.15 的真实 Release 上能核到两个 Windows 资产。

改动面（只这五处）：

1. `electron-builder.yml`：`win.target` 同时含 `nsis` 与 `zip`；两者 `artifactName` 显式带 `${version}` 且无空格。
2. `.github/workflows/release.yml`：Windows 资产矩阵与核验重定标（两资产必须齐、缺一 fail-closed），既有唯一 Release / 非 draft / 双语 body / `latest*.yml` url 命中断言一条不删不弱化。
3. `src/main/release-packaging.test.ts`：新增上述断言的测试，版本一律从 `package.json#version` 派生，每条可独立变红。
4. `docs/release-notes/v0.2.15.md` 与 `v0.2.15.zh-CN.md`：Windows 段落补一条免安装 zip 口径，中英逐句对齐。
5. `docs/release-process.md`：写死「Windows 仅 NSIS `.exe`」的资产口径句改为 exe + 免安装 zip。

## Acceptance Criteria

- ac-win-target-has-nsis-and-zip: 解析 `electron-builder.yml` 后，`win.target` 数组同时包含 `nsis` 与 `zip`（两者都在，且不引入第三种 win 目标）。
- ac-win-artifact-names-versioned: `nsis.artifactName` 与 win 级 `artifactName` 都包含 `${version}` 且都不含空格；以 `productName=OpenCompare`、`version=package.json#version`、`arch=x64` 渲染，分别得到 `OpenCompare-Setup-<version>.exe` 与 `OpenCompare-<version>-win-x64.zip`。
- ac-zip-is-portable-unpacked: zip 走 electron-builder 内建 `zip` target（解压即用目录形态），仓库未新增打包脚本、未新增依赖（`package.json` 的 dependencies/devDependencies/scripts 无改动），zip 产物无安装步骤。
- ac-win-missing-asset-fail-closed: `release.yml` 中 win 分支的必需扩展名同时为 `exe` 与 `zip`；用临时 fixture 跑该 step 的脚本，缺 `.exe` 或缺 `.zip` 任一即非零退出并打印 `::error::`，两者齐备才返回 0。
- ac-latest-yml-not-polluted-by-zip: `release.yml` 中存在 win 侧 fail-closed 断言：`release/latest.yml` 的 `files[]` 出现 `.zip` 条目即非零退出；用 fixture（干净 latest.yml → 0，被 zip 污染 → 非零）可复现。auto-update 语义不变，仍只指向 NSIS 安装包。
- ac-finalize-asserts-exact-win-names: finalize 的公开资产断言按 Windows **精确名**核验（`OpenCompare-Setup-<version>.exe` 与 `OpenCompare-<version>-win-x64.zip` 均在公开 Release 资产名集合内），缺任一非零退出；不使用仅按后缀 `.zip` 匹配的弱判定（mac zip 会满足后缀匹配）。
- ac-existing-release-gates-kept: 既有断言全部保留且未弱化——该 tag 恰好一个公开正式 Release、非 draft、非 prerelease、`latest*.yml` 的 `files[].url` 命中 Release 资产名、已发布 body 双语（英文全文 + 一行 `---` + 中文折叠段 + 两版版本号一致）、该 tag 为最新公开 Release。
- ac-test-version-derived: `src/main/release-packaging.test.ts` 新增断言中的版本/资产名一律由 `currentVersion` / `currentTag` 派生，源码中不出现 `0.2.15` 字面量。
- ac-notes-windows-portable-bilingual: `docs/release-notes/v0.2.15.md` 与 `v0.2.15.zh-CN.md` 的 Windows 段落都新增「Windows 免安装 zip（解压即用）与 NSIS 安装包同时提供」这一条，中英逐句对应；两文件其余段落、版本号、互链不变。
- ac-release-process-windows-assets: `docs/release-process.md` 的 Windows 资产句改为 `.exe` 安装包 + 免安装 `.zip`（解压即用），全文件不再残留「Windows 仅 NSIS `.exe`」口径；其余段落不重写。
- ac-no-version-bump-and-frozen-surfaces: `package.json#version` 仍为 `0.2.15`；`latestPublishedTag` 常量、两版 README 第 5 行与下载表、`CHANGELOG` 历史段、`docs/release-evidence/**`、已公开 tag / Release / 资产均未改动。
- ac-gates-all-green: `.munk/code-gates.json` 全量门全部通过；`git diff --stat` 只落在上述五处文件。

## Non-Goals

- 不 bump `package.json#version`，不改 `CHANGELOG` 历史段，不改 `latestPublishedTag` 锚点。
- 不动两版 README 第 5 行与下载表。
- 不动 `docs/release-evidence/**`；不改 `docs/release-signing.md` 中「v0.2.x 已发布…11 件资产」的历史陈述（那是已发生的事实，改写即造假）。
- 不改同步 / 对比算法与四态语义，不改导出格式，不改 `latest*.yml` 的 auto-update 语义。
- 不建 tag、不 push、不 dispatch、不上传产物；不动已公开 tag / Release / 资产。
- 不引入新依赖（复用 electron-builder 既有 zip target），不新增打包脚本。
- 不为凑绿放宽门禁或删除既有断言。

## Implementation Constraints

- **命名**：`nsis.artifactName` 保持 `'${productName}-Setup-${version}.${ext}'`（现行口径，`latest.yml` 的 `files[].url` 依赖它）；win 级 `artifactName` 用 `'${productName}-${version}-win-${arch}.${ext}'`，由 `nsis.artifactName` 覆盖安装包命名，zip 渲染为 `OpenCompare-<version>-win-x64.zip`。`${arch}` 在 win runner（`windows-latest`）上为 `x64`。
- **不要给 zip 单开 shell 打包步骤**：`release` job 的 `Build installers` 已是 `electron-builder --win --publish never`，`win.target` 加 `zip` 即产出；上传 glob 已含 `release/*.zip`，无需新增上传逻辑。
- **`latest.yml` 不被污染靠断言而非假定**：不假设 electron-builder 一定不把 zip 写进 `files[]`，必须在 `release.yml` 里显式 fail-closed；该断言与既有 `latest*.yml` 版本/url 门禁同批、不互相替代。
- **finalize 精确名而非后缀**：现有 `for suffix in ... .zip ...` 循环会被 mac 的 `-mac.zip` 满足，Windows zip 缺失无法被它抓到；Windows 两资产必须按精确名核验。
- **既有测试需同步**：`release-packaging.test.ts` 中 `expect(step).toContain('win) required_exts=(exe)')` 需随 `(exe zip)` 一起重定标。
- **测试写法**：沿用本文件既有模式——workflow 脚本用 `mkdtempSync` + `spawnSync('bash', ...)` 跑 fixture 复现 fail-closed；静态断言用 `packageStep()` / `finalizeStep()` 取 step body；版本从 `currentVersion` / `currentTag` 派生。
- **发布说明措辞**：中英逐句对应，英文句如「Windows ships both the NSIS installer and a portable `.zip` (extract and run, no installation step).」，中文句如「Windows 同时提供 NSIS 安装包与免安装 `.zip`（解压即用，无安装步骤）。」；不得新增 `已发布` / `已修复` / `releases/tag/` / `**Full Changelog**` / 40+ 位十六进制串（既有测试禁用项）。
- **验证边界**：本机（darwin）无法验证 Windows 产物。真实 zip 产出、资产名与公开 Release 上的两资产，以今晚 23:00 窗口 `windows-latest` 与 v0.2.15 公开 Release 为准；交付说明必须明写这一点，不得写「已验证 Windows 产物」。
