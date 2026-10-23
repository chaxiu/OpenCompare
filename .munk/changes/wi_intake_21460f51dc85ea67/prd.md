# 修复 Windows 绝对路径规范化（盘符 / 盘根 / UNC）与 Windows 测试门禁

## 范围

- 只改 `src/shared/compareRequest.ts` 的词法路径规范化：`C:\…`、`c:/…`、盘根 `C:\`、UNC `\\server\share\…` 一律识别为绝对路径，不再拼到 `baseDir`/cwd 后面；`\` 与 `/` 都作分隔符；`..` 段可折叠且不越过盘根 / UNC 共享根；成功输出统一用 `/`。
- 在 `src/shared/compareRequest.test.ts` 增加回归六例并保持既有用例全绿。
- 回显按平台转：新增纯函数 `toDisplayPath(path, platform)`（win32 下把规范 `/` 还原为 `\`，其他平台原样），并让 `resolveCompareRequest` 的错误消息在上下文显式给出 `platform: 'win32'` 时按 `\` 回显路径；未给出时保持 `/`（既有行为与既有断言不变）。
- 门禁：`.munk/code-gates.json` 增加聚焦 gate 跑本测试文件；新增独立 CI job 在 `windows-latest` 上跑同一测试文件（可放 `release.yml` 的 gates 或新建 `.github/workflows/*.yml`），真实可执行、失败即红。
- 四条入口（CLI argv、second-instance 接管、手输路径、`opencompare://`）继续复用 `parseCompareUrl` / `parseCompareArgv` / `parseManualPaths` / `resolveCompareRequest`，不新增第二套解析或 URI 解码。

## 验收

- ac-win-drive-absolute: `parseManualPaths('C:\\path\\to\\file1', 'C:\\path\\to\\file2', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/path/to/file1'`、`right === 'C:/path/to/file2'`（即输入把 `\` 换成 `/`，不含任何 cwd 前缀）。
- ac-win-lowercase-drive: `parseManualPaths('c:/path/to/file2', 'C:\\a', { baseDir: 'C:\\path\\to' })` 返回 `left === 'c:/path/to/file2'`（小写盘符 + 正斜杠仍判绝对，盘符大小写原样保留）。
- ac-win-drive-root: `parseManualPaths('C:\\', 'C:\\a', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/'`；`parseManualPaths('..\\..\\x', 'C:\\a', { baseDir: 'C:\\' })` 返回 `left === 'C:/x'`（`..` 不越过盘根，不产出 `C:/../x`）。
- ac-unc-absolute: `parseManualPaths('\\\\server\\share\\dir\\a.txt', '\\\\server\\share\\dir\\b.txt', { baseDir: 'C:\\path\\to' })` 返回 `left === '//server/share/dir/a.txt'`、`right === '//server/share/dir/b.txt'`，结果中不含 `baseDir`；`parseManualPaths('\\\\server\\share\\..\\c.txt', '\\\\server\\share\\d.txt')` 返回 `left === '//server/share/c.txt'`（不越过共享根）。
- ac-argv-windows-pair: `parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], { baseDir: 'C:\\path\\to' })` 返回 `{ ok: true, paths: { left: 'C:/a', right: 'C:/b' } }`。
- ac-cwd-windows-mixed: `parseManualPaths('C:\\path\\to\\file1', 'sub\\file2', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/path/to/file1'`、`right === 'C:/path/to/sub/file2'`；且两者都不等于 `'C:/path/to/C:/path/to/…'` 形式。
- ac-url-windows-encoded: `parseCompareUrl('opencompare://compare?left=C%3A%5Cpath%5Cto%5Ca.txt&right=%5C%5Cserver%5Cshare%5Cb.txt', { baseDir: 'C:\\cwd' })` 返回 `left === 'C:/path/to/a.txt'`、`right === '//server/share/b.txt'`（URL 入口同样只做一次规范化、不被 cwd 前缀）。
- ac-canonical-output-slash: 上述所有成功解析结果的 `left`/`right` 字符串均不含 `\`（`\` 出现次数为 0）。
- ac-fold-dotdot: `parseManualPaths('C:/a/../b', '/a/../../b', { baseDir: 'C:\\cwd' })` 返回 `left === 'C:/b'`、`right === '/b'`（折叠 `..`、不越过各自根）。
- ac-display-per-platform: `toDisplayPath('C:/path/to/file1', 'win32') === 'C:\\path\\to\\file1'`；`toDisplayPath('//server/share/dir/a.txt', 'win32') === '\\\\server\\share\\dir\\a.txt'`；`toDisplayPath('C:/', 'win32') === 'C:\\'`；`toDisplayPath('C:/a', 'darwin')` 与 `toDisplayPath('C:/a', 'linux')` 均返回 `'C:/a'`。
- ac-error-echo-platform: `resolveCompareRequest({ left: 'C:\\missing', right: 'C:\\b' }, { probe, baseDir: 'C:\\', platform: 'win32' })` 返回 `NOT_FOUND`，消息包含 `C:\missing`；同样输入不传 `platform` 时消息包含 `C:/missing`（其余错误码与优先级不变）。
- ac-single-normalizer: 同一 Windows 输入经两个入口得到同一结果——`parseManualPaths('C:\\a', 'C:\\b', ctx)` 与 `parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], ctx)` 返回相同 `paths`；`src/main/launch.ts`、`src/renderer/src/workbench/NewCompareDialog.tsx` 中不出现自写分隔符替换 / 二次解析实现。
- ac-windows-ci-gate: `.github/workflows/` 中存在 `runs-on: windows-latest` 的 job，其 step 执行 `pnpm test src/shared/compareRequest.test.ts`，无 `continue-on-error`、不是注释；`.munk/code-gates.json` 中存在 id 为 `test-compare-request`、command 为 `pnpm test src/shared/compareRequest.test.ts` 的 gate。

## 非目标

- 不动目录扫描 / 哈希 / 缓存 / 取消 / 四态（same·added·removed·modified·conflict）语义，不动快照格式。
- 不 bump 版本、不打 tag、不打包、不发版、不 push、不碰任何 Release 与已公开资产。
- 不新增第二套路径解析、URI 解码或 `normalizePath` 变体；不改 `launch.ts` / `NewCompareDialog.tsx` 的解析链路。
- 不支持未列出的路径形式：drive-relative `C:foo`、`\\?\` / `\\.\` 长路径前缀、`~user`、`~` 后接 `\` 的 Windows 家目录展开。
- 不改 UI 布局、文案、交互与错误码 / 错误优先级；除平台化回显外不改错误消息内容。
- 不做实机点选验收（本项验收 = 自动测试 + 门禁）。

## 实现约束

- 改动面限定 `src/shared/compareRequest.ts`、`src/shared/compareRequest.test.ts`、`.munk/code-gates.json` 与一个 CI workflow 文件；`compareRequest.ts` 继续保持零 `electron` / `react` / `node:` / `fs` / `path` / `os` 依赖（现有 shared purity 用例必须继续通过）。
- 内部规范形式：分隔符一律 `/`；Windows 盘符保留输入大小写；盘根输出 `C:/`；UNC 输出 `//server/share/…`；尾部多余分隔符去掉（根除外）。
- 绝对性判定在把 `\` 归一为 `/` 之后进行：`/…`、`//server/share/…`、`^[A-Za-z]:/`（含 `C:/`）为绝对；`baseDir` 自身也按同一规范化处理后再拼接。
- 回显平台由调用方显式传入（`PathContext` / `ResolveContext` 可选 `platform`），缺省保持 `/`；Win 门禁不依赖实机。
- 回归六例必须以解析结果断言（见 ac-*），不得以下游 `NOT_FOUND` 文案代替。
- 六例必须落在 `src/shared/compareRequest.test.ts` 并由 `pnpm test` 真正走到；Windows job 只跑该测试文件也必须是真实命令。
