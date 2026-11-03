# Release 先验证后公开：draft 15/15 门禁与公开后 L1

## 范围

修正 OpenCompare 发布流水线的顺序缺陷：三平台 15 项验证必须在 Release 公开**之前**完成，只有 aggregate `pass=15/15` 才允许执行 `gh release edit --draft=false --latest`；任一验证失败时 Release 保持 draft，不公开、不回滚。

现状证据（已核）：

- `.github/workflows/release.yml` 的 `finalize` 第一步就是 `gh release edit "${RELEASE_TAG}" --draft=false --latest`，之后才 dispatch `post-release-verify` 并等待 aggregate。
- `.github/workflows/post-release-verify.yml` 头部写明验证对象是「already published release」，且 `verify` job 用 `gh release download <tag>` 下载公开资产。
- 因此 v0.2.17 在公开之后才发现 Windows 安装包被 macOS 证书签坏（Authenticode `UnknownError`），属于「先公开、后验证」的流水线缺陷。

本 Phase 的实现选择 **A（draft 模式）**，理由见「实现约束」。范围包括：

1. `scripts/verify-release.mjs` 增加 draft 传输模式：以 `releases/{id}` 取代 `releases/tags/{tag}` 读取元数据，按 `releases/assets/{asset_id}` + `Accept: application/octet-stream` 鉴权下载资产；15 项注册表、`expected=15`、`judgeReleaseGate` / `validateSummary` 的 fail-closed 语义保持不变。
2. `.github/workflows/post-release-verify.yml` 增加 `mode=draft|published`：draft 模式在 publish 前验证 draft 资产，published 模式保留公开复验能力；头部注释改为与实现一致。
3. `.github/workflows/release.yml` 的 `finalize` 顺序改为：draft 验证 dispatch → 找到 run → 等 aggregate `success` + aggregate artifact → 才 publish；publish 后增加轻量 public L1（公开 URL / 公开可得性 / sha256），public L1 不替代 publish 前的 15 项。
4. 更新 `docs/release-process.md`、`docs/release-signing.md`、`AGENTS.md` 的发布纪律，写死「publish 之前验证、失败保持 draft、不做先公开再回滚」。
5. 负向回归：Windows `UnknownError` 与 Linux 启动失败各一条可复现测试/脚本，断言 gate fail 且 `finalize` 不执行 publish。

## 验收

- ac-publish-after-aggregate: `release.yml` 的 `finalize` 中，publish 步骤位于 draft 验证的 dispatch / find-run / aggregate 三步之后；用假 `gh` 驱动 aggregate 返回 `failure` 时 finalize 以非零退出且调用记录中不出现 `gh release edit ... --draft=false`；aggregate 返回 `success` 且 aggregate artifact 存在时，publish 才执行，日志能读出「验证通过 → publish」的先后顺序。
- ac-draft-mode-metadata: `post-release-verify.yml` 的 `mode=draft` 下，`verify-release.mjs` 通过 `gh api repos/{owner}/{repo}/releases/{id}` 读取 draft 元数据（不使用 `releases/tags/{tag}`），并通过 `gh api repos/{owner}/{repo}/releases/assets/{asset_id} -H "Accept: application/octet-stream"` 逐资产下载；下载文件按二进制写入，sha256 与元数据声明一致；若目标 Release 已不是 draft，draft 模式 fail-closed。
- ac-expected-15-unchanged: `expectedCheckIds({ layer: 'ci' })` 仍返回恰好 15 个 id；draft 模式 summary 的 `counts.expected` 为 15；缺失、额外、skip 任一检查都使 summary fail；不得删除、改名、跳过检查项，不得把 fail 降级为 warn。
- ac-windows-unknown-error-fail: 给定 Windows 安装包的 `Get-AuthenticodeSignature` 返回 `UnknownError`（或 `HashMismatch` / 空值 / 非零 pwsh 退出），`windows-authenticode` 为 fail 且 summary 为 fail；`NotSigned` 与 `Valid` 仍 pass。负向用例必须落成可回归测试。
- ac-linux-launch-fail: 给定 Linux AppImage 在暴露 DevTools page 前退出或启动失败，`linux-directory-compare` / `cancel-leg` 为 fail，step JSON / log 含 `reason`、`exitCode`、`signal`、`stdout`、`stderr` 与 `verify-out` 路径，summary 为 fail；负向用例必须落成可回归测试。
- ac-failure-keeps-draft: draft 验证任一检查 fail 时，`finalize` 在 publish 步骤之前非零退出，Release 保持 `draft=true`；不出现「先公开再回滚」。失败输出必须写清失败检查名、`verify-out` 证据路径与根因，不以「未知错误」收尾。
- ac-public-l1-after-publish: publish 成功后运行轻量 public L1：公开 Release URL 可访问、每个资产的公开下载 URL 返回 HTTP 200、至少一个资产的 sha256 与 Release 元数据 digest 一致；该 L1 独立于 publish 前的 15 项，不替代、不放宽 15 项门禁。
- ac-docs: `docs/release-process.md`、`docs/release-signing.md`、`AGENTS.md` 与 `post-release-verify.yml` 头部注释均写死「publish 之前验证、失败保持 draft、不做先公开再回滚」，并与实际 workflow / 脚本行为一致。
- ac-tests-green: 全量 `.munk/code-gates.json` 门禁通过，至少包含 `pnpm test`（覆盖 `src/main/release-packaging.test.ts`、`src/verify-release-gate.test.ts` 与新增负向用例）、`verify-release-gate`、`typecheck`、`lint`、`build`；`expected=15` 相关断言保持。
- ac-no-public-release-write: 变更中不包含对已公开 Release 的写操作；`gh release edit/upload/delete` 只允许出现在 draft 或 finalize 的 publish 步骤，不得对 v0.2.17 或任何历史公开版本执行；不包含 `git tag` / `git push` / 对外评论。

## 非目标

- 不回写 v0.2.17：tag、Release、资产、历史 release notes 一律不动。
- 不修改 `expected=15`；不删除检查项；不吞失败；不把 fail 降级为 warn。
- 不推 tag、不 dispatch release 工作流、不发任何对外评论。
- 不改产品功能、UI、签名证书或 Secrets；不引入新的发布平台。
- 不把公开后的 public L1 当作唯一门，也不用它替代 publish 前的 15 项。

## 实现约束

- **选择 A（draft 模式）而非 B（矩阵本地 `--assets-dir`）**：A 直接验证即将公开的 draft 资产字节，完整保留既有 15 项注册表与 `expected=15`；B 需要跳过只对公开 metadata 的检查或伪造本地 metadata，必然导致检查项减少或失真，违反「15 项一项不能少」。A 的代价是 draft 读权限与按 asset id 的鉴权下载，用现有 `GITHUB_TOKEN` + `contents: write`（或等价 draft 读 token）即可解决。
- draft 模式的工作流只做 GET：`gh api` 读取 / 下载资产；禁止 `gh release edit/upload/create/delete`、`git tag` / `git push`、`continue-on-error`。`post-release-verify.yml` 的 `permissions` 需从 `contents: read` 调整为 draft 读所需的最小写权限，并在头部注释说明「写权限仅用于读取 draft 资产，工作流本身不写」。
- 资产下载必须 binary-safe，不能用 utf8 解码；下载后按元数据 `digest` 的 sha256 逐资产校验，缺失 digest 时 fail-closed，不得跳过。
- 不改 `scripts/verify-release.mjs` 的 15 项注册表、`expected=15`、`judgeReleaseGate` / `validateSummary` 的 fail-closed 语义；只新增 draft 传输与模式参数（如 `--draft` 或 `--release-state=draft`）。
- 负向用例必须落成可回归测试或脚本，不能只写在交付说明：Windows `UnknownError` 与 Linux 启动失败各一条；断言 summary fail 且 finalize 不 publish。优先放进现有 `src/verify-release-gate.test.ts` / `src/main/release-packaging.test.ts`，由现有 `test` / `verify-release-gate` 门禁覆盖；若新增独立脚本，则同步新增对应 code-gate。
- 小步提交：每完成一个可验证片段（脚本 draft 模式 / workflow 顺序 / 文档 / 测试）就落盘提交；上下文接近 150K 上限时，把进展写进分支与 prd 后再继续，不从头重读全仓。
- 文档口径统一为「publish 之前验证、失败保持 draft」；`docs/release-process.md` 的「唯一公开 Release」、`docs/release-signing.md` §3/§6/§7、`AGENTS.md` 的发布纪律与 `post-release-verify.yml` 头部注释必须与实现一致。
- 反范围见「非目标」；任何会改动已公开资产、历史 release notes 或 `expected=15` 的做法都视为越界。
