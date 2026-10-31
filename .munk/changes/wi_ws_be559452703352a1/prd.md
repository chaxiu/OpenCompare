# v0.2.14 收尾（README / latestPublishedTag / 发布证据）

## Scope

子项 1（Release 双语正文修复）已合入 main（本 worktree 基线 `942bbb0`，其父为发布点 `3550b24`）。本项只做「发布事实收尾」，让仓库对外口径从「待发」翻到「已发布 v0.2.14」，并补一份可核的发布证据文件。改动面严格限定为：

1. **L1 门禁先行**：在写下任何「已发布」表述之前，打开并核对 L1 digest 与 receipt：
   - `task_0194dba8b812d08b` / run `trun_2ed24b3624d3959e`，`status=succeeded`，`finishedAt 2026-10-31T09:51:38Z`；
   - digest：`products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_2ed24b3624d3959e/digest.md`，正文结论 **PASS**、`needsOwner: false`、`workRemaining: false`；
   - receipt：同目录 `receipt.json`，`needsOwner: false`。
   digest 不存在、结论非 PASS 或 `needsOwner: true` → 停手并 `munk_report_owner`，不得先写「已发布」。
2. **两版 README 第 5 行翻面**：`README.md` 与 `README.zh-CN.md` 第 5 行从 `v0.2.12` 翻到 `v0.2.14`，每行仍只有一条 `releases/tag/v0.2.14` 链接，句子其余部分（英文 `Developer ID signed and Apple-notarized macOS build`、中文 `macOS 安装包经 Developer ID 签名与 Apple 公证`）逐字保留；两文件除第 5 行外**零 diff**。
3. **`latestPublishedTag` 翻面 + 依赖锚点重钉**：`src/main/release-packaging.test.ts` 的 `latestPublishedTag` 由 `'v0.2.12'` 翻到 `'v0.2.14'`；`publishedTags` 增补 `'v0.2.14'` 并**保留 `'v0.2.12'` 字面量**（发布历史不被常量翻转带走）。原先编码「待发」状态的断言（`latestPublishedTag !== currentTag`、`isTagBefore(latestPublishedTag, currentTag)`、`lastReleasedNotesPath !== releaseNotesPath`、最新已发布 CHANGELOG 段等于 `v0.2.12` 段、signing doc `当前状态：v0.2.12 已发布`）按发布事实**重钉为发布后不变量**，历史段与历史字面量逐字保留，`expect(` 只增不减。
4. **`docs/release-signing.md` 最小事实修正**（负责人已授权）：第 5 行状态句、第 47 行本版条目、第 81 行「仍为 v0.2.12 / 状态行与 `latestPublishedTag` 保持指向该版本」这三处版本事实同批翻到 `v0.2.14` 并指向 `docs/release-notes/v0.2.14.md` 与 `docs/release-evidence/v0.2.14.md`；不重写文档结构、不动 v0.2.11/9/8/7/6/5 与 v0.1.2 漂移等历史条目。
5. **新建 `docs/release-evidence/v0.2.14.md`**：章节结构参照 `docs/release-evidence/v0.2.12.md`（tag 与发布点 / 公开 Release / CI run 与五 job / 11 件公开资产 / macOS 签名与公证 / L1 公开包复验 / 已知遗留与边界），只记录真实可核事实。
6. **全量门禁**在本隔离 worktree 内跑绿。

## Acceptance Criteria

- ac-l1-gate-confirmed: 证据文件落笔前，`trun_2ed24b3624d3959e/digest.md` 与 `receipt.json` 均存在且读到 `needsOwner: false`；digest 正文含 PASS 结论与 `workRemaining: false`。若读取失败或结论非 PASS，本项不得产出任何「已发布」字样（交付说明需记录实际读到的 digest 结论行）。
- ac-readme-en-status-line: `README.md` 第 5 行含 `Latest public release: [v0.2.14](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14)`，该行 `releases/tag/` 出现次数恰为 1，且不含 `v0.2.12`、不含 `待发布`。
- ac-readme-zh-status-line: `README.zh-CN.md` 第 5 行含 `最新公开版本：[v0.2.14](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14)`，该行 `releases/tag/` 出现次数恰为 1，且不含 `v0.2.12`、不含 `待发布`。
- ac-readme-other-lines-untouched: 相对基线，两版 README 的 `git diff --unified=0` 只有第 5 行一处 hunk（`@@ -5 +5 @@`），其余行零 diff。
- ac-latest-published-tag: `src/main/release-packaging.test.ts` 中 `latestPublishedTag === 'v0.2.14'`，且该常量不再是 `'v0.2.12'`。
- ac-published-tags-history: `publishedTags` 同时包含字面量 `'v0.2.12'` 与 `'v0.2.14'`；仍以 `latestPublishedTag` 收尾且 `not.toContain(foldedTag)`（`v0.2.13`）成立；`v0.2.0…v0.2.11` 各字面量未被删除或改写。
- ac-repinned-anchors-post-release: 原先编码待发状态的断言已重钉且可执行：`latestPublishedTag === currentTag`、`isTagBefore('v0.2.12', latestPublishedTag) === true`（历史锚点仍在）、`lastReleasedNotesPath === releaseNotesPath`（`docs/release-notes/v0.2.14.md`）、CHANGELOG 中 `## v0.2.14` 位置等于最新已发布段位置且严格早于 `## v0.2.12`，signing doc 含 `当前状态：v0.2.14 已发布` 与 `docs/release-evidence/v0.2.14.md`。
- ac-test-strength-nondecreasing: `src/main/release-packaging.test.ts` 的 `it(` 计数 ≥ 216、`expect(` 计数 ≥ 947（子项 1 合入后的基线），且历史断言（`v0.2.11`/`v0.2.9`/`v0.2.8`/`v0.2.7`/`v0.2.6`/`v0.2.5`/`v0.2.4`/`v0.2.2`/`v0.2.0`/`v0.1.2` 相关用例）未被删除、弱化或改写；子项 1 新增的双语断言原样保留。
- ac-signing-doc-minimal-flip: `docs/release-signing.md` 第 5 行状态句、第 47 行本版条目、第 81 行补发说明三处的版本事实均为 `v0.2.14`；`v0.2.11` 及更早的历史条目与第四节 v0.1.2 漂移记录逐字未改（`git diff` 只在这三处命中文档编辑）。
- ac-evidence-release-facts: `docs/release-evidence/v0.2.14.md` 含发布点 `3550b24f693f632c0400922be9cf8f3e8deae96e`、annotated tag 对象 `66ea7bec73552474b7c2734259936b26331a75cc`、CI run `41188356807`（五 job 全绿含 mac 签名+公证）、11 件公开资产、公开地址 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.14`；未归档的单项数字以「见发布期证据」标注，不编造。
- ac-evidence-l1-measured: 证据文件 L1 段逐项写出实测值，不得只写「三条腿全过」：公开 dmg HTTP 200 / `111,444,402` B / sha256 `11d34ea2f777a3edd0535f8b92c706c9e7321ca48cb8cb6852b235ff465407b9`（与 brief 逐字相等）；干净副本 `CFBundleShortVersionString=0.2.14`、`codesign --verify --deep --strict` exit 0 且 `TeamIdentifier=3X4J53U6RY`、`spctl` accepted `Notarized Developer ID`、`stapler validate` ok；腿 1 三轮四态 `35 / 80 / 41 / 326,099` 逐位一致（源 326,175 / 目标 326,214），与 v0.2.11 基线差 `0/0/0/0`；腿 2 app 总峰值 `1.19 GiB`（≤2.5 GiB）、renderer 瞬时峰值 `0.75 GiB`、heap Δ `+527.1 → +3.3 → −5.2 MB` 不逐轮抬升、零 OOM / 零 renderer 重启；腿 3 进度出现后取点取消、hit-test 命中 `BUTTON` `Cancel`、`116 ms` 回可操作态、零半棵树零四态残留、`20/20` 断言为 true；日志 `OperationCancelledError 0 / ECANCELED 0 / OOM 0 / FATAL 0 / Renderer process 0`；并引 run id `trun_2ed24b3624d3959e`。
- ac-evidence-gap-verbatim: 证据文件按原文逐字写入缺口句：`v0.2.14 已公开 Release body 仅英文，中文仅存于仓内 docs/release-notes/v0.2.14.zh-CN.md；双语正文修复自下一版生效`（不得改写为「已发布双语」或「已修复」）。
- ac-no-l3-claim: 证据文件与任何本轮文档改动中不出现「已修复 L3 项」「L3 已通过」等表述；允许且必须写明「L3 / P1④ 本场未跑」。对外只写「已发布」。
- ac-no-v0213-artifacts: 仓库中不存在 `docs/release-notes/v0.2.13.md`、`docs/release-notes/v0.2.13.zh-CN.md`、`docs/release-evidence/v0.2.13.md`，文档中不出现 `releases/tag/v0.2.13` 与 `## v0.2.13` 标题。
- ac-changelog-and-notes-untouched: 相对基线，`CHANGELOG.md`、`docs/release-notes/**`、`.github/workflows/release.yml` 零 diff。
- ac-public-artifacts-untouched: 不执行 `gh release edit/create/delete`、不 `git push`、不打 tag、不 `workflow_dispatch`；不重新下载或改写 v0.2.14 公开资产（交付说明需给出未执行这些命令的事实）。
- ac-product-source-untouched: `src/core/**`、`src/renderer/**`、`src/shared/**`、`src/preload/**` 以及 `src/main/**` 中 `release-packaging.test.ts` 之外的文件零改动。
- ac-changed-paths-bounded: 本项改动路径集合 ⊆ `{README.md, README.zh-CN.md, src/main/release-packaging.test.ts, docs/release-signing.md, docs/release-evidence/v0.2.14.md}`，除此之外仅允许 `.munk/changes/**`。
- ac-gates-green: `.munk/code-gates.json` 列出的 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` 全部通过，无 `|| true` 逃逸。

## Non-Goals

- 不改产品源码与 UI：工作台打开/导入、对比、保存/导出、多视图切换、拖拽与快捷键行为零变化。
- 不改 `.github/workflows/release.yml` 与发布通道其余口径（子项 1 的双语 fail-closed 与发布后 body 断言原样不动）。
- 不改已公开的 `v0.2.14` tag / Release / 资产，不补写 0.2.14 中文 body，不重新发版，不重新下载资产。
- 不为 `v0.2.13` 建任何 notes / 证据 / tag。
- 不改 `CHANGELOG.md` 与 `docs/release-notes/**`（含 v0.2.14 发布说明历史内容）。
- 不重写 `docs/release-signing.md` 结构、不动历史条目；不做文档体系扩写。
- 不在主检出（脏树）上改动或 commit；不 push、不打 tag、不 dispatch。

## Implementation Constraints

- 负责人硬口径（本项必须遵守）：L1 已结算通过（`task_0194dba8b812d08b` / `trun_2ed24b3624d3959e`，`status=succeeded`，`finishedAt 2026-10-31T09:51:38Z`，`receipt.needsOwner=false`），可直接引用，但**仍须打开 digest 核对后再写**；本项无需为 L1 等待放行。
- 证据文件 L1 段按 `ac-evidence-l1-measured` 列出的实测数字逐项落表，来源写 `trun_2ed24b3624d3959e/digest.md` 及其 `evidence/`；发布期事实（资产清单、CI job）可取 `.munk/runs/trun_49dcbeddc99aa9eb/evidence/{release-v0.2.14.json,ci-run-41188356807.json,dmg-sha256.txt,gates-summary.txt}`，读不到就写「见发布期证据」，不得推算或编造。
- 基线为本 worktree 当前 HEAD `942bbb0`（已含子项 1 的双语修复），不得回退或重写 `release.yml` 与子项 1 新增断言；一切读写只在本隔离 worktree 内。
- 断言重钉的每一处（哪一行、为何因发布事实翻面、删改前后语义）必须在交付说明逐条列出理由；重钉只能把「待发不变量」换成「发布后不变量」，不得降低覆盖面（`expect(` 只增不减）。
- 证据文件结构参照 `docs/release-evidence/v0.2.12.md` 的七节，但只填本版真实可核字段；`status:` 字段与 `v0.2.12` 对齐取 `verified`，若某项未归档则在该节如实标注缺口。
- 门禁命令以 Host 注入的 `code_gates` 为准（即 `.munk/code-gates.json` 同一组），逐条实跑，不跳项、不加 `|| true`。
