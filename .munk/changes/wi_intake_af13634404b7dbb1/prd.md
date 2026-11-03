# UI 第一期壳层与门面收口：重拍真实构建截图并补齐门面治理断言

## 范围

- **重拍两张 README 截图**：在当前 main 之上 `pnpm build`，再用既有脚本 `node scripts/capture-readme-screenshots.mjs` 以真实临时目录树与真实文件对重拍 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`。禁止内置样本、旧图、手绘或拼接图。
- **更新截图来源记录**：把 `docs/screenshots.md` 的 `Captured commit` 改为本次真实构建对应的、仓内可解析的 commit；保留 Reproduce 一行与脚本说明。
- **核对两版 README**：`README.md` 与 `README.zh-CN.md` 都引用这两张 PNG，路径一致；不改第 5 行版本行、不改图注语义。
- **补廉价确定性门面断言**：扩展现有 release / docs 治理测试（`src/main/release-artifacts-and-brand.test.ts` 及其 fixture），不得为验收点新开测试文件。断言只做三件事：两版 README 都引用两张 PNG、两个文件存在且非空、`docs/screenshots.md` 记录的 commit 在本地仓内可解析。禁止联网。
- **核对四处既有口径覆盖**：demo 入口、图标语义、主题三态、tab 三级截断 + tooltip。先审计现有套件是否覆盖，只补真实缺口；不重写已有套件、不减少用例数。
- **保持反范围**：不改对比 / 合并算法、四态语义、快照 / 导出格式、三向合并语义与发布通道；不动版本与发布单点文件与已公开资产。

## 验收

- ac-screenshots-regenerated：两张 PNG 均由 `node scripts/capture-readme-screenshots.mjs` 在本次 `pnpm build` 产物（`out/main` + `out/preload` + `out/renderer`）上重新生成；两张图与旧 commit `ef70939` 版本不同，均为合法 PNG（签名 `89 50 4E 47`）且字节数 > 0。
- ac-screenshots-current-shell：截图肉眼可确认是当前 shell——顶栏与工作流工具栏无 demo 入口，会话 tab 与工具栏归位；若发现 UI 与 `docs/screenshots.md` 描述不符，只记录并上报，不在本项改 UI。
- ac-screenshots-real-inputs：截图输入为脚本自建的真实 `/tmp` 目录树与真实文件对；脚本不读取 `src/shared/fixtures/**`，不使用旧图或内置样本。
- ac-screenshots-doc-commit：`docs/screenshots.md` 的 `Captured commit` 为 40 位十六进制 commit，等于本次构建实际所在的 commit，且 `git cat-file -e <sha>^{commit}` 在仓内成功；Reproduce 一行仍保留。
- ac-readme-both-images：`README.md` 与 `README.zh-CN.md` 各引用 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`，两版路径一致；两版第 5 行版本行与改动前逐字节相同。
- ac-gov-test-extended：上述三条门面断言落在既有 release / docs 治理测试文件内（优先 `src/main/release-artifacts-and-brand.test.ts`，必要时用其 fixture），不新增测试文件；至少覆盖「两版 README 引用」「文件存在且 size > 0」「commit 可由本地 git 解析」三点。
- ac-gov-offline：新增断言只用 `node:fs` 与本地 `git` 子进程（`spawnSync` / `execFileSync`），不发起 HTTP / fetch / 网络拉取；不依赖 CI 浅克隆之外的数据（发布门禁 `fetch-depth: 0` 已保证历史可见）。
- ac-coverage-audit-four：对四处口径给出逐条覆盖映射（文件 + 用例名）：(1) 顶栏与工作流工具栏 demo 入口为 0、设置内 5 类示例可达；(2) 图标全部 `currentColor`、图标按钮 `aria-label`、无 emoji / 文字充当图标；(3) 两套主题 token 同名 + WCAG 对比度 + 四态 ΔE + 亮/暗/跟随系统三态持久化；(4) tab 三级截断 + title tooltip 预算。已有覆盖不重写；只对真实缺口在既有文件内补断言，且测试用例总数不下降。
- ac-test-debt-green：`node scripts/test-debt-gate.mjs` 通过；因新增断言使 `repoTestLines` 超出现有 ceiling 时，按既有 ratchet 规则更新 `.munk/baseline/test-debt.json` 的 growth 条目（`from` 等于上一提交 ceiling、`to` 等于新 ceiling、写明 reason 与 `addedCases`，增量 ≤ 400 行），并只上调不下调 floor。
- ac-scope-frozen：相对 main，`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`.github/workflows/release.yml`、README 第 5 行、`src/core/**` 与 `src/main/**` 的算法 / IPC 语义零 diff；不新增 / 不改公开 tag、Release 或资产。
- ac-gates-green：`.munk/code-gates.json` 全量 gate 自绿（含 `install` / `build` / `test` / `test-debt-gate`），不得为凑绿放宽任何门禁。
- ac-delivery-receipt：交付回执写明本次构建 commit、两张 PNG 的字节数与像素尺寸、新增断言点清单，以及四处口径中「已有覆盖」与「本轮新增」的分项说明。

## 非目标

- 不改对比 / 合并算法、四态判定口径、快照 / 导出格式、三向合并语义与发布通道。
- 不动 `package.json#version`、`CHANGELOG.md`、release notes、README 第 5 行、`release.yml` 默认 tag 等单点文件。
- 不动任何已公开 tag / Release / 资产。
- 不改 UI 壳层、图标、主题实现；本项只产出证据与断言。截图若暴露真实 UI 缺陷，另开项修复。
- 不重写既有测试套件、不为单个验收点新开测试文件、不减少用例数。
- 不为凑绿放宽门禁或降低断言强度。

## 实现约束

- **构建基线**：Intake 时 main HEAD 为 `dc781cd1d5ac922927a3c59bb9f86ebe68f072a0`。Coding 若在更新的 main 上开工，以实际构建所在 commit 记录，且必须能在仓内解析。
- **执行顺序**：`pnpm install`（当前 worktree 尚无 `node_modules`）→ `pnpm build` → `node scripts/capture-readme-screenshots.mjs`。脚本需要 Electron GUI 与 DevTools 端口；Node < 22 时脚本会自行用 Electron 内置 Node 重跑。
- **只改这三类文件**：两张 `docs/assets/*.png`、`docs/screenshots.md`；README 仅在引用缺失时修正（当前两版引用已齐全，预期零 diff）；既有治理测试 + 其 fixture + `.munk/baseline/test-debt.json`（仅 ratchet 需要的字段）。
- **已有治理测试位置**：`src/main/release-artifacts-and-brand.test.ts` 的 table-driven docs 断言 + `src/main/__fixtures__/release-artifacts-and-brand.json`；其 `parseMarkdown` 已能解析 `![alt](path)` 中的 link target。commit 解析用 `repoRoot` + `spawnSync('git', ['cat-file', '-e', ...])`。
- **test-debt 约束**：`repoTestLines` 当前实测 = ceiling = 46215，新增测试行必须走 growth 条目；`repoTestCases` floor 当前 1528，新增用例后只上调。测试文件内不得出现当前版本号字面量、64 位小写 hex sha256 字面量，也不得对 docs 做整句字符串断言。
- **四处口径的现有锚点**（审计起点，不预判必须新增）：
  - demo 入口 / 5 类示例：`src/renderer/src/App.test.tsx`（顶栏无 demo、工作流工具栏无 demo 快捷入口）、`src/renderer/src/views/DirectoryView.test.tsx`、`src/renderer/src/App.settings.test.tsx`（5 条 `data-sample-entry`）。
  - 图标：`src/renderer/src/components/Icon.test.tsx`、`src/renderer/src/assets/icons/icons.test.ts`（`currentColor` / 无 emoji）、`src/renderer/src/workbench/shellLayout.dom.test.tsx`（按钮 `aria-label`）。
  - 主题：`src/core/theme/contrast.test.ts`（WCAG + ΔE）、`src/renderer/src/theme/themeSources.test.ts`（唯一 token 源）、`src/renderer/src/App.theme.test.tsx`（三态切换与持久化）。
  - tab：`src/renderer/src/components/SessionTabs.test.tsx`、`src/renderer/src/workbench/sessionTabText.test.ts`（三级预算 / tail clip）。
- **单条交付 commit**：截图、文档与断言同批提交；交付时工作区干净。
