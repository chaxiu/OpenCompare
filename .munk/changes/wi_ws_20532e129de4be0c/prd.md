# 历史安全回归门与 baseline 收口

## Scope

为已闭环的对比历史（模型 / 预检 / 空态列表 / 重开 / 错误标记 / 清空）补一条**单 argv 专项门** `history-safety`，让「历史安全」这件事从「散落在 4 个测试文件里、只有跑全量 `pnpm test` 才看得见」变成「一条命令就能独立复核」。本项只做门禁接线与基线收口，不改任何产品行为：

1. **新增专项门测试文件** `src/history-safety-gate.test.ts`（Node 环境，零真实 IO）：
   - 纯函数层矩阵：清单去重写入 / 单条删除 / 清空、20 条上限与最近优先裁剪、坏路径判定（`missing` / `unreadable` / `type-changed` + 最靠前失败侧）、8 组开关序列化往返、重开入参解析错误码、清空信封读回仍为空。
   - 通过被测模块的公开导出断言，不复制实现、不新增第二份解析或上限常量。
2. **在 `.munk/code-gates.json` 末尾区追加一条 gate**（id `history-safety`，单 argv：新 gate 文件 + 两个既有 jsdom 套件），并把六条纯行为与六条 jsdom 行为的英文稳定标记 → gate id → 测试文件路径写进 `description` 的可复核索引。
3. **同步回归钉板** `src/munk-gates.test.ts` 的期望矩阵（28 → 29 项）与相关形状断言。
4. **按实测收口基线** `.munk/baseline/test-debt.json`：`repoTestLines` ceiling 走 `growth` 声明（锚点为上一提交的 48335，增幅 ≤ 400 行），`repoTestCases` floor 抬到实测收集数，其余 ceiling / floor 不放松；所有数字均以 `node scripts/test-debt-gate.mjs` 与 `vitest list --json` 的实测输出为准，不手抄。

jsdom 断言全部**复用**既有两个已交付套件，不新增第二套 DOM 测试、不改写既有文件：
`historySafety.dom.test.tsx`（坏路径拦截与无残留、错误行标记 / 删除 / 清错、二次确认清空与重挂载仍为空、三类混排 20 条上限、路径隐私）与 `historyHome.dom.test.tsx`（空态列表渲染、目录 / 文件 / 三向重开、写回与去重）。

## Acceptance Criteria

- ac-gate-entry-appended: `.munk/code-gates.json` 可 `JSON.parse`、`version === 1`；`gates` 长度恰 29；改动前 28 项 `{id, command}` 逐字逐序不变；新增项 `id === "history-safety"`、`cwd === "."`、命令为单 argv（不含 `&&` / `||` / `|` / `;`）；末位仍为 `test-debt-gate`。
- ac-gate-command-scope: 新 gate 命令恰运行 `src/history-safety-gate.test.ts` 与既有 `src/renderer/src/workbench/historySafety.dom.test.tsx`、`src/renderer/src/workbench/historyHome.dom.test.tsx`；三个路径在仓库根真实存在，命令不含 `pnpm test:*` 之外的脚本别名。
- ac-gate-standalone-green: 单独执行该 gate 命令退出码为 0，输出中三个文件均通过，收集用例数等于改动后实测值且无 `skipped` / `todo`。
- ac-gate-pure-dedupe-remove: 新 gate 文件断言：同 `kind` + 同有序 `paths` 的第二次写入不新增条目、保持原 `id`、刷新 `createdAt` 与三项开关；删除一条后其余条目逐字段与相对顺序不变；清空得到 `[]`。
- ac-gate-pure-cap: 混合三类 25 条写入后恰保留 20 条、为 `createdAt` 降序前 20（不按类型分别截断）；`trimComparisonHistory` / `upsertComparisonHistory` 不修改入参数组。
- ac-gate-pure-preflight: 用注入的假 port 断言坏路径判定：`missing`、`type-changed`（目录↔文件双向）、`unreadable`（`statPath` 或目录根 `listDirectory` 抛错）三码；三向按 base → ours → theirs 报最靠前失败侧；失败结果只含 `reason` + `side`，不携带任何路径或原始错误句。
- ac-gate-pure-roundtrip: 8 组开关组合经 `serializeComparisonHistory` → `parseComparisonHistoryJson` 逐字段还原；损坏文档与版本号非 1 读回 `[]`；清空后 `parseComparisonHistoryJson(serializeComparisonHistory([]))` 仍为 `[]`（重启读空）；`resolveComparisonHistoryReopen` 对路径数错误 / 空路径 / 相对路径 / 未知 kind 返回稳定错误码，合法条目回传 kind、有序 paths 与三项开关。
- ac-description-coverage-map: manifest `description` 同时包含 `history-safety`（反引号包裹）、三个测试文件路径，以及「清单增删裁剪 / 20 条上限 / 坏路径判定 / 开关序列化往返 / 重开入参解析 / 空态列表 / 重开 / 错误标记与删除 / 清空 / 重启仍为空 / 路径隐私」对应的稳定英文标记（与 jsdom 套件里既有断言语义一致）。
- ac-pin-matrix-synced: `pnpm test src/munk-gates.test.ts` 绿；该文件期望矩阵为 29 项且与 manifest 逐字一致、长度断言同步；新增断言覆盖 `history-safety` 的单 argv、`cwd`、命令逐字、映射文件存在与 description 标记；删除该 gate、改其命令或在描述中删任一标记即红；既有四条同步 / 九条模板门禁的形状断言仍绿。
- ac-jsdom-evidence-reused: 专项门内 jsdom 断言覆盖空态历史列表、目录 / 文件 / 三向重开、坏路径标记与单条删除、显式二次确认清空、清空后重新挂载仍为空、console / 历史日志不含真实绝对路径；这些断言的载体是既有两个 `*.dom.test.tsx` 文件，内容未被改写。
- ac-test-debt-measured: `.munk/baseline/test-debt.json` 的 `ceilings.repoTestLines` 等于交付树上 `node scripts/test-debt-gate.mjs` 打印的实测行数；对应 `growth` 条目 `from === 48335`（上一提交 ceiling）、`to ===` 新 ceiling、增幅 `≤ 400` 行、`addedCases ===` 新增收集用例数；`floors.repoTestCases` 等于实测收集数且 `≥ 1630`；`appTestLines` / `syncRealGateLines` / `pairLines` 与 `appTestCases` / `syncRealGateCases` 不升高 / 不降低。
- ac-test-debt-green: `node scripts/test-debt-gate.mjs` 退出码 0，且逐行输出显示各 ceiling「measured ≤ ceiling」与各 floor「measured ≥ floor」。
- ac-no-product-surface-change: 交付 diff 不含 `src/shared/**`、`src/main/**`、`src/preload/**`、`src/renderer/src/**`（含既有测试文件）、`package.json`、版本号、`docs/assets/**`、`docs/screenshots.md`；产品行为、历史模型 / 预检实现零改动。
- ac-full-gates-green: 交付提交上 29 项 gate 全部 passed、`failedGateIds` 为空，含 `test`、`test-debt-gate` 与新增 `history-safety`。

## Non-Goals

- 不改历史模型、preflight、`PlatformPort`、主进程 / preload / web 存储实现，不新增依赖，不新增第二套解析 / 排序 / 上限常量。
- 不重写、不搬移、不新增既有历史测试文件里的断言；不以「补一条 DOM 用例」为由改 `src/renderer/**`（会触发 README 截图 provenance 硬门，须重跑 `pnpm build` + 重钉截图，本项不做）。
- 不放宽任何门禁：不删用例、不加 `skip` / `todo`、不抬高覆盖率地板、不把门禁改成多命令拼接。
- 不改 `.munk/baseline/domains/**`、`.munk/baseline/tech/**`、`docs/**` 叙事（`domains/quality-gates/product.md` 里的「22 项」计数在改动前已陈旧，不属本项收口范围）。
- 不动 `.munk/baseline/coverage.json`（本项不触 `src/core/**`，覆盖率地板保持原值）。
- 不做浏览器 / 设备 / 桌面 GUI 验证，不发版、不 push tag、不改发布面文件。

## Implementation Constraints

- 新 gate 文件放仓库根 `src/`：`src/history-safety-gate.test.ts`（沿用 `src/history-store-gate.test.ts` 的既有形态，Node 默认环境，被 `vitest.config.mts` 的 `src/**/*.test.ts` include 收录，同时进入 `pnpm test`）。
- 只 import 公开导出：`@shared/history/model`（`createComparisonHistoryEntry` / `upsertComparisonHistory` / `removeComparisonHistoryEntry` / `clearComparisonHistory` / `trimComparisonHistory` / `sortComparisonHistory` / `serializeComparisonHistory` / `parseComparisonHistoryJson` / `resolveComparisonHistoryReopen` / `markComparisonHistoryError`）、`@shared/history/preflight`（`preflightComparisonHistory` + 注入式 `HistoryPreflightPort`）、`@shared/history/types`（`COMPARISON_HISTORY_LIMIT`）。preflight 断言用假 port（返回 / 抛错），零 `mkdtemp`、零真实文件系统。
- 门禁命令（单 argv，逐字）：
  `pnpm test src/history-safety-gate.test.ts src/renderer/src/workbench/historySafety.dom.test.tsx src/renderer/src/workbench/historyHome.dom.test.tsx`
- manifest 插入位置：`template-move-verify` 之后、`verify-release-gate` / `test-debt-gate` 之前；`test-debt-gate` 保持末位。`src/munk-gates.test.ts` 需同步：`EXPECTED_GATES` 增一项、长度 28 → 29、用例名 `twenty-eight` → `twenty-nine`，并把模板门禁的尾部 `slice(-(TEMPLATE_GATES.length + 2), -2)` 断言改为按 id 定位（新 gate 插在模板门禁之后，绝对尾部切片不再成立），新增 `history-safety` 的 shape / 文件存在 / description 标记断言。
- 新 gate 文件行数 ≤ 380 行（test-debt `GROWTH_MAX_LINES = 400`，growth 只能声明一条 `repoTestLines`，且必须替换已过期的旧条目 `47937 → 48335`）。
- 实测顺序：`pnpm install` → 改完代码 → `node scripts/test-debt-gate.mjs` 取 ceilings / floors 实测值 → 回写 baseline → 再跑一次确认 0；用例数一律取 vitest 收集结果，不用 `it(` 字面量计数。
- 交付证据（写进交付摘要）：gate 命令输出（三文件通过 + 用例数）、`pnpm test src/munk-gates.test.ts` 输出、`node scripts/test-debt-gate.mjs` 的逐行 ceiling / floor 实测摘录、`git diff --name-only` 白名单核对。
