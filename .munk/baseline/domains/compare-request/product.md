# Domain: compare-request

「对比请求」入口契约域：把手工输入、启动参数（argv）与 `opencompare://compare` 三种入口汇成同一个 `CompareRequest`（左右已规范化路径 + file/directory 类型），并定义路径规范化、类型探测与错误码。UI 入口、主进程单实例/协议接管、会话构建不在本域（见非目标），但都以本域契约为唯一输入。

## 范围

- **纯解析与路径规范化**（`src/shared/`，零 Electron / React / DOM 依赖，vitest 可直接单测）：三种入口各自把原始输入解析为「左侧 / 右侧」两条已规范化的路径：
  - 手工输入：两个独立字符串（可含引号、首尾空白、`~`、相对路径）；
  - argv：`--left <path> --right <path>`、`--left=<path> --right=<path>`；两个都缺时接受裸的双位置参数；无关 Chromium/Electron 开关被忽略；
  - URL：`opencompare://compare?left=<encoded>&right=<encoded>`，做百分号解码。
- **规范化规则**：去首尾空白、剥掉成对的首尾引号、展开 `~` / `~/...`（`~user` 不展开）、相对路径按调用方显式传入的 `baseDir` 解析并做词法 `.` / `..` 折叠、绝对路径原样（仅去掉根以外的尾部斜杠）；不转小写、不做 Unicode NFC/NFD 归一，保留空格/中文/Unicode；不做 `realpath` / 符号链接解析。
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

## 非目标

- 本域不做 UI：顶栏「新建对比」入口、路径输入对话框、错误提示样式与 `Cmd/Ctrl+N` 快捷键属 `workbench` 域，本域只提供被它消费的纯契约与平台查询；不改对比算法、会话模型与任何视图。
- 不做主进程单实例锁、argv 收集、`opencompare` 协议注册、`open-url` / `second-instance` 接管、请求队列与窗口聚焦（属后续启动参数/URL 注入项）。
- 不做「保存左/右文件」原位写回，不改任何会话构建逻辑与 `WorkbenchSession` / `ComparisonSides` 语义。
- 不新增运行时依赖，不做路径沙箱/安全策略（如允许根目录白名单）。
- 不校验 file↔file 的文件家族是否一致（JSON vs YAML 等混合对仍由既有 `openFilePairSession` 拒绝），不改既有对比算法与目录扫描。
- 不做真实文件系统的端到端验收（由 product-qa 批次门覆盖），不接触打包、图标、发版脚本。
- 不做 Windows 盘符/UNC 专属规范化；只按调用方传入的 `baseDir` 与当前平台的路径分隔符处理。

## 实现约束

- 契约放在 `src/shared/`（与 `src/shared/platform/` 同级），保持零 Electron/DOM；`CompareRequest`、错误码联合类型与解析/校验入口是后续 UI 与主进程唯一依赖。
- 导出的稳定符号：`CompareRequest`、`CompareErrorCode`、`CompareResult`、`parseCompareUrl`、`parseCompareArgv`、`parseManualPaths`、`resolveCompareRequest`；`CompareErrorCode` 至少含 `MISSING_SIDE`、`DUPLICATE_SIDE`、`EMPTY_PATH`、`UNKNOWN_SCHEME`、`UNKNOWN_ACTION`、`NOT_FOUND`、`TYPE_MISMATCH`、`UNSUPPORTED_FILE_TYPE`、`ACCESS_DENIED`。
- 解析函数必须显式接收 `homeDir` / `baseDir` 等上下文参数，不读 `process.env`、`os.homedir()` 或 `window`，保证单测确定性；主进程/渲染层各自负责传入真实值。
- `PlatformPort` 只新增一个探针方法（`statPath(path)`），返回 `'file' | 'directory' | 'missing'`，不把 Node 的 `Stats` 对象泄漏到 shared/renderer。
- 支持的文件扩展名集合在 shared 定义一次（`src/shared/fileExtensions.ts`）；renderer 既有 `fileKinds.ts` 的判定改为复用它，避免两套白名单漂移（不改变既有分类结果）。
- 不新增依赖；测试用 vitest，放在既有测试布局（`src/shared/*.test.ts`、`src/renderer/src/platform/web-platform.test.ts`、`src/main/platform/electron-platform.test.ts`）。
- 所有门禁沿用 `.munk/code-gates.json`：install / lint / typecheck / build / build:web / test 全绿。

## 最近交付证明

- WI：`wi_ws_2bb64d43d7ceba21`（为手工路径入口补 `PlatformPort` 显式路径上下文，`kind: feature`）
- 日期：2026-10-20
- 结果：self_test skipped（本项无 UI 自测，改由 code_gates 关点）。
- 覆盖摘要：`PlatformPort` 新增只读查询 `homeDirectory()` / `workingDirectory()`（`src/shared/platform/types.ts`），`channels.ts` 收敛 `platform:home-directory` / `platform:working-directory` 两个白名单 channel；Electron 实现分别 `app.getPath('home')` / `process.cwd()`，preload 白名单桥接，Web 内存实现两者都返回沙箱根 `/memory`（注释说明浏览器无 cwd / home）。`electron-platform.test.ts` 断言 home 为临时目录、workdir 为 `process.cwd()`；`web-platform.test.ts` 断言两者均为 `/memory`；`App.test.tsx` 的「~ 与相对路径」用例通过覆写这两个方法固定为 `/Users/demo` / `/memory`，验证 `~/项目/a.txt` 与 `a.txt` 落到契约规定的绝对路径。本域纯契约（`parseManualPaths` / `resolveCompareRequest`）未改；服务端消费方是 `workbench` 域的 `NewCompareDialog`。
- 注：本 WI change pack 未提供 `tests/cases/**` / `tech.md` / `ux/**`，无新增折叠用例；既有 `qa/` 用例仍有效。
