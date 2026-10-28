# diff-ruler-scale-timeout-diff-scope

covers: ac-single-file-diff
标题: 交付提交的变更面恰为 `DiffRuler.scale.test.tsx` 一个文件，不夹带配置 / 产品代码 / 版本收敛文件
步骤: 自动化：在本工作项提交后执行 `git diff --name-only <base>..HEAD`（或 `git show --name-only HEAD`）逐行核对 → 确认 `vitest.config.mts`、`package.json`、`DiffRuler.tsx`、`CodeView.tsx`、`src/core/**`、`TreeView.test.tsx`、`CHANGELOG.md`、`docs/**`、`.github/workflows/release.yml` 均不在名单内 → 确认主工作区暂存的 60 项回退改动未被带入
期望: 变更路径列表恰为 `src/renderer/src/components/DiffRuler.scale.test.tsx` 一项；`vitest.config.mts`、`package.json`（含 `version`）、产品代码（`DiffRuler.tsx` / `CodeView.tsx` / `src/core/**`）、其它测试文件（含 `TreeView.test.tsx` 既有 30s 用法）零 diff；版本收敛相关文件（`CHANGELOG.md`、`docs/release-notes/**`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`）零 diff；未继承主工作区的暂存回退改动

## 最近执行

- workItemId: wi_ws_b21636d826817b53
- at: 2026-10-29
- status: pass
- note: `git diff --stat HEAD`（改动前基线）实测为 `src/renderer/src/components/DiffRuler.scale.test.tsx | 7 ++++++-` / `1 file changed, 6 insertions(+), 1 deletion(-)`，即 +6/−1 单文件；`vitest.config.mts` / `package.json` / 产品代码 / 其它测试 / 版本收敛文件均无改动。
