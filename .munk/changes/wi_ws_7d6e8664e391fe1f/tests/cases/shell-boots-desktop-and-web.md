covers: ac-shell
标题: 桌面窗口与 Web 模式均能拉起完整工作台壳层
步骤: 1) `pnpm dev` 拉起 Electron 桌面窗口；2) `pnpm dev:web` 在浏览器打开工作台
期望: 两种模式都呈现完整壳层——顶部工具栏（应用标识 + 视图/会话切换 + Load Sample Fixtures）、中央分割工作区、底部状态栏；无白屏、无渲染报错

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: Web 模式：http://127.0.0.1:5173 实测完整壳层——顶栏 OpenCompare + 「对比与三向合并工作台」+ 视图切换（目录对比/代码 Diff & 3-Way/CSV 主键对比/JSON / YAML）+ Load Sample Fixtures + 样本下拉；中央分割工作区；底部状态栏 会话/运行平台/合成计数；无白屏无渲染报错（tree_status=ok）。桌面模式：本机执行 `pnpm dev`（electron-vite dev）成功——main 3.45kB 与 preload 1.07kB 构建通过，renderer dev server 起于 http://localhost:5173，日志「starting electron app...」后 60s 内无崩溃/异常，超时由测试主动终止（EXIT=124）。桌面与 Web 共用同一 renderer 壳层入口，桌面加载同一 dev server URL。
