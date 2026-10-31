# v0.2.14 版本收敛与双语发布说明收口

## 范围

在隔离 worktree（`HEAD = b8689db`，`package.json#version = 0.2.13`，工作区干净）内，把发布面同源收敛到 **v0.2.14**，只动发布面：不改产品代码、不改历史、不发布。

1. **`package.json`**：仅 `version` 由 `0.2.13` 改为 `0.2.14`，其余字节不动。
2. **`CHANGELOG.md`**：把现有 `## v0.2.13` 段整段改写成 `## v0.2.14`（标题 / 导语 / `### 改进` / `### 不做的事` / `### 升级方式` 全部改到 v0.2.14 口径），内容 = **已合入的 v0.2.13 事实** + **写项 A 的可见变化**；不留任何未发布版本段；`## v0.2.12` 起至文件尾逐字不动。
   - 保留的 v0.2.13 事实：P1④ 语义定位收尾（单侧新增 / 删除时缺失侧落到最近共同祖先并叠加 `opacity-60` 弱化高亮，精确行不回退）；结构化语义门默认矩阵 9→10（`structured` / `semantic`）。
   - 写项 A 的用户可见事实（取自已合入 `main` 的 `8e19edb` 与 `b8689db`，不臆造）：顶栏常驻动作只剩「新建对比 / 打开文件 / 打开文件夹 / 设置」，移除「演示样本」按钮与下拉、移除品牌副标题；目录工作流工具栏移除「加载演示目录」与「演示：远端快照」；空态只剩 3 个真实 CTA（新建对比 / 打开文件 / 打开文件夹），hint 指向「设置 → 示例与调试」；设置新增「示例与调试」分区，承载 5 类示例（目录 / 代码 3-way / CSV / JSON-YAML / 远端快照）并复用既有加载路径；顶栏 scene 分段控件（视图切换）退场，scene 由打开的文件夹 / 文件类型决定，切换会话改由会话 tab，tab 按 scene 显示类型图标；壳层入口清单 20 → 18。
3. **双语发布说明改名 + 改写**：新增 `docs/release-notes/v0.2.14.md` 与 `docs/release-notes/v0.2.14.zh-CN.md`，删除旧名 `docs/release-notes/v0.2.13.md` 与 `v0.2.13.zh-CN.md`。沿用现行结构：H1 → 顶部互链 → 概述 → 英文 `## What changed` / 中文 `## 本次变化`（含 A 分节 + P1 语义定位 + 结构化语义门）→ `## Not in this release` / `## 不做的事` → `## Risk and verification scope` / `## 风险与验证规模` → `## Upgrade` / `## 升级方式`。顶部互链指向新文件名。英文正文加一行 `v0.2.13 was never published; its contents ship in this release.`，中文加 `0.2.13 未公开，其内容并入本版`。无 `**Full Changelog**`、无 `releases/tag/` 链接。
4. **`docs/release-signing.md`**（仅 3 增 3 删，全在姿态段）：`## 三、正式版发布姿态（v0.2.13）` → `v0.2.14`；第五节补发句两处 `v0.2.13` → `v0.2.14`；末尾收敛句改 `v0.2.14` 的版本收敛 + `docs/release-notes/v0.2.14.md`，并保留「最新公开 Release 仍为 v0.2.12」。
5. **`docs/release-process.md`**：仅第 8 行默认 tag 摘录 `default: 'v0.2.13'` → `default: 'v0.2.14'`。
6. **`.github/workflows/release.yml`**：仅 `workflow_dispatch.inputs.tag.default` 改 `v0.2.14`，其余字节不动。
7. **`src/main/release-packaging.test.ts`**：派生锚点同源对齐 + **只增**断言（见验收 `ac-test-*`）。`latestPublishedTag` 仍 `'v0.2.12'`、`previousPublishedTag` 仍 `'v0.2.8'`、`publishedTags` 不动；`currentTag` 继续由 `package.json` 派生（= `v0.2.14`）；三处 `changelog.slice` 结束端点保持显式 `## v0.2.12`（防空串假绿）。

## 验收

- ac-version-single-source: `package.json#version === "0.2.14"`，且 `git diff --numstat -- package.json` 恰为 `1	1`，diff 唯一变更行为 `"version"`。
- ac-changelog-first-two-headings: `CHANGELOG.md` 按出现顺序的前两个 `^## v\d+\.\d+\.\d+` 标题恰为 `## v0.2.14`、`## v0.2.12`。
- ac-changelog-no-unpublished-segment: `CHANGELOG.md` 全文不存在 `^## v0.2.13` 标题行（断言用运行时拼接的 tag 字面，避免自匹配）。
- ac-changelog-history-bytes: 从 `## v0.2.12` 行首到文件末尾的字节与 `git show HEAD:CHANGELOG.md` 同区间逐字节相等（`git diff` 在该区间零 hunk、零删除）。
- ac-changelog-current-entry-structure: `## v0.2.14` 段（到 `## v0.2.12` 之前）内 `^## ` 标题集合恰为 `['v0.2.14']`，且含 `### 改进`、`### 不做的事`、`### 升级方式` 三个小节。
- ac-changelog-covers-a: 同一段内含 `顶栏`、`示例与调试`、`空态`、`scene`、`会话 tab` 五个事实 token。
- ac-changelog-keeps-013-facts: 同一段内含 `P1`、`opacity-60`、`structured`、`semantic`、`9→10`、`共同祖先`。
- ac-changelog-banned-tokens: 同一段内 `200,000`、`10 MB`、`本版新增`、`待验证`、`预计通过`、`应该通过`、`TODO`、`TBD`、`FIXME` 全 0 命中；`/[0-9a-f]{40,64}/` 0 命中；`/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g` 为空数组。
- ac-notes-renamed-pair: `docs/release-notes/v0.2.14.md` 与 `docs/release-notes/v0.2.14.zh-CN.md` 均存在、非空，首个 H1 分别含 `v0.2.14`；`docs/release-notes/v0.2.13.md` 与 `docs/release-notes/v0.2.13.zh-CN.md` 均不存在。
- ac-notes-mutual-links: 英文版含 `./v0.2.14.zh-CN.md`，中文版含 `./v0.2.14.md`（各 1 条，路径与对方文件名一致）。
- ac-notes-section-order: 英文版 `## ` 四节 `What changed` → `Not in this release` → `Risk and verification scope` → `Upgrade` 顺序出现且各恰 1 次；中文版 `本次变化` → `不做的事` → `风险与验证规模` → `升级方式` 同式。
- ac-notes-013-never-published: 英文版正文含 `v0.2.13 was never published`，中文版正文含 `0.2.13 未公开，其内容并入本版`。
- ac-notes-covers-a: 中文版含 `顶栏`、`示例与调试`、`空态`、`scene`、`会话 tab`；英文版大小写不敏感地含 `top bar`、`Samples & debugging`、`empty state`、`scene`、`session tab`。
- ac-notes-keeps-013-facts: 英文版与中文版均含 `opacity-60`、`structured`、`semantic`、`9→10`；英文版另含 `ancestor`，中文版另含 `共同祖先`。
- ac-notes-banned-tokens: 两版均不含 `已发布`、`已修复`、`已通过 L1`、`**Full Changelog**`、`releases/tag/`、`TODO` / `TBD` / `FIXME`，且不含 40–64 位十六进制串。
- ac-readme-frozen: `git diff --stat -- README.md README.zh-CN.md` 为空；两版第 5 行仍指向 `v0.2.12`（`releases/tag/` 各恰 1 次且为 `releases/tag/v0.2.12`）；两版仍不含 `| Version |` / `| 版本 |` 版本表。
- ac-signing-posture: `docs/release-signing.md` 含 `## 三、正式版发布姿态（v0.2.14）`、第五节 `默认 \`v0.2.14\``，且末尾收敛句同时含 `v0.2.14`、`docs/release-notes/v0.2.14.md` 与 `最新公开 Release 仍为 v0.2.12`。
- ac-signing-published-frozen: 同文件仍含 `当前状态：v0.2.12 已发布`、`docs/release-notes/v0.2.12.md`、`docs/release-evidence/v0.2.12.md`；该文件 `git diff --numstat` 恰为 `3	3`，全文不含 `0.2.13`。
- ac-release-yml-default-only: 解析 `workflow_dispatch.inputs.tag.default === 'v0.2.14'`；该文件 `git diff --numstat` 恰为 `1	1` 且改动行即该默认值（`--notes-file`、祖先门、签名检查、打包矩阵、单 Release 门零 diff）。
- ac-release-process-default: `docs/release-process.md` 含 `default: 'v0.2.14'`；该文件 `git diff --numstat` 恰为 `1	1`，改动行即第 8 行 dispatch 默认值摘录。
- ac-test-prelaunch-anchor: `latestPublishedTag === 'v0.2.12'`、`previousPublishedTag === 'v0.2.8'`、`publishedTags` 不含 `v0.2.13`；版本门用例仍保留 `expect(latestPublishedTag).not.toBe(currentTag)`、`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)`、`expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)`，`currentTag` 仍由 `package.json#version` 派生。
- ac-test-additive-only: `src/main/release-packaging.test.ts` 的 `  it(` 计数 `>= 203` 且 `expect(` 计数 `>= 876`，两者均严格大于该基线；无删除的 `describe` / `it`，无新增 `skip` / `only` / `todo`，无 `not.toContain` 放宽、无白名单扩容。
- ac-test-013-absence: 新增断言覆盖：`CHANGELOG` 无 `## v0.2.13`；`docs/release-notes/v0.2.13.md`、`v0.2.13.zh-CN.md`、`docs/release-evidence/v0.2.13.md` 均不存在；`documentPaths()` 扫描结果中无任何文件含 `docs/release-notes/v0.2.13.md` 或 `releases/tag/v0.2.13`（offenders 为空数组）。全部 tag 字面运行时拼接。
- ac-test-ghost-history-kept: 既有 `ghostTag = ['v0.2', '3'].join('.')` 常量与其全部既有断言逐字保留（`## v0.2.4` 段仍含 `${ghostTag} 已合入但未发布`），未被改名、删除或替换。
- ac-no-product-code: `git status --porcelain` 中 `src/` 仅 `src/main/release-packaging.test.ts`；`src/renderer/**`、`src/core/**`、`src/preload/**`、`src/shared/**`、`src/main/**` 其余文件零 diff。
- ac-evidence-frozen: `docs/release-evidence/**` 零 diff；`docs/release-evidence/v0.2.14.md` 不存在。
- ac-gates-10-green: 本 worktree 内 10 门（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics`）全部 exit 0。
- ac-delivery-report: 交付说明逐条列出改动文件、每处测试锚点改动理由、`it(` / `expect(` 改动前后计数、未纳入项（含 README 版本表与 `本版发布说明见 v0.2.12` 行）、`git diff --stat`。

## 非目标

- 不改任何产品代码 / UI 行为 / 算法 / 快照格式 / 导出格式。
- 不改两版 README（零 diff）：main 上版本表早已移除，**不新建版本表**，第 5 行仍 `v0.2.12`，不做发布态前移。
- 不改 `docs/release-signing.md` 的第 5 行「当前状态」、各已发布历史条目、`本版发布说明见 \`docs/release-notes/v0.2.12.md\`` 行、第四节 v0.1.2 漂移事实（沿用 v0.2.13 收敛轮口径：该行钉 `latestPublishedTag`）。
- 不改 `docs/release-notes/v0.2.12.md` 及更早历史 notes、`docs/release-evidence/**`、`docs/lessons.md`、`docs/ui-phase1-reference-audit.md`。
- 不新建 `docs/release-evidence/v0.2.14.md`（发版成功后的收尾轮才归档）。
- 不改已公开 tag / Release / 资产；不 push、不打 tag、不 dispatch、不 publish。
- 不改 `.munk/code-gates.json`（保持 10 门）。
- 不做浏览器 / 真机 / 桌面点选验收；`needSelfTest=false`，回归面全部落在 `code_gates`。

## 实现约束

- **基线自检**：`git rev-parse HEAD` = `b8689db`、`package.json#version === "0.2.13"`、`docs/release-notes/v0.2.13.md` 与 `.zh-CN.md` 存在、`.munk/code-gates.json` 为 10 门。主检出工作树是脏的（索引回退到 v0.2.9 时代），禁止在主检出读业务文件或跑门禁，一律在本 worktree 内完成。
- **测试基线计数**：改动前 `grep -c '  it('` = 203、`grep -c 'expect('` = 876；三处 `changelog.slice(...)` 结束端点已是显式 `changelog.indexOf('## v0.2.12')`（约在 1305 / 1452 / 1531 / 1543 行），保持显式，不得改回派生锚。
- **CHANGELOG 形状**：段内小节沿用 `### 改进` / `### 不做的事` / `### 升级方式`；A 的条目放「改进」；升级方式写「建议从 v0.2.12 升级」。
- **版本字面纪律**：版本字面只允许出现在文档标题 / 文件名 / 既有锚点位置；测试里 `0.2.14` 只出现在必要断言，`0.2.13` 的负向断言必须运行时拼接。
- **新增负向断言不得自匹配**：`CHANGELOG` / `docs` 的 0.2.13 缺席断言必须由拼接的 tag 字面构造，禁止把 `v0.2.13` 写成会被自己匹配的正则源。
- **文案红线**：禁写未实测性能 / 内存数字、「已发布 / 已修复 / 已通过 L1」、`TODO` / `TBD` / `FIXME`、40 位 sha；一律按「未发布」口径写作；历史条目与历史 notes 不改。
- **交付**：门禁全绿后经 delivery 合入 `main`（local merge）；断言只增不减，任何门红都不得以降级 / 删除断言换取绿灯。
