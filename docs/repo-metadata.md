# Repository metadata (English)

GitHub repository description and topics for `chaxiu/OpenCompare`, kept in English to match the default README.

## Execution order

This is the **independent last step**: run it only after every file change in this change set and all quality gates (`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm build:web`, `pnpm test`) pass. The README files are already delivered at that point.

If the write is blocked by permissions, branch protection or an approval prompt, record the raw stderr in the delivery report, stop this step, and do not block or roll back the README delivery.

## Description

```text
Modern cross-platform desktop diff and three-way merge tool: directory compare and sync, template relocation, snapshots, code diff, CSV alignment, JSON/YAML semantic compare. Free MIT alternative to Beyond Compare 5 Pro.
```

Character count: 220 (limit 350).

## Topics

`electron`, `react`, `typescript`, `desktop-app`, `diff`, `merge`, `three-way-merge`, `directory-compare`, `file-comparison`, `diff-tool`, `csv`, `json`, `yaml`, `developer-tools`, `cross-platform`, `beyond-compare-alternative`, `mit-license`

17 topics, all lowercase kebab-case and unique (limit 20).

## Command

```bash
gh repo edit chaxiu/OpenCompare \
  --description "Modern cross-platform desktop diff and three-way merge tool: directory compare and sync, template relocation, snapshots, code diff, CSV alignment, JSON/YAML semantic compare. Free MIT alternative to Beyond Compare 5 Pro." \
  --add-topic electron \
  --add-topic react \
  --add-topic typescript \
  --add-topic desktop-app \
  --add-topic diff \
  --add-topic merge \
  --add-topic three-way-merge \
  --add-topic directory-compare \
  --add-topic file-comparison \
  --add-topic diff-tool \
  --add-topic csv \
  --add-topic json \
  --add-topic yaml \
  --add-topic developer-tools \
  --add-topic cross-platform \
  --add-topic beyond-compare-alternative \
  --add-topic mit-license
```

Verify with a read-only call:

```bash
gh repo view chaxiu/OpenCompare --json description,repositoryTopics
```
