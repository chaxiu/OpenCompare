# v0.2.14 双语发布正文修复（Pre-create fail-closed + finalize 发布后 body 断言）

- WI：`wi_ws_b324f000d0755872`
- 域：`release`（发布**产物侧**修复：写入侧双语 fail-closed + 发布后从 public Release 反读 body 断言；不是版本收敛 / 收尾轮，不动 `package.json` / `CHANGELOG` / notes / README）
- 来源：`.munk/changes/wi_ws_b324f000d0755872/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd 19 条 AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过，回归面全部落在 `code_gates`）

## 最近执行

- workItemId: wi_ws_b324f000d0755872
- at: 2026-10-31
- status: pass
- note: `code_gates` passed（10 gates，attempt 001 全 exit 0，`.munk/runs/run_ws_4d2864d821128b42/code-gates/attempts/001`）；`pnpm test` 91 files / 1374 passed + 1 skipped（1375），30.90s；UI 自测按 `needSelfTest=false` 跳过。改动面 2 个已跟踪路径 `+302/−5`：`.github/workflows/release.yml` 80/5、`src/main/release-packaging.test.ts` 222/0。`docs/release-notes/v0.2.14.md` / `v0.2.14.zh-CN.md`、`CHANGELOG.md`、两版 README、`docs/release-evidence/**`、`package.json`、`docs/release-signing.md`、`docs/release-process.md`、`electron-builder.yml` 零 diff；`src/` 仅动该测试文件。未打 tag、未 push、未 dispatch、未发布。

## 覆盖

`ac-precreate-both-notes-paths`、`ac-fail-closed-missing-either`、`ac-fail-closed-blank-either`、`ac-body-composition-order`、`ac-no-single-language-fallback`、`ac-version-follows-package`、`ac-test-both-paths`、`ac-test-missing-guard`、`ac-test-zh-details-marker`、`ac-existing-assertions-intact`、`ac-finalize-post-publish-position`、`ac-finalize-reads-published-body`、`ac-finalize-zh-marker-gate`、`ac-finalize-per-segment-version-gate`、`ac-finalize-gate-testable`、`ac-published-v0214-untouched`、`ac-release-channel-bytes-stable`、`ac-product-source-untouched`、`ac-gates-green`。

## 步骤

1. 开工三查：`git rev-parse HEAD`（`3550b24`）、`package.json#version === "0.2.14"`、`docs/release-notes/v0.2.14.md` 与 `v0.2.14.zh-CN.md` 均存在且非空、`.munk/code-gates.json` 为 10 门。
2. `git diff --numstat` 核对改动面恰为 2 个文件（`release.yml` 80/5、`release-packaging.test.ts` 222/0），`git status --porcelain docs/release-notes CHANGELOG.md README.md README.zh-CN.md docs/release-evidence` 空输出。
3. `git diff .github/workflows/release.yml`：核 `Pre-create` 的两份 notes 派生路径同源于 `node -p "require('./package.json').version"`、四条守卫（英/中 × 缺失/为空）位置、body 六段组装顺序、`# 已公开 Release 不改 body` 分支文案保留（`already public; leaving its body untouched`）。
4. 全文核 `--generate-notes` 0 命中；`grep -c -- --notes-file` = 2（create 与 draft-only edit）。
5. `grep -n "^      - name:" .github/workflows/release.yml`：新步骤 `Assert the published release body is bilingual` 在 `Make the tag's release public` 之后，且 `Verify the tag has exactly one public release` → `Assert the public release has every platform asset` → `Assert latest*.yml urls match the release assets` → `Assert the tag is the latest published release` 相对顺序不变。
6. `git diff src/main/release-packaging.test.ts`：核新增 12 例——`release body from repository notes` 内追加 5 例（两份路径 / 缺失守卫 / 空守卫 / 折叠顺序 / 无降级路径），新增 `describe('published release body gate')` 7 例（位置与顺序 / 只读反读 / 标记与两段版本 / 1 例双语通过 + 3 例失败分支实跑）；既有用例逐字未动。
7. `grep -c '  it('` / `grep -c 'expect('` 前后对照（基线 `3550b24` = 204 / 882 → 交付后 = 216 / 947）。
8. Host `code_gates`（10 gates，attempt 001）。

## 期望

① `Pre-create the tag's release` 的 `run` 同时含 `notes_file="docs/release-notes/v${version}.md"` 与 `notes_zh_file="docs/release-notes/v${version}.zh-CN.md"`，两者位置均在 `version="$(node -p ...)"` 之后；`run` 内无 `docs/release-notes/v<数字>.<数字>.<数字>` 形式的写死路径。② 四条守卫齐备：`if [ ! -f "${notes_file}" ]`、`if [ ! -f "${notes_zh_file}" ]`、`if [ -z ... "${notes_file}" ...`、`if [ -z ... "${notes_zh_file}" ...`；每条都以 `exit 1` 结束，且全部位置早于 `gh release create` 与 `gh release edit`；`::error::` 文案分别标明 English / Simplified Chinese 且区分「Missing」与「are empty」。③ body 组装按 `cat "${notes_file}"` → `echo '---'` → `echo '<details><summary>简体中文</summary>'` → `cat "${notes_zh_file}"` → `echo '</details>'` → `**Full Changelog**` 升序出现，`<details>` 与 `</details>` 各恰 1 次。④ `--generate-notes` 0 命中、`--notes-file` 恰 2 次、「已公开不改 body」分支文案仍在。⑤ `finalize` 新步骤 `Assert the published release body is bilingual` 位于 `Make the tag's release public` 之后，含 `set -euo pipefail`、`gh release view "${RELEASE_TAG}"` + `--json body`、`<details>` / `简体中文` / `</details>`、`head -n "$((details_line - 1))"` 切段、`exit 1` 与三条可定位 `::error::`（缺折叠块 / 英文段无 tag / 中文段无 tag）；该步骤无 `gh release upload|edit|create|delete`、无 `--method POST|PATCH|PUT|DELETE`、不含 `docs/release-notes/`。⑥ 夹具实跑：双语夹具 exit 0 且输出 `Verified the published <tag> body`；缺折叠块 / 英文段缺 tag / 中文段缺 tag 三例均非零退出并命中各自 `::error::`；三例夹具都带 `**Full Changelog**: ...compare/v0.2.12...<tag>` 行，证明「整 body grep tag」会假绿。⑦ `docs/release-notes/v0.2.14.md` / `v0.2.14.zh-CN.md`、`CHANGELOG.md`、两版 README、`docs/release-evidence/**` 零 diff；零针对已公开 tag 的 `gh release edit` / `delete`。⑧ `release.yml` 除 `Pre-create` 的注释 / `run` 与新增 finalize 步骤外无字节变化；`src/core/**`、`src/renderer/**`、`src/preload/**`、`src/shared/**` 与 `src/main/**`（该测试文件除外）零 diff，无新增依赖。⑨ 10 门全绿，无 `|| true` / `continue-on-error` 逃逸。

## 断言与文档改动理由

1. **写入侧口径**：`notes_zh_file` 与 `notes_file` 都由 `${version}` 派生——`version` 仍是唯一来源，未来只改 `package.json` 时中英两路自动跟随（`ac-version-follows-package`）；新增断言用 `not.toMatch(/docs\/release-notes\/v\d+\.\d+\.\d+/)` 把「写死版本」这条退化路径钉死。
2. **守卫位置而非仅存在**：四条守卫用 `indexOf` 求位置并与 `gh release create` / `gh release edit` 比较，且用 `preCreate.slice(a, b)` 断言区间内含 `exit 1`——只断言「有守卫」会让「守卫写在 create 之后」的回归通过。
3. **`::error::` 文案区分语言**：英文那条保留原句 + `(English)`，中文那条为 `(Simplified Chinese)`，两份的缺失 / 为空四种组合各自可定位（`ac-fail-closed-blank-either` 要求的两个空分支都没被合并成一条）。
4. **body 顺序断言用 `indexOf` 升序链**：不做整段字符串相等（那会在注释 / 措辞微调时假红），只锁可执行语句的相对位置；`<details>` / `</details>` 计数恰 1 用来排除嵌套与重复。
5. **finalize 反读的写法**：`gh release view ... --json body --jq '.body // ""'` 落盘后按行扫描 `<details>` / `<summary>简体中文</summary>` / `</details>` 行号，再 `head` / `tail|head` 切出英中两段各自 `grep -Fq "${tag}"`——`**Full Changelog**` 在 `</details>` 之后，天然落不进任何一段，这正是 `ac-finalize-per-segment-version-gate` 的判定关键。步骤 `not.toContain('docs/release-notes/')` 把「反读已发布产物」与「信任仓内文件」区分开。
6. **既有用例零改动**：`keeps the finalize step body-free`、`derives the notes version from package.json`、`only writes the body into a draft release` 等原样保留，新增一律追加（新 `it` 或新 `describe`），无 `skip` / `only` / `todo`、无把 `toContain` 放宽成 `not.toContain`。

**`it(` / `expect(` 计数**：基线（`3550b24`）= `204` / `882`；交付后 = `216` / `947`（净增 12 例、65 条断言，只增不减）。

**未纳入项**：打 tag / push tag / dispatch `Release` / 创建或修改 GitHub Release 与资产 / publish 一律不做；不补写 `v0.2.14` Release 的中文 body（已公开英文单语是历史缺口，prd 明列为非目标）；不改 `docs/release-notes/**`、`CHANGELOG.md`、两版 README、`docs/release-signing.md`、`docs/release-process.md`、`package.json`、`electron-builder.yml`；不改 notes-file 挂载方式、macOS 签名 / 公证、构建矩阵、资产命名与 `latest*.yml` 校验；不改 `src/` 业务代码 / UI 行为 / 算法 / `platform` 契约；不改 `.munk/code-gates.json`（保持 10 门）；不做浏览器 / 真机 / 桌面点选验收。

**风险**：① 写入侧 fail-closed 只保护**未来**发布——已公开的 `v0.2.14` 英文单语 body 仍是既成事实，本项刻意不修；② `finalize` 新步骤的**实机证据缺口**：本项未打 tag、未跑真实 `Release` 工作流，故该步骤只在「脚本约定 + 夹具实跑」层面被证明，首次真实发版才是它的实战首跑；③ 若未来把 `**Full Changelog**` 行挪到 `</details>` 之前，段切分会把该行归入中文段，届时中文段版本断言会因它天然含 tag 而假绿——届时需同步调整切段边界（当前顺序由 `ac-body-composition-order` 与写入侧顺序断言共同锁住）。
