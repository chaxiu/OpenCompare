# v0.2.8 版本收敛与发布面翻面

## 范围

把 `main` 收口成一次可从 `v0.2.8` 发布的**版本收敛提交**，只动版本号、发布前置文件，以及随之必须翻面的发布事实断言（同一提交内完成）。

改动面（7 个文件，不多不少）：

1. `src/main/release-packaging.test.ts`：翻面随版本收敛漂移的派生断言，并把 v0.2.7 相关断言降级为显式历史块（详见实现约束）。
2. `package.json`：`version` → `0.2.8`（版本号唯一来源）。
3. `.github/workflows/release.yml`：`workflow_dispatch.inputs.tag.default` → `'v0.2.8'`。
4. `docs/release-process.md`：`workflow_dispatch` 段落的 `default: 'v0.2.8'`（仅该默认值）。
5. `docs/release-signing.md`：仅第五节补发默认值为 `默认 \`v0.2.8\``。
6. `CHANGELOG.md`：在 `## v0.2.7` 之上新增 `## v0.2.8` 段（`### 新增` / `### 改进` / `### 升级方式`）。
7. `docs/release-notes/v0.2.8.md`：新建当前发布说明。

发布事实锚点分工（收敛态）：

- `latestPublishedTag` / README 第 5 行 / 发布证据路径 → 仍为 `v0.2.7`（已公开事实，不前移）。
- `currentTag`（= `v${pkg.version}`）/ `releaseNotesPath` / CHANGELOG 当前段 / 两份文档的 dispatch 默认值 → `v0.2.8`。
- 两者必须**不相等**，且各自单点定义、互不派生。

内容范围：CHANGELOG 与发布说明只写真正进 tag 的两项用户可见改动——
(a) 目录对比结果导出为自包含单文件 HTML 报告；(b) 对外品牌与入口更名为 Open Rebuilds（`https://github.com/munk-sh/open-rebuilds`）。

## 验收

- ac-version-bumped: `package.json#version === '0.2.8'`，且测试内 `currentTag === 'v0.2.8'`。
- ac-latest-published-pinned: `latestPublishedTag` 仍为字面量 `'v0.2.7'`；`publishedTags` 仍含 `v0.2.7` 且 `previousPublishedTag === 'v0.2.6'`；`release-packaging.test` 中断言 `expect(latestPublishedTag).not.toBe(currentTag)` 且 `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`。
- ac-notes-paths-diverge: `lastReleasedNotesPath`（`docs/release-notes/v0.2.7.md`）与 `releaseNotesPath`（`docs/release-notes/v0.2.8.md`）不相等；`firstHeading(lastReleasedNotes)` 含 `v0.2.7`、`firstHeading(releaseNotes)` 含 `v0.2.8`。
- ac-changelog-order: `CHANGELOG.md` 中 `## v0.2.8` 索引 < `## v0.2.7` < `## v0.2.6` < `## v0.2.5` < `## v0.2.4` < `## v0.2.2` < `## v0.2.0` < `## v0.1.2`；断言改为「`currentTag` 在 `latestPublishedTag` 之前」，而非相等。
- ac-changelog-v028-section: `## v0.2.8` 段（切片至 `## v0.2.7`）含 `### 新增` / `### 改进` / `### 升级方式`、`HTML`、`自包含`、`隐藏本机路径`、`200,000`、`10 MB`、`Open Rebuilds`、`https://github.com/munk-sh/open-rebuilds`、`v0.2.7`，且不含 `TODO` / `TBD` / `FIXME`、不含 64 位十六进制串。
- ac-changelog-slice: 从 `## ${currentTag}` 到 `## ${previousPublishedTag}` 的切片中，`^## ` 标题集合恰为 `['v0.2.8', 'v0.2.7']`；`v0.2.3` 幽灵版本标题仍不存在。
- ac-v027-changelog-history: `## v0.2.7` 段（切片至 `## v0.2.6`）保留原双语 / 9 节 README 断言全集（`双语`、`系统语言`、`zh`、`设置`、`持久化`、`即时生效`、`无需重启`、`README`、`9 节`、`docs/`、`已知问题`），且不含占位符与 64 位十六进制串。
- ac-v027-notes-history: `release-packaging.test` 新增显式历史块读取 `docs/release-notes/v0.2.7.md`，保留原断言（`双语`、`系统语言`、`设置`、`持久化`、`即时生效`、`无需重启`、`README`、`9 节`、`升级方式`、`v0.2.7`），并保留 `待验证` / `预计通过` / `应该通过` / 占位符 / 64 位十六进制串的负断言。
- ac-v028-notes-content: `docs/release-notes/v0.2.8.md` 首标题含 `v0.2.8`（且其版本号与 `pkg.version` 相等）；正文含 `HTML`、`自包含`、`内联 CSS`、无 JS / 无外链与 http(s) 资源、`file://`、`隐藏本机路径`、`200,000`、`10 MB`、四态计数、`<html lang>`、`Open Rebuilds`、`https://github.com/munk-sh/open-rebuilds`、`升级方式`、`v0.2.7`；不含 `TODO` / `TBD` / `FIXME`、`待验证` / `预计通过` / `应该通过`、64 位十六进制串。
- ac-notes-no-benchmark-numbers: 当前发布说明与当前 CHANGELOG 段不出现 `GiB` / `MiB` / `GB` 数字；`MB` 仅允许出现文档化的 `10 MB` 上限（其余 `MB` 数字一律不出现）。
- ac-cfbundle-pinned: v0.2.7 发布证据块断言改为字面量 `CFBundleShortVersionString=0.2.7`（不随 bump 漂移）；`docs/release-evidence/v0.2.7.md` 内容零改动。
- ac-workflow-default: `.github/workflows/release.yml` 中 `workflow_dispatch` 的 `default: 'v0.2.8'`，且不再出现 `default: 'v0.2.7'`。
- ac-process-default: `docs/release-process.md` 含 `default: 'v0.2.8'`，且不再出现 `default: 'v0.2.7'`。
- ac-signing-section5-only: `docs/release-signing.md` 含 `默认 \`v0.2.8\`` 且不含 `默认 \`v0.2.7\``；同时仍逐字保留第 5 行 `当前状态：v0.2.7 已发布`、第三节标题 `正式版发布姿态（v0.2.7）`、`docs/release-notes/v0.2.7.md`、`docs/release-evidence/v0.2.7.md`、第四节 `tag 之后的修复由 v0.2.7 承接`；该文件 diff 仅第五节默认值一行。
- ac-readme-untouched: `README.md` 与 `README.zh-CN.md` 对该提交零 diff；第 5 行仍为 `最新公开版本：[v0.2.7]` / `Latest public release: [v0.2.7]`，两版全文均不含 `v0.2.8`。
- ac-assertion-strength-kept: 除上列翻面项外，`release-packaging.test` 其余断言保持原强度（README 第 5 行、签名文档已发布事实、11 件发布资产、祖先门、发布模型、双语 README 镜像、`links only published tags or the current tag`）；不得删除断言或用 `toBeTruthy()` 等宽松断言替换。
- ac-diff-scope: `git diff --name-only` 恰为 `package.json`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-signing.md`、`CHANGELOG.md`、`docs/release-notes/v0.2.8.md`、`src/main/release-packaging.test.ts` 七项。
- ac-gates-all-green: 在交付的同一 commit 上，`.munk/code-gates.json` 九项（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部退出码 0。
- ac-delivery-note: 交付说明写明被测 commit 完整 SHA、各门退出码、`pnpm test` 汇总（文件数 / 用例数），以及「`latestPublishedTag=v0.2.7` 落后 `currentTag=v0.2.8`」断言所在文件与行号。

## 非目标

- 不打 tag、不 push tag、不 `workflow_dispatch`、不构建或上传安装包、不改已公开 tag 与 Release 资产。
- 不改两版 README（含第 5 行、第 3 行互链、9 节镜像、徽章、截图引用）；本次是版本收敛，不是发布收尾。
- 不改产品代码、对比语义、快照格式、IPC、发布模型、签名接线；不修任何功能缺陷。
- 不改 `docs/release-signing.md` 除第五节默认值之外的任何文字；不改 `docs/release-evidence/**`、`docs/release-notes/v0.2.7.md` 及更早发布文档、`docs/perf/**` 既有数字与结论。
- 不新建 `docs/release-evidence/v0.2.8.md`（无发布事实可写）。
- 不新增发布脚本、依赖或工作流步骤；不复制 v0.2.7 的双语 / 9 节 README 条目到 v0.2.8 段，不提前写下一版。
- 不跑 perf 长跑与 `.munk/code-gates.perf.json`（未触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径）。
- 不做浏览器点选、真机或桌面自动化验证。

## 实现约束

- **顺序不可调换且同提交**：先翻面 `release-packaging.test.ts` 的派生断言，再 bump `package.json#version` 并同步文档；断言翻面与 bump 必须是同一个 commit，禁止拆两次提交（拆开会留下测试全红的中间态），也禁止先改 README 第 5 行。
- **锚点解耦**：`latestPublishedTag`（`v0.2.7`）、`previousPublishedTag`（`v0.2.6`）、`publishedTags` 全部保持显式字面量；只翻面「相等 / 先后」关系断言。`docs/release-signing.md` 第四节「`tag 之后的修复由 v0.2.7 承接`」属历史事实，不动。
- **历史证据不随 bump 漂移**：v0.2.7 证据块中的 `CFBundleShortVersionString` 改成字面量 `0.2.7`，不要继续用 `${pkg.version}`。
- **数字口径**：新增文档允许写产品常量上限 `200,000` 行与 `10 MB`（对应 `src/core/directory/report.ts` 的 `DIRECTORY_REPORT_MAX_ROWS = 200_000`、`DIRECTORY_REPORT_MAX_BYTES = 10_000_000`）；对应负断言重定标为「禁 `GiB` / `MiB` / `GB`，`MB` 只允许 `10 MB`」，仍须挡住 Benchmark 级别数字。
- **内容事实边界**：只写两项用户可见改动。Open Rebuilds 更名只写对外品牌与 README 入口链接；安装包品牌、`appId`（`com.opencompare.app`）、`productName`、快照格式与发布通道不变，不得写成安装包改名。升级方式必须写明从 `v0.2.7` 升级，并保持「签名 / 公证口径不变、凭据缺失 fail-closed」。
- **文档风格**：沿用现有 `docs/release-notes/*.md` 结构（H1 `# OpenCompare v0.2.8 发布说明`、`## 本次变化`、`## 升级方式`）；CHANGELOG 段与发布说明同事实、同口径；不写实现流水账、不写仓库外绝对路径与凭据。
- **范围守门**：若发现需要改产品代码才能让门禁变绿，停下来升级而不是扩大范围；若发现另有随发布事实翻面的断言未列入本 prd，按「保持强度、锚点解耦」原则一并翻面，并在交付说明中逐条列出。
