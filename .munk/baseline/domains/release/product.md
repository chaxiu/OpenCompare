# Domain: release

打包分发与 GitHub 开源发布：electron-builder 跨平台打包目标、macOS Developer ID 签名 + Apple 公证、`v*` tag 触发的门禁前置 CI、版本对齐闸、GitHub Release 唯一公开可见、发布后验证派发，以及仓库门面（README / LICENSE）、签名凭据清单与发布配置断言单测。本域不含应用业务功能与视觉基线；发布后验收驱动本身归 `domains/release-verify`。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis + zip）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts；`appId` 恒为 `com.opencompare.app`，`productName` 恒为 `OpenCompare`。
- **品牌图标**：`build/icons/icon.svg` 是唯一可编辑源，`node build/icons/generate-icons.mjs` 仅用 Node 标准库生成并入库 `build/icons/icon-{16…1024}.png`、`build/icon.png`（1024²，兼作 Linux 与运行时图标）、`build/icon.icns`、`build/icon.ico`；`electron-builder.yml` 显式接线 `mac.icon` / `win.icon` / `linux.icon`，并以 `extraResources` 把 `build/icon.png` 放进打包根 `resources/`。手册见 `docs/brand-assets.md`。
- **协议声明**：`protocols` 声明 `opencompare` scheme（`name` 非空），`linux.desktop.entry.MimeType` 含 `x-scheme-handler/opencompare`；运行时接管归 `launch` 域。
- **macOS 签名与公证**：`mac` 段启用 `hardenedRuntime`、entitlements（`allow-jit` / `allow-unsigned-executable-memory` / `disable-library-validation`）与 `notarize: true`，钉死 `identity: 'Developer ID Application: Tao Zhu (3X4J53U6RY)'`；证书经 `CSC_LINK` / `CSC_KEY_PASSWORD`，公证走 App Store Connect API Key 模式（`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`，`APPLE_TEAM_ID=3X4J53U6RY`）。仓内零证书 / 密钥明文。
- **凭据 fail-closed**：mac 矩阵步骤打包前逐一检查 6 个 Secret，任一缺失即 `::error::` 列出缺失项并非零退出，绝不产出 / 上传 / 公开未签名裸包，无静默降级分支。`APPLE_API_KEY` 的 base64 `.p8` 在 `$RUNNER_TEMP` 解码为 `600` 权限的仓库外文件，打包后清理，日志不打印内容。
- **发布触发与 tag 单点**：`.github/workflows/release.yml` 监听 `v*` tag push，另声明 `workflow_dispatch`（输入 `tag`，required）；工作流级 `RELEASE_TAG: ${{ inputs.tag || github.ref_name }}` 是唯一 tag 来源，版本断言 / Release 预建 / 上传 / 公开 / 唯一性与资产校验全部引用它。dispatch 路径 checkout `refs/tags/${RELEASE_TAG}`，不得把 `main` 当 tag。
- **流水线形状**：`gates` job（frozen-lockfile install / lint / typecheck / test / build，末尾单点预建该 tag 的唯一 draft Release，重复同名只留一个）→ mac/win/linux 矩阵 `electron-builder --publish never` 本地打包 → `gh release upload "${RELEASE_TAG}" <三端产物> --clobber` 汇聚上传 → `finalize` 用 `gh release edit … --draft=false --latest` 公开。Release 唯一性以 tag 为准，杜绝并发建单竞态。
- **发布前只读门**：tag 格式（`^v\d+\.\d+\.\d+$`）、`refs/tags/<tag>` 可解析、`package.json#version` 严格 semver、v0.1.2 祖先门（内联在 workflow 步骤里，dispatch 用 main 的 workflow 却 checkout 旧 tag，引用仓库内新脚本会误失败）；`v0.1.2..HEAD` 为 0 也失败。全部门只做只读 git 查询，不移动 ref。
- **发布正文来源**：`finalize` 前的预建步骤按 `package.json#version` 读 `docs/release-notes/v${version}.md` 与 `v${version}.zh-CN.md`，任一缺失或去空白后为空即 `::error::` + 非零退出（早于任何 `gh release create/edit`），不退回 `--generate-notes`。body 顺序 = 英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → `**Full Changelog**`（base 取上次已发布 Release）。`finalize` 公开后追加只读步骤反查 body 含两段且各含 `${RELEASE_TAG}`，并校验语言切换链接为绝对 URL、正文无 `](./`。
- **产物与元数据断言**：各平台必需扩展名产物至少一份（mac `.dmg` / `.zip`、win `.exe` + `-win-x64.zip`、linux `.AppImage` / `.deb`），文件名与 `latest*.yml#version`、`files[].url` 版本一致且无其它版本残留；`nsis.artifactName` 为连字符形态；AppImage blockmap 尾部 4 字节小端 / 大端双候选自洽；`latest.yml` 不得被 win zip 污染（独立 fail-closed 断言）。
- **唯一公开正式 Release**：每个 tag 恰好一个公开（非 draft、非 prerelease）Release；资产覆盖 `.dmg` / `.zip` / `.exe` / `.AppImage` / `.deb` 与 `latest-mac.yml` / `latest.yml` / `latest-linux.yml`，Windows 按精确名核验两个资产。只读校验用 `gh api … --paginate | jq -s`（`--slurp` 不得与 `--jq` / `--template` 同用），空值 / 非整数计数先行 `^[0-9]+$` 校验再比较，任何空输出 `::error::` + `exit 1`。
- **无法绕行**：`release.yml` 全文无 `continue-on-error: true` / `|| true` / `--no-verify`，上传步骤不带 `if: always()`；硬校验顺序固定为 6 项 Secret → `.p8` 物化 → 打包 → 图标/版本身份 → 签名/公证 → 产物名与 `latest*.yml` → 上传。
- **发布后验证派发**：`finalize` 公开后主动 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}"`，再按 `displayTitle` 含 tag 且 `createdAt >= since` 查 run（300 s 超时）、跟 aggregate `conclusion == success`（5400 s）与 artifact 名（900 s）两跳，任一失败即 `exit 1`；job 级 `permissions` 必须同时含 `contents: write` 与 `actions: write`（覆盖而非合并）。派发成功 ≠ 验证发生。
- **发布面文档**：两版 `README.md`（英文默认 + 中文镜像，第 3 行互链、第 5 行单行发布状态块、9 节同序镜像、两张真实截图）与 `docs/release-process.md`（发布流程正文外置）；`docs/release-signing.md` 含 6 项凭据清单 / API Key 模式 / v0.1.2 漂移事实 / 打包后硬校验 / Windows Authenticode 口径；`docs/repo-metadata.md` 记录英文简介、Topics 与 `gh repo edit` 命令（最后一步执行，权限受阻则如实记录并停止）。`CHANGELOG.md` 按 Keep a Changelog 记录，发布说明只写相对上一版新增的用户可见变化。
- **版本锚点解耦**：`currentTag` / `releaseNotesPath` / CHANGELOG 顶段 / dispatch 默认值随 `package.json#version` 走；`latestPublishedTag` / `lastReleasedNotesPath` / 历史证据路径是公开事实，不随 bump 漂移。发布前态二者不等，发布收尾后相等；派生断言必须整组翻面并重锚，禁止删断言换绿。
- **发布证据**：`docs/release-evidence/<tag>.md` 记录 CI run / 资产 sha256 与字节 / 签名 + 公证 + `stapler` + `spctl` 原文 / latest 门 / 语言与链接；就绪门不满足时写 `status: blocked` 并升级 Owner，不臆造通过标记；`docs/release-evidence-ledger.json` 台账同时允许 `verified`（含 `assets`）与 `blocked`（无 `assets`）两类行。
- **发布测试分层与纯函数判定**：发布面测试拆为 `release-packaging` / `release-version-gate` / `release-artifacts-and-brand` 三层 + 测试专用 helper；判定逻辑下沉到 `src/main/release-gate.ts` 与 `src/main/release-metadata-gate.ts` 纯函数（返回 `{ ok, issues }`，零 fs / electron / react / DOM），真实仓库事实只由 helper 装载一次；evidence 层只做目录遍历与结构不变量断言，sha256 从 markdown 解析。

## 验收

- **ac-pkg-metadata / ac-deb-maintainer**：`author` 为对象且含非空 `email`，`license` 为 MIT，`homepage` 为 `https://github.com/chaxiu/OpenCompare`；`linux.maintainer` 含 email；`linux.target` 仍为 AppImage 与 deb。
- **ac-builder / ac-linux-targets-kept**：配置可解析出三平台目标；不得靠删除 `deb` / `zip` 规避失败。
- **ac-builder-icons-wired / ac-icon-assets-valid / ac-runtime-icon-resource / ac-no-electron-default**：三平台图标均指向入库资产且文件非空、PNG 头 `89 50 4E 47`、主图标 1024²、icns 头 `icns`、ico 头 `00 00 01 00 01 00`；`extraResources` 把 `build/icon.png` 复制为打包根 `icon.png`；与 Electron 默认图标 SHA-256 不同。
- **ac-builder-protocol-config**：顶层 `protocols` 含 `opencompare`，`linux.desktop.entry.MimeType` 含 `x-scheme-handler/opencompare`。
- **ac-builder-mac-signing / ac-builder-notarize / ac-identity-pinned / ac-appid-own**：`hardenedRuntime` + entitlements + `notarize: true`，签名身份显式钉死，`appId` 保持 `com.opencompare.app`。
- **ac-api-key-secrets-wired / ac-fail-closed-six / ac-api-key-file-materialized / ac-legacy-credentials-removed**：只接线 6 个 Secret；缺一即非零退出；`.p8` 解码到仓库外 `600` 文件；不再引用 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`。
- **ac-no-secret-leak / ac-docs-checklist / ac-credentials-checklist**：仓库 / 日志 / digest 无凭据值，错误信息只列缺失名；签名文档含 6 项清单、API Key 模式说明与协助文案。
- **ac-version-tag-aligned / ac-asset-version-match / ac-version-frozen**：`package.json#version` 与 tag（去 `v`）一致，`latest*.yml#version` 与资产名一致；不一致即失败且不产出 Release。
- **ac-release-workflow / ac-single-precreate / ac-no-concurrent-publish / ac-upload-clobber / ac-finalize-repo**：`gates` 先行 + 单点预建 draft；矩阵 `--publish never`；`gh release upload … --clobber` 兼容 pwsh；`finalize` 显式带 `--repo` 且不依赖 git 上下文。
- **ac-single-public-release / ac-assets-exactly-11 / ac-latest-gate**：每个 tag 恰好一个公开 Release（非 draft / 非 prerelease），资产集合完整且版本化；`gh release list --limit 1` 的最新公开 tag 必须等于 `${RELEASE_TAG}`。
- **ac-reproducible-build**：锁定输入（frozen lockfile、固定 pnpm/node 与 Action 版本），同 tag 重跑产出同名同版本产物，无本地手工打包路径；不追求 bit-identical。
- **ac-notes-source / ac-notes-bilingual / ac-notes-body-asserted**：正文来自仓库双语 notes，缺一即 fail-closed 且早于任何 Release 写操作；`--generate-notes` 不再出现在预建步骤；finalize 反查公开 body 的两段与 tag；语言切换链接为绝对 URL 且无 `](./`。
- **ac-notes-dedup / ac-notes-facts**：发布说明只写本版新增的用户可见变化，事实与已合入代码一致；不写未实测数字、不写「已发布 / 已通过」类预宣称、不写 `**Full Changelog**`。
- **ac-anchor-discipline**：`latestPublishedTag` / `lastReleasedNotesPath` 与 `currentTag` 的正确关系（发布前严格早于、发布后相等）成组断言；历史锚一律显式常量钉死，切片端点不得用 `latestPublishedTag` 派生（否则切出空串假绿）；`expect(` / `it(` 只增不减，不得弱化为 `toBeTruthy()` 或删除负向断言。
- **ac-readme-en-line5 / ac-readme-zh-line5 / ac-readme-diff-line5-only**：两版第 5 行为单段发布状态 blockquote（含 `Latest public release:` / `最新公开版本：` 与唯一 `releases/tag/<tag>` 链接，尾句保留）；发布收尾只改该行，9 节标题、第 3 行互链与截图行不变，除第 5 行外零版本字面量。
- **ac-link-whitelist / ac-ghost-posture**：所有 `releases/tag/<tag>` 链接 ∈ 已发布集合 ∪ 当前 tag；从未发布的版本不得有 notes / evidence 文件或 Release 链接。
- **ac-signing-doc**：`docs/release-signing.md` 的状态行、第三节姿态标题、notes / evidence 指向、v0.1.2 承接句、第五节补发默认 tag 与代码同步；6 项 Secret 表、漂移事实、硬校验段与 Windows Authenticode 段逐字保留。
- **ac-evidence-verified / ac-evidence-blocked / ac-evidence-readonly**：证据文件 `status` ∈ `verified` / `blocked`；`verified` 必须 11+ 资产 sha256 + 签名 / 公证 / `stapler` / `spctl` 原文 + latest 门；`blocked` 只有探查原始输出与待人工动作，零 sha256、零通过标记；取证命令只读且落在仓库外临时目录。
- **ac-evidence-ledger**：台账每行的 `assets` 与证据文件一致；`blocked` 行无 `assets` 且由存在性守卫（`ledgerRow(tag)?.assets !== undefined`）与资产数断言共存。
- **ac-release-tests-layered / ac-pure-gate-modules / ac-pure-structured-input / ac-helper-no-assertions**：三层测试文件 + 零 fs/electron/react/DOM 的纯判定模块（`{ ok, issues }`，入参为类型化普通对象、不接收路径）；helper 内 `expect(` 为 0，真实事实由一条终检用例断言 `ok:true`。
- **ac-tocontain-budget / ac-readfilesync-budget / ac-files-lines**：两套发布门套件 `toContain` ≤8、`readFileSync` ≤2（仅数据装载 / 源码守卫）、合计行数在既定上限内（现行 ≤600）。
- **ac-post-release-dispatch / ac-post-release-verify-gate**：`finalize` 派发命令用 `${RELEASE_TAG}` 且步骤正文零版本字面量；查 run 双条件 + 300 s；aggregate / artifact 两跳失败均 `exit 1`；`post-release-verify.yml` 的触发面归 `domains/release-verify`（仅 `workflow_dispatch`）。
- **ac-gates-green**：`.munk/code-gates.json` 全门禁 exit 0（现行 26 门），`pnpm test` 真实执行不接受跳过；不新增依赖、不改发布模型。

## 非目标

- 不做 Windows / Linux 的代码签名或公证（签名 / 公证仅覆盖 macOS Developer ID）；不为 Windows 补证书，只看 Authenticode 口径归 `release-verify`。
- 不进行自动更新（auto-update）与发布密钥托管服务；不引入新发布渠道（npm / Homebrew / Snap 等）；不引入 changesets / semantic-release。
- 不删除 / 移动 / 重打任何历史 tag，不替换已发布资产，不改写历史 Release 正文；本域交付一律不 push、不打 tag、不 dispatch、不做远端写操作（派发属 `finalize` 的 CI 运行时行为）。
- 不追求 bit-identical 二进制可复现；只保证输入锁定与产物名 / 版本确定。
- 不改产品运行时代码、对比算法、UI 与视觉基线；配置断言测试只在 Node 环境读仓库根文件，不引入 Electron / DOM 依赖。
- 不在本地做多平台交叉编译；`.deb` / `.exe` 仅由 CI 对应 runner 构建；Windows 产物无法在 darwin 上验证，不得写「已验证 Windows 产物」。
- 不在发版窗口内重跑公证、重新下载或替换资产；取证只读，产物二进制不入库。

## 实现约束

- **单一版本源**：`package.json#version` 是唯一版本来源；测试一律派生 `currentVersion` / `currentTag` / `latestPublishedTag`，不在测试源码写当前版本字面量（文档标题 / 文件名等标识位置除外），历史版本用显式常量或运行时拼接钉死。
- **锚点翻面是成组的**：一次发布事实变化必须同时翻 README / signing / 版本表 / CHANGELOG 切片 / `publishedTags` / evidence 台账 / 派生断言；`previousPublishedTag` 等历史锚不随前移，`it(` 只增不减，无注释掉断言。
- **tag 解析只走 `RELEASE_TAG`**：push 与 dispatch 共用同一套步骤，除定义处外不得再读 `GITHUB_REF_NAME`；`gates` checkout 需 `fetch-depth: 0`，祖先门脚本必须内联在 workflow 步骤（不能抽仓库文件，旧 tag 树没有）。
- **只读优先、fail-closed 优先**：CI 校验只读（`cat-file` / `rev-parse` / `rev-list` / `cherry` / `diff-tree` / `gh api` GET）；缺凭据、缺正文、计数为空或不等一律显式 `::error::` + `exit 1`，不靠 shell 比较的隐式退出码。
- **测试只读仓库根、git 只读 fixture**：仓库根只用 `node:fs` 读配置 / 文档；git 调用只作用于 `os.tmpdir()` 下的 fixture（`git init -b <显式分支>`、显式身份、`GIT_CONFIG_GLOBAL=/dev/null`、丢弃继承的 `GIT_*`、独立临时 HOME），禁止对本仓执行写 git 操作。
- **证据与断言落点**：`src/main/release-packaging.test.ts` / `release-version-gate.test.ts` / `release-artifacts-and-brand.test.ts` / `release-evidence.test.ts` + 测试专用 helper；判定逻辑在 `src/main/release-gate.ts` / `release-metadata-gate.ts`；`scripts/release-metadata.mjs` 与纯函数判定保持 parity（同 fixture 同结论）；断言全部进既有 `test` 门，不新增门禁类别。
- **Windows 签名隔离**：`Build installers` 的 `CSC_LINK` / `CSC_KEY_PASSWORD` 只在 `matrix.target == 'mac'` 注入——macOS Developer ID 证书泄漏到 win 会让 Windows PE 出现不可信签名（`UnknownError`），由 `release-artifacts-and-brand` 用例钉住。
- **发布状态口径唯一落点**：README 两版第 5 行单段 blockquote；只替换版本 / 状态词 / Release 链接，签名 / 公证 / 6 项 Secret / fail-closed 说明逐字保留；`docs/release-signing.md` 只改状态行、姿态标题、notes / evidence 指向、承接句与补发默认 tag。
- **门禁命令为单条 argv**，提交信息沿用 `chore(release): …`；失败即停手上报，不 `|| true`、不跳项。

## 最近交付证明

- WI：`wi_intake_51f535e26a03b97f`（**修复发版后验证流水线从不自动触发**：`post-release-verify.yml` 自 v0.2.12 起六次发版零 run，根因是 Release 由 `secrets.GITHUB_TOKEN` 公开、该 token 产生的事件不触发新 run。本项把发布后验证改为 `finalize` 主动派发 `gh workflow run post-release-verify.yml -f tag="${RELEASE_TAG}"`，并追加查 run（`displayTitle` 含 tag + `createdAt >= since`，300 s）、aggregate `conclusion == success`、artifact 名含 tag + `run_id` 三条 fail-closed 校验；`post-release-verify.yml` 触发面收敛为仅 `workflow_dispatch` + 含 tag 的 `run-name`；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-11-03
- 结果：`code_gates` passed（**24 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_51f535e26a03b97f/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (24 gates, attempt 001)"`、`failedGateIds: []`）；`test` 门 123 files / **1933 passed + 1 skipped**（1934）、29.64s；发布两套件单跑 **328 passed**；`test-debt-gate` `repoTestLines` 44,462 ≤ 44,462（`growth` 44,398 → 44,462、`addedCases: 6`）、`repoTestCases` 1444 ≥ 1419。
- 改动面：8 个已跟踪路径 +278/−17（`release.yml` +102；`post-release-verify.yml` 9/3；`release-packaging.test.ts` 65/1；两个 `__fixtures__` JSON；`release-doc-fixtures.test-helpers.ts`；`verify-release-gate.test.ts` 4/4；`.munk/baseline/test-debt.json`）。零 diff：`package.json`（`version` 仍 `0.2.18`）、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/release-process.md`、`electron-builder.yml`、`scripts/**`、`.munk/code-gates.json`、两版 README、产品源码。
- 注：① 验收落档在 `qa/post-release-verify-auto-dispatch.md`（`post-release-verify.yml` 的触发面契约同批写到 `domains/release-verify`）。② **被推翻的假设**：「`release: published` 监听 + dispatch 兜底双保险」不成立——`GITHUB_TOKEN` 事件不触发新 run，监听项是死代码，已删除并写进 workflow 头注释；`verify-release-gate` 的旧断言翻面（删 `release` 断言而非补一条）。③ **job 级 `permissions` 是覆盖不是合并**：只加 `actions: write` 会让 `gh release edit --draft=false` 丢 `contents`，后续改 `finalize` 权限必须两项同写。④ **派发成功 ≠ 验证发生**：`gh workflow run` 返回 0 只说明请求被接受，必须再查 run + aggregate + artifact 两跳，且查 run 带 `createdAt >= since`，否则同 tag 重跑会拿旧 run 蒙过。⑤ 发布通道全程只读：未打 tag、未 push、未 dispatch、未写已公开 Release 与资产；人工冒烟与 `v0.2.18` 自动 run 取证在合入 `main` / 发版后完成。
- 跨域注记（同 wave，`wi_intake_2e3f11bbcc75fdc2`）：`release.yml` 的 `CSC_LINK` / `CSC_KEY_PASSWORD` 收窄为 `matrix.target == 'mac'` 才注入——v0.2.17 的 Windows PE 被 macOS Developer ID 证书污染导致 Authenticode `UnknownError`；该修复的验收口径与判定表归 `domains/release-verify`（`qa/post-release-verify-red-legs-fix.md`）。发布通道其余语义未变。
