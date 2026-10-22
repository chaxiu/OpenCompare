# Domain: symlink-semantics

符号链接「不跟随」（no-follow）口径域：跨 `foundation`（Electron 平台层 `listDirectory` 的条目检查）、`directory`（`scanDirectory` / `compareScannedTrees` / 目录视图 footer）、`snapshot`（`buildSnapshot` / `snapshotToScannedTree`）、`workbench`（就地提示 / 下钻）与 `release`（README / `docs/` 对外口径）的**横切语义契约**——目录扫描**不进入链接指向的任何目录**，链接自身作为**一条叶条目**参与 `same / added / removed / modified` 四态与计数；悬空链接照常参与比较，只有 EACCES / ELOOP 等真正不可读的条目/目录才跳过，且跳过数**按左右分列**。本域不重造目录对比算法、快照协议或平台能力本身，只钉死「链接算一条、目标子树算零条」的口径与据此派生的计数、下钻、快照开关。口径来源：`.munk/work-set/overview.md` 第 4.1 节（本域只落地，不重开是否跟随）。

## 范围

- **文档口径先行（`README.md` + `docs/symlink-no-follow.md`）**：README「已知问题」段与 `docs/` 口径说明明确写出「不跟随符号链接」，并逐条覆盖：不进入目标目录、链接自身一条条目及四态判定依据、悬空链接参与比较、仅 EACCES / ELOOP 跳过并按左右分列、指向文件 / 目录链接的下钻规则、快照内容影响。README 中与新口径矛盾的旧表述（「悬空符号链接…跳过并计数」「符号链接计数放大（已知未修）」）删除；`docs/symlink-no-follow.md` 为唯一口径文档，含四态判定表、下钻规则、快照影响与真实目录新旧 footer 对照。版本号、发布说明与其余已知问题的「已修复」翻转仍归 `release` 域（`release-025`），本域不改写历史发布说明。
- **平台列举不跟随（`src/main/platform/electron-platform.ts` 的 `inspectEntry`）**：条目元数据只经 `lstat` 获取（不再先 `stat` 跟随链接）；`lstat` 报告是链接时 `readlink` 取原始目标串，并用 `stat` **只探测目标形态**（不递归）得到 `linkTargetKind: 'file' | 'directory' | 'missing'`（悬空链接 / 链接环都归 `missing`）。链接条目 `isSymbolicLink: true`、`linkTarget` 为原始目标串、`isDirectory` 恒为 `false`（链接永远是叶条目，扫描不得据其递归）。`readlink` 自身失败（如 EACCES / ELOOP）且错误码属于 `ENTRY_FALLBACK_CODES` 时保留该条目并标 `broken: true` + 非空 `skippedReason`；不属于该集合的失败（如 `EMFILE`）仍让整次列举失败。非链接条目的 `name` / `path` / `isDirectory` / `size` / `modifiedMs` 与既有 `stat` 结果一致。
- **`DirectoryEntry` 增量可选字段（`src/shared/platform/types.ts`）**：新增 `isSymbolicLink?: boolean`、`linkTarget?: string`、`linkTargetKind?: LinkTargetKind`（`LinkTargetKind = 'file' | 'directory' | 'missing'`），既有 `broken?` / `skippedReason?` 语义收窄为「真正不可检查的条目」；不新增 `PlatformPort` 方法、不改 IPC channel 与 preload 白名单；Web 内存实现不必支持链接。
- **核心扫描叶条目化（`src/core/directory/compare.ts` 的 `scanDirectory`）**：平台标注的链接条目直接作为 `kind: 'file'` 的叶节点进树（携带 `linkTarget` / `linkTargetKind`），目标子树**不产生任何节点、不占 `index` 键、不计 `fileCount`/`skipped`**；`broken` 条目仍跳过并 `skipped += 1`；不可列举子树仍只跳该子树；根目录失败仍 reject。
- **四态按链接自身判定（`compareScannedTrees` / `classifyPair` / `buildNode`）**：任一侧是链接时按**目标串**分类——两侧链接且 `linkTarget` 相等 → `same`（即使目标文件内容不同）；不相等 → `modified`（即使目标内容相同）；单侧存在 → `added` / `removed`；链接与同路径普通文件/目录 → 单条类型冲突 `modified`（目录子树不被摊平并入）。链接路径不进 `planContentReads`（不对目标正文取摘要）；`counts` 四态之和恒等于 `fileCount`，每条链接各计 1。
- **计数口径按侧分列（`DirectoryComparison.leftSkipped` / `rightSkipped`）**：跳过 = 该侧不可列举条目/子树（`ScannedTree.skipped`）+ 该侧正文不可读文件；`skipped` 保留为两侧之和供只需总数的调用方使用。目录视图 footer 与工作台提示显示「已跳过：左 X / 右 Y」；两侧均为 0 时该行/提示不出现；不再出现合并总数文案（「已跳过 N 个不可读项/悬空链接」）。
- **下钻规则（`Workbench.openFile`）**：指向**文件**的链接双击按文件下钻，读取并展示链接目标文件正文（不是链接路径字符串）；指向**目录**的链接在树中不是可展开目录节点，双击只报 info 提示、不发起内容读取、不报错、不建会话。下钻只影响查看，不改四态与计数。
- **快照线格式不变下的链接记录（`buildSnapshot` / `snapshotToScannedTree`）**：`SNAPSHOT_SCHEMA` 仍为 `opencompare.snapshot/v1`，`SnapshotEntry` 字段集合不变（`path` / `size` / `modifiedMs` / `sha256` / 可选 `content`）。链接条目沿用 `content` 字段存 `\u0000opencompare-symlink:v1:<kind>:<target>` 标记（`sha256` 对标记串计算），**即使 `inlineContent` 返回 false 也写标记**（否则导入后链接会退化成普通文件）；`snapshotToScannedTree` 解码该标记还原 `linkTarget` / `linkTargetKind`，无标记条目行为不变。链接条目不读目标正文，目标子树不进快照。
- **真实目录取证（`docs/evidence/` + `scripts/measure-symlink-footer.evidence.test.ts`）**：`pnpm measure:symlink`（独立 `vitest.evidence.config.mts`）用应用同一条平台 + 核心入口（`listDirectories` + `compareDirectories` + `digestFiles`）测量真实 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind`，落盘 `symlink-footer-old.json` / `-new.json`。序列化契约集中在 `scripts/symlink-evidence-format.ts`：`OPENCOMPARE_SYMLINK_EVIDENCE <JSON>` 标记行只走 stdout；设置 `OPENCOMPARE_EVIDENCE_OUT` 时同一 report 以**纯 JSON** 落盘（可直接 `JSON.parse`），不再写带前缀的非法 JSON，也不再产出 `.raw.log` 文件。`docs/symlink-no-follow.md` 第 6 节给出新旧 footer 对照表（条目总数、四态、跳过左/右）、被测 commit、复现命令与机器可读结果路径，并归因差额。真实目录只用于人工取证，不进 `pnpm test`；`src/main/symlink-evidence.test.ts` 只读断言两份 JSON 可解析且数字未变、harness 输出与入库文件逐字节一致、文档引用的 `docs/...` 路径全部存在。
- **门禁钉死（`pnpm test`）**：真实落盘 `mkdtemp` + `symlink` 样本覆盖链接环、悬空链接、指向目录的链接、指向文件的链接；断言不跟随、四态、按侧跳过、快照 roundtrip 与下钻；失败即红，单次运行时间有界（不扫 41G 全量目录）。

## 验收

- **ac-doc-no-follow**：`README.md` 已知问题段与 `docs/` 下口径说明明确写出「不跟随符号链接」，且逐条覆盖：不进入目标目录、链接自身一条条目及四态判定依据、悬空链接参与比较、仅 EACCES / ELOOP 跳过并按左右分列、指向文件/目录链接的下钻规则、快照内容影响；对 README 全文断言不再出现「悬空符号链接…跳过并计数」与「符号链接计数放大（已知未修）」这类矛盾表述（grep 0 命中）。
- **ac-scan-no-follow**：在真实落盘临时目录（左侧含指向目录的链接，目标子树 ≥10 个文件；另有指向上级目录构成链接环）调用平台 `listDirectories` + 核心 `scanDirectory` 后，扫描树节点与 `fileCount` 只把该链接计为 1 条叶条目，目标子树路径 0 命中；扫描在 5 秒内返回，不挂死、不栈溢出、不抛 ELOOP 之外的错误。
- **ac-link-four-states**：两侧链接指向相同 → 恰好 1 条 `same`；指向不同 → 1 条 `modified`；仅一侧 → 1 条 `added`（左侧独有则 `removed`）；链接 vs 同路径普通文件 → 1 条 `modified`；且 `counts` 四态之和 = `fileCount` = 计入条目数（链接各 1）。
- **ac-target-not-content**：两侧链接指向同一目标但目标文件内容不同 → 仍为 `same`；两侧链接指向不同目标但目标内容相同 → 仍为 `modified`（四态只看链接目标，不看目标内容）。
- **ac-dangling-link-compared**：两侧悬空链接指向相同 → 1 条 `same`；一侧悬空一侧缺失 → `added` / `removed`；悬空链接存在时 `leftSkipped` / `rightSkipped` 均为 0（不再计入跳过）。
- **ac-skip-per-side**：仅真正不可读的条目/目录计入跳过且左右分列——样本「左 1 个不可读、右 0 个」时断言 `leftSkipped === 1 && rightSkipped === 0`（反之亦然）；`DirectoryView` footer 与工作台提示显示 `已跳过：左 X / 右 Y`，两侧均为 0 时该行不出现，且不再出现合并总数文案。
- **ac-drilldown-link**：指向文件的链接在树中双击可打开文件对比视图并展示目标文件正文（不是链接路径字符串）；指向目录的链接在树中不是可展开目录节点，双击不发起内容读取、不报错。
- **ac-snapshot-roundtrip**：`SNAPSHOT_SCHEMA` 仍为 `opencompare.snapshot/v1` 且 `SnapshotEntry` 字段集合不变；含文件链接、目录链接、悬空链接与链接环的树导出 `.ocsnap.json` 再导入，与实时树对比后四态计数与 `fileCount` 完全相等（链接各计 1 条）。
- **ac-real-footer-evidence**：`docs/` 证据文件给出真实 `/Users/zhutao/Cursor/DawnChat` ↔ `/Users/zhutao/Cursor/ZenMind` 的新旧 footer 对照表（条目总数、`same/added/removed/modified`、跳过左/右），每行标注可复现命令、被测 commit 与原始输出路径；新条目总数严格小于旧条目总数，差额可归因于「链接目标子树被重复计入」，四态差异只出现在链接相关条目；旧数字由可复现命令产出，不得手填或抄旧发布说明。
- **ac-gate-locked**：`.munk/code-gates.json` 的 `test` 门禁在 `pnpm test` 下运行上述真实落盘断言（vitest `mkdtemp` + `symlink` 真实样本，非 `src/shared/fixtures/` 内置样本），失败即红，单次运行时间有界（不扫 41G 全量目录）。
- **ac-symlink-evidence-json-valid**：`node -e "JSON.parse(readFileSync('docs/evidence/symlink-footer-old.json','utf8'))"` 与 `-new.json` 均成功，解析出的 `fileCount` 分别为 `1338294` / `752479`（内容数字不得改写）；`scripts/measure-symlink-footer.evidence.test.ts` 以 `OPENCOMPARE_EVIDENCE_OUT` 写出的文件可直接 `JSON.parse`（有测试断言），`OPENCOMPARE_SYMLINK_EVIDENCE` 标记只出现在 stdout。
- **ac-doc-refs-resolve**：`docs/symlink-no-follow.md` 中出现的每一个 `docs/...` 路径在磁盘上都存在（测试遍历断言），且文档不再出现 `.raw.log` 引用；原第 6 节两处指向不存在 `docs/evidence/symlink-footer-{old,new}.raw.log` 的断头路已改为对 stdout 标记行与两份 JSON 的真实描述。

## 非目标

- 不改 `same / added / removed / modified` 四态定义，不改文件哈希、目录聚合、合并与同步/模板的既有算法（链接作为叶条目的分类除外）。
- 不改 `.ocsnap.json` 线格式、schema 版本、字段与导入导出 UI 流程（链接只借用既有 `content` 字段）。
- 不做「跟随 / 不跟随」用户可选开关或设置项，不为链接保留跟随模式。
- 不改同步/模板对条目路径的既有处理逻辑，不为链接新增专属同步策略（也不得递归进入链接目标）。
- 不写 v0.2.5 版本号、发布说明与 README 三条已知问题的「已修复」翻转（`release-025` 负责）；不改写 v0.2.4 及更早的发布说明、证据与资产哈希。
- 不碰内存收敛（`memory-harness` / `memory-bounded`）与取消结构化（`cancel-structured`）两个子项。
- 不做浏览器/真机点选验收；公开件安装复验归 product-qa。
- 不顺手重构无关 UI/算法，不扩大改面。
- 证据格式收口项只做**文件格式与文档引用**：不改 `1,338,294` / `752,479` 等任何测量数字、不改四态 / 跳过 / 链接普查数值、不改测量入口的执行语义（仍不进 `pnpm test`）；不重跑真实目录测量、不改 `docs/symlink-no-follow.md` 的口径结论与差额归因、不改扫描 / 快照 / 渲染代码，不顺手优化文档排版。

## 实现约束

- 平台层只用 `lstat` 做条目元数据；`stat` 仅用于探测链接目标形态（`inspectLinkTarget`，失败一律归 `missing`，不冒泡 ENOENT/ELOOP）。`ENTRY_FALLBACK_CODES`（ENOENT / ELOOP / EACCES / ENOTDIR）仍只用于「条目本身不可检查」的兜底；`EMFILE` / `ENFILE` 仍整次失败（归 `io-concurrency`）。
- `DirectoryEntry` 只做增量可选字段，缺省视为普通条目；Web 内存实现不必支持链接，`src/core/` 仍禁止 electron/DOM 依赖。
- 核心层把链接判定集中在 `scanDirectory`（叶条目）与 `classifyPair` / `buildNode`（按目标串分类 + 类型冲突），不在多处复制；链接路径不参与 `needsContent` / 摘要规划。
- `leftSkipped` / `rightSkipped` 从 `ScannedTree.skipped` 与按侧统计的正文不可读计数聚合；`skipped` 保留为总和，避免破坏只需总数的既有调用方与测试。
- 快照标记前缀是**单一常量**（`SYMLINK_CONTENT_PREFIX`），编码/解码同文件成对出现；无标记内容按普通正文处理，保持旧快照可导入。
- 文档先改、实现后改；证据文件与口径说明放在 `docs/`（`docs/symlink-no-follow.md`，证据在 `docs/evidence/`）。
- 真实两目录只用于人工取证命令（`pnpm measure:symlink`），不进入 `pnpm test`；任何数字必须能追溯到命令与原始输出。
- **证据序列化单点**：`formatSymlinkEvidence(report)` 返回 `{ json, handoff }`——`json` 为纯 JSON 文本（末尾换行），`handoff` 为 `OPENCOMPARE_SYMLINK_EVIDENCE <同一 payload>`；harness 总是把 `handoff` 写 stdout，`OPENCOMPARE_EVIDENCE_OUT` 存在时只写 `json`。入库的两份 JSON 必须与该函数的 `json` 输出逐字节一致，防止手改与 harness 输出漂移。
- **文档引用可解析**：`docs/symlink-no-follow.md` 里反引号包裹的每个 `docs/...` 路径都由测试 `existsSync` 断言；删掉 `.raw.log` 引用，不保留悬空说明。
- 测试沿用仓库既有模式：`src/main/platform/electron-platform.test.ts` 已有 `mkdtemp` + `symlink` + `chmod` 真实落盘样本与 `vi.mock('electron')`；核心语义断言在 `src/core/directory/*.test.ts`，UI 提示 / 下钻在 `src/renderer/src/App.test.tsx`。

## 最近交付证明

- WI：`wi_ws_78db9f76d9541e6e`（v0.2.5 发布证据采集与元数据实测——本域承担其中两处符号链接证据文档断头路；`kind: release-evidence`）
- 日期：2026-10-22
- 结果：code_gates passed（本轮 `needSelfTest=false`，UI 自测跳过）。只改证据文件格式、harness 序列化与文档引用，测量数字与口径结论零改动。
- 覆盖摘要：
  - `docs/evidence/symlink-footer-old.json` / `-new.json`：去掉行首 `OPENCOMPARE_SYMLINK_EVIDENCE ` 前缀，成为合法 JSON；`fileCount` 仍为 `1338294` / `752479`，`counts`、`skipped`、`linkCensus` 全部原值保留。
  - 新增 `scripts/symlink-evidence-format.ts`（23 行）：`SYMLINK_EVIDENCE_MARKER` 常量 + `formatSymlinkEvidence(report)` 同时产出纯 JSON 与带标记 handoff，两者来自同一 `JSON.stringify`，不会漂移。
  - `scripts/measure-symlink-footer.evidence.test.ts` +11/−6：改用 `formatSymlinkEvidence`；`OPENCOMPARE_EVIDENCE_OUT` 只写 `json`（纯 JSON），标记行 `handoff` 始终写 stdout——下次测量不会再把坏 JSON 写回证据文件。
  - `docs/symlink-no-follow.md` +3/−3：两处 `symlink-footer-{old,new}.raw.log` 引用改为「stdout 的 `OPENCOMPARE_SYMLINK_EVIDENCE` 行 + `OPENCOMPARE_EVIDENCE_OUT` 纯 JSON」的真实描述，表格数字与差额归因未改。
  - 新增 `src/main/symlink-evidence.test.ts`（78 行 / 4 条）：两份 JSON 可解析且 `fileCount` 为 1338294 / 752479、四态之和等于 `fileCount`；入库文件与 `formatSymlinkEvidence(report).json` 逐字节一致；OUT 落纯 JSON 而 handoff 以标记开头且可解析；`docs/symlink-no-follow.md` 内每个 `docs/...` 引用 `existsSync` 为真且全文无 `.raw.log`。
- 证据：`git diff --numstat`（不含 fold）为两个 JSON 各 1 行替换、`docs/symlink-no-follow.md` +3/−3、`scripts/measure-symlink-footer.evidence.test.ts` +11/−6；新增 `scripts/symlink-evidence-format.ts` 23 行与 `src/main/symlink-evidence.test.ts` 78 行。静态核对：`JSON.parse` 得到 `fileCount` 1338294 / 752479；文档引用集合 2 条全部存在，`.raw.log` 0 命中；未重跑真实目录测量，未改扫描 / 快照 / 渲染代码。
- 注：本 WI change pack 只提供 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**` —— 无 change-pack 用例可 copy、无 tech/ux 手合；本域两条 AC 落档为 `qa/symlink-evidence-json-and-doc-refs.md`。
- 后续注意：① 入库 JSON 现在被断言「与 harness 输出逐字节一致」——若将来 `formatSymlinkEvidence` 改换行或字段序，必须同步重生成两份证据文件，否则该断言会红；这是有意的防漂移。② 证据数字仍来自 2026-10-22 的本机真实目录测量，仓库无原始 stdout 副本；`docs/symlink-no-follow.md` 已不再引用 `.raw.log`，但若要重新核对 1,338,294 / 752,479，只能重跑 `pnpm measure:symlink`（依赖本机两个真实目录存在）。
