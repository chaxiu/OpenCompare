# 未知扩展名按内容判定文本并打开

## 范围

- **内容兜底判定**：当文件名扩展名不在支持白名单内（且不是无扩展名 / 点文件）时，不再一律拒绝，而是读取该文件原始字节，按既有字节探测能力判定「文本 / 二进制」；文本按 `code`（纯文本代码视图）家族打开，二进制仍拒绝。
- **覆盖的打开入口（共享同一判定）**：
  - 手动路径对话框（`NewCompareDialog`）与启动入口（argv / `opencompare://`）→ 同一个 `resolveCompareRequest` 校验链路；
  - 目录树双击文件（`Workbench.openFile` → `classifyFile` → `openDrilldownSession`）；
  - 三向合并入口（`resolveMergeRequest` 及合并会话打开链路）。
- **判定口径**（可确定断言）：复用 `probeTextFile` 的结果，编码为 `UTF-8` / `UTF-8 BOM` / `UTF-16LE` / `UTF-16BE` / `GBK` 且字节流中不存在「UTF-16 布局之外」的 NUL 字节 → 文本；其余（含 `Unknown`）→ 二进制。
- **提示文案**：未知扩展名被拒时的提示需说明「扩展名无法识别时按内容判断，二进制文件不支持」，中英双语同步。
- **未知扩展名成功打开时，一律按 `code` 单一家族处理**：不做分隔符 / 结构化格式猜测，不新增扩展名进白名单。

## 验收

- ac-unknown-text-opens: 通过手动路径对话框、启动参数或 `opencompare://compare` 提交左右两个未知扩展名（如 `a.vue` / `b.vue`）的 UTF-8 文本文件，返回成功并打开代码双栏视图；两侧正文与行差异正确，状态栏编码显示 `UTF-8`，不再出现 `UNSUPPORTED_FILE_TYPE`。
- ac-unknown-binary-rejected: 未知扩展名 + 二进制内容（如 PNG 头 + IHDR 区 NUL 字节）作为任一侧时，不创建会话、不出现乱码正文，返回 `UNSUPPORTED_FILE_TYPE` 且提示含该侧文件名。
- ac-gbk-shape-guard: 字节流即使可被整体 GBK 解码，只要含 UTF-16 布局之外的 NUL 字节，仍判为二进制并拒绝（防止「恰好符合 GBK 形状的二进制」被当成文本打开）。
- ac-unknown-gbk-text-opens: GBK 编码的未知扩展名文本（含中文正文）按文本打开，正文为解码后的中文，状态栏编码显示 `GBK`。
- ac-side-attribution: 左侧未知扩展名文本 + 右侧未知扩展名二进制时提示指向右侧；左右对调后指向左侧。侧别判定来自本次内容探测结果，不得用「该侧是否为已知扩展名」反推。
- ac-known-ext-no-probe: 两侧均为已知扩展名（如 `a.ts` / `b.ts`）时内容探测调用次数为 0，打开行为与现状逐项一致（本项不新增任何读取）。
- ac-single-read-unknown: 未知扩展名成功打开时，每侧原始字节只读取一次，正文与编码 / 换行 / 字节数 / sha256 事实来自同一份字节（不得先探测再整读一次）。
- ac-drilldown-unknown-opens: 目录树中双击未知扩展名的文本文件，按代码视图打开对应节点的左右两侧内容；不再弹出「不支持的打开类型」提示。同一文件为二进制时仍给可读提示且不打开空会话。
- ac-merge-unknown-opens: 三向合并三个未知扩展名文本文件可成功打开合并视图；其中任一为二进制时拒绝并指明该侧，不打开空会话。
- ac-mixed-family-unchanged: 未知扩展名文本按 `code` 家族参与家族一致性判定——与 `.csv` / `.tsv` / `.json` / `.yaml` 组成一对时仍按 mixed-family 拒绝；未知扩展名文本 + 已知文本扩展名（如 `.vue` + `.ts`）可正常打开。
- ac-extensionless-unchanged: 无扩展名 / 点文件（`Makefile`、`.gitignore`、`LICENSE`）保持现状，直接按文本打开，不触发内容兜底判定。
- ac-copy-updated: 中英词典中对比 / 合并 / 目录打开三处提示同步更新，不再宣称「仅支持代码/文本、CSV/TSV、JSON/YAML」，改为「扩展名无法识别时按内容判断，二进制文件不支持」；两种语言的 key 集合保持一致。
- ac-single-decision-source: 「扩展名 + 内容 → 文件家族」的判定只存在一处实现；请求校验、合并校验、目录打开分类、对话框侧别提示共用它，仓库内不出现第二份扩展名白名单或第二套二进制判定阈值。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿，聚焦 gate `test-compare-request` 仍通过；既有 unsupported / mixed-family 用例按新口径更新后通过。

## 非目标

- 不把 `.vue`、`.svelte`、`.dart` 等扩展名加入支持白名单（不靠扩表解决，只做内容兜底）。
- 不做 CSV / TSV / JSON / YAML 的内容识别（不猜分隔符、不猜格式）；未知扩展名一律只进 `code` 家族。
- 不改目录扫描、目录对比、目录报告与四态判定（未知扩展名文件在目录对比中已按原始字节处理，本项不动）。
- 不改快照内联策略：`exportSideSnapshot` 的 `inlinesDrilldownText` 仍只按已知扩展名 / 无扩展名决定是否内联正文。
- 不做大文件采样窗口、分级阈值、magic / MIME 数据库或任何新依赖；判定沿用既有字节探测。
- 不改编辑、保存、同步、合并写回语义；不改对比算法、差异计数、行号与虚拟化。
- 不做语法高亮的语言推断；未知扩展名按纯文本渲染。
- 不新增 IPC 通道、不新增 / 收窄 `PlatformPort` 方法。
- 不改版本号、README、CHANGELOG、release notes、tag / Release 资产。
- 不做实机点选验收（可回归性由自动测试与既有 gate 承担）。

## 实现约束

- 复用既有能力，不新造判定：`PlatformPort.probeTextFile`（通道 `platform:probe-text-file` 已存在）与 `src/core/text/probe.ts` 的 `probeTextBytes` / `detectEncoding`。禁止在新位置另写编码嗅探、NUL 阈值或 GBK 判定。
- 单一判定入口：扩展名白名单与「内容兜底」分类都必须收敛到 `src/shared/fileExtensions.ts` 及其消费方，禁止在 `classifyFile`、`resolveCompareRequest`、`resolveMergeRequest`、`openFilePairSession` 各留一份内联判定（AGENTS.md「可执行 / 可达性判定共用同一纯函数」）。
- 现状锚点（改动起点）：
  - `src/shared/fileExtensions.ts`（`TEXT_FILE_EXTENSIONS` / `SUPPORTED_FILE_EXTENSIONS` / `fileExtension` / `isSupportedComparisonFile`，`extension === ''` 已放行无扩展名与点文件）；
  - `src/shared/compareRequest.ts`（`unsupportedFileMessage` 与 `resolveCompareRequest` L462-L511，错误优先级 NOT_FOUND → TYPE_MISMATCH → UNSUPPORTED_FILE_TYPE）；
  - `src/shared/mergeRequest.ts` L112（`isSupportedComparisonFile` 拒绝点）；
  - `src/renderer/src/workbench/fileKinds.ts`（`classifyFile`，未知扩展名返回 `null`）；
  - `src/renderer/src/workbench/directoryCompare.ts` L405-L470（`requireComparableFile` / `openFilePairSession`，`probeTextFile` 已在 code 家族处使用）；
  - `src/renderer/src/workbench/Workbench.tsx` L1297（`openFile` 的「不支持的打开类型」早退）；
  - `src/renderer/src/workbench/NewCompareDialog.tsx` L188-L195（侧别靠 `isSupportedComparisonFile` 反推，需改为携带探测结果）；
  - i18n：`shell.compare.error.UNSUPPORTED_FILE_TYPE` / `shell.merge.error.UNSUPPORTED_FILE_TYPE` / `shell.notice.unsupportedDrilldown`（zh / en 各一份）。
- 错误码沿用 `CompareErrorCode` 的 `UNSUPPORTED_FILE_TYPE`（不新增错误码），侧别信息由解析 / 探测结果携带。
- 读取预算：未知扩展名判定按「单侧一次读取」实现；若在请求校验阶段探测，主进程与渲染进程必须复用同一探测实现，且不得让打开阶段再整读一次（可携带家族结果或让打开阶段复用首次探测的正文与事实）。
- 测试落点沿用既有布局：`src/shared/compareRequest.test.ts`、`src/shared/mergeRequest.test.ts`、`src/renderer/src/workbench/directoryCompare.test.ts` 及相应 dom 测试；未知扩展名 + 二进制 / GBK / mixed-family 用例按新口径补充或更新。
- 不新增 `.munk/code-gates.json` 条目；回归由既有全量 `test` 与聚焦 gate `test-compare-request` 承担。
