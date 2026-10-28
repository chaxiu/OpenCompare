# v0.2.9 发布说明：原生 NSSavePanel 实测闭环，更正「仍未闭环」表述

## 范围

- 唯一改动文件：`docs/release-notes/v0.2.9.md`（`## 风险与验证规模` 末段，位于「证据：…trun_100be579fd6a9610/evidence/stages.md」之后、`## 升级方式` 之前）。
- 把该文件现存的「仍未闭环：…」整段（单段，全文唯一，包含「03:00–06:00」「qa-checklist.md」等字样）整段替换为下述已实测结论，除此之外该文件其余字节不动（`## 本次变化` / 358k 四条规模敏感腿 / `## 升级方式` 全部原样保留）。
- 替换后的整段必须逐字为：

```text
原生保存面板已闭环：在 v0.2.9 打包态 app 上驱动**真实原生 NSSavePanel** 完成导出落盘一次与取消一次，面板标题 `Export directory comparison HTML report`（owner=OpenCompare、layer=0，出现耗时 333 / 657 / 338 ms）。导出经面板输入 `/tmp/oc-nsp-out/report-a.html` 保存成功，产物 4,077 B、四态与界面图例逐项相等（same 2 / added 1 / removed 1 / modified 1），按钮回可操作态且目录内无 `.tmp`；同一入口再导一次并在面板点 Cancel 后零新文件、零 `.tmp`、四态不变、无成功提示。证据：`projects/ops_df43e423451170fd/.munk/runs/trun_070ff986f2830ed2/digest.md`（含 `evidence/20-a-export.json`、`evidence/30-b-cancel.json`、`evidence/shot-a-after-save.png`）。该场用 `/tmp` 下两侧各 4 个真实文件（1 修改 / 1 仅左 / 1 仅右）作对照对，报告可读性与四态同源以该场为准；358k 规模导出仍以上一小节的四条规模敏感腿为准。场次唯一未取到的是用 CDP 直接导航 `file://` 子项（CDP 返回 `Not supported`，属驱动通道限制，非产品缺陷）。
```

- 该替换段落之后紧跟原文件已有的 `## 升级方式`，不新增、不删除、不重排任何标题。

## 验收

- ac-old-block-removed: `docs/release-notes/v0.2.9.md` 全文不再包含「仍未闭环」、「03:00–06:00」、`qa-checklist.md` 三个串，旧段原文（`仍未闭环：真实原生 NSSavePanel 的导出落盘一次与取消一次仍待 …兜底承诺。`）在文件中的出现次数为 0。
- ac-new-block-verbatim: 文件包含「范围」中给出的整段逐字文本，且该段落在文件中出现次数为 1；位置在包含 `trun_100be579fd6a9610/evidence/stages.md` 的那一行之后、`## 升级方式` 之前。
- ac-panel-facts-present: 该段同时含 `Export directory comparison HTML report`、`owner=OpenCompare、layer=0`、`333 / 657 / 338 ms`、`/tmp/oc-nsp-out/report-a.html`、`4,077 B`、`same 2 / added 1 / removed 1 / modified 1`、`零新文件、零 \`.tmp\`` 七个可断言片段。
- ac-evidence-refs-present: 该段含 `trun_070ff986f2830ed2/digest.md`、`evidence/20-a-export.json`、`evidence/30-b-cancel.json`、`evidence/shot-a-after-save.png` 四个证据引用。
- ac-cdp-limit-scoped: 该段写明 CDP 直接导航 `file://` 子项返回 `Not supported` 且归因为「属驱动通道限制，非产品缺陷」；同时全文不出现「file:// 已验证」「file:// 全部验证」这类肯定式表述。
- ac-scale-section-intact: `## 风险与验证规模` 上一小节四条规模敏感腿的数字原样保留（`358,249`、`ready 6,907 ms`、`289 ms`、`9,999,926 B`、`68,865`、`35 / 80 / 41 / 326,099`、`1,325 MiB`、`764.9 MiB` 全部仍可检索到，各自出现次数不变）。
- ac-packaging-test-green: `pnpm test` 通过；`src/main/release-packaging.test.ts` 中 v0.2.9 的既有断言（短语白名单含 `file://`/`10 MB`/`200,000`、禁用词 `待验证`/`预计通过`/`应该通过` 为 0、`\b\d+…MB\b` 集合恒为 `['10 MB']`、`\b\d+…(?:GiB|MiB|GB)\b` 集合恒为 `['1,325 MiB','764.9 MiB']`、无 64 位 hex）不作任何修改即全绿。
- ac-single-file-diff: `git diff --name-only HEAD` 恰为 `docs/release-notes/v0.2.9.md` 一行；`git status --porcelain` 为空；`package.json` 的 `version` 仍为 `0.2.9`。
- ac-single-commit-message: worktree 内新增恰一条 commit，且该 commit 的 message 逐字为 `docs(release-notes): v0.2.9 原生 NSSavePanel 实测闭环，更正未闭环表述`，该 commit 只包含 `docs/release-notes/v0.2.9.md` 一个文件。
- ac-delivery-sha: delivery-result 中记录了该条 commit 的完整 sha，且该 sha 与 `git rev-parse HEAD` 一致。

## 非目标

- 不改任何源码：`src/**`（含 `src/main/release-packaging.test.ts`）、`scripts/**`、`electron-builder.yml`、`electron.vite.config.ts` 一律不动；本项不新增任何测试文件。
- 不改 `package.json`（含 `version`）、`CHANGELOG.md`、`README.md` / `README.zh-CN.md`、`.github/**`（含 release.yml）、`docs/release-evidence/**`、其它 `docs/release-notes/*.md`。
- 不改 `.munk/baseline/**`（含 `domains/release/product.md` 与已归档 `qa/v029-risk-and-verification-scale.md` 中旧的 `ac-no-public-claim` 表述）；不回填 `qa-checklist.md`，本项不产生 QA 档。
- 不重新取数、不重跑 computer 场、不补跑 358k 规模腿、不新增任何未经该场实测的数字。
- 不打 tag、不 push、不发版、不动 `releases/tag` 链接；不做 Git 历史改写（不 amend/rebase 既有 commit）。
- 不顺手改文案、不优化排版、不整理其它段落。

## 实现约束

- 替换是一次整段等长替换：只允许该单段 diff，禁止顺手改动相邻行的空格、标点或换行；文件末尾保持原样（无多余空行）。
- 该段用词逐字照抄「范围」中的文本，包含中文全角括号、反引号包裹的代码片段、`**真实原生 NSSavePanel**` 加粗，不得意译或压缩。
- 先落盘替换，再在 worktree 内以一条独立 commit 提交（message 逐字如上，不加 body 前缀、不加签名 trailer 以外的内容）。
- 提交后跑 `pnpm test`（仓库既定 gate，`vitest run`）；如断言不过，问题出在替换文本不一致，按 prd 修正该段，不得改测试或源码来迁就。
- 交付口径：commit 后 `git status --porcelain` 为空；commit sha 写入 delivery-result。
- 事实边界：本段只引用 evidence 路径，不在本项重新取数；任何超出该场实测的规模 / 兼容性承诺一律不得写入，禁止对外声明 `file://` 已验证。
