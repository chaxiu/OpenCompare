# verify-release 发布门判定抽成纯函数并压缩 gate 测试

## Scope

把 `scripts/verify-release.mjs` 的最终发布门判定（fail-closed 结论：`summary` 校验 + `summary.status` 是否 `pass`）抽成一个可导出纯函数 `judgeReleaseGate(summary, { expectedIds, exists })`，脚本 CLI 与 `src/verify-release-gate.test.ts` 共用同一份判定；测试改为直接喂输入、断输出，并把现有发布脚本 gate 测试压到行数与文本断言上限内。仅动测试与脚本判定层，不改产品行为、检查项、fail-closed 语义，不新增网络访问。

基线（本 worktree HEAD `15a6313`，实测）：

- `src/verify-release-gate.test.ts`：1,352 行；`toContain` 28；`readFileSync` 13；`describe(` 15；语法层 `it|test` 63 条（执行层用例数必须在 Coding 开始时用 vitest JSON reporter 重测并作为唯一基线，见 `ac-baseline-measured`）。
- `scripts/verify-release.mjs`：2,157 行；已有 `validateSummary` / `validateStep` / `buildSummary` 等导出，但 CLI 仍在两个分支各自做 `validateSummary` + `summary.status === 'pass' ? 0 : 1` 的最终结论。
- 全仓测试文件：48,120 行；非测试源码（`src` + `scripts`，排除 `*.test.*` / `*.d.ts` / `*.d.mts`）：31,197 行。

## Acceptance Criteria

### 纯函数判定

- ac-gate-exported: `scripts/verify-release.mjs` 导出 `judgeReleaseGate`，签名为 `judgeReleaseGate(summary, { expectedIds = [], exists = existsSync } = {})`，返回 `{ ok: boolean, status: 'pass' | 'fail', problems: string[] }`；`ok === true` 当且仅当 `validateSummary` 无问题且 `summary.status === 'pass'`。
- ac-gate-single-source: `judgeReleaseGate` 内部调用现有 `validateSummary`（不复制字段/证据判定），并被 `runVerifyReleaseCli` 的 `--aggregate` 分支和普通执行分支共同调用；两分支的进程退出码只由该函数结论派生（`ok ? 0 : 1`），失败时写回 `summary.status = 'fail'` 与 `summary.problems = problems`。
- ac-gate-pass: 输入 15 项 CI 检查全部 `pass`、必需环境字段齐全、evidence 存在、`expectedIds` 为 15 项的合法 `summary`，返回 `ok=true`、`status='pass'`、`problems=[]`。
- ac-gate-missing-field: 从合法 `summary` 删除必需字段（至少覆盖 `environment`），返回 `ok=false`、`status='fail'`，`problems` 含 `summary 缺字段 environment`。
- ac-gate-version-mismatch: 输入中 `mac-dmg-version` 检查为 `fail`（版本与 tag 不一致），即使顶层 `status` 被篡改为 `pass`，返回 `ok=false`；`problems` 必须指出该失败检查或 `status` 与检查不一致，不得放行。
- ac-gate-asset-mismatch: 输入中 `identity-asset-bytes-sha256` 检查为 `fail`（资产字节/sha256 不一致），即使顶层 `status` 被篡改为 `pass`，返回 `ok=false`；`problems` 必须指出该失败检查或 `status` 与检查不一致，不得放行。
- ac-gate-skip-fails: 输入任一检查为 `skip`（含顶层 `status` 被改为 `pass` 的篡改输入），返回 `ok=false`。

### 测试结构与文本断言

- ac-test-lines: `wc -l < src/verify-release-gate.test.ts` ≤ 600。
- ac-test-readfilesync: `grep -o 'readFileSync' src/verify-release-gate.test.ts | wc -l` ≤ 4；每一处仅用于加载输入数据（fixture 字节 / summary.json / workflow yml / `.munk/code-gates.json` / `docs/lessons.md` / 脚本源码），不得用于断言语义。
- ac-test-tocontain: `grep -o 'toContain' src/verify-release-gate.test.ts | wc -l` ≤ 6（`not.toContain` 一并计数）。
- ac-baseline-measured: Coding 开始时先在未修改的 `src/verify-release-gate.test.ts` 上执行 `pnpm exec vitest run src/verify-release-gate.test.ts --reporter=json --outputFile=<tmp>`，把 `assertionResults` 总数记为基线 B；改后同一命令的用例总数 A 必须满足 `A >= ceil(0.95 × B)`，且 A、B 都写入 delivery，不用源码行里的 `it|test` 计数替代。
- ac-coverage-not-lower: 用 `@vitest/coverage-v8`（版本与仓库 vitest 对齐，缺失时允许 `pnpm add -D @vitest/coverage-v8@5.0.5`，不得升级 vitest）对 `scripts/verify-release.mjs` 测 line coverage，改后数值不低于改前；命令与前后数字写入 delivery。
- ac-removed-assertion-mapping: 每删除一条 `toContain` 文本断言，delivery 必须给出“原断言 → 替代它的更强断言（测试名 + 断言内容）”映射；给不出替代的断言不得删除，只能占用 ≤6 的保留配额。
- ac-no-assertion-relocation: 不新增或修改本 WI 之外以绕开行数/文本断言上限的测试文件；断言不得迁移到 `.munk/` 或其它文件；`git diff --name-only` 的测试文件只能是 `src/verify-release-gate.test.ts`。

### 脚本结构断言（不再断文案）

- ac-structural-shared-call: 测试用 TypeScript AST（`ts.createSourceFile` 解析 `scripts/verify-release.mjs`）断言：模块导出 `judgeReleaseGate`；`judgeReleaseGate` 函数体内调用 `validateSummary`；`runVerifyReleaseCli` 函数体内调用 `judgeReleaseGate`。
- ac-structural-no-drift: 同一 AST 断言 `runVerifyReleaseCli` 函数体内不再直接调用 `validateSummary`，且不存在以 `summary.status` 为条件的 0/1 退出码内联判定（即最终结论只能来自 `judgeReleaseGate`）。
- ac-no-wording-assertions: 对 `scripts/verify-release.mjs` 的检查不再断言脚本文案/中文措辞；判定行为一律通过调用纯函数并断言返回值完成。
- ac-types-declared: `scripts/verify-release.d.mts` 声明 `judgeReleaseGate` 的输入/输出类型，`pnpm typecheck` 通过。

### 行为与安全边界

- ac-cli-behavior-unchanged: 既有 CLI 契约不变：参数解析、usage、退出码 0/1/2 语义、`--aggregate` 合并、`--layer=ci` 的 15 项固定检查、`--layer=local` 的 3 项固定检查、证据写入与 `--out` 不可写处理均与 `15a6313` 一致；改后 `pnpm test src/verify-release-gate.test.ts` 与 `pnpm test` 全绿。
- ac-no-network: `scripts/verify-release.mjs` 不新增 `fetch`、`node:http`、`node:https`、`node:net` 或任何网络命令；既有 `gh` 调用集合不变；gate 测试仍以 `FakeHost` 注入离线运行，不访问真实网络。
- ac-version-frozen: `package.json#version` 保持 `0.2.16`；`docs/release-notes/*`、`CHANGELOG.md`、`.github/workflows/release.yml` 相对 `15a6313` 无改动；不推 tag、不 dispatch workflow、不改已公开 Release 与资产。
- ac-file-overlap: 本 WI 不修改 `src/main/release-evidence.test.ts`；生产代码 diff 仅限 `scripts/verify-release.mjs` 与 `scripts/verify-release.d.mts`，测试 diff 仅限 `src/verify-release-gate.test.ts`；若必须改 `.munk/code-gates.json`，只允许最小 description/既有 gate 条目调整，并按最新 main rebase。
- ac-full-code-gates: 在本 worktree 按 `.munk/code-gates.json` 顺序执行全部 gate（含 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` / 各专项 gate），全部退出码为 0；命令、退出码与失败输出（若有）原文写入 delivery。
- ac-injection-red: 把 `judgeReleaseGate` 临时改为无条件 `return { ok: true, status: 'pass', problems: [] }` 后，`pnpm test src/verify-release-gate.test.ts` 必须非 0 退出且至少一条 gate 用例变红；记录注入点、完整命令、退出码与失败用例名/输出，然后还原注入并复跑为绿。

### Delivery 证据

- ac-delivery-numbers: delivery 必须给出改前/改后实测数字：测试文件行数、`toContain` 数、`readFileSync` 数、`describe(` 数、执行用例数 A/B、全仓测试文件总行数、非测试源码总行数；全部为命令实测值，不写估计值。
- ac-delivery-claims: delivery 不得出现“测试代码量已解决”或等价表述；只能陈述本次实测事实与仍存在的缺口。
- ac-deadline: 若 20:00 前未全绿，停止并交付缺口清单（失败 gate、原因、已尝试动作），不降门、不删断言、不把未完成写成完成，由公司负责人决定顺延。

## Non-Goals

- 不重构 `scripts/verify-release.mjs` 的检查执行链、`runIdentity*` / mac / linux / windows / local B 层逻辑，只抽最终 verdict。
- 不改产品运行时（`src/main`、`src/preload`、`src/renderer`、`src/core`）行为，不新增功能，不修无关 flaky。
- 不更新版本号、发布说明、CHANGELOG、release workflow，不触发真实 release / tag / workflow dispatch。
- 不新增除 coverage provider 之外的依赖，不升级现有依赖。
- 不把断言搬到其它测试文件或 `.munk/` 规避上限；不靠删用例或降覆盖率换取行数。

## Implementation Constraints

- 20:00 是硬截止；到点未全绿按 `ac-deadline` 交付缺口，不自行延期、不降门。
- `judgeReleaseGate` 必须是纯函数：不读文件、不访问 `process.env`、不发网络、不依赖时间；`exists` 由调用方注入（CLI 传默认 `existsSync`，测试传 `() => true/false`）。
- CLI 两个出口必须共用该函数，禁止保留任何一份内联最终判定；`buildSummary` 仍负责生成 `status`，`judgeReleaseGate` 负责最终 fail-closed 结论。
- 测试压缩优先用表驱动与共享 helper；`FakeHost` 与 fixture 加载可复用现有实现，但所有 `readFileSync` 必须收敛到 ≤4 的数据加载点。
- 与并行项 A（`src/main/release-evidence.test.ts`）零文件重叠；若 `main` 已前进，先 rebase 最新 main 再合并，`.munk/code-gates.json` 冲突取最小改动。
- 所有交付命令在自身 worktree 执行；不得用 `--no-verify`、不得跳过 lint/typecheck。
