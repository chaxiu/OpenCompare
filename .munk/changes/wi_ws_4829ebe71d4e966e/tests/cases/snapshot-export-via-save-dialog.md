covers: ac-export-snapshot-via-dialog
标题: 目录快照导出改走系统保存对话框落盘为 <name>.ocsnap.json
步骤: 1) `pnpm dev` 打开两个真实目录建立目录对比会话，确认工具栏可见「导出左侧快照 / 导出右侧快照」；2) 点「导出左侧快照」，核对系统保存对话框的默认文件名与过滤器；3) 选择可写目录确认保存，观察视图提示，并检查系统下载记录/浏览器下载栏是否出现无声下载；4) 用外部读取打开落盘文件，核对 schema、name、entries 与内联 content；5) 对右侧点「导出右侧快照」重复确认；6) 再点一次「导出左侧快照」并在系统对话框中取消
期望: 左右两侧导出均经 `PlatformPort.saveFile` 弹出系统保存对话框，默认文件名为 `<左侧/右侧目录名>.ocsnap.json`，过滤器包含 `ocsnap.json`（与 json）；不再出现 Blob + anchor 的无声下载或浏览器下载记录；确认后提示「已导出到 <绝对路径>（N 个文件）」，落盘文件为合法 JSON：schema 为 opencompare.snapshot/v1、name 为对应目录名、entries 数量与目录文件数一致，条目含 size / modifiedMs / sha256，可下钻文本带内联 content、二进制无 content；取消时不写任何文件、不报错，目录树与状态栏统计保持不变。

## 最近执行

- workItemId: wi_ws_4829ebe71d4e966e
- at: 2026-10-19
- status: pass
- note: 真实 Electron 窗口建立真实目录对比（left-dir ↔ right-dir）后工具栏可见导出/导入左右快照按钮。点「导出左侧快照」弹出原生「导出目录快照」对话框、默认名 left-dir.ocsnap.json（过滤器为 ocsnap.json/json，见 SNAPSHOT_FILE_FILTER），确认后提示「已导出到 /private/var/.../exports/left-dir.ocsnap.json（1 个文件）。」；外部读取 JSON：schema=opencompare.snapshot/v1、name=left-dir、entries 含 src/a.txt 且带 size/modifiedMs/sha256 与内联 content。右侧同法导出 right-dir.ocsnap.json（2 个文件）且两文件条目与目录一致。再次导出左侧并在对话框 Cancel：文件 mtime/大小未变、未新增文件、统计不变、无报错。无 Blob/anchor 无声下载。
