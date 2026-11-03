# tech.md — 发布资产构建期 sha256 基线（wi_intake_730ca88ee76b2f1d）

本 WI 无 UI 改动，tech 只定结构 / 数据流 / 失败口径 / 测试分层，不改页面布局，不进 Design。

## 0. 结论（一句话）

在 `release` job 的 `gh release upload` **之前**用同一份 Node 实现按同一份上传 glob 算出「上传后资产名 → {sha256, bytes}」清单并作为 workflow artifact 归档；draft 15/15 与 public L1 两处取回并合并该清单，用 `scripts/verify-release.mjs` **唯一一个**导出的纯函数逐资产比较 GitHub digest 与构建期 sha256，失败点名词 + 两个值并非零退出。检查 id / `expected=15` / 阈值 / 公开资产集合零改动。

已核对缺口成立（无需再验）：

- `scripts/verify-release.mjs` L1435-1457（draft `.[] | [.id, .name, .size, (.digest // "")]`）、L1465-1483（published `releases/tags/{tag}` 的 `.digest`）、L1688-1744（`runIdentityBytes` 把「下载后本地算的 sha256」与这个**服务端 digest** 比）——被截断/替换的字节会让 digest 同步变化，两处照绿。
- 上传取文件集合单点在 `.github/workflows/release.yml` L733-739（`assets=(release/*.dmg release/*.zip release/*.exe release/*.AppImage release/*.deb release/*.blockmap release/latest*.yml)` + `gh release upload … --clobber`）。
- public L1 现状 L1266-1278：只抽「digest 非空且体积最小」的一个资产下载后 `openssl dgst -sha256` 比 digest。
- 仓库当前**没有**导出的「本地文件名 → 上传后资产名」函数，只有两处注释记录「GitHub 把空格改写成点」（`src/main/release-metadata-gate.ts` L51-52、`scripts/release-metadata.mjs` L13）。

## 1. 结构决策

### 1.1 单一实现落点：`scripts/verify-release.mjs`（不新增脚本文件）

清单生成、名称映射、清单合并/比对纯函数全部放进已有唯一发布验收驱动 `scripts/verify-release.mjs`，由 `scripts/verify-release.d.mts` 声明类型：

| 导出 | 职责 | 纯/IO |
| --- | --- | --- |
| `UPLOAD_ASSET_GLOBS` | `['*.dmg','*.zip','*.exe','*.AppImage','*.deb','*.blockmap','latest*.yml']`，与 workflow 上传 glob 同源 | 常量 |
| `uploadAssetName(name)` | 唯一「本地文件名 → 上传后资产名」映射（`trim` + 空格→点，其余字符原样） | 纯 |
| `matchesUploadAssetGlob(name)` | 上述 glob 的唯一 JS 匹配器，构建期生成与覆盖断言共用 | 纯 |
| `buildSha256Manifest({ tag, target, files })` | `files=[{name, sha256, bytes}]` → `{ version:1, tag, target, files:[...] }`（按 name 排序、hex 校验、重名冲突即 problems） | 纯 |
| `judgeManifestCoverage({ releaseNames, manifestNames })` | 「glob 命中却没入清单」「清单有键但文件不存在」→ `{ok, problems}` | 纯 |
| `judgeBuildSha256({ releaseAssets, manifests })` | 合并 + 逐资产 digest vs 构建期 sha256 → `{ok, problems, perAsset, count, duplicates, sample}` | 纯 |
| `readSha256Manifests(world, dir, { tag })` | 递归读 `*.json`（`gh run download` 会多一层 artifact 目录）、字段/tag/target 校验 | 经 `world` 的 IO |

理由（取舍）：新建 `scripts/release-sha256-manifest.mjs` 也能满足「一处实现」，但会让「清单侧」与「断言侧」分居两文件、`verify-release.d.mts` 还要跨文件声明；放进已验证的驱动脚本后，`release.yml` / `post-release-verify.yml` 只需调同一个入口，`src/verify-release-gate.test.ts` 直接 `import` 到同一批导出（PRD「不新增测试文件」与「证据落点固定在现有两个测试文件」也就自然满足）。代价：该脚本 +≈170 行；它不是 test-debt 的受控文件（ceilings 只覆盖 4 个测试指标），无副作用。

被否决的备选：

- **单独 shell 三套实现**（`sha256sum` / `shasum -a 256` / PowerShell `Get-FileHash`）：mac/linux/win runner 三份不等价实现，且与 `release.yml` 之外的断言无法共享，直接违反「只允许一处实现」。
- **`gh api .../contents/scripts/...` 现取脚本**：finalize 内要多一次网络与 base64 解码，不如加一个 `actions/checkout@v4`（PRD 明确允许）。
- **把比对留给 jq**：`ac-public-l1-single-source` 明确禁止 YAML 内出现第二份比较规则。

### 1.2 清单格式（定为契约，被 fixture 钉住）

```json
{ "version": 1, "tag": "v0.2.18", "target": "mac",
  "files": [{ "name": "OpenCompare-0.2.18-arm64.dmg", "sha256": "<64 位小写 hex>", "bytes": 111492261 }] }
```

- `name` = **上传后资产名**（经 `uploadAssetName`），`sha256` 无 `sha256:` 前缀，`bytes` = 同一读取的字节数。
- 无时间戳、无 runner、无 run id → 同输入同字节，可断言两次生成结果相等（determinism）。
- 一个 target 一个文件：`<out>/<target>.json`；artifact 名 `sha256-manifest-${RELEASE_TAG}-${matrix.target}`（含 tag 与 target，且被 `--pattern 'sha256-manifest-*'` 命中）。

## 2. 数据流（三段，顺序被契约测试钉住）

### 2.1 构建期（`release.yml#release`，与上传同 job、严格在前）

新增两步，插在 `Upload installers to the tag's release` 之前：

1. `Compute the build-time sha256 manifest`
   ```
   node scripts/verify-release.mjs --build-sha256-manifest \
     --tag="${RELEASE_TAG}" --target="${{ matrix.target }}" --release-dir=release --out=sha256-manifest
   ```
   行为：`readdirSync(release/)` → `matchesUploadAssetGlob` 过滤 → 逐文件 `sha256File`（复用已有实现）→ `buildSha256Manifest` → `judgeManifestCoverage`（清单键集合必须逐字等于 glob 命中集合、bytes 必须等于 `statSync().size`）→ 任一 problem 立即 `exit 1`（**上传前**失败）→ 原子写 `<out>/<target>.json`。
2. `Archive the build-time sha256 manifest`：`actions/upload-artifact@v4`，`name: sha256-manifest-${{ env.RELEASE_TAG }}-${{ matrix.target }}`、`path: sha256-manifest`、`if-no-files-found: error`、`retention-days: 30`。**不加 `if:`**（清单步失败就不再上传，job 红、finalize 的 `needs: release` 直接不跑 = fail-closed）。

`Upload installers to the tag's release` 的 glob 字面量**零改动**（`ac-no-asset-set-change`）；清单目录 `sha256-manifest/` 落在 `release/` 之外，结构上不可能被 `release/*` 命中，也不可能进入 `gh release upload` 参数。

同源约束的实现方式：JS 匹配器与 bash glob 都来自同一份 `UPLOAD_ASSET_GLOBS` 语义；`release.yml` 的上传 glob 字符串保持不变，由契约测试断言「清单步与上传步出现同一串 `release/*.dmg release/*.zip …`」，并断言 `release.yml` 内不存在第二份空格→点改写（`tr ' ' '.'` / `sed` / `jq gsub` 全缺席，映射只经 `scripts/verify-release.mjs`）。

### 2.2 draft 15/15（`post-release-verify.yml` → `verify-release.mjs`）

- `release.yml#finalize` 的 `Dispatch the post-release verification` 追加 `-f release_run_id="${GITHUB_RUN_ID}"`。
- `post-release-verify.yml`：
  - `workflow_dispatch.inputs` 新增 `release_run_id`（`required: false`，默认 `''`），`env: RELEASE_RUN_ID: ${{ inputs.release_run_id }}`。
  - `permissions: { contents: write, actions: read }`（只读下载别的 run 的 artifact；`contents: write` 仍是读 draft 所需，零写不变）。
  - `verify` job 在 checkout 之后、`Verify the release assets` 之前新增 `Fetch the build-time sha256 manifests`（`shell: bash`，`if: inputs.release_run_id != ''`）：
    ```
    gh run download "${RELEASE_RUN_ID}" --repo "${GITHUB_REPOSITORY}" --pattern 'sha256-manifest-*' --dir sha256-manifests
    ```
    失败时先打印 `::error::缺构建期 sha256 清单：…`（文本可定位）再 `exit 1`；不使用 `continue-on-error`（现有契约测试禁用它）。
  - `Verify the release assets` 追加 `--sha256-manifest-dir=sha256-manifests`（有 run id 时；`${{ inputs.release_run_id != '' && '--sha256-manifest-dir=sha256-manifests' || '' }}` 若表达式过长则用 env 拼参数）。
- `scripts/verify-release.mjs`：`parseArgs` 接受 `--sha256-manifest-dir`（仅 `--layer=ci`、不得与 `--aggregate` / `--spike` 同时用）；经 `executeChecks` → `createCheckContext` 落到 `ctx.sha256ManifestDir`。
- `runIdentityBytes` 尾部（**折进现有 `identity-asset-bytes-sha256`，不新增 id**）：
  ```
  const loaded = dir === undefined ? null : readSha256Manifests(world, dir, { tag })
  → manifests === null 且 releaseState === 'draft' → fail(problems: ['缺构建期 sha256 清单 …'])
  → manifests === null 且 published              → 保持 pass，actual.buildSha256 = { status: 'not-provided', assets: 0 }
  → 否则 judgeBuildSha256({ releaseAssets: release.assets, manifests }) → problems 并入同一条 fail
  ```
  现有「下载 → 字节数 / digest」循环**整体保留**（证明传输完整 + digest 非空），构建期 sha 断言紧随其后；`expected` 增 `buildSha256: '每资产 digest == 构建期 sha256'`，`actual` 增 `buildSha256: { assets, perAsset:[{name, digest, buildSha256, bytes}], duplicates, sample }`。step log 已按 `actual:` JSON 全量落盘，`ac-fail-closed-*` 的「点名词 + 两个值」由此同时出现在 step JSON 与 log。

`aggregate` job 零改动：三个平台的同一个 id 由同一批清单算出同一结论（status 一致 → `duplicates` 冲突不触发），`expected=15` 与 id 顺序不变。

### 2.3 public L1（`release.yml#finalize`）

- `finalize` job 顶部加 `actions/checkout@v4` + `actions/setup-node@v4`（node 22）：仅为了让 `scripts/verify-release.mjs` 可被执行，**publish 与 15/15 门的先后顺序逐字不变**（checkout 在 `Resolve the tag's release state` 之前，不改变任何 step 的相对次序）。
- `Run the public L1 checks after publishing` 保留：`draft=false`、`html_url` 非空、`curl -sSIL` 逐资产 200、`--asset-urls` 计数；`Assert the tag is the latest published release` 不动。
- 删除：`openssl dgst -sha256` 抽样比对、「无资产带 digest 就失败」的内联分支（空 digest 判定归纯函数）。
- 新增：`gh run download "${GITHUB_RUN_ID}" --pattern 'sha256-manifest-*' --dir "${workdir}/manifests"`（本 run，`actions: write` ⊃ read），再用 `curl` 只下载抽样资产（体积最小的非空 digest 资产，仅作传输冒烟，**不再做任何比较**），最后：
  ```
  node scripts/verify-release.mjs --public-l1 --tag="${RELEASE_TAG}" \
    --release-json="${meta}" --sha256-manifest-dir="${workdir}/manifests" \
    --sample="${workdir}/${pick_name}" --out="${workdir}/l1"
  ```
  `--public-l1` 模式（新，仅 CLI 分支）：读 `release.json` → `readSha256Manifests` → `judgeBuildSha256` → 若给了 `--sample` 则 `sha256File(sample) === sample 的构建期 sha256`（不一致也进 problems）→ 写 `<out>/public-l1.json` → 打印
  ```
  public L1 PASS: <html_url> + <N> asset URLs 200, <N> assets digest == build sha256 (sample <name> sha256:<hex>)
  ```
  任一 problem → 每条 `::error::` + `exit 1`（资产名 + 两个值）；取回失败走 `缺构建期 sha256 清单` 文本。YAML 内不含任何比较规则（`ac-public-l1-single-source`）。

## 3. 失败口径（问题字符串格式，测试直接断言）

| 类别 | 文本（`actual.problems[]` / `::error::`） |
| --- | --- |
| digest 不等 | `<name> digest 期望(构建期) <buildSha> 实测 <digest>` |
| 发布有、清单缺 | `<name> 缺构建期 sha256` |
| 清单有、发布无 | `<name> 清单条目在发布上不存在` |
| digest 为空 | `<name> digest 为空` |
| 合并重复键冲突 | `<name> 清单重复且冲突 期望 <shaA> 实测 <shaB>`（同 sha 的重复条目合并放行） |
| 缺清单 | `缺构建期 sha256 清单：<dir> 未取回任何 sha256-manifest-*（release run <id>）` |
| 清单自身非法 | `<file> 清单不可解析 / version≠1 / target 非法 / <name> sha256 非 64 位小写 hex / <name> bytes 非整数` |
| 清单 tag 不匹配 | `清单 tag <tag> 与 --tag <tag> 不等` |

比较前把 digest 的 `sha256:` 前缀剥掉并统一小写比较（hex 大小写无关），但问题文本保留 GitHub 原值。`bytes` 只作证据与抽样选择，**不做**独立断言（digest 相等已覆盖字节差异；不扩大 ac 面）。

## 4. 测试金字塔落地（ac → 层）

L3（真机 / 真 GitHub 端到端）不在 `code_gates` 内：本 WI 明确不 dispatch、不发版，真实 draft→public 链路由 Owner 在 Ops 按需发起；本 WI 只把可确定性验证的部分压到 L1/L2。

### L1（纯函数 / 状态单测，Node，无 IO 无网络）
落 `src/verify-release-gate.test.ts`（不加新测试文件）：

| 用例 | 覆盖 ac |
| --- | --- |
| `uploadAssetName('OpenCompare Setup 0.2.18.exe')` → 点形态；无空格名恒等；多空格逐个替换 | ac-manifest-key-post-upload-name |
| `judgeManifestCoverage`：合成 v0.2.18 目录（mac 5 / win 4 / linux 3 = 12）全 match → ok；多一个 glob 命中文件 → 非 ok 且点该名；清单多一个键 → 非 ok | ac-manifest-covers-upload-set |
| `buildSha256Manifest`：排序稳定、两次调用逐字节相等、大写/带前缀/短 hex 拒收、重名不同 sha 拒收、重名同 sha 合并 | ac-manifest-key-post-upload-name / ac-manifest-pure-function |
| `judgeBuildSha256` 六类：全 match → ok；digest 不等；清单缺项；多余资产；digest 为空；重复键冲突 → 各自非 ok 且 problems 含资产名与两个值 | ac-manifest-pure-function / ac-fail-closed-* |
| `judgeBuildSha256` 抽样：`sample` 恒为最小非空 digest 资产（体积相同按 name 定序） | ac-public-l1-per-asset-digest |
| `parseArgs`：`--public-l1` 缺 `--release-json` / 缺 `--sha256-manifest-dir` 报错；`--target` 只接受 mac/win/linux；`--sha256-manifest-dir` 与 `--layer=local`、`--aggregate`、`--spike` 互斥 | ac-public-l1-single-source（入口存在且形态唯一） |
| `expectedCheckIds({layer:'ci'})` 仍 15 且顺序不变，`identity-asset-bytes-sha256` 仍在第 2 位 | ac-expected-15-unchanged |

### L2（进程内接口 / 注入 world / 内存目录）
同文件（`runVerifyReleaseCli` + `FakeHost` + `mkdtemp`）：

| 用例 | 覆盖 ac |
| --- | --- |
| `--layer=ci --platform=all --release-state=draft --sha256-manifest-dir=<tmp>` 全 match → 退出 0，summary `counts.expected=15/pass=15`，`identity-asset-bytes-sha256.actual.buildSha256.assets = 12` | ac-digest-equals-build-sha-draft |
| draft + 无 `--sha256-manifest-dir` → 退出非 0，该 step `fail`，problems 含「缺构建期 sha256 清单」 | ac-draft-manifest-required |
| draft + 目录存在但空 / 只有坏 JSON 文件 → 同上（不得当 skip） | ac-draft-manifest-required |
| draft + 某资产清单 sha 被改 → 退出非 0，problems 同时含该资产名与两个值 | ac-fail-closed-digest-mismatch |
| draft + 发布上 12 项、清单 11 项 / 清单 13 项 → 分别点名缺项 / 孤儿键 | ac-fail-closed-missing-manifest-entry / ac-fail-closed-orphan-manifest-entry |
| draft + 某资产 digest 置空 → 非 0 并点名（`identity-asset-metadata` 判据不放宽） | ac-fail-closed-empty-digest |
| 两个 manifest 同名不同 sha → 合并 conflict 非 0 点名该键与两值；同名同 sha → 放行 | ac-fail-closed-duplicate-key-conflict |
| published + 不带目录 → 退出 0，`actual.buildSha256.status='not-provided'`（可见、非静默） | PRD「published 手工复验保持现状」 |
| `--public-l1` + 临时 `release.json` + 清单 + 真实抽样文件：全 match → 0 且 stdout 含「12 assets digest == build sha256」与 `sample … sha256:<hex>`；清单缺项 / 不等 / 空 digest / 抽样文件被改 → 非 0 且点名词与两个值 | ac-public-l1-per-asset-digest / ac-public-l1-fail-closed |
| 结构断言（脚本侧）：`runIdentityBytes` 源码同时含 `sha256File` 与 `judgeBuildSha256`、`judgeBuildSha256` 只定义一次（AST/正则计数） | ac-public-l1-single-source / ac-manifest-pure-function |

`FakeHost` 只需真实 `mkdtemp` 目录（它已把 `readdir/readText/size` 落到真实 fs 并记录路径），无新注入面。

### L2 契约 / workflow（`src/main/release-packaging.test.ts` + `__fixtures__/release-packaging.json`）

新增 fixture 行（沿用现有 `steps` / `stepOrder` / `workflowChecks` / `postReleaseVerify` 结构，行数据钉 token 与顺序）：

1. `stepOrder`「release 内 manifest → upload」：`names: ['Compute the build-time sha256 manifest','Archive the build-time sha256 manifest','Upload installers to the tag\'s release']`（仓内三个名字各自唯一）。
2. `steps`（release）：清单步 `tokens` 含 `--build-sha256-manifest`、`--release-dir=release`、`--out=sha256-manifest`、`${RELEASE_TAG}`、`matrix.target`；上传步的 glob 串与**今日逐字相同**（`absent` 含 `sha256-manifest`）。
3. `steps`（release）：归档步 `uses` 前缀 `actions/upload-artifact`、`name` 含 `env.RELEASE_TAG` 与 `matrix.target`、`path: sha256-manifest`、`if-no-files-found: error`。
4. `steps`（finalize）：public L1 步 `tokens` 含 `scripts/verify-release.mjs`、`--public-l1`、`gh run download`、`--pattern 'sha256-manifest-*'`、`--sample=`；`absent` 含 `openssl dgst`。同 job 保留 `--draft=false`、`html_url`、`HTTP`、`latest`。
5. `postReleaseVerify`：`permissions` 改为 `{ contents: 'write', actions: 'read' }`；`inputs.release_run_id.required === false`；`stepOrder` 含 `Fetch the build-time sha256 manifests` → `Verify the release assets`；该步 `tokens` 含 `gh run download`、`--pattern 'sha256-manifest-*'`、`缺少构建期 sha256 清单`（或「缺构建期 sha256 清单」）、`exit 1`；verify 命令含 `--sha256-manifest-dir`。
6. `workflowChecks`：`release.yml` 的 `allRunText` 中 `gh release upload` 行之后不含 `sha256-manifest`；全文不含 `tr ' ' '.'` / `gsub(" ";".")` / `sed` 空格→点；`--draft=false` 仍只出现 1 次。
7. 可执行 shell 用例（沿用 `finalize publish gate` / `release body` 的 shim 手法）：把 public L1 步骤 `run` 落到 `mkdtemp`（`RUNNER_TEMP` 指向该目录、`cwd: repoRoot`），注入伪 `gh`（输出 `release.json` / `--pattern` 下载目录）、伪 `curl`（写抽样字节、返回 200）；断言「清单全 match → 0 且 PASS 行含资产数与 sample sha256」「清单缺项 / digest 不等 → 非 0 且输出点名词」「`--pattern` 下载失败 → 非 0 且输出含『缺构建期 sha256 清单』」。上传步同样跑一次：伪 `gh` 记录 argv，断言 argv 里没有任何 `sha256-manifest` 路径。

关于「不新增公开资产」：`ac-manifest-artifact-only` 由第 2/3/6 条 + 「`Assert the public release has every platform asset` 的后缀清单零 diff」共同证明（该步 token 不动，fixture 不加行）。

## 5. 门禁与 test-debt

- `.munk/code-gates.json` **零改动**（`test` 覆盖 `release-packaging.test.ts`，`verify-release-gate` 覆盖纯函数与注入用例）。`src/munk-gates.test.ts` 的矩阵长度钉板因此不需要动。
- `.munk/baseline/test-debt.json`：`repoTestLines` 上升必须配 `growth` 条目（`metric: repoTestLines`，`from` = 当前已提交 ceiling 45690，`to` = 实测新 ceiling，`addedCases` = 新增用例数，`reason: 构建期 sha256 清单：draft 15/15 与 public L1 逐资产核 digest`，增幅 ≤400）；`floors.repoTestCases` 只升（改成新增后的实测收集数）。
- 两个测试文件都要遵守 `scripts/test-debt-gate.mjs` 的零容忍扫描：`.ts/.tsx` 内**不得**出现 64 位小写 hex 字面量（用 `'a'.repeat(64)` / `createHash` 构造），也**不得**出现当前 `package.json#version`（`v0.2.18` / `0.2.18`）字面量——fixture JSON 不受该扫描约束，manifest 样例值放 fixture 或运行时生成。
- `src/main/release-packaging.test.ts` 的 `fixture ledger coverage` 会要求每个新 fixture 行恰好被消费一次；新增行必须被对应 `it.each` 真正引用。
- 既有断言需同批修改（否则必红）：`src/verify-release-gate.test.ts` 中 `post-release-verify` 的 `permissions` 由 `{contents:'write'}` 改为 `{contents:'write', actions:'read'}`，以及 `forbiddenPatterns` 仍不得引入 `continue-on-error` / `secrets.` / `gh release (upload|edit|create|delete)` / `git (tag|push)`。

## 6. 反范围 / scope guard（`git diff --name-only` 白名单）

允许改动：

1. `scripts/verify-release.mjs`
2. `scripts/verify-release.d.mts`
3. `.github/workflows/release.yml`
4. `.github/workflows/post-release-verify.yml`
5. `src/verify-release-gate.test.ts`
6. `src/main/release-packaging.test.ts`
7. `src/main/__fixtures__/release-packaging.json`
8. `.munk/baseline/test-debt.json`
9. `.munk/changes/wi_intake_730ca88ee76b2f1d/**`（本 change pack）

必须零 diff：`package.json`、`CHANGELOG.md`、`README*`、`docs/**`、`electron-builder.yml`、`.munk/code-gates.json`、`src/munk-gates.test.ts`、`src/main/release-metadata-gate.ts`、`scripts/release-metadata.mjs`、`release.yml` 的 `Pre-create the tag's release` / 双语 body / link / latest / 资产后缀清单等既有步骤正文。

**Baseline 同步（不是 `docs/**`，由 Delivery 按其规则处理，本阶段不写）**：`.munk/baseline/tech/overview.md` 的「发布验收与公开顺序」段需补「构建期 sha256 清单 → artifact → draft/public 逐资产核 digest」与 `post-release-verify` 的 `actions: read`；`.munk/baseline/domains/release-verify/product.md` 的验收/实现约束需补清单字段与失败口径。本 tech 只登记差异点。

## 7. 风险

| 风险 | 处置 |
| --- | --- |
| 真机只验证一次：workflow 的 `gh run download --pattern`、最终 PASS 行只能在真实 release run 上看到 | 契约测试钉结构 + 纯函数/CLI 进程内可执行用例；真实 draft→public 由 Owner 在 Ops 按需发起（本 WI 不 dispatch） |
| `gh run download` 多一层 artifact 目录，路径假设错 → 静默读不到清单 | `readSha256Manifests` 递归扫描；L2 用「嵌套布局 / 扁平布局 / 空目录 / 坏 JSON」四个用例钉住；读不到即 fail-closed |
| 三平台各自的 identity 结论来自同一批清单，若某平台下载到不同版本清单会出现 status 冲突 | `judgeBuildSha256` 的 tag/target 校验 + 合并冲突判定；aggregate 现有 `duplicates` 冲突判定继续兜底 |
| 大文件哈希吃内存（`sha256File` 用 `readFileSync`，最大 ≈130 MB） | 复用现有实现，单文件峰值与「draft 下载后校验」同量级；不改 `sha256File`（避免扩大 diff） |
| finalize 新增 checkout/setup-node 可能被误读为改变 publish 顺序 | 步骤插在 job 首部，`stepOrder` fixture 显式断言 `Make the tag's release public` 之后才有公开断言链，publish 仍唯一 |
| test-debt 棘轮与字面量扫描容易一次性打红 | 技术方案已列明 growth/floors 更新点与「测试内禁 hex / 禁版本字面量」，编码时按此落 |

## 8. 交付证据（Delivery 回执需给）

- 改动文件绝对路径清单（对照 §6 白名单）。
- 清单字段定义：`version/tag/target/files[].name|sha256|bytes` 的来源（`uploadAssetName` / 同一次读取的 `sha256File` 与字节数）。
- 失败路径用例名（L1 六类 + L2 的 `缺构建期 sha256 清单` / published `not-provided` / public L1 三条 shell 用例）。
- public L1 新输出样例（含核对资产数 12 与抽样资产 sha256），可用 `--public-l1` 的进程内用例输出充当。
- `pnpm test src/verify-release-gate.test.ts`、`pnpm test src/main/release-packaging.test.ts` 0 skipped 记录，以及全量 `.munk/code-gates.json` 顺序退出码 0 记录与 test-debt 实测值（是否落在 `<400` 内）。
