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
| `backend/tests/test_db.py` | automated DB tests | Covers schema initialization, WAL mode, CRUD helpers, public field mapping, summary parsing, crisis/session helpers, sessions table creation, idempotent backfill, create/get/ensure/touch helpers, explicit empty sessions, session title normalization/exposure, legacy derived compatibility with null titles, sorting, no-leak metadata, limits, and cascade behavior. |
| `backend/tests/test_crisis_agent.py` | automated agent tests | Monkeypatches the crisis LLM client and covers valid JSON, fallback, normalization, contradiction repair, and heuristic crisis levels. |
| `backend/tests/test_summary_agent.py` | automated agent tests | Monkeypatches the summary LLM client and covers valid JSON, score clamping, theme/key-statement normalization, external crisis flag ownership, and fallback. |
| `backend/tests/test_conversation_agent.py` | automated agent tests | Monkeypatches the conversation LLM client and covers safe output, unsafe diagnostic replacement, provider fallback, boundary warnings, and history windowing. |
| `backend/tests/test_analysis_agent.py` | automated agent tests | Monkeypatches the analysis LLM client and covers insufficient data, fixed disclaimer, code-owned `has_crisis` and `peak_turn`, and fallback. |
| `backend/tests/test_routes_cases.py` | automated route tests | Covers case create/list/get/delete and missing-case 404 behavior. |
| `backend/tests/test_routes_conversation.py` | automated route tests | Monkeypatches agent calls, verifies persistence, public response shape, conversation ensure/touch behavior, POST session creation/idempotency, title normalization/exposure and duplicate no-overwrite behavior, missing-case behavior, legacy null titles, and session-listing metadata behavior. |
| `backend/tests/test_routes_errors.py` | automated route error tests | Covers non-leaking route failure behavior, including session creation/listing helper failures. |
| `backend/tests/test_routes_reports.py` | automated route tests | Covers report route summary conversion and insufficient-data behavior. |

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
- Preserve WAL behavior unless a task explicitly asks for a journal-mode migration.
- Cover durable session metadata helpers, including sessions table creation,
  idempotent backfill from legacy messages/summaries, create/get/ensure/touch
  behavior, explicit empty sessions, legacy derived compatibility, sorting,
  no-leak metadata, and cascade behavior.

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
  - returns `turn_number`, assistant response, crisis result, and summary.
- Summary/message retrieval routes do not expose DB-internal `round`.
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
- Conversation route tests verify that conversation turns ensure/touch the
  durable session row without changing the conversation response shape or crisis
  logic.
- Report route converts parsed DB summaries into `TurnSummary` models before analysis.
- Report route preserves the real insufficient-data behavior without live provider calls.

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
