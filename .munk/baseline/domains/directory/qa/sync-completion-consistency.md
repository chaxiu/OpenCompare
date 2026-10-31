covers: ac-completion-blocked-on-mismatch, ac-completion-requires-source-equivalence, ac-verification-scope-written-only, ac-unchecked-delete-not-failure
标题: 「同步完成」只在每个写入目标都与源一致时出现；不一致时 danger 提示并保留写入结果
步骤: ① 真实临时目录上让某次写入落坏字节（注入 seam 把写盘内容替换成非法字节模拟）后执行 `applySyncPreview` → 观察 reject 形态与渲染层提示 → 断言磁盘写入结果仍在、刷新后的比较反映真实差异；② 正常执行（含未勾选的镜像删除项）→ 断言 resolve 条件、逐项原始字节 digest 比对与二次 Dry-run 计数 → 记录校验阶段读取过的路径 → ③ 镜像模式故意留下未勾选删除项后执行，观察提示与计数
期望: 任一写入目标与源不一致时 `applySyncPreview` **不得** resolve：必须 reject `SyncVerificationError`（`name === 'SyncVerificationError'`），`mismatched` 等于不一致条数、`paths` 列出路径样例，`copied` / `updated` / `deleted` 与本次执行一致，`comparison` 为刷新后的真实磁盘状态；**不回滚**（坏字节仍在目标侧），渲染层关闭已落盘预览、用刷新后的比较替换会话、出现 danger 提示 `shell.notice.syncVerifyFailed`（含条数与路径样例），不出现 `shell.notice.syncComplete`；正常路径只在每个写入目标 sha256 与字节数都等于源时 resolve，resolve 后逐项比对无 added / removed / modified 差异（用户未勾选删除的残留除外），同一方向 / 模式再建计划时 `copy.count === 0 && update.count === 0`；校验读取集合恰好是本轮写入目标 + 各自源 + 已勾删除项存在性检查，不含本轮未写文件；未勾选删除项残留不构成校验失败，提示仍为成功且计数口径不变

## 最近执行

- workItemId: wi_intake_654321843130fa1f
- at: 2026-11-01
- status: pass
- note: `src/sync-real-gate.test.ts` 的 `describe('real-disk sync completion consistency')` 3 条真实磁盘用例（真实临时目录 + 真实 IPC handler）：`rejects with a verification failure when a written target keeps bad bytes` 断言 `completion consistency: a mismatched target must not resolve` 命中 `SyncVerificationError`、`mismatch count === 1`、目标未被回滚、`comparison.counts.modified` 如实反映坏字节；`resolves only when every written target matches its source, and verifies just those paths` 记录 digest 请求集合断言只含写入目标与各自源、逐条 sha256 相等；`does not treat unchecked mirror deletions as a failed check` 覆盖未勾删除项残留仍成功。实现落位：`executeSyncPlan` 返回 `written` / `deletedPaths`，`directoryOps.applySyncPreview` 的 `verifyWrittenTargets`（digest 比对）与 `entryStillExists`（父目录列表判存在，不跟随链接）只读本轮路径；`Workbench.handleConfirmSync` 新增 `SyncVerificationError` 分支 + zh / en `shell.notice.syncVerifyFailed`。
