# Dispatch evidence — coverage-gate-preflight workflow

Status: **done (Delivery, post-merge)** — `ac-dispatch-run-evidence`, explicitly not part of code_gates.

## Pre-merge context

- measured commit: `11170a5d300b5318c320913eaf6fea54ac510173`
- baseline `measuredAt.commit`: `11170a5d300b5318c320913eaf6fea54ac510173` (2026-11-04T17:02:59.000Z)
- `git rev-list --count v0.2.20..11170a5d300b5318c320913eaf6fea54ac510173` = 5

## Delivery merge

- WI branch: `munk/wi_intake_cd7cb20c206d9bfe`
- WI commit (fold): `ce124aa1fb8c7ecd495c783d6bb122051d601283`
- local `main` / `origin/main` tip after `munk_local_merge`: `2110e158023caf2a5a1daaa8665cfb5023f1854a`

## Dispatch run (executed on origin/main tip)

Commands:

```
gh workflow run coverage-gate-preflight.yml --ref main
gh run list --workflow=coverage-gate-preflight.yml --limit 5 --json databaseId,status,conclusion,headSha
gh run view 41875044524 --json databaseId,status,conclusion,headSha
```

Result (2026-11-04T17:17:05Z):

| field | value |
| --- | --- |
| databaseId | `41875044524` |
| headSha | `2110e158023caf2a5a1daaa8665cfb5023f1854a` |
| headSha == origin/main tip | yes |
| status | `completed` |
| conclusion | `success` |
| run URL | https://github.com/chaxiu/OpenCompare/actions/runs/41875044524 |

No 403 / `human_required` / gh-unavailable condition occurred, so no `munk_report_owner` was needed and no run id was fabricated.
