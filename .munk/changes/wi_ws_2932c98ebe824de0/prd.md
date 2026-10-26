# v0.2.7 发布收尾：README 两版第 5 行 + 证据归档 + 测试锚点前移

## 范围

v0.2.7 已发布（tag、Release、CI、11 件资产均为既成事实），本项只做**文档与测试锚点收尾**，改动面锁定 6 个路径：

1. `README.md`：第 5 行把 `v0.2.6` 两处改为 `v0.2.7`，其余文案与行位不变。
2. `README.zh-CN.md`：第 5 行同样两处替换，其余不变。
3. `src/main/release-packaging.test.ts`：发布锚点前移（`latestPublishedTag=v0.2.7`、`previousPublishedTag=v0.2.6`、`publishedTags` 七项历史）、README 待发布断言翻为已发布正断言、修正所有由 `latestPublishedTag` 派生且在 `latest===current` 时会自相矛盾的既有断言。
4. `docs/release-evidence/v0.2.7.md`（新建）：`status: verified`，套用 v0.2.6 证据文件结构，归档 tag / Release / CI / 11 资产 / latest 门 / 公证 / dmg 内 `.app` / L1 复验。
5. `src/main/release-evidence.test.ts`：新增只读 v0.2.7 证据块（与 v0.2.1/2.2/2.4/2.5 块同构），历史块原样不动。
6. `docs/release-signing.md`：只改当前状态锚点（第 5 行、第三节标题 + v0.2.7 条目、notes 链接、第四节承接、第五节已发布），历史段落逐字保留。

发布事实数据源：`.munk/work-set/overview.md` 第 2 节（tag/Release/CI/11 资产/证据路径）与第 3.3 节（证据文件结构）。只读引用，不重新取数。

## 验收

- ac-readme-line5-en: `README.md` 第 5 行同时包含 `Latest public release:`、`[v0.2.7]`、`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.7`、`Developer ID signed and Apple-notarized macOS build.`，且不含子串 `v0.2.6`。
- ac-readme-line5-zh: `README.zh-CN.md` 第 5 行同时包含 `最新公开版本：`、`[v0.2.7]`、`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.7`、`macOS 安装包经 Developer ID 签名与 Apple 公证。`，且不含子串 `v0.2.6`。
- ac-readme-no-other-diff: `git diff --unified=0 README.md` 与 `README.zh-CN.md` 的变更块只落在第 5 行一行内；两版第 3 行互链文本保持不变；两版 H2 计数相等且为 9；英文版正文词数 ≤700。
- ac-anchor-constants: `latestPublishedTag === 'v0.2.7'`、`previousPublishedTag === 'v0.2.6'`；`publishedTags` 展开后恰为 `['v0.2.0','v0.2.1','v0.2.2','v0.2.4','v0.2.5','v0.2.6','v0.2.7']`，其中 v0.2.0–v0.2.5 以显式字面量钉住、不由 `latestPublishedTag` 派生。
- ac-readme-published-positive: `release-packaging.test.ts` 对两版 README 均断言 `toContain('releases/tag/' + latestPublishedTag)`；原 `not.toContain('v0.2.7')` 两处已删除；对 `releases/tag/${previousPublishedTag}` 的负断言仍保留并通过。
- ac-status-line-single-link: 两版第 5 行各恰好命中 1 个 `releases/tag/` 链接、包含 `latestPublishedTag`、不含运行时拼装的 `pendingWord`。
- ac-version-gate-flip: `release version gate` 中断言 `latestPublishedTag === currentTag`（不再是 `isTagBefore(latestPublishedTag, currentTag) === true`），且 `isTagBefore(previousPublishedTag, currentTag) === true` 仍成立；`isTagBefore` 上方注释不再声称 published 锚必须落后 current。
- ac-notes-path-equal: `lastReleasedNotesPath === releaseNotesPath === docs/release-notes/v0.2.7.md`，且「anchors the newest published release notes at the shipped tag」用 `.toBe(...)` 相等断言。
- ac-changelog-slices: CHANGELOG 排序与切片断言在 `currentTag` 与 `previousPublishedTag` 边界下全部通过——`## v0.2.7` 段 = `## v0.2.7`..`## v0.2.6`，`## v0.2.6` 段 = `## v0.2.6`..`## v0.2.5`，`## v0.2.5` 段 = `## v0.2.5`..`## v0.2.4`，v0.2.4/v0.2.2/v0.2.0/v0.1.2 仍为显式字面量，幽灵版本切片终点改为 `## v0.2.6`。
- ac-historical-notes-v026: 新增显式 `historicalNotesV026Path = 'docs/release-notes/v0.2.6.md'` 块，原 v0.2.6 notes 关键字（含 `0cc0914f3aebea9649d76be80fd3592a95bcdd87`、`39888946270`）逐字保留并仍被断言；v0.2.7 notes 断言由既有 `releaseNotes` 路径覆盖且通过。
- ac-evidence-file-verified: `docs/release-evidence/v0.2.7.md` 存在、非空、`status: verified` 恰好出现 1 次，全文不含 `TODO` / `TBD` / `FIXME`。
- ac-evidence-release-facts: 该文件含 tag 对象 `adc6e1e50b84e211d1e1791a4ae61b6d6ba87d24`、commit `e071f876da8cf502728e4d31b2699da8254629d5`、Release id `422765578`、`2026-10-24T14:05:12Z`、`draft: false`/`draft=false`、`prerelease: false`/`prerelease=false`、CI run `40100596470`、`latest published release: v0.2.7`、`releases/latest` = `v0.2.7`。
- ac-evidence-assets: 该文件逐字包含 11 件资产名、11 个 sha256、11 条 `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.7/<资产名>` 公开 URL，以及 `version: 0.2.7`、`path: OpenCompare-Setup-0.2.7.exe`、`102,964,024`。
- ac-evidence-publication-gate: 该文件含 `releases for v0.2.7: 1 (drafts: 0, prereleases: 0)`；五 job 表 `Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release` 各自对应 `success`；含 `notarization successful`、`CFBundleShortVersionString=0.2.7`、`com.opencompare.app`、dmg sha256 `4375fe95f5048195e1bcf46513da6291a8363585ed01f6f636ec18845a24e8f5`。
- ac-evidence-l1-blocked: 该文件含 `blocked`（≥4 处，对应 180 s / 60 s / 3 s 采样 / 15 s 取消点四条负载腿）、`ZenMind`、`Δ3=2.06 MB`、`116 ms`；四条负载腿所在段落不含「通过」「已通过」字样；无任何 `status: verified` 之外的第二个 status 值。
- ac-evidence-tests-guarded: `release-packaging.test.ts` 含 v0.2.7 证据块断言（存在/非空/verified/tag/commit/Release id/published_at/draft/prerelease/run/`releases/latest`/`blocked`/五 job/11 资产名+sha256+URL/`version: 0.2.7`/`path:`/`102,964,024`/公证原文/`ZenMind`/`2.06`/`116 ms`）；原 v0.2.6 证据断言改为显式 `historicalEvidenceV026Path` 历史块并保持全绿。
- ac-evidence-readonly-block: `release-evidence.test.ts` 新增的 v0.2.7 只读块通过（`inspectReleaseEvidence(doc, 'v0.2.7')` 无 problems，或等效关键标记断言），且 `status: verified` 恰好一处；v0.2.1/v0.2.2/v0.2.4/v0.2.5 历史块 diff 为零。
- ac-signing-current-anchors: `docs/release-signing.md` 含 `当前状态：v0.2.7 已发布`、`releases/tag/v0.2.7`、`docs/release-evidence/v0.2.7.md`、`## 三、正式版发布姿态（v0.2.7）`、`v0.2.7 已发布：` 条目含 CI run `40100596470` 与 `11 件资产`、`本版发布说明见 docs/release-notes/v0.2.7.md`、`tag 之后的修复由 v0.2.7 承接`、`v0.2.7` 已发布 + 补发默认 `v0.2.7`。
- ac-signing-history-intact: 该文件仍含 6 项 Secret 表格全部行、v0.1.2 漂移记录原文、祖先门原文；`v0.2.6 已发布` / `## 三、正式版发布姿态（v0.2.6）` 不再作为当前状态出现；全文不含 `待发布`、`发布冻结`。
- ac-gates-green: `.munk/code-gates.json` 的 9 道门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部通过，其中 `pnpm test` 覆盖 `release-packaging.test.ts` 与 `release-evidence.test.ts`。
- ac-diff-scope: `git diff --name-only`（含未跟踪）恰为 `README.md`、`README.zh-CN.md`、`docs/release-signing.md`、`docs/release-evidence/v0.2.7.md`、`src/main/release-packaging.test.ts`、`src/main/release-evidence.test.ts` 六个路径，无其他改动。

## 非目标

- 不改 `src/` 业务代码、preload、renderer、`src/core/`、`src/shared/`；`src/` 下只允许改上述两个测试文件。
- 不 bump `package.json#version`；不改 `docs/release-notes/v0.2.7.md` 与 `CHANGELOG.md` 的事实；不改 `electron-builder.yml`、`.github/workflows/**`、`scripts/**`、`.munk/code-gates.json`。
- 不打 tag、不 push、不 publish、不 dispatch CI、不重跑公证、不下载/替换/删除任何 Release 资产，不引入新依赖。
- 不改 `docs/perf` 历史数字、`qa-checklist.md`、历史 `docs/release-evidence/v0.2.0…v0.2.6.md`。
- 不修复 L1 负载腿 blocked 的数据侧问题（不恢复 / 替换 `ZenMind` 对照目录），只如实归档。
- 不做实机验收、桌面点选、浏览器走查、性能采样；不写 journal / cases / shipped；不改 `AGENTS.md`。
- 不新增版本表、版本直链或发布公告；不顺手润色、不做无关格式化、不重构测试文件结构。

## 实现约束

- 发布数据一律取自 `.munk/work-set/overview.md` 第 2 节与第 3.3 节，禁止重新 `gh release view`、重新下载资产或重新打包；证据文件必须逐字使用其中数值（字节 / sha256 / 时间 / run id / Release id）。
- 沿用既有显式字面量锚点模式：`release-packaging.test.ts` 中 `v0.2.7` 只作为 `latestPublishedTag` 的锚点出现，不在别处新增内联版本字面量；历史 tag 字面量与证据块内的版本化资产名、`version: 0.2.7`、`path: OpenCompare-Setup-0.2.7.exe` 属证据原文，不算新增发布锚点。`release-evidence.test.ts` 的 v0.2.7 走该文件既有的逐版本显式路径模式。
- 不删断言、不弱化为 `toBeTruthy()`、不放宽正则换绿；因 `latestPublishedTag === currentTag` 冲突的既有断言必须按语义改写（相等 / 显式历史常量），不能靠跳过 `it` 或注释掉换绿。
- v0.2.6 证据与 release notes 断言保留为显式历史块，不得让历史文件失去 `pnpm test` 守卫。
- `docs/release-evidence/v0.2.7.md` 与 v0.2.6 同构（tag 与构建检出 / 公开 Release / CI run 与五 job / 11 资产表 / 唯一性与 latest 门 / macOS 签名与公证 / L1 公开包复验 / 已知遗留），L1 四条负载腿如实标 `blocked`。
- `docs/release-signing.md` 只改当前状态锚点，历史段落（一、二、四节及既有版本条目）逐字保留。
