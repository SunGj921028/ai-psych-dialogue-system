# Backend Testing Guide

This document describes backend testing direction and current test status. The
repository now includes deterministic pytest tests for routes, agents, and the
SQLite data layer, while older live-provider scripts remain manual checks.

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
| `backend/tests/test_db.py` | automated DB tests | Covers schema initialization, WAL mode, CRUD helpers, public field mapping, summary parsing, crisis/session helpers, derived session metadata, limits, and cascade behavior. |
| `backend/tests/test_crisis_agent.py` | automated agent tests | Monkeypatches the crisis LLM client and covers valid JSON, fallback, normalization, contradiction repair, and heuristic crisis levels. |
| `backend/tests/test_summary_agent.py` | automated agent tests | Monkeypatches the summary LLM client and covers valid JSON, score clamping, theme/key-statement normalization, external crisis flag ownership, and fallback. |
| `backend/tests/test_conversation_agent.py` | automated agent tests | Monkeypatches the conversation LLM client and covers safe output, unsafe diagnostic replacement, provider fallback, boundary warnings, and history windowing. |
| `backend/tests/test_analysis_agent.py` | automated agent tests | Monkeypatches the analysis LLM client and covers insufficient data, fixed disclaimer, code-owned `has_crisis` and `peak_turn`, and fallback. |
| `backend/tests/test_routes_cases.py` | automated route tests | Covers case create/list/get/delete and missing-case 404 behavior. |
| `backend/tests/test_routes_conversation.py` | automated route tests | Monkeypatches agent calls, verifies persistence, public response shape, and session-listing metadata behavior. |
| `backend/tests/test_routes_errors.py` | automated route error tests | Covers non-leaking route failure behavior, including session helper failures. |
| `backend/tests/test_routes_reports.py` | automated route tests | Covers report route summary conversion and insufficient-data behavior. |

These tests are network-free, do not require API keys, and should be treated as the
current deterministic backend test suite. They use temporary SQLite databases and
mocked or monkeypatched LLM clients/functions where provider calls would otherwise
occur.

## Existing Test / Script Inventory

Current backend scripts:

| File | Current role | Notes |
|---|---|---|
| `backend/db_smoke_test.py` | legacy/manual smoke test | Uses a temporary DB but remains outside the default deterministic pytest commands. |
| `backend/test_crisis_agent.py` | live/manual script | Calls the crisis agent and may call Groq. |
| `backend/test_summary_agent.py` | live/manual script | Calls the summary agent and may call Groq. |
| `backend/test_conversation_agent.py` | live/manual script | Calls the conversation agent and may call Gemini. |
| `backend/test_analysis_agent.py` | live/manual script | Calls the analysis agent and may call Gemini depending on summary count. |
| `backend/test_providers.py` | live/manual script | Explicit provider connectivity check. |

These files should not be included in the default deterministic test command yet.
They are manual/live or legacy smoke scripts and may require provider keys, network
access, or model behavior.

## Recommended Test Layout

Current and recommended layout:

```text
backend/
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
under `backend/tests/` rather than expanding the top-level manual scripts.

## Testing The Database

Use a temporary SQLite file for each test or test module.

Guidance:

- Set `DATABASE_PATH` to a temporary file before calling `init_db()`.
- Do not use or mutate a developer's real `cases.db`.
- Assert public return dictionaries expose `turn_number`, not `round`.
- Assert summary helpers return parsed `summary` dictionaries, not raw `summary_json`.
- Preserve WAL behavior unless a task explicitly asks for a journal-mode migration.

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
- Session listing routes derive metadata from existing messages/summaries, return
  404 for missing cases, return `[]` for existing cases without sessions, and
  return generic non-leaking 500 responses for helper failures.
- Report route converts parsed DB summaries into `TurnSummary` models before analysis.
- Report route preserves the real insufficient-data behavior without live provider calls.

For route tests, prefer monkeypatching agent functions instead of mocking provider clients
deep inside each agent.

## Proposed Deterministic Commands

Run deterministic tests from the repository root with explicit Windows-safe temp
directories and pytest cache disabled:

```powershell
python -m pytest backend\tests\test_db.py -q --basetemp=.tmp_pytest_db -p no:cacheprovider
```

```powershell
python -m pytest backend\tests\test_crisis_agent.py backend\tests\test_summary_agent.py backend\tests\test_conversation_agent.py backend\tests\test_analysis_agent.py -q --basetemp=.tmp_pytest_agents -p no:cacheprovider
```

```powershell
python -m pytest backend\tests\test_routes_cases.py backend\tests\test_routes_conversation.py backend\tests\test_routes_errors.py backend\tests\test_routes_reports.py -q --basetemp=.tmp_pytest_routes -p no:cacheprovider
```

Do not run broad discovery such as `python -m pytest backend` as the default
automated suite while top-level `backend/test_*.py` live/manual scripts remain.
Do not run live provider scripts unless explicitly requested.

## Manual Live Provider Checks

Live provider checks are allowed only as manual validation.

Guidance:

- Require explicit user intent before running them.
- Expect provider keys and network access to be necessary.
- Do not make live provider checks part of CI or default automated verification.
- Treat `backend/test_providers.py` as a connectivity script, not a unit test.
- Keep `backend/db_smoke_test.py` as a legacy/manual smoke script unless a future
  task explicitly migrates or removes it.

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
