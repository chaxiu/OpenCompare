# v0.2.4 发布收尾：状态翻转、深度取证与更新元数据一致性

## 范围

单条闭环，只做发布收尾的文档、CI 发布门与对应测试；不做任何功能改动。

1. **发布状态翻转（不靠删断言过关）**
   - `README.md` 第 5 行状态改为 v0.2.4 已发布，并给出公开下载页 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4`；第 5 行原有签名/公证/6 项 Secret/fail-closed 文案保留。
   - `README.md` 第 13 行（「版本与下载」表中 v0.2.4 行）状态由「待发布」改为「已发布」并链接该 Release；v0.2.2 行不再自称「最新公开 Release」（改为上一版已发布）；v0.2.3 行保持「未发布，内容并入 v0.2.4」且不出现 Release 链接。
   - `docs/release-signing.md` 第 5 行「当前状态」同步翻转为 `v0.2.4 已发布`，避免与 README 自相矛盾。
   - `src/main/release-packaging.test.ts` 中原先断言「待发布」的状态门**逐条翻转**为断言「已发布 + Release 链接」，不是删除断言。
2. **`docs/release-evidence/v0.2.4.md` 深度取证**（新文件，只引用既有证据，不编造数字）
   - CI run `39692988051` 五个 job 全 success（Quality gates / Package mac / Package win / Package linux / Publish the GitHub Release）、`55d3af2d` commit；
   - 11 个资产 sha256 全表（与 `evidence/assets-sha256.txt` 逐条一致）；
   - mac Developer ID 签名 + 公证 + `stapler validate` + `spctl accepted` 的原文/复核记录，并标明每条来源（CI 日志 vs 本机复核）；
   - `latest` 门与「该 tag 恰好 1 个公开 Release」原文；
   - v0.2.4 起既有的 P2 更新元数据缺陷记录（只记录，不改写已发布资产）。
3. **README「已知问题」如实登记三条未修项**（标注「已知未修 + 影响」，不得写成已修复，不得删除既有条目）
   - 同进程连续多轮大目录对比内存增长 849 → 1,510 MB（未 OOM）；
   - 取消时主进程 stderr 的 `ECANCELED` 日志噪声（不影响取消结果）；
   - 符号链接计数放大（显示值偏大，不影响对比结果）。
4. **更新元数据一致性（修未来，不动已发布）**
   - `electron-builder.yml` 的 `nsis` 段显式 `artifactName`（去空格），使磁盘产物名与 `latest.yml` 的 `files[].url` 模板对齐；
   - 发布 finalize 新增 fail-closed 门：`latest*.yml` 每个 `files[].url`（含 `path`）必须命中该 Release 的资产名集合；
   - 确认 Linux AppImage blockmap 形态：electron-builder 把 blockmap 内嵌在 AppImage 尾部、不产出独立 `*.AppImage.blockmap`，`latest-linux.yml` 的 `blockMapSize` 是内嵌 payload 长度；新增本地可验的自洽断言（AppImage 末 4 字节小端 uint32 == `blockMapSize`），并明确不要求独立 blockmap 资产；
   - 上述配置/门各配自动化断言，`pnpm test` 必须全绿。

## 验收

- ac-readme-status-line: `README.md` 第 5 行包含 `当前发布状态：v0.2.4 已发布` 与 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4`，且不再包含 `待发布`、`最新公开 Release 为 [v0.2.2]`。
- ac-readme-status-line-keeps-signing-copy: 同一第 5 行仍包含 `Developer ID 签名 + Apple 公证`、`fail-closed`、`App Store Connect API Key` 与 6 项 Secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）。
- ac-readme-download-table: 「版本与下载」表中 v0.2.4 行为 `已发布` 且含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4`；v0.2.2 行含 `已发布` 但不含 `最新公开 Release`；v0.2.3 行含 `未发布`、`内容并入 v0.2.4` 且不含 `releases/tag/v0.2.3`。
- ac-signing-doc-status: `docs/release-signing.md` 第 5 行含 `当前状态：v0.2.4 已发布`，且全文不再出现 `v0.2.4 待发布`。
- ac-release-gate-tests-flipped: `pnpm test` exit 0；`src/main/release-packaging.test.ts` 源码中不再存在 `当前发布状态：${currentTag} 待发布` 与 `当前状态：${currentTag} 待发布` 这类正向断言文本，且新增/翻转后的断言仍要求 README 状态行与下载表出现「已发布 + Release 链接」（断言总数不减少）。
- ac-readme-known-issues-unfixed: `README.md` 的 `## 已知问题` 段保留原两条 `当前版本已修复` 条目，并新增恰好三条含 `已知未修` 的条目，分别包含 `849`、`1,510 MB`、`未 OOM`、`ECANCELED`、`不影响取消结果`、`符号链接计数放大`；新增条目不出现 `已修复` 措辞。
- ac-evidence-doc-identity: `docs/release-evidence/v0.2.4.md` 存在且非空，含 `status: verified`、`v0.2.4`、`39692988051`、`55d3af2db1632d05f94b3eca88020240714b21f6`，并列出 `Quality gates`、`Package mac`、`Package win`、`Package linux`、`Publish the GitHub Release` 五个 job 且均标 success。
- ac-evidence-assets-table: 文档中的资产名集合与 `evidence/assets-sha256.txt` 的 11 个名称完全相等，且每个 sha256 与该文件逐条相等；文档不出现该清单之外的 64 位十六进制串。
- ac-evidence-mac-signing: 文档各至少出现一次 `notarization successful`、`valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID`、`Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)`、`TeamIdentifier=3X4J53U6RY`、`flags=0x10000(runtime)`，并标注该条来自 CI 日志还是本机复核。
- ac-evidence-release-gates: 文档含 `releases for v0.2.4: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.4 (this tag: v0.2.4)`，并声明 11/11 sha256 与 GitHub API `.assets[].digest` 相等。
- ac-evidence-known-defect: 文档把 `latest.yml` Windows url `OpenCompare-Setup-0.2.4.exe` 与真实资产 `OpenCompare.Setup.0.2.4.exe` 的不一致记为 P2 遗留，标注 `v0.2.2 起既有`、`无运行时消费者`、本次不重发/不改写已发布资产。
- ac-nsis-artifact-name: `electron-builder.yml` 的 `nsis.artifactName` 等于 `${productName}-Setup-${version}.${ext}`，测试同时断言该值不含空格且 `${productName}-Setup-${version}` 与 `latest.yml` 的 `files[].url` 模板一致（不再产生 `OpenCompare.Setup.<ver>.exe` 与 `OpenCompare-Setup-<ver>.exe` 分叉）。
- ac-finalize-latest-url-gate: `.github/workflows/release.yml` 在 `Assert the public release has every platform asset` 之后、`Assert the tag is the latest published release` 之前存在新步骤，逻辑为「取该 Release 资产名集合 → 对每个 `latest*.yml` 资产的 `files[].url`（及存在时的 `path`）做成员校验 → 任一缺失打印 `::error::` 并 `exit 1`」；测试断言该步骤顺序、关键字（`files[].url`、资产名集合、`exit 1`）与只读性（步骤体内无 `gh release upload|edit|create|delete`、无 `--method POST/PATCH/PUT/DELETE`）。
- ac-appimage-blockmap-gate: linux 打包 job 存在断言：`release/*.AppImage` 末 4 字节按小端 uint32 解码后等于 `latest-linux.yml` 中该 AppImage 条目的 `blockMapSize`，不等即失败；同一断言不要求存在独立 `*.AppImage.blockmap` 资产。fixture 测试覆盖「相等通过」「不等失败」两分支。
- ac-metadata-doc-note: `docs/release-evidence/v0.2.4.md`（或 `docs/release-signing.md`）记录 AppImage blockmap 结论：electron-builder 不产出独立 `*.AppImage.blockmap`，`blockMapSize` 为内嵌 payload 长度，因此 v0.2.4 的 `latest-linux.yml` 形态自洽。
- ac-gates-green: `.munk/code-gates.json` 的 install / lint / typecheck / build / build-web / test 六道门全部通过。

## 非目标

- 不动四态语义、目录/文本/CSV 对比与三向合并算法、快照线格式；不重做 UI、不改样式。
- 不修内存增长、不修 `ECANCELED` 日志噪声、不修符号链接计数放大本身——只如实记录。
- 不改写、不移动、不删除、不重打已公开的 tag（含 v0.2.4 及更早）与其资产；不重发版本、不补发 v0.2.3、不为 v0.2.4 重新上传任何产物。
- 不改写已发布的 `docs/release-notes/v0.2.4.md`、`CHANGELOG.md` 历史条目与 Release body。
- 不新增自动更新能力、不引入 `electron-updater` 依赖（本次只让元数据自洽）。
- 不改 `workflow_dispatch` 默认 tag、不改发布矩阵/触发方式/Secret 接线，不新增 CI 依赖或 checkout 到 finalize。
- 不清理、不重建历史证据文件（v0.2.0 / v0.2.1 / v0.2.2 原样保留）。

## 实现约束

- 取证素材唯一来源（只读）：`projects/ops_df43e423451170fd/.munk/runs/trun_bbe73a39d8b010e0/evidence/`（`assets-sha256.txt`、`mac-job.log`、`finalize-job.log`、`win-job.log`、`run-watch.log`）与 `projects/ops_df43e423451170fd/cases/2026-10-22/release-v024.md`、同 run `digest.md`。资产 sha256 以 `assets-sha256.txt` 为准；字节数只取 digest 表；本机复核结论必须标为「本机复核（case 记录）」，不得把摘要写成 CI 原始输出。
- 现有门禁测试读法（`src/main/release-packaging.test.ts`）：`currentTag` 由 `package.json` 推导；`publishedTags` 需把 `v0.2.4` 视为已发布标签（可保留 `currentTag` 并集），ghost 版本仍必须无 tag/无 Release/无证据文件/无链接。
- `latest*.yml` 门可复用既有 step 的 bash 风格；finalize job 没有 checkout，禁止依赖仓库内 node 模块或 yq 等额外工具，用 runner 自带能力（`gh` + shell/内建 node 单文件脚本，无 `yaml` 包）实现；元数据解析需兼容 electron-builder 输出的 `files:` 列表形态（`- url:` 行）。
- AppImage 断言放在 matrix linux job 内（本地 `release/` 有真实 AppImage，避免 Web 下载）；读末 4 字节即可，不要整包读入内存。
- 已知取舍：新 url 门是 fail-closed。若将来对 `v0.2.4` 做 `workflow_dispatch` 重跑，因该 tag 内配置尚未含 `nsis.artifactName` 修复，门会拦住旧的错 url 元数据并失败——这是预期的「不发布坏元数据」行为，不在本次改写已发布 tag/资产。
- 遵循仓库现有文案风格（中文、表格/代码块取证、失败即终止口径），证据文件保持只读叙事，不写 emoji。
