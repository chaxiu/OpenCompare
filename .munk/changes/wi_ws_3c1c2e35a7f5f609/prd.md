# v0.2.23 已公开事实收尾（证据 + 夹具台账）

## 范围

把已公开 `v0.2.23` 的发布事实回写成仓库内的可回归台账，只动两处：

1. 新增 `docs/release-evidence/v0.2.23.md` —— `status: verified`，记录 tag / 发布点、公开 Release、Release CI 与 post-release-verify、12 件公开资产的 name / bytes / sha256 / 公开 URL，以及未覆盖面。
2. `src/main/__fixtures__/release-packaging.json` ——
   - `evidence.ledger` 追加一行 `evidence-v0.2.23`（`version: "v0.2.23"`、`status: "verified"`、`assets: 12`）；
   - `evidence.currentVersion` 由 `v0.2.17` 前移为 `v0.2.23`，其 12 条资产与证据文件逐行一致。

README 两版第 5 行与 `src/main/__fixtures__/release-announced-tag.json` 已由独立项钉在 `v0.2.23`，本项**只核验、零 diff**。所有 GitHub 事实只做只读查询，不推 tag、不 dispatch、不改已公开 Release 与资产。

本项是 `cp-release-024` 的前置：v0.2.23 已公开事实收尾完成后，后续 `release-024-anchor` 才能把 CHANGELOG 顶段推进到 v0.2.24。

## 验收

- ac-evidence-file-verified: `docs/release-evidence/v0.2.23.md` 存在且非空；全文恰好一处 `status:` 行且值为 `verified`；首行标题同时含 `v0.2.23` 与汉字；全文无 `pending` / `TBD` / `TODO` / `FIXME`。
- ac-release-identity: 证据文件含 `| tag_name | \`v0.2.23\` |`、`| 资产数 | 12 |`、含 `tag → commit` 且有 40 位十六进制发布点 `d7382541dedf569de1ad61e0042a9e9b3ddec510`，并含 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23`。
- ac-asset-rows-from-public-release: 资产表恰好 12 行，采用现有 5 列格式 ``| `name` | N B | 口径 | `sha256` | URL |``；每行 name / bytes / sha256 与公开 Release 单次只读取样逐位相等（取值见「实现约束」表）。
- ac-digest-closure: 证据文件中出现的全部 64 位十六进制等于这 12 条资产 sha256 的集合（无额外 digest、无 64 位非小写十六进制 token）。
- ac-fixture-ledger-row: `evidence.ledger` 含 `evidence-v0.2.23` → `v0.2.23` / `verified` / `assets: 12`，且 ledger 的 version 集合与 `docs/release-evidence/*.md` 文件名集合严格相等（21 个文件 ↔ 21 行）。
- ac-current-version-synced: `evidence.currentVersion.version` 为 `v0.2.23`，其 `assets` 12 条与证据文件表格逐项相等（name / bytes / sha256）；`src/main/release-evidence.test.ts` 的 current release 两段断言全绿。
- ac-readme-and-announced-untouched: `git diff --stat` 对 `README.md`、`README.zh-CN.md`、`src/main/__fixtures__/release-announced-tag.json` 为空；两版 README 第 5 行仍为 `v0.2.23` 链接，`release-announced-tag.json` 仍为 `v0.2.23`。
- ac-release-gates-green: `pnpm test src/main/release-evidence.test.ts src/main/release-packaging.test.ts src/main/release-version-gate.test.ts src/main/release-artifacts-and-brand.test.ts` 全绿，`pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿。
- ac-readonly-no-publish: 全程只执行只读查询（`gh release view` / `gh run list` / `gh run view` / `git tag`）；未 `git push`、未 `gh workflow run`、未 `gh release edit/upload/delete`；`git status --porcelain` 只出现上述 3 个预期路径（1 新增 + 1 修改；候选文件之外的改动为零）。

## 非目标

- 不改 `README.md` / `README.zh-CN.md` 第 5 行，不改 `release-announced-tag.json`，不改 `package.json#version`、`CHANGELOG.md`、`release.yml`、`docs/release-process.md` 默认 tag（这些归 `release-024-anchor`）。
- 不改 `docs/release-evidence-ledger.json`：该文件被 `release-evidence.test.ts` 钉死为 5 个历史版本 / 44 行 / 47 个 digest，v0.2.23 走 `release-packaging.json` 的 `currentVersion` 通道，不得并入。
- 不改写任何历史证据文件（v0.2.0–v0.2.21），不改 `docs/release-signing.md` 的「当前状态」行。
- 不重新下载资产、不重算 sha256、不重跑签名 / 公证 / L1，不新增 `extraDigests`。
- 不新增测试用例或改动任何门实现（本项只补数据；`repoTestLines` 与覆盖率基线保持不变）。
- 不推 tag、不 dispatch release、不创建 / 修改 Release 与资产、不建 Release 正文。
- 不跑浏览器 / 设备 / 桌面 GUI 验收（本项无 UI 行为）。

## 实现约束

### 只读取样结果（单次 `gh release view v0.2.23`，2026-11-05）

- tag `v0.2.23` 为 annotated tag，tag 对象 `dc76bd85033ed90fb3394e813f65723542961423`，解引用发布点 `d7382541dedf569de1ad61e0042a9e9b3ddec510`；本项**不重指、不重打**。
- Release：`tagName=v0.2.23`、`isDraft=false`、`isPrerelease=false`、`publishedAt=2026-11-05T07:23:52Z`、URL `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23`、资产数 12。
- Release CI：run `41985364405`（`push` on `v0.2.23`）五个 job 全 `success` —— `Quality gates` / `Package mac` / `Package win` / `Package linux` / `Publish the GitHub Release`。
- post-release-verify：run `41986658187` 六个 job 全 `success` —— `spike (macos-latest)` / `spike (ubuntu-latest)` / `verify (windows)` / `verify (linux)` / `verify (mac)` / `aggregate`。

12 件资产（`name` / `bytes` / `sha256`，取自公开 Release 的 `size` / `digest` 原始值）：

| 资产 | 字节数 | sha256 |
| --- | --- | --- |
| `latest-linux.yml` | 535 | `6f56143f25f64bc16ae408e52d8670b8f062503c31da7a3913c33168dfd9ed0f` |
| `latest-mac.yml` | 521 | `3cf4dc9ca3be4c8f7e62cdf933a268b4529fb3a57d0af9f7ce37cc163b9cbea2` |
| `latest.yml` | 354 | `336204c4cdc7c25eaa8b6a3a2da97d5216a97f5f7d3a9376b552ae0758d28b57` |
| `OpenCompare-0.2.23-arm64-mac.zip` | 108513024 | `c2e0c2df7351ca1f497b486f4d28f1704684c5304cf450752f24bd9c045c64b6` |
| `OpenCompare-0.2.23-arm64-mac.zip.blockmap` | 115256 | `7b09a40476c43a3caee1d93a225a3700124aa8f48121110be770ea02f04af83d` |
| `OpenCompare-0.2.23-arm64.dmg` | 112722287 | `cacb89ca65de98730ec096b944f9201574f448f93e34f754a05e1da041068849` |
| `OpenCompare-0.2.23-arm64.dmg.blockmap` | 118952 | `ca53cdf8980b573abb55476fac792bb7375725e743ae5da5c8256383bb623785` |
| `OpenCompare-0.2.23-win-x64.zip` | 132799436 | `2e302af8fc1b49bcca635388ec0672a9c5854c6d2de61811377cea8db6a83b33` |
| `OpenCompare-0.2.23.AppImage` | 119417558 | `9cce05bb1ddc786aa07b9bf73d1c85be467444e20213fe25dd40e5f549747693` |
| `OpenCompare-Setup-0.2.23.exe` | 102334640 | `7fc67ea06e1f48e3b44212e89b095fd6ae27920c75edd2a33e5f81c21f2ab33d` |
| `OpenCompare-Setup-0.2.23.exe.blockmap` | 107768 | `304972434e5f9d933ce49f6f7bc7279d2aadb699d2097b221e9ca9dbd0b4065e` |
| `opencompare_0.2.23_amd64.deb` | 93200548 | `e252f728bebeae423a49988aacc0da420698f2745e06331b9f8b733f7fded79a` |

Coding 若需复核，只允许再一次单次只读 `gh release view v0.2.23 --repo chaxiu/OpenCompare --json ...`；不得下载资产。

### 现有门对文档形态的硬约束（照 v0.2.21 / v0.2.17 现有格式写，勿自创）

- `src/main/release-evidence.test.ts` 的 `parseAssetRows` 只认 5 列扩展行：``| `name` | 1,024 B | 口径 | `sha256` | URL |``（字节数可带千分位逗号，末尾必须有 ` |`）。
- 同文件的 current-release 断言要求：文档内 64 位十六进制集合 **严格等于** 12 条资产 sha256 的并集，多一个 digest 或少一个都红；因此不要把 blockmap / 文件的其它 digest 重复登记，也不要写任何 64 位非小写十六进制串。
- `src/main/release-packaging.test.ts`：`parseEvidence` 从首行取版本与汉字、从 `| 资产数 | 12` 取声明数、从 `| tag_name | \`v0.2.23\` |` 取 tag、从含 `tag → commit` 的表格行取 40 位 commit；资产名从 `| ` 开头的行按资产家族正则抽取并去重，数量必须等于 12，非 `latest*.yml` 的资产名必须含 `0.2.23`。
- 同文件断言 `fixture.evidence.ledger` 的 version 集合与 `docs/release-evidence/*.md` 文件名集合严格相等；每行 id 必须被测试消费（`useRow`），新增行按版本顺序插在 `evidence-v0.2.21` 之后。
- `src/main/release-version-gate.test.ts` 的 `publishedTag` 取「已 verified 证据 + announced tag」的最大值：新增 `v0.2.23` verified 后仍为 `v0.2.23`；CHANGELOG 顶段必须仍有 `v0.2.23` 条目（当前已满足，不改）。
- `src/main/release-evidence.test.ts` 的 historical ledger（`docs/release-evidence-ledger.json`）只允许 5 个版本，**不要**把 v0.2.23 加进去。

### 纪律

- 只改 `docs/release-evidence/v0.2.23.md`（新增）与 `src/main/__fixtures__/release-announced-tag.json` 之外的 `src/main/__fixtures__/release-packaging.json`（仅 `evidence.ledger` 与 `evidence.currentVersion` 两处），其余字段与文件零 diff。
- 不新增依赖、不改构建、不改门脚本、不改 `src/core/**`。
- 交付说明必须附：本次只读命令、`git status --porcelain` 输出、`git diff --stat`、四组 release 测试与 `pnpm test` 的实跑结果；若任何一条取不到或与上表不一致，按既有纪律把证据文件写成 `blocked` + 来源并上报，不得臆造数字。
