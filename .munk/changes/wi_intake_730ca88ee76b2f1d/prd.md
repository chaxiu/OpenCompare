# 发布资产构建期 sha256 基线：draft 15/15 与 public L1 逐资产核 digest

## 范围

### 现状与事实核对（已在本 worktree 核实，作为需求前提）

- 现有 15 项中的 sha 基准**确实是 GitHub 服务端 digest，不是构建期值**：`scripts/verify-release.mjs` 的 `runIdentityMetadata` 取 `asset.digest`（`releases/{id}/assets` 的 `.digest // ""`，见 L1440-1480），`runIdentityBytes` 把「下载后本地算的 sha256」与这个 digest 比（L1689-1738）。因此「抽最小资产下载后算 sha256 与 release digest 比对」只能证明下载没坏，证明不了上传没坏：被截断/替换的字节会让 digest 同步变化，两处检查照绿。**本需求的缺口成立，无需据实调整既有 15 项口径。**
- public L1 现状（`.github/workflows/release.yml`，`Run the public L1 checks after publishing`）：`releases/tags/{tag}` 拿 `html_url` 与全部 `assets[]`，逐个 `curl -sSIL` 断言 200，然后只取「digest 非空且体积最小」的一个资产下载后 `openssl dgst -sha256` 与 digest 比对，PASS 行打印该资产的 digest。
- 上传取文件集合（`Upload installers to the tag's release`）：`release/*.dmg release/*.zip release/*.exe release/*.AppImage release/*.deb release/*.blockmap release/latest*.yml`，随后 `gh release upload "${RELEASE_TAG}" "${assets[@]}" --clobber`。mac/win/linux 三个 matrix target 各自只在自己的 workspace 产出本平台文件，按 v0.2.17 实测资产表共 12 个：mac 5（`*.dmg`、`*.dmg.blockmap`、`*-arm64-mac.zip`、`*.zip.blockmap`、`latest-mac.yml`）、win 4（`OpenCompare-Setup-<ver>.exe`、`.exe.blockmap`、`OpenCompare-<ver>-win-x64.zip`、`latest.yml`）、linux 3（`*.AppImage`、`opencompare_<ver>_amd64.deb`、`latest-linux.yml`）。`src/main/__fixtures__/release-packaging.json` 的 `evidence.currentVersion.assets` 记录了同一形状。
- 名称映射：`electron-builder.yml` 已把 win / nsis 的 `artifactName` 固定为无空格形态，因此当前上传名等于本地 `basename`；但仓库唯一记录的「上传后资产名」规则是「GitHub 把空格改写成点」（`src/main/release-metadata-gate.ts` L51-52 与 `scripts/release-metadata.mjs` L13 的同一注释，`latest*.yml` 对账门也按公开资产名集合比对）。仓库当前**没有**导出的「本地文件名 → 上传后资产名」函数，所以本需求要求把它收敛成唯一一份，而不是新增第二套。

### 1) 构建期基线

- release matrix 的每个 target 在 `gh release upload` **之前**，对本平台将上传的每个文件逐一算 sha256，产出清单（JSON 或 TSV 均可），键为「上传后实际资产名」，值为其 sha256（hex，无前缀）+ 字节数。
- 清单文件集合必须与上传步骤的取文件 glob **逐一对齐**：同一个 glob 源，不允许清单另写一份枚举；`release/` 下命中 glob 却未进清单、或清单有键而文件不存在，都得在构建期就失败。
- 名称映射只允许一处实现并同时服务「清单生成」与「两处断言」；`release.yml` 内不得出现第二份空格→点的内联改写。
- 清单作为 workflow artifact 上传（每个 target 一个，名字含 tag 与 target），**不新增公开 Release 资产、不改 Release 正文、不改公开发布资产集合**。

### 2) 两处断言

- **发布前（draft 15/15）**：`scripts/verify-release.mjs` 取回各 target 清单并合并，逐资产断言「GitHub digest 去掉 `sha256:` 前缀 == 构建期 sha256」。资产在清单中缺失、清单条目对应资产不存在、digest 为空、任一不等 → 非零退出并点名资产名与两个值（合并阶段同一键出现两个不同 sha 也判失败）。断言落在现有 15 项之内（`identity-asset-bytes-sha256`），不新增检查 id。
- **发布后（public L1）**：取回同一次 release run 的清单，逐资产做同一比较；保留现有 `draft=false` / `html_url` / 每个资产 `HTTP 200` / latest-release 检查。原「抽最小资产下载比对」可保留为抽样冒烟，但不再作为唯一 sha 依据。PASS 行必须给出「核对资产数」，例如 `public L1 PASS: <html_url> + 12 asset URLs 200, 12 assets digest == build sha256 (sample OpenCompare-Setup-0.2.18.exe sha256:…)`。
- 断言逻辑只有一份：public L1 必须复用 `verify-release.mjs` 导出的同一纯函数（新增一个最小的 CLI/调用入口即可），不得在 YAML 里复制比较规则。

### 3) 门与回归

- `scripts/verify-release.mjs` 的清单比对抽成导出纯函数（无 IO、无网络、无时钟），补用例：全 match → 0；digest 不等 → 非零；清单缺项 / 多余资产 → 非零；另加 digest 为空与合并阶段重复键冲突。
- 发布契约测试（`src/main/release-packaging.test.ts` + `src/main/__fixtures__/release-packaging.json`，或同等 `src/` 发布测试）断言 workflow 里存在三段链路——「构建期算 sha256 → artifact 上传 → finalize 取回并逐资产比对」——以及缺清单 fail-closed 分支；`.munk/code-gates.json` 不新增门（`test` 门已覆盖），全量 `code_gates` 自绿。

### 4) 反范围（用户已明确）

- 不动已公开 tag / Release / 资产；不改发布资产集合（不新增 `SHA256SUMS` 类公开资产）；不改 Release 正文组装规则；不改 `package.json#version` / `CHANGELOG` / `README*` / `docs/release-notes/*` 的版本语义单点文件；不重写发布流程其余环节；本 WI 不发版、不 dispatch、不推 tag。

## 验收

- ac-manifest-before-upload: release matrix 中「构建期 sha256 清单」步骤与 `Upload installers to the tag's release` 同属 `release` job，且步骤序号严格在前；契约测试可断言该顺序（清单步骤名与上传步骤名各自唯一）。
- ac-manifest-covers-upload-set: 清单键集合逐 target 等于该 target 上传步骤会发送的文件集合（对 v0.2.18 形状即 mac 5 / win 4 / linux 3，合计 12）；用合成 `release/` 目录列表调纯函数，命中上传 glob 而未入清单的文件、以及清单有键但文件缺失，都返回非 ok。
- ac-manifest-key-post-upload-name: 清单键取「上传后实际资产名」，且由**唯一**共享映射函数产出；给一个含空格的本地产物名，键里的空格被改写成点（与现有 `release-metadata` 门记录的 GitHub 上传名规则一致）；`release.yml` 中不出现第二份空格→点的改写实现（契约测试断言该映射的调用点存在且仅有共享实现）。
- ac-manifest-artifact-only: 每个 target 的清单作为 workflow artifact 上传，artifact 名含 `RELEASE_TAG` 与 target；清单不以任何形式进入 Release 资产（workflow 内无把清单交给 `gh release upload` 的路径），公开发布资产集合与现有 12 项语义不变。
- ac-digest-equals-build-sha-draft: draft 验证取回并合并各 target 清单后，逐资产断言 digest（剥 `sha256:`）== 构建期 sha256；全部相等时该检查仍为 `pass`，`counts.expected` 仍为 15、id 与顺序不变。
- ac-fail-closed-digest-mismatch: 任一资产 digest 与构建期 sha256 不等 → 该检查 `fail`、脚本非零退出，`actual.problems` 同时给出资产名与两个值（期望构建期 sha、实测 digest）。
- ac-fail-closed-missing-manifest-entry: 发布上存在但合并清单中缺失的资产 → 非零退出并点名资产名，不降级为 skip / warn。
- ac-fail-closed-orphan-manifest-entry: 清单条目对应的资产在发布上不存在 → 非零退出并点名该清单键。
- ac-fail-closed-empty-digest: 任一资产 `digest` 为空 → 非零退出并点名资产名（现有 `identity-asset-metadata` 判定不放宽）。
- ac-fail-closed-duplicate-key-conflict: 合并阶段同一资产名出现两条不同 sha256 的清单条目 → 非零退出并点名该键与两个值。
- ac-draft-manifest-required: draft 模式拿不到任何清单（缺 artifact / 下载失败 / 目录为空）→ 非零退出，失败原因文本可定位（点明「缺构建期 sha256 清单」），不得当成「未提供则跳过」。
- ac-expected-15-unchanged: `expectedCheckIds({layer:'ci'})` 仍恰为 15 个 id 且顺序不变，清单断言折进 `identity-asset-bytes-sha256`；不新增检查 id、不出现 skip、`judgeReleaseGate` / `validateSummary` 阈值不放宽。
- ac-public-l1-per-asset-digest: public L1 对全部资产断言 digest（剥 `sha256:`）== 构建期 sha256，输出行含核对资产数量与抽样资产的 sha256；保留 `draft=false`、`html_url` 200、逐资产 `browser_download_url` 200、latest-release 检查。
- ac-public-l1-fail-closed: public L1 在上述任一条件不满足时非零退出并点名资产名与两个值（不等 / 清单缺项 / 多余条目 / digest 为空 / 清单取回失败），且不执行任何写 Release / 资产的命令（`gh release edit|upload|create|delete` 仍为 0）。
- ac-public-l1-single-source: public L1 的比对通过 `scripts/verify-release.mjs` 导出的同一纯函数完成（契约测试断言该步骤引用了该脚本/该导出），YAML 内没有第二份比较规则。
- ac-manifest-pure-function: `scripts/verify-release.mjs` 导出清单比对纯函数并给出 `{ok, problems}`；用例覆盖全 match → ok/退出 0、digest 不等 → 非 ok、清单缺项 → 非 ok、多余资产 → 非 ok、digest 为空 → 非 ok、重复键冲突 → 非 ok；`scripts/verify-release.d.mts` 同步声明，`pnpm typecheck` 通过。
- ac-workflow-contract-test: `src/main/release-packaging.test.ts`（配 `src/main/__fixtures__/release-packaging.json` 行数据）断言「构建期算 sha256 → artifact 上传 → finalize/verify 取回并逐资产比对」三段在 workflow 中存在、顺序成立，且缺清单 fail-closed 分支有对应 token（`exit 1` + 点名词）；public L1 步骤的可执行用例至少覆盖「清单全 match → 0」与「清单缺项/不等 → 非零」。
- ac-no-asset-set-change: workflow 的公开 Release 资产集合（上传 glob 与 `Assert the public release has every platform asset` 的后缀/精确名清单）零改动；无新增公开 checksum 资产。
- ac-no-version-or-docs-change: `package.json#version`、`CHANGELOG.md`、`README*`、`docs/release-notes/*`、`electron-builder.yml` 零 diff；Release 正文组装步骤（`Pre-create the tag's release` / 双语 body 门）零 diff。
- ac-gates-green: 全量 `.munk/code-gates.json` 顺序执行退出码 0；新增用例后 `.munk/baseline/test-debt.json` 按 ratchet 更新（`growth` 条目 `addedCases` 与行数增量如实记录、增幅 ≤400、`floors` 只升不降、`ceilings` 只降不升），`pnpm test src/verify-release-gate.test.ts` 与 `pnpm test src/main/release-packaging.test.ts` 全绿 0 skipped。
- ac-delivery-evidence: Delivery 回执给出可复核绝对路径：改动的文件清单、清单字段定义（键/值/字节数/来源）、失败路径用例名、public L1 新输出样例（含核对资产数与抽样 sha256）。

## 非目标

- 不做 UI / 交互改动；本 WI 不进入 Design。
- 不新增公开的 `SHA256SUMS` / checksums 资产，不改 Release 正文、标题、latest 语义与资产名规则。
- 不重写 `post-release-verify.yml` 的 15 项注册表、A/B 分层、aggregate 证据重定位与触发面；只加「取回构建期清单」的必要管道（输入 + 只读下载 + 权限）。
- 不改签名 / 公证 / Authenticode 口径，不改 Linux GUI 腿，不改 `expected=15`。
- 不改 `docs/**`（含 `docs/lessons.md` 记录）与任何版本语义单点文件。
- 不发版、不打 tag、不 dispatch、不推远端；不修改已公开 v0.2.17 Release 与资产。

## 实现约束

- **单一名称映射**：清单键 = 上传后资产名，映射实现只允许一处（推荐抽到脚本侧导出函数，`release.yml` 与 `verify-release.mjs` 都调它），沿用现有 GitHub「空格→点」规则；两处断言与清单生成共用，禁止内联第二份。
- **清单格式最小**：建议 JSON `{ version: 1, tag, target, files: [{ name, sha256, bytes }] }`；`sha256` 为 64 位小写 hex（无 `sha256:` 前缀），`name` 为上传后资产名。字段一旦定下就要被契约测试钉住。
- **清单产出必须与上传集合同源**：清单步骤用与 `Upload installers to the tag's release` 完全相同的 glob（`release/*.dmg *.zip *.exe *.AppImage *.deb *.blockmap latest*.yml`），不另写枚举；建议直接用 Node 计算（mac/linux/win runner 都有 node，避免 `sha256sum`/`shasum`/PowerShell 三套实现）。
- **跨 workflow 取回**：draft 15/15 跑在 `post-release-verify` 的独立 run 里，因此 `release.yml` 的 `finalize` 需要把本次 release run 的 id 传给 dispatch，`post-release-verify.yml` 增加只读的 `actions: read` 与一次 `gh run download <run_id> --pattern 'sha256-manifest-*'`，再以目录参数交给 `scripts/verify-release.mjs`。public L1 在 `finalize` 内（同一 run，已有 `actions: write`）直接 `gh run download` 本 run 的清单；若必须复用同时引入 `actions/checkout@v4` 才能 import 该纯函数，允许在 `finalize` 内加一个 checkout 步骤，但不得因此改变 publish 与 15/15 门的先后顺序。
- **published 手工复验保持现状**：人工 `workflow_dispatch mode=published` 不带 run id 时，清单断言在 `actual` 里显式标为未提供（可见、非静默），既有检查语义不变；公开发布前后的强制断言点固定为 draft 15/15 与 public L1 两处。
- **失败信息可复核**：任一不等/缺项必须在 step `actual.problems` 与 step log 同时出现资产名 + 期望（构建期 sha/清单键）+ 实测（digest/资产存在性），不得只写「校验失败」。
- **只读纪律**：清单取回与 public L1 全程只读；`gh release upload` 仍只在 release matrix、`gh release edit --draft=false` 仍只在 finalize 的 publish 步骤，其余步骤零写 Release / tag / 资产。
- **证据落点**：纯函数与注入用例落 `src/verify-release-gate.test.ts`（不联网、不启窗口）；workflow 契约与可执行 shell 用例落 `src/main/release-packaging.test.ts` + 其 JSON fixture；不新增测试文件、不把断言搬到 `.munk/`。
