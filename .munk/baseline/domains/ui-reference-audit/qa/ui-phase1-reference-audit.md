# UI 第一期对标参照审计（只读三表）

- WI：`wi_ws_0b248d40545e9eb4`（`key: ui-phase1-reference-audit`）
- 域：`ui-reference-audit`（新建；只读判断文档层，不是实现轮、不动 `src/**`）
- 来源：`.munk/changes/wi_ws_0b248d40545e9eb4/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**`、无 `tech.md` / `ux/**`；本文件为 AC 逐条落档，不是 change-pack 用例 copy）
- 交付：`docs/ui-phase1-reference-audit.md`（新增 66 行）+ 仓根 `AGENTS.md` +1 行，`deliveryIntent: local merge`，`needSelfTest=false`

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-two-files-only | `git diff --name-status main..HEAD` 两行：`M AGENTS.md`、`A docs/ui-phase1-reference-audit.md`；`src/**`、`docs/lessons.md`、两版 README、`package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff | 满足 |
| ac-exactly-three-tables | `grep -cE '^\|[- :|]+\|$' docs/ui-phase1-reference-audit.md` = **3** | 满足 |
| ac-prose-minimal | 非空行 58 − 表格行 51 = 7 行（标题 1 + 头部 2 + 三个表标题 3 + 结论 1），≤ 12；无项目符号清单、无第二层小标题正文段 | 满足 |
| ac-table1-levels | 表①6 行，行序 `app / sessions / events / view-toolbar / panels / status` 严格等于 `SHELL_LEVEL_ORDER`；「对方对应层」6 行取值全在该集合内（无对方原词层名） | 满足 |
| ac-table2-entry-set | 表②18 行，id 列与 `SHELL_ENTRY_IDS` 集合完全相等且顺序一致（`open-file` … `tab-select`，`samples` / `samples-menu` 已随示例入口迁入设置移除），无重复 | 满足 |
| ac-table2-verdict-enum | 判定分布：`保留` 16 / `合并` 0 / `降级到菜单` 2（`template`、`report-export`）/ `明确不做` 0；无空值（`明确不做` 行的 ≥8 字符理由口径本轮无样本命中） | 满足 |
| ac-table2-both-directions | 两列 18 行全有取值，缺项显式写 `无`（`template` 对方层为 `无`） | 满足 |
| ac-table3-category | 表③19 行 = `图标语义差异` **10** + `主动不做` **9**（各 ≥5）；10 个图标名（`chevron-up` / `chevron-down` / `square-split-horizontal` / `shuffle` / `check` / `arrow-right` / `upload` / `download` / `list-filter` / `git-compare`）全部命中 `ICON_PATHS` / `ICON_NAMES`，零新造 | 满足 |
| ac-sources-official | 链接 43 处，host 唯一：`www.scootersoftware.com`（`grep -oE 'https?://[^/) ]+'` 后 `sort | uniq -c`）；表②18 行来源列非空；无 `localhost` / 论坛 / 图床 | 满足 |
| ac-no-asset-copy | `grep -c '!\['` = **0**；无 `data:image`、`<svg`、base64、`viewBox` / `d=` | 满足 |
| ac-no-imitation-wording | 全仓（排除 `node_modules`、`.munk/`）对 `像 Beyond Compare|similar to Beyond Compare|resembles Beyond Compare|模仿 Beyond Compare|山寨` 0 命中；README 既有 `alternative to` / `平替` / `对标` 未触碰（`release-packaging.test.ts` 仍绿） | 满足 |
| ac-shell-conclusion | 结论行唯一：「已合入的壳层重排（merge 8e56046）无结构性问题，六层顺序与单一尺寸表可直接承接后续图标与主题批次」；`src/**` 零 diff | 满足 |
| ac-gates-green | `.munk/runs/run_ws_16f6f7ea75b767c6/code-gates/attempts/001`：9 门全 `passed` / exit 0；`test` 门 75 files / 1202 passed + 1 skipped（1203）/ 29.82s；未新增测试、未改 `code-gates.json` | 满足 |
| ac-verification-reproducible | 本文件「可复跑命令」节逐条给命令与实测值（三表计数 3、id 集合差集空、host 清单 1 域、图片 0、`AGENTS.md` 47 行） | 满足 |
| ac-single-commit-clean | 产品面单提交 `a8a7127 docs(ui): add phase-1 reference audit with three read-only tables`（2 files / +67）；fold 前 `git status --porcelain` 仅 `.munk/changes/**` | 满足 |

## 可复跑命令

```
# 三表计数（应为 3）
grep -cE '^\|[- :|]+\|$' docs/ui-phase1-reference-audit.md

# 表② id 集合 vs SHELL_ENTRY_IDS（应输出 18 18 true）
node -e "const fs=require('fs');const s=fs.readFileSync('src/renderer/src/workbench/shellLayout.ts','utf8').split('\n');const i=s.findIndex(l=>l.includes('export const SHELL_ENTRIES'));const k=[];for(let j=i+1;j<s.length;j++){const m=/^  '?([a-z-]+)'?: \{/.exec(s[j]);if(m){k.push(m[1]);continue}if(/^\}/.test(s[j]))break}const d=fs.readFileSync('docs/ui-phase1-reference-audit.md','utf8').split('\n').filter(l=>/^\| [a-z]/.test(l)&&l.split('|').length-2===8).map(l=>l.split('|')[1].trim());console.log(k.length,d.length,JSON.stringify(k)===JSON.stringify(d))"

# 外部链接 host 清单（应只有 www.scootersoftware.com）
grep -oE 'https?://[^/) ]+' docs/ui-phase1-reference-audit.md | sort | uniq -c

# 图片 / SVG 资产零搬运（应为 0）
grep -c '!\[' docs/ui-phase1-reference-audit.md

# AGENTS.md 行数（应为 47）
wc -l AGENTS.md
```

## 关键事实核对（anti-drift）

- 表② 两条非「保留」判定是本域后续最容易被推翻的结论：`template` 与 `report-export` → 降级到菜单（低频、不占同排宽度）。后续壳层 / 主题批次若把它们拉回工具条主位，须同批改本域判定并写明理由。原 `samples`（保留）/ `samples-menu`（合并）已随示例入口迁入设置 →「示例与调试」从清单删除，判定行同批移除。
- 表③「主动不做」9 条为显式排除面（minimap 缩略图、双层菜单栏加标准工具栏、独立 Folder Sync 会话、多窗口 / 工作区、三向合并独立中栏与可分离输出窗格、远程服务与云 profiles、文件格式规则管理器、工具栏大按钮与自定义、打印与 PDF 报告），其中「远程服务与云 profiles」「文件格式规则管理器」写明**无替代**。
- 图标名空间只读：审计只记录 cp-icon-set 已定取值，后续改图标走 `icon-system` 的「拷 SVG + 进 `ICON_PATHS` + 被映射引用」三步，不得改本文档来迁就新字形。
- 素材纪律本项已落成硬约束：链接只能是官方手册页，**不安装 / 不截图 / 不抄路径与版式**；后续同类对标项沿用同一口径。

## 最近执行

- workItemId: wi_ws_8959816f18ce7acf
- at: 2026-10-31
- status: pass
- note: 交叉引用更新（AC 定义与实现归 `domains/workbench` 的 `qa/topbar-workflow-empty-state-de-demo.md`）：示例入口迁入设置后 `SHELL_ENTRY_IDS` 由 20 → 18，`docs/ui-phase1-reference-audit.md` 表② 同批删除 `samples` / `samples-menu` 两行、表②计数与判定分布改为 18 行（`保留` 16 / `降级到菜单` 2），app 行说明改为「示例入口已收进设置，不再占用顶栏」。实测：表② 18 行、判定分布 16 / 2、链接 43 处仍全为 `www.scootersoftware.com`、`![` 计数 0、`AGENTS.md` 47 行。未改语义：审计仍是只读判断文档，只是把变了的入口宇宙同步过来。
