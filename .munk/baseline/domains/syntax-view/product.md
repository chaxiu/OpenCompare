# Domain: syntax-view

双栏文本视图的语法着色接线波：把已交付的 `src/core/syntax/` 纯逻辑接进 `src/renderer/src/views/CodeView.tsx` 与 `src/renderer/src/components/DiffPane.tsx`，每侧独立判定、整篇一次解析、逐可见行与字符级差异正交叠合，同时守住四态计数 / 忽略开关 / 复制导出 / 虚拟化的零变更与既有 README 截图 provenance 门。上游地基见 `domains/syntax-highlight`。

## 范围

- **每侧独立选语言**：按该侧路径的显式扩展名调用 `languageForPath`（无内容探测）；左右可为不同语言，也可一侧有映射、一侧回落。
- **整篇一次解析 + 有界缓存**：每侧把 `foldSyntaxText(text)` 的同一份折叠文本交给 `cachedSyntaxTokens`，一次渲染不按行重复解析。
- **逐可见行叠合**：`overlayLine(lineText, lineStartOffset, tokens, inlineSegments?)` 把整篇 token 与既有字符级 `InlineSegment[]` 压成逐段 `{ text, token, changed }`，只对虚拟化窗口内已渲染行计算。
- **前景 / 背景正交**：语法 token 只输出 `text-syntax-*` 前景；行级差异只用既有 `bg-diff-*-soft`，字符级差异只用 soft 背景 + 下划线；语法四色不含红，红只属于 `removed`。
- **回落**：无映射扩展名、空文本、含孤立 `\r`，以及解析异常、超阈值大文件，统一由**一个**导出纯函数判定为「不着色」，走改动前一致的纯文本渲染。
- **大文件阈值（第二波）**：`resolveSyntaxView` 在 `foldSyntaxText` 之后、`cachedSyntaxTokens` 之前按折叠后字符数判定；`length <= SYNTAX_MAX_HIGHLIGHT_CHARS` 照常着色，超阈值直接返回 `null`，不触发 tokenizer、不占缓存；`CodeView` / `DiffPane` 不加第二处尺寸判断，虚拟化与滚动同步零改动。
- **实测证据与门禁**：由 `pnpm measure:syntax` 的真实探针写 `docs/evidence/syntax-perf.{json,md}`（阶梯尺寸、冷/热耗时、缓存读数、机器口径），新增 `syntax-perf` gate 复核阈值边界、缓存有界与证据/常量一致。
- **零变更守卫**：四态计数、忽略换行 / 编码 / 空白开关、复制文本、导出文本、行窗口化与滚动映射均不因着色改变；既有渲染测试不放宽。
- **门禁与 provenance**：`.munk/code-gates.json` 新增 `syntax-view` gate 并保留 `syntax-core`；`src/renderer` 变更触发既有 `readme-screenshots` 门，须重跑 `pnpm screenshots` 并把 `docs/screenshots.md` 的 captured commit 与四张 PNG 的字节数 / sha256 重钉到该提交。
- **收尾波（第三波）**：不改任何产品行为，只做三件事——在含语法着色 + 大文件回落阈值的最终合入构建上重拍四张 README 截图；按语言重钉 provenance 并把 captured commit 钉到最终合入提交（`src/renderer` 相对它零差异）；把「着色前后逐位一致」的计数 / 开关 / 复制导出断言落进**已登记 gate**（优先扩展现有 `syntax-view` / `code-pair-actions` 测试文件，不新增重复 gate）。

## 验收

- **ac-per-side-language**：左 `.ts`、右 `.py` 的同一对比中两侧各出现本语言关键字 `[data-syntax="keyword"]` 且文本正确；任一侧改成 `.txt` 只让该侧失去全部 `[data-syntax]`，另一侧着色与文本不变。
- **ac-four-classes-visible**：真实 `.ts` 样本双栏渲染后 keyword / string / number / comment 四类 `[data-syntax]` 均存在且 span class 含对应 `text-syntax-*`；`.py` 与 `.json` 各产出四类（JSON 属性名与字符串→string、数字→number、`true`/`false`/`null`→keyword、jsonc 注释→comment）。
- **ac-render-text-integrity**：每一渲染行所有 span 文本拼接后与该行原始文本逐字符相等（含空行、缩进、行尾空格、超长行）；同一内容在着色与纯文本两条路径下 `textContent` 逐位一致。
- **ac-crlf-lf-identical**：同一 `.ts` 内容的 LF 与 CRLF 版本渲染出的 syntax span 序列（class + 文本）完全一致，行号与行数不变。
- **ac-token-internal-change**：改动完全落在单个 token 内时该 token 三段保留同一 `data-syntax` 类，只有中段带字符级改动背景；三段拼接仍等于该行文本。
- **ac-cross-changed**：token 跨越 changed 边界时两侧 token 类相同、changed 只体现在背景；changed 区间内每个字符都带字符级改动背景类。
- **ac-background-never-eaten**：任一含 syntax span 的字符上行状态背景与字符级改动背景同时可见：syntax span 自身不带任何 `bg-*` 类，承载它的单元格仍保留行 tone。
- **ac-red-only-removed**：syntax span 的 class 只来自四个 `text-syntax-*`，不含 `danger` / `diff-removed` 红；红色只出现在 `removed` 行背景与其字符级改动标记上。
- **ac-syntax-mode-foreground**：着色生效时字符级 changed 段不覆盖 token 前景（只叠加背景与下划线）；未着色路径渲染与改动前逐位一致（`INLINE_CHANGED_CLASSES` 行为不变）。
- **ac-unknown-extension-plain**：`.txt` / 无扩展名 / 空路径渲染出零个 `[data-syntax]`，DOM 结构与改动前纯文本一致；同样 TypeScript 内容放进 `.txt` 仍不着色（无内容探测）。
- **ac-empty-and-error-fallback**：任一侧为空文本时该侧零 syntax span、不抛错；token 结果为空或解析抛错时该侧回落纯文本，另一侧照常着色，页面不崩。
- **ac-lone-cr-fallback**：含孤立 `\r`（非 CRLF）的文本按回落处理为纯文本，不出现错位着色或 off-by-one 行偏移。
- **ac-single-mode-predicate**：「是否着色」由一个导出纯函数按（路径, 文本）判定，未知扩展名 / 空文本 / 需回落时返回 `null`；双栏两个面板都通过它取结果，渲染层无第二处扩展名判断分支。
- **ac-counts-parity**：同一内容分别以 `.ts` 与 `.txt` 路径打开，`[data-code-diff-count]`、差异块计数（`x/y`）、每行状态与行号完全一致；忽略换行 / 编码 / 空白的四种开关组合下同样一致。
- **ac-switch-parity**：忽略换行 / 编码 / 空白三个开关逐个切换后，着色与否不改变四态计数、块边界、行状态与行号。
- **ac-copy-export-parity**：双栏复制仍复制同一路径字符串；合并视图「复制」写入剪贴板的文本与「导出」写入 `platform.saveFile` 的 content 均与 `renderMergeText(renderMerge(model, resolutions))` 逐字节相等，且 `.ts` 着色侧与 `.txt` 纯文本侧输出相同；未解决冲突时复制 / 导出仍禁用，既有导出门禁与禁用条件不变。
- **ac-windowing-preserved**：350k 行大 diff 仍只渲染视口 + overscan 行，`data-diff-window-start`、`data-diff-content-height` 与滚动同步不变；叠合只发生在已渲染行，行高与滚动映射不受影响。
- **ac-existing-tests-unmodified**：既有 `DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.switches.test.tsx`、`CodeView.ruler*.test.tsx` 在不放宽、不删除断言的前提下全绿。
- **ac-parse-once-per-side**：一次渲染中每侧整篇 token 化最多 1 次（缓存命中不重复解析），tokenizer 调用次数不随行数线性增长。
- **ac-syntax-view-gate**：`syntax-view` gate 覆盖新增渲染测试 + `src/core/syntax` + `src/core/theme/contrast.test.ts`，与其余门禁全绿；测试文件本身不替代 gate。
- **ac-theme-render**：`data-theme` 为 `light` / `dark` 时渲染出的 syntax class 序列完全相同（颜色只经 `--color-syntax-*`），渲染代码零 `#hex` / `rgb()` / `hsl()` 字面量；明暗 AA 由既有 `syntax/theme.test.ts` 覆盖。
- **ac-core-boundary**：`src/core/**` 不新增 Electron / React / DOM 依赖，renderer 只经 `@core/syntax` 入口消费且不新增运行时依赖；`pnpm typecheck` / `pnpm build` / `pnpm build:web` 全绿。
- **ac-version-anchors-untouched**：`package.json#version`、`CHANGELOG.md`、`README.md` 第 5 行、`release.yml` dispatch 默认 tag、`docs/release-notes/**` 零改动。
- **ac-screenshot-provenance**：渲染变更提交后重跑 `pnpm screenshots`，把 `docs/screenshots.md` 的 captured commit 与四张 PNG 的字节数 / sha256 重钉到该提交；README 图片引用与中英隔离不变，禁止只改 commit 字段或手写 sha。
- **ac-threshold-inside-highlights**：长度恰好等于导出阈值 `T` 的真实 `.ts` 文本经 `resolveSyntaxView` 返回非 `null` 且 tokens 非空；双栏渲染中该侧至少出现一个 `[data-syntax]`。
- **ac-threshold-outside-plain**：同一内容补到 `T + 1` 字符后返回 `null`，渲染后该侧 `[data-syntax]` 数量为 0，且行数、每行 `textContent`、行状态与同一内容以 `.txt` 纯文本渲染逐项相等。
- **ac-threshold-boundary-flip**：阈值按折叠后字符数判定，`T` 与 `T + 1` 之间即翻转；同一内容的 LF 与 CRLF 版本折叠后等长时同进同出，不因换行编码改变着色与否。
- **ac-threshold-explicit-timeout**：`src/syntax-perf-gate.test.tsx` 中两个 262,144 规模用例（`highlights a threshold-sized .ts side` 与 `renders one character over the threshold exactly like the .txt plain path`）各自以 `}, 30_000)` 结束；`THRESHOLD` 仍为 `262_144`，两用例的断言（含 `toBeNull` / `syntaxSpans === 0` / 渲染签名相等）与规模未删改；不改 vitest 全局 `testTimeout`，不以本机耗时作为超时证据。
- **ac-single-predicate-preserved**：阈值常量只由 `src/core/syntax` 导出并仅在 `resolveSyntaxView` 内使用；`CodeView` / `DiffPane` 不引用该常量、不含尺寸字面量比较（源码扫描 + 渲染测试双向证明），双栏仍只经同一入口取结果。
- **ac-oversized-not-parsed**：超阈值文本被拒时模块级缓存 `misses` 与 `charCount` 不变（未进 tokenizer），同一次调用不抛错。
- **ac-existing-fallbacks-intact**：未知扩展名、空文本、孤立 `\r`、解析异常仍返回 `null`，既有 `src/core/syntax/view.test.ts` 断言不放宽、不删除。
- **ac-cache-still-bounded**：连续对 40 份不同大文本（每份 ≤ 阈值）调用 `resolveSyntaxView` 后，缓存 `size <= SYNTAX_CACHE_MAX_ENTRIES` 且 `charCount <= SYNTAX_CACHE_MAX_CHARS`；两个上限常量取值保持不变。
- **ac-cache-hit-at-threshold**：阈值内文本可被缓存保留：首次 miss，第二次 hit 且 tokens 与首次一致（阈值不超过缓存字符上限，重复渲染不重解析）。
- **ac-diff-semantics-parity**：同内容对比下，超阈值回落路径与 `.txt` 纯文本路径的四态计数、差异块数、行号、`data-diff-window-start`、`data-diff-content-height` 完全一致。
- **ac-windowing-untouched**：`DIFF_ROW_HEIGHT`、`ROW_OVERSCAN`、`WINDOW_THRESHOLD`、滚动同步与 ruler 跳转零改动（既有窗口化测试不放宽且全绿）。
- **ac-syntax-perf-gate**：`.munk/code-gates.json` 新增 `syntax-perf` gate，覆盖阈值边界、缓存有界与证据一致性断言；`src/munk-gates.test.ts` 门清单同步；`syntax-perf` 与既有 `syntax-core` / `syntax-view` / `test-debt-gate` 等全部门禁全绿。
- **ac-probe-artifact**：`docs/evidence/syntax-perf.json` 与 `.md` 由探针脚本真实运行写入（禁止手填），含每个尺寸档的字节数、字符数、行数、冷/热耗时、tokens 数与缓存读数，以及阈值、判定规则、机器口径（平台 / 架构 / OS 版本 / CPU 型号 / 核数 / 总内存 / Node 版本）、执行命令与时间戳。
- **ac-evidence-path-mapping**：证据 `.md` 与交付说明给出可直接打开的绝对路径，并同时标注 worktree 根与产品仓根（`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/codebases/projects/open-compare`）的映射关系。
- **ac-evidence-threshold-in-sync**：证据 JSON 的 `threshold` 与代码导出常量相等；证据记录阶梯尺寸与「冷启动中位数 ≤ 150 ms 且 ≤ 缓存字符上限」的取值规则，可被 `syntax-perf` gate 复核。
- **ac-screenshot-gate-quiet**：本波不修改 `src/renderer/**` 下任何非测试文件（该门已排除 `*.test.ts(x)`），`release-artifacts-and-brand` 截图门保持绿；若确需改非测试 renderer 文件，必须按既有流程重拍并重钉 `docs/screenshots.md` 的 commit 与 sha256。

- **ac-four-shots-final-build**：四张 PNG 全部由同一次 `pnpm screenshots`（`electron-vite build` + `node scripts/capture-readme-screenshots.mjs`）在 captured commit 的干净工作树上重写；脚本逐张报告 4 个输出文件、字节数与语言注入路径；四张文件 mtime 均晚于本次运行开始时间（证明是重拍而非沿用旧图）。
- **ac-png-dimensions**：四张 PNG 均为 2560×1584（PNG IHDR width/height），均被 git 跟踪且未被 `.gitignore` 忽略。
- **ac-single-captured-commit**：`docs/screenshots.md` 只出现一个 40 位十六进制 captured commit；该 commit 可被 `git cat-file -e` 解析、是 HEAD 的祖先，且 `git diff --quiet <commit>..HEAD -- src/renderer`（排除 `*.test.ts(x)`）为 0，沿用 `release-artifacts-and-brand` 既有守卫口径、不放宽。
- **ac-captured-commit-is-final**：captured commit 为 `59485c0` 或其后代，即含语法高亮渲染与大文件回落的最终合入状态；不得回钉到 `3e0744a` 等未含第二波的旧提交。
- **ac-provenance-per-language**：`docs/screenshots.md` 的 en / zh 两段各自登记 settings 文件路径、key `language`、value `"en"` / `"zh"`、期望 `<html lang>` `en` / `zh-CN`；每张图登记的字节数与 sha256 与该文件实际内容完全一致（由实测写入，禁止手抄）。
- **ac-provenance-honest-src**：`docs/screenshots.md` 不再声称 `src/renderer` 与其余 `src/**` 都零差异；如实表述为 `src/renderer` 相对 captured commit 零差异（`src/core` 的第二波改动允许存在）。
- **ac-readme-en-only**：`README.md` 中所有 `docs/assets/*.png` 引用恰好是 `opencompare-workbench.en.png` 与 `opencompare-file-diff.en.png`，无 zh 图；alt 文本不含 CJK 字符。
- **ac-readme-zh-only**：`README.zh-CN.md` 中所有 `docs/assets/*.png` 引用恰好是 `opencompare-workbench.zh.png` 与 `opencompare-file-diff.zh.png`，无 en 图；alt 文本含 CJK 字符。
- **ac-languages-differ**：同一场景的 en / zh 两张 PNG 字节内容不同（不得同图改名充数）；两 README 互链（`./README.zh-CN.md` / `./README.md`）保持存在。
- **ac-regression-in-gates**：着色前后计数 / 开关 / 复制导出的逐位一致断言由 `.munk/code-gates.json` 中已登记的可执行 gate 覆盖（扩展现有 `syntax-view` / `code-pair-actions` 的测试文件，或新增 gate 并同步 `src/munk-gates.test.ts` 的 `EXPECTED_GATES`）；只在本地手跑一次不算交付。
- **ac-gates-green**：默认 `.munk/code-gates.json` 全量 gate 绿（含 `lint` / `typecheck` / `build` / `build-web` / `test` / `syntax-core` / `syntax-view` / `syntax-perf` 与 `release-artifacts-and-brand` 所在的 `test` 覆盖）。

## 非目标

- 不做分块 / 增量 / 异步解析或 Worker；阈值只做「着色 / 不着色」二元回落。
- 不加用户可见的阈值配置、提示、i18n 文案或状态条；不改缓存双上限数值与 LRU 淘汰策略，不新增第二层缓存。
- 不改 `MergePane` 着色，不给合并 / 结构化 / CSV / 目录视图加语法色。
- 不新增第五个前景色相，不改任何既有 `--color-*` 取值与 `main.css` 四色定义。
- 不做主题选择器、逐语言配置、内容自动探测、编辑器组件（Monaco / CodeMirror）。
- 不改四态计数、忽略开关、复制 / 导出、快照、对比语义、行窗口化与滚动同步实现。
- 不新增 i18n 文案或工具条入口（语法着色无用户开关、无状态提示）。
- 不碰版本语义单点文件，不做 release notes / CHANGELOG / README 版本表变更。
- 不重做截图视觉设计或截图策略；仅按既有门禁要求重拍与重钉 provenance。

## 实现约束

- **复用已交付契约**：经 `@core/syntax` 使用 `languageForPath` / `foldSyntaxText` / `cachedSyntaxTokens` / `overlayLine` / `SyntaxToken`；不复制映射表、不内联扩展名判断、不新增运行时依赖。
- **缓存与偏移同源**：每侧把 `foldSyntaxText(text)` 的同一份折叠文本传给 `cachedSyntaxTokens`（缓存 key 含文本）；行起点由同一份折叠文本按 `\n` 累计，与 `splitLines` 一致。diff 的 `sourceLines` 还识别孤立 `\r`，故含孤立 `\r` 的文本按回落处理而不猜偏移。
- **渲染契约**：token 只用 Tailwind v4 由 `--color-syntax-*` 生成的 `text-syntax-keyword|string|number|comment`，不写新 CSS、不写字面量颜色；`data-syntax="<class>"` 仅供断言；着色模式下 changed 段只叠加既有 soft 背景与下划线，不加 `text-diff-*`；未着色路径 `INLINE_CHANGED_CLASSES` 逐位不变。
- **组件 API 最小扩展**：`DiffPane` 新增可选 `syntaxView`，缺省行为与现状完全一致；只有 `CodeView` 两个调用点传入，`StructuredPanes` 等仅引用常量的调用方不受影响。
- **虚拟化不动**：`DIFF_ROW_HEIGHT` / `ROW_OVERSCAN` / `WINDOW_THRESHOLD`、滚动同步与 ruler 跳转逻辑不修改；叠合在 `DiffRowView` 内对已渲染行完成，每侧 tokens 在 `CodeView` 用 `useMemo` 缓存。
- **单点判定**：`resolveSyntaxView(path, text)` 返回 `{ language, tokens, lineStarts } | null`，内部承担扩展名映射、空文本、孤立 CR、解析异常与超阈值回落（`SYNTAX_MAX_HIGHLIGHT_CHARS`）；遵循 `docs/lessons.md §9`，UI 与门禁共用同一判定。
- **阈值落点与顺序**：`SYNTAX_MAX_HIGHLIGHT_CHARS` 定义并导出在 `src/core/syntax/view.ts`，由 `@core/syntax` 再导出；判定放在 `foldSyntaxText` 之后、`cachedSyntaxTokens` 之前，且仍排在语言映射 / 空文本 / 孤立 `\r` 之后，不改变既有回落优先级。取值由阶梯实测冻结为整数字面量并注释测量依据，重跑探针后 `threshold` 必须与常量一致。
- **测试口径**：渲染断言用 jsdom（`// @vitest-environment jsdom`）并复用 `test/jsdomViewport`；样本为真实 `.ts` / `.py` / `.json` 文本；断言从 DOM / 源码实读，不抄颜色值。
- **门禁注册**：`.munk/code-gates.json` 追加 `syntax-view`（`pnpm test src/core/syntax src/renderer/src/components/DiffPane.syntax.test.tsx src/renderer/src/views/CodeView.syntax.test.tsx src/core/theme/contrast.test.ts`）与第二波 `syntax-perf`（`pnpm test src/core/syntax src/syntax-perf-gate.test.tsx`），保留 `syntax-core`；`src/munk-gates.test.ts` 的 32 门清单同步。
- **已知门禁耦合**：`readme-screenshots` 会在任何被提交的 `src/renderer` 变更后失败；必须先提交渲染变更，再以最终构建的真实 Electron 会话重拍并追加 provenance 重钉提交（参照 `f08d539`），截图像素允许因语法着色变化。
- **验证范围**：只走 `code_gates`（Node / vitest / build），不做浏览器、真机或桌面 GUI 验收检查；截图捕获仅作为既有门禁产物重生成，不作为新增用户场景验收证据。
- **缓存读数出口**：为可测性新增只读统计 `syntaxCacheStats()` → `{ size, charCount, hits, misses }`，由默认缓存提供；不新增淘汰逻辑、不改上限常量。
- **证据探针**：`scripts/syntax-perf.evidence.test.ts`（`vitest.evidence.config.mts` 收集）在系统临时目录生成确定性真实文件、读回磁盘后调用 `resolveSyntaxView`，记录超阈值档拒绝耗时，写 `docs/evidence/syntax-perf.json`（支持 `OPENCOMPARE_SYNTAX_EVIDENCE_OUT` 覆盖）并由同份数据渲染 `.md`；新增 `pnpm measure:syntax`，不进默认门禁矩阵。
- **第二波测试落点**：边界与 DOM 纯文本一致性断言落在 `src/core/syntax/view.test.ts` / `cache.test.ts` 与仓库根 `src/syntax-perf-gate.test.tsx`（复用既有 jsdom 视口工具，参照 `src/diff-normalize-real-gate.test.tsx`），不在 `src/renderer/**` 新增非测试文件以避免截图重钉。
- **规模用例超时纪律**：262,144 字符规模用例在 CI 慢机上会超过 vitest 默认 per-test 超时，必须显式 `}, 30_000)`（沿用 `DiffRuler.scale.test.tsx` / `historySafety.dom.test.tsx` 既有写法）；不得缩规模、删断言或改全局 `testTimeout` 换绿灯，超时补丁只动回调结尾。
- **测试债基线**：新增测试抬高 `repoTestLines` / `repoTestCases`，须按实测同步 `.munk/baseline/test-debt.json` 的 `ceilings` / `floors` 并追加 `growth` 说明，保持 `test-debt-gate` 绿；不得删除或放宽既有断言凑数。

## 最近交付证明

- WI：`wi_intake_c7a93220660b74a9`（`syntax-perf` 两个 262,144 字符规模用例补显式 per-test `30_000` 超时；随 v0.2.23 版本锚点批次交付，`deliveryIntent: local merge`）
- 日期：2026-11-05
- 结果：code_gates passed（32 gates，attempt 002，`.munk/runs/run_intake_c7a93220660b74a9/code-gates/attempts/002`；`syntax-perf` 7 files / 46 tests passed，`pnpm test` 151 files / 2362 passed + 1 skipped（2363））。
- 覆盖摘要：`src/syntax-perf-gate.test.tsx` 的 `highlights a threshold-sized .ts side` 与 `renders one character over the threshold exactly like the .txt plain path` 两个用例回调结尾改为 `}, 30_000)`（+2 / −2，其余行零改动）；`THRESHOLD = 262_144`、`T + 1` 对照与 `resolveSyntaxView(...).toBeNull()` / `[data-syntax]` 数量为 0 / 渲染签名相等断言全部保留；未改 vitest 全局 `testTimeout`、未缩规模、未新增 skip（`ac-threshold-explicit-timeout`）。
- 备注：本 WI change pack 仅 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`）；截图 provenance 未变（`src/renderer` 非测试文件零改动）。
