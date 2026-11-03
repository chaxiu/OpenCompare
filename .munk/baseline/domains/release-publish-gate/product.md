# Domain: release-publish-gate

发布流水线的「先验证后公开」顺序契约：`.github/workflows/release.yml` 的 `finalize` 必须先完成三平台 15 项验证并拿到 aggregate `pass=15/15`，才允许执行唯一公开动作；公开之后只做轻量 public L1。本域管顺序、失败姿态、公开动作唯一性与公开后可得性；验证驱动本体（15 项注册表、判定函数、draft / published 传输）归 `domains/release-verify`，打包 / 签名 / 资产上传归 `domains/release`。

## 范围

- **`finalize` 五步顺序（步骤名即契约）**：`Resolve the tag's release state`（只读，确认该 tag 恰一个 Release 并读出 `draft` 状态，写 `${RUNNER_TEMP}/release-state.txt`）→ `Dispatch the post-release verification`（带 `-f mode="$(cat …release-state.txt)"`）→ `Find the post-release verification run for this tag`（`displayTitle` 含 tag + `createdAt >= since`）→ `Assert the post-release verification aggregate passed`（`aggregate=success` 且 aggregate artifact 存在）→ `Make the tag's release public`。
- **唯一公开动作**：`gh release edit "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest` 全仓只此一处，且只出现在 aggregate gate 之后；任何更早步骤失败都到不了它，Release 保持 `draft=true`。
- **失败可读性**：aggregate 非 `success` 时先 best-effort 下载 aggregate artifact，打印 `summary.json` 的 `status` / `problems` 与每个 `steps/*.json` 的 `id=status`，再 `::error::` 带 run id + `verify-out` 证据路径并非零退出；不以「未知错误」收尾。
- **publish 后的既有只读断言相对顺序不变**：双语 body → 链接绝对 → 唯一公开 Release → 资产齐备 → `latest*.yml` 命中 → latest 指针；它们整体位于 publish 之后。
- **public L1（末位）**：`releases/tags/{tag}` 断言 `draft=false`、`html_url` 非空、`assets[]` 非空且每项有 `browser_download_url`；对 `html_url` 与每个资产 URL 用 `curl -sSIL -o /dev/null -w '%{http_code}'` 断言 200；选「`size` 最小且 `digest` 非空」的资产下载后 `sha256sum` 与 digest 比对；缺 digest / 非 200 / sha 不符 `::error::` + 非零退出。L1 不替代、不放宽 publish 前的 15 项。
- **已公开 tag 的 dispatch 复跑**：`Resolve` 读到 `published` → dispatch `mode=published` 走公开复验；publish 步骤对已公开 Release 是幂等 no-op（不产生第二次公开事件、不改资产）。
- **文档口径四处一致**：`docs/release-process.md`（先验证后公开 + 公开后 L1）、`docs/release-signing.md`（发布姿态 / 唯一公开 Release 在 draft PASS 之后 / Windows `UnknownError` 在 draft 阶段即拦 publish）、`AGENTS.md` 硬约束、`post-release-verify.yml` 头注，均写死「publish 之前验证、失败保持 draft、不先公开再回滚」。

## 验收

- **ac-publish-after-aggregate**：`release.yml` 解析后 `stepIndex(publish) > stepIndex(aggregate) > stepIndex(dispatch) > stepIndex(resolve)`，且 public L1 是 `finalize` 最后一步。用假 `gh` 驱动 aggregate 返回 `failure` 时链在 publish 前非零退出、`gh-calls.log` 无 `release edit`；aggregate `success` 且 artifact 名命中时 publish 才执行，调用记录中 `edit` 行号大于 `run view` 与 `api …/artifacts` 行号，日志可读出「验证通过 → publish」。
- **ac-failure-keeps-draft**：draft 验证任一检查 fail 时 `finalize` 在 publish 前非零退出，Release 保持 `draft=true`（`gh-calls.log` 无 `edit`），失败输出含失败检查名、`verify-out` 证据路径与根因；不出现「先公开再回滚」。
- **ac-public-l1-after-publish**：publish 成功后 public L1 对公开 Release URL 与每个资产 URL 断言 200，并至少一个资产 sha256 与 Release 元数据 digest 一致；全 200 + digest 命中 exit 0，任一资产 404 / sha 不符 / 无可比 digest 时非零退出；该 L1 独立于 15 项，不替代、不放宽。
- **ac-docs**：四处文档与 workflow 头注的 markdown 片段含「publish 之前验证」「保持 draft」「不回滚」，并与实际步骤名 / 命令一致；`post-release-verify.yml` 头注说明验证对象是「同 tag 的 draft（publish 前）」或「已公开 Release（复验）」、`contents: write` 仅用于读 draft 资产。
- **ac-tests-green**：`.munk/code-gates.json` 全量通过，含 `pnpm test`（`src/main/release-packaging.test.ts` 的 finalize publish gate 5 例、`src/verify-release-gate.test.ts` 的 draft 传输 / 契约用例）、`verify-release-gate`、`typecheck`、`lint`、`build`；`expected=15` 断言保持。
- **ac-windows-unknown-error-fail / ac-linux-launch-fail**：负向可回归用例落成——Windows `UnknownError` / `HashMismatch` / 空值 / 非零 pwsh 退出使 `windows-authenticode` 与 summary fail（`NotSigned` / `Valid` 仍 pass）；Linux 启动失败或 page target 前退出使 `linux-directory-compare` / `cancel-leg` fail 且 step JSON / log 含 `reason` / `exitCode` / `signal` / `stdout` / `stderr` / `verify-out` 路径。判定表与断言归 `domains/release-verify`。
- **ac-no-public-release-write**：变更不含对已公开 Release 的写操作；`gh release edit/upload/delete` 只允许出现在 draft 或 `finalize` 的 publish 步骤，不得对 `v0.2.17` 或任何历史公开版本执行；不含 `git tag` / `git push` / 对外评论。

## 非目标

- 不改 15 项注册表、`expected=15`、`judgeReleaseGate` / `validateSummary` 语义与阈值；不删检查项、不把 fail 降级为 warn、不吞失败。
- 不回写 `v0.2.17` 或任何历史版本：tag、Release、资产、release notes 一律不动，不重打 tag。
- 不推 tag、不 dispatch 真实发布工作流、不发对外评论；真 draft run 由 Product Owner 在合入后发起。
- 不改产品功能 / UI / 签名证书 / Secrets；不引入新发布平台；不为 public L1 新开 workflow（它是 `finalize` 末位只读步骤）。

## 实现约束

- **顺序即契约**：`finalize` 的步骤名与相对顺序由 `src/main/__fixtures__/release-packaging.json` 与 `release-packaging.test.ts` 逐字钉住；调整顺序必须同批更新 fixture 与断言，不允许只改 YAML。
- **gate 判定单一来源**：aggregate 是否放行只看 run 的 `aggregate` job 结论与 artifact 名，不另写内联通过条件；`success` 分支保留 artifact 名 + run id 硬断言，非 `success` 一律非零退出。
- **publish 只此一处**：`--draft=false` 字面量全仓唯一落在 `Make the tag's release public`；新增任何公开入口视为越界。
- **链式 harness 可无网络回归**：测试从 YAML 取 `Resolve → Dispatch → Find → Aggregate → Publish` 五个 `run` 体写临时 `.sh`，`bash -e` 顺序执行，PATH 前置假 `gh` / `curl` 记录 `gh-calls.log`，`POST_RELEASE_LOOKUP_SECONDS` 等预算可覆盖，毫秒级零网络。
- **失败不隐藏**：不新增 `continue-on-error`；`finalize` 权限继续 `contents: write` + `actions: write`；L1 的 digest 选取（`size` 最小且 `digest` 非空）与 sha256 比对必须 fail-closed。
- **复跑语义**：`published` 分支的 publish 必须是幂等 no-op，文档写清避免「复跑会失败」的误判。

## 最近交付证明

- WI：`wi_intake_8e333edc1e4c0fb4`（**发布先验证后公开**：`finalize` 重排为 Resolve → Dispatch(mode) → Find → Aggregate gate → Publish，并在末位新增 public L1；`deliveryIntent: local merge`，`needSelfTest=false`）；日期：2026-11-03。
- 结果：`code_gates` passed（**26 gates**，attempt 001 全 exit 0，`.munk/runs/run_intake_8e333edc1e4c0fb4/code-gates/latest.json` `ok: true`、`failedGateIds: []`）；`test` 门 125 files / 1972 passed + 1 skipped；`.munk/baseline/test-debt.json` `growth` 45,384 → 45,623、`addedCases: 25`。
- 改动面：`release.yml` +301/−? （新增 `Resolve the tag's release state`、aggregate 失败证据段、`Run the public L1 checks after publishing`；publish 下移）；`release-packaging.test.ts` +120（publish 顺序 / 失败保 draft / L1 三态 / 无 digest fail-closed 5 例）；`post-release-verify.yml` mode 输入（传输面归 `release-verify`）；`docs/release-process.md` / `docs/release-signing.md` / `AGENTS.md` 口径同步。
- 注：本 WI change pack 无 `tests/cases/**`，本域无新增 QA case；真 draft run（三平台 15/15 + aggregate + publish + public L1）需合入 main 后由 Product Owner 触发取证，本项不声称发布验收已恢复。
