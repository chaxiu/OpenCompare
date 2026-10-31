# v0.2.13 版本单点 + 双语发布说明 + 锚点对齐（发布前态，单提交）

- WI：`wi_ws_01759cc51f642bad`
- 域：`release`（版本收敛轮：bump 待发版本 + 新增双语发布说明 + CHANGELOG 折叠 + dispatch 默认 tag + 签名文档锚点 + 测试锚点**反向**翻面；不是发版 / 收尾轮）
- 来源：`.munk/changes/wi_ws_01759cc51f642bad/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过）

## 最近执行

- workItemId: wi_ws_01759cc51f642bad
- at: 2026-10-31
- status: pass
- note: 23 条 prd AC 全部满足，无偏差。本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（10 gates，attempt 001，`.munk/runs/run_ws_5b055e3cfc11b92a/code-gates/attempts/001`，全 exit 0；`pnpm test` 91 files / 1347 passed + 1 skipped（1348）/ 29.49s）。边界：不打 tag / 不 push 分支 / 不 dispatch / 不 publish / 不建 Release 与证据文件；`latestPublishedTag` 保持 `v0.2.12`，v0.2.13 发版后的 README 第 5 行 + `latestPublishedTag` 收尾前移与 `docs/release-evidence/v0.2.13.md` 归档是独立动作。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-single-source | `package.json#version === "0.2.13"`；`git diff --numstat package.json` = `1/1`，唯一一组变更行为 `- "version": "0.2.12"` / `+ "version": "0.2.13"` | 满足 |
| ac-changelog-new-segment-first | `CHANGELOG.md` 全部 `^## v*` 标题前四位为 `v0.2.13` → `v0.2.12` → `v0.2.11` → `v0.2.9`；`## v0.2.13` 与 `## v0.2.12` 之间只有 `### 改进` / `### 不做的事` / `### 升级方式` 与正文，无其它版本标题、无空段 | 满足 |
| ac-changelog-history-untouched | `git diff --numstat CHANGELOG.md` = `18/0`（零删除行）；`## v0.2.12` 及以下全部历史条目逐字未变 | 满足 |
| ac-changelog-upgrade-heading | `## v0.2.13` 段（`indexOf("## v0.2.13")` → `indexOf("## v0.2.12")`）含 `### 升级方式` | 满足 |
| ac-changelog-banned-tokens | 同一切片：`200,000` / `10 MB` / `本版新增` / `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` 全 0 命中；`/[0-9a-f]{40,64}/g` 0 命中；`/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g` 为空数组 | 满足 |
| ac-notes-bilingual-pair | `docs/release-notes/v0.2.13.md`（30 行，H1 `# OpenCompare v0.2.13 release notes`）与 `docs/release-notes/v0.2.13.zh-CN.md`（30 行，H1 `# OpenCompare v0.2.13 发布说明`）均存在非空；英文版顶部 `English \| [简体中文](./v0.2.13.zh-CN.md)`、中文版顶部 `[English](./v0.2.13.md) \| 简体中文`，路径与对方文件名一致 | 满足 |
| ac-notes-section-order | 英文版 `## ` 序列恰为 `What changed` → `Not in this release` → `Risk and verification scope` → `Upgrade`；中文版恰为 `本次变化` → `不做的事` → `风险与验证规模` → `升级方式`；两版各自四节各出现一次（由新增用例 `ships the bilingual notes pair with mutual links and mirrored sections` 的 `orderedSection()` 断言守住） | 满足 |
| ac-notes-facts-only | 两版均含 `opacity-60` 与祖先回退表述（en `ancestor` / zh `共同祖先`）、门数 `9→10` 与 `structured` / `semantic`；「精确行不回退」在 en 为 `Exact lines do not regress`、zh 为「精确行不回退」；两版 `已发布` / `已修复` / `已通过 L1` / `**Full Changelog**` / `releases/tag/` 全 0 命中（注：en `is not published yet` 与 zh「尚未发布」不含被禁串） | 满足 |
| ac-readme-line5-frozen | `git diff --stat a330498 -- README.md README.zh-CN.md` 为空；第 5 行仍 `v0.2.12`；两版仍无 `\| Version \|` / `\| 版本 \|` 版本表 | 满足 |
| ac-signing-posture-v0213 | `docs/release-signing.md` 含 `## 三、正式版发布姿态（v0.2.13）`、第五节 `输入目标 tag（默认 v0.2.13）`、末尾收敛句 `最新公开 Release 仍为 v0.2.12，README 状态行与 latestPublishedTag 保持指向该版本` | 满足 |
| ac-signing-published-facts-frozen | 第 5 行 `当前状态：v0.2.12 已发布` 逐字未改；`docs/release-notes/v0.2.12.md` 与 `docs/release-evidence/v0.2.12.md` 引用逐字未改（该文件 numstat 3/3，全部落在姿态标题、第五节补发句与末尾收敛句）；`待发布` 0 命中 | 满足 |
| ac-release-yml-default-only | `.github/workflows/release.yml` `workflow_dispatch.inputs.tag.default === 'v0.2.13'`；`git diff --numstat` = `1/1`，仅该行（`--notes-file`、preCreate、finalize、祖先门、签名检查、打包矩阵、单 Release 门均零 diff） | 满足 |
| ac-release-process-default | `docs/release-process.md` 含 `default: 'v0.2.13'`；numstat `1/1`，改动行即第 8 行的 dispatch 默认值摘录，无其它改动 | 满足 |
| ac-test-dispatch-defaults | `src/main/release-packaging.test.ts` 的版本门用例保留 `expect(releaseWorkflow).toContain(\`default: '${currentTag}'\`)` 与 `expect(releaseProcessDoc).toContain(\`default: '${currentTag}'\`)`，`currentTag` 由 `package.json#version` 派生（= `v0.2.13`）；`pnpm test` 全绿 | 满足 |
| ac-test-prelaunch-state | `latestPublishedTag = 'v0.2.12'` 未变；版本门用例断言 `expect(latestPublishedTag).not.toBe(currentTag)`、`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`、`expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)`；`publishedTags` 声明逐字未改 | 满足 |
| ac-test-anchor-moves-only | 无删除的 `describe` / `it`（`it(` 202 → 203，净增 1 例双语用例）；无新增 `skip` / `only` / `todo`；既有断言只是锚点表达式重写，无 `not.toContain` 放宽、无白名单扩容、无断言目标文件改写；`grep -c '  it('` 202 → 203、`grep -c 'expect('` 863 → 876，均 ≥ 基线 | 满足 |
| ac-test-changelog-slice-boundaries | 三处 `changelog.slice(...)` 结束端点均为显式 `changelog.indexOf('## v0.2.12')`；以该端点为界的当前段内 `^## ` 标题集合恰为 `['v0.2.13']`；顺序用例断言 `indexOf('## v0.2.12') === indexOf(\`## ${latestPublishedTag}\`)` 且 `latestPublished > current`、`shippedV0211 > latestPublished` | 满足 |
| ac-test-content-tokens | 当前段内容断言改为 v0.2.13 事实 token `['P1', 'opacity-60', 'structured', 'semantic', '9→10']` 逐条保留；原中英共享 `升级方式` 断言拆成 `expect(currentEntry).toContain('### 升级方式')` + `expect(releaseNotes).toContain('Upgrade')` 两条等价断言（另加 `共同祖先` / `ancestor` 一组） | 满足 |
| ac-evidence-frozen | `docs/release-evidence/**` 与 `docs/release-notes/v0.2.12.md` 及更早历史 notes 零 diff；`docs/release-evidence/v0.2.13.md` 不存在 | 满足 |
| ac-no-product-code | `git status --porcelain` 中 `src/` 只有 `src/main/release-packaging.test.ts`；`src/renderer/**`、`src/core/**`、`src/preload/**`、`src/shared/**`、`src/main/**` 其余文件零 diff | 满足 |
| ac-gates-10-green | `.munk/runs/run_ws_5b055e3cfc11b92a/code-gates/latest.json` = `ok: true`、`code_gates passed (10 gates, attempt 001)`、`failedGateIds: []`；十门 install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics 全 exit 0 | 满足 |
| ac-worktree-clean | 产品面改动已由 `munk_git_commit` 提交（commit 信息由 Host 生成），交付前工作区只剩本 fold 与 change pack；合并由 `munk_local_merge` 完成，不手写 status | 满足 |
| ac-delivery-report | 见下方「交付说明」：改动文件清单、逐处测试锚点改动理由、`it(` / `expect(` 改动前后计数、`git diff --stat` | 满足 |

## 交付说明

**改动文件（6 个已跟踪 + 2 个新增）**：`package.json`（仅 `version`）、`CHANGELOG.md`（+18，顶部新增 `## v0.2.13`）、`docs/release-process.md`（dispatch 默认 tag 摘录）、`docs/release-signing.md`（3/3：姿态标题、第五节补发 default + 收敛句、末尾承接段）、`.github/workflows/release.yml`（dispatch 默认 tag 一行）、`src/main/release-packaging.test.ts`（67/24：锚点反向翻面 + 切片终点重锚 + 新增双语 notes 用例）；新增 `docs/release-notes/v0.2.13.md` / `docs/release-notes/v0.2.13.zh-CN.md`（各 30 行）。

**`git diff --stat a330498`**：`5 files changed` 之外另含测试文件，合计 `6 files changed, 91 insertions(+), 30 deletions(-)`（`.github/workflows/release.yml` 1/1、`CHANGELOG.md` 18/0、`docs/release-process.md` 1/1、`docs/release-signing.md` 3/3、`package.json` 1/1、`src/main/release-packaging.test.ts` 67/24），另有两份未跟踪新增 notes。

**逐处测试锚点改动理由**：
1. 头部注释：`v0.2.12 wrap-up`（latest === current）→ `v0.2.13 pre-release wrap-up`（latest 停在 v0.2.12），让常量注释与新的发布姿态一致。
2. 版本门三式反向翻面：`toBe(currentTag)` → `not.toBe(currentTag)`、`isTagBefore(...)` `false` → `true`、`lastReleasedNotesPath` `toBe` → `not.toBe`——发布前态的正确姿态就是 latest 落后 current 且 released notes 与 current notes 不同文件。
3. 签名文档两处姿态标题断言：`正式版发布姿态（${latestPublishedTag}）` → `正式版发布姿态（${currentTag}）`——本轮起姿态标题跟待发版本走，而 `当前状态：${latestPublishedTag} 已发布` 仍钉已发布版本（prd 实现约束明确要求）。
4. CHANGELOG 顺序断言：`latestPublished).toBe(current)` → `toBeGreaterThan(current)`；`shippedV0211).toBeGreaterThan(current)` → `toBeGreaterThan(latestPublished)`——v0.2.13 段插在 v0.2.12 之上后，原等式与相对位置都需按新顺序重述。
5. 三处 `slice` 结束端点：`indexOf('## v0.2.11')` → `indexOf('## v0.2.12')`（当前段 = `[## v0.2.13, ## v0.2.12)`）。
6. 当前段内容断言：UI 第一期短语 `['壳层','图标','lucide-react','主题','tab','截图']` → v0.2.13 事实短语 `['P1','opacity-60','structured','semantic','9→10']`；中英共享 `升级方式` 拆成中文 CHANGELOG 段 + 英文 notes 两条等价断言。
7. 新增用例 `ships the bilingual notes pair with mutual links and mirrored sections`：锁定双语互链、四节顺序与「各出现一次」、以及两版的完成态 / Full Changelog / release 链接负向白名单。

**`it(` / `expect(` 计数**：基线（`a330498`）= `202` / `863`；交付后 = `203` / `876`（净增 1 例、13 条断言，只增不减）。

**未纳入项**：打 tag / push tag / dispatch `Release` / 创建或修改 GitHub Release 与资产 / publish；不新建 `docs/release-evidence/v0.2.13.md`；不改两版 README（第 5 行仍 `v0.2.12`、`latestPublishedTag` 仍 `v0.2.12`）；不改 `src/` 业务代码与 UI 行为；不做视觉 / 交互自测（`needSelfTest=false`）；不带版本表 / 版本徽章。
