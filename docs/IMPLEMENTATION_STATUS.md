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

Status: placeholder.

Current facts:

- `backend/routers/cases.py`, `backend/routers/conversation.py`, and
  `backend/routers/reports.py` contain placeholder endpoints that raise
  `NotImplementedError`.
- Router includes in `backend/main.py` are currently commented out.
- The only active HTTP endpoint is `GET /health`.
- Task 09 API routes are the next backend blocker.

### MCP Server

Status: placeholder / future work.

Current facts:

- `backend/mcp_servers/case_query_server.py` is a skeleton and raises
  `NotImplementedError`.
- MCP Task 07 should come after HTTP API route clarification and Task 09.

### Frontend

Status: scaffold / placeholder.

Current facts:

- React + Vite app exists under `frontend/`.
- Routes exist for conversation, report, history, and settings.
- Page components are mostly placeholders.
- `frontend/src/api/client.js` defines a basic axios instance.
- Frontend integration should wait for implemented or clearly mocked API routes.

### Tests

Status: partial and mostly manual.

Current facts:

- Existing backend test files are script-style checks.
- Several scripts call live LLM providers and require provider keys/network.
- `db_smoke_test.py` uses a temporary database and is closest to a deterministic
  smoke test.
- Future automated tests should be pytest-style and should mock LLM clients by default.
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
| Task 07 MCP case query server | placeholder | Defer until after Task 09. |
| Task 09 FastAPI routes | placeholder | Next backend blocker. |
| Task 11 conversation page | placeholder | Depends on API routes. |
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
- Current tests are not yet the desired mocked pytest-style automated suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Implement Task 09 HTTP API routes according to `backend/API_CONTRACT.md`.
3. Add deterministic pytest-style backend tests with mocked LLM clients.
4. Wire frontend pages to the implemented API.
5. Implement MCP Task 07 after HTTP behavior is stable.
6. Add broader integration and end-to-end tests.

## Confirmed Risks

- HTTP routes are placeholders, so frontend and report workflows cannot work end to end.
- Live-provider scripts are not reliable automated tests.
- Gemini JSON `response_format` may not be supported consistently.
- Safety-sensitive behavior depends on prompts and fallback code; regression tests are needed.
- Database cascade deletion exists through case deletion and must be handled carefully in APIs.

## Suspected Risks

- Existing docs and README may lag behind source behavior.
- Router implementation may need clear request/response models to avoid duplicating agent models.
- Frontend state shape may drift unless it follows the API contract.
- Manual tests may give false confidence because they depend on provider availability and model behavior.

## Current Reality Versus Future Intent

Current reality:

- DB and agents are the usable backend foundation.
- Active API is only `/health`.
- Routers, MCP, and frontend integration are not implemented.

Future intent:

- Task 09 should expose HTTP routes for cases, conversation turns, summaries, and reports.
- Frontend should consume those routes and render conversation, summaries, crisis warnings,
  history, and reports.
- MCP should provide case-query tools after the core HTTP API is clarified.

## Related Context Documents

- `backend/API_CONTRACT.md` defines planned Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
