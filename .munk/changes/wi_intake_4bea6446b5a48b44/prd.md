# v0.2.6 发布收尾：README/签名文档翻已发布 + v0.2.6 发布证据 + 断言锚点前移

## 范围

v0.2.6 已公开发布（Release id `421396682`，`2026-10-23T02:44:51Z`，`draft=false`、`prerelease=false`，11 件资产，`releases/latest` = `v0.2.6`）。仓库文档仍停在「v0.2.6 待发布」，且缺 `docs/release-evidence/v0.2.6.md`。本项只做发布收尾的**文档 + 测试锚点**收口，不动任何产品源码与发布通道。

具体改动面（只允许这 4 处，第 4 处为新建）：

### 1) `README.md`

- 首屏第 5 行（`当前发布状态` 行）翻为已发布：
  - `当前发布状态：v0.2.6 已发布；最新公开 Release 为 [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6)。`
  - 该行其余内容逐字保留：四入口/盘符/盘根/UNC 修复摘要、`docs/release-notes/v0.2.6.md` 链接、`Developer ID 签名 + Apple 公证`、`App Store Connect API Key`、6 项 Secret 名、`fail-closed`、凭据清单链接。
- `## 版本与下载` 表：v0.2.6 行改为已发布并挂 Release 链接（说明文字保留「Windows 绝对路径四入口修复（盘符 / 盘根 / UNC）」与发布说明链接），v0.2.5 行改 `已发布（上一版）`，v0.2.4 行去掉「（上一版）」只留 `已发布`；v0.2.3 行与 v0.2.2 行不动；五行顺序不变（v0.2.6 → v0.2.5 → v0.2.4 → v0.2.3 → v0.2.2）。
- 紧随该表新增一行公开下载入口（不要写成表格行，也不要放进「## 核心能力」之后），形如：

  ```text
  下载 v0.2.6：[公开下载页](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) · macOS [dmg](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64.dmg) / [zip](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64-mac.zip) · Windows [OpenCompare-Setup-0.2.6.exe](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-Setup-0.2.6.exe) · Linux [AppImage](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6.AppImage) / [deb](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/opencompare_0.2.6_amd64.deb)
  ```

  资产名必须是连字符形态、无空格、无点号错位名（`OpenCompare-Setup-0.2.6.exe`，不是 `OpenCompare.Setup.0.2.6.exe`）。
- `## 已知问题` 新增一条 Issue #3 对应项（该条目前不存在，需新增），归因必须是 `已在 v0.2.6 修复`（不要写 v0.2.5）：
  描述 v0.2.5 及更早版本在 Windows 上经 CLI 冷启动（`--left` / `--right`）、二次实例接管、新建对比手工输入、`opencompare://` 链接传入 `C:\…` 绝对路径时被拼到 cwd / baseDir（Issue 原文症状：`C:\path\to\file1` 被解成 `C:\path\to\/C:\path\to\/file2`，文件名被吞）；修复后四入口按绝对路径解析、`..` 不越过盘根 / 共享根；链接 `https://github.com/chaxiu/OpenCompare/issues/3`，并引用 `src/shared/compareRequest.test.ts` 与 `windows-latest` run `39890047849`（46 tests passed）。
  README 全文不得再出现 `待发布`。

### 2) `docs/release-signing.md`

- 首屏 `当前状态：v0.2.6 待发布。` → `**当前状态：v0.2.6 已发布。**`，并补公开 Release 链接与 `docs/release-evidence/v0.2.6.md`（v0.2.5 的证据链接作为历史保留）。
- 第三节标题 `## 三、正式版发布姿态（v0.2.6）` 不动；在该节 v0.2.5 已发布条目**之前**新增一条 v0.2.6 已发布条目：公开 Release 链接、11 件资产、「CI run `39890773909` 五 job 全 success」、签名/公证原文见 `docs/release-evidence/v0.2.6.md`；明确 macOS 公证由 CI 执行，公开件干净环境复验归 product-qa（不得写成已通过）。
- 第五节补发段落：删掉 `v0.2.6 待发布`，改为「`v0.2.6` 已发布；如需补发，从 `main` 手动触发 `workflow_dispatch`，输入目标 `tag`（默认 `v0.2.6`）」，默认 tag 仍为 `v0.2.6`。
- 一、二、四、六节原文（6 项 Secret 表、`v0.1.2` 漂移记录只读事实、祖先门语义、打包后硬校验）不动；全文不得再出现 `待发布`；不得出现 `发布冻结`。

### 3) 新建 `docs/release-evidence/v0.2.6.md`

`status: verified`。只引用**本 prd 已给出的既成事实**与发布期证据原文（见「实现约束」的路径），不要重新下载资产、不要重新 `gh release view`、不要重新打包 / 公证 / dispatch。至少包含下列内容：

- tag 与构建检出：annotated tag 对象 `a0517102f90d769f71661cdf2f7bec43327b5d61` → commit `30967cd1e8fd521fa517588b2a7ac503305797e5`；远端 tag 已存在，永不重指、不重打。
- 公开 Release：id `421396682`，published `2026-10-23T02:44:51Z`，`draft=false`、`prerelease=false`，`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6`，11 件资产。
- Release CI：`https://github.com/chaxiu/OpenCompare/actions/runs/39890773909`（headSha `30967cd1e8fd521fa517588b2a7ac503305797e5`），五 job 结论表：`Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release` 全 `success`。
- Windows 入口门：`https://github.com/chaxiu/OpenCompare/actions/runs/39890047849`，job `compare-request paths`（windows-latest）对同一 sha `30967cd1e` `success`，执行命令 `pnpm test src/shared/compareRequest.test.ts`（46 tests passed，含盘符 / 盘根 / UNC 六例回归）。
- 唯一性与 latest 门：`releases for v0.2.6: 1 (drafts: 0, prereleases: 0)`；`latest published release: v0.2.6 (this tag: v0.2.6)`；`releases/latest` = `v0.2.6`；三份 `latest*.yml` 的 `files[].url` / `path` 全部命中 v0.2.6 资产；`latest.yml` 为 `version: 0.2.6`、`path: OpenCompare-Setup-0.2.6.exe`、size `102,945,648`（与 `.exe` 资产一致）。
- 11 件资产的清单表：资产名 + 字节 + sha256 + 公开 URL（每行 URL 用 `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/<资产名>`），数值取自下表，逐字使用，不重新取数：

  | 资产 | 字节 | sha256 |
  | --- | --- | --- |
  | `OpenCompare-0.2.6-arm64.dmg` | 113,412,984 | `5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c` |
  | `OpenCompare-0.2.6-arm64.dmg.blockmap` | 118,195 | `3e715e4d1fa0f7566c51b5945d7d0cb6c8cd3dd535816f301c46bf89f0f91289` |
  | `OpenCompare-0.2.6-arm64-mac.zip` | 109,240,573 | `2b21766410ae6dcee83e61e297bff9dcfe942c0f886958286ed3bceee3eaa609` |
  | `OpenCompare-0.2.6-arm64-mac.zip.blockmap` | 115,900 | `0c4667d2b19f0f0e85662aba3c425c4776fe0f0ed49bda038237fe3c5c86261d` |
  | `OpenCompare-Setup-0.2.6.exe` | 102,945,648 | `9bef79c243aef99331e76f0436eaefa9c714d3b5fa5f37d60f807a4abbd4aed7` |
  | `OpenCompare-Setup-0.2.6.exe.blockmap` | 108,483 | `326f1d21f6a12305588ffbbc3aec9b36423a108f0c2ad035fea2a5767c254c3f` |
  | `OpenCompare-0.2.6.AppImage` | 120,246,155 | `ddbfa3796a2a96213da0f451033e2ae6ff07215e004094862bcc62b25be7b8cd` |
  | `opencompare_0.2.6_amd64.deb` | 92,978,452 | `6bfb9052f55b22fd23db10e63d8560e1c915a190bf38c89f4f90ba1c61427426` |
  | `latest.yml` | 351 | `8d163aee20df63fecfd8734ca2c9ae80007ae857b05c80f3125afbd30b75cb4e` |
  | `latest-mac.yml` | 517 | `9243e0232f3f4aea2420d9b57be8116ec81e24dabd75b40d29e06b1c219c99db` |
  | `latest-linux.yml` | 531 | `1813ac1516f98e0da4018e2fcd171db58e06dd76a39faeeb47b156d71c686878` |

- macOS 签名 / 公证：引用发布期证据原文（路径见实现约束），至少包含 `valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID`、`Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)`、`CDHash=3ee9d42220e5c02f061098a330fe90847c35f951`（dmg 与 zip 内 `.app` 同一 CDHash）、`CFBundleShortVersionString=0.2.6`；并照实记录边界：**dmg 容器文件本身**未装订票据（`stapler validate` exit 65、`spctl -t install` rejected），口径与 `docs/release-evidence/v0.2.5.md` 第 4 节一致，只对 dmg/zip 内 `.app` 断言 stapler + spctl。
- `## 已知遗留`：同会话连续 upsert `ready` 峰值诊断项仍在飞（只读记录，不声称已修、不写结论），并写明本文件不覆盖该项。
- 不写 `TODO` / `TBD` / `FIXME`；不复制证据文件全文（引用路径 + 关键行即可）。

### 4) `src/main/release-packaging.test.ts`（只改锚点，不删断言）

README 翻转会让现有 `release-packaging` 用例转红，必须同批改：

- 锚点常量：
  - `latestPublishedTag = 'v0.2.6'`；`publishedTags` 含 `v0.2.0`、`v0.2.1`、`v0.2.2`、`v0.2.4`、`v0.2.5`、`latestPublishedTag`。
  - `lastReleasedNotesPath` → `docs/release-notes/v0.2.6.md`。
  - 新增显式历史常量：`previousPublishedTag = 'v0.2.5'`、`historicalNotesV025Path = docs/release-notes/v0.2.5.md` 及其内容（原「keeps the v0.2.5 release notes as released history」关键字块改读该常量，关键字逐字保留）。
  - `ghostMergeTargetTag = 'v0.2.4'` 保持不变。
- 翻转并保持 fail-closed 的断言组：
  - `release version gate`：`expect(latestPublishedTag).toBe(currentTag)`（替代 `not.toBe`）；README 状态行为 `当前发布状态：${currentTag} 已发布`。
  - README 状态/版本表/signing 状态行：正断言 `已发布`；负断言改为 `not.toContain(pendingWord)`；因 `latestPublishedTag === currentTag`，原来「不含 `当前发布状态：${latestPublishedTag}`」改为正断言包含；补「不含 `当前状态：v0.2.5`」「不含 `当前发布状态：v0.2.5`」。
  - 版本表：当前行 `| [${currentTag}]` 含 `已发布（最新公开 Release）` + `releases/tag/${latestPublishedTag}` + `docs/release-notes/${currentTag}.md` + `盘符 / 盘根 / UNC`，且 `not.toContain(pendingWord)`；`previousPublishedTag` 行含 `已发布（上一版）`；`v0.2.4` 行含 `已发布` 且不含 `上一版` / `最新公开 Release`；`v0.2.3` 幽灵行仍 `未发布` + `内容并入 ${ghostMergeTargetTag}`；带 `最新公开 Release` 的行恰好 1 条；顺序断言改为 v0.2.6 → v0.2.5 → v0.2.4 → v0.2.3 → v0.2.2（用 ``| [v0.2.6]` → `| [v0.2.5]` → `| [v0.2.4]` → 幽灵 → `| [v0.2.2]`` 的递增 `rowIndex` 表达）。
  - CHANGELOG：排序断言插入 `## v0.2.5` 锚点（`## v0.2.6` 与 `## v0.2.5` 不再用 `latestPublishedTag` 表达「之后」）；当前段切片 `## v0.2.6`..`## v0.2.5`；v0.2.5 历史段 `## v0.2.5`..`## v0.2.4`；幽灵 heading 切片终点改 `## v0.2.5`。
  - 发布说明：`lastReleasedNotesPath` 与 `releaseNotesPath` 断言改为**相等**；`firstHeading(lastReleasedNotes)` 含 `latestPublishedTag`；v0.2.6 notes 的既有断言（四入口 / 两条证据 / 无占位符 / 无 64 位十六进制串）保持。
  - 已知问题：内存增长、`ECANCELED` 两条仍归因 `previousPublishedTag`（v0.2.5），文案不动；新增 Windows 四入口条目断言含 `已 ${latestPublishedTag} 修复` 形态的 `已在 v0.2.6 修复`、`issues/3`、`C:\` 与 `39890047849`；`已知未修` 行数仍为 0。
- 新增断言（本项要求的收口）：
  - `README 声明的已发布版本 == latestPublishedTag == v0.2.6`：从 README 状态行用 `当前发布状态：(v\d+\.\d+\.\d+) 已发布` 与 `最新公开 Release 为 \[(v\d+\.\d+\.\d+)\]` 两处取值，均 `toBe(latestPublishedTag)`，且 `latestPublishedTag` `toBe(\`v${pkg.version}\`)`。
  - 资产名不含空格：扫描 README 中所有 `releases/download/${latestPublishedTag}/([^)\s]+)` 命中，数量 ≥ 5，每个 basename 匹配 `/^[A-Za-z0-9][A-Za-z0-9._-]*$/`（即无空格），且集合包含 `OpenCompare-0.2.6-arm64.dmg`、`OpenCompare-0.2.6-arm64-mac.zip`、`OpenCompare-Setup-0.2.6.exe`、`OpenCompare-0.2.6.AppImage`、`opencompare_0.2.6_amd64.deb`；并断言 README 不含 `OpenCompare.Setup.0.2.6.exe` 与 `OpenCompare Setup 0.2.6.exe`。
  - 证据文件：`docs/release-evidence/${latestPublishedTag}.md` 存在、非空、`status: verified`、含 `a0517102f90d769f71661cdf2f7bec43327b5d61`、`30967cd1e8fd521fa517588b2a7ac503305797e5`、`421396682`、`2026-10-23T02:44:51Z`、`39890773909`、`39890047849`、`pnpm test src/shared/compareRequest.test.ts`、`releases/latest`、`已知遗留`；11 件资产各自「名字 + 上表 sha256」同现（用测试内常量表逐条断言）；含公证原文标记 `The validate action worked!` 与 `source=Notarized Developer ID`；不含 `TODO` / `TBD` / `FIXME`。
- `it(` 条数不得减少；不得把断言弱化为 `toBeTruthy()`、删除负向断言或放宽正则来换绿色；`pendingWord` 继续由 `['待', '发布'].join('')` 拼出。

## 验收

- ac-readme-status-published: README 第 5 行含 `当前发布状态：v0.2.6 已发布` 与 `最新公开 Release 为 [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6)`，且 README 全文不含 `待发布`；第 5 行仍含 `docs/release-notes/v0.2.6.md`、6 项 Secret 名、`fail-closed`、`App Store Connect API Key`、`Developer ID 签名 + Apple 公证`。
- ac-readme-download-links: README「版本与下载」段含 `releases/tag/v0.2.6` 公开下载页链接，以及 `releases/download/v0.2.6/` 下 dmg、arm64-mac.zip、`OpenCompare-Setup-0.2.6.exe`、AppImage、deb 五个直链；所有直链 basename 无空格且匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*$`；不出现 `OpenCompare.Setup.0.2.6.exe`。
- ac-readme-version-table: v0.2.6 行为 `| [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) | 已发布（最新公开 Release） |` 且保留「盘符 / 盘根 / UNC」与发布说明链接；v0.2.5 行为 `已发布（上一版）`；v0.2.4 行只留 `已发布`；v0.2.3 行仍 `未发布，内容并入 v0.2.4`；行顺序 v0.2.6 → v0.2.5 → v0.2.4 → v0.2.3 → v0.2.2 不变。
- ac-readme-known-issue-3: README「已知问题」有一条含 `issues/3`、`C:\`、`CLI`、`单实例`、`手工输入`、`opencompare://` 的条目，且该条含 `已在 v0.2.6 修复`（不含 `已在 v0.2.5 修复`）；同段内存增长与 `ECANCELED` 两条仍写 `已在 v0.2.5 修复`，文案未改。
- ac-signing-status-published: `docs/release-signing.md` 含 `当前状态：v0.2.6 已发布`、`正式版发布姿态（v0.2.6）`、`docs/release-evidence/v0.2.6.md`、`默认 \`v0.2.6\``，全文不含 `待发布` 与 `发布冻结`；第三、五节写法为「v0.2.6 已发布 / 如需补发」。
- ac-signing-readonly-history: signing 文档仍含 6 项 Secret 名、`3X4J53U6RY`、`App Store Connect API Key`、`v0.1.2` 漂移事实（`c4a6a95`、`7ea2cc6`、`祖先`、`13 个提交`、`11 个资产`）、`不删除` / `不移动` / `不重打` / `不替换` 四条，原文未被改写。
- ac-evidence-doc: `docs/release-evidence/v0.2.6.md` 存在且非空，`status: verified`，含 tag 对象 `a0517102…`、commit `30967cd1…`、Release id `421396682`、发布时间 `2026-10-23T02:44:51Z`、`draft=false`、`prerelease=false`、`39890773909`、`39890047849`、`pnpm test src/shared/compareRequest.test.ts`、`已知遗留`；无 `TODO` / `TBD` / `FIXME`。
- ac-evidence-jobs: 证据文件列出 Release CI 五 job（`Quality gates`、`Package win`、`Package linux`、`Package mac`、`Publish the GitHub Release`）且全部标 `success`，并写明 headSha 为 `30967cd1e8fd521fa517588b2a7ac503305797e5`。
- ac-evidence-assets: 证据文件列出 11 件资产，每件的名字与上表 sha256 同现，且每件都带 `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/<资产名>` 形式的公开 URL；`latest.yml` 条目标明 `version: 0.2.6`、`path: OpenCompare-Setup-0.2.6.exe`、`102,945,648`。
- ac-evidence-unique-latest: 证据文件含 `releases for v0.2.6: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.6 (this tag: v0.2.6)` 及 `releases/latest` = `v0.2.6` 结论。
- ac-evidence-notarization: 证据文件引用 `04-notarization-macos.txt` 路径并含 `valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID`、`TeamIdentifier=3X4J53U6RY`、`CDHash=3ee9d42220e5c02f061098a330fe90847c35f951`，并照实记录 dmg 容器本身未装订票据的边界结论。
- ac-evidence-leftover: 证据文件 `已知遗留` 段写明同会话 upsert `ready` 峰值诊断项在飞、只读、未判定，且全文不出现把该项写成已修复的表述。
- ac-anchor-latest-published: `release-packaging.test.ts` 中 `latestPublishedTag = 'v0.2.6'`，`publishedTags` 含 v0.2.0 / v0.2.1 / v0.2.2 / v0.2.4 / v0.2.5 / v0.2.6，`lastReleasedNotesPath` 指向 `docs/release-notes/v0.2.6.md` 且断言与 `releaseNotesPath` 相等，`previousPublishedTag = 'v0.2.5'`，`historicalNotesV025Path` 指向 `docs/release-notes/v0.2.5.md`。
- ac-readme-version-assertion: 新断言行从 README 声明的发布版本与 `latestPublishedTag` 取值后断言二者相等且等于 `v${pkg.version}`（即 `v0.2.6`）；把 README 状态行改回 `v0.2.5 已发布` 时该用例必须转红。
- ac-asset-name-assertion: 新断言扫描 README 的 `releases/download/` 链接，任一 basename 含空格或为点号形态 `OpenCompare.Setup.0.2.6.exe` 时转红。
- ac-no-pending-assertions: 测试中不再存在要求 README / signing 文档 / 版本表当前行出现 `待发布` 的正向断言；存在「README 与 signing 文档不含 `待发布`」的负向断言；`pnpm test` 在全绿的同时，把 README 或 signing 改回待发布会使 `release-packaging` 转红。
- ac-history-verbatim: `CHANGELOG.md`、`package.json`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/v0.2.5.md` 及更早证据文件零 diff；v0.2.5 的 CHANGELOG 段与发布说明关键字断言逐字保留（仅切片边界改为显式常量）。
- ac-tests-green: `code_gates` 全绿（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `perf-gate` / `memory-gate`），其中 `pnpm test` 含 `src/main/release-packaging.test.ts` 与 `src/shared/compareRequest.test.ts`（六例 Windows 绝对路径回归）全绿；测试条数不减少。
- ac-diff-scope: `git diff --name-only` 只含 `README.md`、`docs/release-signing.md`、`docs/release-evidence/v0.2.6.md`（新增）、`src/main/release-packaging.test.ts`。

## 非目标

- 不碰发布通道：不建 / 不重打 / 不移动 tag，不改 Release，不修改 / 替换 / 删除任何资产，不 dispatch CI，不重跑公证，不重新下载资产复核。
- 不改产品源码（`src/` 除 `src/main/release-packaging.test.ts` 的断言锚点外一律零 diff）、不改 `src/shared/compareRequest.test.ts`。
- 不改 `package.json`（version 已是 0.2.6）、`CHANGELOG.md`、`docs/release-notes/**`、`electron-builder.yml`、`.github/workflows/**`、`scripts/**`、`.munk/code-gates.json`。
- 不编辑 `docs/release-evidence/v0.2.5.md`（含第 6 节 product-qa 交接区），不为历史版本补写或回填证据。
- 不写 `journal` / `cases` / `shipped`，不改 `AGENTS.md`。
- 不做 Issue #3 的 GitHub 回帖 / 关闭操作（Issue 当前仍 OPEN），不改 README 其它段落，不做顺手润色，不新增发布公告 / 落地页。
- 不跑真机或桌面点选验收，不加 UI 自测。

## 实现约束

- 发布侧事实以本 prd 与发布期证据文件为准，直接引用、不要重新核验或改数：
  - `projects/ops_df43e423451170fd/.munk/runs/trun_f762e44bb935eefe/evidence/`（尤其 `03-assets-sha256.txt`、`04-notarization-macos.txt`、`06-ci-gates-windows.txt`、`07-run-jobs.json`、`02-release-v026.json`）
  - `projects/ops_df43e423451170fd/cases/2026-10-23/v0.2.6-release.md`
  （物理位置：`~/Library/Application Support/Munk AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/` 下同名相对路径；只读引用路径与关键行，不整篇复制。）
- 证据文件的 11 件 sha256 / 字节必须与上表逐字一致；`latest-mac.yml`（517 B）与 `latest-linux.yml`（531 B）也在 11 件内，不要漏。
- 测试里 `v0.2.5` / `v0.2.4` / `v0.2.2` 等历史 tag 用显式常量或字面量钉住，不得由 `latestPublishedTag` 派生（避免下次翻转被带偏）；`currentTag` 仍由 `package.json#version` 派生。
- `latestPublishedTag` 与 `currentTag` 现在相等是预期状态；不要再保留「二者必须不相等」的断言。
- 文档只改状态字 / 链接 / 新增段落；v0.2.5、v0.2.4、v0.2.2 的历史说明文字与发布说明关键字不要改写。
- README 新增的下载行不能以 `|` 开头（版本表用例按 `|` 开头的行解析），也不要插到「## 核心能力」之后。
