# macOS 签名与公证：待人类录入凭据清单

OpenCompare 的 macOS 构建（`dmg` / `zip`）需要 **Developer ID Application 签名** 与 **Apple 公证（Notarization）**，否则 Gatekeeper 会拦截、无法作为合规正式版分发。相关配置已接线，但**凭据必须由人类录入**，AI 不获取、不录入、不在本地执行公证。缺凭据时 CI 显式失败（fail-closed），**绝不产出、上传或公开未签名裸包**。

> **当前状态：v0.2.3 待发布。** 公司 Apple Developer 账户已就位，签名与公证链路已在 `electron-builder.yml` / CI 中接线。正式版 macOS 安装包经 **Developer ID 签名 + Apple 公证** 流程产出，由 tag 触发的 CI 发布为每个版本唯一的公开 Release；若 tag 已推送但 Release 未完成，可用 `workflow_dispatch` 补发（见第五节）。签名 + 公证的实际结果以那次 CI 为准。
>
> **凭据录入：** Developer ID 证书与 App Store Connect API Key 由人类按标准协助机制录入 **GitHub CI Secrets**（只进 Secrets，禁止写入仓库、构建脚本或日志）；6 项 Secret 齐备后推送 `v*` 标签即可由 CI 产出签名 + 公证的包。

## 一、凭据清单

所有凭据均录入 **GitHub 仓库 Secrets**（仓库 → Settings → Secrets and variables → Actions → New repository secret），**严禁**写入仓库、构建脚本或日志。

| Secret 名 | 用途 | 获取方式 | 形态 |
| --- | --- | --- | --- |
| `CSC_LINK` | electron-builder 读取 Developer ID Application 证书用于签名 | Apple Developer 门户创建 **Developer ID Application** 证书；将证书 + 私钥从钥匙串导出为 `.p12`，再 Base64 编码（`base64 -i cert.p12 \| pbcopy`） | Base64 的单行字符串（或可下载 URL） |
| `CSC_KEY_PASSWORD` | 解锁上述 `.p12` 的导出密码 | 导出 `.p12` 时设置的密码 | 字符串 |
| `APPLE_TEAM_ID` | 开发者团队 ID（本仓库为 `3X4J53U6RY`） | Apple Developer 门户 → Membership 页 | 10 位字符串 |
| `APPLE_API_KEY` | App Store Connect API Key，供公证读取；CI 将其解码为 `$RUNNER_TEMP` 下权限 `600` 的 `.p8` 文件后，`APPLE_API_KEY` 环境变量指向该路径（`notarytool --key` 需要文件路径） | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys；生成 Developer 角色的 Key，下载 `.p8`（**仅可下载一次**），再 Base64 编码（`base64 -i AuthKey_<KEY_ID>.p8 \| pbcopy`） | Base64 的 `.p8` 单行字符串 |
| `APPLE_API_KEY_ID` | 标识上述 API Key | 与 `.p8` 同一下载页展示的 **Key ID** | 10 位字符串 |
| `APPLE_API_ISSUER` | 标识所属 App Store Connect 团队 | 同一 Integrations 页面顶部的 **Issuer ID** | UUID 形态字符串 |

前置条件：需要 **Apple Developer Program** 有效会员（付费），并在门户内创建 **Developer ID Application** 证书。**公司 Apple Developer 账户已就位**，人类可协助登录与录入。

### 说明

- 公证走 **App Store Connect API Key 模式**：`APPLE_API_KEY`（`.p8` base64）+ `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` 三件套替代 Apple ID + App 专用密码。Team Key 需具备 Developer 角色即可提交公证；`.p8` 私钥**仅可下载一次**，请妥善保存后录入 Secret（丢失需重新生成 Key）。
- `APPLE_TEAM_ID` 为 `3X4J53U6RY`；`electron-builder.yml` 的 `mac.identity` 钉住 **Tao Zhu (3X4J53U6RY)**。不要带 `Developer ID Application:` 前缀，electron-builder 会按这个证书类型自己选择，避免共享 runner 上选中别的证书。`appId` 保持 OpenCompare 自有值 `com.opencompare.app`。
- `electron-builder.yml` 已声明 `hardenedRuntime: true` + `build/entitlements.mac.plist`（JIT / 未签名可执行内存 / 关闭库校验），`mac.notarize: true` 由 electron-builder / `@electron/notarize` 调用 `notarytool` 完成公证。
- `release.yml` 在 mac 打包前逐一检查上述 6 个 Secret 是否齐备；任一缺失即以 `::error::` 列出缺失项并 `exit 1`（fail-closed），不产出/上传产物。`APPLE_API_KEY` 只在 `$RUNNER_TEMP` 解码为权限 `600` 的临时 `.p8`，打包后删除，日志不打印密钥内容。

## 二、待人类执行的录入（协助文案）

> **请为仓库 `chaxiu/OpenCompare` 录入 macOS 签名与公证凭据（GitHub Secrets）。** 公司 Apple Developer 账户已就位，请按标准协助机制完成：
>
> 1. 在 Apple Developer 门户创建 **Developer ID Application** 证书，连同私钥导出为 `.p12`；在 App Store Connect → Users and Access → Integrations → App Store Connect API 生成 Developer 角色的 Team Key，并下载 `.p8`（仅可下载一次），记下 **Key ID** 与 **Issuer ID**；
> 2. 打开仓库 **Settings → Secrets and variables → Actions**；
> 3. 新增 6 个 **Repository secret**：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`（含义见上表）；
> 4. `CSC_LINK` 填 Developer ID Application 证书 `.p12` 的 Base64 单行字符串；`CSC_KEY_PASSWORD` 填该 `.p12` 的导出密码；`APPLE_API_KEY` 填 `.p8` 的 Base64 单行字符串；`APPLE_TEAM_ID` 填 `3X4J53U6RY`；
> 5. 录入完成后请回复「已录入」，无需回传任何密钥内容；
> 6. **请勿**把证书/密码/`.p8` 粘贴进对话、Issue、README 或任何仓库文件。
>
> 录入完成后，推送 `v*` 标签（`package.json#version` 需与 tag 一致）即由 CI 产出签名 + 公证的 macOS 包，并发布为该版本唯一的公开 Release。

## 三、正式版发布姿态（v0.2.3）

- 发布已解冻：正式版经 **Developer ID 签名 + Apple 公证** 流程产出，由 `v*` tag 触发的 CI 发布为每个版本唯一的公开 Release（详见 `README.md` 的「发布流程」）。v0.2.0 从未公开发布，v0.2.1 以修正后的发布门测试首发，用户可见变化与 v0.2.0 相同。
- 签名 + 公证由 CI 执行，实际结果以 tag 触发的那次 CI 为准；凭据齐备前 mac 打包步骤 fail-closed，不会产出未签名裸包。6 项 Secret 清单与录入方式见上文第一节。
- 本版发布说明见 `docs/release-notes/v0.2.3.md`。
- 如需查看 Release：
  ```bash
  gh release list --repo chaxiu/OpenCompare
  ```

## 四、v0.1.2 漂移记录（只读事实，不改写历史）

- 本地 annotated tag `v0.1.2` 的 tag 对象为 `c4a6a95`，指向 commit `7ea2cc6`，该 commit 是 `main` / `origin/main` 的祖先；远端 `v0.1.2` 是轻量 tag，指向 commit `bb0c0b1`，该 commit 不在 `v0.2.0`（`285ee28`）的祖先链上（`v0.1.2..HEAD`=29，`HEAD..v0.1.2`=2）。两条仅远端 tag 可达提交（`bb0c0b1` / `b2c4e51`）经 `git cherry HEAD` 判定均为 `-`：补丁已等价存在于 `HEAD`，零内容丢失。漂移的实质是 tag 之后的修复没有进入已发布资产。
- 规划基线时 `main` 领先 `v0.1.2` 13 个提交（含签名 / 打包修复），这些提交未进入已发布的 v0.1.2 资产；13 只是规划基线快照，实际领先数以打 tag 时的 `main` 为准。
- 远端 `v0.1.2` Release 为公开、非预发布，共 11 个资产：`latest-linux.yml`、`latest-mac.yml`、`latest.yml`、`OpenCompare-0.1.2-arm64-mac.zip(.blockmap)`、`OpenCompare-0.1.2-arm64.dmg(.blockmap)`、`OpenCompare-0.1.2.AppImage`、`OpenCompare.Setup.0.1.2.exe(.blockmap)`、`opencompare_0.1.2_amd64.deb`。
- **不删除、不移动、不重打、不替换** `v0.1.2` 的 tag 与资产；tag 之后的修复由 v0.2.3 承接。后续如需修订只能发布更高版本，不改写历史。

## 五、祖先门语义与补发入口（不改 tag）

`release.yml` 的祖先门不再要求 `v0.1.2` 必须是 `HEAD` 的严格祖先，而是「**严格祖先** 或 **逐提交补丁等价**」：

- 先打印 `v0.1.2` 的 ref 类型与解析到的 commit SHA：`git cat-file -t` 返回 `commit` 即轻量 tag，返回 `tag` 即 annotated tag。
- `v0.1.2..HEAD` 提交数必须非零：发布必须携带 tag 之后的修复。
- 当 `v0.1.2` 不是严格祖先时，逐条列出仅 tag 可达提交，对每个提交执行 `git cherry HEAD <sha>`，日志打印完整 SHA 与判定符号（`-` 等价 / `+` 不等价）。
- 任一条为 `+`、无法枚举仅 tag 可达提交、或无法完成 `git cherry` 判定时，门以 `::error::` + 非零退出（fail-closed），后续质量门禁、打包矩阵与 finalize 均不运行。
- 仅 tag 可达提交的 diff 若删除发布关键路径（`.github/workflows/`、`build/`、`electron-builder.yml`、`package.json`），即使 `git cherry` 判为 `-` 也非零退出。
- 祖先门只做只读 git 查询，不创建、移动、删除任何 tag / ref，不 push，也不调用 `gh release` 写操作。

**补发用法（不改 tag、不升版本）**：`v0.2.3` tag 已推送但 Release 未完成时，从 `main` 手动触发 `Release` 工作流的 `workflow_dispatch`，输入已存在的 `tag`（默认 `v0.2.3`）。构建阶段显式 checkout `refs/tags/<tag>`，gates、打包矩阵与 finalize 原样复用同一套门与发布模型；push `v*` 行为不变。

## 六、打包后硬校验（CI，上传前）

`release.yml` 在 mac 打包后、上传前对**实际产出的 `OpenCompare.app`** 做硬校验，任一项失败即终止（`::error::` + `exit 1`）、不上传，绝不降级上传未签名 / 未公证包：

1. **图标与版本身份**：定位 `release/**/OpenCompare.app`（不写死架构目录）；`Contents/Info.plist` 的 `CFBundleIconFile` 非空且非 `electron.icns`，对应 `Contents/Resources/<icon>.icns` 存在、非空且以 `icns` 为文件头；runner 上能定位 Electron 自带 `electron.icns` 时断言二者 SHA-256 不同；`Contents/Resources/icon.png` 与仓库 `build/icon.png` 的 SHA-256 相同；`CFBundleIdentifier` 为 `com.opencompare.app`，`CFBundleShortVersionString` 等于 tag 版本（去 `v`）。
2. **签名与公证**（同一 `.app`）：
   ```bash
   codesign --verify --deep --strict --verbose=2 OpenCompare.app
   codesign -dv --verbose=4 OpenCompare.app
   xcrun stapler validate OpenCompare.app
   spctl -a -vv --type execute OpenCompare.app
   ```
   `codesign -dv` 必须含 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY` 与 hardened runtime 标志 `runtime`，且不含 `Signature=adhoc`。若打包输出里的 `.app` 未直接 staple，则从同次产出的 `release/*.dmg` 挂载并校验其中同一个 `OpenCompare.app`（失败路径也保证 `hdiutil detach`）；两者均失败才算失败。`spctl` 必须返回 0 且输出含 `accepted` 与 `Notarized Developer ID`。
3. **产物名与 `latest*.yml`**：各平台必需产物（mac `.dmg` / `.zip`、win `.exe`、linux `.AppImage` / `.deb`）的文件名只能携带 tag 版本；`latest*.yml` 的 `version`、`files[].url` 与存在的 `path` 也必须含 tag 版本。
4. **唯一公开正式 Release**：`finalize` 后用 `gh api --paginate` 统计该 tag 的 Release，要求恰好 1 个且 `draft=false`、`prerelease=false`；该 Release 资产必须覆盖 `.dmg`、`.zip`、`.exe`、`.AppImage`、`.deb` 与 `latest-mac.yml` / `latest.yml` / `latest-linux.yml`，版本化资产名均含 tag 版本。

上述校验步骤与上传步骤没有 `continue-on-error` / `|| true` 等绕行路径；6 项 Secret 仍由人类录入，缺失即 fail-closed。
