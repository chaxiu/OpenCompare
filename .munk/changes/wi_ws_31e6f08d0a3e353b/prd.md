# v0.2.9 发布收尾：README 状态行、签名文档与 v0.2.9 证据归档，门禁翻到 latest === current

把 `main` 从「v0.2.9 已公开发布、仓库仍停在 v0.2.8 发布前姿态」纠正为对外事实一致：
`latestPublishedTag === currentTag === v0.2.9`，README 第 5 行、签名文档、发布证据全部指向 v0.2.9，
并且每个随发布事实翻面的派生断言都被**重锚**而不是删除。

## 范围

改动面恰好 5 个文件：

1. `README.md`、`README.zh-CN.md` 第 5 行：`v0.2.8` / Release 链接前移到 `v0.2.9`。其余行、互链、9 节结构、徽章、截图不动，其余行不出现任何 `vX.Y.Z`。
2. `src/main/release-packaging.test.ts`
   - `latestPublishedTag = 'v0.2.9'`；`previousPublishedTag = 'v0.2.8'`。
   - `publishedTags` 补回显式字面量 `'v0.2.6'`，仍覆盖 `v0.2.0` / `v0.2.1` / `v0.2.2` / `v0.2.4` / `v0.2.5` / `v0.2.6` / `v0.2.7` / `v0.2.8` / `v0.2.9`。
   - 版本门按收尾态翻面：`latestPublishedTag === currentTag`、`isTagBefore(latestPublishedTag, currentTag) === false`、`isTagBefore(previousPublishedTag, latestPublishedTag) === true`、`isTagBefore(previousPublishedTag, currentTag) === true` 全部仍被断言（等价替换，不得无替代删除）。
   - 所有随 `latest === current` 翻面的派生断言按新锚重切：changelog 排序（current 与 latest 同位置）、current 段切片终点、上一版段切片起点、「沿用上一版口径」段落的版本引用、两份 notes 路径相等、README 锚、签名文档当前状态 / 姿态 / notes / evidence 锚、`tag 之后的修复由 … 承接`。
   - 现有 **v0.2.8 证据测试块**锚点改到 `previousPublishedTag`（`v0.2.8`，路径 `docs/release-evidence/v0.2.8.md`），原断言逐条保留（commit `356ad044…`、run `40427569024`、五 job success、11 资产名 + URL、`113,437,237 B`、dmg sha、L1 `trun_e9d687a57b51de6f` 零失败、负载 `trun_ecbdd72beef29b0a` 全套数字与口径短语、以及原本的 banned / 40-hex 唯一性断言）。
   - **新增 v0.2.9 证据测试块**只断言 `docs/release-evidence/v0.2.9.md` 里实际写入的内容（见「验收」）。
   - `v0.2.6` / `v0.2.7` 的 changelog、notes、evidence 断言改用显式历史锚（`'## v0.2.6'` / `'## v0.2.7'` / `'v0.2.6'`），不随 `previousPublishedTag` 前移而改变指向。
3. `docs/release-signing.md`：当前状态、第三节标题、notes / evidence 引用、`tag 之后的修复由 … 承接`、第五节补发默认值全部指向 `v0.2.9`；v0.2.8 降为该节历史条目（不得写「当前状态：v0.2.8」）。
4. `docs/release-evidence/v0.2.9.md`（新建）：只写可核事实，取不到的字段逐项写 `blocked` + 证据缺口。

## 验收

- ac-latest-equals-current: `latestPublishedTag === currentTag === 'v0.2.9'`，且 `isTagBefore(latestPublishedTag, currentTag) === false`。
- ac-previous-anchor: `previousPublishedTag === 'v0.2.8'`，`isTagBefore(previousPublishedTag, latestPublishedTag) === true`，`isTagBefore(previousPublishedTag, currentTag) === true`。
- ac-published-tags: `publishedTags` 覆盖 `v0.2.0` / `v0.2.1` / `v0.2.2` / `v0.2.4` / `v0.2.5` / `v0.2.6` / `v0.2.7` / `v0.2.8` / `v0.2.9`，其中 `v0.2.6` 是数组内显式字面量，不是 `previousPublishedTag` 的值。
- ac-current-tag-derived: `currentTag` 仍等于 `'v' + package.json#version`，且 `package.json#version` 仍为 `0.2.9`。
- ac-readme-line5: 两版 README 第 5 行各含 `v0.2.9` 且 `releases/tag/` 出现次数恰 1、指向 `releases/tag/v0.2.9`；除第 5 行外两版全文不出现 `vX.Y.Z`。
- ac-readme-no-stale-link: 两版 README 全文不含 `releases/tag/v0.2.8`、`releases/tag/v0.2.4`、`releases/tag/v0.2.2` 与 ghost 版本链接；中文版不含「待发布」。
- ac-signing-doc-v029: 签名文档含「当前状态：v0.2.9 已发布」「正式版发布姿态（v0.2.9）」「`docs/release-notes/v0.2.9.md`」「`docs/release-evidence/v0.2.9.md`」「tag 之后的修复由 v0.2.9 承接」，且不含「当前状态：v0.2.8」「当前状态：v0.2.4」「当前状态：v0.2.2」。
- ac-signing-reissue-section: 第五节同时含「v0.2.9 已发布」、`默认 \`v0.2.9\``、「已合入 `main`」、`docs/release-notes/v0.2.9.md`；原「最新公开 Release 仍是 v0.2.8 … 随后由一次收尾提交再同步」的表述在改动后不再出现。
- ac-signing-preserved: 第四节 v0.1.2 漂移记录、第一节 6 项 Secret 表、第六节打包后硬校验段落与改动前逐字相同（针对这三段的 diff 为空）。
- ac-evidence-exists: `docs/release-evidence/v0.2.9.md` 存在且非空；`^status:\s*verified$` 恰 1 行，`^status:` 恰 1 行。
- ac-evidence-no-placeholder: 证据文件不含 `TODO` / `TBD` / `FIXME` / 「待回填」/「待验证」/「预计通过」，不含 `<...>` 尖括号占位，不含空的 ```text 代码块。
- ac-evidence-tag-commit: 证据文件记录 tag `v0.2.9`、发布点 commit `35d4000f6d7d245dab577a52f639f3daab2726c0`（`git rev-parse v0.2.9^{commit}` 实测值）、并注明「不重指、不重打」。
- ac-evidence-release: 证据文件记录公开 Release `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.9`、非 draft / 非 prerelease、11 件资产；每件资产名齐全且各自对应 `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.9/<name>`。
- ac-evidence-asset-numbers: 证据文件里每个 64 位 sha256 与每个「N B」字节数都与写文件时 `gh release view v0.2.9 --repo chaxiu/OpenCompare --json assets` 的 `digest` / `size` 逐项相等；测试以显式字面量钉住这些值，手改数字即失败。
- ac-evidence-no-v028-carryover: 证据文件不含 v0.2.8 的 commit `356ad044faf3b9b246f89990aaa72033fc2203a5`、不含 v0.2.8 dmg sha `2917a65b93368b717d610770c6ef19ef7557b1bd953c9e2161fa5a7c03729458`、不含 `113,437,237 B`，也不含 v0.2.8 的资产文件名。
- ac-evidence-ci: 证据文件记录 Release CI run `40603225496`、headSha `35d4000f…`，五 job（`Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release`）各一行且含 `success`。
- ac-evidence-blocked-gaps: 无归档可核的小节（公证 / Gatekeeper 原文、L1 公开包复验、唯一性与 latest 门 finalize 日志等）在该小节显式写 `blocked` + 证据缺口说明，且该小节不出现「通过」「零失败」等未取证结论。
- ac-evidence-archive-refs: 358k 四条腿引用 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`，原生保存面板引用 `projects/ops_df43e423451170fd/.munk/runs/trun_070ff986f2830ed2/`；两处均标注为归档运营证据、未在本环境重跑，文件内不出现「本次已重新验证」。
- ac-v028-evidence-block-preserved: 该测试块锚点为 `docs/release-evidence/v0.2.8.md`，且 commit / run / 五 job / 11 资产名与 URL / `113,437,237 B` / dmg sha / L1 `trun_e9d687a57b51de6f` 零失败 / 负载 `trun_ecbdd72beef29b0a` 与 `8,262 ms`、`7,898 ms`、`855.5 MiB`、`1,310.4 MiB`、`取消 116 ms` 等断言原样保留。
- ac-history-anchors: v0.2.6 / v0.2.7 的 changelog、notes、evidence 断言指向 `v0.2.6` / `v0.2.7` 字面量，`previousPublishedTag` 前移不会让任何历史断言跨到错误版本或丢覆盖。
- ac-chained-flip-covered: 每个因 `latest === current` 而失效的切片/排序/「上一版」引用都改成了新锚点的等价断言，且每个改动点在测试里仍能区分「写错锚点」与「写对锚点」（例如 current 段切片终点必须是上一已发布版本标题，而不是与起点相同的标题）。
- ac-test-integrity: `src/main/release-packaging.test.ts` 的 `it(` 用例数不低于改动前的 225，且没有 `toBeTruthy()` 顶替具体断言、没有注释掉的断言、没有放宽的匹配（含 MiB / GiB / MB 白名单与 `[0-9a-f]{64}` 类严格集）、没有 `skip` / `todo`。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test`（含 `test-compare-request` / `test:cancel` / `test:memory`）全绿，即 `code_gates` 全量通过。
- ac-diff-scope: 该提交 `git diff --name-only` 恰为 `README.md`、`README.zh-CN.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`，加上新增的 `docs/release-evidence/v0.2.9.md`；`package.json`、`CHANGELOG.md`、`docs/release-notes/v0.2.9.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`AGENTS.md` 零改动。
- ac-clean-tree-and-sha: 交付时 `git status --porcelain` 为空，交付说明写明该提交 sha 与「未执行 tag / push / publish / gh release 写操作」。

## 非目标

- 不做 v0.2.10 版本收敛（不改 `package.json#version`、不加 `CHANGELOG` 新段、不改 `release.yml` dispatch 默认值、不改 `docs/release-process.md`、不建 v0.2.10 notes）。
- 不改 `docs/release-notes/v0.2.9.md` 正文（含「风险与验证规模」与原生保存面板小节）；若证据文件与 notes 口径有差异，只在交付说明中列出。
- 不改产品源码、对比 / 合并 / 扫描算法、四态语义、快照格式、依赖与发布通道逻辑。
- 不打 tag、不 push、不 publish、不创建 / 编辑 / 删除 Release 与资产；不重打 `v0.2.9`。
- 不重跑 358k 四条腿与 computer 场次，不重新下载资产、不重新打包 / 公证 / dispatch。
- 不做浏览器 / 真机 / 桌面点选验收（归 product-qa）；`needSelfTest` 不开启。
- 不顺手美化 README、不改徽章 / 截图 / 章节结构、不清理无关死代码。

## 实现约束

- 取证只读：`gh release view v0.2.9 --repo chaxiu/OpenCompare --json tagName,url,isDraft,isPrerelease,assets`、`gh api repos/chaxiu/OpenCompare/actions/runs/40603225496`、`git cat-file -t v0.2.9` / `git rev-parse v0.2.9^{commit}`。任一项不可读就按 blocked 写缺口，不推断、不搬运其他版本的数字。
- 版本 tag 字样在测试里一律走 `latestPublishedTag` / `previousPublishedTag` / `currentTag` 模板，不新增 `'v0.2.9'` 形式的内联版本字面量（40 / 64 位身份与字节数、历史版本锚除外）。
- 证据文件里每个资产行要么有实测字节数与 sha256，要么写「见发布期证据」或 `blocked` + 缺口；禁止用一个数去顶另一个资产。
- 历史锚纪律：v0.2.6 / v0.2.7 用显式字面量钉住，`previousPublishedTag` 下一轮会再前移，历史断言不得跟着走。
- 单提交、只改上述 5 个文件；不新增依赖，不改 `pnpm` 脚本与 `code_gates` 配置。
