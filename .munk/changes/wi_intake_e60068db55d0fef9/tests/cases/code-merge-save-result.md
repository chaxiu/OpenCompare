# code-merge-save-result

covers: ac-code-merge-save
标题: 三向合并冲突全部解决后经 saveFile 保存结果，未解决时该动作不可用
步骤: 进入「三向合并」→ 在仍有待决冲突时查看「导出合并文本」可用性 → 逐一解决全部冲突使待决数归零 → 点击「导出合并文本」经保存对话框（defaultPath 预填 merged.txt）保存 → 观察提示；再试一次并取消
期望: 有待决冲突时该按钮禁用（不可保存）；冲突清零后可用，保存走 `platform.saveFile` 成功并提示「已保存到 <路径>」，保存内容为按各块选择拼接的结果且不含冲突标记；取消保存时不误报成功、现有合并状态不变

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: Web 实测：待决冲突 3/3 时「导出合并文本」disabled=true；逐行 Accept Ours 至 0/3 后按钮启用；点击后提示「已保存到 /memory/merged.txt」并触发 merged.txt 下载，内容与按块采纳结果逐行一致且不含冲突标记（<<<<<<< / ======= / >>>>>>>）。控制台 0 error。备注：web 运行时 saveFile 无 OS 对话框（写内存 FS + 触发下载），「取消保存」分支在 web 不可达，由 electron-platform.test.ts / web-platform.test.ts 的 cancel→null 单测覆盖；发现工具栏「Accept Ours」在活动块已解决后不再推进（仅影响批量操作便利性，行内按钮可正常解决），非阻断。
