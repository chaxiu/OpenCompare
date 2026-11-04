# 技术方案增量：未知扩展名按内容判定文本并打开

> 本文只描述本轮迭代相对既有实现的**增量**（结构 / 数据流 / 判定落点 / 测试分层）。
> 视觉沿用既有工作台，`ux/**` 不存在，本项不产生新界面。
> 所有行号均为**当前工作树（改动前）**的锚点；Coding 用 `read(offset, limit)` 点读后直接改。

## 0. 结论先行（给 Coding 的五句话）

1. **不新增 IPC、不新增 `PlatformPort` 方法、不新增错误码**：内容判定复用 `probeTextFile`（单次读取）与 `core/text/probe` 的既有探测。
2. **单一判定实现收敛到 `src/shared/fileExtensions.ts`**：`extensionFamily(name)`（扩展名一步，未知扩展名返回 `null`）与 `resolveFileFamily(name, content)`（唯一的「扩展名 + 内容 → 家族」）。`isSupportedComparisonFile` / `SUPPORTED_FILE_EXTENSIONS` 一并删除，避免留下第二份"按扩展名拒绝"的入口。
3. **判定落在打开链路，而不是请求校验**：`resolveCompareRequest` / `resolveMergeRequest` 的扩展名拒绝整体移除（未知扩展名一律放行到打开阶段），因此校验阶段**零读取**；二进制拒绝由打开链路（`openFilePairSession` / `openDrilldownSession` / `buildMergeSession`）在**那一次读取**里得出，天然满足 ac-single-read-unknown。
4. **二进制判定的唯一纯函数**：`core/text/probe.ts` 新增 `isTextProbe({ text, encoding })` —— 编码已知且正文无 `U+0000` 才算文本（口径等价于「UTF-16 布局之外的 NUL 字节」，理由见 §2.2）。
5. **未知扩展名成功打开 = 每侧恰好一次 `probeTextFile`**，该次读取的 `text` 直接作正文、其 `facts`（encoding/newline/bytes/sha256）直接进 `session.probes`，状态栏沿用既有 `codeProbeStatusEntries`（UTF-8 / GBK 自动显示）。

## 1. 关键取舍（含对 PRD「实现约束」的响应）

| 取舍 | 选择 | 理由 |
| --- | --- | --- |
| 内容判定放在请求校验还是打开链路 | **打开链路** | PRD 约束明确写了条件句「**若**在请求校验阶段探测……不得让打开阶段再整读一次」。校验阶段探测就必须把正文/事实跨 IPC 携带（launch 载荷翻倍、`CompareRequest` 变成正文容器），而 `openFilePairSession` 在拖放 / 选择器 / 历史重开入口本来就必须独立判定 → 校验探测会成为第二份判定 + 双读。因此选另一条合法路径：校验零读取，判定只在打开链路做一次。 |
| 未知扩展名的家族 | 一律 `code`（`FileKind === 'code'`） | 与 PRD「一律按 `code` 单一家族处理、不猜分隔符/格式」一致；`csv`/`structured` 视图不受影响。 |
| 二进制拒绝的错误码 | 打开链路抛出的错误**沿用** `UNSUPPORTED_FILE_TYPE` 字面量 | `FilePairErrorCode` 由 `'unsupported-type'` 改为 `'UNSUPPORTED_FILE_TYPE'`，`MergeSessionErrorCode` 增加 `'UNSUPPORTED_FILE_TYPE'`，与 `CompareErrorCode` 同词表（不新增码）。 |
| 文案键 | 复用既有键，只改**值** | 对比 / 合并 / 目录三处 + 文件对一处，zh / en 键集合完全不变（i18n parity 测试天然绿）。 |
| `classifyFile` 语义 | **保持仅按扩展名**（未知扩展名仍返回 `null`） | `snapshotOps.inlinesDrilldownText`（快照内联策略是 PRD 非目标）与 `CsvView` / `StructuredView` 的「换侧文件时沿用当前家族」都依赖它；内容判定走新增的 `contentFamily` + `classifyFamily`。 |

## 2. 共享 API（精确签名，Coding 照抄）

### 2.1 `src/shared/fileExtensions.ts`

```ts
/** 一个对比可以渲染的文件家族（与既有 renderer 的 `FileKind` 同集合，后者改为别名）。 */
export type FileFamily = 'code' | 'csv' | 'tsv' | 'json' | 'yaml'

/** 一次字节探测给出的内容结论；由 `@core/text/probe` 的 `isTextProbe` 产出。 */
export type FileContentVerdict = 'text' | 'binary'

/** 仅按扩展名一步判定。已知扩展名 / 无扩展名 / 点文件 → 家族；未知扩展名 → null（由内容决定）。从不读文件。 */
export function extensionFamily(name: string): FileFamily | null

/** 唯一的「扩展名 + 内容 → 家族」判定；`content` 只在 `extensionFamily` 返回 null 时才生效。 */
export function resolveFileFamily(name: string, content: FileContentVerdict): FileFamily | null
```

实现要点：
- `extensionFamily` 内部复用现有 `fileExtension()`（L67-L75）与 `CSV/TSV/JSON/YAML/TEXT_FILE_EXTENSIONS` 五个集合，顺序：`ext === '' → 'code'` → csv → tsv → json → yaml → text → `null`。
- `resolveFileFamily` 一行：`return extensionFamily(name) ?? (content === 'text' ? 'code' : null)`。
- **删除** `SUPPORTED_FILE_EXTENSIONS`（L59-L65）与 `isSupportedComparisonFile`（L77-L81）：仓库内只允许存在这一个判定入口（ac-single-decision-source）。

### 2.2 `src/core/text/probe.ts`（新增一个纯函数，零新阈值）

```ts
/**
 * 单份探测结果的文本 / 二进制判定：编码必须被识别，且正文不含 U+0000。
 * 等价比「字节流中不存在 UTF-16 布局之外的 NUL 字节」：
 * UTF-16 布局内的 NUL 只落在高位字节，解码后不产生 U+0000；
 * 反之任何非布局 NUL 在 UTF-8 / GBK 下都会解码成 U+0000（0x00 不是 GBK 双字节的一部分）。
 */
export function isTextProbe(probe: Pick<TextBytesProbe, 'text' | 'encoding'>): boolean
// 实现：probe.encoding !== 'Unknown' && !probe.text.includes('\u0000')
```

- **不改** `TextBytesProbe` 结构、不改 `probeTextBytes` / `detectEncoding` 行为、不改 `PlatformPort.probeTextFile` 返回形状（快照 JSON、`probeStatus`、`electron-platform.test` 的 `toEqual` 全部不受影响）。
- 该函数是本仓库**唯一**的二进制判定阈值；`detect()` 内部的 UTF-16 NUL 比例常量（L58-L59）保持原样。

### 2.3 `src/renderer/src/workbench/fileKinds.ts`（家族 → 视图目标的唯一映射）

```ts
export type FileKind = FileFamily            // 兼容既有 import；不再维护第二份联合类型
export type DrilldownKind = 'code' | 'csv' | 'structured'
export interface DrilldownTarget { kind; label: FileKind; delimiter?; format? }   // 不变

/** 家族 → 视图目标。只有映射，不含任何扩展名判断。 */
export function classifyFamily(family: FileFamily): DrilldownTarget

/** 仅按扩展名分类（未知扩展名 null）。快照内联 / 换侧文件沿用当前家族仍走这里。 */
export function classifyFile(name: string): DrilldownTarget | null   // = extensionFamily(name) 映射

/** 打开链路的唯一内容判定入口：一次 probe 结果 → 家族；null = 二进制，不支持。 */
export function contentFamily(
  name: string,
  probe: Pick<TextBytesProbe, 'text' | 'encoding'>
): FileKind | null                    // = resolveFileFamily(name, isTextProbe(probe) ? 'text' : 'binary')

export function baseName(path: string): string   // 不变
```

删除本地 `extensionOf`（L32-L36）与四个 `*_FILE_EXTENSIONS` import（L11-L17）。

## 3. 数据流（四个入口共用同一判定）

```
① 手动路径对话框 (NewCompareDialog, Cmd+N)
   parseManualPaths → resolveCompareRequest ──(仅 statPath，零读取；不再按扩展名拒绝)
        └→ openCompareRequest → openFilePair → openFilePairSession ★判定
② argv / opencompare://  (main/launch.ts → resolveCompareRequest → payload)
        └→ Workbench.launchRequest → openCompareRequest → … → openFilePairSession ★判定
③ 目录树双击 (Workbench.openFile → openDrilldownSession ★判定)
④ 拖放 / 选择器 / 历史重开 → openFilePair → openFilePairSession ★判定
⑤ 三向合并 (NewCompareDialog → resolveMergeRequest 零读取 → openMergeRequest → buildMergeSession ★判定)

★ = 唯一的「扩展名 + 内容 → 家族」判定点：
    extensionFamily(path)
      ├─ 非 null（已知扩展名 / 无扩展名 / 点文件）→ 家族已定，读取行为与现状逐项一致
      └─ null（未知扩展名）→ probeTextFile(path) 一次
              ├─ contentFamily(path, probe) === 'code' → 文本：probe.text 作正文、probe facts 作 session.probes
              └─ === null → 二进制：抛 UNSUPPORTED_FILE_TYPE（携带侧别 + 文件名），不建会话、不落正文
```

每个 ★ 点的读取预算：

| 场景 | `probeTextFile` 次数 | 其他读取 |
| --- | --- | --- |
| 已知扩展名 code 对（a.ts/b.ts） | 2（每侧一次，**现状不变**，供编码事实） | 0 |
| 已知扩展名 csv/json 对 | 0 | `readTextFile` 2 次（现状不变） |
| 未知扩展名文本对（a.vue/b.vue） | 2（每侧一次，判定与正文/事实同一份字节） | 0 |
| 未知扩展名 + 二进制 | 2（并行判定，随后拒绝） | 0 |
| 已知扩展名三向合并（.txt×3） | 0 | `readTextFile` 3 次（现状不变） |
| 未知扩展名三向合并 | 3（每侧一次） | 0 |

## 4. 逐文件改动计划（含锚点表）

> **锚点复核（本方案写作时逐条 `grep` / `read` 验证过当前工作树）**：`isSupportedComparisonFile` 命中 `fileExtensions.ts:78`、`compareRequest.ts:9,506,509`、`mergeRequest.ts:9,112`、`NewCompareDialog.tsx:4,189`；`SUPPORTED_FILE_EXTENSIONS` 在 `fileExtensions.ts:59`；`unsupportedFileMessage` 在 `compareRequest.ts:462`；`extensionOf` 在 `fileKinds.ts:32`；`'unsupported-type'` 字面量在 `directoryCompare.ts:24,413`、`Workbench.tsx:310`、`directoryCompare.test.ts:158`。文件总行数：`fileExtensions.ts` 81、`compareRequest.ts` 515、`mergeRequest.ts` 116、`fileKinds.ts` 61、`directoryCompare.ts` 486、`mergeSession.ts` 118、`Workbench.tsx` 2172、`NewCompareDialog.tsx` 529、`probe.ts` 316、`open-pair-probe.test.ts` 172。

### 4.1 代码锚点表（Coding 必读，直接点读后编辑）

| Target File Path | Edit/Insert Line Range (Lxxx-Lyyy) | Target Function/Symbol Signature & Reusable Helpers | Single-Slice Edit Key Points |
| --- | --- | --- | --- |
| `src/shared/fileExtensions.ts` | 改 L58-L65（删 `SUPPORTED_FILE_EXTENSIONS`）、改 L77-L81（删 `isSupportedComparisonFile`）、新增尾段 | `export type FileFamily = 'code'\|'csv'\|'tsv'\|'json'\|'yaml'`；`export type FileContentVerdict = 'text'\|'binary'`；`export function extensionFamily(name: string): FileFamily \| null`；`export function resolveFileFamily(name: string, content: FileContentVerdict): FileFamily \| null` | 复用现成 `fileExtension()`（L67-L75）与五个 `*_FILE_EXTENSIONS` 集合；`ext === ''` 必须先返回 `'code'`（覆盖 `Makefile` / `.gitignore` / `LICENSE`）。**不要**在这里 import core（shared 保持零 core 依赖方向；函数纯字符串）。文件头注释补一句「未知扩展名不再等于不支持」。 |
| `src/core/text/probe.ts` | 新增 L308 之后（`probeTextString` 之前或之后均可） | `export function isTextProbe(probe: Pick<TextBytesProbe, 'text' \| 'encoding'>): boolean` | 实现只有一行表达式；注释必须写清「解码后的 U+0000 ⇔ UTF-16 布局之外的 NUL 字节」的等价性。**禁止**在此写新的 NUL 比例/阈值常量，**禁止**改动 `UTF16_NUL_RATIO_THRESHOLD` / `UTF16_OTHER_PARITY_NUL_LIMIT`（L58-L59）。 |
| `src/renderer/src/workbench/fileKinds.ts` | 改 L1-L61（整文件重写，约 60 行） | `export type FileKind = FileFamily`；`export function classifyFamily(family: FileFamily): DrilldownTarget`；`export function classifyFile(name: string): DrilldownTarget \| null`；`export function contentFamily(name, probe): FileKind \| null`；`export function baseName(path: string): string`（原样保留 L38-L43） | 删 `extensionOf`（L32-L36）与四个集合 import（L11-L17）；`classifyFile = extensionFamily(name) === null ? null : classifyFamily(family)`；`classifyFamily` 用 `switch` 返回既有四个 target 形状（csv `delimiter: ','`、tsv `delimiter: '\t'`、json `format:'json'`、yaml `format:'yaml'`、code 无附加字段）。`DrilldownKind` / `DrilldownTarget` 声明保持逐字不变（`directoryCompare.test` / `open-pair-probe.test` 依赖形状）。 |
| `src/shared/compareRequest.ts` | L9 删 import；L462-L464 删 `unsupportedFileMessage`；L466-L470 改文档注释；L505-L512 删整块 | `resolveCompareRequest(paths, context)` 签名/返回值不变 | 删掉 `if (leftKind === 'file') { … }` 整块（含两条 `failure('UNSUPPORTED_FILE_TYPE', …)`），保留 L514 的 `return { ok: true, request: { left, right, kind: leftKind } }`。`CompareErrorCode` **保留** `'UNSUPPORTED_FILE_TYPE'`（打开链路复用同字面量 + 对话框 i18n 映射表需要它）。注释里的错误优先级改为 `NOT_FOUND → TYPE_MISMATCH`，并补一句「文件家族由打开链路按扩展名 + 内容判定，校验阶段不读文件」。 |
| `src/shared/mergeRequest.ts` | L9 删 import；L88-L93 改文档注释；L112 删该行 | `resolveMergeRequest(paths, context)` 签名/返回值不变 | L112 删除后，循环体只剩 ACCESS_DENIED → NOT_FOUND → NOT_A_FILE 三步；`MergeErrorCode` 保留 `'UNSUPPORTED_FILE_TYPE'`。注释去掉该码并说明家族判定在 `buildMergeSession`。 |
| `src/core/text/probe.test.ts` | 新增 `describe('isTextProbe')` 块（建议 L185 之后） | 复用 `GBK_CJK_LINE`（L185 附近）与 `probeTextBytes` | 用例：UTF-8 / UTF-8 BOM / UTF-16LE / UTF-16BE / GBK 正文 → `true`；`Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52])`（PNG 头 + IHDR 长度字段的 NUL）→ `false`；空字节 → `false`（`encoding === 'Unknown'`）。 |
| `src/shared/fileExtensions.test.ts` | **新建**（L1-L80） | `extensionFamily` / `resolveFileFamily` | 用例：`engine.ts`→`code`、`a.csv`→`csv`、`a.tsv`→`tsv`、`a.JSON`→`json`、`a.yml`→`yaml`、`Makefile` / `.gitignore` / `LICENSE`→`code`、`a.vue` / `a.bin`→`null`；`resolveFileFamily('a.vue','text')==='code'`、`('a.vue','binary')===null`、`('a.bin','text')==='code'`；`resolveFileFamily('a.ts','binary')==='code'`（已知扩展名忽略内容）。 |
| `src/shared/compareRequest.test.ts` | 改 L354-L366（`rejects unsupported file families…` 整块） | 复用 `staticProbe`（L26-L41） | 新用例改为「未知扩展名不再在校验阶段被拒」：`a.bin/b.exe` → `ok === true`，且 `probe.calls` 仍只有两次 `statPath`（**零新增读取**）。同时补一条「校验阶段不读文件」断言（`PathProbe` 只有 `statPath`，本身即证明）。 |
| `src/shared/mergeRequest.test.ts` | 改 L53-L62（优先级用例） | 复用 `probeOf` / `failureOf` | 删掉 `UNSUPPORTED_FILE_TYPE` 那一档（`base.bin` 现在 `ok: true`），优先级断言改为 `ACCESS_DENIED → NOT_FOUND → NOT_A_FILE`；新增一条「未知扩展名三个文件通过校验」。 |
| `src/renderer/src/workbench/directoryCompare.ts` | L15-L21 import、L23-L44 错误类型（`FilePairErrorCode` **L24**）、L404-L419 `requireComparableFile`、L421-L440 `readOpenedSide`、L442-L486 `openFilePairSession`、L353-L383 `openDrilldownSession` | 见 §4.2 伪代码 | `FilePairErrorCode` 改 `'UNSUPPORTED_FILE_TYPE' \| 'mixed-family'`（`'unsupported-type'` 字面量在 `Workbench.tsx:310` 与 `directoryCompare.test.ts:158` 两处同步改）；`FilePairErrorParams` 增 `side?: 'left' \| 'right'`；`readOpenedSide(platform, path, probe: boolean, prefetched?: TextFileProbe)`；`openDrilldownSession(platform, parentId, node, sides)` **去掉 `target` 形参**（判定内移）。 |
| `src/renderer/src/workbench/mergeSession.ts` | L15-L38（错误类型 + 键表）、L76-L110 `buildMergeSession`、L112-L118 `mergeSessionErrorMessage` | `MergeSessionErrorCode = 'READ_FAILED' \| 'UNSUPPORTED_FILE_TYPE'`；`MergeSessionError(code, side, message, path = '')`；`mergeSessionErrorMessage(cause, t)` | `MERGE_ERROR_KEYS` 增 `UNSUPPORTED_FILE_TYPE: 'shell.merge.error.UNSUPPORTED_FILE_TYPE'`；错误文案参数补 `path`（用 `baseName(path)`，不得回显绝对路径 —— 既有测试 `not.toContain(root)` 仍须绿）。已知扩展名继续走 `readTextFile`（`mergeSession.test.ts` 的 `realFilePort` 只开 `readTextFile` 通道，天然证明零探测）。 |
| `src/renderer/src/workbench/Workbench.tsx` | L74 import、**L304-L325** `filePairErrorMessage`（`if (cause.code === 'unsupported-type')` 在 **L310**）、**L1284-L1312** `openFile`（早退块 **L1296-L1300**：`classifyFile` + `unsupportedDrilldown`）；在 L326 之后新增 `openFileFailureNotice` | `filePairErrorMessage(cause, t)`；`function openFileFailureNotice(cause: unknown, displayPath: string, t: Translate): Notice` | `filePairErrorMessage`：`code === 'UNSUPPORTED_FILE_TYPE'` → `t('shell.compare.error.UNSUPPORTED_FILE_TYPE', { side: cause.params.side ? t(cause.params.side === 'left' ? 'common.side.left' : 'common.side.right') : '', path: cause.params.name ?? '' })`（`common.side.left/right` 已存在于 zh/common.ts L20-L21、en/common.ts L18-L19；与 `NewCompareDialog.sideKey` L85-L87 同键）。`openFile`：删 L1296-L1300 的 `const target = classifyFile(...)` 早退块；没有 `target` 后 `openDrilldownSession(platform, source.id, node, current)`；catch 改 `report(openFileFailureNotice(cause, node.relativePath, t))`，其中该 helper 先试 `FilePairError('UNSUPPORTED_FILE_TYPE')` → `copyNotice('shell.notice.unsupportedDrilldown', { name: cause.params.name ?? displayPath })`，否则回落 `snapshotContentNotice(cause, displayPath)`。`openFilePair` / `openCompareRequest` / `openMergeRequest`（L1089-L1157）**不改**。 |
| `src/renderer/src/workbench/NewCompareDialog.tsx` | L4 删 import；L136-L198 `describeResolveIssue` | `describeResolveIssue(code, paths, platform, t)` 签字不变 | 删 L188-L195 的 `UNSUPPORTED_FILE_TYPE` 侧别反推分支（`isSupportedComparisonFile` 已不存在；侧别现在来自打开链路的探测结果）。`COMPARE_ERROR_KEYS`（L33-L45）与 `MERGE_ERROR_KEYS`（L47-L53）**保留全部键**（`Record<…>` 完整性 + 打开链路复用）。L259-L273 / L321-L328 提交链路不改。 |
| `src/renderer/src/i18n/messages/zh/shell.ts` | L38-L39、L113-L114、L167-L168、L174-L175 | 键名不变 | 新文案（见 §5）。`shell.file.error.unsupported` 随打开链路改用 compare 键后**删除**（zh/en 同批删，parity 保持）；`shell.file.error.mixed` 不动。 |
| `src/renderer/src/i18n/messages/en/shell.ts` | L47-L48、L132-L133、L193-L194、L203-L204 | 键名不变 | 与 zh 同键同删。 |
| `src/renderer/src/workbench/directoryCompare.test.ts` | L71-L90（`classifyFile` 映射）、L100-L108（`stubPlatform`，需补 `probeTextFile`）、L148-L160（mixed / unsupported 用例） | 复用 `stubPlatform` + `probeTextBytes` | 新增：未知扩展名文本对 → `scene: 'code'`、`probes.left.encoding` 与 `probeTextBytes(body)` 一致、`probeTextFile` 每侧恰好 1 次；未知扩展名 + 二进制 → `code: 'UNSUPPORTED_FILE_TYPE'` 且 `params.side` 为 `'left'`/`'right'`（左右对调再断言一次）；未知文本 + `.json` → `'mixed-family'`；`.bin` 文本内容现在**可打开**（旧断言反转）。`classifyFile('archive.bin')` 仍为 `null`（保留）。 |
| `src/renderer/src/workbench/mergeSession.test.ts` | L25-L30（`realFilePort` 补 `probeTextFile` 分支）、L45-L60 之后新增块 | `buildMergeSession` | 新增：三个 `.vue` 文本 → `scene:'code'`、`merge.base.text` 正确；`.vue` 二进制（PNG 头）→ `MergeSessionError{ code:'UNSUPPORTED_FILE_TYPE', side }`，`mergeSessionErrorMessage` 含侧别与文件名、不含绝对路径；已知 `.txt` 三件套的 `readTextFile` 通道断言保持（零 probe）。 |
| `src/open-pair-probe.test.ts` | L52（`TARGET` 常量）、L82-L101、L102-L121 | `openFilePairSession` / `openDrilldownSession` | `openDrilldownSession` 去掉 `TARGET` 实参；新增一条「未知扩展名文本对：`probeCalls` 长度 === 2、`session.probes` 与同一次 `base.probeTextFile` 全等、`readCalls` 为空」；补一条「未知扩展名二进制：抛 `UNSUPPORTED_FILE_TYPE` 且 `probeCalls` 每侧仍为 1」。 |
| `src/renderer/src/App.test.tsx` | L1028-L1040（`reports an unsupported extension…`）、L1680-L1696（`lists the supported families…`） | `mountWorkbench` / `scriptedPort` / `createWebPlatformPort` / `writeFiles` | 两个用例按新口径改写：写入**二进制字节**（PNG 头 + 含 NUL 的 IHDR 区）才断言拒绝，文案改为「扩展名无法识别…二进制文件不支持」并含侧别/文件名；另新增三例：手动路径框两个 `.vue` 文本 → 代码双栏 + 状态栏编码；目录树双击 `.vue` 文本 → 代码视图（不再出现「不支持的打开类型」）；GBK 未知扩展名 → 正文中文 + 状态栏 `GBK`。 |

### 4.2 `openFilePairSession` 目标流程（伪代码，Coding 照此实现）

```ts
export async function openFilePairSession(platform, leftPath, rightPath): Promise<WorkbenchSession> {
  const sides = [
    { side: 'left'  as const, path: leftPath,  name: baseName(leftPath)  },
    { side: 'right' as const, path: rightPath, name: baseName(rightPath) }
  ]
  // 1) 家族：已知扩展名零读取；未知扩展名各读一次（并行）
  const resolved = await Promise.all(sides.map(async (s) => {
    const known = extensionFamily(s.path)
    if (known !== null) return { ...s, family: known, probe: undefined }
    const probe = await platform.probeTextFile(s.path)      // ← 该侧唯一一次读取
    return { ...s, family: contentFamily(s.path, probe), probe }
  }))
  // 2) 二进制优先、左侧优先（ac-side-attribution 的确定性来源）
  for (const r of resolved) {
    if (r.family === null) throw new FilePairError('UNSUPPORTED_FILE_TYPE',
      { side: r.side, name: r.name }, `Unsupported file type: ${r.name}.`)
  }
  // 3) 家族一致性（未知文本 = code，因此 .vue + .json 仍 mixed-family）
  if (resolved[0].family !== resolved[1].family) throw new FilePairError('mixed-family', { … }, …)
  // 4) 正文：code 用已探测结果（无预取时 probeTextFile，保持现状），csv/structured 用 readTextFile
  const read = (r) => resolved[0].family === 'code'
    ? (r.probe ? { text: r.probe.text, facts: stripPath(r.probe) } : readOpenedSide(platform, r.path, true))
    : readOpenedSide(platform, r.path, false)
  …
}
```

要点：
- `Promise.all` 并行读两侧；失败侧（`probeTextFile` reject）**原样抛出**，不得吞成「不支持」。
- 二进制判定在混合家族判定**之前**（ac-unknown-binary-rejected 优先于 mixed-family）。
- `FilePairError` 的 `message` 保持英文诊断串（与既有 `unsupported-type` / `mixed-family` 一致），界面文案一律走 `filePairErrorMessage`。

### 4.3 `openDrilldownSession` 目标流程（伪代码）

```ts
export async function openDrilldownSession(platform, parentId, node, sides): Promise<WorkbenchSession> {
  const byExtension = extensionFamily(node.name)
  if (byExtension !== null) {                       // 已知扩展名 / 无扩展名：行为不变
    const target = classifyFamily(byExtension)
    return build(target, /* 无预取 */)
  }
  const decisionPath = node.leftPath ?? node.rightPath     // 两个真实侧取左优先
  if (decisionPath === undefined) {                         // 两侧都不存在：无内容可判，按 code 打开空正文（现状）
    return build(classifyFamily('code'), undefined)
  }
  const decisionSide = node.leftPath !== undefined ? 'left' : 'right'
  const first = await readSideFileProbe(platform, sides, decisionPath)   // ← 复用既有单读探测
  const family = contentFamily(node.name, { text: first.text, encoding: first.facts.encoding })
  if (family === null) throw new FilePairError('UNSUPPORTED_FILE_TYPE',
    { side: decisionSide, name: node.name }, `Unsupported file type: ${node.name}.`)
  return build(classifyFamily(family), { [decisionSide]: first })        // 该侧不再重读
}
```

`build(target, prefetched)` 内部：`read(side)` 先查 `prefetched[side]`，否则 `target.kind === 'code' ? readSideFileProbe(...) : { text: readSideFile(...) }`（与现状 L366-L374 等价）。

## 5. 文案（zh / en 逐条，键名不变）

| 键 | zh | en |
| --- | --- | --- |
| `shell.compare.error.UNSUPPORTED_FILE_TYPE` | `不支持的文件类型：{side}「{path}」。扩展名无法识别时按内容判断，二进制文件不支持。` | `Unsupported file type: {side} "{path}". When the extension is unknown the content is checked; binary files are not supported.` |
| `shell.merge.error.UNSUPPORTED_FILE_TYPE` | 同上句（`{side}` / `{path}`） | 同上句 |
| `shell.notice.unsupportedDrilldown` | `「{name}」无法按文本打开：扩展名无法识别时按内容判断，二进制文件不支持。` | `Cannot open "{name}" as text: when the extension is unknown the content is checked, and binary files are not supported.` |
| `shell.file.error.unsupported` | **删除**（打开链路改用 compare 键） | 删除 |

> `shell.file.error.mixed`、`shell.snapshot.error.*`、`shell.merge.error.READ_FAILED` 一律不动。

## 6. 测试分层（ac → 层 → 命令）

L1 = 纯逻辑/状态单测（`src/core`、`src/shared`，无 IO）；L2 = 进程内接口 / 内存平台 / headless 组件 / 本地真实 FS（vitest + jsdom + 真实 IPC handler）；L3 = 真实窗口/CDP 由 PO 在 Ops 按需发起，**不进 code_gates**。

| ac | 层 | 落点 | 断言要点 |
| --- | --- | --- | --- |
| ac-unknown-text-opens | L1 家族 + L2 打开/DOM | `fileExtensions.test.ts`、`directoryCompare.test.ts`、`App.test.tsx`、`open-pair-probe.test.ts` | 校验 `ok`；`scene === 'code'`；正文/行数正确；`probes.left.encoding === 'UTF-8'`；无 `UNSUPPORTED_FILE_TYPE` |
| ac-unknown-binary-rejected | L1 + L2 | `probe.test.ts`(PNG 头)、`directoryCompare.test.ts`、`App.test.tsx` | `FilePairError.code === 'UNSUPPORTED_FILE_TYPE'`；`params.side`/`name` 正确；无新 tab、无 `UNSUPPORTED` 以外的空会话 |
| ac-gbk-shape-guard | L1 | `probe.test.ts` | 「整体可 GBK 解码但含非布局 NUL」→ `isTextProbe === false` |
| ac-unknown-gbk-text-opens | L1 + L2 | `probe.test.ts`（GBK 正文）、`App.test.tsx` | 正文为解码中文；状态栏 `GBK` |
| ac-side-attribution | L2 | `directoryCompare.test.ts`（左右对调两次） | 侧别来自探测结果，`params.side` 随内容左右翻转 |
| ac-known-ext-no-probe | L1 + L2 | `compareRequest.test.ts`（零读取）、`open-pair-probe.test.ts`、`mergeSession.test.ts` | 判定函数（`isTextProbe` / `contentFamily`）调用 0 次；`probeTextFile` 次数与现状相同（code 对 2、csv 对 0、合并 txt 3 → 0 probe） |
| ac-single-read-unknown | L2 | `open-pair-probe.test.ts`（真实磁盘 + 计数 `probeCalls`）、`directoryCompare.test.ts` | `probeCalls` 每侧恰好 1；`session.probes` 与同一次 `base.probeTextFile` **完全相等**；`readCalls` 为空 |
| ac-drilldown-unknown-opens | L2 | `open-pair-probe.test.ts`、`App.test.tsx`（双击树行） | 打开代码 tab；二进制给 `shell.notice.unsupportedDrilldown` 且无空会话 |
| ac-merge-unknown-opens | L2 | `mergeSession.test.ts` | 三个未知扩展名文本 → 合并视图；任一二进制 → 侧别 + 文件名，无 tab |
| ac-mixed-family-unchanged | L1 + L2 | `fileExtensions.test.ts`、`directoryCompare.test.ts` | 未知文本(code) + csv/json/yaml/tsv → `mixed-family`；未知文本 + `.ts` → 正常 |
| ac-extensionless-unchanged | L1 + L2 | `fileExtensions.test.ts`、`directoryCompare.test.ts` | `Makefile` / `.gitignore` / `LICENSE` → `code`，`extensionFamily` 非 null（**不触发内容兜底**） |
| ac-copy-updated | L1（词典） | i18n 既有 parity/键集测试 + `App.test.tsx` 文案断言 | zh/en 键集合相等；文案不再宣称「仅支持代码/文本、CSV/TSV、JSON/YAML」 |
| ac-single-decision-source | 结构 + L1 | `fileExtensions.test.ts`、`pnpm lint` | `isSupportedComparisonFile` / `SUPPORTED_FILE_EXTENSIONS` 删除；`classifyFile`、`openFilePairSession`、`openDrilldownSession`、`buildMergeSession` 只调 `extensionFamily` / `resolveFileFamily` / `isTextProbe`；`rg "SUPPORTED_FILE_EXTENSIONS\|isSupportedComparisonFile" src` 零命中 |
| ac-gates-green | L2 | `pnpm lint && pnpm typecheck && pnpm test`；聚焦 `pnpm test src/shared/compareRequest.test.ts` | 全绿（另可单跑 `pnpm test src/core/text/probe.test.ts src/shared/fileExtensions.test.ts src/renderer/src/workbench/directoryCompare.test.ts src/renderer/src/workbench/mergeSession.test.ts`） |

> `.munk/code-gates.json` **不新增条目**（遵循 PRD）；`test-compare-request` 仍是本项聚焦门。

## 7. Testability by design（不依赖系统对话框的直接入口）

本项显式保留 / 依赖四条绕过 OS 选择器的入口，供后台单窗口自动化与键盘高频繁用户使用：

1. **应用内手动路径框**（`NewCompareDialog`，`Cmd/Ctrl+N`）：粘贴左右路径 + Enter，全链路免系统面板；本轮所有未知扩展名验收都可用它。
2. **启动参数**：`opencompare --left /tmp/a.vue --right /tmp/b.vue`（或两个位置参数），走 `main/launch.ts → resolveCompareRequest`。
3. **URL scheme**：`opencompare://compare?left=…&right=…`。
4. **Web 渲染模式**（`pnpm dev:web`）/ headless DOM 测试：内存平台 `createWebPlatformPort()` + `writeFiles` 直接投喂字节，无需任何原生面板（App.test 已用此路径）。

合并入口同样有手动（对话框 merge 模式）与启动参数两条免面板路径。**不新增** IPC 通道 / `PlatformPort` 方法，因此无需扩展 preload 白名单。

## 8. 风险与护栏

| 风险 | 影响 | 护栏 |
| --- | --- | --- |
| 校验层不再拒绝未知扩展名 → 旧用例（`a.bin` 被拒）变红 | 中等（已知失败面） | §4.1 已列出 `compareRequest.test.ts` / `mergeRequest.test.ts` / `App.test.tsx` / `directoryCompare.test.ts` 四处需按新口径改写；Coding 一次改完再跑全量。 |
| `UNSUPPORTED_FILE_TYPE` 由「校验失败」变为「打开失败」 | 对话框内该失败以 `kind: 'detail'` 呈现（文案与侧别一致），不再是结构化 `{side, path}` | 文案走 `shell.compare.error.UNSUPPORTED_FILE_TYPE`（含 `{side}`+`{path}`），launch 路径 `report(detailNotice(message))` 也是同一句；若需结构化可在后续迭代再收口，本轮不扩 `CompareOpenOutcome`。 |
| 未知扩展名大文件：判定 = 整读 | 内存/耗时与「按文本打开」相同（本来就要整读） | 不引入采样窗口（PRD 非目标）；`probeTextFile` 已是单次缓冲实现，未新增第二份拷贝；`facts` 只存标量。 |
| 快照侧未知扩展名 | 快照未内联该文件 → `content-not-inlined` 提示（与现状 code 文件一致） | `inlinesDrilldownText` 保持 `classifyFile(...) !== null`（PRD 非目标：不改快照内联策略）；`openFileFailureNotice` 先试 `snapshotContentNotice` 再回落。 |
| `decodeText` 对 UTF-16 只按 BOM 解码（宽松） | 极端非法 UTF-16 可能被当文本 | 与 PRD 口径一致（编码 ∈ 五类 + 无布局外 NUL 即文本）；不做额外校验。 |
| 二进制但无 NUL（如部分 JPEG）被当文本 | 可能打开乱码 | 属 PRD 明确口径（非目标：不做 magic/MIME）；不额外加阈值。 |
| 侧别顺序 | ac-side-attribution 要求左右对调翻转 | 固定「左侧优先」遍历 `resolved`，测试左右各跑一次。 |
| 双份判定残留 | ac-single-decision-source 结构性失败 | 删除 `isSupportedComparisonFile` / `SUPPORTED_FILE_EXTENSIONS` / `fileKinds.extensionOf` / `compareRequest.unsupportedFileMessage`；集中断言见 §6 最后一行。 |

## 9. 明确不做（守住 PRD 非目标）

- 不扩扩展名白名单（不加 `.vue` / `.svelte` / `.dart`）。
- 不做 CSV/TSV/JSON/YAML 内容识别，未知扩展名只进 `code`。
- 不改目录扫描 / 四态 / 报告 / 快照内联 / 同步 / 编辑保存 / 合并写回 / 语法高亮 / 版本号 / README / release。
- 不改 `fileIO.ts` 的对话框过滤器预设（是选择器预设，不是判定；改动会漂移既有选择器行为）。
- 不新增 `.munk/code-gates.json` 条目、不新增 IPC 通道、不新增 `PlatformPort` 方法、不新增 vitest 配置。

## 10. Coding 自检清单（提测前逐条打勾）

1. `rg "isSupportedComparisonFile|SUPPORTED_FILE_EXTENSIONS|extensionOf|unsupportedFileMessage" src` → 零命中。
2. `rg "probeTextFile" src/renderer/src/workbench` → 只在 `directoryCompare.ts`（2 处：未知扩展名判定、code 家族既有读取）、`mergeSession.ts`（1 处）、`snapshotOps.ts`（既有）、`Workbench.tsx`（既有）出现，且没有任何「先探测再整读」的连续调用。
3. `pnpm typecheck` 通过（`FileKind` 别名化后所有 import 无破坏）。
4. `pnpm lint` 通过（无未使用 import：`classifyFile` / `isSupportedComparisonFile` 的残留）。
5. `pnpm test src/shared/compareRequest.test.ts` 绿（聚焦门）。
6. `pnpm test` 全量绿；重点确认 `open-pair-probe`、`mergeSession`、`directoryCompare`、`App`、i18n parity 五个套件。
7. 手动冒烟（免面板）：`Cmd+N` 输入两个 `.vue` 文本 → 代码双栏 + 状态栏 `UTF-8`；把右侧换成 PNG 字节 → 提示指向右侧且无新 tab。
