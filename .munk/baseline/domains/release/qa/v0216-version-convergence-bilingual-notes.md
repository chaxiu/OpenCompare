# v0.2.16 版本单点与双语发布说明：版本源 / CHANGELOG 顶段 / 双语 notes 互链 / 签名与 dispatch 默认 tag / 断言锚点回翻

- WI：`wi_intake_072cb09ce42c067d`
- 域：`release`（发布面文案 + 发布配置断言；被测改动落在 `package.json#version`、`CHANGELOG.md`、两份 v0.2.16 notes、`docs/release-process.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`）
- 来源：`.munk/changes/wi_intake_072cb09ce42c067d/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 20 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 基线：`main @f0e4589`（本 worktree HEAD，已含本轮目录词表与「已落位」两条修复），首行标题即开发前的收敛态
- 交付 commit：本 WI 分支 `munk/wi_intake_072cb09ce42c067d` 上的实现提交 + fold 提交
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`package.json` 1/1、`CHANGELOG.md` +22/−0、`docs/release-process.md` 1/1、`docs/release-signing.md` 3/3、`.github/workflows/release.yml` 1/1、`src/main/release-packaging.test.ts` 95/33，外加新增 `docs/release-notes/v0.2.16.md` 与 `docs/release-notes/v0.2.16.zh-CN.md`（各 47 行，未跟踪新文件）；`git diff --stat` = 6 files / +123 −39

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-bump | `node -p "require('./package.json').version"` 输出 `0.2.16`；`git diff --numstat -- package.json` = `1 1`，唯一 hunk 只改 `version` 行（`0.2.15` → `0.2.16`），`name` / `author` / `license` / `homepage` / deps / scripts 字节不变；仓内无第二处版本源（`release.yml` / `release-process.md` 只用 `v${version}` / `node -p` 派生） | 满足 |
| ac-changelog-heading | `grep -c '^## v0.2.16$' CHANGELOG.md` = 1（行 5）；下一个 `## v*` 标题即 `## v0.2.15`（行 27），两者之间无其他版本标题；`## v0.2.15` 及更早条目零删除行（`git diff -U0 -- CHANGELOG.md` 只有 `@@ -2,6 +2,28 @@` 一个 hunk、22 行全为 `+`） | 满足 |
| ac-changelog-covers-real-changes | `## v0.2.16` 段分五项：目录独有状态词表「右独有 / 左独有」（声明文本 / 代码 diff 的「新增 / 删除」词表不变、过滤与四态计数语义不变）、模板归位接入真实用户目录（选根 / Dry-run 零写入 / 同一份解析结果 / 只写勾选 / 逐条复核 sha256 与 `mtimeSec`）、重复 Dry-run 对内容一致的槽位判「已落位」、失败提示随界面语言本地化（保留目标路径与 OS code）、样本入口收进「设置 → 示例与调试」；段内含 `### 升级方式` 且写「建议从 v0.2.15 升级」 | 满足 |
| ac-changelog-no-overclaim | 新段 `GiB` / `MiB` / `GB` / `MB` 数值命中 0、`[0-9a-f]{40,}` 命中 0、`TODO` / `TBD` / `FIXME` 命中 0、虚构版本标题 0（`grep -c '^## v0.2.16$'` = 1 且无其他新标题）；门禁矩阵 / e2e 夹具 / 基线文档写在「不做的事」而归验证面，不写成新用户功能 | 满足 |
| ac-notes-en-exists-and-structure | `docs/release-notes/v0.2.16.md` 存在、47 行、非空；行 1 `# OpenCompare v0.2.16 release notes`（含 `v0.2.16`）；行 3 `English \| [简体中文](./v0.2.16.zh-CN.md)`；`## What changed`（7）→ `## Not in this release`（35）→ `## Risk and verification scope`（41）→ `## Upgrade`（45）各恰一次且按序 | 满足 |
| ac-notes-zh-exists-and-structure | `docs/release-notes/v0.2.16.zh-CN.md` 存在、47 行、非空；行 1 `# OpenCompare v0.2.16 发布说明`（含 `v0.2.16`）；行 3 `[English](./v0.2.16.md) \| 简体中文`；`## 本次变化`（7）→ `## 不做的事`（35）→ `## 风险与验证规模`（41）→ `## 升级方式`（45）各恰一次且按序 | 满足 |
| ac-notes-cover-real-changes | 英文正文含 `Right only` / `Left only` / `Already placed` / `OS code` / `Settings → Samples & debugging`；中文正文含「右独有」「左独有」「模板归位」「Dry-run」「已落位」「同一份解析结果」「OS code」「设置 → 示例与调试」；由新增用例 `covers the five user-visible v0.2.16 changes across the entry and both notes` 逐项正向断言（英文读 `releaseNotes`、中文读 CHANGELOG 新段与 `bilingualNotes`），另断言英文含 `` `Added` / `Removed` ``、中文含「「新增 / 删除」词表保持不变」、`writes nothing` / `one resolved plan` / 「预览零写入」 | 满足 |
| ac-notes-windows-portable-section | 英文 `### Windows portable download`（行 31）两句：Windows 同时提供 NSIS 安装包与免安装 `.zip`（解压即用）；自动更新仍指向 NSIS。中文 `### Windows 免安装包`（行 31）同义两句；两侧句子数与顺序一致，`release-packaging.test` 既有 Windows 段落断言保持通过 | 满足 |
| ac-notes-no-banned-phrases | 两份 notes `已发布` / `已修复` / `已通过 L1` / `**Full Changelog**` / `releases/tag/` / `TODO` / `TBD` / `FIXME` / `[0-9a-f]{40,}` / 单位数值全部命中 0（`grep` 实测 + 测试负断言双重覆盖） | 满足 |
| ac-release-yml-default | `.github/workflows/release.yml:17` `default: 'v0.2.16'`；`git diff` 该文件只有 `@@ -14,7 +14,7 @@` 一处 hunk、仅该行；body 组装顺序（英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → Full Changelog）与两文件缺失 / 空白 `exit 1` 逻辑零改动 | 满足 |
| ac-release-process-doc | `docs/release-process.md:8` 含 `` `default: 'v0.2.16'` ``，同句仍写「与 `package.json#version` 同源，即 `v${pkg.version}`」；`git diff` 只有 `@@ -5,7 +5,7 @@` 一处 hunk | 满足 |
| ac-release-signing-doc | 保留 `当前状态：v0.2.15 已发布`（行 5）、`docs/release-notes/v0.2.15.md`（1 次）、`docs/release-evidence/v0.2.15.md`（1 次）；同时存在 `正式版发布姿态（v0.2.16）`（行 44）、`docs/release-notes/v0.2.16.md`（行 55）、补发默认 tag `` `v0.2.16` `` 与「`v0.2.16` 的版本收敛已合入 `main`」（行 79）；`当前状态：v0.2.14` / `v0.2.4 已发布` / `v0.2.2 已发布` 命中 0；`git diff` 恰 3 处 hunk、`3/3` | 满足 |
| ac-readme-published-line-unchanged | `README.md:5` / `README.zh-CN.md:5` 仍只链 `releases/tag/v0.2.15`；`git diff --name-only` 不含两版 README（零 diff），无 `v0.2.16` 发布链接、无版本表新增 | 满足 |
| ac-release-evidence-untouched | `git diff --name-only` 与 `git status --porcelain` 均无 `docs/release-evidence/**` 命中；本项未新增 / 修改 / 删除该目录任何文件 | 满足 |
| ac-test-current-tag-anchor | `const currentVersion` / `currentTag` 仍由 `package.json#version` 派生（`currentTag = v${currentVersion}`，行 39）；`latestPublishedTag = 'v0.2.15'`（行 71）、`priorPublishedTag = 'v0.2.14'`（行 75）逐字未改；`lastReleasedNotesPath` 指向 `docs/release-notes/v0.2.15.md`（行 225）且 `expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)` | 满足 |
| ac-test-version-order | 版本门为 `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`（方向断言，非 `not.toBe` 弱否证）；CHANGELOG 序为 `expect(current).toBeLessThan(latestPublished)` + `priorPublishedTag` 严格在后；`expect(headings.slice(0, 2)).toEqual([currentTag, latestPublishedTag])`；`latestPublishedTag === currentTag` / `currentTag === 'v0.2.15'` 断言命中 0（`grep` 实测） | 满足 |
| ac-test-bilingual-fail-closed-kept | `notes_file="docs/release-notes/v${version}.md"`（行 399）与 `notes_zh_file="docs/release-notes/v${version}.zh-CN.md"`（行 467）逐字保留；英 / 中两文件的缺失与空白四条守卫仍在 `gh release create` / `gh release edit` 之前 `exit 1`（行 421–433 / 483+）；`<details><summary>简体中文</summary>` 折叠块顺序与唯一性断言、finalize 已发布正文双语校验断言均未改；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0 | 满足 |
| ac-test-current-content-coverage | 原 `covers the three user-visible v0.2.15 sync changes…` 改名为 `keeps the three user-visible v0.2.15 sync changes as published history`，切片改读显式 `## v0.2.15` 段（起点 `latestPublishedTag`、终点 `priorPublishedTag`），中文事实对照新增 `lastReleasedBilingualNotesPath`（v0.2.15 的 `.zh-CN.md`）而不随 `currentTag` 漂移；新增 `covers the five user-visible v0.2.16 changes across the entry and both notes` 以 `currentTag` 为起点、`latestPublishedTag` 为终点；`pnpm test` 该文件全绿（107 files / 1562 passed + 1 skipped） | 满足 |
| ac-code-gates | Host `code_gates` attempt 001：**16 门**（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real`）全 passed / exit 0；证据落 `.munk/runs/run_intake_072cb09ce42c067d/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (16 gates, attempt 001)"`；未加 `\|\| true`、无跳项 | 满足 |
| ac-scope-guard | `git status --porcelain` 的已跟踪改动恰 6 个（`package.json`、`CHANGELOG.md`、`docs/release-process.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`）+ 2 个新增 notes；`git diff --name-only -- src/` 只有该测试文件；未打 tag、未 push、未 dispatch、未创建 / 修改 Release 与资产、未 cherry-pick；v0.2.15 及更早 tag / Release / 资产 / 证据零触碰 | 满足 |

## 锚点改写前后语义对照

| 位置 | 改写前（上一轮收尾，`latest === current`） | 改写后（本轮收敛，`latest` 落后 `current`） | 语义 |
| --- | --- | --- | --- |
| 版本门 | `expect(latestPublishedTag).toBe(currentTag)` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)` | `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)` | 「已发布锚点 == 当前版本」→「已发布锚点严格早于当前版本」；把「相等即非严格序」的弱写回换成方向断言，`latest` 误写成未来版本会被抓 |
| CHANGELOG 版本序 | `expect(latestPublished).toBe(current)` | `expect(current).toBeLessThan(latestPublished)` + `priorPublishedTag` 严格在后 | 「已发布条目 == 当前条目」→「v0.2.16 段在 v0.2.15 段之上、v0.2.14 段在其下」 |
| 已发布 notes 锚 | `expect(lastReleasedNotesPath).toBe(releaseNotesPath)` | `expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)` + 路径 `docs/release-notes/v0.2.15.md` + `existsSync` + `firstHeading` 含 `v0.2.15` | 从「同一文件」升级为「两份不同文件、已发布那份存在且首行含其版本」 |
| CHANGELOG 前两项标题 | `toEqual([currentTag, priorPublishedTag])` + `headings[0]` 为 `latestPublishedTag` | `toEqual([currentTag, latestPublishedTag])` + `headings[0]` 为 `currentTag` | 端点由「上一历史版」改为「最新已发布版」，`priorPublishedTag` 改作下一项锚 |
| README 状态行 | `expect(status).toContain(latestPublishedTag)`（相等时隐含也是当前版） | 同句 + 新增 `expect(status).not.toContain(currentTag)` | 把「收敛不改 README 第 5 行」从口头约定升级为负断言 |
| v0.2.15 内容覆盖 | 切片 `indexOf(currentTag)` → `indexOf(priorPublishedTag)`，中文对照读 `bilingualNotes` | 切片 `indexOf(latestPublishedTag)` → `indexOf(priorPublishedTag)`，新增 `lastReleasedBilingualNotesPath` 读 v0.2.15 的双语历史文件 | 历史内容不再借 `currentTag` / 当前双语文件的光，避免新段出现后切到空串或错文件而假绿 |
| notes 首标题 | `firstHeading(releaseNotes)` 含 `'v0.2.15'` 字面量 | 含 `currentTag` | 去掉内联版本字面量，改由 `package.json#version` 单点派生 |

断言未减证据：`grep -c 'it('` `277 → 278`（+1：新增五项 v0.2.16 覆盖用例）；`grep -c 'expect('` `1050 → 1067`（+17）；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0；无断言被 `toBeTruthy()` 之类顶替。

## 未纳入项（刻意不做）

1. **不建 `docs/release-evidence/v0.2.16.md`**：证据归档是发布后动作，本项只做发版前收敛；`docs/release-evidence/**` 零 diff。
2. **两版 README 第 5 行与 `latestPublishedTag` 不动**：`v0.2.15` 仍是唯一「已发布」锚点，状态翻面留给 v0.2.16 真正发布后的收尾提交；测试已用 `not.toContain(currentTag)` 把这条冻结钉住。
3. **不碰已公开 Release 与资产**：不打 tag、不 push、不 dispatch、不 `gh release edit/create/delete`，不改 v0.2.15 及更早的 notes / 证据 / tag。
4. **不改 `electron-builder.yml`、`code-gates.json`、依赖与 `release.yml` 的 body 组装逻辑**（只改 dispatch 默认 tag 一行）。
5. **不为凑绿放宽 fail-closed / 双语折叠 / finalize 正文校验断言**（`ac-test-bilingual-fail-closed-kept` 已逐条复核）。

## 口径与陷阱注记

- **门禁口径第 N 次扩门**：11 → **16 门**（新增 `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real`），任何交付证据都必须实读当轮 `.munk/code-gates.json`，不沿用记忆中的门数。
- **`toBe` / `isTagBefore === false` 在收敛窗口里是伪断言**：上一轮收尾是 `latest === current` 才成立；本轮 `latest` 落在 `current` 之前，若只把 `false` 改 `true` 而保留 `toBe(currentTag)` 会自相矛盾。正确写法是只留方向断言。
- **切片端点会随版本段移动而假绿**：`changelog.slice(indexOf(currentTag), indexOf(priorPublishedTag))` 在 v0.2.16 段刚出现时切到的是**新段**，v0.2.15 的三条断言会全部落空。本轮把历史断言整体锚到 `## v0.2.15`，新段内容另立用例，两条路径互不借光。
- **双语历史文件也会随锚点漂移**：`bilingualNotes` 指的是当前版本（v0.2.16）的 `.zh-CN.md`，若继续被 v0.2.15 的历史断言使用就会假绿；本轮新增 `lastReleasedBilingualNotesPath` 显式钉在 v0.2.15 的 `.zh-CN.md`。
- **路径前缀是真实发布时的硬失败点**：prd 原文写作 `docs/release-notes/0.2.16.md`，但 `release.yml` 按 `docs/release-notes/v${version}.md` 组装正文，无 `v` 前缀会在创建 / 编辑 Release 之前触发缺一 fail-closed。本项按 `v0.2.16` 落盘。
