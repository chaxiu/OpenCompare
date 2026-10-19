# release-workflow

covers: ac-release-workflow
标题: release.yml 由 v* tag 触发，先跑门禁再跨平台构建并发布到 GitHub Release
步骤: 打开 `.github/workflows/release.yml`，核对触发条件、job 依赖顺序与打包矩阵
期望: `on.push.tags` 匹配 `v*`；存在门禁 job，依次执行 install（`--frozen-lockfile`）/ lint / typecheck / test / build；`gates` 末尾在矩阵启动前单点预建该 tag 的唯一 Release（`gh release create ... --draft --generate-notes`，不存在才建、有重复则清理只留一个）；打包 job 通过 `needs` 依赖门禁，以 macos-latest / windows-latest / ubuntu-latest 矩阵执行 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，随后 `gh release upload "${GITHUB_REF_NAME}" <三端产物> --clobber --repo` 汇聚上传；`finalize` 以 `gh release edit ... --repo ... --draft=false --latest` 公开

## 最近执行

- workItemId: wi_intake_37aa5843386424aa
- at: 2026-10-19
- status: pass
- note: .github/workflows/release.yml：on.push.tags 为 'v*'；gates job 依次 pnpm install --frozen-lockfile → lint → typecheck → test → build，末尾新增「Pre-create the tag's release」（GH_TOKEN/GH_REPO 注入，gh api 列同名 Release，无则 `gh release create "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --draft --generate-notes`，有则 DELETE 重复）；release job needs: gates，矩阵 macos-latest/windows-latest/ubuntu-latest 执行 `pnpm exec electron-builder --<target> --publish never` 本地打包到 release/，再以 `shell: bash` 执行 `gh release upload "${GITHUB_REF_NAME}" <dmg/zip/exe/AppImage/deb/blockmap/latest*.yml> --clobber --repo "${GITHUB_REPOSITORY}"`；finalize job 带 GH_REPO 并 `gh release edit "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`。
