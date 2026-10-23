# Domain: i18n

renderer 双语（zh / en）底座：五个表面的成对词典、`I18nProvider` / `useI18n()` 语言上下文、首启语言解析的纯函数与只读 loader，以及两个测试辅助（`renderWithI18n`、中文硬编码扫描器）。本域只立「可被后续接线调用」的底座，不改任何业务视图文案；平台侧设置读写与系统语言通道（`readUserSettings` / `writeUserSettings` / `systemLocale`）归 `foundation` 域，本域只消费其契约。

## 范围

- **renderer 词典与 i18n 模块（`src/renderer/src/i18n/`）**：`messages/zh/{common,shell,directory,files,settings}.ts` 与 `messages/en/{…}.ts` **同名成对**；`messages/index.ts` 固定聚合五个表面，对外只暴露合并后的 `zh` / `en` 词典与 `messages: Record<Language, …>`。
- **zh 为键的单一事实源**：键用命名空间点号（`common.cancel`、`shell.empty.title`、`settings.language` 这类形状）；`en` 每个文件用 `Record<keyof typeof zh同类, string>` 声明，缺键 / 多键在 `pnpm typecheck` 报错。本项词典只放各表面的通用键（语言名 `English` / `简体中文`、公共确定 / 取消 / 关闭 / 错误外壳等），不搬业务文案。
- **`I18nProvider` + `useI18n()`**：值形状 `{ language, setLanguage, t }`；`t(key, params?)` 只支持 `{name}` 简单字符串插值（单一正则，缺失占位符原样保留，值里的标记按纯文本返回）；词典值只允许字符串，不接受 HTML / React 节点。
- **无 Provider 回落**：`useI18n()` 在 Provider 外不抛错，返回 `language: 'zh'` 与 zh 的 `t`，保证既有叶组件单测断言不变；生产入口的 Provider 挂载归「外壳接入」WI。
- **首启语言解析（纯函数 + 薄 loader）**：`resolveInitialLanguage({ storedLanguage, systemLocale })` 为纯函数——`storedLanguage` 为 `zh` / `en` 时以记录为准；无记录（`null` / `undefined` / 非法值 / 空串）时 `systemLocale` 以 `zh` 开头（大小写不敏感，覆盖 `zh`、`zh-CN`、`zh-Hant`、`ZH-cn`）→ `zh`，其余（`en-US`、`fr-FR`、`''`、未知）→ `en`。`loadInitialLanguage(platform)` 只调用 `platform.readUserSettings()` 与 `platform.systemLocale()` 后交给该纯函数，**从不写记录**（读失败按无记录处理，不抛）。
- **测试辅助（`testing.tsx`）**：`renderWithI18n(ui, language?)` 在 `I18nProvider` 下渲染，允许强制 `zh` / `en`，默认 `zh`。
- **中文硬编码扫描辅助（`src/shared/i18n/scanHardcodedChinese.ts`）**：接受显式路径清单（文件或目录，目录递归取源码文件），返回 `{ file, line, text }` 命中；`\p{Script=Han}` 直接匹配源码文本（注释、`aria-label`、`title`、`data-testid` 不豁免），支持排除 `*.test.*` 与 `i18n/messages/**`。本项只交付工具与其自身测试，不跑全仓扫描。

## 验收

- **ac-dict-pairs**：`messages/zh` 与 `messages/en` 的五个表面文件名一一对应，无单边文件。
- **ac-dict-keyset**：合并后的 zh 与 en 顶层键集合完全相等，无缺键、无多余键。
- **ac-dict-per-surface**：对每个表面分别比较，zh 与 en 的键集合相等（防止靠跨表撞键掩盖缺失）。
- **ac-dict-nonempty**：所有词典值 `trim()` 后非空，且不含 `TODO` / `未翻译` 占位串。
- **ac-dict-placeholders**：同一键在 zh 与 en 中的 `{placeholder}` 名称集合完全相同。
- **ac-dict-en-no-han**：en 词典所有值 `/\p{Script=Han}/u` 命中数为 0。
- **ac-dict-zh-keeps-text**：zh 词典每个值（除纯占位符值外）至少含一个汉字，防止把英文值抄进 zh。
- **ac-t-interpolate**：`t('…', { name: 'x' })` 替换全部同名占位符；缺失的占位符原样保留 `{name}`；含 `<b>` 的值按纯文本返回，不解析标记。
- **ac-t-provider-language**：Provider 初始 `language` 等于传入值；`setLanguage('en')` 后同一组件重渲染，`language` 与 `t` 返回值同步切到 en。
- **ac-t-no-provider-zh**：Provider 外调用 `useI18n()` 不抛错，`language` 为 `zh`，`t` 返回 zh 词条。
- **ac-render-helper**：`renderWithI18n(<Probe />, 'en')` 中 `useI18n().language` 为 `en`；不传第二参时为 `zh`。
- **ac-resolve-zh-locale**：无记录 + `zh` / `zh-CN` / `zh-Hant` / `ZH-cn` → `zh`。
- **ac-resolve-default-en**：无记录 + `en-US` / `fr-FR` / `''` / `undefined` → `en`。
- **ac-resolve-stored-wins**：记录 `zh` + 系统 `en-US` → `zh`；记录 `en` + 系统 `zh-CN` → `en`。
- **ac-resolve-invalid-stored**：记录为 `de` / `''` / 非字符串 → 按「无记录」处理，结果与系统语言矩阵一致。
- **ac-resolve-no-write**：`loadInitialLanguage(platform)` 只调用 `readUserSettings` 与 `systemLocale`，`writeUserSettings` 调用次数为 0；`readUserSettings` 拒绝时返回按系统语言判定的值且不抛。
- **ac-scan-han**：扫描辅助对含中文注释 / `aria-label` 的文件给出命中（行号与片段），对纯英文文件返回空；排除规则生效（`*.test.*`、`i18n/messages/**` 不计入）。
- **ac-no-business-text**：`src/renderer/src/workbench/**`、`src/renderer/src/views/**`、`src/renderer/src/components/**`、`App.tsx` 在本项无文案改写（现有 spec 断言不变，`pnpm test` 全绿）。
- **ac-gates-green**：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿，`code_gates.json` 不改。

## 非目标

- 不接业务视图文案：`Workbench.tsx`、`workbench/*.ts`、四个视图、`components/**`、`NewCompareDialog` 的文案一个都不改。
- 不做设置面板 / 齿轮入口 / 语言切换 UI（归「设置面板与即时切换」WI）。
- 不做 `App.tsx` 启动读取、无文字品牌引导、Provider 挂载与语言状态接线（归「外壳接入」WI）；本域只交付可被它调用的 `loadInitialLanguage` 与 `I18nProvider`。
- 不做会话标题 / 副标题 / 统计标签的渲染期化，不改 `FixtureSession` 语义与 fixtures 数据。
- 不跑全主链路中文扫描、不做双语冒烟（归收口 WI）；扫描辅助本项只自测。
- 不改 `src/core/**`、`src/main/**` 领域错误文案，不改 `src/shared/compareRequest.ts`；不改四态语义、差异色、布局与字号。
- 不引入 i18next / react-intl 等第三方框架，不新增运行时依赖、不新增专用 code gate。
- 不新建第二套存储：不写 electron-store、不加第二个 localStorage key、不新增配置文件（存储实现归 `foundation` 域）。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与发布证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`）。

## 实现约束

- 词典语言值类型 `Language = 'zh' | 'en'`（`src/shared/platform/types.ts`），默认 `en`；`UserSettings` 只含 `language` 一个字段（不保留 version 字段），读取时忽略未知字段、非法语言值视为 `null`。
- 五个表面固定为 `common` / `shell` / `directory` / `files` / `settings`；新增表面必须成对新增并进 `messages/index.ts` 固定聚合，禁止把新键散落到别人文件。
- 插值仅 `{name}` 形态，单一正则实现，不引入模板引擎；`t` 的键参数类型为合并后 zh 键的联合类型（`MessageKey`）。
- Web 设置单键固定为 `opencompare.userSettings`；内存回退是模块级变量，同一运行期同构读回；不写其它 key（实现归 `foundation` 域）。
- 新通道只加在 `src/shared/platform/channels.ts`；preload 只转发，renderer 不得 import electron（既有 `no-restricted-imports` 已覆盖）。
- 既有 `src/preload/index.test.ts` 的 surface 断言与 `src/main/platform/electron-platform.test.ts` 的电子模块 mock 需按新方法集更新；`app.getPath('userData')` 在测试中用临时目录注入，不依赖真实用户目录。
- renderer 侧 DOM / localStorage 测试用 `// @vitest-environment jsdom`；纯解析与词典测试保持 node 环境。
- 注释与代码风格沿用仓库现有英文注释；本项新增 i18n 模块自身源码不受「无中文」扫描约束，但业务源码零改动。

## 最近交付证明

- WI：`wi_ws_80cc30bb21c00dc3`（i18n 底座：词典、Provider、首启解析与设置通道，`kind: feature`）
- 日期：2026-10-23
- 结果：code_gates passed（`needSelfTest=false`，UI 自测跳过）。
- 覆盖摘要：新增 `src/renderer/src/i18n/`——`messages/zh|en/{common,shell,directory,files,settings}.ts`（en 用 `Record<keyof typeof zh同类, string>` 约束）、`messages/index.ts` 固定聚合五表面并导出 `zh` / `en` / `messages` / `MessageKey`、`context.ts`（`translate` + Provider 外 zh 回落）、`I18nProvider.tsx`、`interpolate.ts`（单正则 `{name}`，缺参原样保留）、`resolveLanguage.ts`（`resolveInitialLanguage` 纯函数 + 只读 `loadInitialLanguage`）、`testing.tsx`（`renderWithI18n`）；新增 `src/shared/i18n/scanHardcodedChinese.ts`（显式路径清单、递归源码、`*.test.*` 与 `i18n/messages/**` 排除）。平台侧折叠在 `domains/foundation`：`UserSettings` / `Language` 与三个 `PlatformPort` 方法、`src/shared/platform/settings.ts`（`parseUserSettings` / `parseUserSettingsJson` / `USER_SETTINGS_STORAGE_KEY`）、Electron 原子写与 Web localStorage/内存回退、preload 白名单转发。
- 注：本 WI change pack 仅提供 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域 `qa/` 无新增折叠用例，全局 tech / design 折叠仅补目录边界。后续注意：① 本项刻意未接任何业务文案与 Provider 挂载，下一项「外壳接入」必须在 `App.tsx` 挂 `I18nProvider` 并以 `loadInitialLanguage(platform)` 作初值，否则双语链路实际不生效；② 五表面拆分是硬约束，新增键必须落到对应表面并成对补齐，否则 typecheck 会红；③ `opencompare.userSettings` 是唯一 Web key，设置面板 WI 不得再开新键；④ 扫描器当前只自测，收口 WI 才跑全主链路，届时会大量命中现有中文文案，属预期。
