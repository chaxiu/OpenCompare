# 5 MB 大文件验收证据补齐

前序已交付语义引擎（`src/core/structured/{parse,diff,locate,locateLine}.ts` 未改）、后台 compare（`src/renderer/src/structured/compareClient.ts`）与视图窗口化/定位/同步滚动（`StructuredView.tsx`、`StructuredPanes.tsx`）。本项只补证据：把「≥5 MB 真实文件 + 深层嵌套 + 纯格式噪音零误报 + 真实差异逐条路径命中 + 显式耗时上限 + 卸载终止」写成可重复执行的单测。

## 范围

1. **新增 `src/core/structured/scale.test.ts`（Node 环境，`node:fs` + `os.tmpdir()`）**
   - 5 MB JSON 对：确定性生成两份 `Buffer.byteLength >= 5 * 1024 * 1024`、≥8 层嵌套的真实 JSON，`writeFileSync` 落临时目录再 `readFileSync` 读回，断言字节数、行数 > 1000、最大嵌套深度 ≥8。
   - 纯格式噪音对（零误报）：左右语义完全等价，仅差异为对象键序、缩进宽度、JSONC 注释（`//` 与 `/* */`）、空行、尾逗号；断言 `counts.added/removed/modified/typeChanged` 全为 0、`entries` 全为 `same`、无任何非 `same` 路径。
   - YAML 噪音对（零误报）：真实临时 `.yaml` 文件，同样 ≥8 层，噪音覆盖键序、缩进、单引号 / 双引号 / 无引号标量、注释、空行；断言同上零非 `same`。
   - 真实差异对（按路径逐条命中）：同一份 ≥5 MB 基线上分别构造 added、removed、value modified、typeChanged（number ↔ string 或 scalar ↔ container）以及数组索引变化（索引内 added / removed / modified），对每条差异断言 `path`、`status`、`leftType` / `rightType` 与 `left` / `right` 展示值。
   - 定位复用：对上述每条非 `same` 路径，用 `createStructuredLocator` 取两侧 `SourceRange`，断言存在侧 `exact === true`、`startLine` 落在含唯一标记 token 的源行上；单侧节点在缺失侧 `exact === false` 且回退到最近父节点。
   - 显式耗时上限：以 `performance.now()` 计量「读盘回文本 + `diffStructured` + 全量 `locate`」整段，断言低于明确常量上限（20 000 ms），同时该用例 vitest 超时 ≤60 s。
2. **补强 `src/renderer/src/views/StructuredView.scale.test.tsx`**
   - 保留现有 5 MB 窗口化 / 跳转用例不动。
   - 新增 5 MB 场景卸载用例：注入包装真实 `createStructuredCompareClient()` 的客户端（`dispose` 为 spy 并转调真实现），渲染 5 MB 对后卸载，断言 `dispose` 恰好被调用一次、卸载后不再有状态更新或未处理 rejection；再补一条「结果落地前卸载」的在途场景，断言同样只 dispose 一次且无 unhandled rejection。

## 验收

- ac-scale-json-bytes: `src/core/structured/scale.test.ts` 用 `node:fs` 写入并读回临时 JSON 对后，两侧 `Buffer.byteLength(text, 'utf8') >= 5 * 1024 * 1024`、`text.split('\n').length > 1000`、嵌套深度最大值 `>= 8` 三条均成立。
- ac-scale-json-noise-zero: 左右仅键序 / 缩进 / JSONC 注释 / 空行 / 尾逗号不同时，`diff.entries.every(e => e.status === 'same')` 为真，`counts.modified + counts.added + counts.removed + counts.typeChanged === 0`，且不存在 `status !== 'same'` 的路径。
- ac-scale-yaml-noise-zero: 真实临时 `.yaml` 文件左右仅键序 / 缩进 / 单双引号或无引号标量 / 注释 / 空行不同、且 ≥8 层时，同 ac-scale-json-noise-zero 的零非 `same` 断言成立。
- ac-scale-real-added: ≥5 MB 对中构造的右侧独有节点使 `entries` 含 `{ path: '<该指针>', status: 'added', rightType: <预期类型> }`，且该条目 `left` 与 `leftType` 为 `undefined`；无其它同名路径以其它状态出现。
- ac-scale-real-removed: 左侧独有节点使 `entries` 含 `{ path: '<该指针>', status: 'removed', leftType: <预期类型> }`，且 `right` 与 `rightType` 为 `undefined`。
- ac-scale-real-modified: 仅数值不同的叶子节点产生 `status: 'modified'` 且 `left` / `right` 展示值分别为两侧值字符串、`leftType === rightType`。
- ac-scale-real-type-changed: number ↔ string 与 scalar ↔ object/array 两类改动均产出 `status: 'typeChanged'`，`leftType !== rightType`，且同名路径不额外出现 `modified` 或 `added` / `removed` 条目。
- ac-scale-array-index: 在一个数组元素上分别做新增、删除、值修改，断言差异路径为 `<数组指针>/<索引>`（索引为变更后/变更前的真实位置，不被压缩或错位），对应 `status` 为 `added` / `removed` / `modified`。
- ac-scale-locate-ranges: 上述每条非 `same` 路径在两侧 `createStructuredLocator(text, format).locate(path)` 返回区间：存在侧 `exact === true` 且 `startLine` 指向含该用例唯一标记 token 的行；单侧节点缺失侧 `exact === false` 且区间等于最近父节点区间。
- ac-scale-elapsed-budget: 5 MB JSON 用例内以 `performance.now()` 计量的「读盘 + diff + 全量 locate」耗时 `< 20000` ms（显式常量，与 vitest 60 s 超时分开断言）。
- ac-view-scale-dispose-on-unmount: 注入包装真实客户端的 `StructuredView` 渲染 5 MB 对、等首个变更行出现后 `unmount()`，断言 `dispose` 调用次数 `=== 1`，且卸载后 `unhandledRejection` 记录为空。
- ac-view-scale-dispose-in-flight: 5 MB 对渲染后在其结果落地前 `unmount()`，断言 `dispose` 调用次数 `=== 1`，此后不产生 React 状态更新警告、`unhandledRejection` 记录为空、不抛错。
- ac-existing-tests-intact: `src/core/structured/{diff,locate,locateLine}.test.ts` 与 `StructuredView.{test,async,locate,scale}.test.tsx`、`src/renderer/src/structured/{compareJob,compareClient}.test.ts` 的既有 `it` 数量与断言不被删除或放宽（允许仅新增用例）。
- ac-only-tests-changed: 相对本项基线，`src/` 下的改动仅含新增 `src/core/structured/scale.test.ts` 与修改 `src/renderer/src/views/StructuredView.scale.test.tsx`；`src/core/structured/*.ts` 源码、`src/renderer/src/structured/*`、`src/renderer/src/views/StructuredView.tsx` / `StructuredPanes.tsx` 生产文件无 diff。
- ac-suites-green: `pnpm test src/core/structured/scale.test.ts` 与 `pnpm test src/renderer/src/views/StructuredView.scale.test.tsx` 各自通过；`pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿，`code_gates` 不新增 gate id。

## 非目标

- 不改 `src/core/structured/` 任何源码（`parse.ts` / `diff.ts` / `locate.ts` / `locateLine.ts` 及其导出与实现），不改五态口径、计数、JSON Pointer 格式与 `SourceRange` 形状。
- 不改 `src/renderer/src/structured/*`、`StructuredView.tsx`、`StructuredPanes.tsx`、`Workbench` 壳层或任何生产代码；不为可测性新增导出或注入点。
- 不改 `.munk/code-gates.json`、不新增 gate id、不改 `pnpm test:structured` 语义门；不为本项新增 `tests/cases/**` 或 QA 用例文件。
- 不把 MB 级样本作为 fixture 提交进仓；不新增 npm 依赖、网络请求或外部工具。
- 不新增 UI 交互 / 文案 / 视觉 token；不做浏览器、真机、桌面点选验收。
- 不顺手补 CRLF/LF、编码归一化、BOM、YAML 多文档 / merge key / 别名（I#9 及既有挂账），也不修任何既有测试的 flake。
- 不改网格 / 文本 diff / 目录对比的任何行为与证据。

## 实现约束

- **仅两个测试文件**：`src/core/structured/scale.test.ts`（新建，Node 环境，`import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'`，临时目录写在 `os.tmpdir()`，`finally` 内 `rmSync(..., { recursive: true, force: true })`）与 `src/renderer/src/views/StructuredView.scale.test.tsx`（保持 `// @vitest-environment jsdom` 首行与现有 `clientHeight` / `scrollHeight` stub，现有用例与常量不删不改）。辅助函数可就地定义，不新建共享 helper 文件。
- **复用既有 API，不自造断言捷径**：核心断言只用 `diffStructured`、`parseStructured`、`createStructuredLocator`；视图断言只用 `StructuredView` 的 `createClient` 注入点（返回包装 `createStructuredCompareClient()` 的对象），不 mock 引擎、不重写窗口化阈值。
- **确定性生成**：样本按固定种子/固定计数生成，字节数用 `Buffer.byteLength(..., 'utf8')` 断言而非字符数；如需计数对齐 5 MB，用「先探测 1000 条字节数再按比例放大」的既有写法（见 `compareJob.test.ts`），禁止用 `Math.random()`。
- **引号噪音口径**：JSON 只允许双引号，故 JSON 侧引号不作为噪音维度（用键序 / 缩进 / JSONC 注释 / 空行 / 尾逗号覆盖）；「单引号 / 双引号 / 无引号标量」噪音由 YAML 用例承担，两处合计覆盖方向要求。
- **耗时断言**：用一个显式导出常量（如 `const ELAPSED_BUDGET_MS = 20_000`）与 `expect(elapsed).toBeLessThan(ELAPSED_BUDGET_MS)`；用例本身 `it(..., 60_000)` 超时，两者独立，不得用缩小样本或跳过定位来规避。
- **差异路径期望值**：真实差异用例的期望 `path` 与标记 token 用局部常量集中定义（如 `const EXPECTED = { added: { path: '/...', token: '...' } }`），断言按路径 `find` 后逐字段比对，避免依赖 entries 顺序之外的隐式假设。
- **视图卸载断言**：`dispose` spy 用 `vi.fn()` 包装并转调真实 `dispose`，卸载用 `unmount()`；`process.on('unhandledRejection')` 监听沿用现有文件写法并在 `finally` 移除；断言只认调用次数与无 rejection，不断言 jsdom 下的 worker `terminate`（无 Worker 时走异步回退）。
