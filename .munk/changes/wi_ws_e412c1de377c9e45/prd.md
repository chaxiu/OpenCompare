# v0.2.9 单提交版本收敛：版本号、发布姿态断言、发布说明与默认 tag 同批对齐

## 范围

按 `overview.md` 的版本唯一来源模型做一次原子收敛，改动**只落在一个 commit** 内，供批次任务随后直接打 `v0.2.9` tag：

1. `package.json` 的 `version` 字段由 `0.2.8` 改为 `0.2.9`（依赖 / 脚本 / 其它字段不动）。
2. `src/main/release-packaging.test.ts` 里仍假设 latest === current 的派生断言翻成「latest 落后 current」，并把因插入 `## v0.2.8` 条目而横跨两版的 CHANGELOG 切片重新锚定到已发布条目（细节见「实现约束」的 A 节）。
3. `CHANGELOG.md` 顶部新增 `## v0.2.9` 段，覆盖本窗口已合入 `main` 的用户可见变化与报告上限/截断口径。
4. 新增 `docs/release-notes/v0.2.9.md`（被 `currentTag` 派生断言读取的发布说明）。
5. `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 改为 `'v0.2.9'`；`docs/release-process.md` 的 `default: 'v0.2.8'` 摘录与 `docs/release-signing.md` 第五节的默认 tag 同步改为 `v0.2.9`。

## 验收

- ac-version-029: `package.json#version` 恰为 `0.2.9`；`package.json` 的 diff 只有这一行变化（`dependencies` / `devDependencies` / `scripts` 零改动）。
- ac-no-new-literals: `src/main/release-packaging.test.ts` 中 `0.2.9` 字面量出现次数为 0；所有断言仍经 `currentTag` / `latestPublishedTag` 派生（`grep -c '0\.2\.9' src/main/release-packaging.test.ts` 为 0）。
- ac-latest-trails-current: `release version gate` 中 `latestPublishedTag` 仍为 `v0.2.8` 且 `latestPublishedTag !== currentTag`、`isTagBefore(latestPublishedTag, currentTag) === true`；原 `expect(latestPublishedTag).toBe(currentTag)` 已删除。
- ac-notes-anchors-distinct: `anchors the newest published release notes at the shipped tag` 中 `lastReleasedNotesPath !== releaseNotesPath`，两份文件均存在且首个标题分别含 `v0.2.8` / `currentTag`；原 `toBe` 断言已翻成 `not.toBe` + latest 落后 current。
- ac-changelog-v028-reanchored: `documents the HTML report export ...` 的切片起点为 `## ${latestPublishedTag}`、终点为 `## v0.2.7`，切片内 `MB` 数字集合恰为 `['10 MB']`，且仍含 `latestPublishedTag` 字样与 `https://github.com/munk-sh/open-rebuilds`。
- ac-changelog-v029-top-entry: `CHANGELOG.md` 中新出现 `## ${currentTag}` 段，位置先于 `## ${latestPublishedTag}`、`## v0.2.7`；`[## ${currentTag}, ## ${latestPublishedTag})` 切片的二级标题集合恰为 `[currentTag]`（非空、无幽灵版本、无重复条目）。
- ac-changelog-order-pinned: CHANGELOG 排序断言同时钉住 `currentTag > latestPublishedTag > v0.2.7 > v0.2.6 > v0.2.5 > v0.2.4 > v0.2.2 > v0.2.0 > v0.1.2` 的索引递增。
- ac-changelog-v029-content: `[## ${currentTag}, ## ${latestPublishedTag})` 切片同时出现四类变化的关键词：HTML 报告异步导出（`导出` + `取消`）、会话 tab 文案派生（`标签页` + `标题`）、保存原子化（`原子` + `磁盘空间不足`/`只读`）、报告上限口径（`200,000` + `10 MB`），以及 `### 升级方式`。
- ac-changelog-no-ghost: 全仓仍无 `## v0.2.3` 标题，且任何文档不含 `docs/release-notes/v0.2.3.md` 或 `releases/tag/v0.2.3` 链接。
- ac-release-notes-029-content: `docs/release-notes/v0.2.9.md` 存在、首个标题含 `currentTag`，且同时含 `HTML`、`自包含`、`内联 CSS`、`无 JS`、`无外链`、`http(s)`、`file://`、`隐藏本机路径`、`200,000`、`10 MB`、`四态计数`、`<html lang>`、`Open Rebuilds`、`https://github.com/munk-sh/open-rebuilds`、`升级方式`、`v0.2.8`。
- ac-release-notes-029-hygiene: 该文件不含 `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME` / 64 位 hex；`MB` 数字集合恰为 `['10 MB']`，且不出现 `MiB` / `GiB` / `GB`。
- ac-caps-restated-not-new: 两份新文案中提及 `200,000` / `10 MB` 的段落必须同时含 `沿用` 与 `v0.2.8`，且该段落不含 `本版新增`（报告上限是 v0.2.8 起的既有口径，只能重述）。
- ac-dispatch-defaults: `release.yml` 的 dispatch 块、`docs/release-process.md`、`docs/release-signing.md` 三处均含 `default`/`默认` 的 `v0.2.9`（测试统一用 `default: '${currentTag}'` 与 `默认 \`${currentTag}\`` 断言）；仓库内 `default: 'v0.2.8'` 出现次数为 0。
- ac-signing-posture-kept: `docs/release-signing.md` 仍含 `当前状态：v0.2.8 已发布`、`正式版发布姿态（v0.2.8）`、`docs/release-notes/v0.2.8.md`、`docs/release-evidence/v0.2.8.md`；新增一句说明 v0.2.9 收敛已合入 `main`、发布说明在 `docs/release-notes/v0.2.9.md`，且全篇不含 `待发布`。
- ac-readme-untouched: `README.md` / `README.zh-CN.md` 第 5 行仍为 `v0.2.8`，`git diff --name-only` 不含任何 README；两版 README 全文零改动。
- ac-scope-closed: `git diff --name-only` ⊆ {`package.json`, `CHANGELOG.md`, `docs/release-notes/v0.2.9.md`, `docs/release-process.md`, `docs/release-signing.md`, `.github/workflows/release.yml`, `src/main/release-packaging.test.ts`}；`docs/release-evidence/**` 与 `src/` 其它文件零改动。
- ac-six-gates-green: `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 六项 gate 依次全绿。
- ac-extra-gates-not-red: `test-compare-request` / `cancel-gate` / `memory-gate` 三项附加 gate 不得变红。

## 非目标

- 不建 tag、不 push、不 publish、不创建 / 编辑 GitHub Release、不动已公开 tag 与资产。
- 不做实机验收（浏览器 / 真机 / 桌面点选 / 安装包冒烟）。
- 不改 `src/` 任何业务代码与其它测试；不改 `package.json` 依赖、脚本与其它字段。
- 不改两版 README（第 5 行本来就已是 `v0.2.8`，本集整份不动），不改 `docs/release-evidence/**`。
- 不新增第二份版本真源（不新建版本常量；`src/shared/appVersion.ts` 已从 `package.json` 派生，保持不动）。
- 不把 latest 提前指向 `v0.2.9`，不让 README 指向 `v0.2.9`（那是发布后收尾提交的事）。
- 不重写 / 重构 `release-packaging.test.ts` 的其它段落，只做「姿态翻面 + 切片重锚 + 少量派生断言补充」。
- 不在文档中写仓库内性能用例的具体耗时 / 内存数字，不写未合并的 Issue #5 其它条目，不写尚未打 tag 的「已完成」承诺（不发 `CHANGELOG` / 说明之外的口头承诺）。
- 不扩改发布模型、签名凭据、打包矩阵与 dispatch 其它输入；`.github/workflows/release.yml` 只动默认值那一行。

## 实现约束

**A. `release-packaging.test.ts` 必须翻面 / 重锚的点（其余断言按原语义保留）：**

1. `release version gate`（约 L607）：`expect(latestPublishedTag).toBe(currentTag)` → `expect(latestPublishedTag).not.toBe(currentTag)` + `expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`；上方 `isTagBefore(previousPublishedTag, ...)` 两条保留。
2. `anchors the newest published release notes at the shipped tag`（约 L1393）：`expect(lastReleasedNotesPath).toBe(releaseNotesPath)` → `not.toBe` + 两者都存在且标题各自匹配。
3. `documents the HTML report export and the Open Rebuilds rename in the current entry`（约 L1219）：切片起点改 `changelog.indexOf(\`## ${latestPublishedTag}\`)`，终点仍 `## v0.2.7`；断言词表保留（含 `latestPublishedTag`、`10 MB` 唯一）。
4. `drops the never-published entry and adds no fake version heading`（约 L1316）：切片终点改 `changelog.indexOf(\`## ${latestPublishedTag}\`)`，使 `headings` 仍等于 `[currentTag]`。
5. `keeps the bilingual UI and the 9-section README in the v0.2.7 entry as history`：起点**当前已是** `## v0.2.7`，核对后无需改动，不要引入版本字面量。
6. 推荐（可做，词表自定、不得写死版本号）：新增派生断言，用 `[## ${currentTag}, ## ${latestPublishedTag})` 切片钉住 v0.2.9 段非空并覆盖四类变化（对应 ac-changelog-v029-content）；并把 `## ${latestPublishedTag}` 的索引补进排序断言（对应 ac-changelog-order-pinned）。
7. 新增 / 修改的断言一律不许出现 `0.2.9` 字面量；文案侧的具体版本号只出现在 `package.json`、`CHANGELOG.md`、`docs/release-notes/v0.2.9.md`、`docs/release-process.md`、`docs/release-signing.md`、`release.yml`。

**B. 文案口径：**

- v0.2.9 的用户可见变化只写已合入 `main` 的四类：目录对比 HTML 报告异步导出（进度 / 可取消 / 三种保存结果）、报告上限与截断口径（沿用 v0.2.8 既有口径，不得写成新增）、会话 tab 标题/副标题随会话事实实时派生、保存落盘原子化与可读写入错误。不写耗时/内存数字。
- `CHANGELOG.md` 保持 Keep a Changelog 风格与「本版是…」开场句；`docs/release-notes/v0.2.9.md` 沿用 v0.2.8 说明的章节骨架（`## 本次变化` / `### …` / `## 升级方式`）。
- 文档里的 release tag 链接只指向已发布 tag（`v0.2.0/1/2/4/5/6/7/8`）或 `currentTag`；不得出现 `v0.2.3` 的说明 / 证据 / 链接。
- 不得出现 `待发布`（README 与 `docs/release-signing.md` 均为测试明令禁止）；不得出现 64 位 hex 摘要与 `TODO/TBD/FIXME`。

**C. 工程约定：**

- 版本唯一来源：`package.json#version` → 测试 `currentTag` / 文档 `## ${currentTag}` / dispatch `default` / 两份发布文档摘录。`latestPublishedTag` 保持 `v0.2.8` 作为已发布事实不动。
- 本 Wi 的全部改动必须落在同一个 commit（交付时折叠，不拆多条 WI）。
- 写测试时加载 `.agents/skills/vitest/SKILL.md`；改 workflow 时加载 `.agents/skills/electron-dev/SKILL.md` 的发布 / CI 约定；不要引入新的 lint 例外。
- 提交前自查：`pnpm install && pnpm lint && pnpm typecheck && pnpm build && pnpm build:web && pnpm test`，外加 `pnpm test src/shared/compareRequest.test.ts`、`pnpm test:cancel`、`pnpm test:memory`。
