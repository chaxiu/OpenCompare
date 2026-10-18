covers: ac-export-directory-snapshot
标题: 一键导出真实目录侧为 .ocsnap.json
步骤: 加载内置样本目录对比（「加载样本目录」）→ 点击左栏的「导出左侧快照」→ 展开浏览器/应用下载记录，打开下载的 baseline.ocsnap.json
期望: 文件成功下载且名为 baseline.ocsnap.json；JSON 顶层 schema 为 opencompare.snapshot/v1、name 为 baseline、entries 为 15 条；每条含 size / modifiedMs / sha256；可下钻文本文件（如 src/core/engine.ts、src/data/report.csv、config/deploy.yaml）带内联 content，不可下钻文件 assets/logo.png 不含 content；界面给出导出文件数提示。

## 最近执行

- workItemId: wi_ws_1c48f73551810bc2
- at: 2026-10-18
- status: pass
- note: web 实测：下载文件名 baseline.ocsnap.json；schema=opencompare.snapshot/v1、name=baseline、entries=15，全部条目 size/modifiedMs 为 number 且 sha256 长度 64；engine.ts/report.csv/deploy.yaml 有内联 content，assets/logo.png 无 content；界面提示「已导出 baseline.ocsnap.json（15 个文件）。」
