# 真实修改原位保存回磁盘与结果导出为文件产物

本项是「OpenCompare 生产级可用与合规发布」五步主链路的收口（AGENTS.md 第四节五步之 5）：**真实文件会话的修改必须能原位写回磁盘，结果导出必须经系统保存对话框落为可复现文件产物，不再无声下载**。

现状证据（已核对仓库）：
- `PlatformPort.saveFile` 已就位（`src/shared/platform/types.ts`）：Electron 走 `dialog.showSaveDialog` 真实写盘（`src/main/platform/electron-platform.ts`），Web 内存写 + best-effort 下载（`src/renderer/src/platform/web-platform.ts`）。
- 合并结果导出已走 `platform.saveFile`（`src/renderer/src/views/CodeView.tsx` 的 `saveText`，默认名 `merged.txt`）。
- **但目录快照导出仍是 Blob 无声下载**：`snapshotOps.downloadSnapshotFile`（`URL.createObjectURL` + anchor），由 `Workbench.handleExportSnapshot` 调用（`src/renderer/src/workbench/Workbench.tsx`）。
- **代码 Diff 的修改（「覆写到右 / 覆写到左」）只改视图内工作副本**（`CodeView.CodeDiffView` 的 `leftText`/`rightText`），没有脏标记、没有任何写回磁盘的动作；整仓无 `dirty`/编辑/未保存标记。
- 本项是 `session-tabs-lifecycle` 的前置：脏标记状态在本项建立，会话关闭提示不在本项。

## 范围

1. **文件级对比会话的编辑与脏标记（真实文件会话）**
   - 代码双栏 Diff 会话支持修改某一侧内容：修改手段沿用既有「覆写到右 / 覆写到左」逐块覆写与「重置」，不新造编辑器。
   - 任一侧「已修改（未保存）」= 该侧当前工作文本 ≠ 从磁盘载入的原始文本；覆写后立即进入该状态，重新覆写回原内容或点「重置」后清除。
   - 「已修改」必须在视图内可见（明确指出是左/右哪一侧未保存），并把会话级 dirty 状态上报到 `workbench/session.ts` 的会话模型，供后续会话关闭提示复用。
2. **原位保存回磁盘**
   - 对已修改的一侧提供「保存」动作：经 `PlatformPort.saveFile` 打开系统保存对话框，`defaultPath` 预填该侧的真实磁盘路径（原位），`content` = 当前工作文本；写入成功后清除该侧脏标记并提示已写回的路径。
   - 在保存对话框取消：磁盘不变、脏标记保持、不报错刷屏。
   - 只读路径（内置样本库）写入被平台拒绝时，按既有提示语气明确报错，脏标记不变。
3. **结果导出为文件产物（一律经系统保存对话框）**
   - 目录快照导出（左/右）：由当前 `downloadSnapshotFile`（Blob + anchor 无声下载）改为 `PlatformPort.saveFile`，默认名 `<name>.ocsnap.json`，过滤器含 `.ocsnap.json`；成功提示落盘路径，取消不报错。
   - 合并结果导出：既有「导出合并文本」保持经 `PlatformPort.saveFile`（默认名可沿用 `merged.txt` 或按 ours/theirs 文件名给更贴切的默认名，由实现定）。
   - Web 运行时行为保持可用（`saveFile` 仍为内存写 + best-effort 下载），导出逻辑不得只在 Electron 生效。
4. **保持既有危险动作确认语义**：目录同步 Dry-run 预览/确认、模板归位预览/应用等现有语义原样保留，不弱化；原位保存以系统保存对话框作为用户对写入目标的显式确认。
5. **测试随动**：更新因快照导出改道而失真的断言（`App.snapshot.test.tsx`、`snapshotOps` 相关用例中的 `URL.createObjectURL`）；补充脏标记、原位保存、取消、只读拒绝、快照导出走 `saveFile` 的用例。

## 验收

- ac-edit-dirty: 真实文件对比会话中覆写差异块后，被覆写的一侧显示为「已修改（未保存）」，另一侧不受影响。
- ac-reset-clears-dirty: 点「重置」后两侧回到磁盘载入内容，两侧脏标记清除。
- ac-save-in-place: 对已修改的一侧执行保存，经系统保存对话框（defaultPath 预填该侧真实路径）写回后脏标记清除并提示已写回路径；磁盘文件内容等于修改后内容。
- ac-save-cancel-keeps-dirty: 在保存对话框取消后，磁盘不变、脏标记保持、无错误刷屏。
- ac-save-readonly-sample: 对只读（内置样本库）路径保存被拒绝并按既有提示语气报错，脏标记不变。
- ac-export-merge-via-dialog: 「导出合并文本」经系统保存对话框落盘为文件（非无声下载），成功提示路径；对话框取消不改磁盘、不报错。
- ac-export-snapshot-via-dialog: 目录快照导出经系统保存对话框落盘为 `<name>.ocsnap.json`，不再走 Blob 无声下载；成功提示落盘路径。
- ac-export-roundtrip: 导出的合并文本 / 快照文件可被外部读取或再次导入应用，内容与导出时一致（可复现）。
- ac-existing-confirmations: 目录同步 / 模板归位等既有危险动作的预览与确认语义保持不变。
- ac-gates: `pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动的 Blob 断言更新）。
- ac-self-test-desktop: 在真实 Electron 窗口（`pnpm dev`）走通：打开两个真实文件 → 做出修改 → 经保存对话框原位写回 → 外部读取核对磁盘内容为修改后内容 → 导出合并/快照结果并核对落盘文件可复现。

## 非目标

- 不做会话关闭时的未保存提示 / 标签生命周期（`session-tabs-lifecycle` 子项）；本项只建立脏标记状态。
- 不做自由文本 / 富文本编辑器：修改手段沿用既有逐块覆写与「重置」，不引入代码编辑器组件。
- 不新增导出品类：不做代码统一 diff 文本导出、不做 CSV 对齐结果导出、不扩展 `.ocsnap.json` 协议、不做二进制/Hex。
- 不改目录同步 / 模板归位的确认与预览逻辑，不改目录对比 / Diff / CSV / 3-way / 结构化算法内核。
- 不做真实路径拖拽与打开（`real-open-workbench` 已交付）、不做目录下钻返回状态保持（`directory-drilldown-roundtrip` 子项）。
- 不做签名 / 公证 / CI 发布（发布子项）。
- 不改视觉 token 与组件库，不新增设计系统概念。

## 实现约束

- 一切保存对话框与文件写入一律经 `PlatformPort.saveFile`；renderer 绝不直接 import Electron / `dialog`，web 内存实现须保持可用，不得写 `platform.kind === 'electron'` 才能工作的新分支。
- 原位保存的 `defaultPath` 必须是该侧**真实磁盘路径**（来自会话 `sides` / `pair.path`，即平台缝解析出的绝对路径），禁止 renderer 猜测或拼接。
- 只读样本库路径由 Electron `assertWritable` 拒绝；错误按既有 `report(message, tone)` + 状态栏/视图内 notice 的既有措辞风格呈现，不新造提示体系。
- 复用既有组件（`ToolbarButton` / `IconButton` / `StateView`，如需确认复用 `Dialog`）与 `main.css` token；脏标记沿用既有差异语义色与文案风格，不写死颜色/尺寸。
- 测试按 `.agents/skills/vitest/SKILL.md`；React 组件按 `.agents/skills/vercel-react-best-practices/SKILL.md`；无新架构面，不新建模块边界。
- **自测通道**：原生保存对话框只能在桌面 Electron 窗口表征，Web 自测通道无法呈现原生对话框，不能据 Web 自测关点；本项自测须在 `pnpm dev` 真实窗口 + 真实文件系统完成。
