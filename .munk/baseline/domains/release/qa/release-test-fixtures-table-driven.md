# release 资产/品牌与打包测试台账外置 fixtures + 表驱动断言

- WI：`wi_intake_d9217f6937c550d7`
- 域：`release`（发布面测试的数据载体与断言口径；被测对象是 `release.yml` / `package.json` / `electron-builder.yml` / README / `docs/**` / 图标字节，不是产品行为）
- 来源：`.munk/changes/wi_intake_d9217f6937c550d7/prd.md` + `delivery-notes.md`（本 WI change pack **只有这两份**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 15 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main = 3467844`（`src/main/release-artifacts-and-brand.test.ts` 926 行 / 152 `toContain` / 12 `readFileSync` / 66 个 `it()`；`src/main/release-packaging.test.ts` 915 行 / 99 `toContain` / 2 `readFileSync` / 56 个 `it()` + 5 处 `it.each`；两文件合计 1,841 行 / 251 `toContain` / 14 `readFileSync` / 286 passed）
- 改动面（除 change-pack 与 `.munk/baseline/**`）：`src/main/release-artifacts-and-brand.test.ts` 926 → 396、`src/main/release-packaging.test.ts` 915 → 484，新增 `src/main/__fixtures__/release-artifacts-and-brand.json`（814 行 / 61 行台账）与 `release-packaging.json`（786 行 / 75 行台账）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-line-budget | `wc -l` 两文件 → **396 + 484 = 880** ≤ 1,100；各自落在 120–600（396 / 484） | 满足 |
| ac-tocontain-budget | `rg -o 'toContain'` 两文件 → **8** ≤ 20；真实断言 4 处（每文件 `expectTokens` 1 + `expectAbsent` 1），另 4 处为 helper 注释单词，用例体内零直接调用；逐条理由见交付说明 §1 | 满足 |
| ac-readfilesync-budget | `rg -o 'readFileSync'` → **4** ≤ 4（每文件 1 个 import + 1 个通用 `readBytes` / `readText` loader）；未新增 `*.test-helpers.ts` / `.mjs` / script | 满足 |
| ac-fixtures-exist-and-parse | 两份 fixture `JSON.parse` 通过、顶层 `schemaVersion: 1`（`expect(fixture.schemaVersion, 'schemaVersion').toBe(1)` 各 1 例）与具名分节（A：`brandAssets` 11 / `builderRows` 13 / `sources` 3 / `steps` 9 / `stepOrder` 3 / `finalizeGates` 5 / `docs` 8 / `notesSections` 2 + policy 对象；B：`packageRows` 5 / `builderRows` 13 / `entitlements` 3 / `docs` 2 / `steps` 8 / `stepOrder` 2 / `workflowChecks` 4 + releaseBody / notesLinks / bodyAssembly / bodyGate / linkGate / appImage / signing / evidence）；仅这两个 JSON，无新增 `.json/.yaml` fixture；全文 `0.2.16` 仅作为 `evidence-v0.2.16` / `version: v0.2.16` 冻结历史事实出现 | 满足 |
| ac-ledgers-externalized | 台账由 fixtures 分节承载并被测试遍历；两测试文件对 `CFBundleIconFile\|notarization successful\|artifactName\|blockMapSize` 的 `rg` 命中 **0**（无手抄副本）；产品文件仍在运行时读取，未被复制进 fixture | 满足 |
| ac-table-driven-expansion | `it.each` / `describe.each` 消费 136 行台账（A 61 / B 75），文件末尾不变量用例断言「消费 id 全集 == 台账 id 全集」且 id 无重复；逻辑台账（`stepOrder` / `finalizeGates`）走顺序表；`Tests 330 passed (330)`（基线 286，增量即展开行数） | 满足 |
| ac-injection-red | 三次注入均变红并点名条目，恢复后回绿（原文见交付说明 §3）：① `release.yml` Windows update feed 步骤 `if:` 改 `linux` → `windows-feed satisfies …: expected 'matrix.target == \'linux\'' to be 'matrix.target == \'win\''`；② fixture `steps[mac-app-identity].tokens` 的 `CFBundleIconFile` 改成 `CFBundleIconFileX` → 报错点名行 id + 步骤名 + 缺失 token；③ `docs/release-evidence/v0.2.16.md` 资产数 12 → 13 → `v0.2.16: 资产数: expected 13 to be 12`（同时点亮资产行计数用例） | 满足 |
| ac-cases-no-drop | 两文件单跑 **330 passed (330)** ≥ 272；全仓 `pnpm test` 114 files / 1835 passed + 1 skipped（1836），不低于基线；`it.skip\|describe.skip\|it.only\|it.todo` 命中 **0**，无注释掉断言 | 满足 |
| ac-coverage-report | ① 断言点替代覆盖 **251 / 251 = 100%**（映射表 251 行逐条含基线行号，生成脚本对 152 + 99 条断言做区间覆盖校验，输出 `mapping rows: 251`）；② 台账行覆盖 **136 / 136 = 100%**，由 `fixture ledger coverage > consumes every fixture row exactly once by id` 自证（id 全集全等 + 无重复）；③ 行覆盖率不可用：`vitest run --coverage --coverage.provider=v8` → `MISSING DEPENDENCY: @vitest/coverage-v8`，本项禁止新增依赖，故不编造数字 | 满足 |
| ac-replacement-mapping | 交付说明 §6 逐条表：A 152 行 + B 99 行，共 **251** 行，每行含基线文件 / 行号 / 原文断言 / 替代断言（fixture 行 id / 用例名 / 断言形态）/ 强度（等价 / 更强 / 作用域收紧） | 满足 |
| ac-no-assertion-relocation | `git status --short` 仅两个测试文件（M）+ 未跟踪 `src/main/__fixtures__/`；无新增 `*.test.ts`，断言未移入 helper / `docs/` / `.munk/` / `scripts/`；测试文件仍承载全部断言与读取 | 满足 |
| ac-version-frozen | `package.json#version` = **0.2.16**；`git diff --stat -- package.json CHANGELOG.md README.md README.zh-CN.md .github docs electron-builder.yml` 输出为空；产品源码零改动；未打 tag / push / dispatch | 满足 |
| ac-gates-green | `.munk/code-gates.json` 零 diff；Host `code_gates` attempt 001 **21 门**全 exit 0（`.munk/runs/run_intake_d9217f6937c550d7/code-gates/attempts/001`，`latest.json` `ok: true` / `failedGateIds: []`），`test` 门 114 files / 1835 passed + 1 skipped | 满足 |
| ac-delivery-receipt | 交付说明 §1 改前 / 改后实测数字（行数 / `toContain` / `readFileSync` / 用例 / fixture 台账行 / 全仓测试文件与行数 / 非测试源码 145 / 32,104 不变）、§2 覆盖率两口径、§3 三次注入原文与恢复证据、§5 版本面 0 diff | 满足 |
| ac-deadline-honesty | 全绿交付，无缺口；未降门、未删断言、未跳过、未把红写绿 | 满足 |

## 口径与陷阱注记

- **fixtures 只放期望值，不放产品文件**：把 `release.yml` 整段复制进 fixture 会让「篡改产品文件」静默通过；产品文件必须在运行时读取，fixture 只描述「应该长什么样」。
- **表驱动必须证明「每行都被断言」**：`it.each` 展开只说明行被执行，不说明行内字段被消费；本轮用 `useRow(id)` 收集消费 id 并与台账 id 全集全等比较，才能防「新增一行只被展示」。
- **`toContain` 预算的正确解法是换断言形态**：保留的 8 处全在 helper 内（4 处真实调用 + 4 处注释），其余语义改为精确相等 / 数组全等 / 字节头 / 切片顺序；用删除代替替代会掉断言强度。
- **注入红要能定位**：断言消息必须带 fixture 行 `id` 与 `release.yml` 步骤名，否则一次失败只剩通用 diff，无法判断是哪个台账行退化。
- **版本冻结是硬边界**：fixtures 不写当前版本字面量，资产名 / notes 路径一律模板渲染；已发布 tag 可作历史事实（如 `evidence-v0.2.16`），但不得成为「当前版本」的第二真源。
- **读取预算已满**：`readFileSync` 4/4，后续新增断言必须复用两个通用 loader，不得为单条断言再开读取。
