# 修 Linux AppImage blockmap 字节序门并下沉本地校验

## 范围

1. **修 `.github/workflows/release.yml` 的 AppImage blockmap 门（现约 557-625 行，步骤名 `Assert the AppImage embeds its declared blockmap`）**
   - 读 AppImage 尾部 4 字节原始字节，**同时**按小端与大端解码成两个候选值，取与 `release/latest-linux.yml` 中该 AppImage 条目 `blockMapSize` 声明相等的一侧判定通过。
   - 保留上界：候选值必须 `<= 文件大小`（声明值本身也因此隐含受该上界约束），文件小于 4 字节仍失败。
   - 失败面不放宽：两种字节序都不等于声明、`blockMapSize` 声明缺失、`latest-linux.yml` 缺失、`release/*.AppImage` 不是恰好 1 个 → 仍 `exit 1`；不得改成跳过、警告、`continue-on-error` 或降级为提示。
   - 成功与失败输出保留现有可断言形状（成功含 `Verified <image>: embedded blockMapSize=<n> matches latest-linux.yml.`；失败用 `::error::` 前缀并给出声明值与实际候选值）。
   - 更正该步骤注释里「little-endian uint32」的旧表述，改为「尾部 4 字节，按小端/大端双字节序匹配声明值」。

2. **把同一自洽校验下沉到 `scripts/release-metadata.mjs`**
   - 当 `dir` 内存在 `latest-linux.yml` 时：对其中每个 `.AppImage` 的 `files[]` 条目，找到 `dir` 内同名文件，做与 workflow 完全相同的双字节序匹配（同样保留 `候选值 <= 文件大小` 上界）。
   - 失败一律非零退出并给出明确错误：AppImage 文件缺失、该条目无 `blockMapSize`、两侧候选都不等于声明、尾部候选值超过文件大小、文件小于 4 字节。不得静默通过或以“跳过”收尾。
   - `inspectReleaseMetadata()` 的既有返回结构（`ok` / `problems` / `missing` / `legacyHits` / `metadata`）继续可用，新增失败以 `problems` 表达，CLI `runReleaseMetadataCli()` 维持 `0 / 1` 退出码契约。
   - 保持“纯 Node 标准库 + 零网络 + 行扫描”的现状，不引入 YAML 解析器或第三方依赖。

3. **测试同步**
   - `src/main/release-packaging.test.ts`：删掉/改写“脚本里只出现 `readUInt32LE`”的旧断言，改为断言双序读取与双序匹配语义；把 `runAppImageGate` 夹具扩成可选择写入 BE 或 LE 尾值。
   - `src/main/release-metadata.test.ts`：现有 `latest-linux.yml` 夹具补齐 `blockMapSize` 且 AppImage 落盘为携带真实 4 字节尾值的文件（不再用 `Buffer.alloc(1)`），并按新增校验补正反用例。
   - 新增“同一临时目录上 workflow 脚本与 `release-metadata.mjs` 判定一致”的 parity 用例，防止两条规则日后漂移。

## 验收

- ac-v025-fixture-passes: 用 v0.2.5 CI 实测尾字节 `00 01 EF A4`（BE=126884，LE=2767126784）构造的 AppImage + `blockMapSize: 126884`，workflow 门脚本退出码 0 且输出含 `embedded blockMapSize=126884`。
- ac-v025-le-single-order-negative: 同一 fixture 在测试里显式断言 LE 解码 = 2767126784 且 `2767126784 !== 126884`，即旧“只读 LE”的判定在该 fixture 上必然失败；该断言与 BE 通过用例同行存在，构成负向对照。
- ac-workflow-both-mismatch-fails: 声明 126884、尾部字节使两侧候选都不等于声明时，脚本退出码非零，输出含 `::error::`，并同时给出声明值与两个候选实际值。
- ac-workflow-over-size-fails: 尾部 4 字节解出的两侧候选都大于文件大小时，脚本退出码非零（上界仍生效，不得被当成命中）。
- ac-workflow-missing-blockmap-fails: `latest-linux.yml` 中该 AppImage 条目无 `blockMapSize` 时退出码非零且错误文案含 `blockMapSize`。
- ac-workflow-missing-metadata-or-image-count: `latest-linux.yml` 缺失、或 `release/*.AppImage` 数量 != 1 时退出码非零（沿用现有 fail-closed 文案语义）。
- ac-workflow-comment-updated: 该步骤注释不再出现 `little-endian uint32`，且脚本内同时出现 `readUInt32LE` 与 `readUInt32BE`。
- ac-metadata-script-v025-passes: `inspectReleaseMetadata()` 对含上述 v0.2.5 尾字节 AppImage 的目录返回 `ok: true`；CLI `--dir` 退出码 0。
- ac-metadata-script-missing-appimage: `latest-linux.yml` 声明了 AppImage 但 `dir` 内无该文件时 `ok: false`、CLI 退出码非零、`problems` 文案含该 AppImage 文件名。
- ac-metadata-script-missing-blockmap: 该 AppImage 条目无 `blockMapSize` 时 `ok: false` 且 `problems` 含 `blockMapSize`；CLI 非零。
- ac-metadata-script-both-mismatch: 声明与实际两侧都不等时 `ok: false` 且 `problems` 同时含声明值与两个候选值；CLI 非零。
- ac-metadata-script-over-size: 尾部候选值大于文件大小时 `ok: false`；CLI 非零。
- ac-metadata-script-no-linux-yml-unaffected: 目录中只有 `latest-mac.yml` / `latest.yml`（无 `latest-linux.yml`）时，不因“缺 AppImage”报错，其余 url 命中/旧错位名校验行为与现状一致（有其它问题时仍 `ok: false`）。
- ac-parity-workflow-and-script: 对同一临时目录与同一组字节序/声明组合，workflow 门脚本的通过/失败与 `release-metadata.mjs` 的 `ok` 完全一致（至少覆盖 BE 命中、两侧不等、缺 AppImage 三种组合）。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test` 全绿；新增用例覆盖上述正反场景（`release-packaging.test.ts` + `release-metadata.test.ts` 合计新增 ≥ 4 条）。
- ac-boundaries-untouched: `git diff` 不含 tag、已上传的 8 件资产、`src/renderer/**` / `src/core/**` / `src/main/**` 运行时代码（仅测试文件）、README/signing 发布状态、`latestPublishedTag` / `lastReleasedNotesPath` 锚点、`docs/release-evidence/v0.2.4.md` 原文；不新增 `release/` 目录或任何二进制/大文件；全过程未执行 `workflow_dispatch` / `tag` / `push` / 资产上传。

## 非目标

- 不改 electron-builder 的 AppImage/blockmap 生成方式、`electron-builder.yml` 目标、构建产物形态，也不要求产出独立 `*.AppImage.blockmap` 资产。
- 不改其它平台口径：`latest-mac.yml` / `latest.yml` 的 url 命中、Windows 旧错位名检查、Windows 安装包命名规则一律不动。
- 不改写 v0.2.4 / v0.2.5 已归档证据原文（`docs/release-evidence/*.md` 中的旧“小端 uint32”描述按历史归档保留；口径以修复后的 workflow 与脚本为准，差异说明归发布收尾项）。
- 不改 tag、Release、已上传资产、README/signing 的发布状态与版本号，不回填 v0.2.5 证据，不重跑发布场（`workflow_dispatch` / tag / push / upload 一律不执行）。
- 不引入 electron-updater、不改更新客户端、不改产品运行时逻辑与 UI。
- 不把 `release-metadata.mjs` 重构成通用 YAML 解析器，不新增第三方依赖，不改动 code_gates 既有门禁命令。
- 不顺手优化 `release.yml` 其它步骤、不拆分/重排 workflow job 结构。

## 实现约束

- v0.2.5 CI 实测值固定为：尾字节 `00 01 EF A4` → BE `126884`（= 声明值）、LE `2767126784`。真实 AppImage 二进制不入仓（仓库无 `release/` 目录，且不应下载/提交几百 MB 资产），实测语义以该 4 字节 fixture 精确复现。
- 两处实现（workflow 内联 `node -e`、`scripts/release-metadata.mjs`）不强行共享代码；一致性由 ac-parity-workflow-and-script 的 parity 用例钉住。workflow 内联脚本继续保持零依赖（不得 `require('yaml')` 等）。
- `release-metadata.mjs` 只允许 `node:` 内置模块导入、零网络（已有测试守卫），并保持 `inspectReleaseMetadata()` 纯函数可测 + `runReleaseMetadataCli()` 退出码可测的两层结构。
- 双序匹配顺序与判定：候选集合 = {小端解码值, 大端解码值}；先过滤 `候选 <= 文件大小`，再判定是否存在候选 === 声明值；两侧相等且等于声明也视为通过（对称字节场景）。
- 所有失败文案保持英文 `::error::` 前缀（workflow 侧）与现有中文错误风格（脚本侧）各按现状延续，便于既有断言与日志检索。
- 测试只写临时目录（`mkdtemp`）与临时文件，不读真实 `release/`、不触网；测试文件之外不改任何源码。
