# macOS 签名与公证：待人类录入凭据清单

OpenCompare 的 macOS 构建（`dmg` / `zip`）需要 **Developer ID Application 签名** 与 **Apple 公证（Notarization）**，否则 Gatekeeper 会拦截、无法作为合规正式版分发。相关配置已接线，但**凭据必须由人类录入**，AI 不获取、不录入、不在本地执行公证。缺凭据时 CI 显式失败（fail-closed），**绝不产出、上传或公开未签名裸包**。

> **当前状态：发布冻结。** 已发布 Release（`v0.1.0` / `v0.1.1`）均为 **Pre-release**，macOS 包未签名、未公证，不作为可下载正式版提供；在签名 + 公证跑通前**不得打入新 Tag、不得 publish 新 Release**。
>
> **解冻路径：** 公司 Apple Developer 账户已就位，人类可协助登录与录入。Developer ID 证书与 App Store Connect API Key **只进 Host 密钥库 / GitHub CI Secrets**，禁止写入仓库、构建脚本或日志；`release.yml` 按标准协助机制待人类录入后即可产出签名 + 公证通过的包，验证通过后再解除冻结、发布**唯一**正式版 Release。

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
- `APPLE_TEAM_ID` 为 `3X4J53U6RY`；`electron-builder.yml` 的 `mac.identity` 已显式钉住 **Developer ID Application: Tao Zhu (3X4J53U6RY)**，避免共享 runner 上自动选中错误证书。`appId` 保持 OpenCompare 自有值 `com.opencompare.app`。
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
> 录入完成后，推送 `v*` 标签（`package.json#version` 需与 tag 一致）即由 CI 产出签名 + 公证通过的 macOS 包；在此之前发布保持冻结，不打新 Tag、不 publish、不宣称正式版可用。

## 三、冻结期的发布姿态（已落实）

- 存量 Release `v0.1.1`、`v0.1.0` 已置为 **Pre-release** 并在说明中标注 macOS 包未签名、未公证，仓库对外不再有公开的正式版（Latest）。
- README 顶部与「构建与打包 / 发布流程」章节已标注当前未签名、未公证且发布冻结。
- 如需再次核对/重执行：
  ```bash
  gh release list --repo chaxiu/OpenCompare
  gh release edit <tag> --repo chaxiu/OpenCompare --prerelease --latest=false
  ```
- 凭据录入并完成正式发版后，再移除此冻结标注并解除 Pre-release。
