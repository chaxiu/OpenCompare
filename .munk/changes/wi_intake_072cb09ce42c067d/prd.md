# 发布收敛：v0.2.16 版本单点与双语发布说明

## 范围

把 `main`（基线 `f0e4589`，已含本轮两条修复）收敛成今晚 23:00 批次可直接打 `v0.2.16` 的发布态。**只做版本单点与发布说明，零产品行为改动**：不改 `src/**` 产品源码，不改任何测试判据口径，不推 tag、不 dispatch、不创建或修改 Release 与资产、不 cherry-pick，不动 `v0.2.15` 及更早的 tag / Release / 资产 / 证据。

本项只允许改以下文件：

1. `package.json`：`version` 由 `0.2.15` 改为 `0.2.16`。
2. `CHANGELOG.md`：在 `## v0.2.15` 之前新增 `## v0.2.16`，按 `git log v0.2.15..main` 的真实 commit 写用户可见变化。
3. 新建 `docs/release-notes/v0.2.16.md`（英文全文）与 `docs/release-notes/v0.2.16.zh-CN.md`（中文全文），两文件均非空。
4. `.github/workflows/release.yml`：`workflow_dispatch.inputs.tag.default` 由 `v0.2.15` 同步为 `v0.2.16`；不改 body 组装逻辑。
5. `docs/release-process.md`：`workflow_dispatch` 默认 tag 说明同步为 `v0.2.16`（现有测试按 `currentTag` 断言）。
6. `docs/release-signing.md`：仅同步版本语义单点——`正式版发布姿态（v0.2.16）`、本版发布说明指向 `docs/release-notes/v0.2.16.md`、补发默认 tag `v0.2.16` 与「v0.2.16 版本收敛已合入 main」；**保留**「当前状态：v0.2.15 已发布」及 `docs/release-notes/v0.2.15.md` / `docs/release-evidence/v0.2.15.md` 的已发布事实。
7. `src/main/release-packaging.test.ts`：版本锚点与两文件路径随 `package.json` 同步；保留缺一 fail-closed 与中文折叠标记断言。

**路径口径澄清**：需求原文把发布说明写作 `docs/release-notes/0.2.16.md` / `0.2.16.zh-CN.md`，但 `release.yml` 按 `docs/release-notes/v${version}.md` 与 `v${version}.zh-CN.md` 组装正文。实际落盘文件必须是 `v0.2.16` 前缀的这两个文件，否则 `release.yml` 的缺一 fail-closed 会直接失败。

**版本收敛必须同批移动的锚点**：`package.json#version` 是唯一版本源；`currentTag` 由它派生。`latestPublishedTag` 保持 `v0.2.15`（README 第 5 行的已发布事实），`priorPublishedTag` 保持 `v0.2.14`（历史锚点）。`release.yml`、`docs/release-process.md`、`docs/release-signing.md` 与 `release-packaging.test.ts` 中描述「当前收敛版本 / dispatch 默认值」的锚点同批改为 `v0.2.16`，描述「已发布事实 / 历史」的锚点保持不动。

### 本版用户可见变化（以仓内 commit 为准）

`git log v0.2.15..main` 的真实用户可见改动为五项：

1. **目录独有状态改用「左独有 / 右独有」词表**（`0dfc56f`）：目录对比行徽标、目录工具栏图例、壳层状态栏图例统一复用过滤页签词表——`added` 显示为 `Right only` / `右独有`，`removed` 显示为 `Left only` / `左独有`；文本 / 代码 diff 的 `Added` / `Removed` 词表不变；过滤与四态计数语义不变。
2. **模板归位接入真实用户目录**（`ae5e9e3` / `0404c79` / `fcb4683` / `927b229`）：目录会话点「模板归位」后先选根——模板 A 只读取当前左侧根；散乱树 B 根与输出根可用系统目录选择器、拖入目录或键入路径（`~` 展开）指定；输出根尚不存在时标注「将创建」。Dry-run 基于输出根真实既有文件 / 目录生成计划，预览零写入；四类分区逐条显示槽位与源；默认勾选、可执行数与确认按钮读同一份解析结果，确认只写已勾选条目；写入按源 `modifiedMs` 落盘并逐条复核 sha256 / `mtimeSec`。
3. **重复 Dry-run 对已落位槽位幂等**（`aa17d0b`）：输出根同名文件内容 sha256 与源一致时判为「已落位 / Already placed」，不再显示覆盖提示、默认不勾、不进入可执行清单；没有可执行项时确认按钮不可用；内容被改动后回到冲突或覆盖保护。
4. **失败提示随界面语言本地化**（`ed5bdd3` / `fcb4683`）：同步写入拒绝与写入后刷新失败按稳定系统码映射到中 / 英词典，保留目标路径与 OS code；模板归位的预检拒绝、逐条写入失败与复核失败同样按当前界面语言显示；英文界面不再出现主进程中文句。
5. **样本入口收进设置**（`ed5bdd3`）：首屏与目录工具栏不再出现内置样本路径；内置样本、远端快照示例与失败演示统一从「设置 → 示例与调试」进入。

`927b229` / `fcb4683` / `08b192b` 中的门禁矩阵、e2e 夹具与基线文档属于研发验证面，不写成新的用户功能；`da2dc3e` 是 v0.2.15 的发布回写，不重复计入本版。

## Acceptance Criteria

- ac-version-bump: `package.json#version` 恰为 `0.2.16`；`node -p "require('./package.json').version"` 输出 `0.2.16`；仓库内不存在把 `package.json` 版本写成其他值的第二处版本源。
- ac-changelog-heading: `CHANGELOG.md` 中 `## v0.2.16` 标题恰好出现一次，且紧邻位于 `## v0.2.15` 之前（两者之间没有其他 `## v*` 标题）；`## v0.2.15` 及更早条目内容保持原样。
- ac-changelog-covers-real-changes: `## v0.2.16` 条目按真实 commit 覆盖五项用户可见变化——① 目录独有状态词表「左独有 / 右独有」（行徽标 / 图例 / 过滤计数展示）且文本 / 代码 diff 词表不变；② 模板归位接入真实用户目录（选根、Dry-run 零写入、显式勾选、只写勾选项、逐条复核）；③ 重复 Dry-run 对内容相同的已落位槽位判为已落位、不再要求覆盖；④ 同步与模板归位失败提示随界面语言本地化；⑤ 样本入口收进「设置 → 示例与调试」。条目含「### 升级方式」且建议从 `v0.2.15` 升级。
- ac-changelog-no-overclaim: `## v0.2.16` 条目不出现未实测的性能 / 内存数字（`GiB` / `MiB` / `GB` / `MB` 数值）、不出现 `TODO` / `TBD` / `FIXME`、不出现 40 位以上十六进制串、不出现虚构版本标题或「本版新增」式对既有能力的重复宣称；未实测项不写成已通过。
- ac-notes-en-exists-and-structure: `docs/release-notes/v0.2.16.md` 存在且非空；首个 `# ` 标题含 `v0.2.16`；含指向 `./v0.2.16.zh-CN.md` 的语言互链；`## What changed`、`## Not in this release`、`## Risk and verification scope`、`## Upgrade` 四个二级标题各出现一次且按此顺序出现。
- ac-notes-zh-exists-and-structure: `docs/release-notes/v0.2.16.zh-CN.md` 存在且非空；首个 `# ` 标题含 `v0.2.16`；含指向 `./v0.2.16.md` 的语言互链；`## 本次变化`、`## 不做的事`、`## 风险与验证规模`、`## 升级方式` 四个二级标题各出现一次且按此顺序出现。
- ac-notes-cover-real-changes: 两版发布说明均覆盖五项用户可见变化：目录 `Right only` / `Left only`（zh `右独有` / `左独有`）词表；模板归位真实选根与 Dry-run；`Already placed` / `已落位` 幂等；失败提示按界面语言本地化（保留目标路径与 OS code）；样本入口只在「设置 → 示例与调试」。英文说明含对应英文事实，中文说明含对应中文事实。
- ac-notes-windows-portable-section: 两版发布说明保留既有 Windows 免安装包口径——英文含 `### Windows portable download` 且正文为既有的两句（NSIS + 免安装 `.zip`；自动更新仍指向 NSIS）；中文含 `### Windows 免安装包` 且正文为既有两句（NSIS + 免安装 `.zip`；自动更新仍指向 NSIS）；两侧句子数与顺序一致（`release-packaging.test` 现有断言保持通过）。
- ac-notes-no-banned-phrases: 两版发布说明均不含 `已发布`、`已修复`、`已通过 L1`、`**Full Changelog**`、`releases/tag/`、`TODO` / `TBD` / `FIXME`、40 位以上十六进制串；不写未实测的性能 / 内存数字。
- ac-release-yml-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 恰为 `'v0.2.16'`；body 组装顺序仍为「英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → Full Changelog」，两文件缺失或空白时仍在创建 / 编辑 draft 前 `exit 1`。
- ac-release-process-doc: `docs/release-process.md` 的 `workflow_dispatch` 默认 tag 说明为 `default: 'v0.2.16'`，与 `release.yml` 和 `package.json#version` 一致。
- ac-release-signing-doc: `docs/release-signing.md` 保留 `当前状态：v0.2.15 已发布`、`docs/release-notes/v0.2.15.md`、`docs/release-evidence/v0.2.15.md`；同时 `正式版发布姿态（v0.2.16）`、`docs/release-notes/v0.2.16.md`、补发默认 tag `v0.2.16`、`v0.2.16` 版本收敛已合入 `main` 的表述存在；不出现 `当前状态：v0.2.14` / `v0.2.4` / `v0.2.2`。
- ac-readme-published-line-unchanged: `README.md` 与 `README.zh-CN.md` 第 5 行仍只链接 `v0.2.15`（`releases/tag/v0.2.15`），不出现 `v0.2.16` 的发布链接；两版 README 不新增版本表、不改下载入口。
- ac-release-evidence-untouched: 本项不新增、不修改、不删除 `docs/release-evidence/**` 下任何文件；`git diff --name-only` 中不出现该目录。
- ac-test-current-tag-anchor: `src/main/release-packaging.test.ts` 的 `currentVersion` / `currentTag` 仍由 `package.json` 派生（`v0.2.16`）；`latestPublishedTag` 保持 `'v0.2.15'`；`priorPublishedTag` 保持 `'v0.2.14'`；`lastReleasedNotesPath` 指向 `docs/release-notes/v0.2.15.md`，不再与 `releaseNotesPath` 相等。
- ac-test-version-order: 测试中断言「最新已发布条目就是当前条目」的判据改为「当前条目 `v0.2.16` 在最新已发布条目 `v0.2.15` 之前，且 `v0.2.15` 在 `v0.2.14` 之前」；`isTagBefore(latestPublishedTag, currentTag)` 为 `true`；changelog 前两个标题为 `[v0.2.16, v0.2.15]`；不再保留 `latestPublishedTag === currentTag` 或 `currentTag === 'v0.2.15'` 的断言。
- ac-test-bilingual-fail-closed-kept: `release-packaging.test.ts` 仍断言 `notes_file="docs/release-notes/v${version}.md"`、`notes_zh_file="docs/release-notes/v${version}.zh-CN.md"`、英文 / 中文两文件缺失与空白均 `exit 1`、`<details><summary>简体中文</summary>` 折叠块顺序与唯一性、finalize 的已发布正文双语校验；上述断言不得放宽、跳过或删除。
- ac-test-current-content-coverage: `release-packaging.test.ts` 新增或改写的当前版本内容断言覆盖 `v0.2.16` 的五项用户可见变化（中文条目 + 中英两版发布说明），同时把原 `v0.2.15` 内容断言钉到显式 `v0.2.15` 历史路径，不随 `currentTag` 漂移；`pnpm test` 中该文件全部用例通过。
- ac-code-gates: `.munk/code-gates.json` 的 16 项门禁（install / lint / typecheck / build / build-web / test 及 sync / template 专项门）全部退出码 0；不放宽、不跳过、不删除任何断言。
- ac-scope-guard: 本项 `git diff --name-only` 只涉及上文「范围」列出的 7 类文件；`src/**` 产品源码零改动（`src/main/release-packaging.test.ts` 除外）；不推 tag、不 dispatch、不创建 / 修改 Release 与资产、不 cherry-pick、不改动 `v0.2.15` 及更早 tag / Release / 资产 / 证据。

## Non-Goals

- 不做任何产品行为改动、缺陷修复或新功能；不改 `src/**` 产品源码。
- 不重新设计发布流程、不改 `release.yml` 的 gates / 打包矩阵 / 签名公证 / finalize 逻辑，只改 dispatch 默认 tag。
- 不发布、不推 tag、不 dispatch、不创建或修改 Release 与资产、不补 `docs/release-evidence/**`（发版后另补）。
- 不改 `README.md` / `README.zh-CN.md` 第 5 行的已发布事实，不把 README 提前翻到 `v0.2.16`。
- 不改 v0.2.15 及更早的发布说明、CHANGELOG 历史条目、证据文件与 tag。
- 不为凑绿放宽 `release-packaging.test` 的缺一 fail-closed、双语折叠、finalize 正文校验等既有判据。

## Implementation Constraints

- **版本单点**：`package.json#version` 是唯一版本源；`currentTag` 由它派生。`release.yml` / `release-process.md` / `release-signing.md` / `release-packaging.test.ts` 中描述当前收敛版本与 dispatch 默认值的字面量同批改为 `v0.2.16`；描述已发布事实与历史的字面量（README 第 5 行、`latestPublishedTag`、`priorPublishedTag`、`docs/release-evidence/**`）保持不动。
- **发布说明路径**：必须落盘 `docs/release-notes/v0.2.16.md` 与 `docs/release-notes/v0.2.16.zh-CN.md`；不要创建无 `v` 前缀的 `0.2.16.md`。
- **发布说明结构**：沿用 v0.2.15 的版式（H1 + 语言互链 + 导语 + 四节 + Windows 免安装包小节）；英文为全文而非摘要，中文为全文；不写 `releases/tag/` 链接与 `**Full Changelog**`（由 `release.yml` 追加）。
- **CHANGELOG 结构**：沿用既有中文版式（导语 + `### 改进` / `### 不做的事` / `### 升级方式`），新条目置顶；历史条目逐字保持。
- **测试锚点拆分**：`latestPublishedTag` 保持 `'v0.2.15'`，`priorPublishedTag` 保持 `'v0.2.14'`；`lastReleasedNotesPath` 指向 `v0.2.15` 且与 `releaseNotesPath`（`v0.2.16`）不相等；原 `v0.2.15` 内容覆盖测试改为显式 `## v0.2.15` 历史切片，新增 `currentTag` 驱动的 `v0.2.16` 内容覆盖测试。只改版本锚点与内容切片，不弱化 fail-closed / 折叠标记 / finalize 正文校验断言。
- **事实边界**：发布说明只写仓内 commit 能证明的用户可见变化；门禁矩阵、e2e 夹具、基线文档属于验证面，不写成新用户功能；未实测的性能 / 内存 / 实机结论不写。
- **交付**：过 `code_gates` 后交 Delivery 合入 `main`；合入后仍不推 tag、不 dispatch、不创建 Release。
