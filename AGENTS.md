# AGENTS.md — Codex Repository Entry Point

This file is the first document future Codex sessions should read before making
changes in this repository. It captures the stable project intent, current
implementation reality, and the rules that should guide implementation work.

## Project Purpose

This project is an AI-assisted counseling documentation system.

It helps a counselor prepare before a formal session by entering client-provided
content, receiving structured micro-summaries, detecting crisis language, and
generating a draft case conceptualization report.

Core boundary: AI assists documentation and conceptualization only. The counselor
remains the professional decision-maker. The system must not diagnose, prescribe,
replace therapy, or present deterministic conclusions about a client.

## Human / AI Role Boundary

| Role | Definition |
|---|---|
| Counselor | The only direct user of the system. Operates all features and reviews all outputs. |
| Client | Not a direct system user. Client content is entered by the counselor. |
| AI / LLM | Tooling role only. Produces draft support material for counselor review. |

The project follows an asynchronous preparation model: the counselor operates
the system before or around formal counseling work; the client does not interact
with the application directly.

## Required Read Order For Future Codex Tasks

Before implementation work, read documents in this order:

1. `AGENTS.md` for top-level rules and current priorities.
2. `docs/IMPLEMENTATION_STATUS.md` to confirm what exists now versus what is intended.
3. For backend API work, read `backend/API_CONTRACT.md`.
4. For backend tests, read `backend/TESTING.md`.
5. For safety-sensitive changes, read `docs/SAFETY_REQUIREMENTS.md` and inspect
   the relevant agent prompt/code.
6. For frontend integration work, read `frontend/UI_CONTRACT.md`.

Do not assume older planning notes are implementation reality. The current codebase
is the source of implementation truth, and the status/contract docs explain known
mismatches.

## Current Architecture Overview

### Backend

- FastAPI application in `backend/main.py`.
- SQLite data layer in `backend/database/db.py` using `aiosqlite`.
- Four implemented async agent modules in `backend/agents/`:
  - `crisis_agent.py`: crisis detection, Groq provider, fail-safe fallback.
  - `summary_agent.py`: per-turn JSON micro-summary, Groq provider.
  - `conversation_agent.py`: empathic response generation, Gemini provider.
  - `analysis_agent.py`: report generation from summaries, Gemini provider.
- HTTP router files in `backend/routers/` implement Task 09 routes and are mounted
  under `/api`.
- MCP server skeleton exists in `backend/mcp_servers/case_query_server.py`, but it is not implemented.

### Frontend

- React + Vite app in `frontend/`.
- React Router pages exist for conversation, report, history, and settings.
- ConversationPage is integrated with the backend conversation API.
- ReportPage is integrated with backend report generation.
- HistoryPage lists cases from the backend.
- Header navigation and light/dark theme toggle are implemented.
- Frontend deterministic tests use Vitest, React Testing Library, and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.
- Browser storage safety tests confirm clinical message content, summaries,
  report text, crisis reasons, and case notes are not persisted.
- Frontend deletion, PDF export, session browser, charts, Settings backend
  integration, and MCP integration remain future work.

### Active API Reality

The current active HTTP API includes:

- `GET /health`
- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/{case_id}`
- `DELETE /api/cases/{case_id}`
- `POST /api/conversation/turn`
- `GET /api/cases/{case_id}/sessions/{session_id}/messages`
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries`
- `POST /api/reports/generate`

Remaining frontend workflow completion and focused frontend test gaps are now the
next major product integration blockers.

## Current Development Priority

Integrate frontend pages with the implemented HTTP API before MCP work.

Recommended order:

1. Keep repository context docs aligned with current code.
2. Add deterministic pytest-style backend tests with mocked LLM clients as behavior expands.
3. Complete remaining frontend workflows and focused frontend test gaps.
4. Implement MCP Task 07 after API contracts, data access behavior, and frontend
   workflows are clear.

MCP Task 07 remains future work until frontend/API behavior is stable enough to
guide case-query tooling.

## Non-Negotiable Safety Rules

All agent, API, report, and UI work must preserve these boundaries:

- Do not provide psychological or psychiatric diagnosis.
- Do not provide medication, dosage, stopping-medication, or medical advice.
- Do not replace professional counseling, therapy, or medical care.
- Do not present deterministic conclusions about the client.
- Do not give concrete treatment instructions.
- Use cautious language such as "possible", "initial observation", and
  "requires counselor confirmation" where interpretation is needed.
- The fixed report disclaimer must be supplied by code, not generated by an LLM:

```text
本報告為 AI 草稿，僅供諮商師參考，非診斷文件。
所有判斷與決策須由專業諮商師負責審核。
```

### Crisis Handling

- Crisis detection must be conservative.
- `crisis_level` values are only `none`, `low`, and `high`.
- Frontend red crisis banners should be shown only when `crisis_level == "high"`.
- `crisis_flag` is controlled by the crisis detection result and must not be
  independently reinterpreted by the summary agent.
- On crisis detector failure, preserve fail-safe behavior.

## Key Implementation Realities

These are current code facts and should not be contradicted in new work:

- SQLite currently uses WAL mode in `backend/database/db.py`. Preserve this unless
  a future task explicitly asks for a database journal-mode migration.
- The database schema internally uses a `round` column for turn ordering.
- Public-facing API/data models should use `turn_number`, not `round`.
- `get_summaries_by_session()` and `get_latest_summaries()` return parsed summary
  data in a `summary` field, not raw `summary_json`.
- Existing Pydantic models inside agent files should be reused instead of duplicated:
  - `ConversationMessage`, `ConversationResponse`
  - `CrisisDetectionResult`
  - `TurnSummary`, `EmotionDetail`, `EmotionDimensions`
  - `ConceptualizationReport`, `EmotionPattern`
- `analysis_agent.py` computes `has_crisis`, `peak_turn`, and the fixed disclaimer
  in code.
- Gemini `response_format={"type": "json_object"}` compatibility is a known risk.
  If provider calls fail around JSON mode, prefer prompt-enforced JSON and robust
  parsing rather than changing the architecture.
- Deterministic route, agent, and DB tests exist under `backend/tests/`; older
  script-style tests may still call live providers and should remain manual checks
  unless migrated.
- Frontend deterministic tests exist and use Vitest, React Testing Library, and
  jsdom with mocked API helpers.
- Future automated tests should remain deterministic pytest-style tests with mocked
  LLM clients or monkeypatched agent/provider boundaries.
- Live provider tests are manual checks only.

## Key Engineering Rules

### General

- Keep changes scoped to the requested task.
- Do not refactor unrelated code while implementing features.
- Do not modify application source while performing documentation-only tasks.
- Do not commit local database artifacts such as `cases.db`.
- The repository may contain user or generated changes. Do not revert unrelated
  changes unless explicitly asked.

### File Deletion Rule

Bulk deletion is prohibited. Do not use:

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

If a file must be deleted, delete only one explicit file path at a time. If bulk
deletion seems necessary, stop and ask the user to handle it manually.

### Backend

- Preserve async style with `async/await`.
- Database access should use `async with get_db() as db:`.
- Agent functions should not write to the database; router/service orchestration
  owns persistence.
- Use `datetime.now(timezone.utc).isoformat()` for timestamps.
- Use `str(uuid.uuid4())` for UUIDs.
- For future backend API changes, keep routes aligned with `backend/API_CONTRACT.md`.

### Frontend

- Use function components and hooks.
- Page components live in `frontend/src/pages/`.
- Shared components live in `frontend/src/components/`.
- API calls should go through `frontend/src/api/client.js`.
- Preserve the existing API integration patterns in the implemented frontend pages.
- Do not store clinical message content, summaries, report text, crisis reasons,
  or case notes in browser storage.
- `localStorage` is used only for the existing `ai-psych-theme` key.
- `sessionStorage` may store only active case/session identifiers.

### Testing

- Prefer pytest-style deterministic tests.
- Mock LLM clients by default.
- Do not run live LLM/provider tests unless the user explicitly asks.
- For DB tests, use temporary SQLite paths and avoid touching real local data.

## Documentation Map

| File | Purpose |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Current implementation reality, intended future work, known mismatches, and recommended order. |
| `backend/API_CONTRACT.md` | Implemented HTTP API contract for Task 09 and route-level data flow. |
| `backend/TESTING.md` | Backend testing direction, current script inventory, and pytest migration guidance. |
| `docs/SAFETY_REQUIREMENTS.md` | Detailed safety behavior for agents, routes, reports, frontend warnings, and tests. |
| `frontend/UI_CONTRACT.md` | Intended frontend behavior, state shapes, and integration expectations. |
| `README.md` | Basic setup and local run commands; may lag behind implementation details. |

If documents conflict:

- Source code is the source of truth for current implementation reality.
- `docs/IMPLEMENTATION_STATUS.md` tracks current versus intended status.
- `backend/API_CONTRACT.md` guides future backend API changes.
- `docs/SAFETY_REQUIREMENTS.md` is the deeper authority for safety behavior.
- `backend/TESTING.md` guides backend testing strategy.
- `frontend/UI_CONTRACT.md` guides frontend integration behavior.
- `AGENTS.md` remains the top-level entrypoint and high-level rule file.
