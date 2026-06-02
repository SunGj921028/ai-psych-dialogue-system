# Report v2 Provider Smoke-Test Runbook

This runbook is a local-only manual smoke-test guide for Report v2 provider
mode. It is not CI, not pytest, not a production workflow, and not a substitute
for deterministic automated tests.

Use only synthetic or fully de-identified data. Do not run this workflow with
real client, counselor, session, or clinical records.

## Purpose And Scope

Use this workflow only to confirm that explicit Report v2 provider mode can call
the real provider boundary locally, validate provider output as
`ReportAIGeneratedV2`, and persist only validated `ai_generated` draft content.

This runbook covers:

- Local backend execution.
- Explicit `REPORT_V2_PROVIDER_MODE=provider`.
- Explicit `REPORT_V2_PROVIDER=gemini|groq`.
- Optional `REPORT_V2_API_KEY` for a Report-v2-specific provider key override.
- A throwaway local SQLite database.
- Synthetic case/session/draft data.
- Manual success and failure checks.

This runbook does not cover:

- CI or automated tests.
- pytest.
- production data.
- frontend behavior changes.
- v1 report generation changes.
- counselor final report workflow.
- PDF export.
- MCP.

## Latest Local Result

A local Report v2 provider smoke test has passed with synthetic data after the
provider field metadata normalization fix.

Observed successful checks:

- `POST /api/report-drafts/{draft_id}/generate` returned
  `status = ai_generated`.
- `generated_at` was set.
- `ai_generated` contained provider-generated draft fields.
- SQLite returned `ai_generated|1|1|1` for the status/generated/AI/final-null
  check.
- `report_drafts` contained `ai_generated_json`.
- `final_report_json` remained null after v2 AI draft generation.
- `report_drafts` had no raw prompt, raw response, provider-response, or
  prompt-text columns.
- Frontend/browser rendering displayed Chinese correctly.
- PowerShell displayed mojibake in some output, which does not by itself mean
  frontend/browser rendering is broken.

## Safety Warnings

- Do not use real client or counselor data.
- Do not commit API keys.
- Do not commit `.env`.
- Do not commit smoke-test SQLite databases or SQLite sidecar files.
- Do not paste real clinical notes into prompts, summaries, manual input, logs,
  screenshots, tickets, or chat messages.
- Do not add this workflow to automated tests or CI.
- Provider calls may incur cost.
- Raw prompts and raw provider responses must not be persisted.
- Do not commit screenshots or logs containing prompts, responses, clinical
  content, provider errors, API keys, or secrets.

## Current Provider Mode Context

The example backend environment template at `backend/.env.example` documents the
safe default:

```text
REPORT_V2_PROVIDER_MODE=deterministic
REPORT_V2_PROVIDER=gemini
REPORT_V2_MODEL=
REPORT_V2_API_KEY=
REPORT_V2_FALLBACK_ENABLED=false
REPORT_V2_FALLBACK_PROVIDER=groq
REPORT_V2_FALLBACK_MODEL=llama-3.3-70b-versatile
REPORT_V2_FALLBACK_API_KEY=
```

Keep deterministic mode as the default for normal local setup. Provider mode is
only for explicit local/manual validation and requires a selected provider plus
the corresponding provider API key.

Report v2 generation supports:

```text
REPORT_V2_PROVIDER_MODE=deterministic|provider
REPORT_V2_PROVIDER=gemini|groq
```

Unset or blank `REPORT_V2_PROVIDER_MODE` defaults to `deterministic`.
Provider mode requires explicit opt-in with:

```text
REPORT_V2_PROVIDER_MODE=provider
```

Invalid explicit mode values fail closed. They should not silently fall back to
deterministic mode.

Unset or blank `REPORT_V2_PROVIDER` defaults to `gemini`. Invalid explicit
provider values fail closed as `provider_config`. Provider selection is explicit:
a model name alone does not determine which provider endpoint/client is used.

`REPORT_V2_MODEL` is optional and used only in provider mode. Provider mode model
selection is provider-specific:

- Gemini fallback: `REPORT_V2_MODEL`, then `ANALYSIS_MODEL`, then
  `gemini-2.5-flash`.
- Groq fallback: `REPORT_V2_MODEL`, then `llama-3.3-70b-versatile`. Groq does
  not fall back to `ANALYSIS_MODEL`.

`REPORT_V2_API_KEY` is optional. If set, Report v2 provider calls use it for the
selected provider. If unset, `gemini` uses `GEMINI_API_KEY` and `groq` uses
`GROQ_API_KEY`. A dedicated Report v2 key can isolate report-generation quota
from crisis/summary quota. Crisis and summary agents do not use
`REPORT_V2_API_KEY`.

Provider mode supports Gemini and Groq provider paths. Groq can be used as a
dedicated Report v2 provider to reduce Gemini rate-limit friction during longer
structured report-generation tasks. Existing v1 report generation remains
unchanged.

Report v2 provider mode can also enable an opt-in fallback provider path. It is
disabled by default with `REPORT_V2_FALLBACK_ENABLED=false`; truthy values
`1`, `true`, `yes`, and `on` enable fallback only after the primary Report v2
provider fails with `provider_api_failure`, such as a transient outage, timeout,
503, or rate-limit-like API failure. A common manual configuration is Gemini as
the primary provider for higher quality output and Groq as fallback for transient
availability failures. This fallback is Report-v2-only: it does not affect
crisis, summary, conversation, v1 report generation, or deterministic Report v2
mode.

Fallback is not a safety or schema bypass. It does not run for
`provider_config`, `missing_summaries`, `invalid_provider_json`,
`schema_validation_failed`, `unsafe_evidence_refs`, or `db_persistence_failed`.
Fallback output must pass the same parser normalization and
`ReportAIGeneratedV2` validation before persistence. If fallback fails, the
public response remains the same generic failure response and existing
`ai_generated_json` is not overwritten.

Fallback configuration:

```text
REPORT_V2_FALLBACK_ENABLED=false
REPORT_V2_FALLBACK_PROVIDER=groq
REPORT_V2_FALLBACK_MODEL=llama-3.3-70b-versatile
REPORT_V2_FALLBACK_API_KEY=
```

`REPORT_V2_FALLBACK_API_KEY` is optional. If set, fallback calls use it first.
If unset, fallback key selection uses `REPORT_V2_API_KEY`, then the selected
provider-specific key path. If fallback provider/model/key match the primary
provider/model/key, the system allows it as one retry for transient failure.

Report v2 generation now classifies failures internally as
`missing_summaries`, `provider_config`, `provider_api_failure`,
`invalid_provider_json`, `schema_validation_failed`, `unsafe_evidence_refs`,
`db_persistence_failed`, or `unknown_generation_failure`. Public route responses
remain generic and non-leaking. Logs should contain only the category plus
case/session/draft identifiers, never raw prompts, raw provider responses,
secrets, provider exception text, clinical text, or traces.

## Prerequisites

Prepare:

- A throwaway local SQLite DB.
- A local backend process.
- Provider key set in the current shell only, such as `GEMINI_API_KEY`,
  `GROQ_API_KEY`, or `REPORT_V2_API_KEY`.
- `REPORT_V2_PROVIDER_MODE=provider`.
- `REPORT_V2_PROVIDER=gemini` or `REPORT_V2_PROVIDER=groq`.
- Optional `REPORT_V2_MODEL`.
- A synthetic case and session.
- At least one persisted summary for the session.
- One Report v2 draft for that case/session.

Prefer an API-only smoke test for the generate endpoint. If a summary is not
already present, seed one only with synthetic data in the throwaway database.
Avoid using the conversation route for this focused smoke test unless you
intentionally want to call the other conversation, crisis, and summary provider
paths too.

## Synthetic Data Guidance

Use low-risk invented content such as:

- mild stress or anxiety.
- work or school adjustment.
- sleep disruption.
- communication stress.
- `crisis_flag=false`.
- `crisis_level=none`.

Example synthetic summary idea:

```text
Synthetic summary only: the client reports recent workload stress, some sleep
disruption, and uncertainty about how to communicate needs at school or work.
```

Avoid:

- real names.
- real histories.
- identifiable events.
- copied clinical content.
- real clinical notes.
- high-risk crisis content in the first smoke test.

## Recommended API-Only Workflow

1. Start the backend with a throwaway `DATABASE_PATH` and provider-mode env vars.
2. Create or identify a synthetic case.
3. Create or identify a synthetic session.
4. Ensure the session has at least one persisted synthetic summary.
5. Create or load the current Report v2 draft.
6. Optionally save minimal manual input.
7. Call `POST /api/report-drafts/{draft_id}/generate`.
8. Inspect the response.
9. Inspect the local DB row without dumping full clinical text.
10. Check terminal logs for accidental prompt, response, or secret leakage.

## Suggested PowerShell Commands

Set environment variables in the current shell only:

```powershell
Set-Location D:\AI_Project\ai-psych-dialogue-system\backend

$env:DATABASE_PATH = Join-Path $env:TEMP "ai_psych_report_v2_provider_smoke.db"
$env:GEMINI_API_KEY = "<set-real-key-in-shell-only>"
$env:REPORT_V2_PROVIDER_MODE = "provider"
$env:REPORT_V2_PROVIDER = "gemini"
$env:REPORT_V2_MODEL = "gemini-2.5-flash"
```

For a Groq Report v2 smoke test, set a Groq key in the current shell only:

```powershell
$env:DATABASE_PATH = Join-Path $env:TEMP "ai_psych_report_v2_provider_smoke.db"
$env:GROQ_API_KEY = "<set-real-key-in-shell-only>"
$env:REPORT_V2_PROVIDER_MODE = "provider"
$env:REPORT_V2_PROVIDER = "groq"
$env:REPORT_V2_MODEL = "llama-3.3-70b-versatile"
```

To isolate report-generation quota from the shared crisis/summary Groq key, use
a Report-v2-specific key override:

```powershell
$env:REPORT_V2_API_KEY = "<set-report-v2-provider-key-in-shell-only>"
$env:REPORT_V2_PROVIDER = "groq"
```

`REPORT_V2_MODEL` is optional. Omit it to use the configured provider-specific
fallback behavior.

For a Gemini-primary, Groq-fallback manual smoke test, set both providers in the
current shell only:

```powershell
$env:DATABASE_PATH = Join-Path $env:TEMP "ai_psych_report_v2_provider_smoke.db"
$env:GEMINI_API_KEY = "<set-real-gemini-key-in-shell-only>"
$env:GROQ_API_KEY = "<set-real-groq-key-in-shell-only>"
$env:REPORT_V2_PROVIDER_MODE = "provider"
$env:REPORT_V2_PROVIDER = "gemini"
$env:REPORT_V2_MODEL = "gemini-2.5-flash"
$env:REPORT_V2_FALLBACK_ENABLED = "true"
$env:REPORT_V2_FALLBACK_PROVIDER = "groq"
$env:REPORT_V2_FALLBACK_MODEL = "llama-3.3-70b-versatile"
```

Use `REPORT_V2_FALLBACK_API_KEY` only when you intentionally want a
fallback-specific key. Do not write provider keys to `.env` for smoke testing.

Start the backend:

```powershell
python -m uvicorn main:app --reload
```

From another PowerShell session, create a synthetic case:

```powershell
$case = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/cases" `
  -ContentType "application/json" `
  -Body '{"code_name":"SMOKE-RV2-001","note":"synthetic provider smoke test only"}'

$caseId = $case.id
```

Create a synthetic session:

```powershell
$session = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/cases/$caseId/sessions" `
  -ContentType "application/json" `
  -Body '{"title":"Report v2 provider smoke test"}'

$sessionId = $session.session_id
```

Create or load a Report v2 draft:

```powershell
$draft = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/cases/$caseId/sessions/$sessionId/report-drafts" `
  -ContentType "application/json" `
  -Body '{"manual_input":{"basic_info":{"referral_source":{"value":"synthetic school counselor","source_type":"manual"}}}}'

$draftId = $draft.draft_id
```

Call the generate endpoint after at least one persisted synthetic summary exists:

```powershell
$generated = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/report-drafts/$draftId/generate"

$generated.status
$generated.generated_at
$generated.ai_generated
```

If you already have a synthetic draft ID:

```powershell
$draftId = "<synthetic-draft-id>"
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/report-drafts/$draftId/generate"
```

Safe SQLite inspection examples:

```powershell
sqlite3 $env:DATABASE_PATH "SELECT status, generated_at IS NOT NULL AS has_generated_at, ai_generated_json IS NOT NULL AS has_ai_generated, final_report_json IS NULL AS final_report_is_null FROM report_drafts WHERE id = '<synthetic-draft-id>';"

sqlite3 $env:DATABASE_PATH "PRAGMA table_info(report_drafts);"
```

Avoid selecting and copying full `ai_generated_json` unless the data is fully
synthetic and you need to inspect schema shape locally.

## Expected Success Checks

The generate response should show:

- HTTP success.
- `status == "ai_generated"`.
- `generated_at` exists.
- `ai_generated` exists.
- `manual_input` is preserved.
- `final_report` remains null.
- Evidence refs are pointer-only.
- No raw prompt or raw provider response is present.
- Provider `source_type` and `missing_reason` variants are normalized for known
  `ReportAIGeneratedV2` fields.
- Unknown/manual-only fields remain rejected.

Evidence refs should use only safe pointer fields such as:

- `turn_number`.
- `summary_id`.
- short safe notes such as `summary metadata`, `manual input`, or
  `persisted crisis level`.

## DB / Storage Verification

Confirm in the throwaway DB:

- `ai_generated_json IS NOT NULL`.
- `final_report_json IS NULL`.
- `manual_input_json` remains present.
- `report_drafts` has no raw prompt, raw response, provider response, or prompt
  text columns.
- No API keys or secrets are stored.
- No raw messages are stored in `report_drafts`.
- No crisis detector reasons are stored in `report_drafts`.
- `source_summary_ids_json` contains pointer-only references.

Also check local artifacts:

- No `.env` changes were created for the smoke test.
- No smoke DB, WAL, SHM, log, or screenshot files are staged in git.
- Browser storage remains irrelevant unless the frontend is used.

## Optional Failure-Mode Checks

Run these only with synthetic data.

Invalid mode:

- Set `REPORT_V2_PROVIDER_MODE` to an invalid value.
- Call the generate endpoint.
- Expect a generic failure response.
- Expect only an internal diagnostic category such as `provider_config`.
- Confirm existing `ai_generated_json` is not overwritten.

Missing or invalid provider key:

- Use `REPORT_V2_PROVIDER_MODE=provider`.
- Set `REPORT_V2_PROVIDER=gemini` and omit both `REPORT_V2_API_KEY` and
  `GEMINI_API_KEY`, or set `REPORT_V2_PROVIDER=groq` and omit both
  `REPORT_V2_API_KEY` and `GROQ_API_KEY`.
- Call the generate endpoint.
- Expect fail-closed behavior with a generic failure response.
- Expect only an internal diagnostic category such as `provider_config` or
  `provider_api_failure`; do not expose provider exception text.

Provider failure after a successful generation:

- First generate a valid synthetic AI draft.
- Then force provider failure through an invalid key or invalid provider setup.
- Call generate again.
- Confirm the previous `ai_generated_json` remains intact.

Opt-in fallback success:

- Use `REPORT_V2_PROVIDER_MODE=provider`.
- Use Gemini as primary and Groq as fallback.
- Force a primary transient/provider API failure with synthetic data only.
- Expect one fallback provider attempt.
- Expect fallback output to persist only after normal parser/schema validation.

Fallback-ineligible output failure:

- Enable fallback.
- Force primary output to be invalid JSON, schema-invalid, or to contain unsafe
  evidence refs.
- Expect no fallback call.
- Expect a generic failure response and a diagnostic category matching
  `invalid_provider_json`, `schema_validation_failed`, or `unsafe_evidence_refs`.

No-summary draft:

- Create a draft for a synthetic session with no persisted summaries.
- Call generate.
- Expect 422 before provider generation.
- Expect the internal category `missing_summaries`.

Deterministic mode:

- Unset provider key.
- Set `REPORT_V2_PROVIDER_MODE=deterministic` or leave it blank.
- Call generate for a summary-backed synthetic draft.
- Expect conservative deterministic behavior without provider calls.

## What Must Not Be Automated

- No live provider call in pytest.
- No live provider call in CI.
- No committed `.env`.
- No committed smoke DB.
- No committed secrets.
- No committed screenshots or logs containing prompts, responses, clinical
  content, provider errors, API keys, or secrets.
- No manual smoke script unless separately approved.

## Cleanup

After the smoke test:

```powershell
Remove-Item $env:DATABASE_PATH
Remove-Item "$env:DATABASE_PATH-wal"
Remove-Item "$env:DATABASE_PATH-shm"

Remove-Item Env:DATABASE_PATH
Remove-Item Env:GEMINI_API_KEY
Remove-Item Env:GROQ_API_KEY
Remove-Item Env:REPORT_V2_PROVIDER_MODE
Remove-Item Env:REPORT_V2_PROVIDER
Remove-Item Env:REPORT_V2_MODEL
Remove-Item Env:REPORT_V2_API_KEY
Remove-Item Env:REPORT_V2_FALLBACK_ENABLED
Remove-Item Env:REPORT_V2_FALLBACK_PROVIDER
Remove-Item Env:REPORT_V2_FALLBACK_MODEL
Remove-Item Env:REPORT_V2_FALLBACK_API_KEY
```

Only remove explicit single-file paths. If your environment created additional
files and you are unsure which ones are safe to delete, stop and inspect them
manually.

Verify git status:

```powershell
git status --short
```

Do not commit generated DBs, sidecar files, logs, screenshots, `.env`, provider
outputs, or secrets.

## Troubleshooting

`422` from `POST /api/report-drafts/{draft_id}/generate` usually means the draft
session has no persisted summaries.

`500` may indicate:

- `provider_config` for invalid provider mode or missing configuration.
- `provider_api_failure` for provider outage, timeout, or API failure.
- `invalid_provider_json` for non-parseable provider JSON.
- `schema_validation_failed` for schema-invalid provider output.
- `unsafe_evidence_refs` for unsafe evidence reference notes.
- `db_persistence_failed` for draft persistence failure.
- `unknown_generation_failure` for an unexpected generation failure.

Do not paste raw provider responses into issues, logs, commits, or chat messages
if they contain clinical content. Retry only with synthetic data.

If JSON-mode compatibility fails for the provider/model, record only the generic
failure category and model name. Do not persist or share raw provider responses.

PowerShell may display Traditional Chinese text as mojibake depending on the
active code page and font. Confirm user-visible Chinese rendering in the browser
or frontend before treating console mojibake as an application rendering defect.

## Future Work

- A manual smoke script may be considered later, but this runbook does not add
  one.
- A separate demo runbook may be added later.
- Synthetic demo data may be added later.
- The post-demo prompt refinement batch is complete; future prompt work should
  be documented as a new slice.
- Counselor final report workflow and reviewed status remain separate future
  work.
- Print-friendly/PDF export remains separate future work.
- Production deployment/testing remains separate future work.
- Charts/Recharts planning, MCP, and docs after future slices remain separate
  future work.
