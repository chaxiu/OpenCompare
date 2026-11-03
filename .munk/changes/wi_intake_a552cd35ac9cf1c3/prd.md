# 修复 post-release-verify aggregate 跨机器证据校验误判（15/15 仍 fail）

## 范围

`post-release-verify` 的 `aggregate` 作业把 mac / linux / windows 三个平台 job 的 `verify-out` artifact 下载到 `parts/**` 后合并。当前 `scripts/verify-release.mjs` 的 `aggregateSteps` 原样保留每个 step JSON 里的 `evidence` 绝对路径（各 runner 的 `/Users/runner/...`、`/home/runner/...`、`C:\...` / `D:\...`），再交给 `judgeReleaseGate` 用 `existsSync` 校验；aggregate 作业只拿到 artifact 文件，这些绝对路径必然不存在，于是即使 `counts.pass=15 fail=0 total=15 expected=15`，`summary.status` 仍被判 `fail`，`release.yml` 的 `finalize` 永远等不到 aggregate success，v0.2.18 发布会卡死在 draft。

本项只修 aggregate 模式的证据存在性校验，并补跨机器 artifact 形态的回归测试；不改发布顺序、不改期望清单、不碰任何 Release。

事实基线（只读，不在本项重跑）：真实 run `41571697872` 的 aggregate artifact `summary.json` 为 `pass=14 fail=1 total=15 expected=15`，`problems` 含 13 条「step 某 id evidence 不存在: /home/runner/... | /Users/runner/... | D:\...」。本机用该 run 三平台 artifact 复现：仅把 `windows-authenticode` 改为 `pass` 后执行 `node scripts/verify-release.mjs --tag=v0.2.17 --layer=ci --aggregate=<tmp> --out=<tmp>/verify-out`，得到 `summary fail pass=15 fail=0 skip=0 total=15 expected=15`、`exit=1`、`problems=15`。

## 验收标准

- ac-aggregate-evidence-mapped-into-artifact: aggregate 模式对每个 step 的每条 `evidence`，按该 step JSON 所属平台 artifact 根（`parts/**` 下含 `steps/` 的目录）解析为稳定路径 `logs/<basename>`（兼容 `/` 与 `\` 分隔符；等价稳定规则亦可），解析到的文件真实存在才判该证据通过。
- ac-aggregate-cross-machine-15-pass: 用真实 artifact 形态（mac `/Users/runner/...`、linux `/home/runner/...`、windows `C:\...` 与 `D:\...` 三种绝对路径）构造三方 `parts` 并合并，命令 `node scripts/verify-release.mjs --tag=<tag> --layer=ci --aggregate=<parts> --out=<out>` 退出码 0，`<out>/summary.json` 满足 `status=pass`、`counts={pass:15,fail:0,skip:0,total:15,expected:15}`。
- ac-aggregate-missing-evidence-fail-closed: 在 ac-aggregate-cross-machine-15-pass 的同一份 `parts` 中删除任一 step 的证据文件（`logs/` 下对应文件）后重跑同一命令，退出码非 0、`summary.json` 的 `status=fail`，且 `problems` 含该 step id 与「evidence 不存在」语义。
- ac-aggregate-same-machine-preserved: 现有同机 aggregate 用例（三平台分别 `--platform=<p>` 产出后再 `--aggregate` 合并）保持通过，仍为 15/15、`status=pass`、退出码 0。
- ac-evidence-check-not-disabled: `validateStep` 仍对不存在或空的 `evidence` 报 problem；不得删除证据检查、不得把证据缺失降级为 warn / skip。
- ac-expected-15-unchanged: `expectedCheckIds({layer:'ci'})` 仍恰为 15 个 id 且顺序不变；`judgeReleaseGate` / `validateSummary` / `expected=15` 的任何既有阈值与判定不放宽，不删检查项。
- ac-fail-closed-unchanged: 缺步骤、多余步骤、重复 id 冲突、skip、fail、证据缺失任一存在时 aggregate 仍非零退出且 `summary.status=fail`。
- ac-scope-bounded: 生产代码 diff 仅 `scripts/verify-release.mjs`（必要时 `scripts/verify-release.d.mts`）与 `src/verify-release-gate.test.ts`，加必要 baseline 记录（`.munk/baseline/domains/release-verify/product.md`、`.munk/baseline/test-debt.json`）；`package.json#version`、release notes、`README*`、`.github/workflows/release.yml` 的验证顺序与 expected 清单零 diff。
- ac-code-gates-green: `.munk/code-gates.json` 全部门禁（含 `verify-release-gate`、`test-debt-gate`）退出码 0。
- ac-delivery-main: delivery 合入 `main`，回执给出修复 commit、`code_gates` 结论、跨机器 15/15 回归用例名与结果。
- ac-no-release-mutation: 不推 tag、不 dispatch、不新建 / 修改 / 删除任何 Release 或资产。

## 非目标

- 不改 `release.yml` 的验证先于公开顺序、`finalize` 判定逻辑、`expected` 清单或 workflow 触发面。
- 不改 A 层检查注册表、15 项检查的实现、B 层内存判定、draft / published 传输。
- 不改产品运行时代码、打包 / 签名 / 公证、README、CHANGELOG、release notes。
- 不重跑真实 run、不推 tag、不碰 v0.2.17 / v0.2.18 的 Release 与资产；真实 draft 发布验收由 Product Owner 在合入后触发。
- 不新增 npm 依赖，不引入网络调用。

## 实现约束

- 证据映射必须在 aggregate 合并阶段完成，最终仍由唯一 `judgeReleaseGate` 判定；不得在 CLI 里新增第二份内联 0/1 判定，也不得绕过 `validateSummary`。
- 映射规则固定为「step JSON 所属 artifact 根的 `logs/<basename>`（basename 同时按 `/` 与 `\` 切分）；等价稳定规则亦可」，解析失败时保留一个必定不存在的 artifact 内路径，使证据缺失继续 fail-closed。
- `summary.json` 中 step `evidence` 指向 aggregate runner 上真实存在的 `parts/**` 路径；不得写入不存在的原始跨机器绝对路径。
- 回归测试写入 `src/verify-release-gate.test.ts`，不新增 `*.test.ts` 文件；用 `writeFileSync` 在 `mkdtemp` 临时目录构造 artifact 形态，不连网、不启动 Electron、不访问本机夹具；避免新增 `toContain` 断言。
- 新增测试行数会突破 `.munk/baseline/test-debt.json` 当前 `repoTestLines` 上限，需按 ratchet 规则更新 `growth`（`from` 等于上一版 committed ceiling，`to` 等于新 ceiling，行数增幅 ≤400，`addedCases>0`）并保持 `floors` 不降。
- 完成后在 `docs`/baseline 只记录本域「最近交付证明」，不新增 lessons 章节（不在本项范围）。
