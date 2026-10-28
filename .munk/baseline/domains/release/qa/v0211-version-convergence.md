# v0.2.11 版本收敛与发布面同批对齐（收敛轮，单提交）

- WI：`wi_ws_aefe3a384e8119bb`（`key: v0211-version-convergence`）
- 域：`release`（版本收敛轮：bump 待发版本 + 发布说明 + CHANGELOG 折叠 + dispatch 默认 tag + 发布文档锚点；不是发版 / 收尾轮）
- 来源：`.munk/changes/wi_ws_aefe3a384e8119bb/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合）
- 提交：`01c791d1e849b971aa33b70af195eb4fa9417876`（父基线 `b516d45509071ff34c021fa31d1720da2ef22f7a`，即 v0.2.10 键盘口径修正的 delivery merge）；单提交，6 文件 +47/−7

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-pkg-version | `package.json#version === "0.2.11"`；`git show HEAD -- package.json` 只有 `- "version": "0.2.10"` / `+ "version": "0.2.11"` 一组行 | 满足 |
| ac-notes-exists | `docs/release-notes/v0.2.11.md` 存在，`wc -m` = 2266（> 1000），首行 `# OpenCompare v0.2.11 发布说明` | 满足 |
| ac-notes-whitelist | 13 项全命中：`指示条` 11 / `四态` 4 / `same` `added` `removed` `modified` 各 1 / `滚动` 3 / `点选` 4 / `跳转` 4 / `minimap` 1 / `不新增扫描` 1 / `不改对比与合并算法` 1 / `升级方式` 1 | 满足 |
| ac-notes-measured-numbers | `/\d+(?:[.,]\d+)?\s*(?:GiB\|MiB\|GB\|MB)/g` 输出顺序恰为 `451.6 MiB` / `909.0 MiB` / `2.25 GiB` / `2.5 GiB` / `9.29 GiB` / `9.62 GiB`（六项、各一次、无 `MB`）；`trun_08764efa44c39426` 与 `2bcdc53e` 各 2 次 | 满足 |
| ac-notes-negative | `200,000` / `10 MB` / `本版新增` / `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` / `Full Changelog` / `releases/tag/v0.2.10` 均 0 命中；`\b[0-9a-f]{40,64}\b` 0 命中 | 满足 |
| ac-notes-ci-fix | 树内 `src/renderer/src/components/DiffRuler.scale.test.tsx` grep `30_000` / `30000` / `30,000` 均 0 命中 → 走「无 `30_000`」分支：notes 中 `30,000` / `30_000` / `6,816` / `30 秒` 均 0 命中，且「CI 测试稳定性修复未随本项落地」列入交付说明未纳入项 | 满足（无 `30_000` 分支） |
| ac-changelog-fold | `grep -n '^## '` 首个为第 5 行 `## v0.2.11`，次为第 25 行 `## v0.2.9`；`[## v0.2.11, ## v0.2.9)` 切片内二级标题序列恰为 `['v0.2.11']`（无 `## v0.2.10`）；v0.2.10 段的 `### 新增` / `### 不做的事` / `### 升级方式` 原样并入 | 满足 |
| ac-changelog-content | v0.2.11 段含 `### 升级方式` 与 12 项短语（`指示条` 6 / `四态` 3 / 四态英文词各 1 / `滚动` 2 / `点选` 1 / `跳转` 1 / `minimap` 1 / `不新增扫描` 1 / `不改对比与合并算法` 1）；段内 `GiB\|MiB\|GB\|MB` 数字、40–64 位 hex、`TODO`/`TBD`/`FIXME` 合计 0 命中 | 满足 |
| ac-changelog-history-intact | `git diff 01c791d~1 01c791d -- CHANGELOG.md` 仅两处：第 5 行标题行与 `### 升级方式` 段的安装包版本串；`## v0.2.9`（第 25 行）之后零增删行 | 满足 |
| ac-default-tag | `release.yml` 第 17 行 `default: 'v0.2.11'`；全文 `--notes-file` 2 次、`--generate-notes` 0 次；该文件 diff 仅 `default:` 一行 | 满足 |
| ac-docs-anchors | `docs/release-process.md` 含 `default: 'v0.2.11'` 且 `README 第 5 行` / `不改这一行` / `latestPublishedTag` / `收尾提交` 各 ≥1；`docs/release-signing.md` 含 `` 默认 `v0.2.11` ``、``已合入 `main` ``、`docs/release-notes/v0.2.11.md`、`当前状态：v0.2.9 已发布`、`正式版发布姿态（v0.2.9）`、`docs/release-evidence/v0.2.9.md`（2 处）、`tag 之后的修复由 v0.2.9 承接`；该文件 diff 仅第五节两行 | 满足 |
| ac-draft-notes-unlinked | `docs/release-notes/v0.2.10.md` 仍存在且 `git diff` 为空（零 diff）；grep `docs/release-notes/v0.2.10.md` 在 `README.md` / `README.zh-CN.md` / `CHANGELOG.md` / `docs/release-process.md` / `docs/release-signing.md` 命中 0 个文件 | 满足 |
| ac-latest-anchor-intact | `src/main/release-packaging.test.ts` 第 57 行 `latestPublishedTag = 'v0.2.9'`、第 60 行 `previousPublishedTag = 'v0.2.8'`、第 63 行 `publishedTags` 声明未动，该文件 diff 行数 0；`pnpm test src/main/release-packaging.test.ts` → 1 file / 199 passed（1.15s），版本门仍 `expect(latestPublishedTag).not.toBe(currentTag)` | 满足 |
| ac-zero-diff-holds | `git diff --name-only 01c791d~1 01c791d` 不含 `README.md`、`README.zh-CN.md`、`docs/release-evidence/**` | 满足 |
| ac-single-commit | 本项恰一条 commit `01c791d`；文件集 ⊆ 范围清单（6 文件）；不含 `src/renderer/`、`vitest.config.mts`、`electron-builder.yml` | 满足 |
| ac-gates-green | `.munk/runs/run_ws_766ad217ef396009/code-gates/attempts/001`：9 道门全 `passed` / exit 0（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）；`pnpm test` 69 files / 1104 passed + 1 skipped（1105），29.48s | 满足 |
| ac-delivery-notes | 见下方「交付说明」：改动文件清单、派生断言零改动及原因、`pnpm test` 全量与 `release-packaging.test.ts` 的 files / passed / 耗时、未纳入项四项 | 满足 |

## 交付说明

**改动文件（6）**：`package.json`（仅 `version`）、`CHANGELOG.md`（`## v0.2.10` → `## v0.2.11` + 升级方式版本串）、`docs/release-notes/v0.2.11.md`（新增，2266 字符）、`docs/release-process.md`（`default:` 摘录）、`docs/release-signing.md`（第五节默认 tag + 收敛段两句）、`.github/workflows/release.yml`（dispatch 默认 tag 一行）。

**派生断言是否改动**：**零改动**。`src/main/release-packaging.test.ts` 的版本字面量全部经 `pkg.version` / `currentTag` / `latestPublishedTag` / `previousPublishedTag` 派生，bump `0.2.10 → 0.2.11` 后自动跟随，无需重定标；`publishedTags` 不含 v0.2.10（从未发出），版本门仍是 `not.toBe(currentTag)` + `isTagBefore(latest, current)`，未翻面。

**测试**：`pnpm test`（code_gates `test` 门）= 69 files / 1104 passed + 1 skipped（共 1105），耗时 29.48s；`pnpm test src/main/release-packaging.test.ts` = 1 file / 199 passed，耗时 1.15s（该文件零 diff，含 `documents the current release notes with the ruler change and its stated limits`）。

**未纳入项**：
1. CI 测试稳定性修复未随本项落地（`DiffRuler.scale.test.tsx` 无 `30_000` 超时，notes 按无超时分支不写 `30,000` / `6,816` / `30 秒`）。
2. 发版动作（tag / push / dispatch `Release` / 创建或修改 Release / 资产上传）。
3. README 版本表与两版第 5 行状态（仍是 `v0.2.9`）。
4. `docs/release-evidence/v0.2.11.md` 未新建（发布期才有的事实，本项不写）。

## 最近执行

- workItemId: wi_ws_aefe3a384e8119bb
- at: 2026-10-29
- status: pass
- note: 18 条 AC 全部满足，无偏差记录。本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_766ad217ef396009/code-gates/attempts/001`，全 exit 0；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105，`src/main/release-packaging.test.ts` 199 passed）。备注：notes 为 v0.2.10 未发出草稿的纯版本串替换（替换后 `diff` 为空、字符数同为 2266），本轮不新增用户可见内容；CI 稳定性修复未落地，按 AC 的「无 `30_000`」分支处理。
