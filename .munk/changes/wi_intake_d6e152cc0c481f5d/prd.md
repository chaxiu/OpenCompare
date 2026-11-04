# 目录工具栏定高 36/72 与「更多」菜单不出屏

## 范围

承接 `wi_intake_c4097ed1a9ec9d00`（窄窗横向兜底与 light 四态对比度已由 L3 复验达标）。本项只收同场复验在纵向维度留下的两条 fail，不重做已通过部分：

1. **band 定高**：目录 `view-toolbar` 单行实测 44px（应 36）；en 换行两行实测 92px / 80px（应 72，且两种两行组合互不相等）。根因是 `directoryToolbarRowClasses()` 的 `min-h-8` 行被 40px 的 `SegmentedControl`（`p-1` 4×2 + `h-[30px]` + `border` 1×2）撑起；两行时再叠 `gap-2` 8px，且第二行是否含 segmented 决定行高，故 92/80 漂移。本项把行高压到 32、行间 gap 收到 4、band 纵向 padding 保持 2+2，得到 36 / 72。
2. **「更多」菜单出屏**：en@960 菜单末条下缘 807（视口 800，越 7px）、en@1024 801（越 1px）。本项保证 800 高视口下 9 条完整落在视口内且逐条可点；下方空间不足时向上翻转，或按视口夹取（等效方案），不靠滚动条藏条目。

连带把 1280 档顶部四项合计收回 ≤120（32 + 28 + 36 + 24）。横向兜底、亮色对比度、对比语义、四态口径、导出、快照、发布通道零改动。

## 验收标准

- ac-band-single-36: 最终构建在 1280×792、zh、目录就绪态下，`[data-shell-level="view-toolbar"]` 的 `getBoundingClientRect().height === 36`；该 band 与其唯一行容器的 `scrollHeight === clientHeight`。
- ac-band-wrapped-72: 最终构建在 en、innerHeight 800 下，960 与 1024 两档发生换行的 band 高度都 `=== 72`，两次实测值完全相等；band 与行容器 `scrollHeight === clientHeight`。
- ac-band-zero-clip: 单行（1280）与两行（en@960、en@1024）下，行内任一控件的 `getBoundingClientRect().bottom <= band.bottom`；不存在纵向裁切。
- ac-shell-band-120: 1280×792 就绪态下 `data-shell-level` 的 app / sessions / view-toolbar / panels 头实测高度依次为 32 / 28 / 36 / 24，四项合计 120px 且 ≤120（在既有断言上只加强）。
- ac-zh-single-row: zh 在 960 / 1024 / 1280 三档均为单行，band 高度 `=== 36`，`measureDirectoryToolbar` 的 `rows === 1`。
- ac-control-height-32: 目录行内控件渲染高度 `<= 32`；`SegmentedControl` 外框恰为 32（水平投影 `p-1`→`px-1 py-0`，tab 仍 `h-[30px]`，border 上下各 1px）；band / 行高不靠 `overflow-hidden`、负 margin 或裁切得到。
- ac-band-arithmetic: 高度算术精确命中：单行 `2 + 32 + 2 = 36`，两行 `2 + 32 + 4 + 32 + 2 = 72`；行容器横向 gap 仍为 8，纵向 gap 为 4。
- ac-band-height-pure: `toolbarBandHeightPx(1) === 36`、`toolbarBandHeightPx(2) === 72`，由纯函数/常量表达并被单测钉死；行高 32 与控件最大高度 32 也由测试钉住；行高不随落入哪几个控件或语言漂移。
- ac-more-menu-in-viewport: en@960 与 en@1024（innerHeight 800）打开「更多」菜单后，9 个 `menuitem` 的 `top >= 0` 且 `bottom <= 800`；菜单与各条目完整可见，菜单 `scrollHeight === clientHeight`（不出现内部滚动条藏条目）。
- ac-more-menu-last-action: 上述两档下每个条目可点击；末条「隐藏本机路径」点击后真实切换 `hideLocalPaths`（选中标记与状态回传均变化）；Escape 与点击菜单外部仍关闭菜单。
- ac-menu-placement: 菜单落位由可单测的纯函数决定：下方放得下→下方；下方不足且上方放得下→向上翻转；两侧都不足→在视口边距内夹取（clamped），并为菜单提供不超过视口的高度上限；验收视口下不得触发内部滚动。
- ac-no-assertion-weakening: 既有 `ac-shell-band-120` 与 `ac-collapse-hides-text-only` 的断言只允许新增/加强；不得为过门删除、跳过或放宽既有断言；与既有断言冲突时先说明再改。
- ac-zero-change-redlines: 四态计数 48/2/2/27、状态栏差异 31、文件 77/77 不变；light 四态前景对比度维持 4.78 / 4.66 / 4.60 / 4.62（均 ≥4.5），dark 6.41 / 6.47 / 5.16 / 6.51 不回退；目录工具行横向 `scrollWidth === clientWidth`，无 `overflow-x` 兜底、无横向裁切；对比语义、四态口径、导出、快照、发布通道零改动；不新增依赖、不动图标库、不改 `package.json#version` 与 `CHANGELOG.md`。
- ac-readme-screenshots: 用最终合入构建按 1280×792 逻辑视口 / DPR2（2560×1584）重出 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`；`docs/screenshots.md` 更新 captured commit、字节数与两枚 sha256；captured commit 是 HEAD 祖先且 `src/renderer` 自该 commit 零 diff；`README.md` / `README.zh-CN.md` 第 5 行 `Latest public release: v0.2.19` 指针不动。
- ac-gates-green: `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm build:web` / `pnpm test` / `node scripts/test-debt-gate.mjs` 全绿；test-debt 以 growth 声明本项新增用例，不删用例、不放宽既有断言。

## 非目标

- 不重做横向兜底与 light 对比度修复（已过 L3），不改其断言或 token。
- 不做 <960 与 1440+ 档；不改 960 / 1024 / 1280 之外的分档行为。
- 不新建 WorkSet、不改 goal、不跑 L3（复验由 LP 另派 product-qa）。
- 不改四态语义、状态栏文案口径、导出 / 快照格式、发布通道、版本号、CHANGELOG、图标库；不新增依赖。
- 不新增第二份高度表，不用 `overflow` 隐藏 / 负 margin / 裁切换取高度。

## 实现约束

- **单一布局事实源**：行高、行间距、band 高度继续落在 `src/renderer/src/workbench/shellLayout.ts`。新增/复用纯常量（行高 32、行间 gap 4、纵向 padding 2），`toolbarBandHeightPx(rows)` 显式表达 `rows*32 + (rows-1)*4 + 2*2`，得到 36 / 72；禁止在 JSX 里另写第二份高度数字。
- **控件高度**：`SegmentedControl` 只收纵向内边距（`p-1` → `px-1 py-0`），保留 `h-[30px]` tab 与 1px border，使水平投影宽度不变（宽度模型不漂），外框高度 = 30 + 2 = 32；其余行内控件本身 ≤32。
- **行构造确定**：`directoryToolbarRowClasses()` 把 `gap-2` 拆成 `gap-x-2 gap-y-1`；目录行每个直接子项至少 32 高（如 `min-h-8` / 包裹层），保证每一 flex 行都恰为 32，两行恒为 72，不随落入哪几个控件变化。不得用任意变体 / 响应式前缀破坏既有「行 class 不含 `:`」断言。
- **菜单落位**：抽出零 DOM 的纯函数（below / above / clamped + 视口边距夹取 + 高度上限），`DropdownMenu` 用实测触发器与菜单矩形决定 `top` / `left` / `maxHeight`（可用 fixed 定位）；验收视口下菜单不出现滚动条；Escape 与外部点击关闭逻辑保持。
- **文案与顺序不变**：不改任何 copy key、图标、条目顺序、宽度表与折叠阶梯；`measureDirectoryToolbar` 的 `rows` 在 zh@960/1024/1280 仍为 1，在 en@960/1024 仍为 2。
- **截图时序**：先把最终 `src/renderer` 改动提交为 captured commit（工作树干净），在该 commit 上 `pnpm build` + `pnpm screenshots`，随后提交 PNG 与 `docs/screenshots.md`；`release-artifacts-and-brand` 的「captured commit 是 HEAD 祖先 + `src/renderer` 零 diff」门禁必须保持绿。README 版本指针不动。
- **test-debt**：按既有机制在 `.munk/baseline/test-debt.json` 增加 growth 声明（from = 当前 ceiling，to = 新 ceiling，reason 说明新增覆盖，addedCases 与新增用例一致），并保持 floors 只升不降。
- **证据路径**：交付证据写仓内路径或 run 目录绝对路径；不写 `projects/...` 相对路径。A–E 自证需给出实测绝对值与可复跑命令（含 960 / 1024 / 1280 × en / zh 的 band 高度、`scrollHeight === clientHeight`、菜单 9 条 top/bottom、末条动作结果）。
