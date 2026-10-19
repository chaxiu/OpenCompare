# v0.1.2 正式版发版必需改动（版本 bump + Release Notes + 文档口径收敛）

## 范围

公司负责人已批准 v0.1.2 正式版发布路径（发版解冻）。本项只做发版必需改动：

1. **版本 bump**：`package.json` 的 `version` 由 `0.1.0` 改为 `0.1.2`。`release.yml` 的 tag↔`package.json#version` 对齐闸已存在，二者必须一致，否则 tag 触发的发布在 gates 阶段即中止。`release.yml` 本身不改。
2. **新增 CHANGELOG.md**：作为 Release Notes 草案，创建 `v0.1.2` 条目，覆盖：
   - macOS **Developer ID 签名 + Apple 公证**，公证走 **App Store Connect API Key 模式**（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 共 6 项 Secrets，缺失即 fail-closed）；
   - **可复现打包**与**唯一公开 Release**（单 Release 预建 + 各平台 `--publish never` 汇聚上传 + exactly-one 断言）；
   - **版本/tag 对齐闸**（tag 语义版本 = `package.json#version`，且打包产物 `latest*.yml#version` = tag）。
3. **文档口径更新**：`README.md` 与 `docs/release-signing.md` 更新为 App Store Connect API Key 模式口径与 v0.1.2 正式版说明；此前「未签名/未公证、发版冻结」的过时警示收敛。
4. **同步测试断言**：若上述版本/文档变更影响 `src/main/release-packaging.test.ts` 中的断言（如仍断言文档含「发布冻结」），同步更新，使 `pnpm test` 与新的正式版口径一致。

## 验收

- ac-version-bump: `package.json#version` 为 `0.1.2`
- ac-changelog-v012: 新增 `CHANGELOG.md`，含 `v0.1.2` 条目，覆盖 Developer ID 签名 + Apple 公证（App Store Connect API Key 模式、6 项 Secrets fail-closed）、可复现打包与唯一公开 Release、版本/tag 对齐闸
- ac-docs-api-key: `README.md` 与 `docs/release-signing.md` 已更新为 API Key 模式口径与 v0.1.2 正式版说明
- ac-freeze-warning-converged: 此前「未签名/未公证、发版冻结」的过时警示已收敛；措辞以「正式版经签名+公证流程产出」为准，不预先宣称尚未由 CI 验证的公证结果
- ac-test-synced: `src/main/release-packaging.test.ts` 断言随文档变更同步（冻结期断言改为正式版口径），`pnpm test` 通过
- ac-no-scope-creep: 未改打包目标 / appId / 触发条件 / 发布模型，未新增依赖，未动 `@core`，无功能改动
- ac-code-gates-green: `.munk/code-gates.json` 全部 gate（install / lint / typecheck / build / build-web / test）通过

## 非目标

- 不修改 `release.yml`（对齐闸、fail-closed、单 Release 逻辑均已就位，保持原样）。
- 不改打包目标（mac dmg/zip、win nsis、linux AppImage/deb）、`appId`（`com.opencompare.app`）、`mac.identity`、触发条件（`push tags v*`）与发布模型（`publish: github / release`）。
- 不新增依赖，不改 `electron-builder.yml` / entitlements。
- 不动 `src/core/`，不做任何功能/UI 改动。
- 不录入、不触碰任何真实凭据；不在仓库、脚本或日志写明文密钥。
- 不执行打 Tag / publish Release / 公证等发布动作（属发布验收环节，非本项）。

## 实现约束

- 文档措辞实证边界：不得预先宣称尚未由 CI 验证的公证结果；统一以「正式版经签名+公证流程产出」口径描述，实证交给发布验收（tag 触发 CI 跑通签名+公证并产出唯一公开 Release）。
- `CHANGELOG.md` 只需覆盖 `v0.1.2` 条目，不追溯补写历史版本（可按需保留极简说明）。
- `docs/release-signing.md` 第三节「冻结期的发布姿态（已落实）」需改写为解冻后的正式版口径；第二节人类录入协助流程可保留（API Key 模式口径不变）。
- 变更若触及测试断言，须保持测试与文档/版本一致，不得为过测试而弱化对签名/公证接线的断言（6 项 Secrets、fail-closed、App Store Connect API Key 模式、唯一公开 Release、版本对齐闸等断言应保留）。
