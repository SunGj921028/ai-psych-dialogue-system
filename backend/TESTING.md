# Backend Testing Guide

This document describes the desired backend testing direction. It is a guide for
future work; the current repository has not yet fully migrated to pytest-style tests.

## Testing Direction

Automated backend tests should be:

- pytest-style.
- deterministic.
- network-free by default.
- based on mocked LLM clients or mocked agent functions.
- safe to run without provider API keys.

Live provider scripts may remain for manual checks, but they should not be required
for automated verification.

## Existing Test / Script Inventory

Current backend scripts:

| File | Current role | Notes |
|---|---|---|
| `backend/db_smoke_test.py` | manual smoke test | Uses a temporary DB and is closest to deterministic. |
| `backend/test_crisis_agent.py` | live/manual script | Calls the crisis agent and may call Groq. |
| `backend/test_summary_agent.py` | live/manual script | Calls the summary agent and may call Groq. |
| `backend/test_conversation_agent.py` | live/manual script | Calls the conversation agent and may call Gemini. |
| `backend/test_analysis_agent.py` | live/manual script | Calls the analysis agent and may call Gemini depending on summary count. |
| `backend/test_providers.py` | live/manual script | Explicit provider connectivity check. |

These files should not be treated as the final automated test suite.

## Recommended Future Test Layout

Proposed layout:

```text
backend/
  tests/
    conftest.py
    test_db.py
    test_crisis_agent.py
    test_summary_agent.py
    test_conversation_agent.py
    test_analysis_agent.py
    test_routes_cases.py
    test_routes_conversation.py
    test_routes_reports.py
```

This layout is proposed, not yet configured.

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

Important behaviors to cover:

- Crisis fallback heuristic returns conservative results.
- Summary values are clamped to `0..10`.
- Summary `crisis_flag` is forced from the external input.
- Conversation fallback avoids diagnosis and medication advice.
- Analysis report computes `has_crisis`, `peak_turn`, and fixed disclaimer in code.
- Gemini JSON `response_format` compatibility failures are handled through fallback paths
  or robust parsing where applicable.

## Testing Routes After Task 09

After HTTP routers are implemented, route tests should verify:

- Case create/list/get/delete behavior.
- Missing case returns 404.
- Conversation turn route:
  - validates request shape.
  - calls conversation and crisis logic.
  - persists user and assistant messages.
  - persists summary.
  - returns `turn_number`, assistant response, crisis result, and summary.
- Summary/message retrieval routes do not expose DB-internal `round`.
- Report route converts parsed DB summaries into `TurnSummary` models before analysis.
- Agent failures use existing fallback behavior when possible.
- Database write failures return generic server errors without leaking sensitive text.

For route tests, prefer monkeypatching agent functions instead of mocking provider clients
deep inside each agent.

## Proposed Deterministic Commands

These commands are proposed for after pytest is configured:

```bash
cd backend
pytest -q
```

Focused examples after tests exist:

```bash
cd backend
pytest tests/test_db.py -q
pytest tests/test_routes_conversation.py -q
```

Until pytest migration is complete, use syntax/import checks and targeted manual scripts
with care. Do not run live provider scripts unless explicitly requested.

## Manual Live Provider Checks

Live provider checks are allowed only as manual validation.

Guidance:

- Require explicit user intent before running them.
- Expect provider keys and network access to be necessary.
- Do not make live provider checks part of CI or default automated verification.
- Treat `backend/test_providers.py` as a connectivity script, not a unit test.

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

Temporary test databases should live under pytest temp directories and be discarded after
the test run.
