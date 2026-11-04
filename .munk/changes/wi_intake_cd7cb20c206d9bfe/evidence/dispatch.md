# Dispatch evidence — coverage-gate-preflight workflow

Status: **deferred to Delivery** (this is an `ac-dispatch-run-evidence` post-delivery item, explicitly not part of code_gates).

Coding stage may not dispatch `main` before this workflow exists there:

- local HEAD measured: `11170a5d300b5318c320913eaf6fea54ac510173`
- baseline `measuredAt.commit`: `11170a5d300b5318c320913eaf6fea54ac510173` (2026-11-04T17:02:59.000Z)
- `git rev-list --count v0.2.20..11170a5d300b5318c320913eaf6fea54ac510173` = 5

Delivery must, after merging to local `main` and pushing `origin/main`:

1. `gh workflow run coverage-gate-preflight.yml --ref main`
2. poll `gh run list --workflow=coverage-gate-preflight.yml --limit 5 --json databaseId,status,conclusion,headSha`
3. record here the `databaseId` and `headSha` of the run whose `headSha == origin/main tip`, `status == completed`, `conclusion == success`.

If `gh` returns 403 / `human_required` / is unavailable, record the raw error here and `munk_report_owner` — do **not** fabricate a run id.
