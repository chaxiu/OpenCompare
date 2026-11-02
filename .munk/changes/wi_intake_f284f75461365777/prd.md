# 把 release-packaging.test.ts 的版本台账拆成 3 个测试文件，台账层改为对发布文档的结构 / 不变量断言

## 范围

基线：`HEAD a9be819`（本 worktree 干净，`git status --porcelain` 为空）。`src/main/release-packaging.test.ts` 共 **4,698 行 / 249 个 `it()` / 38 个顶层 `describe`**。

| 段 | 行区间 | 行数 | it() | 性质 |
| --- | --- | --- | --- | --- |
| 前导（常量、读文件、helper） | 1–335 | 335 | 0 | 共享 |
| 打包 / 发布配置门 | 336–1111 | 776 | 54 | 真门 |
| 版本门 + 祖先门 + 重跑 + 凭据清单 | 1112–1716 | 605 | 38 | 真门 |
| release notes changelog（历史正文逐版） | 1717–2461 | 745 | 32 | 台账 |
| 文档一致性 + README 锚点 | 2462–2717 | 256 | 8 | 台账（含手翻常量） |
| bilingual README parity（逐版表） | 2718–3086 | 369 | 22 | 台账 |
| 历史 evidence 记录（v0.2.6/7/8/9/0.2.16） | 3087–3821 | 735 | 29 | 台账（含 12 组 size+sha256 手抄） |
| 品牌 / 协议 / 产物 / Windows / 单一 Release / hardening | 3822–4698 | 877 | 66 | 真门 |

台账层合计 ≈ 735 + 745 + 369 + 256（部分走查，其中手翻版本锚点 70–100、evidence 常量 2572–2684 共约 200 行）≈ **2,050 行**；真门 ≈ **2,258 行 + 前导 335 行 ≈ 2,593 行**。

本项做三件事：

1. 把 4,698 行拆成 **3 个测试文件**，真门断言逐行搬移、不删不弱化；
2. 台账层（历史 evidence 记录、changelog 历史正文、README parity 逐版表、版本门手翻常量）改写为**对 `docs/release-evidence/*.md`、`CHANGELOG.md`、`docs/release-notes/*`、`README*.md` 的结构 / 不变量断言**，历史版本一律表驱动遍历，sha256 不再抄进 TS；
3. 提交基线 249 个 `it()` 到新测试位置的**可复核映射表**，漏一条即 fail-closed。

已实测的文档事实（供断言设计使用，勿再改口径）：

- `docs/release-evidence/` 有 **15 个** md：`v0.2.0`/`v0.2.1` 为 `status: blocked`（无资产表），`v0.2.10`/`v0.2.11` 为 `status: partial`（无资产表），`v0.2.2` 用 TSV 资产清单（11 件、带 `sha256:` 前缀），`v0.2.4`/`v0.2.5` 为 3 列表（无 URL），`v0.2.6`/`v0.2.7`/`v0.2.9`/`v0.2.12`/`v0.2.14` 为 4 列表，`v0.2.8` 为「摘要」列，`v0.2.15` 为 3 列 + 独立 sha256 表，`v0.2.16` 为 5 列表。
- 资产件数：`v0.2.15`/`v0.2.16` 为 **12** 件（含 `OpenCompare-<v>-win-x64.zip`）；`v0.2.2`/`v0.2.4`–`v0.2.9`/`v0.2.12`/`v0.2.14` 为 **11** 件（无 win zip）。`v0.2.12`/`v0.2.14` 表内 10 行的 sha 单元格写的是「见发布期证据」，实际只有 1 行完整 digest。
- `CHANGELOG.md` 297 行、15 个 `## vX.Y.Z` 条目（当前 `v0.2.16` 在最上），`v0.2.3` / `v0.2.13` 按设计从未存在。
- `README.md` / `README.zh-CN.md` 各 87 行、各 9 个 H2。
- `vitest.config.mts` 的 `include` 为 `src/**/*.test.ts` / `*.test.tsx`，新文件名无需改配置；`.munk/code-gates.json` 未引用本测试文件。
- 当前 `package.json#version` = `0.2.16`，`docs/release-evidence/v0.2.16.md` 已公开。

## 建议拆分（可调整，但必须满足验收）

| 文件 | 承载 | 预估 |
| --- | --- | --- |
| `src/main/release-packaging.test.ts`（保留原文件名） | 打包 / 发布配置门（原 336–1111）+ evidence 结构不变量层 | ≤1,200 |
| `src/main/release-version-gate.test.ts` | 版本门 / v0.1.2 祖先门 / 重跑入口 / 凭据清单（原 1112–1716）+ changelog / README parity 结构层 | ≤1,200 |
| `src/main/release-artifacts-and-brand.test.ts` | 品牌 / 协议 / 产物名 / Windows portable / 单一 Release / hardening（原 3822–4698） | ≤1,200 |

允许新增**测试专用**支撑模块（如 `src/main/release-doc-fixtures.test-helpers.ts`）以共享前导，但必须满足：不被任何产品入口（`src/main/index.ts`、preload、renderer、core）引用，行数计入 2,800 总量。

## Acceptance Criteria

- ac-three-files: 拆分后恰好 3 个 `*.test.ts` 测试文件承载基线 249 个 `it()` 的全部语义，且每个文件 `wc -l` ≤ 1,200。
- ac-total-lines: 3 个测试文件 + 任何新增测试支撑模块的行数合计 ≤ 2,800。
- ac-ledger-budget: 台账层（evidence 历史记录、changelog 历史正文、README parity、版本门手翻常量）改写后合计 ≤ 300 行，且交付报告给出逐段行数。
- ac-mapping-249: 基线 249 个 `it()` 在新测试位置逐条可查（`.munk/changes/wi_intake_f284f75461365777/it-mapping.md`，249 行、每行含基线行号 / describe / it 标题 / 新文件 / 新 it 标题），计数 = 249；任何一条既无对应新 `it()` 又无「被哪条更强断言覆盖」说明即 fail-closed。
- ac-true-gates-preserved: 原 336–1716 与 3822–4698 的每一条 `it()` 断言逻辑（含 `expect` 条件、测试夹具、命令串常量）逐字保留；除断言去重外不得删除或弱化；`pnpm test` 通过数不得低于基线。
- ac-next-release-growth: 模拟新增一个已发布版本（新 `docs/release-evidence/vX.md` + notes + CHANGELOG 条目）时，台账层只需 ≤ 30 行新增且 **0 个新增 `describe`**；交付报告给出临时副本上的实测 diff 行数。
- ac-evidence-no-sha-in-ts: 3 个测试文件（及新增支撑模块）的源码中 64 位小写 hex 字面量命中数为 0（`rg -c '[0-9a-f]{64}'` 无命中）；sha256 只能从 evidence md 解析。
- ac-evidence-row-count: 对每个 `status: verified` 的 evidence 文件，解析出的资产条目数等于该文件自行声明的 `| 资产数 | N`，且 `v0.2.15`/`v0.2.16` 为 12（含 `OpenCompare-<ver>-win-x64.zip`）、`v0.2.4`–`v0.2.14` 为 11；`blocked`/`partial` 版本不要求资产表但必须有 `status` 行。
- ac-evidence-asset-name-set: 每个解析出的资产名必须匹配 `release.yml` 上传/校验的资产族（`*.dmg`、`*.zip`、`*.exe`、`*.AppImage`、`*.deb`、`*.blockmap`、`latest*.yml`）；版本化命名的资产必须携带文件名自身的版本号；任一不在该族内的名字即为失败。
- ac-evidence-sha256-shape: 每个 digest 单元格要么是 64 位小写 hex（可带 `sha256:` 前缀），要么是已声明占位「见发布期证据」；`v0.2.2`/`v0.2.4`–`v0.2.9`/`v0.2.15`/`v0.2.16` 的 digest 覆盖率必须 100%，`v0.2.12`/`v0.2.14` 允许实际 digest ≥ 1；出现非法 hex 形态即失败。
- ac-evidence-tag-commit: 每个 evidence 文件必须能被文件名版本、正文 tag 与 40 位 commit 三方交叉验证（含 `tag → commit` 行）；任一处不一致即失败，错误信息点名文件与字段。
- ac-evidence-table-driven: evidence 层只有一个表驱动 `describe`，遍历 `docs/release-evidence/*.md` 全目录；不得再有按版本命名的 `describe`（原 5 个 `v0.2.x ... evidence record` 必须消失），新增 evidence 文件自动被覆盖。
- ac-changelog-structure: changelog 层只断言结构、通用链接规则与当前版内容——`## ` 标题集合 = evidence 版本 ∪ 当前版本、按 semver 降序且当前版在首位；所有 release 链接均为绝对 URL、指向已有 evidence 版本或当前 tag；不得内嵌任何历史版本正文断言。
- ac-readme-invariants: README 层只断言不变量——双语 9 个 H2 一一对应、首行标题、语言切换交叉链接、第 5 行状态行指向「已有 evidence 的最新版本 tag」、英文正文词数预算、无 `KNOWN` 废止标记；不再逐版内嵌历史表。
- ac-pure-test-change: 变更集只含测试文件与新增测试支撑模块；`git diff --stat HEAD` 中不出现 `src/main/index.ts`、`src/main/*.ts`（非测试）、`src/preload/**`、`src/renderer/**`、`src/core/**`、`release.yml`、`electron-builder.yml`、`package.json`、`CHANGELOG.md`、`README*.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`.munk/code-gates.json`、`vitest.config.mts`。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test` 全绿，且新旧 3 个文件单独跑的通过用例数 ≥ 基线 249。
- ac-delivery-report: 交付报告给出：三文件各自行数、台账段行数、三文件合计、`git diff --stat` 增删行数、249 行映射表落点路径、下一版新增行数实测、以及 `code_gates` 与专项门命令与结论。

## 基线 describe → 目标文件映射（计数校验 = 249）

| 基线 describe（按出现顺序） | 行 | it() | 目标文件 | 处置 |
| --- | --- | --- | --- | --- |
| release package metadata | 336 | 2 | F1 | 原样搬移 |
| linux packaging targets | 348 | 2 | F1 | 原样搬移 |
| github release publishing | 361 | 6 | F1 | 原样搬移 |
| release body from repository notes | 415 | 11 | F1 | 原样搬移 |
| published release body gate | 581 | 7 | F1 | 原样搬移 |
| published release body link gate | 720 | 6 | F1 | 原样搬移 |
| update metadata consistency | 846 | 9 | F1 | 原样搬移 |
| macOS signing and notarization | 1030 | 6 | F1 | 原样搬移 |
| release signing secrets wiring | 1067 | 5 | F1 | 原样搬移 |
| release version gate | 1112 | 11 | F2 | 原样搬移（手翻锚点改派生） |
| v0.1.2 ancestry gate | 1391 | 10 | F2 | 原样搬移 |
| manual re-run dispatch entry | 1511 | 4 | F2 | 原样搬移 |
| release signing credentials checklist | 1565 | 13 | F2 | 原样搬移 |
| release notes changelog | 1717 | 32 | F2 | 结构/顺序/通用链接/当前版；历史正文 `retired-by-AC3` |
| release document consistency | 2462 | 6 | F2 | 结构不变量（幽灵版本、链接白名单） |
| published README release anchors | 2685 | 2 | F2 | 结构不变量 |
| bilingual README parity | 2718 | 22 | F2 | 结构不变量（9 节/词数/链接），逐版表 `retired-by-AC3` |
| v0.2.6 evidence record | 3087 | 4 | F1 | 并入表驱动 evidence 遍历 |
| v0.2.7 evidence record | 3168 | 6 | F1 | 并入表驱动 evidence 遍历 |
| v0.2.8 evidence record | 3289 | 7 | F1 | 并入表驱动 evidence 遍历 |
| v0.2.9 evidence record | 3432 | 6 | F1 | 并入表驱动 evidence 遍历 |
| v0.2.16 evidence record | 3610 | 6 | F1 | 并入表驱动 evidence 遍历 |
| brand icon assets | 3822 | 5 | F3 | 原样搬移 |
| packaging points at the shipped brand icons | 3856 | 4 | F3 | 原样搬移 |
| window and dock share the packaged brand icon | 3912 | 2 | F3 | 原样搬移 |
| about panel brand and version | 3935 | 3 | F3 | 原样搬移 |
| native About menu entry | 3978 | 3 | F3 | 原样搬移 |
| brand asset documentation | 4001 | 1 | F3 | 原样搬移 |
| opencompare protocol declaration | 4017 | 2 | F3 | 原样搬移 |
| packaged macOS app icon and identity assertions | 4050 | 7 | F3 | 原样搬移 |
| macOS signature, notarization and Gatekeeper hard checks | 4099 | 5 | F3 | 原样搬移 |
| packaged artifact names and update metadata | 4138 | 4 | F3 | 原样搬移 |
| Windows portable zip release surface | 4167 | 17 | F3 | 原样搬移 |
| single public release gate | 4488 | 4 | F3 | 原样搬移 |
| gh api option compatibility | 4545 | 1 | F3 | 原样搬移 |
| hard verification order and fail-closed upload path | 4563 | 2 | F3 | 原样搬移 |
| release hardening documentation | 4594 | 4 | F3 | 原样搬移 |
| latest published release gate | 4674 | 2 | F3 | 原样搬移 |
| **合计 38 个 describe** | | **249** | 3 文件 | |

- F1 = `src/main/release-packaging.test.ts`，F2 = `src/main/release-version-gate.test.ts`，F3 = `src/main/release-artifacts-and-brand.test.ts`（文件名可调，但文件数必须为 3）。
- 基线 `it()` 计数口径：`grep -cE "^[[:space:]]*(it|test)(\.(each|skip|only|todo|concurrent|failing|sequential))*\(" src/main/release-packaging.test.ts` = 249（无 `.each` / `.skip` 变体）。
- `retired-by-AC3` 条目必须逐条列在 `it-mapping.md` 中，并写明其替代断言（例如「v0.2.6 changelog 正文短语」→「`## v0.2.6` 条目存在 + 序列位置 + 全部链接为绝对 URL」）。

## 非目标

- 不做版本收敛、不 bump `package.json#version`、不改 `CHANGELOG.md` / `README*.md` / `docs/release-notes/**` / `docs/release-evidence/**` 正文。
- 不改 `release.yml`、`electron-builder.yml`、`.munk/code-gates.json`、`.munk/code-gates.perf.json`、`vitest.config.mts`、`vitest.evidence.config.mts`。
- 不动已公开 tag / Release / 资产，不重新打包 / 公证 / dispatch，不并入版本收敛 commit。
- 不改 `src/main/release-evidence.test.ts`、`src/main/release-metadata.test.ts`、`src/main/symlink-evidence.test.ts`（既有同域测试，避免扩大爆炸半径）。
- 不为凑行数删除、跳过、合并掉真门断言；不使用 `it.skip` / `describe.skip` / 注释掉断言来达标。
- 不新增产品能力、不新增运行期依赖。

## 实现约束

- **只读基线**：一律以本 worktree 的 `HEAD a9be819` 为准。主检出索引停在 10-31（相对 HEAD 390 文件 / −51.8k staged），**禁止**在主检出执行 `commit` / `checkout` / `reset` / `add`；所有改动只落在本 worktree。
- **禁止整读 >500 行文件**：按 PRD 上表的行区间读；无依赖的只读命令同轮批量发。
- **行数预算算术**（交付时必须实测复核）：真门 ≈ 2,258 行 + 前导（去重后约 150–240 行）+ 台账 ≤ 300 行 ≤ 2,800。若实测下界超过 2,800，**不得删真门作答**，须在交付报告中如实给出下界、差值与构成（本项已授权「达不到如实报」）。
- **台账强度口径**：唯一获授权的内容级缩减是 AC3 指定的历史正文（changelog 历史段、README 逐版表、evidence 逐版 marker）。这些条目在映射表中必须标 `retired-by-AC3` 并写明替代断言（结构 / 顺序 / 链接 / 形态不变量）。evidence 层的名字集合、件数、sha256 形态、tag-commit 交叉必须**不弱于**原有的「name + sha + URL 逐条 in 断言」，且由 5 个版本扩到 15 个版本全覆盖。
- **不触碰配置**：`vitest.config.mts` 的 `include` 已覆盖 `src/**/*.test.ts`，新文件无需改门；若发现必须改门 / 改 vitest 配置才能拆分，**立即停下**，写清原因回报由负责人决定，不得自行改 `.munk/code-gates.json`。
- **验证顺序**：先按文件单独跑（`pnpm test src/main/release-packaging.test.ts src/main/release-version-gate.test.ts src/main/release-artifacts-and-brand.test.ts`），再 `pnpm lint` / `pnpm typecheck` / `pnpm test`，最后 `code_gates`。专项检查最少包含：`rg -c '[0-9a-f]{64}' src/main/*.test.ts`、`wc -l`、映射表计数 249。
- **映射表落点**：`.munk/changes/wi_intake_f284f75461365777/it-mapping.md`（249 行明细），交付报告引用该路径并在正文内嵌 describe 级汇总（38 行）。
