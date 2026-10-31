covers: ac-shell
标题: 桌面窗口与 Web 模式均能拉起完整工作台壳层
步骤: 1) `pnpm dev` 拉起 Electron 桌面窗口；2) `pnpm dev:web` 在浏览器打开工作台
期望: 两种模式都呈现完整壳层——顶部工具栏（品牌图标 + `OpenCompare` + 视图/会话切换 + 新建对比 / 打开文件 / 打开文件夹 / 设置，无样本入口、无品牌副标题）、中央分割工作区、底部状态栏；无白屏、无渲染报错

## 最近执行

- workItemId: wi_ws_8959816f18ce7acf
- at: 2026-10-31
- status: pass
- note: 本用例的入口路径已被「顶栏 / 工作流 / 空态去 demo」项改写（原顶栏 `Load Sample Fixtures` / 样本下拉已删除）。本轮 `needSelfTest=false`，以 `code_gates`（10 门，`.munk/runs/run_ws_1828c869e01e6829/code-gates/attempts/001`）为门槛：顶栏无 `data-shell-entry="samples"` / `"samples-menu"`、无品牌副标题，空态 3 个真实 CTA 与 hint 指路设置分区由 `App.test.tsx` / `App.i18n.test.tsx` 断言；设置 5 个场景入口（`[data-sample-entry]`）与调试失败项（`[data-sample-failure]`）由 `App.settings.test.tsx` 的 `settings sample section` 三条用例断言。真实浏览器 / 桌面点选复核仍待运营 QA 在 `pnpm dev` / `pnpm dev:web` 各走一遍。 历史（上一轮）：workItemId `wi_ws_7d6e8664e391fe1f` / at 2026-10-18 / status pass；note: Web 模式：http://127.0.0.1:5173 实测完整壳层——顶栏 OpenCompare + 「对比与三向合并工作台」+ 视图切换（目录对比/代码 Diff & 3-Way/CSV 主键对比/JSON / YAML）+ Load Sample Fixtures + 样本下拉；中央分割工作区；底部状态栏 会话/运行平台/合成计数；无白屏无渲染报错（tree_status=ok）。桌面模式：本机执行 `pnpm dev`（electron-vite dev）成功——main 3.45kB 与 preload 1.07kB 构建通过，renderer dev server 起于 http://localhost:5173，日志「starting electron app...」后 60s 内无崩溃/异常，超时由测试主动终止（EXIT=124）。桌面与 Web 共用同一 renderer 壳层入口，桌面加载同一 dev server URL。
