# release-evidence 台账表驱动化与 sha256 移出 TS

- WI：`wi_intake_da866f242fc4a76c`
- 域：`release`（发布证据台账的数据载体与断言口径；被测对象是 `docs/release-evidence/*.md` 与其新增数据台账，不是产品行为）
- 来源：`.munk/changes/wi_intake_da866f242fc4a76c/prd.md` + `delivery-notes.md`（本 WI change pack **只有这两份**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 18 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`HEAD 15a6313`（`src/main/release-evidence.test.ts` 711 行 / 7 `describe` / 34 `it()` / 27 个 sha256 字面量 / 53 处 `toContain` / 2 处 `readFileSync`）
- 改动面（除 change-pack 与 `.munk/baseline/**`）：`src/main/release-evidence.test.ts` 711 → 400 行（+332 / −643）、新增 `docs/release-evidence-ledger.json`（272 行）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-ledger-file | `docs/release-evidence-ledger.json` 可 `JSON.parse`，`versions` 恰 5 项且无重复：`v0.2.1` / `v0.2.2` / `v0.2.4` / `v0.2.5` / `v0.2.7`（`Set(map(v=>v.version)).size === versions.length` 用例） | 满足 |
| ac-ledger-shape | 每节点含 `version` / `status` / `assets` / `extraDigests`；`v0.2.1` 0 资产、其余各 11（合计 44）；`extraDigests` 3 条；资产名同版本唯一、`bytes` 正整数、`sha256` 全匹配 `^[0-9a-f]{64}$`；extraDigest 的 `label` 非空且 digest 合法（`pins 44 asset rows…` / `keeps every asset name unique…` / `labels every extra digest…` 三例） | 满足 |
| ac-ledger-vs-doc | 逐版读 `docs/release-evidence/<version>.md`，`parseAssetTable` 覆盖 3 列 / 4 列 / TSV 三种格式（`parses the three documented asset table formats`）；`status` 与台账等值；4 个 `verified` 版本行数相等并逐行双向比对 `name` / `bytes` / `sha256`，差异信息点名版本与资产名（`matches the ledger asset table row by row`） | 满足 |
| ac-digest-closure | `closes the document digest set over the ledger`：每版正文 64 位小写 hex 集合 == 台账「资产 digest ∪ extraDigests digest」；双向闭合，覆盖 47 个唯一 digest（13 + 11 + 12 + 11） | 满足 |
| ac-blocked-zero-digest | `v0.2.1 blocked record` 两例：解析为 `blocked`、0 资产行、全文 hex 0；`## 3. 缺失项` 结论列仅「缺失 / 不可核验」，`## 4.` / `## 5.` / `## 6.` 段落存在 | 满足 |
| ac-ts-zero-sha | `rg -o '[0-9a-f]{64}' src/main/release-evidence.test.ts \| wc -l` → **0** | 满足 |
| ac-ts-line-budget | `wc -l < src/main/release-evidence.test.ts` → **400** ≤ 400 | 满足 |
| ac-ts-tocontain-budget | `rg -o 'toContain' … \| wc -l` → **10** ≤ 15；10 处全为版本 / 章节 / 命令 / 标识 / 来源标注存在性，逐条理由见交付说明第 5 节 | 满足 |
| ac-cases-no-drop | 本文件单跑 **57 passed（57）** ≥ 33（基线 34）；全仓 `pnpm test` 114 files / **1791 passed + 1 skipped**（1792），不低于基线；`it.skip\|describe.skip\|it.only\|it.todo` 命中 **0** | 满足 |
| ac-inspector-negative-fixtures | `inspectReleaseEvidence negative fixtures` 9 例 + `inspectLedgerEvidence v0.2.5 negative fixtures` 4 例：空 / 缺失记录、非法 status、verified 缺 marker 对、verified 少于两个不同 digest、blocked 带通过标记、blocked 带产物 digest、v0.2.5 缺 marker 套、digest 与台账不符、少于 11 行、残留 pending 全部覆盖；期望值由台账注入 | 满足 |
| ac-mutation-red | 资产行篡改（`v0.2.4` 首资产 sha256 → 全 0）：**3 failed / 54 passed**，报错含「v0.2.4 资产「latest-linux.yml」sha256 与台账不一致」与逐行 deep-equal 失败；extra digest 篡改（`v0.2.5` 首 extra → 全 0）：**2 failed / 55 passed**，报错含「v0.2.5 证据文档缺少台账 digest「000…」」；两次均已 `cp` 还原并复跑回 57 passed（原文见交付说明第 3 节） | 满足 |
| ac-replacement-mapping | 交付说明第 4 节：53 处基线 `toContain` 逐条映射 + 另列非 `toContain` 断言（全文 digest 集合 / v0.2.5 inspector 文本检查）的退役与替代；第 5 节留存 10 处逐条理由；无法给替代断言的第 6 项（v0.2.5 §6 交接清单自由文本）保留并只做作用域收紧 | 满足 |
| ac-no-assertion-relocation | `git diff --name-status HEAD` 仅 `src/main/release-evidence.test.ts`（M）+ 未跟踪 `docs/release-evidence-ledger.json`；无新增 `.test.ts` / `.test-helpers.ts`，断言未移入 `.munk/` / `docs/` / `scripts/` | 满足 |
| ac-no-overlap-b | `src/verify-release-gate.test.ts` 与 `scripts/verify-release.mjs` 不在改动清单（并行项 B 零改动） | 满足 |
| ac-version-frozen | `package.json#version` = `0.2.16`；`docs/release-notes/**`、`CHANGELOG.md`、`.github/workflows/release.yml` 不在改动清单；未打 tag / push / dispatch，未改已公开 Release 与资产 | 满足 |
| ac-gates-unchanged-and-green | `.munk/code-gates.json` 零 diff；Host `code_gates` attempt 001 **21 门**全 exit 0（`.munk/runs/run_intake_da866f242fc4a76c/code-gates/attempts/001`，`latest.json` `ok: true` / `failedGateIds: []`） | 满足 |
| ac-delivery-metrics | 行数 711 → 400；sha 字面量 27 → 0；`toContain` 53 → 10；`readFileSync` 2 → 3；本文件用例 34 → 57；全仓测试 115 / 48,120 → 115 / 47,809；非测试源码 145 / 32,104 未变；篡改输出见交付说明第 3 节 | 满足 |
| ac-deadline-honesty | 全绿交付，无缺口；未降门、未删断言、未跳过、未把红写绿 | 满足 |

## 口径与陷阱注记

- **台账唯一 digest 47 ≠ 资产 44**：`extraDigests` 承载不在资产表的包内图标与 `CandidateCDHashFull`（`v0.2.2` 2 条、`v0.2.5` 1 条）。把这些 digest 硬塞进 `assets` 会污染资产行数断言，漏登则集合闭合并红，故必须独立字段。
- **集合闭合是双向的**：只断言「台账 digest 都出现在文档」会漏掉文档里新增的未登记 digest；`blocked` 版本反向要求全文 0 digest，避免把通过标记或产物哈希写进 blocked 证据。
- **表驱动不能靠派生端点切片**：按 `versions[]` 直接 `describe.each`，不读 `latestPublishedTag` / `currentTag` 一类会随版本收敛翻面的常量；否则新增版本时会切到空段并假绿。
- **篡改红必须还原**：验证脚本写出全 0 digest 后要 `cp` 回备份并复跑，台账里留 0 值会被集合闭合立刻抓住，但也说明还原是流程的一部分。
- **`toContain` 余量只剩 5**：现存 10 处均为结构 / 标识存在性；后续若需断言新的正文事实，优先落成表格行或章节内事实，不得回填历史措辞。
- **纯测试清债**：非测试源码文件 / 行数不变，产品行为零改动；`readFileSync` 增至 3 是新增一次台账读取 + 证据文档按版本缓存的一次读取 + import。
