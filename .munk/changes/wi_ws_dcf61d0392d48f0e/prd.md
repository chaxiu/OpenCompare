# 真实散乱树 B / 输出根入口与 Dry-run

## 范围

本子项是 WorkSet「P1 ⑥ 模板归位接真实用户目录」的入口 + Dry-run 切片（checkpoint `real-template-entry` / `real-dry-run-plan`）：把模板归位从「只认内置散乱树 + 临时输出根」改成真实外部目录上的可用、可复核 Dry-run。

**基线现状（已核实）**

- `Workbench.handlePreviewTemplate`（`src/renderer/src/workbench/Workbench.tsx:1223`）写死 `DIRECTORY_SAMPLE_PATHS.incoming` 当散乱树 B。
- `previewTemplate`（`src/renderer/src/workbench/directoryOps.ts:595`）用 `platform.temporaryDirectory()` 拼 `<temp>/restored/<seq>-<basename>` 当输出根——真实写入位置对用户不可见、不可控。
- 模板链路仍走旧 `matchTemplate` / `extractTemplateMatches` / `matchTemplateSlots`，没有用前序子项已冻结的计划核心：`createTemplatePlan`（`defaultChecked` / `overwrite` / `occupiedByDirectory` / `candidates` / `sourceModifiedMs`）、`resolveTemplatePlan`（唯一可执行清单）、`executeTemplatePlan`、`verifyTemplateExtraction`，均在 `@core/directory/template.ts`。
- `TemplateDialog`（`src/renderer/src/views/TemplateDialog.tsx`）只按四段静态列表渲染：无入口、无勾选、无窗口化；`确认提取归位` 直接调 `applyTemplateExtract`（旧写路径）。
- 前序子项已把首屏 / 工具栏的样本路径与内置散乱树点名清零，模板 toolbar tooltip 不再含 `/samples`；本项不再改这些文案。
- 既有窗口化能力：`@core/directory/rows` 的 `createDirectoryScrollMap` + `DIRECTORY_ROW_HEIGHT`，`TreeView` 用 `useVirtualizer` 只观察滚动、行窗口来自纯映射（Node 可单测）。

**本项要达成的增量**

1. **真实入口（两步）**：目录会话点「模板归位」→ 先「选根」：模板 A 只读显示当前左侧根（`comparison.leftRoot`）；散乱树 B 根与输出根各支持系统目录选择、拖入目录、键入路径（`~` 展开）。
2. **入口校验**：左侧为快照时拒绝把快照当模板 A；B 根必须存在且为目录；B 根等于 A 根、输出根等于 A 或 B 根时拒绝；输出根允许尚不存在（标注「将创建」，预览零写入）。拒绝文案 zh / en 成对。
3. **真实 Dry-run**：用输出根真实既有文件 / 目录清单构建 `createTemplatePlan`，四类分区逐条渲染「槽位相对路径 → B 源相对路径」；分区计数与可执行数来自同一份 `resolveTemplatePlan`。
4. **显式勾选**：默认勾选取 `entry.defaultChecked`（matched 且不覆盖、未被目录占用）；conflict / missing / unused 默认不勾且 conflict 本项无可写候选选择；勾选集合 → `resolveTemplatePlan` → 可执行数与确认按钮同源；确认只写该可执行清单。
5. **1,000+ 条目**：复用 `createDirectoryScrollMap` + `useVirtualizer` 的单表窗口化，不截断、不丢行，滚动到第 1,000+ 行仍可勾选。
6. 模板归位全链路不再出现 `/samples`。

## Acceptance Criteria

- ac-template-a-is-left-root: 目录会话点「模板归位」后进入选根步骤，模板 A 以只读方式显示当前左侧根 `comparison.leftRoot`，无输入控件可改它；Dry-run 显示的 A 根与该会话左侧根字符串相同。
- ac-root-picker: 散乱树 B 根与输出根各有独立的选择按钮，分别调用 `platform.selectDirectory()`；返回非 `null` 时该根被填入并可用于扫描（B / 输出根互不覆盖）。
- ac-root-drop: 把目录拖入选根步骤的对应区域，经 `platform.resolveDroppedPath` 解析后填入该根；该 drop 不触发 `Workbench` 窗口级 drop 处理（不新开会话、不改会话列表），并 `preventDefault` 掉浏览器默认打开行为。
- ac-root-typed: 在 B 根 / 输出根输入框键入绝对路径或 `~/…` 后确认，`~` 按 `platform.homeDirectory()` 展开后作为该根进入扫描；空串或展开后为空时给出本地化提示且不发起扫描。
- ac-snapshot-left-refused: 左侧 side 为快照（`sides.left.kind === 'snapshot'`）时点「模板归位」不进入选根 / 预览、不对 B 或输出根调用 `listDirectory`、`writeTextFile` / `ensureDirectory` 调用数为 0，并显示本地化拒绝文案（zh / en 成对）；会话保持可用。
- ac-invalid-roots-refused: B 根不存在或 `statPath` 不是目录、B 根 === A 根、输出根 === A 根或 === B 根时，显示对应本地化拒绝，不构建计划、不调用 `listDirectory`（B 根非法时）/ 写调用数为 0。
- ac-missing-output-root: 输出根尚不存在（`statPath` 为 `missing`）时仍可预览，界面明确标注「将创建」；预览阶段 `writeTextFile` / `ensureDirectory` 调用数为 0（不建目录、不写文件），且所有条目 `overwrite === false`。
- ac-no-sample-path: 选根步骤与 Dry-run 两步的可见文本、`title`、`aria-label` 均不含 `/samples`；模板归位的 B 根来自用户输入而非 `DIRECTORY_SAMPLE_PATHS.incoming`。
- ac-four-outcomes-per-row: 用真实外部目录构造 matched / missing / conflict / unused 各 ≥1 时：matched 与 conflict 行同时显示槽位相对路径与其 B 源（conflict 为候选路径列表）；missing 行显示槽位相对路径且无源路径；unused 行显示 B 相对路径；四类均可逐条读到。
- ac-plan-single-source: 预览渲染的 matched / missing / conflict / unused 分区计数分别等于 `createTemplatePlan(...).counts` 对应字段，也等于各分区实际渲染条目数；不存在界面内联的第二套计数判定。
- ac-overwrite-detected-from-output-root: 输出根已存在同名文件时该行 `overwrite === true` 且默认不勾；目标路径被输出根既有目录占用时该行不可执行（即使被勾选也不进可执行清单，计入拒绝数）；两种情况在预览中可区分呈现。
- ac-default-checked: 初始勾选集合恰等于 `plan` 中 `defaultChecked === true` 的条目集合；conflict 行默认不勾；missing / unused 无勾选框。
- ac-executable-count-same-source: 界面显示的可执行数等于 `resolveTemplatePlan(plan, selection).executableCount`；可执行数为 0 时确认按钮 `disabled`；勾选 / 取消某行后计数与按钮状态同步且与该函数结果一致。
- ac-apply-writes-checked-only: 确认后只对 `resolved.executable` 的 `targetPath` 调用写入，第三次参数为该行 `modifiedMs`；未勾选行的目标路径零写入；实际写入条数等于 `resolved.executableCount`；写路径只走 `executeTemplatePlan`。
- ac-apply-reports-result: 完成后通知显示写入数与失败数，两者取自同一次 `TemplateExecution`（`writtenCount` / `failedCount`）；`failedCount > 0` 时不显示「全部成功」口径；对话框关闭、会话保持。
- ac-large-list-virtualized: 1,000+ matched 条目的计划在预览中可滚动；同时存在于 DOM 的行数显著小于总数（窗口化生效）；滚动到末尾后第 1,000+ 行可见、其勾选框可切换，切换后计数与 `resolveTemplatePlan` 同步；分区计数仍为 1,000+（不截断成前 N 条）。
- ac-i18n-parity: 新增的选根 / 拒绝 / 「将创建」/ 勾选 / 结果文案在 `zh` 与 `en` 成对存在（键集合一致）；en 下选根与 Dry-run 整屏渲染文本不匹配 `\p{Script=Han}`。
- ac-no-regression: 目录对比四态、同步 Dry-run / 镜像、快照导入导出、报告导出既有用例保持绿；`pnpm lint` / `pnpm typecheck` / `pnpm test` 与 `.munk/code-gates.json` 全绿；`src/core/directory/template.ts` 既有契约与 `template.test.ts` 不改口径。

## 非目标

- 冲突候选选择控件（先选候选、再显式勾选）不在本项：conflict 行只读展示候选，永不进入可执行清单。
- 按 sha256 / mtimeSec 的逐条复核清单、Apply 后「重新扫描输出根」、把输出根作为右侧建立新对比 → 后续子项（`apply-bytes-mtime-verified`）。
- 取消 / 输出根不可写 / 条目被占用的完整本地化失败恢复矩阵 → 后续子项（`failure-safe-localized`）；本项只要求预览零写入、结果通知如实报失败数。
- 不重做目录对比四态、同步镜像 / Dry-run、快照 `.ocsnap.json` 格式、HTML 报告 / 导出。
- 不做路径占位符模板、正则 / 脚本模板引擎、双向同步、冲突合并、实时监听、计划任务、远端 / SFTP。
- 不改样本数据与设置「示例 / 调试」分区，不新增样本入口；内置样本不作为本项验收证据。
- 不改 `.munk/code-gates.json`、不新增 npm 依赖、不动发布通道 / 版本号 / tag / Release；不为凑绿放宽既有门禁或断言口径。

## Implementation Constraints

- 入口与预览收在同一 `TemplateDialog` 内两步（`setup` → `dry-run`），复用既有 `Dialog` / `ToolbarButton` / `StateView` 与 token，不新建第二套对话框体系。
- 拖入目录一律走 `platform.resolveDroppedPath`；对话框内的 drop 必须 `preventDefault` + `stopPropagation`，不得触发 `Workbench` 窗口级 `handleDrop`。
- 键入路径的 `~` 展开与折叠复用 `src/shared/compareRequest.ts` 既有纯逻辑（导出内部 `normalizePathValue` 或在同模块加薄包装），**禁止**在 renderer 复制第二份实现；该模块的中文 message 不得直接渲染，错误提示走词典按稳定错误码本地化。
- 构建计划前必须扫描输出根（存在时）并把「相对文件 / 相对目录」清单传给 `createTemplatePlan` 的 `existingFiles` / `existingDirectories`——前序子项遗留坑：不传则 `overwrite` 恒为 false，默认勾选会静默覆盖。
- `TemplatePreview` 改为携带 `plan`（`TemplatePlan`）与三个根；勾选状态留在对话框内，确认时把 `resolveTemplatePlan` 的结果对象直接交给 Workbench 执行 `executeTemplatePlan`，Workbench 不得再解析第二份选择或另算一套计数。
- 新入口写路径只走 `executeTemplatePlan`；旧的 `extractTemplateMatches` 写路径若在 renderer 无人引用即删除（含 `applyTemplateExtract`），避免两条写路径并存。
- 窗口化复用 `@core/directory/rows` 的 `createDirectoryScrollMap` + `DIRECTORY_ROW_HEIGHT`，与 `TreeView` 同法（`useVirtualizer` 只观察滚动，行窗口来自纯映射）；不新增依赖。
- 所有新增可见文案 zh / en 成对，renderer 不硬编码中文（`scanHardcodedChinese` 已扫 `workbench` / `views`）；OS 码与路径原样保留。
- 既有钉住旧入口的用例必须按新入口改写为真实外部根（fake `PlatformPort` 上的 `/ext/a`、`/ext/b`、`/ext/out` 等）：`src/renderer/src/App.test.tsx`（模板预览 / 提取流程）、`src/renderer/src/views/directoryI18n.test.tsx`（`makeTemplatePreview` 与四段断言）、`src/renderer/src/perf/perfShell.test.tsx` 的模板流程；不得保留 `/samples/directory/incoming` 作为模板 B 的断言。
- 断言落在既有 vitest 文件或相邻新测试文件内，能被 `pnpm test` 覆盖；不新增 gate id、不改 `.munk/code-gates.json`。
- 不改 `src/core/directory/template.ts`、`sync.ts` 的既有契约与 `TemplateMatchResult` 字段语义；本项预期无需核心改动。
