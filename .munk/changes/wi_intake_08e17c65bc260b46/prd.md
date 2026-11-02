# v0.2.16 发布事实回写与发布证据归档

## Scope

`v0.2.16` 已于 2026-11-02 公开并独立复核。本项只做发布事实的仓内单点回写与证据归档，不改功能、不改版本、不动已公开的 tag / Release / 资产 / 正文。

改动面锁定 5 个路径：

1. `README.md` 第 5 行「Latest public release」前移到 `v0.2.16`，其余行不动。
2. `README.zh-CN.md` 第 5 行「最新公开版本」前移到 `v0.2.16`，其余行不动。
3. `src/main/release-packaging.test.ts` 的 `latestPublishedTag` 前移到 `v0.2.16`，并把所有因「`latestPublishedTag === currentTag`」而失效的派生断言按新锚等价重切。
4. `docs/release-signing.md` 的当前状态与 `v0.2.16` 签名 / 公证事实、证据路径更新。
5. 新建 `docs/release-evidence/v0.2.16.md`，归档 tag → commit、公开 Release、12 件资产、L1 六腿结论、内存判据修订与正文门结论。

### 已公开事实（本项唯一数据源）

| 项 | 值 |
| --- | --- |
| `package.json#version` | `0.2.16`（本项不改） |
| tag | `v0.2.16`，annotated，tag 对象 `690358de07c309f73736055ad25c13b11731c6cd` |
| 发布点 commit | `3dab29c0b7039cc4f483e5a8d2955fe95ec079bf` |
| Release | 非 draft、非 prerelease，公开时间 `2026-11-02T02:23:51Z`，12 件资产且无重名 |
| dmg | `OpenCompare-0.2.16-arm64.dmg`，111,477,257 B，sha256 `4036c3a3a8523362c42bac6f0256b724edb6c185117a2b2f6c63f4b6bb74690b` |
| win zip | `OpenCompare-0.2.16-win-x64.zip`，131,649,968 B |
| Setup exe | `OpenCompare-Setup-0.2.16.exe`，101,434,344 B |
| Release 正文 | 双语（英文全文 + `---` + `<details><summary>简体中文</summary>`），两条语言切换均为绝对 URL，`](./` 计数为 0 |
| L1 三轮 | 三轮四态逐位一致：`35 / 80 / 41 / 326,099` |
| L1 取消 | 点击到可操作 `35 ms` |
| L1 内存 | 按 2026-11-02 负责人裁定的修定判据判 pass：保留堆 `241.6 → 241.8 MB`、Δ`0.13 MB`；app 峰值 `1.20 GiB` 在阈值内 |
| 发布期证据 | `projects/ops_df43e423451170fd/.munk/runs/trun_8d069981668e46c5/evidence/`（`release-v0.2.16.json` / `gates-summary.json` / `mac-job.log` / `ci-poll.json`） |
| L1 证据 | `projects/ops_df43e423451170fd/.munk/runs/trun_5d107ebc931e4ffe/`（`digest.md`、`evidence/10-download-verify.json`、`evidence/23-memory-verdict.json`、`evidence/30-cancel.json`、`evidence/32-heap-gc-probe.json`） |

## Acceptance Criteria

- ac-readme-line5: `README.md` 与 `README.zh-CN.md` 第 5 行同时指向 `v0.2.16`，各自只含 1 个 `releases/tag/` 链接且指向 `releases/tag/v0.2.16`，英文行保留 `Latest public release`，中文行保留 `最新公开版本`。
- ac-readme-rest-untouched: 两版 README 除第 5 行外零 diff；第 3 行互链文案不变；两版仍各为恰好 9 个 `## ` 标题且顺序一一对应；英文版除语言切换行外零汉字、正文词数仍在既有上限内。
- ac-test-anchor: `src/main/release-packaging.test.ts` 中 `latestPublishedTag === 'v0.2.16'` 且 `latestPublishedTag === currentTag`；`publishedTags` 含 `v0.2.15` 与 `v0.2.16`；不再存在要求 `latestPublishedTag` 严格早于 `currentTag` 的正向断言。
- ac-test-history-preserved: 因 `latestPublishedTag === currentTag` 失效的派生断言全部按新锚等价重切，至少覆盖：CHANGELOG 顶部两行为 `[v0.2.16, v0.2.15]`、`v0.2.15` 与 `v0.2.14` 的 notes / changelog 切片各由显式历史锚钉住、`lastReleasedNotesPath === releaseNotesPath`、`isTagBefore(latestPublishedTag, currentTag) === false`、README / 签名文档状态锚同步；不得删除或注释掉任何 `it(` / `expect(`，不得用 `toBeTruthy()` 之类顶替，不得放宽既有匹配或白名单；改动后文件中 `it(` 与 `expect(` 的出现次数均不少于改动前。
- ac-test-body-fixture: `release-packaging.test.ts` 中模拟 Release 正文的 Full Changelog 链接为 `compare/v0.2.15...v0.2.16`，不得因锚点相等出现 `v0.2.16...v0.2.16` 自比较；正文门与链接门的 fail-closed 分支断言保持原样。
- ac-signing-status: `docs/release-signing.md` 第 5 行改为 `当前状态：v0.2.16 已发布`，并给出 v0.2.16 的 Release URL、`docs/release-notes/v0.2.16.md` 与 `docs/release-evidence/v0.2.16.md`；`v0.2.15` 降为历史条目；第三节新增 v0.2.16 的签名 / 公证事实（仅取 `mac-job.log` 与 L1 签名抽查已记录的内容，包括 Developer ID 签名、notarization successful、codesign valid on disk / Designated Requirement satisfied、stapler validate OK、Gatekeeper accepted）；凭据清单、fail-closed 表述与 v0.1.2 漂移段逐字保留。
- ac-evidence-record: `docs/release-evidence/v0.2.16.md` 存在、非空、含且仅含一处 `status: verified`，记录 tag 与发布点、公开 Release、12 件资产、Release CI、双语正文与绝对链接门、L1 六腿结论、内存判据修订说明、已知边界；不写未验证结论，不保留发布产物。
- ac-evidence-values: 证据文件中的 tag 对象 `690358de07c309f73736055ad25c13b11731c6cd`、发布点 `3dab29c0b7039cc4f483e5a8d2955fe95ec079bf`、dmg `111,477,257 B` / `4036c3a3a8523362c42bac6f0256b724edb6c185117a2b2f6c63f4b6bb74690b`、win zip `131,649,968 B`、Setup exe `101,434,344 B` 与上述公开值逐位相等；资产表 12 行名称不重复，字节数与 `release-v0.2.16.json` 一致；dmg 标注为下载实测，其余 11 件不得写成已重新下载。
- ac-evidence-paths: 证据文件中引用的发布期与 L1 证据路径全部可在项目根 `projects/ops_df43e423451170fd/.munk/runs/` 下打开，至少包含 `trun_8d069981668e46c5/evidence/{release-v0.2.16.json,gates-summary.json,mac-job.log,ci-poll.json}` 与 `trun_5d107ebc931e4ffe/{digest.md,evidence/10-download-verify.json,evidence/23-memory-verdict.json,evidence/30-cancel.json,evidence/32-heap-gc-probe.json}`；不得引用不存在的路径。
- ac-memory-criterion: 证据文件明确记录旧判据（轮末堆 `d1 >= d2 >= d3`）在 `23-memory-verdict.json` 下为 fail（第 3 轮比第 2 轮 `+15.6 MB`），并记录 2026-11-02 负责人裁定该判据为缺陷、改按「关会话 + 强制 GC 的保留堆」主判据后为 pass（`241.6 → 241.8 MB`、Δ`0.13 MB`，app 峰值 `1.20 GiB` 在阈值内）；旧读数与补充探针均保留可回查，不删除 fail 记录。
- ac-no-unpublished-ledger: 全仓不新增任何未发布版本号、tag 链接、notes / evidence 路径或「待发布」字样；`v0.2.3` / `v0.2.13` 等既有幽灵 / 折叠版本仍零命中；新证据文件只引用 `v0.2.16` 与已发布历史版本。
- ac-gates: `.munk/code-gates.json` 的全部 gate（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及 `test:*`）在本 worktree 全部通过；不新增、不删除 gate 条目。
- ac-scope: 交付面（`git status --porcelain` 中除 `.munk/**` 过程记录外的路径）恰好只含 `README.md`、`README.zh-CN.md`、`src/main/release-packaging.test.ts`、`docs/release-signing.md`、`docs/release-evidence/v0.2.16.md` 五个路径；`package.json#version` 仍为 `0.2.16`；`CHANGELOG.md`、`docs/release-notes/v0.2.16*.md`、`.github/workflows/release.yml`、任何已公开 tag / Release / 资产 / 正文零改动；`src/**` 除测试文件外零改动。

## Non-Goals

- 不重新打包、不重新公证、不重新上传、不改写已公开 Release 正文或资产；不移动、不删除、不重打 `v0.2.16` 或任何历史 tag。
- 不 bump `package.json#version`，不新增 `CHANGELOG.md` 条目，不改 `docs/release-notes/v0.2.16*.md`。
- 不改 `.github/workflows/release.yml`，不 dispatch 发布，不 push tag，不跑 L3，不做功能或 UI 改动。
- 不新增 code gate、不新增证据目录之外的大文档、不改 `.munk/baseline/**` 与 QA 记录。
- 不在主检出脏树上手改或 commit；所有改动只走本 WorkItem worktree，过 code_gates 后经 delivery 合入 `main`。

## Implementation Constraints

- 仅在上述 5 个路径内改动；`src/main/release-packaging.test.ts` 属于测试耦合面，不是产品源码。
- `latestPublishedTag` 前移后，`v0.2.15` 与 `v0.2.14` 都必须保留显式历史锚（不得跟着最新锚漂移）；`publishedTags` 需覆盖 `v0.2.15`，已发布历史断言不得删除或弱化。
- 测试改动遵循「重锚而非删除」：每个因 `latestPublishedTag === currentTag` 翻面的断言都要有等价的新断言，`it(` / `expect(` 条数不减，负向断言保留；不做顺手重构。
- 证据文件的事实只从 `release-v0.2.16.json`、`gates-summary.json`、`mac-job.log`、`ci-poll.json`、L1 `digest.md` 与指定 evidence JSON 读取，不重新联网取数、不重新下载资产（dmg 的下载实测值引用 L1 `10-download-verify.json`）。
- 资产表可列全部 12 件；其中 dmg 标注「下载实测」，win zip / Setup exe 及其他九件标注「发布期资产 size / digest」，不把 API digest 写成重新下载实测。
- L1 六腿按「公开件身份 / 干净安装与版本 / 三轮反复用 / 内存 / 中途取消 / 日志零噪声」归档；内存腿必须同时记录旧判据 fail 与修定判据 pass，避免只留单边结论。
- 证据路径使用项目根相对路径 `projects/ops_df43e423451170fd/.munk/runs/...`，与既有 `docs/release-evidence/v0.2.15.md` 口径一致；不写入本机用户名绝对路径。
- 不新增 code gate 条目；证据文件的事实由只读命令（`rg` / `shasum` / `test -f`）即可核验，若在既有测试文件追加只读证据断言，只能追加，不得删改既有断言。
