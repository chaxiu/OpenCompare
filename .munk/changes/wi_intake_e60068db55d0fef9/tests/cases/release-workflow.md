# release-workflow

covers: ac-release-workflow
标题: release.yml 由 v* tag 触发，先跑门禁再跨平台构建并发布到 GitHub Release
步骤: 打开 `.github/workflows/release.yml`，核对触发条件、job 依赖顺序与打包矩阵
期望: `on.push.tags` 匹配 `v*`；存在门禁 job，依次执行 install（`--frozen-lockfile`）/ lint / typecheck / test / build；打包 job 通过 `needs` 依赖门禁，以 macos-latest / windows-latest / ubuntu-latest 矩阵执行 `electron-builder --<target> --publish always`，将跨平台产物发布到对应 tag 的 GitHub Release

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: .github/workflows/release.yml：on.push.tags 为 'v*'；gates job 依次 pnpm install --frozen-lockfile → lint → typecheck → test → build；release job 通过 needs: gates 依赖，矩阵 macos-latest/windows-latest/ubuntu-latest（target mac/win/linux）执行 `pnpm exec electron-builder --<target> --publish always`（GH_TOKEN 注入），权限 contents: write 发布到对应 tag 的 GitHub Release。
