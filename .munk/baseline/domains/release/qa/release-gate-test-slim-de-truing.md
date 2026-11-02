# release 门禁测试瘦身与去真值化（docs / yml 结构化断言 + 版本与资产 sha 字面量清零 + gates 步骤钉板）

- WI：`wi_intake_27a374d63891b37b`
- 域：`release`（发布面测试的断言形态与真值来源；被测对象是 `release.yml` / `docs/**` / `docs/release-evidence/**` / fixtures，不是产品行为）
- 来源：`.munk/changes/wi_intake_27a374d63891b37b/prd.md`（本 WI change pack **只有这一份**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 改动面（除 change-pack 与 `.munk/baseline/**`）：`src/main/release-evidence.test.ts` 452 行、`src/main/release-packaging.test.ts` 504、`src/main/release-artifacts-and-brand.test.ts` 411、`src/main/release-version-gate.test.ts` 182、`src/main/release-doc-fixtures.test-helpers.ts` 205、`src/main/__fixtures__/release-artifacts-and-brand.json` +66/−33、`src/main/__fixtures__/release-packaging.json` +75/−14
- 零 diff：`package.json`（`version` 仍 `0.2.16`）、`pnpm-lock.yaml`、`.github/workflows/release.yml`、`docs/**`、`scripts/**`、`src/main/release-gate.ts`、`src/main/release-metadata-gate.ts`、`src/App.test.*`、`src/sync-real-gate.test.ts`、`.munk/code-gates.json`

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-docs-yml-structured | `release-doc-fixtures.test-helpers.ts` 导出 `parseMarkdown` / `markdownSection` / `yamlScalars`，`workflow = parse(releaseWorkflow)`、`builder = parse(...)`；断言读 `markdown.headings` / `tableCells` / `codeSpans` / `listItems` / `links` 与 `jobs.*.steps[].run|uses|with`。`release-evidence.test.ts` 的 `specs[].facts` 改为 `heading` + `code` / `items` / `text` / `pattern`，`sectionText` / `tableRows` 先切节再断。fixture 审计：`release-artifacts-and-brand.json` 的 `docs[].tokens` / `docs[].absent` / `notesSections[].tokens`（8 条 docs 行 / 2 条 notes 分节）句子 token = **0**（无 `，。：；`、无 ≥8 词英文整句） | 满足 |
| ac-version-literal-zero | `grep -rnE --include='*.ts' 'v?0\.2\.16' src` 无输出（**0**）；`release-doc-fixtures.test-helpers.ts` 的 `currentVersion = pkg.version` / `currentTag = \`v${currentVersion}\``，`lastShippedTag = 'v0.2.15'` 为冻结历史锚；`release-version-gate.test.ts` 的 `versionFacts()` 用合成版本（含 `9.9.9` / `v1.2.3`），`judgeVersionSources` 判定逻辑不变；`pnpm test src/main/release-version-gate.test.ts` 绿 | 满足 |
| ac-asset-sha-zero | `grep -rnE --include='*.ts' '[0-9a-f]{64}' src` = **6** 条，全部为标准向量（`src/core/directory/compare.test.ts` 与 `src/main/platform/electron-platform.test.ts` 的 `sha256("")` / `sha256("abc")`）；证据 sha256 由 `docs/release-evidence-ledger.json` + `docs/release-evidence/*.md` 运行时解析 | 满足 |
| ac-workflow-gate-steps-pinned | `release-packaging.test.ts > release workflow contracts > pins every gates job command in order`：`gatesSteps.map(step => step.run).filter(run => run.startsWith('pnpm '))` 与 `['pnpm install --frozen-lockfile','pnpm lint','pnpm typecheck','pnpm test','pnpm build']` `toEqual`（有序、逐字、无多余 pnpm 步骤）；断言消息 `gates job pnpm steps` | 满足 |
| ac-injection-workflow-red | `- run: pnpm lint` → `pnpm lint --max-warnings 0` 后 `pnpm test src/main/release-packaging.test.ts` = **1 failed / 256 passed (257)**，`FAIL … > pins every gates job command in order` + `AssertionError: gates job pnpm steps`；`git checkout -- .github/workflows/release.yml` 后 **257 passed (257)** | 满足 |
| ac-injection-evidence-red | `docs/release-evidence/v0.2.16.md` 的 `opencompare_0.2.16_amd64.deb` sha256 末位 `f` → `e` 后 `pnpm test src/main/release-evidence.test.ts` = **2 failed / 57 passed (59)**，`matches the ledger asset table row by row` 点名 `v0.2.16 opencompare_0.2.16_amd64.deb`、`closes the current document digest set over the ledger` 点名 `v0.2.16`；恢复后 **59 passed (59)**、`git status docs/` 干净 | 满足 |
| ac-gates-green | Host `code_gates` attempt 001 **21 门**全 exit 0（`.munk/runs/run_intake_27a374d63891b37b/code-gates/attempts/001`，`latest.json` `ok: true` / `"code_gates passed (21 gates, attempt 001)"`、`failedGateIds: []`）；`test` 门 115 files / **1851 passed + 1 skipped**（1852）、32.64s；四个发布套件单跑 **429 passed**、1.71s | 满足 |
| ac-product-untouched | `package.json#version` = `0.2.16`；`git diff --stat` 仅测试与测试夹具（含 `src/verify-release-gate.test.ts`，其瘦身主体归 `domains/release-verify`）；未新增依赖、未改 gate 清单、未打 tag / push / dispatch | 满足 |

## 口径与陷阱注记

- **「结构化」是断解析后的位置，不是把整句拆短**：断「某标题下的代码 span」「某表格行的字段」「链接 target」「YAML 步骤的 `run` 序列」，才不受措辞改写影响；短 token 仍绑定原文。
- **`gates` 步骤必须整序列断言**：只断「含 `pnpm lint`」时把 lint 换成 `pnpm lint --max-warnings 0` 仍绿；`toEqual` 五条有序命令后，替换 / 增删 / 换序都会红。
- **去真值化的边界**：当前版本从 `package.json` 派生、资产 sha256 只从台账 / 证据文档运行时读；`.ts` 里保留的 6 条 hex 是标准算法向量（`sha256("")` / `sha256("abc")`），属算法自证，不是资产事实。
- **历史版本字面量不是残留**：`v0.2.15` 等已发布 tag 在 `docs/**`、`scripts/*.mjs` 注释与历史证据里是冻结事实；只清「当前版本」与「真实资产 digest」。
- **注入后必须恢复**：两类注入都在本 worktree 实跑并 `git checkout` 还原，`release.yml` 与 `docs/` 交付时零 diff。
