# Domain: compare-request

「对比请求」入口契约域：把手工输入、启动参数（argv）与 `opencompare://compare` 三种入口汇成同一个 `CompareRequest`（左右已规范化路径 + file/directory 类型），并定义路径规范化、类型探测与错误码。UI 入口、主进程单实例/协议接管、会话构建不在本域（见非目标），但都以本域契约为唯一输入。

## 范围

- **纯解析与路径规范化**（`src/shared/`，零 Electron / React / DOM 依赖，vitest 可直接单测）：三种入口各自把原始输入解析为「左侧 / 右侧」两条已规范化的路径：
  - 手工输入：两个独立字符串（可含引号、首尾空白、`~`、相对路径）；
  - argv：`--left <path> --right <path>`、`--left=<path> --right=<path>`；两个都缺时接受裸的双位置参数；无关 Chromium/Electron 开关被忽略；
  - URL：`opencompare://compare?left=<encoded>&right=<encoded>`，做百分号解码。
- **规范化规则**：去首尾空白、剥掉成对的首尾引号、展开 `~` / `~/...`（`~user` 不展开）、相对路径按调用方显式传入的 `baseDir` 解析并做词法 `.` / `..` 折叠、绝对路径原样（仅去掉根以外的尾部斜杠）；不转小写、不做 Unicode NFC/NFD 归一，保留空格/中文/Unicode；不做 `realpath` / 符号链接解析。
- **Windows 绝对路径词法规范化**：先统一把 `\` 归一为 `/`，再做绝对性判定与折叠。`C:\…` / `c:/…`（盘符大小写原样保留）、盘根 `C:\` / `C:/`、UNC `\\server\share\…` 一律判为绝对，绝不拼到 `baseDir`/cwd 后面；`/…`、`//server/share/…`、`^[A-Za-z]:/` 为绝对；`C:foo`（drive-relative）不算绝对。`baseDir` 自身先按同一规则规范化再参与拼接。内部规范形式：分隔符一律 `/`，盘根输出 `C:/`，UNC 输出 `//server/share/…`，根以外去掉尾部多余分隔符；`..` 可折叠但不得越过 `/`、盘根或 UNC 共享根。成功结果不含任何 `\`。
- **按平台回显**：导出的纯函数 `toDisplayPath(path, platform)` 把规范 `/` 形式还原为平台写法（`win32` → `\`，其他平台原样），供错误消息与 UI 复用；`PathContext` / `ResolveContext` 增加可选 `platform`，`resolveCompareRequest` 在该字段显式为 `'win32'` 时用 `\` 回显错误里的路径，缺省仍用 `/`（既有断言与既有行为不变）。
- **Windows 门禁**：`.munk/code-gates.json` 增加聚焦 gate `test-compare-request`（`pnpm test src/shared/compareRequest.test.ts`），并新增独立 CI job 在 `windows-latest` 上跑同一测试文件，真实可执行、无 `continue-on-error`、失败即红——Windows 专属规则不依赖本机实机验收。
- **稳定错误码**：重复边（同一入口给出两次 left 或 right）、缺边、空串、未知 scheme/host 均产出稳定错误码与中文提示。
- **校验与类型探测**：解析结果 + `PlatformPort` 探测（`statPath` 真实路径校验 / file·directory 类型探测）合并为最终 `CompareRequest`；定义不存在、单边不存在、file↔directory 类型不一致、扩展名不受支持、权限拒绝的错误码与可读中文提示。
- **`PlatformPort` 扩展**：新增一次路径探测调用（返回 `file` / `directory` / `missing` 语义），Electron 实现走 `fs.stat`，Web 实现基于内存虚拟文件系统给出同构结果；preload 只加白名单 channel。
- **路径上下文的平台来源**：`~` 展开与相对路径解析所需的 `homeDir` / `baseDir` 由 `PlatformPort` 显式提供只读查询 `homeDirectory()` / `workingDirectory()`，Electron 实现分别用 `app.getPath('home')` 与 `process.cwd()`，Web 实现都返回内存沙箱根 `/memory`；preload 只新增白名单 channel（`platform:home-directory` / `platform:working-directory`），不暴露 Node，两套实现单测同构。
- **扩展名白名单单一来源**：支持的文件扩展名集合在 shared 定义一次，renderer 既有 `fileKinds.ts` 判定复用它，避免两套白名单漂移（不改变既有分类结果）。
- **自动化单测**：覆盖空格 / 中文 / Unicode / 引号 / `~` / 相对路径 / 缺边 / 重复参数 / 类型不匹配 / 不支持文件类型 / 权限错误；错误码与提示可直接被 UI 与主进程消费。

## 验收

- **ac-url-percent-decoded**：解析 `opencompare://compare?left=%2Ftmp%2F%E4%B8%AD%E6%96%87%20a.txt&right=%2Ftmp%2F%E4%B8%AD%E6%96%87%20b.txt` 得到左 `/tmp/中文 a.txt`、右 `/tmp/中文 b.txt`，空格与中文逐字符保留。
- **ac-url-plus-and-unicode**：query 中的 `+` 与 `%F0%9F%98%80`（emoji）解码后得到空格与对应 emoji，输出与输入语义一致且不抛异常。
- **ac-url-missing-side**：URL 只有 `left` 时返回错误码 `MISSING_SIDE`，提示含「右侧」字样，不产出 request；只有 `right` 时对称。
- **ac-url-duplicate-side**：URL 出现两次 `left` 返回 `DUPLICATE_SIDE`（先于解码/规范化判定），不产出 request。
- **ac-url-unknown-scheme**：`opencompare://merge?left=a&right=b` 与 `https://example.com/compare?left=a&right=b` 分别返回 `UNKNOWN_ACTION` 与 `UNKNOWN_SCHEME`，且不产出 request。
- **ac-argv-space-and-equals**：`['--left','/tmp/a b.txt','--right','/tmp/中文.txt']` 与 `['--left=/tmp/a b.txt','--right=/tmp/中文.txt']` 解析结果完全相同。
- **ac-argv-ignores-noise**：真实启动串（可执行文件路径 + `--inspect=5858` + `--no-sandbox` + `--left=…` + `--right=…`）只取左右路径；未知开关不进入路径，也不产生错误。
- **ac-argv-bare-pair**：两个都未用 `--left`/`--right` 时，位置参数恰好两个则依次作为左、右；位置参数只有一个时返回 `MISSING_SIDE`。
- **ac-argv-duplicate-and-empty**：`--left a --left b --right c` 返回 `DUPLICATE_SIDE`；`--left= --right=b`（左值为空）返回 `EMPTY_PATH`，均提示含对应侧别，不产出 request。
- **ac-quotes-stripped**：手工输入 `"/tmp/dir with space"`、`'/tmp/中文'` 与 `“/tmp/中文”` 均剥掉成对首尾引号；内部空格/引号保留，单边不成对的引号原样保留。
- **ac-whitespace-trim**：首尾空格、制表符、换行被去掉，内部连续空格保留；去空白后为空的输入返回 `EMPTY_PATH`。
- **ac-tilde-expanded**：给定 `homeDir=/Users/demo`，`~/项目/a.txt` → `/Users/demo/项目/a.txt`，`~` 单独 → `/Users/demo`；`~other/x` 不被展开（保持字面量）。
- **ac-relative-base**：给定 `baseDir=/work/项目`，`./a.txt` → `/work/项目/a.txt`，`../b/c.txt` → `/work/b/c.txt`，`a/../b` → `/work/项目/b`；绝对路径 `baseDir` 不参与拼接。
- **ac-trailing-separator**：`/tmp/dir/` → `/tmp/dir`，根 `/` 保持 `/`；路径不做大小写折叠，也不做 Unicode 归一化（NFC/NFD 输入原样输出）。
- **ac-request-probe-file**：两侧探测均为 `file` 且扩展名受支持（如 `.txt`、`.json`、无扩展名）时产出 `{ ok: true, request: { left, right, kind: 'file' } }`。
- **ac-request-probe-directory**：两侧探测均为 `directory` 时产出 `kind: 'directory'`；探测调用次数为每侧一次。
- **ac-side-not-found**：左侧存在、右侧不存在时返回 `NOT_FOUND`，提示含「右侧」与原始右侧路径；仅左/仅右不存在时为对称结果，均不产出 request。
- **ac-type-mismatch**：一侧 file、另一侧 directory 时返回 `TYPE_MISMATCH`，提示同时含两侧名称，不产出 request。
- **ac-unsupported-file-type**：两侧均为 file 且扩展名不受支持（如 `a.bin` / `b.exe`）时返回 `UNSUPPORTED_FILE_TYPE`，提示列出支持的家族（代码/文本 · CSV/TSV · JSON/YAML）；扩展名匹配不区分大小写。
- **ac-access-denied**：探测抛出权限错误（EACCES/EPERM）时返回 `ACCESS_DENIED` 且带可读提示，不把底层异常直接抛给调用方。
- **ac-error-precedence**：多重错误同时存在时按固定顺序返回首个：`EMPTY_PATH` → `DUPLICATE_SIDE`/`MISSING_SIDE` → `UNKNOWN_SCHEME`/`UNKNOWN_ACTION` → `NOT_FOUND` → `TYPE_MISMATCH` → `UNSUPPORTED_FILE_TYPE`；左侧问题先于右侧。
- **ac-error-shape-stable**：所有失败结果统一为 `{ ok: false, error: { code, message } }`，`code` 属于固定联合类型（上列字符串字面量），`message` 非空且为中文可读文本；解析函数对任何畸形输入都返回结果而非抛出异常。
- **ac-platform-web-parity**：Web `PlatformPort` 实现对新探测能力返回与 Electron 实现相同的 `file`/`directory`/`missing` 语义：内存中存在的文件 → `file`、目录 → `directory`、不存在路径 → `missing`；同一组路径用例在两个实现的单测中结果一致。
- **ac-platform-home-workdir**：`PlatformPort.homeDirectory()` 与 `workingDirectory()` 在两套实现中都返回绝对路径字符串：Electron 分别等于 `app.getPath('home')` 与 `process.cwd()`（单测断言），Web 均返回内存沙箱根 `/memory`；两套实现均有单测，preload 只桥接白名单 channel，renderer 不读环境变量猜测基准目录。
- **ac-pure-layer**：新增的解析/校验模块位于 `src/shared/`，不 import electron、react、node:fs 或任何 DOM API（以单测扫描 import 或 ESLint 限制断言），可被 vitest 在 node 环境直接运行。
- **ac-win-drive-absolute**：`parseManualPaths('C:\\path\\to\\file1', 'C:\\path\\to\\file2', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/path/to/file1'`、`right === 'C:/path/to/file2'`（输入 `\` 换 `/`，不含任何 cwd 前缀）。
- **ac-win-lowercase-drive**：`parseManualPaths('c:/path/to/file2', 'C:\\a', { baseDir: 'C:\\path\\to' })` 返回 `left === 'c:/path/to/file2'`（小写盘符 + 正斜杠仍判绝对，盘符大小写原样保留）。
- **ac-win-drive-root**：`parseManualPaths('C:\\', 'C:\\a', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/'`；`parseManualPaths('..\\..\\x', 'C:\\a', { baseDir: 'C:\\' })` 返回 `left === 'C:/x'`（`..` 不越过盘根，不产出 `C:/../x`）。
- **ac-unc-absolute**：`parseManualPaths('\\\\server\\share\\dir\\a.txt', '\\\\server\\share\\dir\\b.txt', { baseDir: 'C:\\path\\to' })` 返回 `left === '//server/share/dir/a.txt'`、`right === '//server/share/dir/b.txt'` 且不含 `baseDir`；`parseManualPaths('\\\\server\\share\\..\\c.txt', '\\\\server\\share\\d.txt')` 返回 `left === '//server/share/c.txt'`（不越过共享根）。
- **ac-argv-windows-pair**：`parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], { baseDir: 'C:\\path\\to' })` 返回 `{ ok: true, paths: { left: 'C:/a', right: 'C:/b' } }`。
- **ac-cwd-windows-mixed**：`parseManualPaths('C:\\path\\to\\file1', 'sub\\file2', { baseDir: 'C:\\path\\to' })` 返回 `left === 'C:/path/to/file1'`、`right === 'C:/path/to/sub/file2'`，且都不等于 `'C:/path/to/C:/path/to/…'` 形式。
- **ac-url-windows-encoded**：`parseCompareUrl('opencompare://compare?left=C%3A%5Cpath%5Cto%5Ca.txt&right=%5C%5Cserver%5Cshare%5Cb.txt', { baseDir: 'C:\\cwd' })` 返回 `left === 'C:/path/to/a.txt'`、`right === '//server/share/b.txt'`（URL 入口同样只做一次规范化、不被 cwd 前缀）。
- **ac-canonical-output-slash**：上述所有成功解析结果的 `left`/`right` 字符串均不含 `\`（出现次数为 0）。
- **ac-fold-dotdot**：`parseManualPaths('C:/a/../b', '/a/../../b', { baseDir: 'C:\\cwd' })` 返回 `left === 'C:/b'`、`right === '/b'`（折叠 `..`、不越过各自根）。
- **ac-display-per-platform**：`toDisplayPath('C:/path/to/file1', 'win32') === 'C:\\path\\to\\file1'`；`toDisplayPath('//server/share/dir/a.txt', 'win32') === '\\\\server\\share\\dir\\a.txt'`；`toDisplayPath('C:/', 'win32') === 'C:\\'`；`toDisplayPath('C:/a', 'darwin')` 与 `('C:/a', 'linux')` 均返回 `'C:/a'`。
- **ac-error-echo-platform**：`resolveCompareRequest({ left: 'C:\\missing', right: 'C:\\b' }, { probe, baseDir: 'C:\\', platform: 'win32' })` 返回 `NOT_FOUND` 且消息含 `C:\missing`；同样输入不传 `platform` 时消息含 `C:/missing`（其余错误码与优先级不变）。
- **ac-single-normalizer**：`parseManualPaths('C:\\a', 'C:\\b', ctx)` 与 `parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], ctx)` 返回相同 `paths`；`src/main/launch.ts`、`src/renderer/src/workbench/NewCompareDialog.tsx` 中不出现自写分隔符替换 / 二次解析实现。
- **ac-windows-ci-gate**：`.github/workflows/` 中存在 `runs-on: windows-latest` 的 job，其 step 执行 `pnpm test src/shared/compareRequest.test.ts`，无 `continue-on-error`、不是注释；`.munk/code-gates.json` 中存在 id 为 `test-compare-request`、command 为 `pnpm test src/shared/compareRequest.test.ts` 的 gate。

## 非目标

- 本域不做 UI：顶栏「新建对比」入口、路径输入对话框、错误提示样式与 `Cmd/Ctrl+N` 快捷键属 `workbench` 域，本域只提供被它消费的纯契约与平台查询；不改对比算法、会话模型与任何视图。
- 不做主进程单实例锁、argv 收集、`opencompare` 协议注册、`open-url` / `second-instance` 接管、请求队列与窗口聚焦（已由 `launch` 域交付；本域只提供被它调用的 `parseCompareArgv` / `parseCompareUrl` / `resolveCompareRequest`，不承载 Electron 绑定与投递时序）。
- 不做「保存左/右文件」原位写回，不改任何会话构建逻辑与 `WorkbenchSession` / `ComparisonSides` 语义。
- 不新增运行时依赖，不做路径沙箱/安全策略（如允许根目录白名单）。
- 不校验 file↔file 的文件家族是否一致（JSON vs YAML 等混合对仍由既有 `openFilePairSession` 拒绝），不改既有对比算法与目录扫描。
- 不做真实文件系统的端到端验收（由 product-qa 批次门覆盖），不接触打包、图标、发版脚本。
- 不支持未列出的路径形式：drive-relative `C:foo`（按相对路径拼 `baseDir`）、`\\?\` / `\\.\` 长路径前缀、`~user`、`~` 后接 `\` 的 Windows 家目录展开。
- 不新增第二套路径解析、URI 解码或 `normalizePath` 变体；四条入口（CLI argv、second-instance 接管、手输路径、`opencompare://`）继续复用同一套 `parseCompareUrl` / `parseCompareArgv` / `parseManualPaths` / `resolveCompareRequest`，不改 `launch.ts` / `NewCompareDialog.tsx` 的解析链路。
- 不改 UI 布局、文案、交互与错误码 / 错误优先级；除按 `platform` 回显分隔符外不改错误消息内容。
- 不做实机点选验收（Windows 规则的验收 = 自动测试 + 聚焦 gate + `windows-latest` CI job），不动打包、版本号、tag 与 Release 资产。

## 实现约束

- 契约放在 `src/shared/`（与 `src/shared/platform/` 同级），保持零 Electron/DOM；`CompareRequest`、错误码联合类型与解析/校验入口是后续 UI 与主进程唯一依赖。
- 导出的稳定符号：`CompareRequest`、`CompareErrorCode`、`CompareResult`、`parseCompareUrl`、`parseCompareArgv`、`parseManualPaths`、`resolveCompareRequest`、`toDisplayPath`；`CompareErrorCode` 至少含 `MISSING_SIDE`、`DUPLICATE_SIDE`、`EMPTY_PATH`、`UNKNOWN_SCHEME`、`UNKNOWN_ACTION`、`NOT_FOUND`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE`、`ACCESS_DENIED`。
- 解析函数必须显式接收 `homeDir` / `baseDir` 等上下文参数，不读 `process.env`、`os.homedir()` 或 `window`，保证单测确定性；主进程/渲染层各自负责传入真实值。
- `PlatformPort` 只新增一个探针方法（`statPath(path)`），返回 `'file' | 'directory' | 'missing'`，不把 Node 的 `Stats` 对象泄漏到 shared/renderer。
- 支持的文件扩展名集合在 shared 定义一次（`src/shared/fileExtensions.ts`）；renderer 既有 `fileKinds.ts` 的判定改为复用它，避免两套白名单漂移（不改变既有分类结果）。
- 绝对性判定在 `\` → `/` 归一之后进行；实现拆成 `toPosixSeparators` / `isAbsolutePath` / `splitPathRoot`（切成不可变根 `/`、`C:/`、`//server/share` 与可折叠余段）/ `foldPath` 四个纯函数，`..` 折叠只在根之下的余段内进行，因此天然不越过盘根与共享根。
- 回显平台由调用方显式传入（`PathContext` / `ResolveContext` 可选 `platform`），缺省保持 `/`；Win 规则不依赖实机，全部由单测断言解析结果（不得以下游 `NOT_FOUND` 文案代替）。
- 不新增依赖；测试用 vitest，放在既有测试布局（`src/shared/*.test.ts`、`src/renderer/src/platform/web-platform.test.ts`、`src/main/platform/electron-platform.test.ts`）。
- 所有门禁沿用 `.munk/code-gates.json`：install / lint / typecheck / build / build:web / test 全绿；另加聚焦 gate `test-compare-request`（仅跑 `src/shared/compareRequest.test.ts`），Windows 专属规则由 `.github/workflows/windows.yml` 的 `windows-latest` job 跑同一命令兜底。

## 最近交付证明

- WI：`wi_intake_21460f51dc85ea67`（修复 Windows 绝对路径规范化：盘符 / 盘根 / UNC + Windows 测试门禁，`kind: fix`）
- 日期：2026-10-23
- 结果：self_test skipped（本项无可点的 UI 面，验收 = 单测断言 + `test-compare-request` 聚焦 gate + `windows-latest` CI job，改由 code_gates 关点）。
- 覆盖摘要：`src/shared/compareRequest.ts` 的规范化拆成 `toPosixSeparators`（`\`→`/`）、`isAbsolutePath`（`/…`、`//server/share…`、`^[A-Za-z]:/`）、`splitPathRoot`（不可变根 `/`、`C:/`、`//server/share`）、`foldPath`（`..` 只在根下余段折叠）。因此 `C:\…` / `c:/…` / 盘根 `C:\` / UNC `\\server\share\…` 不再被拼到 `baseDir` 后；盘符大小写保留，成功输出统一 `/`；`//server` 只保留为 `//server` 根，而 server 段为空的 `///x` 退化到 `/` 根。新增导出纯函数 `toDisplayPath(path, platform)`（`win32` → `\`，其他平台原样），`PathContext` / `ResolveContext` 增加可选 `platform`，`resolveCompareRequest` 错误消息仅在显式 `platform: 'win32'` 时用 `\` 回显，缺省 `/`（既有断言不变）。`compareRequest.test.ts` 新增 `describe('Windows absolute paths')` 11 个用例，逐条对上 ac-win-* / ac-unc-* / ac-argv-windows-pair / ac-cwd-windows-mixed / ac-url-windows-encoded / ac-canonical-output-slash / ac-fold-dotdot / ac-display-per-platform / ac-error-echo-platform / ac-single-normalizer（后者含源码扫描：`launch.ts` 与 `NewCompareDialog.tsx` 只 import 本模块、无自写分隔符替换），文件内 46 个用例全绿；shared purity 用例（不 import electron/react/node/DOM）与新用例同文件通过，源文件仍零 `node:` / `fs` / `path` / `os` 依赖。门禁侧 `.munk/code-gates.json` 新增 `test-compare-request`（`pnpm test src/shared/compareRequest.test.ts`），并新增 `.github/workflows/windows.yml`：`windows-latest` + node 22 + pnpm 10.18.3，`pnpm install --frozen-lockfile` 后跑同一测试文件，无 `continue-on-error`。
- 注：本 WI change pack 只提供 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无新增折叠用例、无 tech/ux 手合；既有 `qa/` 用例仍有效。原「不做 Windows 盘符/UNC 专属规范化」的非目标已被本项推翻并从非目标移除。
