# Domain: release

打包分发与 GitHub 开源发布：electron-builder 跨平台打包目标、macOS Developer ID 签名 + Apple 公证、`v*` tag 触发的门禁前置 CI、版本对齐闸、GitHub Release 唯一公开可见，以及仓库门面（README / LICENSE）、签名凭据清单与发布配置断言单测。本域不含应用业务功能与视觉基线。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts，`electron-builder` 为 devDependency。
- **macOS 签名与公证**：`electron-builder.yml` 的 `mac` 段启用 `hardenedRuntime: true`、声明 `entitlements` / `entitlementsInherit: build/entitlements.mac.plist`（Electron 最小必要项：`allow-jit` / `allow-unsigned-executable-memory` / `disable-library-validation`）与 `notarize: true`，并显式钉住签名身份 `identity: 'Developer ID Application: Tao Zhu (3X4J53U6RY)'`；Developer ID Application 证书经 `CSC_LINK` / `CSC_KEY_PASSWORD` 注入，公证走 **App Store Connect API Key 模式**（`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`），`APPLE_TEAM_ID` 为 `3X4J53U6RY`，`appId` 保持 `com.opencompare.app`；仓内不落证书/密钥明文。
- **签名凭据 fail-closed**：`release.yml` mac 矩阵步骤在打包前逐一检查 6 个签名/公证 Secret（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）齐备，任一缺失即 `::error::` 列出缺失项并非零退出，绝不产出、上传或公开未签名裸包；无「跳过签名继续发版」的静默降级分支。
- **API Key 物化**：`APPLE_API_KEY` 以 `.p8` base64 存放，`release.yml` 在打包前于 `$RUNNER_TEMP` 解码为权限 `600` 的仓库外临时文件，`Build installers` 步骤的 `APPLE_API_KEY` 指向该路径（electron-builder v26 / `@electron/notarize` 2.5 的 `notarytool --key` 需路径），打包后清理，日志不打印密钥内容。
- **版本对齐闸**：`release.yml` 门禁 job 断言 `package.json#version` 等于 tag 语义版本（去 `v` 前缀）；各平台在打包后断言产物旁 `latest*.yml` 内 `version` 等于 tag；不一致即失败且不产出 Release。
- **每标签唯一公开 Release**：`finalize` job 后新增断言，检查每个 tag 恰好一个公开（非 Draft）Release，存在重复/残留草稿即失败；资产名版本与 tag 一致。
- **可复现打包**：锁定输入（`pnpm install --frozen-lockfile`、固定 pnpm/node 与 Action 版本），打包与上传单点由 CI 驱动（`--publish never` + 汇聚上传），产物版本由 tag 单点推导；无本地手工打包路径。
- **凭据清单与协助文案**：`docs/release-signing.md` 列出待人类录入的 6 项 GitHub Secrets 清单（名称/用途/获取方式/形态）、App Store Connect API Key 模式说明（Developer 角色、`.p8` 仅可下载一次、Key ID / Issuer ID）与协助录入文案；凭据一律经 GitHub Secrets / 环境变量注入，严禁写入仓库或日志。
- **发布元数据（Linux `.deb` 前置）**：`package.json` 的 `author`（对象且含非空 `email`）、`license`、`homepage`；`electron-builder.yml` `linux.maintainer` 显式含 email。
- **发布目标**：`electron-builder.yml` 声明 `publish: { provider: github, releaseType: release }`；实际发布改由 release.yml 单点预建 + `gh release upload` 完成（矩阵 `--publish never`），最终 Release 为公开（非 Draft）。
- **发布工作流**：`.github/workflows/release.yml` 监听 `v*` tag，门禁 job（install `--frozen-lockfile` / lint / typecheck / test / build）先行。门禁末尾**单点预建该 tag 的唯一 Release**（`gh release create ... --draft --generate-notes`，注入 `GH_TOKEN`/`GH_REPO` 并显式带 `--repo`；若已存在则清理同名重复只留一个），随后 mac/win/linux 三平台矩阵 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，再用 `gh release upload "${GITHUB_REF_NAME}" <三端全部产物> --clobber --repo` 汇聚上传到该唯一 Release；`finalize` job `gh release edit "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest` 正式公开。Release 唯一性以 tag 为准，杜绝并发建单竞态。
- **发版版本单点**：`package.json#version` 为发版的唯一版本来源（当前 `0.1.2`），tag 语义版本与打包产物 `latest*.yml#version` 均须与其对齐，二者由 `release.yml` 对齐闸断言。
- **Release Notes 草案**：根目录 `CHANGELOG.md`（Keep a Changelog / SemVer 口径）记录版本条目；`v0.1.2` 条目覆盖 Developer ID 签名 + App Store Connect API Key 公证（6 项 Secrets fail-closed）、可复现打包与唯一公开 Release、版本/tag 对齐闸。
- **正式版文档口径**：`README.md` 与 `docs/release-signing.md` 以「正式版经签名 + 公证流程产出」描述发版姿态（v0.1.2 已解冻），不再保留「未签名/未公证、发布冻结、不得打 Tag」的过时警示；公证实际结果以 tag 触发的那次 CI 为准，不预先宣称未经验证的公证结果。
- **仓库门面**：根目录 `README.md`（定位、核心能力、本地开发与构建打包）与 `LICENSE`（MIT 全文）。
- **发布配置断言单测**：Node 环境下读取仓库根配置做断言（`src/main/release-packaging.test.ts`，`node:fs` + `node:path`，不 import Electron），让缺失字段在 `pnpm test` 失败而非 tag 触发的 CI 才暴露。

## 验收

- **ac-pkg-metadata**：`package.json` 的 `author` 为对象且含非空 `email`，`license` 为 `MIT`，`homepage` 指向 `https://github.com/chaxiu/OpenCompare`。
- **ac-deb-maintainer**：`electron-builder.yml` 的 `linux.maintainer` 显式设置且含 email；electron-builder 不再因缺少 author email / maintainer 而在构建 `.deb` 时报错。
- **ac-linux-targets-kept**：`linux.target` 仍为 `AppImage` 与 `deb` 两项（未通过删除 `deb` 规避失败）。
- **ac-publish-release**：`electron-builder.yml` 声明 `publish.provider: github` 与 `releaseType: release`；据此（或 release.yml 的预建唯一 Release + `gh release upload` + finalize 收尾步骤）打 `v*` tag 后产出的 Release 不再停留在 Draft。
- **ac-release-workflow**：`.github/workflows/release.yml` 仍为 `v*` tag 触发、`gates` 先行；发布路径可保证 Release 对仓库外可见，且每个 tag 恰好一个 Release。
- **ac-single-precreate**：`gates` Job 在矩阵启动前存在单点预建唯一 Release 的步骤，带 `GH_TOKEN` 与 `GH_REPO`，使用 `gh release create ... --draft --generate-notes`（不存在时才创建；存在重复同名 Release 时清理多余、只留一个）。
- **ac-no-concurrent-publish**：`release` 矩阵中 `electron-builder` 参数为 `--publish never`，不再有 `--publish always`；打包产物仅落到本地 `release/`。
- **ac-upload-clobber**：`release` 矩阵在打包后有 `gh release upload "${GITHUB_REF_NAME}" ... --clobber --repo "${GITHUB_REPOSITORY}"` 步骤，汇聚上传三端安装包与元数据（dmg/zip/exe/AppImage/deb/blockmap/latest*.yml），且能在 windows runner 的默认 shell 下正常运行。
- **ac-finalize-repo**：`finalize` Job 的 `gh release edit` 命令带 `--repo "${GITHUB_REPOSITORY}"`，并注入 `GH_REPO`，`--draft=false --latest` 保持；不存在 `fatal: not a git repository` 的前置依赖。
- **ac-unit-assertions**：`src/main/release-packaging.test.ts` 断言覆盖预建唯一 Release、`--publish never` + `gh release upload --clobber`、`finalize` 带 `--repo`；旧断言若与新流程冲突已随之更新。
- **ac-config-tests**：release 配置断言单测覆盖元数据 / 打包目标 / 发布配置三组、6 Secrets 接线、fail-closed、legacy 凭据不再接线、签名身份、`appId` 与 6 项文档清单，由 `pnpm test` 执行并通过且不引入 Electron/DOM 依赖。
- **ac-builder**：`electron-builder` 已配置并可解析出 macOS / Windows / Linux 目标（配置存在于 `package.json` 或 `electron-builder.yml`）。
- **ac-readme**：根目录 `README.md` 覆盖定位、核心能力清单与本地开发 / 构建打包说明。
- **ac-license**：根目录 `LICENSE` 为 MIT 许可全文。
- **ac-builder-mac-signing**：electron-builder mac 配置启用 `hardenedRuntime` 并声明 entitlements 文件与 Developer ID 签名（证书经 `CSC_LINK`/`CSC_KEY_PASSWORD` 注入，仓库无证书明文）。
- **ac-builder-notarize**：electron-builder/CI 配置启用 Apple 公证（notarize），证书与 App Store Connect 凭据经环境变量/Secrets 注入。
- **ac-api-key-secrets-wired**：`release.yml` 的 mac fail-closed 步与 `Build installers` 步骤均接线且仅接线 6 个 Secrets（`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`），公证凭据以 API Key 三件套传入 electron-builder/@electron/notarize。
- **ac-fail-closed-six**：mac 前置步逐一检查 6 个 Secret，任一为空即输出 `::error::` 并以非零码退出；不存在缺凭据继续打包或静默跳过签名/公证的分支。
- **ac-api-key-file-materialized**：`APPLE_API_KEY` 的 base64 `.p8` 在打包前解码到仓库外临时文件（权限 600），`Build installers` 的 `APPLE_API_KEY` 环境变量指向该文件路径（`notarytool --key` 需要路径），打包后可清理；日志不打印密钥内容。
- **ac-legacy-credentials-removed**：`release.yml` 不再读取/引用 `APPLE_ID` 与 `APPLE_APP_SPECIFIC_PASSWORD`，也不保留 Apple ID 公证回退路径。
- **ac-identity-pinned**：`electron-builder.yml` mac 配置显式声明签名身份 `Developer ID Application: Tao Zhu (3X4J53U6RY)`；文档注明 Team ID `3X4J53U6RY`。
- **ac-appid-own**：`electron-builder.yml` 的 `appId` 仍为 `com.opencompare.app`，仓库中不出现 `sh.munk.app`。
- **ac-ci-notarize-success**：CI 日志出现 notarization 成功，且不再出现 `skipped macOS application code signing`。
- **ac-fail-closed-no-unsigned**：签名/公证凭据缺失时 mac 打包步骤显式失败并升级，不产出、不上传、不公开未签名裸包（无静默降级分支）。
- **ac-version-tag-aligned**：发版前置断言 `package.json#version` 与 tag（去 `v`）一致，且 `latest*.yml` 内 version 等于 tag；不一致时 CI 失败且不产出 Release。
- **ac-single-public-release**：每个 tag 恰好一个公开（非 Draft）Release，无重复/残留草稿。
- **ac-asset-version-match**：Release 资产名中的版本与 tag 一致（如 `OpenCompare-<ver>-arm64.dmg`）。
- **ac-reproducible-build**：打包在 CI 由锁定输入驱动（frozen lockfile + 固定 pnpm/node 与 Action 版本），同一 tag 重跑打包产出同名同版本产物，无本地手工打包路径。
- **ac-credentials-checklist**：仓内存在待人类录入的凭据清单与协助文案，逐项说明 `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 的用途与录入位置，并注明实际录入时机待 Apple Developer Program 裁决。
- **ac-docs-checklist**：`docs/release-signing.md` 含 6 项凭据清单（名称/用途/获取方式/形态）、API Key 模式说明（Developer 角色、`.p8` 仅可下载一次、Key ID / Issuer ID）与协助录入文案；发布冻结姿态不因本项解除。
- **ac-readme-updated**：`README.md` 构建/发布章节按 API Key 模式列明 6 个 Secrets 与 fail-closed 行为，且与文档口径一致。
- **ac-no-secret-leak**：仓库文件、工作流脚本、日志与 digest 中不含凭据值；代码只从 GitHub Secrets 读取，错误信息只列缺失 Secret 名。
- **ac-config-unit-tests**：release 配置断言单测扩展覆盖签名/公证/版本对齐/唯一 Release 断言，`pnpm test` 通过。
- **ac-gates-green**：`code-gates.json` 全部门禁（install / lint / typecheck / build / build:web / test）通过。
- **ac-no-regression**：内置样本主链路无回归，`code-gates.json`（install / lint / typecheck / build / build:web / test）全绿；打包目标与触发条件（`v*` tag）不变。
- **ac-version-bump**：`package.json#version` 为 `0.1.2`（tag↔version 对齐闸附带要求，`release.yml` 本身不改）。
- **ac-changelog-v012**：新增 `CHANGELOG.md`，含 `v0.1.2` 条目，覆盖 Developer ID 签名 + Apple 公证（App Store Connect API Key 模式、6 项 Secrets fail-closed）、可复现打包与唯一公开 Release、版本/tag 对齐闸。
- **ac-docs-api-key**：`README.md` 与 `docs/release-signing.md` 已更新为 App Store Connect API Key 模式口径与 v0.1.2 正式版说明。
- **ac-freeze-warning-converged**：此前「未签名/未公证、发版冻结」的过时警示已收敛；措辞以「正式版经签名 + 公证流程产出」为准，不预先宣称尚未由 CI 验证的公证结果。
- **ac-test-synced**：`src/main/release-packaging.test.ts` 断言随文档变更同步（冻结期断言改为正式版口径，并覆盖 `CHANGELOG.md` 条目），`pnpm test` 通过；签名/公证接线断言（6 项 Secrets、fail-closed、API Key 模式、唯一公开 Release、版本对齐闸）不得弱化。
- **ac-no-scope-creep**：未改打包目标 / `appId` / 触发条件 / 发布模型，未新增依赖，未动 `@core`，无功能改动。

## 非目标

- 不做 Windows / Linux 的代码签名或公证（签名/公证仅覆盖 macOS Developer ID）。
- 不进行自动更新（auto-update）与发布密钥托管服务。
- 不重新打 tag、不在工作项内重跑 CI、不手工公开历史草稿 Release；不由 AI 实际获取/录入证书或密钥，不在本地执行公证。
- 不引入新发布渠道（npm / Homebrew / Snap 等），不改依赖版本与 `electron-vite` 构建脚本。
- 不重写 `README` / `AGENTS.md`、不新增文档体系或设计语言；不在本地做多平台交叉编译。
- 不顺手重构 CI（不加缓存策略、不拆并行 job、不改 Node 版本）；不重构既有「单点预建唯一 Release + 汇聚 `gh release upload` + finalize」模型，仅在其上接线签名公证与版本闸。
- 不改 electron-builder 打包目标 / `appId`；不改触发条件（仍为 `v*` tag push）与 `permissions`；不引入新的 Action / 第三方发布工具。发版版本 bump 仅限 `package.json#version` 改为与目标 tag 一致（v0.1.2），不做自增逻辑或自动化版本管理。
- 发版必需改动不越界：不改 `release.yml`、不改打包目标 / `appId` / `mac.identity` / 触发条件 / 发布模型、不新增依赖、不改 `electron-builder.yml` / entitlements、不动 `src/core/`、不做功能/UI 改动；`CHANGELOG.md` 只覆盖 `v0.1.2` 条目，不追溯补写历史版本；不录入手工凭据、不在仓库/脚本/日志写明文密钥、不执行打 Tag / publish Release / 公证。
- 不追求 bit-identical 二进制可复现；只保证输入锁定与产物名/版本确定。

## 实现约束

- 配置断言单测须落在 `vitest.config.mts` 的 `include` 路径（`src/**/*.test.ts`）内、Node 环境运行，可直接读仓库根配置；不得引入 Electron / DOM 依赖，`src/core/` 保持纯净。
- 包管理固定 `pnpm@10.18.3`；`.deb` 仅由 CI 的 Linux runner 构建，本地不参与多平台编译。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test` 自检；门禁命令须为单条 argv。
- 预建唯一 Release 放在 `gates` Job 末尾、`release` 矩阵之前；预建 / upload / finalize 统一使用 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 与 `GH_REPO: ${{ github.repository }}`，命令显式带 `--repo "${GITHUB_REPOSITORY}"`（不依赖隐式 git 仓库上下文，规避 `not a git repository`）。
- 汇聚上传须兼容 windows-latest 默认 shell（pwsh）：使用 `shopt -s nullglob` 时须设 `shell: bash`，或用 gh 自带 glob 展开；`--clobber` 允许重复上传覆盖以保证可重跑。
- 签名/公证凭据一律经 GitHub Secrets / 环境变量注入，严禁写入仓库、脚本、README、日志或 digest；`::error::` 只允许列出缺失的 Secret 名称。`APPLE_API_KEY` 以 `.p8` 的 base64 存放，工作流须在 `$RUNNER_TEMP` 解码为权限 `600` 的仓库外文件并把 `APPLE_API_KEY` 设为该路径，`APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 原样传入。`APPLE_TEAM_ID` 为 `3X4J53U6RY`；签名身份在 `electron-builder.yml` 的 `mac.identity` 显式声明，避免 runner 上自动挑选错误证书。entitlements 文件放 `build/`（electron-builder 默认查找路径）。**fail-closed 优先于继续发版**：缺凭据即失败并升级（`munk_report_owner`），绝不交付未签名裸包。
- 沿用现有 `electron-builder.yml` 配置模式，只新增必需字段（如 `mac.identity`），不重排既有配置；`mac.notarize: true`、`hardenedRuntime`、entitlements 与打包目标保持不变。配置断言单测沿用 Node 环境读取仓库根配置的方式（`node:fs` + `node:path`，不 import Electron），落在现有 `src/main/release-packaging.test.ts`。文档与 README 保持既有发布冻结口径，只替换凭据模式相关内容，不新增文档体系。
- 签名/公证 Secrets 只接到 mac 矩阵步骤；版本对齐只做断言与失败，不改 version、不打 tag；`release.yml` 保持 `v*` tag 触发、`gates` 先行与单点预建 + 汇聚上传 + finalize 流程。

## 最近交付证明

- WI：`wi_intake_d134bf8347298666`（v0.1.2 正式版发版必需改动：版本 bump + Release Notes + 文档口径收敛）
- 日期：2026-10-19
- 结果：code_gates passed（install / lint / typecheck / build / build:web / test 全绿；本项无窗口可点交互，跳过 UI 自测）。
- 覆盖摘要：
  - `package.json`：`version` 由 `0.1.0` 改为 `0.1.2`，与 `release.yml` 的 tag↔version 对齐闸一致（`release.yml` 未改）。
  - 新增 `CHANGELOG.md`：Keep a Changelog / SemVer 口径，`## v0.1.2` 条目覆盖签名与公证（Developer ID + App Store Connect API Key 模式、6 项 Secrets fail-closed、`.p8` 于 `$RUNNER_TEMP` 物化 chmod 600）、可复现打包与唯一公开 Release（预建唯一 Release + `--publish never` + `gh release upload --clobber` + finalize）、版本/tag 对齐闸（tag↔`package.json#version` 与 `latest*.yml#version`）。
  - `README.md`：顶部发布状态由「冻结 / 预发布、未签名未公证」改为「正式版 v0.1.2，经 Developer ID 签名 + Apple 公证流程产出、tag 触发唯一公开 Release」，保留 6 项 Secrets 与 fail-closed 描述，并注明公证结果以 tag 触发的那次 CI 为准。
  - `docs/release-signing.md`：第三节「冻结期的发布姿态」改写为「正式版发布姿态（v0.1.2）」（解冻口径 + fail-closed + 查看 Release 命令），凭据清单与 API Key 模式说明保留。
  - `src/main/release-packaging.test.ts`：冻结期断言（要求文档含「发布冻结」）改为正式版口径（文档含 `v0.1.2` / 「正式版」且不含「发布冻结」；README 含 `v0.1.2` 且不含「发布状态：冻结」），新增 `CHANGELOG.md` 断言组（`## v0.1.2` / Developer ID / App Store Connect API Key / fail-closed / 唯一 / `latest*.yml`）；既有 6 Secrets、fail-closed、API Key 物化、唯一 Release、版本对齐断言均保留未弱化。
- 注：本域上一轮为 `wi_intake_d90fd2b7b90b257d`（签名/公证改用 App Store Connect API Key，发布仍冻结）。本轮按公司负责人批准的 v0.1.2 发版解冻：仅做发版必需改动（版本 bump / Release Notes / 文档口径），未改 `release.yml`、打包目标、`appId`、发布模型与依赖。发版冻结口径正式收敛为「正式版经签名 + 公证流程产出」；实际公证结果仍以 `v0.1.2` tag 触发的那次 CI 为准（本项不打 Tag、不 publish）。
