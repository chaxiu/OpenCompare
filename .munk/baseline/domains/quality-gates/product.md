# Domain: quality-gates

质量门禁分层与采样纪律域：定义「默认门禁矩阵只放纯单测 / 构建类门禁，长跑采样进条件 profile」这一策略，及其 manifest 文件、回归钉板单测与文档口径。本域管**门禁清单的形状与触发纪律**，不管被测行为本身——`pnpm perf:gate` 测什么、阈值多少归 `perf-memory`；缓存上限与释放归 `memory-bounded`；平台 / 脚手架初始化时的初版门禁清单归 `foundation`（历史记录不改写）；发版 CI 的门禁 job 归 `release`；`verify-release-gate` 与 spike 门禁的被测行为归 `release-verify`。本域是门禁清单的唯一现行口径来源。

## 范围

- **默认矩阵 26 项（`.munk/code-gates.json`）**：`version: 1`，`gates` 恰 26 项，id 顺序固定 `install, lint, typecheck, build, build-web, test, test-compare-request, cancel-gate, memory-gate, structured-semantics, sync-real-gate, diff-normalize, diff-normalize-real, spike-launch-gate, spike-process-tree-gate, template-default-unchecked, template-single-source, template-sha-mtime, template-cancel-zero-write, template-e2e-real, template-case-collision, template-path-contained, template-move-actions, template-move-verify, verify-release-gate, test-debt-gate`；命令逐字为 `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `pnpm test src/shared/compareRequest.test.ts` / `pnpm test:cancel` / `pnpm test:memory` / `pnpm test:structured` / `pnpm test:sync-real` / `pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts` / `pnpm test src/diff-normalize-real-gate.test.tsx` / `pnpm test src/spike-launch-gate.test.ts` / `pnpm test src/spike-process-tree-gate.test.ts` / 九条 `pnpm test src/template-gate-*.test.ts` / `pnpm test src/template-e2e-real-directory.test.ts` / `pnpm test src/verify-release-gate.test.ts` / `node scripts/test-debt-gate.mjs`，`cwd` 均为 `"."`。默认矩阵**不得**含 `perf-gate` 或 `perf:dir`。
- **扩容纪律**：往默认矩阵加项只能**追加在末尾**并同一次提交更新 `src/munk-gates.test.ts` 的期望矩阵与长度断言，前序条目逐字逐序不得改动；新条目命令为单 argv（不含 `&&` / `||` / `|` / `;`）。历史口径（9 → 10 → 11 → 16 → 18 → 20 → 21 → 22 → 24 → 26）只作沿革，任何旧计数表述均不得回写为新基线。
- **分层判据是「单次运行时长与机器占用」而非重要性**：纯单测与构建留在默认矩阵；启动 Electron、真机长跑或需独占机器的采样只进条件 profile。加任何长跑项前先问「它会不会在每个工作项上各付一次完整构建」。`cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `diff-normalize*` / 两条 spike 门禁 / 九条模板门禁 / `verify-release-gate` / `test-debt-gate` 留在默认矩阵是因为它们不启 Electron、不打包，只写 `mkdtemp` 临时目录或注入 fixture（`verify-release-gate` 不连网、不读本机 6.4 GiB；`test-debt-gate` 只读、零写盘、约 1 s）。
- **条件采样 profile（`.munk/code-gates.perf.json`）**：`version: 1`，唯一 gate `perf-gate`（`cwd: "."`、`command: "pnpm perf:gate"` 逐字、单 argv、不含 `perf:dir`），`description` 必须写明三件事：① 不进默认 `code_gates`、Host 不自动执行；② 触发条件——diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时调用，或作为里程碑 `x.y.0` 的独立验收任务一次性跑；③ 采样纪律——同一被测对象同一 commit 只采样一次，重跑须在 digest 写明上一轮作废原因与两轮差异。
- **回归钉板单测（`src/munk-gates.test.ts`）**：纯静态读两个 manifest（`process.cwd()` 相对路径，`node:fs` + `JSON.parse`），不启 Electron、不写临时目录、不联网；靠既有 `vitest include 'src/**/*.test.ts'` 进入 `pnpm test`，不新增 npm script。断言：矩阵恰 26 项且 id 顺序一致、26 条命令逐字且 `cwd === "."`、不含 `perf-gate` / `perf:dir`、关键门禁仍在（末尾 `verify-release-gate` → `test-debt-gate`）；perf profile 存在、版本 1、唯一项字段逐字、单 argv、`description` 含条件 profile 口径 / 六类触发路径 / `x.y.0` / 同 commit 只采一次与 digest 重跑说明。把 `perf-gate` 改回或追加到默认矩阵即红。
- **测试清债回归门（`test-debt-gate`）**：只读、确定性、无网络、零写盘的 Node ESM 脚本 + `.munk/baseline/test-debt.json`，矩阵末位（单 argv `node scripts/test-debt-gate.mjs`）；所有数字只存在 baseline，脚本不保留字面量副本。判据：① **棘轮**——ceilings（`appTestLines` / `syncRealGateLines` / `pairLines` / `repoTestLines`）只减不增、floors（`appTestCases` / `syncRealGateCases` / `repoTestCases`）只增不减；baseline 相对 git 已提交版本只许收紧（无提交历史时打印 `first landing` 放行）；② **harness 预算**——`harness.files` 逐文件与合计各 ≤400 行，清单空即放行；③ **零容忍字面量**——`src/**` / `scripts/**` / `docs/**` 的 `.ts` / `.tsx` 不得出现 `package.json#version` 运行时派生值字面量，也不得出现白名单外的 64 位小写 sha256 字面量（白名单只有 `sha256("")` / `sha256("abc")`；历史发布锚点 `0.2.1`–`0.2.15` 不在禁令内）；④ **用例数取 vitest 收集结果**，不用 `it(` / `test(` 字面量计数；⑤ **docs / yml 只断结构**——不读原文做整句断言，并对含 docs / yml 路径字面量的测试文件扫描「`toContain` / `includes` 直接字符串实参含中文句读或 ≥8 个空白分隔英文词」；⑥ **ESLint 兜底**——内联 plugin 规则 `opencompare/no-test-sentinel` 作用于 `**/*.test.{ts,tsx}`，`expect(` 计数为 0 或用 `it(` / `test(` 字面量计数当哨兵即红。被测行为本身归 `test-harness` / `test-determinism`。
- **行为 → 门禁覆盖映射**：默认矩阵的 `description` 同时承载**可复核索引**——把被测行为映射到「门禁 id + 承载断言的真实测试文件路径」，与矩阵形状解耦（只改 `description`，不新增矩阵项、不改 `package.json`）：四条单向镜像同步（`mirror delete opt-in` / `idempotent dry-run` / `mtime and relative structure preserved` / `link mtime alignment`）、四条模板归位（`conflict and overwrite default-unchecked` / `counts and apply read one resolved plan` / `source sha256 and mtimeSec preserved` / `cancel writes nothing`）、两条模板安全（`case-only collision and exact-name priority` / `relative path containment and path-escape refusal`）、两条模板移动（`per-row action column and explicit move` / `real-disk move write verify delete keeps the source`）、九条模板门禁 id 与测试文件路径、`template-e2e-real` 真实外部目录全链路说明、`verify-release-gate`（15 项 A 层注册表 / CI 零 heap / B 层 16 MiB / 只读 workflow）与两条 spike 门禁（平台启动描述 / 进程组收尾）。标记用稳定可搜索的英文短语，门禁 id 用反引号、测试文件用仓库根相对路径，由钉板静态断言「标记 + id + 路径出现且文件真实存在」，漂移即红。
- **文档口径同步**：`docs/perf/large-directory-memory.md` §2 指向 `.munk/code-gates.perf.json` 条件 profile 并列出三条采样纪律；`.munk/baseline/tech/overview.md` 的「质量门禁」一节写「默认 26 项 + 条件 profile」，不声称默认矩阵含 `perf-gate`。
- **JSON 形态**：两个 manifest 均 2 空格缩进、无尾逗号、`version: 1`，命令一律单 argv 字符串，`cwd` 用 `"."`。

## 验收

- **ac-manifest-twenty-six-gates / ac-manifest-commands-intact-twenty-six**：`.munk/code-gates.json` 为 `version: 1`，`gates` 长度恰 26，id 顺序与上面逐字一致；26 条命令逐字不变、`cwd` 均为 `"."`；不含 `id: "perf-gate"`。旧 22 / 20 / 18 / 16 / 11 / 10 / 9 项口径记为历史，不回写。
- **ac-gate-append-only**：扩容只做加法——前序 `{id, command}` 逐字逐序保留，新条目追加末尾；钉板的期望矩阵与长度断言同步；新命令单 argv 且不引入 `perf-gate`。
- **ac-default-gates-green**：26 项在交付提交上全部 passed，`code_gates` manifest 记 26 项全过且 `failedGateIds` 为空；该结论不替代条件 profile 的 `perf-gate`（按触发纪律单跑）。
- **ac-unit-gates-kept**：`cancel-gate` = `pnpm test:cancel`、`memory-gate` = `pnpm test:memory`、`structured-semantics` = `pnpm test:structured`、`sync-real-gate` = `pnpm test:sync-real`，四者不得被移出；`verify-release-gate` 与 `test-debt-gate` 独占末两位。
- **ac-no-perf-run**：本域交付不跑 `pnpm perf:gate` / `pnpm perf:dir` / `electron-vite build` / 打包，也不产出真机采样证据文件（diff 不触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时不满足触发条件）。
- **ac-perf-profile-file / ac-perf-profile-single-argv / ac-perf-profile-description**：profile 存在且可 parse、`version === 1`、`gates` 长度 1、唯一项 `id === "perf-gate"` / `cwd === "."` / `command === "pnpm perf:gate"` 逐字；命令不含 shell 连接符、不含 `perf:dir`；`description` 非空且含条件 profile 口径 + 触发条件 + 采样纪律。
- **ac-pin-test-green**：`src/munk-gates.test.ts` 存在并被默认 `pnpm test` 收录且全绿；把任一默认矩阵条目改回 / 追加 `perf-gate` 时该测试失败。
- **ac-manifest-coverage-map**：`description` 同时含四条同步、四条模板归位、两条模板安全、两条模板移动标记，九条模板门禁 id 与测试文件路径，`verify-release-gate` 与两条 spike 门禁的覆盖映射；文案保持英文。
- **ac-manifest-pin-test**：钉板保留静态用例（读 manifest + `existsSync`，不写临时目录、不启 Electron、不联网）——标记 / 门禁 id / 测试文件路径出现且文件存在；模板门禁位于 `verify-release-gate` 之前、`cwd === "."`、命令逐字、单 argv 无连接符；门禁源码不含样本标记（`@shared/fixtures` / `DIRECTORY_SAMPLE_PATHS` / 样本挂载字面路径）；`verify-release-gate` 与 `test-debt-gate` 的末两位位置与命令逐字。改 `description` 删任一标记、搬走或删除门禁文件、或在门禁里引用样本夹具即红。
- **ac-test-debt-baseline-json / ac-test-debt-baseline-measured**：baseline 可 parse、`version === 1`，含 `ceilings`（四个正整数）、`floors`（三个正整数且 ≥ 实测收集数）、`harness`（`perFileMaxLines: 400` / `totalMaxLines: 400` / `files` 数组）、`literalWhitelist.sha256`（恰两标准向量）、`measuredAt`（40 位 sha + ISO 日期）；在 `measuredAt.commit` 树上重测四项 ceiling / 三项 floor 与 baseline 一致，脚本无数字字面量副本。
- **ac-test-debt-ceiling-ratchet / ac-test-debt-floor-ratchet / ac-test-debt-tighten-only**：任一 ceiling 超限或任一 floor 不足即非零退出并输出指标名与实测值；baseline 调大 ceiling / 调小 floor 即非零并指出「只许收紧」（无提交历史时打印 `first landing` 放行）。
- **ac-test-debt-cases-collected / ac-test-debt-harness-budget**：用例数取 `vitest list --json`（或等价只收集不执行）结果并逐文件打印；`harness.files` 逐文件与合计 ≤400，指向 >400 行文件即非零。
- **ac-test-debt-version-literal / ac-test-debt-asset-sha-literal / ac-test-debt-docs-yml-structural / ac-test-debt-eslint-rule**：版本与 64 位 sha 字面量零命中（新增伪造值即红并打印文件:行）；脚本不读 `docs/**` 与 `*.yml` 做原文断言，含路径字面量的测试文件不得整句断言；`no-test-sentinel` 规则在当前树 exit 0，注入哨兵后非零且报规则 id。
- **ac-test-debt-speed / ac-test-debt-injection-four / ac-test-debt-final-snapshot**：连续 3 次 ≤20 s；四条注入（超 ceiling / 插版本字面量 / 删用例低于 floor / 调大 ceiling 或调小 floor）真实变红、恢复后回绿，注入不留交付树；baseline 录自真实实测 main，ceiling 取实测值不硬编码，若收尾时 main 不达标则停手上报。
- **ac-test-debt-product-untouched / ac-test-debt-diff-scope / ac-diff-scope**：不改产品运行时代码、`package.json`、既有门禁测试文件、`scripts/verify-release.mjs`、tag / Release / 资产；diff 仅含 `scripts/test-debt-gate.mjs`、`.munk/baseline/test-debt.json`、`.munk/code-gates.json`、`src/munk-gates.test.ts`、`eslint.config.mjs`、`.munk/baseline/tech/overview.md`（Delivery fold 允许追加域基线文档）。
- **ac-docs-perf-md / ac-docs-tech-overview**：`docs/perf/large-directory-memory.md` §2 指向条件 profile 并写三条采样纪律；`tech/overview.md` 写「默认 26 项 + 条件 profile」，不回写旧计数。
- **ac-coverage-map-diff-scope**：覆盖映射类改动 diff 仅含 `.munk/code-gates.json`、`src/munk-gates.test.ts` 与该行为域自己的测试文件及 change pack 记录；`package.json`、矩阵项、条件 profile 零改动。

## 非目标

- 不跑 `pnpm perf:gate` / `pnpm perf:dir`，不打包、不做真机采样；不改 `perf/profiles.json` 阈值与 `scripts/perf-gate.mjs` / `scripts/perf-dir.mjs`。
- 不改任何业务源码（`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**` 运行时文件）；被测行为归各行为域。
- 不改 `package.json`（含 `version`、scripts）、`CHANGELOG.md`、README 版本表、`.github/workflows/**`、`electron-builder.yml` 或任何发布文件。
- 不新增除 `perf-gate` 外的条件 profile 项；默认矩阵现行 26 项 id / 顺序 / 命令不得改动，新增门禁只能末尾追加并同一次提交同步钉板。
- 不改 `.munk/baseline/domains/**` 的历代域记录（`foundation` / `release` / `perf-memory` 等历史交付记录），如需回改另开工作项；不改写历史「n gates」表述。
- 不动 Host 侧行为：不假设 Host 会自动执行 `.munk/code-gates.perf.json`；条件 profile 是给人 / agent 读的清单，不是自动门禁。
- 不为「让门看起来更全」把 e2e / 真实磁盘门继续拆成新矩阵项——规模放大优先并入既有门文件。

## 实现约束

- 新增测试用 `node:fs` 读仓库根下两个 manifest（`process.cwd()` 相对路径），纯静态断言，不启 Electron、不写临时目录、不联网；测试文件命名 `src/munk-gates.test.ts`，靠现有 include 进入 `pnpm test`，不新增 npm script。
- 两个 JSON 保持 2 空格缩进、无尾逗号；`cwd` 用 `"."`，命令均为单 argv。
- **分层判据是成本**：纯单测与构建留默认矩阵；启动 Electron / 真机长跑只进条件 profile。`test-debt-gate` 属纯单测量级（只读 + `vitest list`，约 1 s），禁止扩成 `vitest run` / 覆盖率冷跑 / Electron 启停；棘轮数字只能来自实测写进 baseline，脚本不得写字面量副本、不得手写数字让门当场红。
- 条件 profile 与默认矩阵是两个文件、两个版本号，互不 import；profile 不提供默认矩阵的兜底内容，避免「读错文件也可能绿」。
- **覆盖映射是四跳链**（`description` marker → 门禁 id → 测试文件路径 → 文件内用例名），改任一端都要同时改另外三端；断点最先出现在钉板（marker / 路径不在或文件不存在）。映射不替代门禁本体——它只证明「行为在清单里有落点」。
- 文档与口径同步：改矩阵形状必须同一次提交改 `docs/perf/large-directory-memory.md` 与 `.munk/baseline/tech/overview.md`，否则下一代 agent 会按旧口径找 `perf-gate`。
- 扩容同时移动钉板里所有位置断言（模板门禁 `slice` 边界、末位 id、长度、标题）；新增模板类门禁只需追加 `TEMPLATE_GATES` 映射条目，「末尾位置 / 命令逐字 / 文件存在 / 单 argv / 样本标记扫描」五类断言自动覆盖，不要另起常量。
- `.munk/baseline/**` 的 fold 由 Delivery 承担：本域只记录现行门禁口径与 AC 定义，历史域记录按当初事实保留，由本域声明取代关系。

## 最近交付证明

- WI：`wi_intake_ea6ca87a9207ea2e`（默认矩阵 21 → 22：末尾追加测试清债棘轮门禁 `test-debt-gate`，新增 baseline JSON + 内联 ESLint 兜底规则，同步钉板断言与 `tech/overview.md` 计数）
- 日期：2026-11-02
- 结果：`code_gates` attempt 001 **22/22 passed**、`ok: true`、`failedGateIds: []`（`.munk/runs/run_intake_ea6ca87a9207ea2e/code-gates/attempts/001`，install → test-debt-gate 约 73 s）；`pnpm test` 115 files / 1796 passed + 1 skipped（1797）、29.72 s；`pnpm lint` exit 0；`test-debt-gate` 单跑 1.02 s（ceiling / floor / 收集数 / harness / 版本字面量 / sha256 / doc-reading / tighten-only 全 ok）。
- 覆盖摘要：① **矩阵扩容**——`gates` 末尾按序追加 `test-debt-gate`（`node scripts/test-debt-gate.mjs`、`cwd: "."`、单 argv），前 21 项逐字未动；钉板 `EXPECTED_GATES` / `toHaveLength` / 标题同步，新增 `slice(-2)` 结构断言。② **baseline 快照**——`.munk/baseline/test-debt.json` 录自 `120f06d`（main 已含 Q5 去重结果）：`pairLines` 4,950（`App.test.tsx` 2,959 + `sync-real-gate.test.ts` 1,991）、`repoTestLines` 42,724、floors App 94 / sync-real 32 / 全仓 1,373、`harness.files` 只有 `src/test/sharedHarness.tsx`（279 行）、sha256 白名单恰两标准向量；数字零字面量副本。③ **判据落地**——双棘轮 + git 历史只许收紧、harness ≤400、版本与 64 位 sha 零容忍、用例数取 `vitest list`、doc-reading 整句扫描、`opencompare/no-test-sentinel` 内联 ESLint 规则兜底。④ **文档计数同步**——`tech/overview.md` 质量门禁节改为「默认矩阵 22 项」。
- 注：① 本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`）。② **floor 实际落 94 而非 prd 写的 ≥95**：Q5 的 harness 去重（main `120f06d`）合并了重复用例，门按实测定 floor，注入红路径是「删一条用例使用例数 < floor」。③ 矩阵尾部现在是 `verify-release-gate` → `test-debt-gate`，再追加门禁要同时移动 `slice(-2)` 边界。④ `test-debt-gate` 成本来自 `vitest list` 收集；若改成 `vitest run` 就不再属纯单测，必须迁出默认矩阵。
- 跨轮补充（不计入本 WI 交付）：矩阵在后续两轮由 `release-verify` 相关 WI 追加 `diff-normalize` / `diff-normalize-real` / `spike-launch-gate` / `spike-process-tree-gate`，现行 26 项；这两条 spike 门禁均不启 Electron / xvfb、不联网、硬超时，仍属纯单测量级。新增门禁时同批更新钉板（现为 26 项 + 尾部两位断言）与覆盖映射。
