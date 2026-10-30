# v0.2.12 版本收敛、发布说明与测试锚点收敛

## 范围

在 main（`62b53e1`，v0.2.11 树）上做一次**纯发布收敛**，只改发布契约与测试锚点，不碰产品行为：

1. `package.json#version`：`0.2.11` → `0.2.12`（唯一版本源，只改该字段）。
2. 新建 `docs/release-notes/v0.2.12.md`，结构照 `v0.2.11.md`（H1 → 概述 → `## 本次变化` → `###` 分项 → `## 不做的事` → `## 风险与验证规模` → `## 升级方式`），不写 Full Changelog 行；文案只写 UI 第一期已合入事实（壳层五级重排、vendored Lucide 单一出口、三态主题、会话 tab 截断、README 双截图、文档收尾）。
3. `CHANGELOG.md` 顶部新增 `## v0.2.12` 段，历史条目逐字不动。
4. `docs/release-signing.md`：状态行与第三节标题锚到 **已发布的 v0.2.11**，补发默认值 / 收敛段 / 承接句同步到 v0.2.12，并如实登记 v0.2.11 证据未归档（保留 `docs/release-evidence/v0.2.11.md` 字样）。
5. `docs/release-process.md`：`default: 'v0.2.11'` 摘录 → `default: 'v0.2.12'`。
6. `.github/workflows/release.yml`：仅 `workflow_dispatch.inputs.tag.default` → `'v0.2.12'`。
7. `README.md` / `README.zh-CN.md` 第 5 行从 v0.2.9 纠正为 v0.2.11（各一条 `releases/tag/v0.2.11` 链接）。
8. `src/main/release-packaging.test.ts`：`latestPublishedTag` → `v0.2.11`，`publishedTags` 增补显式 `v0.2.9`，`previousPublishedTag` 保持 `v0.2.8`；把绑在移动锚点上的 v0.2.9 / v0.2.11 专属事实断言改读显式历史路径（照 `historicalNotesV027Path` / `historicalEvidenceV027` 既有写法），断言逐条保留，并新增 v0.2.12 的版本中立断言。

## 验收

- ac-version-0-2-12: `package.json` 的 `version` 为 `"0.2.12"`；同文件 `dependencies` 中无 `lucide-react`，`scripts` 与其它字段相对基线零 diff。
- ac-notes-h1: `docs/release-notes/v0.2.12.md` 存在且 H1 含 `v0.2.12`；文件含 `## 本次变化`、`## 不做的事`、`## 风险与验证规模`、`## 升级方式` 四个二级标题，且不含 `Full Changelog` 字样。
- ac-changelog-head: `CHANGELOG.md` 首个 `## ` 标题为 `## v0.2.12`，且位于 `## v0.2.11` 之上；`## v0.2.11` 及以下历史段落逐字不变（diff 仅新增，无删除/改写）。
- ac-notes-fact-boundary: v0.2.12 notes 与 CHANGELOG `## v0.2.12` 段均不含 `200,000`、`10 MB`、`本版新增`、`待验证`、`预计通过`、`应该通过`、`TODO|TBD|FIXME`、40–64 位 hex，且 `\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)` 匹配结果为空数组。
- ac-notes-ui-facts: v0.2.12 notes 含壳层重排、图标单一出口 / `lucide-react` 已移除、亮暗跟随系统三态主题、会话 tab 标题截断、README 双截图五组已合入事实短语，且不含任何 v0.2.12 的「已发布 / 已修复 / 已通过 L3」完成态宣称；升级方式写「建议从 v0.2.11 升级」。
- ac-release-yml-default: `release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.12'`；`git diff -- .github/workflows/release.yml` 只含这一行改动（`--notes-file`、preCreate、finalize、祖先门、签名检查、打包矩阵、单 Release 门均不变）。
- ac-release-process-default: `docs/release-process.md` 含 `default: 'v0.2.12'` 且不再含 `default: 'v0.2.11'`。
- ac-signing-v0211-published: `docs/release-signing.md` 含 `当前状态：v0.2.11 已发布`、`正式版发布姿态（v0.2.11）`、`docs/release-notes/v0.2.11.md`、`默认 \`v0.2.12\``、`docs/release-notes/v0.2.12.md`、`tag 之后的修复由 v0.2.11 承接`；不含 `当前状态：v0.2.8` / `当前状态：v0.2.4` / `当前状态：v0.2.2`、`发布冻结`、`待发布`。
- ac-signing-evidence-gap: `docs/release-signing.md` 含 `docs/release-evidence/v0.2.11.md` 字样，并紧邻说明「尚未归档 / 已归档最新证据为 `docs/release-evidence/v0.2.9.md`」；不出现「证据已齐 / 已核验」或任何新资产名 / size / sha256。
- ac-readme-status-line: 两版 README 第 5 行分别含 `最新公开版本：[v0.2.11]` 与 `Latest public release: [v0.2.11]`，各自只含 1 处 `releases/tag/` 且为 `releases/tag/v0.2.11`；第 5 行以外的行、9 个 `## ` 节标题、两张 `docs/assets/*.png` 字节均相对基线零 diff。
- ac-test-anchor-constants: `src/main/release-packaging.test.ts` 中 `latestPublishedTag === 'v0.2.11'`、`previousPublishedTag === 'v0.2.8'`，`publishedTags` 含显式 `'v0.2.9'` 且以 `latestPublishedTag` 收尾。
- ac-test-history-pinned: v0.2.11 ruler 事实（`指示条` 短语白名单、`['451.6 MiB','909.0 MiB','2.25 GiB','2.5 GiB','9.29 GiB','9.62 GiB']` 顺序白名单、`trun_08764efa44c39426`、`2bcdc53e`、`L1 前待实机` / `run id 待该场次回填` 负向）、v0.2.9 HTML 报告 / Open Rebuilds 断言、caps 断言、最新已验证证据 describe 全部改读显式历史路径（v0.2.11 notes / v0.2.9 notes / `docs/release-evidence/v0.2.9.md`）；证据 describe 的 `releasedCommit = '35d4000f…'` 与 11 件资产 size/sha256 逐条保留。
- ac-test-no-assertion-loss: 相对基线，该测试文件无 `expect` 断言删除、无新增 `.skip` / `.only`、无 `toBeTruthy()` 式弱化、无 describe 删除；断言行数与用例数只增不减。
- ac-test-current-neutral: 新增针对 v0.2.12 的 current-notes / current-changelog 断言：H1 含 `currentTag`、含 `升级方式`、不越出 ac-notes-fact-boundary 的负向白名单；新增断言中的版本号一律由 `package.json#version` 派生，不写 `0.2.12` 内联字面量。
- ac-gates-green: `.munk/code-gates.json` 的 9 道门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部通过，其中 `pnpm test` 全量绿。
- ac-no-deletions: `git status --porcelain` 为空（交付提交后）；`git diff --stat` 中无 `docs/release-notes/v0.2.0`–`v0.2.11` 与 `docs/release-evidence/**` 的删除，也不存在新建的 `docs/release-evidence/v0.2.11.md`。

## 非目标

- 不打 tag、不 push、不 dispatch workflow、不创建 / 修改 GitHub Release 与资产、不 publish。
- 不新建任何证据文件（含 `docs/release-evidence/v0.2.11.md`），不写任何未实测的资产名 / size / sha256 / run id。
- 不动 `docs/release-notes/v0.2.0`–`v0.2.11` 历史 notes 与 `docs/release-evidence/**` 既有文件。
- 不改 `src/` 业务代码、UI 行为、对比 / 合并 / 扫描算法、快照格式。
- 不改 `release.yml` 除 dispatch 默认 tag 外的任何字节（禁回退 `--generate-notes`、不动签名 / 矩阵 / finalize）。
- 不重拍 / 不降级 README 两张截图，不改 README 第 5 行以外内容与任一 `## ` 节标题。
- 不把 `v0.2.10` 纳入 `publishedTags`（无公开 Release、无证据文件、文档不链接它）。
- 不删除、跳过或弱化 `release-packaging.test.ts` 的任何既有断言。
- 不做视觉 / 交互自测（`needSelfTest=false`），不跑浏览器 / 真机 / 桌面点选。

## 实现约束

- 作业基线：`git rev-parse HEAD` 必须为 `62b53e13a831d46bb90e13092ca51248e4c97190`，`package.json#version` 为 `0.2.11` 且依赖无 `lucide-react`，`docs/release-notes/v0.2.10.md`、`docs/release-notes/v0.2.11.md`、`docs/release-evidence/v0.2.9.md` 在场；任一不满足停手报 owner。主检出目录（停 v0.2.9 且有已暂存回退）不是内容源，禁止在其上做任何 git 写操作。
- 锚点手术逐块（a→g）进行，每块后跑 `pnpm test src/main/release-packaging.test.ts`，最后跑全量；不要在几千行测试里一次性大改后猜红点。
- 除历史事实显式钉死的锚点外，测试与文档中的版本号一律由 `package.json#version` 派生，不新增版本字面量。
- 措辞白名单硬约束：v0.2.12 文案一旦写进 GiB/MiB/GB/MB 数字或 `200,000` / `10 MB` / `本版新增`，current 断言立即红，数值一律不写。
- `previousPublishedTag` 保持 `'v0.2.8'`：前移会打断 v0.2.8 证据 describe、caps 断言与 README 负向链接断言。
- 交付说明需含：① 开工三查结果（HEAD sha / version / 三文件在场）；② 逐文件改动清单；③ 锚点逐条改动理由与「断言未减」证据；④ 未纳入项（tag / push / publish / Release / 资产 / 证据文件 / 截图重拍 / release.yml 语义）；⑤ `git diff --stat` 证明无删除。
