# 修掉目录同步二进制落盘不保真，并让「同步完成」提示只在目标与源一致时出现

## 背景（L3 实机红项，main 4f3276f / 打包 app，CDP 驱动真实窗口）

夹具：左 1202 文件 / 右 720 文件，含 1 个真实 png 与 1 个 0 字节文件；目录
`/tmp/oc-l3sync-leg2-left` ↔ `/tmp/oc-l3sync-leg2-right`。

- 同步前 png 9,761 B / sha256 `283cc535…096bec`；同步后 16,810 B / sha256 `ed67d056…919508`，多出
  3,573 个替换字符 ⇒ 落盘链路把文件当 UTF-8 文本解码再编码，破坏任意非文本字节。空文件 0 B sha256
  正确（证明不是采集侧换算错）。
- 取消 / 只读失败安全本身是绿的（取消后目标逐项回到快照、只读被拒且不变、可重试）。
- 但重试完成后界面提示「Sync complete: 482 copied · 720 overwritten · 0 deleted.」，随后逐项比对：
  onlyLeft/onlyRight 为空、文本文件全对，唯一 sha 不一致就是那个 png ⇒ **报成功时目标与源并不一致**，
  提示与磁盘实际状态不同源。
- 证据：`projects/ops_df43e423451170fd/.munk/runs/trun_ef4ab851fce42a76/evidence/leg2-z-run-summary.json`
  （`assertions.F`、`retry.targetMatchesSource=false`）、`leg2-d-binary.json`、`leg2-e-retry.json`
  （`vsSource.shaMismatch` / `binaryMismatch`）。

同一条工作项的第二处实机红项（L3 腿1，358k 逐项比对）：326,175 条目 / 326,140 普通文件 /
3,455,112,560 字节的全量 sha256、size、link target、路径集合、noLeftOnly/noRightOnly 全部相等，唯一不齐的是
**35 条 symlink 的 lstat mtime**：目标侧全部变成同步时刻 `1793463223`，源侧如 `1787741060`。即落盘保留了
link target 与相对路径，却没有保留 symlink 自身的 lstat mtime。

代码现状（定位结论，供 Coding 对齐，不作为技术方案强制）：

- 同步执行器 `executeSyncPlan` 通过文本 seam `SyncIo.readTextFile` / `SyncIo.writeTextFile`
  搬运内容（`src/core/directory/sync.ts`），写入侧落到 `writeFileAtomically`（`src/main/platform/electron-platform.ts`）
  只接 `string`；回滚备份同样以 `string` 保存（`FileBackup.content`），因此覆盖型回滚、删除型回滚对二进制
  同样是坏字节。只读样本树物化 `copyScannedTree` 走同一条文本 seam。
- 完成提示来自 `applySyncPreview` 成功后的 `shell.notice.syncComplete`（`src/renderer/src/workbench/Workbench.tsx`），
  当前不做任何落盘后校验；`applySyncPreview` 成功后只重跑比较。刷新后的比较用原始字节 digest
  （`digestFiles`，`node:crypto`），所以坏 png 在刷新树里会显示为 modified，但提示已经先报成功。
- symlink 侧：`inspectEntry` 已经用 `lstat` 读链接自身的 `modifiedMs`，比较器 `classifyPair` 对链接只看
  link target（相等即 `same`，目标体不哈希）；同步计划 `SyncPlanItem` 不带 `linkTarget`，写路径也没有任何
  建链/改链动作，`utimes` 只作用于跟随后的普通文件。因此「link target 相同、仅 lstat mtime 不同」的链接对
  永远进不了计划，也就永远不会有任何一步把链接自身的时间对齐到源。

## 范围

1. **二进制字节保真**：目录同步的写盘路径全程按原始字节搬运，不经过任何 UTF-8 解码/编码。覆盖
   `copy` 与 `update` 两类写入；覆盖回滚（覆盖前备份、取消回滚、删除项回滚）的字节保真；覆盖同步前置的
   只读树物化（`copyScannedTree`）。既有原子写（临时文件 → rename）、失败回滚、mtime 保真、删除默认不勾
   语义、双向/增量模式语义全部保持。
2. **完成提示与实际一致**：落盘完成后对**本轮实际写入的目标文件**（以及用户已勾选的删除项）做字节级事后
   校验；校验通过才走「Sync complete」提示。有差异时不得报成功，改为与现有提示体系一致的失败提示，
   并指出不一致的条数与路径样例。
3. **symlink 落盘元数据保真**：同步落盘后，目标侧 symlink 的 lstat mtime 秒级与源一致；link target 与
   相对路径不变。含两类：源侧独有（需新建链接）/ 目标侧指向不同或已失效（需替换链接）的链接，以及
   两侧 link target 已相同、仅 lstat mtime 不同的链接对（需要一次元数据对齐）。比较器的 symlink 判等口径
   （按 link target 相等即 `same`）保持不变。
4. **可回归断言进 code_gates**：在 `sync-real-gate`（`src/sync-real-gate.test.ts`）现有腿上增加二进制样本
   （PNG + 含 `0x00` 与非 UTF-8 序列的随机字节 + 空文件）、symlink 样本（新建 / 替换 / 仅 mtime 不同 +
   悬空链接）与「同步后目标 vs 源内容等价 + symlink 元数据等价」断言；断言失败必须能明确指出是
   「二进制保真」「完成态一致性」还是「symlink 元数据」。
5. 交付说明需点名：上述实机红项分别由哪条断言覆盖，以及改动的函数路径与门禁名。

## 验收

- ac-binary-png-byte-exact: 真实 PNG 样本（含 `0x89 0x50 4E 47` 签名与二进制 IDAT 之外的任意非文本字节）经同步写入目标后，目标文件的字节数与 sha256 均与源完全相等；用 `readFile` 原始字节断言，不做任何文本转换。
- ac-binary-random-byte-exact: 含 `0x00` 与非 UTF-8 序列（如 `0x80`/`0xff`/孤立 `0xC3`）的随机字节样本同步后字节数与 sha256 与源完全相等。
- ac-binary-update-path-exact: 目标侧已存在、内容不同的二进制文件走 `update`（覆盖）时，落盘结果与源字节完全相等（覆盖路径与新建路径同样保真）。
- ac-empty-file-stays-empty: 0 字节源文件同步到不存在的目标后目标为 0 字节，sha256 等于空内容哈希；再次同步后仍为 0 字节。
- ac-text-unchanged: UTF-8 文本文件同步后的内容与 mtime（整毫秒）断言与改动前一致，四态计数与计划分组口径不变。
- ac-mtime-preserved-binary: 二进制样本同步后目标 mtime（整毫秒）与源相等，与文本文件同一保真规则。
- ac-rollback-binary-restore: 覆盖二进制文件后注入失败/取消，回滚把目标恢复到运行前的**原始字节**与 mtime（逐字节 + sha256 相等），不得出现替换字符或字节数变化。
- ac-delete-rollback-binary-restore: 已勾选的二进制文件删除后注入失败/取消，回滚重建该文件且字节与 mtime 与运行前完全相等。
- ac-completion-blocked-on-mismatch: 当本轮写入的任一目标文件与源不一致（用注入 seam 让某次写入落坏字节模拟）时，`applySyncPreview` 不得 resolve 成功；必须 reject 一个可识别的校验失败，携带不一致条数，渲染层走 danger 提示而非 `shell.notice.syncComplete`。
- ac-completion-requires-source-equivalence: 成功路径下 `applySyncPreview` 仅在每个写入目标 sha256 均等于对应源时才 resolve；resolve 后对同一对根目录用原始字节 digest 逐项比对，除用户未勾选删除的残留外无任何 added/removed/modified 差异，且对同一方向/模式重建计划时 `copy.count === 0 && update.count === 0`。
- ac-verification-scope-written-only: 事后校验请求的文件集合恰好是本轮写入的目标文件（+ 已勾选删除项的存在性检查），不含本轮未写的文件；以注入 seam 记录校验读取路径断言，保证 358k 级同步不因整树二次哈希而退化。
- ac-unchecked-delete-not-failure: 镜像同步存在未勾选的删除项时，目标残留这些文件不构成校验失败——提示仍为成功（copy/update 已全部对齐），且删除默认不勾的语义与计数口径不变。
- ac-symlink-copy-preserves-target-and-mtime: 源侧独有的 symlink 同步后，目标侧是 symlink（`lstat().isSymbolicLink() === true`），`readlink` 得到的 link target 与源逐字符相等，相对路径与源相同，`Math.floor(lstat.mtimeMs / 1000)` 与源相等；目标不得变成同内容的普通文件。
- ac-symlink-update-preserves-target-and-mtime: 目标侧已存在但 link target 不同的 symlink 在同步后被替换为源的 link target，且 lstat mtime 秒级与源相等。
- ac-symlink-same-aligned-mtime: 两侧 link target 已相同、仅 lstat mtime 不同的 symlink 对，同步落盘后目标侧 lstat mtime 秒级与源一致（link target 与相对路径逐字符不变，且不写入任何普通文件内容）。
- ac-symlink-dangling-preserved: 指向不存在目标的悬空 symlink 同步后仍是 symlink、link target 与 lstat mtime 秒级与源一致（不因目标缺失而退化为空文件或失败）。
- ac-symlink-alignment-idempotent: symlink 的 mtime 对齐不进入 copy/update/delete 分组——对齐前后 `plan.copy/update/delete` 的 count 不变，且对齐后同一方向/模式再次 dry-run 三项计数仍为 0（既有「二次 dry-run 为空」断言不回退）。
- ac-symlink-four-state-unchanged: 比较器对 symlink 仍按 link target 判等（link target 相同即 same，不引入 mtime 参与判定）；既有四态计数、快照格式与 symlink 下钻口径不变。
- ac-gates-eleven-green: `.munk/code-gates.json` 既有 11 个门禁 id 与命令不变且全绿；`sync-real-gate` 新增的二进制、完成态与 symlink 断言以独立用例/独立断言消息落地，失败信息含 `binary fidelity`、`completion consistency`、`symlink metadata` 三类可区分标识。
- ac-no-new-dependency: 哈希只用 `node:crypto`（渲染层走既有纯 JS SHA-256 实现），`package.json` 依赖不新增、版本不 bump、不打 tag、不改已公开 Release 与资产。

## 非目标

- 不改四态（same/added/removed/modified）语义与 `.ocsnap` 快照格式；不改比较器对 symlink 的判等口径
  （仍按 link target 判等，不把 lstat mtime 纳入判定），也不改链接目录不下钻的口径。
- 不改导出格式、模板提取（template extract）的写入语义与文案体系。
- 不改同步 UI 结构与文案体系（不重排预览对话框、不新增页面/交互层级；如需一条失败提示，只加一条与既有
  notice 同构的 i18n 键）。
- 不改删除默认不勾、双向/增量模式语义、只读目标物化策略。
- 不引入新依赖做哈希；不改 IPC 安全模型（只按既有白名单模式增加必要 channel）。
- 不做二进制 diff 视图 / 十六进制比较（第 10 条不做的口径不变）。
- 不 bump 版本、不打 tag、不碰已公开 Release 与资产。

## 实现约束

- 写盘接缝必须承载**原始字节**：`SyncIo` 与其平台实现（`src/core/directory/sync.ts`、
  `src/main/platform/electron-platform.ts`、`src/preload/index.ts`、`src/shared/platform/{channels,types}.ts`、
  `src/renderer/src/platform/web-platform.ts`、`src/renderer/src/workbench/directoryOps.ts`）不得让内容以
  UTF-8 字符串形式穿过写路径；正向拷贝一次搬运即落盘，不要求进内存再编码。
- 回滚备份必须字节保真（覆盖/删除前备份），回滚重建同样按原始字节写回并保留 mtime；既有「撤销项先登记再动
  目标」的次序不得回退。
- 事后校验复用既有原始字节 digest 能力（`digestFiles` + `node:crypto`），只覆盖本轮写入路径与已勾删除项；
  校验失败不触发回滚（写入已落盘），但必须阻止成功提示，并让刷新后的比较如实反映磁盘状态。
- 校验时不得把用户未勾选的镜像删除当作失败；成功提示的 copied/updated/deleted 计数口径保持现状。
- Web 运行时（内存 VFS）与 Electron 运行时都要保持同一接缝语义：内存实现里的内容仍是字符串，但
  digest/写入必须保证该运行时的样本（文本）行为不变；不要为 Web 运行时引入 Node 依赖。
- 门禁只扩既有 `sync-real-gate`（`pnpm test:sync-real`），不新增 `code-gates.json` 门禁 id；新增断言必须走
  真实临时目录 + 生产 PlatformPort handler（沿用现有 fixture 风格），不得用内存 VFS 代替。
- 二进制样本以代码内 `Buffer.from([...])` / base64 常量构造（不新增二进制资源文件、不改 `src/shared/fixtures/`）。
- symlink 写路径必须是不跟随链接的 OS 原语（Electron 侧 `symlink` / `readlink` / `lutimes`-级别；不得用会跟随
  链接的 `utimes` 给链接打时间），Web 内存运行时没有链接，实现可跳过但同一接缝签名与语义要保持一致。
- symlink 的 mtime 对齐只针对比较结果里已扫描到的链接节点（复用现有 `modifiedMs`，不额外整树 lstat 一遍），
  且不得作为 plan item 出现——否则会破坏「二次计划为空」与计数口径。
- 既有失败安全次序（撤销项先登记再动目标、预检零落盘、只读拒绝、取消回滚）对 symlink 同样适用：新建的链接
  要能回滚删除，被替换的链接要能回滚到原 link target 与原 lstat mtime。

## 裁定补记（Owner 本轮并入，不拆新工作项）

### 新增验收：ac-idempotent-dryrun-after-delete

删除组全选执行后再 Dry-run 三组全空（幂等）。四态来自对比树、Dry-run 空来自同步规划，
是两条代码路径，不能互相替代；「同一对目录重复执行幂等」是本项目标明写的验收项，本条是它唯一的
直接证据（既有删除前幂等断言只证了删除前）。

断言（真实临时目录 + 生产 `PlatformPort`，沿用 `sync-real-gate` 现有 fixture 风格）：

1. 干跑 → copy N / update M / delete K，删除默认未勾；
2. 执行（只落 copy+update）→ 再干跑：copy 0 / update 0 / delete K 仍列出且默认未勾；
3. 删除组全选执行 → 再干跑：copy 0 / update 0 / delete 0（三组全空）；
4. 对同一对目录再重复一轮 1)–3)，末次干跑仍三组全空。

失败信息使用独立标识 `idempotent dry-run`（与 `binary fidelity` / `completion consistency` /
`symlink metadata` 并列可区分）。不改四态口径、不让对齐项进入 plan 计数。
落地：`src/sync-real-gate.test.ts` 的 `real-disk sync idempotent dry-run`。

### symlink 范围闸门与本轮实际口径

第 (3) 条只允许最小改动：在既有写盘路径上补 symlink 的 lstat mtime（utimes/lutimes 级别）。
本轮据此只做「已扫描到的链接对（link target 已相同、仅 lstat mtime 不同）在同步落盘后对齐秒级
mtime」，新增能力仅 `PlatformPort.setSymbolicLinkModifiedMs`（`lutimes`，不跟随链接）；比较器判等
口径、四态计数与 plan 分组均未改动。

因必须重写 symlink 物化/替换路径（新建链接、链接替换、悬空链接落盘）才能满足的条目，按裁定拆为
独立子项并记入 known issues（不在本项内实现）：

- `ac-symlink-copy-preserves-target-and-mtime`
- `ac-symlink-update-preserves-target-and-mtime`
- `ac-symlink-dangling-preserved`

本项内已完成/覆盖：`ac-symlink-same-aligned-mtime`、`ac-symlink-alignment-idempotent`、
`ac-symlink-four-state-unchanged`，断言标识 `symlink metadata`。
