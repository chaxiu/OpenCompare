# Domain: code-diff-merge

代码 / 文本场景的差异对比与三向合并工作流（`CodeView` 的 `diff` 与 `merge` 模式）：行级 + 行内字符级 Diff、行号对齐与同步滚动、差异块导航 / 单块覆写，以及基于 `node-diff3` 的三向冲突块点选采纳 / 实时预览 / 导出。业务算法（纯函数）落 `src/core/`，零 Electron/DOM。目录 / CSV / JSON·YAML 场景不属本域。

## 范围

- **双栏代码 Diff（`CodeView` 的 `diff` 模式）**：`diff`(jsdiff) 行级差异块（same / added / removed / modified），颜色走既有差异语义 token（`--color-diff-*` + `DiffBadge`/`diffSemantics`）；配对 modified 行的二级行内字符级高亮（仅变化片段着色）；左/右真实行号槽 + 单侧多出/缺少行的填充占位对齐；按行号映射的双向同步滚动（垂直 + 水平）；差异块上一个/下一个循环导航（当前块高亮 + 两侧滚入可见 + 序号/总数）；单块「→ 覆写到右」/「← 覆写到左」即时重算差异与一次撤销/重置回样本原文。
- **真实文件会话的脏标记与原位保存（`CodeView.CodeDiffView` 的 `diff` 模式）**：任一侧「当前工作文本 ≠ 从磁盘载入的原始文本」即为该侧「已修改（未保存）」，在面板标题区与工具栏同时可见（明确左/右哪一侧），并把会话级 `dirty` 上报到 `workbench/session.ts` 供后续关闭提示复用；覆写回原内容或点「重置」清除。对已修改的一侧提供「保存左文件 / 保存右文件」：**直接** `PlatformPort.writeTextFile(该侧加载时的真实路径, 当前工作文本)` 原位写回，不弹系统保存对话框、不改变该侧路径；写入成功后把该侧基线文本更新为写回文本、清除脏标记并提示「已写回 <路径>」；写入被平台拒绝（如只读样本库）时按既有提示语气展示错误原因、脏标记保留、其他会话与当前视图不受影响。`saveFile` 仍保留给三向合并「导出合并文本」与目录快照「导出」。
- **三向合并（`CodeView` 的 `merge` 模式，base / ours / theirs）**：`node-diff3` 的 `diff3MergeRegions`（按 `\n` 切分行数组调用）识别稳定区与冲突区，区分「仅一侧变更（自动采纳）」与「双侧冲突块」；冲突剩余计数实时递减至清零完成态；上下冲突跳转定位并高亮；逐块 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base` 采纳与改选（显示采纳来源）；独立合并结果预览区随选择即时更新（未解决块以冲突标记呈现）；冲突清零后导出合并文本 + 复制到剪贴板。
- **算法落位与测试**：行级 + 行内 Diff 计算、diff3 区域计算、已解决选择 → 合并文本拼接均为 `src/core/` 纯函数，可由 vitest 在 Node 直接单测；行内字符级 diff 对超长行（>2000 字符）退化整行标记保护。
- **本地文件入口（`CodeView` 顶栏）**：经 `PlatformPort.selectFile` 分别打开左 / 右本地文本文件即时刷新双栏 Diff；三向合并可分别打开 base / ours / theirs 本地文件并重建合并模型与冲突列表（清空旧采纳状态）；冲突全部解决后经 `PlatformPort.saveFile` 把合并结果保存到本地（`defaultPath` 预填，未解决时动作禁用）。

## 验收

- **ac-diff-inline-char**：双栏 Diff 对修改行给出行内字符级高亮（仅变化片段着色），行级状态与差异语义色一致。
- **ac-diff-line-align**：左右行号槽显示各自真实行号，单侧多出的行在对侧以填充占位对齐，差异块左右视觉齐平。
- **ac-diff-sync-scroll**：拖动任一栏滚动，另一栏按行号映射同步滚动，无抖动/互踢。
- **ac-diff-block-nav**：差异块上一个/下一个可循环定位每个差异块，当前块高亮且两侧滚动到可见。
- **ac-diff-block-overwrite**：单块「覆写到左/右」把该块写入对侧并即时重算差异，且可撤销/重置回样本原文。
- **ac-merge-regions**：三向合并按行识别稳定区与冲突块，初始冲突块数量与样本场景（3 块）一致。
- **ac-merge-count-nav**：冲突剩余计数随逐块解决实时递减并可清零；上下冲突跳转定位并高亮目标冲突块。
- **ac-merge-accept**：每个冲突块可一键 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base`，解决后显示采纳来源且可改选。
- **ac-merge-preview**：合并结果预览随每次选择实时更新，未解决块以冲突标记呈现而非静默丢弃。
- **ac-merge-export**：全部冲突清零后可导出合并文本（导出/复制成功），内容为按选择拼接的正确结果且无残留冲突标记。
- **ac-code-statusbar-runtime**：代码会话状态栏冲突计数来自运行时计算，随解决递减，不再读样本 answer key。
- **ac-code-diff-open**：`CodeView` 双栏 Diff 顶栏可分别打开左 / 右本地文本文件，打开后对比区立即按新内容刷新（差异块计数随之更新）；取消时不改变现有对比且不报错。
- **ac-code-merge-open**：`CodeView` 三向合并模式可分别打开 base / ours / theirs 本地文件并重建合并模型与冲突列表（冲突计数/列表随之更新、旧分块采纳状态清空、导航回到首块）；取消时不改变现有合并状态。
- **ac-code-merge-save**：三向合并冲突全部解决后，可经 `saveFile` 把合并结果保存到本地文件（未解决时该动作不可用）；保存内容为按各块选择拼接的结果且不含冲突标记，保存后给出成功提示，取消不误报成功。
- **ac-edit-dirty**：真实文件对比会话中覆写差异块后，被覆写的一侧显示为「已修改（未保存）」，另一侧不受影响。
- **ac-reset-clears-dirty**：点「重置」后两侧回到磁盘载入内容，两侧脏标记清除。
- **ac-save-in-place**：对已修改的一侧执行保存时，以该侧加载时的真实路径调用一次 `writeTextFile`（`saveFile` 调用 0 次、无系统保存对话框），提示含「已写回」与该路径；随后该侧脏标记清除、路径不变，重新读取磁盘得到修改后文本。
- **ac-save-error-keeps-dirty**：`writeTextFile` 抛错（如只读样本库）时展示含原因的错误提示，该侧脏标记保留、`saveFile` 仍为 0 次，其他会话与当前视图不受影响。
- **ac-save-readonly-sample**：对只读（内置样本库）路径保存被拒绝并按既有提示语气报错，脏标记不变。
- **ac-export-merge-via-dialog**：「导出合并文本」仍经系统保存对话框落盘为文件（非无声下载），成功提示路径；对话框取消不改磁盘、不报错；未被原位写回改动影响。
- **ac-gates**：`pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动的 Blob 断言更新与新增脏标记 / 保存用例）。
- **ac-self-test-desktop**：在真实 Electron 窗口（`pnpm dev`）走通：打开两个真实文件 → 做出修改 → 点「保存右文件」直接原位写回（不出现系统保存对话框）→ 外部读取核对磁盘内容为修改后内容 → 导出合并/快照结果（仍经保存对话框）并核对落盘文件可复现。
- **ac-tests**：`src/core/` 有 vitest 覆盖行级/行内字符级区间、差异块划分、diff3 区域划分与采纳拼接结果；`pnpm test` 绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- 不做目录树对比/下钻、CSV 主键对齐、JSON/YAML 语义 diff、增量同步与模板归位——各属后续子项；本域只动代码/文本场景。
- 不替换目录 / CSV / JSON·YAML 三类会话的 answer-key 统计，只改代码会话的冲突计数。
- 不引入 CodeMirror / Monaco 等重型编辑器或第二套 UI 库；沿用既有组件与自建行渲染。本域只建立脏标记状态与按侧原位保存，不做会话关闭时的未保存提示 / 标签生命周期（`session-tabs-lifecycle`），不做自由文本编辑。
- 不做代码统一 diff 文本导出、CSV 对齐结果导出、`.ocsnap.json` 协议扩展或二进制/Hex；快照导出属 `snapshot` 域。
- 不做语法高亮、浅色主题、快捷键/命令面板、分栏拖拽（`SplitPane` 已具备）。
- 文件对话框能力由 `PlatformPort.selectFile` / `saveFile`（`foundation` 域）提供，本域只做视图入口接线；不做最近文件列表、多文件选择、目录批量 IO 等顺手扩展。
- 不动「保存左/右文件」之外的导出语义：三向合并结果保存与目录快照导出仍走 `saveFile` 对话框，原位写回不得复用该对话框路径。
- 不做十六进制/二进制对比、`.xlsx` 解析、FTP/SFTP。
- 指示条（ruler / overview bar）的四态聚合、比例↔行号换算、最近差异块命中与视口窗几何单纯函数属 `diff-ruler` 域；本域后续只消费其导出做 `CodeView` 接线，不改其几何语义。

## 实现约束

- 技术栈已冻结：Electron + electron-vite + React 19 + TS + Tailwind v4 + Lucide React；Diff 用 `diff`(jsdiff)，3-way 用 `node-diff3`，不得替换。
- 分层硬约束：`src/core/` 零 Electron/DOM（ESLint 已强制）；renderer 绝不直接 import Electron API，平台能力只经 `PlatformPort`。
- 视觉：token 唯一来源 `src/renderer/src/assets/main.css`；差异色一律 `--color-diff-*` 与既有 `DiffBadge`/`diffSemantics` 词汇（same/added/removed/modified/conflict），组件内不写死颜色尺寸。
- 交互文案与视图沿用中文（「双栏 Diff / 三向合并」）。
- 长行保护：行内字符级 diff 超过阈值（单行 >2000 字符）退化为整行高亮。
- 保持既有测试绿：`App.test.tsx`、`src/shared/fixtures/fixtures.test.ts`（样本 answer key 不改）、`web-platform.test.ts`。

## 最近交付证明

- WI：`wi_ws_2bb64d43d7ceba21`（文件会话原位写回改为免对话框直写，`kind: feature`）
- 日期：2026-10-20
- 结果：self_test skipped（本项无 UI 自测，改由 code_gates 关点）。
- 覆盖摘要：`CodeView.tsx` 的 `CodeDiffView.save(side)` 删除 `PlatformPort.saveFile` 分支，改为 `await platform.writeTextFile(已加载路径, 当前工作文本)`；成功后只把该侧基线 `leftSource` / `rightSource` 更新为写回文本（脏标记随之清除）并提示「已写回 <路径>」，该侧来源路径保持加载时的真实路径不再被对话框返回值改写；失败时按 `cause.message` 展示错误、工作副本与脏标记保留。两侧工具栏 title 同步改为「直接…原位写回…（不弹保存对话框）」。`saveFile` 保留给三向合并「导出合并文本」与目录快照导出，行为未改。`CodeView.test.tsx` 相应改写：右/左两侧直写断言 `writeTextFile` 收到加载路径与工作文本且 `saveFile` 0 次、脏标记清除、磁盘与视图路径不变；只读样本拒绝仍保留脏标记并报错；合并导出仍走 `saveFile`。六条门禁（install / lint / typecheck / build / build:web / test）全绿。
- 注：本 WI change pack 未提供 `tests/cases/**` / `tech.md` / `ux/**`，无新增折叠用例；仅按新语义刷新 `qa/diff-save-in-place.md`、`qa/diff-save-error-keeps-dirty.md`、`qa/diff-save-readonly-sample.md`、`qa/desktop-save-in-place-export-e2e.md`，并移除已随对话框取消语义退场的 `qa/diff-save-cancel.md`。
