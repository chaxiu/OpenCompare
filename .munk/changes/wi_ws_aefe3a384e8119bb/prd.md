# 版本收敛到 0.2.11（独占发布文件，单 commit）

## 范围

把「从未发布」的 v0.2.10 收敛成待发的 v0.2.11，只动发布侧文件，产出一条 commit：

- `package.json#version`：`0.2.10` → `0.2.11`（仅该字段）。
- 新建 `docs/release-notes/v0.2.11.md`：>1000 字符；正文 = 现有 `docs/release-notes/v0.2.10.md`（2266 字符，未发出内容，实测来源 `trun_08764efa44c39426` / commit `2bcdc53e`）+ 本次 CI 测试稳定性修复（仅当树内确有该修复时才写，见 ac-notes-ci-fix）；结构沿用既有 `# OpenCompare vX 发布说明` → 概述 → `## 本次变化` → `###` → `## 不做的事` → `## 风险与验证规模` → `## 升级方式`；文件本身不写 `**Full Changelog**` 行（由 `release.yml` 的 preCreate 段在 `--notes-file` 之后追加）。
- `CHANGELOG.md`：顶部新增 `## v0.2.11` 段，把 `## v0.2.10` 段的 `###` 分项原样并入并移除 `## v0.2.10` 二级标题；`## v0.2.9` 及更早逐字不动。
- `.github/workflows/release.yml`：仅 `workflow_dispatch.inputs.tag.default` 由 `'v0.2.10'` → `'v0.2.11'`；notes-file / preCreate / finalize / 祖先门 / 签名与发布通道块零 diff。
- `docs/release-process.md`：`default: 'v0.2.10'` 摘录 → `'v0.2.11'`。
- `docs/release-signing.md`：第五节补发默认 tag → `v0.2.11`；收敛段改为 `v0.2.11` 口径（`已合入 \`main\`` + `docs/release-notes/v0.2.11.md`）；`当前状态：v0.2.9 已发布`、`正式版发布姿态（v0.2.9）`、v0.2.9 的 notes / evidence 链接、`tag 之后的修复由 v0.2.9 承接` 逐字保留。
- `docs/release-notes/v0.2.10.md`：保留为未发布草稿（内容零 diff），但任何文档不再链接它。
- `src/main/release-packaging.test.ts`：**优先零 diff**；仅当派生断言实测红时做最小改写（不得删 / 弱化 / 放宽断言，不得动 `latestPublishedTag = 'v0.2.9'` 与 `not.toBe` / `isTagBefore` 姿态）。

## 验收

- ac-pkg-version: `package.json#version === "0.2.11"`，且该文件除 `version` 外无其它字段变更（`git diff -U0 package.json` 只出现版本行）。
- ac-notes-exists: `docs/release-notes/v0.2.11.md` 存在，`wc -m` 计字符数 > 1000，首行 `# ` 标题包含 `v0.2.11`。
- ac-notes-whitelist: notes 同时包含 `指示条`、`四态`、`same`、`added`、`removed`、`modified`、`滚动`、`点选`、`跳转`、`minimap`、`不新增扫描`、`不改对比与合并算法`、`升级方式`。
- ac-notes-measured-numbers: notes 中 `\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)` 的匹配序列按出现顺序恰为 `['451.6 MiB','909.0 MiB','2.25 GiB','2.5 GiB','9.29 GiB','9.62 GiB']`，且包含 `trun_08764efa44c39426` 与 `2bcdc53e`。
- ac-notes-negative: notes 不含 `200,000`、`10 MB`、`本版新增`、`待验证`、`预计通过`、`应该通过`、`TODO`/`TBD`/`FIXME`、任意 40–64 位连写 hex、`releases/tag/v0.2.10`，也不含 `Full Changelog`。
- ac-notes-ci-fix: CI 稳定性陈述与树内实现一致 —— 若 `src/renderer/src/components/DiffRuler.scale.test.tsx` 的目标用例带显式 `30_000` 超时，notes 必须写出该超时与实测（`6,816` 与 `30,000`）；若树内无 `30_000`，notes 不得出现 `30,000` / `6,816` / `30 秒`，并在交付说明「未纳入项」列出「CI 测试稳定性修复未随本项落地」。
- ac-changelog-fold: `CHANGELOG.md` 首个 `## ` 标题为 `## v0.2.11`；`[## v0.2.11, ## v0.2.9)` 切片内的 `## ` 二级标题序列恰为 `['v0.2.11']`（即不存在 `## v0.2.10`）。
- ac-changelog-content: `## v0.2.11` 段包含 `### 升级方式` 与 ac-notes-whitelist 的 12 个短语；不含任何 `GiB|MiB|GB|MB` 数字、40–64 位 hex、`TODO`/`TBD`/`FIXME`。
- ac-changelog-history-intact: `git diff CHANGELOG.md` 在 `## v0.2.9` 起始行之后无任何增删行。
- ac-default-tag: `release.yml` 中 `workflow_dispatch` 的 `tag.default` 为 `'v0.2.11'`；全文 `--notes-file` 出现 2 次且不含 `--generate-notes`；`git diff .github/workflows/release.yml` 只出现该 `default:` 一行。
- ac-docs-anchors: `docs/release-process.md` 含 `default: 'v0.2.11'` 且仍含 `README 第 5 行` / `不改这一行` / `latestPublishedTag` / `收尾提交`；`docs/release-signing.md` 含 `默认 \`v0.2.11\``、`已合入 \`main\``、`docs/release-notes/v0.2.11.md`、`当前状态：v0.2.9 已发布`、`正式版发布姿态（v0.2.9）`、`docs/release-evidence/v0.2.9.md`、`tag 之后的修复由 v0.2.9 承接`。
- ac-draft-notes-unlinked: `docs/release-notes/v0.2.10.md` 仍存在且 `git diff` 为空；`README.md`、`README.zh-CN.md`、`CHANGELOG.md`、`docs/release-process.md`、`docs/release-signing.md` 中均不出现 `docs/release-notes/v0.2.10.md`。
- ac-latest-anchor-intact: `src/main/release-packaging.test.ts` 中 `latestPublishedTag = 'v0.2.9'`、`previousPublishedTag = 'v0.2.8'`、`publishedTags` 三个声明逐字不变；`pnpm test src/main/release-packaging.test.ts` 全绿。
- ac-zero-diff-holds: `git diff --name-only HEAD` 不含 `README.md`、`README.zh-CN.md`、`docs/release-evidence/` 下任何文件。
- ac-single-commit: 本项产出恰好一条 commit，`git show --stat` 的文件集 ⊆ 上述「范围」清单，且不含 `src/renderer/`、`vitest.config.mts`、`electron-builder.yml`。
- ac-gates-green: `.munk/code-gates.json` 的 9 道门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿。
- ac-delivery-notes: 交付说明逐条列出改动文件、派生断言是否改动及原因、`pnpm test` 全量与 `release-packaging.test.ts` 的 files / passed / 耗时，以及未纳入项（CI 超时修复、发版动作、README 版本表、release-evidence 新建）。

## 非目标

- 不修 CI 红灯本身：不改 `src/renderer/src/components/DiffRuler.scale.test.tsx`、不改 `vitest.config.mts` 的 `testTimeout` / `hookTimeout`、不改任何产品代码（`DiffRuler.tsx` / `CodeView.tsx` / `src/core/**`）。
- 不改 `src/main/release-packaging.test.ts` 的白名单短语、`latestPublishedTag` / `previousPublishedTag` / `publishedTags`，不把 latest 前移到 v0.2.10 或 v0.2.11。
- 不发版：不推任何 tag、不 dispatch `Release`、不创建 / 修改 / 删除 GitHub Release 或资产、不重写 / 强推 / 删除远端已存在的 `v0.2.10` tag。
- 不改发布通道与签名：`--notes-file` / preCreate / finalize / 唯一公开 Release 门 / `electron-builder.yml` / 签名凭据 / secrets 一律不动。
- 不改 README 两版、不写版本表、不新建 `docs/release-evidence/v0.2.11.md`、不改 `docs/perf/**`。
- 不删除 `docs/release-notes/v0.2.10.md`（保留草稿），不新建 v0.2.11 证据、不改 `.munk/baseline/**`。
- 不做 UI、算法、扫描、快照格式的任何改动。

## 实现约束

- 开工三查：`git rev-parse HEAD` 应为 `b516d45509071ff34c021fa31d1720da2ef22f7a`（或其后代）、`package.json#version === "0.2.10"`、`docs/release-notes/v0.2.10.md` 与 `src/renderer/src/components/DiffRuler.scale.test.tsx` 均存在。工作区不得继承主工作区把树回退到 0.2.9 的暂存改动；不符则停手上报。
- notes 写法：以 `docs/release-notes/v0.2.10.md` 为底稿替换版本串（`v0.2.10` → `v0.2.11`、`0.2.10` → `0.2.11`），`升级方式` 仍写「建议从 v0.2.9 升级」（latest 已发布仍是 v0.2.9）；实测数据、`trun_08764efa44c39426` / `2bcdc53e` 来源与「点选跳转已实测、键盘导航本次实测未覆盖」的如实口径逐字沿用。
- CHANGELOG 折叠：v0.2.10 段的 `### 新增` / `### 不做的事` / `### 升级方式` 保留为 v0.2.11 下的子节；不把 v0.2.9 段的 `200,000` / `10 MB` 口径段搬进来（该段属 v0.2.9 区间，测试按 latest 区间断言）。
- 迭代顺序：先落 notes 与 CHANGELOG，再跑 `pnpm test src/main/release-packaging.test.ts` 收敛文案；白名单是 fail-closed 的，禁止改白名单来消红。
- 若 `release-packaging.test.ts` 只红在派生断言（版本字符串 / notes 路径），做最小改写并在交付说明写明「改了哪条、为什么无法零改动」；任何失败都不允许通过删断言或放宽比较来消红。
- 提交：一条 commit 覆盖全部发布文件；不混入 CI 修复或任何 src 改动。
