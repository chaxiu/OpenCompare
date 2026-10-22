# v0.2.5 发布就绪与发布证据归档

## 范围

前四项（`memory-harness` / `memory-bounded` / `cancel-structured` / `symlink-policy`）已交付并有真实实测数据，本项只做**发布线就绪 + 证据归档 + 本地元数据校验**，闭环验收点 `cp-release-025`：

1. **版本单点收敛到 0.2.5**：`package.json`、`CHANGELOG.md`（新增 `## v0.2.5`）、`docs/release-notes/v0.2.5.md`（新增）、`README.md`（首屏状态行 + 版本表 + 发布流程默认 tag + 已知问题段）、`.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default`、`docs/release-signing.md`（当前状态 / 正式版发布姿态 / 补发默认 tag / 「tag 之后的修复由 vX 承接」）全部指向 `v0.2.5`。
2. **README 三条已知问题按实测翻转**：内存增长、`ECANCELED` 日志噪声两条由「已知未修」改为「已在 v0.2.5 修复」并引用真实证据数字与文件；符号链接计数口径已由 `symlink-policy` 改写为「不跟随」，本项只负责把剩余两条补上版本归因，使「已知未修」条数为 0。
3. **发布证据文件**：新增 `docs/release-evidence/v0.2.5.md`，`status: pending`，含发布前就绪清单（逐项可核）、发布后必须回填的原文位（资产名 / 字节 / sha256 表位、唯一 Release 与 latest 门原文位、`latest*.yml` url 命中原文位、Windows 旧错位名 0 命中位、mac `codesign` / `stapler` / `spctl` 原文位、product-qa 公开复验就绪条件）。
4. **本地元数据命中校验**：新增可在 `release/` 目录 + 资产名清单上执行的校验入口（`scripts/release-metadata.mjs` + `package.json` script），对每份 `latest*.yml` 的 `files[].url`（含 `path`）做资产名成员校验，并断言 Windows 安装包名使用连字符形态、旧错位名（点号 / 空格形态）0 命中；正反用例由 `pnpm test` 内的 vitest 临时样本断言。
5. **测试成组重定标**：`src/main/release-packaging.test.ts` 中按 `package.json#version` 取值的断言整体改为「当前版本待发布」，并把只描述 v0.2.4 内容的断言改读 `docs/release-notes/v0.2.4.md` 历史文件；`src/main/release-evidence.test.ts` 与 v0.2.4 及更早的 notes / evidence / 资产 sha256 / 历史测试块保持字节不变。

发布动作边界：**不打 tag、不 push、不 publish、不触发 CI、不改写任何已公开 tag 与资产**。真实 `v0.2.5` Release 由人/Host 打 tag 后产出，发布后回填与 README 状态翻转为独立动作。

## 验收

### 版本与文档一致性

- ac-version-025: `package.json` 的 `version` 严格等于 `0.2.5`；由它派生的 `currentTag` 为 `v0.2.5`，`pnpm test` 中版本对齐类断言全绿。
- ac-changelog-v025: `CHANGELOG.md` 含 `## v0.2.5`，位置严格在 `## v0.2.4` 之上；该段含「修复」与「升级方式」两级小节，修复项覆盖内存收敛、取消零日志噪声、符号链接不跟随三件事，且不含 `TODO` / `TBD` / `FIXME`；`## v0.2.4` 及更早段落的文本与当前 main 逐字相同（`git diff` 在这些区块为 0 行改动）。
- ac-notes-v025: `docs/release-notes/v0.2.5.md` 存在、非空，首个 `# ` 标题含 `v0.2.5`；正文含「不跟随符号链接」「已跳过：左 X / 右 Y」「结构化取消」「有界缓存」与「升级方式」；不含 `TODO` / `TBD` / `FIXME`，不含任何 64 位十六进制 sha256，不含「已知未修」。
- ac-readme-pending: `README.md` 第 5 行含「当前发布状态：v0.2.5 待发布」、「最新公开 Release 为 [v0.2.4]」、「docs/release-notes/v0.2.5.md」，且全文不含「v0.2.5 已发布」「当前发布状态：v0.2.4」。
- ac-readme-table: 「版本与下载」表含 `| [v0.2.5](docs/release-notes/v0.2.5.md) | 待发布 |` 行且该行不含 `releases/tag/v0.2.5`；含 `v0.2.4` 行标「已发布（最新公开 Release）」并链 `releases/tag/v0.2.4`；`v0.2.3` 行仍为「未发布，内容并入 v0.2.4」且无任何 Release 链接；`v0.2.2` 行存在、含 `releases/tag/v0.2.2`、且不再带「最新公开 Release」字样。
- ac-signing-025: `docs/release-signing.md` 含「当前状态：v0.2.5 待发布」「正式版发布姿态（v0.2.5）」「docs/release-notes/v0.2.5.md」「补发…默认 `v0.2.5`」「tag 之后的修复由 v0.2.5 承接」；不含「当前状态：v0.2.4」「v0.2.5 已发布」；6 项 Secret 清单、fail-closed 表述与 v0.1.2 漂移事实原样保留。
- ac-workflow-default-025: 解析 `.github/workflows/release.yml` 得到 `jobs` 之外的 `on.workflow_dispatch.inputs.tag.default === 'v0.2.5'`；同样字段在 README 发布流程段写作 默认 `v0.2.5`；workflow 其余步骤（版本断言、祖先门、签名门、finalize 校验）无逻辑改动。

### 已知问题翻转

- ac-known-issues-zero-unfixed: `README.md` 的「已知问题」段中，含「已知未修」的条目数为 0；内存增长与 `ECANCELED` 两条均出现「已在 v0.2.5 修复」字样，且各自引用了真实证据路径：内存条引用 `docs/perf/large-directory-memory.md` 与 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`，取消条引用 `pnpm test:cancel` 门禁（或等价门禁名）。
- ac-known-issues-numbers: 内存条出现修复前后对照数字 `1,960,394,752` 与 `1,257,750,528`、轮次增量 `71,286,784`，且这些数字与 `docs/perf/large-directory-memory.md` 归档证据逐字一致（grep 相等，不新增/改写证据数字）；取消条写明零 `Error occurred in handler`、零 `OperationCancelledError`、零 `ECANCELED`。
- ac-known-issues-history-kept: 既有「v0.2.2 及更早」「v0.2.1 及更早」归因措辞、`8 路` / `有界并发` / `文件句柄耗尽` / `不跟随符号链接` / `已跳过` 等既有表述仍存在；不得删除既有条目来凑「0 条未修」。

### 本地元数据命中校验

- ac-metadata-pass: 对一份内容完备的临时产物集（mac `dmg` / `zip` / 两份 `blockmap`、`OpenCompare-Setup-0.2.5.exe` 及其 `blockmap`、`AppImage`、`deb`、三份 `latest*.yml`）执行校验：函数返回值 `ok === true`、`missing` 为空数组、`legacyHits` 为空数组；CLI 退出码 0，stdout 含每份 `latest*.yml` 的「url N/N 命中资产名」与一行「旧错位名 0 命中」。
- ac-metadata-missing: 把某份 `latest*.yml` 的任一 `files[].url` 改成不存在的资产名后：返回值 `ok === false`，`missing` 精确含该名字；CLI 退出码非 0，stderr 含该缺失名；其余 url 仍被计为命中，不被一处失败掩盖。
- ac-metadata-legacy-win: 资产名或 `files[].url` 中出现 `OpenCompare.Setup.0.2.5.exe`（点号形态）或 `OpenCompare Setup 0.2.5.exe`（空格形态）时：`legacyHits` 非空、`ok === false`、CLI 退出码非 0 并指出命中的旧形态名；当资产集合与 url 均为连字符形态 `OpenCompare-Setup-0.2.5.exe` 时 `legacyHits` 为 0 且通过。
- ac-metadata-empty: 目录不存在、目录内 0 份 `latest*.yml`、或传入的资产名清单为空时，`ok === false` 且 CLI 退出码非 0，stderr 说明是「目录不可读 / 无 latest*.yml / 资产名清单为空」三者之一，绝不静默退出 0。
- ac-metadata-nodeps: 校验实现为 Node 标准库 + 仓库现有 `yaml` 依赖（或等价既有依赖），不新增 npm 依赖；纯函数导出可被 vitest 直接调用，同时提供 CLI 包装；断言不发起任何网络请求。

### 证据文件

- ac-evidence-pending: `docs/release-evidence/v0.2.5.md` 存在、非空，含且仅含一处 `status: pending` 行；文件不含 `[0-9a-f]{64}` 形态的 sha256，不含 `valid on disk`、`The validate action worked!`、`source=Notarized Developer ID` 三个通过标记。
- ac-evidence-readiness: 该文件含发布前就绪清单，逐项列出 `package.json` / `CHANGELOG.md` / `docs/release-notes/v0.2.5.md` / `README.md` / `.github/workflows/release.yml` / `docs/release-signing.md` 六个被核对象，每项给出「现值 0.2.5 / v0.2.5」与核对命令或断言名。
- ac-evidence-backfill-slots: 该文件含发布后回填位：资产表预留 11 行（mac dmg / mac zip / 两份 blockmap / exe / exe blockmap / AppImage / deb / 三份 `latest*.yml`），每行资产名与字节/`sha256` 列留空（不得填占位十六进制）；含 `releases for v0.2.5: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.5 (this tag: v0.2.5)` 的原文回填位（以空代码块 + 「发布后粘贴」说明呈现）；含 `codesign --verify --deep --strict --verbose=2`、`codesign -dv --verbose=4`、`xcrun stapler validate`、`spctl -a -vv --type execute` 四条命令原文位；含本地元数据校验结果回填位（`scripts/release-metadata.mjs` 的标准输出）。
- ac-evidence-qa-handoff: 该文件含 product-qa 公开复验就绪条件清单，至少覆盖：干净环境安装各平台产物、3 轮真实目录对比含至少一次取消、footer 计数与「不跟随」口径一致、`latest*.yml` url 命中、安装包名与 `spctl` / `stapler` / `codesign` 原文核对；并写明本文件 `status` 只有回填完毕才可从 `pending` 改为 `verified`。
- ac-evidence-no-fabrication: 该文件不出现「已发布」「已验证」「全部通过」一类既成结论（`v0.2.5` 的实际 Release 尚不存在），只出现待回填与就绪判定口径。

### 历史不可改写与测试

- ac-history-immutable: `docs/release-notes/v0.2.4.md`、`docs/release-evidence/v0.2.4.md`、`docs/release-notes/v0.2.{0,1,2}.md`、`docs/release-evidence/v0.2.{0,1,2}.md` 与 `git tag --list` 输出均与改动前逐字/逐项相同；`v0.2.4` 的 11 个资产名与 sha256 值原样出现（`d7e39acb…` 等 11 条全在），`v0.2.4.md` 的 `status: verified` 与「P2 遗留」段落未被改写。
- ac-test-rescope: `src/main/release-packaging.test.ts` 中——`publishedTags` 集合含 `v0.2.4`；当前 tag 的状态断言由「已发布」改为「待发布」（README 首屏行、版本表当前行、signing 文档状态行三处一致）；`ghostRow` 断言改为「内容并入 v0.2.4」而非 `currentTag`；只描述 v0.2.4 notes 内容的断言改读 `docs/release-notes/v0.2.4.md`；新增针对 `docs/release-notes/v0.2.5.md` 的断言（标题版本 = `package.json#version`、三件修复关键词、无占位符）；已知问题断言改为「已知未修 0 条 + 两条 v0.2.5 修复」。
- ac-test-history-blocks: `release-packaging.test.ts` 中 v0.2.2 / v0.2.1 / v0.2.0 / v0.1.2 的历史断言块（`keeps the v0.2.2 changelog entry as history`、`explains why v0.2.1 ships…`、`covers the still-public v0.2.2 release notes`、`records the v0.1.2 drift facts…` 等）文本零改动；`release-evidence.test.ts` 全文对 v0.2.1 / v0.2.2 / v0.2.4 的断言零改动，仅允许新增 v0.2.5 的独立 describe。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test`（含上述新增断言）全绿；`.munk/code-gates.json` 不新增条目（既有 `test` 门禁已覆盖），不得为通过而删除或放宽任何断言。
- ac-no-publish: 仓库内不存在 `v0.2.5` tag（`git tag --list` 无该条目）、无 `git push` / `gh release` 写操作产物；`package.json` 依赖与锁文件不含 `electron-updater`；本项未新增任何自动发布触发。

## 非目标

- 不打 `v0.2.5` tag、不 push、不 publish、不触发 CI；不回填任何真实资产 sha256、CI run id、`codesign` / `stapler` / `spctl` 原文（这些只能由真实发布产出）。
- 不把 README 首屏 / 版本表 / signing 文档翻成「v0.2.5 已发布」——该翻转是发布完成后的独立动作，本项只做到「待发布 + 可打 tag」。
- 不改写 `v0.2.4` 及更早的 tag、Release、资产、notes、evidence、sha256、tag 描述与历史测试块；不重发、不重传、不删除任何已公开资产。
- 不引入 `electron-updater` 或任何自动更新机制；不改 `electron-builder.yml` 的 targets / 签名 / 公证 / `publish` 模型（`nsis.artifactName` 已是连字符形态，无需再改）。
- 不改应用功能代码：`src/core/`、`src/renderer/`、`src/main/` 的运行时代码不动；只允许测试文件、`scripts/` 新增校验脚本与 `package.json` 的 version / script 字段变化。
- 不新增 `.munk/code-gates.json` 门禁条目；不改 `perf-gate` / `memory-gate` / `cancel-gate` 的数据集与阈值。
- 不重写 README 其他段落（核心能力、项目结构、开发命令），不调整 docs 目录结构，不为凑版号重发版本。
- 不做浏览器 / 真机 / 桌面点选验收；公开件干净环境安装复验归 product-qa，不在本项执行。
- 不顺手优化 `release-packaging.test.ts` 的历史断言措辞、不重构测试文件结构。

## 实现约束

- **「待发布」是本项的既定交付姿态，不是遗漏。** 上游 `v0.2.4` tag 树里的 README 第 5 行即写「v0.2.4 待发布；最新公开 Release 为 v0.2.2」，release.yml 的 gates 在 tag 树上跑 `pnpm test`，因此待发布态的断言翻转必须落在同一个 tag 树内；`已发布` 翻转由发布完成后的独立动作完成（v0.2.4 即如此）。Coding 不要为「让文档看起来已完成」而写成「已发布」。
- **证据文件只留位、不填值。** `docs/release-evidence/v0.2.5.md` 的 `status: pending` 与空表位是刻意设计：任何 sha256 / CI run / 通过原文的伪造都会被 `ac-evidence-pending` 与后续 `release-evidence.test.ts` 风格断言抓住。真实数字回填由发布后动作或 product-qa 完成。
- **真实数字只许引用，不许重算/改写。** 内存数字取自 `docs/perf/large-directory-memory.md` 与 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`；符号链接 footer 取自 `docs/symlink-no-follow.md` 与 `docs/evidence/symlink-footer-*.json`；取消门禁取自 `pnpm test:cancel`（`cancel-gate`）。README 引用时不得修改证据文件里的任何数字或断言（`ac-known-issues-numbers` 逐字比对）。
- **校验入口的口径照抄 CI 既有实现，不发明新 schema。** `release.yml` 的 `Assert latest*.yml urls match the release assets` 已定义解析规则（`files:` 块内 `- url:` 与紧随条目的 `url` / `path` 键，去引号、去 `./` 前缀后与资产名集合做成员校验；任一缺失即失败；`files` 声明为空也算失败）。本地脚本必须与该规则等价，这样本地通过才可预期 CI 通过；Windows 旧错位名检查是本项新增的本地补充（连字符 `OpenCompare-Setup-<version>.exe` 为唯一合法形态）。
- **测试成组更新，不要逐条打补丁。** 把「当前版本」相关断言视为一组：待发布状态三处（README 首屏 / 版本表当前行 / signing 状态行）、`publishedTags`（需含 `v0.2.4`）、`ghostRow`（历史事实「内容并入 v0.2.4」不能随版本漂移）、当前 notes 内容断言（v0.2.4 内容改为读历史文件）、已知问题条数（0 未修 / 2 已修）。任何一处漏改都会让 tag 树上的 gates 红。
- `release-packaging.test.ts` 顶部已声明「文档/工作流默认值一律从 `package.json#version` 派生」，保持该设计：新增/修改的断言优先复用 `currentTag`，版本字面量只允许出现在历史标签集合（`v0.2.0` / `v0.2.1` / `v0.2.2` / `v0.2.4`）与文档标题位置。
- 元数据校验脚本建议放 `scripts/release-metadata.mjs`（与 `perf-dir.mjs` / `perf-gate.mjs` 同级、零构建依赖），`package.json` 增加 `release:metadata` script；vitest 用例用 `mkdtempSync` 造临时 `release/` 与 `latest*.yml`（可用仓库已有的 `yaml` 依赖序列化），既调用纯函数也 `spawnSync` 断言退出码。真实执行示例写进证据文件与 README 发布流程段（`pnpm release:metadata --dir release`）。
- 若真实 `release/` 目录不存在（仓库当前无该目录），脚本必须给出可读失败信息而非崩溃；该路径只由人类/CI 在打包后执行，不进入 `code_gates`。
- 交付时同步 `release` 域基线（`.munk/baseline/domains/release/product.md` 的版本单点与证据口径）与 QA 落档，属仓库惯例，不作为本项硬验收门槛。
