covers: ac-diff-sync-scroll
标题: 拖动任一栏滚动另一栏按行号映射同步滚动，无抖动/互踢
步骤: 进入代码会话「双栏 Diff」→ 拖动左栏垂直/水平滚动条 → 再拖动右栏滚动条
期望: 拖左栏时右栏按行号映射同步到相同 scrollTop/scrollLeft；拖右栏时左栏同样同步，两向对称；同步过程无抖动、无互踢回弹（两侧对齐行数保证映射精确）

## 最近执行

- workItemId: wi_ws_05ceba4a435edadd
- at: 2026-10-18
- status: pass
- note: web-isolated 实机：默认 1280×720 无溢出（scrollHeight=clientHeight=488）；缩至 720×320 后两栏均溢出（scrollHeight=320 / clientHeight=88，scrollWidth=549 / clientWidth=350）。左栏 set scrollTop=120 → 两栏 120；右栏 set 180 → 两栏 180；水平左 90 / 右 120 两栏一致；连续 40→100→160 即时与 200ms 后两栏始终相等，无回弹/互踢；真实拖动左侧滚动条到底两栏同为 st=232, sl=96，拖右侧两栏同为 st=100, sl=60 且 450ms 后保持。两向对称、无抖动。
