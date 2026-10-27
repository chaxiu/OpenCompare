# v0.2.9 发布说明「风险与验证规模」实测小节 + 发布说明 `MiB` 断言白名单

- WI：`wi_ws_6c8601576156de1b`
- 域：`release`（发布说明公开口径面；被测实现落在 `docs/release-notes/v0.2.9.md` + `src/main/release-packaging.test.ts`）
- 来源：`.munk/changes/wi_ws_6c8601576156de1b/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故本档为按 AC 逐条落档，非 change-pack 用例 copy）
- 交付 commit：`bb4b5565`（`docs(release): v0.2.9 发布说明在「本次变化」与「升级方式」之间新增「风险与验证规模」实测小节；发布说明 MiB 断言放宽为已实测内存值白名单`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-section-present | `docs/release-notes/v0.2.9.md` 中 `^## 风险与验证规模` 命中数 = 1（偏移 1168）；该小节正文去空行后 10 行 ≥ 2 | 满足 |
| ac-section-position | 字节序：最后一个 `### ` 标题偏移 1040 < `## 风险与验证规模` 1168 < `## 升级方式` 1947；文件二级标题序列恰为 `## 本次变化`(182) → `## 风险与验证规模`(1168) → `## 升级方式`(1947)，无其它新增二级标题 | 满足 |
| ac-literal-scale | 小节正文逐字含 `358,249`、`358,155 / 358,208`、`6,907 ms`、`289 ms`、`9,999,926 B`、`68,865`、`Showing 68865 of 358249 (truncated)`、`M = 358,249`、`1,325 MiB`、`764.9 MiB`、`38 ms`、`35 / 80 / 41 / 326,099`、`projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`、`a1e91cb3`；`1,325 MiB` 出现在 `764.9 MiB` 之前；无「23.4 万」「358000」变体 | 满足 |
| ac-no-public-claim | 小节含 `NSSavePanel` 未闭环陈述（导出落盘一次 + 取消一次仍待 computer 场），并写明「该结论落入 `qa-checklist.md` 之前，对外不得宣称已完成全链路验证」；全文无「30 万可放心用」/「验证规模 234k」/「358k 待验」 | 满足 |
| ac-untouched-sections | `git diff` 该文件为 `+15/−0`（纯新增该 H2 小节及前后空行）；H1、`## 本次变化` 各 `###` 正文、`## 升级方式` 及之后正文与改动前逐字相同 | 满足 |
| ac-no-banned-tokens | 全文 `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` 命中 0；`[0-9a-f]{64}` 命中 0；`releases/tag/` 命中 0；`MB` 数字集合 = `['10 MB']`，`GiB`/`MiB`/`GB` 数字集合按出现顺序 = `['1,325 MiB', '764.9 MiB']`（护栏只写「未触既有内存护栏」） | 满足 |
| ac-scope-two-files | `git show --numstat bb4b5565` 恰为 `docs/release-notes/v0.2.9.md` 15/0 与 `src/main/release-packaging.test.ts` 7/3；`package.json` / `CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `docs/release-signing.md` / `docs/release-process.md` / `docs/release-evidence/**` / `src/**` 其它文件 / `.github/workflows/**` 零 diff | 满足 |
| ac-no-release-side-effects | `package.json#version` 仍为 `0.2.9`；`git tag --list` 末位仍 `v0.2.8`（未新建 / 移动 tag）；本 WI 未 push / publish / `gh release` 写 / workflow dispatch | 满足 |
| ac-gates-green | `.munk/runs/run_ws_cf7b1a91ec8712f9/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 九门 `exitCode: 0`；`pnpm test` 62 files / 1011 passed + 1 skipped / 1012 | 满足 |

## 口径裁决（本条最容易被读错的地方）

v0.2.9 收敛轮（WI `wi_ws_e412c1de377c9e45`）的 `ac-release-notes-029-hygiene` 曾要求该发布说明**不出现** `MiB` / `GiB` / `GB`。本轮按裁决把它**重定标为等值集合断言**：

```ts
expect(releaseNotes.match(/\b\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB)\b/g) ?? []).toEqual([
  '1,325 MiB',
  '764.9 MiB'
])
```

即：允许这两个**已实测**内存值，其它任何带该单位的数字仍 fail-closed。这是「收窄 + 定值」，不是删除断言、也不是放开为任意数字。`MB` 集合仍恰为 `['10 MB']`，上限段「含 `200,000` / `10 MB` 的段落须同时含 `沿用` 与 `v0.2.8`」的断言未受影响（新小节未复述上限，故不触发）。

## 最近执行

- workItemId: wi_ws_6c8601576156de1b
- at: 2026-10-27
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_cf7b1a91ec8712f9/code-gates/attempts/001`；`pnpm test` 62 files / 1011 passed + 1 skipped / 1012）。静态核对按 AC 逐条走脚本/`git show`：小节唯一、位置严格夹在最后 `###` 与 `## 升级方式` 之间、14 条字面口径齐备且 `1,325 MiB` 先于 `764.9 MiB`、无禁用词 / 无 64 位 hex / 无 `releases/tag/` 链接、`git diff --numstat` 恰为 `docs/release-notes/v0.2.9.md` +15/−0 与 `src/main/release-packaging.test.ts` +7/−3。事实边界：证据路径与 `a1e91cb3` 只引用未重新取数；原生 `NSSavePanel` 落盘 + 取消两场仍未闭环，本档不复述任何「全链路已验证」结论，对外口径以发布说明「仍未闭环」段为准。
