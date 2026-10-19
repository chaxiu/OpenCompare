# Changelog

OpenCompare 的版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/)。

## v0.1.2

首个按正式版路径发布的版本。macOS 构建经 **Developer ID 签名 + Apple 公证** 流程产出，由 CI 发布为每个 tag 唯一的公开 Release。

### 签名与公证

- macOS 产物启用 **Developer ID Application 签名**（`hardenedRuntime: true` + `build/entitlements.mac.plist`）与 **Apple 公证**，签名身份钉住 `Developer ID Application: Tao Zhu (3X4J53U6RY)`，`appId` 保持 `com.opencompare.app`。
- 公证走 **App Store Connect API Key 模式**：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 共 **6 项 GitHub Secrets**，任一缺失即 fail-closed，绝不产出、上传或公开未签名裸包。
- `APPLE_API_KEY` 的 `.p8` base64 只在打包前于 `$RUNNER_TEMP` 解码为权限 `600` 的仓库外临时文件（`notarytool --key` 需要文件路径），打包后清理，日志不打印密钥内容。

### 可复现打包与唯一公开 Release

- 打包在 CI 由锁定输入驱动（`pnpm install --frozen-lockfile` + 固定 pnpm / node 与 Action 版本），各平台仅本地打包（`--publish never`）。
- `gates` job 在矩阵启动前单点预建该 tag 的 Release（`--draft`），三平台产物经 `gh release upload --clobber` 汇聚上传到同一 Release，`finalize` 再公开。
- 每个 tag 断言恰好一个公开（非 Draft）Release，产物名与版本由 tag 单点推导。

### 版本 / tag 对齐闸

- 门禁先断言 tag 语义版本（去 `v` 前缀）等于 `package.json#version`，不一致即中止发布。
- 打包后断言各平台产物旁 `latest*.yml` 的 `version` 等于 tag。
</content>
