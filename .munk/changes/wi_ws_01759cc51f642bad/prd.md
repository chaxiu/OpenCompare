# 版本单点 0.2.13 + 双语发布说明 + 锚点对齐

## 范围

在隔离 worktree（基线 `main@a330498`）把仓库收敛成可直接打 `v0.2.13` 的发布前态，只改版本与发布前置文件：

1. `package.json#version`：`0.2.12` → `0.2.13`（只改该字段）。
2. `CHANGELOG.md`：顶部新增 `## v0.2.13` 段，紧随其后是既有 `## v0.2.12`；历史条目逐字不动。
3. 新增 `docs/release-notes/v0.2.13.md`（英文默认正文）与 `docs/release-notes/v0.2.13.zh-CN.md`（中文副本），同一次提交内落地，两版顶部互链。
4. `docs/release-signing.md`：发布姿态标题、第五节补发默认 tag 与末尾收敛句指向 `v0.2.13`；发布事实段（「当前状态：v0.2.12 已发布」、`docs/release-evidence/v0.2.12.md` 引用、历史段）保持不动。
5. `.github/workflows/release.yml`：仅 `workflow_dispatch.inputs.tag.default` 改为 `'v0.2.13'`。
6. `docs/release-process.md`：`default: 'v0.2.12'` → `default: 'v0.2.13'`（列表外唯一追加文件，理由见「实现约束」）。
7. `src/main/release-packaging.test.ts`：把派生锚点同源对齐到 `v0.2.13` 收敛态，只移动锚点，不删 / 不弱化断言。

发布说明正文只写已合入事实：P1④ 语义定位收尾（单侧新增/删除时缺失側落到最近祖先并 `opacity-60` 弱化，精确行不回退）、结构化语义门（默认矩阵门数 9→10）。

## 验收

- ac-version-single-source: `package.json#version === "0.2.13"`，且该文件 diff 只有 version 一行。
- ac-changelog-new-segment-first: `CHANGELOG.md` 中最先出现的 `## v*` 标题是 `## v0.2.13`，其后紧邻的下一个版本标题是 `## v0.2.12`，两者之间不插入其它版本标题或空段。
- ac-changelog-history-untouched: `## v0.2.12` 及以下全部历史条目零 diff（git diff 在该区段只有新增行、无删除/改写行）。
- ac-changelog-upgrade-heading: `## v0.2.13` 段内含「升级方式」标题。
- ac-changelog-banned-tokens: `## v0.2.13` 段不含 `200,000`、`10 MB`、`本版新增`、`待验证`、`预计通过`、`应该通过`、`TODO|TBD|FIXME`、40–64 位十六进制串，以及任何 `\d+(\.\d+)?\s*(GiB|MiB|GB|MB)` 尺寸/内存数字。
- ac-notes-bilingual-pair: `docs/release-notes/v0.2.13.md` 与 `docs/release-notes/v0.2.13.zh-CN.md` 均存在且非空，各自首个 H1 含 `v0.2.13`；两版顶部各有一条指向对方的互链，且互链路径与对方文件名一致。
- ac-notes-section-order: 英文版按 `What changed` → `Not in this release` → `Risk and verification scope` → `Upgrade` 顺序出现；中文版按 `本次变化` → `不做的事` → `风险与验证规模` → `升级方式` 顺序出现；四节标题在每个文件内各出现一次。
- ac-notes-facts-only: 两版正文均含 P1 语义定位事实（最近祖先 / `opacity-60` / 精确行不回退）与结构化语义门事实（默认门数 9→10，`structured` 或 `semantic` 表述），且不含「已发布」「已修复」「已通过 L1」、`**Full Changelog**` 行，也不含 `releases/tag/` 链接。
- ac-readme-line5-frozen: `README.md` 与 `README.zh-CN.md` 的 diff 为空；第 5 行仍为 `v0.2.12`，两版都未新增版本表（仍无 `| Version |` / `| 版本 |`）。
- ac-signing-posture-v0213: `docs/release-signing.md` 含 `正式版发布姿态（v0.2.13）`，第五节补发用法默认 tag 为 `v0.2.13`，末尾收敛句指向 `v0.2.13` 且明确写出「最新公开 Release 仍为 v0.2.12」。
- ac-signing-published-facts-frozen: `docs/release-signing.md` 第 5 行 `当前状态：v0.2.12 已发布` 与 `docs/release-notes/v0.2.12.md`、`docs/release-evidence/v0.2.12.md` 引用逐字未变；不含 `待发布`。
- ac-release-yml-default-only: `release.yml` 的 `workflow_dispatch.inputs.tag.default` 解析结果为 `v0.2.13`，该文件 diff 仅此一行。
- ac-release-process-default: `docs/release-process.md` 含 `default: 'v0.2.13'`，且第 8 行以外无其它改动。
- ac-test-dispatch-defaults: `src/main/release-packaging.test.ts` 对 `releaseWorkflow` 与 `releaseProcessDoc` 的 dispatch 默认值断言与 `currentTag`（= `v0.2.13`）同源并全绿。
- ac-test-prelaunch-state: 测试断言 `latestPublishedTag`（保持 `v0.2.12`）早于 `currentTag`，且 `lastReleasedNotesPath !== releaseNotesPath`；`publishedTags` 列表内容不变。
- ac-test-anchor-moves-only: 测试文件无删除的 `describe` / `it`、无 `skip` / `todo` 化、无把断言放宽为 `not.toContain`、无白名单扩容、无断言目标文件改写；改动前基线 `grep -c '  it('` = 202、`grep -c 'expect('` = 863，改动后两者计数均不低于基线。
- ac-test-changelog-slice-boundaries: 以 `## v0.2.12` 作为当前段结束边界，当前段内版本标题集合恰为 `[v0.2.13]`，且顺序断言中 `## v0.2.12` 位于 `## v0.2.13` 与 `## v0.2.11` 之间。
- ac-test-content-tokens: CHANGELOG 当前段内容断言使用 `v0.2.13` 事实 token（`P1`、`opacity-60`、`structured`/`semantic`、门数 9→10 表达）且逐条保留；「升级方式」类中英共享断言拆成中文 CHANGELOG 段断言 `升级方式` + 英文 notes 断言 `Upgrade` 两条等价断言。
- ac-evidence-frozen: `docs/release-evidence/**` 与 `docs/release-notes/v0.2.12.md` 及更早历史 notes 零 diff；`docs/release-evidence/v0.2.13.md` 不存在。
- ac-no-product-code: `src/renderer/**`、`src/core/**`、`src/main/**`（`release-packaging.test.ts` 除外）零 diff；`src/preload/**`、`src/shared/**` 零 diff。
- ac-gates-10-green: 按 `.munk/code-gates.json` 顺序执行全部 10 门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics）全部通过。
- ac-worktree-clean: 隔离 worktree 内 `git status --porcelain` 为空。
- ac-delivery-report: 交付说明逐条列出改动文件清单、每处测试锚点改动理由、`it(`/`expect(` 改动前后计数、`git diff --stat`。

## 非目标

- 不改任何产品行为、UI、组件与算法；不新增功能。
- 不改 `README.md` / `README.zh-CN.md` 任何内容，尤其第 5 行与版本表形态。
- 不新建 `docs/release-evidence/v0.2.13.md`，不动既有证据文件与历史发布说明。
- 不推 tag、不 dispatch、不创建/修改 GitHub Release 与资产、不触碰任何已公开 tag。
- 不跑 L2 长跑与性能/内存实测，不为凑绿放宽门禁或删测试。
- 不做 cherry-pick 拼版；不新增文档站、品牌、架构类文档。
- 不修改 `docs/release-notes/` 历史文件的双语形态（历史 notes 保持原样）。

## 实现约束

- 基线必须为 `main@a330498` 的隔离 worktree；禁止在共享主检出做 git 写操作或以其脏工作区跑 gate。
- 发布前态语义固定：`latestPublishedTag` 保持 `v0.2.12`，`currentTag` 为 `v0.2.13`；不得提前把 README 第 5 行或证据链前移。
- 测试改动只在锚点层：锚点字面量、切片边界、以及把中英共享断言按语言拆成等价多条；不得改断言目标文件。
- `docs/release-signing.md` 的姿态标题断言改由 `currentTag` 锚定，`当前状态：${latestPublishedTag} 已发布` 与证据路径断言保持 `latestPublishedTag`。
- 英文为默认正文、`zh-CN` 为同提交副本，是本版起的新约定；两版必须结构对齐且事实一致。
- `docs/release-process.md` 属本项唯一列表外追加文件：测试以 `currentTag` 同时断言 workflow 与该文档的 dispatch 默认值，不同步则「10 门全绿」与「不删/弱化断言」无法同时成立。
