# 真实文件语义门

## 范围

给既有 JSON/YAML AST 语义引擎（`src/core/structured/diff.ts` + `parse.ts`，一行不改）补一条**只读真实磁盘文件**的语义门，钉死三件事：键序无关、格式无关、真实差异不漏。

交付物只有四类，全部是新增文件 + 一处既有 pin 更新：

1. `src/structured-semantics-gate.test.ts`（放在 `src/` 根，与 `src/cancel-gate.test.ts` / `src/memory-gate.test.ts` 同级同范式），**恰好 3 个 `it`**，一例一主题；所有输入用 `node:fs` 的 `readFileSync` 从第 3 项的真实文件读入，不得内联 JSON/YAML 字符串作为对比输入，不得 import `@shared/fixtures`。
2. `src/core/structured/__fixtures__/real/` 下 8 个真实文件（JSON/YAML × noise/diff，各一对）：
   - `json-noise-left.json` / `json-noise-right.json`
   - `yaml-noise-left.yaml` / `yaml-noise-right.yaml`
   - `json-diff-left.json` / `json-diff-right.json`
   - `yaml-diff-left.yaml` / `yaml-diff-right.yaml`
   - noise 对：两侧语义完全相同，只在对象键序、缩进、注释、尾逗号、空行、引号风格上不同（左边带噪音，右边干净）。
   - diff 对：两侧含真实差异（至少各一条 added / removed / modified / typeChanged，且至少一条路径 ≥8 层嵌套），同时未变更部分照样带键序与格式噪音，避免“格式一改就全红”的假阳性。
   - 内容由 Coding 撰写并提交入库；文件必须能被 `parseStructured` 解析（JSON 侧按 JSONC 口径）。
3. `package.json` 新增脚本 `"test:structured": "vitest run src/structured-semantics-gate.test.ts"`（单 argv）。
4. `.munk/code-gates.json` 的 `gates` 追加一条 `{ "id": "structured-semantics", "cwd": ".", "command": "pnpm test:structured" }`；同步更新 `src/munk-gates.test.ts` 的期望矩阵（**只做加法**：原 9 条 id / command / cwd 与顺序逐字保留，新条目追加在末尾，总条数 9 → 10）。

`pnpm test`（`vitest run`，include `src/**/*.test.ts`）会自动包含新门文件，无需改 `test` 脚本；本项要保证这一点是**事实**且可断言，不是假设。

## 验收

- ac-gate-manifest: `.munk/code-gates.json` 的 `gates` 中存在且仅存在一条 `id === 'structured-semantics'`，其 `cwd === '.'`、`command === 'pnpm test:structured'`，命令串不含 `&&`、`||`、`|`、`;`。
- ac-structured-script: `package.json` 的 `scripts['test:structured'] === 'vitest run src/structured-semantics-gate.test.ts'`，且该文件在磁盘上存在。
- ac-gate-under-pnpm-test: 执行 `pnpm test` 时该门文件被实际收集并执行（`vitest run` 的 include `src/**/*.test.ts` 覆盖它），`pnpm test` 与 `pnpm test:structured` 两条命令均退出码 0。
- ac-gate-pin-preserved: `src/munk-gates.test.ts` 的期望矩阵长度断言为 10，前 9 条 `{id, command}` 与改动前逐字、逐序相同（`install/lint/typecheck/build/build-web/test/test-compare-request/cancel-gate/memory-gate`），第 10 条为 `structured-semantics` → `pnpm test:structured`。
- ac-gate-three-cases-only: `src/structured-semantics-gate.test.ts` 内 `it(` 出现次数恰为 3；每个 `it` 体的对比输入都来自 `src/core/structured/__fixtures__/real/` 下的 `readFileSync`，文件源码中不出现 `import ... from '@shared/fixtures'`。
- ac-key-order-ignored: 对 `json-noise-*` 与 `yaml-noise-*` 两对真实文件分别 `diffStructured(left, right, format)`：`counts.added === counts.removed === counts.modified === counts.typeChanged === 0`，`entries.length > 0`，且 `entries.every(e => e.status === 'same')`；同时断言两侧原文的对象键出现顺序确实不同（对同两个键名取 `indexOf` 比较先后，左右相反），证明该例不是空转。
- ac-format-noise-ignored: `json-noise-left.json` 原文确实含 `//` 注释行与尾逗号、且与右侧缩进不同；`yaml-noise-left.yaml` 原文确实含 `#` 注释行与空行、且键带引号；对应右侧不含注释；在此前提下上述两对 diff 仍为零差异计数（同 ac-key-order-ignored 的计数口径）。
- ac-real-diff-not-missed: 对 `json-diff-*` 与 `yaml-diff-*` 两对真实文件，`diffStructured(...).entries` 中所有 `status !== 'same'` 的 `{path, status}` 集合与测试内声明的期望表**逐条相等**（不多不少）；期望表至少含 `added`、`removed`、`modified`、`typeChanged` 各 1 条，且至少一条路径为 ≥8 段 JSON Pointer；`changed.size > 0`（引擎若整对判 same 会直接红）。
- ac-existing-tests-intact: `src/core/structured/diff.test.ts` 与 `src/core/structured/locate.test.ts` 文件未被删除、未被改写，`it(` 数量分别不少于 16 与 32，且 `pnpm test` 全绿。

## 非目标

- 不改 `src/core/structured/` 下任何源码：`diff.ts`、`parse.ts`、`locate.ts` 零字节改动；不改 `diffStructured` 签名、五态口径、JSON Pointer 路径格式。
- 不改既有测试断言：`diff.test.ts`、`locate.test.ts`、`StructuredView.test.tsx`、`munk-gates.test.ts` 原有 9 条门条目只做加法，不删不弱化（唯一允许的编辑是在 `munk-gates.test.ts` 的期望矩阵末尾追加第 10 条并把长度断言 9 → 10）。
- 不动 UI、视图、滚动、定位、窗口化、worker、性能：本项不产生任何用户可见界面变化。
- 不新增依赖、不改 `vitest.config.mts`、不新增 vitest project、不改 `test` / `test:watch` / `test:cancel` / `test:memory` 脚本。
- 不复用 / 不修改 `src/core/structured/__fixtures__/locate/` 与 `src/shared/fixtures/`；门只认自己的 `__fixtures__/real/`。
- 不受理 CRLF/LF、编码归一、BOM、YAML 多文档 / 重复键 / merge key、`.json5` 等解析边界（仍挂账）。
- 不做浏览器 / 真机 / 桌面点选验证（needSelfTest=false）。

## 实现约束

- 门文件必须 Node 环境可跑：零 Electron、零 DOM、零网络、零 `@renderer/*` import；只用 `node:fs`、`node:url`/`node:path`、`vitest` 与 `@core/structured/*`。
- 真实文件路径用 `fileURLToPath(new URL('./core/structured/__fixtures__/real/', import.meta.url))` 之类的 import.meta 相对解析，禁止依赖 `process.cwd()` 拼绝对路径（`munk-gates.test.ts` 现在用 cwd，门内不要复制这个坏习惯）。
- 期望差异表在测试文件内以常量声明（`Map<path, status>` 或数组），断言时排序后比较，避免顺序导致 flake。
- fixtures 必须是提交入库的静态文件（不临时生成、不 mock、不 `vi.mock` 任何模块）；同一用例内不得改写输入文本。
- 声明式写法优先：3 个 `it` 可以是 `it.each`-free 的显式循环（每例内 for 两格式），但 `it(` 计数必须为 3，不要引入 `describe.each` 造出更多 `it`。
- 提交后 `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:structured` 四条必须本地全绿再交 Delivery。
