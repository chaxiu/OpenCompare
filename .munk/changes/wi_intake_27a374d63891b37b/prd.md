# Q4 测试清债收尾：release 门禁测试瘦身与去真值化（test-only）

## 范围

只改测试与测试夹具，不改产品行为、不改发布产物、不改版本单点。

1. **主目标**：`src/verify-release-gate.test.ts` 从 599 行压到 ≤500 行（净减 ≥99），保持原有行为覆盖：A 层 15 项固定 check registry、fail-closed summary、三平台 fail 腿、B 层三轮 / 16 MiB 保留堆、AST 结构契约、post-release workflow 契约、code-gates 清单契约。
   - 优先通过合并重复 describe / 表驱动化重复 `it`、压缩无意义样板达成；禁止把断言搬进新文件规避行数门，禁止为了凑行数删掉行为断言。
2. **去真值化**：
   - `.ts` 中当前发布版本 `0.2.16` / `v0.2.16` 字面量清零（纯 judge 入参改合成值；需要真实版本时从 `package.json` 运行时派生，而不是写死）。
   - `.ts` 中"真实资产 sha256"字面量为 0；`sha256("")` / `sha256("abc")` 标准算法向量保留（它们不是资产值）。
3. **docs / yml 断言结构化**：对 `docs/**.md` 与 `*.yml` 的断言一律先 parse（YAML / Markdown 标题·表格·代码 span·链接），再断字段、结构、存在性或链接；删除对原文整句的 `toContain` / `includes`。
   - 受影响面（进入本次范围）：`src/verify-release-gate.test.ts`（lessons 原文标记、post-release workflow 原文正则）、`src/main/release-evidence.test.ts`（`specs[].facts` 整句）、`src/main/release-packaging.test.ts`（workflow 原文正则 / 步骤顺序靠 `indexOf`）、`src/main/release-artifacts-and-brand.test.ts`（docs 原文 token、notes 整句、步骤顺序 `indexOf`）、`src/main/release-doc-fixtures.test-helpers.ts`（`.yml` 原文 regex 取字段）、`src/main/__fixtures__/release-packaging.json`、`src/main/__fixtures__/release-artifacts-and-brand.json`。
4. **补齐 release.yml 门步骤的结构断言**：当前没有测试逐条钉住 `gates` job 的 `pnpm install --frozen-lockfile / pnpm lint / pnpm typecheck / pnpm test / pnpm build`，改任一步可能不红。需在既有 release workflow 契约测试中按 YAML 解析后的 step 列表断命令，使改任一门步骤必红且失败信息指出具体步骤。

### 基线实测（本 worktree，2026-11-02）

| 指标 | 实测值 | 命令 |
| --- | --- | --- |
| 目标文件行数 | 599 | `wc -l < src/verify-release-gate.test.ts` |
| 目标文件 `readFileSync` 出现次数 | 3（import + 2 个 helper） | `grep -c readFileSync src/verify-release-gate.test.ts` |
| 目标文件 `toContain(` | 0 | `grep -c 'toContain(' src/verify-release-gate.test.ts` |
| 目标文件用例数 | 71 | `pnpm test src/verify-release-gate.test.ts` |
| 全仓用例数 | 1872 collected / 1871 passed / 1 skipped | `pnpm test` |
| `.ts` 当前版本字面量 | 15 处 `0.2.16` + `v0.2.16`（分布在 `src/verify-release-gate.test.ts`、`src/main/release-version-gate.test.ts`） | `grep -rnE --include='*.ts' 'v?0\.2\.16' src` |
| `.ts` 64 位 hex 字面量 | 6 处，全部是 `sha256("")` / `sha256("abc")` 标准向量 | `grep -rnE --include='*.ts' '[0-9a-f]{64}' src` |
| 文档整句 token（fixture） | 6 条（release-process-doc 2、notes-en 2、notes-zh 2） | 见下方 audit 脚本 |
| `release-evidence.test.ts` 整句 facts | 16 条 `['## …', 原文句子]` | `grep -c "facts: \[" src/main/release-evidence.test.ts` |

> 说明：用户给的"全仓 1836 用例"是旧值，本次实测为 1872 collected。降幅门限按实测基线算。

## 验收

- ac-target-file-size: `wc -l < src/verify-release-gate.test.ts` ≤ 500（基线 599，净减 ≥ 99）。
- ac-single-read-entry: `grep -c readFileSync src/verify-release-gate.test.ts` ≤ 1；`grep -c 'toContain(' src/verify-release-gate.test.ts` = 0；`git status --porcelain | grep -E '^\?\?.*\.test\.ts'` 无输出（不新增测试文件）。
- ac-behavior-preserved: `pnpm test src/verify-release-gate.test.ts` 全绿且 0 skipped；全仓 collected 用例数 ≥ 1779（基线 1872，降幅 ≤ 5%）；delivery 提供"原断言 → 替代断言"映射表，覆盖每一条被删/被合并的断言，且以下行为仍各有一条断言在跑：15 项 registry、平台过滤、CLI 参数拒绝、A 层全绿与零 heap/fixture、13 条平台 fail 腿、missing/unexpected/skip/count/env/evidence/step 字段 fail-closed、三平台聚合、B 层三轮与 16 MiB 线、纯函数判定、AST 结构契约、post-release workflow 契约、code-gates 清单契约。
- ac-version-literal-zero: `grep -rnE --include='*.ts' 'v?0\.2\.16' src` 无输出；`src/main/release-version-gate.test.ts` 的 `versionFacts()` 使用合成版本（至少包含 `9.9.9` / `v1.2.3`）；`judgeVersionSources` 等纯函数的断言逻辑不变；`pnpm test src/main/release-version-gate.test.ts` 绿。
  - 需要真实当前版本时用运行时派生（如 `pkg.version`），不得写 `0.2.16` 字面量。
- ac-asset-sha-zero: `.ts` 中不再出现任何真实资产 sha256 字面量；`grep -rnE --include='*.ts' '[0-9a-f]{64}' src` 的输出仅剩 6 条标准向量（`src/core/directory/compare.test.ts`、`src/main/platform/electron-platform.test.ts` 的 `sha256("")` / `sha256("abc")`）；`docs/release-evidence-ledger.json` 与 `docs/release-evidence/*.md` 的 sha256 只允许运行时读取。
- ac-docs-yml-structured: 对 `docs/**.md` 与 `*.yml` 的断言不再对原文整句做 `toContain` / `includes`。可核验条件：
  - `src/main/__fixtures__/release-artifacts-and-brand.json` 的 `docs[].tokens/absent` 与 `notesSections[].tokens` 中不含中文句读（`，。：；`）或英文整句（≥8 个空格分隔词）；
  - `src/main/release-evidence.test.ts` 的 `specs[].facts` 整句字段删除，改为标题 / 表格行 / 代码 span / 链接断言；
  - release 套件中对 `docs/`、`*.yml` 的读取位置，断言输入均来自 parse 结果（YAML 对象、Markdown 标题/表格/链接/代码 span），不得把整段原文直接丢给 `toContain`；
  - delivery 附"文档断言审计表"：每处 docs/yml 断言 → 解析方式 → 被断字段，并给出上述 fixture 的 audit 脚本实跑输出（句子 token = 0）。
- ac-workflow-gate-steps-pinned: release.yml `gates` job 的门步骤按 YAML 解析后的结构被逐条钉住（`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`）；把其中任一条改成别的命令必红，失败信息包含该步骤命令。
- ac-injection-workflow-red: 注入证据——把 `.github/workflows/release.yml` 中 `- run: pnpm lint` 改为 `- run: pnpm lint --max-warnings 0`（或等价改动任一门步骤），运行 `pnpm test src/main/release-packaging.test.ts` 必红，失败输出包含具体用例名与 `pnpm lint`（或该步骤名）；`git checkout -- .github/workflows/release.yml` 后同命令回绿。delivery 贴真实失败输出与恢复后的通过输出。
- ac-injection-evidence-red: 注入证据——把 `docs/release-evidence/v0.2.16.md` 任一资产行的 sha256 改一个字符，运行 `pnpm test src/main/release-evidence.test.ts` 必红，失败输出包含具体用例名（`matches the ledger asset table row by row` 或等价 ledger 比对用例）以及版本 / 资产名；恢复后同命令回绿。delivery 贴真实前后输出。
- ac-gates-green: `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 全绿；`pnpm test src/verify-release-gate.test.ts` 绿；`.munk/code-gates.json` 中全部 21 条 gate 逐条 exit 0（至少覆盖 `test` 与 `verify-release-gate`，以及被改动的 release 套件）。delivery 给出每条 gate 的命令与结果。
- ac-product-untouched: `git diff --exit-code -- package.json pnpm-lock.yaml .github/workflows/release.yml docs/ scripts/ src/main/release-gate.ts src/main/release-metadata-gate.ts` 无差异；`node -p "require('./package.json').version"` = `0.2.16`；未新增依赖；未改动 `src/App.test.*` 与 `src/sync-real-gate.test.ts`（Q5 范围）；`git status` 只出现测试与测试夹具文件。

## 非目标

- 不改产品源码、发布脚本（`scripts/*.mjs`）行为、Electron 打包配置、`release.yml` 与 `docs/**` 正文内容。
- 不重打包 / 不公证 / 不发布 / 不跑浏览器或实机。
- 不清理历史证据版本号（`v0.2.1` … `v0.2.15`、ledger 中历史条目），它们是真实 `docs/release-evidence/*.md` 的锚点；也不清理 `scripts/*.mjs` 注释里的示例版本。
- 不动 `App.test` / `sync-real-gate`（Q5）。
- 不新增依赖、不升级版本、不改版本单点、不改 `.munk/code-gates.json` 的 gate 清单。
- 不为压行数牺牲可读性或删行为断言；不允许新增 `*.test.ts` 文件。

## 实现约束

- Test-only：允许编辑 `src/verify-release-gate.test.ts`、`src/main/release-{version-gate,evidence,packaging,artifacts-and-brand}.test.ts`、`src/main/release-doc-fixtures.test-helpers.ts`、`src/main/__fixtures__/release-{packaging,artifacts-and-brand}.json`。
- `src/verify-release-gate.test.ts` 只保留一个文件读取入口（如 `readBytes`，`readText` 由其派生），`readFileSync` 字面出现 ≤1 次。
- 文档 / yml 断言替代方向：Markdown 标题锚点、表格行字段、代码 span / 命令、链接 target、文件存在性；YAML 用 `parse()` 后按对象字段断言（`on.push.tags`、`permissions`、`jobs.*.needs`、`jobs.*.steps[].run/uses/with`）。
- 合成版本建议统一用 `9.9.9` / `v9.9.9`、`v1.2.3`；测试标题里的真实版本描述一并去掉。
- 注入验证必须先 `git status` 确认工作区干净，注入后贴真实失败输出，再恢复并贴回绿输出；不得把注入改动留在提交里。
- 交付映射表放在 delivery，不写 `tech.md`。
