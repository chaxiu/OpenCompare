covers: ac-diff-block-overwrite
标题: 单块「覆写到右/左」写入对侧并即时重算差异，且可撤销/重置
步骤: 进入「双栏 Diff」→ 选中某差异块 → 点「覆写到右」→ 再点「覆写到左」→ 点「重置」
期望: 「覆写到右」把该块左侧文本写入右侧对侧位置并即时重算差异（该块消失/差异减少）；「覆写到左」反向同理；「重置」恢复样本 left/right 原文，差异回到初始状态

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: web-isolated 实机：初始 1/3（左 13 行 / 右 16 行）；「覆写到右」→ 差异块 3→2、右栏最大行号 16→14、EMPTY_SUMMARY 声明行消失、左栏不变；再「覆写到左」→ 块数 2→1、左栏 13→14 并新增 `if (rows.length === 0) return EMPTY_SUMMARY`、右栏不变；「重置」→ 回到 1/3、左 13 行 / 右 16 行、第 6 行 EMPTY_SUMMARY 恢复，两栏原文与初始逐行一致。
