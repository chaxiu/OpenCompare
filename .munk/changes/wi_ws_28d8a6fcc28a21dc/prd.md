# 真实外部目录 e2e、证据与四条门禁

## 范围

本子项是 WorkSet「P1 ⑥ 模板归位接真实用户目录 · 端到端闭环（第一期）」的收口切片（checkpoint `regression-gates-evidence`）。前序四项已交付真实入口 + Dry-run（`wi_ws_dcf61d0392d48f0e`）、计划 / 执行 / 复核纯核与 mtime 原子写（`wi_ws_0531c2c2f789c1a8`）、显式勾选 / 冲突候选 / 落盘与逐条复核 / 只读拒绝与重试（`wi_ws_99d784332752b34f`）。本项**只做证据与门禁**：不重做界面、不重做算法，把「真实外部目录上的一次完整闭环」变成可独立执行、可复核、可长期回归的证据，并把四条红线登记进门禁矩阵。

**基线现状（已核实）**

- `src/template-real-gate.test.ts` 已存在（`mkdtemp` 真实临时目录 + 生产 `registerPlatformIpc` handler 绑定的 `PlatformPort`，5 tests），但夹具只有约 10 个文件：**没有 ≥1,000 文件规模**，`missing` 分区为空（`counts.missing === 0`），没有落盘任何证据清单，也没有对应门禁项。
- `.munk/code-gates.json` 仍是 11 项（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate`），`description` 只映射同步的四条行为；模板归位四条行为**没有**门禁映射。
- `src/munk-gates.test.ts` 把矩阵钉成「恰好 11 项、顺序与命令逐字相等」，并断言 `perf-gate` 不在默认矩阵；**追加门禁必须同一次改动更新该钉住断言**，否则 `pnpm test` 会红。
- 生产侧契约已冻结可用：`previewTemplate`（扫描 B 树 + 输出根既有文件 / 目录）、`createTemplatePlan`（`overwrite` / `occupiedByDirectory` / `defaultChecked`）、`resolveTemplatePlan`（`executable` / `rejected`，`target-occupied-by-directory` 等拒绝原因）、`applyTemplatePlan`（`checkWritable` 零写入预检 → `executeTemplatePlan` 带源 `modifiedMs` → `verifyTemplatePlan` 逐条 sha256 + 秒口径 mtime）、`TemplateApplyError.code`；`executeTemplatePlan` 对预取消 signal 抛 `OperationCancelledError` 且零写入。
- 既有 UI 同源断言保留在 `src/renderer/src/views/TemplateDialog.test.tsx`（`resolveTemplatePlan` 计数 = Apply 禁用 = 写入集合、1,200 行窗口化、取消、只读预检与重试）。

**本项要达成的增量**

1. **真实外部目录 e2e（专项门禁）**：新增 `src/template-e2e-real-directory.test.ts`，在真实 `mkdtemp` 目录上生成模板 A 槽位 ≥1,000、散乱树 B 文件 ≥1,000、最深相对路径 ≥4 段、路径含中文与空格的夹具；一次跑通 dry-run → 显式勾选（含一条显式勾选的 overwrite 行与一条「选候选 + 勾选」的 conflict 行）→ apply → 逐条磁盘复核 → 重新扫描；并在同一文件覆盖取消（零写入）、只读根（写前拒绝 + 恢复后重试）、占用（目标被目录占用 + 文件占住父目录的逐条写失败）三条失败路径。**不使用 `/samples`、`src/shared/fixtures`、Web 内存盘或 mock 文件系统作为证据。**
2. **四条独立门禁**：把四条红线各自拆成一个可单独执行的 vitest 文件 —— `template-default-unchecked`（冲突与覆盖默认不勾）、`template-single-source`（计数与 Apply 同源）、`template-sha-mtime`（源 sha256 与 mtimeSec 保留）、`template-cancel-zero-write`（取消零写入）。四条门禁用小规模真实夹具（几十个文件、五类结果齐备）以保持秒级；规模要求只压在 e2e 门禁。
3. **门禁矩阵登记**：`.munk/code-gates.json` 追加 5 项门禁（四条 + e2e），全部单 argv、`cwd: "."`；`description` 增补四条行为映射（点名 gate id 与测试文件路径），并保留同步四条标记；同步更新 `src/munk-gates.test.ts` 的矩阵钉住断言（11 → 16 项）。
4. **证据落盘**：e2e 运行写出 `manifest.json`（真实绝对根路径、计数、勾选集、逐条 `sourceSha256` / `sourceMtimeSec` / `targetSha256` / `targetMtimeSec` / `ok`、断言名列表）；仓库内提交 `.munk/baseline/domains/directory/qa/template-e2e-manifest.json`（≥1,000 行复核清单）与 `.munk/baseline/domains/directory/qa/template-e2e-evidence.md`（真实目录路径、运行命令、计数、五类特殊行、门禁 id 与断言名、manifest 摘要），并由 e2e 文件内的一条静态断言校验该清单自洽。

## Acceptance Criteria

- ac-gate-default-unchecked: `src/template-gate-default-unchecked.test.ts` 可独立通过；真实磁盘夹具上每条 `overwrite === true`、`outcome === 'conflict'`、`outcome === 'missing'`、`occupiedByDirectory === true` 的行 `defaultChecked === false`，而 `outcome === 'matched' && !overwrite && !occupiedByDirectory` 的行 `defaultChecked === true`，且 `defaultChecked` 的真值集合与上述谓词集合双向相等（无多、无漏）。
- ac-gate-default-unchecked-rescan: 同一门禁文件内，写入若干行后重新 `previewTemplate` 同一 A / B / 输出根：已写槽位 `overwrite === true` 且 `defaultChecked === false`；空勾选下 `resolveTemplatePlan(plan, {})` 的 `executableCount === 0`、`rejectedCount === 0`，且本期间 `writeTextFile` / `ensureDirectory` 调用增量为 0。
- ac-gate-single-source: `src/template-gate-single-source.test.ts` 可独立通过；对「空勾选 / 仅默认勾选 / 默认 + 1 条 overwrite / 默认 + 1 条 conflict（已选候选）/ conflict 已勾但未选候选 / occupied 行已勾」六种选择，`resolved.executableCount` 与 `resolved.executable.length`、`resolved.rejectedCount` 与 `resolved.rejected.length` 逐次相等，且 `executable` 与 `rejected` 的 `relativePath` 并集恰等于该次勾选集（无多算、无漏算）。
- ac-gate-single-source-apply: 同一门禁文件内，每种选择确认后真实 `writeTextFile` 的 `targetPath` 多重集合恰等于该次 `resolved.executable` 的 `targetPath` 集合；未勾选行、未选候选的 conflict 行、被目录占用的行对各自 `targetPath` 的 `writeTextFile` / `ensureDirectory` 调用数为 0；成功路径 `writtenCount === executableCount === verification.entries.length` 且 `failedCount === 0`。
- ac-gate-sha-mtime: `src/template-gate-sha-mtime.test.ts` 可独立通过；每条写入目标由测试独立从磁盘重算的 sha256 等于同次从磁盘重算的源 sha256，目标 `stat().mtimeMs` 的秒向下取整等于源 `mtimeMs` 的秒向下取整；`verifyTemplatePlan` 逐条 `ok === true`，其 `expectedHash` / `actualHash` 与独立重算一致，`expectedMtimeSec` / `actualMtimeSec` 与磁盘秒值一致。
- ac-gate-sha-mtime-tamper: 同一门禁文件内，篡改一条目标正文后 `verifyTemplatePlan` 对该条给出 `ok === false` 且 `reason === 'hash'`；删除目标给 `missing`；把目标 mtime 前移 ≥1 秒给 `mtime`；亚秒级偏移**不**产生 `mtime`；三种情形均满足 `verified + failed === entries.length`，且被篡改行的计划结论仍是 `matched`（复核失败不得回退成「匹配失败」，也不得被「匹配成功」掩盖）。
- ac-gate-cancel-zero-write: `src/template-gate-cancel-zero-write.test.ts` 可独立通过；真实夹具上完成 `previewTemplate` 与 `resolveTemplatePlan` 后不执行（等价取消）：`writeTextFile` / `ensureDirectory` 调用数为 0，输出根相对树（相对路径 + 每条内容 sha256 + 每条 mtimeSec）与预览前完全一致，无 `*.tmp`、无新建目录。
- ac-gate-cancel-preabort: 同一门禁文件内，对同一 `TemplateResolvedPlan` 传入已 abort 的 `AbortSignal` 调 `executeTemplatePlan`：以 `OperationCancelledError` reject，`writeTextFile` / `ensureDirectory` 调用数为 0，输出根不存在时仍不存在、存在时相对树不变。
- ac-e2e-scale: `src/template-e2e-real-directory.test.ts` 在真实 `mkdtemp` 目录内生成的夹具由用例自身断言下限：模板 A 槽位数 ≥1,000、散乱树 B 文件数 ≥1,000、最深相对路径 ≥4 段、至少一条路径同时含中文字符与空格；三类根目录均为真实绝对路径且互不相等。
- ac-e2e-classes: 同一夹具上 `preview.plan.counts` 精确等于设计值且四类齐备（`matched` / `missing` / `conflict` / `unused` 均 > 0）；`conflict` 同时含 `reason === 'content-mismatch'`（恰好 1 个候选）与 `reason === 'ambiguous'`（≥2 个候选）两行；输出根既有文件对应的 matched 行 `overwrite === true`；被输出根既有目录占用的槽位行 `occupiedByDirectory === true`；`unused.length ≥ 10`。
- ac-e2e-chain: 同一夹具上完成 dry-run → 显式勾选（`defaultChecked` 行 + 显式勾选 1 条 `overwrite` 行 + 显式勾选并选候选项的 1 条 conflict 行；其余 `overwrite` 行与 `ambiguous` conflict 行保持未勾）→ `applyTemplatePlan` → 逐条复核：`writtenCount === resolved.executableCount === verification.entries.length`、`failedCount === 0`、`verification.verified === writtenCount`，每条目标磁盘正文 sha256 等于源 sha256、目标 `mtimeSec` 等于源秒值；未勾选行与被目录占用行零写入，输出根下无 `*.tmp`、无零字节 / 截断文件。
- ac-e2e-rescan: apply 后以同一 A / B / 输出根重新 `previewTemplate`：期间 `writeTextFile` / `ensureDirectory` 调用增量为 0，已写槽位 `overwrite === true` 且 `defaultChecked === false`，重建后的 `counts` 与磁盘现状一致（matched 数 = 首次写入数，missing / conflict / unused 与 B 现状一致）。
- ac-e2e-readonly: 输出根 `chmod 0o555` 后对同一 `TemplateResolvedPlan` 调 `applyTemplatePlan`：以 `TemplateApplyError` reject 且 `code` 匹配 `EACCES|EPERM|EROFS`；`writeTextFile` / `ensureDirectory` 调用数为 0，输出根相对树与拒绝前一致、无 `*.tmp`；`finally` 中恢复 `0o755` 后对**同一** resolved plan 重试：`writtenCount === executableCount`、`failedCount === 0`、逐条 sha256 / `mtimeSec` 与源一致、无 `*.tmp`；以 root 身份运行时该条按既有 `skipIf` 口径跳过，其余条目不受影响。
- ac-e2e-occupied: 目标槽位被输出根既有目录占用时，该行即使勾选也进 `rejected`（`target-occupied-by-directory`），对该 `targetPath` 的 `writeTextFile` / `ensureDirectory` 调用数为 0，占用目录内既有文件内容不变；另一条「文件占住所需父目录」的行产生逐条写失败：`failedCount === 1`、`reason === 'write-failed'`、`writtenCount === 其余勾选数`、失败目标不存在、阻塞文件内容不变、输出根无 `*.tmp`。
- ac-e2e-evidence-manifest: e2e 运行写出 `manifest.json`（目录取 `OPENCOMPARE_TEMPLATE_E2E_EVIDENCE_DIR`，未设置时写 `<tmpdir>/opencompare-template-e2e-evidence/`）：含 `templateRoot` / `incomingRoot` / `outputRoot` 三个真实绝对路径、`planCounts`、`selection`、按 slot 稳定排序的 `rows`（`slot` / `sourcePath` / `targetPath` / `sourceSha256` / `sourceMtimeSec` / `targetSha256` / `targetMtimeSec` / `ok`）与 `assertionNames`；用例断言 `rows.length === writtenCount`、每条 `ok === true`、`assertionNames` 覆盖本门禁全部 `it` 名、manifest 序列化文本不含 `/samples`。
- ac-e2e-committed-evidence: 仓库内存在 `.munk/baseline/domains/directory/qa/template-e2e-manifest.json`（≥1,000 行逐条复核记录）与 `.munk/baseline/domains/directory/qa/template-e2e-evidence.md`（记录真实根路径、运行命令、计数、五类特殊行逐条、五个门禁 id 与命令、全部断言名、manifest 的 sha256），两者均不含 `/samples`；e2e 文件内的一条静态断言校验该提交清单自洽：行数 ≥1,000、全部 `ok === true`、四类结果齐备、含中文与空格路径、最深路径 ≥4 段，且其 sha256 与 evidence 文档记录值一致。
- ac-gates-registered: `.munk/code-gates.json` 追加 5 项门禁 `template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real`，顺序稳定位于矩阵末尾，`cwd` 均为 `"."`，命令分别为 `pnpm test src/template-gate-default-unchecked.test.ts`、`pnpm test src/template-gate-single-source.test.ts`、`pnpm test src/template-gate-sha-mtime.test.ts`、`pnpm test src/template-gate-cancel-zero-write.test.ts`、`pnpm test src/template-e2e-real-directory.test.ts`，每条命令为单 argv（不含 `&&` / `||` / `|` / `;`）。
- ac-gates-description: `.munk/code-gates.json` 的 `description` 追加模板归位四条行为映射（`conflict and overwrite default-unchecked` / `counts and apply read one resolved plan` / `source sha256 and mtimeSec preserved` / `cancel writes nothing`），每条点名对应 gate id 与测试文件相对路径，并保留既有同步四条标记不被删除或改写。
- ac-gates-pin: `src/munk-gates.test.ts` 的 `EXPECTED_GATES` 更新为 16 项并逐项断言 `id` / `cwd` / `command`；新增断言覆盖五条模板门禁（存在、命令逐字、映射的测试文件存在、description 含对应 marker 与 gate id）；既有 11 项断言、单 argv 断言、「无 perf 命令」断言不被删除或放宽。
- ac-gates-independently-runnable: 五个门禁文件之间互不依赖：不共享 `beforeAll` 夹具、不依赖执行顺序、不读取彼此产物；在干净工作树上逐个单独运行（五条命令依次执行）全部通过，且各自可以在同一进程外独立冷启动通过。
- ac-no-sample-evidence: 新增或修改的任何门禁文件不 `import` `@shared/fixtures`、不引用 `DIRECTORY_SAMPLE_PATHS`、不出现 `/samples` 字面路径；所有夹具来自 `mkdtemp` 真实目录，并由 `src/munk-gates.test.ts` 或 e2e 文件内的一条静态断言钉住（扫描五个文件的源码文本）。
- ac-no-regression: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 与 `.munk/code-gates.json` 全部门禁（16 项）通过；`src/template-real-gate.test.ts`、`src/renderer/src/views/TemplateDialog.test.tsx`、`src/renderer/src/workbench/templateOps.test.ts` 既有断言，以及目录对比四态 / 同步 / 快照 / 报告 / i18n 既有用例零回归。
- ac-no-prod-semantics-change: 除门禁暴露出的最小缺陷修复外，`matchTemplate` / `createTemplatePlan` / `resolveTemplatePlan` / `executeTemplatePlan` / `verifyTemplateExtraction` 的字段与语义不变，不新增 `PlatformPort` 方法、不新增 npm 依赖、不改 i18n 与样本数据；如确有修复，交付说明逐条给出「失败断言 → 缺陷 → 改动文件」。

## 非目标

- 不改任何界面、i18n 文案、设置「示例 / 调试」分区、样本数据、快照格式、HTML 报告 / 导出、目录对比四态、同步写入语义。
- 不做浏览器 / 真实设备 / 桌面 GUI 点击验收（`needSelfTest = false`）；显式勾选在门禁中以 `TemplateSelection`（`checkedPaths` + `conflictChoices`）表达，其与界面的同一性继续由既有 `TemplateDialog.test.tsx` 同源断言承载，本项不新增 UI 断言为硬条件。
- 不做执行中途的 UI 取消 / 回滚：本项「取消」只指确认前不执行与预取消 `AbortSignal`（零写入）；`executeTemplatePlan` 中途 abort 的既有语义（已写条目保留）不在本项证据范围。
- 不做「把输出根作为右侧建立新对比」、不做自动刷新右侧比较树、不做性能基准或 `perf-gate` 新档位。
- 不为凑绿放宽 / 删除既有门禁与既有断言，不新增第二条磁盘抽象，不把 Web 内存盘或 mock 文件系统算作真实证据。
- 不改发布通道 / 版本号 / tag / Release。

## 实现约束

- **复用既有真实磁盘骨架**：沿用 `src/template-real-gate.test.ts` 的 `vi.mock('electron')` + handler map + `registerPlatformIpc()` + `PlatformPort` 适配；新增五个文件不得再复制第三份 `PlatformPort` 桩 —— 抽出共享 harness（建议 `src/template-gate-support.ts`：handler map / platform 装配 / `recordIo` 写调用计数 / `mkdtemp` scratch 根 / `diskPath` / 整秒 `utimes` / 输出树快照 / 分块写入），`sync-real-gate.test.ts` 不动。共享 harness 只放测试辅助，不得被生产代码 import（`src/core/` 依赖约束与 ESLint 边界不变）。
- **规模与时长**：e2e 的 1,000+ 文件用分块写入（≤48 并发，仿 `sync-real-gate` 的 `inChunks`），源 mtime 一律整秒（`utimes`）；每个 e2e 用例显式传超时（大夹具用例 ≥120s、失败路径小夹具用例 ≥60s），四条门禁用例 ≤60s，禁止 `sleep` / 固定等待。文件数、深度、中文与空格由用例断言，不靠注释声明。
- **失败路径稳定性**：只读根用真实 `chmod 0o555` 并在 `finally` 恢复 `0o755`（root 身份 `skipIf`，与既有口径一致）；「占用」定义为**目标路径被输出根既有目录占用**（计划期 `occupiedByDirectory` / `target-occupied-by-directory`）与**文件占住所需父目录导致的逐条 `write-failed`**，不依赖 `EBUSY` 等平台锁语义；断言 `*.tmp` 残留一律用输出根全树扫描。
- **计数同源口径**：门禁与 e2e 只读 `resolveTemplatePlan` 的结果与 `applyTemplatePlan` 的返回值，不在测试内另算可执行数、不拼 `checkedPaths.length`；「同源」的判据是 `writeTextFile` 实际 targetPath 集合与 `resolved.executable` 集合相等。
- **证据文件**：`manifest.json` 字段固定、`rows` 按 slot 稳定排序（便于 sha256 复现）；提交版清单由一次显式运行生成（`OPENCOMPARE_TEMPLATE_E2E_EVIDENCE_DIR=.munk/baseline/domains/directory/qa`，生成后改名为 `template-e2e-manifest.json`），默认 `pnpm test` 运行**不得**写仓库；`template-e2e-evidence.md` 沿用 `qa/template-apply-verify.md` 的 `covers:` / 步骤 / 期望 / 最近执行结构，并列出五个门禁命令与断言名。
- **矩阵钉住同步**：`.munk/code-gates.json` 与 `src/munk-gates.test.ts` 必须同一次改动同时更新；门禁顺序追加在既有 11 项之后，不重排、不改既有命令；`description` 保留既有同步四条 marker 文本。
- **断言命名**：断言消息带稳定前缀（建议 `template default-checked:` / `template single-source:` / `template sha-mtime:` / `template cancel:` / `template e2e:`），`manifest.assertionNames` 与真实 `it` 名逐字一致，便于按名复核。
- **真缺陷处理**：若门禁暴露真实缺陷，允许在 `src/core/directory/template.ts` / `src/renderer/src/workbench/directoryOps.ts` / `src/main/platform/electron-platform.ts` 内做最小修复（不改公共字段语义、不新增方法），并同步交付说明的「失败断言 → 缺陷 → 改动」；不得通过放宽断言、缩小夹具或跳过用例来变绿。
- **不做的事写进交付说明**：若某条因平台身份（root）跳过，交付说明必须列明跳过的断言名与原因。
