covers: ac-export-merge-via-dialog
标题: 导出合并文本经系统保存对话框落盘，取消不改磁盘且不报错
步骤: 1) 启动应用，打开「代码 Diff & 3-Way Merge」场景并切到「三向合并 base · ours · theirs」（可经「打开 base / ours / theirs」把三个输入换成真实文件）；2) 在仍有待决冲突时查看「导出合并文本」的可用性；3) 逐一采纳使「待决冲突」归零；4) 点「导出合并文本」，核对是否弹出系统保存对话框、默认文件名与过滤器；5) 选择可写目录并确认保存，观察视图提示，再用外部读取打开落盘文件；6) 再点一次「导出合并文本」，在系统对话框中取消，观察磁盘与合并状态
期望: 待决冲突 > 0 时「导出合并文本」禁用，清零后启用；点击后走 `PlatformPort.saveFile` 弹出系统保存对话框（不是 Blob + anchor 的无声下载，应用/浏览器下载记录不应新增），默认名沿用 merged.txt 一类贴切名称、过滤器为文本；确认后提示「已保存到 <绝对路径>」，外部读取该文件内容与预览中按各块选择拼接的结果逐行一致、不含冲突标记；取消后不新增或覆盖任何文件、磁盘不变，合并视图与待决计数保持原样且不报错。

## 最近执行

- workItemId: wi_ws_4829ebe71d4e966e
- at: 2026-10-19
- status: pass
- note: 真实 Electron 窗口三向合并（打开 base/ours/theirs 三个真实文件）：待决冲突 1/1 时「导出合并文本」disabled，Accept Ours 后 0/1 转 enabled；点击弹出原生「保存合并结果」对话框、默认名 merged.txt、文本过滤器，确认后提示「已保存到 /private/var/.../exports/merged.txt」，外部 cat 内容为 line1/ours-change/line3（与按块拼接结果逐行一致、无冲突标记）；再次导出并在对话框 Cancel 后未新增/覆盖任何文件、磁盘与待决计数保持原样、无报错。全程走 PlatformPort.saveFile，无 Blob 无声下载。
