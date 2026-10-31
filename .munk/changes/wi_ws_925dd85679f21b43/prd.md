# JSON/YAML 路径定位核心

## 范围

在 `src/core/structured/` 新增独立模块 `locate.ts`（纯函数，零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接跑），把 `diffStructured` 已产出的 JSON Pointer 路径映射为**某一侧原文**的 1-based 行/列区间；配套新增 `locate.test.ts` 与 `__fixtures__/locate/` 真实文件样本。既有 `diff.ts` / `parse.ts` / `diff.test.ts` 零改动。

### 导出契约（Coding 必须照此实现）

```ts
export interface SourceRange {
  readonly startLine: number // 1-based
  readonly startColumn: number // 1-based，按 UTF-16 code unit 计
  readonly endLine: number // 1-based，含末字符
  readonly endColumn: number
  readonly path: string // 实际命中的路径；exact 为 true 时等于请求路径
  readonly exact: boolean // false = 该侧不存在该节点，回退到最近既有祖先
}

export interface StructuredLocator {
  locate(path: string): SourceRange
}

export function createStructuredLocator(text: string, format: StructuredFormat): StructuredLocator
export function locateStructuredPath(
  text: string,
  format: StructuredFormat,
  path: string
): SourceRange
```

### 语义规则

1. 解析容错与 `parseStructured` **完全对齐**（JSONC：注释 + 尾逗号；YAML：`yaml` 默认单文档）。`parseStructured` 能解析的文本，locator 必须同样不抛错；不能解析的文本抛 `StructuredParseError`。
2. pointer 以 `/` 切段；空字符串 `''` 表示文档根。
3. 段反转义：先把 `~1` 还原成 `/`，再把 `~0` 还原成 `~`（RFC 6901 顺序），不得颠倒。
4. 对象按键名匹配（比较反转义后的键）；数组段必须匹配 `^(0|[1-9][0-9]*)$` 才按索引取，其余视为不命中。
5. 区间覆盖「该节点的值」，不含键 token、注释、空行、行尾换行：
   - 标量：字面 token 本身（带引号字符串含引号；YAML 块标量从 `|` / `>` 指示符起，到最后一行内容止）；
   - 容器：JSON `{`…`}` / `[`…`]` 全量；YAML 块映射 / 序列从首键或首个 `-` 起，到最后一个值字符止；
   - 根：整个文档值，不含前导空白 / 注释和尾随空白 / 注释。
6. 该侧不存在该节点时（单侧 added / removed 的缺失侧、数组越界、容器/标量类型不匹配）：逐段下钻到最深仍存在的祖先，返回该祖先区间，`exact:false`、`path` 为祖先路径；祖先全不存在则回退根（`path:''`）。
7. 非法 pointer（不以 `/` 开头）：回退根，`exact:false`。
8. 同一 locator 构建后多次 locate 不重复全量解析文本，只按段下钻；相同 path 重复调用结果恒定。

## 验收

- ac-pointer-unescape: `{"a/b":1,"m~n":2,"~0":3}` 上 `locateStructuredPath(text,'json','/a~1b')`、`('/m~0n')`、`('/~00')` 均 `exact:true`，原文切片分别为 `1`、`2`、`3`。
- ac-json-object-key: 多行 JSONC 中 `/service/name` 返回该成员**值** token 区间（首字符为值起始引号，不含键 token），行列与原文实际位置一致。
- ac-json-container-range: 指针指向对象 / 数组值时区间从开括号到闭括号（原文切片首尾分别为 `{`/`}` 或 `[`/`]`）；跨行时 `startLine < endLine`。
- ac-array-index: `{"items":[10,20,30]}` 的 `'/items/1'` 原文切片为 `20`；`'/items/02'` 与 `'/items/3'` 返回 `exact:false` 且 `path === '/items'`。
- ac-single-side-ancestor-fallback: 右侧多出 `/a/b/c` 时，左侧 `locate('/a/b/c')` → `exact:false`、`path==='/a/b'`、区间等于左侧 `/a/b` 的值区间；右侧同路径 `exact:true`。
- ac-root-fallback: 请求 `/x/y` 而两侧都没有 `x` → 返回根区间、`path===''`、`exact:false`。
- ac-root-pointer: `''` 返回整文档值区间：`startLine/startColumn` 指向首个非空白值字符，`endLine/endColumn` 指向最后一个值字符（前导注释、尾随空白与末尾换行均不含）。
- ac-yaml-block-mapping: 真实 YAML 文件 ≥8 层块映射中，逐层 pointer 定位返回值所在行号与文件真实行号一致，区间不含 `#` 注释行与空行。
- ac-yaml-quoted-key: YAML 键 `"a: b"` 与 `'x y'` 反转义后按原键名匹配，`'/a: b'` 与 `'/x y'` 均 `exact:true`。
- ac-yaml-block-scalar: 块标量 `|` 的指针区间从 `|` 所在行起、到最后一行内容行止，`endLine` 为最后一行内容行，区间文本不含后续兄弟键。
- ac-format-noise-independence: 语义相同的 JSON 紧凑版与 JSONC 注释版分别定位同一路径，互不复用坐标，各自命中各自原文；对象键序打乱不影响定位结果。
- ac-parse-parity: 对噪声样本（JSONC 注释 + 尾逗号、YAML 注释 + 引号键），`parseStructured` 能解析时 locator 不抛错；对同一不可解析样本两者都抛 `StructuredParseError`。
- ac-diff-paths-resolve: 对 `diffStructured(left,right,format).entries` 每条 entry，存在侧 `locate(path)` 返回 `exact:true` 且 `path` 相同；缺失侧 `exact:false` 且返回的 `path` 是请求路径按段的真前缀（或 `''`）。
- ac-real-fixtures: `src/core/structured/__fixtures__/locate/` 下 4 个真实文件（JSON 左/右、YAML 左/右，含注释 / 缩进 / 引号噪音、≥8 层嵌套、单侧新增与单侧删除）经 `node:fs` 读入后，定位结果的原文切片与期望值逐字相等，行号与文件真实行号一致。
- ac-locate-idempotent: 同一 locator 交替调用多个 path 各 100 次，每次返回深相等结果，互不影响。
- ac-existing-diff-intact: `src/core/structured/diff.ts`、`parse.ts`、`diff.test.ts` 零改动，`pnpm test` 全绿，`pnpm typecheck`、`pnpm lint` 通过。

## 非目标

- 不做行 → 节点反向索引（原文反选）、UI 高亮、双栏同步滚动、过滤 / 切 tab 位置保持（后续子项）。
- 不做 renderer Worker / 后台化、5 MB 大文件性能与原文窗口化（后续子项）。
- 不改 `diffStructured` / `parseStructured` 的签名、五态口径、JSON Pointer 格式与计数；不重写或弱化既有测试。
- 不新增 `.munk/code-gates.json` 结构化语义门（另立子项）；不动扩展名白名单、主进程 IPC、发布口径。
- 不做 YAML alias / merge key 展开、锚点解引用、多文档、重复键策略；不做 JSONPath 查询、schema 校验、编辑写回。
- 不做 CRLF/LF 与编码归一化（I#9 挂账），不处理 UTF-8 BOM。
- 不新增运行时依赖、不改构建配置、不改 `src/renderer` / `src/main` / `src/shared`；无用户可见文案，不涉及 i18n。

## 实现约束

- 新模块固定落在 `src/core/structured/locate.ts`；只依赖 `./parse`、`jsonc-parser`、`yaml` 与标准库，禁止 electron / react / DOM（ESLint `no-restricted-imports` 已强制）。
- 取 offset 复用两个既有解析库的 AST：JSON 用 `jsonc-parser` 的 `parseTree` / 节点 `offset` + `length`（`allowTrailingComma: true`、`disallowComments: false`，与 `parseStructured` 同参数）；YAML 用 `parseDocument` 的节点 `range`。不手写完整 JSON / YAML 词法，避免与 `parseStructured` 出现两套接受口径。
- 不得修改 `diff.ts` 的 `escapeSegment`；反转义函数放 `locate.ts`。
- 构建时缓存原文与每行起始 offset，locate 时用 offset 换算行列；`createStructuredLocator` 只解析一次，后续 locate 为按段下钻。
- 测试文件 `src/core/structured/locate.test.ts`；真实样本放 `src/core/structured/__fixtures__/locate/`（**不要**占用后续语义门子项的 `__fixtures__/real/`），用 `node:fs` 读取，随本项提交。
- 质量门走既有 gate：`pnpm test`、`pnpm typecheck`、`pnpm lint`（含 `pnpm build` 不因新模块挂掉），不新增 gate id。
