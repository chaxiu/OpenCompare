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
- **发布触发与 tag 单点解析**：`.github/workflows/release.yml` 监听 `v*` tag push，并额外声明 `workflow_dispatch`（输入 `tag`，required，默认 `v0.2.1`）用于不改 tag 的补发。工作流级 `env.RELEASE_TAG: ${{ inputs.tag || github.ref_name }}` 是唯一 tag 来源，版本断言、Release 预建 / 上传 / 公开、唯一性与资产校验全部引用 `RELEASE_TAG`；dispatch 路径不得把 `GITHUB_REF_NAME`（`main`）当 tag。
- **发布工作流**：`.github/workflows/release.yml` 监听 `v*` tag，门禁 job（install `--frozen-lockfile` / lint / typecheck / test / build）先行。门禁末尾**单点预建该 tag 的唯一 Release**（`gh release create ... --draft --generate-notes`，注入 `GH_TOKEN`/`GH_REPO` 并显式带 `--repo`；若已存在则清理同名重复只留一个），随后 mac/win/linux 三平台矩阵 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，再用 `gh release upload "${RELEASE_TAG}" <三端全部产物> --clobber --repo` 汇聚上传到该唯一 Release；`finalize` job `gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest` 正式公开。Release 唯一性以 tag 为准，杜绝并发建单竞态。
- **发版版本单点**：`package.json#version` 为发版的唯一版本来源（当前 `0.2.4`），tag 语义版本与打包产物 `latest*.yml#version` 均须与其对齐，二者由 `release.yml` 对齐闸断言。
- **幽灵发布防护（文档面）**：`README.md` 的「版本与下载」表格是版本真值的人读镜像——三行（当前版本待发布并链当前发布说明、从未发布且内容已并入当前版本的 `v0.2.3` 行、最新公开 Release `v0.2.2`）；任何 `releases/tag/<v>` 链接的版本必须 ∈ 已发布集合 `{v0.2.0, v0.2.1, v0.2.2}` ∪ `{当前 tag}`，不得指向从未打过 tag 的版本；从未发布版本的发布说明文件（`docs/release-notes/<ghost>.md`）与其取证文件（`docs/release-evidence/<ghost>.md`）都不存在，仓库文档中无 `docs/release-notes/<ghost>.md` / `releases/tag/<ghost>` 字符串。文档扫描范围固定为 `README.md`、`CHANGELOG.md`、`docs/**/*.md`（`.munk/**` 的 Host 历史记录不在扫描范围）。
- **最新公开 Release 门（`finalize` 只读校验）**：`release.yml` 的 `finalize` job 在既有资产校验步骤之后追加一个只读步骤，断言本 tag 就是当前最新公开 Release（`gh release list --limit 1 --json tagName` 取到的 tagName 与 `${RELEASE_TAG}` 相等，空值或不等即 `::error::` + `exit 1`），防止「tag 存在但 Release 缺失」或「最新 Release 落后」时把人引到旧版本；该步骤不写任何远端状态，也不加 `--exclude-drafts` / `--exclude-pre-releases`（按裁定原样使用 `gh release list --limit 1`）。
- **版本收敛的机械耦合面**：改 `package.json#version` 会连带 `release-packaging.test.ts` 的版本断言、`docs/release-signing.md` 姿态行、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、README 状态行与发布流程默认 tag 一起漂移。v0.2.2 起测试一律从 `package.json#version` 派生 `currentTag` 再互相校验（CHANGELOG 标题、发布说明文件名/标题、README 状态行、workflow dispatch default），版本字面量只允许出现在文档标题 / 文件名等文档标识位置。
- **Release Notes 草案**：根目录 `CHANGELOG.md`（Keep a Changelog / SemVer 口径）记录版本条目，新版本条目排在旧版本之上。`## v0.2.1` 位于 `## v0.2.0` 之上并说明首发替代缘由（v0.2.0 从未公开发布、用户可见变化与 v0.2.0 相同、发布门测试改为不依赖本机 git 状态），同时保留 v0.2.0 的用户可见要点（顶栏常驻「新建对比」+ 免弹窗左右路径直传、启动参数与 `opencompare://compare` 注入 + 单实例接管、文件会话原位写回、自制品牌图标与窗口/关于同源）与升级方式；`docs/release-notes/v0.2.1.md` 是当前版本的 GitHub Release Notes **来源文本**（纯 Markdown、面向用户、无内部实现流水账、无 `TODO`/`TBD`/`FIXME` 占位），标题版本与 `package.json#version` 由测试交叉比对；`docs/release-notes/v0.2.0.md` 保留为历史文件（不被删除或改写）。
- **版本漂移记录（只读事实 + 不动作声明）**：`CHANGELOG.md` 与 `docs/release-signing.md` 两处记录同一组 `v0.1.2` 事实——本地 annotated tag 对象 `c4a6a95` 指向 commit `7ea2cc6` 且为 `main` 祖先；远端 `v0.1.2` 是**轻量 tag**，指向 `bb0c0b1`，不在 `v0.2.0`（`285ee28`）祖先链上（`v0.1.2..HEAD`=29，`HEAD..v0.1.2`=2），两条仅远端 tag 可达提交（`bb0c0b1` / `b2c4e51`）经 `git cherry HEAD` 均为 `-`（补丁已等价存在于 HEAD，零内容丢失）；规划基线时 `main` 领先 13 个提交（只是规划基线快照，实际以打 tag 时 `main` 为准）；远端 Release 公开、非预发布、共 11 个资产；并声明**不删除 / 不移动 / 不重打 / 不替换** tag 与资产、tag 之后的修复由 `v0.2.1` 承接（`docs/release-signing.md`）／`v0.2.0` 承接（`CHANGELOG.md` 的 v0.2.0 条目保留原措辞）、后续只能发更高版本不改写历史。
- **CI 只读发布前置门（版本 + 祖先）**：`release.yml` 的 `gates` job 在 `pnpm install` / `pnpm test` 之前依次执行：① tag 格式校验（`^v[0-9]+\.[0-9]+\.[0-9]+$`，不合格 `::error::` + `exit 1`），② checkout 后断言 `refs/tags/${RELEASE_TAG}` 可解析为 commit（不存在即失败），③ `package.json#version` 严格 semver，④ 祖先门。祖宗门**内联**在该步骤的 `run` 脚本里（不引用仓库内脚本文件——dispatch 会用 main 上的 workflow 去 checkout 旧 tag，新脚本在旧 tag 上不存在会误失败），语义为「`v0.1.2` 是 `HEAD` 严格祖先 **或** 所有仅 tag 可达提交逐条 `git cherry HEAD <sha>` 判定均为 `-`」；日志打印 `v0.1.2` 的 ref 类型（`git cat-file -t` 为 `commit` = 轻量 tag，`tag` = annotated tag）、解析到的 commit SHA、`v0.1.2..HEAD` / `HEAD..v0.1.2` 计数，以及每条仅 tag 可达提交的完整 SHA 与判定符号（`-` / `+`）。任一 `+`、仅 tag 可达提交无法枚举、tag 不可解析、或仅 tag 可达提交的 diff 删除发布关键路径（`.github/workflows/`、`build/`、`electron-builder.yml`、`package.json`）时，门 `::error::` + 非零退出（fail-closed），后续质量门禁、打包矩阵与 finalize 均不运行；`v0.1.2..HEAD` 提交数为 0 也非零退出（发布必须携带 tag 之后的修复）。门只做只读 git 查询（`cat-file` / `rev-parse` / `rev-list` / `cherry` / `diff-tree`），不创建、移动、删除任何 tag / ref，不 push，不调用 `gh release` 写操作。`gates` 的 `actions/checkout` 设 `fetch-depth: 0` 使 tag 与历史在 CI 可见。
- **`workflow_dispatch` 补发入口（不改 tag、不升版本）**：tag 已推送但 Release 未完成时，可从 `main` 手跑 `Release` 工作流，输入 `tag`（默认 `v0.2.1`）而不移动 tag。dispatch 运行使用 main 上的 workflow 文件，但 `gates` 与打包矩阵的 `actions/checkout` 都显式 `ref: refs/tags/${{ env.RELEASE_TAG }}`，构建的是该 tag 的源码；`package.json#version` 断言与 tag 版本一致。push `v*` 路径行为不变（gates 先行 → 三平台矩阵 `--publish never` → 单点预建 draft → finalize 唯一公开 Release），两条触发共用同一套步骤，不出现第二套分支逻辑。
- **发布状态文档口径（如实、不预宣称）**：`README.md` 首屏状态行为已发布态——「当前发布状态：v0.2.1 已发布；当前可下载的最新公开 Release 为 [v0.2.1](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.1)」——并说明 v0.2.0 从未公开发布、v0.2.1 用户可见变化与 v0.2.0 相同，且链接指向 `docs/release-notes/v0.2.1.md`；全文不再出现「待发布」或「最新公开 Release 为 v0.1.2」。发布流程段的 `workflow_dispatch` 默认 tag 写作 `v0.2.1`，与 workflow 默认值由测试交叉比对。`docs/release-signing.md` 的发布姿态为「正式版发布姿态（v0.2.1）」并指向 `docs/release-notes/v0.2.1.md`，补发用法默认 `v0.2.1`。两者保留 6 项 Secret 清单、fail-closed 表述与 v0.1.2 漂移事实不变；公证实际结果以那次 CI 为准，不预先宣称未经验证的公证结果。
- **仓库门面**：根目录 `README.md`（定位、核心能力、本地开发与构建打包）与 `LICENSE`（MIT 全文）。
- **打包后硬校验（macOS `.app`，上传前）**：`release.yml` 在 `Build installers` 之后、`Upload installers` 之前对真实产出的 `OpenCompare.app` 做两组硬校验，任一失败即 `::error::` + `exit 1` 且不执行上传——(a) **图标与版本身份**：用 glob / `find release -maxdepth 2` 定位（不写死 `mac-arm64`），读 `Contents/Info.plist` 的 `CFBundleIconFile`（非空、非 `electron.icns`）、对应 `Contents/Resources/<icon>`（无扩展名补 `.icns`，存在、非空、头 4 字节 `icns`）、runner 上可定位 Electron 自带 `electron.icns` 时断言 SHA-256 不同、`Contents/Resources/icon.png` 与 `build/icon.png` SHA-256 相同、`CFBundleIdentifier` 为 `com.opencompare.app`、`CFBundleShortVersionString` 等于 tag 版本（去 `v`）；(b) **签名与公证**：`codesign --verify --deep --strict --verbose=2` 退出 0；`codesign -dv --verbose=4` 含 `Authority=Developer ID Application` / `TeamIdentifier=3X4J53U6RY` / hardened runtime 标志 `runtime` 且不含 `Signature=adhoc`；`xcrun stapler validate` 优先校验打包 `.app`，未直接 staple 时挂载 `release/*.dmg` 校验其中同一 `OpenCompare.app`（失败路径也 `hdiutil detach`）；`spctl -a -vv --type execute` 退出 0 且输出含 `accepted` 与 `Notarized Developer ID`。
- **产物名与 `latest*.yml` 版本强断言**：各平台必需扩展名产物至少各一份（mac `.dmg` / `.zip`、win `.exe`、linux `.AppImage` / `.deb`），文件名含 tag 版本且同扩展名的所有产物都不含其它版本号（防旧版本残留被上传）；保留既有 `latest*.yml#version == tag` 断言与空目录守卫，并追加每个 `files[].url` 与存在时的 `path` 含 tag 版本。
- **唯一公开正式 Release 与资产完整性断言**：`finalize` 后统计该 tag 的 Release，断言 count == 1 且 `draft` 数 == 0、`prerelease` 数 == 0；再断言该 Release 资产非空并覆盖 `.dmg`、`.zip`、`.exe`、`.AppImage`、`.deb` 与 `latest-mac.yml` / `latest.yml` / `latest-linux.yml`，版本化资产名含 tag 版本（只读资产名，不下载内容）。**分页 + jq 组合必须合法**：跨分页聚合一律 `gh api <endpoint> --paginate | jq -s '<program>'`（需要原始字符串的 release id / 资产名用 `jq -s -r`），`--slurp` 不得与 `--jq` / `--template` 同时出现（gh 2.x 直接报 `the --slurp option is not supported with --jq or --template`，会让 finalize 在发布成功后误失败）。**静默通过防线**：count / drafts / prereleases 任一为空或不匹配 `^[0-9]+$`（API 失败、jq 无输出、网络错误）时步骤 `::error::` + `exit 1`，不得让 `[ "" -ne 1 ]` 的 status 2 被 `if` 当作 false 而误判通过；release_id / assets 为空时同样 `exit 1`。
- **上传路径无绕行（fail-closed 显式化）**：`release.yml` 全文不含 `continue-on-error: true`、`|| true`、`--no-verify`，上传步骤不带 `if: always()`；硬校验步骤顺序固定为 六项 Secret 检查 → `.p8` 物化 → `Build installers` → 图标/版本身份 → 签名/公证 → 产物名与 `latest*.yml` → `Upload installers`。
- **发布配置断言单测**：Node 环境下读取仓库根配置做断言（`src/main/release-packaging.test.ts`，`node:fs` + `node:path`，不 import Electron），让缺失字段在 `pnpm test` 失败而非 tag 触发的 CI 才暴露。
- **本机发版产物取证与证据落盘**：在 macOS 上对 `v*` tag 触发的**真实公开 Release 产物**做只读取证，证据写入 `docs/release-evidence/<tag>.md`（当前 `v0.2.1.md`；`v0.2.0.md` 保留为历史，v0.2.0 永不发布故其记录不会转 verified）。流程 = **只读就绪门**（`git ls-remote --tags origin refs/tags/<tag>`、`gh api .../contents/package.json?ref=<tag>`、`gh release view <tag> --json tagName,isDraft,isPrerelease,url,assets` 确认恰好一个公开非 draft 非 prerelease Release 且含含版本号的 dmg / zip / `latest-mac.yml` / `latest.yml`）→ **下载到仓库外临时目录**（记录绝对路径、下载时间、来源 URL，产物二进制不入库）→ **记录 SHA-256 与字节数** → **两条独立解包路径**（zip 用 `ditto -x -k`，dmg 用 `hdiutil attach -nobrowse -readonly -mountpoint`，结束含失败路径必须 `hdiutil detach`）→ 对两个 `OpenCompare.app` 各跑 `codesign --verify --deep --strict --verbose=2` / `codesign -dv --verbose=4` / `xcrun stapler validate` / `spctl -a -vv --type execute` → **签名身份与图标事实**（`Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、hardened runtime `(runtime)`、不含 `Signature=adhoc`；`CFBundleIconFile` 非空非 `electron.icns`、对应 icns 路径与 SHA-256、`Contents/Resources/icon.png` 与 `build/icon.png` 同 SHA-256、`CFBundleIdentifier`、`CFBundleShortVersionString`）→ **版本一致性核对**（产物名 / `latest*.yml#version` 与 `files[].url` / `CFBundleShortVersionString` / tag 全为同一版本）。
- **取证 blocked 分支**：就绪门任一条件不满足即**立即停手并升级 Owner**，证据文档写 `status: blocked`，只记录探查命令原始输出、缺失项与待人工动作（打 tag / 触发 CI / 下载产物）；不得写入任何「通过」输出或 sha256，不得用本地 `release/` 目录、本地打包或未签名产物替代。
- **证据只读断言单测**：`src/main/release-evidence.test.ts` 只读解析证据 Markdown（不下载、不解包、不挂载、不签名、不写 git），文件缺失、`status` 非 `verified`/`blocked`、`verified` 分支缺任一必需标记、`blocked` 分支出现通过标记时 `pnpm test` 失败。
- **发布状态翻转（翻转而非删断言）**：Release 真正完成后的状态口径翻转是一次独立动作——`README.md` 第 5 行 blockquote 由「待发布 + 最新公开 Release 为上一版」改为「`v0.2.4 已发布` + 指向该 Release 的下载链接」，签名 / 公证 / 6 项 Secret / fail-closed 文案逐字保留；「版本与下载」表中当前版本行改「已发布（最新公开 Release）」并链 `releases/tag/v0.2.4`，上一版行降级为「已发布（上一版）」，未发布版本行保持「未发布，内容并入 v0.2.4」且无 Release 链接；`docs/release-signing.md` 第 5 行「当前状态」同步翻转。`src/main/release-packaging.test.ts` 中原先断言「`${currentTag} 待发布`」的用例**逐条翻转**为断言「已发布 + Release 链接」，断言总数不减少、不删除、不放宽。
- **更新元数据一致性（修未来，不动已发布资产）**：`electron-builder.yml` 的 `nsis` 段显式 `artifactName: '${productName}-Setup-${version}.${ext}'`（去空格），使磁盘产物名与 `latest.yml` 的 `files[].url` 模板对齐，消除 `OpenCompare Setup <ver>.exe` → GitHub 规范化 `OpenCompare.Setup.<ver>.exe` 与元数据连字符模板的分叉；`release.yml` 的 `finalize` 在「资产完整性」之后、「latest 门」之前新增 fail-closed 步骤：取该 Release 资产名集合，对每份 `latest*.yml` 的 `files[].url`（含存在时的 `path`）做成员校验，任一缺失即 `::error::` + `exit 1`，且全程只读（无 `gh release upload|edit|create|delete`、无 `--method POST/PATCH/PUT/DELETE`）；Linux 打包 job 新增 AppImage blockmap 自洽断言（文件末 4 字节小端 uint32 == `latest-linux.yml` 该条目的 `blockMapSize`），并明确不要求独立 `*.AppImage.blockmap` 资产。
- **发布深度取证与已知问题如实登记**：`docs/release-evidence/v0.2.4.md` 记录 CI run `39692988051` 五个 job 结果、11 个资产 sha256 全表、mac 签名 + 公证 + `stapler validate` + `spctl accepted` 原文（每条标明来源 = CI 日志 / 本机复核）、`latest` 门与单 Release 原文，以及 `latest.yml` Windows url 不一致的 P2 遗留（只记录，不改写已发布资产）；`README.md`「已知问题」段在保留既有两条「当前版本已修复」条目之外，新增恰好三条标「已知未修 + 影响」的条目（内存增长 849 → 1,510 MB 未 OOM、`ECANCELED` 日志噪声不影响取消结果、符号链接计数放大仅影响显示），不得写成已修复、不得删除既有条目。**口径变更（v0.2.5 前）**：符号链接「不跟随」口径落地后，README 已删除「符号链接计数放大（已知未修）」条目并改写悬空链接条目，`## 已知问题` 现为两条「当前版本已修复」+ 两条「已知未修」（内存 / `ECANCELED`）；`release-packaging.test.ts` 的「已知未修」条数与措辞断言已同步重定标。v0.2.5 发布说明 / CHANGELOG / 剩余两条已知问题的版本归因仍由 `release-025` 处理，本域其他历史 AC（`ac-notes-v024-known-issues` / `ac-readme-known-issues-unfixed` 等）按其交付时点原样保留。

- **v0.2.5 发布就绪（版本单点 / 已知问题归因 / 证据骨架 / 本地元数据校验）**：`package.json#version` = `0.2.5`，`CHANGELOG.md` 新增 `## v0.2.5`（在 `## v0.2.4` 之上，含「修复」「升级方式」），新增 `docs/release-notes/v0.2.5.md` 与 `docs/release-evidence/v0.2.5.md`（`status: pending`，只留回填位不填值）；`README.md` 首屏状态行 / 版本与下载表 / 发布流程默认 tag、`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-signing.md` 五处同步到 `v0.2.5`；README「已知问题」的「已知未修」条数降为 0（内存与 `ECANCELED` 两条翻为「已在 v0.2.5 修复」并引用真实证据，不删既有条目）；新增 `scripts/release-metadata.mjs` + `pnpm release:metadata` 对 `release/` 与资产名清单做 `latest*.yml` url 成员校验与 Windows 旧错位名 0 命中校验，规则与 CI 既有 `Assert latest*.yml urls match the release assets` 等价，零网络零新增依赖。**「待发布」是既定交付姿态**：真实 `v0.2.5` Release 由人/Host 打 tag 后产出，发布后回填与 README 状态翻转是独立动作。
- **v0.2.5 发布后取证与 `verified` 翻转**：真实 `v0.2.5` Release finalize 之后做**只读取证 + 文档/测试翻转**——`gh run view` / `gh release view` 复核 5 个 job 全 `success`、Release 非 draft 非 prerelease、资产恰好 11 件；`gh release download` 到仓库外临时目录后逐件 `wc -c` + `shasum -a 256` 并与 GitHub API `.assets[].size` / `.digest` 对齐；dmg `hdiutil attach` 挂载、zip `ditto -x -k` 解包，对两套 `.app` 各跑 `codesign --verify --deep --strict --verbose=2` / `codesign -dv --verbose=4` / `xcrun stapler validate` / `spctl -a -vv --type execute`；本地 `pnpm release:metadata --dir` 复核三份 `latest*.yml` 全命中与 Windows 旧错位名 0 命中。把 `docs/release-evidence/v0.2.5.md` 的 `status: pending` 翻为 `verified` 并填满第 2～5 节，把 `src/main/release-evidence.test.ts` 的 v0.2.5 pending 块改写为 verified 断言块（含负向夹具）。**前置硬门先于回填**：run 未结束 / 失败、仍 draft、资产数 ≠ 11 时只报 blocked，证据文件保持 `pending`、零 sha256、零通过标记。README / signing 的「待发布 → 已发布」翻转与两处符号链接证据文档断头路收口不属本域（后者见 `symlink-semantics`）。

## 验收

- **ac-pkg-metadata**：`package.json` 的 `author` 为对象且含非空 `email`，`license` 为 `MIT`，`homepage` 指向 `https://github.com/chaxiu/OpenCompare`。
- **ac-deb-maintainer**：`electron-builder.yml` 的 `linux.maintainer` 显式设置且含 email；electron-builder 不再因缺少 author email / maintainer 而在构建 `.deb` 时报错。
- **ac-linux-targets-kept**：`linux.target` 仍为 `AppImage` 与 `deb` 两项（未通过删除 `deb` 规避失败）。
- **ac-publish-release**：`electron-builder.yml` 声明 `publish.provider: github` 与 `releaseType: release`；据此（或 release.yml 的预建唯一 Release + `gh release upload` + finalize 收尾步骤）打 `v*` tag 后产出的 Release 不再停留在 Draft。
- **ac-release-workflow**：`.github/workflows/release.yml` 仍为 `v*` tag 触发、`gates` 先行；发布路径可保证 Release 对仓库外可见，且每个 tag 恰好一个 Release。
- **ac-single-precreate**：`gates` Job 在矩阵启动前存在单点预建唯一 Release 的步骤，带 `GH_TOKEN` 与 `GH_REPO`，使用 `gh release create ... --draft --generate-notes`（不存在时才创建；存在重复同名 Release 时清理多余、只留一个）。
- **ac-no-concurrent-publish**：`release` 矩阵中 `electron-builder` 参数为 `--publish never`，不再有 `--publish always`；打包产物仅落到本地 `release/`。
- **ac-upload-clobber**：`release` 矩阵在打包后有 `gh release upload "${RELEASE_TAG}" ... --clobber --repo "${GITHUB_REPOSITORY}"` 步骤，汇聚上传三端安装包与元数据（dmg/zip/exe/AppImage/deb/blockmap/latest*.yml），且能在 windows runner 的默认 shell 下正常运行。
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

- **ac-pkg-version-020（版本口径已由 v0.2.1 项提升）**：当时 `package.json#version` 严格等于 `0.2.0` 且符合 semver；当前版本以本节之后的 `ac-pkg-version`（`0.2.1`）为准。
- **ac-changelog-v020-section**：`CHANGELOG.md` 含 `## v0.2.0` 段，且出现在 `## v0.1.2` 段之前（新版本在上）。
- **ac-changelog-v020-content**：`## v0.2.0` 段文本同时包含「新建对比」「路径」「启动参数」或 `opencompare://`「图标」关键词，覆盖本版用户可见变化。
- **ac-release-notes-file**：`docs/release-notes/v0.2.0.md` 存在且非空，首个一级标题包含 `v0.2.0`。
- **ac-release-notes-no-placeholder**：`docs/release-notes/v0.2.0.md` 不含 `TODO` / `TBD` / `FIXME` 占位。
- **ac-release-notes-version-single-source**：测试从 `docs/release-notes/v0.2.0.md` 标题提取版本号，断言其等于 `package.json#version`（改版本而漏改 Release Notes 时该用例失败）。
- **ac-readme-posture-v020（口径已由 v0.2.1 项取代）**：当时 `README.md` 的发布状态行包含 `v0.2.0` 并链接 `docs/release-notes/v0.2.0.md`，状态为「v0.2.0 待发布；当前可下载的最新公开 Release 为 v0.1.2」；现在状态行改为 `v0.2.1` 口径（见下 `ac-readme-status`），「不预宣称已发布」的性质不变。
- **ac-signing-doc-posture-v020（口径已由 v0.2.1 项取代）**：当时 `docs/release-signing.md` 的正式版发布姿态段标注 `v0.2.0`；现改为「正式版发布姿态（v0.2.1）」并链接 `docs/release-notes/v0.2.1.md`，`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 六项与 fail-closed 表述原样保留。
- **ac-drift-facts-changelog**：`CHANGELOG.md` 含 `v0.1.2` 漂移事实：commit `7ea2cc6`、tag 对象 `c4a6a95`（annotated）、`v0.1.2` 是 main 的祖先、规划基线领先 13 个提交、远端 Release 公开且非预发布、11 个资产。
- **ac-drift-facts-signing-doc**：`docs/release-signing.md` 含同一组 `v0.1.2` 只读事实（commit `7ea2cc6`、祖先关系、13 个提交基线、11 个资产、公开非预发布）。
- **ac-drift-no-action-statement**：两处文档都含不动作声明，同时出现「不删除」「不移动」「不重打」「不替换」；承接版本按文档各自保留——`CHANGELOG.md` 的 v0.2.0 条目仍写「tag 之后的修复由 v0.2.0 承接」，`docs/release-signing.md` 改为「由 v0.2.1 承接」。
- **ac-test-tag-ancestor（已被取代）**：原「测试用只读 git 命令断言 `v0.1.2` 与 HEAD 的祖孙关系」的用例已删除，改由下面「发布测试套件环境自包含」项在 `os.tmpdir()` fixture 中覆盖同一语义；测试不再读取本仓真实 tag。
- **ac-test-tag-version-match（已被取代）**：原 `git show v0.1.2:package.json` 断言已删除；`0.1.2` 版本事实只由 `CHANGELOG.md` / `docs/release-signing.md` 的只读文档断言（`driftFacts`）覆盖。
- **ac-test-skips-without-git-metadata（已被取代）**：`gitMetadataSkipReason` / `it.skipIf` 机制已移除——测试不再因缺少 `.git` 或 tag 而 skip，而是在任何检出（干净 clone、源码 tarball、无 git）下按同一路径全跑。
- **ac-test-assertions-are-read-only（口径收窄）**：测试对仓库根只读**文件**（`node:fs` 读配置 / 文档），不再在仓库根执行任何 git 子命令；所有 git 调用只发生在 `os.tmpdir()` 下的 fixture 仓库，测试源码中不出现对仓库根执行 `git tag`、`git push`、`git fetch`、`git merge`、`git rebase` 或 `gh release` 的代码路径。
- **ac-ci-preflight-tag-ancestor**：`release.yml` 的 `gates` job 在 `pnpm test` 之前有只读祖先门 step，接受「`v0.1.2` 是 `HEAD` 严格祖先」或「仅 tag 可达提交逐条补丁等价（`git cherry` 全 `-`）」两种通过形态，并保留 `v0.1.2..HEAD` 领先提交数非零要求；任何失败形态以 `::error::` 输出并 `exit 1`。
- **ac-ci-preflight-git-metadata**：`gates` job 的 `actions/checkout` 设置 `fetch-depth: 0`，使 tag 与历史在 CI 可见（与 preflight 断言配套）。
- **ac-ci-preflight-version-semver**：前置门在版本比对前拒绝非 semver 的 `package.json#version`（如 `0.2`、`v0.2.0`），以 `::error::` 失败退出。
- **ac-latest-yml-gate-preserved**：`release.yml` 仍保留「Assert packaged version matches the tag」步骤，逐个校验 `release/latest*.yml` 的 `version` 等于 tag，且无匹配文件时报错退出；测试断言该步骤与 glob / 空目录守卫未被删除。
- **ac-release-model-unchanged**：测试断言发布模型未被改写：仍为 tag 触发、`gates` 先跑、矩阵 `--publish never`、单点预建 draft、`finalize` 公开，且 workflow 引用的 secrets 集合仍为六项 + `GITHUB_TOKEN`。
- **ac-existing-v012-assertions-updated**：原先锁定「README 是 v0.1.2 正式版」「签名文档是 v0.1.2 姿态」的两条用例改为断言 v0.2.0 口径（不是删除覆盖），同时 README / 签名文档仍保留 `v0.1.2` 漂移说明。
- **ac-changeset-scope**：本项改动文件仅限 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`docs/release-notes/v0.2.0.md`、`src/main/release-packaging.test.ts`、`.github/workflows/release.yml`；不含 tag、Release、资产或签名配置改动。
- **ac-no-publish-side-effects**：`release.yml` 中既有的 `gh release create` / `upload` / `edit` 调用保持原样、不新增任何发布调用，且本项不引入执行 `git tag` / `git push` 的脚本或 npm script；本项结束时远端的 tag、Release 与 11 个 v0.1.2 资产保持原状。

### 发版流水线加固：图标 / 版本断言、签名公证硬校验与唯一公开 Release

- **ac-app-located**：mac 矩阵在打包后有步骤定位 `OpenCompare.app`（`release/mac*/OpenCompare.app` 或等价 glob）；找不到时输出 `::error::` 并 `exit 1`。
- **ac-plist-icon-file**：断言 `Contents/Info.plist` 的 `CFBundleIconFile` 非空、非 `electron.icns`；为空或为默认名时 `::error::` + `exit 1`。
- **ac-icon-resource-exists**：断言 `Contents/Resources/<CFBundleIconFile>`（无扩展名时补 `.icns`）存在、字节数 > 0、前 4 字节为 `icns`；否则失败退出。
- **ac-icon-not-electron-default**：当 `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` 等 Electron 默认图标可定位时，断言打包图标 SHA-256 与之不同；不可定位时该比较跳过但「非 `electron.icns` 名」断言仍生效。
- **ac-app-resource-png-matches**：断言 `Contents/Resources/icon.png` 的 SHA-256 与仓库 `build/icon.png` 相同；不同即失败退出。
- **ac-app-bundle-identity**：断言 `CFBundleIdentifier == com.opencompare.app`、`CFBundleShortVersionString == ${RELEASE_TAG#v}`（RELEASE_TAG 为解析后的 tag，push 与 dispatch 同源）；任一不等即失败退出。
- **ac-codesign-verify-deep-strict**：对上述 `.app` 执行 `codesign --verify --deep --strict --verbose=2`；非零退出即 `::error::` + `exit 1`。
- **ac-codesign-developer-id**：`codesign -dv --verbose=4` 输出含 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY` 与 hardened runtime 标志 `runtime`，且不含 `Signature=adhoc`；任一不满足即失败退出。
- **ac-stapler-validate**：`.app` 的 `xcrun stapler validate` 退出 0；未被直接 staple 时从 `release/*.dmg` 挂载并对其中的 `OpenCompare.app` 校验成功；两者皆失败即 `::error::` + `exit 1`，且挂载在失败路径也会 detach。
- **ac-spctl-notarized**：对同一 `.app` 执行 `spctl -a -vv --type execute`，退出 0 且合并输出含 `accepted` 与 `Notarized Developer ID`；否则失败退出。
- **ac-checks-before-upload**：上述图标 / 证书 / 公证 / 产物名 / `latest*.yml` 校验步骤都出现在 `Upload installers to the tag's release` 之前；`release.yml` 全文不含 `continue-on-error: true`、`|| true`、`--no-verify`，上传步骤不带 `if: always()`。
- **ac-credentials-before-build**：6 项 Secret 齐备检查步骤索引早于 `Build installers`；缺失时错误信息含缺失 Secret 名与 `docs/release-signing.md`，并以非零码退出。
- **ac-artifact-names-versioned**：mac 至少有 `.dmg` 与 `.zip`、win 至少有 `.exe`、linux 至少有 `.AppImage` 与 `.deb` 的产物，文件名均含 `${RELEASE_TAG#v}`；同扩展名出现不含该版本的文件时断言失败。
- **ac-latest-metadata-urls**：保留既有 `latest*.yml` 的 `version == tag` 断言与空目录守卫，并断言每个文件的 `files[].url`（及存在时的 `path`）含 tag 版本；任一不符即失败退出。
- **ac-finalize-single-public**：`finalize` 用 `gh api --paginate` 统计该 tag 的 Release，断言 count == 1、draft 数 == 0、prerelease 数 == 0；否则 `::error::` + `exit 1`。
- **ac-finalize-assets-complete**：断言该 Release 资产数 > 0，且至少各一份 `.dmg`、`.zip`、`.exe`、`.AppImage`、`.deb`、`latest-mac.yml`、`latest.yml`、`latest-linux.yml`；版本化资产名含 tag 版本，否则失败退出。
- **ac-tests-cover-mac-checks**：`release-packaging.test.ts` 新增断言覆盖 `.app` 定位、`CFBundleIconFile`、`icns` 资源、非 Electron 默认、`icon.png` 同源、bundle 身份与版本，以及 `codesign` / `stapler` / `spctl` 三条命令与失败退出。
- **ac-tests-cover-artifacts-and-release**：新增断言覆盖全平台产物名版本、`latest*.yml` 的 url/path 版本、`finalize` 分页唯一性（`--paginate`、`draft`、`prerelease`）与资产完整性。
- **ac-tests-order-fail-closed**：新增断言覆盖步骤顺序（凭据检查 → 打包 → 图标/版本 → 签名/公证 → 上传）与无 `continue-on-error` / `|| true` 降级路径；既有 fail-closed 断言（六项 Secret、`::error::`、`exit 1`）保持不变。
- **ac-tests-preserve-existing**：`release-packaging.test.ts` 既有用例一条未删、未放宽（发布模型、`--publish never`、预建唯一 draft、`--clobber`、`finalize --draft=false --latest`、六 Secrets 集合、版本闸、漂移事实、图标与关于断言全保留），`pnpm test` 全绿。
- **ac-docs-hard-verification**：`docs/release-signing.md` 新增「打包后硬校验」小节，明确列出 `codesign --verify --deep --strict`、`xcrun stapler validate`、`spctl -a -vv` 三条命令、失败即终止且不上传，以及唯一公开正式 Release 断言；`README.md` 发布流程包含对应一句说明；六项 Secret 清单与 v0.1.2 漂移记录原样保留。
- **ac-ci-model-unchanged**：`electron-builder.yml` 无功能性改动（`appId` 仍 `com.opencompare.app`、`productName` 仍 `OpenCompare`、`mac.identity`、`hardenedRuntime`、`notarize: true`、三平台 targets、`publish` 段不变）；`release.yml` 仍为 `v*` tag 触发、`gates` 先行、`--publish never`、单点预建 draft、`finalize --draft=false --latest`。
- **ac-secrets-set-unchanged**：workflow 引用的 Secrets 集合仍为 6 项签名公证 Secrets + `GITHUB_TOKEN`，不新增、不改名、不读取凭据值。
- **ac-no-remote-writes-added**：本项不新增 `git tag` / `git push` / `gh release create|edit|upload|delete` 调用（既有预建/上传/公开步骤保持原样），不执行任何远端写操作，不创建或公开 Release。
- **ac-gates-green**：不新增依赖，`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:web` 全部通过。

### 本机发版产物取证证据（v0.2.0）

- **ac-evidence-doc-exists**：`docs/release-evidence/v0.2.0.md` 存在、非空，标题含 `v0.2.0`，且含 `status:` 字段，取值为 `verified` 或 `blocked`。
- **ac-readiness-readonly**：文档记录 `git ls-remote --tags origin refs/tags/v0.2.0` 与 `gh release view v0.2.0 ...` 的原始输出；本 WI 的改动路径中不含任何 tag / Release / 上传动作产生的远端变化（`git tag --list v0.2.0` 在本机仍非本 WI 创建）。
- **ac-artifact-provenance**：`status: verified` 时，文档记录 dmg 与 zip 的 Release 资产名、下载 URL、下载到仓库外的本地绝对路径与下载时间，且全文不以仓库 `release/` 本地构建目录或本地打包产物作为证据来源。
- **ac-sha256-recorded**：`status: verified` 时，dmg 与 zip 各自记录 `shasum -a 256` 的 64 位小写十六进制值与字节数，且与文档中产物文件名一一对应。
- **ac-codesign-verify-both**：`status: verified` 时，zip 解包（`ditto -x -k`）与 dmg 挂载（`hdiutil attach -nobrowse -readonly`）得到的两个 `OpenCompare.app` 都记录了 `codesign --verify --deep --strict --verbose=2` 原始输出，且每份输出含 `valid on disk` 与 `satisfies its Designated Requirement`。
- **ac-stapler-both**：`status: verified` 时，两个 app 的 `xcrun stapler validate` 原始输出都含 `The validate action worked!`。
- **ac-spctl-both**：`status: verified` 时，两个 app 的 `spctl -a -vv --type execute` 原始输出都含 `accepted` 与 `source=Notarized Developer ID`，且退出码为 0。
- **ac-signing-identity**：`status: verified` 时，文档记录 `codesign -dv --verbose=4` 中的 `Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、`flags=...(runtime)`，且该输出不含 `Signature=adhoc`。
- **ac-icon-facts**：`status: verified` 时，文档记录 `CFBundleIconFile`（非空且非 `electron.icns`）、`Contents/Resources` 下对应 icns 的实际路径与 SHA-256、`Contents/Resources/icon.png` 与仓库 `build/icon.png` 的 SHA-256 相同。
- **ac-version-consistency**：`status: verified` 时，dmg / zip 文件名、`latest-mac.yml` 与 `latest.yml` 的 `version` 及 `files[].url`、`CFBundleShortVersionString` 均为 `0.2.0`，且 Release 的 `tagName` 为 `v0.2.0`。
- **ac-dmg-detached**：dmg 取证结束后记录 `hdiutil detach` 命令与输出，且文档记录取证后无残留挂载点。
- **ac-blocked-no-fabrication**：`status: blocked` 时，文档只含就绪门命令与原始输出、缺失项、待人工动作与升级说明，不含任何 `valid on disk` / `The validate action worked!` / `source=Notarized Developer ID` 的「通过」记录、不含产物 sha256，也不出现本地打包或仓库 `release/` 产物；同时已向 Owner 升级等待产物。
- **ac-doc-assertion**：`pnpm test` 中的只读文档断言覆盖该证据文件：文件缺失、`status` 非 `verified`/`blocked`、`verified` 分支缺少任一必需标记（两处 `valid on disk`、两处 `The validate action worked!`、两处 `accepted` + `source=Notarized Developer ID`、两个 sha256）或 `blocked` 分支出现通过标记时测试失败。
- **ac-no-artifacts-committed**：本 WI 的改动文件只有证据 Markdown（及只读断言测试），dmg / zip / `.app` / 解包目录等产物不进入 git 变更。

### v0.2.0 祖先门补丁等价语义与 dispatch 补发入口

- **ac-ancestry-patch-equivalent**：当 `v0.1.2` 不是 `HEAD` 严格祖先、但所有仅 `v0.1.2` 可达提交逐条 `git cherry HEAD` 判定均为 `-` 时，祖先门退出码为 0，流程继续。
- **ac-ancestry-per-commit-log**：门日志对每个仅 tag 可达提交打印完整 SHA 与判定符号（`-` / `+`），便于人工复核。
- **ac-ancestry-ref-type-log**：门日志打印 `v0.1.2` 的 ref 类型（轻量 / annotated，取自 `git cat-file -t` 为 `commit` / `tag`）以及解析到的 commit SHA。
- **ac-ancestry-true-fork**：任一仅 tag 可达提交判定为 `+` 时，门输出 `::error::` 并以非零码退出，后续质量门禁、打包矩阵与 finalize 均不运行。
- **ac-ancestry-enumeration-fail**：仅 tag 可达提交无法枚举（`git rev-list` 失败、tag 不可解析等）时，门非零退出（fail-closed），不得按通过处理。
- **ac-ancestry-protected-deletion**：任一仅 tag 可达提交的 diff 删除发布关键路径（`.github/workflows/`、`build/`、`electron-builder.yml`、`package.json`）时，即使 `git cherry` 判为 `-`，门仍非零退出。
- **ac-ancestry-ahead-nonzero**：保留原有非零领先要求：`v0.1.2..HEAD` 提交数为 0 时门非零退出（发布必须携带 tag 之后的修复）。
- **ac-ancestry-readonly**：祖先门只做只读 git 查询；整个 workflow 与测试不创建、不移动、不删除任何 tag / ref，不 push，不调用 `gh release` 写操作，输出不含任何 secret 值。
- **ac-dispatch-entry**：`release.yml` 声明 `workflow_dispatch`，输入名 `tag`，默认值等于当前版本 tag（现为 `v0.2.1`，由测试从 `package.json#version` 推导）；不依赖 push tag 即可启动。
- **ac-dispatch-tag-validation**：dispatch 输入的 tag 不匹配 `^v[0-9]+\.[0-9]+\.[0-9]+$`，或 `refs/tags/<tag>` 在 checkout 中不存在时，工作流在构建前非零退出。
- **ac-dispatch-build-ref**：dispatch 运行的 gates 与 release 矩阵 checkout 均显式使用 `ref: refs/tags/<tag>`（tag 为解析后的输入 / 触发 tag），`package.json#version` 取自该 tag 且与 tag 版本一致。
- **ac-dispatch-tag-normalization**：所有 tag 相关逻辑（版本断言、Release 创建、上传、公开、唯一 Release 与资产校验）使用统一解析的 `RELEASE_TAG`；dispatch 路径下不得把分支名 `GITHUB_REF_NAME`（`main`）当作 tag 使用。
- **ac-push-unchanged**：push `v*` 触发路径仍存在且行为不变：gates 先行 → 三平台矩阵 `--publish never` → 单点预建 draft → finalize 唯一公开 Release；步骤顺序与现有硬校验全部保留。
- **ac-gate-before-install**：祖先门与版本一致性校验位于 `pnpm install` / `pnpm test` 之前（快速失败）。
- **ac-tests-equivalence**：测试在 `os.tmpdir()` 临时 git 仓库构造「tag-only 提交补丁已等价存在于 HEAD」场景，执行 workflow 中真实的门脚本，断言退出 0 且输出含该提交 SHA 与 `-`。
- **ac-tests-divergence**：测试用临时 git 仓库构造两类拒绝场景——存在判定为 `+` 的 tag-only 提交；tag-only 提交删除受保护路径——断言门非零退出。
- **ac-tests-dispatch-workflow**：测试断言 `workflow_dispatch` 入口存在、输入 `tag` 默认值等于 `` `v${pkg.version}` ``（不再硬编码旧版本）、checkout `ref` 为 `refs/tags/<tag>`、tag 相关步骤不再使用 `${GITHUB_REF_NAME}`。
- **ac-tests-failclosed**：测试断言门失败路径有显式 `exit 1` / 非零返回，且发布路径无 `|| true`、`continue-on-error` 等绕行。
- **ac-docs-ancestry**：`docs/release-signing.md` 记录新语义（严格祖先 **或** 逐提交补丁等价；`+` 或无法枚举均 fail-closed）与逐条日志口径，同时保留现有 v0.1.2 漂移事实与「不删除、不移动、不重打、不替换」承诺。
- **ac-docs-rerun**：`docs/release-signing.md` 写明补发用法：从 main 手跑 `workflow_dispatch`，输入 `tag` 默认等于当前 tag（现为 `v0.2.1`），构建取 `refs/tags/<tag>`，不改 tag、不升版本。
- **ac-readme-status（口径已由 v0.2.1 项取代）**：当时状态行改为「v0.2.0 待发布；当前可下载的最新公开 Release 为 v0.1.2」，不再出现「正式版 v0.2.0」的已发布口径；当前状态行见下 `ac-readme-status`（v0.2.1 版）。
- **ac-no-version-or-config-drift（版本部分已由 v0.2.1 项取代）**：当时 `package.json#version` 仍为 `0.2.0`；`appId` / `productName` / 签名身份 `Tao Zhu (3X4J53U6RY)` / targets / 依赖均未改——后四项至今不变，版本按 `ac-pkg-version` 升为 `0.2.1`。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全绿。

### 发布测试套件环境自包含（干净 clone + 隔离 HOME 可复现）

- **ac-ci-failure-reproduced**：复现以硬证据为前置——CI run `#39354321895` 的 gates 日志显示 checkout 的是 tag `v0.2.0` = `285ee28`，唯一失败用例 `release version gate > keeps v0.1.2 as an ancestor of HEAD with a non-zero lead` 报 `AssertionError: expected 2 to be +0`（旧 tag 树 336 行 `expect(behind).toBe(0)`）；在临时干净 clone（`v0.1.2` 指向远端轻量 tag `bb0c0b1`、空白临时 HOME）下 `pnpm test` 复现同一条断言，交付说明记录完整命令与原始输出后才动断言。
- **ac-no-repo-git-read**：测试源码不再通过 `git` 读取仓库根 `.git` 或真实 tag——`gitMetadataSkipReason`、`driftTag` 的 `rev-list` / `show` / `cherry` 断言、repo-root `git()` 只读 helper 均已移除；有源码级断言（测试文件内不含 `cwd: repoRoot` 形式的 git 调用、不含已删除标识符，且必须含隔离 env 标记）。
- **ac-fixture-isolated-global-config**：临时 HOME 的 `.gitconfig` 含 `commit.gpgSign=true`、`tag.gpgSign=true`、`init.defaultBranch=trunk`、`core.hooksPath=/nonexistent` 时 `pnpm test` 仍全绿（改动前 7 个 ancestry fixture 用例因 `gpg failed to sign the data` 失败，可复现）。
- **ac-fixture-no-network**：fixture 仓库全部在 `os.tmpdir()` 下自建（独立 `opencompare-ancestry-*` 目录 + 独立 HOME），不读写仓库内外的持久 git 状态、不访问网络；`finally` 中用 `rmSync(dir, { recursive: true, force: true })` 清理，测试结束不留 tmpdir。
- **ac-strict-ancestor-positive**：新增 fixture 用例覆盖 `v0.1.2` 为 HEAD 严格祖先且 `v0.1.2..HEAD` 领先 >0 的场景，日志含 `ref type=tag (annotated) commit=<sha>` 与 `is a strict ancestor of HEAD`，退出码 0。
- **ac-tag-types**：annotated 与 lightweight 两种 tag 在同一 patch-equivalent 场景下分别输出 `ref type=tag (annotated)` / `ref type=commit (lightweight)` 且退出码 0。
- **ac-gate-fail-closed**：divergent（`git cherry` 判 `+`）、仅有提交删除 `electron-builder.yml`、tag 不可见、`v0.1.2..HEAD` 为 0 四种场景均输出 `::error::` 且退出码非 0。
- **ac-gates-green**：本项改动后 `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全部退出码 0。
- **ac-clean-clone-green**：干净 clone（单分支、`fetch-depth: 0` 等价完整历史）+ 空白临时 HOME 下 `pnpm install --frozen-lockfile` 与 `pnpm test` 全绿；交付说明记录命令与通过计数。
- **ac-release-semantics-untouched**：diff 不含 `.github/workflows/release.yml`、`electron-builder.yml`、`package.json` 依赖或脚本变更；无 tag / Release / push 操作（祖先门脚本仍作为被测对象从 workflow 原样读取并执行，不改成仓库脚本）。

### v0.2.1 首发替代（v0.2.0 未发布）

- **ac-pkg-version**：`package.json#version` 等于 `0.2.1`，且仍匹配 `^\d+\.\d+\.\d+$`。
- **ac-notes-v021**：`docs/release-notes/v0.2.1.md` 存在且非空；首个 H1 含 `v0.2.1`，其中解析出的版本号等于 `package.json#version`；正文覆盖「新建对比」「路径」「启动参数」「opencompare://」「图标」「原位写回」等 v0.2.0 用户可见项；不含 `TODO` / `TBD` / `FIXME`。
- **ac-notes-v020-history**：`docs/release-notes/v0.2.0.md` 仍然存在且首个 H1 仍含 `v0.2.0`（历史记录不被删除或改写）。
- **ac-changelog-order**：`CHANGELOG.md` 中 `## v0.2.1` 的下标小于 `## v0.2.0` 的下标，后者又小于 `## v0.1.2` 的下标。
- **ac-changelog-content**：`## v0.2.1` 到 `## v0.2.0` 之间的段落同时包含「v0.2.0 从未公开发布」「用户可见变化相同」与「发布门测试不依赖本机 git 状态」三层含义，并保留上述 v0.2.0 用户可见关键词。
- **ac-readme-status（口径已更新为已发布态，见下节 `ac-readme-line5`）**：当时 `README.md` 首屏发布状态 blockquote 含「当前发布状态：v0.2.1 待发布」「最新公开 Release 为 v0.1.2」，并含链接 `docs/release-notes/v0.2.1.md`；不再出现「当前发布状态：v0.2.0 待发布」「正式版 v0.2.0」「发布状态：冻结」。v0.2.1 真实发布后该口径改为「已发布 + `releases/tag/v0.2.1` 链接」，旧的「待发布」断言不再成立。
- **ac-readme-dispatch-default**：`README.md` 发布流程段里 `workflow_dispatch` 默认 tag 写作 `v0.2.1`，与 workflow 默认值一致。
- **ac-signing-posture**：`docs/release-signing.md` 含「正式版发布姿态（v0.2.1）」标题与 `docs/release-notes/v0.2.1.md` 链接；不含「发布冻结」；v0.1.2 漂移事实（`7ea2cc6`、`c4a6a95`、`annotated`、祖先、`13 个提交`、`公开`、`非预发布`、`11 个资产`）与「不删除 / 不移动 / 不重打 / 不替换」声明仍在。
- **ac-workflow-dispatch-default**：`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.1'`；`push.tags` 仍为 `v*`，`RELEASE_TAG` 仍为 `${{ inputs.tag || github.ref_name }}`，`ref: refs/tags/${{ env.RELEASE_TAG }}` 仍恰好出现 2 次，gates → 打包矩阵 → finalize 的顺序不变。
- **ac-packaging-test-sync**：`src/main/release-packaging.test.ts` 断言 package.json 版本为 `0.2.1`、release notes 路径为 `docs/release-notes/v0.2.1.md`、dispatch 默认 tag 为 `v0.2.1`、CHANGELOG 段序与 README 口径；版本断言优先从 `package.json` 推导（`currentVersion` / `currentTag`），文件中不再残留指向 v0.2.0 作为「当前版本」的字面量。
- **ac-evidence-v021**：`docs/release-evidence/v0.2.1.md` 存在且非空，含 `v0.2.1`；`status:` 为 `blocked`；含 `git ls-remote --tags origin refs/tags/v0.2.1`、`gh release view v0.2.1 --repo chaxiu/OpenCompare`、`release not found` 与「缺失项」「待人工动作」「升级」段落；不含 `valid on disk` / `satisfies its Designated Requirement` / `The validate action worked!` / `source=Notarized Developer ID` 等通过标记，也不含任何 64 位十六进制 SHA-256。
- **ac-evidence-test-sync**：`src/main/release-evidence.test.ts` 读取并断言 `docs/release-evidence/v0.2.1.md`（证据文件缺失或版本不符即失败）；`inspectReleaseEvidence` 的 verified / blocked 分支用例矩阵保持通过。
- **ac-gates-green**：`pnpm test` 退出码 0，`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web` 均通过；发布相关测试不依赖本仓库 `.git`、真实 tag 或全局 git 配置（在无 `.git` 的源码树或临时目录 fixture 下同样成立）。
- **ac-no-tag-mutation**：收工后 `git tag --list 'v0.2.1'` 为空，`git tag --list 'v0.2.0'` 与远端 tag / Release 未被创建、移动、删除或强推。

### 发布后自检 `gh api` 组合合法性（`--slurp` × `--jq` 修复）

- **ac-no-slurp-with-jq**：`.github/workflows/release.yml` 中不存在任何一条 `gh api` 命令同时带 `--slurp` 与 `--jq` / `--template`；`release-packaging.test.ts` 有覆盖全文件的正则 / 扫描断言，一旦重新引入即测试失败。
- **ac-release-count-gate-legal**："Verify the tag has exactly one public release" 步骤用 `gh api "repos/${GITHUB_REPOSITORY}/releases" --paginate` 管道到 `jq -s`，程序仍含 `.[][]`、`select(.draft)`、`select(.prerelease)`，并保留 `[ "${count}" -ne 1 ]` 等三项判定。
- **ac-assets-gate-legal**："Assert the public release has every platform asset" 步骤中取 release id 与取资产名两条 `gh api` 均为 `--paginate | jq -s`（取原始名称时 `-r`），仍保留 `.dmg` / `.zip` / `.exe` / `.AppImage` / `.deb` / `latest-mac.yml` / `latest.yml` / `latest-linux.yml` 后缀清单、`has_asset` 与版本名不一致报错。
- **ac-empty-count-fails**：当 count / drafts / prereleases 变量为空或不匹配 `^[0-9]+$` 时，该步骤执行 `exit 1` 并打印 `::error::`；对应断言在测试中存在。
- **ac-empty-release-id-fails**：release_id 为空时步骤 `exit 1` 并打印 `::error::`（保留既有行为）。
- **ac-empty-assets-fails**：assets 为空时步骤 `exit 1` 并打印 `::error::`（保留既有行为）。
- **ac-test-spec-updated**：`release-packaging.test.ts` 中不含 `--paginate --slurp` 字面量断言；单测文件名 / 描述与新写法一致（`jq -s`）。
- **ac-readme-line5**：README 第 5 行包含 `v0.2.1 已发布` 与 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.1`，且不再包含 `待发布` 与 `最新公开 Release 为 v0.1.2`。
- **ac-readme-test-matches**：测试对 README 发布状态的断言与第 5 行一致（含上述 URL），且 `pnpm test` 中该断言通过。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全部退出码 0。

### v0.2.2 版本收敛与发布说明（EMFILE 修复承接）

- **ac-version-0-2-2**：`package.json#version` 严格等于 `0.2.2`，且 `CHANGELOG.md` 存在 `## v0.2.2` 标题。
- **ac-version-single-source**：`src/main/release-packaging.test.ts` 中不出现 `'0.2.2'` / `'v0.2.2'` 字面量，也不再出现 `toBe('0.2.1')` 的版本钉死；所有版本相关断言值均由读取到的 `package.json#version` 派生。
- **ac-preflight-version-derived**：`release.yml` 的 `Preflight package version` 与 `Assert the tag matches package.json version` 两步的版本来源仍是 `node -p "require('./package.json').version"`，步骤内无内联版本号。
- **ac-changelog-v022**：`CHANGELOG.md` 中 `## v0.2.2` 的位置早于 `## v0.2.1`，该段包含 `8` 路有界并发、`EMFILE`、`ENFILE`、`https://github.com/chaxiu/OpenCompare/issues/2` 四个可断言片段。
- **ac-release-notes-v022**：`docs/release-notes/v0.2.2.md` 存在，首个 `# ` 标题含 `v0.2.2`；正文含「大目录对比不再崩溃 / 句柄耗尽可读提示」的用户可见变化，以及面向「v0.2.1 及更早」用户的升级建议；不含 `TODO` / `TBD` / `FIXME` 占位符。
- **ac-readme-status-pending**：`README.md` 状态行同时满足：含 `当前发布状态：v0.2.2 待发布`、含 `最新公开 Release 为 v0.2.1`、含 `docs/release-notes/v0.2.2.md`，且不含 `v0.2.2 已发布`。
- **ac-readme-known-issues**：`README.md`「已知问题」段声明故障版本为「v0.2.1 及更早」，并声明当前版本已修复（8 路有界并发 + 文件句柄耗尽可读提示），不再把故障归给当前版本。
- **ac-signing-doc-posture**：`docs/release-signing.md` 含 `正式版发布姿态（v0.2.2）`、含 `docs/release-notes/v0.2.2.md`、含 `tag 之后的修复由 v0.2.2 承接`。
- **ac-dispatch-default-derived**：`release.yml` 的 `workflow_dispatch` tag 默认值字符串等于 `v${package.json#version}`，且 `README.md`「发布流程」段含同一默认值文本；两处一致。
- **ac-test-retarget-keeps-intent**：版本变更导致的三处既有断言按原位重定标且强度不降——(a) README 发布姿态断言由「已发布」改为「待发布」并断言最新公开 Release 链接指向 v0.2.1；(b) 「当前发布说明承载上一版用户可见变化」的关键词断言改为对 `docs/release-notes/v0.2.1.md` 断言，另对 v0.2.2 说明断言 EMFILE/并发关键词；(c) v0.2.1 首发替代说明的切片边界固定为 `## v0.2.1`..`## v0.2.0`，不被新增的 `## v0.2.2` 拓宽。
- **ac-no-workflow-order-change**：`release.yml` 的 job 名、步骤名与顺序、`needs`、`push: tags: ['v*']` 触发条件、`--publish never`、finalize 断言均与改动前逐项相同；`git diff` 仅涉及 `workflow_dispatch` 默认值一行。
- **ac-no-release-side-effects**：本项不创建 tag、不 push、不 publish、不创建 Release；仓内不出现新的发布执行脚本或凭据。
- **ac-gates-green**：`.munk/code-gates.json` 的 `lint` / `typecheck` / `build` / `build-web` / `test` 全部通过。

### v0.2.2 已发布：状态口径翻转 + 公开产物取证

- **ac-readme-published**：`README.md` 第 5 行同时满足：含 `当前发布状态：v0.2.2 已发布`、含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`、含 `docs/release-notes/v0.2.2.md`，且不含 `v0.2.2 待发布`、不含 `最新公开 Release 为 [v0.2.1]`。
- **ac-readme-signing-text-kept**：`README.md` 第 5 行仍含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与全部 6 个 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）。
- **ac-signing-doc-status**：`docs/release-signing.md` 含 `当前状态：v0.2.2 已发布` 且不含 `v0.2.2 待发布`；含 `正式版发布姿态（v0.2.2）`；除该状态行外第一～六节文本内容不发生变化（6 项 Secret 表、v0.1.2 漂移记录、补发用法、打包后硬校验段落逐字保留）。
- **ac-packaging-test-inverted**：`src/main/release-packaging.test.ts` 中 README 姿态用例改为断言 `readme` 含 `` `当前发布状态：${currentTag} 已发布` `` 与 `` `releases/tag/${currentTag}` ``，并断言 `readme` 不含 `` `${currentTag} 待发布` ``；「最新公开 Release 为 [v0.2.1]」断言反转为 `not.toContain`。
- **ac-packaging-test-signing-line**：同一测试文件新增/同步断言 `signingDoc` 含 `` `当前状态：${currentTag} 已发布` `` 且不含 `` `${currentTag} 待发布` ``。
- **ac-packaging-test-no-version-literal**：`src/main/release-packaging.test.ts` 源码不含 `0.2.2` / `v0.2.2` 字面量，`currentTag` 仍由 `package.json#version` 派生（`expect(currentTag).toBe(`v${pkg.version}`)` 保留）。
- **ac-evidence-v022-status**：`docs/release-evidence/v0.2.2.md` 存在、非空、正文含 `v0.2.2`，且恰有一行 `status: verified`（若产物或凭据在本机不可得，则写 `status: blocked` 并上报，不得写任何通过标记或伪造 SHA-256）。
- **ac-evidence-v022-signature-markers**：证据文件对 **dmg 内** 与 **zip 内** 两个 `OpenCompare.app` 分别记录 `codesign --verify --deep --strict --verbose=2`、`xcrun stapler validate`、`spctl -a -vv --type execute` 的原始输出，全文包含 `valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID` 各不少于 2 处。
- **ac-evidence-v022-digests**：证据文件记录 dmg 与 zip 两个不同产物的 64 位小写 SHA-256（`shasum -a 256` 输出），其中 dmg 的值等于 `7c7232b9c02431c36d98a6b367436697ab379e9ef8c97e30c59b29e57eaa6ae8`（与 GitHub asset digest 对账一致），zip 的值等于 `2f0a2e0fb00cacaa442ffa4796c47afc3e438555a8641dc8234aa3f608b12f34`。
- **ac-evidence-v022-commands**：证据文件含 `gh release view v0.2.2 --repo chaxiu/OpenCompare`、`shasum -a 256`、`ditto -x -k`、`hdiutil attach -nobrowse -readonly`、`hdiutil detach`、`codesign -dv --verbose=4` 的命令文本，并记录取证机器（`sw_vers` / `uname -m`）、带时区的取证时间、仓库外临时目录路径。
- **ac-evidence-v022-bundle-identity**：证据文件记录两个 `.app` 的 `CFBundleShortVersionString=0.2.2`、`CFBundleIconFile` 值、`Authority=Developer ID Application`、`TeamIdentifier=3X4J53U6RY`、hardened runtime 标志（`flags=...runtime`），以及包内 `<CFBundleIconFile>.icns` 的 64 位 SHA-256，并据此判定包内图标为自制品牌图标而非 Electron 默认图标（**物证更正**：包内 icns 与仓库 `build/icon.icns` 逐字节相同——`electron-builder` 直接拷贝该文件，故「两者不同」的原始措辞不成立，据实记录为相同，不改产物、不改证据）。
- **ac-evidence-test-covered**：`src/main/release-evidence.test.ts` 对 `docs/release-evidence/v0.2.2.md` 走与 v0.2.1 相同的只读解析路径：文件存在且非空、含版本号、`status` 为 `verified`/`blocked` 之一、verified 分支通过标记计数与「至少两个不同 sha256」校验；v0.2.1 的既有用例与断言文本不修改，且测试仍不联网、不下载、不挂载任何产物。
- **ac-no-source-or-release-change**：`git diff --stat` 只涉及 `README.md`、`docs/release-signing.md`、`docs/release-evidence/v0.2.2.md`、`src/main/release-packaging.test.ts`、`src/main/release-evidence.test.ts`；`src/` 业务代码、`.github/workflows/`、`electron-builder.yml`、`package.json` 依赖与 `docs/release-evidence/v0.2.1.md` 无改动，未创建/移动/删除任何 tag 或 Release 资产。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全部退出码 0。

### v0.2.3 版本收敛与发布说明（悬空链接容错承接）

- **ac-version-0-2-3**：`package.json#version` 严格等于 `0.2.3`，且 `CHANGELOG.md` 存在 `## v0.2.3` 标题。
- **ac-version-single-source**：`src/main/release-packaging.test.ts` 中不出现 `0.2.3` 字面量（`currentTag` / `pkg.version` 派生之外无新增版本常量），所有「当前版本」断言值均由读取到的 `package.json#version` 推导。
- **ac-preflight-version-derived**：`release.yml` 的 `Preflight package version` 与 `Assert the tag matches package.json version` 两步版本来源仍为 `node -p "require('./package.json').version"`；除 `workflow_dispatch` 默认 tag 一行外，`release.yml` 全文不出现 `0.2.3` 字面量。
- **ac-changelog-v023**：`CHANGELOG.md` 中 `## v0.2.3` 位置早于 `## v0.2.2`，该段包含「悬空符号链接」「不可读项」「已跳过」「摘要直写缓存」四个可断言片段；`## v0.2.2` 及更早各段内容与改动前逐字相同。
- **ac-release-notes-v023**：`docs/release-notes/v0.2.3.md` 存在且非空，首个 `# ` 标题含 `v0.2.3`；正文含提示原文 `已跳过 N 个不可读项/悬空链接`、`摘要直写缓存`、`134 万`、`10.67 GiB`、`v0.2.2 及更早`、`升级`；不含 `TODO` / `TBD` / `FIXME` 占位符。
- **ac-readme-status-pending**：`README.md` 状态行同时含 `当前发布状态：v0.2.3 待发布`、`最新公开 Release 为 [v0.2.2]`、`docs/release-notes/v0.2.3.md`，且不含 `v0.2.3 已发布`。
- **ac-readme-known-issues**：`README.md`「已知问题」段同时含：`v0.2.2 及更早` + 悬空符号链接 / 不可读项已在当前版本修复 + `已跳过`；以及原 `v0.2.1 及更早` + `8 路` + `有界并发` + `文件句柄耗尽` + `当前版本已修复`（两条记录并存，不互相覆盖）。
- **ac-signing-doc-posture**：`docs/release-signing.md` 含 `当前状态：v0.2.3 待发布`、`正式版发布姿态（v0.2.3）`、`docs/release-notes/v0.2.3.md`、`tag 之后的修复由 v0.2.3 承接`，且不含 `v0.2.3 已发布`；文件内不再把 v0.2.2 作为当前版本 / 补发默认 tag 引用。
- **ac-dispatch-default-derived**：`release.yml` 的 `workflow_dispatch` tag 默认值等于 `v${package.json#version}`，`README.md`「发布流程」段与 `docs/release-signing.md` 的默认 tag 文本与之相同；测试侧仍以 `default: '${currentTag}'` 形式断言。
- **ac-no-workflow-order-change**：`release.yml` 的 job 名、步骤名与顺序、`needs`、`push: tags: ['v*']` 触发条件、`--publish never`、祖先门与 finalize 断言、6 项签名 Secrets 清单均与改动前逐项相同；`git diff .github/workflows/release.yml` 仅涉及 `workflow_dispatch` 默认值一行。
- **ac-test-retarget-keeps-intent**：版本耦合断言按原位重定标且强度不降：(a) README / signing 状态断言由「已发布」翻为「待发布」，反向断言由「不含待发布」翻为「不含已发布」，并断言最新公开 Release 指向 v0.2.2；(b) 「当前发布说明覆盖本版用户可见变化」的关键词断言改为悬空链接 / 跳过计数 / `已跳过`，其切片边界固定在 `## v0.2.3`..`## v0.2.2`；(c) 「最近一版公开说明」（`lastReleasedNotes` 路径）由 `docs/release-notes/v0.2.1.md` 前移到 `docs/release-notes/v0.2.2.md`，其关键词断言改为 v0.2.2 实际内容（`EMFILE` / `ENFILE` / `8 路` / `有界并发` / `文件句柄耗尽`）；(d) `## v0.2.1` 首发替代段与 v0.2.0 / v0.1.2 历史段的切片边界与断言保持不变；(e) 允许新增由 `currentTag` 派生的断言覆盖本版唯一用户可见变化（README 已知问题段 + 发布说明 + CHANGELOG 当前段），但不得删除既有断言、不得改为 `toBeTruthy()` / 宽松正则。
- **ac-no-stale-current-version**：仓库中不存在把「当前版本 / 当前 tag」绑定到 0.2.2 的断言或字面量——`README.md` 状态行与发布流程段、`docs/release-signing.md` 状态与姿态与链接与承接句、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts` 的 `currentTag` 派生断言中均不出现 0.2.2；历史面（`CHANGELOG.md` 的 ≤ v0.2.2 段、`docs/release-notes/v0.2.2.md`、`docs/release-evidence/v0.2.2.md`、`src/main/release-evidence.test.ts`、`lastReleasedNotes` 路径与历史切片边界）保留 v0.2.2 不算残留。
- **ac-history-intact**：`docs/release-notes/v0.2.2.md`、`docs/release-notes/v0.2.1.md`、`docs/release-notes/v0.2.0.md`、`docs/release-evidence/v0.2.2.md`、`docs/release-evidence/v0.2.1.md` 与 `src/main/release-evidence.test.ts` 的 `git diff` 为空（历史发布与取证记录零改动）。
- **ac-no-release-side-effects**：本项不创建 tag、不 push、不 publish、不创建 Release，不新增 `docs/release-evidence/v0.2.3.md`，不新增发布执行脚本或凭据。
- **ac-gates-green**：`.munk/code-gates.json` 的 `lint` / `typecheck` / `build` / `build-web` / `test` 全部通过（退出码 0）。

### v0.2.4 版本收敛与幽灵发布防护（v0.2.3 未发布内容承接）

- **ac-pkg-version**：`package.json#version` 严格等于 `0.2.4`，且仍匹配 `^\d+\.\d+\.\d+$`。
- **ac-changelog-v024**：`CHANGELOG.md` 存在 `## v0.2.4` 标题，且位于 `## v0.2.2` 之前；该段（`## v0.2.4` 到 `## v0.2.2` 之间）同时包含 `v0.2.3 已合入但未发布`、`悬空链接容错`、`摘要缓存改进` 三个片段，并含升级方式一段。
- **ac-changelog-no-ghost-v023**：`CHANGELOG.md` 中不存在以 `## v0.2.3` 开头的标题行；`## v0.2.4` 与 `## v0.2.2` 之间没有其它版本标题（即不存在伪造的 v0.2.3 发布记录）。
- **ac-changelog-v022-intact**：`CHANGELOG.md` 的 `## v0.2.2` 段（到 `## v0.2.1`）仍含 `8 路`、`有界并发`、`EMFILE`、`ENFILE` 与 `https://github.com/chaxiu/OpenCompare/issues/2`（历史内容不被改写）。
- **ac-notes-v024-exists**：`docs/release-notes/v0.2.4.md` 存在且非空，首个 `# ` 标题含 `v0.2.4`，其解析出的版本号等于 `package.json#version`；不含 `TODO` / `TBD` / `FIXME`。
- **ac-notes-v024-carries-v023**：该文件明确写出「本版包含 v0.2.3 已合入但未发布的改动：悬空链接容错、摘要缓存改进」同义句，且正文同时含 `悬空链接容错`、`摘要缓存改进`、`已跳过 N 个不可读项/悬空链接`、`134 万`、`10.67 GiB`（v0.2.3 用户可见内容并入本版，用户能对上号）。
- **ac-notes-v024-fixes**：「本次修复」部分分条写清 6 项，每项含可断言的实现事实片段：(a) `SHA-256` + `主进程` + 不再逐文件拉全文（流式字节哈希）；(b) `批量` / `分页` 目录扫描 + `有界并发`；(c) 扫描 / 哈希 `进度` + `可取消`；(d) 目录结果树 `窗口化`（虚拟滚动）+ `150 万` 行尾部可达；(e) 主入口「新建对比」弹窗不再遮挡进度条与取消按钮；(f) 相位计数：`扫描目录` 段报已扫描、`校验内容` 段报已校验，各段 `单调`、切换不归零倒退。
- **ac-notes-v024-known-issues**：该文件存在「已知问题」段，且三条逐条标「已知未修」并写明影响：① 同进程连续多轮大目录对比内存增长（含 `849` → `1,510 MB`，且写明未 OOM）；② 取消时主进程 stderr 出现 `ECANCELED` 日志噪声（写明不影响取消结果）；③ 符号链接计数放大。这三条不得出现在「本次修复」条目中，也不得写成已修复或删除。
- **ac-notes-v023-removed**：`docs/release-notes/v0.2.3.md` 文件不存在；`README.md`、`CHANGELOG.md`、`docs/**/*.md` 中任何文件都不出现字符串 `docs/release-notes/v0.2.3.md`，也不出现 `releases/tag/v0.2.3`。
- **ac-readme-status-v024**：`README.md` 第 5 行 blockquote 同时含 `当前发布状态：v0.2.4 待发布`、`最新公开 Release 为 [v0.2.2]`、`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`、`docs/release-notes/v0.2.4.md`；不含 `v0.2.4 已发布`、不含 `docs/release-notes/v0.2.3.md`。
- **ac-readme-signing-text-kept**：第 5 行仍含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与 6 个 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`），说明文字不被顺手改写。
- **ac-readme-version-table**：`README.md` 含「版本与下载」表格，至少含 v0.2.4 / v0.2.3 / v0.2.2 三行；v0.2.4 行标待发布并链 `docs/release-notes/v0.2.4.md`；v0.2.3 行同时含 `未发布` 与 `内容并入 v0.2.4`，且该行不含 `releases/tag/v0.2.3`；v0.2.2 行链 `releases/tag/v0.2.2`；表格之外无「最新公开 Release」改为 v0.2.3/v0.2.4 的表述。
- **ac-readme-links-exist**：`README.md` 中所有 `releases/tag/<v>` 链接的版本 ∈ {`v0.2.0`, `v0.2.1`, `v0.2.2`} ∪ {`v0.2.4`}（即不指向不存在的 tag）。
- **ac-readme-dispatch-default**：`README.md`「发布流程」段含 `` 默认 `v0.2.4` ``，与 workflow 默认值一致。
- **ac-readme-known-issues-kept**：`README.md`「已知问题」段仍保留 `v0.2.2 及更早` 悬空链接条目（含 `已跳过`）与 `v0.2.1 及更早` EMFILE 条目（含 `8 路`、`有界并发`、`文件句柄耗尽`），两条不被覆盖或删除。
- **ac-signing-doc-v024**：`docs/release-signing.md` 含 `当前状态：v0.2.4 待发布`、`正式版发布姿态（v0.2.4）`、`docs/release-notes/v0.2.4.md`、`tag 之后的修复由 v0.2.4 承接`、`` 默认 `v0.2.4` ``；全文不出现 `v0.2.3` / `docs/release-notes/v0.2.3.md`；6 项 Secret 表、v0.1.2 漂移记录、补发用法与「打包后硬校验」段落仍在。
- **ac-workflow-dispatch-default**：`release.yml` 的 `workflow_dispatch.inputs.tag.default` 字符串等于 `` `v${package.json#version}` ``（即 `v0.2.4`），且全文不出现 `v0.2.3`。
- **ac-workflow-latest-release-gate**：`finalize` job 中在既有步骤 `Assert the public release has every platform asset` **之后**新增且仅新增一个只读步骤（例如 `name: Assert the tag is the latest published release`），其 `run` 含 `gh release list --limit 1 --json tagName`、把取到的 tagName 与 `${RELEASE_TAG}` 相等比较、失败时输出 `::error::` 并 `exit 1`（空值同样失败）；该步骤不写任何远端状态。
- **ac-workflow-order-and-model-intact**：`release.yml` 既有步骤名与顺序不变（`Make the tag's release public` → `Verify the tag has exactly one public release` → `Assert the public release has every platform asset` → 新步骤），`push: tags: ['v*']`、`gates → release 矩阵 --publish never → finalize`、单点预建 draft、`refs/tags/${{ env.RELEASE_TAG }}`（仍恰好 2 处）、6 项 Secrets fail-closed、既有唯一公开 Release 与资产断言全部原样；全文无 `continue-on-error` / `|| true`。
- **ac-test-derived-no-current-literal**：`src/main/release-packaging.test.ts` 中不出现 `0.2.4` / `v0.2.4` 字面量；`currentVersion` / `currentTag` 仍由 `package.json#version` 派生，版本相关断言（release notes 路径、CHANGELOG 标题、dispatch 默认值、README 状态行、signing 文档）全部经 `currentTag` 互校。
- **ac-test-no-ghost-notes**：新增断言：`docs/release-notes/v0.2.3.md` 不存在，且 `README.md` / `CHANGELOG.md` / `docs/**/*.md` 任一文档不含 `docs/release-notes/v0.2.3.md` 与 `releases/tag/v0.2.3`（幽灵版本串用运行时拼接构造，测试源码内不出现完整 `v0.2.3` 字面量）。
- **ac-test-link-allowlist**：新增断言：扫描 `README.md`、`CHANGELOG.md`、`docs/**/*.md` 中所有 `releases/tag/<v>` 链接，其版本必须 ∈ {`v0.2.0`, `v0.2.1`, `v0.2.2`（已发布）} ∪ {`currentTag`}，否则失败。
- **ac-test-current-notes-known-issues**：新增断言：当前版本 release notes（`docs/release-notes/${currentTag}.md`）存在，且含「已知问题」段与 `已知未修`。
- **ac-test-no-ghost-evidence**：新增断言：`docs/release-evidence/v0.2.3.md` 不存在（不出现幽灵版本的假证据文件）。
- **ac-test-latest-release-gate**：新增断言：`release.yml` 含 `gh release list --limit 1 --json tagName` 的只读步骤，位置在下标上晚于 `Assert the public release has every platform asset`，且该步骤脚本含 `::error::` 与 `exit 1`。
- **ac-test-retarget-keeps-intent**：既有断言按原位重定标且强度不降：`lastReleasedNotesPath` 仍指向 `docs/release-notes/v0.2.2.md`（上一公开版本锚点）；README / signingDoc 状态断言经 `currentTag` 派生并断言「待发布」与「不含已发布」；CHANGELOG 当前段切片固定为 `` ## ${currentTag} `` .. `## v0.2.2` 并覆盖本版合并声明关键词；当前发布说明的悬空链接关键词断言继续由 `docs/release-notes/${currentTag}.md` 承载；`## v0.2.1` 首发替代段与 v0.2.0 / v0.1.2 历史段切片与断言不动；不删除既有断言、不放宽为 `toBeTruthy()` 或宽松正则。
- **ac-gates-green**：`.munk/code-gates.json` 的 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全部退出码 0。
- **ac-no-release-side-effects**：本项不建 tag、不 push、不 publish、不创建或公开 Release；不新增 `docs/release-evidence/v0.2.4.md`；不新增发布脚本或凭据。
- **ac-scope-files-only**：`git diff --stat` 仅涉及 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`docs/release-notes/v0.2.4.md`（新增）、`docs/release-notes/v0.2.3.md`（删除）、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`；`src/` 业务代码（`src/core/**`、`src/main/**` 除该测试文件、`src/renderer/**`、`src/preload/**`、`src/shared/**`）、`src/main/release-evidence.test.ts`、`docs/release-evidence/**`、`docs/release-notes/v0.2.{0,1,2}.md`、`electron-builder.yml`、`build/**`、依赖与锁文件均无改动。

### v0.2.4 发布收尾：状态翻转、深度取证与更新元数据一致性

- **ac-readme-status-line**：`README.md` 第 5 行包含 `当前发布状态：v0.2.4 已发布` 与 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4`，且不再包含 `待发布`、`最新公开 Release 为 [v0.2.2]`。
- **ac-readme-status-line-keeps-signing-copy**：同一第 5 行仍包含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与 6 项 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）。
- **ac-readme-download-table**：「版本与下载」表中 v0.2.4 行为 `已发布` 且含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4`；v0.2.2 行含 `已发布` 但不含 `最新公开 Release`；v0.2.3 行含 `未发布`、`内容并入 v0.2.4` 且不含 `releases/tag/v0.2.3`。
- **ac-signing-doc-status**：`docs/release-signing.md` 第 5 行含 `当前状态：v0.2.4 已发布`，且全文不再出现 `v0.2.4 待发布`。
- **ac-release-gate-tests-flipped**：`pnpm test` exit 0；`src/main/release-packaging.test.ts` 源码中不再存在 `当前发布状态：${currentTag} 待发布` 与 `当前状态：${currentTag} 待发布` 这类正向断言文本，且新增/翻转后的断言仍要求 README 状态行与下载表出现「已发布 + Release 链接」（断言总数不减少）。
- **ac-readme-known-issues-unfixed**：`README.md` 的 `## 已知问题` 段保留原两条 `当前版本已修复` 条目，并新增恰好三条含 `已知未修` 的条目，分别包含 `849`、`1,510 MB`、`未 OOM`、`ECANCELED`、`不影响取消结果`、`符号链接计数放大`；新增条目不出现 `已修复` 措辞。
- **ac-evidence-doc-identity**：`docs/release-evidence/v0.2.4.md` 存在且非空，含 `status: verified`、`v0.2.4`、`39692988051`、`55d3af2db1632d05f94b3eca88020240714b21f6`，并列出 `Quality gates`、`Package mac`、`Package win`、`Package linux`、`Publish the GitHub Release` 五个 job 且均标 success。
- **ac-evidence-assets-table**：文档中的资产名集合与 `evidence/assets-sha256.txt` 的 11 个名称完全相等，且每个 sha256 与该文件逐条相等；文档不出现该清单之外的 64 位十六进制串。
- **ac-evidence-mac-signing**：文档各至少出现一次 `notarization successful`、`valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID`、`Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)`、`TeamIdentifier=3X4J53U6RY`、`flags=0x10000(runtime)`，并标注该条来自 CI 日志还是本机复核。
- **ac-evidence-release-gates**：文档含 `releases for v0.2.4: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.4 (this tag: v0.2.4)`，并声明 11/11 sha256 与 GitHub API `.assets[].digest` 相等。
- **ac-evidence-known-defect**：文档把 `latest.yml` Windows url `OpenCompare-Setup-0.2.4.exe` 与真实资产 `OpenCompare.Setup.0.2.4.exe` 的不一致记为 P2 遗留，标注 `v0.2.2 起既有`、`无运行时消费者`、本次不重发/不改写已发布资产。
- **ac-nsis-artifact-name**：`electron-builder.yml` 的 `nsis.artifactName` 等于 `${productName}-Setup-${version}.${ext}`，测试同时断言该值不含空格且 `${productName}-Setup-${version}` 与 `latest.yml` 的 `files[].url` 模板一致（不再产生 `OpenCompare.Setup.<ver>.exe` 与 `OpenCompare-Setup-<ver>.exe` 分叉）。
- **ac-finalize-latest-url-gate**：`.github/workflows/release.yml` 在 `Assert the public release has every platform asset` 之后、`Assert the tag is the latest published release` 之前存在新步骤，逻辑为「取该 Release 资产名集合 → 对每个 `latest*.yml` 资产的 `files[].url`（及存在时的 `path`）做成员校验 → 任一缺失打印 `::error::` 并 `exit 1`」；测试断言该步骤顺序、关键字（`files[].url`、资产名集合、`exit 1`）与只读性（步骤体内无 `gh release upload|edit|create|delete`、无 `--method POST/PATCH/PUT/DELETE`）。
- **ac-appimage-blockmap-gate**：linux 打包 job 存在断言：`release/*.AppImage` 末 4 字节按小端 uint32 解码后等于 `latest-linux.yml` 中该 AppImage 条目的 `blockMapSize`，不等即失败；同一断言不要求存在独立 `*.AppImage.blockmap` 资产。fixture 测试覆盖「相等通过」「不等失败」两分支。（**判定口径已由本节末「Linux AppImage blockmap 双字节序门与本地校验下沉」取代**：现为尾部 4 字节的小端/大端**双候选**匹配声明值，「只读小端」在真实 BE 产物上会误红；仍不要求独立 `*.AppImage.blockmap` 资产。）
- **ac-metadata-doc-note**：`docs/release-evidence/v0.2.4.md`（或 `docs/release-signing.md`）记录 AppImage blockmap 结论：electron-builder 不产出独立 `*.AppImage.blockmap`，`blockMapSize` 为内嵌 payload 长度，因此 v0.2.4 的 `latest-linux.yml` 形态自洽。
- **ac-gates-green**：`.munk/code-gates.json` 的 install / lint / typecheck / build / build-web / test 六道门全部通过。

### v0.2.5 发布就绪与发布证据归档

- **ac-version-025**：`package.json` 的 `version` 严格等于 `0.2.5`；由它派生的 `currentTag` 为 `v0.2.5`，`pnpm test` 中版本对齐类断言全绿。
- **ac-changelog-v025**：`CHANGELOG.md` 含 `## v0.2.5`，位置严格在 `## v0.2.4` 之上；该段含「修复」与「升级方式」两级小节，修复项覆盖内存收敛、取消零日志噪声、符号链接不跟随三件事，且不含 `TODO` / `TBD` / `FIXME`；`## v0.2.4` 及更早段落的文本与改动前逐字相同（`git diff` 在这些区块为 0 行改动）。
- **ac-notes-v025**：`docs/release-notes/v0.2.5.md` 存在、非空，首个 `# ` 标题含 `v0.2.5`；正文含「不跟随符号链接」「已跳过：左 X / 右 Y」「结构化取消」「有界缓存」与「升级方式」；不含 `TODO` / `TBD` / `FIXME`，不含任何 64 位十六进制 sha256，不含「已知未修」。
- **ac-readme-pending**：`README.md` 第 5 行含「当前发布状态：v0.2.5 待发布」、「最新公开 Release 为 [v0.2.4]」、「docs/release-notes/v0.2.5.md」，且全文不含「v0.2.5 已发布」「当前发布状态：v0.2.4」。
- **ac-readme-table**：「版本与下载」表含 `| [v0.2.5](docs/release-notes/v0.2.5.md) | 待发布 |` 行且该行不含 `releases/tag/v0.2.5`；含 `v0.2.4` 行标「已发布（最新公开 Release）」并链 `releases/tag/v0.2.4`；`v0.2.3` 行仍为「未发布，内容并入 v0.2.4」且无任何 Release 链接；`v0.2.2` 行存在、含 `releases/tag/v0.2.2`、且不再带「最新公开 Release」字样。
- **ac-signing-025**：`docs/release-signing.md` 含「当前状态：v0.2.5 待发布」「正式版发布姿态（v0.2.5）」「docs/release-notes/v0.2.5.md」「补发…默认 `v0.2.5`」「tag 之后的修复由 v0.2.5 承接」；不含「当前状态：v0.2.4」「v0.2.5 已发布」；6 项 Secret 清单、fail-closed 表述与 v0.1.2 漂移事实原样保留。
- **ac-workflow-default-025**：解析 `.github/workflows/release.yml` 得到 `jobs` 之外的 `on.workflow_dispatch.inputs.tag.default === 'v0.2.5'`；同样字段在 README 发布流程段写作 默认 `v0.2.5`；workflow 其余步骤（版本断言、祖先门、签名门、finalize 校验）无逻辑改动。
- **ac-known-issues-zero-unfixed**：`README.md` 的「已知问题」段中，含「已知未修」的条目数为 0；内存增长与 `ECANCELED` 两条均出现「已在 v0.2.5 修复」字样，且各自引用了真实证据路径：内存条引用 `docs/perf/large-directory-memory.md` 与 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`，取消条引用 `pnpm test:cancel` 门禁（或等价门禁名）。
- **ac-known-issues-numbers**：内存条出现修复前后对照数字 `1,960,394,752` 与 `1,257,750,528`、轮次增量 `71,286,784`，且这些数字与 `docs/perf/large-directory-memory.md` 归档证据逐字一致（grep 相等，不新增/改写证据数字）；取消条写明零 `Error occurred in handler`、零 `OperationCancelledError`、零 `ECANCELED`。
- **ac-known-issues-history-kept**：既有「v0.2.2 及更早」「v0.2.1 及更早」归因措辞、`8 路` / `有界并发` / `文件句柄耗尽` / `不跟随符号链接` / `已跳过` 等既有表述仍存在；不得删除既有条目来凑「0 条未修」。
- **ac-metadata-pass**：对一份内容完备的临时产物集（mac `dmg` / `zip` / 两份 `blockmap`、`OpenCompare-Setup-0.2.5.exe` 及其 `blockmap`、`AppImage`、`deb`、三份 `latest*.yml`）执行校验：函数返回值 `ok === true`、`missing` 为空数组、`legacyHits` 为空数组；CLI 退出码 0，stdout 含每份 `latest*.yml` 的「url N/N 命中资产名」与一行「旧错位名 0 命中」。
- **ac-metadata-missing**：把某份 `latest*.yml` 的任一 `files[].url` 改成不存在的资产名后：返回值 `ok === false`，`missing` 精确含该名字；CLI 退出码非 0，stderr 含该缺失名；其余 url 仍被计为命中，不被一处失败掩盖。
- **ac-metadata-legacy-win**：资产名或 `files[].url` 中出现 `OpenCompare.Setup.0.2.5.exe`（点号形态）或 `OpenCompare Setup 0.2.5.exe`（空格形态）时：`legacyHits` 非空、`ok === false`、CLI 退出码非 0 并指出命中的旧形态名；当资产集合与 url 均为连字符形态 `OpenCompare-Setup-0.2.5.exe` 时 `legacyHits` 为 0 且通过。
- **ac-metadata-empty**：目录不存在、目录内 0 份 `latest*.yml`、或传入的资产名清单为空时，`ok === false` 且 CLI 退出码非 0，stderr 说明是「目录不可读 / 无 latest*.yml / 资产名清单为空」三者之一，绝不静默退出 0。
- **ac-metadata-nodeps**：校验实现为 Node 标准库 + 仓库现有依赖（或等价既有依赖），不新增 npm 依赖；纯函数导出可被 vitest 直接调用，同时提供 CLI 包装；断言不发起任何网络请求。
- **ac-evidence-pending**：`docs/release-evidence/v0.2.5.md` 存在、非空，含且仅含一处 `status: pending` 行；文件不含 `[0-9a-f]{64}` 形态的 sha256，不含 `valid on disk`、`The validate action worked!`、`source=Notarized Developer ID` 三个通过标记。
- **ac-evidence-readiness**：该文件含发布前就绪清单，逐项列出 `package.json` / `CHANGELOG.md` / `docs/release-notes/v0.2.5.md` / `README.md` / `.github/workflows/release.yml` / `docs/release-signing.md` 六个被核对象，每项给出「现值 0.2.5 / v0.2.5」与核对命令或断言名。
- **ac-evidence-backfill-slots**：该文件含发布后回填位：资产表预留 11 行（mac dmg / mac zip / 两份 blockmap / exe / exe blockmap / AppImage / deb / 三份 `latest*.yml`），每行资产名与字节/`sha256` 列留空（不得填占位十六进制）；含 `releases for v0.2.5: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.5 (this tag: v0.2.5)` 的原文回填位（以空代码块 + 「发布后粘贴」说明呈现）；含 `codesign --verify --deep --strict --verbose=2`、`codesign -dv --verbose=4`、`xcrun stapler validate`、`spctl -a -vv --type execute` 四条命令原文位；含本地元数据校验结果回填位（`scripts/release-metadata.mjs` 的标准输出）。
- **ac-evidence-qa-handoff**：该文件含 product-qa 公开复验就绪条件清单，至少覆盖：干净环境安装各平台产物、3 轮真实目录对比含至少一次取消、footer 计数与「不跟随」口径一致、`latest*.yml` url 命中、安装包名与 `spctl` / `stapler` / `codesign` 原文核对；并写明本文件 `status` 只有回填完毕才可从 `pending` 改为 `verified`。
- **ac-evidence-no-fabrication**：该文件不出现「已发布」「已验证」「全部通过」一类既成结论（`v0.2.5` 的实际 Release 尚不存在），只出现待回填与就绪判定口径。
- **ac-history-immutable**：`docs/release-notes/v0.2.4.md`、`docs/release-evidence/v0.2.4.md`、`docs/release-notes/v0.2.{0,1,2}.md`、`docs/release-evidence/v0.2.{0,1,2}.md` 与 `git tag --list` 输出均与改动前逐字/逐项相同；`v0.2.4` 的 11 个资产名与 sha256 值原样出现（`d7e39acb…` 等 11 条全在），`v0.2.4.md` 的 `status: verified` 与「P2 遗留」段落未被改写。
- **ac-test-rescope**：`src/main/release-packaging.test.ts` 中——`publishedTags` 集合含 `v0.2.4`；当前 tag 的状态断言由「已发布」改为「待发布」（README 首屏行、版本表当前行、signing 文档状态行三处一致）；`ghostRow` 断言改为「内容并入 v0.2.4」而非 `currentTag`；只描述 v0.2.4 notes 内容的断言改读 `docs/release-notes/v0.2.4.md`；新增针对 `docs/release-notes/v0.2.5.md` 的断言（标题版本 = `package.json#version`、三件修复关键词、无占位符）；已知问题断言改为「已知未修 0 条 + 两条 v0.2.5 修复」。
- **ac-test-history-blocks**：`release-packaging.test.ts` 中 v0.2.2 / v0.2.1 / v0.2.0 / v0.1.2 的历史断言块（`keeps the v0.2.2 changelog entry as history`、`explains why v0.2.1 ships…`、`covers the still-public v0.2.2 release notes`、`records the v0.1.2 drift facts…` 等）文本零改动；`release-evidence.test.ts` 全文对 v0.2.1 / v0.2.2 / v0.2.4 的断言零改动，仅允许新增 v0.2.5 的独立 describe。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm test`（含上述新增断言）全绿；`.munk/code-gates.json` 不新增条目（既有 `test` 门禁已覆盖），不得为通过而删除或放宽任何断言。
- **ac-no-publish**：仓库内不存在 `v0.2.5` tag（`git tag --list` 无该条目）、无 `git push` / `gh release` 写操作产物；`package.json` 依赖与锁文件不含 `electron-updater`；本项未新增任何自动发布触发。

### Linux AppImage blockmap 双字节序门与本地校验下沉

- **ac-v025-fixture-passes**：用 v0.2.5 CI 实测尾字节 `00 01 EF A4`（BE=126884，LE=2767126784）构造的 AppImage + `blockMapSize: 126884`，workflow 门脚本退出码 0 且输出含 `embedded blockMapSize=126884`。
- **ac-v025-le-single-order-negative**：同一 fixture 在测试里显式断言 LE 解码 = 2767126784 且 `2767126784 !== 126884`，即旧「只读 LE」的判定在该 fixture 上必然失败；该断言与 BE 通过用例同行存在，构成负向对照。
- **ac-workflow-both-mismatch-fails**：声明 126884、尾部字节使两侧候选都不等于声明时，脚本退出码非零，输出含 `::error::`，并同时给出声明值与两个候选实际值。
- **ac-workflow-over-size-fails**：尾部 4 字节解出的两侧候选都大于文件大小时，脚本退出码非零（上界仍生效，不得被当成命中）。
- **ac-workflow-missing-blockmap-fails**：`latest-linux.yml` 中该 AppImage 条目无 `blockMapSize` 时退出码非零且错误文案含 `blockMapSize`。
- **ac-workflow-missing-metadata-or-image-count**：`latest-linux.yml` 缺失、或 `release/*.AppImage` 数量 != 1 时退出码非零（沿用现有 fail-closed 文案语义）。
- **ac-workflow-comment-updated**：该步骤注释不再出现 `little-endian uint32`，且脚本内同时出现 `readUInt32LE` 与 `readUInt32BE`。
- **ac-metadata-script-v025-passes**：`inspectReleaseMetadata()` 对含上述 v0.2.5 尾字节 AppImage 的目录返回 `ok: true`；CLI `--dir` 退出码 0。
- **ac-metadata-script-missing-appimage**：`latest-linux.yml` 声明了 AppImage 但 `dir` 内无该文件时 `ok: false`、CLI 退出码非零、`problems` 文案含该 AppImage 文件名。
- **ac-metadata-script-missing-blockmap**：该 AppImage 条目无 `blockMapSize` 时 `ok: false` 且 `problems` 含 `blockMapSize`；CLI 非零。
- **ac-metadata-script-both-mismatch**：声明与实际两侧都不等时 `ok: false` 且 `problems` 同时含声明值与两个候选值；CLI 非零。
- **ac-metadata-script-over-size**：尾部候选值大于文件大小时 `ok: false`；CLI 非零。
- **ac-metadata-script-no-linux-yml-unaffected**：目录中只有 `latest-mac.yml` / `latest.yml`（无 `latest-linux.yml`）时，不因「缺 AppImage」报错，其余 url 命中/旧错位名校验行为与现状一致（有其它问题时仍 `ok: false`）。
- **ac-parity-workflow-and-script**：对同一临时目录与同一组字节序/声明组合，workflow 门脚本的通过/失败与 `release-metadata.mjs` 的 `ok` 完全一致（至少覆盖 BE 命中、两侧不等、缺 AppImage 三种组合）。
- **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm test` 全绿；新增用例覆盖上述正反场景（`release-packaging.test.ts` + `release-metadata.test.ts` 合计新增 ≥ 4 条）。
- **ac-boundaries-untouched**：`git diff` 不含 tag、已上传的 8 件资产、`src/renderer/**` / `src/core/**` / `src/main/**` 运行时代码（仅测试文件）、README/signing 发布状态、`latestPublishedTag` / `lastReleasedNotesPath` 锚点、`docs/release-evidence/v0.2.4.md` 原文；不新增 `release/` 目录或任何二进制/大文件；全过程未执行 `workflow_dispatch` / `tag` / `push` / 资产上传。

### v0.2.5 发布后取证：公开 Release 证据 `verified` 翻转

> 本组取代发布前骨架口径的 `ac-evidence-pending` / `ac-evidence-backfill-slots` / `ac-evidence-no-fabrication`（其断言对象是「尚未发布、只留位不填值」）。`ac-evidence-readiness` 的六对象就绪清单与 `ac-evidence-qa-handoff` 的第 6 节交接区仍保留在文件里，但 `status` 规则句改为不与 `verified` 矛盾的表述。

- **ac-prereq-gate-first**：执行时先跑前置硬门——针对修复 commit 的 `workflow_dispatch` run `conclusion=success` 且 `Quality gates` / `Package mac` / `Package win` / `Package linux` / `Publish the GitHub Release` 五个 job 全 `success`；`gh release view v0.2.5` 为 `isDraft: false`、`isPrerelease: false`、资产恰好 11 件。run 仍在跑时允许限时轮询（单次等待 ≤5 分钟、总时长有界）；失败 / 仍 draft / 缺件时证据文件保持 `status: pending`、零 64 位十六进制、零通过标记，只产出带 run id / 失败 step / 缺失资产名的 blocked 报告；测试以夹具断言 blocked 分支（含 `valid on disk` 或任一 sha256 → `problems` 非空）。
- **ac-run-identity**：证据文件含 run id `39713762292`、被测 commit `2eedc5de1ebfbc8e835d08d18e959b394fadceb4`（或实际 finalize 的 run/commit，且与 `gh run view` 输出一致）、`publishedAt`、Release URL，以及 5 个 job 行全部含 `success`。
- **ac-assets-exactly-11**：第 2 节解析出恰好 11 行资产表，资产名与 11 个发布名逐字相等（`latest-linux.yml` / `latest-mac.yml` / `latest.yml` / `opencompare_0.2.5_amd64.deb` / `OpenCompare-0.2.5-arm64-mac.zip` + blockmap / `OpenCompare-0.2.5-arm64.dmg` + blockmap / `OpenCompare-0.2.5.AppImage` / `OpenCompare-Setup-0.2.5.exe` + blockmap）；每行字节为正整数、sha256 为 64 位小写十六进制且 11 个值互不相同，并与 GitHub API 的 `.size` / `.digest` 逐件对齐；全文除这 11 个 sha256 外无其它未登记的 64 位十六进制（原始 `codesign -dv` 输出里的 bundle `CDHash` 按实现约束单列白名单）。
- **ac-status-verified-once**：全文恰好一处 `status:` 且值为 `verified`，不再出现 `pending`。
- **ac-no-placeholder**：全文无 `<...>` 占位、`待回填`、`TBD`、`TODO` 字样，且不存在空 `text` 代码块（第 3～5 节都是真实输出）。
- **ac-latest-gates**：含 `releases for v0.2.5: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.5 (this tag: v0.2.5)` 两行原文。
- **ac-mac-both-products**：`valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID` 每个标记 ≥2 次，且文档明确标注 dmg 内 `.app` 与 zip 内 `.app` 两套来源；dmg 挂载后必须 `hdiutil detach`。
- **ac-metadata-all-hit**：第 5 节含 `release:metadata 校验通过：3 份 latest*.yml、11 个资产名。`、`旧错位名 0 命中`，以及三行 `latest*.yml: url N/N 命中资产名`，每行 N 相等；同节可见 `pnpm release:metadata --dir` 命令与其退出码 0。
- **ac-windows-hyphen-name**：文档记录 Windows 资产为连字符形态 `OpenCompare-Setup-0.2.5.exe`，并记录 `OpenCompare.Setup.0.2.5.exe` 一类点号 / 空格旧错位名命中 0。
- **ac-history-unchanged**：`git diff --stat` 对 `docs/release-evidence/v0.2.0.md`～`v0.2.4.md`、`docs/release-notes/v0.2.0`～`v0.2.4` 为空；`src/main/release-evidence.test.ts` 的 v0.2.1 / v0.2.4 块（含 `v024Assets` 11 组 sha256 钉板）与改动前逐字一致。
- **ac-test-green**：`pnpm test` 全绿（文件数与用例数不低于改动前），且 `release-evidence.test.ts` 的 v0.2.5 verified 负向夹具断言生效（删一个标记对 / 改错 sha256 / 少一行资产 / 混入 `status: pending` 都判红）。
- **ac-repo-clean**：仓库内无下载产物；`git status --porcelain` 只含 `docs/release-evidence/v0.2.5.md`、`src/main/release-evidence.test.ts`、`docs/symlink-no-follow.md`、`docs/evidence/symlink-footer-*.json`、`scripts/measure-symlink-footer.evidence.test.ts` 及该证据格式收口新增的测试 / helper 文件。

## 非目标

- 祖先门语义修正与 dispatch 补发项**只改仓库源码、工作流与文档，不执行任何远端写操作**：不打 tag、不 push、不 publish、不创建 / 编辑 / 公开 / 上传 Release；远端 `v0.2.0` tag（annotated `f385521` → `285ee28`）保持原样，不删除、不移动、不重打；`v0.1.0` / `v0.1.1` / `v0.1.2` 的 tag 与资产同样不动。
- 不改发布模型（单点预建唯一 Release + 矩阵 `--publish never` + finalize 公开）、不升版本、不改历史 / `CHANGELOG.md` / `docs/release-notes/v0.2.0.md` 内容口径、不改 `appId` / `productName` / 签名身份 / targets / 依赖 / `electron-builder.yml` 发布配置、不新增 secrets、不做 UI 改动。

- 不做 Windows / Linux 的代码签名或公证（签名/公证仅覆盖 macOS Developer ID）。
- 不进行自动更新（auto-update）与发布密钥托管服务。
- 不重新打 tag、不在工作项内重跑 CI、不手工公开历史草稿 Release；不由 AI 实际获取/录入证书或密钥，不在本地执行公证。
- 不引入新发布渠道（npm / Homebrew / Snap 等），不改依赖版本与 `electron-vite` 构建脚本。
- 不重写 `README` / `AGENTS.md`、不新增文档体系或设计语言；不在本地做多平台交叉编译。
- v0.2.5 就绪项只做**发布线就绪 + 证据归档 + 本地元数据校验**：不打 `v0.2.5` tag、不 push、不 publish、不触发 CI；不回填任何真实资产 sha256、CI run id、`codesign` / `stapler` / `spctl` 原文（只能由真实发布产出）；不把 README 首屏 / 版本表 / signing 文档翻成「v0.2.5 已发布」（该翻转是发布完成后的独立动作）；不改写 `v0.2.4` 及更早的 tag / Release / 资产 / notes / evidence / sha256 与历史测试块；不引入 `electron-updater` 或任何自动更新机制；不改 `electron-builder.yml` 的 targets / 签名 / 公证 / `publish` 模型（`nsis.artifactName` 已是连字符形态，无需再改）；不改 `src/core/`、`src/renderer/`、`src/main/` 的运行时代码（只允许测试文件、`scripts/` 新增校验脚本与 `package.json` 的 version / script 字段变化）；不新增 `.munk/code-gates.json` 门禁条目、不改 `perf-gate` / `memory-gate` / `cancel-gate` 数据集与阈值；不重写 README 其他段落、不调整 docs 目录结构；不做浏览器 / 真机 / 桌面点选验收（公开件干净环境安装复验归 product-qa）；不顺手优化历史断言措辞、不重构测试文件结构。
- 不顺手重构 CI（不加缓存策略、不拆并行 job、不改 Node 版本）；不重构既有「单点预建唯一 Release + 汇聚 `gh release upload` + finalize」模型，仅在其上接线签名公证与版本闸。
- 不改 electron-builder 打包目标 / `appId`；不改触发条件（仍为 `v*` tag push）与 `permissions`；不引入新的 Action / 第三方发布工具。发版版本 bump 仅限 `package.json#version` 改为与目标 tag 一致（v0.1.2），不做自增逻辑或自动化版本管理。
- 发版必需改动不越界：不改 `release.yml`、不改打包目标 / `appId` / `mac.identity` / 触发条件 / 发布模型、不新增依赖、不改 `electron-builder.yml` / entitlements、不动 `src/core/`、不做功能/UI 改动；`CHANGELOG.md` 只覆盖 `v0.1.2` 条目，不追溯补写历史版本；不录入手工凭据、不在仓库/脚本/日志写明文密钥、不执行打 Tag / publish Release / 公证。
- 不追求 bit-identical 二进制可复现；只保证输入锁定与产物名/版本确定。
- 品牌图标项不改 `appId`（保持 `com.opencompare.app`）、`productName`、发布模型与 `release.yml` 的打包 / 发布 / 公证流程；不升版本号、不改 CHANGELOG / Release Notes、不动 `v0.1.2` tag 与资产；不做应用内「关于」页面或设置页、不做主题 / 视觉改版；不新增运行时或开发依赖、不引入在线图标生成服务、不使用 Electron 默认图标或任何第三方版权图标；不在本项执行签名、公证、打 tag、push、publish 或创建 Release。
- v0.2.0 收敛项只做「发版元信息收敛 + 只读一致性断言」：**不打 tag、不 push、不 publish、不创建或公开 Release**，不修改任何远端 Release 及其资产（含 v0.1.2 的 11 个资产）——这些动作由人与 Host 完成并触发 `human_required`。
- 不删除 / 不移动 / 不重打 `v0.1.2`（以及 `v0.1.0` / `v0.1.1`）tag，不替换已发布资产，不改写任何历史提交。
- 不改发布模型与签名链路：`tags: v*` 触发、`gates → 矩阵 --publish never → finalize`、单点预建 draft、六项 Secret 与 fail-closed 逻辑、`electron-builder.yml` 的签名/公证/图标/protocol 配置全部不动；不新增 Secret。
- 发版流水线加固项本身不在 CI 之外改签名链路；本机 `codesign` / `stapler` / `spctl` 实证与 `docs/release-evidence/` 归「本机发版产物取证」项，且不把「CI 绿了」当签名/公证证据。
- 本机取证项只做**只读取证 + 证据落盘**：不打 tag、不 push、不 publish、不创建 / 编辑 / 公开 / 上传 Release 资产；不在本机重新打包、签名、公证；不改 `release.yml` / `electron-builder.yml` / entitlements / 签名文档；不删除或重打任何历史 tag 与资产；不改产品 UI / 会话 / 对比算法 / 版本号，不跑 self-test 或真机点选；dmg / zip / `.app` / 解包目录一律不入库，不记录任何证书、密码、`.p8` 或 Secret 内容；产物不可得时不以未签名 / 未公证 / 本地构建产物充数，不臆造命令输出。
- 不改 `appId` / `productName` / 版本之外的包元数据；不引入 changesets、semantic-release 等版本工具，不新增依赖。
- 不修历史：`v0.1.1` tag 内 `package.json#version` 实为 `0.1.0` 这个既存不一致只作为已知事实避开（不写「所有 v* tag 版本一致」断言、不回填、不改 tag），只对 `v0.1.2` 与当前版本断言。
- v0.2.0 收敛项不改对比算法、会话模型、UI、图标资产与协议声明；不做 CHANGELOG 全历史重写，不产出英文版 Release Notes。
- v0.2.1 首发替代项只做**版本与发布文档 / 发布测试对齐**：不改发布语义、打包配置（`electron-builder.yml`、`build/`）、依赖与 `pnpm-lock.yaml`；不创建、不推送任何 tag，不创建或修改任何 GitHub Release；不碰 v0.1.x 与 v0.2.0 的 tag 与 Release；不做实机安装 / 签名 / 公证验收，不跑 self_test；不改任何用户可见功能、UI、交互或算法（v0.2.1 用户可见变化与 v0.2.0 完全相同）；不删除或改写 v0.2.0 发布说明与取证记录（保留为历史）；不重写 v0.1.2 漂移历史，也不新增其他版本线。
- 测试套件环境自包含项**只改测试与必要的可测性**（主要 `src/main/release-packaging.test.ts`；`src/main/release-evidence.test.ts` 只断言文档文本、不执行 git，保持不动）：不改 `release.yml` 的任何发布语义（checkout ref、祖先门语义、单点预建唯一 Release、矩阵 `--publish never`、finalize 公开）、不改 `electron-builder.yml` / `package.json` 依赖或脚本、不新增依赖、不改产品代码或 UI；不把 gate 脚本抽成仓库脚本；不打 tag / 不移动 tag / 不 push / 不 publish / 不创建 Release；不试图让已冻结的 `v0.2.0` tag 树里的旧测试变绿（不移动 tag 就无法改变该树），本项只保证以 HEAD 为基础打出的后续 tag / 派发在干净环境可复现通过；不凭猜测放宽断言（先复现再改）。
- 发布后自检 `gh api` 组合修复项**只改发布后自检命令与其静态断言**：不改打包目标、electron-builder 配置、签名 / 公证配置、Secrets 清单或发布模型（tag → Release）；不重指、删除或新建任何 tag；不 push、不 dispatch、不建 / 改 Release；不跑实机验收或 UI 自测；不重构 CI 其他 job（gates / build / upload）与无关测试，不顺手加 lint 规则或抽脚本模块；不改 v0.1.2 漂移记录与历史发布说明。
- v0.2.2 收敛项只做**版本收敛与发布文档对齐**（承接已合入 `main` 的 EMFILE 修复，merge `4c028f5` / 修复提交 `a24cdd2`）：不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts` 的版本断言）、`src/renderer/`、`src/preload/`、`src/shared/` 的业务逻辑；不改 `src/main/release-evidence.test.ts` 与 `docs/release-evidence/v0.2.1.md`；不新建 `docs/release-evidence/v0.2.2.md`、不补写 v0.2.2 取证；不清理 `0.2.0` / `0.2.1` 历史发布文档；不改既有功能测试与门禁行为断言口径（除上述三处版本耦合重定标外不放宽、不删除）；不改 `release.yml` 步骤顺序 / 发布模型 / fail-closed 配置 / 祖先门与单 Release 断言；不做新功能、不调并发默认值（保持 8）、不做顺手重构；不建 tag / 不 push / 不 publish / 不建 Release。
- v0.2.2 发布状态翻转项只改**状态口径与只读取证**：不改任何 `src/` 业务代码 / UI / 算法 / 平台能力；不改 `release.yml` / 任何 workflow、发布模型、`electron-builder.yml`、版本号、依赖；不创建 / 移动 / 删除 / 重打任何 tag，不改写任何历史 Release 与资产（含 v0.2.1 / v0.1.2）；不在本机重新打包、重跑签名或公证（证据只来自公开 Release 的既有产物）；不改 v0.2.1 证据文件的 `status: blocked` 历史结论；不做功能改动与 UI 自测；不在仓库内保留任何下载产物（下载必须落到仓库外临时目录）。
- v0.2.3 收敛项只做**版本收敛与发布文档对齐**（承接已合入 `main` HEAD `75848af` 的悬空链接 / 不可读项容错修复 `4408c10`，落在 `src/core/directory/compare.ts`、`src/core/directory/snapshot.ts`、`src/main/platform/electron-platform.ts` 与工作台提示）：不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts` 的版本耦合断言）、`src/renderer/`、`src/preload/`、`src/shared/` 的任何业务逻辑；不改 `src/main/release-evidence.test.ts`；不新建或补写 `docs/release-evidence/v0.2.3.md`（取证与「已发布」翻版是 tag / Release 完成后的后续工作项）；不删除、不放宽、不绕过任何发布门断言（签名 / 公证、唯一公开 Release、祖先门、`latest*.yml` 版本、6 项 Secrets 原样保留），除 prd 明列的版本耦合重定标外不改断言口径；不改 `release.yml` 的步骤顺序 / 触发条件 / 发布模型 / fail-closed 配置，不新增 workflow 校验步骤；不对悬空链接容错做代码侧补强、不做性能调优、不调并发默认值（保持 8 路）、不做顺手重构或格式化；不改 `electron-builder.yml`、`build/`、品牌图标、依赖与锁文件；不建 tag / 不 push / 不 publish / 不创建 Release。
- v0.2.4 收敛项只做**版本 / 文档口径收敛 + 幽灵发布防护**：不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts`）、`src/renderer/`、`src/preload/`、`src/shared/` 业务逻辑，不碰相位计数实现与其测试（在飞工作项 `wi_intake_f1695c0476174245` 的范围），不调并发默认值（保持 8 路）、不做性能优化或顺手重构；不动 `@core` / renderer 四态语义；不改 `electron-builder.yml` / `build/**` / entitlements / 签名身份 / 发布通道模型 / 依赖与锁文件；`release.yml` 除 dispatch 默认 tag 与 finalize 末尾新增**只读** latest-release 校验外不加任何步骤（不新增远端写）；不建 tag / 不 push / 不 publish / 不创建 / 编辑 / 公开 / 上传 Release，不删除 / 移动 / 重打历史 tag；不写 `docs/release-evidence/v0.2.4.md`，不改写 `docs/release-evidence/v0.2.{1,2}.md` 与 `src/main/release-evidence.test.ts`；不跑实机验收 / self-test / 安装包安装，不重跑 CI，不做多平台交叉编译；不重写 README 全文、不新增文档体系、不改 `AGENTS.md`、不写英文版发布说明、不引入 changesets / semantic-release。
- v0.2.5 取证翻转项只做**只读取证 + 文档 / 测试翻转**：不翻 `README.md` / `docs/release-signing.md` 的「待发布 → 已发布」状态，不动 `latestPublishedTag` / `lastReleasedNotesPath` 锚点（归后继 WI）；不打 tag、不 push、不 `workflow_dispatch`、不重跑发布场、不上传 / 替换 / 删除任何 Release 资产、不改 release notes 正文；不改产品运行时代码（`src/core/**`、`src/main/**` 除 `release-evidence.test.ts`、`src/renderer/**`、`src/shared/**`）；不改 `.github/workflows/release.yml`、`electron-builder.yml`、`scripts/release-metadata.mjs`（只消费它）；不填第 6 节 product-qa 复验内容；不重做签名 / 公证、不重新打包、不改 v0.2.4 及更早 notes / evidence / 哈希 / tag 描述；不顺手优化文档排版与测试结构、不引入 `electron-updater`。

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
- **版本身份单一来源**：`package.json#version` = `0.2.2`；文档里的字面版本由测试与 `package.json` 交叉比对，测试优先用 `currentVersion` / `currentTag`（由 `package.json` 推导）而非硬编码（`ac-pkg-version` 与 `ac-packaging-test-sync` 一起兜住）。
- **漂移事实的 13 只是规划基线快照**，不硬编码为实时真值（本项开工时 `main` 已领先 23 个提交，Wave 1 四项已合入）：文档措辞须体现「规划基线 13，实际以 tag 时 main 为准」；断言只校验「是祖先 + 领先数 > 0」，绝不写死 13 或 23 的等值比较。
- **测试对仓库根只读文件、对 git 只读 fixture**：仓库根只用 `node:fs` 读配置 / 文档，不执行任何 git 子命令；所有 git 调用走统一 `fixtureGit(repo, args)` helper，只作用在 `os.tmpdir()` fixture 里，禁止 shell 拼接，禁止 `git tag` / `push` / `fetch` / `merge` / `rebase` 作用于本仓；CI preflight 仍只读（`git rev-list --count` / `git rev-parse` / `git cat-file` / `git cherry` / `git diff-tree`）。
- **fixture 环境必须自包含**：`git init -b <显式分支>`（不依赖 `init.defaultBranch`）；身份走 `GIT_AUTHOR_*` / `GIT_COMMITTER_*`；固定 `GIT_CONFIG_GLOBAL=/dev/null`、`GIT_CONFIG_SYSTEM=/dev/null`、`GIT_CONFIG_NOSYSTEM=1`；丢弃所有继承的 `GIT_*`（`GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` / alternates 等）并指向独立临时 HOME；禁止 `...process.env` 直接带全局配置进 fixture。
- **祖先门脚本仍从 `release.yml` 的 `Preflight v0.1.2 ancestry` 步骤读取并原样执行**：测试执行的是真实发布脚本，不复制一份到仓库脚本文件（旧 tag checkout 会缺文件）。
- **`gates` checkout 配 `fetch-depth: 0`**：CI 侧仍需 tag 与完整历史可见；单测侧不再依赖该检出状态，干净 clone、源码 tarball 与无 git 环境走同一路径。
- **断言落点复用现有资产**：扩展 `src/main/release-packaging.test.ts` 的既有 describe 组（`release version gate` / `release notes changelog` / `release signing credentials checklist` / `github release publishing`），不新建第二套测试文件；新增 UI/交互无关。
- 既有「v0.1.2 姿态」类用例已收敛为按当前 tag（`currentTag`）断言，保留 `not.toMatch(/发布状态：冻结/)` 之类防回退守卫，并保留 README / 签名文档中 `v0.1.2` 漂移段落（否则 `ac-drift-facts-*` 会失去落点）。
- `docs/release-notes/v0.2.1.md` 为纯 Markdown、零前端代码，作为人工创建 Release 时粘贴的来源文本；`v0.2.0.md` 保留为历史文件；不引入自动生成脚本。
- **祖先门必须内联在 `release.yml` 的步骤里**：dispatch 使用 main 上的 workflow 文件，但 gates 会 checkout `refs/tags/<tag>`，引用仓库内新脚本会在旧 tag 上找不到文件而误失败。门须可被 vitest 直接执行：测试解析 `.github/workflows/release.yml` 取出该步骤的 `run` 脚本，在 `os.tmpdir()` 下的临时 git 仓库里跑 `bash`，不得改动本仓 refs。
- **版本字面量从 `package.json` 推导**：`src/main/release-packaging.test.ts` 用 `const currentVersion = pkg.version` / `const currentTag = \`v${currentVersion}\`` 驱动 release notes 路径、dispatch 默认 tag、README 状态行、CHANGELOG 段序等断言，避免下一版再次硬编码漂移。**v0.2.2 起连「当前版本钉住」那条断言也取消**：`release-packaging.test.ts` 里不出现 `'0.2.2'` / `'v0.2.2'` 字面量，版本一致性全部经 `currentTag` 互校（CHANGELOG 标题、发布说明文件名与首标题、README 状态行、workflow dispatch 默认值）。
- **v0.2.1 取证文件只做只读记录**：`docs/release-evidence/v0.2.1.md` 落 `status: blocked`，只含就绪门命令原始输出、缺失项、待人工动作与升级说明；不得提前写入任何通过标记（`valid on disk` / `The validate action worked!` / `source=Notarized Developer ID`）或产物 SHA-256；`v0.2.0.md` 保留为历史且不再更新。
- **改动范围收敛**：允许改 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`.github/workflows/release.yml`（仅 `workflow_dispatch.inputs.tag.default`）、`docs/release-notes/v0.2.1.md`（新增）、`docs/release-evidence/v0.2.1.md`（新增）、`src/main/release-packaging.test.ts`、`src/main/release-evidence.test.ts`；触发方式、gates-first 顺序、`refs/tags/<tag>` checkout 次数与发布语义一律不动。
- **不额外新增门**：走既有 `code_gates`（install / lint / typecheck / build / build:web / test），不为本项加新脚本或新 gate。
- **tag 解析统一走一个工作流级 env**（`RELEASE_TAG: ${{ inputs.tag || github.ref_name }}`）：push 与 dispatch 共用同一套发布步骤，不写两套分支逻辑；除 `RELEASE_TAG` 定义处外，tag 相关步骤不得再读 `GITHUB_REF_NAME`。与新语义冲突的旧断言必须同步修正（祖先必须严格祖先、README「正式版 v0.2.x」、测试内只读 git 子命令白名单），但 driftFacts、v0.1.2 资产保护、硬校验顺序等断言不得削弱。
- **发布后自检一律 `gh api ... --paginate | jq -s`**：`--slurp` 只在**不使用** `--jq` / `--template` 时合法（gh 2.97.0 实测报 `the --slurp option is not supported with --jq or --template`）；`jq -s` 把多页文档 slurp 成 `[[...],[...]]`，故保留 `.[][]` 语义；需要原始字符串时用 `jq -s -r`。采用最小 diff 替换，不重写整段脚本。
- **显式 fail-closed 而非依赖 shell 比较退出码**：Actions 默认 `bash -e` 下断言失败必须落到显式 `exit 1`；空值 / 非整数计数的 `[ "" -ne 1 ]` 返回 status 2，若只写在 `if` 条件里会被当作 false 从而静默通过，故计数先做 `^[0-9]+$` 校验再比较。
- **测试只做静态文本 / 结构断言**：不引入网络调用或对真实 GitHub API 的依赖；全文件扫描断言需先把 `\` 续行折叠成单行，再逐行过滤 `gh api` 命令（跳过注释行）后检查 `--slurp` 与 `--jq` / `--template` 不同时出现。
- **改动范围收敛（本项）**：只改 `.github/workflows/release.yml`、`src/main/release-packaging.test.ts`、必要时 `README.md` 第 5 行；其余文件不动。
- **发布状态口径唯一落点是 README 第 5 行单段 blockquote**（`> ✅ **当前发布状态：…**`）：只替换状态口径与 Release 链接，签名 / 公证 / 凭据 / fail-closed 说明文字逐字保留；签名文档只改第 5 行状态行，标题、6 项 Secret 表、v0.1.2 漂移记录、补发用法、打包后硬校验段落不得改动。
- **测试源码版本一律走模板**：本项新增 / 反转的 README 与签名文档断言必须用 `` `${currentTag}` `` 派生，不新增 `0.2.2` / `v0.2.2` 字面量（`v0.2.1` 作为上一发布版本可留在既有断言里）。
- **取证命令一律只读**：`gh release view` / `gh release download`、`shasum -a 256`、`ditto -x -k`、`hdiutil attach -nobrowse -readonly`、`codesign --verify` / `-dv`、`xcrun stapler validate`、`spctl -a -vv --type execute`、`PlistBuddy`；结束时 `hdiutil detach`，临时目录 `mktemp -d` 于仓库外。证据文件写原始输出而不是结论摘要；任一产物或凭据不可得则落 `status: blocked` 并 `munk_report_owner` 上报，绝不臆造通过标记。
- **证据测试复用同一解析函数**：`release-evidence.test.ts` 把证据路径 / 版本号参数化（`inspectReleaseEvidence(doc, version)` / `readEvidence(path)`），不为 v0.2.2 复制一套逻辑；v0.2.1 的 describe 与断言文本原样保留，测试不联网 / 不下载 / 不挂载。
- **版本字面量只许出现在 `package.json#version` 与历史文档段落**（`CHANGELOG.md` 的 ≤ v0.2.2 段、既有 `docs/release-notes/v0.2.{0,1,2}.md`、`docs/release-evidence/*`）：新建文档标题与文件名中的 `v0.2.3` 是文档标识不算内联断言；`workflow_dispatch` 默认 tag 是 GitHub 要求的静态字符串，由测试以 `currentTag` 交叉校验。
- **发布状态口径唯一落点仍是 README 第 5 行单段 blockquote**（`> ⏳ **当前发布状态：…**`）：只替换版本、待发布口径与说明链接，签名 / 公证 / 6 项 Secret / fail-closed 说明文字逐字保留；先例为 `a6f9951`（待发布）/ `d483ba2`（翻已发布）。签名文档只改状态行、第三节姿态标题、发布说明链接、v0.1.2 漂移段承接句与第五节补发默认 tag，6 项 Secret 表 / 漂移事实 / 打包后硬校验段落不得改动。
- **待发布口径必然把「已发布」断言翻为「待发布」**，这就是本项的「版本耦合重定标」：检查项、覆盖范围、fail-closed 强度不变，只重定标当前 tag 与状态词；禁止借机删断言或放宽匹配（不得改为 `toBeTruthy()` / 宽松正则）。
- **`release-packaging.test.ts` 重定标只动三处**（`lastReleasedNotesPath` 连注释 `v0.2.1` → `v0.2.2`；当前 changelog 段切片改 `## ${currentTag}`..`## v0.2.2` 并换悬空链接 / 跳过计数关键词；当前发布说明断言换 `v0.2.2 及更早` 与跳过提示、EMFILE 关键词落到 v0.2.2 侧），允许按 ac-test-retarget-keeps-intent(e) 新增 `currentTag` 派生断言；测试仍不得读取 `.git`、真实 tag 或网络。
- **文案必须与代码一致**：提示原文取 `src/renderer/src/workbench/Workbench.tsx` 的 `已跳过：左 ${leftSkipped} / 右 ${rightSkipped}`，目录视图统计取 `src/renderer/src/views/DirectoryView.tsx` 的同一按侧文案；符号链接口径见 `docs/symlink-no-follow.md`；术语沿用「目录对比」「快照」「悬空符号链接」「不可读项」「摘要直写缓存」。
- **内存段只按实测口径陈述**（DawnChat ↔ ZenMind、134 万文件、原实现需读 10.67 GiB），不外推为通用承诺、不编造其它数字，不得宣称「零拷贝」「流式哈希」等代码未实现的机制；发布说明以「跳过并计数 + info 提示」为唯一用户可见变化主线，EMFILE 只作上一版历史记录（`src/core/directory/compare.ts` 中 `EMFILE` / `ENFILE` 仍为可读错误，行为未变）。
- **提交信息风格沿用 `chore(release): …`**；不新增门，走既有 code_gates（install / lint / typecheck / build / build:web / test）。
- **v0.2.4 版本身份单一来源仍是 `package.json#version`**（`0.2.4`）；文档字面版本由测试与 `package.json` 交叉核对，当前版本在测试源码中一律经 `currentTag` 派生，不新增 `0.2.4` / `v0.2.4` 字面量；幽灵版本（`v0.2.3`）负向断言用运行时拼接（如 `['v0.2', '3'].join('.')`）构造，避免断言自匹配。
- **文档扫描范围固定**为 `README.md`、`CHANGELOG.md`、`docs/**/*.md`；`.munk/**` 下的历史 Host 记录不在扫描范围（因此基线文档中保留 v0.2.3 历史叙述不会让断言红灯）。
- **发布状态口径唯一落点仍是 `README.md` 第 5 行单段 blockquote**：只替换版本 / 待发布 / 说明链接，签名、公证、6 项 Secret、fail-closed 文字逐字保留（先例 `a6f9951` / `d483ba2`）；「版本与下载」表格是本项新增的最小结构（三行，不扩成完整历史下载清单，不引入其它版本行或外链）。
- **`docs/release-signing.md` 只改五处**：第 5 行状态、第三节姿态标题、发布说明链接、v0.1.2 承接句、第五节补发默认 tag；表格与漂移事实、硬校验段落逐字保留。
- **`release.yml` 追加的只读步骤放在 `finalize` job 末尾**（既有资产校验步骤之后）：只读 `gh release list`，命令按裁定原样使用 `gh release list --limit 1 --json tagName`（不追加 `--exclude-drafts` / `--exclude-pre-releases`），用 `jq -r '.[0].tagName // empty'` 解析，空值同样 `::error::` + `exit 1`；沿用仓库既有 `gh api ... | jq` 风格，避免 `--slurp` 与 `--jq` 同用。
- **文案必须与已合入 `main` 的实现一致**：不宣称代码未实现的机制（如「零拷贝」），进度 / 相位术语与工作台文案对齐（扫描目录 / 校验内容）；符号链接计数按实测事实陈述为已知未修；「已知问题」段与「本次修复」段物理分离（三条已知未修项写明影响面，每条标「已知未修」）。
- **v0.2.5「待发布」是既定交付姿态，不是遗漏**：上游 `v0.2.4` tag 树里的 README 第 5 行即写「v0.2.4 待发布；最新公开 Release 为 v0.2.2」，`release.yml` 的 gates 在 tag 树上跑 `pnpm test`，因此待发布态的断言翻转必须落在同一个 tag 树内；`已发布` 翻转由发布完成后的独立动作完成（v0.2.4 即如此）。不要为「让文档看起来已完成」而写成「已发布」。
- **证据文件只留位、不填值**：`docs/release-evidence/v0.2.5.md` 的 `status: pending` 与空表位是刻意设计：任何 sha256 / CI run / 通过原文的伪造都会被 `ac-evidence-pending` 与后续 `release-evidence.test.ts` 风格断言抓住；真实数字回填由发布后动作或 product-qa 完成。
- **真实数字只许引用，不许重算/改写**：内存数字取自 `docs/perf/large-directory-memory.md` 与 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`；符号链接 footer 取自 `docs/symlink-no-follow.md` 与 `docs/evidence/symlink-footer-*.json`；取消门禁取自 `pnpm test:cancel`（`cancel-gate`）。README 引用时不得修改证据文件里的任何数字或断言。
- **校验入口的口径照抄 CI 既有实现，不发明新 schema**：`release.yml` 的 `Assert latest*.yml urls match the release assets` 已定义解析规则（`files:` 块内 `- url:` 与紧随条目的 `url` / `path` 键，去引号、去 `./` 前缀后与资产名集合做成员校验；任一缺失即失败；`files` 声明为空也算失败）；本地脚本必须与该规则等价，Windows 旧错位名检查（连字符 `OpenCompare-Setup-<version>.exe` 为唯一合法形态）是本项新增的本地补充。
- **测试成组更新，不要逐条打补丁**：把「当前版本」相关断言视为一组——待发布状态三处（README 首屏 / 版本表当前行 / signing 状态行）、`publishedTags`（需含 `v0.2.4`）、`ghostRow`（历史事实「内容并入 v0.2.4」不能随版本漂移）、当前 notes 内容断言（v0.2.4 内容改为读历史文件）、已知问题条数（0 未修 / 2 已修）。任何一处漏改都会让 tag 树上的 gates 红；`release-packaging.test.ts` 顶部「文档/工作流默认值一律从 `package.json#version` 派生」的设计保持不变。
- **元数据校验脚本零构建依赖**：`scripts/release-metadata.mjs`（+ `scripts/release-metadata.d.mts` 类型声明、`package.json` 的 `release:metadata` script）与 `perf-dir.mjs` / `perf-gate.mjs` 同级；vitest 用例用 `mkdtempSync` 造临时 `release/` 与 `latest*.yml`，既调用纯函数也 `spawnSync` 断言退出码；`release/` 不存在时给可读失败信息而非崩溃，该路径不进入 `code_gates`。
- **v0.2.5 取证命令一律只读且落在仓库外**：`gh release download` 到 `mktemp -d`、`wc -c` / `shasum -a 256`、`hdiutil attach`（结束含失败路径必须 `hdiutil detach`）、`ditto -x -k`、`codesign` / `xcrun stapler` / `spctl`、`pnpm release:metadata --dir`；仓库只落文档与测试改动，不落任何下载产物。证据必须来自命令原始输出，禁止改写、摘要或按骨架预期「凑」结果；真实输出与骨架形态不同时以真实输出为准并同步修正文档措辞。
- **`status: verified` 的判定门 = 第 2～5 节实测齐备 + 历史未变**：第 6 节是 product-qa 交接区，保留其全部标记，末尾 status 规则句改成不与 `verified` 矛盾的表述。
- **测试改动只落 v0.2.5 描述块（外加符号链接证据新断言）**：v0.2.1 / v0.2.4 块（含 `v024Assets` 11 组 sha256 钉板）逐字不动；不得靠删断言换绿；verified 负向夹具覆盖「缺一个标记对 / 错 sha256 / 少一行资产 / 混入 `status: pending`」四类。
- **64 位十六进制白名单的唯一例外**：`codesign -dv --verbose=4` 原始输出必然带签名 bundle 自身的 `CDHash`（`3a46aec75cdbf188cade0bcc04bb297f5fe91c4298b3efcc7dc5a19c21f56adb`，在 dmg / zip 两套产物中以 `CandidateCDHashFull` / `CMSDigest` 反复出现），它不是资产摘要。因此 `ac-assets-exactly-11` 的「全文无其它 64 位十六进制」按实测收窄为：除 11 个资产 sha256 外只允许该 CDHash 单值，并在第 4 节末尾显式写明口径；测试用 `allowedDigests` 白名单钉死，任何其它 64 位十六进制判红。
- **符号链接证据断头路**：`docs/evidence/symlink-footer-{old,new}.json` 去掉 `OPENCOMPARE_SYMLINK_EVIDENCE ` 前缀成为合法 JSON（数字内容不改），测量脚本把标记行只写 stdout、`OPENCOMPARE_EVIDENCE_OUT` 落纯 JSON，序列化集中在 `scripts/symlink-evidence-format.ts`；`docs/symlink-no-follow.md` 中每个 `docs/...` 引用必须可解析，不再有指向 `.raw.log` 的断头路。该部分 AC 定义落在 `symlink-semantics` 域。

## 最近交付证明

- WI：`wi_ws_78db9f76d9541e6e`（v0.2.5 发布证据采集与元数据实测；`kind: release-evidence`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过）。本域首次把「已发布」事实落档：`docs/release-evidence/v0.2.5.md` 由 `status: pending` 翻为 `status: verified`，README / signing 的「已发布」翻转仍留给后继 WI。
- 覆盖摘要：
  - **前置硬门**（执行时复核，非沿用 intake 快照）：run `39713762292`（`workflow_dispatch`，headSha `2eedc5de1ebfbc8e835d08d18e959b394fadceb4`）conclusion `success`，`Quality gates` / `Package mac` / `Package win` / `Package linux` / `Publish the GitHub Release` 五 job 全 success；`gh release view v0.2.5` `isDraft:false` / `isPrerelease:false`，published `2026-10-22T02:56:27Z`，资产 11 件；tag 对象 `384da78…`，构建检出 `refs/tags/v0.2.5` → `f296349…`。
  - **§2 资产实测**：11 件资产下载到仓库外 `mktemp -d`（`/var/folders/.../T/oc025.rXxo8J`），逐件 `wc -c` + `shasum -a 256`；11 行字节 / sha256 与 API `.size` / `.digest` 11/11 对齐，11 个 sha256 互不相同。
  - **§3 唯一 Release / latest 门**：CI 日志原文两行 `releases for v0.2.5: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.5 (this tag: v0.2.5)`；Release URL `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5`。
  - **§4 两套 macOS 产物**：dmg `hdiutil attach -nobrowse -readonly` 挂载后对卷内 `.app`、zip `ditto -x -k` 解包后对 `.app` 各跑四条命令并原样粘贴；`valid on disk` / `satisfies its Designated Requirement` / `The validate action worked!` / `accepted` / `source=Notarized Developer ID` 各 ≥2 次，文档明确标注 dmg / zip 两套来源，`hdiutil detach` 输出 `"disk18" ejected.`；两套 `CDHash` 相同（`3a46aec7…`）。
  - **§5 元数据**：`pnpm release:metadata --dir $EVID` 退出 0，三行 `url 2/2` / `2/2` / `1/1` 命中、`旧错位名 0 命中`、`release:metadata 校验通过：3 份 latest*.yml、11 个资产名。`；Windows 资产为 `OpenCompare-Setup-0.2.5.exe` 连字符形态。
  - **测试翻转**：`src/main/release-evidence.test.ts` +253/−76——v0.2.1 / v0.2.4 块逐字未动，v0.2.5 pending describe 换成 `inspectV025Evidence` + verified 正/负断言（资产钉板、run/job/最新门、两套产物标记、元数据三行、第 6 节交接区）；负向夹具四类（缺标记对 / 错 sha256 / 少一行资产 / 残留 pending）全部判红；`allowedDigests` 白名单允许唯一 bundle CDHash。
  - **符号链接断头路**：两个 JSON 去前缀成合法 JSON（`fileCount` 1,338,294 / 752,479 未改）；`scripts/measure-symlink-footer.evidence.test.ts` 改用 `formatSymlinkEvidence`（stdout 带标记、OUT 纯 JSON）；`docs/symlink-no-follow.md` 两处 `.raw.log` 引用改写为真实存在的路径；新增 `scripts/symlink-evidence-format.ts` 与 `src/main/symlink-evidence.test.ts`（JSON 可解析、与 harness 输出逐字节一致、OUT 纯 JSON、文档 `docs/...` 引用全部可解析）。
- 证据：`git diff --numstat`（不含 fold）为 `docs/release-evidence/v0.2.5.md` +215/−41、`src/main/release-evidence.test.ts` +253/−76、`docs/symlink-no-follow.md` +3/−3、`scripts/measure-symlink-footer.evidence.test.ts` +11/−6、两个 JSON 各 1 行替换；新增 `scripts/symlink-evidence-format.ts`（23 行）与 `src/main/symlink-evidence.test.ts`（78 行）。静态核对：`^status: verified$` 恰好 1 处、`pending` 0 命中、资产表 11 行、占位符 0 命中、历史 evidence / notes 零改动、两个 JSON `JSON.parse` 得到 1338294 / 752479。
- 注：本 WI change pack 只提供 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**` —— 无 change-pack 用例可 copy、无 tech/ux 手合；验收按 AC 逐条落档为 `qa/v025-published-evidence-verified.md`（符号链接两条 AC 落 `symlink-semantics` 域）。
- 后续注意：① **`ac-assets-exactly-11` 的「无其它 64 位十六进制」在原措辞下不可实现**——只要原样粘贴 `codesign -dv --verbose=4`，就必然出现 bundle 的 `CDHash`（本文件 5 次）。实现选择是保留原文 + 显式口径 + 测试白名单，后续任何新的 `codesign` 原文粘贴都必须同步该白名单，否则 verified 断言会红。② **证据全部来自本机取证，仓库内不可复现**：11 件资产、run 日志、两套 `.app` 输出都没有入库副本，CI 重跑或资产被替换后这些数字会失真；后续若要再核，只能重跑 `gh release download` + 四条命令并与 API digest 对比。③ 本次没有翻 README / signing 状态，也没有更新 `latestPublishedTag` / `lastReleasedNotesPath` 锚点——后继 WI 若不翻，仓库文档仍宣称「v0.2.5 待发布」，与已 verified 的证据文件产生口径分叉。
