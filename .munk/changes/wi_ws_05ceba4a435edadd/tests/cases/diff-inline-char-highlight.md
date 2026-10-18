covers: ac-diff-inline-char
标题: 双栏 Diff 对修改行给出行内字符级高亮（仅变化片段着色）
步骤: 加载样本 → 进入代码会话的「双栏 Diff」→ 查看被判定为修改的行
期望: 修改行仅在变化字符片段上着色（行内字符级 inline 高亮），两侧相同字符不着色；行级状态仍为 modified，颜色走 --color-diff-*（DiffBadge/diffSemantics），未整行涂色；`src/core` 的 inlineSegments 对超长行（>2000 字符）退化为整行标记 changed 而非卡死

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: Web 实机：切「双栏 Diff」，工具栏「差异块 3/3」徽标「修改」。modified 行左右内容区各被切成 3 个 span（前缀/变化字符/后缀），左栏真实行 12 中间 span 仅 7px（`,`）、右栏真实行 15 中间 span 14px（`·`），同一面板 same/added 行只有 1 个 span；行级底色为 diff-modified-soft，亮色 bg-diff-modified/40 仅覆盖变化字符（非整行涂色）。限制：Device MCP 不暴露 class/computed style，高亮色为几何分段+源码分支佐证；超长行(>2000)退化由 diff.test.ts 覆盖。
