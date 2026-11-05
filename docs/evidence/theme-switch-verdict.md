# Settings 主题切换真伪判定（v0.2.24 窗口验收 E1）

- 判定对象：2026-11-05 `release-v0.2.24-window` 验收项 E1「Settings 点 Light / Dark 后运行中窗口不变」
- 判定结论：**产品正常，旧驱动伪失败**。21:15 那次结果缺少命中证据，不能归因于产品；21:32 同一实例的同类点击实测生效。
- 产品改动：无。本文只固化证据，并配上回归断言与可复用探针。

## 1. 同一实例两轮 E1 的差异

同一运行实例（`ready.json` 21:11 启动，远程调试端口 9601）内先后跑过两轮 E1：

| 时间 | 驱动版本特征 | 结果 |
| --- | --- | --- |
| 21:15 | 无 `hitTarget` / `attempts` 字段，未记录 `elementFromPoint` | `appliedMsInPage: null`，三次点击均无 `data-theme` 变更 |
| 21:32 | 记录 `hitTarget: true`、`attempts: 1`、`before` 实际主题 | Light **75.8 ms**、Dark **79.1 ms**、Light **78.9 ms** 生效；`bodyBg` 在白 / 黑之间切换 |

21:32 的生效证据同时来自三层：

1. DOM：`documentElement.dataset.theme` 与 `style.color-scheme` 随点击变成 `light` / `dark`；
2. 计算样式：`body` 背景在白色与黑色之间切换；
3. 原生外壳：标题栏 / 窗口背板随 `nativeTheme.themeSource` 同步（亮 `#ffffff` / 暗 `#0b0e12`）。

旧结果（21:15）没能记录「坐标点到了哪个元素」，因此 `appliedMsInPage: null` 只能说明该轮驱动没有观察到变更，不能说明产品没有切换。21:15 的两张截图 `e1-light.png` / `e1-dark.png` 实际捕获的是另一个前台应用（缩略核对可见 Munk 编辑器窗口），**其色带数值不能作为主题证据**；21:32 的 `e1-light-final.png` 才真正拍到 OpenCompare 窗口（白色标题栏 + Settings 内 Light 选中）。决定性的 DOM 证据来自 CDP 计算样式，不受截图遮挡影响。

## 2. 证据绝对路径

- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/live.jsonl`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-raw.json`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/driver/window.mjs`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-light-final.png`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-light.png`（截图伪证，实际是其他前台应用）
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-dark.png`（同上）

## 3. 设计链路（为什么点击后应立即生效）

1. `src/renderer/src/workbench/SettingsDialog.tsx`：主题 `SegmentedControl` 的 `onChange` → `chooseTheme(next)`。
2. `chooseTheme` 先 `setTheme(next)`，再把 `{ language, theme: next }` 写入平台设置槽（失败只提示、不回滚）。
3. `src/renderer/src/theme/ThemeProvider.tsx`：`useLayoutEffect` 调 `applyTheme(resolvedTheme)` → `documentElement.dataset.theme = 'light' | 'dark'` + `style.colorScheme`；同一组件的第二个 `useLayoutEffect` 调 `platform.setNativeTheme(mode)`（推模式，不推解析值）。
4. `src/preload/index.ts` → `platform:set-native-theme` → `src/main/platform/electron-platform.ts`：`isTheme` 校验后 `nativeTheme.themeSource = mode`，再 `onNativeThemeChanged()` → `src/main/index.ts` 的 `applyWindowBackdrop()` → 每个窗口 `setBackgroundColor(#ffffff / #0b0e12)`。
5. 不需要重启，也不需要主进程回环：DOM 与原生外壳都在渲染进程点击后的同一批次 / 同一 IPC 往返内完成；窗口不 remount，会话 / 滚动保留。

## 4. 回归断言

`src/settings-theme-gate.test.tsx`（jsdom）挂载真实 `App`，用 `[data-shell-entry="settings"]` 打开真实 Settings 对话框，用 `getByRole('tablist', { name: 'Theme' })` 定位控件：

- Light → Dark → Light 三次切换，`dataset.theme` / `color-scheme` 同步为 `light` / `dark` / `light`；
- 写设置队列依次为 `{ language: 'en', theme: 'light' }`、`{ language: 'en', theme: 'dark' }`、`{ language: 'en', theme: 'light' }`；
- `setNativeTheme` 的末三次调用依次为 `'light'`、`'dark'`、`'light'`，`system` 模式推 `'system'` 而不是解析值；
- 原生通道抛错不影响 DOM 切换；卸载后以同一存储重挂载 `App` 仍恢复 `light`。

`src/renderer/src/App.theme.test.tsx`、`src/renderer/src/theme/*.test.*`、`src/main/native-theme-wiring.test.ts` 等既有套件继续覆盖解析、持久化、原生接线与启动恢复，本轮未改动其断言。

## 5. 可复用探针：命中 vs 产品不切换

`scripts/theme-click-probe.mjs` 只使用 Node `fetch` + 全局 `WebSocket`（CDP），无第三方依赖：

- 先读取每个主题 tab 的 `role`、所在 `tablist` 的 `aria-label`、`aria-selected`、`rect`，以及 `elementFromPoint` 命中元素的 `tagName / role / text / insideTarget`；
- 坐标未命中 tab → `driver-miss`，输出坐标处实际元素；
- 命中后 CDP 坐标点击并观察 `MutationObserver`，`data-theme` 到达期望值 → `ok-cdp`；
- 未变更则在页面内 `el.click()` 复测，仍无 `data-theme` 变更才判 `product-no-switch`，并输出「页面内 `.click()` 仍无变更」的事实。

判定纯函数与退出码映射由 `scripts/theme-click-probe.test.mjs` 单测覆盖（`ok-cdp` = 0、`driver-miss` = 1、`product-no-switch` = 2），并断言 `--help` 以 0 退出、脚本只 import Node 内置模块。

重跑命令（先在设置里打开 Settings 对话框，并让窗口暴露远程调试端口）：

```bash
node scripts/theme-click-probe.mjs --port <remote-debugging-port>
```

可选参数：`--label Light`（默认）、`--expect light`（默认）、`--timeout 2000`（默认）、`--help`。

## 6. 结论与边界

- 21:32 的实测（75.8 / 79.1 / 78.9 ms）与真实控件 → DOM / 原生推送 / 持久化 / 重启的回归断言共同证明产品链路正常；21:15 的失败属于旧驱动未记录命中证据的伪失败。
- 21:15 的 `e1-light.png` / `e1-dark.png` 是其他前台应用截图，不得作为主题证据引用。
- 本轮不改产品行为、不改主题 token / 四态语义、不放宽 WCAG 门、不重跑 GUI 验收；探针只作为下一轮可复用工具。
