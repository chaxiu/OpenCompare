# Domain: release

打包分发与 GitHub 开源发布：electron-builder 三平台打包、macOS Developer ID 签名 + Apple 公证、`v*` tag 触发的门禁前置 CI、版本对齐闸、唯一公开 Release、发布前验证（draft 15/15 后才公开）与仓内发布证据。仓库门面（README / LICENSE / 元数据）与发布配置断言单测同属本域。本域不含应用业务功能与视觉基线。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis 安装包 + 免安装 zip）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts。
- **品牌图标**：`build/icons/icon.svg` 为唯一可编辑源，`node build/icons/generate-icons.mjs` 仅用 Node 标准库可重复生成并入库多尺寸 PNG、`build/icon.png`（1024×1024）、`build/icon.icns`、`build/icon.ico`；替换步骤见 `docs/brand-assets.md`。
- **图标接线**：三平台 `mac.icon` / `win.icon` / `linux.icon` 显式指向入库文件，`extraResources` 把 `build/icon.png` 复制为打包根 `resources/icon.png`；不改 `appId` / `productName` / targets / notarize / publish 模型。
- **URL scheme**：顶层 `protocols` 声明 `opencompare`（`name` 非空），`linux.desktop.entry.MimeType` 声明 `x-scheme-handler/opencompare`；运行时注册与 argv / `open-url` 接管归 `launch` 域。
- **macOS 签名与公证**：`mac` 段启用 `hardenedRuntime` 与 `notarize`，声明 `build/entitlements.mac.plist`（`allow-jit` / `allow-unsigned-executable-memory` / `disable-library-validation`）并钉住 `Developer ID Application: Tao Zhu (3X4J53U6RY)`；凭据经 `CSC_LINK` / `CSC_KEY_PASSWORD` 与 API Key 三件套，`APPLE_TEAM_ID = 3X4J53U6RY`，`appId = com.opencompare.app`。
- **凭据 fail-closed**：打包前逐一检查 6 个 Secret，任一缺失即 `::error::` 列出缺失项并非零退出，无「跳过签名继续发版」分支；`APPLE_API_KEY` 的 base64 `.p8` 在 `$RUNNER_TEMP` 解码为 600 权限文件供 `notarytool --key` 使用，打包后清理且不打印内容。
- **版本对齐闸**：`package.json#version` 等于 tag 语义版本（去 `v`），各平台产物旁 `latest*.yml#version` 亦等于 tag；不一致即失败且不产出 Release。
- **单 Release 模型**：`gates` 末尾单点预建该 tag 的唯一 draft，三平台矩阵 `--publish never` 只打包到 `release/`，再 `gh release upload --clobber` 汇聚上传；draft 验证 aggregate PASS 之后，`finalize` 才以 `--draft=false --latest` 公开（顺序契约归 `domains/release-publish-gate`）。
- **触发与 tag 单源**：`release.yml` 监听 `v*` tag push 并声明 `workflow_dispatch`（输入 `tag`）；工作流级 `RELEASE_TAG` 是唯一 tag 来源，断言、建单、上传、公开与校验全部引用它，dispatch 构建该 tag 源码。
- **门禁与祖先门**：frozen install / lint / typecheck / test / build 先行，tag 格式、tag 可解析、严格 semver 与「`v0.1.2` 为祖先或仅 tag 可达提交补丁等价」内联在 `run` 中只读执行，任一不满足即 fail-closed。
- **打包后硬校验**：上传前校验 `.app` 图标与版本身份、`codesign` / `stapler` / `spctl`、产物名与 `latest*.yml`；`finalize` 再断言唯一公开 Release、资产完整与本 tag 为最新公开 Release。
- **发布说明与发布前验证**：`CHANGELOG.md` 与双语 notes 由 `package.json#version` 派生，预建 Release 经 `--notes-file` 写入并 fail-closed，`finalize` 反读 body 校验双语；publish **之前**以当前 Release 状态（`mode=draft|published`）派发 `post-release-verify.yml`，校验 run、`aggregate` 与 artifact 通过后才公开，公开后再跑轻量 public L1。
- **证据归档**：真实产物经只读就绪门、仓库外下载、字节 + sha256 与签名复核后写入 `docs/release-evidence/<tag>.md`（`verified` / `blocked`，产物不入库），台账登记版本、状态与资产数。
- **仓库门面**：`README.md` 英文默认 + `README.zh-CN.md` 中文镜像（9 节对应、第 3 行互链、第 5 行状态块、两张真实截图），`LICENSE` 为 MIT 全文，`docs/repo-metadata.md` 记录简介、Topics 与 `gh repo edit` 命令。
- **发布配置断言单测**：Node 环境读取仓库根配置与文档做断言，拆为 packaging（打包 / 发布配置 + 证据台账）、version-gate（版本门 / 祖先门 / 重跑入口 / 门面结构）、artifacts-and-brand（品牌 / 协议 / 产物名 / 单 Release）三层。

## 验收

- **ac-builder**：electron-builder 可解析出 macOS / Windows / Linux 目标（dmg + zip、nsis + zip、AppImage + deb），`dist*` scripts 可用。
- **ac-pkg-metadata**：`package.json` 的 `author` 为对象且 `email` 非空、`license` 为 `MIT`、`homepage` 指向仓库；`linux.maintainer` 含 email，`.deb` 构建不因缺 maintainer 报错。
- **ac-builder-mac-signing**：mac 段启用 `hardenedRuntime`、声明 entitlements 与 Developer ID 身份；证书经 `CSC_LINK` / `CSC_KEY_PASSWORD` 注入，仓库无证书明文。
- **ac-builder-notarize**：启用 Apple 公证，凭据经 App Store Connect API Key 三件套与 Secrets 注入，本地不执行公证。
- **ac-appid-own**：`appId` 仍为 `com.opencompare.app`，仓库中不出现 `sh.munk.app`。
- **ac-builder-icons-wired**：svg / png / icns / ico 与 16–1024 多尺寸 PNG 均存在且非空（PNG 头 `89 50 4E 47`、主图标 1024×1024、icns 头 `icns`、ico 头 `00 00 01 00 01 00`），三平台 `icon` 指向这些入库文件，不依赖 Electron 默认图标。
- **ac-runtime-icon-resource**：`extraResources` 把 `build/icon.png` 复制为打包根 `icon.png`；纯路径函数 packaged 返回 `<resourcesPath>/icon.png`、非 packaged 返回仓库 `build/icon.png`。
- **ac-builder-protocol-config**：顶层 `protocols` 含 `opencompare` 且 `name` 非空，`linux.desktop.entry.MimeType` 含 `x-scheme-handler/opencompare`，断言在 `release-packaging.test.ts` 且未删除或放宽既有断言。
- **ac-api-key-secrets-wired**：mac fail-closed 步与 `Build installers` 均接线且仅接线 6 个 Secrets，公证凭据以 API Key 三件套传入。
- **ac-fail-closed-six**：6 个 Secret 任一为空即 `::error::` 并非零退出，无缺凭据继续打包或静默跳过分支，绝不产出未签名裸包。
- **ac-no-secret-leak**：仓库文件、工作流、日志与 digest 不含凭据值；代码只从 Secrets 读取，错误信息只列缺失 Secret 名。
- **ac-release-workflow**：`release.yml` 为 `v*` tag 触发、`gates` 先行，发布路径保证 Release 对仓库外可见且每个 tag 恰好一个 Release。
- **ac-single-precreate**：`gates` 在矩阵前单点预建唯一 Release（带 `GH_TOKEN` / `GH_REPO`、显式 `--repo`，无同名则创建，有重复只留一个）；矩阵参数为 `--publish never`。
- **ac-single-public-release**：每个 tag 恰好一个公开（非 Draft）Release，无重复或残留草稿；`finalize` 的 `gh release edit` 带 `--repo`、`--draft=false --latest`。
- **ac-version-tag-aligned**：发版前断言 `package.json#version` 与 tag（去 `v`）一致，`latest*.yml#version` 等于 tag；不一致时 CI 失败且不产出 Release。
- **ac-artifact-names-versioned**：mac 至少 `.dmg` + `.zip`、win 至少 `.exe`、linux 至少 `.AppImage` + `.deb`，文件名均含 `${RELEASE_TAG#v}`；同扩展名出现不含该版本的文件即失败。
- **ac-checks-before-upload**：图标 / 证书 / 公证 / 产物名 / `latest*.yml` 校验都在 `Upload installers` 之前；全文无 `continue-on-error: true`、`|| true`、`--no-verify`，上传步骤不带 `if: always()`。
- **ac-app-bundle-identity**：`CFBundleIconFile` 非空且非 `electron.icns`、对应 icns 存在且头 `icns`、`Resources/icon.png` 与 `build/icon.png` 同 SHA-256、`CFBundleIdentifier == com.opencompare.app`、`CFBundleShortVersionString == ${RELEASE_TAG#v}`。
- **ac-codesign-developer-id**：`codesign --verify --deep --strict` 退出 0，`codesign -dv --verbose=4` 含 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY` 与 `runtime`，不含 `Signature=adhoc`。
- **ac-stapler-validate**：`.app` 的 `xcrun stapler validate` 退出 0；未直接 staple 时从 `release/*.dmg` 挂载校验同一 app，失败路径也 detach；`spctl -a -vv --type execute` 含 `accepted` 与 `Notarized Developer ID`。
- **ac-notes-file-flag**：`gh release create` 用 `--notes-file "${body_file}"` 并保留 `--repo` 与 `--draft`，body 临时文件在 `${RUNNER_TEMP}` 下且路径含 `RELEASE_TAG`。
- **ac-no-single-language-fallback**：不出现 `--generate-notes`，`--notes-file` 恰 2 处（create 与 draft-only edit），无仅英文 / 仅中文降级路径；同名 Release 已公开时走「body untouched」分支。
- **ac-body-composition-order**：body 顺序为英文全文 → 单独 `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → `**Full Changelog**`，两标记各一次不嵌套；`finalize` 反读公开 body 断言英中两段各含 `${RELEASE_TAG}`。
- **ac-workflow-latest-release-gate**：`finalize` 在资产完整性之后新增只读步骤，用 `gh release list --limit 1 --json tagName` 断言本 tag 即最新公开 Release，空值或不等 fail-closed。
- **ac-dispatch-entry**：`workflow_dispatch` 输入 `tag` 且 required，默认值由 `package.json#version` 派生；gates 与矩阵 checkout 均显式 `ref: refs/tags/${RELEASE_TAG}`。
- **ac-dispatch-tag-validation**：dispatch tag 不匹配 `^v[0-9]+\.[0-9]+\.[0-9]+$` 或 `refs/tags/<tag>` 不可解析时，工作流在构建前非零退出。
- **ac-ancestry-patch-equivalent**：`v0.1.2` 非严格祖先但所有仅 tag 可达提交 `git cherry HEAD` 均为 `-` 时门退出 0；任一 `+`、无法枚举或 `v0.1.2..HEAD` 为 0 均非零退出。
- **ac-ancestry-protected-deletion**：任一仅 tag 可达提交的 diff 删除 `.github/workflows/` / `build/` / `electron-builder.yml` / `package.json` 时，即使 `cherry` 为 `-` 也非零退出；门全程只读且不输出 secret。
- **ac-version-single-source**：`package.json#version` 是唯一版本来源，`currentTag` 由其派生；文档字面版本由测试交叉比对，`.ts` / `.tsx` 内当前 / 已发布版本字面量命中 0。
- **ac-workflow-dispatch-default**：`release.yml` 的 `workflow_dispatch.inputs.tag.default` 等于 `v${pkg.version}`，触发方式、checkout、门禁、打包与发布步骤其余不变。
- **ac-changelog-top**：`CHANGELOG.md` 首个二级标题为 `## v${pkg.version}`（无重复版本标题），新段含「改进 / 不做的事 / 升级方式」，历史条目顺序与正文不变。
- **ac-changelog-no-unpublished-segment**：从未打 tag 的版本不保留独立段落，内容折叠进当前段；其 notes / evidence 路径与 Release 链接均不存在，`publishedTags` 不含它。
- **ac-notes-h2-parity**：中英 notes 各 6 个 H2 且逐项同序（What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade 与中文镜像），第 3 行为 tag 固定绝对互链、各恰 1 条链接。
- **ac-baseline-dedup-convention**：notes 只写相对上一已发布版本新增的用户可见变化；动笔前对照上一 tag 的 H2 / H3 与 `CHANGELOG.md` 段去重，交集只保留平台段等非「本版新增」表述。
- **ac-notes-signing-scope-correction**：v0.2.18 双语 notes 的 Windows 段（`## Windows installer and portable zip` / `## Windows 安装包与免安装 zip`）末尾各新增一个段落，逐字含 `NotSigned`、`SmartScreen`、`v0.2.17`、`UnknownError`、`CSC_LINK`（中文段另含「未签名姿态」），说明签名凭据注入已收窄到仅 macOS 目标，且该段落位于 macOS 段之前。
- **ac-notes-stale-signing-claim-removed**：两文件不再出现 `This release does not change the signing or notarization configuration` / `本版未改动签名与公证配置`；macOS 段改为「凭据注入范围收窄到仅 macOS 目标」的限定表述（EN 含 `macOS target` + `unchanged`，ZH 含「仅 macOS 目标」+「口径本身不变」），仍保留 `Developer ID` 与 `notarized` / `公证`。
- **ac-notes-body-assembly-safe**：两文件不含 `<details>` / `<summary>` / `</details>` 与独占一行的 `---`，`release.yml` 的双语折叠组装与 gate 段落切分不受影响；第 1 行标题仍含 `v0.2.18`、第 3 行语言互链不变。
- **ac-notes-doc-only-diff-scope**：相对改动前基线 `git diff --name-status` 只有两处 `M`（`docs/release-notes/v0.2.18.md`、`docs/release-notes/v0.2.18.zh-CN.md`）；`src/**`、`scripts/**`、`.github/**`、`package.json`、`CHANGELOG.md`、`docs/release-evidence/**` 与历史 notes 零 diff。
- **ac-published-tag-decoupled**：最新已发布 tag 由证据台账与 `docs/release-evidence/*.md` 的 verified 数据派生，`package.json#version` 不进入该判定；当前版本锚与已发布锚各自单点、互不派生，当前 tag 无证据文件不报缺证据。
- **ac-published-anchor**：两版 `README.md` 第 5 行只指向最新已发布 tag 的公开 Release（各恰 1 个 `releases/tag/` 链接），收敛未发布窗口里不出现当前未发布版本与「待发布」字样。
- **ac-readme-en-default**：`README.md` 首行为 `# OpenCompare`；除第 3 行语言切换外全文零汉字（`\p{Script=Han}` 0 命中），不含中文二级标题。
- **ac-en-structure**：`README.md` 恰好 9 个 `##` 且按序为 Download and install / Features / Quickstart / Requirements and development / Project structure / Known issues / Evidence and docs / Open Rebuilds 001 / License，中文镜像逐节对应；下载区只链 `/releases` 与非版本化产物名。
- **ac-readme-two-screenshots**：两版各引用 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`，图注 en / zh 语义镜像；两图由最终构建的真实会话产出，`pnpm screenshots` 可复现并记录被测 commit。
- **ac-evidence-sections**：`docs/release-evidence/<tag>.md` 与既有证据同构，含 tag / 发布点、公开 Release、Release CI、资产表（名称 / 字节 / sha256 / 公开 URL）、双语正文门、签名与公证、L1 结论、未覆盖面，引用一律绝对路径。
- **ac-status-verified-once**：全文恰好一处 `status:` 且取值为 `verified` 或 `blocked`，不出现 `pending`；`verified` 分支缺任一必需标记即失败。
- **ac-blocked-no-fabrication**：`status: blocked` 时只记录就绪门命令原始输出、缺失项与待人工动作，不含任何「通过」记录、产物 sha256 或本地 / 仓库 `release/` 产物，并已升级 Owner。
- **ac-config-unit-tests**：发布配置断言单测覆盖元数据、打包目标、发布配置、6 Secrets 接线、fail-closed、签名身份、`appId`、版本对齐与唯一 Release，`pnpm test` 通过且不引入 Electron / DOM 依赖。
- **ac-gates-green**：`code-gates.json` 全部门禁（install / lint / typecheck / build / build:web / test）通过，打包目标与 `v*` tag 触发条件不变。
- **ac-code-gates**：`.munk/code-gates.json` 按顺序全量执行、退出码 0、无一跳过，不新增 gate 项、不新建测试门文件。
- **ac-finalize-permissions**：`finalize` 声明 job 级 `permissions` 且同时含 `contents: write` 与 `actions: write`（两项 `toEqual` 钉死，job 级覆盖不丢 `contents`）。
- **ac-finalize-dispatch**：publish 之前存在步骤执行 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}" -f mode="$(cat "${RUNNER_TEMP}/release-state.txt")"`，步骤正文零版本字面量；mode 由只读的 `Resolve the tag's release state` 读出（draft / published）。
- **ac-finalize-aggregate-gate**：派发后 300 s 内按 `displayTitle` 含 tag 且 `createdAt >= since` 匹配本次 run，查不到即失败；随后有界等待 `aggregate` 为 `success`（failure / cancelled / timed_out / 非 success / 超时均失败），artifact 名含 tag 与 `run_id`；该 gate 先于 `Make the tag's release public`，失败即保持 draft。

## 非目标

- 不做 Windows / Linux 的代码签名或公证（仅 macOS Developer ID）；不做自动更新（`electron-updater`）与发布密钥托管。
- 不引入新发布渠道（npm / Homebrew / Snap 等），不改依赖版本、构建脚本与 `electron-vite` 配置。
- 不改历史：不删 / 移动 / 重打 tag，不替换已发布资产，不改写既有 Release 正文、notes、证据与 sha256。
- 不做本地手工打包或多平台交叉编译（`.deb` 仅由 CI Linux runner 构建），也不追求 bit-identical 可复现，只保证输入锁定与产物名 / 版本确定。
- 本域不碰产品运行时行为与视觉基线；收敛 / 收尾 / 取证轮只改发布面元数据、文档与发布测试。
- 不新增 Secret、发布公告、落地页或 SEO 文案；不以人工 dispatch 冒充「每版必验」。

## 实现约束

- 技术栈冻结（Electron + electron-vite + React 19 + TS + Tailwind v4），包管理 `pnpm@10.18.3`，不引入版本工具或新依赖。
- 配置断言单测落 `src/**/*.test.ts`、Node 环境，用 `node:fs` / `node:path` 读仓库根，不 import Electron / DOM，`src/core/` 保持纯净。
- 测试对仓库根只读；git 只经 `fixtureGit` 作用于 `os.tmpdir()` fixture，禁止对工作区 tag / push / fetch / merge。
- fixture 自包含：显式 `git init -b`、`GIT_AUTHOR_*` / `GIT_COMMITTER_*`、`GIT_CONFIG_*=/dev/null`，丢弃继承的 `GIT_*` 并指向独立 HOME。
- 祖先门脚本内联在 `release.yml` 步骤 `run` 中（旧 tag checkout 无仓库脚本），测试执行真实步骤文本；`gates` checkout 配 `fetch-depth: 0`。
- 预建 / 上传 / finalize 统一 `GH_TOKEN` + `GH_REPO` 并显式 `--repo`；聚合上传设 `shell: bash` 以兼容 pwsh，`--clobber` 保证可重跑。
- 凭据只经 Secrets / 环境变量注入；`::error::` 只列缺失名称；fail-closed 优先于继续发版，缺凭据即升级而非交付裸包。**`Build installers` 的 `CSC_LINK` / `CSC_KEY_PASSWORD` 只对 `matrix.target == 'mac'` 注入**——Developer ID 证书泄漏到 win 矩阵会把 Windows PE 签成不可信签名（`Get-AuthenticodeSignature` 返回 `UnknownError`），该口径的验收与判定表归 `domains/release-verify`。
- 品牌资产唯一入库位置为 `build/`，生成脚本只用 Node 标准库与本机系统工具；`electron-builder.yml` 只加必需字段、不重排既有配置。
- 版本单一来源 `package.json#version`；`currentTag` 派生、`latestPublishedTag` 单独钉住，发布通道在收敛 / 收尾 / 取证轮全程只读（不打 tag、不 push、不 dispatch、不写 Release）。
- 门禁命令为单条 argv；提交前 `pnpm lint && pnpm typecheck && pnpm test`；`.munk/code-gates.json` 全绿且不新增 gate 项。

## 最近交付证明

- WI：`wi_intake_8830df87d702ce36`（v0.2.18 双语发布说明纠偏，`kind: fix`，`deliveryIntent: local merge`，`needSelfTest=false`）；日期：2026-11-03。
- 结果：`code_gates` 全绿；改动仅 `docs/release-notes/v0.2.18.md` 与 `v0.2.18.zh-CN.md`（各 +3/−1），`src/**` / `scripts/**` / `.github/**` / `package.json` / `CHANGELOG.md` / `docs/release-evidence/**` / 历史 notes 零 diff。
- 验收落点：`ac-notes-signing-scope-correction`（Windows 段新增 `NotSigned` / `UnknownError` / `CSC_LINK` / `v0.2.17` 说明段落）、`ac-notes-stale-signing-claim-removed`（删除「未改动签名配置」旧句，改述凭据注入收窄到 macOS 目标）、`ac-notes-body-assembly-safe` 与 `ac-notes-doc-only-diff-scope`。
- 关键点：签名凭据已由 `matrix.target == 'mac'` 收窄注入，v0.2.17 的 Windows 安装包 `UnknownError` 属旧资产缺陷；v0.2.18 证据仍为 `blocked`，notes 只描述 CI 配置与产物姿态，不宣称已过 post-release-verify。
