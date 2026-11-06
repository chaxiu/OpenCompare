# 覆盖率预检「一次测量、多次复用」+ 插桩下 spawn 失败可归因

## Scope

修复 2026-11-07 按需发版预检暴露的两类缺陷，使 v0.2.24 在新树上重跑三件预检不再因非确定性失败被卡，且同类失败下次可归因：

1. **预检测量复用**：`scripts/coverage-gate-preflight.mjs` 改为每次 workflow 运行只做一次插桩全量 vitest 测量并落 `coverage-summary.json`；positive / negative floor / negative stale 三个步骤仍分步调用同一脚本以保留归因粒度，后两步只复用同次 summary 与门基线比较，不再各跑一遍全套。
2. **新鲜度键**：复用必须带新鲜度键（当前 HEAD sha + 被测文件集合指纹，集合按 baseline `scope.include/exclude` 计算）；键不符或 summary 缺失/损坏时重测并打印 `cache miss: <reason>`，不得静默复用陈旧 summary。复用命中打印 `cache hit: <path> key=<key>` 与测量耗时对比。
3. **接口兼容**：不改 `.github/workflows/**`，脚本路径与 `node scripts/coverage-gate-preflight.mjs [--negative floor|stale]` 调用方式保持不变；rehearsal tag 的创建/删除、baseline 只读、`--negative` 语义全部保留。
4. **runBodyGate 可归因**：`src/main/release-packaging.test.ts` 的 body gate spawn 失败必须带出 `status`、`error.code`、`error.message`、`signal` 与 stderr/stdout 片段，能区分断言失败与 spawnSync 环境失败；仅对可识别环境类错误做有限重试（总尝试 ≤3 次，可用 env 关闭），断言失败不重试、不吞错；显式设置 `maxBuffer`。
5. **插桩超时**：该测试文件在覆盖率插桩下显式声明 per-test 或 per-file 超时（建议加在 `published release body gate` 这个 describe 上），不得改全局 `testTimeout`，不得缩规模、删用例或弱化既有断言；只做最小行级修改，不整文件重写。
6. **纪律入库**：把本次约定以替换/合并方式并入 `AGENTS.md` 既有条目（`## 技术栈` 的「质量门禁」行），不新增段落，改后文件总行数 ≤ 原 51 + 2 = 53 行。

## Acceptance Criteria

- ac-single-measure: 冷缓存下执行 `node scripts/coverage-gate-preflight.mjs` 只启动一次插桩全量 vitest，并在仓库外写出 summary 与键元数据；随后 `--negative floor`、`--negative stale` 两次执行不再启动 vitest（日志出现 `cache hit`），且三次调用退出码均为 0。
- ac-cache-key-head: 缓存键包含当前 HEAD sha；HEAD 变化后下一次调用打印 `cache miss` 并重新测量，旧 summary 不被复用。
- ac-cache-key-files: 缓存键包含按 baseline `scope.include/exclude` 计算出的被测文件集合指纹；改动/新增/删除 `src/core/**` 源文件后下一次调用打印 `cache miss` 并重新测量。
- ac-cache-invalid: summary 文件缺失、非 JSON 或缺 `total` 时按 `cache miss` 重测，不得静默复用，也不得把损坏文件当命中。
- ac-reuse-freshness: 复用命中时传给门脚本的 `--started-at` 取该次测量的记录时间，门的新鲜度检查（summary 在仓库外且 mtime ≥ started-at）在三次调用中均通过，不因复用触发 `fresh artifact` 失败。
- ac-negative-floor: 复用同次 summary 时，将任一 floor 数字调低（lines / branches / functions 任一减 1）仍必须失败，且输出包含 `needs a matching floorLedger entry`；真实 `.munk/baseline/coverage.json` 字节不变。
- ac-negative-stale: 复用同次 summary 时，把 `measuredAt.commit` 改为早于上一 semver tag 或不可达的 sha 仍必须失败，输出包含 `older than the previous semver tag` 或 `not reachable from HEAD`。
- ac-negative-repeatable: 连续 3 次完整执行 positive + `--negative floor` + `--negative stale`，三次结论一致（全 PASS 或全 FAIL），不得出现同 commit 下结论漂移。
- ac-baseline-untouched: 预检结束后 `.munk/baseline/coverage.json` 与执行前逐字节相等（复用缓存路径同样成立）；preflight 清理 rehearsal tag，无残留 `v9.9.9-rehearsal*`。
- ac-body-gate-status-error: `runBodyGate` 的 spawn 结果携带并输出 `status`、`error.code`、`error.message`、`signal`；断言失败消息包含这些字段，能区分「断言不满足」「退出码非零但无 spawn error」「spawnSync 环境失败（error 存在或 status 为 null 且无 signal）」。
- ac-body-gate-retry: 仅对可识别环境类错误（EAGAIN / EMFILE / ENFILE / ENOMEM 等 allowlist，或 status null 且无 signal）重试，总尝试次数 ≤3；断言失败与普通非零退出不重试；环境变量（如 `OPENCOMPARE_GATE_SPAWN_RETRIES=0`）可关闭重试；重试耗尽后抛错失败，绝不让 env 失败满足 `nonzero` 负向期望。
- ac-body-gate-maxbuffer: body gate 的 `spawnSync` 显式设置 `maxBuffer`（≥8 MiB），不依赖默认值。
- ac-body-gate-timeout: `src/main/release-packaging.test.ts` 在覆盖率插桩下显式声明 per-suite 或 per-test 超时；`vitest.config.mts` 的全局 `testTimeout` 不变；该文件用例数量与断言不减少、不弱化。
- ac-agents-merged: `AGENTS.md` 只在既有「质量门禁」条目内替换/合并写入「覆盖率预检一次测量多次复用；负向用例复用同次 summary；插桩下环境类失败带 status/error 可归因并仅对环境类错误有限重试，不靠重跑硬扛」语义，不新增段落，`wc -l AGENTS.md` ≤ 53。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test` 自绿；若为复用逻辑新增测试文件/门禁，必须先按 Q6 口径把脚本与 baseline JSON 门禁条目写进 `.munk/code-gates.json` 再动测试文件，且不新增 exclude、不动既有门禁条目。
- ac-local-cold-run: 本地冷跑 `pnpm exec vitest run src/main/release-packaging.test.ts` 全绿（记录用例数与耗时），并对该文件做一次覆盖率插桩运行验证超时声明有效。
- ac-evidence: delivery-result 附四组真实输出：(a) 一次测量被三次复用（日志 `cache hit` 与墙钟对比），(b) 三条反向自测（floor 调低 fail / 正常树 pass / stale fail）实际输出，(c) 连续 3 次预检结论一致的记录，(d) 本地对该测试文件冷跑全绿输出。

## Non-Goals

- 不改产品运行时、renderer/UI 行为、IPC 或任何用户可见功能。
- 不动版本号、CHANGELOG、发布说明、已公开 tag 与资产，不改 release 流程口径（`release.yml` 与 preflight workflow 均不改）。
- 不修改覆盖率门阈值与策略：现有 `floors.totals`（当前 lines 97 / branches 90 / functions 99）、`moduleBranchesMin` 75、`floorLedger`（98→97）、`include/exclude` 字面量与 baseline `totals/modules` 一律不动；不新增 exclude；不降低任何断言的严格度。
- 不新增 npm 依赖，不借机做无关测试清债或重构。
- 不把预检门塞进 `.munk/code-gates.json` 的既有命令矩阵（本项只处理预检可用性与归因）。

## Implementation Constraints

- 主要落点：
  - `scripts/coverage-gate-preflight.mjs`（204 行）：新增缓存键/指纹/命中判定与日志；保留 `parseNegative`、rehearsal tag、baseline 只读校验、`--summary/--started-at/--include/--exclude` 参数拼接。缓存目录放在仓库外（如 `os.tmpdir()/coverage-gate-preflight-cache/`），summary 与键元数据原子写入（临时文件 + rename）。
  - 建议把键计算、指纹、命中/失效判定抽成可单测的纯函数（可放同目录新模块 `scripts/coverage-gate-preflight-cache.mjs`）；若新增测试文件，先按 Q6 把门禁条目写进 `.munk/code-gates.json`。
  - `src/main/release-packaging.test.ts`：约 L97 `runInTemp` 与 L506-L551 `published release body gate`。最小行级修改：结果多带 `error/signal`，只在该 suite 的 spawn 路径上加 allowlist 重试与显式 `maxBuffer`；超时优先用 `describe('published release body gate', { timeout: ... }, ...)` 或等价 per-test 第三参数，避免全文件重写。
  - `AGENTS.md`：仅替换第 13 行「质量门禁」条目（`## 技术栈` 内），行数上限 53。
- 事实校正：用户口径「lines 98」对应 baseline `decision.reason` 的实测值 98.24；当前生效地板是 `floors.totals.lines = 97`（`floorLedger` 98→97）。本项不得改动任何一个数字，以仓库内 `.munk/baseline/coverage.json` 现状为唯一事实。
- 环境类错误 allowlist 需保守：EAGAIN / EMFILE / ENFILE / ENOMEM（可按 POSIX 常识补 EINTR），其它错误（含断言、脚本逻辑失败、超时被 signal 杀死）不重试。
- 反向自测必须仍由真实脚本 + 真实 baseline 派生临时 baseline 完成，不得伪造 summary 或直接调用内部函数冒充端到端证据。
- 证据命令建议：`node scripts/coverage-gate-preflight.mjs`、`... --negative floor`、`... --negative stale`；墙钟可用 `time` 或脚本内测量耗时日志。
