# v0.2.24 版本锚点与发布文档收敛

本项是 `cp-release-024` 的最后一个写项，只做**版本与文档锚点**：把 `package.json#version`、两处默认 tag、`CHANGELOG` 顶段、中英双语发布说明、四张 README 截图 provenance 与视觉基线事实同批推进到 `v0.2.24`，并让既有发布文档门禁与全量 `pnpm test` 保持全绿。产品行为、`src/**` 源码、发布通道与已公开资产一律不动。

## 范围

1. 版本单一来源：`package.json#version` → `0.2.24`；`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 与 `docs/release-process.md` 的 `default: 'v…'` 代码片段同批推进到 `v0.2.24`。
2. `CHANGELOG.md` 新增 `## v0.2.24` 顶段（置于 `## v0.2.23` 之前），按既有 `改进 / 修复 / 不做的事 / 升级方式` 结构，覆盖三项用户可见修复与两项覆盖率治理，并保留既有事实 token。
3. 新增 `docs/release-notes/v0.2.24.md` 与 `docs/release-notes/v0.2.24.zh-CN.md`：固定 6 个 H2 对位、第三行语言切换、各仅 1 个 Markdown 链接、既有事实 token 与 Windows 免安装包小节。
4. 四张 README 截图（`docs/assets/opencompare-{workbench,file-diff}.{en,zh}.png`）用最终 renderer 构建重采，`docs/screenshots.md` 的 captured commit / 字节数 / sha256 provenance 与磁盘实际字节一致。
5. `docs/visual/v1/baseline-facts.json` 按写路径真实重算（`refreshed.appVersion` 必须跟随 `APP_VERSION` 变为 `0.2.24`，`preToken` 段逐字节不变）。
6. 复核并保持 README 第 5 行与 announced tag 停在 `v0.2.23`；不推 tag、不 dispatch、不动已公开 Release 与资产。

## 验收

- ac-version-single-source: `package.json#version` 为 `0.2.24`，且 `CHANGELOG` 首个 `## ` 标题、`docs/release-notes/v0.2.24.md` 一级标题内的 tag、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-process.md` 中 `default: '…'` 代码片段五处全部为 `v0.2.24`；`pnpm test src/main/release-version-gate.test.ts` 的 `version single source` 与 `repository release facts` 用例全绿（无 `tag-mismatch` / `missing` / `version-not-semver`）。
- ac-notes-bilingual-parity: 两个 notes 文件均存在；第 1 行为 `# OpenCompare v0.2.24 release notes` / `# OpenCompare v0.2.24 发布说明`；第 3 行严格等于 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.24/docs/release-notes/v0.2.24.zh-CN.md)` / `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.24/docs/release-notes/v0.2.24.md) | 简体中文`；每个文件恰好 1 个 Markdown 链接；H2 恰好 6 个且按 `What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade` 与 `本次变化 / Windows 安装包与免安装 zip / macOS 签名与公证 / 不做的事 / 风险与验证规模 / 升级方式` 逐位对位。
- ac-notes-cover-changes: 中英 notes 的 `What changed` / `本次变化` 均写明三项用户可见修复（菜单栏与工具栏跟随主题、工具栏直接可见的交换左右与同一动作的快捷键、上一处 / 下一处差异块垂直居中跳转）与两项治理（覆盖率门对 0 可执行语句模块的显式豁免、发布点覆盖率基线重采样）；对应关键词在两侧各自出现：`menu bar` / `菜单栏`、`toolbar` / `工具栏`、`swap` / `交换`、`Cmd/Ctrl+Shift+S`、`centred` / `居中`、`previous` 与 `next` / `上一处` 与 `下一处`、`0 executable statements` / `0 可执行语句`、`exempt` / `豁免`、`coverage gate` / `覆盖率门`、`resample` / `重采样`。
- ac-notes-preserve-facts: 中英 notes 仍包含既有事实 token——英文 `ignore whitespace`、`off by default`、`spaces`、`tabs`、`one comparison result`、`status bar`、`same session`、`scroll position and switches`、`keeps the previous result`、`swap`、`ruler and counts`、`restores`；中文 `忽略空白差异`、`默认关闭`、`空格`、`制表符`、`同一份比较结果`、`状态栏`、`不新建会话`、`滚动位置与开关状态`、`保留上一次结果`、`交换`、`指示条与计数`、`复原`；且 `Windows portable download` / `Windows 免安装包` 小节仍为 2 句，含 `.zip`、`no installation step` 与 `NSIS` / `无安装步骤` 与 `NSIS`。
- ac-no-frozen-declaration: `CHANGELOG` 的 `v0.2.24` 段与中英 notes 均不宣布或预告维护态切换——不出现 `feature-frozen`、`feature frozen`、`maintenance mode`、`维护态`、`冻结开发`；允许写「本版为本次功能迭代的收口版本」一类只描述迭代边界的措辞。
- ac-changelog-top-entry: `CHANGELOG.md` 的 `## v0.2.24` 段位于 `v0.2.23` 之前且不重复、不倒序，段内包含 `忽略空白差异`、`默认关闭`、`重载`、`交换` 四个 token；`docs/release-evidence/` 与 `docs/release-evidence-ledger.json` 零 diff（v0.2.24 为 pending 当前版本，证据行由发布后收尾项补，不在本项创建）。
- ac-published-anchor-untouched: `README.md` 与 `README.zh-CN.md` 第 5 行仍指向 `v0.2.23`，`src/main/__fixtures__/release-announced-tag.json` 仍为 `{"tag":"v0.2.23"}`；这三个文件相对基线零 diff，`published anchor` 与 `points both readme line-5 links…` 用例全绿。
- ac-screenshots-recaptured: 在最终 renderer 上实跑 `pnpm screenshots`（内含 `pnpm build`）后四张 PNG 落盘；`docs/screenshots.md` 记录的 captured commit 恰好 1 个、40 位小写 hex、`git cat-file -e <sha>^{commit}` 成功且是 `HEAD` 祖先、`<sha>..HEAD` 在 `src/renderer`（排除 `*.test.ts` / `*.test.tsx`）零 diff；每条资产行的字节数与 sha256 与磁盘文件逐一相等；同场景中英两图字节不同；四图仍为 2560×1584、PNG 签名正确、已被 git 跟踪且未被 ignore。
- ac-baseline-facts-refreshed: `VISUAL_BASELINE_WRITE=1 pnpm vitest run scripts/visual-baseline-facts.test.mjs` 后 `docs/visual/v1/baseline-facts.json` 的 `directoryHtml.refreshed.appVersion` 为 `0.2.24`、`refreshed.commit` 为 40 位真实提交、`refreshed.sha256` / `bytes` 与重新计算一致，`directoryHtml.sha256` / `bytes` 与 `refreshed` 相同，`directoryHtml.preToken` 与 `commit` / `capturedAt`（`11170a5…` / `2026-11-04T17:06:57.558Z`）逐字段不变；随后不带写开关的同一用例（含 `proves the two sources differ only by the APP_VERSION string`）全绿。
- ac-release-gates-green: `pnpm test` 全量绿，且其中 `src/main/release-version-gate.test.ts`、`src/main/release-packaging.test.ts`、`src/main/release-artifacts-and-brand.test.ts`、`src/main/release-evidence.test.ts` 四个套件均通过；`pnpm lint`、`pnpm typecheck`、`pnpm build` 与 `node scripts/test-debt-gate.mjs` 通过（未新增测试行，`repoTestLines` 不超过 baseline 上限 51955）。
- ac-no-publish-actions: 本地 `git tag --list` 与基线一致（无新 tag），无 `workflow_dispatch` 触发记录写入仓库，无 `gh release create/edit/upload/delete` 调用；`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`.munk/baseline/coverage.json` 零 diff；`src/**` 产品代码（含 `src/core/**` 与 `src/renderer/**`）零 diff。

## 非目标

- 不改 `src/**` 任何产品源码（含 `src/core/**` 与 `src/renderer/**`）、测试文件与新增测试行。
- 不改对比 / 合并语义、四态计数、忽略开关、导出 / 快照、IPC、主题 token。
- 不改发布通道、签名口径、覆盖率门脚本、覆盖率 floors / scope / baseline、`release-packaging.json` 的 `evidence.currentVersion`（它仍是最近一次**已公开**版本的资产台账 `v0.2.23`）。
- 不创建 `docs/release-evidence/v0.2.24.md`，不追写 v0.2.24 台账（属发布后收尾项）。
- 不推 tag、不 dispatch release workflow、不创建 / 修改 Release 与资产、不 `gh release edit`。
- 不新增 `docs/release-notes` 之外的发布文档、不改 README 正文与第 5 行指针、不切维护态。
- 不做浏览器 / 设备 / 桌面 GUI 验收，不派 QA 子项。

## 实现约束

- 门禁取自真实读取路径，改动必须逐项对齐（`src/main/release-doc-fixtures.test-helpers.ts` + `src/main/release-gate.ts`）：
  - `judgeVersionSources` 读 `package.json#version`、`CHANGELOG` 首个 `^## `、notes 一级标题内 tag、`release.yml` 的 `workflow_dispatch.inputs.tag.default`、`release-process.md` 首个匹配 `^default:\s*'([^']+)'$` 的内联代码片段；五处必须互相相等。
  - `judgePublishedAnchor` 用「已 verified 证据 + announced tag 的最大 semver」比对两版 README 第 5 行，当前为 `v0.2.23`，因此 README 与 `release-announced-tag.json` 必须原样不动。
  - `judgeReleaseHistory` 要求除 pending 当前 tag 外的每个 `## ` 标题都有对应 `docs/release-evidence/*.md`；v0.2.23 已有 `status: verified` 证据，`v0.2.24` 作为 pending 无需证据文件。
  - notes 门禁：第 1 行标题、第 3 行语言切换逐字符模板（见 `release-packaging.json#notesLinks`）、全文 Markdown 链接数 = 1（不要再加任何链接）、H2 顺序表 `NOTES_H2_PAIRS`。
- 现有文件锚点（写前先读，保持行结构）：`package.json:3`、`.github/workflows/release.yml:17`、`docs/release-process.md:8`、`CHANGELOG.md` 顶部（`## v0.2.23` 之前插入）、`docs/screenshots.md` 的「Captured commit」与两张语言表、`docs/visual/v1/baseline-facts.json`。
- 截图：当前 `docs/screenshots.md` 的 captured commit `dd3296a682ed80c064369586707f05c5936af1f0` 已是 `HEAD` 祖先，且 `git diff dd3296a…HEAD -- src/renderer` 为空——本项不动 renderer，因此重采应逐字节相同（现有字节 251392 / 318864 / 240835 / 319308）。若重采结果与记录一致，保留该 commit 即可；若某张 PNG 字节变化，则必须同步改记录中的字节数与 sha256，并把 captured commit 改钉到一个「解析成功、是 HEAD 祖先、且与该系列截图对应的 renderer 提交」。若 `pnpm screenshots` 无法在本机启动真实窗口，**不要手改 sha256 充数**，按无法取证上报。
- baseline facts：只能用写开关重算，不得手写 JSON；`APP_VERSION` 来自 `src/shared/appVersion.ts` → `package.json`，版本一升 `refreshed.appVersion` 必然变，不重算就会红。
- 测试债：本项预期零测试改动；若因门禁口径被迫改测试，必须按真实测量值在 `.munk/baseline/test-debt.json` 声明 growth，并说明原因（默认视为越界）。
- 覆盖率 freshness 以 git 最近的 semver tag（仍为 `v0.2.23`）为准，`package.json` 升到 `0.2.24` 但不打 tag 不会让门变红；**不要**因此重采 `.munk/baseline/coverage.json`。
- 与父 PRD 的措辞冲突已由本项方向收敛：`overview.md` 写「声明 v0.2.24 后 feature-frozen」，但本项 Planner 方向与验收明确「不得自行宣布或切换 feature-frozen，维护态切换由公司负责人确认」。本项以 Planner 方向为准：只允许写「本次功能迭代收口版本」，**不**写维护态声明，交付说明中需点明该差异，避免与父 PRD 文本逐句对账时误判。
- 发布事实只读：任何 GitHub 交互（若需要核对 v0.2.23 指针）只允许只读查询；本项不需要联网取证。
