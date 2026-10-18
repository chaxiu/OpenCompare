# OpenCompare 真实文件 IO 闭环 + GitHub 开源发布基线

## 范围

### A. 真实本地文件打开 / 保存（PlatformPort.selectFile / saveFile）

1. `src/shared/platform/types.ts` 的 `PlatformPort` 扩展 `selectFile` 与 `saveFile`：
   - `selectFile(options?)` 弹出打开文件对话框，返回所选绝对路径；取消返回 `null`。
   - `saveFile(options?)` 弹出保存对话框，返回目标绝对路径（由调用方随后写入）或由实现直接写入内容；取消返回 `null`。
   - options 至少支持 `title` 与扩展名 `filters`（如 `.txt/.csv/.tsv/.json/.yaml`）；`saveFile` 另支持 `defaultPath`。
2. 三处实现齐备且行为一致：
   - `src/main/platform/electron-platform.ts`：`dialog.showOpenDialog({ properties:['openFile'] })` / `dialog.showSaveDialog`，写盘走 `node:fs/promises`。
   - `src/preload/index.ts`：新增 channel 白名单桥接（channel 常量落在 `src/shared/platform/channels.ts`）。
   - `src/renderer/src/platform/web-platform.ts`：浏览器兼容实现（文件选择读取后物化到内存 FS；保存产出内容到内存 FS/触发下载），页面在无 Electron 时可用。
3. 三个文件视图顶栏提供可点击的「打开本地文件」（及必要时的「保存到本地」）：
   - `CodeView.tsx`：双栏 Diff 可分别打开左 / 右本地文件并即时刷新对比；三向合并可分别打开 base / ours / theirs 本地文件；冲突全部解决后可把合并结果保存到本地文件。
   - `CsvView.tsx`：可分别打开左 / 右本地 CSV / TSV 文件并重新按主键对齐。
   - `StructuredView.tsx`：可分别打开左 / 右本地 JSON / YAML 文件并重算语义对比。
4. 补齐单测：`electron-platform.test.ts`、`web-platform.test.ts`，以及视图层新增入口相关测试（沿用现有 `*.test.tsx` 结构）。

### B. GitHub 开源门面与跨平台自动化 Release

1. 根目录新增 `README.md`：定位（对标 Beyond Compare 的现代跨平台对比/三向合并工具）、双目录对比与增量同步、跨层级模板归位、快照协议、代码双栏 Diff 与 3-way Merge、千行 CSV 主键对齐、JSON/YAML 语义对比、本地开发（`pnpm dev` / `pnpm dev:web`）与构建打包说明。
2. 根目录新增 `LICENSE`（MIT）。
3. 配置 `electron-builder`（`package.json` 的 scripts/build 字段或独立 `electron-builder.yml`），声明 macOS / Windows / Linux 打包目标。
4. 新增 `.github/workflows/release.yml`：监听 `v*` tag，先跑门禁（install / lint / typecheck / test / build），再跨平台构建产物并发布到 GitHub Release。

## 验收

- ac-select-file: `PlatformPort.selectFile` 在两套实现中可用 —— Electron 走原生打开文件对话框，Web 兼容实现返回可选文件路径；取消时返回 `null` 且不抛错；均有单测覆盖。
- ac-save-file: `PlatformPort.saveFile` 在两套实现中可用 —— Electron 保存对话框 + 写盘，Web 兼容实现产出内容；取消返回 `null`；均有单测覆盖。
- ac-code-diff-open: CodeView 双栏 Diff 顶栏可分别打开左 / 右本地文本文件，打开后对比区立即按新内容刷新（差异块计数随之更新）。
- ac-code-merge-open: CodeView 三向合并模式可分别打开 base / ours / theirs 本地文件并重建合并模型与冲突列表。
- ac-code-merge-save: 三向合并冲突全部解决后，可经 `saveFile` 把合并结果保存到本地文件（未解决时该动作不可用）；保存后给出成功提示。
- ac-csv-open: CsvView 顶栏可分别打开左 / 右本地 CSV / TSV 文件，重新按主键对齐（对齐行数/主键提示更新）。
- ac-structured-open: StructuredView 顶栏可分别打开左 / 右本地 JSON / YAML 文件并重算语义差异；打开非 JSON/YAML 或解析失败时显示错误态而非崩溃。
- ac-readme: 根目录 `README.md` 覆盖 A/B 两部分的定位、核心能力清单与本地开发/构建打包说明。
- ac-license: 根目录 `LICENSE` 为 MIT 许可全文。
- ac-builder: `electron-builder` 已配置并可解析出 macOS / Windows / Linux 目标（配置存在于 `package.json` 或 `electron-builder.yml`）。
- ac-release-workflow: `.github/workflows/release.yml` 监听 `v*` tag，工作流中先执行门禁（lint / typecheck / test / build）再构建跨平台产物并发布到 GitHub Release。
- ac-no-regression: 内置样本主链路（目录对比与同步、样本双栏 Diff/三向合并、CSV 主键对齐、JSON/YAML 语义对比）无回归，`pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿。

## 非目标

- 不新增场景页 / 视图 / 设计语言；不改差异、对齐、合并算法本身；不重构现有样本库。
- 不做云端同步、账号体系、Tauri 迁移、自动更新（auto-update）。
- 不做代码签名 / 公证（codesign / notarize）与发布密钥托管；不在本地编译多平台产物。
- 不改现有视觉 token 与组件 API（仅复用 ToolbarButton / IconButton / Panel 等）。
- 不重写 `AGENTS.md`、不新增文档体系（除 README/LICENSE 外）。
- 不引入目录批量 IO、多文件选择、最近文件列表等顺手扩展。

## 实现约束

- 平台能力一律经 `PlatformPort`：renderer 禁止直接 `import` Electron；IPC channel 名统一收敛在 `src/shared/platform/channels.ts` 白名单，preload 只暴露该白名单。
- `src/core/` 保持零 Electron/DOM 依赖；文件对话框逻辑只落在 platform 层。
- `/samples` 内置样本挂载维持只读，打开/保存本地文件不得改动样本挂载或样本会话。
- 取消与错误处理：对话框取消返回 `null`（不抛异常）；读取/写入失败给出可读提示、不静默失败。
- UI 复用现有 `ToolbarButton` / `IconButton` 与 token，不写死颜色尺寸。
- 新增单测并入现有 `pnpm test`；`code-gates.json` 的 install/lint/typecheck/build/build:web/test 必须继续通过。
- release 工作流以 `v*` tag 触发；跨平台构建交给 CI，不在本地编译多平台。
- 包管理固定 `pnpm`（`pnpm@10.18.3`）。
