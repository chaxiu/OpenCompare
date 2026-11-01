# 目录单向镜像同步四条行为：钉入门禁可复核断言

## 范围

把真实外部目录复验依赖的四条单向镜像同步行为，钉进 `.munk/code-gates.json` 可复核的断言面，并只补现有覆盖的缺口：

1. 镜像删除默认不勾、显式勾选才执行：未勾时摘要/可执行计数一致且 Apply 不可用，执行后只删勾选项。
2. 同一对目录重复执行幂等：第二次 Dry-run 三组为空（无分组条目）。
3. 执行后目标文件保留源 mtime 与相对路径结构（含中文/空格与多层嵌套）。
4. 同 target 链接仅 `lstat` mtime 不同时：Dry-run 待对齐计数 > 0、Apply 可执行、执行后目标链接 mtime 与源对齐；UI 与门禁共用同一可执行判定。

先审现有断言并直接复用；经核对，四条行为的主体断言已分别落在：

- `src/sync-real-gate.test.ts`
  - ① `keeps mirror deletions unchecked: no paths deletes nothing, checked paths delete only themselves`、`keeps the checked delete count, the applied result and the disk in one state`
  - ② `applies left → right for real, preserves content / structure / mtime and refreshes once`、`applies right → left with an explicit select-all and stays idempotent`、`real-disk sync idempotent dry-run › lists only the pending deletion after applying, and nothing once it is deleted`
  - ③ 同 ② 的前两条用例（全量相对路径清单 + 整毫秒 mtime 逐项相等）
  - ④ `is executable when only the link mtime differs, aligns it, and is idempotent`、`stays executable in both modes while mirror deletes keep opting in`
- `src/renderer/src/views/directorySyncDialog.test.tsx`
  - ① `keeps the delete opt-in: an unchecked mirror deletion alone is not executable`、`keeps summary, Apply and guidance in sync through 0 → 1 → 0`
  - ④ `keeps Apply enabled and shows the pending link count when only link times differ`、`matches canApplySyncPreview case by case`

只补以下缺口（不重复造用例、不改产品行为）：

- **清单侧可复核索引**：默认矩阵仍为 11 项（`quality-gates` 域现行纪律：同类真实磁盘断言并入现有门文件，不新增矩阵项），在 `.munk/code-gates.json` 的 `description` 写入四条行为 → 门禁 id / 测试文件的覆盖映射；并在 `src/munk-gates.test.ts` 增加静态断言，把该映射连同两个测试文件的存在性一起钉住（映射漂移即红）。
- **① UI 默认态**：弹窗用例补充显式断言镜像删除复选框初始 `checked === false`（现在只隐含在 Apply 禁用里）。
- **② 无分组**：幂等用例在末次 Dry-run 补充三组 `items` 逐组为空的显式断言（现有仅断言 `count === 0`）。
- **④ 待对齐计数**：真实磁盘 link-align 用例补充 `syncPreviewAction(preview).align > 0` 且等于 `preview.linkAlignments.length`，执行后再断言该计数归零（现在只断言列表非空与 `canApplySyncPreview`）。
- **④ 可执行同源**：保持 UI 与门禁均调用 `canApplySyncPreview` / `syncPreviewAction` 的既有断言，并将该同源事实写入清单映射，不新增第二份内联判定。

## 验收标准

- ac-manifest-coverage-map: `.munk/code-gates.json` 仍可 `JSON.parse` 且 `version === 1`、`gates` 恰 11 项（id/顺序/命令/`cwd` 逐字不变、无 `perf-gate`）；`description` 含四条行为与 `sync-real-gate` / `test` 两个门禁 id、`src/sync-real-gate.test.ts` / `src/renderer/src/views/directorySyncDialog.test.tsx` 两个文件名的覆盖映射。
- ac-manifest-pin-test: `src/munk-gates.test.ts` 在默认矩阵 describe 中新增静态用例，断言上述四条行为标记、两个门禁 id 与两个测试文件路径均出现在 `description`，且两个测试文件在仓库根 `process.cwd()` 下真实存在；原有 11 项形状断言保持不变。
- ac-delete-default-unchecked: 真实临时目录对上，镜像 Dry-run 的删除组初始无勾选（弹窗复选框 `checked === false`）；不传/传空 `deletePaths` 执行时 `deleted === 0` 且目标侧相对路径清单与执行前逐项相等。
- ac-delete-shared-predicate: 在上一条同一预览上，`syncPreviewAction(preview)` 返回 `delete === 0`、`executable === false`、`guidance === 'noExecutable'`，`canApplySyncPreview(preview) === false`；勾选任一删除路径后同一判定返回 `delete === 1`、`executable === true`，执行后仅该路径消失。
- ac-repeat-dryrun-empty-groups: 删除组全选执行完成后立即对同一方向再 Dry-run：`copy/update/delete` 三组 `count === 0` 且 `items` 逐组为空、`totalCount === 0`、`totalBytes === 0`；同一对目录重复一轮后末次 Dry-run 仍三组为空。
- ac-mtime-and-structure-preserved: 执行后每个被写入目标文件在目标根下存在于与源相同的相对路径（含中文/空格与 ≥4 层嵌套），且 `Math.floor(target.mtimeMs) === Math.floor(source.mtimeMs)`；目标侧相对路径清单与源侧逐条相等。
- ac-link-align-count-positive: 两侧 link target 相同、仅 `lstat` mtime 不同的链接对（含悬空链接）在真实临时目录上 Dry-run：`preview.linkAlignments.length > 0` 且 `syncPreviewAction(preview).align === preview.linkAlignments.length`，`canApplySyncPreview(preview) === true`，三组计划 count 均为 0。
- ac-link-align-applied-mtime: 执行后每条此类目标链接仍是 symlink、`readlink` 与源逐字符相等、`Math.floor(lstat(target).mtimeMs / 1000) === Math.floor(lstat(source).mtimeMs / 1000)`，`copied/updated/deleted` 均为 0；再次 Dry-run 时 `syncPreviewAction(next).align === 0` 且 `canApplySyncPreview(next) === false`。
- ac-dialog-shared-predicate: `directorySyncDialog.test.tsx` 中仅链接时间不同的预览断言 Apply `disabled === false`、摘要待对齐数等于 `syncPreviewAction(preview).align`，并断言 `canApplySyncPreview` 与 `syncPreviewAction(...).executable` 在空/未勾删除/已勾删除/仅对齐各用例上逐例相等。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` 全绿；既有断言不得 skip、删除或放宽。
- ac-diff-scope: `git diff --name-only` 仅含 `.munk/code-gates.json`、`src/munk-gates.test.ts`、`src/sync-real-gate.test.ts`、`src/renderer/src/views/directorySyncDialog.test.tsx` 及本 WI 的 `.munk/changes/wi_intake_054f9f070b2632cd/**` 记录。
- ac-no-manual-or-network: 所有新增断言确定性、可在 CI 运行（纯函数 / jsdom / `mkdtemp` 临时目录文件系统），不依赖真人点选、固定 sleep 或网络。

## 非目标

- 不新增默认矩阵门禁项（保持 11 项），不改 `package.json`（含 scripts、依赖、`version`）；不新增 npm script。
- 不改目录对比四态口径、快照格式、导出格式、发布通道；不动任何已公开 tag / Release / 资产。
- 不为凑绿放宽、skip 或删除既有判定；不重跑已作废的 L3 场次；不新建测试类 WorkItem 之外的运营任务。
- 最多做可测性所需的极小重构，且不得改变行为、须附等价性证据。

## 实现约束

- 复用现有真实磁盘与 jsdom 用例，只补缺口；新增断言附可区分标识（沿用 `sync summary` / `idempotent dry-run` / `symlink metadata` 既有前缀或新增明确消息）。
- `sync-real-gate` 是已有重门（真实临时目录，两侧各 1,000 文件，约 20–40 s），不得再叠一层同量级全量落盘；清单侧只改 `description`，运行成本不变。
- 临时目录统一走既有 `scratchRoot()` / `mkdtemp` 清理路径；mtime 比较沿用整毫秒 / 整秒归一，避免精度抖动。
- `description` 文案保持英文（清单现状），覆盖标记使用稳定、可搜索的短语，便于 `src/munk-gates.test.ts` 静态断言。
- 交付报告须逐条给出：行为 → 文件 + 用例名 + 断言内容；并说明四条行为哪些是复用、哪些是本次补的缺口。
- 若执行中发现真实产品缺陷（如链接 mtime 对齐、删除 opt-in、幂等实际不成立），立即停手并 `munk_report_owner`，不夹带修复。
