# html lang 跟随界面语言（随 v0.2.7 发版）

## 范围

- 现状：`src/renderer/index.html` 第 2 行写死 `<html lang="zh-CN">`；界面语言由 `src/renderer/src/i18n/resolveLanguage.ts` 解析、`I18nProvider` 持有（`language` / `setLanguage`）。
- 让 `document.documentElement.lang` 跟随当前界面语言：`zh` → `zh-CN`，`en` → `en`。
- 首帧（拿到解析后的初始语言、首次渲染完成时）就是正确值；设置内 `setLanguage` 切换时同步更新。
- `src/renderer/index.html` 去掉写死中文的静态兜底，改为与产品英文默认一致的确定值（或由启动时写入），不得再留 `zh-CN` 静态声明。
- 测试（必须进 `pnpm test`，至少两条）：默认英文启动时 `document.documentElement.lang === 'en'`；切到中文后为 `'zh-CN'`，再切回英文为 `'en'`。复用既有 `renderWithI18n`（`src/renderer/src/i18n/testing.tsx`）与 `App.i18n.test.tsx` 的 `installPlatform` / `withLocale` / `setRecord` 等渲染工具，不新建测试基建。
- `docs/release-notes/v0.2.7.md` 的「## 本次变化」用户可见变化段按现有 `- **标题**：说明` 格式补一行：html lang 跟随界面语言（英文 `en` / 中文 `zh-CN`），修正英文界面下读屏与翻译工具的语言标记错误。该项与本行必须落在同一 merge 里。

## 验收

- ac-default-en-lang: 默认英文启动（无持久化语言、系统语言非 `zh*`）渲染完成后，`document.documentElement.lang` 为 `'en'`。
- ac-switch-zh-lang: 从上状态切到中文后 `document.documentElement.lang` 为 `'zh-CN'`。
- ac-switch-back-en-lang: 再切回英文后 `document.documentElement.lang` 回到 `'en'`。
- ac-shared-provider-sync: 通过 `renderWithI18n(ui, 'en')` / `renderWithI18n(ui, 'zh')` 挂载时，`document.documentElement.lang` 分别同步为 `'en'` / `'zh-CN'`（即同步逻辑在 `I18nProvider` 共享路径上，而非仅 App 特例）。
- ac-index-no-zh-lang: `src/renderer/index.html` 的 `<html>` 不再声明 `zh-CN`，其静态 `lang` 为与英文默认一致的确定值（`en`）且非空。
- ac-release-note-line: `docs/release-notes/v0.2.7.md` 的用户可见变化段新增且仅新增一行，含 `html lang`、`en`、`zh-CN`、读屏、翻译工具 语义；文件首标题仍为 v0.2.7，其余既有段落与行保持不变。
- ac-gates-green: 全量 `code_gates`（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全绿；release 域对 v0.2.7 release notes 的断言按新增一行后的真实内容保持通过，不放宽断言。

## 非目标

- 不改 `CHANGELOG.md`、`README.md`、`README.zh-CN.md`。
- 不动 `package.json` / `.github/workflows/release.yml` / `docs/release-process.md` / `docs/release-signing.md`；不修改 `src/main/release-packaging.test.ts` 中的 `latestPublishedTag`（v0.2.7 收尾项独占）。
- 不改语言解析规则、`Language` 类型、i18n 字典、设置面板文案或任何视觉样式。
- 不新增语言、不做 RTL、不做 `<html dir>`、不改 `<title>` / meta。
- 不新建测试基建或新测试目录。

## 实现约束

- 语言由 `I18nProvider` 统一持有；`document.documentElement.lang` 的同步应挂在该共享路径上，使 App 与 `renderWithI18n` 都自然生效，避免多处重复写入。
- 只在 DOM 存在时写入（Node 环境/无 DOM 时不抛错），与服务端或单测非 jsdom 场景兼容。
- `zh` → `zh-CN`、`en` → `en` 的映射必须集中一处定义，禁止在组件里散落三元字面量。
- `index.html` 静态兜底取 `en`（产品英文默认）；不得再出现 `zh-CN`，也不得出现其他中文文案。
- release notes 只加一行，措辞固定为「html lang 跟随界面语言（英文 en / 中文 zh-CN），修正英文界面下读屏与翻译工具的语言标记错误」，段落归属「## 本次变化」下的「### 桌面端 UI 中英双语」。
- 发布节奏：本项需在今日 07:00 发版 tag 之前合入 main 并随 v0.2.7 一起发；不合入则不发。
