# v0.2.16 双语 Release notes 语言切换链接绝对化 + 发布正文 fail-closed 链接门

- WI：`wi_intake_aff66d0158e22f29`
- 域：`release`（发布正文契约 + 发布门禁断言；被测改动落在 `.github/workflows/release.yml`、`docs/release-notes/v0.2.16.md`、`docs/release-notes/v0.2.16.zh-CN.md`、`src/main/release-packaging.test.ts`）
- 来源：`.munk/changes/wi_intake_aff66d0158e22f29/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 10 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 基线：`main @320b7b1`（本 worktree HEAD，已含 v0.2.16 版本单点与双语发布说明）
- 交付 commit：本 WI 分支 `munk/wi_intake_aff66d0158e22f29` 上的实现提交 + fold 提交
- 改动面：`git diff --numstat` = 4 files / **+198 −4**——`.github/workflows/release.yml` 56/0、`docs/release-notes/v0.2.16.md` 1/1、`docs/release-notes/v0.2.16.zh-CN.md` 1/1、`src/main/release-packaging.test.ts` 140/2（除 change-pack `prd.md` 与 `.munk/baseline/**`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-notes-en-switch-absolute | `docs/release-notes/v0.2.16.md:3` 实测为 `English \| [简体中文](https://github.com/chaxiu/OpenCompare/blob/v0.2.16/docs/release-notes/v0.2.16.zh-CN.md)`（`version = package.json#version = 0.2.16` → `tag = v0.2.16`）；该行 `](./` 命中 0、`](v0.2.16` 命中 0；测试 `pins both current notes language switches to tag-fixed absolute URLs` 用 `currentTag` 派生 URL 做 `toBe` 逐字断言 | 满足 |
| ac-notes-zh-switch-absolute | `docs/release-notes/v0.2.16.zh-CN.md:3` 实测为 `[English](https://github.com/chaxiu/OpenCompare/blob/v0.2.16/docs/release-notes/v0.2.16.md) \| 简体中文`；该行 `](./` / `](v0.2.16` 命中 0；同一用例逐字断言 | 满足 |
| ac-notes-only-line3-touched | `git diff --unified=0` 两份 notes 各恰一个 hunk `@@ -3 +3 @@`，`--numstat` 各 `1 1`（仅 `-`/`+` 各一行、行号 3）；两文件行 1 标题版本号与正文其余行零 diff，英文 47 行 / 中文 47 行不变 | 满足 |
| ac-workflow-extract-links | `release.yml:812` 新增步骤「Assert the published release body links are absolute」，`run` 含 `gh release view "${RELEASE_TAG}"`（行 824）与 `--json body`（空正文即 `::error::` + `exit 1`，行 825–828），内联 `node -e` 以 `/\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g` 抽全部 markdown 链接目标、写 `links.txt` 并逐条 `console.log("link: " + target)`，首行打印 `release body markdown links (<tag>): <n>` | 满足 |
| ac-workflow-relative-fail | 脚本对每个目标做 `case "${target}" in ./*\|../*)` 判红，并对 `[[ "${target}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]` 同样判红，两处均 `::error::` 且 `relative` 累加，末尾 `[ "${relative}" -ne 0 ]` → `exit 1`；测试 `fails closed when the simulated body keeps a relative switch link` 把英文第 3 行换回 `./<tag>.zh-CN.md` 实跑，`status != 0` 且输出含 `::error::`、`./v0.2.16.zh-CN.md`、`must be an absolute URL` | 满足 |
| ac-workflow-absolute-required | 脚本构造 `en_switch="https://github.com/chaxiu/OpenCompare/blob/${tag}/docs/release-notes/${tag}.md"` 与 `zh_switch=".../${tag}.zh-CN.md"`，逐个 `grep -Fqx`（精确整行匹配，防被 `**Full Changelog**` 或折叠文本蒙过），缺失即 `::error:: ... is missing the absolute language switch link ...` 并 `missing` 累加，最后 `exit 1`；两条齐备时打印 `Verified the published <tag> body links: <n> links, 0 relative, both absolute language switch URLs present.`；测试 `fails closed when either or both absolute switch URLs are missing` 覆盖「缺英文 / 缺中文 / 两条都缺」三组 fixture 均非零退出，`passes the simulated body...` 覆盖齐备时 exit 0 | 满足 |
| ac-workflow-read-only | 新增步骤 `run` 中 `gh release (upload\|edit\|create\|delete)` 命中 0、`--method\s+(POST\|PATCH\|PUT\|DELETE)` 命中 0（测试 `runs the read-only link gate in finalize after the release is made public` 负断言）；位置被钉在 `Make the tag's release public`（行 745）之后——新步骤在行 812，且排在既有「Assert the published release body is bilingual」（行 755）之后，属 `finalize` job | 满足 |
| ac-simulated-body-passes | 测试 `simulateBody()` 严格按组装顺序拼装：英文 notes → 空行 → `---` → 空行 → `<details><summary>简体中文</summary>` → 中文 notes → `</details>` → `**Full Changelog**: .../compare/<latestPublishedTag>...<currentTag>`；实跑该步骤（`mkdtempSync` 临时目录 + PATH 打桩的假 `gh`（`cat "${FAKE_RELEASE_BODY}"`）+ `RELEASE_TAG=currentTag`，无网络）输出 `link: <enSwitch>` / `link: <zhSwitch>` / `links: 2` / `0 relative`、无 `::error::`、`status === 0` | 满足 |
| ac-test-derived-not-pinned | 新增 `describe('published release body link gate')` 内一切 URL 由 `currentTag`（`package.json#version` 派生）拼接：`baseUrl = https://github.com/chaxiu/OpenCompare/blob/${currentTag}/docs/release-notes`、`enSwitch` / `zhSwitch` 后缀 `${currentTag}.zh-CN.md` / `${currentTag}.md`；块内 `v0.2.15` / `v0.2.16` 字面量命中 0；不读 `.git`、不调用真实 `gh`（仅 PATH 打桩桩脚本） | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：**16 门**（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real`）全 passed / exit 0；证据落 `.munk/runs/run_intake_aff66d0158e22f29/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (16 gates, attempt 001)"`；`pnpm test` 107 files / 1568 passed + 1 skipped（1569）；未加 `\|\| true`、无跳项、未改 `.munk/code-gates.json` | 满足 |

## 断言增减证据

`grep -c 'it('` `278 → 285`（+7：新增 `describe('published release body link gate')` 的 7 例——第 3 行绝对 URL、只读 + 位置、fail-closed 分支命名、模拟 body 通过、相对链接判红、缺绝对 URL 三组合一）；`grep -c 'expect('` `1067 → 1098`（+31）；`it.skip` / `it.todo` / `describe.skip` / `.only(` 命中 0。既有双语互链断言由 `toContain('./<tag>.zh-CN.md')` 改为 `toContain('https://github.com/chaxiu/OpenCompare/blob/<tag>/docs/release-notes/<tag>.zh-CN.md')`（等价重定标，2 处、未删未放宽），其余既有断言逐字未动。

## 未纳入项（刻意不做）

1. **不补写已公开 `v0.2.15` 的 Release 正文**：`gh release edit` 一律不执行，修复自 `v0.2.16` 起生效；仓内 `docs/release-notes/v0.2.15*.md` 零 diff。
2. **不改双语组装逻辑**：`Pre-create the tag's release` 的 notes 读取路径、缺失 / 空白四条守卫、`---` / `<details>` 折叠段顺序与 `**Full Changelog**` 行逐字未动。
3. **不改版本号与发布面文案**：`package.json#version` 仍 `0.2.16`，`CHANGELOG.md`、`docs/release-signing.md`、`docs/release-process.md`、两版 README 零 diff。
4. **不新增门禁条目**：仓库级链接断言并入 `src/main/release-packaging.test.ts`（`test` 门已覆盖），`.munk/code-gates.json` 未改。
5. **不做发版动作**：不打 tag、不 push、不 dispatch、不创建 / 修改 Release 与资产。

## 口径与陷阱注记

- **「写了什么」≠「读到什么可达」**：v0.2.15 已公开 body 双语齐全、发布后 body 校验全绿，但两条语言切换链接全部 404——写入侧 fail-closed 只覆盖组装产物，不覆盖渲染后的可达性，故必须再有一层「发布后反读 + 链接形态断言」。
- **相对链接必须双形态判红**：只匹配 `./` / `../` 会漏掉裸 `v0.2.16.zh-CN.md`，GitHub 同样按 tag 页 base 解析；脚本因此对 `^v[0-9]+\.[0-9]+\.[0-9]+` 形态一并判红。
- **精确匹配而非包含匹配**：`grep -Fqx` 要求链接列表中存在**整行**绝对 URL（抽取阶段已一行一目标），避免被 `**Full Changelog**` 行或折叠文本里的同 tag 字符串蒙过。
- **`finalize` 无 checkout 是硬约束**：脚本只能是 bash + 内联 `node -e`，不能 `require('yaml')`、不读仓库内 notes（读的是公开 body），也不能把判定抽成仓库脚本文件。
- **测试必须实跑 workflow 原文**：链接抽取 / 判定只有步骤 `run` 一份实现，测试写盘后 `bash` 实跑（桩 `gh` + `FIXTURE body`），三个失败分支是被执行证明；若在测试里另写一份判定逻辑，就会出现「门禁绿而线上脚本坏」的假绿。
- **同一提交纪律**：`release.yml` 由 tag commit 取用，notes 修正与链接门必须落在同一个进入 `v0.2.16` tag 的提交上，发版前不得只合一半。
