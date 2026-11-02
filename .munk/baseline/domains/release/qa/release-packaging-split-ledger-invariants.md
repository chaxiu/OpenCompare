# release-packaging.test.ts 三层拆分与台账不变量化

- WI：`wi_intake_f284f75461365777`
- 域：`release`（发布面测试结构 + 台账层断言口径；被测对象是发布配置 / 版本门 / 品牌产物断言与其文档台账遍历）
- 来源：`.munk/changes/wi_intake_f284f75461365777/prd.md` + `it-mapping.md`（本 WI change pack **只有 `prd.md` 与 `it-mapping.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 17 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 基线：`HEAD a9be819`（拆分前单文件 4,698 行 / 38 `describe` / 249 `it()`）；本 worktree 已 rebase 到 `origin/main` `2e76e10`
- 改动面（除 change-pack 与 `.munk/baseline/**`）：`src/main/release-packaging.test.ts` 4,698 → 915 行、新增 `src/main/release-version-gate.test.ts`（770 行）、新增 `src/main/release-artifacts-and-brand.test.ts`（926 行）、新增 `src/main/release-doc-fixtures.test-helpers.ts`（188 行）、`src/verify-release-gate.test.ts` +61 行

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-split-three-files（prd `ac-three-files`） | 恰 3 个 `*.test.ts`：`release-packaging.test.ts` 915 行、`release-version-gate.test.ts` 770 行、`release-artifacts-and-brand.test.ts` 926 行，各自 ≤1,200；`release-packaging.test.ts` 10 个 `describe`、`release-version-gate.test.ts` 6 个、`release-artifacts-and-brand.test.ts` 16 个，共同承载基线 249 个 `it()` 语义 | 满足 |
| ac-split-total-lines（prd `ac-total-lines`） | 915 + 770 + 926 + 188 = **2,799** ≤ 2,800；无其它新增测试支撑模块 | 满足 |
| ac-split-ledger-budget（prd `ac-ledger-budget`） | 台账段 F1（`release evidence ledger (table-driven)`）115 行 + F2（`release history structure` + `README invariants`）113 行 = **228** ≤ 300 | 满足 |
| ac-split-mapping-249（prd `ac-mapping-249`） | `.munk/changes/wi_intake_f284f75461365777/it-mapping.md` 249 行明细（`| <n> | <基线行> | <describe> | <it 标题> | <新文件> | <新 it 标题> |`），计数 = 249；158 条真门逐字搬移、91 条 `retired-by-AC3` 每条写明替代断言；另有 describe 级 38 行汇总与增长门说明 | 满足 |
| ac-split-true-gates-preserved（prd `ac-true-gates-preserved`） | 原 336–1716 与 3822–4698 的 `it()` 断言逻辑、夹具、命令串常量逐字搬移（映射表逐条对照）；发布三文件单跑 **330 passed**（F1 220 / F2 44 / F3 66）≥ 基线 249；全量 `pnpm test` 114 files / 1768 passed + 1 skipped（1769） | 满足 |
| ac-split-next-release-growth（prd `ac-next-release-growth`） | 临时副本新增 `v0.2.17` evidence + notes + CHANGELOG 条目 + version / README 锚点后，台账层 3 个 describe 共 187 passed，测试源码 diff = **0 行**、describe 数不变（F1 10 / F2 6）；严于 ≤30 行预算 | 满足 |
| ac-split-evidence-no-sha-in-ts（prd `ac-evidence-no-sha-in-ts`） | `rg -c '[0-9a-f]{64}'` 对 3 个测试文件与 `release-doc-fixtures.test-helpers.ts` 命中均为 **0**；digest 一律从 `docs/release-evidence/*.md` 单元格解析 | 满足 |
| ac-split-evidence-row-count（prd `ac-evidence-row-count`） | evidence 表驱动层遍历 `docs/release-evidence/*.md` 全 15 个文件；`status: verified` 版本解析资产条目数 == 文件自声明资产数，`v0.2.15` / `v0.2.16` = 12 件（含 win zip），`v0.2.4`–`v0.2.14` = 11 件；`v0.2.0` / `v0.2.1`（blocked）与 `v0.2.10` / `v0.2.11`（partial）只要求 `status` 行 | 满足 |
| ac-split-evidence-asset-name-set（prd `ac-evidence-asset-name-set`） | 资产名逐条匹配 `release.yml` 上传 / 校验资产族（`*.dmg` / `*.zip` / `*.exe` / `*.AppImage` / `*.deb` / `*.blockmap` / `latest*.yml`）；版本化名必须携带文件名自身版本号，族外名字判失败 | 满足 |
| ac-split-evidence-sha256-shape（prd `ac-evidence-sha256-shape`） | digest 单元格只接受 64 位小写 hex（可带 `sha256:` 前缀）或已声明占位「见发布期证据」；`v0.2.2` / `v0.2.4`–`v0.2.9` / `v0.2.15` / `v0.2.16` 覆盖率 100%，`v0.2.12` / `v0.2.14` 实际 digest ≥ 1；非法 hex 形态判失败 | 满足 |
| ac-split-evidence-tag-commit（prd `ac-evidence-tag-commit`） | 每个 evidence 文件以文件名版本、正文 tag、40 位 commit（`tag → commit` 行）三方交叉验证，任一不一致即失败并点名文件与字段 | 满足 |
| ac-split-evidence-table-driven（prd `ac-evidence-table-driven`） | evidence 层只有一个 `describe('release evidence ledger (table-driven)')`（F1），遍历全目录；原 5 个按版本命名的 `v0.2.x ... evidence record` describe 已消失，新增 evidence 文件自动覆盖 | 满足 |
| ac-split-changelog-structure（prd `ac-changelog-structure`） | `release history structure`（F2）只断言 `## ` 标题集合 = evidence 版本 ∪ 当前版本、semver 降序且当前版在首位、release 链接均为绝对 URL 且指向已有 evidence 版本或当前 tag；无历史版本正文内嵌 | 满足 |
| ac-split-readme-invariants（prd `ac-readme-invariants`） | `README invariants`（F2）只断言双语 9 个 H2 一一对应、首行标题、语言切换交叉链接、第 5 行状态行指向已有 evidence 的最新版本 tag、英文正文词数预算、无 `KNOWN` 废止标记；无逐版历史表 | 满足 |
| ac-split-pure-test-change（prd `ac-pure-test-change`） | `git diff --name-only HEAD` 交付面仅 `src/main/release-packaging.test.ts` / `src/main/release-version-gate.test.ts` / `src/main/release-artifacts-and-brand.test.ts` / `src/main/release-doc-fixtures.test-helpers.ts` / `src/verify-release-gate.test.ts`（均为测试文件）；`package.json`、`CHANGELOG.md`、`README*.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`.github/workflows/release.yml`、`electron-builder.yml`、`.munk/code-gates.json`、`vitest.config.mts` 零 diff；`src/main/index.ts` 与非测试 `src/main/*.ts` 零 diff | 满足 |
| ac-split-gates-green（prd `ac-gates-green`） | Host `code_gates` attempt 001：**21 门**全 exit 0（`.munk/runs/run_intake_f284f75461365777/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (21 gates, attempt 001)"` / `failedGateIds: []`）；`pnpm test` 114 files / 1768 passed + 1 skipped（1769）、32.53s；发布三文件单跑 330 passed（≥249） | 满足 |
| ac-split-delivery-report（prd `ac-delivery-report`） | 行数：F1 915 / F2 770 / F3 926、支撑 188、合计 2,799；台账段 115 + 113 = 228；`git diff --stat HEAD` 对既有文件的净改动为 `release-packaging.test.ts` −3,894（4,698 → 915 内容重写）与 `verify-release-gate.test.ts` +61，新增 3 个未跟踪文件合计 1,884 行；249 行映射表落点 `.munk/changes/wi_intake_f284f75461365777/it-mapping.md`；下一版新增测试源码 **0 行**（预算 ≤30），describe 数不变；专项门 = `rg -c '[0-9a-f]{64}'` 命中 0 + `wc -l` + 映射表计数 249 | 满足 |

## 口径与陷阱注记

- **249 是「语义条目」而非 `it(` 字面量**：拆分后三文件 `it(` 字面量 61 + 44 + 66 = 171，但实际执行 330 用例（表驱动 `forEach` 展开），且 91 条历史正文断言已按 AC3 退役为结构不变量。验收必须按映射表逐条对账 + 执行数 ≥249 判读，不能拿 `it(` 字面量下降当删测试。
- **`retired-by-AC3` 不是删断言**：每条退役项都在映射表写明替代断言（结构 / 顺序 / 链接 / 形态），且 evidence 层从 5 个版本扩到 15 个版本全覆盖，名字集合、件数、digest 形态与 tag-commit 交叉都不得弱于原「name + sha + URL 逐条 in 断言」。
- **表驱动层的假绿风险**：目录遍历型 `describe` 若夹具缺失会「0 个用例全绿」；本实现以「文件数 = 15」「verified 版本资产数 = 12/11」「表驱动 describe 恰 1 个」等计数断言兜底，后续新增 evidence 文件必须自动进入遍历而不是另起 describe。
- **sha256 只许在 markdown 里**：TS 源码零 64 位 hex 是硬门，历史资产哈希一旦抄回测试文件即红；新增版本只需落 evidence markdown，测试不动。
- **共享 helper 的边界**：`release-doc-fixtures.test-helpers.ts` 只被 3 个测试文件 import，不被产品入口（`src/main/index.ts`、preload、renderer、core）引用；其行数计入 2,800 总预算。
- **门禁面未扩**：`.munk/code-gates.json` 仍 21 门，新文件靠既有 `src/**/*.test.ts` include 进入 `test` 门；`vitest.config.mts` 零 diff。
- **`verify-release-gate.test.ts` 的 +6 用例**：补 `validateSummary` / `versionEqualsTag` 与固定计数（15 / 3 / 16 MiB）的显式 fail-closed 钉板，仍属测试文件，未改 `scripts/verify-release.mjs`。

## 最近执行

- workItemId: wi_intake_f284f75461365777
- at: 2026-11-02T13:12:00+08:00
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI / 真机自测，以 Host `code_gates` 为交付门槛（21 门 attempt 001 全 exit 0，`.munk/runs/run_intake_f284f75461365777/code-gates/attempts/001`；`pnpm test` 114 files / 1768 passed + 1 skipped / 1769，32.53s）。静态核对：3 个测试文件 915 / 770 / 926 行 + 支撑 188 行 = 2,799；台账段 228 行；映射表 249 行（158 真门 + 91 `retired-by-AC3`）；三文件单跑 330 passed；`rg -c '[0-9a-f]{64}'` 对 4 个测试源码命中 0；evidence 层单表驱动 describe 覆盖 15 个文件；临时副本新增 v0.2.17 台账测试源码 diff 0 行、describe 数不变。无产品源码 / 发布文档 / 配置 / 门禁清单改动。
