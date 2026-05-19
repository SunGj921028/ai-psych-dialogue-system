# Implementation Status

This document separates current implementation reality from intended future work.
Use it before planning or implementing repository tasks.

## Current Reality By Subsystem

### Backend Database

Status: implemented, with known documentation mismatches.

Current facts:

- `backend/database/db.py` defines SQLite schema and async CRUD helpers.
- The app initializes the database through `init_db()` during FastAPI lifespan.
- SQLite currently uses WAL mode. Preserve this unless a future task explicitly
  asks for a journal-mode migration.
- The database internally stores turn order in a column named `round`.
- Public-facing code should expose `turn_number`.
- Summary query helpers return parsed summary dictionaries in `summary`, not raw
  `summary_json`.

### Backend Agents

Status: mostly implemented.

Current facts:

- `crisis_agent.py` detects crisis language through Groq and falls back to heuristic
  detection on failure.
- `summary_agent.py` generates one-turn `TurnSummary` objects and forces
  `crisis_flag` to match the external crisis detector result.
- `conversation_agent.py` generates empathic non-streaming responses through Gemini
  and contains safety fallback behavior.
- `analysis_agent.py` generates `ConceptualizationReport` objects from summaries.
  It computes `has_crisis`, `peak_turn`, and the fixed disclaimer in code.
- Gemini JSON mode via `response_format={"type": "json_object"}` is a known
  compatibility risk.

### Backend Routers

Status: implemented.

Current facts:

- `backend/routers/cases.py`, `backend/routers/conversation.py`, and
  `backend/routers/reports.py` implement Task 09 HTTP routes.
- Routers are mounted in `backend/main.py` under `/api`.
- `GET /health` remains active.
- Implemented API endpoints are:
  - `POST /api/cases`
  - `GET /api/cases`
  - `GET /api/cases/{case_id}`
  - `DELETE /api/cases/{case_id}`
  - `POST /api/conversation/turn`
  - `GET /api/cases/{case_id}/sessions/{session_id}/messages`
  - `GET /api/cases/{case_id}/sessions/{session_id}/summaries`
  - `POST /api/reports/generate`
- Public route responses expose `turn_number`, not DB-internal `round`.
- Summary responses expose parsed summary data, not raw `summary_json`.

### MCP Server

Status: placeholder / future work.

Current facts:

- `backend/mcp_servers/case_query_server.py` is a skeleton and raises
  `NotImplementedError`.
- MCP Task 07 should come after HTTP API behavior and data access expectations are stable.

### Frontend

Status: partially implemented and integrated with the HTTP API.

Current facts:

- React + Vite app exists under `frontend/`.
- Routes exist for conversation, report, history, and settings.
- ConversationPage is integrated with the backend conversation API.
- ReportPage is integrated with the backend report API and supports manual report
  generation.
- HistoryPage lists cases from the backend.
- The app header includes navigation and a theme toggle.
- Light/dark theme support exists and uses the `ai-psych-theme` localStorage key.
- The frontend does not store clinical message content or summaries in browser
  storage.
- Crisis UI uses backend `crisis_level` only; the red banner is shown only for
  `crisis_level == "high"`.
- Frontend deletion, PDF export, session browser, charts, Settings backend
  integration, and MCP integration remain future work.

### Tests

Status: implemented backend deterministic testing foundation, with future broader
integration and end-to-end testing still pending.

Current facts:

- Deterministic pytest tests now exist under `backend/tests/` for routes, agents,
  and the SQLite data layer.
- `backend/tests/helpers.py` provides fake OpenAI-compatible LLM responses for
  deterministic agent tests.
- DB tests use temporary SQLite databases and preserve current WAL expectations.
- Route tests use temporary SQLite databases and mocked or monkeypatched LLM/agent
  behavior where provider calls would otherwise occur.
- Agent tests monkeypatch LLM clients and do not require API keys, network access,
  or live providers.
- Top-level `backend/test_*.py` files remain script-style live/manual checks.
- `backend/db_smoke_test.py` remains a legacy/manual smoke script outside the
  default deterministic pytest commands.
- Future automated tests should continue to be pytest-style and should mock LLM
  clients by default.
- Live provider scripts should remain manual checks, not required automated tests.

## Task / Status Table

| Area / Task | Status | Notes |
|---|---|---|
| Task 01 project scaffold | implemented | Repo structure exists. |
| Task 02 SQLite data layer | implemented | Uses WAL and internal `round` columns. |
| Task 03 crisis agent | implemented | Includes fallback heuristic detection. |
| Task 04 summary agent | implemented | Reuses external crisis flag. |
| Task 05 conversation agent | implemented | Non-streaming, Gemini-based, safety fallback. |
| Task 06 analysis agent | implemented | Computes report metadata in code. |
| Task 07 MCP case query server | future | Still out of scope after Task 09; defer until API/data access behavior is stable. |
| Task 09 FastAPI routes | implemented | Routes mounted under `/api` with deterministic route tests. |
| Task 11 conversation page | implemented | Integrated with backend conversation API; uses backend crisis level for high-risk banner behavior. |
| Task 12 visualization components | future | Depends on summary/report data contracts. |
| Task 13 report page | partial | Integrated with report API and manual generation; PDF export and charts remain future work. |
| Task 14 history page | partial | Lists backend cases; deletion and session browser remain future work. |
| Task 15 settings page | placeholder / P2 | Should not manage secrets in frontend. |
| Backend deterministic testing foundation | implemented | Route, DB, and agent tests exist under `backend/tests/` without live provider calls. |
| Task 16 end-to-end tests | future | Needs deterministic browser/API flow coverage for integrated frontend workflows. |
| Task 17 prompt iteration | future | Should continue to include safety regression tests. |

Status categories:

- implemented: meaningful code exists and can be reused.
- partial: some usable code exists, but the feature is not complete.
- placeholder: file or route exists but does not implement intended behavior.
- future: intended, but not yet a current implementation target.

## Known Documentation / Code Mismatches

- Older design notes said to use SQLite DELETE journal mode. Current code uses WAL.
  Preserve WAL for now.
- Older schema descriptions use `turn_number` as a database column. Current DB schema
  uses `round` internally and maps it to `turn_number` in returned dictionaries.
- Older notes said `get_latest_summaries()` clamps with `max(1, min(limit, 100))`.
  Current code raises `ValueError` for non-positive limits and clamps only the upper bound.
- Older model defaults mention `gemini-2.0-flash` and `gemini-1.5-pro`.
  Current `.env.example` uses `gemini-2.5-flash-lite` and `gemini-2.5-flash`.
- README still references the generic default provider path more than the current
  Groq/Gemini split.
- Deterministic backend tests now exist under `backend/tests/`; legacy live-provider
  scripts still remain outside the default deterministic test suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Keep deterministic backend tests current as route and agent behavior evolves.
3. Complete remaining frontend workflows: deletion, PDF export, session browser,
   charts, and Settings backend integration.
4. Add broader frontend integration and end-to-end tests.
5. Implement MCP Task 07 after HTTP and frontend behavior are stable.

## Confirmed Risks

- Live-provider scripts are not reliable automated tests.
- Gemini JSON `response_format` may not be supported consistently.
- Safety-sensitive behavior depends on prompts and fallback code; deterministic
  regression tests now cover core backend agents, but future prompt changes still
  need focused test updates.
- Database cascade deletion exists through case deletion and must be handled carefully in APIs.

## Suspected Risks

- Existing docs and README may lag behind source behavior.
- Frontend state shape may drift unless remaining workflows continue to follow
  the API contract.
- Manual tests may give false confidence because they depend on provider availability and model behavior.

## Current Reality Versus Future Intent

Current reality:

- DB and agents are the usable backend foundation.
- Active API includes `/health` and the Task 09 `/api` routes.
- Backend routers are implemented.
- Backend deterministic route, agent, and DB tests exist under `backend/tests/`.
- Frontend conversation, report generation, history case listing, app navigation,
  and light/dark theme support are implemented.
- Frontend does not persist clinical message content or summaries in browser storage.
- MCP is not implemented.

Future intent:

- Frontend should add deletion, PDF export, session browsing, charts, and Settings
  backend integration.
- MCP should provide case-query tools after the core HTTP and frontend workflows
  are clarified.

## Related Context Documents

- `backend/API_CONTRACT.md` defines implemented Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
