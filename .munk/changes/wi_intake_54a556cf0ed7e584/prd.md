# 修好二次启动带文件参数时把应用目录当左路径

## 范围

- 现象（L3 现场实测，非本单主缺陷）：应用已开时第二实例带位置参数启动，`argv[1]` 是绝对 app 路径而 `appEntry` 是 `.`，`stripLauncherPrefix` 不生效，app 目录被当成左路径，提示「左侧是目录」；改用 `--left=/--right=` 可绕开。0.1.2 验过 second-instance 加 tab，疑似回归，需先定位再修。
- 修 launcher 前缀剥离与 second-instance 位置参数解析，使 appEntry 为 `.` 与绝对 app 路径两种形态都能剥掉启动器前缀；解析复用既有 `parse*` 与 `CompareErrorCode`，不另起一套。
- 补回归单测覆盖：位置参数两侧文件、单侧文件、目录 + 文件、`--left/--right` 形式，且两种情况（appEntry='.'、appEntry=绝对路径）都断言剥离正确。
- 只读证据：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_aa6693d8bd259898/digest.md` 第 3 节。

## 验收

- ac-positional-pair: 应用已开时二次启动 `opencompare a.xlsx b.xlsx` 建出左右对应对，不再提示「左侧是目录」。
- ac-flag-parity: `--left=/--right=` 形式行为与修复前一致，不回归。
- ac-first-instance: 首实例位置参数、`opencompare://` URL、手输路径三入口既有用例全绿，扩展名白名单仍只在 `src/shared/fileExtensions.ts`。
- ac-unit-cover: 新增单测落在既有测试文件（不要新开 `.munk/code-gates.json` 门文件，也不要改该配置，xlsx 单正在用），其中必须含 `appEntry='.'` + `argv[1]=` 绝对 app 路径的用例。

## 非目标

- 不改 `CompareErrorCode` 语义与提示文案体系，不动 URL scheme 解析，不重构 singleInstance 生命周期或多窗口。
- 不引入新依赖；不碰 xlsx 域与版本号 / release notes。

## 实现约束

- 失败就地提示、不建 tab、不替换现有会话（沿用 `openFilePair` / `runSidesCompare` 语义与 `onError`）。
- 交互语义与可回归行为先落纯函数 / jsdom 断言，桌面点选验收交 `product-qa`，不建测试类 WorkItem。
- main 有未发布 commit 时按 AGENTS 逐条写「未发布：`<sha>` `<标题>` `<原因>`」。

## 本单执行约束（不 fold）

- 只动 desktop-shell / compare-request 解析与对应既有测试；预算 ≤60 分钟。
- 不推 tag、不 dispatch release、不改已公开 Release 与资产。
- 证据：门 attempt 取自 code_gates evidence 的 `latestAttemptId`，附新增单测名与两种 argv 形态实测。
