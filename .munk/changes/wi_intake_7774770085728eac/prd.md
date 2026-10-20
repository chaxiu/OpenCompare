# 修复 release 发布自检的非法 gh 组合（--slurp + --jq）

## 背景（已核实）

- v0.2.1 已公开发布（唯一正式 Release，11 个资产，mac 签名 + 公证 + Gatekeeper 全过）。
- CI Run 39358768053 的 finalize 失败在发布后自检脚本本身，而非发布产物。
- 硬证据：本机 `gh 2.97.0` 对 `gh api ... --paginate --slurp --jq '...'` 直接报
  `the --slurp option is not supported with --jq or --template`。
  `--slurp` 只在「不使用 --jq/--template」时合法，需要 jq 时正确写法是
  `gh api ... --paginate | jq -s '...'`（`-s` 把多页文档 slurp 成 `[[...],[...]]`，故保留 `.[][]` 语义）。
- `.github/workflows/release.yml` 有 5 处该非法组合（L594/595/596/611/616）。
- `src/main/release-packaging.test.ts` 把该非法写法当规格断言（约 L1217/L1226：`--paginate --slurp`）。
- README 第 5 行已是「v0.2.1 已发布 + Release 链接」（commit b00728a），但同一测试文件
  （约 L735-736）仍断言「`${currentTag} 待发布`」「最新公开 Release 为 v0.1.2」，因此在当前 HEAD 上测试与文档互相矛盾。

## 范围

1. 改写 `release.yml` 中 5 处发布后自检命令为合法形式：`gh api <endpoint> --paginate | jq -s '<program>'`
   （获取 release id / 资产名需要原始字符串时用 `jq -s -r`），保持既有的 `.[][]` 分页语义、
   tag 过滤、draft/prerelease 计数与 `-ne 1` 断言、`has_asset` + 7 类后缀 + 版本名断言不变。
2. 为两道断言补「静默通过」防线：计数/资产变量为空或非纯整数时（API 失败、jq 无输出、网络错误）
   步骤必须以非零码退出，不能因为 `[ "" -ne 1 ]` 的 status 2 被 `if` 当作 false 而误通过。
3. 同步修正 `src/main/release-packaging.test.ts`：
   - 不再断言 `--paginate --slurp`，改为断言 `--paginate` 经管道交给 `jq -s`（含 `.[][]`、`select(.draft)`、`select(.prerelease)`、`-ne 1`、资产后缀与 `has_asset`）；
   - 新增一条全文件回归断言：workflow 中任意 `gh api` 命令不得同时出现 `--slurp` 与 `--jq`/`--template`；
   - 新增/保留「计数值必须显式校验」的断言（空值/非整数 → 非零退出）；
   - 更新 README 相关断言为已发布态（`v0.2.1 已发布` + `releases/tag/v0.2.1`，且不再出现 `待发布` / `最新公开 Release 为 v0.1.2`）。
4. 核对 README 第 5 行即为已发布态与 Release 链接（已由 b00728a 落地，无需重复改写；只允许必要的措辞/链接微调）。
5. 本地质量门禁全绿：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test`。

## 验收

- ac-no-slurp-with-jq: `.github/workflows/release.yml` 中不存在任何一条 `gh api` 命令同时带 `--slurp` 与 `--jq`/`--template`；`release-packaging.test.ts` 有覆盖全文件的正则/扫描断言，一旦重新引入即测试失败。
- ac-release-count-gate-legal: "Verify the tag has exactly one public release" 步骤用 `gh api "repos/${GITHUB_REPOSITORY}/releases" --paginate` 管道到 `jq -s`，程序仍含 `.[][]`、`select(.draft)`、`select(.prerelease)`，并保留 `[ "${count}" -ne 1 ]` 等三项判定。
- ac-assets-gate-legal: "Assert the public release has every platform asset" 步骤中取 release id 与取资产名两条 `gh api` 均为 `--paginate | jq -s`（取原始名称时 `-r`），仍保留 `.dmg/.zip/.exe/.AppImage/.deb/latest-mac.yml/latest.yml/latest-linux.yml` 后缀清单、`has_asset` 与版本名不一致报错。
- ac-empty-count-fails: 当 count/drafts/prereleases 变量为空或不匹配 `^[0-9]+$` 时，该步骤执行 `exit 1` 并打印 `::error::`；对应断言在测试中存在。
- ac-empty-release-id-fails: release_id 为空时步骤 `exit 1` 并打印 `::error::`（保留既有行为）。
- ac-empty-assets-fails: assets 为空时步骤 `exit 1` 并打印 `::error::`（保留既有行为）。
- ac-test-spec-updated: `release-packaging.test.ts` 中不含 `--paginate --slurp` 字面量断言；单测文件名/描述与新写法一致（`jq -s`）。
- ac-readme-line5: README 第 5 行包含 `v0.2.1 已发布` 与 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.1`，且不再包含 `待发布` 与 `最新公开 Release 为 v0.1.2`。
- ac-readme-test-matches: 测试对 README 发布状态的断言与第 5 行一致（含上述 URL），且 `pnpm test` 中该断言通过。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全部退出码 0。

## 非目标

- 不改打包目标、electron-builder 配置、签名/公证配置、Secrets 清单或发布模型（tag → Release）。
- 不重指、删除或新建任何 tag（含 v0.2.0 / v0.2.1）；不 push、不 dispatch、不建/改 Release。
- 不改 `latest*.yml` 的 exe 命名（另议）。
- 不做实机验收、不跑 self_test / 不点选 UI。
- 不重构 CI 其他 job（gates/build/upload）与无关测试；不顺手加 lint 规则或抽象脚本模块。
- 不修改 v0.1.2 drift 记录与历史发布说明。

## 实现约束

- 只改 `.github/workflows/release.yml`、`src/main/release-packaging.test.ts`、必要时 README 第 5 行；其余文件不动。
- 采用最小 diff：把 `--slurp --jq "<prog>"` 换成 `| jq -s "<prog>"`（需原始名/ id 时 `-r`），不重写整段脚本。
- 保持 GitHub Actions 默认 shell 语义（`bash -e`）：断言失败必须落到显式 `exit 1`，不依赖管道退出码。
- 测试只做静态文本/结构断言，不引入网络调用或对真实 GitHub API 的依赖。
- 交付后由负责人推 main 并用 `workflow_dispatch(tag=v0.2.1)` 幂等重跑拿绿色 finalize，本 WI 不碰远端。
