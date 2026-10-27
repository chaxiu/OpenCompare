# save-file-atomic

covers: ac-save-success-content, ac-save-overwrite-existing, ac-save-no-temp-residue, ac-save-cancel-null, ac-save-samples-readonly, ac-save-failure-readable, ac-save-failure-no-residue, ac-save-port-contract, ac-save-callers-green, ac-save-web-unchanged, ac-save-rename-platform
标题: 保存落盘原子化——成功/取消/不可写三路径收口，目标目录无 0 字节、半截或临时文件残留
步骤: 1) 读 `src/main/platform/electron-platform.ts`，确认 `saveFile` 走 `assertWritable` → 同目录临时文件 `writeFile` → `rename`，失败分支 `rm(temporary, { force: true })` 后抛出「无法写入文件 <path>：…（CODE）。」且不暴露临时文件名；确认 `writeUserSettings` 复用同一 helper、无第二套临时文件逻辑；2) `pnpm test` 跑 `electron-platform.test.ts` 的「atomic save」与既有 native save dialog 用例，以及 `DirectoryReportExport.test.tsx` / `App.snapshot.test.tsx` / `CodeView.test.tsx`（合并导出）；3) `pnpm dev` 分别做快照导出、合并结果导出、HTML 报告导出：各保存到可写新路径，外部读回逐字比对；4) 再导出一次并覆盖同名旧文件，确认旧内容消失；5) 每次保存后 `ls -a` 目标目录，确认无 `.tmp` 残留；6) 每次再点一次并取消，确认返回 `null` 且目录条目集合不变；7) 对 `/samples/**` 路径保存，确认 reject 含「只读」与目标路径且样本目录无新增；8) 对已存在非空目录路径保存，确认 reject 含中文原因与目标路径、目录内容与临时文件均未被破坏
期望: 成功时返回目标路径且落盘内容与传入 `content` 逐字一致（含空串、多字节中文/emoji、>1 MB）；覆盖同名文件后旧内容不再存在；目标目录条目集合 = 保存前集合 + 目标文件，无任何 `.tmp` 残留；取消返回 `null` 且零新建、零截断、零临时文件；`/samples/**` 与真实写/rename 失败均 reject 为含目标路径的中文可读 `Error`（有 OS code 时带上），不返回 `null`、不静默成功，失败后目标目录集合与保存前完全相同、已存在目标原样未损；`PlatformPort.saveFile` 签名与 `PLATFORM_CHANNELS.saveFile` 不变，preload / renderer / shared 平台类型零改动；Web 平台 `saveFile` 语义与既有测试不变；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿，既有三个调用方测试零回归

## 最近执行

- workItemId: wi_ws_5d6ca74561fcb9ea
- at: 2026-10-27
- status: pass
- note: code_gates passed（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 全绿；`pnpm test` 62 files / 965 passed / 1 skipped）。自动化断言覆盖 ac-save-success-content（空串 / 中文 emoji / 1.2 MB）、ac-save-overwrite-existing、ac-save-no-temp-residue、ac-save-cancel-null（canceled 与空 filePath）、ac-save-samples-readonly、ac-save-failure-readable 与 ac-save-failure-no-residue（rename 到非空目录、写入不存在子目录），失败消息均断言含中文 + 目标路径且不含 `.tmp`。本 WI `needSelfTest=false`，步骤 3–7 的原生保存面板与三处视图人工点击未执行（待 product-qa）；`ac-save-rename-platform` 的 Windows 占用/只读分支未实测，仅有 POSIX（macOS）rename 覆盖与实现注释口径。
