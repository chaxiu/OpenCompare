covers: ac-local-directory
标题: Electron 下可为左右各选真实本地目录并触发对比，Web 模式该动作有可理解降级
步骤: 1) `pnpm dev` 拉起 Electron，点击「选择左目录」/「选择右目录」各经原生对话框选一个真实目录；2) `pnpm dev:web` 在浏览器打开同一视图，观察左右选择控件
期望: Electron 下弹出原生目录对话框，选定后立即触发该目录与另一侧目录的对比并刷新双栏树与统计；Web 模式下「选择左目录」「选择右目录」明确禁用（或不可用）并给出可理解提示（说明 Web 预览无原生目录选择、请用「加载样本目录」），不假装能选真实目录

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: web 会话 5199 实测降级正确：「选择左目录」「选择右目录」均为 disabled（#v25/#v26 button disabled；DirectoryView.tsx:92/101 disabled={busy || !pickerAvailable}，Workbench 传 pickerAvailable={platform.kind==='electron'}）；「加载样本目录」可用（未 disabled）；降级提示文案存在「Web 预览模式没有原生目录选择，请使用「加载样本目录」体验真实对比；桌面端（pnpm dev）可直接选择本地目录。」未伪装可选真实目录。Electron 原生对话框一侧无桌面会话（平台=web），由代码证据（electron-platform selectDirectory + IPC）确认。
