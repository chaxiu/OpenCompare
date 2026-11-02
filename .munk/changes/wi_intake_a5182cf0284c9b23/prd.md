# v0.2.17 发布收尾：发布证据回写与 README 状态行同步

## 范围

v0.2.17 已公开发布且 L1 已闭环，本项只做发布收尾文档回写（纯文档，不改产品行为）：

1. 新建 `docs/release-evidence/v0.2.17.md`，结构对齐 `docs/release-evidence/v0.2.16.md`（首行版本标题 + 唯一 `status: verified`，分节记录 tag 与发布点、公开 Release、Release CI、12 件资产 size/sha256、双语正文门、mac 签名与公证、L1 结论、未覆盖面）。
2. 只改两版 README 第 5 行：`README.md` 与 `README.zh-CN.md` 的 Latest public release / 最新公开版本链接与版本由 `v0.2.16` 改为 `v0.2.17`，措辞保持原样，其余行一字不动。
3. 既有发布门要求 `docs/release-evidence/*.md` 与 `src/main/__fixtures__/release-packaging.json` 的 evidence 台账逐版本对齐；新增证据文件必须补登记一行（`v0.2.17` / `verified` / `assets: 12`），并把 `evidence.currentVersion` 数据切到 v0.2.17 的 12 件资产，使既有行级断言真过。此项只改台账数据，不改任何断言判据。

### 只许写入的已核事实（不得推测、不得补写）

- 发布点 commit `a2b05a602602bfa6f3a57b36695ed9bd49cc8eca`（= main = origin/main tip）；tag `v0.2.17` 为 annotated，tag 对象 `9e98552a8d7b9fece9935703e56b07f25e94681f`；`package.json#version` = `0.2.17`。
- Release `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.17` 为 published（非 draft / 非 prerelease），publishedAt `2026-11-02T12:25:34Z`，该 tag 恰好 1 个 Release。
- CI run `41443763971` conclusion=success；五个 job（Quality gates / Package win / Package linux / Package mac / Publish the GitHub Release）全 success；Quality gates 记 `Test Files 115 passed`、`Tests 1800 passed | 3 skipped (1803)`。
- 12 件资产：`OpenCompare-0.2.17-arm64.dmg` 111,492,261 B `fd5dbafb71edb0f86931e7e0f888d646c680f5f2dff1151d0d87f32f3bb8798a`；mac zip 107,359,470 B；`OpenCompare-Setup-0.2.17.exe` 101,437,048 B `695b7ef10215a5be7c744177ed5ef4850e726831838d11d21bcd717245313752`；`OpenCompare-0.2.17-win-x64.zip` 131,654,348 B `458a6612aef1fdbd70f7b7153c1ceda80272d0957c4dcd2fe99d25e0bdc53725`；AppImage 118,162,855 B；deb 92,237,940 B；三个 blockmap 与三个 `latest*.yml` 的字节数 / sha256 完整表直接取发布期证据文件 `release-v0.2.17.json` / `assets-table.txt`，禁止手写猜测。
- 双语 body 实测：4,665 字符 / 92 行；英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → Full Changelog；含 9 个中文分节标题。
- mac 签名与公证：日志 `skipped macOS application code signing` 命中 0；`notarization successful`；`codesign` / `stapler` / `spctl` 的 fail-closed 复核随 Package mac job 通过。
- L1 结论（2026-11-02）：公开 URL 独立重下 111,492,261 B / sha256 逐位相等；干净副本 `CFBundleShortVersionString=0.2.17`；358k 真实对照对三轮四态逐位 35 / 80 / 41 / 326,099，算术三式自洽、0 回退；GC 归一化保留堆 r2 241,786,524 B → r3 241,803,336 B，Δ 16,812 B（0.016 MiB ≤ 16 MiB），app 峰值 1.22 GiB、renderer 0.78 GiB、零 OOM / 零重启；取消腿 35 ms 回可操作态、零半棵树零四态、9 份日志 6 类关键词全 0。
- 未覆盖面如实写：L2 四条计时负载腿（180 s / 60 s / 3 s / 15 s）不在本版 L1，仍归 `task_e4434fa95548e4fb`；另记 attempt 001 全量门证据目录在发布会话不可见，已用同树 CI Quality gates 全绿 + `repoTestLines 42718/42724` 逐位相同补偿。

### 证据源（只读，绝对路径）

产品目录：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/`

- 发布期：`projects/ops_df43e423451170fd/.munk/runs/trun_c8614ac1d310a463/digest.md` 与 `evidence/`（`release-v0.2.17.json`、`assets-table.txt`、`download-verify.txt`、`body-v0.2.17.md`、`mac-job.log`、`gates-job.log`）。
- L1：`projects/ops_df43e423451170fd/.munk/runs/trun_a85a6ef118d58933/digest.md` 与 `evidence/`（`10-download-install.txt`、`23-memory-verdict.json`、`32-heap-gc-probe.json`、`30-cancel.json`、`24-log-scan.json`）。

文档内引用证据一律写上述绝对路径，并标注根目录映射（产品目录 / 运行件目录 / 仓库根）；不得写从仓库解析不到的相对路径。

## 验收标准

- ac-evidence-file: `docs/release-evidence/v0.2.17.md` 存在且非空；首行含 `v0.2.17` 与中文；全文恰好一处以行首 `status: verified` 出现。
- ac-evidence-sections: 文档含八类分节，与 `v0.2.16.md` 同构：tag 与发布点、公开 Release、Release CI、12 件资产表、双语正文门、mac 签名与公证、L1 结论、未覆盖面。
- ac-evidence-identity: 文档记录发布点 `a2b05a602602bfa6f3a57b36695ed9bd49cc8eca`、tag 对象 `9e98552a8d7b9fece9935703e56b07f25e94681f`、`package.json#version` = `0.2.17`；存在同时含反引号 commit 与 `tag → commit` 语义的行，满足既有 commit 身份门。
- ac-evidence-release: 文档记录 Release URL、published 状态（非 draft / 非 prerelease）、publishedAt `2026-11-02T12:25:34Z`、该 tag 恰好 1 个 Release。
- ac-evidence-ci: 文档记录 run `41443763971` 与五个 job 全 `success`，并记录 `Test Files 115 passed`、`Tests 1800 passed | 3 skipped (1803)`。
- ac-evidence-assets: 资产表恰好 12 行，每行为 `| \`名称\` | 字节数 B | 口径 | \`sha256\` | 公开 URL |`；行名、字节数、sha256 与 `release-v0.2.17.json` 逐项相等；文档内不同 64 位小写十六进制恰为这 12 个资产 digest，无额外或残缺 digest token。
- ac-evidence-body: 文档记录双语正文 4,665 字符 / 92 行、英文→`---`→`<details><summary>简体中文</summary>`→中文→`</details>`→Full Changelog 结构，以及 9 个中文分节标题。
- ac-evidence-mac: 文档记录 `skipped macOS application code signing` 命中 0、`notarization successful`、`codesign` / `stapler` / `spctl` fail-closed 复核随 job 通过。
- ac-evidence-l1: 文档记录 L1 全部已核结论（独立重下字节与 sha256 相等、干净副本版本 0.2.17、三轮四态与算术、0 回退、GC 保留堆 241,786,524 → 241,803,336 B / Δ16,812 B / 0.016 MiB ≤ 16 MiB、app 1.22 GiB / renderer 0.78 GiB / 零 OOM / 零重启、取消 35 ms 零残留、9 份日志 6 类关键词全 0）。
- ac-evidence-uncovered: 文档如实写明 L2 四条计时腿不在本版 L1 且归 `task_e4434fa95548e4fb`，以及 attempt 001 全量门证据目录缺口与同树 CI + `repoTestLines 42718/42724` 补偿。
- ac-evidence-paths: 文档内所有证据引用均为绝对路径并标注根目录映射；不出现从仓库根无法解析的相对证据路径。
- ac-readme-en: `README.md` 第 5 行的版本与链接均为 `v0.2.17`，其余措辞不变，第 1–4 行与第 6 行及以后逐字不变。
- ac-readme-zh: `README.zh-CN.md` 第 5 行的版本与链接均为 `v0.2.17`，其余措辞不变，第 1–4 行与第 6 行及以后逐字不变；双语镜像与 9 节结构保持。
- ac-ledger-registration: `src/main/__fixtures__/release-packaging.json` 的 `evidence.ledger` 增加 `v0.2.17` / `verified` / `assets: 12` 一行，`evidence.currentVersion` 切到 `v0.2.17` 的 12 件资产；`pnpm test` 中原有证据台账遍历、README 已发布锚点与 `repoTestLines` 门真过，且未修改任何断言判据。
- ac-code-gates-green: `.munk/code-gates.json` 全部 gate 退出码 0，无一跳过。
- ac-no-product-change: `package.json#version` 保持 `0.2.17`；产品源码、测试判据、CHANGELOG、`docs/release-notes/v0.2.17*`、tag、已公开 Release 与资产均不变。

## 非目标

- 不改产品源码、不改任何测试断言判据，不 bump `package.json#version`。
- 不改 `CHANGELOG.md`、`docs/release-notes/v0.2.17.md` / `docs/release-notes/v0.2.17.zh-CN.md`。
- 不改 `docs/release-signing.md`（其中 v0.2.17「待发布」表述不在本项收口范围）。
- 不重打 tag、不移动 tag、不改已公开 Release 与资产、不 dispatch、不推 tag。
- 不新增依赖，不改导出格式与目录四态口径。
- 不补写任何未在证据源中核到的事实（包括性能 / 内存新数字、L2 计时结论）。

## 实现约束

- 证据源只读；发布期与 L1 两类证据分别取自上述 `.munk/runs` 目录，禁止用记忆或推测填表。
- 资产表与正文数字必须以 `release-v0.2.17.json`、`assets-table.txt`、`body-v0.2.17.md`、`download-verify.txt`、`10-download-install.txt`、`23-memory-verdict.json`、`32-heap-gc-probe.json`、`30-cancel.json`、`24-log-scan.json` 为准。
- 两版 README 只允许改第 5 行；保持既有双语镜像与 9 节结构。
- 台账登记是让既有门在新增证据文件后真过的最小数据改动，不得借机放宽或删除断言。
- 交付经 delivery `local_merge` 合入 main（Host 自动同步 origin/main）；code_gates 证据与最终 commit sha 写入交付记录。
