# Release 双语正文修复（fail-closed + 发布后 body 断言）

## Scope

修复「发布产物」这一环，而不是只加强仓内文件断言。改动面只有三处：

1. `.github/workflows/release.yml` 的 `Pre-create the tag's release`（`gates` job）：继续用 `version="$(node -p "require('./package.json').version")"` 派生版本，由它定位 `docs/release-notes/v${version}.md`（英文）与 `docs/release-notes/v${version}.zh-CN.md`（中文）两份 notes；任一缺失或去空白后为空一律 `exit 1`，且守卫位置必须早于任何 `gh release create` / `gh release edit`，不创建/更新 draft，不回退单语（不得用 `--generate-notes`）。
2. 同一个 `Pre-create` 步骤组装 body：英文全文 + 一行 `---` + `<details><summary>简体中文</summary>` + 中文全文 + `</details>`，末尾保留既有 `**Full Changelog**: .../compare/${last}...${RELEASE_TAG}` 行（顺序照旧）。body 唯一写入口仍是"create draft"与"draft-only edit"两处 `--notes-file`。
3. `.github/workflows/release.yml` 的 `finalize` job：在 `Make the tag's release public` 之后新增一步，用 `gh release view "${RELEASE_TAG}" --json body` 读取**已公开产物**的 body，断言中文折叠标记存在、且英文段与中文段各自的版本标识都是该 tag；缺失即 `exit 1`（job fail）。

配套的契约测试落在既有 `src/main/release-packaging.test.ts`（用 `yaml` 解析 workflow、按 step name 取 `run` 文本），只增不减。

仓库当前事实（基线 `main=3550b24`，本 worktree 干净）：`Pre-create` 只读英文 `v<version>.md` 单文件成 body；`finalize` 只校验唯一公开 Release、平台资产集合、`latest*.yml` 的 `files[].url` 与 latest 指针，从不读 body；`docs/release-notes/v0.2.14.md` 与 `v0.2.14.zh-CN.md` 均已存在且非空，但已公开的 v0.2.14 Release body 只有英文——该历史缺口不在本项修复范围内（见非目标）。

## Acceptance Criteria

### 工作流：Pre-create 双语组装 + 缺一 fail-closed

- ac-precreate-both-notes-paths: `Pre-create the tag's release` 的 `run` 文本同时出现英文 `docs/release-notes/v${version}.md` 与中文 `docs/release-notes/v${version}.zh-CN.md` 两条派生路径，且两者都由 `package.json#version` 派生（脚本内不得出现任何写死的版本字面量，如 `v0.2.14` / `v0.2.12`）。
- ac-fail-closed-missing-either: 英文 notes 缺失或中文 notes 缺失，任一种情况都命中断言 `[ ! -f ... ]` 守卫并以 `exit 1` 结束；两个守卫的起点都早于 `gh release create` 与 `gh release edit` 的位置，即缺失时不会创建/更新 draft。
- ac-fail-closed-blank-either: 任一份 notes 去空白后为空（含"英文非空、中文为空"与"中文非空、英文为空"两个分支）都以 `exit 1` 结束，且该守卫同样早于 `gh release create` / `gh release edit`；两条守卫各自带 `::error::` 文案，错误文案能区分是哪一份 notes（缺失 / 为空）。
- ac-body-composition-order: 组装出的 body 文件（`${RUNNER_TEMP}/release-body-${RELEASE_TAG}.md`）内容顺序为：英文全文 → 单独一行 `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → `**Full Changelog**` 行；其中英文段用 `cat "${notes_file}"`、中文段用 `cat` 中文笔记文件，`<details>` 与 `</details>` 各出现且不嵌套。
- ac-no-single-language-fallback: 脚本不出现 `--generate-notes`，`--notes-file` 出现次数仍为 2（仅 create 与 draft-only edit），且"已公开 Release 不改 body"的分支文案仍在；不存在"仅英文"或"仅中文"的降级写入路径。
- ac-version-follows-package: 组装的版本来源是 `package.json#version` 派生值，未来只改 `package.json` 时 `Pre-create` 自动跟随（测试对 `currentVersion` 之外不出现写死的具体版本路径）。

### 契约测试：新增三类断言，只增不减

- ac-test-both-paths: `release-packaging.test.ts` 的 `release body from repository notes` 相关用例中出现断言：`Pre-create` 同时包含两份 notes 的版本化路径（英文与 `.zh-CN`）。
- ac-test-missing-guard: 新增断言覆盖"缺任一语言即 fail-closed"：两条缺失守卫 + 两条空守卫存在、`exit 1` 落在守卫与 `gh release create`/`gh release edit` 之间、且中文那份的守卫也被覆盖（不能只断言英文）。
- ac-test-zh-details-marker: 新增断言覆盖中文折叠标记：`Pre-create` 脚本含 `<details>`、`简体中文`、`</details>` 三个可定位片段，并断言其相对顺序与 body 组装顺序一致。
- ac-existing-assertions-intact: 既有发布正文断言（`derives the notes version from package.json`、`reads the release body from ...md`、`fails closed when the notes file is missing or blank`、`appends a Full Changelog line`、`only writes the body into a draft release`、`keeps the finalize step body-free`）全部保留且未被放宽/删除；新增断言以追加用例或追加 `expect` 的方式加入。

### 工作流：finalize 发布后 body 断言

- ac-finalize-post-publish-position: `finalize` 中新增的 body 断言步骤位于 `Make the tag's release public` 之后，且既有步骤 `Verify the tag has exactly one public release`、`Assert the public release has every platform asset`、`Assert latest*.yml urls match the release assets`、`Assert the tag is the latest published release` 仍在 `finalize` 中存在并按原有相对顺序排列。
- ac-finalize-reads-published-body: 新增步骤通过 `gh release view "${RELEASE_TAG}" ... --json body`（或等价的只读读取已公开 Release 的命令）取得 public body，不读取仓内 notes 文件、不改写 Release；脚本内无 `gh release edit|create|delete`、无 `--method POST|PATCH|PUT|DELETE`。
- ac-finalize-zh-marker-gate: 该步骤断言已发布 body 含中文折叠标记（`<details>` + `简体中文` 与 `</details>`），缺失时输出 `::error::` 并 `exit 1`。
- ac-finalize-per-segment-version-gate: 该步骤把 body 按中文折叠块切成英文段与中文段，分别断言两段各自的版本标识等于 `${RELEASE_TAG}`（即段内出现该 tag 的版本号）；不得只断言"body 中 tag 出现一次"，也不得靠 `**Full Changelog**` 链接里的 tag 满足该断言。任一段版本标识不符 → `exit 1`。
- ac-finalize-gate-testable: 该断言步骤在 `release-packaging.test.ts` 中可按稳定 step name 用 `finalizeStep(...)` 定位，并断言其 `run` 文本含 `--json body`、中文折叠标记、`exit 1` 与按段版本校验（三段式：缺中文标记 → exit 1；英文段版本不符 → exit 1；中文段版本不符 → exit 1 均有可定位的 `::error::` 分支）。

### 边界与门禁

- ac-published-v0214-untouched: `git status` / `git diff` 中不出现 `docs/release-notes/v0.2.14.md`、`docs/release-notes/v0.2.14.zh-CN.md`、`CHANGELOG.md` 的改动；工作流不新增任何针对已公开 tag 的 `gh release edit`/`delete`；不补写 0.2.14 中文正文。
- ac-release-channel-bytes-stable: 除 `Pre-create the tag's release` 与 `finalize` 新增步骤外，`release.yml` 的其余步骤（notes-file 挂载位置、macOS 签名/公证 guard、矩阵 `target`、资产上传、`latest*.yml` 校验）字节内容不变。
- ac-product-source-untouched: `src/core/**`、`src/renderer/**`、`src/main/**`（`release-packaging.test.ts` 除外）与 `src/shared/**` 零改动；本项不新增依赖。
- ac-gates-green: Host 注入的全量 `code_gates`（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics`）全部通过，无 `|| true` 等逃逸。

## Non-Goals

- 不改已公开的 `v0.2.14` tag / Release / 资产；不补写 0.2.14 的中文 body；不重新发版，不为 `v0.2.13` 建任何 notes / 证据 / tag。
- 不做子项 2 的收尾：不改两版 README 第 5 行、不把 `release-packaging.test.ts` 的 `latestPublishedTag` 从 `v0.2.12` 翻到 `v0.2.14`、不新建 `docs/release-evidence/v0.2.14.md`。
- 不改发布通道其余口径：notes-file 挂载方式、macOS 签名/公证、构建矩阵、资产命名与 `latest*.yml` 校验逻辑。
- 不改产品源码与 UI（工作台打开/导入、对比、保存/导出、多视图切换、拖拽与快捷键行为零变化），不改 `src/core` 算法与 `platform` 契约。
- 不改 CHANGELOG 与历史发布说明；不扩写文档体系（仅当 `docs/release-process.md` 有直接与双语 body 冲突的陈述时做最小事实性修正）。
- 不 push、不打 tag、不 `workflow_dispatch`、不触发真实发布；不在主检出（脏树）上改动或 commit。

## Implementation Constraints

- 一切读写都在本隔离 worktree 内、从 `main=3550b24` 开始；主检出的 staged 旧快照不得手改、不得 commit、不得当作验证对象。
- workflow 逻辑保持内联 shell（`gates`/`finalize` job 无仓库依赖检出约束），不引入新 npm 依赖；不把 body 组装搬到仓库脚本里（`finalize` 无 checkout）。
- 测试按现有风格组织：用 `yaml` 解析 `release.yml`，通过 `gateStep("Pre-create the tag's release")` / `finalizeStep("<新步骤名>")` 取 `run` 原文做字符串/位置断言；新增用例可放在既有 `describe('release body from repository notes')` 内或新增同级 `describe`，但既有用例必须原样保留。
- 新断言必须在版本 bump 后自动跟随：期望值从 `currentVersion` / `currentTag` 派生，不写死 0.2.14。
- 发布后 body 断言的步骤名需稳定且语义明确（供 `finalizeStep` 定位），并在这条 `run` 内使用 `set -euo pipefail` 与显式 `exit 1`，与既有 finalize 步骤风格一致。
- 双语版本标识的判定不得依赖 `**Full Changelog**` 链接（那行天然含 tag），必须在中英两段各自判一次。
