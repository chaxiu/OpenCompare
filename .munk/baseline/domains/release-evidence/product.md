# Domain: release-evidence

已公开 Release 的仓内取证域：把「某个 tag 的公开 Release 事实」收敛为 `docs/release-evidence/<tag>.md` 的文档形态与数据口径，并把版本 / 状态 / 资产数并入 `src/main/__fixtures__/release-packaging.json#evidence` 的台账与 `currentVersion`。本域只做已核事实的回写与只读复核；打包 / 签名 / 发版通道归 `domains/release`，验收驱动 `scripts/verify-release.mjs` 归 `domains/release-verify`，版本字面量收敛归 `domains/release-version-anchor`。

## 范围

- **证据文件作为唯一取证载体**：每个已公开版本一份 `docs/release-evidence/v<X.Y.Z>.md`，首行标题带版本与汉字，正文含唯一 `status:` 行（`verified` / `blocked`），并把 tag 与发布点、公开 Release 元数据、Release CI 与 post-release-verify run、公开资产表、未覆盖面分段记录；仓库内不保留发布产物。
- **资产表即公开 Release 的只读取样**：表为 5 列 ``| `name` | N B | 口径 | `sha256` | URL |``，name / bytes / sha256 逐条等于公开 Release 的 `size` / `digest` 原始值，不复算、不重下载；`latest*.yml` 标为更新清单，非安装包。
- **台账与文件集合严格对齐**：`release-packaging.json#evidence.ledger` 每行记录 `id` / `version` / `status` / `assets`，版本集合与 `docs/release-evidence/*.md` 文件名集合严格相等；`evidence.currentVersion` 指向最新已取证版本，其资产条目与证据文件表格逐项相等。
- **只读取证**：GitHub 事实只经 `gh release view` / `gh run list` / `gh run view` / `git tag` 单次只读查询；不推 tag、不 dispatch、不改已公开 Release / 资产 / 正文。
- **历史台账与 currentVersion 通道分离**：`docs/release-evidence-ledger.json` 只承载固定历史版本集合，新版本走 `release-packaging.json` 的 `currentVersion` 通道，不并入历史台账。

## 验收

- **ac-evidence-file-verified**：`docs/release-evidence/<tag>.md` 存在且非空；全文恰好一处 `status:` 行且值为 `verified`；首行标题同时含版本号与汉字；全文无 `pending` / `TBD` / `TODO` / `FIXME`。
- **ac-release-identity**：证据文件含 `| tag_name | \`<tag>\` |`、`| 资产数 | 12 |`、含 `tag → commit` 且发布点为 40 位十六进制 commit，并含该 tag 的公开 Release URL。
- **ac-asset-rows-from-public-release**：资产表恰好 12 行，每行 name / bytes / sha256 与公开 Release 单次只读取样逐位相等；口径列与表格格式固定，不新增列。
- **ac-digest-closure**：证据文件中出现的全部 64 位十六进制等于这 12 条资产 sha256 的集合（无额外 digest、无 64 位非小写十六进制 token）。
- **ac-fixture-ledger-row**：`evidence.ledger` 含新增行并按版本顺序插在上一版本之后，`status` 与 `assets` 正确；ledger 的 version 集合与 `docs/release-evidence/*.md` 文件名集合严格相等。
- **ac-current-version-synced**：`evidence.currentVersion.version` 为该版本，其 12 条资产与证据文件表格逐项相等（name / bytes / sha256），`release-evidence.test.ts` 的 current release 两段断言全绿。
- **ac-readme-and-announced-untouched**：`git diff --stat` 对 `README.md`、`README.zh-CN.md`、`release-announced-tag.json` 为空；README 第 5 行状态块与 announced tag 仍为同一已公开版本（本域只核验、零 diff）。
- **ac-release-gates-green**：`release-evidence` / `release-packaging` / `release-version-gate` / `release-artifacts-and-brand` 四组测试全绿，`pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿。
- **ac-readonly-no-publish**：全程只读查询；未 `git push`、未 `gh workflow run`、未 `gh release edit/upload/delete`；`git status --porcelain` 只出现预期的 1 新增证据文件 + 1 修改 fixture。

## 非目标

- 不改 README 第 5 行、`release-announced-tag.json`、`package.json#version`、`CHANGELOG.md`、`release.yml` 与 `docs/release-process.md` 默认 tag（版本推进归 `domains/release-version-anchor`）。
- 不改 `docs/release-evidence-ledger.json`：该文件被测试钉死为固定历史版本集合，新版本不得并入。
- 不改写任何历史证据文件，不改 `docs/release-signing.md` 的「当前状态」行。
- 不重新下载资产、不重算 sha256、不重跑签名 / 公证 / L1，不新增 extraDigests。
- 不新增测试用例或改动门实现（只补数据）；不推 tag、不 dispatch、不创建 / 修改 Release 与资产。
- 不跑浏览器 / 设备 / 桌面 GUI 验收（无 UI 行为）。

## 实现约束

- **文档形态服从既有门解析器**：资产行必须是 5 列扩展行（字节可带千分位逗号，末尾 ` |`）；`release-evidence.test.ts#parseAssetRows` 只认该形态。不要自创表头或缩进。
- **digest 集合严格闭合**：current-release 断言要求文档内 64 位十六进制集合严格等于 12 条资产 sha256 的并集，多一个或少一个即红；blockmap 的 digest 不得重复登记，不得出现 64 位非小写十六进制串。
- **台账顺序与消费**：新增 ledger 行按版本顺序插入，且必须被测试 `useRow` 消费；`release-packaging.test.ts` 同时断言 ledger 版本集合与证据文件名集合相等。
- **版本门影响面**：`publishedTag` 取「verified 证据 + announced tag」的最大值，新增 verified 后仍等于已公开 tag；CHANGELOG 顶段必须仍有该版本条目（此处不改）。
- **改动面纪律**：只新增证据文件并改 `release-packaging.json` 的 `evidence.ledger` / `evidence.currentVersion` 两处，其余字段与文件零 diff；不新增依赖、不改构建、不改门脚本、不改 `src/core/**`。
- **取不到即上报**：任一事实取不到或与公开 Release 不一致时，证据文件写 `blocked` + 来源并上报，不得臆造数字。

## 最近交付证明

- WI：`wi_ws_3c1c2e35a7f5f609`（**v0.2.23 已公开事实收尾：证据文件 + 夹具台账**，`deliveryIntent: local merge`）；日期：2026-11-05；change pack 仅 `prd.md`，无 `tests/cases/**`，本域无新增折叠用例。
- 结果：新增 `docs/release-evidence/v0.2.23.md`（`status: verified`，21 份证据文件之一；12 件资产 5 列表 + tag / 发布点 `d7382541…` + Release run `41985364405` 5/5 + post-release-verify run `41986658187` 6/6）；`release-packaging.json` 追加 `evidence-v0.2.23` 行（`verified` / `assets: 12`）并把 `currentVersion` 由 `v0.2.17` 前移至 `v0.2.23`，12 条资产与证据表逐项一致。
- 关键口径：digest 集合严格等于 12 条资产 sha256 并集；`docs/release-evidence-ledger.json`（5 版本 / 44 行 / 47 digest）未动，新版本只走 `currentVersion` 通道；README 两版第 5 行与 `release-announced-tag.json` 零 diff（已由独立项钉在 `v0.2.23`）。
- 改动面：1 新增证据文件 + `release-packaging.json` 两处（37 插入 / 31 删除）；无测试与门实现改动，`repoTestLines` 与覆盖率基线不变。
