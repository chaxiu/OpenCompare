# 发版流水线加固：图标 / 版本断言、签名公证硬校验与唯一公开 Release

## 范围

在既有发布模型（`gates` 单点预建唯一 draft Release → 三平台矩阵 `electron-builder --<target> --publish never` → 汇聚 `gh release upload --clobber` → `finalize` `--draft=false --latest`）完全不变的前提下，只加固 CI 的「打包后硬校验」，并把断言锁进 `release-packaging` 单测：

1. **macOS `.app` 图标与版本身份断言**（打包后、上传前）：
   - 在打包输出中定位真实 `OpenCompare.app`（不写死架构目录）；找不到即失败。
   - 从该 `.app/Contents/Info.plist` 读 `CFBundleIconFile`，要求非空且不是 Electron 默认名；对应图标资源（无扩展名时补 `.icns`）存在、非空、文件头为 `icns`。
   - 当 runner 上可定位 Electron 分发自带的 `electron.icns` 时，断言打包图标与其 SHA-256 不同（即不是 Electron 默认图标）。
   - `Contents/Resources/icon.png`（`extraResources` 产物）与仓库 `build/icon.png` 的 SHA-256 相同。
   - `CFBundleIdentifier` 为 `com.opencompare.app`，`CFBundleShortVersionString` 与 tag 版本（去 `v`）相等。
2. **macOS 签名 / 公证硬校验**（同一 `.app`，上传前）：
   - `codesign --verify --deep --strict --verbose=2` 退出 0。
   - `codesign -dv --verbose=4` 输出含 `Authority=Developer ID Application` 与 `TeamIdentifier=3X4J53U6RY`，且不含 `Signature=adhoc`；同时含 hardened runtime 标志（`runtime`）。
   - `xcrun stapler validate` 通过：优先校验打包输出里的 `.app`；若该 `.app` 未直接 staple，则从同次产出的 `release/*.dmg` 挂载并校验其中的同一 `OpenCompare.app`，两者均失败才算失败。
   - `spctl -a -vv --type execute` 退出 0，合并输出含 `accepted` 与 `Notarized Developer ID`。
   - 任一命令失败立即 `::error::` + `exit 1`，后续上传步骤不执行。
3. **全平台产物名与 `latest*.yml` 版本断言**（强化现有步骤，不替换）：
   - 各平台必需扩展名的产物至少各一份，且文件名含 tag 版本；同扩展名的所有产物都不得含其它版本号（防止旧版本残留被上传）。
   - 保留现有 `latest*.yml` 的 `version` 断言，并追加：每个 `latest*.yml` 的 `files[].url` 与存在时的 `path` 也含 tag 版本；空目录守卫保留。
4. **`finalize` 后唯一公开正式 Release 断言**（强化现有步骤）：
   - 用 `gh api --paginate` 取全部分页，断言该 tag 的 Release 恰好 1 个，且 `draft=false`、`prerelease=false`；否则报错退出。
   - 断言该 Release 资产非空，且覆盖 `.dmg`、`.zip`、`.exe`、`.AppImage`、`.deb` 与三份 `latest*.yml`；版本化资产名含 tag 版本。
5. **凭据缺失 fail-closed 保持并显式化**：6 项 Secret 的齐备检查仍在打包之前，缺失时 `::error::` 列出缺失项并 `exit 1`；新增断言确保后续校验步骤与上传步骤没有 `continue-on-error` / `if: always()` 等绕行路径，绝不产出或上传未签名/未公证包。
6. **断言与文档同步**：扩展 `src/main/release-packaging.test.ts`（只增不改）覆盖上述 CI 配置与顺序；在 `docs/release-signing.md` 增加「打包后硬校验」小节，`README.md` 发布流程补一句对应说明。

## 验收

- ac-app-located: mac 矩阵在打包后有步骤定位 `OpenCompare.app`（`release/mac*/OpenCompare.app` 或等价 glob）；找不到时输出 `::error::` 并 `exit 1`。
- ac-plist-icon-file: 断言 `Contents/Info.plist` 的 `CFBundleIconFile` 非空、非 `electron.icns`；为空或为默认名时 `::error::` + `exit 1`。
- ac-icon-resource-exists: 断言 `Contents/Resources/<CFBundleIconFile>`（无扩展名时补 `.icns`）存在、字节数 > 0、前 4 字节为 `icns`；否则失败退出。
- ac-icon-not-electron-default: 当 `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` 等 Electron 默认图标可定位时，断言打包图标 SHA-256 与之不同；不可定位时该比较跳过但「非 `electron.icns` 名」断言仍生效。
- ac-app-resource-png-matches: 断言 `Contents/Resources/icon.png` 的 SHA-256 与仓库 `build/icon.png` 相同；不同即失败退出。
- ac-app-bundle-identity: 断言 `CFBundleIdentifier == com.opencompare.app`、`CFBundleShortVersionString == ${GITHUB_REF_NAME#v}`；任一不等即失败退出。
- ac-codesign-verify-deep-strict: 对上述 `.app` 执行 `codesign --verify --deep --strict --verbose=2`；非零退出即 `::error::` + `exit 1`。
- ac-codesign-developer-id: `codesign -dv --verbose=4` 输出含 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY` 与 hardened runtime 标志 `runtime`，且不含 `Signature=adhoc`；任一不满足即失败退出。
- ac-stapler-validate: `.app` 的 `xcrun stapler validate` 退出 0；未被直接 staple 时从 `release/*.dmg` 挂载并对其中的 `OpenCompare.app` 校验成功；两者皆失败即 `::error::` + `exit 1`，且挂载在失败路径也会 detach。
- ac-spctl-notarized: 对同一 `.app` 执行 `spctl -a -vv --type execute`，退出 0 且合并输出含 `accepted` 与 `Notarized Developer ID`；否则失败退出。
- ac-checks-before-upload: 上述图标 / 证书 / 公证 / 产物名 / `latest*.yml` 校验步骤都出现在 `Upload installers to the tag's release` 之前；`release.yml` 全文不含 `continue-on-error: true`、`|| true`、`--no-verify`，上传步骤不带 `if: always()`。
- ac-credentials-before-build: 6 项 Secret 齐备检查步骤索引早于 `Build installers`；缺失时错误信息含缺失 Secret 名与 `docs/release-signing.md`，并以非零码退出。
- ac-artifact-names-versioned: mac 至少有 `.dmg` 与 `.zip`、win 至少有 `.exe`、linux 至少有 `.AppImage` 与 `.deb` 的产物，文件名均含 `${GITHUB_REF_NAME#v}`；同扩展名出现不含该版本的文件时断言失败。
- ac-latest-metadata-urls: 保留既有 `latest*.yml` 的 `version == tag` 断言与空目录守卫，并断言每个文件的 `files[].url`（及存在时的 `path`）含 tag 版本；任一不符即失败退出。
- ac-finalize-single-public: `finalize` 用 `gh api --paginate` 统计该 tag 的 Release，断言 count == 1、draft 数 == 0、prerelease 数 == 0；否则 `::error::` + `exit 1`。
- ac-finalize-assets-complete: 断言该 Release 资产数 > 0，且至少各一份 `.dmg`、`.zip`、`.exe`、`.AppImage`、`.deb`、`latest-mac.yml`、`latest.yml`、`latest-linux.yml`；版本化资产名含 tag 版本，否则失败退出。
- ac-tests-cover-mac-checks: `release-packaging.test.ts` 新增断言覆盖 `.app` 定位、`CFBundleIconFile`、`icns` 资源、非 Electron 默认、`icon.png` 同源、bundle 身份与版本，以及 `codesign` / `stapler` / `spctl` 三条命令与失败退出。
- ac-tests-cover-artifacts-and-release: 新增断言覆盖全平台产物名版本、`latest*.yml` 的 url/path 版本、`finalize` 分页唯一性（`--paginate`、`draft`、`prerelease`）与资产完整性。
- ac-tests-order-fail-closed: 新增断言覆盖步骤顺序（凭据检查 → 打包 → 图标/版本 → 签名/公证 → 上传）与无 `continue-on-error` / `|| true` 降级路径；既有 fail-closed 断言（六项 Secret、`::error::`、`exit 1`）保持不变。
- ac-tests-preserve-existing: `release-packaging.test.ts` 既有用例一条未删、未放宽（发布模型、`--publish never`、预建唯一 draft、`--clobber`、`finalize --draft=false --latest`、六 Secrets 集合、版本闸、漂移事实、图标与关于断言全保留），`pnpm test` 全绿。
- ac-docs-hard-verification: `docs/release-signing.md` 新增「打包后硬校验」小节，明确列出 `codesign --verify --deep --strict`、`xcrun stapler validate`、`spctl -a -vv` 三条命令、失败即终止且不上传，以及唯一公开正式 Release 断言；`README.md` 发布流程包含对应一句说明；六项 Secret 清单与 v0.1.2 漂移记录原样保留。
- ac-ci-model-unchanged: `electron-builder.yml` 无功能性改动（`appId` 仍 `com.opencompare.app`、`productName` 仍 `OpenCompare`、`mac.identity`、`hardenedRuntime`、`notarize: true`、三平台 targets、`publish` 段不变）；`release.yml` 仍为 `v*` tag 触发、`gates` 先行、`--publish never`、单点预建 draft、`finalize --draft=false --latest`。
- ac-secrets-set-unchanged: workflow 引用的 Secrets 集合仍为 6 项签名公证 Secrets + `GITHUB_TOKEN`，不新增、不改名、不读取凭据值。
- ac-no-remote-writes-added: 本项不新增 `git tag` / `git push` / `gh release create|edit|upload|delete` 调用（既有预建/上传/公开步骤保持原样），不执行任何远端写操作，不创建或公开 Release。
- ac-gates-green: 不新增依赖，`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:web` 全部通过。

## 非目标

- 不做 `local-evidence`：不在本机对已发布 dmg/zip 执行 `codesign` / `stapler` / `spctl` 取证，不生成 `docs/release-evidence/v0.2.0.md`，不下载或解包任何 Release 资产。
- 不执行打 tag、`git push`、`npm publish`、`gh release` 写操作，不运行真实 Release 工作流；CI 的首次真实生效以人打 tag 为准。
- 不改 `electron-builder.yml` 的功能性配置：`appId`、`productName`、`mac.identity`、`hardenedRuntime`、entitlements、`notarize`、三平台 targets、`publish` 段一律不动；不改签名身份或 Team ID。
- 不新增、轮换或录入任何 Secret；不读取、打印凭据内容；SN 仍由人类录入，缺失即 fail-closed。
- 不对 `.dmg` / `.zip` 自身追加独立的公证 / staple 校验（只校验 `.app`；dmg 仅作为 `.app` 未直接 staple 时的取证来源）。
- 不把 Windows Authenticode / Linux 包签名纳入本项；不为 win/linux 增加签名硬校验。
- 不改 `gates` 的版本 / v0.1.2 祖先 preflight、不改版本号、不改 CHANGELOG / Release Notes / README 发布状态段、不动 v0.1.2 tag 与资产。
- 不改应用代码 `src/**`（除 `release-packaging.test.ts`）、UI、图标资产、对比算法；不做视觉改版。
- 不新增运行时/开发依赖，不新建独立发布脚本框架或本地打包入口；校验以现有 inline step 风格落地。
- 不把真实 mac 打包验收、桌面点选、`needSelfTest` 纳入本项（保持 false）。

## 实现约束

- 改动面限定为：`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`、`docs/release-signing.md`、`README.md`（发布流程一行）。不新建 `scripts/` 目录、不抽独立校验程序，避免与 workflow 文本断言双份漂移。
- mac 专属步骤统一 `if: matrix.target == 'mac'`；步骤顺序固定：六项 Secret 检查 → `.p8` 物化 → `Build installers` → `.app` 图标/版本身份断言 → 签名/公证校验 → 产物名与 `latest*.yml` 断言 → `Upload installers`。
- 使用 GitHub Actions 默认 `bash -e` 并在需要捕获输出的段落用 `set -uo pipefail`；每条硬校验失败都是 `echo "::error::<实际值>"` + `exit 1`；禁止 `|| true`、`continue-on-error`、`if: always()` 于上传路径。
- 版本一律取 `${GITHUB_REF_NAME#v}`，不在 workflow 中写死 `0.2.0`；测试侧继续用 `package.json#version` 交叉断言。
- `.app` 定位用 glob / `find release -maxdepth 2 -name 'OpenCompare.app'`，不写死 `mac-arm64`；dmg 回退用 `hdiutil attach -nobrowse -readonly`，失败路径也保证 `hdiutil detach`。
- Info.plist 读取用 `/usr/libexec/PlistBuddy -c 'Print :<Key>'` 或 `plutil -extract <Key> raw`；字符串比较用 `grep -F` / 字面量比较，失败时打印实际值便于诊断。
- `finalize` 的唯一性统计必须带 `--paginate`（现有 `?per_page=100` 单页取法不足）；资产完整性通过该 Release 的 assets 接口或 `gh release view --json assets` 断言，不下载资产内容。
- 测试只用 `node:fs` / `node:path` / `yaml` 读取仓库文本，静态断言 workflow 与文档；不 import Electron、不触碰网络、不新增执行型命令；既有用例逐条保留。
- 本节不替代正式技术方案；具体 shell 写法由 Coding 在以上边界内决定。
