# 首页最近对比容器容不下 5 行：token 150px → ≥206px + 可算断言

## 目标

首页「最近对比」列表按 HISTORY_HOME_VISIBLE_LIMIT=5 取 5 条（historyHome.tsx:16/:125），但容器 --height-history-list=150px（main.css:94-95，@theme 全局、无任何响应式覆盖）而 5 行完整需要 206px（行盒 38px = control-sm 28 + py-1 8 + border 2，gap 4px）。现状：只容 3 整行、第 4 行被 ul 下沿切掉一截、第 5 行完全在折叠线外，而窗口下方还空着 250~400pt。historyHome.test.tsx:110-114 只断言 5 个 DOM 节点 + className 存在，jsdom 不算像素，缺陷被绿色门禁固化。本项只修这一处：让 5 行完整可见，并让门禁在回退时真红。

## 验收

- ac-1: --height-history-list 的计算值 ≥ 5 行完整所需高度（按现行 38px 行盒 + 4px 间隙 = 206px）；行高与容器高度必须单一来源（calc/常量派生），不得留下与 limit=5 矛盾的孤立像素数字。
- ac-2: 门禁可红——新增断言校验「容器高度 ≥ 5×行盒 + 4×gap」，行盒从单一定义处读取；必须留红证：把 token 临时改回 150px 时该断言真实失败并贴失败输出，再改回修复值转绿。禁以 DOM 节点数或 className 存在充当通过证据。
- ac-3: 重打包 0.2.26 本地 dmg（ad-hoc，非发布资产），asar sha256 与修复前对比记账；出一张窗口级 AX 窗口截图（带取证时刻、先证解锁态）显示首页 5 行完整可见、第 5 行下沿未越过 ul 下沿。
- ac-4: 边界——不推 tag、不 dispatch release.yml、不动 v0.2.25 及更早 tag/Release/资产、不改其他 UI 面与文案、不重跑 leg-2/leg-3、不开卡、不向人要输入。
- ac-5: 若实测行盒与推导不符（例如 5 行仍放不下），以实测反推容器高度；严禁为了让断言变绿而调小 limit 或删掉第 5 条数据。
