# 双栏文本视图接入语法着色并守住零变更

## 范围

本项是「语法高亮 V1 单闭环」的渲染接线波：把已交付的 `src/core/syntax/` 能力接入双栏文本 diff（`src/renderer/src/views/CodeView.tsx` + `src/renderer/src/components/DiffPane.tsx`），只改这一条用户可见闭环，不改 diff 语义、合并视图与发布口径。

1. **每侧独立选语言**：按该侧路径的显式扩展名调用 `languageForPath`（无内容探测）；左右可以是不同语言，也可以一侧有映射、一侧回落。
2. **整篇一次解析 + 有界缓存**：每侧对折叠 CRLF 后的同一份文本调用 `cachedSyntaxTokens`，一次渲染不按行重复解析。
3. **逐可见行叠合**：用 `overlayLine(lineText, lineStartOffset, tokens, inlineSegments?)` 把整篇 token 与既有字符级 `InlineSegment[]` 压成逐段 `{ text, token, changed }`；只对已渲染（虚拟化窗口内）行计算。
4. **前景 / 背景正交**：语法 token 只输出 `text-syntax-*` 前景；行级差异只用既有 `bg-diff-*-soft`，字符级差异只用既有 soft 背景 + 下划线。语法四色不含红，红只属于 `removed`。
5. **回落**：无映射扩展名、空文本、含孤立 `\r` 的文本、解析异常，以及后续大文件阈值，统一由**一个**纯函数判定为「不着色」，走改动前完全一致的纯文本渲染。
6. **零变更守卫**：四态计数、忽略换行 / 编码 / 空白开关、复制文本、导出文本、行窗口化与滚动映射均不因着色改变；既有渲染测试不放宽。
7. **门禁与 provenance**：新增 `syntax-view` gate；保留 `syntax-core`；处理 `src/renderer` 变更触发的既有 README 截图 provenance 门（重拍 + 重钉，不伪造）。

## 验收

### 双栏着色

- ac-per-side-language: 左 `.ts`、右 `.py` 的同一对比中，两侧分别出现各自语言的关键字 `[data-syntax="keyword"]` 且文本正确；把任一侧路径改为 `.txt` 只让该侧失去全部 `[data-syntax]`，另一侧着色与文本不变。
- ac-four-classes-visible: 真实 `.ts` 样本（含关键字 / 字符串 / 数字 / 注释）双栏渲染后四类 `[data-syntax="keyword"|"string"|"number"|"comment"]` 均存在，且每个 span 的 class 含对应 `text-syntax-*`；`.py` 与 `.json` 样本同样各产出四类（JSON 属性名 / 字符串→string、数字→number、`true`/`false`/`null`→keyword、jsonc 注释→comment）。
- ac-render-text-integrity: 每一渲染行所有 span 文本拼接后与该行原始文本逐字符相等（含空行、缩进、行尾空格、超长行）；同一内容在着色与纯文本两条路径下的 `textContent` 逐位一致。
- ac-crlf-lf-identical: 同一 `.ts` 内容的 LF 与 CRLF 两个版本渲染出的 syntax span 序列（class + 文本）完全一致，行号与行数不变。

### token × 差异正交

- ac-token-internal-change: 改动完全落在单个 token 内（如 `count` → `counter`）时，该 token 的三段保留同一 `data-syntax` 类，只有中段带字符级改动背景；三段文本拼接仍等于该行文本。
- ac-cross-changed: 一个 token 跨越 changed 边界时两侧 token 类相同、changed 只体现在背景；changed 区间内每个字符都带字符级改动背景类。
- ac-background-never-eaten: 任一含 syntax span 的字符上，行状态背景（`bg-diff-*-soft`）与字符级改动背景同时可见：syntax span 自身不带任何 `bg-*` 类，承载它的单元格仍保留行 tone。
- ac-red-only-removed: syntax span 的 class 只来自四个 `text-syntax-*`，不含 `danger` / `diff-removed` 红；红色只出现在 `removed` 行背景与 `removed` 行的字符级改动标记上。
- ac-syntax-mode-foreground: 语法着色生效时，字符级 changed 段不覆盖 token 前景（changed 只叠加背景与下划线）；未着色路径的渲染与改动前逐位一致（既有 `INLINE_CHANGED_CLASSES` 行为不变）。

### 回落与单一入口

- ac-unknown-extension-plain: `.txt` / 无扩展名 / 空路径的文本对渲染出零个 `[data-syntax]`，且与改动前纯文本 DOM 结构一致；同样 TypeScript 内容放进 `.txt` 路径仍不着色（无内容探测）。
- ac-empty-and-error-fallback: 任一侧为空文本时该侧零 syntax span、不抛错；token 结果为空或解析抛错时该侧回落纯文本，另一侧照常着色，页面不崩。
- ac-lone-cr-fallback: 含孤立 `\r`（非 CRLF）的文本按回落处理为纯文本，不出现错位着色或 off-by-one 行偏移。
- ac-single-mode-predicate: 「是否着色」由一个导出的纯函数按（路径, 文本）判定，未知扩展名 / 空文本 / 需回落时返回 `null`；双栏两个面板都通过它取结果，渲染层不存在第二处扩展名判断分支，后续大文件阈值只在这一个入口扩展。

### 功能零变更

- ac-counts-parity: 同一内容分别以 `.ts` 与 `.txt` 路径打开，`[data-code-diff-count]`、差异块计数（`x/y`）、每行状态与行号完全一致。
- ac-switch-parity: 忽略换行 / 编码 / 空白三个开关逐个切换后，着色与否不改变四态计数、块边界、行状态与行号。
- ac-copy-export-parity: 双栏复制仍复制同一路径字符串；合并视图的复制 / 导出文本与改动前逐字节一致（合并渲染路径未被语法着色触碰），既有导出门禁与未解决冲突禁用条件不变。
- ac-windowing-preserved: 350k 行大 diff 仍只渲染视口 + overscan 行，`data-diff-window-start`、`data-diff-content-height` 与滚动同步不变；叠合只发生在已渲染行，行高与滚动映射不受影响。
- ac-existing-tests-unmodified: 既有 `DiffPane.test.tsx`、`CodeView.test.tsx`、`CodeView.switches.test.tsx`、`CodeView.ruler*.test.tsx` 在不放宽、不删除断言的前提下全绿。
- ac-parse-once-per-side: 一次渲染中每侧整篇 token 化最多 1 次（缓存命中不重复解析），tokenizer 调用次数不随行数线性增长。

### 门禁与版本锚

- ac-syntax-view-gate: `.munk/code-gates.json` 新增 `syntax-view` gate，命令覆盖新增渲染测试 + `src/core/syntax` + `src/core/theme/contrast.test.ts`；该 gate 与其余门禁全绿，测试文件本身不替代 gate。
- ac-theme-render: `data-theme` 为 `light` 与 `dark` 时渲染出的 syntax class 序列完全相同（颜色只经 `--color-syntax-*` token），渲染代码零 `#hex` / `rgb()` / `hsl()` 字面量（既有 `themeSources` 扫描保持全绿），明暗 AA 由既有 `syntax/theme.test.ts` 继续覆盖。
- ac-core-boundary: `src/core/**` 不新增 Electron / React / DOM 依赖（lint `no-restricted-imports` 全绿），renderer 只经 `@core/syntax` 入口消费且不新增运行时依赖；`pnpm typecheck` / `pnpm build` / `pnpm build:web` 全绿。
- ac-version-anchors-untouched: `package.json#version`、`CHANGELOG.md`、`README.md` 第 5 行、`.github/workflows/release.yml` 的 dispatch 默认 tag、`docs/release-notes/**` 零改动。
- ac-screenshot-provenance: 因 `src/renderer` 变更会触发既有 `readme-screenshots` 门，须在渲染变更提交后重跑 `pnpm screenshots`，并把 `docs/screenshots.md` 的 captured commit 与四张 PNG 的字节数 / sha256 重钉到该提交；README 图片引用与中英隔离不变，禁止只改 commit 字段或手写 sha。

## 非目标

- 不做大文件阈值与阈值两侧行为（第二波）；本项只为它留单一可判定入口，不引入新的尺寸分支。
- 不改三向合并视图（`MergePane`）的着色，不给合并 / 结构化 / CSV / 目录视图加语法色。
- 不新增第五个前景色相，不改任何既有 `--color-*` 取值，不改 `main.css` 四色定义（已交付）。
- 不做主题选择器、逐语言配置、内容自动探测、编辑器组件（Monaco / CodeMirror）。
- 不改四态计数、忽略开关、复制 / 导出、快照、对比语义、行窗口化与滚动同步的实现。
- 不新增 i18n 文案或工具条入口（语法着色无用户开关、无状态提示）。
- 不碰版本语义单点文件（见 ac-version-anchors-untouched），不做 release notes / CHANGELOG / README 版本表变更。
- 不重做截图视觉设计或截图策略；仅按既有门禁要求重拍与重钉 provenance。

## 实现约束

- **复用已交付契约**：经 `@core/syntax` 入口使用 `languageForPath` / `foldSyntaxText` / `cachedSyntaxTokens` / `overlayLine` / `SyntaxToken`；不复制映射表、不内联扩展名判断、不新增运行时依赖。
- **缓存与偏移同源**：每侧必须把 `foldSyntaxText(text)` 的同一份折叠文本传给 `cachedSyntaxTokens`（缓存 key 含文本），否则整篇偏移错位；行起点由同一份折叠文本按 `\n` 累计得到，与 `splitLines` 行起点一致。diff 的 `sourceLines` 还识别孤立 `\r`，因此含孤立 `\r` 的文本按回落处理而不是猜偏移。
- **渲染契约**：token 只用 Tailwind v4 由 `--color-syntax-*` 生成的 `text-syntax-keyword|string|number|comment`，不写新 CSS、不写字面量颜色；`data-syntax="<class>"` 仅供断言。着色模式下 changed 段只叠加既有 soft 背景与下划线，不加 `text-diff-*`；未着色路径保持现有 `INLINE_CHANGED_CLASSES` 逐位不变。
- **组件 API 最小扩展**：`DiffPane` 新增可选的语法视图参数（如每侧 tokens + lineStarts，或一个已解析的 view 对象），缺省时行为与现状完全一致；只有 `CodeView` 两个调用点传入，`StructuredPanes` 等仅引用常量的调用方不受影响。
- **虚拟化不动**：`DIFF_ROW_HEIGHT` / `ROW_OVERSCAN` / `WINDOW_THRESHOLD`、滚动同步与 ruler 跳转逻辑不修改；叠合在 `DiffRowView` 内对已渲染行完成，每侧 tokens 在 `CodeView` 用 `useMemo` 缓存。
- **单点判定**：新增导出的纯函数（如 `resolveSyntaxView(path, text)`）返回 `{ language, tokens, lineStarts } | null`，内部承担扩展名映射、空文本、孤立 CR、解析异常与第二波阈值；遵循 `docs/lessons.md §9`，UI 与门禁共用同一判定，不得各留一份。
- **测试口径**：渲染断言使用 jsdom（`// @vitest-environment jsdom`）并复用 `test/jsdomViewport`；样本必须是真实 `.ts` / `.py` / `.json` 文本，不用只含 plain 的占位内容。断言从 DOM / 源码实读，不抄颜色值。
- **已知门禁耦合**：`pnpm test` 内的 `readme-screenshots` 会在任何被提交的 `src/renderer` 变更后失败（前一项仅新增未使用 CSS 变量也触发）。必须先提交渲染变更，再以最终构建真实 Electron 会话重拍并追加 provenance 重钉提交（参照 `f08d539` 的做法）；截图像素允许因语法着色变化。
- **门禁注册**：`.munk/code-gates.json` 追加 `syntax-view`（新渲染测试 + `src/core/syntax` + `src/core/theme/contrast.test.ts`），保留 `syntax-core`。
- **验证范围**：只走 `code_gates`（Node / vitest / build），不做浏览器、真机或桌面 GUI 验收检查；截图捕获仅作为既有门禁的产物重生成，不作为本项新增的用户场景验收证据。
- **证据**：交付说明为每个 ac 给出绝对路径（worktree 根与产品仓根映射）与本轮 code_gates attempt 目录；`docs/screenshots.md` 的 provenance 行按既有格式登记。
