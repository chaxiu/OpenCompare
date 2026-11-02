# diff 归一判定：两开关默认开、关闭严格、真实差异不漏

## 范围

本项是 I#9 的**比较判定层**切片：在现有 `src/core/text/` 行级 / 行内 diff 上加入“忽略换行”与“忽略编码”两个判定开关（默认均开启），产出同源的差异计数与可见的字节 / 编码差异信号。**不做界面控件、状态栏、会话探测事实接线**（由后续视图 / 状态栏子项消费本项结果）。

1. **开关与默认值**
   - 在 `src/core/text/` 定义比较选项：`ignoreNewline` 与 `ignoreEncoding`，缺省与 `undefined` 均视为 `true`；显式 `false` 才进入严格判定。
   - 文本入口保持向后兼容：`diffLineTexts(leftText, rightText, options?)`；既有两参调用点不改也编译、行为按默认开启执行。
   - 新增带探测事实的入口（同一返回类型）：两侧各接收 `{ text, encoding, sha256 }`（事实来自既有 `probeTextBytes` / `probeTextFile`），用于严格编码判定。
2. **换行归一**
   - 开启：比较前把 `\r\n` 与孤立 `\r` 折叠为 `\n`；只折叠终止符，不改字符、空白、大小写、行序、结尾换行是否存在。
   - 关闭：原始终止符参与行级比较；仅换行风格不同（CRLF / LF / CR / Mixed 互比）也必须产生差异块 / 非 same 行。
   - 展示行文本不含行终止符；严格模式下仅换行不同时行内字符高亮允许为空，但差异块 / 差异行数必须大于 0。
3. **编码归一**
   - 开启：按解码后文本比较；解码文本相同而编码标签 / 字节指纹不同（UTF-8 ↔ UTF-16LE / UTF-8 BOM / GBK 等）视为相同。
   - 关闭：解码文本相同但两侧 `sha256` 不同时，必须给出用户可见的字节差异信号且 `differenceCount ≥ 1`，不得静默判相同。
   - 独立性：仅换行风格造成的字节差在 `ignoreNewline=true` 时不得被编码严格重新报出；反之编码差异不得吞掉真实字符差异。
   - 无探测事实（仅文本入口）时严格编码不可判定：不崩溃、不虚构字节差异，判定只基于文本。
4. **同源结果**
   - 一次比较返回单一 `LineDiffResult`，在既有 `rows` / `blocks` 之外附带归一事实与 `differenceCount` / `identical`；工具栏、门禁与任何提示必须读同一份结果，不得各留内联判定。
   - 结果字段契约（命名固定，供后续子项接线）：
     - `normalization.ignoreNewline` / `normalization.ignoreEncoding`：实际生效的开关值。
     - `normalization.newline: { left, right, different, ignored }`：左右原始换行标签（沿用 `CRLF|LF|CR|Mixed|None`）、是否不同、是否被忽略。
     - `normalization.encoding: { left, right, different, ignored, comparable, byteDifference }`：左右编码标签（无事实为 `null`）、标签是否不同、是否被忽略、两侧事实是否齐备、严格模式下是否存在“文本相同而字节不同”的可见信号。
     - `differenceCount`：`blocks.length + (byteDifference ? 1 : 0)`。
     - `identical`：`differenceCount === 0`。
5. **真差异不可吞**
   - 字符替换、空白（行尾空格 / 缩进）、大小写、行顺序在四种开关组合下都必须报告差异（差异块 ≥ 1、`differenceCount ≥ 1`、至少一行非 `same`）。
6. **不越界**
   - 不写回、不改导出 / 报告 / 快照 / 目录四态；`splitLines` 与三向合并源码语义保持现状。
7. **验证**
   - 纯函数单测（L1/L2，Node 环境）；复用 `probeTextBytes` 从确定性字节构造探测事实，无文件系统、无 GUI。
   - `.munk/code-gates.json` 新增**一条**可回归门 `diff-normalize`，命令为单 argv：`pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts`。

## 验收

- ac-default-on: 省略 options、传 `{}`、显式 `{ ignoreNewline: true, ignoreEncoding: true }` 三者对同一输入返回同构结果（rows / blocks / `differenceCount` / `identical` 完全一致），即两开关默认开启。
- ac-fold-newline-styles: 开启时 `a\r\nb`、`a\nb`、`a\rb` 两两比较均 `identical === true`、`differenceCount === 0`、`blocks.length === 0`；折叠后行文本与 `a`、`b` 逐字相等（不吞行内空格与字符）。
- ac-final-newline-kept: 开启时 `a` 与 `a\n` 仍判为不同（`identical === false`、`differenceCount ≥ 1`），证明忽略的是换行风格而不是结尾换行是否存在。
- ac-strict-newline: `{ ignoreNewline: false }` 下 CRLF vs LF、LF vs CR、Mixed vs LF 三组均 `identical === false`、`differenceCount ≥ 1`、`blocks.length ≥ 1` 且存在非 `same` 行；行内 changed 片段允许为空。
- ac-encoding-on: 带事实入口在默认（`ignoreEncoding` 开启）下，解码文本相同、编码标签与 `sha256` 不同的三组（UTF-8 vs UTF-16LE、UTF-8 vs UTF-8 BOM、UTF-8 vs GBK）均 `identical === true`、`differenceCount === 0`、`blocks.length === 0`。
- ac-strict-encoding-signal: `{ ignoreEncoding: false }` 下上述三组文本相同 / 字节不同的输入均 `identical === false`、`differenceCount === 1`、`normalization.encoding.byteDifference === true` 且 `normalization.encoding.different === true`；不新增修改行（`blocks.length === 0`）。
- ac-newline-byte-not-resurrected: `{ ignoreNewline: true, ignoreEncoding: false }` 下仅 CRLF vs LF（解码文本折叠后相同）→ `identical === true`、`differenceCount === 0`、`byteDifference === false`。
- ac-no-facts-safe: 仅文本入口在 `{ ignoreEncoding: false }` 下不崩溃，`normalization.encoding.comparable === false`、`byteDifference === false`，判定只基于文本（文本不同仍报差异）。
- ac-real-diff-all-combos: 四种开关组合 × {单字符替换、行尾空格、大小写变化、行顺序交换} 共 16 组，每组均 `identical === false`、`differenceCount ≥ 1`、`blocks.length ≥ 1`、至少一行非 `same`。
- ac-count-single-source: 每次比较只有一个 `differenceCount`，且 `identical === (differenceCount === 0)`；纯文本对 `differenceCount === blocks.length`；带字节信号时 `differenceCount === blocks.length + 1`；不存在第二份内联计数逻辑。
- ac-signal-labels: `normalization.newline.left/right` 取值仅 `CRLF|LF|CR|Mixed|None`，`normalization.encoding.left/right` 取值仅 `UTF-8|UTF-8 BOM|UTF-16LE|UTF-16BE|GBK|Unknown` 或 `null`（无事实），未在比较层另立标签或阈值。
- ac-no-mutation: 比较不修改传入的文本与事实对象；`overwriteBlock`、`replaceLines`、`splitLines` 的既有断言不改动即通过。
- ac-merge-unchanged: `src/core/text/merge.test.ts` 全部现有断言（含样本三向合并冲突块）不改动即通过；`src/core/text/merge.ts` 无行为变更。
- ac-gate-added: `.munk/code-gates.json` 新增且仅新增一条 `diff-normalize` 门（单 argv `pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts`），门内断言覆盖默认开启、关闭严格、仅换行不同、仅编码不同、真实差异不漏；test-debt 门绿（新增测试行按既有 `growth[]` 机制声明，不手改 floors / 不手改口径）。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 全绿；无新增依赖、无网络。

## 非目标

- 不做两个开关的界面控件、`CodeView` 工具栏 / 状态栏、会话模型携带探测事实、差异提示渲染与 jsdom 交互断言（由后续视图 / 状态栏子项接线）。
- 不做真实磁盘文件端到端证据、性能实测与窗口可操作性（由证据子项承担）。
- 不改换行 / 编码探测函数、不新增阈值；不新增编码解码依赖；不碰 `probeTextBytes` / `probeTextFile` 语义。
- 不改 `splitLines`（本轮仍只折叠 CRLF，不处理孤立 CR）、不改三向合并、不把归一结果写回文件。
- 不改导出 / 报告 / 快照 / 目录四态口径，不改内置样本 answer key，不改 `readTextFile` / `writeTextFile`。
- 不做转码写回、“保存为原编码”、按编码判等目录项。
- 不 bump 版本，不改 README / CHANGELOG / release notes，不动 tag / Release / 资产。
- 不新增顶层入口或顶栏动作；不为凑绿放宽 lint / typecheck / 测试。

## 实现约束

- 归一 / 严格判定只落在 `src/core/text/`（建议新增 `normalize.ts` 并在 `diff.ts` 接线）；禁止 electron / react / DOM 依赖，保持可在 Node 直接单测。
- 复用 `src/core/text/probe.ts` 导出的 `EncodingLabel`、`NewlineKind` 与 `detectNewline`，以及 `probeTextBytes` 产出的 `sha256`；不得在比较层另立编码 / 换行字面量或阈值。
- `diffLineTexts` 第三参可选，既有两参调用点（`CodeView`、ruler 测试等）不改也能编译并吃到默认开启语义。
- 严格模式下展示行文本去掉行终止符（不显示游离 `\r`），差异判定仍按原始终止符；行对齐与行号语义不变。
- `differenceCount` / `identical` / 归一事实必须由同一次比较产出；不得在 UI、测试或门禁里另写一份可执行判定（遵循 `docs/lessons.md` §9）。
- 字节差异只由 `sha256` 判定，标签差异只作信号展示；严格信号仅在“两侧解码文本逐字相同且字节不同”时产生，避免重复计数与把已忽略的换行差重新报出。
- 新测试放 `src/core/text/normalize.test.ts`（可在 `diff.test.ts` 追加）；用例名与 `ac-*` 一一对应，字节输入用显式字节数组 + `probeTextBytes` 构造，保证 `pnpm test src/core/text/normalize.test.ts` 可复现。
- 新增测试行数按 `.munk/baseline/test-debt.json` 既有 `growth[]` 声明（单次 ≤400 行）登记，不得直接抬 `floors` 或删测试。
- 允许改动：`src/core/text/**`、`.munk/code-gates.json`（仅新增一条门与对应 description 覆盖说明）、`.munk/baseline/test-debt.json`（仅 growth 声明）。
