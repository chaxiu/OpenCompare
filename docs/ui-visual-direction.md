# OpenCompare UI 视觉方向（V1：专业密集 + 清晰层级）

本文件是 UI 视觉打磨 V1 的仓内口径：定案摘录、基线诊断、逐条验收项。
`src/renderer/src/assets/main.css` 是**唯一 token 源**——组件只引用 token，不写死颜色与尺寸；
亮色只是同一批 `--color-*` 名字在 `:root[data-theme='light']` 下的覆盖，不存在第二份色板。

## 1. 定案摘录

### 1.1 布局

- 保留 UI 第一期壳层：应用标题、会话标签独立成行；目录动作收成一行上下文工具条。
- 顶部控件带目标：标题 32 + 会话标签 28/30 + 上下文工具条 36 + 面板头 24 ≤ **120 逻辑像素**。
- 主操作区每屏最多 1 个实心主按钮；单组超过 5 个动作进「更多」。
- 面板头改为单行可点击地址条；底部状态栏只保留当前场景有意义的度量。
- 本子项只收视觉基元与控件；主界面布局、工具条合并、状态栏文案与视图修正在下一子项。

### 1.2 Token 表（与 `main.css` 实读一致）

字号与行高（`--text-*` 与 `--text-*--line-height`）：

| Token | 字号 | 行高 |
| --- | --- | --- |
| `--text-2xs` | 11px | 16px |
| `--text-xs` | 12px | 18px |
| `--text-sm` | 13px | 20px |
| `--text-base` | 14px | 20px |
| `--text-lg` | 15px | 24px |

间距：`--spacing: 0.25rem`，1/2/3/4/6 步分别解析为 4 / 8 / 12 / 16 / 24px。

圆角：

| Token | 值 |
| --- | --- |
| `--radius-xs` | 4px |
| `--radius-sm` | 6px |
| `--radius-md` | 8px |

控件高：

| Token | 值 |
| --- | --- |
| `--height-control-sm` | 28px |
| `--height-control-md` | 32px |
| `--height-control-lg` | 36px |

暗色 token：

| Token | 值 | 含义 |
| --- | --- | --- |
| `--color-surface-base` | `#0b0e12` | 窗口底色 |
| `--color-surface-sunken` | `#080b0f` | 下沉区 |
| `--color-surface-raised` | `#11151b` | 面板 |
| `--color-surface-overlay` | `#171c24` | 浮层 |
| `--color-surface-hover` | `#1c2230` | hover |
| `--color-content-primary` | `#e6e9ef` | 主文本 |
| `--color-content-secondary` | `#a8b0bd` | 次文本 |
| `--color-content-muted` | `#6f7887` | 弱文本 |
| `--color-content-inverse` | `#0b0e12` | 实心按钮上的文字 |
| `--color-line-subtle` | `#232a35` | 细边 |
| `--color-line-strong` | `#333c4a` | 强边 |
| `--color-accent` | `#4c8dff` | 唯一蓝强调 |
| `--color-accent-strong` | `#6da4ff` | 强调 hover |
| `--color-accent-soft` | `#16233d` | 强调底 |
| `--color-focus` | `#6da4ff` | 焦点环 |
| `--color-danger` | `#f85149` | 破坏性确认 |
| `--color-danger-strong` | `#ff6b64` | 破坏性 hover |
| `--color-danger-soft` | `#2e171a` | 破坏性底 |
| `--color-diff-same` | `#8b949e` | 相同 |
| `--color-diff-added` | `#3fb950` | 仅右 / 新增 |
| `--color-diff-removed` | `#f85149` | 仅左 / 删除 |
| `--color-diff-modified` | `#d29922` | 修改 |
| `--color-diff-conflict` | `#d9a021` | 冲突（沿用修改色族） |
| `--color-diff-added-soft` | `#112319` | 新增底 |
| `--color-diff-removed-soft` | `#271619` | 删除底 |
| `--color-diff-modified-soft` | `#231f14` | 修改底 |
| `--color-diff-conflict-soft` | `#242014` | 冲突底 |

亮色 token（同色相、语义色降饱和）：

| Token | 值 | 含义 |
| --- | --- | --- |
| `--color-surface-base` | `#ffffff` | 窗口底色 |
| `--color-surface-sunken` | `#eceef3` | 下沉区 |
| `--color-surface-raised` | `#f6f8fa` | 面板 |
| `--color-surface-overlay` | `#eef1f5` | 浮层 |
| `--color-surface-hover` | `#e9edf3` | hover |
| `--color-content-primary` | `#1f2328` | 主文本 |
| `--color-content-secondary` | `#5b6470` | 次文本 |
| `--color-content-muted` | `#8b949e` | 弱文本 |
| `--color-content-inverse` | `#ffffff` | 实心按钮上的文字 |
| `--color-line-subtle` | `#e3e7ee` | 细边 |
| `--color-line-strong` | `#c6cdd8` | 强边 |
| `--color-accent` | `#2563eb` | 唯一蓝强调（与 `#4c8dff` 同色相） |
| `--color-accent-strong` | `#1d4ed8` | 强调 hover |
| `--color-accent-soft` | `#dbe7fd` | 强调底 |
| `--color-focus` | `#2563eb` | 焦点环 |
| `--color-danger` | `#e55d57` | 破坏性确认 |
| `--color-danger-strong` | `#d24a44` | 破坏性 hover |
| `--color-danger-soft` | `#fdecee` | 破坏性底 |
| `--color-diff-same` | `#818890` | 相同 |
| `--color-diff-added` | `#419b4e` | 仅右 / 新增 |
| `--color-diff-removed` | `#e55d57` | 仅左 / 删除 |
| `--color-diff-modified` | `#ad832d` | 修改 |
| `--color-diff-conflict` | `#b08324` | 冲突（沿用修改色族） |
| `--color-diff-added-soft` | `#e8f3ea` | 新增底 |
| `--color-diff-removed-soft` | `#fceceb` | 删除底 |
| `--color-diff-modified-soft` | `#f5f0e6` | 修改底 |
| `--color-diff-conflict-soft` | `#f6f0e5` | 冲突底 |

取整依据：亮色语义色保持暗色同名 token 的 HSV 色相（角差 ≤ 12°），饱和度下降 10–15%，
明度取同时满足「对 `#ffffff` 与各自 soft 底 ≥ 3.0」「四态两两 ΔE ≥ 12」的最亮值，
再按 sRGB 十六进制取整；`--color-diff-same` 因接近中性灰，取 `#818890`（饱和度下降 13.4%）。

### 1.3 控件三件套

- **Button**：`primary` 实心 / `default` 描边 / `ghost` 默认无底色（hover 才出底）；
  高度取 `--height-control-md`（32px）与 `--height-control-sm`（28px），文字 12px（`--text-xs`），
  圆角 6px（`--radius-sm`）；`danger` 只保留给破坏性确认，复用唯一红色 token。
- **Toggle**：单一开关控件 28×16（宽 28 高 16），2px 描边，圆角 4px（`--radius-xs`）；
  勾选态品牌色，未选态中性；`checkbox` 落点用视觉隐藏的原生 input 保留 `checked` 语义，
  `switch` 落点保留 `<button role="switch" aria-checked>` 以维持既有键盘契约，两者共享同一外观。
- **Chip / Badge**：高 20px、圆角 4px、11px 文字，结构为「8px 色点 + 文案 + 语义 soft 底色」，
  不再使用彩色描边；soft 底 = 语义色 12% 叠在 `--color-surface-base` 上（逐通道四舍五入，测试实读复算）。
  五个 `DiffStatus` 与既有 i18n 文案键不变；圆形色点用 `rounded-full`（形状，不占圆角档位）。
- **Tab**：`SessionTabs` 与 `SegmentedControl` 单项 30px，选中态用 2px 品牌色下划线表达，
  不再用整块高亮；`role="tab"` / `aria-selected` 语义不变。

### 1.4 视图与文案（下一子项执行，此处只登记口径）

树行 28 / 代码行 22 / 代码字号 12；活动面板用面板头背景 + 左侧 2px 品牌条；右侧差异指示条
2px 轨道 + 视窗矩形 + 差异色点；单词级差异柔底色 + 1px 下划线；状态栏按场景写客观度量。
本子项不改这些视图与文案，仅保证 token 与控件先到位。

## 2. 基线诊断（改动前）

基线截图与事实清单见 `docs/visual/v1/before/` 与 `docs/visual/v1/baseline-facts.json`；
文件名、逻辑视口与实际像素登记在 `docs/visual/v1/measurements.md`。

| 位置 | 改动前现状 | 目标 |
| --- | --- | --- |
| `src/renderer/src/assets/main.css` 字号 | 只有 `--text-2xs`（11px）；其余依赖 Tailwind 默认 12/14/16 | 显式 11/12/13/14/15 五档，行高 16/18/20/24 |
| 同上 圆角 | `--radius-xs 3px / sm 5px / md 7px / lg 10px` | 仅 4/6/8 三档 |
| 同上 控件高 | 无控件高 token，组件内散落 `h-6` / `h-7` | `--height-control-sm/md/lg` = 28/32/36 |
| 同上 暗色表面 | `surface-base #0b0d12`、`raised #12151d`、`overlay #171b25` | `#0b0e12` / `#11151b` / `#171c24` |
| 同上 语义色 | `diff-removed #f2555a`、`diff-modified #d8a13a`、`diff-conflict #a371f7`（紫色） | `#f85149` / `#d29922` / `#d9a021`，紫色消失 |
| 同上 danger | `--color-danger #f2555a` 与删除色不同值 | 与 `diff-removed` 同色相 `#f85149` |
| `components/Button.tsx` | `sm h-6` / `md h-7`；无控件高 token | 28/32px，三档强调 + 破坏性例外 |
| `views/CodeView.tsx` | iOS 风格蓝色开关（`h-3 w-5` 圆轨） | 28×16 方形勾选 |
| `views/DirectoryView.tsx` / `TemplateDialog.tsx`（2 处）/ `DirectorySyncDialog.tsx` | 原生 `checkbox` + `accent-accent` | 统一方形勾选控件 |
| `components/DiffBadge.tsx` | 描边 + soft 底，无固定高度/色点 | 20px + 8px 色点 + 文案 + soft 底 |
| `components/SessionTabs.tsx` | 容器 `h-7`，选中整块底色 + 1px 线 | 30px + 2px 品牌下划线 |
| `components/SegmentedControl.tsx` | 单项 `h-6`，选中整块底色 + 阴影 | 30px + 2px 品牌下划线 |

## 3. 验收项（与本文 `ac-*` 一一对应）

1. **ac-direction-doc**：本文件存在且非空，含「定案摘录 / 基线诊断 / 验收项」三段；声明 `main.css` 为唯一 token 源。
2. **ac-direction-doc-matches-css**：本文件 token 表与 `main.css` 实读值逐项相等。
3. **ac-baseline-before-shots**：`docs/visual/v1/before/` 四张 PNG 合法、2560×1584、>100000 字节、已跟踪；`measurements.md` 登记文件名与 1280×792。
4. **ac-baseline-facts**：`baseline-facts.json` 含 commit、capturedAt、四态计数、三组忽略开关、导出 HTML bytes/sha256；commit 可解析且为 HEAD 祖先。
5. **ac-baseline-precedes-tokens**：该 commit 的 `main.css` 仍是改动前版本（无 `#0b0e12`、无 `--height-control`），证明基线先于 token。
6. **ac-tokens-type-scale**：字号恰为 11/12/13/14/15，行高恰为 16/18/20/24 且逐档配对。
7. **ac-tokens-spacing-radius-control**：间距基数 `0.25rem`；圆角恰 4/6/8；控件高恰 28/32/36。
8. **ac-tokens-dark-colors**：暗色表面 / 文本 / 边框 / 强调色与上表一致；sunken / hover 在同一中性斜坡内唯一。
9. **ac-tokens-light-colors**：亮色表面 / 文本与上表一致；边框唯一可辨；强调色与 `#4c8dff` 同色相且对白字对比 ≥ 4.5。
10. **ac-diff-hues**：四态语义色与上表一致；总色相 ≤ 4；紫色旧值消失；冲突沿用修改色族；danger 与删除同色相。
11. **ac-four-state-hardlines**：两套主题四态两两 ΔE ≥ 12、对背景与 base 对比度 ≥ 3.0，文本对比硬线不放宽。
12. **ac-light-semantic-desaturation**：亮色四态与暗色同名 token 色相角差 ≤ 12°，HSV 饱和度下降 10–15%。
13. **ac-button-states**：`ToolbarButton` 三档强调 + 破坏性例外，高度/圆角/文字走 token。
14. **ac-toggle-square**：单一开关控件 28×16、2px 描边、圆角 4，替换 5 处开关且语义不变。
15. **ac-chip-badge**：`DiffBadge` 与状态图例统一 20px、圆角 4、11px、色点 + 文案 + 12% 语义底。
16. **ac-tab-underline**：`SessionTabs` 与 `SegmentedControl` 单项 30px、2px 品牌下划线。
17. **ac-no-hardcoded-ui**：`components/**` 与 `views/**` 无颜色字面量；本项改动控件无 4/8/12/16/24 之外的间距工具类。
18. **ac-functional-parity**：改动后四态计数、忽略开关默认值、导出 HTML bytes/sha256 与基线一致。
19. **ac-no-fifth-state**：`DIFF_STATUSES` 仍 5 项，四态口径、对比语义、快照 / 导出逻辑零改动。
20. **ac-readme-provenance**：README 截图重拍为 2560×1584，`docs/screenshots.md` 的 captured commit / 字节 / sha256 更新且门禁绿。
21. **ac-gates-green**：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test`、`node scripts/test-debt-gate.mjs` 全绿。
