# 目录视图快照导出/导入挂载与远端快照下钻体验

## 范围

在 `DirectoryView` / `Workbench` 上把前序 WI（`snapshot-core-and-fixtures`，已交付）的 `.ocsnap.json` 协议底座接成**用户可点的闭环**，不改协议与样本本身：

1. **左/右栏快照导出**：目录对比工具栏为左、右两栏各提供一键导出。该侧是真实目录时，扫描该侧目录树、构建快照（含 `size` / `modifiedMs` / `sha256`）并下载为 `<name>.ocsnap.json`；该侧已是挂载快照时，直接重新序列化该文档（round-trip）。导出结果必须能被 `parseSnapshot` 接受。
2. **左/右栏快照导入挂载**：左、右两栏各提供导入入口，选择本地 `.ocsnap.json` 文件后解析为快照并挂载到该侧，随即重算对比（支持 目录 vs 快照 与 快照 vs 快照）。非法文件必须给出可读错误并保持导入前的对比不变。
3. **来源状态标识**：面板标题/副标题/标签能区分该侧是「目录」还是「快照」，快照侧显示快照名称（如 `remote-prod`）与挂载点 `/snapshots/right/remote-prod`。
4. **内置「本地目录 vs 远端快照」样本一键加载**：目录对比工具栏新增入口，一键加载「内置本地样本目录（左）vs `REMOTE_SNAPSHOT`（右）」的对比，无需真实 SSH。
5. **下钻闭环**：快照侧差异文件双击后照常下钻到代码 / CSV / JSON / YAML 视图，内容来自快照内联文本；未内联内容的文件给出明确提示而不是空内容。左独有 / 右独有文件仍按现有语义渲染空侧。
6. **过滤与图例**：现有五态过滤（全部 / 仅差异 / 左独有 / 右独有 / 相同）与状态栏计数、图例对快照参与的对比同样生效。
7. **单测**：纯函数/编排单测 + jsdom 组件测试覆盖上述交互，全部随 `pnpm test` 运行。

## 验收

- ac-export-directory-snapshot: 对一侧真实目录点击导出，得到可被 `parseSnapshot` 接受的 `.ocsnap.json` 文本，条目数等于该侧文件数，每条含正确的 `size` / `modifiedMs` / `sha256`；可下钻的文本文件带内联 `content`，不可下钻文件（如 `assets/logo.png`）只有元数据 + 哈希。
- ac-import-mount-and-roundtrip: 把「导出本地样本目录」得到的文本通过左/右导入入口挂载后，该侧标识为快照（名称 + 挂载点），对比结果与该目录自比一致——全部 `same`，无差异计数。
- ac-import-invalid-rejected: 导入非快照 JSON 或损坏文本时，通知区给出可读错误，且左右两栏仍显示导入前的对比（不出现空树、不丢失会话）。
- ac-remote-sample-four-statuses: 一键加载「远端快照样本」后，本地样本目录 vs `remote-prod` 快照同时出现 `same` / `added` / `removed` / `modified` 四态（图例与状态栏可见），右栏标识为快照。
- ac-snapshot-filter: 在该对比上切换过滤：`仅差异` 不再显示 `parser.ts` 等 `same` 文件，`右独有` 只显示快照侧独有文件，`相同` 只显示同内容文件。
- ac-snapshot-drilldown: 双击快照侧差异文件按扩展名下钻到对应视图且内容来自快照内联文本：`src/core/engine.ts` → 代码视图、`src/data/report.csv` → CSV 视图、`config/deploy.yaml` → 结构化视图，会话标题/副标题指向该快照路径。
- ac-drilldown-not-inlined-hint: 双击快照中未内联内容的文件时给出明确提示（说明该快照未内联内容），不渲染空白对比。
- ac-snapshot-vs-snapshot: 左右两栏均挂载快照（可用内置样本与导入的快照组合）时对比仍正常产出，过滤器与双击下钻可用。
- ac-tests-and-gates: 新增/扩展的 jsdom 组件测试与纯函数单测通过，`pnpm test` / `pnpm lint` / `pnpm typecheck` 全绿，不降低既有测试。

## 非目标

- 不改 `@core` 快照协议、`compare` / `filter` / `sync` / `template` 引擎语义，不改 `@shared/fixtures` 既有样本内容与答案键（前序 WI 已定；`REMOTE_SNAPSHOT` 只消费，不重造）。
- 不改 `PlatformPort`、IPC channel、main / preload：**不新增 `selectFile`、不做原生保存对话框**；导入/导出全走 renderer DOM API。
- 不做拖拽导入、剪贴板粘贴导入、快照列表/多快照管理、快照合并、快照重命名。
- 不做 SSH / SFTP / 真实远端探测 / 远端增量刷新。
- 不做二进制或 base64 内联、gzip、加密、签名、多哈希算法、快照版本迁移。
- 不做导出粒度选项 UI（默认内联可下钻文本文件，一键完成，不弹对话框）。
- 不改目录同步、模板归位、代码 / CSV / 结构化视图的既有入口与语义；不重排工作台样本菜单与场景 tab。
- 不新增视觉 token、不新增组件风格、不大改布局。

## 实现约束

- 分层：快照挂载与对比编排放 `src/renderer/src/workbench/`（与 `directoryOps.ts` 同级的新模块，如 `snapshotOps.ts`），视图只接收 props / 回调；`@core`、`@shared` 保持零 DOM、零 Electron 依赖，本项不动它们。
- 复用前序适配层，不另造虚拟路径体系：`ComparisonSide`、`compareDirectorySides`、`SNAPSHOT_MOUNT_ROOT`、`snapshotToScannedTree`、`readSnapshotContent`、`serializeSnapshot`、`parseSnapshot`、`SnapshotFormatError.code` / `SnapshotContentError.code`；挂载时显式传 `mountPath`（`/snapshots/<left|right>/<name>`），下钻据此反向识别所属快照。
- 快照侧文件读取必须经挂载注册表（`readSnapshotContent`）；**禁止**把 `/snapshots/...` 路径传给 `PlatformPort`（web 端会 not-found）。工作台现有 `openFile` 的 `platform.readTextFile(node.leftPath)` 路径需按侧分流。
- 导入/导出只用 renderer DOM API（`<input type="file">` + `FileReader`；`Blob` + anchor 下载），因此 Electron（`contextIsolation` + `sandbox`）与 Web 双端行为一致，也让组件测试可在 jsdom 内驱动（`fireEvent.change` 一个 `File`）。
- 挂载状态（左右两侧是目录还是快照、快照文档、名称、挂载点）由 `Workbench` 持有并传到 `DirectoryView`；导入成功后立即用 `compareDirectorySides` 重算并复用既有 `ComparisonCache`；导入失败回滚到导入前状态。
- 左右两栏入口的可访问名必须可区分（如「导出左侧快照」/「导入右侧快照」/「远端快照样本」），以便组件测试用 role + name 精确点击，不依赖 `getAllBy*` 顺序。
- 文案中文，与现有工具栏一致；结果与错误都走既有通知区（`notice` / `noticeTone`），不新造 toast。
- 视觉只用现有 token 与基础组件（`ToolbarButton`、`Panel`、`SegmentedControl`、`SplitPane` 等），不写死颜色/尺寸；快照标识优先复用 `text-2xs text-content-muted` 等既有样式。
- 路径与样本常量复用 `DIRECTORY_SAMPLE_PATHS`、`REMOTE_SNAPSHOT`、`classifyFile`，不新增硬编码路径；导出文件名用快照 `name` + `.ocsnap.json`，导出文本一律走 `serializeSnapshot` 的规范形式以保证 round-trip。
- 单测遵循既有约定（`*.test.ts(x)` 与被测模块同目录；组件测试用 `// @vitest-environment jsdom` docblock + `@testing-library/react`）。
