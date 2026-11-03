# Tech plan: Release 先验证后公开（draft 15/15 门禁 + 公开后 L1）

方案 A 已由 PRD 冻结：**draft 模式验证即将公开的字节**，不新增检查项、不改 `expected=15`、不改 `judgeReleaseGate` / `validateSummary` 语义。
本文件只写「怎么落、放哪测、有哪些坑」，逐条 AC 语义以 `prd.md` 为准。

---

## 1. 现状盘点（已核，改动前基线）

| 面 | 现状 | 与本项冲突点 |
| --- | --- | --- |
| `.github/workflows/release.yml` L743-1159 | `finalize` 第 1 步 `gh release edit --draft=false --latest`，之后才 dispatch / find-run / 等 aggregate | 先公开后验证，即 v0.2.17 漏放 Windows `UnknownError` 的根因 |
| 同上，post-publish 只读断言 | body 双语 / 链接绝对 / 唯一公开 / 资产齐备 / `latest*.yml` 命中 / latest 指针，全部依赖「已经公开」 | 这些步骤不能与 publish 调序，必须整体留在 publish 之后 |
| `.github/workflows/post-release-verify.yml` | `permissions: contents: read`；`gh release download {tag}` 读公开资产；头部注释写「already published release」 | draft 资产不可经 `releases/tags/{tag}` 读到，需要 `mode` 与 `releases/{id}` 路径 |
| `scripts/verify-release.mjs` L1338-1374 | `world.release(tag)` 固定走 `releases/tags/{tag}`；`runIdentityBytes` L1543 固定 `gh release download` | 无 draft 传输面；`runCommand` 用 `encoding: 'utf8'`（L872），**不能**承载二进制资产 |
| 测试钉板 | `src/main/release-packaging.test.ts` 的 `stepOrder` 逐字钉住**当前（错误）顺序**；`verify-release-gate.test.ts` L566-572 钉 `permissions = {contents: read}` 与只读口径 | 两处一起随实现更新，不允许只改实现不留断言 |
| 15 项注册表 | `CI_CHECK_GROUPS` 六组 15 项，`expectedCheckIds({layer:'ci'})` | 保持一字不动；draft 只换传输，不换判定 |

---

## 2. 结构：五个可独立提交、可独立验证的片段

改动面（生产 4 文件 + 文档 4 文件 + 测试 3 文件 + 基线快照 1）：

| # | 文件 | 类型 | 预估规模 |
| --- | --- | --- | --- |
| P1 | `scripts/verify-release.mjs`、`scripts/verify-release.d.mts` | 生产 | +180 / +35 |
| P2 | `.github/workflows/post-release-verify.yml` | 生产（CI） | +18 / −6 |
| P3 | `.github/workflows/release.yml` | 生产（CI） | +110 / −10 |
| P4 | `docs/release-process.md`、`docs/release-signing.md`、`AGENTS.md`、`AGENTS.md` 硬约束 | 文档 | +30 |
| P5 | `src/verify-release-gate.test.ts`、`src/main/release-packaging.test.ts`、`src/main/__fixtures__/release-packaging.json` | 测试 | +220 |
| P6 | `.munk/baseline/test-debt.json` | 棘轮快照 | growth `45384 → 新值`，`addedCases` |

**不新增 gate、不新增 npm 依赖、不新增 workflow、不改 `package.json`。**

### P1 — `scripts/verify-release.mjs`：draft 传输面（判定零改动）

新增（全部为传输/解析，判定仍只有 `judgeReleaseGate` 一处）：

1. `export const RELEASE_STATES = ['published', 'draft']`。
2. `parseArgs`：接受 `--release-state=published|draft`，缺省 `published`；拒绝其它取值、`--layer=local` 组合（B 层不读 Release）、`--aggregate` 组合（聚合不读 Release）。`parseArgs` 返回值里 `options.releaseState` 只在显式给出时存在（旧用例 `parseArgs([...]).options` 深等断言保持通过）。
3. `export function releaseApiPath({ tag, id, state })`（纯）：`published` → `repos/{owner}/{repo}/releases/tags/{tag}`；`draft` → `repos/{owner}/{repo}/releases/{id}` 与 `repos/{owner}/{repo}/releases/assets/{assetId}`，供 `actual.command` 与断言共用一份。
4. `export function judgeReleaseState({ requested, actual })`（纯，返回 `{ ok, problems }`）：
   - `requested='draft'` 且 `actual.draft !== true` → fail（`draft 模式要求 draft=true，实测已公开`，ac-draft-mode-metadata 的 fail-closed 分支）；
   - `requested='published'` 且 `actual.draft === true` → fail（公开模式不得读 draft；等价于今天 `releases/tags` 的 404 语义，但错误可读）；
   - 其余 pass。**只在 `runIdentityMetadata` 调用一次**，不新增检查项、不产生 `skip`。
5. `world.release(tag, { state })`（真实实现）：
   - `draft` 路径：`gh api repos/{owner}/{repo}/releases --paginate --jq '.[] | select(.tag_name=="<tag>") | [.id,.draft] | @tsv'` 解析行 → 0 条 / 多条一律抛错（多条即重复 draft，直接 fail）→ `gh api repos/{owner}/{repo}/releases/{id} --jq '{tag:.tag_name,draft:.draft}'` → `gh api repos/{owner}/{repo}/releases/{id}/assets --paginate --jq '[.[]|{id,name,size,digest}]'`（每页数组拼接，按 `[` 分隔解析；**不用** `releases/{id}` 内嵌 `assets`，避免 30 条截断的静默丢资产）。
   - `published` 路径：保持今天的 `releases/tags/{tag}` 调用与 jq 形状**零改动**（公开路径不回归）。
   - 归一化输出统一为 `{ id, tag, draft, assets: [{ id, name, size, sha256, url }] }`；`digest` 缺失 → `sha256: null`（既有 fail-closed 口径，`runIdentityMetadata` 已判 fail，不新增分支）。
6. `world.downloadAsset({ asset, dir })`（真实实现，二进制安全）：`gh api <asset path> -H 'Accept: application/octet-stream'`，`spawnSync` 的 `stdio: ['ignore', fd, 'pipe']` 直接写 `join(dir, name).part`，`status === 0` 才 `rename` 成正式名，否则删除 `.part` 并返回原样 `{status,stdout,stderr}`。**不经过 utf8 解码、不受 `maxBuffer` 影响。**
7. `runIdentityBytes`：draft 模式逐资产 `world.downloadAsset`（不再 `gh release download`），字节数 + sha256 校验**沿用现有同一段循环**；published 模式一字不改。`ctx.releaseState` 由 `runVerifyReleaseCli → executeChecks → createCheckContext` 透传。
8. 两条 identity 检查的 `command` 文案改为模式中立（如 `gh api repos/{owner}/{repo}/releases[/tags/{tag}]`、`gh release download {tag} | gh api .../releases/assets/{id}`），仅作证据展示，不参与判定。
9. `d.mts`：`ReleaseAsset` 增 `id?: number`，`ReleaseMetadata` 增 `id?: number` / `draft?: boolean`，`World.release(tag, options?: {state?: ReleaseState})`、`World.downloadAsset(...)`、`ParsedArgs['options'].releaseState`。

**不做**：不改 `CI_CHECK_GROUPS` 的 id / name / group 划分，不改 `expectedCheckIds`，不改 `judgeReleaseGate` / `validateSummary` / `buildSummary`，不加 `fetch` / `node:http`。

### P2 — `post-release-verify.yml`：`mode` 输入 + 权限口径改写

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:  { required: true, ... }              # 不变
      mode: { required: true, default: 'draft', type: choice, options: [draft, published] }
run-name: post-release-verify ${{ inputs.tag }}   # 不变（有断言）
permissions:
  contents: write          # 只为读取 draft 资产；工作流本身零写操作
env:
  TAG: ${{ inputs.tag }}
  MODE: ${{ inputs.mode }}
```

- `verify` 步骤命令：`node scripts/verify-release.mjs --tag="$TAG" --layer=ci --release-state="$MODE" --platform=... --out=verify-out`。
- `spike` / `aggregate` 不传 `--release-state`（都不读 Release）。
- 头部注释整段重写：验证对象是「同一 tag 的 draft（publish 前）」或「已公开 Release（复验）」；`contents: write` 仅用于 GitHub 对 draft 资产的鉴权读取；`gh` 只做 GET（`gh api` / `gh release download`）；不持有签名密钥、不写 tag / release / asset / body；发布顺序由 `release.yml` 的 `finalize` 保证（验证在前、publish 在后）。

### P3 — `release.yml`：`finalize` 重排（唯一 publish 入口）

新步骤顺序（步骤名即契约，测试按名字断言）：

1. `Resolve the tag's release state`（**新**，只读）：`gh api repos/${GITHUB_REPOSITORY}/releases --paginate | jq -s` 取该 tag 的 release；0 条 / 多条 / `draft` 非布尔 → `::error::` + `exit 1`；写 `${RUNNER_TEMP}/release-state.txt` = `draft` 或 `published`，并打印 `release id` 与 `draft`。
2. `Dispatch the post-release verification`（改）：保留 `since` 记录与 2 分钟时钟偏移，新增 `-f mode="$(cat "${RUNNER_TEMP}/release-state.txt")"`，日志第一行打印 `验证模式: <mode>`。
3. `Find the post-release verification run for this tag`（不变）。
4. `Assert the post-release verification aggregate passed`（不变 + 失败可读性）：`aggregate != success` 时先尝试 `gh run download <run_id> --name post-release-verify-<tag>-<run_id>-aggregate --dir verify-out`（best-effort），把 `verify-out/summary.json` 的 `status`/`problems` 与每个 `verify-out/steps/*.json` 的 `id=status` 打到日志，再 `::error::`（含 run id、失败检查名、`verify-out` 证据路径）+ `exit 1`；`success` 分支保持「artifact 名 + run id」硬断言。
5. `Make the tag's release public`（**下移**，正文一字不改、公网可见 cmd 仍为唯一一处 `--draft=false`）：`gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`。语义：走到这里代表 draft 15/15 已 PASS。
6. 既有 post-publish 只读断言**相对顺序不变**：body 双语 → 链接绝对 → 唯一公开 → 资产齐备 → `latest*.yml` 命中 → latest 指针。
7. `Run the public L1 checks after publishing`（**新**，最后一步）：`gh api releases/tags/{tag}` 断言 `draft=false`、`html_url` 非空、`assets[]` 非空且每项有 `browser_download_url`；`curl -sSIL -o /dev/null -w '%{http_code}'` 对 `html_url` 与每个资产 URL 断言 `200`；选**带 digest 的最小资产**（node 从 JSON 里挑 `size` 最小且 `digest` 非空者）下载后 `sha256sum` 与 digest 比对；缺 digest / 非 200 / sha 不符 → `::error::` + `exit 1`。**不替代、不放宽 P2 的 15 项。**

`finalize` 权限继续 `contents: write` + `actions: write`；不新增 `continue-on-error`；失败路径保持「Release 停留在 draft」（publish 在第 5 步，任何更早失败都不会触达）。

**已公开 tag 的 dispatch 复跑**：`Resolve` 读到 `published` → dispatch `mode=published` → 走公开复验 → 第 5 步对公开 Release 重复一次 `--draft=false --latest`（GitHub 上是幂等 no-op）。这条分支写进 P4 文档，避免「复跑会失败」的误判。

### P4 — 文档口径（四处必须与实现逐字一致）

- `docs/release-process.md`：把「唯一公开 Release」一节改写为「先验证后公开」+「公开后 L1」两小节：draft 创建 → 三平台上传 → `post-release-verify` `mode=draft` 15/15 → aggregate PASS → publish → public L1；任一失败保持 draft、**不回滚、不先公开**；写出 `gh release edit --draft=false --latest` 是唯一公开动作且只在 aggregate PASS 之后。
- `docs/release-signing.md`：§3 增一句发布姿态（draft 验证后公开）；§6 第 4 条「唯一公开正式 Release」保留并注明「在 draft 15/15 PASS 之后」；§7 增一句「Windows `UnknownError` 在 draft 阶段即拦住 publish」。
- `AGENTS.md` 硬约束末尾 +1 行：发布先验证后公开（draft 15/15 → aggregate PASS → publish；失败保持 draft，不先公开再回滚；public L1 只做公开可得性/sha256，不替代 15 项）。
- `post-release-verify.yml` 头部注释即 P2 的重写。

---

## 3. 数据流（draft 模式一次 run）

```
finalize.Resolve        gh api releases (paginate) ──► release-state.txt = draft
finalize.Dispatch       gh workflow run post-release-verify.yml -f tag -f mode=draft
  spike(ubuntu/mac)     scripts/verify-release.mjs --spike            (不读 Release)
  verify(mac|linux|win) --layer=ci --release-state=draft --platform=X
     world.release(tag,{state:'draft'})
        releases?tag_name=<tag>           → id（0/多条 fail）
        releases/{id}                     → tag + draft:true（否则 fail-closed）
        releases/{id}/assets --paginate   → id/name/size/digest（digest 缺失 fail）
     world.downloadAsset(asset, dir)      → gh api releases/assets/{id} -H octet-stream ⇒ 字节直写
     identity-asset-bytes-sha256          → 字节数 + sha256 与元数据 digest 逐项比较
     其余 13 项                           → 从 <out>/release-assets 读同一批字节（mac/linux/win/cancel/evidence）
  aggregate            --aggregate=parts → 15 项 / expected=15 / fail-closed 汇总
finalize.Aggregate gate  aggregate==success 且 artifact 存在   ← 否则 exit 1，Release 仍 draft
finalize.Publish         gh release edit --draft=false --latest   ← 唯一公开动作
finalize.L1              releases/tags/{tag} + 每资产 URL 200 + 最小资产 sha256 == digest
```

单点原则保持：注册表 1 处、期望集合 1 处、终局判定 1 处（`judgeReleaseGate`）、draft 状态判定 1 处（`judgeReleaseState`）、资产校验循环 1 处（`runIdentityBytes`）。

---

## 4. Testability by Design（无系统对话框依赖）

本项不涉及本地文件/目录选择器；等价要求是「**整条发布门禁必须能被无凭据、无网络、无双进程对话框的自动化驱动**」，设计上给三条直连入口：

1. **CLI 参数直给**：`--release-state=published|draft` 是本轮新增的唯一模式开关（`parseArgs` 校验取值），因此 draft / published 两条路径都能被单进程 `runVerifyReleaseCli` 直接驱动，不依赖 GitHub 侧状态。
2. **注入式 world**：`world.release` / `world.downloadAsset` / `world.run` 全部可注入，测试用 `FakeHost` 提供真实字节（含非 UTF-8 字节）而不联网；`createWorld().downloadAsset` 的二进制安全另有 PATH 上假 `gh` 的真实子进程用例。
3. **环境变量 + PATH 假命令**：`finalize` 的 shell 段用 `RUNNER_TEMP` 文件 + PATH 上的假 `gh`/`curl` 串行驱动（沿用既有 `POST_RELEASE_LOOKUP_SECONDS` 覆盖手法），使「失败不 publish / 成功才 publish / L1 末位」可在毫秒级、零网络下回归。

---

## 5. 测试金字塔与 ac 映射

### L1 — 纯逻辑 / 状态单测（`src/verify-release-gate.test.ts`，无 fs 副作用、无进程）

| ac | 断言 |
| --- | --- |
| ac-expected-15-unchanged | `expectedCheckIds({layer:'ci'})` 仍为 15 个且集合不变；`checksFor` 顺序不变；`summary.counts.expected === 15`；missing / unexpected / skip 仍 fail（既有用例保留） |
| ac-draft-mode-metadata（判定部分） | `judgeReleaseState`：`{requested:'draft', actual:{draft:false}}` / `{requested:'published', actual:{draft:true}}` → `ok=false`；truth table 全覆盖 |
| ac-draft-mode-metadata（命令形状） | `releaseApiPath`：draft → `releases/{id}`、`releases/assets/{id}`；published → `releases/tags/{tag}`；`parseArgs` 接受 `--release-state=draft`，拒绝 `--release-state=latest` / `--layer=local` 组合 / `--aggregate` 组合 |
| ac-public-l1-after-publish（顺序） | `release.yml` 解析后 `stepIndex(publish) > stepIndex(aggregate) > stepIndex(dispatch)`，L1 步骤名是 finalize 最后一步 |
| ac-docs | `release-process.md` / `release-signing.md` / `AGENTS.md` 的 markdown atoms 含「publish 之前验证」「保持 draft」「不回滚」；`post-release-verify.yml` `permissions === {contents:'write'}`、`inputs.mode` 取值集合 `[draft,published]`、`run-name` 不变、仍无 `secrets.` / `gh release (upload|edit|create|delete)` / `continue-on-error` |

### L2 — In-process 接口 / 内存库 / 无头组件（不上真机、不联网）

| ac | 用例位置 | 断言 |
| --- | --- | --- |
| ac-draft-mode-metadata | `verify-release-gate.test.ts` `FakeHost` 扩 `release(tag,{state})` + `downloadAsset` | draft 模式命令记录只出现 `api repos/.../releases`、`releases/{id}`、`releases/{id}/assets`、`releases/assets/{id}`，**零** `releases/tags/{tag}`、零 `gh release download`；下载文件字节与 fixture 完全一致（fixture 字节含 `\x00\xff` 以证明非 utf8）；sha256/size 与元数据一致时 pass，篡改时 identity 步 fail 且退出非零 |
| 同上（fail-closed） | 同上 | release 已公开但请求 draft → identity 步 fail + 退出非零；0 条 / 重复 draft → fail；digest 缺失 → fail（既有分支 + 新路径） |
| 二进制安全（真实子进程） | 同上（`createWorld` + PATH 假 `gh`，输出 `printf '\x00\xff\xfe'`） | `createWorld().downloadAsset` 落盘字节 sha256 == 原始字节；`.part` 残留为 0 |
| ac-publish-after-aggregate | `release-packaging.test.ts` 新 `describe('finalize publish gate')`：从 YAML 取 `Resolve → Dispatch → Find → Aggregate → Publish` 五个 `run` 体，各自写临时 `.sh` 顺序 `bash -e` 执行，PATH 前置假 `gh`（记录每次调用到 `gh-calls.log`） | aggregate=`failure` → 链在第 4 步非零退出，`gh-calls.log` **不含** `release edit`；aggregate=`success` + artifact 名命中 → 第 5 步执行，`gh-calls.log` 的 `edit` 行号 **大于** `run view` 与 `api .../artifacts` 行号 |
| ac-failure-keeps-draft | 同上 | 失败分支输出含失败检查名（从 fake `verify-out/steps/*.json` 读）与 `verify-out` 路径；`gh-calls.log` 无 `edit`（=Release 仍 draft） |
| ac-public-l1-after-publish（行为） | 同上，单独 harness 跑 L1 步骤（假 `gh` + 假 `curl`） | 全 200 + digest 匹配 → exit 0；任一资产 404 → 非零；sha256 与 digest 不符 → 非零 |
| ac-windows-unknown-error-fail | 既有 `failCases`（`authenticode:'UnknownError'`、`HashMismatch`、空值、非零 exit） | `windows-authenticode` fail、summary fail、退出非零；`NotSigned` / `Valid` 仍 pass（保留） |
| ac-linux-launch-fail | 既有 `launchFailure` 注入用例 | `linux-directory-compare` / `cancel-leg` fail，step JSON + log 含 `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `verify-out` 路径（保留） |
| ac-identity / ac-a-no-skip / ac-gate-* | 既有用例 | 保持全绿，不改判定 |

### L3 — 真实设备 / 真 GitHub（**不在本 WI**）

真 draft run（三平台 15/15 + aggregate + publish + public L1）需要真实 tag 与凭据，由 Product Owner 在 Ops 按需发起；本 WI 只保证 code_gates 全绿并把该外部条件写进交付说明，**不得声称已恢复发布验收**。

---

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| publish 下移后，public-only 断言若留在 publish 之前会误判失败 | P3 保留其相对顺序整体后移；L1 静态断言「publish 之后」+ 链式 harness 覆盖 |
| `contents: write` 扩大攻击面 | 该 workflow 无 `secrets.`、无写命令（既有 forbidden patterns 静态断言 + 新增「只出现 `gh api` / `gh release download`」断言）；`release.yml` 仍是唯一 publish 入口（`--draft=false` 字面量全仓唯一，fixture 已钉） |
| draft 资产 >30 条被静默截断 | 不用 `releases/{id}` 内嵌 `assets`，改用 `releases/{id}/assets --paginate` 行式解析 |
| 大资产 `spawnSync` 缓冲 / utf8 破坏字节 | `downloadAsset` 用 fd 直写 + `.part` → rename；`.part` 在非 0 退出时删除 |
| `gh release download` 与 draft 路径语义分叉 | 传输两条路、**校验一条路**（`runIdentityBytes` 同一循环）；published 路径零改动 |
| 既有钉板测试锁死旧顺序 | 明确同步改 `src/main/__fixtures__/release-packaging.json`（`finalize-order` / `metadata-gate-position` / dispatch token 增 `-f mode=` / aggregate token 增证据段 / 新增 `Resolve` 与 L1 行），属预期改动 |
| 测试行数触及棘轮 | `.munk/baseline/test-debt.json` growth `45384 → 新 ceiling`（增幅预计 ≤300，限 400），`addedCases` 记录新增用例数 |
| 已公开 tag 复跑语义变化 | `published` 模式 + 幂等 `--draft=false --latest`，写进 P4 文档 |

## 7. 明确不做

- 不改 `package.json#version`、不建 tag、不 dispatch、不写任何已公开 Release / 资产 / release notes。
- 不改 15 项注册表 / `expected` / 阈值，不新增检查项，不把 fail 降级。
- 不改 `src/` 产品运行时代码、不加 npm 依赖、不新增 gate、不动 `.munk/baseline/**` 领域文档。
- 不为 public L1 新开 workflow（它是 `finalize` 的末位只读步骤，不是独立门）。

## 8. 交付自查

`pnpm install / lint / typecheck / build / build:web / test` + `.munk/code-gates.json` 全量（26 门，含 `verify-release-gate`、`test-debt-gate`）逐一 exit 0；`src/munk-gates.test.ts` 门禁钉板不变（本项不新增 gate）；交付写明「真 draft run 需合入 main 后由 Product Owner 触发」为外部验收条件。
