# Domain: file-family

文件家族判定域：把「扩展名」与「字节内容」收敛成唯一可判定的文件家族（`code` / `csv` / `tsv` / `json` / `yaml`），并把「未知扩展名 = 不支持」改为「未知扩展名按内容判定」——文本进 `code`，二进制拒绝。判定只在打开链路的每侧一次 probe 中发生，请求校验零读取。

## 范围

- **单一判定实现（`src/shared/fileExtensions.ts`）**：`extensionFamily(name)` 仅按扩展名一步给家族（已知扩展名 / 无扩展名 / 点文件 → 家族；未知 → `null`，从不读文件）；`resolveFileFamily(name, content)` 是唯一「扩展名 + 内容 → 家族」组合（`'text'` → `code`，`'binary'` → `null`）。`SUPPORTED_FILE_EXTENSIONS` / `isSupportedComparisonFile` 已删除，仓库内不再有第二份「按扩展名拒绝」入口。
- **内容结论唯一纯函数（`src/core/text/probe.ts`）**：`isTextProbe({ text, encoding })` = 编码不是 `Unknown` 且解码文本不含 `U+0000`；等价比「字节流中不存在 UTF-16 布局之外的 NUL 字节」。不新增 NUL 比例 / GBK 形状阈值。
- **家族 → 视图映射（`renderer/src/workbench/fileKinds.ts`）**：`FileKind = FileFamily`；`classifyFamily(family)` 只做家族 → `DrilldownTarget` 映射；`classifyFile(name)` 仅按扩展名（未知返回 `null`，快照内联策略与「换侧文件沿用当前家族」依赖它）；`contentFamily(name, probe)` = `resolveFileFamily(name, isTextProbe(probe) ? 'text' : 'binary')`。
- **四个打开入口共用同一判定**：手动路径对话框 / argv / `opencompare://` → `resolveCompareRequest`（零读取）→ `openFilePairSession`；拖放 / 选择器 / 历史重开 → `openFilePairSession`；目录树双击 → `openDrilldownSession`；三向合并 → `resolveMergeRequest`（零读取）→ `buildMergeSession`。
- **读取预算**：未知扩展名每侧恰好一次 `probeTextFile`，该次读取的 `text` 直接作正文、`facts`（encoding / newline / bytes / sha256）直接进 `session.probes`；已知扩展名读取次数与现状逐项一致（code 对每侧一次 probe，CSV / 结构化对 `readTextFile`，合并 txt 走 `readTextFile`）；校验阶段零读取。
- **失败语义**：二进制拒绝沿用 `UNSUPPORTED_FILE_TYPE`（不新增错误码），携带侧别 + 文件名；侧别来自本次内容探测，不用「该侧是否为已知扩展名」反推；二进制判定先于 mixed-family，左侧优先给出确定性侧别。
- **文案**：对比 / 合并 / 目录四处提示改为「扩展名无法识别时按内容判断，二进制文件不支持」，zh / en 键集合不变；`shell.file.error.unsupported` 删除。

## 验收

- **ac-unknown-text-opens**：通过手动路径对话框、启动参数或 `opencompare://compare` 提交左右两个未知扩展名（如 `a.vue` / `b.vue`）的 UTF-8 文本文件，返回成功并打开代码双栏视图；两侧正文与行差异正确，状态栏编码显示 `UTF-8`，不出现 `UNSUPPORTED_FILE_TYPE`。
- **ac-unknown-binary-rejected**：未知扩展名 + 二进制内容（如 PNG 头 + IHDR 区 NUL 字节）作为任一侧时，不创建会话、不出现乱码正文，返回 `UNSUPPORTED_FILE_TYPE` 且提示含该侧文件名。
- **ac-gbk-shape-guard**：字节流即使可被整体 GBK 解码，只要含 UTF-16 布局之外的 NUL 字节，仍判为二进制并拒绝（防止「恰好符合 GBK 形状的二进制」被当文本打开）。
- **ac-unknown-gbk-text-opens**：GBK 编码的未知扩展名文本（含中文正文）按文本打开，正文为解码后的中文，状态栏编码显示 `GBK`。
- **ac-side-attribution**：左侧未知扩展名文本 + 右侧未知扩展名二进制时提示指向右侧；左右对调后指向左侧。侧别判定来自本次内容探测结果，不得用「该侧是否为已知扩展名」反推。
- **ac-known-ext-no-probe**：两侧均为已知扩展名（如 `a.ts` / `b.ts`）时内容判定调用次数为 0，打开行为与现状逐项一致；校验阶段同样不新增任何读取。
- **ac-single-read-unknown**：未知扩展名成功打开时，每侧原始字节只读取一次，正文与编码 / 换行 / 字节数 / sha256 事实来自同一份字节（不得先探测再整读一次）。
- **ac-drilldown-unknown-opens**：目录树中双击未知扩展名的文本文件，按代码视图打开对应节点的左右两侧内容；不再弹出「不支持的打开类型」提示。同一文件为二进制时仍给可读提示且不打开空会话。
- **ac-merge-unknown-opens**：三向合并三个未知扩展名文本文件可成功打开合并视图；其中任一为二进制时拒绝并指明该侧，不打开空会话。
- **ac-mixed-family-unchanged**：未知扩展名文本按 `code` 家族参与家族一致性判定——与 `.csv` / `.tsv` / `.json` / `.yaml` 组成一对时仍按 mixed-family 拒绝；未知扩展名文本 + 已知文本扩展名（如 `.vue` + `.ts`）可正常打开。
- **ac-extensionless-unchanged**：无扩展名 / 点文件（`Makefile`、`.gitignore`、`LICENSE`）保持现状，直接按文本打开，不触发内容兜底判定。
- **ac-copy-updated**：中英词典中对比 / 合并 / 目录三处提示同步更新，不再宣称「仅支持代码/文本、CSV/TSV、JSON/YAML」，改为「扩展名无法识别时按内容判断，二进制文件不支持」；两种语言的 key 集合保持一致。
- **ac-single-decision-source**：「扩展名 + 内容 → 文件家族」的判定只存在一处实现；请求校验、合并校验、目录打开分类、对话框侧别提示共用它，仓库内不出现第二份扩展名白名单或第二套二进制判定阈值。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿，聚焦 gate `test-compare-request` 仍通过；既有 unsupported / mixed-family 用例按新口径更新后通过。

## 非目标

- 不把 `.vue`、`.svelte`、`.dart` 等扩展名加入支持白名单（不靠扩表解决，只做内容兜底）。
- 不做 CSV / TSV / JSON / YAML 的内容识别（不猜分隔符、不猜格式）；未知扩展名一律只进 `code` 家族。
- 不改目录扫描、目录对比、目录报告与四态判定（未知扩展名文件在目录对比中已按原始字节处理）。
- 不改快照内联策略：`exportSideSnapshot` 的 `inlinesDrilldownText` 仍只按已知扩展名 / 无扩展名决定是否内联正文。
- 不做大文件采样窗口、分级阈值、magic / MIME 数据库或任何新依赖；判定沿用既有字节探测。
- 不改编辑、保存、同步、合并写回语义；不改对比算法、差异计数、行号与虚拟化。
- 不做语法高亮的语言推断；未知扩展名按纯文本渲染。
- 不新增 IPC 通道、不新增 / 收窄 `PlatformPort` 方法、不新增错误码。
- 不改版本号、README、CHANGELOG、release notes、tag / Release 资产；不做实机点选验收。

## 实现约束

- 复用既有能力：`PlatformPort.probeTextFile`（通道 `platform:probe-text-file` 已存在）与 `src/core/text/probe.ts` 的 `probeTextBytes` / `detectEncoding`。禁止另写编码嗅探、NUL 阈值或 GBK 判定。
- 判定入口单点：扩展名白名单与内容兜底收敛到 `src/shared/fileExtensions.ts` 及其消费方；`classifyFile`、`resolveCompareRequest`、`resolveMergeRequest`、`openFilePairSession`、`openDrilldownSession`、`buildMergeSession` 不得各留一份内联判定（AGENTS.md「可执行 / 可达性判定必须共用同一纯函数」）。
- 校验层（`resolveCompareRequest` / `resolveMergeRequest`）零读取、不按扩展名拒绝；判定只在打开链路发生。`CompareErrorCode` / `MergeErrorCode` 保留 `UNSUPPORTED_FILE_TYPE` 字面量供打开链路与对话框文案复用。
- 打开链路错误类型：`FilePairErrorCode = 'UNSUPPORTED_FILE_TYPE' | 'mixed-family'`（`FilePairErrorParams` 带 `side`）；`MergeSessionErrorCode = 'READ_FAILED' | 'UNSUPPORTED_FILE_TYPE'`（错误文案用 `baseName(path)`，不回显绝对路径）；界面文案统一走 i18n 键。
- `Promise.all` 并行读两侧；探测失败原样抛出，不吞成「不支持」；二进制判定先于 mixed-family，左侧优先。
- 测试落点沿用既有布局：`src/core/text/probe.test.ts`、`src/shared/fileExtensions.test.ts`、`src/shared/compareRequest.test.ts`、`src/shared/mergeRequest.test.ts`、`src/renderer/src/workbench/directoryCompare.test.ts`、`mergeSession.test.ts`、`src/open-pair-probe.test.ts`、`src/renderer/src/App.test.tsx`。
- 不新增 `.munk/code-gates.json` 条目；回归由既有全量 `test` 与聚焦 gate `test-compare-request` 承担。

## 最近交付证明

- WI：`wi_intake_48956cb4024b1418`（未知扩展名按内容判定文本并打开；`kind: feature`）
- 日期：2026-11-05
- 结果：code_gates passed（29 gates，attempt 002，`.munk/runs/run_intake_48956cb4024b1418/code-gates/attempts/002/manifest.json`；`pnpm test` 142 files / 2276 passed + 1 skipped；`test-compare-request` 46 passed）。
- 覆盖摘要：`shared/fileExtensions.ts` 新增 `FileFamily` / `FileContentVerdict` / `extensionFamily` / `resolveFileFamily`，删除 `SUPPORTED_FILE_EXTENSIONS` / `isSupportedComparisonFile`；`core/text/probe.ts` 新增 `isTextProbe`（唯一二进制结论）；`fileKinds.ts` 改为家族 → 视图纯映射（`classifyFamily` / `classifyFile` / `contentFamily`，删除 `extensionOf`）；`resolveCompareRequest` / `resolveMergeRequest` 删除扩展名拒绝（校验零读取）；`openFilePairSession` / `openDrilldownSession` / `buildMergeSession` 在每侧一次 probe 内判定，二进制带侧别抛 `UNSUPPORTED_FILE_TYPE`，未知文本直接复用 probe 正文与 facts；`Workbench.openFile` 删早退并按失败类型给 `unsupportedDrilldown` / 快照提示；zh / en 四处文案更新并删除 `shell.file.error.unsupported`。测试新增 `fileExtensions.test.ts`，并按新口径改写 `compareRequest` / `mergeRequest` / `directoryCompare` / `mergeSession` / `open-pair-probe` / `App` 相关用例（含 PNG 头二进制、GBK 正文、左右对调、单次读取计数）。
- 注：本 WI change pack 仅 `prd.md` + `tech.md`，无 `tests/cases/**` / `ux/**`，无 change-pack 用例可 copy；tech 增量已手合 `tech/overview.md` 与 `tech/decisions/adr-0003-content-family-at-open.md`。既有 `compare-request` 的 `ac-unsupported-file-type` / `ac-error-precedence`、`merge-session` 的 `ac-merge-error-codes`、`workbench` 的 `ac-open-file-pair-rejects` 已就地改写（校验不再按扩展名拒绝，二进制拒绝归打开链路）。
