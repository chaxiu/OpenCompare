# Domain: structured

JSON / YAML 结构化语义归一化对比域（场景 D）：`src/core/structured/` 的纯算法引擎（解析即归一化 + 按 JSON Pointer 节点路径比对 + 节点路径回映原文行列区间）与 `StructuredView` 的节点路径变更视图（状态过滤、运行时计数、左右原文对照、内置场景格式切换、目录下钻 ad-hoc 数据源、解析错误态）。目录对比 / 代码文本 Diff / 三向合并 / CSV 主键对齐不属本域。

## 范围

- **结构化语义归一化引擎（`src/core/structured/`，纯算法，零 Electron / DOM）**：输入 JSON / YAML 原文，解析为语义树——对象按**键名无序**（键序打乱视为相同）、数组按**索引有序**；**解析即归一化**，注释 / 缩进 / 空白 / 空行 / 尾逗号 / 引号风格等格式噪音自然丢弃。
  - 解析层 `parse.ts`：JSON 经 `jsonc-parser`（容忍注释与尾逗号），YAML 经 `yaml` 库默认解析；空文档与解析失败抛 `StructuredParseError`（含 side、行/列定位）。
  - 比对层 `diff.ts`：按**节点路径**（JSON Pointer，如 `/service/features/limits/maxBytes`，数组用索引段）递归比对，产出扁平节点变更序列 `StructuredChange[]`，每项含 `path` / `status` / 可渲染的标量原值→新值（`left` / `right`）与 `leftType` / `rightType`。
  - 状态分类 `added` / `removed` / `modified` / `typeChanged` / `same`；**类型变更（number↔string、对象↔标量、标量↔数组、数组↔对象等）单列 `typeChanged`，绝不折叠进 `modified`**。
  - 新增 / 删除的容器只记一条路径（子孙不展开计数）；`modified` / `typeChanged` 只记在叶值上。对象按排序键并集遍历，输出与输入键序无关。
  - 运行时汇总各状态计数 `counts`（不读样本 `composition` 答案键）；JSON 与 YAML 各自独立对比，不做跨格式比对。
  - 定位层 `locate.ts`：把 `diffStructured` 已产出的 JSON Pointer 路径映射为**某一侧原文**的 1-based 行/列区间（`SourceRange`）；对外 `createStructuredLocator(text, format)`（只解析一次，多次 `locate` 按段下钻）与 `locateStructuredPath(text, format, path)`。命中返回该节点**值**的区间（不含键 token / 注释 / 空行 / 行尾换行）；该侧不存在该节点时逐段下钻到最深仍存在的祖先并标 `exact:false`，祖先全无则回退根（`path:''`）。解析容错与 `parseStructured` 完全对齐，不可解析文本抛同一个 `StructuredParseError`。
- **节点路径变更视图（`StructuredView.tsx`）**：一键状态过滤 `全部 / 新增 / 删除 / 修改 / 类型变更 / 相同`（即时生效，仅收窄列表，计数恒为当前对比结果运行时全集）；变更列表逐行展示状态标签、JSON Pointer 路径与原值 → 新值（状态色走差异语义 token `--color-diff-*` / `DiffBadge`，`typeChanged` 用 conflict 色调区分于 `modified`）；同屏左右原文对照（`CodeBlock`）；内置场景 JSON / YAML 格式切换（`SegmentedControl`）。对比计算经 `structured-async-compare` 域在 renderer 后台执行，等待期渲染「对比中」加载态且过滤 / 格式控件仍可操作；结果落地后计数与列表中英双语与同步实现等价。
- **两类数据源同一套引擎**：内置样本场景 `STRUCTURED_SCENE`（json/yaml 两对，可切换格式）与目录树双击下钻传入的 ad-hoc `pair`（含 `format`，格式固定、不显示格式切换控件）。
- **解析错误态**：非法 JSON / YAML 给出可读错误提示（`StateView` 危险态），不崩溃、不白屏，左右原文与其余会话仍可用。
- **本地结构化文件入口（`StructuredView` 顶栏）**：经 `PlatformPort.selectFile` 分别打开左 / 右本地 `.json` / `.yaml` 文件，按扩展名判定格式并重算语义差异；打开非 JSON/YAML 或解析失败时展示可读错误态而非崩溃。

## 验收

- **ac-key-order-noise**：两份语义相同但对象键序打乱、嵌套深度相同的 JSON 与 YAML 各一组输入，对比结果中**所有节点状态均为「相同」**，新增 / 删除 / 修改 / 类型变更计数均为 0。
- **ac-format-noise**：仅注释、缩进、空行、尾逗号、键内引号风格不同的两份 JSON/YAML，不产生任何差异项。
- **ac-path-changes**：深层嵌套键值变更、键新增与键删除按 JSON Pointer 节点路径逐条列出，并给出原值 → 新值（示例可核：`/service/features/limits/maxBytes` 为新增、`/telemetry/enabled` 为修改、`/service/version` 为类型变更）。
- **ac-type-change**：类型变更（`2` → `"2.0.0"`、标量 → 对象、对象 → 数组）单独归类为「类型变更」，与普通数值 / 字符串修改在列表与计数中分开呈现。
- **ac-filter**：状态过滤（全部 / 新增 / 删除 / 修改 / 类型变更 / 相同）一键切换后列表立即收窄到对应状态；切回「全部」恢复完整列表。
- **ac-counts**：计数按运行时对比结果统计（不读样本答案键），新增 + 删除 + 修改 + 类型变更 + 相同 = 参与对比的节点条目总数，且过滤操作不改变计数。
- **ac-format-switch-and-drilldown**：内置场景可在 JSON 与 YAML 之间切换并各自展示对应对比结果；从目录对比下钻的 `.json/.yaml` 会话以既定格式直接展示语义对比结果（不显示格式切换）。
- **ac-raw-pair-visible**：对比列表与左右原文对照可同屏查看（左右原文仍在视图中可见）。
- **ac-parse-error**：非法 JSON 或非法 YAML 输入展示可读错误提示，应用不崩溃，其他会话仍可用。
- **ac-structured-open**：`StructuredView` 顶栏可分别打开左 / 右本地 JSON / YAML 文件并重算语义差异（变更/节点计数随之更新）；打开非 JSON/YAML 或解析失败时显示错误态而非崩溃，左/右原文与其它会话仍可用；取消时不变更现有对比。
- **ac-core-tests**：`src/core/structured/` 有 vitest 用例覆盖键序归一化、格式噪音忽略、深层路径增删改、类型变更与计数；`pnpm test` 全绿。
- **ac-pointer-unescape**：`{"a/b":1,"m~n":2,"~0":3}` 上 `locateStructuredPath(text,'json','/a~1b')`、`('/m~0n')`、`('/~00')` 均 `exact:true`，原文切片分别为 `1`、`2`、`3`（先 `~1`→`/` 再 `~0`→`~` 的 RFC 6901 顺序，不得颠倒）。
- **ac-json-object-key**：多行 JSONC 中 `/service/name` 返回该成员**值** token 区间（首字符为值起始引号，不含键 token），行列与原文实际位置一致。
- **ac-json-container-range**：指针指向对象 / 数组值时区间从开括号到闭括号（原文切片首尾分别为 `{`/`}` 或 `[`/`]`）；跨行时 `startLine < endLine`。
- **ac-array-index**：`{"items":[10,20,30]}` 的 `'/items/1'` 原文切片为 `20`；`'/items/02'` 与 `'/items/3'` 返回 `exact:false` 且 `path === '/items'`（数组段须匹配 `^(0|[1-9][0-9]*)$`）。
- **ac-single-side-ancestor-fallback**：右侧多出 `/a/b/c` 时，左侧 `locate('/a/b/c')` → `exact:false`、`path==='/a/b'`、区间等于左侧 `/a/b` 的值区间；右侧同路径 `exact:true`。
- **ac-root-fallback**：请求 `/x/y` 而两侧都没有 `x` → 返回根区间、`path===''`、`exact:false`；非法 pointer（不以 `/` 开头）同样回退根并 `exact:false`。
- **ac-root-pointer**：`''` 返回整文档值区间：`startLine/startColumn` 指向首个非空白值字符，`endLine/endColumn` 指向最后一个值字符（前导注释、尾随空白与末尾换行均不含）。
- **ac-yaml-block-mapping**：真实 YAML 文件 ≥8 层块映射中，逐层 pointer 定位返回值所在行号与文件真实行号一致，区间不含 `#` 注释行与空行。
- **ac-yaml-quoted-key**：YAML 键 `"a: b"` 与 `'x y'` 反转义后按原键名匹配，`'/a: b'` 与 `'/x y'` 均 `exact:true`。
- **ac-yaml-block-scalar**：块标量 `|` 的指针区间从 `|` 所在行起、到最后一行内容行止，`endLine` 为最后一行内容行，区间文本不含后续兄弟键。
- **ac-format-noise-independence**：语义相同的 JSON 紧凑版与 JSONC 注释版分别定位同一路径，互不复用坐标，各自命中各自原文；对象键序打乱不影响定位结果。
- **ac-parse-parity**：对噪声样本（JSONC 注释 + 尾逗号、YAML 注释 + 引号键），`parseStructured` 能解析时 locator 不抛错；对同一不可解析样本两者都抛 `StructuredParseError`。
- **ac-diff-paths-resolve**：对 `diffStructured(left,right,format).entries` 每条 entry，存在侧 `locate(path)` 返回 `exact:true` 且 `path` 相同；缺失侧 `exact:false` 且返回的 `path` 是请求路径按段的真前缀（或 `''`）。
- **ac-real-fixtures**：`src/core/structured/__fixtures__/locate/` 下 4 个真实文件（JSON 左/右、YAML 左/右，含注释 / 缩进 / 引号噪音、≥8 层嵌套、单侧新增与单侧删除）经 `node:fs` 读入后，定位结果的原文切片与期望值逐字相等，行号与文件真实行号一致。
- **ac-locate-idempotent**：同一 locator 交替调用多个 path 各 100 次，每次返回深相等结果，互不影响。
- **ac-existing-diff-intact**：`src/core/structured/diff.ts`、`parse.ts`、`diff.test.ts` 零改动，`pnpm test` 全绿，`pnpm typecheck`、`pnpm lint` 通过。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- **不做结构化编辑 / 合并 / 写回**：不做一键采纳、左右覆写、写回文件、导出对比报告；文件对话框能力由 `PlatformPort.selectFile`（`foundation` 域）提供，本域只做 `StructuredView` 顶栏本地打开接线。
- **定位层只做「路径 → 原文区间」单向映射**：不做行 → 节点反向索引（原文反选）、不做 UI 高亮 / 双栏同步滚动 / 过滤与切 tab 的位置保持，也不做 5 MB 大文件原文窗口化（后续子项）；**renderer 后台对比（parse / diff / 定位脱离主线程、加载态、代次取代与取消语义）已移交 `structured-async-compare` 域**，本域只作为其复用的同步引擎 + 定位层；不碰 CRLF/LF 与编码归一化、不处理 UTF-8 BOM。
- **不做 YAML 高级语义展开**（alias / merge key / 锚点解引用 / 多文档 / 重复键策略），不做 JSONPath 查询、schema 校验；定位层不手写 JSON / YAML 词法，一律复用 `jsonc-parser` / `yaml` 的 AST offset 与 `range`，避免与 `parseStructured` 出现两套接受口径。
- **不做跨格式比对**：JSON 只对 JSON、YAML 只对 YAML；不做 JSON ↔ YAML 转换后对比。
- **不做数组智能对齐**：数组按索引比对，不做 LCS / 按元素内容重新对齐数组项。
- **不做 YAML 高级语义**：不实现锚点 / 别名 / 合并键（`<<`）/ 多文档流的额外展开规则，一律按 `yaml` 库默认解析行为；解析失败即走错误态。
- **不做 JSON Schema 校验、不做 JSON5 / JSONC 之外的方言扩展**（`.jsonc/.json5` 下钻仍按 `jsonc-parser` 默认容错解析，不新增方言规则）。
- **不改样本底座**：`src/shared/fixtures/**` 的样本文本、类型与 `composition` 答案键保持前序冻结状态，不为了让运行时计数等于答案键而调整样本。
- **不做三向结构化合并**、不做十六进制对比、不做 `.xlsx`、不做远端 FTP/SFTP 对比。
- **不做新的视觉设计 / 主题切换 / 快捷键与命令面板**；沿用现有 token 与组件。
- 不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈已冻结，不新增 npm 包：用已装的 `jsonc-parser`（^3.3.1）解析 JSON/JSONC、`yaml`（^2.9.1）解析 YAML；不引入第二套解析器或 UI 库。
- 分层硬约束：`src/core/structured/` 零 Electron / DOM / React 依赖，可被 vitest 在 Node 环境直接单测；renderer 只 import `@core/*` 与 `@shared/*`，绝不 import Electron API。
- 保持现有接线契约：`StructuredView` 现有 props（`fixture?` / `pair?` / `format?`）与 `Workbench.tsx` 的调用方式、`ADHOC`/`session.adhoc.format` 语义不破坏；本项以 `StructuredView.tsx` 与 `src/core/structured/` 为主改面，`Workbench.tsx` 只做必要的最小改动。
- 节点路径表示：统一用 JSON Pointer（`/a/b/0`）；UI 可按需加显示前缀，但引擎输出以 JSON Pointer 为准。
- 复用现有视觉资产：过滤用 `SegmentedControl`，面板块用 `Panel`，原文用 `CodeBlock`，状态色用 `DiffBadge` / `diffSemantics` 与 `--color-diff-*` token，错误态用 `StateView`；组件内不写死颜色 / 尺寸。
- 定位层固定落在 `src/core/structured/locate.ts`，只依赖 `./parse`、`jsonc-parser`、`yaml` 与标准库；JSON 取 `parseTree` 节点的 `offset` + `length`（`allowTrailingComma: true` / `disallowComments: false`，与 `parseStructured` 同参数），YAML 取 `parseDocument` 节点 `range`。构建时缓存原文与每行起始 offset，locate 时按 offset 换算行列；反转义函数放 `locate.ts`，不得改 `diff.ts` 的 `escapeSegment`。真实样本固定放 `__fixtures__/locate/`（不占用后续语义门子项的 `__fixtures__/real/`），随实现一同提交。

## 最近交付证明

- WI：`wi_ws_925dd85679f21b43`（JSON/YAML 路径定位核心，`key: structured-locate-core`，work-set `ws_cf3b932ce0e1ecd7` P1④）
- 日期：2026-10-31
- 结果：code_gates passed（9 gates，attempt 001，`needSelfTest: false`）。
- 覆盖摘要：新增纯函数模块 `src/core/structured/locate.ts`（`createStructuredLocator` / `locateStructuredPath` → `SourceRange`），把 `diffStructured` 的 JSON Pointer 映射为某一侧原文 1-based 行/列区间：JSON 走 `jsonc-parser` `parseTree` 的 `offset`+`length`、YAML 走 `parseDocument` 节点 `range`，与 `parseStructured` 同参数、不可解析时抛同一个 `StructuredParseError`；段反转义在 `locate.ts` 内按 `~1`→`/`、`~0`→`~` 顺序完成，数组段严格匹配 `^(0|[1-9][0-9]*)$`，容器区间覆盖开/闭括号或块映射/序列全量，根指针与 `''` 剔除前导注释/尾随空白；该侧缺节点逐段下钻最深祖先（`exact:false`），全无则回退根（`path:''`）；行起始 offset 缓存一次、后续 locate 按段下钻，同一 locator 多次调用结果恒定。真实样本 `__fixtures__/locate/`（`json-left/right`、`yaml-left/right`，含注释/缩进/引号噪音、≥8 层嵌套、单侧新增与删除）经 `node:fs` 读取校验切片逐字相等与行号一致。`diff.ts` / `parse.ts` / `diff.test.ts` 零改动；`pnpm test` 81 files / 1277 tests passed（含 `locate.test.ts` 32 例），`typecheck` / `lint` / `build` / `build-web` / memory / cancel gate 全绿。
- 注：本 WI change pack 仅含 `prd.md`（无 `tests/cases/**`），故本轮无 QA 用例文件可 copy；验收口径已按 `prd.md` 的 16 条 AC **定义**整段折入上方「验收」。亦未提供 `tech.md` / `ux/**`，tech/ux 折叠跳过（沿用既有 tech overview 与 design 基线）。
- 注：本域为纯 core 层增量，UI 侧（差异行点选跳转高亮、原文反选、双栏同步滚动、过滤/切 tab 位置保持、5 MB 后台化）仍为后续子项，未在本轮落地。
