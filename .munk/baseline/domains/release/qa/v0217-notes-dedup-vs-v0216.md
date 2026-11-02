# v0.2.17 发布说明去重：已随 v0.2.16 发布的「同步失败提示本地化」不重复宣称

- WI：`wi_intake_792a3d61cf3bfc73`
- 域：`release`（发布面文案与发布说明口径；被测改动落在两份 v0.2.17 notes、`CHANGELOG.md`、`src/main/release-version-gate.test.ts`、`docs/release-signing.md`，以及本域 `product.md` 的 AC 行与长期约定）
- 来源：`.munk/changes/wi_intake_792a3d61cf3bfc73/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故按 prd 的 16 条 AC 逐条落档，非 change-pack 用例 copy；`needSelfTest=false`，以 Host `code_gates` 为交付门槛）
- 基线：`main @ad1f513`（已含 test-debt ratchet 门，门禁矩阵 **22 门**）
- 改动面（除 change-pack `prd.md` 与 `.munk/baseline/**`）：`docs/release-notes/v0.2.17.md` 2/6、`v0.2.17.zh-CN.md` 2/6、`CHANGELOG.md` 2/4、`src/main/release-version-gate.test.ts` 3/3、`docs/release-signing.md` 1/1；两版 `README.md`、`package.json`、`.github/workflows/release.yml`、`docs/release-evidence/**`、`src/**`（该测试文件除外）零 diff

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-notes-en-no-i18n-section | `docs/release-notes/v0.2.17.md` 的 H3 列表为 `Template placement rows show and choose their action` / `Case-insensitive collisions and path containment` / `Windows portable download`；`grep -cF -e EACCES -e EPERM -e 'sync failures follow the interface language' -e 'Localized sync failures'` = **0** | 满足 |
| ac-notes-zh-no-i18n-section | `docs/release-notes/v0.2.17.zh-CN.md` 的 H3 列表为 `模板归位逐条动作列与显式移动` / `大小写不敏感碰撞与路径越界防护` / `Windows 免安装包`；`grep -cF -e EACCES -e EPERM -e '同步失败提示本地化' -e '同步失败提示跟随界面语言'` = **0** | 满足 |
| ac-notes-intro-two-items | 英文开头段含 `two` 且 `three` 命中 0；中文开头段含 `两项` 且 `三项` 命中 0；两句仍只描述「动作列 / 显式移动」与「大小写折叠 / 路径越界」两组事实（`diff +2/−6`，纯删减 + 数量词修正） | 满足 |
| ac-notes-h3-only-two-changes | 两版变化类 H3 各恰 2 个（模板动作列 / 显式移动、大小写碰撞 / 路径越界），加平台段后 H3 总数各 3；无第四个变化小节 | 满足 |
| ac-notes-h3-dedup-vs-v0216 | 与同语言 v0.2.16 的 H3 交集仅 `Windows portable download` / `Windows 免安装包`（平台段）；`Failure messages follow the interface language` / `失败提示随界面语言本地化` 及 `Directory-only states use the shared vocabulary` / `Template placement on real user directories` / `Repeated dry-run is idempotent` / `Samples live in Settings` 与其中文镜像均不再出现在 v0.2.17 | 满足 |
| ac-notes-risk-scope-two-items | 两版 `Risk and verification scope` / `风险与验证规模` 段只列两组改动，不再出现 sync 失败本地化表述；`This release states no performance or memory numbers` /「不写任何性能或内存数字」逐字保留 | 满足 |
| ac-notes-h2-parity-kept | 两版各恰 6 个 `## ` 标题、顺序逐项对应（`What changed` / `Windows installer and portable zip` / `macOS signing and notarization` / `Not in this release` / `Risk and verification scope` / `Upgrade` 与中文镜像）；`judgeNotesHeadings` 仍 exit 0 | 满足 |
| ac-notes-switch-and-links-kept | 两版第 3 行语言切换行与 tag 固定绝对链接逐字未变，各仍恰 1 条 markdown 链接（该两行零 diff） | 满足 |
| ac-notes-retained-facts | 两版仍覆盖模板事实 token：英文 `Actions column` / `copies by default` / `explicitly checked` / `sha256` / `mtimeSec` / `source and the target` / `no rollback` / `Case-fold collisions` / `Path escape refused`；中文 `动作列` / `默认复制` / `显式勾选` / `sha256` / `mtimeSec` / `源与目标` / `不执行回滚` / `碰撞折叠` / `路径越界拒绝`；并保留 NSIS 安装包 + 免安装 zip、macOS 签名 + 公证、`Not in this release`、`Upgrade` 各节 | 满足 |
| ac-changelog-two-items | `## v0.2.17` 段导语为「两项」且 `三项` / 同步失败本地化短语 / `EACCES` / `EPERM` 命中 0；`### 改进` 下恰 2 条 bullet（动作列与显式移动合并条、碰撞折叠 + 路径越界合并条）；`### 不做的事` 三条与 `### 升级方式` 保留；`## v0.2.16`（行 24）及更早条目零删除行（diff 2/4 全在 v0.2.17 段内） | 满足 |
| ac-test-note-tokens | `src/main/release-version-gate.test.ts` 的 `noteFacts` 三个 token 数组（en / zh / 公共）均不含 `EACCES`，其余 token（含 `EPERM`、`sha256`、`mtimeSec`、`pipeline` 等）逐项保留；`it(` 用例数改动前后一致、无新增 `skip` / `only`；`expect(` 数不减少（diff 3/3 与删除 token 后同位置重排，未放宽匹配） | 满足 |
| ac-baseline-release-ac-no-i18n | `.munk/baseline/domains/release/product.md` 的 `ac-notes-template-move / ac-notes-safety-and-i18n` 行与 `qa/v0217-version-convergence-bilingual-notes.md` 的 `ac-notes-safety-and-i18n` 行已去掉 `EACCES` / `EPERM` / i18n 本地化断言，仍保留碰撞折叠与路径越界事实 | 满足 |
| ac-baseline-dedup-convention | `product.md` 新增「发布说明去重长期约定」段：只写相对上一已发布版本新增的用户可见变化、已随上一版发布的条目不重复宣称、发布前逐条对照上一 tag 的 notes（对照 `docs/release-notes/<上一 tag>.md` 的 H2/H3 与 bullet 主题，并与上一 tag 的 `CHANGELOG.md` 段交叉核对）、H2/H3 交集只保留平台段等非「本版新增」表述 | 满足 |
| ac-signing-path-backticked | `docs/release-signing.md` 该句改为 ``本版发布说明见 `docs/release-notes/v0.2.17.md`。``，路径带反引号、句末标点不变（单 hunk 1/1） | 满足 |
| ac-diff-scope-only | `git diff --name-only` = 两版 notes、`CHANGELOG.md`、`src/main/release-version-gate.test.ts`、`docs/release-signing.md` 加 `.munk/baseline/domains/release/{product.md,qa/v0217-version-convergence-bilingual-notes.md}`；`README.md` / `README.zh-CN.md` 第 5 行、`package.json#version`（仍 `0.2.17`）、`release.yml` 默认 tag、产品运行时代码与其他测试零 diff | 满足 |
| ac-gates-22-green / ac-delivery-local-merge-only / ac-h3-comparison-reported | `code_gates` 22 门全绿（attempt 001 全 exit 0，`.munk/runs/run_intake_792a3d61cf3bfc73/code-gates/attempts/001`），`test` 门 115 files / 1802 passed + 1 skipped（1803）；`test-debt-gate` 实测 `repoTestLines` 42718 ≤ 42724、`repoTestCases` 1373 ≥ 1373，未改 `.munk/code-gates.json` 与 `.munk/baseline/test-debt.json`；交付只走 `local_merge`，未打 tag / 未 dispatch / 未改已公开 tag / Release / 资产、未新建 `docs/release-evidence/v0.2.17.md`；H3 对照见下节 | 满足 |

## H3 对照：v0.2.17 vs v0.2.16（同语言）

| v0.2.17 英文 H3 | v0.2.16 英文 H3 | 交集 |
| --- | --- | --- |
| Template placement rows show and choose their action | Template placement on real user directories | 无（主题不同：动作列 / 显式移动 vs 接入真实目录） |
| Case-insensitive collisions and path containment | — | 无（本版新增变化） |
| Windows portable download（平台段） | Windows portable download（平台段） | **有（平台事实，非本版新增变化宣称）** |

| v0.2.17 中文 H3 | v0.2.16 中文 H3 | 交集 |
| --- | --- | --- |
| 模板归位逐条动作列与显式移动 | 模板归位接入真实用户目录 | 无 |
| 大小写不敏感碰撞与路径越界防护 | — | 无（本版新增变化） |
| Windows 免安装包（平台段） | Windows 免安装包（平台段） | **有（平台事实）** |

已从 v0.2.17 移除的 v0.2.16 已发布条目：`Failure messages follow the interface language` / `失败提示随界面语言本地化`（同条亦见于 v0.2.16 CHANGELOG 段，提交 `ed5bdd3` 在 `v0.2.16` tag 内）。删掉后两版残留交集仅有平台段，且该段不作「本版新增变化」宣称。

## 备注

- 本项零功能改动：只删文案、改两处数量词、删一个测试 token、补一对反引号。
- tag 前是唯一修正窗口：v0.2.17 仍未打 tag，发版收尾项不必再改 notes 正文，但需确认 notes 与 tag 内容一致后再打 tag。
