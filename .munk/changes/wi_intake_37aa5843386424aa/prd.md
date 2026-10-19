# 修复 Release CI 并发建单竞态与 finalize Job 缺 repo 报错

## 范围

修复 GitHub Actions Release 工作流（Run #39183565396）暴露的两处缺陷：

1. **矩阵并发建单竞态**（`.github/workflows/release.yml`）
   - 三个平台矩阵各自执行 `electron-builder --publish always`，并发调用 GitHub Release API，为同一 Tag 竞态创建出 3 个同名 Release，资产被拆散到不同 Release。
   - 修复方向（用户已钉死）：
     - 在 `gates` Job 末尾（矩阵启动前）增加**单点预建步骤**，注入 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 与 `GH_REPO: ${{ github.repository }}`；若当前 Tag 的 Release 不存在则 `gh release create "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --title "${GITHUB_REF_NAME}" --draft --generate-notes` 预创建唯一草稿 Release；若发现同名重复 Release，清理多余项只保留一个。
     - `release` 矩阵各平台改为 `pnpm exec electron-builder --${{ matrix.target }} --publish never`（仅本地打包到 `release/`，禁止 electron-builder 并发建单）。
     - 随后用 `gh release upload "${GITHUB_REF_NAME}" <release/ 下三端全部安装包与元数据> --clobber --repo "${GITHUB_REPOSITORY}"` 将三端资产汇聚上传到该唯一 Release（`shopt -s nullglob` 或按实际存在的产物上传，须能覆盖 dmg/zip/exe/AppImage/deb/blockmap/latest*.yml）。
2. **finalize Job 报错 `fatal: not a git repository`**
   - `finalize` Job 未 checkout 且未传 `--repo`；补充 `GH_REPO: ${{ github.repository }}` 并在命令中显式带上 `--repo "${GITHUB_REPOSITORY}"`：`gh release edit "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest`，将汇聚完三端全部资产的唯一 Release 正式公开。

3. **同步更新 workflow 断言单测** `src/main/release-packaging.test.ts`，覆盖：预建唯一 Release、`--publish never` + `gh release upload --clobber`、`finalize` 携带 `--repo` 公开 Release。

## 验收

- ac-single-precreate: `gates` Job 在矩阵启动前存在单点预建唯一 Release 的步骤，带 `GH_TOKEN` 与 `GH_REPO`，使用 `gh release create ... --draft --generate-notes`（不存在时才创建；存在重复同名 Release 时清理多余、只留一个）。
- ac-no-concurrent-publish: `release` 矩阵中 `electron-builder` 参数为 `--publish never`，不再有 `--publish always`；打包产物仅落到本地 `release/`。
- ac-upload-clobber: `release` 矩阵在打包后有 `gh release upload "${GITHUB_REF_NAME}" ... --clobber --repo "${GITHUB_REPOSITORY}"` 步骤，汇聚上传三端安装包与元数据（dmg/zip/exe/AppImage/deb/blockmap/latest*.yml），且能在 windows runner 的默认 shell 下正常运行。
- ac-finalize-repo: `finalize` Job 的 `gh release edit` 命令带 `--repo "${GITHUB_REPOSITORY}"`，并注入 `GH_REPO`，`--draft=false --latest` 保持；不存在 `fatal: not a git repository` 的前置依赖。
- ac-unit-assertions: `src/main/release-packaging.test.ts` 断言覆盖预建唯一 Release、`--publish never` + `gh release upload --clobber`、`finalize` 带 `--repo`；旧断言若与新流程冲突已随之更新。
- ac-gates-green: `code_gates` 6 项（install / lint / typecheck / build / build-web / test）全绿。

## 非目标

- 不改 electron-builder 打包目标、appId、签名/公证策略（仍不做签名）。
- 不改触发条件（仍为 `v*` Tag push）与 `permissions`。
- 不做版本号自增、不改 `package.json` version。
- 不新增 CI Job、不引入新的 Action / 第三方发布工具。
- 不改动 `src/main/`、`src/core/`、renderer 等与发布无关的业务代码，仅动 workflow 与该 workflow 断言单测。

## 实现约束

- 预建唯一 Release 放在 `gates` Job 末尾、`release` 矩阵之前；预建步骤与 upload / finalize 统一使用 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 与 `GH_REPO: ${{ github.repository }}`，命令显式带 `--repo "${GITHUB_REPOSITORY}"`（不依赖隐式 git 仓库上下文，规避 `not a git repository`）。
- 汇聚上传步骤须兼容 windows-latest 默认 shell（pwsh）；使用 `shopt -s nullglob` 时须设 `shell: bash`，或用 gh 自带 glob 展开。
- Release 唯一性以 Tag（`GITHUB_REF_NAME`）为准；重复同名 Release 清理只保留一个。
- `--clobber` 允许重复上传覆盖，保证可重跑。
- 仅编辑 `.munk/changes/**` 之外的以下文件：`.github/workflows/release.yml`、`src/main/release-packaging.test.ts`。
