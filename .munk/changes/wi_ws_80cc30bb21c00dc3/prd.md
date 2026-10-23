# i18n 底座：词典、首启解析与设置持久化通道

本项是「桌面端 UI 双语化」的第一个 WI：只立底座（词典 + Provider + 首启解析 + 设置通道 + 测试辅助），不接任何业务视图文案。主链在本项交付后保持现有中文行为不变。

## 范围

1. **renderer 词典与 i18n 模块**（新增 `src/renderer/src/i18n/`）
   - `messages/zh/{common,shell,directory,files,settings}.ts` 与 `messages/en/{...}.ts` **同名成对**；`messages/index.ts` 固定聚合五个表面，对外只暴露合并后的 zh / en 词典对象。
   - `zh` 为键的单一事实源，键用命名空间点号（`shell.empty.title`、`settings.language` 这类形状）；`en` 每个文件用 `Record<keyof typeof zh同类, string>` 声明，缺键/多键在 `pnpm typecheck` 报错。
   - `I18nProvider` + `useI18n()`：`{ language, setLanguage, t }`；`t(key, params?)` 只支持 `{name}` 简单字符串插值；词典值只允许字符串，不接受 HTML / React 节点。
   - 无 Provider 时 `useI18n()` 回落到 zh 词典（不抛错），保证既有叶组件单测断言不变；生产入口的 Provider 挂载归「外壳接入」WI。
   - 本项词典只放各表面的**通用键**（语言名 `English` / `简体中文`、公共确定/取消/关闭/错误外壳等），不搬业务文案。

2. **首启语言解析（纯函数 + 薄 loader）**
   - `resolveInitialLanguage({ storedLanguage, systemLocale })`：`storedLanguage` 为 `zh`/`en` 时以记录为准；无记录（`null`/`undefined`/非法值/空串）时 `systemLocale` 以 `zh` 开头（大小写不敏感，覆盖 `zh`、`zh-CN`、`zh-Hant`、`ZH-cn`）→ `zh`，其余（`en-US`、`fr-FR`、`''`、未知）→ `en`。
   - `loadInitialLanguage(platform)`：只调用 `platform.readUserSettings()` 与 `platform.systemLocale()` 后交给上面的纯函数，**从不写记录**（读失败按无记录处理，不抛）。

3. **PlatformPort 唯一设置通道**
   - `src/shared/platform/types.ts` 增加 `UserSettings` 与三个方法：`readUserSettings(): Promise<UserSettings | null>`、`writeUserSettings(settings: UserSettings): Promise<void>`、`systemLocale(): Promise<string>`；通道名只加在 `src/shared/platform/channels.ts`。
   - **Electron**（`src/main/platform/electron-platform.ts` + `src/main/index.ts` 注册）：`systemLocale()` 返回 `app.getLocale()`；设置写入 `app.getPath('userData')` 下单个 JSON 文件，目录缺失先创建，原子写（同目录临时文件 + rename），读取时文件缺失 / 损坏 JSON / 非对象 / 非法语言值一律解析为 `null`。
   - **preload**（`src/preload/index.ts`）：只做白名单 `ipcRenderer.invoke` 转发，新增三个方法；既有「bridge surface 键集合」测试同步更新。
   - **Web**（`src/renderer/src/platform/web-platform.ts`）：`localStorage` 单键读写（固定 key），`localStorage` 不可用/抛错时退化为模块级内存（同运行期读回）；`systemLocale()` 取 `navigator.language`（缺失为 `''`）。

4. **测试辅助**
   - `renderWithI18n(ui, language?)`：在 `I18nProvider` 下渲染，允许强制 `zh` / `en`；默认 `zh`。
   - 「中文硬编码」扫描辅助：接受显式路径清单，返回命中文件/行号/片段；`\p{Script=Han}` 直接匹配源码文本（注释、`aria-label`、`title`、`data-testid` 不豁免），支持排除 `*.test.*` 与 `i18n/messages/**`。本项只交付工具与其自身测试，不跑全仓扫描。

## 验收

- ac-dict-pairs: `messages/zh` 与 `messages/en` 的五个表面文件名一一对应，无单边文件。
- ac-dict-keyset: 合并后的 zh 与 en 顶层键集合完全相等，无缺键、无多余键。
- ac-dict-per-surface: 对每个表面分别比较，zh 与 en 的键集合相等（防止靠跨表撞键掩盖缺失）。
- ac-dict-nonempty: 所有词典值 `trim()` 后非空，且不含 `TODO` / `未翻译` 占位串。
- ac-dict-placeholders: 同一键在 zh 与 en 中的 `{placeholder}` 名称集合完全相同。
- ac-dict-en-no-han: en 词典所有值 `/\p{Script=Han}/u` 命中数为 0。
- ac-dict-zh-keeps-text: zh 词典每个值（除纯占位符值外）至少含一个汉字，防止把英文值抄进 zh。
- ac-t-interpolate: `t('...', { name: 'x' })` 替换全部同名占位符；缺失的占位符原样保留 `{name}`；含 `<b>` 的值按纯文本返回，不解析标记。
- ac-t-provider-language: Provider 初始 `language` 等于传入值；`setLanguage('en')` 后同一组件重渲染，`language` 与 `t` 返回值同步切到 en。
- ac-t-no-provider-zh: Provider 外调用 `useI18n()` 不抛错，`language` 为 `zh`，`t` 返回 zh 词条。
- ac-render-helper: `renderWithI18n(<Probe />, 'en')` 中 `useI18n().language` 为 `en`；不传第二参时为 `zh`。
- ac-resolve-zh-locale: 无记录 + `zh` / `zh-CN` / `zh-Hant` / `ZH-cn` → `zh`。
- ac-resolve-default-en: 无记录 + `en-US` / `fr-FR` / `''` / `undefined` → `en`。
- ac-resolve-stored-wins: 记录 `zh` + 系统 `en-US` → `zh`；记录 `en` + 系统 `zh-CN` → `en`。
- ac-resolve-invalid-stored: 记录为 `de` / `''` / 非字符串 → 按「无记录」处理，结果与系统语言矩阵一致。
- ac-resolve-no-write: `loadInitialLanguage(platform)` 只调用 `readUserSettings` 与 `systemLocale`，`writeUserSettings` 调用次数为 0；`readUserSettings` 拒绝时返回按系统语言判定的值且不抛。
- ac-port-surface: `PlatformPort` 暴露三个新方法；preload 桥接以 `PLATFORM_CHANNELS` 对应通道名调用 `ipcRenderer.invoke`（逐通道断言），既有 bridge surface 测试更新为新方法集合。
- ac-electron-roundtrip: 经真实 `ipcMain.handle` 注册后，`writeUserSettings({ language: 'en' })` 再调用读取（新的一次读取/新注册实例，临时 userData 目录）得到 `{ language: 'en' }`；写入产生且仅产生 userData 下单个 JSON 设置文件。
- ac-electron-corrupt: 设置文件为 `{not json`、`null`、`"text"`、`{"language":"de"}`、`{"language":3}` 时 `readUserSettings()` 返回 `null`，不抛。
- ac-electron-locale: `systemLocale()` 原样返回 `app.getLocale()`（mock 为 `zh-Hant-TW` 时不改写、不截断）。
- ac-web-localstorage: jsdom localStorage 可用时写入后由**另一个** port 实例读回同一 settings；写入只新增一个 OpenCompare 设置键，不产生其它 key。
- ac-web-invalid-json: localStorage 中该键为非法 JSON 或非法语言值时读取返回 `null`，不抛。
- ac-web-memory-fallback: `localStorage` 读写抛错时，同一 port 实例写入后读回同一 settings，且 `systemLocale()` 返回 `navigator.language`（缺省 `''`）。
- ac-scan-han: 扫描辅助对含中文注释/`aria-label` 的文件给出命中（行号与片段），对纯英文文件返回空；排除规则生效（`*.test.*`、`i18n/messages/**` 不计入）。
- ac-no-business-text: `src/renderer/src/workbench/**`、`src/renderer/src/views/**`、`src/renderer/src/components/**`、`App.tsx` 在本项无文案改写（现有 spec 断言不变，`pnpm test` 全绿）。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿，`code_gates.json` 不改。

## 非目标

- 不接业务视图文案：`Workbench.tsx`、`workbench/*.ts`、四个视图、`components/**`、`NewCompareDialog` 的文案一个都不改。
- 不做设置面板 / 齿轮入口 / 语言切换 UI（归「设置面板与即时切换」WI）。
- 不做 `App.tsx` 启动读取、无文字品牌引导、Provider 挂载与语言状态接线（归「外壳接入」WI）；本项只交付可被它调用的 `loadInitialLanguage` 与 Provider。
- 不做会话标题/副标题/统计标签的渲染期化，不改 `FixtureSession` 语义与 fixtures 数据。
- 不跑全主链路中文扫描、不做双语冒烟（归收口 WI）；扫描辅助本项只自测。
- 不改 `src/core/**`、`src/main/**` 领域错误文案，不改 `src/shared/compareRequest.ts`；不改四态语义、差异色、布局与字号。
- 不引入 i18next / react-intl 等第三方框架，不新增运行时依赖、不新增专用 code gate。
- 不新建第二套存储：不写 electron-store、不加第二个 localStorage key、不新增配置文件。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与发布证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`）。

## 实现约束

- 词典语言值类型 `Language = 'zh' | 'en'`，默认 `en`；`UserSettings` 只含 `language` 一个字段（不保留 version 字段），读取时忽略未知字段、非法语言值视为 `null`。
- 五个表面固定为 `common` / `shell` / `directory` / `files` / `settings`；新增表面必须成对新增并进 `messages/index.ts` 固定聚合，禁止把新键散落到别人文件。
- 插值仅 `{name}` 形态，单一正则实现，不引入模板引擎；`t` 的键参数类型为合并后 zh 键的联合类型。
- Electron 原子写：临时文件与目标同目录、写后 rename 覆盖；读取路径绝不因设置文件问题 reject（启动不能失败）；`writeUserSettings` 失败只 reject 本次写入。
- Web 设置单键固定为 `opencompare.userSettings`；内存回退是模块级变量，同一运行期同构读回；不写其它 key。
- 新通道只加在 `src/shared/platform/channels.ts`；preload 只转发，renderer 不得 import electron（既有 `no-restricted-imports` 已覆盖）。
- 既有 `src/preload/index.test.ts` 的 surface 断言与 `src/main/platform/electron-platform.test.ts` 的电子模块 mock 需按新方法集更新；`app.getPath('userData')` 在测试中用临时目录注入，不依赖真实用户目录。
- renderer 侧 DOM / localStorage 测试用 `// @vitest-environment jsdom`；纯解析与词典测试保持 node 环境。
- 注释与代码风格沿用仓库现有英文注释；本项新增 i18n 模块自身源码不受「无中文」扫描约束，但业务源码零改动。
