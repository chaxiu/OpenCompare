# 补 v0.2.10 / v0.2.11 / v0.2.12 发布证据

## 范围

本项只新增三份证据文档，不改任何产品代码、测试断言、README、签名文档、CHANGELOG、发布说明或 workflow。

1. `docs/release-evidence/v0.2.12.md`（`status: verified`）
   - 结构对照 `docs/release-evidence/v0.2.9.md`：标题 `# v0.2.12 公开 Release 发布证据` → `status:` → 编号分节（tag 与发布点 / 公开 Release / CI run 与五 job / 11 件资产 / 签名与公证 / L1 公开包复验 / 已知遗留与边界）。
   - 发布期事实取自 `.munk/runs/trun_ff263458f80c03f5/digest.md`，L1 事实取自 `.munk/runs/trun_0091fdfbc7d1a2a6/digest.md`；每节结论都要能回到这两份 digest（或 digest 指向的 `evidence/` 文件）。
   - 11 件资产表：名称齐全、逐件写实测字节数；只有 dmg 一行写 sha256，其余 10 行摘要列写「见发布期证据」。
2. `docs/release-evidence/v0.2.11.md`（`status: partial`）
   - 只写仓内 `docs/release-notes/v0.2.11.md` 已载明的事实（四态差异指示条 / 大行数窗口渲染 / CI 测试超时修复 / 该文件写明的实测数字与 `trun_08764efa44c39426`、`2bcdc53e`）。
   - tag / 公开 Release / CI run / 资产清单 / 签名公证 / L1 复验这些发布期证据目录缺失的项，逐项写「证据目录缺失」，不用 CI 或版本号推定发布形态。
3. `docs/release-evidence/v0.2.10.md`（`status: partial`）
   - 只写仓内 `docs/release-notes/v0.2.10.md` 已载明的事实。
   - 所有发布期证据项写「证据目录缺失」，不推定该版发布形态；**不得出现** `releases/tag/v0.2.10`、`releases/download/`、任何 sha256、任何 run id 之外的发布期元数据。

三份文件都不得出现 `TODO` / `TBD` / `FIXME` / `待回填` / `待验证` / `待发布` 占位，不得留空节。

## 已核实事实（Intake 已逐字核对 run digest，可直接落盘）

来源：`.munk/runs/trun_ff263458f80c03f5/digest.md`（发布期）、`.munk/runs/trun_0091fdfbc7d1a2a6/digest.md`（L1）。若 Coding 工作树内不存在该目录，按下表事实落盘并在文中引用上述 run 路径，不得另造数字。

**v0.2.12 发布点与 tag**：`package.json#version` = `0.2.12`；发布点 commit `3ad62e78a889c74ce582400e4c8ce10281935992`；tag `v0.2.12` 为 annotated，message `Release v0.2.12`，tag 对象 `aa8b05b25af977c0db201f352c31fe3348ab50d4` → commit `3ad62e7…`；远端 `refs/tags/v0.2.12` = `aa8b05b…`、`^{}` = `3ad62e7…`；`v0.2.11` 之后 n = 24 个 commit；处理口径：不重指、不重打。

**公开 Release**：`tag_name = v0.2.12` 的 Release 恰 1 个，`isDraft = false`、`isPrerelease = false`，公开时间 14:04:11Z；资产 11 件且全部 `state = uploaded`；三份 `latest*.yml` 均 `version: 0.2.12`（分别指向 `OpenCompare-0.2.12-arm64-mac.zip` / `OpenCompare-Setup-0.2.12.exe` / `OpenCompare-0.2.12.AppImage`）；Release 正文取自仓内 `docs/release-notes/v0.2.12.md` 并追加 `Full Changelog` 行。

**CI run**：`https://github.com/chaxiu/OpenCompare/actions/runs/41067780688`（push，headBranch `v0.2.12`，13:58:50Z 起，headSha `3ad62e78a889c74ce582400e4c8ce10281935992`，conclusion `success`）。五 job 全 `success`：`Quality gates` / `Package linux` / `Package win` / `Package mac` / `Publish the GitHub Release`。`Package mac` 内签名与公证相关 step（`Require macOS signing and notarization credentials`、`Materialize the App Store Connect API key`、`Verify the app signature, notarization and Gatekeeper acceptance`）均 `success`。

**11 件资产实测字节数**（dmg 另附 sha256）：

| 资产 | 字节数 |
| --- | --- |
| `OpenCompare-0.2.12-arm64.dmg` | 111,427,919 B（sha256 `5a918f49eff5781ba26bd124b0083ba200db92f0928af7e8ab7a78f912b0266c`） |
| `OpenCompare-0.2.12-arm64.dmg.blockmap` | 117,896 B |
| `OpenCompare-0.2.12-arm64-mac.zip` | 107,273,917 B |
| `OpenCompare-0.2.12-arm64-mac.zip.blockmap` | 113,615 B |
| `OpenCompare-Setup-0.2.12.exe` | 101,374,512 B |
| `OpenCompare-Setup-0.2.12.exe.blockmap` | 106,568 B |
| `OpenCompare-0.2.12.AppImage` | 118,068,647 B |
| `opencompare_0.2.12_amd64.deb` | 92,167,004 B |
| `latest.yml` | 354 B |
| `latest-mac.yml` | 521 B |
| `latest-linux.yml` | 535 B |

**L1 三条腿**（run `trun_0091fdfbc7d1a2a6`）：dmg 下载 111,427,919 B、sha256 与上表逐字相等；干净目录安装后 `CFBundleShortVersionString = 0.2.12`、`spctl` = `accepted / Notarized Developer ID`、`stapler validate` ok；三轮四态逐位一致 `3,043 相同 / 5,262 新增 / 46,827 删除 / 1,377 修改`，源 `51,247` / 目标 `9,682` / 差异 `53,466`，ready 墙钟 1,401 / 1,126 / 855 ms（只作记录，不作及格线）；app 总峰值 `760,184,832 B` = 725.0 MiB（门槛 2.5 GiB）、renderer RSS 峰值 258.1 MiB（门槛 2.25 GiB）、renderer pid 三轮不变、0 OOM / 0 FATAL；取消：进度首帧 292 ms（18,901 文件 / 3.4 GiB）→ hit-test 命中 `BUTTON`「Cancel」→ 真实点击 → 125 ms 回可操作态，零半棵树 / 零四态残留 / 无 dialog，日志中 `OperationCancelledError` / `ECANCELED` / `Error occurred in handler` / `OOM` / `FATAL` / `Renderer process` 全 0。

**v0.2.11 notes 事实**（`docs/release-notes/v0.2.11.md`）：四态差异指示条与点选跳转（track 608px / bandHeight 4，active 1→106/210，scrollTop 3,590,120 = 179,506 × 20，顶部 20 / 末端 6,967,840）、零差异文件纯 NO-OP；窗口渲染单栏 39–49 个行元素、内容总高 7,003,040px = 350,152 × 20、首开 471 ms / 热重开 209 ms、renderer 峰值 451.6 MiB / 应用总峰值 909.0 MiB；CI 用例超时 6,816ms → 显式 `30_000`；来源 run `trun_08764efa44c39426` / commit `2bcdc53e`。

**v0.2.10 notes 事实**（`docs/release-notes/v0.2.10.md`）：同上两项变化的对应描述与同一组实测数字，来源同为 run `trun_08764efa44c39426` / commit `2bcdc53e`；无 CI 超时修复章节。

## 验收

- ac-three-files-exist: `docs/release-evidence/v0.2.12.md`、`v0.2.11.md`、`v0.2.10.md` 三份文件存在且非空，首行分别为 `# v0.2.12 公开 Release 发布证据` / `# v0.2.11 公开 Release 发布证据` / `# v0.2.10 公开 Release 发布证据`，各自恰好一行 `status:` 且取值依次为 `verified` / `partial` / `partial`。
- ac-v0212-sections: `v0.2.12.md` 含 tag 与发布点、公开 Release、CI run 与五 job、11 件资产、macOS 签名/公证、L1 公开包复验六个编号分节，各节均有表格或明确结论，无空节。
- ac-v0212-tag-identity: `v0.2.12.md` 含 `aa8b05b25af977c0db201f352c31fe3348ab50d4`、`3ad62e78a889c74ce582400e4c8ce10281935992`、`annotated`、`不重指、不重打`；全文完整 40 位 commit 只有这一条。
- ac-v0212-ci-jobs: `v0.2.12.md` 含 `41067780688` 与五条 job 行（`Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release`），每行都写 `success`。
- ac-v0212-assets-complete: `v0.2.12.md` 的资产表 11 行名称与上表逐字一致，字节数与上表逐字一致；`OpenCompare-0.2.12-arm64.dmg` 行含 sha256 `5a918f49eff5781ba26bd124b0083ba200db92f0928af7e8ab7a78f912b0266c`，其余 10 行摘要列为 `见发布期证据`；全文 64 位十六进制串只有这一个 sha256 与 tag 对象外的 commit 各一次（不出现第三组 sha）。
- ac-v0212-l1-three-legs: `v0.2.12.md` L1 节含 `trun_0091fdfbc7d1a2a6`、`3,043` / `5,262` / `46,827` / `1,377`、`725.0 MiB`、`125 ms`，并同时写明零残留结论；不把 ready 墙钟写成及格线。
- ac-v0212-signing-scope: `v0.2.12.md` 签名/公证节结论只引用 CI job 结论与 L1 的 `spctl` / `stapler` 结果；未取到的逐条原始输出以「见发布期证据」引用，不复制未提供的输出。
- ac-v0211-notes-only: `v0.2.11.md` 事实全部可对应 `docs/release-notes/v0.2.11.md`；tag、Release、CI run、资产清单、签名公证、L1 复验各节写「证据目录缺失」；全文不出现任何 `releases/tag/` 或 `releases/download/` 链接。
- ac-v0210-notes-only: `v0.2.10.md` 事实全部可对应 `docs/release-notes/v0.2.10.md`；含「证据目录缺失」；全文不含 `releases/tag/v0.2.10`、`releases/download/`、`docs/release-notes/v0.2.3.md`，也不出现任何 64 位十六进制串。
- ac-no-placeholders: 三份文件都不含 `TODO` / `TBD` / `FIXME` / `待回填` / `待验证` / `待发布`。
- ac-release-link-whitelist: 三份新文件里出现的 `releases/tag/` 链接只允许 `v0.2.12`（`v0.2.10`、`v0.2.11` 无链接），全量 `pnpm test` 中 `links only published tags or the current tag` 用例通过。
- ac-gates-green: `pnpm test` 全量通过，v0.2.9 证据相关既有断言与 README 状态行断言保持通过（不改测试文件）。
- ac-no-product-diff: 本项变更路径仅限 `docs/release-evidence/v0.2.10.md`、`v0.2.11.md`、`v0.2.12.md` 三份新增文件。

## 非目标

- 不改 README / README.zh-CN、`src/main/release-packaging.test.ts`、`docs/release-signing.md`、`CHANGELOG.md`、`docs/release-notes/*`、`.github/workflows/release.yml`（版本收敛与锚点前移属于集内另一工作项）。
- 不新增、不删除、不放宽任何测试断言（尤其不为这三份证据文件加新断言）。
- 不重新下载资产、不重新 `gh release view`、不重新打包 / 公证 / dispatch，不写任何未在 run 证据或仓内 notes 出现的数字、sha、run id。
- 不为 `v0.2.3` 建证据文件，不在任何文档提及它的 notes 路径或 release 链接。
- 不动 `docs/perf/**`、`docs/lessons.md` 与任何产品代码 / UI / 算法。
- 不补写 `v0.2.12` 的 10 件非 dmg 资产 digest，不留 TODO 式占位。

## 实现约束

- 与 `v0.2.9.md` 同族写法：标题一行说明版本，`status:` 单独一行，编号分节；表格用 `| 项 | 值 |` / `| 资产 | 字节数 | sha256 | 公开 URL |` 风格。
- URL 一律写裸链接（`https://…`），不用 markdown 自动链接尖括号写法；`v0.2.10.md` 与 `v0.2.11.md` 干脆不写 release 链接。
- 来源引用统一写 `.munk/runs/<runId>/digest.md` 形式（必要时补 `evidence/<file>`），全文一种写法，不写本机绝对路径。
- 不可核事实用「证据目录缺失」或「见发布期证据」二选一标注，禁止用 CI 结论替代原始输出，禁止用版本号推定发布形态。
- 只允许编辑 `.munk/changes/**` 与上述三份 `docs/release-evidence/*.md`。
