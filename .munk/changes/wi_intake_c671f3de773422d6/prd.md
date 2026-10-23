# OpenCompare v0.2.6 版本收敛与发布说明（Windows 绝对路径四入口修复）

## 范围

只做版本收敛与发布面文档对齐，承接已合入 `main` 的 Windows 绝对路径修复（合并提交 `0cc0914f3aebea9649d76be80fd3592a95bcdd87`，修复提交 `54029c8`；GitHub Actions `windows-latest` job run `39888946270` 对同一 sha 结论 `success`）。事实基线：四入口（CLI argv、second-instance 接管、手工输入、`opencompare://`）的 `C:\…`、盘根、UNC 输入不再被拼到 cwd/baseDir，`..` 不越过盘根 / 共享根，成功结果统一 `/`，`win32` 错误回显用 `\`。本项不改任何 `src` 业务代码。

1. `package.json#version`：`0.2.5` → `0.2.6`（唯一版本来源）。
2. `CHANGELOG.md`：顶部新增 `## v0.2.6`（位于 `## v0.2.5` 之前），版式沿用现有条目（概述段 + `### 修复` + `### 升级方式`），写清四入口与两条证据（merge sha + run id 对同一 sha 判 `success`）。
3. 新建 `docs/release-notes/v0.2.6.md`：面向用户的 GitHub Release Notes 源文本，首行标题含 `v0.2.6`；正文覆盖四入口行为、规范化口径、两条证据与升级方式。
4. `docs/release-signing.md`：状态行 / 「正式版发布姿态」标题 / 发布说明链接 / 承接句 / 补发默认 tag 对齐 `v0.2.6` 待发布口径；v0.2.5 已发布事实（公开 Release 链接、`docs/release-evidence/v0.2.5.md`、公开件复验归 product-qa）逐字保留。
5. `README.md`：只在首屏状态行、「版本与下载」表、发布流程默认 tag 三处做最小改动；`## 已知问题` 段不动。
6. `.github/workflows/release.yml`：仅 `workflow_dispatch.inputs.tag.default` 的静态值改为与 `package.json#version` 一致的 `v0.2.6`；步骤名、步骤顺序、`needs`、触发条件与发布模型全部不动。
7. `src/main/release-packaging.test.ts`：把「当前版本锚」与「最新已发布锚」解耦（见「实现约束」），不删除、不放宽任何既有发布门断言。

## 验收

- ac-version-bumped: `package.json#version` 严格等于 `0.2.6`。
- ac-changelog-v026: `CHANGELOG.md` 存在 `## v0.2.6`，其位置早于 `## v0.2.5`；该段切片含 `### 修复`、`### 升级方式`、`Windows`、`盘符`、`盘根`、`UNC`、`0cc0914f3aebea9649d76be80fd3592a95bcdd87`、`39888946270`、`success`；不含 `TODO` / `TBD` / `FIXME`。
- ac-release-notes-v026: `docs/release-notes/v0.2.6.md` 存在且非空，首个 `# ` 标题含 `v0.2.6`；正文同时含 `--left`、`单实例`、`手工输入`、`opencompare://`（四入口）、`盘符`、`盘根`、`UNC`、`C:/`、`//server/share`、`..`、`升级方式`；不含 `TODO` / `TBD` / `FIXME`，不含 64 位十六进制串（`[0-9a-f]{64}`）。
- ac-release-notes-evidence: 发布说明把 `0cc0914f3aebea9649d76be80fd3592a95bcdd87` 与 `39888946270` 写成同一条事实链——`windows-latest` job 在该 sha 上结论为 `success`；`success` 与两个证据标识出现在同一文档内，且不出现「待验证 / 预计通过 / 应该通过」之类未验证措辞。
- ac-signing-doc-pending: `docs/release-signing.md` 含 `当前状态：v0.2.6 待发布`、`正式版发布姿态（v0.2.6）`、`docs/release-notes/v0.2.6.md`、`tag 之后的修复由 v0.2.6 承接`、`默认 \`v0.2.6\``；同时仍含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5` 与 `docs/release-evidence/v0.2.5.md`（已发布事实不改写）；不含 `当前状态：v0.2.5`，不含 `v0.2.6 已发布`。
- ac-readme-status-pending: `README.md` 第 5 行含 `当前发布状态：v0.2.6 待发布`、`最新公开 Release 为 [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5)`、`docs/release-notes/v0.2.6.md`、`Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与 6 项 Secret 名；不含 `v0.2.6 已发布`、`当前发布状态：v0.2.5`、`v0.2.5 待发布`。
- ac-readme-table: 「版本与下载」表行顺序为 v0.2.6 → v0.2.5 → v0.2.4 → v0.2.3 → v0.2.2；v0.2.6 行含 `待发布` 与 `docs/release-notes/v0.2.6.md` 且不含任何 `releases/tag/` 链接；v0.2.5 行含 `已发布（最新公开 Release）` 与 `releases/tag/v0.2.5`；v0.2.4 行含 `已发布（上一版）` 与 `releases/tag/v0.2.4`；v0.2.3 行含 `未发布` 与 `内容并入 v0.2.4` 且无 Release 链接；v0.2.2 行含 `已发布` 与 `releases/tag/v0.2.2`；全表恰好一行含 `最新公开 Release`。
- ac-readme-flow-default: `README.md`「发布流程」段含 `默认 \`v0.2.6\``；该段其余门禁 / 打包 / finalize 表述与改动前逐字相同。
- ac-dispatch-default-derived: `.github/workflows/release.yml` 含 `default: 'v0.2.6'`；`git diff .github/workflows/release.yml` 仅该一行变化；`Preflight package version` 仍从 `node -p "require('./package.json').version"` 取版本，除 dispatch 默认值外文件内无 `0.2.6` 字面量。
- ac-test-anchors-decoupled: `src/main/release-packaging.test.ts` 满足全部下列各条：
  (a) `currentTag` 仍由 `package.json#version` 派生；不再存在 `latestPublishedTag` 等于 `currentTag` 的断言，改为断言二者不相等，且 `latestPublishedTag` 仍固定为 `v0.2.5`；
  (b) README 状态行与签名文档状态行的当前版本断言翻为 `待发布`（复用 `pendingWord`），负向断言改为不含 `${currentTag} 已发布`，并断言不含 `当前发布状态：v0.2.5` / `当前状态：v0.2.5`；
  (c) 版本表断言中「最新公开 Release」责任行由当前版本行移到 v0.2.5 行；当前版本行断言为「待发布 + 发布说明链接 + 无 Release 链接」；
  (d) README「已知问题」里两条 `已在 … 修复` 的归因改绑 `latestPublishedTag`（v0.2.5），README 该段文案零改动；
  (e) CHANGELOG 当前段切片边界改为 `## v0.2.6`..`## v0.2.5`，断言 Windows 四入口与两条证据；原 v0.2.5 段断言（`内存收敛`、`ECANCELED`、`不跟随符号链接`、`docs/perf/large-directory-memory.md`、`docs/symlink-no-follow.md`）迁到 `## v0.2.5`..`## v0.2.4` 切片并原样保留；
  (f) `lastReleasedNotesPath` 仍为 `docs/release-notes/v0.2.5.md`，其与 `releaseNotesPath` 的等值断言翻为不相等；原 v0.2.5 发布说明内容断言改读 `lastReleasedNotes`，v0.2.6 发布说明新增断言（标题含 `currentTag`、四入口、两条证据、无占位符、无 64 位十六进制串）；
  (g) 「幽灵版本无额外 heading」切片终点改为 `## v0.2.5`；CHANGELOG 排序断言插入 `## v0.2.5` 锚点；
  (h) `docs/release-evidence/${currentTag}.md` 断言改绑 `latestPublishedTag`（本项不创建 v0.2.6 证据文件）；
  (i) 不删除既有断言、不弱化为 `toBeTruthy()` 或宽松正则、不新增 `'0.2.6'` / `'v0.2.6'` 字面量（`currentTag` / `pkg.version` 派生之外）。
- ac-no-stale-current-binding: 仓库中不存在把「当前版本 / 当前 tag」绑到 0.2.5 的断言或文案——`src/main/release-packaging.test.ts`、`README.md`、`docs/release-signing.md`、`.github/workflows/release.yml` 中对「当前版本」的引用均为 `0.2.6` / `v0.2.6`；`v0.2.5` 只以已发布事实出现（Release 链接、evidence 路径、已知问题归因、CHANGELOG / 发布说明历史段、`latestPublishedTag` / `lastReleasedNotesPath` 锚点）。
- ac-published-facts-intact: `docs/release-notes/v0.2.5.md`、`docs/release-evidence/v0.2.5.md`、`src/main/release-evidence.test.ts` 的 `git diff` 为空；`README.md` 的 `## 已知问题` 段与 `CHANGELOG.md` 的 `## v0.2.5` 及更早各段与改动前逐字相同；不出现任何已公开资产的哈希改写。
- ac-no-src-business-change: 改动文件集合仅含 `package.json`、`CHANGELOG.md`、`README.md`、`docs/release-signing.md`、新增 `docs/release-notes/v0.2.6.md`、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`（以及 `.munk/**` 的记录）；不含其它 `src/**` 文件、`electron-builder.yml`、`pnpm-lock.yaml`、`build/**`。
- ac-no-release-side-effects: 不新建 `docs/release-evidence/v0.2.6.md`，不新增 workflow 文件；不创建 tag、不 push、不 publish、不创建 / 修改 Release；`release.yml` 的步骤数、步骤名与顺序、`--publish never`、祖先门、finalize 断言、6 项签名 Secrets 清单均与改动前相同。
- ac-gates-green: `.munk/code-gates.json` 的 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全部退出码 0；聚焦 gate `test-compare-request`（`pnpm test src/shared/compareRequest.test.ts`，覆盖已合入的 Windows 回归）同样退出码 0。

## 非目标

- 不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts` 的断言重定标）、`src/renderer/`、`src/preload/`、`src/shared/` 的任何业务逻辑；不改 `src/main/release-evidence.test.ts`。
- 不改 `release.yml` 的步骤顺序、触发条件、发布模型、fail-closed 配置、签名 Secrets 接线；不新增 workflow 或校验步骤。
- 不建 tag、不 push、不 publish、不创建 Release、不改已公开资产及其哈希；不写 Issue 回帖。
- 不重写 README 门面，不改 `## 已知问题` 段，不新增能力 / 已知问题条目，不做 i18n。
- 不改写 v0.2.5 已公开发布事实：README 中 v0.2.5 的 Release 链接与「最新公开 Release」身份、`docs/release-evidence/v0.2.5.md`、公开资产哈希、测试内 `latestPublishedTag = 'v0.2.5'`。
- 不新建 / 回填 `docs/release-evidence/v0.2.6.md`，不做发布执行脚本或凭据变更。
- 不改 `electron-builder.yml`、`build/`、品牌图标、依赖与锁文件；不做顺手重构、不产生纯格式化 diff。

## 实现约束

- 版本字面量只允许出现在 `package.json#version` 与文档标识（发布说明标题 / 文件名、CHANGELOG 标题）中；测试与 workflow 除 `workflow_dispatch` 的静态默认值外不新增 `0.2.6` 字面量，全部经 `currentTag` 派生并经测试交叉校验。
- 「待发布」口径沿用仓库既有先例（提交 `a6f9951`、`9aeb267`）：README 状态行保留原 emoji 与签名 / 公证整段说明文字，只替换状态子句、版本摘要与发布说明链接；`docs/release-signing.md` 状态行保留凭据录入与 fail-closed 整段表述。
- 测试锚点分两类，这是本项的核心解耦：「当前版本锚」（`currentTag` / `releaseNotesPath` / CHANGELOG 当前段 / README 当前行 / 表格当前行 / dispatch 默认值）随 `package.json#version` 走；「最新已发布锚」（`latestPublishedTag` / `lastReleasedNotesPath` = `docs/release-notes/v0.2.5.md` / 已知问题归因 / evidence 路径）固定为公开事实，不随 bump 漂移。因此把当前版本绑到 0.2.5 的断言必须消失，而 v0.2.5 已发布事实的断言必须保留。
- 发布说明只陈述代码事实与给定证据：merge sha `0cc0914f3aebea9649d76be80fd3592a95bcdd87`、`windows-latest` run `39888946270` 对同一 sha 结论 `success`；证据只写这两条，不贴日志全文、不编造其它数字、不宣称未做的实机点选验收。
- 术语与 `.munk/baseline/domains/compare-request/product.md` 及 `src/shared/compareRequest.ts` 一致：盘符、盘根、UNC、`..` 不越过盘根 / 共享根、规范输出 `/`、`win32` 回显 `\`、四入口为 argv / 单实例接管 / 手工输入 / `opencompare://`。
- CHANGELOG 升级方式沿用既有表述（`.dmg` / `.zip` / `OpenCompare-Setup-0.2.6.exe` / `.AppImage` / `.deb`，Developer ID 签名 + Apple 公证，凭据缺失 fail-closed）。
- 提交信息风格沿用 `chore(release): …`；不新增依赖，不改锁文件。
