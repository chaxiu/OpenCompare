# v0.2.5 发布证据采集与元数据实测

## 范围

本项是 `cp-release-025` 的收尾取证项：只在 v0.2.5 发布场真正 finalize 之后，把公开 Release 的实测证据回填进 `docs/release-evidence/v0.2.5.md` 并把 `status` 从 `pending` 翻为 `verified`，同时把守它的测试块从 pending 形状改成 verified 形状；顺带修两处符号链接证据的文档断头路。

**Intake 时的实测前置状态（Coding 必须在执行时自行复核，不得沿用本段作为结论）**：`gh run view 39713762292` 已 `completed/success`（5 个 job 全 success，commit `2eedc5de1ebfbc8e835d08d18e959b394fadceb4`）；`gh release view v0.2.5` 为 `isDraft: false`，`publishedAt 2026-10-22T02:56:27Z`，资产恰好 11 件。若执行时该状态不成立（run 未结束/失败、仍为 draft、资产 ≠ 11），只报 blocked，不回填任何数字。

1. **前置硬门（先验后填）**
   - 确认针对修复 commit 的 `workflow_dispatch` run（`39713762292` 或其后继）`conclusion=success`，且 `Quality gates` / `Package mac` / `Package win` / `Package linux` / `Publish the GitHub Release` 五个 job 全部 `success`。
   - 确认 `gh release view v0.2.5 --repo chaxiu/OpenCompare` 为 `isDraft: false`、`isPrerelease: false`，资产恰好 11 件且名字为：`OpenCompare-0.2.5-arm64.dmg`、`OpenCompare-0.2.5-arm64.dmg.blockmap`、`OpenCompare-0.2.5-arm64-mac.zip`、`OpenCompare-0.2.5-arm64-mac.zip.blockmap`、`OpenCompare-Setup-0.2.5.exe`、`OpenCompare-Setup-0.2.5.exe.blockmap`、`OpenCompare-0.2.5.AppImage`、`opencompare_0.2.5_amd64.deb`、`latest-mac.yml`、`latest.yml`、`latest-linux.yml`。
   - run 仍在跑：限时轮询（单次等待≤5 分钟，总时长有界）。失败 / 仍 draft / 缺件：`munk_report_owner` 报 blocked，正文带 run id、失败 step、缺失或多出的资产名；`docs/release-evidence/v0.2.5.md` 保持 `pending` 且不写任何 sha256、字节或通过标记。
2. **§2 资产字节与 sha256**：把 11 件资产下载到仓库外临时目录（`mktemp -d`），逐件 `wc -c` 与 `shasum -a 256` 实测，写进 `docs/release-evidence/v0.2.5.md` 第 2 节现有 11 行表格的「字节 / sha256」两列；并与 GitHub API 的 `.assets[].size` / `.digest` 逐件对齐（不一致即 blocked）。
3. **§3 唯一 Release 与 latest 门原文**：从该 run 的 `finalize` job 日志抓到 `releases for v0.2.5: …` 与 `latest published release: v0.2.5 …` 两行的真实原始输出粘进第 3 节代码块；同时补发布标识（tag、commit、run id、`publishedAt`、Release URL、资产数 11）。
4. **§4 macOS 两套产物原文**：把公开 `dmg` 与 `zip` 下载到临时目录，dmg 用 `hdiutil attach` 挂载、zip 用 `ditto -x -k` 解包，各自取出 `.app`，对**两套产物各跑一遍**并原样粘贴：
   `codesign --verify --deep --strict --verbose=2`、`codesign -dv --verbose=4`、`xcrun stapler validate`、`spctl -a -vv --type execute`；每个标记（`valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID`）在两套产物里各至少出现一次。挂载的 dmg 必须 `hdiutil detach`。
5. **§5 元数据实测**：在含 11 件资产的临时目录执行 `pnpm release:metadata --dir <dir>`，把 stdout 原文粘进第 5 节；断言三份 `latest*.yml` 的每个 `files[].url` / `path` 都命中资产名、`旧错位名 0 命中`、脚本以 0 退出。
6. **status 翻转**：第 2～5 节全部为实测原文且历史核对通过后，把 `status: pending` 改为 `status: verified`（全文只允许一处 `status:`），并改写第 6 节末尾那句「本文件 status 只在第 2～6 节全部回填后…」，使其不再与 verified 矛盾（第 6 节仍是 product-qa 复验交接区，不阻塞研发侧 status）。
7. **测试翻转**：把 `src/main/release-evidence.test.ts` 的 `v0.2.5 pending release evidence document` 块改写为 verified 断言块（参照同文件 v0.2.1 / v0.2.4 结构）：钉死 11 件资产名+sha256、job 结论表、唯一 Release/latest 两行、mac 四个标记各 ≥2、元数据三条命中行与「旧错位名 0 命中」、第 6 节 product-qa 交接标记仍在；并补 verified 分支的负向断言夹具（缺任一标记对、sha256 不足/错误、资产行数 ≠ 11、出现 `pending` 残留 → 判红）。
8. **历史不动核对**：`docs/release-evidence/v0.2.[0-4].md`、`docs/release-notes/v0.2.[0-4].md`（及 CHANGELOG 中 `## v0.2.4` 及更早段落）零改动；测试里 v0.2.1 / v0.2.4 块与其 sha256 钉板零改动。
9. **两处文档断头路**
   - `docs/symlink-no-follow.md` 第 6 节引用了不存在的 `docs/evidence/symlink-footer-old.raw.log` / `-new.raw.log`：删掉或改指向真实存在的文件，保证文中每个被引用的 `docs/...` 路径都可解析。
   - `docs/evidence/symlink-footer-old.json` / `-new.json` 顶部带 `OPENCOMPARE_SYMLINK_EVIDENCE ` 前缀、不是合法 JSON：改成合法 JSON（或改名并在文档同步引用），且 `scripts/measure-symlink-footer.evidence.test.ts` 写文件时不再产出非法 JSON（stdout 保留标记、`OPENCOMPARE_EVIDENCE_OUT` 落纯 JSON），避免下次测量重新写入坏文件。

## 验收

- ac-prereq-gate-first: 执行时先跑前置硬门；run/job 未全 success 或 Release 仍 draft 或资产数 ≠ 11 时，证据文件保持 `status: pending`、零 64 位十六进制、零通过标记，并只产出带 run id / 失败 step / 缺失资产名的 blocked 报告（以测试夹具形式断言 blocked 分支：含 `valid on disk` 或任一 sha256 → problems 非空）。
- ac-run-identity: 证据文件含 run id、被测 commit `2eedc5de1ebfbc8e835d08d18e959b394fadceb4`（或实际 finalize 的 run/commit，且与 `gh run view` 输出一致）、`publishedAt`、Release URL，以及 5 个 job 行全部含 `success`。
- ac-assets-exactly-11: 第 2 节解析出恰好 11 行资产表，资产名与本节列出的 11 个名字逐字相等；每行字节为正整数、sha256 为 64 位小写十六进制且 11 个值互不相同；全文除这 11 个 sha256 外无其它 64 位十六进制。
- ac-status-verified-once: 全文恰好一处 `status:` 且值为 `verified`，不再出现 `pending`。
- ac-no-placeholder: 全文无 `<...>` 占位、`待回填`、`TBD`、`TODO` 字样，且不存在空 `text` 代码块（第 3～5 节都是真实输出）。
- ac-latest-gates: 含 `releases for v0.2.5: 1 (drafts: 0, prereleases: 0)` 与 `latest published release: v0.2.5 (this tag: v0.2.5)` 两行原文。
- ac-mac-both-products: `valid on disk`、`satisfies its Designated Requirement`、`The validate action worked!`、`accepted`、`source=Notarized Developer ID` 每个标记 ≥2 次，且文档明确标注 dmg 内 `.app` 与 zip 内 `.app` 两套来源。
- ac-metadata-all-hit: 第 5 节含 `release:metadata 校验通过：3 份 latest*.yml、11 个资产名。`、`旧错位名 0 命中`，以及三行 `latest*.yml: url N/N 命中资产名`，每行 N 相等；同节可见 `pnpm release:metadata --dir` 命令与其退出码 0。
- ac-windows-hyphen-name: 文档记录 Windows 资产为连字符形态 `OpenCompare-Setup-0.2.5.exe`，并记录 `OpenCompare.Setup.0.2.5.exe` 一类点号/空格旧错位名命中 0。
- ac-history-unchanged: `git diff --stat` 对 `docs/release-evidence/v0.2.0.md`～`v0.2.4.md`、`docs/release-notes/v0.2.0`～`v0.2.4` 为空；`src/main/release-evidence.test.ts` 的 v0.2.1 / v0.2.4 块（含 `v024Assets` 11 组 sha256 钉板）与改动前逐字一致。
- ac-test-green: `pnpm test` 全绿（文件数与用例数不低于改动前），且 `src/main/release-evidence.test.ts` 的 v0.2.5 verified 负向夹具断言生效（删一个标记对 / 改错 sha256 / 少一行资产 / 混入 `status: pending` 都判红）。
- ac-symlink-evidence-json-valid: `node -e "JSON.parse(readFileSync('docs/evidence/symlink-footer-old.json','utf8'))"` 与 `-new.json` 均成功，解析出的 `fileCount` 分别为 1338294 / 752479（内容不得改写）；`scripts/measure-symlink-footer.evidence.test.ts` 以 `OPENCOMPARE_EVIDENCE_OUT` 写出的文件可直接 `JSON.parse`（有测试断言）。
- ac-doc-refs-resolve: `docs/symlink-no-follow.md` 中出现的每一个 `docs/...` 路径在磁盘上都存在（测试遍历断言），不再有任何指向不存在 `.raw.log` 的引用。
- ac-repo-clean: 仓库内无下载产物（`git status --porcelain` 只含 `docs/release-evidence/v0.2.5.md`、`src/main/release-evidence.test.ts`、`docs/symlink-no-follow.md`、`docs/evidence/symlink-footer-*.json`、`scripts/measure-symlink-footer.evidence.test.ts` 及为 ac-symlink-evidence-json-valid 新增的测试文件）。

## 非目标

- 不翻 README / `docs/release-signing.md` 的「待发布 → 已发布」状态，不动 `latestPublishedTag` / `lastReleasedNotesPath` 锚点（归后继 WI）。
- 不打 tag、不 push、不 `workflow_dispatch`、不重跑发布场、不上传/替换/删除任何 Release 资产、不改 release notes 正文。
- 不改产品运行时源码（`src/core/**`、`src/main/**` 除 `release-evidence.test.ts`、`src/renderer/**`、`src/shared/**`）。
- 不改 `.github/workflows/release.yml`、`electron-builder.yml`、`scripts/release-metadata.mjs`（本次只消费它）。
- 不填第 6 节 product-qa 的公开件复验内容（干净环境安装、3 轮真机对比、取消日志、footer 复验），也不代写其结论。
- 不重做签名/公证、不重新打包、不改 v0.2.4 及更早的任何 notes / evidence / 哈希 / tag 描述。
- 不顺手优化文档排版/措辞、不重构测试文件结构、不引入 electron-updater。

## 实现约束

- 所有下载、挂载、解包、`shasum`、`codesign` / `stapler` / `spctl` 都在仓库外临时目录执行；仓库只落文档与测试改动。
- 证据必须来自命令原始输出：`shasum`、`gh`、`codesign`、`xcrun`、`spctl`、`pnpm release:metadata` 原样粘贴，禁止改写、摘要或按骨架预期「凑」结果；真实输出与骨架预期形态不同时以真实输出为准并同步修正文档措辞。
- `status: verified` 的判定门明确为「第 2～5 节实测齐备 + 历史未变」；第 6 节是 product-qa 交接区，需保留其全部标记并把末尾 status 规则句改成不与 verified 矛盾的表述。
- 测试改动只落在 v0.2.5 描述块（外加符号链接证据的新断言），v0.2.1 / v0.2.4 块逐字不动；不得靠删断言换绿。
- 符号链接证据二选一（推荐前者）：① 去掉两个 JSON 的前缀使其合法，并让 `OPENCOMPARE_EVIDENCE_OUT` 落纯 JSON、标记只走 stdout；② 改名为 `.raw.log` 并把文档引用同步到新名。无论哪种，`docs/symlink-no-follow.md` 第 6 节的路径引用必须全部可解析，表格里的 1,338,294 / 752,479 等数字不得改写。
- 若执行中 Release 状态与前置硬门冲突（例如资产被替换导致 sha256 与 API digest 不一致），立即报 blocked，不以任何方式「修好」文档去迁就。
