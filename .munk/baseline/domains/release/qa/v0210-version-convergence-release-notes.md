# v0.2.10 版本收敛：版本号 / 发布说明 / dispatch 默认 tag / 发布门禁翻回 latest 落后 current

- WI：`wi_ws_07837ab0ba491eb0`（`key: v0210-version-converge`）
- 域：`release`（收敛轮，不是收尾轮；`latestPublishedTag` 固定 `v0.2.9` 且必须落后 `currentTag = v0.2.10`）
- 来源：`.munk/changes/wi_ws_07837ab0ba491eb0/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）
- 提交：`60279d44edf5a4ac19b39e89710519ced123f4de`（单提交）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-pkg-version | `package.json` diff 恰为 `"version": "0.2.9"` → `"0.2.10"` 一行（`git show --numstat` = +1/−1），依赖 / scripts / 包元数据零改动 | 满足 |
| ac-latest-anchor | `src/main/release-packaging.test.ts` L57 `latestPublishedTag = 'v0.2.9'`、L60 `previousPublishedTag = 'v0.2.8'`、L63 起 `publishedTags` 九项且 L69 显式 `'v0.2.6'` | 满足 |
| ac-version-gate-flipped | 同文件 L610-611 `expect(latestPublishedTag).not.toBe(currentTag)` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`；`isTagBefore(previousPublishedTag, latestPublishedTag)` / `...(previousPublishedTag, currentTag)` 仍在；`expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)` 同时存在；全文无 `expect(latestPublishedTag).toBe(currentTag)`、无 `isTagBefore(latestPublishedTag, currentTag)).toBe(false`；`pnpm test` 通过 | 满足 |
| ac-changelog-order | `CHANGELOG.md` 行号：`## v0.2.10` 5 < `## v0.2.9` 25 < `## v0.2.8` 46 < `## v0.2.7` 62；测试排序链恢复递增 | 满足 |
| ac-changelog-slices | 测试 current 段切片终点改为 `## ${latestPublishedTag}`（`## v0.2.9`，不再用 `## v0.2.8`），段内二级标题集合仍恰为 `[currentTag]`；`## v0.2.9` 段文本未改动（该段 diff 为空） | 满足 |
| ac-changelog-entry | `## v0.2.10` 段含 `指示条`、四态（`same` / `added` / `removed` / `modified`）、`滚动`、`点选`/`跳转`、否定式 `minimap`、不新增 `扫描`、不改 `算法`、`### 升级方式`；该段 `TODO`/`TBD`/`FIXME`、40/64 位 hex、`GiB`/`MiB`/`GB`/`MB` 数字均 0 命中 | 满足 |
| ac-notes-v0210-exists | `docs/release-notes/v0.2.10.md` 26 行，H1 `# OpenCompare v0.2.10 发布说明`，含指示条 / 四态 / 滚动 / 点选 / minimap / 扫描 / 算法短语与 `## 升级方式`；第 22 行同段含「L1 前待实机」与 `product-qa`；`GiB|MiB|GB|MB` 数字集合为空、40/64 位 hex 0 命中、无 `待验证`/`预计通过`/`应该通过`/`TODO`/`TBD`/`FIXME` | 满足 |
| ac-v029-anchored | v0.2.9 notes / CHANGELOG / evidence 断言仍锚 `latestPublishedTag` 或显式历史字面量；`docs/release-notes/v0.2.9.md` 未改动，`GiB|MiB|GB` 集合仍 `['1,325 MiB', '764.9 MiB']`、`MB` 集合仍 `['10 MB']`；「沿用 v0.2.8 口径」断言仍落 v0.2.9 段与 notes，v0.2.10 文案未把上限写成本版新增 | 满足 |
| ac-dispatch-defaults | `grep -c "default: 'v0.2.10'"` = `release.yml` 1 / `release-process.md` 1；同两文件 `default: 'v0.2.9'` = 0 | 满足 |
| ac-release-yml-body-untouched | `release.yml` diff 仅 `workflow_dispatch.inputs.tag.default` 一行（+1/−1）；`gh release create` / `gh release edit` / `--generate-notes` 相对基线逐字不变（本分支无 `--notes-file`，见注 ①） | 满足 |
| ac-signing-default | 第五节含 `` 默认 `v0.2.10` ``、`docs/release-notes/v0.2.10.md`、`已合入 \`main\``；第 5 行仍 `当前状态：v0.2.9 已发布`、第三节仍 `正式版发布姿态（v0.2.9）`、`docs/release-notes/v0.2.9.md` / `docs/release-evidence/v0.2.9.md` / `tag 之后的修复由 v0.2.9 承接` 逐字保留，全文无 `当前状态：v0.2.10` | 满足 |
| ac-published-facts-untouched | `git diff --name-only 4d329c1 60279d4` 不含任何 README；两版第 5 行仍 `v0.2.9`（`releases/tag/v0.2.9` 各 1 次）；`docs/release-notes/v0.2.9.md` 与 `docs/release-evidence/v0.2.9.md` 零 diff | 满足 |
| ac-test-integrity | `it(` 条数只增不减（`^\s*it(` 191 → 193；任意 `it(` 出现 232 → 235）；无 `toBeTruthy()` 顶替、无注释断言、无放宽匹配（`1,325 MiB` / `764.9 MiB` 白名单与 `[0-9a-f]{64}` 严格集原样）、无 `skip` / `todo`；C 波正文来源类既有断言未删 | 满足 |
| ac-c-wave-precondition | 开工基线 `4d329c1` 与本次提交的 `release.yml` 仍为 `gh release create … --generate-notes`，**无 `--notes-file`**，即 C 波未合入；按要求未改该段、未自行补写（交付说明如实写明） | 满足（C 缺失，如实声明） |
| ac-diff-scope | `git diff --name-only 4d329c1 60279d4` 恰为 `package.json` / `CHANGELOG.md` / `docs/release-notes/v0.2.10.md` / `docs/release-process.md` / `docs/release-signing.md` / `.github/workflows/release.yml` / `src/main/release-packaging.test.ts` | 满足 |
| ac-gates-green | `.munk/runs/run_ws_b65193f9778919ef/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 九门 exit 0 | 满足 |
| ac-clean-tree-and-sha | 交付时 `git status --porcelain` 为空（提交后仅基线折叠改动，见下「最近执行」），commit `60279d44edf5a4ac19b39e89710519ced123f4de` 单提交；未执行 tag / push / publish / gh release 写操作 | 满足 |

## 最近执行

- workItemId: wi_ws_07837ab0ba491eb0
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_b65193f9778919ef/code-gates/attempts/001`；`pnpm test` 66 files / 1068 passed + 1 skipped / 1069）。静态核对：`git diff --name-only 4d329c1 60279d4` 恰为 prd 允许的七项，numstat = `package.json` +1/−1、`CHANGELOG.md` +20/−0、`docs/release-notes/v0.2.10.md` +26/−0、`docs/release-process.md` +1/−1、`docs/release-signing.md` +2/−2、`.github/workflows/release.yml` +1/−1、`src/main/release-packaging.test.ts` +118/−38；两版 README、`docs/release-evidence/**`、`electron-builder.yml`、`AGENTS.md` 零 diff。锚点：`latestPublishedTag = 'v0.2.9'` / `previousPublishedTag = 'v0.2.8'` / `publishedTags` 九项，版本门已由 `latest === current` 翻回 `not.toBe` + `isTagBefore(latest, current) === true`，`lastReleasedNotesPath !== releaseNotesPath`。边界：未打 tag、未 push、未 dispatch、未打包 / 公证，未新增依赖、未改 `pnpm` 脚本与门禁配置；C 波（`--notes-file` 正文来源）在本分支不存在，按 prd 未补写。
