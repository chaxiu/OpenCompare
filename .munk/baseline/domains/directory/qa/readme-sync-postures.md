# README 双语镜像：目录同步两条设计口径写进 Features / 核心能力（纯门面文案）

- WI：`wi_intake_5bf454ae71a62cd8`
- 域：`directory`（被陈述的引擎事实归本域；落节分工 / 两处双落点归 `docs-governance`，5 条 bullet / 9 节 / 词数等门面结构归 `release`）
- 来源：`.munk/changes/wi_intake_5bf454ae71a62cd8/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件由 Delivery 按 prd 12 条 AC 逐条落档）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（纯文案，无 UI 面变更，回归面全部落在 `code_gates`）

## 改动事实

两版 README 各一行、各一处 hunk，均为**同一 bullet 行内句尾追加**（未新增 bullet、未拆行、未改前半句）：

- `README.md:25` `- **Directory comparison and sync**: …` 追加三句 —— `Incremental sync only adds and overwrites, never deletes;` / `mirror sync also lists target-only items as pending deletions, which stay unchecked by default and run only when you check them.` / `Changes made outside the app are read on the next comparison, with no background file watcher.`
- `README.zh-CN.md:25` `- **目录对比与同步**：…` 逐句镜像 —— 「增量同步只做新增与覆盖、不删除；」「镜像同步额外列出目标侧独有项作为待删除项，删除项默认不勾选，显式勾选后才执行。」「应用外对目录的改动在下次对比时读取，没有后台文件监听。」

三条口径与本域既有引擎合同逐条对应，无升级表述：① 增量只新增 / 覆盖 ↔ `ac-sync-plan`（`delete` 组只在镜像模式产生）；② 镜像待删除默认不勾、显式勾选才执行 ↔ `ac-sync-mirror-delete`（初始全部未勾选、只删勾选项，2026-10-31 由「默认勾选」反转）；③ 应用外改动下次对比读取、无后台监听 ↔ 非目标「不做持续 / 定时自动同步与 watcher」（同步按需触发）。本轮**零代码改动**。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-en-sync-postures | `README.md` `## Features` 首条含 `never deletes` / `unchecked by default` / `no background file watcher` 三项（脚本断言命中，见下「复核命令」） | 满足 |
| ac-zh-sync-postures | `README.zh-CN.md` `## 核心能力` 首条含「不删除」/「默认不勾选」+「显式勾选后才执行」/「没有后台文件监听」，与英文三项逐句语义对应 | 满足 |
| ac-five-feature-items | 两版能力区 `- ` 开头条目各恰好 **5** 条（口径扩展写在既有行内，未新增 bullet、未合并条目） | 满足 |
| ac-nine-h2-sections | 两版 `## ` 各恰好 **9** 个且顺序与改动前逐一相等（EN `Download and install` / `Features` / `Quickstart` / `Requirements and development` / `Project structure` / `Known issues` / `Evidence and docs` / `Open Rebuilds 001` / `License`；ZH 对应九节），无新增 / 删除 / 改标题 | 满足 |
| ac-quickstart-untouched | 两版 Quickstart / 快速上手段落与 `HEAD` 版本逐字节相同（脚本按节截取比较 → `True`） | 满足 |
| ac-known-issues-untouched | 两版 Known issues / 已知问题段与 `HEAD` 逐字节相同；`None known right now.` 与 `当前没有已知未修复问题。` 原句仍在；`src/main/release-packaging.test.ts` 零 diff（known issues 断言不改不放松） | 满足 |
| ac-line5-untouched | 两版第 5 行逐字节不变（EN `Latest public release: [v0.2.14](…/tag/v0.2.14) — Developer ID signed and Apple-notarized macOS build.`）；全文除第 5 行外 `\bv\d+\.\d+\.\d+\b` 命中 **0** | 满足 |
| ac-word-budget | 按 `release-packaging.test.ts` 的 `wordCount` 规则（去围栏代码块 / 图片链接换文本 / 去 `http(s)` / 去行内代码 / 去 HTML，再计 `[A-Za-z][A-Za-z0-9'’-]*`）实测 `README.md` **444** ≤ 700（改动前 399，余量 256 词） | 满足 |
| ac-wording-clean | 两版**新增句**对「已知缺陷 / 未修复 / known bug / defect / roadmap / TODO / TBD / FIXME / MiB / GiB / GB」全 0 命中；英文版汉字仅第 3 行语言切换 `简体中文`（`\p{Script=Han}` 其余 0 命中） | 满足 |
| ac-symlink-policy-untouched | 两版 `docs/symlink-no-follow.md` 链接与「不跟随符号链接」口径表述零 diff；`docs/symlink-no-follow.md` 本身零 diff | 满足 |
| ac-release-files-untouched | `git diff --name-only -- src package.json pnpm-lock.yaml CHANGELOG.md docs .github electron-builder.yml` **为空**；产品面仅 `README.md` / `README.zh-CN.md` 两处 `+1 −1` | 满足 |
| ac-gates-green | Host `code_gates` 11 门 attempt 001 全 `passed`（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics / sync-real-gate），证据 `.munk/runs/run_intake_5bf454ae71a62cd8/code-gates/attempts/001`；`pnpm test` 96 files / 1431 passed + 1 skipped（1432），`pnpm test:sync-real` 32 tests / 2.51s | 满足 |
| ac-delivery-note | 两版实际改动行原文与门禁结果见本文件「改动事实」与 `## 最近执行`，并在 `munk_delivery_submit` 的 summary 与 fold 提交信息中给出 | 满足 |

## 复核命令（本项实测）

```bash
# ① 两版能力区首条三项口径 + 5 条 bullet
python3 - <<'PY'
en=open('README.md',encoding='utf-8').read(); zh=open('README.zh-CN.md',encoding='utf-8').read()
sec=lambda t,a,b:(t[t.index(a):t.index(b,t.index(a))])
fen=sec(en,'## Features','## Quickstart'); fzh=sec(zh,'## 核心能力','## 快速上手')
print([k in fen for k in ('never deletes','unchecked by default','no background file watcher')])
print([k in fzh for k in ('不删除','默认不勾选','显式勾选后才执行','没有后台文件监听')])
print(len([l for l in fen.splitlines() if l.startswith('- ')]),
      len([l for l in fzh.splitlines() if l.startswith('- ')]))
PY

# ② 未触碰段落逐字节比较（Quickstart / Known issues / 第 5 行 / H2 集合），对照 HEAD 版本
python3 - <<'PY'
import subprocess
sec=lambda t,a,b:(t[t.index(a):t.index(b,t.index(a))])
for f,heads in (('README.md',('## Quickstart','## Requirements and development','## Known issues','## Evidence and docs')),
                ('README.zh-CN.md',('## 快速上手','## 环境要求与开发','## 已知问题','## 证据与文档'))):
    old=subprocess.run(['git','show','HEAD:'+f],capture_output=True,text=True).stdout
    new=open(f,encoding='utf-8').read()
    print(f,
          'quickstart identical:', sec(old,heads[0],heads[1])==sec(new,heads[0],heads[1]),
          '| known-issues identical:', sec(old,heads[2],heads[3])==sec(new,heads[2],heads[3]),
          '| line5 identical:', old.splitlines()[4]==new.splitlines()[4],
          '| H2 identical:', [l for l in old.splitlines() if l.startswith('## ')]
                          ==[l for l in new.splitlines() if l.startswith('## ')])
PY

# ③ 门面结构 / 零 diff
git diff --name-only -- src package.json pnpm-lock.yaml CHANGELOG.md docs .github electron-builder.yml   # 期望空
git diff --stat -- src/main/release-packaging.test.ts                                                   # 期望空
```

复核结果：能力区三项 ×2 版全命中、`- ` 条目 5 / 5、节 H2 9 / 9 且顺序不变、Quickstart 与 Known issues 两版均 `identical: True`、第 5 行 `identical: True`、英文词数 444。

## 最近执行

- workItemId: wi_intake_5bf454ae71a62cd8
- at: 2026-11-01
- status: pass
- note: 12 条 prd AC 全部满足，无偏差。`needSelfTest=false`，以 Host `code_gates` 为交付门槛：11 门 attempt 001 全 passed（`.munk/runs/run_intake_5bf454ae71a62cd8/code-gates/attempts/001/manifest.json`），`pnpm test` 96 files / 1431 passed + 1 skipped（1432）、`pnpm test:sync-real` 32 tests / 2.51s。改动面恰为两版 README 各 `+1 / −1`（`git diff -U0 -- README.md README.zh-CN.md` 各一个 `@@ -25 +25 @@` hunk）；`src/**`、`package.json`、`pnpm-lock.yaml`、`CHANGELOG.md`、`docs/**`、`.github/**`、`electron-builder.yml` 零 diff；`src/main/release-packaging.test.ts` 零 diff。边界：不改同步行为、不改 UI 文案与 i18n 词条、不加依赖、不打 tag / 不发版；`docs/lessons.md` 与 `AGENTS.md` 本轮刻意不动（无新的可复用约束，只是同一引擎事实的第二落点）。
