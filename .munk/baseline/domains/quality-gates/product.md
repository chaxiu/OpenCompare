# Domain: quality-gates

质量门禁分层与采样纪律域：默认门禁矩阵只放纯单测 / 构建类门禁，长跑采样进条件 profile；本域管**门禁清单的形状与触发纪律**，不管被测行为本身。`perf:gate` 测什么与阈值归 `perf-memory`，缓存上限归 `memory-bounded`，平台初始化时的初版清单归 `foundation`，发版 CI 的门禁 job 归 `release`。本域是门禁清单的唯一现行口径来源。

## 范围

- **默认矩阵 29 项（`.munk/code-gates.json`）**：`version: 1`，`gates` 恰 29 项，`cwd` 均为 `"."`，id 顺序固定 `install, lint, typecheck, build, build-web, test, code-pair-actions, test-compare-request, history-store, cancel-gate, memory-gate, structured-semantics, sync-real-gate, diff-normalize, diff-normalize-real, spike-launch-gate, spike-process-tree-gate, template-default-unchecked, template-single-source, template-sha-mtime, template-cancel-zero-write, template-e2e-real, template-case-collision, template-path-contained, template-move-actions, template-move-verify, history-safety, verify-release-gate, test-debt-gate`；命令逐字见 `ac-manifest-commands-intact-twenty-nine`。**不得**含 `perf-gate` / `perf:dir`；9 / 10 / 11 / 16 / 18 / 20 / 21 / 22 / 26 项均为已退役的历史口径，不得回写。本域曾长期停在 22 项陈旧计数，现按实测 29 收口（23–28 的中间口径不另立历史条目，以 manifest 为准）。
- **留在默认矩阵的重门与理由**：`cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate`、九条模板门禁、`verify-release-gate` 与 `test-debt-gate` 均不启动 Electron、不打包；`sync-real-gate` 与 `template-e2e-real` 只写 `mkdtemp` 临时目录并自带清理，`verify-release-gate` 注入 fixture 且不连网、不访问本机 6.4 GiB 夹具，`test-debt-gate` 只读、无网络、零写盘、单次硬预算 ≤20 s（实测约 1.0 s）。**扩容纪律**：新增项只能插在既有纯单测块尾部、两条固定尾项 `verify-release-gate` / `test-debt-gate` 之前，并同一次提交更新 `src/munk-gates.test.ts` 的期望矩阵与长度断言，前序条目逐字逐序不得改动；`history-safety` 是三个测试文件的单 argv 套件（实测 2.4 s / 39 用例），仍属纯单测量级。
- **条件采样 profile（`.munk/code-gates.perf.json`）**：`version: 1`，唯一 gate `perf-gate`（`cwd: "."`、`command: "pnpm perf:gate"` 逐字、单 argv 不含 `&&` / `||` / `|` / `;`、不含 `perf:dir`），`description` 为非空字符串且必须写明三件事：① 该 profile **不进默认 `code_gates`**、Host 不自动执行；② 触发条件——diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时调用，或作为里程碑 `x.y.0` 的独立验收任务一次性跑；③ 采样纪律——同一被测对象同一 commit 只采样一次，重跑须在 digest 写明上一轮作废原因与两轮差异。
- **回归钉板单测（`src/munk-gates.test.ts`）**：纯静态读两个 manifest（`process.cwd()` 相对路径，`node:fs` + `JSON.parse`），不启动 Electron、不写临时目录、不依赖网络；靠既有 vitest include `src/**/*.test.ts` 进入 `pnpm test`，不新增 npm script。断言矩阵形状（29 项 / id 顺序 / 命令逐字 / `cwd` / 不含 `perf-gate`）、四条同步 + 四条模板归位 + 两条安全 + 两条移动行为标记及其文件落点、`history-safety` 的三文件映射与 11 条历史安全标记、perf profile 字段与 `description` 三段口径；模板门禁的尾部断言按 id 定位（`history-safety` 插在模板门禁之后，绝对 `slice(-2)` 尾部切片不再成立）；把 `perf-gate` 改回或追加到默认矩阵即红。
- **测试清债回归门（`test-debt-gate`）**：只读、确定性、无网络、零写盘的纯 Node ESM 脚本 + baseline JSON（`.munk/baseline/test-debt.json`），作为矩阵第 29 项（末位，单 argv `node scripts/test-debt-gate.mjs`、`cwd: "."`）；所有数字只存在 baseline，脚本不保留字面量副本。
- **测试清债判据（`test-debt-gate`，续一）**：① 棘轮——ceilings 只减不增、floors 只增不减，且 baseline 相对 git 已提交版本只许收紧（无提交历史时打印 `first landing` 放行）；② 清债 harness 预算——`harness.files` 逐文件与合计各 ≤400 行，清单为空即放行；③ 零容忍字面量——`src/**`、`scripts/**`、`docs/**` 的 `.ts` / `.tsx` 不得出现 `package.json#version` 运行时派生值（含 `v` 前缀）字面量与白名单外的 64 位小写 sha256 字面量（白名单只放 `sha256("")` / `sha256("abc")` 两向量，历史发布锚点 `0.2.1`–`0.2.15` 不在禁令内）；④ 用例数取 vitest 收集结果，不用 `it(` / `test(` 字面量计数；⑤ docs / yml 只断结构，并对含 docs / yml 路径字面量的测试文件扫整句断言；⑥ 内联 ESLint 规则 `opencompare/no-test-sentinel` 兜底。**被测行为本身仍归 `test-harness` / `test-determinism`**。
- **行为 → 门禁覆盖映射**：默认矩阵 `description` 除「单 argv / 分层」口径外还承载**可复核索引**——行为标记 → 门禁 id → 承载断言的真实测试文件路径，与矩阵形状（29 项）解耦：只改 `description`，不新增矩阵项、不改 `package.json`。共 13 条行为标记（四条单向镜像同步、四条模板归位、两条模板安全、两条模板移动）加 `history-safety` 覆盖映射（清单增删裁剪 / 20 条上限 / 坏路径判定 / 开关序列化往返 / 重开入参解析 / 空态列表 / 重开 / 错误标记与删除 / 清空 / 重启仍为空 / 路径隐私，共 11 条标记 → 三个测试文件）加 `template-e2e-real` 全链路（≥1,000 槽位 / ≥1,000 源 / dry-run → 显式勾选 → apply → 逐条复核 → 重扫 + 只读 / 占用失败路径）与 `verify-release-gate` 发布验收驱动。
- **行为 → 门禁覆盖映射（续）**：标记为稳定可搜索英文短语，门禁 id 以反引号出现，测试文件以仓库根相对路径出现，由钉板单测静态钉住「标记 + 门禁 id + 文件路径出现且文件真实存在」。**被测行为本身仍归各行为域**（镜像同步与模板归位行为归 `domains/directory`），本域只保证「行为在清单里有可点名、可检查的落点」。
- **文档口径同步**：`.munk/baseline/tech/overview.md` 质量门禁一节写「默认 29 项 + 条件 profile」，不再声称默认矩阵含 `perf-gate`，perf 段标题为「条件门禁（不进默认矩阵）」；`docs/perf/large-directory-memory.md` §2 指向 `.munk/code-gates.perf.json` 条件 profile 并列出三条采样纪律。**已知陈旧点**：`tech/overview.md` 现仍写 26 项，本轮 change pack 无 `tech.md`，按 fold 规则未改，下次触及门禁的项应一并同步。
- **JSON 形态约束**：两个 manifest 均 2 空格缩进、无尾逗号、`version: 1`，命令一律单 argv 字符串。

## 验收

- **ac-manifest-sixteen-gates**：16 项口径，已由 `ac-manifest-twenty-two-gates` 取代（历史 id 记录）。
- **ac-manifest-commands-intact-sixteen**：16 项命令口径，已由 `ac-manifest-commands-intact-twenty-two` 取代（历史 id 记录）。
- **ac-manifest-eighteen-gates**：18 项口径，已由 `ac-manifest-twenty-two-gates` 取代（历史 id 记录）。
- **ac-manifest-commands-intact-eighteen**：18 项命令口径，已由 `ac-manifest-commands-intact-twenty-two` 取代（历史 id 记录）。
- **ac-manifest-twenty-gates**：20 项口径，已由 `ac-manifest-twenty-two-gates` 取代（历史 id 记录）。
- **ac-manifest-commands-intact-twenty**：20 项命令口径，已由 `ac-manifest-commands-intact-twenty-two` 取代（历史 id 记录）。
- **ac-manifest-twenty-one-gates**：21 项口径，已由 `ac-manifest-twenty-two-gates` 取代（历史 id 记录）。
- **ac-manifest-commands-intact-twenty-one**：21 项命令口径，已由 `ac-manifest-commands-intact-twenty-two` 取代（历史 id 记录）。
- **ac-manifest-twenty-two-gates**：22 项口径，已由 `ac-manifest-twenty-nine-gates` 取代（历史 id 记录）。
- **ac-manifest-commands-intact-twenty-two**：22 项命令口径，已由 `ac-manifest-commands-intact-twenty-nine` 取代（历史 id 记录）。
- **ac-manifest-twenty-nine-gates**：`.munk/code-gates.json` 可 `JSON.parse`、`version === 1`，`gates` 长度恰为 29，id 顺序为 `install, lint, typecheck, build, build-web, test, code-pair-actions, test-compare-request, history-store, cancel-gate, memory-gate, structured-semantics, sync-real-gate, diff-normalize, diff-normalize-real, spike-launch-gate, spike-process-tree-gate, template-default-unchecked, template-single-source, template-sha-mtime, template-cancel-zero-write, template-e2e-real, template-case-collision, template-path-contained, template-move-actions, template-move-verify, history-safety, verify-release-gate, test-debt-gate`；末位仍为 `test-debt-gate`；不含 `id: "perf-gate"`。
- **ac-manifest-commands-intact-twenty-nine**：29 项 command 逐字不变、`cwd` 均为 `"."`；前 26 项 id / 顺序 / 命令与本次改动前逐字相同（前 13 项：`pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `pnpm test src/core/text/diff.test.ts src/renderer/src/views/CodeView.switches.test.tsx src/renderer/src/workbench/comparisonSwitches.dom.test.tsx src/renderer/src/workbench/directoryCompare.test.ts` / `pnpm test src/shared/compareRequest.test.ts` / `pnpm test src/history-store-gate.test.ts` / `pnpm test:cancel` / `pnpm test:memory` / `pnpm test:structured` / `pnpm test:sync-real`）。
- **ac-manifest-commands-intact-twenty-nine（续）**：第 14–26 项为 `pnpm test src/core/text/normalize.test.ts src/core/text/diff.test.ts src/core/text/merge.test.ts` / `pnpm test src/diff-normalize-real-gate.test.tsx` / `pnpm test src/spike-launch-gate.test.ts` / `pnpm test src/spike-process-tree-gate.test.ts` / 九条 `pnpm test src/template-gate-*.test.ts` 与 `pnpm test src/template-e2e-real-directory.test.ts`；新增第 27 项 `history-safety` 逐字 `pnpm test src/history-safety-gate.test.ts src/renderer/src/workbench/historySafety.dom.test.tsx src/renderer/src/workbench/historyHome.dom.test.tsx`，随后 `verify-release-gate`、`test-debt-gate` 依次为第 28 / 29 项。
- **ac-gate-entry-appended**：改动前 28 项 `{id, command}` 逐字逐序不变；新增项 `id === "history-safety"`、`cwd === "."`、命令为单 argv（不含 `&&` / `||` / `|` / `;`），插在 `template-move-verify` 之后、`verify-release-gate` / `test-debt-gate` 之前。
- **ac-gate-command-scope**：新 gate 命令恰运行 `src/history-safety-gate.test.ts` 与既有 `src/renderer/src/workbench/historySafety.dom.test.tsx`、`src/renderer/src/workbench/historyHome.dom.test.tsx`；三个路径在仓库根真实存在，命令不含 `pnpm test:*` 之外的脚本别名。
- **ac-gate-standalone-green**：单独执行该 gate 命令退出码为 0，输出中三个文件均通过，收集用例数等于改动后实测值且无 `skipped` / `todo`（实测 3 files / 39 tests passed）。
- **ac-gate-pure-dedupe-remove**：新 gate 文件断言同 `kind` + 同有序 `paths` 的第二次写入不新增条目、保持原 `id`、刷新 `createdAt` 与三项开关；删除一条后其余条目逐字段与相对顺序不变；清空得到 `[]`。
- **ac-gate-pure-cap**：混合三类 25 条写入后恰保留 20 条、为 `createdAt` 降序前 20（不按类型分别截断）；`trimComparisonHistory` / `upsertComparisonHistory` 不修改入参数组。
- **ac-gate-pure-preflight**：用注入的假 port 断言坏路径判定 `missing` / `type-changed`（目录↔文件双向）/ `unreadable`（`statPath` 或目录根 `listDirectory` 抛错）三码；三向按 base → ours → theirs 报最靠前失败侧；失败结果只含 `reason` + `side`，不携带路径或原始错误句。
- **ac-gate-pure-roundtrip**：8 组开关组合经 `serializeComparisonHistory` → `parseComparisonHistoryJson` 逐字段还原；损坏文档与版本号非 1 读回 `[]`；清空后读回仍为 `[]`；`resolveComparisonHistoryReopen` 对路径数错误 / 空路径 / 相对路径 / 未知 kind 返回稳定错误码，合法条目回传 kind、有序 paths 与三项开关。
- **ac-description-coverage-map**：manifest `description` 同时包含 `history-safety`（反引号包裹）、三个测试文件路径，以及「清单增删裁剪 / 20 条上限 / 坏路径判定 / 开关序列化往返 / 重开入参解析 / 空态列表 / 重开 / 错误标记与删除 / 清空 / 重启仍为空 / 路径隐私」对应的稳定英文标记。
- **ac-pin-matrix-synced**：`pnpm test src/munk-gates.test.ts` 绿；期望矩阵为 29 项且与 manifest 逐字一致、长度断言与用例名（`twenty-nine`）同步；新增断言覆盖 `history-safety` 的单 argv / `cwd` / 命令逐字 / 三个映射文件存在 / description 标记；模板门禁尾部断言改为按 id 定位；删该 gate、改其命令或删任一标记即红。
- **ac-jsdom-evidence-reused**：专项门内 jsdom 断言覆盖空态历史列表、目录 / 文件 / 三向重开、坏路径标记与单条删除、显式二次确认清空、清空后重新挂载仍为空、console / 历史日志不含真实绝对路径；载体是既有两个 `*.dom.test.tsx` 文件，内容未被改写。
- **ac-test-debt-measured**：`ceilings.repoTestLines` 等于交付树实测行数（48,671）；`growth` 唯一一条 `repoTestLines` 的 `from === 48335`、`to === 48671`、增幅 336 ≤ 400、`addedCases === 13`；`floors.repoTestCases === 1643` 且 ≥ 1630；`appTestLines` / `syncRealGateLines` / `pairLines` 与 `appTestCases` / `syncRealGateCases` 不升高 / 不降低。
- **ac-test-debt-green**：`node scripts/test-debt-gate.mjs` 退出码 0，逐行输出显示各 ceiling「measured ≤ ceiling」与各 floor「measured ≥ floor」（实测 1.11 s）。
- **ac-no-product-surface-change**：交付 diff 不含 `src/shared/**`、`src/main/**`、`src/preload/**`、`src/renderer/src/**`（含既有测试文件）、`package.json`、版本号、`docs/assets/**`、`docs/screenshots.md`；产品行为与历史模型 / 预检实现零改动。
- **ac-full-gates-green**：交付提交上 29 项 gate 全部 passed、`failedGateIds` 为空，含 `test`、`test-debt-gate` 与新增 `history-safety`。
- **ac-test-debt-baseline-json**：`.munk/baseline/test-debt.json` 存在且可 `JSON.parse`，`version === 1`；含 `ceilings`（`appTestLines` / `syncRealGateLines` / `pairLines` / `repoTestLines`）、`floors`（`appTestCases` / `syncRealGateCases` / `repoTestCases`，均正整数且 ≥ 实测收集数）、`harness`（`perFileMaxLines: 400`、`totalMaxLines: 400`、`files` 数组）、`literalWhitelist.sha256`（恰两标准向量）、`measuredAt`（`commit` 40 位 git sha、`date` ISO 日期）；不含当前发布版本字面量。
- **ac-test-debt-baseline-measured**：在 `measuredAt.commit` 对应的树上重新测量，四项 ceiling、三项 floor 与 baseline 完全一致；脚本中不存在这些数字的字面量副本。
- **ac-test-debt-ceiling-ratchet**：当前任一 ceiling 超过 baseline 值即退出码非 0，输出同时包含指标名、实测值与 ceiling；未超限时退出码 0。
- **ac-test-debt-floor-ratchet**：`App.test.tsx` / `sync-real-gate.test.ts` / 全仓用例数分别低于对应 floor 即退出码非 0，输出指标名、实测值与 floor；不低于时退出码 0。
- **ac-test-debt-tighten-only**：在 baseline 已提交的树上，把任一 ceiling 调大或任一 floor 调小后运行门，退出码非 0 并指出「baseline 只许收紧」及指标名；还原后 0。无提交历史时本项放行并输出 `first landing`。
- **ac-test-debt-cases-collected**：用例数取自 vitest 收集结果（`vitest list --json` 或等价只收集不执行接口），不用 `it(` / `test(` 字面量计数；门逐文件打印收集数（`App.test.tsx` 收集数大于其字面量计数）。
- **ac-test-debt-harness-budget**：对 `harness.files` 逐项断言「文件存在且行数 ≤400」并断言合计 ≤400；清单为空时放行；指向 >400 行文件时退出码非 0 并指出文件名与行数。
- **ac-test-debt-version-literal**：版本字面量由 `package.json#version` 运行时派生，扫描 `src/**`、`scripts/**`、`docs/**` 的 `.ts` / `.tsx`；出现 `<version>` 或 `v<version>` 字面量即红并打印文件:行:内容；当前 0 处；历史 `0.2.1`–`0.2.15` 不触发。
- **ac-test-debt-asset-sha-literal**：同一扫描面上出现 64 位小写 hex 字面量且不在 `literalWhitelist.sha256` 内即红并打印文件:行；当前命中全属白名单两值；注入新的伪造 64 位 hex 即红。
- **ac-test-debt-docs-yml-structural**：脚本不读 `docs/**` 与 `*.yml`（若读必须经 `yaml` 解析后按字段 / `steps[].run` 序列断言，不得正则 / 整句匹配）；对含 `docs/` 或 `.yml` 路径字面量的 `.test.ts(x)`，`toContain(...)` / `includes(...)` 直接字符串实参含中文句读（`，` `。` `；` `：` `、`）或 ≥8 个空白分隔英文词即红；当前 0。
- **ac-test-debt-eslint-rule**：`eslint.config.mjs` 以内联 plugin 注册 `opencompare/no-test-sentinel`（不新增依赖），作用域 `**/*.test.{ts,tsx}`；`pnpm lint` 当前树 exit 0；注入 `expect(` 计数为 0 的测试文件（或 `match(/it\(/g)` 式计数哨兵）后 `pnpm lint` 非 0 且报错含该规则 id；删除注入后回 0。
- **ac-test-debt-speed**：`node scripts/test-debt-gate.mjs` 连续 3 次均 ≤20 s（逐次耗时贴交付）；不跑 `vitest run`、不跑覆盖率、不启 Electron、不构建。
- **ac-test-debt-injection-four**：四条注入真实变红、恢复后回绿并贴命令与输出：① 两文件合计加行超 `ceilings.pairLines`；② `.ts` 插入当前版本字面量；③ 删一条用例使低于 floor；④ 调大 ceiling / 调小 floor。注入改动不得留在交付树。
- **ac-test-debt-final-snapshot**：最终 baseline 录自「两文件合计 ≤5,000 行」的 main（Q5 已合），`measuredAt.commit` 等于该 main 提交；ceiling 取实测值，不硬编码 5,000；若收尾时 main 仍为 6,210 行须交付前停手上报。
- **ac-test-debt-product-untouched**：不修改产品运行时代码、`package.json`（version / scripts / 依赖）、`App.test.tsx`、`sync-real-gate.test.ts`、`verify-release-gate.test.ts`、`scripts/verify-release.mjs`、任何 tag / Release / 发布资产；不新增依赖。
- **ac-test-debt-diff-scope**：相对交付基线 `git diff --name-only` 仅含 `scripts/test-debt-gate.mjs`、`.munk/baseline/test-debt.json`、`.munk/code-gates.json`、`src/munk-gates.test.ts`、`eslint.config.mjs`、`.munk/baseline/tech/overview.md`（Delivery fold 允许追加域基线文档）。
- **ac-gate-append-only**：默认矩阵扩容只做加法——前序 `{id, command}` 逐字逐序保留，新条目插在纯单测块尾部、`verify-release-gate` / `test-debt-gate` 两条固定尾项之前；`src/munk-gates.test.ts` 的期望矩阵长度断言与 `gates` 长度同步（当前 29），新条目命令为单 argv（不含 `&&` / `||` / `|` / `;`）且不引入 `perf-gate`。
- **ac-perf-profile-file**：`.munk/code-gates.perf.json` 存在且可 `JSON.parse`，`version === 1`，`gates` 长度恰为 1，唯一项 `id === "perf-gate"`、`cwd === "."`、`command === "pnpm perf:gate"`（逐字相等）。
- **ac-perf-profile-single-argv**：该命令不含 `&&`、`||`、`|`、`;`，且不等于 / 不包含 `perf:dir`。
- **ac-perf-profile-description**：`description` 为非空字符串，同时包含条件 profile 口径（不进默认 `code_gates`）、触发条件（diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径，或里程碑 `x.y.0` 独立验收一次）与「同一 commit 只采样一次 + 重跑须在 digest 写明作废原因与两轮差异」三条采样纪律的关键表述。
- **ac-pin-test-green**：`src/munk-gates.test.ts` 存在并被默认 `pnpm test` 收录、`pnpm test` 全绿；把任一默认矩阵条目改回 / 追加 `perf-gate` 时该测试失败。
- **ac-default-gates-green**：默认矩阵 29 项在交付提交上全部 passed，`code_gates` manifest 记 29 项全过且 `failedGateIds` 为空；该结论不替代条件 profile 的 `perf-gate`（后者按触发纪律单跑）。
- **ac-unit-gates-kept**：`cancel-gate` 的 command 为 `pnpm test:cancel`、`memory-gate` 为 `pnpm test:memory`、`structured-semantics` 为 `pnpm test:structured`、`sync-real-gate` 为 `pnpm test:sync-real`，四者均不被移出默认矩阵。
- **ac-docs-perf-md**：`docs/perf/large-directory-memory.md` §2 不再出现「`.munk/code-gates.json` 的 `perf-gate` 一项就是 `pnpm perf:gate`」的默认矩阵口径，改为指向 `.munk/code-gates.perf.json` 条件 profile，并写明三条采样纪律（条件触发 / 里程碑一次 / 同 commit 只采一次且重跑需在 digest 说明）。
- **ac-docs-tech-overview**：`.munk/baseline/tech/overview.md` 门禁清单一节写为默认 29 项 + 条件 profile（26 / 22 / 21 / 20 / 18 / 16 / 11 / 10 / 9 项为历史口径，不得回写），且不再声称默认矩阵含 `perf-gate`；当前该文件仍为 26 项陈旧值，属已知未收口点。
- **ac-diff-scope**：`git diff --name-only`（相对改动前 HEAD）仅含 `.munk/code-gates.json`、`.munk/code-gates.perf.json`、`src/munk-gates.test.ts`、`docs/perf/large-directory-memory.md`、`.munk/baseline/tech/overview.md`。
- **ac-no-perf-run**：本项执行过程中未运行 `pnpm perf:gate` / `pnpm perf:dir` / `electron-vite build` / 打包，也无真机采样证据文件产出。
- **ac-manifest-coverage-map**：`.munk/code-gates.json` 仍可 `JSON.parse`、`version === 1`、`gates` 恰 29 项（id / 顺序 / command / `cwd` 逐字不变、末位为 `test-debt-gate`、无 `perf-gate`）；`description` 同时含四条同步标记（`mirror delete opt-in` / `idempotent dry-run` / `mtime and relative structure preserved` / `link mtime alignment`）、四条模板归位标记（`conflict and overwrite default-unchecked` / `counts and apply read one resolved plan` / `source sha256 and mtimeSec preserved` / `cancel writes nothing`）。
- **ac-manifest-coverage-map（续）**：`description` 另含两条安全标记（`case-only collision and exact-name priority` / `relative path containment and path-escape refusal`）、两条移动标记（`per-row action column and explicit move` / `real-disk move write verify delete keeps the source`）、九个模板门禁 id（`template-default-unchecked` / `template-single-source` / `template-sha-mtime` / `template-cancel-zero-write` / `template-e2e-real` / `template-case-collision` / `template-path-contained` / `template-move-actions` / `template-move-verify`）与对应测试文件路径（`src/template-gate-*.test.ts` / `src/template-e2e-real-directory.test.ts`），以及 `verify-release-gate` → `src/verify-release-gate.test.ts`（15 项 A 层注册表 / CI 零 heap 采样 / B 层 16 MiB 保留堆 / 只读 workflow）；文案保持英文。
- **ac-manifest-pin-test**：`src/munk-gates.test.ts` 的默认矩阵 describe 保留**静态**用例（读 manifest + `node:fs` `existsSync`，不写临时目录、不启 Electron、不联网）：四条同步标记 / 门禁 id / 测试文件路径断言不变；新增「九条模板门禁位于 `verify-release-gate` 之前、`cwd === "."`、命令逐字等于 `pnpm test <file>`、映射文件真实存在、单 argv 无连接符」与「九条模板门禁源码不含样本标记（`@shared/fixtures` / `DIRECTORY_SAMPLE_PATHS` / 样本挂载字面路径）」两组断言，以及「`verify-release-gate` 独占末位、命令逐字、映射文件存在」断言；矩阵形状与单 argv / 无 `perf:dir` 断言不变。删任一标记、搬走或删除任一模板门禁文件、或在门禁里引用样本夹具即红。
- **ac-coverage-map-diff-scope**：本类改动 `git diff --name-only` 仅含 `.munk/code-gates.json`、`src/munk-gates.test.ts` 与该行为域自己的测试文件（镜像同步为 `src/sync-real-gate.test.ts`、`src/renderer/src/views/directorySyncDialog.test.tsx`）及对应 WI 的 change pack 记录；`package.json`、矩阵项、条件 profile 零改动。

## 非目标

- 不跑 `pnpm perf:gate` / `pnpm perf:dir`，不打包、不做真机采样（本类改动不触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径，不满足条件触发），也无采样证据产出。
- 不改 `perf/profiles.json` 阈值，不改 `scripts/perf-gate.mjs` / `scripts/perf-dir.mjs`。
- 不改业务运行时源码（`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**`）。
- 不改 `package.json`（含 `version`、scripts）、`CHANGELOG.md`、`README.md` 版本表、`.github/workflows/**`、`electron-builder.yml` 或任何发布文件。
- 不新增除 `perf-gate` 外的条件 profile 项；默认矩阵现行 29 项 id / 顺序 / 命令不得改动，新增门禁只能插在纯单测块尾部并同一次提交同步钉板。
- 不改 `.munk/baseline/domains/**` 的历代域记录（`foundation` / `release` / `perf-memory` 等历史交付记录），如需回改另开工作项。
- 不动 Host 侧行为：不假设 Host 会自动执行 `.munk/code-gates.perf.json`；条件 profile 是给人 / agent 读的清单，不是自动门禁。

## 实现约束

- 新增测试用 `node:fs` 读仓库根下两个 manifest（`process.cwd()` 相对路径），纯静态断言，不启动 Electron、不写临时目录、不依赖网络。
- 测试文件命名为 `src/munk-gates.test.ts`，靠现有 vitest include 规则进入 `pnpm test`；不新增 npm script。
- 两个 JSON 保持 2 空格缩进、无尾逗号；`cwd` 用 `"."`，命令均为单 argv 字符串。
- **门禁分层的判据是「单次运行时长与机器占用」而非「重要性」**：纯单测与构建留默认矩阵；启动 Electron、真机长跑或需独占机器的采样只进条件 profile。往默认矩阵加任何长跑项都必须先问「它会不会在每个工作项上各付一次完整构建」。九条模板门禁实测均为秒级（约 0.01–1.9 s，`template-e2e-real` 最重），仍属纯单测量级，故留在默认矩阵；若把规模放大到分钟级，应先考虑并入 `template-e2e-real` 单文件而不是再加矩阵项。
- **测试清债门同为纯单测量级**（只读 + `vitest list --json` 只收集不执行，实测约 1.0 s），故留在默认矩阵；禁止扩成 `vitest run` / 覆盖率冷跑 / Electron 启停。棘轮数字只能来自实测并写进 baseline，脚本不得写字面量副本、不得手写 5,000 让门当场红。
- 条件 profile 与默认矩阵是两个文件、两个版本号，互不 import；profile 不提供默认矩阵的兜底内容，避免「读错文件也可能绿」。
- 文档与口径同步：改矩阵形状必须同一次提交里改 `src/munk-gates.test.ts`、`docs/perf/large-directory-memory.md` 与 `.munk/baseline/tech/overview.md`，否则下一代 agent 会按旧口径在默认矩阵里找 `perf-gate`。
- 门禁 id 与测试文件是四跳链（`description` 标记 → 门禁 id → 测试文件路径 → 用例名），改任一端都要同时改另外三端，断点最先出现在 `src/munk-gates.test.ts`。
- `.munk/baseline/**` 的 fold 由 Delivery 承担：本域只记录现行门禁口径与 AC 定义，历史域记录（`foundation` 的 `ac-gates`、`perf-memory` 的 `ac-gate-wired`）按当初事实保留，由本域声明取代关系。

## 最近交付证明

- WI：`wi_ws_20532e129de4be0c`（默认矩阵 28 → 29：在模板门禁之后、`verify-release-gate` 之前插入专项门 `history-safety`，新增 `src/history-safety-gate.test.ts` 并复用两个既有 jsdom 套件；钉板同步 29 项与按 id 定位的尾部断言；test-debt 走 `growth` 收紧）
- 日期：2026-11-04
- 结果：`code_gates` 29/29 passed、`ok: true`、`failedGateIds: []`；`history-safety` 单跑 3 files / 39 tests passed（2.43 s，无 skipped / todo）；`test-debt-gate` 1.11 s 全绿。
- 覆盖摘要：`gates` 第 27 项为 `history-safety`（单 argv 三文件，`cwd: "."`），前 26 项逐字未动，`verify-release-gate` / `test-debt-gate` 仍为第 28 / 29 项；manifest `description` 增历史安全覆盖映射（11 条稳定英文标记 + 三个文件路径），钉板 `EXPECTED_GATES` 与 `HISTORY_GATE` 同步。
- 覆盖摘要（续）：`.munk/baseline/test-debt.json` 实测收口——`repoTestLines` 48,335 → 48,671（`growth` 单条 +336 ≤ 400、`addedCases` 13）、`floors.repoTestCases` 1,630 → 1,643；`appTestLines` 2,959 / `syncRealGateLines` 1,991 / `pairLines` 4,950 与 94 / 32 两项 floor 未放松。
- 注：产品面零改动（`src/shared/**` / `src/main/**` / `src/preload/**` / `src/renderer/src/**` 与 `package.json` 均未触），jsdom 证据全部复用既有 `historySafety.dom.test.tsx` / `historyHome.dom.test.tsx`；`tech/overview.md` 仍写 26 项，是本轮未收口的陈旧点。
