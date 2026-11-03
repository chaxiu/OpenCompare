# 只改 v0.2.18 双语发布说明：补记 Windows 安装包签名修复并修正一处已不成立的表述

## 范围

仅编辑两个文件、共三处改动（两段新增语义 + 一处原句替换），逐段对应、不整篇重写：

1. `docs/release-notes/v0.2.18.md`（英文）
2. `docs/release-notes/v0.2.18.zh-CN.md`（中文）

改动一：在 `## Windows installer and portable zip` / `## Windows 安装包与免安装 zip` 段末尾追加**一个段落**（不新增 H2、不新增 H3），说明本轮 CI 缺陷修复：

- 此前的 CI 把 macOS 的 Developer ID 签名凭据（`CSC_LINK` / `CSC_KEY_PASSWORD`）注入到三平台矩阵的每个目标，Windows 构建因此带上了 Windows 不信任的签名，v0.2.17 的 `OpenCompare-Setup-0.2.17.exe` 被 `Get-AuthenticodeSignature` 判为 `UnknownError`。
- main（`50b632b`）已把注入范围收窄为 `matrix.target == 'mac'`；从本版起 Windows 安装包回到正常的未签名姿态（`NotSigned`），SmartScreen 仍会提示未知发布者，等取得 Windows 代码签名证书后再补签。
- v0.2.17 的 Windows 安装包带的就是这份无效签名，建议直接使用 v0.2.18。

改动二：替换 `## macOS signing and notarization` / `## macOS 签名与公证` 段里已不成立的表述，改为「本版把签名凭据的注入范围收窄到仅 macOS 目标（Windows 不再被误签）；macOS 的 Developer ID 签名 + Apple 公证口径本身不变」。

原句 → 新句（逐字对照，中文同构）：

- 原（EN，第 28 行第 2 句）：`This release does not change the signing or notarization configuration.`
- 新（EN，语义）：`This release narrows the signing credentials to the macOS target only, so the Windows build is no longer signed with them; macOS Developer ID signing and Apple notarization themselves are unchanged.`
- 原（ZH，第 28 行第 2 句）：`本版未改动签名与公证配置。`
- 新（ZH，语义）：`本版把签名凭据的注入范围收窄到仅 macOS 目标，Windows 构建不再被误签；macOS 的 Developer ID 签名与 Apple 公证口径本身不变。`

事实来源（供 Coding 核对措辞，不写进发布说明正文）：

- `.github/workflows/release.yml` 第 344-350 行：注释明确「Developer ID certificate must never reach win/linux」，只有 `matrix.target == 'mac'` 时才注入 `CSC_LINK` / `CSC_KEY_PASSWORD`。
- `docs/release-signing.md` §七：Windows 未签名发布姿态、`NotSigned`/`Valid` pass、其余 fail-closed；capsule 记「修复 v0.2.17 复验暴露的缺陷」。
- `docs/lessons.md` §14：post-release-verify run `41571697872` 14/15，唯一红项 `windows-authenticode=UnknownError` 即 v0.2.17 旧资产缺陷。
- `docs/release-evidence/v0.2.18.md` 状态仍为 `blocked`（未打 tag、无公开 Release）：因此正文只描述 CI 配置与由此得到的产物姿态，**不得**宣称 v0.2.18 已经过 post-release-verify 或已有 `NotSigned` 实测结论。

## 验收

- ac-en-windows-fix-section: `docs/release-notes/v0.2.18.md` 的 `## Windows installer and portable zip` 段内出现一个新段落，逐字包含 `NotSigned`、`SmartScreen`、`v0.2.17`、`UnknownError` 与 `CSC_LINK`，且该段落位置在 `## macOS signing and notarization` 之前。
- ac-zh-windows-fix-section: `docs/release-notes/v0.2.18.zh-CN.md` 的 `## Windows 安装包与免安装 zip` 段内出现一个新段落，逐字包含 `未签名姿态`、`NotSigned`、`SmartScreen`、`v0.2.17`、`UnknownError` 与 `CSC_LINK`，且在 `## macOS 签名与公证` 之前。
- ac-en-stale-claim-removed: 英文全文不再出现 `This release does not change the signing or notarization configuration`；`## macOS signing and notarization` 段改为逐字包含 `macOS target` 与 `unchanged` 的限定表述，仍保留 `Developer ID` 与 `notarized`。
- ac-zh-stale-claim-removed: 中文全文不再出现 `本版未改动签名与公证配置`；`## macOS 签名与公证` 段改为逐字包含 `仅 macOS 目标` 与 `口径本身不变`，仍保留 `Developer ID` 与 `公证`。
- ac-bilingual-parity: 两文件 H2 列表仍严格等于 `src/main/release-gate.ts#NOTES_H2_PAIRS` 的 6 对（`What changed`/`本次变化`、`Windows installer and portable zip`/`Windows 安装包与免安装 zip`、`macOS signing and notarization`/`macOS 签名与公证`、`Not in this release`/`不做的事`、`Risk and verification scope`/`风险与验证规模`、`Upgrade`/`升级方式`），顺序不变、数量不变；两文件 H3 数量仍各为 3，标题文字不变。
- ac-version-and-switch-intact: 两文件第 1 行标题仍含 `v0.2.18`（`# OpenCompare v0.2.18 release notes` / `# OpenCompare v0.2.18 发布说明`），第 3 行语言切换链接仍分别指向 `.../blob/v0.2.18/docs/release-notes/v0.2.18.zh-CN.md` 与 `.../blob/v0.2.18/docs/release-notes/v0.2.18.md`；`package.json#version` 仍为 `0.2.18`。
- ac-body-assembly-safe: 两文件均不含 `<details>`、`<summary>`、`</details>` 与独占一行的 `---`，因此 `release.yml` 的「英文全文 + `---` + `<details><summary>简体中文</summary>` + 中文全文 + `</details>`」组装与既有 gate 的段落切分不受影响（脚本本身零 diff）。
- ac-no-unit-numbers: 新增/替换的正文不含 `MiB` / `GiB` / `GB` 等带单位数字，也不引入任何性能或内存数字。
- ac-gates-green: `.munk/code-gates.json` 全部 gate 绿，至少含 `pnpm test` 内的 `src/main/release-packaging.test.ts`（双语发布说明正文、语言切换链接、`<details><summary>简体中文</summary>` 折叠组装断言）与 `src/main/release-version-gate.test.ts`（真实双语文件 H2 镜像与标题顺序断言），以及 `lint` / `typecheck` / `build` / `build-web` / `test-debt-gate`。
- ac-diff-scope: 相对改动前基线 `git diff --name-status` 只有两处 `M`：`docs/release-notes/v0.2.18.md`、`docs/release-notes/v0.2.18.zh-CN.md`；`src/**`、`scripts/**`、`.github/**`、`package.json`、`CHANGELOG.md`、`docs/release-evidence/**`、`docs/release-notes/v0.2.17*` 及更早说明零 diff。
- ac-diff-report: 交付说明给出 `git diff --numstat` 的两文件增删行数，并逐条列出「原句 → 新句」对照（含新增段落的首句与语义要点）。

## 非目标

- 不改任何代码、测试、`code_gates` 配置与 `.github/workflows/release.yml`。
- 不重写整篇发布说明；不改「本次变化 / 状态栏 / 不做的事 / 风险与验证规模 / 升级方式」各段的既有内容（唯一例外见实现约束第 4 条：不动「升级方式」段）。
- 不碰 v0.2.17 及更早的历史发布说明，不碰 `docs/release-signing.md`、`docs/lessons.md`、`docs/release-process.md`。
- 不改 `package.json#version`、不改 `CHANGELOG.md`、不新增/重写/移动 tag、不动已公开 Release 与其资产。
- 不新建或改写 `docs/release-evidence/**`（尤其不把 `v0.2.18.md` 的 `blocked` 改成 pass）。
- 不新增 H2/H3 标题，不新增双语之外的第三种语言，不引入新章节结构。

## 实现约束

1. 只编辑上述两个文件，三处改动逐段对应；其余行保持逐字节不变（`git diff` 在这些行零 hunk）。
2. 中文段与英文段语义一一对应，同一事实在两文件用词一致（`NotSigned` / `UnknownError` / `CSC_LINK` / `SmartScreen` 原样保留英文标识符，不翻译命令与状态值）。
3. 英文正文保持纯拉丁（除既有语言切换行外不出现汉字）；中文正文用简体中文。
4. 「升级方式」段末尾 `The signing posture is unchanged: ...` / `签名与公证口径不变：...` 保持逐字不动——该句枚举的是 macOS 签名与公证口径，本轮仍然成立；扩到该句会拉大 diff 且与「只改两处」冲突，若交付说明需要说明可在交付说明里提一句，不改正文。
5. 新增段落不写 run id、commit sha、workflow 名称等内部标识（这些留在 `docs/release-signing.md` / `docs/lessons.md`）；用户可核对的标识符只保留 `OpenCompare-Setup-0.2.17.exe` 的既有事实级别表述与 `NotSigned` / `UnknownError` 状态值。
6. 不改动 `release.yml`，因此 `<details><summary>简体中文</summary>` 折叠仍由脚本添加；发布说明文件内不得自行出现折叠标记。
7. 交付说明必须给出两文件 `git diff --numstat` 增删行数与「原句 → 新句」对照表（用户明确要求）。
