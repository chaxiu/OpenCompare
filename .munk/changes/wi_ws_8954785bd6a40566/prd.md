# 设置面板与语言即时切换

本项是「桌面端 UI 双语化」的第三个 WI。前序已交付词典 / Provider / 首启解析 / 设置通道（`i18n-core`）以及工作台外壳与新建对比的双语化（`shell-copy`，Provider 已挂载、启动语言已解析）。本项只做两件事：**补上设置面板这个语言切换宿主**，以及**让切换只换文案、不丢状态、即时整窗生效并持久化**。目录视图与文件级视图的文案仍归后续 WI。

## 范围

1. **顶栏设置入口（`src/renderer/src/workbench/Workbench.tsx`）**
   - 顶栏右侧动作区新增一个常驻图标按钮（`Settings` 齿轮），可访问名 / `title` 取既有 `shell.settings.open`（`打开设置` / `Open settings`），键盘可聚焦，**任何 workbench 状态（空态、已打开会话、目录扫描进行中）都不禁用**。
   - 点击打开设置面板；面板是模态对话框，`Esc` 或关闭按钮可关闭，关闭后可再次打开。

2. **设置面板（新增 `src/renderer/src/workbench/SettingsDialog.tsx`）**
   - 复用既有 `Dialog`（标题 `settings.title`、头部关闭按钮 `common.close`）与 `SegmentedControl`，不新增模态原语、不做第二套表单样式。
   - 只有一个分区：可见标签与分组可访问名都用既有 `settings.language`（`语言` / `Language`）。
   - 两个语言选项，顺序固定 `English`、`简体中文`；**语言名是自指标签，不随界面语言翻译**——标签取自目标语言自己词典的 `settings.language.name`（zh 词典给 `简体中文`、en 词典给 `English`），因此组件内不出现任何中文字面量。
   - 当前语言的选项为选中态（`aria-selected="true"`），另一个为 false。

3. **语言切换时序与持久化**
   - 点击选项：先同步调用 `useI18n().setLanguage(language)`（同一渲染批次整窗换文案），**再**异步 `platform.writeUserSettings({ language })`；写盘绝不阻塞 UI，写盘期间面板不关闭、不显示 loading 文案。
   - 写盘串行：连续切换时按选择顺序逐次写，最后一次选择必然最后落盘（最终读回等于最后一次选择）。
   - 写盘失败**不回滚**已生效的语言，也不重新读取记录；只在面板内以 `role="alert"` 显示 `settings.saveError`（`设置保存失败：{reason}` / `Could not save settings: {reason}`），`reason` 用原始错误 message 原样插入；下一次成功写盘清除该提示，关闭面板再打开也不残留。
   - 语言状态唯一来源仍是 `I18nProvider`：不新增 Provider / context / 语言 state，不重载窗口，不把语言值用作 `Workbench` / 视图 / 对话框的 React `key`。

4. **已打开表面的即时换文案**
   - 本项范围内，切换后立即换语言的是：顶栏副标题与工具按钮、视图切换四标签、会话标签条可访问名与未保存提示、状态栏、空态/载入/错误态、设置面板自身，以及**已经显示中的工作台通知条**。
   - 通知条改为「渲染期解析」：状态里保存 `{ key, params }` 而非已翻译字符串，渲染时 `t(key, params)`；由非本地化模块（`snapshotOps` / `loadSampleSessions` / `src/core` / 主进程）产出的原始错误 message 仍作为纯文本 detail 原样展示（已知边界，不翻译）。

5. **测试**
   - 新增设置面板与切换行为测试（打开/关闭、选项与选中态、即时切换、写盘顺序与失败、重启读回、系统语言不改写、切换不重扫/不丢状态、通知条随语言重译）。
   - 新增本项「中文硬编码」扫描断言，显式清单包含 `SettingsDialog.tsx`、`Workbench.tsx` 与新增的 i18n helper，命中 0；注释不豁免。
   - 既有测试不改变断言语义（新增入口按钮不改变原有按名查询结果）；门禁全绿。

## 验收

- ac-settings-entry: 空态、已打开会话、目录扫描进行中三种情况下，顶栏都有可访问名 `打开设置`（zh）/ `Open settings`（en）且未禁用的按钮；点击后出现可访问名 `设置` / `Settings` 的 `role="dialog"`；`Esc` 关闭后按钮仍在且可再次打开。
- ac-settings-options: 面板内恰好两个语言选项，顺序为 `English`、`简体中文`；在 zh 与 en 两种界面下这两个选项的可访问名完全相同；语言分组可访问名为 `语言` / `Language`；当前语言选项 `aria-selected="true"`、另一个为 `false`。
- ac-settings-copy: zh 界面面板显示标题 `设置`、分区标签 `语言`、关闭按钮可访问名 `关闭`；en 界面为 `Settings` / `Language` / `Close`，且 en 面板可见文本在剔除 `简体中文` 这一自指标签后 `\p{Script=Han}` 计数为 0。
- ac-switch-instant: en 界面打开面板点 `简体中文`（不等写盘 settle），顶栏副标题、视图切换四标签、会话标签条可访问名、状态栏标签、面板标题与分区标签在同一次点击后全部为中文，且无空文本/占位；再点 `English` 同样立即全部回英文。
- ac-switch-before-write: `writeUserSettings` 返回永不 settle 的 promise 时，点击语言整窗已切到目标语言，`writeUserSettings` 恰被调用一次且参数为 `{ language: 目标 }`，`readUserSettings` 调用次数不增加。
- ac-write-order-last-wins: 连续切换 `简体中文` → `English`，`writeUserSettings` 收到参数序列 `['zh','en']`，第二次调用只在第一次 promise settle 之后发生；两次完成后经平台读回的记录为 `{ language: 'en' }`。
- ac-write-failure-no-rollback: `writeUserSettings` 以 `EACCES: permission denied` reject 时，语言仍为目标语言、会话与标签不变、面板不关闭；面板内 `role="alert"` 文本为当前语言的 `settings.saveError` 且包含原始 reason；随后一次成功写盘后该提示消失；关闭再打开面板不出现旧失败提示。
- ac-switch-notice-live: en 界面出现一条由词典生成的提示（如拖入单路径的 `Using … as the left baseline`）后打开设置切到中文，同一 `role="alert"` 文本立即变为对应中文、语气与参数（路径/数量）不变，且不产生额外平台调用。
- ac-switch-keeps-state: 目录会话已设置非 `all` 过滤、选中一行并改变两侧滚动偏移，另有一个未保存修改的代码会话时切换语言：会话数量 / id / 顺序 / 活动标签不变，过滤选中值、选中行路径、两侧 `scrollTop`、dirty 标记与未保存提示均不变。
- ac-switch-no-rework: 上述切换前后 `listDirectory` / `listDirectories` / `digestFiles` / `readTextFile` 调用次数完全相同；`onCompareRequest` 与 `compareRequestsReady` 各只调用一次（工作台未重挂载）。
- ac-persistence-restart: 在 en 界面切到中文后卸载，并以 `systemLocale = 'en-US'` 重新挂载 `App`：首屏仍为中文，且启动阶段 `writeUserSettings` 调用次数为 0（有记录以记录为准、系统语言不改写记录）。
- ac-settings-han-scan: `scanHardcodedChinese` 扫描本项显式清单（`src/renderer/src/workbench/SettingsDialog.tsx`、`src/renderer/src/workbench/Workbench.tsx`、新增语言标签 helper）命中数为 0（注释、`aria-label`、`title`、`data-testid` 不豁免）。
- ac-existing-suite: 既有 App / App.i18n / Workbench / 组件测试全部通过；`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build:web` 全绿；`code_gates.json` 不改、不新增专用 gate。

## 非目标

- 不本地化 `src/renderer/src/views/**`（目录树与四态过滤、代码 / CSV / 结构化视图、`DirectorySyncDialog`、`TemplateDialog`）以及 `workbench/snapshotOps.ts`、`workbench/loadSampleSessions.ts`、`workbench/session.ts`、`workbench/fileIO.ts` 里的中文提示——它们归后续视图 WI；切换后这些区域仍显示现状中文，属已知未完成面，不是本项回归。
- 不改 `App.tsx` 的启动解析、无文字品牌帧与 Provider 挂载；不改 `loadInitialLanguage` / `resolveInitialLanguage` 语义；不做系统语言实时跟随或系统语言变化触发切换。
- 不改词典结构：不新增 / 重命名 / 删除任何 `messages/zh|en/**` 键，不新增第三种语言，不改 `en` / `zh` 键集与自指标签约定；不改 `PlatformPort`、`main` / `preload` / `web-platform` 的存储实现，不新增第二个存储键或配置文件。
- 不改会话 id 生成、对比 / 扫描 / 摘要 / 缓存 / 取消逻辑、四态语义、差异色、布局与字号；不改 `code_gates.json`。
- 不发成功 toast（`settings.saved` 保持未使用），不新增主题 / 快捷键 / 其他设置分区，不做设置面板的持久化草稿或批量保存。
- 不碰 `package.json#version`、`CHANGELOG.md`、发布工作流与证据、`README.md` / `AGENTS.md`；不发版、不打 tag、不 push。
- 不做浏览器 / 真机 / 桌面点选验收（`needSelfTest=false`）。

## 实现约束

- 面板文件放 `src/renderer/src/workbench/SettingsDialog.tsx`，`props` 至少包含 `platform` 与 `onClose`；入口按钮放 `Workbench` 顶栏右侧群组的最后一个位置，刻意不接 `directoryBusy` 的 disabled。
- 语言选项标签只允许来自 `messages[target]['settings.language.name']`（可加一个极小 helper，如 `languageSelfLabel(language)`，放 `src/renderer/src/i18n/` 并纳入扫描清单）；禁止在组件里写 `'简体中文'` / `'English'` 字面量，也禁止为标签新增词典键（会同时违反 en 词典零汉字与 zh 词典汉字约束）。
- 切换处理顺序固定：`setLanguage(next)` → 串行队列里 `platform.writeUserSettings({ language: next })`；面板只保存失败 `reason`（字符串），文案在渲染期用 `t('settings.saveError', { reason })` 生成，保证失败提示本身也随语言切换。
- 写盘串行用 `useRef` 链式 promise 即可，不需要 debounce / 取消；最后一次选择必须最后落盘。写盘失败不得触发 `setLanguage` 回滚、不得重新 `readUserSettings`。
- 通知条状态改为 `Notice = { kind: 'copy'; key: MessageKey; params?: InterpolationParams } | { kind: 'detail'; text: string }` 之类的最小结构，`report` 接受该结构；词典文案在渲染期解析，原始错误 detail 原样输出。通知文案本身、`info` / `danger` 语气与清除时机不变。
- 不要给 `Workbench`、视图组件或设置对话框加语言相关的 `key`；切换只允许触发 context 消费组件重渲染。
- 既有 `App.test.tsx` / `App.snapshot.test.tsx` / `App.i18n.test.tsx` 的写法（预置 `opencompare.userSettings`、`await screen.findByRole(...)`、`renderWithI18n`、`countingPort`）应作为新测试的模板；测试环境 jsdom，`cleanup()` / `localStorage.clear()` 保持既有 `beforeEach` / `afterEach` 习惯。
- 注释与新增代码注释一律英文（扫描不豁免注释）；不新增运行时依赖。
