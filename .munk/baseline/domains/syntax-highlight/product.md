# Domain: syntax-highlight

代码文本文件的同步语法着色「地基波」：纯逻辑层（扩展名映射、整篇 token 化、有界缓存、token×diff 叠合）与四类语法前景色 token、运行时依赖与许可。落在 `src/core/syntax/`（零 Electron / React / DOM，Node 下可被 vitest 直接单测），不接渲染层；渲染接线、大文件阈值与纯文本回落由后续子项承接。

## 范围

- **显式扩展名映射（单一入口）**：按完整路径或裸文件名取最后一段扩展名，大小写不敏感；未知 / 无扩展名 / 空串 / 以点结尾一律返回 `null`，走既有纯文本路径。禁止内容自动探测（不得 `highlightAuto`）。V1 语言集合固定为 typescript / javascript / python / json / yaml / markdown / css / xml / bash。
- **整篇同步 token 化**：一次进入解析器处理整段文本，输出带**整篇字符偏移**的 token 区间，只归到 keyword / string / number / comment 四类前景语义，其余为 plain。块注释、多行字符串 / 模板串的行状态跨行保持；CRLF 在进入解析器前折叠，偏移与 `splitLines` 行起点一致。
- **按文件有界缓存**：按（语言 + 文本）区分条目，`maxEntries` + `maxChars` 双上限，确定性 LRU 淘汰；命中刷新新鲜度，超限文本不驻留但仍返回正确 token。上限可注入以便边界测试，模块级默认值是冻结导出的有限常量。
- **token × 字符级 diff 叠合纯函数**：`overlayLine(lineText, lineStartOffset, tokens, inlineSegments?)` 输出逐行 `{ text, token, changed }` 段；token 只表达前景、`changed` 只表达差异，二者正交叠加，函数本身不产出颜色、不读主题。
- **四类语法前景色 token**：`src/renderer/src/assets/main.css` 两个主题块内各新增同名 `--color-syntax-keyword|string|number|comment`，取值来自既有色相族（关键字蓝 / 字符串绿 / 数字琥珀 / 注释中性灰），不修改任何既有 `--color-*` 取值。
- **运行时依赖与许可**：同步 highlight 系依赖进 `dependencies`（非 dev），锁文件同步，`src/shared/deps.test.ts` 增加可导入守卫，许可原文按 `LICENSES/lucide.txt` 约定存放。

## 验收

- **ac-map-required-six**：`.ts` → typescript、`.tsx` → typescript、`.js` → javascript、`.jsx` → javascript、`.py` → python、`.json` → json；`a.ts` / `a.TS` / `/x/y/a.Tsx` 这类完整路径输入同样命中（取最后一段扩展名）。
- **ac-map-case-insensitive**：`.TS` / `.Json` / `.PY` 等全大写或混合大小写扩展名与对应小写结果相同。
- **ac-map-unknown-fallback**：`.txt`、`.log`、无扩展名的 `Makefile`、空字符串、以点结尾的名字一律返回 `null`，不抛错。
- **ac-map-filename-only**：同一段 TypeScript 源码内容，`.txt` 路径返回 `null`，`.ts` 路径返回 typescript（判定只看文件名，无内容探测）。
- **ac-map-aliases**：`.mjs` / `.cjs` → javascript、`.jsonc` → json、`.yml` / `.yaml` → yaml、`.md` → markdown、`.css` → css、`.html` / `.htm` / `.xml` → xml、`.sh` / `.bash` → bash。
- **ac-map-registry-parity**：映射表出现的每个语言 id 都在 tokenizer 注册表中存在；注册表不含映射表未使用的多余语言（不整包 `common`）。`go` / `rust` / `java` / `c` / `cpp` 等不在 V1 覆盖内。
- **ac-tokenize-whole-document**：含 3 行以上 `/* … */` 块注释与 3 行以上模板字符串的 `.ts` 文本，被覆盖的每一行都产出对应 comment / string 区间；块注释中段无 `/*` 的行仍保持注释类。
- **ac-tokenize-offset-integrity**：所有区间升序、互不重叠、`0 <= start < end <= text.length`；按区间切片拼接后与原文逐字符相等。
- **ac-tokenize-four-classes**：产出的 `class` 只可能是 keyword / string / number / comment 之一；`.ts` / `.py` / `.json` 三个样本各能产出全部四类；不存在第五类语义或颜色名。
- **ac-tokenize-json-classes**：JSON 样本 `{"a": 1, "b": true}` 中属性名 `"a"` 与字符串值归 string 类、`1` 归 number 类、`true` / `false` / `null` 归 keyword 类（jsonc 的 `//` / `/* */` 归 comment 类）。
- **ac-tokenize-empty-and-unknown**：空字符串与零长度输入返回 `[]`；`language === null` 返回 `[]` 且不抛错、不注册任何语言状态。
- **ac-tokenize-crlf-deterministic**：同一文件 CRLF 版本与 LF 版本 token 区间完全相等，保证行映射不错位。
- **ac-cache-hit-single-parse**：同一（语言, 文本）连续取两次，第二次不重新进入解析器（解析调用计数为 1），返回 token 内容相等；命中计数递增。
- **ac-cache-key-separation**：文本相同但语言不同、语言相同但文本不同，各自独立条目，互不复用（不同 key 时解析计数递增）。
- **ac-cache-bounded-lru**：注入 `maxEntries = n` 后插入 n+1 个不同条目，`size` 恒 `<= n`，被淘汰的恰是最近最少使用的那一条；对旧条目 `get` 会刷新其新鲜度，使下一次淘汰换到另一条。
- **ac-cache-char-budget**：注入 `maxChars` 后总驻留字符数 `<= maxChars`；单篇超过 `maxChars` 的文本即时返回正确 token 但不驻留（再取一次解析计数递增）。
- **ac-cache-clear**：`clear()` 后 `size === 0`，再取同一文本会重新解析；模块级默认常量是冻结导出的具体数值，不是 `Infinity` / 无上限。
- **ac-overlay-text-preserved**：任一行（含空白、超长、末尾空格）叠合段拼接后与行文本逐字符相等；段只含 `text` / `token` / `changed` 三个字段，不携带颜色或背景字段。
- **ac-overlay-token-internal-change**：改动完全落在单个 token 内时该 token 被切成三段，前后段 `changed=false`、中段 `changed=true`，三段 token 类相同。
- **ac-overlay-cross-changed**：一个 token 跨越 changed 边界时按边界切开，两侧 token 类相同而 `changed` 不同；changed 区间内的字符全部 `changed=true`。
- **ac-overlay-blank-line**：空行返回空段数组或单个空文本段（两种都必须拼接为 `''`），不抛错；空行位于多行注释中间时行为与前后行一致。
- **ac-overlay-line-end**：行尾追加 / 删除空格使改动触及行尾时，末段 `changed=true` 且文本包含这些空格；行尾未改动时末段 `changed=false`，不丢失尾部片段。
- **ac-overlay-changed-whitespace**：仅由空格 / Tab 组成的 changed 区间保留其文本且 `changed=true`。
- **ac-overlay-no-inline-segments**：不带 `InlineSegment[]` 的行全部字符 `changed=false`，但 token 类照常保留（差异背景由行状态决定，不由叠合函数产出）。
- **ac-syntax-colors-aa**：明暗两套主题下四类 `--color-syntax-*` 对 `surface-base`、`surface-raised`、`surface-sunken`、`diff-added-soft`、`diff-removed-soft`、`diff-modified-soft`、`diff-conflict-soft` 的 `contrastRatio` 全部 `>= 4.5`（AA 小字），断言从 `main.css` 文本实读，不抄色值。
- **ac-syntax-hue-families**：keyword 与 `accent` 色相距离 <= 25°、string 与 `diff-added` <= 25°、number 与 `diff-modified` <= 25°；comment 的 HSV 饱和度 <= 0.25（中性灰）。不存在第五个前景色相。
- **ac-theme-token-parity**：两个主题块新增的 `--color-syntax-*` 名称集合完全相等、均为单个 `#rrggbb`；既有 `--color-*` 取值零改动，`main.css` 仍是唯一颜色定义处。
- **ac-dep-runtime-importable**：新增依赖出现在 `package.json#dependencies`（不进 devDependencies）、`pnpm-lock.yaml` 已同步、`src/shared/deps.test.ts` 增加可导入断言并通过；`package.json#version` 未变。
- **ac-license-texts**：每个新增运行时依赖各有一份 `LICENSES/<pkg>.txt`，内容为该包上游 LICENSE 逐字原文（含 `Package:` / `Version:` / `License:` 头与 SPDX 标识），关键段非空，且与 `node_modules` 实际安装版本的许可证文件一致。

## 非目标

- 不改 `DiffPane` / `CodeView` 等渲染层，不接 React 组件、不写 UI 快照（下一项承接）。
- 不做大文件阈值与纯文本回落；本项不引入文件大小阈值行为，超大文本只通过缓存字符上限避免驻留。
- 不做主题选择器、逐语言配置、内容自动探测、编辑器组件（Monaco / CodeMirror）。
- 不做双语截图、README / `docs/screenshots.md` / `docs/lessons.md` 更新。
- 不碰版本语义单点文件：`package.json` 的 `version`、`CHANGELOG.md`、`README.md` 第 5 行、`release.yml` 的 dispatch 默认 tag、`docs/release-notes/**`。
- 不全量清点既有依赖许可（只补本项新增依赖），不改既有 `--color-*` 取值，不动四态计数 / 忽略开关 / 复制 / 导出语义。

## 实现约束

- **目录与锚点**：`src/core/syntax/` 下映射 / tokenizer / 缓存 / 叠合各一模块 + 同名测试；颜色 token 落 `main.css` 两个主题块；许可落 `LICENSES/<pkg>.txt`（沿用 `LICENSES/lucide.txt` 的原文存放约定）。
- **解析器选型**：`lowlight`（底层 highlight.js）同步 API；必须**同步**、可在 Electron renderer 与 `pnpm build:web` 两条构建链打包、`src/core` 内无 Electron / React / DOM 依赖；只按映射表逐个注册语言，禁止 `common` 整包与 `highlightAuto`。
- **叠合契约锚点（供下一项消费）**：`SyntaxToken { start, end, class }` 使用**整篇**字符偏移；`overlayLine` 返回 `{ text, token: 'keyword'|'string'|'number'|'comment'|null, changed: boolean }[]`；函数不产出颜色、不读主题。
- **缓存注入**：`{ maxEntries, maxChars }` 可注入以便边界测试；模块级默认值为冻结常量（当前 `32` 条 / `262_144` 字符），LRU 顺序确定性（同输入同输出）。
- **四色取值**：只能在既有四色族内选更强变体，不改既有 token 语义；亮暗两套都要求同一 `--color-*` 名集合（既有 theme 断言不放宽）。
- **主链门禁**：`.munk/code-gates.json` 新增 `syntax-core` 门（`pnpm test src/core/syntax src/core/theme/contrast.test.ts`），测试本身不替代门禁。
- **验证口径**：本项只走 `code_gates`（Node / vitest），不做浏览器、真机或桌面 GUI 检查。

## 最近交付证明

- WI：`wi_ws_5210f81460ec7b5c`（语法引擎地基：扩展名映射 / 整篇 token 化 / 有界缓存 / token×diff 叠合；`kind: feature`）
- 日期：2026-11-05
- 结果：code_gates passed（30 gates，attempt 001，`.munk/runs/run_ws_d038e3b669b75186/code-gates/attempts/001`；`pnpm test` 147 files / 2327 passed + 1 skipped（2328）；新增 gate `syntax-core`：6 files / 34 tests passed）。
- 覆盖摘要：`language.ts` 显式扩展名映射（18 个扩展名 → 9 个语言 id，未知返回 `null`）；`tokenize.ts` 用 lowlight 逐个注册 9 种语法并折叠 CRLF，输出整篇偏移的四类前景区间；`cache.ts` 双上限确定性 LRU（默认 32 条 / 262 144 字符，注入式上限），超限不驻留；`overlay.ts` 按 token 与 changed 边界逐字符切段，token 与 changed 正交；`main.css` 明暗两个主题块各新增四个 `--color-syntax-*`，既有 `--color-*` 零改动；`highlight.js` / `lowlight` 进 `dependencies` 并补 `LICENSES/*.txt` 与 `deps.test.ts` 导入守卫。
- 后续注意：① 缓存 key 含全篇文本，调用方必须传折叠 CRLF 后的同一份文本（与 `splitLines` 同源），否则行偏移会错位；② `overlayLine` 只负责前景与 changed，行级差异背景与「same 行左右文本可不同」由渲染层决定，下一项不得假设 same 行两侧逐字相等；③ 映射表与 tokenizer 注册表互相 parity，新增语言必须两处同时改并补 `syntax-core` 覆盖。
