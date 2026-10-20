# v0.2.0 版本收敛、Release Notes 与 v0.1.2 漂移记录

## 范围

本 Phase 只做「发版元信息收敛 + 只读一致性断言」两件事，不产出任何发布动作。

1. **版本收敛到 0.2.0**
   - `package.json#version` 由 `0.1.2` 改为 `0.2.0`（唯一版本身份来源）。
2. **CHANGELOG 增加 v0.2.0 条目**
   - 新条目排在 v0.1.2 之上，遵循现有 Keep a Changelog 中文风格。
   - 覆盖本版用户可见变化：顶栏常驻「新建对比」+ 免弹窗左右路径直传、启动参数与 `opencompare://compare` 注入 + 单实例接管、文件会话原位写回、自制品牌图标与窗口/关于同源。
3. **新增 `docs/release-notes/v0.2.0.md`**
   - 作为 v0.2.0 GitHub Release Notes 的来源文本；面向用户，不写内部实现流水账。
   - 覆盖上述四类用户可见变化，并说明升级方式（下载新版本安装包）。
4. **README 与 `docs/release-signing.md` 收敛到 v0.2.0 姿态**
   - README 顶部「当前发布状态」由 v0.1.2 改为 v0.2.0，并链接 `docs/release-notes/v0.2.0.md`。
   - `docs/release-signing.md`「正式版发布姿态」段改为 v0.2.0；6 项 Secret 清单、fail-closed 描述、签名/公证口径保持不变。
5. **v0.1.2 漂移记录（只读事实 + 不动作声明）**
   - 在 CHANGELOG 与 `docs/release-signing.md` 两处记录（可共用同一段措辞）：
     - annotated tag `v0.1.2`（tag 对象 `c4a6a95`）指向 commit `7ea2cc6`；
     - `v0.1.2` 是 `main` / `origin/main` 的祖先（tag 不在 main 之外，不存在游离历史）；
     - 规划基线时 `main` 领先 `v0.1.2` 13 个提交（含签名/打包修复），这些提交没有进入已发布的 v0.1.2 资产 —— 这是本版漂移的实质；
     - 远端 `v0.1.2` Release 为公开、非预发布，共 11 个资产（`latest-linux.yml`、`latest-mac.yml`、`latest.yml`、`OpenCompare-0.1.2-arm64-mac.zip(.blockmap)`、`OpenCompare-0.1.2-arm64.dmg(.blockmap)`、`OpenCompare-0.1.2.AppImage`、`OpenCompare.Setup.0.1.2.exe(.blockmap)`、`opencompare_0.1.2_amd64.deb`）；
     - **不删除、不移动、不重打、不替换** `v0.1.2` 的 tag 与资产；tag 之后的修复统一由 `v0.2.0` 承接；后续如需修订只能发布更高版本，不改写历史。
6. **只读一致性断言**
   - 扩展 `src/main/release-packaging.test.ts`：
     - `package.json#version` 为 `0.2.0`，且 CHANGELOG / Release Notes / README / 签名文档口径一致；
     - `v0.1.2` 是 `HEAD` 的祖先，且 `v0.1.2..HEAD` 提交数 > 0；
     - `v0.1.2` tag 内的 `package.json#version` 等于 `0.1.2`（`git show v0.1.2:package.json` 只读读取）；
     - 文档含漂移事实与不动作声明。
   - 扩展 `.github/workflows/release.yml` 的 `gates` job：新增只读 preflight step（当前 tag 语义版本 == `package.json#version` 已有，本项补 tag 祖先 / 非零领先 / 合法 semver），`gates` 的 checkout 改为 `fetch-depth: 0`，使 tag 在 CI 可见。
   - 保留既有「Assert packaged version matches the tag」（`release/latest*.yml` 逐个校验 `version`、为空即失败），并以测试锁定该步骤不被削弱。

## 验收

- ac-pkg-version-020: `package.json#version` 严格等于 `0.2.0`，且符合 semver（主版本.次版本.修订号）。
- ac-changelog-v020-section: `CHANGELOG.md` 含 `## v0.2.0` 段，且出现在 `## v0.1.2` 段之前（新版本在上）。
- ac-changelog-v020-content: `## v0.2.0` 段文本同时包含「新建对比」「路径」「启动参数」或 `opencompare://`「图标」关键词，覆盖本版用户可见变化。
- ac-release-notes-file: `docs/release-notes/v0.2.0.md` 存在且非空，首个一级标题包含 `v0.2.0`。
- ac-release-notes-no-placeholder: `docs/release-notes/v0.2.0.md` 不含 `TODO` / `TBD` / `FIXME` 占位。
- ac-release-notes-version-single-source: 测试从 `docs/release-notes/v0.2.0.md` 标题提取版本号，断言其等于 `package.json#version`（改版本而漏改 Release Notes 时该用例失败）。
- ac-readme-posture-v020: `README.md` 的发布状态行包含 `v0.2.0`，且包含指向 `docs/release-notes/v0.2.0.md` 的链接；不再出现「当前发布状态：正式版 v0.1.2」。
- ac-signing-doc-posture-v020: `docs/release-signing.md` 的正式版发布姿态段标注 `v0.2.0`；`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` 六项与 fail-closed 表述原样保留。
- ac-drift-facts-changelog: `CHANGELOG.md` 含 `v0.1.2` 漂移事实：commit `7ea2cc6`、tag 对象 `c4a6a95`（annotated）、`v0.1.2` 是 main 的祖先、规划基线领先 13 个提交、远端 Release 公开且非预发布、11 个资产。
- ac-drift-facts-signing-doc: `docs/release-signing.md` 含同一组 `v0.1.2` 只读事实（commit `7ea2cc6`、祖先关系、13 个提交基线、11 个资产、公开非预发布）。
- ac-drift-no-action-statement: 两处文档都含不动作声明，同时出现「不删除」「不移动」「不重打」「不替换」与「tag 之后的修复由 v0.2.0 承接」的等价表述。
- ac-test-tag-ancestor: `release-packaging.test.ts` 用只读 git 命令断言 `v0.1.2` 是 `HEAD` 的祖先，且 `v0.1.2..HEAD` 的提交数大于 0；在本仓库全量检出下该用例为通过（非 skip）。
- ac-test-tag-version-match: 测试用 `git show v0.1.2:package.json` 只读读取历史版本，断言其 `version` 为 `0.1.2`，与被记录的漂移事实一致。
- ac-test-skips-without-git-metadata: 当本地无 `.git` 或 `v0.1.2` tag 不可见时，上述两条 git 用例 skip 并给出原因，不产生假失败（不影响 `pnpm test` 在无 git 环境全绿）。
- ac-test-assertions-are-read-only: 测试文件内调用的 git 子命令集合限定为只读子命令（`rev-parse` / `rev-list` / `show` / `cat-file`），测试源码中不出现执行 `git tag`、`git push`、`git fetch`、`git merge`、`git rebase` 或 `gh release` 的代码路径。
- ac-ci-preflight-tag-ancestor: `release.yml` 的 `gates` job 在 `pnpm test` 之前新增 preflight step，断言 `v0.1.2` 是 `HEAD` 祖先且领先提交数非零，失败时以 `::error::` 输出并 `exit 1`。
- ac-ci-preflight-git-metadata: `gates` job 的 `actions/checkout` 设置 `fetch-depth: 0`，使 tag 与历史在 CI 可见（与 preflight 断言配套）。
- ac-ci-preflight-version-semver: preflight step 在版本比对前拒绝非 semver 的 `package.json#version`（如 `0.2`、`v0.2.0`），以 `::error::` 失败退出。
- ac-latest-yml-gate-preserved: `release.yml` 仍保留「Assert packaged version matches the tag」步骤，逐个校验 `release/latest*.yml` 的 `version` 等于 tag，且无匹配文件时报错退出；测试断言该步骤与 glob / 空目录守卫未被删除。
- ac-release-model-unchanged: 测试断言发布模型未被改写：仍为 tag 触发、`gates` 先跑、矩阵 `--publish never`、单点预建 draft、`finalize` 公开，且 workflow 引用的 secrets 集合仍为六项 + `GITHUB_TOKEN`。
- ac-existing-v012-assertions-updated: 原先锁定「README 是 v0.1.2 正式版」「签名文档是 v0.1.2 姿态」的两条用例改为断言 v0.2.0 口径（不是删除覆盖），同时 README / 签名文档仍保留 `v0.1.2` 漂移说明。
- ac-changeset-scope: 本项改动文件仅限 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`docs/release-notes/v0.2.0.md`、`src/main/release-packaging.test.ts`、`.github/workflows/release.yml`；不含 tag、Release、资产或签名配置改动。
- ac-no-publish-side-effects: `release.yml` 中既有的 `gh release create` / `upload` / `edit` 调用保持原样、不新增任何发布调用，且本项不引入执行 `git tag` / `git push` 的脚本或 npm script；本项结束时远端的 tag、Release 与 11 个 v0.1.2 资产保持原状。

## 非目标

- 不打 tag、不 push、不 publish、不创建或公开 Release；不修改任何远端 Release 及其资产（含 v0.1.2 的 11 个资产）。这些动作由人与 Host 完成，会触发 human_required。
- 不删除、不移动、不重打 `v0.1.2`（以及 `v0.1.0` / `v0.1.1`）tag，不替换已发布资产，不改写任何历史提交。
- 不改发布模型与签名链路：`tags: v*` 触发、`gates → 矩阵 --publish never → finalize`、单点预建 draft、六项 Secret 与 fail-closed 逻辑、`electron-builder.yml` 的签名/公证/图标/protocol 配置全部不动；不新增 Secret。
- 不在本机执行 `codesign` / `stapler` / `spctl` 实证，不产出 `docs/release-evidence/`（归 release-hardening / local-evidence）。
- 不改 `appId` / `productName` / 版本之外的包元数据；不引入 changesets、semantic-release 等版本工具，不新增依赖。
- 不修历史：`v0.1.1` tag 内 `package.json#version` 实为 `0.1.0` 这个既存不一致**只作为已知事实避开**（不写全量「所有 v* tag 版本一致」断言、不回填、不改 tag），本项只对 `v0.1.2` 与当前版本断言。
- 不改对比算法、会话模型、UI、图标资产与协议声明；不做 CHANGELOG 全历史重写或英文版 Release Notes。
- 不把「CI 绿了」当签名/公证证据；不臆造任何产物 sha256、资产清单以外的发布事实。

## 实现约束

- 版本身份单一来源：`package.json#version` = `0.2.0`。文档里的字面版本由测试与 `package.json` 交叉比对，不允许在测试里硬编码 `0.2.0` 又不在 `package.json` 同步（`ac-pkg-version-020` 与 `ac-release-notes-version-single-source` 一起兜住）。
- 13 只作为**规划基线快照**记录，不硬编码为实时真值：本项开工时 `main` 已领先 23 个提交（Wave 1 四项已合入），文档措辞需体现「规划基线 13，实际以 tag 时 main 为准」；断言只校验「是祖先 + 领先数 > 0」，绝不写死 23 或 13 的等值比较。
- git 断言一律只读且不走 shell 拼接：测试用 `execFileSync('git', ['rev-list', ...])` / `['show', 'v0.1.2:package.json']` 形式；CI preflight 用 `git rev-list --count` 与 `git rev-parse`，禁止 `git tag` / `push` / `fetch` / `merge` / `rebase`。
- 浅克隆兼容：`gates` checkout 配 `fetch-depth: 0`；单元测试在 `.git` 或 `v0.1.2` 缺失时 skip（`it.skipIf` 或 `describe.skipIf`），保证无 git 的沙箱环境仍 `pnpm test` 全绿。
- 断言落点复用现有资产：扩展 `src/main/release-packaging.test.ts` 的既有 describe 组（`release version gate` / `release notes changelog` / `release signing credentials checklist` / `github release publishing`），不新建第二套测试文件；新增 UI/交互无关。
- 既有两条「v0.1.2 姿态」用例改写为 v0.2.0 口径时，保留 `not.toMatch(/发布状态：冻结/)` 之类防回退守卫，并保留 README / 签名文档中 `v0.1.2` 漂移段落（否则 `ac-drift-facts-*` 会失去落点）。
- `docs/release-notes/v0.2.0.md` 为纯 Markdown、零前端代码，作为人工创建 Release 时粘贴的来源文本；不引入自动生成脚本。
- 本项首次 `pnpm test` 时 `v0.1.2` 必须能在本地仓库解析；若开发者环境是 `--depth 1` 浅克隆，用例按 `ac-test-skips-without-git-metadata` 跳过并在测试名中说明原因，不吞掉真实漂移。
- 质量门保持 `.munk/code-gates.json` 现有六项（install / lint / typecheck / build / build:web / test）全绿。
