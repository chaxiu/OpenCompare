# release-selfcheck-gh-api-jq

covers: ac-no-slurp-with-jq, ac-release-count-gate-legal, ac-assets-gate-legal, ac-empty-count-fails, ac-empty-release-id-fails, ac-empty-assets-fails, ac-test-spec-updated, ac-readme-line5, ac-readme-test-matches
标题: 发布后自检的 `gh api` 分页聚合改用 `| jq -s`（禁止 `--slurp` 与 `--jq` 同用），空值计数显式非零退出，README 与测试口径同步为已发布态
步骤: 打开 `.github/workflows/release.yml` 的 `finalize` job，核对 "Verify the tag has exactly one public release" 与 "Assert the public release has every platform asset" 两个步骤的完整 `run` 脚本；对照 `src/main/release-packaging.test.ts` 的 `single public release gate` / `gh api option compatibility` / README 状态断言；跑 `pnpm test` 与 code_gates
期望: ① workflow 中不存在任何一条 `gh api` 命令同时带 `--slurp` 与 `--jq` / `--template`（gh 2.x 会报 `the --slurp option is not supported with --jq or --template`）；② 计数步骤为 `gh api "repos/${GITHUB_REPOSITORY}/releases" --paginate | jq -s "[${tag_filter}] | length"` 等三条，程序含 `.[][]`、`select(.draft)`、`select(.prerelease)`，并保留 `[ "${count}" -ne 1 ]`、`[ "${drafts}" -ne 0 ]`、`[ "${prereleases}" -ne 0 ]`；③ 资产步骤取 release id 与资产名分别为 `gh api ... --paginate | jq -s -r`（含 `.[0].id // empty` 与 `.[][] | .name`），保留 release_id / assets 空值的 `::error::` + `exit 1`，以及 `.dmg` / `.zip` / `.exe` / `.AppImage` / `.deb` / `latest-mac.yml` / `latest.yml` / `latest-linux.yml` 后缀与 `has_asset`、版本名一致性断言；④ 计数变量任一为空或不匹配 `^[0-9]+$` 时步骤 `::error::Could not count the releases` 并 `exit 1`（不依赖 `[ "" -ne 1 ]` 的 status 2）；⑤ 测试中不再含 `--paginate --slurp` 字面量断言，改为断言 `--paginate | jq -s`、`jq -s -r` 与空值校验，并有全文件扫描组保证 `--slurp` 不与 `--jq` / `--template` 同现；⑥ `README.md` 第 5 行为已发布态：含 `v0.2.1 已发布` 与 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.1`，且不含 `待发布` / `最新公开 Release 为 v0.1.2`；⑦ `pnpm lint` / `typecheck` / `build` / `test` 退出码 0

## 最近执行

- workItemId: wi_intake_7774770085728eac
- at: 2026-10-20
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 code_gates 为交付门槛（install / lint / typecheck / build / build:web / test 全绿，attempt 001，396 tests / 26 files）。静态核对：workflow 两处 step 已从 `--paginate --slurp --jq` 改为 `--paginate | jq -s`（id / 资产名用 `-r`），计数新增 `for value in "${count}" "${drafts}" "${prereleases}"` + `^[0-9]+$` 守卫并 `exit 1`；`release-packaging.test.ts` 去掉了 `--paginate --slurp` 断言，新增 `gh api option compatibility` 全文件扫描与计数空值失败断言；README 第 5 行已是「v0.2.1 已发布 + releases/tag/v0.2.1」且测试同步（旧「待发布 / v0.1.2」断言反转为 `not.toContain` / `not.toMatch`）。本机 `gh 2.97.0` 已复现 `--slurp` 与 `--jq` 互斥报错。未在真实 CI 上重跑 `workflow_dispatch`，finalize 变绿待人工推 main 后确认。
