# 把 README 两版版本指针更新到 v0.2.25

## 范围

- `README.md` 第 5 行、`README.zh-CN.md` 第 5 行的「最新公开版本」指针由 v0.2.24 改为 v0.2.25（显示文本与链接同批改）。
- 同批核对两份 README 内的其余「最新 Release / 下载」指针与 badge 文案：凡显式锁定到已发布版本号的都指到 v0.2.25；未锁版本号的 `releases` / badge 链接保持不变。
- 若仓库已有 README 版本指针守卫或测试把版本号钉死，同批更新并把断言改到 v0.2.25，在 change pack 里写明原因。

## 验收

- ac-1: `README.md` 第 5 行等于 `> Latest public release: [v0.2.25](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.25) — Developer ID signed and Apple-notarized macOS build.`
- ac-2: `README.zh-CN.md` 第 5 行等于 `> 最新公开版本：[v0.2.25](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.25) — macOS 安装包经 Developer ID 签名与 Apple 公证。`
- ac-3: `grep -n 'releases/tag/v0.2.24' README.md README.zh-CN.md` 零命中。
- ac-4: 两版仍是 9 节双语镜像、第 3 行互链、`README.md` 正文不超过 700 词、两版截图引用未变。
- ac-5: `.munk/code-gates.json` 全量门绿；若改动了版本指针守卫，附「把指针回退到 v0.2.24 即变红」的反向自测结果。

## 非目标

- 不 bump `package.json#version`、不改 CHANGELOG / release notes / docs/release-evidence、不重新截图。
- 不改 `.github/workflows/**`、不改发版流程、不推 tag、不 dispatch workflow、不改已公开 v0.2.25 Release 与资产。
- 不动 `src/**` 与既有测试语义（仅允许版本指针守卫的版本号更新）。

## 实现约束

- 语义单点文件只在本 worktree 改、过门后经 delivery 合入 main，不在其他会话手改。
- 中英文两版同批改、保持镜像结构，不新增或删除章节。

## 本单执行约束（不 fold）

- 一个写项、一个 ≤150K 上下文会话内完成；先落盘小步改动再验证。
- 交付前跑 `code_gates`；失败即修，不放宽门、不删测试。
- 不推 tag、不 dispatch workflow、不改已公开 Release；按既有 delivery 路径合入 main。
