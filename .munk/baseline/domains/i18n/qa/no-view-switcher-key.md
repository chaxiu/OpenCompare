covers: ac-view-switcher-key-gone
标题: 删除 `shell.viewSwitcher.label`，保留四个 `shell.view.*` 场景标签且中英键集合仍相等
步骤: 读 `messages/zh/shell.ts` 与 `messages/en/shell.ts` → 断言 `shell.viewSwitcher.label` 在两侧均不存在、`shell.view.directory|code|csv|structured` 两侧均非空 → 跑 `messages.test.ts` 的键集合 / 占位符 / 英文无汉字 / glossary 断言 → 渲染英文界面并查 `tablist`
期望: `shell.viewSwitcher.label` 在 zh / en 均为 `undefined`；四个 `shell.view.*` 键中英同时存在且值非空；两语言键集合完全相等，占位符与 glossary 约束保持绿；英文界面 `queryByRole('tablist', { name: 'Switch view' })` 为 `null`，仅剩「Sessions」等会话级 tablist

## 最近执行

- workItemId: wi_ws_e93fdbef0443dbcf
- at: 2026-10-31
- status: pass
- note: 本轮 `needSelfTest=false`，以 10 道 `code_gates` 为门槛（`.munk/runs/run_ws_1283bf9218f9c721/code-gates/attempts/001`）。`messages.test.ts` 新增 “drops the view switcher label but keeps the four scene labels” 用例（两侧 `undefined` + 四键 `toBeTruthy`）；`App.i18n.test.tsx` 的英文外壳用例改为缺席断言；`App.settings.test.tsx` 切语言后由「视图切换四标签顺序」改为「无视图切换 tablist + 会话 tablist 恰 4 个 tab」。`shellScan.test.ts`（`Workbench.tsx` 在清单内）零硬编码中文仍绿。
