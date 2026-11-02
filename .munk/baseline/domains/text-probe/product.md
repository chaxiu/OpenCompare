# Domain: text-probe

文本字节探测域：从**同一份原始字节**确定性导出「编码标签 + 解码文本 + 换行风格 + 字节长度 + 字节指纹」的能力，以及把它暴露为一条平台探测通道。本域是「文本比较：换行符与编码归一」的地基，只提供可单测的探测 / 解码纯函数与平台缝，**不含任何 UI、比较判定、归一化或转码写回**。平台缝白名单形态归 `foundation`，字节摘要原语归 `content-digest`，本域只组合它们。

## 范围

- **core 纯函数层（`src/core/text/`，零 Electron / React / DOM，可由 vitest 在 Node 直接单测）**：
  - 换行探测 `detectNewline(text): NewlineKind`，取值 `'CRLF' | 'LF' | 'CR' | 'Mixed' | 'None'`；`\r\n` 计为**一个** CRLF 终止符，不再额外计孤立 CR。
  - 编码探测 `detectEncoding(bytes): EncodingLabel`，取值 `'UTF-8' | 'UTF-8 BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK' | 'Unknown'`；判定顺序固定为 BOM → 无 BOM UTF-16 → 严格 UTF-8 → GBK → Unknown，无随机、无概率猜测。
  - 解码 `decodeText(bytes)` 返回 `{ text, encoding }`：BOM 从文本中剥离；`Unknown` 走 UTF-8 替换解码（含 U+FFFD）而非抛错。
  - 一次性探测 `probeTextBytes(bytes)` 返回 `{ text, encoding, newline, bytes, sha256 }`，五个字段全部由同一份字节得出。
  - 阈值与边界单点：无 BOM UTF-16 的 NUL 占比阈值、GBK 合法字节区间只在此模块定义一次，外部不得另设阈值。
  - 可注入解码器工厂（默认运行时 `TextDecoder`），用于钉住「运行时不提供 GBK 解码器」时的降级行为。
- **shared 契约层（`src/shared/platform/`）**：`PlatformPort` 新增且仅新增 `probeTextFile(path): Promise<TextFileProbe>`，`TextFileProbe` 在探测结果上补 `path`；编码 / 换行联合类型以 core 模块为唯一来源，shared 只 `import type`。通道 `platform:probe-text-file` 只登记在 `PLATFORM_CHANNELS` 单一来源。
- **平台实现层**：Electron 一次读取原始字节（`/samples/**` 按样本内存文本的 UTF-8 编码）后调用同一 core 纯函数返回结果，内置样本与真实路径共用同一函数；Web 内存实现同签名，按内存文本 UTF-8 编码为字节后走同一纯函数；preload 只把该 channel 加入白名单转发，不额外暴露文件系统能力。`readTextFile` / `readFileBytes` 的既有语义与返回值完全不变。

## 验收

- **ac-newline-crlf**：只含 `\r\n` 终止符的文本返回 `CRLF`，且每个 `\r\n` 只计一个终止符（不被拆成 CR + LF）。
- **ac-newline-lf**：只含 `\n` 终止符返回 `LF`；单行无终止符文本与空字符串返回 `None`。
- **ac-newline-cr**：只含孤立 `\r` 终止符返回 `CR`。
- **ac-newline-mixed**：同时出现两种及以上终止符风格（`\r\n` 与孤立 `\n`，或 `\r\n` 与孤立 `\r`）返回 `Mixed`。
- **ac-bom-detection**：`EF BB BF` → `UTF-8 BOM`，`FF FE` → `UTF-16LE`，`FE FF` → `UTF-16BE`；三者解码文本均不以 U+FEFF 开头，且 BOM 判定优先于任何后续启发式。
- **ac-utf16-no-bom**：ASCII 主导的无 BOM UTF-16（NUL 字节稳定落在同一奇偶位并达到函数内固定阈值）判为 `UTF-16LE` / `UTF-16BE`，解码文本与原始 ASCII 逐字符相等；NUL 分布不达阈值的数据不得判为 UTF-16。
- **ac-strict-utf8**：合法 UTF-8（含多字节 CJK、无 BOM）返回 `UTF-8` 且解码文本与原文完全相等；非法 UTF-8（孤立 `0x80`、截断多字节序列、overlong / 代理区 / 超 U+10FFFF）一律不得报 `UTF-8`。
- **ac-gbk-detection**：至少含一个双字节字符的合法 GBK 序列（如「中文\n」的 GBK 编码）返回 `GBK` 且解码文本含原文中文；纯 ASCII 不报 `GBK`（报 `UTF-8`）。
- **ac-encoding-unknown**：既非合法 UTF-8 也非合法 GBK 的字节（如连续 `0xFF`）返回 `Unknown`，解码不抛错且结果含 U+FFFD；同一输入重复调用返回同一标签与同一文本。
- **ac-encoding-order**：顺序可断言：BOM 优先于 UTF-16 / UTF-8 / GBK；无 BOM UTF-16 优先于「同一字节流恰好也是合法 GBK 单字节流」（如 `68 00 65 00 6C 00 6C 00 6F 00` 判 `UTF-16LE`，不判 `GBK`）。
- **ac-gbk-decoder-degradation**：运行时不提供 GBK 解码器（测试注入对 `gbk` 抛错的工厂）时确定性返回 `Unknown` 并走替换解码，不抛异常、不猜成 `UTF-8`。
- **ac-probe-single-call**：`probeTextBytes(bytes)` 一次调用同时返回 `text / encoding / newline / bytes / sha256`；`bytes` 等于输入字节长度，`sha256` 等于原始字节 SHA-256（与 `content-digest` 的 `sha256Bytes` 及已知常量对拍），`newline` 由解码文本计算。
- **ac-port-signature-parity**：`PlatformPort.probeTextFile(path)` 在 Electron 与 Web 两实现同签名、返回同形状 `TextFileProbe`；preload 暴露键集合只新增 `probeTextFile` 一项，白名单 channel 只新增 `platform:probe-text-file` 一项。
- **ac-sample-mount-probe**：对内置样本路径探测不报错，返回 `encoding === 'UTF-8'`、`bytes` 等于样本文本 UTF-8 编码长度、`sha256` 等于该 UTF-8 字节的 SHA-256，`text` 与 `readTextFile` 结果一致。
- **ac-external-file-probe**：真实临时文件（UTF-8 + CRLF、UTF-8 BOM + LF、UTF-16LE + CRLF、GBK + LF）探测返回对应 `encoding` / `newline` / `bytes`（等于磁盘文件大小）与可复算 `sha256`。
- **ac-single-read-per-probe**：主进程对单个路径只读取一次原始字节（注入字节读取器断言调用恰为 1 次），解码、换行探测与指纹复用同一份缓冲。
- **ac-readtextfile-unchanged**：`readTextFile` 既有行为不变（UTF-8 文本仍返回原文），既有 `App` / `web-platform` / `electron-platform` 断言零回归，新增探测通道不影响任何既有调用点。
- **ac-suite-green**：`pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿，`channels` 面量断言与 preload 键集合断言随新增通道更新后仍通过。

## 非目标

- 不做换行归一函数、不改 `splitLines`、不改三向合并，不改任何比较判定或差异计数。
- 不做「忽略换行 / 忽略编码」开关，不碰代码双栏视图、工具栏、状态栏与词典文案。
- 不做会话模型携带探测事实、不固化探测结果到快照、不做比较结果缓存。
- 不做转码写回 / 「保存为原编码」、不改导出 / 报告 / 快照格式、不改目录四态。
- 不改 `readTextFile` 语义，不删除或收窄任何既有 `PlatformPort` 方法。
- 不引入网络、云服务或新外部服务；不引入新依赖（除非运行时的 `TextDecoder('gbk')` 缺失）。
- 不 bump 版本，不改 README / CHANGELOG / release notes，不动 tag / Release / 资产。
- 不新增顶层入口或顶栏动作；本项不含任何界面可操作性验收（`needSelfTest=false`）。
- 不在本项新增 `code-gates.json` 门禁条目；可回归性由既有全量 `test` 门承担。

## 实现约束

- 字节指纹复用 `src/core/directory/hash.ts` 的 `sha256Bytes`（纯 JS、跨运行时可跑），不引入 `node:crypto` 或 WebCrypto。
- 编码 / 换行联合类型只在 core 纯函数模块定义，`src/shared/platform/types.ts` 只以 `import type` 引用，禁止主进程 / preload / renderer 各留一份字面量。
- GBK 解码优先用运行时 `TextDecoder('gbk')`；探测必须**真正解码确认**（结果含替换字符即视为无效），解码器缺失或抛错时降级为 `Unknown`，不得仅凭字节形状报 `GBK`。
- 探测范围有界：单个路径一次读取、一次解码；不预读、不整目录扫描、不缓存。
- 主进程沿用现有错误包装（`readableFailure` 一类）；Web 运行时无原始字节，以内存文本的 UTF-8 编码作为字节来源，保证两平台同签名、同纯函数路径。
- 改动范围限定在 `src/core/text/**`、`src/shared/platform/**`、`src/main/platform/**`、`src/preload/**`、`src/renderer/src/platform/**`，以及随新增通道必须同步的既有面量断言。

## 最近交付证明

- WI：`wi_ws_51573dd10dcee210`（文本换行 / 编码探测与解码纯函数 + 平台探测通道；`kind: feature`）
- 日期：2026-11-02
- 结果：code_gates passed（22 gates，attempt 002，`.munk/runs/run_ws_86525261fb4af0ab/code-gates/attempts/002`；`pnpm test` 116 files / 1842 passed + 1 skipped（1843）；`needSelfTest=false`）。
- 覆盖摘要：新增 `src/core/text/probe.ts`（`detectNewline` / `detectEncoding` / `decodeText` / `probeTextBytes`，判定顺序 BOM → 无 BOM UTF-16 → 严格 UTF-8 → GBK → Unknown，GBK 以真实解码确认、解码器缺失降级 `Unknown`，BOM 剥离，`Unknown` 走 U+FFFD 替换）与 `probe.test.ts`；`PlatformPort` 新增且仅新增 `probeTextFile(path)`（`TextFileProbe = TextBytesProbe + path`），`PLATFORM_CHANNELS` 新增 `platform:probe-text-file`，preload 白名单转发并同步桥接表面清单；Electron 主进程一次读取原始字节后调用同一纯函数（`/samples/**` 按样本 UTF-8 编码、字节读取器可注入以断言单次读取）；Web 内存实现同签名，按内存文本 UTF-8 编码后走同一纯函数。`readTextFile` / `readFileBytes` 语义未变。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy；新增 `qa/text-encoding-newline-probe.md` 按本域 AC 落档（非 change-pack 用例）。证据来源：`src/core/text/probe.test.ts` 覆盖 BOM 三态 / 无 BOM UTF-16 双边 / 严格 UTF-8（含 overlong·截断·代理区）/ GBK 与纯 ASCII 反向 / Unknown 幂等 / 判定顺序 / GBK 解码器降级 / 单次调用五字段与 sha256 对拍；`electron-platform.test.ts` 覆盖真实临时文件四组合与样本挂载 / 单次读取；`web-platform.test.ts` 覆盖同签名与样本路径；`preload/index.test.ts` 与 `channels` 面量断言各 +1。
- 后续注意：① `Unknown` **不是错误**——它是「无法确认」的确定性结论，调用方必须容忍替换字符文本；把它改成抛错会让任何含非 UTF-8 字节的文件直接打不开；② 无 BOM UTF-16 的阈值与 GBK 字节区间只在 core 定义一次，后续「归一化 / 忽略编码」子项必须复用本域函数，不得在 UI 或比较层另立阈值；③ GBK 判定依赖真实解码确认，若为性能改成纯形状判断，会把「恰好符合 GBK 形状的 UTF-16 单字节流」误报（本条已由 ac-encoding-order 钉住）；④ 本域只产出探测事实，不写入会话模型也不缓存——比较开关与归一化落地属后续子项。
