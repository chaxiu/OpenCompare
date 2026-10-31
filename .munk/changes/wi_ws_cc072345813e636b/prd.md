# v0.2.12 版本锚点收尾（README / 测试 / 签名文档）

## 背景（已核实）

- 本工作项在 `refs/heads/main` 干净工作树里做（当前 tip `c9dbaba`，已含前序 WI 交付的三份 `docs/release-evidence/v0.2.10|11|12.md`）。
- `package.json#version` = `0.2.12` ⇒ `currentTag` = `v0.2.12`；`v0.2.12` 已是公开 Release。
- 现 tree 仍是「收敛态（latest 落后一版）」：两版 README 第 5 行、`src/main/release-packaging.test.ts` 的 `latestPublishedTag`、`docs/release-signing.md` 版本指向都停在 `v0.2.11`。
- 本项只做发布后收尾三件套：README 状态行、测试锚点、签名文档版本指向。

## 范围

1. `README.md` 第 5 行 → `> Latest public release: [v0.2.12](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.12) — Developer ID signed and Apple-notarized macOS build.`（保留尾句）。
2. `README.zh-CN.md` 第 5 行 → `> 最新公开版本：[v0.2.12](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.12) — macOS 安装包经 Developer ID 签名与 Apple 公证。`（保留尾句）。
3. `src/main/release-packaging.test.ts` 锚点前移（断言逐条保留，不删、不跳过、不放宽到空切片）：
   - `latestPublishedTag` 由 `'v0.2.11'` 改 `'v0.2.12'`，注释改为「本树是 v0.2.12 收尾：最新已发布锚点等于收敛版本」。
   - `previousPublishedTag` 保持 `'v0.2.8'`（显式历史锚点，不随 latest 前移）。
   - `publishedTags` 在 `'v0.2.9'` 之后、`latestPublishedTag` 之前增补 `'v0.2.11'`；不新增 `'v0.2.10'`。
   - 收敛态断言翻面：`latestPublishedTag` 由 `not.toBe(currentTag)` → `toBe(currentTag)`；`isTagBefore(latestPublishedTag, currentTag)` 由 `true` → `false`；`lastReleasedNotesPath` 由 `not.toBe(releaseNotesPath)` → `toBe(releaseNotesPath)`。
   - changelog 排序用例：`latestPublished` 由 `toBeGreaterThan(current)` → `toBe(current)`；显式补齐 `## v0.2.11`、`## v0.2.9` 两段的位置断言，保留 v0.2.8 → v0.2.7 → v0.2.6 → v0.2.5 → v0.2.4 → v0.2.2 → v0.2.0 → v0.1.2 既有链。
   - 现有三处以 `changelog.indexOf(\`## ${latestPublishedTag}\`)` 作 `slice` 终点的用例（幽灵版本 heading 检查、收敛条目无未测数字、报告上限口径 `currentEntry`）改为显式 `## v0.2.11` 终点，避免锚点相等时切出空串假绿。
   - 注释同步：删掉「收敛态、latest 落后一版」「the two must stay apart」等已失真说明。
4. `docs/release-signing.md` 版本指向同步（测试以 `latestPublishedTag` 插值断言该文档，属必要耦合）：第 5 行「当前状态」、第三节标题与首条 bullet、本版发布说明、补发默认 tag 段、v0.1.2 承接句、末尾版本收敛段统一指向 `v0.2.12`；`v0.2.11` 降级为历史条目，并按其真实归档状态指向 `docs/release-evidence/v0.2.11.md`。凭据清单 / Secret 名 / 团队 ID / 祖先门语义 / 打包后硬校验正文不动。

## 验收

- ac-readme-en-line5: `README.md` 第 5 行含 `Latest public release: [v0.2.12]` 与 `releases/tag/v0.2.12`，`releases/tag/` 在该行出现次数为 1，且保留 `Developer ID signed and Apple-notarized macOS build.` 尾句。
- ac-readme-zh-line5: `README.zh-CN.md` 第 5 行含 `最新公开版本：[v0.2.12]` 与 `releases/tag/v0.2.12`，`releases/tag/` 在该行出现次数为 1，且保留 `macOS 安装包经 Developer ID 签名与 Apple 公证。` 尾句。
- ac-readme-diff-line5-only: `git diff -U0 -- README.md README.zh-CN.md` 只有第 5 行（`@@ -5 +5 @@`）变动；两版各 9 个 `## ` 二级标题文本与顺序不变，第 3 行互链与 `docs/assets/opencompare-workbench.png` 截图行不变。
- ac-readme-no-version-elsewhere: 两版 README 除第 5 行外不出现 `\bv\d+\.\d+\.\d+\b`（含第 3 行互链行与正文）。
- ac-test-anchor-constants: 测试文件中 `const latestPublishedTag = 'v0.2.12'`、`const previousPublishedTag = 'v0.2.8'`；`publishedTags` 字面量按 `v0.2.0, v0.2.1, v0.2.2, v0.2.4, v0.2.5, v0.2.6, v0.2.7, v0.2.8, v0.2.9, v0.2.11` 顺序排列，末项为 `latestPublishedTag`，且不含 `'v0.2.10'`。
- ac-test-converged-flip: 测试文件含 `expect(latestPublishedTag).toBe(currentTag)`、`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)`、`expect(lastReleasedNotesPath).toBe(releaseNotesPath)`；不再含 `latestPublishedTag).not.toBe(currentTag)` 与 `lastReleasedNotesPath).not.toBe(releaseNotesPath)`，且 `latestPublishedTag` 相关注释不含「trails」「落后一版」「must stay apart」。
- ac-test-slice-endpoint-explicit: 测试文件中 `changelog.indexOf(\`## ${latestPublishedTag}\`)` 作为 `slice` 端点的出现次数为 0；`## v0.2.11` 显式端点出现在幽灵版本 heading、收敛条目无未测数字、报告上限口径三处，且这三处用例执行通过（不因切片为空而假绿）。
- ac-test-changelog-order: changelog 排序用例断言 `indexOf('## v0.2.12') === indexOf(\`## ${latestPublishedTag}\`)`，并显式断言 `v0.2.11`、`v0.2.9`、`v0.2.8`、`v0.2.7`、`v0.2.6`、`v0.2.5`、`v0.2.4`、`v0.2.2`、`v0.2.0`、`v0.1.2` 的 offset 严格递增。
- ac-test-assertion-count: 测试文件 `expect(` 出现次数 ≥ 860、`it(` 出现次数 ≥ 243（基线即当前 main 值；无删断言、无 `skip`/`only` 新增）。
- ac-signing-doc: `docs/release-signing.md` 含 `当前状态：v0.2.12 已发布`、`正式版发布姿态（v0.2.12）`、`docs/release-notes/v0.2.12.md`、`docs/release-evidence/v0.2.12.md`、``默认 `v0.2.12` ``、`tag 之后的修复由 v0.2.12 承接`、``已合入 `main` ``；含 `v0.2.11` 历史条目且指向 `docs/release-evidence/v0.2.11.md`；不含 `当前状态：v0.2.11`、`当前状态：v0.2.8` 与 `待发布`。
- ac-link-whitelist: release-packaging 的 “links only published tags or the current tag” 用例通过——两版 README 与 `docs/**/*.md` 中所有 `releases/tag/<tag>` 的 tag ∈ {v0.2.0, v0.2.1, v0.2.2, v0.2.4, v0.2.5, v0.2.6, v0.2.7, v0.2.8, v0.2.9, v0.2.11, v0.2.12}。
- ac-targeted-test-green: `pnpm test src/main/release-packaging.test.ts` 退出码 0，无 skipped 用例。
- ac-full-test-green: `pnpm test` 退出码 0（全量用例通过）。
- ac-scope-only: `git diff --name-only HEAD` 只含 `README.md`、`README.zh-CN.md`、`src/main/release-packaging.test.ts`、`docs/release-signing.md`（外加 `.munk/**` 流程文件）；不含 `package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-process.md`，也不含任何 `src/**` 产品代码。

## 非目标

- 不改 `docs/release-evidence/**` 与 `docs/release-notes/**`（前序 WI 已交付；本项只读）。
- 不改 `package.json#version`、`CHANGELOG.md` 历史条目、`.github/workflows/release.yml`、发布说明正文。
- 不动 tag / Release / 资产，不 push、不发版、不重新打包或公证。
- 不改产品行为与 UI，不改 `docs/perf/**`，不改 `docs/release-process.md`。
- 不重构测试、不新增发布规则、不为 v0.2.10 新增 notes 或 evidence。
- 不放宽或删除任何既有断言换取绿灯。

## 实现约束

- 基线：`refs/heads/main`（tip `c9dbaba`）的干净工作树；测试文件行号以本树实际内容为准，不得照抄旧树。
- `latestPublishedTag` 前移只动常量、注释与「收敛态 / 收尾态」相关断言；历史锚点（`historicalNotesV0xx`、`historicalEvidenceV026/V027`、`previousPublishedTag = 'v0.2.8'`、`previousPublishedEvidencePath`）保持原状。
- `v0.2.11` 证据文件已在本树存在（`docs/release-evidence/v0.2.11.md`），签名文档不得再写「尚未归档 / 不在仓库内」；`v0.2.10` 不得新增证据或 notes。
- 改完后依次跑 `.munk/code-gates.json` 的 install / lint / typecheck / test 门；`test` 门须真实执行，不接受跳过。
- 依赖安装用仓库既定 `pnpm`（当前工作树 `node_modules` 未安装，先 `pnpm install`）。
