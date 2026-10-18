covers: ac-modified-cell
标题: 修改行变动单元格展示「原值 → 新值」用 modified 语义色，新增/删除行分别用 added/removed 语义色
步骤: 查看 `modified` 行的变动单元格（如 `qty` 的 `1 → 6`）→ 检查其差异语义色 → 再分别查看 `added` 行与 `removed` 行
期望: `modified` 行的每个变动单元格内联展示「原值 → 新值」并使用 modified 差异语义色（`--color-diff-*`），未变动单元格只显示一个值；新增行显示右值 + added 语义色，删除行显示左值 + removed 语义色；单边独有列在缺失侧留空

## 最近执行

- workItemId: wi_ws_274d4a5de8f6c5e4
- at: 2026-10-18
- status: pass
- note: 修改行变动单元格内联「原值 → 新值」：qty「16 → 21」「11 → 16」、status「shipped → refunded」，span class=rounded-xs bg-diff-modified-soft px-1 text-diff-modified，computed color rgb(216,161,58)=var(--color-diff-modified)；同行未变动单元格仅单值（84.75 / 2026-09-15 / emea）。新增行 bg-diff-added-soft + bg-diff-added 圆点、仅显示右值；删除行 bg-diff-removed-soft + bg-diff-removed、仅显示左值；仅右列 region 表头带「仅右」、缺失侧留空（∅）。
