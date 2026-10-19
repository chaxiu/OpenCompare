# 顶栏常驻「新建对比」与免弹窗路径直传会话

## 范围

1. **顶栏常驻「新建对比」入口**（`src/renderer/src/workbench/Workbench.tsx`）：冷启动空态与已有会话时都可见可点，不因已有会话消失；不替换、不隐藏既有「打开文件 / 打开文件夹」。
2. **「新建对比」对话框**：左右两个路径输入框（可直接键入或粘贴）+「打开文件」+「打开文件夹」三个动作；`Cmd/Ctrl+N` 打开、`Enter` 提交、`Esc` 关闭，焦点落在左侧输入框。
3. **手工路径直传链路**：直接复用前序 WI 冻结的 `parseManualPaths` + `resolveCompareRequest`（`src/shared/compareRequest.ts`，probe 走 `PlatformPort.statPath`），把规范化 + 校验后的请求落到**既有**会话构建函数——`kind: 'file'` → 既有 `openFilePair`（内部 `openFilePairSession`），`kind: 'directory'` → 既有 `runSidesCompare(directorySides(left, right))`。不新增第二套解析、校验或会话模型。
4. **错误就地提示**：校验失败/会话构建失败时在对话框内展示中文原因，会话列表、当前 tab 与视图状态保持不变，不建空白 tab、不替换现有会话。
5. **文件会话原位写回**：代码/文本 Diff 会话的「保存左文件 / 保存右文件」改为直接 `platform.writeTextFile(已加载路径, 工作文本)`，不再弹出系统保存对话框；写回路径与会话副标题保持加载时的真实路径。
6. **回归保留**：拖拽双路径、标签切换保留工作副本与脏标记、目录下钻与「返回上级目录视图」行为不变。

## 验收

- ac-new-compare-always-visible: 空态（`status === 'empty'`，无会话）与已有会话（sessions 数 > 0）两种状态下，顶栏都存在可点击的「新建对比」按钮；仅 `directoryBusy` 期间为 disabled。
- ac-dialog-three-actions: 点击「新建对比」后出现 `role="dialog"` 且可访问名含「新建对比」的对话框，内含「左侧路径」「右侧路径」两个输入框与「打开文件」「打开文件夹」两个按钮；点击「打开文件」依次触发两次 `selectFile` 并落到既有 `openFilePair`，点击「打开文件夹」依次触发两次 `selectDirectory` 并落到既有 `runSidesCompare`。
- ac-shortcut-open-close: 按下 `Cmd+N`（非 macOS 为 `Ctrl+N`）打开对话框且不重复打开；对话框内按 `Esc` 关闭，`sessions` 数量与 `activeId` 不变；输入框内 `Cmd/Ctrl+A` 等编辑快捷键不被拦截。
- ac-submit-enter: 在任一输入框内按 `Enter` 提交一次；提交进行中提交按钮 disabled，再次按 `Enter` 不发起第二个请求。
- ac-manual-file-pair-session: 在 web 端口已写入 `/memory/左 a.txt` 与 `/memory/右 b.txt` 后，于对话框填入这两个路径并提交 → 对话框关闭，会话数 +1，新会话 `scene === 'code'` 且 `activeId` 指向它，会话 subtitle 同时包含这两个绝对路径。
- ac-manual-directory-pair-session: 填入两个已存在的真实目录并提交 → 会话数 +1，新会话 `scene === 'directory'` 且为当前 active，渲染既有目录对比视图（含两侧目录名）。
- ac-manual-quoted-whitespace: 输入 `"  /memory/左 a.txt  "` 这类带成对引号与首尾空白的值，提交后 `statPath`/`readTextFile` 收到的是去掉引号与空白的路径，会话 subtitle 不含引号。
- ac-manual-tilde-relative: 平台提供 `homeDir=/Users/demo`、`baseDir=/memory` 时，`~/项目/a.txt` 与相对路径 `a.txt` 分别落到 `/Users/demo/项目/a.txt`、`/memory/a.txt` 并建成会话（与 `resolveCompareRequest` 的既有规范化语义一致）。
- ac-no-native-dialog-on-submit: 手工输入提交全程 `selectFile`、`selectDirectory`、`saveFile` 的调用次数均为 0。
- ac-adds-tab-keeps-existing: 先打开一个会话，再通过手工路径建立新会话 → tab 数 +1，旧会话仍在原顺序位置且 title/subtitle 不变，新会话为 active。
- ac-error-not-found-inline: 右侧路径不存在时，对话框保持打开，`role="alert"` 文本含「右侧」与原始右侧路径；会话数不变，不新增 tab。
- ac-error-empty-inline: 只填左侧、右侧留空时，提示含「右侧」与「路径为空」，且未对任一侧调用 `statPath`，会话数不变。
- ac-error-type-mismatch-inline: 左侧文件、右侧目录时，提示同时含两侧路径且含「类型不一致」，会话数不变。
- ac-error-unsupported-inline: 两侧为 `a.bin` / `b.bin` 时，提示含「不支持」并列出「代码/文本」「CSV/TSV」「JSON/YAML」，会话数不变。
- ac-error-mixed-family-inline: 两侧同为文件但家族不同（如 `.json` ↔ `.yaml`）时，提示含「两侧文件类型不一致」，会话数不变、不产生空白 tab。
- ac-failure-keeps-active-view: 已有会话在屏时提交失败，提交前后 `sessions` 长度、`activeId`、状态栏文本与当前视图内容一致。
- ac-repeat-submit-single-tab: 同一对路径在提交完成后再次提交 → 该会话 id 仍只有一个 tab，`activeId` 不变（走既有 upsert 语义）。
- ac-save-left-in-place: 代码会话中覆写左侧后点「保存左文件」→ 以加载时的左侧路径调用一次 `writeTextFile`，`saveFile` 调用 0 次，提示含「已写回」与该左侧路径；随后 `readTextFile` 得到修改后文本，左侧路径不变，左侧脏标记清除。
- ac-save-right-in-place: 右侧对称：`writeTextFile` 收到加载时的右侧路径与工作文本，`saveFile` 0 次，右侧脏标记清除，路径不变。
- ac-save-error-keeps-dirty: `writeTextFile` 抛错（如只读样本挂载）时，展示含原因的错误提示，该侧脏标记保留，`saveFile` 仍为 0 次，其他会话与当前视图不受影响。
- ac-export-merge-save-still-dialog: 目录快照「导出」与三向合并「保存合并结果」仍走 `saveFile` 对话框语义，未被原位写回改动影响。
- ac-drag-drop-regression: 向窗口拖入两个同类真实路径仍按既有 `handleDroppedFiles` 建立会话（一文件一目录时提示且不建会话），不依赖新建对比对话框。
- ac-drilldown-return-regression: 目录会话下钻文件得到文件会话后，点「返回上级目录视图」回到来源目录会话，过滤/折叠/选中状态保持。
- ac-tab-switch-keeps-buffer: 由手工路径建立的两个代码会话来回切换后，未保存工作副本与脏标记均保留，切回时视图显示的是工作副本。

## 非目标

- 不做启动参数、`opencompare://` 协议注册、`open-url` / `second-instance` 接管、单实例锁与请求队列（属后续注入项）。
- 不做品牌图标、打包配置、版本收敛、CHANGELOG / Release Notes、签名公证与发版闭环。
- 不改对比算法（text / directory / csv / structured / snapshot）与 `WorkbenchSession`、`ComparisonSides`、`session.ts` 结构；不加新的 session/scene 概念。
- 不改拖拽、标签切换、下钻、返回、未保存关闭确认的既有语义，只做回归保留。
- 不改三向合并结果保存与目录快照导出的对话框行为。
- 不做「最近打开」列表、路径补全、路径历史、书签、字段级内联校验样式或顶部 notice 改版；错误只用对话框内一行 `role="alert"`。
- 不做 viewer 之外的视图改版、主题、快捷键体系重构、样例库扩充。
- 不做真实文件系统端到端验收、桌面点选或打包应用验证（由 product-qa 批次门覆盖）。
- 不引入新依赖，不做路径沙箱/根目录白名单策略。

## 实现约束

- 手工输入的唯一校验入口是 `src/shared/compareRequest.ts` 的 `parseManualPaths` + `resolveCompareRequest`（probe 直接用 `PlatformPort.statPath`）；禁止在 renderer 另写解析、规范化或错误码，错误文案直接使用 `error.message`。
- `homeDir` / `baseDir` 必须由平台显式提供：允许在 `PlatformPort` 增加只读查询（如 `homeDirectory()` / `workingDirectory()`），Electron 实现用 `app.getPath('home')` / `process.cwd()`，Web 实现返回固定基准；新增 channel 只进白名单，preload 不暴露 Node，两个实现单测保持同构。
- 会话创建只复用既有入口：file → `openFilePair`（内部 `openFilePairSession` 完成文件家族一致性校验），directory → `runSidesCompare(directorySides(left, right))`；`upsertSession` / `activeId` 状态机不改。
- 失败路径严格「不建会话」：不 `setSessions`、不 `setActiveId`、不改 `status`，仅把错误写进对话框本地状态。
- 保存改为 `platform.writeTextFile(loadedPath, content)`，成功后把 `leftSource` / `rightSource` 更新为写回文本以清除脏标记；删除 `CodeView` `save()` 中的 `saveFile` 分支；`saveFile` 仍保留给快照导出与合并结果保存。
- 顶栏既有「打开文件 / 打开文件夹」按钮（空态与有会话时）全部保留（`App.test.tsx` 既有断言依赖）；空态新增「新建对比」为主按钮，不删除原两按钮。
- UI 只用 `src/renderer/src/components/` 现有 `Dialog` / `ToolbarButton` / `IconButton` 与 `main.css` token，不写死颜色与尺寸，不新增设计系统。
- 测试用 vitest + jsdom（`// @vitest-environment jsdom`）与 `createWebPlatformPort()`：新增/更新 `src/renderer/src/App.test.tsx`、`src/renderer/src/views/CodeView.test.tsx`（后者现有 `saveFile` 断言需改为 `writeTextFile`）。
- 门禁沿用 `.munk/code-gates.json`：install / lint / typecheck / build / build:web / test 全绿。
