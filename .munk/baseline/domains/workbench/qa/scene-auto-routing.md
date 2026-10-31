covers: ac-no-view-switcher-dom, ac-app-header-actions-unchanged, ac-open-directory-scene, ac-open-file-pair-scene-by-kind, ac-open-file-pair-rejects, ac-drilldown-child-session, ac-tab-shows-scene-type, ac-app-row-budget-recomputed, ac-session-tab-drives-view
标题: 顶栏无 scene 分段控件；打开文件夹 / 文件对 / 目录下钻各自落位，会话 tab 显示类型并驱动视图
步骤: 渲染 `Workbench`（空态与 ready 态）→ 断言顶栏无 tablist 与入口集合 → 纯函数调用 `createDirectorySession` / `classifyFile` / `openFilePairSession` / `createDrilldownSession` → 经设置「示例与调试」起 4 个场景会话 → 逐个点击 `[data-session-tab]` 并读 `svg[data-icon]` 与对应视图 tablist → 读 `TOOLBAR_ROWS` 的 `app-actions` 行与三档 `measureToolbar(tier, 'app')`
期望: 中英均查不到「视图切换 / Switch view」tablist，且 `[data-shell-level="app"]` 内 `[role="tablist"]` 计数为 0；ready 态入口 = new-compare / open-file / open-folder / settings，空态 = new-compare / settings；打开文件夹落 `directory`，文件对按类型落 `code` / `csv`（两侧 `adhoc.tables` 就位）/ `structured`（`adhoc.format === 'json'`），`.json ↔ .yaml` 与 `.bin` 抛 `FilePairError`（`mixed-family` / `unsupported-type`）且 `readTextFile` 零调用；下钻子会话 `scene === target.kind`、`parentDirectoryId` 保留、`id` 以 `file:${parentId}::` 开头；4 个 tab 图标依次 folder-tree / file-code-corner / table-2 / braces 且不随活动态变化；点击各 tab 分别出现代码 / CSV 过滤 / 结构化格式 / 目录过滤 tablist；`APP_ROW.controls` = `['brand']`，三档 `required` 较 734 / 948 / 948 各少 444px 且 `fits === true`

## 最近执行

- workItemId: wi_ws_e93fdbef0443dbcf
- at: 2026-10-31
- status: pass
- note: 本轮 `needSelfTest=false`，以 10 道 `code_gates` 为门槛（`.munk/runs/run_ws_1283bf9218f9c721/code-gates/attempts/001`，`pnpm test` 91 files / 1361 passed + 1 skipped）。已落 jsdom 断言（`App.test.tsx` 顶栏无 tablist / 入口集合 / 会话 tab 类型图标与点击驱动、`App.i18n.test.tsx` / `App.settings.test.tsx` / `App.smoke.test.tsx` 的视图切换断言改道）与纯函数断言（`directoryCompare.test.ts` 的 scene 归属与拒绝语义、`shellLayout.test.ts` 的 `APP_ROW` 重算）。真实浏览器 / 桌面点选（顶栏删控件后的视觉留白、tab 类型图标光学尺寸）仍待运营 QA 在 `pnpm dev` / `pnpm dev:web` 各走一遍。
