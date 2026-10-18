covers: ac-template-sample
标题: 对内置模板 A（/samples/directory/baseline）与散乱树 B（/samples/directory/incoming）匹配，把打乱层级的多层文件归位到模板路径，缺失槽位正确报缺失
步骤: 在 vitest 中经 `scanDirectory` 扫描 `DIRECTORY_SCENE.left`（baseline）与 `DIRECTORY_SCENE.scattered`（incoming）→ 调用 `matchTemplate`
期望: 被打乱层级的多层文件正确归位，例如 `misc/deep/deeper/strings.ts` → `src/core/utils/strings.ts`、`misc/ui/SplitPane.tsx` → `src/ui/workbench/SplitPane.tsx`、`misc/core/engine.ts` → `src/core/engine.ts`；`conflicts` 为空；B 中无对应候选的模板槽位（如 `README.md`、`assets/logo.png`、`config/deploy.yaml`、`docs/changelog.md`、`src/data/report.csv`、`src/ui/workbench/Shell.tsx`）正确进入 `missing`

## 最近执行

- workItemId: wi_ws_6841b3431c2d50f9
- at: 2026-10-18
- status: pass
- note: vitest 实测内置样本：misc/deep/deeper/strings.ts→src/core/utils/strings.ts、misc/ui/SplitPane.tsx→src/ui/workbench/SplitPane.tsx、misc/core/engine.ts→src/core/engine.ts、misc/ui/lexer.ts→src/core/lexer.ts；conflicts 空；missing 精确为 README.md/assets/logo.png/config/deploy.yaml/docs/changelog.md/src/data/report.csv/src/ui/workbench/Shell.tsx
