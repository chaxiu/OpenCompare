# v0.2.2 已发布：状态口径翻转 + 公开产物取证

## 范围

背景事实（只读，已核实，不在本项重复取证两次）：v0.2.2 已于 2026-10-21 20:48+08:00 公开发布；Release 为 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`（`draft=false` / `prerelease=false`，11 个资产）；annotated tag 对象 `00c109fe3b19c67574bbb8470fda2fb50b49c6f8` 指向 commit `ff13dcd8c102876e62bb668cde966cf8a7a88995`；CI Run `39601974960` 全绿；dmg 资产 digest 为 `sha256:7c7232b9c02431c36d98a6b367436697ab379e9ef8c97e30c59b29e57eaa6ae8`；mac 产物已 Developer ID 签名 + Apple 公证（`stapler validate` 通过、`spctl` accepted / Notarized Developer ID）。

本项只做四件事：

1. **README 发布状态翻为已发布**：`README.md` 第 5 行（首屏状态 blockquote）由「v0.2.2 待发布；当前可下载的最新公开 Release 为 v0.2.1」翻为「v0.2.2 已发布」并链接 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`；保留 v0.2.2 发布说明链接（`docs/release-notes/v0.2.2.md`）与既有 6 项凭据 / fail-closed / 签名公证说明文字，不再出现「最新公开 Release 为 [v0.2.1]」的过期指针。
2. **签名文档状态行同步**：`docs/release-signing.md` 第 5 行状态行由「v0.2.2 待发布（发布路径已就绪）」改为已发布口径；「正式版发布姿态（v0.2.2）」标题与其余章节内容不动。
3. **既有发布测试断言反转**：`src/main/release-packaging.test.ts` 中 `ac-readme-status-pending` 相关断言（含「`${currentTag} 待发布`」、`最新公开 Release 为 [v0.2.1](...)`、`not.toContain('${currentTag} 已发布')`）反转为已发布态，并新增签名文档状态行断言；`currentTag` 仍全部由 `package.json#version` 派生，测试源码禁止新增 `0.2.2` / `v0.2.2` 版本字面量。
4. **新增 v0.2.2 本机取证证据 + 测试覆盖**：新建 `docs/release-evidence/v0.2.2.md`（`status: verified`），记录对**公开 Release 下载产物**（dmg 与 zip 两个）的本机取证原始命令与输出；并扩展 `src/main/release-evidence.test.ts` 覆盖该文件（沿用现有只读 Markdown 解析、verified 分支标记计数与双 sha256 校验），v0.2.1 现有断言保持不变。

## 验收

- ac-readme-published: `README.md` 第 5 行同时满足：含 `当前发布状态：v0.2.2 已发布`、含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`、含 `docs/release-notes/v0.2.2.md`，且不含 `v0.2.2 待发布`、不含 `最新公开 Release 为 [v0.2.1]`。
- ac-readme-signing-text-kept: `README.md` 第 5 行仍含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与全部 6 个 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）。
- ac-signing-doc-status: `docs/release-signing.md` 含 `当前状态：v0.2.2 已发布` 且不含 `v0.2.2 待发布`；含 `正式版发布姿态（v0.2.2）`；除该状态行外第一～六节文本内容不发生变化（6 项 Secret 表、v0.1.2 漂移记录、补发用法、打包后硬校验段落逐字保留）。
- ac-packaging-test-inverted: `src/main/release-packaging.test.ts` 中 README 姿态用例改为断言 `readme` 含 `` `当前发布状态：${currentTag} 已发布` `` 与 `` `releases/tag/${currentTag}` ``，并断言 `readme` 不含 `` `${currentTag} 待发布` ``；「最新公开 Release 为 [v0.2.1]」断言反转为 `not.toContain`。
- ac-packaging-test-signing-line: 同一测试文件新增/同步断言 `signingDoc` 含 `` `当前状态：${currentTag} 已发布` `` 且不含 `` `${currentTag} 待发布` ``。
- ac-packaging-test-no-version-literal: `src/main/release-packaging.test.ts` 源码不含 `0.2.2` / `v0.2.2` 字面量，`currentTag` 仍由 `package.json#version` 派生（`expect(currentTag).toBe(`v${pkg.version}`)` 保留）。
- ac-evidence-v022-status: `docs/release-evidence/v0.2.2.md` 存在、非空、正文含 `v0.2.2`，且恰有一行 `status: verified`（若产物或凭据在本机不可得，则写 `status: blocked` 并上报，不得写任何通过标记或伪造 SHA-256）。
- ac-evidence-v022-signature-markers: 证据文件对 **dmg 内** 与 **zip 内** 两个 `OpenCompare.app` 分别记录 `codesign --verify --deep --strict --verbose=2`、`xcrun stapler validate`、`spctl -a -vv --type execute` 的原始输出，全文包含 `valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID` 各不少于 2 处。
- ac-evidence-v022-digests: 证据文件记录 dmg 与 zip 两个不同产物的 64 位小写 SHA-256（`shasum -a 256` 输出），其中 dmg 的值等于 `7c7232b9c02431c36d98a6b367436697ab379e9ef8c97e30c59b29e57eaa6ae8`（与 GitHub asset digest 对账一致），zip 的值等于 `2f0a2e0fb00cacaa442ffa4796c47afc3e438555a8641dc8234aa3f608b12f34`。
- ac-evidence-v022-commands: 证据文件含 `gh release view v0.2.2 --repo chaxiu/OpenCompare`、`shasum -a 256`、`ditto -x -k`、`hdiutil attach -nobrowse -readonly`、`hdiutil detach`、`codesign -dv --verbose=4` 的命令文本，并记录取证机器（`sw_vers` / `uname -m`）、带时区的取证时间、仓库外临时目录路径。
- ac-evidence-v022-bundle-identity: 证据文件记录两个 `.app` 的 `CFBundleShortVersionString=0.2.2`、`CFBundleIconFile` 值、`Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、hardened runtime 标志（`flags=...runtime`），以及包内 `<CFBundleIconFile>.icns` 的 64 位 SHA-256；且该 icns SHA-256 与仓库 `build/icon.icns` 的值不相同（品牌图标而非 Electron 默认图标）。
- ac-evidence-test-covered: `src/main/release-evidence.test.ts` 对 `docs/release-evidence/v0.2.2.md` 走与 v0.2.1 相同的只读解析路径：文件存在且非空、含版本号、`status` 为 `verified`/`blocked` 之一、verified 分支通过标记计数与「至少两个不同 sha256」校验；v0.2.1 的既有用例与断言文本不修改，且测试仍不联网、不下载、不挂载任何产物。
- ac-no-source-or-release-change: `git diff --stat` 只涉及 `README.md`、`docs/release-signing.md`、`docs/release-evidence/v0.2.2.md`、`src/main/release-packaging.test.ts`、`src/main/release-evidence.test.ts`；`src/` 业务代码、`.github/workflows/`、`electron-builder.yml`、`package.json` 依赖与 `docs/release-evidence/v0.2.1.md` 无改动，未创建/移动/删除任何 tag 或 Release 资产。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全部退出码 0。

## 非目标

- 不改任何 `src/` 业务代码、UI、算法或平台能力。
- 不改 `release.yml` / 任何 workflow、发布模型、`electron-builder.yml`、版本号、依赖（不新增 devDependency）。
- 不创建、移动、删除、重打任何 tag；不改写任何历史 Release 与资产（含 v0.2.1 / v0.1.2）。
- 不重新打包、不在本机重跑签名或公证；证据只来自公开 Release 的既有产物。
- 不改 v0.2.1 证据文件的 `status: blocked` 历史结论。
- 不做功能改动、不做浏览器/实机 UI 验收、不开 UI 自测。
- 不在仓库内保留任何下载产物（下载必须落到仓库外临时目录）。

## 实现约束

- README 沿用既有「单段 blockquote」样式（`> ✅ **当前发布状态：…**`），只替换状态口径与 Release 链接，签名 / 公证 / 凭据 / fail-closed 说明文字逐字保留。
- 签名文档只改第 5 行状态行；标题「正式版发布姿态（v0.2.2）」、6 项 Secret 表、v0.1.2 漂移记录、补发用法、打包后硬校验段落不得改动。
- 测试源码一切版本相关字符串一律走 `` `${currentTag}` `` 模板，禁止新增当前版本字面量（`0.2.2` / `v0.2.2`）；`v0.2.1` 作为上一发布版本的字面量可保留在既有断言中。
- `release-evidence.test.ts` 复用同一解析函数：把证据路径/版本号参数化即可，不要为 v0.2.2 复制一套逻辑；v0.2.1 的 describe 原样保留。
- 取证命令一律只读：`gh release view` / `gh release download`、`shasum -a 256`、`ditto -x -k`、`hdiutil attach -nobrowse -readonly`、`codesign --verify`/`-dv`、`xcrun stapler validate`、`spctl -a -vv --type execute`、`PlistBuddy`；结束时 `hdiutil detach`，临时目录在仓库外（如 `mktemp -d`）。
- 证据文件必须写原始输出而不是结论摘要；任一产物或凭据不可得则落 `status: blocked` 并通过 `munk_report_owner` 上报，绝不臆造通过标记。
