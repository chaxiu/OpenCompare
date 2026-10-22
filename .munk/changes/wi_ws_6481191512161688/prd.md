# 符号链接「不跟随」口径定死与计数对齐

## 范围

把已定的产品口径「扫描不跟随符号链接」落成文档 + 实现 + 门禁 + 真实目录证据，闭环验收点 `cp-symlink-semantics`：

1. **文档先行**：README 与 `docs/` 写明「不跟随」语义，并删除与新口径矛盾的旧表述（README 现「悬空符号链接…改为跳过并计数」与「符号链接计数放大（已知未修）」两段）。
2. **实现对齐**：目录列举不再用 `stat` 跟随链接；链接自身作为**一条叶条目**参与四态与计数；目标子树不产生任何条目。
3. **计数口径**：跳过计数按条目左右分列（`leftSkipped` / `rightSkipped`），footer 与工作台提示不再显示含义模糊的合并总数，也不再把链接目标重复计入。
4. **真实证据**：同一台机器上用真实 `DawnChat ↔ ZenMind` 产出新旧 footer 数字与四态对照，写进 `docs/` 证据文件。
5. **门禁钉死**：`pnpm test`（`.munk/code-gates.json` 的 `test`）新增真实落盘链接样本（链接环、悬空链接、指向目录的链接、指向文件的链接），断言上述语义，失败即红。

已定语义（不得重开）：

- 遍历不进入链接指向的任何目录；链接目标子树不产生条目、计数或四态。
- 链接自身是一条条目：两侧都存在且指向相同 → `same`；指向不同 → `modified`；单侧存在 → `added` / `removed`；链接与同路径普通文件/目录 → 类型不同 `modified`。
- 悬空链接仍是一条可比较的链接条目（不因悬空而跳过）；仅 EACCES/ELOOP 等真正不可读条目/目录才跳过并计数。
- 下钻：指向文件的链接可读目标内容；指向目录的链接不作为可下钻目录。
- 快照线格式不变，内容按上述语义记录链接条目。

## 验收

- ac-doc-no-follow: `README.md` 已知问题段与 `docs/` 下口径说明明确写出「不跟随符号链接」，且逐条覆盖：不进入目标目录、链接自身一条条目及四态判定依据、悬空链接参与比较、仅 EACCES/ELOOP 跳过并按左右分列、指向文件/目录链接的下钻规则、快照内容影响；对 README 全文断言不再出现「悬空符号链接…跳过并计数」与「符号链接计数放大（已知未修）」这类矛盾表述（grep 0 命中）。
- ac-scan-no-follow: 在真实落盘临时目录（左侧含指向目录的链接，目标子树 ≥10 个文件；另有指向上级目录构成链接环）调用平台 `listDirectories` + 核心 `scanDirectory` 后，扫描树节点与 `fileCount` 只把该链接计为 1 条叶条目，目标子树路径 0 命中；扫描在 5 秒内返回，不挂死、不栈溢出、不抛 ELOOP 之外的错误。
- ac-link-four-states: 两侧链接指向相同 → 恰好 1 条 `same`；指向不同 → 1 条 `modified`；仅一侧 → 1 条 `added`（左侧独有则 `removed`）；链接 vs 同路径普通文件 → 1 条 `modified`；且 `counts` 四态之和 = `fileCount` = 计入条目数（链接各 1）。
- ac-target-not-content: 两侧链接指向同一目标但目标文件内容不同 → 仍为 `same`；两侧链接指向不同目标但目标内容相同 → 仍为 `modified`（四态只看链接目标，不看目标内容）。
- ac-dangling-link-compared: 两侧悬空链接指向相同 → 1 条 `same`；一侧悬空一侧缺失 → `added`/`removed`；悬空链接存在时 `leftSkipped`/`rightSkipped` 均为 0（不再计入跳过）。
- ac-skip-per-side: 仅真正不可读的条目/目录计入跳过且左右分列——样本「左 1 个不可读、右 0 个」时断言 `leftSkipped === 1 && rightSkipped === 0`（反之亦然）；`DirectoryView` footer 与工作台提示显示 `已跳过：左 X / 右 Y`，两侧均为 0 时该行不出现，且不再出现合并总数文案。
- ac-drilldown-link: 指向文件的链接在树中双击可打开文件对比视图并展示目标文件正文（不是链接路径字符串）；指向目录的链接在树中不是可展开目录节点，双击不发起内容读取、不报错。
- ac-snapshot-roundtrip: `SNAPSHOT_SCHEMA` 仍为 `opencompare.snapshot/v1` 且 `SnapshotEntry` 字段集合不变；含文件链接、目录链接、悬空链接与链接环的树导出 `.ocsnap.json` 再导入，与实时树对比后四态计数与 `fileCount` 完全相等（链接各计 1 条）。
- ac-real-footer-evidence: `docs/` 证据文件给出真实 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind` 的新旧 footer 对照表（条目总数、`same/added/removed/modified`、跳过左/右），每行标注可复现命令、被测 commit 与原始输出路径；新条目总数严格小于旧条目总数，差额可归因于「链接目标子树被重复计入」，四态差异只出现在链接相关条目；旧数字由可复现命令产出，不得手填或抄旧发布说明。
- ac-gate-locked: `.munk/code-gates.json` 的 `test` 门禁在 `pnpm test` 下运行上述真实落盘断言（vitest `mkdtemp` + `symlink` 真实样本，非 `src/shared/fixtures/` 内置样本），失败即红，单次运行时间有界（不扫 41G 全量目录）。

## 非目标

- 不改 `same / added / removed / modified` 四态定义，不改文件哈希、目录聚合、合并与同步/模板的既有算法（链接作为叶条目的分类除外）。
- 不改 `.ocsnap.json` 线格式、schema 版本、字段与导入导出 UI 流程。
- 不做「跟随 / 不跟随」用户可选开关或设置项，不为链接保留跟随模式。
- 不改同步/模板对条目路径的既有处理逻辑，不为链接新增专属同步策略（也不得递归进入链接目标）。
- 不写 v0.2.5 版本号、发布说明与 README 三条已知问题的「已修复」翻转（`release-025` 负责）；不改写 v0.2.4 及更早的发布说明、证据与资产哈希。
- 不碰内存收敛（`memory-harness`/`memory-bounded`）与取消结构化（`cancel-structured`）两个子项。
- 不做浏览器/真机点选验收；公开件安装复验归 product-qa。
- 不顺手重构无关 UI/算法，不扩大改面。

## 实现约束

- 既定口径以 `.munk/work-set/overview.md` 第 4.1 节为准，本项只做落地，不重新讨论是否跟随。
- 现有跟随点（改造位置证据）：`src/main/platform/electron-platform.ts` 的 `inspectEntry` 先 `stat` 跟随、失败才 `lstat`；`src/core/directory/compare.ts` 的 `scanDirectory` 对 `isDirectory` 递归；`DirectoryComparison.skipped` 为合并单值；footer 在 `src/renderer/src/views/DirectoryView.tsx`、notice 在 `src/renderer/src/workbench/Workbench.tsx`；矛盾文档在 `README.md:86`、`README.md:90`。
- 平台契约：`DirectoryEntry` 需能表达「是符号链接 + 链接目标字符串 + 是否悬空/不可读」；新字段保持可选，web 内存实现不必支持链接，`src/core/` 仍禁止 electron/DOM 依赖。
- 文档先改、实现后改，提交内容需体现这一顺序；证据文件与口径说明放在 `docs/`（文件名自定，需在 prd 交付说明中点名）。
- 真实两目录只用于人工取证命令，不进入 `pnpm test`；若本机目录不可读或无法完成测量，上报 owner，不得用内置样本或缩水目录替代。
- 测试沿用仓库既有模式：`src/main/platform/electron-platform.test.ts` 已有 `mkdtemp` + `symlink` + `chmod` 真实落盘样本与 `vi.mock('electron')`，链接环/悬空/目录链接/文件链接断言可在同模式内扩展；核心语义断言在 `src/core/directory/*.test.ts`。
- 任何数字必须能追溯到命令与原始输出（overview 5.3），禁止估算或引用旧发布说明。
