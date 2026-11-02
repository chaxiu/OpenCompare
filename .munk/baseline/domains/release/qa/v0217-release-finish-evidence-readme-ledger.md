# v0.2.17 发布收尾：发布证据回写与 README 状态行同步

- WI：`wi_intake_a5182cf0284c9b23`
- 域：`release`（发布证据归档 + 两版 README 已发布锚 + 发布台账数据；被测改动落在 `docs/release-evidence/v0.2.17.md`、`README.md` 第 5 行、`README.zh-CN.md` 第 5 行、`src/main/__fixtures__/release-packaging.json`）
- 来源：`.munk/changes/wi_intake_a5182cf0284c9b23/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 16 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收，以 Host `code_gates` 为交付门槛）
- 交付 commit：本 WI 分支 `munk/wi_intake_a5182cf0284c9b23` 上的 fold 提交，基线 = 发布点 `a2b05a602602bfa6f3a57b36695ed9bd49cc8eca`
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`README.md` 1/1、`README.zh-CN.md` 1/1、`src/main/__fixtures__/release-packaging.json` 37/31，外加新增未跟踪 `docs/release-evidence/v0.2.17.md`（147 行）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-evidence-file | `docs/release-evidence/v0.2.17.md` 147 行非空；首行 `# v0.2.17 公开 Release 发布证据`（含 `v0.2.17` 与中文）；`grep -c '^status:'` = **1**，该行为第 3 行 `status: verified`，全文无第二处行首 `status:` | 满足 |
| ac-evidence-sections | 八个 `## ` 分节与 `v0.2.16.md` 同构且顺序一致：`## 1. tag 与发布点` / `## 2. 公开 Release` / `## 3. Release CI` / `## 4. 12 件公开资产` / `## 5. 双语正文门` / `## 6. mac 签名与公证` / `## 7. L1 结论` / `## 8. 未覆盖面与已知边界` | 满足 |
| ac-evidence-identity | §1 表内 `package.json#version` = `0.2.17`、tag `v0.2.17`（annotated）；tag 对象 `9e98552a8d7b9fece9935703e56b07f25e94681f`；发布点 commit 三处出现 `a2b05a602602bfa6f3a57b36695ed9bd49cc8eca`，其中「`tag` → commit」行同时含反引号 commit，满足既有 commit 身份门 | 满足 |
| ac-evidence-release | §2 记录 Release `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.17`、published（`draft=false` / `prerelease=false`）、publishedAt `2026-11-02T12:25:34Z`、该 tag 恰好 1 个 Release、资产 12 件 | 满足 |
| ac-evidence-ci | §3 记录 run `41443763971` conclusion=success，五个 job（Quality gates / Package win / Package linux / Package mac / Publish the GitHub Release）全 success，并记 `Test Files 115 passed`、`Tests 1800 passed \| 3 skipped (1803)` | 满足 |
| ac-evidence-assets | §4 资产表恰好 12 行、行格式 `\| \`名称\` \| 字节数 B \| 口径 \| \`sha256\` \| 公开 URL \|`；行名 / 字节 / sha256 与发布期 `release-v0.2.17.json` 逐项一致（dmg `111,492,261 B` / `fd5dbafb…798a`、mac zip `107,359,470 B`、Setup exe `101,437,048 B` / `695b7ef1…3752`、win zip `131,654,348 B` / `458a6612…3725`、AppImage `118,162,855 B`、deb `92,237,940 B`、三份 blockmap 与三份 `latest*.yml`）；文档内不同 64 位小写 hex `sort -u` 计数 = **12**，无额外或残缺 digest token | 满足 |
| ac-evidence-body | §5 记录正文 4,665 字符 / 92 行、结构「英文全文 → `---` → `<details><summary>简体中文</summary>` → 中文全文 → `</details>` → `**Full Changelog**`」、9 个中文分节标题，并附反读结论 | 满足 |
| ac-evidence-mac | §6 记录 `skipped macOS application code signing` 命中 **0**、`notarization successful`、`codesign` / `stapler` / `spctl` 三项 fail-closed 复核随 Package mac job 通过 | 满足 |
| ac-evidence-l1 | §7 记六条腿：① 公开 URL 独立重下 `111,492,261 B` / sha256 逐位相等；② 干净副本 `CFBundleShortVersionString=0.2.17`；③ 三轮四态逐位 `35 / 80 / 41 / 326,099`（源 326,175 / 目标 326,214 / 差异 326,220），每轮算术三式全 true、0 回退；④ GC 保留堆 r2 `241,786,524 B` → r3 `241,803,336 B`、Δ `16,812 B`（`0.016 MiB ≤ 16 MiB`）；⑤ 取消 35 ms 回可操作态、零半棵树 / 零四态 / 零 dialog；⑥ 9 份日志 × 6 类关键词全 0；护栏 app 峰值 `1,308,377,088 B`（1.22 GiB）、renderer `836,763,648 B`（0.78 GiB）、零 OOM / 零 FATAL / 零 renderer 重启、`exceptionCount=0`；轮末未 GC 堆只记录不作判定（旧 `d1≥d2≥d3` 判据已于 2026-11-02 废止） | 满足 |
| ac-evidence-uncovered | §8 如实写明 L2 四条计时腿（180 s / 60 s / 3 s / 15 s）不在本版 L1、仍归 `task_e4434fa95548e4fb` 且未补跑；attempt 001 全量门证据目录缺口用同树 CI Quality gates 全绿 + 隔离 worktree 实测 `repoTestLines` 42,718 ≤ 42,724（与 attempt 001 记录逐位相同）补偿；另记未重打包 / 未重公证 / 未 dispatch、tag 与 12 件资产只读、第 4 节只有 dmg 是下载实测 | 满足 |
| ac-evidence-paths | §8.1 根目录映射给出产品目录 / 运行件目录 / 仓库根三条绝对路径；§8.2 / §8.3 共 13 条证据引用全部为绝对路径（`trun_c8614ac1d310a463/evidence/*` 与 `trun_a85a6ef118d58933/{digest.md,evidence/*}`），无从仓库根无法解析的相对证据路径 | 满足 |
| ac-readme-en | `git diff -U0 -- README.md` 恰一个 `@@ -5 +5 @@` hunk，numstat `1 / 1`；第 5 行 = `> Latest public release: [v0.2.17](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.17) — Developer ID signed and Apple-notarized macOS build.`，`releases/tag/` 计数 1；第 1–4 行、第 6 行及以后逐字不变 | 满足 |
| ac-readme-zh | `git diff -U0 -- README.zh-CN.md` 恰一个 `@@ -5 +5 @@` hunk，numstat `1 / 1`；第 5 行 = `> 最新公开版本：[v0.2.17](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.17) — macOS 安装包经 Developer ID 签名与 Apple 公证。`，`releases/tag/` 计数 1；其余行逐字不变；两版 `## ` 标题各 **9** 个且顺序一一对应 | 满足 |
| ac-ledger-registration | `src/main/__fixtures__/release-packaging.json`：`evidence.ledger` 末项 = `{ id: 'evidence-v0.2.17', version: 'v0.2.17', status: 'verified', assets: 12 }`（ledger 共 16 项，v0.2.16 项逐字保留）；`evidence.currentVersion.version` = `v0.2.17`、`assets` 恰 12 件（`latest-linux.yml` / `latest-mac.yml` / `latest.yml` / `opencompare_0.2.17_amd64.deb` / mac zip + blockmap / dmg + blockmap / `OpenCompare-0.2.17-win-x64.zip` / `OpenCompare-0.2.17.AppImage` / `OpenCompare-Setup-0.2.17.exe` + blockmap）；numstat `37 / 31` 全为数据行，断言判据零改动；`pnpm test` 115 files / 1818 passed + 1 skipped 全绿，README 已发布锚（由 verified 证据并集 derive 到 `v0.2.17`）与既有台账遍历真过 | 满足 |
| ac-code-gates-green | Host `code_gates` attempt 001：**22 门**全 exit 0（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `test-debt-gate` / `verify-release-gate` / 九个 `template-*` 专项门等），证据落 `.munk/runs/run_intake_a5182cf0284c9b23/code-gates/attempts/001`，`latest.json` `ok: true` / `failedGateIds: []`；无跳过、无 `\|\| true` 逃逸 | 满足 |
| ac-no-product-change | `package.json#version` = `0.2.17` 零 diff；`CHANGELOG.md`、`docs/release-notes/**`（含 v0.2.17 双语两份）、`docs/release-signing.md`、`docs/release-process.md`、`.github/workflows/release.yml`、`docs/release-evidence-ledger.json`、既有各版 `docs/release-evidence/**` 零 diff；`src/**` 仅该 fixture JSON 变动（全部测试文件与断言判据零 diff）；未打 tag / 未推 tag / 未 dispatch / 未对已公开 Release 与 12 件资产做任何写操作 | 满足 |

## 口径与陷阱注记

- **已发布锚是派生值，不是常量**：`judgePublishedAnchor` 的 `publishedTag` 由「台账 ∪ `docs/release-evidence/*.md` 的 `status: verified`」取 semver 最大值派生，新增 `v0.2.17.md` 会立刻要求两版 README 第 5 行等于 `v0.2.17`。**证据文件与两版 README 必须同提交落地**，只加证据不改 README 会当场判红。
- **收尾轮的新增面是台账数据，不是断言**：v0.2.17 起发布门已拆成 `judgeVersionSources`（四项当前版本源）与 `judgePublishedAnchor`（已发布事实），本轮无需按版本新增 `describe` 或改任何断言；改动只落在 `evidence.ledger` 一行与 `evidence.currentVersion` 的 12 件资产，`repoTestLines` 因此持平（42,718 ≤ 42,724）。
- **证据只能只读回写**：12 件资产中只有 dmg 有 L1 独立重下 + sha256 实测，其余 11 件必须标「发布期资产 size / digest」，不得重算或编造；`release-v0.2.17.json` / `assets-table.txt` / `body-v0.2.17.md` 是唯一数据源。
- **豁免即盲区（上一轮预告的兑现路径）**：发布门对「当前 tag 未发布」的豁免键是 `currentTag`；本版已发布，若不写 `docs/release-evidence/v0.2.17.md` 又不 bump 版本，证据缺口在门禁上无信号。本项即该缺口的收口动作。
- **未覆盖面不许少写**：L2 四条计时腿不在本版 L1、不补跑、不写任何未核到的性能数字；旧「轮末堆单调下降」判据已废止，证据文件只能记「按替代证据判非泄漏」，不得写「新判据通过」。
- **发布通道全程只读**：未打 tag / 未 push 远端 tag / 未 dispatch / 未创建或修改 Release 与资产；`CHANGELOG.md`、发布说明、工作流、签名文档零 diff。
- **门禁口径为 22 门**（含 `test-debt-gate`、`verify-release-gate` 与九个 `template-*` 专项门），任何沿用 16 门及更早门数的记录都要按当轮 `.munk/code-gates.json` 实读。

## 最近执行

- workItemId: wi_intake_a5182cf0284c9b23
- at: 2026-11-02T21:06:31+08:00
- status: pass
- note: 22 gates exit 0 (attempt 001); test 1818 passed + 1 skipped; 16 prd AC folded
