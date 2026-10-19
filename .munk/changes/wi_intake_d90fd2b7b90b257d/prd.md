# release 签名/公证改用 App Store Connect API Key

## 范围

按公司负责人最新凭据裁决，改造 macOS 发布签名/公证的 CI 接线与配套文档/断言：

- `.github/workflows/release.yml` 的 mac 段 fail-closed 前置步与 `Build installers` 步骤改为读取 6 个 Secrets：`CSC_LINK`（.p12 base64）、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`（.p8 base64）、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`；任一缺失即非零退出，不产出未签名/未公证裸包。
- 公证走 App Store Connect API Key 模式（`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`），弃用 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`。
- `electron-builder.yml` mac 段显式钉住签名身份 `Developer ID Application: Tao Zhu (3X4J53U6RY)`；Team ID 为 `3X4J53U6RY`；`appId` 保持 OpenCompare 自有值（`com.opencompare.app`，不得套用 `sh.munk.app`）。
- 同步更新 `docs/release-signing.md`（6 项凭据清单 + API Key 模式说明 + 协助文案）、`README.md` 发布说明、`src/main/release-packaging.test.ts` 对应断言。

## 验收

- ac-api-key-secrets-wired: `release.yml` 的 mac fail-closed 步与 `Build installers` 步骤均接线且仅接线 6 个 Secrets（`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`），公证凭据以 API Key 三件套传入 electron-builder/@electron/notarize。
- ac-fail-closed-six: mac 前置步逐一检查 6 个 Secret，任一为空即输出 `::error::` 并以非零码退出；不存在缺凭据继续打包或静默跳过签名/公证的分支。
- ac-api-key-file-materialized: `APPLE_API_KEY` 的 base64 `.p8` 在打包前解码到仓库外临时文件（权限 600），`Build installers` 的 `APPLE_API_KEY` 环境变量指向该文件路径（electron-builder v26 / @electron/notarize 2.5 的 `notarytool --key` 需要路径），打包后可清理；日志不打印密钥内容。
- ac-legacy-credentials-removed: `release.yml` 不再读取/引用 `APPLE_ID` 与 `APPLE_APP_SPECIFIC_PASSWORD`，也不保留 Apple ID 公证回退路径。
- ac-identity-pinned: `electron-builder.yml` mac 配置显式声明签名身份 `Developer ID Application: Tao Zhu (3X4J53U6RY)`；文档注明 Team ID `3X4J53U6RY`。
- ac-appid-own: `electron-builder.yml` 的 `appId` 仍为 `com.opencompare.app`，仓库中不出现 `sh.munk.app`。
- ac-docs-checklist: `docs/release-signing.md` 含 6 项凭据清单（名称/用途/获取方式/形态）、API Key 模式说明（Developer 角色、.p8 仅可下载一次、Key ID / Issuer ID）与协助录入文案；发布冻结姿态不因本项解除。
- ac-readme-updated: `README.md` 构建/发布章节按 API Key 模式列明 6 个 Secrets 与 fail-closed 行为，且与文档口径一致。
- ac-config-tests: `src/main/release-packaging.test.ts` 断言覆盖 6 Secrets 接线、fail-closed、legacy 凭据不再接线、签名身份、`appId` 与 6 项文档清单；`pnpm test` 通过且测试不引入 Electron/DOM 依赖。
- ac-no-secret-leak: 仓库文件、工作流脚本、日志与 digest 中不含凭据值；代码只从 GitHub Secrets 读取，错误信息只列缺失 Secret 名。
- ac-gates-green: `code-gates.json` 全部门禁（install / lint / typecheck / build / build:web / test）通过。

## 非目标

- 不重打 tag、不在本项内重跑 CI、不手工公开历史 Release、不改发布冻结状态。
- 不改打包目标（mac dmg/zip、win nsis、linux AppImage/deb）、`appId`、触发条件（`v*` tag）；不改「单点预建唯一 Release + `gh release upload --clobber` + finalize 唯一公开 Release」模型。
- 不新增发布渠道、不引入新 Action、不改 Node/pnpm/Action 版本、不做 CI 缓存或其他顺手优化。
- 不做 Windows/Linux 签名或公证；不改应用代码、依赖版本或 electron-vite 构建脚本。
- 不由 AI 获取、录入或回显任何证书/密钥，不在本地执行公证；凭据实际录入仍由人类经 GitHub Secrets 完成。

## 实现约束

- 凭据只经 GitHub Secrets → 环境变量注入；严禁写入仓库、脚本、README、日志或 digest。`::error::` 只允许列出缺失的 Secret 名称。
- `APPLE_API_KEY` 以 `.p8` 的 base64 存放；工作流须在 `$RUNNER_TEMP` 解码为文件并把 `APPLE_API_KEY` 设为该路径，`APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 原样传入。
- `APPLE_TEAM_ID` 为 `3X4J53U6RY`；签名身份为 `Developer ID Application: Tao Zhu (3X4J53U6RY)`，在 `electron-builder.yml` 的 `mac.identity` 显式声明，避免 runner 上自动挑选错误证书。
- 沿用现有 `electron-builder.yml` 配置模式，只新增必需字段，不重排既有配置；`mac.notarize: true`、`hardenedRuntime`、entitlements 与打包目标保持不变。
- 测试沿用 Node 环境读取仓库根配置的方式（`node:fs` + `node:path`，不 import Electron），落在现有 `src/main/release-packaging.test.ts`。
- 文档与 README 保持既有发布冻结口径；只替换凭据模式相关内容，不新增文档体系。
