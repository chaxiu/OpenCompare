# macOS 签名公证与可复现 CI 打包发布

## 范围

- **mac 签名配置**：`electron-builder.yml` 的 `mac` 段启用 `hardenedRuntime`，声明 entitlements 文件（建议 `build/entitlements.mac.plist`，按 Electron 最小必要项：`com.apple.security.cs.allow-jit` / `allow-unsigned-executable-memory` / `disable-library-validation` 等），并启用 Developer ID Application 签名；证书经 `CSC_LINK` / `CSC_KEY_PASSWORD` 注入，仓库内不落证书明文。
- **公证配置**：启用 Apple notarization（electron-builder `notarize` 或等价 afterSign/@electron/notarize），凭据经 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`（或等价的 App Store Connect API Key）注入。
- **CI 接线**：`.github/workflows/release.yml` 的 mac 打包步骤（`pnpm exec electron-builder --mac --publish never`）接线上述 Secrets，使 macos-latest runner 产出签名 + 公证通过的 `dmg`/`zip`；CI 日志须出现 notarization 成功，且不再出现 `skipped macOS application code signing`。
- **fail-closed**：签名/公证凭据缺失时，mac 打包步骤必须显式失败并升级（明确报错 + 上报 Owner），**绝不**产出、上传或公开未签名裸包；不得以「跳过签名继续发版」作为默认/静默分支。
- **版本对齐闸**：发版前（建议置于 `gates` job 内）断言 `package.json#version` 与 tag 语义版本一致（去掉 `v` 前缀），且打包产物旁 `latest*.yml` 内 `version` 等于 tag；不一致即失败且不产出 Release。（现状 v0.1.1 包内仍为 `0.1.0`。）
- **每标签唯一干净 Release**：保持每个 tag 恰好一个公开（非 Draft）Release，资产名版本与 tag 一致，无重复/残留草稿。
- **可复现打包**：构建输入全锁定（`pnpm install --frozen-lockfile`、固定 pnpm/node 版本、Action 版本固定），打包与上传单点由 CI 驱动（`--publish never` + 汇聚上传），产物版本由 tag 单点推导；严禁以本地手工打包替代 CI。
- **凭据清单与协助文案**：产出待人类录入的证书/密钥清单（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 等），逐项说明用途、获取方式与录入位置（GitHub Secrets）；实际录入时机等公司就 Apple Developer Program 投入裁决后由 Planner 走标准协助机制发起。
- **配置断言单测**：扩展既有 `src/main/release-packaging.test.ts`，覆盖签名/公证接线、版本对齐、唯一 Release 断言，使缺失在 `pnpm test` 即暴露。

## 验收

- ac-builder-mac-signing: electron-builder mac 配置启用 `hardenedRuntime` 并声明 entitlements 文件与 Developer ID 签名（证书经 `CSC_LINK`/`CSC_KEY_PASSWORD` 注入，仓库无证书明文）。
- ac-builder-notarize: electron-builder/CI 配置启用 Apple 公证（notarize），证书与 App Store Connect 凭据经环境变量/Secrets 注入。
- ac-notarize-secrets-wired: `release.yml` mac 打包步骤接线 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`（或等价 App Store Connect API Key）Secrets。
- ac-ci-notarize-success: CI 日志出现 notarization 成功，且不再出现 `skipped macOS application code signing`。
- ac-fail-closed-no-unsigned: 签名/公证凭据缺失时 mac 打包步骤显式失败并升级，不产出、不上传、不公开未签名裸包（无静默降级分支）。
- ac-version-tag-aligned: 发版前置断言 `package.json#version` 与 tag（去 `v`）一致，且 `latest*.yml` 内 version 等于 tag；不一致时 CI 失败且不产出 Release。
- ac-single-public-release: 每个 tag 恰好一个公开（非 Draft）Release，无重复/残留草稿。
- ac-asset-version-match: Release 资产名中的版本与 tag 一致（如 `OpenCompare-<ver>-arm64.dmg`）。
- ac-reproducible-build: 打包在 CI 由锁定输入驱动（frozen lockfile + 固定 pnpm/node 与 Action 版本），同一 tag 重跑打包产出同名同版本产物，无本地手工打包路径。
- ac-credentials-checklist: 仓内存在待人类录入的凭据清单与协助文案，逐项说明 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 的用途与录入位置，并注明实际录入时机待 Apple Developer Program 裁决。
- ac-config-unit-tests: release 配置断言单测扩展覆盖签名/公证/版本对齐/唯一 Release 断言，`pnpm test` 通过。
- ac-no-regression: code-gates 全绿（install / lint / typecheck / build / build:web / test），打包目标与触发条件（`v*` tag）不变。

## 非目标

- 不做 Windows / Linux 的代码签名或公证。
- 不新增发布渠道（npm / Homebrew / Snap 等），不引入第三方发布工具。
- 不新增对比功能、不改 UI/视觉、不改 `appId` 与打包目标（dmg+zip / nsis / AppImage+deb）。
- 不做自动更新（auto-update）与发布密钥托管服务。
- 不由 AI 实际获取/录入证书或密钥；不在本地执行公证；不重打 tag、不手工公开历史草稿 Release。
- 不重构既有 release.yml「单点预建唯一 Release + 汇聚 `gh release upload` + finalize」模型，仅在其上接线签名公证与版本闸。
- 不追求 bit-identical 二进制可复现；本项只保证输入锁定与产物名/版本确定。
- 不做版本号自增、不自动打 tag。

## 实现约束

- 签名/公证凭据一律经 GitHub Secrets / 环境变量注入，严禁写入仓库或日志；本地与 CI 都不提交证书。
- **fail-closed 优先于继续发版**：缺凭据即失败并升级（`munk_report_owner`），绝不交付未签名裸包。
- 沿用既有 `electron-builder.yml` 结构，仅新增 mac 签名/公证所需字段，不重排既有配置；entitlements 文件放 `build/`（electron-builder 默认查找路径）。
- `release.yml` 保持 `v*` tag 触发、`gates` 先行与单点预建 + 汇聚上传 + finalize 流程；签名/公证 Secrets 只接到 mac 矩阵步骤。
- 版本对齐只做断言与失败，不改 version、不打 tag；沿用既有配置断言单测模式（`src/main/release-packaging.test.ts`，Node 环境，落在 `src/**/*.test.ts`）。
- 凭据清单/协助文案以仓内文档落盘（建议 `docs/release-signing.md`）。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test`；门禁命令须为单条 argv。
- 本项无窗口可点交互验收，跳过 UI 自测。
