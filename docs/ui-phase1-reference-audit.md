# UI 第一期对标参照审计（只读三表）

审计基线：`refs/heads/main` v0.2.11 树（commit `2b2f624`）；素材来源域：`scootersoftware.com` 官方 v5help 手册；日期：2026-10-30。
方法：只读官方手册页并逐行给源；层名取自 `SHELL_LEVEL_ORDER`，入口与位置取自 `SHELL_ENTRY_IDS` / `SHELL_ENTRIES`，图标名取自 `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` / `ICON_NAMES`。

## 表① 壳层归属

| 我们的层 | 对方对应层 | 该层控件在我们词汇下承担的动作 | 来源 |
| --- | --- | --- | --- |
| app | app | 品牌与视图切换、新建对比、打开文件 / 文件夹、设置；全局动作只在此行出现一次，对应对方的菜单栏加标准工具栏（示例入口已收进设置，不再占用顶栏） | https://www.scootersoftware.com/v5help/commandsbc.html |
| sessions | sessions | 会话切换、关闭与脏标记；只切换视图，不承担任何对比动作，对应对方的标签栏 | https://www.scootersoftware.com/v5help/optionstab.html |
| events | status | 提示、扫描 / 校验进度与取消；只读播报，不承担常规动作，对应对方落在视图底部的提示条 | https://www.scootersoftware.com/v5help/sessiondirsyncotherfilters.html |
| view-toolbar | view-toolbar | 过滤、同步 / 模板、快照与报告、差异导航、覆写 / 保存、合并接受 / 导出；全部是当前视图动作，随视图类型换行 | https://www.scootersoftware.com/v5help/optionscommand.html |
| panels | panels | 面板列头、路径 / 文件信息、行号标尺与详情；描述这一侧在看什么，不发起动作 | https://www.scootersoftware.com/v5help/commandsver.html |
| status | status | 会话 id / 平台、差异与冲突统计、图例；只读统计，不承载动作 | https://www.scootersoftware.com/v5help/commandsdir.html |

## 表② 18 条入口对照与判定

| 入口 | 我们的位置 | 对方在哪一层 | 对方有而我们没有 | 我们有而对方没有 | 判定 | 理由 | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open-file | app / global-actions | app | 按文件类型派生的 Hex / Media / Picture 视图 | 一对文件直接进入代码对比 | 保留 | — | https://www.scootersoftware.com/v5help/commandstext.html |
| open-folder | app / global-actions | app | 远程服务与归档可作为侧来源 | 目录对一次选择即建会话 | 保留 | — | https://www.scootersoftware.com/v5help/viewdir.html |
| new-compare | app / global-actions | app | Home 视图按会话类型分组的大按钮与工作区 | 单对话框内选目录 / 文件 / 三向 | 保留 | — | https://www.scootersoftware.com/v5help/viewhome.html |
| settings | app / global-actions | app | 分页 Options（工具栏 / 标签 / 颜色等） | 单对话框内语言与偏好 | 保留 | — | https://www.scootersoftware.com/v5help/commandsbc.html |
| filter | view-toolbar / directory-filter | view-toolbar | DropDown / Favorites / Toggles 三种过滤布局 | 过滤条件与图例同排常驻 | 保留 | — | https://www.scootersoftware.com/v5help/display_filters.html |
| sync | view-toolbar / directory-sync | app | 独立 Folder Sync 会话与计划任务 | 目录视图内直接发起同步预览 | 保留 | — | https://www.scootersoftware.com/v5help/viewdirsync.html |
| template | view-toolbar / directory-sync | 无 | 无，对方用会话默认值承担同类落位 | 从模板落位目录结构 | 降级到菜单 | 低频动作，不应与同步预览并列占用同排宽度 | https://www.scootersoftware.com/v5help/session_settings.html |
| snapshot-import | view-toolbar / directory-snapshots | app | 快照可作为任一侧来源加载 | 快照挂载到当前侧一次完成 | 保留 | — | https://www.scootersoftware.com/v5help/snapshots.html |
| snapshot-export | view-toolbar / directory-snapshots | app | Tools 菜单内的 Save Snapshot | 当前结果直接导出快照 | 保留 | — | https://www.scootersoftware.com/v5help/commandsbc.html |
| report-export | view-toolbar / directory-report | app | Session 菜单内的对比报告 | 报告导出与进度同排常驻 | 降级到菜单 | 低频动作，不应占用常规工具条主位 | https://www.scootersoftware.com/v5help/dlgreport.html |
| drilldown-back | view-toolbar / drilldown | app | Session 菜单的 Back / Forward 目录历史 | 下钻返回条与来源标题同排 | 保留 | — | https://www.scootersoftware.com/v5help/commandsdir.html |
| prev-diff | view-toolbar / code-navigation | view-toolbar | 差异导航的键盘绑定与 Search 菜单 | 差异计数与上下导航并排 | 保留 | — | https://www.scootersoftware.com/v5help/commandstext.html |
| next-diff | view-toolbar / code-navigation | view-toolbar | 多文件会话的“下一对不同文件” | 差异 / 冲突两模式共用同一对按钮 | 保留 | — | https://www.scootersoftware.com/v5help/commandstext.html |
| override | view-toolbar / code-edit | view-toolbar | Copy to Left / Right 双向与整文件复制 | 覆写方向写成显式动作名 | 保留 | — | https://www.scootersoftware.com/v5help/commandstext.html |
| save | view-toolbar / code-edit | view-toolbar | 保存会话与工作区的独立命令 | 保存编辑与差异导航同排 | 保留 | — | https://www.scootersoftware.com/v5help/commandstext.html |
| merge-accept | view-toolbar / merge-resolve | view-toolbar | Take Left / Center / Right 三源接受 | 四态冲突计数与接受同排 | 保留 | — | https://www.scootersoftware.com/v5help/commandstextmerge.html |
| export | view-toolbar / merge-export | view-toolbar | 输出窗格可分离到独立窗口 | 合并结果一键导出文本 | 保留 | — | https://www.scootersoftware.com/v5help/viewtextmerge.html |
| tab-select | sessions / tabs | sessions | 会话可开为独立窗口或标签页 | 会话标题与副标题两级截断 | 保留 | — | https://www.scootersoftware.com/v5help/optionstab.html |

## 表③ 图标语义差异与主动不做

| 类别 | 对标元素 / 动作 | 我们的图标名 | 对方字形差异的性质 | 选哪个与理由 | 来源 |
| --- | --- | --- | --- | --- | --- |
| 图标语义差异 | 上一个差异 | chevron-up | 对方用上箭头或双三角表示跳转 | 选 chevron-up：差异块纵向排列，chevron 读作步进，且与菜单的 chevron-down 同几何 | https://www.scootersoftware.com/v5help/commandstext.html |
| 图标语义差异 | 下一个差异 | chevron-down | 对方用下箭头或双三角表示跳转 | 选 chevron-down：与上一个差异成对，避免再引入一组方向箭头 | https://www.scootersoftware.com/v5help/commandstext.html |
| 图标语义差异 | 同步方向预览 | square-split-horizontal | 对方用双向循环箭头表示同步 | 选 square-split-horizontal：动作是先并排看两侧再决定方向，不是刷新，故与 refresh-cw 区分 | https://www.scootersoftware.com/v5help/viewdirsync.html |
| 图标语义差异 | 从模板落位 | shuffle | 对方无对应字形，同类能力落在会话默认值 | 选 shuffle：落位是重排而非复制，沿用现有命名不改 | https://www.scootersoftware.com/v5help/session_settings.html |
| 图标语义差异 | 接受合并 | check | 对方用左 / 中 / 右方向箭头表达 Take | 选 check：我们的接受是四态之一的确认，方向由文案承担 | https://www.scootersoftware.com/v5help/commandstextmerge.html |
| 图标语义差异 | 覆写到右侧 | arrow-right | 对方用带文件的双向箭头 | 选 arrow-right：方向本身即语义，与 overwriteLeft 的 arrow-left 成对 | https://www.scootersoftware.com/v5help/commandstext.html |
| 图标语义差异 | 导入快照 | upload | 对方把快照当普通来源加载，用文件夹或挂载字形 | 选 upload：导入是把外部快照装进当前侧，下载语义留给导出 | https://www.scootersoftware.com/v5help/snapshots.html |
| 图标语义差异 | 导出快照 | download | 对方 Save Snapshot 在 Tools 菜单，用保存字形 | 选 download：与 upload 成对，且不与 save 的磁盘语义冲突 | https://www.scootersoftware.com/v5help/commandsbc.html |
| 图标语义差异 | 目录过滤 | list-filter | 对方用漏斗 | 选 list-filter：我们的过滤是列表谓词，漏斗会暗示只看子集 | https://www.scootersoftware.com/v5help/display_filters.html |
| 图标语义差异 | 新建对比 | git-compare | 对方用加号或网格表示 New Session | 选 git-compare：新建对象就是两侧对比，不是空白文档 | https://www.scootersoftware.com/v5help/viewhome.html |
| 主动不做 | 菜单栏加标准工具栏双层 | — | — | 不做：应用头固定单行，命令收进 global-actions 与下拉；替代：app 层单行加下拉菜单 | https://www.scootersoftware.com/v5help/commandsbc.html |
| 主动不做 | 左侧缩略图 minimap | — | — | 不做：窗口化渲染下 minimap 成本高且与 DiffRuler 重复；替代：DiffRuler 标尺加上下差异 | https://www.scootersoftware.com/v5help/viewtext.html |
| 主动不做 | 独立 Folder Sync 会话与计划任务 | — | — | 不做：本期只保留目录视图内同步预览；替代：sync 入口 | https://www.scootersoftware.com/v5help/viewdirsync.html |
| 主动不做 | 多窗口与工作区管理 | — | — | 不做：单窗口加会话标签已覆盖主要切换；替代：sessions 层标签 | https://www.scootersoftware.com/v5help/commandsbc.html |
| 主动不做 | 三向合并独立中栏与可分离输出窗格 | — | — | 不做：本期合并仍在 merge-resolve 行内完成；替代：merge-accept | https://www.scootersoftware.com/v5help/viewtextmerge.html |
| 主动不做 | 远程服务与云 profiles | — | — | 不做：本期只读本地文件系统，平台端口未接远程；无替代 | https://www.scootersoftware.com/v5help/remote_services.html |
| 主动不做 | 文件格式规则管理器 | — | — | 不做：超出 UI 第一期，避免与对比算法同批改动；无替代 | https://www.scootersoftware.com/v5help/dlgfileformatmanager.html |
| 主动不做 | 工具栏大按钮与用户自定义 | — | — | 不做：固定 1024 / 1440 / 1920 三档呈现，不允许用户改工具栏；替代：三档宽度表 | https://www.scootersoftware.com/v5help/optionscommand.html |
| 主动不做 | 打印与 PDF 报告 | — | — | 不做：只导出 HTML 报告，打印交给浏览器；替代：report-export | https://www.scootersoftware.com/v5help/dlgreport.html |

壳层结论：已合入的壳层重排（merge 8e56046）无结构性问题，六层顺序与单一尺寸表可直接承接后续图标与主题批次。
