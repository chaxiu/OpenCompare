covers: ac-emfile-not-crash
标题: 句柄耗尽错误向上传播到工作台既有提示分支，不崩窗口、不生成空目录会话
步骤: 在 jsdom 组件测试里用 `scriptedPort` 注入拖拽两个样本目录路径，并把 `readTextFile` 覆写为抛出 `code: 'EMFILE'` 的错误 → `render(<Workbench platform={platform} />)` 后向 `role="main"` 拖入左右两个目录路径 → 等待提示出现并检查会话区
期望: 出现 `role="alert"` 的就地提示，文案含「文件句柄」与「EMFILE」；不抛未捕获异常、组件树不崩；不生成任何目录会话（`role="tablist"` 名为「会话」的元素不存在），即失败不落成空目录会话

## 最近执行

- workItemId: wi_intake_d4788e517adfaee2
- at: 2026-10-21
- status: pass
- note: `src/renderer/src/App.test.tsx` 'reports file-handle exhaustion as a readable notice and opens no session'：`findByRole('alert')` 文案含「文件句柄」与「EMFILE」，且 `queryByRole('tablist', { name: '会话' })` 为 null。本轮 UI 自测按 `needSelfTest=false` 跳过，该断言由 code_gates 的 test 门禁实跑覆盖。
