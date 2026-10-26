# README 双版入口更名 + 测试断言同步

## 范围

把两版 README 第 8 节「平替入口」与 `src/main/release-packaging.test.ts` 中硬编码旧 slug 的断言，从 **Kill Paid Apps** 迁到 **Open Rebuilds**，并改为绝对直链 `https://github.com/munk-sh/open-rebuilds`。

### 1. README.md（英文默认版）

- 第 8 个 H2：`## Kill Paid Apps 001` → `## Open Rebuilds 001`
- 正文整句逐字替换为：
  `OpenCompare is a free MIT alternative to Beyond Compare 5 Pro, tracked as alternative 001 in [Open Rebuilds](https://github.com/munk-sh/open-rebuilds).`

### 2. README.zh-CN.md（中文镜像）

- 第 8 个 H2：`## Kill Paid Apps 001 平替` → `## Open Rebuilds 001 平替`
- 正文整句逐字替换为：
  `OpenCompare 是 Beyond Compare 5 Pro 的免费 MIT 平替，收录为 [Open Rebuilds](https://github.com/munk-sh/open-rebuilds) 系列第 001 号项目。`

### 3. `src/main/release-packaging.test.ts`（唯一允许改的 `src/**` 文件）

已核实的 4 处旧断言，全部改指新名 / 新 URL，**不得删除或放宽**：

1. `it('ships exactly nine mirrored H2 sections in both versions')` 的两张 H2 期望表：EN 第 8 项 `Kill Paid Apps 001`、ZH 第 8 项 `Kill Paid Apps 001 平替` → 新标题（顺序与其余 8 项不变）。
2. `it('indexes the docs and performance evidence in one line each')` 中 `readmeSection` 的下一节边界标题（EN / ZH 各一处）→ 新标题，否则 Evidence 节截取会失效。
3. `it('links the Kill Paid Apps 001 alternative in both READMEs')`：`it` 名称与 URL 断言 → 新名 + `https://github.com/munk-sh/open-rebuilds`；`001` / `Beyond Compare 5 Pro` 断言保留。
4. `it('keeps only the published tag and shared project facts in both READMEs')`：共享事实中的 URL 断言 → 新 URL。

### 4. 全仓对外引用清理

已核实 `git grep -n -i -E "kill-paid-app|kill paid apps"` 命中面仅：`README.md`、`README.zh-CN.md`、`CHANGELOG.md`、`docs/release-notes/v0.2.7.md`、`src/main/release-packaging.test.ts`、`.munk/**`。前二者与测试在范围内；其余按「非目标」原样保留。交付说明需列出所用 grep 命令、输出摘要与显式排除清单。

## 验收

- ac-readme-en-section: `README.md` 第 8 个 `## ` 标题等于 `Open Rebuilds 001`，该节正文含定稿英文整句且 `https://github.com/munk-sh/open-rebuilds` 以 Markdown 绝对链接 `[Open Rebuilds](https://github.com/munk-sh/open-rebuilds)` 出现。
- ac-readme-zh-section: `README.zh-CN.md` 第 8 个 `## ` 标题等于 `Open Rebuilds 001 平替`，该节正文含定稿中文整句且同一绝对链接出现。
- ac-no-legacy-outward: `git grep -n -i -E "kill-paid-app|kill paid apps"` 在 `README.md`、`README.zh-CN.md`、`src/**` 上 0 命中；全部命中仅落在 `CHANGELOG.md`、`docs/release-notes/**`、`.munk/**`。
- ac-readme-en-structure: `README.md` 仍恰好 9 个 `## `，第 1–7、9 项标题与改动前逐字相同，第 3 行语言互链、第 5 行单行版本指针内容不变，英文正文词数 ≤700。
- ac-readme-zh-structure: `README.zh-CN.md` 仍恰好 9 个 `## `，第 1–7、9 项标题与改动前逐字相同，第 3 行语言互链不变。
- ac-test-h2-tables: 跑 `pnpm test src/main/release-packaging.test.ts`，H2 期望表断言通过，EN / ZH 第 8 项分别为 `Open Rebuilds 001` / `Open Rebuilds 001 平替`。
- ac-test-evidence-boundary: Evidence 节截取的下一节边界断言通过（EN `## Open Rebuilds 001`、ZH `## Open Rebuilds 001 平替`），且该节仍断言到 `docs/release-process.md`、`docs/release-signing.md`、`docs/symlink-no-follow.md`、`docs/perf/large-directory-memory.md`。
- ac-test-new-url: 测试中对新 URL `https://github.com/munk-sh/open-rebuilds` 的断言在两版 README 上都成立；旧 URL `https://github.com/munk-sh/kill-paid-apps` 在 `src/**` 0 命中；断言条数不少于改动前（无 `toBeTruthy()` 降级、无删除）。
- ac-test-facts-kept: `001`、`Beyond Compare 5 Pro`、`latestPublishedTag`、第 5 行外无 `vX.Y.Z` 等既有共享事实断言仍通过。
- ac-gates: 本工作树 `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六项 code_gates 全绿。
- ac-diff-scope: `git diff --name-only` 仅含 `README.md`、`README.zh-CN.md`、`src/main/release-packaging.test.ts`（及 `.munk/changes/**`）；`package.json`、`CHANGELOG.md`、`docs/**`、`electron-builder.yml`、`.github/**` 零 diff。

## 非目标

- 不改 `CHANGELOG.md` 既有条目、`docs/release-notes/**`（含 `v0.2.7.md`）、`docs/release-evidence/**`、`docs/evidence/**`——历史记录保持原样。
- 不改 `.munk/**` 基线、变更账本、planning 草稿（非对外引用）。
- 不改两版 README 其余 8 个章节、徽章、截图引用、中英镜像结构、英文正文词数预算；不改第 5 行版本指针。
- 不改 `src/**` 业务代码（唯一例外是 `src/main/release-packaging.test.ts`）；不改 `package.json#version`、`electron-builder.yml`、`.github/**`。
- 不做旧 slug 301 / 重定向兼容层、不新建跳转页、不改 `munk-sh/kill-paid-apps` 或 `munk-sh/open-rebuilds` 仓库远端。
- 不打 tag、不 push、不发版、不打包、不跑真机 / 性能采样；不做 UI 自测。
- 不新增截图 / 徽章 / docs 站点 / SEO 文案；不改 `AGENTS.md`、`docs/repo-metadata.md`。

## 实现约束

- 定稿文案逐字落地，**不得改写、增删标点或换行**；两版 URL 一律写绝对直链 `https://github.com/munk-sh/open-rebuilds`，不依赖旧 slug 的 301。
- 测试只做「旧事实 → 新事实」的重定标：可以调整 `it` 名称措辞，但覆盖事实不得减少，不得放宽为 `toBeTruthy()`，不得只删断言。
- grep 排除边界以本 prd 为准：仅 `CHANGELOG.md`、`docs/release-notes/**`、`.munk/**` 属历史记录；若实测出现上述以外的命中，视为范围内需一并清理并在交付说明列出。
- 交付说明需给出改动文件清单、所用 grep 命令与输出摘要、排除清单、六项门禁结果。
