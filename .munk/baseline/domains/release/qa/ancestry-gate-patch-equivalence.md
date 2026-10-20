# ancestry-gate-patch-equivalence

covers: ac-ancestry-patch-equivalent, ac-ancestry-per-commit-log, ac-ancestry-ref-type-log, ac-ancestry-true-fork, ac-ancestry-enumeration-fail, ac-ancestry-protected-deletion, ac-ancestry-ahead-nonzero, ac-ancestry-readonly, ac-gate-before-install
标题: v0.1.2 祖先门接受「严格祖先或逐提交补丁等价」，其余形态 fail-closed
步骤: 打开 `.github/workflows/release.yml` 的祖先门 step（内联 `run` 脚本，位于 `pnpm install` 之前）；在临时 git 仓库构造 tag-only 提交（补丁等价 / 真分叉 / 删除受保护路径 / tag 不可解析）后直接跑该脚本
期望: 日志先打印 `v0.1.2` 的 ref 类型（`git cat-file -t` 为 `commit` 即轻量、`tag` 即 annotated）与解析到的 commit SHA，再打印 `v0.1.2..HEAD` 与 `HEAD..v0.1.2` 计数；`v0.1.2..HEAD` 为 0 时非零退出；严格祖先（`HEAD..v0.1.2` = 0）直接通过；否则逐条列出仅 tag 可达提交并打印完整 SHA 与 `git cherry HEAD <sha>` 判定符号，全部为 `-` 时退出 0，出现 `+`、判定为空、提交无法枚举、tag 无法解析、或该提交 diff 删除 `.github/workflows/` / `build/` / `electron-builder.yml` / `package.json` 时输出 `::error::` 并 `exit 1`；门只调用只读 git 子命令（`cat-file` / `rev-parse` / `rev-list` / `cherry` / `diff-tree`），不创建、移动、删除任何 tag / ref，不 push，不调用 `gh release` 写操作

## 最近执行

- workItemId: wi_intake_cde26b56b1d77ba2
- at: 2026-10-20
- status: pass
- note: 由 `src/main/release-packaging.test.ts` 的 `v0.1.2 ancestry gate` 组覆盖：测试解析 workflow 的真实 `run` 脚本并在 `os.tmpdir()` 临时仓库用 bash 执行——补丁等价（含多提交链）通过且日志含 SHA 与 `-`、轻量 tag 打印 `commit` ref 类型、`+` 分叉拒绝、删除受保护路径拒绝、tag 不可解析 fail-closed、`v0.1.2..HEAD` 为 0 拒绝、gates 路径无 `|| true` / `continue-on-error`。本轮 code_gates `pnpm test` 391 tests 全绿；本仓实况（远端 `v0.1.2` → `bb0c0b1`，两条 tag-only 提交均 `-`）即补丁等价通过场景。未在真实 CI 上执行。
