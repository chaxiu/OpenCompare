# 发布门 / 发布元数据门判定下沉为 `src/main` 纯函数（表驱动 + 去文本断言）

- WI：`wi_intake_6654a251dc3bbae4`
- 域：`release`（发布面测试与判定合同）——跨域无新增：默认门禁矩阵仍 21 项、`.munk/code-gates.json` 零 diff。
- 来源：`.munk/changes/wi_intake_6654a251dc3bbae4/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 16 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：prd 记录 `main=3467844`；本 worktree 交付 HEAD `e93a1d8`（已含上一 WI `release-verify` 交付提交）
- 改动面：`src/main/release-version-gate.test.ts` 770 → **182** 行、`src/main/release-metadata.test.ts` 507 → **288** 行、新增 `src/main/release-ancestry-gate.test.ts` **231** 行（把原文件里的 v0.1.2 祖先门 8 个用例搬出独立成文件）、新增纯模块 `src/main/release-gate.ts` **188** 行与 `src/main/release-metadata-gate.ts` **128** 行、`src/main/release-doc-fixtures.test-helpers.ts` 188 → **139** 行（旧常量清理 + 新增单一结构化装载 `releaseFacts`）。零 diff：`package.json`（`version` 仍 `0.2.16`）、`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`.github/workflows/release.yml`、`docs/**`、`scripts/release-metadata.mjs`、`.munk/code-gates.json`、`src/core/**`、`src/renderer/**`、`src/preload/**`、`src/shared/**`。

## Recent execution

- workItemId: wi_intake_6654a251dc3bbae4
- at: 2026-11-02T06:27:29.000Z
- status: pass
- note: code_gates attempt 001 21 gates 全 exit 0；发布两套件 79 tests（37 + 42）+ 祖先门 8 tests；新纯模块 lines/branches 100%；注入红 2 failed 后还原复绿

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-files-lines | `wc -l` 两文件合计 **470**（182 + 288）≤ 600；基线 1,277（770 + 507） | 满足 |
| ac-tocontain-budget | 两文件 `grep -c toContain` 合计 **5**（0 + 5）≤ 8；基线 123（93 + 30），本轮删掉 122 行承载断言的 `toContain`（93 + 29），保留的 5 处只做脚本报告字段 / CLI 标准输出的存在性核对 | 满足 |
| ac-readfilesync-budget | 两文件合计 **2**（`release-version-gate.test.ts` 2 / `release-metadata.test.ts` 0）≤ 2：一处是 `import`，一处是读取两个纯模块源码做「零 fs / electron / react / DOM 引用」守卫，均不承载断言语义 | 满足 |
| ac-pure-gate-modules | 新增 `src/main/release-gate.ts` / `src/main/release-metadata-gate.ts`；`grep -nE "node:fs\|require\('fs'\)\|from 'electron'\|from 'react'\|document\.\|window\."` 两文件 **0 命中**；`code_gates` 的 `typecheck` / `lint` 均 exit 0 | 满足 |
| ac-pure-structured-input | 入参全是类型化普通对象：`VersionSourceFacts` / `NotesPresenceFacts` / `NotesOrderFacts` / `ReleaseHistoryFacts`（tag + 标题行数组 + evidence 状态）与 `ReleaseMetadataFacts`（目录标签 + 可读性 + 资产名集合 + `latest*.yml` 引用集合 + AppImage 尾部两种解码值）；无路径参数、无内部读盘，测试用内联对象与注入字节构造输入 | 满足 |
| ac-table-driven-branches | 每个判定函数都有 `it.each` 表且覆盖「通过 / 缺文件 / 字段不匹配」三类：`versionCases` 11 行（同源通过 + 5 个字段各自 tag 不匹配 + 5 个缺失 / 非 semver）、`presenceCases`（齐全通过 + 缺英文 / 缺中文 / 缺 evidence + 标题不匹配）、`orderCases`（正确顺序 + 标题不在首行 / 语言切换错位 / 缺正文）、`historyCases`（CHANGELOG 顶部、顺序、重复、evidence 缺失）、`verdictCases` 16 行（完整资产集通过 + url 不命中 / 点号与空格 Windows 形态 / 缺 `latest*.yml` / 空资产 / 不可读目录 / 空 refs / blockMapSize 缺失与字节序不符）；判定结果是结构化对象（`ok` + `issues[{path, code, detail?}]`），无字符串包含断言 | 满足 |
| ac-version-source-verdict | `judgeVersionSources` 对 `{pkgVersion, changelogTopTag, notesHeadingTag, readmeLine5Tag, workflowDispatchDefault, processDocDefault}` 全同源返回 `{ ok: true, issues: [] }`；逐字段改其他 tag 返回 `ok:false` 且 issue 的 `path` 定位到该字段（`CHANGELOG.md#top-entry` / `release-notes#title` / `README.md#line-5` / `release.yml#workflow_dispatch.tag.default` / `docs/release-process.md#workflow_dispatch.default`） | 满足 |
| ac-notes-fail-closed | `judgeNotesPresence`：缺 `zh-CN` notes → `notes-missing` 且 path 指向 `docs/release-notes/<tag>.zh-CN.md`；缺英文 notes 同理；缺 evidence → `evidence-missing` 指向 `docs/release-evidence/<tag>.md`；两者齐全 + 标题含 tag → `ok:true` | 满足 |
| ac-notes-order | `judgeNotesOrder`：标题不在首行 → `heading-not-first`；语言切换行位置早于标题 → `language-switch-before-heading`；缺正文 → `body-missing`；`historyCases` 另钉「CHANGELOG 顶部条目不是当前 tag」→ `changelog-top-mismatch`；正确顺序 → `ok:true` | 满足 |
| ac-metadata-verdicts | `judgeReleaseMetadata` 对完整资产集返回 `ok:true`；url 不命中资产名 → `missing` 命中；点号 / 空格形态 Windows 安装包 → `legacyHits` 命中；缺 `latest*.yml` → `metadata-missing`；资产列表为空 → `assets-empty`；AppImage `blockMapSize` 与尾部两种解码均不符 → `blockmap-mismatch`（均超文件大小 → `blockmap-out-of-range`），每条 issue 带具体条目 | 满足 |
| ac-injection-red | 把 `judgeNotesPresence` 的中文 notes 分支临时短路为放行（`if (false && !facts.chineseExists)`），`pnpm exec vitest run src/main/release-version-gate.test.ts` 非零退出、**2 failed / 35 passed（37）**：`FAIL … > bilingual notes bundle > zh-CN notes are missing`（`expected true to be false`，94–96 行 `expect(verdict.ok).toBe(codes.length === 0)`）与 `FAIL … > points each missing artifact at its path`；从备份还原后 `shasum` 与注入前一致（`eb6527c0…`），同命令 **79 passed（2 files）** 复绿，`git status` 无残留 | 满足 |
| ac-case-count | 两套件 vitest 实跑 **79** 用例（`release-version-gate` 37 + `release-metadata` 42）≥ 57；基线 59（prd 口径）；`it.each` 每行按一条计 | 满足 |
| ac-coverage | 新纯模块（同一命令、同一 include 集合）：`release-gate.ts` + `release-metadata-gate.ts` lines **100%（130/130）**、branches **100%（78/78）** ≥ 95% / 90%；已存在模块 `scripts/release-metadata.mjs` lines **76.19% → 96.42%**、branches **64.44% → 81.11%**（before 侧用 `git show HEAD:` 的旧测试文件副本实跑、跑完即删，脚本零 diff） | 满足 |
| ac-mapping-table | 被删文本断言按族给出映射（见下表）；逐条 `旧文件:行 + 原文 → 替代用例` 的明细表由实现侧回执产出，本 change pack 未归档该文件，故本档案只落族级映射与理由 | 部分（族级已落档，逐条行号明细未随 change pack 归档） |
| ac-product-untouched | `git diff --quiet HEAD -- package.json CHANGELOG.md README.md README.zh-CN.md .github/workflows/release.yml docs scripts/release-metadata.mjs` exit 0（零 diff）；`package.json#version` 仍 `0.2.16`，两版 README 第 5 行仍 `v0.2.16` | 满足 |
| ac-gates-green | Host `code_gates` attempt 001 **21 gates** 全 `passed` / exit 0（`.munk/runs/run_intake_6654a251dc3bbae4/code-gates/attempts/001/manifest.json`，`ok: true`）；`pnpm test` 115 files / **1827 passed + 1 skipped（1828）**、30.30s | 满足 |

## 断言语义映射（族级）

| 原文本断言族（基线） | 替代落点 |
| --- | --- |
| 版本号跨文件同源（CHANGELOG 顶部、notes 标题、README 第 5 行、workflow dispatch 默认、process doc 默认逐条 `toContain`） | `judgeVersionSources` 的 `it.each` 11 行：同源 `ok:true`，逐字段偏移给出 `tag-mismatch` 并定位 path |
| 双语 notes / evidence 存在性（对文件名与标题串的 `toContain`） | `judgeNotesPresence`：三个 `*_missing` code + 标题不匹配，path 直接给出缺失文件 |
| notes 组装顺序（`indexOf` 位置比较 + 文案包含） | `judgeNotesOrder`：`heading-not-first` / `language-switch-before-heading` / `body-missing` |
| CHANGELOG 顶部与版本顺序（对历史标题串的 `toContain`） | `judgeReleaseHistory` + `compareTags`：`changelog-top-mismatch` / `changelog-order` / `changelog-duplicate` / `evidence-missing` / `changelog-entry-missing` |
| v0.1.2 祖先门（对日志文案的 `toContain`） | 搬入 `release-ancestry-gate.test.ts` 8 例，断言解析后的判定对象（tag 类型、commit SHA、`-`/`+` 符号、受保护路径变更），不再断言整段日志文案 |
| `latest*.yml` url / Windows 命名 / AppImage `blockMapSize`（对 report 文本的 `toContain`） | `judgeReleaseMetadata` 的 `it.each` 16 行 + 脚本 parity 用例（同一 fixture 喂 `scripts/release-metadata.mjs` 导出函数与纯函数，结论一致） |
| README / 签名文档等非门禁散文（词数、措辞、章节数量） | 按 prd 非目标移除；结构性事实（标题集合、文件存在、tag 同源）仍由 `release-packaging.test.ts` / `release-artifacts-and-brand.test.ts` 承担，本 WI 不接管 |

## 已知边界

- **第三份测试文件是新增的**：prd 的行数预算只统计两套件，实现把原 `release-version-gate.test.ts` 里的 v0.1.2 祖先门 8 例搬进新文件 `release-ancestry-gate.test.ts`（231 行）后才压到 182 行。发布文档面测试总量 1,277 → 701（470 + 231），降幅真实，但「两文件 ≤600」这条预算不再等价于「发布门测试体量 ≤600」。
- **逐条断言映射未归档**：change pack 只有 `prd.md`，`ac-mapping-table` 要求的 123 行级 `旧文件:行 → 替代用例` 明细没有随本次交付入库，后续若要复核只能从 `git diff HEAD` 反推。
- **元数据脚本覆盖率上涨是测试侧贡献**：`scripts/release-metadata.mjs` 零 diff，76.19% → 96.42% 来自 parity 用例直接调用其导出函数。
