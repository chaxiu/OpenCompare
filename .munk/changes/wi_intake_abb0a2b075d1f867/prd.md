# 模板归位：逐条动作列与显式移动

## 背景与基线

- 基线：`main` = `a9be819`（模板放置已含大小写不敏感碰撞与路径越界防护）。
- 现有链路：`matchTemplate` → `createTemplatePlan` → `resolveTemplatePlan` → `executeTemplatePlan` → `verifyTemplateExtraction`，UI 入口为 `TemplateDialog`，平台接线在 `directoryOps`。
- 现有 Dry-run 已列出槽位、源绝对路径、覆盖 / 冲突 / 占用 / 可执行数，但**没有**「源相对路径 → 目标相对路径 + 动作」的逐条动作列，也**没有**移动语义；Apply 只写目标，从不删除散乱树 B 的源文件。
- 本 WI 在既有模板归位链上补齐「逐条动作列 + 显式勾选移动」，让真实外部散乱目录归位可按用户确认的非破坏性方式落盘并逐条复核。

## Scope

1. **计划 / 解析对象**：为每个可执行条目携带「源相对路径（相对散乱树 B 根）」「目标相对路径（相对输出根）」「动作」；动作集合严格为 `copy` / `move` 两值。默认动作为 `copy`，默认不动源树。动作、可执行数和 Apply 读写同一份解析结果。
2. **Dry-run 逐条展示**：每条有源的条目展示 `源相对路径 → 目标相对路径` 与动作；无源条目（missing / 未选候选的 conflict）只展示目标与原因，不展示虚构动作；已落位（placed）不展示可执行动作。不新增「提取」等同义第三动作，复制路径统一用「复制」文案。
3. **显式选择**：冲突、路径越界、目标根已存在同名项（含大小写不敏感同名项）默认不勾；必须显式勾选才执行。移动必须在已勾选的可执行行上再显式选择（逐条移动复选框或整批「已勾选项设为移动」），整批操作不得自动勾选任何行。
4. **移动执行**：先写目标；写后逐条校验目标存在性、`sha256` 与 `mtimeSec` 与源一致；三项全部通过才删除该条的源文件。任一校验失败保留源、不删除，已成功项不回滚；删除源只允许删除该条计划里记录的 `sourcePath`，绝不按相对路径重新拼路径，也绝不删除模板 A 或输出根内的文件。
5. **结果与重扫**：Apply 后不重开会话即可「重新扫描」；移动成功的源从散乱树 B 消失、目标在输出根落位；磁盘无 `.tmp` / 中间条目 / 移动项源残留（应为 0）；复核清单与磁盘逐条一致（存在性 + `sha256` + `mtimeSec`），失败行就地显示与界面语言一致的错误提示，对话框保持存活可重扫 / 重试。
6. **断言与门禁**：动作列与勾选状态、默认不勾、移动校验通过才删源、校验失败零删除、取消零写入全部落纯函数 / jsdom / 真实磁盘断言，并 append-only 钉进 `.munk/code-gates.json`；真实 APFS 大小写不敏感目录 e2e 至少覆盖「复制默认 / 移动显式 / 校验失败保留源」三腿。
7. **i18n**：新增动作、移动、校验失败、源保留、重扫残留等文案 zh / en 成对，占位符集合一致；错误提示按当前界面语言显示。

## Acceptance Criteria

- ac-row-source-target-action: Dry-run 中每条有源条目都渲染「源相对路径 → 目标相对路径」和动作，源相对路径以散乱树 B 根为基准、目标相对路径以输出根为基准；当 B 的 `bucket/logo.png` 对应 A 的 `Logo.png` 时，行内同时出现 `bucket/logo.png`、`Logo.png` 与动作「复制」或「移动」，不出现源绝对路径作为主展示，也不出现第三种动作名。
- ac-action-set-exact: 动作类型与可执行条目只允许 `copy` / `move` 两个值；任何行不得产生 `extract` 或其他同义第三动作；复制路径的动作文案统一为「复制 / Copy」。
- ac-default-copy-source-untouched: 空选择或仅默认勾选时，所有有源行展示的动作都是复制；`resolveTemplatePlan` 的 `executable` 全部 `action === 'copy'`；apply 后散乱树 B 的相对路径集合、每文件 `sha256` 与 `mtimeSec` 与执行前逐条相等，源文件零删除。
- ac-default-unchecked-hazards: `conflict`、`path-escape`、目标根已有同名文件（含仅大小写不同的同名项）与目录占用行 `defaultChecked === false`；未显式勾选时这些行不进 `executable`，apply 对它们零写入、零删除；显式勾选后才可能进入 `executable`（冲突还须先选候选）。
- ac-conflict-choice-then-check: 选择冲突候选本身不会自动勾选该行；只有「已选候选 + 显式勾选」的冲突行可执行；选择候选后若还要移动，必须再显式选择移动，默认仍是复制。
- ac-move-requires-explicit-selection: `movePaths` 只对「已勾选且可执行」的行生效；`movePaths` 中包含未勾选、missing、placed、被拒绝或路径越界的行时，这些行不执行、零删除；已勾选但不在 `movePaths` 的行一律复制。逐条移动选择与整批「已勾选项设为移动」产出同一 `movePaths` 契约；整批操作只影响当前已勾选行，绝不自动勾选任何行；取消勾选一行时同时清除其移动选择，重新勾选后从复制开始。
- ac-single-source-action-executable: `resolved.executable[].action` 与逐行动作映射对每条可执行行一致；对话框底部可执行数、复制数、移动数、Apply 按钮禁用状态、行内动作与移动复选框状态全部读取 `resolveTemplatePlan` 返回的同一对象；对同一 plan 传入不同 `checkedPaths` / `movePaths` 时，界面显示值与解析结果逐项相等，不存在 UI 侧二次推导的可执行判定。
- ac-move-write-verify-delete-order: 移动行的执行顺序必须是「写目标 → 校验目标存在 → 校验目标 `sha256` 等于当前源 `sha256` → 校验目标 `mtimeSec` 等于当前源 `mtimeSec` → 删除源」；用记录型 IO 断言 `deleteFile(sourcePath)` 只在三项校验全部通过后调用，且删除路径恰为该行 `sourcePath`，不是按相对路径重拼的路径。
- ac-move-verify-fail-keeps-source: 移动行任一写后校验失败（目标缺失、目标 hash 不符、目标 mtimeSec 不符、目标不可读）时，源文件仍存在且 `sha256` 与 `mtimeSec` 与执行前逐项相等；该行以可区分的移动校验失败原因报告，目标不回滚删除，其他已成功行不回滚，对话框保持打开。
- ac-move-delete-fail-keeps-source: `deleteFile` 拒绝时该行报告源删除失败，源文件仍存在（或由 OS 拒绝后保持原样），目标保留，其他已成功行不回滚，对话框保持打开并显示当前界面语言的错误提示。
- ac-no-rollback-successes: 一批移动行中某行在校验或删除阶段失败时，之前已成功的移动行保持「目标存在 + 源已删除」，之后的移动行继续执行；不存在半写目标、`.tmp` 残留或把已成功项恢复成执行前状态的逻辑。
- ac-cancel-zero-write-delete: 预览后放弃执行、预取消 `AbortSignal`、以及 Dry-run 取消三条路径对真实夹具均产生 0 次 `writeTextFile`、0 次 `ensureDirectory`、0 次 `deleteFile`；散乱树 B 与输出根的相对路径、每文件 `sha256` 与 `mtimeSec` 与执行前逐条相等，无 `.tmp` 或新建目录。
- ac-rescan-same-session: Apply 结束后（含存在移动失败行时）对话框不关闭，「重新扫描」使用同一 `templateRoot` / `incomingRoot` / `outputRoot` 重建计划；移动成功的源文件不再出现在散乱树 B，目标在输出根为 `placed` 且默认不勾；默认选择下 `executableCount === 0`，计数与磁盘一致。
- ac-rescan-zero-residue: Apply 后对同一会话重扫，输出根与散乱树 B 中 `.tmp` / 中间条目 / 成功移动项的源文件残留计数均为 0；失败移动项的源保留且可被重扫识别，输出根中失败行的目标若已写入则如实呈现为已存在项。
- ac-result-matches-disk: 结果步骤对每个成功写入目标恰好一条复核记录，记录包含动作与源删除状态；逐条重新读取磁盘校验存在性、`sha256`、`mtimeSec`，成功运行中 `verification.entries.length === writtenCount` 且失败数为 0；移动行额外校验源已删除，复制行额外校验源仍存在；同一路径不得在结果列表重复出现。
- ac-gates-append-only: `.munk/code-gates.json` 保留既有全部 18 个 gate id 与命令（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real` / `template-case-collision` / `template-path-contained`），并追加 `template-move-actions`（纯函数动作 / 默认复制 / 移动显式）与 `template-move-verify`（真实磁盘写后校验、失败保留源、取消零删除）两个单 argv、`cwd: "."` 的 gate；`src/munk-gates.test.ts` 的钉板同步为新的 gate 总数与模板 gate 顺序，保留所有既有序号、命令与行为 marker，不删除、不跳过、不放宽任何既有判据。
- ac-e2e-apfs-three-legs: 在真实 `mkdtemp` 目录且探针确认大小写不敏感（`probe.txt` 能用 `PROBE.TXT` 命中）的 APFS 卷上，`template-e2e-real` gate 至少跑通三腿：① 默认复制——默认勾选的干净行执行后目标 `sha256` / `mtimeSec` 与源一致、源仍存在；② 显式移动——勾选并显式移动后目标校验通过、源被删除、重扫为 `placed`；③ 校验失败保留源——注入目标 mtime 或内容偏差使写后校验失败，源保持原 `sha256` / `mtimeSec`、目标保留、失败原因可断言且已成功行不回滚。
- ac-i18n-parity: 新增的动作列、复制 / 移动、移动失败、源保留、源删除失败、重扫残留等文案在 zh 与 en 键集合一致、`{placeholder}` 一致；en 下 Dry-run 与结果步骤整屏渲染文本不匹配 `\p{Script=Han}`；校验失败与删除失败提示按当前界面语言显示，路径与 OS 码保持原样。
- ac-no-regression: 目录对比四态、同步 Dry-run / 镜像、快照导入导出、报告导出既有用例保持绿；`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` 与 `.munk/code-gates.json` 全部通过；`matchTemplate` / `matchTemplateSlots` / `extractTemplateMatches` 既有导出与语义不变；不修改 `.munk/baseline/domains/directory/qa/template-e2e-manifest.json` 的 1,000 行基线口径，除非新增 assertion 名确实进入该清单。

## Non-Goals

- 不做基于占位符或正则 / 脚本的模板引擎。
- 不做双向同步与冲突合并。
- 不做实时监听 / 计划任务。
- 不做远端 / SFTP。
- 不改目录对比四态、快照格式、导出格式与发布通道。
- 不动已公开 tag / Release / 资产，不改版本号与发布说明。
- 不为凑绿放宽门禁；不删除、跳过或弱化既有断言。
- 不把模板 A 变成可写；移动只删除散乱树 B 中该计划记录的源文件，不删除模板 A 或输出根内文件。

## Implementation Constraints

### 单一计划对象（动作与可执行性同源）

- 动作类型固定为 `TemplateAction = 'copy' | 'move'`，不新增 `extract` 等第三值。
- 计划条目补充源相对路径（相对 `incomingRoot`，`/` 归一）与默认动作；`TemplateMatch` 与 `TemplateConflictCandidate` 需携带同一源相对路径，供 `createTemplatePlan` 直接使用，禁止在 UI 里从绝对路径截取。
- `TemplateSelection` 增加 `movePaths?: readonly string[]`；`TemplateResolvedPlan` 增加覆盖「所有有源计划行」的动作映射、`copyCount` / `moveCount`，并让 `TemplateExecutableEntry` 携带 `action`。映射对未勾选行给出默认 `copy`，对无源行不给动作；UI 只读这份结果，不再用 `overwrite` / `conflict` / `checked` 自行推导。
- `TemplatePlanEntry.defaultChecked` 语义保持不变；新增默认动作恒为 `copy`，不因行是否默认勾选而改变。`placed` 行既不可执行也不展示可执行动作。

### 移动执行与失败语义

- `TemplateExecuteIo` 增加删除与目标 mtime 读取能力（删除用既有 `PlatformPort.deleteFile`；mtime 读取复用目录列表或等价平台能力），不新增 Electron 专用旁路。
- 执行器按行顺序执行：路径越界拒绝 → 读源 → 源 hash 与计划一致 → 建父目录 → 写目标（带计划 `modifiedMs`）→ 写后校验 → 移动则删除源。写后校验必须重新读取目标并重新读取当前源，比较 `sha256` 与秒级 `mtimeSec`；校验与后置复核共用同一判定函数，禁止两份内联实现。
- 移动校验失败 / 源删除失败只记录该行失败并继续后续行；不调用任何回滚，不删除已成功目标，不恢复已删除源。失败原因需可区分（目标缺失 / hash / mtime / 不可读 / 删除失败）并映射到 zh / en 文案与稳定 UI 测试标识。
- 取消只在行边界生效：预取消在第一次目录创建前抛 `OperationCancelledError`；中途取消停在未开始的行；任何未通过写后校验的源绝不删除。已写目标按平台原子写落盘，不产生 `.tmp`。
- 删除源只使用该行 `sourcePath` 原值；不得由 `sourceRelativePath` 重新拼路径，不得删除模板 A 或输出根内文件。

### 结果与重扫

- 成功写入的行进入 `written`（含动作）；移动行只有「写 + 校验 + 删源」全部成功才计入 `written` / 删除计数。写后校验失败或删除失败进入 `failed`，目标保留、源保留，UI 结果列表按路径去重展示。
- 结果步骤复用现有 `verifyTemplateExtraction`，补充移动行的源删除状态；重扫复用 `previewTemplate`，不新增旁路扫描。重扫时清空 `checkedPaths` / `movePaths` / `conflictChoices`，默认回到复制。
- `.tmp` / 中间条目检查用真实目录快照或目录遍历断言，不靠 UI 自报。

### 门禁与证据

- 新增 gate 固定为：
  - `template-move-actions` → `pnpm test src/template-gate-move-actions.test.ts`（纯函数 + jsdom 可分离的解析 / 动作 / 默认复制 / 移动显式 / 批量只作用于已勾选 / 未勾选 move 零删除）。
  - `template-move-verify` → `pnpm test src/template-gate-move-verify.test.ts`（真实磁盘：写后校验通过才删源、hash / mtime / 缺失失败保留源、删除失败保留源、已成功项不回滚、取消零写入零删除、重扫零残留）。
- 既有 gate 文件扩展而不替换：`template-gate-default-unchecked.test.ts`（默认动作复制、危险行默认不勾、移动默认不选）、`template-gate-single-source.test.ts`（动作映射 / 可执行 / 写入集合同源）、`template-gate-cancel-zero-write.test.ts`（零删除）、`template-gate-sha-mtime.test.ts`（移动目标仍保持源 sha256 / mtimeSec）、`template-e2e-real-directory.test.ts`（APFS 三腿）。
- jsdom 动作列与勾选状态断言放 `TemplateDialog.test.tsx`，由既有 `test` gate 覆盖；若另立 jsdom gate，必须复用同一文件而不是复制夹具。
- `.munk/code-gates.json` 只增不减；`src/munk-gates.test.ts` 的 gate 数量、顺序、`description` 行为映射与单 argv 校验同步追加，保留全部既有 marker 与文件映射。不得通过 `it.skip` / `describe.skip` / 删断言 / 放宽比较来变绿（既有 root-only 与 APFS 探针跳过除外）。
- 真实 APFS e2e 三腿优先追加到 `src/template-e2e-real-directory.test.ts` 的独立 `it`，复用 `template-gate-support.ts` 的真实 `mkdtemp` + 生产 IPC handler；不引入样本挂载、Web 内存盘或 mock 文件系统。

### 交付物与证据路径（绝对路径）

根目录映射：

- WI worktree 根：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867`
- 产品目录：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/codebases/projects/open-compare`
- 映射：产品目录下的 `src/**`、`.munk/**`、`package.json` 与本 worktree 同名路径一一对应；下文一律用 worktree 绝对路径，可直接打开。

关键文件：

- 本 PRD：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/.munk/changes/wi_intake_abb0a2b075d1f867/prd.md`
- 计划 / 解析 / 执行 / 复核：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/core/directory/template.ts`
- 平台接线：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/renderer/src/workbench/directoryOps.ts`
- 对话框：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/renderer/src/views/TemplateDialog.tsx`
- 对话框 jsdom：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/renderer/src/views/TemplateDialog.test.tsx`
- zh 词典：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/renderer/src/i18n/messages/zh/directory.ts`
- en 词典：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/renderer/src/i18n/messages/en/directory.ts`
- 新纯函数 gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-move-actions.test.ts`
- 新真实磁盘 gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-move-verify.test.ts`
- 共享真实磁盘 harness：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-support.ts`
- 既有默认不勾 gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-default-unchecked.test.ts`
- 既有单一来源 gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-single-source.test.ts`
- 既有 sha / mtime gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-sha-mtime.test.ts`
- 既有取消零写入 gate：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-gate-cancel-zero-write.test.ts`
- APFS 真实目录 e2e：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/template-e2e-real-directory.test.ts`
- 门禁矩阵：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/.munk/code-gates.json`
- 门禁钉板：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/src/munk-gates.test.ts`
- 三腿 e2e 证据（由 Coding 写入）：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/.munk/changes/wi_intake_abb0a2b075d1f867/evidence/template-move-e2e.md`
- 既有 1,000 行提交证据（仅在 assertion 名变化时同步）：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_abb0a2b075d1f867/.munk/baseline/domains/directory/qa/template-e2e-manifest.json` 与同目录 `template-e2e-evidence.md`

三腿证据至少记录：`mkdtemp` 真实根绝对路径、大小写不敏感探针结果、`pnpm test src/template-e2e-real-directory.test.ts` 命令、复制默认的源仍存在 / 目标 sha256 + mtimeSec、显式移动的源已删除 / 目标 sha256 + mtimeSec、校验失败的源原 sha256 + mtimeSec / 目标保留 / 失败原因、`.tmp` 与中间条目计数 0。禁止下游用 `find` / `ls` 扫盘找证据；本 PRD 已给出全部路径。

### 成本与操作约束

- 同一 commit 的全量门只跑一次；重跑必须写明失败项且只跑失败项。无依赖的只读命令同轮批量发。
- 超过 500 行的文件禁止整读，按行区间读；`template.ts`（当前 1,046 行）、`TemplateDialog.tsx`（当前 815 行）、`template-e2e-real-directory.test.ts`（当前 718 行）均按区间读。
- 不新增依赖，不引入模板引擎 / 脚本解释器；只复用现有 `PlatformPort`、`sha256Hex`、`verifyTemplateExtraction` 与真实磁盘测试 harness。
