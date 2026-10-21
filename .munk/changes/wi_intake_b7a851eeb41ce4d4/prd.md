# OpenCompare v0.2.2 版本收敛与发布说明（EMFILE 修复承接版）

## 范围

本项只做版本收敛与发布文档对齐，承接已合入 `main` 的 EMFILE 修复（merge `4c028f5`，修复提交 `a24cdd2`），不改任何业务逻辑。

1. `package.json#version`：`0.2.1` → `0.2.2`（唯一版本来源；其余位置一律从它派生）。
2. `CHANGELOG.md` 新增 `## v0.2.2` 段（置于 `## v0.2.1` 之前）：目录对比内容读取、快照内容读取、目录条目遍历改为默认 **8 路有界并发**；`EMFILE` / `ENFILE` 转为「文件句柄耗尽」可读提示而非崩溃；回指 [GitHub Issue #2](https://github.com/chaxiu/OpenCompare/issues/2)。
3. 新建 `docs/release-notes/v0.2.2.md`：写用户可见变化（大目录对比不再崩、句柄耗尽给可读提示）与升级建议（v0.2.1 及更早用户升级）。
4. `README.md`：
   - 状态行改为承接 v0.2.2 **待发布**口径（当前最新公开 Release 仍是 v0.2.1，指向 v0.2.2 发布说明文件）；
   - 「已知问题」段与 v0.2.2 一致：故障版本写「v0.2.1 及更早」，修复描述写 8 路有界并发 + 句柄耗尽可读提示。
5. 版本断言去内联字面量、改为从 `package.json#version` 推导：
   - `src/main/release-packaging.test.ts`：删除 `expect(pkg.version).toBe('0.2.1')` 这类硬编码，版本一致性断言全部派生自 `pkg.version`（与 CHANGELOG 标题、发布说明文件名/标题、README 状态行、workflow dispatch default 互相校验），不新增 `'0.2.2'` / `'v0.2.2'` 字面量；
   - `.github/workflows/release.yml` preflight 保持只从 `package.json` 读版本（`node -p "require('./package.json').version"`），不出现内联版本号。

因发布测试以 `package.json#version` 派生「当前版本」相关断言，版本一改，下列**机械耦合面**必须同批对齐，否则 `pnpm test` 必红（见「实现约束」中的具体条目）：

6. `docs/release-signing.md`：状态行与「正式版发布姿态」章节标题改为 v0.2.2 待发布，指向 `docs/release-notes/v0.2.2.md`，并把「tag 之后的修复由 … 承接」改为 v0.2.2。
7. `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 与 README「发布流程」里的「默认 `v0.2.2`」对齐（仅改默认值，不改步骤顺序、触发条件、发布模型）。

## 验收

- ac-version-0-2-2: `package.json#version` 严格等于 `0.2.2`，且 `CHANGELOG.md` 存在 `## v0.2.2` 标题。
- ac-version-single-source: `src/main/release-packaging.test.ts` 中不出现 `'0.2.2'` / `'v0.2.2'` 字面量，也不再出现 `toBe('0.2.1')` 的版本钉死；所有版本相关断言值均由读取到的 `package.json#version` 派生。
- ac-preflight-version-derived: `release.yml` 的 `Preflight package version` 与 `Assert the tag matches package.json version` 两步的版本来源仍是 `node -p "require('./package.json').version"`，步骤内无内联版本号。
- ac-changelog-v022: `CHANGELOG.md` 中 `## v0.2.2` 的位置早于 `## v0.2.1`，该段包含 `8` 路有界并发、`EMFILE`、`ENFILE`、`https://github.com/chaxiu/OpenCompare/issues/2` 四个可断言片段。
- ac-release-notes-v022: `docs/release-notes/v0.2.2.md` 存在，首个 `# ` 标题含 `v0.2.2`；正文含「大目录对比不再崩溃 / 句柄耗尽可读提示」的用户可见变化，以及面向「v0.2.1 及更早」用户的升级建议；不含 `TODO` / `TBD` / `FIXME` 占位符。
- ac-readme-status-pending: `README.md` 状态行同时满足：含 `当前发布状态：v0.2.2 待发布`、含 `最新公开 Release 为 v0.2.1`、含 `docs/release-notes/v0.2.2.md`，且不含 `v0.2.2 已发布`。
- ac-readme-known-issues: `README.md`「已知问题」段声明故障版本为「v0.2.1 及更早」，并声明当前版本已修复（8 路有界并发 + 文件句柄耗尽可读提示），不再把故障归给当前版本。
- ac-signing-doc-posture: `docs/release-signing.md` 含 `正式版发布姿态（v0.2.2）`、含 `docs/release-notes/v0.2.2.md`、含 `tag 之后的修复由 v0.2.2 承接`。
- ac-dispatch-default-derived: `release.yml` 的 `workflow_dispatch` tag 默认值字符串等于 `v${package.json#version}`，且 `README.md`「发布流程」段含同一默认值文本；两处一致。
- ac-test-retarget-keeps-intent: 版本变更导致的三处既有断言按原位重定标且强度不降——(a) README 发布姿态断言由「已发布」改为「待发布」并断言最新公开 Release 链接指向 v0.2.1；(b) 「当前发布说明承载上一版用户可见变化」的关键词断言改为对 `docs/release-notes/v0.2.1.md` 断言，另对 v0.2.2 说明断言 EMFILE/并发关键词；(c) v0.2.1 首发替代说明的切片边界固定为 `## v0.2.1`..`## v0.2.0`，不被新增的 `## v0.2.2` 拓宽。
- ac-no-workflow-order-change: `release.yml` 的 job 名、步骤名与顺序、`needs`、`push: tags: ['v*']` 触发条件、`--publish never`、finalize 断言均与改动前逐项相同；`git diff` 仅涉及 `workflow_dispatch` 默认值一行。
- ac-no-release-side-effects: 本项不创建 tag、不 push、不 publish、不创建 Release；仓内不出现新的发布执行脚本或凭据。
- ac-gates-green: `.munk/code-gates.json` 的 `lint` / `typecheck` / `build` / `build-web` / `test` 全部通过。

## 非目标

- 不改 `src/core/`、`src/main/`（除 `release-packaging.test.ts` 的版本断言）、`src/renderer/`、`src/preload/`、`src/shared/` 的业务逻辑；不改 `src/main/release-evidence.test.ts` 与 `docs/release-evidence/v0.2.1.md`。
- 不改既有功能测试与门禁测试的行为断言口径（EMFILE 并发、错误映射、发布流程硬断言等一律原样保留）；除验收 `ac-test-retarget-keeps-intent` 列出的三处版本耦合重定标外，不得放宽或删除任何断言。
- 不改 `release.yml` 的步骤顺序、发布模型、fail-closed 签名/公证配置、祖先门与单 Release 断言。
- 不新建 `docs/release-evidence/v0.2.2.md`、不补写 v0.2.2 取证；不清理 `0.2.0` / `0.2.1` 的历史发布文档。
- 不做新功能、不做性能调优、不做顺手重构、不调整并发默认值（保持 8）。
- 不建 tag / 不 push / 不 publish / 不创建 Release。

## 实现约束

- 版本号只允许出现在 `package.json#version` 与「历史文档段落」中（`CHANGELOG.md` 的 v0.2.1 及更早段、`docs/release-notes/v0.2.{0,1}.md`、`docs/release-evidence/v0.2.1.md`）。新增的 v0.2.2 文档标题/文件名是文档标识，不算测试或 workflow 里的内联断言字面量。
- README 状态行沿用既有格式（`> ⏳/✅ **当前发布状态：…**` 单段引用），只替换版本与待发布口径，不改其余签名/公证说明文字。
- 发布测试的改动以「派生 + 互校」为原则：`pkg.version` 派生 `currentTag`，再由 `currentTag` 校验 CHANGELOG 标题、`docs/release-notes/<tag>.md` 存在与首标题、README 状态行、`release.yml` dispatch default；不引入读取 `.git`、真实 tag 或网络的依赖（保持测试套件环境自包含）。
- `workflow_dispatch` 默认 tag 改为 v0.2.2 后，在 v0.2.2 tag 尚未创建前手动 dispatch 会在「Assert the release tag exists in the checkout」步骤显式失败——这是预期行为（tag 不存在即拒绝发布），不额外加旁路逻辑。
- 文案使用既有中文术语：「目录对比」「快照」「有界并发」「文件句柄耗尽（EMFILE / ENFILE）」；错误提示以 `src/core/io.ts` 既有 `FileHandleExhaustedError` 文案为准，文档不自创新错误码。
- 提交信息风格沿用 `chore(release): …`。
