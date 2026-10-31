# 修掉「仅 symlink lstat mtime 不同」时同步不可执行、链接时间永远对不齐

## 背景（L3 实测确证，非推断）

被测 main `a9082d9` 打包 app，ops run `trun_9a298aabae0f6884` 腿 B：夹具两侧各 10 条目（3 个普通文件 +
3 条同 target 且 link mtime 秒级不同的链接 + 1 条悬空链接，两侧 `readlink` 逐字相同）。同步后：

- 4/4 仍是 symlink，`readlink` 与相对路径不变，普通文件 size + sha256 全等；
- 但 lstat mtime **0/4 对齐**（源 `1577811660` / 目标仍 `1675274520`）；
- dry-run 显示 `Total 0 items` + `This direction has no changes to sync`，`Apply changes` 按钮 disabled；
- Mirror 模式复跑同样结果。

证据目录：`projects/ops_df43e423451170fd/.munk/runs/trun_9a298aabae0f6884/evidence/legB/`
（`b-post.json` 含逐链接表，`b-mirror.json` 为 Mirror 复跑）。

根因（已定位到代码行，供 Coding 对齐，不作为技术方案强制）：

1. `src/renderer/src/views/DirectorySyncDialog.tsx:139` `disabled={busy || executableCount === 0}`：
   仅链接 mtime 不同时 changelist 为空 ⇒ `executableCount = 0` ⇒ Apply 禁用；同时
   `plan.totalCount === 0` 让对话框走 `directory.sync.empty` 分支，待对齐链接完全不可见。
2. 因此 `src/renderer/src/workbench/directoryOps.ts:276-311` 的 `alignSymbolicLinkTimes`
   （调用点 `:377-388`，逻辑本身正确）永远没有执行机会。

同类问题本轮次第二次出现：门禁只断言内层函数/机制全绿，而用户实际可点路径被禁用（参见 2026-10-22
结论「机制全绿≠用户拿得到」）。既有 `real-disk sync symlink metadata` 用例只调用
`applySyncPreview`，绕过了 UI 的可执行判定，所以一直绿。

## 范围

1. **可执行判定与 UI 同源**：把「本次预览是否可执行」抽成纯函数（例如
   `canApplySyncPreview(preview)`），`DirectorySyncDialog` 的 Apply 禁用状态与
   `sync-real-gate` 新用例共用同一实现；不得在对话框里另留一份内联判定。
2. **待对齐链接可见**：当两侧存在「link target 相同、比较器判 `same`、仅 lstat mtime 秒级不同」的链接对
   （含悬空链接）时，同步界面显示待对齐链接数量（可解释），Apply 可点；不得再显示
   `directory.sync.empty`（「该方向没有需要同步的变更」）这类与事实相反的提示。Incremental 与 Mirror
   两种模式都必须成立。
3. **执行与幂等**：执行后目标侧每条此类链接 lstat mtime 秒级与源相等，仍为 symlink、`readlink` 与相对
   路径不变；普通文件内容与 mtime 不受影响；同一对目录再 dry-run 时 copy/update/delete 三组仍全空、
   待对齐链接数归零。
4. **计数口径不变**：对齐项可以是独立的第四类可执行动作，但不得混入 copy/update/delete 三组计数；
   四态口径、删除默认不勾、Incremental/Mirror 语义均不变。
5. **完成提示如实**：只含对齐项的场景不得显示易误解的完成提示（例如「0 copied · 0 overwritten ·
   0 deleted」而实际对齐了 N 条）；完成提示必须反映本轮到底做了什么，且与落盘事实一致。
6. **可回归断言进既有门禁**：在 `sync-real-gate`（`src/sync-real-gate.test.ts`，`pnpm test:sync-real`）
   内新增「symlink metadata」用例，走与 UI 同一个可执行判定，断言「仅链接 mtime 不同 ⇒ 可执行」、
   「执行后 lstat mtime 秒级相等（含悬空）」、「再次 dry-run 对齐项归零且三组为空」、
   「三组计数与四态前后不变」。
7. **教训写回仓库**：`docs/lessons.md` 增一条带日期的教训；`AGENTS.md` 的工程约束补一句话
   （若判定该文件为薄路由结构，就写入它指向的约定文件，不新增文件）。
8. **交付**：走 coding → code_gates → delivery 合入 main；交付说明点名每条验收点由哪条断言覆盖，并列出
   main 上未发布的提交。

## 验收

- ac-link-align-visible-and-applicable: 给定仅含「link target 相同、判 `same`、仅 lstat mtime 秒级不同」链接对（含悬空链接）的预览，且 copy/update/delete 三组 count 均为 0，`canApplySyncPreview(preview)` 返回 `true`，预览暴露的待对齐链接数等于该链接对数量；同一预览在 `DirectorySyncDialog` 中 Apply 按钮 `disabled === false`、不渲染 `directory.sync.empty` 文案、摘要里的待对齐数等于该数量。
- ac-link-align-both-modes: 上述可执行判定与可见性在 `incremental` 与 `mirror` 两种模式下都成立（Mirror 模式下即使同时存在未勾选的 delete 项，只要存在待对齐链接，Apply 仍可点）。
- ac-link-align-applied: 执行后目标侧每条此类链接 `lstat().isSymbolicLink() === true`、`readlink` 与源逐字符相等、相对路径不变、`Math.floor(lstat.mtimeMs / 1000)` 等于源；`applySyncPreview` 返回的对齐计数等于该链接对数量。
- ac-link-align-files-untouched: 同一轮里普通文件的 size、sha256、整毫秒 mtime 与执行前完全相同；对齐不写入任何普通文件内容（以注入 seam 记录写调用为空断言）。
- ac-link-align-not-counted: 对齐前后 `plan.copy.count` / `plan.update.count` / `plan.delete.count` 与四态 counts 完全不变；对齐项不出现在三组 `items` 中。
- ac-link-align-idempotent: 执行后对同一对目录再次 dry-run：copy/update/delete 三组 count 均为 0，待对齐链接数为 0，`canApplySyncPreview` 返回 `false`。
- ac-completion-notice-truthful: 仅含对齐项的一轮成功后，完成提示包含本轮对齐数量 N（不得只呈现 `0 copied · 0 overwritten · 0 deleted` 让人误以为什么都没做），且提示中的 copied/updated/deleted/aligned 数字与该轮实际落盘结果一致。
- ac-alignment-failure-blocks-success: 注入 `setSymbolicLinkModifiedMs` 失败时 `applySyncPreview` 不得 resolve 成功，必须走既有校验失败路径（可识别的 reject 类型 + 刷新后的真实磁盘状态），渲染层走 danger 提示且不出现 `shell.notice.syncComplete`。
- ac-shared-predicate: `canApplySyncPreview` 是 UI 与测试共用的唯一可执行判定实现；`DirectorySyncDialog` 的 Apply `disabled` 直接由它派生（删除内联 `executableCount === 0` 判定）；`sync-real-gate` 新用例调用同一函数断言可执行性。
- ac-gate-symlink-metadata-case: `sync-real-gate` 新增「symlink metadata」用例覆盖 `ac-link-align-visible-and-applicable`、`ac-link-align-applied`、`ac-link-align-not-counted`、`ac-link-align-idempotent`，断言消息含 `symlink metadata` 标识，与既有 `binary fidelity` / `completion consistency` / `idempotent dry-run` 可区分。
- ac-gates-eleven-green: `.munk/code-gates.json` 既有 11 个门禁 id 与命令不变且全绿（含 `test`、`sync-real-gate`）；既有断言不得删除、跳过或放宽。
- ac-no-new-dependency: `package.json` 依赖不新增，不 bump 版本、不打 tag、不改发布通道、不改已公开 Release 与资产。
- ac-lessons-written: `docs/lessons.md` 新增一条带日期的教训：可执行/可达性判定必须在「UI 与实际同一 predicate」上断言，不能只测被调用的内层函数；`AGENTS.md` 的工程约束（或它指向的约定文件，不新增文件）以一句话收录同一约束。
- ac-delivery-note: 交付说明逐条点名每个 `ac-*` 由哪条断言（文件 + 用例/断言消息）覆盖，并列出合入 main 后尚未发布的提交。

## 非目标

- 不做源侧独有 symlink 的物化/替换/落盘（仍为已知待办，本项不碰）。
- 不改四态（same/added/removed/modified）口径、比较器对 symlink 的判等口径、快照/导出格式。
- 不改删除默认不勾与双向取消语义，不改 Incremental/Mirror 的既有语义。
- 不改 Dry-run 三组清单（copy/update/delete）的展示语义与计数口径。
- 不新增依赖、不 bump 版本、不打 tag、不改发布通道。
- 不为凑绿放宽或删除任何既有断言。
- 不做与本项无关的 UI 重排、主题/视觉调整或文案体系重写。

## 实现约束

- 纯函数 `canApplySyncPreview(preview)` 放在渲染层可被 vitest 在 Node 环境直接导入的模块中（例如
  `src/renderer/src/workbench/directoryOps.ts`），零 React/DOM 依赖；入参为 `SyncPreview`，返回布尔值，
  并在预览对象上暴露待对齐链接数/清单供 UI 渲染。
- 待对齐链接的判定复用既有比较结果节点（`kind === 'file'`、`status === 'same'`、两侧
  `leftIsSymbolicLink` / `rightIsSymbolicLink` 为 `true`、`Math.floor(sourceMs/1000) !== Math.floor(targetMs/1000)`），
  不额外做整树 `lstat` 走查。
- 对齐只在 `!preview.materializeTarget` 时计入可执行项（与现有 `alignSymbolicLinkTimes` 调用条件一致）；
  只读样本树物化路径不因此改变语义。
- 对齐执行仍走 `PlatformPort.setSymbolicLinkModifiedMs`（`lutimes` 级，不跟随链接），不进入 `SyncPlan`
  的 copy/update/delete 分组。
- `SyncApplyResult` 增加对齐计数（如 `alignedLinks`）；完成提示新增/扩展 i18n 键，zh/en 同步，
  `src/renderer/src/i18n/messages.test.ts` 的 key 完整性与占位符 parity 必须通过。
- 门禁只扩既有 `sync-real-gate`（`pnpm test:sync-real`），不新增 `code-gates.json` 门禁 id；新用例沿用
  现有 `vi.mock('electron')` + handler map + `mkdtemp` 真实临时目录风格，不 mock 文件系统。
- 新用例必须断言「UI 可执行判定」本身（调用 `canApplySyncPreview`），而不是只断言
  `applySyncPreview` 的内层行为；既有 11 门断言只允许升级为新合同，不得删除或放宽。
- 交付说明落位在交付记录中，不需要新增仓库文档文件。

## 交付口径

- 合入 main 后只复验腿 B（不重跑腿 A / 腿 C）。
- 交付说明需列出 main 上未发布的提交（`git log --oneline <last-release>..main` 口径），供后续发版取点。
