# 目录同步按链接落盘：不跟随、不写穿、不误删

## 背景与根因

P1⑤「目录单向镜像增量同步」结案被驳回：`src/core/directory/sync.ts` 的 `writeItem` 对计划项一律
`readFileBytes(sourcePath)` + `writeFileBytes(targetPath)`。`readFileBytes` 跟随链接，源侧独有的
symlink 落盘后退化为普通文件（内容是链接指向目标的字节），`buildSyncPlan` 又把它当普通 copy，
落盘后按内容校验仍判「一致」，类型保真缺口被静默掩盖。

同源风险点一并收口：

1. 目标侧已有 symlink、源侧同路径是普通文件/目录时，直接写同一路径会写穿链接或改掉链接指向的真实文件；
   覆盖前备份 `readFileBytes(targetPath)` 同样跟随链接，回滚会把链接变成普通文件。
2. 镜像删除目标侧 symlink 时，若按内容备份/删除，会误删链接指向的文件；悬空链接还会因读不到内容失败。
3. 目标侧已有 symlink 且源侧是不同 target 的链接时，需要「先删链接再建链」，不能穿透旧链接。

## 范围

1. **计划项按条目类型分派**：`buildSyncPlan` 对源侧为 symlink 的 copy/update 项携带 `linkTarget`
   （源侧 `readlink` 字面串）；普通文件项不带。链接项绝不进入按字节读正文的分支。
2. **链接落盘**：`writeItem` 对带 `linkTarget` 的条目在目标侧创建同名 symlink，`readlink` 字符串
   逐字保留（相对路径不解析成绝对路径）；悬空链接照建不报错，指向目录的链接照建且不物化目标子树；
   lstat mtime 复用既有 `setSymbolicLinkModifiedMs`（`lutimes` 级，不跟随链接）对齐到源。
3. **目标侧既有链接的安全替换/删除**：update/delete 前先 unlink 链接本身，绝不写穿；链接感知的
   备份/回滚保留「链接形态 + link target + lstat mtime」，不得退化为普通文件。
4. **校验按形态而非内容**：链接项用 `lstat().isSymbolicLink()` + `readlink` 逐字 + mtime 秒级判定，
   不得用内容 hash；普通文件仍按 size + sha256；悬空链接不得因读不到内容而失败。
5. **真实落盘门禁**：在既有 `sync-real-gate` / `pnpm test:sync-real` 增加真实临时目录断言，覆盖
   A/B/C 与验收 1)~5)，并与 UI 共用 `canApplySyncPreview` / `previewSync` / `applySyncPreview`。
6. **文档口径**：`docs/lessons.md` 写入本次一句话教训；README 双语 known issues 段只保留两条设计口径，
   不再把该缺陷登记为 known issue；v0.2.15 release notes 由下一目标版本收敛项写，本项不碰。

## 验收

- ac-plan-carries-link-target: `buildSyncPlan` 对源侧为 symlink 的 copy/update 项必须携带 `linkTarget`，其值逐字等于 `readlink(sourcePath)`；普通文件项的 `linkTarget` 必须为 `undefined`；链接项不得被当作普通文件进入按字节读正文的分支。
- ac-link-items-never-read-content: 同步源侧独有链接（相对、悬空、指向目录各一）时，源链接路径与目标链接路径都不得传给 `readFileBytes` / `digestFiles`（记录式 IO 断言）；悬空链接不得因 `ENOENT` 报错或跳过。
- ac-link-copy-relative-and-dangling: 在左→右与右→左、Incremental 与 Mirror 四种组合下，源侧独有 symlink（a. 相对目标在目标侧存在且内容不同；b. 悬空目标）同步后目标侧 `lstat().isSymbolicLink() === true`、`readlink(target) === readlink(source)` 逐字相等、相对路径不变、`Math.floor(lstat(target).mtimeMs / 1000) === Math.floor(lstat(source).mtimeMs / 1000)`；目标不得是同内容普通文件，链接落盘本身不得读取或改写链接指向的文件（该文件若另有计划项，其变化只能来自该计划项）。
- ac-link-copy-directory-target: 源侧独有、指向目录的 symlink 同步后目标侧仍是 symlink 且 `readlink` 逐字相等，链接目标目录的子条目不被拷贝进目标树（目标侧该路径下不产生普通文件/目录副本）。
- ac-link-update-replaces-target: 目标侧已有 symlink 且 link target 与源不同时，同步后目标 `readlink` 逐字等于源、mtime 秒级相等、仍是 symlink；被替换的旧链接指向的文件字节与 mtime 不变。
- ac-target-link-replaced-by-file: 目标侧已有 symlink、源侧同路径是普通文件时，同步后目标路径 `lstat().isSymbolicLink() === false`，size + sha256 + 整毫秒 mtime 等于源；原链接指向的文件（位于同步对之外或不在本轮计划内）sha256 与 mtime 前后完全一致。
- ac-target-link-not-written-through: 对目标侧 symlink 的 update/delete 必须先移除链接本身再写/删，不得通过链接读写其目标；断言链接指向文件的 sha256 与 mtime 在同步前后一致，且目标路径的新形态是普通文件（update）或不存在（delete）。
- ac-link-target-outside-untouched: 目标侧链接指向的文件位于同步对之外（镜像外）时，链接的新建、替换、删除都不得改动该文件的字节与 mtime；同步前后 sha256 与 `Math.floor(lstat(...).mtimeMs)` 完全一致。
- ac-mirror-delete-link-only: 镜像模式下目标侧独有 symlink（含指向文件与指向目录各一）显式勾选删除后，只移除链接本身；链接指向的文件仍存在且字节/mtime 不变，链接指向的目录及其子条目仍存在。
- ac-mirror-delete-default-unchecked: 目标侧独有 symlink 进入 delete 组时默认不勾选；未勾选执行时链接保留，dry-run 仍列出该 delete 项且 `plan.delete.count` 不变。
- ac-link-delete-rollback: 删除目标侧 symlink 后注入失败/取消，回滚重建的仍是 symlink，`readlink` 逐字等于运行前、lstat mtime 秒级等于运行前，不得重建为普通文件。
- ac-verification-link-by-form: 落盘后校验对链接项按 `lstat` + `readlink`（+ mtime 秒级）判定，不得对链接路径调用 `digestFiles` / 内容 hash；悬空链接同步后 `applySyncPreview` 必须 resolve 成功；注入「建链后 readlink 不同」或「链接 mtime 未对齐」时 `applySyncPreview` 必须 reject 可识别的 `SyncVerificationError`，不得报成功。
- ac-completion-truthful: `applySyncPreview` 返回的 copied/updated/deleted/alignedLinks 与实际落盘逐项一致——链接新建计入 copied、链接替换计入 updated、勾选删除链接计入 deleted、仅「两侧同 target 仅 mtime 不同」的对齐计入 alignedLinks；完成提示只消费这四个数，不得出现实际写了链接却报 0 copied / 0 updated。
- ac-post-sync-dryrun-empty: 同步成功后立即对同一对目录、同方向同模式再次 dry-run：`plan.copy.count` / `update.count` / `delete.count` / `totalCount` 全为 0，`linkAlignments` 为空，`canApplySyncPreview` 返回 `false`。
- ac-post-sync-four-state-same: 同步成功后刷新得到的 `DirectoryComparison.counts` 必须为 `same === fileCount` 且 `added === 0 && removed === 0 && modified === 0`；该断言与 ac-post-sync-dryrun-empty 各自独立，不得用四态替代 dry-run，也不得用 dry-run 替代四态。
- ac-refresh-after-sync: `applySyncPreview` 成功路径必须重新比较真实落盘后的两侧目录并返回新的 `DirectoryComparison`（不是执行前对象）；目录树、四态计数与状态栏消费该刷新结果。
- ac-counts-and-delete-optin-unchanged: 三组分类定义与计数口径不变（链接新建仍计 1 个 copy、链接替换仍计 1 个 update、镜像删除仍计 1 个 delete，字节口径沿用既有 lstat size）；链接 mtime 对齐不进入三组计数；删除项默认不勾语义不变；四态口径、快照线格式与导出格式不动。
- ac-file-overwrite-rollback-unchanged: 源侧普通文件覆盖目标侧只读/占用/中途失败时，回滚语义与既有断言不变（目标字节与 mtime 恢复到执行前）；既有 binary fidelity / completion consistency / symlink metadata / idempotent dry-run 用例零回归。
- ac-ui-shared-predicate: 新增门禁用例必须通过 `previewSync` 得到预览、用 `canApplySyncPreview` 断言可执行性、再走 `applySyncPreview` 落盘，不得直接调用 `executeSyncPlan` / `writeItem` 绕过 UI 判定；`DirectorySyncDialog` 的 Apply `disabled` 仍由同一纯函数派生，既有 UI 测试保持全绿。
- ac-gates-eleven-green: `.munk/code-gates.json` 既有 11 个门禁 id 与命令不变且全绿（含 `test`、`sync-real-gate`）；不得删除、跳过或放宽任何既有断言；新增断言以 `symlink fidelity` 独立标识落在 `src/sync-real-gate.test.ts`。
- ac-no-new-dependency-no-bump: `package.json` 依赖不新增、版本不 bump、不打 tag、不改导出与发布通道、不改任何已发布 release notes。
- ac-known-issues-posture: `README.md` 与 `README.zh-CN.md` 的 Known issues / 已知问题段同时列出「Incremental 模式无删除组」与「外部改动需重扫」两条设计口径，且不包含「源侧独有 symlink 按普通文件同步」这类缺陷表述；既有 `release-packaging.test.ts` 断言保持全绿（保留 `None known right now.` / `当前没有已知未修复问题。` 原句，不删除、不放宽；若确与改动冲突，先回报再动）。
- ac-lessons-written: `docs/lessons.md` 新增一条带日期（2026-11-01）的一句话教训，逐字包含：`known issue 不得用于掩盖打穿验收条款的类型保真缺口：链接/二进制/权限等形态保真必须由真实落盘端到端断言钉住，且校验不得用内容 hash 代替形态`。
- ac-delivery-note: 交付说明逐条点名 A/B/C/D 与验收 1)~5) 各由哪条断言（文件 + 用例/断言消息）覆盖，并列出合入 main 后尚未发布的提交。

## 非目标

- 不改目录对比四态语义、`.ocsnap` 快照线格式、比较器对 symlink 的判等口径（仍按 link target 判等）。
- 不改 plan 三组分类定义、三组计数口径、删除默认不勾语义。
- 不改导出、发布通道、版本口径与已发布 release notes；不 bump 版本、不打 tag。
- 不做双向同步、实时监听、远端 SFTP；不新增依赖。
- 不做目标侧真实目录的类型替换：目标同路径是真实目录时仍按既有 `EISDIR` 预检拒绝，不递归删除/替换目录树。
- 不做 UI 重排、视觉调整或文案体系重写；不新增页面/交互层级。
- 不编辑 `.munk/baseline/**`（Host 基线域文档中的 known issue 登记由 Delivery/Host 在结案时移除）。
- 不写 v0.2.15 release notes（由下一目标版本收敛项写）。

## 实现约束

- **类型与计划**：`SyncPlanItem` 增加可选 `linkTarget?: string`（`undefined` 表示普通文件）；`DirectoryDiffNode` 增加信息性的每侧链接字面串（由 `ScannedNode.linkTarget` 派生），仅用于计划分派。`classifyPair` 判等、四态计数、快照与下钻口径不得改动。
- **平台缝**：`SyncIo` 增加不跟随链接的读链/建链能力（如 `readSymbolicLink` / `createSymbolicLink`），`PlatformPort`、`PLATFORM_CHANNELS`、main handler、preload 白名单、Web 内存实现按既有模式同步补齐；Electron 侧使用 `readlink` / `symlink` / `lutimes` 级原语，禁止用会跟随链接的 `utimes` 给链接打时间。Web 运行时无链接能力时保持同一签名与语义（可拒绝/空实现），不得引入 Node 依赖。
- **写路径分派**：`writeItem` 对 `linkTarget !== undefined` 的条目：确保父目录 → 以 `lstat`/`readlink` 备份目标侧既有条目（链接备份链接串 + mtime，普通文件备份字节 + mtime，缺失记 absent）→ 若目标存在先 unlink 链接/文件本身 → 用字面串创建 symlink（悬空、指向目录均允许）→ 用 `lutimes` 级能力对齐 mtime。普通文件项若目标侧是链接，同样先 unlink 再原子写，绝不写穿。undo 必须在触碰目标前登记，回滚按原形态恢复（链接→重建链接 + mtime；文件→写回字节 + mtime；缺失→unlink）。
- **删除路径**：镜像删除目标侧链接时按链接备份（link target + mtime），只 unlink 链接本身；回滚重建链接并恢复 mtime。不得用 `readFileBytes` 备份链接，也不得递归删除链接指向的目录。
- **校验路径**：`SyncWrittenTarget` 需携带足够信息区分链接/普通文件；链接项按 `lstat().isSymbolicLink()` + `readlink` 逐字 + mtime 秒级校验，普通文件按 size + sha256；已勾删除项仍按 listing（lstat 视图）判存在。校验范围仍只覆盖本轮 `written` / `deletedPaths`，不得整树二次哈希。
- **预检**：目标侧 symlink 不得被误判为 `EISDIR`（`DirectoryEntry.isDirectory` 对链接为 false）；目标侧真实目录仍按既有 `EISDIR` 拒绝；预检保持零落盘。
- **物化路径**：`copyScannedTree` 遇到扫描树中带 `linkTarget` 的节点时，必须走同一建链 seam 物化链接，不得保留「读正文跟随链接」的同类缺口。
- **测试**：只扩 `src/sync-real-gate.test.ts`（`pnpm test:sync-real`），不新增 `code-gates.json` 门禁 id；沿用 `vi.mock('electron')` + handler map + `mkdtemp` 真实临时目录与生产 `PlatformPort` handler，不 mock 文件系统；链接形态断言必须用 `lstat` / `readlink`，不得用 `stat` / `readFile` 代替形态校验。新增断言消息以 `symlink fidelity` 标识，与既有 `binary fidelity` / `completion consistency` / `symlink metadata` / `idempotent dry-run` 可区分。
- **链接 mtime 失败语义**：新建/替换链接的 mtime 对齐失败按写失败处理（回滚到执行前形态）；既有「仅两侧已同 target、只对齐 mtime」路径仍按 `SyncVerificationError` 报不一致、不回滚，两者不得混用。
- **完成提示**：只消费 `SyncApplyResult` 的 copied/updated/deleted/alignedLinks；若需新增 i18n 键，zh/en 必须同步并通过 key 完整性与占位符 parity 测试；优先复用既有键。
- **文档**：README 只改 Known issues / 已知问题段，不碰版本口径行、不加版本号、不改已发布 release notes；保留 `None known right now.` / `当前没有已知未修复问题。` 原句，在其后以「设计口径，不是缺陷」补两条，建议文案为英文 `Incremental sync never lists deletions; switch to Mirror to remove target-only items.` / `Changes made outside the app are not picked up automatically; rescan the pair to see them.`，中文 `Incremental 模式不列出删除项，需要删除目标侧独有项时切换到 Mirror。` / `应用外部的改动不会自动出现，需要重新扫描/预览。`；不得出现 `悬空符号链接` / `dangling symlink` / `EMFILE` / `已修复` / `v0.2.`。`docs/lessons.md` 只追加本次一句话教训；不新增文档文件。
- **范围守卫**：发现对比树的链接比较语义会让同步后仍报差异（例如比较跟随链接）时，先如实记录并回报，不得用 known issue 掩盖或强行改四态。

## 交付口径

- 走 coding → code_gates（11 门）→ delivery 合入 main；交付说明逐条点名 A/B/C/D 与验收 1)~5) 的覆盖断言。
- 交付说明列出合入 main 后尚未发布的提交（`git log --oneline <last-release>..main` 口径），供后续发版取点。
- Host 基线域文档（`.munk/baseline/**`）中的「源侧独有 symlink 按普通文件同步」known issue 登记由 Delivery/Host 在结案时移除；Coding 不直接编辑该目录。
