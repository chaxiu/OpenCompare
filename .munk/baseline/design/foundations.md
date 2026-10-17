# Design foundations

Colors, typography, spacing, tokens (SSOT).

来源：WI `wi_ws_7d6e8664e391fe1f`（ui-baseline）。视觉方向：现代暗黑工业风 + 紧凑高信息密度，对标 Beyond Compare 5 Pro。

## Token 唯一来源

- 文件：`src/renderer/src/assets/main.css`（Tailwind v4 `@import 'tailwindcss'` + `@theme`）。
- 颜色：`--color-surface-*`（base / sunken / raised / overlay / hover）、`--color-content-*`（primary / secondary / muted / inverse）、`--color-line-*`（subtle / strong）、单一主色 `--color-accent`·`-strong`·`-soft`·`--color-focus`、危险色 `--color-danger`·`-strong`·`-soft`。
- **差异语义色（产品核心视觉语言）**：`--color-diff-same` / `-added` / `-removed` / `-modified` / `-conflict`，配 `--color-diff-*-soft` 背景色。所有对比视图必须走这组 token，不得自造色。
- 排版：`--font-sans` / `--font-mono`（系统字体栈，无网络字体）、`--text-2xs`（11px，加在默认字阶之上）。代码、表格、路径、统计数字一律 `font-mono` + `tabular`。
- 圆角 `--radius-xs/sm/md/lg`、阴影 `--shadow-panel` / `--shadow-overlay`。
- 间距沿用 Tailwind v4 单一基数 `--spacing`（`calc(var(--spacing) * n)`），缩进等动态间距也用该 token 计算。
- 动效：`--duration-fast`(110ms) / `--duration-base`(170ms) / `--ease-ui`。
- 复用型低层行为：`@utility transition-ui` / `transition-fast` / `focus-ring` / `tabular`。
- 组件内无硬编码颜色与像素色值；基色切换主题只需改这一处。
