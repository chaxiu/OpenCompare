# 换行 / 编码探测与解码纯函数 + 平台探测通道

## 范围

本项是 I#9「文本比较：换行符与编码归一」的地基，只做**可单测的确定性探测 / 解码能力 + 一条平台探测通道**，不做任何 UI 与比较判定改动。

1. **core 纯函数层**（`src/core/text/`，零 Electron / React / DOM 依赖，可被 vitest 在 Node 环境直接单测）
   - 换行探测：`detectNewline(text)` → `NewlineKind = 'CRLF' | 'LF' | 'CR' | 'Mixed' | 'None'`。
   - 编码探测：`detectEncoding(bytes)` → `EncodingLabel = 'UTF-8' | 'UTF-8 BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK' | 'Unknown'`，判定顺序固定为 BOM → 无 BOM UTF-16 → 严格 UTF-8 → GBK → Unknown，无随机、无概率猜测。
   - 解码：`decodeText(bytes)` 一次返回 `{ text, encoding }`；BOM 从结果文本中剥离，Unknown 走 UTF-8 替换解码（含 U+FFFD）而不是抛错。
   - 一次性探测：`probeTextBytes(bytes)` 返回解码文本 + 编码 + 换行 + 字节长度 + 字节指纹（SHA-256），全部由同一份字节得出。
2. **shared 契约层**（`src/shared/platform/`）
   - `PlatformPort` 新增 `probeTextFile(path): Promise<TextFileProbe>`；`TextFileProbe` 至少含 `path / text / encoding / newline / bytes / sha256`。
   - 白名单 channel 新增且仅新增 `probeTextFile` 一项。
3. **平台实现层**
   - `src/main/platform/electron-platform.ts`：一次读取原始字节 → 调用同一 core 纯函数 → 返回探测结果；内置样本（内存 UTF-8 文本）走同一路径。
   - `src/preload/index.ts`：只把该 channel 加入白名单桥接，不暴露文件系统能力。
   - `src/renderer/src/platform/web-platform.ts`：同签名实现，内存文本按 UTF-8 编码为字节后走同一纯函数。
   - `readTextFile` / `readFileBytes` 现有语义与返回值**完全不变**。
4. **测试与证据**：core 纯函数单测（BOM / 无 BOM UTF-16 / GBK / Unknown、CRLF / LF / CR / Mixed / None）、Electron 真实磁盘字节文件探测测试、web 平台同签名与样本挂载测试、preload 面量断言更新。

## 验收

- ac-newline-crlf: 只含 `\r\n` 终止符的文本 → `detectNewline` 返回 `CRLF`（`\r\n` 计为一个终止符，不被拆成 CR + LF）。
- ac-newline-lf: 只含 `\n` 终止符的文本 → 返回 `LF`；单行无终止符文本与空字符串 → 返回 `None`。
- ac-newline-cr: 只含孤立 `\r` 终止符的文本 → 返回 `CR`。
- ac-newline-mixed: 同时出现两种及以上终止符风格（如 `\r\n` 与孤立 `\n`，或 `\r\n` 与孤立 `\r`）→ 返回 `Mixed`。
- ac-bom-detection: `EF BB BF` 开头 → `UTF-8 BOM`；`FF FE` 开头 → `UTF-16LE`；`FE FF` 开头 → `UTF-16BE`；三者解码后文本均不以 U+FEFF 开头（BOM 已剥离），且 BOM 判定优先于任何后续启发式。
- ac-utf16-no-bom: 无 BOM 的 ASCII 主导 UTF-16 文本（NUL 字节稳定落在同一奇偶位且占比达到函数内固定阈值）判定为 `UTF-16LE` / `UTF-16BE`，且解码文本与原始 ASCII 文本逐字符相等；NUL 分布不满足该阈值的数据不得被判为 UTF-16。
- ac-strict-utf8: 合法 UTF-8（含多字节 CJK、无 BOM）→ `UTF-8` 且解码文本与原文完全相等；非法 UTF-8（孤立 `0x80`、截断多字节序列）一律不得报 `UTF-8`。
- ac-gbk-detection: 含至少一个双字节字符的合法 GBK 字节序列（如「中文\n」的 GBK 编码）→ `GBK`，且解码文本与原文（含中文）相等；纯 ASCII 字节序列不报 `GBK`（应报 `UTF-8`）。
- ac-encoding-unknown: 既非合法 UTF-8 也非合法 GBK 的字节（如连续 `0xFF`）→ `Unknown`，解码不抛错且结果含 U+FFFD；同一输入重复调用返回同一编码标签与同一文本（无随机）。
- ac-encoding-order: 有序判定成立且可断言：BOM 优先于 UTF-16 / UTF-8 / GBK；无 BOM UTF-16 优先于「该字节序列恰好也是合法 GBK 单字节流」的情形（如 `68 00 65 00 6C 00 6C 00 6F 00` 判 `UTF-16LE`，不判 `GBK`）。
- ac-gbk-decoder-degradation: 运行时不提供 GBK 解码器时（测试注入一个对 `gbk` 抛错的解码器工厂），探测确定性返回 `Unknown` 并走替换解码，不抛异常、不猜成 `UTF-8`。
- ac-probe-single-call: `probeTextBytes(bytes)` 一次调用同时返回 `text / encoding / newline / bytes / sha256`；`bytes` 等于输入字节长度，`sha256` 等于原始字节的 SHA-256（与 `@core/directory/hash` 的 `sha256Bytes` 及已知常量对拍），`newline` 由解码文本计算。
- ac-port-signature-parity: `PlatformPort.probeTextFile(path)` 在 `electron` 与 `web` 两个实现上同签名、返回同形状 `TextFileProbe`；preload 暴露的键集合只新增 `probeTextFile` 一项，白名单 channel 只新增 `platform:probe-text-file` 一项。
- ac-sample-mount-probe: 对内置样本路径调用 `probeTextFile` 不报错，返回 `encoding === 'UTF-8'`、`bytes` 等于该样本文本 UTF-8 编码长度、`sha256` 等于该 UTF-8 字节的 SHA-256，`text` 与该样本 `readTextFile` 结果一致。
- ac-external-file-probe: 在 Electron 平台的测试里用临时目录写出真实文件（UTF-8 + CRLF、UTF-8 BOM + LF、UTF-16LE + CRLF、GBK + LF），`probeTextFile` 对每个绝对路径返回对应 `encoding` / `newline` / `bytes`（等于磁盘文件大小）与可复算的 `sha256`。
- ac-single-read-per-probe: 主进程探测对单个路径只读取一次原始字节（通过可注入的字节读取器断言调用次数恰为 1），解码、换行探测与指纹均复用同一份缓冲。
- ac-readtextfile-unchanged: `readTextFile` 的既有行为不变：对 UTF-8 文本仍返回原文，对现有 `App` / `web-platform` / `electron-platform` 既有断言零回归；新增探测通道不影响任何既有调用点。
- ac-suite-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿，`src/shared/platform/channels.test`（或等价面量断言）与 preload 键集合断言随新增通道更新后仍通过。

## 非目标

- 不做换行归一函数、不改 `splitLines`、不改三向合并，不改任何比较判定或差异计数。
- 不做「忽略换行 / 忽略编码」两个开关，不碰代码双栏视图、工具栏、状态栏与词典文案。
- 不做会话模型携带探测事实、不固化探测结果到快照、不做比较结果缓存。
- 不做转码写回 / 「保存为原编码」、不改导出 / 报告 / 快照格式、不改目录四态。
- 不改 `readTextFile` 语义，不删除或收窄任何既有 `PlatformPort` 方法。
- 不引入网络、云服务或新外部服务；不引入新依赖，除非运行时确实缺少 `TextDecoder('gbk')`（届时最多新增一个纯 JS 解码依赖）。
- 不 bump 版本，不改 README / CHANGELOG / release notes，不动 tag / Release / 资产。
- 不新增顶层入口或顶栏动作；本项不含任何界面可操作性验收（`needSelfTest=false`）。
- 不在本项新增 `code-gates.json` 门禁条目；可回归性由既有 `test` 门（全量 vitest）承担，WorkSet 约定的单条新门由后续比较子项新增。
- 不通过放宽 lint / typecheck / 测试来凑绿。

## 实现约束

- 复用既有基础设施：字节指纹直接复用 `src/core/directory/hash.ts` 的 `sha256Bytes`（纯 JS、跨运行时可跑），不引入 `node:crypto` 或 WebCrypto。
- 编码标签与换行标签的联合类型以 core 纯函数模块为唯一来源，`src/shared/platform/types.ts` 只以 `import type` 引用，避免主进程 / preload / renderer 各留一份字面量。
- GBK 解码优先用运行时 `TextDecoder('gbk')`（Electron 37 / Node 官方构建带 full ICU，浏览器同样支持）；纯函数需提供可注入的解码器工厂以便单测钉住降级行为，默认实现即运行时 `TextDecoder`。
- 无 BOM UTF-16 的 NUL 占比阈值与 GBK 合法性边界只在 core 纯函数里定义一次，UI 层与本项之外不得另设阈值。
- 主进程探测沿用现有错误包装（`readableFailure` 一类），样本路径与真实路径走同一函数；样本无磁盘字节，按其内存文本的 UTF-8 编码参与探测。
- web 运行时无原始字节，以内存文本的 UTF-8 编码作为字节来源，保证与 Electron 同签名、同纯函数路径。
- 探测范围有界：单个路径一次读取、一次解码；不预读、不整目录扫描、不缓存。
- 只允许改动本项范围内的文件：`src/core/text/**`、`src/shared/platform/**`、`src/main/platform/**`、`src/preload/**`、`src/renderer/src/platform/**`，以及随新增通道必须同步的既有面量断言。
- 证据落在测试内可复现：真实字节文件由测试自身用 `Buffer` 生成到临时目录，断言里记录绝对路径生成方式与字节数，保证可重跑。
