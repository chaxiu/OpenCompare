# Domain: syntax-view

双栏文本视图的语法着色接线波：把已交付的 `src/core/syntax/` 纯逻辑接进 `src/renderer/src/views/CodeView.tsx` 与 `src/renderer/src/components/DiffPane.tsx`，每侧独立判定、整篇一次解析、逐可见行与字符级差异正交叠合，同时守住四态计数 / 忽略开关 / 复制导出 / 虚拟化的零变更与既有 README 截图 provenance 门。上游地基见 `domains/syntax-highlight`。

## 范围

- **每侧独立选语言**：按该侧路径的显式扩展名调用 `languageForPath`（无内容探测）；左右可为不同语言，也可一侧有映射、一侧回落。
- **整篇一次解析 + 有界缓存**：每侧把 `foldSyntaxText(text)` 的同一份折叠文本交给 `cachedSyntaxTokens`，一次渲染不按行重复解析。
- **逐可见行叠合**：`overlayLine(lineText, lineStartOffset, tokens, inlineSegments?)` 把整篇 token 与既有字符级 `InlineSegment[]` 压成逐段 `{ text, token, changed }`，只对虚拟化窗口内已渲染行计算。
- **前景 / 背景正交**：语法 token 只输出 `text-syntax-*` 前景；行级差异只用既有 `bg-diff-*-soft`，字符级差异只用 soft 背景 + 下划线；语法四色不含红，红只属于 `removed`。
- **回落**：无映射扩展名、空文本、含孤立 `\r`，以及解析异常、后续大文件阈值，统一由**一个**导出纯函数判定为「不着色」，走改动前一致的纯文本渲染。
- **零变更守卫**：四态计数、忽略换行 / 编码 / 空白开关、复制文本、导出文本、行窗口化与滚动映射均不因着色改变；既有渲染测试不放宽。
- **门禁与 provenance**：`.munk/code-gates.json` 新增 `syntax-view` gate 并保留 `syntax-core`；`src/renderer` 变更触发既有 `readme-screenshots` 门，须重跑 `pnpm screenshots` 并把 `docs/screenshots.md` 的 captured commit 与四张 PNG 的字节数 / sha256 重钉到该提交。

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
- **ac-counts-parity**：同一内容分别以 `.ts` 与 `.txt` 路径打开，`[data-code-diff-count]`、差异块计数（`x/y`）、每行状态与行号完全一致。
- **ac-switch-parity**：忽略换行 / 编码 / 空白三个开关逐个切换后，着色与否不改变四态计数、块边界、行状态与行号。
- **ac-copy-export-parity**：双栏复制仍复制同一路径字符串；合并视图的复制 / 导出文本与改动前逐字节一致（合并渲染路径未被着色触碰），既有导出门禁与未解决冲突禁用条件不变。
- **ac-windowing-preserved**：350k 行大 diff 仍只渲染视口 + overscan 行，`data-diff-window-start`、`data-diff-content-height` 与滚动同步不变；叠合只发生在已渲染行，行高与滚动映射不受影响。
- **ac-existing-tests-unmodified**：既有 `DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.switches.test.tsx`、`CodeView.ruler*.test.tsx` 在不放宽、不删除断言的前提下全绿。
- **ac-parse-once-per-side**：一次渲染中每侧整篇 token 化最多 1 次（缓存命中不重复解析），tokenizer 调用次数不随行数线性增长。
- **ac-syntax-view-gate**：`syntax-view` gate 覆盖新增渲染测试 + `src/core/syntax` + `src/core/theme/contrast.test.ts`，与其余门禁全绿；测试文件本身不替代 gate。
- **ac-theme-render**：`data-theme` 为 `light` / `dark` 时渲染出的 syntax class 序列完全相同（颜色只经 `--color-syntax-*`），渲染代码零 `#hex` / `rgb()` / `hsl()` 字面量；明暗 AA 由既有 `syntax/theme.test.ts` 覆盖。
- **ac-core-boundary**：`src/core/**` 不新增 Electron / React / DOM 依赖，renderer 只经 `@core/syntax` 入口消费且不新增运行时依赖；`pnpm typecheck` / `pnpm build` / `pnpm build:web` 全绿。
- **ac-version-anchors-untouched**：`package.json#version`、`CHANGELOG.md`、`README.md` 第 5 行、`release.yml` dispatch 默认 tag、`docs/release-notes/**` 零改动。
- **ac-screenshot-provenance**：渲染变更提交后重跑 `pnpm screenshots`，把 `docs/screenshots.md` 的 captured commit 与四张 PNG 的字节数 / sha256 重钉到该提交；README 图片引用与中英隔离不变，禁止只改 commit 字段或手写 sha。

## 非目标

- 不做大文件阈值与阈值两侧行为（第二波）；本项只为它留单一可判定入口，不引入新的尺寸分支。
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
- **单点判定**：`resolveSyntaxView(path, text)` 返回 `{ language, tokens, lineStarts } | null`，内部承担扩展名映射、空文本、孤立 CR、解析异常与第二波阈值；遵循 `docs/lessons.md §9`，UI 与门禁共用同一判定。
- **测试口径**：渲染断言用 jsdom（`// @vitest-environment jsdom`）并复用 `test/jsdomViewport`；样本为真实 `.ts` / `.py` / `.json` 文本；断言从 DOM / 源码实读，不抄颜色值。
- **门禁注册**：`.munk/code-gates.json` 追加 `syntax-view`（`pnpm test src/core/syntax src/renderer/src/components/DiffPane.syntax.test.tsx src/renderer/src/views/CodeView.syntax.test.tsx src/core/theme/contrast.test.ts`），保留 `syntax-core`；`src/munk-gates.test.ts` 的 31 门清单同步。
- **已知门禁耦合**：`readme-screenshots` 会在任何被提交的 `src/renderer` 变更后失败；必须先提交渲染变更，再以最终构建的真实 Electron 会话重拍并追加 provenance 重钉提交（参照 `f08d539`），截图像素允许因语法着色变化。
- **验证范围**：只走 `code_gates`（Node / vitest / build），不做浏览器、真机或桌面 GUI 验收检查；截图捕获仅作为既有门禁产物重生成，不作为新增用户场景验收证据。

## 最近交付证明

- WI：`wi_ws_cc70f61b58347b77`（语法着色接线：双栏每侧独立判定 / 单点回落 / token×差异正交叠合 / 零变更守卫）
- 日期：2026-11-05
- 结果：code_gates passed（31 gates，attempt 002，`.munk/runs/run_ws_99a53c01da964134/code-gates/attempts/002`；`pnpm test` 150 files / 2345 passed + 1 skipped（2346）；新增 gate `syntax-view`：9 files / 52 tests passed）。
- 覆盖摘要：新增 `src/core/syntax/view.ts` 的 `resolveSyntaxView` 单一入口（扩展名映射 + CRLF 折叠 + 缓存整篇 token + 孤立 `\r` / 空文本 / 空 token / 解析异常回落 `null`）并从 `@core/syntax` 导出；`CodeView` 每侧 `useMemo` 解析并传入 `DiffPane`；`DiffPane` 新增可选 `syntaxView`，`DiffRowView` 对已渲染行调用 `overlayLine` 输出 `text-syntax-*` 前景 span 与仅背景 + 下划线的 changed 外层 span，行 tone 仍由单元格承载；新增 `DiffPane.syntax.test.tsx` / `CodeView.syntax.test.tsx` 覆盖上述 AC；`syntax-view` gate 与 test-debt 记录同步。
- 后续注意：① `overlayLine` 的 `lineStartOffset` 必须来自 `resolveSyntaxView.lineStarts`（同一份折叠文本），自行按 `splitLines` 重算会在 CRLF 文本上错位；② 大文件阈值第二波只能加在 `resolveSyntaxView` 内，否则双栏会出现第二处判定分支；③ 任何后续 `src/renderer` 提交都会再次触发 `readme-screenshots`，需再次重拍重钉。
