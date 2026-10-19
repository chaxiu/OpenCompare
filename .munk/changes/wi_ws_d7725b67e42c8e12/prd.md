# 冷启动真实对比工作台与真实路径打开/拖拽

本项是「OpenCompare 生产级可用与合规发布」五步主链路的第一步：**冷启动即可用真实文件/目录开始对比，零样本依赖**。
现状证据：`Workbench.tsx` 的 `status === 'empty'` 首屏只有 `Load Sample Fixtures`（空态标题「尚未载入样本」，StateView action 亦为样本按钮），样本库是唯一入口；`sides` 初值硬编码为 `DIRECTORY_SAMPLE_PATHS`；全仓无任何 `onDrop` / `drag` 处理。`PlatformPort.selectFile` / `selectDirectory`（`src/shared/platform/types.ts`）已就位，`DirectoryView` 已有单侧 `onPick`，但首屏无真实入口。

## 范围

1. **空首屏主入口 = 真实对比**：无会话时首屏提供两个主 CTA——「打开文件」与「打开文件夹」，二者均经 `PlatformPort.selectFile` / `selectDirectory` 走系统选择器；打开完成即建立并进入对比会话，全程不加载内置样本。
   - 「打开文件夹」：依次选择**左侧目录 → 右侧目录**，落成既有目录对比会话（`createDirectorySession` + `sides` 更新为两个真实路径）。
   - 「打开文件」：依次选择**左侧文件 → 右侧文件**，落成与目录下钻同一 adhoc 文件会话模型（按 `fileKinds.classifyFile` 进入 code / csv / structured 视图）；不支持的扩展名按现有提示风格明确报错，不建会话。
   - 任一选择器取消 → 不建会话、不改动现有状态、不报错刷屏。
2. **真实路径拖入窗口**：空首屏与有会话时均可拖入真实路径，落点规则固定为：
   - 恰好 2 个**同类**路径（两个文件或两个目录）→ 直接建立会话，与选择器打开落成同一会话模型；
   - 1 个路径 → 作为**左侧**基准填入并明确提示继续选择右侧对应项（不静默失败、不自动配对猜测）；
   - 其余（>2 个、或文件与目录混合）→ 明确提示当前只支持两个同类路径，**不建会话、不改变既有会话**。
   - 拖入不得触发窗口导航 / 重载（Electron 默认行为必须被阻断，应用停留在原状态）。
3. **多会话并存**：打开不同文件对 / 目录对产生独立会话标签，不覆盖已有会话（每对一组侧，同一对重复打开可复用同一标签）。
4. **内置样本降级为辅助入口**：样本按钮 / 样本菜单保留但显式标注为演示用途，文案不再暗示「必须先加载样本」；样本入口可被完全跳过而不影响真实打开与拖拽路径。首屏空态文案、描述、hint 全部改写为真实对比口径（不再出现「尚未载入样本」「一键载入」这类唯一入口叙事）。
5. **测试随动**：`App.test.tsx`、`App.snapshot.test.tsx` 中断言旧空态文案 / 旧主按钮的用例随实现更新为新口径；新增覆盖「拖入 2 个同类路径建会话」「拖入 1 个路径只填左侧」「拖入 >2 或混合 → 不建会话」的组件测试（用内存 PlatformPort）。

## 验收

- ac-cold-start-primary-cta: 冷启动无会话首屏的两个主 CTA 是「打开文件」「打开文件夹」，且不存在以加载样本为主入口的空态叙事。
- ac-open-two-files: 空首屏经系统选择器依次选择两个真实文件后，直接建立并进入文件对比会话（按类型为代码 / CSV / JSON-YAML 之一），未加载任何样本。
- ac-open-two-dirs: 空首屏经系统选择器依次选择两个真实目录后，建立目录对比会话，会话 subtitle 展示这两个真实路径，内容来自真实文件系统而非样本路径。
- ac-picker-cancel: 在任一选择器取消后不建会话、不改变既有会话与视图。
- ac-drop-two-paths: 把两个真实同类路径（两个文件或两个目录）拖入窗口，落成与选择器打开同一会话模型并进入对比视图。
- ac-drop-single-path: 拖入单个真实路径时该路径被作为左侧基准填入并提示选择右侧对应项，现有会话不受影响。
- ac-drop-invalid: 拖入超过两个路径、或文件与目录混合时给出明确提示，不新建会话且不改变现有会话状态。
- ac-drop-no-navigate: 拖入路径不会导致窗口导航 / 重载，应用仍停留在当前会话。
- ac-sessions-not-overwritten: 连续打开不同文件对（或目录对）会新增独立会话标签，不覆盖先前会话。
- ac-samples-auxiliary: 样本入口仍显式标注为演示用途且可用；不点样本不影响上述真实打开 / 拖拽路径。
- ac-gates: `pnpm typecheck` / `pnpm lint` / `pnpm test` 在改动后全绿（含随动的空态断言更新）。

## 非目标

- 不做「最近打开 / 历史记录 / 收藏夹 / 书签」。
- 不做 OS 级集成：Finder「打开方式」关联、命令行路径参数、macOS `open-file` 事件、拖到 Dock 图标。
- 不做单侧智能配对（同名文件、同父目录兄弟、上一个会话路径记忆）——单路径拖入只做左栏填充 + 提示。
- 不做多选批量选择（`selectFile` 保持单选，一律左右各一次）。
- 不做会话标签生命周期与未保存提示（`session-tabs-lifecycle` 子项）、不做目录下钻与返回状态保持（`directory-drilldown-roundtrip` 子项）、不做原位保存与导出（`save-in-place-and-export` 子项）——本项止于「建立并进入会话」。
- 不删改内置样本、不重构 `loadSampleSessions` 既有加载路径。
- 不新增对比能力品类、不改目录对比 / Diff / CSV / 结构化算法内核。
- 不改视觉 token 与组件库、不新增设计系统概念（沿用 `components/` 现有组件与 `StateView` 模式）。

## 实现约束

- 打开与拖拽一律经 `PlatformPort`（`selectFile` / `selectDirectory` / `readTextFile` / `listDirectory`）；renderer 不得直接使用 Electron API，web 内存实现须保持可用，不得写 `platform.kind === 'electron'` 才能工作的新分支逻辑。
- 拖拽必须解析出**真实绝对路径**：Electron 37 已移除 `File.path`，路径解析须经平台缝（preload / `webUtils.getPathForFile` 或 main IPC 白名单 channel）实现，禁止 renderer 侧猜测或拼接路径。
- 两路径落点与选择器落点必须复用同一条会话构建路径（同一模型、同一进入视图），不得两套逻辑。
- 复用现有组件与 token：空态继续走 `StateView`，按钮走 `ToolbarButton`；不写死颜色 / 尺寸，差异语义色仅用 `--color-diff-*`。
- 危险 / 报错提示沿用现有 `report(message, tone)` + 状态栏风格的既有措辞语气，不新造提示体系。
- 单测按 `.agents/skills/vitest/SKILL.md`；React 组件按 `.agents/skills/vercel-react-best-practices/SKILL.md`；本项无新架构面，不新建模块边界。
- 真实窗口自测口径（`needSelfTest=true`）：Electron 冷启动 → 首屏主 CTA 打开两个真实文件 / 目录或拖入两个真实路径 → 不加载样本即进入对比会话。
