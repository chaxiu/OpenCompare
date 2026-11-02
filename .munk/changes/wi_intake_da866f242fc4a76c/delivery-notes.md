# 交付说明：release-evidence 台账表驱动化

WI：`wi_intake_da866f242fc4a76c`（test-only 清债，不改产品行为）
基线：`HEAD 15a6313`（本 worktree 干净）

## 1. 变更集

| 文件 | 变更 |
| --- | --- |
| `docs/release-evidence-ledger.json` | 新增。5 个版本 / 44 条资产 / 3 条 extra digest / 47 个唯一 digest |
| `src/main/release-evidence.test.ts` | 711 → 400 行；历史台账改为解析 JSON + 解析证据文档 + 表驱动逐行比对 |
| `.munk/changes/wi_intake_da866f242fc4a76c/delivery-notes.md` | 本说明 |

未改动：`package.json#version`（仍 `0.2.16`）、`docs/release-notes/**`、`CHANGELOG.md`、`.github/workflows/release.yml`、`.munk/code-gates.json`、`src/verify-release-gate.test.ts`、`scripts/verify-release.mjs`、任何产品源码与 `docs/release-evidence/*.md` 正文。

## 2. 实测指标（全部来自命令，不是估计）

| 指标 | 改动前 | 改动后 | 命令 |
| --- | --- | --- | --- |
| 测试文件行数 | 711 | **400** | `wc -l < src/main/release-evidence.test.ts`（前值 `git show HEAD:...`） |
| 64 位 sha256 字面量 | 27 | **0** | `rg -o '[0-9a-f]{64}' src/main/release-evidence.test.ts \| wc -l` |
| `toContain` 源码出现数 | 53 | **10** | `rg -o 'toContain' src/main/release-evidence.test.ts \| wc -l` |
| `readFileSync` 出现数 | 2 | **3** | `rg -o 'readFileSync' src/main/release-evidence.test.ts \| wc -l`（1 次台账读取 + 1 次证据读取 + import） |
| 该文件执行用例数 | 34 | **57** | `pnpm test src/main/release-evidence.test.ts` → `Tests 57 passed (57)` |
| 全仓测试文件 / 行数 | 115 / 48,120 | **115 / 47,809** | `rg --files \| rg '\.(test\|spec)\.(ts\|tsx\|mts\|cts\|js\|jsx)$'` + `wc -l` |
| 全仓非测试 `ts/tsx/mjs/mts` 文件 / 行数 | 145 / 32,104 | **145 / 32,104（未变）** | `git ls-tree -r --name-only HEAD \| rg '\.(ts\|tsx\|mjs\|mts)$' \| rg -v '\.(test\|spec)\.'`（本项未触碰非测试源码） |
| `pnpm test` 全仓 | 未单独留前值 | **114 files / 1790 passed / 1 skipped** | `pnpm test` |

说明：本文件用例 34 → 57（+23），其余测试文件零改动，因此全仓通过用例数不低于改动前。全仓测试行数下降 311 行 = 711 − 400，全部来自本文件压缩。

## 3. 篡改红证据（真实命令与输出）

### 3.1 资产行 sha256 篡改

```bash
cp docs/release-evidence-ledger.json /tmp/ledger.bak.json
node -e 'const fs=require("fs");const p="docs/release-evidence-ledger.json";const l=JSON.parse(fs.readFileSync(p,"utf8"));l.versions.find(v=>v.version==="v0.2.4").assets[0].sha256="0".repeat(64);fs.writeFileSync(p,JSON.stringify(l,null,2)+"\n")'
pnpm test src/main/release-evidence.test.ts
cp /tmp/ledger.bak.json docs/release-evidence-ledger.json
```

真实输出（节选）：

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/main/release-evidence.test.ts > v0.2.4 release evidence > exists, declares the version and carries the ledger status
+   "v0.2.4 资产「latest-linux.yml」sha256 与台账不一致",
 FAIL  src/main/release-evidence.test.ts > v0.2.4 release evidence > matches the ledger asset table row by row
AssertionError: v0.2.4 latest-linux.yml: expected { name: 'latest-linux.yml', …(2) } to deeply equal { name: 'latest-linux.yml', …(2) }
 FAIL  src/main/release-evidence.test.ts > v0.2.4 release evidence > closes the document digest set over the ledger
      Tests  3 failed | 54 passed (57)
```

### 3.2 extra digest 篡改

```bash
cp docs/release-evidence-ledger.json /tmp/ledger.bak.json
node -e 'const fs=require("fs");const p="docs/release-evidence-ledger.json";const l=JSON.parse(fs.readFileSync(p,"utf8"));l.versions.find(v=>v.version==="v0.2.5").extraDigests[0].sha256="0".repeat(64);fs.writeFileSync(p,JSON.stringify(l,null,2)+"\n")'
pnpm test src/main/release-evidence.test.ts
cp /tmp/ledger.bak.json docs/release-evidence-ledger.json
```

真实输出（节选）：

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/main/release-evidence.test.ts > v0.2.5 release evidence > exists, declares the version and carries the ledger status
+   "v0.2.5 证据文档缺少台账 digest「0000000000000000000000000000000000000000000000000000000000000000」",
 FAIL  src/main/release-evidence.test.ts > v0.2.5 release evidence > closes the document digest set over the ledger
      Tests  2 failed | 55 passed (57)
```

两次篡改后均已 `cp` 还原；还原后 `pnpm test src/main/release-evidence.test.ts` 回到 `Tests 57 passed (57)`，v0.2.4 `latest-linux.yml` 与 v0.2.5 `CandidateCDHashFull` 的 digest 已核对为原值。

## 4. 基线 53 处 `toContain` 的逐条替代映射

“基线行”指 `HEAD:src/main/release-evidence.test.ts` 的行号。新断言全部仍在同一测试文件内。

| # | 基线行 | 基线断言 | 替代断言（用例 / 形态） | 强度 |
| --- | --- | --- | --- | --- |
| 1 | 115 | `doc).toContain('v0.2.1')` | `$version release evidence > exists…`：`expect(text).toContain(node.version)`（`describe.each` 覆盖 5 版本） | 等价，覆盖 5 版本 |
| 2 | 124 | `toContain('git ls-remote --tags origin refs/tags/v0.2.1')` | 同用例 `spec.commands` | 等价 |
| 3 | 125 | `toContain('gh release view v0.2.1 --repo chaxiu/OpenCompare')` | 同用例 `spec.commands` | 等价 |
| 4 | 126 | `toContain('release not found')` | 同用例 `spec.identities` | 等价 |
| 5 | 127 | `toContain('缺失项')` | 同用例 `spec.sections`（`## 3. 缺失项`） | 等价（章节级） |
| 6 | 128 | `toContain('待人工动作')` | 同用例 `spec.sections`（`## 5. 待人工动作`） | 等价（章节级） |
| 7 | 129 | `toContain('升级')` | 同用例 `spec.sections`（`## 6. 升级说明`） | 等价（章节级） |
| 8 | 158 | `problems).toContain('status 必须为 verified 或 blocked')` | 负例 `rejects an unsupported status value`：`toMatch(/status 必须为 verified 或 blocked/)` | 等价 |
| 9 | 180 | `problems).toContain('verified 分支需记录两个不同产物的 SHA-256')` | 负例 `rejects a verified record with fewer than two distinct sha256 values`：`toMatch` 同文案 | 等价 |
| 10 | 194 | `problems).toContain('blocked 分支不得记录产物 SHA-256')` | 负例 `rejects a blocked record that carries an artifact sha256`：`toMatch` 同文案 | 等价 |
| 11 | 209 | `toContain('v0.2.2')` | 版本循环 `expect(text).toContain(node.version)` | 等价 |
| 12 | 219 | `toContain('<v0.2.2 dmg digest>')` | 台账 v0.2.2 `OpenCompare-0.2.2-arm64.dmg` 行 + `closes the document digest set over the ledger` | 更强（逐行 name/bytes/sha 全等 + 全量集合闭合） |
| 13 | 220 | `toContain('<v0.2.2 zip digest>')` | 台账 v0.2.2 `OpenCompare-0.2.2-arm64-mac.zip` 行 + 集合闭合 | 更强 |
| 14 | 235 | 8 条 forensic 命令循环 | `spec.commands`（v0.2.2 8 条） | 等价 |
| 15 | 242 | `toContain('CFBundleShortVersionString')` | `spec.markers` v0.2.2（min 1） | 等价 |
| 16 | 243 | `toContain('CFBundleIconFile')` | `spec.markers` v0.2.2（min 1） | 等价 |
| 17 | 251 | `toContain('<包内 icon digest>')` | 台账 v0.2.2 `extraDigests` + 集合闭合 | 更强（digest 必须同时出现在文档且被台账登记） |
| 18 | 255 | `problems).toContain('证据文件未声明 v0.2.2')` | 负例 `rejects a record that does not declare the expected version`：`toMatch(/证据文件未声明 v0\.2\.2/)` | 等价 |
| 19 | 301 | `['v0.2.4','39692988051','55d3af2…']` 循环 | 版本循环 + `spec.identities`（v0.2.4） | 等价 |
| 20 | 312 | `row).toContain('success')` | `$version CI jobs`：`expect(row).toContain('success')`（3 个 verified 版本表驱动） | 等价，覆盖 3 版本 |
| 21 | 348 | 9 条 mac 签名标记循环 | `spec.markers` v0.2.4（min 1） | 等价 |
| 22 | 350 | `toContain('CI 日志')` | `spec.sourceLabels` v0.2.4 | 等价 |
| 23 | 351 | `toContain('本机复核')` | `spec.sourceLabels` v0.2.4 | 等价 |
| 24 | 356 | `toContain('releases for v0.2.4: 1 …')` | `$version release uniqueness gate`（finalize 表驱动） | 等价，覆盖 v0.2.4/5/7 |
| 25 | 357 | `toContain('latest published release: v0.2.4 …')` | 同上 | 等价 |
| 26 | 358 | `toContain('11/11')` | 台账 11 行 + `matches the ledger asset table row by row` + 集合闭合 | 更强（行数与逐行 digest 全等） |
| 27 | 372 | Windows 缺陷 7 条措辞循环 | `v0.2.4 defect record`：解析 `## 7.` 表，断言 6 个行键、值非空、等级 `^P2`、现象同时含点号/连字符资产名 | 等价-结构（把自由文本措辞收紧为表格行契约） |
| 28 | 378 | `toContain('blockMapSize')` | `section facts`：`sectionText('## 6.…')` 内包含 | 等价 + 作用域收紧到 §6 |
| 29 | 379 | `toContain('*.AppImage.blockmap')` | 同上 | 等价 + 作用域收紧 |
| 30 | 380 | `toContain('内嵌')` | 同上 | 等价 + 作用域收紧 |
| 31 | 556 | `not.toContain('pending')` | ledger inspector `verified 记录不得残留 pending 字样` + 负例 `rejects a record that still carries a pending status` + `status:` 行数唯一 | 更强 |
| 32 | 580 | v0.2.5 五个签名标记 ≥2 循环 | `spec.markers` = `SIGNING_MARKERS`（min 2） | 等价 |
| 33 | 586 | `row).toContain('success')` | `$version CI jobs` | 等价 |
| 34 | 601 | `toContain('dmg 内 \`.app\`')` | `spec.sourceLabels` v0.2.5 | 等价 |
| 35 | 602 | `toContain('zip 内 \`.app\`')` | `spec.sourceLabels` v0.2.5 | 等价 |
| 36 | 603 | `toContain('codesign --verify --deep --strict --verbose=2')` | `spec.commands` v0.2.5 | 等价 |
| 37 | 604 | `toContain('codesign -dv --verbose=4')` | `spec.commands` v0.2.5 | 等价 |
| 38 | 605 | `toContain('xcrun stapler validate')` | `spec.commands` v0.2.5 | 等价 |
| 39 | 606 | `toContain('spctl -a -vv --type execute')` | `spec.commands` v0.2.5 | 等价 |
| 40 | 607 | `toContain('hdiutil detach')` | `spec.commands` v0.2.5 | 等价 |
| 41 | 612 | `toContain('release:metadata 校验通过：3 份 latest*.yml、11 个资产名。')` | `section facts` §5 | 等价 + 作用域收紧；3 份/11 个另由 metadata 用例与台账行数覆盖 |
| 42 | 613 | `toContain('旧错位名 0 命中')` | `section facts` §5 | 等价 + 作用域收紧 |
| 43 | 614 | `toContain('OpenCompare-Setup-0.2.5.exe')` | `section facts` §5 + 台账资产名 | 更强（资产名必须同时是台账登记资产） |
| 44 | 615 | `toContain('OpenCompare.Setup.0.2.5.exe')` | `section facts` §5 | 等价 + 作用域收紧 |
| 45 | 616 | `toContain('pnpm release:metadata --dir')` | `spec.commands` v0.2.5 | 等价 |
| 46 | 631 | §6 五条 handoff 措辞循环 | `section facts` §6 | 等价 + 作用域收紧（无表格载体，按 PRD「无法给出替代断言不得删除」保留） |
| 47 | 633 | `toContain('第 6 节')` | `section facts` §6 | 等价 + 作用域收紧 |
| 48 | 649 | `problems).toContain('资产「latest-linux.yml」sha256 与实测钉板不一致')` | 负例 `rejects an asset sha256 that does not match the ledger`：`toMatch(/资产「latest-linux\.yml」sha256 与台账不一致/)` | 等价（措辞随台账化更新，期望值来自台账） |
| 49 | 658 | `problems).toContain('资产表必须恰好 11 行，实际 10 行')` | 同负例 `toMatch` 同文案 | 等价 |
| 50 | 659 | `problems).toContain('资产表缺少「OpenCompare-0.2.5.AppImage」')` | 同负例 `toMatch` 同文案 | 等价 |
| 51 | 668 | `problems).toContain('全文必须恰好一处 status: 行')` | 负例 `rejects a record that still carries a pending status`：`toMatch` 同文案 | 等价 |
| 52 | 669 | `problems).toContain('verified 记录不得残留 pending 字样')` | 同负例 `toMatch` 同文案 | 等价 |
| 53 | 706 | v0.2.7 九条标识循环（含 digest/tag/run/blocked/ZenMind/Δ3/116 ms） | digest → 台账行 + 集合闭合；tag/run → `spec.identities`；ZenMind/Δ3/116 ms → `section facts` §7；`blocked` ≥4 → `occurrences(§7,'blocked') >= 4` | 更强（digest 从子串变为逐行全等 + 集合闭合） |

同时退役并被更强断言替代的非 `toContain` 断言：

- 基线 v0.2.4 的“全文 digest 集合 == 11 个资产 digest” → `closes the document digest set over the ledger`（含 extraDigests，双向闭合）。
- 基线 v0.2.5 `inspectV025Evidence` 的 11 行/未登记资产名/缺资产/digest 钉板 → `inspectLedgerEvidence` 同名问题 + 负例 8–10；`待回填/TBD/TODO/FIXME`、v0.2.5 尖括号占位、空 `text` 代码块仍在该 inspector 内断言。
- 基线 v0.2.5 `inspectV025Evidence` 的 release identity / metadata / product-qa 文本检查 → `spec.identities`、`v0.2.5 metadata hits`、`section facts` §5/§6。

## 5. 保留的 10 个 `toContain` 源码点及理由

| # | 新文件位置 | 断言形态 | 保留理由 |
| --- | --- | --- | --- |
| 1 | `$version release evidence` | `expect(text).toContain(node.version)` | 版本存在性（PRD 允许的“版本”） |
| 2 | 同上 | `toContain(heading)` over `spec.sections` | 章节存在性 |
| 3 | 同上 | `toContain(command)` over `spec.commands` | 命令名 |
| 4 | 同上 | `toContain(identity)` over `spec.identities` | 版本/公开链接/run id/commit/Release id/blocked 原始输出标识 |
| 5 | 同上 | `toContain(label)` over `spec.sourceLabels` | 来源标注（CI 日志 / 本机复核 / dmg·zip 来源） |
| 6 | `$version section facts` | `toContain(fact)` over `sectionText(heading)` | 章节内技术事实；作用域比基线更严（必须落在指定章节） |
| 7 | `$version CI jobs` | `expect(row).toContain('success')` | job 名 + 结论，表驱动 |
| 8 | `$version release uniqueness gate` | `toContain('releases for …')` | finalize 门 CI 原文 |
| 9 | 同上 | `toContain('latest published release: …')` | latest 门 CI 原文 |
| 10 | `v0.2.1 blocked record` | `toContain(heading)` for §4/§5/§6 | 章节存在性 |

风险提示：第 6 项包含 v0.2.5 §6 product-qa 交接清单的自由文本（无表格载体）。这是按 PRD「无法给出替代断言的文本断言不得删除」保留，但作用域已从全文收紧到指定章节；若评审认为仍属“逐句措辞”，可将其降为“§6 存在 + ≥5 条 bullet”的结构断言，但会弱于基线，故未自行删除。

## 6. 门禁执行情况

本 Agent 已执行并绿：

- `pnpm install --frozen-lockfile` → `Done in 1.5s`
- `pnpm lint` → 无输出（0 error）
- `pnpm typecheck` → 无输出（0 error）
- `pnpm test src/main/release-evidence.test.ts` → `Tests 57 passed (57)`
- `pnpm test` → `114 files / 1790 passed / 1 skipped`

其余 `.munk/code-gates.json` 门禁（`build` / `build-web` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-*` / `verify-release-gate`）按流程由 Host 在 `code_gates` 阶段统一执行；本 Agent 未改门禁矩阵，也未把未执行的门写成绿。

## 7. 缺口与风险

- 无功能缺口。台账 schema 严格按 PRD：`versions[].{version,status,assets[].{name,bytes,sha256},extraDigests[].{label,sha256}}`。
- `readFileSync` 由 2 增至 3：新增一次台账读取，且证据文档按版本缓存，单次读取。
- 全仓非测试源码 145 / 32,104 与基线一致（本项零触碰）；该计数含 `.munk/changes/wi_ws_6ece0152a47c9c1a/verify-release-notes.mjs`，`.gitignore` 感知的 `rg` 会漏掉它，故用 `git ls-tree HEAD` 口径报告。
- 未推 tag、未 dispatch、未改任何已公开 Release 或资产。
