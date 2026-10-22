# 符号链接口径：不跟随（no-follow）

本文是 OpenCompare 目录对比对符号链接的正式口径。它描述的是用户可见的计数、四态、下钻与快照行为；实现与门禁以本文为准。

## 1. 一句话口径

**目录扫描不跟随符号链接**：不进入链接指向的任何目录，链接自身作为一条叶条目参与对比。

## 2. 对计数的影响

- 链接自身计 **1 条**条目（与普通文件同层级参与 `same / added / removed / modified`）。
- 链接目标子树 **不产生任何条目**，也不计入 `fileCount`、四态计数或 footer。
- 因此含目录链接的树不会再因目标子树被重复遍历而放大条目总数；`counts` 四态之和恒等于 `fileCount`。
- 跳过数只统计真正不可读的条目/目录（例如 EACCES、ELOOP 等），并按扫描侧分列展示：目录视图 footer 与工作台提示为「已跳过：左 X / 右 Y」；两侧都是 0 时不显示该行，也不再出现合并后的单一总数。
- 悬空链接**不是**跳过项：它的链接目标字符串仍可比较，照常参与四态与计数。

## 3. 对四态的影响

链接按「链接自身」比较，不比较目标文件内容：

| 左 | 右 | 结果 |
| --- | --- | --- |
| 链接，目标字符串相同 | 链接，目标字符串相同 | `same`（即使目标文件内容不同） |
| 链接，目标不同 | 链接，目标不同 | `modified`（即使目标内容相同） |
| 链接 | 不存在 | `removed` |
| 不存在 | 链接 | `added` |
| 链接 | 同路径普通文件/目录 | `modified`（类型不同） |
| 悬空链接（左右目标字符串相同） | 悬空链接 | `same` |
| 悬空链接，仅一侧 | 不存在 | `added` / `removed` |

## 4. 下钻规则

- 指向**文件**的链接：树中双击按文件下钻，读取并展示链接目标文件的内容（不是链接路径字符串）。
- 指向**目录**的链接：树中只是一条叶条目，不是可展开目录节点；双击不会发起内容读取，也不会报错。
- 下钻行为只影响查看，不改变四态与计数。

## 5. 快照影响

`.ocsnap.json` 的线格式（`opencompare.snapshot/v1` 与 `SnapshotEntry` 字段集合）不变。快照内容按上述语义记录链接条目：链接各计 1 条，导出后再导入与实时树对比时四态计数与 `fileCount` 保持一致；链接目标子树同样不会进入快照。链接条目沿用既有 `content` 字段记录目标串与目标形态（不新增字段），因此协议版本与字段集合保持不变。

## 6. 真实目录新旧 footer 对照

测量对象为本机真实目录 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`。两个数字都由 `scripts/measure-symlink-footer.evidence.test.ts` 通过应用同一条核心 + 平台入口（`compareDirectories` + `listDirectories` + `digestFiles`）测量，不是手填或从历史发布说明抄录。

- 测量命令：`pnpm measure:symlink`（可用 `OPENCOMPARE_EVIDENCE_LEFT` / `OPENCOMPARE_EVIDENCE_RIGHT` 覆盖目录，`OPENCOMPARE_EVIDENCE_OUT` 指定结果文件）
- 原始输出（vitest 日志）：旧口径 `docs/evidence/symlink-footer-old.raw.log`，新口径 `docs/evidence/symlink-footer-new.raw.log`
- 机器可读结果：`docs/evidence/symlink-footer-old.json` / `docs/evidence/symlink-footer-new.json`

| 口径 | 被测 commit | footer 条目总数 | same | added | removed | modified | 已跳过（左/右） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 旧：跟随链接（目标子树重复计入） | `abd32e5` | 1,338,294 | 38,975 | 1,286,559 | 6,827 | 5,933 | 461（合并值；按链接普查为左 9 / 右 452） |
| 新：不跟随符号链接 | 本 WI 改动后的 worktree（基于 `abd32e5`） | 752,479 | 38,542 | 701,232 | 6,827 | 5,878 | 左 0 / 右 0 |

逐行取证信息：

- 旧行：命令 `OPENCOMPARE_EVIDENCE_OUT=docs/evidence/symlink-footer-old.json pnpm measure:symlink`，被测 commit `abd32e5`（该 commit 的 `listDirectories` 用 `stat` 跟随链接），原始输出 `docs/evidence/symlink-footer-old.raw.log` 与 `docs/evidence/symlink-footer-old.json`。
- 新行：同一命令，被测 commit 为 `abd32e5` 加上本 WI 的符号链接改动（worktree 实测），原始输出 `docs/evidence/symlink-footer-new.raw.log` 与 `docs/evidence/symlink-footer-new.json`。

差异归因：旧数字把指向目录的链接目标子树整棵重复计入（DawnChat 14 条目录链接、ZenMind 2,420 条目录链接），并把这 461 条悬空链接记为跳过；新口径下链接各计 1 条、目标子树 0 条、悬空链接不再跳过。条目总数从 1,338,294 降到 752,479（差额 585,815 = same −433 + added −585,327 + modified −55），四态差异只出现在链接相关条目。两次测量的链接普查一致：DawnChat 240 条链接（14 目录 / 217 文件 / 9 悬空），ZenMind 3,326 条链接（2,420 目录 / 454 文件 / 452 悬空）。

旧数字复现方式：在 `abd32e5` 的干净检出中放入本文件的测量脚本与 `vitest.evidence.config.mts`，执行 `pnpm install && pnpm measure:symlink`，比较时使用该 commit 的跟随实现。
