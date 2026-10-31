# Domain: structured-scale-evidence

结构化对比的 **≥5 MB 真实文件验收证据域**：把「大文件 + 深层嵌套 + 纯格式噪音零误报 + 真实差异逐条路径命中 + 显式耗时上限 + 卸载终止」写成可重复执行、可回归的单测，证据落 `src/core/structured/scale.test.ts` 与 `src/renderer/src/views/StructuredView.scale.test.tsx`。本域**只产出证据，不改行为**：语义引擎归 `structured`，后台 compare / dispose 契约归 `structured-async-compare`，定位 / 同步滚动 / 窗口化归 `structured-locate-sync`，本域是这三块既有实现的观察者与验收钉子。

## 范围

- **核心 5 MB 证据（`src/core/structured/scale.test.ts`，Node 环境）**：`mkdtempSync` 在 `os.tmpdir()` 建临时目录，确定性生成样本后 `writeFileSync` 落盘再 `readFileSync` 读回（`finally` / `afterAll` 内 `rmSync(..., { recursive: true, force: true })`），断言与测量只走已发布的 `parseStructured` / `diffStructured` / `createStructuredLocator`，不内联对比捷径、不 mock 引擎。
  - **规模**：`TARGET_BYTES = 5 * 1024 * 1024`、`DEPTH = 8`；按「先探测 128 条字节数再按比例放大」定 `itemCount`（`sizedDocument()`），左右两侧用同一 `itemCount` 生成，禁止 `Math.random()`；字节数用 `Buffer.byteLength(..., 'utf8')` 断言。
  - **纯格式噪音零误报**：`noisyJson()` 生成与左值语义等价的右侧——键序反转、4 空格缩进、`//` 与 `/* */` 注释、空行、尾逗号；JSON 侧不管引号噪音（JSON 只有双引号）。
  - **YAML 噪音零误报**：真实临时 `.yaml` 文件（`YAML_LEFT` / `YAML_RIGHT`），≥8 层（`service/features/limits/levels/tier/profile/...`），噪音覆盖键序、缩进、单引号 / 双引号 / 无引号标量、注释、空行。
  - **真实差异逐条命中**：`EXPECTED` 常量表集中定义 8 条期望（`added` / `removed` / `modified` / `typeChanged` 各 2，含数组索引 `added` / `removed` / `modified` 三条），每条带唯一标记 token，断言按 `path` `find` 后逐字段比对 `status` / `left` / `right` / `leftType` / `rightType`，不依赖 entries 顺序。
  - **定位复用**：对每条非 `same` 路径断言存在侧 `exact === true` 且 `startLine === 含唯一 token 的行号`；单侧缺失侧 `exact === false` 且区间等于 `parentPath(path)` 的最近父节点区间。
  - **显式耗时上限**：`ELAPSED_BUDGET_MS = 20_000` 与 vitest `TEST_TIMEOUT_MS = 60_000` 分开；计量段为「读盘回文本 + `diffStructured` + 两侧全量 `locate(entry.path)`」，`expect(elapsed).toBeLessThan(ELAPSED_BUDGET_MS)`，不靠缩小样本或跳过定位规避。
- **视图 5 MB 卸载证据（`src/renderer/src/views/StructuredView.scale.test.tsx`，`// @vitest-environment jsdom`）**：保留既有窗口化 / 跳转用例与常量不动，新增两条卸载用例，客户端一律注入「包装真实 `createStructuredCompareClient()`」的对象（`dispose` 为 `vi.fn()` 并转调真实现）：
  - `dispose-after-landed`：渲染 5 MB 对，等首个已知变更行（`data-change-path`）出现后 `unmount()`，断言 `dispose` 调用次数 `=== 1`、卸载后再等一拍仍为 1、`unhandledRejection` 记录为空、无 `unmounted` / `not wrapped in act` console.error。
  - `dispose-in-flight`：渲染后结果仍在途（首帧含 `对比中`）即 `unmount()`，同样断言 `dispose` 恰一次、无 rejection、无卸载后状态更新警告。
  - `process.on('unhandledRejection')` 监听沿用既有写法并在 `finally` 移除；不断言 jsdom 下的 worker `terminate`。

## 验收

- **ac-scale-json-bytes**：`src/core/structured/scale.test.ts` 用 `node:fs` 写入并读回临时 JSON 对后，两侧 `Buffer.byteLength(text, 'utf8') >= 5 * 1024 * 1024`、`text.split('\n').length > 1000`、嵌套深度最大值 `>= 8` 三条均成立。
- **ac-scale-json-noise-zero**：左右仅键序 / 缩进 / JSONC 注释 / 空行 / 尾逗号不同时，`diff.entries.every(e => e.status === 'same')` 为真，`counts.modified + counts.added + counts.removed + counts.typeChanged === 0`，且不存在 `status !== 'same'` 的路径。
- **ac-scale-yaml-noise-zero**：真实临时 `.yaml` 文件左右仅键序 / 缩进 / 单双引号或无引号标量 / 注释 / 空行不同、且 ≥8 层时，同 ac-scale-json-noise-zero 的零非 `same` 断言成立。
- **ac-scale-real-added**：≥5 MB 对中构造的右侧独有节点使 `entries` 含 `{ path: '<该指针>', status: 'added', rightType: <预期类型> }`，且该条目 `left` 与 `leftType` 为 `undefined`；无其它同名路径以其它状态出现。
- **ac-scale-real-removed**：左侧独有节点使 `entries` 含 `{ path: '<该指针>', status: 'removed', leftType: <预期类型> }`，且 `right` 与 `rightType` 为 `undefined`。
- **ac-scale-real-modified**：仅数值不同的叶子节点产生 `status: 'modified'` 且 `left` / `right` 展示值分别为两侧值字符串、`leftType === rightType`。
- **ac-scale-real-type-changed**：number ↔ string 与 scalar ↔ object/array 两类改动均产出 `status: 'typeChanged'`，`leftType !== rightType`，且同名路径不额外出现 `modified` 或 `added` / `removed` 条目。
- **ac-scale-array-index**：在一个数组元素上分别做新增、删除、值修改，断言差异路径为 `<数组指针>/<索引>`（索引为变更后/变更前的真实位置，不被压缩或错位），对应 `status` 为 `added` / `removed` / `modified`。
- **ac-scale-locate-ranges**：上述每条非 `same` 路径在两侧 `createStructuredLocator(text, format).locate(path)` 返回区间：存在侧 `exact === true` 且 `startLine` 指向含该用例唯一标记 token 的行；单侧节点缺失侧 `exact === false` 且区间等于最近父节点区间。
- **ac-scale-elapsed-budget**：5 MB JSON 用例内以 `performance.now()` 计量的「读盘 + diff + 全量 locate」耗时 `< 20000` ms（显式常量，与 vitest 60 s 超时分开断言）。
- **ac-view-scale-dispose-on-unmount**：注入包装真实客户端的 `StructuredView` 渲染 5 MB 对、等首个变更行出现后 `unmount()`，断言 `dispose` 调用次数 `=== 1`，且卸载后 `unhandledRejection` 记录为空。
- **ac-view-scale-dispose-in-flight**：5 MB 对渲染后在其结果落地前 `unmount()`，断言 `dispose` 调用次数 `=== 1`，此后不产生 React 状态更新警告、`unhandledRejection` 记录为空、不抛错。
- **ac-existing-tests-intact**：`src/core/structured/{diff,locate,locateLine}.test.ts` 与 `StructuredView.{test,async,locate,scale}.test.tsx`、`src/renderer/src/structured/{compareJob,compareClient}.test.ts` 的既有 `it` 数量与断言不被删除或放宽（允许仅新增用例）。
- **ac-only-tests-changed**：相对本项基线，`src/` 下的改动仅含新增 `src/core/structured/scale.test.ts` 与修改 `src/renderer/src/views/StructuredView.scale.test.tsx`；`src/core/structured/*.ts` 源码、`src/renderer/src/structured/*`、`src/renderer/src/views/StructuredView.tsx` / `StructuredPanes.tsx` 生产文件无 diff。
- **ac-suites-green**：`pnpm test src/core/structured/scale.test.ts` 与 `pnpm test src/renderer/src/views/StructuredView.scale.test.tsx` 各自通过；`pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿，`code_gates` 不新增 gate id。

## 非目标

- 不改 `src/core/structured/` 任何源码（`parse.ts` / `diff.ts` / `locate.ts` / `locateLine.ts` 及其导出与实现），不改五态口径、计数、JSON Pointer 格式与 `SourceRange` 形状。
- 不改 `src/renderer/src/structured/*`、`StructuredView.tsx`、`StructuredPanes.tsx`、`Workbench` 壳层或任何生产代码；不为可测性新增导出或注入点。
- 不改 `.munk/code-gates.json`、不新增 gate id、不改 `pnpm test:structured` 语义门；不为本项新增 `tests/cases/**` 或 QA 用例文件。
- 不把 MB 级样本作为 fixture 提交进仓；不新增 npm 依赖、网络请求或外部工具。
- 不新增 UI 交互 / 文案 / 视觉 token；不做浏览器、真机、桌面点选验收。
- 不顺手补 CRLF/LF、编码归一化、BOM、YAML 多文档 / merge key / 别名（I#9 及既有挂账），也不修任何既有测试的 flake。
- 不改网格 / 文本 diff / 目录对比的任何行为与证据。

## 实现约束

- **仅两个测试文件**：`src/core/structured/scale.test.ts`（Node 环境，`node:fs` + `os.tmpdir()`，`finally` / `afterAll` 清理）与 `src/renderer/src/views/StructuredView.scale.test.tsx`（保持 `// @vitest-environment jsdom` 首行与既有 `clientHeight` / `scrollHeight` stub，现有用例与常量不删不改）。辅助函数就地定义，不新建共享 helper 文件。
- **复用既有 API，不自造断言捷径**：核心断言只用 `diffStructured` / `parseStructured` / `createStructuredLocator`；视图断言只用 `StructuredView` 的 `createClient` 注入点（返回包装 `createStructuredCompareClient()` 的对象），不 mock 引擎、不重写窗口化阈值。
- **确定性生成**：固定种子 / 固定计数，字节数用 `Buffer.byteLength(..., 'utf8')`；`sizedDocument()` 沿用 `compareJob.test.ts` 的「先探测再放大」写法。
- **引号噪音口径**：JSON 只允许双引号，故 JSON 侧不把引号作为噪音维度（用键序 / 缩进 / JSONC 注释 / 空行 / 尾逗号覆盖）；单引号 / 双引号 / 无引号标量噪音由 YAML 用例承担。
- **耗时断言**：显式常量 `ELAPSED_BUDGET_MS = 20_000` + `expect(elapsed).toBeLessThan(ELAPSED_BUDGET_MS)`；用例 `it(..., 60_000)` 超时独立，两者不得互相替代。
- **差异路径期望值**：`path` 与标记 token 用局部常量表 `EXPECTED` 集中定义，断言按路径 `find` 后逐字段比对，不依赖 entries 顺序。
- **视图卸载断言**：`dispose` spy 用 `vi.fn()` 包装并转调真实 `dispose`，卸载用 `unmount()`；`process.on('unhandledRejection')` 沿用现有写法并在 `finally` 移除；只断言调用次数与无 rejection。
- **不新增 `tests/cases/**`**：本域执行记录以 AC 契约形式落在 `qa/structured-scale-evidence-contract.md`，change pack 仅 `prd.md`。

## 最近交付证明

- WI：`wi_ws_3286840c8a6db356`（5 MB 大文件验收证据补齐）
- 日期：2026-10-31
- 结果：code_gates passed（10 gates 矩阵，attempt 001，`needSelfTest: false`；`pnpm test` 90 files / 1339 passed + 1 skipped / 30.33s）。`src/` 下 diff 仅两文件：新增 `src/core/structured/scale.test.ts`（6 `it`），修改 `src/renderer/src/views/StructuredView.scale.test.tsx`（1 → 3 `it`，145 插入 / 1 删除，既有窗口化用例与常量未动）。
- 覆盖摘要：
  - **核心证据 6 例**：① 读回规模（两侧 ≥5 MB、行数 >1000、`maxContainerDepth(parseStructured(...)) >= 8`）；② JSON 表面噪音零误报（键序反转 + 4 空格 + `//` / `/* */` + 空行 + 尾逗号，四计数全 0、全 `same`）；③ 真实差异逐条命中（`counts` 恰 `added 2 / removed 2 / modified 2 / typeChanged 2`，8 条 `EXPECTED` 按 `path` 各命中唯一 1 条并逐字段比对）；④ 定位复用（在侧 `exact:true` + `startLine` 落在唯一 token 行，缺失侧 `exact:false` 且区间等于父节点区间）；⑤ 显式耗时（读盘 + `diffStructured` + 全量 `locate` < `ELAPSED_BUDGET_MS = 20_000`，`it(..., 60_000)`；整文件 6 例实测 2554 ms）；⑥ YAML 深度噪音零误报（≥8 层、键序 / 缩进 / 单双引号 / 无引号 / 注释 / 空行，四计数全 0）。
  - **视图证据 3 例**：既有「窗口化上界 + 跳转已知变更行」保持不动；新增 `dispose-after-landed`（等 `data-change-path` 出现后 `unmount()`，`dispose` 恰 1 次、无未处理 rejection、无卸载后 console.error）与 `dispose-in-flight`（首帧 `对比中` 即卸载，同样恰 1 次、无 rejection、无状态更新警告）；整文件 3 例实测 1989 ms。
  - **零生产改动**：`src/core/structured/*.ts` 源码、`src/renderer/src/structured/*`、`StructuredView.tsx` / `StructuredPanes.tsx` 无 diff；`diff` / `locate` / `locateLine` 与 `StructuredView.{test,async,locate}` / `compareJob` / `compareClient` 测试文件未动；`.munk/code-gates.json` 未动（仍 10 gates）。
- 证据：`.munk/runs/run_ws_a310aa8ea0d6deb1/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate,structured-semantics}.log` 与同名 `.result.json`，`latest.json` = `code_gates passed (10 gates, attempt 001)`。
- 注：本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；15 条 AC **定义**已折入上方「验收」，执行记录落本域 `qa/structured-scale-evidence-contract.md`。
- 后续注意：① 本域只加证据不改行为——若将来要放宽 `ELAPSED_BUDGET_MS` 或 `DEPTH` / `TARGET_BYTES`，先改本域 AC 再改测试，别为变绿缩样本；② `EXPECTED` 的 8 条路径是逐条断言锚点，语义引擎口径变化（如数组索引压实策略）会先在这里红，属预期信号；③ 视图两条卸载用例只覆盖 `dispose` 次数与无 rejection，jsdom 下没有真实 Worker，worker `terminate` 归 `structured-async-compare` 的 `compareClient.test.ts`；④ 两个 scale 文件都自建临时目录并清理，别把样本改成仓库 fixture（MB 级样本不入库）。
