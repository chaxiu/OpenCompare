covers: ac-open-two-dirs
标题: 空首屏「打开文件夹」经系统选择器依次选两个真实目录后建立目录对比会话
步骤: 1) 在磁盘准备两个真实目录，各自含若干文件且存在新增 / 删除 / 修改差异（例如 left/ 与 right/）；2) 冷启动进入空首屏，点击主 CTA「打开文件夹」；3) 在系统目录选择器中先选左侧目录、再选右侧目录；4) 观察会话标签 subtitle、目录树内容与底部状态栏计数
期望: 建立目录对比会话：会话 subtitle 精确展示这两个真实目录路径（非内置样本路径，如不出现 /samples/directory/…）；目录树内容来自真实文件系统（能看到真实目录内的文件与差异语义徽标）；状态栏按真实对比结果给出相同 / 新增 / 删除 / 修改计数；全程未加载任何样本。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: na
- note: 本通道不可表征（web-isolated / platform web）。实测：冷启动空首屏点主 CTA「打开文件夹」→ **不弹出任何系统/原生目录对话框**（无 input[type=file]、无 prompt），立即建会话 tab「memory ↔ memory」、subtitle「/memory ↔ /memory」；目录树两侧根行「折叠 memory」徽标为「相同」且无子项；footer「会话 directory:/memory ↔ /memory · 相同 0 / 新增 0 / 删除 0 / 修改 0 · 文件（源）0 / 文件（目标）0 · 差异 0」；subtitle 既无 /samples 也无真实 OS 路径，两侧为同一虚拟根（自比较）。根因：web PlatformPort 的 selectDirectory 固定返回 '/memory'（src/renderer/src/platform/web-platform.ts:213 / ROOT='/memory'），浏览器通道没有系统目录选择器，故「依次选两个真实目录」无法在本通道执行；应用在会话内确有一句说明文案「Web 预览模式没有原生目录选择，可用『加载演示目录』查看目录对比；桌面端（pnpm dev）可直接选择本地目录。」（仅在会话建立后出现，空态无提示）。注：该记录里引用的「加载演示目录」提示文案已在 wi_ws_8959816f18ce7acf（2026-10-31）改为指路「设置 → 示例与调试」/ 桌面端选择器，目录选择语义未变。本 AC 的真实选择器口径需由 Electron 桌面窗口（pnpm dev）自测复核；两真实目录落点逻辑另有组件测试覆盖（App.test.tsx「opens two real folders and labels the session with both roots」：两 roots 的 subtitle + 目录树内容 + 第二次打开新增独立标签）。
