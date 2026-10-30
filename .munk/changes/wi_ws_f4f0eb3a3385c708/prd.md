# 亮 / 暗 / 跟随系统主题与 README 真实截图收尾

本项在 main 的最终 UI 树上交付两件事：三态主题（亮 / 暗 / 跟随系统）与两版 README 的真实会话截图收尾。只动界面层、设置持久化与文档 + 截图资产，不动对比 / 合并 / 扫描算法、四态语义、快照格式与发布单点文件。主题与 README 同一 commit 收尾。

## 范围

### A. 三态主题

1. `src/renderer/src/assets/main.css` 仍是唯一 token 来源：为**同一组** `--color-*` token 增加亮色取值，不新增 token 名、不新开第二套色板、不新增色板文件。
2. 根节点 `document.documentElement.dataset.theme` 承载 `light` / `dark`，同一处同步 `color-scheme`（暗 ↔ `dark`，亮 ↔ `light`）。
3. `UserSettings` 扩展为 `{ language, theme }`，`theme` 为 `'light' | 'dark' | 'system'`；共享解析函数（`src/shared/platform/settings.ts`）对缺失 / 未知 / 损坏值安全回退，绝不抛错、绝不阻断启动。
4. `SettingsDialog` 在语言分区之后新增「主题」分区（沿用 `SegmentedControl`，三项由 i18n 字典给文案，en / zh 键对齐）；选择后整窗即时生效 + 持久化；写失败沿用现有就地报错文案，不回滚当前选择。
5. `system` 模式用 `window.matchMedia('(prefers-color-scheme: light)')` 解析并跟随；系统偏好变化只在 `system` 模式生效，其它模式不响应；离开 `system` 或卸载时注销监听。
6. 切主题不重扫目录、不重算摘要、不重读文件、不重挂应用根；会话、tab、激活项、滚动位置、筛选与折叠状态全部保持。
7. 代码层对比度工具：新增**纯函数**（无 DOM / Electron 依赖，能被 vitest 直接跑）从 `main.css` 文本解析 token 值，计算 WCAG 相对亮度与对比度、以及四态色的 Lab ΔE；断言进 `pnpm test`。交付说明给前景 / 背景取值、实测比值、测量方法与四态区分阈值。

### B. README 真实截图收尾（同 commit）

1. `README.md` 与 `README.zh-CN.md` 均引用两张图：`docs/assets/opencompare-workbench.png`（目录对比工作台）与新增 `docs/assets/opencompare-file-diff.png`（含指示条的文件 diff）。两张图都由**最终构建的真实会话**产出：真实临时目录树 + 真实文件对，不得使用内置样本、旧图或合成图。
2. 图注 en / zh 语义镜像；README 的 9 个 H2 与第 5 行 release 版本行一字不动。
3. 截图生成必须可复现：仓内脚本 + 一条命令，并把被测 commit（40-hex、git 可解析）与命令写进文档；不得新增截图专用 npm 依赖（用已在依赖里的 Electron 采集）。
4. `src/main/release-packaging.test.ts` 既有 workbench 截图断言保持绿，并为文件 diff 图补同等断言（PNG 签名、宽高下限、体积下限、两版 README 均引用、`.gitignore` 不忽略）。

## 验收

### 主题 token 与对比度

- ac-theme-token-names-identical: 从 main.css 解析出的两套主题 `--color-*` token 名集合完全相等（亮色缺失任一既有名、或多出任何新名即失败），差异语义 `--color-diff-{same,added,removed,modified,conflict}` 及 `-soft` 两个主题都存在。
- ac-theme-no-second-palette: `src/renderer/src/assets/` 下只有 `main.css` 定义 `--color-*`；亮色是同文件内的覆盖值，仓内无第二套 token 前缀 / 第二色板文件。
- ac-theme-contrast-body: 纯函数断言两套主题下 `content-primary` 对 `surface-base` 对比度 ≥ 4.5，`content-secondary` 对 `surface-base` ≥ 3.0。
- ac-theme-contrast-diff: 两套主题下 `diff-added` / `diff-removed` / `diff-modified` / `diff-same` 对各自 `-soft` 背景、以及对 `surface-base` 的对比度均 ≥ 3.0。
- ac-theme-four-states-distinct: 同一主题内 `same` / `added` / `removed` / `modified` 四色两两 CIE76 Lab ΔE ≥ 12；暗、亮两套主题分别成立。
- ac-theme-no-hardcoded-color: `src/renderer/src/**/*.{ts,tsx}` 中零 `#hex` / `rgb(` / `hsl(` 颜色字面量（`assets/icons/*.svg` 仅 `currentColor` 不在扫描范围），主题色只能经 token 生效。

### 切换 / 持久化 / 跟随系统

- ac-theme-settings-section: 设置对话框存在主题分区（`role="tablist"`，aria-label 取自 i18n 的 `settings.theme`），含 light / dark / system 三个 `role="tab"` 选项，选中态与当前生效模式一致。
- ac-theme-applies-immediately: 点选任一主题后，同一事件循环内 `<html data-theme>` 变为解析后的 `light` / `dark`，`getComputedStyle(document.documentElement).colorScheme`（或等价的 `color-scheme` 断言）与之同步；无需重启。
- ac-theme-no-remount: 连续切换主题三次，应用根（Workbench）挂载次数保持 1，DOM 根节点被替换次数为 0，会话状态不丢。
- ac-theme-persists: 选择后 `writeUserSettings` 收到同时含 `language` 与 `theme` 的完整记录；用同一平台实例重建 `App` 后沿用上次主题（不回到默认）。
- ac-theme-settings-merge: 先改语言再改主题、以及反向顺序两次操作后，持久记录中两者都在；旧记录 `{"language":"zh"}` 读回为 `{language:'zh', theme:'dark'}`；`theme` 为未知字符串或非字符串时同样回退 `dark` 且不抛错。
- ac-theme-system-follows: 模式为 `system` 时 `data-theme` 等于 matchMedia 当前偏好；触发系统偏好变化事件后随之改变（无需重开设置）。
- ac-theme-system-only-listener: 模式为 `light` / `dark` 时触发同一 matchMedia 变化事件，`data-theme` 不变；切离 `system` 后 matchMedia 监听已注销（监听注册数回到切换前）。
- ac-theme-zero-io: 在已打开真实目录会话与文件会话的工作台上切换主题，`listDirectory` / `listDirectories` / `statPath` / `readTextFile` / `fileDigest` 的调用次数增量全为 0。
- ac-theme-state-preserved: 切主题前后会话数量、tab 顺序与激活 tab、双栏 `scrollTop`、当前筛选值与折叠节点集合逐一相等。

### README 与截图

- ac-readme-two-screenshots: 两版 README 各自引用 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`，两版图注一一对应（en / zh 语义镜像）。
- ac-readme-shape-unchanged: 两版 README 的 9 个 H2 标题与顺序不变（既有 `readmeSection(heading, next)` 截取边界继续命中），第 5 行 release 版本行内容不变。
- ac-screenshot-artifacts: 两张 PNG 通过 PNG 签名校验、宽 ≥ 1000、高 ≥ 600、体积 > 10KB，且 `.gitignore` 不忽略二者。
- ac-screenshot-real-session: 截图生成脚本不 import / 读取 `src/shared/fixtures/**` 与任何内置样本路径，采集对象是最终构建产物（脚本里可见构建命令或对构建产物的启动路径）；交付文档写明两张图各对应哪个真实会话（目录树对比、含指示条的文件 diff）。
- ac-screenshot-reproducible: 仓内有截图脚本 + 文档 `docs/screenshots.md` 记录每张图的路径、被测 commit（40-hex，`git cat-file -e <sha>^{commit}` 通过）与可复制命令；`pnpm test` 有断言校验该文档字段存在且 commit 可解析。
- ac-release-packaging-screenshots: `pnpm test src/main/release-packaging.test.ts` 全绿，且文件 diff 图具备与 workbench 图同等的签名 / 尺寸 / 体积 / 两版引用 / gitignore 断言。

## 非目标

- 不改对比 / 合并 / 扫描 / 摘要 / 快照算法与视图模型，不改四态（same / added / removed / modified / conflict）语义与快照格式。
- 不动发布单点文件：`package.json#version`、`CHANGELOG`、`release.yml`、README 第 5 行、既有 `docs/release-evidence/**`。
- 不做 I#5 逐项配色可定制、不做字体 / 字号 / 密度自定义，不做主题编辑器或「高对比」额外模式。
- 不引入审计判为主动不做的 9 项（minimap、双层菜单栏、工具栏自定义、多窗口工作区、打印 PDF、文件格式规则管理器、独立 Folder Sync 会话、三向独立中栏、远程云 profiles）；若实现中确实需要碰其中任一条，停下并 `munk_report_owner` 上报，不得自行推翻。
- 不实施审计的 3 条入口调整（samples-menu 合并、template / report-export 降级）；本期不改入口。
- 不改 `SHELL_ENTRIES` 与其三档 presentation；主题分区只加在设置对话框内部，不新增应用头入口、不新增 shell entry。
- 不新增图标包 / 不就地写 SVG；不新增 npm 依赖（截图用已有 Electron，测试用已有 vitest）。
- 不做浏览器 / 真机 / 桌面点选；L3 实机由 product-qa 承接。不新增长跑门禁。

## 实现约束

- **图标（既成事实）**：`lucide-react` 已从依赖移除，唯一出口是 `components/Icon.tsx` + `ICON_PATHS` / `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS`；尺寸只有 16 / 20 / 24，`className="size-*"` 会被测试拦下。主题分区若要图标，只能从 `UI_ICON_ACTIONS` 取既有动作名。
- **壳层（既成事实）**：入口增删或位置变化必须登记 `workbench/shellLayout.ts` 的 `SHELL_ENTRIES`（三档 presentation + width），断言用 `data-shell-entry`；compact 折叠只走 `DropdownMenu` 的 `iconOnly` / `entryId`；加行用 `TOOLBAR_ROWS`，不加独立 band。本项不新增入口。
- **tab 文案断言**：一律读 `aria-label` 或 `data-tab-part`，不按 CSS 类定位。
- **README 第 8 节标题**：它就是 `release-packaging.test.ts` 里 `readmeSection` 的截取边界；确实要改节标题必须同批改 `heading` / `next` 两个入参。本项要求不改标题，故两个入参也不动。
- **主题默认值与迁移理由**：缺省 / 损坏 / 未知 `theme` 一律解析为 `dark`（保留现有安装的当前外观，避免老用户升级后被动变成亮色）；`system` 是显式选择项。默认值与理由写进交付说明。
- **兼容既有断言**：`src/main/platform/electron-platform.test.ts` 现有「未知字段 `theme` 被丢弃」的用例必须按新契约显式改写（期望读回带 `theme`），不得为了让测试变绿而改成宽松匹配。
- **设置写入不可丢字段**：现有 `writeUserSettings` 以整文件覆盖写；扩展后任何一次写入都必须同时携带 `language` 与 `theme`（读改写或由调用方给全量），禁止出现只写 `theme` 把语言清空的路径。web 平台（`localStorage` 单键 `opencompare.userSettings`）与 Electron（`userData/settings.json`）同一契约。
- **token 覆盖方式**：亮色在 `main.css` 内以同一组变量名覆盖（例如 `:root[data-theme='light']` 块），不复制 `@theme` 结构、不改组件 class 名；组件继续只引用 token。
- **matchMedia 可测性**：系统偏好读取走可在 jsdom 中替换的入口（如 `window.matchMedia` 注入），断言用计数型监听注册，不依赖真实 OS 设置。
- **零 IO 断言**：用带调用计数的 `PlatformPort` 包装（现有测试已有此模式），在目录会话 + 文件会话都打开后切换主题并比对计数快照。
- **截图脚本**：新增脚本（如 `scripts/capture-readme-screenshots.mjs`）用 Electron 的 `capturePage` 采集最终构建窗口，起真实临时目录树与真实文件对，产出两张 PNG；命令与被测 commit 记录在 `docs/screenshots.md`。若真实窗口起不来（构建失败、锁屏、CDP 连不上），**不降级、不伪造图片**，立即 `munk_report_owner` 上报卡点，由产品负责人安排 product-qa 出图。
- 交付说明需给：主题入口位置、默认值与迁移理由、对比度实测表（前景 / 背景 token、比值、方法、四态 ΔE 阈值）、两张截图的命令与 commit、改了哪些入口、回归断言清单。
