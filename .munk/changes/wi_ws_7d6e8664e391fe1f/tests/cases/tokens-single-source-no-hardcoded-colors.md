covers: ac-tokens
标题: 壳层与基础组件统一引用同一套 token，无硬编码颜色
步骤: 1) 审查 `src/renderer/src/assets/main.css` 的 `@theme`，确认表面/文字/边框/主色/危险与差异语义色（same/added/removed/modified/conflict）及字号/间距/圆角同源；2) 检查 `src/renderer/src/components/**` 与主屏/视图组件，确认类名与颜色只经 token（如 `--color-*`、差异语义色映射），未写死十六进制/rgb/像素色值
期望: 颜色、字号、间距、圆角全部来自唯一 token 来源；组件内无硬编码颜色，差异语义色统一走 `diff-*` token

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: 唯一 token 来源 src/renderer/src/assets/main.css @theme 齐备：表面 surface-base/sunken/raised/overlay/hover、文字 content-primary/secondary/muted/inverse、边框 line-subtle/strong、主色 accent/accent-strong/accent-soft/focus、危险 danger/danger-strong/danger-soft，差异语义色 diff-same/added/removed/modified/conflict 及对应 *-soft，并有 --font-*/--text-2xs/--radius-*/--shadow-*/--duration-* 共 39 条 token。全量扫描 src/renderer/src/**（含 components/**、views/**、workbench/**、各 *.tsx/*.ts/*.css，排除 main.css）：无十六进制/rgb/hsl 硬编码色、无 Tailwind 任意值色（bg-[#..]/text-[rgb..] 等）、无 inline style color；差异语义色统一经 components/diffSemantics.ts 映射到 bg-diff-*/text-diff-* token。
