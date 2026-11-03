# 回填 v0.2.18 / v0.2.19 发布证据与 README 版本行

## Scope

把仓内仍停留在「收敛期 / 未发布」的发布证据与 README 状态行，对齐到两版已经公开的事实；只改文档与测试可派生数据，不触碰发布通道。

1. `docs/release-evidence/v0.2.18.md`：`status: blocked`（现文写「未打 tag / 无 Release」）→ 已发布事实记录（`status: verified`）。
2. 新建 `docs/release-evidence/v0.2.19.md`：已公开事实记录（`status: verified`）。
3. `README.md` / `README.zh-CN.md` 第 5 行 `Latest public release` / `最新公开版本` 从 `v0.2.17` 更新到 `v0.2.19`；只换版本号与链接，第 3 行双语互链、其余正文与 9 节结构不动。
4. 为让既有 release 证据门可派生「最新 verified = v0.2.19」，同批更新测试夹具 `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger`：`v0.2.18` 由 `blocked` 改 `verified` + `assets: 12`，新增 `v0.2.19` `verified` + `assets: 12`（见「实现约束」中的先说明）。

已核事实（按此口径写，不得改成别的值）：

- **v0.2.18**：已公开；annotated tag `v0.2.18` = `07e828a8c710b9dabb83f4e11911f156c886b764` → commit `0c6cd203f868b4aa2003b6d571b09d1f3f756f37`；`publishedAt=2026-11-03T05:51:29Z`；`isDraft=false` / `isPrerelease=false`；12 个资产（见下表）；Release run `41585445060` 五 job 全绿；draft verify run `41586060587` aggregate 15/15（mac 8/8、win 6/6、linux 9/9）；public L1 PASS（12 个资产 URL 200、`latest.yml` sha256 与公开 digest 一致）。
- **v0.2.19**：已公开 `2026-11-03T13:59:51Z`；annotated tag `v0.2.19` = `e47e07dd74b0476274622500800121e66c855daf` → commit `fc584af0efea2fa75903ebb2d66bee99c0c20c9b`；`isDraft=false` / `isPrerelease=false`；12 个资产；发布 run `41648064270` 五 job 全绿（Quality gates / Package mac / Package win / Package linux / Publish the GitHub Release）；draft verify run `41649092805` aggregate 15/15（mac 8/8 含 mac-dmg-version / mac-codesign / mac-gatekeeper / mac-stapler；win 6/6；linux 9/9）；public L1 PASS（Release 页 200、9 个受检资产/清单 206、三份 `latest*.yml` `version: 0.2.19`）；L1 真机场次 `trun_ccf0d240216eb4fa` 已 pass（四态 `35 / 80 / 41 / 326,099` 逐位同基线、取消 37 ms、六类日志 0）。

## Acceptance Criteria

- ac-v0218-verified: `docs/release-evidence/v0.2.18.md` 全文恰好一处 `status: verified`，不再出现「未打 tag / 无 Release / blocked」结论；含 tag 对象、tag → commit、`publishedAt=2026-11-03T05:51:29Z`、`isDraft=false`、`isPrerelease=false`、Release 地址与 12 行资产表。
- ac-v0218-assets: v0.2.18 文档 12 行资产的 name / bytes / sha256 与 `gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.18` 的 `assets[].name/size/digest` 逐行一致，sha256 为小写 64 位十六进制。
- ac-v0219-new: `docs/release-evidence/v0.2.19.md` 存在、首行含 `v0.2.19` 与中文标题、全文恰好一处 `status: verified`，含 tag 对象 `e47e07dd74b0476274622500800121e66c855daf`、commit `fc584af0efea2fa75903ebb2d66bee99c0c20c9b`、`publishedAt=2026-11-03T13:59:51Z`、`isDraft=false`、`isPrerelease=false` 与 12 行资产表。
- ac-v0219-assets: v0.2.19 文档 12 行资产的 name / bytes / sha256 与 `gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.19` 的 `assets[].name/size/digest` 逐行一致；三份 `latest*.yml` 标注为清单而非安装包。
- ac-v0219-gates: v0.2.19 文档记录发布 run `41648064270` 五 job success、draft verify run `41649092805` aggregate 15/15（mac 8/8、win 6/6、linux 9/9）与 public L1 PASS（Release 200、9 个受检资产/清单 206、三份 `latest*.yml` `version: 0.2.19`）。
- ac-v0219-l1: v0.2.19 文档记录 L1 真机场次 `trun_ccf0d240216eb4fa` 的结论：四态 `35 / 80 / 41 / 326,099` 逐位同基线、取消 37 ms、六类日志 0；不预写未发生的 pass/fail。
- ac-readme-line5: `README.md` 与 `README.zh-CN.md` 第 5 行标签均为 `v0.2.19`，链接分别指向 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.19`；第 3 行双语互链与其余正文不变。
- ac-latest-verified: 由 `docs/release-evidence/*.md` 的 verified 状态与 `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 派生出的最新 verified tag 为 `v0.2.19`，且 `judgePublishedAnchor` 对两版 README 第 5 行返回 `{ ok: true, issues: [] }`。
- ac-fixture-ledger: `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 中 `v0.2.18` 为 `{ status: verified, assets: 12 }`，并新增 `v0.2.19` 同形条目；`evidenceFiles` 版本集合与该 ledger 版本集合一一对应。
- ac-tests-green: `pnpm test`（至少 `src/main/release-evidence.test.ts`、`src/main/release-packaging.test.ts`、`src/main/release-version-gate.test.ts`、`src/main/release-artifacts-and-brand.test.ts`）全绿；不得删除、跳过或弱化既有断言来凑绿。
- ac-diff-scope: git diff 只落在 `README.md`、`README.zh-CN.md`、`docs/release-evidence/v0.2.18.md`、`docs/release-evidence/v0.2.19.md`、`src/main/__fixtures__/release-packaging.json`（夹具调整须在交付说明中先说明）；`package.json#version` 仍为 `0.2.19`。
- ac-no-release-action: 未推 tag、未 dispatch workflow、未改动 GitHub 上已公开 Release 正文或资产；没有新增/删除/移动任何 tag。
- ac-evidence-reproducible: 文档中每个字节数与 sha256 都能由单次 `gh api repos/chaxiu/OpenCompare/releases/tags/<tag> --jq '.assets[]|[.name,.size,.digest]|@tsv'` 复核；取不到的项写 `blocked` + 原因与来源，不臆造数字。
- ac-delivery-window: 交付说明逐条写「未发布：`<sha>` `<标题>` `<原因=22:00 后内容顺延下一窗口>`」，本项内容不进今晚发布窗口。

## Non-Goals

- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`.github/workflows/**`。
- 不推 tag、不 `workflow_dispatch`、不重新打包 / 公证、不改已公开 Release 正文与资产。
- 不动 `src/main/` 下的产品业务代码；不改历史已 `verified` 的证据行（v0.2.0–v0.2.17 保持原样）。
- 不新增 `docs/release-evidence-ledger.json` 条目（该文件是 5 条历史固定行，`release-evidence.test.ts` 明确断言其恰为 `v0.2.1/v0.2.2/v0.2.4/v0.2.5/v0.2.7`；最新版本派生走证据目录 + 夹具 ledger 的既有机制）。
- 不做 L2 计时负载腿，不重跑签名 / 公证 / 三平台构建。

## Implementation Constraints

### 已核资产表（写文档时逐行照抄；来源为单次 gh api 的 asset `size` / `digest`）

v0.2.18（12 件）：

| name | bytes | sha256 |
| --- | --- | --- |
| `latest-linux.yml` | 535 | `2a28ce78ea8d84d778341c8a000957c472d544e92fb780cec86ab836d6566d78` |
| `latest-mac.yml` | 521 | `dd8e0456d21a1167fa8c0e15f06d03654bfb903cf97f97b9c00ed978358f8709` |
| `latest.yml` | 354 | `511032150ea3991d0bb86652b2c19fae16b838419a569ba29dc36ff7fee06e8a` |
| `OpenCompare-0.2.18-arm64-mac.zip` | 107,368,413 | `771ac2cd7927ff20257d5ab19981dbb150a1f4b75cc335104fc9752ed251bf38` |
| `OpenCompare-0.2.18-arm64-mac.zip.blockmap` | 113,846 | `2148086e662dc758b620c90492eb6cf0eba954bdd793e5e0c37a6e86a0bc4a71` |
| `OpenCompare-0.2.18-arm64.dmg` | 111,493,303 | `0a2b85b8e787339a7bda5c110dbf29df947efe31aa1cb029fb9ce538333b985b` |
| `OpenCompare-0.2.18-arm64.dmg.blockmap` | 117,810 | `63da3d83a1a2206b3a34e871357443ac707f042431665d16b889a069bfd089f0` |
| `OpenCompare-0.2.18-win-x64.zip` | 131,654,980 | `a4600ae5bc4805c638a6b96bde55d1222494df62e20d1dc8f3a601e12b70f135` |
| `OpenCompare-0.2.18.AppImage` | 118,170,989 | `d2da77fd07b03f2988f3c1ff6478b2a8b4660aaa738446f31681159f6741e41c` |
| `OpenCompare-Setup-0.2.18.exe` | 101,401,560 | `638d42a9f8a452acb86c8c1d0fb5d423c3a38a00b704ccb73a092a0a6157faa9` |
| `OpenCompare-Setup-0.2.18.exe.blockmap` | 106,713 | `45feb31927acc134fcad72dd53945a146b54d9f908e33bdc17781cff089de735` |
| `opencompare_0.2.18_amd64.deb` | 92,238,172 | `8a992b145066a6fefb8978fc117c4cdc274628e7b57954fb6f87ed15b873e580` |

v0.2.19（12 件）：

| name | bytes | sha256 |
| --- | --- | --- |
| `latest-linux.yml` | 535 | `136eb3ca6ea0674a2502e625709a5a238e294baf723ef08f80a0bbe929a646b5` |
| `latest-mac.yml` | 521 | `9f566da8d3a38f1383e3d45d9c40c43aef53779dc9223bd3bb5521d8e4b84492` |
| `latest.yml` | 354 | `d919132d1c771c66afc2a6698e33fbb055cd1179d0ad31a849e491bcdce9ab42` |
| `OpenCompare-0.2.19-arm64-mac.zip` | 107,370,858 | `5e2627594668189c14ce9a1892226ca7459b970d6a8280e57f49cdb447048743` |
| `OpenCompare-0.2.19-arm64-mac.zip.blockmap` | 113,718 | `68ad11af0b39e2746a179848a7cab978eb020348a975a078a406abce69bc8ec5` |
| `OpenCompare-0.2.19-arm64.dmg` | 111,495,861 | `a09c25fa33e1fef3d72a3e161a3de99eac7691357099d8c2da35d82dc64f52c3` |
| `OpenCompare-0.2.19-arm64.dmg.blockmap` | 118,156 | `7535269068b801cbd7911fc8d4c867b527ef3454ebfa0a35638b84eb69d63f52` |
| `OpenCompare-0.2.19-win-x64.zip` | 131,657,180 | `c54b2772909eda628f7445270b31338fe056dfce0d5623f5a610d9251f3e5c28` |
| `OpenCompare-0.2.19.AppImage` | 118,175,151 | `67177368799540c2e5595e52693d4c5bff838447e9b99e4751af874c9d980ff9` |
| `OpenCompare-Setup-0.2.19.exe` | 101,403,516 | `562cbbd3226caef8633562ceb8676af90e1bd6290f6d9765dd642252915ba814` |
| `OpenCompare-Setup-0.2.19.exe.blockmap` | 106,718 | `9f0594e1b02b89da3701edebb9eec0570010221a17b1fdcdfeb497cd0fe0e15d` |
| `opencompare_0.2.19_amd64.deb` | 92,244,572 | `0ea4d9cfc3183e422f767418a99066f4f3aff8ded096c1eba1e6195fd2a5bfa1` |

### 文档结构（对齐 `docs/release-evidence/v0.2.17.md`，满足 `release-packaging.test.ts` 的解析器）

- 第 1 行必须是 `# v0.2.xx ...` 且含中文；第 3 行必须是唯一的 `status: verified`。
- 表格必须包含可被解析的 `| 资产数 | 12 |`、`| tag | \`v0.2.xx\` |`、以及含 `tag → commit` 且 backtick 包裹 7–40 位十六进制的行（解析器用它取 commit）。
- 全文必须出现 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.xx`。
- 12 件资产放在同一张 `| \`名称\` | 字节 B | 口径 | \`sha256\` | 公开 URL |` 表中；资产名尽量只在该表出现，避免解析器在其他 `|` 行重复收集到家族外的名称。
- `latest-linux.yml` / `latest-mac.yml` / `latest.yml` 在正文中明确标注为「清单」，不是安装包。
- 无法取得的项（例如 v0.2.18 的 notarization 原文时间戳）写「未取到，需补」+ 来源，不编造；但已有 verify run 的 mac-codesign / mac-gatekeeper / mac-stapler PASS 可如实引用。

### 门禁与夹具（先说明：这批是保持断言更强、非绕过）

- 新增 `docs/release-evidence/v0.2.19.md` 后，`release-packaging.test.ts` 的「covers every evidence file once and keeps the ledger family」要求 `fixture.evidence.ledger` 版本集合与证据文件集合完全一致，故必须新增 `v0.2.19` 行。
- 将 `v0.2.18.md` 改为 verified 后，`it.each(fixture.evidence.ledger)` 会校验状态与资产数，故 `v0.2.18` 行必须由 `blocked` 改为 `{ status: verified, assets: 12 }`。
- 保留 `fixture.evidence.currentVersion = v0.2.17` 不动：`release-evidence.test.ts` 用它锁定 v0.2.17 的 12 行历史资产；改成 v0.2.19 只会扩大夹具面，不影响「最新 verified」派生。
- `docs/release-evidence-ledger.json` 保持 5 条历史行不动；`release-evidence.test.ts` 明确断言该集合，派生最新版本由 `release-doc-fixtures.test-helpers.ts` 合并证据目录与夹具 ledger 完成。
- 先写两份证据与夹具，最后改 README 第 5 行，保证 `release-version-gate.test.ts` 的 `judgePublishedAnchor(releaseFacts.publishedAnchor)` 一次性成立。

### 命令与证据入口

- 资产复核（只读、单次）：`gh api repos/chaxiu/OpenCompare/releases/tags/v0.2.18 --jq '.assets[]|[.name,.size,.digest]|@tsv'`，`v0.2.19` 同形。
- v0.2.19 证据源：产品目录 `projects/ops_df43e423451170fd/.munk/runs/trun_7508c98e06ad811c/evidence/public-l1.txt`、`.../verify-run-41649092805-checks.txt`、`.../trun_7508c98e06ad811c/digest.md`；L1 真机 `trun_ccf0d240216eb4fa`。
- v0.2.18 证据源：Release run `41585445060`、post-release-verify run `41586060587`（aggregate 15/15）、public L1 见 run 日志 `public L1 PASS: … + 12 asset URLs 200, latest.yml sha256 matches …`。
- 门禁命令：`pnpm test`（重点 `src/main/release-evidence.test.ts`、`src/main/release-packaging.test.ts`、`src/main/release-version-gate.test.ts`、`src/main/release-artifacts-and-brand.test.ts`）；交付前跑 `.munk/code-gates.json` 对应门，结果写进交付说明。
