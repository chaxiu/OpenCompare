# 门禁分层：perf-gate 移出默认矩阵 + 条件 profile + 回归钉板

## 背景

`.munk/code-gates.json` 现为 10 项，其中 `perf-gate`（`pnpm perf:gate` = electron-vite build + 真跑 upsert 5 轮 + multisession 3 tab）在 2026-10-23 的 5 个工作项里各付一次完整构建 + 真机长跑（02:17 wi_21460f51、02:29 wi_c671f3de、03:26 wi_4bea6446、04:33 wi_139d8079、05:17 wi_113057fa），违反「长跑只条件触发、且采样独占机器」。本项落地门禁分层：默认矩阵只留纯单测/构建类门禁，重采样进条件 profile。

## 范围

1. `.munk/code-gates.json`：删除 `perf-gate` 一项，其余 9 项（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）内容与顺序原样保留。
2. 新建 `.munk/code-gates.perf.json`：`version: 1`，唯一 gate `perf-gate`（`cwd: "."`、`command: "pnpm perf:gate"` 逐字），`description` 写明条件 profile 口径与三条采样纪律（不进默认 code_gates；仅在 diff 触及扫描/哈希/缓存/IPC/树渲染/取消路径时调用，或作为里程碑 x.y.0 的独立验收任务一次跑；同一被测对象同一 commit 只采样一次，重跑须在 digest 写明上一轮作废原因与两轮差异）。Host 不自动执行该文件，它就是给人/agent 用的条件 profile。
3. 新增回归钉板单测 `src/munk-gates.test.ts`，被现有 `pnpm test`（`vitest run`，include `src/**/*.test.ts`）自动纳入：断言默认矩阵恰好 9 项且不含 `perf-gate` / 不含 `perf:dir`；断言 perf profile 存在、版本 1、唯一 gate 为 `perf-gate` 且命令逐字 `pnpm perf:gate`（单 argv，不含 `&&` `||` `|` `;`）；断言 `memory-gate` 与 `cancel-gate` 仍在默认矩阵。配置回退即红。
4. 文档口径同步：
   - `docs/perf/large-directory-memory.md` §2 中「`.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`」改为条件 profile 口径，写明三条采样纪律。
   - `.munk/baseline/tech/overview.md` 的「质量门禁」清单改为「默认 9 项 + 条件 profile」，不再声称默认含 `perf-gate`。

## 验收

- ac-manifest-nine-gates: `.munk/code-gates.json` 为 `version: 1`，`gates` 长度恰为 9，id 顺序为 `install, lint, typecheck, build, build-web, test, test-compare-request, cancel-gate, memory-gate`；不含 `id: "perf-gate"`。
- ac-manifest-commands-intact: 保留的 9 项 command 逐字不变（`pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `pnpm test src/shared/compareRequest.test.ts` / `pnpm test:cancel` / `pnpm test:memory`），`cwd` 均为 `"."`。
- ac-perf-profile-file: `.munk/code-gates.perf.json` 存在且可 `JSON.parse`，`version === 1`，`gates` 长度恰为 1，唯一项 `id === "perf-gate"`、`cwd === "."`、`command === "pnpm perf:gate"`（逐字相等）。
- ac-perf-profile-single-argv: 该命令不含 `&&`、`||`、`|`、`;`，且不等于/不包含 `perf:dir`。
- ac-perf-profile-description: 该文件 `description` 为非空字符串，同时包含条件 profile 口径（不进默认 `code_gates`）、触发条件（diff 触及扫描/哈希/缓存/IPC/树渲染/取消路径，或里程碑 x.y.0 独立验收一次）、以及「同一 commit 只采样一次 + 重跑须在 digest 写明作废原因与两轮差异」三条采样纪律的关键表述。
- ac-pin-test-green: `src/munk-gates.test.ts` 存在并被默认 `pnpm test` 收录，`pnpm test` 全绿；把任一默认矩阵条目改回/追加 `perf-gate` 时该测试失败（红）。
- ac-unit-gates-kept: 默认矩阵中 `cancel-gate` 的 command 为 `pnpm test:cancel`、`memory-gate` 的 command 为 `pnpm test:memory`，二者均不被移出。
- ac-docs-perf-md: `docs/perf/large-directory-memory.md` §2 不再出现「`.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`」的默认矩阵口径，改为指向 `.munk/code-gates.perf.json` 的条件 profile，并写明三条采样纪律（条件触发 / 里程碑一次 / 同 commit 只采一次且重跑需在 digest 说明）。
- ac-docs-tech-overview: `.munk/baseline/tech/overview.md` 门禁清单一节写为默认 9 项 + 条件 profile，且不再声称默认矩阵含 `perf-gate`。
- ac-diff-scope: `git diff --name-only`（相对改动前 HEAD）仅含 `.munk/code-gates.json`、`.munk/code-gates.perf.json`、`src/munk-gates.test.ts`、`docs/perf/large-directory-memory.md`、`.munk/baseline/tech/overview.md`。
- ac-no-perf-run: 本项执行过程中未运行 `pnpm perf:gate` / `pnpm perf:dir` / `electron-vite build` / 打包，也无真机采样证据文件产出。

## 非目标

- 不跑 `pnpm perf:gate` / `pnpm perf:dir`，不打包、不做任何真机采样（本项 diff 不触及扫描/哈希/缓存/IPC/树渲染/取消路径，不满足条件触发）。
- 不改 `perf/profiles.json` 阈值，不改 `scripts/perf-gate.mjs` / `scripts/perf-dir.mjs`。
- 不改任何业务源码（`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**` 运行时文件）。
- 不改 `package.json`（含 `version`、scripts）、`CHANGELOG.md`、`README.md` 版本表、`.github/workflows/**`、`electron-builder.yml` 或任何发布文件。
- 不新增除 `perf-gate` 外的任何门禁；不改既有 9 项 id / 顺序 / 命令。
- 不改 `.munk/baseline/domains/**` 的历代域记录（foundation / release / perf-memory 等历史交付记录），如需回改另开工作项。
- 不动 Host 侧行为：不假设 Host 会自动执行 `.munk/code-gates.perf.json`。

## 实现约束

- 新增测试用 `node:fs` 读仓库根下两个 manifest（`process.cwd()` 相对路径），纯静态断言，不启动 Electron、不写临时目录、不依赖网络。
- 测试文件命名为 `src/munk-gates.test.ts`，靠现有 vitest include 规则进入 `pnpm test`；不新增 npm script。
- 两个 JSON 保持 2 空格缩进、无尾逗号；`cwd` 用 `"."`，命令均为单 argv 字符串。
- 本项 `needSelfTest=false`，以 `code_gates`（9 项默认矩阵）为交付门槛。
