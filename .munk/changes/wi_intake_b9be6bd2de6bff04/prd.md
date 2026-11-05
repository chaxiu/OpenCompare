# 双语拆分 README 截图资产与语言固定采集

## 范围

- **资产按语言拆两套**（`docs/assets/`）：
  - 英文：`opencompare-workbench.en.png`、`opencompare-file-diff.en.png`
  - 中文：`opencompare-workbench.zh.png`、`opencompare-file-diff.zh.png`
  - 删除旧的单语 `opencompare-workbench.png` / `opencompare-file-diff.png`，不得保留同一套图被两种语言共用的路径。
- **README 图片行按语言收口**：`README.md` 第 11/13 行只引用两张 `.en.png`、alt 为英文；`README.zh-CN.md` 第 11/13 行只引用两张 `.zh.png`、alt 为中文。其余正文不动：第 3 行互链、第 5 行「已发布版本指针」、9 个 `##` 二级标题（en / zh 一一对应）、英文正文 ≤700 词。
- **截图脚本显式固定语言**：`scripts/capture-readme-screenshots.mjs` 不再由宿主环境推导语言；每条采集前把语言写入该次临时 `HOME` 下的持久化 `settings.json`（`{ "language": "en" | "zh" }`，主题沿用默认 dark），并用 `<html lang>` 断言语言确实生效（`en` / `zh-CN`），不匹配即失败。一条命令 `pnpm screenshots`（= `electron-vite build && node scripts/capture-readme-screenshots.mjs`）在一次运行内产出四张图，可重复跑出同样结果。
- **provenance 按语言登记**：`docs/screenshots.md` 重写为 en / zh 两节，各自记录资产、语言注入方式（settings.json 路径 / 键 / 值）、字节数与 sha256；全篇只保留一条 `- commit:` 行作为两种语言共用的 captured commit，并保留「干净树 + `pnpm build`」措辞与复现命令；补记四张图逐张视觉复核结论。
- **守卫测试改为按语言校验**：`src/main/release-artifacts-and-brand.test.ts` 的 `readme screenshots and capture provenance` 与 fixture `src/main/__fixtures__/release-artifacts-and-brand.json#screenshots` 改为按语言登记，断言英文 README 只引英文资产、中文 README 只引中文资产、四张图存在且被跟踪、记录 sha256 与真实文件一致、四张图共用同一 captured commit 且该 commit 到 HEAD 的 `src/renderer` 零 diff、同场景两种语言 PNG 字节不同。

## 验收

- ac-readme-en-assets-only: `README.md` 的图片目标集合恰为 `docs/assets/opencompare-workbench.en.png` 与 `docs/assets/opencompare-file-diff.en.png`；不出现 `.zh.png`，也不再出现旧的无语言后缀资产；两张图的 alt 不含中日韩字符。
- ac-readme-zh-assets-only: `README.zh-CN.md` 的图片目标集合恰为两张 `.zh.png`；不出现 `.en.png` 与旧的单语资产；两张图的 alt 为中文且含中文字符。
- ac-readme-mirror-intact: 两份 README 第 3 行互链互相指向对方；`## ` 二级标题各 9 个且顺序语义一一对应；第 5 行（`Latest public release` / `最新公开版本` 指针）与改动前逐字节相同；`README.md` 正文英文词数 ≤700；除第 11/13 两行图片行外两份 README 正文无其他 diff。
- ac-capture-one-command: 在干净树当前 commit 上先 `pnpm build` 再 `pnpm screenshots`，一次运行写出四张 PNG（贴命令、退出码与产出文件清单 + 字节数），无需人工分次运行或事后改名。
- ac-capture-language-injected: 脚本对每种语言显式写入临时 `HOME` 下 `opencompare/settings.json` 的 `language` 字段，并以 `document.documentElement.lang`（`en` / `zh-CN`）作为 ready 条件；宿主 `LANG` / `LC_ALL` / 系统 locale 不参与语言选择。证据：以 `LANG=zh_CN.UTF-8` 与 `LANG=en_US.UTF-8` 各跑一次，四张图 sha256 分别一致。
- ac-capture-deterministic: 同一构建连续运行两次 `node scripts/capture-readme-screenshots.mjs`，四张图 sha256 逐张相同；四张图均为 2560×1584、PNG 签名有效、>10 KB。
- ac-capture-real-session: 四张图都来自 `out/main` + `out/renderer` 当次构建、`/tmp` 下真实临时目录树（左右两棵含真实源码/配置文件）与真实 `src/session.ts` 文件对；脚本不 import / 不读取 `src/shared/fixtures/**`；不提交旧图、合成图、占位图或带人工标注的图。
- ac-provenance-per-language: `docs/screenshots.md` 含 en 与 zh 两节，每节列出本语言两张资产、语言注入方式（settings.json 路径、键、值）、字节数与 sha256；全篇仅一条 `- commit: \`<40 hex>\``，两种语言共用该 commit。
- ac-provenance-sha-matches: 记录中四张图的 sha256 与磁盘真实文件 `shasum -a 256` 逐一相等（贴校验输出），字节数也一致。
- ac-guard-per-language: 守卫测试对「英文 README 引中文资产」「中文 README 引英文资产」「某语言缺图」均失败；对现有四张图与两份 README 通过。
- ac-guard-single-capture-commit: 守卫断言四张图 provenance commit 完全一致、该 commit 可被 `git cat-file -e` 解析且是 `HEAD` 祖先；`git diff --quiet <commit>..HEAD -- src/renderer` 为零；并断言同场景 `.en.png` 与 `.zh.png` 字节不同（防止把一套图复制成两套）。任一语言单独重拍导致 commit 不一致、或渲染层变更后只重拍一套而记录未整体重钉时，守卫失败。
- ac-visual-review: 四张图逐张人工复核并在 `docs/screenshots.md` 记结论：英文图 UI 文案全英文、中文图 UI 文案全中文；字号与既有基线一致；窗口内容未被裁切（右侧 `data-diff-ruler` 指示条与底部状态栏完整）；差异高亮（same/added/removed/modified）可辨。
- ac-scope-diff: `git diff --name-status <基线..HEAD>` 只含：4 张新增 PNG、2 张删除的旧 PNG、`README.md`、`README.zh-CN.md`、`docs/screenshots.md`、`scripts/capture-readme-screenshots.mjs`、`src/main/release-artifacts-and-brand.test.ts`、`src/main/__fixtures__/release-artifacts-and-brand.json`、`.munk/changes/**`（如门禁簿记确需，可含 `.munk/baseline/test-debt.json` 的 growth 登记）；对 `src/renderer`、`src/core`、`src/shared`、`src/preload`、`src/main`（上述测试与 fixture 除外）、`package.json`、`CHANGELOG*`、`docs/release-notes*`、`docs/release-evidence/**`、`.github/**` 零 diff（贴 `git diff --stat`）。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test` 全绿；`node scripts/test-debt-gate.mjs` 通过（需先 `pnpm install` 收集用例）；`munk/code-gates.json` 不新增条目。

## 非目标

- 不改渲染代码、组件逻辑、样式 / 主题 token、i18n 文案资源、字体与布局；不为截图给主进程 / 渲染进程加命令行开关、环境变量分支或新 IPC 通道。
- 不动语义单点文件：`package.json#version`、`CHANGELOG.md`、两份 README 第 5 行版本指针与版本表、`docs/release-notes/**`、`docs/release-evidence/**`；不重打 / 不移动 `v0.2.21` tag，不改任何 workflow。
- 不做 README 正文改写、章节增删、措辞润色；只改第 11/13 行图片引用与 alt。
- 不新增依赖、不引入 OCR / 图像比对工具、不加水印 / 箭头 / 编号等人工标注；两张场景的构图、临时目录树内容与 ready 条件保持现有口径。
- 不改 `docs/ui-visual-direction.md`、v1 视觉基线脚本 `scripts/capture-visual-baseline.mjs` 与其它截图资产。

## 实现约束

- 现状锚点（改动起点，main `9f59ffa`）：
  - `scripts/capture-readme-screenshots.mjs`：L51-L52 资产名常量；L291-L301 `runApp`（已设 `HOME: home`，未写 settings）；L315-L332 `capture`；L334-L374 `main`（L343-L349 临时树，L352-L368 两次采集）。
  - 语言持久化链路：`src/main/platform/electron-platform.ts` L805-L840（`app.getPath('userData')` + `settings.json`）；`src/shared/platform/settings.ts`（`parseUserSettings` 只认 `language: 'zh' | 'en'`，缺 `theme` 默认 `dark`）；`src/renderer/src/i18n/resolveLanguage.ts`（持久化值优先于 `systemLocale`）；`src/renderer/src/i18n/htmlLang.ts`（`en` → `en`，`zh` → `zh-CN`）。
  - 守卫落点：`src/main/release-artifacts-and-brand.test.ts` L223-L271（4 个 `it`）；fixture `src/main/__fixtures__/release-artifacts-and-brand.json` L670 起的 `screenshots` 段（`readmes` / `assets` / `commitPattern` / `rendererDir` / `cleanTreeTokens` / `rerunHint`）。
  - 当前 README 词数 554、H2 各 9 节、`docs/assets` 仅两张旧图、`.gitignore` 不匹配 `docs/assets/**`。
- 语言注入走既有持久化设置，不新增通道：spawn 前写 `<userData>/settings.json`（`{"language":"en"}` / `{"language":"zh"}`）。因脚本已把 `HOME` 指向临时目录，路径为 macOS `<HOME>/Library/Application Support/opencompare/settings.json`、Linux `${XDG_CONFIG_HOME:-$HOME/.config}/opencompare/settings.json`；应用名取 `package.json#name`（`opencompare`）。无法确定 `userData` 的平台直接失败（fail-closed），不退回系统语言。
- 采集次序：每种语言两次 launch（目录对比、文件 diff），四次 launch 复用同一临时树与同一份 `src/session.ts` 内容；ready 条件在现有选择器基础上追加 `document.documentElement.lang === '<expected>'`，并在截图前再确认一次语言未变。
- 图像口径保持不变：2560×1584（DPR 2 @ 1280×792 逻辑视口）、默认 dark 主题、同一 ready 选择器与 600ms settle，保证两套图像只差语言。
- `docs/screenshots.md` 的 `- commit:` 行格式保持不变（守卫正则 `- commit: \`([0-9a-f]{40})\``），并保留 `clean working tree`、`pnpm build` 与 `node scripts/capture-readme-screenshots.mjs` 标记；captured commit 取采集时 HEAD，且必须在干净树（仅本项允许的改动之外无未提交改动）上先 build 后采集。
- test-debt 余量提醒：`.munk/baseline/test-debt.json` 的 `repoTestLines` 当前实测 = ceiling `50019`，零余量。优先在既有 4 个 `it` 内按语言改造并压缩行数；若净增测试行，按既有 growth 登记机制更新 `.munk/baseline/test-debt.json`（属门禁簿记，非功能改动），并在交付回执单列该文件。
- 视觉复核必须逐张看实际 PNG（不看文件大小代替）；发现问题就重拍，不得机械重跑脚本交差。
