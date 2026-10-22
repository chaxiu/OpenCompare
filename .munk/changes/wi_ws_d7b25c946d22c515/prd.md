# v0.2.5 已发布状态翻转与锚点前移

## 范围

前序 WI 已把 `docs/release-evidence/v0.2.5.md` 置为 `status: verified`（11 件资产 sha256 / 唯一 Release / latest*.yml 全命中 / dmg+zip 签名公证原文齐备），但仓库文档仍是「v0.2.5 待发布」，与证据文件口径分叉。本项只做这一处收口：把仓库翻到**已发布态**，并把测试里「最新已发布版本」锚点前移。

具体改动面（仅这三份文件）：

1. `README.md`
   - 首屏第 5 行改为 `当前发布状态：v0.2.5 已发布；最新公开 Release 为 [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5)`；该行其余内容（三处修复摘要、`docs/release-notes/v0.2.5.md` 链接、Developer ID 签名 + Apple 公证、6 项 Secret、fail-closed、App Store Connect API Key、发布凭据清单链接）逐字保留。
   - 「版本与下载」表：v0.2.5 行状态改 `已发布（最新公开 Release）` 并补 `releases/tag/v0.2.5` 链接；v0.2.4 行状态改 `已发布（上一版）`（保留原 `releases/tag/v0.2.4` 链接与说明）；v0.2.2 行状态去掉「（上一版）」仅留 `已发布`；v0.2.3 行保持 `未发布，内容并入 v0.2.4` 不变；四行顺序不变。
2. `docs/release-signing.md`
   - 首屏 `当前状态：v0.2.5 待发布` → `当前状态：v0.2.5 已发布`，并指向发布证据文件与 Release；凭据录入、fail-closed、补发入口等事实句保留。
   - 第三节标题仍为 `正式版发布姿态（v0.2.5）`，正文写明 v0.2.5 已发布、公开 Release 与 `docs/release-evidence/v0.2.5.md`，并写明公开件安装复验归 product-qa（证据文件第 6 节仍为就绪条件）。
   - 第五节补发段落改为「`v0.2.5` 已发布；如需补发，`workflow_dispatch` 默认 tag 仍为 `v0.2.5`」；一~六节其余原文（6 项 Secret 表、`v0.1.2` 漂移记录、祖先门语义、打包后硬校验）不变。`release.yml` 的 `default: 'v0.2.5'` 已正确，**不改 workflow**。
3. `src/main/release-packaging.test.ts`
   - 锚点常量：`latestPublishedTag = 'v0.2.5'`；`lastReleasedNotesPath` 指向 `docs/release-notes/v0.2.5.md`；`publishedTags` 补入 `v0.2.4`（否则「文档只允许链接已发布 tag」用例会因 README 的 v0.2.4 链接转红）；「未发布版本内容并入」的目标版本用独立常量固定为 `v0.2.4`，不得由 `latestPublishedTag` 派生。
   - 成组翻转 pending 断言：首屏状态行、版本表当前行、signing 文档状态、`release version gate` 里的 README 断言全部改为 `已发布`；原来 `not.toContain('${currentTag} 已发布')`、`not.toContain('当前发布状态：${latestPublishedTag}')`、`currentRow.not.toContain('releases/tag/${currentTag}')` 三条负向断言随状态翻转反向；补上「README 与 signing 文档不含待发布字样」「新版 v0.2.4 行含 `已发布（上一版）`」「v0.2.2 行含 `已发布` 且不含 `上一版`」。
   - v0.2.2 发布说明覆盖块的内容断言必须保留，改为显式历史路径常量（`docs/release-notes/v0.2.2.md`），不得因 `lastReleasedNotesPath` 前移而删除或改写其关键字列表；v0.2.4、v0.2.0 历史块与其余历史断言原样保留。

## 验收

- ac-readme-status-published: README 第 5 行含 `当前发布状态：v0.2.5 已发布` 与 `最新公开 Release 为 [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5)`，且不含 `待发布`；`docs/release-notes/v0.2.5.md`、6 项 Secret 名、`fail-closed`、`App Store Connect API Key`、`Developer ID 签名 + Apple 公证` 仍在第 5 行。
- ac-readme-version-table: 版本表 v0.2.5 行为 `| [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5) | 已发布（最新公开 Release） |`，v0.2.4 行为 `已发布（上一版）` 且含 `releases/tag/v0.2.4`，v0.2.2 行含 `已发布` 且不含 `上一版`，v0.2.3 行仍为 `未发布，内容并入 v0.2.4`。
- ac-signing-status-published: `docs/release-signing.md` 含 `当前状态：v0.2.5 已发布`、`正式版发布姿态（v0.2.5）`、`docs/release-evidence/v0.2.5.md`，第五节补发句仍写默认 tag `v0.2.5`，全文不含 `待发布`。
- ac-signing-history-intact: signing 文档仍含 `v0.1.2` 漂移事实（`c4a6a95`、`7ea2cc6`、`annotated`、`祖先`、`13 个提交`、`公开`、`非预发布`、`11 个资产`）与 6 项 Secret 清单、`发布冻结` 不出现。
- ac-latest-published-anchor: `release-packaging.test.ts` 中 `latestPublishedTag` 为 `v0.2.5`，`lastReleasedNotesPath` 为 `docs/release-notes/v0.2.5.md`，`publishedTags` 至少含 `v0.2.0`、`v0.2.1`、`v0.2.2`、`v0.2.4`、`v0.2.5`。
- ac-no-pending-assertions: 测试中不再存在要求 README / signing 文档 / 版本表出现待发布字样的正向断言；改为 `pnpm test` 在文档已翻为 `已发布` 时通过、若把 README 或 signing 改回 `待发布` 则 `release-packaging` 用例转红。
- ac-ghost-row-fixed-to-v024: 未发布版本（v0.2.3）行断言仍要求 `内容并入 v0.2.4`，与 `latestPublishedTag` 无关。
- ac-v022-notes-still-covered: 仍有用例读取 `docs/release-notes/v0.2.2.md` 并断言 `EMFILE`、`ENFILE`、`8 路`、`有界并发`、`文件句柄耗尽`，该文件内容未改。
- ac-history-verbatim: `docs/release-notes/v0.2.4.md` 及更早 notes、`docs/release-evidence/v0.2.4.md`、`docs/release-evidence/v0.2.5.md` 全部六节（含第 1 节发布前快照与第 6 节 product-qa 就绪条件）、资产 sha256 相对改动前提交逐字未变；`CHANGELOG.md`、`package.json`、`.github/workflows/release.yml` 未被修改。
- ac-evidence-qa-readiness: `docs/release-evidence/v0.2.5.md` 第 6 节仍以「由 product-qa 在公开件上复验并回填」列就绪条件，全文不出现 `product-qa 已通过` 一类已验收表述。
- ac-only-scoped-files-changed: `git diff --name-only` 只含 `README.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`。
- ac-tests-green: `pnpm test` 全绿（含 `src/main/release-packaging.test.ts`），测试条数不减少，且未通过删除/注释断言换取绿色。

## 非目标

- 不打 tag、不 push、不触发 `workflow_dispatch`、不重跑发布场、不上传/替换/删除任何 Release 资产；不改写 v0.2.5 已公开资产与 sha256。
- 不改 `package.json` 版本、`CHANGELOG.md`、`docs/release-notes/*` 任何内容、`electron-builder.yml`、`.github/workflows/release.yml`（默认 tag 已是 `v0.2.5`）。
- 不编辑 `docs/release-evidence/v0.2.5.md`（包括第 1 节发布前快照和第 6 节交接区），也不在其中写 product-qa 复验结论。
- 不动 `src/main/` 运行时源码、渲染层、`PlatformPort`、对比/哈希/快照逻辑，不改 `code_gates` 门禁清单。
- 不引入 electron-updater 或自动更新；不做 README 其它段落、其它文档的顺手润色；不新建发布流程或状态机。
- 不把「已发布」扩写成新的发布公告/落地页，不新增 release notes 章节。

## 实现约束

- 只允许编辑 `README.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`；任何其它文件出现在 diff 都视为越界。
- `pendingWord` 仍由 `['待', '发布'].join('')` 拼出，只用于负向断言，避免测试源文本自匹配；`已发布` 可直接写字面量（测试源里已存在）。
- `latestPublishedTag` 与 `lastReleasedNotesPath` 各自保持单点定义；v0.2.3 内容并入的目标版本用独立常量钉死 `v0.2.4`，防止下次版本收敛时被一起带偏。
- v0.2.2 的发布说明覆盖块改为显式历史路径常量，关键字列表逐字保留；不得因为 `lastReleasedNotesPath` 前移而把该块改读 v0.2.5。
- README 表格与首屏行只改状态字与链接，说明文字尽量原样；v0.2.5 行说明保留「多轮内存收敛、取消零日志噪声、符号链接「不跟随」计数口径」。
- 证据文件是已归档的实测快照，第 1 节明确标注「发布前核对」并说明状态翻转归后继 WI；本次不回头改它，也不在测试里断言其第 1 节为已发布态。
