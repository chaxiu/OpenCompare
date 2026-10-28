# v0.2.10 Release 正文改读 `docs/release-notes/v<version>.md`（`--notes-file` + fail-closed）

- WI：`wi_ws_4a1c63b94c8b4652`（`key: v0210-release-body-from-notes-file`）
- 域：`release`（发布流水线契约项；不是版本收敛轮、也不是发布收尾轮）
- 来源：`.munk/changes/wi_ws_4a1c63b94c8b4652/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）
- 提交：本 worktree 单提交（见交付说明；父基线 `4166c9b9609ba0f4f03e562dfb18fe7e08ec9509`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-baseline | 父基线 HEAD `4166c9b9609ba0f4f03e562dfb18fe7e08ec9509`（`munk delivery: merge wi_ws_07837ab0ba491eb0`）；`package.json#version = 0.2.10`；`release.yml:17` `default: 'v0.2.10'`；`docs/release-notes/v0.2.10.md` 存在 | 满足 |
| ac-version-derived | `release.yml` 预创建步骤第 203 行 `version="$(node -p "require('./package.json').version")"`；该步骤 `run` 文本不含 `v0.2.9` / `v0.2.10`（测试 `expect(preCreate).not.toContain('v0.2.9')` / `... 'v0.2.10')`） | 满足 |
| ac-notes-path | 第 204 行 `notes_file="docs/release-notes/v${version}.md"`；测试以 `indexOf` 断言 `notes_file` 派生先于 `cat "${notes_file}"` | 满足 |
| ac-notes-file-flag | 第 235-237 行 `gh release create "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --title "${RELEASE_TAG}" --draft --notes-file "${body_file}"`；body 文件 `${RUNNER_TEMP}/release-body-${RELEASE_TAG}.md`（第 221 行，仓库外） | 满足 |
| ac-no-generate-notes | 该步骤 `run` 文本 `--generate-notes` 0 命中（测试 `expect(preCreate).not.toContain('--generate-notes')`）；全文件其余位置不受约束 | 满足 |
| ac-fail-closed-missing | 第 205-208 行缺文件守卫 `::error::Missing release notes ${notes_file}` + `exit 1`；第 209-212 行判空守卫（`tr -d '[:space:]'`）`::error::Release notes ${notes_file} are empty` + `exit 1`；两条守卫 `indexOf` 均小于 `gh release create` / `gh release edit`，缺文件守卫先于判空守卫，各自片段含 `exit 1` | 满足 |
| ac-full-changelog | 第 225 行 `echo "**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${last}...${RELEASE_TAG}"`；第 214-216 行 `gh release list --exclude-drafts --limit 100 --json tagName --jq "[.[] \| select(.tagName != \"${RELEASE_TAG}\")][0].tagName // \"\""`；取不到时第 217-220 行 `::error::Could not resolve the previous published release…` + `exit 1`；解析先于 Full Changelog 行、先于 create | 满足 |
| ac-draft-only | 第 240-250 行：`if [ "$(gh api "repos/${GITHUB_REPOSITORY}/releases/${ids[0]}" --jq '.draft')" = "true" ]` → `gh release edit … --notes-file "${body_file}"`；否则 `already public; leaving its body untouched`（不写正文）；`--notes-file` 在步骤内恰 2 次（测试 `match(/--notes-file/g)?.length === 2`） | 满足 |
| ac-finalize-unchanged | 第 692 行仍为 `run: gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`；测试 `expect(finalizeStep("Make the tag's release public")?.run).toBe('gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest')` | 满足 |
| ac-tests-recalibrated | `pre-creates a single draft release before the matrix packages` 旧 `--generate-notes` 正向正则改为步骤级 `--notes-file` 正断言，新增该步骤 `--generate-notes` 负断言，保留 `**Full Changelog**` / `compare/` 断言与既有 `GH_REPO` / `gh api --method DELETE` 断言 | 满足 |
| ac-tests-added | 新增 `describe('release body from repository notes')` 6 个 `it`：version 派生、notes 路径与 body 文件、缺失/空 fail-closed（含顺序）、Full Changelog 与 `${last}` 取不到 fail-closed、draft-only 写正文（含 `--notes-file` 计数）、finalize body-free | 满足 |
| ac-tests-no-regression | `it(` 条数只增不减：`^\s*it(` 193 → 199、任意 `it(` 出现 235 → 241；无 `toBeTruthy()` 顶替、无正则放宽、无注释断言、无 `skip` / `todo`；`release-packaging.test.ts` 199 tests 全通过 | 满足 |
| ac-b-gates-intact | `release.yml` `default: 'v0.2.10'` 一行未动（diff 不含该行）；version gate（`not.toBe(currentTag)` / `isTagBefore(latestPublishedTag, currentTag) === true` / `lastReleasedNotesPath !== releaseNotesPath`）、`1,325 MiB` / `764.9 MiB` / `['10 MB']` 白名单、v0.2.9 notes 断言零改动即通过 | 满足 |
| ac-gates-green | `.munk/runs/run_ws_5f9af79533e95c32/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 九门 exit 0；`pnpm test` 66 files / 1074 passed + 1 skipped（1075） | 满足 |
| ac-scope-two-files | `git diff --numstat` 恰为 `.github/workflows/release.yml` +37/−1、`src/main/release-packaging.test.ts` +89/−2；`package.json` / `CHANGELOG.md` / `docs/release-notes/**` / `docs/release-evidence/**` / `electron-builder.yml` / 两版 README / 其余 `src/**` 零 diff | 满足 |
| ac-no-release-actions | 未打 tag、未 push、未 publish、未创建 / 编辑任何真实 Release、未 dispatch 生产发布（本项只有源码 / 工作流 / 测试改动） | 满足 |
| ac-delivery-note | 交付说明写明：正文来源路径 `docs/release-notes/v${version}.md` + `**Full Changelog**` 行、重定标 1 条 + 新增 6 条断言名单、九门清单与结果、commit sha，以及可核口径「v0.2.10 起发版后 Release 正文应与 `docs/release-notes/v0.2.10.md` 一致（另有末尾 Full Changelog 行）」 | 满足 |

## 最近执行

- workItemId: wi_ws_4a1c63b94c8b4652
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_5f9af79533e95c32/code-gates/attempts/001`；`pnpm test` 66 files / 1074 passed + 1 skipped / 1075）。静态核对：`git diff --numstat` 恰为 prd 允许的两个文件（`release.yml` +37/−1、`release-packaging.test.ts` +89/−2），两版 README / `docs/release-notes/**` / `docs/release-evidence/**` / `package.json` / `CHANGELOG.md` / `electron-builder.yml` 零 diff。契约：正文来源由 `--generate-notes` 换为 `--notes-file`（`docs/release-notes/v${version}.md` + `**Full Changelog**` 行，`${last}` 取 `gh release list --exclude-drafts` 并过滤当前 tag），缺文件 / 空正文 / 取不到上一版三处 fail-closed，已公开 Release 不写正文，`finalize` 逐字未变。边界：未打 tag、未 push、未 dispatch、未打包 / 公证；本项补上了上一轮（`wi_ws_07837ab0ba491eb0`）明确缺位的 C 波前置条件，正文实际效果待下一次真实发版体现。
