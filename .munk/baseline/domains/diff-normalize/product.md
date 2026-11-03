# Domain: diff-normalize

文本比较的**判定层**：在既有行级 / 行内 diff 之上定义「忽略换行」与「忽略编码」两个比较开关（默认均开启），并把归一事实（换行标签、编码标签、字节差信号）与**唯一的** `differenceCount` 由同一次比较产出。本域只拥有判定语义与结果契约，不拥有探测事实（归 `text-probe`）、比较视图 / 工具栏 / 状态栏接线、差异渲染与会话模型。字节指纹与编码 / 换行标签一律复用 `text-probe` 的探测结论，不另立字面量或阈值。

## 范围

- **开关与默认值（`src/core/text/`）**：比较选项 `ignoreNewline` / `ignoreEncoding` 缺省与 `undefined` 均视为 `true`，显式 `false` 才严格；`diffLineTexts(leftText, rightText, options?)` 保持两参向后兼容（既有调用点不改即按默认开启执行）；新增带探测事实的入口 `diffLineTextsWithFacts(leftFacts, rightFacts, options?)`，两侧各接收 `{ text, encoding, sha256 }`（事实来自 `probeTextBytes` / `probeTextFile`），二者返回同一结果类型。
- **换行归一**：开启时比较前只把 `\r\n` 与孤立 `\r` 折叠为 `\n`，不改字符、空白、大小写、行序与「结尾换行是否存在」；关闭时原始终止符参与行级比较（CRLF / LF / CR / Mixed 互比必须出差异）。展示行文本恒不含行终止符；严格模式下仅换行不同时行内高亮可为空，但差异块 / 差异行数必须大于 0。
- **编码归一**：开启时按解码后文本比较，文本相同而编码标签 / 字节指纹不同（UTF-8 ↔ UTF-16LE / UTF-8 BOM / GBK 等）视为相同；关闭时解码文本相同但两侧 `sha256` 不同必须给出用户可见的字节差异信号且 `differenceCount ≥ 1`。两个开关相互独立：仅换行风格造成的字节差在 `ignoreNewline=true` 时不得被编码严格重新报出；编码差异不得吞掉真实字符差异。无探测事实（仅文本入口）时严格编码不可判定：不崩溃、不虚构字节差，只按文本判定。
- **同源结果契约**：一次比较返回单一结果，在既有 `rows` / `blocks` 之外附带 `normalization` 与 `differenceCount` / `identical`；工具栏、门禁与任何提示必须读同一份结果，不得各留内联判定。
  - `normalization.ignoreNewline` / `normalization.ignoreEncoding`：实际生效的开关值。
  - `normalization.newline: { left, right, different, ignored }`：左右原始换行标签（`CRLF|LF|CR|Mixed|None`）、是否不同、是否被忽略。
  - `normalization.encoding: { left, right, different, ignored, comparable, byteDifference }`：左右编码标签（无事实为 `null`）、标签是否不同、是否被忽略、两侧事实是否齐备、严格模式下是否存在「文本相同而字节不同」的可见信号。
  - `differenceCount = blocks.length + (byteDifference ? 1 : 0)`；`identical = differenceCount === 0`。
- **空白归一（第三个开关，2026-11-03）**：新增 `ignoreWhitespace`，缺省与 `undefined` 均为 `false`（严格逐字符比较是默认），显式 `true` 才忽略。忽略时行级比较用只去掉 U+0020 空格与 U+0009 制表符的文本（行尾空白、行内连续多余空白、制表符与空格互换都归入空白差异），行终止符与编码归一互不越权；展示用原文逐字保留（`display` 与 `compare` 分离，不 trim / 不折叠）。行内高亮在去空白文本上跑字符 diff，再按索引映回原文，纯空白差异不产生 changed 段。因比较文本被折叠，`same` 行两侧的原始显示文本允许逐字不同。
- **真差异不可吞**：字符替换、空白（行尾空格 / 缩进）、大小写、行顺序在四种换行 / 编码开关组合下都必须报告差异（差异块 ≥ 1、`differenceCount ≥ 1`、至少一行非 `same`）；空白差异只在 `ignoreWhitespace=true` 时被忽略。
- **可回归门**：`.munk/code-gates.json` 新增且仅新增一条 `diff-normalize` 门，命令为单 argv `pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts`。
- **真实外部文件证据门（2026-11-02，`wi_ws_2e24bfab81f0fb32`）**：判定语义不重做，只把已发布的探测 / 归一 / 视图链路钉在**真实磁盘字节**上。固定绝对根 `join(os.tmpdir(), 'opencompare-diff-normalize-evidence')` 每次先清空再生成两组（`thousand` 恰 1000 逻辑行、无尾随空行；`five-megabyte` 的 `utf8-*` ≥ 5 MiB 且 ≥ 1000 行），每组同一份逻辑文本落成六个 `.txt` 变体：`utf8-lf` / `utf8-crlf` / `utf8bom-lf` / `utf16le-crlf` / `gbk-lf` / `utf8-crlf-mutated`（仅改一行一个字符）。生成确定性（禁 `Math.random()` / 时间戳 / 网络），GBK 来自固定字符→字节表且写盘后用 `decodeText` 回读逐字相等，运行时不支持 GBK 解码即失败。门以 `createWebPlatformPort()` 为底、只覆写 `probeTextFile` / `readTextFile` / `statPath`，探测一律 `probeTextBytes(readFileSync(path))`（与 Electron / Web 同一纯函数）；`thousand` 组走真实 `Workbench` / `CodeView` DOM 全链路，`five-megabyte` 组只经 `diffLineTextsWithFacts` 核心级比较、不渲染进 jsdom。门在 stdout 打印 `OPENCOMPARE_DIFF_NORMALIZE_EVIDENCE <JSON>`，仅在显式设置 `OPENCOMPARE_EVIDENCE_OUT` 时落盘；提交 `docs/evidence/diff-normalize-real-files.json` / `.md` 作为机器可读与人读证据。门清单只加一条 `diff-normalize-real`（插在既有 `diff-normalize` 之后，总数 23 → 24），`src/munk-gates.test.ts` 同步 24 条面量与邻位断言。

## 验收

- **ac-default-on**：省略 options、传 `{}`、显式 `{ ignoreNewline: true, ignoreEncoding: true }` 三者对同一输入返回同构结果（rows / blocks / `differenceCount` / `identical` 完全一致），即两开关默认开启。
- **ac-fold-newline-styles**：开启时 `a\r\nb`、`a\nb`、`a\rb` 两两比较均 `identical === true`、`differenceCount === 0`、`blocks.length === 0`；折叠后行文本与 `a`、`b` 逐字相等（不吞行内空格与字符）。
- **ac-final-newline-kept**：开启时 `a` 与 `a\n` 仍判为不同（`identical === false`、`differenceCount ≥ 1`），证明忽略的是换行风格而非结尾换行是否存在。
- **ac-strict-newline**：`{ ignoreNewline: false }` 下 CRLF vs LF、LF vs CR、Mixed vs LF 三组均 `identical === false`、`differenceCount ≥ 1`、`blocks.length ≥ 1` 且存在非 `same` 行；行内 changed 片段允许为空。
- **ac-encoding-on**：带事实入口在默认（`ignoreEncoding` 开启）下，解码文本相同、编码标签与 `sha256` 不同的三组（UTF-8 vs UTF-16LE、UTF-8 vs UTF-8 BOM、UTF-8 vs GBK）均 `identical === true`、`differenceCount === 0`、`blocks.length === 0`。
- **ac-strict-encoding-signal**：`{ ignoreEncoding: false }` 下上述三组文本相同 / 字节不同的输入均 `identical === false`、`differenceCount === 1`、`normalization.encoding.byteDifference === true` 且 `normalization.encoding.different === true`；不新增修改行（`blocks.length === 0`）。
- **ac-newline-byte-not-resurrected**：`{ ignoreNewline: true, ignoreEncoding: false }` 下仅 CRLF vs LF（解码文本折叠后相同）→ `identical === true`、`differenceCount === 0`、`byteDifference === false`。
- **ac-no-facts-safe**：仅文本入口在 `{ ignoreEncoding: false }` 下不崩溃，`normalization.encoding.comparable === false`、`byteDifference === false`，判定只基于文本（文本不同仍报差异）。
- **ac-real-diff-all-combos**：四种开关组合 × {单字符替换、行尾空格、大小写变化、行顺序交换} 共 16 组，每组均 `identical === false`、`differenceCount ≥ 1`、`blocks.length ≥ 1`、至少一行非 `same`。
- **ac-count-single-source**：每次比较只有一个 `differenceCount`，且 `identical === (differenceCount === 0)`；纯文本对 `differenceCount === blocks.length`；带字节信号时 `differenceCount === blocks.length + 1`；不存在第二份内联计数逻辑。
- **ac-whitespace-default-off**：`resolveComparisonSwitches({})` 的 `ignoreWhitespace === false`；不传该选项时同一对「仅空白不同」的输入仍是非 `same` 行、`differenceCount ≥ 1`。
- **ac-whitespace-strip-scope**：`{ ignoreWhitespace: true }` 下，行尾空格、制表符与空格互换、行内连续多余空白三种输入 `differenceCount === 0` / 无非 `same` 行；忽略集合仅为 U+0020 与 U+0009，其它空白字符（如 U+00A0）仍按普通字符比较。
- **ac-whitespace-inline-mapped**：开启后去空白相等的行 `leftSegments` / `rightSegments` 全为 `changed === false` 且文本逐字等于原文；去空白后仍不相等的行，changed 段去空白后两侧仍不相等，且原文空白在未变更段中原样出现。
- **ac-whitespace-keeps-real-diff**：开启后单字符替换 / 大小写变化 / 行序交换仍 `differenceCount ≥ 1`、存在非 `same` 行；`differenceCount` 不再把纯空白行计为差异。
- **ac-whitespace-gate-registered**：上述断言落在既有 `src/core/text/diff.test.ts`（并入既有 `diff-normalize` 与新门 `code-pair-actions` 的覆盖），不新增恒真断言、不放宽既有 16 组合断言。
- **ac-signal-labels**：`normalization.newline.left/right` 取值仅 `CRLF|LF|CR|Mixed|None`，`normalization.encoding.left/right` 取值仅 `UTF-8|UTF-8 BOM|UTF-16LE|UTF-16BE|GBK|Unknown` 或 `null`（无事实），未在比较层另立标签或阈值。
- **ac-no-mutation**：比较不修改传入的文本与事实对象；`overwriteBlock`、`replaceLines`、`splitLines` 的既有断言不改动即通过。
- **ac-merge-unchanged**：`src/core/text/merge.test.ts` 全部现有断言（含样本三向合并冲突块）不改动即通过；`src/core/text/merge.ts` 无行为变更。
- **ac-gate-added**：`.munk/code-gates.json` 新增且仅新增一条 `diff-normalize` 门（单 argv `pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts`），门内断言覆盖默认开启、关闭严格、仅换行不同、仅编码不同、真实差异不漏；test-debt 门绿（新增测试行按既有 `growth[]` 机制声明，不手改 floors / 不手改口径）。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全绿；无新增依赖、无网络。

### 真实外部文件证据门（2026-11-02，`wi_ws_2e24bfab81f0fb32`）

- **ac-gate-single-entry**：`.munk/code-gates.json` 恰好新增一条 gate `diff-normalize-real`，紧跟既有 `diff-normalize`（`index(diff-normalize-real) === index(diff-normalize) + 1`），`cwd === "."`、命令逐字为 `pnpm test src/diff-normalize-real-gate.test.tsx` 且不含 `&&` / `||` / `|` / `;`；总条数 24，其余 23 条的 id 与命令逐字不变（仅 `description` 追加一条覆盖说明）。
- **ac-gate-manifest-pin**：`src/munk-gates.test.ts` 的 `EXPECTED_GATES` 反映 24 条且含新门与邻位断言；原有「九条模板门禁切片位于 `verify-release-gate` 之前」「末两项 = `verify-release-gate` / `test-debt-gate`」「禁 `perf-gate` / `perf:dir`」「单 argv」断言全部保留并通过。
- **ac-real-fixtures-on-disk**：门运行时两组共 6 个变体文件真实落盘（`.txt`，走代码双栏）；每个文件用独立 `node:crypto` 对磁盘原始字节重算的 sha256 与探测结果 `sha256` 相等，`bytes === statSync().size` 且 > 0。
- **ac-fixture-labels**：六个变体的探测标签逐一对上（`UTF-8` / `UTF-8` / `UTF-8 BOM` / `UTF-16LE` / `GBK`，换行 `LF` / `CRLF` / `LF` / `CRLF` / `LF`）；同组非变异变体解码文本折叠后逐字相等；GBK 变体回读逐字等于源文本且不降级成 `Unknown`。
- **ac-thousand-scale**：`thousand` 组每个文件恰有 1000 个逻辑行（终止符计数 1000、解码文本无尾随空行），用于 DOM 两态与状态栏断言。
- **ac-five-mb-scale**：`five-megabyte` 组 `utf8-*` 变体字节数 ≥ `5 * 1024 * 1024`、逻辑行数 ≥ 1000，只做核心级比较，不渲染进 DOM。
- **ac-default-on-zero**：两组中每一对「同文本不同变体」在默认开关（`resolveComparisonSwitches({})`，两项均开）下 `differenceCount === 0`、`blocks.length === 0`、`identical === true`、无非 `same` 行。
- **ac-strict-off-reports**：两项关闭后 `utf8-crlf` vs `utf8-lf` 有差异块且 `differenceCount ≥ 1`、`byteDifference === false`；`utf8bom-lf` vs `utf8-lf` 为 `blocks.length === 0` / `byteDifference === true` / `differenceCount === 1`；`utf16le-crlf` vs `gbk-lf` `differenceCount ≥ 1`。
- **ac-toggle-roundtrip**：真实 `thousand` 组配对上连续「默认 → 关闭两项 → 重新开启」，`[data-code-diff-count]` 依次为 `0` / 大于 0 / `0` 且每次恒等于同一次 `LineDiffComparison.differenceCount`，`blocks.length` 同步为 `0` / 大于 0 / `0`。
- **ac-status-raw-invariant**：真实 `thousand` 组 `utf8-crlf` ↔ `gbk-lf` 的状态栏四值按序为 `['CRLF','UTF-8','LF','GBK']`；两个开关各切换两次后四值文本逐字不变。
- **ac-real-difference-visible**：`utf8-crlf-mutated` vs `utf8-lf` 在默认开与两项关闭两种状态下都 `differenceCount ≥ 1` 且存在非 `same` 行（真实字符差异任何组合都不得被归一吞掉）。
- **ac-operability**：真实 `thousand` 组配对上两个开关均为可聚焦 `role="switch"`；单击与 `keydown` Space 各只翻转一次、`aria-checked` 与生效值一致；配对渲染出的两栏行数相等且 > 0。
- **ac-elapsed-recorded-budget**：`five-megabyte` 组探测、默认比较、关闭后重算耗时均以 `performance.now()` 计量并写入证据；关闭后重算 `< 10_000 ms`（显式常量，与 vitest 超时分开）；`thousand` 组切换耗时也记录。耗时字段不参与回读比对。
- **ac-evidence-artifact**：`docs/evidence/diff-normalize-real-files.json` 与同名 `.md` 已提交，含生成命令（`OPENCOMPARE_EVIDENCE_OUT=docs/evidence/diff-normalize-real-files.json pnpm test src/diff-normalize-real-gate.test.tsx`）、临时根绝对路径、每变体绝对路径 / 字节数 / sha256 / 行数 / 标签、两组各状态 `differenceCount` / `blocks` / 非 same 行数 / 行内片段数、状态栏四值、切换与重算耗时；数字来自一次真实运行。
- **ac-evidence-pinned**：门回读该 JSON，断言变体 `bytes` / `sha256` 与各状态 `differenceCount` / `blocks.length` 与本轮现场运行逐项相等（耗时与绝对路径不参与比对），证据漂移即红。
- **ac-no-prod-change**：门未暴露实现缺陷，故 `src/core/text/**`、`CodeView.tsx`、`workbench/**`、`main/platform/**`、`preload/**`、`shared/**` 相对基线零 diff；`package.json` 无新增依赖；无网络请求或外部服务。
- **ac-test-debt-declared**：`.munk/baseline/test-debt.json` 仅通过 `growth[]` 声明 `repoTestLines` 43999 → 44398（增量 ≤ 400、`addedCases` = 新增用例数 11）；`floors` 未下调、`literalWhitelist` 未放宽；`node scripts/test-debt-gate.mjs` 绿。
- **ac-no-sha-literal**：新增 `.ts` / `.tsx`（门、夹具辅助、`munk-gates` 测试）中无 64 位小写 hex sha256 字面量（全部运行时计算），`test-debt-gate` 的 sha 字面量扫描零命中。
- **ac-all-gates-green**：`.munk/code-gates.json` 全部 24 条门通过（含 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 与新门），`pnpm test` 全量零失败、无跳过新增用例。

## 非目标

- 不做三个开关的界面控件（含「忽略空白」的工具栏接线，归 `code-diff-switches`）、`CodeView` 工具栏 / 状态栏、显式重载与交换（归 `code-pair-actions`）、会话模型携带探测事实；证据门只消费既有 DOM 契约与判定结果，不新增生产测试钩子。
- 证据门只做 jsdom + 真实磁盘字节：不把 5 MB 组渲染进 DOM、不做真实窗口点击 / 截图 / 真机验收（`needSelfTest=false`），最终窗口可操作性归 Product Ops。
- 不改既有 23 条门的 id / 命令 / `cwd`，不新增 `pnpm` script（复用 `pnpm test <file>`），不改 `vitest.config.mts`；门只插在 `diff-normalize` 之后保持模板门 tail 切片不变。
- 不新增依赖（尤其不引 `iconv-lite`）、不下载夹具、无网络 / 外部服务；不 bump 版本，不改 README / CHANGELOG / release notes / tag。
- 不为凑绿放宽 lint / typecheck / 测试断言，不改 `scripts/test-debt-gate.mjs` 判定口径，不动 `src/test/sharedHarness.tsx` 的 400 行预算。
- 不改换行 / 编码探测函数、不新增阈值；不新增编码解码依赖；不碰 `probeTextBytes` / `probeTextFile` 语义。
- 不改 `splitLines`（仍只折叠 CRLF，不处理孤立 CR）、不改三向合并、不把归一结果写回文件。
- 不改导出 / 报告 / 快照 / 目录四态口径，不改内置样本 answer key，不改 `readTextFile` / `writeTextFile`。
- 不做转码写回、「保存为原编码」、按编码判等目录项。
- 不 bump 版本，不改 README / CHANGELOG / release notes，不动 tag / Release / 资产。
- 不新增顶层入口或顶栏动作；不为凑绿放宽 lint / typecheck / 测试。

## 实现约束

- 归一 / 严格判定只落 `src/core/text/`（`normalize.ts` + `diff.ts` 接线）；禁止 electron / react / DOM 依赖，保持可在 Node 直接单测。
- 复用 `src/core/text/probe.ts` 导出的 `EncodingLabel`、`NewlineKind` 与 `detectNewline`，以及 `probeTextBytes` 产出的 `sha256`；不得在比较层另立编码 / 换行字面量或阈值。
- `diffLineTexts` 第三参可选，既有两参调用点（`CodeView`、ruler 测试等）不改也能编译并吃到默认开启语义。
- 严格模式下展示行文本去掉行终止符（不显示游离 `\r`），差异判定仍按原始终止符；行对齐与行号语义不变。
- `differenceCount` / `identical` / 归一事实必须由同一次比较产出；不得在 UI、测试或门禁里另写一份可执行判定（遵循 `docs/lessons.md` §9）。
- 字节差异只由 `sha256` 判定，标签差异只作信号展示；严格信号仅在「两侧解码文本逐字相同且字节不同」时产生，避免重复计数与把已忽略的换行差重新报出。
- 新测试放 `src/core/text/normalize.test.ts`，用例名与 `ac-*` 一一对应；字节输入用显式字节数组 + `probeTextBytes` 构造，保证 `pnpm test src/core/text/normalize.test.ts` 可复现。
- 新增测试行数按 `.munk/baseline/test-debt.json` 既有 `growth[]` 声明登记，不得直接抬 `floors` 或删测试。
- 证据门把夹具生成（六变体、GBK 表、写盘 / 清理、磁盘端口包装、证据组装与 pinned 字段）放到非 `.test.*` 辅助模块 `src/test/diffNormalizeRealFixture.ts`（不计入 `repoTestLines`，589 行），`src/diff-normalize-real-gate.test.tsx` 只留断言与 DOM 流程（383 行 / 10 个 `it`）；不动 `src/test/sharedHarness.tsx`。
- 门内所有差异数字来自同一次 `diffLineTextsWithFacts` / `diffLineTexts` 的 `rows` / `blocks` / `normalization` / `differenceCount`；DOM 侧 `[data-code-diff-count]` 必须与该值逐字相等，禁止另写计数（`docs/lessons.md` §9）。
- DOM 契约只用既有 `[data-code-switch="ignore-newline"|"ignore-encoding"]`、`[data-code-diff-count]`、`[data-code-diff-bytes]`、`[data-diff-row]`、`footer[data-shell-level="status"]` 与 `zh` 词典键，不为本项在生产代码新增测试钩子。
- 阈值常量彼此命名并分开断言：`FIVE_MIB = 5 * 1024 * 1024`、`THOUSAND_LINES = 1000`、`STRICT_RECOMPUTE_BUDGET_MS = 10_000`、`TEST_TIMEOUT_MS`（vitest 超时）；不得用「实测通过」代替上限。
- 时间与清理：`beforeAll` 建根、`afterAll` `rmSync(root, { recursive: true, force: true })`；不向仓库写临时文件，`OPENCOMPARE_EVIDENCE_OUT` 只在显式设置时写指定路径。证据重生成顺序为先产 JSON、再据其写 `.md`、最后跑全量门。
- 允许改动：`src/core/text/**`、`src/test/diffNormalizeRealFixture.ts`、`src/diff-normalize-real-gate.test.tsx`、`docs/evidence/diff-normalize-real-files.{json,md}`、`.munk/code-gates.json`（仅新增一条门与对应 description 覆盖说明）、`src/munk-gates.test.ts`（门面量与邻位断言）、`.munk/baseline/test-debt.json`（仅 growth 声明）。

## 最近交付证明

- WI：`wi_intake_fdbf73a8407f5c10`（新增第三个比较开关「忽略空白」：语义落地 `src/core/text`，默认严格逐字符；`kind: feature`）
- 日期：2026-11-03
- 结果：code_gates passed（27 gates，attempt 001，`.munk/runs/run_intake_fdbf73a8407f5c10/code-gates/attempts/001`；`pnpm test` 125 files / 2009 passed + 1 skipped（2010）；`diff-normalize` 与新增 `code-pair-actions` 门均绿；`test-debt` 声明 `repoTestLines 45690 → 46039`、`repoTestCases` floor 1497 → 1515、`addedCases 15`）。
- 覆盖摘要：`normalize.ts` 增 `ignoreWhitespace`（缺省 `false`，仅 `true` 生效）与 `isComparisonWhitespace` / `stripComparisonWhitespace`（只认 U+0020 / U+0009）；`diff.ts` 把每行拆成 `display`（原文）与 `compare`（去空白 + 终止符），行级对齐与 `same` 行判定用 `compare`，但 `same` 行两侧保留各自原文；`inlineSegments` 增加 `ignoreWhitespace` 参数，在去空白文本上跑 `diffChars` 再把每个 run 按索引映回原文并合并同色调 run，纯空白差异不产生 changed 段；`diffLineTexts` / `diffLineTextsWithFacts` 的开关透传与 `differenceCount` 口径不变。`diff.test.ts` 新增 6 例（默认严格、仅空白相等且原文保留、真实差异计数一次、行内只高亮非空白、换行差异不被空白开关吞、关闭时 segments 与旧行为一致）。
- 后续注意：① 忽略集合只有空格与制表符，U+00A0 等其它空白仍按普通字符比较（当前无显式断言，属补强点）；② 空白模式下 `same` 行的左右原始文本可以逐字不同，任何「same 即左右文本相等」的假设都会失效；③ 门禁清单计数已漂移到 27 项（`domains/quality-gates` 与 `tech/overview.md` 仍写 22 / 24），后续 Planner 需单开一项对齐，不要引用旧计数。
