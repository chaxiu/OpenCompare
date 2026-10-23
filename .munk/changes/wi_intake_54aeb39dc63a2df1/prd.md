# v0.2.7 版本收敛与发布说明（为 07:00 批次发版准备已过门发布点）

## 范围

把当前 `main` 收敛成一个「可发版」的版本点，只做版本锚点与发布文档，不碰业务代码与已公开发布物：

1. `package.json#version` 0.2.6 → 0.2.7（必须严格大于 last tag `v0.2.6`，否则 07:00 窗口会因缺「版本收敛 commit」停手）。
2. `CHANGELOG.md` 新增 `## v0.2.7` 段；新建 `docs/release-notes/v0.2.7.md`。按 `git log --oneline v0.2.6..main`（本仓当前 35 个 commit）逐条核对，**只写两类用户可见变化**：
   - ① 桌面端 UI 中英双语：首启按系统语言（`zh*` → 中文，其余含未知 → 英文）、设置内切换并持久化、切语言即时整窗生效、不丢会话状态、不重扫、无需重启。
   - ② README 精简为 9 节双语门面：发布流程 / 签名 / 内存数字外置到 `docs/`，Known issues 只留未修项。
3. `.github/workflows/release.yml` 的 `workflow_dispatch` 默认 tag 改 `v0.2.7`；`docs/release-process.md` 对应 `default tag` 行同步 `v0.2.7`。
4. 解耦 README 版本锚点：`src/main/release-packaging.test.ts` 把「README 第 5 行 == package.json 版本」改为「README 第 5 行 == `latestPublishedTag`（当前 `v0.2.6`，常量保留）」，`currentTag` 相关文档单独断言，并新增「`latestPublishedTag` ∈ `publishedTags` 且 semver < `currentTag`」。
5. `docs/release-process.md` 补一小段：README 的 latest release 行指向已发布版本，版本收敛不改它；发布完成后跟随一次一行提交同步该行与测试常量。

## 验收

- ac-pkg-version: `package.json#version` 等于 `0.2.7`，且按 semver 严格大于 last tag `v0.2.6`（`git describe` 仍为 `v0.2.6`，因本项不打 tag）。
- ac-changelog-entry: `CHANGELOG.md` 含唯一的 `## v0.2.7` 段，且位于 `## v0.2.6` 之前；段内覆盖 ① 双语 UI 与 ② README 9 节门面两类用户可见变化，并含 `### 升级方式`；不含 `TODO` / `TBD` / `FIXME`。
- ac-release-notes-file: `docs/release-notes/v0.2.7.md` 存在且非空，首个 H1 含 `v0.2.7`；含「升级方式」、两类变化、`v0.2.6` 为升级起点的表述；不含 `待验证` / `预计通过` / `应该通过`，不含 64 位十六进制串（`/[0-9a-f]{64}/`），不写任何承诺时间表。
- ac-workflow-default-tag: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.7'`，`docs/release-process.md` 中出现 `default: 'v0.2.7'`；两处均不再以 `'v0.2.6'` 作为默认值。
- ac-readme-decoupled: `src/main/release-packaging.test.ts` 中所有「README 第 5 行 / README 状态行」断言以 `latestPublishedTag` 为准，`expect(latestPublishedTag).toBe(currentTag)` 已移除；`currentTag` 仍单独断言 `package.json` / `CHANGELOG` / `docs/release-notes/${currentTag}.md` / workflow 默认 tag / release-process 默认 tag。
- ac-latest-published-invariant: 测试新增断言 `publishedTags` 包含 `latestPublishedTag`，且 semver 比较 `latestPublishedTag < currentTag`；`docs/release-notes/${latestPublishedTag}.md` 存在且 H1 含 `latestPublishedTag`，与 `currentTag` 的 notes 路径不同（允许领先一版未发布）。
- ac-readme-untouched: `git diff` 对 `README.md` / `README.zh-CN.md` 为空；两版第 5 行仍含 `v0.2.6` 与 `releases/tag/v0.2.6`，两版全文均不含 `v0.2.7`。
- ac-preserved-assertions: 既有断言仍通过：9 节中英镜像、英文词数 ≤ 700、首屏 2 枚徽章、真实截图 PNG、README 内 secret / team id / 本机路径 0 命中、禁 `pendingWord`、README 不含 `v0.2.7`。
- ac-release-process-note: `docs/release-process.md` 含新增说明：README 的 latest release 行指向已发布版本、版本收敛不改该行；发布完成后由一次一行提交同步该行与测试常量。
- ac-code-gates: 本工作树 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 全绿（按 `.munk/code-gates.json` 命令原样执行）。
- ac-no-release-side-effects: 无新增 git tag（最新仍为 `v0.2.6`）；未改已公开 tag / Release / 资产；未 push / publish；`.munk/code-gates.json` 无 diff。

## 非目标

- 不改 `README.md` / `README.zh-CN.md` 任何内容（第 5 行继续 `v0.2.6`，全文不得出现 `v0.2.7`）。
- 不改 `src/` 业务代码、不改 i18n 文案与词典、不重构 UI。
- 不改发布工作流步骤、门禁命令、发布模型与三平台构建逻辑（只改默认 tag 值）。
- 不跑性能 / 内存采样、不引入新依赖、不跑长跑；不新增 `docs/release-evidence/v0.2.7.md`（无发布事实可写）。
- 不打 tag、不 push、不 publish、不改已公开 tag / Release / 资产。
- 不改 `.munk/code-gates.json`；不做顺手优化或无关文案润色。

## 实现约束

- 版本锚点语义（公司裁决）：README 第 5 行是「已发布事实」，`package.json` / `CHANGELOG` / release notes / workflow 默认 tag / release-process 默认 tag 是「当前收敛版本」，允许领先一版。测试注释需写明：发布完成且 L1 通过后，由收尾提交同时改两版第 5 行与 `latestPublishedTag` 常量。
- `src/main/release-packaging.test.ts` 需同步的最小改动清单（均已定位，避免误伤其它断言）：
  - 约 565 行：删除 `expect(latestPublishedTag).toBe(currentTag)`；README 第 5 行断言改 `latestPublishedTag`；新增 `publishedTags` 归属 + semver `<` 断言。
  - 约 1034 / 1036 行与 1396 / 1400 / 1405 / 1409 行、1515 / 1516 行、1801 行：README 状态行断言由 `currentTag` 改 `latestPublishedTag`；1423 行版本表断言同步改 `latestPublishedTag`。
  - 约 1274 行：`expect(lastReleasedNotesPath).toBe(releaseNotesPath)` 解耦为「`latestPublishedTag` notes 存在且 H1 命中」+「`currentTag` notes 存在且 H1 命中」+ 两者路径不同。
  - 约 1094–1096 行、1007–1008 行、1261 行：`docs/release-signing.md` 的「当前状态 / 发布姿态 / notes 路径 / 由 X 承接」断言改锚 `latestPublishedTag`（文档仍只陈述 `v0.2.6` 已发布事实）。
  - 约 1136 / 1202 行及 1208 行：CHANGELOG 当前段的切片边界由 `previousPublishedTag`（v0.2.5）改为 `latestPublishedTag`（v0.2.6），否则会把 v0.2.6 段并入当前段；1134 行「Windows 修复」块整体改锚 `v0.2.6`，并为 `v0.2.7` 段新增内容断言。
  - 约 1303 行：「current release notes 的 Windows 修复」块改读 `lastReleasedNotes`（v0.2.6）；为 `v0.2.7` notes 新增独立断言（双语 + README 9 节 + 无数字/无承诺）。
  - 1381 行 `allowed = [...publishedTags, currentTag]` 保留（允许文档引用当前未发布 tag）；`expect(readmeEn/Zh).not.toContain('v0.2.7')` 保留。
- `docs/release-signing.md` 只允许改第五节「补发默认值」一行（`默认 v0.2.6` → `默认 v0.2.7`，与 workflow 默认值同源）；其已发布事实、证据、姿态、承接行一律不动。
- 发布说明与 CHANGELOG 只写 `v0.2.6..main` 中用户可见的两类变化；合并提交 / 测试 / 内部重构 / 域 fold 不单列，不编造数字、commit SHA、CI run id 或时间表。
- 不改 `.github/workflows/release.yml` 中除 `default: 'v0.2.6'` 以外的任何内容；不调整 job、门禁、矩阵、上传与 finalize 逻辑。
