covers: ac-symlink-same-aligned-mtime, ac-symlink-alignment-idempotent, ac-symlink-four-state-unchanged
标题: 两侧 link target 已相同、仅 lstat mtime 不同的 symlink 对在同步落盘后对齐秒级 mtime，且不进计划 / 不改四态
步骤: 真实临时目录建一对 fixture：源侧与目标侧各有 link target 完全相同的 symlink，目标侧 `lutimes` 把链接自身 mtime 改到另一秒且悬空 / 非悬空混合 → 对比（断言四态计数）→ Dry-run 左→右（断言三组计数与计划条目）→ 执行同步 → 用 `lstat`（不跟随）逐条断言目标侧 `isSymbolicLink()`、`readlink` 与 `Math.floor(mtimeMs / 1000)`，并断言本轮没有任何文件内容写入 → 再 Dry-run 同一方向 → 再次执行后断言已对齐的链接不再被改写
期望: 同步后目标侧仍是 symlink（`lstat().isSymbolicLink() === true`），`readlink` 的 link target 与源逐字符相等、相对路径不变，`Math.floor(lstat.mtimeMs / 1000)` 与源相等；对齐**不进入** copy / update / delete 分组（三组 count 前后不变、计划中无链接条目、无普通文件内容写入），对齐后同一方向 / 模式再次 Dry-run 三组均 0；比较器仍按 link target 判等（link target 相同即 `same`，mtime 不参与判定），四态计数与快照格式、链接下钻口径不变

## 最近执行

- workItemId: wi_intake_654321843130fa1f
- at: 2026-11-01
- status: pass
- note: `src/sync-real-gate.test.ts` 的 `describe('real-disk sync symlink metadata')` 1 条用例（`aligns the target link lstat mtime to the source without changing target or counts`）覆盖全部三条 AC：`symlink metadata: four-state counts`、`alignment is not a copy / update / delete`、`no link enters the plan`、`alignment writes no file content`、逐条 `must stay a symlink` / `link target` / `relative path` / `lstat mtime seconds`，以及「已对齐链接不再改动」与二次 dry-run 三组 0。实现落位：`DirectoryDiffNode` 增补信息性 `leftIsSymbolicLink` / `rightIsSymbolicLink`（`src/core/directory/compare.ts`，判等逻辑未改），`directoryOps.alignSymbolicLinkTimes` 遍历已有比较结果、只对 `status === 'same'` 的双链接节点调 `PlatformPort.setSymbolicLinkModifiedMs`（Electron `lutimes`，Web no-op），失败计入 `SyncVerificationError` 不一致项。**范围限制**：链接的新建 / 替换 / 悬空落盘（`ac-symlink-copy-preserves-target-and-mtime` / `ac-symlink-update-preserves-target-and-mtime` / `ac-symlink-dangling-preserved`）不在本项内，见本域验收「已知缺口」。
