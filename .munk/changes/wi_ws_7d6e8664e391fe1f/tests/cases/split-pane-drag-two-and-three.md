covers: ac-split-pane
标题: 双栏 / 三栏工作区可拖拽调整分栏宽度，三向合并呈三栏
步骤: 1) 在目录/CSV/JSON·YAML 双栏会话拖动分隔条；2) 在代码会话切到 3-Way Merge 三栏视图并拖拽两条分隔条
期望: 双栏与三栏均可拖拽调整分栏宽度；三向合并场景呈现三栏（base·ours·theirs），拖拽后栏宽实际变化

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: 双栏/三栏均可拖拽调整栏宽，三向合并呈三栏。证据为本轮真实执行的 RTL 断言（临时 harness，跑后已删除，工作树零残留；渲染真实 <App/> 与 SplitPane，通过 role="separator" aria-label="调整分栏宽度" 派发 pointerdown/move/up 与键盘事件，读取各 pane 的 style.flexGrow 实测值）：双栏（目录会话）初始 flexGrow [0.5, 0.5]，拖拽 500→750px 后变为 [0.75, 0.25]（左栏实际变宽、两栏和≈1），键盘 ArrowRight → [0.77, 0.23]，ArrowLeft 回到 [0.75, 0.25]。三栏（代码会话 三向合并 base·ours·theirs，2 个 separator）：初始 [0.3333, 0.3333, 0.3333]，拖拽第一条分隔条后 [0.3, 0.3667, 0.3333]，再拖第二条后 [0.3, 0.5, 0.2]，三条栏宽均实际变化且和为 1；断言基线/对比栏分隔条拖拽与键盘调整两条路径都成立。
