# v0.2.10 / v0.2.11 / v0.2.12 发布证据补齐：`verified` + 两份 `partial`

- WI：`wi_ws_64ef84aacd76e826`
- 域：`release`（发布证据文档面；被测改动仅 `docs/release-evidence/v0.2.12.md` / `v0.2.11.md` / `v0.2.10.md` 三份新增文件）
- 来源：`.munk/changes/wi_ws_64ef84aacd76e826/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，不做浏览器 / 真机 / 桌面点选验收）
- 交付 commit：见本提交（`chore(baseline): fold v0.2.10/v0.2.11/v0.2.12 release evidence into release domain`），产品面 AB 见 `git status` 的三份新证据文件
- 改动面（除 change-pack `prd.md`）：`docs/release-evidence/v0.2.12.md` +103/−0、`docs/release-evidence/v0.2.11.md` +75/−0、`docs/release-evidence/v0.2.10.md` +69/−0；产品代码 / 测试 / README / workflow / CHANGELOG / notes / 签名文档零 diff

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-three-files-exist | 三份文件均存在非空（103 / 75 / 69 行）；首行分别为 `# v0.2.12 公开 Release 发布证据` / `# v0.2.11 …` / `# v0.2.10 …`；`^status:` 各恰 1 行，取值依次 `verified` / `partial` / `partial` | 满足 |
| ac-v0212-sections | `## 1. tag 与发布点` / `## 2. 公开 Release` / `## 3. CI run 与五 job 结论` / `## 4. 11 件公开资产` / `## 5. macOS 签名 / 公证` / `## 6. L1 公开包复验` 六个编号分节齐（另有 `## 7. 已知遗留与边界`），各节均有表格或明确结论，无空节 | 满足 |
| ac-v0212-tag-identity | §1 含 `aa8b05b25af977c0db201f352c31fe3348ab50d4`、`3ad62e78a889c74ce582400e4c8ce10281935992`、`annotated`、`不重指、不重打`；全文 40 位 hex 仅 tag 对象与发布点 commit 各 1 次 | 满足 |
| ac-v0212-ci-jobs | §3 含 `41067780688`；表格五行为 `Quality gates` / `Package linux` / `Package win` / `Package mac` / `Publish the GitHub Release`，每行均写 `success` | 满足 |
| ac-v0212-assets-complete | §4 资产表恰 11 行，名称与字节数逐字对齐 prd 表；`OpenCompare-0.2.12-arm64.dmg` 行含 sha256 `5a918f49eff5781ba26bd124b0083ba200db92f0928af7e8ab7a78f912b0266c`；其余 10 行摘要列为 `见发布期证据`（表格内 10 处）；全文 64 位 hex 计数 = 1（即该 sha） | 满足 |
| ac-v0212-l1-three-legs | §6 含 `trun_0091fdfbc7d1a2a6`、`3,043` / `5,262` / `46,827` / `1,377`、`725.0 MiB`、`125 ms`，并写明「零半棵树 / 零四态残留 / 无 dialog」；ready 墙钟 1,401 / 1,126 / 855 ms 标注「只作记录，不作及格线」 | 满足 |
| ac-v0212-signing-scope | §5 结论只引用 CI `Package mac` 三步结论与 L1 的 `spctl` = `accepted / Notarized Developer ID` / `stapler validate` ok；未取到的逐条原始输出以「见发布期证据」引用，未复制未提供输出 | 满足 |
| ac-v0211-notes-only | `v0.2.11.md` 事实全部对应 `docs/release-notes/v0.2.11.md`（含 350,000 行指示条 / 窗口渲染 / CI 超时三节与 `trun_08764efa44c39426`、`2bcdc53e`）；§3–§8 各写「证据目录缺失」（全文 8 处）；全文零 `releases/tag/` 与 `releases/download/` | 满足 |
| ac-v0210-notes-only | `v0.2.10.md` 事实全部对应 `docs/release-notes/v0.2.10.md`；含「证据目录缺失」（8 处）；零 `releases/tag/v0.2.10` / `releases/download/` / `docs/release-notes/v0.2.3.md`，零 64 位 hex | 满足 |
| ac-no-placeholders | 三份文件 `TODO` / `TBD` / `FIXME` / `待回填` / `待验证` / `待发布` 计数均为 0，无空节 | 满足 |
| ac-release-link-whitelist | 三份新文件中 `releases/tag/` 只出现 `releases/tag/v0.2.12`（1 次），`v0.2.11` / `v0.2.10` 无任何 release 链接；`pnpm test` 的 `links only published tags or the current tag` 用例通过（`src/main/release-packaging.test.ts:1827`） | 满足 |
| ac-gates-green | Host `code_gates` attempt 001：9 gates 全 passed（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate），`pnpm test` 80 files / 1248 passed + 1 skipped / 1249；测试文件零改动 | 满足 |
| ac-no-product-diff | 本项变更路径仅 `docs/release-evidence/v0.2.10.md`、`v0.2.11.md`、`v0.2.12.md` 三份新增文件；`package.json`、`CHANGELOG.md`、`docs/release-notes/**`、`README.md`、`README.zh-CN.md`、`docs/release-signing.md`、`.github/workflows/release.yml`、`src/**` 零 diff | 满足 |

## 口径与陷阱注记

- **证据分档是能力边界**：`v0.2.12` 有发布期 run `trun_ff263458f80c03f5` 与 L1 run `trun_0091fdfbc7d1a2a6` 两份 digest 支撑，故写 `verified`；`v0.2.11` / `v0.2.10` 的 tag / Release / CI / 资产 / 签名 / L1 证据从未归档，只能写 `partial` + 逐节「证据目录缺失」，**禁止**用版本号或 notes 数字推定发布形态。
- **摘要列只给 dmg**：11 件资产只有 dmg 的 sha256 已归档，其余 10 行必须写「见发布期证据」，不得编造摘要；全文 64 位 hex 严格只允许该一个 sha。
- **签名 / 公证不复制未提供输出**：只引 CI job 结论与 L1 的 `spctl` / `stapler` 结果；逐条原文缺失时写「见发布期证据」，不得用 CI `success` 顶替。
- **闭环上一轮遗留**：`wi_ws_0a26040fef375884` 曾记「v0.2.10 / v0.2.11 从未归档 `docs/release-evidence/<tag>.md`」；本轮补齐三份（含 v0.2.12），但 v0.2.10 / v0.2.11 仍为 `partial`，补归档后才能翻 `verified`。
- **本轮不做发布动作**：未打 tag、未 push、未 `gh release` 任何写操作，未重新下载资产 / `gh release view` / 打包 / 公证 / dispatch；v0.2.12 的发布后收尾（两版 README 第 5 行 + `latestPublishedTag` 前移）仍是独立动作。

## 最近执行

- workItemId: wi_ws_64ef84aacd76e826
- at: 2026-10-31
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_ws_754938915aade94b/code-gates/attempts/001`；`pnpm test` 80 files / 1248 passed + 1 skipped / 1249）。静态核对按 AC 逐条走脚本：三份文件 `^status:` 各恰 1 行（`verified` / `partial` / `partial`）、占位词与空节 0；`v0.2.12` 六个编号分节齐、五 job 行全 `success`、资产表 11 行名称与字节数逐字、仅 dmg 行带 sha256 且全文 64 位 hex = 1、L1 节四态四数与 `725.0 MiB` / `125 ms` 齐、`见发布期证据` 表格内 10 处；`v0.2.11` / `v0.2.10` 各 8 处「证据目录缺失」、零 release 链接、零 64 位 hex，`v0.2.10` 零 `docs/release-notes/v0.2.3.md`。事实边界：未重新 `gh release view` / 下载资产 / 打包 / 公证 / dispatch，未打 tag / push / publish。
