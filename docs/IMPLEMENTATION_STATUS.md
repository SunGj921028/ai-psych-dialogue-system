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
  - `GET /api/cases/{case_id}/sessions`
  - `GET /api/cases/{case_id}/sessions/{session_id}/messages`
  - `GET /api/cases/{case_id}/sessions/{session_id}/summaries`
  - `POST /api/reports/generate`
- Public route responses expose `turn_number`, not DB-internal `round`.
- Summary responses expose parsed summary data, not raw `summary_json`.
- Session listing is derived from existing messages and summaries. There is no
  dedicated sessions table yet, so empty sessions without persisted messages or
  summaries cannot be listed.
- Session metadata responses expose only metadata fields and do not expose raw
  messages, raw `summary_json`, summary `key_statement`, crisis reasons, or
  DB-internal `round`.

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
- ConversationPage is integrated with the backend conversation API and supports
  query-param resume with `caseId` and `sessionId`; query params take precedence
  over stale `sessionStorage` identifiers.
- ReportPage acts as a counselor review workspace integrated with the backend
  report API. Report generation remains manual-only.
- ReportPage displays the backend-supplied fixed disclaimer prominently.
- ReportPage includes summary review aids derived from loaded summaries: emotion
  intensity trend, emotion dimension average/latest snapshot, theme frequency
  chips, micro-summary timeline, and crisis occurrence indicator from existing
  backend data.
- ReportPage review aids are counselor-facing context only and are not objective
  clinical measurements.
- HistoryPage lists cases from the backend and can lazily expand multiple cases
  to show derived session metadata, resume links, and report links.
- HistoryPage resume links use `/?caseId={caseId}&sessionId={sessionId}`.
- HistoryPage report links use `/report/{caseId}?sessionId={sessionId}`.
- ReportPage back-to-conversation links preserve the active case and session IDs.
- The app header includes navigation and a theme toggle.
- Light/dark theme support exists and uses only the `ai-psych-theme`
  localStorage key.
- Browser storage safety behavior is implemented: clinical message content,
  summaries, report text, crisis reasons, and case notes are not persisted to
  browser storage.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata and preview text are not persisted to browser storage.
- Crisis UI uses backend `crisis_level` only; the red banner is shown only for
  `crisis_level == "high"`.
- Frontend deletion, PDF export, session deletion/archive, session titles, richer
  session metadata, optional charting library integration, Settings backend
  integration, and MCP integration remain future work.
- No editable report fields, backend schema changes, LLM prompt changes, Recharts
  integration, or final report template mirroring has been implemented for the
  report workspace.

### Tests

Status: implemented backend and frontend deterministic testing foundations, with
optional broader end-to-end testing still pending.

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
- Frontend testing foundation is implemented with Vitest, React Testing Library,
  and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.
- Backend DB and route tests cover derived session metadata, missing-case 404,
  existing-case empty-list behavior, and generic non-leaking session-listing
  failure handling.
- Current frontend coverage includes header/theme toggle behavior, safe theme
  localStorage usage, ConversationPage crisis UI behavior and query-param resume,
  ReportPage missing `sessionId` handling, manual report generation, disclaimer
  display, back-to-conversation link preservation, API helper path/payload
  contracts, HistoryPage list/empty/error/session-expansion behavior, and browser
  storage safety regressions.
- Browser storage safety tests confirm clinical message content, summaries,
  report text, crisis reasons, and case notes are not persisted to browser
  storage.
- Frontend storage expectations are explicit: `localStorage` is used only for
  `ai-psych-theme`, and `sessionStorage` may store only active case/session
  identifiers.
- Remaining future frontend testing work includes ReportPage error handling
  tests, ConversationPage submit edge cases, optional Playwright/E2E later, and
  visual regression later if needed.

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
| Task 12 visualization components | partial | ReportPage has summary-derived review aids; optional Recharts/charts remain future work. |
| Task 13 report page | partial | Counselor review workspace exists with manual generation and prominent backend disclaimer; PDF export, editable fields, final template mirroring, and formal schema expansion remain future work. |
| Task 14 history page | partial | Lists backend cases and derived sessions; deletion, archive, titles, labels, and richer session metadata remain future work. |
| Task 15 settings page | placeholder / P2 | Should not manage secrets in frontend. |
| Backend deterministic testing foundation | implemented | Route, DB, and agent tests exist under `backend/tests/` without live provider calls. |
| Frontend deterministic testing foundation | implemented | Vitest, React Testing Library, and jsdom tests cover core UI/API/storage contracts without live backend/provider/network calls. |
| Task 16 end-to-end tests | future | Optional Playwright/E2E coverage can be added later after remaining workflows stabilize. |
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
- Deterministic backend tests now exist under `backend/tests/`, and deterministic
  frontend tests now cover core UI/API/storage behavior; legacy live-provider
  scripts still remain outside the default deterministic test suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Keep deterministic backend tests current as route and agent behavior evolves.
3. Complete remaining frontend workflows: deletion, session deletion/archive,
   session titles, PDF export, optional charts/Recharts, editable report review
   workflow, and Settings backend integration.
4. Fill remaining frontend test gaps: ReportPage error handling and
   ConversationPage submit edge cases.
5. Add optional Playwright/E2E coverage later, and visual regression later if
   needed.
6. Implement MCP Task 07 after HTTP and frontend behavior are stable.

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
- Frontend conversation, manual report generation, ReportPage counselor review
  workspace, history case/session listing, query-param resume, app navigation,
  and light/dark theme support are implemented.
- ReportPage displays the backend disclaimer prominently and includes
  summary-derived review aids for intensity trend, emotion dimensions, theme
  frequency, micro-summary timeline, and crisis occurrence. These aids are not
  objective clinical measurements.
- Frontend deterministic tests are implemented with Vitest, React Testing
  Library, and jsdom, using mocked API helpers and no live backend/provider/network
  calls.
- Frontend does not persist clinical message content, summaries, report text,
  crisis reasons, or case notes in browser storage.
- `localStorage` is used only for `ai-psych-theme`; `sessionStorage` may store
  only active case/session identifiers.
- Session metadata and preview text are not stored in browser storage.
- MCP is not implemented.

Future intent:

- Add a dedicated sessions table later for empty sessions, titles,
  archive/delete, labels, report status, and other richer session metadata.
- Add session deletion/archive and session titles.
- Report workflow future work remains: formal report schema expansion,
  source/evidence traceability, final PDF export, optional Recharts/charts, and
  editable counselor review workflow.
- Frontend should add deletion and Settings backend integration.
- Frontend testing should add ReportPage error handling tests, ConversationPage
  submit edge cases, optional Playwright/E2E later, and visual regression later
  if needed.
- MCP should provide case-query tools after the core HTTP and frontend workflows
  are clarified.

## Related Context Documents

- `backend/API_CONTRACT.md` defines implemented Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
