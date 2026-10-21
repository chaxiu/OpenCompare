# v0.2.4 版本收敛与发布说明（承接 v0.2.3 未发布改动）

## 范围

把版本与文档口径从「v0.2.3 待发布（实际从未打 tag / 从未发布）」收敛到 v0.2.4，并补上「幽灵发布」防护。当前事实：`package.json#version=0.2.3`、存在 `docs/release-notes/v0.2.3.md`，但 v0.2.3 从未打 tag / 从未发布（GitHub 最新公开 Release 仍是 v0.2.2）。

本项改动面（只这些文件）：

1. `package.json#version` → `0.2.4`。
2. `CHANGELOG.md`：新增 `## v0.2.4` 段，写明「本版包含 v0.2.3 已合入但未发布的改动：悬空链接容错、摘要缓存改进」；**删除** `## v0.2.3` 段（不留空白条目、不留幽灵发布记录）；`## v0.2.2` 及更早段逐字不动。CHANGELOG 版本顺序变为 `v0.2.4` → `v0.2.2` → `v0.2.1` → `v0.2.0` → `v0.1.2`。
3. 新增 `docs/release-notes/v0.2.4.md`，删除 `docs/release-notes/v0.2.3.md`（内容并入 v0.2.4）；仓库文档中不再留指向 `docs/release-notes/v0.2.3.md` 或 `releases/tag/v0.2.3` 的链接。
4. `README.md`：第 5 行发布状态 blockquote 改为 v0.2.4 待发布口径并链到 `docs/release-notes/v0.2.4.md`；新增「版本与下载」表格（含 v0.2.4 / v0.2.3 / v0.2.2 三行，v0.2.3 行标「未发布，内容并入 v0.2.4」，最新公开 Release 仍指向 v0.2.2）；「发布流程」段 `workflow_dispatch` 默认 tag 改 `v0.2.4`；「已知问题」段两条历史条目保留。
5. `docs/release-signing.md`：状态行、正式版发布姿态标题、发布说明链接、v0.1.2 承接句、第五节补发默认 tag 五处同步到 v0.2.4。
6. `.github/workflows/release.yml`：`workflow_dispatch.inputs.tag.default` → `'v0.2.4'`；在 finalize job 公开收尾之后**追加一个只读校验步骤**，断言该 tag 的公开 Release 是最新 Release（防止「tag 存在但 Release 缺失」/「最新 Release 落后」）。
7. `src/main/release-packaging.test.ts`：既有版本断言全部继续从 `package.json#version` 派生；新增幽灵发布 / 死链 / 最新 Release 门 / 假证据文件四类断言。

## 验收

版本与 CHANGELOG：

- ac-pkg-version: `package.json#version` 严格等于 `0.2.4`，且仍匹配 `^\d+\.\d+\.\d+$`。
- ac-changelog-v024: `CHANGELOG.md` 存在 `## v0.2.4` 标题，且位于 `## v0.2.2` 之前；该段（`## v0.2.4` 到 `## v0.2.2` 之间）同时包含 `v0.2.3 已合入但未发布`、`悬空链接容错`、`摘要缓存改进` 三个片段，并含升级方式一段。
- ac-changelog-no-ghost-v023: `CHANGELOG.md` 中不存在以 `## v0.2.3` 开头的标题行；`## v0.2.4` 与 `## v0.2.2` 之间没有其它版本标题（即不存在伪造的 v0.2.3 发布记录）。
- ac-changelog-v022-intact: `CHANGELOG.md` 的 `## v0.2.2` 段（到 `## v0.2.1`）仍含 `8 路`、`有界并发`、`EMFILE`、`ENFILE` 与 `https://github.com/chaxiu/OpenCompare/issues/2`（历史内容不被改写）。

发布说明：

- ac-notes-v024-exists: `docs/release-notes/v0.2.4.md` 存在且非空，首个 `# ` 标题含 `v0.2.4`，其解析出的版本号等于 `package.json#version`；不含 `TODO` / `TBD` / `FIXME`。
- ac-notes-v024-carries-v023: 该文件明确写出「本版包含 v0.2.3 已合入但未发布的改动：悬空链接容错、摘要缓存改进」同义句，且正文同时含 `悬空链接容错`、`摘要缓存改进`、`已跳过 N 个不可读项/悬空链接`、`134 万`、`10.67 GiB`（v0.2.3 用户可见内容并入本版，用户能对上号）。
- ac-notes-v024-fixes: 「本次修复」部分分条写清 6 项，每项含可断言的实现事实片段：(a) `SHA-256` + `主进程` + 不再逐文件拉全文（流式字节哈希）；(b) `批量` / `分页` 目录扫描 + `有界并发`；(c) 扫描 / 哈希 `进度` + `可取消`；(d) 目录结果树 `窗口化`（虚拟滚动）+ `150 万` 行尾部可达；(e) 主入口「新建对比」弹窗不再遮挡进度条与取消按钮；(f) 相位计数：`扫描目录` 段报已扫描、`校验内容` 段报已校验，各段 `单调`、切换不归零倒退。
- ac-notes-v024-known-issues: 该文件存在「已知问题」段，且三条逐条标「已知未修」并写明影响：① 同进程连续多轮大目录对比内存增长（含 `849` → `1,510 MB`，且写明未 OOM）；② 取消时主进程 stderr 出现 `ECANCELED` 日志噪声（写明不影响取消结果）；③ 符号链接计数放大。这三条不得出现在「本次修复」条目中，也不得写成已修复或删除。
- ac-notes-v023-removed: `docs/release-notes/v0.2.3.md` 文件不存在；`README.md`、`CHANGELOG.md`、`docs/**/*.md` 中任何文件都不出现字符串 `docs/release-notes/v0.2.3.md`，也不出现 `releases/tag/v0.2.3`。

README：

- ac-readme-status-v024: `README.md` 第 5 行 blockquote 同时含 `当前发布状态：v0.2.4 待发布`、`最新公开 Release 为 [v0.2.2]`、`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2`、`docs/release-notes/v0.2.4.md`；不含 `v0.2.4 已发布`、不含 `docs/release-notes/v0.2.3.md`。
- ac-readme-signing-text-kept: 第 5 行仍含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与 6 个 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`），说明文字不被顺手改写。
- ac-readme-version-table: `README.md` 含「版本与下载」表格，至少含 v0.2.4 / v0.2.3 / v0.2.2 三行；v0.2.4 行标待发布并链 `docs/release-notes/v0.2.4.md`；v0.2.3 行同时含 `未发布` 与 `内容并入 v0.2.4`，且该行不含 `releases/tag/v0.2.3`；v0.2.2 行链 `releases/tag/v0.2.2`；表格之外无「最新公开 Release」改为 v0.2.3/v0.2.4 的表述。
- ac-readme-links-exist: `README.md` 中所有 `releases/tag/<v>` 链接的版本 ∈ {`v0.2.0`, `v0.2.1`, `v0.2.2`} ∪ {`v0.2.4`}（即不指向不存在的 tag）。
- ac-readme-dispatch-default: `README.md`「发布流程」段含 `` 默认 `v0.2.4` ``，与 workflow 默认值一致。
- ac-readme-known-issues-kept: `README.md`「已知问题」段仍保留 `v0.2.2 及更早` 悬空链接条目（含 `已跳过`）与 `v0.2.1 及更早` EMFILE 条目（含 `8 路`、`有界并发`、`文件句柄耗尽`），两条不被覆盖或删除。

签名文档与工作流：

- ac-signing-doc-v024: `docs/release-signing.md` 含 `当前状态：v0.2.4 待发布`、`正式版发布姿态（v0.2.4）`、`docs/release-notes/v0.2.4.md`、`tag 之后的修复由 v0.2.4 承接`、`` 默认 `v0.2.4` ``；全文不出现 `v0.2.3` / `docs/release-notes/v0.2.3.md`；6 项 Secret 表、v0.1.2 漂移记录、补发用法与「打包后硬校验」段落仍在。
- ac-workflow-dispatch-default: `release.yml` 的 `workflow_dispatch.inputs.tag.default` 字符串等于 `` `v${package.json#version}` ``（即 `v0.2.4`），且全文不出现 `v0.2.3`。
- ac-workflow-latest-release-gate: `finalize` job 中在既有步骤 `Assert the public release has every platform asset` **之后**新增且仅新增一个只读步骤（例如 `name: Assert the tag is the latest published release`），其 `run` 含 `gh release list --limit 1 --json tagName`、把取到的 tagName 与 `${RELEASE_TAG}` 相等比较、失败时输出 `::error::` 并 `exit 1`（空值同样失败）；该步骤不写任何远端状态。
- ac-workflow-order-and-model-intact: `release.yml` 既有步骤名与顺序不变（`Make the tag's release public` → `Verify the tag has exactly one public release` → `Assert the public release has every platform asset` → 新步骤），`push: tags: ['v*']`、`gates → release 矩阵 --publish never → finalize`、单点预建 draft、`refs/tags/${{ env.RELEASE_TAG }}`（仍恰好 2 处）、6 项 Secrets fail-closed、既有唯一公开 Release 与资产断言全部原样；全文无 `continue-on-error` / `|| true`。

测试：

- ac-test-derived-no-current-literal: `src/main/release-packaging.test.ts` 中不出现 `0.2.4` / `v0.2.4` 字面量；`currentVersion` / `currentTag` 仍由 `package.json#version` 派生，版本相关断言（release notes 路径、CHANGELOG 标题、dispatch 默认值、README 状态行、signing 文档）全部经 `currentTag` 互校。
- ac-test-no-ghost-notes: 新增断言：`docs/release-notes/v0.2.3.md` 不存在，且 `README.md` / `CHANGELOG.md` / `docs/**/*.md` 任一文档不含 `docs/release-notes/v0.2.3.md` 与 `releases/tag/v0.2.3`（幽灵版本串用运行时拼接构造，测试源码内不出现完整 `v0.2.3` 字面量）。
- ac-test-link-allowlist: 新增断言：扫描 `README.md`、`CHANGELOG.md`、`docs/**/*.md` 中所有 `releases/tag/<v>` 链接，其版本必须 ∈ {`v0.2.0`, `v0.2.1`, `v0.2.2`（已发布）} ∪ {`currentTag`}，否则失败。
- ac-test-current-notes-known-issues: 新增断言：当前版本 release notes（`docs/release-notes/${currentTag}.md`）存在，且含「已知问题」段与 `已知未修`。
- ac-test-no-ghost-evidence: 新增断言：`docs/release-evidence/v0.2.3.md` 不存在（不出现幽灵版本的假证据文件）。
- ac-test-latest-release-gate: 新增断言：`release.yml` 含 `gh release list --limit 1 --json tagName` 的只读步骤，位置在下标上晚于 `Assert the public release has every platform asset`，且该步骤脚本含 `::error::` 与 `exit 1`。
- ac-test-retarget-keeps-intent: 既有断言按原位重定标且强度不降：`lastReleasedNotesPath` 仍指向 `docs/release-notes/v0.2.2.md`（上一公开版本锚点）；README / signingDoc 状态断言经 `currentTag` 派生并断言「待发布」与「不含已发布」；CHANGELOG 当前段切片固定为 `` ## ${currentTag} `` .. `## v0.2.2` 并覆盖本版合并声明关键词；当前发布说明的悬空链接关键词断言继续由 `docs/release-notes/${currentTag}.md` 承载；`## v0.2.1` 首发替代段与 v0.2.0 / v0.1.2 历史段切片与断言不动；不删除既有断言、不放宽为 `toBeTruthy()` 或宽松正则。

门禁与边界：

- ac-gates-green: `.munk/code-gates.json` 的 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全部退出码 0。
- ac-no-release-side-effects: 本项不建 tag、不 push、不 publish、不创建或公开 Release；不新增 `docs/release-evidence/v0.2.4.md`；不新增发布脚本或凭据。
- ac-scope-files-only: `git diff --stat` 仅涉及 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、`docs/release-notes/v0.2.4.md`（新增）、`docs/release-notes/v0.2.3.md`（删除）、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`；`src/` 业务代码（`src/core/**`、`src/main/**` 除该测试文件、`src/renderer/**`、`src/preload/**`、`src/shared/**`）、`src/main/release-evidence.test.ts`、`docs/release-evidence/**`、`docs/release-notes/v0.2.{0,1,2}.md`、`electron-builder.yml`、`build/**`、依赖与锁文件均无改动。

## 非目标

- 不改 `src` 业务代码：相位计数实现与它的测试属于在飞工作项 `wi_intake_f1695c0476174245`，本项不碰实现、不补测试、不调并发默认值（保持 8 路）、不做性能优化或顺手重构。
- 不动 `@core` / renderer 行为与四态语义（same / added / removed / modified / conflict）。
- 不改打包配置（`electron-builder.yml`、`build/**`、entitlements）、签名身份（`Tao Zhu (3X4J53U6RY)`）、发布通道模型（tag → 单点预建唯一 Release → 矩阵 `--publish never` → finalize 公开）、依赖与锁文件。
- 不建 tag、不 push、不 publish、不创建 / 编辑 / 公开 / 上传任何 Release 及其资产；不删除、不移动、不重打任何历史 tag（`v0.1.0` / `v0.1.1` / `v0.1.2` / `v0.2.0` / `v0.2.1` / `v0.2.2`）。
- 不写 `docs/release-evidence/v0.2.4.md`（v0.2.4 取证由后续发版项产出），不改写 `docs/release-evidence/v0.2.{1,2}.md` 与 `src/main/release-evidence.test.ts`。
- 不跑实机验收 / self-test / 安装包安装；不重跑 CI；不做多平台交叉编译。
- 不重写 README 全文、不新增文档体系、不改 `AGENTS.md`、不写英文版发布说明、不引入 changesets / semantic-release 等版本工具。

## 实现约束

- 版本身份单一来源：`package.json#version` = `0.2.4`；文档字面版本由测试与 `package.json` 交叉核对；当前版本在测试源码中一律经 `currentTag` 派生，不新增 `0.2.4` / `v0.2.4` 字面量；幽灵版本（v0.2.3）负向断言用运行时拼接（如 `['v0.2', '3'].join('.')`）构造，避免断言自匹配。
- 文档扫描范围固定为 `README.md`、`CHANGELOG.md`、`docs/**/*.md`；`.munk/**` 下的历史 Host 记录不在扫描范围。
- 发布状态口径唯一落点是 `README.md` 第 5 行单段 blockquote：只替换版本 / 待发布 / 说明链接，签名、公证、6 项 Secret、fail-closed 文字逐字保留（先例 `a6f9951` / `d483ba2`）。
- 「版本与下载」表格为本项新增的最小结构：三行（v0.2.4 待发布、v0.2.3 未发布且内容并入 v0.2.4、v0.2.2 已发布），不扩成完整历史下载清单，不引入其它版本行或外链。
- `docs/release-signing.md` 只改五处：第 5 行状态、第三节姿态标题、发布说明链接、第四节/第六节之外的 v0.1.2 承接句、第五节补发默认 tag；表格与漂移事实、硬校验段落逐字保留。
- `release.yml` 追加的只读步骤放在 `finalize` job 末尾（既有资产校验步骤之后），只读 `gh release list`，不写远端状态；命令按裁定原样使用 `gh release list --limit 1 --json tagName`（不追加 `--exclude-drafts` / `--exclude-pre-releases`），输出用 `jq -r '.[0].tagName // empty'` 一类方式解析；沿用仓库既有 `gh api ... | jq` 风格，避免 `--slurp` 与 `--jq` 同用。
- 文案必须与已合入 `main` 的实现一致：不宣称代码未实现的机制（如「零拷贝」），进度 / 相位术语与工作台文案对齐（扫描目录 / 校验内容），符号链接计数按实测事实陈述为已知未修。
- 已知问题段与「本次修复」段物理分离，避免读者把未修项当已修；三条已知问题必须写明影响面。
- 提交信息沿用 `chore(release): …`；提交前本地跑 `pnpm lint && pnpm typecheck && pnpm test` 自检；门禁仍走既有 `.munk/code-gates.json`，不新增 gate 或脚本。
