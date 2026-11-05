# 大文件回落阈值、边界测试与实测耗时证据

## 范围

本项是「语法高亮 V1 单闭环」的第二波收尾：在已交付的单一入口 `resolveSyntaxView(path, text)`（`src/core/syntax/view.ts`）内加入文件大小阈值，超过阈值的一侧回落为现有纯文本渲染，阈值内的代码文件继续着色；并把阈值两侧行为、缓存有界性与本场真实耗时证据落成可执行门禁与可打开证据。

1. **阈值只加在单一入口内**：`resolveSyntaxView` 在折叠文本后、进入 `cachedSyntaxTokens` 之前判定大小；`CodeView` / `DiffPane` 不加第二处尺寸判断，不改 `DiffPane` 虚拟化、行高、overscan 与滚动同步。
2. **阈值语义**：按折叠后（CRLF→LF）文档字符数判定，与缓存字符上限同源；`length <= 阈值` 着色，`length > 阈值` 返回 `null`（零 syntax span，纯文本路径）。
3. **超阈值不解析**：判定发生在缓存/解析之前，超阈值文本不触发 tokenizer、不占缓存。
4. **缓存仍然有界**：沿用既有双上限（`SYNTAX_CACHE_MAX_ENTRIES = 32`、`SYNTAX_CACHE_MAX_CHARS = 262144`）与确定性 LRU，本项不改上限数值与淘汰策略；补充经 `resolveSyntaxView` 的多轮对比有界性回归。
5. **实测证据**：用真实生成文件跑本场探针，产出非 null 的 `docs/evidence/syntax-perf.json` + `.md`，记录文件规模（字节 / 字符 / 行数）、阈值、冷/热耗时、缓存读数与机器口径。
6. **门禁**：新增 `syntax-perf` gate（阈值边界 + 缓存有界 + 证据与常量一致），同步 `src/munk-gates.test.ts` 门清单与 `.munk/baseline/test-debt.json`，本仓全部门禁保持全绿。

## 验收

### 阈值两侧行为

- ac-threshold-inside-highlights: 长度恰好等于导出阈值 `T` 字符的真实 `.ts` 文本经 `resolveSyntaxView` 返回非 `null` 且 tokens 非空；在双栏渲染中该侧至少出现一个 `[data-syntax]`。
- ac-threshold-outside-plain: 同一内容补到 `T + 1` 字符后经 `resolveSyntaxView` 返回 `null`；渲染后该侧 `[data-syntax]` 数量为 0，且行数、每行 `textContent`、行状态与同一内容以未知扩展名（`.txt`）纯文本渲染的结果逐项相等。
- ac-threshold-boundary-flip: 阈值按折叠后字符数判定，`T` 与 `T + 1` 之间即翻转；同一内容的 LF 与 CRLF 版本在折叠后等长时同进同出，不因换行编码改变着色与否。
- ac-single-predicate-preserved: 阈值常量只由 `src/core/syntax` 导出并在 `resolveSyntaxView` 内使用；`CodeView` / `DiffPane` 不引用该常量、不含尺寸字面量比较（源码扫描 + 渲染测试双向证明），双栏仍只经同一入口取结果。
- ac-oversized-not-parsed: 超阈值文本被拒时模块级缓存的 `misses` 与 `charCount` 不变，证明未进入 tokenizer；同一次调用不抛错。
- ac-existing-fallbacks-intact: 未知扩展名、空文本、孤立 `\r`、解析异常仍返回 `null`，既有 `src/core/syntax/view.test.ts` 断言不放宽、不删除。

### 缓存有界性回归

- ac-cache-still-bounded: 连续对 40 份不同的大文本（每份 ≤ 阈值）调用 `resolveSyntaxView` 后，模块级缓存 `size ≤ SYNTAX_CACHE_MAX_ENTRIES` 且 `charCount ≤ SYNTAX_CACHE_MAX_CHARS`；两个上限常量取值保持不变。
- ac-cache-hit-at-threshold: 阈值内文本可被缓存保留：首次为 miss，第二次为 hit 且 tokens 与首次一致（阈值不超过缓存字符上限，重复渲染不重解析）。

### 功能零变更

- ac-diff-semantics-parity: 同内容对比下，超阈值回落路径与 `.txt` 纯文本路径的四态计数、差异块数、行号、`data-diff-window-start`、`data-diff-content-height` 完全一致。
- ac-windowing-untouched: `DIFF_ROW_HEIGHT`、`ROW_OVERSCAN`、`WINDOW_THRESHOLD`、滚动同步与 ruler 跳转逻辑零改动（既有窗口化测试不放宽且全绿）。
- ac-version-anchors-untouched: `package.json#version`、`CHANGELOG.md`、`README.md` 第 5 行、`.github/workflows/release.yml` 的 dispatch 默认 tag、`docs/release-notes/**` 零改动。

### 门禁与证据

- ac-syntax-perf-gate: `.munk/code-gates.json` 新增 `syntax-perf` gate，覆盖阈值边界、缓存有界与证据一致性断言；`src/munk-gates.test.ts` 门清单同步；`syntax-perf` 与既有 `syntax-core` / `syntax-view` / `test-debt-gate` 等全部门禁全绿。
- ac-probe-artifact: 本场真实运行产出的 `docs/evidence/syntax-perf.json` 与 `docs/evidence/syntax-perf.md` 非空（由探针脚本写入，非手填），含每个尺寸档的字节数、字符数、行数、冷/热耗时、tokens 数与缓存读数，以及阈值、判定规则、机器口径（平台、架构、OS 版本、CPU 型号、核数、总内存、Node 版本）、执行命令与时间戳。
- ac-evidence-path-mapping: 证据 `.md` 与交付说明给出可直接打开的绝对路径，并同时标注 worktree 根与产品仓根（`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/codebases/projects/open-compare`）的映射关系。
- ac-evidence-threshold-in-sync: 证据 JSON 中的 `threshold` 与代码导出常量相等；证据记录阶梯尺寸与「冷启动中位数 ≤ 150 ms 且 ≤ 缓存字符上限」的取值规则，可被 `syntax-perf` gate 复核。
- ac-screenshot-gate-quiet: 本项不修改 `src/renderer/**` 下任何非测试文件（该门已排除 `*.test.ts(x)`），`release-artifacts-and-brand` 截图门保持绿；若确需改非测试 renderer 文件，必须按既有流程重拍并重钉 `docs/screenshots.md` 的 commit 与 sha256。

## 非目标

- 不改 `DiffPane` 虚拟化、行高、overscan、滚动同步、ruler 跳转；不做分块/增量/异步解析或 Worker。
- 不改 diff 语义、四态计数、忽略换行 / 编码 / 空白开关、复制 / 导出、快照与合入口径。
- 不改缓存双上限数值与 LRU 淘汰策略；不新增第二层缓存。
- 不加用户可见的阈值配置、提示、i18n 文案或状态条。
- 不改 `MergePane`、结构化视图、CSV、目录视图的着色；不新增颜色相或主题 token。
- 不做浏览器 / 真机 / 桌面 GUI 验收；不重做截图视觉与截图策略。
- 不碰版本语义单点文件，不做版本号 / CHANGELOG / README 版本表 / release notes 变更。

## 实现约束

- **单点判定落点**：阈值常量（建议命名 `SYNTAX_MAX_HIGHLIGHT_CHARS`）定义并导出在 `src/core/syntax/`（`view.ts` 优先），由 `@core/syntax` 再导出；`resolveSyntaxView` 在 `foldSyntaxText` 之后、`cachedSyntaxTokens` 之前判定 `folded.length > 阈值 → null`，顺序保持在语言映射、空文本、孤立 `\r` 之后，避免改变既有回落优先级。渲染层零改动。
- **缓存读数出口**：为可测性新增只读统计（如 `syntaxCacheStats()` 返回 `{ size, charCount, hits, misses }`），由默认缓存提供；不新增淘汰逻辑、不改变上限常量。
- **阈值取值由本场实测决定**：阶梯按折叠后字符数取 `[32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304]`，每档生成真实 `.ts` 内容，清缓存后测冷启动（重复 ≥3 次取中位数）；取「冷启动中位数 ≤ 150 ms 的最大档」，并以 `SYNTAX_CACHE_MAX_CHARS`（262144）为上界钳制；冻结为整数字面量常量并加注释记录测量依据。先跑阶梯定值，再冻结常量，最后重跑探针生成提交的证据，保证 `threshold` 与常量一致。
- **探针形态**：`scripts/syntax-perf.evidence.test.ts`（由 `vitest.evidence.config.mts` 的 `scripts/**/*.evidence.test.ts` 收集），新增 `pnpm measure:syntax`（`vitest run --config vitest.evidence.config.mts scripts/syntax-perf.evidence.test.ts`）。脚本在系统临时目录生成确定性的真实文件、读回磁盘再调用 `resolveSyntaxView`，同时记录超阈值档的拒绝路径耗时；结束前写 `docs/evidence/syntax-perf.json`（默认路径，支持 `OPENCOMPARE_SYNTAX_EVIDENCE_OUT` 覆盖）并由同一份数据渲染 `docs/evidence/syntax-perf.md`，清理临时目录。禁止手抄数字。
- **有界性探针**：同一脚本跑 40 份不同大文本经 `resolveSyntaxView` 的轮次，记录轮末 `size` / `charCount` 并断言在双上限内；再用重复文本验证 hit。
- **测试落点与截图门**：边界与 DOM 纯文本一致性断言放 `src/core/syntax/view.test.ts`、`src/core/syntax/cache.test.ts` 与仓库根新增 `src/syntax-perf-gate.test.tsx`（复用既有 jsdom 视口工具，参照 `src/diff-normalize-real-gate.test.tsx`），不在 `src/renderer/**` 下新增非测试文件，避免触发截图重钉。
- **门禁注册**：`.munk/code-gates.json` 追加 `syntax-perf`（覆盖新增/修改的 core 测试与仓库根 gate 测试），`src/munk-gates.test.ts` 的期望清单同步；默认矩阵仍只做纯单测/构建，不做长时性能采样（探针走 `pnpm measure:syntax`，不进默认矩阵）。
- **测试债基线**：新增测试会抬高 `repoTestLines` / `repoTestCases`，须按实测同步 `.munk/baseline/test-debt.json` 的 `ceilings` / `floors` 并追加 `growth` 说明，保持 `test-debt-gate` 绿；不得删除或放宽既有断言来凑数。
- **验证范围**：只走 `code_gates`（Node / vitest / build），不做浏览器、真机或桌面 GUI 检查；证据须来自本场实际运行，路径按运行时真实 worktree 写出。
