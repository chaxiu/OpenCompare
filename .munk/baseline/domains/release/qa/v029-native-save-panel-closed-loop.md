# v0.2.9 发布说明「原生保存面板」闭环表述：单段替换「仍未闭环」段

- WI：`wi_intake_9c62421fe4002baf`
- 域：`release`（发布说明对外口径面；被测实现落在 `docs/release-notes/v0.2.9.md`）
- 来源：`.munk/changes/wi_intake_9c62421fe4002baf/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 AC 逐条落档，非 change-pack 用例 copy；prd 非目标明确「本项不产生 QA 档」，此档为 Delivery 侧交付记录，不回填 `qa-checklist.md`）
- 交付 commit：`e98204c1019f5520673bd20c87114589d8521705`（`docs(release-notes): v0.2.9 原生 NSSavePanel 实测闭环，更正未闭环表述`，`1 file changed, 1 insertion(+), 1 deletion(-)`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-old-block-removed | 静态扫描 `docs/release-notes/v0.2.9.md`：「仍未闭环」0、`03:00–06:00` 0、`qa-checklist.md` 0；旧段原文前缀 `仍未闭环：真实原生 NSSavePanel 的导出落盘一次与取消一次仍待` 0 命中 | 满足 |
| ac-new-block-verbatim | 新段整段字面比对 `count == 1`；字节偏移：证据行 `trun_100be579fd6a9610/evidence/stages.md` = 1779 < 新段 1823 < `## 升级方式` 2497 | 满足 |
| ac-panel-facts-present | 七个片段全部命中：`Export directory comparison HTML report` / `owner=OpenCompare、layer=0` / `333 / 657 / 338 ms` / `/tmp/oc-nsp-out/report-a.html` / `4,077 B` / `same 2 / added 1 / removed 1 / modified 1` / `零新文件、零 \`.tmp\`` | 满足 |
| ac-evidence-refs-present | 四个引用全部命中：`trun_070ff986f2830ed2/digest.md` / `evidence/20-a-export.json` / `evidence/30-b-cancel.json` / `evidence/shot-a-after-save.png` | 满足 |
| ac-cdp-limit-scoped | 新段含 `Not supported` 与「属驱动通道限制，非产品缺陷」；全文「file:// 已验证」0、「file:// 全部验证」0 | 满足 |
| ac-scale-section-intact | 逐串计数 now == `HEAD~1`：`358,249` 2/2、`ready 6,907 ms` 1/1、`289 ms` 1/1、`9,999,926 B` 1/1、`68,865` 1/1、`35 / 80 / 41 / 326,099` 1/1、`1,325 MiB` 1/1、`764.9 MiB` 1/1 | 满足 |
| ac-packaging-test-green | Host `code_gates` attempt 001 `test` gate exit 0：`pnpm test` 66 files / 1060 passed + 1 skipped / 1061，`src/main/release-packaging.test.ts` 零 diff（`git show --stat HEAD` 仅 1 文件） | 满足 |
| ac-single-file-diff | `git show --stat HEAD` = `docs/release-notes/v0.2.9.md | 2 +-`；`git diff --name-only HEAD` 空；`package.json#version` = `0.2.9` | 满足 |
| ac-single-commit-message | `git log -1 --format=%s` 逐字等于约定 message；`--stat` 仅 1 文件，1 insertion / 1 deletion | 满足 |
| ac-delivery-sha | `git rev-parse HEAD` = `e98204c1019f5520673bd20c87114589d8521705`，与 delivery-result 记录一致 | 满足 |

## 口径裁决（本条最容易被读错的地方）

上一轮（WI `wi_ws_6c8601576156de1b`）的 `ac-no-public-claim` 要求该小节**保留**「仍未闭环」陈述。本轮把该段整段替换为**已实测闭环**结论，因此：

- `ac-no-public-claim` 是**历史时点断言**，已被本轮的 `ac-old-block-removed` 取代。旧 AC 原文与当时的「仍未闭环」记录原样保留在 `qa/v029-risk-and-verification-scale.md`，不回改（prd 非目标明确不修改该历史表述）。
- 替换**只动单段**：`## 本次变化`、四条规模敏感腿、`## 升级方式` 及其后正文零 diff。
- 单位陷阱未触发：新段只引入 `4,077 B`（字节），未新增任何 `MB` / `MiB` / `GiB` / `GB` 数字，故 `release-packaging.test.ts` 的两组等值集合断言（`['10 MB']` / `['1,325 MiB','764.9 MiB']`）无需改动即通过——上一轮「补新实测数字必须同批改集合断言」的提醒在本轮**不适用**，但边界仍在：后续若把 NSSavePanel 场的字节数改写成 `MB`，仍会判红。

## 最近执行

- workItemId: wi_intake_9c62421fe4002baf
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_intake_9c62421fe4002baf/code-gates/attempts/001`；`pnpm test` 66 files / 1060 passed + 1 skipped / 1061）。静态核对按 AC 逐条走脚本：新段字面 `count == 1` 且字节序夹在证据行与 `## 升级方式` 之间、七个面板事实片段与四个证据引用齐备、三个旧串 0 命中、四条规模敏感腿八个数字计数与 `HEAD~1` 完全相等、`git show --stat HEAD` 恰 1 文件 +1/−1、message 逐字命中。事实边界：证据路径、面板耗时、字节数与四态计数**只引用 prd 转述的实测结论**，未在本环境重新取数、未重跑 computer 场、未补跑 358k 规模腿、未打 tag / push / 发布；CDP `file://` 子项未取到属驱动通道限制，对外口径不得写成「file:// 已验证」。
