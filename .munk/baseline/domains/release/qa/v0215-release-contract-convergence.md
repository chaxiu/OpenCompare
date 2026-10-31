# v0.2.15 发布契约收敛：版本单点 / CHANGELOG 顶段 / 双语 notes 互链 / 签名与 dispatch 默认 tag / 断言锚点重钉

- WI：`wi_intake_ea7ba22dd1f38c62`
- 域：`release`（发布面文案 + 发布配置断言；被测改动落在 `package.json#version`、`CHANGELOG.md`、两份 v0.2.15 notes、`docs/release-process.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`）
- 来源：`.munk/changes/wi_intake_ea7ba22dd1f38c62/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 28 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 基线：`main @0c4f51ec`（本 worktree HEAD），首行标题即开发前的收敛态
- 交付 commit：本 WI 分支 `munk/wi_intake_ea7ba22dd1f38c62` 上的实现提交 + fold 提交
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`package.json` 1/1、`CHANGELOG.md` +19/−0、`docs/release-process.md` 1/1、`docs/release-signing.md` 3/3、`.github/workflows/release.yml` 1/1、`src/main/release-packaging.test.ts` 128/34，外加新增 `docs/release-notes/v0.2.15.md` 与 `docs/release-notes/v0.2.15.zh-CN.md`（各 37 行，未跟踪新文件）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-single-source | `package.json:3` `"version": "0.2.15"`；`git diff --numstat -- package.json` = `1 1 package.json`，唯一 hunk `@@ -1,6 +1,6 @@` 只改该行，`name` / `private` / `description` / `author` 等其余字节不变 | 满足 |
| ac-changelog-top-entry | `CHANGELOG.md` 的 `# Changelog` 与首个历史段 `## v0.2.14` 之间新增且仅新增一个 `## v0.2.15` 段（含 `### 改进` / `### 不做的事` / `### 升级方式`）；`grep -c '^## v0.2.15$'` = 1 | 满足 |
| ac-changelog-history-bytes | `git diff -U0 -- CHANGELOG.md` 只有一个 hunk `@@ -2,6 +2,25 @@`，全部为 `+` 行、零 `-` 行，即 `## v0.2.14` 起的全部历史内容与 `0c4f51ec` 逐字节一致 | 满足 |
| ac-notes-pair | `docs/release-notes/v0.2.15.md` 与 `docs/release-notes/v0.2.15.zh-CN.md` 均存在、各 37 行、非空；英文首行 `# OpenCompare v0.2.15 release notes`；中文首行 `# OpenCompare v0.2.15 发布说明`（含 `v0.2.15`） | 满足 |
| ac-notes-mutual-links | 英文第 3 行 `English \| [简体中文](./v0.2.15.zh-CN.md)`；中文第 3 行 `[English](./v0.2.15.md) \| 简体中文`，两者互链 | 满足 |
| ac-notes-sections | 英文按序含且仅含一次 `## What changed` / `## Not in this release` / `## Risk and verification scope` / `## Upgrade`（行 7 / 26 / 31 / 35）；中文对应 `## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式`（行 7 / 26 / 31 / 35） | 满足 |
| ac-notes-three-items | CHANGELOG `## v0.2.15` 段与两份 notes 各三个分项、只覆盖三条用户可见改动：① 链接落盘——「相对路径不会被改写为绝对路径」「悬空链接照链接落盘」「指向目录的链接同样只落链接本身」「只替换该条目、不写穿」「只删链接本身」「按链接对齐」；② 预览摘要——「可执行数为 0 且执行按钮不可用」「勾选一项后为 1 且可用」「取消勾选又回到 0」「删除组头同时显示计划数与已选数」「与磁盘实际一致」；③ README 三口径——「增量同步只做新增与覆盖、不删除」「默认不勾选、显式勾选后才执行」「没有后台文件监听」 | 满足 |
| ac-notes-no-full-changelog | 两份 notes 与 CHANGELOG 新段 `**Full Changelog**` 命中 0、`releases/tag/` 命中 0 | 满足 |
| ac-notes-upgrade-from | 英文 `## Upgrade` 段写明从 v0.2.14 升级；中文 `## 升级方式` 段为「建议从 v0.2.14 升级。本次不变更数据格式，已有会话与设置照常可用。」 | 满足 |
| ac-notes-no-unverified | CHANGELOG `## v0.2.15` 段与两份 notes：`200,000` / `10 MB` 命中 0，`[0-9a-f]{40,64}` 命中 0，CI run id 命中 0，「已发布」/「已修复」/「已通过验收」/「已通过 L1」/「本版新增」/「预计通过」/「应该通过」命中 0（由新增用例 `covers the three user-visible v0.2.15 sync changes across the entry and both notes` 逐项负断言守住） | 满足 |
| ac-signing-status-unchanged | `docs/release-signing.md:5` 仍为 `> **当前状态：v0.2.14 已发布。**`，其后 `releases/tag/v0.2.14` / `docs/release-notes/v0.2.14.md` / `docs/release-evidence/v0.2.14.md` 三处引用逐字未动（`git diff` 该行零 hunk） | 满足 |
| ac-signing-posture-current | 第三节标题已是 `## 三、正式版发布姿态（v0.2.15）`（`@@ -41` hunk）；全文含 `` 默认 `v0.2.15` ``（第五节补发段）与 `docs/release-notes/v0.2.15.md`（姿态段本版 notes 条目） | 满足 |
| ac-signing-successor | 第四节 v0.1.2 漂移记录承接句改为「tag 之后的修复由 v0.2.15 承接」；该行由 `release-packaging.test.ts` 的 `expect(signingDoc).toContain('tag 之后的修复由 v0.2.15 承接')` 守住 | 满足 |
| ac-release-yml-default | `.github/workflows/release.yml` `workflow_dispatch.inputs.tag.default` 为 `'v0.2.15'`；`git diff` 该文件只有 `@@ -14,7 +14,7 @@` 一处 hunk、仅该行 | 满足 |
| ac-release-process-default | `docs/release-process.md` 含 `` `default: 'v0.2.15'` ``，同句仍写「与 `package.json#version` 同源，即 `v${pkg.version}`」，同源表述不变；`git diff` 只有 `@@ -5,7 +5,7 @@` 一处 hunk | 满足 |
| ac-test-published-anchor-strict | 原 `expect(latestPublishedTag).toBe(currentTag)` 已改写为 `expect(latestPublishedTag).toBe('v0.2.14')` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`（严格早于、非恒真、未删除）；原 `expect(latestPublished).toBe(current)`（CHANGELOG 序）改为 `expect(latestPublished).toBeGreaterThan(current)`，且 `expect(changelog.indexOf('## v0.2.12')).toBeGreaterThan(latestPublished)` 保留 | 满足 |
| ac-test-last-released-notes | 原 `expect(lastReleasedNotesPath).toBe(releaseNotesPath)` 两处改写为：`expect(relative(repoRoot, lastReleasedNotesPath)).toBe('docs/release-notes/v0.2.14.md')` + `expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)` + `expect(existsSync(lastReleasedNotesPath)).toBe(true)` + `expect(firstHeading(lastReleasedNotes)).toContain(latestPublishedTag)`，`v0.2.14` notes 实测存在且首行含 `v0.2.14` | 满足 |
| ac-test-constants-pinned | `latestPublishedTag = 'v0.2.14'`、`previousPublishedTag = 'v0.2.8'`、`publishedTags` 历史字面量（v0.2.0/1/2/4/5/6/7/8/9/11/12 + `latestPublishedTag`）逐项未改；`expect(publishedTags).not.toContain(foldedTag)` 保留 | 满足 |
| ac-test-v0214-boundary | 三处「当前版」切片改以 `## v0.2.14` 段为边界（幽灵版本 heading 用例 `start = indexOf(latestPublishedTag)` / `end = indexOf('## v0.2.12')` 且 `headings == [latestPublishedTag]`；无未测数字用例改 `publishedEntry` / `lastReleasedNotes`；报告上限口径用例同理）；挂 v0.2.14 内容的断言（`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `ancestor` / `共同祖先` / `Upgrade` / `### 升级方式`）逐条保留、改锚在 `## v0.2.14` 段与 `docs/release-notes/v0.2.14.md` 上，未弱化 | 满足 |
| ac-test-history-anchors-kept | v0.2.12 / v0.2.11 / v0.2.9 等显式历史锚点断言逐字保留（`shippedV0211` / `shippedV029` offset 递增链未改）；新增用例断言 `headings.slice(0, 2)` 为 `[currentTag, latestPublishedTag]`，即 `## v0.2.15` 位于 `## v0.2.14` 之前；`## v0.2.13` / `foldedTag` 段命中 0 | 满足 |
| ac-test-v0215-neutral-assertions | 新增用例 `pins the converged version on the changelog top and the dispatch default`：`docs/release-notes/v0.2.15.md` 与 `.zh-CN.md` 均 `existsSync` 且 `firstHeading` 含 `v0.2.15`；CHANGELOG 顶层为 `currentTag`；两版 README 第 5 行 `toContain(latestPublishedTag)` 且 `not.toContain(currentTag)`（实测 `README.md:5` / `README.zh-CN.md:5` 均为 `v0.2.14`）；`release.yml` 与 `docs/release-process.md` 均含 `default: 'v0.2.15'` | 满足 |
| ac-src-diff-scope | `git diff --name-only -- src/` 只有 `src/main/release-packaging.test.ts`；`src/core/**` / `src/renderer/**` / `src/shared/**` / `src/preload/**` 与 `src/main/**` 其余文件零 diff | 满足 |
| ac-readme-untouched | `git status --porcelain` 与 `git diff --name-only` 均不含 `README.md` / `README.zh-CN.md`（逐字节一致于 `0c4f51ec`）；两版第 5 行实测仍为 v0.2.14 | 满足 |
| ac-evidence-history-untouched | `docs/release-evidence/**` 零 diff（`git diff --name-only` 无命中）；`docs/release-notes/` 只有两份 v0.2.15 为新增未跟踪文件，历史 notes 零 diff | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：**11 门**全 passed / exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate`），证据落 `.munk/runs/run_intake_ea7ba22dd1f38c62/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (11 gates, attempt 001)"`；未加 `|| true` | 满足 |
| ac-no-side-effects | 本 WI 全程未执行 `git tag`、`git push`、`workflow_dispatch`、`gh release create/edit/delete`；改动只落在本 worktree 内（`git status` 的 6 个已跟踪修改 + 2 个新增 notes + change pack + baseline fold），交付前分支工作区无残留（commit 后 `git status --porcelain` 只剩 Host 侧运行产物） | 满足 |
| ac-delivery-report | 本条由本文件 + `domains/release/product.md` 的交付证明条目 + WI change pack 内的改动清单承担：改动文件清单、`git diff --stat`（6 files / +153 −40）、每处锚点改写的前后语义对照（见下节）、「断言未减」证据（`it(` 257 → 259、`expect(` 947 → 973，无 `skip` / `only` / 删除）、未纳入项清单（见下节） | 满足 |
| ac-implementation-constraints | 版本唯一源仍是 `package.json#version`（`release.yml` / `release-process.md` 只改默认 tag 一行、未新增第二版本源）；断言无恒真式（`isTagBefore` 两侧均为真实常量参与）；notes 结构照 v0.2.14（H1 / 概述 / 四节 / 顶部互链 / 无 Full Changelog）；只在 worktree 内读写；11 门原始输出保留在 code-gates 目录 | 满足 |

## 锚点改写前后语义对照

| 位置 | 改写前（`0c4f51ec`） | 改写后 | 语义 |
| --- | --- | --- | --- |
| `release version gate` 版本门 | `expect(latestPublishedTag).toBe(currentTag)` | `expect(latestPublishedTag).toBe('v0.2.14')` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)` | 「已发布锚点 == 当前版本」→「已发布锚点严格早于当前版本」；方向性断言，既能抓 `latest` 落后也能抓 `latest` 超前 |
| 已发布 notes 锚（两处） | `expect(lastReleasedNotesPath).toBe(releaseNotesPath)` | `expect(relative(repoRoot, lastReleasedNotesPath)).toBe('docs/release-notes/v0.2.14.md')` + `not.toBe` + `existsSync` + `firstHeading` 含 `v0.2.14` | 「已发布 notes == 本版 notes」→「已发布 notes 钉在 v0.2.14 且文件真实存在、首行含该版本」；从路径相等升级为「路径 + 存在 + 内容」三重 |
| CHANGELOG 版本序 | `expect(latestPublished).toBe(current)` | `expect(latestPublished).toBeGreaterThan(current)` | 「已发布条目 == 当前条目」→「v0.2.14 段位于 `## v0.2.15` 之后」的严格顺序 |
| 三处「当前版」切片终点 | `slice(indexOf(currentTag), indexOf('## v0.2.12'))` | `slice(indexOf(latestPublishedTag), indexOf('## v0.2.12'))` | 切片对象由「当前版」改为「已发布段 v0.2.14」；v0.2.14 内容断言（`P1` / `opacity-60` / `structured` / `semantic` / `9→10` / `ancestor` / `共同祖先` / `Upgrade` / `### 升级方式`）随之改锚，逐条保留 |
| `v0.1.2` 承接句 | `tag 之后的修复由 v0.2.12 承接` | `tag 之后的修复由 v0.2.15 承接` | 该行是「当前收敛版本的承接声明」而非稳定历史，随收敛版本走 |
| `foldedTag` / `ghostTag` 负断言 | 保留 | 保留（未合并、未改名） | v0.2.13 折叠版本与 v0.2.4 幽灵版本是两套独立常量，任一被合并都会让对应负断言失守 |

断言未减证据：`grep -c 'it('` `257 → 259`（+2：新增中立断言用例、三条用户可见改动覆盖用例）；`grep -c 'expect('` `947 → 973`（+26）；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0；无断言被 `toBeTruthy()` 之类顶替。

## 未纳入项（刻意不做）

1. **不建 `docs/release-evidence/v0.2.15.md`**：证据归档是发布后动作（v0.2.14 收尾轮才建），本项只做发版前收敛。
2. **两版 README 第 5 行与 `latestPublishedTag` 不动**：`v0.2.14` 仍是唯一「已发布」锚点，状态翻面留给 v0.2.15 真正发布后的收尾提交；`release-packaging.test.ts` 已用 `not.toContain(currentTag)` 把这条冻结钉住。
3. **不创建 `## v0.2.13` / `docs/release-notes/v0.2.13.md`**：延续「v0.2.13 永不单独发布」的现状。
4. **不碰已公开 Release 与资产**：不打 tag、不 push、不 dispatch、不 `gh release edit`。
5. **不改 `code-gates.json`、不加依赖、不改 `electron-builder.yml`**。

## 口径与陷阱注记

- **门禁口径第三次扩门**：9 → 10 → **11 门**，本轮新增 `sync-real-gate`（对应链接落盘的实盘门）。任何交付证据都必须实读当轮 `.munk/code-gates.json`，不沿用记忆中的门数。
- **`not.toBe` 与 `isTagBefore` 不是等价写法**：前者只保证「不相等」，`latestPublishedTag` 若被打错成 v0.2.16 这类未来版本也照样通过；本轮第一次把断言改成方向性判定。后续「收敛未发布」轮次应沿用 `isTagBefore(latest, current) === true`，不要再退回 `not.toBe`。
- **切片端点会随版本段移动而假绿**：`changelog.slice(indexOf(currentTag), indexOf('## v0.2.12'))` 在新收敛段刚出现时切到的是新段（此时 v0.2.14 断言全部落空）；而若端点写成 `indexOf(latestPublishedTag)` 又会切出空串。本轮的解法是**把断言跟着事实走**——v0.2.14 的内容断言锚 `## v0.2.14` 段，新段内容另立用例，两条路径互不借光。
- **`v0.1.2` 承接句没有稳定归属**：v0.2.14 收尾轮曾把它钉死为显式 `v0.2.12`（理由：历史记录不该跟最新锚漂），本轮又必须改成 `v0.2.15`。结论：这行字是「当前收敛版本的承接声明」，每次收敛都要同批复核，不能靠常量派生也不会自动跟随。
- **签名文档的两套锚必须分开读**：状态行与三处 v0.2.14 引用（Release 链接 / notes / evidence）是**发布事实**，冻结；姿态标题、本版 notes 指向、v0.1.2 承接句、补发默认 tag 是**收敛事实**，跟 `currentTag`。混淆任一侧都会在「收敛未发布」窗口里写出自相矛盾的文档。
