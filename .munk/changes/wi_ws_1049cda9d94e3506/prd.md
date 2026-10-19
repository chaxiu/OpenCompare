# 启动参数与 URL scheme 注入 + 单实例接管

## 范围

1. **单实例锁**（`src/main/index.ts`）：在任何窗口创建之前 `app.requestSingleInstanceLock()`；拿不到锁的实例立即 `app.quit()`，不建窗口、不注册 IPC handler；持锁实例监听 `second-instance` 接管第二次启动。
2. **启动源收集与校验（主进程纯编排）**：从冷启动 `process.argv`、`second-instance` 的 argv、macOS `open-url` 三种来源取到一条对比请求：
   - argv 中含以 `opencompare://` 开头的元素时按 URL 解析（不被当作路径位置参数），多个 URL 以最后一个为准；
   - 否则按 argv 解析（`--left/--right`、`=` 形式、裸双路径、无关开关忽略）；
   - 解析与校验**只复用**前序冻结的 `parseCompareArgv` / `parseCompareUrl` / `resolveCompareRequest`（`src/shared/compareRequest.ts`），主进程注入 `homeDir` 与 `baseDir`；探测复用与 IPC `statPath` 相同的实现（含 `/samples` 只读挂载）。
3. **协议注册与接管**：`app.setAsDefaultProtocolClient('opencompare')`（非打包态带 `process.execPath` 与 app 入口参数）；macOS `open-url` 在 `app.whenReady()` 之前注册，早于窗口的 URL 入队。
4. **待处理请求队列 + 窗口投递**：窗口/renderer 未就绪时请求入队；renderer 订阅完成并发出 ready 信号后按入队顺序逐个投递，每个请求恰好一次。窗口不存在则先复用既有 `createWindow` 创建；已存在则 `restore()`（最小化时）→ `show()` → `focus()`。
5. **preload 白名单事件流**：只经 `contextBridge` 暴露「订阅注入请求」与「renderer ready」两项能力，channel 常量统一放 `src/shared/platform/channels.ts`，不暴露 Node / `ipcRenderer`。
6. **renderer 落地**：`Workbench` 挂载时订阅一次、卸载时退订；成功 payload 走**既有** `openCompareRequest`（file → `openFilePair`，directory → `runSidesCompare`），失败 payload 只走既有 notice 提示，`sessions` / `activeId` 不变、不建空 tab。
7. **打包协议声明**：`electron-builder.yml` 顶层 `protocols` 声明 `opencompare` scheme（mac 打包即生成 `Info.plist` 的 `CFBundleURLTypes`），Linux desktop entry 声明 `x-scheme-handler/opencompare`；在 `src/main/release-packaging.test.ts` 增量断言，既有断言不改。

## 验收

- ac-single-instance-lock: 启动编排以注入的锁结果 `false` 运行时，`quit()` 被调用一次，`createWindow` 与 IPC 注册调用次数均为 0；锁结果为 `true` 时才开始注册与建窗。
- ac-second-instance-focus: 已有窗口时收到 `second-instance` → 现有窗口 `restore`/`show`/`focus` 被调用，`createWindow` 调用 0 次，不新开窗口。
- ac-second-instance-base-dir: `second-instance` 携带的相对路径以该事件的 `workingDirectory` 作为 `baseDir` 解析；冷启动以进程 cwd 作为 `baseDir`（两者都不读 `process.env` 之外的隐式来源）。
- ac-argv-prefix-stripped: 传入以 `process.execPath` 开头的 argv（dev 下还含 app 入口参数）时，该前缀被移除；随后的裸双路径仍解析为左、右两路径。
- ac-url-in-argv-wins: argv 同时含 `--left/--right` 与 `opencompare://compare?…` 时按 URL 解析；含两个 `opencompare://` 时以最后一个为准；URL 内容不被当作路径侧值。
- ac-cold-start-queued-until-ready: renderer 未 ready 时投递请求 → 发送 0 次且队列长度 1；ready 之后发送 1 次，payload 为解析后的 `CompareRequest`（左右路径与 kind 完整）。
- ac-queue-order-once: ready 前连续入队两个有效请求 → ready 后按入队顺序发送两次，队列清空；再次收到 ready 不重复发送。
- ac-no-args-no-injection: 冷启动 argv 无 `--left/--right`、无 `opencompare://`、位置参数不足两个 → 不产生 payload（发送 0 次），窗口照常创建。
- ac-invalid-args-error-only: argv 只有 `--left=/tmp/a.txt` → 发送 `{ ok: false, message }`，`message` 含「右侧」；不产出 `request`。
- ac-open-url-queued: `open-url` 在 ready 之前触发时 URL 入队，ready 后发送一次，解码后的路径与输入逐字符一致（含空格与中文）。
- ac-not-found-error-only: URL 指向不存在的路径 → 发送 `{ ok: false, message }`，`message` 含「不存在」与该侧原始路径；不产出 `request`，窗口仍然被聚焦。
- ac-type-mismatch-error-only: 左侧文件、右侧目录 → `message` 含「类型不一致」，不产出 `request`。
- ac-create-window-when-none: 收到有效请求时没有窗口（macOS 全部窗口关闭后）→ 先用既有 `createWindow` 建窗，再在 ready 后投递一次。
- ac-renderer-file-request-session: 通过测试端口注入 `{ ok: true, request: { kind: 'file', left: '/memory/左 a.txt', right: '/memory/右 b.txt' } }` → 会话数 +1，新会话 `scene === 'code'` 且为 active，`selectFile` / `selectDirectory` / `saveFile` 调用次数均为 0。
- ac-renderer-directory-request-session: 注入 `kind: 'directory'` 的有效请求 → 会话数 +1，新会话 `scene === 'directory'` 且为 active。
- ac-injection-same-session-as-manual: 对同一对路径，先经注入建立会话，再清空后用「新建对比」手工输入同一对路径 → 两次会话 id 相同（同一套 `upsertSession` 语义），tab 总数为 1。
- ac-renderer-error-notice-no-session: 注入 `{ ok: false, message: '右侧路径不存在：/nope' }` → 界面出现该 notice 文本，`sessions` 长度与 `activeId` 与注入前一致，不新增 tab。
- ac-subscribe-once: `Workbench` 在 React StrictMode 下挂载后只保留一个有效订阅；注入一次请求只建立一个会话（不重复建会话、不重复 notice）。
- ac-unsubscribe-on-unmount: 组件卸载后注入请求 → 不建会话、不改 notice（订阅已释放，且不抛异常）。
- ac-ready-after-subscribe: 测试端口记录调用顺序时，`ready` 信号发生在订阅注册之后；订阅注册前到达的请求由队列持有并在 ready 后补投。
- ac-preload-whitelist: preload 只通过 `contextBridge.exposeInMainWorld('openComparePlatform', …)` 暴露 `PlatformPort` 与上述两项能力，channel 名全部来自 `PLATFORM_CHANNELS`；`window` 上不存在 `ipcRenderer`、`require`、`process`。
- ac-web-platform-parity: Web `PlatformPort` 实现提供同构桩——`onCompareRequest(listener)` 返回可调用的 unsubscribe 且不抛错，`compareRequestsReady()` resolve；与 Electron 实现的签名、payload `CompareRequest` 类型一致。
- ac-builder-protocol-config: 解析 `electron-builder.yml` 后存在顶层 `protocols`，其中一项 `schemes` 含 `opencompare` 且 `name` 非空；`linux.desktop.entry.MimeType` 含 `x-scheme-handler/opencompare`；新增断言在 `release-packaging.test.ts` 中且既有断言未被删除或放宽。
- ac-protocol-client-registered: 主进程以 `'opencompare'` 调用 `app.setAsDefaultProtocolClient`；非打包态额外传入 `process.execPath` 与 app 入口参数（由注入的 `isPackaged` 决定，测试可断言两种入参形态）。
- ac-no-second-parser: 主进程启动源处理只调用 shared 的 `parseCompareArgv` / `parseCompareUrl` / `resolveCompareRequest`（测试以 spy 断言被调用），不出现第二份百分号解码、去引号、`~` 展开或相对路径拼接实现。

## 非目标

- 不做 UI 新增：不加「来源标签」「最近打开」「注入成功 toast」、不改 notice 样式、不新增对话框或设置项；失败提示沿用既有 workbench notice。
- 不改会话模型：`WorkbenchSession` / `ComparisonSides` / `session.ts` / `upsertSession` 不新增类型或场景，`openFilePair`、`runSidesCompare`、`openCompareRequest` 的签名与语义不变。
- 不做多请求并发多窗口、不做「每次注入都新开窗口」；同一时刻只有一个主窗口。
- 不扩展协议语义：只支持 `opencompare://compare?left=&right=`；不做 merge/browse 等其它 action，不支持 `kind=`、`title=`、`line=` 等额外 query。
- 不做 Windows / Linux 真机注册表与桌面文件实测，不读取打包后的真实 `Info.plist`（由 product-qa 批次门按 overview §5.5 覆盖）。
- 不改 `release.yml` 发布模型、签名/公证、`appId`、`productName`、版本号、CHANGELOG / Release Notes。
- 不改对比算法、目录扫描、原位写回/导出、拖拽、快捷键、标签切换与下钻行为。
- 不做 `needSelfTest`（保持 false），不做桌面点选验收。
- 不新增运行时或开发依赖，不引入 electron-builder 之外的新打包工具。

## 实现约束

- **测试可及的分层**：主进程启动编排拆成两半——可注入依赖的纯编排模块（不 import Electron 运行时；注入 `probe` / `focusWindow` / `hasWindow` / `createWindow` / `send` / `setProtocolClient` / `quit` / `isPackaged` / `execPath` / `appPath` 等）与 `src/main/index.ts` 中的 Electron 绑定。纯编排模块必须能被 vitest 在 node 环境直接导入断言；不要把队列/去重逻辑写进无法单测的 `whenReady` 回调里。
- **时序硬约束**：`requestSingleInstanceLock()` 在任何 `BrowserWindow` 创建与 `registerPlatformIpc()` 之前执行；`open-url` 监听在 `app.whenReady()` 之前注册（macOS 冷启动 URL 会早于 ready 到达）；`second-instance` 监听在持锁后立即注册。
- **解析唯一入口**：只用 `src/shared/compareRequest.ts` 的 `parseCompareArgv` / `parseCompareUrl` / `resolveCompareRequest`。主进程注入 `homeDir = app.getPath('home')`、`baseDir = process.cwd()`（冷启动）或 `second-instance` 事件的 `workingDirectory`；shared 层仍不读环境变量。
- **探测复用**：把 `src/main/platform/electron-platform.ts` 内的 `statPath`（含 `/samples` 挂载语义）提取为可复用函数，IPC handler 与启动注入共用同一实现，禁止第二份 `fs.stat` 分支导致 `/samples` 与权限语义漂移。
- **argv 前缀清理**：主进程把 `process.argv` 交给解析前，先去掉 `process.execPath`，并在 `process.defaultApp` 为真时再去掉 app 入口参数，避免污染裸双路径位置参数；清理逻辑放在纯编排模块内，可单测。
- **IPC 契约**：channel 名只加到 `src/shared/platform/channels.ts`（一个 main→renderer 的事件 + 一个 renderer→main 的 ready invoke）。payload 是判别式联合：成功携带已解析探测完成的 `CompareRequest`，失败只携带可读中文 `message`；不把原始 argv/URL、异常对象或文件系统细节穿过 IPC。
- **PlatformPort 扩展为可选成员**（避免破坏既有测试端口）：`onCompareRequest(listener): () => void` 与 `compareRequestsReady(): Promise<void>`（命名可微调，语义固定）。Electron 实现经 preload 白名单桥接；Web 实现提供 no-op 桩；renderer 在缺失时按「无注入」处理且不报错。
- **preload 安全**：仍只用 `contextBridge.exposeInMainWorld('openComparePlatform', …)`，不解除 `contextIsolation` / `sandbox`，不暴露 `ipcRenderer` 本体，事件回调只在订阅后转发。
- **renderer 只订阅一次**：订阅放在 `Workbench` 的挂载副作用中，cleanup 退订；ready 在订阅注册之后发出一次（StrictMode 双挂载允许重复发 ready，但队列必须保证请求只投递一次）。成功回调直接调用既有 `openCompareRequest(request, onError)`，失败回调走既有 `report(message)`；失败时不得 `setSessions` / `setActiveId` / 改 `status`。
- **窗口聚焦顺序**：`isMinimized()` → `restore()`，随后 `show()`、`focus()`；无窗口时先创建再入队投递，投递仍等 renderer ready。
- **打包声明最小改动**：`electron-builder.yml` 只加顶层 `protocols`（`name` + `schemes: ['opencompare']`）与 `linux.desktop.entry.MimeType`，不改 `mac.identity` / `notarize` / `hardenedRuntime` / `publish` / targets；断言以增量 `describe` 追加进 `src/main/release-packaging.test.ts`。
- **测试布局**：新增纯编排单测放 `src/main/*.test.ts`（node 环境）；renderer 订阅与落地用 `// @vitest-environment jsdom` 的 `App.test.tsx` / `Workbench` 测试与 `createWebPlatformPort()` 或手写端口 stub；`web-platform.test.ts` 补同构桩断言。门禁沿用 `.munk/code-gates.json`（install / lint / typecheck / build / build:web / test）全绿。
- 不新增依赖；不写 `tech.md`，正式技术方案由 Coding 依上述约束落地。
