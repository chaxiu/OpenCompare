# Domain: release

打包分发与 GitHub 开源发布：electron-builder 跨平台打包目标、macOS Developer ID 签名 + Apple 公证、`v*` tag 触发的门禁前置 CI、版本对齐闸、GitHub Release 唯一公开可见，以及仓库门面（README / LICENSE）、签名凭据清单与发布配置断言单测。本域不含应用业务功能与视觉基线。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts，`electron-builder` 为 devDependency。
- **自制品牌图标资产**：`build/icons/icon.svg` 为唯一可编辑源（双栏对比 / 分叉合并意象，纯几何图形）；`node build/icons/generate-icons.mjs` 仅用 Node 标准库可重复生成并入库 `build/icons/icon-{16,32,64,128,256,512,1024}.png`、`build/icon.png`（1024×1024，兼作 Linux 与运行时图标）、`build/icon.icns`、`build/icon.ico`；替换品牌只需换源并重跑，产物路径固定。手册见 `docs/brand-assets.md`。
- **打包图标接线**：`electron-builder.yml` 显式配置 `mac.icon: build/icon.icns` / `win.icon: build/icon.ico` / `linux.icon: build/icon.png`，并以 `extraResources`（`build/icon.png` → `icon.png`）把同一份 PNG 放进打包根 `resources/`；不改 `appId`、`productName`、targets、notarize 与 publish 模型。
- **协议（URL scheme）声明**：`electron-builder.yml` 顶层 `protocols` 声明 `opencompare` scheme（`name` 非空），mac 打包即据此生成 `Info.plist` 的 `CFBundleURLTypes`；`linux.desktop.entry.MimeType` 声明 `x-scheme-handler/opencompare`。运行时注册（`app.setAsDefaultProtocolClient`）、argv / `open-url` 接管与请求投递归 `launch` 域；本域只负责打包配置与配置断言。
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
- **发版版本单点**：`package.json#version` 为发版的唯一版本来源（当前 `0.2.0`），tag 语义版本与打包产物 `latest*.yml#version` 均须与其对齐，二者由 `release.yml` 对齐闸断言。
- **Release Notes 草案**：根目录 `CHANGELOG.md`（Keep a Changelog / SemVer 口径）记录版本条目，新版本条目排在旧版本之上；`v0.2.0` 条目覆盖本版用户可见变化（顶栏常驻「新建对比」+ 免弹窗左右路径直传、启动参数与 `opencompare://compare` 注入 + 单实例接管、文件会话原位写回、自制品牌图标与窗口/关于同源）与升级方式。`docs/release-notes/v0.2.0.md` 是 v0.2.0 的 GitHub Release Notes **来源文本**（纯 Markdown、面向用户、无内部实现流水账、无 `TODO`/`TBD`/`FIXME` 占位），标题含 `v0.2.0` 且版本号与 `package.json#version` 由测试交叉比对。
- **版本漂移记录（只读事实 + 不动作声明）**：`CHANGELOG.md` 与 `docs/release-signing.md` 两处记录同一组 `v0.1.2` 事实——annotated tag 对象 `c4a6a95` 指向 commit `7ea2cc6`；`v0.1.2` 是 `main` / `origin/main` 的祖先（无游离历史）；规划基线时 `main` 领先 13 个提交（只是规划基线快照，实际以打 tag 时 `main` 为准）；远端 Release 公开、非预发布、共 11 个资产；并声明**不删除 / 不移动 / 不重打 / 不替换** tag 与资产、tag 之后的修复由 `v0.2.0` 承接、后续只能发更高版本不改写历史。
- **CI 只读发布前置断言（preflight）**：`release.yml` 的 `gates` job 在 `pnpm test` 之前新增只读 preflight step——拒绝非严格 semver 的 `package.json#version`（如 `0.2` / `v0.2.0`）、断言 `v0.1.2` 在本次 checkout 可见、是 `HEAD` 祖先（`HEAD..v0.1.2` 为 0）且领先提交数 > 0，失败一律 `::error::` + `exit 1`；`gates` 的 `actions/checkout` 设 `fetch-depth: 0` 使 tag 与历史在 CI 可见。preflight 只调用只读 git 子命令（`rev-parse` / `rev-list`），不触碰远端与 ref。
- **正式版文档口径**：`README.md` 与 `docs/release-signing.md` 以「正式版经签名 + 公证流程产出」描述发版姿态（发布状态与发布姿态段均标注 `v0.2.0`，README 链接 `docs/release-notes/v0.2.0.md`），同时保留 6 项 Secret 清单与 fail-closed 表述不变；公证实际结果以 tag 触发的那次 CI 为准，不预先宣称未经验证的公证结果。
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
- **ac-icon-assets-valid**：`build/icons/icon.svg`、`build/icon.png`、`build/icon.icns`、`build/icon.ico` 及 16–1024 多尺寸 PNG 均存在且非空；PNG 以 `89 50 4E 47` 开头且主图标为 1024×1024，icns 前 4 字节为 `icns`，ico 头 6 字节为 `00 00 01 00 01 00`。
- **ac-builder-icons-wired**：解析 `electron-builder.yml` 后，`mac.icon`、`win.icon`、`linux.icon` 均非空且分别指向上述实际存在的入库文件；宿主平台之外的两项同样配置齐全。
- **ac-runtime-icon-resource**：`electron-builder.yml` 的 `extraResources` 含把 `build/icon.png` 复制为打包根 `icon.png` 的条目；纯路径解析函数在 packaged 时返回 `<resourcesPath>/icon.png`，非 packaged 时返回仓库内 `build/icon.png`，两者都指向同一份入库 PNG（运行时窗口 / dock / 关于面板接线见域 `desktop-shell`）。
- **ac-no-electron-default**：三平台图标配置均显式指向 `build/` 下入库资产（不依赖 electron-builder 默认 `electron.icns` / `electron.ico`）；当测试机可定位 Electron 分发目录中的默认 `electron.icns` 时，断言其 SHA-256 与本仓 `build/icon.icns` 不同。
- **ac-brand-docs-replaceable**：`docs/brand-assets.md` 存在，含「自制」「可替换」表述、四个核心资产路径（svg / png / icns / ico）与再生成命令；测试断言这些字符串与路径均可检索。
- **ac-release-gates-green**：本项不新增依赖，`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:web` 全部通过。
- **ac-builder-protocol-config**：解析 `electron-builder.yml` 后存在顶层 `protocols`，其中一项 `schemes` 含 `opencompare` 且 `name` 非空；`linux.desktop.entry.MimeType` 含 `x-scheme-handler/opencompare`；新增断言在 `release-packaging.test.ts` 中且既有断言未被删除或放宽。

### v0.2.0 版本收敛与漂移记录

- **ac-pkg-version-020**：`package.json#version` 严格等于 `0.2.0`，且符合 semver（主版本.次版本.修订号）。
- **ac-changelog-v020-section**：`CHANGELOG.md` 含 `## v0.2.0` 段，且出现在 `## v0.1.2` 段之前（新版本在上）。
- **ac-changelog-v020-content**：`## v0.2.0` 段文本同时包含「新建对比」「路径」「启动参数」或 `opencompare://`「图标」关键词，覆盖本版用户可见变化。
- **ac-release-notes-file**：`docs/release-notes/v0.2.0.md` 存在且非空，首个一级标题包含 `v0.2.0`。
- **ac-release-notes-no-placeholder**：`docs/release-notes/v0.2.0.md` 不含 `TODO` / `TBD` / `FIXME` 占位。
- **ac-release-notes-version-single-source**：测试从 `docs/release-notes/v0.2.0.md` 标题提取版本号，断言其等于 `package.json#version`（改版本而漏改 Release Notes 时该用例失败）。
- **ac-readme-posture-v020**：`README.md` 的发布状态行包含 `v0.2.0`，且包含指向 `docs/release-notes/v0.2.0.md` 的链接；不再出现「当前发布状态：正式版 v0.1.2」。
- **ac-signing-doc-posture-v020**：`docs/release-signing.md` 的正式版发布姿态段标注 `v0.2.0`；`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 六项与 fail-closed 表述原样保留。
- **ac-drift-facts-changelog**：`CHANGELOG.md` 含 `v0.1.2` 漂移事实：commit `7ea2cc6`、tag 对象 `c4a6a95`（annotated）、`v0.1.2` 是 main 的祖先、规划基线领先 13 个提交、远端 Release 公开且非预发布、11 个资产。
- **ac-drift-facts-signing-doc**：`docs/release-signing.md` 含同一组 `v0.1.2` 只读事实（commit `7ea2cc6`、祖先关系、13 个提交基线、11 个资产、公开非预发布）。
- **ac-drift-no-action-statement**：两处文档都含不动作声明，同时出现「不删除」「不移动」「不重打」「不替换」与「tag 之后的修复由 v0.2.0 承接」的等价表述。
- **ac-test-tag-ancestor**：`release-packaging.test.ts` 用只读 git 命令断言 `v0.1.2` 是 `HEAD` 的祖先，且 `v0.1.2..HEAD` 的提交数大于 0；在本仓库全量检出下该用例为通过（非 skip）。
- **ac-test-tag-version-match**：测试用 `git show v0.1.2:package.json` 只读读取历史版本，断言其 `version` 为 `0.1.2`，与被记录的漂移事实一致。
- **ac-test-skips-without-git-metadata**：当本地无 `.git` 或 `v0.1.2` tag 不可见时，上述两条 git 用例 skip 并给出原因，不产生假失败（不影响 `pnpm test` 在无 git 环境全绿）。
- **ac-test-assertions-are-read-only**：测试文件内调用的 git 子命令集合限定为只读子命令（`rev-parse` / `rev-list` / `show` / `cat-file`），测试源码中不出现执行 `git tag`、`git push`、`git fetch`、`git merge`、`git rebase` 或 `gh release` 的代码路径。
- **ac-ci-preflight-tag-ancestor**：`release.yml` 的 `gates` job 在 `pnpm test` 之前新增 preflight step，断言 `v0.1.2` 是 `HEAD` 祖先且领先提交数非零，失败时以 `::error::` 输出并 `exit 1`。
- **ac-ci-preflight-git-metadata**：`gates` job 的 `actions/checkout` 设置 `fetch-depth: 0`，使 tag 与历史在 CI 可见（与 preflight 断言配套）。
- **ac-ci-preflight-version-semver**：preflight step 在版本比对前拒绝非 semver 的 `package.json#version`（如 `0.2`、`v0.2.0`），以 `::error::` 失败退出。
- **ac-latest-yml-gate-preserved**：`release.yml` 仍保留「Assert packaged version matches the tag」步骤，逐个校验 `release/latest*.yml` 的 `version` 等于 tag，且无匹配文件时报错退出；测试断言该步骤与 glob / 空目录守卫未被删除。
- **ac-release-model-unchanged**：测试断言发布模型未被改写：仍为 tag 触发、`gates` 先跑、矩阵 `--publish never`、单点预建 draft、`finalize` 公开，且 workflow 引用的 secrets 集合仍为六项 + `GITHUB_TOKEN`。
- **ac-existing-v012-assertions-updated**：原先锁定「README 是 v0.1.2 正式版」「签名文档是 v0.1.2 姿态」的两条用例改为断言 v0.2.0 口径（不是删除覆盖），同时 README / 签名文档仍保留 `v0.1.2` 漂移说明。
- **ac-changeset-scope**：本项改动文件仅限 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`docs/release-notes/v0.2.0.md`、`src/main/release-packaging.test.ts`、`.github/workflows/release.yml`；不含 tag、Release、资产或签名配置改动。
- **ac-no-publish-side-effects**：`release.yml` 中既有的 `gh release create` / `upload` / `edit` 调用保持原样、不新增任何发布调用，且本项不引入执行 `git tag` / `git push` 的脚本或 npm script；本项结束时远端的 tag、Release 与 11 个 v0.1.2 资产保持原状。

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
- 品牌图标项不改 `appId`（保持 `com.opencompare.app`）、`productName`、发布模型与 `release.yml` 的打包 / 发布 / 公证流程；不升版本号、不改 CHANGELOG / Release Notes、不动 `v0.1.2` tag 与资产；不做应用内「关于」页面或设置页、不做主题 / 视觉改版；不新增运行时或开发依赖、不引入在线图标生成服务、不使用 Electron 默认图标或任何第三方版权图标；不在本项执行签名、公证、打 tag、push、publish 或创建 Release。
- v0.2.0 收敛项只做「发版元信息收敛 + 只读一致性断言」：**不打 tag、不 push、不 publish、不创建或公开 Release**，不修改任何远端 Release 及其资产（含 v0.1.2 的 11 个资产）——这些动作由人与 Host 完成并触发 `human_required`。
- 不删除 / 不移动 / 不重打 `v0.1.2`（以及 `v0.1.0` / `v0.1.1`）tag，不替换已发布资产，不改写任何历史提交。
- 不改发布模型与签名链路：`tags: v*` 触发、`gates → 矩阵 --publish never → finalize`、单点预建 draft、六项 Secret 与 fail-closed 逻辑、`electron-builder.yml` 的签名/公证/图标/protocol 配置全部不动；不新增 Secret。
- 不在本机执行 `codesign` / `stapler` / `spctl` 实证，不产出 `docs/release-evidence/`（归 release-hardening / local-evidence）；不把「CI 绿了」当签名/公证证据。
- 不改 `appId` / `productName` / 版本之外的包元数据；不引入 changesets、semantic-release 等版本工具，不新增依赖。
- 不修历史：`v0.1.1` tag 内 `package.json#version` 实为 `0.1.0` 这个既存不一致只作为已知事实避开（不写「所有 v* tag 版本一致」断言、不回填、不改 tag），只对 `v0.1.2` 与当前版本断言。
- v0.2.0 收敛项不改对比算法、会话模型、UI、图标资产与协议声明；不做 CHANGELOG 全历史重写，不产出英文版 Release Notes。

## 实现约束

- 配置断言单测须落在 `vitest.config.mts` 的 `include` 路径（`src/**/*.test.ts`）内、Node 环境运行，可直接读仓库根配置；不得引入 Electron / DOM 依赖，`src/core/` 保持纯净。
- 包管理固定 `pnpm@10.18.3`；`.deb` 仅由 CI 的 Linux runner 构建，本地不参与多平台编译。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test` 自检；门禁命令须为单条 argv。
- 预建唯一 Release 放在 `gates` Job 末尾、`release` 矩阵之前；预建 / upload / finalize 统一使用 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 与 `GH_REPO: ${{ github.repository }}`，命令显式带 `--repo "${GITHUB_REPOSITORY}"`（不依赖隐式 git 仓库上下文，规避 `not a git repository`）。
- 汇聚上传须兼容 windows-latest 默认 shell（pwsh）：使用 `shopt -s nullglob` 时须设 `shell: bash`，或用 gh 自带 glob 展开；`--clobber` 允许重复上传覆盖以保证可重跑。
- 签名/公证凭据一律经 GitHub Secrets / 环境变量注入，严禁写入仓库、脚本、README、日志或 digest；`::error::` 只允许列出缺失的 Secret 名称。`APPLE_API_KEY` 以 `.p8` 的 base64 存放，工作流须在 `$RUNNER_TEMP` 解码为权限 `600` 的仓库外文件并把 `APPLE_API_KEY` 设为该路径，`APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 原样传入。`APPLE_TEAM_ID` 为 `3X4J53U6RY`；签名身份在 `electron-builder.yml` 的 `mac.identity` 显式声明，避免 runner 上自动挑选错误证书。entitlements 文件放 `build/`（electron-builder 默认查找路径）。**fail-closed 优先于继续发版**：缺凭据即失败并升级（`munk_report_owner`），绝不交付未签名裸包。
- 品牌资产唯一入库位置为 `build/`（及 `build/icons/`），二进制产物必须提交；生成脚本只使用 Node 标准库与本机现有系统工具（如 macOS `iconutil`），不新增依赖；品牌名统一 `OpenCompare`，图标与关于信息必须同源，禁止多处各写一份。
- 沿用现有 `electron-builder.yml` 配置模式，只新增必需字段（如 `mac.identity`），不重排既有配置；`mac.notarize: true`、`hardenedRuntime`、entitlements 与打包目标保持不变。配置断言单测沿用 Node 环境读取仓库根配置的方式（`node:fs` + `node:path`，不 import Electron），落在现有 `src/main/release-packaging.test.ts`。文档与 README 保持既有发布冻结口径，只替换凭据模式相关内容，不新增文档体系。
- 签名/公证 Secrets 只接到 mac 矩阵步骤；版本对齐只做断言与失败，不改 version、不打 tag；`release.yml` 保持 `v*` tag 触发、`gates` 先行与单点预建 + 汇聚上传 + finalize 流程。
- **版本身份单一来源**：`package.json#version` = `0.2.0`；文档里的字面版本由测试与 `package.json` 交叉比对，不允许测试硬编码版本却不与 `package.json` 同步（`ac-pkg-version-020` 与 `ac-release-notes-version-single-source` 一起兜住）。
- **漂移事实的 13 只是规划基线快照**，不硬编码为实时真值（本项开工时 `main` 已领先 23 个提交，Wave 1 四项已合入）：文档措辞须体现「规划基线 13，实际以 tag 时 main 为准」；断言只校验「是祖先 + 领先数 > 0」，绝不写死 13 或 23 的等值比较。
- **git 断言一律只读且不走 shell 拼接**：测试用 `execFileSync('git', ['rev-list', ...])` / `['show', 'v0.1.2:package.json']` 形式；CI preflight 用 `git rev-list --count` 与 `git rev-parse`，禁止 `git tag` / `push` / `fetch` / `merge` / `rebase`。
- **浅克隆兼容**：`gates` checkout 配 `fetch-depth: 0`；单元测试在 `.git` 或 `v0.1.2` 缺失时 skip（`it.skipIf` / `describe.skipIf`），保证无 git 的沙箱环境仍 `pnpm test` 全绿，且不吞掉真实漂移。
- **断言落点复用现有资产**：扩展 `src/main/release-packaging.test.ts` 的既有 describe 组（`release version gate` / `release notes changelog` / `release signing credentials checklist` / `github release publishing`），不新建第二套测试文件；新增 UI/交互无关。
- 既有两条「v0.1.2 姿态」用例改写为 v0.2.0 口径时，保留 `not.toMatch(/发布状态：冻结/)` 之类防回退守卫，并保留 README / 签名文档中 `v0.1.2` 漂移段落（否则 `ac-drift-facts-*` 会失去落点）。
- `docs/release-notes/v0.2.0.md` 为纯 Markdown、零前端代码，作为人工创建 Release 时粘贴的来源文本；不引入自动生成脚本。

## 最近交付证明

- WI：`wi_ws_1b6bb1d337d06cd5`（v0.2.0 版本收敛、Release Notes 与 v0.1.2 漂移记录）
- 日期：2026-10-20
- 结果：code_gates passed（install / lint / typecheck / build / build:web / test 全绿；`needSelfTest=false`，跳过 UI 自测）。**不含任何发布动作**：未打 tag、未 push、未 publish，远端 `v0.1.2` Release 与 11 个资产未动。
- 覆盖摘要：
  - `package.json#version`：`0.1.2` → `0.2.0`（唯一版本身份来源）。
  - `CHANGELOG.md`：新增 `## v0.2.0` 段（位于 `## v0.1.2` 之上），覆盖顶栏常驻「新建对比」+ 免弹窗左右路径直传、启动参数与 `opencompare://compare` 注入 + 单实例接管、文件会话原位写回、自制品牌图标与窗口/关于同源，并写升级方式；追加 `v0.1.2` 漂移记录（tag 对象 `c4a6a95` → commit `7ea2cc6`、是 main 祖先、规划基线领先 13 个提交、远端公开非预发布 11 个资产、不动作声明）。
  - `docs/release-notes/v0.2.0.md`（新建）：面向用户的 Release Notes 来源文本，标题含 `v0.2.0`，无 `TODO`/`TBD`/`FIXME` 占位。
  - `README.md` / `docs/release-signing.md`：发布状态与「正式版发布姿态」收敛到 `v0.2.0`（README 链接 Release Notes），6 项 Secret 清单与 fail-closed 表述原样保留；签名文档新增第四节漂移记录。
  - `.github/workflows/release.yml`：`gates` 的 `checkout` 设 `fetch-depth: 0`；`pnpm test` 前新增只读 preflight step（严格 semver 校验 → `v0.1.2` 可见性 → `HEAD..v0.1.2 == 0` → `v0.1.2..HEAD > 0`，失败 `::error::` + `exit 1`）。发布模型、六项 Secret、`latest*.yml` 对齐闸、`gh release create/upload/edit` 调用一律未改。
  - `src/main/release-packaging.test.ts`：只增不改（既有断言保留，两条 v0.1.2 姿态用例改口径），新增版本单一来源、Release Notes 文件/无占位/版本交叉比对、README 与签名文档 v0.2.0 口径、两处漂移事实与不动作声明、只读 git 祖先/领先/历史版本断言、无 git 元数据时 skip 并说明原因、preflight 位置与 semver 守卫顺序、发布模型未改与 secrets 集合未变等用例。git 调用仅 `rev-parse` / `rev-list` / `show`（`execFileSync` 数组参数，不走 shell）。
- 注：本 WI change pack 只提供 `prd.md`，未提供 `tests/cases/**` / `tech.md` / `ux/**` —— 无新增折叠用例、无 tech/ux 手合；同域既有 `qa/release-workflow.md` 等用例本轮未重跑（发布动作归人与 Host）。未做签名/公证实证，未读取远端 Release 实时状态（漂移事实按 PRD 记录的只读快照入档，实际领先数以打 tag 时 `main` 为准）。
