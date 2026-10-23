# 精简 README（双版镜像）并把已发布事实搬到 docs

## 范围

只做 README 精简与文档搬家，不动产品行为。把当前中文 14 个 H2、英文约 1572 词（按「实现约束」的词数口径，去除代码块 / 链接 URL / 行内代码 / HTML 后统计）压到英文正文 ≤700 词、每版 9 个 H2，两版章节一一对应。

### 目标结构（EN / ZH 一一对应，顺序固定）

1. 首屏：`# OpenCompare` + 第 3 行语言互链 + 第 5 行单行版本状态 + 一句话定位 + 仅 release / license 两枚徽章 + 一张真实运行态截图。
2. `## Download and install` / `## 下载与安装`：macOS / Windows / Linux 各一行 + Releases 页链接。
3. `## Features` / `## 核心能力`：5 条用户语言能力，不写版本历史。
4. `## Quickstart` / `## 快速上手`：打开两个路径 → 四态 → 下钻 → 同步。
5. `## Requirements and development` / `## 环境要求与开发`：环境要求 + dev + 门禁合并。
6. `## Project structure` / `## 项目结构`：保留现有 5 行。
7. `## Known issues` / `## 已知问题`：只写当前未修；没有就 `None known right now.` / `当前没有已知未修复问题。` 并链 Issues。
8. `## Evidence and docs` / `## 证据与文档`：一行文档索引。
9. `## Kill Paid Apps 001` / `## Kill Paid Apps 001 平替` + `## License` / `## 许可`。

### 必须搬家、不能删除

| 现 README 内容 | 新落点 |
| --- | --- |
| L98–105 发布流程（tag 触发、门禁、三平台构建、`latest*.yml`、签名校验、唯一公开 Release） | 新建 `docs/release-process.md`；README 只留一行链接 |
| 签名 / 凭据 / env 名 / team id / 本机路径 | 已在 `docs/release-signing.md`；README 只留一行链接，正文 0 命中 |
| L51–60 Memory profile 四组数字 | 已在 `docs/perf/upsert-memory-diagnosis-2026-10-23.md`、`docs/perf/large-directory-memory.md`；README 只留一行 Performance & memory evidence 链接 |
| L58 打包 app L3 首跑组（`1.9–2.0 GiB` / `1.6–1.9 GiB` / `2.15–2.5 GiB`、`1.3M`、3 会话；原始证据归档在仓库外） | docs 内没有这组字面量且本项不改 `docs/perf/**`：在 `docs/release-process.md` 新增「Release-time performance evidence」小节原样承接，标注原始证据归档在仓库外、不重新采样 |
| L117–124 六条已修问题史 | 各自 `docs/release-notes/v0.2.6.md`（Windows 四入口）、`v0.2.4.md`（悬空链接）、`v0.2.5.md`（不跟随 / 内存 / ECANCELED）、`v0.2.2.md`（EMFILE）、`docs/symlink-no-follow.md`（no-follow 口径） |
| Releases 表（含 v0.2.3 未发布史、v0.2.5/v0.2.4/v0.2.2 行） | 压成第 5 行一行版本 + Releases 页链接；v0.2.3 事实已在 `CHANGELOG.md` 与 `docs/release-notes/v0.2.4.md` |
| L5 整段 CI 凭据说明 | 首屏只写「最新公开版本 + 已用 Developer ID 签名 / Apple 公证」一句 |

### 版本口径

不写死 `v0.2.7`，不声明 0.2.7 已发布或待发布。每版 README 只有第 5 行承载版本：`Latest public release: v<package.json#version> (...) → [Releases](.../releases/tag/v<version>)`（中文镜像同构），将来只改这一行。下载区只用 `/releases` 页和 `.dmg` / `.exe` / `.AppImage` / `.deb` 等不带版本号的产物名。

## 验收

- ac-en-structure: `README.md` 恰好 9 个 `## ` 标题，且按序等于 `Download and install`、`Features`、`Quickstart`、`Requirements and development`、`Project structure`、`Known issues`、`Evidence and docs`、`Kill Paid Apps 001`、`License`；无其它 `## `。
- ac-zh-structure: `README.zh-CN.md` 恰好 9 个 `## ` 标题，且按序等于 `下载与安装`、`核心能力`、`快速上手`、`环境要求与开发`、`项目结构`、`已知问题`、`证据与文档`、`Kill Paid Apps 001 平替`、`许可`。
- ac-word-budget: 按「实现约束」词数口径，`README.md` 正文 ≤700 词；两版均无 TODO / TBD / FIXME / 待补 / roadmap。
- ac-line3-crosslink: 两版第 3 行分别为 `English | [简体中文](./README.zh-CN.md)` 与 `[English](./README.md) | 简体中文`，前 10 行内互链成立，目标文件存在且非空。
- ac-line5-single-version: 两版第 5 行含 `v${pkg.version}` 与 `Developer ID` / `Developer ID` 及 `notariz` / `公证` 字样；每版 `releases/tag/` 链接恰好 1 处，位于第 5 行且指向 `v${pkg.version}`；全文中除第 5 行外无 `\bv\d+\.\d+\.\d+\b` 字面量，不出现 `v0.2.7`。
- ac-no-han-en: 英文版除第 3 行语言互链外，`\p{Script=Han}` 0 命中。
- ac-badges: 两版前 12 行内恰好 2 个 `img.shields.io` 徽章，一个含 `github/v/release`，一个含 `license-MIT`；0 个 CI / Actions / branch 徽章。
- ac-screenshot: `docs/assets/opencompare-workbench.png` 存在、PNG 签名有效、宽度 ≥1000 且高度 ≥600、文件 >10 KB；两版正文以 `docs/assets/opencompare-workbench.png` 引用同一张图；`.gitignore` 不匹配该路径。
- ac-download: 两版下载区各有 macOS `.dmg` + `Applications`、Windows `.exe`、Linux `chmod +x` + `.AppImage` + `.deb` 三行，且含 `/releases` 页链接；不写版本化资产文件名。
- ac-features-five: 两版能力区恰好 5 条 `- ` 顶层条目，且不出现 `Fixed in` / `已修复` / `v0.2.` 版本历史。
- ac-quickstart: 两版都有快速上手，含「打开两个路径」与「same / added / removed / modified」（中文「相同 / 新增 / 删除 / 修改」）、下钻（drill / 下钻）、同步（sync / 同步）四项。
- ac-requirements-dev: 两版都含 `Node.js >= 20.19`、`pnpm 10`、`pnpm install`、`pnpm dev`、`pnpm dev:web`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm build:web`。
- ac-project-structure: 两版项目结构代码块都含 `src/main/`、`src/preload/`、`src/core/`、`src/renderer/`、`src/shared/` 五行。
- ac-known-issues: 英文 `## Known issues` 含 `None known right now.` 与 `https://github.com/chaxiu/OpenCompare/issues`；中文含 `当前没有已知未修复问题。` 与 Issues 链接；两版该节 `Fixed in` / `已修复` / `v0.2.` / `ECANCELED` / `EMFILE` / `1,960,394,752` 均 0 命中。
- ac-evidence-line: 两版 `Evidence and docs` / `证据与文档` 各一行，含 `docs/release-process.md`、`docs/release-signing.md`、`docs/symlink-no-follow.md`、`docs/perf/large-directory-memory.md`；Performance & memory evidence 行链接 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 与 `docs/perf/large-directory-memory.md`。
- ac-no-memory-numbers: 两版正文 `MiB` / `GiB` 0 命中，且不再出现 `76,604`、`11,105,870,346`、`21.6`、`22.5`、`8.5`、`10.0`、`1.68`、`1.81`、`1.24`、`1.9–2.0`、`1.6–1.9`、`2.15–2.5`；也不出现 `archived evidence` / `not a memory target` 之类内部评审语气。
- ac-no-secrets: 两版与 `docs/release-process.md` 对 `CSC_`、`APPLE_`、`3X4J53U6RY`、`Tao Zhu`、`/Users/` 均 0 命中；`docs/release-signing.md` 的凭据清单保持不变。
- ac-release-process-doc: `docs/release-process.md` 非空，含 `.github/workflows/release.yml`、`workflow_dispatch`、`v*` tag、`install → lint → typecheck → test → build`、`v0.1.2` 祖先门、`latest*.yml`、`release:metadata`、`codesign --verify --deep --strict`、`xcrun stapler validate`、`spctl -a -vv`、唯一公开 Release，以及 `default` 默认 `v${pkg.version}`；README 两版只以一行链接该文档，不再复述流程。
- ac-l3-evidence-landed: `docs/release-process.md` 的 Release-time performance evidence 小节含 `1.9–2.0 GiB`、`1.6–1.9 GiB`、`2.15–2.5 GiB`、`1.3M`、`3` 会话与「原始证据归档在仓库外 / archived outside the repository」说明，且未新增任何性能采样结论。
- ac-deleted-numbers-landed: 交付说明给出每个被删数字的 grep 证据：`76,604`、`11,105,870,346`、`21.6`、`22.5`、`694`、`706`、`8.5`、`10.0`、`1.68`、`1.81`、`1.28`、`+20 s` 在 `docs/perf/**` 可查；L3 组在 `docs/release-process.md` 可查。唯一例外：现 README 的 `1.24` 与 `docs/perf` 的 `1.25–1.28` 不一致，以 docs 为准并在交付说明记录该舍入差异，不新增旧字面量。
- ac-fixed-issues-landed: 六条已修内容分别存在于 `docs/release-notes/v0.2.6.md`、`v0.2.5.md`、`v0.2.4.md`、`v0.2.2.md` 与 `docs/symlink-no-follow.md`，原有 release notes / changelog / 签名文档断言保持全绿。
- ac-test-rewrite: `src/main/release-packaging.test.ts` 中与旧版版本表 / L5 长状态块 / README 已知问题史 / README 发布流程 / README 内存数字冲突的断言改成上述新结构与 `pkg.version` 派生一致性断言；第 3 行互链、英文禁汉字、Kill Paid Apps、TODO 扫描、release notes / release evidence / signing / workflow 断言保留；新增断言不引入 `0.2.6` / `v0.2.6` 内联字面量。
- ac-scope: `git diff --name-only` 仅含 `README.md`、`README.zh-CN.md`、`docs/release-process.md`、`docs/assets/opencompare-workbench.png`、`src/main/release-packaging.test.ts` 与 `.munk/changes/**`；`package.json#version` 不变。
- ac-gates: 本工作树 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 全绿。

## 非目标

- 不并入 i18n WorkSet，不改它的反范围，不做任何多语言化。
- 不改 `src/**` 业务代码、i18n 文案、`CHANGELOG.md`、`.github/workflows/release.yml`、`electron-builder.yml`、`docs/release-signing.md`、`docs/perf/**`、release notes。
- 不打 tag、不发版、不 bump 版本、不改 `package.json#version`、不改 Release、不 push。
- 不跑性能 / 内存采样，不重测 L3，不新增性能门禁。
- 不新增依赖、不新增可执行脚本文件、不重构页面、不做视觉改版（截图只截真实运行态）。
- 不新增 CI 徽章（本账号 Actions 有欠费史，首屏只放 release 与 license）。

## 实现约束

- 允许写：`README.md`、`README.zh-CN.md`、新建 `docs/release-process.md`、`docs/assets/` 下一张新截图、`src/main/release-packaging.test.ts`。其它文件一律只读。
- 英文词数口径（测试与交付说明共用）：去掉 ``` 围栏代码块、把 Markdown 链接/图片替换为链接文本、去掉 `http(s)://…`、去掉行内代码、去掉 HTML 标签后，用 `/[A-Za-z][A-Za-z0-9'’-]*/g` 计数。当前基线 1572 词，交付说明给出新旧词数对比。
- 首屏 5 行结构固定：第 1 行 `# OpenCompare`、第 2 行空、第 3 行语言互链、第 4 行空、第 5 行单行版本状态；徽章与截图放第 6 行之后。
- 截图必须来自真实运行态：用 `pnpm build` 产物或打包 app 启动后经 CDP 截真实窗口；不拼图、不用设计稿或内置样本截图冒充；交付说明写明图片路径、窗口尺寸与可复现的截取命令（命令可用一次性 `node -e` / curl，不落脚本文件）。
- `docs/release-process.md` 只搬家不复写：内容取自现 README L98–105 与 `docs/release-signing.md` 链接，不新增未经验证的发布承诺；默认 tag 用 `v${pkg.version}` 表述。
- 已修问题史只保留在 release notes / changelog，README 不再复述；Known issues 没有当前未修项时用固定句 + Issues 链接。
- 交付说明必须含：两版新旧词数对比、EN↔ZH 章节对照表、截图路径与截取方式、每块搬家内容的 docs 落点、被删数字的 grep 证明（含 `1.24 → 1.25` 例外）、secret / team id / 本机路径 grep 0 命中、`git diff --name-only` 清单。
