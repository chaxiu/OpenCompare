# v027-release-note-html-lang-line

covers: ac-release-note-line, ac-release-note-rest-unchanged, ac-release-note-tests-unchanged, ac-same-merge, ac-no-release-side-effects
标题: `docs/release-notes/v0.2.7.md` 的「本次变化 → 桌面端 UI 中英双语」段按 `- **标题**：说明` 格式新增且仅新增一行「语言标记：html lang 跟随界面语言（英文 en / 中文 zh-CN），修正英文界面下读屏与翻译工具的语言标记错误」，H1 与其余段落逐字不变；该行与 `i18n` 域 `<html lang>` 实现同 merge 交付
步骤: 读 `.munk/changes/wi_intake_07073ffc0b1720d2/prd.md`；`git diff -- docs/release-notes/v0.2.7.md`；`git diff --numstat -- docs/release-notes/v0.2.7.md`；`head -1 docs/release-notes/v0.2.7.md`；`grep -n '^## \|^### \|语言标记' docs/release-notes/v0.2.7.md`；`grep -c 'html lang\|zh-CN\|读屏\|翻译工具' docs/release-notes/v0.2.7.md`；`grep -n 'TODO\|TBD\|FIXME\|待验证\|预计通过\|应该通过' docs/release-notes/v0.2.7.md`（须 0 命中）；`pnpm test src/main/release-packaging.test.ts`；Host `code_gates`（9 gates，attempt 001）
期望: ① 该文件 diff 恰为 `+1/-0`，新增行形如 `- **语言标记**：html lang 跟随界面语言（英文 en / 中文 zh-CN），修正英文界面下读屏与翻译工具的语言标记错误。`，位于 `### 桌面端 UI 中英双语` 段内（在「即时生效」与「不打断工作」两条之间）。② 新增行含 `html lang`、`en`、`zh-CN`、读屏、翻译工具 五个语义点，且 `en` / `zh-CN` 与 `i18n/htmlLang.ts` 的映射一致。③ 首 H1 仍为 `# OpenCompare v0.2.7 发布说明`；`## 本次变化` / `### README 精简为 9 节双语门面` / `## 升级方式` 等既有段落与行零改动。④ 既有 v0.2.7 断言全绿且未放宽：首 H1 含 `currentTag`、含「升级方式」与 `v0.2.6` 升级起点、三个未验证措辞 0 命中、64 位十六进制 0 命中、无 `TODO` / `TBD` / `FIXME`。⑤ `src/main/release-packaging.test.ts`、`package.json`、`CHANGELOG.md`、`README.md` / `README.zh-CN.md`、`.github/workflows/release.yml`、`docs/release-signing.md`、`docs/release-process.md`、`docs/release-evidence/**` 零 diff；`.munk/code-gates.json` 零 diff。⑥ 同一 merge 内包含 `i18n` 域的 `htmlLang.ts` / `I18nProvider` / `index.html` 改动，发布说明不宣称未随版发出的行为。⑦ 无新增 tag、无 push / publish、未改已公开 Release 与资产；`code_gates` 9 gates 全绿（`pnpm test` 58 files / 897 passed + 1 skipped）。

## 最近执行

- workItemId: wi_intake_07073ffc0b1720d2
- at: 2026-10-24
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates attempt 001 全绿，`.munk/runs/run_intake_07073ffc0b1720d2/code-gates/attempts/001`；`pnpm test` 58 files / 897 passed + 1 skipped / 898，其中 `release-packaging.test.ts` 的 v0.2.7 notes 断言按新增一行后的真实内容通过，未调整断言）。静态核对：`git diff --numstat -- docs/release-notes/v0.2.7.md` = `+1/-0`；首 H1 仍为 `# OpenCompare v0.2.7 发布说明`；新增行落在 `### 桌面端 UI 中英双语` 段内且含 `html lang` / `en` / `zh-CN` / 读屏 / 翻译工具；`TODO|TBD|FIXME`、`待验证|预计通过|应该通过`、`[0-9a-f]{64}` 均 0 命中。边界：本轮 release 域只动这一份 notes，`release-packaging.test.ts` 与所有发布锚点（`currentTag = v0.2.7` / `latestPublishedTag = v0.2.6`）保持不变。
