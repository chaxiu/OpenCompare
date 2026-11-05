# 刷新 src/core 覆盖率采样基线（v0.2.21 之后的新鲜采样点）

## 范围

**现状（已复核）**：`.munk/baseline/coverage.json` 的 `measuredAt.commit = 0809e5b…`（2026-11-04T23:10:52Z）被上一个已发布 tag `v0.2.21`（`32e9369`）包含，`previousReleaseTag()` 判其为 stale；`release.yml` 的 `Coverage gate (src/core floors)` step 与 `scripts/coverage-gate.mjs` 使用同一条 freshness 规则，因此预检回退分支是真门红，不放宽、不绕。

**要做**：在当前 main tip `952c98c`（`v0.2.21` 的后代）上用与现有基线同一口径做**一次** v8 覆盖率采样，把新鲜 `json-summary` 落到本次 run 的 evidence 目录，并按现有门口径更新 `.munk/baseline/coverage.json`：`measuredAt.commit`（新的、不被 `previousReleaseTag()` 包含的采样点）、`measuredAt.date`、`provider`、`command`、`scope`、`ignoreDirectives`、`totals`、`modules`、`decision.reason`。`floors` 与 `floorLedger` 维持现值、不下调。

**已确认的关键事实**（影响 module set，非本 WI 引入）：

- `src/core/**` 自 `0809e5b` 起新增 6 个非测试模块 `src/core/syntax/{cache,index,language,overlay,tokenize,view}.ts`，当前非测试 `src/core/**/*.ts` 恰 **29** 个；门的 `checkModuleSet` 要求 baseline `modules` 键集合与新 summary 完全相等，因此 `modules` 必须由 23 条同步为 29 条，否则无论 freshness 如何都会红。这是「记录模块集合」同步，不是扩大采样范围（include/exclude 字面量不变）。
- 采样范围（`include` / 三个 `exclude`）与 `provider=v8` 是门与基线共用的字面量，本次一个字符都不改。

交付方式：经正常 Delivery 本地合入 main，新 main tip 即 `v0.2.23` 发布点；本 WI 不推 tag、不 dispatch workflow。

## 验收

- ac-stale-diagnosis-recorded: 交付回执写明旧采样点 `0809e5b583b6d30d0fc93ab72e10da8fdb7479d0` 被 `v0.2.21`（`32e9369…`）包含，以及交付 HEAD 上 `previousReleaseTag()` 解析为 `v0.2.21`；同时写明「不改门逻辑、不放宽」，红是真门红。
- ac-sampling-command-identical: 采样命令为 `pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.include='src/core/**' --coverage.exclude='**/*.test.ts' --coverage.exclude='**/*.test.tsx' --coverage.exclude='**/__fixtures__/**' --coverage.reporter=text --coverage.reporter=lcov --coverage.reporter=json-summary --coverage.reportsDirectory=.munk/changes/wi_intake_d61666f82d1133d6/evidence/coverage-sampling`；除 `reportsDirectory` 指向本次 run 的 evidence 目录外，provider / include / 三个 exclude / reporter 与基线 `command` 完全一致，未新增 exclude。
- ac-single-authoritative-measurement: baseline 的 `totals` / `modules` / `decision.reason` 数字只来自**一次**权威采样（`evidence/coverage-sampling/coverage-summary.json`）；回执记录该文件 sha256 与采样前 `started_at`；不存在「跑到绿为止」的反复换数。只有在 ac-gap-closed-if-any 触发补测试时，才允许补测后**一次**重测，且首次 summary 以 `coverage-summary.pre-fix.json` 保留。
- ac-measuredat-fresh: `measuredAt.commit` 为 40 位小写 hex，等于采样开始时 `git rev-parse HEAD`（`952c98c…`），从交付 HEAD 可达且不被 `previousReleaseTag()` 包含；`measuredAt.date` 为采样实际 UTC 时间的合法 ISO 时间戳（不得手填未来时间）；`evaluateBaselineFreshness` 返回 `problems` 为空且输出 `baseline freshness: … is at or after v0.2.21`。
- ac-module-set-exact: baseline `modules` 键集合与新 summary 的模块集合完全相等（29 个，含 6 个 `src/core/syntax/*.ts`），无 missing / extra；门输出包含 `module set: 29 modules match baseline`。
- ac-totals-measured: `totals` 的 lines / branches / functions / statements 四项 `pct` / `covered` / `total` 与权威 summary 逐字一致；`decision.reason` 中的实测数字同步为新值，不保留旧数字。
- ac-floors-not-lowered: `floors.totals` 仍为 `{lines: 97, branches: 90, functions: 99}`、`floors.moduleBranchesMin` 仍为 `75`、`floors.moduleBranchesMinExempt` 仍为 `["src/core/directory/hash.ts","src/core/text/lines.ts"]`、`floors.ignoreDirectivesMax` 仍为 `0`；`floorLedger` 不新增任何条目；实测 `totals` 各项均 `>=` 对应地板。
- ac-ignore-zero: `ignoreDirectives.v8 = 0`、`ignoreDirectives.c8 = 0`；`git diff` 中 `src/core/**` 无新增 `v8 ignore` / `c8 ignore` 指令（无缺口补测时 `src/**` 零 diff）；门输出包含 `ignore directives: v8 0 <= 0, c8 0 <= 0`。
- ac-gate-positive: 把 evidence 中的 summary 复制到仓库外临时目录（sha256 与 evidence 副本一致）后执行 `node scripts/coverage-gate.mjs --summary <tmp>/coverage-summary.json --started-at <sampling-epoch> --include 'src/core/**' --exclude '**/*.test.ts' --exclude '**/*.test.tsx' --exclude '**/__fixtures__/**'`，退出 0，输出含四项 `totals … >= …`、`module set: 29 modules match baseline`、`baseline freshness: … is at or after v0.2.21`、`coverage gate passed in …s`。
- ac-gate-negative: 用临时 baseline 副本把 `floors.totals.lines` 调低 1（不加 `floorLedger`）重跑同一门，退出 1 且输出含 `needs a matching floorLedger entry`；运行后仓内 `.munk/baseline/coverage.json` 字节与运行前一致（sha256 不变）。
- ac-head-tag-excluded: 在 HEAD 上创建临时 semver tag（如 `v9.9.9-rehearsal`）后，用 `scripts/coverage-gate-preflight.mjs` 的同一 freshness 逻辑验证：`previousReleaseTag()` 返回 `{tag: "v0.2.21", …}`（HEAD 自身 tag 被跳过），`evaluateBaselineFreshness` 判 fresh；验证后临时 tag 已删除，`git tag --list 'v9.9.9-rehearsal*'` 为空。
- ac-preflight-overall: `node scripts/coverage-gate-preflight.mjs` 退出 0，输出含 `PREFLIGHT positive: PASS`、`PREFLIGHT negative floor: PASS`、`PREFLIGHT negative stale: PASS`、`PREFLIGHT baseline untouched: PASS`、`PREFLIGHT rehearsal tag removed: PASS`、`PREFLIGHT overall: PASS`。
- ac-gap-closed-if-any: 若任一实测值低于现有 floor（totals 三项或任一非豁免模块 branches < 75），**不得改地板**，而是在同一 WI 内做最小用例增补把缺口修掉并给出数值前后对比；补测后重测一次使全部地板转绿。若最小增补无法闭合，调用 `munk_report_owner` 说明缺口数值与被挡原因，绝不以降地板或缩范围过关。
- ac-test-debt-respected: 仅当 ac-gap-closed-if-any 触发新增 `src/**` 测试时，才允许按现有约定在 `.munk/baseline/test-debt.json` 追加一条 `growth`（`from`/`to`/`reason`/`addedCases`）并同步 `ceilings`，理由写明本次缺口；不得修改 `test-debt-gate` 逻辑、不改 `scripts/coverage-gate*.mjs`。无缺口时该文件零 diff。
- ac-scope-diff: `git diff --name-only` 默认只含 `.munk/baseline/coverage.json` 与 `.munk/changes/wi_intake_d61666f82d1133d6/**`（可选：`.munk/baseline/domains/coverage-baseline/product.md` 的最小事实同步）；触发 ac-gap-closed-if-any 时额外仅允许最小 `src/core/**` 测试文件与对应 `test-debt.json` growth。`scripts/**`、`.github/workflows/**`、`package.json`、`pnpm-lock.yaml`、`vitest.config.mts`、`.munk/code-gates.json`、`src/renderer/**`、`CHANGELOG.md`、`README.md`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- ac-no-release-actions: 不执行 `git push`、不创建/推送/保留任何 tag、不 dispatch `release.yml` / `coverage-gate-preflight.yml`、不修改已公开 Release 与资产；`package.json#version` 仍为 `0.2.23`，版本语义单点文件零 diff。
- ac-evidence-absolute: `.munk/changes/wi_intake_d61666f82d1133d6/evidence/` 下留存本次 run 的：权威 `coverage-sampling/coverage-summary.json` 与采样输出、`sampling-meta.json`（采样前 HEAD、`started_at` epoch、UTC 时间、完整命令）、`gate-positive.log`、`gate-negative.log`、`preflight.log`、`freshness-head-tag.log`、`baseline-before.json`、`baseline.diff`；回执给出全部**绝对路径**并声明证据与产出它的 commit 同源。

## 非目标

- 不改 `scripts/coverage-gate.mjs` / `scripts/coverage-gate-preflight.mjs` / 任何门脚本逻辑，不新增门文件，不改 `.github/workflows/**`。
- 不改测量口径：provider 仍 `v8`，include 仍 `src/core/**`，exclude 仍恰三个既有字面量（顺序不变），不新增 exclude、不缩范围。
- 不为过门下调任何 floor；不新增 `v8 ignore` / `c8 ignore` 指令；不改豁免模块列表。
- 不畅想提高覆盖率目标、不整文件重写测试、不调整测试源码结构；无缺口时不增删任何 `src/**` 测试。
- 不碰 UI / renderer / 图标 / 主题；不把覆盖率门接进 `.munk/code-gates.json` 或条件 profile。
- 不动版本语义单点：`package.json#version`、`CHANGELOG.md`、`README.md`（含第 5 行）、`release.yml` dispatch 默认 tag、`docs/release-notes/**`、`docs/release-evidence/**`。
- 不做发布动作：不推 tag、不 dispatch workflow、不改已公开 Release 与资产。
- 不重写 `.munk/baseline/domains/coverage-baseline/product.md`（仅允许与本次实测数字/模块数直接相关的最小段落同步）。

## 实现约束

- **采样顺序**：`pnpm install --frozen-lockfile`（当前 worktree 无 `node_modules`）→ 记录 `git rev-parse HEAD` 与 `started_at="$(date +%s)"`（必须在 vitest 启动前）→ 单次采样 → 把 `coverage-summary.json` 数值抄进 baseline。先测后改 baseline，禁止写入尚不存在的 commit。
- **门要求 summary 在仓库外**：`readFreshSummary` 明确拒绝仓内 summary。因此权威采样输出落 `evidence/coverage-sampling/`（供证据留存与 sha256 校验），跑门时复制到 `$TMPDIR` 临时目录（复制后 sha256 必须与 evidence 副本一致），`--started-at` 用同一 `sampling-meta.json` 的 epoch。
- **floors 维持现值（97 / 90 / 99、moduleBranchesMin 75、ignoreDirectivesMax 0）的具体理由**：本地反向自证 `--negative floor` 把新 baseline 的 `floors.totals.lines` 调低 1 后，与锚点（HEAD 内已提交基线 / `v0.2.21` 基线，均为 97）比较；若本轮把 lines 上调到 98，负档值 97 与锚点 97 相等将被判为「tightened or unchanged」，不再触发 `needs a matching floorLedger entry`，`PREFLIGHT negative floor` 会在提交前失败。实测值均 `>=` 现有地板，因此只做「不降」，不做无必要的上调；上述锚点行为须在 `gate-negative.log` 中显式复核。
- **缺口处理**：若实测不达地板，先保留首次 summary（`coverage-summary.pre-fix.json`）+ 缺口数值写入回执，再只做最小用例增补（优先在既有 `src/core/**/*.test.ts` 内加 case，不新增文件结构），补测后重测一次；仍不达标则 `munk_report_owner`，禁止下调地板或缩小范围。
- **模块集合**：`modules` 键必须与 summary 的模块集合逐字相等（29 条），值照抄 summary 的四项指标；`moduleBranchesMinExempt` 两个模块须保持 branches.total = 0，否则门会红。
- **baseline 其余字段**：`version` 保持 1；`provider` = `"v8"`；`scope` 字面量与现基线完全一致；`command` 更新为本次实际命令（`reportsDirectory` 指向 `evidence/coverage-sampling`）；`decision` 内容仍为 `{floor: true, gate: "release-ci"}`，`reason` 数字更新为新实测值。
- **证据与 commit 同源**：所有日志由本次 run 在 worktree 上产生；`sampling-meta.json` 记录 `sampledCommit`、`sampledAtUtc`、`startedAtEpoch`、`summarySha256`；回执中的绝对路径必须可复核。
- **freshness 复核方式（两条命令）**：① `node scripts/coverage-gate.mjs …`（positive + 临时降地板 negative）；② `node scripts/coverage-gate-preflight.mjs`（内含临时 tag 覆盖「HEAD 自身带 tag 不算」），并额外把 `previousReleaseTag()` 的解析结果与 freshness 消息写进 `freshness-head-tag.log`。
- **收尾**：`git tag --list 'v9.9.9-rehearsal*'` 为空；`git status --short` 只含预期改动；`.munk/baseline/coverage.json` 在负档/预演前后字节不变（除本次正式更新外）。
- `deliveryIntent`：本地合入 main（`munk_local_merge`），新 main tip 为发布点；本 WI 不 push。
