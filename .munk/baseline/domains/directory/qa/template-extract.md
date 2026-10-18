covers: ac-template-extract
标题: 确认后按模板 A 的相对路径结构写出（自动创建缺失父目录），且用同一匹配器复核归位结果为全匹配、模板结构可从输出目录重建
步骤: 在模板归位映射预览弹窗中点「确认提取归位」→ 观察输出根目录结构 → 用同一 `matchTemplate` 复核输出目录
期望: 经 `PlatformPort`（`writeTextFile`/`ensureDirectory`）把所有 `matched` 文件按模板 A 的相对路径结构写出到一个目标根，缺失的父目录自动创建；完成后用同一匹配器复核输出目录，结果为全匹配（`missing=0`、`conflicts=0`，`matched` 与写入数一致），模板 A 的相对路径结构可从输出目录重建

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: 修复后复验（Web 硬刷新）：预览 已匹配 9/缺失 6/冲突 0，输出根 /memory/restored/1-baseline；确认提示「模板归位完成：写入 9 个文件；复核已写入槽位 已匹配 9 · 缺失 0 · 冲突 0。」，写入数=复核 matched=9、missing=0、conflicts=0；弹窗关闭、对比统计不变、无错误；输出根在 web UI 不可浏览，结构重建由复核计数佐证
