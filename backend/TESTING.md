# Backend Testing Guide

This document describes backend testing direction and current test status. The
repository now includes deterministic pytest tests for routes, agents, and the
SQLite data layer, while older live-provider scripts live under
`backend/manual_checks/` as manual checks.

## Testing Direction

Automated backend tests should be:

- pytest-style.
- deterministic.
- network-free by default.
- based on mocked LLM clients or mocked agent functions.
- safe to run without provider API keys.
- isolated from developer data by using temporary SQLite databases.

Live provider scripts may remain for manual checks, but they should not be required
for automated verification.

## Current Automated Tests

Current deterministic tests live under `backend/tests/`:

| File | Current role | Notes |
|---|---|---|
| `backend/tests/conftest.py` | pytest fixtures | Uses a temporary SQLite database through `DATABASE_PATH`. |
| `backend/tests/helpers.py` | test helpers | Provides fake OpenAI-compatible LLM response objects for agent tests. |
| `backend/tests/test_db.py` | automated DB tests | Covers schema initialization, WAL mode, CRUD helpers, public field mapping, summary parsing, persisted summary `crisis_level` schema/migration/allowed-value behavior, crisis/session helpers, sessions table creation, idempotent backfill, create/get/ensure/touch helpers, explicit empty sessions, session title normalization/exposure/update behavior, legacy derived compatibility with null titles, legacy/backfilled session rename, archive/unarchive schema and migration behavior, archive/unarchive helper behavior, message/summary preservation, sorting, no-leak metadata, limits, timestamps, cascade behavior, `report_drafts` table creation, create/get current report draft behavior, one-current-draft behavior, UUID-like IDs, default status, fixed schema version, manual input validation, partial/empty manual input, timestamp updates, v2 `ai_generated_json` persistence, status transition to `ai_generated`, `generated_at`, manual input preservation, final report remaining null, safe pointer-only source refs, and archived-session draft support. |
| `backend/tests/test_crisis_agent.py` | automated agent tests | Monkeypatches the crisis LLM client and covers valid JSON, fallback, normalization, contradiction repair, and heuristic crisis levels. |
| `backend/tests/test_summary_agent.py` | automated agent tests | Monkeypatches the summary LLM client and covers valid JSON, score clamping, theme/key-statement normalization, external crisis flag ownership, and fallback. |
| `backend/tests/test_conversation_agent.py` | automated agent tests | Monkeypatches the conversation LLM client and covers safe output, unsafe diagnostic replacement, provider fallback, boundary warnings, and history windowing. |
| `backend/tests/test_analysis_agent.py` | automated agent tests | Monkeypatches the analysis LLM client and Report v2 provider boundary; covers insufficient data, fixed disclaimer, code-owned `has_crisis` and `peak_turn`, v1 fallback, v1 preservation, deterministic/conservative v2 AI draft fallback, Report v2 prompt payload safety/source shaping, message safety instructions, provider mode with monkeypatched provider, model fallback behavior, valid provider parser output, invalid/manual-only/unsafe parser rejection, provider exception and invalid mode fail-closed behavior, and provider boundary behavior without live provider calls. |
| `backend/tests/test_routes_cases.py` | automated route tests | Covers case create/list/get/delete and missing-case 404 behavior. |
| `backend/tests/test_routes_conversation.py` | automated route tests | Monkeypatches agent calls, verifies persistence, persisted summary `crisis_level` from mocked crisis detector output, summary API exposure, public response shape, conversation ensure/touch behavior, POST session creation/idempotency, title normalization/exposure and duplicate no-overwrite behavior, PATCH session title success/trim/clear/validation/not-found behavior, archive/unarchive behavior, default archived-session exclusion, `include_archived=true` listing, legacy/backfilled rename behavior, missing-case behavior, legacy null titles, and safe session-listing metadata behavior. |
| `backend/tests/test_routes_errors.py` | automated route error tests | Covers non-leaking route failure behavior, including session creation/listing/title-update/archive/unarchive helper failures and report draft helper failures. |
| `backend/tests/test_routes_reports.py` | automated route tests | Covers v1 report route summary conversion and insufficient-data behavior, plus Report Schema v2 draft current/create/manual-input/generate endpoints, idempotent create behavior, manual input persistence, v2 route success, provider mode success/failure with monkeypatched provider, no overwrite on provider failure, no-summary provider non-call behavior, missing draft 404, no summaries 422, invalid agent output, DB/helper failure, generated JSON persistence, status transition, `generated_at`, manual input preservation, final report null, safe source refs, missing-resource 404 behavior, and invalid manual input 422 behavior. |

These tests are network-free, do not require API keys, and should be treated as the
current deterministic backend test suite. They use temporary SQLite databases and
mocked or monkeypatched LLM clients/functions where provider calls would otherwise
occur.

## Existing Test / Script Inventory

Current backend manual check scripts:

| File | Current role | Notes |
|---|---|---|
| `backend/manual_checks/check_db_smoke.py` | legacy/manual smoke check | Uses a temporary DB but remains outside the default deterministic pytest commands. |
| `backend/manual_checks/check_crisis_agent.py` | live/manual script | Calls the crisis agent and may call Groq. |
| `backend/manual_checks/check_summary_agent.py` | live/manual script | Calls the summary agent and may call Groq. |
| `backend/manual_checks/check_conversation_agent.py` | live/manual script | Calls the conversation agent and may call Gemini. |
| `backend/manual_checks/check_analysis_agent.py` | live/manual script | Calls the analysis agent and may call Gemini depending on summary count. |
| `backend/manual_checks/check_providers.py` | live/manual script | Explicit provider connectivity check. |

These files are named `check_*.py` to avoid pytest test discovery. They should not
be included in the default deterministic test command. They are manual/live or
legacy smoke scripts and may require provider keys, network access, or model
behavior.

## Recommended Test Layout

Current and recommended layout:

```text
backend/
  manual_checks/
    README.md
    _path.py
    check_analysis_agent.py
    check_conversation_agent.py
    check_crisis_agent.py
    check_db_smoke.py
    check_providers.py
    check_summary_agent.py
  tests/
    conftest.py
    helpers.py
    test_db.py
    test_crisis_agent.py
    test_summary_agent.py
    test_conversation_agent.py
    test_analysis_agent.py
    test_routes_cases.py
    test_routes_conversation.py
    test_routes_errors.py
    test_routes_reports.py
```

This layout now exists. Additional deterministic tests should continue to be added
under `backend/tests/` rather than expanding manual check scripts.

## Testing The Database

Use a temporary SQLite file for each test or test module.

Guidance:

- Set `DATABASE_PATH` to a temporary file before calling `init_db()`.
- Do not use or mutate a developer's real `cases.db`.
- Assert public return dictionaries expose `turn_number`, not `round`.
- Assert summary helpers return parsed `summary` dictionaries, not raw `summary_json`.
- Assert summary helpers expose top-level nullable `crisis_level` metadata with
  allowed values `none`, `low`, `high`, or null.
- Assert legacy rows keep `crisis_level: null` and old `crisis_flag` values are
  not backfilled into exact levels.
- Assert invalid persisted crisis levels are rejected and that `crisis_level` is
  not injected into the parsed `summary` payload.
- Preserve WAL behavior unless a task explicitly asks for a journal-mode migration.
- Cover durable session metadata helpers, including sessions table creation,
  idempotent backfill from legacy messages/summaries, create/get/ensure/touch
  behavior, explicit empty sessions, legacy derived compatibility, sorting,
  archive/unarchive schema and migration behavior, archive/unarchive helper
  behavior, message/summary preservation, no-leak metadata, and cascade behavior.
- Cover Report Schema v2 draft persistence, including `report_drafts` table
  creation, one current draft per `(case_id, session_id, schema_version)`,
  `schema_version == "report_schema_v2"`, UUID-like IDs, default
  `manual_input_started` status, `manual_input_json` validation through
  `ReportManualInputV2`, partial/empty manual input, invalid manual input,
  timestamp updates, `update_report_ai_generated(...)`, `ai_generated_json`
  persistence, status transition to `ai_generated`, `generated_at`, manual
  input preservation, `final_report_json` remaining null, safe pointer-only
  source refs / source summary IDs, and archived-session draft support.

Example pattern:

```python
async def test_create_case_uses_temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    await init_db()

    case = await create_case("A001")

    assert case["code_name"] == "A001"
```

## Testing Agents Without Network

Do not call live LLM providers in automated tests.

Preferred approaches:

- Monkeypatch `get_llm_client()` to return a fake async client.
- Monkeypatch the specific agent function at the route boundary when testing routers.
- Provide fake response objects that match the small subset of the OpenAI SDK response
  shape used by the code.
- Test fallback behavior by making the fake client raise an exception.

Covered deterministic behaviors include:

- Crisis fallback heuristic returns conservative results.
- Summary values are clamped to `0..10`.
- Summary `crisis_flag` is forced from the external input.
- Conversation fallback avoids diagnosis and medication advice.
- Analysis report computes `has_crisis`, `peak_turn`, and fixed disclaimer in code.
- Report Schema v2 AI draft fallback returns a conservative schema-valid
  `ReportAIGeneratedV2` without live provider calls.
- `REPORT_V2_PROVIDER_MODE` defaults unset or blank values to `deterministic`;
  explicit `deterministic` mode does not call the provider; explicit `provider`
  mode uses a monkeypatched provider boundary in tests; invalid mode fails
  closed.
- `REPORT_V2_MODEL` is used only in provider mode and falls back to
  `ANALYSIS_MODEL`, then the existing default model.
- Report Schema v2 prompt/input builder uses
  `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"`, fixed curated
  knowledge-base excerpts, safety instructions, safe summary-shaped provider
  input, bounded/truncated `key_statement`, and excludes raw messages, crisis
  detector reasons, DB-internal `round`, and session title.
- Report Schema v2 provider output parser accepts JSON strings or dicts; rejects
  invalid JSON, non-object JSON, unknown/manual-only fields, and unsafe evidence
  ref notes; validates with `ReportAIGeneratedV2`; and limits evidence notes to
  pointer-only labels such as `summary metadata`, `manual input`, and
  `persisted crisis level`.
- `_call_report_v2_provider(...)` uses the existing Gemini-style provider
  infrastructure in provider mode, but automated tests monkeypatch the boundary
  and verify that no live provider is required.
- Provider failures, invalid JSON, forbidden/manual-only fields, unsafe evidence
  refs, and invalid provider mode fail closed without persisting unsafe output
  as success.
- Gemini JSON `response_format` compatibility failures are handled through fallback paths
  or robust parsing where applicable.

## Testing Routes

Task 09 route tests verify:

- Case create/list/get/delete behavior.
- Missing case returns 404.
- Conversation turn route:
  - calls conversation and crisis logic.
  - persists user and assistant messages.
  - persists summary.
  - persists exact backend `crisis.crisis_level` into summary metadata.
  - returns `turn_number`, assistant response, crisis result, and summary.
- Summary/message retrieval routes do not expose DB-internal `round`.
- Summary retrieval routes expose top-level nullable `crisis_level` while keeping
  crisis reasons and internal fields out of summary metadata.
- Session listing routes return explicit session metadata plus legacy
  message/summary-derived sessions, return 404 for missing cases, return `[]`
  for existing cases without sessions, and return generic non-leaking 500
  responses for helper failures.
- POST session creation covers backend-generated or provided `session_id`,
  optional title, idempotent duplicate same-case/session creation, missing-case
  404 behavior, and generic non-leaking helper failures.
- Session title coverage includes omitted and whitespace-only title normalization
  to null, valid title trimming, response exposure, over-length rejection,
  duplicate/idempotent behavior that does not overwrite existing title, and
  legacy/backfilled session `title: null` behavior.
- PATCH session title coverage includes success, trim, clear via null,
  clear via whitespace, over-length 422, missing case 404, missing session 404,
  generic non-leaking 500 behavior, timestamp behavior, legacy/backfilled session
  rename, and safe response shape.
- Archive/unarchive route coverage includes schema compatibility,
  default-listing exclusion, `include_archived=true` inclusion, `archived_at`
  metadata exposure, missing case 404, missing session 404, generic non-leaking
  500 behavior, `updated_at` changes without `last_activity_at` changes,
  message/summary preservation, and safe response shape.
- Conversation route tests verify that conversation turns ensure/touch the
  durable session row without changing the conversation response shape or crisis
  logic.
- Report route converts parsed DB summaries into `TurnSummary` models before analysis.
- Report route preserves the real insufficient-data behavior without live provider calls.
- Report Schema v2 draft routes cover:
  - current draft 404 before creation.
  - create or return current draft.
  - optional manual input save.
  - idempotent second create returning the same draft ID.
  - manual input update.
  - deterministic v2 AI draft generation route success.
  - provider mode route success with a monkeypatched provider.
  - provider failure returning a generic non-leaking 500.
  - provider failure not overwriting existing `ai_generated_json`.
  - missing draft 404.
  - no persisted summaries 422 before any provider call.
  - invalid agent output.
  - DB/helper failure.
  - `ai_generated_json` persistence.
  - status transition to `ai_generated`.
  - `generated_at` and `updated_at`.
  - manual input preservation.
  - final report remaining null.
  - safe pointer-only source refs / source summary IDs.
  - missing case/session/draft 404 behavior.
  - invalid manual input 422 behavior.
  - generic non-leaking 500 behavior.
- Existing v1 `POST /api/reports/generate` behavior remains covered and unchanged.
- Existing `POST /api/report-drafts/{draft_id}/generate` default behavior remains
  deterministic/conservative and does not call a provider.

For route tests, prefer monkeypatching agent functions instead of mocking provider clients
deep inside each agent.

## Default Deterministic Commands

Run the full deterministic backend suite from the repository root with an explicit
temp directory and pytest cache disabled:

```powershell
python -m pytest backend/tests -q --basetemp=.tmp_pytest_backend -p no:cacheprovider
```

On Windows, if temp/cache folders are locked by local tools, use a unique
`--basetemp` value for the run:

```powershell
python -m pytest backend/tests -q --basetemp=.tmp_pytest_backend_local_1 -p no:cacheprovider
```

Do not run `python -m pytest backend` as the default automated suite unless you
have confirmed discovery behavior for the current tree. Do not run live provider
scripts unless explicitly requested.

Route-test database isolation has been improved to reduce Windows SQLite
temporary database and WAL sidecar lock flakiness. Continue to use temporary
SQLite paths and unique `--basetemp` values when local tools leave handles open.

CI runs only `backend/tests`:

```bash
python -m pytest backend/tests -q --basetemp=.tmp_pytest_ci -p no:cacheprovider
```

## Manual Live Provider Checks

Live provider checks are allowed only as manual validation.

Guidance:

- Require explicit user intent before running them.
- Expect provider keys and network access to be necessary.
- Do not make live provider checks part of CI or default automated verification.
- Use `docs/REPORT_V2_PROVIDER_SMOKE_TEST.md` for the local-only manual Report
  v2 provider-mode smoke-test workflow.
- Treat `backend/manual_checks/check_providers.py` as a connectivity script, not
  a unit test.
- Keep `backend/manual_checks/check_db_smoke.py` as a legacy/manual smoke script
  unless a future task explicitly migrates or removes it.

## Safety Regression Tests

Safety regression tests should use mocked outputs and deterministic inputs.
For the full safety policy, use `docs/SAFETY_REQUIREMENTS.md`.

Cover at least:

- User asks for diagnosis; assistant does not diagnose.
- User asks for medication or dosage; assistant does not provide medical advice.
- Crisis detector returns `high`; route response preserves `crisis_level == "high"`.
- Summary model output tries to change crisis flag; code preserves external crisis flag.
- Report includes fixed disclaimer exactly.
- Report does not rely on LLM for `has_crisis` or `peak_turn`.

## Local Artifacts

Do not commit local runtime artifacts:

- `cases.db`
- SQLite sidecar files such as `cases.db-wal` or `cases.db-shm`
- `.env`
- provider logs containing sensitive text
- `.tmp_pytest*` folders

Temporary test databases should live under pytest temp directories and be discarded after
the test run. On Windows, pytest temp/cache directories can occasionally be locked
by open handles or tooling; use a unique `--basetemp` value and `-p no:cacheprovider`
when that happens. `.tmp_pytest*` folders are disposable and should not be committed.
