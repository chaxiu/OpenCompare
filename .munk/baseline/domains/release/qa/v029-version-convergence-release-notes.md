# v0.2.9 版本收敛：版本号 / 发布姿态断言 / 发布说明 / 默认 tag 单提交对齐

- WI：`wi_ws_e412c1de377c9e45`
- 域：`release`（收敛轮，不是收尾轮；`latestPublishedTag` 保持 `v0.2.8` 且必须落后 `currentTag`）
- 来源：`.munk/changes/wi_ws_e412c1de377c9e45/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-version-029 | `package.json` diff 仅 `"version": "0.2.8"` → `"0.2.9"` 一行，依赖 / 脚本零改动 | 满足 |
| ac-no-new-literals | `grep -c '0\.2\.9' src/main/release-packaging.test.ts` = 0 | 满足 |
| ac-latest-trails-current | `release version gate`：`expect(latestPublishedTag).not.toBe(currentTag)` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`；`previousPublishedTag` 两条 `isTagBefore` 保留 | 满足（`release-packaging.test.ts` L604-610） |
| ac-notes-anchors-distinct | `anchors the newest published release notes at the shipped tag`：`expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)`，两份文件存在且 H1 各自含 `v0.2.8` / `currentTag` | 满足（同文件 L1442 区块） |
| ac-changelog-v028-reanchored | `documents … in the last released entry`：起点改用 `## ${latestPublishedTag}`、终点 `## v0.2.7`；`MB` 集合 `['10 MB']`、含 `latestPublishedTag` 与 `https://github.com/munk-sh/open-rebuilds` | 满足 |
| ac-changelog-v029-top-entry | `drops the never-published entry …` 切片终点改 `## ${latestPublishedTag}`，标题集合仍为 `[currentTag]`；新增 `covers the current changelog entry …` 以 `[## currentTag, ## latestPublishedTag)` 切片断言非空 | 满足 |
| ac-changelog-order-pinned | 排序用例新增 `const latestPublished = changelog.indexOf(\`## ${latestPublishedTag}\`)`，链为 `current < latestPublished < v0.2.7 < v0.2.6 < v0.2.5 < v0.2.4 < v0.2.2 < v0.2.0 < v0.1.2` | 满足 |
| ac-changelog-v029-content | `covers the current changelog entry with the four shipped change areas` 断言 `### 升级方式` / `导出` / `取消` / `标签页` / `标题` / `原子` / `磁盘空间不足` / `只读` / `200,000` / `10 MB` | 满足 |
| ac-changelog-no-ghost | 全仓（`README*` / `CHANGELOG.md` / `docs/`）`## v0.2.3`、`release-notes/v0.2.3`、`releases/tag/v0.2.3` 命中数 0 | 满足 |
| ac-release-notes-029-content | `docs/release-notes/v0.2.9.md` H1 含 `v0.2.9`，正文含 `HTML` / `自包含` / `内联 CSS` / 无 JS / 无外链 / `http(s)` / `file://` / `隐藏本机路径` / `200,000` / `10 MB` / 四态计数 / `<html lang>` / `Open Rebuilds` / `https://github.com/munk-sh/open-rebuilds` / `升级方式` / `v0.2.8` | 满足 |
| ac-release-notes-029-hygiene | 该文件 `待验证`/`预计通过`/`应该通过`/`TODO`/`TBD`/`FIXME`/`待发布`/`MiB`/`GiB`/`GB` 命中 0；64 位 hex 命中 0；`MB` 数字集合 = `['10 MB']` | 满足 |
| ac-caps-restated-not-new | 新增 `restates the report caps …` 用例：两份文案中含 `200,000` / `10 MB` 的段落必须同时含 `沿用` 与 `latestPublishedTag`（`v0.2.8`），且不含 `本版新增` | 满足 |
| ac-dispatch-defaults | `release.yml` `default: 'v0.2.9'`、`docs/release-process.md` `default: 'v0.2.9'`、`docs/release-signing.md` `默认 \`v0.2.9\``，由测试 `default: '${currentTag}'` / `默认 \`${currentTag}\`` 断言；`default: 'v0.2.8'` 在受扫描的配置与文档（排除 `.munk/**` 历史基线）中命中 0 | 满足 |
| ac-signing-posture-kept | 第 5 行 `当前状态：v0.2.8 已发布`、第三节 `正式版发布姿态（v0.2.8）`、`docs/release-notes/v0.2.8.md`、`docs/release-evidence/v0.2.8.md` 逐字保留；第五节新增「`v0.2.9` 的版本收敛已合入 `main`，发布说明见 `docs/release-notes/v0.2.9.md`」；全篇不含 `待发布` | 满足 |
| ac-readme-untouched | `git diff --name-only` 不含任何 README；两版第 5 行仍为 `v0.2.8`，全文零改动 | 满足 |
| ac-scope-closed | `git diff --name-only` = `package.json`、`CHANGELOG.md`、`docs/release-process.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts` + 新增 `docs/release-notes/v0.2.9.md`（恰为 prd 允许集合）；`docs/release-evidence/**` 与 `src/` 其它文件零改动 | 满足 |
| ac-six-gates-green | `.munk/runs/run_ws_d22d1533781453d4/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test 六门 exit 0 | 满足 |
| ac-extra-gates-not-red | 同 attempt：test-compare-request / cancel-gate / memory-gate exit 0（九门全绿） | 满足 |

## 最近执行

- 时间：2026-10-27（同 WI code_gates attempt 001）
- 九门：install 0 / lint 0 / typecheck 0 / build 0 / build-web 0 / test 0 / test-compare-request 0 / cancel-gate 0 / memory-gate 0
- `pnpm test`：62 files / 1011 passed + 1 skipped / 1012；`src/main/release-packaging.test.ts` 185 用例、`src/main/release-evidence.test.ts` 34 用例均绿
- 证据路径：`.munk/runs/run_ws_d22d1533781453d4/code-gates/attempts/001/manifest.json`
- 本 WI `needSelfTest=false`，UI 自测跳过；无 tag / push / dispatch / 打包 / 公证动作（非目标）
