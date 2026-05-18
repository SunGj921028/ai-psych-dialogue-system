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

Status: scaffold / placeholder.

Current facts:

- React + Vite app exists under `frontend/`.
- Routes exist for conversation, report, history, and settings.
- Page components are mostly placeholders.
- `frontend/src/api/client.js` defines a basic axios instance.
- Frontend integration remains future work and can now target the implemented
  Task 09 backend routes.

### Tests

Status: partial, with deterministic route tests added.

Current facts:

- Existing backend test files are script-style checks.
- Several scripts call live LLM providers and require provider keys/network.
- `db_smoke_test.py` uses a temporary database and is closest to a deterministic
  smoke test.
- Deterministic pytest route tests now exist under `backend/tests/`.
- Route tests use temporary SQLite databases and mocked or monkeypatched LLM/agent
  behavior where provider calls would otherwise occur.
- Report insufficient-data behavior is covered by a deterministic route test without
  live provider calls.
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
| Task 11 conversation page | placeholder | Backend API routes now exist; frontend integration remains future work. |
| Task 12 visualization components | future | Depends on summary/report data contracts. |
| Task 13 report page | placeholder | Depends on report API. |
| Task 14 history page | placeholder | Depends on case/session APIs. |
| Task 15 settings page | placeholder / P2 | Should not manage secrets in frontend. |
| Task 16 end-to-end tests | future | Needs API and deterministic test base. |
| Task 17 prompt iteration | future | Should include safety regression tests. |

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
- Route tests now exist under `backend/tests/`; legacy live-provider scripts still
  remain outside the default deterministic route test suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Add broader deterministic backend tests as route and agent behavior evolves.
3. Wire frontend pages to the implemented API.
4. Implement MCP Task 07 after HTTP behavior is stable.
5. Add broader integration and end-to-end tests.

## Confirmed Risks

- Live-provider scripts are not reliable automated tests.
- Gemini JSON `response_format` may not be supported consistently.
- Safety-sensitive behavior depends on prompts and fallback code; regression tests are needed.
- Database cascade deletion exists through case deletion and must be handled carefully in APIs.

## Suspected Risks

- Existing docs and README may lag behind source behavior.
- Frontend state shape may drift unless it follows the API contract.
- Manual tests may give false confidence because they depend on provider availability and model behavior.

## Current Reality Versus Future Intent

Current reality:

- DB and agents are the usable backend foundation.
- Active API includes `/health` and the Task 09 `/api` routes.
- Backend routers are implemented.
- MCP and frontend integration are not implemented.

Future intent:

- Frontend should consume those routes and render conversation, summaries, crisis warnings,
  history, and reports.
- MCP should provide case-query tools after the core HTTP API is clarified.

## Related Context Documents

- `backend/API_CONTRACT.md` defines implemented Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
