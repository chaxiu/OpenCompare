# Release 正文改由发布流水线取自 docs/release-notes/v<version>.md，缺失/空正文 fail-closed

## 基线（已核，施工前复核一次）

- `git rev-parse HEAD` = `4166c9b9609ba0f4f03e562dfb18fe7e08ec9509`（`munk delivery: merge wi_ws_07837ab0ba491eb0`），代码提交 `60279d4`（v0.2.10 版本收敛）。
- `package.json#version` = `0.2.10`；`.github/workflows/release.yml:17` 的 dispatch default = `'v0.2.10'`；`docs/release-notes/v0.2.10.md` 存在。
- 现状：`.github/workflows/release.yml` 的 `Pre-create the tag's release`（第 195 行起）用 `gh release create "${RELEASE_TAG}" --repo … --title … --draft --generate-notes` 创建 draft，全文无 `--notes-file`，无任何 `docs/release-notes/` 引用；`finalize` 的 `Make the tag's release public` 为 `gh release edit "${RELEASE_TAG}" --repo … --draft=false --latest`。
- 若复核发现 HEAD 不是上句基线（仍是 0.2.9 / default v0.2.9 / 无 v0.2.10 notes），停手并 `munk_report_owner` 报基线错误，不得按旧文件改。

## 范围

只改两个文件，且只改这一处契约：

1. `.github/workflows/release.yml` — `gates` job 的 `Pre-create the tag's release` 步骤（该 job 已 checkout `refs/tags/<tag>`，发布点上的 `docs/release-notes/` 可读）：
   - `version` 从 `package.json#version` 派生（`node -p "require('./package.json').version"`，与既有 `Assert the tag matches package.json version` 步骤同一派生口径），正文路径 `docs/release-notes/v${version}.md`。
   - fail-closed：文件不存在，或去掉首尾空白后为空 → `::error::` + `exit 1`，该路径绝不走到 `gh release create` / `gh release edit`，不创建也不公开发布空正文；不得静默降级回 `--generate-notes`。
   - 正文组装：临时 body 文件 = 发布点 notes 文件全文 + 空行 + 一行 `**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${last}...${RELEASE_TAG}`；`${last}` 取当前 tag 之前的最新已发布 Release（`gh release list --exclude-drafts`，过滤掉 `${RELEASE_TAG}`），取不到时 fail-closed，不编造。
   - 无同名 Release 时：`gh release create "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --title "${RELEASE_TAG}" --draft --notes-file <body>`。
   - 已有同名 Release 时：保留既有「多条只留第一条 + `gh api --method DELETE` prune 其余」逻辑；仅当保留的那条仍是 draft 时用 `gh release edit … --notes-file <body>` 更新正文；已公开（非 draft）Release 不写正文，v0.2.1–v0.2.9 历史零改动。
   - 正文路径不再出现 `--generate-notes`。
   - `finalize` 的 `Make the tag's release public` 保持 `gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`，不加任何正文参数。
   - 不动 `release.yml:17` 的 `default: 'v0.2.10'`，不动 job 结构、步骤顺序、矩阵、资产校验、`Verify the tag has exactly one public release`、Secret 接线。

2. `src/main/release-packaging.test.ts` — 只加断言，外加旧契约必要重定标：
   - 重定标（必要，不算放宽）`pre-creates a single draft release before the matrix packages` 中的 `--generate-notes` 正向断言：改为 `--notes-file` 正断言 + 「正文来源步骤不含 `--generate-notes`」负断言（限定在该步骤的 `run` 文本，不做全文件误杀），保留 `**Full Changelog**` / `compare/` 行断言。
   - 新增断言：`version` 从 `package.json` 派生（含 `require('./package.json').version` 或等价派生）、正文路径 `docs/release-notes/v${version}.md`、缺失/空正文 fail-closed（`::error::` + `exit 1`，且判空在 `gh release create` 之前）、`**Full Changelog**` 指向 `${GITHUB_REPOSITORY}/compare/${last}...${RELEASE_TAG}`、draft-only 写正文（`gh release edit` 的 `--notes-file` 仅出现在 draft 分支）、该步骤文本不含 `v0.2.9` / `v0.2.10` 内联版本字面量。
   - 既有断言零改动、零删除、零放宽；`it(` 用例数不减少。

## 验收

- ac-baseline: 交付 commit 的父基线为 B 合入后的 main —— `package.json#version === '0.2.10'`、`release.yml` 含 `default: 'v0.2.10'`、`docs/release-notes/v0.2.10.md` 存在；交付说明写明开工时 `git rev-parse HEAD`。
- ac-version-derived: Release 预创建步骤内出现从 `package.json` 读取版本（`node -p "require('./package.json').version"` 或等价），且该步骤 `run` 文本不含 `v0.2.9` / `v0.2.10` 字面量。
- ac-notes-path: 该步骤按 `docs/release-notes/v${version}.md` 拼正文路径（不是写死版本名）。
- ac-notes-file-flag: 该步骤的 `gh release create` 分支用 `--notes-file` 传入正文，且仍保留 `--repo "${GITHUB_REPOSITORY}"` 与 `--draft`。
- ac-no-generate-notes: 该步骤 `run` 文本不出现 `--generate-notes`（全文件其余位置不受约束）。
- ac-fail-closed-missing: notes 文件缺失或 trim 后为空时打印 `::error::` 并 `exit 1`；该判空分支位于本步骤任何 `gh release create` / `gh release edit` 调用之前（测试以字段顺序断言）。
- ac-full-changelog: 组装出的正文末尾含 `**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${last}...${RELEASE_TAG}`；`${last}` 由 `gh release list --exclude-drafts` 取并过滤掉当前 `${RELEASE_TAG}`，取不到时 `::error::` + `exit 1`。
- ac-draft-only: 同名 Release 已存在时，`gh release edit … --notes-file` 只在保留项为 draft 的分支执行；已公开 Release 不进入写正文路径（v0.2.1–v0.2.9 历史正文零改动）。
- ac-finalize-unchanged: `finalize` 的 `Make the tag's release public` 仍严格为 `gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`，不含 `--notes-file` / `--generate-notes`。
- ac-tests-recalibrated: `pre-creates a single draft release before the matrix packages` 用例改为 `--notes-file` 正断言 + 该步骤 `--generate-notes` 负断言，并仍断言 `**Full Changelog**` 与 `compare/`。
- ac-tests-added: 新增用例覆盖 version 派生、notes 路径、缺失/空 fail-closed、Full Changelog、draft-only 五类断言。
- ac-tests-no-regression: 除上述必要重定标外，`release-packaging.test.ts` 既有断言无删除、无降级为 `toBeTruthy()`、无正则放宽、无注释掉；`it(` 数量不少于改动前（当前 3347 行文件，改动前先记录 `grep -c "  it("` 数值）。
- ac-b-gates-intact: B 的 `release.yml:17` `default: 'v0.2.10'`、`release-process.md` 的 `default: 'v0.2.10'`、version gate（`latestPublishedTag !== currentTag`、`isTagBefore(latestPublishedTag, currentTag) === true`、`lastReleasedNotesPath !== releaseNotesPath`）、MiB/GiB 白名单、v0.2.9 notes 断言全部保持原样通过。
- ac-gates-green: `.munk/code-gates.json` 九道门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿，`git status` 干净。
- ac-scope-two-files: 该提交只改动 `.github/workflows/release.yml` 与 `src/main/release-packaging.test.ts`。
- ac-no-release-actions: 未打 tag、未 push、未 publish、未创建/编辑任何真实 Release、未 dispatch 生产发布。
- ac-delivery-note: 交付说明写明改后的正文来源路径、新增/重定标断言名单、跑过的门禁清单、commit sha，以及可核口径「v0.2.10 起发版后 Release 正文应与 `docs/release-notes/v0.2.10.md` 一致（另有末尾 Full Changelog 行）」。

## 非目标

- 不改 `package.json`、`CHANGELOG.md`、`README.md` / `README.zh-CN.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/release-process.md`、`electron-builder.yml`、产品源码（`src/` 非测试文件）。
- 不重写 / 不追溯 v0.2.1–v0.2.9 任何已公开 Release 正文，不动已公开 tag / Release / 资产。
- 不改发布触发条件、job 结构、矩阵、资产校验与上传、`Verify the tag has exactly one public release`、依赖与 Secret 接线；不改 `latestPublishedTag` / `previousPublishedTag` / `publishedTags` 常量与任何随发布事实翻面的断言。
- 不新增依赖，不改快照格式、对比 / 合并 / 扫描算法与四态语义。
- 不做 UI / 浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`，运行时验收归 product-qa）。
- 不碰 `AGENTS.md` 与 `goal.md`；不改 `docs/release-process.md` 的流程说明（正文来源说明属本次契约变化，若确需一句同步说明仍不在本项允许改面内）。

## 实现约束

- 只允许编辑上述两个文件；其它路径一律不动（`git status --porcelain` 仅这两条）。
- 测试里用既有 `gateStep('Pre-create the tag's release')?.run` / `gatesSteps` / `finalizeStep` 取步骤文本做作用域断言，避免全文件正则误杀（文件中 `gatesSteps`、`gateStep`、`finalizeStep` 已存在，第 145–160 行）。
- 断言用 `toContain` / `toMatch` 做确定性文本契约；判空在创建之前这类顺序断言用 `indexOf` 比较位置，不要写成模糊的「包含」。
- 新增测试用例不得引用真实 tag / 不 spawn `gh`（既有 `never spawns gh or a mutating command in the repository root` 约束继续成立，第 698 行）。
- shell 侧保持 `bash`（`readarray` 已用，macOS runner 上是 bash 5 / ubuntu bash，`windows-latest` 不跑 gates），不引入 `jq` 之外的依赖；`gh release list` 用 `--json tagName --jq` 取值。
- 临时 body 文件写在工作区外（如 `${RUNNER_TEMP}`），避免污染仓库与后续 `git status`。
- 交付前记录改动前后 `it(` 计数与九道门结果，作为 ac-tests-no-regression / ac-gates-green 的证据写进交付说明。
