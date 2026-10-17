covers: ac-four-scenes
标题: 四大场景样本齐备且加载后可见
步骤: 加载样本后逐一进入四个会话查看内容
期望: 场景 A 嵌套 + 散乱目录树 B；场景 B 代码双栏 Diff 与含多发冲突块的 base/ours/theirs 3-way；场景 C 1200+ 行乱序主键 CSV 左右样本；场景 D 乱序深层 JSON/YAML 左右样本——四场景均齐备且加载后可见

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: 四场景齐备且可见。(1) 真机/浏览器交互证据（前序 Web 会话）：A 目录对比三面板 源目录(baseline)/目标目录(candidate)/跨层级散乱目录树 B(incoming)，三层嵌套节点带 新增/删除/修改 徽标，状态栏「6 相同 4 新增 4 删除 2 修改 · 文件（源）12 文件（目标）12 散乱树 B 9」；B 代码双栏 /samples/code/summary.left.ts + summary.right.ts 与三向 base/ours/theirs 三栏 + 冲突块 3；C CSV 左右 1,240 行 · CSV / 1,233 行 · TSV + region 列偏移。(2) 因交互会话被 CSV 大表冻结过期，本轮以真实执行的 RTL 断言补证（临时 harness，跑后已删除，工作树零残留，复跑 pnpm test 5 files/19 tests 全绿）：A 断言 源目录/目标目录/跨层级散乱目录树 B 与深层节点 engine.ts、Shell.tsx、format.ts、徽标 新增/修改 渲染；B 断言 merge.base/ours/theirs 三面板 + 2 个 separator + 冲突块，切 双栏 Diff 后 summary.left/right 两面板 + 1 个 separator；C 断言左「1,240 行 · CSV」右「1,233 行 · TSV」及 region 列；D（本轮补齐的缺口）断言 session-structured 下 /samples/structured/config.left.json 与 config.right.json 双面板 + 深层 maxBytes 变更，切 YAML 后 deploy.left.yaml/deploy.right.yaml + 深层 disk: 64Gi——4/4 场景全部齐备可见。
