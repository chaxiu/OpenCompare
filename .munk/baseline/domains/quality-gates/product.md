# Domain: quality-gates

质量门禁分层与采样纪律域：定义「默认门禁矩阵只放纯单测 / 构建类门禁，长跑采样进条件 profile」这一策略，及其 manifest 文件、回归钉板单测与文档口径。本域管**门禁清单的形状与触发纪律**，不管被测行为本身——`pnpm perf:gate` 测什么、阈值多少归 `perf-memory`；缓存上限与释放归 `memory-bounded`；平台/脚手架初始化时的初版门禁清单归 `foundation`（历史记录不改写）；发版 CI 的门禁 job 归 `release`。本域是门禁清单的唯一现行口径来源。

## 范围

- **默认矩阵收敛为 10 项（`.munk/code-gates.json`）**：`version: 1`，`gates` 恰为 10 项，id 顺序固定 `install, lint, typecheck, build, build-web, test, test-compare-request, cancel-gate, memory-gate, structured-semantics`；命令逐字为 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `pnpm test src/shared/compareRequest.test.ts` / `pnpm test:cancel` / `pnpm test:memory` / `pnpm test:structured`，`cwd` 均为 `"."`。默认矩阵**不得**包含 `perf-gate`，也不得包含 `perf:dir`。`cancel-gate` / `memory-gate` / `structured-semantics` 三个较重的既有单测门禁留在默认矩阵内（它们不启动 Electron、不打包）。**扩容纪律**：往默认矩阵加项只能追加在末尾并同一次提交更新 `src/munk-gates.test.ts` 期望矩阵与长度断言，前序条目逐字逐序不得改动（2026-10-31 由 WI `wi_ws_ffe5e8010c083c42` 从 9 扩到 10，旧 AC id `ac-manifest-nine-gates` / `ac-manifest-commands-intact` 的 9 项口径由下方 `ac-manifest-ten-gates` / `ac-manifest-commands-intact-ten` 取代）。
- **条件采样 profile（`.munk/code-gates.perf.json`）**：`version: 1`，唯一 gate `perf-gate`（`cwd: "."`、`command: "pnpm perf:gate"` 逐字、单 argv 不含 `&&` / `||` / `|` / `;`，不含 `perf:dir`），`description` 为非空字符串，必须写明三件事：① 该 profile **不进默认 `code_gates`**、Host 不自动执行；② 触发条件——diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时调用，或作为里程碑 `x.y.0` 的独立验收任务一次性跑；③ 采样纪律——同一被测对象同一 commit 只采样一次，重跑须在 digest 写明上一轮作废原因与两轮差异。
- **回归钉板单测（`src/munk-gates.test.ts`）**：纯静态读两个 manifest（`process.cwd()` 相对路径，`node:fs` + `JSON.parse`），不启动 Electron、不写临时目录、不依赖网络；靠既有 `vitest run` include `src/**/*.test.ts` 进入 `pnpm test`，不新增 npm script。断言默认矩阵恰 10 项且 id 顺序一致、10 条命令逐字不变且 `cwd === "."`、不含 `perf-gate` / `perf:dir`、`cancel-gate` / `memory-gate` / `structured-semantics` 仍在；断言 perf profile 存在、版本 1、唯一项字段逐字相等、单 argv 无 shell 连接符、`description` 含条件 profile 口径 / 六类触发路径 / `x.y.0` / 同 commit 只采一次与 digest 重跑说明。把 `perf-gate` 改回或追加到默认矩阵即红。
- **文档口径同步**：`docs/perf/large-directory-memory.md` §2 不再声称「`.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`」，改为指向 `.munk/code-gates.perf.json` 条件 profile 并列出三条采样纪律；`.munk/baseline/tech/overview.md` 的「质量门禁」一节写为「默认 9 项 + 条件 profile」，不再声称默认矩阵含 `perf-gate`，同时把 perf 门禁段标题从「门禁」改为「条件门禁（不进默认矩阵）」。
- **JSON 形态约束**：两个 manifest 均 2 空格缩进、无尾逗号、`version: 1`，命令一律单 argv 字符串。

## 验收

- **ac-manifest-ten-gates**：`.munk/code-gates.json` 为 `version: 1`，`gates` 长度恰为 10，id 顺序为 `install, lint, typecheck, build, build-web, test, test-compare-request, cancel-gate, memory-gate, structured-semantics`；不含 `id: "perf-gate"`。
- **ac-manifest-commands-intact-ten**：10 项 command 逐字不变（`pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `pnpm test src/shared/compareRequest.test.ts` / `pnpm test:cancel` / `pnpm test:memory` / `pnpm test:structured`），`cwd` 均为 `"."`；前 9 项 id / 顺序 / 命令与扩容前逐字相同，第 10 项为末尾追加。
- **ac-gate-append-only**：默认矩阵扩容只做加法——前 9 条 `{id, command}` 逐字逐序保留，新条目追加在末尾；`src/munk-gates.test.ts` 的期望矩阵长度断言与 `gates` 长度同步（当前 10），新条目命令为单 argv（不含 `&&` / `||` / `|` / `;`）且不引入 `perf-gate`。
- **ac-perf-profile-file**：`.munk/code-gates.perf.json` 存在且可 `JSON.parse`，`version === 1`，`gates` 长度恰为 1，唯一项 `id === "perf-gate"`、`cwd === "."`、`command === "pnpm perf:gate"`（逐字相等）。
- **ac-perf-profile-single-argv**：该命令不含 `&&`、`||`、`|`、`;`，且不等于/不包含 `perf:dir`。
- **ac-perf-profile-description**：该文件 `description` 为非空字符串，同时包含条件 profile 口径（不进默认 `code_gates`）、触发条件（diff 触及扫描/哈希/缓存/IPC/树渲染/取消路径，或里程碑 x.y.0 独立验收一次）、以及「同一 commit 只采样一次 + 重跑须在 digest 写明作废原因与两轮差异」三条采样纪律的关键表述。
- **ac-pin-test-green**：`src/munk-gates.test.ts` 存在并被默认 `pnpm test` 收录，`pnpm test` 全绿；把任一默认矩阵条目改回/追加 `perf-gate` 时该测试失败（红）。
- **ac-default-gates-green**：默认矩阵 10 项（install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics）在交付提交上全部 passed，`manifest.summary` 为「code_gates passed (10 gates)」且无 failedGateIds；该结论不替代条件 profile 的 `perf-gate`（后者按触发纪律单跑）。
- **ac-unit-gates-kept**：默认矩阵中 `cancel-gate` 的 command 为 `pnpm test:cancel`、`memory-gate` 的 command 为 `pnpm test:memory`、`structured-semantics` 的 command 为 `pnpm test:structured`，三者均不被移出。
- **ac-docs-perf-md**：`docs/perf/large-directory-memory.md` §2 不再出现「`.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`」的默认矩阵口径，改为指向 `.munk/code-gates.perf.json` 的条件 profile，并写明三条采样纪律（条件触发 / 里程碑一次 / 同 commit 只采一次且重跑需在 digest 说明）。
- **ac-docs-tech-overview**：`.munk/baseline/tech/overview.md` 门禁清单一节写为默认 9 项 + 条件 profile，且不再声称默认矩阵含 `perf-gate`。
- **ac-diff-scope**：`git diff --name-only`（相对改动前 HEAD）仅含 `.munk/code-gates.json`、`.munk/code-gates.perf.json`、`src/munk-gates.test.ts`、`docs/perf/large-directory-memory.md`、`.munk/baseline/tech/overview.md`。
- **ac-no-perf-run**：本项执行过程中未运行 `pnpm perf:gate` / `pnpm perf:dir` / `electron-vite build` / 打包，也无真机采样证据文件产出。

## 非目标

- 不跑 `pnpm perf:gate` / `pnpm perf:dir`，不打包、不做任何真机采样（本项 diff 不触及扫描/哈希/缓存/IPC/树渲染/取消路径，不满足条件触发）。
- 不改 `perf/profiles.json` 阈值，不改 `scripts/perf-gate.mjs` / `scripts/perf-dir.mjs`。
- 不改任何业务源码（`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**` 运行时文件）。
- 不改 `package.json`（含 `version`、scripts）、`CHANGELOG.md`、`README.md` 版本表、`.github/workflows/**`、`electron-builder.yml` 或任何发布文件。
- 不新增除 `perf-gate` 外的任何门禁；不改既有 9 项 id / 顺序 / 命令。
- 不改 `.munk/baseline/domains/**` 的历代域记录（`foundation` / `release` / `perf-memory` 等历史交付记录），如需回改另开工作项。
- 不动 Host 侧行为：不假设 Host 会自动执行 `.munk/code-gates.perf.json`；条件 profile 是给人 / agent 读的清单，不是自动门禁。

## 实现约束

- 新增测试用 `node:fs` 读仓库根下两个 manifest（`process.cwd()` 相对路径），纯静态断言，不启动 Electron、不写临时目录、不依赖网络。
- 测试文件命名为 `src/munk-gates.test.ts`，靠现有 vitest include 规则进入 `pnpm test`；不新增 npm script。
- 两个 JSON 保持 2 空格缩进、无尾逗号；`cwd` 用 `"."`，命令均为单 argv 字符串。
- **门禁分层的判据是「单次运行时长与机器占用」而非「重要性」**：纯单测与构建留在默认矩阵；启动 Electron、真机长跑或需要独占机器的采样只进条件 profile。往默认矩阵加任何长跑项都必须先问「它会不会在每个工作项上各付一次完整构建」。
- 条件 profile 与默认矩阵是两个文件、两个版本号，互不 import；profile 文件不提供默认矩阵的兜底内容，避免「读错文件也可能绿」。
- 文档与服务端口径同步：改矩阵形状必须同一次提交里改 `docs/perf/large-directory-memory.md` 与 `.munk/baseline/tech/overview.md`，否则下一代 agent 会按旧口径在默认矩阵里找 `perf-gate`。
- `.munk/baseline/**` 的 fold 由 Delivery 承担：本域只记录现行门禁口径与 AC 定义，历史域记录（`foundation` 的 `ac-gates`、`perf-memory` 的 `ac-gate-wired`）按当初事实保留，由本域声明取代关系。

## 最近交付证明

- WI：`wi_ws_ffe5e8010c083c42`（真实文件语义门 → 默认矩阵 9 → 10，`key: structured-real-file-semantics-gate`）
- 日期：2026-10-31
- 结果：code_gates passed（10 gates 矩阵，`needSelfTest: false`）。**本域口径同步更新**：默认矩阵 9 → 10，末尾追加 `structured-semantics`。
- 覆盖摘要：① `.munk/code-gates.json` 的 `gates` 末尾追加 `{ "id": "structured-semantics", "cwd": ".", "command": "pnpm test:structured" }`，前 9 项 id / 顺序 / 命令 / `cwd` 逐字未动，矩阵长度 9 → 10；② `package.json` 新增单 argv 脚本 `test:structured`（`vitest run src/structured-semantics-gate.test.ts`）；③ `src/munk-gates.test.ts` 期望矩阵追加第 10 条、长度断言 9 → 10，原 9 条逐字逐序保留（扩容只做加法，`ac-gate-append-only`）；④ 新门测什么归 `structured` 域（真实 JSON/YAML fixtures 的键序无关 / 格式无关 / 真实差异不漏），本域只管**清单形状与触发纪律**。矩阵扩容后仍无 `perf-gate` / `perf:dir`，条件 profile `.munk/code-gates.perf.json` 零改动。
- 注：本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；AC 落档为 `qa/gate-matrix-ten-structured.md`。`.munk/baseline/tech/overview.md` 质量门禁节的「默认矩阵 9 项」由 Delivery 同步为 10 项（门禁形状变更的事实同步，非 tech.md 折叠）。
- 后续注意（仍有效）：① **任何「跑一遍全部门禁」的直觉都会漏采样**——默认矩阵只守护纯单测 / 构建，触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径的 WI 必须显式跑 `.munk/code-gates.perf.json` 的 `pnpm perf:gate`，且同一 commit 只采一次；不跑就在交付说明里写清为何不满足触发条件。② 门禁数量变化会让所有「9 gates」旧描述过时（`tech/overview.md` 已改；历史域记录按当初事实保留），后续汇报一律说「默认 10 项 + 条件 profile」。③ `src/munk-gates.test.ts` 读的是 `process.cwd()` 下的 manifest，若将来 vitest 改成非仓库根 cwd，该测试会红而非静默跳过。④ 扩容已让 `pnpm test` 与 `pnpm test:structured` 双重覆盖新门文件，成本可接受（纯单测，不启动 Electron）；再加项仍须先问「它会不会在每个工作项上各付一次完整构建」。
