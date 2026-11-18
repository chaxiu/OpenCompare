# 订正 xlsx 域基线摘要的 tab 口径

## 范围

- 只改一行：`.munk/baseline/domains/spreadsheet-compare/product.md` 的「语义边界 ④ 体积与内存」段里，把「四情形（1 tab dense / 1 tab 普通 / 2 tab dense / 2 tab 普通）」改为「四情形（1 tab dense / 1 tab 普通 / 3 tab dense / 3 tab 普通）」。
- 理由：133 / 67 MiB 只在 3 tab 下成立；2 tab dense 每 tab 应为 200 MiB、双栏 171 MiB。以评估文档 §5.1 的 3 tab 为准。
- 不改该段任何数字（400 / 200 / 133 / 67、40 / 20 / 13 / 7、1,300 / ≈1,569、300 / 171 / 100 / 57 全部保持原样），不改同文件其它段落，不重写基线全文。

## 验收

- ac-tab-label: 该文件 `grep -c "2 tab dense\|2 tab 普通"` = 0，`grep -c "3 tab dense / 3 tab 普通"` = 1；同句其余字符与改前逐字一致（只有「2」→「3」两处变化）。
- ac-no-other-change: `git diff --stat` 只有 `.munk/baseline/domains/spreadsheet-compare/product.md` 一个文件，且 diff 只有该行两处 `2`→`3`；`docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`、`src/`、`package.json`、lockfile、CI、测试零改动。
- ac-no-new-content: 不新增段落、不新增数字、不改「四情形」以外的措辞（含 §2.2 / §8 摘要）。

## 非目标

- 不改评估文档本体（259776f 已由负责人逐格核过通过）。
- 不改 AGENTS.md / goal.md / 反范围，不动 Issue #1 口径、不发任何公开评论。
- 不开 xlsx 代码项、不装依赖、不 bump 版本、不发版。

## 实现约束

- 这是基线摘要的笔误订正，只做最小字符串替换；不要按文档重新生成整份基线，避免引入其它偏差。
- 保持中文标点与全角括号原样；不要顺手调整换行或空行。

## 本单执行约束（不 fold）

- 预算：≤1M token，单次提交完成。
- 允许写的路径：仅 `.munk/baseline/domains/spreadsheet-compare/product.md`。
- 停止线：若改这一行需要动评估文档或任何 `src/`、`package.json`、lockfile、CI、测试，立即停止并在交付里写明。
- 交付证据：该行 diff 前后对照、`grep -c "3 tab dense / 3 tab 普通"` 与 `grep -c "2 tab dense"` 计数、`git diff --stat`。
- 门禁：docs-only 交付，不适用项照实记 `not-applicable`，不得写成通过。
