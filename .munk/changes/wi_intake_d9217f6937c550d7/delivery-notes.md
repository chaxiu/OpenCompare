# Delivery notes — 外置 release 资产/品牌与打包测试台账到 fixtures 并改为表驱动断言

WorkItem: `wi_intake_d9217f6937c550d7` · 基线 `main = 3467844` · test-only 清债
变更集（仅以下文件）：
- `src/main/release-artifacts-and-brand.test.ts`（重写为表驱动）
- `src/main/release-packaging.test.ts`（重写为表驱动）
- `src/main/__fixtures__/release-artifacts-and-brand.json`（新增）
- `src/main/__fixtures__/release-packaging.json`（新增）
- `.munk/changes/wi_intake_d9217f6937c550d7/delivery-notes.md`（本文件）

未改：任何产品源码、`package.json`、`electron-builder.yml`、`.github/workflows/**`、`docs/**`、`CHANGELOG.md`、
`README*.md`、`vitest.config.mts`、共享 helper `src/main/release-doc-fixtures.test-helpers.ts`、`.munk/code-gates.json`。

## 1. 改前 / 改后实测数字

| 指标 | 基线 3467844 | 本 worktree | 结论 |
| --- | --- | --- | --- |
| `release-artifacts-and-brand.test.ts` 行数 | 926 | **396** | 满足 120–600 |
| `release-packaging.test.ts` 行数 | 915 | **484** | 满足 120–600 |
| 两文件合计行数 | 1,841 | **880** | ≤ 1,100 |
| `toContain`（含 `not.toContain`） | 251（152 + 99） | **8（4 + 4）** | ≤ 20，仅 2 个 helper/file |
| `readFileSync` | 14（12 + 2） | **4（2 + 2）** | ≤ 4，仅 import + 1 个通用 `readBytes`/file |
| 两文件执行用例 | 286 | **330 passed (330)** | ≥ 272 |
| fixture 文件 | 0 | 2（814 / 786 行 JSON） | UTF-8 `JSON.parse` OK，`schemaVersion: 1` |
| fixture 台账行 | 0 | **136**（A 61 / B 75） | 全部被消费（见 §2） |
| 全仓测试文件 | 115 | **115** | 未新增/删除测试文件 |
| 全仓测试行数 | 47,809 | **46,848**（-961） | 恰为两文件 1,841 → 880 的差值，其余 113 个测试文件 0 改动 |
| 全仓非测试 `ts/tsx/mjs/mts` | 145 / 32,104 | **145 / 32,104** | 0 改动（`git status` 仅 2 个测试文件 + 2 个新 fixture） |
| `package.json#version` | 0.2.16 | **0.2.16** | 未 bump |

`toContain` 保留项（8 处）逐条理由：
- A：`expectTokens` 内的 `expect(...).toContain` 1 处 + `expectAbsent` 内的 `expect(...).not.toContain` 1 处（通用 helper，所有 token 比对都走它们）。
- B：同上，`expectTokens` 1 处 + `expectAbsent` 1 处。
- 上述 4 处即全部真实断言调用；`rg -o 'toContain'` 另计入每文件 2 次 helper 注释单词（`// The only toContain / not.toContain helpers in this file.`），合计 8，无任何直接写在用例里的 `toContain`。

## 2. 覆盖率口径（两项机械可复现 + 第三项不可用说明）

1. **断言点替代覆盖 = 251 / 251 = 100%**
   基线两文件共 251 处 `toContain`，逐条映射见 §6；生成脚本对基线 152 + 99 条断言做了区间覆盖校验（任何未覆盖行直接抛错，实测输出 `mapping rows: 251`）。
2. **台账行断言覆盖 = 136 / 136 = 100%**
   每个 fixture 行都有唯一 `id`，测试内 `useRow(id)` 记录消费；文件末尾不变量用例
   `fixture ledger coverage > consumes every fixture row exactly once by id` 断言
   `referencedIds.sort()` 与 `fixtureRowIds.sort()` 全等，并校验 id 无重复。
   实测：`Tests 330 passed (330)` 中包含该用例；A 61 行 + B 75 行全部被 `it.each` / 顺序表消费。
3. **行覆盖率不可用（不编造数字）**
   仓库未安装 coverage provider，实测：
   ```
   $ pnpm exec vitest run --coverage --coverage.provider=v8 src/main/release-packaging.test.ts
    MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
   ```
   本项禁止新增依赖/脚本，故不提供行覆盖率数字；上面的断言点覆盖与台账行覆盖是可机械复现的替代口径。

## 3. 注入实验（真实失败输出 + 恢复回绿）

### 3.1 篡改 `.github/workflows/release.yml`（Windows update feed 的 `if:`）

```
 FAIL  src/main/release-artifacts-and-brand.test.ts > release workflow step contracts > windows-feed satisfies Assert the Windows update feed points a…
AssertionError: Assert the Windows update feed points at the NSIS installer: if: expected 'matrix.target == \'linux\'' to be 'matrix.target == \'win\'' // Object.is equality

Expected: "matrix.target == 'win'"
Received: "matrix.target == 'linux'"
```

恢复：`git checkout -- .github/workflows/release.yml` → 复跑
`pnpm test src/main/release-artifacts-and-brand.test.ts src/main/release-packaging.test.ts` →
`Tests  330 passed (330)`。

### 3.2 篡改 fixture 期望字段（`steps[mac-app-identity].tokens` 里的 `CFBundleIconFile`）

```
 FAIL  src/main/release-artifacts-and-brand.test.ts > release workflow step contracts > mac-app-identity satisfies Locate the packaged app and assert its …
AssertionError: Locate the packaged app and assert its icon and version: CFBundleIconFileX: expected 'tag="${RELEASE_TAG#v}"\napp="$(find r…' to contain 'CFBundleIconFileX'
```

失败信息点名 fixture 行（`mac-app-identity`）、步骤名与缺失 token。恢复 fixture 后复跑 →
`Tests  330 passed (330)`。

### 3.3 篡改证据台账（`docs/release-evidence/v0.2.16.md` 的 `| 资产数 | 12 |` → 13）

```
 FAIL  src/main/release-packaging.test.ts > release evidence ledger (table-driven) > evidence-v0.2.16 maps to its status and asset count
AssertionError: v0.2.16: 资产数: expected 13 to be 12 // Object.is equality

- Expected
+ Received

- 12
+ 13
```

同一次运行同时点亮 `v0.2.16 asset rows satisfy the declared count`（同样点名 `v0.2.16: 资产数`）。
恢复 → `git status --short docs/release-evidence` 为空 → 复跑 `Tests  330 passed (330)`。

## 4. code gates（本 worktree 实测；Host 仍会在下一阶段统一复跑）

`.munk/code-gates.json` 0 改动（sha256 `799beb2fadb54b9a447f2e0ba0cb59c58200a08d`），逐条命令与结论：

| # | gate id | command | 结果 |
| --- | --- | --- | --- |
| 1 | install | `pnpm install` | PASS |
| 2 | lint | `pnpm lint` | PASS |
| 3 | typecheck | `pnpm typecheck` | PASS |
| 4 | build | `pnpm build` | PASS |
| 5 | build-web | `pnpm build:web` | PASS |
| 6 | test | `pnpm test` | PASS（`Test Files 114 passed`，`Tests 1835 passed | 1 skipped`；skip 为既有非本项用例） |
| 7 | test-compare-request | `pnpm test src/shared/compareRequest.test.ts` | PASS |
| 8 | cancel-gate | `pnpm test:cancel` | PASS |
| 9 | memory-gate | `pnpm test:memory` | PASS |
| 10 | structured-semantics | `pnpm test:structured` | PASS |
| 11 | sync-real-gate | `pnpm test:sync-real` | PASS |
| 12 | template-default-unchecked | `pnpm test src/template-gate-default-unchecked.test.ts` | PASS |
| 13 | template-single-source | `pnpm test src/template-gate-single-source.test.ts` | PASS |
| 14 | template-sha-mtime | `pnpm test src/template-gate-sha-mtime.test.ts` | PASS |
| 15 | template-cancel-zero-write | `pnpm test src/template-gate-cancel-zero-write.test.ts` | PASS |
| 16 | template-e2e-real | `pnpm test src/template-e2e-real-directory.test.ts` | PASS |
| 17 | template-case-collision | `pnpm test src/template-gate-case-collision.test.ts` | PASS |
| 18 | template-path-contained | `pnpm test src/template-gate-path-contained.test.ts` | PASS |
| 19 | template-move-actions | `pnpm test src/template-gate-move-actions.test.ts` | PASS |
| 20 | template-move-verify | `pnpm test src/template-gate-move-verify.test.ts` | PASS |
| 21 | verify-release-gate | `pnpm test src/verify-release-gate.test.ts` | PASS |

## 5. 版本单点冻结（0 diff 实测）

`git diff --stat -- package.json CHANGELOG.md README.md README.zh-CN.md .github docs electron-builder.yml` 输出为空；
`git status --short` 仅显示两个测试文件修改与两个新 fixture 目录。`package.json#version` 仍为 `0.2.16`。

## 6. 基线 251 处断言逐条替代映射

说明：`A` = `src/main/release-artifacts-and-brand.test.ts`，`B` = `src/main/release-packaging.test.ts`；
强度「等价」= 同一子串/否定断言，只是期望值来自 fixture；「更强」= 精确相等、数组全等、顺序/计数、字节头等；
「作用域收紧」= 从整段 YAML slice 收紧到解析后的 `run` 脚本。所有断言仍留在两个测试文件内，未迁入 helper/docs/scripts。

### 基线 `src/main/release-artifacts-and-brand.test.ts`（152 处）

| 文件 | 基线行号 | 原文断言 | 替代断言（fixture 行 id / 断言形态） | 用例 | 强度 |
| --- | --- | --- | --- | --- | --- |
| A | 54 | `<svg` | A:brandAssets[svg-source].headerHex | it.each('brand icon assets') · 字节头 hex 等值 | 更强 |
| A | 231 | `自制` | A:docs[brand-doc].tokens[]（含 4 个路径循环项） | it.each('documentation markers') · expectTokens | 等价 |
| A | 232 | `可替换` | A:docs[brand-doc].tokens[]（含 4 个路径循环项） | it.each('documentation markers') · expectTokens | 等价 |
| A | 239 | `path（循环 4 个路径）` | A:docs[brand-doc].tokens[]（含 4 个路径循环项） | it.each('documentation markers') · expectTokens | 等价 |
| A | 241 | `node build/icons/generate-icons.mjs` | A:docs[brand-doc].tokens[]（含 4 个路径循环项） | it.each('documentation markers') · expectTokens | 等价 |
| A | 255 | `x-scheme-handler/opencompare` | A:builderRows[builder-linux-mime].value 等值 | it.each('electron-builder packaging surface') · toEqual | 更强 |
| A | 286 | `find release -maxdepth 2 -name 'OpenCompare.app'` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 288 | `No OpenCompare.app found` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 289 | `::error::` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 290 | `exit 1` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 294 | `CFBundleIconFile` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 295 | `electron.icns` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 296 | `PlistBuddy -c 'Print :CFBundleIconFile'` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 300 | `Contents/Resources/` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 301 | `head -c 4` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 302 | `icns` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 306 | `node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 309 | `shasum -a 256` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 310 | `skipping the SHA-256 default-icon comparison` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 314 | `Contents/Resources/icon.png` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 315 | `build/icon.png` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 316 | `does not match build/icon.png` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 320 | `CFBundleIdentifier` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 321 | `com.opencompare.app` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 322 | `CFBundleShortVersionString` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 323 | `${RELEASE_TAG#v}` | A:steps[mac-app-identity].tokens[] | it.each('release workflow step contracts') · expectTokens/expectAbsent | 作用域收紧 |
| A | 337 | `codesign --verify --deep --strict --verbose=2` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 338 | `codesign --verify --deep --strict failed` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 339 | `::error::` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 340 | `exit 1` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 344 | `codesign -dv --verbose=4` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 345 | `Authority=Developer ID Application` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 346 | `TeamIdentifier=3X4J53U6RY` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 347 | `Signature=adhoc` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 348 | `(runtime)` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 352 | `xcrun stapler validate` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 353 | `hdiutil attach -nobrowse -readonly` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 354 | `hdiutil detach` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 355 | `trap detach_dmg EXIT` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 356 | `find release -maxdepth 1 -name '*.dmg'` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 360 | `spctl -a -vv --type execute` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 361 | `accepted` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 362 | `Notarized Developer ID` | A:steps[mac-signature].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 370 | `case "${{ matrix.target }}" in` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 371 | `mac) required_exts=(dmg zip)` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 372 | `win) required_exts=(exe zip)` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 373 | `linux) required_exts=(AppImage deb)` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 377 | `[0-9]+\\.[0-9]+\\.[0-9]+` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 378 | `does not match tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 382 | `files=(release/latest*.yml)` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 383 | `No latest*.yml update metadata found` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 384 | `String(metadata.version) !== tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 388 | `files[].url` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 389 | `files[].path` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 390 | `path ${metadata.path}` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 391 | `update metadata does not match tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 作用域收紧 |
| A | 452 | `nsis` | A:builderRows[builder-win-target].value（精确数组） | it.each('electron-builder packaging surface') · toEqual | 更强 |
| A | 453 | `zip` | A:builderRows[builder-win-target].value（精确数组） | it.each('electron-builder packaging surface') · toEqual | 更强 |
| A | 466 | `${version}` | A:windowsPackaging.render[*].expected（模板渲染后等值） | it.each('Windows portable zip release surface') · toBe(rendered) | 更强 |
| A | 467 | `not.  ` | A:windowsPackaging.render[*] · 渲染结果无空白 | it.each('Windows portable zip release surface') · not.toMatch(/\s/) | 等价 |
| A | 486 | `electron-builder --${{ matrix.target }} --publish never` | A:steps[build-installers].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 489 | `not. zip` | A:packageBans.scriptNamesAbsent / scriptCommandsAbsent | it('never adds zip tooling…') · expectAbsent | 等价 |
| A | 490 | `not. zip ` | A:packageBans.scriptNamesAbsent / scriptCommandsAbsent | it('never adds zip tooling…') · expectAbsent | 等价 |
| A | 497 | `release/*.zip` | A:steps[upload-installers].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 498 | `release/*.exe` | A:steps[upload-installers].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 502 | `zip` | A:builderRows[builder-win-target].value（精确数组） | it.each('electron-builder packaging surface') · toEqual | 更强 |
| A | 503 | `win) required_exts=(exe zip)` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 505 | `for ext in "${required_exts[@]}"` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 506 | `does not match tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 514 | ``release/latest.yml version=${currentVersion}`` | A:windowsPackaging.cases[win-version-pass].tokens[]（${version} 渲染） | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 524 | `::error::No .exe artifact found` | A:windowsPackaging.cases[win-version-missing-exe].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 533 | `::error::No .zip artifact found` | A:windowsPackaging.cases[win-version-missing-zip].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 539 | `release/latest*.yml` | A:steps[windows-feed].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 540 | `files[].url` | A:steps[windows-feed].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 541 | `endsWith(".zip")` | A:steps[windows-feed].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 542 | `exit 1` | A:steps[windows-feed].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 554 | `String(metadata.version) !== tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 555 | `files[].url ${url} does not match tag` | A:steps[version-artifacts].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 562 | `files[] carries no zip entry` | A:windowsPackaging.cases[win-feed-pass].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 571 | `::error::` | A:windowsPackaging.cases[win-feed-rejects-zip].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 572 | `must use the NSIS installer` | A:windowsPackaging.cases[win-feed-rejects-zip].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 573 | `refusing a Windows update feed` | A:windowsPackaging.cases[win-feed-rejects-zip].tokens[] | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 577 | `has_exact_asset` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 578 | ``for asset in "OpenCompare-Setup-${tag}.exe" "OpenCompare-${tag}-win-x64.zip"; do`` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 581 | `if [ "${name}" = "${wanted}" ]; then return 0; fi` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 582 | `is missing the Windows asset ${asset}` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 584 | `! has_exact_asset "${asset}"` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 648 | `not. is missing the Windows asset` | A:windowsPackaging.cases[win-assets-pass].absent[] | it.each('Windows portable zip release surface') · expectAbsent | 等价 |
| A | 654 | ``is missing the Windows asset ${portableAsset}`` | A:windowsPackaging.cases[win-assets-missing-zip].tokens[]（渲染 portableAsset） | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 660 | ``is missing the Windows asset ${setupAsset}`` | A:windowsPackaging.cases[win-assets-missing-exe].tokens[]（渲染 setupAsset） | it.each('Windows portable zip release surface') · expectTokens | 等价 |
| A | 673 | `latest-mac.yml latest.yml latest-linux.yml` | A:steps[platform-assets|single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 675 | `select(.draft)` | A:steps[platform-assets|single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 676 | `select(.prerelease)` | A:steps[platform-assets|single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 689 | `Windows ships both the NSIS installer and a portable `.zip` (extract and run, no installation step).` | A:notesSections[notes-en-portable|notes-zh-portable].tokens[] | it.each('bilingual portable-zip notes') · expectTokens | 等价 |
| A | 692 | `Windows 同时提供 NSIS 安装包与免安装 `.zip`（解压即用，无安装步骤）。` | A:notesSections[notes-en-portable|notes-zh-portable].tokens[] | it.each('bilingual portable-zip notes') · expectTokens | 等价 |
| A | 695 | `Auto-update keeps resolving to the NSIS installer, so the portable zip is a download only.` | A:notesSections[notes-en-portable|notes-zh-portable].tokens[] | it.each('bilingual portable-zip notes') · expectTokens | 等价 |
| A | 698 | `自动更新仍指向 NSIS 安装包，免安装 zip 只作为下载。` | A:notesSections[notes-en-portable|notes-zh-portable].tokens[] | it.each('bilingual portable-zip notes') · expectTokens | 等价 |
| A | 708 | `- **Windows**：NSIS `.exe` 安装包 + 免安装 `.zip`（解压即用，无安装步骤）` | A:docs[release-process-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 712 | `not. Windows**：NSIS `.exe` 安装包。` | A:docs[release-process-doc].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 724 | `not. --slurp` | A:steps[single-public-release].absent[] | it.each('release workflow step contracts') · expectAbsent | 等价 |
| A | 725 | `.[][]` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 726 | `select(.draft)` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 727 | `select(.prerelease)` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 728 | `[ "${count}" -ne 1 ]` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 729 | `[ "${drafts}" -ne 0 ]` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 730 | `[ "${prereleases}" -ne 0 ]` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 734 | `for value in "${count}" "${drafts}" "${prereleases}"` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 735 | `^[0-9]+$` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 736 | `::error::Could not count the releases` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 737 | `exit 1` | A:steps[single-public-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 741 | `gh api "repos/${GITHUB_REPOSITORY}/releases" --paginate \| jq -s -r` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 744 | `gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets" --paginate \| jq -s -r` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 747 | `not. --slurp` | A:steps[platform-assets].absent[] | it.each('release workflow step contracts') · expectAbsent | 等价 |
| A | 748 | `if [ -z "${release_id}" ]` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 749 | `while checking its assets` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 750 | `if [ -z "${assets}" ]` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 751 | `has no assets` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 755 | `releases/${release_id}/assets` | A:steps[platform-assets].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 766 | `suffix（8 个资产后缀）` | A:steps[platform-assets].tokens[]（8 个资产后缀 + has_asset） | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 768 | `has_asset` | A:steps[platform-assets].tokens[]（8 个资产后缀 + has_asset） | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 769 | `does not carry the tag version` | A:steps[platform-assets].tokens[]（8 个资产后缀 + has_asset） | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 785 | `not. --jq` | A:ghApiCompatibility.forbidden[] | it('never combines gh api --slurp…') · expectAbsent | 等价 |
| A | 786 | `not. --template` | A:ghApiCompatibility.forbidden[] | it('never combines gh api --slurp…') · expectAbsent | 等价 |
| A | 814 | `not. continue-on-error` | A:docs[release-workflow-escapes].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 815 | `not. \|\| true` | A:docs[release-workflow-escapes].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 816 | `not. --no-verify` | A:docs[release-workflow-escapes].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 824 | `打包后硬校验` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 825 | `codesign --verify --deep --strict` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 826 | `xcrun stapler validate` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 827 | `spctl -a -vv` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 828 | `失败即终止` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 829 | `不上传` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 830 | `唯一公开` | A:docs[signing-doc].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 847 | `marker（12 个 marker）` | A:docs[release-process-doc].tokens[]（12 个 marker） | it.each('documentation markers') · expectTokens | 等价 |
| A | 850 | `docs/release-process.md` | A:docs[readme-en|readme-zh].tokens[] | it.each('documentation markers') · expectTokens | 等价 |
| A | 851 | `not. codesign --verify` | A:docs[readme-en|readme-zh].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 852 | `not. xcrun stapler validate` | A:docs[readme-en|readme-zh].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 853 | `not. spctl -a -vv` | A:docs[readme-en|readme-zh].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 864 | `range（3 个性能区间）` | A:docs[release-process-perf].tokens[]（区间先做 en-dash 归一） | it.each('documentation markers') · scopedText + expectTokens | 等价 |
| A | 866 | `1.3M` | A:docs[release-process-perf].tokens[]（区间先做 en-dash 归一） | it.each('documentation markers') · scopedText + expectTokens | 等价 |
| A | 867 | `3 会话` | A:docs[release-process-perf].tokens[]（区间先做 en-dash 归一） | it.each('documentation markers') · scopedText + expectTokens | 等价 |
| A | 868 | `原始证据归档在仓库外` | A:docs[release-process-perf].tokens[]（区间先做 en-dash 归一） | it.each('documentation markers') · scopedText + expectTokens | 等价 |
| A | 869 | `archived outside the repository` | A:docs[release-process-perf].tokens[]（区间先做 en-dash 归一） | it.each('documentation markers') · scopedText + expectTokens | 等价 |
| A | 892 | `number（13 个归档数值）` | A:docs[perf-archive].tokens[]（recursive docs/perf 聚合） | it.each('documentation markers') · expectTokens | 等价 |
| A | 895 | `1.25–1.28` | A:docs[perf-archive].tokens[]（recursive docs/perf 聚合） | it.each('documentation markers') · expectTokens | 等价 |
| A | 897 | `not. 1.24` | A:docs[readme-en|readme-zh].absent[] | it.each('documentation markers') · expectAbsent | 等价 |
| A | 917 | `gh release list --limit 1 --json tagName` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 918 | `jq -r '.[0].tagName // empty'` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 919 | `${RELEASE_TAG}` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 920 | `[ -z "${latest}" ]` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 921 | `::error::` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |
| A | 922 | `exit 1` | A:steps[latest-published-release].tokens[] | it.each('release workflow step contracts') · expectTokens | 等价 |

### 基线 `src/main/release-packaging.test.ts`（99 处）

| 文件 | 基线行号 | 原文断言 | 替代断言（fixture 行 id / 断言形态） | 用例 | 强度 |
| --- | --- | --- | --- | --- | --- |
| B | 40 | `@` | B:builderRows[bld-linux-maintainer].tokens[] | it.each('release package metadata') · expectTokens | 等价 |
| B | 44 | `AppImage` | B:builderRows[bld-linux-target].value（精确数组） | it.each('release package metadata') · toEqual | 更强 |
| B | 45 | `deb` | B:builderRows[bld-linux-target].value（精确数组） | it.each('release package metadata') · toEqual | 更强 |
| B | 74 | `not. --generate-notes` | B:steps[pre-create-release].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 75 | `**Full Changelog**` | B:steps[pre-create-release].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 76 | `compare/` | B:steps[pre-create-release].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 108 | `version="$(node -p "require('./package.json').version")"` | B:releaseBody.versionDerivation 等值 + 顺序 | it('derives both notes paths…') · indexOf | 等价 |
| B | 111 | `notesPathStatement = `notes_file="docs/release-notes/v${version}.md"`` | B:releaseBody.notesPath 等值 + 位于派生之后 | it('derives both notes paths…') · indexOf | 更强 |
| B | 114 | `not. v0.2.9` | B:steps[pre-create-release].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 115 | `not. v0.2.10` | B:steps[pre-create-release].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 123 | `${RUNNER_TEMP}/release-body-${RELEASE_TAG}.md` | B:releaseBody.bodyFile | it('derives both notes paths…') · expectTokens | 等价 |
| B | 132 | `::error::Missing release notes ${notes_file}` | B:releaseBody.guards[guard-missing-en].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 134 | `::error::Release notes ${notes_file} are empty` | B:releaseBody.guards[guard-blank-en].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 138 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 139 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 141 | `not. --generate-notes` | B:steps[pre-create-release].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 148 | `select(.tagName != \\"${RELEASE_TAG}\\")` | B:releaseBody.previousSelector / changelogLine | it('resolves the previous release…') · expectTokens | 等价 |
| B | 149 | `echo "**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${last}...${RELEASE_TAG}"` | B:releaseBody.previousSelector / changelogLine | it('resolves the previous release…') · expectTokens | 等价 |
| B | 164 | `--notes-file "${body_file}"` | B:releaseBody.notesFileFlag 位于 create..draftProbe 切片 | it('writes the body only into the draft…') · slice + expectTokens | 更强 |
| B | 167 | `--notes-file "${body_file}"` | B:releaseBody.notesFileFlag 位于 edit 之后切片 | it('writes the body only into the draft…') · slice + expectTokens | 更强 |
| B | 168 | `already public; leaving its body untouched` | B:releaseBody.publicNote | it('writes the body only into the draft…') · expectTokens | 等价 |
| B | 180 | `notesPathStatement` | B:releaseBody.notesPath | it('derives both notes paths…') · indexOf | 更强 |
| B | 181 | `bilingualNotesPathStatement = `notes_zh_file="docs/release-notes/v${version}.zh-CN.md"`` | B:releaseBody.bilingualPath | it('derives both notes paths…') · indexOf | 更强 |
| B | 195 | `::error::Missing release notes ${notes_file}` | B:releaseBody.guards[guard-missing-en|guard-missing-zh].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 196 | `::error::Missing release notes ${notes_zh_file}` | B:releaseBody.guards[guard-missing-en|guard-missing-zh].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 198 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 199 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 216 | `::error::Release notes ${notes_file} are empty (English)` | B:releaseBody.guards[guard-blank-en|guard-blank-zh].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 217 | `::error::Release notes ${notes_zh_file} are empty (Simplified Chinese)` | B:releaseBody.guards[guard-blank-en|guard-blank-zh].message | it.each('release body from repository notes') · expectTokens | 等价 |
| B | 221 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 222 | `exit 1` | B:releaseBody.guards[*] 切片内 exit 1 | it.each('release body from repository notes') · slice(marker,create) | 更强 |
| B | 248 | `not. --generate-notes` | B:steps[pre-create-release].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 254 | `already public; leaving its body untouched` | B:releaseBody.publicNote | it('writes the body only into the draft…') · expectTokens | 等价 |
| B | 292 | `set -euo pipefail` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 293 | `gh release view "${RELEASE_TAG}"` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 294 | `--json body` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 298 | `not. docs/release-notes/` | B:steps[published-body-gate].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 303 | `marker（3 个 fold marker）` | B:steps[published-body-gate].tokens[]（3 个 fold marker） | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 305 | `exit 1` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 308 | `::error::` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 314 | `head -n "$((details_line - 1))"` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 315 | `zh_body` | B:steps[published-body-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 372 | `Verified the published ${currentTag} body` | B:bodyGate.cases[body-pass].tokens[]（${tag} 渲染） | it.each('published release body gate') · expectTokens | 等价 |
| B | 381 | `::error::` | B:bodyGate.cases[body-no-fold].tokens[] | it.each('published release body gate') · expectTokens | 等价 |
| B | 382 | `body is missing the zh-CN` | B:bodyGate.cases[body-no-fold].tokens[] | it.each('published release body gate') · expectTokens | 等价 |
| B | 390 | `English segment does not carry the version` | B:bodyGate.cases[body-missing-en].tokens[] | it.each('published release body gate') · expectTokens | 等价 |
| B | 398 | `Chinese segment does not carry the version` | B:bodyGate.cases[body-missing-zh].tokens[] | it.each('published release body gate') · expectTokens | 等价 |
| B | 420 | `not. `](./`` | B:notesLinks.rows[*].absent[] | it.each('published release body link gate') · expectAbsent | 等价 |
| B | 421 | `not. `](${currentTag}`` | B:notesLinks.rows[*].absent[] | it.each('published release body link gate') · expectAbsent | 等价 |
| B | 434 | `gh release view "${RELEASE_TAG}"` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 435 | `--json body` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 436 | `link: ` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 442 | `must be an absolute URL` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 443 | `is missing the absolute language switch link` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 444 | `exit 1` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 445 | `en_switch=` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 446 | `zh_switch=` | B:steps[published-links-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 500 | `'link: ' + enSwitch` | B:linkGate.cases[link-pass].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 501 | `'link: ' + zhSwitch` | B:linkGate.cases[link-pass].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 502 | `links: 2` | B:linkGate.cases[link-pass].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 503 | `0 relative` | B:linkGate.cases[link-pass].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 504 | `not. ::error::` | B:linkGate.cases[link-pass].absent[] | it.each('published release body link gate') · expectAbsent | 等价 |
| B | 513 | `::error::` | B:linkGate.cases[link-relative].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 514 | ``./${currentTag}.zh-CN.md`` | B:linkGate.cases[link-relative].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 515 | `must be an absolute URL` | B:linkGate.cases[link-relative].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 528 | `::error::` | B:linkGate.cases[link-missing-en|link-missing-zh|link-missing-both].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 529 | `is missing the absolute language switch link` | B:linkGate.cases[link-missing-en|link-missing-zh|link-missing-both].tokens[] | it.each('published release body link gate') · expectTokens | 等价 |
| B | 538 | `not.  ` | B:builderRows[bld-nsis-artifact].value + render 无空白 | it.each('release package metadata') · toEqual | 更强 |
| B | 566 | `files[].url` | B:steps[latest-yml-url-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 568 | `--json assets` | B:steps[latest-yml-url-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 569 | `.assets[].name` | B:steps[latest-yml-url-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 570 | `latest*.yml` | B:steps[latest-yml-url-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 571 | `exit 1` | B:steps[latest-yml-url-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 593 | `release/*.AppImage` | B:steps[appimage-blockmap-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 594 | `latest-linux.yml` | B:steps[appimage-blockmap-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 595 | `blockMapSize` | B:steps[appimage-blockmap-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 599 | `not. little-endian uint32` | B:steps[appimage-blockmap-gate].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 600 | `exit 1` | B:steps[appimage-blockmap-gate].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
| B | 602 | `not. AppImage.blockmap` | B:steps[appimage-blockmap-gate].absent[] | it.each('release workflow contracts') · expectAbsent | 等价 |
| B | 671 | `embedded blockMapSize=126884` | B:appImage.cases[appimage-pass].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 679 | `::error::` | B:appImage.cases[appimage-wrong-tail].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 680 | `blockMapSize=${v025BlockMapSize}` | B:appImage.cases[appimage-wrong-tail].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 681 | `LE=65536` | B:appImage.cases[appimage-wrong-tail].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 682 | `BE=256` | B:appImage.cases[appimage-wrong-tail].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 692 | `::error::` | B:appImage.cases[appimage-tail-exceeds-size].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 693 | `exceed the file size 16` | B:appImage.cases[appimage-tail-exceeds-size].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 699 | `::error::` | B:appImage.cases[appimage-no-blockmap].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 700 | `blockMapSize` | B:appImage.cases[appimage-no-blockmap].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 706 | `Missing release/latest-linux.yml` | B:appImage.cases[appimage-missing-metadata].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 710 | `Expected exactly one .AppImage` | B:appImage.cases[appimage-no-image].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 714 | `found 2` | B:appImage.cases[appimage-two-images].tokens[] | it.each('AppImage embedded blockmap gate') · expectTokens | 等价 |
| B | 731 | `key（3 个 entitlement key）` | B:entitlements[*].key | it.each('release package metadata') · expectTokens | 等价 |
| B | 745 | `dmg` | B:builderRows[bld-mac-target].value（精确数组） | it.each('release package metadata') · toEqual | 更强 |
| B | 746 | `zip` | B:builderRows[bld-mac-target].value（精确数组） | it.each('release package metadata') · toEqual | 更强 |
| B | 863 | `record.status` | B:evidence.ledger[*].status（版本→状态映射） | it.each('release evidence ledger') · toBe(row.status) | 更强 |
| B | 865 | `record.version` | B:evidence 记录首行 version | it.each('release evidence ledger') · expectTokens | 等价 |
| B | 870 | `releases/tag/${record.version}` | B:evidence 记录 releases/tag/<version> | it.each('release evidence ledger') · expectTokens | 等价 |
| B | 882 | `version.slice(1)` | B:evidence.assetFamilyPattern + 资产名含版本 | it.each('release evidence ledger') · expectTokens | 等价 |
| B | 908 | `token（8 个资产族 token）` | B:workflowChecks[workflow-asset-family].tokens[] | it.each('release workflow contracts') · expectTokens | 等价 |
