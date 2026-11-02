# 模板归位幂等：内容相同的已落位槽位不再重复列为待执行

## Scope

修复 L3 实机场次 `trun_2e62f1ddce9f38c4` leg2 暴露的模板归位不幂等问题（基线 main tip `694d5ab`，产品行为缺陷）。

现状复现：真实 1205 文件散乱树 B → 模板 A 6 槽位，输出根已存在同名条目；首次 dry-run 显示 Matched 3 / Conflicts 3（提示 Overwrites an existing file in the output root）/ Unused 1205；显式勾选 3 条冲突后 Apply，6 个槽位全部落位，目标 sha256 与 mtimeSec 均等于源。不重开会话再次 dry-run：仍 Matched 3（同样 3 条覆盖提示）+ Conflicts 3，`Extract and place` 仍可点。

根因：`createTemplatePlan`（`src/core/directory/template.ts`）只根据输出根「是否存在同名文件」（`existingFiles`）判定 `overwrite`，从不比较目标内容与源的 sha256；`previewTemplate`（`src/renderer/src/workbench/directoryOps.ts`）扫描输出根时也只传相对路径。因此已按源内容落位的槽位永远停留在「待执行 / 可覆盖」状态，重复 dry-run 与 Apply 都不幂等。

本项只改模板归位链路的计划判定、预览注入、对话框展示与配套断言/文档：

1. 计划层新增「已落位」判定：目标已存在且内容 sha256 与该行可用源（matched 的 `sourceHash`，或 conflict 候选集合中任一 `hash`）相等时，该槽位判为已落位，不属于 matched / conflict，不出现覆盖提示，不进入可执行清单。
2. `previewTemplate` 在扫描输出根后，仅对「落在模板槽位上且有源身份」的既有文件读取正文并复用 `sha256Hex` 计算摘要，作为计划构建的注入输入；预览阶段仍零写入。
3. `TemplateDialog` 增加已落位分区与双语词条，已落位行无勾选框、无覆盖提示；默认选择与 Apply 禁用仍只读 `resolveTemplatePlan`。
4. 同步改判与本次语义直接冲突的既有断言与基线文档口径（见「既有断言改判说明」），并写明原因。

## Acceptance Criteria

- ac-placed-same-content: 对 `matched` 槽位，若输出根存在同名文件且其内容 sha256 等于该槽位的 `sourceHash`，该条目 `outcome === 'placed'`，`overwrite === false`、`defaultChecked === false`，且不再出现在 `matched` 中；即使把它放进 `checkedPaths`，`resolveTemplatePlan(...).executableCount === 0` 且 `rejectedCount === 0`（已落位既不可执行、也不算拒绝）。
- ac-placed-conflict-candidate: 对 `conflict` 槽位（`ambiguous` 或 `content-mismatch`），若输出根同名文件的 sha256 等于其 `candidates` 中任一候选的 `hash`，该条目 `outcome === 'placed'`、`overwrite === false`、`defaultChecked === false`，不再出现在 `conflicts` 中，且不进入 `executable`；候选集与原因字段的其余语义不变。
- ac-replan-idempotent: 在临时目录（真实 6 槽位夹具，含 3 条 `matched` + 3 条 `ambiguous` conflict）完成「首次 preview → 默认勾选 matched + 显式勾选并为每条 conflict 选候选 → apply → 同一 A/B/输出根再次 preview」后：第二次 preview 期间 `writeTextFile` / `ensureDirectory` 调用数为 0；`plan.counts.matched === 0`、`plan.counts.conflict === 0`、`plan.counts.placed === 6`；默认勾选集（`defaultChecked` 行）经 `resolveTemplatePlan` 得到 `executableCount === 0`；jsdom 中 `Apply` 按钮 `disabled === true`，界面显示的可执行数与 `resolveTemplatePlan` 的结果一致。
- ac-replan-different-content-guard: 把已落位槽位中的任一目标正文改掉后再次 preview，该槽位不得判为 `placed`、`defaultChecked === false`，且默认选择下不计入 `executableCount`：① 若该槽位是同名多候选 `conflict`，重新落回 `outcome === 'conflict'` 且 `counts.conflict === 1`；② 若该槽位是单源 `matched`，保持现有覆盖保护语义（`outcome === 'matched'`、`overwrite === true`、`defaultChecked === false`），显式勾选后才进入 `executable`。两种情况都不得自动勾选或自动写入。
- ac-missing-stays-missing: `missing` 槽位无论输出根是否已存在同名文件、内容是否相同，仍为 `outcome === 'missing'`、`defaultChecked === false`，不进入 `executable`，`counts.missing` 与首次 preview 一致。
- ac-unused-unchanged: apply 前后再次 preview，`plan.unused` 的相对路径集合与条数完全不变（散乱树 B 未被消费的文件计数不因目标已落位而变化）。
- ac-counts-single-source: `TemplatePlanCounts` 含 `matched` / `missing` / `conflict` / `placed` / `unused` 五个分区；每个计数等于对应数组长度，且 `templateFileCount === counts.matched + counts.missing + counts.conflict + counts.placed`；对话框显示的可执行数、拒绝数与 `Apply` 禁用状态恒等于 `resolveTemplatePlan(preview.plan, { checkedPaths, conflictChoices })` 的 `executableCount` / `rejectedCount`，界面内不得再留第二套内联判定。
- ac-preview-zero-write: 首次 preview 与重复 preview 全过程中 `writeTextFile` / `ensureDirectory` 调用数均为 0，输出根相对树（相对路径 + 内容 sha256 + mtimeSec）与预览前一致，不新建目录、不产生 `*.tmp`。
- ac-placed-row-presentation: 已落位行在 Dry-run 中以独立「已落位 / Already placed」分区呈现（zh / en 词条成对），无勾选框、无 `Overwrites an existing file in the output root` / `将覆盖输出根既有文件` 提示，行计数与 `counts.placed` 一致。
- ac-existing-assertions-readjudged: 与「内容相同仍按 overwrite / matched 待执行」直接冲突的既有断言与文档在同一批改动中改判，且 PRD / 交付说明写明原因：`src/template-gate-default-unchecked.test.ts` 的 rescan 用例、`src/template-real-gate.test.ts` 的 rescan 用例、`src/template-e2e-real-directory.test.ts` 的 rescan 用例、`src/renderer/src/views/TemplateDialog.test.tsx` 的 rescan 用例，以及 `.munk/baseline/domains/directory/product.md` 的 `ac-e2e-rescan` / `ac-gate-default-unchecked-rescan` / `ac-four-outcomes-one-to-one` / `ac-overwrite-detected-from-output-root` 与 `.munk/baseline/domains/directory/qa/template-e2e-evidence.md` 的 rescan 步骤与期望；已落位槽位的新断言为「再次 preview 后 `placed`、默认不勾、pending 0」，不得保留「已写槽位重新扫描仍是 overwrite」的旧判据。
- ac-no-regression: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 与 `.munk/code-gates.json` 全部 16 项门禁通过；`src/core/directory/template.test.ts`、`src/renderer/src/workbench/templateOps.test.ts`、`src/template-gate-*.test.ts` 中与本次语义无关的既有断言（默认不勾、sha256 / mtimeSec、取消零写入、单一可执行清单、只读拒绝）不被放宽或删除。
- ac-scope-guard: 不实现路径占位符 / 正则 / 脚本模板引擎；不改目录对比四态口径、快照 `.ocsnap.json` 格式、同步 / 导出 / 发布通道；不推 tag、不 dispatch、不改已公开 Release 与资产；不新增 `PlatformPort` 方法或 npm 依赖；不为凑绿放宽、跳过或删除任何门禁。

## 非目标

- 不做路径占位符、正则替换、脚本模板引擎或任何模板语法扩展。
- 不改目录对比四态判定、快照格式、报告导出、同步镜像语义与发布流程。
- 不改模板 A 只读、选根拒绝码、冲突候选选择 / 显式勾选的产品交互；已落位只是新增一个终态展示，不自动勾选、不自动覆盖。
- 不改 `executeTemplatePlan` / `verifyTemplateExtraction` 的写入与复核语义；不新增第二条写路径、不做执行中途 UI 取消 / 回滚。
- 不做浏览器 / 真实设备 / 桌面 GUI 点击验收（`needSelfTest = false`）；行为由 vitest / jsdom 断言钉住。
- 不新增门禁 id、不改 `.munk/code-gates.json` 矩阵项；不为本项提高性能档位。

## Implementation Constraints

- 判定同源：新增的「已落位」判定只放在 `createTemplatePlan` 内（与 `overwrite` / `defaultChecked` 同一处），`resolveTemplatePlan` 是唯一可执行清单出口；`TemplateDialog` 只读 `preview.plan` 与 `resolved`，不得内联计算 pending / conflict / 可执行数。
- 计划纯核零 IO：`createTemplatePlan` 不读盘；`TemplatePlanOptions` 增加既有输出文件摘要注入（建议 `existingFileHashes: Readonly<Record<string, string>>`，相对路径 → sha256），与既有 `existingFiles` / `existingDirectories` 同批传入。
- 预览只读且最小读取：`previewTemplate` 只为「输出根既有文件且相对路径属于 `matched` 或 `conflicts` 槽位」的文件调用 `readTextFile` 并复用 `sha256Hex`；不得读取无关输出文件、不得重复哈希同一路径；不得新增 `PlatformPort` 方法；预览阶段零写入、零建目录。
- 判定口径：仅以 sha256 相等判已落位（不比较 mtime）；目标为目录时仍走 `occupiedByDirectory`；目标读取失败 / 无摘要时按未落位处理，保持现有覆盖 / 冲突保护。
- 计划结构：`TemplatePlanEntry.outcome` 增加 `'placed'`，`TemplatePlan` 增加 `placed` 数组，`TemplatePlanCounts` 增加 `placed`；保持 `templateFileCount` 与四个槽位分区之和的等式。`placed` 条目携带其来源行的 `sourcePath` / `sourceHash` / `sourceModifiedMs`（conflict 来源可为 `null`，不强制补候选）。
- 可执行语义：`resolveTemplatePlan` 明确跳过 `placed`（既不 executable 也不 rejected）；默认勾选定为 `outcome === 'matched' && !overwrite && !occupiedByDirectory`；不因「已落位」而放宽任何覆盖 / 冲突保护。
- 界面复用：沿用 `TemplateDialog` / `ToolbarButton` / token 与现有虚拟滚动行模型，新增一个已落位分区与 zh / en 词条即可；不得新建第二套对话框或视觉体系。
- 文档同步：更新 `.munk/baseline/domains/directory/product.md` 与 `qa/template-e2e-evidence.md` 中与本次口径冲突的 rescan 描述；e2e 提交的 `template-e2e-manifest.json` 仅承载首次 apply 的计划计数与写入行，首次计划（输出根旧内容与源不同）不变，应保持其可复现；若重新生成导致摘要变化，同步更新 evidence 文档记录的 sha256。
- 性能：1205 文件复制规模下重复 dry-run 应保持线性；哈希结果按路径 memo，不得对同一文件读取两次。
- 交付口径：研发完成 = 合入 main + `code_gates` 通过；若门禁暴露真实缺陷，允许在 `src/core/directory/template.ts` / `src/renderer/src/workbench/directoryOps.ts` / `src/renderer/src/views/TemplateDialog.tsx` 内做最小修复，并在交付说明写明「失败断言 → 缺陷 → 改动文件」，不得缩小夹具或跳过用例。
