# 把 v0.2.26 公开版指针收口到 README

## 范围

- `README.md` 第 5 行 `Latest public release` 链接从 v0.2.25 改为 v0.2.26：`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.26`。
- `README.zh-CN.md` 第 5 行 `最新公开版本` 同步改指 v0.2.26，中英同版本同 URL。
- `src/main/__fixtures__/release-announced-tag.json` 的 `tags` 追加 `v0.2.26`，保留历史 `v0.2.24` / `v0.2.25`。
- 除上述三处外不改 README 其它段落、不改截图引用。

## 验收

- ac-readme-en: `README.md` 第 5 行 tag 为 v0.2.26，链接指向 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.26`。
- ac-readme-zh: `README.zh-CN.md` 第 5 行同为 v0.2.26，且与英文版指同一 tag。
- ac-fixture: `release-announced-tag.json` 的 tags 末尾为 `v0.2.26`，`v0.2.24` / `v0.2.25` 仍在。
- ac-gate: 受影响守卫（release-doc fixtures / README 结构与双语镜像）与 `.munk/code-gates.json` 全绿，attempt 与产出 commit 同源。
- ac-fact: 依据是已公开 Release v0.2.26（publishedAt 2026-11-22T03:44:24Z，12 资产，tag commit 1466c01）；本单不重新发布、不改线上。

## 非目标

- 不改代码行为、UI、发布流程或门禁阈值。
- 不推 tag、不 dispatch `release.yml`、不动 GitHub Release / 资产 / 历史 tag。
- 不改 `package.json#version` / `CHANGELOG` / release notes / `release.yml` 默认 tag。
- 不新增 `docs/release-evidence/**` 文件（本版发布证据在 ops run 目录）。

## 实现约束

- README 第 5 行只指已公开版本，中英必须同版本同 URL。
- 只改上述 3 个文件，不新增依赖、不改测试基线、不缩测试集合。
- 走 delivery 合入 main；不推 tag、不 dispatch、不改已公开 Release 与资产。

## 本单执行约束（不 fold）

- 预算：单会话 ≤150K，先小步落盘再继续；单测快反馈只跑一次。
- 停止线：若门禁现红且与本次改动无关，照实停手并报 needsOwner，不为凑绿改无关文件。
- 交付证明：写明门禁 attempt id 与 commit 同源、treeMatchesGateBinding、unauthorizedForbiddenCount。
