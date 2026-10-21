# OpenCompare v0.2.3 版本收敛与发布说明（悬空链接容错承接版）

## 范围

本项只做版本收敛与发布文档对齐，承接已合入 `main` HEAD `75848af` 的「悬空符号链接 / 不可读项」容错修复（修复提交 `4408c10`，落在 `src/core/directory/compare.ts`、`src/core/directory/snapshot.ts`、`src/main/platform/electron-platform.ts` 与工作台提示），不改任何业务逻辑。本版唯一用户可见变化就是这条容错行为；同批把大目录内容读取的内存改进（摘要直写缓存）写进发布面。

1. `package.json#version`：`0.2.2` → `0.2.3`（唯一版本来源；其余「当前版本」文本与断言一律从它派生）。
2. `CHANGELOG.md` 顶部新增 `## v0.2.3` 段（位于 `## v0.2.2` 之前），沿用既有版式（概述段 + `### 修复` + `### 升级方式`）：
   - 修复：真实工程目录含悬空符号链接 / 不可读项时，目录列举、扫描、对比与快照构建不再整体失败，改为跳过并计数，工作台就地以 info 提示「已跳过 N 个不可读项/悬空链接」；
   - 改进：大目录内容读取改为摘要直写缓存（digest 直接写入缓存、不再保留每份文件正文），内存占用下降；
   - 升级方式与签名口径沿用 v0.2.2 表述（`dmg` / `.zip` / `Setup.exe` / `.AppImage` / `.deb`，Developer ID 签名 + Apple 公证，凭据缺失 fail-closed）。
3. 新建 `docs/release-notes/v0.2.3.md`：首行标题含 `v0.2.3`；正文覆盖本版唯一用户可见变化（跳过并计数 + info 提示原文「已跳过 N 个不可读项/悬空链接」）与内存改进（摘要直写缓存；DawnChat ↔ ZenMind 实测 134 万文件、原实现需读 10.67 GiB）；含面向「v0.2.2 及更早」用户的升级建议；保留 v0.2.2 的 EMFILE 修复作为历史记录。
4. `README.md`：
   - 状态行改为 v0.2.3 **待发布**口径（`当前发布状态：v0.2.3 待发布`，最新公开 Release 仍指向 `v0.2.2`，发布说明指向 `docs/release-notes/v0.2.3.md`）；
   - 「发布流程」段 `workflow_dispatch` 默认 tag 改为 `v0.2.3`；
   - 「已知问题」段：新增「v0.2.2 及更早：真实工程目录含悬空符号链接 / 不可读项时目录对比整体失败；当前版本已修复（跳过并计数 + info 提示）」，并**保留**原 EMFILE 条目（`v0.2.1 及更早`、8 路有界并发、当前版本已修复）。
5. `docs/release-signing.md`：状态行改为 `当前状态：v0.2.3 待发布`；「正式版发布姿态」章节标题改为 `（v0.2.3）`；发布说明链接改为 `docs/release-notes/v0.2.3.md`；「tag 之后的修复由 … 承接」改为 v0.2.3；第五节的补发示例 tag 与默认 tag 文本改为 `v0.2.3`。
6. `.github/workflows/release.yml`：仅改 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.3'`；`Preflight package version` 与 `Assert the tag matches package.json version` 继续只从 `package.json` 读版本，不新增内联版本字面量。
7. `src/main/release-packaging.test.ts`：把与 `package.json#version` 耦合的断言重定标到 0.2.3（详见「实现约束」），不新增 `'0.2.3'` / `'v0.2.3'` 字面量，不删除、不放宽任何既有断言。

## 验收

- ac-version-0-2-3: `package.json#version` 严格等于 `0.2.3`，且 `CHANGELOG.md` 存在 `## v0.2.3` 标题。
- ac-version-single-source: `src/main/release-packaging.test.ts` 中不出现 `0.2.3` 字面量（`currentTag` / `pkg.version` 派生之外无新增版本常量），所有「当前版本」断言值均由读取到的 `package.json#version` 推导。
- ac-preflight-version-derived: `release.yml` 的 `Preflight package version` 与 `Assert the tag matches package.json version` 两步版本来源仍为 `node -p "require('./package.json').version"`；除 `workflow_dispatch` 默认 tag 一行外，`release.yml` 全文不出现 `0.2.3` 字面量。
- ac-changelog-v023: `CHANGELOG.md` 中 `## v0.2.3` 位置早于 `## v0.2.2`，该段包含「悬空符号链接」「不可读项」「已跳过」「摘要直写缓存」四个可断言片段；`## v0.2.2` 及更早各段内容与改动前逐字相同。
- ac-release-notes-v023: `docs/release-notes/v0.2.3.md` 存在且非空，首个 `# ` 标题含 `v0.2.3`；正文含提示原文 `已跳过 N 个不可读项/悬空链接`、`摘要直写缓存`、`134 万`、`10.67 GiB`、`v0.2.2 及更早`、`升级`；不含 `TODO` / `TBD` / `FIXME` 占位符。
- ac-readme-status-pending: `README.md` 状态行同时含 `当前发布状态：v0.2.3 待发布`、`最新公开 Release 为 [v0.2.2]`、`docs/release-notes/v0.2.3.md`，且不含 `v0.2.3 已发布`。
- ac-readme-known-issues: `README.md`「已知问题」段同时含：`v0.2.2 及更早` + 悬空符号链接 / 不可读项已在当前版本修复 + `已跳过`；以及原 `v0.2.1 及更早` + `8 路` + `有界并发` + `文件句柄耗尽` + `当前版本已修复`（两条记录并存，不互相覆盖）。
- ac-signing-doc-posture: `docs/release-signing.md` 含 `当前状态：v0.2.3 待发布`、`正式版发布姿态（v0.2.3）`、`docs/release-notes/v0.2.3.md`、`tag 之后的修复由 v0.2.3 承接`，且不含 `v0.2.3 已发布`；文件内不再把 v0.2.2 作为当前版本/补发默认 tag 引用。
- ac-dispatch-default-derived: `release.yml` 的 `workflow_dispatch` tag 默认值等于 `v${package.json#version}`，`README.md`「发布流程」段与 `docs/release-signing.md` 的默认 tag 文本与之相同；测试侧仍以 `default: '${currentTag}'` 形式断言。
- ac-no-workflow-order-change: `release.yml` 的 job 名、步骤名与顺序、`needs`、`push: tags: ['v*']` 触发条件、`--publish never`、祖先门与 finalize 断言、6 项签名 Secrets 清单均与改动前逐项相同；`git diff .github/workflows/release.yml` 仅涉及 `workflow_dispatch` 默认值一行。
- ac-test-retarget-keeps-intent: 版本耦合断言按原位重定标且强度不降：
  (a) README / signing 状态断言由「已发布」翻为「待发布」，反向断言由「不含待发布」翻为「不含已发布」，并断言最新公开 Release 指向 v0.2.2；
  (b) 「当前发布说明覆盖本版用户可见变化」的关键词断言改为悬空链接 / 跳过计数 / `已跳过`，其切片边界固定在 `## v0.2.3`..`## v0.2.2`；
  (c) 「最近一版公开说明」（`lastReleasedNotes` 路径）由 `docs/release-notes/v0.2.1.md` 前移到 `docs/release-notes/v0.2.2.md`，其关键词断言改为 v0.2.2 实际内容（`EMFILE` / `ENFILE` / `8 路` / `有界并发` / `文件句柄耗尽`）；
  (d) `## v0.2.1` 首发替代段与 v0.2.0 / v0.1.2 历史段的切片边界与断言保持不变；
  (e) 允许新增由 `currentTag` 派生的断言覆盖本版唯一用户可见变化（README 已知问题段 + 发布说明 + CHANGELOG 当前段），但不得删除既有断言、不得改为 `toBeTruthy()` / 宽松正则。
- ac-no-stale-current-version: 仓库中不存在把「当前版本 / 当前 tag」绑定到 0.2.2 的断言或字面量——`README.md` 状态行与发布流程段、`docs/release-signing.md` 状态与姿态与链接与承接句、`.github/workflows/release.yml`、`src/main/release-packaging.test.ts` 的 `currentTag` 派生断言中均不出现 0.2.2；历史面（`CHANGELOG.md` 的 ≤ v0.2.2 段、`docs/release-notes/v0.2.2.md`、`docs/release-evidence/v0.2.2.md`、`src/main/release-evidence.test.ts`、`lastReleasedNotes` 路径与历史切片边界）保留 v0.2.2 不算残留。
- ac-history-intact: `docs/release-notes/v0.2.2.md`、`docs/release-notes/v0.2.1.md`、`docs/release-notes/v0.2.0.md`、`docs/release-evidence/v0.2.2.md`、`docs/release-evidence/v0.2.1.md` 与 `src/main/release-evidence.test.ts` 的 `git diff` 为空（历史发布与取证记录零改动）。
- ac-no-release-side-effects: 本项不创建 tag、不 push、不 publish、不创建 Release，不新增 `docs/release-evidence/v0.2.3.md`，不新增发布执行脚本或凭据。
- ac-gates-green: `.munk/code-gates.json` 的 `lint` / `typecheck` / `build` / `build-web` / `test` 全部通过（退出码 0）。

## 非目标

- 不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts` 的版本耦合断言）、`src/renderer/`、`src/preload/`、`src/shared/` 的任何业务逻辑；不改 `src/main/release-evidence.test.ts`。
- 不改既有断言口径：不删除、不弱化、不绕过任何发布门断言（签名/公证、唯一公开 Release、祖先门、`latest*.yml` 版本、6 项 Secrets 等一律原样保留）；除本 prd 明列的版本耦合重定标外不得改动。
- 不改 `release.yml` 的步骤顺序、触发条件、发布模型、fail-closed 配置；不新增 workflow 校验步骤。
- 不新建或补写发布取证（`docs/release-evidence/*`）；不在本期把 README/signing 翻为「已发布」——那是 tag 与 Release 完成后的后续工作项。
- 不对悬空链接容错做任何代码侧补强、不做性能调优、不调整并发默认值（保持 8 路）、不做顺手重构或格式化。
- 不改 `electron-builder.yml`、`build/`、品牌图标、依赖与锁文件。
- 不建 tag / 不 push / 不 publish / 不创建 Release。

## 实现约束

- 版本号只允许出现在 `package.json#version` 与「历史文档段落」中（`CHANGELOG.md` 的 v0.2.2 及更早段、既有 `docs/release-notes/v0.2.{0,1,2}.md`、`docs/release-evidence/*`）。新建文档的标题与文件名中的 `v0.2.3` 是文档标识，不算测试或 workflow 的内联断言字面量；`workflow_dispatch` 默认 tag 是 GitHub 要求的静态字符串，由测试以 `currentTag` 交叉校验。
- README 状态行沿用既有单段引用格式（`> ⏳ **当前发布状态：…**`），只替换版本、待发布口径与说明链接，不改其余签名/公证说明文字。仓库先例（提交 `a6f9951` 待发布、`d483ba2` 翻已发布）即为本口径的依据。
- 待发布口径必然把既有「已发布」断言翻为「待发布」，这就是本项的「版本耦合重定标」：检查项、覆盖范围、fail-closed 强度不变，只重定标当前 tag 与状态词。禁止借机删断言或放宽匹配。
- `release-packaging.test.ts` 的重定标清单（改这三处 + 允许按 (e) 新增）：`lastReleasedNotesPath` 从 `v0.2.1` → `v0.2.2`（连注释）；「当前 changelog 段」切片边界改为 `## ${currentTag}`..`## v0.2.2` 且内容断言换成悬空链接 / 跳过计数；「当前发布说明」断言换成 `v0.2.2 及更早` 与跳过提示，EMFILE 关键词断言随之落到 `lastReleasedNotes`（v0.2.2）侧。测试仍不得读取 `.git`、真实 tag 或网络。
- 文案必须与代码一致：提示原文取 `src/renderer/src/workbench/Workbench.tsx` 的 `已跳过 ${comparison.skipped} 个不可读项/悬空链接`，目录视图统计取 `src/renderer/src/views/DirectoryView.tsx` 的同义文案；术语沿用「目录对比」「快照」「悬空符号链接」「不可读项」「摘要直写缓存」。
- 内存段只按实测口径陈述（DawnChat ↔ ZenMind、134 万文件、原实现需读 10.67 GiB），不外推为通用承诺、不编造其它数字；不得宣称「零拷贝」「流式哈希」等代码未实现的机制。
- 发布说明须以「跳过并计数 + info 提示」为唯一用户可见变化主线，EMFILE 只作为上一版历史记录出现（`src/core/directory/compare.ts` 中 `EMFILE` / `ENFILE` 仍为可读错误，行为未变）。
- 提交信息风格沿用 `chore(release): …`。
