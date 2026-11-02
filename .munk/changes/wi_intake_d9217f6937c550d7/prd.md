# 把 release 资产/品牌与打包测试台账外置到 fixtures 并改为表驱动断言

## 范围

基线 `main = 3467844`（本 worktree 干净）。本项是 **test-only 清债**：只动两个测试文件与新增 fixtures 数据文件，不改任何产品行为、不改版本单点文件。

| 指标 | 基线实测（本 worktree，3467844） |
| --- | --- |
| `src/main/release-artifacts-and-brand.test.ts` | 926 行 / 152 处 `toContain` / 12 处 `readFileSync` / 66 个静态 `it()` |
| `src/main/release-packaging.test.ts` | 915 行 / 99 处 `toContain` / 2 处 `readFileSync` / 56 个静态 `it()` + 5 处 `it.each` |
| 两文件执行用例数 | **286 passed**（`pnpm test src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts`） |
| 两文件合计 | **1,841 行 / 251 处 `toContain` / 14 处 `readFileSync`** |
| 全仓测试文件 / 行数 | 115 / 47,809 |
| 全仓非测试 `ts/tsx/mjs/mts` | 145 / 32,104 |
| `package.json#version` | `0.2.16` |

现状问题：`release.yml` 步骤内容、发布说明/README/流程文档措辞、Windows 资产名清单、图标尺寸表、签名 secret 清单、entitlements key 清单、AppImage 取证常量、证据台账等**期望数据**被手抄进 TS 并逐条 `toContain`，合计 251 处原文断言；改一处发布面文案或台账就要改测试代码，且注入一个字段很难定位红点。

本项做两件事：

1. 把上述台账/期望数据外置为 fixtures：`src/main/__fixtures__/release-artifacts-and-brand.json` 与 `src/main/__fixtures__/release-packaging.json`（UTF-8 JSON、可 `JSON.parse`）。
2. 两个测试文件改为**数据驱动遍历 + 结构/不变量断言**：每条 fixture 行被 `it.each` / 遍历消费，断言仍全部留在**这两个测试文件内**；基线 251 处原文断言逐条给出替代映射，不允许「删除不替代」或「搬到别的文件绕行数」。

## Acceptance Criteria

- ac-line-budget: `wc -l src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts` 的两文件合计 ≤ **1,100**；且任一文件 < 120 行或 > 600 行即失败（禁止把内容集中/抽空到单文件规避合计）。

- ac-tocontain-budget: `rg -o 'toContain' src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts | wc -l` ≤ **20**（含 `not.toContain`）；保留项只允许是通用断言 helper（每个 helper 内 1 处）或版本/路径/章节存在性，交付逐条列出保留理由。

- ac-readfilesync-budget: 同上两文件 `rg -o 'readFileSync'` 合计 ≤ **4**，且每一处只允许是通用 loader（fixtures JSON / 产品文本产物 / 产品二进制产物）；`src/main/release-doc-fixtures.test-helpers.ts` 的 `readFileSync` 出现次数不得高于基线 **14**；不得新增 `*.test-helpers.ts` / `.mjs` / script 来承载读取或断言。

- ac-fixtures-exist-and-parse: 两个 fixture 文件存在、UTF-8 可 `JSON.parse`、顶层含 `schemaVersion`（数字）与具名分节；除这两个 JSON 外不得新增 `.json/.yaml` fixtures；fixtures 中不得写死当前版本字面量（`0.2.16`），版本派生自 `package.json`（历史已发布 tag 如 `v0.2.16` / `v0.2.15` 可作为冻结历史事实出现）。

- ac-ledgers-externalized: 下列台账类数据必须来自 fixtures 并由测试遍历断言，TS 中不留手抄副本（逐项以 `rg` 证明 0 残留）：
  - 图标资产表（svg / 1024 PNG / 16·32·64·128·256·512·1024 PNG / icns / ico 的路径、头部签名、声明尺寸、最小字节数）；
  - `release.yml` 步骤期望表（步骤名 → `if` 条件、必须包含的 token、禁止出现的 token、步骤相对顺序）；
  - Windows 资产名模板与 `latest.yml` 条目集合（由 `${productName}` / `${version}` / `${arch}` / `${ext}` 渲染，不写死版本）；
  - 发布说明 / README / `docs/release-process.md` / `docs/release-signing.md` / `docs/brand-assets.md` 的结构与 marker 表（章节标题、marker、句子数、禁用措辞）；
  - electron-builder 期望表（appId / productName / mac·win·linux 图标与 target / nsis artifactName / publish / protocols / extraResources）；
  - 签名 secret 清单、mac entitlements key 清单、workflow 凭据/公证分支 marker；
  - AppImage 取证夹具（声明 `blockMapSize`、尾部 4 字节、metadata 模板、负例取值）；
  - 证据台账的「版本 → 状态 → 资产行数」映射（现有 evidence 目录解析层保留，期望值来自 fixture）。

- ac-table-driven-expansion: 台账遍历使用 `it.each` / `describe.each` 展开，fixture 增删一行即用例数随之变化；禁止把多行数据压进一个 `forEach` 里堆内联 `toContain`（受 ac-tocontain-budget 约束）；遍历中每条 fixture 行的**全部叶子字段**都必须参与至少一条断言，不得存在仅作展示、无断言的字段。

- ac-injection-red: 交付必须贴出至少 3 次真实注入的**失败输出原文**，且每次注入后 `git checkout` 恢复并复跑回绿：
  1. 改 `.github/workflows/release.yml` 任一被断言字段（如某步骤的 `if:` 或步骤内 token）；
  2. 改任一 fixture 的期望字段（如品牌图标路径、资产名模板、notes marker）；
  3. 改证据台账数据（`docs/release-evidence/<tag>.md` 资产行/资产数，或 fixture 中对应版本映射）；
  失败信息必须点名步骤/条目（可定位），不得只报一个通用 `toEqual` 差异。

- ac-cases-no-drop: 两文件执行用例数 ≥ **272**（基线 286，降幅 ≤5%）；`pnpm test src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts` 输出 `Tests <N> passed` 且 `N >= 272`；不得出现 `skip` / `only` / `todo` / 注释掉的断言。

- ac-coverage-report: 交付的「覆盖率」必须给出两个可机械复现的口径，并说明第三种为何不可用：
  - 断言点替代覆盖 = 有替代映射的基线 `toContain` 断言点数 / **251** = **100%**（映射表必须 251 行，逐条含基线行号）；
  - 台账行断言覆盖 = 被至少一条执行中断言消费的 fixture 台账行数 / 台账行总数 = **100%**，由测试内不变量自证（如 `expect(referencedIds.size).toBe(allRowIds.length)`），并贴该用例通过输出；
  - 仓库未安装 coverage provider（实测 `pnpm exec vitest run --coverage --coverage.provider=v8` → `MISSING DEPENDENCY: @vitest/coverage-v8`），本项禁止新增依赖/脚本，故**不得编造行覆盖率数字**；如用零依赖方式（`NODE_V8_COVERAGE` + 临时脚本、不入库）取得 before/after，可作附注并标明口径。

- ac-replacement-mapping: `delivery-notes.md` 必须含逐条表：基线文件 + 行号 + 原文断言 → 替代断言（fixture 行 id / 用例名 / 断言形态）→ 强度（等价 / 更强 / 作用域收紧）。基线 251 处 `toContain` 一处不漏；任何无法给出替代断言的文本断言不得删除。

- ac-no-assertion-relocation: 变更集只允许：两个测试文件、两个新 fixtures JSON、`delivery-notes.md`；共享 helper 允许「不改」或仅新增**无 `expect`** 的数据访问导出；不得新增 `*.test.ts`，不得把断言移入 helper / `docs/` / `.munk/` / `scripts/`，不得让任一测试文件退化为纯数据加载器。

- ac-version-frozen: `package.json#version` 保持 `0.2.16`；`CHANGELOG.md`、`README.md` / `README.zh-CN.md` 第 5 行、`.github/workflows/release.yml`、`docs/release-notes/**`、`electron-builder.yml` 相对基线 **0 diff**（注入实验后必须恢复）；不改任何产品源码（`src/main/**` 非测试、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**`）。

- ac-gates-green: `.munk/code-gates.json` 保持 0 改动；在自身 worktree 依次跑通其全部门禁（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-*` / `verify-release-gate`），交付附命令与结论；任何门未绿不得改门、删断言或跳过。

- ac-delivery-receipt: `delivery-notes.md` 必须写出**改前 / 改后实测数字**（不允许估计）：各文件行数、两文件合计行数、`toContain` 数、`readFileSync` 数、执行用例数、覆盖率两口径数字（含 251 映射 100% 与台账行覆盖 100%）、全仓总测试行数（基线 115 文件 / 47,809 行）与全仓非测试源码不变说明，以及 3 次注入的失败输出原文和恢复回绿证据。

- ac-deadline-honesty: 北京时间 **20:30 硬停**（公司 23:00 发版）；若到点仍无法全绿，立即停下如实交付：失败门、真实报错、缺口清单；不得降门、删断言、跳过用例或把红写成绿。

## Non-Goals

- 不改任何产品行为与产品源码；不改 `electron-builder.yml` / `package.json`（含依赖、scripts）/ `.github/workflows/**` / 任何文档正文。
- 不 bump 版本，不推 tag，不 dispatch release，不改写已公开 Release 或资产。
- 不新增 / 升级依赖，不加 `@vitest/coverage-v8`，不改 `vitest.config.mts`，不加 script，不改 `.munk/code-gates.json`。
- 不新增测试文件、不把断言搬进 `.munk/` / `docs/` / `scripts/` / 新 helper 来绕行数与 `toContain` 预算。
- 不重写或扩写 `docs/release-evidence/*.md` 正文，不扩大 evidence 覆盖版本面。
- 不做与清债无关的格式化 / 重排 / 措辞润色。

## Implementation Constraints

- fixtures 固定放在 `src/main/__fixtures__/`：`release-artifacts-and-brand.json` 与 `release-packaging.json`；不允许放到 `.munk/`、`docs/` 或测试文件内。
- 期望数据只放 fixtures；**产品文件仍是被测对象**（`release.yml` / `package.json` / `electron-builder.yml` / docs / README / 图标字节在运行时读取），禁止把产品文件整段复制进 fixture（会把「篡改产品文件」变成静默通过）。
- fixture 结构建议（键名可微调，但语义必须落地）：
  ```json
  {
    "schemaVersion": 1,
    "brandAssets": [{ "id": "png-main", "path": "build/icon.png", "kind": "png", "width": 1024, "height": 1024 }],
    "docs": [{ "path": "docs/brand-assets.md", "tokens": ["自制", "可替换"] }],
    "sources": [{ "path": "src/main/index.ts", "matches": ["resolveBrandIconPath\\("], "notMatches": ["\\b\\d+\\.\\d+\\.\\d+\\b"] }],
    "workflowSteps": [{ "id": "app-identity", "name": "Locate the packaged app and assert its icon and version", "if": "matrix.target == 'mac'", "tokens": ["CFBundleIconFile"], "notMatches": ["mac-arm64"], "order": 30 }],
    "assets": { "setupName": "${productName}-Setup-${version}.${ext}", "winZipName": "${productName}-${version}-win-${arch}.${ext}" },
    "notesSections": [{ "doc": "releaseNotes", "heading": "Windows portable download", "sentences": 2 }],
    "signingSecrets": ["CSC_LINK"],
    "entitlements": ["com.apple.security.cs.allow-jit"],
    "appImageFixture": { "declaredBlockMapSize": 126884, "tailHex": "0001efa4" },
    "evidence": [{ "version": "v0.2.16", "status": "verified", "assets": 12 }]
  }
  ```
- `release.yml` 期望按**步骤名**索引（不是行号），同时断言 `if`、token 集合、禁用 token 与相对顺序；步骤名被改动时查找失败即红。
- 版本与资产名一律模板化渲染（`${productName}` / `${version}` / `${arch}` / `${ext}`），由 `package.json#version` 派生；fixture 不写死当前版本。
- 断言 helper 形态（每个文件 1~2 个，`toContain` 只出现在 helper 内）：`expectTokens(text, tokens, label)` / `expectNone(text, patterns, label)` / `expectOrder(...)`；断言消息必须带 fixture 行 `id` 与步骤名，保证注入可定位。
- 读取方式：每文件 1 个 `loadFixture()` + 至多 1 个 `readBytes()/readText()` 通用读取；禁止在循环或每条断言里重复 `readFileSync`。
- 注入实验命令模板（交付需贴真实输出）：
  ```bash
  cp .github/workflows/release.yml /tmp/release.yml.bak
  # 篡改单个字段
  pnpm test src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts
  cp /tmp/release.yml.bak .github/workflows/release.yml
  ```
- 覆盖率口径固定为 ac-coverage-report 的两项；不得用「用例数」冒充「覆盖率」。
- 20:30 为硬时限；超时按 ac-deadline-honesty 交付，不降门。
