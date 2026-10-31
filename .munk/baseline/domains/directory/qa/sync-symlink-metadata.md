covers: ac-symlink-same-aligned-mtime, ac-symlink-alignment-idempotent, ac-symlink-four-state-unchanged, ac-link-align-visible-and-applicable, ac-link-align-applied, ac-link-align-not-counted, ac-link-align-idempotent
标题: 两侧 link target 已相同、仅 lstat mtime 不同的 symlink 对在同步落盘后对齐秒级 mtime，且不进计划 / 不改四态
步骤: 真实临时目录建一对 fixture：源侧与目标侧各有 link target 完全相同的 symlink，目标侧 `lutimes` 把链接自身 mtime 改到另一秒且悬空 / 非悬空混合 → 对比（断言四态计数）→ Dry-run 左→右（断言三组计数与计划条目）→ 执行同步 → 用 `lstat`（不跟随）逐条断言目标侧 `isSymbolicLink()`、`readlink` 与 `Math.floor(mtimeMs / 1000)`，并断言本轮没有任何文件内容写入 → 再 Dry-run 同一方向 → 再次执行后断言已对齐的链接不再被改写
期望: 同步后目标侧仍是 symlink（`lstat().isSymbolicLink() === true`），`readlink` 的 link target 与源逐字符相等、相对路径不变，`Math.floor(lstat.mtimeMs / 1000)` 与源相等；对齐**不进入** copy / update / delete 分组（三组 count 前后不变、计划中无链接条目、无普通文件内容写入），对齐后同一方向 / 模式再次 Dry-run 三组均 0；比较器仍按 link target 判等（link target 相同即 `same`，mtime 不参与判定），四态计数与快照格式、链接下钻口径不变

## 最近执行

- workItemId: wi_intake_bdc57b0abb1db652
- at: 2026-11-01
- status: pass
- note: 本用例的行为合同由 `wi_intake_bdc57b0abb1db652` 扩写（旧断言未删除、未放宽）：`src/sync-real-gate.test.ts` › `real-disk sync symlink metadata` 现为 3 条用例，首条改名为 `is executable when only the link mtime differs, aligns it, and is idempotent`，在原「四态 / 不进计划 / 逐条 mtime 秒级 / 无内容写入 / 已对齐链接不再改动 / 二次 dry-run 三组 0」之外新增「`canApplySyncPreview` 为 true」「`linkAlignments` 清单逐条」「`alignedLinks` 计数」「普通文件 size / sha256 / 整毫秒 mtime 不变」「四态 counts after 不变」「二次 dry-run 对齐清单为空且不可执行」；失败消息前缀仍是 `symlink metadata:`。渲染层证据见 `views/directorySyncDialog.test.tsx`、`workbench/directorySyncLinkAlign.test.tsx`，逐条 AC 落档在 `qa/sync-link-align-visibility.md`。上一轮（`wi_intake_654321843130fa1f` / 2026-11-01 / pass）的 1 条用例（`aligns the target link lstat mtime to the source without changing target or counts`，覆盖 `symlink metadata: four-state counts` / `alignment is not a copy / update / delete` / `no link enters the plan` / `alignment writes no file content` / `must stay a symlink` / `link target` / `relative path` / `lstat mtime seconds`）已被本轮改名扩写覆盖，旧断言全部保留；链接的新建 / 替换 / 悬空落盘仍是本域「已知缺口」，不在本项内。
