# 本机 v0.2.0 dmg/zip 签名公证取证与证据落盘

## 范围

只做一件事：在**当前 macOS 机器**上对 **tag `v0.2.0` 对应的唯一公开正式 Release** 里的真实 macOS 安装包做签名 / 公证 / Gatekeeper 取证，并把可复核证据写入 `docs/release-evidence/v0.2.0.md`。

1. **只读就绪门**（先做，任何一步不满足即进入 blocked 分支，不得继续取证）：
   - `git ls-remote --tags origin refs/tags/v0.2.0` 能解析到 tag，且 tag 提交上的 `package.json#version` 为 `0.2.0`（只读方式获取，如 `gh api repos/chaxiu/OpenCompare/contents/package.json?ref=v0.2.0`）。
   - `gh release view v0.2.0 --repo chaxiu/OpenCompare --json tagName,isDraft,isPrerelease,url,assets` 显示该 tag 恰好一个 Release，`isDraft=false`、`isPrerelease=false`。
   - 该 Release 含可下载的 macOS 产物：`OpenCompare-0.2.0-arm64.dmg`、`OpenCompare-0.2.0-arm64-mac.zip`，以及 `latest-mac.yml`、`latest.yml`（同名资产以 Release 实际列表为准，但文件名必须含 `0.2.0`）。
   - 就绪门只读：不创建、不移动、不删除 tag；不创建、不编辑、不公开、不上传 Release 资产。
2. **下载真实产物**：把 dmg / zip / `latest-mac.yml` / `latest.yml` 下载到仓库外的临时目录（如 `"$TMPDIR/opencompare-v0.2.0-evidence"`），记录绝对路径、下载时间、来源 URL。产物二进制不入库。
3. **记录 SHA-256**：对 dmg 与 zip 各跑 `shasum -a 256`，记录 64 位小写十六进制值与字节数。
4. **两条独立解包路径**：
   - zip：`ditto -x -k <zip> <解包目录>`，定位其内 `OpenCompare.app`。
   - dmg：`hdiutil attach -nobrowse -readonly -mountpoint <挂载点> <dmg>`，定位挂载卷内 `OpenCompare.app`；结束时（含失败路径）必须 `hdiutil detach` 并记录输出。
5. **对两个 `OpenCompare.app` 分别执行并记录原始输出**：
   - `codesign --verify --deep --strict --verbose=2 <app>`
   - `codesign -dv --verbose=4 <app>`
   - `xcrun stapler validate <app>`
   - `spctl -a -vv --type execute <app>`
6. **记录签名身份与图标事实**：
   - `codesign -dv --verbose=4` 的 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、hardened runtime `(runtime)`，且不含 `Signature=adhoc`。
   - `Contents/Info.plist` 的 `CFBundleIconFile`（非空、非 `electron.icns`）、对应 `Contents/Resources/<icon>.icns` 的实际路径与 SHA-256、`Contents/Resources/icon.png` 与仓库 `build/icon.png` 的 SHA-256、`CFBundleIdentifier`、`CFBundleShortVersionString`。
7. **版本一致性核对**：下载产物文件名、`latest-mac.yml` / `latest.yml` 的 `version` 与 `files[].url`、`CFBundleShortVersionString`、tag 均为 `0.2.0` / `v0.2.0`。
8. **落盘证据**：`docs/release-evidence/v0.2.0.md` 写明机器与系统版本（`sw_vers`、`uname -m`）、取证时间（ISO 8601 带时区）、就绪门原始输出、产物表、每条命令的工作目录与目标路径、原始 stdout/stderr、期望标记与实测结论的对照。
9. **blocked 分支**：就绪门任一条件不满足时，**立即停手并升级**。证据文档写成 `status: blocked`，只记录探查命令、原始输出、缺失项与需要人做的事（打 tag / 触发 CI / 下载产物），不得写入任何“通过”输出或 sha256，不得用本地 `release/` 目录、本地打包或未签名产物替代。

## 验收

- ac-evidence-doc-exists: `docs/release-evidence/v0.2.0.md` 存在、非空，标题含 `v0.2.0`，且含 `status:` 字段，取值为 `verified` 或 `blocked`。
- ac-readiness-readonly: 文档记录 `git ls-remote --tags origin refs/tags/v0.2.0` 与 `gh release view v0.2.0 ...` 的原始输出；本 WI 的改动路径中不含任何 tag / Release / 上传动作产生的远端变化（`git tag --list v0.2.0` 在本机仍非本 WI 创建）。
- ac-artifact-provenance: `status: verified` 时，文档记录 dmg 与 zip 的 Release 资产名、下载 URL、下载到仓库外的本地绝对路径与下载时间，且全文不以仓库 `release/` 本地构建目录或本地打包产物作为证据来源。
- ac-sha256-recorded: `status: verified` 时，dmg 与 zip 各自记录 `shasum -a 256` 的 64 位小写十六进制值与字节数，且与文档中产物文件名一一对应。
- ac-codesign-verify-both: `status: verified` 时，zip 解包（`ditto -x -k`）与 dmg 挂载（`hdiutil attach -nobrowse -readonly`）得到的两个 `OpenCompare.app` 都记录了 `codesign --verify --deep --strict --verbose=2` 原始输出，且每份输出含 `valid on disk` 与 `satisfies its Designated Requirement`。
- ac-stapler-both: `status: verified` 时，两个 app 的 `xcrun stapler validate` 原始输出都含 `The validate action worked!`。
- ac-spctl-both: `status: verified` 时，两个 app 的 `spctl -a -vv --type execute` 原始输出都含 `accepted` 与 `source=Notarized Developer ID`，且退出码为 0。
- ac-signing-identity: `status: verified` 时，文档记录 `codesign -dv --verbose=4` 中的 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、`flags=...(runtime)`，且该输出不含 `Signature=adhoc`。
- ac-icon-facts: `status: verified` 时，文档记录 `CFBundleIconFile`（非空且非 `electron.icns`）、`Contents/Resources` 下对应 icns 的实际路径与 SHA-256、`Contents/Resources/icon.png` 与仓库 `build/icon.png` 的 SHA-256 相同。
- ac-version-consistency: `status: verified` 时，dmg / zip 文件名、`latest-mac.yml` 与 `latest.yml` 的 `version` 及 `files[].url`、`CFBundleShortVersionString` 均为 `0.2.0`，且 Release 的 `tagName` 为 `v0.2.0`。
- ac-dmg-detached: dmg 取证结束后记录 `hdiutil detach` 命令与输出，且文档记录取证后无残留挂载点。
- ac-blocked-no-fabrication: `status: blocked` 时，文档只含就绪门命令与原始输出、缺失项、待人工动作与升级说明，不含任何 `valid on disk` / `The validate action worked!` / `source=Notarized Developer ID` 的“通过”记录、不含产物 sha256，也不出现本地打包或仓库 `release/` 产物；同时已向 Owner 升级等待产物。
- ac-doc-assertion: `pnpm test` 中的只读文档断言覆盖该证据文件：文件缺失、`status` 非 `verified`/`blocked`、`verified` 分支缺少任一必需标记（两处 `valid on disk`、两处 `The validate action worked!`、两处 `accepted` + `source=Notarized Developer ID`、两个 sha256）或 `blocked` 分支出现通过标记时测试失败。
- ac-no-artifacts-committed: 本 WI 的改动文件只有证据 Markdown（及只读断言测试），dmg / zip / `.app` / 解包目录等产物不进入 git 变更。

## 非目标

- 不打 tag、不 push、不 publish、不创建 / 编辑 / 公开 / 上传 Release 资产；这些都是人与 Host 的动作。
- 不在本机重新打包、签名、公证；不修改 `release.yml`、`electron-builder.yml`、entitlements 或签名文档。
- 不重复 `release-hardening` 的 CI 断言，不修改 CI 步骤或其测试锁定文本。
- 不删除、不移动、不重打、不替换 `v0.1.2`（或任何历史）tag 与资产。
- 不改产品 UI / 会话 / 对比算法 / 版本号（`package.json` 已是 `0.2.0`），不跑 self-test、浏览器或真机点选。
- 不把 dmg / zip / `.app` 或解包中间产物入库，不记录任何证书、密码、`.p8`、Secret 内容。
- 产物不可得时不以未签名 / 未公证 / 本地构建产物充数，不臆造命令输出。

## 实现约束

- 证据文档结构与分支一致性应能被现有 vitest 只读断言消费（可扩展 `src/main/release-packaging.test.ts` 或同目录新增只读断言），断言只读文件内容，不执行下载、打包、签名、公证或任何 git 写操作。
- 就绪门和取证全部为只读命令；唯一的本地写操作是下载到仓库外临时目录、解包 / 挂载到临时目录、以及写入 `docs/release-evidence/v0.2.0.md`。
- 所有命令按可直接复制重放的形态记录（含工作目录、目标绝对路径、完整参数）；原始输出保持原文，不删改失败部分。
- 时间统一记录为带时区的 ISO 8601；机器信息记录 `sw_vers -productVersion` 与 `uname -m`。
- blocked 分支是合法结果而非失败：先写 blocked 证据记录，再通过 Owner 升级等待 tag / Release / 产物就绪，不得跳过或降级。
